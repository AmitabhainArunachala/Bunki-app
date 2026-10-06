import {
  createReplica,
  createSyncOperation,
  createSyncOperationV2,
  isAssessmentOperationV2,
  operationReference,
  parseActorIdentity,
  parseSyncBinding,
  parseAnySyncOperation as parseSyncOperation,
  planReceive,
  SYNC_SCHEMA_VERSION,
  type ActorIdentity,
  type OperationRef,
  type ReplicaPolicy,
  type SyncBinding,
  type SyncOperation,
  type SyncReplica,
} from '@bunki/sync';

import type { SqliteDriver } from '../sqlite/driver.ts';
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
import { initializeReplicationSchema } from './schema.ts';

export interface OpenReplicationStoreOptions {
  readonly policy: ReplicaPolicy;
  /** Never restore/reinstall with a copied active incarnation. */
  readonly actor: ActorIdentity;
}

interface ProfileRow {
  revision: number;
  policy: string;
  policy_sha256: string;
  view: string;
  view_sha256: string;
}
interface ActorRow {
  device_id: string;
  incarnation_id: string;
  sequence: number;
  last_op_id: string | null;
  last_op_sha256: string | null;
}
interface OperationRow {
  op_id: string;
  sha256: string;
  device_id: string;
  incarnation_id: string;
  sequence: number;
  payload: string;
  payload_sha256: string;
}
interface CurrentState {
  readonly revision: number;
  readonly replica: SyncReplica;
  readonly actor: ActorIdentity & {
    readonly sequence: number;
    readonly predecessor: OperationRef | null;
  };
}
const WHERE_SCOPE = 'account_id = ? AND learner_id = ?';

function assertKeys(value: object, keys: readonly string[]): void {
  if (Object.keys(value).sort().join('\u0000') !== [...keys].sort().join('\u0000')) {
    throw new ReplicationStoreError('invalid-request');
  }
}

function viewOf(replica: SyncReplica) {
  return encodeLocalJson({
    ready: replica.ready,
    pending: replica.pending,
    quarantined: replica.quarantined,
    projection: replica.projection,
  });
}

/**
 * A transaction port, not an authenticated transport or a second merge kernel.
 * All statements run through the existing SQLite seam; no Node builtin enters
 * this module. node:sqlite tests are ci-substitute evidence, never device proof.
 */
export class SqliteReplicationStore implements ReplicationStore {
  readonly #driver: SqliteDriver;
  readonly #policy: ReplicaPolicy;
  readonly #actor: ActorIdentity;
  readonly #scope: readonly [string, string];
  #closed = false;
  #uncertain = false;
  #inTransaction = false;

  private constructor(driver: SqliteDriver, options: OpenReplicationStoreOptions) {
    this.#driver = driver;
    this.#policy = createReplica(options.policy).policy;
    this.#actor = parseActorIdentity(options.actor);
    this.#scope = [this.#policy.binding.accountId, this.#policy.binding.learnerId];
  }

