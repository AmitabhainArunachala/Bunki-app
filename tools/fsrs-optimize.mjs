#!/usr/bin/env node

/**
 * Bunki personal FSRS-6 optimizer.
 *
 * This is deliberately dependency-free and imports no app code. It consumes the
 * exact JSON written by corridor's 書き出す button, reconstructs active review
 * histories after append-only revocations, and fits all 21 FSRS-6 parameters.
 *
 * Model/source alignment:
 * - formulas and clamp ranges match the vendored ts-fsrs 5.4.1 FSRS-6 build;
 * - the loss is binary cross-entropy (Again=forgot; Hard/Good/Easy=recalled);
 * - same-day reviews update the FSRS-6 short-term state but are not themselves
 *   evaluated as long-term recall predictions;
 * - deterministic full-batch Adam minimizes the FSRS loss plus the reference
 *   optimizer's parameter-scale L2 regularization.
 */

import { constants as fsConstants } from 'node:fs';
import { open, readFile, realpath, stat, unlink } from 'node:fs/promises';
import { basename, dirname, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_WEIGHTS = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

// ts-fsrs 5.4.1 CLAMP_PARAMETERS(W17_W18_Ceiling=2, enable_short_term=true).
export const PARAMETER_BOUNDS = Object.freeze([
  [0.001, 100],
  [0.001, 100],
  [0.001, 100],
  [0.001, 100],
  [1, 10],
  [0.001, 4],
  [0.001, 4],
  [0.001, 0.75],
  [0, 4.5],
  [0, 0.8],
  [0.001, 3.5],
  [0.001, 5],
  [0.001, 0.25],
  [0.001, 0.9],
  [0, 4],
  [0, 1],
  [1, 6],
  [0, 2],
  [0, 2],
  [0.01, 0.8],
  [0.1, 0.8],
]);

// Standard deviations used by fsrs-rs to scale parameter regularization.
const PARAMETER_STDDEV = Object.freeze([
  6.43, 9.66, 17.58, 27.85, 0.57, 0.28, 0.6, 0.12, 0.39, 0.18, 0.33, 0.3, 0.09, 0.16, 0.57, 0.25,
  1.03, 0.31, 0.32, 0.14, 0.27,
]);

export const MINIMUM_TRAINING_REVIEWS = 400;
export const OPTIMIZER_DEFAULTS = Object.freeze({
  epochs: 90,
  learningRate: 0.001,
  minimumLearningRate: 0.00005,
  regularizationGamma: 1,
});

const EPSILON = 1e-7;
const DAY_MS = 86_400_000;
const S_MIN = 0.001;
const S_MAX = 36_500;
const D_MIN = 1;
const D_MAX = 10;
const roundTo8 = (value) => Math.round(value * 1e8) / 1e8;

export class FsrsOptimizeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FsrsOptimizeError';
    this.code = code;
    this.details = details;
  }
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function assert(condition, code, message, details = {}) {
  if (!condition) throw new FsrsOptimizeError(code, message, details);
}

function utcCalendarDayDifference(previousTime, currentTime) {
  const previous = new Date(previousTime);
  const current = new Date(currentTime);
  const previousUtcDay = Date.UTC(
    previous.getUTCFullYear(),
    previous.getUTCMonth(),
    previous.getUTCDate(),
  );
  const currentUtcDay = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate(),
  );
  return Math.floor((currentUtcDay - previousUtcDay) / DAY_MS);
}

