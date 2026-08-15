/**
 * The **provisional** web event store (WP-03; controller §7, REQ-ARCH-05,
 * P0-CAP-15).
 *
 * Provisional is the load-bearing word in this file, and it appears in the class
 * name, in `runtimeLabel`, in {@link PROVISIONAL_WEB_ADAPTER_NOTICE}, in the
 * package README, and in every test name that runs here — because the honesty
 * requirement is that a reader of *any* of those five places learns the same
 * thing without having to find the other four.
 *
 * What "provisional" means concretely:
 *
 *   - **Web persistence results are never reported as native persistence.** T-16
 *     on this adapter is `T-16-web`, a different claim from `T-16-native`, which
 *     is WP-11's and only WP-11's.
 *   - The storage strategy itself is provisional. Controller §7 permits
 *     "IndexedDB (or in-memory + localStorage snapshot if IndexedDB proves
 *     unstable in CI)". This implementation takes the second option — the whole
 *     log lives in memory and is written to an injected snapshot store after
 *     every mutation.
 *
 * ## Why the snapshot store is injected rather than being `localStorage`
 *
 * Because `localStorage` is a browser global, and a package that reaches for a
 * global cannot be tested without pretending to be a browser. The interface
 * below is deliberately `localStorage`'s own shape, so the app passes
 * `window.localStorage` and the tests pass a map — with no adapter in between
 * that could behave differently from the thing it stands for.
 *
 * ## The honest limits of this adapter
 *
 * A whole-log rewrite per append is `O(n)` in bytes and will not scale past a
 * Phase-0 dataset. That is a deliberate trade, not an oversight: the correctness
 * properties (atomic batches, idempotency, purge, replay-before-commit) are
 * identical to the SQLite adapter's because they come from the same shared
 * modules, and the storage strategy is the part explicitly marked as replaceable.
 * If a later phase needs IndexedDB, everything except this file stays.
 *
 * There is no separate durability guarantee here beyond the snapshot store's
 * own. In a browser tab that is killed between the in-memory mutation and the
 * snapshot write, the append is lost — which is why the write happens inside the
 * same synchronous step as the mutation, and why this adapter is not the one any
 * durability claim rests on.
 */

import {
  canonicalJson,
  parseEvent,
  parseEventLog,
  replay,
  type DerivedState,
  type DomainEvent,
  type EventId,
  type ThreadState,
} from '@bunki/domain';
import { buildExportEnvelope, type ExportEnvelope } from '@bunki/export';

import { planAppend, type AppendBatchRecord, type StoredEventRecord } from '../append-plan.ts';
import { SchemaVersionUnsupportedError, StoreClosedError, StoreCorruptError } from '../errors.ts';
import { computeEventIndexes, type EventIndex } from '../indexing.ts';
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

/**
 * The single sentence every surface uses. One string, so the about screen
 * (WP-05/WP-09), the README, and the test reports cannot drift into three
 * differently-strong versions of the same disclosure.
 */
export const PROVISIONAL_WEB_ADAPTER_NOTICE =
  'Provisional web storage: this adapter keeps the event log in memory and snapshots it to browser storage. It is not the native store, and web persistence results are never reported as native persistence.';

/**
 * `localStorage`'s shape, exactly. Pass `window.localStorage` or a map.
 *
 * `setItem` is the durability boundary: it must either replace the value and
 * return, or throw without changing the previous value. That is the browser
 * Storage contract this provisional adapter is designed around. A backend that
 * commits and then throws cannot be reconciled through this synchronous shape;
 * callers must not emulate rollback with a second, potentially destructive
 * write.
 */
export interface SnapshotStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** An in-memory snapshot store, for tests and for a browser with storage denied. */
export function createMemorySnapshotStore(): SnapshotStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/**
 * The snapshot format's own version.
 *
 * Fails closed on an unknown value, like every other version in this project: a
 * build that guessed at a snapshot it does not understand would silently drop
 * whatever it could not read, and the learner would find out by noticing their
 * threads were gone.
 */
export const WEB_SNAPSHOT_VERSION = 1;

export const DEFAULT_SNAPSHOT_KEY = 'bunki.persistence.web.v1';

interface WebSnapshotPayload {
  readonly webSnapshotVersion: number;
  readonly events: readonly unknown[];
  readonly purgedEventIds: readonly string[];
  readonly batches: readonly {
    readonly idempotencyKey: string;
    readonly fingerprint: string;
    readonly eventIds: readonly string[];
  }[];
  readonly cache: DerivedStateCacheMeta | null;
}

export interface OpenWebStoreOptions extends EventStoreConfig {
  readonly snapshotStore?: SnapshotStore;
  readonly snapshotKey?: string;
}

