/**
 * Promotion blockers for versioned retrieval evidence.
 *
 * These fixtures intentionally enter through parse + replay. A minter-only test
 * cannot prove that imported or restarted logs are held to the same authority
 * boundary as events created in this process.
 */

import { describe, expect, it } from 'vitest';

import { bindRetrievalContract, parseEventLog, replay } from '../../src/index.ts';
import { capture, learnableLog, meaningContract, promote, review, T } from '../support/wp06.ts';

type Raw = Record<string, unknown>;

const POLICY = 'accepted_answers:nfkc_trim@1';

function verifiedReview(overrides: Raw = {}): Raw {
  return {
    eventId: 'ev-review-v2',
    v: 2,
    occurredAt: T.review1,
    idempotencyKey: 'idem-ev-review-v2',
    type: 'ReviewGraded',
    contractId: 'contract-meaning',
    response: 'mountain pass',
    effort: 'good',
    grade: 'good',
    latencyMs: 4200,
    hintsUsed: 0,
    revealedBeforeRecall: false,
    probeContext: 'standalone',
    tier: 'A',
    graderProof: {
      grader: 'accepted_answers',
      policyVersion: POLICY,
      contractVersion: 1,
      responseModality: 'text',
      normalizedResponse: 'mountain pass',
      decision: 'correct',
      acceptedAnswerIndex: 0,
    },
    ...overrides,
  };
}

function run(raw: readonly Raw[]) {
  return replay(parseEventLog(raw, { path: '<verified-review-grade>' }));
}

describe('ReviewGraded replay migration', () => {
  it('keeps v1 lossless but removes its unproved FSRS authority', () => {
    const legacy = review({
      eventId: 'ev-review-v1',
      at: T.review1,
      contractId: 'contract-meaning',
      grade: 'good',
    });
    const parsed = parseEventLog([...learnableLog(), legacy]);
    expect(parsed.at(-1)).toEqual(legacy);

    const state = replay(parsed);
    expect(state.gateDecisions.at(-1)).toMatchObject({
      eventId: 'ev-review-v1',
      admitted: false,
      reason: 'response_unverified',
    });
    expect(
      state.memoryStates.find((memory) => memory.contractId === 'contract-meaning'),
    ).toMatchObject({ reps: 0, admittedReviewCount: 0 });
  });

  it('admits a correct v2 response only after independently checking its proof', () => {
    const state = run([...learnableLog(), verifiedReview()]);

    expect(state.gateDecisions.at(-1)).toMatchObject({
      eventId: 'ev-review-v2',
      admitted: true,
      effectiveGrade: 'good',
    });
    expect(
      state.memoryStates.find((memory) => memory.contractId === 'contract-meaning'),
    ).toMatchObject({ reps: 1, admittedReviewCount: 1 });
  });

  it('derives Again from a wrong response even when the learner chose Good effort', () => {
    const state = run([
      ...learnableLog(),
      verifiedReview({
        response: 'a valley',
        grade: 'again',
        graderProof: {
          grader: 'accepted_answers',
          policyVersion: POLICY,
          contractVersion: 1,
          responseModality: 'text',
          normalizedResponse: 'a valley',
          decision: 'incorrect',
          acceptedAnswerIndex: null,
        },
      }),
    ]);

    expect(state.gateDecisions.at(-1)).toMatchObject({
      admitted: true,
      effectiveGrade: 'again',
    });
  });

  it.each([
    [
      'normalized response',
      {
        graderProof: {
          grader: 'accepted_answers',
          policyVersion: POLICY,
          contractVersion: 1,
          responseModality: 'text',
          normalizedResponse: 'forged',
          decision: 'correct',
          acceptedAnswerIndex: 0,
        },
      },
      'grader_proof_mismatch',
    ],
    [
      'contract version',
      {
        graderProof: {
          grader: 'accepted_answers',
          policyVersion: POLICY,
          contractVersion: 99,
          responseModality: 'text',
          normalizedResponse: 'mountain pass',
          decision: 'correct',
          acceptedAnswerIndex: 0,
        },
      },
      'contract_version_mismatch',
    ],
    [
      'policy version',
      {
        graderProof: {
          grader: 'accepted_answers',
          policyVersion: 'caller_policy@999',
          contractVersion: 1,
          responseModality: 'text',
          normalizedResponse: 'mountain pass',
          decision: 'correct',
          acceptedAnswerIndex: 0,
        },
      },
      'grading_policy_mismatch',
    ],
    [
      'derived grade',
      {
        response: 'a valley',
        grade: 'good',
        graderProof: {
          grader: 'accepted_answers',
          policyVersion: POLICY,
          contractVersion: 1,
          responseModality: 'text',
          normalizedResponse: 'a valley',
          decision: 'incorrect',
          acceptedAnswerIndex: null,
        },
      },
      'grade_not_derived_from_proof',
    ],
  ] as const)('rejects a tampered %s', (_label, overrides, reason) => {
    const state = run([...learnableLog(), verifiedReview(overrides)]);
    expect(state.gateDecisions.at(-1)).toMatchObject({ admitted: false, reason });
    expect(
      state.memoryStates.find((memory) => memory.contractId === 'contract-meaning'),
    ).toMatchObject({ reps: 0, admittedReviewCount: 0 });
  });
});

describe('source-bound scheduler lineage', () => {
  it('rejects an imported v2 review when two pre-contract encounters are eligible origins', () => {
    const secondCapture = capture({
      eventId: 'ev-capture-2',
      idempotencyKey: 'idem-ev-capture-2',
      encounterId: 'encounter-2',
      occurredAt: '2026-07-27T09:00:30.000Z',
    });
    const log = [capture(), secondCapture, promote('learn'), meaningContract()];
    const parsedBeforeReview = parseEventLog(log);

    expect(bindRetrievalContract(parsedBeforeReview, 'contract-meaning')).toMatchObject({
      bound: false,
      failure: { reason: 'origin_ambiguous' },
    });

    const state = run([...log, verifiedReview()]);
    expect(state.gateDecisions.at(-1)).toMatchObject({
      admitted: false,
      reason: 'source_lineage_unverified',
    });
    expect(
      state.memoryStates.find((memory) => memory.contractId === 'contract-meaning'),
    ).toBeUndefined();
  });
});
