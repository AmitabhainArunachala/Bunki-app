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
 * **Idempotency.** A repeated `idempotencyKey` is skipped only when it names the
 * same `eventId` *and* carries byte-identical content; it is rejected when
 * either differs. Skipping identical re-appends is what makes a double-tapped
 * capture one thread; refusing conflicting ones is what stops replay from
 * silently choosing between two histories. Note that the `eventId` check alone
 * is not sufficient for that second guarantee — a producer that reuses an id
 * with a changed payload would otherwise have the change dropped without a
 * word, which is the same silent choice in a quieter costume.
 *
 * **Nothing is ignored.** Every family in the catalog is handled in the switch
 * below, with a `never` check on the default branch: adding a family without
 * teaching replay about it is a compile error. An event that cannot be applied
 * (a promotion for a thread with no capture, a purge with no tombstone) throws
 * rather than being passed over — a projection that skips what it does not
 * understand is a projection nobody can audit.
 *
 * **Scheduling enters here and only here (WP-06).** Every evidence-class
 * observation is put to the gate (`src/evidence/`), its verdict is recorded in
 * `gateDecisions`, and only an admitted tier-A review reaches the FSRS reducer
 * (`src/reducers/memory-state.ts`). A *rejection* is not an error: a review of
 * an unpromoted contract, a lookup, an exposure, and an unconfirmed `easy` are
 * all things that legitimately happened and legitimately changed no schedule.
 * They stay in the ledger with a named reason, because "why did that not count"
 * is a question the evidence inspector has to be able to answer (REQ-UI-06).
 */

import {
  activatesSkill,
  bindRetrievalContract,
  emptyTargetThreadIndex,
  indexEncounter,
  retrievalContractFromEvent,
  type MutableTargetThreadIndex,
  type RetrievalContract,
} from '../contracts/index.ts';
import {
  DuplicateEventIdError,
  IdempotencyConflictError,
  ReducerInvariantError,
} from '../errors.ts';
import { admitToScheduler, type EvidenceGateContext } from '../evidence/index.ts';
import { isEvidenceClassEvent, type DomainEvent } from '../events/catalog.ts';
import { parseEventLog } from '../events/parse.ts';
import type { PromotionState } from '../events/shared.ts';
import {
  applyAdmittedReview,
  initialMemoryState,
  setMemoryStateActive,
  type MemoryState,
} from '../reducers/memory-state.ts';
import { initialThreadState, threadReducer, type ThreadState } from '../reducers/thread.ts';
import type { ContractId, EventId, IsoInstant, ThreadId } from '../primitives.ts';
import { canonicalJson } from './canonical-json.ts';
import {
  compareIds,
  freezeDerivedState,
  type ContractRecord,
  type DerivedState,
  type ExportRecord,
  type GateDecisionRecord,
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
  /** Applied canonical prefix, used for source-bound contract authority. */
  readonly appliedEvents: DomainEvent[];
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
  // --- WP-06: contracts, the gate, and the scheduler ---
  /** Scorable contract entities, by id (REQ-DM-05). */
  readonly contractEntities: Map<ContractId, RetrievalContract>;
  /** Contracts whose `ContractCreated` was well-formed but not scorable. */
  readonly invalidContractIds: Set<ContractId>;
  /** The target→thread projection, folded forward with the log. */
  readonly componentIndex: MutableTargetThreadIndex;
  readonly promotionByThread: Map<ThreadId, PromotionState>;
  readonly deletedThreadIds: Set<ThreadId>;
  readonly memoryStates: Map<ContractId, MemoryState>;
  readonly gateDecisions: GateDecisionRecord[];
  appliedEventCount: number;
  skippedDuplicateCount: number;
  lastEventId: EventId | null;
  lastOccurredAt: string | null;
}

function emptyAccumulator(): Accumulator {
  return {
    appliedEvents: [],
    threads: new Map(),
    contracts: new Map(),
    observations: [],
    observationIndex: new Map(),
    sessions: new Map(),
    exports: [],
    purges: [],
    candidateOwner: new Map(),
    tombstoneOwner: new Map(),
    contractEntities: new Map(),
    invalidContractIds: new Set(),
    componentIndex: emptyTargetThreadIndex(),
    promotionByThread: new Map(),
    deletedThreadIds: new Set(),
    memoryStates: new Map(),
    gateDecisions: [],
    appliedEventCount: 0,
    skippedDuplicateCount: 0,
    lastEventId: null,
    lastOccurredAt: null,
  };
}

