import { isoInstantSchema } from '@bunki/domain/events/shared';
import { z } from 'zod';
import {
  artifactReferenceSchema,
  assertRevision,
  assertUnique,
  AssessmentValidationError,
  digestSchema,
  idSchema,
  immutable,
  parse,
  revisionOf,
  textSchema,
  type DeepReadonly,
} from './common.ts';
import { artifactReference, inspectFormStructure, parseFormVersion } from './content.ts';

export const EDITORIAL_ASPECTS = Object.freeze([
  'language',
  'answer-key',
  'level-fit',
  'coverage',
  'timing',
  'rights',
  'audio',
] as const);
/** Existing v1 checklist producers keep the seven required aspects above. */
export const OPTIONAL_EDITORIAL_ASPECTS = Object.freeze(['visual'] as const);
export type EditorialAspect =
  (typeof EDITORIAL_ASPECTS)[number] | (typeof OPTIONAL_EDITORIAL_ASPECTS)[number];
const aspectSchema = z.strictObject({
  aspect: z.enum([...EDITORIAL_ASPECTS, ...OPTIONAL_EDITORIAL_ASPECTS]),
  result: z.enum(['pass', 'fail', 'not-applicable']),
  note: textSchema(2000),
  evidenceRefs: z.array(idSchema).max(32),
});
const decisionPayloadSchema = z.strictObject({
  format: z.literal('kairo-assessment-editorial-decision'),
  v: z.literal(1),
  id: idSchema,
  subject: artifactReferenceSchema,
  reviewer: z.strictObject({ kind: z.enum(['human', 'automated']), id: idSchema }),
  checklistVersion: idSchema,
  decidedAt: isoInstantSchema,
  verdict: z.enum(['approve', 'reject', 'review']),
  aspects: z
    .array(aspectSchema)
    .min(EDITORIAL_ASPECTS.length)
    .max(EDITORIAL_ASPECTS.length + OPTIONAL_EDITORIAL_ASPECTS.length),
});
const decisionVersionSchema = decisionPayloadSchema.extend({
  revisionId: idSchema,
  sha256: digestSchema,
});
export type EditorialDecision = DeepReadonly<z.infer<typeof decisionVersionSchema>>;

/** A recorded assertion, not authentication. Machine output cannot assert human approval. */
export function createEditorialDecision(raw: unknown): EditorialDecision {
  const decision = parse(decisionPayloadSchema, raw);
  assertUnique(
    decision.aspects.map((aspect) => aspect.aspect),
    'aspects',
  );
  if (
    EDITORIAL_ASPECTS.some(
      (required) => !decision.aspects.some((entry) => entry.aspect === required),
    )
  ) {
    throw new AssessmentValidationError('invalid-input', ['aspects']);
  }
  if (
    decision.verdict === 'approve' &&
    (decision.reviewer.kind !== 'human' ||
      decision.aspects.some((aspect) => aspect.result === 'fail'))
  ) {
    throw new AssessmentValidationError('invalid-input', ['verdict']);
  }
  return immutable(revisionOf('editorial', decision));
}
export function parseEditorialDecision(raw: unknown): EditorialDecision {
  const { revisionId, sha256, ...payload } = parse(decisionVersionSchema, raw);
  const decision = createEditorialDecision(payload);
  assertRevision('editorial', { revisionId, sha256 }, payload);
  return decision;
}

const authoritySchema = z.strictObject({
  kind: z.literal('host-verified-review-authority'),
  policyVersion: idSchema,
  checklistVersion: idSchema,
  reviewerIds: z.array(idSchema).min(1).max(64),
});
export type ReviewAuthority = DeepReadonly<z.infer<typeof authoritySchema>>;
export interface ReleaseReview {
  readonly form: ReturnType<typeof artifactReference>;
  readonly status: 'unreviewed' | 'blocked' | 'reviewed-practice' | 'reviewed-full-form';
  readonly productionEligible: boolean;
  readonly authorityPolicyVersion: string | null;
  readonly decisionRevisionIds: readonly string[];
  readonly problems: readonly string[];
}

