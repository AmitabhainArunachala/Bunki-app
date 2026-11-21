/** The paired study host (ENGINE-ONE.3): a kept study credential becomes the binding shared-study-runtime.mjs reads
 * from `globalThis.bunkiSharedStudyHost`. With it, Bunki's ordinary Learn routes open the shared study engine on the
 * learner's own synced record instead of the trial copy.
 *
 * What this host supplies, and nothing more:
 *   identity     environment and learner as the server said them at pairing, and the installation the pairing code
 *                was minted for (`bunkiweb-<32 hex>`), kept on this device with the credential
 *   storage      the engine's own IndexedDB adapter under a name of its own for paired study, one per installation
 *                (`bunki-shared-study-paired-<installation>`), never the preview's
 *   transport    shared-study-sync.mjs over the engine's own sync client, against the one server the credential was
 *                redeemed from; new-card permits from that server (`POST /v1/permits`), never a local issuer
 *   state        paired or not, and the sync state the study screen and Settings read
 *
 * A device paired for the first time fetches the learner's record once before it lets anyone grade: studying an
 * empty copy would offer as new the cards another device has already taught. After that it opens offline too.
 * When the server refuses the credential (401) the pairing has ended: the credential is dropped, no further request
 * is made, and the screen says so. Nothing here schedules, merges or migrates anything; the engine does. */
import { createSharedStudyStorage } from './shared-study-storage.mjs';
import { createSharedStudySync } from './shared-study-sync.mjs';
import { disposeSharedStudyAudioPreparation } from './shared-study-audio-preparation.mjs';
import { compatibilityHeaders } from './vendor/shared-study-engine/client/sync-compatibility.mjs';
import { STUDY_INSTALLATION, checkStudyCredential, createStudyCredentialStore, isLoopbackServer, isStudyServer } from './shared-study-pairing.mjs';

export const PAIRED_HOST_KIND = 'bunki-paired-study/v1';
export const pairedReplicaName = (installation) => `bunki-shared-study-paired-${installation}`;

const LINES = Object.freeze({
  'study-pairing-missing': ['この端末のペアリングが見つかりません。設定でもう一度ペアリングしてください。', 'This device’s pairing was not found. Pair it again in Settings.'],
  'study-pairing-changed': ['この端末のペアリングが変わりました。Bunki を開き直してください。', 'This device’s pairing has changed. Reopen Bunki.'],
  'study-storage-failed': ['このブラウザーの保存領域を読めませんでした。ページを読み込み直してください。', 'This browser’s storage could not be read. Reload the page.'],
  'study-replica-missing': ['この端末にあるはずの学習記録の写しが見つかりません。設定でペアリングを消し、新しいコードでもう一度ペアリングしてください。',
    'This device’s copy of the study record is missing. In Settings, forget the pairing and pair again with a new code.'],
  'study-first-sync': ['この端末は、学習の前に一度あなたの記録を受け取る必要があります。オンラインでもう一度開いてください。',
    'This device has to fetch your record once before you study on it. Open this again while online.'],
  'study-first-sync-ended': ['サーバーがこの端末のペアリングを受け付けませんでした。設定でペアリングを消し、新しいコードでもう一度ペアリングしてください。',
    'The server did not accept this device’s pairing. In Settings, forget the pairing and pair again with a new code.'],
  'study-first-sync-blocked': ['この Bunki では、あなたの記録の一部をまだ読めません（ほかの端末で作ったカードなど）。記録はそのままです。この端末ではまだ学習できません。',
    'This Bunki cannot read part of your record yet (for example cards made on another device). Your record is unchanged; this device cannot study on it yet.'],
  'study-first-sync-update': ['この Bunki は学習サーバーより古いため、記録を受け取れません。先に Bunki を更新してください。',
    'This Bunki is older than the study server, so it cannot fetch your record. Update Bunki first.'],
});
/** A refusal the study screen can say in plain words (decks/player/shared-mount.mjs reads `bunkiLine`). */
function hostError(code, detail = null) {
  const error = new Error(code);
  error.code = code;
  if (detail) error.detail = detail;
  if (Object.hasOwn(LINES, code)) error.bunkiLine = LINES[code];
  return error;
}

/** The engine's sync client takes an https origin only. A stand-in server on this machine (tests) is plain http, so
 * for a loopback address alone the client is given the https form of the same address and its requests are carried
 * to the real one; every answer is handed back under the address the client asked for. Whatever the address, a
 * request for any other origin is refused here, so the credential cannot leave for anywhere else. */
