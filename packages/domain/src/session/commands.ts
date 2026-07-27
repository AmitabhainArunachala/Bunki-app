/**
 * The session command handler (WP-08; controller §5, §6.4).
 *
 * ## Why this is in the kernel and not in the app
 *
 * Controller §5: *"`apps/app` contains no scheduling, grading, or evidence logic
 * — it maps user interactions to domain commands and renders domain state."*
 * This file is the other half of that sentence. A screen submits
 * `{kind: 'answerStep', grade: 'hard'}` and gets back a new state; it never
 * mints an event, never decides what a probe is, and never asks whether
 * something counted.
 *
 * ## The workspace is a log, not a cache
 *
 * `SessionWorkspaceState` holds an event log and the `DerivedState` that
 * `replay` produces from it — recomputed on every append, not incrementally
 * patched. That is deliberately the slow, obviously-correct choice: the derived
 * state a session shows is then *by construction* the same derived state an
 * export would replay to (T-14), and there is no second projection to drift.
 * Phase-0 sessions are tens of events; if that ever stops being true, the fix is
 * an incremental fold that is tested against this one, not a cache that is
 * trusted.
 *
 * Every evidence-class event here is minted by `src/evidence/mint.ts` and judged
 * by `admitToScheduler` inside `replay` — the same gate, the same code path, for
 * a standalone review and an embedded canvas probe alike. There is no session
 * grading path.
 */

import type { DomainContext } from '../context/index.ts';
import { buildTargetThreadIndex, resolveComponentThread } from '../contracts/thread-link.ts';
import { RETRIEVAL_SKILLS } from '../events/shared.ts';
import type { RetrievalSkill } from '../contracts/retrieval-contract.ts';
import { mintReviewGraded } from '../evidence/mint.ts';
import { createDomainEvent } from '../events/factories.ts';
import type { CreateEventOptions, EventPayload } from '../events/factories.ts';
import type { ContractCreatedEvent, DomainEvent, ReviewGradedEvent } from '../events/catalog.ts';
import type { Grade, SessionCompletionState } from '../events/shared.ts';
import type { ContractId, EventId, IsoInstant, ThreadId } from '../primitives.ts';
import { replay } from '../replay/replay.ts';
import type { DerivedState } from '../replay/derived-state.ts';
import {
  recordCanvasInteraction,
  type CanvasClassification,
  type CanvasInteraction,
  type CanvasInteractionKind,
  type CanvasProbeOffer,
} from './canvas.ts';
import { selectDueContracts, type SessionPlanInput } from './plan.ts';
import {
  applyRejoin,
  enterBranch,
  evaluateRejoin,
  leaveRepair,
  openRepair,
  type RejoinObservation,
  type RepairBranchId,
  type RepairState,
  type RepairStumble,
} from './repair.ts';
import {
  advance,
  closeSession,
  completeCurrentStep,
  currentStep,
  observe,
  resolveCompletionState,
  startSession,
  type SessionRuntime,
} from './runtime.ts';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** One canvas judgement, kept so the canvas can show what each tap became. */
export interface CanvasLedgerEntry {
  readonly eventId: EventId;
  readonly interactionKind: CanvasInteractionKind;
  readonly classification: CanvasClassification;
  readonly at: IsoInstant;
}

export interface SessionWorkspaceState {
  /** Append-only, in order. Every entry came from a kernel factory. */
  readonly log: readonly DomainEvent[];
  /** `replay(log)`, recomputed on every append. Never patched by hand. */
  readonly derived: DerivedState;
  readonly runtime: SessionRuntime | null;
  readonly repair: RepairState | null;
  readonly canvasLedger: readonly CanvasLedgerEntry[];
}

/**
 * Open a workspace over an existing log.
 *
 * The seed log is whatever the loop has already produced — the captured target,
 * its promotion, the contracts created for it. Replaying it here rather than
 * trusting a summary is what makes the plan a function of the ledger.
 */
export function createSessionWorkspace(
  seedLog: readonly DomainEvent[] = [],
): SessionWorkspaceState {
  return Object.freeze({
    log: Object.freeze([...seedLog]),
    derived: replay(seedLog),
    runtime: null,
    repair: null,
    canvasLedger: Object.freeze([]),
  });
}

