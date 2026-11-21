/** Study pairing: this browser as one study device of a learner's Nihongo Study record (ENGINE-ONE.3).
 *
 * A study device holds a bearer credential for the Nihongo Study server. An admin mints a 12-character pairing code
 * for one named installation of one learner (`bunkiweb-<32 hex>` for this app); the device presents the code with
 * that scope (`POST /v1/pair`, the call the engine's own pairing client makes) and is answered with the scope and
 * the credential. The installation is the admin's to name: this device never makes one up. This module is the part
 * that needs no study engine: the credential's place on this device, the pairing and unpairing steps, what tells
 * the other tabs of this browser, and the block Settings shows beside the voice pairing.
 * shared-study-paired-host.mjs turns a kept credential into the bound host; shared-study-boot.mjs decides at page
 * start whether there is one.
 *
 * The server's address is not in this code (this repository is public and the server is the learner's own). It is the
 * address the voice client keeps on this device, or, on a device that knows none yet, the one the pasted pairing line
 * carries, under the voice client's own rule for what a server address is. A pairing line that names any other server
 * than the one this device is set up for is refused before anything is sent.
 *
 * The credential: kept for this origin only, in IndexedDB database `bunki-study-device`, sealed with an AES-GCM key
 * this browser will not export. It is never put in localStorage, a cookie or a URL, never logged, never returned by
 * the Settings block, and sent only as the Authorization header of requests to the server it was redeemed from.
 * The speak-only voice token is another credential in another database and is never read here.
 *
 * localStorage holds two marks and no credential, because page start needs an answer before IndexedDB can give one:
 *   `bunki-shared-study:paired:v1` = "1"                      this device holds a pairing
 *   `bunki-shared-study:ended:v1`  = "<installation>|<by>"    that pairing has ended: the server refused it
 *                                                              (`server`) or the learner is forgetting it (`learner`)
 * A pairing named by the second mark is never bound again, whatever IndexedDB still holds.
 *
 * One pairing is one row, named by its installation and a generation made when it is written. Every change to the
 * row names the row it means and leaves any other row alone: a page that still holds an earlier pairing cannot end,
 * ready or remove a later one. */
import { isVoiceServer } from './modules/voice-client.mjs';

export const PAIRED_MARKER = 'bunki-shared-study:paired:v1';
export const ENDED_MARKER = 'bunki-shared-study:ended:v1';
export const PAIRING_CHANNEL = 'bunki-study-pairing';
/** A full study device of the Bunki web app. `bunki-<32 hex>` is a speak-only voice install and is refused. */
export const STUDY_INSTALLATION = /^bunkiweb-[a-f0-9]{32}$/;
const LOCAL_HTTPS = /^https:\/\/(?:127\.0\.0\.1|localhost):\d{1,5}$/;
/** A study server is what a voice server is (the learner's Worker over https, or a plain-http stand-in on this
 * machine for tests), or this machine over https, which is how the Nihongo Study repository's own local server answers. */
export const isStudyServer = (value) => isVoiceServer(value) || (typeof value === 'string' && value.length <= 200 && LOCAL_HTTPS.test(value));
/** The plain-http stand-in: the one address the engine's https-only sync client has to be carried to. */
export const isLoopbackServer = (value) => typeof value === 'string' && /^http:\/\/(?:127\.0\.0\.1|localhost):\d{1,5}$/.test(value);
const isLocalServer = (value) => isLoopbackServer(value) || (typeof value === 'string' && LOCAL_HTTPS.test(value));

const CODE = /^[A-F0-9]{12}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TOKEN = /^nsrs_(dev|prod)_([A-Za-z0-9_-]{4,512})\.([a-f0-9]{64})$/;
const ENVIRONMENTS = new Set(['prod', 'dev', 'qa']);
const PHASES = new Set(['allocated', 'ready']);
const FORMAT = 'bunki-study-device/v1';
const FIRST_GENERATION = 'first';
const DATABASE = 'bunki-study-device', STORE = 'pairing', DEVICE = 'device', ADDRESS = 'server', PROBE = 'probe';
const VOICE_DATABASE = 'bunki-voice', VOICE_STORE = 'pairing', VOICE_ADDRESS = 'server';

const validScope = (scope) => !!scope && typeof scope === 'object' && Object.keys(scope).length === 3 &&
  ['environment', 'learner', 'installation'].every((key) => typeof scope[key] === 'string' && ID.test(scope[key]) && !/^nsrs_/i.test(scope[key]));

/** The server's token names its own scope. One that names another scope, or is not a device token, is refused. */
export function checkStudyCredential(token, scope) {
  const match = typeof token === 'string' && token.length <= 2048 ? TOKEN.exec(token) : null;
  if (!match || !validScope(scope) || match[1] !== (scope.environment === 'prod' ? 'prod' : 'dev')) throw new Error('invalid-credential');
  let tuple;
  try {
    const encoded = match[2].replace(/-/g, '+').replace(/_/g, '/');
    tuple = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
  } catch { throw new Error('invalid-credential'); }
  if (!Array.isArray(tuple) || tuple.length !== 3 || tuple[0] !== scope.environment || tuple[1] !== scope.learner || tuple[2] !== scope.installation) throw new Error('scope-mismatch');
  return token;
}

