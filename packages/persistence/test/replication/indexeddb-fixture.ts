import {
  IndexedDbReplicationStore,
  type OpenIndexedDbReplicationStoreOptions,
} from '@bunki/persistence/replication/indexeddb';
import {
  createSyncOperation,
  operationReference,
  type SyncOperation,
  type SyncOperationInput,
} from '@bunki/sync';
import type {
  LocalCommit,
  OutboxAcknowledgement,
  ReceiveCommit,
} from '../../src/replication/port.ts';
import { ACTOR, POLICY, local, note, remote } from './fixtures.ts';

type FaultMode = 'abort' | 'constraint' | 'throw-quota' | 'hold' | 'lose-ack';
interface Fault {
  kind: string;
  mode: FaultMode;
  fired: boolean;
  completed: boolean;
  requestSucceeded: boolean;
}
const handles = new Map<string, IndexedDbReplicationStore>();
const originalPut = IDBObjectStore.prototype.put;
const originalTransaction = IDBDatabase.prototype.transaction;
let armed: Fault | null = null;
let lastTransactionCompleted = false;

IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
  const tx = originalTransaction.apply(this, args);
  if (args[1] === 'readwrite') {
    lastTransactionCompleted = false;
    tx.addEventListener('complete', (event) => {
      lastTransactionCompleted = true;
      if (armed?.mode === 'lose-ack' && armed.fired) {
        armed.completed = true;
        event.stopImmediatePropagation();
      }
    });
  }
  return tx;
};
IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
  const request = originalPut.apply(this, args);
  const value = args[0] as { kind?: string };
  const fault = armed;
  if (!fault || fault.fired || value.kind !== fault.kind) return request;
  if (fault.mode === 'throw-quota') {
    fault.fired = true;
    throw new DOMException('Synthetic quota fault after real request queued', 'QuotaExceededError');
  }
  request.addEventListener('success', () => {
    fault.fired = true;
    fault.requestSucceeded = true;
    if (fault.mode === 'abort') this.transaction.abort();
    else if (fault.mode === 'constraint') this.add(value);
    else if (fault.mode === 'hold') {
      const keepAlive = (): void => {
        if (armed !== fault) return;
        const next = this.get(request.result);
        next.addEventListener('success', keepAlive);
      };
      keepAlive();
    }
  });
  return request;
};

function handle(name = 'main'): IndexedDbReplicationStore {
  const store = handles.get(name);
  if (!store) throw new Error('Missing synthetic fixture handle');
  return store;
}
export const fixture = {
  POLICY,
  ACTOR,
  local,
  note,
  remote,
  createSyncOperation,
  operationReference,
  recreate(operation: SyncOperation, overrides: Partial<SyncOperationInput>) {
    const { opId: _id, payloadSha256: _digest, ...input } = operation;
    return createSyncOperation({ ...input, ...overrides });
  },
  delivery(
    operations: readonly SyncOperation[],
    expectedRevision = 0,
    deliveryId = 'delivery-a',
    expected: string | null = null,
    next = 'cursor-a',
  ): ReceiveCommit {
    return {
      deliveryId,
      expectedRevision,
      delivery: { binding: POLICY.binding, operations },
      checkpoint: { channelId: 'cloud', expected, next },
    };
  },
  rawOpen(databaseName: string, version?: number): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, version);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Synthetic raw open was unexpectedly blocked'));
      request.onsuccess = () => resolve(request.result);
    });
  },
  async open(
    databaseName: string,
    name = 'main',
    options: Partial<OpenIndexedDbReplicationStoreOptions> = {},
  ) {
    handles.set(
      name,
      await IndexedDbReplicationStore.open({
        databaseName,
        policy: POLICY,
        actor: ACTOR,
        ...options,
      }),
    );
  },
  async close(name = 'main') {
    await handle(name).close();
    handles.delete(name);
  },
  snapshot(name = 'main') {
    return handle(name).snapshot();
  },
  commit(request: LocalCommit, name = 'main') {
    return handle(name).commitLocal(request);
  },
  receive(request: ReceiveCommit, name = 'main') {
    return handle(name).commitReceive(request);
  },
  acknowledge(request: OutboxAcknowledgement, name = 'main') {
    return handle(name).acknowledgeOutbox(request);
  },
  replace(revision: number, binding: typeof POLICY.binding, name = 'main') {
    return handle(name).replaceSession(revision, binding);
  },
  arm(kind: string, mode: FaultMode) {
    armed = { kind, mode, fired: false, completed: false, requestSucceeded: false };
  },
  disarm() {
    armed = null;
  },
  fault() {
    return armed;
  },
  completed() {
    return lastTransactionCompleted;
  },
};
export type IndexedDbFixture = typeof fixture;
declare global {
  interface Window {
    fixture: IndexedDbFixture;
  }
}
window.fixture = fixture;
