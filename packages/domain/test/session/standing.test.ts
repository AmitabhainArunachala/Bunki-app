/**
 * `srsStanding` — the SRS's own statistics, over a real replayed log.
 *
 * The suite is written against `replay(seededLog())` rather than against
 * hand-built `MemoryState` literals wherever it can be, because the properties
 * being checked are properties of what a learner's log actually produces. A
 * fixture that asserted "two contracts, both unasked" while the real activation
 * path produced something else would be green over exactly the defect that
 * matters.
 *
 * Four things are checked that would each be a rule violation if they broke:
 *
 *   1. **the four standings partition the active contracts** — every contract is
 *      in exactly one, so the counts a learner reads add up to the count beside
 *      the heading and nothing is invisible;
 *   2. **there is no roll-up across lenses** — the returned object has no total,
 *      no ratio and no average, which is REQ-LM-03 as a shape rather than as a
 *      review note;
 *   3. **the load window never double-counts** — overdue plus every day plus
 *      beyond-window equals the active contract count exactly;
 *   4. **the calendar arithmetic is the real one** — the pure `days_from_civil`
 *      implementation is checked against known dates including a leap day and a
 *      century boundary, because it replaced `Date.parse` and a silent
 *      off-by-one there would move every bar.
 */

import { describe, expect, it } from 'vitest';

import {
  CONTRACT_STANDINGS,
  LOAD_WINDOW_DAYS,
  parseEventLog,
  replay,
  srsStanding,
  standingOf,
  type IsoInstant,
  type MemoryState,
} from '../../src/index.ts';
import { learnableLog, review } from '../support/wp06.ts';
import { seededLog, seededLogWithReview } from './support.ts';

const AS_OF: IsoInstant = '2026-07-27T12:00:00.000Z';

/** A memory state with only the fields `standingOf` reads. */
function memory(overrides: Partial<MemoryState>): MemoryState {
  return {
    contractId: 'contract-x',
    active: true,
    phase: 'review',
    stability: 3,
    difficulty: 5,
    dueAt: AS_OF,
    lastReviewedAt: '2026-07-20T12:00:00.000Z',
    scheduledDays: 7,
    learningStep: 0,
    reps: 1,
    lapses: 0,
    admittedReviewCount: 1,
    activatedAt: '2026-07-20T12:00:00.000Z',
    scheduler: {
      package: 'ts-fsrs',
      version: 'pinned',
      algorithm: 'fsrs-6',
      parameterSetId: 'test',
    },
    ...overrides,
  } as MemoryState;
}

describe('the four standings', () => {
  it('calls an activated, never-answered contract “unasked” rather than due', () => {
    // Both are true of it, and only one of them is useful. "Due" on a contract
    // nobody has ever been asked would put a first meeting in the same bucket as
    // something the learner is losing.
    expect(standingOf(memory({ phase: 'new', reps: 0 }), AS_OF)).toBe('unasked');
  });

  it('calls a lapsed contract fragile whether or not it is due', () => {
    expect(standingOf(memory({ lapses: 1, dueAt: '2027-01-01T00:00:00.000Z' }), AS_OF)).toBe(
      'fragile',
    );
    expect(standingOf(memory({ phase: 'relearning' }), AS_OF)).toBe('fragile');
  });

  it('splits the rest on the date alone', () => {
    expect(standingOf(memory({ dueAt: '2026-07-27T11:59:59.999Z' }), AS_OF)).toBe('due');
    expect(standingOf(memory({ dueAt: '2026-07-27T12:00:00.001Z' }), AS_OF)).toBe('holding');
  });

  it('partitions every active contract exactly once', () => {
    const standing = srsStanding(replay(seededLog()), { asOf: AS_OF });
    const total = standing.lenses.reduce(
      (sum, lens) =>
        sum + CONTRACT_STANDINGS.reduce((inner, entry) => inner + lens.counts[entry], 0),
      0,
    );
    // Every contract in this build maps to a lens; the assertion is that the
    // per-lens counts account for all of them, with none counted twice.
    expect(total).toBe(standing.contractCount);
    expect(standing.contractCount).toBeGreaterThan(0);
  });
});