function validateGradeRow(row, index) {
  assert(Array.isArray(row), 'INVALID_REVLOG_ROW', `revlog[${index}] must be an array`);
  assert(row.length === 12, 'INVALID_REVLOG_ROW', `revlog[${index}] grade row must have 12 fields`);
  const [
    time,
    key,
    grade,
    stateBefore,
    elapsed,
    retrievability,
    sBefore,
    dBefore,
    sAfter,
    dAfter,
    interval,
    due,
  ] = row;
  assert(
    Number.isInteger(time) && time >= 0,
    'INVALID_REVLOG_ROW',
    `revlog[${index}] has invalid epoch-ms time`,
  );
  assert(
    typeof key === 'string' && key.length > 0,
    'INVALID_REVLOG_ROW',
    `revlog[${index}] has invalid card key`,
  );
  assert(
    Number.isInteger(grade) && grade >= 1 && grade <= 4,
    'INVALID_REVLOG_ROW',
    `revlog[${index}] has invalid rating`,
  );
  assert(
    Number.isInteger(stateBefore) && stateBefore >= 0 && stateBefore <= 3,
    'INVALID_REVLOG_ROW',
    `revlog[${index}] has invalid prior state`,
  );
  assert(
    elapsed === null || (finite(elapsed) && elapsed >= 0),
    'INVALID_REVLOG_ROW',
    `revlog[${index}] has invalid elapsed days`,
  );
  for (const [label, value] of [
    ['retrievability', retrievability],
    ['sBefore', sBefore],
    ['dBefore', dBefore],
  ]) {
    assert(
      value === null || finite(value),
      'INVALID_REVLOG_ROW',
      `revlog[${index}] has invalid ${label}`,
    );
  }
  assert(
    finite(sAfter) && sAfter > 0,
    'INVALID_REVLOG_ROW',
    `revlog[${index}] has invalid resulting stability`,
  );
  assert(finite(dAfter), 'INVALID_REVLOG_ROW', `revlog[${index}] has invalid resulting difficulty`);
  assert(
    finite(interval) && interval >= 0,
    'INVALID_REVLOG_ROW',
    `revlog[${index}] has invalid interval`,
  );
  assert(
    Number.isInteger(due) && due >= 0,
    'INVALID_REVLOG_ROW',
    `revlog[${index}] has invalid due time`,
  );
}

function validateRevocationRow(row, index) {
  assert(Array.isArray(row), 'INVALID_REVLOG_ROW', `revlog[${index}] must be an array`);
  assert(
    row.length === 4,
    'INVALID_REVLOG_ROW',
    `revlog[${index}] revocation row must have 4 fields`,
  );
  const [time, key, grade, revokedIndex] = row;
  assert(
    Number.isInteger(time) && time >= 0,
    'INVALID_REVLOG_ROW',
    `revlog[${index}] has invalid epoch-ms time`,
  );
  assert(
    typeof key === 'string' && key.length > 0,
    'INVALID_REVLOG_ROW',
    `revlog[${index}] has invalid card key`,
  );
  assert(grade === 0, 'INVALID_REVLOG_ROW', `revlog[${index}] revocation rating must be 0`);
  assert(
    Number.isInteger(revokedIndex) && revokedIndex >= 0 && revokedIndex < index,
    'INVALID_REVOCATION',
    `revlog[${index}] points to an invalid prior row`,
    { revokedIndex },
  );
}

/** Parse the exact v1 local-store JSON emitted by corridor's 書き出す button. */
export function parseExportedStore(raw) {
  assert(
    raw && typeof raw === 'object' && !Array.isArray(raw),
    'INVALID_EXPORT',
    'Expected the exported corridor JSON object',
  );
  assert(
    raw.v === 1,
    'UNSUPPORTED_EXPORT_VERSION',
    `Expected corridor store version 1; received ${JSON.stringify(raw.v)}`,
  );
  assert(
    Array.isArray(raw.revlog),
    'INVALID_EXPORT',
    'The exported corridor record has no revlog array',
  );
  return raw;
}

/**
 * Resolve append-only undo records before building per-card sequences.
 * A revocation must identify the latest still-active grade for the same card.
 */