/**
 * Which observations a later correction retracted (REQ-DM-04.2).
 *
 * The only backward-looking step in replay, and it is a pre-pass rather than a
 * second fold because a correction is *about* an earlier event by definition.
 * Without it, `EvidenceSuperseded` would move a marker in the ledger while the
 * misgraded review carried on driving the learner's intervals — a correction
 * affordance that corrects nothing (REQ-UI-06).
 */
function collectSupersededEventIds(events: readonly DomainEvent[]): ReadonlySet<EventId> {
  const superseded = new Set<EventId>();
  events.forEach((event) => {
    if (event.type === 'EvidenceSuperseded') superseded.add(event.supersededEventId);
  });
  return superseded;
}

function gateContext(
  accumulator: Accumulator,
  supersededEventIds: ReadonlySet<EventId>,
): EvidenceGateContext {
  return {
    contracts: accumulator.contractEntities,
    invalidContractIds: accumulator.invalidContractIds,
    threadIndex: accumulator.componentIndex,
    promotionByThread: accumulator.promotionByThread,
    deletedThreadIds: accumulator.deletedThreadIds,
    supersededEventIds,
    eventLog: accumulator.appliedEvents,
  };
}

/**
 * Is this contract schedulable right now?
 *
 * The same three conditions the gate applies to a review — linked to a thread,
 * that thread not deleted, that thread's promotion state activating this
 * skill — so activation and admission can never drift apart into two rules that
 * disagree about the same contract.
 */
function isContractActive(accumulator: Accumulator, contract: RetrievalContract): boolean {
  const bound = bindRetrievalContract(accumulator.appliedEvents, contract.contractId);
  if (!bound.bound) return false;
  if (accumulator.deletedThreadIds.has(bound.value.threadId)) return false;
  const promotion = accumulator.promotionByThread.get(bound.value.threadId);
  if (promotion === undefined) return false;
  return activatesSkill(promotion, contract.skill);
}

/**
 * Bring every contract's activation in line with the log so far.
 *
 * Run after each applied event. Promotion activates contracts (REQ-DM-09), and
 * three different events can change the answer: a promotion change, a contract
 * arriving on an already-promoted thread, and a capture that binds — or newly
 * makes ambiguous — a component. Recomputing all of them once per event is the
 * version of this that cannot get out of step; the alternative is three partial
 * update paths and a bug in whichever one nobody exercised.
 *
 * A deactivated contract keeps its `MemoryState`. Demotion is reversible
 * (WP-02's promotion ladder allows it on purpose), and discarding the schedule
 * would silently destroy the learner's review history for it.
 */