describe('the seeded closed loop, as the SRS sees it', () => {
  it('reports the two contracts a promoted 分岐 activates, one per lens', () => {
    const standing = srsStanding(replay(seededLog()), { asOf: AS_OF });
    expect(standing.contractCount).toBe(2);

    const byLens = Object.fromEntries(standing.lenses.map((lens) => [lens.lens, lens]));
    expect(byLens['reading']?.contractCount).toBe(1);
    expect(byLens['meaning']?.contractCount).toBe(1);
    expect(byLens['reading']?.counts.unasked).toBe(1);
    expect(byLens['meaning']?.counts.unasked).toBe(1);
  });

  it('never collapses the lenses into a total', () => {
    const standing = srsStanding(replay(seededLog()), { asOf: AS_OF });
    // A shape assertion, not a value one. The forbidden thing is a field that
    // *could* be read as one number for the learner (REQ-LM-03); the way to stop
    // one appearing is for the test to fail when one does.
    const keys = Object.keys(standing);
    expect(keys).toEqual(
      expect.arrayContaining(['asOf', 'contractCount', 'lenses', 'load', 'contracts']),
    );
    for (const forbidden of ['score', 'mastery', 'percent', 'percentage', 'level', 'total']) {
      expect(keys.some((key) => key.toLowerCase().includes(forbidden))).toBe(false);
    }
    for (const lens of standing.lenses) {
      for (const forbidden of ['score', 'mastery', 'percent', 'level']) {
        expect(Object.keys(lens).some((key) => key.toLowerCase().includes(forbidden))).toBe(false);
      }
    }
  });

  it('reports a lens with no scheduled skill as unmeasurable rather than empty', () => {
    const standing = srsStanding(replay(seededLog()), { asOf: AS_OF });
    const writing = standing.lenses.find((lens) => lens.lens === 'writing');
    expect(writing?.unmeasurable).toBe(true);
    // Listening has a skill (`audio_to_meaning`) and simply no contracts yet —
    // the distinction the flag exists for.
    const listening = standing.lenses.find((lens) => lens.lens === 'listening');
    expect(listening?.unmeasurable).toBe(false);
    expect(listening?.contractCount).toBe(0);
  });

  it('moves a contract out of “unasked” once an admitted answer exists', () => {
    const before = srsStanding(replay(seededLog()), { asOf: AS_OF });
    const after = srsStanding(
      replay(seededLogWithReview({ contractId: 'contract-reading', grade: 'good' })),
      { asOf: AS_OF },
    );
    const unaskedIn = (standing: typeof before): number =>
      standing.lenses.reduce((sum, lens) => sum + lens.counts.unasked, 0);

    expect(unaskedIn(before)).toBe(2);
    expect(unaskedIn(after)).toBe(1);
  });

  /**
   * A first-ever `again` is **not** fragile, and that is FSRS's judgement, not
   * this module's.
   *
   * A `State.New` card failed on its first showing enters learning with
   * `lapses === 0` — there was nothing to lapse from. The first version of this
   * test asserted the opposite because "again means fragile" sounds right; the
   * code was correct and the assumption was not. Keeping the case, with the real
   * expectation, is what stops it being re-added.
   */
  it('does not call a first-ever miss fragile — nothing had been held to lose', () => {
    const standing = srsStanding(
      replay(seededLogWithReview({ contractId: 'contract-reading', grade: 'again' })),
      { asOf: AS_OF },
    );
    const fragile = standing.lenses.reduce((sum, lens) => sum + lens.counts.fragile, 0);
    expect(fragile).toBe(0);
  });

  it('counts a real lapse as fragile through the planner’s own rule', () => {
    /*
      Held, then lost.

      Two `good`s are needed before the `again`, not one: the pinned parameters
      have two learning steps (`['1m', '10m']`) with short-term scheduling on, so
      one `good` leaves the contract in learning, where a miss is not a lapse.
      It graduates to review on the second, and only then does an `again` count
      as the lapse FSRS reports — which is exactly the distinction the standing
      above is about, seen from the other side.
    */
    const log = parseEventLog(
      [
        ...learnableLog(),
        review({
          eventId: 'ev-review-step-1',
          at: '2026-07-27T09:10:00.000Z',
          contractId: 'contract-reading',
          grade: 'good',
        }),
        review({
          eventId: 'ev-review-step-2',
          at: '2026-07-27T09:25:00.000Z',
          contractId: 'contract-reading',
          grade: 'good',
        }),
        review({
          eventId: 'ev-review-lost',
          at: '2026-07-28T09:10:00.000Z',
          contractId: 'contract-reading',
          grade: 'again',
        }),
      ],
      { path: '<standing-lapse>' },
    );
    const standing = srsStanding(replay(log), { asOf: '2026-07-29T12:00:00.000Z' });
    const fragile = standing.lenses.reduce((sum, lens) => sum + lens.counts.fragile, 0);
    expect(fragile).toBe(1);
  });
});

