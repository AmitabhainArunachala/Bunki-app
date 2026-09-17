/// <reference lib="dom" />

import {
  createReplica,
  createSyncOperation,
  operationReference,
  parseActorIdentity,
  parseSyncBinding,
  parseSyncOperation,
  planReceive,
  SYNC_SCHEMA_VERSION,
  type ActorIdentity,
  type OperationRef,
  type ReplicaPolicy,
  type SyncBinding,
  type SyncOperation,
  type SyncReplica,
} from '@bunki/sync';

import { planJournalRestore, prepareRestoreRequest } from './backup.ts';
import { ReplicationStoreError } from './errors.ts';
import { assertCounter, assertLocalKey, encodeLocalJson, readLocalJson } from './json.ts';
import type {
  DurableCommitReceipt,
  LocalCommit,
  LocalDocument,
  OutboxAcknowledgement,
  ReceiveCommit,
  RestoreCommit,
  ReplicationSnapshot,
  ReplicationStore,
} from './port.ts';

const VERSION = 1;
const ROWS = 'kairo_replication_rows';
const META = 'kairo_replication_meta';
const SCHEMA = 'kairo-indexeddb-replication/1';
const KINDS = [
  'profile',
  'actor',
  'operation',
  'document',
  'outbox',
  'inbox',
  'checkpoint',
  'receipt',
] as const;
type Kind = (typeof KINDS)[number];
type Scope = readonly [string, string];

export interface OpenIndexedDbReplicationStoreOptions {
  /** Dedicated database name. Do not point this at an existing learner database. */
  readonly databaseName: string;
  readonly policy: ReplicaPolicy;
  /** Restored/cloned installations must use a fresh incarnation. */
  readonly actor: ActorIdentity;
  /** Bounded open, including browsers that never deliver a blocked event. */
  readonly openTimeoutMs?: number;
}

interface StoredRow {
  accountId: string;
  learnerId: string;
  kind: Kind;
  id: string;
  text: string;
  sha256: string;
}
interface Profile {
  revision: number;
  policy: ReplicaPolicy;
  view: ReturnType<typeof viewOf>['value'];
}
interface Actor extends ActorIdentity {
  sequence: number;
  predecessor: OperationRef | null;
}
interface Outbox {
  operation: OperationRef;
  acknowledged: boolean;
}
interface Inbox {
  channelId: string;
  operation: OperationRef;
}
interface Checkpoint {
  channelId: string;
  value: string;
}
interface Receipt {
  requestSha256: string;
  revision: number;
  operations: readonly OperationRef[];
}
interface Current {
  revision: number;
  replica: SyncReplica;
  actor: Actor;
}

function assertKeys(value: unknown, keys: readonly string[]): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join('\u0000') !== [...keys].sort().join('\u0000')
  )
    throw new ReplicationStoreError('invalid-request');
}
function id(...parts: string[]): string {
  return JSON.stringify(parts);
}
function viewOf(replica: SyncReplica) {
  return encodeLocalJson({
    ready: replica.ready,
    pending: replica.pending,
    quarantined: replica.quarantined,
    projection: replica.projection,
  });
}
function refEqual(a: OperationRef, b: OperationRef): boolean {
  return a.opId === b.opId && a.sha256 === b.sha256;
}