export function reconstructReviewSequences(rawStore) {
  const store = parseExportedStore(rawStore);
  const active = new Set();
  const revoked = new Set();
  const latestActiveByKey = new Map();

  for (let index = 0; index < store.revlog.length; index += 1) {
    const row = store.revlog[index];
    const grade = Array.isArray(row) ? row[2] : undefined;
    if (grade === 0) {
      validateRevocationRow(row, index);
      const [, key, , targetIndex] = row;
      const target = store.revlog[targetIndex];
      assert(
        Array.isArray(target) && target[2] >= 1 && target[2] <= 4,
        'INVALID_REVOCATION',
        `revlog[${index}] does not point to a grade row`,
        { targetIndex },
      );
      assert(
        target[1] === key,
        'INVALID_REVOCATION',
        `revlog[${index}] card key does not match its target`,
        { targetIndex },
      );
      assert(
        active.has(targetIndex) && !revoked.has(targetIndex),
        'INVALID_REVOCATION',
        `revlog[${index}] points to a grade that is not active`,
        { targetIndex },
      );
      assert(
        latestActiveByKey.get(key) === targetIndex,
        'INVALID_REVOCATION',
        `revlog[${index}] does not revoke the latest active grade for ${key}`,
        { targetIndex },
      );
      active.delete(targetIndex);
      revoked.add(targetIndex);
      let prior = null;
      for (let priorIndex = targetIndex - 1; priorIndex >= 0; priorIndex -= 1) {
        const priorRow = store.revlog[priorIndex];
        if (active.has(priorIndex) && priorRow[1] === key) {
          prior = priorIndex;
          break;
        }
      }
      if (prior === null) latestActiveByKey.delete(key);
      else latestActiveByKey.set(key, prior);
      continue;
    }

    validateGradeRow(row, index);
    active.add(index);
    latestActiveByKey.set(row[1], index);
  }

  const sequences = new Map();
  let sameDayReviews = 0;
  let longTermReviews = 0;
  let leftCensoredCards = 0;
  let clockClampedReviews = 0;
  for (const index of [...active].sort((a, b) => a - b)) {
    const row = store.revlog[index];
    const [time, key, rating, stateBefore, elapsed, retrievability, sBefore, dBefore] = row;
    const sequence = sequences.get(key) ?? [];
    let elapsedDays = null;
    let shortTerm = false;
    let leftCensored = false;
    const previousEffectiveTime = sequence.at(-1)?.effectiveTime ?? null;
    const effectiveTime =
      previousEffectiveTime === null ? time : Math.max(time, previousEffectiveTime);
    if (effectiveTime !== time) clockClampedReviews += 1;
    if (sequence.length > 0) {
      assert(
        finite(elapsed),
        'INVALID_SEQUENCE',
        `Active non-initial grade revlog[${index}] has no elapsed value`,
        { key },
      );
      // ts-fsrs 5.4.1 computes elapsed_days from UTC calendar dates, not by
      // flooring the fractional wall-clock duration stored for audit. This is
      // what makes every review on the same UTC date a short-term t=0 update.
      // Bunki's append-order-monotonic-clamp-v1 policy supplies FSRS with a
      // per-card nondecreasing scheduler instant while retaining `time` as raw
      // evidence. A clock rollback therefore becomes a t=0 transition rather
      // than an invalid row or a negative elapsed interval.
      elapsedDays = utcCalendarDayDifference(previousEffectiveTime, effectiveTime);
      shortTerm = elapsedDays === 0;
      if (shortTerm) sameDayReviews += 1;
      else longTermReviews += 1;
    } else if (elapsed !== null) {
      // The revlog was introduced after S.srs. A card can therefore have a
      // real prior FSRS memory state even though this is its first observed
      // log row. FSRS is Markov in (S,D), so that logged state is a sufficient
      // left boundary: condition on it, score this outcome, and continue the
      // candidate recurrence from there. The old last_review timestamp is not
      // exported; infer it from the logged three-decimal wall-clock interval,
      // then apply the scheduler's UTC-calendar day rule.
      assert(
        stateBefore >= 1 &&
          finite(sBefore) &&
          sBefore >= S_MIN &&
          finite(dBefore) &&
          dBefore >= D_MIN &&
          dBefore <= D_MAX,
        'INVALID_SEQUENCE',
        `Left-censored grade revlog[${index}] has no valid prior memory state`,
        { key },
      );
      const inferredPriorTime = effectiveTime - elapsed * DAY_MS;
      elapsedDays = utcCalendarDayDifference(inferredPriorTime, effectiveTime);
      shortTerm = elapsedDays === 0;
      leftCensored = true;
      leftCensoredCards += 1;
      if (shortTerm) sameDayReviews += 1;
      else longTermReviews += 1;
    } else {
      assert(
        stateBefore === 0 && retrievability === null && sBefore === null && dBefore === null,
        'INVALID_SEQUENCE',
        `Initial active grade revlog[${index}] has an inconsistent prior memory state`,
        { key },
      );
    }
    sequence.push({
      index,
      time,
      rawTime: time,
      effectiveTime,
      key,
      rating,
      stateBefore,
      elapsedRecordedDays: elapsed,
      elapsedDays,
      shortTerm,
      leftCensored,
      boundaryState: leftCensored ? { stability: sBefore, difficulty: dBefore } : null,
    });
    sequences.set(key, sequence);
  }

  return {
    sequences: [...sequences.entries()].map(([key, reviews]) => ({ key, reviews })),
    stats: {
      totalRows: store.revlog.length,
      activeGradeRows: active.size,
      revokedGradeRows: revoked.size,
      revocationRows: store.revlog.length - active.size - revoked.size,
      cards: sequences.size,
      sameDayReviews,
      trainingReviews: longTermReviews,
      leftCensoredCards,
      clockClampedReviews,
    },
  };
}

