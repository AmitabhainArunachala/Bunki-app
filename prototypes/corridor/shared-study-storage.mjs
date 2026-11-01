import {createIndexedDBAdapter} from './vendor/shared-study-engine/client/engine.mjs';
/** Bunki owns only the namespace. The canonical adapter owns transactional CAS,
 * strict durability, reopen and failure handling, exactly as in standalone. */
export function createSharedStudyStorage({indexedDB=globalThis.indexedDB,databaseName}={}) {
  if(!/^bunki-shared-study-[A-Za-z0-9._-]+$/.test(databaseName||''))throw Error('shared-storage-scope');
  return createIndexedDBAdapter({indexedDB,databaseName});
}
