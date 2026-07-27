/**
 * The v1 event catalog (WP-02) — every family in controller §6.1 / ADR-002,
 * as a TypeScript type and a zod schema, versioned and closed.
 *
 * "Closed" is the important word. The union below is exhaustive and the parser
 * rejects anything outside it; adding a family in Phase 0 means a schema
 * version bump with a replay-tested migration, not an optional property quietly
 * appended (ADR-002). Every object schema is strict, so an unrecognised key is
 * a rejection too — a field this build does not understand is precisely the
 * situation the fail-closed rule exists for, one level below the version check.
 *
 * What is deliberately *not* here:
 *   - FSRS, scheduling, memory state          → WP-06 (`src/reducers/fsrs-*`)
 *   - the evidence gate that admits these     → WP-06 (`src/evidence/`)
 *   - the `RetrievalContract` entity itself   → WP-06 (`src/contracts/`)
 *   - session planning                        → WP-08 (`src/session/`)
 * See `src/reducers/seams.ts` for the full seam register.
 */

import { z } from 'zod';

import type { ExactOptional } from '../primitives.ts';
import { eventEnvelopeSchema } from './envelope.ts';
import {
  candidateEnvelopeMetadataSchema,
  exportScopeSchema,
  gradeSchema,
  hintPolicySchema,
  lookupContextSchema,
  lookupTargetRefSchema,
  MODALITIES,
  nonEmptyString,
  probeContextSchema,
  promotionOriginSchema,
  promotionStateSchema,
  provenanceRecordSchema,
  RETRIEVAL_SKILLS,
  revealPolicySchema,
  sessionBudgetSchema,
  sessionCompletionStateSchema,
  sourceRefSchema,
  spanSchema,
  SUPERSESSION_REASONS,
  supersessionCorrectionSchema,
  TOMBSTONE_REASONS,
} from './shared.ts';

const withEnvelope = <TType extends string, TShape extends z.ZodRawShape>(
  type: TType,
  shape: TShape,
) => eventEnvelopeSchema.extend({ type: z.literal(type) }).extend(shape);

// ---------------------------------------------------------------------------
// Capture and threads
// ---------------------------------------------------------------------------

/**
 * A learner met something. This is the only event that can create a thread, and
 * every thread starts in `captured` — capture is not card creation (DL-05).
 *
 * `threadId` may name an existing thread, which records a re-encounter rather
 * than a new one. The `span` bound check lives here because only this schema
 * can see both the span and the text it points into.
 */
export const encounterCapturedSchema = withEnvelope('EncounterCaptured', {
  encounterId: nonEmptyString,
  threadId: nonEmptyString,
  text: nonEmptyString,
  span: spanSchema.optional(),
  sourceRef: sourceRefSchema,
  provenance: provenanceRecordSchema,
  /** One-gesture uncertainty mark (v2 §6). Absent means not marked. */
  uncertaintyMark: z.literal(true).optional(),
}).refine((event) => event.span === undefined || event.span.end <= event.text.length, {
  message: 'span must lie inside text',
  path: ['span'],
});

export const threadPromotionChangedSchema = withEnvelope('ThreadPromotionChanged', {
  threadId: nonEmptyString,
  from: promotionStateSchema,
  to: promotionStateSchema,
  origin: promotionOriginSchema,
});

export const threadTombstonedSchema = withEnvelope('ThreadTombstoned', {
  threadId: nonEmptyString,
  reason: z.enum(TOMBSTONE_REASONS),
});

/**
 * Records that the physical purge ran. The tombstone survives; the payload
 * bytes do not. Two events, in that order, so deletion stays auditable without
 * the audit trail retaining the deleted content (ADR-002).
 */
export const contentPurgedSchema = withEnvelope('ContentPurged', {
  targetIds: z.array(nonEmptyString).min(1),
  tombstoneEventId: nonEmptyString,
});