export class ProvisionalWebEventStore implements EventStore {
  readonly runtimeLabel: RuntimeLabel = 'web-provisional';
  /** Same sentence as the exported constant; carried on the instance for UIs. */
  readonly provisionalNotice = PROVISIONAL_WEB_ADAPTER_NOTICE;

  readonly #config: EventStoreConfig;
  readonly #snapshotStore: SnapshotStore;
  readonly #snapshotKey: string;

  #records: StoredEventRecord[] = [];
  #indexes: EventIndex[] = [];
  #batches = new Map<string, AppendBatchRecord>();
  #cache: DerivedStateCacheMeta | null = null;
  #closed = false;

  private constructor(options: OpenWebStoreOptions) {
    this.#config = options;
    this.#snapshotStore = options.snapshotStore ?? createMemorySnapshotStore();
    this.#snapshotKey = options.snapshotKey ?? DEFAULT_SNAPSHOT_KEY;
  }

  /**
   * Open a store, restoring whatever the snapshot store holds.
   *
   * Constructing a second instance over the same snapshot store is exactly what
   * a page reload does, which is why `T-16-web`'s restart simulation is a
   * `open()` call and not a mock.
   */
  static open(options: OpenWebStoreOptions): ProvisionalWebEventStore {
    const store = new ProvisionalWebEventStore(options);
    store.#restore();
    return store;
  }

  #restore(): void {
    const raw = this.#snapshotStore.getItem(this.#snapshotKey);
    if (raw === null) return;

    let parsed: WebSnapshotPayload;
    try {
      parsed = JSON.parse(raw) as WebSnapshotPayload;
    } catch (error) {
      throw new StoreCorruptError(
        `web snapshot at key ${this.#snapshotKey} is not JSON (${error instanceof Error ? error.message : String(error)})`,
      );
    }

    if (parsed.webSnapshotVersion !== WEB_SNAPSHOT_VERSION) {
      throw new SchemaVersionUnsupportedError(
        Number(parsed.webSnapshotVersion),
        WEB_SNAPSHOT_VERSION,
      );
    }

