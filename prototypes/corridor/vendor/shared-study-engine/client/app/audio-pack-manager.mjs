import {canonicalStringify} from '../schema/event.mjs';
import {createAudioReleaseReader, hashAudioBytes} from './audio-release.mjs';
import {validateAudioCapability} from './audio-resources.mjs';

const QUOTA_BYTES = 536870912;
const MAX_PACKS = 64;
const MAX_REFS = 4096;
const MAX_RESOURCE_BYTES = 2 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 68 * 1024 * 1024;
const MARKER_FORMAT = 'nsrs-installed-audio-pack/v1';
const HEX = /^[0-9a-f]{64}$/;

function failure(message) {
  const error = Error(`audio-pack-${message}`);
  error.audioCode = 'integrity';
  return error;
}

function cancelled(message = 'audio-pack-cancelled') {
  const error = Error(message);
  error.name = 'AbortError';
  error.audioCode = 'cancelled';
  return error;
}

function alive(signal) {
  if (signal?.aborted) throw cancelled();
}

function isCancelled(error) {
  return error?.name === 'AbortError' || error?.audioCode === 'cancelled';
}

async function call(callback, signal) {
  alive(signal);
  if (!signal) return callback();
  let remove;
  const interruption = new Promise((_, reject) => {
    const abort = () => reject(cancelled());
    signal.addEventListener('abort', abort, {once: true});
    remove = () => signal.removeEventListener('abort', abort);
  });
  try {
    return await Promise.race([Promise.resolve().then(callback), interruption]);
  } catch (error) {
    if (isCancelled(error)) throw cancelled();
    throw error;
  } finally {
    remove?.();
  }
}

function linkedSignal(external, lifecycle) {
  const controller = new AbortController();
  const parents = [external, lifecycle].filter(Boolean);
  const abort = () => controller.abort();
  for (const parent of parents) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener('abort', abort, {once: true});
  }
  return {
    signal: controller.signal,
    close() { for (const parent of parents) parent.removeEventListener('abort', abort); },
  };
}