// ---------------------------------------------------------------------------
// Retrieval contracts (REQ-DM-05)
// ---------------------------------------------------------------------------

/**
 * REQ-DM-05's normative minimum, exactly.
 *
 * `acceptedAnswers` XOR (`rubricId` + `rubricVersion`): a contract is scorable
 * either against a closed answer set or against a versioned rubric, and one
 * that claims both has two graders that can disagree. The refinement makes that
 * unrepresentable rather than merely discouraged.
 */
export const contractCreatedSchema = withEnvelope('ContractCreated', {
  contractId: nonEmptyString,
  contractVersion: z.number().int().min(1),
  targetComponentId: nonEmptyString,
  skill: z.enum(RETRIEVAL_SKILLS),
  cueModality: z.enum(MODALITIES),
  responseModality: z.enum(MODALITIES),
  acceptedAnswers: z.array(nonEmptyString).min(1).optional(),
  rubricId: nonEmptyString.optional(),
  rubricVersion: nonEmptyString.optional(),
  hintPolicy: hintPolicySchema,
  revealPolicy: revealPolicySchema,
  promptFamilyVersion: nonEmptyString,
}).refine(
  (event) => {
    const hasAnswers = event.acceptedAnswers !== undefined;
    const hasRubric = event.rubricId !== undefined && event.rubricVersion !== undefined;
    const halfRubric = (event.rubricId === undefined) !== (event.rubricVersion === undefined);
    return !halfRubric && hasAnswers !== hasRubric;
  },
  {
    message:
      'a contract is scored by acceptedAnswers or by rubricId+rubricVersion, exactly one (REQ-DM-05); a half-specified rubric is not a rubric',
  },
);

// ---------------------------------------------------------------------------
// Evidence-class observations (REQ-DM-06)
//
// Typed and validated here; *constructed* only by the evidence gate in
// `src/evidence/` (WP-06, REQ-ARCH-04). Validating an event that already exists
// and minting a new one are different acts, and only the second is the gate's
// monopoly — which is why the schemas live in the catalog and the factories do
// not (see `src/events/factories.ts`).
// ---------------------------------------------------------------------------

export const reviewGradedSchema = withEnvelope('ReviewGraded', {
  contractId: nonEmptyString,
  grade: gradeSchema,
  latencyMs: z.number().int().min(0),
  hintsUsed: z.number().int().min(0),
  revealedBeforeRecall: z.boolean(),
  /**
   * Only meaningful for `easy`, and for `easy` it is required — but that rule
   * is REQ-DM-07's and the gate enforces it (WP-06, §6.2). The schema keeps the
   * field optional so that an `easy` grade submitted without confirmation is a
   * *representable, recordable* event the gate can reject and the inspector can
   * show. A schema that made it unrepresentable would delete the evidence that
   * the rejection ever happened.
   */
  userConfirmedEasy: z.literal(true).optional(),
  probeContext: probeContextSchema,
  tier: z.literal('A'),
});

export const productionObservedSchema = withEnvelope('ProductionObserved', {
  contractId: nonEmptyString.optional(),
  rubricId: nonEmptyString.optional(),
  rubricVersion: nonEmptyString.optional(),
  elicited: z.boolean(),
  tier: z.enum(['B', 'C']),
});

/** Tier D. Recorded and surfaced, never scheduled on (T-08). */
export const exposureLoggedSchema = withEnvelope('ExposureLogged', {
  componentIds: z.array(nonEmptyString).min(1),
  experienceId: nonEmptyString,
  tier: z.literal('D'),
});

/**
 * Carries no grade field, on purpose. Looking a word up is neither a success
 * nor a failure (T-07); giving it a grade shape would invite one.
 */
export const lookupFrictionLoggedSchema = withEnvelope('LookupFrictionLogged', {
  targetRef: lookupTargetRefSchema,
  context: lookupContextSchema,
});

