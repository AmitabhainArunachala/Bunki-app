/**
 * **T-05 — A missed reading does not erase known meaning.**
 *
 * Controller §17.1, REQ-DM-08, P0-CAP-08. Two abilities, two contracts, two
 * memory states. Conflating them is the single most common way an SRS lies to
 * a learner: you forget one reading of a kanji and the app tells you that you
 * have forgotten the word.
 *
 * `MemoryState` is keyed by `contractId`, so the separation is structural
 * rather than defended by a rule. That makes this suite's job to prove the
 * structure is actually reachable end to end: the same target, the same
 * KnowledgeComponent, two contracts differing only in `skill`, and a failure on
 * one leaving the other's schedule byte-identical.
 */

import { describe, expect, it } from 'vitest';

import {
  COMPONENT,
  T,
  decisionOf,
  learnableLog,
  memoryStateOf,
  review,
  run,
} from '../support/wp06.ts';

describe('T-05: a missed reading does not erase known meaning', () => {
  it('meaning and reading are distinct contracts on one component', () => {
    const state = run(learnableLog());

    const contracts = state.contracts;
    expect(contracts).toHaveLength(2);
    expect(contracts.every((contract) => contract.targetComponentId === COMPONENT)).toBe(true);
    expect(contracts.map((contract) => contract.skill).sort()).toEqual([
      'form_to_meaning',
      'orthography_to_reading',
    ]);
    // Distinct ids, so distinct schedules.
    expect(new Set(contracts.map((contract) => contract.contractId)).size).toBe(2);
  });

  it('a failure on the reading leaves the meaning contract untouched', () => {
    const base = [
      ...learnableLog(),
      review({ eventId: 'ev-meaning-1', at: T.review1, contractId: 'contract-meaning' }),
    ];

    const before = memoryStateOf(run(base), 'contract-meaning');

    const after = memoryStateOf(
      run([
        ...base,
        review({
          eventId: 'ev-reading-fail',
          at: T.review2,
          contractId: 'contract-reading',
          grade: 'again',
        }),
      ]),
      'contract-meaning',
    );

    // Byte-identical, not merely "similar": the reading miss changed nothing at
    // all about what the system believes the learner knows of the meaning.
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it('and the reading contract records the lapse on itself', () => {
    const state = run([
      ...learnableLog(),
      review({ eventId: 'ev-meaning-1', at: T.review1, contractId: 'contract-meaning' }),
      review({ eventId: 'ev-reading-1', at: T.review1, contractId: 'contract-reading' }),
      review({
        eventId: 'ev-reading-fail',
        at: T.review3,
        contractId: 'contract-reading',
        grade: 'again',
      }),
    ]);

    expect(decisionOf(state, 'ev-reading-fail')).toMatchObject({
      admitted: true,
      contractId: 'contract-reading',
      effectiveGrade: 'again',
    });

    const reading = memoryStateOf(state, 'contract-reading');
    const meaning = memoryStateOf(state, 'contract-meaning');
    expect(reading?.admittedReviewCount).toBe(2);
    expect(meaning?.admittedReviewCount).toBe(1);
    expect(reading?.difficulty).toBeGreaterThan(meaning?.difficulty ?? 0);
  });

  it('a grade is admitted for exactly one contract id', () => {
    const state = run([
      ...learnableLog(),
      review({ eventId: 'ev-reading-1', at: T.review1, contractId: 'contract-reading' }),
    ]);

    const admitted = state.gateDecisions.filter((decision) => decision.admitted);
    expect(admitted).toHaveLength(1);
    expect(admitted[0]?.contractId).toBe('contract-reading');
    // The meaning contract is activated but never reviewed.
    expect(memoryStateOf(state, 'contract-meaning')?.phase).toBe('new');
  });
});