export function forgettingCurve(weights, elapsedDays, stability) {
  const decay = -weights[20];
  const factor = roundTo8(Math.exp(Math.log(0.9) / decay) - 1);
  return roundTo8(Math.pow(1 + (factor * elapsedDays) / stability, decay));
}

export function initialState(weights, rating) {
  const index = clamp(rating, 1, 4) - 1;
  return {
    stability: Math.max(weights[index], 0.1),
    difficulty: clamp(roundTo8(weights[4] - Math.exp(weights[5] * index) + 1), D_MIN, D_MAX),
  };
}

export function nextState(weights, state, elapsedDays, rating) {
  const oldS = state.stability;
  const oldD = state.difficulty;
  const retrievability = forgettingCurve(weights, elapsedDays, oldS);
  const deltaD = -weights[6] * (rating - 3);
  const dampedD = oldD + roundTo8(((10 - oldD) * deltaD) / 9);
  const easyDifficulty = roundTo8(weights[4] - Math.exp(weights[5] * 3) + 1);
  const nextD = clamp(
    roundTo8(weights[7] * easyDifficulty + (1 - weights[7]) * dampedD),
    D_MIN,
    D_MAX,
  );

  let nextS;
  if (elapsedDays === 0) {
    const shortTermFactor =
      Math.exp(weights[17] * (rating - 3 + weights[18])) * Math.pow(oldS, -weights[19]);
    nextS = roundTo8(
      clamp(oldS * (rating >= 2 ? Math.max(shortTermFactor, 1) : shortTermFactor), S_MIN, S_MAX),
    );
  } else if (rating === 1) {
    const stabilityAfterFailure = roundTo8(
      clamp(
        weights[11] *
          Math.pow(oldD, -weights[12]) *
          (Math.pow(oldS + 1, weights[13]) - 1) *
          Math.exp((1 - retrievability) * weights[14]),
        S_MIN,
        S_MAX,
      ),
    );
    const nextStabilityMinimum = oldS / Math.exp(weights[17] * weights[18]);
    nextS = clamp(roundTo8(nextStabilityMinimum), S_MIN, stabilityAfterFailure);
  } else {
    const hardPenalty = rating === 2 ? weights[15] : 1;
    const easyBonus = rating === 4 ? weights[16] : 1;
    nextS = roundTo8(
      clamp(
        oldS *
          (Math.exp(weights[8]) *
            (11 - oldD) *
            Math.pow(oldS, -weights[9]) *
            (Math.exp((1 - retrievability) * weights[10]) - 1) *
            hardPenalty *
            easyBonus +
            1),
        S_MIN,
        S_MAX,
      ),
    );
  }
  return { stability: nextS, difficulty: nextD };
}

