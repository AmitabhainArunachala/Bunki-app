/**
 * The SQLite event store (WP-03; controller §7).
 *
 * **This is the native-authority adapter.** The code and SQL in this file are
 * what runs on a device through `expo-sqlite`, and they are also what runs in CI
 * through `node:sqlite` — one implementation, two drivers (`driver.ts`). Nothing
 * about the store's behaviour is chosen by which driver is underneath.
 *
 * That single-implementation property is the entire worth of the CI substitute,
 * and it is also the reason a ci-substitute pass proves less than it looks like
 * it proves. It is evidence that the SQL is valid, that the transactions are
 * correct, that the invariants hold, and that the durability logic survives a
 * reopen. It is *not* evidence about iOS, about `expo-sqlite`'s own behaviour,
 * about WAL on a real filesystem under backgrounding, or about a device at all.
 * Native verification is WP-11's claim and only WP-11's (controller §7,
 * P0-CAP-15).
 *
 * ## Shape
 *
 * - `bunki_events` is append-only. The one exception is the purge, which
 *   rewrites the payload of targeted encounters in the same transaction that
 *   records the `ContentPurged` event (see `../purge.ts`).
 * - Every write is a transaction. A batch that fails anywhere writes nothing,
 *   because a partially applied batch produces derived state no event log
 *   explains.
 * - Every candidate log is replayed before it is committed (`../append-plan.ts`).
 *   A log that does not replay is never stored.
 * - `snapshot()` always replays. The derived-state cache is written on append
 *   and read only by `derivedStateCacheMeta()`; it is never an answer to
 *   `snapshot()`. A cache that can answer is a second source of truth, and the
 *   first disagreement between two sources of truth is silent.
 */

import {
  canonicalJson,
  parseEvent,
  replay,
  type DerivedState,
  type DomainEvent,
  type EventId,
  type ThreadState,
} from '@bunki/domain';
import { buildExportEnvelope, type ExportEnvelope } from '@bunki/export';

import {
  fingerprintBatch,
  planAppend,
  type AppendBatchRecord,
  type StoredEventRecord,
} from '../append-plan.ts';
import { SchemaVersionUnsupportedError, StoreClosedError, StoreCorruptError } from '../errors.ts';
import { computeEventIndexes } from '../indexing.ts';
import { currentSchemaVersion, migrateTo } from '../migrations/runner.ts';
import {
  APPEND_BATCHES_TABLE,
  BUNKI_MIGRATIONS,
  DERIVED_STATE_CACHE_TABLE,
  EVENTS_TABLE,
  LATEST_SCHEMA_VERSION,
} from '../migrations/schema.ts';
import type {
  AppendOptions,
  AppendResult,
  DerivedStateCacheMeta,
  EventStore,
  EventStoreConfig,
  RuntimeLabel,
  StreamSelector,
} from '../port.ts';
import { assertPurgeAuthorised, planPurge } from '../purge.ts';
import { withTransaction, type SqliteDriver } from './driver.ts';

interface EventRow {
  event_id: string;
  payload: string;
  content_purged: number;
}

interface BatchRow {
  idempotency_key: string;
  batch_fingerprint: string;
  event_ids: string;
}

interface CacheRow {
  event_count: number;
  last_event_id: string | null;
  state_schema_version: number;
  rebuilt_at: string;
}

export interface OpenSqliteStoreOptions extends EventStoreConfig {
  /**
   * Skip the migration run. Only for tests that drive `migrateTo` themselves;
   * an unmigrated store throws `SchemaVersionUnsupportedError` on first use
   * rather than creating tables lazily, because lazy creation is how a store
   * ends up at a schema version nobody chose.
   */
  readonly skipMigrations?: boolean;
}

export class SqliteEventStore implements EventStore {
  readonly runtimeLabel: RuntimeLabel;

  readonly #driver: SqliteDriver;
  readonly #config: EventStoreConfig;
  #closed = false;

  private constructor(driver: SqliteDriver, config: EventStoreConfig) {
    this.#driver = driver;
    this.#config = config;
    this.runtimeLabel = driver.label;
  }

