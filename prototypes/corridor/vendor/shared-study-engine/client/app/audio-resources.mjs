/** Bounded transport adapters for the shared audio resource contract v1.
 *
 * A capability names an immutable release root; this module only moves exact
 * bytes for refs the release reader has transitively admitted from that
 * verified root. It performs no synthesis, no provider networking and keeps no
 * credentials. The public capability object exposes only `read`/`packState`;
 * admission lives in a module-private WeakMap so callers cannot grant
 * themselves file or URL authority.
 */
const PROTOCOL = 'nsrs-audio-resources/v1';
const ROOT_LIMIT = 64 * 1024;
const READ_LIMIT = 2 * 1024 * 1024;
const HEX = /^[0-9a-f]{64}$/;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const PACK_STATES = new Set(['verified-local', 'missing', 'incomplete', 'nonpersistent']);

function tagged(code, message) {
  const error = Error(message);
  error.audioCode = code;
  return error;
}
const integrity = message => tagged('integrity', message);
const unsupported = message => tagged('unsupported', message);
const offline = message => tagged('offline', message);

const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function exactRecord(value, names, label) {
  if (!isPlain(value)) throw integrity(`${label}-object`);
  const own = Reflect.ownKeys(value);
  if (own.length !== names.length || own.some(key => typeof key !== 'string')) {
    throw integrity(`${label}-keys`);
  }
  for (const name of names) {
    if (!Object.hasOwn(value, name)) throw integrity(`${label}-missing`);
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw integrity(`${label}-accessor`);
  }
  for (const key of own) {
    if (!names.includes(key)) throw integrity(`${label}-unknown`);
  }
  return value;
}

function exactArray(value, label, limit) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw integrity(`${label}-array`);
  }
  if (value.length > limit) throw integrity(`${label}-bound`);
  if (Reflect.ownKeys(value).length !== value.length + 1) throw integrity(`${label}-dense`);
  return value;
}

function nonempty(value) {
  if (typeof value !== 'string' || value.length === 0) throw integrity('string');
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw integrity('string-surrogate');
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw integrity('string-surrogate');
  }
  return value;
}

function safeKey(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return false;
  if (/[\\:%?#]/.test(value) || value.startsWith('/')) return false;
  const parts = value.split('/');
  return parts.every(part => part.length > 0 && part !== '.' && part !== '..' &&
    /^[A-Za-z0-9_.-]+$/.test(part));
}

function copyRef(ref, {max, label = 'ref'} = {}) {
  const fields = exactRecord(ref, ['key', 'sha256', 'bytes'], label);
  if (!safeKey(fields.key)) throw integrity(`${label}-key`);
  if (typeof fields.sha256 !== 'string' || !HEX.test(fields.sha256)) {
    throw integrity(`${label}-sha256`);
  }
  if (!Number.isSafeInteger(fields.bytes) || fields.bytes < 1 || fields.bytes > max) {
    throw integrity(`${label}-bytes`);
  }
  return Object.freeze({key: fields.key, sha256: fields.sha256, bytes: fields.bytes});
}

function validateRelease(release) {
  const fields = exactRecord(release, ['releaseId', 'projectionId', 'contentRelease', 'root'], 'release');
  const root = copyRef(fields.root, {max: ROOT_LIMIT, label: 'root'});
  if (root.key !== 'root.json') throw integrity('root-key');
  if (typeof fields.releaseId !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(fields.releaseId)) {
    throw integrity('release-id');
  }
  if (fields.releaseId !== `sha256:${root.sha256}`) throw integrity('release-id-root');
  return Object.freeze({
    releaseId: fields.releaseId,
    projectionId: nonempty(fields.projectionId),
    contentRelease: nonempty(fields.contentRelease),
    root,
  });
}

function validateResources(resources) {
  const fields = exactRecord(resources, ['read', 'packState'], 'resources');
  if (typeof fields.read !== 'function' || typeof fields.packState !== 'function') {
    throw unsupported('resources-methods');
  }
  return resources;
}

/** Validate a capability without trusting any mutable release/root field later.
 * Unknown fields, non-scope protocols, a release id that does not name the
 * bytes of `root.json`, and an over-long root all reject. The returned value is
 * a frozen release snapshot plus the live resources adapter: `read` stays
 * late-bound for host tests and lifecycle code.
 */
export function validateAudioCapability(capability) {
  if (!isPlain(capability)) throw unsupported('capability-object');
  const fields = exactRecord(capability, ['protocol', 'release', 'resources'], 'capability');
  if (fields.protocol !== PROTOCOL) throw unsupported('capability-protocol');
  const release = validateRelease(fields.release);
  const resources = validateResources(fields.resources);
  return Object.freeze({protocol: PROTOCOL, release, resources});
}

function responseUrlOk(response, expected) {
  const value = response?.url;
  if (typeof value !== 'string' || value.length === 0) return true;
  return value === expected;
}

async function readBounded(response, limit) {
  if (!response || !response.ok || response.redirected) throw offline('response');
  let declared = NaN;
  try {
    declared = Number(response.headers?.get?.('content-length'));
  } catch { /* Header access is optional. */ }
  if (Number.isFinite(declared) && declared > limit) throw offline('response-too-large');
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > limit) throw offline('response-too-large');
    return new Uint8Array(buffer);
  }
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > limit) {
        try { await reader.cancel(); } catch { /* Bounded rejection wins. */ }
        throw offline('response-too-large');
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* Nothing else to release. */ }
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return bytes;
}

