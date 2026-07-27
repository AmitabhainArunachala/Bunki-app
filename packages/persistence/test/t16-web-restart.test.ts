/**
 * T-16-web: the provisional web adapter survives a restart (WP-03).
 *
 * The contract suite already opens a second store over the same storage. This
 * file goes further in the one direction that matters for a browser: it
 * simulates a **page reload**, where nothing at all survives except the bytes in
 * storage — a new `SnapshotStore` object, a new store instance, no shared
 * closure. If any state were smuggled across in a module-level variable, the
 * contract-suite version could still pass and this one could not.
 *
 * The claim these tests support is `T-16-web` and only that. `T-16-native` is
 * WP-11's, from a device, and nothing here contributes to it (P0-CAP-15).
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SNAPSHOT_KEY,
  PROVISIONAL_WEB_ADAPTER_NOTICE,
  ProvisionalWebEventStore,
  SchemaVersionUnsupportedError,
  StoreCorruptError,
  WEB_SNAPSHOT_VERSION,
  encounterCaptured,
  representativeLog,
  type SnapshotStore,
} from '../src/index.ts';
import { TEST_CONFIG } from './harness.ts';

/**
 * Storage that outlives the page: a bare map, plus a factory that hands out a
 * *fresh* `SnapshotStore` object over it. Two `SnapshotStore` instances that
 * share only the map is exactly the relationship between the storage adapter
 * before a reload and after one.
 */
function createReloadableStorage(): {
  readonly bytes: Map<string, string>;
  newStorageHandle(): SnapshotStore;
} {
  const bytes = new Map<string, string>();
  return {
    bytes,
    newStorageHandle: () => ({
      getItem: (key) => bytes.get(key) ?? null,
      setItem: (key, value) => {
        bytes.set(key, value);
      },
      removeItem: (key) => {
        bytes.delete(key);
      },
    }),
  };
}

describe('[web-provisional] T-16-web restart simulation', () => {
  it('recovers the whole log after a simulated page reload', async () => {
    const storage = createReloadableStorage();
    const log = representativeLog();

    const before = ProvisionalWebEventStore.open({
      ...TEST_CONFIG,
      snapshotStore: storage.newStorageHandle(),
    });
    await before.append(log, { idempotencyKey: 'batch:seed' });
    const stateBefore = await before.snapshot();
    const streamBefore = await before.readStream({ threadId: 'thread-c1' });
    await before.close();

    // The reload: nothing survives but `storage.bytes`.
    const after = ProvisionalWebEventStore.open({
      ...TEST_CONFIG,
      snapshotStore: storage.newStorageHandle(),
    });

    expect(await after.readAll()).toEqual(log);
    expect(await after.snapshot()).toEqual(stateBefore);
    expect(await after.readStream({ threadId: 'thread-c1' })).toEqual(streamBefore);
    expect(await after.countEvents()).toBe(log.length);
    await after.close();
  });

  it('remembers idempotency across a reload, so a retry after a refresh is still a no-op', async () => {
    const storage = createReloadableStorage();
    const event = encounterCaptured();

    const before = ProvisionalWebEventStore.open({
      ...TEST_CONFIG,
      snapshotStore: storage.newStorageHandle(),
    });
    await before.append([event], { idempotencyKey: 'batch:capture' });
    await before.close();

    const after = ProvisionalWebEventStore.open({
      ...TEST_CONFIG,
      snapshotStore: storage.newStorageHandle(),
    });
    const retry = await after.append([event], { idempotencyKey: 'batch:capture' });

    expect(retry.outcome).toBe('duplicate-noop');
    expect(await after.countEvents()).toBe(1);
    await after.close();
  });

  it('starts empty when storage holds nothing, rather than inventing a store', async () => {
    const store = ProvisionalWebEventStore.open({
      ...TEST_CONFIG,
      snapshotStore: createReloadableStorage().newStorageHandle(),
    });
    expect(await store.readAll()).toEqual([]);
    expect(await store.derivedStateCacheMeta()).toBeNull();
    await store.close();
  });

  it('fails closed on a snapshot written by a version it does not implement', () => {
    const storage = createReloadableStorage();
    storage.bytes.set(
      DEFAULT_SNAPSHOT_KEY,
      JSON.stringify({
        webSnapshotVersion: WEB_SNAPSHOT_VERSION + 1,
        events: [],
        purgedEventIds: [],
        batches: [],
        cache: null,
      }),
    );

    expect(() =>
      ProvisionalWebEventStore.open({
        ...TEST_CONFIG,
        snapshotStore: storage.newStorageHandle(),
      }),
    ).toThrow(SchemaVersionUnsupportedError);
  });

  it('fails closed on corrupt storage instead of silently starting empty', () => {
    const storage = createReloadableStorage();
    storage.bytes.set(DEFAULT_SNAPSHOT_KEY, '{ not json');

    expect(() =>
      ProvisionalWebEventStore.open({
        ...TEST_CONFIG,
        snapshotStore: storage.newStorageHandle(),
      }),
    ).toThrow(StoreCorruptError);
  });

  it('fails closed when storage holds an event this build cannot parse', () => {
    const storage = createReloadableStorage();
    storage.bytes.set(
      DEFAULT_SNAPSHOT_KEY,
      JSON.stringify({
        webSnapshotVersion: WEB_SNAPSHOT_VERSION,
        events: [{ ...encounterCaptured(), v: 2 }],
        purgedEventIds: [],
        batches: [],
        cache: null,
      }),
    );

    // Starting empty here would look like a working app that had lost the
    // learner's threads — the exact failure REQ-DM-04's fail-closed rule exists
    // to make loud.
    expect(() =>
      ProvisionalWebEventStore.open({
        ...TEST_CONFIG,
        snapshotStore: storage.newStorageHandle(),
      }),
    ).toThrow(/Unknown event schema version/);
  });
});

describe('[web-provisional] the adapter says what it is', () => {
  it('labels itself provisional on the instance and in a shared disclosure string', async () => {
    const store = ProvisionalWebEventStore.open({
      ...TEST_CONFIG,
      snapshotStore: createReloadableStorage().newStorageHandle(),
    });

    expect(store.runtimeLabel).toBe('web-provisional');
    expect(store.provisionalNotice).toBe(PROVISIONAL_WEB_ADAPTER_NOTICE);
    expect(PROVISIONAL_WEB_ADAPTER_NOTICE).toContain('Provisional');
    // The honesty rule, in the string the about screen will render (P0-CAP-15).
    expect(PROVISIONAL_WEB_ADAPTER_NOTICE).toContain('never reported as native persistence');
    await store.close();
  });
});
