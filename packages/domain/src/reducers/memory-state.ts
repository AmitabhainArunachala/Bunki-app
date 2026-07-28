/**
 * `MemoryState` — derived FSRS scheduling state for one retrieval contract
 * (WP-06; REQ-DM-01, REQ-SCH-01, controller §6.3).
 *
 * This is the *only* place in the product that computes an interval. `ts-fsrs`
 * is imported here and nowhere else (lint-enforced, ADR-001 boundary 3), and it
 * is wrapped rather than exposed, for three reasons:
 *
 * **A version bump must be a migration, not a surprise.** Callers depend on
 * `MemoryState`, not on `Card`. Swapping the engine, or moving to FSRS-7,
 * changes this file and its golden fixture and nothing else — which is exactly
 * the "explicit, replay-tested migration" controller §6.3 asks for.
 *
 * **The kernel's wire form is a canonical ISO string, not a `Date`.**
 * `ts-fsrs` speaks `Date`; `@bunki/domain` speaks `IsoInstant` and is forbidden
 * from constructing a `Date` at all (the purity scan bans `new Date`, because a
 * zero-argument one reads the ambient clock). The conversion is one-directional
 * and total: ISO strings go in as `DateInput`, and the `Date` that comes back
 * is serialised with `toISOString()`, which emits exactly the canonical
 * fixed-width UTC form the rest of the kernel uses.
 *
 * **Only an admitted grade may enter.** The reducer takes an *effective* grade,
 * never a `ReviewGraded` event. Whether an observation counts, and what it
 * counts as, is the evidence gate's judgement (`src/evidence/`); a reducer that
 * accepted the raw event would be a second place where grading semantics live,
 * and the two would eventually disagree.
 */

import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Grade } from 'ts-fsrs';

import type { Grade as BunkiGrade } from '../events/shared.ts';
import type { ContractId, IsoInstant } from '../primitives.ts';
import {
  FSRS_ALGORITHM,
  FSRS_DESIRED_RETENTION,
  FSRS_ENABLE_FUZZ,
  FSRS_ENABLE_SHORT_TERM,
  FSRS_LEARNING_STEPS,
  FSRS_MAXIMUM_INTERVAL_DAYS,
  FSRS_PACKAGE,
  FSRS_PARAMETER_SET_ID,
  FSRS_PINNED_VERSION,
  FSRS_RELEARNING_STEPS,
  FSRS_STATE_PRECISION,
  FSRS_WEIGHTS,
} from './fsrs-pin.ts';

/**
 * The FSRS card phase, in this kernel's own vocabulary.
 *
 * Lower-case and JSON-native, matching every other enumerated value in the
 * derived state. `new` means activated and never reviewed.
 */
export const MEMORY_PHASES = ['new', 'learning', 'review', 'relearning'] as const;
export type MemoryPhase = (typeof MEMORY_PHASES)[number];

/** Which scheduler produced a state. Carried so two pins are never mixed. */
export interface SchedulerStamp {
  readonly package: string;
  readonly version: string;
  readonly algorithm: string;
  readonly parameterSetId: string;
}

export const SCHEDULER_STAMP: SchedulerStamp = Object.freeze({
  package: FSRS_PACKAGE,
  version: FSRS_PINNED_VERSION,
  algorithm: FSRS_ALGORITHM,
  parameterSetId: FSRS_PARAMETER_SET_ID,
});

export interface MemoryState {
  readonly contractId: ContractId;
  /**
   * Whether the owning thread's current promotion state still activates this
   * contract's skill (REQ-DM-09). A demotion sets this to `false` and keeps the
   * history: deleting the state on demotion would destroy the evidence that the
   * learner ever studied it.
   */
  readonly active: boolean;
  readonly phase: MemoryPhase;
  readonly stability: number;
  readonly difficulty: number;
  readonly dueAt: IsoInstant;
  readonly lastReviewedAt: IsoInstant | null;
  readonly scheduledDays: number;
  /** FSRS's index into the (re)learning step list. */
  readonly learningStep: number;
  readonly reps: number;
  readonly lapses: number;
  /** How many `ReviewGraded` events the gate admitted for this contract. */
  readonly admittedReviewCount: number;
  /** When promotion first activated this contract. */
  readonly activatedAt: IsoInstant;
  readonly scheduler: SchedulerStamp;
}

