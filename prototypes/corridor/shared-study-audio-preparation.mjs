/** Parent-side lifecycle for the canonical accepted-audio observer.
 *
 * The canonical engine owns observation, scheduling and its private sink. This
 * module only binds the exact accepted source pins and keeps one lifecycle per
 * canonical store, so frame navigation and adapter re-wrapping cannot start a
 * second observer or touch the grade ledger. */
const HEX = /^[a-f0-9]{64}$/;
const lifecycles = new WeakMap();

const disposedError = () => Error('shared-audio-preparation-disposed');
const failureState = error => ({state: 'error', error: error?.message || String(error)});

function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw Error('shared-audio-adapter-required');
  const store = adapter.store;
  if (!store || (typeof store !== 'object' && typeof store !== 'function')) throw Error('shared-audio-store-required');
  if (!Array.isArray(adapter.catalog)) throw Error('shared-audio-catalog-required');
  return store;
}

function validatePins(build, binding) {
  const source = binding?.source, assets = binding?.grammarAssets, dictionary = binding?.dictionary;
  if (!HEX.test(source?.catalogSha256 ?? '') || !HEX.test(source?.registrySha256 ?? '') ||
      !HEX.test(assets?.['grammar.json'] ?? '')) throw Error('shared-audio-binding-pin');
  // BUILD is authenticated by the child from its raw bytes. These are the
  // exact accepted pins already carried by that audited artifact.
  if (!HEX.test(dictionary?.buildSha256 ?? '')) throw Error('shared-audio-dictionary-binding-pin');
  const files = build?.files;
  if (!build || typeof build !== 'object' || Array.isArray(build) || !files ||
      typeof files !== 'object' || Array.isArray(files)) throw Error('shared-audio-build-binding-pin');
  if (files['catalog.json'] !== source.catalogSha256 ||
      files['registry.json'] !== source.registrySha256 ||
      files['grammar.json'] !== assets['grammar.json']) throw Error('shared-audio-source-binding-pin');
}

function cloneRequest(entry, options) {
  const {build, grammarRecords} = options ?? {};
  if (!Array.isArray(grammarRecords)) throw Error('shared-audio-grammar-records-array');
  if (!build || typeof build !== 'object' || Array.isArray(build)) throw Error('shared-audio-build-required');
  // Close over parent-realm copies before any await or canonical call. The
  // caller may be a cross-realm frame and keeps mutating its own objects.
  const clonedBuild = structuredClone(build);
  const clonedRecords = structuredClone(grammarRecords);
  validatePins(clonedBuild, entry.binding);
  return {build: clonedBuild, grammarRecords: clonedRecords};
}

function currentState(entry) {
  if (entry.disposed) return {state: 'disposed'};
  if (entry.helper && typeof entry.helper.status === 'function') return entry.helper.status();
  return entry.state;
}

function disposeLifecycle(entry) {
  if (entry.disposed) return;
  entry.disposed = true;
  entry.inflight = null;
  if (entry.pagehide) {
    try { entry.eventTarget?.removeEventListener?.('pagehide', entry.pagehide, {capture: false}); } catch {}
    entry.pagehide = null;
  }
  const helper = entry.helper;
  entry.helper = null;
  try { helper?.dispose?.(); } catch {}
}

function ensurePreparation(entry, options) {
  if (entry.disposed) return Promise.reject(disposedError());
  let request;
  try {
    request = cloneRequest(entry, options);
  } catch (error) {
    if (!entry.helper) entry.state = failureState(error);
    return Promise.reject(error);
  }
  // One observer per original store. A started or in-flight lifecycle wins;
  // a duplicate call never loads/imports or starts again.
  if (entry.helper) return Promise.resolve(currentState(entry));
  if (entry.inflight) return entry.inflight;
  const opening = (async () => {
    let canonical;
    try {
      canonical = await entry.loadCanonical();
    } catch (error) {
      if (entry.disposed) throw disposedError();
      entry.state = failureState(error);
      throw error;
    }
    if (entry.disposed) throw disposedError();
    try {
      const sourceRevision = canonical.acceptedAudioSourceRevision({build: request.build});
      if (entry.disposed) throw disposedError();
      const helper = canonical.startAcceptedAudioHost({
        store: entry.adapter.store,
        catalog: entry.adapter.catalog,
        grammarRecords: request.grammarRecords,
        sourceRevision,
        native: false,
      });
      if (entry.disposed) {
        try { helper?.dispose?.(); } catch {}
        throw disposedError();
      }
      entry.helper = helper;
      return currentState(entry);
    } catch (error) {
      if (entry.disposed) throw disposedError();
      entry.state = failureState(error);
      throw error;
    }
  })();
  entry.inflight = opening;
  const settle = () => { if (entry.inflight === opening) entry.inflight = null; };
  opening.then(settle, settle);
  return opening;
}

function wrap(entry) {
  const adapter = entry.adapter;
  const platform = Object.freeze({
    ...(adapter.platform && typeof adapter.platform === 'object' ? adapter.platform : {}),
    getAudioPreparationState: () => currentState(entry),
  });
  return Object.freeze({
    ...adapter,
    platform,
    ensureAudioPreparation: options => ensurePreparation(entry, options),
  });
}

/** Wrap an adapter with the optional parent-owned audio preparation lifecycle.
 * The original store, backend and catalog stay the exact same references. */
export function attachSharedStudyAudioPreparation({adapter, binding, eventTarget = globalThis,
  loadCanonical = () => import('./vendor/shared-study-engine/client/app/accepted-audio-host.mjs')} = {}) {
  const store = validateAdapter(adapter);
  if (typeof loadCanonical !== 'function') throw Error('shared-audio-loader-required');
  let entry = lifecycles.get(store);
  if (!entry) {
    entry = {
      adapter,
      binding: structuredClone(binding),
      eventTarget,
      loadCanonical,
      helper: null,
      inflight: null,
      pagehide: null,
      disposed: false,
      state: {state: 'pending'},
    };
    lifecycles.set(store, entry);
    // Own the lifetime before importing: pagehide must also fence a helper
    // whose module has not resolved yet.
    if (typeof eventTarget?.addEventListener === 'function') {
      function onPagehide(event) {
        if (event?.persisted === true) return;
        eventTarget.removeEventListener?.('pagehide', onPagehide, {capture: false});
        entry.pagehide = null;
        disposeLifecycle(entry);
      }
      entry.pagehide = onPagehide;
      eventTarget.addEventListener('pagehide', onPagehide, {capture: false});
    }
  }
  return wrap(entry);
}

/** Idempotently release the one lifecycle owned by the adapter's canonical store. */
export function disposeSharedStudyAudioPreparation(adapter) {
  const store = adapter?.store;
  if (!store || (typeof store !== 'object' && typeof store !== 'function')) return;
  const entry = lifecycles.get(store);
  if (entry) disposeLifecycle(entry);
}
