/**
 * Value objects shared across the v1 event catalog (WP-02).
 *
 * Each schema here is the Phase-0 concretisation of a field the controller §6.1
 * table names but does not spell out (`provenance`, `sourceRef`, `span`,
 * `context`, `scope`, `correction`, candidate envelope metadata). Where the
 * spec gives a closed list, that list is reproduced exactly. Where it does not,
 * the shape below is deliberately the narrowest one that carries the meaning —
 * widening it later is a schema version bump with a replay-tested migration
 * (ADR-002), which is the point: a field that accepts anything records nothing.
 */

import { z } from 'zod';

import { isValidIsoInstant, type ExactOptional } from '../primitives.ts';

/** Identifiers and free text are never empty; an empty id is a missing id. */
export const nonEmptyString = z.string().min(1);

export const isoInstantSchema = z.string().refine(isValidIsoInstant, {
  message: 'expected a canonical ISO-8601 UTC instant of the form YYYY-MM-DDTHH:mm:ss.sssZ',
});

// ---------------------------------------------------------------------------
// Promotion (REQ-DM-09)
// ---------------------------------------------------------------------------

/**
 * The promotion ladder, in ladder order. Order matters: `PROMOTION_STATES` is
 * also the canonical sort order for anything that groups threads by state.
 */
export const PROMOTION_STATES = ['captured', 'keep', 'learn', 'master'] as const;
export const promotionStateSchema = z.enum(PROMOTION_STATES);
export type PromotionState = z.infer<typeof promotionStateSchema>;

/**
 * Where a promotion came from. Both values mean a human acted —
 * `nomination_accepted` is a nomination the intake queue raised and the user
 * accepted, not an automatic move. REQ-DM-09 is explicit that repeated
 * encounters or lookup friction may *nominate* and may never promote, so there
 * is deliberately no `automatic` member for a future reducer to reach for.
 */
export const PROMOTION_ORIGINS = ['user', 'nomination_accepted'] as const;
export const promotionOriginSchema = z.enum(PROMOTION_ORIGINS);
export type PromotionOrigin = z.infer<typeof promotionOriginSchema>;

// ---------------------------------------------------------------------------
// Evidence vocabulary (REQ-DM-06). Types only — the gate that acts on them is WP-06.
// ---------------------------------------------------------------------------

export const EVIDENCE_TIERS = ['A', 'B', 'C', 'D'] as const;
export const evidenceTierSchema = z.enum(EVIDENCE_TIERS);
export type EvidenceTier = z.infer<typeof evidenceTierSchema>;

export const GRADES = ['again', 'hard', 'good', 'easy'] as const;
export const gradeSchema = z.enum(GRADES);
export type Grade = z.infer<typeof gradeSchema>;

export const PROBE_CONTEXTS = ['standalone', 'embedded'] as const;
export const probeContextSchema = z.enum(PROBE_CONTEXTS);
export type ProbeContext = z.infer<typeof probeContextSchema>;

// ---------------------------------------------------------------------------
// Provenance (REQ-SRC-01 / DL-10)
// ---------------------------------------------------------------------------

export const MODIFICATION_STATUSES = ['unmodified', 'modified', 'derived'] as const;
export const REVIEW_STATUSES = ['unreviewed', 'machine_reviewed', 'user_reviewed'] as const;

/**
 * REQ-SRC-01's field list, at record level.
 *
 * `source`, `license`, and `modificationStatus` are required rather than
 * optional. The requirement says "where applicable", and for anything entering
 * an event log all three always apply — a user's own encounter has source
 * `user_encounter` and license `user_owned`. Making them optional would make
 * "we never recorded it" indistinguishable from "there was nothing to record",
 * and REQ-SRC-01 exists because that distinction has legal weight (T-15).
 */
export const provenanceRecordSchema = z.strictObject({
  source: nonEmptyString,
  sourceVersion: nonEmptyString.optional(),
  license: nonEmptyString,
  attribution: nonEmptyString.optional(),
  modificationStatus: z.enum(MODIFICATION_STATUSES),
  confidence: z.number().min(0).max(1).optional(),
  reviewStatus: z.enum(REVIEW_STATUSES),
});

export const SOURCE_KINDS = ['text', 'audio', 'image', 'conversation', 'import', 'manual'] as const;

/** Where an encounter physically came from: the `Source` entity plus a locator. */
export const sourceRefSchema = z.strictObject({
  sourceId: nonEmptyString,
  kind: z.enum(SOURCE_KINDS),
  /** URL, timecode, file reference, page — opaque to the domain. */
  locator: nonEmptyString.optional(),
});

/**
 * A half-open character span `[start, end)` into the encounter's own `text`.
 *
 * Bounds against `text.length` are checked by the event schema that owns both
 * fields, not here — a span alone cannot know what it points into.
 */
export const spanSchema = z
  .strictObject({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  })
  .refine((span) => span.start < span.end, {
    message: 'span.start must be strictly less than span.end (spans are half-open and non-empty)',
  });

// ---------------------------------------------------------------------------
// Lookup friction
// ---------------------------------------------------------------------------

export const LOOKUP_TARGET_TYPES = [
  'lexeme',
  'sense',
  'kanji',
  'component',
  'reading',
  'grammar_construction',
  'expression',
  'thread',
] as const;

export const lookupTargetRefSchema = z.strictObject({
  targetType: z.enum(LOOKUP_TARGET_TYPES),
  targetId: nonEmptyString,
});

