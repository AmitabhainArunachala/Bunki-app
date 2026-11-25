/** Study pairing: this browser as one study device of a learner's Nihongo Study record (ENGINE-ONE.3).
 *
 * A study device holds a bearer credential for the Nihongo Study server. An admin mints a 12-character pairing code
 * for one named installation of one learner (`bunkiweb-<32 hex>` for this app); the device presents the code with
 * that scope (`POST /v1/pair`, the call the engine's own pairing client makes) and is answered with the scope and
 * the credential. The installation is the admin's to name: this device never makes one up. This module is the part
 * that needs no study engine: the credential's place on this device, the pairing and unpairing steps, what tells
 * the other tabs of this browser, the Nihongo Study panel Settings shows above the voice pairing, and the one
 * question a connect link asks. A device is connected by that link (`#study-connect=<payload>`, opened for the
 * learner by his own tools) and one click on Connect; there is no form to paste into.
 * shared-study-paired-host.mjs turns a kept credential into the bound host; shared-study-boot.mjs decides at page
 * start whether there is one, and takes a connect link out of the address.
 *
 * The server's address is not in this code (this repository is public and the server is the learner's own). It is the
 * address the voice client keeps on this device, or, on a device that knows none yet, the one the connect link
 * carries, under the voice client's own rule for what a server address is. A link that names any other server than
 * the one this device is set up for is refused before anything is sent.
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

/** The one-time connect link: `<bunki origin>/#study-connect=<payload>`, the payload base64url of the JSON
 * {"v":1,"code","learner","installation","server","environment"}. The learner's own tools open it; nobody types it.
 * shared-study-boot.mjs takes it out of the address before anything else runs and keeps the payload in memory only. */
export const STUDY_CONNECT_FRAGMENT = 'study-connect';
const LINK_FIELDS = 'code,environment,installation,learner,server,v';
/** Read a link's payload under the same rules as the pairing line's fields. Resolves { code, learner, installation,
 * server, environment } or { error }: `invalid-link` for anything that is not a whole payload of version 1, and
 * `not-a-study-device` for an installation of another kind, such as a speak-only voice install. */
export function parseStudyConnect(text) {
  const bad = { error: 'invalid-link' };
  if (typeof text !== 'string' || text.length > 2000 || !/^[A-Za-z0-9_-]+={0,2}$/.test(text)) return bad;
  let value;
  try {
    const plain = text.replace(/=+$/u, '').replace(/-/g, '+').replace(/_/g, '/');
    value = JSON.parse(atob(plain.padEnd(Math.ceil(plain.length / 4) * 4, '=')));
  } catch { return bad; }
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.v !== 1 || Object.keys(value).sort().join() !== LINK_FIELDS) return bad;
  const { learner, installation, environment } = value;
  const code = typeof value.code === 'string' ? value.code.replace(/[\s-]+/gu, '').toUpperCase() : '';
  const server = typeof value.server === 'string' ? value.server.replace(/\/+$/u, '') : '';
  if (!CODE.test(code) || typeof learner !== 'string' || !ID.test(learner) || /^nsrs_/i.test(learner)) return bad;
  if (!isStudyServer(server) || !ENVIRONMENTS.has(environment)) return bad;
  if (typeof installation !== 'string' || !ID.test(installation)) return bad;
  // a speak-only voice install, or any other kind, is not a study device
  return STUDY_INSTALLATION.test(installation) ? { code, learner, installation, server, environment } : { error: 'not-a-study-device' };
}
/** What `pair()` and `check()` are given: a link's payload as { link }, or the pairing line's two boxes. */
const parseInput = (input) => (input && typeof input === 'object' && Object.hasOwn(input, 'link') ? parseStudyConnect(input.link) : parseStudyPairing(input));

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

/** The study server's address this device keeps (the store's key `server`), or null: what a voice link is held to
 * (modules/voice-connect.mjs). An address, not a credential: the study credential beside it is not read. */
