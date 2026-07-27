/**
 * `EventStorePort` and `QueryPort` (WP-03; controller §7).
 *
 * The controller names five methods and this file adds none:
 * `append(events, {idempotencyKey})`, `readAll()`, `readStream(...)`,
 * `snapshot()`, `exportJson()`. Everything else a caller might want lives on the
 * separate read-only `QueryPort`, so that the write surface stays exactly as
 * wide as the specification made it. A port that grows a convenience method
 * grows a way to bypass something.
 *
 * ## Why the methods return promises when both SQLite drivers are synchronous
 *
 * `expo-sqlite` and `node:sqlite` are both synchronous, and the provisional web
 * adapter is synchronous in memory. An async port is nonetheless the honest
 * shape: REQ-ARCH-05 keeps an IndexedDB web adapter on the table and IndexedDB
 * has no synchronous API. Promising synchrony now would mean either rewriting
 * every caller later, or keeping a synchronous facade over an asynchronous store
 * — which is how "immediate and durable" quietly becomes "immediate, durable
 * later" (T-01 is precisely the assertion that those are not the same).
 *
 * ## Why `readStream` takes a discriminated selector
 *
 * Controller §7 writes `readStream(threadId|contractId)`. A bare string cannot
 * say which it is, and thread ids and contract ids are both opaque strings that
 * may collide. The selector spells it out, so a caller cannot accidentally read
 * a thread's stream by passing a contract id that happens to match.
 *
 * ## Idempotency lives at two levels, on purpose
 *
 * `append` takes a batch-level `idempotencyKey` (controller §7) *and* every
 * event carries its own (ADR-002). They answer different questions:
 *
 *   - the **batch** key makes a double-tapped save button one write;
 *   - the **event** key makes one event appear once in the log however many
 *     batches contain it.
 *
 * Both follow the same rule, which is `@bunki/domain`'s rule verbatim: the same
 * key with byte-identical content is a no-op; the same key with different
 * content throws `IdempotencyConflictError`. The store deliberately reuses the
 * domain's error class rather than defining its own, because a divergence
 * between the store's idempotency semantics and replay's would be invisible
 * until it produced two different histories.
 */

import type { DerivedState, DomainEvent, EventId, ThreadState } from '@bunki/domain';
import type { ExportEnvelope } from '@bunki/export';

/** Which stream to read. See the header for why this is not a bare string. */
export type StreamSelector = { readonly threadId: string } | { readonly contractId: string };

export type AppendOutcome =
  /** At least one event was newly written. */
  | 'appended'
  /** The batch key had already been applied with identical content: nothing written. */
  | 'duplicate-noop';

export interface AppendResult {
  readonly outcome: AppendOutcome;
  /** Events newly written by this call, in log order. */
  readonly appendedEventIds: readonly EventId[];
  /**
   * Events this call did not write because their own `idempotencyKey` was
   * already present with byte-identical content. Reported rather than silently
   * folded into `appendedEventIds`: "we wrote it" and "it was already there" are
   * different facts, and only one of them is a no-op.
   */
  readonly skippedEventIds: readonly EventId[];
  /** Total events in the store after this call. */
  readonly eventCount: number;
}

export interface AppendOptions {
  readonly idempotencyKey: string;
}

/**
 * The durable event log (controller §7).
 *
 * Implementations: `SqliteEventStore` (native authority; also the ci-substitute
 * path) and `ProvisionalWebEventStore`. Both pass the same contract suite in
 * `src/contract/` — that shared suite is what makes "the adapters agree" a
 * tested claim rather than an architectural intention.
 */
export interface EventStorePort {
  /**
   * Append a batch atomically.
   *
   * Atomic means all-or-nothing: a batch that fails validation, cites a missing
   * tombstone, or conflicts on a key writes nothing at all. A partially applied
   * batch would leave derived state that no single event log explains.
   */
  append(events: readonly DomainEvent[], options: AppendOptions): Promise<AppendResult>;

  /** The whole log, in append order. */
  readAll(): Promise<readonly DomainEvent[]>;

  /**
   * The events belonging to one thread or one contract, in append order.
   *
   * "Belonging" is decided by the indexed columns the adapter writes at append
   * time, never by re-scanning payload text: an index that disagrees with the
   * log is a bug the contract suite catches, whereas a text scan would quietly
   * match a thread id that appeared inside someone's encounter text.
   */
  readStream(selector: StreamSelector): Promise<readonly DomainEvent[]>;

