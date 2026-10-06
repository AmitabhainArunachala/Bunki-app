import { inputHashOf, sha256Hex } from '@bunki/ai/hash';
import { z } from 'zod';
import {
  AssessmentValidationError,
  assertJsonBudget,
  digestSchema,
  idSchema,
  immutable,
  parse,
  textSchema,
  type DeepReadonly,
} from './common.ts';
import {
  artifactReference,
  createFormVersion,
  createItemVersion,
  createPassageVersion,
  unknownAssessmentRights,
  type FormVersion,
  type ItemVersion,
  type PassageVersion,
} from './content.ts';

const legacyTitleSchema = z.object({ ja: textSchema(1000), en: textSchema(1000) }).passthrough();
const legacySourceSchema = z
  .object({
    name: textSchema(500),
    attribution: textSchema(2000),
    licence: textSchema(500),
    url: z.union([textSchema(4096), z.literal('')]).optional(),
  })
  .passthrough();
const legacyItemSchema = z
  .object({
    type: idSchema,
    q: textSchema(32_000),
    qEn: textSchema(4000),
    opts: z.array(textSchema(4000)).min(2).max(12),
    right: z.number().int().min(0),
    why: textSchema(16_000),
    subject: idSchema.optional(),
    sid: z.number().int().nonnegative().optional(),
  })
  .passthrough()
  .refine((item) => item.right < item.opts.length);