/** Evaluate long-term prediction loss while retaining short-term state updates. */
export function evaluateWeights(sequences, weights) {
  let lossSum = 0;
  const predictions = [];
  for (const card of sequences) {
    if (card.reviews.length === 0) continue;
    const first = card.reviews[0];
    let state;
    let startIndex;
    if (first.leftCensored) {
      state = first.boundaryState;
      if (first.elapsedDays > 0) {
        const prediction = clamp(
          forgettingCurve(weights, first.elapsedDays, state.stability),
          EPSILON,
          1 - EPSILON,
        );
        const outcome = first.rating === 1 ? 0 : 1;
        lossSum -= outcome * Math.log(prediction) + (1 - outcome) * Math.log(1 - prediction);
        predictions.push({ prediction, outcome, leftCensored: true });
      }
      state = nextState(weights, state, first.elapsedDays, first.rating);
      startIndex = 1;
    } else {
      state = initialState(weights, first.rating);
      startIndex = 1;
    }
    for (let index = startIndex; index < card.reviews.length; index += 1) {
      const review = card.reviews[index];
      if (review.elapsedDays > 0) {
        const prediction = clamp(
          forgettingCurve(weights, review.elapsedDays, state.stability),
          EPSILON,
          1 - EPSILON,
        );
        const outcome = review.rating === 1 ? 0 : 1;
        lossSum -= outcome * Math.log(prediction) + (1 - outcome) * Math.log(1 - prediction);
        predictions.push({ prediction, outcome });
      }
      state = nextState(weights, state, review.elapsedDays, review.rating);
    }
  }
  assert(
    predictions.length > 0,
    'NO_TRAINING_REVIEWS',
    'No long-term recall outcomes remain after reconstruction',
  );
  return { logLoss: lossSum / predictions.length, predictions };
}

function calibration(predictions) {
  const bins = Array.from({ length: 10 }, (_, index) => ({
    lower: index / 10,
    upper: (index + 1) / 10,
    count: 0,
    predictedSum: 0,
    observedSum: 0,
  }));
  for (const item of predictions) {
    const index = Math.min(9, Math.floor(item.prediction * 10));
    bins[index].count += 1;
    bins[index].predictedSum += item.prediction;
    bins[index].observedSum += item.outcome;
  }
  let weightedSquaredGap = 0;
  const populated = bins
    .filter((bin) => bin.count > 0)
    .map((bin) => {
      const meanPredicted = bin.predictedSum / bin.count;
      const observedRetention = bin.observedSum / bin.count;
      const gap = observedRetention - meanPredicted;
      weightedSquaredGap += gap * gap * bin.count;
      return {
        range: `${bin.lower.toFixed(1)}–${bin.upper.toFixed(1)}`,
        count: bin.count,
        meanPredicted: Number(meanPredicted.toFixed(6)),
        observedRetention: Number(observedRetention.toFixed(6)),
        gap: Number(gap.toFixed(6)),
      };
    });
  return {
    rmseBins: Math.sqrt(weightedSquaredGap / predictions.length),
    bins: populated,
  };
}

function clipWeights(weights) {
  return weights.map((weight, index) => clamp(weight, ...PARAMETER_BOUNDS[index]));
}

export function regularizationPenalty(weights, gamma = 1) {
  let sum = 0;
  for (let index = 0; index < weights.length; index += 1) {
    const scaled = (weights[index] - DEFAULT_WEIGHTS[index]) / PARAMETER_STDDEV[index];
    sum += scaled * scaled;
  }
  // fsrs-rs scales each mini-batch penalty by batch_size / total_size. This
  // standalone optimizer is a single full batch, so that factor is exactly 1.
  return gamma * sum;
}

function objective(sequences, weights, gamma) {
  return evaluateWeights(sequences, weights).logLoss + regularizationPenalty(weights, gamma);
}