  /**
   * Open a store on an already-connected driver, migrating it to the latest
   * schema version.
   *
   * The driver arrives connected rather than being opened here: `expo-sqlite`
   * and `node:sqlite` open databases differently, and letting this file know
   * which is which would put a runtime branch inside the one piece of code whose
   * whole value is that it has none.
   */
  static open(driver: SqliteDriver, options: OpenSqliteStoreOptions): SqliteEventStore {
    // WAL is controller §7's requirement for the native adapter. It is applied
    // through the shared driver so the substitute exercises the same setting; on
    // an in-memory database SQLite keeps `memory` journalling and the statement
    // is a no-op, which is why the result is not asserted here.
    driver.exec('PRAGMA journal_mode = WAL');
    driver.exec('PRAGMA foreign_keys = ON');
    // `secure_delete` makes the purge real at the file level. Without it SQLite
    // frees the old cell but leaves its bytes on the page, so a purged
    // encounter's text would still be recoverable from the database file — the
    // record would say "purged" and the disk would disagree. With it on, freed
    // content is overwritten with zeroes as part of the same write.
    driver.exec('PRAGMA secure_delete = ON');

    if (options.skipMigrations !== true) {
      migrateTo(driver, BUNKI_MIGRATIONS, LATEST_SCHEMA_VERSION);
    }

    const version = currentSchemaVersion(driver);
    if (version !== LATEST_SCHEMA_VERSION) {
      throw new SchemaVersionUnsupportedError(version, LATEST_SCHEMA_VERSION);
    }

    return new SqliteEventStore(driver, options);
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  #assertOpen(operation: string): void {
    if (this.#closed) throw new StoreClosedError(operation);
  }

  #loadRecords(): readonly StoredEventRecord[] {
    const rows = this.#driver.all<EventRow>(
      `SELECT event_id, payload, content_purged FROM ${EVENTS_TABLE} ORDER BY seq ASC`,
    );

