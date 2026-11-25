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
 *
 * A host belongs to one pairing: the row it opened, by installation and generation. It stops being a host the
 * moment that pairing is no more, however it learns of it:
 *   - the server refuses the credential (401, a revocation or another origin): the pairing has ended. The mark page
 *     start reads is written at once, then the row (tried again if the write fails), and no further request is made;
 *   - another tab of this browser forgets the pairing or makes another one: the tabs are told over a channel and by
 *     the marks changing, and a tab that heard nothing still checks the stored row against the one it opened before
 *     every request and every answer.
 * A host that has stopped drops the credential from memory, stops syncing, and refuses every answer in plain words:
 * nothing is saved into a copy of the record that can never be sent. What was already waiting on the device stays
 * there, counted, and is not deleted. Nothing here schedules, merges or migrates anything; the engine does. */
import { createSharedStudyStorage } from './shared-study-storage.mjs';
import { createSharedStudySync } from './shared-study-sync.mjs';
import { disposeSharedStudyAudioPreparation } from './shared-study-audio-preparation.mjs';
import { compatibilityHeaders } from './vendor/shared-study-engine/client/sync-compatibility.mjs';
import { STUDY_CLOSED_LINES, STUDY_INSTALLATION, announceStudyPairing, checkStudyCredential, createStudyCredentialStore, isLiveStudyDevice,
  isLoopbackServer, isStudyServer, studyEndedMark, studyRowRef, watchStudyPairing } from './shared-study-pairing.mjs';

export const PAIRED_HOST_KIND = 'bunki-paired-study/v1';
export const pairedReplicaName = (installation) => `bunki-shared-study-paired-${installation}`;
/** The engine's own entry points that write an answer, or another change of the learner's, into the record. */
const WRITES = ['submitCommand', 'resumeCommand', 'mutate', 'capture', 'practice', 'addNewToday', 'setNewTodayTotal', 'createManualCard'];

