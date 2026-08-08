/** Stable, versioned reading + meaning contract creation for explicit Learn. */

import type { DomainContext } from '../context/index.ts';
import { ContractValidationError } from '../errors.ts';
import type { ContractCreatedEvent, EncounterCapturedEvent } from '../events/catalog.ts';
import { createDomainEvent } from '../events/factories.ts';
import type { HintPolicy, RevealPolicy } from '../events/shared.ts';
import type { ContractId, ThreadId } from '../primitives.ts';
import { componentIdOfEncounter } from './component-identity.ts';
import {
  validateRetrievalContract,
  type GradingMethod,
  type Modality,
  type RetrievalContract,
} from './retrieval-contract.ts';

export type LearnContractSkill = 'orthography_to_reading' | 'form_to_meaning';

/** Every judgement-bearing field is supplied as versioned data, never invented by the app. */
export interface LearnContractDefinition {
  readonly cueModality: Modality;
  readonly responseModality: Modality;
  readonly gradingMethod: GradingMethod;
  readonly hintPolicy: HintPolicy;
  readonly revealPolicy: RevealPolicy;
  readonly promptFamilyVersion: string;
}

export interface LearnContractPairSpecification {
  /** Stable data identity, e.g. a seed lexeme/release key. */
  readonly specificationId: string;
  /** Version for this immutable pair; changing it creates a new pair. */
  readonly specificationVersion: number;
  readonly reading: LearnContractDefinition;
  readonly meaning: LearnContractDefinition;
}

export interface LearnContractIdentity {
  readonly contractId: ContractId;
  readonly idempotencyKey: string;
}

function specificationHeaderIssues(
  specification: LearnContractPairSpecification,
): readonly { readonly path: string; readonly message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if (specification.specificationId.trim() === '') {
    issues.push({ path: 'specificationId', message: 'must be a non-empty stable data identity' });
  }
  if (
    !Number.isInteger(specification.specificationVersion) ||
    specification.specificationVersion < 1
  ) {
    issues.push({ path: 'specificationVersion', message: 'must be an integer at least 1' });
  }
  return issues;
}

function assertSpecificationHeader(specification: LearnContractPairSpecification): void {
  const issues = specificationHeaderIssues(specification);
  if (issues.length > 0) throw new ContractValidationError('<learn-pair>', issues);
}

/**
 * Collision-safe segment encoding. `%` is escaped by `encodeURIComponent`, so
 * delimiters in a thread or data id cannot make two tuples spell the same id.
 */
const segment = (value: string): string => encodeURIComponent(value);

export function learnContractIdentity(
  threadId: ThreadId,
  specification: LearnContractPairSpecification,
  skill: LearnContractSkill,
): LearnContractIdentity {
  assertSpecificationHeader(specification);
  if (threadId.trim() === '') {
    throw new ContractValidationError('<learn-pair>', [
      { path: 'threadId', message: 'must be non-empty' },
    ]);
  }
  const contractId = `contract:learn:${segment(threadId)}:${segment(specification.specificationId)}:v${String(specification.specificationVersion)}:${skill}`;
  return Object.freeze({
    contractId,
    idempotencyKey: `contract-created:${contractId}`,
  });
}

const definitionFor = (
  specification: LearnContractPairSpecification,
  skill: LearnContractSkill,
): LearnContractDefinition =>
  skill === 'orthography_to_reading' ? specification.reading : specification.meaning;

function scoringOf(method: GradingMethod): RetrievalContract['scoring'] {
  return method.kind === 'accepted_answers'
    ? { kind: 'accepted_answers', acceptedAnswers: [...method.acceptedAnswers] }
    : { kind: 'rubric', rubricId: method.rubricId, rubricVersion: method.rubricVersion };
}

function validateDefinition(
  encounter: EncounterCapturedEvent,
  specification: LearnContractPairSpecification,
  skill: LearnContractSkill,
): void {
  const definition = definitionFor(specification, skill);
  const identity = learnContractIdentity(encounter.threadId, specification, skill);
  validateRetrievalContract({
    contractId: identity.contractId,
    contractVersion: specification.specificationVersion,
    targetComponentId: componentIdOfEncounter(encounter),
    skill,
    cueModality: definition.cueModality,
    responseModality: definition.responseModality,
    scoring: scoringOf(definition.gradingMethod),
    hintPolicy: { ...definition.hintPolicy },
    revealPolicy: { ...definition.revealPolicy },
    promptFamilyVersion: definition.promptFamilyVersion,
    // Structural validation only. Real event authority comes from the injected
    // clock/id below after both definitions have passed.
    createdAt: '1970-01-01T00:00:00.000Z',
    createdByEventId: 'pending-learn-contract-event',
  });
}

