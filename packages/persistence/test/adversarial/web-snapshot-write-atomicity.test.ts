import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SNAPSHOT_KEY,
  PURGE_CANARY_TEXT,
  PURGED_TEXT_PLACEHOLDER,
  ProvisionalWebEventStore,
  contentPurged,
  encounterCaptured,
  threadTombstoned,
  type SnapshotStore,
} from '../../src/index.ts';
import { TEST_CONFIG } from '../harness.ts';

function failureAtomicStorage(): {
  readonly bytes: Map<string, string>;
  readonly store: SnapshotStore;
  failWrites(value: boolean): void;
} {
  const bytes = new Map<string, string>();
  let failing = false;
  return {
    bytes,
    store: {
      getItem: (key) => bytes.get(key) ?? null,
      setItem: (key, value) => {
        if (failing) throw new Error('snapshot write rejected before replacement');
        bytes.set(key, value);
      },
      removeItem: (key) => {
        bytes.delete(key);
      },
    },
    failWrites: (value) => {
      failing = value;
    },
  };
}

describe('[web-provisional] failure-atomic snapshot writes', () => {
  it('keeps the live and durable event views unchanged when an ordinary append fails', async () => {
    const storage = failureAtomicStorage();
    const store = ProvisionalWebEventStore.open({ ...TEST_CONFIG, snapshotStore: storage.store });
    const first = encounterCaptured();
    const second = encounterCaptured({
      eventId: 'evt-atomic-002',
      encounterId: 'encounter-atomic-002',
      threadId: 'thread-atomic-002',
      idempotencyKey: 'capture:evt-atomic-002',
      text: 'a second encounter that must not leak',
    });

    await store.append([first], { idempotencyKey: 'batch:atomic-seed' });
    const durableBefore = storage.bytes.get(DEFAULT_SNAPSHOT_KEY);
    const logBefore = await store.readAll();
    const stateBefore = await store.snapshot();
    const cacheBefore = await store.derivedStateCacheMeta();
    const threadsBefore = await store.listThreadIds();
    const exportBefore = await store.exportJson();

    storage.failWrites(true);
    await expect(store.append([second], { idempotencyKey: 'batch:atomic-failed' })).rejects.toThrow(
      'snapshot write rejected before replacement',
    );

    expect(storage.bytes.get(DEFAULT_SNAPSHOT_KEY)).toBe(durableBefore);
    expect(await store.readAll()).toEqual(logBefore);
    expect(await store.snapshot()).toEqual(stateBefore);
    expect(await store.derivedStateCacheMeta()).toEqual(cacheBefore);
    expect(await store.listThreadIds()).toEqual(threadsBefore);
    expect(await store.exportJson()).toEqual(exportBefore);
    expect(await store.eventById(second.eventId)).toBeNull();
    expect(await store.hasIdempotencyKey(second.idempotencyKey)).toBe(false);

    storage.failWrites(false);
    const retry = await store.append([second], { idempotencyKey: 'batch:atomic-failed' });
    expect(retry.outcome).toBe('appended');
    expect(await store.countEvents()).toBe(2);
    expect(await store.listThreadIds()).toEqual(['thread-atomic-002', first.threadId].sort());
  });

  it('keeps canary bytes and batch state intact when a purge write fails', async () => {
    const storage = failureAtomicStorage();
    const store = ProvisionalWebEventStore.open({ ...TEST_CONFIG, snapshotStore: storage.store });
    const capture = encounterCaptured();
    const tombstone = threadTombstoned();
    const purge = contentPurged();

    await store.append([capture], { idempotencyKey: 'batch:purge-seed' });
    await store.append([tombstone], { idempotencyKey: 'batch:purge-tombstone' });
    const durableBefore = storage.bytes.get(DEFAULT_SNAPSHOT_KEY);
    expect(durableBefore).toContain(PURGE_CANARY_TEXT);

    storage.failWrites(true);
    await expect(store.append([purge], { idempotencyKey: 'batch:purge-failed' })).rejects.toThrow(
      'snapshot write rejected before replacement',
    );

    expect(storage.bytes.get(DEFAULT_SNAPSHOT_KEY)).toBe(durableBefore);
    expect((await store.eventById(capture.eventId))?.type).toBe('EncounterCaptured');
    expect(await store.eventById(purge.eventId)).toBeNull();
    expect(await store.hasIdempotencyKey(purge.idempotencyKey)).toBe(false);
    const unredacted = await store.eventById(capture.eventId);
    expect(unredacted?.type === 'EncounterCaptured' ? unredacted.text : null).toBe(
      PURGE_CANARY_TEXT,
    );

    storage.failWrites(false);
    const retry = await store.append([purge], { idempotencyKey: 'batch:purge-failed' });
    expect(retry.outcome).toBe('appended');
    expect(storage.bytes.get(DEFAULT_SNAPSHOT_KEY)).not.toContain(PURGE_CANARY_TEXT);
    const redacted = await store.eventById(capture.eventId);
    expect(redacted?.type === 'EncounterCaptured' ? redacted.text : null).toBe(
      PURGED_TEXT_PLACEHOLDER,
    );
  });
});
