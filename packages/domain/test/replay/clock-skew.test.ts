/**
 * F03 replay proof — backward wall-clock movement is durable and deterministic.
 *
 * The adversarial suite probes the UTC boundary and many offsets. This focused
 * replay test belongs under `test:replay`: it proves a descending timestamp
 * sequence produces byte-identical canonical state on both passes while the
 * evidence times remain unchanged.
 */

import { describe, expect, it } from 'vitest';

import {
  compareInstants,
  isValidIsoInstant,
  parseEventLog,
  replay,
  replayTwiceAndCompare,
} from '../../src/index.ts';
import { learnableLog, review, T } from '../support/wp06.ts';

describe('F03 — clock-skew replay determinism', () => {
  it('keeps a first review dated before activation without rewriting its timestamp', () => {
    const rawAt = '2026-07-26T23:59:00.000Z';
    const initial = replay(parseEventLog(learnableLog()));
    const initialMemory = initial.memoryStates.find(
      (candidate) => candidate.contractId === 'contract-meaning',
    );
    expect(initialMemory).toBeDefined();
    if (initialMemory === undefined) return;

    const log = parseEventLog([
      ...learnableLog(),
      review({ eventId: 'clock-first', at: rawAt, contractId: 'contract-meaning' }),
    ]);
    const result = replayTwiceAndCompare(log);
    expect(result.identical).toBe(true);

    const state = replay(log);
    expect(state.observations.find((row) => row.eventId === 'clock-first')?.at).toBe(rawAt);
    expect(state.gateDecisions.find((row) => row.eventId === 'clock-first')).toMatchObject({
      admitted: true,
      at: rawAt,
    });
    expect(
      state.memoryStates.find((candidate) => candidate.contractId === 'contract-meaning'),
    ).toMatchObject({
      admittedReviewCount: 1,
      lastReviewedAt: rawAt,
      schedulerAnchorAt: initialMemory.schedulerAnchorAt,
    });
  });

  it('replays repeated backward reviews to byte-identical state', () => {
    const finalRawAt = '2026-07-25T23:55:00.000Z';
    const log = parseEventLog([
      ...learnableLog(),
      review({ eventId: 'clock-r1', at: T.review1, contractId: 'contract-meaning' }),
      review({
        eventId: 'clock-r2',
        at: '2026-07-26T23:59:00.000Z',
        contractId: 'contract-meaning',
      }),
      review({
        eventId: 'clock-r3',
        at: '2026-07-27T00:03:00.000Z',
        contractId: 'contract-meaning',
      }),
      review({ eventId: 'clock-r4', at: finalRawAt, contractId: 'contract-meaning' }),
    ]);

    const result = replayTwiceAndCompare(log);
    expect(result.identical).toBe(true);
    expect(result.secondJson).toBe(result.firstJson);

    const state = replay(log);
    const reviewVerdicts = state.gateDecisions.filter((decision) =>
      decision.eventId.startsWith('clock-r'),
    );
    expect(reviewVerdicts).toHaveLength(4);
    expect(reviewVerdicts.every((decision) => decision.admitted)).toBe(true);
    expect(reviewVerdicts.at(-1)?.at).toBe(finalRawAt);
    expect(state.observations.find((row) => row.eventId === 'clock-r4')?.at).toBe(finalRawAt);

    const memory = state.memoryStates.find(
      (candidate) => candidate.contractId === 'contract-meaning',
    );
    expect(memory).toMatchObject({
      admittedReviewCount: 4,
      lastReviewedAt: finalRawAt,
      schedulerAnchorAt: T.review1,
    });
    expect(isValidIsoInstant(memory?.dueAt)).toBe(true);
    expect(isValidIsoInstant(memory?.schedulerAnchorAt)).toBe(true);
    if (memory !== undefined) {
      expect(compareInstants(memory.dueAt, memory.schedulerAnchorAt)).toBeGreaterThanOrEqual(0);
    }
  });
});
