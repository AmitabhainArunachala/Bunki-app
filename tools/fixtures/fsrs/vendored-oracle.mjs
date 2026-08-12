#!/usr/bin/env node

/** Native-Node oracle for optimizer tests; all results come from the pinned vendor bundle. */

import { readFileSync } from 'node:fs';
import process from 'node:process';

import {
  FSRSAlgorithm,
  forgetting_curve as forgettingCurve,
} from '../../../prototypes/corridor/vendor/ts-fsrs.mjs';

const request = JSON.parse(readFileSync(0, 'utf8'));
const algorithm = new FSRSAlgorithm({
  w: request.weights,
  enable_short_term: true,
});

process.stdout.write(
  `${JSON.stringify({
    initial: request.initialRatings.map((rating) => algorithm.next_state(null, 0, rating)),
    forgetting: request.forgetting.map(({ elapsedDays, stability }) =>
      forgettingCurve(request.weights, elapsedDays, stability),
    ),
    transitions: request.transitions.map(({ state, elapsedDays, rating }) =>
      algorithm.next_state(state, elapsedDays, rating),
    ),
  })}\n`,
);
