/**
 * The `RetrievalContract` entity and its validation (WP-06; REQ-DM-05, DL-03).
 *
 * WP-02 owns the `ContractCreated` *event* schema — the wire shape the parser
 * accepts. This file owns the *entity*: the thing the scheduler schedules and
 * the gate checks, plus the coherence rules that make one scorable.
 *
 * The two layers are not redundant. The event schema answers "is this a
 * well-formed record of a contract having been created"; the entity validator
 * answers "can this contract actually score a retrieval". A contract that
 * passes the first and fails the second is a real and recordable thing — the
 * log keeps it, the inspector can show it, and the gate refuses to schedule on
 * it. Collapsing the two would mean either rejecting the record (losing the
 * evidence that a bad contract was created) or scheduling on it (grading
 * against a rule that cannot decide).
 *
 * Every field below is REQ-DM-05's normative minimum. Nothing is added.
 */

import { z } from 'zod';

import { ContractValidationError } from '../errors.ts';
import type { ContractCreatedEvent } from '../events/catalog.ts';
import {
  hintPolicySchema,
  MODALITIES,
  nonEmptyString,
  RETRIEVAL_SKILLS,
  revealPolicySchema,
} from '../events/shared.ts';
import type { ComponentId, ContractId, EventId, IsoInstant } from '../primitives.ts';
import { isCanonicalComponentId } from './component-identity.ts';

export type RetrievalSkill = (typeof RETRIEVAL_SKILLS)[number];
export type Modality = (typeof MODALITIES)[number];

/**
 * How a contract decides whether a response was correct.
 *
 * Exactly one of the two, never both and never neither: two graders that can
 * disagree is not a stricter contract, it is an undecidable one.
 */
export type ContractScoring =
  | { readonly kind: 'accepted_answers'; readonly acceptedAnswers: readonly string[] }
  | { readonly kind: 'rubric'; readonly rubricId: string; readonly rubricVersion: string };

/**
 * The grader as a consumer-facing, explicit value.
 *
 * `ContractScoring` keeps the entity's historical `rubric` spelling. Bound
 * contracts use `versioned_rubric` so a caller cannot accidentally erase the
 * version requirement while projecting the XOR fields from `ContractCreated`.
 */
export type GradingMethod =
  | { readonly kind: 'accepted_answers'; readonly acceptedAnswers: readonly string[] }
  | {
      readonly kind: 'versioned_rubric';
      readonly rubricId: string;
      readonly rubricVersion: string;
    };

export interface RetrievalContract {
  readonly contractId: ContractId;
  readonly contractVersion: number;
  /** The KnowledgeComponent this contract TESTS (REQ-DM-02 edge). */
  readonly targetComponentId: ComponentId;
  /** Retrieval direction. Two contracts on one component differ by this. */
  readonly skill: RetrievalSkill;
  readonly cueModality: Modality;
  readonly responseModality: Modality;
  readonly scoring: ContractScoring;
  readonly hintPolicy: { readonly hintsAllowed: boolean; readonly maxHints: number };
  readonly revealPolicy: { readonly revealAllowed: boolean; readonly revealIsRecorded: true };
  readonly promptFamilyVersion: string;
  readonly createdAt: IsoInstant;
  readonly createdByEventId: EventId;
}

/**
 * Shape validation for the entity, independent of any event.
 *
 * Kept as a schema rather than a pile of `if`s so that a caller building a
 * contract from somewhere other than the log (a fixture, an import, WP-03's
 * snapshot cache) is held to the same rules as the event path.
 */
const retrievalContractShapeSchema = z.strictObject({
  contractId: nonEmptyString,
  contractVersion: z.number().int().min(1),
  targetComponentId: nonEmptyString,
  skill: z.enum(RETRIEVAL_SKILLS),
  cueModality: z.enum(MODALITIES),
  responseModality: z.enum(MODALITIES),
  scoring: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('accepted_answers'),
      acceptedAnswers: z.array(nonEmptyString).min(1),
    }),
    z.strictObject({
      kind: z.literal('rubric'),
      rubricId: nonEmptyString,
      rubricVersion: nonEmptyString,
    }),
  ]),
  hintPolicy: hintPolicySchema,
  revealPolicy: revealPolicySchema,
  promptFamilyVersion: nonEmptyString,
  createdAt: nonEmptyString,
  createdByEventId: nonEmptyString,
});

/** One reason a contract is not scorable, as data. */
export interface ContractValidationIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * Coherence rules beyond the field list.
 *
 * Each one exists because violating it produces a contract that *looks*
 * scorable and is not; none of them narrows REQ-DM-05's field set.
 */