function record(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw failure(`${label}-object`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) {
    throw failure(`${label}-keys`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw failure(`${label}-accessor`);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw failure(`${label}-text`);
  return value;
}

function refValue(raw) {
  const value = record(raw, ['key', 'sha256', 'bytes'], 'ref');
  if (typeof value.sha256 !== 'string' || !HEX.test(value.sha256) ||
      !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > MAX_RESOURCE_BYTES) {
    throw failure('ref-identity');
  }
  return Object.freeze({key: text(value.key, 'ref-key'), sha256: value.sha256, bytes: value.bytes});
}

function sameRef(left, right) {
  return left.key === right.key && left.sha256 === right.sha256 && left.bytes === right.bytes;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function same(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function namespaceValue(raw) {
  const value = record(raw, ['environment', 'learner', 'installation', 'epoch'], 'namespace');
  if (!Number.isSafeInteger(value.epoch) || value.epoch < 0 || Object.is(value.epoch, -0)) {
    throw failure('namespace-epoch');
  }
  return freeze({
    environment: text(value.environment, 'namespace-environment'),
    learner: text(value.learner, 'namespace-learner'),
    installation: text(value.installation, 'namespace-installation'),
    epoch: value.epoch,
  });
}

async function exactBytes(value, ref) {
  if (!(value instanceof Uint8Array)) throw failure('resource-not-bytes');
  const bytes = new Uint8Array(value);
  if (bytes.byteLength !== ref.bytes || await hashAudioBytes(bytes) !== ref.sha256) {
    throw failure('resource-digest');
  }
  return bytes;
}

function markerValue(raw, binding, packId) {
  const value = record(raw, ['format', 'binding', 'packId', 'refs'], 'marker');
  if (value.format !== MARKER_FORMAT || value.packId !== packId || !same(value.binding, binding) ||
      !Array.isArray(value.refs) || value.refs.length < 1 || value.refs.length > MAX_REFS) {
    throw failure('marker-identity');
  }
  const refs = value.refs.map(refValue);
  const keys = new Set();
  let bytes = 0;
  for (const ref of refs) {
    if (keys.has(ref.key)) throw failure('marker-ref-duplicate');
    keys.add(ref.key);
    bytes += ref.bytes;
    if (bytes > MAX_SNAPSHOT_BYTES) throw failure('marker-bytes');
  }
  return freeze({format: MARKER_FORMAT, binding, packId, refs});
}

export function createAudioPackManager({release, namespace, transport, store, admission} = {}) {
  if (!transport || typeof transport.read !== 'function' || !store || !admission ||
      typeof admission.authorize !== 'function' || typeof admission.validate !== 'function') {
    throw new TypeError('audio-pack-manager-ports-required');
  }
  for (const method of ['listPacks', 'readPack', 'readResource', 'stageResource', 'commitPack', 'invalidatePack']) {
    if (typeof store[method] !== 'function') throw new TypeError(`audio-pack-store-${method}-required`);
  }
  const resources = {
    read: (ref, options) => track(publicRead(ref, options)),
    packState: (packId, options) => track(packState(packId, options)),
  };
  const audio = validateAudioCapability({protocol: 'nsrs-audio-resources/v1', release, resources});
  const binding = freeze({
    namespace: namespaceValue(namespace),
    releaseId: audio.release.releaseId,
    projectionId: audio.release.projectionId,
    contentRelease: audio.release.contentRelease,
    root: audio.release.root,
  });
  if (!same(admission.binding, binding)) throw failure('admission-binding');
  const lifecycle = new AbortController();
  const flights = new Map();
  const installed = new Map();
  const pending = new Set();
  const rejectedAdmissions = new WeakSet();
  const damagedResources = new WeakMap();
  let disposed = false;
  let disposePromise = null;

  function captureResolutions(reader, resolutions) {
    return {async resolve(selection, options) {
      const result = await reader.resolve(selection, options);
      if (result?.status === 'ready') {
        resolutions.set(canonicalStringify(selection), result);
      }
      return result;
    }};
  }

  function cachedReader(cached) {
    return {async resolve(selection) {
      return cached.resolutions.get(canonicalStringify(selection)) ?? {status: 'source-stale'};
    }};
  }

  function remember(packId, inspection, marker, resolutions) {
    const result = {inspection, marker, resolutions,
      refs: new Map(inspection.refs.map(ref => [ref.key, ref])),
      size: new TextEncoder().encode(canonicalStringify({inspection, marker,
        resolutions: [...resolutions]})).byteLength};
    installed.delete(packId);
    if (result.size <= MAX_SNAPSHOT_BYTES) {
      let size = result.size;
      for (const cached of installed.values()) size += cached.size;
      while (size > MAX_SNAPSHOT_BYTES || installed.size >= MAX_PACKS) {
        const oldest = installed.keys().next().value;
        size -= installed.get(oldest).size;
        installed.delete(oldest);
      }
      installed.set(packId, result);
    }
    return result;
  }

  // Track manager cleanup, not raw I/O promises behind the abort fences.
  function track(promise) {
    pending.add(promise);
    promise.then(() => pending.delete(promise), () => pending.delete(promise));
    return promise;
  }

  function checkDisposed() {
    if (disposed) throw cancelled('audio-pack-disposed');
  }

  async function durable(ref, signal) {
    const value = await call(() => store.readResource(binding, ref, {signal}), signal);
    alive(signal);
    if (value === null) return null;
    try {
      return await exactBytes(value, ref);
    } catch (error) {
      if (!isCancelled(error) && error?.audioCode === 'integrity') damagedResources.set(error, ref);
      throw error;
    }
  }

  async function requiredDurable(ref, signal) {
    const value = await durable(ref, signal);
    if (value) return value;
    const error = failure('resource-missing');
    damagedResources.set(error, ref);
    throw error;
  }

  async function listed(signal) {
    const value = await call(() => store.listPacks(binding, {signal}), signal);
    alive(signal);
    if (!Array.isArray(value) || value.length > MAX_PACKS ||
        value.some(id => typeof id !== 'string' || id.length === 0) || new Set(value).size !== value.length) {
      throw failure('pack-list');
    }
    return value;
  }

  async function invalidate(packId) {
    installed.delete(packId);
    try { await store.invalidatePack(binding, packId); } catch { /* The failed state is never exposed as verified. */ }
  }

  async function validateAdmission(inspection, options) {
    try {
      return await call(() => admission.validate(inspection, options), options.signal);
    } catch (error) {
      if (!isCancelled(error) && error?.audioCode === 'integrity') rejectedAdmissions.add(error);
      throw error;
    }
  }

  async function installedClosure(packId, signal, verifyResources = false) {
    checkDisposed();
    const ids = await listed(signal);
    if (!ids.includes(packId)) {
      installed.delete(packId);
      return null;
    }
    let marker;
    try {
      const raw = await call(() => store.readPack(binding, packId, {signal}), signal);
      if (!raw) {
        installed.delete(packId);
        return null;
      }
      marker = markerValue(raw, binding, packId);
      const cached = installed.get(packId);
      if (cached) {
        if (!same(marker, cached.marker)) throw failure('marker-changed');
        if (verifyResources) {
          for (const ref of cached.inspection.refs) await requiredDurable(ref, signal);
          alive(signal);
        }
        return cached;
      }
      const refs = new Map();
      let bytes = 0;
      const localResources = {
        packState: async () => 'verified-local',
        async read(rawRef, options = {}) {
          const ref = refValue(rawRef);
          const previous = refs.get(ref.key);
          if (previous && !sameRef(previous, ref)) throw failure('ref-conflict');
          if (!previous) {
            if (refs.size >= MAX_REFS) throw failure('ref-limit');
            bytes += ref.bytes;
            if (bytes > MAX_SNAPSHOT_BYTES) throw failure('snapshot-bytes');
            refs.set(ref.key, ref);
          }
          return requiredDurable(ref, options.signal ?? signal);
        },
      };
      const capability = validateAudioCapability({
        protocol: 'nsrs-audio-resources/v1', release: audio.release, resources: localResources,
      });
      const reader = createAudioReleaseReader({capability});
      try {
        const inspection = await call(() => reader.inspectPack(packId, {signal, beforeMedia: inspection =>
          validateAdmission(inspection, {reader, signal, metadataOnly: true})}), signal);
        alive(signal);
        if (refs.size !== inspection.refs.length || inspection.refs.some(ref => {
          const captured = refs.get(ref.key);
          return !captured || !sameRef(captured, ref);
        })) throw failure('inspection-closure');
        if (!same(marker.refs, inspection.refs)) throw failure('marker-closure');
        const resolutions = new Map();
        await validateAdmission(inspection, {
          reader: captureResolutions(reader, resolutions), signal,
        });
        alive(signal);
        return remember(packId, inspection, marker, resolutions);
      } finally {
        await reader.dispose();
      }
    } catch (error) {
      if (!isCancelled(error) && error?.audioCode === 'integrity') await invalidate(packId);
      throw error;
    }
  }

  async function validateInstalled(packId, signal, verifyResources = false) {
    const cached = await installedClosure(packId, signal, verifyResources);
    if (!cached) return null;
    try {
      await validateAdmission(cached.inspection, {reader: cachedReader(cached), signal});
      if (verifyResources) {
        const marker = await call(() => store.readPack(binding, packId, {signal}), signal);
        if (!marker || !same(markerValue(marker, binding, packId), cached.marker)) throw failure('marker-changed');
      }
      alive(signal);
      return cached;
    } catch (error) {
      if (!isCancelled(error) && error?.audioCode === 'integrity') await invalidate(packId);
      throw error;
    }
  }

  async function packState(packId, {signal} = {}, verifyResources = false) {
    if (disposed) return 'nonpersistent';
    if (typeof packId !== 'string' || packId.length === 0) return 'missing';
    const operation = linkedSignal(signal, lifecycle.signal);
    try {
      const result = await validateInstalled(packId, operation.signal, verifyResources);
      return disposed ? 'nonpersistent' : result ? 'verified-local' : 'missing';
    } catch {
      return disposed ? 'nonpersistent' : 'incomplete';
    } finally {
      operation.close();
    }
  }

  async function publicRead(rawRef, {signal} = {}) {
    const ref = refValue(rawRef);
    const operation = linkedSignal(signal, lifecycle.signal);
    let selected = null;
    try {
      checkDisposed();
      alive(operation.signal);
      const inspected = new Set();
      let candidateFailure = null;
      async function candidate(packId) {
        inspected.add(packId);
        try {
          return await validateInstalled(packId, operation.signal);
        } catch (error) {
          const damaged = damagedResources.get(error);
          if (isCancelled(error) || !(rejectedAdmissions.has(error) || damaged && damaged.key !== ref.key)) throw error;
          candidateFailure ??= error;
          return null;
        }
      }
      for (const [packId, cached] of installed) {
        const known = cached.refs.get(ref.key);
        if (known && !sameRef(known, ref)) throw failure('read-ref-conflict');
        if (known) {
          selected = await candidate(packId);
          if (selected) break;
        }
      }
      if (!selected) {
        const ids = await listed(operation.signal);
        for (const packId of ids) {
          if (inspected.has(packId)) continue;
          const current = await candidate(packId);
          if (!current) continue;
          const known = current.refs.get(ref.key);
          if (known && !sameRef(known, ref)) throw failure('read-ref-conflict');
          if (known) {
            selected = current;
            break;
          }
        }
      }
      if (!selected) throw candidateFailure ?? failure('read-ref-unadmitted');
      const bytes = await durable(ref, operation.signal);
      if (!bytes) {
        const packId = selected.inspection.pack.id;
        await invalidate(packId);
        throw failure('read-resource-missing');
      }
      alive(operation.signal);
      checkDisposed();
      return new Uint8Array(bytes);
    } catch (error) {
      if (selected && !isCancelled(error) && error?.audioCode === 'integrity') await invalidate(selected.inspection.pack.id);
      throw error;
    } finally {
      operation.close();
    }
  }

  async function authorizePlayback(snapshot, {signal, segment, ref} = {}) {
    const operation = linkedSignal(signal, lifecycle.signal);
    try {
      checkDisposed();
      alive(operation.signal);
      if (snapshot?.status !== 'ready' || snapshot.releaseId !== binding.releaseId ||
          snapshot.projectionId !== binding.projectionId || snapshot.contentRelease !== binding.contentRelease ||
          !segment || !ref || !sameRef(segment.ref ?? {}, ref) ||
          !Array.isArray(snapshot.segments) || !snapshot.segments.some(row => same(row, segment)) ||
          typeof segment.packId !== 'string') throw failure('playback-selection');
      const packId = segment.packId;
      const cached = await installedClosure(packId, operation.signal);
      if (!cached) throw failure('playback-pack-missing');
      const mixed = snapshot.version === 2;
      if (mixed && (!snapshot.profileAssignments || snapshot.profileId !== null ||
          snapshot.segments.some(row => !['ja', 'en'].includes(row.language) ||
            snapshot.profileAssignments[row.language] !== row.profileId))) throw failure('playback-profiles');
      const matches = [...cached.resolutions.values()].filter(result =>
        ['taskKey', 'contentRevision', 'audioContentRevision', 'supportedReadingId']
          .every(key => result[key] === snapshot[key]) &&
        (mixed ? result.version === 2 && result.profileAssignments[segment.language] === segment.profileId :
          result.version !== 2 && result.profileId === snapshot.profileId) &&
        result.segments.some(row => same(row, segment)));
      const placement = cached.inspection.placements.find(row =>
        row.packId === packId && row.taskKey === snapshot.taskKey &&
        row.contentRevision === snapshot.contentRevision && row.audioContentRevision === snapshot.audioContentRevision &&
        (mixed ? row.version === 2 && row.profileAssignments[segment.language] === segment.profileId &&
          row.segments.some(part => part.index === segment.index && part.start === segment.start &&
            part.end === segment.end && part.byteStart === segment.byteStart && part.byteEnd === segment.byteEnd &&
            part.language === segment.language && part.profileId === segment.profileId &&
            part.packId === segment.packId && part.inputKey === segment.inputKey) :
          row.version !== 2 && row.profileId === snapshot.profileId) &&
        row.supportedReadingId === snapshot.supportedReadingId && row.fieldId === segment.fieldId);
      if (!matches.length || !placement) throw failure('playback-placement');
      try {
        await validateAdmission(cached.inspection, {
          reader: cachedReader(cached), placement, signal: operation.signal, metadataOnly: true,
        });
        alive(operation.signal);
        const bytes = await durable(refValue(ref), operation.signal);
        if (!bytes) throw failure('playback-resource-missing');
        await call(() => admission.validate(cached.inspection, {
          reader: cachedReader(cached), placement, signal: operation.signal,
        }), operation.signal);
        const marker = await call(() => store.readPack(binding, packId, {signal: operation.signal}), operation.signal);
        if (!marker || !same(markerValue(marker, binding, packId), cached.marker)) throw failure('marker-changed');
        alive(operation.signal);
        checkDisposed();
      } catch (error) {
        if (!isCancelled(error) && error?.audioCode === 'integrity') await invalidate(packId);
        throw error;
      }
    } finally {
      operation.close();
    }
  }

  async function install(packId, signal) {
    checkDisposed();
    await call(() => admission.authorize(packId, {signal}), signal);
    alive(signal);
    try {
      if (await validateInstalled(packId, signal, true)) return;
    } catch (error) {
      if (isCancelled(error) || !damagedResources.has(error)) throw error;
    }
    alive(signal);
    const captured = new Map();
    let capturedBytes = 0;
    let stagingFailure = null;
    const privateResources = {
      packState: async () => 'verified-local',
      async read(rawRef, options = {}) {
        const ioSignal = options.signal ?? signal;
        const ref = refValue(rawRef);
        const previous = captured.get(ref.key);
        if (previous && !sameRef(previous, ref)) throw failure('ref-conflict');
        if (!previous) {
          if (captured.size >= MAX_REFS) throw failure('ref-limit');
          capturedBytes += ref.bytes;
          if (capturedBytes > MAX_SNAPSHOT_BYTES) throw failure('snapshot-bytes');
          captured.set(ref.key, ref);
        }
        let bytes = null;
        const local = await call(() => store.readResource(binding, ref, {signal: ioSignal}), ioSignal);
        alive(ioSignal);
        if (local !== null) {
          try { bytes = await exactBytes(local, ref); } catch { bytes = null; }
        }
        if (!bytes) {
          const remote = await call(() => transport.read(ref, {signal: ioSignal}), ioSignal);
          alive(ioSignal);
          bytes = await exactBytes(remote, ref);
          alive(ioSignal);
          try {
            await call(() => store.stageResource(binding, ref, new Uint8Array(bytes), {
              signal: ioSignal, quotaBytes: QUOTA_BYTES,
            }), ioSignal);
          } catch (error) {
            stagingFailure = error;
            throw error;
          }
          alive(ioSignal);
        }
        return new Uint8Array(bytes);
      },
    };
    const capability = validateAudioCapability({
      protocol: 'nsrs-audio-resources/v1', release: audio.release, resources: privateResources,
    });
    const reader = createAudioReleaseReader({capability});
    const resolutions = new Map();
    const resolvingReader = captureResolutions(reader, resolutions);
    let commitAttempted = false;
    try {
      let inspection;
      try { inspection = await call(() => reader.inspectPack(packId, {signal, beforeMedia: inspection =>
          validateAdmission(inspection, {reader, signal, metadataOnly: true})}), signal); }
      catch (error) { throw stagingFailure ?? error; }
      alive(signal);
      if (captured.size !== inspection.refs.length || inspection.refs.some(ref => {
        const refCaptured = captured.get(ref.key);
        return !refCaptured || !sameRef(refCaptured, ref);
      })) throw failure('captured-closure');
      const marker = markerValue({
        format: MARKER_FORMAT, binding, packId, refs: inspection.refs,
      }, binding, packId);
      for (const ref of marker.refs) {
        const bytes = await durable(ref, signal);
        if (!bytes) throw failure('precommit-resource-missing');
        alive(signal);
      }
      const before = await call(() => admission.validate(inspection, {reader: resolvingReader, signal}), signal);
      alive(signal);
      if (!before || typeof before.sourceRevision !== 'string' || !before.sourceRevision ||
          typeof before.grantRevision !== 'string' || !before.grantRevision ||
          typeof before.fingerprint !== 'string' || !before.fingerprint) throw failure('validation-stamp');
      commitAttempted = true;
      await call(() => store.commitPack(binding, marker, {signal}), signal);
      alive(signal);
      const after = await call(() => admission.validate(inspection, {reader: resolvingReader, signal}), signal);
      alive(signal);
      if (!same(before, after)) throw failure('validation-stamp-changed');
      for (const ref of marker.refs) {
        const bytes = await durable(ref, signal);
        if (!bytes) throw failure('postcommit-resource-missing');
        alive(signal);
      }
      const committed = await call(() => store.readPack(binding, packId, {signal}), signal);
      alive(signal);
      if (!committed || !same(markerValue(committed, binding, packId), marker)) throw failure('commit-marker');
      remember(packId, inspection, marker, resolutions);
    } catch (error) {
      installed.delete(packId);
      if (commitAttempted) await invalidate(packId);
      throw error;
    } finally {
      await reader.dispose();
    }
  }

  function join(packId, signal) {
    checkDisposed();
    if (signal?.aborted) return Promise.reject(cancelled());
    let flight = flights.get(packId);
    if (!flight) {
      const controller = new AbortController();
      flight = {controller, waiters: new Set(), promise: null, settled: false};
      flight.promise = track(install(packId, controller.signal).then(
        value => { flight.settled = true; return value; },
        error => { flight.settled = true; throw error; },
      ));
      flight.promise.then(
        () => { if (flights.get(packId) === flight) flights.delete(packId); },
        () => { if (flights.get(packId) === flight) flights.delete(packId); },
      );
      flights.set(packId, flight);
    }
    const waiter = {};
    flight.waiters.add(waiter);
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', abort);
        flight.waiters.delete(waiter);
      };
      const abort = () => {
        if (done) return;
        finish();
        if (!flight.settled && flight.waiters.size === 0) flight.controller.abort();
        reject(cancelled());
      };
      signal?.addEventListener('abort', abort, {once: true});
      flight.promise.then(
        value => { finish(); resolve(value); },
        error => { finish(); reject(error); },
      );
    });
  }

  async function acquire(packIds, {signal} = {}) {
    if (!Array.isArray(packIds) || packIds.length < 1 || packIds.length > MAX_PACKS ||
        packIds.some(id => typeof id !== 'string' || id.trim().length === 0) ||
        new Set(packIds).size !== packIds.length) throw failure('acquire-pack-ids');
    for (const packId of packIds) await join(packId, signal);
  }

  function dispose() {
    if (disposePromise) return disposePromise;
    disposed = true;
    disposePromise = Promise.resolve().then(async () => {
      await Promise.allSettled(pending);
      flights.clear();
      installed.clear();
    });
    lifecycle.abort();
    for (const flight of flights.values()) flight.controller.abort();
    installed.clear();
    return disposePromise;
  }

  return Object.freeze({audio, acquire,
    verifyPack: (packId, options) => track(packState(packId, options, true)),
    authorizePlayback: (snapshot, options) => track(authorizePlayback(snapshot, options)), dispose});
}
