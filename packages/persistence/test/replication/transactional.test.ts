import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execPath, env } from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  createSyncOperation,
  operationReference,
  type ActorIdentity,
  type ReplicaPolicy,
} from '@bunki/sync';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ReplicationStoreError,
  SqliteReplicationStore,
  type LocalJson,
  type ReceiveCommit,
} from '../../src/replication/index.ts';
import { openNodeSqliteDriver } from '../../src/sqlite/node-driver.ts';
import {
  ACTOR,
  FaultDriver,
  LOCAL_FAULTS,
  POLICY,
  RECEIVE_FAULTS,
  local,
  note,
  remote,
} from './fixtures.ts';

let directory: string;
let location: string;
let stores: SqliteReplicationStore[];

beforeEach(async () => {
  const base =
    env['KAIRO_EVIDENCE_DIR'] ?? join(homedir(), '.dharma', 'test-runtime', 'replication');
  await mkdir(base, { recursive: true });
  directory = await mkdtemp(join(base, 'sqlite-'));
  location = join(directory, 'replication.db');
  stores = [];
});

afterEach(async () => {
  for (const store of stores) await store.close();
  await rm(directory, { recursive: true, force: true });
});

function open(policy: ReplicaPolicy = POLICY, actor: ActorIdentity = ACTOR, fault = false) {
  const driver = new FaultDriver(openNodeSqliteDriver({ location }));
  const store = SqliteReplicationStore.open(fault ? driver : driver.underlying, { policy, actor });
  stores.push(store);
  return { store, driver };
}

function delivery(
  operations: readonly unknown[],
  expectedRevision = 0,
  id = 'delivery-a',
  expected: string | null = null,
  next = 'cursor-a',
): ReceiveCommit {
  return {
    deliveryId: id,
    expectedRevision,
    delivery: { binding: POLICY.binding, operations },
    checkpoint: { channelId: 'replication-service', expected, next },
  };
}

