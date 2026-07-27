/**
 * The session orchestrator — pure planner (WP-08; controller §6.4, REQ-SCH-04,
 * P0-CAP-11).
 *
 * ## What this file is, and what it deliberately is not
 *
 * REQ-SCH-04's first sentence is the whole design: *"The session orchestrator is
 * separate from the item scheduler."* Nothing here computes an interval, a
 * stability, or a due date. Those are FSRS's, they live in
 * `src/reducers/memory-state.ts`, and there is exactly one of them (REQ-SCH-01).
 * This module takes what the scheduler already decided — a list of contracts
 * that are due — and answers a different question: *given this much time, what
 * is a finite sitting made of, and where does it end?*
 *
 * ## The Phase-0 collapse
 *
 * REQ-SCH-04 names six parts (reactivation → precision → bounded expansion →
 * integration → transfer → closure). Controller §6.4 collapses them for Phase 0
 * to four:
 *
 *     reactivation/precision reviews → one bounded new item →
 *     one integration canvas visit → closure
 *
 * Transfer is not implemented and is not faked; it is recorded in
 * {@link SESSION_PHASE0_COLLAPSE} so the omission is data a verifier can read
 * rather than an absence they have to notice.
 *
 * ## Finiteness is structural, not a policy
 *
 * A plan is a value. It is computed once, from one input, and frozen. There is
 * no `addStep`, no queue, and no way to hand the planner a running session — so
 * "the plan cannot grow during the session" (T-13) is not enforced by a check
 * that could be forgotten; it is enforced by there being no function that could
 * do it. `runtime.ts` holds the plan by reference and only ever moves a cursor
 * along it.
 *
 * The budget is respected by *construction* rather than by truncation after the
 * fact: each step's cost is subtracted from the remaining budget before the step
 * is admitted, so a plan that exceeds its budget is unrepresentable. Whatever
 * did not fit is reported as a count (`deferredDueCount`) and never as a queue —
 * REQ-SCH-04's "never an unbounded due count" is about what the learner is shown
 * leading the screen, and §15.6's "no dishonest hiding" is why the number is
 * still reported at all.
 *
 * ## What the minute costs are, and are not
 *
 * {@link STEP_COST_MINUTES} is a *budgeting convention*, not a measurement. No
 * timing study produced it and none is claimed (REQ-GATE-03). It exists so the
 * plan is bounded by something the learner chose, and it is exported so a later
 * WP can replace it with measured values without hunting for a magic number.
 */