    return rows.map((row) => {
      let raw: unknown;
      try {
        raw = JSON.parse(row.payload);
      } catch (error) {
        throw new StoreCorruptError(
          `event ${row.event_id} holds text that is not JSON (${error instanceof Error ? error.message : String(error)})`,
        );
      }
      let event: DomainEvent;
      try {
        event = parseEvent(raw);
      } catch (error) {
        throw new StoreCorruptError(
          `event ${row.event_id} does not satisfy the v1 schema (${error instanceof Error ? error.message : String(error)})`,
        );
      }
      return { event, canonical: canonicalJson(event), purged: row.content_purged === 1 };
    });
  }

  async readAll(): Promise<readonly DomainEvent[]> {
    this.#assertOpen('read the event log');
    return this.#loadRecords().map((record) => record.event);
  }

  async readStream(selector: StreamSelector): Promise<readonly DomainEvent[]> {
    this.#assertOpen('read a stream');
    const [column, value] =
      'threadId' in selector
        ? (['thread_id', selector.threadId] as const)
        : (['contract_id', selector.contractId] as const);

    const rows = this.#driver.all<EventRow>(
      `SELECT event_id, payload, content_purged FROM ${EVENTS_TABLE} WHERE ${column} = ? ORDER BY seq ASC`,
      [value],
    );

    return rows.map((row) => parseEvent(JSON.parse(row.payload)));
  }

  async snapshot(): Promise<DerivedState> {
    this.#assertOpen('take a snapshot');
    return replay(this.#loadRecords().map((record) => record.event));
  }

  async exportJson(): Promise<ExportEnvelope> {
    this.#assertOpen('export');
    return buildExportEnvelope({
      events: await this.readAll(),
      generatedAt: this.#config.clock.now(),
      appVersions: this.#config.appVersions,
    });
  }

  // -------------------------------------------------------------------------
  // QueryPort
  // -------------------------------------------------------------------------

  async countEvents(): Promise<number> {
    this.#assertOpen('count events');
    const rows = this.#driver.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${EVENTS_TABLE}`);
    return rows[0]?.n ?? 0;
  }

  async listThreadIds(): Promise<readonly string[]> {
    this.#assertOpen('list threads');
    return this.#driver
      .all<{
        thread_id: string;
      }>(
        `SELECT DISTINCT thread_id FROM ${EVENTS_TABLE} WHERE thread_id IS NOT NULL ORDER BY thread_id ASC`,
      )
      .map((row) => row.thread_id);
  }

  async threadState(threadId: string): Promise<ThreadState | null> {
    const state = await this.snapshot();
    return state.threads.find((thread) => thread.threadId === threadId) ?? null;
  }

  async eventById(eventId: EventId): Promise<DomainEvent | null> {
    this.#assertOpen('read an event');
    const rows = this.#driver.all<EventRow>(
      `SELECT event_id, payload, content_purged FROM ${EVENTS_TABLE} WHERE event_id = ?`,
      [eventId],
    );
    const row = rows[0];
    return row === undefined ? null : parseEvent(JSON.parse(row.payload));
  }

  async hasIdempotencyKey(idempotencyKey: string): Promise<boolean> {
    this.#assertOpen('check an idempotency key');
    const rows = this.#driver.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${EVENTS_TABLE} WHERE idempotency_key = ?`,
      [idempotencyKey],
    );
    return (rows[0]?.n ?? 0) > 0;
  }

  async derivedStateCacheMeta(): Promise<DerivedStateCacheMeta | null> {
    this.#assertOpen('read the derived-state cache');
    const rows = this.#driver.all<CacheRow>(
      `SELECT event_count, last_event_id, state_schema_version, rebuilt_at
         FROM ${DERIVED_STATE_CACHE_TABLE} WHERE id = 1`,
    );
    const row = rows[0];
    if (row === undefined) return null;
    return {
      eventCount: row.event_count,
      lastEventId: row.last_event_id,
      rebuiltAt: row.rebuilt_at,
      stateSchemaVersion: row.state_schema_version,
    };
  }

  // -------------------------------------------------------------------------
  // Append
  // -------------------------------------------------------------------------

  #loadBatch(idempotencyKey: string): AppendBatchRecord | null {
    const rows = this.#driver.all<BatchRow>(
      `SELECT idempotency_key, batch_fingerprint, event_ids
         FROM ${APPEND_BATCHES_TABLE} WHERE idempotency_key = ?`,
      [idempotencyKey],
    );
    const row = rows[0];
    if (row === undefined) return null;
    return {
      idempotencyKey: row.idempotency_key,
      fingerprint: row.batch_fingerprint,
      eventIds: JSON.parse(row.event_ids) as readonly EventId[],
    };
  }

  async append(events: readonly DomainEvent[], options: AppendOptions): Promise<AppendResult> {
    this.#assertOpen('append');

    const existing = this.#loadRecords();
    const priorBatch = this.#loadBatch(options.idempotencyKey);
    const plan = planAppend({
      existing,
      events,
      batchKey: options.idempotencyKey,
      priorBatch,
    });

    if (priorBatch !== null) {
      // Identical batch already applied — planAppend proved the fingerprints
      // match, so there is nothing to write and no transaction to open.
      return {
        outcome: 'duplicate-noop',
        appendedEventIds: [],
        skippedEventIds: plan.skippedEventIds,
        eventCount: existing.length,
      };
    }

    const indexes = computeEventIndexes(plan.fullLog);
    const insertFrom = plan.fullLog.length - plan.toInsert.length;
    const purgesInBatch = plan.toInsert.some((event) => event.type === 'ContentPurged');

    withTransaction(this.#driver, () => {
      plan.toInsert.forEach((event, offset) => {
        const index = indexes[insertFrom + offset] ?? {
          threadId: null,
          contractId: null,
          encounterId: null,
        };
        this.#driver.run(
          `INSERT INTO ${EVENTS_TABLE}
             (event_id, idempotency_key, type, schema_version, occurred_at,
              thread_id, contract_id, encounter_id, payload, content_purged)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
          [
            event.eventId,
            event.idempotencyKey,
            event.type,
            event.v,
            event.occurredAt,
            index.threadId,
            index.contractId,
            index.encounterId,
            canonicalJson(event),
          ],
        );
      });

      // The physical purge, in the same transaction as the record of it.
      const purgedEventIds = new Set<string>();
      plan.toInsert.forEach((event) => {
        if (event.type !== 'ContentPurged') return;
        assertPurgeAuthorised(plan.fullLog, event);
        planPurge(plan.fullLog, event).forEach((entry) => {
          this.#driver.run(
            `UPDATE ${EVENTS_TABLE} SET payload = ?, content_purged = 1 WHERE event_id = ?`,
            [canonicalJson(entry.redacted), entry.eventId],
          );
          purgedEventIds.add(entry.eventId);
        });
      });
      if (purgedEventIds.size > 0) this.#dropBatchesReferencing(purgedEventIds);

      this.#driver.run(
        `INSERT INTO ${APPEND_BATCHES_TABLE}
           (idempotency_key, batch_fingerprint, event_ids, appended_at)
         VALUES (?, ?, ?, ?)`,
        [
          options.idempotencyKey,
          plan.batchFingerprint,
          JSON.stringify(plan.toInsert.map((event) => event.eventId)),
          this.#config.clock.now(),
        ],
      );

      this.#refreshDerivedStateCache();
    });

    if (purgesInBatch) this.#reclaimPurgedBytes();

    return {
      outcome: plan.outcome,
      appendedEventIds: plan.toInsert.map((event) => event.eventId),
      skippedEventIds: plan.skippedEventIds,
      eventCount: existing.length + plan.toInsert.length,
    };
  }

  /**
   * Forget the batches that carried purged events.
   *
   * The batch table stores a digest, not the content (`../hash.ts`), so this is
   * belt as well as braces — but a one-way digest of a short piece of text is
   * not nothing, and "we deleted your data" should not come with a footnote. The
   * behavioural cost is nil: a re-append of a forgotten batch falls through to
   * the per-event checks, which skip purged events, so the call is still a
   * no-op and still does not resurrect anything.
   */
  #dropBatchesReferencing(purgedEventIds: ReadonlySet<string>): void {
    this.#driver
      .all<BatchRow>(
        `SELECT idempotency_key, batch_fingerprint, event_ids FROM ${APPEND_BATCHES_TABLE}`,
      )
      .forEach((row) => {
        const ids = JSON.parse(row.event_ids) as readonly string[];
        if (!ids.some((id) => purgedEventIds.has(id))) return;
        this.#driver.run(`DELETE FROM ${APPEND_BATCHES_TABLE} WHERE idempotency_key = ?`, [
          row.idempotency_key,
        ]);
      });
  }

  /**
   * Make the purge reach the file, not just the row.
   *
   * `UPDATE` writes a new record and frees the old one; `secure_delete` zeroes
   * the freed cell, but in WAL mode the *pre-update page image* can still be
   * sitting in the `-wal` file until a checkpoint, and freed pages can linger in
   * the freelist. Both are places a purged encounter could be read back from a
   * disk image while the log insists it was deleted.
   *
   * So after a batch containing a purge: checkpoint the WAL with `TRUNCATE`
   * (which empties the file rather than merely rewinding it) and `VACUUM`
   * (which rebuilds the database, dropping the freelist entirely). Both must run
   * *outside* a transaction, which is why this is a separate step after the
   * commit rather than part of it — the ordering is deliberate: the record of
   * the purge is durable before the reclamation begins, so a crash in between
   * leaves a purge that is recorded and re-runnable, not one that is neither.
   *
   * This runs only when a batch actually purged something. `VACUUM` rewrites the
   * whole database and is far too expensive to do on every append.
   */
  #reclaimPurgedBytes(): void {
    this.#driver.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    this.#driver.exec('VACUUM');
  }

  /**
   * Rewrite the derived-state cache from the log **as stored** — after any
   * redaction, not from the pre-purge plan. The cache exists to describe what is
   * in the database; describing what was about to be in it would make it a
   * second, subtly different history.
   */
  #refreshDerivedStateCache(): void {
    const records = this.#loadRecords();
    const state = replay(records.map((record) => record.event));
    this.#driver.run(
      `INSERT INTO ${DERIVED_STATE_CACHE_TABLE}
         (id, state_json, event_count, last_event_id, state_schema_version, rebuilt_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         state_json = excluded.state_json,
         event_count = excluded.event_count,
         last_event_id = excluded.last_event_id,
         state_schema_version = excluded.state_schema_version,
         rebuilt_at = excluded.rebuilt_at`,
      [
        canonicalJson(state),
        state.appliedEventCount,
        state.lastEventId,
        state.schemaVersion,
        this.#config.clock.now(),
      ],
    );
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#driver.close();
  }

  /** Exposed for the migration tests, which drive up/down against a live store. */
  get schemaVersion(): number {
    return currentSchemaVersion(this.#driver);
  }
}

export { fingerprintBatch };
