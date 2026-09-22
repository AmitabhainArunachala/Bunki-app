import { inputHashOf, sha256Hex } from '@bunki/ai/hash';
import { isoInstantSchema } from '@bunki/domain/events/shared';
import { z } from 'zod';
import { parseFileReference } from './file-source.ts';

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

export const ARTICLE_SCHEMA_VERSION = 1;
export const MAX_ARTICLE_CHARS = 120_000;
export const ARTICLE_OPERATIONS = [
  'discover-metadata',
  'display-body',
  'retain-offline',
  'sync-body',
  'quote-extract',
  'ai-transform',
  'synthesize-audio',
  'redistribute-audio',
] as const;
export type ArticleOperation = (typeof ARTICLE_OPERATIONS)[number];

export const capabilityDecisionSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('allowed'),
    basis: z.strictObject({
      kind: z.enum(['original', 'license', 'publisher-policy', 'operator-reviewed', 'user-action']),
      reference: textSchema(500),
      checkedAt: isoInstantSchema,
    }),
  }),
  z.strictObject({ status: z.literal('denied'), reason: textSchema(300) }),
  z.strictObject({ status: z.literal('unknown'), reason: textSchema(300) }),
]);
export type CapabilityDecision = DeepReadonly<z.infer<typeof capabilityDecisionSchema>>;

const capabilityShape = {
  'discover-metadata': capabilityDecisionSchema,
  'display-body': capabilityDecisionSchema,
  'retain-offline': capabilityDecisionSchema,
  'sync-body': capabilityDecisionSchema,
  'quote-extract': capabilityDecisionSchema,
  'ai-transform': capabilityDecisionSchema,
  'synthesize-audio': capabilityDecisionSchema,
  'redistribute-audio': capabilityDecisionSchema,
};
export const capabilitiesSchema = z.strictObject(capabilityShape);
export const capabilityInputSchema = capabilitiesSchema.partial();
export type ArticleCapabilities = DeepReadonly<z.infer<typeof capabilitiesSchema>>;
export type ArticleCapabilityInput = DeepReadonly<z.infer<typeof capabilityInputSchema>>;

/** Omitted policy is unknown. Availability of an RSS/body never supplies a grant. */
export function normalizeArticleCapabilities(raw: unknown): ArticleCapabilities {
  const selected = parse(capabilityInputSchema, raw);
  const result = {} as Record<ArticleOperation, CapabilityDecision>;
  for (const operation of ARTICLE_OPERATIONS) {
    result[operation] = selected[operation] ?? { status: 'unknown', reason: 'not-established' };
  }
  return immutable(result);
}

export const articleReferenceSchema = z.strictObject({
  articleId: idSchema,
  versionId: idSchema,
  contentSha256: shaSchema.nullable(),
});
export type ArticleReference = DeepReadonly<z.infer<typeof articleReferenceSchema>>;

export const supportingReferenceSchema = z
  .strictObject({
    url: webUrlSchema,
    title: textSchema(300),
    verifiedAt: isoInstantSchema.nullable(),
    evidenceRef: idSchema.nullable(),
  })
  .refine((value) => (value.verifiedAt === null) === (value.evidenceRef === null));
export type SupportingReference = DeepReadonly<z.infer<typeof supportingReferenceSchema>>;

export const generationProvenanceSchema = z.strictObject({
  briefId: idSchema,
  briefSha256: shaSchema,
  promptVersion: idSchema,
  requestedModel: textSchema(200),
  actualModel: textSchema(200),
  provider: textSchema(300),
});

export const articleLineageSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('publisher-original') }),
  // Supplied text is an encounter, without a claim of authorship, factual
  // accuracy, publisher verification or permission for remote processing.
  z.strictObject({ kind: z.literal('user-supplied') }),
  z.strictObject({
    kind: z.literal('original-fiction'),
    generation: generationProvenanceSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal('original-factual'),
    references: z.array(supportingReferenceSchema).max(16),
    generation: generationProvenanceSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal('source-adaptation'),
    parents: z.array(articleReferenceSchema).min(1).max(4),
    processingBasisRefs: z.array(textSchema(500)).min(1).max(8),
    generation: generationProvenanceSchema.nullable(),
  }),
]);
export type ArticleLineage = DeepReadonly<z.infer<typeof articleLineageSchema>>;

export const articleAnnotationSchema = z.strictObject({
  id: idSchema,
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quote: textSchema(4000),
  kind: z.enum(['reading', 'explanation']),
  text: textSchema(4000),
});
export type ArticleAnnotation = DeepReadonly<z.infer<typeof articleAnnotationSchema>>;

