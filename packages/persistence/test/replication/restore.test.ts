import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  createReplica,
  createSyncOperation,
  operationReference,
  planReceive,
  type ActorIdentity,
  type ReplicaPolicy,
  type SyncOperation,
} from '@bunki/sync';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  exportOperationJournal,
  parseOperationJournalBackup,
  type OperationJournalBackup,
} from '../../src/replication/backup.ts';
import { encodeLocalJson } from '../../src/replication/json.ts';
import type { LocalMutation, RestoreCommit } from '../../src/replication/port.ts';
import { SqliteReplicationStore } from '../../src/replication/sqlite.ts';
import type { SqliteDriver } from '../../src/sqlite/driver.ts';
import { openNodeSqliteDriver } from '../../src/sqlite/node-driver.ts';
import { ACTOR, FaultDriver, POLICY, WHEN, local, note, remote } from './fixtures.ts';

let directory: string;
let stores: SqliteReplicationStore[];
beforeEach(async () => {
  const base =
    process.env['KAIRO_EVIDENCE_DIR'] ??
    join(homedir(), '.dharma/test-runtime/replication-restore');
  await mkdir(base, { recursive: true });
  directory = await mkdtemp(join(base, 'sqlite-'));
  stores = [];
});
afterEach(async () => {
  for (const store of stores) await store.close();
  await rm(directory, { recursive: true, force: true });
});

function open(
  name = 'current',
  policy: ReplicaPolicy = POLICY,
  actor: ActorIdentity = ACTOR,
  fault = false,
) {
  const driver = new FaultDriver(openNodeSqliteDriver({ location: join(directory, `${name}.db`) }));
  const store = SqliteReplicationStore.open(fault ? driver : driver.underlying, { policy, actor });
  stores.push(store);
  return { store, driver };
}
function packed(operations: readonly SyncOperation[], policy = POLICY) {
  let replica = createReplica(policy);
  for (let start = 0; start < operations.length; start += 1000)
    replica = planReceive(replica, {
      binding: policy.binding,
      operations: operations.slice(start, start + 1000),
    }).next;
  return exportOperationJournal(replica);
}
function request(
  backup = packed([remote('backup')]),
  expectedRevision = 0,
  restoreId = 'restore-a',
  mutations: readonly LocalMutation[] = [
    {
      kind: 'put',
      collection: 'learner-record',
      id: 'current',
      value: { portable: 'admitted local record', ['__proto__']: { keep: 'own data' } },
    },
  ],
): RestoreCommit {
  return { restoreId, expectedRevision, binding: POLICY.binding, mutations, backup };
}
function disk(driver: SqliteDriver) {
  const tables = driver.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'kairo_replication_%' ORDER BY name",
  );
  return encodeLocalJson(
    tables.map(({ name }) => ({
      name,
      rows: driver
        .all(`SELECT * FROM ${name}`)
        .map((row) => encodeLocalJson(row).text)
        .sort(),
    })),
  ).text;
}
function resign(value: OperationJournalBackup): OperationJournalBackup {
  const { sha256: _digest, ...body } = value;
  return { ...body, sha256: encodeLocalJson(body).sha256 };
}
async function receive(
  store: SqliteReplicationStore,
  operations: readonly SyncOperation[],
  id: string,
  expected: string | null = null,
) {
  const current = await store.snapshot();
  return store.commitReceive({
    deliveryId: id,
    expectedRevision: current.revision,
    delivery: { binding: current.policy.binding, operations },
    checkpoint: { channelId: 'existing-network', expected, next: id },
  });
}

