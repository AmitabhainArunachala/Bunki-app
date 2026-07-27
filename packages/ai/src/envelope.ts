/**
 * The candidate envelope (WP-07; controller §9, REQ-AI-03).
 *
 * ```
 * request  { taskClass: "T2", inputHash, promptFamilyId, promptVersion,
 *            threadContext (minimal), maxTokens }
 * response { candidateId, payload, model, provider, promptVersion, createdAt,
 *            checks: { targetFormPresent, isLabeled: true } }
 * ```
 *
 * Three decisions in this file are load-bearing and are stated here so nobody
 * has to infer them from the schemas.
 *
 * **Every object is strict.** An unknown key is a rejection, not an ignored
 * extra. A provider that answered with a field this build does not understand
 * is precisely the situation the fail-closed rule exists for — and a model that
 * was asked for a gloss and returned a `grade` must not have that field quietly
 * dropped on the way to a UI that would then be one refactor away from reading
 * it (REQ-ARCH-04).
 *
 * **`isLabeled` is the literal `true`.** An unlabeled candidate is not a
 * candidate with a missing flag; it is a defect of the same class as a wrong
 * answer (T-12). Making the literal the only inhabitant means the type system
 * refuses to represent one.
 *
 * **The response carries no grade, no interval, no canonical field, and no
 * learner state — by construction, not by convention.** `payload` is a closed
 * strict object of display text. There is no field on it that any part of
 * `@bunki/domain` reads, which is the type-level half of T-09: widening
 * `@bunki/ai` cannot make its output assignable to an evidence family, because
 * evidence families are a closed union in the domain catalog and nothing here
 * is a member of it.
 *
 * `createdAt` comes from an injected clock (`AiClock`), never from `Date.now()`,
 * so a fixture-driven test produces byte-identical envelopes on two runs.
 */

import { isoInstantSchema, type CandidateEnvelopeMetadata } from '@bunki/domain';
import { z } from 'zod';

import { AiRequestValidationError, AiResponseValidationError } from './errors.ts';

const nonEmptyString = z.string().min(1);

/**
 * The route class this adapter is allowed to use (REQ-AI-02).
 *
 * T2 is "low-latency structured inference: sense candidates, bounded
 * explanations, provisional critique; timeout → deterministic/self-grade
 * fallback". T3 (streamed conversation) and T4 (asynchronous planning) are
 * outside Phase 0 — controller §19 WP-07 excludes them by name — so the literal
 * is the whole vocabulary rather than an enum with unused members.
 */
export const TASK_CLASS = 'T2' as const;

/**
 * Ceilings, enforced in the schema rather than at a call site.
 *
 * `MAX_TOKENS_CEILING` is the structural half of OD-08's budget cap: no single
 * request can ask for more, whatever a caller passes. The monetary cap itself is
 * an operator decision and is configured per host, not hard-coded here.
 *
 * The ceiling is larger than a hundred-word gloss needs, and deliberately so:
 * on the configured model family `max_tokens` bounds the model's *thinking plus*
 * its answer, and thinking is on by default. A ceiling sized to the visible
 * answer alone would truncate mid-sentence — which this adapter then correctly
 * rejects as invalid, sending every live call to the fallback and making the
 * live route look broken rather than mis-configured.
 *
 * The two length ceilings below bound a *response*, which is where the
 * adversarial risk is (controller §17.2: "oversized" answers). A model that
 * returns a megabyte of text fails validation and takes the fallback path.
 */
export const MAX_TOKENS_CEILING = 4096;
export const MAX_EXPLANATION_CHARS = 1200;
export const MAX_TARGET_FORM_CHARS = 32;
export const MAX_CONTEXT_EXCERPT_CHARS = 400;

/**
 * The minimum context the provider is given (REQ-ARCH-07: "the minimum context
 * for the requested operation").
 *
 * What is deliberately absent is the point of the shape: no `threadId`, no
 * encounter identifiers, no promotion state, no learner history, no source
 * locator. A gloss for 分岐 in a sentence needs the form and the sentence; it
 * does not need to know whose thread it is or how that thread has been going,
 * and a field that is not in the type cannot be added by a call site in a hurry.
 *
 * `contentClass` is the OD-08 consent marker and its only Phase-0 value is
 * `seeded-fixture`. Widening it is an operator decision recorded verbatim in
 * the capsule (controller WP-12 trial rule), not a code change.
 */
export const threadContextSchema = z.strictObject({
  contentClass: z.literal('seeded-fixture'),
  /** The written form the candidate is about. */
  targetForm: nonEmptyString.max(MAX_TARGET_FORM_CHARS),
  /** One seeded sentence or passage line the form occurs in. */
  excerpt: nonEmptyString.max(MAX_CONTEXT_EXCERPT_CHARS),
  /** Which seed record the excerpt came from, so the request is auditable. */
  seedRef: nonEmptyString,
});

