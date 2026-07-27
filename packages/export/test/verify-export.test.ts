/**
 * `npm run verify:export` (WP-03; T-14, controller §11).
 *
 * This file *is* the script. The root `verify:export` runs exactly this suite,
 * replacing the WP-01 placeholder that printed a notice and exited 0.
 *
 * What the controller asks for, verbatim:
 *
 * > `npm run verify:export` replays an export through the domain reducer and
 * > asserts derived-state equality with the live store (T-14).
 *
 * So the check runs against **real stores**, not against a hand-built envelope:
 * seed a store, export it, replay the export through `@bunki/domain`, compare
 * with the store's own derived state. It runs against **both** adapters,
 * because an export that round-trips on one and not the other is not a working
 * export.
 *
 * Both runs are labeled. The SQLite run is `ci-substitute`; the web run is
 * `web-provisional`. Neither is native (P0-CAP-15).
 *
 * This is the **T-14 skeleton** WP-03 owes. WP-09 owns the full T-14: the export
 * button in the evidence inspector, and the round trip driven from the UI.
 */

import { EMPTY_DERIVED_STATE, replay } from '@bunki/domain';
import {
  ProvisionalWebEventStore,
  SqliteEventStore,
  createMemorySnapshotStore,
  representativeLog,
  threadTombstoned,
  contentPurged,
  type EventStore,
  type EventStoreConfig,
} from '@bunki/persistence';
import { openNodeSqliteDriver } from '@bunki/persistence/ci-substitute';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  EXPORT_VERSION,
  parseExportEnvelope,
  serializeExportEnvelope,
  verifyExportRoundTrip,
} from '../src/index.ts';

const CONFIG: EventStoreConfig = {
  clock: { now: () => '2026-07-27T12:00:00.000Z' },
  // `fsrs: null` is the honest value at WP-03 — no scheduler is pinned in this
  // build. WP-06 owns the pin (controller §6.3).
  appVersions: { domain: '@bunki/domain@0.0.0', fsrs: null },
};

const temporaryDirectories: string[] = [];

function openSqliteStore(): EventStore {
  const directory = mkdtempSync(join(tmpdir(), 'bunki-verify-export-'));
  temporaryDirectories.push(directory);
  return SqliteEventStore.open(
    openNodeSqliteDriver({ location: join(directory, 'bunki.db') }),
    CONFIG,
  );
}

function openWebStore(): EventStore {
  return ProvisionalWebEventStore.open({ ...CONFIG, snapshotStore: createMemorySnapshotStore() });
}

afterAll(() => {
  temporaryDirectories.forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

const adapters: readonly { readonly label: string; readonly open: () => EventStore }[] = [
  { label: 'ci-substitute', open: openSqliteStore },
  { label: 'web-provisional', open: openWebStore },
];

adapters.forEach(({ label, open }) => {
  describe(`[${label}] T-14 — export replays to the live derived state`, () => {
    it('round-trips a populated store', async () => {
      const store = open();
      await store.append(representativeLog(), { idempotencyKey: 'batch:seed' });

      const envelope = await store.exportJson();
      const result = verifyExportRoundTrip(envelope, await store.snapshot());

      expect(
        result.equal,
        `export did not replay to the live state; first difference: ${String(result.firstDifference)}`,
      ).toBe(true);
      expect(result.eventCount).toBe(representativeLog().length);
      await store.close();
    });

    it('round-trips an empty store', async () => {
      const store = open();
      const result = verifyExportRoundTrip(await store.exportJson(), await store.snapshot());
      expect(result.equal).toBe(true);
      expect(result.eventCount).toBe(0);
      await store.close();
    });

    it('round-trips a store whose content has been tombstoned and purged', async () => {
      // The hardest case for a round trip: the stored log is no longer the log
      // that was written. If replay of the *purged* export did not reproduce the
      // store's state, deletion would quietly break exportability — which is how
      // a user who deletes one thread loses the ability to verify all the others.
      const store = open();
      await store.append(representativeLog(), { idempotencyKey: 'batch:seed' });
      await store.append([threadTombstoned()], { idempotencyKey: 'batch:tombstone' });
      await store.append([contentPurged()], { idempotencyKey: 'batch:purge' });

      const result = verifyExportRoundTrip(await store.exportJson(), await store.snapshot());
      expect(result.equal).toBe(true);
      expect(result.replayedState.purges).toHaveLength(1);
      await store.close();
    });

    it('survives serialisation to text and back, which is what an export actually is', async () => {
      const store = open();
      await store.append(representativeLog(), { idempotencyKey: 'batch:seed' });

      // An export leaves the process as bytes. Verifying the in-memory object
      // would skip the only step where a JSON-hostile value could be lost.
      const text = serializeExportEnvelope(await store.exportJson());
      const reparsed = parseExportEnvelope(JSON.parse(text));

      expect(reparsed.exportVersion).toBe(EXPORT_VERSION);
      expect(verifyExportRoundTrip(reparsed, await store.snapshot()).equal).toBe(true);
      expect(replay(reparsed.events)).toEqual(await store.snapshot());
      await store.close();
    });
  });
});

describe('verify:export fails when it should', () => {
  it('reports inequality rather than throwing when the state does not match', async () => {
    const store = openSqliteStore();
    await store.append(representativeLog(), { idempotencyKey: 'batch:seed' });
    const envelope = await store.exportJson();

    // Replay a *different* store's state against this export. A verifier that
    // only ever returned `equal: true` would pass every export ever written, so
    // the negative control is load-bearing.
    const other = openWebStore();
    const result = verifyExportRoundTrip(envelope, await other.snapshot());

    expect(result.equal).toBe(false);
    expect(result.firstDifference).not.toBeNull();
    await store.close();
    await other.close();
  });

  it('refuses an envelope whose export version this build does not implement', async () => {
    const store = openSqliteStore();
    const envelope = await store.exportJson();
    const tampered = { ...envelope, exportVersion: 2 };

    expect(() => verifyExportRoundTrip(tampered, EMPTY_DERIVED_STATE)).toThrow(
      /Unknown export version/,
    );
    await store.close();
  });
});