describe('transactional replication store — real file-backed node:sqlite (ci-substitute)', () => {
  it('acknowledges full local data, operation, durable outbox and actor sequence together across reopen', async () => {
    const { store } = open();
    const receipt = await store.commitLocal(local());
    expect(receipt).toMatchObject({
      outcome: 'committed',
      committedRevision: 1,
      runtimeLabel: 'ci-substitute',
    });
    await store.close();
    const restored = await open().store.snapshot();
    expect(restored.revision).toBe(1);
    expect(restored.documents[0]?.value).toEqual({
      fullBody: 'LOCAL_ONLY_FULL_BODY',
      provenance: { license: 'local-only' },
    });
    expect(restored.replica.operations).toHaveLength(1);
    expect(restored.outbox).toEqual(restored.replica.operations);
    expect(restored.actor).toMatchObject({ sequence: 1, predecessor: receipt.operations[0] });
    expect(restored.inbox).toEqual([]);
    expect(JSON.stringify(restored.outbox)).not.toContain('LOCAL_ONLY_FULL_BODY');
  });

  it('retains complete local-only history and prototype keys without creating any sync operation', async () => {
    const raw = JSON.parse(
      '{"__proto__":{"contextRef":"original"},"constructor":{"id":"constructor"}}',
    ) as Record<string, LocalJson>;
    raw['chat'] = Array.from({ length: 40 }, (_, id) => ({
      id,
      xid: 'turn-' + id,
      contextRef: 'source-' + id,
      text: 'original ' + id,
    }));
    raw['readings'] = Array.from({ length: 20 }, (_, id) => ({ id, text: 'full article ' + id }));
    const { store } = open();
    await store.commitLocal({
      ...local(),
      operations: [],
      mutations: [{ kind: 'put', collection: 'private-legacy', id: '__proto__', value: raw }],
    });
    await store.close();
    const snapshot = await open().store.snapshot();
    expect(snapshot.documents[0]?.value).toEqual(raw);
    expect(Object.hasOwn(snapshot.documents[0]?.value as object, '__proto__')).toBe(true);
    expect(snapshot.actor.sequence).toBe(0);
    expect(snapshot.replica.operations).toEqual([]);
    expect(snapshot.outbox).toEqual([]);
  });

  it('retries an uncertain caller intent idempotently, but rejects changed bytes under the same change ID', async () => {
    const { store } = open();
    const request = local();
    const first = await store.commitLocal(request);
    await store.commitLocal(local('second', 1));
    expect(await store.commitLocal(request)).toEqual({ ...first, outcome: 'duplicate' });
    await expect(
      store.commitLocal({
        ...request,
        operations: [{ payload: note('changed'), dependencies: [] }],
      }),
    ).rejects.toMatchObject({ code: 'change-identity-conflict' });
    const snapshot = await store.snapshot();
    expect(snapshot.revision).toBe(2);
    expect(snapshot.actor.sequence).toBe(2);
    expect(snapshot.outbox).toHaveLength(2);
  });

  it('rejects one stale writer across independent SQLite connections without overwriting its sibling', async () => {
    const one = open().store;
    const two = open(POLICY, { deviceId: 'second-local', incarnationId: 'fresh-install' }).store;
    const a = await one.snapshot();
    const b = await two.snapshot();
    expect(a.revision).toBe(b.revision);
    const results = await Promise.allSettled([
      one.commitLocal(local('one', a.revision)),
      two.commitLocal(local('two', b.revision)),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({
      code: 'stale-revision',
    });
    expect((await one.snapshot()).replica.operations).toHaveLength(1);
    await two.commitLocal(local('two', 1));
    expect((await one.snapshot()).outbox).toHaveLength(2);
  });

  it.each(['accountId', 'learnerId'] as const)(
    'isolates identical document and actor IDs by %s',
    async (field) => {
      const first = open().store;
      const otherPolicy: ReplicaPolicy = {
        ...POLICY,
        binding: { ...POLICY.binding, [field]: field + '-b' },
      };
      const second = open(otherPolicy).store;
      await first.commitLocal(local());
      expect((await second.snapshot()).documents).toEqual([]);
      await second.commitLocal({ ...local(), binding: otherPolicy.binding });
      const a = await first.snapshot();
      const b = await second.snapshot();
      expect(a.outbox[0]?.opId).not.toBe(b.outbox[0]?.opId);
      expect(a.revision).toBe(1);
      expect(b.revision).toBe(1);
      await expect(second.commitReceive(delivery(a.outbox, 1))).rejects.toMatchObject({
        code: 'ownership-mismatch',
      });
    },
  );

  for (const [stage, pattern] of Object.entries(LOCAL_FAULTS)) {
    it(`rolls back real SQLite after the local ${stage} write fails`, async () => {
      const { store, driver } = open(POLICY, ACTOR, true);
      driver.armed = pattern;
      await expect(store.commitLocal(local())).rejects.toThrow('SYNTHETIC_SQLITE_DRIVER_FAULT');
      expect(driver.fired).toBe(true);
      await store.close();
      const snapshot = await open().store.snapshot();
      expect(snapshot).toMatchObject({
        revision: 0,
        documents: [],
        outbox: [],
        actor: { sequence: 0, predecessor: null },
      });
      expect(snapshot.replica.operations).toEqual([]);
    });
  }

  it('rolls back a failed COMMIT and requires reopen before further reads or writes', async () => {
    const { store, driver } = open(POLICY, ACTOR, true);
    driver.failCommit = 'before';
    await expect(store.commitLocal(local())).rejects.toThrow('SYNTHETIC_SQLITE_DRIVER_FAULT');
    await expect(store.snapshot()).rejects.toMatchObject({ code: 'reopen-required' });
    await store.close();
    expect((await open().store.snapshot()).revision).toBe(0);
  });

  it('recovers a successful COMMIT with a lost acknowledgement through its durable receipt', async () => {
    const { store, driver } = open(POLICY, ACTOR, true);
    driver.failCommit = 'after';
    await expect(store.commitLocal(local())).rejects.toThrow('SYNTHETIC_SQLITE_DRIVER_FAULT');
    await expect(store.snapshot()).rejects.toMatchObject({ code: 'reopen-required' });
    await store.close();
    const next = open().store;
    expect(await next.commitLocal(local())).toMatchObject({
      outcome: 'duplicate',
      committedRevision: 1,
    });
    expect((await next.snapshot()).outbox).toHaveLength(1);
  });

  for (const [stage, pattern] of Object.entries(RECEIVE_FAULTS)) {
    it(`rolls back operations, inbox, view and checkpoint after the receive ${stage} write fails`, async () => {
      const { store, driver } = open(POLICY, ACTOR, true);
      await store.commitLocal(local());
      driver.armed = pattern;
      await expect(store.commitReceive(delivery([remote('remote')], 1))).rejects.toThrow(
        'SYNTHETIC_SQLITE_DRIVER_FAULT',
      );
      expect(driver.fired).toBe(true);
      await store.close();
      const snapshot = await open().store.snapshot();
      expect(snapshot).toMatchObject({ revision: 1, inbox: [], checkpoints: [] });
      expect(snapshot.outbox).toHaveLength(1);
      expect(snapshot.replica.operations).toHaveLength(1);
    });
  }

  it('durably receives missing-dependency facts, then releases them without replacing its own outbox', async () => {
    const store = open().store;
    await store.commitLocal(local());
    const parent = remote('parent');
    const child = remote('child', parent);
    const first = delivery([child], 1);
    await store.commitReceive(first);
    await store.close();
    const next = open().store;
    expect((await next.snapshot()).replica.pending).toHaveLength(1);
    expect(await next.commitReceive(first)).toMatchObject({
      outcome: 'duplicate',
      committedRevision: 2,
    });
    await next.commitReceive(delivery([parent], 2, 'parents', 'cursor-a', 'cursor-b'));
    const ready = await next.snapshot();
    expect(ready.replica.pending).toEqual([]);
    expect(ready.replica.ready).toHaveLength(3);
    expect(ready.outbox).toHaveLength(1);
    expect(ready.inbox).toHaveLength(2);
    expect(ready.checkpoints).toEqual([{ channelId: 'replication-service', value: 'cursor-b' }]);
  });

  it('preserves corrupt pending facts as quarantined while allowing the genuine predecessor to commit', async () => {
    const store = open().store;
    const parent = remote('parent');
    const validChild = remote('child', parent);
    const { opId: _id, payloadSha256: _digest, ...input } = validChild;
    const child = createSyncOperation({
      ...input,
      predecessor: { opId: parent.opId, sha256: 'f'.repeat(64) },
    });
    await store.commitReceive(delivery([child]));
    expect((await store.snapshot()).replica.pending).toHaveLength(1);
    await store.commitReceive(delivery([parent], 1, 'genuine-parent', 'cursor-a', 'cursor-b'));
    await store.close();
    const snapshot = await open().store.snapshot();
    expect(snapshot.replica.operations).toHaveLength(2);
    expect(snapshot.replica.ready).toEqual([operationReference(parent)]);
    expect(snapshot.replica.quarantined).toEqual([
      { operation: operationReference(child), reason: 'causal-reference-conflict' },
    ]);
    expect(snapshot.inbox).toHaveLength(2);
    expect(snapshot.checkpoints[0]?.value).toBe('cursor-b');
  });

  it('rejects a mixed-owner delivery and stale cursor without any partial incoming changes', async () => {
    const store = open().store;
    const valid = remote('valid');
    const original = remote('foreign', undefined, note('foreign'), 'phone-c');
    const { opId: _id, payloadSha256: _digest, ...input } = original;
    const foreign = createSyncOperation({
      ...input,
      scope: { accountId: 'account-b', learnerId: 'learner-a' },
    });
    await expect(store.commitReceive(delivery([valid, foreign]))).rejects.toMatchObject({
      code: 'ownership-mismatch',
    });
    expect((await store.snapshot()).replica.operations).toEqual([]);
    await store.commitReceive(delivery([valid]));
    await expect(store.commitReceive(delivery([], 1, 'wrong-cursor'))).rejects.toMatchObject({
      code: 'checkpoint-conflict',
    });
    expect((await store.snapshot()).checkpoints[0]?.value).toBe('cursor-a');
  });

  it('requires exact explicit acknowledgements and never removes outbox entries upon receiving its own operations', async () => {
    const store = open().store;
    const written = await store.commitLocal(local());
    const operation = (await store.snapshot()).outbox[0];
    await store.commitReceive(delivery([operation], 1));
    expect((await store.snapshot()).outbox).toHaveLength(1);
    const acknowledgement = {
      acknowledgementId: 'ack-a',
      binding: POLICY.binding,
      expectedRevision: 2,
      operations: written.operations,
    };
    await expect(
      store.acknowledgeOutbox({
        ...acknowledgement,
        operations: [...written.operations, operationReference(remote('not-local'))],
      }),
    ).rejects.toMatchObject({ code: 'invalid-request' });
    expect((await store.snapshot()).outbox).toHaveLength(1);
    await store.acknowledgeOutbox(acknowledgement);
    await store.close();
    const next = open().store;
    expect(await next.acknowledgeOutbox(acknowledgement)).toMatchObject({
      outcome: 'duplicate',
      committedRevision: 3,
    });
    expect((await next.snapshot()).outbox).toEqual([]);
    expect((await next.snapshot()).acknowledgedOutbox).toEqual(written.operations);
    expect((await next.snapshot()).replica.operations).toHaveLength(1);
  });

  it('rolls back a failed explicit outbox acknowledgement without losing either queued operation', async () => {
    const { store, driver } = open(POLICY, ACTOR, true);
    await store.commitLocal(local());
    await store.commitLocal(local('second', 1));
    const refs = (await store.snapshot()).outbox.map(operationReference);
    driver.armed = /^UPDATE kairo_replication_outbox/u;
    await expect(
      store.acknowledgeOutbox({
        acknowledgementId: 'ack',
        binding: POLICY.binding,
        expectedRevision: 2,
        operations: refs,
      }),
    ).rejects.toThrow('SYNTHETIC_SQLITE_DRIVER_FAULT');
    expect(driver.fired).toBe(true);
    await store.close();
    const snapshot = await open().store.snapshot();
    expect(snapshot.revision).toBe(2);
    expect(snapshot.outbox).toHaveLength(2);
    expect(snapshot.acknowledgedOutbox).toEqual([]);
  });

  it('rejects an identity fork atomically even when an earlier item in the same delivery is valid', async () => {
    const store = open().store;
    const original = remote('original');
    await store.commitReceive(delivery([original]));
    const { opId: _id, payloadSha256: _digest, ...input } = original;
    const fork = createSyncOperation({
      ...input,
      payload: note('different-version', 'Changed bytes'),
    });
    const valid = remote('valid-new', undefined, note('valid-new'), 'other-device');
    await expect(
      store.commitReceive(delivery([valid, fork], 1, 'forked', 'cursor-a', 'cursor-b')),
    ).rejects.toMatchObject({ code: 'identity-conflict' });
    const snapshot = await store.snapshot();
    expect(snapshot.replica.operations).toEqual([original]);
    expect(snapshot.inbox).toHaveLength(1);
    expect(snapshot.checkpoints[0]?.value).toBe('cursor-a');
  });

  it('refuses a full-record/credential field inside a sync payload before committing local data', async () => {
    const store = open().store;
    const payload = {
      ...note('not-portable'),
      deviceApiKey: 'SYNTHETIC_NOT_A_REAL_KEY',
      fullRecord: { private: 'must stay local' },
    };
    await expect(
      store.commitLocal({ ...local(), operations: [{ payload, dependencies: [] }] }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    const snapshot = await store.snapshot();
    expect(snapshot).toMatchObject({
      revision: 0,
      documents: [],
      outbox: [],
      actor: { sequence: 0 },
    });
  });

  it('rejects lossy local JSON and accessors without running them or changing durable state', async () => {
    const store = open().store;
    let invoked = false;
    const accessor = Object.defineProperty({}, 'body', {
      enumerable: true,
      get() {
        invoked = true;
        return 'not JSON';
      },
    });
    const sparse = new Array<number>(3);
    sparse[0] = 1;
    sparse[2] = 3;
    for (const value of [
      accessor,
      { invalid: undefined },
      sparse,
      { invalid: -0 },
      { invalid: NaN },
    ]) {
      await expect(
        store.commitLocal({
          ...local(),
          operations: [],
          mutations: [
            { kind: 'put', collection: 'private', id: 'hostile', value: value as LocalJson },
          ],
        }),
      ).rejects.toMatchObject({ code: 'invalid-request' });
    }
    expect(invoked).toBe(false);
    expect((await store.snapshot()).revision).toBe(0);
  });

  it('rebuilds more than one receive batch from the durable journal without pruning any operation', async () => {
    const store = open().store;
    const operations = Array.from({ length: 1005 }, (_, index) =>
      remote('version-' + index, undefined, note('version-' + index), 'remote-' + index),
    );
    await store.commitReceive(delivery(operations.slice(0, 1000)));
    await store.commitReceive(
      delivery(operations.slice(1000), 1, 'second-batch', 'cursor-a', 'cursor-b'),
    );
    const before = await store.snapshot();
    await store.close();
    const after = await open().store.snapshot();
    expect(after.replica.operations).toHaveLength(1005);
    expect(after.inbox).toHaveLength(1005);
    expect(after.replica).toEqual(before.replica);
    expect(after.outbox).toEqual([]);
  });

  it('refuses an unknown schema version without altering its existing journal', async () => {
    const { store, driver } = open();
    await store.commitLocal(local());
    driver.run('UPDATE kairo_replication_schema SET version = 99 WHERE singleton = 1');
    await store.close();
    expect(() => open()).toThrow(ReplicationStoreError);
    const check = openNodeSqliteDriver({ location });
    try {
      expect(
        check.all<{ n: number }>('SELECT COUNT(*) AS n FROM kairo_replication_operations')[0]?.n,
      ).toBe(1);
      expect(
        check.all<{ version: number }>('SELECT version FROM kairo_replication_schema')[0]?.version,
      ).toBe(99);
    } finally {
      check.close();
    }
  });

  it('fails closed on corrupted document bytes instead of returning an apparently valid local snapshot', async () => {
    const { store, driver } = open();
    await store.commitLocal(local());
    driver.run('UPDATE kairo_replication_documents SET payload = ?', ['{"changed":"bytes"}']);
    await expect(store.snapshot()).rejects.toMatchObject({ code: 'corrupt-store' });
  });

  it('refuses unseen remote claims of a reserved local actor and requires a fresh incarnation after copied history', async () => {
    const store = open().store;
    const original = remote('impersonated');
    const { opId: _id, payloadSha256: _digest, ...input } = original;
    const impersonated = createSyncOperation({ ...input, actor: { ...ACTOR, sequence: 1 } });
    await expect(store.commitReceive(delivery([impersonated]))).rejects.toMatchObject({
      code: 'local-actor-conflict',
    });
    const received = remote('received');
    await store.commitReceive(delivery([received]));
    expect(() =>
      open(POLICY, {
        deviceId: received.actor.deviceId,
        incarnationId: received.actor.incarnationId,
      }),
    ).toThrow(ReplicationStoreError);
    const fresh = open(POLICY, { deviceId: 'phone-b', incarnationId: 'new-install' }).store;
    await fresh.commitLocal(local('new-incarnation', 1));
    expect((await fresh.snapshot()).actor.sequence).toBe(1);
  });

  it('invalidates existing handles and asynchronous deliveries after a scoped session change', async () => {
    const first = open().store;
    const stale = open().store;
    await first.commitLocal(local());
    const captured = delivery([remote('late')], 1);
    const binding = { ...POLICY.binding, sessionId: 'session-new' };
    await first.replaceSession(1, binding);
    await expect(stale.snapshot()).rejects.toMatchObject({ code: 'stale-session' });
    const current = open({ ...POLICY, binding }).store;
    await expect(current.commitReceive(captured)).rejects.toMatchObject({ code: 'stale-session' });
    expect((await current.snapshot()).outbox).toHaveLength(1);
    expect((await current.snapshot()).inbox).toEqual([]);
  });

  it('refuses a session replacement that would leave the existing session active', async () => {
    const store = open().store;
    await store.commitLocal(local());
    await expect(store.replaceSession(1, POLICY.binding)).rejects.toMatchObject({
      code: 'invalid-request',
    });
    expect((await store.snapshot()).revision).toBe(1);
  });

  it('retains concurrent note facts and their tombstone through reopen using the sync core projection', async () => {
    const store = open().store;
    const a = remote('a');
    const b = remote('b', undefined, note('b', 'Different note'), 'phone-c');
    await store.commitReceive(delivery([a, b]));
    expect((await store.snapshot()).replica.projection.entities[0]?.requiresChoice).toBe(true);
    const tombstone = remote(
      'delete',
      undefined,
      { kind: 'entity.tombstone', target: { kind: 'note', id: 'note-a' }, reason: 'user-deleted' },
      'phone-d',
    );
    await store.commitReceive(delivery([tombstone], 1, 'delete', 'cursor-a', 'cursor-delete'));
    await store.close();
    const snapshot = await open().store.snapshot();
    expect(snapshot.replica.operations).toHaveLength(3);
    expect(snapshot.replica.projection.entities[0]?.versions).toEqual([]);
    expect(snapshot.replica.projection.entities[0]?.tombstones).toHaveLength(1);
    expect(snapshot.replica.projection.suppressed).toHaveLength(2);
  });

  it('rolls back a real SQLite disk-full failure without advancing the outbox or actor', async () => {
    const { store, driver } = open();
    const pageCount = driver.all<{ page_count: number }>('PRAGMA page_count')[0]?.page_count;
    expect(pageCount).toBeGreaterThan(0);
    driver.exec(`PRAGMA max_page_count = ${String(pageCount)}`);
    await expect(
      store.commitLocal({
        ...local(),
        mutations: [
          { kind: 'put', collection: 'private', id: 'large', value: 'FULL-'.repeat(100_000) },
        ],
      }),
    ).rejects.toThrow(/full/iu);
    await store.close();
    const next = open().store;
    expect(await next.snapshot()).toMatchObject({
      revision: 0,
      documents: [],
      outbox: [],
      actor: { sequence: 0 },
    });
  });

  for (const stage of [
    'document',
    'operation',
    'outbox',
    'actor',
    'view',
    'receipt',
    'after-commit',
  ]) {
    it(`survives actual child-process SIGKILL after ${stage} and reopen`, async () => {
      await open().store.close();
      const requestFile = join(directory, 'request.json');
      const marker = join(directory, 'crash.json');
      await writeFile(requestFile, JSON.stringify(local()));
      const result = spawnSync(
        execPath,
        [
          '--experimental-transform-types',
          fileURLToPath(new URL('./crash-writer.mjs', import.meta.url)),
          location,
          requestFile,
          stage,
          marker,
        ],
        { encoding: 'utf8', timeout: 20_000 },
      );
      expect(result.error).toBeUndefined();
      expect(result.signal, result.stderr).toBe('SIGKILL');
      expect(JSON.parse(await readFile(marker, 'utf8'))).toMatchObject({ stage });
      expect(existsSync(marker + '.acknowledged')).toBe(false);
      const next = open().store;
      const snapshot = await next.snapshot();
      const committed = stage === 'after-commit';
      expect(snapshot.revision).toBe(committed ? 1 : 0);
      expect(snapshot.documents).toHaveLength(committed ? 1 : 0);
      expect(snapshot.outbox).toHaveLength(committed ? 1 : 0);
      expect(snapshot.actor.sequence).toBe(committed ? 1 : 0);
      expect(await next.commitLocal(local())).toMatchObject({
        outcome: committed ? 'duplicate' : 'committed',
        committedRevision: 1,
      });
      expect((await next.snapshot()).outbox).toHaveLength(1);
    });
  }
});