import type { SessionBudget } from '../events/shared.ts';
import type { ContractId, IsoInstant, ThreadId } from '../primitives.ts';
import { compareInstants } from '../primitives.ts';
import type { MemoryPhase } from '../reducers/memory-state.ts';
import { compareIds } from '../replay/derived-state.ts';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * One contract the item scheduler has already decided is due.
 *
 * Every field is *given*, never derived here. `phase` and `lapses` come from the
 * FSRS-derived `MemoryState`; the planner reads them to decide presentation
 * order, which REQ-SCH-05 explicitly permits ("may change presentation and
 * selection") and which is the only sense in which this module touches memory
 * state at all — it never writes one.
 */
export interface DueContract {
  readonly contractId: ContractId;
  readonly threadId: ThreadId;
  /**
   * What the learner will see named on the step. Supplied by the caller because
   * the display form of a target is a seed/UI fact, not a kernel one; the
   * planner never invents a label.
   */
  readonly label: string;
  readonly phase: MemoryPhase;
  readonly lapses: number;
  /** When the scheduler said this became due. Used only for ordering. */
  readonly dueSince: IsoInstant;
}

/** Exactly the four inputs controller §6.4 names. Nothing else enters. */
export interface SessionPlanInput {
  /** Minutes the learner offered. The plan never exceeds it. */
  readonly timeBudgetMin: number;
  readonly dueContracts: readonly DueContract[];
  /** How many never-reviewed items may be introduced. Phase 0 admits at most one. */
  readonly newBudget: number;
  /** The integration canvas to visit, or absent for a session without one. */
  readonly canvasId?: string | undefined;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * The four step kinds Phase 0 has, in sequence order.
 *
 * The array order is the order a session runs in, and
 * {@link comparePlanSequence} reads it rather than repeating it, so the sequence
 * is stated once.
 */
export const SESSION_STEP_KINDS = [
  'reactivation',
  'precision',
  'new',
  'canvas',
  'closure',
] as const;

export type SessionStepKind = (typeof SESSION_STEP_KINDS)[number];

/** Why a step is in the plan, in one sentence the session screen renders. */
export const SESSION_STEP_PURPOSE: Readonly<Record<SessionStepKind, string>> = Object.freeze({
  reactivation:
    'Reactivation — something you have missed before, brought back while it is still worth bringing back.',
  precision: 'Precision retrieval — a contract you are holding, checked exactly as it was written.',
  new: 'One new item — the whole of this sitting’s expansion, bounded on purpose.',
  canvas: 'Integration — the target read in a passage, in context, rather than on a card.',
  closure: 'Closure — the sitting ends here. Nothing is queued behind it.',
});

export interface SessionStep {
  /** Stable within a plan: position and kind, so two plans never share one. */
  readonly stepId: string;
  /** 0-based position. The runtime cursor is an index into this. */
  readonly index: number;
  readonly kind: SessionStepKind;
  /** The contract this step probes, or `null` for canvas and closure. */
  readonly contractId: ContractId | null;
  readonly threadId: ThreadId | null;
  /** For a canvas step, the canvas being visited. `null` otherwise. */
  readonly canvasId: string | null;
  readonly label: string;
  /** This step's share of the budget, per {@link STEP_COST_MINUTES}. */
  readonly costMinutes: number;
}

export interface SessionPlan {
  /** Bumped by an ADR-level change to the plan shape, never by a content change. */
  readonly planVersion: 1;
  /** The whole sitting, in order. Always ends with exactly one `closure`. */
  readonly steps: readonly SessionStep[];
  readonly stepCount: number;
  /** Sum of the steps' costs. Never greater than `budget.timeBudgetMin`. */
  readonly estimatedMinutes: number;
  readonly budget: SessionBudget;
  readonly canvasId: string | null;
  /**
   * Due contracts this plan did not take.
   *
   * A count, never a list and never a queue. The learner is entitled to know the
   * backlog exists (Codex §15.6: no dishonest hiding); they are not shown it as
   * the session's leading number, because a leading due count is exactly the
   * treadmill REQ-SCH-04 exists to end.
   */
  readonly deferredDueCount: number;
  /**
   * The visible recipe REQ-UI-05 asks for: the sequence of kinds, as text.
   *
   * Also the cheapest possible witness for T-13 — if a plan ever grew, this
   * string would change, and it is compared before and after every event in
   * `test/session/t13-plan-cannot-grow.test.ts`.
   */
  readonly recipe: string;
}

// ---------------------------------------------------------------------------
// Budgeting
// ---------------------------------------------------------------------------

/**
 * Minutes charged per step kind.
 *
 * A convention, not a measurement — see this file's header. Whole minutes keep
 * the arithmetic exact: fractional costs would accumulate floating-point error
 * across a long plan and make two runs of the same planner disagree in the last
 * bit, which is the one thing a deterministic kernel may not do.
 */
export const STEP_COST_MINUTES: Readonly<Record<SessionStepKind, number>> = Object.freeze({
  reactivation: 1,
  precision: 1,
  new: 2,
  canvas: 3,
  closure: 1,
});

/**
 * Phase 0 introduces at most one new item per sitting, whatever `newBudget`
 * says.
 *
 * Controller §6.4 is literal about this ("one bounded new item"). `newBudget`
 * can therefore only ever *lower* the number — a caller cannot widen the
 * expansion by passing a larger budget, which is the direction that would
 * matter.
 */
export const PHASE0_MAX_NEW_ITEMS = 1;

/** Phase 0 visits at most one integration canvas per sitting (controller §6.4). */
export const PHASE0_MAX_CANVAS_VISITS = 1;

/**
 * What the Phase-0 collapse dropped, recorded rather than silently missing.
 *
 * REQ-SCH-04 part (5), transfer — a changed context or a contrast — is not in
 * this planner. Implementing it would need contrast gating (REQ-JRN-04) and a
 * second context to transfer *to*, neither of which Phase 0 has, and a step that
 * looked like transfer while being a second review would misreport what the
 * learner did.
 */
export const SESSION_PHASE0_COLLAPSE = Object.freeze({
  implemented: Object.freeze([
    'REQ-SCH-04(1) reactivation of valuable fragile items',
    'REQ-SCH-04(2) precision retrieval',
    'REQ-SCH-04(3) bounded expansion — exactly one new item',
    'REQ-SCH-04(4) integration passage — exactly one canvas visit',
    'REQ-SCH-04(6) closure with a clear ending',
  ]),
  notImplemented: Object.freeze([
    'REQ-SCH-04(5) transfer (changed context or contrast) — needs REQ-JRN-04 contrast gating and a second context; a step that resembled transfer while being a second review would misreport what the learner did',
  ]),
  owner: 'post-Phase-0',
  anchors: Object.freeze(['controller §6.4', 'REQ-SCH-04', 'REQ-SCH-05', 'T-13']),
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Which of the two review parts a due contract belongs to.
 *
 * REQ-SCH-04 separates "reactivation of valuable **fragile** items" from
 * "precision retrieval". Fragility is read off the state FSRS already derived —
 * a contract in relearning, or one that has lapsed before — rather than
 * recomputed here, because recomputing it would be a second scheduler
 * (REQ-SCH-01). A never-reviewed contract is neither: it is the expansion slot.
 */
export function classifyDueContract(due: DueContract): 'reactivation' | 'precision' | 'new' {
  if (due.phase === 'new') return 'new';
  if (due.phase === 'relearning' || due.lapses > 0) return 'reactivation';
  return 'precision';
}

/**
 * Total order over due contracts: longest overdue first, then by contract id.
 *
 * The tiebreak is what makes the planner deterministic. Two contracts that came
 * due at the same instant must not be ordered by their arrival in an array,
 * because array order can differ between a live store and a replayed one, and
 * then two runs of "the same" session would produce different plans.
 */
export function compareDueContracts(left: DueContract, right: DueContract): -1 | 0 | 1 {
  const byInstant = compareInstants(left.dueSince, right.dueSince);
  if (byInstant !== 0) return byInstant;
  return compareIds(left.contractId, right.contractId);
}

/** Position of a kind in the running order. */
function sequenceRank(kind: SessionStepKind): number {
  return SESSION_STEP_KINDS.indexOf(kind);
}

/** Orders steps into the §6.4 running sequence. Exported for tests to reuse. */
export function comparePlanSequence(left: SessionStepKind, right: SessionStepKind): number {
  return sequenceRank(left) - sequenceRank(right);
}

// ---------------------------------------------------------------------------
// The planner
// ---------------------------------------------------------------------------

interface Draft {
  readonly kind: SessionStepKind;
  readonly contractId: ContractId | null;
  readonly threadId: ThreadId | null;
  readonly canvasId: string | null;
  readonly label: string;
}

/**
 * Compose a finite session.
 *
 * Pure and total: same input, same plan, on every runtime. It reads no clock —
 * "due" was decided before the input was built — and it never throws on an
 * awkward input. A time budget too small for anything still yields a valid plan
 * (closure alone), because a sitting that cannot fit a review is a real answer
 * and an exception is not.
 *
 * **Reservation order is not sequence order**, and the difference is a decision
 * worth stating. Steps *run* in the §6.4 order; they are *admitted* to the
 * budget in the order closure → canvas → new → reactivation → precision. So when
 * the budget is tight the reviews are what shrink, and the sitting keeps its
 * shape: it still ends, it still puts the target in context, and it still moves
 * one step forward. Admitting reviews first would let a large backlog eat the
 * integration visit and turn every short session back into a queue — which is
 * the failure REQ-SCH-04 was written against.
 */
export function planSession(input: SessionPlanInput): SessionPlan {
  const timeBudgetMin = Math.max(0, Math.trunc(input.timeBudgetMin));
  const newBudget = Math.max(0, Math.trunc(input.newBudget));
  const canvasId = input.canvasId ?? null;

  const drafts: Draft[] = [];
  let remaining = timeBudgetMin;

  const admit = (draft: Draft): boolean => {
    const cost = STEP_COST_MINUTES[draft.kind];
    if (cost > remaining) return false;
    remaining -= cost;
    drafts.push(draft);
    return true;
  };

  // 1. Closure. Every session ends (REQ-SCH-04); reserving it first is what
  //    makes the ending unconditional rather than "if there is time left".
  const closed = admit({
    kind: 'closure',
    contractId: null,
    threadId: null,
    canvasId: null,
    label: 'Finish',
  });

  // 2. The integration canvas — at most one, and only if one was named.
  if (canvasId !== null) {
    for (let visit = 0; visit < PHASE0_MAX_CANVAS_VISITS; visit += 1) {
      admit({
        kind: 'canvas',
        contractId: null,
        threadId: null,
        canvasId,
        label: canvasId,
      });
    }
  }

  const sorted = [...input.dueContracts].sort(compareDueContracts);
  const byPart = {
    reactivation: sorted.filter((due) => classifyDueContract(due) === 'reactivation'),
    precision: sorted.filter((due) => classifyDueContract(due) === 'precision'),
    new: sorted.filter((due) => classifyDueContract(due) === 'new'),
  } as const;

  const taken = new Set<ContractId>();
  const takeFrom = (part: readonly DueContract[], kind: SessionStepKind, limit: number): void => {
    let count = 0;
    for (const due of part) {
      if (count >= limit) return;
      const admitted = admit({
        kind,
        contractId: due.contractId,
        threadId: due.threadId,
        canvasId: null,
        label: due.label,
      });
      if (!admitted) return;
      taken.add(due.contractId);
      count += 1;
    }
  };

  // 3. Bounded expansion: `min(newBudget, 1)`, never more (controller §6.4).
  takeFrom(byPart.new, 'new', Math.min(newBudget, PHASE0_MAX_NEW_ITEMS));

  // 4. Reactivation before precision — REQ-SCH-04's own order. The limits are
  //    the part sizes; the budget is what actually stops the loops.
  takeFrom(byPart.reactivation, 'reactivation', byPart.reactivation.length);
  takeFrom(byPart.precision, 'precision', byPart.precision.length);

  const ordered = [...drafts].sort((left, right) => comparePlanSequence(left.kind, right.kind));

  const steps: readonly SessionStep[] = Object.freeze(
    ordered.map((draft, index) =>
      Object.freeze({
        stepId: `step-${String(index + 1).padStart(2, '0')}-${draft.kind}`,
        index,
        kind: draft.kind,
        contractId: draft.contractId,
        threadId: draft.threadId,
        canvasId: draft.canvasId,
        label: draft.label,
        costMinutes: STEP_COST_MINUTES[draft.kind],
      }),
    ),
  );

  const estimatedMinutes = steps.reduce((total, step) => total + step.costMinutes, 0);

  return Object.freeze({
    planVersion: 1 as const,
    steps,
    stepCount: steps.length,
    estimatedMinutes,
    budget: Object.freeze({ timeBudgetMin, newBudget }),
    canvasId: steps.some((step) => step.kind === 'canvas') ? canvasId : null,
    // Everything due that no step took. `closed` is read here only so that a
    // budget too small even for closure still reports its backlog honestly.
    deferredDueCount: input.dueContracts.filter((due) => !taken.has(due.contractId)).length,
    recipe: describeRecipe(steps, closed),
  });
}

/**
 * The recipe line.
 *
 * Groups consecutive kinds into counts (`2 precision`), because a learner
 * reading "what is in this sitting" wants the shape, not a list of twelve
 * identical words.
 */
function describeRecipe(steps: readonly SessionStep[], closed: boolean): string {
  if (steps.length === 0) return 'nothing fits this budget';
  const parts: string[] = [];
  for (const kind of SESSION_STEP_KINDS) {
    const count = steps.filter((step) => step.kind === kind).length;
    if (count === 0) continue;
    parts.push(count === 1 ? kind : `${String(count)} ${kind}`);
  }
  // A plan without closure is only reachable from a zero budget, and saying so
  // is better than printing a recipe that implies the sitting ends.
  return closed ? parts.join(' → ') : `${parts.join(' → ')} (no closure fits this budget)`;
}

// ---------------------------------------------------------------------------
// Building the input from derived state
// ---------------------------------------------------------------------------

/** The subset of replay's `DerivedState` the planner's input needs. */
export interface DueSelectionState {
  readonly memoryStates: readonly {
    readonly contractId: ContractId;
    readonly active: boolean;
    readonly phase: MemoryPhase;
    readonly lapses: number;
    readonly dueAt: IsoInstant;
  }[];
}

export interface DueSelectionOptions {
  /** The instant "due" is measured against. Injected; never read from a clock. */
  readonly asOf: IsoInstant;
  /** contractId → the thread it belongs to. */
  readonly threadByContract: ReadonlyMap<ContractId, ThreadId>;
  /** contractId → display label. Falls back to the contract id. */
  readonly labelByContract?: ReadonlyMap<ContractId, string> | undefined;
}

/**
 * Project replay's derived state into the planner's `dueContracts` input.
 *
 * Lives in the domain, not in the app, for the reason controller §5 gives:
 * `apps/app` holds no scheduling logic, and "which contracts are due" is a
 * scheduling question even though answering it here is only a comparison. An
 * inactive contract — one whose thread was demoted — is never due; its history
 * is kept (`MemoryState.active === false`) and it simply stops being offered.
 */
export function selectDueContracts(
  state: DueSelectionState,
  options: DueSelectionOptions,
): readonly DueContract[] {
  const due: DueContract[] = [];
  for (const memory of state.memoryStates) {
    if (!memory.active) continue;
    if (compareInstants(memory.dueAt, options.asOf) > 0) continue;
    const threadId = options.threadByContract.get(memory.contractId);
    if (threadId === undefined) continue;
    due.push({
      contractId: memory.contractId,
      threadId,
      label: options.labelByContract?.get(memory.contractId) ?? memory.contractId,
      phase: memory.phase,
      lapses: memory.lapses,
      dueSince: memory.dueAt,
    });
  }
  return due.sort(compareDueContracts);
}