describe('operation journal restore — two real SQLite files (ci-substitute)', () => {
  it('merges a stale third-device journal without resurrecting a deletion or losing unrelated offline notes', async () => {
    const current = open();
    const stalePolicy = {
      ...POLICY,
      binding: { ...POLICY.binding, sessionId: 'stale-device-session' },
    };
    const staleActor = { deviceId: 'stale-third-device', incarnationId: 'stale-install' };
    const stale = open('stale-backup', stalePolicy, staleActor);
    const initial = remote('original');
    await receive(current.store, [initial], 'current-initial');
    await receive(stale.store, [initial], 'stale-initial');
    await stale.store.commitLocal({
      ...local('offline-edit', 1),
      binding: stalePolicy.binding,
      operations: [
        {
          payload: {
            ...note('offline-edit'),
            kind: 'note.version',
            noteId: 'note-a',
            versionId: 'offline-edit',
            generation: null,
            supersedes: [operationReference(initial)],
            segments: [{ kind: 'original', text: 'Offline edit must stay suppressed' }],
          },
          dependencies: [],
        },
      ],
    });
    await stale.store.commitLocal({
      ...local('offline-unrelated', 2),
      binding: stalePolicy.binding,
      operations: [
        {
          payload: {
            ...note('offline-independent'),
            kind: 'note.version',
            noteId: 'offline-independent',
            versionId: 'offline-independent',
            generation: null,
            supersedes: [],
            segments: [{ kind: 'original', text: 'An unrelated offline note' }],
          },
          dependencies: [],
        },
      ],
    });
    const staleBefore = disk(stale.driver);
    const backup = exportOperationJournal((await stale.store.snapshot()).replica);
    const deletion = await current.store.commitLocal({
      ...local('deleted', 1),
      operations: [
        {
          payload: {
            kind: 'entity.tombstone',
            target: { kind: 'note', id: 'note-a' },
            reason: 'user-deleted',
          },
          dependencies: [operationReference(initial)],
        },
      ],
    });
    await current.store.commitLocal({
      ...local('current-offline', 2),
      operations: [
        {
          payload: {
            ...note('current-independent'),
            kind: 'note.version',
            noteId: 'current-independent',
            versionId: 'current-independent',
            generation: null,
            supersedes: [],
            segments: [{ kind: 'original', text: 'Current unrelated note' }],
          },
          dependencies: [],
        },
      ],
    });
    await current.store.acknowledgeOutbox({
      acknowledgementId: 'already-sent',
      binding: POLICY.binding,
      expectedRevision: 3,
      operations: deletion.operations,
    });
    const before = await current.store.snapshot();
    const receipt = await current.store.commitRestore(request(backup, before.revision));
    const after = await current.store.snapshot();
    expect(receipt.operations).toHaveLength(2);
    expect(after.policy).toEqual(before.policy);
    expect(after.actor).toEqual(before.actor);
    expect(after.inbox).toEqual(before.inbox);
    expect(after.checkpoints).toEqual(before.checkpoints);
    expect(after.acknowledgedOutbox).toEqual(before.acknowledgedOutbox);
    expect(after.outbox).toHaveLength(before.outbox.length + 2);
    expect(after.outbox.filter((op) => op.actor.deviceId === staleActor.deviceId)).toEqual(
      backup.operations
        .filter((op) => op.actor.deviceId === staleActor.deviceId)
        .sort((a, b) => a.opId.localeCompare(b.opId)),
    );
    const deleted = after.replica.projection.entities.find(
      (entity) => entity.target.id === 'note-a',
    );
    expect(deleted?.versions).toEqual([]);
    expect(deleted?.tombstones).toHaveLength(1);
    expect(after.replica.projection.suppressed).toHaveLength(2);
    expect(
      after.replica.projection.entities
        .filter((entity) => entity.heads.length)
        .map((entity) => entity.target.id),
    ).toEqual(['current-independent', 'offline-independent']);
    expect(after.replica.projection.scheduling).toBe('not-computed');
    expect(disk(stale.driver)).toBe(staleBefore);
    await current.store.close();
    const reopened = open().store;
    expect(await reopened.snapshot()).toEqual(after);
    const merged = exportOperationJournal((await reopened.snapshot()).replica);
    await stale.store.commitRestore({
      ...request(merged, 3, 'back-to-stale', []),
      binding: stalePolicy.binding,
    });
    const converged = await stale.store.snapshot();
    expect(converged.replica.projection).toEqual(after.replica.projection);
    expect(converged.actor).toMatchObject({ ...staleActor, sequence: 2 });
  });

  it('retains and restores 1,005 journal operations within one revision without adopting source counters', async () => {
    const sourceActor = { deviceId: 'large-source', incarnationId: 'source-install' };
    const source = open('large-source', POLICY, sourceActor).store;
    for (let start = 0; start < 1005; start += 100) {
      const revision = (await source.snapshot()).revision;
      await source.commitLocal({
        ...local(`batch-${start}`, revision),
        operations: Array.from({ length: Math.min(100, 1005 - start) }, (_, offset) => ({
          payload: {
            kind: 'note.version',
            noteId: `large-${start + offset}`,
            versionId: `v-${start + offset}`,
            generation: null,
            supersedes: [],
            segments: [{ kind: 'original', text: `Retained ${start + offset}` }],
          },
          dependencies: [],
        })),
      });
    }
    const backup = exportOperationJournal((await source.snapshot()).replica);
    expect(backup.operations).toHaveLength(1005);
    expect(parseOperationJournalBackup(JSON.parse(JSON.stringify(backup)), POLICY)).toEqual(backup);
    const current = open().store;
    await current.commitLocal(local('own-before', 0));
    const before = await current.snapshot();
    const receipt = await current.commitRestore(request(backup, before.revision));
    expect(receipt.operations).toHaveLength(1005);
    expect(receipt.committedRevision).toBe(before.revision + 1);
    await current.close();
    const restored = open().store;
    const after = await restored.snapshot();
    expect(after.replica.operations).toHaveLength(1006);
    expect(after.outbox).toHaveLength(1006);
    expect(after.actor).toEqual(before.actor);
    expect(after.policy).toEqual(before.policy);
    await restored.commitLocal(local('own-after', after.revision));
    const final = await restored.snapshot();
    expect(final.actor.sequence).toBe(2);
    expect(
      final.outbox.find((op) => op.actor.deviceId === ACTOR.deviceId && op.actor.sequence === 2)
        ?.predecessor,
    ).toEqual(before.actor.predecessor);
    expect(
      final.replica.operations.filter((op) => op.actor.deviceId === sourceActor.deviceId),
    ).toEqual(backup.operations);
  }, 30_000);

  it('preserves pending facts and later quarantine while merging genuine predecessors', async () => {
    const current = open().store;
    const first = remote('genuine');
    const wrongRef = { ...operationReference(first), sha256: 'a'.repeat(64) };
    const bad = { ...remote('bad-dependent', first), predecessor: wrongRef };
    const child = remote('child-of-bad', bad);
    await current.commitRestore(request(packed([child, bad])));
    const pending = await current.snapshot();
    expect(pending.replica.pending).toHaveLength(2);
    expect(pending.replica.ready).toEqual([]);
    expect(pending.outbox).toHaveLength(2);
    await current.commitRestore(request(packed([first]), pending.revision, 'genuine-arrival', []));
    await current.close();
    const after = await open().store.snapshot();
    expect(after.replica.pending).toEqual([]);
    expect(after.replica.quarantined).toHaveLength(2);
    expect(after.replica.ready).toEqual([operationReference(first)]);
    expect(after.outbox).toHaveLength(3);
    expect(after.actor.sequence).toBe(0);
  });

  for (const kind of ['account', 'learner', 'schema', 'deletion', 'merge', 'session'] as const) {
    it(`rejects wrong ${kind} authority before accessing backup operation or document payloads`, async () => {
      const { store, driver } = open();
      await store.commitLocal(local());
      const before = disk(driver);
      let touched = 0;
      const value = structuredClone(request(packed([remote('scope-test')]), 1));
      const altered = value as unknown as {
        binding: Record<string, unknown>;
        backup: Record<string, unknown>;
        mutations: unknown;
      };
      if (kind === 'session') altered.binding['sessionId'] = 'expired-session';
      else if (kind === 'account' || kind === 'learner')
        altered.backup['scope'] = {
          ...POLICY.binding,
          sessionId: undefined,
          [kind === 'account' ? 'accountId' : 'learnerId']: 'foreign',
        };
      else
        altered.backup[
          kind === 'schema' ? 'schemaEpoch' : kind === 'deletion' ? 'deletionEpoch' : 'mergePolicy'
        ] = kind === 'merge' ? 'other-policy' : 99;
      if (kind === 'account' || kind === 'learner')
        delete (altered.backup['scope'] as Record<string, unknown>)['sessionId'];
      Object.defineProperty(value.backup, 'operations', {
        enumerable: true,
        get: () => {
          touched++;
          throw new Error('PAYLOAD_WAS_READ');
        },
      });
      Object.defineProperty(value, 'mutations', {
        enumerable: true,
        get: () => {
          touched++;
          throw new Error('DOCUMENT_WAS_READ');
        },
      });
      await expect(store.commitRestore(value)).rejects.toMatchObject({
        code:
          kind === 'session'
            ? 'stale-session'
            : kind === 'account' || kind === 'learner'
              ? 'ownership-mismatch'
              : kind === 'merge'
                ? 'policy-mismatch'
                : 'epoch-mismatch',
      });
      expect(touched).toBe(0);
      expect(disk(driver)).toBe(before);
    });
  }

  it('rejects corrupt envelopes, identity forks, authority fields and stale revisions without any partial state', async () => {
    const { store, driver } = open();
    const existing = remote('already-present');
    await receive(store, [existing], 'received');
    const before = disk(driver);
    const good = request(
      packed([remote('new-independent', undefined, note('new'), 'new-device')]),
      1,
    );
    const corrupt = structuredClone(good);
    (
      corrupt.backup.operations[0]!.payload as unknown as { segments: { text: string }[] }
    ).segments[0]!.text = 'corrupt';
    const badDigest = { ...corrupt, backup: resign(corrupt.backup) };
    const fork = request(
      packed([good.backup.operations[0]!, { ...existing, occurredAt: '2026-09-10T01:00:01.000Z' }]),
      1,
    );
    for (const value of [
      corrupt,
      badDigest,
      fork,
      { ...good, expectedRevision: 0 },
      { ...good, backup: { ...good.backup, actor: ACTOR } },
      { ...good, backup: { ...good.backup, checkpoint: 'foreign' } },
    ]) {
      await expect(store.commitRestore(value as RestoreCommit)).rejects.toBeDefined();
      expect(disk(driver)).toBe(before);
    }
  });

  it('rejects unseen active-actor claims but retains identical acknowledged own operations without requeue', async () => {
    const { store, driver } = open();
    const own = await store.commitLocal(local());
    const ownSnapshot = await store.snapshot();
    const copiedOwn = exportOperationJournal(ownSnapshot.replica);
    await store.acknowledgeOutbox({
      acknowledgementId: 'own-sent',
      binding: POLICY.binding,
      expectedRevision: 1,
      operations: own.operations,
    });
    const before = await store.snapshot();
    const result = await store.commitRestore(request(copiedOwn, before.revision));
    expect(result.operations).toEqual([]);
    const after = await store.snapshot();
    expect(after.outbox).toEqual([]);
    expect(after.acknowledgedOutbox).toEqual(before.acknowledgedOutbox);
    expect(after.actor).toEqual(before.actor);
    const forged = createSyncOperation({
      format: 'kairo-sync-operation',
      v: 1,
      scope: { accountId: POLICY.binding.accountId, learnerId: POLICY.binding.learnerId },
      actor: { ...ACTOR, sequence: 2 },
      predecessor: own.operations[0]!,
      dependencies: [],
      schemaEpoch: POLICY.schemaEpoch,
      deletionEpoch: POLICY.deletionEpoch,
      mergePolicy: POLICY.mergePolicy,
      occurredAt: WHEN,
      payload: note('forged-own'),
    });
    const beforeFork = disk(driver);
    await expect(
      store.commitRestore(request(packed([forged]), after.revision, 'own-fork', [])),
    ).rejects.toMatchObject({ code: 'local-actor-conflict' });
    expect(disk(driver)).toBe(beforeFork);
  });

  it('namespaces restore receipts and exact retries never replay old document mutations', async () => {
    const { store, driver } = open();
    await store.commitLocal(local('shared', 0));
    await receive(store, [remote('received')], 'shared');
    const value = request(
      packed([remote('restore', undefined, note('restore'), 'backup-source')]),
      2,
      'shared',
    );
    const first = await store.commitRestore(value);
    await store.commitLocal({
      ...local('later-local', 3),
      operations: [],
      mutations: [
        { kind: 'put', collection: 'learner-record', id: 'current', value: 'newer local data' },
      ],
    });
    const before = disk(driver);
    expect(await store.commitRestore(value)).toEqual({ ...first, outcome: 'duplicate' });
    expect(disk(driver)).toBe(before);
    await expect(store.commitRestore({ ...value, mutations: [] })).rejects.toMatchObject({
      code: 'change-identity-conflict',
    });
    expect(disk(driver)).toBe(before);
    expect(
      driver
        .all<{ kind: string }>(
          "SELECT kind FROM kairo_replication_receipts WHERE change_id = 'shared' ORDER BY kind",
        )
        .map((row) => row.kind),
    ).toEqual(['local', 'receive', 'restore']);
  });

  for (const [stage, pattern] of Object.entries({
    document: /^INSERT INTO kairo_replication_documents/u,
    operation: /^INSERT INTO kairo_replication_operations/u,
    outbox: /^INSERT INTO kairo_replication_outbox/u,
    view: /^UPDATE kairo_replication_profiles/u,
    receipt: /^INSERT INTO kairo_replication_receipts/u,
  })) {
    it(`rolls back a real native ${stage} write fault, including journal, documents and retransmission`, async () => {
      const { store, driver } = open('current', POLICY, ACTOR, true);
      await store.commitLocal(local());
      const before = disk(driver);
      driver.armed = pattern;
      await expect(store.commitRestore(request(undefined, 1))).rejects.toThrow(
        'SYNTHETIC_SQLITE_DRIVER_FAULT',
      );
      expect(driver.fired).toBe(true);
      expect(disk(driver)).toBe(before);
      await store.close();
      const reopened = open();
      expect(disk(reopened.driver)).toBe(before);
    });
  }
  for (const phase of ['before', 'after'] as const) {
    it(`recovers a restore with ${phase === 'before' ? 'failed COMMIT' : 'lost post-COMMIT acknowledgement'} without resetting its actor`, async () => {
      const { store, driver } = open('current', POLICY, ACTOR, true);
      await store.commitLocal(local());
      const before = await store.snapshot();
      const value = request(undefined, before.revision);
      driver.failCommit = phase;
      await expect(store.commitRestore(value)).rejects.toThrow('SYNTHETIC_SQLITE_DRIVER_FAULT');
      await expect(store.snapshot()).rejects.toMatchObject({ code: 'reopen-required' });
      await store.close();
      const restored = open().store;
      const reopened = await restored.snapshot();
      expect(reopened.actor).toEqual(before.actor);
      expect(reopened.revision).toBe(before.revision + (phase === 'after' ? 1 : 0));
      const receipt = await restored.commitRestore(value);
      expect(receipt.outcome).toBe(phase === 'after' ? 'duplicate' : 'committed');
      expect((await restored.snapshot()).outbox).toHaveLength(before.outbox.length + 1);
    });
  }
  it('rolls back actual SQLite disk-full during restored document writes', async () => {
    const { store, driver } = open();
    await store.commitLocal(local());
    const before = disk(driver);
    const pages = driver.all<{ page_count: number }>('PRAGMA page_count')[0]!.page_count;
    driver.exec(`PRAGMA max_page_count = ${pages}`);
    await expect(
      store.commitRestore(
        request(undefined, 1, 'disk-full', [
          { kind: 'put', collection: 'private', id: 'large', value: 'FULL-'.repeat(100_000) },
        ]),
      ),
    ).rejects.toThrow(/full/iu);
    await store.close();
    expect(disk(open().driver)).toBe(before);
  });

  it('exports only immutable operation history and never includes local credentials or actor allocation', async () => {
    const store = open().store;
    await store.commitLocal({
      ...local(),
      mutations: [
        { kind: 'put', collection: 'private', id: 'secret', value: 'SYNTHETIC-LOCAL-SECRET' },
      ],
    });
    const value = exportOperationJournal((await store.snapshot()).replica);
    expect(Object.keys(value).sort()).toEqual([
      'deletionEpoch',
      'format',
      'mergePolicy',
      'operations',
      'schemaEpoch',
      'scope',
      'sha256',
      'v',
    ]);
    expect(JSON.stringify(value)).not.toContain('SYNTHETIC-LOCAL-SECRET');
    expect(JSON.stringify(value)).not.toContain('session-a');
    expect(Object.isFrozen(value.operations)).toBe(true);
    expect(value.operations[0]?.occurredAt).toBe(WHEN);
    expect(() => exportOperationJournal(JSON.parse(JSON.stringify(createReplica(POLICY))))).toThrow(
      /invalid-replica/u,
    );
  });
});
