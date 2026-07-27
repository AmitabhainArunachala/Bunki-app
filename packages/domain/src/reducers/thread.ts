/**
 * Thread state, derived from events alone (WP-02).
 *
 * A `LearningThread` is the user-owned continuity wrapper around a target and
 * everything that has happened to it (REQ-DM-01). This reducer projects that
 * from the log: which encounters belong to it, what the learner promoted it to
 * and when, which AI candidates were attached and which were accepted, and
 * whether it has been tombstoned or purged.
 *
 * It is pure, total over the families it accepts, and it never mutates its
 * input — every transition returns a fresh frozen object, so a caller holding a
 * previous state (an inspector showing "before", a test asserting no aliasing)
 * still holds exactly what it had.
 *
 * Cross-thread resolution is *not* here. `CandidateAcceptedAsNote` names only a
 * candidate and `ContentPurged` names only target ids; mapping those back to a
 * thread needs the whole log, which is the replay layer's job. This file stays
 * a function of (one thread, one event) so it can be tested exhaustively.
 *
 * No FSRS, no memory state, no scheduling — those are WP-06's, and a thread
 * reducer that reached for them would be the second scheduler REQ-SCH-01
 * forbids.
 */

import { ReducerInvariantError } from '../errors.ts';
import type {
  CandidateAcceptedAsNoteEvent,
  CandidateAttachedEvent,
  ContentPurgedEvent,
  EncounterCapturedEvent,
  ThreadPromotionChangedEvent,
  ThreadTombstonedEvent,
} from '../events/catalog.ts';
import type { PromotionOrigin, PromotionState } from '../events/shared.ts';
import type { EventId, IsoInstant } from '../primitives.ts';
import { INITIAL_PROMOTION_STATE, promotionReducer } from './promotion.ts';

/**
 * Lifecycle, in the only order it can occur: a thread is active, then
 * tombstoned (a sync-safe marker), then purged (payload bytes gone). Purging
 * without a tombstone is rejected — that is what keeps deletion auditable
 * without the audit trail retaining the deleted content (ADR-002).
 */
export const THREAD_LIFECYCLES = ['active', 'tombstoned', 'purged'] as const;
export type ThreadLifecycle = (typeof THREAD_LIFECYCLES)[number];

export interface PromotionTransitionRecord {
  readonly eventId: EventId;
  readonly at: IsoInstant;
  readonly from: PromotionState;
  readonly to: PromotionState;
  readonly origin: PromotionOrigin;
}

export interface ThreadState {
  readonly threadId: string;
  readonly promotion: PromotionState;
  /** Every promotion the learner made, oldest first. The ladder's audit trail. */
  readonly promotionHistory: readonly PromotionTransitionRecord[];
  /** Encounter ids in log order; the first is the thread's BEGAN_WITH edge. */
  readonly encounterIds: readonly string[];
  readonly candidateIds: readonly string[];
  /** Candidates the learner explicitly accepted as notes. Never auto-populated. */
  readonly acceptedCandidateIds: readonly string[];
  readonly lifecycle: ThreadLifecycle;
  readonly tombstoneEventId: EventId | null;
  readonly createdAt: IsoInstant;
  readonly lastEventAt: IsoInstant;
}

/** The events that act on a single thread. */
export type ThreadScopedEvent =
  | EncounterCapturedEvent
  | ThreadPromotionChangedEvent
  | CandidateAttachedEvent
  | CandidateAcceptedAsNoteEvent
  | ThreadTombstonedEvent
  | ContentPurgedEvent;

const freeze = <T>(value: T): T => Object.freeze(value);

/** A thread is born from its first encounter, always in `captured`. */
export function initialThreadState(event: EncounterCapturedEvent): ThreadState {
  return freeze({
    threadId: event.threadId,
    promotion: INITIAL_PROMOTION_STATE,
    promotionHistory: freeze([] as readonly PromotionTransitionRecord[]),
    encounterIds: freeze([event.encounterId]),
    candidateIds: freeze([] as readonly string[]),
    acceptedCandidateIds: freeze([] as readonly string[]),
    lifecycle: 'active' as ThreadLifecycle,
    tombstoneEventId: null,
    createdAt: event.occurredAt,
    lastEventAt: event.occurredAt,
  });
}

