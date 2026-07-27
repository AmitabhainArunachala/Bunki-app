/**
 * **T-02 — Capture does not activate FSRS until explicit promotion.**
 *
 * Controller §17.1, REQ-DM-09, DL-05. The claim being tested is the difference
 * between this product and a flashcard app: saving something you met is not a
 * promise to review it. A capture that quietly created a card would rebuild the
 * review-debt treadmill the whole design exists to avoid.
 *
 * The assertion is made at two levels, because either alone would be weak:
 * that no `MemoryState` exists (nothing was scheduled), and that a review
 * arriving anyway is *refused by name* (nothing could be scheduled). A system
 * that merely happened not to schedule would pass the first.
 */

import { describe, expect, it } from 'vitest';

import { PROMOTION_ACTIVE_STATES, SKILLS_ACTIVATED_BY_PROMOTION } from '../../src/index.ts';
import {
  T,
  capture,
  decisionOf,
  learnableLog,
  meaningContract,
  memoryStateOf,
  promote,
  review,
  run,
} from '../support/wp06.ts';

describe('T-02: capture does not activate FSRS until explicit promotion', () => {
  it('a captured thread schedules nothing, even with a contract on it', () => {
    const state = run([capture(), meaningContract()]);

    expect(state.threads[0]?.promotion).toBe('captured');
    expect(state.contracts).toHaveLength(1);
    expect(state.memoryStates).toEqual([]);
  });

  it('a review of a contract on a captured thread is refused, not silently dropped', () => {
    const state = run([
      capture(),
      meaningContract(),
      review({ eventId: 'ev-review', at: T.review1, contractId: 'contract-meaning' }),
    ]);

    // The observation is in the ledger: it happened.
    expect(state.observations.map((observation) => observation.eventId)).toContain('ev-review');
    // With a named verdict: it did not count, and here is why.
    expect(decisionOf(state, 'ev-review')).toMatchObject({
      admitted: false,
      reason: 'thread_not_promotion_active',
    });
    expect(state.memoryStates).toEqual([]);
  });

  it('promotion to keep still schedules nothing — keep carries no mandatory SRS (REQ-DM-09.1)', () => {
    const state = run([
      capture(),
      promote('keep'),
      meaningContract(),
      review({ eventId: 'ev-review', at: T.review1, contractId: 'contract-meaning' }),
    ]);

    expect(state.threads[0]?.promotion).toBe('keep');
    expect(state.memoryStates).toEqual([]);
    expect(decisionOf(state, 'ev-review')?.reason).toBe('thread_not_promotion_active');
  });

  it('promotion to learn activates the contract — due immediately, never reviewed', () => {
    const state = run(learnableLog());

    const memory = memoryStateOf(state, 'contract-meaning');
    expect(memory).toBeDefined();
    expect(memory?.active).toBe(true);
    expect(memory?.phase).toBe('new');
    expect(memory?.reps).toBe(0);
    expect(memory?.admittedReviewCount).toBe(0);
    expect(memory?.stability).toBe(0);
    // Activation happens when both halves are true, which here is when the
    // contract arrives on the already-promoted thread. Activation is not a
    // review: the due date is that moment, and no FSRS interval has been
    // computed for it yet.
    expect(memory?.activatedAt).toBe(T.contract);
    expect(memory?.dueAt).toBe(T.contract);
    expect(memory?.lastReviewedAt).toBeNull();
  });

  it('activation is the later of the two halves, in either order', () => {
    const contractFirst = run([
      capture(),
      meaningContract({ occurredAt: T.contract }),
      promote('learn', { at: T.review1 }),
    ]);
    expect(memoryStateOf(contractFirst, 'contract-meaning')?.activatedAt).toBe(T.review1);

    const promotionFirst = run([capture(), promote('learn'), meaningContract()]);
    expect(memoryStateOf(promotionFirst, 'contract-meaning')?.activatedAt).toBe(T.contract);
  });

  it('and only then does a review reach the scheduler', () => {
    const state = run([
      ...learnableLog(),
      review({ eventId: 'ev-review', at: T.review1, contractId: 'contract-meaning' }),
    ]);

    expect(decisionOf(state, 'ev-review')?.admitted).toBe(true);
    expect(memoryStateOf(state, 'contract-meaning')?.admittedReviewCount).toBe(1);
    expect(memoryStateOf(state, 'contract-meaning')?.lastReviewedAt).toBe(T.review1);
  });

  it('exactly two rungs of the ladder activate anything', () => {
    expect(PROMOTION_ACTIVE_STATES).toEqual(['learn', 'master']);
    expect(SKILLS_ACTIVATED_BY_PROMOTION.captured).toEqual([]);
    expect(SKILLS_ACTIVATED_BY_PROMOTION.keep).toEqual([]);
  });

  it('demotion deactivates without destroying the review history', () => {
    const state = run([
      ...learnableLog(),
      review({ eventId: 'ev-review', at: T.review1, contractId: 'contract-meaning' }),
      promote('keep', { eventId: 'ev-demote', at: T.review2, from: 'learn' }),
    ]);

    const memory = memoryStateOf(state, 'contract-meaning');
    expect(memory?.active).toBe(false);
    // The schedule the learner earned is still there; it is simply not due.
    expect(memory?.admittedReviewCount).toBe(1);
    expect(memory?.reps).toBe(1);
  });
});
