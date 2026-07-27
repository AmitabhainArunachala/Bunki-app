/**
 * Deterministic replay (WP-02; T-03, controller §6.3).
 *
 * `replay(events)` folds an event log into `DerivedState`. It is the reference
 * implementation the golden fixtures pin, and the one every later adapter has
 * to agree with — in-memory here, sqlite and web at WP-03, native at WP-11.
 *
 * The function reads no clock, generates no ids, and consults nothing outside
 * its argument. Given the same array it returns a deeply equal, canonically
 * ordered result, every time, on every runtime. That is not a nice property; it
 * is the property every evidence claim in this product reduces to.
 *
 * **Idempotency.** A repeated `idempotencyKey` is skipped when it names the
 * same event, and rejected when it names a different one. Skipping identical
 * re-appends is what makes a double-tapped capture one thread; refusing
 * conflicting ones is what stops replay from silently choosing between two
 * histories.
 *
 * **Nothing is ignored.** Every family in the catalog is handled in the switch
 * below, with a `never` check on the default branch: adding a family without
 * teaching replay about it is a compile error. An event that cannot be applied
 * (a promotion for a thread with no capture, a purge with no tombstone) throws
 * rather than being passed over — a projection that skips what it does not
 * understand is a projection nobody can audit.
 */

import {
  DuplicateEventIdError,
  IdempotencyConflictError,
  ReducerInvariantError,
} from '../errors.ts';
import type { DomainEvent } from '../events/catalog.ts';
import { parseEventLog } from '../events/parse.ts';
import { initialThreadState, threadReducer, type ThreadState } from '../reducers/thread.ts';
import type { EventId } from '../primitives.ts';
import {
  compareIds,
  freezeDerivedState,
  type ContractRecord,
  type DerivedState,
  type ExportRecord,
  type ObservationRecord,
  type PurgeRecord,
  type SessionState,
} from './derived-state.ts';

interface MutableObservation {
  eventId: EventId;
  type: string;
  tier: ObservationRecord['tier'];
  at: string;
  contractId: string | null;
  superseded: boolean;
  supersededByEventId: EventId | null;
}

interface Accumulator {
  readonly threads: Map<string, ThreadState>;
  readonly contracts: Map<string, ContractRecord>;
  readonly observations: MutableObservation[];
  readonly observationIndex: Map<EventId, MutableObservation>;
  readonly sessions: Map<string, SessionState>;
  readonly exports: ExportRecord[];
  readonly purges: PurgeRecord[];
  /** candidateId → threadId, so `CandidateAcceptedAsNote` can find its thread. */
  readonly candidateOwner: Map<string, string>;
  /** tombstone eventId → threadId, so `ContentPurged` can find its thread. */
  readonly tombstoneOwner: Map<EventId, string>;
  appliedEventCount: number;
  skippedDuplicateCount: number;
  lastEventId: EventId | null;
  lastOccurredAt: string | null;
}

function emptyAccumulator(): Accumulator {
  return {
    threads: new Map(),
    contracts: new Map(),
    observations: [],
    observationIndex: new Map(),
    sessions: new Map(),
    exports: [],
    purges: [],
    candidateOwner: new Map(),
    tombstoneOwner: new Map(),
    appliedEventCount: 0,
    skippedDuplicateCount: 0,
    lastEventId: null,
    lastOccurredAt: null,
  };
}

function requireThread(
  accumulator: Accumulator,
  threadId: string,
  event: DomainEvent,
): ThreadState {
  const thread = accumulator.threads.get(threadId);
  if (thread === undefined) {
    throw new ReducerInvariantError(
      'replay.thread-exists',
      event.eventId,
      event.type,
      `thread ${threadId} has no EncounterCaptured in this log`,
    );
  }
  return thread;
}

function recordObservation(accumulator: Accumulator, observation: MutableObservation): void {
  accumulator.observations.push(observation);
  accumulator.observationIndex.set(observation.eventId, observation);
}

