/**
 * Running a planned session (WP-08; controller §6.4, REQ-SCH-04/05, T-13).
 *
 * ## The one invariant this file exists to hold
 *
 * **The plan cannot grow.** `planSession` is called in exactly one place —
 * `startSession`, before the session exists — and every function that takes a
 * running `SessionRuntime` returns one whose `plan` is the *same object* it was
 * handed. Not an equal one: the same one. Nothing downstream of `startSession`
 * can reach a plan constructor, so a step cannot be appended, a due contract
 * cannot be discovered mid-session, and "one more" is not expressible.
 *
 * That is T-13's unit half, and it is worth saying why it is structural rather
 * than checked. A guard like `if (plan.steps.length > original) throw` protects
 * against the version of the bug you thought of. Making growth unrepresentable
 * protects against the one you did not: the property test in
 * `test/session/t13-plan-cannot-grow.test.ts` throws every ordering of every
 * event family at a running session and asserts plan identity survives, and it
 * can only pass because there is nothing in this file for it to catch.
 *
 * ## Progress, and what it refuses to claim
 *
 * A step is `answered` when an observation of it arrived, `skipped` when the
 * learner moved past it, and neither before that. Progress counts steps, never
 * memory: whether a review *counted* is the evidence gate's verdict
 * (`src/evidence/`) and this module never asks. A session screen showing "4 of 6"
 * is describing the sitting, not the learner (REQ-LM-03: no global scalar).
 *
 * ## Totality
 *
 * Nothing here throws. Closing a closed session, advancing past the end, and
 * observing an event that matches nothing are all no-ops that return the runtime
 * unchanged. A session is a UI-facing object arriving from a device with a back
 * button and a double tap; an exception on a redundant gesture would be a defect
 * dressed as strictness.
 */

import type { DomainContext } from '../context/index.ts';
import { createDomainEvent } from '../events/factories.ts';
import type { DomainEvent, SessionClosedEvent, SessionStartedEvent } from '../events/catalog.ts';
import type { SessionCompletionState } from '../events/shared.ts';
import type { IsoInstant, SessionId } from '../primitives.ts';
import { planSession, type SessionPlan, type SessionPlanInput, type SessionStep } from './plan.ts';

/** How far one step got. `pending` is the only non-terminal value. */
export const STEP_OUTCOMES = ['pending', 'answered', 'skipped'] as const;
export type StepOutcome = (typeof STEP_OUTCOMES)[number];

export interface SessionRuntime {
  readonly sessionId: SessionId;
  /**
   * Held by reference and never rebuilt. Identity is the invariant — see this
   * file's header.
   */
  readonly plan: SessionPlan;
  /** Index of the step the learner is on. Equal to `stepCount` when finished. */
  readonly cursor: number;
  /** One outcome per plan step, in plan order. Same length as `plan.steps`, always. */
  readonly outcomes: readonly StepOutcome[];
  readonly status: 'open' | 'closed';
  readonly completionState: SessionCompletionState | null;
  readonly startedAt: IsoInstant;
  readonly closedAt: IsoInstant | null;
  /**
   * Evidence-class event ids this session collected, in arrival order.
   *
   * A record of what the sitting produced, not a judgement about it. The
   * inspector joins these back to the gate's decisions (REQ-UI-06).
   */
  readonly observedEventIds: readonly string[];
}

export interface StartSessionOptions {
  /** Required, never defaulted — see `CreateEventOptions.idempotencyKey`. */
  readonly idempotencyKey: string;
  /** Overrides the injected id generator, for fixtures and replay. */
  readonly sessionId?: string | undefined;
}

export interface StartedSession {
  readonly runtime: SessionRuntime;
  readonly event: SessionStartedEvent;
}

/**
 * Plan a session and open it.
 *
 * The plan is computed *before* the `SessionStarted` event is minted, so the
 * event's budget and the plan's budget are the same value rather than two
 * values that agree today. The event carries the budget the learner chose, which
 * is what `SessionStarted.budget` means in ADR-002 — not what the plan managed
 * to spend.
 */
