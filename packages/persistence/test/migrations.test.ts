/**
 * Migrations: forward, backward, and the refusal (WP-03; controller §7, §21.3(7)).
 *
 * The controller's requirement has two halves and this file exercises both.
 *
 * **"each migration ships a down-migration exercised in tests"** — every
 * migration in the shipped set is driven up → down → up, and the schema is
 * compared as a canonical `sqlite_master` fingerprint before and after. Not
 * "the tables look right": the exact `CREATE` text of every table and index,
 * so a rollback that forgets an index fails here rather than in an incident.
 *
 * **"destructive migration without verified rollback = stop condition"** — the
 * guard is driven with fixture migrations that really are destructive, because
 * the shipped set is entirely additive and putting a fake one-way door in a real
 * user's upgrade path to demonstrate a guard would be its own defect.
 *
 * The tests run on the ci-substitute driver. Migration SQL is plain SQLite DDL
 * and runs identically on the device; this file makes no native claim.
 */

import { describe, expect, it } from 'vitest';

import {
  BUNKI_MIGRATIONS,
  DestructiveMigrationWithoutRollbackError,
  LATEST_SCHEMA_VERSION,
  MigrationFailedError,
  MigrationSequenceError,
  SchemaVersionUnsupportedError,
  SqliteEventStore,
  appliedMigrations,
  assertMigrationSetValid,
  classifyStatements,
  currentSchemaVersion,
  migrateTo,
  schemaFingerprint,
  type Migration,
  type SqliteDriver,
} from '../src/index.ts';
import { openNodeSqliteDriver } from '../src/sqlite/node-driver.ts';
import { TEST_CONFIG } from './harness.ts';

const openDriver = (): SqliteDriver => openNodeSqliteDriver({ location: ':memory:' });

describe('[ci-substitute] shipped migration set', () => {
  it('is a valid sequence with rollback coverage on every migration', () => {
    expect(() => assertMigrationSetValid(BUNKI_MIGRATIONS)).not.toThrow();
    expect(BUNKI_MIGRATIONS.every((migration) => migration.down.length > 0)).toBe(true);
    expect(LATEST_SCHEMA_VERSION).toBe(BUNKI_MIGRATIONS.length);
  });

  it('declares destructiveness honestly — every forward direction is additive', () => {
    BUNKI_MIGRATIONS.forEach((migration) => {
      const verdict = classifyStatements(migration.up);
      expect(
        { id: migration.id, declared: migration.destructive, detected: verdict.destructive },
        `migration ${migration.id} (${migration.name}) declaration must match its SQL`,
      ).toEqual({ id: migration.id, declared: verdict.destructive, detected: verdict.destructive });
    });
  });

  it('migrates an empty database to the latest version', () => {
    const driver = openDriver();
    const result = migrateTo(driver, BUNKI_MIGRATIONS);

    expect(result.from).toBe(0);
    expect(result.to).toBe(LATEST_SCHEMA_VERSION);
    expect(result.applied).toEqual([1, 2, 3]);
    expect(appliedMigrations(driver).map((record) => record.id)).toEqual([1, 2, 3]);
    driver.close();
  });

  it('rolls all the way back to an empty schema and forward again to an identical one', () => {
    const driver = openDriver();

    migrateTo(driver, BUNKI_MIGRATIONS);
    const atLatest = schemaFingerprint(driver);
    expect(atLatest).toContain('bunki_events');

    const down = migrateTo(driver, BUNKI_MIGRATIONS, 0);
    expect(down.rolledBack).toEqual([3, 2, 1]);
    expect(currentSchemaVersion(driver)).toBe(0);
    expect(schemaFingerprint(driver)).not.toContain('bunki_events');

    migrateTo(driver, BUNKI_MIGRATIONS);
    expect(schemaFingerprint(driver)).toBe(atLatest);
    driver.close();
  });

  // The per-migration exercise the controller asks for by name: each rollback
  // driven on its own, not merely as part of a full teardown.
  BUNKI_MIGRATIONS.forEach((migration) => {
    it(`migration ${migration.id} (${migration.name}) round-trips up → down → up`, () => {
      const driver = openDriver();
      migrateTo(driver, BUNKI_MIGRATIONS, migration.id);
      const after = schemaFingerprint(driver);

      migrateTo(driver, BUNKI_MIGRATIONS, migration.id - 1);
      expect(currentSchemaVersion(driver)).toBe(migration.id - 1);
      const before = schemaFingerprint(driver);
      expect(before).not.toBe(after);

      migrateTo(driver, BUNKI_MIGRATIONS, migration.id);
      expect(schemaFingerprint(driver)).toBe(after);
      driver.close();
    });
  });

  it('keeps the event log readable across a rollback of the cache migration', async () => {
    const driver = openDriver();
    const store = SqliteEventStore.open(driver, TEST_CONFIG);
    const event = {
      eventId: 'evt-m1',
      v: 1 as const,
      occurredAt: '2026-07-27T08:00:00.000Z',
      idempotencyKey: 'capture:evt-m1',
      type: 'EncounterCaptured' as const,
      encounterId: 'encounter-m1',
      threadId: 'thread-m1',
      text: 'migration survivor',
      sourceRef: { sourceId: 'source-m', kind: 'text' as const },
      provenance: {
        source: 'user_encounter',
        license: 'user_owned',
        modificationStatus: 'unmodified' as const,
        reviewStatus: 'unreviewed' as const,
      },
    };
    await store.append([event], { idempotencyKey: 'batch:m1' });

    // Roll the cache away and back. The cache is rebuildable, so the log must be
    // completely untouched by the round trip.
    migrateTo(driver, BUNKI_MIGRATIONS, 2);
    migrateTo(driver, BUNKI_MIGRATIONS, 3);

    const reopened = SqliteEventStore.open(driver, TEST_CONFIG);
    expect(await reopened.readAll()).toEqual([event]);
    await reopened.close();
  });
});