const ADMISSION = new WeakMap();

function makeResources({prefix, fetchImpl, packState, rootRef}) {
  const admitted = new Map([[rootRef.key, rootRef]]);

  function admit(refs) {
    if (!Array.isArray(refs)) throw integrity('admit-refs');
    for (const raw of refs) {
      const ref = copyRef(raw, {max: READ_LIMIT, label: 'admit-ref'});
      const known = admitted.get(ref.key);
      if (known) {
        if (known.sha256 !== ref.sha256 || known.bytes !== ref.bytes) {
          throw integrity('ref-conflict');
        }
        continue;
      }
      admitted.set(ref.key, ref);
    }
  }

  async function read(raw, {signal} = {}) {
    const ref = copyRef(raw, {max: READ_LIMIT, label: 'read-ref'});
    const known = admitted.get(ref.key);
    if (!known || known.sha256 !== ref.sha256 || known.bytes !== ref.bytes) {
      throw integrity('ref-unadmitted');
    }
    if (signal?.aborted) throw tagged('cancelled', 'resource-aborted');
    if (typeof fetchImpl !== 'function') throw offline('fetch-unavailable');
    let response;
    try {
      response = await fetchImpl(`${prefix}${ref.key}`, {
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        ...(signal ? {signal} : {}),
      });
    } catch (error) {
      if (signal?.aborted) throw tagged('cancelled', 'resource-aborted');
      throw offline('network');
    }
    if (signal?.aborted) throw tagged('cancelled', 'resource-aborted');
    if (!response || !response.ok || response.redirected) throw offline('response');
    if (!responseUrlOk(response, `${prefix}${ref.key}`)) throw offline('response-origin');
    try {
      const bytes = await readBounded(response, READ_LIMIT);
      if (signal?.aborted) throw tagged('cancelled', 'resource-aborted');
      return bytes;
    } catch (error) {
      if (signal?.aborted) throw tagged('cancelled', 'resource-aborted');
      if (error?.audioCode) throw error;
      throw offline('response');
    }
  }

  const capability = Object.freeze({read, packState});
  ADMISSION.set(capability, {admit});
  return capability;
}

function parseHttpOrigin(value) {
  let url;
  try { url = new URL(String(value)); } catch { throw unsupported('origin-url'); }
  const loopback = url.protocol === 'http:' && LOOPBACK.has(url.hostname);
  if (url.protocol !== 'https:' && !loopback) throw unsupported('origin-protocol');
  if (!url.hostname) throw unsupported('origin-host');
  if (url.username || url.password) throw unsupported('origin-credentials');
  if (url.pathname !== '/' || url.search || url.hash) throw unsupported('origin-path');
  return url.origin;
}

function localBase(digest) {
  return `nihongo-qa://localhost/audio/v2/${digest}/`;
}

/** Exact HTTPS transport (HTTP loopback only) under the release namespace. */
export function createHttpAudioResources({origin, release, fetch: fetchImpl = globalThis.fetch?.bind(globalThis)} = {}) {
  const snapshot = validateRelease(release);
  const cleanOrigin = parseHttpOrigin(origin);
  const prefix = `${cleanOrigin}/audio/v2/${snapshot.root.sha256}/`;
  return makeResources({
    prefix,
    fetchImpl,
    packState: async () => 'nonpersistent',
    rootRef: snapshot.root,
  });
}

/** Native local transport under the fixed `nihongo-qa://localhost` base. */
export function createLocalAudioResources({base, release, fetch: fetchImpl = globalThis.fetch?.bind(globalThis), packState} = {}) {
  const snapshot = validateRelease(release);
  const expected = localBase(snapshot.root.sha256);
  if (typeof base !== 'string' || base !== expected) throw unsupported('local-base');
  let url;
  try { url = new URL(base); } catch { throw unsupported('local-base'); }
  if (url.protocol !== 'nihongo-qa:' || url.hostname !== 'localhost' ||
      url.username || url.password || url.pathname !== `/audio/v2/${snapshot.root.sha256}/` ||
      url.search || url.hash) {
    throw unsupported('local-base');
  }
  const callback = typeof packState === 'function' ? packState : null;
  return makeResources({
    prefix: expected,
    fetchImpl,
    packState: async packId => {
      if (typeof packId !== 'string' || packId.length === 0) return 'missing';
      if (!callback) return 'nonpersistent';
      try {
        const state = await callback(packId);
        return PACK_STATES.has(state) ? state : 'nonpersistent';
      } catch {
        return 'nonpersistent';
      }
    },
    rootRef: snapshot.root,
  });
}

/** Module-internal bridge: only a verified release reader may widen transport
 * admission. This is intentionally not a method on the public capability, and
 * it does nothing for host-supplied resources objects. */
export function admitAudioResourceRefs(resources, refs) {
  const entry = ADMISSION.get(resources);
  if (!entry) return false;
  entry.admit(refs);
  return true;
}
