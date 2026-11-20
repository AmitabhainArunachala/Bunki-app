/** Separate private CAS storage. No learner journal or audio bytes live here. */
import {canonicalStringify} from '../schema/event.mjs';

const HASH = /^[a-f0-9]{64}$/, ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const integer = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const text = value => typeof value === 'string' && /\S/u.test(value);
const check = ok => { if (!ok) throw new TypeError('invalid-private-audio-storage'); };
function exact(value, keys) {
  check(value && [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)));
}
function json(value) {
  if (value && typeof value === 'object') {
    const array = Array.isArray(value);
    check(array ? Object.getPrototypeOf(value) === Array.prototype : [Object.prototype, null].includes(Object.getPrototypeOf(value)));
    if (array) check(Reflect.ownKeys(value).length === value.length + 1);
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(value, key);
      check(typeof key === 'string' && d.enumerable && Object.hasOwn(d, 'value')); json(d.value);
    }
  } else canonicalStringify(value);
}
function namespaceKey(ns) {
  json(ns); exact(ns, ['environment', 'learner', 'installation', 'epoch']);
  check(['environment', 'learner', 'installation'].every(k => typeof ns[k] === 'string' && ID.test(ns[k]) && !/^nsrs_/i.test(ns[k])) && integer(ns.epoch));
  return JSON.stringify([ns.environment, ns.learner, ns.installation, ns.epoch]);
}
function snapshot(value) {
  json(value); exact(value, ['revision', 'demands', 'staleDemandIds']);
  check(integer(value.revision) && Array.isArray(value.demands) && value.demands.length <= 20_000 &&
    Array.isArray(value.staleDemandIds) && value.staleDemandIds.length <= 20_000);
  const ids = new Set();
  for (const d of value.demands) {
    exact(d, ['demandId', 'ownerKey', 'audioContentRevision', 'sourceProof', 'batch', 'state', 'pendingReasons']);
    check([d.demandId, d.ownerKey, d.audioContentRevision].every(v => typeof v === 'string' && HASH.test(v)) && !ids.has(d.demandId));
    ids.add(d.demandId);
    check(d.state === 'pending' && Array.isArray(d.pendingReasons) && d.pendingReasons.length <= 64 && d.pendingReasons.every(text));
    const p = d.sourceProof;
    if (p?.kind === 'catalog') {
      exact(p, ['kind', 'taskKey', 'sourceRevision']);
      check(text(p.taskKey) && text(p.sourceRevision) && d.batch === null && d.pendingReasons.includes('source-resolution-required'));
    } else if (p?.kind === 'manual-card') {
      exact(p, ['kind', 'eventId', 'bodyHash']); check(text(p.eventId) && typeof p.bodyHash === 'string' && HASH.test(p.bodyHash));
      const b = d.batch;
      exact(b, ['catalog', 'grammarRecords', 'sourceRevision', 'scope', 'assignments']);
      check(Array.isArray(b.catalog) && b.catalog.length === 1 && b.catalog[0].manual === true &&
        b.catalog[0].contentReady === true && text(b.catalog[0].taskKey) &&
        Array.isArray(b.grammarRecords) && b.grammarRecords.length === 0 && text(b.sourceRevision));
      exact(b.scope, ['accessScope', 'licenseScope']); check(Object.values(b.scope).every(text));
      exact(b.assignments, ['profiles', 'languageAssignments', 'readingAssignments']);
      for (const k of ['languageAssignments', 'readingAssignments']) {
        const map = b.assignments[k];
        check(map && !Array.isArray(map) && Object.keys(map).every(key => key === b.catalog[0].taskKey));
      }
      check(b.assignments.profiles && !Array.isArray(b.assignments.profiles));
    } else {
      exact(p, ['kind', 'sourceId', 'contractId', 'sourceRevision']);
      check(p.kind === 'unsupported' && [p.sourceId, p.contractId, p.sourceRevision].every(text) &&
        d.batch === null && d.pendingReasons.includes('unsupported-contract'));
    }
  }
  check(value.staleDemandIds.every(id => typeof id === 'string' && HASH.test(id) && !ids.has(id)) &&
    new Set(value.staleDemandIds).size === value.staleDemandIds.length);
  const encoded = canonicalStringify(value);
  check(new TextEncoder().encode(encoded).byteLength <= 32 * 1024 * 1024);
  return JSON.parse(encoded);
}

