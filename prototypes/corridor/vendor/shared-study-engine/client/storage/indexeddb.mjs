/** Real IndexedDB adapter. Transaction completion, not request success, resolves writes. */
import {registerOwnedReader} from './read-ownership.mjs';
export function createIndexedDBAdapter({ indexedDB = globalThis.indexedDB, databaseName = 'nsrs-replica-qa-v1' } = {}) {
  if (!indexedDB || typeof indexedDB.open !== 'function') throw Error('indexeddb-unavailable');
  if (!/^[A-Za-z0-9._-]{1,96}$/.test(databaseName) || /^nsrs_(dev|bak|adm)_/.test(databaseName)) throw Error('invalid-database-name');
  let opening;
  const key = scope => JSON.stringify([scope.environment, scope.learner, scope.installation]);
  const open = () => {
    if (opening) return opening;
    const pending = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    let failed = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('replicas')) request.result.createObjectStore('replicas');
    };
    request.onblocked = () => { failed = true; reject(Error('indexeddb-blocked')); };
    request.onerror = () => { failed = true; reject(Error('indexeddb-open-failed')); };
    request.onsuccess = () => {
      const database = request.result;
      if (failed) { database.close(); return; }
      database.onversionchange = () => { database.close(); if (opening === pending) opening = undefined; };
      resolve(database);
    };
    }).catch(error => { if (opening === pending) opening = undefined; throw error; });
    opening = pending;
    return pending;
  };
  return registerOwnedReader(Object.freeze({
    // Each IDB request materializes a new structured clone. The caller alone
    // owns it; mutating it cannot alter the database or a later read result.
    async read(scope) {
      const database = await open();
      return new Promise((resolve, reject) => {
        let result;
        const transaction = database.transaction('replicas', 'readonly');
        const request = transaction.objectStore('replicas').get(key(scope));
        request.onsuccess = () => { result = request.result ?? null; };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = transaction.onerror = () => reject(Error('indexeddb-read-failed'));
      });
    },
    async compareAndSwap(scope, expectedRevision, candidate) {
      const database = await open();
      // Request strict durability. Some engines ignore unsupported dictionary
      // members; actual persistence capability remains a separate device check.
      return new Promise((resolve, reject) => {
        let swapped = false;
        const transaction = database.transaction('replicas', 'readwrite', { durability: 'strict' });
        const store = transaction.objectStore('replicas');
        const request = store.get(key(scope));
        request.onsuccess = () => {
          if ((request.result?.storageRevision ?? null) !== expectedRevision) return;
          // Keep all operations in the request callback. No awaited work can auto-close the transaction.
          store.put(candidate, key(scope));
          swapped = true;
        };
        transaction.oncomplete = () => resolve(swapped);
        transaction.onabort = transaction.onerror = () => reject(Error('indexeddb-write-failed'));
      });
    },
    async close() { if (opening) { const database = await opening; database.close(); opening = undefined; } },
  }));
}