export const vocabularySuggestionSchema = z.strictObject({
  lexemeId: idSchema,
  form: textSchema(80),
  reading: textSchema(160).nullable(),
});
export type VocabularySuggestion = DeepReadonly<z.infer<typeof vocabularySuggestionSchema>>;

export const articleBodySchema = z.strictObject({
  text: textSchema(MAX_ARTICLE_CHARS),
  contentSha256: shaSchema,
  format: z.literal('plain-text'),
  locationUnit: z.literal('utf16-code-unit'),
  annotations: z.array(articleAnnotationSchema).max(4096),
});

const articleFields = {
  schemaVersion: z.literal(ARTICLE_SCHEMA_VERSION),
  articleId: idSchema,
  source: z.strictObject({ id: idSchema, name: textSchema(200), attribution: textSchema(1000) }),
  itemId: textSchema(4096),
  canonicalUrl: webUrlSchema.nullable(),
  title: textSchema(500),
  summary: textSchema(2000).nullable(),
  author: textSchema(300).nullable(),
  language: z.literal('ja'),
  publishedAt: isoInstantSchema.nullable(),
  lineage: articleLineageSchema,
  capabilities: capabilitiesSchema,
  suggestedVocabulary: z.array(vocabularySuggestionSchema).max(24),
};

export const fileReferenceSchema = z.unknown().transform(parseFileReference);
export const articlePayloadSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...articleFields, kind: z.literal('publisher-site-link'), body: z.null() }),
  z.strictObject({
    ...articleFields,
    kind: z.literal('full-reader-article'),
    body: articleBodySchema,
  }),
  z.strictObject({ ...articleFields, kind: z.literal('local-file-reference'), body: z.null(), fileReference: fileReferenceSchema }),
]);
const articleVersionSchema = z.discriminatedUnion('kind', [
  articlePayloadSchema.options[0].extend({ versionId: idSchema }),
  articlePayloadSchema.options[1].extend({ versionId: idSchema }),
  articlePayloadSchema.options[2].extend({ versionId: idSchema }),
]);
export type ArticleVersion = DeepReadonly<z.infer<typeof articleVersionSchema>>;
export type ArticlePayload = DeepReadonly<z.infer<typeof articlePayloadSchema>>;

export function articleIdFor(sourceId: string, itemId: string): string {
  return `article:${inputHashOf({ sourceId, itemId })}`;
}