/** What the learner gives: the pairing line in the first box and, when it came apart from the line, the 12-character
 * code in the second. A line carries labelled parts in any order: "… code: XXXXXXXXXXXX · learner: <id> · device:
 * <installation> · server: <address> · environment: <prod|dev|qa>"; the installation is also taken when it stands
 * by itself. Resolves { code, learner, installation }, with `server` and `environment` only when the text named
 * them. A code with no installation cannot pair (`pairing-line-required`); an installation of another kind, such as
 * a speak-only voice install, is not a study device (`not-a-study-device`). */
export function parseStudyPairing(input) {
  const bad = { error: 'invalid-pairing' };
  if (!input || typeof input !== 'object') return bad;
  let first = typeof input.learner === 'string' ? input.learner : '';
  let second = typeof input.code === 'string' ? input.code : '';
  if (first.length + second.length > 1000) return bad;
  let server = null, environment = null, installation = null;
  const take = (pattern) => {
    const found = pattern.exec(`${first}\n${second}`);
    if (!found) return null;
    const text = found[0].replace(/^\n/u, '');
    first = first.replace(text, ' ');
    second = second.replace(text, ' ');
    return found[1];
  };
  const address = take(/server:\s*(\S+)/i);
  if (address !== null) {
    server = address.replace(/[·,;.)\]]+$/u, '').replace(/\/+$/u, '');
    if (!isStudyServer(server)) return bad;
  }
  const named = take(/(?:environment|env):\s*([A-Za-z0-9._-]+)/i);
  if (named !== null) {
    environment = named.replace(/[.]+$/u, '');
    if (!ENVIRONMENTS.has(environment)) return bad;
  }
  // the installation the code was minted for, labelled or standing by itself; taken before the code is looked for
  installation = take(/(?:installation|device):\s*([A-Za-z0-9][A-Za-z0-9._-]*)/i) ??
    take(/(?:^|[^A-Za-z0-9._-])((?:bunkiweb|bunki|iphone)-[a-f0-9]{32})(?![A-Za-z0-9._-])/);
  if (installation !== null) installation = installation.replace(/[.]+$/u, '');
  let learner, code;
  const printed = take(/learner:\s*([A-Za-z0-9][A-Za-z0-9._-]*)/i);
  if (printed !== null) {
    learner = printed.replace(/[.]+$/u, '');
    // the code where it stands whole in what was pasted; otherwise what the second box holds, as it was typed
    code = /(?:^|[^A-Za-z0-9])([A-Fa-f0-9]{12})(?![A-Za-z0-9])/.exec(`${first} ${second}`)?.[1] || second;
  } else {
    learner = first.trim();
    code = second;
    const line = /^(\S+)\s+(\S.*)$/.exec(learner);
    if (line && !code.trim()) { learner = line[1]; code = line[2]; }
  }
  code = code.replace(/[\s-]+/gu, '').toUpperCase();
  if (!CODE.test(code) || !ID.test(learner) || /^nsrs_/i.test(learner)) return bad;
  if (installation === null) return { error: 'pairing-line-required' };
  if (!STUDY_INSTALLATION.test(installation)) return { error: 'not-a-study-device' };
  return { code, learner, installation, ...(server ? { server } : {}), ...(environment ? { environment } : {}) };
}

/** Open a database only if this origin already has it. Opening by name alone would create an empty one, and an
 * empty `bunki-voice` would break the voice client's own open. Resolves null when there is none. */
function openExisting(idb, name) {
  return new Promise((resolve, reject) => {
    let request, absent = false;
    try { request = idb.open(name); } catch (error) { reject(error); return; }
    request.onupgradeneeded = () => { absent = true; try { request.transaction.abort(); } catch { /* the open fails below */ } };
    request.onsuccess = () => { if (absent) { try { request.result.close(); } catch { /* closed */ } resolve(null); } else resolve(request.result); };
    request.onerror = (event) => { event?.preventDefault?.(); if (absent) resolve(null); else reject(request.error || new Error('open-failed')); };
    request.onblocked = () => reject(new Error('blocked'));
  });
}
const transact = (db, store, mode, work) => new Promise((resolve, reject) => {
  const tx = db.transaction(store, mode);
  const out = work(tx.objectStore(store));
  tx.oncomplete = () => resolve(Array.isArray(out) ? out.map((request) => request.result) : out?.result);
  tx.onerror = tx.onabort = () => reject(tx.error || new Error('aborted'));
});

/** The voice server's address as the voice client keeps it on this device (modules/voice-client.mjs: database
 * `bunki-voice`, store `pairing`, key `server`). An address, not a credential: the voice token beside it is not read. */
export async function readVoiceServerAddress(env = globalThis) {
  const idb = env.indexedDB;
  if (!idb) return null;
  let db = null;
  try {
    db = await openExisting(idb, VOICE_DATABASE);
    if (!db || !db.objectStoreNames.contains(VOICE_STORE)) return null;
    const address = await transact(db, VOICE_STORE, 'readonly', (store) => store.get(VOICE_ADDRESS));
    return isStudyServer(address) ? address : null;
  } catch { return null; } finally { try { db?.close(); } catch { /* closed */ } }
}

