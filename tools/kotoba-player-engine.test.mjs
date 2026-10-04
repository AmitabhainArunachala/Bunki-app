/**
 * The deck player's engine (prototypes/corridor/decks/player/engine.js)
 * against the vendored ts-fsrs and the pinned parameters: a grade never
 * throws on a backward device clock (append-order-monotonic-clamp-v1), and
 * the review's earlier scheduler findings still reproduce unchanged.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as engine from '../prototypes/corridor/decks/player/engine.js';
import * as fsrsApi from '../prototypes/corridor/vendor/ts-fsrs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const pin = JSON.parse(
  readFileSync(resolve(HERE, '../prototypes/corridor/data/fsrs-pin.json'), 'utf8'),
);
const scheduler = engine.createScheduler(fsrsApi, pin);
const { grade, emptyState, effectiveReviewTime, preview, normalizeState, RATINGS } = engine;

const T = new Date('2026-10-04T09:00:00Z');
const MIN = 60e3;
const DAY = 864e5;
const deck = {
  id: 'demo',
  groups: [{ id: 'g' }],
  words: [
    {
      id: 'w',
      group: 'g',
      cards: [
        { id: 'c1', lv: 1 },
        { id: 'c2', lv: 2 },
      ],
    },
  ],
};

const firstGood = () => grade(fsrsApi, scheduler, emptyState('demo'), 'c1', RATINGS.good, T);

describe('kotoba player engine: review time never runs backward', () => {
  it('effectiveReviewTime lifts a clock behind the last review up to it', () => {
    expect(effectiveReviewTime(null, T)).toBe(T);
    expect(effectiveReviewTime({ last_review: '2026-10-03T09:00:00.000Z' }, T)).toBe(T);
    const later = effectiveReviewTime({ last_review: T.toISOString() }, new Date(T - DAY));
    expect(later.toISOString()).toBe(T.toISOString());
  });

  it('a grade one day behind the last review does not throw and keeps last_review >= T', () => {
    const s1 = firstGood();
    expect(s1.log.at(-1)).toEqual(['c1', RATINGS.good, T.toISOString()]);
    const back = new Date(T.getTime() - DAY);
    let s2;
    expect(() => {
      s2 = grade(fsrsApi, scheduler, s1, 'c1', RATINGS.good, back);
    }).not.toThrow();
    expect(new Date(s2.cards.c1.last_review).getTime()).toBeGreaterThanOrEqual(T.getTime());
    // clamped: [cardId, rating, effective time, raw device time]
    expect(s2.log.at(-1)).toEqual(['c1', RATINGS.good, T.toISOString(), back.toISOString()]);
    expect(() => preview(fsrsApi, scheduler, s2, 'c1', back)).not.toThrow();
  });

  it('a grade one minute behind does not throw; the clamp applies to any backward step', () => {
    // ts-fsrs itself only throws once the whole-day delta goes negative, but the
    // helper clamps every backward step, so this row also carries the raw time.
    const s1 = firstGood();
    const back = new Date(T.getTime() - MIN);
    let s2;
    expect(() => {
      s2 = grade(fsrsApi, scheduler, s1, 'c1', RATINGS.good, back);
    }).not.toThrow();
    expect(new Date(s2.cards.c1.last_review).getTime()).toBeGreaterThanOrEqual(T.getTime());
    expect(s2.log.at(-1)).toHaveLength(4);
    expect(s2.log.at(-1)).toEqual(['c1', RATINGS.good, T.toISOString(), back.toISOString()]);
  });

  it('a grade forward in time keeps the three-element log row', () => {
    const s2 = grade(
      fsrsApi,
      scheduler,
      firstGood(),
      'c1',
      RATINGS.good,
      new Date(T.getTime() + 10 * MIN),
    );
    expect(s2.log.at(-1)).toHaveLength(3);
  });
});

describe('kotoba player engine: earlier review findings unchanged (F03, F05 deferred)', () => {
  it('early_learning_requeue: Good on a new card is due in ten minutes', () => {
    const s = firstGood();
    expect(s.cards.c1.due).toBe('2026-10-04T09:10:00.000Z');
    expect((new Date(s.cards.c1.due) - T) / 1000).toBe(600);
    expect(s.cards.c1.state).not.toBe(2);
  });

  it('log_truncation: normalizeState keeps the last 5,000 rows', () => {
    const truncated = normalizeState(
      {
        ...emptyState('demo'),
        log: Array.from({ length: 5001 }, (_, i) => ['c1', 3, String(i)]),
      },
      deck,
    );
    expect(truncated.log).toHaveLength(5000);
    expect(truncated.log[0]).toEqual(['c1', 3, '1']);
  });
});