export const evidenceSupersededSchema = withEnvelope('EvidenceSuperseded', {
  supersededEventId: nonEmptyString,
  reason: z.enum(SUPERSESSION_REASONS),
  correction: supersessionCorrectionSchema,
});

// ---------------------------------------------------------------------------
// AI candidates (controller §9) — never evidence
// ---------------------------------------------------------------------------

export const candidateAttachedSchema = withEnvelope('CandidateAttached', {
  threadId: nonEmptyString,
  candidateId: nonEmptyString,
  envelope: candidateEnvelopeMetadataSchema,
  status: z.literal('generated'),
});

/**
 * `userAction` is a literal `true`, not a boolean that happens to be true.
 * Accepting an AI candidate is always an explicit human act; nothing may
 * construct this event automatically (controller §9).
 */
export const candidateAcceptedAsNoteSchema = withEnvelope('CandidateAcceptedAsNote', {
  candidateId: nonEmptyString,
  userAction: z.literal(true),
});

// ---------------------------------------------------------------------------
// Sessions and export
// ---------------------------------------------------------------------------

export const sessionStartedSchema = withEnvelope('SessionStarted', {
  sessionId: nonEmptyString,
  budget: sessionBudgetSchema,
});

export const sessionClosedSchema = withEnvelope('SessionClosed', {
  sessionId: nonEmptyString,
  completionState: sessionCompletionStateSchema,
});

/**
 * An export ran. The field set is exactly ADR-002's: `exportVersion` and
 * `scope`, and nothing else.
 *
 * There is no `producedAt`. When the export ran is `occurredAt` — the envelope
 * already carries it, and a second timestamp would create two answers to one
 * question with no rule for which replay should believe. If a future phase
 * genuinely needs to distinguish "when the bytes were produced" from "when the
 * event was recorded", ADR-002 says how that arrives: a schema version bump
 * with a replay-tested migration, not an optional property quietly appended.
 */
export const dataExportedSchema = withEnvelope('DataExported', {
  exportVersion: nonEmptyString,
  scope: exportScopeSchema,
});

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

/**
 * Type → schema, as data.
 *
 * A record rather than a bare union so that the parser can look a schema up by
 * discriminator and report an *unknown type* distinctly from a *failed
 * payload*. Those are different failures with different operator responses (a
 * version/migration problem versus a producer bug), and collapsing them into
 * one "invalid event" would lose that.
 *
 * Two families carry `.refine`, so the values are ZodType rather than ZodObject
 * — the union below is still discriminated because every member's `type` is a
 * literal.
 */
export const EVENT_SCHEMAS = {
  EncounterCaptured: encounterCapturedSchema,
  ThreadPromotionChanged: threadPromotionChangedSchema,
  ContractCreated: contractCreatedSchema,
  ReviewGraded: reviewGradedSchema,
  ProductionObserved: productionObservedSchema,
  ExposureLogged: exposureLoggedSchema,
  LookupFrictionLogged: lookupFrictionLoggedSchema,
  CandidateAttached: candidateAttachedSchema,
  CandidateAcceptedAsNote: candidateAcceptedAsNoteSchema,
  EvidenceSuperseded: evidenceSupersededSchema,
  SessionStarted: sessionStartedSchema,
  SessionClosed: sessionClosedSchema,
  DataExported: dataExportedSchema,
  ThreadTombstoned: threadTombstonedSchema,
  ContentPurged: contentPurgedSchema,
} as const;

export type DomainEventType = keyof typeof EVENT_SCHEMAS;

export const DOMAIN_EVENT_TYPES = Object.keys(EVENT_SCHEMAS) as readonly DomainEventType[];

export function isDomainEventType(value: unknown): value is DomainEventType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EVENT_SCHEMAS, value);
}

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type EncounterCapturedEvent = ExactOptional<z.infer<typeof encounterCapturedSchema>>;
export type ThreadPromotionChangedEvent = ExactOptional<
  z.infer<typeof threadPromotionChangedSchema>
