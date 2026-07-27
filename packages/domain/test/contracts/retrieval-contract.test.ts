/**
 * `RetrievalContract` validation (WP-06; REQ-DM-05, DL-03).
 *
 * REQ-DM-05's field list is the easy half. The half that matters is the
 * coherence rules: a contract can carry every required field and still be
 * unable to decide whether a response was correct, and grading against a rule
 * that cannot decide is worse than not grading at all — it produces evidence
 * that looks like evidence.
 */

import { describe, expect, it } from 'vitest';

import {
  ContractValidationError,
  checkRetrievalContract,
  parseEvent,
  projectContractCreated,
  retrievalContractFromEvent,
  validateRetrievalContract,
  type ContractCreatedEvent,
  type RetrievalContract,
} from '../../src/index.ts';
import { contractCreated } from '../support/events.ts';
import { COMPONENT, T } from '../support/wp06.ts';

const event = (overrides: Record<string, unknown> = {}): ContractCreatedEvent =>
  parseEvent(
    contractCreated(
      { eventId: 'c1', at: T.contract, contractId: 'contract-1' },
      { targetComponentId: COMPONENT, ...overrides },
    ),
  ) as ContractCreatedEvent;

const valid = (): RetrievalContract => projectContractCreated(event());

describe('REQ-DM-05: the normative minimum, projected from the event', () => {
  it('carries every required field', () => {
    const contract = valid();
    expect(Object.keys(contract).sort()).toEqual([
      'contractId',
      'contractVersion',
      'createdAt',
      'createdByEventId',
      'cueModality',
      'hintPolicy',
      'promptFamilyVersion',
      'responseModality',
      'revealPolicy',
      'scoring',
      'skill',
      'targetComponentId',
    ]);
    expect(contract.createdAt).toBe(T.contract);
    expect(contract.createdByEventId).toBe('c1');
  });

  it('collapses the answers/rubric XOR into one scoring value', () => {
    expect(valid().scoring).toEqual({
      kind: 'accepted_answers',
      acceptedAnswers: ['mountain pass'],
    });

    const rubricEvent = contractCreated(
      { eventId: 'c2', at: T.contract, contractId: 'contract-2' },
      {
        targetComponentId: COMPONENT,
        responseModality: 'free',
        rubricId: 'rubric-1',
        rubricVersion: '2.1.0',
      },
    );
    delete rubricEvent['acceptedAnswers'];

    expect(projectContractCreated(parseEvent(rubricEvent) as ContractCreatedEvent).scoring).toEqual(
      {
        kind: 'rubric',
        rubricId: 'rubric-1',
        rubricVersion: '2.1.0',
      },
    );
  });

  it('accepts a well-formed, scorable contract', () => {
    expect(checkRetrievalContract(valid())).toEqual({ valid: true, issues: [] });
    expect(validateRetrievalContract(valid())).toEqual(valid());
  });
});

describe('coherence rules — a contract that cannot decide is not valid', () => {
  it('rejects a component id no capture could have instantiated', () => {
    const contract = { ...valid(), targetComponentId: 'component-0001' };
    const result = checkRetrievalContract(contract);

    expect(result.valid).toBe(false);
    expect(result.issues[0]?.path).toBe('targetComponentId');
    expect(result.issues[0]?.message).toMatch(/canonical Phase-0 KnowledgeComponent id/);
  });

  it('rejects a bare namespace prefix — the component of an empty target', () => {
    expect(checkRetrievalContract({ ...valid(), targetComponentId: 'kc:' }).valid).toBe(false);
  });

  it('rejects a hint policy that allows a hint it never grants', () => {
    const result = checkRetrievalContract({
      ...valid(),
      hintPolicy: { hintsAllowed: true, maxHints: 0 },
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.path).toBe('hintPolicy.maxHints');
  });

  it('rejects a hint budget that contradicts a no-hints policy', () => {
    expect(
      checkRetrievalContract({ ...valid(), hintPolicy: { hintsAllowed: false, maxHints: 2 } })
        .valid,
    ).toBe(false);
  });

  it('rejects a free response scored against a closed answer list', () => {
    const result = checkRetrievalContract({ ...valid(), responseModality: 'free' });
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.message).toMatch(/rubricId \+ rubricVersion/);
  });

  it('reports every issue at once rather than one per run', () => {
    const result = checkRetrievalContract({
      ...valid(),
      targetComponentId: 'component-0001',
      responseModality: 'free',
      hintPolicy: { hintsAllowed: true, maxHints: 0 },
    });
    expect(result.issues).toHaveLength(3);
  });

  it('throws with all of them attached when asked to validate', () => {
    try {
      validateRetrievalContract({ ...valid(), targetComponentId: 'nope' });
      expect.unreachable('expected a ContractValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ContractValidationError);
      expect((error as ContractValidationError).code).toBe('CONTRACT_VALIDATION_FAILED');
      expect((error as ContractValidationError).contractId).toBe('contract-1');
    }
  });

  it('rejects a shape that is not a contract at all', () => {
    expect(checkRetrievalContract(null).valid).toBe(false);
    expect(checkRetrievalContract({ contractId: 'x' }).valid).toBe(false);
    // Strict: an unrecognised key is a rejection, same as the event schemas.
    expect(checkRetrievalContract({ ...valid(), extra: true }).valid).toBe(false);
  });

  it('rejects a contract version below 1', () => {
    expect(checkRetrievalContract({ ...valid(), contractVersion: 0 }).valid).toBe(false);
  });
});

describe('building from an event reports rather than throws', () => {
  it('returns the contract and no issues when it is scorable', () => {
    const result = retrievalContractFromEvent(event());
    expect(result.valid).toBe(true);
    expect(result.contract.contractId).toBe('contract-1');
  });

  it('returns the contract *and* the issues when it is not', () => {
    // A structurally valid ContractCreated naming a component nothing captured:
    // the record is real and belongs in the log; the contract cannot grade.
    const result = retrievalContractFromEvent(event({ targetComponentId: 'component-legacy' }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues).toHaveLength(1);
      expect(result.contract.contractId).toBe('contract-1');
    }
  });
});