export function startSession(
  context: DomainContext,
  input: SessionPlanInput,
  options: StartSessionOptions,
): StartedSession {
  const plan = planSession(input);
  const sessionId = options.sessionId ?? context.ids.nextId('session');

  const event = createDomainEvent(
    context,
    'SessionStarted',
    { sessionId, budget: plan.budget },
    { idempotencyKey: options.idempotencyKey },
  );

  return {
    runtime: Object.freeze({
      sessionId,
      plan,
      cursor: 0,
      outcomes: Object.freeze(plan.steps.map(() => 'pending' as StepOutcome)),
      status: 'open' as const,
      completionState: null,
      startedAt: event.occurredAt,
      closedAt: null,
      observedEventIds: Object.freeze([]),
    }),
    event,
  };
}

/** The step the learner is on, or `null` once the plan is exhausted. */
export function currentStep(runtime: SessionRuntime): SessionStep | null {
  return runtime.plan.steps[runtime.cursor] ?? null;
}

/**
 * Rebuild a runtime with a changed cursor/outcome set.
 *
 * The only constructor in this module, and it copies `plan` by reference rather
 * than by spread-of-steps, which is precisely what makes plan identity hold.
 */
function withProgress(
  runtime: SessionRuntime,
  changes: {
    readonly cursor?: number;
    readonly outcomes?: readonly StepOutcome[];
    readonly observedEventIds?: readonly string[];
  },
): SessionRuntime {
  return Object.freeze({
    ...runtime,
    plan: runtime.plan,
    cursor: changes.cursor ?? runtime.cursor,
    outcomes: Object.freeze(changes.outcomes ?? runtime.outcomes),
    observedEventIds: Object.freeze(changes.observedEventIds ?? runtime.observedEventIds),
  });
}

function settle(runtime: SessionRuntime, index: number, outcome: StepOutcome): SessionRuntime {
  const step = runtime.plan.steps[index];
  if (step === undefined) return runtime;
  if (runtime.outcomes[index] !== 'pending') return runtime;

  const outcomes = runtime.outcomes.map((value, position) =>
    position === index ? outcome : value,
  );
  return withProgress(runtime, { cursor: index + 1, outcomes });
}

/**
 * Move past the current step without answering it.
 *
 * A skip is a real user action (REQ-SCH-05 lists skip/dwell among the signals a
 * session may adapt on) and it is recorded as one. It is also how the canvas and
 * closure steps complete: one visible experience may produce several
 * observations (REQ-UI-05), so no single observation can be the thing that ends
 * a reading — the learner leaving it is.
 */
export function advance(runtime: SessionRuntime): SessionRuntime {
  if (runtime.status !== 'open') return runtime;
  return settle(runtime, runtime.cursor, 'skipped');
}

/** Mark the current step answered without an event — used for canvas and closure. */
export function completeCurrentStep(runtime: SessionRuntime): SessionRuntime {
  if (runtime.status !== 'open') return runtime;
  return settle(runtime, runtime.cursor, 'answered');
}

/**
 * Fold one domain event into the session's progress.
 *
 * Total over the whole catalog and deliberately narrow: only a `ReviewGraded`
 * naming the current step's contract settles a step. Everything else — an
 * exposure from the canvas, a capture the learner made mid-session, a candidate,
 * an export — is recorded in `observedEventIds` if it is evidence-class and
 * changes nothing else.
 *
 * Note what is *not* consulted: whether the gate admitted the review. A learner
 * who answered has answered; whether it moved their schedule is a separate
 * question with a separate answer, and conflating them would make the progress
 * bar a claim about memory (REQ-SCH-06, REQ-LM-03).
 */
export function observe(runtime: SessionRuntime, event: DomainEvent): SessionRuntime {
  if (runtime.status !== 'open') return runtime;

  const recorded =
    event.type === 'ReviewGraded' ||
    event.type === 'ExposureLogged' ||
    event.type === 'ProductionObserved' ||
    event.type === 'LookupFrictionLogged'
      ? withProgress(runtime, {
          observedEventIds: [...runtime.observedEventIds, event.eventId],
        })
      : runtime;

  const step = currentStep(recorded);
  if (step === null) return recorded;
  if (event.type !== 'ReviewGraded') return recorded;
  if (step.contractId === null || step.contractId !== event.contractId) return recorded;

  return settle(recorded, recorded.cursor, 'answered');
}

export interface ClosedSession {
  readonly runtime: SessionRuntime;
  /** `null` when the session was already closed — closing twice mints nothing. */
  readonly event: SessionClosedEvent | null;
}

export interface CloseSessionOptions {
  readonly idempotencyKey: string;
}

