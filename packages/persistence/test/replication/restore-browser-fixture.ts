import { IndexedDbReplicationStore } from '../../src/replication/indexeddb.ts';
import {
  exportOperationJournal,
  parseOperationJournalBackup,
} from '../../src/replication/backup.ts';
import { encodeLocalJson } from '../../src/replication/json.ts';
import type {
  LocalCommit,
  RestoreCommit,
  ReceiveCommit,
  OutboxAcknowledgement,
} from '../../src/replication/port.ts';
import {
  createReplica,
  planReceive,
  operationReference,
  type SyncOperation,
  type ActorIdentity,
  type ReplicaPolicy,
} from '@bunki/sync';
import { POLICY, ACTOR, local, note, remote } from './fixtures.ts';

const stores = new Map<string, IndexedDbReplicationStore>();
const databases = new Map<string, string>();
const nativePut = IDBObjectStore.prototype.put;
const nativeTransaction = IDBDatabase.prototype.transaction;
type FaultMode = 'abort' | 'quota' | 'lose-ack';
let fault: {
  database: string;
  kind: string;
  mode: FaultMode;
  fired: boolean;
  succeeded: boolean;
  completed: boolean;
} | null = null;
IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
  const tx = nativeTransaction.apply(this, args);
  const current = fault;
  if (current && this.name === current.database && args[1] === 'readwrite')
    tx.addEventListener('complete', (event) => {
      if (current.fired) {
        current.completed = true;
        if (current.mode === 'lose-ack') event.stopImmediatePropagation();
      }
    });
  return tx;
};
IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
  const result = nativePut.apply(this, args);
  const current = fault;
  const value = args[0] as { kind?: string };
  if (
    !current ||
    current.fired ||
    this.transaction.db.name !== current.database ||
    value.kind !== current.kind
  )
    return result;
  if (current.mode === 'quota') {
    current.fired = true;
    throw new DOMException('Synthetic quota after queued native write', 'QuotaExceededError');
  }
  result.addEventListener('success', () => {
    if (current.fired) return;
    current.fired = true;
    current.succeeded = true;
    if (current.mode === 'abort') this.transaction.abort();
  });
  return result;
};
function store(name = 'current') {
  const value = stores.get(name);
  if (!value) throw new Error('Missing synthetic restore store');
  return value;
}
const fixture = {
  POLICY,
  ACTOR,
  local,
  note,
  remote,
  operationReference,
  exportOperationJournal,
  parseOperationJournalBackup,
  async open(
    database: string,
    name = 'current',
    actor: ActorIdentity = ACTOR,
    policy: ReplicaPolicy = POLICY,
  ) {
    stores.set(
      name,
      await IndexedDbReplicationStore.open({ databaseName: database, actor, policy }),
    );
    databases.set(name, database);
  },
  snapshot(name = 'current') {
    return store(name).snapshot();
  },
  async close(name = 'current') {
    await store(name).close();
    stores.delete(name);
  },
  commit(request: LocalCommit, name = 'current') {
    return store(name).commitLocal(request);
  },
  restore(request: RestoreCommit, name = 'current') {
    return store(name).commitRestore(request);
  },
  receive(request: ReceiveCommit, name = 'current') {
    return store(name).commitReceive(request);
  },
  acknowledge(request: OutboxAcknowledgement, name = 'current') {
    return store(name).acknowledgeOutbox(request);
  },
  packed(operations: readonly SyncOperation[], policy = POLICY) {
    let replica = createReplica(policy);
    for (let start = 0; start < operations.length; start += 1000)
      replica = planReceive(replica, {
        binding: policy.binding,
        operations: operations.slice(start, start + 1000),
      }).next;
    return exportOperationJournal(replica);
  },
  request(expectedRevision = 1): RestoreCommit {
    return {
      restoreId: 'restore-browser',
      binding: POLICY.binding,
      expectedRevision,
      backup: fixture.packed([remote('restored')]),
      mutations: [
        {
          kind: 'put',
          collection: 'learner-record',
          id: 'current',
          value: { restored: true, ['__proto__']: 'own-data' },
        },
      ],
    };
  },
  arm(kind: string, mode: FaultMode, name = 'current') {
    fault = {
      database: databases.get(name)!,
      kind,
      mode,
      fired: false,
      succeeded: false,
      completed: false,
    };
  },
  disarm() {
    fault = null;
  },
  fault() {
    return fault;
  },
  async disk(name = 'current') {
    const database = databases.get(name);
    if (!database) throw new Error('Missing synthetic restore database');
    const db = await new Promise<IDBDatabase>((done, fail) => {
      const req = indexedDB.open(database);
      req.onsuccess = () => done(req.result);
      req.onerror = () => fail(req.error);
    });
    try {
      const rows = await new Promise<unknown[]>((done, fail) => {
        const tx = db.transaction('kairo_replication_rows', 'readonly');
        const req = tx.objectStore('kairo_replication_rows').getAll();
        tx.oncomplete = () => done(req.result as unknown[]);
        tx.onabort = () => fail(tx.error);
      });
      return encodeLocalJson(rows).text;
    } finally {
      db.close();
    }
  },
};
export type RestoreBrowserFixture = typeof fixture;
declare global {
  interface Window {
    restoreFixture: RestoreBrowserFixture;
  }
}
window.restoreFixture = fixture;