const legacySectionSchema = z
  .object({
    type: z.enum(['moji-goi', 'bunpou', 'dokkai']),
    title: legacyTitleSchema,
    minutes: z.number().int().positive().max(240),
    items: z.array(legacyItemSchema).min(1).max(1000),
    passage: z
      .object({
        text: textSchema(120_000),
        source: textSchema(500),
        licence: textSchema(500),
        attribution: textSchema(2000),
        url: z.union([textSchema(4096), z.literal('')]),
        articleId: idSchema,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
const legacySetSchema = z
  .object({
    schemaVersion: z.literal(1),
    setId: idSchema,
    kind: z.literal('jlpt'),
    level: z.enum(['N5', 'N4', 'N3', 'N2', 'N1']),
    title: legacyTitleSchema,
    approved: z.boolean(),
    built: textSchema(1000),
    rights: z
      .object({
        note: textSchema(2000),
        noteEn: textSchema(2000),
        sources: z.array(legacySourceSchema).max(64),
      })
      .passthrough(),
    sections: z.array(legacySectionSchema).min(1).max(32),
  })
  .passthrough();

/** Clone all JSON fields, including unknown historical fields, before freezing our own result. */
function originalSnapshot(raw: unknown): unknown {
  assertJsonBudget(raw);
  return JSON.parse(JSON.stringify(raw)) as unknown;
}

export interface LegacySetAdaptation {
  readonly format: 'kairo-legacy-assessment-evidence';
  readonly v: 1;
  readonly kind: 'set';
  readonly sourceContentSha256: string;
  readonly original: unknown;
  readonly form: FormVersion;
  readonly label: string;
  readonly review: 'unreviewed';
  readonly issues: readonly string[];
}

/**
 * Preserve the source while projecting a short, unreviewed practice form. A legacy
 * approved flag or rights note does not become a version-bound decision or grant.
 */
export function adaptLegacySet(raw: unknown): LegacySetAdaptation {
  const original = originalSnapshot(raw);
  const set = parse(legacySetSchema, original);
  const sourceContentSha256 = inputHashOf(original);
  const provenance = {
    kind: 'legacy-unverified' as const,
    authorRef: null,
    processRef: `legacy-set:${sourceContentSha256}`,
    sources: set.rights.sources.map((source, index) => ({
      id: `legacy-source:${set.setId}:${index + 1}`,
      label: source.attribution,
      uri: source.url || null,
      licenseClaim: source.licence,
    })),
  };
  const items: ItemVersion[] = [];
  const passages: PassageVersion[] = [];
  const sections: {
    id: string;
    title: string;
    skill: 'vocabulary' | 'grammar' | 'reading';
    itemIds: string[];
  }[] = [];
  const timingBlocks: {
    id: string;
    sectionIds: string[];
    durationMs: number;
    clock: 'active-only';
    authority: { kind: 'authoring-rule'; ruleId: string };
  }[] = [];
  set.sections.forEach((section, sectionIndex) => {
    const sectionId = `legacy-section:${set.setId}:${sectionIndex + 1}`;
    const skill =
      section.type === 'moji-goi'
        ? 'vocabulary'
        : section.type === 'bunpou'
          ? 'grammar'
          : 'reading';
    const passage = section.passage
      ? createPassageVersion({
          format: 'kairo-assessment-passage',
          v: 1,
          id: `legacy-passage:${set.setId}:${sectionIndex + 1}`,
          title: null,
          text: section.passage.text,
          textSha256: sha256Hex(section.passage.text),
          language: 'ja',
          locationUnit: 'utf16-code-unit',
          provenance: {
            ...provenance,
            sources: [
              {
                id: section.passage.articleId,
                label: section.passage.attribution,
                uri: section.passage.url || null,
                licenseClaim: section.passage.licence,
              },
            ],
          },
          rights: unknownAssessmentRights(),
        })
      : null;
    if (passage) passages.push(passage);
    const itemIds: string[] = [];
    section.items.forEach((item, itemIndex) => {
      const id = `legacy-item:${set.setId}:${sectionIndex + 1}:${itemIndex + 1}`;
      itemIds.push(id);
      items.push(
        createItemVersion({
          format: 'kairo-assessment-item',
          v: 1,
          id,
          provenance,
          rights: unknownAssessmentRights(),
          skill,
          task: `legacy:${item.type}`,
          prompt: item.q,
          translatedInstruction: item.qEn,
          rationale: item.why,
          passages: passage ? [artifactReference(passage)] : [],
          media: [],
          response: {
            kind: 'selected',
            options: item.opts.map((text, index) => ({ id: `option:${index}`, text })),
            answerOptionId: `option:${item.right}`,
          },
          subjects: item.subject ? [item.subject] : [],
        }),
      );
    });
    sections.push({ id: sectionId, title: section.title.en, skill, itemIds });
    timingBlocks.push({
      id: `legacy-timing:${set.setId}:${sectionIndex + 1}`,
      sectionIds: [sectionId],
      durationMs: section.minutes * 60_000,
      clock: 'active-only',
      authority: { kind: 'authoring-rule', ruleId: 'legacy-reported-duration-unverified/v1' },
    });
  });
  const form = createFormVersion({
    format: 'kairo-assessment-form',
    v: 1,
    id: `legacy-form:${set.setId}`,
    provenance,
    rights: unknownAssessmentRights(),
    title: `${set.level} short practice · unreviewed`,
    exam: { family: 'jlpt', track: set.level },
    scope: 'short-practice',
    blueprintId: null,
    items,
    passages,
    media: [],
    sections,
    timingBlocks,
    authoring: {
      policyVersion: 'legacy-preservation/v1',
      countsAre: 'authoring-rules',
      requirements: [],
    },
  });
  return immutable({
    format: 'kairo-legacy-assessment-evidence',
    v: 1,
    kind: 'set',
    sourceContentSha256,
    original,
    form,
    label: form.title,
    review: 'unreviewed',
    issues: [
      'source-provenance-and-rights-unverified',
      'linguistic-correctness-not-established',
      'not-a-complete-reviewed-form',
      'no-listening-media',
      ...(set.approved ? ['legacy-approval-not-version-bound'] : []),
    ],
  });
}

const historicalSummarySchema = z
  .object({
    score: z.number().finite().optional(),
    total: z.number().finite().optional(),
    ts: z.number().finite().optional(),
  })
  .passthrough();
export interface LegacySummaryEvidence {
  readonly format: 'kairo-legacy-assessment-evidence';
  readonly v: 1;
  readonly kind: 'summary';
  readonly evidenceId: string;
  readonly setId: string;
  readonly sourceContentSha256: string;
  readonly original: unknown;
  readonly completeness: 'summary-only';
  readonly binding: 'unverified';
  readonly attemptId: null;
  readonly formRevision: null;
  readonly answers: null;
  readonly reported: {
    readonly score: number | null;
    readonly total: number | null;
    readonly timestamp: number | null;
  };
  readonly issues: readonly string[];
}

/** A latest-per-set summary cannot recreate overwritten sittings, answers or form versions. */
export function preserveLegacySummary(setIdRaw: unknown, raw: unknown): LegacySummaryEvidence {
  const setId = parse(idSchema, setIdRaw);
  const original = originalSnapshot(raw);
  const summary = parse(historicalSummarySchema, original);
  const sourceContentSha256 = inputHashOf({ setId, record: original });
  const issues = [
    'missing-attempt-identity',
    'missing-form-revision',
    'missing-item-responses',
    'historical-sittings-not-reconstructable',
  ];
  if (
    summary.score === undefined ||
    summary.total === undefined ||
    !Number.isSafeInteger(summary.score) ||
    !Number.isSafeInteger(summary.total) ||
    summary.score < 0 ||
    summary.total < 0 ||
    summary.score > summary.total
  ) {
    issues.push('reported-score-unverified');
  }
  return immutable({
    format: 'kairo-legacy-assessment-evidence',
    v: 1,
    kind: 'summary',
    evidenceId: `legacy-summary:${sourceContentSha256}`,
    setId,
    sourceContentSha256,
    original,
    completeness: 'summary-only',
    binding: 'unverified',
    attemptId: null,
    formRevision: null,
    answers: null,
    reported: {
      score: summary.score ?? null,
      total: summary.total ?? null,
      timestamp: summary.ts ?? null,
    },
    issues,
  });
}

const legacyRunSchema = z
  .object({
    setId: textSchema(40),
    level: z.string().max(200).optional(),
    ix: z.number().int().min(0).max(400),
    answers: z.array(z.number().int().min(0).max(3).nullable()).max(400),
    ts: z.number().finite().optional(),
    done: z.number().finite().optional(),
  })
  .passthrough();
export type LegacyRun = DeepReadonly<z.infer<typeof legacyRunSchema>>;

/** The current set file cannot prove which version an old index-based run displayed. */
export function preserveLegacyRun(raw: unknown) {
  const original = originalSnapshot(raw);
  const run = parse(legacyRunSchema, original);
  const sourceContentSha256 = inputHashOf(original);
  return immutable({
    format: 'kairo-legacy-assessment-evidence' as const,
    v: 1 as const,
    kind: 'run' as const,
    evidenceId: `legacy-run:${sourceContentSha256}`,
    sourceContentSha256,
    original,
    reported: run,
    binding: 'unverified' as const,
    attemptId: null,
    formRevision: null,
    resumeAllowed: false as const,
    admission: 'practice-only' as const,
    issues: [
      'missing-attempt-identity',
      'missing-form-revision',
      'index-responses-not-bound-to-current-content',
      'timing-and-exposure-history-unverified',
    ],
  });
}

/** Recompute the original snapshot and all projected content at every restore/network boundary. */
export function parseLegacySetAdaptation(raw: unknown): LegacySetAdaptation {
  const wrapper = parse(
    z.strictObject({
      format: z.literal('kairo-legacy-assessment-evidence'),
      v: z.literal(1),
      kind: z.literal('set'),
      sourceContentSha256: digestSchema,
      original: z.unknown(),
      form: z.unknown(),
      label: textSchema(1000),
      review: z.literal('unreviewed'),
      issues: z.array(textSchema(1000)).max(32),
    }),
    raw,
  );
  const expected = adaptLegacySet(wrapper.original);
  if (inputHashOf(wrapper) !== inputHashOf(expected))
    throw new AssessmentValidationError('revision-mismatch');
  return expected;
}

/** Strict rehydration for all three evidence wrappers; unknown source fields stay inside original. */
export function parseLegacyEvidence(
  raw: unknown,
): LegacySetAdaptation | LegacySummaryEvidence | ReturnType<typeof preserveLegacyRun> {
  const wrapper = parse(z.record(z.string(), z.unknown()), raw);
  const kind = wrapper['kind'];
  if (kind === 'set') return parseLegacySetAdaptation(raw);
  const expected =
    kind === 'summary'
      ? preserveLegacySummary(wrapper['setId'], wrapper['original'])
      : kind === 'run'
        ? preserveLegacyRun(wrapper['original'])
        : null;
  if (expected === null) throw new AssessmentValidationError('invalid-input', ['kind']);
  if (inputHashOf(wrapper) !== inputHashOf(expected))
    throw new AssessmentValidationError('revision-mismatch');
  return expected;
}
