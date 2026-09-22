import {
  createAlmaArticle,
  createAlmaPublisherLink,
  parseAlmaReadResult,
  type AlmaReadResult,
} from './alma.ts';
export * from './alma.ts';
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
import { extractGlobalVoicesHtml } from './html.ts';
import {
  GLOBAL_VOICES_LICENSE_URL,
  GLOBAL_VOICES_POLICY_URL,
  MAX_PUBLISHER_HTML_BYTES,
  PUBLISHER_LINK_REASONS,
  PUBLISHER_READER_VERSION,
  PublisherReaderError,
  globalVoicesArticleUrl,
  parsePublisherReadSelection,
  publisherArticleRequest,
  type PublisherLinkReason,
  type PublisherReadSelection,
} from './selection.ts';
export * from './selection.ts';

const POLICY_CHECKED_AT = '2026-09-09T15:00:00.000Z';
const NORMALIZATION = 'gv-plain-text/1' as const;
const MODIFICATION =
  'HTML layout, images and embedded media omitted; whitespace normalized; article text otherwise copied.';
const licensedOperations = [
  'discover-metadata',
  'display-body',
  'retain-offline',
  'sync-body',
  'quote-extract',
] as const;
function capabilities(fullReader: boolean): ArticleCapabilityInput {
  return Object.fromEntries(
    (fullReader ? licensedOperations : ['discover-metadata']).map((operation) => [
      operation,
      {
        status: 'allowed',
        basis: {
          kind: fullReader ? 'license' : 'publisher-policy',
          reference: fullReader
            ? GLOBAL_VOICES_LICENSE_URL
            : 'https://jp.globalvoices.org/read-share/',
          checkedAt: POLICY_CHECKED_AT,
        },
      },
    ]),
  );
}

function attributionFor(
  canonicalUrl: string,
  authors: readonly { name: string }[],
  translators: readonly { name: string }[],
  otherCredits: readonly { role: string; name: string }[] = [],
) {
  const additional = otherCredits.map((credit) => `; ${credit.role}: ${credit.name}`).join('');
  return `Global Voices 日本語 — 原文: ${authors.map((credit) => credit.name).join(', ')}; 翻訳: ${translators.map((credit) => credit.name).join(', ')}${additional}. ${canonicalUrl} — CC BY 3.0 (${GLOBAL_VOICES_LICENSE_URL}). ${MODIFICATION}`;
}

const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const bounded = (max: number) => z.string().min(1).max(max);
const credit = z.strictObject({ name: bounded(100), url: bounded(4096) });
const block = z.strictObject({
  kind: z.enum(['paragraph', 'heading', 'list-item']),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  sha256: sha,
});
const documentSchema = z.strictObject({
  parserVersion: z.literal(PUBLISHER_READER_VERSION),
  canonicalUrl: bounded(4096),
  finalUrl: bounded(4096),
  fetchedAt: instantSchema,
  responseSha256: sha,
  responseBytes: z.number().int().min(1).max(MAX_PUBLISHER_HTML_BYTES),
  publishedAt: instantSchema,
  updatedAt: instantSchema,
  authors: z.array(credit).min(1).max(4),
  translators: z.array(credit).min(1).max(4),
  otherCredits: z.array(credit.extend({ role: z.literal('校正') })).max(4),
  license: z.strictObject({
    id: z.literal('CC-BY-3.0'),
    url: z.literal(GLOBAL_VOICES_LICENSE_URL),
    policyUrl: z.literal(GLOBAL_VOICES_POLICY_URL),
  }),
  normalization: z.literal(NORMALIZATION),
  modification: z.literal(MODIFICATION),
  locationUnit: z.literal('utf16-code-unit'),
  blocks: z.array(block).min(1).max(2048),
  omittedElements: z.number().int().nonnegative().max(30_000),
  articleVersionId: bounded(200),
  contentSha256: sha,
});
export type PublisherSourceDocument = Readonly<z.infer<typeof documentSchema>>;
export type GlobalVoicesReadResult = Readonly<{
  format: 'kairo-publisher-read';
  v: 1;
  selection: PublisherReadSelection;
  status: 'full-reader' | 'publisher-link';
  candidate: ArticleCandidate;
  sourceDocument: PublisherSourceDocument | null;
  reason: PublisherLinkReason | null;
  receiptSha256: string;
}>;
export type PublisherReadResult = GlobalVoicesReadResult | AlmaReadResult;
const resultSchema = z.strictObject({
  format: z.literal('kairo-publisher-read'),
  v: z.literal(1),
  selection: z.unknown(),
  status: z.enum(['full-reader', 'publisher-link']),
  candidate: z.unknown(),
  sourceDocument: documentSchema.nullable(),
  reason: z.enum(PUBLISHER_LINK_REASONS).nullable(),
  receiptSha256: sha,
});