export async function readStudyServerAddress(env = globalThis) {
  const idb = env.indexedDB;
  if (!idb) return null;
  let db = null;
  try {
    db = await openExisting(idb, DATABASE);
    if (!db || !db.objectStoreNames.contains(STORE)) return null;
    const address = await transact(db, STORE, 'readonly', (store) => store.get(ADDRESS));
    return isStudyServer(address) ? address : null;
  } catch { return null; } finally { try { db?.close(); } catch { /* closed */ } }
}

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
  /** A sync of this pairing finished with the record up to date: Settings says when, also on a page that has not
   * opened study. Never on an ended pairing, and never earlier than the time already kept. */
  synced: (row, ref, { at }) => (isStudyRow(row, ref) && !row.ended && Number.isFinite(at) && !(row.syncedAt >= at) ? { ...row, syncedAt: at } : null),
});

const deviceOf = (row) => {
  if (!row || row.format !== FORMAT || !validScope(row.scope) || !STUDY_INSTALLATION.test(row.scope.installation) ||
      !isStudyServer(row.server) || !PHASES.has(row.phase) || !Number.isFinite(row.pairedAt)) return null;
  const ended = row.ended && Number.isFinite(row.ended.at)
    ? Object.freeze({ at: row.ended.at, by: row.ended.by === 'learner' ? 'learner' : 'server', unsent: Number.isSafeInteger(row.ended.unsent) && row.ended.unsent >= 0 ? row.ended.unsent : null }) : null;
  return Object.freeze({ server: row.server, scope: Object.freeze({ environment: row.scope.environment, learner: row.scope.learner, installation: row.scope.installation }),
    generation: typeof row.generation === 'string' && row.generation ? row.generation : FIRST_GENERATION, pairedAt: row.pairedAt, phase: row.phase, ended,
    syncedAt: Number.isFinite(row.syncedAt) ? row.syncedAt : null });
};

/** The device store. read() answers { server, device, token }: `server` the address this store last paired with,
 * `device` { server, scope, generation, pairedAt, phase, ended, syncedAt } or null, `token` the credential or null
 * (none kept, or the pairing has ended). read() throws when the browser's storage fails: a failure is never read as
 * "not paired". Every change names the row it means (`ref`: installation and generation) and answers whether it
 * changed anything:
 *   write(pairing)       keeps a new pairing, phase `allocated`; answers its ref
 *   synced(ref, { at })  a sync finished with the record up to date at `at`
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
    async synced(ref, at) { return available ? amend((row) => put(studyRowChanges.synced(row, ref, at))) : false; },
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

  /** The checks that need no request: what was given, a pairing this device already holds, and the server. Answers
   * { ok: true, server } or a refusal; nothing is kept and nothing is sent either way. */
  async function vet(parsed) {
    if (parsed.error) return refuse(parsed.error);
    let kept;
    try { kept = await store.read(); } catch { return refuse('storage-unavailable'); }
    if (kept.device) return refuse('already-paired');
    const configured = await configuredServer(kept);
    // the code is a secret for ten minutes: it goes to the server this device is set up for, or nowhere
    if (parsed.server && configured && parsed.server !== configured) return refuse('server-mismatch');
    const server = parsed.server || configured;
    if (!isStudyServer(server)) return refuse('server-missing');
    return { ok: true, server };
  }

  async function redeem(input) {
    const parsed = parseInput(input);
    if (parsed.error) return refuse(parsed.error);
    if (typeof fetchFn !== 'function') return refuse('server-unreachable');
    const vetted = await vet(parsed);
    if (!vetted.ok) return vetted;
    const { server } = vetted;
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
      learner: device?.scope.learner ?? null, installation: device?.scope.installation ?? null, marked: marker.get(),
      syncedAt: device && !ended ? device.syncedAt ?? null : null };
  }

  return {
    /** Redeem a pairing code, from a connect link (`{ link }`) or the pairing line. Resolves { ok: true, learner,
     * installation } or { ok: false, code }; on any refusal nothing is kept. One attempt at a time. */
    pair(input) {
      if (flight) return Promise.resolve(refuse('pairing-busy'));
      flight = redeem(input).catch(() => refuse('pairing-failed')).finally(() => { flight = null; });
      return flight;
    },
    /** Whether `input` could pair this device, asked before the learner is asked: { ok: true, host } with the server's
     * host name, or a refusal. It keeps nothing and sends nothing. */
    async check(input) {
      try {
        const vetted = await vet(parseInput(input));
        return vetted.ok ? { ok: true, host: new URL(vetted.server).host } : vetted;
      } catch { return refuse('pairing-failed'); }
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
  'study-pairing-ended': ['サーバーがこの端末のペアリングを終了しました。この端末はもう接続されていません。Nihongo Study からもう一度接続してください。',
    'The server ended this device’s pairing. This device is no longer connected. Connect it again from Nihongo Study.'],
  'study-pairing-changed': ['この端末のペアリングが変わりました。ここでの学習は止まりました。Bunki を開き直してください。',
    'This device’s pairing has changed. Study here has stopped. Reopen Bunki.'],
  'study-answer-not-saved': ['この端末はもうペアリングされていません。この答えは保存されませんでした。',
    'This device is no longer paired. This answer was not saved.'],
});
export const studyClosedLine = (code) => [...(Object.hasOwn(STUDY_CLOSED_LINES, code) ? STUDY_CLOSED_LINES[code] : STUDY_CLOSED_LINES['study-pairing-changed'])];

