/**
 * Rejoin is declared by evidence, never by a step count (Campaign E / A2;
 * REQ-JRN-02).
 *
 * The strongest form of the claim is the one `session/repair.ts`'s own suite
 * uses and this file reproduces for the general criterion: drive a large number
 * of attempts through the branch and assert it is *still open*, then feed one
 * qualifying success and assert it closed. If any step count were hiding in
 * here, the first half would close the branch.
 */

import { describe, expect, it } from 'vitest';

import {
  applyJourneyRejoin,
  compileJourney,
  enterJourneyBranch,
  evaluateJourneyRejoin,
  evaluateRejoinCriterion,
  openJourney,
  qualifiesForRejoin,
  REJOIN_IS_NEVER_A_STEP_COUNT,
  rejoinCriterion,
  type JourneyObservation,
} from '../../src/index.ts';
import { at, CONTRACT_ID, observation, observed, stumble } from './support.ts';

function enteredJourney() {
  const opened = openJourney(stumble({ observed: observed({ priorStumbleCount: 1 }) }));
  const family = opened.compiled.offered[0]?.family;
  expect(family).toBeDefined();
  return enterJourneyBranch(opened, family!, at(10, 12));
}

describe('the criterion is about evidence', () => {
  it('states itself in words a learner can check before it fires', () => {
    const criterion = rejoinCriterion(CONTRACT_ID);
    expect(criterion.statement).toMatch(/on your own/i);
    expect(criterion.statement).toMatch(/no hint, no reveal/i);
    expect(criterion.statement).toMatch(/not after a number of steps/i);
    expect(REJOIN_IS_NEVER_A_STEP_COUNT).toMatch(/never on a step count/i);
  });

  it('names no step, screen, encounter, or minute anywhere in its shape', () => {
    const serialised = JSON.stringify(rejoinCriterion(CONTRACT_ID)).toLowerCase();
    ['stepcount', 'steps"', 'encounters', 'screens', 'minutes'].forEach((word) => {
      expect(serialised).not.toContain(word);
    });
  });

  it('defaults to one unaided admitted success on the contract that stumbled', () => {
    const criterion = rejoinCriterion(CONTRACT_ID);
    expect(criterion.contractIds).toEqual([CONTRACT_ID]);
    expect(criterion.requiredSuccesses).toBe(1);
    expect(criterion.requireUnaided).toBe(true);
    expect(criterion.requireAdmitted).toBe(true);
    expect(criterion.requireSeparateSessions).toBe(false);
  });

  it('cannot be built asking for fewer than one success', () => {
    expect(rejoinCriterion(CONTRACT_ID, { requiredSuccesses: 0 }).requiredSuccesses).toBe(1);
    expect(rejoinCriterion(CONTRACT_ID, { requiredSuccesses: -5 }).requiredSuccesses).toBe(1);
  });

  it('never drops the stumbled contract from an extended criterion', () => {
    const criterion = rejoinCriterion(CONTRACT_ID, {
      alsoAccepts: ['contract:other', CONTRACT_ID],
    });
    expect(criterion.contractIds).toEqual([CONTRACT_ID, 'contract:other']);
  });
});

describe('the clauses of "qualifying"', () => {
  const criterion = rejoinCriterion(CONTRACT_ID);
  const enteredAt = at(10, 12);

  it('accepts an unaided, admitted, successful, later observation', () => {
    expect(qualifiesForRejoin(criterion, enteredAt, observation())).toBe(true);
  });

  it('refuses a success on a different contract (T-05 in journey clothing)', () => {
    expect(
      qualifiesForRejoin(criterion, enteredAt, observation({ contractId: 'contract:other' })),
    ).toBe(false);
  });

  it('refuses an observation the gate did not admit', () => {
    expect(qualifiesForRejoin(criterion, enteredAt, observation({ admitted: false }))).toBe(false);
  });

  it('refuses a hinted or revealed success — that is a success of the hint', () => {
    expect(qualifiesForRejoin(criterion, enteredAt, observation({ hintsUsed: 1 }))).toBe(false);
    expect(
      qualifiesForRejoin(criterion, enteredAt, observation({ revealedBeforeRecall: true })),
    ).toBe(false);
  });

  it('refuses a miss and a hard pass-with-difficulty', () => {
    expect(qualifiesForRejoin(criterion, enteredAt, observation({ effectiveGrade: 'again' }))).toBe(
      false,
    );
    expect(qualifiesForRejoin(criterion, enteredAt, observation({ effectiveGrade: 'hard' }))).toBe(
      false,
    );
  });

  it('refuses evidence from before the branch was entered', () => {
    expect(qualifiesForRejoin(criterion, enteredAt, observation({ at: at(9) }))).toBe(false);
  });
});

