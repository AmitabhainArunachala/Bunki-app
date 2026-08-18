#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';

import { DEFAULT_WEIGHTS, forgettingCurve, initialState, nextState } from '../../fsrs-optimize.mjs';
import { Rating, State, fsrs } from '../../../prototypes/corridor/vendor/ts-fsrs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DAY_MS = 86_400_000;
const TRUE_RETENTION = 0.85;

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function targetInterval(weights, stability, retention) {
  const decay = -weights[20];
  const factor = Math.exp(Math.log(0.9) / decay) - 1;
  return (stability / factor) * (Math.pow(retention, 1 / decay) - 1);
}

const round = (value, places = 4) => Number(value.toFixed(places));

function gradeRow(
  time,
  key,
  rating,
  stateBefore,
  elapsed,
  stateBeforeMemory,
  stateAfter,
  engineWeights = TRUE_WEIGHTS,
  modelElapsed = elapsed,
) {
  const first = stateBeforeMemory === null;
  const retrievability = first
    ? null
    : forgettingCurve(engineWeights, modelElapsed, stateBeforeMemory.stability);
  return [
    Math.round(time),
    key,
    rating,
    stateBefore,
    first ? null : round(elapsed, 3),
    retrievability === null ? null : round(retrievability),
    first ? null : round(stateBeforeMemory.stability),
    first ? null : round(stateBeforeMemory.difficulty),
    round(stateAfter.stability),
    round(stateAfter.difficulty),
    Math.max(0, Math.round(elapsed)),
    Math.round(time + Math.max(0.01, elapsed) * DAY_MS),
  ];
}

// A deliberately faster-forgetting learner than the population defaults.
// The simulator schedules long-term reviews at its own 0.85 retention point.
const TRUE_WEIGHTS = Object.freeze([0.08, 0.48, 1.15, 3.8, ...DEFAULT_WEIGHTS.slice(4, 20), 0.31]);

function syntheticStore() {
  const random = mulberry32(0x0b00c1);
  const revlog = [];
  let cursor = Date.UTC(2025, 0, 1, 12);
  for (let cardIndex = 0; cardIndex < 100; cardIndex += 1) {
    const key = `word:synthetic-${String(cardIndex).padStart(3, '0')}`;
    const firstRating = random() < 0.15 ? 2 : random() < 0.9 ? 3 : 4;
    let state = initialState(TRUE_WEIGHTS, firstRating);
    revlog.push(gradeRow(cursor, key, firstRating, 0, 0, null, state));

    // Every fourth card exercises FSRS-6 short-term state. It is not itself a
    // long-term loss target, but it changes what the next review predicts.
    if (cardIndex % 4 === 0) {
      const elapsed = 10 / 1_440;
      const rating = random() < 0.12 ? 1 : 3;
      const after = nextState(TRUE_WEIGHTS, state, 0, rating);
      cursor += 10 * 60_000;
      revlog.push(gradeRow(cursor, key, rating, 1, elapsed, state, after, TRUE_WEIGHTS, 0));
      state = after;
    }

    for (let reviewIndex = 0; reviewIndex < 5; reviewIndex += 1) {
      const elapsed = Math.max(
        1,
        Math.round(targetInterval(TRUE_WEIGHTS, state.stability, TRUE_RETENTION)),
      );
      const recall = forgettingCurve(TRUE_WEIGHTS, elapsed, state.stability);
      const roll = random();
      let rating;
      if (roll > recall) rating = 1;
      else {
        const quality = random();
        rating = quality < 0.14 ? 2 : quality > 0.92 ? 4 : 3;
      }
      const before = state;
      const after = nextState(TRUE_WEIGHTS, before, elapsed, rating);
      cursor += elapsed * DAY_MS;
      revlog.push(gradeRow(cursor, key, rating, 2, elapsed, before, after));
      state = after;
    }
    cursor += DAY_MS;
  }
  return {
    v: 1,
    fixture: {
      kind: 'deterministic-fsrs6-simulated-learner',
      seed: '0x0b00c1',
      trueRetention: TRUE_RETENTION,
      cards: 100,
      longTermOutcomes: 500,
    },
    taken: [],
    srs: {},
    revlog,
    obslog: [],
  };
}

