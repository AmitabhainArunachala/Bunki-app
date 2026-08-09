/**
 * The shape replay produces (WP-02).
 *
 * Two properties are designed in rather than tested for.
 *
 * **Everything is an array, sorted by a declared key.** Not a `Record`. Two
 * runs of one log can build an object with the same entries in different
 * insertion orders; `toEqual` would pass and the JSON snapshot would differ,
 * which is exactly the kind of divergence T-03 exists to catch and exactly the
 * kind a lenient comparison hides. Arrays with a stated sort make the
 * serialised form canonical, so a golden fixture can be compared byte-for-byte
 * across runtimes (controller §6.3).
 *
 * **Everything is JSON-representable.** No `Map`, no `Set`, no `undefined`
 * fields — absent means absent, and a nullable field is spelled `| null`. The
 * same snapshot has to survive export and re-import at WP-03 (T-14) without a
 * custom codec.
 *
 * `contracts` is a registry of what was created and `observations` is an
 * ordered ledger of what was observed — neither judges anything. The judging is
 * `gateDecisions`, and its consequences are `memoryStates` (WP-06). Keeping the
 * three separate is what lets the inspector show a review, the verdict on it,
 * and the schedule it did or did not change, as three facts rather than one
 * conclusion (REQ-UI-06).
 */

import type { EvidenceTier, Grade, SessionCompletionState } from '../events/shared.ts';
import type { EventId, IsoInstant } from '../primitives.ts';
import type { GateRejectionReason, VerifiedRetrievalAuthority } from '../evidence/gate.ts';
import type { MemoryState } from '../reducers/memory-state.ts';
import type { ThreadState } from '../reducers/thread.ts';

/** What a `ContractCreated` established. Registry only — no memory state. */
export interface ContractRecord {
  readonly contractId: string;
  readonly contractVersion: number;
  readonly targetComponentId: string;
  readonly skill: string;
  readonly scoredBy: 'accepted_answers' | 'rubric';
  readonly createdAt: IsoInstant;
  readonly createdByEventId: EventId;
}

/**
 * One recorded observation, in log order.
 *
 * `tier` is `null` for `LookupFrictionLogged` (it carries none) and for
 * `EvidenceSuperseded` (it is a correction, not an observation). `superseded`
 * is set when a later `EvidenceSuperseded` names this event — history is never
 * rewritten (REQ-DM-04.2), so the original stays and gains a marker.
 *
 * Nothing here says whether the observation counts. That is the gate's word.
 */
export interface ObservationRecord {
  readonly eventId: EventId;
  readonly type: string;
  readonly tier: EvidenceTier | null;
  readonly at: IsoInstant;
  readonly contractId: string | null;
  readonly superseded: boolean;
  readonly supersededByEventId: EventId | null;
}

/**
 * What the evidence gate decided about one observation, in log order.
 *
 * Recorded for every evidence-class observation, admitted or not. A ledger that
 * only showed the reviews that counted would answer "what is my schedule" and
 * leave "why did that one not count" unanswerable — and the second question is
 * the one a learner asks after a correction (REQ-UI-06, REQ-DM-07).
 */
export interface GateDecisionRecord {
  readonly eventId: EventId;
  readonly type: string;
  readonly contractId: string | null;
  readonly admitted: boolean;
  /** `null` when admitted; the closed-list reason otherwise. */
  readonly reason: GateRejectionReason | null;
  /** The grade the scheduler was told about — reveal-corrected (T-06). */
  readonly effectiveGrade: Grade | null;
  /** True when the reveal rule overrode the submitted grade. */
  readonly forcedByReveal: boolean;
  /** Non-null only for an independently verified, source-bound v2 retrieval. */
  readonly authority: VerifiedRetrievalAuthority | null;
  readonly at: IsoInstant;
}

export interface SessionState {
  readonly sessionId: string;
  readonly status: 'open' | 'closed';
  readonly timeBudgetMin: number;
  readonly newBudget: number;
  readonly completionState: SessionCompletionState | null;
  readonly startedAt: IsoInstant;
  readonly closedAt: IsoInstant | null;
}

export interface ExportRecord {
  readonly eventId: EventId;
  readonly exportVersion: string;
  readonly scopeKind: 'all' | 'threads';
  readonly threadIds: readonly string[];
  readonly at: IsoInstant;
}

export interface PurgeRecord {
  readonly eventId: EventId;
  readonly tombstoneEventId: EventId;
  readonly targetIds: readonly string[];
  readonly at: IsoInstant;
}

export interface DerivedState {
  /** Mirrors the event schema version this state was derived under. */
  readonly schemaVersion: 1;
  readonly appliedEventCount: number;
  /** Events skipped because their idempotency key had already been applied. */
  readonly skippedDuplicateCount: number;
  readonly lastEventId: EventId | null;
  readonly lastOccurredAt: IsoInstant | null;
  /** Sorted by `threadId`. */
  readonly threads: readonly ThreadState[];
  /** Sorted by `contractId`. */
  readonly contracts: readonly ContractRecord[];
  /** Log order — an evidence ledger's order is part of its meaning. */
  readonly observations: readonly ObservationRecord[];
  /** Log order. One entry per evidence-class observation (WP-06). */
  readonly gateDecisions: readonly GateDecisionRecord[];
  /**
   * Sorted by `contractId`. Present only for contracts an explicit promotion
   * activated — a captured or merely kept thread schedules nothing (T-02).
   */
  readonly memoryStates: readonly MemoryState[];
  /** Sorted by `sessionId`. */
  readonly sessions: readonly SessionState[];
  /** Log order. */
  readonly exports: readonly ExportRecord[];
  /** Log order. */
  readonly purges: readonly PurgeRecord[];
}

export const EMPTY_DERIVED_STATE: DerivedState = Object.freeze({
  schemaVersion: 1,
  appliedEventCount: 0,
  skippedDuplicateCount: 0,
  lastEventId: null,
  lastOccurredAt: null,
  threads: Object.freeze([]),
  contracts: Object.freeze([]),
  observations: Object.freeze([]),
  gateDecisions: Object.freeze([]),
  memoryStates: Object.freeze([]),
  sessions: Object.freeze([]),
  exports: Object.freeze([]),
  purges: Object.freeze([]),
}) as DerivedState;

/**
 * Deep-freeze a derived state so a consumer cannot mutate a replay result and
 * make two "identical" replays diverge after the fact.
 */
export function freezeDerivedState(state: DerivedState): DerivedState {
  state.threads.forEach((thread) => {
    Object.freeze(thread.encounterIds);
    Object.freeze(thread.candidateIds);
    Object.freeze(thread.acceptedCandidateIds);
    thread.promotionHistory.forEach(Object.freeze);
    Object.freeze(thread.promotionHistory);
    Object.freeze(thread);
  });
  state.gateDecisions.forEach((decision) => {
    if (decision.authority !== null) Object.freeze(decision.authority);
  });
  [
    state.contracts,
    state.observations,
    state.gateDecisions,
    state.memoryStates,
    state.sessions,
    state.exports,
    state.purges,
  ].forEach((list) => {
    list.forEach(Object.freeze);
    Object.freeze(list);
  });
  Object.freeze(state.threads);
  return Object.freeze(state);
}

/** Ascending, byte-wise, locale-independent. Sorting must not depend on the host locale. */
export function compareIds(left: string, right: string): -1 | 0 | 1 {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Alias used in tests and by later WPs to name the thing being compared. */
export type DerivedStateSnapshot = DerivedState;