describe('no number of attempts closes a branch', () => {
  it('stays open through fifty unaided-but-wrong attempts, then closes on one success', () => {
    const journey = enteredJourney();
    const misses: JourneyObservation[] = [];
    for (let index = 0; index < 50; index += 1) {
      misses.push(
        observation({
          eventId: `event:miss-${index}`,
          effectiveGrade: 'again',
          at: at(11 + index),
        }),
      );
    }

    const stillOpen = evaluateJourneyRejoin(journey, misses);
    expect(stillOpen.rejoined).toBe(false);
    if (!stillOpen.rejoined) {
      expect(stillOpen.reason).toBe('not_enough_qualifying_evidence');
      expect(stillOpen.qualifyingSoFar).toBe(0);
    }

    const closing = evaluateJourneyRejoin(journey, [
      ...misses,
      observation({ eventId: 'event:the-one', at: at(70) }),
    ]);
    expect(closing.rejoined).toBe(true);
    if (closing.rejoined) expect(closing.byEventIds).toEqual(['event:the-one']);
  });

  it('credits the earliest qualifying observation, not the latest', () => {
    const journey = enteredJourney();
    const decision = evaluateJourneyRejoin(journey, [
      observation({ eventId: 'event:first', at: at(12) }),
      observation({ eventId: 'event:second', at: at(13) }),
    ]);
    expect(decision.rejoined).toBe(true);
    if (decision.rejoined) expect(decision.byEventIds).toEqual(['event:first']);
  });

  it('does not depend on the order the observations were supplied', () => {
    const journey = enteredJourney();
    const observations = [
      observation({ eventId: 'a', effectiveGrade: 'again', at: at(12) }),
      observation({ eventId: 'b', at: at(13) }),
    ];
    expect(evaluateJourneyRejoin(journey, observations).rejoined).toBe(
      evaluateJourneyRejoin(journey, [...observations].reverse()).rejoined,
    );
  });
});

describe('the delayed variant asks for separate sittings, not more steps', () => {
  const criterion = rejoinCriterion(CONTRACT_ID, {
    requiredSuccesses: 2,
    requireSeparateSessions: true,
  });

  it('says so in its statement', () => {
    expect(criterion.statement).toMatch(/on different days/i);
    expect(criterion.statement).toMatch(/not after a number of steps/i);
  });

  it('refuses two successes inside one sitting, and names why', () => {
    const decision = evaluateRejoinCriterion(criterion, at(10, 12), [
      observation({ eventId: 'a', at: at(10, 13), sessionId: 'session:1' }),
      observation({ eventId: 'b', at: at(10, 14), sessionId: 'session:1' }),
    ]);
    expect(decision.rejoined).toBe(false);
    if (!decision.rejoined) {
      expect(decision.reason).toBe('successes_share_one_sitting');
      expect(decision.qualifyingSoFar).toBe(1);
      expect(decision.required).toBe(2);
    }
  });

  it('accepts two successes from two sittings', () => {
    const decision = evaluateRejoinCriterion(criterion, at(10, 12), [
      observation({ eventId: 'a', at: at(10, 13), sessionId: 'session:1' }),
      observation({ eventId: 'b', at: at(14), sessionId: 'session:2' }),
    ]);
    expect(decision.rejoined).toBe(true);
    if (decision.rejoined) {
      expect(decision.byEventIds).toEqual(['a', 'b']);
      expect(decision.at).toBe(at(14));
    }
  });
});

describe('the branch phases', () => {
  it('refuses to rejoin before a branch was entered', () => {
    const opened = openJourney(stumble());
    const decision = evaluateJourneyRejoin(opened, [observation()]);
    expect(decision.rejoined).toBe(false);
    if (!decision.rejoined) expect(decision.reason).toBe('no_branch_entered');
  });

  it('does not re-close an already-rejoined branch', () => {
    const journey = enteredJourney();
    const closed = applyJourneyRejoin(journey, evaluateJourneyRejoin(journey, [observation()]));
    expect(closed.phase).toBe('rejoined');

    const again = evaluateJourneyRejoin(closed, [observation({ eventId: 'event:another' })]);
    expect(again.rejoined).toBe(false);
    if (!again.rejoined) expect(again.reason).toBe('already_rejoined');
  });

  it('leaves the state untouched when a decision refuses', () => {
    const journey = enteredJourney();
    const refusal = evaluateJourneyRejoin(journey, []);
    expect(applyJourneyRejoin(journey, refusal)).toBe(journey);
  });

  it('records the events that closed it', () => {
    const journey = enteredJourney();
    const closed = applyJourneyRejoin(
      journey,
      evaluateJourneyRejoin(journey, [observation({ eventId: 'event:closer', at: at(20) })]),
    );
    expect(closed.rejoinedByEventIds).toEqual(['event:closer']);
    expect(closed.rejoinedAt).toBe(at(20));
  });
});

describe('the criterion is bound to the compiled journey', () => {
  it('names the contract that actually stumbled', () => {
    const compiled = compileJourney(stumble());
    const journey = openJourney(compiled.stumble);
    expect(journey.criterion.contractIds).toEqual([compiled.stumble.contractId]);
  });
});
