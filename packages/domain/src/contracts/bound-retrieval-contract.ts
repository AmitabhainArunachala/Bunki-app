/**
 * Source-bound retrieval contracts for KAIRO A1.
 *
 * ADR-002 has no contract -> encounter edge. This projection does not invent
 * one: it succeeds only when the existing events determine one component owner
 * and that owner captured the target before the contract was created.
 */

import type {
  ContractCreatedEvent,
  DomainEvent,
  EncounterCapturedEvent,
} from '../events/catalog.ts';
import type { ProvenanceRecord, SourceRef, Span } from '../events/shared.ts';
import type { ContractId, EncounterId, EventId, ThreadId } from '../primitives.ts';
import { componentIdOfEncounter, targetKeyOfEncounter } from './component-identity.ts';
import {
  gradingMethodOfContractCreated,
  retrievalContractFromEvent,
  type ContractValidationIssue,
  type GradingMethod,
  type RetrievalContract,
} from './retrieval-contract.ts';

export interface BoundRetrievalContract {
  readonly contract: RetrievalContract;
  readonly threadId: ThreadId;
  readonly originEncounterId: EncounterId;
  /** Same-component encounters after the origin, kept distinct in log order. */
  readonly subsequentEncounterIds: readonly EncounterId[];
  /** Exact source evidence from the origin encounter. */
  readonly sourceRef: SourceRef;
  readonly span: Span | null;
  readonly provenance: ProvenanceRecord;
  /** Exact selected substring, or the whole encounter when no span exists. */
  readonly targetText: string;
  readonly gradingMethod: GradingMethod;
}

export type BoundRetrievalContractFailure =
  | {
      readonly reason: 'contract_missing';
      readonly contractId: ContractId;
    }
  | {
      readonly reason: 'contract_ambiguous';
      readonly contractId: ContractId;
      readonly eventIds: readonly EventId[];
    }
  | {
      readonly reason: 'contract_invalid';
      readonly contractId: ContractId;
      readonly issues: readonly ContractValidationIssue[];
    }
  | {
      readonly reason: 'component_missing';
      readonly contractId: ContractId;
      readonly targetComponentId: string;
    }
  | {
      readonly reason: 'thread_ambiguous';
      readonly contractId: ContractId;
      readonly targetComponentId: string;
      readonly threadIds: readonly ThreadId[];
      readonly encounterIds: readonly EncounterId[];
    }
  | {
      readonly reason: 'contract_precedes_origin';
      readonly contractId: ContractId;
      readonly targetComponentId: string;
      readonly threadId: ThreadId;
      readonly encounterIds: readonly EncounterId[];
    };

export type BoundRetrievalContractResult =
  | { readonly bound: true; readonly value: BoundRetrievalContract }
  | { readonly bound: false; readonly failure: BoundRetrievalContractFailure };

function failed(failure: BoundRetrievalContractFailure): BoundRetrievalContractResult {
  return Object.freeze({ bound: false as const, failure: Object.freeze(failure) });
}

function freezeGradingMethod(method: GradingMethod): GradingMethod {
  if (method.kind === 'accepted_answers') {
    return Object.freeze({
      kind: method.kind,
      acceptedAnswers: Object.freeze([...method.acceptedAnswers]),
    });
  }
  return Object.freeze({ ...method });
}

function freezeContract(contract: RetrievalContract): RetrievalContract {
  const scoring =
    contract.scoring.kind === 'accepted_answers'
      ? Object.freeze({
          kind: contract.scoring.kind,
          acceptedAnswers: Object.freeze([...contract.scoring.acceptedAnswers]),
        })
      : Object.freeze({ ...contract.scoring });
  return Object.freeze({
    ...contract,
    scoring,
    hintPolicy: Object.freeze({ ...contract.hintPolicy }),
    revealPolicy: Object.freeze({ ...contract.revealPolicy }),
  });
}

const capturesOfComponent = (
  events: readonly DomainEvent[],
  contract: ContractCreatedEvent,
): readonly EncounterCapturedEvent[] =>
  events.filter(
    (event): event is EncounterCapturedEvent =>
      event.type === 'EncounterCaptured' &&
      componentIdOfEncounter(event) === contract.targetComponentId,
  );

/**
 * Bind one contract id to source lineage using only the supplied canonical log.
 *
 * The component owner is resolved over the log as a whole. Re-encounters on
 * that same thread are not ambiguous; a second thread is. The origin is the
 * earliest matching capture before `ContractCreated`, so a later capture can
 * never retroactively make a previously ungrounded contract look grounded.
 */
export function bindRetrievalContract(
  events: readonly DomainEvent[],
  contractId: ContractId,
): BoundRetrievalContractResult {
  const matches = events.filter(
    (event): event is ContractCreatedEvent =>
      event.type === 'ContractCreated' && event.contractId === contractId,
  );
  if (matches.length === 0) return failed({ reason: 'contract_missing', contractId });
  if (matches.length > 1) {
    return failed({
      reason: 'contract_ambiguous',
      contractId,
      eventIds: Object.freeze(matches.map((event) => event.eventId)),
    });
  }

  const contractEvent = matches[0];
  if (contractEvent === undefined) return failed({ reason: 'contract_missing', contractId });
  const entity = retrievalContractFromEvent(contractEvent);
  if (!entity.valid) {
    return failed({
      reason: 'contract_invalid',
      contractId,
      issues: Object.freeze(entity.issues.map((issue) => Object.freeze({ ...issue }))),
    });
  }

  const captures = capturesOfComponent(events, contractEvent);
  if (captures.length === 0) {
    return failed({
      reason: 'component_missing',
      contractId,
      targetComponentId: contractEvent.targetComponentId,
    });
  }

  const threadIds = [...new Set(captures.map((capture) => capture.threadId))];
  if (threadIds.length !== 1) {
    return failed({
      reason: 'thread_ambiguous',
      contractId,
      targetComponentId: contractEvent.targetComponentId,
      threadIds: Object.freeze(threadIds),
      encounterIds: Object.freeze(captures.map((capture) => capture.encounterId)),
    });
  }

  const threadId = threadIds[0];
  if (threadId === undefined) {
    return failed({
      reason: 'component_missing',
      contractId,
      targetComponentId: contractEvent.targetComponentId,
    });
  }
  const contractIndex = events.indexOf(contractEvent);
  const origin = captures.find(
    (capture) => capture.threadId === threadId && events.indexOf(capture) < contractIndex,
  );
  if (origin === undefined) {
    return failed({
      reason: 'contract_precedes_origin',
      contractId,
      targetComponentId: contractEvent.targetComponentId,
      threadId,
      encounterIds: Object.freeze(captures.map((capture) => capture.encounterId)),
    });
  }

  const subsequentEncounterIds = captures
    .filter((capture) => capture !== origin)
    .map((capture) => capture.encounterId);
  const gradingMethod = freezeGradingMethod(gradingMethodOfContractCreated(contractEvent));
  const span = origin.span === undefined ? null : Object.freeze({ ...origin.span });
  const value: BoundRetrievalContract = Object.freeze({
    contract: freezeContract(entity.contract),
    threadId,
    originEncounterId: origin.encounterId,
    subsequentEncounterIds: Object.freeze(subsequentEncounterIds),
    sourceRef: Object.freeze({ ...origin.sourceRef }),
    span,
    provenance: Object.freeze({ ...origin.provenance }),
    targetText: targetKeyOfEncounter(origin),
    gradingMethod,
  });
  return Object.freeze({ bound: true as const, value });
}
