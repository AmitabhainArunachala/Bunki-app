import { inputHashOf, sha256Hex } from '@bunki/ai/hash';
import { isoInstantSchema } from '@bunki/domain/events/shared';
import { z } from 'zod';

import {
  ARTICLE_OPERATIONS,
  ARTICLE_SCHEMA_VERSION,
  MAX_ARTICLE_CHARS,
  articleAnnotationSchema,
  articleIdFor,
  articleLineageSchema,
  articleReference,
  articleReferenceSchema,
  assertArticleOperation,
  capabilityInputSchema,
  createArticleVersion,
  fileReferenceSchema,
  normalizeArticleCapabilities,
  parseArticleVersion,
  vocabularySuggestionSchema,
  type ArticleCapabilities,
  type ArticleReference,
  type ArticleVersion,
  type CapabilityDecision,
  type ArticleOperation,
} from './article.ts';
import {
  immutable,
  idSchema,
  parse,
  ReadingValidationError,
  textSchema,
  webUrlSchema,
  type DeepReadonly,
} from './common.ts';

/** Transport parses RSS/Atom/HTML first; no scripts or HTML interpretation happen here. */
export const articleIntakeMetadataSchema = z.strictObject({
  itemId: textSchema(4096).nullable().default(null),
  canonicalUrl: webUrlSchema.nullable(),
  fileReference: fileReferenceSchema.optional(),
  title: textSchema(500),
  summary: textSchema(2000).nullable().default(null),
  author: textSchema(300).nullable().default(null),
  publishedAt: isoInstantSchema.nullable().default(null),
  language: z.literal('ja').default('ja'),
  body: z
    .strictObject({
      text: textSchema(MAX_ARTICLE_CHARS),
      annotations: z.array(articleAnnotationSchema).max(4096).default([]),
    })
    .nullable()
    .default(null),
});
export type ArticleIntakeMetadata = DeepReadonly<z.input<typeof articleIntakeMetadataSchema>>;

const provenanceFields = {
  sourceId: idSchema,
  sourceVersion: textSchema(300).nullable(),
  sourceUrl: webUrlSchema.nullable(),
  attribution: textSchema(1000),
  license: textSchema(1000),
  modification: z.enum(['unmodified', 'derived', 'original']),
  evidenceRef: idSchema.nullable(),
};
export const provenanceObservationSchema = z.strictObject({
  ...provenanceFields,
  retrievedAt: isoInstantSchema,
});
const provenanceEntrySchema = z
  .strictObject({
    ...provenanceFields,
    firstRetrievedAt: isoInstantSchema,
    lastRetrievedAt: isoInstantSchema,
  })
  .refine((entry) => entry.firstRetrievedAt <= entry.lastRetrievedAt);
export type ProvenanceEntry = DeepReadonly<z.infer<typeof provenanceEntrySchema>>;

/** Policy and provenance are local adapter inputs, never accepted from a feed's fields. */
export const articleIntakeContextSchema = z.strictObject({
  source: z.strictObject({ id: idSchema, name: textSchema(200), attribution: textSchema(1000) }),
  capabilities: capabilityInputSchema,
  lineage: articleLineageSchema,
  provenance: z.array(provenanceObservationSchema).min(1).max(32),
  adaptationParents: z.array(z.unknown()).max(4).default([]),
  suggestedVocabulary: z.array(vocabularySuggestionSchema).max(24).default([]),
});
export type ArticleIntakeContext = DeepReadonly<z.input<typeof articleIntakeContextSchema>>;

export const generationJobIdentitySchema = z.strictObject({
  owner: z.strictObject({ learnerId: idSchema, sessionEpoch: idSchema }),
  job: z.strictObject({ id: idSchema, revision: z.number().int().nonnegative().max(1_000_000) }),
});
export type GenerationJobIdentity = DeepReadonly<z.infer<typeof generationJobIdentitySchema>>;

export const suggestedWordSchema = vocabularySuggestionSchema.extend({
  source: articleReferenceSchema,
});
export type SuggestedWord = DeepReadonly<z.infer<typeof suggestedWordSchema>>;

const automaticChecksSchema = z.strictObject({
  versionId: idSchema,
  checkVersion: z.literal('reading-core/1'),
  bodyIntegrity: z.enum(['passed', 'not-applicable']),
  anchors: z.enum(['passed', 'not-applicable']),
  supportingReferences: z.enum(['present', 'missing', 'not-applicable']),
  factualAccuracy: z.literal('not-checked'),
  japaneseEditorialQuality: z.literal('not-checked'),
});
export type ArticleAutomaticChecks = DeepReadonly<z.infer<typeof automaticChecksSchema>>;

export const editorialDecisionSchema = z.strictObject({
  reference: articleReferenceSchema,
  status: z.enum(['approved', 'rejected']),
  reviewerId: idSchema,
  decidedAt: isoInstantSchema,
  rubricVersion: idSchema,
  userAction: z.literal(true),
  note: textSchema(2000),
});
export type EditorialDecision = DeepReadonly<z.infer<typeof editorialDecisionSchema>>;
const editorialStateSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('pending') }),
  editorialDecisionSchema,
]);