/**
 * Anything arriving after the tombstone is rejected.
 *
 * A deleted thread that keeps accruing encounters or promotions is not a
 * deleted thread. The tombstone is the sync-safe boundary; writes past it would
 * be resurrected on the next device that replayed the log.
 */
function assertMutable(state: ThreadState, event: ThreadScopedEvent, action: string): void {
  if (state.lifecycle !== 'active') {
    throw new ReducerInvariantError(
      'thread.active-before-write',
      event.eventId,
      event.type,
      `cannot ${action} on thread ${state.threadId}: it is ${state.lifecycle}`,
    );
  }
}

export function threadReducer(state: ThreadState, event: ThreadScopedEvent): ThreadState {
  switch (event.type) {
    case 'EncounterCaptured': {
      assertMutable(state, event, 'record a re-encounter');
      if (state.encounterIds.includes(event.encounterId)) {
        throw new ReducerInvariantError(
          'thread.unique-encounter',
          event.eventId,
          event.type,
          `encounter ${event.encounterId} is already on thread ${state.threadId}`,
        );
      }
      return freeze({
        ...state,
        encounterIds: freeze([...state.encounterIds, event.encounterId]),
        lastEventAt: event.occurredAt,
      });
    }

    case 'ThreadPromotionChanged': {
      assertMutable(state, event, 'change promotion');
      const promotion = promotionReducer(state.promotion, event);
      const record: PromotionTransitionRecord = freeze({
        eventId: event.eventId,
        at: event.occurredAt,
        from: event.from,
        to: event.to,
        origin: event.origin,
      });
      return freeze({
        ...state,
        promotion,
        promotionHistory: freeze([...state.promotionHistory, record]),
        lastEventAt: event.occurredAt,
      });
    }

    case 'CandidateAttached': {
      assertMutable(state, event, 'attach a candidate');
      if (state.candidateIds.includes(event.candidateId)) {
        throw new ReducerInvariantError(
          'thread.unique-candidate',
          event.eventId,
          event.type,
          `candidate ${event.candidateId} is already attached to thread ${state.threadId}`,
        );
      }
      return freeze({
        ...state,
        candidateIds: freeze([...state.candidateIds, event.candidateId]),
        lastEventAt: event.occurredAt,
      });
    }

    case 'CandidateAcceptedAsNote': {
      assertMutable(state, event, 'accept a candidate');
      if (!state.candidateIds.includes(event.candidateId)) {
        throw new ReducerInvariantError(
          'thread.accept-attached-candidate',
          event.eventId,
          event.type,
          `candidate ${event.candidateId} was never attached to thread ${state.threadId}`,
        );
      }
      if (state.acceptedCandidateIds.includes(event.candidateId)) {
        throw new ReducerInvariantError(
          'thread.accept-once',
          event.eventId,
          event.type,
          `candidate ${event.candidateId} was already accepted on thread ${state.threadId}`,
        );
      }
      return freeze({
        ...state,
        acceptedCandidateIds: freeze([...state.acceptedCandidateIds, event.candidateId]),
        lastEventAt: event.occurredAt,
      });
    }

    case 'ThreadTombstoned': {
      assertMutable(state, event, 'tombstone');
      return freeze({
        ...state,
        lifecycle: 'tombstoned' as ThreadLifecycle,
        tombstoneEventId: event.eventId,
        lastEventAt: event.occurredAt,
      });
    }

    case 'ContentPurged': {
      if (state.lifecycle !== 'tombstoned') {
        throw new ReducerInvariantError(
          'thread.tombstone-before-purge',
          event.eventId,
          event.type,
          `thread ${state.threadId} is ${state.lifecycle}; a purge must follow a tombstone`,
        );
      }
      if (state.tombstoneEventId !== event.tombstoneEventId) {
        throw new ReducerInvariantError(
          'thread.purge-cites-its-tombstone',
          event.eventId,
          event.type,
          `purge cites tombstone ${event.tombstoneEventId} but thread ${state.threadId} was tombstoned by ${String(state.tombstoneEventId)}`,
        );
      }
      return freeze({
        ...state,
        lifecycle: 'purged' as ThreadLifecycle,
        lastEventAt: event.occurredAt,
      });
    }

    default: {
      // Exhaustiveness: adding a thread-scoped family without handling it here
      // is a compile error, not a silently ignored event.
      const unreachable: never = event;
      return unreachable;
    }
  }
}
