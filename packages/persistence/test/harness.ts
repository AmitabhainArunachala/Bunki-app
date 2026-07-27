/**
 * Adapter harnesses for the port contract suite (WP-03).
 *
 * A harness supplies storage that survives a `close()`, because every durability
 * assertion in the suite is the difference between reading back from the handle
 * that wrote and reading back from a new one. An in-memory SQLite database would
 * make T-01 and T-16 pass while proving nothing, so the SQLite harness always
 * uses a real file on disk.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ProvisionalWebEventStore,
  SqliteEventStore,
  createMemorySnapshotStore,
  type AdapterHarness,
  type EventStore,
  type EventStoreConfig,
  type SnapshotStore,
} from '../src/index.ts';
import { openNodeSqliteDriver } from '../src/sqlite/node-driver.ts';

/**
 * A fixed clock and honest build identifiers.
 *
 * `fsrs: null` is the correct Phase-0 value at WP-03 and not a placeholder to
 * tidy up later: no scheduler is pinned in this build. WP-06 owns the pin
 * (`packages/domain/src/reducers/fsrs-pin.ts`, controller §6.3); until it lands,
 * writing a version string here would be a claim about a component that does not
 * exist.
 */
export const TEST_CONFIG: EventStoreConfig = {
  clock: { now: () => '2026-07-27T12:00:00.000Z' },
  appVersions: { domain: '@bunki/domain@0.0.0', fsrs: null },
};

// ---------------------------------------------------------------------------
// SQLite (ci-substitute)
// ---------------------------------------------------------------------------

export function createSqliteCiSubstituteHarness(): AdapterHarness {
  let directory = mkdtempSync(join(tmpdir(), 'bunki-persistence-'));
  let file = join(directory, 'bunki.db');

  const sidecars = (): readonly string[] => [file, `${file}-wal`, `${file}-shm`];

  return {
    runtimeLabel: 'ci-substitute',
    name: 'sqlite adapter via node:sqlite (ci-substitute, file-backed)',

    async open(): Promise<EventStore> {
      return SqliteEventStore.open(openNodeSqliteDriver({ location: file }), TEST_CONFIG);
    },

    async rawStorageDump(): Promise<string> {
      // Every file SQLite may have written, decoded as UTF-8. Invalid byte runs
      // become replacement characters; valid UTF-8 substrings survive, which is
      // all the purge assertion needs — it is looking for text that must NOT be
      // there.
      return sidecars()
        .filter((path) => existsSync(path))
        .map((path) => readFileSync(path).toString('utf8'))
        .join('\n');
    },

    async reset(): Promise<void> {
      rmSync(directory, { recursive: true, force: true });
      directory = mkdtempSync(join(tmpdir(), 'bunki-persistence-'));
      file = join(directory, 'bunki.db');
    },

    async dispose(): Promise<void> {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// Provisional web
// ---------------------------------------------------------------------------

export function createWebProvisionalHarness(): AdapterHarness {
  let snapshotStore: SnapshotStore = createMemorySnapshotStore();
  const key = 'bunki.test.web';

  return {
    runtimeLabel: 'web-provisional',
    name: 'provisional web adapter (in-memory + snapshot store)',

    async open(): Promise<EventStore> {
      return ProvisionalWebEventStore.open({
        ...TEST_CONFIG,
        snapshotStore,
        snapshotKey: key,
      });
    },

    async rawStorageDump(): Promise<string> {
      return snapshotStore.getItem(key) ?? '';
    },

    async reset(): Promise<void> {
      snapshotStore = createMemorySnapshotStore();
    },

    async dispose(): Promise<void> {
      snapshotStore = createMemorySnapshotStore();
    },
  };
}