/** A transaction-local row set. Values remain independently hashed on disk. */
class Rows {
  readonly #rows = new Map<Kind, Map<string, unknown>>(KINDS.map((kind) => [kind, new Map()]));
  constructor(
    readonly scope: Scope,
    readonly store: IDBObjectStore,
    raw: readonly StoredRow[],
  ) {
    try {
      for (const row of raw) {
        assertKeys(row, ['accountId', 'learnerId', 'kind', 'id', 'text', 'sha256']);
        if (
          row.accountId !== scope[0] ||
          row.learnerId !== scope[1] ||
          typeof row.id !== 'string' ||
          typeof row.text !== 'string' ||
          typeof row.sha256 !== 'string'
        )
          throw new ReplicationStoreError('corrupt-store');
        const table = this.#rows.get(row.kind);
        if (!table || table.has(row.id)) throw new ReplicationStoreError('corrupt-store');
        table.set(row.id, readLocalJson(row.text, row.sha256));
      }
    } catch {
      throw new ReplicationStoreError('corrupt-store');
    }
  }
  get<T>(kind: Kind, key: string): T | undefined {
    return this.#rows.get(kind)?.get(key) as T | undefined;
  }
  all<T>(kind: Kind): [string, T][] {
    return [...(this.#rows.get(kind) ?? [])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) as [
      string,
      T,
    ][];
  }
  put(kind: Kind, key: string, value: unknown): void {
    const payload = encodeLocalJson(value);
    this.store.put({
      accountId: this.scope[0],
      learnerId: this.scope[1],
      kind,
      id: key,
      text: payload.text,
      sha256: payload.sha256,
    } satisfies StoredRow);
    this.#rows.get(kind)?.set(key, payload.value);
  }
  delete(kind: Kind, key: string): void {
    this.store.delete([this.scope[0], this.scope[1], kind, key]);
    this.#rows.get(kind)?.delete(key);
  }
}

/**
 * Real browser persistence. No promises, network calls, async hashing or timers
 * are awaited inside an IDB request callback: the entire plan and write queue
 * are produced while the transaction is active. A request success never counts
 * as a commit; only the transaction's complete event resolves the caller.
 */
export class IndexedDbReplicationStore implements ReplicationStore {
  readonly #db: IDBDatabase;
  readonly #policy: ReplicaPolicy;
  readonly #actor: ActorIdentity;
  readonly #scope: Scope;
  readonly #active = new Set<Promise<unknown>>();
  #closed = false;

  private constructor(db: IDBDatabase, policy: ReplicaPolicy, actor: ActorIdentity) {
    this.#db = db;
    this.#policy = policy;
    this.#actor = actor;
    this.#scope = [policy.binding.accountId, policy.binding.learnerId];
    db.onversionchange = () => {
      this.#closed = true;
      db.close();
    };
    db.onclose = () => {
      this.#closed = true;
    };
  }

