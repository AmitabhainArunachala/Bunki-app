'use strict';

const { randomUUID } = require('node:crypto');
const { Buffer } = require('node:buffer');
const { setTimeout, clearTimeout } = require('node:timers');
const { SyncCoordinator, ReplicationStoreError, parseSyncBinding } = require('./native-rpc-session.cjs');
const { launchNativeCloudSync } = require('./native-cloud-sync.cjs');
const { isAppURL } = require('./navigation-policy.cjs');

const STORE_CODES = new Set(['invalid-request', 'closed', 'reopen-required', 'stale-revision',
  'checkpoint-conflict', 'change-identity-conflict', 'local-actor-conflict', 'sequence-exhausted',
  'corrupt-store', 'unsupported-schema', 'policy-mismatch']);
const RECORD_CODES = new Set([...STORE_CODES, 'writer-required', 'session-changed', 'source-changed',
  'source-verification-failed', 'storage-failure', 'recovery-required', 'legacy-record-diverged',
  'legacy-record-unreadable', 'legacy-archive-diverged', 'legacy-drift-diverged', 'legacy-drift-unreadable',
  'activation-stores-disagree', 'migration-binding-mismatch', 'unsupported-migration', 'custody-inconsistent',
  'custody-unavailable', 'drift-migration-required', 'drift-state-unavailable', 'archive-unavailable',
  'archive-changed', 'prepared-generation-diverged', 'partial-fences', 'fence-awaits-activation',
  'binding-mismatch', 'busy', 'batch-too-large', 'refresh-failed', 'invalid-response',
  'invalid-source', 'invalid-source-options', 'invalid-target', 'invalid-migration-id', 'invalid-drift-text',
  'incomplete-source', 'inconsistent-source', 'unsupported-archive', 'unsupported-drift-state',
  'unsupported-legacy-drift', 'unsupported-legacy-record', 'drift-source-required', 'drift-state-required',
  'drift-root-conflict', 'noncanonical-drift-state', 'migration-conflict', 'target-occupied',
  'source-changed-before-prepare', 'reserved-migration-data']);
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const sameBinding = (a, b) => ['accountId', 'learnerId', 'sessionId'].every((key) => a?.[key] === b?.[key]);
const failure = (code) => Object.assign(new Error('Record sync: ' + code), { code });
const fixedCode = (error) => typeof error?.code === 'string' && /^[a-z][a-z0-9-]{0,63}$/u.test(error.code)
  ? error.code : 'sync-failed';
function bounded(value, limit) {
  let text;
  try { text = JSON.stringify(value); } catch { throw failure('invalid-response'); }
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > limit) throw failure('batch-too-large');
  return value;
}

/** One renderer document owns one local-store registration. Registering IDs
 * does not authenticate them. The trusted native UI may explicitly pair that
 * candidate; only its captured child lease can attach to the native owner. */
