import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSyncOperation, readAssessmentLearningViewsV2 } from '@bunki/sync';
import {
  SqliteReplicationStore,
  exportOperationJournal,
  parseOperationJournalBackup,
} from '../../src/replication/index.ts';
import { openNodeSqliteDriver } from '../../src/sqlite/node-driver.ts';
import { ACTOR, POLICY, FaultDriver, LOCAL_FAULTS } from './fixtures.ts';
import { assessmentLocalFixtureV2 } from './assessment-v2-fixtures.ts';
let directory: string;
let stores: SqliteReplicationStore[] = [];
beforeEach(async () => {
  const base = join(homedir(), '.dharma/test-runtime/assessment-sync-v2');
  await mkdir(base, { recursive: true });
  directory = await mkdtemp(join(base, 'sqlite-'));
  stores = [];
});
afterEach(async () => {
  for (const store of stores) await store.close();
  await rm(directory, { recursive: true, force: true });
});
function open(name = 'local', fault = false) {
  const driver = new FaultDriver(openNodeSqliteDriver({ location: join(directory, `${name}.db`) }));
  const store = SqliteReplicationStore.open(fault ? driver : driver.underlying, {
    policy: POLICY,
    actor: { ...ACTOR, deviceId: name },
  });
  stores.push(store);
  return { store, driver };
}
describe('durable assessment v2 outbox', () => {
  it('commits attempt, learning additions, two typed operations and retry receipt atomically across reopen', async () => {
    const request = assessmentLocalFixtureV2();
    const { store } = open();
    const receipt = await store.commitLocal(request);
    await store.close();
    const reopened = open().store;
    const snapshot = await reopened.snapshot();
    const ordered = [...snapshot.outbox].sort((a, b) => a.actor.sequence - b.actor.sequence);
    expect(ordered.map((operation) => [operation.v, operation.payload.kind])).toEqual([
      [2, 'assessment.result/2'],
      [2, 'learning.followup/2'],
    ]);
    expect(ordered[1]!.predecessor).toEqual(receipt.operations[0]);
    expect(snapshot.documents).toHaveLength(1);
    expect(JSON.stringify(snapshot.outbox)).not.toContain('PRIVATE_QUESTION_BODY');
    expect(() => parseSyncOperation(snapshot.outbox[0])).toThrow('unsupported-version');
    expect(await reopened.commitLocal(request)).toMatchObject({
      outcome: 'duplicate',
      operations: receipt.operations,
    });
    expect(
      readAssessmentLearningViewsV2((await reopened.snapshot()).replica).followups[0]!
        .resultBinding,
    ).toBe('matched');
    const backup = exportOperationJournal(snapshot.replica);
    expect(parseOperationJournalBackup(backup, POLICY).operations).toEqual(
      snapshot.replica.operations,
    );
  });
  it('rolls back every local effect if either durable outbox write fails', async () => {
    const { store, driver } = open('fault', true);
    driver.armed = LOCAL_FAULTS.outbox;
    await expect(store.commitLocal(assessmentLocalFixtureV2())).rejects.toThrow();
    const snapshot = await store.snapshot();
    expect(snapshot.documents).toEqual([]);
    expect(snapshot.outbox).toEqual([]);
    expect(snapshot.actor.sequence).toBe(0);
    expect((await store.commitLocal(assessmentLocalFixtureV2())).operations).toHaveLength(2);
  });
  it('receives a rich result and followup together with the cursor and deduplicates replay', async () => {
    const local = open().store;
    await local.commitLocal(assessmentLocalFixtureV2());
    const operations = (await local.snapshot()).outbox;
    const remote = open('remote').store;
    const request = {
      deliveryId: 'receive:one',
      expectedRevision: 0,
      delivery: { binding: POLICY.binding, operations },
      checkpoint: { channelId: 'synthetic-cloud', expected: null, next: 'cursor:one' },
    };
    await remote.commitReceive(request);
    expect(
      readAssessmentLearningViewsV2((await remote.snapshot()).replica).followups[0]!.resultBinding,
    ).toBe('matched');
    expect((await remote.commitReceive(request)).outcome).toBe('duplicate');
    expect((await remote.snapshot()).outbox).toEqual([]);
  });
});