/** Deterministic central-difference, full-vector Adam fit. */
export function fitWeights(sequences, options = {}) {
  const settings = { ...OPTIMIZER_DEFAULTS, ...options };
  const count = evaluateWeights(sequences, DEFAULT_WEIGHTS).predictions.length;
  assert(
    count >= MINIMUM_TRAINING_REVIEWS,
    'INSUFFICIENT_REVIEWS',
    `Need at least ${MINIMUM_TRAINING_REVIEWS} long-term recall outcomes to fit all 21 FSRS-6 weights; found ${count}`,
    {
      required: MINIMUM_TRAINING_REVIEWS,
      found: count,
    },
  );
  assert(
    Number.isInteger(settings.epochs) && settings.epochs > 0,
    'INVALID_OPTION',
    'epochs must be a positive integer',
  );

  let weights = [...DEFAULT_WEIGHTS];
  let bestWeights = [...weights];
  let bestLoss = evaluateWeights(sequences, weights).logLoss;
  const firstObjective = objective(sequences, weights, settings.regularizationGamma);
  let bestObjective = firstObjective;
  const m = Array(21).fill(0);
  const v = Array(21).fill(0);
  const beta1 = 0.9;
  const beta2 = 0.999;

  for (let epoch = 1; epoch <= settings.epochs; epoch += 1) {
    const gradient = Array(21).fill(0);
    for (let index = 0; index < 21; index += 1) {
      const span = PARAMETER_BOUNDS[index][1] - PARAMETER_BOUNDS[index][0];
      const delta = Math.max(
        1e-6,
        Math.min(span * 1e-4, Math.max(1, Math.abs(weights[index])) * 1e-4),
      );
      const lowerWeights = [...weights];
      const upperWeights = [...weights];
      lowerWeights[index] = clamp(weights[index] - delta, ...PARAMETER_BOUNDS[index]);
      upperWeights[index] = clamp(weights[index] + delta, ...PARAMETER_BOUNDS[index]);
      const denominator = upperWeights[index] - lowerWeights[index];
      if (denominator > 0) {
        gradient[index] =
          (objective(sequences, upperWeights, settings.regularizationGamma) -
            objective(sequences, lowerWeights, settings.regularizationGamma)) /
          denominator;
      }
    }

    const progress = (epoch - 1) / Math.max(1, settings.epochs - 1);
    const learningRate =
      settings.minimumLearningRate +
      0.5 *
        (settings.learningRate - settings.minimumLearningRate) *
        (1 + Math.cos(Math.PI * progress));
    for (let index = 0; index < 21; index += 1) {
      m[index] = beta1 * m[index] + (1 - beta1) * gradient[index];
      v[index] = beta2 * v[index] + (1 - beta2) * gradient[index] * gradient[index];
      const mHat = m[index] / (1 - Math.pow(beta1, epoch));
      const vHat = v[index] / (1 - Math.pow(beta2, epoch));
      weights[index] -= (learningRate * mHat) / (Math.sqrt(vHat) + 1e-8);
    }
    weights = clipWeights(weights);
    const rawLoss = evaluateWeights(sequences, weights).logLoss;
    const currentObjective = rawLoss + regularizationPenalty(weights, settings.regularizationGamma);
    if (currentObjective < bestObjective && rawLoss <= bestLoss) {
      bestObjective = currentObjective;
      bestLoss = rawLoss;
      bestWeights = [...weights];
    }
  }

  assert(
    bestLoss < evaluateWeights(sequences, DEFAULT_WEIGHTS).logLoss,
    'NO_IMPROVEMENT',
    'Optimization did not improve log loss; no candidate weights were emitted',
  );
  return {
    weights: bestWeights.map((weight) => Number(weight.toFixed(8))),
    epochs: settings.epochs,
    initialObjective: firstObjective,
    finalObjective: bestObjective,
  };
}

export function candidatePin(weights) {
  return {
    source: 'tools/fsrs-optimize.mjs',
    algorithm: 'FSRS-6',
    package: 'ts-fsrs',
    pinnedVersion: '5.4.1',
    parameterSetId: 'bunki-fsrs6-r090-personal-v1',
    requestRetention: 0.9,
    w: weights,
    maximumInterval: 36500,
    enableFuzz: false,
    enableShortTerm: true,
    learningSteps: ['1m', '10m'],
    relearningSteps: ['10m'],
    statePrecision: 8,
    reviewTimePolicyId: 'append-order-monotonic-clamp-v1',
  };
}

