/**
 * What is still open, clause by clause (Campaign E, lane B5; REQ-JRN-02).
 *
 * REQ-JRN-02: *"Rejoin is declared by an **evidence criterion**, never an
 * arbitrary step count."* The domain already refuses to count steps. This module
 * exists for the other half of that sentence, which is a surface obligation
 * rather than a kernel one:
 *
 * > A rejoin the learner could not have predicted is indistinguishable from one
 * > the system invented.
 *
 * So the criterion is not only stated before it is met — it is **decomposed**,
 * so a learner can look at a review they just gave and see which clause of it
 * that review failed. "You got it right, but you had revealed the answer first,
 * so it was a success of the reveal" is a sentence the learner can argue with.
 * "Not yet" is not.
 *
 * ## The authority question, and how it is settled
 *
 * There are two ways to build this and only one is honest.
 *
 * The tempting one is to re-implement the predicate here, clause by clause, and
 * render the clauses. That produces a second definition of "qualifies", which
 * will drift, and the drift will be invisible because the surface would be
 * showing its own answer rather than the kernel's.
 *
 * So: **`@bunki/domain` decides, and this module only explains.** Every verdict
 * on this page comes from `evaluateRejoinCriterion` and `qualifiesForRejoin`.
 * The clause breakdown is presentation, and `test/journey-surface.test.ts`
 * asserts on generated ledgers that "every clause met" and
 * `qualifiesForRejoin` never disagree — so a drift is a failing test rather
 * than a wrong sentence on a screen.
 */

import {
  compareInstants,
  qualifiesForRejoin,
  type EventId,
  type IsoInstant,
  type JourneyObservation,
  type RejoinCriterion,
} from '@bunki/domain';

/** The clauses of the criterion, in the order the domain applies them. */
export const REJOIN_CLAUSE_IDS = [
  'on_the_named_contract',
  'admitted_by_the_gate',
  'a_success',
  'unaided',
  'after_the_branch_opened',
] as const;

export type RejoinClauseId = (typeof REJOIN_CLAUSE_IDS)[number];

export interface RejoinClause {
  readonly id: RejoinClauseId;
  /** What the clause asks, in the learner's words. */
  readonly asks: string;
  /** Why it is there, in one line. Never a rebuke. */
  readonly because: string;
}

/**
 * The five clauses, as copy.
 *
 * Every `because` explains a property of the *evidence*, never a property of
 * the learner. "A hinted success is a success of the hint" is a statement about
 * what was measured; "you needed help" would be a judgement, and the difference
 * is the whole of why this surface is allowed to exist.
 */
export const REJOIN_CLAUSES: readonly RejoinClause[] = Object.freeze([
  Object.freeze({
    id: 'on_the_named_contract' as const,
    asks: 'It has to be the thing that was missed.',
    because:
      'Getting a different question right about the same word would close a branch that was opened about something else.',
  }),
  Object.freeze({
    id: 'admitted_by_the_gate' as const,
    asks: 'It has to be evidence that counted.',
    because:
      'An answer the evidence gate refused did not move anything, so it cannot end anything either.',
  }),
  Object.freeze({
    id: 'a_success' as const,
    asks: 'It has to have come back — good or easy.',
    because: 'A branch is about a retrieval that did not happen. It ends when one does.',
  }),
  Object.freeze({
    id: 'unaided' as const,
    asks: 'No hint, and nothing revealed first.',
    because: 'A hinted or revealed success is a success of the hint.',
  }),
  Object.freeze({
    id: 'after_the_branch_opened' as const,
    asks: 'It has to have happened after you took this road.',
    because:
      'Evidence from before the repair is evidence about the state that caused the miss, not about the repair.',
  }),
]);

export function clauseOf(id: RejoinClauseId): RejoinClause {
  const found = REJOIN_CLAUSES.find((clause) => clause.id === id);
  if (found === undefined) throw new Error(`unknown rejoin clause '${id}'`);
  return found;
}

/** One observation, and which clauses it met. */
export interface ObservationVerdict {
  readonly eventId: EventId;
  readonly at: IsoInstant;
  /** `true` for each clause this observation satisfied. */
  readonly met: Readonly<Record<RejoinClauseId, boolean>>;
  /** The clauses it did not satisfy, in the order above. */
  readonly openClauses: readonly RejoinClauseId[];
  /**
   * The kernel's own answer. Not derived from `met` — see this module's header.
   */
  readonly qualifies: boolean;
}