const PHASE_BY_FSRS_STATE: Readonly<Record<State, MemoryPhase>> = Object.freeze({
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
});

const FSRS_STATE_BY_PHASE: Readonly<Record<MemoryPhase, State>> = Object.freeze({
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
});

/** The four gradeable ratings. `Manual` is not one of them and never enters. */
const RATING_BY_GRADE: Readonly<Record<BunkiGrade, Grade>> = Object.freeze({
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
});

/**
 * Round to the pinned precision.
 *
 * Written out rather than taken from the library so the determinism guard does
 * not itself depend on a library default. `Number.parseFloat(x.toFixed(n))` is
 * used instead of the multiply/round/divide idiom because the latter
 * reintroduces a floating-point multiplication whose last bit is the very thing
 * being guarded against.
 */
function roundState(value: number): number {
  return Number.parseFloat(value.toFixed(FSRS_STATE_PRECISION));
}

const scheduler = fsrs(
  generatorParameters({
    request_retention: FSRS_DESIRED_RETENTION,
    maximum_interval: FSRS_MAXIMUM_INTERVAL_DAYS,
    w: [...FSRS_WEIGHTS],
    enable_fuzz: FSRS_ENABLE_FUZZ,
    enable_short_term: FSRS_ENABLE_SHORT_TERM,
    learning_steps: FSRS_LEARNING_STEPS as unknown as `${number}${'m' | 'h' | 'd'}`[],
    relearning_steps: FSRS_RELEARNING_STEPS as unknown as `${number}${'m' | 'h' | 'd'}`[],
  }),
);

/**
 * The state a contract has the moment promotion activates it.
 *
 * No FSRS call is made: an activated, never-reviewed contract is due now with
 * no stability and no difficulty, which is what `State.New` means. Calling the
 * scheduler here would invent a schedule out of an event that contains no
 * observation — capture and promotion are not evidence (DL-05, T-02).
 */
export function initialMemoryState(contractId: ContractId, activatedAt: IsoInstant): MemoryState {
  return Object.freeze({
    contractId,
    active: true,
    phase: 'new' as MemoryPhase,
    stability: 0,
    difficulty: 0,
    dueAt: activatedAt,
    lastReviewedAt: null,
    scheduledDays: 0,
    learningStep: 0,
    reps: 0,
    lapses: 0,
    admittedReviewCount: 0,
    activatedAt,
    scheduler: SCHEDULER_STAMP,
  });
}

/** Flip activation without touching scheduling history (promotion/demotion). */
export function setMemoryStateActive(state: MemoryState, active: boolean): MemoryState {
  if (state.active === active) return state;
  return Object.freeze({ ...state, active });
}

export interface AdmittedReview {
  readonly contractId: ContractId;
  /**
   * The grade the gate decided on — already reveal-corrected (T-06). The
   * reducer does not re-derive it and cannot second-guess it.
   */
  readonly effectiveGrade: BunkiGrade;
  readonly reviewedAt: IsoInstant;
}

/**
 * Fold one admitted review into a contract's memory state.
 *
 * Pure: same inputs, same output, no clock, no randomness (fuzz is pinned off).
 * The previous state is fed back in through its *rounded* values, so a last-bit
 * difference between two JavaScript engines cannot accumulate across a review
 * history — see `FSRS_STATE_PRECISION`.
 */
