/** Bunki's isolated shared-study synchronization lifecycle.
 *
 * The vendored canonical transport owns request shape, retry/backoff, scoped
 * pull/upload and ack/reconcile. This module only supplies an explicit online /
 * visibility / hold policy, the shell's permit authority, and lifecycle
 * observations. It never creates a second durable store or a local permit
 * issuer. */
import {createSyncTransport, sharedPermitRequest} from './vendor/shared-study-engine/client/engine.mjs';
import {syncWithPermits} from './vendor/shared-study-engine/client/app/prod-native-sync.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STATES = new Set(['idle', 'syncing', 'up-to-date', 'pending', 'paused', 'blocked',
  'update-required', 'offline', 'error', 'disposed', 'paused-auth', 'backoff']);
const code = error => typeof error?.message === 'string' && error.message ? error.message : 'operation-failed';
const snapshot = (state, error = null, retryAt = null) => ({state, error, retryAt});

export function createSharedStudySync(config = {}) {
  const {
    origin,
    getCredential,
    fetch: request = globalThis.fetch,
    online = () => globalThis.navigator?.onLine!==false,
    visible = () => globalThis.document?.visibilityState!=='hidden',
    eventTarget = globalThis,
    now = Date.now,
    automatic = true,
    transportOptions = {},
    permits,
  } = config;
  if (typeof origin !== 'string' || !origin || typeof getCredential !== 'function' ||
      typeof request !== 'function' || typeof online !== 'function' ||
      typeof visible !== 'function' || typeof now !== 'function' ||
      typeof automatic !== 'boolean' || !transportOptions || typeof transportOptions !== 'object' ||
      Array.isArray(transportOptions) || !permits || typeof permits.isPaired !== 'function' ||
      typeof permits.reserve !== 'function') throw Error('shared-sync-config');

  let adapter = null;
  let store = null;
  let transport = null;
  let attached = false;
  let disposed = false;
  let flight = null;
  let reserveFlight = null;
  let wakeAfterFlight = false;
  let state = 'idle';
  let lastError = null;
  let timer = null;
  let internal = false;
  let changedDuringInternal = false;
  let unsubscribeStore = null;
  const holds = new Set();
  const listeners = new Set();
  const eventStops = [];

  const isOnline = () => online() === true;
  const isVisible = () => visible() === true;
  const held = () => holds.size > 0;

  const publish = (next, error = null) => {
    if(disposed)return;
    const value = STATES.has(next) ? next : 'error';
    const priorState = state;
    const priorError = lastError;
    state = value;
    lastError = typeof error === 'string' && error ? error : null;
    if (priorState === state && priorError === lastError) return;
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* observers cannot undo durability */ }
    }
  };

  const getSyncState = () => {
    if (disposed) return 'disposed';
    if (held()) return 'paused';
    if (!isOnline()) return 'offline';
    return state;
  };
  const getSyncError = () => lastError;
  const subscribeSyncState = listener => {
    if (typeof listener !== 'function') throw Error('shared-sync-listener');
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  const isPaired = () => {
    try { return permits.isPaired() === true; }
    catch { return false; }
  };

  const clearWake = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };

  function schedule() {
    if (!automatic || disposed || !attached || held() || !isOnline() || !isVisible() ||
        timer !== null) return;
    if(flight){wakeAfterFlight=true;return;}
    timer = setTimeout(() => {
      timer = null;
      if (disposed || !attached || held() || !isOnline() || !isVisible()) return;
      if(flight){wakeAfterFlight=true;return;}
      synchronize().catch(error => publish('error', code(error)));
    }, 25);
    // Background work must never keep a Node test process alive.
    if (typeof timer?.unref === 'function') timer.unref();
  }

  const stopEvents = () => {
    for (const entry of eventStops.splice(0)) {
      try { entry.stop(); } catch { /* listener cleanup is best effort */ }
    }
  };

  function watchEvents() {
    if (!eventTarget || typeof eventTarget.addEventListener !== 'function') return;
    const wake = () => schedule();
    const offline = () => { if (!disposed && attached) publish('offline', null); };
    for (const [type, handler] of [['online', wake], ['focus', wake],
      ['visibilitychange', wake], ['offline', offline]]) {
      try {
        eventTarget.addEventListener(type, handler);
        eventStops.push({stop: () => eventTarget.removeEventListener(type, handler)});
      } catch { /* an absent event surface only disables background waking */ }
    }
  }

  const mapResult = result => {
    if (!result || typeof result !== 'object') return snapshot('error', 'invalid-response');
    return result;
  };

  async function perform() {
    if (disposed) return snapshot('disposed', 'disposed');
    if (!attached || !transport) return snapshot('idle', 'shared-sync-not-attached');
    if (held()) { publish('paused', null); return snapshot('paused'); }
    if (!isOnline()) { publish('offline', null); return snapshot('offline'); }
    publish('syncing', null);
    internal = true;
    changedDuringInternal = false;
    let result;
    try {
      result = await transport.sync();
      if (adapter?.backend?.refresh) await adapter.backend.refresh();
    } catch (error) {
      result = snapshot('error', code(error));
    } finally {
      internal = false;
    }
    if (disposed) return snapshot('disposed', 'disposed');
    result = mapResult(result);
    if (held() && result.state !== 'error') result = {...result, state: 'paused', error: null};
    else if (!isOnline() && result.state !== 'error') result = {...result, state: 'offline', error: null};
    publish(result.state, result.error ?? null);
    const changed = changedDuringInternal;
    changedDuringInternal = false;
    if (changed && automatic && !result.error && !held() && isOnline() && isVisible()) {
      // A local command may have landed while this pass was already reading the
      // outbox. Only ordinary pending work earns one more bounded wake; an
      // error/blocked prefix waits for an explicit action or a fresh event.
      try {
        const status = await store.status();
        if (!status.upToDate && !status.blocked && status.pending > 0) schedule();
      } catch { /* status failure remains visible through the sync result */ }
    }
    return result;
  }

  function synchronize() {
    if (disposed) return Promise.resolve(snapshot('disposed', 'disposed'));
    if (!attached || !transport) return Promise.resolve(snapshot('idle', 'shared-sync-not-attached'));
    if (held()) {
      publish('paused', null);
      return Promise.resolve(snapshot('paused'));
    }
    if (!isOnline()) {
      publish('offline', null);
      return Promise.resolve(snapshot('offline'));
    }
    if (flight) return flight;
    const settled = Promise.resolve().then(perform).finally(() => {
      if (flight === settled) flight = null;
      if(wakeAfterFlight){wakeAfterFlight=false;schedule();}
    });
    flight = settled;
    return settled;
  }

  const reserve = async (count, requestId, policy) => {
    if (disposed) throw Error('shared-sync-disposed');
    if (held()) throw Error('host-paused');
    if (!isOnline()) throw Error('offline');
    return permits.reserve(count, requestId, policy);
  };

  function reserveNewPermits(options = {}) {
    if(disposed)return Promise.resolve(snapshot('disposed','disposed'));
    if (options?.store && options.store!==store) return Promise.reject(Error('shared-sync-store-mismatch'));
    if (reserveFlight) return reserveFlight;
    const running = reservePermits(options);
    reserveFlight = running.catch(error=>{publish('error',code(error));throw error;}).finally(() => { reserveFlight = null; });
    return reserveFlight;
  }

  async function reservePermits(options = {}) {
    if (disposed) return snapshot('disposed', 'disposed');
    if (!attached || !transport) throw Error('shared-sync-not-attached');
    const target = options?.store ?? store;
    if (target !== store) throw Error('shared-sync-store-mismatch');
    if (held()) { publish('paused', null); return snapshot('paused'); }
    if (!isOnline()) { publish('offline', null); return snapshot('offline'); }
    return syncWithPermits({
      synchronize,
      transport,
      store: target,
      permitRequest: value => sharedPermitRequest(value, {now, prefix: 'shared-host', batchSize: 5}),
    });
  }

  function attach(target) {
    if (disposed) return Promise.reject(Error('shared-sync-disposed'));
    if (!target || !target.store || typeof target.store.status !== 'function' ||
        typeof target.store.readState !== 'function' || typeof target.store.outbox !== 'function' ||
        typeof target.store.acknowledge !== 'function' || typeof target.store.reconcile !== 'function' ||
        !target.store.scope || !ID.test(target.store.scope.installation || '') ||
        !ID.test(target.store.scope.learner || '') || !ID.test(target.store.scope.environment || ''))
      return Promise.reject(Error('shared-sync-store-required'));
    if (attached) {
      if (target.store !== store) return Promise.reject(Error('shared-sync-store-attached'));
      return Promise.resolve(snapshot(getSyncState(), lastError));
    }
    let next;
    try {
      next = createSyncTransport({
        ...transportOptions,
        store: target.store,
        origin,
        getCredential,
        fetch: request,
        now,
        canContinue: () => !disposed && !held() && isOnline() && isVisible(),
      });
    } catch (error) {
      return Promise.reject(error);
    }
    adapter = target;
    store = target.store;
    transport = Object.freeze({
      sync: () => next.sync(),
      status: () => next.status(),
      resumeAfterPairing: () => next.resumeAfterPairing(),
      isPaired: async () => {
        try { return (await permits.isPaired()) === true; }
        catch { return false; }
      },
      reserve,
      dispose: () => {},
    });
    attached = true;
    if (typeof store.subscribe === 'function') {
      unsubscribeStore = store.subscribe(() => {
        if (internal) { changedDuringInternal = true; return; }
        schedule();
      });
    }
    watchEvents();
    return synchronize();
  }

  function hold(token) {
    if (typeof token !== 'string' || !SAFE_TOKEN.test(token)) throw Error('shared-sync-hold-token');
    if (disposed) return;
    holds.add(token);
    publish('paused', null);
  }

  function release(token) {
    if (typeof token !== 'string' || !SAFE_TOKEN.test(token)) return;
    if (holds.delete(token) && !held()) { publish('pending'); schedule(); }
  }

  async function drain() {
    const settled = await Promise.allSettled([flight, reserveFlight]);
    const failure = settled.find(row => row.status === 'rejected');
    if (failure) throw failure.reason;
    return settled[0].value;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    clearWake();
    stopEvents();
    holds.clear();
    if (unsubscribeStore) {
      try { unsubscribeStore(); } catch { /* adapter owns subscription cleanup */ }
      unsubscribeStore = null;
    }
    listeners.clear();
    state = 'disposed';
    lastError = null;
  }

  return Object.freeze({
    hooks: Object.freeze({getSyncState, getSyncError, subscribeSyncState, isPaired, canRequestNewCards:isPaired, isOnline}),
    getSyncState,
    getSyncError,
    subscribeSyncState,
    isPaired,
    attach,
    synchronize,
    reserveNewPermits,
    resumeAfterPairing() { if (!disposed) { transport?.resumeAfterPairing();publish('idle'); } },
    hold,
    release,
    drain,
    dispose,
  });
}
