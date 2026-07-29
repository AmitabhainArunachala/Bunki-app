/**
 * The MemoryState reducer (WP-06; REQ-SCH-01, controller §6.3).
 *
 * The wrapper around `ts-fsrs` has three jobs and this suite is one group per
 * job: keep the kernel's wire form (canonical ISO strings, JSON-representable
 * state), stay pure and deterministic so replay means something, and refuse to
 * schedule anything the gate did not admit.
 */

import { describe, expect, it } from 'vitest';

import {
  FSRS_STATE_PRECISION,
  SCHEDULER_STAMP,
  applyAdmittedReview,
  compareInstants,
  initialMemoryState,
  isValidIsoInstant,
  memoryStateReducer,
  setMemoryStateActive,
  type MemoryState,
} from '../../src/index.ts';
import { T } from '../support/wp06.ts';

const fresh = (): MemoryState => initialMemoryState('contract-1', T.promote);

const grade = (
  state: MemoryState,
  effectiveGrade: 'again' | 'hard' | 'good' | 'easy',
  at: string,
) =>
  applyAdmittedReview(state, {
    contractId: 'contract-1',
    effectiveGrade,
    reviewedAt: at,
  });

describe('an activated contract starts with a schedule and no history', () => {
  it('is due at activation, never reviewed, and carries the pin', () => {
    const state = fresh();
    expect(state).toMatchObject({
      contractId: 'contract-1',
      active: true,
      phase: 'new',
      stability: 0,
      difficulty: 0,
      dueAt: T.promote,
      lastReviewedAt: null,
      schedulerAnchorAt: T.promote,
      reps: 0,
      lapses: 0,
      admittedReviewCount: 0,
      activatedAt: T.promote,
      scheduler: SCHEDULER_STAMP,
    });
  });

  it('is frozen, so a consumer cannot edit a schedule after the fact', () => {
    expect(Object.isFrozen(fresh())).toBe(true);
  });

  it('flips activation without touching anything else', () => {
    const reviewed = grade(fresh(), 'good', T.review1);
    const deactivated = setMemoryStateActive(reviewed, false);
    expect(deactivated.active).toBe(false);
    expect({ ...deactivated, active: true }).toEqual(reviewed);
    // Same value in, same object out — no needless churn in derived state.
    expect(setMemoryStateActive(reviewed, true)).toBe(reviewed);
  });
});