/** The first mark outside IndexedDB: whether this device holds a study pairing. Never the credential. */
export function studyMarker(env = globalThis) {
  const storage = () => env.localStorage;
  return {
    get() { try { return storage()?.getItem(PAIRED_MARKER) === '1'; } catch { return false; } },
    set() { try { storage().setItem(PAIRED_MARKER, '1'); return storage().getItem(PAIRED_MARKER) === '1'; } catch { return false; } },
    clear() { try { storage()?.removeItem(PAIRED_MARKER); return storage()?.getItem(PAIRED_MARKER) !== '1'; } catch { return false; } },
    /** Can this browser keep the flag at all? Asked before a code is spent. */
    probe() {
      const key = `${PAIRED_MARKER}:probe`;
      try { storage().setItem(key, '1'); const kept = storage().getItem(key) === '1'; storage().removeItem(key); return kept; } catch { return false; }
    },
  };
}

/** The second mark: the pairing that has ended, by installation, and who ended it. It is written before the row in
 * IndexedDB is changed and does not depend on that write: a refused or forgotten pairing stays ended across a reload
 * even when the row could not be written. A new pairing takes the mark away. */
export function studyEndedMark(env = globalThis) {
  const storage = () => env.localStorage;
  return {
    get() {
      try {
        const [installation, by] = String(storage()?.getItem(ENDED_MARKER) || '').split('|');
        return STUDY_INSTALLATION.test(installation) && (by === 'server' || by === 'learner') ? { installation, by } : null;
      } catch { return null; }
    },
    set(installation, by) { try { storage().setItem(ENDED_MARKER, `${installation}|${by}`); return storage().getItem(ENDED_MARKER) === `${installation}|${by}`; } catch { return false; } },
    clear() { try { storage()?.removeItem(ENDED_MARKER); return !storage()?.getItem(ENDED_MARKER); } catch { return false; } },
  };
}

/** Tell the other tabs of this browser that the pairing was made, ended or forgotten. */
export function announceStudyPairing(env = globalThis) {
  try { const channel = new env.BroadcastChannel(PAIRING_CHANNEL); channel.postMessage({ at: Date.now() }); channel.close(); } catch { /* the two marks tell them too */ }
}
/** Hear it: over the channel, and by the two marks changing (either alone reaches a tab; a browser gets both).
 * Resolves a function that stops listening. */
export function watchStudyPairing(env = globalThis, onSignal) {
  const stops = [];
  try {
    const channel = new env.BroadcastChannel(PAIRING_CHANNEL);
    channel.onmessage = () => onSignal();
    stops.push(() => channel.close());
  } catch { /* no channel here */ }
  try {
    const changed = (event) => { if (!event || event.key === null || event.key === PAIRED_MARKER || event.key === ENDED_MARKER) onSignal(); };
    env.addEventListener('storage', changed);
    stops.push(() => env.removeEventListener('storage', changed));
  } catch { /* no storage events here */ }
  return () => { for (const stop of stops.splice(0)) { try { stop(); } catch { /* stopped */ } } };
}

/** The row a device record names: one pairing, by its installation and the generation made when it was written. */
export const studyRowRef = (device) => (device ? Object.freeze({ installation: device.scope.installation, generation: device.generation }) : null);
/** Whether the stored row is the pairing `ref` names. */
export const isStudyRow = (row, ref) => !!row && !!ref && row.format === FORMAT && row.scope?.installation === ref.installation && (row.generation ?? FIRST_GENERATION) === ref.generation;
/** Each change to the row, as the row's successor, or null when the stored row is not the one the change names (or
 * the change no longer applies): then nothing is written. The device store and the tests' store share these. */
export const studyRowChanges = Object.freeze({
  /** The paired copy of the record has been fetched once. */
  ready: (row, ref) => (isStudyRow(row, ref) && !row.ended ? { ...row, phase: 'ready' } : null),
  /** The server ended the pairing: the credential goes, the rest stays so the page can say why and what was not sent.
   * An ending already written is left as it is, except that a count of what was unsent fills in one that had none
   * (the page that saw the refusal knows the count; a page that only found the mark does not). */
  end: (row, ref, { at, unsent = null }) => (isStudyRow(row, ref) && (!row.ended || (row.ended.by === 'server' && row.ended.unsent === null && unsent !== null))
    ? { ...row, sealed: null, ended: { at: row.ended?.at ?? at, by: 'server', unsent } } : null),
  /** The learner is forgetting the pairing: from this write on it is not a pairing any more, whatever comes next. */
  forget: (row, ref, { at }) => (isStudyRow(row, ref) ? { ...row, sealed: null, ended: { at: row.ended?.at ?? at, by: 'learner', unsent: row.ended?.unsent ?? null } } : null),
});

const deviceOf = (row) => {
  if (!row || row.format !== FORMAT || !validScope(row.scope) || !STUDY_INSTALLATION.test(row.scope.installation) ||
      !isStudyServer(row.server) || !PHASES.has(row.phase) || !Number.isFinite(row.pairedAt)) return null;
  const ended = row.ended && Number.isFinite(row.ended.at)
    ? Object.freeze({ at: row.ended.at, by: row.ended.by === 'learner' ? 'learner' : 'server', unsent: Number.isSafeInteger(row.ended.unsent) && row.ended.unsent >= 0 ? row.ended.unsent : null }) : null;
  return Object.freeze({ server: row.server, scope: Object.freeze({ environment: row.scope.environment, learner: row.scope.learner, installation: row.scope.installation }),
    generation: typeof row.generation === 'string' && row.generation ? row.generation : FIRST_GENERATION, pairedAt: row.pairedAt, phase: row.phase, ended });
};

