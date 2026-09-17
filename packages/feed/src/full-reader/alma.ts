import { inputHashOf, sha256Hex } from '@bunki/ai/hash';
import {
  assertExactSpan,
  normalizeArticleCapabilities,
  normalizeArticleIntake,
  parseArticleCandidate,
  type ArticleCandidate,
  type ArticleCapabilityInput,
} from '@bunki/reading';
import { z } from 'zod';
import { parseFeedEntry } from '../contracts.ts';
import { feedEntryId } from '../identity.ts';
import { deepFreeze, instantSchema } from '../model.ts';
import { extractAlmaHtml } from './alma-html.ts';
import {
  ALMA_LICENSE_URL,
  ALMA_POLICY_CHECKED_AT,
  ALMA_POLICY_URL,
  ALMA_PROVIDER,
  ALMA_READER_VERSION,
  almaPolicyEvidenceSchema,
  validateAlmaResponse,
  verifyAlmaPolicyResponse,
} from './alma-policy.ts';
import {
  almaArticleUrl,
  MAX_PUBLISHER_HTML_BYTES,
  PUBLISHER_LINK_REASONS,
  PublisherReaderError,
  parsePublisherReadSelection,
  publisherArticleRequest,
  type PublisherLinkReason,
  type PublisherReadSelection,
} from './selection.ts';

export { verifyAlmaPolicyResponse } from './alma-policy.ts';
const MODIFICATION =
  'HTML layout, images, captions, embedded media, related links and controls omitted; whitespace normalized; source prose otherwise copied. No endorsement by NAOJ is implied.';
const NORMALIZATION = 'alma-plain-text/1';
function capabilities(full: boolean): ArticleCapabilityInput {
  return Object.fromEntries(
    (full
      ? ['discover-metadata', 'display-body', 'retain-offline', 'sync-body', 'quote-extract']
      : ['discover-metadata']
    ).map((operation) => [
      operation,
      {
        status: 'allowed',
        basis: {
          kind: full ? 'license' : 'publisher-policy',
          reference: full ? ALMA_LICENSE_URL : ALMA_POLICY_URL,
          checkedAt: ALMA_POLICY_CHECKED_AT,
        },
      },
    ]),
  );
}
function attribution(url: string) {
  return `アルマ望遠鏡 — 文章提供: ${ALMA_PROVIDER} (site text default; ${ALMA_POLICY_URL}). ${url} — CC BY 4.0 (${ALMA_LICENSE_URL}). ${MODIFICATION}`;
}
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const docSchema = z.strictObject({
  parserVersion: z.literal(ALMA_READER_VERSION),
  canonicalUrl: z.string().min(1).max(4096),
  ogUrl: z.string().min(1).max(4096),
  finalUrl: z.string().min(1).max(4096),
  fetchedAt: instantSchema,
  responseSha256: sha,
  responseBytes: z.number().int().min(1).max(MAX_PUBLISHER_HTML_BYTES),
  selectedFeedEntry: z.unknown(),
  publishedAt: instantSchema,
  publicationDisplayDate: z.string().regex(/^20\d{2}\.\d{2}\.\d{2}$/u),
  publicationInstantSource: z.literal('selected-rss-entry'),
  articleModifiedAt: z.null(),
  textCredit: z.strictObject({
    provider: z.literal(ALMA_PROVIDER),
    basis: z.literal('explicit-site-text-default'),
    policyUrl: z.literal(ALMA_POLICY_URL),
  }),
  license: z.strictObject({
    id: z.literal('CC-BY-4.0'),
    url: z.literal(ALMA_LICENSE_URL),
    policyUrl: z.literal(ALMA_POLICY_URL),
  }),
  policyObservation: almaPolicyEvidenceSchema,
  normalization: z.literal(NORMALIZATION),
  modification: z.literal(MODIFICATION),
  locationUnit: z.literal('utf16-code-unit'),
  blocks: z
    .array(
      z.strictObject({
        kind: z.literal('paragraph'),
        start: z.number().int().nonnegative(),
        end: z.number().int().positive(),
        sha256: sha,
      }),
    )
    .min(2)
    .max(2048),
  omittedElements: z.number().int().nonnegative().max(30_000),
  articleVersionId: z.string().min(1).max(200),
  contentSha256: sha,
});
export type AlmaSourceDocument = Readonly<z.infer<typeof docSchema>>;
export type AlmaReadResult = Readonly<{
  format: 'kairo-publisher-read';
  v: 1;
  selection: PublisherReadSelection;
  status: 'full-reader' | 'publisher-link';
  candidate: ArticleCandidate;
  sourceDocument: AlmaSourceDocument | null;
  reason: PublisherLinkReason | null;
  receiptSha256: string;
}>;
const resultSchema = z.strictObject({
  format: z.literal('kairo-publisher-read'),
  v: z.literal(1),
  selection: z.unknown(),
  status: z.enum(['full-reader', 'publisher-link']),
  candidate: z.unknown(),
  sourceDocument: docSchema.nullable(),
  reason: z.enum(PUBLISHER_LINK_REASONS).nullable(),
  receiptSha256: sha,
});
const finish = (value: Omit<AlmaReadResult, 'receiptSha256'>): AlmaReadResult =>
  deepFreeze({ ...value, receiptSha256: inputHashOf(value) });