function smallStore() {
  const key = 'word:small';
  const first = initialState(DEFAULT_WEIGHTS, 3);
  const second = nextState(DEFAULT_WEIGHTS, first, 2, 3);
  return {
    v: 1,
    taken: [],
    srs: {},
    revlog: [
      gradeRow(Date.UTC(2025, 0, 1), key, 3, 0, 0, null, first),
      gradeRow(Date.UTC(2025, 0, 3), key, 3, 2, 2, first, second, DEFAULT_WEIGHTS),
    ],
    obslog: [],
  };
}

function revocationStore() {
  const key = 'word:undo';
  const first = initialState(DEFAULT_WEIGHTS, 3);
  const revokedAfter = nextState(DEFAULT_WEIGHTS, first, 2, 3);
  const regradedAfter = nextState(DEFAULT_WEIGHTS, first, 5, 1);
  const t0 = Date.UTC(2025, 0, 1);
  const t1 = Date.UTC(2025, 0, 3);
  const t2 = Date.UTC(2025, 0, 3, 0, 1);
  const t3 = Date.UTC(2025, 0, 6);
  return {
    v: 1,
    taken: [],
    srs: {},
    revlog: [
      gradeRow(t0, key, 3, 0, 0, null, first),
      gradeRow(t1, key, 3, 2, 2, first, revokedAfter, DEFAULT_WEIGHTS),
      [t2, key, 0, 1],
      gradeRow(t3, key, 1, 2, 5, first, regradedAfter, DEFAULT_WEIGHTS),
    ],
    obslog: [],
  };
}

function leftCensoredStore() {
  const key = 'word:pre-existing';
  const scheduler = fsrs({
    request_retention: 0.9,
    w: [...DEFAULT_WEIGHTS],
    maximum_interval: 36_500,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  });
  const firstTime = Date.UTC(2025, 0, 1, 12);
  const priorReviewTime = firstTime - 12.125 * DAY_MS;
  const before = {
    due: new Date(firstTime),
    stability: 14.25,
    difficulty: 5.75,
    elapsed_days: 12,
    scheduled_days: 20,
    reps: 7,
    lapses: 1,
    learning_steps: 0,
    state: State.Review,
    last_review: new Date(priorReviewTime),
  };
  const firstAfter = scheduler.next(before, new Date(firstTime), Rating.Good).card;
  const secondTime = firstAfter.due.getTime();
  const secondAfter = scheduler.next(firstAfter, new Date(secondTime), Rating.Again).card;
  const row = (time, rating, prior, after) => [
    time,
    key,
    rating,
    prior.state,
    round((time - prior.last_review.getTime()) / DAY_MS, 3),
    round(scheduler.get_retrievability(prior, new Date(time), false)),
    round(prior.stability),
    round(prior.difficulty),
    round(after.stability),
    round(after.difficulty),
    after.scheduled_days,
    after.due.getTime(),
  ];
  return {
    v: 1,
    fixture: {
      kind: 'corridor-v1-left-censored-pre-existing-srs-card',
      note: 'S.srs predates the first retained S.revlog row for this card',
    },
    taken: [],
    srs: {
      [key]: {
        ...secondAfter,
        due: secondAfter.due.toISOString(),
        last_review: secondAfter.last_review.toISOString(),
      },
    },
    revlog: [
      row(firstTime, Rating.Good, before, firstAfter),
      row(secondTime, Rating.Again, firstAfter, secondAfter),
    ],
    obslog: [],
  };
}

await mkdir(HERE, { recursive: true });
for (const [name, value] of [
  ['synthetic-retention-085.json', syntheticStore()],
  ['below-minimum.json', smallStore()],
  ['revocation.json', revocationStore()],
  ['left-censored-existing-card.json', leftCensoredStore()],
]) {
  await writeFile(
    resolve(HERE, name),
    await format(JSON.stringify(value), { parser: 'json', printWidth: 100, endOfLine: 'lf' }),
  );
}
