/** Explicit private byte capabilities only; importing this module opens no storage. */
import {canonicalStringify, payloadHash} from '../schema/event.mjs';
import {createAudioPackSourceReader} from './audio-pack-source.mjs';
import {createAudioPackAdmission} from './audio-pack-admission.mjs';
import {createAudioPackManager} from './audio-pack-manager.mjs';
import {createAudioPackIndexedDBStore} from '../storage/audio-pack-indexeddb.mjs';

function cancelled() {
  const error = Error('audio-pack-host-cancelled');
  error.name = 'AbortError';
  error.audioCode = 'cancelled';
  return error;
}

export async function createBrowserAudioPackHost({
  configuration = null, store, catalog, registry, grammarRecords, build, buildSha256,
  getAssignments = () => ({}), eventTarget = globalThis.window,
} = {}) {
  if (configuration === null) return null;
  const {release, authority, scope, packIds: selected, transport: configuredTransport, authorize} = configuration;
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > 64 ||
      selected.some(id => typeof id !== 'string' || !id.trim()) ||
      new Set(selected).size !== selected.length || typeof configuredTransport?.read !== 'function' ||
      typeof authorize !== 'function') throw new TypeError('audio-pack-host-configuration');
  const packIds = Object.freeze([...selected]);
  getAssignments = configuration.getAssignments ?? getAssignments;
  if (typeof getAssignments !== 'function') throw new TypeError('audio-pack-host-assignments');
  const live = await store.readState({requireCompatible: true});
  if (!store.scope || canonicalStringify(live.scope) !== canonicalStringify(store.scope) ||
      live.blocked != null || live.projection?.error != null || live.projection?.updateRequired != null ||
      !Number.isSafeInteger(live.epoch) || live.epoch < 0 || live.projection?.epoch !== live.epoch) {
    throw Error('audio-pack-host-replica-scope');
  }
  const namespace = {...store.scope, epoch: live.epoch};
  const readCurrentSource = createAudioPackSourceReader({
    store, catalog, registry, grammarRecords, build, buildSha256,
    authority, scope, getAssignments,
  });
  const admission = createAudioPackAdmission({release, namespace, authority, scope, readCurrentSource, authorize});
  const byteStore = createAudioPackIndexedDBStore({
    databaseName: 'nihongo-audio-packs-v1-' + payloadHash(admission.binding),
  });
  let manager = null, disposed = false, paused = false, disposal = null;
  let tail = Promise.resolve(), acquisition = null, refreshFlight = null, controller = null, refreshController = null;
  let userCancelled = false;
  let snapshot = Object.freeze({state: 'idle', selectedPacks: packIds.length, installedPacks: 0});
  const subscribers = new Set();
  function publish(state, installedPacks = snapshot.installedPacks) {
    snapshot = Object.freeze({state: disposed ? 'disposed' : paused ? 'paused' : state,
      selectedPacks: packIds.length, installedPacks});
    for (const listener of subscribers) {
      try { Promise.resolve(listener(snapshot)).catch(() => {}); } catch { /* Advisory only. */ }
    }
  }
  function enqueue(work) {
    const pending = tail.then(work);
    tail = pending.then(() => {}, () => {});
    return pending;
  }
  async function inventory(signal) {
    let installedPacks = 0, invalid = false;
    for (const packId of packIds) {
      if (disposed || paused || signal?.aborted) throw cancelled();
      const state = await manager.verifyPack(packId, {signal});
      if (disposed || paused || signal?.aborted) throw cancelled();
      if (state === 'verified-local') installedPacks++;
      else if (state !== 'missing') invalid = true;
    }
    if (disposed || paused || signal?.aborted) throw cancelled();
    return {installedPacks, state: invalid ? 'error' : installedPacks === packIds.length ? 'saved' : 'idle'};
  }
  function refresh() {
    if (disposed || paused) return Promise.resolve();
    if (refreshFlight) return refreshFlight;
    const operation = new AbortController();
    refreshController = operation;
    const pending = enqueue(async () => {
      if (disposed || paused || operation.signal.aborted) return;
      publish('checking');
      try {
        const result = await inventory(operation.signal);
        if (result) publish(result.state === 'error' ? 'error' : userCancelled ? 'cancelled' : result.state, result.installedPacks);
      } catch (error) {
        if (disposed || paused || operation.signal.aborted || error?.name === 'AbortError' || error?.audioCode === 'cancelled') return;
        publish('error');
        throw error;
      }
    });
    refreshFlight = pending.finally(() => { refreshFlight = null; refreshController = null; });
    return refreshFlight;
  }
  function acquire() {
    if (disposed || paused) return Promise.reject(cancelled());
    if (acquisition) return acquisition;
    refreshController?.abort();
    userCancelled = false;
    const operation = new AbortController();
    controller = operation;
    const pending = enqueue(async () => {
      try {
        if (disposed || paused || operation.signal.aborted) throw cancelled();
        publish('downloading');
        await manager.acquire(packIds, {signal: operation.signal});
        if (disposed || paused || operation.signal.aborted) throw cancelled();
        const result = await inventory(operation.signal);
        if (disposed || paused || operation.signal.aborted) throw cancelled();
        if (result.state !== 'saved') throw Error('audio-pack-host-verification');
        publish('saved', result.installedPacks);
      } catch (error) {
        if (!disposed && !paused) {
          let result = null;
          if (!operation.signal.aborted) {
            try { result = await inventory(operation.signal); } catch { }
          }
          publish(operation.signal.aborted && userCancelled ? 'cancelled' : 'error', result?.installedPacks ?? snapshot.installedPacks);
        }
        throw error;
      }
    });
    acquisition = pending.finally(() => { acquisition = null; controller = null; });
    return acquisition;
  }
  async function authorizePlayback(snapshot, {signal, ref, segment} = {}) {
    if (disposed || paused || signal?.aborted) throw cancelled();
    const expected = manager.audio.release;
    if (snapshot?.status !== 'ready' || snapshot.releaseId !== expected.releaseId ||
        snapshot.projectionId !== expected.projectionId || snapshot.contentRelease !== expected.contentRelease ||
        !ref || !Array.isArray(snapshot.segments) ||
        !snapshot.segments.some(segment => canonicalStringify(segment.ref) === canonicalStringify(ref))) {
      throw Error('audio-pack-host-playback-binding');
    }
    try {
      await manager.authorizePlayback(snapshot, {signal, ref, segment});
      if (disposed || paused || signal?.aborted) throw cancelled();
    } catch (error) {
      if (error?.audioCode !== 'cancelled' && error?.name !== 'AbortError' && !disposed && !paused) publish('error');
      throw error;
    }
  }
  function cancel() {
    if (disposed || paused || (!controller && !refreshController)) return;
    userCancelled = true;
    controller?.abort();
    refreshController?.abort();
    publish('cancelled');
  }
  function pagehide(event) {
    if (event.persisted) {
      if (disposed) return;
      paused = true;
      controller?.abort();
      refreshController?.abort();
      publish('paused');
    } else {
      // The same rejected disposal promise remains available to the owner.
      dispose().catch(() => {});
    }
  }
  function pageshow(event) {
    if (!event.persisted || disposed) return;
    paused = false;
    // A paused refresh may still be settling. Check again after that flight,
    // rather than coalescing this wake with its abandoned inventory.
    tail.then(() => {
      if (!disposed && !paused) return refresh();
    }).catch(() => {}); // refresh records the generic failure state.
  }
  function dispose() {
    if (disposal) return disposal;
    disposed = true;
    disposal = Promise.resolve().then(async () => {
      const results = await Promise.allSettled([manager?.dispose(), tail]);
      await byteStore.close();
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    });
    controller?.abort();
    refreshController?.abort();
    publish('disposed');
    subscribers.clear();
    eventTarget?.removeEventListener('pagehide', pagehide);
    eventTarget?.removeEventListener('pageshow', pageshow);
    return disposal;
  }
  try {
    manager = createAudioPackManager({release, namespace, transport: configuredTransport, store: byteStore, admission});
    const audio = Object.freeze({
      protocol: manager.audio.protocol,
      release: manager.audio.release,
      resources: Object.freeze({
        async read(ref, options) {
          try { return await manager.audio.resources.read(ref, options); }
          catch (error) {
            if (error?.message === 'audio-pack-read-ref-unadmitted') error.audioCode = 'offline';
            else if (error?.audioCode !== 'cancelled' && !disposed && !paused) publish('error');
            throw error;
          }
        },
        packState: manager.audio.resources.packState,
      }),
    });
    const audioDownloads = Object.freeze({
      read: () => snapshot,
      subscribe(listener) {
        if (disposed) return () => {};
        subscribers.add(listener);
        return () => subscribers.delete(listener);
      },
      acquire, cancel, refresh, authorizePlayback, readSource: readCurrentSource,
    });
    eventTarget?.addEventListener('pagehide', pagehide);
    eventTarget?.addEventListener('pageshow', pageshow);
    refresh().catch(() => {});
    return Object.freeze({binding: admission.binding, audio, audioDownloads, dispose});
  } catch (error) {
    try { await dispose(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'audio-pack-host-cleanup'); }
    throw error;
  }
}