  /** Takes ownership of the driver, including closing it if initialization fails. */
  static open(driver: SqliteDriver, options: OpenReplicationStoreOptions): SqliteReplicationStore {
    try {
      const store = new SqliteReplicationStore(driver, options);
      driver.exec('PRAGMA foreign_keys = ON');
      driver.exec('PRAGMA journal_mode = WAL');
      driver.exec('PRAGMA synchronous = FULL');
      driver.exec('PRAGMA secure_delete = ON');
      driver.exec('PRAGMA busy_timeout = 1000');
      store.#transaction(() => {
        initializeReplicationSchema(driver);
        const existing = driver.all<ProfileRow>(
          `SELECT * FROM kairo_replication_profiles WHERE ${WHERE_SCOPE}`,
          store.#scope,
        )[0];
        if (!existing) {
          const policy = encodeLocalJson(store.#policy);
          const view = viewOf(createReplica(store.#policy));
          driver.run(
            `INSERT INTO kairo_replication_profiles
            (account_id, learner_id, revision, policy, policy_sha256, view, view_sha256) VALUES (?, ?, 0, ?, ?, ?, ?)`,
            [...store.#scope, policy.text, policy.sha256, view.text, view.sha256],
          );
        }
        store.#readPolicy();
        const actor = driver.all<ActorRow>(
          `SELECT * FROM kairo_replication_actors
          WHERE ${WHERE_SCOPE} AND device_id = ? AND incarnation_id = ?`,
          [...store.#scope, store.#actor.deviceId, store.#actor.incarnationId],
        )[0];
        if (!actor) {
          const alreadyClaimed = driver.all<{ n: number }>(
            `SELECT COUNT(*) AS n FROM kairo_replication_operations
            WHERE ${WHERE_SCOPE} AND device_id = ? AND incarnation_id = ?`,
            [...store.#scope, store.#actor.deviceId, store.#actor.incarnationId],
          )[0]?.n;
          if (alreadyClaimed) throw new ReplicationStoreError('local-actor-conflict');
          driver.run(
            `INSERT INTO kairo_replication_actors
            (account_id, learner_id, device_id, incarnation_id, sequence, last_op_id, last_op_sha256)
            VALUES (?, ?, ?, ?, 0, NULL, NULL)`,
            [...store.#scope, store.#actor.deviceId, store.#actor.incarnationId],
          );
        }
        store.#load();
      });
      return store;
    } catch (error) {
      try {
        driver.close();
      } catch {
        /* Preserve initialization failure. */
      }
      throw error;
    }
  }

  #assertOpen(): void {
    if (this.#closed) throw new ReplicationStoreError('closed');
    if (this.#uncertain) throw new ReplicationStoreError('reopen-required');
  }

  #transaction<T>(body: () => T): T {
    this.#assertOpen();
    if (this.#inTransaction) throw new ReplicationStoreError('reopen-required');
    this.#driver.exec('BEGIN IMMEDIATE');
    this.#inTransaction = true;
    let committing = false;
    try {
      const result = body();
      committing = true;
      this.#driver.exec('COMMIT');
      return result;
    } catch (error) {
      // A failed COMMIT acknowledgement may follow a successful durable commit.
      // Never reuse that connection or claim rollback without a successful reopen.
      if (committing) this.#uncertain = true;
      try {
        this.#driver.exec('ROLLBACK');
      } catch {
        this.#uncertain = true;
      }
      throw error;
    } finally {
      this.#inTransaction = false;
    }
  }

  #readPolicy(): { row: ProfileRow; policy: ReplicaPolicy } {
    const row = this.#driver.all<ProfileRow>(
      `SELECT * FROM kairo_replication_profiles WHERE ${WHERE_SCOPE}`,
      this.#scope,
    )[0];
    if (!row) throw new ReplicationStoreError('corrupt-store');
    assertCounter(row.revision);
    const policy = createReplica(
      readLocalJson(row.policy, row.policy_sha256) as ReplicaPolicy,
    ).policy;
    planReceive(createReplica(policy), { binding: this.#policy.binding, operations: [] });
    if (encodeLocalJson(policy).text !== encodeLocalJson(this.#policy).text)
      throw new ReplicationStoreError('policy-mismatch');
    return { row, policy };
  }

  #assertBinding(replica: SyncReplica, binding: SyncBinding): void {
    planReceive(replica, { binding, operations: [] });
  }

  #load(): CurrentState {
    const { row, policy } = this.#readPolicy();
    let replica = createReplica(policy);
    const operations = this.#driver
      .all<OperationRow>(
        `SELECT * FROM kairo_replication_operations
      WHERE ${WHERE_SCOPE} ORDER BY op_id`,
        this.#scope,
      )
      .map((stored) => {
        try {
          const operation = parseSyncOperation(
            readLocalJson(stored.payload, stored.payload_sha256),
          );
          const ref = operationReference(operation);
          if (
            ref.opId !== stored.op_id ||
            ref.sha256 !== stored.sha256 ||
            operation.actor.deviceId !== stored.device_id ||
            operation.actor.incarnationId !== stored.incarnation_id ||
            operation.actor.sequence !== stored.sequence
          )
            throw new ReplicationStoreError('corrupt-store');
          return operation;
        } catch {
          throw new ReplicationStoreError('corrupt-store');
        }
      });
    // Only the sync core reconstructs readiness/conflict/tombstone semantics.
    for (let start = 0; start < operations.length; start += 1000) {
      replica = planReceive(replica, {
        binding: policy.binding,
        operations: operations.slice(start, start + 1000),
      }).next;
    }
    const view = viewOf(replica);
    if (encodeLocalJson(readLocalJson(row.view, row.view_sha256)).text !== view.text)
      throw new ReplicationStoreError('corrupt-store');
    const byId = new Map(operations.map((operation) => [operation.opId, operation]));
    const actors = this.#driver.all<ActorRow>(
      `SELECT * FROM kairo_replication_actors WHERE ${WHERE_SCOPE}`,
      this.#scope,
    );
    let actor: CurrentState['actor'] | undefined;
    for (const stored of actors) {
      assertCounter(stored.sequence);
      const identity = parseActorIdentity({
        deviceId: stored.device_id,
        incarnationId: stored.incarnation_id,
      });
      const predecessor =
        stored.last_op_id === null
          ? null
          : { opId: stored.last_op_id, sha256: stored.last_op_sha256 ?? '' };
      const last = predecessor === null ? undefined : byId.get(predecessor.opId);
      if (
        stored.sequence === 0
          ? predecessor !== null || stored.last_op_sha256 !== null
          : !last ||
            operationReference(last).sha256 !== predecessor?.sha256 ||
            last.actor.sequence !== stored.sequence ||
            last.actor.deviceId !== identity.deviceId ||
            last.actor.incarnationId !== identity.incarnationId
      )
        throw new ReplicationStoreError('corrupt-store');
      if (
        operations.some(
          (operation) =>
            operation.actor.deviceId === identity.deviceId &&
            operation.actor.incarnationId === identity.incarnationId &&
            operation.actor.sequence > stored.sequence,
        )
      ) {
        throw new ReplicationStoreError('corrupt-store');
      }
      if (
        identity.deviceId === this.#actor.deviceId &&
        identity.incarnationId === this.#actor.incarnationId
      ) {
        actor = { ...identity, sequence: stored.sequence, predecessor };
      }
    }
    if (!actor) throw new ReplicationStoreError('corrupt-store');
    return { revision: row.revision, replica, actor };
  }

  #assertRevision(current: CurrentState, expected: number): void {
    assertCounter(expected);
    if (current.revision !== expected) throw new ReplicationStoreError('stale-revision');
    if (current.revision === Number.MAX_SAFE_INTEGER)
      throw new ReplicationStoreError('sequence-exhausted');
  }

  #prior(kind: string, changeId: string, fingerprint: string): DurableCommitReceipt | null {
    const row = this.#driver.all<{
      request_sha256: string;
      revision: number;
      operations: string;
      operations_sha256: string;
    }>(
      `SELECT request_sha256, revision, operations, operations_sha256 FROM kairo_replication_receipts
       WHERE ${WHERE_SCOPE} AND kind = ? AND change_id = ?`,
      [...this.#scope, kind, changeId],
    )[0];
    if (!row) return null;
    if (row.request_sha256 !== fingerprint)
      throw new ReplicationStoreError('change-identity-conflict');
    return {
      changeId,
      committedRevision: row.revision,
      operations: readLocalJson(row.operations, row.operations_sha256) as readonly OperationRef[],
      outcome: 'duplicate',
      runtimeLabel: this.#driver.label,
    };
  }

  #insert(operation: SyncOperation): void {
    const ref = operationReference(operation);
    const payload = encodeLocalJson(operation);
    this.#driver.run(
      `INSERT INTO kairo_replication_operations
      (account_id, learner_id, op_id, sha256, device_id, incarnation_id, sequence, payload, payload_sha256)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ...this.#scope,
        ref.opId,
        ref.sha256,
        operation.actor.deviceId,
        operation.actor.incarnationId,
        operation.actor.sequence,
        payload.text,
        payload.sha256,
      ],
    );
  }

  #finish(
    kind: string,
    changeId: string,
    fingerprint: string,
    current: CurrentState,
    next: SyncReplica,
    operations: readonly OperationRef[],
  ): DurableCommitReceipt {
    const view = viewOf(next);
    const revision = current.revision + 1;
    const update = this.#driver.run(
      `UPDATE kairo_replication_profiles SET revision = ?, view = ?, view_sha256 = ?
      WHERE ${WHERE_SCOPE} AND revision = ?`,
      [revision, view.text, view.sha256, ...this.#scope, current.revision],
    );
    if (update.changes !== 1) throw new ReplicationStoreError('stale-revision');
    const refs = encodeLocalJson(operations);
    this.#driver.run(
      `INSERT INTO kairo_replication_receipts
      (account_id, learner_id, kind, change_id, request_sha256, revision, operations, operations_sha256)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [...this.#scope, kind, changeId, fingerprint, revision, refs.text, refs.sha256],
    );
    return {
      changeId,
      committedRevision: revision,
      operations,
      outcome: 'committed',
      runtimeLabel: this.#driver.label,
    };
  }

  async snapshot(): Promise<ReplicationSnapshot> {
    return this.#transaction(() => {
      const current = this.#load();
      const byId = new Map(
        current.replica.operations.map((operation) => [operation.opId, operation]),
      );
      const checkedRef = (id: string, sha256: string): SyncOperation => {
        const operation = byId.get(id);
        if (!operation || operationReference(operation).sha256 !== sha256)
          throw new ReplicationStoreError('corrupt-store');
        return operation;
      };
      const documents: LocalDocument[] = this.#driver
        .all<{ collection: string; document_id: string; payload: string; sha256: string }>(
          `SELECT collection, document_id, payload, sha256 FROM kairo_replication_documents WHERE ${WHERE_SCOPE}
         ORDER BY collection, document_id`,
          this.#scope,
        )
        .map((row) => ({
          collection: row.collection,
          id: row.document_id,
          value: readLocalJson(row.payload, row.sha256),
        }));
      const outbox: SyncOperation[] = [];
      const acknowledgedOutbox: OperationRef[] = [];
      for (const row of this.#driver.all<{ op_id: string; sha256: string; acknowledged: number }>(
        `SELECT op_id, sha256, acknowledged FROM kairo_replication_outbox WHERE ${WHERE_SCOPE} ORDER BY op_id`,
        this.#scope,
      )) {
        const operation = checkedRef(row.op_id, row.sha256);
        if (row.acknowledged === 0) outbox.push(operation);
        else if (row.acknowledged === 1) acknowledgedOutbox.push(operationReference(operation));
        else throw new ReplicationStoreError('corrupt-store');
      }
      const inbox = this.#driver
        .all<{ channel_id: string; op_id: string; sha256: string }>(
          `SELECT channel_id, op_id, sha256 FROM kairo_replication_inbox WHERE ${WHERE_SCOPE} ORDER BY channel_id, op_id`,
          this.#scope,
        )
        .map((row) => ({
          channelId: row.channel_id,
          operation: operationReference(checkedRef(row.op_id, row.sha256)),
        }));
      const checkpoints = this.#driver
        .all<{ channel_id: string; value: string }>(
          `SELECT channel_id, value FROM kairo_replication_checkpoints WHERE ${WHERE_SCOPE} ORDER BY channel_id`,
          this.#scope,
        )
        .map((row) => ({ channelId: row.channel_id, value: row.value }));
      return {
        ...current,
        policy: current.replica.policy,
        documents,
        outbox,
        acknowledgedOutbox,
        inbox,
        checkpoints,
        runtimeLabel: this.#driver.label,
      };
    });
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
    ) {
      throw new ReplicationStoreError('invalid-request');
    }
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
      const key = JSON.stringify([mutation.collection, mutation.id]);
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
    return this.#transaction(() => {
      const current = this.#load();
      this.#assertBinding(current.replica, request.binding);
      const prior = this.#prior('local', request.changeId, fingerprint);
      if (prior) return prior;
      this.#assertRevision(current, request.expectedRevision);
      let sequence = current.actor.sequence;
      let predecessor = current.actor.predecessor;
      const operations = request.operations.map((intent) => {
        if (sequence === Number.MAX_SAFE_INTEGER)
          throw new ReplicationStoreError('sequence-exhausted');
        sequence += 1;
        const assessmentV2 = isAssessmentOperationV2(intent.payload);
        const operation = (assessmentV2 ? createSyncOperationV2 : createSyncOperation)({
          format: 'kairo-sync-operation',
          v: assessmentV2 ? 2 : SYNC_SCHEMA_VERSION,
          scope: {
            accountId: current.replica.policy.binding.accountId,
            learnerId: current.replica.policy.binding.learnerId,
          },
          actor: { ...this.#actor, sequence },
          predecessor,
          dependencies: intent.dependencies,
          schemaEpoch: current.replica.policy.schemaEpoch,
          deletionEpoch: current.replica.policy.deletionEpoch,
          mergePolicy: current.replica.policy.mergePolicy,
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
        if (mutation.kind === 'delete') {
          this.#driver.run(
            `DELETE FROM kairo_replication_documents WHERE ${WHERE_SCOPE} AND collection = ? AND document_id = ?`,
            [...this.#scope, mutation.collection, mutation.id],
          );
        } else {
          const payload = encodeLocalJson(mutation.value);
          this.#driver.run(
            `INSERT INTO kairo_replication_documents (account_id, learner_id, collection, document_id, payload, sha256)
            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(account_id, learner_id, collection, document_id)
            DO UPDATE SET payload = excluded.payload, sha256 = excluded.sha256`,
            [...this.#scope, mutation.collection, mutation.id, payload.text, payload.sha256],
          );
        }
      }
      for (const operation of operations) {
        this.#insert(operation);
        const ref = operationReference(operation);
        this.#driver.run(
          `INSERT INTO kairo_replication_outbox (account_id, learner_id, op_id, sha256, acknowledged)
          VALUES (?, ?, ?, ?, 0)`,
          [...this.#scope, ref.opId, ref.sha256],
        );
      }
      const advanced = this.#driver.run(
        `UPDATE kairo_replication_actors SET sequence = ?, last_op_id = ?, last_op_sha256 = ?
        WHERE ${WHERE_SCOPE} AND device_id = ? AND incarnation_id = ?`,
        [
          sequence,
          predecessor?.opId ?? null,
          predecessor?.sha256 ?? null,
          ...this.#scope,
          this.#actor.deviceId,
          this.#actor.incarnationId,
        ],
      );
      if (advanced.changes !== 1) throw new ReplicationStoreError('corrupt-store');
      return this.#finish(
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
    for (const cursor of [request.checkpoint.expected, request.checkpoint.next]) {
      if (cursor !== null && (typeof cursor !== 'string' || cursor.length > 8192))
        throw new ReplicationStoreError('invalid-request');
    }
    if (typeof request.checkpoint.next !== 'string')
      throw new ReplicationStoreError('invalid-request');
    const fingerprint = encodeLocalJson({
      operations: request.delivery.operations,
      checkpoint: request.checkpoint,
    }).sha256;
    return this.#transaction(() => {
      const current = this.#load();
      this.#assertBinding(current.replica, request.delivery.binding);
      const prior = this.#prior('receive', request.deliveryId, fingerprint);
      if (prior) return prior;
      this.#assertRevision(current, request.expectedRevision);
      const cursor =
        this.#driver.all<{ value: string }>(
          `SELECT value FROM kairo_replication_checkpoints
        WHERE ${WHERE_SCOPE} AND channel_id = ?`,
          [...this.#scope, request.checkpoint.channelId],
        )[0]?.value ?? null;
      if (cursor !== request.checkpoint.expected)
        throw new ReplicationStoreError('checkpoint-conflict');
      const plan = planReceive(current.replica, request.delivery);
      for (const operation of plan.insert) {
        const owned = this.#driver.all<{ n: number }>(
          `SELECT COUNT(*) AS n FROM kairo_replication_actors
          WHERE ${WHERE_SCOPE} AND device_id = ? AND incarnation_id = ?`,
          [...this.#scope, operation.actor.deviceId, operation.actor.incarnationId],
        )[0]?.n;
        if (owned) throw new ReplicationStoreError('local-actor-conflict');
      }
      for (const operation of plan.insert) this.#insert(operation);
      const refs = [...plan.insert.map(operationReference), ...plan.duplicates];
      for (const ref of refs) {
        this.#driver.run(
          `INSERT INTO kairo_replication_inbox (account_id, learner_id, channel_id, op_id, sha256)
          VALUES (?, ?, ?, ?, ?) ON CONFLICT(account_id, learner_id, channel_id, op_id) DO NOTHING`,
          [...this.#scope, request.checkpoint.channelId, ref.opId, ref.sha256],
        );
      }
      this.#driver.run(
        `INSERT INTO kairo_replication_checkpoints (account_id, learner_id, channel_id, value)
        VALUES (?, ?, ?, ?) ON CONFLICT(account_id, learner_id, channel_id) DO UPDATE SET value = excluded.value`,
        [...this.#scope, request.checkpoint.channelId, request.checkpoint.next],
      );
      return this.#finish('receive', request.deliveryId, fingerprint, current, plan.next, refs);
    });
  }

  async commitRestore(raw: RestoreCommit): Promise<DurableCommitReceipt> {
    return this.#transaction(() => {
      const current = this.#load();
      const request = prepareRestoreRequest(raw, current.replica.policy);
      const fingerprint = encodeLocalJson({
        mutations: request.mutations,
        backup: request.backup,
      }).sha256;
      const prior = this.#prior('restore', request.restoreId, fingerprint);
      if (prior) return prior;
      this.#assertRevision(current, request.expectedRevision);
      const plan = planJournalRestore(current.replica, request.backup);
      for (const operation of plan.insert) {
        const owned = this.#driver.all<{ n: number }>(
          `SELECT COUNT(*) AS n FROM kairo_replication_actors
          WHERE ${WHERE_SCOPE} AND device_id = ? AND incarnation_id = ?`,
          [...this.#scope, operation.actor.deviceId, operation.actor.incarnationId],
        )[0]?.n;
        if (owned) throw new ReplicationStoreError('local-actor-conflict');
      }
      for (const mutation of request.mutations) {
        if (mutation.kind === 'delete') {
          this.#driver.run(
            `DELETE FROM kairo_replication_documents WHERE ${WHERE_SCOPE} AND collection = ? AND document_id = ?`,
            [...this.#scope, mutation.collection, mutation.id],
          );
        } else {
          const payload = encodeLocalJson(mutation.value);
          this.#driver.run(
            `INSERT INTO kairo_replication_documents (account_id, learner_id, collection, document_id, payload, sha256)
            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(account_id, learner_id, collection, document_id)
            DO UPDATE SET payload = excluded.payload, sha256 = excluded.sha256`,
            [...this.#scope, mutation.collection, mutation.id, payload.text, payload.sha256],
          );
        }
      }
      for (const operation of plan.insert) {
        this.#insert(operation);
        const ref = operationReference(operation);
        this.#driver.run(
          `INSERT INTO kairo_replication_outbox (account_id, learner_id, op_id, sha256, acknowledged)
          VALUES (?, ?, ?, ?, 0)`,
          [...this.#scope, ref.opId, ref.sha256],
        );
      }
      return this.#finish(
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
    ) {
      throw new ReplicationStoreError('invalid-request');
    }
    const fingerprint = encodeLocalJson(request.operations).sha256;
    return this.#transaction(() => {
      const current = this.#load();
      this.#assertBinding(current.replica, request.binding);
      const prior = this.#prior('acknowledge', request.acknowledgementId, fingerprint);
      if (prior) return prior;
      this.#assertRevision(current, request.expectedRevision);
      const seen = new Set<string>();
      for (const ref of request.operations) {
        assertKeys(ref, ['opId', 'sha256']);
        if (seen.has(ref.opId)) throw new ReplicationStoreError('invalid-request');
        seen.add(ref.opId);
        const row = this.#driver.all<{ sha256: string }>(
          `SELECT sha256 FROM kairo_replication_outbox
          WHERE ${WHERE_SCOPE} AND op_id = ?`,
          [...this.#scope, ref.opId],
        )[0];
        if (!row || row.sha256 !== ref.sha256) throw new ReplicationStoreError('invalid-request');
      }
      for (const ref of request.operations)
        this.#driver.run(
          `UPDATE kairo_replication_outbox SET acknowledged = 1
        WHERE ${WHERE_SCOPE} AND op_id = ?`,
          [...this.#scope, ref.opId],
        );
      return this.#finish(
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
    return this.#transaction(() => {
      const current = this.#load();
      this.#assertRevision(current, expectedRevision);
      if (binding.sessionId === current.replica.policy.binding.sessionId) {
        throw new ReplicationStoreError('invalid-request');
      }
      const next = createReplica({ ...current.replica.policy, binding });
      // The new session may change; account/profile reassignment is never permitted.
      planReceive(next, {
        binding: { ...this.#policy.binding, sessionId: binding.sessionId },
        operations: [],
      });
      let rebuilt = next;
      for (let start = 0; start < current.replica.operations.length; start += 1000) {
        rebuilt = planReceive(rebuilt, {
          binding,
          operations: current.replica.operations.slice(start, start + 1000),
        }).next;
      }
      const policy = encodeLocalJson(rebuilt.policy);
      const view = viewOf(rebuilt);
      const changed = this.#driver.run(
        `UPDATE kairo_replication_profiles SET revision = ?, policy = ?, policy_sha256 = ?, view = ?, view_sha256 = ?
        WHERE ${WHERE_SCOPE} AND revision = ?`,
        [
          current.revision + 1,
          policy.text,
          policy.sha256,
          view.text,
          view.sha256,
          ...this.#scope,
          current.revision,
        ],
      );
      if (changed.changes !== 1) throw new ReplicationStoreError('stale-revision');
      return current.revision + 1;
    });
  }

  async close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      this.#driver.close();
    }
  }
}