export function applyAdmittedReview(state: MemoryState, review: AdmittedReview): MemoryState {
  const card =
    state.phase === 'new' && state.reps === 0
      ? createEmptyCard(state.activatedAt)
      : {
          due: state.dueAt,
          stability: state.stability,
          difficulty: state.difficulty,
          // Deprecated in ts-fsrs and recomputed internally from `last_review`
          // and the review instant; passed as 0 so nothing here pretends to be
          // an authority on a field the library derives.
          elapsed_days: 0,
          scheduled_days: state.scheduledDays,
          learning_steps: state.learningStep,
          reps: state.reps,
          lapses: state.lapses,
          state: FSRS_STATE_BY_PHASE[state.phase],
          last_review: state.lastReviewedAt,
        };

  const next = scheduler.next(card, review.reviewedAt, RATING_BY_GRADE[review.effectiveGrade]).card;

  return Object.freeze({
    ...state,
    phase: PHASE_BY_FSRS_STATE[next.state],
    stability: roundState(next.stability),
    difficulty: roundState(next.difficulty),
    dueAt: next.due.toISOString(),
    lastReviewedAt: review.reviewedAt,
    scheduledDays: next.scheduled_days,
    learningStep: next.learning_steps,
    reps: next.reps,
    lapses: next.lapses,
    admittedReviewCount: state.admittedReviewCount + 1,
  });
}

/**
 * The memory-state reducer.
 *
 * `null` means "no state yet" — a contract nobody promoted has no schedule at
 * all, which is T-02's whole content. Activating is the caller's act
 * (`initialMemoryState`); this reducer refuses to conjure a state from a review
 * of an unactivated contract, because the gate would never have admitted one.
 */
export function memoryStateReducer(
  state: MemoryState | null,
  review: AdmittedReview,
): MemoryState | null {
  if (state === null) return null;
  return applyAdmittedReview(state, review);
}

/**
 * Retrievability: the pinned scheduler's own estimate of the probability that
 * this contract would be recalled at `at` (Campaign E / REQ-UI-07).
 *
 * ## Why this function is here and not in `src/graph/`
 *
 * REQ-UI-07 asks the map to draw brightness from *real* FSRS retrievability, so
 * the map needs R(t). R(t) is scheduler arithmetic — the same forgetting curve
 * `next()` uses internally to pick an interval — and REQ-SCH-01 says there is
 * one scheduler. `test/purity/no-ambient-nondeterminism.test.ts` pins that as a
 * list: `ts-fsrs` may be imported by `fsrs-pin.ts` and by this file, and by
 * nothing else in the kernel. A projection that re-derived the curve from
 * `FSRS_WEIGHTS` would be a second implementation of the scheduler's core
 * function, free to drift from it on the next pin bump, and every "honest
 * brightness" claim in the product would then rest on a copy.
 *
 * So the wrapper grows one read-only accessor. Nothing above it changes: no
 * existing export is touched, no state is written, and this function cannot
 * schedule anything — it takes a state and an instant and returns a number.
 *
 * ## `null` is not zero
 *
 * `ts-fsrs` answers `0` for a `State.New` card, which is arithmetically
 * defensible (no stability, no curve) and, rendered, is a lie: it draws a node
 * the learner has never been tested on identically to one they have completely
 * forgotten. Campaign E's map must keep those apart, so this returns `null` for
 * a state with no review behind it. "Unknown" and "fragile" are different
 * states; only `null` can carry the first one.
 *
 * Rounded to {@link FSRS_STATE_PRECISION} for the same reason stability is: the
 * curve is `Math.pow`, ECMAScript does not require that to be bit-identical
 * across engines, and a map whose colours differ between two runtimes would make
 * a screenshot non-reproducible.
 */
export function memoryStateRetrievability(state: MemoryState, at: IsoInstant): number | null {
  if (state.lastReviewedAt === null || state.reps === 0 || state.phase === 'new') return null;

  const card = {
    due: state.dueAt,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: 0,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningStep,
    reps: state.reps,
    lapses: state.lapses,
    state: FSRS_STATE_BY_PHASE[state.phase],
    last_review: state.lastReviewedAt,
  };

  return roundState(scheduler.get_retrievability(card, at, false));
}
