// One IndexedDB transaction commits content and its append-only review ledger.
// oncomplete, not request.onsuccess, is the durability acknowledgement to the UI.
export const DB_NAME = 'bunki-personal-collections-v1';
const STORE = 'collections';
export function openStore(factory = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!factory) return reject(new Error('Device storage is unavailable. No progress was changed.'));
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, {keyPath:'id'});
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Bunki windows, then reopen this collection.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve({
        close:() => db.close(),
        list:() => read(db, null),
        get:id => read(db, id),
        update:(id, revision, transform) => update(db, id, revision, transform),
      });
    };
  });
}
function read(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = id === null ? tx.objectStore(STORE).getAll() : tx.objectStore(STORE).get(id);
    let result;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Could not read device storage.'));
  });
}
function update(db, id, revision, transform) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(STORE, 'readwrite', {durability:'strict'}); }
    catch { tx = db.transaction(STORE, 'readwrite'); } // older WebKit
    const store = tx.objectStore(STORE), request = store.get(id);
    let result, failure;
    request.onsuccess = () => {
      try {
        const current = request.result;
        if ((current?.revision ?? null) !== revision) throw new Error('This collection changed in another window. Reopen it before continuing. Nothing was overwritten.');
        result = transform(current);
        if (!result || result.id !== id || result.then) throw new Error('Invalid storage transaction.');
        result = {...result, revision:(current?.revision || 0) + 1};
        store.put(result);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('Progress was not saved. Check available device storage and try again.'));
  });
}