  /**
   * Derived state, produced by replaying the log through `@bunki/domain`.
   *
   * Always a replay, never a cache read. The adapters keep a derived-state cache
   * table (controller §7) but it is written *after* a replay and read only by
   * `QueryPort.derivedStateCacheMeta`, so it can never become the authority. A
   * cache that answers `snapshot()` is a second source of truth, and the first
   * time the two disagree the disagreement is silent.
   */
  snapshot(): Promise<DerivedState>;

  /** The controller §11 envelope: `{exportVersion, generatedAt, events, seedRefs, appVersions}`. */
  exportJson(): Promise<ExportEnvelope>;

  /** Release the underlying handle. Every method throws `StoreClosedError` after. */
  close(): Promise<void>;
}

export interface DerivedStateCacheMeta {
  readonly eventCount: number;
  readonly lastEventId: EventId | null;
  readonly rebuiltAt: string;
  /** Schema version of the derived-state shape that was cached. */
  readonly stateSchemaVersion: number;
}

/**
 * Read-only queries that are not part of the §7 write path.
 *
 * Everything here is answerable from `readAll()` plus a replay; the port exists
 * so the app and the inspector do not each re-derive it, and so both adapters
 * are held to the same answers by the contract suite.
 */
export interface QueryPort {
  countEvents(): Promise<number>;
  /** Ascending. */
  listThreadIds(): Promise<readonly string[]>;
  threadState(threadId: string): Promise<ThreadState | null>;
  eventById(eventId: EventId): Promise<DomainEvent | null>;
  /** Whether an event with this idempotency key is already in the log. */
  hasIdempotencyKey(idempotencyKey: string): Promise<boolean>;
  /**
   * The non-authoritative derived-state cache's bookkeeping, for observability
   * (controller §12) and for the contract suite's proof that the cache tracks
   * the log rather than leading it. `null` before the first `snapshot()`.
   */
  derivedStateCacheMeta(): Promise<DerivedStateCacheMeta | null>;
}

/** Both halves of the persistence surface, as one object. */
export interface EventStore extends EventStorePort, QueryPort {
  /**
   * How this store's results may be reported (REQ-ARCH-05, P0-CAP-15).
   *
   * A field, not a comment, because the label has to travel with the object into
   * test names and reports. `ci-substitute` never counts as native verification;
   * `web-provisional` is never reported as native persistence.
   */
  readonly runtimeLabel: RuntimeLabel;
}

/**
 * Runtimes this package can persist on, and the only vocabulary any report may
 * use for them.
 *
 * - `native` — `expo-sqlite` on a device. **Only WP-11 may claim this.** Nothing
 *   in CI produces it.
 * - `ci-substitute` — the identical adapter code and SQL, executed by a Node
 *   SQLite driver because CI has no native runtime (controller §7). A pass here
 *   is evidence about the adapter's logic and SQL, and evidence about nothing
 *   else.
 * - `web-provisional` — the provisional web adapter (REQ-ARCH-05).
 */
export const RUNTIME_LABELS = ['native', 'ci-substitute', 'web-provisional'] as const;

export type RuntimeLabel = (typeof RUNTIME_LABELS)[number];

/**
 * Human-readable honesty text for each runtime label. Exported so the app's
 * about screen (WP-05/WP-09) and every test report use the same words rather
 * than paraphrasing the guarantee into something stronger.
 */
export const RUNTIME_LABEL_DISCLOSURE: Readonly<Record<RuntimeLabel, string>> = Object.freeze({
  native: 'expo-sqlite on a device. Native persistence verification is WP-11 device evidence only.',
  'ci-substitute':
    'ci-substitute: the same adapter code and SQL run against a Node SQLite driver because CI has no native runtime. This never counts as native verification.',
  'web-provisional':
    'provisional web adapter. Web persistence results are never reported as native persistence.',
});

/**
 * What an adapter needs from its caller.
 *
 * `clock` and `appVersions` are injected for the same reason `@bunki/domain`
 * injects its clock (REQ-ARCH-02): an export whose `generatedAt` came from the
 * ambient clock could not be reproduced, and T-14 compares bytes.
 */
export interface EventStoreConfig {
  readonly clock: { now(): string };
  readonly appVersions: { readonly domain: string; readonly fsrs: string | null };
}