function applyEvent(accumulator: Accumulator, event: DomainEvent): void {
  switch (event.type) {
    case 'EncounterCaptured': {
      const existing = accumulator.threads.get(event.threadId);
      accumulator.threads.set(
        event.threadId,
        existing === undefined ? initialThreadState(event) : threadReducer(existing, event),
      );
      break;
    }

    case 'ThreadPromotionChanged': {
      const thread = requireThread(accumulator, event.threadId, event);
      accumulator.threads.set(event.threadId, threadReducer(thread, event));
      break;
    }

    case 'ContractCreated': {
      if (accumulator.contracts.has(event.contractId)) {
        throw new ReducerInvariantError(
          'replay.unique-contract',
          event.eventId,
          event.type,
          `contract ${event.contractId} was already created in this log`,
        );
      }
      accumulator.contracts.set(event.contractId, {
        contractId: event.contractId,
        contractVersion: event.contractVersion,
        targetComponentId: event.targetComponentId,
        skill: event.skill,
        scoredBy: event.acceptedAnswers === undefined ? 'rubric' : 'accepted_answers',
        createdAt: event.occurredAt,
        createdByEventId: event.eventId,
      });
      break;
    }

    case 'ReviewGraded': {
      recordObservation(accumulator, {
        eventId: event.eventId,
        type: event.type,
        tier: event.tier,
        at: event.occurredAt,
        contractId: event.contractId,
        superseded: false,
        supersededByEventId: null,
      });
      break;
    }

    case 'ProductionObserved': {
      recordObservation(accumulator, {
        eventId: event.eventId,
        type: event.type,
        tier: event.tier,
        at: event.occurredAt,
        contractId: event.contractId ?? null,
        superseded: false,
        supersededByEventId: null,
      });
      break;
    }

    case 'ExposureLogged': {
      recordObservation(accumulator, {
        eventId: event.eventId,
        type: event.type,
        tier: event.tier,
        at: event.occurredAt,
        contractId: null,
        superseded: false,
        supersededByEventId: null,
      });
      break;
    }

    case 'LookupFrictionLogged': {
      // No tier and no contract: a lookup is neither a success nor a failure
      // (T-07). It is recorded because friction is a nomination signal, and
      // recorded *without* a grade shape so nothing downstream can treat it
      // as one.
      recordObservation(accumulator, {
        eventId: event.eventId,
        type: event.type,
        tier: null,
        at: event.occurredAt,
        contractId: null,
        superseded: false,
        supersededByEventId: null,
      });
      break;
    }

    case 'EvidenceSuperseded': {
      const target = accumulator.observationIndex.get(event.supersededEventId);
      if (target === undefined) {
        throw new ReducerInvariantError(
          'replay.supersedes-known-observation',
          event.eventId,
          event.type,
          `observation ${event.supersededEventId} is not in this log before the correction`,
        );
      }
      if (target.superseded) {
        throw new ReducerInvariantError(
          'replay.supersede-once',
          event.eventId,
          event.type,
          `observation ${event.supersededEventId} was already superseded by ${String(target.supersededByEventId)}`,
        );
      }
      target.superseded = true;
      target.supersededByEventId = event.eventId;
      recordObservation(accumulator, {
        eventId: event.eventId,
        type: event.type,
        tier: null,
        at: event.occurredAt,
        contractId: null,
        superseded: false,
        supersededByEventId: null,
      });
      break;
    }

    case 'CandidateAttached': {
      const thread = requireThread(accumulator, event.threadId, event);
      if (accumulator.candidateOwner.has(event.candidateId)) {
        throw new ReducerInvariantError(
          'replay.unique-candidate',
          event.eventId,
          event.type,
          `candidate ${event.candidateId} is already attached to thread ${String(accumulator.candidateOwner.get(event.candidateId))}`,
        );
      }
      accumulator.threads.set(event.threadId, threadReducer(thread, event));
      accumulator.candidateOwner.set(event.candidateId, event.threadId);
      break;
    }

    case 'CandidateAcceptedAsNote': {
      const threadId = accumulator.candidateOwner.get(event.candidateId);
      if (threadId === undefined) {
        throw new ReducerInvariantError(
          'replay.accept-attached-candidate',
          event.eventId,
          event.type,
          `candidate ${event.candidateId} was never attached in this log`,
        );
      }
      const thread = requireThread(accumulator, threadId, event);
      accumulator.threads.set(threadId, threadReducer(thread, event));
      break;
    }

    case 'SessionStarted': {
      if (accumulator.sessions.has(event.sessionId)) {
        throw new ReducerInvariantError(
          'replay.unique-session',
          event.eventId,
          event.type,
          `session ${event.sessionId} was already started in this log`,
        );
      }
      accumulator.sessions.set(event.sessionId, {
        sessionId: event.sessionId,
        status: 'open',
        timeBudgetMin: event.budget.timeBudgetMin,
        newBudget: event.budget.newBudget,
        completionState: null,
        startedAt: event.occurredAt,
        closedAt: null,
      });
      break;
    }

    case 'SessionClosed': {
      const session = accumulator.sessions.get(event.sessionId);
      if (session === undefined) {
        throw new ReducerInvariantError(
          'replay.session-started-before-close',
          event.eventId,
          event.type,
          `session ${event.sessionId} was never started in this log`,
        );
      }
      if (session.status === 'closed') {
        throw new ReducerInvariantError(
          'replay.close-once',
          event.eventId,
          event.type,
          `session ${event.sessionId} is already closed`,
        );
      }
      accumulator.sessions.set(event.sessionId, {
        ...session,
        status: 'closed',
        completionState: event.completionState,
        closedAt: event.occurredAt,
      });
      break;
    }

    case 'DataExported': {
      accumulator.exports.push({
        eventId: event.eventId,
        exportVersion: event.exportVersion,
        scopeKind: event.scope.kind,
        threadIds: [...(event.scope.threadIds ?? [])],
        at: event.occurredAt,
      });
      break;
    }

    case 'ThreadTombstoned': {
      const thread = requireThread(accumulator, event.threadId, event);
      accumulator.threads.set(event.threadId, threadReducer(thread, event));
      accumulator.tombstoneOwner.set(event.eventId, event.threadId);
      break;
    }

    case 'ContentPurged': {
      const threadId = accumulator.tombstoneOwner.get(event.tombstoneEventId);
      if (threadId === undefined) {
        throw new ReducerInvariantError(
          'replay.purge-cites-known-tombstone',
          event.eventId,
          event.type,
          `tombstone ${event.tombstoneEventId} is not in this log`,
        );
      }
      const thread = requireThread(accumulator, threadId, event);
      accumulator.threads.set(threadId, threadReducer(thread, event));
      accumulator.purges.push({
        eventId: event.eventId,
        tombstoneEventId: event.tombstoneEventId,
        targetIds: [...event.targetIds],
        at: event.occurredAt,
      });
      break;
    }

    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

function finalise(accumulator: Accumulator): DerivedState {
  const threads = [...accumulator.threads.values()].sort((left, right) =>
    compareIds(left.threadId, right.threadId),
  );
  const contracts = [...accumulator.contracts.values()].sort((left, right) =>
    compareIds(left.contractId, right.contractId),
  );
  const sessions = [...accumulator.sessions.values()].sort((left, right) =>
    compareIds(left.sessionId, right.sessionId),
  );

  return freezeDerivedState({
    schemaVersion: 1,
    appliedEventCount: accumulator.appliedEventCount,
    skippedDuplicateCount: accumulator.skippedDuplicateCount,
    lastEventId: accumulator.lastEventId,
    lastOccurredAt: accumulator.lastOccurredAt,
    threads,
    contracts,
    observations: accumulator.observations.map((observation) => ({ ...observation })),
    sessions,
    exports: accumulator.exports,
    purges: accumulator.purges,
  });
}

/**
 * Fold a parsed event log into derived state.
 *
 * @throws DuplicateEventIdError, IdempotencyConflictError, ReducerInvariantError,
 *         PromotionTransitionError — replay never returns a partial result.
 */
export function replay(events: readonly DomainEvent[]): DerivedState {
  const accumulator = emptyAccumulator();
  const seenEventIds = new Map<EventId, string>();
  const seenIdempotencyKeys = new Map<string, EventId>();

  events.forEach((event, index) => {
    const claimedBy = seenIdempotencyKeys.get(event.idempotencyKey);
    if (claimedBy !== undefined) {
      if (claimedBy !== event.eventId) {
        throw new IdempotencyConflictError(event.idempotencyKey, claimedBy, event.eventId, index);
      }
      // Same key, same event: an honest re-append. No-op by design (§7).
      accumulator.skippedDuplicateCount += 1;
      return;
    }

    if (seenEventIds.has(event.eventId)) {
      throw new DuplicateEventIdError(event.eventId, index);
    }

    applyEvent(accumulator, event);

    seenEventIds.set(event.eventId, event.idempotencyKey);
    seenIdempotencyKeys.set(event.idempotencyKey, event.eventId);
    accumulator.appliedEventCount += 1;
    accumulator.lastEventId = event.eventId;
    accumulator.lastOccurredAt = event.occurredAt;
  });

  return finalise(accumulator);
}

/**
 * Parse a raw JSON log (fail-closed, T-04) and replay it.
 *
 * The entry point golden fixtures and WP-03's import path use: parsing and
 * replay are one step so no caller can accidentally replay unvalidated input.
 */
export function replayJson(raw: unknown, options: { path?: string } = {}): DerivedState {
  return replay(parseEventLog(raw, options));
}