export function createAlmaPublisherLink(
  raw: unknown,
  reason: PublisherLinkReason,
  fetchedAt: string,
): AlmaReadResult {
  const entry = parseFeedEntry(raw);
  if (entry.sourceId !== 'alma-ja' || entry.publisherId !== 'alma-ja')
    throw new PublisherReaderError('unsupported-publisher');
  if (
    !instantSchema.safeParse(fetchedAt).success ||
    !(PUBLISHER_LINK_REASONS as readonly string[]).includes(reason)
  )
    throw new PublisherReaderError('invalid-reader-result');
  const credit = `アルマ望遠鏡（国立天文台） — ${entry.canonicalUrl}`;
  return finish({
    format: 'kairo-publisher-read',
    v: 1,
    selection: parsePublisherReadSelection({
      sourceId: 'alma-ja',
      entryId: entry.id,
      revisionId: entry.revisionId,
    }),
    status: 'publisher-link',
    candidate: normalizeArticleIntake(
      {
        itemId: entry.canonicalUrl,
        canonicalUrl: entry.canonicalUrl,
        title: entry.title.length <= 500 ? entry.title : 'アルマ望遠鏡',
        publishedAt: entry.publishedAt,
        body: null,
      },
      {
        source: { id: 'alma-ja', name: 'アルマ望遠鏡（国立天文台）', attribution: credit },
        capabilities: capabilities(false),
        lineage: { kind: 'publisher-original' },
        provenance: [
          {
            sourceId: 'alma-ja',
            sourceVersion: entry.revisionId,
            sourceUrl: entry.canonicalUrl,
            attribution: credit,
            license: `Body rights not admitted: ${reason}`,
            modification: 'unmodified',
            evidenceRef: ALMA_READER_VERSION,
            retrievedAt: new Date(fetchedAt).toISOString(),
          },
        ],
      },
    ),
    sourceDocument: null,
    reason,
  });
}

/** Pure intake. Only a trusted native selection and its two fixed HTTPS reads
 * establish transport origin; a caller-rehashed wrapper is not fresh authority.
 */
