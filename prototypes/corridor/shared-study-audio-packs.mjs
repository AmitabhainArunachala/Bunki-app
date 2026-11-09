/** Parent-owned composition of the canonical browser pack host. */
const lifecycles = new WeakMap();
const HEX = /^[a-f0-9]{64}$/;
const disposedError = () => Error('shared-audio-packs-disposed');

function validatePins({build, buildSha256}, binding) {
  const expected = {'catalog.json': binding?.source?.catalogSha256,
    'registry.json': binding?.source?.registrySha256, ...binding?.grammarAssets};
  if (!HEX.test(binding?.dictionary?.buildSha256 ?? '') ||
      buildSha256 !== binding.dictionary.buildSha256 ||
      !HEX.test(expected['grammar.json'] ?? '') ||
      Object.entries(expected).some(([path, hash]) => !HEX.test(hash ?? '') || build?.files?.[path] !== hash))
    throw Error('shared-audio-packs-source-binding-pin');
}

function dispose(entry) {
  if (entry.disposal) return entry.disposal;
  entry.retired = true;
  entry.eventTarget?.removeEventListener?.('pagehide', entry.pagehide);
  entry.disposal = (async () => {
    // Opening never waits on this promise: a late host is retired here.
    try { await entry.inflight; } catch {}
    const host = entry.host;
    entry.host = null;
    await host?.dispose?.();
  })();
  return entry.disposal;
}

function exposeHost(entry, host) {
  const resources = host.audio.resources, controls = host.audioDownloads;
  // These functions execute in the parent realm. Clone child data before the
  // canonical strict plain-record validators see it; preserve the live signal.
  return Object.freeze({...host, dispose: () => dispose(entry),
    audio: Object.freeze({...host.audio, resources: Object.freeze({
      read: (ref, options = {}) => resources.read(structuredClone(ref), {signal: options.signal}),
      packState: id => resources.packState(id),
    })}),
    audioDownloads: Object.freeze({
      read: () => controls.read(),
      readSource: (options = {}) => controls.readSource({
        taskKeys: structuredClone(options.taskKeys), signal: options.signal,
      }),
      subscribe: listener => controls.subscribe(listener),
      acquire: () => controls.acquire(), cancel: () => controls.cancel(),
      refresh: () => controls.refresh(),
      authorizePlayback: (snapshot, options = {}) => controls.authorizePlayback(
        structuredClone(snapshot), {signal: options.signal, ref: structuredClone(options.ref),
          segment: structuredClone(options.segment)}),
    }),
  });
}

function ensure(entry, options) {
  if (entry.retired) return Promise.reject(disposedError());
  let request;
  try {
    // Capture the frame's data in the parent realm before the first await.
    request = structuredClone(options);
    validatePins(request, entry.binding);
  } catch (error) { return Promise.reject(error); }
  if (entry.host) return Promise.resolve(entry.exposed);
  if (entry.inflight) return entry.inflight;
  const opening = (async () => {
    const canonical = await entry.loadCanonical();
    if (entry.retired) throw disposedError();
    const host = await canonical.createBrowserAudioPackHost({store: entry.store,
      catalog: structuredClone(entry.catalog), registry: request.registry,
      grammarRecords: request.grammarRecords, build: request.build,
      buildSha256: request.buildSha256, configuration: entry.configuration,
      eventTarget: entry.eventTarget});
    if (!host?.audio || !host.audioDownloads || typeof host.dispose !== 'function') throw Error('shared-audio-packs-host-unavailable');
    entry.host = host;
    entry.exposed = exposeHost(entry, host);
    if (entry.retired) throw disposedError();
    return entry.exposed;
  })();
  entry.inflight = opening;
  const settle = () => { if (entry.inflight === opening) entry.inflight = null; };
  opening.then(settle, settle);
  return opening;
}

export function attachSharedStudyAudioPacks({adapter, binding, configuration = null,
  eventTarget = globalThis,
  loadCanonical = () => import('./vendor/shared-study-engine/client/app/browser-audio-pack-host.mjs')} = {}) {
  if (configuration == null) return adapter;
  const store = adapter?.store;
  if (!store || !['object', 'function'].includes(typeof store) || !Array.isArray(adapter.catalog))
    throw Error('shared-audio-packs-adapter-required');
  let entry = lifecycles.get(store);
  if (!entry) {
    const {transport, authorize, getAssignments, ...data} = configuration;
    entry = {store, catalog: structuredClone(adapter.catalog), binding: structuredClone(binding),
      configuration: {...structuredClone(data), transport, authorize, ...(getAssignments ? {getAssignments} : {})},
      eventTarget, loadCanonical, host: null, inflight: null, disposal: null, retired: false};
    entry.pagehide = event => { if (event?.persisted !== true) void dispose(entry).catch(() => {}); };
    lifecycles.set(store, entry);
    eventTarget?.addEventListener?.('pagehide', entry.pagehide);
  }
  return Object.freeze({...adapter, ensureAudioPacks: options => ensure(entry, options),
    disposeAudioPacks: () => dispose(entry)});
}

export function disposeSharedStudyAudioPacks(adapter) {
  const entry = adapter?.store && lifecycles.get(adapter.store);
  return entry ? dispose(entry) : Promise.resolve();
}