export function createPrivateAudioDemandSink({indexedDB = globalThis.indexedDB} = {}) {
  check(indexedDB && typeof indexedDB.open === 'function');
  let opening, closed = false;
  const open = () => {
    if (closed) return Promise.reject(Error('private-audio-storage-closed'));
    if (opening) return opening;
    const pending = new Promise((resolve, reject) => {
      const request = indexedDB.open('nsrs-private-audio-demand-v1', 1);
      let failed = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('demands')) request.result.createObjectStore('demands');
      };
      request.onerror = request.onblocked = () => { failed = true; reject(Error('private-audio-storage-open-failed')); };
      request.onsuccess = () => {
        const db = request.result;
        if (failed || closed) { db.close(); reject(Error('private-audio-storage-closed')); return; }
        db.onversionchange = () => { db.close(); if (opening === pending) opening = undefined; };
        resolve(db);
      };
    }).catch(error => { if (opening === pending) opening = undefined; throw error; });
    opening = pending;
    return pending;
  };
  return Object.freeze({
    async read(namespace) {
      const key = namespaceKey(namespace), db = await open();
      if (closed) throw Error('private-audio-storage-closed');
      return new Promise((resolve, reject) => {
        let value = null, invalid = false;
        const tx = db.transaction('demands', 'readonly'), request = tx.objectStore('demands').get(key);
        request.onsuccess = () => { try { value = request.result == null ? null : snapshot(request.result); } catch { invalid = true; } };
        tx.oncomplete = () => invalid ? reject(Error('private-audio-storage-invalid')) : resolve(value);
        tx.onabort = tx.onerror = () => reject(Error('private-audio-storage-read-failed'));
      });
    },
    async compareAndSwap(namespace, expectedRevision, candidate) {
      const key = namespaceKey(namespace), next = snapshot(candidate);
      check((expectedRevision === null || integer(expectedRevision)) && next.revision === (expectedRevision === null ? 0 : expectedRevision + 1));
      const db = await open();
      if (closed) throw Error('private-audio-storage-closed');
      return new Promise((resolve, reject) => {
        let swapped = false, invalid = false;
        const tx = db.transaction('demands', 'readwrite', {durability: 'strict'}), store = tx.objectStore('demands'), request = store.get(key);
        request.onsuccess = () => {
          try {
            const previous = request.result == null ? null : snapshot(request.result);
            if (closed || (previous?.revision ?? null) !== expectedRevision) return;
            store.put(next, key); swapped = true;
          } catch { invalid = true; }
        };
        tx.oncomplete = () => invalid ? reject(Error('private-audio-storage-write-failed')) : resolve(swapped);
        tx.onabort = tx.onerror = () => reject(Error('private-audio-storage-write-failed'));
      });
    },
    async close() { closed = true; if (opening) { try { (await opening).close(); } catch { /* failed open owns no database */ } } },
  });
}

export function selectAudioDemandSink({native = false, nativeCapability = globalThis.nihongoAudioDemandStore, indexedDB = globalThis.indexedDB} = {}) {
  if (native) return nativeCapability?.protocol === 'nsrs-private-audio-demand/v1' &&
    typeof nativeCapability.read === 'function' && typeof nativeCapability.compareAndSwap === 'function'
    ? {state: 'available', sink: nativeCapability} : {state: 'persistence-unavailable', sink: null};
  return indexedDB && typeof indexedDB.open === 'function'
    ? {state: 'available', sink: createPrivateAudioDemandSink({indexedDB})} : {state: 'persistence-unavailable', sink: null};
}