describe('grading moves the schedule', () => {
  it('advances reps and records the review instant', () => {
    const state = grade(fresh(), 'good', T.review1);
    expect(state.reps).toBe(1);
    expect(state.admittedReviewCount).toBe(1);
    expect(state.lastReviewedAt).toBe(T.review1);
    expect(state.phase).not.toBe('new');
  });

  it('emits a canonical ISO instant for the due date, never a Date', () => {
    const state = grade(fresh(), 'good', T.review1);
    expect(typeof state.dueAt).toBe('string');
    expect(isValidIsoInstant(state.dueAt)).toBe(true);
    expect(compareInstants(state.dueAt, state.lastReviewedAt ?? '')).toBe(1);
  });

  it('contains a first review dated before activation without rewriting its evidence time', () => {
    const actualAt = '2026-07-26T23:59:00.000Z';
    const skewed = grade(fresh(), 'good', actualAt);
    const control = grade(fresh(), 'good', T.promote);

    expect(skewed.lastReviewedAt).toBe(actualAt);
    expect(skewed.schedulerAnchorAt).toBe(T.promote);
    expect({ ...skewed, lastReviewedAt: T.promote }).toEqual(control);
    expect(compareInstants(skewed.dueAt, skewed.schedulerAnchorAt)).toBeGreaterThanOrEqual(0);
  });

  it('contains repeated backward reviews with one nondecreasing scheduler clock', () => {
    const first = grade(fresh(), 'good', T.review1);
    const actualAt = '2026-07-26T23:59:00.000Z';
    const skewed = grade(first, 'good', actualAt);
    const sameInstantControl = grade(first, 'good', T.review1);

    expect(skewed.lastReviewedAt).toBe(actualAt);
    expect(skewed.schedulerAnchorAt).toBe(T.review1);
    expect({ ...skewed, lastReviewedAt: T.review1 }).toEqual(sameInstantControl);

    let descending = skewed;
    for (const at of [
      '2026-07-25T23:59:00.000Z',
      '2025-07-25T23:59:00.000Z',
      '1999-01-01T00:00:00.000Z',
    ]) {
      const priorAnchor = descending.schedulerAnchorAt;
      descending = grade(descending, 'hard', at);
      expect(descending.lastReviewedAt).toBe(at);
      expect(compareInstants(descending.schedulerAnchorAt, priorAnchor)).toBeGreaterThanOrEqual(0);
      expect(
        compareInstants(descending.dueAt, descending.schedulerAnchorAt),
      ).toBeGreaterThanOrEqual(0);
    }

    expect(descending.schedulerAnchorAt).toBe(T.review1);
    expect(descending.admittedReviewCount).toBe(5);
  });

  it('advances the scheduler anchor only after wall time catches up', () => {
    const first = grade(fresh(), 'good', T.review1);
    const backward = grade(first, 'good', '2026-07-26T23:59:00.000Z');
    const belowAnchor = grade(backward, 'good', '2026-07-27T00:03:00.000Z');
    const atAnchor = grade(belowAnchor, 'good', T.review1);
    const ahead = grade(atAnchor, 'good', T.review2);

    expect(backward.schedulerAnchorAt).toBe(T.review1);
    expect(belowAnchor.schedulerAnchorAt).toBe(T.review1);
    expect(atAnchor.schedulerAnchorAt).toBe(T.review1);
    expect(ahead.schedulerAnchorAt).toBe(T.review2);
  });

  it('counts a lapse when a review comes back again', () => {
    let state = grade(fresh(), 'good', T.review1);
    state = grade(state, 'good', T.review2);
    const lapsed = grade(state, 'again', T.review4);
    expect(lapsed.lapses).toBeGreaterThan(state.lapses);
  });

  it('orders the four grades: harder grades do not schedule further out', () => {
    const start = grade(grade(fresh(), 'good', T.review1), 'good', T.review2);
    const outcomes = (['again', 'hard', 'good', 'easy'] as const).map(
      (value) => grade(start, value, T.review3).dueAt,
    );

    for (let index = 1; index < outcomes.length; index += 1) {
      const previous = outcomes[index - 1] ?? '';
      const current = outcomes[index] ?? '';
      expect(compareInstants(current, previous)).toBeGreaterThanOrEqual(0);
    }
  });

  it('produces only JSON-representable values', () => {
    const state = grade(grade(fresh(), 'good', T.review1), 'hard', T.review2);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    expect(Object.values(state).some((value) => value === undefined)).toBe(false);
  });
});

describe('determinism', () => {
  it('is a pure function of its arguments', () => {
    const first = grade(fresh(), 'good', T.review1);
    const second = grade(fresh(), 'good', T.review1);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('never mutates the state it was given', () => {
    const before = fresh();
    const snapshot = JSON.stringify(before);
    grade(before, 'again', T.review1);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('rounds derived state to the pinned precision, so engine float drift cannot accumulate', () => {
    let state = fresh();
    (['good', 'hard', 'again', 'good', 'easy'] as const).forEach((value, index) => {
      state = grade(
        state,
        value,
        [T.review1, T.review2, T.review3, T.review4, '2026-09-01T09:00:00.000Z'][index] ??
          T.review1,
      );
      [state.stability, state.difficulty].forEach((number) => {
        expect(Number(number.toFixed(FSRS_STATE_PRECISION))).toBe(number);
      });
    });
  });

  it('a long history replays to the same state twice', () => {
    const play = () => {
      let state = fresh();
      const script = [
        ['good', T.review1],
        ['again', T.review2],
        ['hard', T.review3],
        ['good', T.review4],
        ['easy', '2026-10-01T09:00:00.000Z'],
        ['good', '2026-12-01T09:00:00.000Z'],
      ] as const;
      script.forEach(([value, at]) => {
        state = grade(state, value, at);
      });
      return state;
    };
    expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
  });
});

describe('the reducer refuses to invent a schedule', () => {
  it('returns null for a contract nothing activated (T-02)', () => {
    expect(
      memoryStateReducer(null, {
        contractId: 'contract-1',
        effectiveGrade: 'good',
        reviewedAt: T.review1,
      }),
    ).toBeNull();
  });

  it('applies the review when a state exists', () => {
    const next = memoryStateReducer(fresh(), {
      contractId: 'contract-1',
      effectiveGrade: 'good',
      reviewedAt: T.review1,
    });
    expect(next?.admittedReviewCount).toBe(1);
  });
});