/* ------------------------------------------------------------------ Settings: the Nihongo Study panel */

const LINES = Object.freeze({
  heading: ['Nihongo Study', 'Nihongo Study'],
  unpaired: ['未接続。この端末の学習はこの端末だけに保存されます。', 'Not connected. Study here stays on this device.'],
  paired: ['接続済み。この端末は Nihongo Study の記録で学習しています。', 'Connected. This device studies on your Nihongo Study record.'],
  reopen: ['接続済み。Bunki を開き直すと、Nihongo Study の記録での学習が始まります。', 'Connected. Reopen Bunki and study starts on your Nihongo Study record.'],
  reopenNow: ['Bunki を開き直す', 'Reopen Bunki'],
  ended: ['サーバーがこの端末のペアリングを終了しました。同期は止まっています。これまでに保存した学習記録はこの端末に残っています。接続を解除してから、Nihongo Study からもう一度接続してください。',
    'The server ended this device’s pairing. Sync has stopped. Your saved study record is still on this device. Disconnect, then connect again from Nihongo Study.'],
  unsent: (count) => [`この端末に保存した回答のうち、${count} 件はサーバーが受信したか確認できていません。`,
    `This device could not confirm that the server received ${count === 1 ? '1 saved answer' : `${count} saved answers`}.`],
  unsentNone: ['未確認の回答はありません。', 'All saved answers were confirmed.'],
  failed: ['このブラウザーの保存領域を読めませんでした。ページを読み込み直してください。', 'This browser’s storage could not be read. Reload the page.'],
  notSynced: ['まだ同期していません。', 'Not synced yet.'],
  retrySync: ['同期を再試行', 'Retry sync'],
  forget: ['接続を解除', 'Disconnect'],
  forgetSure: ['本当に解除する（同期が止まります）', 'Really disconnect (sync stops)'],
  forgetWhat: ['接続を解除すると同期が止まります。この端末にある学習記録の写しは消えずに残りますが、使われません。まだ送信されていない記録は送信されません。',
    'Disconnecting stops sync. This device’s copy of the study record stays on the device, unused. Grades not sent yet are not sent.'],
  forgotten: ['接続を解除しました。この端末にある学習記録の写しは残っていますが、使われません。Bunki を開き直します…',
    'Disconnected. This device’s copy of the study record is still here, unused. Reopening Bunki…'],
  sync: Object.freeze({
    'up-to-date': ['同期済みです。', 'Synced.'],
    syncing: ['同期中…', 'Syncing…'],
    pending: ['同期を待っています。', 'Waiting to sync.'],
    offline: ['オフラインです。記録はこの端末に保存され、つながると送信されます。', 'Offline. Grades are kept on this device and sent when it is back online.'],
    'update-required': ['Bunki の更新が必要です。更新するまで同期は止まります。記録はこの端末に残っています。',
      'Bunki needs an update. Sync waits until then, and your grades stay on this device.'],
    backoff: ['学習サーバーが混み合っています。この画面を開いたままにすると、自動で同期を再試行します。', 'The study server asked Bunki to wait. Sync will retry while this page is open and online.'],
    blocked: ['学習記録の一部を読み込めないため、同期を中断しました。保存済みの回答はこの端末に残っています。', 'Sync stopped because Bunki could not read part of the study record. Your saved answers remain on this device.'],
    storage: ['この端末の学習記録を読み書きできませんでした。同期を再試行してください。', 'Bunki could not read or update the study record on this device. Retry sync.'],
    unreachable: ['学習サーバーにつながりません。回答はこの端末に保存されています。接続を確認してください。', 'The study server could not be reached. Your saved answers are on this device. Check your connection.'],
    unconfirmed: ['同期を確認できませんでした。保存済みの回答はこの端末に残っています。', 'Bunki could not verify the sync. Your saved answers remain on this device.'],
  }),
  errors: Object.freeze({
    'invalid-link': ['この接続リンクは正しくありません。Nihongo Study からもう一度開いてください。', 'This connect link is not complete. Open it again from Nihongo Study.'],
    'invalid-pairing': ['コードか学習者IDの形が違います。確かめて、もう一度お試しください。', 'That does not look like a pairing code and learner id. Check them and try again.'],
    'pairing-line-required': ['ペアリングの1行がそろっていません。コードだけではペアリングできません。表示された1行（学習者ID・端末・サーバー）をそのまま貼ってください。',
      'The pairing line is incomplete. A code alone cannot pair: paste the whole line shown (learner id, device and server).'],
    'code-invalid-or-expired': ['このリンクのコードが違うか、使用済みか、期限切れです。Nihongo Study で新しいリンクを開いてください。', 'This link’s code is wrong, already used or expired. Open a new link from Nihongo Study.'],
    'code-used': ['このリンクの端末はすでに接続済みです。新しいリンクが必要です。', 'This link was for a device that is already connected. A new link is needed.'],
    'pairing-refused': ['サーバーがこの接続を受け付けませんでした。Nihongo Study で新しいリンクを開いてください。', 'The server did not accept this connection. Open a new link from Nihongo Study.'],
    'server-unreachable': ['学習サーバーにつながりません。接続を確かめて、もう一度リンクを開いてください。', 'The study server cannot be reached. Check the connection and open the link again.'],
    'origin-not-allowed': ['学習サーバーは、このサイトからの接続を許可していません。', 'The study server does not allow connections from this site.'],
    'update-required': ['この Bunki は学習サーバーより古いため、接続できません。先に Bunki を更新してください。', 'This Bunki is older than the study server, so it cannot connect. Update Bunki first.'],
    'server-missing': ['この端末はまだ学習サーバーの住所を知りません。サーバーを含むリンクを開いてください。', 'This device does not know the study server’s address yet. Open a link that names the server.'],
    'server-mismatch': ['このリンクのサーバーは、この端末に設定されているサーバーと違います。接続しませんでした。', 'This link names a server that is not the server this device is set up for. Nothing was connected.'],
    'too-many-attempts': ['試行が多すぎます。1分待ってください。', 'Too many tries. Wait one minute.'],
    'server-unavailable': ['いまは接続できません。数分後にもう一度お試しください。', 'Connecting isn’t available right now. Try again in a few minutes.'],
    'not-a-study-device': ['このリンクは学習用ではありません（音声用のコードかもしれません）。学習用のリンクを開いてください。', 'This link is not for studying (it may be a voice code). Open a study link.'],
    'storage-unavailable': ['このブラウザーは接続を保存できません（プライベートブラウズなど）。接続しませんでした。', 'This browser cannot keep a connection (for example in private browsing). Nothing was connected.'],
    'already-paired': ['この端末はすでに Nihongo Study の記録につながっています。別の記録につなぐには、先に設定で接続を解除してください。',
      'This browser is already connected to a Nihongo Study record. To connect it to another, disconnect it in Settings first.'],
    'pairing-busy': ['接続中です。少しお待ちください。', 'Connecting is under way. One moment.'],
  }),
  errorOther: ['接続できませんでした。もう一度リンクを開いてください。', 'Connecting did not work. Open the link again.'],
});
export const studyPairingLine = (code) => [...(Object.hasOwn(LINES.errors, code) ? LINES.errors[code] : LINES.errorOther)];
const syncLine = (state, error) => {
  if (error === 'update-required' || state === 'update-required') return LINES.sync['update-required'];
  if (state === 'offline') return LINES.sync.offline;
  if (error === 'retry-later') return LINES.sync.backoff;
  if (error === 'store-failed') return LINES.sync.storage;
  if (error === 'network-failed') return LINES.sync.unreachable;
  if (Object.hasOwn(LINES.sync, state) && !error) return LINES.sync[state];
  return state === 'idle' || state === 'paused' || state === 'disposed' ? null : LINES.sync.unconfirmed;
};
/** When the record was last brought up to date, in words: "Synced 2 minutes ago.", or after a line that says what is
 * wrong now, "Last synced 2 minutes ago." */