function recomputeActivation(accumulator: Accumulator, at: IsoInstant): void {
  accumulator.contractEntities.forEach((contract, contractId) => {
    const active = isContractActive(accumulator, contract);
    const existing = accumulator.memoryStates.get(contractId);
    if (existing === undefined) {
      if (active) accumulator.memoryStates.set(contractId, initialMemoryState(contractId, at));
      return;
    }
    accumulator.memoryStates.set(contractId, setMemoryStateActive(existing, active));
  });
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

/**
 * Run the gate on one observation and apply what it admits (WP-06).
 *
 * Every evidence-class observation gets a recorded verdict, admitted or not.
 * Nothing is skipped and nothing throws: a review naming a contract this log
 * never created is a *rejection* with a reason, not a corrupt log — a single
 * bad producer event must not make the whole ledger unreadable, which is the
 * opposite of an auditable evidence trail.
 */
function judge(
  accumulator: Accumulator,
  event: DomainEvent,
  supersededEventIds: ReadonlySet<EventId>,
): void {
  if (!isEvidenceClassEvent(event)) return;

  const decision = admitToScheduler(event, gateContext(accumulator, supersededEventIds));

  accumulator.gateDecisions.push({
    eventId: event.eventId,
    type: event.type,
    contractId: decision.contractId,
    admitted: decision.admitted,
    reason: decision.admitted ? null : decision.reason,
    effectiveGrade: decision.admitted ? decision.effectiveGrade : null,
    forcedByReveal: decision.admitted ? decision.forcedByReveal : false,
    authority: decision.admitted ? decision.authority : null,
    at: event.occurredAt,
  });

  if (!decision.admitted) return;

  const state = accumulator.memoryStates.get(decision.contractId);
  if (state === undefined) {
    // Unreachable while `isContractActive` and the gate share their conditions;
    // kept because "unreachable" is a claim about today's code, and a silent
    // no-op here would look exactly like a review that simply did not count.
    throw new ReducerInvariantError(
      'replay.admitted-review-has-memory-state',
      event.eventId,
      event.type,
      `the gate admitted a review for contract ${decision.contractId} but no MemoryState was activated for it`,
    );
  }

  accumulator.memoryStates.set(
    decision.contractId,
    applyAdmittedReview(state, {
      contractId: decision.contractId,
      effectiveGrade: decision.effectiveGrade,
      reviewedAt: event.occurredAt,
    }),
  );
}

function applyEvent(
  accumulator: Accumulator,
  event: DomainEvent,
  supersededEventIds: ReadonlySet<EventId>,
): void {
  switch (event.type) {
    case 'EncounterCaptured': {
      const existing = accumulator.threads.get(event.threadId);
      const next =
        existing === undefined ? initialThreadState(event) : threadReducer(existing, event);
      accumulator.threads.set(event.threadId, next);
      accumulator.promotionByThread.set(event.threadId, next.promotion);
      // The contract→thread projection (WP-06): a capture instantiates the
      // KnowledgeComponent for its target and binds it to this thread.
      indexEncounter(accumulator.componentIndex, event);
      break;
    }

    case 'ThreadPromotionChanged': {
      const thread = requireThread(accumulator, event.threadId, event);
      const next = threadReducer(thread, event);
      accumulator.threads.set(event.threadId, next);
      accumulator.promotionByThread.set(event.threadId, next.promotion);
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
      // The entity, separately: a well-formed record of an unscorable contract
      // is folded into the registry and refused by the gate (REQ-DM-05).
      const entity = retrievalContractFromEvent(event);
      if (entity.valid) {
        accumulator.contractEntities.set(event.contractId, entity.contract);
      } else {
        accumulator.invalidContractIds.add(event.contractId);
      }
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
      judge(accumulator, event, supersededEventIds);
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
      judge(accumulator, event, supersededEventIds);
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
      judge(accumulator, event, supersededEventIds);
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
      judge(accumulator, event, supersededEventIds);
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
      judge(accumulator, event, supersededEventIds);
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
      accumulator.deletedThreadIds.add(event.threadId);
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
  const memoryStates = [...accumulator.memoryStates.values()].sort((left, right) =>
    compareIds(left.contractId, right.contractId),
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
    gateDecisions: accumulator.gateDecisions,
    memoryStates,
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
  const supersededEventIds = collectSupersededEventIds(events);
  const seenEventIds = new Map<EventId, string>();
  /** key → the eventId that claimed it, and the exact bytes it claimed it with. */
  const seenIdempotencyKeys = new Map<string, { eventId: EventId; canonical: string }>();

  events.forEach((event, index) => {
    const claim = seenIdempotencyKeys.get(event.idempotencyKey);
    if (claim !== undefined) {
      if (claim.eventId !== event.eventId) {
        throw new IdempotencyConflictError(
          event.idempotencyKey,
          claim.eventId,
          event.eventId,
          index,
        );
      }
      // Same key and same eventId is not yet enough to call this a re-append:
      // the payload has to match too. Matching ids with differing content are
      // two histories, and skipping the second would silently pick one — the
      // very choice the conflict error exists to refuse. Compare canonical
      // bytes so key order cannot disguise a real difference.
      if (canonicalJson(event) !== claim.canonical) {
        throw new IdempotencyConflictError(
          event.idempotencyKey,
          claim.eventId,
          event.eventId,
          index,
        );
      }
      // Same key, same event, same content: an honest re-append. No-op (§7).
      accumulator.skippedDuplicateCount += 1;
      return;
    }

    if (seenEventIds.has(event.eventId)) {
      throw new DuplicateEventIdError(event.eventId, index);
    }

    applyEvent(accumulator, event, supersededEventIds);
    accumulator.appliedEvents.push(event);
    // Promotion activates contracts (REQ-DM-09). Three families can change the
    // answer — promotion, contract creation, capture — and a tombstone can
    // withdraw it, so activation is settled once per event rather than in four
    // partial update paths.
    recomputeActivation(accumulator, event.occurredAt);

    seenEventIds.set(event.eventId, event.idempotencyKey);
    seenIdempotencyKeys.set(event.idempotencyKey, {
      eventId: event.eventId,
      canonical: canonicalJson(event),
    });
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