>;
export type ContractCreatedEvent = ExactOptional<z.infer<typeof contractCreatedSchema>>;
export type ReviewGradedEvent = ExactOptional<z.infer<typeof reviewGradedSchema>>;
export type ProductionObservedEvent = ExactOptional<z.infer<typeof productionObservedSchema>>;
export type ExposureLoggedEvent = ExactOptional<z.infer<typeof exposureLoggedSchema>>;
export type LookupFrictionLoggedEvent = ExactOptional<z.infer<typeof lookupFrictionLoggedSchema>>;
export type CandidateAttachedEvent = ExactOptional<z.infer<typeof candidateAttachedSchema>>;
export type CandidateAcceptedAsNoteEvent = ExactOptional<
  z.infer<typeof candidateAcceptedAsNoteSchema>
>;
export type EvidenceSupersededEvent = ExactOptional<z.infer<typeof evidenceSupersededSchema>>;
export type SessionStartedEvent = ExactOptional<z.infer<typeof sessionStartedSchema>>;
export type SessionClosedEvent = ExactOptional<z.infer<typeof sessionClosedSchema>>;
export type DataExportedEvent = ExactOptional<z.infer<typeof dataExportedSchema>>;
export type ThreadTombstonedEvent = ExactOptional<z.infer<typeof threadTombstonedSchema>>;
export type ContentPurgedEvent = ExactOptional<z.infer<typeof contentPurgedSchema>>;

/** The closed v1 union. Exhaustiveness over this is checked by the reducers. */
export type DomainEvent =
  | EncounterCapturedEvent
  | ThreadPromotionChangedEvent
  | ContractCreatedEvent
  | ReviewGradedEvent
  | ProductionObservedEvent
  | ExposureLoggedEvent
  | LookupFrictionLoggedEvent
  | CandidateAttachedEvent
  | CandidateAcceptedAsNoteEvent
  | EvidenceSupersededEvent
  | SessionStartedEvent
  | SessionClosedEvent
  | DataExportedEvent
  | ThreadTombstonedEvent
  | ContentPurgedEvent;

/** Narrows the union to one family by its discriminator. */
export type EventOfType<TType extends DomainEventType> = Extract<DomainEvent, { type: TType }>;

// ---------------------------------------------------------------------------
// The evidence partition (REQ-ARCH-04, T-09)
// ---------------------------------------------------------------------------

/**
 * Evidence-class families: observations of what a learner did, plus the
 * correction record that amends one.
 *
 * This list is what gives REQ-ARCH-04 a type-level edge. `@bunki/ai` produces
 * `Candidate*` — and `CandidateAttached`/`CandidateAcceptedAsNote` are pointedly
 * *not* in this set, so no widening of the AI package can make its output
 * assignable to an evidence type. The runtime half of the boundary (the gate
 * that decides which of these may reach FSRS) is WP-06's.
 */
export const EVIDENCE_EVENT_TYPES = [
  'ReviewGraded',
  'ProductionObserved',
  'ExposureLogged',
  'LookupFrictionLogged',
  'EvidenceSuperseded',
] as const satisfies readonly DomainEventType[];

export type EvidenceEventType = (typeof EVIDENCE_EVENT_TYPES)[number];

/** Families anything in the domain may construct without going through the gate. */
export type NonEvidenceEventType = Exclude<DomainEventType, EvidenceEventType>;

export type EvidenceClassEvent = EventOfType<EvidenceEventType>;
export type NonEvidenceEvent = EventOfType<NonEvidenceEventType>;

export function isEvidenceEventType(value: DomainEventType): value is EvidenceEventType {
  return (EVIDENCE_EVENT_TYPES as readonly string[]).includes(value);
}

export function isEvidenceClassEvent(event: DomainEvent): event is EvidenceClassEvent {
  return isEvidenceEventType(event.type);
}
