import {
  createSyncOperation,
  operationReference,
  SYNC_MERGE_POLICY,
  SYNC_SCHEMA_EPOCH,
  type ActorIdentity,
  type RecordOperation,
  type ReplicaPolicy,
  type SyncOperation,
} from '@bunki/sync';

import type { LocalCommit } from '../../src/replication/index.ts';
import type { SqliteDriver, SqlValue } from '../../src/sqlite/driver.ts';

export const POLICY: ReplicaPolicy = {
  binding: { accountId: 'account-a', learnerId: 'learner-a', sessionId: 'session-a' },
  schemaEpoch: SYNC_SCHEMA_EPOCH,
  deletionEpoch: 0,
  mergePolicy: SYNC_MERGE_POLICY,
};
export const ACTOR: ActorIdentity = { deviceId: 'mac-a', incarnationId: 'install-a' };
export const WHEN = '2026-09-10T01:00:00.000Z';

export function note(versionId: string, text = 'A local note'): RecordOperation {
  return {
    kind: 'note.version',
    noteId: 'note-a',
    versionId,
    generation: null,
    supersedes: [],
    segments: [{ kind: 'original', text }],
  };
}

export function local(changeId = 'change-a', expectedRevision = 0): LocalCommit {
  return {
    changeId,
    expectedRevision,
    binding: POLICY.binding,
    occurredAt: WHEN,
    mutations: [
      {
        kind: 'put',
        collection: 'local-reading',
        id: 'article-a',
        value: { fullBody: 'LOCAL_ONLY_FULL_BODY', provenance: { license: 'local-only' } },
      },
    ],
    operations: [{ payload: note('version-' + changeId), dependencies: [] }],
  };
}

export function remote(
  versionId: string,
  previous?: SyncOperation,
  payload = note(versionId),
  deviceId = 'phone-b',
): SyncOperation {
  return createSyncOperation({
    format: 'kairo-sync-operation',
    v: 1,
    scope: { accountId: 'account-a', learnerId: 'learner-a' },
    actor: {
      deviceId,
      incarnationId: 'install-b',
      sequence: previous ? previous.actor.sequence + 1 : 1,
    },
    predecessor: previous ? operationReference(previous) : null,
    dependencies: [],
    schemaEpoch: SYNC_SCHEMA_EPOCH,
    deletionEpoch: 0,
    mergePolicy: SYNC_MERGE_POLICY,
    occurredAt: WHEN,
    payload,
  });
}

export const LOCAL_FAULTS = {
  document: /^INSERT INTO kairo_replication_documents/u,
  operation: /^INSERT INTO kairo_replication_operations/u,
  outbox: /^INSERT INTO kairo_replication_outbox/u,
  actor: /^UPDATE kairo_replication_actors/u,
  view: /^UPDATE kairo_replication_profiles/u,
  receipt: /^INSERT INTO kairo_replication_receipts/u,
};
export const RECEIVE_FAULTS = {
  operation: /^INSERT INTO kairo_replication_operations/u,
  inbox: /^INSERT INTO kairo_replication_inbox/u,
  checkpoint: /^INSERT INTO kairo_replication_checkpoints/u,
  view: /^UPDATE kairo_replication_profiles/u,
  receipt: /^INSERT INTO kairo_replication_receipts/u,
};

/** Real SQLite executes first; only the fault boundary is injected. */
export class FaultDriver implements SqliteDriver {
  readonly label = 'ci-substitute' as const;
  readonly driverName: string;
  armed: RegExp | null = null;
  failCommit: 'before' | 'after' | null = null;
  fired = false;
  constructor(
    readonly underlying: SqliteDriver,
    readonly crash?: () => never,
  ) {
    this.driverName = underlying.driverName;
  }
  #fail(): never {
    this.fired = true;
    this.armed = null;
    this.failCommit = null;
    if (this.crash) return this.crash();
    throw new Error('SYNTHETIC_SQLITE_DRIVER_FAULT');
  }
  exec(sql: string): void {
    if (sql === 'COMMIT' && this.failCommit === 'before') this.#fail();
    this.underlying.exec(sql);
    if (sql === 'COMMIT' && this.failCommit === 'after') this.#fail();
  }
  run(sql: string, params: readonly SqlValue[] = []) {
    const result = this.underlying.run(sql, params);
    if (this.armed?.test(sql.trim())) this.#fail();
    return result;
  }
  all<TRow>(sql: string, params: readonly SqlValue[] = []): TRow[] {
    return this.underlying.all<TRow>(sql, params);
  }
  close(): void {
    this.underlying.close();
  }
}
