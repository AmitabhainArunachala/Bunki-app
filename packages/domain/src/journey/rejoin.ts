/**
 * The rejoin criterion (Campaign E / A2; REQ-JRN-02).
 *
 * REQ-JRN-02: *"Rejoin is declared by an **evidence criterion**, never an
 * arbitrary step count."*
 *
 * Nothing in this file counts steps, screens, minutes, or encounters. It counts
 * *qualifying observations*, which is a different thing and is what the
 * requirement asks for: a branch ends because the evidence says the thing is
 * repaired, not because the learner has done enough of it.
 *
 * ## What "qualifying" means, and why each clause is there
 *
 * A qualifying observation is one that is
 *
 *   - **on a contract the criterion names** — repairing the reading and
 *     rejoining on a meaning probe would declare a repair of something that was
 *     never broken (this is `session/repair.ts`'s rule, generalised from one
 *     contract to a named set);
 *   - **admitted by the gate** — so a review on a demoted or tombstoned thread
 *     cannot quietly end a branch;
 *   - **a success** — `good` or `easy`;
 *   - **unaided** — a hinted or revealed success is a success of the hint;
 *   - **after the branch was entered** — evidence from before the repair is
 *     evidence about the state that caused the stumble.
 *
 * and, when the criterion asks for it, **separated across sittings**. That last
 * option is the one place a delay enters, and it is still not a step count: the
 * requirement is "on two different occasions", which is a property of the
 * evidence, not of how much work was done in between.
 */

import { compareInstants } from '../primitives.ts';
import type { ContractId, EventId, IsoInstant, SessionId } from '../primitives.ts';
import type { Grade } from '../events/shared.ts';

/**
 * The criterion, as data a screen can render before the branch ends.
 *
 * A rejoin the learner could not have predicted is indistinguishable from one
 * the system invented, so `statement` is written for display and the fields
 * above it are what the evaluator actually reads. The two are built together in
 * {@link rejoinCriterion} so they cannot drift.
 */
export interface RejoinCriterion {
  /** The contracts whose evidence can close this branch. Never empty. */
  readonly contractIds: readonly ContractId[];
  /** How many qualifying observations are needed. Evidence, not steps. */
  readonly requiredSuccesses: number;
  readonly requireUnaided: true;
  readonly requireAdmitted: true;
  /** When true, the successes must come from different sittings. */
  readonly requireSeparateSessions: boolean;
  readonly statement: string;
}

export interface RejoinCriterionOptions {
  readonly requiredSuccesses?: number;
  readonly requireSeparateSessions?: boolean;
  /** Contracts beyond the stumbled one whose success also counts. */
  readonly alsoAccepts?: readonly ContractId[];
}

/**
 * Build the criterion for a stumbled contract.
 *
 * The default is one unaided admitted success on the contract that stumbled —
 * the same criterion Phase 0 hard-coded, which is deliberate: generalising the
 * compiler should not quietly make repairs harder or easier to declare.
 */
export function rejoinCriterion(
  stumbledContractId: ContractId,
  options: RejoinCriterionOptions = {},
): RejoinCriterion {
  const requiredSuccesses = Math.max(1, options.requiredSuccesses ?? 1);
  const requireSeparateSessions = options.requireSeparateSessions ?? false;
  const contractIds = Object.freeze([
    stumbledContractId,
    ...(options.alsoAccepts ?? []).filter((id) => id !== stumbledContractId),
  ]);

  const successWord = requiredSuccesses === 1 ? 'once' : `${requiredSuccesses} times`;
  const sittings = requireSeparateSessions ? ', on different days' : '';

  return Object.freeze({
    contractIds,
    requiredSuccesses,
    requireUnaided: true,
    requireAdmitted: true,
    requireSeparateSessions,
    statement: `This branch ends when you get ${contractIds.length === 1 ? 'the same contract' : 'one of the named contracts'} right on your own — no hint, no reveal — ${successWord}${sittings}. Not after a number of steps.`,
  });
}

/** REQ-JRN-02's sentence, kept where the code that honours it lives. */
export const REJOIN_IS_NEVER_A_STEP_COUNT =
  'A branch ends on evidence, never on a step count. Doing more of the branch does not end it; getting the thing right unaided does.';

/**
 * One observation offered to the criterion, with the gate's verdict attached.
 *
 * `admitted` is the gate's word, carried rather than re-derived — this module
 * has no opinion about what counts as evidence and must not acquire one
 * (REQ-ARCH-04).
 */