function createRecordSyncHost({ window, owner, origin, configuration, canConnect,
  configurationCode = 'setup-required', launch = launchNativeCloudSync, storeTimeoutMs = 30000 }) {
  const contents = window.webContents;
  let registration = null;
  let closed = false;
  let uncertainDocument = null;
  function latchUncertain(slot) {
    slot.storageUncertain = true;
    uncertainDocument = { frame: slot.frame, token: slot.frameToken };
  }
  function sameDocument(slot) {
    try {
      const frame = contents.mainFrame;
      return !closed && registration === slot && !window.isDestroyed() && !contents.isDestroyed()
        && !contents.isLoadingMainFrame() && window.webContents === contents && !frame.detached
        && frame === slot.frame && frame.frameToken === slot.frameToken && frame.parent === null
        && frame.top === frame && frame.origin === origin && isAppURL(frame.url, origin)
        && isAppURL(contents.getURL(), origin);
    } catch { return false; }
  }
  function requireSlot(input) {
    if (!exact(input, ['registrationId']) || typeof input.registrationId !== 'string') throw failure('invalid-request');
    const slot = registration;
    if (!slot || input.registrationId !== slot.id || !sameDocument(slot)) throw failure('stale-session');
    return slot;
  }
  function rejectStorage(slot, code) {
    for (const pending of slot.pending.values()) {
      if (pending.method !== 'snapshot') latchUncertain(slot);
      clearTimeout(pending.timer);
      pending.reject(new ReplicationStoreError(code));
    }
    slot.pending.clear();
  }
  function disconnectSlot(slot, code = null) {
    if (!slot) return;
    // Revoke local authority before touching the asynchronous native control
    // channel. Submitted IndexedDB transactions still settle in their owner.
    slot.connectAbort?.abort();
    slot.connectAbort = null;
    slot.coordinator?.cancel();
    slot.coordinator = null;
    slot.session = null;
    const lease = slot.lease;
    slot.lease = null;
    if (lease && slot.onRevoke) lease.revocationSignal.removeEventListener('abort', slot.onRevoke);
    slot.onRevoke = null;
    owner.revoke('native-revoked');
    try { lease?.revoke(); } catch { /* Local authority is already fenced. */ }
    rejectStorage(slot, 'closed');
    slot.state = slot.storageUncertain ? 'error' : configuration ? 'disconnected' : 'unavailable';
    slot.code = slot.storageUncertain ? 'reopen-required' : code;
  }
  function drop() {
    const slot = registration;
    registration = null;
    disconnectSlot(slot);
  }
  function currentSession(slot) {
    if (!sameDocument(slot) || !slot.session || !slot.lease || slot.lease.revocationSignal.aborted) return false;
    try { return slot.session.assertCurrent(slot.session.capture()); } catch { return false; }
  }
  function statusFor(slot) {
    if (slot.session && !currentSession(slot)) disconnectSlot(slot, 'native-revoked');
    return { state: slot.state, ...(slot.code ? { code: slot.code } : {}) };
  }
  function requestStore(slot, method, request) {
    if (!currentSession(slot)) return Promise.reject(failure('stale-session'));
    if (slot.pending.size >= 4) return Promise.reject(failure('busy'));
    const requestId = randomUUID();
    const envelope = bounded({ registrationId: slot.id, requestId, method,
      ...(method === 'snapshot' ? {} : { request }) }, 8 * 1024 * 1024);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // A missing reply to a write is an uncertain result, never a retryable
        // revision race. The existing controller must recover before reuse.
        slot.pending.delete(requestId);
        latchUncertain(slot);
        reject(new ReplicationStoreError('reopen-required'));
        disconnectSlot(slot, 'reopen-required');
      }, storeTimeoutMs);
      timer.unref();
      slot.pending.set(requestId, { method, resolve, reject, timer });
      try { slot.frame.send('bunki:sync:store-request', envelope); }
      catch { clearTimeout(timer); slot.pending.delete(requestId); reject(failure('stale-session')); }
    });
  }
  function receiveStoreReply(input) {
    const slot = registration;
    if (!slot || !sameDocument(slot) || !exact(input, ['registrationId', 'requestId', 'response']) ||
        input.registrationId !== slot.id) return;
    const pending = slot.pending.get(input.requestId);
    if (!pending) return;
    slot.pending.delete(input.requestId);
    clearTimeout(pending.timer);
    try {
      if (!currentSession(slot)) throw failure('stale-session');
      const response = bounded(input.response, pending.method === 'snapshot' ? 32 * 1024 * 1024 : 8 * 1024 * 1024);
      if (response?.ok === false) {
        if (!exact(response, ['ok', 'error']) || !response.error ||
            !(exact(response.error, ['code']) || exact(response.error, ['code', 'targetCommitDurable'])) ||
            !RECORD_CODES.has(response.error.code) ||
            (Object.hasOwn(response.error, 'targetCommitDurable') && typeof response.error.targetCommitDurable !== 'boolean'))
          throw failure('invalid-response');
        if (response.error.targetCommitDurable === true || response.error.code === 'reopen-required') latchUncertain(slot);
        if (slot.storageUncertain) throw new ReplicationStoreError('reopen-required');
        if (STORE_CODES.has(response.error.code)) throw new ReplicationStoreError(response.error.code);
        throw failure(response.error.code);
      }
      if (!exact(response, ['ok', 'value']) || response.ok !== true) throw failure('invalid-response');
      if (pending.method === 'snapshot' && (!sameBinding(response.value?.policy?.binding, slot.binding) ||
          !Array.isArray(response.value.documents) || response.value.documents.length !== 0)) throw failure('binding-mismatch');
      pending.resolve(response.value);
    } catch (error) { pending.reject(error); }
  }
  async function register(input) {
    if (closed || !exact(input, ['binding'])) throw failure('invalid-request');
    let binding;
    try { binding = parseSyncBinding(input.binding); } catch { throw failure('invalid-request'); }
    drop();
    const frame = contents.mainFrame;
    const storageUncertain = uncertainDocument?.frame === frame && uncertainDocument.token === frame.frameToken;
    const slot = { id: randomUUID(), binding, frame, frameToken: frame.frameToken, pending: new Map(),
      state: storageUncertain ? 'error' : configuration ? 'disconnected' : 'unavailable',
      code: storageUncertain ? 'reopen-required' : configuration ? null : configurationCode,
      connectAbort: null, session: null, lease: null, onRevoke: null, coordinator: null, storageUncertain };
    registration = slot;
    if (!sameDocument(slot)) { drop(); throw failure('stale-session'); }
    return { registrationId: slot.id };
  }
  async function connect(input) {
    const slot = requireSlot(input);
    if (!configuration) return statusFor(slot);
    if (slot.storageUncertain) return { state: 'error', code: 'reopen-required' };
    if (slot.state === 'connecting' || slot.state === 'syncing') return { state: slot.state, code: 'busy' };
    if (currentSession(slot)) return statusFor(slot);
    if (!canConnect()) return { state: 'error', code: 'user-action-required' };
    disconnectSlot(slot);
    const abort = new AbortController();
    slot.connectAbort = abort;
    slot.state = 'connecting';
    slot.code = null;
    let lease;
    try {
      const ticket = owner.beginDocument();
      lease = await launch({ configuration, binding: slot.binding, signal: abort.signal });
      if (abort.signal.aborted || slot.connectAbort !== abort || !sameDocument(slot) ||
          !sameBinding(lease.binding, slot.binding) || lease.revocationSignal.aborted) throw failure('stale-session');
      const session = owner.attach(ticket, lease);
      if (!sameBinding(session.capture().binding, slot.binding)) throw failure('binding-mismatch');
      slot.lease = lease;
      slot.session = session;
      slot.onRevoke = () => disconnectSlot(slot, 'native-revoked');
      lease.revocationSignal.addEventListener('abort', slot.onRevoke, { once: true });
      if (!currentSession(slot)) throw failure('stale-session');
      slot.coordinator = new SyncCoordinator({ session, store: {
        snapshot: () => requestStore(slot, 'snapshot'),
        commitReceive: (request) => requestStore(slot, 'commitReceive', request),
        acknowledgeOutbox: (request) => requestStore(slot, 'acknowledgeOutbox', request),
      } });
      slot.state = 'ready';
      return statusFor(slot);
    } catch (error) {
      try { lease?.revoke(); } catch { /* Refused lease never grants a session. */ }
      if (registration === slot && slot.connectAbort === abort) {
        disconnectSlot(slot, fixedCode(error));
        return { state: 'error', code: fixedCode(error) };
      }
      return { state: 'error', code: 'stale-session' };
    } finally {
      if (slot.connectAbort === abort) slot.connectAbort = null;
    }
  }
  async function sync(input) {
    const slot = requireSlot(input);
    if (slot.storageUncertain) return { state: 'error', code: 'reopen-required' };
    if (slot.state === 'syncing' || slot.state === 'connecting') return { state: slot.state, code: 'busy' };
    if (!currentSession(slot)) { disconnectSlot(slot, 'session-required'); return statusFor(slot); }
    if (!canConnect()) return { state: 'error', code: 'user-action-required' };
    const coordinator = slot.coordinator;
    const session = slot.session;
    const lease = slot.lease;
    const ownsCycle = () => sameDocument(slot) && slot.coordinator === coordinator
      && slot.session === session && slot.lease === lease;
    slot.state = 'syncing';
    slot.code = null;
    try {
      const result = await coordinator.syncOnce();
      if (!ownsCycle() || !currentSession(slot)) throw failure('stale-session');
      slot.state = 'ready';
      return { state: 'ready', result };
    } catch (error) {
      const code = fixedCode(error);
      if (ownsCycle()) {
        if (!currentSession(slot) || slot.storageUncertain) disconnectSlot(slot, code);
        else { slot.state = 'ready'; slot.code = code; }
      }
      return { state: 'error', code };
    }
  }
  function capturePairingCandidate() {
    const slot = registration;
    if (!slot || !currentSession(slot)) throw failure('session-required');
    const lease = slot.lease;
    // Matches NativeSyncProfile.exportCandidate()'s canonical ASCII key order.
    // These logical IDs contain no native lease or account authentication.
    const bytes = Buffer.from(JSON.stringify({ accountId: slot.binding.accountId,
      format: 'kairo-native-profile-candidate', label: configuration.profileLabel,
      learnerId: slot.binding.learnerId, version: 1 }), 'utf8');
    if (bytes.length > 4096) throw failure('batch-too-large');
    return Object.freeze({ bytes, assertCurrent: () => slot.lease === lease && currentSession(slot) });
  }
  function navigation(details) {
    if (details.isMainFrame === true && details.isSameDocument === false) drop();
  }
  function close() {
    if (closed) return;
    closed = true;
    drop();
    contents.off('did-start-navigation', navigation);
    contents.off('render-process-gone', drop);
    contents.off('destroyed', close);
    window.off('closed', close);
  }
  contents.on('did-start-navigation', navigation);
  contents.on('render-process-gone', drop);
  contents.once('destroyed', close);
  window.once('closed', close);
  return Object.freeze({ register, connect, sync, receiveStoreReply, capturePairingCandidate,
    status: (input) => statusFor(requireSlot(input)),
    disconnect: (input) => { const slot = requireSlot(input); disconnectSlot(slot); return statusFor(slot); },
    unregister: (input) => { requireSlot(input); drop(); return { state: 'disconnected' }; }, close });
}

/** No raw IPC or renderer-selected methods reach the native helper. */
function installRecordSyncIPC({ ipcMain, fromApp, active }) {
  for (const method of ['register', 'unregister', 'status', 'connect', 'sync', 'disconnect']) {
    ipcMain.handle('bunki:sync:' + method, (event, ...args) => {
      if (!fromApp(event)) throw failure('frame-forbidden');
      if (args.length !== 1 || !active()) throw failure('invalid-request');
      bounded(args[0], 16384);
      return active()[method](args[0]);
    });
  }
  ipcMain.on('bunki:sync:store-reply', (event, ...args) => {
    if (!fromApp(event) || args.length !== 1) return;
    active()?.receiveStoreReply(args[0]);
  });
}

module.exports = { createRecordSyncHost, installRecordSyncIPC };
