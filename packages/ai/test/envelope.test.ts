/**
 * The candidate envelope (WP-07 closure predicate item 1; controller §9).
 *
 * The predicate names a field list, so these tests are about the *shape* being
 * exactly that and nothing more: strict objects, literal-only `taskClass` and
 * `isLabeled`, ceilings that actually reject, and a `targetFormPresent` that is
 * computed rather than believed.
 */

import { describe, expect, it } from 'vitest';

import {
  aiCandidateEnvelopeSchema,
  aiRequestEnvelopeSchema,
  AiRequestValidationError,
  AiResponseValidationError,
  MAX_EXPLANATION_CHARS,
  MAX_TOKENS_CEILING,
  parseAiCandidateEnvelope,
  parseAiRequestEnvelope,
  targetFormPresent,
  TASK_CLASS,
  toCandidateEnvelopeMetadata,
  type AiThreadContext,
} from '../src/index.ts';

const CONTEXT: AiThreadContext = {
  contentClass: 'seeded-fixture',
  targetForm: '分岐',
  excerpt: '子どものころ、私はこの分岐点が好きだった。',
  seedRef: 'pas-bunki-01',
};

const request = (overrides: Record<string, unknown> = {}): unknown => ({
  taskClass: TASK_CLASS,
  inputHash: 'abc123',
  promptFamilyId: 'family',
  promptVersion: '1',
  threadContext: CONTEXT,
  maxTokens: 400,
  ...overrides,
});

const envelope = (overrides: Record<string, unknown> = {}): unknown => ({
  candidateId: 'candidate-0001',
  payload: { targetForm: '分岐', explanation: '分岐 means a branching or fork.' },
  model: 'claude-opus-5',
  provider: 'anthropic',
  promptVersion: '1',
  createdAt: '2026-07-27T09:00:00.000Z',
  checks: { targetFormPresent: true, isLabeled: true },
  ...overrides,
});

describe('the request envelope carries exactly controller §9 fields', () => {
  it('accepts the specified shape', () => {
    const parsed = parseAiRequestEnvelope(request());
    expect(Object.keys(parsed).sort()).toEqual([
      'inputHash',
      'maxTokens',
      'promptFamilyId',
      'promptVersion',
      'taskClass',
      'threadContext',
    ]);
  });

  it('admits no route class other than T2', () => {
    expect(() => parseAiRequestEnvelope(request({ taskClass: 'T3' }))).toThrow(
      AiRequestValidationError,
    );
  });

  it('rejects an unknown key rather than ignoring it', () => {
    expect(() => parseAiRequestEnvelope(request({ userId: 'u-1' }))).toThrow(
      AiRequestValidationError,
    );
  });

  it('caps maxTokens at the structural budget ceiling (OD-08)', () => {
    expect(() => parseAiRequestEnvelope(request({ maxTokens: MAX_TOKENS_CEILING + 1 }))).toThrow(
      AiRequestValidationError,
    );
    expect(parseAiRequestEnvelope(request({ maxTokens: MAX_TOKENS_CEILING })).maxTokens).toBe(
      MAX_TOKENS_CEILING,
    );
  });

  it('has no field that could carry learner history or thread identity', () => {
    const contextFields = Object.keys(aiRequestEnvelopeSchema.shape.threadContext.shape).sort();
    expect(contextFields).toEqual(['contentClass', 'excerpt', 'seedRef', 'targetForm']);
  });

  it('admits only the seeded-fixture content class (OD-08)', () => {
    expect(() =>
      parseAiRequestEnvelope(
        request({ threadContext: { ...CONTEXT, contentClass: 'user-encounter' } }),
      ),
    ).toThrow(AiRequestValidationError);
  });
});

describe('the response envelope carries exactly controller §9 fields', () => {
  it('accepts the specified shape', () => {
    const parsed = parseAiCandidateEnvelope(envelope());
    expect(Object.keys(parsed).sort()).toEqual([
      'candidateId',
      'checks',
      'createdAt',
      'model',
      'payload',
      'promptVersion',
      'provider',
    ]);
  });

  it('makes an unlabeled candidate unrepresentable', () => {
    expect(() =>
      parseAiCandidateEnvelope(envelope({ checks: { targetFormPresent: true, isLabeled: false } })),
    ).toThrow(AiResponseValidationError);
  });

  it('rejects an oversized explanation', () => {
    expect(() =>
      parseAiCandidateEnvelope(
        envelope({
          payload: { targetForm: '分岐', explanation: 'x'.repeat(MAX_EXPLANATION_CHARS + 1) },
        }),
      ),
    ).toThrow(AiResponseValidationError);
  });

  it('rejects a payload that smuggled a grade in beside the text', () => {
    expect(() =>
      parseAiCandidateEnvelope(
        envelope({
          payload: { targetForm: '分岐', explanation: '分岐 is a fork.', grade: 'easy' },
        }),
      ),
    ).toThrow(AiResponseValidationError);
  });

  it('rejects a non-canonical createdAt', () => {
    expect(() => parseAiCandidateEnvelope(envelope({ createdAt: '2026-07-27 09:00' }))).toThrow(
      AiResponseValidationError,
    );
  });

  it('reports field paths in its error, never values', () => {
    const secret = 'the-learner-wrote-this-sentence';
    try {
      parseAiCandidateEnvelope(envelope({ payload: { targetForm: '分岐', note: secret } }));
      expect.unreachable('an unknown payload key must be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(AiResponseValidationError);
      expect(JSON.stringify((error as AiResponseValidationError).issues)).not.toContain(secret);
    }
  });

  it('has no field for confidence, grade, interval, or learner state', () => {
    expect(Object.keys(aiCandidateEnvelopeSchema.shape).sort()).not.toContain('confidence');
    expect(Object.keys(aiCandidateEnvelopeSchema.shape.payload.shape).sort()).toEqual([
      'explanation',
      'targetForm',
    ]);
  });
});

describe('targetFormPresent is computed, not claimed', () => {
  it('is true when the explanation contains the form', () => {
    expect(targetFormPresent({ targetForm: '分岐', explanation: 'A 分岐 is a fork.' })).toBe(true);
  });

  it('is false when it does not', () => {
    expect(targetFormPresent({ targetForm: '分岐', explanation: 'A fork in the road.' })).toBe(
      false,
    );
  });

  it('folds compatibility variants so a full-width answer still counts', () => {
    expect(targetFormPresent({ targetForm: 'ABC', explanation: 'about ＡＢＣ here' })).toBe(true);
  });
});

describe('the metadata handed to CandidateAttached', () => {
  it('is the domain field set, with no payload in it', () => {
    const parsedRequest = parseAiRequestEnvelope(request());
    const metadata = toCandidateEnvelopeMetadata(
      parsedRequest,
      parseAiCandidateEnvelope(envelope()),
    );
    expect(Object.keys(metadata).sort()).toEqual([
      'checks',
      'createdAt',
      'inputHash',
      'model',
      'promptFamilyId',
      'promptVersion',
      'provider',
      'taskClass',
    ]);
    expect(JSON.stringify(metadata)).not.toContain('分岐 means');
  });
});