    const purged = new Set(parsed.purgedEventIds ?? []);
    const events = parseEventLog(parsed.events, { path: this.#snapshotKey });

    this.#records = events.map((event) => ({
      event,
      canonical: canonicalJson(event),
      purged: purged.has(event.eventId),
    }));
    this.#indexes = [...computeEventIndexes(events)];
    this.#batches = new Map(
      (parsed.batches ?? []).map((batch) => [
        batch.idempotencyKey,
        {
          idempotencyKey: batch.idempotencyKey,
          fingerprint: batch.fingerprint,
          eventIds: batch.eventIds,
        },
      ]),
    );
    this.#cache = parsed.cache ?? null;
  }

  #persist(
    records: readonly StoredEventRecord[],
    batches: ReadonlyMap<string, AppendBatchRecord>,
    cache: DerivedStateCacheMeta | null,
  ): void {
    const payload: WebSnapshotPayload = {
      webSnapshotVersion: WEB_SNAPSHOT_VERSION,
      events: records.map((record) => record.event),
      purgedEventIds: records
        .filter((record) => record.purged)
        .map((record) => record.event.eventId),
      batches: [...batches.values()].map((batch) => ({
        idempotencyKey: batch.idempotencyKey,
        fingerprint: batch.fingerprint,
        eventIds: [...batch.eventIds],
      })),
      cache,
    };
    this.#snapshotStore.setItem(this.#snapshotKey, JSON.stringify(payload));
  }

  #assertOpen(operation: string): void {
    if (this.#closed) throw new StoreClosedError(operation);
  }

  // -------------------------------------------------------------------------
  // EventStorePort
  // -------------------------------------------------------------------------

  async append(events: readonly DomainEvent[], options: AppendOptions): Promise<AppendResult> {
    this.#assertOpen('append');

    const priorBatch = this.#batches.get(options.idempotencyKey) ?? null;
    const plan = planAppend({
      existing: this.#records,
      events,
      batchKey: options.idempotencyKey,
      priorBatch,
    });

    if (priorBatch !== null) {
      return {
        outcome: 'duplicate-noop',
        appendedEventIds: [],
        skippedEventIds: plan.skippedEventIds,
        eventCount: this.#records.length,
      };
    }

    // Build the next state entirely before assigning it. An exception halfway
    // through must leave the in-memory log exactly as it was — the same
    // all-or-nothing property the SQLite adapter gets from its transaction.
    const nextRecords: StoredEventRecord[] = [
      ...this.#records,
      ...plan.toInsert.map((event) => ({
        event,
        canonical: canonicalJson(event),
        purged: false,
      })),
    ];

    const purgedEventIds = new Set<string>();
    plan.toInsert.forEach((event) => {
      if (event.type !== 'ContentPurged') return;
      assertPurgeAuthorised(plan.fullLog, event);
      planPurge(plan.fullLog, event).forEach((entry) => {
        const target = nextRecords.findIndex((record) => record.event.eventId === entry.eventId);
        if (target === -1) return;
        nextRecords[target] = {
          event: entry.redacted,
          canonical: canonicalJson(entry.redacted),
          purged: true,
        };
        purgedEventIds.add(entry.eventId);
      });
    });

    const storedEvents = nextRecords.map((record) => record.event);
    const state = replay(storedEvents);
    const nextIndexes = [...computeEventIndexes(storedEvents)];
    const nextBatches = new Map(this.#batches);

    // Forget the staged batches that carried purged events, for the reason the SQLite
    // adapter does: the stored fingerprint is a digest rather than the content,
    // but a digest of a short text is not nothing, and "deleted" should not come
    // with a footnote. Behaviourally free — a re-append falls through to the
    // per-event checks, which skip purged events.
    [...nextBatches.entries()].forEach(([key, batch]) => {
      if (batch.eventIds.some((id) => purgedEventIds.has(id))) nextBatches.delete(key);
    });

    nextBatches.set(options.idempotencyKey, {
      idempotencyKey: options.idempotencyKey,
      fingerprint: plan.batchFingerprint,
      eventIds: plan.toInsert.map((event) => event.eventId),
    });
    const nextCache: DerivedStateCacheMeta = {
      eventCount: state.appliedEventCount,
      lastEventId: state.lastEventId,
      rebuiltAt: this.#config.clock.now(),
      stateSchemaVersion: state.schemaVersion,
    };

    // Persist the complete candidate before publishing any of it through this
    // live handle. A failure-atomic SnapshotStore throw therefore leaves log,
    // indexes, batches, cache, exports, and subscribers on one committed truth.
    this.#persist(nextRecords, nextBatches, nextCache);

    // `setItem` returned: the durable write is committed and the assignments
    // below are non-throwing publication of that same candidate.
    this.#records = nextRecords;
    this.#indexes = nextIndexes;
    this.#batches = nextBatches;
    this.#cache = nextCache;

    return {
      outcome: plan.outcome,
      appendedEventIds: plan.toInsert.map((event) => event.eventId),
      skippedEventIds: plan.skippedEventIds,
      eventCount: this.#records.length,
    };
  }

  async readAll(): Promise<readonly DomainEvent[]> {
    this.#assertOpen('read the event log');
    return this.#records.map((record) => record.event);
  }

  async readStream(selector: StreamSelector): Promise<readonly DomainEvent[]> {
    this.#assertOpen('read a stream');
    const matches = (index: EventIndex): boolean =>
      'threadId' in selector
        ? index.threadId === selector.threadId
        : index.contractId === selector.contractId;

    return this.#records
      .filter((_record, position) => {
        const index = this.#indexes[position];
        return index !== undefined && matches(index);
      })
      .map((record) => record.event);
  }

  async snapshot(): Promise<DerivedState> {
    this.#assertOpen('take a snapshot');
    return replay(this.#records.map((record) => record.event));
  }

  async exportJson(): Promise<ExportEnvelope> {
    this.#assertOpen('export');
    return buildExportEnvelope({
      events: await this.readAll(),
      generatedAt: this.#config.clock.now(),
      appVersions: this.#config.appVersions,
    });
  }

  async close(): Promise<void> {
    this.#closed = true;
  }

  // -------------------------------------------------------------------------
  // QueryPort
  // -------------------------------------------------------------------------

  async countEvents(): Promise<number> {
    this.#assertOpen('count events');
    return this.#records.length;
  }

  async listThreadIds(): Promise<readonly string[]> {
    this.#assertOpen('list threads');
    const ids = new Set<string>();
    this.#indexes.forEach((index) => {
      if (index.threadId !== null) ids.add(index.threadId);
    });
    return [...ids].sort();
  }

  async threadState(threadId: string): Promise<ThreadState | null> {
    const state = await this.snapshot();
    return state.threads.find((thread) => thread.threadId === threadId) ?? null;
  }

  async eventById(eventId: EventId): Promise<DomainEvent | null> {
    this.#assertOpen('read an event');
    return this.#records.find((record) => record.event.eventId === eventId)?.event ?? null;
  }

  async hasIdempotencyKey(idempotencyKey: string): Promise<boolean> {
    this.#assertOpen('check an idempotency key');
    return this.#records.some((record) => record.event.idempotencyKey === idempotencyKey);
  }

  async derivedStateCacheMeta(): Promise<DerivedStateCacheMeta | null> {
    this.#assertOpen('read the derived-state cache');
    return this.#cache;
  }
}

/** Re-exported so a caller restoring a snapshot can validate one event at a time. */
export { parseEvent };