/** The device store. read() answers { server, device, token }: `server` the address this store last paired with,
 * `device` { server, scope, generation, pairedAt, phase, ended } or null, `token` the credential or null (none kept,
 * or the pairing has ended). read() throws when the browser's storage fails: a failure is never read as "not paired".
 * Every change names the row it means (`ref`: installation and generation) and answers whether it changed anything:
 *   write(pairing)       keeps a new pairing, phase `allocated`; answers its ref
 *   markReady(ref)       the paired copy of the record has been fetched once
 *   end(ref, ending)     the server ended the pairing
 *   forget(ref, ending)  the learner is forgetting it
 *   remove(ref)          the row goes; the address stays */
export function createStudyCredentialStore(env = globalThis) {
  const idb = env.indexedDB, subtle = env.crypto?.subtle;
  const available = !!idb && !!subtle && typeof env.crypto.getRandomValues === 'function';
  const open = () => new Promise((resolve, reject) => {
    const request = idb.open(DATABASE, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('open-failed'));
    request.onblocked = () => reject(new Error('blocked'));
  });
  const using = async (work) => { const db = await open(); try { return await work(db); } finally { db.close(); } };
  /** Read the device row and write (or remove) its successor in one transaction. `change(row)` answers
   * { put: row }, { remove: true }, or null to leave the row as it is. */
  const amend = (change) => using((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const get = store.get(DEVICE);
    let changed = false;
    get.onsuccess = () => {
      const step = get.result ? change(get.result) : null;
      if (step?.put) { store.put(step.put, DEVICE); changed = true; } else if (step?.remove) { store.delete(DEVICE); changed = true; }
    };
    tx.oncomplete = () => resolve(changed);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('aborted'));
  }));
  const put = (next) => (next ? { put: next } : null);
  return {
    available,
    async read() {
      const empty = { server: null, device: null, token: null };
      if (!available) return empty;
      const db = await openExisting(idb, DATABASE);
      if (!db) return empty;
      try {
        if (!db.objectStoreNames.contains(STORE)) return empty;
        const [row, address] = await transact(db, STORE, 'readonly', (store) => [store.get(DEVICE), store.get(ADDRESS)]);
        const server = isStudyServer(address) ? address : null;
        const device = deviceOf(row);
        if (!device) return { server, device: null, token: null };
        let token = null;
        if (!device.ended && row.sealed) {
          try { token = new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv: row.sealed.iv }, row.sealed.key, row.sealed.data)); } catch { token = null; }
        }
        return { server, device, token };
      } finally { db.close(); }
    },
    async probe() {
      if (!available) return false;
      try { await using((db) => transact(db, STORE, 'readwrite', (store) => [store.put(1, PROBE), store.delete(PROBE)])); return true; } catch { return false; }
    },
    async write({ server, token, scope, pairedAt }) {
      if (!available) throw new Error('storage-unavailable');
      const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const iv = env.crypto.getRandomValues(new Uint8Array(12));
      const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
      const generation = Array.from(env.crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const row = { format: FORMAT, server, scope: { environment: scope.environment, learner: scope.learner, installation: scope.installation },
        generation, pairedAt, phase: 'allocated', ended: null, sealed: { key, iv, data } };
      await using((db) => transact(db, STORE, 'readwrite', (store) => [store.put(row, DEVICE), store.put(server, ADDRESS)]));
      return Object.freeze({ installation: scope.installation, generation });
    },
    async markReady(ref) { return available ? amend((row) => put(studyRowChanges.ready(row, ref))) : false; },
    async end(ref, ending) { return available ? amend((row) => put(studyRowChanges.end(row, ref, ending))) : false; },
    async forget(ref, ending) { return available ? amend((row) => put(studyRowChanges.forget(row, ref, ending))) : false; },
    async remove(ref) { return available ? amend((row) => (isStudyRow(row, ref) ? { remove: true } : null)) : false; },
  };
}

const REFUSALS = new Map([[400, 'pairing-refused'], [401, 'code-invalid-or-expired'], [403, 'origin-not-allowed'], [409, 'code-used'],
  [426, 'update-required'], [429, 'too-many-attempts'], [503, 'server-unavailable']]);

/** Whether this device holds a pairing that is still one: a row that has not ended and is not named by the ended mark. */
export const isLiveStudyDevice = (device, mark) => !!device && !device.ended && mark?.installation !== device.scope.installation;
/** The same, read from the device now: for a tab that has not opened study and hears that the pairing changed. */
export async function studyPairingLive(env = globalThis) {
  return isLiveStudyDevice((await createStudyCredentialStore(env).read()).device, studyEndedMark(env).get());
}

/** Pairing and unpairing. `voiceAddress` answers the address the voice client keeps (or null); `compatibility` the
 * engine's own header naming the replica it runs, which the server checks before it pairs. */