export function optimizeExport(rawStore, options = {}) {
  const reconstructed = reconstructReviewSequences(rawStore);
  assert(
    reconstructed.stats.trainingReviews >= MINIMUM_TRAINING_REVIEWS,
    'INSUFFICIENT_REVIEWS',
    `Need at least ${MINIMUM_TRAINING_REVIEWS} long-term recall outcomes to fit all 21 FSRS-6 weights; found ${reconstructed.stats.trainingReviews}`,
    { required: MINIMUM_TRAINING_REVIEWS, found: reconstructed.stats.trainingReviews },
  );
  const beforeEvaluation = evaluateWeights(reconstructed.sequences, DEFAULT_WEIGHTS);
  const fit = fitWeights(reconstructed.sequences, options);
  const afterEvaluation = evaluateWeights(reconstructed.sequences, fit.weights);
  const beforeCalibration = calibration(beforeEvaluation.predictions);
  const afterCalibration = calibration(afterEvaluation.predictions);
  return {
    reportVersion: 1,
    input: reconstructed.stats,
    optimizer: {
      algorithm: 'deterministic-full-batch-adam-central-difference-v2',
      loss: 'binary-cross-entropy-plus-fsrs-rs-full-batch-l2',
      ratings: 'Again=0; Hard/Good/Easy=1',
      sameDayPolicy: 'state-update-only; excluded from long-term loss and calibration',
      leftCensoredPolicy:
        'condition on logged (S,D), score the first observed long-term outcome, then continue recurrence',
      reviewTimePolicy:
        'per-card append order; preserve raw time and clamp the FSRS instant to the prior effective anchor',
      regularizationGamma: options.regularizationGamma ?? OPTIMIZER_DEFAULTS.regularizationGamma,
      minimumTrainingReviews: MINIMUM_TRAINING_REVIEWS,
      epochs: fit.epochs,
    },
    before: {
      logLoss: Number(beforeEvaluation.logLoss.toFixed(8)),
      rmseBins: Number(beforeCalibration.rmseBins.toFixed(8)),
      calibration: beforeCalibration.bins,
    },
    after: {
      logLoss: Number(afterEvaluation.logLoss.toFixed(8)),
      rmseBins: Number(afterCalibration.rmseBins.toFixed(8)),
      calibration: afterCalibration.bins,
    },
    delta: {
      logLoss: Number((afterEvaluation.logLoss - beforeEvaluation.logLoss).toFixed(8)),
      rmseBins: Number((afterCalibration.rmseBins - beforeCalibration.rmseBins).toFixed(8)),
    },
    candidatePin: candidatePin(fit.weights),
    dryRun: true,
    applicationNote:
      'Candidate only. This tool never changes Bunki data. Review the report, then let the trunk keeper apply and replay-test any accepted pin.',
  };
}

function pathContainsDataDirectory(path) {
  const absolute = resolve(path);
  return absolute.split(sep).includes('data');
}