export function studySyncedLine(at, now, after = false) {
  const minutes = Math.max(0, Math.floor((now - at) / 60000)), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  const ago = (count, unit) => `${count} ${unit}${count === 1 ? '' : 's'} ago`;
  const [ja, en] = minutes < 1 ? ['たった今', 'just now'] : minutes < 60 ? [`${minutes}分前`, ago(minutes, 'minute')]
    : hours < 24 ? [`${hours}時間前`, ago(hours, 'hour')] : [`${days}日前`, ago(days, 'day')];
  if (after) return [`最後の同期は${ja}です。`, `Last synced ${en}.`];
  return [minutes < 1 ? 'たった今同期しました。' : `${ja}に同期しました。`, `Synced ${en}.`];
}

/** Fill Settings' Nihongo Study panel (the element shared-study-boot.mjs handed to Settings): whether this device
 * studies on the learner's record, when it last synced, and Disconnect. There is no form: a device is connected by
 * the one-time connect link (offerStudyConnect below). `tx(ja, en)` and `el(tag, className, text)` are the app's own;
 * `host` is this page's bound paired host or null. It makes no sound. */
export function fillStudyPairingBlock(block, { tx, el, env = globalThis, pairing = createStudyPairing({ env }), host = null,
  reload = () => env.location.reload(), reloadDelayMs = 1500, now = () => Date.now() } = {}) {
  const words = (pair) => tx(pair[0], pair[1]);
  const name = el('p', 'settings-writing-name', words(LINES.heading));
  const state = el('p', 'teacher-note'); state.id = 'study-pair-status'; state.setAttribute('role', 'status');
  const sync = el('p', 'teacher-note'); sync.id = 'study-pair-sync';
  const note = el('p', 'teacher-note'); note.id = 'study-pair-note'; note.setAttribute('role', 'status');
  const retry = el('button', 'chip', words(LINES.retrySync)); retry.type = 'button'; retry.id = 'study-pair-retry';
  const reopen = el('button', 'chip', words(LINES.reopenNow)); reopen.type = 'button'; reopen.id = 'study-pair-reopen';
  const forgetWhat = el('p', 'teacher-note', words(LINES.forgetWhat)); forgetWhat.id = 'study-unpair-what';
  const forget = el('button', 'btn-tertiary', words(LINES.forget)); forget.type = 'button'; forget.id = 'study-unpair';
  let busy = false, leaving = false, sure = false, current = null, reading = false, retrying = false;
  const paint = () => {
    if (!current) return;
    const { paired, failed } = current;
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
      : ended ? endedWords() : bound ? words(LINES.paired) : words(LINES.reopen);
    // while the page is about to be opened again, the one note under the block says what happened
    state.hidden = leaving;
    // when the record was last brought up to date (this page's host, or the pairing's own row), and what is wrong now
    const at = Math.max(bound ? live?.syncedAt ?? 0 : 0, current.syncedAt ?? 0) || null;
    const liveLine = live?.started && bound ? syncLine(live.state, live.error) : null;
    const problem = liveLine && liveLine !== LINES.sync['up-to-date'] ? liveLine : null;
    const shown = paired && !ended && !failed && !leaving;
    sync.textContent = shown ? [problem, at ? studySyncedLine(at, now(), !!problem) : problem ? null : LINES.notSynced].filter(Boolean).map(words).join(' ') : '';
    sync.hidden = !shown; block.dataset.sync = live?.started ? live.state : ''; block.dataset.synced = at && shown ? String(at) : '';
    retry.hidden = !(shown && bound && live?.started && live.state === 'error' && typeof host.synchronize === 'function');
    retry.disabled = retrying || busy;
    reopen.hidden = !(paired && !ended && !bound) || leaving;
    forget.hidden = !paired || leaving;
    // what Disconnect does is said when it is asked for, beside the second press
    forgetWhat.hidden = !paired || leaving || !sure;
    forget.textContent = words(sure ? LINES.forgetSure : LINES.forget);
    forget.disabled = busy;
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
  retry.addEventListener('click', async () => {
    if (retry.hidden || retrying || busy || leaving) return;
    retrying = true; paint();
    try { await host.synchronize(); } finally { retrying = false; paint(); }
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
      current = { ...current, paired: false, ended: false, unsent: null, learner: null, installation: null, marked: false, syncedAt: null };
      leave(LINES.forgotten);
    } else { note.textContent = words(studyPairingLine(answer.code)); block.append(note); paint(); }
  });
  block.replaceChildren(name, state, sync, retry, reopen, forgetWhat, forget);
  block.dataset.state = 'loading';
  // this page's host changing, and the pairing changing in another tab, both redraw the block from the device's truth
  const stopHost = host?.subscribe?.(() => { if (!block.isConnected) { stopHost?.(); return; } paint(); if (host.status().closed) void refresh(); });
  const stopWatch = watchStudyPairing(env, () => { if (block.isConnected) void refresh(); else stopWatch(); });
  // "2 minutes ago" stays true while Settings stays open
  const ticker = typeof env.setInterval === 'function' ? env.setInterval(() => { if (block.isConnected) paint(); }, 30000) : null;
  const stopTicker = () => { if (ticker !== null) env.clearInterval?.(ticker); };
  // Settings is drawn again and again; a page listens for one block, the one it shows now
  LISTENING.get(env)?.();
  LISTENING.set(env, () => { stopHost?.(); stopWatch(); stopTicker(); });
  return refresh();
}
/** Per page: what stops the listening of the Settings block drawn before this one. */
const LISTENING = new WeakMap();