function coherenceIssues(contract: RetrievalContract): readonly ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];

  // (1) The component must be linkable to a thread, or promotion status — and
  //     therefore schedulability — is unknowable. See `component-identity.ts`
  //     for why this is a value rule rather than a schema change.
  if (!isCanonicalComponentId(contract.targetComponentId)) {
    issues.push({
      path: 'targetComponentId',
      message: `must be a canonical Phase-0 KnowledgeComponent id ("kc:<captured target>"); received ${JSON.stringify(contract.targetComponentId)}. A component that no capture instantiated cannot be linked to a promotion state (REQ-LM-01, REQ-DM-09).`,
    });
  }

  // (2) A hint policy that allows hints but permits none, or forbids hints and
  //     budgets some, gives two answers to "may the learner take a hint?".
  //     `hintsUsed` on the resulting evidence would then be uninterpretable.
  if (contract.hintPolicy.hintsAllowed && contract.hintPolicy.maxHints < 1) {
    issues.push({
      path: 'hintPolicy.maxHints',
      message: 'hintsAllowed is true but maxHints is 0 — the policy allows a hint it never grants',
    });
  }
  if (!contract.hintPolicy.hintsAllowed && contract.hintPolicy.maxHints > 0) {
    issues.push({
      path: 'hintPolicy.maxHints',
      message: 'hintsAllowed is false but maxHints is above 0 — the budget contradicts the policy',
    });
  }

  // (3) A free response cannot be scored against a closed answer list: the
  //     learner's correct paraphrase would be graded wrong, and the resulting
  //     `again` would be an artefact of the contract, not of their memory.
  //     REQ-DM-05 offers a versioned rubric for exactly this case.
  if (contract.responseModality === 'free' && contract.scoring.kind === 'accepted_answers') {
    issues.push({
      path: 'scoring',
      message:
        'a free response must be scored by rubricId + rubricVersion; a closed acceptedAnswers list cannot decide free production (REQ-DM-05, REQ-DM-06 tier B)',
    });
  }

  return issues;
}

export interface ContractValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ContractValidationIssue[];
}

/** Non-throwing validation, for callers that must report rather than abort. */
export function checkRetrievalContract(value: unknown): ContractValidationResult {
  const parsed = retrievalContractShapeSchema.safeParse(value);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }

  const issues = coherenceIssues(parsed.data as RetrievalContract);
  return { valid: issues.length === 0, issues };
}

/**
 * Validate a contract, or throw.
 *
 * @throws ContractValidationError with every issue attached — a caller fixing a
 *         contract should not have to discover its problems one run at a time.
 */
export function validateRetrievalContract(value: unknown): RetrievalContract {
  const result = checkRetrievalContract(value);
  if (!result.valid) {
    const contractId =
      typeof value === 'object' && value !== null && 'contractId' in value
        ? String((value as { contractId: unknown }).contractId)
        : '<unknown>';
    throw new ContractValidationError(contractId, result.issues);
  }
  return value as RetrievalContract;
}

/** Project a `ContractCreated` event onto the entity shape (no validation). */
export function projectContractCreated(event: ContractCreatedEvent): RetrievalContract {
  const scoring: ContractScoring =
    event.acceptedAnswers === undefined
      ? {
          kind: 'rubric',
          // The event schema's XOR refinement guarantees both are present when
          // acceptedAnswers is absent; the fallbacks keep this total without a
          // cast that would hide a future schema change.
          rubricId: event.rubricId ?? '',
          rubricVersion: event.rubricVersion ?? '',
        }
      : { kind: 'accepted_answers', acceptedAnswers: [...event.acceptedAnswers] };

  return {
    contractId: event.contractId,
    contractVersion: event.contractVersion,
    targetComponentId: event.targetComponentId,
    skill: event.skill,
    cueModality: event.cueModality,
    responseModality: event.responseModality,
    scoring,
    hintPolicy: { ...event.hintPolicy },
    revealPolicy: { ...event.revealPolicy },
    promptFamilyVersion: event.promptFamilyVersion,
    createdAt: event.occurredAt,
    createdByEventId: event.eventId,
  };
}

/** Normalize ADR-002's answer/rubric XOR into one explicit grading method. */
export function gradingMethodOfContractCreated(event: ContractCreatedEvent): GradingMethod {
  if (event.acceptedAnswers !== undefined) {
    return {
      kind: 'accepted_answers',
      acceptedAnswers: [...event.acceptedAnswers],
    };
  }
  return {
    kind: 'versioned_rubric',
    // The parsed event schema guarantees the pair is complete. Keeping this
    // total makes a future schema drift fail validation rather than a cast.
    rubricId: event.rubricId ?? '',
    rubricVersion: event.rubricVersion ?? '',
  };
}

export type ContractFromEventResult =
  | { readonly valid: true; readonly contract: RetrievalContract }
  | {
      readonly valid: false;
      readonly contract: RetrievalContract;
      readonly issues: readonly ContractValidationIssue[];
    };

/**
 * Build the entity from a parsed `ContractCreated`, reporting rather than
 * throwing.
 *
 * Replay uses this: a structurally valid event that describes an unscorable
 * contract must still be folded into the ledger (the contract was created; that
 * happened) while being refused by the gate. Throwing here would make one bad
 * contract render the whole log unreadable, which is the opposite of an
 * auditable evidence trail.
 */
export function retrievalContractFromEvent(event: ContractCreatedEvent): ContractFromEventResult {
  const contract = projectContractCreated(event);
  const result = checkRetrievalContract(contract);
  return result.valid
    ? { valid: true, contract }
    : { valid: false, contract, issues: result.issues };
}
