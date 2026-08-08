/**
 * A1 source anchoring for a retrieval contract.
 *
 * ADR-002 deliberately carries no contract -> encounter edge. The projection
 * therefore earns that edge only when the existing log determines one durable
 * thread and exactly one matching pre-contract capture as the origin.
 */

import { describe, expect, it } from 'vitest';

import { bindRetrievalContract, componentIdForTargetKey, parseEventLog } from '../../src/index.ts';
import { contractCreated, encounterCaptured } from '../support/events.ts';
import { AT, READER_SOURCE, USER_PROVENANCE } from '../support/events.ts';

const TARGET = '分岐';
const COMPONENT = componentIdForTargetKey(TARGET);
const THREAD = 'thread-source-anchored';

const capture = (
  eventId: string,
  encounterId: string,
  at: string,
  overrides: Record<string, unknown> = {},
) =>
  encounterCaptured(
    { eventId, encounterId, threadId: THREAD, at },
    {
      text: `今日の${TARGET}で道を選ぶ。`,
      span: { start: 3, end: 3 + TARGET.length },
      ...overrides,
    },
  );

const contract = (overrides: Record<string, unknown> = {}) =>
  contractCreated(
    { eventId: 'ev-contract', at: AT.t2, contractId: 'contract-source-anchored' },
    { targetComponentId: COMPONENT, ...overrides },
  );

describe('BoundRetrievalContract source lineage', () => {
  it('projects one immutable normalized contract with its exact origin evidence', () => {
    const log = parseEventLog([capture('ev-origin', 'enc-origin', AT.t0), contract()]);
    const result = bindRetrievalContract(log, 'contract-source-anchored');

    expect(result.bound).toBe(true);
    if (!result.bound) return;

    expect(result.value).toMatchObject({
      threadId: THREAD,
      originEncounterId: 'enc-origin',
      targetText: TARGET,
      sourceRef: READER_SOURCE,
      span: { start: 3, end: 5 },
      provenance: USER_PROVENANCE,
      gradingMethod: {
        kind: 'accepted_answers',
        acceptedAnswers: ['mountain pass'],
      },
      subsequentEncounterIds: [],
    });
    expect(result.value.contract.contractId).toBe('contract-source-anchored');
    expect(result.value.contract.targetComponentId).toBe(COMPONENT);

    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.contract)).toBe(true);
    expect(Object.isFrozen(result.value.contract.scoring)).toBe(true);
    expect(Object.isFrozen(result.value.sourceRef)).toBe(true);
    expect(Object.isFrozen(result.value.span)).toBe(true);
    expect(Object.isFrozen(result.value.provenance)).toBe(true);
    expect(Object.isFrozen(result.value.gradingMethod)).toBe(true);
    expect(Object.isFrozen(result.value.subsequentEncounterIds)).toBe(true);
  });

  it('derives an explicit versioned-rubric grading method', () => {
    const rawContract = contract({
      responseModality: 'free',
      rubricId: 'rubric-sense',
      rubricVersion: '2.1.0',
    });
    delete rawContract['acceptedAnswers'];

    const result = bindRetrievalContract(
      parseEventLog([capture('ev-origin', 'enc-origin', AT.t0), rawContract]),
      'contract-source-anchored',
    );

    expect(result.bound).toBe(true);
    if (result.bound) {
      expect(result.value.gradingMethod).toEqual({
        kind: 'versioned_rubric',
        rubricId: 'rubric-sense',
        rubricVersion: '2.1.0',
      });
    }
  });

  it('keeps post-contract same-thread re-encounters separate from the unique origin', () => {
    const log = parseEventLog([
      capture('ev-origin', 'enc-origin', AT.t0),
      contract(),
      capture('ev-after', 'enc-after', AT.t3, {
        text: `${TARGET}を思い出す。`,
        span: { start: 0, end: TARGET.length },
      }),
    ]);

    const result = bindRetrievalContract(log, 'contract-source-anchored');
    expect(result.bound).toBe(true);
    if (result.bound) {
      expect(result.value.originEncounterId).toBe('enc-origin');
      expect(result.value.subsequentEncounterIds).toEqual(['enc-after']);
      // Origin evidence stays exact; a later body is never substituted for it.
      expect(result.value.sourceRef).toEqual(READER_SOURCE);
      expect(result.value.span).toEqual({ start: 3, end: 5 });
      expect(result.value.targetText).toBe(TARGET);
    }
  });

  it('fails closed when multiple pre-contract encounters could be the source origin', () => {
    const secondSource = capture('ev-before', 'enc-before', AT.t1, {
      text: `また${TARGET}に来た。`,
      span: { start: 2, end: 2 + TARGET.length },
      sourceRef: {
        sourceId: 'reader-second-source',
        kind: 'text',
        locator: 'article-9#p4',
      },
      provenance: { ...USER_PROVENANCE, sourceVersion: 'second-source-v2' },
    });
    const result = bindRetrievalContract(
      parseEventLog([capture('ev-origin', 'enc-origin', AT.t0), secondSource, contract()]),
      'contract-source-anchored',
    );

    expect(result).toMatchObject({
      bound: false,
      failure: {
        reason: 'origin_ambiguous',
        contractId: 'contract-source-anchored',
        targetComponentId: COMPONENT,
        threadId: THREAD,
        encounterIds: ['enc-origin', 'enc-before'],
      },
    });
  });

  it('fails closed when different durable threads claim the component', () => {
    const rival = capture('ev-rival', 'enc-rival', AT.t1, { threadId: 'thread-rival' });
    const result = bindRetrievalContract(
      parseEventLog([capture('ev-origin', 'enc-origin', AT.t0), rival, contract()]),
      'contract-source-anchored',
    );

    expect(result).toMatchObject({
      bound: false,
      failure: {
        reason: 'thread_ambiguous',
        contractId: 'contract-source-anchored',
        threadIds: [THREAD, 'thread-rival'],
      },
    });
  });

  it('distinguishes a missing component from a contract written before its origin', () => {
    const missing = bindRetrievalContract(parseEventLog([contract()]), 'contract-source-anchored');
    expect(missing).toMatchObject({
      bound: false,
      failure: { reason: 'component_missing' },
    });

    const backwards = bindRetrievalContract(
      parseEventLog([contract(), capture('ev-late', 'enc-late', AT.t3)]),
      'contract-source-anchored',
    );
    expect(backwards).toMatchObject({
      bound: false,
      failure: { reason: 'contract_precedes_origin', encounterIds: ['enc-late'] },
    });
  });

  it('returns typed failures for a missing or duplicate contract record', () => {
    const captureOnly = parseEventLog([capture('ev-origin', 'enc-origin', AT.t0)]);
    expect(bindRetrievalContract(captureOnly, 'contract-nope')).toMatchObject({
      bound: false,
      failure: { reason: 'contract_missing', contractId: 'contract-nope' },
    });

    const duplicate = contractCreated(
      { eventId: 'ev-contract-2', at: AT.t3, contractId: 'contract-source-anchored' },
      { targetComponentId: COMPONENT },
    );
    expect(
      bindRetrievalContract(
        parseEventLog([capture('ev-origin', 'enc-origin', AT.t0), contract(), duplicate]),
        'contract-source-anchored',
      ),
    ).toMatchObject({
      bound: false,
      failure: { reason: 'contract_ambiguous', eventIds: ['ev-contract', 'ev-contract-2'] },
    });
  });
});