export function createAlmaArticle(
  rawEntry: unknown,
  rawResponse: unknown,
  rawPolicy: unknown,
  enabled = true,
): AlmaReadResult {
  const entry = parseFeedEntry(rawEntry);
  if (entry.sourceId !== 'alma-ja' || entry.publisherId !== 'alma-ja')
    throw new PublisherReaderError('unsupported-publisher');
  const receivedAt =
    typeof rawResponse === 'object' && rawResponse !== null
      ? (rawResponse as Record<string, unknown>)['fetchedAt']
      : null;
  if (!instantSchema.safeParse(receivedAt).success)
    throw new PublisherReaderError('invalid-reader-result');
  const fetchedAt = new Date(receivedAt as string).toISOString();
  if (!enabled) return createAlmaPublisherLink(entry, 'policy-disabled', fetchedAt);
  try {
    const request = publisherArticleRequest(entry);
    const response = validateAlmaResponse(rawResponse);
    if (response.finalUrl !== request.canonicalUrl)
      throw new PublisherReaderError('redirect-rejected');
    if (rawPolicy === undefined || rawPolicy === null)
      throw new PublisherReaderError('license-missing');
    const policy = verifyAlmaPolicyResponse(rawPolicy);
    if (Math.abs(Date.parse(policy.fetchedAt) - Date.parse(response.fetchedAt)) > 60_000)
      throw new PublisherReaderError('license-unreviewed');
    const extracted = extractAlmaHtml(response.html, entry, response.fetchedAt);
    const credit = attribution(request.canonicalUrl);
    const candidate = normalizeArticleIntake(
      {
        itemId: request.canonicalUrl,
        canonicalUrl: request.canonicalUrl,
        title: extracted.title,
        publishedAt: extracted.publishedAt,
        body: { text: extracted.text },
      },
      {
        source: { id: 'alma-ja', name: 'アルマ望遠鏡（国立天文台）', attribution: credit },
        capabilities: capabilities(true),
        lineage: { kind: 'publisher-original' },
        provenance: [
          {
            sourceId: 'alma-ja',
            sourceVersion: `${response.responseSha256}; policy=${policy.responseSha256}; feed=${entry.revisionId}`,
            sourceUrl: request.canonicalUrl,
            attribution: credit,
            license: `CC BY 4.0 ${ALMA_LICENSE_URL}`,
            modification: 'derived',
            evidenceRef: ALMA_READER_VERSION,
            retrievedAt: response.fetchedAt,
          },
        ],
      },
    );
    const doc = docSchema.parse({
      parserVersion: ALMA_READER_VERSION,
      canonicalUrl: request.canonicalUrl,
      ogUrl: extracted.ogUrl,
      finalUrl: response.finalUrl,
      fetchedAt: response.fetchedAt,
      responseSha256: response.responseSha256,
      responseBytes: response.responseBytes,
      selectedFeedEntry: entry,
      publishedAt: extracted.publishedAt,
      publicationDisplayDate: extracted.displayDate,
      publicationInstantSource: 'selected-rss-entry',
      articleModifiedAt: null,
      textCredit: {
        provider: ALMA_PROVIDER,
        basis: 'explicit-site-text-default',
        policyUrl: ALMA_POLICY_URL,
      },
      license: { id: 'CC-BY-4.0', url: ALMA_LICENSE_URL, policyUrl: ALMA_POLICY_URL },
      policyObservation: policy,
      normalization: NORMALIZATION,
      modification: MODIFICATION,
      locationUnit: 'utf16-code-unit',
      blocks: extracted.blocks,
      omittedElements: extracted.omittedElements,
      articleVersionId: candidate.article.versionId,
      contentSha256: candidate.article.body!.contentSha256,
    });
    return parseAlmaReadResult(
      finish({
        format: 'kairo-publisher-read',
        v: 1,
        selection: request.selection,
        status: 'full-reader',
        candidate,
        sourceDocument: doc,
        reason: null,
      }),
      request.selection,
    );
  } catch (error) {
    const reason =
      error instanceof PublisherReaderError &&
      (PUBLISHER_LINK_REASONS as readonly string[]).includes(error.code)
        ? (error.code as PublisherLinkReason)
        : 'html-structure-invalid';
    return createAlmaPublisherLink(entry, reason, fetchedAt);
  }
}