const candidateSchema = z.strictObject({
  kind: z.literal('ArticleCandidate'),
  candidateId: idSchema,
  article: z.unknown(),
  provenance: z.array(provenanceEntrySchema).min(1).max(128),
  automaticChecks: automaticChecksSchema,
  editorial: editorialStateSchema,
  suggestedWords: z.array(suggestedWordSchema).max(24),
  generationJob: generationJobIdentitySchema.nullable(),
});
export type ArticleCandidate = DeepReadonly<
  Omit<z.infer<typeof candidateSchema>, 'article'> & { article: ArticleVersion }
>;

function automaticChecksFor(article: ArticleVersion): ArticleAutomaticChecks {
  return immutable({
    versionId: article.versionId,
    checkVersion: 'reading-core/1',
    bodyIntegrity: article.body ? 'passed' : 'not-applicable',
    anchors: article.body ? 'passed' : 'not-applicable',
    supportingReferences:
      article.lineage.kind !== 'original-factual'
        ? 'not-applicable'
        : article.lineage.references.length > 0
          ? 'present'
          : 'missing',
    factualAccuracy: 'not-checked',
    japaneseEditorialQuality: 'not-checked',
  });
}

function sameReference(left: ArticleReference, right: ArticleReference): boolean {
  return (
    left.articleId === right.articleId &&
    left.versionId === right.versionId &&
    left.contentSha256 === right.contentSha256
  );
}

export function parseArticleCandidate(raw: unknown): ArticleCandidate {
  const selected = parse(candidateSchema, raw);
  const article = parseArticleVersion(selected.article);
  if (
    selected.candidateId !== `reading-candidate:${inputHashOf(article.versionId)}` ||
    inputHashOf(selected.automaticChecks) !== inputHashOf(automaticChecksFor(article))
  ) {
    throw new ReadingValidationError('version-mismatch');
  }
  if (
    selected.editorial.status !== 'pending' &&
    !sameReference(selected.editorial.reference, articleReference(article))
  ) {
    throw new ReadingValidationError('version-mismatch');
  }
  const lexemes = new Set<string>();
  for (const word of selected.suggestedWords) {
    if (!sameReference(word.source, articleReference(article)) || lexemes.has(word.lexemeId)) {
      throw new ReadingValidationError('invalid-input', ['suggestedWords']);
    }
    lexemes.add(word.lexemeId);
  }
  if (
    inputHashOf(
      selected.suggestedWords.map(({ lexemeId, form, reading }) => ({ lexemeId, form, reading })),
    ) !== inputHashOf(article.suggestedVocabulary)
  ) {
    throw new ReadingValidationError('version-mismatch');
  }
  if (
    selected.generationJob !== null &&
    (article.itemId !== inputHashOf(selected.generationJob) ||
      article.lineage.kind === 'publisher-original' ||
      article.lineage.kind === 'user-supplied' ||
      article.lineage.generation === null ||
      article.source.id !==
        (article.lineage.kind === 'source-adaptation' ? 'kairo-adaptation' : 'kairo-original'))
  ) {
    throw new ReadingValidationError('version-mismatch');
  }
  return immutable({ ...selected, article });
}

function mergeProvenance(
  existing: readonly ProvenanceEntry[],
  incoming: readonly z.infer<typeof provenanceObservationSchema>[],
): readonly ProvenanceEntry[] {
  const entries = new Map<string, ProvenanceEntry>();
  for (const entry of existing) {
    const { firstRetrievedAt, lastRetrievedAt, ...identity } = entry;
    entries.set(inputHashOf(identity), { ...identity, firstRetrievedAt, lastRetrievedAt });
  }
  for (const observation of incoming) {
    const { retrievedAt, ...identity } = observation;
    const key = inputHashOf(identity);
    const prior = entries.get(key);
    entries.set(key, {
      ...identity,
      firstRetrievedAt:
        prior && prior.firstRetrievedAt < retrievedAt ? prior.firstRetrievedAt : retrievedAt,
      lastRetrievedAt:
        prior && prior.lastRetrievedAt > retrievedAt ? prior.lastRetrievedAt : retrievedAt,
    });
  }
  // Retrieval windows compress identical provenance snapshots, not accepted articles.
  // Distinct sources/versions/bases remain distinct. Never silently slice this history.
  if (entries.size > 128) throw new ReadingValidationError('invalid-input', ['provenance-budget']);
  return [...entries.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, value]) => value);
}

function capabilitiesForLink(capabilities: ArticleCapabilities): ArticleCapabilities {
  const result = {} as Record<ArticleOperation, CapabilityDecision>;
  for (const operation of ARTICLE_OPERATIONS) {
    const decision = capabilities[operation];
    result[operation] =
      operation !== 'discover-metadata' && decision.status === 'allowed'
        ? { status: 'unknown', reason: 'body-unavailable' }
        : decision;
  }
  return result;
}

