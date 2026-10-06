import { inputHashOf } from '@bunki/ai/hash';
import { isoInstantSchema } from '@bunki/domain/events/shared';
import { z } from 'zod';

import {
  articleAnchorSchema,
  articleReference,
  articleReferenceSchema,
  assertArticleOperation,
  capabilityInputSchema,
  parseArticleVersion,
  resolveArticleAnchor,
  vocabularySuggestionSchema,
  type ArticleLineage,
  type VocabularySuggestion,
} from './article.ts';
import {
  immutable,
  idSchema,
  parse,
  ReadingValidationError,
  shaSchema,
  textSchema,
  webUrlSchema,
  type DeepReadonly,
} from './common.ts';
import {
  generationJobIdentitySchema,
  normalizeArticleIntake,
  parseArticleCandidate,
  type ArticleCandidate,
  type GenerationJobIdentity,
} from './intake.ts';

export const GENERATION_BRIEF_VERSION = 1;
export const GENERATION_LIMITS = immutable({
  interests: 12,
  interestCharacters: 80,
  targets: 12,
  recentArticleIds: 40,
  recentTopics: 10,
  sourceCharacters: 4000,
  providerPayloadCharacters: 16_000,
  draftCharacters: 12_000,
  suggestedWords: 24,
});

const levelSchema = z.enum(['N5', 'N4', 'N3', 'N2', 'N1']);
const dimensionSchema = z.enum(['lexis', 'readings', 'syntax', 'production']);
const dimensionNames = dimensionSchema.options;
const modeSchema = z.enum(['original-factual', 'original-fiction', 'source-adaptation']);
const styleSchema = z.strictObject({
  genre: z.enum(['explainer', 'essay', 'dialogue', 'profile', 'fiction']),
  length: z.enum(['short', 'medium', 'long']),
  register: z.enum(['casual', 'neutral', 'formal']),
  challenge: z.enum(['comfortable', 'stretch', 'free']),
});
const settingsSchema = styleSchema.extend({
  mode: modeSchema,
  interests: z
    .array(textSchema(GENERATION_LIMITS.interestCharacters))
    .max(GENERATION_LIMITS.interests),
  startingLevel: levelSchema.nullable(),
});
export type GenerationSettings = DeepReadonly<z.infer<typeof settingsSchema>>;

export function parseGenerationSettings(raw: unknown): GenerationSettings {
  return immutable(parse(settingsSchema, raw));
}

/** A selected read-only projection, not the KAGAMI ledger or a new proficiency model. */
export const generationBandSchema = z.strictObject({
  dimension: dimensionSchema,
  edge: levelSchema.nullable(),
  measured: z.number().int().nonnegative().max(10_000_000),
  observed: z.number().int().nonnegative().max(10_000_000),
  sampled: z.boolean(),
  disagreement: z.boolean(),
  evidenceRefs: z.array(idSchema).max(24).default([]),
});
const generationTargetSchema = z.strictObject({
  kind: z.enum(['word', 'grammar']),
  form: textSchema(80),
  reason: z.enum(['explicit', 'interest', 'recent-struggle']),
  evidenceRefs: z.array(idSchema).max(8).default([]),
});
const learnerSelectionSchema = z.strictObject({
  modelVersion: idSchema,
  bands: z.array(generationBandSchema).max(4),
  targets: z.array(generationTargetSchema).max(GENERATION_LIMITS.targets),
});

export const generationBriefInputSchema = generationJobIdentitySchema.extend({
  createdAt: isoInstantSchema,
  modelId: textSchema(200),
  promptVersion: idSchema,
  settings: settingsSchema,
  learner: learnerSelectionSchema,
  recentArticleIds: z.array(idSchema).max(GENERATION_LIMITS.recentArticleIds).default([]),
  recentTopics: z.array(textSchema(100)).max(GENERATION_LIMITS.recentTopics).default([]),
  source: z
    .strictObject({ article: z.unknown(), anchor: articleAnchorSchema })
    .nullable()
    .default(null),
});
export type GenerationBriefInput = DeepReadonly<z.input<typeof generationBriefInputSchema>>;

