/** Stable, data-supplied Learn contract creation for KAIRO A1. */

import { describe, expect, it } from 'vitest';

import {
  ContractValidationError,
  createDeterministicContext,
  createLearnContractPair,
  learnContractIdentity,
  learnContractMatchesSpecification,
  parseEvent,
  type EncounterCapturedEvent,
  type LearnContractPairSpecification,
} from '../../src/index.ts';
import { encounterCaptured } from '../support/events.ts';
import { AT } from '../support/events.ts';

const TARGET = '分岐';
const THREAD = 'thread-learn';

const capture = (): EncounterCapturedEvent =>
  parseEvent(
    encounterCaptured(
      { eventId: 'ev-capture', encounterId: 'enc-capture', threadId: THREAD, at: AT.t0 },
      {
        text: `今日の${TARGET}で道を選ぶ。`,
        span: { start: 3, end: 3 + TARGET.length },
      },
    ),
  ) as EncounterCapturedEvent;

const SPEC: LearnContractPairSpecification = {
  specificationId: 'seed:lexeme-bunki',
  specificationVersion: 3,
  reading: {
    cueModality: 'text',
    responseModality: 'text',
    gradingMethod: { kind: 'accepted_answers', acceptedAnswers: ['ぶんき'] },
    hintPolicy: { hintsAllowed: true, maxHints: 1 },
    revealPolicy: { revealAllowed: true, revealIsRecorded: true },
    promptFamilyVersion: 'orthography-reading@3',
  },
  meaning: {
    cueModality: 'text',
    responseModality: 'choice',
    gradingMethod: { kind: 'accepted_answers', acceptedAnswers: ['branching', 'fork'] },
    hintPolicy: { hintsAllowed: true, maxHints: 1 },
    revealPolicy: { revealAllowed: true, revealIsRecorded: true },
    promptFamilyVersion: 'form-meaning@3',
  },
};

const context = (prefix: string) =>
  createDeterministicContext({
    instants: [AT.t1, AT.t2, AT.t3, AT.t4],
    idPrefix: prefix,
  });

describe('stable Learn contract pair', () => {
  it('creates exactly reading and meaning contracts from supplied versioned data', () => {
    const events = createLearnContractPair(context('one-'), capture(), SPEC);

    expect(events.map((event) => event.skill)).toEqual([
      'orthography_to_reading',
      'form_to_meaning',
    ]);
    expect(events.map((event) => event.contractVersion)).toEqual([3, 3]);
    expect(events.map((event) => event.targetComponentId)).toEqual(['kc:分岐', 'kc:分岐']);
    expect(events[0]?.acceptedAnswers).toEqual(['ぶんき']);
    expect(events[1]?.acceptedAnswers).toEqual(['branching', 'fork']);
    expect(events[0]?.promptFamilyVersion).toBe('orthography-reading@3');
    expect(events[1]?.promptFamilyVersion).toBe('form-meaning@3');
  });

  it('derives stable ids and idempotency keys independently of clock and event ids', () => {
    const first = createLearnContractPair(context('one-'), capture(), SPEC);
    const second = createLearnContractPair(context('two-'), capture(), SPEC);

    expect(second.map((event) => event.contractId)).toEqual(first.map((event) => event.contractId));
    expect(second.map((event) => event.idempotencyKey)).toEqual(
      first.map((event) => event.idempotencyKey),
    );
    expect(first[0]?.eventId).not.toBe(second[0]?.eventId);

    expect(learnContractIdentity(THREAD, SPEC, 'orthography_to_reading')).toEqual({
      contractId: first[0]?.contractId,
      idempotencyKey: first[0]?.idempotencyKey,
    });
  });

  it('makes a new specification version a distinct immutable contract pair', () => {
    const v3 = createLearnContractPair(context('v3-'), capture(), SPEC);
    const v4 = createLearnContractPair(context('v4-'), capture(), {
      ...SPEC,
      specificationVersion: 4,
    });

    expect(v4.map((event) => event.contractId)).not.toEqual(v3.map((event) => event.contractId));
    expect(v4.map((event) => event.contractVersion)).toEqual([4, 4]);
  });

  it('detects a stable-id collision whose grading data does not match the specification', () => {
    const [reading] = createLearnContractPair(context('one-'), capture(), SPEC);
    expect(
      learnContractMatchesSpecification(reading, capture(), SPEC, 'orthography_to_reading'),
    ).toBe(true);
    expect(
      learnContractMatchesSpecification(
        { ...reading, acceptedAnswers: ['fabricated'] },
        capture(),
        SPEC,
        'orthography_to_reading',
      ),
    ).toBe(false);
  });

  it('validates the whole pair before returning an unscorable contract', () => {
    const invalid: LearnContractPairSpecification = {
      ...SPEC,
      reading: {
        ...SPEC.reading,
        responseModality: 'free',
      },
    };
    expect(() => createLearnContractPair(context('bad-'), capture(), invalid)).toThrow(
      ContractValidationError,
    );
  });
});