function finish(input: Omit<GlobalVoicesReadResult, 'receiptSha256'>): GlobalVoicesReadResult {
  return deepFreeze({ ...input, receiptSha256: inputHashOf(input) });
}

/** An available article link never supplies article body or adaptation permission. */
function createGlobalVoicesPublisherLink(
  rawEntry: unknown,
  reason: PublisherLinkReason,
  fetchedAt: string,
): GlobalVoicesReadResult {
  const entry = parseFeedEntry(rawEntry);
  if (entry.sourceId !== 'global-voices' || entry.publisherId !== 'global-voices')
    throw new PublisherReaderError('unsupported-publisher');
  if (
    !instantSchema.safeParse(fetchedAt).success ||
    !(PUBLISHER_LINK_REASONS as readonly string[]).includes(reason)
  )
    throw new PublisherReaderError('invalid-reader-result');
  fetchedAt = new Date(fetchedAt).toISOString();
  const selection = parsePublisherReadSelection({
    sourceId: entry.sourceId,
    entryId: entry.id,
    revisionId: entry.revisionId,
  });
  const attribution = `Global Voices 日本語 — ${entry.canonicalUrl}`;
  const candidate = normalizeArticleIntake(
    {
      itemId: entry.canonicalUrl,
      canonicalUrl: entry.canonicalUrl,
      title: entry.title.length <= 500 ? entry.title : 'Global Voices 日本語',
      publishedAt: entry.publishedAt,
      body: null,
    },
    {
      source: { id: 'global-voices', name: 'Global Voices 日本語', attribution },
      capabilities: capabilities(false),
      lineage: { kind: 'publisher-original' },
      provenance: [
        {
          sourceId: 'global-voices',
          sourceVersion: entry.revisionId,
          sourceUrl: entry.canonicalUrl,
          attribution,
          license: `Body rights not admitted: ${reason}`,
          modification: 'unmodified',
          evidenceRef: PUBLISHER_READER_VERSION,
          retrievedAt: fetchedAt,
        },
      ],
    },
  );
  return finish({
    format: 'kairo-publisher-read',
    v: 1,
    selection,
    status: 'publisher-link',
    candidate,
    sourceDocument: null,
    reason,
  });
}

const responseSchema = z.strictObject({
  html: z.string().max(MAX_PUBLISHER_HTML_BYTES),
  finalUrl: bounded(4096),
  contentType: bounded(300),
  fetchedAt: instantSchema,
  responseSha256: sha,
  responseBytes: z.number().int().min(1).max(MAX_PUBLISHER_HTML_BYTES),
});
export type PublisherHtmlResponse = Readonly<z.infer<typeof responseSchema>>;