/** Validate both supplied graders without minting an event or reading a clock/id source. */
export function validateLearnContractPair(
  encounter: EncounterCapturedEvent,
  specification: LearnContractPairSpecification,
): void {
  assertSpecificationHeader(specification);
  validateDefinition(encounter, specification, 'orthography_to_reading');
  validateDefinition(encounter, specification, 'form_to_meaning');
}

function gradingFields(
  method: GradingMethod,
):
  | { readonly acceptedAnswers: readonly string[] }
  | { readonly rubricId: string; readonly rubricVersion: string } {
  return method.kind === 'accepted_answers'
    ? { acceptedAnswers: [...method.acceptedAnswers] }
    : { rubricId: method.rubricId, rubricVersion: method.rubricVersion };
}

const sameStrings = (left: readonly string[] | undefined, right: readonly string[]): boolean =>
  left !== undefined &&
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

/**
 * Verify that an existing stable id really carries the supplied specification.
 *
 * This is the reload/collision guard. Id equality alone is not authority: an
 * imported or corrupt log could reuse the deterministic id with different
 * answers, and treating that as an idempotent Learn would silently bless the
 * wrong grader.
 */
export function learnContractMatchesSpecification(
  event: ContractCreatedEvent,
  encounter: EncounterCapturedEvent,
  specification: LearnContractPairSpecification,
  skill: LearnContractSkill,
): boolean {
  const definition = definitionFor(specification, skill);
  const identity = learnContractIdentity(encounter.threadId, specification, skill);
  const gradingMatches =
    definition.gradingMethod.kind === 'accepted_answers'
      ? event.rubricId === undefined &&
        event.rubricVersion === undefined &&
        sameStrings(event.acceptedAnswers, definition.gradingMethod.acceptedAnswers)
      : event.acceptedAnswers === undefined &&
        event.rubricId === definition.gradingMethod.rubricId &&
        event.rubricVersion === definition.gradingMethod.rubricVersion;

  return (
    event.contractId === identity.contractId &&
    event.idempotencyKey === identity.idempotencyKey &&
    event.contractVersion === specification.specificationVersion &&
    event.targetComponentId === componentIdOfEncounter(encounter) &&
    event.skill === skill &&
    event.cueModality === definition.cueModality &&
    event.responseModality === definition.responseModality &&
    gradingMatches &&
    event.hintPolicy.hintsAllowed === definition.hintPolicy.hintsAllowed &&
    event.hintPolicy.maxHints === definition.hintPolicy.maxHints &&
    event.revealPolicy.revealAllowed === definition.revealPolicy.revealAllowed &&
    event.revealPolicy.revealIsRecorded === definition.revealPolicy.revealIsRecorded &&
    event.promptFamilyVersion === definition.promptFamilyVersion
  );
}

function createOne(
  context: DomainContext,
  encounter: EncounterCapturedEvent,
  specification: LearnContractPairSpecification,
  skill: LearnContractSkill,
): ContractCreatedEvent {
  const definition = definitionFor(specification, skill);
  const identity = learnContractIdentity(encounter.threadId, specification, skill);
  return createDomainEvent(
    context,
    'ContractCreated',
    {
      contractId: identity.contractId,
      contractVersion: specification.specificationVersion,
      targetComponentId: componentIdOfEncounter(encounter),
      skill,
      cueModality: definition.cueModality,
      responseModality: definition.responseModality,
      ...gradingFields(definition.gradingMethod),
      hintPolicy: { ...definition.hintPolicy },
      revealPolicy: { ...definition.revealPolicy },
      promptFamilyVersion: definition.promptFamilyVersion,
    },
    { idempotencyKey: identity.idempotencyKey },
  );
}

/**
 * Mint the immutable pair an explicit Learn gesture activates.
 *
 * Both definitions are validated before either event is minted, so an invalid
 * meaning spec cannot leave a reading-only half-pair in a caller's hands.
 */
export function createLearnContractPair(
  context: DomainContext,
  encounter: EncounterCapturedEvent,
  specification: LearnContractPairSpecification,
): readonly [ContractCreatedEvent, ContractCreatedEvent] {
  validateLearnContractPair(encounter, specification);
  return Object.freeze([
    createOne(context, encounter, specification, 'orthography_to_reading'),
    createOne(context, encounter, specification, 'form_to_meaning'),
  ]);
}