const LINES = Object.freeze({
  ...STUDY_CLOSED_LINES,
  'study-pairing-missing': ['この端末のペアリングが見つかりません。Nihongo Study からもう一度接続してください。', 'This device’s pairing was not found. Connect it again from Nihongo Study.'],
  'study-storage-failed': ['このブラウザーの保存領域を読めませんでした。ページを読み込み直してください。', 'This browser’s storage could not be read. Reload the page.'],
  'study-replica-missing': ['この端末にあるはずの学習記録の写しが見つかりません。設定で接続を解除し、Nihongo Study からもう一度接続してください。',
    'This device’s copy of the study record is missing. In Settings, disconnect, then connect again from Nihongo Study.'],
  'study-first-sync': ['この端末は、学習の前に一度あなたの記録を受け取る必要があります。オンラインでもう一度開いてください。',
    'This device has to fetch your record once before you study on it. Open this again while online.'],
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

/** Open the host for the pairing this device keeps. Rejects `study-pairing-missing` when it keeps none and
 * `study-pairing-ended` when the one it keeps has ended: an ended pairing is never bound. */
export async function openPairedStudyHost(options = {}) {
  const env = options.env ?? globalThis;
  const {
    store = createStudyCredentialStore(env),
    endedMark = studyEndedMark(env),
    announce = () => announceStudyPairing(env),
    fetch: fetchFn = env.fetch?.bind(env),
    storageFactory = createSharedStudyStorage,
    locks = env.navigator?.locks,
    now = Date.now,
    presentation = env.matchMedia?.('(max-width: 600px)')?.matches ? 'phone' : 'desktop',
    timeoutMs = 15000,
    openWaitMs = 8000,
    endRetryMs = [250, 1000, 4000],
    sync: syncOptions = {},
  } = options;
  let kept;
  try { kept = await store.read(); } catch { throw hostError('study-storage-failed'); }
  const device = kept.device;
  if (!device) throw hostError('study-pairing-missing');
  const scope = device.scope, server = device.server, ref = studyRowRef(device);
  if (!STUDY_INSTALLATION.test(scope.installation) || !isStudyServer(server)) throw hostError('study-pairing-malformed');
  let token = kept.token;
  if (token !== null) { try { checkStudyCredential(token, scope); } catch { token = null; } }
  if (!isLiveStudyDevice(device, endedMark.get()) || token === null) {
    // the server refused this pairing on an earlier page and the row could not be written then: write it now
    if (!device.ended && endedMark.get()?.by === 'server') { try { await store.end(ref, { at: now(), unsent: null }); } catch { /* the mark stands */ } }
    throw hostError('study-pairing-ended');
  }
  const bridge = studyTransportBridge(server, fetchFn);
  const listeners = new Set();
  const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* an observer cannot undo anything */ } } };
  const wait = (ms) => new Promise((resolve) => { const timer = setTimeout(resolve, ms); if (typeof timer?.unref === 'function') timer.unref(); });

  let disposed = false, binding = null, active = null, activeStorage = null, session = null, stopSession = null;
  /** Why this host has stopped, or null while it is the pairing's host; and what was still unsent when it ended. */
  let closed = null, unsent = null, ending = null;
  /** When a sync of this page last left the record up to date, and when that was last written to the pairing's row
   * (at most once a minute: Settings on a page that has not opened study reads it from there). */
  let syncedAt = null, keptSyncedAt = 0;
  const noteSynced = () => {
    syncedAt = now();
    if (typeof store.synced !== 'function' || syncedAt - keptSyncedAt < 60000) return;
    keptSyncedAt = syncedAt;
    void store.synced(ref, { at: syncedAt }).catch(() => { keptSyncedAt = 0; });
  };

  /** Stop being a host: the credential leaves memory, sync stops, every answer is refused from here on. */
  function shut(code) {
    if (closed) return;
    closed = code; token = null;
    try { session?.dispose(); } catch { /* the session is gone either way */ }
    notify();
  }

  /** The server refused the credential. The pairing has ended: this page knows at once, the mark page start reads
   * is written at once, and the row is written with what was still unsent, tried again if the write fails. */
  function endPairing(adapter = active) {
    ending ??= finishEnding(adapter);
    return ending;
  }

  async function finishEnding(adapter) {
    if (closed) return;
    // a refusal that comes back after this pairing was replaced on the device ends nothing: the row and the marks
    // are another pairing's by then, and this host just stops
    let current;
    try { current = (await store.read()).device; } catch { current = undefined; }
    if (closed) return;
    if (current !== undefined && !(current && current.scope.installation === ref.installation && current.generation === ref.generation)) { shut('study-pairing-changed'); return; }
    endedMark.set(ref.installation, 'server');
    shut('study-pairing-ended');
    // what was still waiting to be sent: the answers among it (the copy also queues records that are not answers)
    // The transport exposes one upload window. The retained journal also has
    // later answers and records already acknowledged by the server.
    if (adapter) {
      try {
        const journal = await adapter.store.readState({ requireCompatible: true });
        unsent = Object.values(journal.local).filter((row) => row.ackedSeq === null && row.event.type === 'review').length;
      } catch { unsent = null; }
    }
    notify();
    announce();
    for (const pause of [0, ...endRetryMs]) {
      if (pause) await wait(pause);
      try { await store.end(ref, { at: now(), unsent }); break; } catch { /* tried again; the mark already stands */ }
    }
  }

  /** Is the stored row still the pairing this host opened? Asked when another tab says something changed, and before
   * every request and every answer, so a tab that heard nothing finds out before it acts. A storage failure is not
   * a change. */
  async function verify() {
    if (closed) return false;
    let current;
    try { current = (await store.read()).device; } catch { return true; }
    if (closed) return false;
    const mark = endedMark.get();
    const mine = !!current && current.scope.installation === ref.installation && current.generation === ref.generation;
    if (mine && isLiveStudyDevice(current, mark)) return true;
    shut(mine && (current.ended?.by ?? mark?.by) === 'server' ? 'study-pairing-ended' : 'study-pairing-changed');
    return false;
  }

  /** New-card permits come from the server alone. */
  async function reservePermits(count, requestId, policy) {
    if (!(await verify()) || token === null) throw new Error('authentication-required');
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

  function openSession(currentAdapter) {
    const next = createSharedStudySync({
      ...syncOptions,
      origin: bridge.origin,
      // the credential is handed out only while the stored row is still this host's pairing
      getCredential: async () => ((await verify()) ? token : null),
      fetch: bridge.fetch,
      now,
      permits: { isPaired: () => closed === null, reserve: reservePermits },
    });
    const stop = next.subscribeSyncState(() => {
      if (next.getSyncError() === 'authentication-required' && closed === null) void endPairing(currentAdapter());
      if (next.getSyncState() === 'up-to-date' && !next.getSyncError() && closed === null) noteSynced();
      notify();
    });
    return { next, stop };
  }
  async function closeBinding(adapter, storage, sync, stop) {
    try { stop?.(); } catch { /* observer cleanup */ }
    try { sync?.dispose(); await sync?.drain(); } catch { /* the failure that brought us here is the one reported */ }
    try { disposeSharedStudyAudioPreparation(adapter); } catch { /* cleanup cannot replace the failure */ }
    try { await adapter?.disposeAudioPacks?.(); } catch { /* same */ }
    // A denial on startup can precede publication of the adapter. Keep its
    // store open until the diagnostic on that exact replica has settled.
    if (ending) await ending.catch(() => {});
    try { await adapter?.backend?.dispose(); } catch { /* same */ }
    try { await storage?.close?.(); } catch { /* same */ }
  }

  /** The adapter the page gets: the engine's own, with every entry point that writes an answer asking first whether
   * this is still the pairing's host. Once it is not, the answer is refused in plain words and nothing is saved. */
  function guarded(adapter) {
    const asking = (run) => async (...args) => {
      if (!(await verify())) throw hostError('study-answer-not-saved');
      return run(...args);
    };
    const backend = Object.freeze({ ...adapter.backend,
      ...Object.fromEntries(WRITES.filter((name) => typeof adapter.backend[name] === 'function').map((name) => [name, asking(adapter.backend[name])])) });
    return Object.freeze({ ...adapter, backend, submit: (intent) => backend.submitCommand(intent), resume: (intent) => backend.resumeCommand(intent) });
  }

  async function bind(callback) {
    if (disposed) throw hostError('study-host-disposed');
    // asked again under the lock: another page of this origin may have unpaired or paired again meanwhile
    if (!(await verify())) throw hostError(closed);
    let current;
    try { current = (await store.read()).device; } catch { throw hostError('study-storage-failed'); }
    if (!current || current.scope.installation !== ref.installation || current.generation !== ref.generation) { shut('study-pairing-changed'); throw hostError(closed); }
    const storage = await storageFactory({ databaseName: pairedReplicaName(scope.installation) });
    let adapter = null;
    const { next: sync, stop } = openSession(() => adapter);
    const open = (mode) => callback(Object.freeze({ storage, now, presentation, transport: sync, ...sync.hooks,
      identity: Object.freeze({ learner: scope.learner, environment: scope.environment, installation: scope.installation, mode }) }));
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
        // the server refused the credential before the record arrived (revoked, a token from another origin, a ledger
        // restored without its origin): the pairing has ended, which no new try online can change, and says so
        if (!closed && result?.error === 'authentication-required') await endPairing(adapter);
        if (closed) throw hostError(closed);
        if (result?.state !== 'up-to-date') {
          const cause = result?.error || result?.state || 'unknown';
          throw hostError(cause === 'update-required' ? 'study-first-sync-update' : cause === 'blocked' ? 'study-first-sync-blocked' : 'study-first-sync', cause);
        }
        // only this pairing's own row is marked: a pairing made meanwhile is left as it is, unfetched
        if (!(await store.markReady(ref))) { shut('study-pairing-changed'); throw hostError(closed); }
      }
      if (disposed) throw hostError('study-host-disposed');
      if (closed) throw hostError(closed);
      active = adapter; activeStorage = storage; session = sync; stopSession = stop;
      notify();
      return guarded(adapter);
    } catch (error) {
      await closeBinding(adapter, storage, sync, stop);
      throw error;
    }
  }

  const stopWatch = watchStudyPairing(env, () => { void verify(); });

  const host = Object.freeze({
    kind: PAIRED_HOST_KIND,
    identity: Object.freeze({ learner: scope.learner, environment: scope.environment, installation: scope.installation }),
    /** shared-study-runtime.mjs calls this once; the host creates the one adapter of this page and owns its sync. */
    withAdapter(callback) {
      if (typeof callback !== 'function') return Promise.reject(hostError('study-adapter-required'));
      if (closed) return Promise.reject(hostError(closed));
      if (binding) return binding;
      const run = () => bind(callback);
      const held = locks && typeof locks.request === 'function' ? locks.request(`${pairedReplicaName(scope.installation)}:open`, run) : run();
      binding = Promise.resolve(held).catch((error) => { binding = null; throw error; });
      return binding;
    },
    /** What Settings may show of this page's host. `closed` is why it stopped (`study-pairing-ended`,
     * `study-pairing-changed`) or null; `unsent` is what was still waiting when the server ended the pairing. Never
     * the credential or the server's address. */
    status: () => ({ started: !!active, ended: closed !== null, closed, state: session ? session.getSyncState() : 'idle',
      error: session ? session.getSyncError() : null, unsent, syncedAt }),
    subscribe(listener) {
      if (typeof listener !== 'function') throw new Error('study-host-listener');
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** Ask now whether this is still the pairing's host. */
    verify,
    /** Sync now. A host that has stopped, before or during the call, answers as a refused credential does. */
    async synchronize() {
      const stopped = { state: 'paused-auth', error: 'authentication-required', retryAt: null };
      if (closed) return stopped;
      const result = session ? await session.synchronize() : { state: 'idle', error: 'study-host-not-started', retryAt: null };
      return closed ? stopped : result;
    },
    flushBeforeClose: () => session?.flushBeforeClose() ?? Promise.resolve(false),
    /** Stop syncing and let go of the store. The paired copy of the record stays on the device. */
    async dispose() {
      if (disposed) return;
      disposed = true;
      stopWatch();
      try { await binding; } catch { /* a failed open has already cleaned up */ }
      const [adapter, storage, sync, stop] = [active, activeStorage, session, stopSession];
      active = null; activeStorage = null; session = null; stopSession = null;
      await closeBinding(adapter, storage, sync, stop);
      listeners.clear();
    },
  });
  return host;
}
