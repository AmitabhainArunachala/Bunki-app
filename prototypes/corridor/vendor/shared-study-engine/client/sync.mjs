import {SYNC_COMPATIBILITY,compatibilityHeaders} from './sync-compatibility.mjs';
/** Foreground sync and best-effort close upload share admission to the event endpoint. */
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const copy = value => structuredClone(value);
const scopeKey = scope => JSON.stringify([scope?.environment, scope?.learner, scope?.installation]);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const CODES = new Set(['invalid-config', 'authentication-required', 'scope-mismatch', 'invalid-response', 'network-failed',
  'server-failed', 'update-required', 'conflict', 'retry-later', 'store-failed', 'request-limit', 'host-paused']);
class SyncError extends Error {
  constructor(code, retryAt = null) { super(CODES.has(code) ? code : 'invalid-response'); this.code = this.message; this.retryAt = retryAt; }
}
const check = (ok, code) => { if (!ok) throw new SyncError(code); };
export function createSyncTransport({ store, origin, getCredential, compatibility=SYNC_COMPATIBILITY, fetch: request = globalThis.fetch,
  now = Date.now, wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  canContinue = () => true, canFlushOnClose = () => false, yieldTurn = () => new Promise(resolve => setTimeout(resolve, 50)),
  maxRetries = 2, maxPasses = 8, maxDelayMs = 30000, maxResponseBytes = 1024 * 1024,
  requestTimeoutMs = 15000, maxRequestBytes = 256 * 1024 } = {}) {
  try { const parsed = new URL(origin); check(parsed.protocol === 'https:' && parsed.origin === origin && !parsed.username && !parsed.password, 'invalid-config'); }
  catch { throw new SyncError('invalid-config'); }
  check(store && typeof getCredential === 'function' && typeof request === 'function' && typeof canContinue === 'function' && typeof canFlushOnClose === 'function' && typeof yieldTurn === 'function' && integer(maxRetries) && maxRetries <= 5 &&
    integer(maxPasses) && maxPasses > 0 && maxPasses <= 100 && integer(maxDelayMs) && maxDelayMs > 0 && integer(maxResponseBytes) && maxResponseBytes > 0 &&
    integer(requestTimeoutMs) && requestTimeoutMs > 0 && requestTimeoutMs <= 30000 && integer(maxRequestBytes) && maxRequestBytes > 0, 'invalid-config');
  let capability;try{capability=compatibilityHeaders(compatibility);}catch{throw new SyncError('invalid-config');}
  const scope = copy(store.scope);
  check(scope && Object.keys(scope).length === 3 && ['environment', 'learner', 'installation'].every(k => typeof scope[k] === 'string' && ID.test(scope[k]) && !/^nsrs_/i.test(scope[k])), 'invalid-config');
  let flight = null, closeFlight = null;
  let closeGeneration = 0, foregroundUploadDispatched = false;
  let reconciling = false;
  let authPaused = false;
  let retryAt = 0, serverRetryAt = 0;
  let state = { state: 'idle', error: null, retryAt: null };
  const parseBody = async response => {
    check(response.body && typeof response.body.getReader === 'function', 'invalid-response');
    const reader = response.body.getReader(); const chunks = []; let length = 0;
    let timer;
    const deadline = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        Promise.resolve(reader.cancel()).catch(() => {});
        reject(new SyncError('invalid-response'));
      }, requestTimeoutMs);
    });
    try {
      await Promise.race([deadline, (async () => {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          check(value instanceof Uint8Array && length + value.byteLength <= maxResponseBytes, 'invalid-response');
          length += value.byteLength; chunks.push(value);
        }
      })()]);
    } finally { clearTimeout(timer); Promise.resolve(reader.cancel()).catch(() => {}); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new SyncError('invalid-response'); }
  };
  const retryDelay = attemptIndex => Math.min(1000 * 2 ** attemptIndex, maxDelayMs);
  const retryDeadline = (response, receivedAt) => {
    const header = response.headers?.get('Retry-After');
    if (!header) return null;
    if (/^\d+$/.test(header)) return receivedAt + Number(header) * 1000;
    const timestamp = Date.parse(header);
    return Number.isFinite(timestamp) ? Math.max(receivedAt, timestamp) : null;
  };
  const send = async (url, body = null, { keepalive = false, uploadGeneration = closeGeneration, prefixCurrent, onDispatch } = {}) => {
    const encodedBody = body === null ? undefined : JSON.stringify(body);
    const retries = keepalive ? 0 : maxRetries;
    const allowed = keepalive ? canFlushOnClose : canContinue;
    for (let attemptIndex = 0; attemptIndex <= retries; attemptIndex++) {
      check(allowed(), 'host-paused');
      let response;
      let delay;
      try {
        const credential = await getCredential();
        check(typeof credential === 'string' && /^[\x21-\x7e]{1,2048}$/.test(credential), 'authentication-required');
        check(allowed(), 'host-paused');
        const controller = new AbortController();
        let timer;
        const init = { method: body === null ? 'GET' : 'POST', body: encodedBody,
          headers: { ...capability, Authorization: 'Bearer ' + credential, ...(body === null ? {} : { 'Content-Type': 'application/json' }) },
          redirect: 'error', cache: 'no-store', credentials: 'omit', signal: controller.signal, ...(keepalive ? { keepalive: true } : {}) };
        try {
          response = await new Promise((resolve, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(Error('request-timeout')); }, requestTimeoutMs);
            Promise.resolve().then(() => {
              check(allowed(), 'host-paused');
              if (retryAt > now()) throw new SyncError('retry-later', retryAt);
              if (keepalive) {
                check(!authPaused && !reconciling && prefixCurrent(), 'host-paused');
                closeGeneration++;
                onDispatch?.();
              }
              else if (body !== null) {
                check(!closeFlight && uploadGeneration === closeGeneration, 'host-paused');
                foregroundUploadDispatched = true;
              }
              return request(url, init);
            }).then(resolve, reject);
          });
        } finally { clearTimeout(timer); }
      } catch (error) {
        if (error instanceof SyncError) throw error;
        if (attemptIndex === retries) throw new SyncError('network-failed');
        if (body !== null && !keepalive) foregroundUploadDispatched = false;
        delay = retryDelay(attemptIndex);
      }
      if (response) {
        check(!response.redirected && response.url === url, 'invalid-response');
        if (response.status === 401) throw new SyncError('authentication-required');
        if (response.status === 426) throw new SyncError('update-required');
        if (response.status === 409) throw new SyncError('conflict');
        if (response.status === 429 || response.status >= 500) {
          const receivedAt = now();
          const deadline = retryDeadline(response, receivedAt);
          delay = deadline === null ? retryDelay(attemptIndex) : deadline - receivedAt;
          check(Number.isFinite(delay) && delay >= 0 && delay <= Number.MAX_SAFE_INTEGER - receivedAt, 'invalid-response');
          if (deadline !== null) {
            serverRetryAt = Math.max(serverRetryAt, deadline);
            retryAt = Math.max(retryAt, serverRetryAt);
          }
          if (attemptIndex === retries || delay > maxDelayMs) {
            throw new SyncError('retry-later', receivedAt + delay);
          }
          if (body !== null && !keepalive) foregroundUploadDispatched = false;
        } else {
          check(response.status === 200, 'server-failed');
          const result = await parseBody(response);
          check(result && scopeKey(result.scope) === scopeKey(scope) && Object.keys(result.scope).length === 3, 'scope-mismatch');
          return result;
        }
      }
      await wait(delay);
    }
  };
  // A turn remains bounded. Only advancing an ordinary canonical gap earns
  // continuation; a stalled/unsupported prefix must not become a retry loop.
  const pullTurn = async targetHead => {
    for (let pageIndex = 0; pageIndex < maxPasses; pageIndex++) {
      if (!canContinue()) return {kind:'paused',targetHead};
      const before = await store.status();
      const reply = await send(origin + '/v1/events?after=' + before.applied + '&limit=1000');
      check(Array.isArray(reply.events) && integer(reply.head), 'invalid-response');
      targetHead ??= reply.head;
      if (reply.events.length || reply.head !== before.head || before.blocked) {
        reconciling = true;
        try { await store.reconcile({ events: reply.events, head: reply.head }); }
        finally { reconciling = false; }
      }
      const after = await store.status();
      if (after.blocked?.reason !== 'gap' || after.applied === before.applied) return {kind:'settled'};
      if (after.applied >= reply.head) return {kind:'settled'};
      // Remote writers may keep increasing head. Finish this finite target,
      // defer that newer tail, and never upload/reserve against the remaining gap.
      if (after.applied >= targetHead) return {kind:'new-head',targetHead};
    }
    return {kind:'productive-gap',targetHead};
  };
  const pull = async () => {
    let result = await pullTurn(null);
    while (result.kind === 'productive-gap') {
      await yieldTurn();
      result = await pullTurn(result.targetHead);
    }
    return result;
  };
  const pendingPull = result => ({state:'pending',error:null,retryAt:null,
    catchUp:{reason:result.kind,targetHead:result.targetHead ?? null}});
  function selectBatch(available, limit) {
    const batch = [];
    const encode = new TextEncoder();
    let bytes = encode.encode(JSON.stringify({ scope, events: [] })).byteLength;
    for (const record of available) {
      const size = encode.encode(JSON.stringify(record)).byteLength + (batch.length ? 1 : 0);
      if (bytes + size > limit) break;
      bytes += size;
      batch.push(record);
    }
    return batch;
  }
  async function sendBeforeClose(onDispatch) {
    if (reconciling || typeof store.subscribe !== 'function') return false;
    let changed = false;
    const unsubscribe = store.subscribe(() => { changed = true; });
    // Let normal sync pull and verify the durable IDs after reopening. A
    // closing tab may stop before it sees the response or can write to IDB.
    try {
      const available = await store.outbox(500, { requireCurrentPrefix: true });
      const batch = selectBatch(available, Math.min(maxRequestBytes, 60 * 1024));
      if (!batch.length || changed) return false;
      await send(origin + '/v1/events', { scope, events: batch }, { keepalive: true, prefixCurrent: () => !changed, onDispatch });
    }
    catch (error) { if (error?.code === 'host-paused') return false; throw error; }
    finally { unsubscribe(); }
    return true;
  }
  const run = async () => {
    const uploadGeneration = closeGeneration;
    if (authPaused) return { state: 'paused-auth', error: 'authentication-required', retryAt: null };
    if (retryAt > now()) return { state: 'backoff', error: 'retry-later', retryAt };
    state = { state: 'syncing', error: null, retryAt: null };
    try {
      if ((await store.status()).blocked?.reason === 'update-required') {
        state = { state: 'blocked', error: 'update-required', retryAt: null };
        return copy(state);
      }
      const pulled = await pull();
      if (pulled.kind !== 'settled') { state = pendingPull(pulled); return copy(state); }
      if (!canContinue()) { state = pendingPull({kind:'paused'}); return copy(state); }
      const beforeBatch = await store.status();
      if (beforeBatch.blocked) {
        state = { state: 'blocked', error: null, retryAt: null };
        return copy(state);
      }
      const available = await store.outbox(500);
      const batch = selectBatch(available, maxRequestBytes);
      check(available.length === 0 || batch.length > 0, 'request-limit');
      if (batch.length) {
        try {
          const reply = await send(origin + '/v1/events', { scope, events: batch }, { uploadGeneration });
          check(Array.isArray(reply.acks) && reply.acks.length === batch.length && integer(reply.head), 'invalid-response');
          const expected = new Map(batch.map(record => [record.event.id, record.bodyHash]));
          check(reply.acks.every(ack => expected.get(ack.id) === ack.bodyHash) && new Set(reply.acks.map(ack => ack.id)).size === batch.length, 'invalid-response');
          await store.acknowledge({ acks: reply.acks, head: reply.head });
        } finally { foregroundUploadDispatched = false; }
        // Ack is not applied. Pull from the actual contiguous cursor, never reply.head.
        const pulled = await pull();
        if (pulled.kind !== 'settled') { state = pendingPull(pulled); return copy(state); }
      }
      const status = await store.status();
      state = { state: status.upToDate ? 'up-to-date' : status.blocked ? 'blocked' : 'pending', error: null, retryAt: null };
    } catch (error) {
      const code = error instanceof SyncError ? error.code : 'store-failed';
      if (code === 'host-paused') { state = pendingPull({kind:'paused'}); return copy(state); }
      if (code === 'authentication-required') authPaused = true;
      retryAt = Math.max(retryAt > now() ? retryAt : 0, error instanceof SyncError ? error.retryAt ?? 0 : 0);
      state = { state: code === 'update-required' ? 'update-required' : authPaused ? 'paused-auth' : retryAt > now() ? 'backoff' : 'error', error: code, retryAt: retryAt || null };
    }
    return copy(state);
  };
  function sync() {
    if (closeFlight) return closeFlight.catch(() => {}).then(sync);
    if (!flight) flight = run().then(result => { state = result; return copy(result); }).finally(() => { flight = null; });
    return flight;
  }
  return Object.freeze({
    sync,
    flushOnClose(onDispatch) {
      if (closeFlight) return closeFlight;
      if (!canFlushOnClose() || foregroundUploadDispatched || authPaused || retryAt > now()) return Promise.resolve(false);
      closeFlight = sendBeforeClose(onDispatch).finally(() => { closeFlight = null; });
      return closeFlight;
    },
    canCheckContent() { return !authPaused && serverRetryAt <= now(); },
    status() { return copy(state); },
    resumeAfterPairing() { authPaused = false; state = { state: 'idle', error: null, retryAt: null }; },
  });
}