function withLog(
  state: SessionWorkspaceState,
  events: readonly DomainEvent[],
  changes: Partial<Omit<SessionWorkspaceState, 'log' | 'derived'>> = {},
): SessionWorkspaceState {
  const log = events.length === 0 ? state.log : Object.freeze([...state.log, ...events]);
  return Object.freeze({
    ...state,
    ...changes,
    log,
    derived: events.length === 0 ? state.derived : replay(log),
  });
}

// ---------------------------------------------------------------------------
// Projections the planner and the repair criterion need
// ---------------------------------------------------------------------------

/**
 * contractId → the thread that owns it.
 *
 * Uses WP-06's own projection (`component-identity` + `thread-link`) rather than
 * a second lookup, so a contract that names an uncaptured or ambiguously
 * captured component is absent here for exactly the reason the gate would refuse
 * it — and therefore never enters a plan.
 */
export function threadIndexByContract(
  state: SessionWorkspaceState,
): ReadonlyMap<ContractId, ThreadId> {
  const index = buildTargetThreadIndex(state.log);
  const map = new Map<ContractId, ThreadId>();
  for (const contract of state.derived.contracts) {
    const link = resolveComponentThread(index, contract.targetComponentId);
    if (link.linked) map.set(contract.contractId, link.threadId);
  }
  return map;
}

function skillOf(state: SessionWorkspaceState, contractId: ContractId): RetrievalSkill | null {
  const record = state.derived.contracts.find((entry) => entry.contractId === contractId);
  if (record === undefined) return null;
  return (RETRIEVAL_SKILLS as readonly string[]).includes(record.skill)
    ? (record.skill as RetrievalSkill)
    : null;
}

/**
 * Every graded review in this workspace, paired with the gate's verdict on it.
 *
 * The join is what makes the repair criterion checkable: `hintsUsed` and
 * `revealedBeforeRecall` live on the event, `admitted` and the reveal-corrected
 * grade live on the gate decision, and the criterion needs all four.
 */
export function rejoinObservations(state: SessionWorkspaceState): readonly RejoinObservation[] {
  const decisions = new Map(state.derived.gateDecisions.map((entry) => [entry.eventId, entry]));
  const out: RejoinObservation[] = [];
  for (const event of state.log) {
    if (event.type !== 'ReviewGraded') continue;
    const decision = decisions.get(event.eventId);
    out.push({
      eventId: event.eventId,
      contractId: event.contractId,
      effectiveGrade: decision?.effectiveGrade ?? event.grade,
      admitted: decision?.admitted ?? false,
      hintsUsed: event.hintsUsed,
      revealedBeforeRecall: event.revealedBeforeRecall,
      at: event.occurredAt,
    });
  }
  return out;
}

/**
 * The most recent miss worth repairing, or `null`.
 *
 * "Worth repairing" is an `again` — the only grade that says the retrieval did
 * not happen. A `hard` is a success under strain and opening a repair branch on
 * one would be the system deciding something is broken that the learner just
 * demonstrated is not (REQ-JRN-01: do not infer a cause confidently).
 */