export interface JourneyObservation {
  readonly eventId: EventId;
  readonly contractId: ContractId;
  /** The grade the gate admitted — already reveal-corrected (T-06). */
  readonly effectiveGrade: Grade;
  readonly admitted: boolean;
  readonly hintsUsed: number;
  readonly revealedBeforeRecall: boolean;
  /** Which sitting it happened in; `null` when it happened outside one. */
  readonly sessionId: SessionId | null;
  readonly at: IsoInstant;
}

/** Does one observation qualify, given when the branch was entered? */
export function qualifiesForRejoin(
  criterion: RejoinCriterion,
  enteredAt: IsoInstant,
  observation: JourneyObservation,
): boolean {
  if (!criterion.contractIds.includes(observation.contractId)) return false;
  if (!observation.admitted) return false;
  if (observation.effectiveGrade !== 'good' && observation.effectiveGrade !== 'easy') return false;
  if (observation.hintsUsed > 0) return false;
  if (observation.revealedBeforeRecall) return false;
  return compareInstants(observation.at, enteredAt) >= 0;
}

export const JOURNEY_REJOIN_REFUSAL_REASONS = [
  'no_branch_entered',
  'already_rejoined',
  'not_enough_qualifying_evidence',
  'successes_share_one_sitting',
] as const;

export type JourneyRejoinRefusalReason = (typeof JOURNEY_REJOIN_REFUSAL_REASONS)[number];

export type JourneyRejoinDecision =
  | {
      readonly rejoined: true;
      /** Every observation credited, in the order supplied. */
      readonly byEventIds: readonly EventId[];
      /** The instant the last credited observation happened. */
      readonly at: IsoInstant;
    }
  | {
      readonly rejoined: false;
      readonly reason: JourneyRejoinRefusalReason;
      readonly detail: string;
      readonly qualifyingSoFar: number;
      readonly required: number;
    };

/**
 * Evaluate a criterion against everything observed so far.
 *
 * Takes the whole observation set rather than one event, so the answer is a
 * property of the evidence and not of the order a caller happened to walk it.
 * The *earliest* qualifying observations are credited, so a caller passing the
 * ledger in log order gets the earliest repair rather than the latest.
 */
export function evaluateRejoinCriterion(
  criterion: RejoinCriterion,
  enteredAt: IsoInstant | null,
  observations: readonly JourneyObservation[],
): JourneyRejoinDecision {
  if (enteredAt === null) {
    return {
      rejoined: false,
      reason: 'no_branch_entered',
      detail: 'no branch has been entered, so there is nothing to rejoin from',
      qualifyingSoFar: 0,
      required: criterion.requiredSuccesses,
    };
  }

  const qualifying = observations.filter((observation) =>
    qualifiesForRejoin(criterion, enteredAt, observation),
  );

  if (criterion.requireSeparateSessions) {
    const credited: JourneyObservation[] = [];
    const usedSessions = new Set<string>();
    qualifying.forEach((observation) => {
      const sitting = observation.sessionId ?? `unsessioned:${observation.eventId}`;
      if (usedSessions.has(sitting)) return;
      usedSessions.add(sitting);
      credited.push(observation);
    });

    if (credited.length < criterion.requiredSuccesses) {
      return {
        rejoined: false,
        reason:
          qualifying.length >= criterion.requiredSuccesses
            ? 'successes_share_one_sitting'
            : 'not_enough_qualifying_evidence',
        detail: criterion.statement,
        qualifyingSoFar: credited.length,
        required: criterion.requiredSuccesses,
      };
    }
    return creditedDecision(credited.slice(0, criterion.requiredSuccesses));
  }

  if (qualifying.length < criterion.requiredSuccesses) {
    return {
      rejoined: false,
      reason: 'not_enough_qualifying_evidence',
      detail: criterion.statement,
      qualifyingSoFar: qualifying.length,
      required: criterion.requiredSuccesses,
    };
  }

  return creditedDecision(qualifying.slice(0, criterion.requiredSuccesses));
}

function creditedDecision(credited: readonly JourneyObservation[]): JourneyRejoinDecision {
  const last = credited[credited.length - 1];
  return {
    rejoined: true,
    byEventIds: Object.freeze(credited.map((observation) => observation.eventId)),
    // Non-null: `credited` is only ever built from a list long enough to satisfy
    // a criterion whose `requiredSuccesses` is at least one.
    at: (last as JourneyObservation).at,
  };
}