/** Pure factory; only the native selected-entry adapter fetches publisher HTML. */
export function createGlobalVoicesArticle(
  rawEntry: unknown,
  rawResponse: unknown,
  enabled = true,
): GlobalVoicesReadResult {
  const entry = parseFeedEntry(rawEntry);
  if (entry.sourceId !== 'global-voices' || entry.publisherId !== 'global-voices')
    throw new PublisherReaderError('unsupported-publisher');
  const selected = responseSchema.safeParse(rawResponse);
  if (!selected.success) throw new PublisherReaderError('invalid-reader-result');
  const response = { ...selected.data, fetchedAt: new Date(selected.data.fetchedAt).toISOString() };
  if (!enabled)
    return createGlobalVoicesPublisherLink(entry, 'policy-disabled', response.fetchedAt);
  try {
    const request = publisherArticleRequest(entry);
    if (!request.allowedUrls.includes(response.finalUrl))
      throw new PublisherReaderError('redirect-rejected');
    if (!/^text\/html(?:\s*;\s*charset\s*=\s*"?utf-?8"?)?\s*$/iu.test(response.contentType))
      throw new PublisherReaderError('unsupported-mime');
    const bytes = new TextEncoder().encode(response.html);
    if (bytes.length > MAX_PUBLISHER_HTML_BYTES) throw new PublisherReaderError('html-size-limit');
    // Fatal UTF-8 decoding at transport plus this round trip rejects lone
    // surrogates and binds the received bytes, not a caller-supplied hash alone.
    if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== response.html)
      throw new PublisherReaderError('invalid-encoding');
    if (
      bytes.length !== response.responseBytes ||
      sha256Hex(response.html) !== response.responseSha256
    )
      throw new PublisherReaderError('response-identity-mismatch');
    const extracted = extractGlobalVoicesHtml(
      response.html,
      request.canonicalUrl,
      response.fetchedAt,
    );
    const author = extracted.authors.map((credit) => credit.name).join(', ');
    const attribution = attributionFor(
      request.canonicalUrl,
      extracted.authors,
      extracted.translators,
      extracted.otherCredits,
    );
    if (attribution.length > 1000) throw new PublisherReaderError('attribution-ambiguous');
    const candidate = normalizeArticleIntake(
      {
        itemId: request.canonicalUrl,
        canonicalUrl: request.canonicalUrl,
        title: extracted.title,
        author,
        publishedAt: extracted.publishedAt,
        body: { text: extracted.text },
      },
      {
        source: { id: 'global-voices', name: 'Global Voices 日本語', attribution },
        capabilities: capabilities(true),
        lineage: { kind: 'publisher-original' },
        provenance: [
          {
            sourceId: 'global-voices',
            sourceVersion: `${response.responseSha256}; updated=${extracted.updatedAt}`,
            sourceUrl: request.canonicalUrl,
            attribution,
            license: `CC BY 3.0 ${GLOBAL_VOICES_LICENSE_URL}`,
            modification: 'derived',
            evidenceRef: PUBLISHER_READER_VERSION,
            retrievedAt: response.fetchedAt,
          },
        ],
      },
    );
    const sourceDocument = documentSchema.parse({
      parserVersion: PUBLISHER_READER_VERSION,
      canonicalUrl: request.canonicalUrl,
      finalUrl: response.finalUrl,
      fetchedAt: response.fetchedAt,
      responseSha256: response.responseSha256,
      responseBytes: response.responseBytes,
      publishedAt: extracted.publishedAt,
      updatedAt: extracted.updatedAt,
      authors: extracted.authors,
      translators: extracted.translators,
      otherCredits: extracted.otherCredits,
      license: {
        id: 'CC-BY-3.0',
        url: GLOBAL_VOICES_LICENSE_URL,
        policyUrl: GLOBAL_VOICES_POLICY_URL,
      },
      normalization: NORMALIZATION,
      modification: MODIFICATION,
      locationUnit: 'utf16-code-unit',
      blocks: extracted.blocks,
      omittedElements: extracted.omittedElements,
      articleVersionId: candidate.article.versionId,
      contentSha256: candidate.article.body!.contentSha256,
    });
    return parseGlobalVoicesReadResult(
      finish({
        format: 'kairo-publisher-read',
        v: 1,
        selection: request.selection,
        status: 'full-reader',
        candidate,
        sourceDocument,
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
    return createGlobalVoicesPublisherLink(entry, reason, response.fetchedAt);
  }
}

/** Rehydrate transport/storage output. Hash coherence is not a license grant. */
function parseGlobalVoicesReadResult(raw: unknown, expected?: unknown): GlobalVoicesReadResult {
  try {
    const selected = resultSchema.parse(raw);
    const selection = parsePublisherReadSelection(selected.selection);
    if (
      expected !== undefined &&
      JSON.stringify(selection) !== JSON.stringify(parsePublisherReadSelection(expected))
    )
      throw new Error('selection');
    const candidate = parseArticleCandidate(selected.candidate);
    if (
      candidate.article.source.id !== 'global-voices' ||
      candidate.article.lineage.kind !== 'publisher-original' ||
      candidate.editorial.status !== 'pending' ||
      candidate.generationJob !== null ||
      candidate.article.suggestedVocabulary.length ||
      candidate.suggestedWords.length
    )
      throw new Error('article-kind');
    if (
      JSON.stringify(candidate.article.capabilities) !==
      JSON.stringify(normalizeArticleCapabilities(capabilities(selected.status === 'full-reader')))
    )
      throw new Error('capabilities');
    if (
      !candidate.article.canonicalUrl ||
      candidate.article.itemId !== candidate.article.canonicalUrl ||
      ![candidate.article.canonicalUrl, candidate.article.canonicalUrl.replace(/\/$/u, '')].some(
        (url) => feedEntryId('global-voices', url) === selection.entryId,
      )
    )
      throw new Error('selected-link');
    for (const operation of ['ai-transform', 'synthesize-audio', 'redistribute-audio'] as const)
      if (candidate.article.capabilities[operation].status === 'allowed')
        throw new Error('unreviewed-operation');
    const doc = selected.sourceDocument;
    if (selected.status === 'full-reader') {
      if (
        !doc ||
        selected.reason !== null ||
        !candidate.article.body ||
        candidate.article.kind !== 'full-reader-article' ||
        doc.canonicalUrl !== candidate.article.canonicalUrl ||
        globalVoicesArticleUrl(doc.canonicalUrl) !== doc.canonicalUrl ||
        globalVoicesArticleUrl(doc.finalUrl) !== doc.canonicalUrl ||
        doc.articleVersionId !== candidate.article.versionId ||
        doc.contentSha256 !== candidate.article.body.contentSha256 ||
        doc.publishedAt !== candidate.article.publishedAt ||
        Date.parse(doc.updatedAt) < Date.parse(doc.publishedAt) ||
        Date.parse(doc.updatedAt) > Date.parse(doc.fetchedAt) + 300_000 ||
        candidate.article.author !== doc.authors.map((credit) => credit.name).join(', ') ||
        candidate.article.source.attribution !==
          attributionFor(doc.canonicalUrl, doc.authors, doc.translators, doc.otherCredits)
      )
        throw new Error('document');
      for (const person of [...doc.authors, ...doc.translators, ...doc.otherCredits]) {
        const url = new URL(person.url);
        if (
          url.href !== person.url ||
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          url.hash ||
          url.search ||
          !(
            url.hostname === 'globalvoices.org' ||
            /^[a-z]{2,3}\.globalvoices\.org$/u.test(url.hostname)
          ) ||
          !url.pathname.startsWith('/author/')
        )
          throw new Error('credit-link');
      }
      let cursor = 0;
      for (const span of doc.blocks) {
        if (
          span.start !== cursor ||
          span.end <= span.start ||
          span.end > candidate.article.body.text.length ||
          sha256Hex(candidate.article.body.text.slice(span.start, span.end)) !== span.sha256
        )
          throw new Error('span');
        assertExactSpan(candidate.article.body.text, {
          ...span,
          quote: candidate.article.body.text.slice(span.start, span.end),
        });
        if (
          span.end < candidate.article.body.text.length &&
          candidate.article.body.text.slice(span.end, span.end + 2) !== '\n\n'
        )
          throw new Error('separator');
        cursor = span.end + 2;
      }
      if (cursor - 2 !== candidate.article.body.text.length) throw new Error('body-coverage');
    } else if (
      doc !== null ||
      selected.reason === null ||
      candidate.article.kind !== 'publisher-site-link'
    )
      throw new Error('link');
    const value = { ...selected, selection, candidate };
    const { receiptSha256, ...payload } = value;
    if (inputHashOf(payload) !== receiptSha256) throw new Error('receipt');
    return deepFreeze(value);
  } catch {
    throw new PublisherReaderError('invalid-reader-result');
  }
}

/** Native dispatch remains source-bound; the renderer never supplies a URL or policy. */
export function createSelectedPublisherArticle(
  rawEntry: unknown,
  rawResponse: unknown,
  rawPolicy?: unknown,
  enabled = true,
): PublisherReadResult {
  const entry = parseFeedEntry(rawEntry);
  return entry.sourceId === 'alma-ja'
    ? createAlmaArticle(entry, rawResponse, rawPolicy, enabled)
    : createGlobalVoicesArticle(entry, rawResponse, enabled);
}

export function createPublisherLink(
  rawEntry: unknown,
  reason: PublisherLinkReason,
  fetchedAt: string,
): PublisherReadResult {
  const entry = parseFeedEntry(rawEntry);
  return entry.sourceId === 'alma-ja'
    ? createAlmaPublisherLink(entry, reason, fetchedAt)
    : createGlobalVoicesPublisherLink(entry, reason, fetchedAt);
}
export function parsePublisherReadResult(raw: unknown, expected?: unknown): PublisherReadResult {
  if (
    raw &&
    typeof raw === 'object' &&
    (raw as { selection?: { sourceId?: unknown } }).selection?.sourceId === 'alma-ja'
  )
    return parseAlmaReadResult(raw, expected);
  return parseGlobalVoicesReadResult(raw, expected);
}

/** Typed presentation of a validated saved result. Unknowns stay explicit;
 * provider attribution is never relabelled as a named author or translator.
 */
export function publisherReadingDetails(raw: unknown) {
  const result = parsePublisherReadResult(raw);
  if (result.status !== 'full-reader' || !result.sourceDocument)
    throw new PublisherReaderError('invalid-reader-result');
  const doc = result.sourceDocument;
  if (doc.parserVersion === 'alma-ja/1')
    return deepFreeze({
      authors: [],
      translators: [],
      otherCredits: [],
      authorUnspecified: true,
      provider: { name: doc.textCredit.provider, url: doc.textCredit.policyUrl },
      license: { label: 'CC BY 4.0', url: doc.license.url },
      publishedAt: doc.publishedAt,
      publicationInstantSource: doc.publicationInstantSource,
      updatedAt: doc.articleModifiedAt,
    });
  return deepFreeze({
    authors: doc.authors,
    translators: doc.translators,
    otherCredits: doc.otherCredits,
    authorUnspecified: false,
    provider: null,
    license: { label: 'CC BY 3.0', url: doc.license.url },
    publishedAt: doc.publishedAt,
    publicationInstantSource: 'article-page' as const,
    updatedAt: doc.updatedAt,
  });
}
