/**
 * Tombstone-then-purge, in detail (WP-03; ADR-002, controller §7, P0-CAP-14).
 *
 * The contract suite proves the behaviour through the ports on both adapters.
 * This file proves the parts that live below the port: what redaction keeps and
 * drops, that the purge is authorised before it destroys anything, and — the
 * assertion that actually matters — that the learner's bytes are gone from the
 * SQLite **file**, not merely from the rows.
 *
 * That last one is not pedantry. `UPDATE` in SQLite writes a new record and
 * frees the old cell; without `PRAGMA secure_delete` the freed bytes stay
 * legible on the page, and in WAL mode a pre-update page image can sit in the
 * `-wal` file. A purge that satisfies every port-level assertion while leaving
 * the text recoverable from a disk image is not a purge, and no test that only
 * asked the port could tell the difference.
 */

import { DOMAIN_EVENT_TYPES, type DomainEventType } from '@bunki/domain';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PURGEABLE_EVENT_TYPES,
  PURGED_TEXT_PLACEHOLDER,
  PurgeWithoutTombstoneError,
  PURGE_CANARY_TEXT,
  SqliteEventStore,
  T,
  contentPurged,
  encounterCaptured,
  planPurge,
  redactEncounter,
  representativeLog,
  threadTombstoned,
  assertPurgeAuthorised,
} from '../src/index.ts';
import { openNodeSqliteDriver } from '../src/sqlite/node-driver.ts';
import { TEST_CONFIG } from './harness.ts';

describe('redaction keeps the audit trail and drops the content', () => {
  it('empties text, drops the span and the locator, and preserves everything else', () => {
    const original = encounterCaptured();
    const withSpan = { ...original, span: { start: 0, end: 3 } };

    const redacted = redactEncounter(withSpan);

    expect(redacted.text).toBe(PURGED_TEXT_PLACEHOLDER);
    expect(redacted.span).toBeUndefined();
    expect(redacted.sourceRef.locator).toBeUndefined();

    // The audit trail, intact.
    expect(redacted.eventId).toBe(original.eventId);
    expect(redacted.idempotencyKey).toBe(original.idempotencyKey);
    expect(redacted.occurredAt).toBe(original.occurredAt);
    expect(redacted.threadId).toBe(original.threadId);
    expect(redacted.encounterId).toBe(original.encounterId);
    expect(redacted.sourceRef.sourceId).toBe(original.sourceRef.sourceId);
    // Licence obligations outlive the material they attach to (REQ-SRC-01).
    expect(redacted.provenance).toEqual(original.provenance);
  });

  it('does not mutate its input', () => {
    const original = encounterCaptured();
    redactEncounter(original);
    expect(original.text).toBe(PURGE_CANARY_TEXT);
  });

  it('plans nothing for an encounter that is already emptied', () => {
    const log = representativeLog();
    const purge = contentPurged();

    const first = planPurge(log, purge);
    expect(first.length).toBeGreaterThan(0);

    const afterFirst = log.map((event) => {
      const entry = first.find((candidate) => candidate.eventId === event.eventId);
      return entry === undefined ? event : entry.redacted;
    });
    expect(planPurge(afterFirst, purge)).toEqual([]);
  });

  /**
   * A change detector with a purpose: if a future schema version adds a family
   * that carries free-form learner text, this test fails until someone decides
   * whether the purge must empty it. Silence would mean shipping a deletion
   * feature that misses the new field.
   */
  it('accounts for every event family as content-bearing or not', () => {
    const carriesNoLearnerContent: readonly DomainEventType[] = [
      'ThreadPromotionChanged',
      'ContractCreated',
      'ReviewGraded',
      'ProductionObserved',
      'ExposureLogged',
      'LookupFrictionLogged',
      'CandidateAttached',
      'CandidateAcceptedAsNote',
      'EvidenceSuperseded',
      'SessionStarted',
      'SessionClosed',
      'DataExported',
      'ThreadTombstoned',
      'ContentPurged',
    ];

    expect([...PURGEABLE_EVENT_TYPES, ...carriesNoLearnerContent].sort()).toEqual(
      [...DOMAIN_EVENT_TYPES].sort(),
    );
  });
});

describe('the purge refuses to run without authority', () => {
  it('rejects a purge citing an event that is not in the log', () => {
    expect(() =>
      assertPurgeAuthorised(representativeLog(), contentPurged({ tombstoneEventId: 'evt-nope' })),
    ).toThrow(PurgeWithoutTombstoneError);
  });

  it('rejects a purge citing an event that is not a tombstone', () => {
    const log = [...representativeLog()];
    expect(() =>
      assertPurgeAuthorised(log, contentPurged({ tombstoneEventId: 'evt-c001' })),
    ).toThrow(PurgeWithoutTombstoneError);
  });

  it('rejects a purge whose targets exclude the tombstoned thread', () => {
    const log = [...representativeLog(), threadTombstoned()];
    expect(() => assertPurgeAuthorised(log, contentPurged({ targetIds: ['unrelated'] }))).toThrow(
      PurgeWithoutTombstoneError,
    );
  });
});

describe('[ci-substitute] the purge reaches the database file, not just the row', () => {
  let directory = '';
  let file = '';

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'bunki-purge-'));
    file = join(directory, 'bunki.db');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const dumpFiles = (): string =>
    [file, `${file}-wal`, `${file}-shm`]
      .filter((path) => existsSync(path))
      .map((path) => readFileSync(path).toString('utf8'))
      .join('\n');

  it('removes the encounter text from every file SQLite wrote', async () => {
    const store = SqliteEventStore.open(openNodeSqliteDriver({ location: file }), TEST_CONFIG);
    await store.append(representativeLog(), { idempotencyKey: 'batch:seed' });
    await store.close();

    expect(
      dumpFiles(),
      'precondition: the text must be in the file before the purge, or this test proves nothing',
    ).toContain(PURGE_CANARY_TEXT);

    const purging = SqliteEventStore.open(openNodeSqliteDriver({ location: file }), TEST_CONFIG);
    await purging.append([threadTombstoned()], { idempotencyKey: 'batch:tombstone' });
    await purging.append([contentPurged()], { idempotencyKey: 'batch:purge' });
    await purging.close();

    expect(dumpFiles()).not.toContain(PURGE_CANARY_TEXT);

    // And the record of the deletion is still there, readable, with its thread
    // marked purged — deletion stays auditable without the audit trail retaining
    // the deleted content (ADR-002).
    const after = SqliteEventStore.open(openNodeSqliteDriver({ location: file }), TEST_CONFIG);
    const state = await after.snapshot();
    expect(state.purges).toHaveLength(1);
    expect(state.threads.find((thread) => thread.threadId === T.thread)?.lifecycle).toBe('purged');
    expect((await after.eventById('evt-c007'))?.type).toBe('ThreadTombstoned');
    await after.close();
  });
});