/** Pure intake. The repository chooses where immutable versions are retained. */
export function normalizeArticleIntake(
  metadata: unknown,
  context: unknown,
  previous?: ArticleCandidate,
): ArticleCandidate {
  const selected = parse(articleIntakeMetadataSchema, metadata);
  const adapter = parse(articleIntakeContextSchema, context);
  const capabilities = normalizeArticleCapabilities(adapter.capabilities);
  if (adapter.provenance.some((entry) => entry.sourceId !== adapter.source.id)) {
    throw new ReadingValidationError('invalid-input', ['provenance.sourceId']);
  }
  if (adapter.lineage.kind === 'source-adaptation') {
    const lineage = adapter.lineage;
    const parents = adapter.adaptationParents.map(parseArticleVersion);
    for (const parent of parents) assertArticleOperation(parent, 'ai-transform');
    if (
      parents.length !== lineage.parents.length ||
      parents.some((parent, index) => {
        const reference = lineage.parents[index];
        return !reference || !sameReference(articleReference(parent), reference);
      })
    ) {
      throw new ReadingValidationError('invalid-input', ['adaptationParents']);
    }
    const bases = parents.map((parent) => parent.capabilities['ai-transform']);
    if (
      bases.some(
        (basis) =>
          basis.status !== 'allowed' ||
          !lineage.processingBasisRefs.includes(basis.basis.reference),
      )
    ) {
      throw new ReadingValidationError('operation-not-permitted', ['adaptation-basis']);
    }
  } else if (adapter.adaptationParents.length > 0) {
    throw new ReadingValidationError('invalid-input', ['adaptationParents']);
  }
  const itemId = selected.itemId ?? selected.canonicalUrl;
  if (itemId === null) throw new ReadingValidationError('invalid-input', ['itemId']);
  const base = {
    schemaVersion: ARTICLE_SCHEMA_VERSION,
    articleId: articleIdFor(adapter.source.id, itemId),
    source: adapter.source,
    itemId,
    canonicalUrl: selected.canonicalUrl,
    title: selected.title,
    summary: selected.summary,
    author: selected.author,
    language: selected.language,
    publishedAt: selected.publishedAt,
    lineage: adapter.lineage,
  };
  const fullReader = selected.body !== null && capabilities['display-body'].status === 'allowed';
  if (
    selected.fileReference &&
    (selected.body !== null ||
      selected.canonicalUrl !== null ||
      adapter.lineage.kind !== 'user-supplied')
  ) {
    throw new ReadingValidationError('invalid-input', ['fileReference']);
  }
  const article = createArticleVersion(
    fullReader && selected.body
      ? {
          ...base,
          kind: 'full-reader-article',
          capabilities,
          suggestedVocabulary: adapter.suggestedVocabulary,
          body: {
            ...selected.body,
            contentSha256: sha256Hex(selected.body.text),
            format: 'plain-text',
            locationUnit: 'utf16-code-unit',
          },
        }
      : {
          ...base,
          ...(selected.fileReference
            ? { kind: 'local-file-reference', fileReference: selected.fileReference }
            : { kind: 'publisher-site-link' }),
          capabilities: capabilitiesForLink(capabilities),
          suggestedVocabulary: [],
          body: null,
        },
  );
  const prior = previous === undefined ? undefined : parseArticleCandidate(previous);
  if (prior && prior.article.articleId !== article.articleId) {
    throw new ReadingValidationError('invalid-input', ['previous.articleId']);
  }
  const duplicate = prior?.article.versionId === article.versionId;
  const result: ArticleCandidate = {
    kind: 'ArticleCandidate',
    candidateId: `reading-candidate:${inputHashOf(article.versionId)}`,
    article,
    provenance: mergeProvenance(duplicate ? prior.provenance : [], adapter.provenance),
    automaticChecks: automaticChecksFor(article),
    editorial: duplicate ? prior.editorial : { status: 'pending' },
    suggestedWords: article.suggestedVocabulary.map((word) => ({
      ...word,
      source: articleReference(article),
    })),
    generationJob: duplicate ? prior.generationJob : null,
  };
  return immutable(result);
}

/**
 * Call only from the authenticated operator review action. This records that
 * decision; neither the boolean nor this module proves an editor is qualified.
 * A model response cannot enter this API through the strict draft schema.
 */
export function recordEditorialDecision(
  candidate: ArticleCandidate,
  raw: unknown,
): ArticleCandidate {
  const current = parseArticleCandidate(candidate);
  const decision = parse(editorialDecisionSchema, raw);
  if (!sameReference(decision.reference, articleReference(current.article))) {
    throw new ReadingValidationError('version-mismatch');
  }
  return immutable({ ...current, editorial: decision });
}