/**
 * Judge one observation against the criterion, and record why.
 *
 * `qualifies` is `qualifiesForRejoin`'s answer, called directly. The `met` map
 * beside it is the explanation and carries no authority; where the two could
 * ever disagree the test suite fails rather than the screen lying.
 */
export function verdictFor(
  criterion: RejoinCriterion,
  enteredAt: IsoInstant,
  observation: JourneyObservation,
): ObservationVerdict {
  const met: Record<RejoinClauseId, boolean> = {
    on_the_named_contract: criterion.contractIds.includes(observation.contractId),
    admitted_by_the_gate: observation.admitted,
    a_success: observation.effectiveGrade === 'good' || observation.effectiveGrade === 'easy',
    unaided: observation.hintsUsed === 0 && !observation.revealedBeforeRecall,
    after_the_branch_opened: compareInstants(observation.at, enteredAt) >= 0,
  };

  return Object.freeze({
    eventId: observation.eventId,
    at: observation.at,
    met: Object.freeze(met),
    openClauses: Object.freeze(REJOIN_CLAUSE_IDS.filter((id) => !met[id])),
    qualifies: qualifiesForRejoin(criterion, enteredAt, observation),
  });
}

export interface OpenCondition {
  /** The criterion's own sentence, verbatim from the domain. */
  readonly statement: string;
  readonly required: number;
  readonly qualifyingSoFar: number;
  /** How many more qualifying observations the criterion still wants. */
  readonly stillNeeded: number;
  /** The clauses, always all five, so the condition is legible before it is met. */
  readonly clauses: readonly RejoinClause[];
  /**
   * Every observation offered to the criterion since the branch opened, newest
   * first, with the clauses each one missed.
   *
   * Includes the ones that did not qualify. That is the point: "why did that
   * not count" is the question a learner asks, and a list of only the successes
   * cannot answer it (REQ-UI-06's reasoning, one level up).
   */
  readonly considered: readonly ObservationVerdict[];
  /**
   * `true` once the branch could rejoin. The kernel's arithmetic, not this
   * module's: it is `qualifyingSoFar >= required` over verdicts the kernel gave.
   */
  readonly satisfied: boolean;
}

/**
 * Project the criterion and the ledger into one legible open condition.
 *
 * `enteredAt` being `null` — no branch entered yet — is a real state and not an
 * error: the condition is shown *before* the fork is taken, because a learner
 * choosing a road is owed the terms on which it ends.
 */
export function openConditionFor(
  criterion: RejoinCriterion,
  enteredAt: IsoInstant | null,
  observations: readonly JourneyObservation[],
): OpenCondition {
  if (enteredAt === null) {
    return Object.freeze({
      statement: criterion.statement,
      required: criterion.requiredSuccesses,
      qualifyingSoFar: 0,
      stillNeeded: criterion.requiredSuccesses,
      clauses: REJOIN_CLAUSES,
      considered: Object.freeze([]),
      satisfied: false,
    });
  }

  const considered = observations
    .filter((observation) => criterion.contractIds.includes(observation.contractId))
    .map((observation) => verdictFor(criterion, enteredAt, observation));

  const qualifyingSoFar = considered.filter((verdict) => verdict.qualifies).length;

  return Object.freeze({
    statement: criterion.statement,
    required: criterion.requiredSuccesses,
    qualifyingSoFar,
    stillNeeded: Math.max(0, criterion.requiredSuccesses - qualifyingSoFar),
    clauses: REJOIN_CLAUSES,
    considered: Object.freeze([...considered].reverse()),
    satisfied: qualifyingSoFar >= criterion.requiredSuccesses,
  });
}

/**
 * The sentence under the condition, built from counts.
 *
 * Deliberately not encouraging. "One more to go" is a nudge; "one unaided
 * success on this contract will end it" is the criterion restated at the size
 * the learner needs it.
 */
export function stillOpenLine(condition: OpenCondition): string {
  if (condition.satisfied) {
    return 'This road has done what it was opened to do. The evidence that closed it is named below.';
  }
  if (condition.considered.length === 0) {
    return 'Nothing has been offered to this condition yet.';
  }
  const missed = condition.considered.filter((verdict) => !verdict.qualifies).length;
  const offered = condition.considered.length;
  return `${String(offered)} answer${offered === 1 ? '' : 's'} offered so far; ${String(missed)} did not meet every clause. The condition is unchanged.`;
}