const providerBandSchema = z.strictObject({
  dimension: dimensionSchema,
  workingBand: levelSchema.nullable(),
  evidence: z.enum(['sparse', 'measured', 'conflicting']),
  observedSignalsPresent: z.boolean(),
});
export const generationProviderPayloadSchema = z.strictObject({
  schemaVersion: z.literal(GENERATION_BRIEF_VERSION),
  task: z.literal('japanese-article-draft'),
  mode: modeSchema,
  interests: z
    .array(textSchema(GENERATION_LIMITS.interestCharacters))
    .max(GENERATION_LIMITS.interests),
  style: styleSchema,
  startingLevel: levelSchema.nullable(),
  learningContext: z.strictObject({
    bands: z.array(providerBandSchema).length(4),
    targets: z
      .array(z.strictObject({ kind: z.enum(['word', 'grammar']), form: textSchema(80) }))
      .max(GENERATION_LIMITS.targets),
  }),
  recentTopics: z.array(textSchema(100)).max(GENERATION_LIMITS.recentTopics),
  sourceExcerpt: z
    .strictObject({
      title: textSchema(500),
      attribution: textSchema(1000),
      url: webUrlSchema.nullable(),
      text: textSchema(GENERATION_LIMITS.sourceCharacters),
      contentRole: z.literal('untrusted-source-text'),
    })
    .nullable(),
  responseRules: z.strictObject({
    format: z.literal('plain-text'),
    teachingStatus: z.literal('pending-editorial'),
    maxCharacters: z.number().int().min(1).max(GENERATION_LIMITS.draftCharacters),
    maxSuggestedWords: z.literal(GENERATION_LIMITS.suggestedWords),
    materialClaimsNeedReferences: z.boolean(),
  }),
});
export type GenerationProviderPayload = DeepReadonly<
  z.infer<typeof generationProviderPayloadSchema>
>;

const briefContentSchema = generationJobIdentitySchema.extend({
  schemaVersion: z.literal(GENERATION_BRIEF_VERSION),
  createdAt: isoInstantSchema,
  modelId: textSchema(200),
  promptVersion: idSchema,
  settings: settingsSchema,
  learner: learnerSelectionSchema,
  recentArticleIds: z.array(idSchema).max(GENERATION_LIMITS.recentArticleIds),
  source: articleReferenceSchema.nullable(),
  providerPayload: generationProviderPayloadSchema,
  providerPayloadSha256: shaSchema,
});
const briefSchema = briefContentSchema.extend({ briefId: idSchema, briefSha256: shaSchema });
export type GenerationBrief = DeepReadonly<z.infer<typeof briefSchema>>;

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()))];
}

function projectBands(bands: readonly z.infer<typeof generationBandSchema>[]) {
  const byDimension = new Map(bands.map((band) => [band.dimension, band]));
  if (byDimension.size !== bands.length)
    throw new ReadingValidationError('invalid-input', ['learner.bands']);
  return dimensionNames.map((dimension) => {
    const selected = byDimension.get(dimension);
    const sampled = selected?.sampled === true && selected.measured > 0;
    return {
      dimension,
      workingBand: sampled ? selected.edge : null,
      evidence: sampled
        ? selected.disagreement
          ? ('conflicting' as const)
          : ('measured' as const)
        : ('sparse' as const),
      observedSignalsPresent: (selected?.observed ?? 0) > 0,
    };
  });
}

/** Shared uncertainty policy for bounded teaching queries. This projects
 * selected bands only; it admits no evidence and changes no learner state. */
export function projectGenerationBands(raw: unknown) {
  return immutable(projectBands(parse(z.array(generationBandSchema).max(4), raw)));
}

