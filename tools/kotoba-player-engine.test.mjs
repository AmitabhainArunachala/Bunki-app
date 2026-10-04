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

describe('kotoba player engine: a backup is checked before it can replace anything (F02, A21)', () => {
  const { inspectState } = engine;
  const envelope = { format: engine.STATE_FORMAT, version: engine.VERSION, deckId: 'demo' };

  it.each([
    ['{}', {}, 'empty'],
    ['[]', [], 'not-an-object'],
    ['null', null, 'not-an-object'],
    ['{"cards":{}}', { cards: {} }, 'empty'],
    ['another deck', { ...envelope, deckId: 'other', cards: firstGood().cards }, 'wrong-deck'],
    ['version 2', { ...envelope, version: 2, cards: firstGood().cards }, 'wrong-version'],
    ['a due that is not a date', { ...envelope, cards: { c1: { due: 'not-a-date' } } }, 'bad-card'],
  ])('inspectState refuses %s', (_, raw, reason) => {
    const seen = inspectState(raw, deck);
    expect(seen.ok).toBe(false);
    expect(seen.reason).toBe(reason);
  });

  it('inspectState accepts a valid backup and counts cards, orphans and answers', () => {
    const s1 = firstGood();
    const s2 = grade(fsrsApi, scheduler, s1, 'c2', RATINGS.again, new Date(T.getTime() + MIN));
    const raw = JSON.parse(JSON.stringify({ ...s2, cards: { ...s2.cards, gone: s2.cards.c1 } }));
    const before = JSON.stringify(raw);
    expect(inspectState(raw, deck)).toEqual({
      ok: true,
      reason: null,
      cards: 3,
      known: 2,
      orphans: 1,
      log: 2,
    });
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('normalizeState keeps a record for a card no longer in the deck and drops a malformed one', () => {
    const good = firstGood().cards.c1;
    const state = normalizeState(
      {
        ...emptyState('demo'),
        cards: { c1: good, retired: good, c2: { ...good, stability: 'x' } },
      },
      deck,
    );
    expect(Object.keys(state.cards).sort()).toEqual(['c1', 'retired']);
    expect(state.cards.retired).toEqual(good);
  });

  it('an orphan does not take a slot from today’s new cards', () => {
    const orphan = { ...firstGood().cards.c1 };
    const state = { ...emptyState('demo'), cards: { retired: orphan } };
    expect(engine.introducedToday(state, T, deck)).toBe(0);
    expect(engine.buildQueue(deck, state, T, 1).fresh).toEqual(['c1']);
  });
});

describe('kotoba player engine: a card deleted on its first showing does not hold the word', () => {
  const mcd = {
    id: 'demo',
    groups: [{ id: 'g' }],
    words: [
      {
        id: 'w',
        group: 'g',
        cards: [
          { id: 'p1', type: 'word', passage: 1 },
          { id: 'p1k', type: 'kanji', passage: 1 },
          { id: 'p2', type: 'word', passage: 2 },
          { id: 'p3', type: 'word', passage: 3 },
        ],
      },
    ],
  };
  const deleted = (ids) => ({
    ...emptyState('demo'),
    suspended: Object.fromEntries(ids.map((id) => [id, { at: T.toISOString(), by: 'delete' }])),
  });

  it('the next passage becomes the first, skipping the culled passage’s 字 cards', () => {
    expect(engine.buildQueue(mcd, deleted(['p1']), T, 5).fresh).toEqual(['p2']);
    expect(engine.buildQueue(mcd, deleted(['p1', 'p2']), T, 5).fresh).toEqual(['p3']);
  });

  it('a culled 字 card alone leaves its passage in place', () => {
    expect(engine.buildQueue(mcd, deleted(['p1k']), T, 5).fresh).toEqual(['p1']);
  });

  it('after a shown card the unlock test reads the last shown card, as before', () => {
    const s = grade(fsrsApi, scheduler, deleted(['p1k']), 'p1', RATINGS.good, T);
    const later = new Date(T.getTime() + 2 * DAY);
    expect(engine.buildQueue(mcd, s, later, 5).fresh).toEqual([]);
  });

  it('the sentence deck: deleting sentence 1 unseen introduces sentence 2', () => {
    expect(engine.buildQueue(deck, deleted(['c1']), T, 5).fresh).toEqual(['c2']);
  });
});

describe('kotoba player engine: 読んで思い出す leaves 字 cards out without touching them (A37)', () => {
  const mcd = {
    id: 'demo',
    groups: [{ id: 'g' }],
    words: [
      {
        id: 'w',
        group: 'g',
        cards: [
          { id: 'p1', type: 'word', passage: 1 },
          { id: 'p1k', type: 'kanji', passage: 1 },
          { id: 'p2', type: 'word', passage: 2 },
        ],
      },
    ],
  };
  const skip = engine.skipFor('read');
  const record = (over) => ({
    due: new Date(T.getTime() + 10 * DAY).toISOString(),
    stability: 20,
    difficulty: 5,
    elapsed_days: 20,
    scheduled_days: 20,
    reps: 3,
    lapses: 0,
    state: 2,
    last_review: new Date(T.getTime() - 20 * DAY).toISOString(),
    introducedAt: new Date(T.getTime() - 40 * DAY).toISOString(),
    ...over,
  });
  const settled = { ...emptyState('demo'), cards: { p1: record() } };

  it('only the read mode skips, and only 字 cards', () => {
    expect(engine.skipFor('self')).toBeNull();
    expect(engine.skipFor('choice')).toBeNull();
    expect([{ type: 'kanji' }, { type: 'word' }, {}].map((c) => skip(c))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('a new 字 card is passed over: the next passage opens after the word card settles', () => {
    expect(engine.buildQueue(mcd, settled, T, 5).fresh).toEqual(['p1k']);
    expect(engine.buildQueue(mcd, settled, T, 5, { skip }).fresh).toEqual(['p2']);
  });

  it('a due 字 card waits in read mode and is due again in 穴埋め, its record untouched', () => {
    const s = { ...settled, cards: { ...settled.cards, p1k: record({ due: T.toISOString() }) } };
    const before = JSON.stringify(s);
    expect(engine.buildQueue(mcd, s, T, 0, { skip }).due).toEqual([]);
    expect(engine.buildQueue(mcd, s, T, 0).due).toEqual(['p1k']);
    expect(engine.dueCount(mcd, s, T, { skip })).toBe(0);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('a 字 learning step does not come back into a read sitting', () => {
    const s = {
      ...settled,
      cards: { ...settled.cards, p1k: record({ state: 1, due: T.toISOString() }) },
    };
    expect(engine.learningSoon(mcd, s, T, 0, { skip })).toEqual([]);
    expect(engine.learningSoon(mcd, s, T, 0).map((x) => x.id)).toEqual(['p1k']);
  });
});