async function canonicalizeThroughExistingAncestor(path) {
  const absolute = resolve(path);
  const unresolved = [basename(absolute)];
  let cursor = dirname(absolute);
  for (;;) {
    try {
      const canonicalAncestor = await realpath(cursor);
      return resolve(canonicalAncestor, ...unresolved);
    } catch (error) {
      if (!error || (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')) throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      unresolved.unshift(basename(cursor));
      cursor = parent;
    }
  }
}

async function validateExplicitOutputPath(path) {
  const absolute = resolve(path);
  assert(
    !pathContainsDataDirectory(absolute),
    'DATA_WRITE_REFUSED',
    `Refusing to write inside a data/ directory: ${path}`,
  );
  const canonical = await canonicalizeThroughExistingAncestor(absolute);
  assert(
    !pathContainsDataDirectory(canonical),
    'DATA_WRITE_REFUSED',
    `Refusing to write through a path that resolves inside a data/ directory: ${path}`,
    { canonicalPath: canonical },
  );
  return { absolute, canonical };
}

async function removeOwnedEmptyFile(handle, paths) {
  let opened;
  try {
    opened = await handle.stat();
  } catch {
    return;
  }
  if (opened.size !== 0) return;
  for (const path of new Set(paths.filter(Boolean))) {
    try {
      const current = await stat(path);
      if (current.dev === opened.dev && current.ino === opened.ino) {
        await unlink(path);
        return;
      }
    } catch {
      // The path moved or vanished. Never unlink an unverified replacement.
    }
  }
}

async function writeExplicitOutput(path, value) {
  const checked = await validateExplicitOutputPath(path);
  const flags =
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0);
  let handle;
  let openedCanonical = null;
  let wrote = false;
  try {
    handle = await open(checked.absolute, flags, 0o600);
    // Resolve the opened descriptor before writing any bytes. `/proc` gives us
    // the inode-bound path on Linux; realpath(output) is the portable fallback.
    try {
      openedCanonical = await realpath(`/proc/self/fd/${handle.fd}`);
    } catch {
      openedCanonical = await realpath(checked.absolute);
    }
    const currentCanonical = await realpath(checked.absolute);
    const openedStat = await handle.stat();
    const currentStat = await stat(checked.absolute);
    assert(
      openedCanonical === currentCanonical &&
        openedStat.dev === currentStat.dev &&
        openedStat.ino === currentStat.ino,
      'OUTPUT_PATH_CHANGED',
      `Output path changed while it was being opened: ${path}`,
    );
    assert(
      !pathContainsDataDirectory(openedCanonical),
      'DATA_WRITE_REFUSED',
      `Refusing to write through a path that resolves inside a data/ directory: ${path}`,
      { canonicalPath: openedCanonical },
    );
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' });
    wrote = true;
  } catch (error) {
    if (handle && !wrote) {
      await removeOwnedEmptyFile(handle, [checked.absolute, openedCanonical]);
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

function usage() {
  return [
    'Usage: node tools/fsrs-optimize.mjs <kairo-export.json> [options]',
    '',
    'Options:',
    '  --candidate-out <path>  Write only the candidate pin (must not be under data/).',
    '  --report-out <path>     Write the complete dry-run report (must not be under data/).',
    '  --epochs <n>            Positive deterministic training-epoch count (default 90).',
    '  --help                  Show this help.',
    '',
    'Without output flags, the complete JSON report (including candidatePin) is printed to stdout.',
  ].join('\n');
}

function parseArgs(argv) {
  const parsed = { input: null, candidateOut: null, reportOut: null, epochs: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return { help: true };
    if (arg === '--candidate-out' || arg === '--report-out' || arg === '--epochs') {
      const value = argv[index + 1];
      assert(value !== undefined, 'INVALID_ARGUMENT', `${arg} requires a value`);
      index += 1;
      if (arg === '--candidate-out') parsed.candidateOut = value;
      else if (arg === '--report-out') parsed.reportOut = value;
      else parsed.epochs = Number(value);
    } else if (arg.startsWith('-')) {
      throw new FsrsOptimizeError('INVALID_ARGUMENT', `Unknown option: ${arg}`);
    } else if (parsed.input === null) parsed.input = arg;
    else throw new FsrsOptimizeError('INVALID_ARGUMENT', `Unexpected positional argument: ${arg}`);
  }
  assert(parsed.input, 'INVALID_ARGUMENT', 'An exported Kairo JSON file is required');
  return parsed;
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    if (args.candidateOut) await validateExplicitOutputPath(args.candidateOut);
    if (args.reportOut) await validateExplicitOutputPath(args.reportOut);
    const raw = JSON.parse(await readFile(args.input, 'utf8'));
    const report = optimizeExport(raw, args.epochs === undefined ? {} : { epochs: args.epochs });
    if (args.candidateOut) await writeExplicitOutput(args.candidateOut, report.candidatePin);
    if (args.reportOut) await writeExplicitOutput(args.reportOut, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  } catch (error) {
    const known = error instanceof FsrsOptimizeError;
    const payload = {
      ok: false,
      code: known ? error.code : 'UNEXPECTED_ERROR',
      message: error instanceof Error ? error.message : String(error),
      ...(known ? error.details : {}),
    };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    return known && error.code === 'INSUFFICIENT_REVIEWS' ? 2 : 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = await main();