export function parseAlmaReadResult(raw: unknown, expected?: unknown): AlmaReadResult {
  try {
    const value = resultSchema.parse(raw);
    const selection = parsePublisherReadSelection(value.selection);
    if (
      selection.sourceId !== 'alma-ja' ||
      (expected !== undefined &&
        JSON.stringify(selection) !== JSON.stringify(parsePublisherReadSelection(expected)))
    )
      throw new Error('selection');
    const candidate = parseArticleCandidate(value.candidate);
    const article = candidate.article;
    if (
      article.source.id !== 'alma-ja' ||
      article.source.name !== 'アルマ望遠鏡（国立天文台）' ||
      article.lineage.kind !== 'publisher-original' ||
      article.author !== null ||
      candidate.editorial.status !== 'pending' ||
      candidate.generationJob !== null ||
      article.suggestedVocabulary.length ||
      candidate.suggestedWords.length
    )
      throw new Error('article-kind');
    if (
      JSON.stringify(article.capabilities) !==
      JSON.stringify(normalizeArticleCapabilities(capabilities(value.status === 'full-reader')))
    )
      throw new Error('capabilities');
    if (
      !article.canonicalUrl ||
      article.itemId !== article.canonicalUrl ||
      feedEntryId('alma-ja', article.canonicalUrl) !== selection.entryId
    )
      throw new Error('selected-link');
    const doc = value.sourceDocument;
    if (value.status === 'full-reader') {
      if (
        !doc ||
        value.reason !== null ||
        !article.body ||
        article.kind !== 'full-reader-article' ||
        doc.canonicalUrl !== article.canonicalUrl ||
        almaArticleUrl(doc.canonicalUrl) !== doc.canonicalUrl ||
        doc.finalUrl !== doc.canonicalUrl ||
        doc.ogUrl !== doc.canonicalUrl.slice(0, -5) ||
        doc.articleVersionId !== article.versionId ||
        doc.contentSha256 !== article.body.contentSha256 ||
        doc.publishedAt !== article.publishedAt ||
        article.source.attribution !== attribution(doc.canonicalUrl)
      )
        throw new Error('document');
      const entry = parseFeedEntry(doc.selectedFeedEntry);
      publisherArticleRequest(entry, selection);
      if (
        entry.title !== article.title ||
        entry.publishedAt !== doc.publishedAt ||
        new Date(Date.parse(doc.publishedAt) + 9 * 3_600_000)
          .toISOString()
          .slice(0, 10)
          .replace(/-/gu, '.') !== doc.publicationDisplayDate ||
        Date.parse(doc.publishedAt) > Date.parse(doc.fetchedAt) + 300_000 ||
        Math.abs(Date.parse(doc.policyObservation.fetchedAt) - Date.parse(doc.fetchedAt)) > 60_000
      )
        throw new Error('publication');
      let cursor = 0;
      for (const span of doc.blocks) {
        if (
          span.start !== cursor ||
          span.end <= span.start ||
          span.end > article.body.text.length ||
          sha256Hex(article.body.text.slice(span.start, span.end)) !== span.sha256
        )
          throw new Error('span');
        assertExactSpan(article.body.text, {
          ...span,
          quote: article.body.text.slice(span.start, span.end),
        });
        if (
          span.end < article.body.text.length &&
          article.body.text.slice(span.end, span.end + 2) !== '\n\n'
        )
          throw new Error('separator');
        cursor = span.end + 2;
      }
      if (cursor - 2 !== article.body.text.length) throw new Error('body-coverage');
    } else if (
      doc !== null ||
      value.reason === null ||
      article.body !== null ||
      article.kind !== 'publisher-site-link'
    )
      throw new Error('link');
    const parsed = { ...value, selection, candidate };
    const { receiptSha256, ...payload } = parsed;
    if (inputHashOf(payload) !== receiptSha256) throw new Error('receipt');
    return deepFreeze(parsed);
  } catch {
    throw new PublisherReaderError('invalid-reader-result');
  }
}