export function createStudyPairing({ env = globalThis, fetch: fetchFn = env.fetch?.bind(env), store = createStudyCredentialStore(env),
  voiceAddress = () => readVoiceServerAddress(env), marker = studyMarker(env), endedMark = studyEndedMark(env),
  announce = () => announceStudyPairing(env), timeoutMs = 20000, now = Date.now,
  compatibility = async () => (await import('./vendor/shared-study-engine/client/sync-compatibility.mjs')).compatibilityHeaders() } = {}) {
  const refuse = (code) => ({ ok: false, code });
  let flight = null;

  /** The one server this device is set up for: the voice client's address first, else the one a study pairing left. */
  async function configuredServer(kept) {
    let voice = null;
    try { voice = await voiceAddress(); } catch { voice = null; }
    return isStudyServer(voice) ? voice : isStudyServer(kept?.server) ? kept.server : null;
  }

  async function ask(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetchFn(url, { ...init, signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' }); }
    finally { clearTimeout(timer); }
  }

  async function redeem(input) {
    const parsed = parseStudyPairing(input);
    if (parsed.error) return refuse(parsed.error);
    if (typeof fetchFn !== 'function') return refuse('server-unreachable');
    let kept;
    try { kept = await store.read(); } catch { return refuse('storage-unavailable'); }
    if (kept.device) return refuse('already-paired');
    const configured = await configuredServer(kept);
    // the code is a secret for ten minutes: it goes to the server this device is set up for, or nowhere
    if (parsed.server && configured && parsed.server !== configured) return refuse('server-mismatch');
    const server = parsed.server || configured;
    if (!isStudyServer(server)) return refuse('server-missing');
    // a code can be spent once: make sure this browser can keep what it buys before spending it
    if (!store.available || !marker.probe() || !(await store.probe())) return refuse('storage-unavailable');
    // the learner's own Worker is `prod`; a server on this machine is the repository's local one, `dev`
    const asked = { environment: parsed.environment || (isLocalServer(server) ? 'dev' : 'prod'), learner: parsed.learner, installation: parsed.installation };
    let headers, response;
    try { headers = await compatibility(); } catch { return refuse('server-unreachable'); }
    try {
      response = await ask(`${server}/v1/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ scope: asked, code: parsed.code }) });
    } catch { return refuse('server-unreachable'); }
    if (response.status !== 200) return refuse(REFUSALS.get(response.status) || (response.status >= 500 ? 'server-unavailable' : 'pairing-failed'));
    let body;
    try { body = await response.json(); } catch { return refuse('invalid-response'); }
    // the identity is the server's answer, and the answer must be the scope that was asked for and no other
    const scope = body?.scope;
    if (!validScope(scope) || ['environment', 'learner', 'installation'].some((key) => scope[key] !== asked[key])) return refuse('invalid-response');
    try { checkStudyCredential(body.token, scope); } catch { return refuse('invalid-response'); }
    let ref;
    try { ref = await store.write({ server, token: body.token, scope, pairedAt: now() }); } catch { return refuse('storage-unavailable'); }
    // a new pairing is not the one that ended
    endedMark.clear();
    if (!marker.set()) {
      try { await store.remove(ref); } catch { /* nothing more can be undone */ }
      return refuse('storage-unavailable');
    }
    announce();
    return { ok: true, learner: scope.learner, installation: scope.installation };
  }

  /** Finish a forgetting that was cut short: the row goes, and the marks with it. Answers whether the row is gone. */
  async function finishForgetting(ref) {
    try { await store.forget(ref, { at: now() }); await store.remove(ref); } catch { return false; }
    marker.clear(); endedMark.clear();
    return true;
  }

  /** Bring the two marks and the row into step, and answer what Settings may show (never the credential, never
   * the server's address). A flag is put back only for a row that is still a pairing: never for one that has ended
   * or is half forgotten; and a flag with no pairing behind it is taken away. */
  async function status() {
    let kept;
    try { kept = await store.read(); } catch {
      return { available: store.available, failed: true, paired: false, ended: false, unsent: null, learner: null, installation: null, marked: marker.get() };
    }
    let device = kept.device;
    const mark = endedMark.get();
    const named = !!device && mark?.installation === device.scope.installation;
    if (device && (device.ended?.by === 'learner' || (named && mark.by === 'learner'))) {
      // a forgetting that did not finish (the page closed, or a write failed): finish it now
      if (await finishForgetting(studyRowRef(device))) device = null;
    } else if (device && named && !device.ended) {
      // the server refused this pairing and the row could not be written then: write it now
      try { await store.end(studyRowRef(device), { at: now(), unsent: null }); } catch { /* the mark still stands */ }
    }
    if (!device) { if (marker.get()) marker.clear(); if (mark) endedMark.clear(); }
    else if (!isLiveStudyDevice(device, mark)) { if (device.ended && !mark) endedMark.set(device.scope.installation, device.ended.by); }
    else if (kept.token !== null && !marker.get()) marker.set();
    const ended = !!device && (!isLiveStudyDevice(device, mark) || kept.token === null);
    return { available: store.available, failed: false, paired: !!device, ended, unsent: ended ? device.ended?.unsent ?? null : null,
      learner: device?.scope.learner ?? null, installation: device?.scope.installation ?? null, marked: marker.get() };
  }

  return {
    /** Redeem a pairing code. Resolves { ok: true, learner, installation } or { ok: false, code }; on any refusal
     * nothing is kept. One attempt at a time. */
    pair(input) {
      if (flight) return Promise.resolve(refuse('pairing-busy'));
      flight = redeem(input).catch(() => refuse('pairing-failed')).finally(() => { flight = null; });
      return flight;
    },
    /** The learner removes the pairing. The forgetting is made durable first: the pairing is marked ended (the mark
     * page start reads, then the row, one write), then the row is removed, then the flag is cleared. A page that
     * closes anywhere in between leaves a pairing that is already ended, never one that comes back. The address and
     * the paired copy of the record stay on the device, the copy unused. */
    async unpair() {
      let kept;
      try { kept = await store.read(); } catch { return refuse('storage-unavailable'); }
      if (kept.device) {
        const ref = studyRowRef(kept.device);
        endedMark.set(ref.installation, 'learner');
        try { await store.forget(ref, { at: now() }); await store.remove(ref); } catch { announce(); return refuse('storage-unavailable'); }
      }
      const cleared = marker.clear();
      endedMark.clear();
      announce();
      return cleared ? { ok: true } : refuse('storage-unavailable');
    },
    status,
    /** Put a lost flag back, for a pairing that is still one and for no other row. Answers whether the flag stands. */
    async heal() { return (await status()).marked; },
  };
}

/* ------------------------------------------------------------------ what a page says when its pairing is no more */

/** The plain lines for a study surface whose pairing ended under it, [ja, en] by cause. */
export const STUDY_CLOSED_LINES = Object.freeze({
  'study-pairing-ended': ['サーバーがこの端末のペアリングを終了しました。この端末はもうペアリングされていません。設定で、新しいコードでもう一度ペアリングしてください。',
    'The server ended this device’s pairing. This device is no longer paired. Pair it again in Settings with a new code.'],
  'study-pairing-changed': ['この端末のペアリングが変わりました。ここでの学習は止まりました。Bunki を開き直してください。',
    'This device’s pairing has changed. Study here has stopped. Reopen Bunki.'],
  'study-answer-not-saved': ['この端末はもうペアリングされていません。この答えは保存されませんでした。',
    'This device is no longer paired. This answer was not saved.'],
});
export const studyClosedLine = (code) => [...(Object.hasOwn(STUDY_CLOSED_LINES, code) ? STUDY_CLOSED_LINES[code] : STUDY_CLOSED_LINES['study-pairing-changed'])];

/* ------------------------------------------------------------------ Settings: the block beside the voice pairing */

const LINES = Object.freeze({
  heading: ['学習の記録 — Nihongo Study と同じ記録で学習する', 'Study record — study on the same record as Nihongo Study'],
  unpaired: ['この端末はまだ Nihongo Study の記録につながっていません。ここでの学習はこの端末だけに保存されます。',
    'This device is not connected to a Nihongo Study record yet. Study here is saved on this device only.'],
  paired: (learner, tail) => [`この端末は「${learner}」の Nihongo Study の記録で学習しています（端末 …${tail}）。`,
    `This device studies on ${learner}’s Nihongo Study record (device …${tail}).`],
  reopen: ['ペアリング済みです。Bunki を開き直すと、この記録での学習が始まります。', 'Paired. Reopen Bunki and study starts on this record.'],
  reopenNow: ['Bunki を開き直す', 'Reopen Bunki'],
  ended: ['サーバーがこの端末のペアリングを終了しました。同期は止まっています。この端末に残っている記録は送信されません。ペアリングを消してから、新しいコードでもう一度ペアリングしてください。',
    'The server ended this device’s pairing. Sync has stopped, and what is still on this device is not sent. Forget the pairing, then pair again with a new code.'],
  unsent: (count) => [`この端末で保存された答えのうち ${count} 件は、サーバーに送信されませんでした。その答えはこの端末に残っています。`,
    count === 1 ? '1 answer saved on this device was never uploaded. It is still on this device.' : `${count} answers saved on this device were never uploaded. They are still on this device.`],
  unsentNone: ['送信されなかった答えはありません。', 'No answer was left unsent.'],
  failed: ['このブラウザーの保存領域を読めませんでした。ページを読み込み直してください。', 'This browser’s storage could not be read. Reload the page.'],
  how: ['Nihongo Study 側で表示されたペアリングの1行（学習者ID・端末・サーバー・コード）を最初の欄にそのまま貼って「ペアリング」を押してください。12文字のコードだけ別に届いたときは、2つ目の欄に入れます。コードは10分で切れます。',
    'Paste the whole pairing line shown on the Nihongo Study side (learner id, device, server and code) into the first box and press Pair. If the 12-character code came separately, put it in the second box. The code lasts 10 minutes.'],
  learner: ['ペアリングの1行（学習者ID・端末・サーバー）', 'Pairing line (learner id, device and server)'],
  code: ['ペアリングコード（12文字）', 'Pairing code (12 characters)'],
  submit: ['ペアリング', 'Pair'],
  pairing: ['ペアリング中…', 'Pairing…'],
  done: (learner) => [`ペアリングしました。この端末は「${learner}」の Nihongo Study の記録で学習します。Bunki を開き直します…`,
    `Paired. This device now studies on ${learner}’s Nihongo Study record. Reopening Bunki…`],
  forget: ['この端末のペアリングを消す', 'Forget the pairing on this device'],
  forgetSure: ['本当に消す（同期が止まります）', 'Really forget it (sync stops)'],
  forgetWhat: ['ペアリングを消すと同期が止まります。この端末にある学習記録の写しは消えずに残りますが、使われません。まだ送信されていない記録は送信されません。',
    'Forgetting the pairing stops sync. This device’s copy of the study record stays on the device, unused. Grades not sent yet are not sent.'],
  forgotten: ['ペアリングを消しました。この端末にある学習記録の写しは残っていますが、使われません。Bunki を開き直します…',
    'Pairing forgotten. This device’s copy of the study record is still here, unused. Reopening Bunki…'],
  sync: Object.freeze({
    'up-to-date': ['同期済みです。', 'Synced.'],
    syncing: ['同期中…', 'Syncing…'],
    pending: ['同期を待っています。', 'Waiting to sync.'],
    offline: ['オフラインです。記録はこの端末に保存され、つながると送信されます。', 'Offline. Grades are kept on this device and sent when it is back online.'],
    'update-required': ['Bunki の更新が必要です。更新するまで同期は止まります。記録はこの端末に残っています。',
      'Bunki needs an update. Sync waits until then, and your grades stay on this device.'],
    unreachable: ['学習サーバーにつながりません。記録はこの端末に残り、あとで送信されます。', 'The study server cannot be reached. Grades stay on this device and are sent later.'],
  }),
  errors: Object.freeze({
    'invalid-pairing': ['コードか学習者IDの形が違います。確かめて、もう一度お試しください。', 'That does not look like a pairing code and learner id. Check them and try again.'],
    'pairing-line-required': ['ペアリングの1行がそろっていません。コードだけではペアリングできません。表示された1行（学習者ID・端末・サーバー）をそのまま貼ってください。',
      'The pairing line is incomplete. A code alone cannot pair: paste the whole line shown (learner id, device and server).'],
    'code-invalid-or-expired': ['コードが違うか、使用済みか、期限切れです。新しいコードでもう一度お試しください。', 'That code is wrong, already used or expired. Try again with a new code.'],
    'code-used': ['このコードの端末はすでにペアリング済みです。新しいコードが必要です。', 'That code belongs to a device that is already paired. A new code is needed.'],
    'pairing-refused': ['サーバーがこのペアリングを受け付けませんでした。学習者IDとコードを確かめてください。', 'The server did not accept this pairing. Check the learner id and the code.'],
    'server-unreachable': ['学習サーバーにつながりません。接続を確かめて、もう一度お試しください。', 'The study server cannot be reached. Check the connection and try again.'],
    'origin-not-allowed': ['学習サーバーは、このサイトからのペアリングを許可していません。', 'The study server does not allow pairing from this site.'],
    'update-required': ['この Bunki は学習サーバーより古いため、ペアリングできません。先に Bunki を更新してください。', 'This Bunki is older than the study server, so it cannot pair. Update Bunki first.'],
    'server-missing': ['この端末はまだ学習サーバーの住所を知りません。サーバーを含む1行をそのまま貼ってください。', 'This device does not know the study server’s address yet. Paste the whole line, which includes the server.'],
    'server-mismatch': ['この1行のサーバーは、この端末に設定されているサーバーと違います。ペアリングしませんでした。', 'The server in that line is not the server this device is set up for. Nothing was paired.'],
    'too-many-attempts': ['試行が多すぎます。1分待ってください。', 'Too many tries. Wait one minute.'],
    'server-unavailable': ['いまはペアリングできません。数分後にもう一度お試しください。', 'Pairing isn’t available right now. Try again in a few minutes.'],
    'not-a-study-device': ['このコードは学習用ではありません（音声用のコードかもしれません）。学習用のコードでお試しください。', 'That code is not for studying (it may be a voice code). Use a study code.'],
    'storage-unavailable': ['このブラウザーはペアリングを保存できません（プライベートブラウズなど）。ペアリングしませんでした。', 'This browser cannot keep a pairing (for example in private browsing). Nothing was paired.'],
    'already-paired': ['この端末はすでにペアリング済みです。', 'This device is already paired.'],
    'pairing-busy': ['ペアリング中です。少しお待ちください。', 'Pairing is under way. One moment.'],
  }),
  errorOther: ['ペアリングできませんでした。もう一度お試しください。', 'Pairing did not work. Try again.'],
});
export const studyPairingLine = (code) => [...(Object.hasOwn(LINES.errors, code) ? LINES.errors[code] : LINES.errorOther)];
const syncLine = (state, error) => {
  if (error === 'update-required' || state === 'update-required') return LINES.sync['update-required'];
  if (Object.hasOwn(LINES.sync, state) && !error) return LINES.sync[state];
  return state === 'idle' || state === 'paused' || state === 'disposed' ? null : LINES.sync.unreachable;
};

/** Fill Settings' study block (the element shared-study-boot.mjs handed to Settings). `tx(ja, en)` and
 * `el(tag, className, text)` are the app's own; `host` is this page's bound paired host or null. It makes no sound. */
export function fillStudyPairingBlock(block, { tx, el, env = globalThis, pairing = createStudyPairing({ env }), host = null,
  reload = () => env.location.reload(), reloadDelayMs = 1500 } = {}) {
  const words = (pair) => tx(pair[0], pair[1]);
  const name = el('p', 'settings-writing-name', words(LINES.heading));
  const state = el('p', 'teacher-note'); state.id = 'study-pair-status'; state.setAttribute('role', 'status');
  const sync = el('p', 'teacher-note'); sync.id = 'study-pair-sync';
  const form = el('form', 'listening-form settings-report-form'); form.id = 'study-pair-form'; form.noValidate = true;
  const field = (id, label, attrs) => {
    const wrap = el('div');
    const caption = el('label', '', words(label)); caption.htmlFor = id;
    const input = el('input', 'chat-field'); input.id = id; input.type = 'text';
    input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('autocapitalize', 'off'); input.setAttribute('autocorrect', 'off');
    Object.assign(input, attrs);
    wrap.append(caption, input);
    return { wrap, input };
  };
  const learner = field('study-pair-learner', LINES.learner, { maxLength: 400 });
  const code = field('study-pair-code', LINES.code, { maxLength: 24 });
  const submit = el('button', 'chip', words(LINES.submit)); submit.type = 'submit'; submit.id = 'study-pair-submit';
  const note = el('p', 'teacher-note'); note.id = 'study-pair-note'; note.setAttribute('role', 'status');
  const how = el('p', 'teacher-note', words(LINES.how)); how.id = 'study-pair-how';
  form.append(how, learner.wrap, code.wrap, submit, note);
  const reopen = el('button', 'chip', words(LINES.reopenNow)); reopen.type = 'button'; reopen.id = 'study-pair-reopen';
  const forgetWhat = el('p', 'teacher-note', words(LINES.forgetWhat)); forgetWhat.id = 'study-unpair-what';
  const forget = el('button', 'btn-tertiary', words(LINES.forget)); forget.type = 'button'; forget.id = 'study-unpair';
  let busy = false, leaving = false, sure = false, current = null, reading = false;
  const paint = () => {
    if (!current) return;
    const { paired, failed, learner: who, installation } = current;
    const live = paired && host ? host.status() : null;
    // a host that was closed under this page (the pairing ended, or was changed in another tab) is not this pairing's
    const bound = !!host && !live?.closed;
    const ended = current.ended || live?.closed === 'study-pairing-ended';
    block.dataset.state = failed ? 'failed' : !paired ? 'unpaired' : ended ? 'ended' : bound ? 'paired' : 'reopen';
    block.dataset.paired = String(paired); block.dataset.bound = String(bound);
    // what was saved here and never reached the server, as far as this device knows
    const unsent = ended ? current.unsent ?? live?.unsent ?? null : null;
    block.dataset.unsent = unsent === null ? '' : String(unsent);
    const endedWords = () => `${words(LINES.ended)}${unsent === null ? '' : ` ${words(unsent > 0 ? LINES.unsent(unsent) : LINES.unsentNone)}`}`;
    state.textContent = failed ? words(LINES.failed) : !paired ? words(LINES.unpaired)
      : ended ? endedWords() : bound ? words(LINES.paired(who, installation.slice(-4))) : words(LINES.reopen);
    // while the page is about to be opened again, the one note under the block says what happened
    state.hidden = leaving;
    const line = live?.started && !ended && bound && !leaving ? syncLine(live.state, live.error) : null;
    sync.textContent = line ? words(line) : ''; sync.hidden = !line; block.dataset.sync = live?.started ? live.state : '';
    form.hidden = paired || failed || leaving;
    reopen.hidden = !(paired && !ended && !bound) || leaving;
    forget.hidden = forgetWhat.hidden = !paired || leaving;
    forget.textContent = words(sure ? LINES.forgetSure : LINES.forget);
    submit.disabled = forget.disabled = busy;
  };
  const refresh = async () => {
    if (reading || leaving) return;
    reading = true;
    try { current = await pairing.status(); } finally { reading = false; }
    paint();
  };
  const leave = (line) => {
    leaving = true; note.textContent = words(line); block.append(note); paint();
    env.setTimeout(() => reload(), reloadDelayMs);
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || leaving) return;
    busy = true; paint();
    note.textContent = words(LINES.pairing);
    const answer = await pairing.pair({ learner: learner.input.value, code: code.input.value });
    busy = false;
    if (answer.ok) {
      learner.input.value = ''; code.input.value = '';
      current = { ...current, failed: false, paired: true, ended: false, unsent: null, learner: answer.learner, installation: answer.installation, marked: true };
      leave(LINES.done(answer.learner));
    } else { note.textContent = words(studyPairingLine(answer.code)); block.dataset.refused = answer.code; paint(); }
  });
  reopen.addEventListener('click', () => { if (!leaving) { leaving = true; reload(); } });
  forget.addEventListener('click', async () => {
    if (busy || leaving) return;
    if (!sure) { sure = true; paint(); return; }
    busy = true; paint();
    // sync stops before the credential goes, so nothing is sent with a credential the learner just removed
    try { await host?.dispose?.(); } catch { /* the page is about to be reopened */ }
    const answer = await pairing.unpair();
    busy = false; sure = false;
    if (answer.ok) {
      current = { ...current, paired: false, ended: false, unsent: null, learner: null, installation: null, marked: false };
      leave(LINES.forgotten);
    } else { note.textContent = words(studyPairingLine(answer.code)); block.append(note); paint(); }
  });
  block.replaceChildren(name, state, sync, form, reopen, forgetWhat, forget);
  block.dataset.state = 'loading';
  // this page's host changing, and the pairing changing in another tab, both redraw the block from the device's truth
  const stopHost = host?.subscribe?.(() => { if (!block.isConnected) { stopHost?.(); return; } paint(); if (host.status().closed) void refresh(); });
  const stopWatch = watchStudyPairing(env, () => { if (block.isConnected) void refresh(); else stopWatch(); });
  // Settings is drawn again and again; a page listens for one block, the one it shows now
  LISTENING.get(env)?.();
  LISTENING.set(env, () => { stopHost?.(); stopWatch(); });
  return refresh();
}
/** Per page: what stops the listening of the Settings block drawn before this one. */
const LISTENING = new WeakMap();