/**
 * The host must obtain authority from an authenticated/configured editorial workflow.
 * Imported decisions, tests, hashes or model votes cannot supply that authority argument.
 * One approved form digest binds all embedded item, passage, media and policy revisions.
 */
export function evaluateReleaseReview(
  formRaw: unknown,
  decisionsRaw: unknown,
  authorityRaw: unknown,
): ReleaseReview {
  const form = parseFormVersion(formRaw);
  const decisions = parse(z.array(decisionVersionSchema).max(256), decisionsRaw).map(
    parseEditorialDecision,
  );
  const authority = authorityRaw === null ? null : parse(authoritySchema, authorityRaw);
  if (authority) assertUnique(authority.reviewerIds, 'reviewerIds');
  const subject = artifactReference(form);
  const relevant = decisions.filter(
    (decision) =>
      decision.subject.kind === 'form' &&
      decision.subject.id === subject.id &&
      decision.subject.revisionId === subject.revisionId &&
      decision.subject.sha256 === subject.sha256 &&
      decision.reviewer.kind === 'human' &&
      authority?.reviewerIds.includes(decision.reviewer.id) &&
      decision.checklistVersion === authority.checklistVersion,
  );
  assertUnique(
    relevant.map((decision) => decision.id),
    'decisions.id',
  );
  const approved = relevant.filter((decision) => decision.verdict === 'approve');
  const rejected = relevant.some((decision) => decision.verdict === 'reject');
  const problems = [...inspectFormStructure(form).problems];
  if (rejected) problems.push('editorial-rejection');
  const allContent = [form, ...form.items, ...form.passages, ...form.media];
  if (allContent.some((entry) => entry.provenance.kind === 'legacy-unverified'))
    problems.push('legacy-provenance-unverified');
  if (
    allContent.some(
      (entry) =>
        entry.rights.display.status !== 'allowed' || entry.rights.retain.status !== 'allowed',
    )
  )
    problems.push('display-or-retain-rights-not-established');
  const mustPass: readonly string[] =
    form.scope === 'full-candidate'
      ? EDITORIAL_ASPECTS
      : ['language', 'answer-key', 'level-fit', 'rights'];
  const hasAudio = form.media.some((media) => media.kind === 'audio');
  const hasImage = form.media.some((media) => media.kind === 'image');
  const acceptable = approved.filter(
    (decision) =>
      (!hasImage ||
        decision.aspects.some(
          (aspect) => aspect.aspect === 'visual' && aspect.result === 'pass',
        )) &&
      decision.aspects.every((aspect) => {
        if (aspect.aspect === 'audio')
          return hasAudio ? aspect.result === 'pass' : aspect.result !== 'fail';
        return !mustPass.includes(aspect.aspect) || aspect.result === 'pass';
      }),
  );
  if (approved.length && !acceptable.length) problems.push('required-review-aspects-not-passed');
  const reviewed = acceptable.length > 0;
  const status =
    rejected || (reviewed && problems.length)
      ? 'blocked'
      : !reviewed
        ? 'unreviewed'
        : form.scope === 'full-candidate'
          ? 'reviewed-full-form'
          : 'reviewed-practice';
  return immutable({
    form: subject,
    status,
    productionEligible: reviewed && problems.length === 0,
    authorityPolicyVersion: authority?.policyVersion ?? null,
    decisionRevisionIds: acceptable.map((decision) => decision.revisionId),
    problems,
  });
}

/** Stable honest labels are independent of legacy source titles such as "mock paper". */
export function assessmentLabel(formRaw: unknown, review?: ReleaseReview): string {
  const form = parseFormVersion(formRaw);
  const bound =
    review?.form.id === form.id &&
    review.form.revisionId === form.revisionId &&
    review.form.sha256 === form.sha256;
  const approved = bound && review.productionEligible;
  const kind =
    form.scope === 'short-practice'
      ? 'Short practice'
      : form.scope === 'section-practice'
        ? 'Section practice'
        : approved
          ? 'Full practice form'
          : 'Full-form candidate';
  return `${form.exam.track} ${kind.toLowerCase()} · ${approved ? 'reviewed' : 'unreviewed'}`;
}