/** The surface the learner was on when they reached for a lookup. */
export const LOOKUP_CONTEXTS = [
  'capture',
  'reading',
  'listening',
  'review',
  'conversation',
  'inspector',
] as const;
export const lookupContextSchema = z.enum(LOOKUP_CONTEXTS);

// ---------------------------------------------------------------------------
// Retrieval contract vocabulary (REQ-DM-05)
// ---------------------------------------------------------------------------

export const RETRIEVAL_SKILLS = [
  'orthography_to_reading',
  'form_to_meaning',
  'meaning_to_production',
  'audio_to_meaning',
  'discrimination',
] as const;

export const MODALITIES = ['text', 'audio', 'visual', 'choice', 'free'] as const;

export const hintPolicySchema = z.strictObject({
  hintsAllowed: z.boolean(),
  maxHints: z.number().int().min(0),
});

export const revealPolicySchema = z.strictObject({
  revealAllowed: z.boolean(),
  /**
   * Whether revealing is recorded on the resulting evidence. It always is in
   * Phase 0 — the field exists so the policy is explicit in the log rather than
   * implied by the reducer that reads it (T-06 is decided by the gate, WP-06).
   */
  revealIsRecorded: z.literal(true),
});

// ---------------------------------------------------------------------------
// AI candidate envelope metadata (controller §9)
// ---------------------------------------------------------------------------

/**
 * The metadata half of the `@bunki/ai` response envelope, recorded on
 * `CandidateAttached`.
 *
 * The candidate *payload* is deliberately absent. The domain records that a
 * candidate exists, what produced it, and that it was labeled; the content
 * lives with the candidate artifact. Keeping generated prose out of the event
 * log is what makes "AI output cannot mutate canonical fields" (T-09) a
 * structural fact rather than a review convention.
 */
export const candidateEnvelopeMetadataSchema = z.strictObject({
  taskClass: z.literal('T2'),
  inputHash: nonEmptyString,
  promptFamilyId: nonEmptyString,
  promptVersion: nonEmptyString,
  model: nonEmptyString,
  provider: nonEmptyString,
  createdAt: isoInstantSchema,
  checks: z.strictObject({
    targetFormPresent: z.boolean(),
    /** Literal `true`: an unlabeled candidate is not a candidate, it is a defect (T-12). */
    isLabeled: z.literal(true),
  }),
});

// ---------------------------------------------------------------------------
// Session, export, deletion vocabulary
// ---------------------------------------------------------------------------

export const sessionBudgetSchema = z.strictObject({
  timeBudgetMin: z.number().int().min(1),
  /** Bounded new-item intake for the session (controller §6.4: "one bounded new item"). */
  newBudget: z.number().int().min(0),
});

/**
 * How a session ended. Every value is terminal and explicit — there is no
 * "unknown"/"still running" member, because §6.4 requires a session to reach a
 * finite completion state and a queue that cannot silently grow (T-13).
 */
export const SESSION_COMPLETION_STATES = ['completed', 'abandoned', 'budget_exhausted'] as const;
export const sessionCompletionStateSchema = z.enum(SESSION_COMPLETION_STATES);
export type SessionCompletionState = z.infer<typeof sessionCompletionStateSchema>;

export const exportScopeSchema = z.strictObject({
  kind: z.enum(['all', 'threads']),
  threadIds: z.array(nonEmptyString).optional(),
});

export const TOMBSTONE_REASONS = ['user_deleted', 'duplicate', 'mistaken_capture'] as const;

export const SUPERSESSION_REASONS = [
  'user_correction',
  'misgraded',
  'duplicate',
  'data_error',
] as const;

/**
 * What replaces the superseded observation.
 *
 * `replacementEventId` is optional because a retraction is a legitimate
 * correction — sometimes the truthful amendment is "that observation should
 * never have been recorded", with nothing standing in its place. `note` is
 * required either way: history is never rewritten (REQ-DM-04.2), so the reason
 * has to survive alongside the thing it corrects.
 */
export const supersessionCorrectionSchema = z.strictObject({
  replacementEventId: nonEmptyString.optional(),
  note: nonEmptyString,
});

// ---------------------------------------------------------------------------
// Inferred value types
//
// `ExactOptional` is applied for the same reason it is applied to the events
// themselves: an optional field must mean absent, not "present and undefined"
// (see `primitives.ts`).
// ---------------------------------------------------------------------------

export type ProvenanceRecord = ExactOptional<z.infer<typeof provenanceRecordSchema>>;
export type SourceRef = ExactOptional<z.infer<typeof sourceRefSchema>>;
export type Span = ExactOptional<z.infer<typeof spanSchema>>;
export type LookupTargetRef = ExactOptional<z.infer<typeof lookupTargetRefSchema>>;
export type LookupContext = z.infer<typeof lookupContextSchema>;
export type HintPolicy = ExactOptional<z.infer<typeof hintPolicySchema>>;
export type RevealPolicy = ExactOptional<z.infer<typeof revealPolicySchema>>;
export type CandidateEnvelopeMetadata = ExactOptional<
  z.infer<typeof candidateEnvelopeMetadataSchema>
>;
export type SessionBudget = ExactOptional<z.infer<typeof sessionBudgetSchema>>;
export type ExportScope = ExactOptional<z.infer<typeof exportScopeSchema>>;
export type SupersessionCorrection = ExactOptional<z.infer<typeof supersessionCorrectionSchema>>;
