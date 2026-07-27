/**
 * The promotion state machine (WP-02; REQ-DM-09).
 */

import { describe, expect, it } from 'vitest';

import {
  INITIAL_PROMOTION_STATE,
  isLegalPromotionTransition,
  LEGAL_PROMOTION_TRANSITIONS,
  parseEvent,
  PROMOTION_STATES,
  promotionReducer,
  PromotionTransitionError,
  type PromotionState,
  type ThreadPromotionChangedEvent,
} from '../../src/index.ts';
import { AT, threadPromotionChanged } from '../support/events.ts';

const promotion = (
  from: PromotionState,
  to: string,
  origin = 'user',
): ThreadPromotionChangedEvent =>
  parseEvent(
    threadPromotionChanged({ eventId: 'e1', at: AT.t1, threadId: 'thread-1', from, to, origin }),
  ) as ThreadPromotionChangedEvent;

describe('the promotion ladder', () => {
  it('starts every thread in captured (REQ-DM-09)', () => {
    expect(INITIAL_PROMOTION_STATE).toBe('captured');
    expect(PROMOTION_STATES).toEqual(['captured', 'keep', 'learn', 'master']);
  });

  it.each([
    ['captured', 'keep'],
    ['captured', 'learn'],
    ['captured', 'master'],
  ] as const)('promotes %s -> %s', (from, to) => {
    expect(promotionReducer(from, promotion(from, to))).toBe(to);
  });

  it.each([
    ['master', 'learn'],
    ['learn', 'keep'],
    ['keep', 'captured'],
  ] as const)(
    'demotes %s -> %s, because a mistaken promotion must be undoable (DL-05)',
    (from, to) => {
      expect(promotionReducer(from, promotion(from, to))).toBe(to);
    },
  );

  it('accepts both origins, and both mean a human acted', () => {
    expect(promotionReducer('captured', promotion('captured', 'learn', 'user'))).toBe('learn');
    expect(
      promotionReducer('captured', promotion('captured', 'learn', 'nomination_accepted')),
    ).toBe('learn');
  });

  it('has no automatic origin for a future reducer to reach for', () => {
    expect(() =>
      parseEvent(
        threadPromotionChanged({
          eventId: 'e1',
          at: AT.t1,
          threadId: 'thread-1',
          from: 'captured',
          to: 'learn',
          origin: 'automatic',
        }),
      ),
    ).toThrow(/origin/);
  });

  it('covers every state pair in the transition table', () => {
    PROMOTION_STATES.forEach((from) => {
      const targets = LEGAL_PROMOTION_TRANSITIONS[from];
      expect([...targets].sort()).toEqual(
        PROMOTION_STATES.filter((state) => state !== from).sort(),
      );
      expect(isLegalPromotionTransition(from, from)).toBe(false);
    });
  });
});

describe('rejections', () => {
  it('rejects an event authored against a stale state (lost-update race)', () => {
    let thrown: unknown;
    try {
      // The learner already moved the thread to `learn`; this event was written
      // when it was still `captured`.
      promotionReducer('learn', promotion('captured', 'keep'));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PromotionTransitionError);
    const error = thrown as PromotionTransitionError;
    expect(error.code).toBe('ILLEGAL_PROMOTION_TRANSITION');
    expect(error.declaredFrom).toBe('captured');
    expect(error.actualFrom).toBe('learn');
    expect(error.to).toBe('keep');
    expect(error.threadId).toBe('thread-1');
  });

  it.each(PROMOTION_STATES)('rejects a no-op %s -> %s', (state) => {
    expect(() => promotionReducer(state, promotion(state, state))).toThrow(/must change the state/);
  });

  it('rejects a state outside the ladder', () => {
    expect(() =>
      parseEvent(
        threadPromotionChanged({
          eventId: 'e1',
          at: AT.t1,
          threadId: 'thread-1',
          from: 'captured',
          to: 'graduated',
        }),
      ),
    ).toThrow(/to/);
  });

  it('never returns the input unchanged as a way of ignoring an event', () => {
    PROMOTION_STATES.forEach((from) => {
      PROMOTION_STATES.forEach((to) => {
        if (from === to) return;
        expect(promotionReducer(from, promotion(from, to))).toBe(to);
      });
    });
  });
});