/** Explicit selections only. A raw state/chat/credential key is a rejection, not a prompt input. */
export function buildGenerationBrief(raw: unknown): GenerationBrief {
  const input = parse(generationBriefInputSchema, raw);
  const bands = projectGenerationBands(input.learner.bands);
  const targetKeys = new Set(
    input.learner.targets.map((target) => `${target.kind}:${target.form}`),
  );
  if (targetKeys.size !== input.learner.targets.length) {
    throw new ReadingValidationError('invalid-input', ['learner.targets']);
  }
  if (
    (input.settings.mode === 'original-fiction') !== (input.settings.genre === 'fiction') ||
    (input.settings.mode === 'source-adaptation') !== (input.source !== null)
  ) {
    throw new ReadingValidationError('invalid-input', ['settings.mode']);
  }
  const parent = input.source ? parseArticleVersion(input.source.article) : null;
  let sourceExcerpt: GenerationProviderPayload['sourceExcerpt'] = null;
  if (parent && input.source) {
    assertArticleOperation(parent, 'ai-transform');
    const excerpt = resolveArticleAnchor(parent, input.source.anchor);
    sourceExcerpt = {
      title: parent.title,
      attribution: parent.source.attribution,
      url: parent.canonicalUrl,
      text: excerpt,
      contentRole: 'untrusted-source-text',
    };
  }
  const { mode, interests, startingLevel, ...style } = input.settings;
  const providerPayload = parse(generationProviderPayloadSchema, {
    schemaVersion: GENERATION_BRIEF_VERSION,
    task: 'japanese-article-draft',
    mode,
    interests: unique(interests),
    style,
    startingLevel,
    learningContext: {
      bands,
      targets: input.learner.targets.map(({ kind, form }) => ({ kind, form })),
    },
    recentTopics: unique(input.recentTopics),
    sourceExcerpt,
    responseRules: {
      format: 'plain-text',
      teachingStatus: 'pending-editorial',
      maxCharacters: { short: 2000, medium: 5000, long: 12_000 }[style.length],
      maxSuggestedWords: GENERATION_LIMITS.suggestedWords,
      materialClaimsNeedReferences: mode !== 'original-fiction',
    },
  });
  if (JSON.stringify(providerPayload).length > GENERATION_LIMITS.providerPayloadCharacters) {
    throw new ReadingValidationError('invalid-input', ['provider-payload-budget']);
  }
  const content = parse(briefContentSchema, {
    schemaVersion: GENERATION_BRIEF_VERSION,
    owner: input.owner,
    job: input.job,
    createdAt: input.createdAt,
    modelId: input.modelId,
    promptVersion: input.promptVersion,
    settings: { ...input.settings, interests: unique(interests) },
    learner: input.learner,
    recentArticleIds: unique(input.recentArticleIds),
    source: parent ? articleReference(parent) : null,
    providerPayload,
    providerPayloadSha256: inputHashOf(providerPayload),
  });
  const briefSha256 = inputHashOf(content);
  return immutable({ ...content, briefId: `generation-brief:${briefSha256}`, briefSha256 });
}

export function parseGenerationBrief(raw: unknown): GenerationBrief {
  const { briefId, briefSha256, ...content } = parse(briefSchema, raw);
  if (
    briefSha256 !== inputHashOf(content) ||
    briefId !== `generation-brief:${briefSha256}` ||
    content.providerPayloadSha256 !== inputHashOf(content.providerPayload) ||
    JSON.stringify(content.providerPayload).length > GENERATION_LIMITS.providerPayloadCharacters
  ) {
    throw new ReadingValidationError('version-mismatch');
  }
  return immutable({ ...content, briefId, briefSha256 });
}

/** The only shape a provider can propose. No approval, source policy or learning command fields. */
export const articleDraftSchema = z.strictObject({
  title: textSchema(500),
  text: textSchema(GENERATION_LIMITS.draftCharacters),
  suggestedWords: z.array(textSchema(80)).max(GENERATION_LIMITS.suggestedWords).default([]),
  references: z
    .array(z.strictObject({ url: webUrlSchema, title: textSchema(300) }))
    .max(16)
    .default([]),
});
export type ArticleDraft = DeepReadonly<z.input<typeof articleDraftSchema>>;

const draftContextSchema = z.strictObject({
  completedAt: isoInstantSchema,
  provider: textSchema(300),
  actualModel: textSchema(200),
  capabilities: capabilityInputSchema,
  sourceArticle: z.unknown().optional(),
});
export type ArticleDraftContext = DeepReadonly<z.input<typeof draftContextSchema>>;

const dictionaryWordSchema = vocabularySuggestionSchema;
export type DictionaryWord = DeepReadonly<z.infer<typeof dictionaryWordSchema>>;

export interface ArticleAcceptanceBoundary {
  /** Compare both owner/session epoch AND exact job revision. A missing authority must return false. */
  isCurrent(identity: GenerationJobIdentity): boolean;
  /** Return the validated local dictionary entry, never the provider's assertion of one. */
  lookupWord(form: string): DictionaryWord | null;
}

/**
 * Call after awaiting the provider, then commit synchronously under the same
 * owner or re-check atomically in the repository transaction. This package has
 * no repository, scheduler, evidence or promotion capability. Acceptance means
 * a durable-candidate handoff, not editorial approval or language correctness.
 */