export function studyTransportBridge(server, fetchFn) {
  if (!isStudyServer(server) || typeof fetchFn !== 'function') throw hostError('study-pairing-malformed');
  if (!isLoopbackServer(server)) {
    return { origin: server, fetch: (url, init) => (typeof url === 'string' && url.startsWith(`${server}/`) ? fetchFn(url, init) : Promise.reject(new Error('study-origin-refused'))) };
  }
  const alias = server.replace(/^http:/, 'https:');
  return {
    origin: alias,
    async fetch(url, init) {
      if (typeof url !== 'string' || !url.startsWith(`${alias}/`)) throw new Error('study-origin-refused');
      const real = server + url.slice(alias.length);
      const response = await fetchFn(real, init);
      return { status: response.status, headers: response.headers, body: response.body, redirected: response.redirected === true,
        url: response.url === real ? url : response.url };
    },
  };
}

/** Resolves when `promise` settles or `ms` have gone by, whichever is first; a refusal inside the time is thrown. */
function settledWithin(promise, ms) {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(resolve, ms); if (typeof timer?.unref === 'function') timer.unref(); });
  promise.catch(() => {});
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** Open the host for the pairing this device keeps. Rejects `study-pairing-missing` when it keeps none. */
export async function openPairedStudyHost(options = {}) {
  const env = options.env ?? globalThis;
  const {
    store = createStudyCredentialStore(env),
    fetch: fetchFn = env.fetch?.bind(env),
    storageFactory = createSharedStudyStorage,
    locks = env.navigator?.locks,
    now = Date.now,
    presentation = env.matchMedia?.('(max-width: 600px)')?.matches ? 'phone' : 'desktop',
    timeoutMs = 15000,
    openWaitMs = 8000,
    sync: syncOptions = {},
  } = options;
  let kept;
  try { kept = await store.read(); } catch { throw hostError('study-storage-failed'); }
  const device = kept.device;
  if (!device) throw hostError('study-pairing-missing');
  const scope = device.scope, server = device.server;
  if (!STUDY_INSTALLATION.test(scope.installation) || !isStudyServer(server)) throw hostError('study-pairing-malformed');
  let token = device.ended ? null : kept.token;
  if (token !== null) { try { checkStudyCredential(token, scope); } catch { token = null; } }
  let ended = token === null;
  const bridge = studyTransportBridge(server, fetchFn);
  const listeners = new Set();
  const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* an observer cannot undo anything */ } } };

  /** The server refused the credential: it is dropped here and on the device, once, and nothing more is asked. */
  async function endPairing() {
    if (ended) return;
    ended = true; token = null;
    try { await store.end({ at: now() }); } catch { /* this page knows; the next page finds out the same way */ }
    notify();
  }

  /** New-card permits come from the server alone. */
  async function reservePermits(count, requestId, policy) {
    if (ended || token === null) throw new Error('authentication-required');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchFn(`${server}/v1/permits`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...compatibilityHeaders(), Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scope, count, requestId, ...(policy === undefined ? {} : { policy }) }),
        credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
    } catch { throw new Error('network-failed'); } finally { clearTimeout(timer); }
    if (response.status === 401) { await endPairing(); throw new Error('authentication-required'); }
    if (response.status === 426) throw new Error('update-required');
    if (response.status === 409) throw new Error('conflict');
    if (response.status === 429 || response.status >= 500) throw new Error('retry-later');
    if (response.status !== 200) throw new Error('server-failed');
    let body;
    try { body = await response.json(); } catch { throw new Error('invalid-response'); }
    if (!body?.grant || !Number.isSafeInteger(body.head) || body.head < 0 || !body.scope ||
        ['environment', 'learner', 'installation'].some((key) => body.scope[key] !== scope[key])) throw new Error('invalid-response');
    return body;
  }

  let disposed = false, binding = null, active = null, activeStorage = null, session = null, stopWatch = null;

  function openSession() {
    const next = createSharedStudySync({
      ...syncOptions,
      origin: bridge.origin,
      getCredential: () => token,
      fetch: bridge.fetch,
      now,
      permits: { isPaired: () => !ended, reserve: reservePermits },
    });
    const stop = next.subscribeSyncState(() => {
      if (next.getSyncError() === 'authentication-required') void endPairing();
      notify();
    });
    return { next, stop };
  }
  async function closeBinding(adapter, storage, sync, stop) {
    try { stop?.(); } catch { /* observer cleanup */ }
    try { sync?.dispose(); await sync?.drain(); } catch { /* the failure that brought us here is the one reported */ }
    try { disposeSharedStudyAudioPreparation(adapter); } catch { /* cleanup cannot replace the failure */ }
    try { await adapter?.disposeAudioPacks?.(); } catch { /* same */ }
    try { await adapter?.backend?.dispose(); } catch { /* same */ }
    try { await storage?.close?.(); } catch { /* same */ }
  }

  async function bind(callback) {
    if (disposed) throw hostError('study-host-disposed');
    // re-read under the lock: another page of this origin may have unpaired or paired again meanwhile
    let current;
    try { current = (await store.read()).device; } catch { throw hostError('study-storage-failed'); }
    if (!current) throw hostError('study-pairing-missing');
    if (current.scope.installation !== scope.installation || current.scope.learner !== scope.learner) throw hostError('study-pairing-changed');
    const storage = await storageFactory({ databaseName: pairedReplicaName(scope.installation) });
    const { next: sync, stop } = openSession();
    const open = (mode) => callback(Object.freeze({ storage, now, presentation, transport: sync, ...sync.hooks,
      identity: Object.freeze({ learner: scope.learner, environment: scope.environment, installation: scope.installation, mode }) }));
    let adapter = null;
    try {
      if (current.phase === 'ready') {
        try { adapter = await open('open'); }
        catch (error) { throw error?.message === 'missing-store' ? hostError('study-replica-missing') : error; }
      } else {
        // an earlier first open may have made the store and then failed before the record arrived
        try { adapter = await open('fresh'); }
        catch (error) { if (error?.message !== 'installation-exists') throw error; adapter = await open('open'); }
      }
      if (!adapter || typeof adapter !== 'object') throw hostError('study-adapter-required');
      if (disposed) throw hostError('study-host-disposed');
      const first = sync.attach(adapter);
      if (current.phase === 'ready') {
        // an ordinary open waits a bounded time for the newest record, then opens on what this device has; the sync
        // goes on behind the screen and the screen says where it stands
        await settledWithin(first, openWaitMs);
      } else {
        let result = await first;
        for (let round = 0; round < 40 && !result?.error && result?.state === 'pending'; round++) result = await sync.synchronize();
        if (result?.state !== 'up-to-date') {
          const cause = result?.error || result?.state || 'unknown';
          throw hostError(ended || cause === 'authentication-required' ? 'study-first-sync-ended' : cause === 'update-required' ? 'study-first-sync-update'
            : cause === 'blocked' ? 'study-first-sync-blocked' : 'study-first-sync', cause);
        }
        await store.markReady();
      }
      if (disposed) throw hostError('study-host-disposed');
      active = adapter; activeStorage = storage; session = sync; stopWatch = stop;
      notify();
      return adapter;
    } catch (error) {
      await closeBinding(adapter, storage, sync, stop);
      throw error;
    }
  }

  const host = Object.freeze({
    kind: PAIRED_HOST_KIND,
    identity: Object.freeze({ learner: scope.learner, environment: scope.environment, installation: scope.installation }),
    /** shared-study-runtime.mjs calls this once; the host creates the one adapter of this page and owns its sync. */
    withAdapter(callback) {
      if (typeof callback !== 'function') return Promise.reject(hostError('study-adapter-required'));
      if (binding) return binding;
      const run = () => bind(callback);
      const guarded = locks && typeof locks.request === 'function' ? locks.request(`${pairedReplicaName(scope.installation)}:open`, run) : run();
      binding = Promise.resolve(guarded).catch((error) => { binding = null; throw error; });
      return binding;
    },
    /** What Settings may show of this page's sync. Never the credential or the server's address. */
    status: () => ({ started: !!active, ended, state: session ? session.getSyncState() : 'idle', error: session ? session.getSyncError() : null }),
    subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('study-host-listener');
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    synchronize: () => (session ? session.synchronize() : Promise.resolve({ state: 'idle', error: 'study-host-not-started', retryAt: null })),
    /** Stop syncing and let go of the store. The paired copy of the record stays on the device. */
    async dispose() {
      if (disposed) return;
      disposed = true;
      try { await binding; } catch { /* a failed open has already cleaned up */ }
      const [adapter, storage, sync, stop] = [active, activeStorage, session, stopWatch];
      active = null; activeStorage = null; session = null; stopWatch = null;
      await closeBinding(adapter, storage, sync, stop);
      listeners.clear();
    },
  });
  return host;
}
