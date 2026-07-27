/**
 * What an append means, decided once for every adapter (WP-03; controller §7).
 *
 * The SQLite adapter and the provisional web adapter store bytes in completely
 * different places. They must not decide *differently* what an append does —
 * which events are new, which are honest re-appends, which are conflicts, and
 * whether the resulting log is one the domain will accept. That decision lives
 * here, in a pure function over the existing log and the incoming batch, so
 * there is exactly one set of idempotency semantics in the package and the
 * adapters are reduced to storage.
 *
 * ## The semantics, matching `@bunki/domain` exactly
 *
 * WP-02 hardened replay's rule and this is the same rule, one layer out:
 *
 *   - same `idempotencyKey`, byte-identical content → **no-op**. This is what
 *     makes a double-tapped capture produce exactly one thread.
 *   - same `idempotencyKey`, different content → **`IdempotencyConflictError`**.
 *     Two histories claim one key and there is no safe way to choose.
 *   - same `eventId`, different content → **`DuplicateEventIdError`**. Event ids
 *     are stable and unique; a collision means the log is corrupt, not that one
 *     of them should win.
 *
 * The error classes are `@bunki/domain`'s, imported rather than redefined. A
 * store with its own idempotency error type would be a store whose semantics can
 * drift from replay's without anything failing to compile — and the drift would
 * only show up as two devices deriving two different histories.
 *
 * ## Why the whole log is replayed before anything is written
 *
 * `planAppend` runs `replay` over (stored log ++ new events) and lets it throw.
 * That is the validation: rather than reimplementing "does this promotion have a
 * thread", "was this candidate attached", "does this purge cite a real
 * tombstone", the store asks the component that owns those answers. The cost is
 * one linear replay per append; the benefit is that **no log that fails to
 * replay can ever be committed**, which is the store-side reading of controller
 * §21.3(4) (unexplained data loss or replay divergence is a stop condition).
 *
 * If that cost ever matters at Phase-0 scale it is a §21.4 kill-criteria
 * decision for WP-10 with measurements attached — not a quiet removal.
 */

import {
  canonicalJson,
  DuplicateEventIdError,
  IdempotencyConflictError,
  parseEvent,
  replay,
  type DomainEvent,
  type EventId,
} from '@bunki/domain';

import { sha256Hex } from './hash.ts';
import type { AppendOutcome } from './port.ts';

/** One event as the store holds it. `purged` marks content already emptied. */
export interface StoredEventRecord {
  readonly event: DomainEvent;
  /** `canonicalJson(event)` of the bytes actually stored. */
  readonly canonical: string;
  readonly purged: boolean;
}

/** What the store remembers about a completed `append` call. */
export interface AppendBatchRecord {
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly eventIds: readonly EventId[];
}

export interface PlanAppendArgs {
  readonly existing: readonly StoredEventRecord[];
  readonly events: readonly DomainEvent[];
  readonly batchKey: string;
  /** The record of a previous call under `batchKey`, if there was one. */
  readonly priorBatch: AppendBatchRecord | null;
}

export interface AppendPlan {
  readonly outcome: AppendOutcome;
  /** Events to write, in order. Empty for a duplicate no-op. */
  readonly toInsert: readonly DomainEvent[];
  readonly skippedEventIds: readonly EventId[];
  /** Stored log plus `toInsert` — already proven to replay. */
  readonly fullLog: readonly DomainEvent[];
  readonly batchFingerprint: string;
}

/**
 * A stable digest of a batch, so "the same batch" is a byte fact, not a guess.
 *
 * A **digest**, not the canonical text. Storing the text was the first version
 * of this function and it quietly defeated the purge: `bunki_append_batches`
 * ended up holding a verbatim copy of every event ever appended, so emptying
 * `bunki_events` left the learner's encounter text intact one table over. The
 * contract suite's raw-storage assertion is what caught it, which is the reason
 * that assertion reads bytes rather than asking the port.
 */
export function fingerprintBatch(events: readonly DomainEvent[]): string {
  return sha256Hex(canonicalJson(events));
}

export function planAppend(args: PlanAppendArgs): AppendPlan {
  const { existing, batchKey, priorBatch } = args;

  // Re-parse rather than trust the static type. The port is reachable from
  // JavaScript and from JSON, where `DomainEvent` is a promise nobody kept.
  const events = args.events.map((event, index) => parseEvent(event, index));
  const batchFingerprint = fingerprintBatch(events);

  if (priorBatch !== null) {
    if (priorBatch.fingerprint === batchFingerprint) {
      return {
        outcome: 'duplicate-noop',
        toInsert: [],
        skippedEventIds: priorBatch.eventIds,
        fullLog: existing.map((record) => record.event),
        batchFingerprint,
      };
    }
    throw new IdempotencyConflictError(
      batchKey,
      priorBatch.eventIds[0] ?? '<empty batch>',
      events[0]?.eventId ?? '<empty batch>',
      0,
    );
  }

  const byIdempotencyKey = new Map<string, StoredEventRecord>();
  const byEventId = new Map<EventId, StoredEventRecord>();
  existing.forEach((record) => {
    byIdempotencyKey.set(record.event.idempotencyKey, record);
    byEventId.set(record.event.eventId, record);
  });

  const toInsert: DomainEvent[] = [];
  const skippedEventIds: EventId[] = [];

  events.forEach((event, index) => {
    const canonical = canonicalJson(event);
    const claimedKey = byIdempotencyKey.get(event.idempotencyKey);

    if (claimedKey !== undefined) {
      if (claimedKey.purged) {
        // A purge is not a conflict, and re-appending purged content must never
        // resurrect it. The learner asked for those bytes to be gone; the fact
        // that some caller still holds a copy does not revoke that. Skipping is
        // the only outcome that honours both the deletion and the idempotency
        // contract.
        skippedEventIds.push(claimedKey.event.eventId);
        return;
      }
      if (claimedKey.canonical === canonical) {
        skippedEventIds.push(claimedKey.event.eventId);
        return;
      }
      throw new IdempotencyConflictError(
        event.idempotencyKey,
        claimedKey.event.eventId,
        event.eventId,
        index,
      );
    }

    const claimedId = byEventId.get(event.eventId);
    if (claimedId !== undefined) {
      throw new DuplicateEventIdError(event.eventId, index);
    }

    toInsert.push(event);
    byIdempotencyKey.set(event.idempotencyKey, { event, canonical, purged: false });
    byEventId.set(event.eventId, { event, canonical, purged: false });
  });

  const fullLog = [...existing.map((record) => record.event), ...toInsert];

  // The gate: a log that does not replay is never written. Throws
  // ReducerInvariantError / PromotionTransitionError / DuplicateEventIdError /
  // IdempotencyConflictError, all of which name the offending event.
  replay(fullLog);

  return {
    outcome: toInsert.length === 0 ? 'duplicate-noop' : 'appended',
    toInsert,
    skippedEventIds,
    fullLog,
    batchFingerprint,
  };
}
