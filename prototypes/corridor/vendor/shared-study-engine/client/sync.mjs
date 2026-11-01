import {SYNC_COMPATIBILITY,compatibilityHeaders} from './sync-compatibility.mjs';
/** Foreground-only single-flight transport. Credentials never enter persistent state. */
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const copy = value => structuredClone(value);
const scopeKey = scope => JSON.stringify([scope?.environment, scope?.learner, scope?.installation]);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const CODES = new Set(['invalid-config', 'authentication-required', 'scope-mismatch', 'invalid-response', 'network-failed',
  'server-failed', 'update-required', 'conflict', 'retry-later', 'store-failed', 'request-limit']);
class SyncError extends Error {
  constructor(code, retryAt = null) { super(CODES.has(code) ? code : 'invalid-response'); this.code = this.message; this.retryAt = retryAt; }
}
const check = (ok, code) => { if (!ok) throw new SyncError(code); };
export function createSyncTransport({ store, origin, getCredential, compatibility=SYNC_COMPATIBILITY, fetch: request = globalThis.fetch,
  now = Date.now, wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  maxRetries = 2, maxPasses = 8, maxDelayMs = 30000, maxResponseBytes = 1024 * 1024,
  requestTimeoutMs = 15000, maxRequestBytes = 256 * 1024 } = {}) {
  try { const parsed = new URL(origin); check(parsed.protocol === 'https:' && parsed.origin === origin && !parsed.username && !parsed.password, 'invalid-config'); }
  catch { throw new SyncError('invalid-config'); }
  check(store && typeof getCredential === 'function' && typeof request === 'function' && integer(maxRetries) && maxRetries <= 5 &&
    integer(maxPasses) && maxPasses > 0 && maxPasses <= 100 && integer(maxDelayMs) && maxDelayMs > 0 && integer(maxResponseBytes) && maxResponseBytes > 0 &&
    integer(requestTimeoutMs) && requestTimeoutMs > 0 && requestTimeoutMs <= 30000 && integer(maxRequestBytes) && maxRequestBytes > 0, 'invalid-config');
  let capability;try{capability=compatibilityHeaders(compatibility);}catch{throw new SyncError('invalid-config');}
  const scope = copy(store.scope);
  check(scope && Object.keys(scope).length === 3 && ['environment', 'learner', 'installation'].every(k => typeof scope[k] === 'string' && ID.test(scope[k]) && !/^nsrs_/i.test(scope[k])), 'invalid-config');
  let flight = null;
  let authPaused = false;
  let retryAt = 0;
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
  const retryDelay = (response, attemptIndex) => {
    const header = response?.headers?.get('Retry-After');
    if (header) {
      if (/^\d+$/.test(header)) return Number(header) * 1000;
      const timestamp = Date.parse(header);
      if (Number.isFinite(timestamp)) return Math.max(0, timestamp - now());
    }
    return Math.min(1000 * 2 ** attemptIndex, maxDelayMs);
  };
  const send = async (url, body = null) => {
    const encodedBody = body === null ? undefined : JSON.stringify(body);
    for (let attemptIndex = 0; attemptIndex <= maxRetries; attemptIndex++) {
      let response;
      let delay;
      try {
        const credential = await getCredential();
        check(typeof credential === 'string' && /^[\x21-\x7e]{1,2048}$/.test(credential), 'authentication-required');
        const controller = new AbortController();
        let timer;
        const init = { method: body === null ? 'GET' : 'POST', body: encodedBody,
          headers: { ...capability, Authorization: 'Bearer ' + credential, ...(body === null ? {} : { 'Content-Type': 'application/json' }) },
          redirect: 'error', cache: 'no-store', credentials: 'omit', signal: controller.signal };
        try {
          response = await new Promise((resolve, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(Error('request-timeout')); }, requestTimeoutMs);
            Promise.resolve().then(() => request(url, init)).then(resolve, reject);
          });
        } finally { clearTimeout(timer); }
      } catch (error) {
        if (error instanceof SyncError) throw error;
        if (attemptIndex === maxRetries) throw new SyncError('network-failed');
        delay = retryDelay(null, attemptIndex);
      }
      if (response) {
        check(!response.redirected && response.url === url, 'invalid-response');
        if (response.status === 401) throw new SyncError('authentication-required');
        if (response.status === 426) throw new SyncError('update-required');
        if (response.status === 409) throw new SyncError('conflict');
        if (response.status === 429 || response.status >= 500) {
          delay = retryDelay(response, attemptIndex);
          check(Number.isFinite(delay) && delay >= 0 && delay <= Number.MAX_SAFE_INTEGER - now(), 'invalid-response');
          if (attemptIndex === maxRetries || delay > maxDelayMs) throw new SyncError('retry-later', now() + delay);
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
  const pull = async () => {
    for (let pageIndex = 0; pageIndex < maxPasses; pageIndex++) {
      const before = await store.status();
      const reply = await send(origin + '/v1/events?after=' + before.applied + '&limit=1000');
      check(Array.isArray(reply.events) && integer(reply.head), 'invalid-response');
      await store.reconcile({ events: reply.events, head: reply.head });
      const after = await store.status();
      if (after.applied >= reply.head || after.blocked?.reason !== 'gap' || after.applied === before.applied) return;
    }
    throw new SyncError('request-limit');
  };
  const run = async () => {
    if (authPaused) return { state: 'paused-auth', error: 'authentication-required', retryAt: null };
    if (retryAt > now()) return { state: 'backoff', error: 'retry-later', retryAt };
    state = { state: 'syncing', error: null, retryAt: null };
    try {
      if ((await store.status()).blocked?.reason === 'update-required') {
        state = { state: 'blocked', error: 'update-required', retryAt: null };
        return copy(state);
      }
      await pull();
      const beforeBatch = await store.status();
      if (beforeBatch.blocked && beforeBatch.blocked.reason !== 'gap') {
        state = { state: 'blocked', error: null, retryAt: null };
        return copy(state);
      }
      const available = await store.outbox(500);
      const batch = [];
      for (const record of available) {
        if (new TextEncoder().encode(JSON.stringify({ scope, events: [...batch, record] })).byteLength > maxRequestBytes) break;
        batch.push(record);
      }
      check(available.length === 0 || batch.length > 0, 'request-limit');
      if (batch.length) {
        const reply = await send(origin + '/v1/events', { scope, events: batch });
        check(Array.isArray(reply.acks) && reply.acks.length === batch.length && integer(reply.head), 'invalid-response');
        const expected = new Map(batch.map(record => [record.event.id, record.bodyHash]));
        check(reply.acks.every(ack => expected.get(ack.id) === ack.bodyHash) && new Set(reply.acks.map(ack => ack.id)).size === batch.length, 'invalid-response');
        await store.acknowledge({ acks: reply.acks, head: reply.head });
        // Ack is not applied. Pull from the actual contiguous cursor, never reply.head.
        await pull();
      }
      const status = await store.status();
      state = { state: status.upToDate ? 'up-to-date' : status.blocked ? 'blocked' : 'pending', error: null, retryAt: null };
    } catch (error) {
      const code = error instanceof SyncError ? error.code : 'store-failed';
      if (code === 'authentication-required') authPaused = true;
      retryAt = error instanceof SyncError && error.retryAt !== null ? error.retryAt : 0;
      state = { state: code === 'update-required' ? 'update-required' : authPaused ? 'paused-auth' : retryAt > now() ? 'backoff' : 'error', error: code, retryAt: retryAt || null };
    }
    return copy(state);
  };
  return Object.freeze({
    sync() {
      if (!flight) flight = run().then(result => { state = result; return copy(result); }).finally(() => { flight = null; });
      return flight;
    },
    status() { return copy(state); },
    resumeAfterPairing() { authPaused = false; state = { state: 'idle', error: null, retryAt: null }; },
  });
}
