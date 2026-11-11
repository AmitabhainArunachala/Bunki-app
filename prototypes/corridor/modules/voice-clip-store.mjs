/** Heard clips, kept on this device (B3, speech lane, 2026-11-11). The owner chose "real voices or silence": offline he
 * wants the real voice for anything he has heard, and silence with one plain line otherwise.
 *
 * A clip the voice server has made never changes: there is no redo, no correction and no version. So a kept copy is
 * always the current clip. The seam asks this store first and plays a kept clip at once, online or offline, without
 * asking the server; no freshness check exists or is wanted.
 *
 * A clip is known by what the seam already knows it by: its voice key and its text (`${voiceKey}|${text}`). Each one
 * holds its bytes as binary with their content type, the voice, the size, when it was saved and when it was last
 * played. At most 300 MiB are kept; past that the clip least recently played goes first. Only a successful audio answer
 * is ever kept (the seam hands nothing else over, and put() refuses anything that is not audio).
 *
 * In the browser the storage is IndexedDB, a database of its own (CLIP_DB, `bunki-voice-clips-v<version>`): the bytes in one object store,
 * a small row per clip in another. It stands apart from the learner's record, and no export or backup of the record
 * reads it. Tests use the in-memory storage. Nothing here may stand between him and the voice: the seam bounds every
 * lookup and treats any failure as a miss (voice-seam.mjs). */

/** The version of the clips kept here. CHANGE IT whenever the voice roster or the voice profile changes (a voice added,
 * replaced or removed, another model, other settings): a new number is a new database, so a clip made by an older voice
 * set is never played beside one made by the newer set, and the older database is removed when the store first reads. */
export const CLIP_STORE_VERSION = 1;
export const CLIP_DB = `bunki-voice-clips-v${CLIP_STORE_VERSION}`;
const ANY_CLIP_DB = /^bunki-voice-clips(?:-v\d+)?$/u;
export const CLIP_CAP_BYTES = 300 * 1024 * 1024;
const BYTES = 'clips';
const INDEX = 'index';

/** A storage that lasts as long as the page: for tests, and for a browser without IndexedDB. */
export function createMemoryClipStorage() {
  const rows = new Map(), bytes = new Map();
  return {
    durable: false,
    async readIndex() { return [...rows.values()].map((row) => ({ ...row })); },
    async readBytes(key) { const kept = bytes.get(key); return kept ? new Uint8Array(kept) : null; },
    async write(row, data) { bytes.set(row.key, new Uint8Array(data)); rows.set(row.key, { ...row }); },
    async touch(key, at) { const row = rows.get(key); if (row) rows.set(key, { ...row, lastPlayedAt: at }); },
    async remove(keys) { for (const key of keys) { rows.delete(key); bytes.delete(key); } },
  };
}

/** The device storage: IndexedDB database CLIP_DB (`name` only for the proof's own throwaway database).
 * A device that has never kept a clip has no such database, and reading creates none (where the browser can tell). */
export function createIndexedDbClipStorage(env = globalThis, { name = CLIP_DB } = {}) {
  const idb = env.indexedDB;
  if (!idb || typeof idb.open !== 'function') return createMemoryClipStorage();
  let opening = null;
  const open = () => (opening ||= new Promise((resolve, reject) => {
    const request = idb.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BYTES)) db.createObjectStore(BYTES);
      if (!db.objectStoreNames.contains(INDEX)) db.createObjectStore(INDEX, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('open-failed'));
    request.onblocked = () => reject(new Error('blocked'));
  }).catch((error) => { opening = null; throw error; }));
  const exists = async () => opening !== null || typeof idb.databases !== 'function' ||
    (await idb.databases()).some((db) => db.name === name);
  /** One transaction; `work` queues its requests and returns a function that reads their results once it commits. */
  const run = async (stores, mode, work) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const read = work(tx);
      tx.oncomplete = () => resolve(typeof read === 'function' ? read() : undefined);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('aborted'));
    });
  };
  return {
    durable: true,
    async readIndex() {
      if (!(await exists())) return [];
      return run([INDEX], 'readonly', (tx) => { const request = tx.objectStore(INDEX).getAll(); return () => request.result || []; });
    },
    async readBytes(key) {
      if (!(await exists())) return null;
      return run([BYTES], 'readonly', (tx) => {
        const request = tx.objectStore(BYTES).get(key);
        return () => (request.result instanceof ArrayBuffer ? new Uint8Array(request.result) : null);
      });
    },
    async write(row, data) {
      // the bytes as an ArrayBuffer, not a Blob: WebKit refuses Blobs in IndexedDB in a private session
      const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      await run([BYTES, INDEX], 'readwrite', (tx) => { tx.objectStore(BYTES).put(buffer, row.key); tx.objectStore(INDEX).put({ ...row }); });
    },
    async touch(key, at) {
      await run([INDEX], 'readwrite', (tx) => {
        const store = tx.objectStore(INDEX);
        const request = store.get(key);
        request.onsuccess = () => { if (request.result) store.put({ ...request.result, lastPlayedAt: at }); };
      });
    },
    async remove(keys) {
      if (!keys.length) return;
      await run([BYTES, INDEX], 'readwrite', (tx) => { for (const key of keys) { tx.objectStore(BYTES).delete(key); tx.objectStore(INDEX).delete(key); } });
    },
    /** The clips of an older version (an older voice roster or profile) go: their databases are deleted. */
    async dropOlder() {
      if (name !== CLIP_DB || typeof idb.databases !== 'function' || typeof idb.deleteDatabase !== 'function') return;
      for (const db of await idb.databases()) {
        if (db.name === name || !ANY_CLIP_DB.test(db.name || '')) continue;
        await new Promise((resolve) => { const request = idb.deleteDatabase(db.name); request.onsuccess = request.onerror = request.onblocked = () => resolve(); });
      }
    },
  };
}

