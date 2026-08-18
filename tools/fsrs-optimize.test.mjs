import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WEIGHTS,
  FsrsOptimizeError,
  MINIMUM_TRAINING_REVIEWS,
  evaluateWeights,
  forgettingCurve,
  initialState,
  nextState,
  optimizeExport,
  reconstructReviewSequences,
  regularizationPenalty,
} from './fsrs-optimize.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = async (name) =>
  JSON.parse(await readFile(resolve(HERE, 'fixtures', 'fsrs', name), 'utf8'));
const Rating = Object.freeze({ Again: 1, Hard: 2, Good: 3, Easy: 4 });

function vendoredOracle(request) {
  const run = spawnSync(
    process.execPath,
    [resolve(HERE, 'fixtures', 'fsrs', 'vendored-oracle.mjs')],
    { input: JSON.stringify(request), encoding: 'utf8' },
  );
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout);
}

describe('fsrs-optimize', () => {
  it('honors append-only revocations and re-grades the restored card history', async () => {
    const reconstructed = reconstructReviewSequences(await fixture('revocation.json'));
    expect(reconstructed.stats).toMatchObject({
      totalRows: 4,
      activeGradeRows: 2,
      revokedGradeRows: 1,
      revocationRows: 1,
      cards: 1,
      trainingReviews: 1,
    });
    expect(reconstructed.sequences[0].reviews.map(({ index, rating }) => [index, rating])).toEqual([
      [0, 3],
      [3, 1],
    ]);
    expect(evaluateWeights(reconstructed.sequences, DEFAULT_WEIGHTS).predictions).toHaveLength(1);
  });

  it('preserves backward raw times while clamping grades in append order across undo/re-grade', async () => {
    const raw = await fixture('revocation.json');
    const firstGradeTime = raw.revlog[0][0];
    raw.revlog[2][0] = raw.revlog[1][0] - 86_400_000;
    raw.revlog[3][0] = firstGradeTime - 172_800_000;

    const reconstructed = reconstructReviewSequences(raw);
    const reviews = reconstructed.sequences[0].reviews;
    expect(reviews.map(({ index }) => index)).toEqual([0, 3]);
    expect(reviews[1]).toMatchObject({
      time: firstGradeTime - 172_800_000,
      rawTime: firstGradeTime - 172_800_000,
      effectiveTime: firstGradeTime,
      elapsedRecordedDays: 5,
      elapsedDays: 0,
      shortTerm: true,
    });
    expect(reconstructed.stats).toMatchObject({
      revokedGradeRows: 1,
      revocationRows: 1,
      sameDayReviews: 1,
      trainingReviews: 0,
      clockClampedReviews: 1,
    });
  });

  it('conditions on a real-shaped left-censored SRS boundary and trains from its first observed outcome', async () => {
    const raw = await fixture('left-censored-existing-card.json');
    expect(raw.srs['word:pre-existing'].reps).toBe(9);
    expect(raw.revlog[0].slice(3, 8)).toEqual([2, 12.125, 0.9114, 14.25, 5.75]);

    const reconstructed = reconstructReviewSequences(raw);
    expect(reconstructed.stats).toMatchObject({
      cards: 1,
      leftCensoredCards: 1,
      sameDayReviews: 0,
      trainingReviews: 2,
    });
    expect(reconstructed.sequences[0].reviews[0]).toMatchObject({
      index: 0,
      elapsedDays: 12,
      leftCensored: true,
      boundaryState: { stability: 14.25, difficulty: 5.75 },
    });

    const evaluation = evaluateWeights(reconstructed.sequences, DEFAULT_WEIGHTS);
    const oracle = vendoredOracle({
      weights: DEFAULT_WEIGHTS,
      initialRatings: [],
      forgetting: [{ elapsedDays: 12, stability: 14.25 }],
      transitions: [],
    });
    expect(evaluation.predictions).toHaveLength(2);
    expect(evaluation.predictions[0]).toEqual({
      prediction: oracle.forgetting[0],
      outcome: 1,
      leftCensored: true,
    });
  });

  it('fails closed when a purported left-censored row lacks its prior memory boundary', async () => {
    const raw = await fixture('left-censored-existing-card.json');
    raw.revlog[0][6] = null;
    expect(() => reconstructReviewSequences(raw)).toThrowError(
      expect.objectContaining({ code: 'INVALID_SEQUENCE' }),
    );
  });

  it('matches the independent vendored ts-fsrs 5.4.1 recurrence and eight-decimal rounding', () => {
    const ratings = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
    const states = [
      { stability: 2.3065, difficulty: 2.1181 },
      { stability: 37.0932, difficulty: 5.7395 },
    ];
    const forgetting = states.flatMap((state) =>
      [0, 2, 37].map((elapsedDays) => ({ elapsedDays, stability: state.stability })),
    );
    const transitions = states.flatMap((state) =>
      [0, 2, 37].flatMap((elapsedDays) =>
        ratings.map((rating) => ({ state, elapsedDays, rating })),
      ),
    );
    const oracle = vendoredOracle({
      weights: DEFAULT_WEIGHTS,
      initialRatings: ratings,
      forgetting,
      transitions,
    });
    expect(ratings.map((rating) => initialState(DEFAULT_WEIGHTS, rating))).toEqual(oracle.initial);
    expect(
      forgetting.map(({ elapsedDays, stability }) =>
        forgettingCurve(DEFAULT_WEIGHTS, elapsedDays, stability),
      ),
    ).toEqual(oracle.forgetting);
    expect(
      transitions.map(({ state, elapsedDays, rating }) =>
        nextState(DEFAULT_WEIGHTS, state, elapsedDays, rating),
      ),
    ).toEqual(oracle.transitions);

    const customWeights = [0.08, 0.48, 1.15, 3.8, ...DEFAULT_WEIGHTS.slice(4, 20), 0.31];
    const customOracle = vendoredOracle({
      weights: customWeights,
      initialRatings: ratings,
      forgetting,
      transitions,
    });
    expect(ratings.map((rating) => initialState(customWeights, rating))).toEqual(
      customOracle.initial,
    );
    expect(
      forgetting.map(({ elapsedDays, stability }) =>
        forgettingCurve(customWeights, elapsedDays, stability),
      ),
    ).toEqual(customOracle.forgetting);
    expect(
      transitions.map(({ state, elapsedDays, rating }) =>
        nextState(customWeights, state, elapsedDays, rating),
      ),
    ).toEqual(customOracle.transitions);

    const floorWeights = [...DEFAULT_WEIGHTS];
    floorWeights[0] = 0.001;
    const floorOracle = vendoredOracle({
      weights: floorWeights,
      initialRatings: [Rating.Again],
      forgetting: [],
      transitions: [],
    });
    expect(initialState(floorWeights, Rating.Again)).toEqual(floorOracle.initial[0]);
    expect(initialState(floorWeights, Rating.Again).stability).toBe(0.1);
  });

  it('uses the fsrs-rs full-batch L2 scale without dividing by review count', () => {
    const oneStandardDeviation = [...DEFAULT_WEIGHTS];
    oneStandardDeviation[0] += 6.43;
    expect(regularizationPenalty(oneStandardDeviation, 1)).toBeCloseTo(1, 12);
    expect(regularizationPenalty(oneStandardDeviation, 0.25)).toBeCloseTo(0.25, 12);
  });

  it(`refuses to emit personal weights below ${MINIMUM_TRAINING_REVIEWS} long-term outcomes`, async () => {
    const raw = await fixture('below-minimum.json');
    expect(() => optimizeExport(raw)).toThrowError(
      expect.objectContaining({
        name: 'FsrsOptimizeError',
        code: 'INSUFFICIENT_REVIEWS',
        details: { required: MINIMUM_TRAINING_REVIEWS, found: 1 },
      }),
    );
  });

  it('fits a deterministic 0.85-retention synthetic learner better than defaults', async () => {
    const raw = await fixture('synthetic-retention-085.json');
    expect(raw.fixture.trueRetention).toBe(0.85);
    const longTermRows = raw.revlog.filter((row) => row[4] >= 1);
    expect(longTermRows).toHaveLength(500);
    expect(longTermRows.filter((row) => row[2] > 1).length / longTermRows.length).toBe(0.852);
    const first = optimizeExport(raw, { epochs: 55 });
    const second = optimizeExport(raw, { epochs: 55 });

    expect(first).toEqual(second);
    expect(first.input).toMatchObject({
      cards: 100,
      sameDayReviews: 25,
      trainingReviews: 500,
    });
    expect(first.before.logLoss).toBeGreaterThan(first.after.logLoss);
    expect(first.delta.logLoss).toBeLessThan(-0.00001);
    expect(first.candidatePin.parameterSetId).toBe('bunki-fsrs6-r090-personal-v1');
    expect(first.candidatePin.w).toHaveLength(21);
    expect(first.dryRun).toBe(true);
  }, 30_000);

  it('fails closed on a revocation that targets a different card', async () => {
    const raw = await fixture('revocation.json');
    raw.revlog[2][1] = 'word:not-the-target';
    expect(() => reconstructReviewSequences(raw)).toThrow(FsrsOptimizeError);
  });

  it('refuses an explicit candidate path anywhere under data/', () => {
    const forbidden = resolve(HERE, 'fixtures', 'fsrs', 'data', 'should-not-exist.json');
    const run = spawnSync(
      process.execPath,
      [
        resolve(HERE, 'fsrs-optimize.mjs'),
        resolve(HERE, 'fixtures', 'fsrs', 'synthetic-retention-085.json'),
        '--epochs',
        '1',
        '--candidate-out',
        forbidden,
      ],
      { cwd: resolve(HERE, '..'), encoding: 'utf8' },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('DATA_WRITE_REFUSED');
    expect(existsSync(forbidden)).toBe(false);
  });

  it('refuses an output path whose ordinary-looking parent symlinks into data/', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'bunki-fsrs-output-'));
    const dataDirectory = join(scratch, 'data');
    const linkedParent = join(scratch, 'candidate-output');
    const bypass = join(linkedParent, 'candidate.json');
    try {
      mkdirSync(dataDirectory);
      symlinkSync(dataDirectory, linkedParent, 'dir');
      const run = spawnSync(
        process.execPath,
        [
          resolve(HERE, 'fsrs-optimize.mjs'),
          resolve(HERE, 'fixtures', 'fsrs', 'synthetic-retention-085.json'),
          '--epochs',
          '1',
          '--candidate-out',
          bypass,
        ],
        { cwd: resolve(HERE, '..'), encoding: 'utf8' },
      );
      expect(run.status).toBe(1);
      expect(run.stderr).toContain('DATA_WRITE_REFUSED');
      expect(run.stderr).toContain(resolve(dataDirectory, 'candidate.json'));
      expect(existsSync(bypass)).toBe(false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