export type AiThreadContext = z.infer<typeof threadContextSchema>;

export const aiRequestEnvelopeSchema = z.strictObject({
  taskClass: z.literal(TASK_CLASS),
  inputHash: nonEmptyString,
  promptFamilyId: nonEmptyString,
  promptVersion: nonEmptyString,
  threadContext: threadContextSchema,
  maxTokens: z.number().int().min(1).max(MAX_TOKENS_CEILING),
});

export type AiRequestEnvelope = z.infer<typeof aiRequestEnvelopeSchema>;

/**
 * What a candidate actually says.
 *
 * Display text and nothing else. There is no confidence number: REQ-AI-03 lists
 * confidence as an envelope field in the full architecture, and a Phase-0
 * adapter that invented one from a single unmeasured exchange would be
 * publishing an unmeasured number (REQ-GATE-03). The field is recorded as a
 * seam in the README instead of faked here.
 */
export const candidatePayloadSchema = z.strictObject({
  targetForm: nonEmptyString.max(MAX_TARGET_FORM_CHARS),
  explanation: nonEmptyString.max(MAX_EXPLANATION_CHARS),
});

export type AiCandidatePayload = z.infer<typeof candidatePayloadSchema>;

/**
 * Deterministic checks, run before anything renders (REQ-AI-04).
 *
 * `targetFormPresent` is computed here, not reported by the model — a claim a
 * generator makes about its own output is not a check. `isLabeled` is a
 * constant because labelling is unconditional.
 */
export const candidateChecksSchema = z.strictObject({
  targetFormPresent: z.boolean(),
  isLabeled: z.literal(true),
});

export const aiCandidateEnvelopeSchema = z.strictObject({
  candidateId: nonEmptyString,
  payload: candidatePayloadSchema,
  model: nonEmptyString,
  provider: nonEmptyString,
  promptVersion: nonEmptyString,
  createdAt: isoInstantSchema,
  checks: candidateChecksSchema,
});

export type AiCandidateEnvelope = z.infer<typeof aiCandidateEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const issuesOf = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);

export function parseAiRequestEnvelope(value: unknown): AiRequestEnvelope {
  const result = aiRequestEnvelopeSchema.safeParse(value);
  if (!result.success) throw new AiRequestValidationError(issuesOf(result.error));
  return result.data;
}

/**
 * Validate a candidate envelope.
 *
 * @throws AiResponseValidationError with zod *paths*, never values — a hostile
 *   or oversized payload must not reach a log through its own rejection.
 */
export function parseAiCandidateEnvelope(value: unknown): AiCandidateEnvelope {
  const result = aiCandidateEnvelopeSchema.safeParse(value);
  if (!result.success) throw new AiResponseValidationError(issuesOf(result.error));
  return result.data;
}

// ---------------------------------------------------------------------------
// Deterministic checks
// ---------------------------------------------------------------------------

/**
 * Does the explanation actually contain the form it claims to be about?
 *
 * NFKC-folded, because a model may answer with the full-width or compatibility
 * variant of a character the seed stores in its canonical form; those are the
 * same word to a reader and would otherwise read as a failed check.
 */
export function targetFormPresent(payload: AiCandidatePayload): boolean {
  const fold = (text: string): string => text.normalize('NFKC');
  return fold(payload.explanation).includes(fold(payload.targetForm));
}

// ---------------------------------------------------------------------------
// Handing the envelope to the domain
// ---------------------------------------------------------------------------

/**
 * The metadata half of the envelope, in the exact shape `CandidateAttached`
 * takes (controller §6.1, ADR-002).
 *
 * `payload` is **not** part of it, and that omission is the privacy design, not
 * an oversight: the event log records that a candidate existed, what produced
 * it, and whether its checks passed — never what it said (controller §12, §15).
 * The text lives in app memory for as long as the learner is looking at it, and
 * survives into the log only if they explicitly accept it as a note.
 */
export function toCandidateEnvelopeMetadata(
  request: AiRequestEnvelope,
  envelope: AiCandidateEnvelope,
): CandidateEnvelopeMetadata {
  return {
    taskClass: TASK_CLASS,
    inputHash: request.inputHash,
    promptFamilyId: request.promptFamilyId,
    promptVersion: envelope.promptVersion,
    model: envelope.model,
    provider: envelope.provider,
    createdAt: envelope.createdAt,
    checks: {
      targetFormPresent: envelope.checks.targetFormPresent,
      isLabeled: true,
    },
  };
}