/* ------------------------------------------------------------------ the connect link: one question, one click */

const ASK = Object.freeze({
  title: ['このブラウザーを Nihongo Study の記録につなぎますか？', 'Connect this browser to your Nihongo Study record?'],
  server: (host) => [`サーバー：${host}`, `Server: ${host}`],
  what: ['つなぐと、ここでの学習は Nihongo Study と同じ記録に保存され、同期されます。', 'Study here is then saved to the same record as Nihongo Study and kept in sync.'],
  connect: ['接続', 'Connect'],
  notNow: ['今はしない', 'Not now'],
  close: ['閉じる', 'Close'],
  connecting: ['接続中…', 'Connecting…'],
  connected: ['接続しました', 'Connected'],
  reopening: ['このブラウザーは Nihongo Study の記録で学習します。Bunki を開き直します…', 'This browser now studies on your Nihongo Study record. Reopening Bunki…'],
  held: ['このブラウザーはすでにつながっています', 'This browser is already connected'],
  refused: ['このリンクではつなげません', 'This link cannot connect this browser'],
});
const PANEL_STYLE = `#study-connect{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(24,20,16,.42)}
#study-connect .study-connect-card{box-sizing:border-box;width:min(440px,100%);padding:24px 24px 20px;border-radius:var(--radius-card,16px);background:var(--ground,#f7f3ea);color:var(--ink,#1f1b16);box-shadow:0 18px 48px rgba(0,0,0,.24);font-family:var(--sans,system-ui,-apple-system,"Hiragino Sans",sans-serif)}
#study-connect h2{margin:0 0 10px;font-size:1.15rem;line-height:1.45;font-weight:600}
#study-connect p{margin:0 0 8px;font-size:.95rem;line-height:1.6}
#study-connect .study-connect-server{font-size:.85rem;opacity:.72;overflow-wrap:anywhere}
#study-connect .study-connect-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:12px;margin-top:18px}
#study-connect button{min-height:44px;padding:10px 20px;border:1px solid var(--line,rgba(0,0,0,.2));border-radius:var(--radius-control,999px);background:transparent;color:inherit;font:inherit;font-size:.95rem;cursor:pointer}
#study-connect button.study-connect-primary{border-color:transparent;background:var(--ink,#1f1b16);color:var(--ground,#f7f3ea)}
#study-connect button:disabled{opacity:.5;cursor:default}
#study-connect [hidden]{display:none!important}`;
const elementsOf = (document) => (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
};