export function acceptArticleDraft(
  raw: unknown,
  rawBrief: GenerationBrief,
  rawContext: unknown,
  boundary: ArticleAcceptanceBoundary,
): ArticleCandidate {
  const brief = parseGenerationBrief(rawBrief);
  const identity: GenerationJobIdentity = { owner: brief.owner, job: brief.job };
  if (boundary.isCurrent(identity) !== true) throw new ReadingValidationError('stale-generation');
  const draft = parse(articleDraftSchema, raw);
  const context = parse(draftContextSchema, rawContext);
  if (draft.text.length > brief.providerPayload.responseRules.maxCharacters) {
    throw new ReadingValidationError('invalid-input', ['draft']);
  }
  // Wall clocks can move backwards. Preserve raw receipt time in provenance;
  // owner/session/job revision, rather than timestamp order, decides acceptance.
  const mode = brief.providerPayload.mode;
  if (mode === 'original-fiction' && draft.references.length > 0) {
    throw new ReadingValidationError('invalid-input', ['references']);
  }
  const generation = {
    briefId: brief.briefId,
    briefSha256: brief.briefSha256,
    promptVersion: brief.promptVersion,
    requestedModel: brief.modelId,
    actualModel: context.actualModel,
    provider: context.provider,
  };
  const parent =
    context.sourceArticle === undefined ? null : parseArticleVersion(context.sourceArticle);
  let lineage: ArticleLineage;
  if (mode === 'source-adaptation') {
    if (
      !parent ||
      !brief.source ||
      inputHashOf(articleReference(parent)) !== inputHashOf(brief.source)
    ) {
      throw new ReadingValidationError('version-mismatch');
    }
    assertArticleOperation(parent, 'ai-transform');
    const permission = parent.capabilities['ai-transform'];
    if (permission.status !== 'allowed')
      throw new ReadingValidationError('operation-not-permitted');
    lineage = {
      kind: mode,
      parents: [articleReference(parent)],
      processingBasisRefs: [permission.basis.reference],
      generation,
    };
  } else {
    if (parent) throw new ReadingValidationError('invalid-input', ['sourceArticle']);
    lineage =
      mode === 'original-fiction'
        ? { kind: mode, generation }
        : {
            kind: mode,
            references: draft.references.map((reference) => ({
              ...reference,
              verifiedAt: null,
              evidenceRef: null,
            })),
            generation,
          };
  }
  const sourceId = mode === 'source-adaptation' ? 'kairo-adaptation' : 'kairo-original';
  const attribution =
    mode === 'source-adaptation' ? 'KAIRO adaptation — AI draft' : 'KAIRO original — AI draft';
  const suggestions: VocabularySuggestion[] = [];
  const seen = new Set<string>();
  for (const requested of unique(draft.suggestedWords)) {
    const found = boundary.lookupWord(requested);
    if (found === null) continue;
    const word = parse(dictionaryWordSchema, found);
    if (
      word.form.normalize('NFKC') !== requested.normalize('NFKC') ||
      !draft.text.normalize('NFKC').includes(word.form.normalize('NFKC')) ||
      seen.has(word.lexemeId)
    )
      continue;
    seen.add(word.lexemeId);
    suggestions.push(word);
  }
  const candidate = normalizeArticleIntake(
    {
      itemId: inputHashOf(identity),
      canonicalUrl: null,
      title: draft.title,
      publishedAt: null,
      body: { text: draft.text },
    },
    {
      source: {
        id: sourceId,
        name: mode === 'source-adaptation' ? 'KAIRO adaptation' : 'KAIRO original',
        attribution,
      },
      capabilities: context.capabilities,
      lineage,
      suggestedVocabulary: suggestions,
      provenance: [
        {
          sourceId,
          sourceVersion: brief.briefSha256,
          sourceUrl: parent?.canonicalUrl ?? null,
          attribution,
          license: 'Generated candidate; operation permissions are recorded separately.',
          modification: mode === 'source-adaptation' ? 'derived' : 'original',
          evidenceRef: brief.briefId,
          retrievedAt: context.completedAt,
        },
      ],
      adaptationParents: parent ? [parent] : [],
    },
  );
  // The dictionary adapter may synchronously trigger an account/job change.
  if (boundary.isCurrent(identity) !== true) throw new ReadingValidationError('stale-generation');
  return parseArticleCandidate({ ...candidate, generationJob: identity });
}