describe('the load ahead', () => {
  it('accounts for every active contract exactly once', () => {
    const standing = srsStanding(
      replay(seededLogWithReview({ contractId: 'contract-reading', grade: 'good' })),
      { asOf: AS_OF },
    );
    const inDays = standing.load.days.reduce((sum, day) => sum + day.count, 0);
    expect(standing.load.overdue + inDays + standing.load.beyondWindow).toBe(
      standing.contractCount,
    );
  });

  it('is a fortnight of UTC calendar days, in order, starting today', () => {
    const standing = srsStanding(replay(seededLog()), { asOf: AS_OF });
    expect(standing.load.days).toHaveLength(LOAD_WINDOW_DAYS);
    expect(standing.load.days[0]?.date).toBe('2026-07-27');
    expect(standing.load.days[0]?.offset).toBe(0);
    expect(standing.load.days[13]?.date).toBe('2026-08-09');
  });

  it('keeps the backlog out of today’s bar', () => {
    // Both seeded contracts are due at activation, which is before `asOf`, so
    // they are overdue and today's bar is empty. Folding them together is what
    // makes a returning learner unable to tell a backlog from a day's work.
    const standing = srsStanding(replay(seededLog()), { asOf: AS_OF });
    expect(standing.load.overdue).toBe(2);
    expect(standing.load.days[0]?.count).toBe(0);
  });
});

describe('the calendar arithmetic that replaced Date.parse', () => {
  /**
   * Driven through the public function rather than by exporting the private
   * helper: what matters is that a due date lands in the right bar, and the bar
   * dates are the only observable the arithmetic produces.
   */
  const dayLabels = (asOf: IsoInstant): readonly string[] =>
    srsStanding({ contracts: [], memoryStates: [] }, { asOf, windowDays: 4 }).load.days.map(
      (day) => day.date,
    );

  it('crosses a month boundary', () => {
    expect(dayLabels('2026-01-30T00:00:00.000Z')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('crosses a leap day', () => {
    expect(dayLabels('2028-02-27T23:59:59.999Z')).toEqual([
      '2028-02-27',
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });

  it('crosses a non-leap century boundary', () => {
    // 2100 is not a leap year. A `% 4` implementation gets this wrong, which is
    // why the rule is written out rather than assumed.
    expect(dayLabels('2100-02-27T00:00:00.000Z')).toEqual([
      '2100-02-27',
      '2100-02-28',
      '2100-03-01',
      '2100-03-02',
    ]);
  });

  it('crosses a year boundary', () => {
    expect(dayLabels('2026-12-30T00:00:00.000Z')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
});