export function latestStumble(state: SessionWorkspaceState): RepairStumble | null {
  for (let index = state.log.length - 1; index >= 0; index -= 1) {
    const event = state.log[index];
    if (event === undefined || event.type !== 'ReviewGraded') continue;
    if (event.grade !== 'again') continue;
    const skill = skillOf(state, event.contractId);
    if (skill === null) continue;
    const threadId = threadIndexByContract(state).get(event.contractId);
    if (threadId === undefined) continue;
    return {
      contractId: event.contractId,
      threadId,
      skill,
      eventId: event.eventId,
      at: event.occurredAt,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Mint the `ContractCreated` a session needs something to plan over.
 *
 * A five-line wrapper over the kernel's generic factory, and it exists for one
 * boundary reason: `apps/app` must not call `createDomainEvent` from a screen
 * (controller §5; `apps/app/test/screen-contract.test.ts` asserts it). Without a
 * named door here, the app would either reach the factory directly or hand-write
 * an event literal, and both are the bypass the rule closes.
 *
 * `contractId` defaults to the injected id generator. Everything else is the
 * caller's, because REQ-DM-05's field set is what makes a contract *scorable*
 * and inventing a cue direction or an answer key on a caller's behalf would be
 * the kernel deciding what the learner is being asked.
 *
 * The event is validated on the way out, and a contract that is well-formed but
 * unscorable is still recorded — the gate refuses it by name at replay, which is
 * where that judgement belongs (`src/contracts/retrieval-contract.ts`).
 */
export function createTargetContract(
  context: DomainContext,
  payload: Omit<EventPayload<'ContractCreated'>, 'contractId'> & { readonly contractId?: string },
  options: CreateEventOptions,
): ContractCreatedEvent {
  const { contractId, ...rest } = payload;
  return createDomainEvent(
    context,
    'ContractCreated',
    { ...rest, contractId: contractId ?? context.ids.nextId('contract') },
    options,
  );
}

/** What a learner did on a standalone review step. */
export interface StepAttempt {
  readonly grade: Grade;
  readonly latencyMs: number;
  readonly hintsUsed: number;
  readonly revealedBeforeRecall: boolean;
  readonly userConfirmedEasy?: true | undefined;
}

export interface StartSessionCommand {
  readonly kind: 'start';
  readonly timeBudgetMin: number;
  readonly newBudget: number;
  readonly canvasId?: string | undefined;
  /**
   * The instant "due" is measured against, supplied by the caller.
   *
   * The kernel reads no clock (REQ-ARCH-02), and a planner that took one would
   * be untestable across runtimes. The app passes its injected
   * `DomainContext.clock`; a fixture passes a fixed instant.
   */
  readonly asOf: IsoInstant;
  readonly labelByContract?: ReadonlyMap<ContractId, string> | undefined;
}

export type SessionCommand =
  | StartSessionCommand
  | { readonly kind: 'answerStep'; readonly attempt: StepAttempt }
  | { readonly kind: 'skipStep' }
  | { readonly kind: 'completeStep' }
  | {
      readonly kind: 'canvasInteraction';
      readonly interaction: CanvasInteraction;
      readonly offer: CanvasProbeOffer | null;
    }
  | { readonly kind: 'openRepair'; readonly stumble: RepairStumble }
  | {
      readonly kind: 'chooseRepairBranch';
      readonly branch: RepairBranchId;
      readonly at: IsoInstant;
    }
  /**
   * Re-probe the contract that stumbled, from inside the branch.
   *
   * Separate from `answerStep` because it is not a step: it probes the *stumbled*
   * contract wherever the session cursor happens to be, which is the only kind of
   * evidence {@link REJOIN_CRITERION} accepts. Routing it through `answerStep`
   * would make repairs depend on the plan containing the broken contract, and a
   * repair that is only possible when the sitting happened to schedule the same
   * item is not a repair branch.
   */
  | { readonly kind: 'repairProbe'; readonly attempt: StepAttempt }
  | { readonly kind: 'checkRejoin' }
  | { readonly kind: 'leaveRepair' }
  | { readonly kind: 'close'; readonly completionState?: SessionCompletionState | undefined };

/**
 * Apply one command.
 *
 * Total: an inapplicable command (answering with no session open, choosing a
 * branch with no repair) returns the state unchanged rather than throwing. A
 * screen that raced its own state should render a stale frame, not crash.
 *
 * Idempotency keys are derived from the session, the step, and the position in
 * the canvas ledger — content, never a counter the caller supplies — so a double
 * tap produces the same key and replay collapses it into one event (§7).
 */
export function applySessionCommand(
  context: DomainContext,
  state: SessionWorkspaceState,
  command: SessionCommand,
): SessionWorkspaceState {
  switch (command.kind) {
    case 'start': {
      if (state.runtime !== null && state.runtime.status === 'open') return state;

      const dueContracts = selectDueContracts(state.derived, {
        asOf: command.asOf,
        threadByContract: threadIndexByContract(state),
        labelByContract: command.labelByContract,
      });

      const input: SessionPlanInput = {
        timeBudgetMin: command.timeBudgetMin,
        newBudget: command.newBudget,
        dueContracts,
        ...(command.canvasId === undefined ? {} : { canvasId: command.canvasId }),
      };

      const started = startSession(context, input, {
        idempotencyKey: `session:start:${command.asOf}:${String(command.timeBudgetMin)}`,
      });
      return withLog(state, [started.event], { runtime: started.runtime });
    }

    case 'answerStep': {
      const runtime = state.runtime;
      if (runtime === null || runtime.status !== 'open') return state;
      const step = currentStep(runtime);
      if (step === null || step.contractId === null) return state;

      const confirmation =
        command.attempt.userConfirmedEasy === true ? { userConfirmedEasy: true as const } : {};

      const event: ReviewGradedEvent = mintReviewGraded(
        context,
        {
          contractId: step.contractId,
          grade: command.attempt.grade,
          latencyMs: command.attempt.latencyMs,
          hintsUsed: command.attempt.hintsUsed,
          revealedBeforeRecall: command.attempt.revealedBeforeRecall,
          probeContext: 'standalone',
          ...confirmation,
        },
        { idempotencyKey: `review:${runtime.sessionId}:${step.stepId}` },
      );

      return withLog(state, [event], { runtime: observe(runtime, event) });
    }

    case 'skipStep': {
      if (state.runtime === null) return state;
      return withLog(state, [], { runtime: advance(state.runtime) });
    }

    case 'completeStep': {
      if (state.runtime === null) return state;
      return withLog(state, [], { runtime: completeCurrentStep(state.runtime) });
    }

    case 'canvasInteraction': {
      const ordinal = state.canvasLedger.length;
      const record = recordCanvasInteraction(context, command.interaction, command.offer, {
        idempotencyKey: `canvas:${command.interaction.experienceId}:${String(ordinal)}`,
      });

      const entry: CanvasLedgerEntry = {
        eventId: record.event.eventId,
        interactionKind: command.interaction.kind,
        classification: record.classification,
        at: record.event.occurredAt,
      };

      return withLog(state, [record.event], {
        canvasLedger: Object.freeze([...state.canvasLedger, entry]),
        // A canvas probe still counts as progress on the step it happened on,
        // through the same `observe` every other observation goes through.
        runtime: state.runtime === null ? null : observe(state.runtime, record.event),
      });
    }

    case 'openRepair':
      return withLog(state, [], { repair: openRepair(command.stumble) });

    case 'chooseRepairBranch': {
      if (state.repair === null) return state;
      return withLog(state, [], {
        repair: enterBranch(state.repair, command.branch, command.at),
      });
    }

    case 'repairProbe': {
      const repair = state.repair;
      if (repair === null || repair.phase !== 'in_branch') return state;

      const contractId = repair.stumble.contractId;
      const prefix = `repair:${contractId}:`;
      const ordinal = state.log.filter((event) => event.idempotencyKey.startsWith(prefix)).length;

      const confirmation =
        command.attempt.userConfirmedEasy === true ? { userConfirmedEasy: true as const } : {};

      const event: ReviewGradedEvent = mintReviewGraded(
        context,
        {
          contractId,
          grade: command.attempt.grade,
          latencyMs: command.attempt.latencyMs,
          hintsUsed: command.attempt.hintsUsed,
          revealedBeforeRecall: command.attempt.revealedBeforeRecall,
          probeContext: 'standalone',
          ...confirmation,
        },
        { idempotencyKey: `${prefix}${String(ordinal)}` },
      );

      return withLog(state, [event], {
        runtime: state.runtime === null ? null : observe(state.runtime, event),
      });
    }

    case 'checkRejoin': {
      if (state.repair === null) return state;
      const decision = evaluateRejoin(state.repair, rejoinObservations(state));
      return withLog(state, [], { repair: applyRejoin(state.repair, decision) });
    }

    case 'leaveRepair': {
      if (state.repair === null) return state;
      return withLog(state, [], { repair: leaveRepair(state.repair) });
    }

    case 'close': {
      const runtime = state.runtime;
      if (runtime === null || runtime.status === 'closed') return state;
      const completionState = command.completionState ?? resolveCompletionState(runtime);
      const closed = closeSession(context, runtime, completionState, {
        idempotencyKey: `session:close:${runtime.sessionId}`,
      });
      return withLog(state, closed.event === null ? [] : [closed.event], {
        runtime: closed.runtime,
      });
    }

    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}
