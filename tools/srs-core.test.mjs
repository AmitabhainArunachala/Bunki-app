/**
 * The app's one schedule owner (prototypes/corridor/srs-core.mjs): the sitting rule (Anki's order,
 * learn-ahead only by the learner's choice with nothing else left), the due gate every surface asks
 * before it writes a grade, the scheduler built from the pin, and the close counted from the answers.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as core from '../prototypes/corridor/srs-core.mjs';
import * as fsrsApi from '../prototypes/corridor/vendor/ts-fsrs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const pin = JSON.parse(readFileSync(resolve(HERE, '../prototypes/corridor/data/fsrs-pin.json'), 'utf8'));
const MIN = 60e3;
const T = new Date('2026-10-19T07:00:00Z');
const at = (ms) => new Date(T.getTime() + ms);

describe('nextStep: the sitting rule', () => {
  it('a learning step that is due comes first, soonest first', () => {
    const d = core.nextStep({ now: T, queue: ['n1'], learning: [{ id: 'b', due: T.getTime() - 5 }, { id: 'a', due: T.getTime() - 10 }] });
    expect(d).toEqual({ show: 'a', early: false });
  });
  it('a learning step not yet due waits while other cards remain', () => {
    expect(core.nextStep({ now: T, queue: ['n1', 'n2'], learning: [{ id: 'a', due: at(9 * MIN).getTime() }] })).toEqual({ show: 'n1', early: false });
  });
  it('with nothing else left the sitting pauses and offers the early choice within 20 minutes', () => {
    expect(core.nextStep({ now: T, learning: [{ id: 'a', due: at(9 * MIN).getTime() }, { id: 'b', due: at(10 * MIN).getTime() }] }))
      .toEqual({ pause: true, count: 2, at: at(9 * MIN).getTime(), canEarly: true });
  });
  it('the learner who chose "now" is shown the soonest step early', () => {
    expect(core.nextStep({ now: T, learning: [{ id: 'a', due: at(9 * MIN).getTime() }], ahead: true })).toEqual({ show: 'a', early: true });
  });
  it('past the learn-ahead limit there is no early choice, even when asked', () => {
    const learning = [{ id: 'a', due: at(25 * MIN).getTime() }];
    expect(core.nextStep({ now: T, learning, ahead: true })).toEqual({ pause: true, count: 1, at: at(25 * MIN).getTime(), canEarly: false });
    expect(core.nextStep({ now: T, learning: [{ id: 'a', due: at(20 * MIN).getTime() }], ahead: true }).show).toBe('a');
  });
  it('nothing left at all is done', () => {
    expect(core.nextStep({ now: T })).toEqual({ done: true });
  });
});

describe('servable: the gate before any grade is written', () => {
  const rec = (state, dueMs) => ({ state, due: at(dueMs).toISOString() });
  it('a card never answered may always be graded', () => {
    expect(core.servable(null, T)).toBe(true);
    expect(core.servable({ state: 0, due: at(DAYS(3)).toISOString() }, T)).toBe(true);
  });
  it('a learning step only when due, or within 20 minutes when learning ahead', () => {
    expect(core.servable(rec(1, 9 * MIN), T)).toBe(false);
    expect(core.servable(rec(1, 9 * MIN), T, { learnAhead: true })).toBe(true);
    expect(core.servable(rec(3, 21 * MIN), T, { learnAhead: true })).toBe(false);
    expect(core.servable(rec(3, 0), T)).toBe(true);
  });
  it('a review card only when it falls due today; six days ahead never', () => {
    expect(core.servable(rec(2, DAYS(6)), T)).toBe(false);
    expect(core.servable(rec(2, -MIN), T)).toBe(true);
    expect(core.servable(rec(2, 2 * MIN), T, { dayEnd: at(MIN).getTime() })).toBe(false);
  });
});
function DAYS(n) {
  return n * 864e5;
}

describe('the scheduler and the clock clamp', () => {
  it('builds exactly the pinned parameters, with the learner policy only where given', () => {
    expect(core.schedulerInput(pin)).toEqual({
      w: pin.w, request_retention: pin.requestRetention, maximum_interval: pin.maximumInterval, enable_fuzz: pin.enableFuzz,
      enable_short_term: pin.enableShortTerm, learning_steps: pin.learningSteps, relearning_steps: pin.relearningSteps,
    });
    const learner = { retention: 0.85, learningSteps: ['10m'], w: pin.w.map((x) => x * 1.01) };
    const input = core.schedulerInput(pin, learner);
    expect([input.request_retention, input.learning_steps, input.w]).toEqual([0.85, ['10m'], learner.w]);
    expect([input.enable_fuzz, input.relearning_steps, input.maximum_interval]).toEqual([false, ['10m'], 36500]);
  });
  it('labels what it schedules: Good on a new card is 10 min, Again 1 min; graduation is days', () => {
    const s = core.createScheduler(fsrsApi, pin);
    const card = fsrsApi.createEmptyCard(T);
    const all = s.repeat(card, T);
    expect(all[3].card.due.getTime() - T.getTime()).toBe(10 * MIN);
    expect(all[1].card.due.getTime() - T.getTime()).toBe(MIN);
    const second = s.repeat(all[3].card, at(10 * MIN));
    expect(second[3].card.state).toBe(core.REVIEW);
    expect(second[3].card.due.getTime() - at(10 * MIN).getTime()).toBeGreaterThanOrEqual(DAYS(1));
  });
  it('a clock behind the last review is lifted to it', () => {
    expect(core.reviewInstant(at(MIN).toISOString(), T).getTime()).toBe(at(MIN).getTime());
    expect(core.reviewInstant(null, T)).toBe(T);
  });
});

describe('the close counts the sitting', () => {
  const rows = [
    { word: 'a', before: null, rating: 3 }, { word: 'b', before: null, rating: 1 }, { word: 'c', before: 2, rating: 3 },
    { word: 'b', before: 1, rating: 3 }, { word: 'a', before: 1, rating: 3, early: true }, { word: 'b', before: 1, rating: 3, early: true },
  ];
  const tally = core.sittingTally(rows, { startedAt: T.getTime(), now: at(4 * MIN) });
  it('new words, reviews, answers, step returns, early ones and Again, from the rows', () => {
    expect(tally).toMatchObject({ answers: 6, words: 3, newWords: 2, reviewWords: 1, returns: 3, early: 2, againWords: 1, minutes: 4 });
  });
  it('says it in plain words, both languages', () => {
    expect(core.closeLines(tally, 'en')).toEqual([
      '2 new words and 1 review · 6 answers in 4 minutes.',
      'Cards came back 3 times for a learning step (2 a few minutes early, with nothing else left); 1 word needed Again.',
    ]);
    expect(core.closeLines(tally, 'ja')).toEqual(['新しい語 2・復習 1・回答 6（4 分）。', '学習ステップで戻った札 3（うち 2 はほかに札がなく少し早めに）、もう一度 1 語。']);
  });
  it('one card that came back once, early, reads as one card', () => {
    const one = core.sittingTally([{ word: 'a', before: null, rating: 3 }, { word: 'a', before: 1, rating: 3, early: true }], { startedAt: T.getTime(), now: at(MIN) });
    expect(core.closeLines(one, 'en')).toEqual(['1 new word · 2 answers in 1 minute.', 'A card came back for a learning step (a few minutes early, with nothing else left).']);
  });
  it('names waits the way the pads do', () => {
    expect([MIN, 10 * MIN, 90 * MIN, DAYS(1), DAYS(6), DAYS(60), DAYS(548)].map((ms) => core.waitWords(ms))).toEqual(['1 min', '10 min', '2 hr', '1 day', '6 days', '2 months', '1.5 years']);
    expect([10 * MIN, DAYS(6)].map((ms) => core.waitWords(ms, 'ja'))).toEqual(['10分', '6日']);
  });
  it('offers the early choice only within the learn-ahead limit', () => {
    expect(core.pauseWords({ count: 5, at: at(8 * MIN).getTime(), canEarly: true }, 'en', T)).toEqual({
      line: '5 words are in a learning step (the next is due in 8 min): review them now, early, or they will wait for you.',
      now: 'Review now, early',
    });
    expect(core.pauseWords({ count: 1, at: at(25 * MIN).getTime(), canEarly: false }, 'en', T).now).toBe(null);
  });
});

describe('burying across surfaces (lead\'s ruling 10-19)', () => {
  const memory = () => {
    const map = new Map();
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  };
  it('a word answered on one surface rests on the others today, never on its own, and not tomorrow', () => {
    const storage = memory();
    core.noteAnswered(storage, core.wordIdentity('検証', 'ケンショウ'), 'deck:senmon', T);
    const today = core.answeredToday(storage, T);
    expect(core.buriedHere(today, '検証', 'けんしょう', 'deck:kotoba-mine')).toBe(true);
    expect(core.buriedHere(today, '検証', 'けんしょう', 'deck:senmon')).toBe(false);
    expect(core.buriedHere(today, '検証', 'けんせい', 'corridor')).toBe(false);
    expect(core.buriedHere(today, '検証', null, 'corridor')).toBe(true);
    expect(core.buriedHere(core.answeredToday(storage, at(DAYS(1))), '検証', 'けんしょう', 'context')).toBe(false);
    expect(core.buriedWords(3)).toBe('3 cards for words you already answered today wait until tomorrow.');
    expect(core.noteAnswered(null, 'x|x', 'context', T)).toBe(false);
  });
  it('the deck queue leaves a buried word\'s review and new cards out, keeps its 字 card and its learning steps', async () => {
    const player = await import('../prototypes/corridor/decks/player/engine.js');
    const deck = { id: 'd', groups: [{ id: 'g' }], words: [
      { id: 'w1', group: 'g', term: '検証', reading: 'けんしょう', cards: [{ id: 'w1-1', lv: 1 }, { id: 'w1-k', lv: 1, type: 'kanji' }] },
      { id: 'w2', group: 'g', term: '実装', reading: 'じっそう', cards: [{ id: 'w2-1', lv: 1 }] },
      { id: 'w3', group: 'g', term: '量産', reading: 'りょうさん', cards: [{ id: 'w3-1', lv: 1 }] },
    ] };
    const rec = (state, dueMs) => ({ due: new Date(T.getTime() + dueMs).toISOString(), state, stability: 5, difficulty: 5, reps: 2, lapses: 0, introducedAt: at(-DAYS(9)).toISOString() });
    const state = { ...player.emptyState('d'), cards: { 'w1-1': rec(2, -MIN), 'w1-k': rec(2, -2 * MIN), 'w2-1': rec(1, -MIN) } };
    // all three words were answered elsewhere today
    const q = player.buildQueue(deck, state, T, 5, { buried: () => true });
    expect(q.queue).toEqual(['w1-k', 'w2-1']);
    expect(q.buried).toBe(2);
  });
});