/** The confirmation a connect link opens: one question, the server's host name, Connect and Not now. Nothing is kept
 * and nothing is sent before Connect; Connect pairs through `pair()` and every check it makes, says so and reopens the
 * page. A browser that is already connected is told so and offered Close only: disconnecting first is the way to
 * change record. `text` is the link's payload; it is held here in memory only, and dropped when the panel closes or
 * the code is spent. Resolves the panel. */
export async function offerStudyConnect(text, { env = globalThis, pairing = createStudyPairing({ env }),
  english = new URLSearchParams(env.location?.search || '').get('ui') !== 'ja', el = elementsOf(env.document),
  mount = (panel) => env.document.body.append(panel), unmount = (panel) => panel.remove(),
  reload = () => env.location.reload(), reloadDelayMs = 1500 } = {}) {
  let link = text;
  const say = (pair) => (english ? pair[1] : pair[0]);
  const vetted = await pairing.check({ link });
  if (!vetted.ok) link = null;
  const panel = el('div', 'study-connect'); panel.id = 'study-connect';
  const card = el('div', 'study-connect-card');
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'study-connect-title');
  const title = el('h2', '', ''); title.id = 'study-connect-title';
  const server = el('p', 'study-connect-server', vetted.ok ? say(ASK.server(vetted.host)) : ''); server.id = 'study-connect-server';
  const what = el('p', '', say(ASK.what)); what.id = 'study-connect-what';
  const note = el('p', '', ''); note.id = 'study-connect-note'; note.setAttribute('role', 'status');
  const actions = el('div', 'study-connect-actions');
  const no = el('button', '', say(ASK.notNow)); no.type = 'button'; no.id = 'study-connect-no';
  const yes = el('button', 'study-connect-primary', say(ASK.connect)); yes.type = 'button'; yes.id = 'study-connect-yes';
  actions.append(no, yes);
  card.append(title, server, what, note, actions);
  panel.append(card);
  let busy = false;
  const show = (state, { heading = ASK.title, line = null, refused = '' } = {}) => {
    panel.dataset.state = state; panel.dataset.refused = refused;
    title.textContent = say(heading);
    note.textContent = line ? say(line) : ''; note.hidden = !line;
    server.hidden = !vetted.ok || state === 'connected';
    what.hidden = state !== 'offer' && state !== 'connecting';
    yes.hidden = state !== 'offer' && state !== 'connecting';
    no.hidden = state === 'connected';
    no.textContent = say(state === 'offer' || state === 'connecting' ? ASK.notNow : ASK.close);
    yes.disabled = no.disabled = state === 'connecting';
  };
  const close = () => {
    if (busy) return;
    link = null; panel.dataset.state = 'closed';
    unmount(panel);
  };
  const go = async () => {
    if (busy || link === null) return;
    busy = true; show('connecting', { line: ASK.connecting });
    const answer = await pairing.pair({ link });
    // a code is spent once, whatever the answer: a new try is a new link
    link = null; busy = false;
    if (answer.ok) {
      show('connected', { heading: ASK.connected, line: ASK.reopening });
      env.setTimeout(() => reload(), reloadDelayMs);
    } else show('failed', { line: studyPairingLine(answer.code), refused: answer.code });
  };
  yes.addEventListener('click', go);
  no.addEventListener('click', close);
  panel.addEventListener('keydown', (event) => { if (event?.key === 'Escape') close(); });
  if (vetted.ok) show('offer');
  else if (vetted.code === 'already-paired') show('held', { heading: ASK.held, line: studyPairingLine('already-paired'), refused: vetted.code });
  else show('refused', { heading: ASK.refused, line: studyPairingLine(vetted.code), refused: vetted.code });
  const head = env.document?.head;
  if (head && !env.document.getElementById('study-connect-style')) {
    const style = env.document.createElement('style'); style.id = 'study-connect-style'; style.textContent = PANEL_STYLE;
    head.append(style);
  }
  mount(panel);
  try { (yes.hidden ? no : yes).focus?.(); } catch { /* focus is a convenience */ }
  return panel;
}
