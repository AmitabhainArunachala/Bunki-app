/**
 * The journey as a state machine (Campaign E / A2; REQ-JRN-01/02/03).
 *
 * Four phases and no fifth: `diagnosing`, `in_branch`, `rejoined`, `left`.
 * Leaving is not a failure — the stumble simply stays, and the path stays
 * quietly available. There is deliberately no `abandoned` or `failed` phase,
 * because a learner who closes a branch has told you nothing about their
 * memory and a phase name that implied otherwise would be a judgement the
 * ledger cannot support.
 *
 * Every transition is a pure function from state to state. Illegal transitions
 * return the state unchanged rather than throwing: a double-tap on "enter"
 * should not take a session down, and a screen that re-submits after a reload
 * should be idempotent.
 */

import type { EventId, IsoInstant } from '../primitives.ts';
import type { BranchFamily } from './families.ts';
import { compileJourney, type CompiledJourney } from './compiler.ts';
import type { JourneyStumble } from './families.ts';
import type { ProbeAnswer } from './probes.ts';
import {
  evaluateRejoinCriterion,
  rejoinCriterion,
  type JourneyObservation,
  type JourneyRejoinDecision,
  type RejoinCriterion,
  type RejoinCriterionOptions,
} from './rejoin.ts';
import { recordUntakenBranches, type QuietOpportunity } from './opportunities.ts';

export const JOURNEY_PHASES = ['diagnosing', 'in_branch', 'rejoined', 'left'] as const;
export type JourneyPhase = (typeof JOURNEY_PHASES)[number];

export interface JourneyState {
  readonly compiled: CompiledJourney;
  readonly phase: JourneyPhase;
  readonly answers: readonly ProbeAnswer[];
  readonly chosen: BranchFamily | null;
  readonly enteredAt: IsoInstant | null;
  readonly criterion: RejoinCriterion;
  /**
   * The paths not taken. Quiet, decaying, capped, and — this is the part the
   * requirement cares about — read by nothing that schedules.
   */
  readonly untaken: readonly QuietOpportunity[];
  readonly rejoinedByEventIds: readonly EventId[];
  readonly rejoinedAt: IsoInstant | null;
}

/** Open a journey on a stumble. Compiles; selects nothing. */
export function openJourney(
  stumble: JourneyStumble,
  options: RejoinCriterionOptions = {},
): JourneyState {
  return Object.freeze({
    compiled: compileJourney(stumble),
    phase: 'diagnosing' as JourneyPhase,
    answers: Object.freeze([]),
    chosen: null,
    enteredAt: null,
    criterion: rejoinCriterion(stumble.contractId, options),
    untaken: Object.freeze([]),
    rejoinedByEventIds: Object.freeze([]),
    rejoinedAt: null,
  });
}

/**
 * Record a probe answer.
 *
 * Answers replace rather than accumulate per probe, so a learner who changes
 * their mind does not leave a contradictory pair in the tally. Answering after
 * a branch has been entered is a no-op: the routing question is over.
 */
export function answerProbe(state: JourneyState, answer: ProbeAnswer): JourneyState {
  if (state.phase !== 'diagnosing') return state;
  if (!state.compiled.probes.some((probe) => probe.id === answer.probeId)) return state;

  const answers = [
    ...state.answers.filter((existing) => existing.probeId !== answer.probeId),
    answer,
  ];
  return Object.freeze({ ...state, answers: Object.freeze(answers) });
}

/**
 * Enter a branch.
 *
 * Any *offered* family may be entered, whether or not the probes recommended
 * it — REQ-JRN-03's reversible default is "a choice between at most two paths
 * with a recommended default", and a compiler that refused the other choice
 * would have made the recommendation binding.
 *
 * Entering is what turns the other offered paths into quiet opportunities. They
 * are recorded here and read by nothing that schedules.
 */
export function enterJourneyBranch(
  state: JourneyState,
  family: BranchFamily,
  at: IsoInstant,
): JourneyState {
  if (state.phase !== 'diagnosing') return state;
  const offered = state.compiled.offered.find((option) => option.family === family);
  if (offered === undefined) return state;

  const untaken = state.compiled.offered
    .filter((option) => option.family !== family)
    .map<QuietOpportunity>((option) => ({
      family: option.family,
      hypothesis: option.hypothesis,
      threadId: state.compiled.stumble.threadId,
      contractId: state.compiled.stumble.contractId,
      openedAt: at,
      pinned: false,
    }));

  return Object.freeze({
    ...state,
    phase: 'in_branch' as JourneyPhase,
    chosen: family,
    enteredAt: at,
    untaken: recordUntakenBranches(state.untaken, untaken),
  });
}

/**
 * Leave without repairing.
 *
 * The path just left joins the quiet set alongside the ones never taken — the
 * learner may come back to it, and nothing will ask.
 */
export function leaveJourney(state: JourneyState, at: IsoInstant): JourneyState {
  if (state.phase === 'rejoined') return state;

  const left =
    state.chosen === null
      ? []
      : state.compiled.offered
          .filter((option) => option.family === state.chosen)
          .map<QuietOpportunity>((option) => ({
            family: option.family,
            hypothesis: option.hypothesis,
            threadId: state.compiled.stumble.threadId,
            contractId: state.compiled.stumble.contractId,
            openedAt: at,
            pinned: false,
          }));

  return Object.freeze({
    ...state,
    phase: 'left' as JourneyPhase,
    untaken: recordUntakenBranches(state.untaken, left),
  });
}

/** Evaluate the rejoin criterion against the ledger so far. */
export function evaluateJourneyRejoin(
  state: JourneyState,
  observations: readonly JourneyObservation[],
): JourneyRejoinDecision {
  if (state.phase === 'rejoined') {
    return {
      rejoined: false,
      reason: 'already_rejoined',
      detail: 'this branch has already rejoined; a second success does not re-close it',
      qualifyingSoFar: state.rejoinedByEventIds.length,
      required: state.criterion.requiredSuccesses,
    };
  }
  if (state.phase !== 'in_branch') {
    return {
      rejoined: false,
      reason: 'no_branch_entered',
      detail: 'no branch has been entered, so there is nothing to rejoin from',
      qualifyingSoFar: 0,
      required: state.criterion.requiredSuccesses,
    };
  }
  return evaluateRejoinCriterion(state.criterion, state.enteredAt, observations);
}

/** Apply a decision. A refusal leaves the state exactly as it was. */
export function applyJourneyRejoin(
  state: JourneyState,
  decision: JourneyRejoinDecision,
): JourneyState {
  if (!decision.rejoined) return state;
  return Object.freeze({
    ...state,
    phase: 'rejoined' as JourneyPhase,
    rejoinedByEventIds: decision.byEventIds,
    rejoinedAt: decision.at,
  });
}