// ---------------------------------------------------------------------------
// The §21.3(7) refusal
// ---------------------------------------------------------------------------

const destructiveWithRollback: Migration = {
  id: 4,
  name: 'fixture-rebuild-cache-table',
  destructive: true,
  up: [
    'DROP TABLE IF EXISTS bunki_derived_state_cache',
    `CREATE TABLE bunki_derived_state_cache (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       state_json TEXT NOT NULL,
       event_count INTEGER NOT NULL,
       last_event_id TEXT,
       state_schema_version INTEGER NOT NULL,
       rebuilt_at TEXT NOT NULL,
       note TEXT
     )`,
  ],
  down: [
    'DROP TABLE IF EXISTS bunki_derived_state_cache',
    `CREATE TABLE bunki_derived_state_cache (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       state_json TEXT NOT NULL,
       event_count INTEGER NOT NULL,
       last_event_id TEXT,
       state_schema_version INTEGER NOT NULL,
       rebuilt_at TEXT NOT NULL
     )`,
  ],
  rollbackNote: 'Restores the pre-4 cache shape. The cache is rebuilt by the next snapshot().',
};

describe('[ci-substitute] destructive-migration guard (controller §21.3(7))', () => {
  it('refuses a destructive migration that ships no down-migration', () => {
    const noRollback: Migration = { ...destructiveWithRollback, down: [] };
    const driver = openDriver();

    expect(() => migrateTo(driver, [...BUNKI_MIGRATIONS, noRollback])).toThrow(
      DestructiveMigrationWithoutRollbackError,
    );
    // The refusal happens before anything runs, so the store is untouched.
    expect(currentSchemaVersion(driver)).toBe(0);
    driver.close();
  });

  it('refuses a migration whose SQL is destructive but whose declaration says otherwise', () => {
    const mislabelled: Migration = { ...destructiveWithRollback, destructive: false };
    const driver = openDriver();

    expect(() => migrateTo(driver, [...BUNKI_MIGRATIONS, mislabelled])).toThrow(
      DestructiveMigrationWithoutRollbackError,
    );
    expect(currentSchemaVersion(driver)).toBe(0);
    driver.close();
  });

  it('applies a destructive migration that does ship a verified rollback, and rolls it back', () => {
    const driver = openDriver();
    const set = [...BUNKI_MIGRATIONS, destructiveWithRollback];

    migrateTo(driver, set, 3);
    const beforeFour = schemaFingerprint(driver);

    migrateTo(driver, set, 4);
    expect(currentSchemaVersion(driver)).toBe(4);
    expect(schemaFingerprint(driver)).toContain('note');

    migrateTo(driver, set, 3);
    expect(currentSchemaVersion(driver)).toBe(3);
    expect(schemaFingerprint(driver)).toBe(beforeFour);
    driver.close();
  });

  it('classifies destructive SQL by reading it, not by trusting a flag', () => {
    expect(classifyStatements(['DROP TABLE t']).destructive).toBe(true);
    expect(classifyStatements(['DELETE FROM t WHERE 1']).destructive).toBe(true);
    expect(classifyStatements(['UPDATE t SET a = 1']).destructive).toBe(true);
    expect(classifyStatements(['ALTER TABLE t DROP COLUMN c']).destructive).toBe(true);
    expect(classifyStatements(['CREATE TABLE t (a TEXT)']).destructive).toBe(false);
    expect(classifyStatements(['CREATE INDEX i ON t (a)']).destructive).toBe(false);
  });
});

describe('[ci-substitute] migration failure handling', () => {
  it('rolls the transaction back and leaves the schema version unchanged', () => {
    const broken: Migration = {
      id: 4,
      name: 'fixture-broken',
      destructive: false,
      up: ['CREATE TABLE fixture_ok (a TEXT)', 'THIS IS NOT SQL'],
      down: ['DROP TABLE IF EXISTS fixture_ok'],
      rollbackNote: 'fixture',
    };
    const driver = openDriver();
    migrateTo(driver, BUNKI_MIGRATIONS, 3);
    const before = schemaFingerprint(driver);

    expect(() => migrateTo(driver, [...BUNKI_MIGRATIONS, broken], 4)).toThrow(MigrationFailedError);
    expect(currentSchemaVersion(driver)).toBe(3);
    expect(schemaFingerprint(driver)).toBe(before);
    driver.close();
  });

  it('rejects a migration list with a gap rather than guessing the version', () => {
    const gapped: readonly Migration[] = [
      BUNKI_MIGRATIONS[0] as Migration,
      { ...(BUNKI_MIGRATIONS[1] as Migration), id: 3 },
    ];
    const driver = openDriver();
    expect(() => migrateTo(driver, gapped)).toThrow(MigrationSequenceError);
    driver.close();
  });

  it('rejects a target outside the known range', () => {
    const driver = openDriver();
    expect(() => migrateTo(driver, BUNKI_MIGRATIONS, 99)).toThrow(MigrationSequenceError);
    driver.close();
  });
});

describe('[ci-substitute] schema version gate on open', () => {
  it('refuses to open an unmigrated store instead of creating tables lazily', () => {
    const driver = openDriver();
    expect(() => SqliteEventStore.open(driver, { ...TEST_CONFIG, skipMigrations: true })).toThrow(
      SchemaVersionUnsupportedError,
    );
    driver.close();
  });
});