/** The store the seam asks first: get(key) → { bytes, contentType, voiceId } or null; put(key, clip) after a successful
 * audio answer. Writes go one after another; the index is read once and kept here, so has(key) can answer at once. */
export function createClipStore({ storage = createMemoryClipStorage(), capBytes = CLIP_CAP_BYTES, now = () => Date.now() } = {}) {
  let rows = null; // key → row, once the index has been read
  let total = 0;
  let loading = null;
  let chain = Promise.resolve();
  const load = () => (loading ||= Promise.resolve().then(() => {
    // the clips of an older voice set go, once (their own databases; never this one)
    void Promise.resolve().then(() => storage.dropOlder?.()).catch(() => {});
    return storage.readIndex();
  }).then((list) => {
    rows = new Map();
    total = 0;
    for (const row of Array.isArray(list) ? list : []) {
      if (!row || typeof row.key !== 'string' || !Number.isSafeInteger(row.size) || row.size <= 0) continue;
      rows.set(row.key, { ...row });
      total += row.size;
    }
  }).catch((error) => { loading = null; throw error; }));
  /** Writes one after another: the running total stays true. */
  const queue = (work) => {
    const next = chain.then(work, work);
    chain = next.then(() => {}, () => {});
    return next;
  };
  /** The clips least recently played go (never `keep`) until what is kept is at most `limit` bytes. */
  async function evictTo(limit, keep) {
    if (total <= limit) return;
    const order = [...rows.values()].filter((row) => row.key !== keep)
      .sort((a, b) => (a.lastPlayedAt - b.lastPlayedAt) || (a.savedAt - b.savedAt));
    const gone = [];
    let left = total;
    for (const row of order) {
      if (left <= limit) break;
      gone.push(row.key);
      left -= row.size;
    }
    await storage.remove(gone);
    for (const key of gone) rows.delete(key);
    total = left;
  }
  const refusedForSpace = (error) => error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22;
  const touch = (key) => {
    const row = rows?.get(key);
    if (!row) return;
    const at = now();
    row.lastPlayedAt = at;
    void queue(() => storage.touch(key, at)).catch(() => {});
  };
  return {
    /** Read the index, so has() can answer without waiting. False when the storage could not be read. */
    ready: () => load().then(() => true, () => false),
    /** True when the clip is known to be kept: a read by itself may then start even with no connection. */
    has: (key) => !!rows?.has(key),
    /** The kept clip, or null. Playing it counts as a play. */
    async get(key) {
      await load();
      const row = rows.get(key);
      if (!row) return null;
      const bytes = await storage.readBytes(key);
      if (!(bytes instanceof Uint8Array) || bytes.length !== row.size) return null;
      touch(key);
      return { bytes, contentType: row.contentType, voiceId: row.voice ?? null };
    },
    /** A clip played again from the page's own memory: it is still the most recently played. */
    touch,
    /** Keep a clip the server has just answered with. Audio bytes only; a clip larger than the whole cap is not kept. */
    put(key, clip) {
      return queue(async () => {
        const bytes = clip?.bytes;
        if (typeof key !== 'string' || !key || !(bytes instanceof Uint8Array) || !bytes.length || bytes.length > capBytes ||
            !/^audio\//iu.test(String(clip.contentType || ''))) return false;
        await load();
        const at = now();
        const row = { key, contentType: clip.contentType, voice: clip.voiceId ?? null, size: bytes.length, savedAt: at, lastPlayedAt: at };
        try {
          await storage.write(row, bytes);
        } catch (error) {
          if (!refusedForSpace(error)) throw error;
          // The browser refused the space: the clips least recently played go until this one fits, and it is tried once
          // more; a second refusal gives up, silently. Speech never waits on a write (the seam does not await it).
          await evictTo(Math.max(0, total - bytes.length), key);
          try { await storage.write(row, bytes); } catch { return false; }
        }
        const before = rows.get(key);
        if (before) total -= before.size;
        rows.set(key, row);
        total += row.size;
        await evictTo(capBytes, key);
        return true;
      });
    },
    /** Every write asked for so far has settled. */
    idle: () => chain,
    /** What is kept: how many clips and how many bytes. */
    size: () => ({ clips: rows?.size || 0, bytes: total }),
  };
}