/**
 * End the session and mint `SessionClosed`.
 *
 * The completion state is the caller's to declare because only the caller knows
 * which of the three happened: the learner finished (`completed`), left
 * (`abandoned`), or ran out of the time they had offered (`budget_exhausted`).
 * Inferring it from the cursor would turn "I stopped early because I was done
 * enough" into "abandoned", which is a claim about the learner that the learner
 * did not make.
 *
 * {@link resolveCompletionState} exists for callers that want the default
 * reading; it is a suggestion the caller may pass or ignore, not a rule applied
 * behind them.
 */
export function closeSession(
  context: DomainContext,
  runtime: SessionRuntime,
  completionState: SessionCompletionState,
  options: CloseSessionOptions,
): ClosedSession {
  if (runtime.status === 'closed') return { runtime, event: null };

  const event = createDomainEvent(
    context,
    'SessionClosed',
    { sessionId: runtime.sessionId, completionState },
    { idempotencyKey: options.idempotencyKey },
  );

  return {
    runtime: Object.freeze({
      ...runtime,
      plan: runtime.plan,
      status: 'closed' as const,
      completionState,
      closedAt: event.occurredAt,
    }),
    event,
  };
}

/**
 * The completion state a finished plan suggests.
 *
 * `completed` when every step that carried work was settled; `abandoned` when
 * the learner left work pending; `budget_exhausted` when the plan itself had no
 * room for work (a budget too small for anything but closure). The caller
 * decides whether to use it.
 *
 * ## Why the closure step is excluded (W5 P1-2)
 *
 * It used to ask whether *any* outcome was still `pending`, closure included —
 * and the closure step is the one whose only control is "Finish the session",
 * which dispatches `close`. So at the instant this function ran, the closure
 * step was always pending, `abandoned` was always the answer, and `completed`
 * was unreachable through the UI: 16 of 16 recorded sittings were stamped
 * `abandoned`, including every sitting the learner finished properly. That
 * reached the durable log as `SessionClosed.completionState`, so it was in the
 * export and the evidence inspector too, and it falsified the finite-session
 * promise (REQ-SCH-04 / T-13) at the surface the operator actually sees.
 *
 * Excluding closure is the honest reading rather than a convenient one: the
 * closure step carries no work to leave undone, and it is *settled by the act of
 * closing*. Asking whether the learner left work pending is the question this
 * function was always meant to answer. `abandoned` stays fully reachable —
 * closing while a real step is still pending still returns it, which is what the
 * companion test pins.
 *
 * This remains a suggestion. `closeSession` takes the state as a parameter, and
 * a caller that knows better — the learner said they were done, or the budget
 * ran out — passes its own.
 */
export function resolveCompletionState(runtime: SessionRuntime): SessionCompletionState {
  const workSteps = runtime.plan.steps.filter((step) => step.kind !== 'closure');
  if (workSteps.length === 0) return 'budget_exhausted';
  const pending = runtime.plan.steps.some(
    (step, index) => step.kind !== 'closure' && runtime.outcomes[index] === 'pending',
  );
  return pending ? 'abandoned' : 'completed';
}

export interface SessionProgress {
  readonly stepCount: number;
  readonly settledCount: number;
  readonly answeredCount: number;
  readonly skippedCount: number;
  readonly remainingCount: number;
  readonly estimatedMinutes: number;
  readonly remainingMinutes: number;
  /** True once every step has an outcome. The plan is finite, so this is reachable. */
  readonly planExhausted: boolean;
  readonly status: 'open' | 'closed';
  readonly completionState: SessionCompletionState | null;
}

/** Everything the session screen renders about "how far in am I". */
export function sessionProgress(runtime: SessionRuntime): SessionProgress {
  const answeredCount = runtime.outcomes.filter((outcome) => outcome === 'answered').length;
  const skippedCount = runtime.outcomes.filter((outcome) => outcome === 'skipped').length;
  const settledCount = answeredCount + skippedCount;
  const remainingMinutes = runtime.plan.steps
    .filter((step) => runtime.outcomes[step.index] === 'pending')
    .reduce((total, step) => total + step.costMinutes, 0);

  return {
    stepCount: runtime.plan.stepCount,
    settledCount,
    answeredCount,
    skippedCount,
    remainingCount: runtime.plan.stepCount - settledCount,
    estimatedMinutes: runtime.plan.estimatedMinutes,
    remainingMinutes,
    planExhausted: settledCount === runtime.plan.stepCount,
    status: runtime.status,
    completionState: runtime.completionState,
  };
}
