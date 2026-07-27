/**
 * The Phase-0 SQLite schema, as migrations (WP-03; controller §7).
 *
 * Three tables, in three migrations:
 *
 *   1. `bunki_events`               — the append-only log. The only authority.
 *   2. `bunki_append_batches`       — batch-level idempotency bookkeeping.
 *   3. `bunki_derived_state_cache`  — a cache that is never read as truth.
 *
 * ## The log is append-only, and one column is the exception that proves it
 *
 * `bunki_events` has no `UPDATE` path except the purge (controller §7 deletion,
 * ADR-002): `ContentPurged` rewrites the payload of the targeted encounters to
 * physically remove the learner's content bytes, and sets `content_purged`. That
 * is the single place in this package where a committed row's payload changes,
 * it happens only in the same transaction that records the `ContentPurged`
 * event, and it is what makes deletion real rather than a flag on a row that
 * still contains the text.
 *
 * ## No destructive migration ships in Phase 0
 *
 * All three forward migrations are additive (`CREATE TABLE`, `CREATE INDEX`), so
 * every `destructive` flag below is `false` — and the runner verifies that claim
 * against the SQL rather than believing it. The §21.3(7) guard is nonetheless
 * exercised: `test/migrations.test.ts` drives it with fixture migrations that
 * really are destructive. Shipping a fake destructive migration in the
 * production set purely to demonstrate the guard would put a needless one-way
 * door in a real user's upgrade path.
 *
 * Down-migrations drop what their forward direction created. That is destructive
 * by nature — it is a rollback — which is why `rollbackNote` on each says
 * exactly what is lost. Losing the cache costs a replay; losing the log costs
 * everything, which is why migration 1's note is worded the way it is.
 */

import type { Migration } from './types.ts';

export const EVENTS_TABLE = 'bunki_events';
export const APPEND_BATCHES_TABLE = 'bunki_append_batches';
export const DERIVED_STATE_CACHE_TABLE = 'bunki_derived_state_cache';

const migration001: Migration = {
  id: 1,
  name: 'create-event-log',
  destructive: false,
  up: [
    `CREATE TABLE ${EVENTS_TABLE} (
       seq INTEGER PRIMARY KEY AUTOINCREMENT,
       event_id TEXT NOT NULL UNIQUE,
       idempotency_key TEXT NOT NULL UNIQUE,
       type TEXT NOT NULL,
       schema_version INTEGER NOT NULL,
       occurred_at TEXT NOT NULL,
       thread_id TEXT,
       contract_id TEXT,
       encounter_id TEXT,
       payload TEXT NOT NULL,
       content_purged INTEGER NOT NULL DEFAULT 0
     )`,
    // readStream answers from these, never from a scan of payload text: a text
    // scan would match a thread id that merely appeared inside an encounter.
    `CREATE INDEX ${EVENTS_TABLE}_thread_idx ON ${EVENTS_TABLE} (thread_id)`,
    `CREATE INDEX ${EVENTS_TABLE}_contract_idx ON ${EVENTS_TABLE} (contract_id)`,
    `CREATE INDEX ${EVENTS_TABLE}_encounter_idx ON ${EVENTS_TABLE} (encounter_id)`,
    `CREATE INDEX ${EVENTS_TABLE}_occurred_idx ON ${EVENTS_TABLE} (occurred_at)`,
  ],
  down: [
    `DROP INDEX IF EXISTS ${EVENTS_TABLE}_occurred_idx`,
    `DROP INDEX IF EXISTS ${EVENTS_TABLE}_encounter_idx`,
    `DROP INDEX IF EXISTS ${EVENTS_TABLE}_contract_idx`,
    `DROP INDEX IF EXISTS ${EVENTS_TABLE}_thread_idx`,
    `DROP TABLE IF EXISTS ${EVENTS_TABLE}`,
  ],
  rollbackNote:
    'Rolling back to version 0 drops the event log itself. Nothing in this package can reconstruct it — export first (exportJson) or the evidence is gone. This is the one rollback that is not merely inconvenient.',
};

const migration002: Migration = {
  id: 2,
  name: 'create-append-batch-index',
  destructive: false,
  up: [
    `CREATE TABLE ${APPEND_BATCHES_TABLE} (
       idempotency_key TEXT PRIMARY KEY,
       batch_fingerprint TEXT NOT NULL,
       event_ids TEXT NOT NULL,
       appended_at TEXT NOT NULL
     )`,
  ],
  down: [`DROP TABLE IF EXISTS ${APPEND_BATCHES_TABLE}`],
  rollbackNote:
    'Rolling back loses batch-level idempotency memory only. The log is untouched, and per-event idempotency keys (which live on the events themselves) keep working, so a replayed batch would be recognised event by event rather than as a batch.',
};

const migration003: Migration = {
  id: 3,
  name: 'create-derived-state-cache',
  destructive: false,
  up: [
    // Single row by construction: the CHECK makes "there is more than one cached
    // state" unrepresentable rather than merely unlikely.
    `CREATE TABLE ${DERIVED_STATE_CACHE_TABLE} (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       state_json TEXT NOT NULL,
       event_count INTEGER NOT NULL,
       last_event_id TEXT,
       state_schema_version INTEGER NOT NULL,
       rebuilt_at TEXT NOT NULL
     )`,
  ],
  down: [`DROP TABLE IF EXISTS ${DERIVED_STATE_CACHE_TABLE}`],
  rollbackNote:
    'Rolling back loses a cache that is rebuilt by the next snapshot() and is never read as truth. Cost: one replay.',
};

/** In order. The list index *is* the schema version (see `runner.ts`). */
export const BUNKI_MIGRATIONS: readonly Migration[] = Object.freeze([
  migration001,
  migration002,
  migration003,
]);

export const LATEST_SCHEMA_VERSION = BUNKI_MIGRATIONS.length;