  static async open(
    options: OpenIndexedDbReplicationStoreOptions,
  ): Promise<IndexedDbReplicationStore> {
    assertLocalKey(options.databaseName);
    const policy = createReplica(options.policy).policy;
    const actor = parseActorIdentity(options.actor);
    const timeout = options.openTimeoutMs ?? 5000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000)
      throw new ReplicationStoreError('invalid-request');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      let done = false;
      let request: IDBOpenDBRequest;
      const timer = globalThis.setTimeout(
        () => fail(new ReplicationStoreError('reopen-required')),
        timeout,
      );
      function fail(error: unknown): void {
        if (done) return;
        done = true;
        globalThis.clearTimeout(timer);
        try {
          request?.transaction?.abort();
        } catch {
          /* A completed open is closed below. */
        }
        reject(error);
      }
      try {
        if (!globalThis.indexedDB) throw new ReplicationStoreError('reopen-required');
        request = globalThis.indexedDB.open(options.databaseName, VERSION);
        request.onblocked = () => fail(new ReplicationStoreError('reopen-required'));
        request.onerror = () =>
          fail(
            new ReplicationStoreError(
              request.error?.name === 'VersionError' ? 'unsupported-schema' : 'reopen-required',
            ),
          );
        request.onupgradeneeded = (event) => {
          try {
            if (done || event.oldVersion !== 0)
              throw new ReplicationStoreError('unsupported-schema');
            const opened = request.result;
            const rows = opened.createObjectStore(ROWS, {
              keyPath: ['accountId', 'learnerId', 'kind', 'id'],
            });
            rows.createIndex('scope', ['accountId', 'learnerId'], { unique: false });
            opened
              .createObjectStore(META, { keyPath: 'id' })
              .add({ id: 'schema', format: SCHEMA, v: VERSION });
          } catch (error) {
            fail(error);
          }
        };
        request.onsuccess = () => {
          if (done) {
            request.result.close();
            return;
          }
          done = true;
          globalThis.clearTimeout(timer);
          resolve(request.result);
        };
      } catch (error) {
        fail(error);
      }
    });
    const store = new IndexedDbReplicationStore(db, policy, actor);
    try {
      if (
        db.version !== VERSION ||
        [...db.objectStoreNames].sort().join() !== [META, ROWS].sort().join()
      )
        throw new ReplicationStoreError('unsupported-schema');
      await store.#transaction('readwrite', (rows) => {
        if (!rows.get('profile', 'current')) {
          if (KINDS.some((kind) => rows.all(kind).length))
            throw new ReplicationStoreError('corrupt-store');
          rows.put('profile', 'current', {
            revision: 0,
            policy,
            view: viewOf(createReplica(policy)).value,
          });
        }
        store.#readPolicy(rows);
        if (!rows.get('actor', id(actor.deviceId, actor.incarnationId))) {
          if (
            rows
              .all<SyncOperation>('operation')
              .some(
                ([, operation]) =>
                  operation.actor.deviceId === actor.deviceId &&
                  operation.actor.incarnationId === actor.incarnationId,
              )
          )
            throw new ReplicationStoreError('local-actor-conflict');
          rows.put('actor', id(actor.deviceId, actor.incarnationId), {
            ...actor,
            sequence: 0,
            predecessor: null,
          });
        }
        store.#snapshot(rows);
      });
      return store;
    } catch (error) {
      await store.close();
      throw error;
    }
  }

  #transaction<T>(mode: IDBTransactionMode, body: (rows: Rows) => T): Promise<T> {
    if (this.#closed) return Promise.reject(new ReplicationStoreError('closed'));
    const promise = new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        // Both supported browser engines accept strict durability. Never fall
        // back to weaker durability when the caller expected this contract.
        tx = this.#db.transaction([META, ROWS], mode, { durability: 'strict' });
      } catch (error) {
        reject(error);
        return;
      }
      let result: T;
      let ready = false;
      let failure: unknown;
      let aborting = false;
      const timer = globalThis.setTimeout(
        () => abort(new ReplicationStoreError('reopen-required')),
        30_000,
      );
      const abort = (error: unknown): void => {
        failure ??= error;
        // Cancelling queued requests emits more error events. The confirmed
        // abort remains one operation; aborting twice would close a healthy DB.
        if (aborting) return;
        aborting = true;
        try {
          tx.abort();
        } catch {
          this.#closed = true;
          this.#db.close();
        }
      };
      tx.onabort = () => {
        globalThis.clearTimeout(timer);
        reject(failure ?? tx.error ?? new ReplicationStoreError('reopen-required'));
      };
      tx.onerror = (event) => {
        const error = event.target instanceof IDBRequest ? event.target.error : tx.error;
        // The browser (or caller teardown) may already have aborted this TX.
        // Cancelled requests emit AbortError before the confirming abort event.
        if (error?.name === 'AbortError') {
          failure ??= error;
          return;
        }
        abort(error ?? new ReplicationStoreError('reopen-required'));
      };
      tx.oncomplete = () => {
        globalThis.clearTimeout(timer);
        if (!ready || failure) {
          this.#closed = true;
          this.#db.close();
          reject(failure ?? new ReplicationStoreError('reopen-required'));
        } else resolve(result);
      };
      try {
        const table = tx.objectStore(ROWS);
        if (
          JSON.stringify(table.keyPath) !==
            JSON.stringify(['accountId', 'learnerId', 'kind', 'id']) ||
          table.autoIncrement ||
          [...table.indexNames].join() !== 'scope' ||
          JSON.stringify(table.index('scope').keyPath) !==
            JSON.stringify(['accountId', 'learnerId']) ||
          table.index('scope').unique ||
          table.index('scope').multiEntry ||
          tx.objectStore(META).keyPath !== 'id' ||
          tx.objectStore(META).autoIncrement
        )
          throw new ReplicationStoreError('unsupported-schema');
        const marker = tx.objectStore(META).get('schema');
        const stored = table.index('scope').getAll([...this.#scope]);
        let loaded = 0;
        const run = (): void => {
          loaded += 1;
          if (loaded !== 2) return;
          try {
            if (
              !marker.result ||
              encodeLocalJson(marker.result).text !==
                encodeLocalJson({ id: 'schema', format: SCHEMA, v: VERSION }).text
            )
              throw new ReplicationStoreError('unsupported-schema');
            result = body(new Rows(this.#scope, table, stored.result as StoredRow[]));
            ready = true;
          } catch (error) {
            abort(error);
          }
        };
        marker.onsuccess = run;
        stored.onsuccess = run;
      } catch (error) {
        abort(error);
      }
    });
    this.#active.add(promise);
    void promise.then(
      () => this.#active.delete(promise),
      () => this.#active.delete(promise),
    );
    return promise;
  }

  #readPolicy(rows: Rows): Profile {
    const profile = rows.get<Profile>('profile', 'current');
    if (!profile || rows.all('profile').length !== 1)
      throw new ReplicationStoreError('corrupt-store');
    assertKeys(profile, ['revision', 'policy', 'view']);
    assertCounter(profile.revision);
    const policy = createReplica(profile.policy).policy;
    planReceive(createReplica(policy), { binding: this.#policy.binding, operations: [] });
    if (encodeLocalJson(policy).text !== encodeLocalJson(this.#policy).text)
      throw new ReplicationStoreError('policy-mismatch');
    return profile;
  }

  #load(rows: Rows): Current {
    const profile = this.#readPolicy(rows);
    let replica = createReplica(profile.policy);
    const operations = rows.all<SyncOperation>('operation').map(([key, raw]) => {
      try {
        const operation = parseSyncOperation(raw);
        if (operation.opId !== key) throw new ReplicationStoreError('corrupt-store');
        return operation;
      } catch {
        throw new ReplicationStoreError('corrupt-store');
      }
    });
    for (let start = 0; start < operations.length; start += 1000)
      replica = planReceive(replica, {
        binding: profile.policy.binding,
        operations: operations.slice(start, start + 1000),
      }).next;
    if (encodeLocalJson(profile.view).text !== viewOf(replica).text)
      throw new ReplicationStoreError('corrupt-store');
    const byId = new Map(operations.map((operation) => [operation.opId, operation]));
    let actor: Actor | undefined;
    for (const [key, stored] of rows.all<Actor>('actor')) {
      assertKeys(stored, ['deviceId', 'incarnationId', 'sequence', 'predecessor']);
      const identity = parseActorIdentity({
        deviceId: stored.deviceId,
        incarnationId: stored.incarnationId,
      });
      assertCounter(stored.sequence);
      if (id(identity.deviceId, identity.incarnationId) !== key)
        throw new ReplicationStoreError('corrupt-store');
      if (stored.predecessor !== null) assertKeys(stored.predecessor, ['opId', 'sha256']);
      const last = stored.predecessor === null ? undefined : byId.get(stored.predecessor.opId);
      if (
        stored.sequence === 0
          ? stored.predecessor !== null
          : !last ||
            !stored.predecessor ||
            !refEqual(operationReference(last), stored.predecessor) ||
            last.actor.sequence !== stored.sequence ||
            last.actor.deviceId !== stored.deviceId ||
            last.actor.incarnationId !== stored.incarnationId
      )
        throw new ReplicationStoreError('corrupt-store');
      if (
        operations.some(
          (operation) =>
            operation.actor.deviceId === stored.deviceId &&
            operation.actor.incarnationId === stored.incarnationId &&
            operation.actor.sequence > stored.sequence,
        )
      )
        throw new ReplicationStoreError('corrupt-store');
      if (
        stored.deviceId === this.#actor.deviceId &&
        stored.incarnationId === this.#actor.incarnationId
      )
        actor = stored;
    }
    if (!actor) throw new ReplicationStoreError('corrupt-store');
    return { revision: profile.revision, replica, actor };
  }

  #snapshot(rows: Rows): ReplicationSnapshot {
    const current = this.#load(rows);
    const byId = new Map(
      current.replica.operations.map((operation) => [operation.opId, operation]),
    );
    const checked = (ref: OperationRef): SyncOperation => {
      assertKeys(ref, ['opId', 'sha256']);
      const operation = byId.get(ref.opId);
      if (!operation || !refEqual(operationReference(operation), ref))
        throw new ReplicationStoreError('corrupt-store');
      return operation;
    };
    const documents = rows.all<LocalDocument>('document').map(([key, document]) => {
      assertKeys(document, ['collection', 'id', 'value']);
      assertLocalKey(document.collection);
      assertLocalKey(document.id);
      if (key !== id(document.collection, document.id))
        throw new ReplicationStoreError('corrupt-store');
      return document;
    });
    const outbox: SyncOperation[] = [];
    const acknowledgedOutbox: OperationRef[] = [];
    for (const [key, row] of rows.all<Outbox>('outbox')) {
      assertKeys(row, ['operation', 'acknowledged']);
      const operation = checked(row.operation);
      if (key !== operation.opId || typeof row.acknowledged !== 'boolean')
        throw new ReplicationStoreError('corrupt-store');
      if (row.acknowledged) acknowledgedOutbox.push(row.operation);
      else outbox.push(operation);
    }
    const inbox = rows.all<Inbox>('inbox').map(([key, row]) => {
      assertKeys(row, ['channelId', 'operation']);
      assertLocalKey(row.channelId);
      if (key !== id(row.channelId, checked(row.operation).opId))
        throw new ReplicationStoreError('corrupt-store');
      return row;
    });
    const checkpoints = rows.all<Checkpoint>('checkpoint').map(([key, row]) => {
      assertKeys(row, ['channelId', 'value']);
      assertLocalKey(row.channelId);
      if (key !== row.channelId || typeof row.value !== 'string' || row.value.length > 8192)
        throw new ReplicationStoreError('corrupt-store');
      return row;
    });
    for (const [, row] of rows.all<Receipt>('receipt')) {
      assertKeys(row, ['requestSha256', 'revision', 'operations']);
      assertCounter(row.revision);
      if (
        typeof row.requestSha256 !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(row.requestSha256) ||
        row.revision > current.revision ||
        !Array.isArray(row.operations)
      )
        throw new ReplicationStoreError('corrupt-store');
      for (const ref of row.operations) checked(ref);
    }
    return {
      ...current,
      policy: current.replica.policy,
      documents,
      outbox,
      acknowledgedOutbox,
      inbox,
      checkpoints,
      runtimeLabel: 'browser',
    };
  }

  #assertRevision(current: Current, expected: number): void {
    assertCounter(expected);
    if (current.revision !== expected) throw new ReplicationStoreError('stale-revision');
    if (current.revision === Number.MAX_SAFE_INTEGER)
      throw new ReplicationStoreError('sequence-exhausted');
  }
  #prior(
    rows: Rows,
    kind: string,
    changeId: string,
    fingerprint: string,
  ): DurableCommitReceipt | null {
    const row = rows.get<Receipt>('receipt', id(kind, changeId));
    if (!row) return null;
    if (row.requestSha256 !== fingerprint)
      throw new ReplicationStoreError('change-identity-conflict');
    return {
      changeId,
      committedRevision: row.revision,
      operations: row.operations,
      outcome: 'duplicate',
      runtimeLabel: 'browser',
    };
  }
  #finish(
    rows: Rows,
    kind: string,
    changeId: string,
    fingerprint: string,
    current: Current,
    next: SyncReplica,
    operations: readonly OperationRef[],
  ): DurableCommitReceipt {
    const revision = current.revision + 1;
    rows.put('profile', 'current', { revision, policy: next.policy, view: viewOf(next).value });
    rows.put('receipt', id(kind, changeId), { requestSha256: fingerprint, revision, operations });
    return {
      changeId,
      committedRevision: revision,
      operations,
      outcome: 'committed',
      runtimeLabel: 'browser',
    };
  }

  async snapshot(): Promise<ReplicationSnapshot> {
    return this.#transaction('readonly', (rows) => this.#snapshot(rows));
  }

  async commitLocal(raw: LocalCommit): Promise<DurableCommitReceipt> {
    const request = encodeLocalJson(raw).value as unknown as LocalCommit;
    assertKeys(request, [
      'changeId',
      'binding',
      'expectedRevision',
      'occurredAt',
      'mutations',
      'operations',
    ]);
    assertLocalKey(request.changeId);
    assertCounter(request.expectedRevision);
    if (
      !Array.isArray(request.mutations) ||
      request.mutations.length > 256 ||
      !Array.isArray(request.operations) ||
      request.operations.length > 100 ||
      request.mutations.length + request.operations.length === 0 ||
      typeof request.occurredAt !== 'string'
    )
      throw new ReplicationStoreError('invalid-request');
    const seen = new Set<string>();
    for (const mutation of request.mutations) {
      assertKeys(
        mutation,
        mutation.kind === 'put'
          ? ['kind', 'collection', 'id', 'value']
          : ['kind', 'collection', 'id'],
      );
      if (mutation.kind !== 'put' && mutation.kind !== 'delete')
        throw new ReplicationStoreError('invalid-request');
      assertLocalKey(mutation.collection);
      assertLocalKey(mutation.id);
      const key = id(mutation.collection, mutation.id);
      if (seen.has(key)) throw new ReplicationStoreError('invalid-request');
      seen.add(key);
    }
    for (const operation of request.operations) assertKeys(operation, ['payload', 'dependencies']);
    const fingerprint = encodeLocalJson({
      actor: this.#actor,
      occurredAt: request.occurredAt,
      mutations: request.mutations,
      operations: request.operations,
    }).sha256;
    return this.#transaction('readwrite', (rows) => {
      const current = this.#snapshot(rows);
      planReceive(current.replica, { binding: request.binding, operations: [] });
      const prior = this.#prior(rows, 'local', request.changeId, fingerprint);
      if (prior) return prior;
      this.#assertRevision(current, request.expectedRevision);
      let sequence = current.actor.sequence;
      let predecessor = current.actor.predecessor;
      const operations = request.operations.map((intent) => {
        if (sequence === Number.MAX_SAFE_INTEGER)
          throw new ReplicationStoreError('sequence-exhausted');
        sequence += 1;
        const operation = createSyncOperation({
          format: 'kairo-sync-operation',
          v: SYNC_SCHEMA_VERSION,
          scope: { accountId: this.#scope[0], learnerId: this.#scope[1] },
          actor: { ...this.#actor, sequence },
          predecessor,
          dependencies: intent.dependencies,
          schemaEpoch: current.policy.schemaEpoch,
          deletionEpoch: current.policy.deletionEpoch,
          mergePolicy: current.policy.mergePolicy,
          occurredAt: request.occurredAt,
          payload: intent.payload,
        });
        predecessor = operationReference(operation);
        return operation;
      });
      const plan = planReceive(current.replica, { binding: request.binding, operations });
      if (plan.insert.length !== operations.length)
        throw new ReplicationStoreError('local-actor-conflict');
      for (const mutation of request.mutations) {
        const key = id(mutation.collection, mutation.id);
        if (mutation.kind === 'delete') rows.delete('document', key);
        else
          rows.put('document', key, {
            collection: mutation.collection,
            id: mutation.id,
            value: mutation.value,
          });
      }
      for (const operation of operations) {
        rows.put('operation', operation.opId, operation);
        rows.put('outbox', operation.opId, {
          operation: operationReference(operation),
          acknowledged: false,
        });
      }
      rows.put('actor', id(this.#actor.deviceId, this.#actor.incarnationId), {
        ...this.#actor,
        sequence,
        predecessor,
      });
      return this.#finish(
        rows,
        'local',
        request.changeId,
        fingerprint,
        current,
        plan.next,
        operations.map(operationReference),
      );
    });
  }

  async commitReceive(raw: ReceiveCommit): Promise<DurableCommitReceipt> {
    const request = encodeLocalJson(raw).value as unknown as ReceiveCommit;
    assertKeys(request, ['deliveryId', 'expectedRevision', 'delivery', 'checkpoint']);
    assertCounter(request.expectedRevision);
    assertKeys(request.delivery, ['binding', 'operations']);
    assertKeys(request.checkpoint, ['channelId', 'expected', 'next']);
    assertLocalKey(request.deliveryId);
    assertLocalKey(request.checkpoint.channelId);
    for (const cursor of [request.checkpoint.expected, request.checkpoint.next])
      if (cursor !== null && (typeof cursor !== 'string' || cursor.length > 8192))
        throw new ReplicationStoreError('invalid-request');
    if (typeof request.checkpoint.next !== 'string')
      throw new ReplicationStoreError('invalid-request');
    const fingerprint = encodeLocalJson({
      operations: request.delivery.operations,
      checkpoint: request.checkpoint,
    }).sha256;
    return this.#transaction('readwrite', (rows) => {
      const current = this.#snapshot(rows);
      planReceive(current.replica, { binding: request.delivery.binding, operations: [] });
      const prior = this.#prior(rows, 'receive', request.deliveryId, fingerprint);
      if (prior) return prior;
      this.#assertRevision(current, request.expectedRevision);
      const cursor =
        rows.get<Checkpoint>('checkpoint', request.checkpoint.channelId)?.value ?? null;
      if (cursor !== request.checkpoint.expected)
        throw new ReplicationStoreError('checkpoint-conflict');
      const plan = planReceive(current.replica, request.delivery);
      for (const operation of plan.insert)
        if (rows.get('actor', id(operation.actor.deviceId, operation.actor.incarnationId)))
          throw new ReplicationStoreError('local-actor-conflict');
      for (const operation of plan.insert) rows.put('operation', operation.opId, operation);
      const refs = [...plan.insert.map(operationReference), ...plan.duplicates];
      for (const ref of refs)
        rows.put('inbox', id(request.checkpoint.channelId, ref.opId), {
          channelId: request.checkpoint.channelId,
          operation: ref,
        });
      rows.put('checkpoint', request.checkpoint.channelId, {
        channelId: request.checkpoint.channelId,
        value: request.checkpoint.next,
      });
      return this.#finish(
        rows,
        'receive',
        request.deliveryId,
        fingerprint,
        current,
        plan.next,
        refs,
      );
    });
  }

  async commitRestore(raw: RestoreCommit): Promise<DurableCommitReceipt> {
    return this.#transaction('readwrite', (rows) => {
      const current = this.#snapshot(rows);
      const request = prepareRestoreRequest(raw, current.policy);
      const fingerprint = encodeLocalJson({
        mutations: request.mutations,
        backup: request.backup,
      }).sha256;
      const prior = this.#prior(rows, 'restore', request.restoreId, fingerprint);
      if (prior) return prior;
      this.#assertRevision(current, request.expectedRevision);
      const plan = planJournalRestore(current.replica, request.backup);
      for (const operation of plan.insert)
        if (rows.get('actor', id(operation.actor.deviceId, operation.actor.incarnationId)))
          throw new ReplicationStoreError('local-actor-conflict');
      for (const mutation of request.mutations) {
        const key = id(mutation.collection, mutation.id);
        if (mutation.kind === 'delete') rows.delete('document', key);
        else
          rows.put('document', key, {
            collection: mutation.collection,
            id: mutation.id,
            value: mutation.value,
          });
      }
      for (const operation of plan.insert) {
        rows.put('operation', operation.opId, operation);
        rows.put('outbox', operation.opId, {
          operation: operationReference(operation),
          acknowledged: false,
        });
      }
      return this.#finish(
        rows,
        'restore',
        request.restoreId,
        fingerprint,
        current,
        plan.next,
        plan.insert.map(operationReference),
      );
    });
  }

  async acknowledgeOutbox(raw: OutboxAcknowledgement): Promise<DurableCommitReceipt> {
    const request = encodeLocalJson(raw).value as unknown as OutboxAcknowledgement;
    assertKeys(request, ['acknowledgementId', 'binding', 'expectedRevision', 'operations']);
    assertCounter(request.expectedRevision);
    assertLocalKey(request.acknowledgementId);
    if (
      !Array.isArray(request.operations) ||
      !request.operations.length ||
      request.operations.length > 1000
    )
      throw new ReplicationStoreError('invalid-request');
    const fingerprint = encodeLocalJson(request.operations).sha256;
    return this.#transaction('readwrite', (rows) => {
      const current = this.#snapshot(rows);
      planReceive(current.replica, { binding: request.binding, operations: [] });
      const prior = this.#prior(rows, 'acknowledge', request.acknowledgementId, fingerprint);
      if (prior) return prior;
      this.#assertRevision(current, request.expectedRevision);
      const seen = new Set<string>();
      for (const ref of request.operations) {
        assertKeys(ref, ['opId', 'sha256']);
        if (seen.has(ref.opId)) throw new ReplicationStoreError('invalid-request');
        seen.add(ref.opId);
        const row = rows.get<Outbox>('outbox', ref.opId);
        if (!row || !refEqual(row.operation, ref))
          throw new ReplicationStoreError('invalid-request');
      }
      for (const ref of request.operations)
        rows.put('outbox', ref.opId, { operation: ref, acknowledged: true });
      return this.#finish(
        rows,
        'acknowledge',
        request.acknowledgementId,
        fingerprint,
        current,
        current.replica,
        request.operations,
      );
    });
  }

  async replaceSession(expectedRevision: number, rawBinding: SyncBinding): Promise<number> {
    const binding = parseSyncBinding(rawBinding);
    return this.#transaction('readwrite', (rows) => {
      const current = this.#snapshot(rows);
      this.#assertRevision(current, expectedRevision);
      if (binding.sessionId === current.policy.binding.sessionId)
        throw new ReplicationStoreError('invalid-request');
      let next = createReplica({ ...current.policy, binding });
      planReceive(next, {
        binding: { ...this.#policy.binding, sessionId: binding.sessionId },
        operations: [],
      });
      for (let start = 0; start < current.replica.operations.length; start += 1000)
        next = planReceive(next, {
          binding,
          operations: current.replica.operations.slice(start, start + 1000),
        }).next;
      rows.put('profile', 'current', {
        revision: current.revision + 1,
        policy: next.policy,
        view: viewOf(next).value,
      });
      return current.revision + 1;
    });
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#db.close();
    await Promise.allSettled([...this.#active]);
  }
}