function splitsSurrogate(text: string, position: number): boolean {
  if (position <= 0 || position >= text.length) return false;
  const before = text.charCodeAt(position - 1);
  const after = text.charCodeAt(position);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

export function assertExactSpan(
  body: string,
  span: { readonly start: number; readonly end: number; readonly quote: string },
): void {
  if (
    !Number.isInteger(span.start) ||
    !Number.isInteger(span.end) ||
    span.start < 0 ||
    span.end <= span.start ||
    span.end > body.length ||
    splitsSurrogate(body, span.start) ||
    splitsSurrogate(body, span.end) ||
    body.slice(span.start, span.end) !== span.quote
  ) {
    throw new ReadingValidationError('invalid-input', ['anchor']);
  }
}

function assertPayload(payload: ArticlePayload): void {
  for (const operation of ARTICLE_OPERATIONS) {
    const decision = payload.capabilities[operation];
    if (decision.status === 'allowed' && decision.basis.kind === 'user-action' &&
        !['discover-metadata', 'display-body', 'retain-offline', 'quote-extract'].includes(operation)) {
      throw new ReadingValidationError('operation-not-permitted', [operation]);
    }
  }
  if (payload.articleId !== articleIdFor(payload.source.id, payload.itemId)) {
    throw new ReadingValidationError('invalid-input', ['articleId']);
  }
  if (payload.lineage.kind === 'publisher-original' && payload.canonicalUrl === null) {
    throw new ReadingValidationError('invalid-input', ['canonicalUrl']);
  }
  if (payload.kind !== 'full-reader-article') {
    if (payload.kind === 'publisher-site-link' && payload.canonicalUrl === null) {
      throw new ReadingValidationError('invalid-input', ['canonicalUrl']);
    }
    if (payload.kind === 'local-file-reference' && (payload.canonicalUrl !== null || payload.lineage.kind !== 'user-supplied')) {
      throw new ReadingValidationError('invalid-input', ['fileReference']);
    }
    for (const operation of ARTICLE_OPERATIONS) {
      if (
        operation !== 'discover-metadata' &&
        payload.capabilities[operation].status === 'allowed'
      ) {
        throw new ReadingValidationError('invalid-input', ['capabilities', operation]);
      }
    }
    if (payload.suggestedVocabulary.length > 0) {
      throw new ReadingValidationError('invalid-input', ['suggestedVocabulary']);
    }
    return;
  }
  if (payload.capabilities['display-body'].status !== 'allowed') {
    throw new ReadingValidationError('operation-not-permitted', ['display-body']);
  }
  if (sha256Hex(payload.body.text) !== payload.body.contentSha256) {
    throw new ReadingValidationError('invalid-input', ['body.contentSha256']);
  }
  const ids = new Set<string>();
  for (const annotation of payload.body.annotations) {
    assertExactSpan(payload.body.text, annotation);
    if (ids.has(annotation.id))
      throw new ReadingValidationError('invalid-input', ['annotations.id']);
    ids.add(annotation.id);
  }
  const lexemes = new Set<string>();
  for (const word of payload.suggestedVocabulary) {
    if (
      lexemes.has(word.lexemeId) ||
      !payload.body.text.normalize('NFKC').includes(word.form.normalize('NFKC'))
    ) {
      throw new ReadingValidationError('invalid-input', ['suggestedVocabulary']);
    }
    lexemes.add(word.lexemeId);
  }
}

/** Include title, rights, lineage and annotations as well as body in the immutable revision. */
export function createArticleVersion(raw: unknown): ArticleVersion {
  const payload = parse(articlePayloadSchema, raw);
  assertPayload(payload);
  return immutable({ ...payload, versionId: `article-version:${inputHashOf(payload)}` });
}

/** Rehydrate at storage/network boundaries; a stored hash is a claim until recomputed. */
export function parseArticleVersion(raw: unknown): ArticleVersion {
  const { versionId, ...payload } = parse(articleVersionSchema, raw);
  const actual = createArticleVersion(payload);
  if (versionId !== actual.versionId) throw new ReadingValidationError('version-mismatch');
  return actual;
}

export function articleReference(article: ArticleVersion): ArticleReference {
  return immutable({
    articleId: article.articleId,
    versionId: article.versionId,
    contentSha256: article.body?.contentSha256 ?? null,
  });
}

export function canPerformArticleOperation(article: ArticleVersion, operation: string): boolean {
  if (!(ARTICLE_OPERATIONS as readonly string[]).includes(operation)) return false;
  const selected = operation as ArticleOperation;
  if (article.capabilities[selected].status !== 'allowed') return false;
  if (selected === 'discover-metadata') return true;
  return (
    article.kind === 'full-reader-article' &&
    article.capabilities['display-body'].status === 'allowed'
  );
}

export function assertArticleOperation(article: ArticleVersion, operation: ArticleOperation): void {
  if (!canPerformArticleOperation(article, operation)) {
    throw new ReadingValidationError('operation-not-permitted', [operation]);
  }
}

export const articleAnchorSchema = articleReferenceSchema.extend({
  locationUnit: z.literal('utf16-code-unit'),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  quote: textSchema(4000),
});
export type ArticleAnchor = DeepReadonly<z.infer<typeof articleAnchorSchema>>;

export function createArticleAnchor(
  article: ArticleVersion,
  raw: { readonly start: number; readonly end: number; readonly quote: string },
): ArticleAnchor {
  assertArticleOperation(article, 'quote-extract');
  if (!article.body) throw new ReadingValidationError('operation-not-permitted', ['quote-extract']);
  const anchor = parse(articleAnchorSchema, {
    ...articleReference(article),
    locationUnit: 'utf16-code-unit',
    start: raw.start,
    end: raw.end,
    quote: raw.quote,
  });
  assertExactSpan(article.body.text, anchor);
  return immutable(anchor);
}

/** A new edition never silently reinterprets an old position, even if the quote still occurs. */
export function resolveArticleAnchor(article: ArticleVersion, raw: unknown): string {
  const anchor = parse(articleAnchorSchema, raw);
  if (
    article.articleId !== anchor.articleId ||
    article.versionId !== anchor.versionId ||
    article.body?.contentSha256 !== anchor.contentSha256
  ) {
    throw new ReadingValidationError('version-mismatch');
  }
  assertArticleOperation(article, 'quote-extract');
  assertExactSpan(article.body.text, anchor);
  return article.body.text.slice(anchor.start, anchor.end);
}
