import { z } from 'zod';
import { parseFeedEntry } from '../contracts.ts';
import { deepFreeze, type FeedEntry } from '../model.ts';

export const ALMA_ORIGIN = 'https://alma-telescope.jp';
export const ALMA_POLICY_URL = `${ALMA_ORIGIN}/policy/`;

export const GLOBAL_VOICES_ORIGIN = 'https://jp.globalvoices.org';
export const GLOBAL_VOICES_LICENSE_URL = 'https://creativecommons.org/licenses/by/3.0/';
export const GLOBAL_VOICES_POLICY_URL =
  'https://jp.globalvoices.org/about/%E8%A8%98%E4%BA%8B%E3%81%AE%E8%BB%A2%E8%BC%89%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6/';
export const PUBLISHER_READER_VERSION = 'global-voices-ja/1';
export const MAX_PUBLISHER_HTML_BYTES = 2_000_000;

export const PUBLISHER_LINK_REASONS = [
  'policy-disabled',
  'unsupported-publisher',
  'unsupported-article-url',
  'entry-unavailable',
  'entry-revised',
  'reader-busy',
  'network-error',
  'network-timeout',
  'cancelled',
  'http-forbidden',
  'http-not-found',
  'http-rate-limited',
  'http-failed',
  'redirect-rejected',
  'unsupported-mime',
  'invalid-encoding',
  'html-size-limit',
  'html-structure-invalid',
  'template-changed',
  'canonical-mismatch',
  'title-missing',
  'title-ambiguous',
  'attribution-missing',
  'attribution-ambiguous',
  'license-missing',
  'license-unreviewed',
  'date-missing',
  'date-invalid',
  'body-missing',
  'body-size-limit',
  'unsupported-body-structure',
  'japanese-text-missing',
  'response-identity-mismatch',
] as const;
export type PublisherLinkReason = (typeof PUBLISHER_LINK_REASONS)[number];
export class PublisherReaderError extends Error {
  constructor(
    readonly code: PublisherLinkReason | 'invalid-reader-selection' | 'invalid-reader-result',
  ) {
    super(code);
    this.name = 'PublisherReaderError';
  }
}

const selectionSchema = z.strictObject({
  sourceId: z.enum(['global-voices', 'alma-ja']),
  entryId: z.string().regex(/^feed:[a-f0-9]{64}$/u),
  revisionId: z.string().regex(/^feedv:[a-f0-9]{64}$/u),
});
export type PublisherReadSelection = Readonly<z.infer<typeof selectionSchema>>;

/** The renderer can select an existing feed entry; it cannot choose a URL. */
export function parsePublisherReadSelection(raw: unknown): PublisherReadSelection {
  const parsed = selectionSchema.safeParse(raw);
  if (!parsed.success) throw new PublisherReaderError('invalid-reader-selection');
  return deepFreeze(parsed.data);
}

/** Only the reviewed dated Japanese article template, with no query or fragments. */
export function globalVoicesArticleUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PublisherReaderError('unsupported-article-url');
  }
  const match = /^\/(20\d{2})\/(\d{2})\/(\d{2})\/([1-9]\d{0,11})\/?$/u.exec(url.pathname);
  if (
    url.href !== raw ||
    url.origin !== GLOBAL_VOICES_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match
  )
    throw new PublisherReaderError('unsupported-article-url');
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day)
    throw new PublisherReaderError('unsupported-article-url');
  return `${GLOBAL_VOICES_ORIGIN}/${match[1]}/${match[2]}/${match[3]}/${match[4]}/`;
}

export function validatePublisherFeedEntry(raw: unknown, expected?: unknown): FeedEntry {
  let entry: FeedEntry;
  try {
    entry = parseFeedEntry(raw);
  } catch {
    throw new PublisherReaderError('entry-unavailable');
  }
  if (
    !['global-voices', 'alma-ja'].includes(entry.sourceId) ||
    entry.publisherId !== entry.sourceId
  )
    throw new PublisherReaderError('unsupported-publisher');
  if (entry.sourceId === 'alma-ja') almaArticleUrl(entry.canonicalUrl);
  else globalVoicesArticleUrl(entry.canonicalUrl);
  if (expected !== undefined) {
    const selection = parsePublisherReadSelection(expected);
    if (selection.sourceId !== entry.sourceId || selection.entryId !== entry.id)
      throw new PublisherReaderError('entry-unavailable');
    if (selection.revisionId !== entry.revisionId) throw new PublisherReaderError('entry-revised');
  }
  return entry;
}

export function publisherArticleRequest(raw: unknown, expected?: unknown) {
  const entry = validatePublisherFeedEntry(raw, expected);
  const canonicalUrl =
    entry.sourceId === 'alma-ja'
      ? almaArticleUrl(entry.canonicalUrl)
      : globalVoicesArticleUrl(entry.canonicalUrl);
  return deepFreeze({
    selection: parsePublisherReadSelection({
      sourceId: entry.sourceId,
      entryId: entry.id,
      revisionId: entry.revisionId,
    }),
    url: entry.canonicalUrl,
    canonicalUrl,
    // One narrowly justified redirect: this selected article's trailing slash.
    allowedUrls:
      entry.sourceId === 'alma-ja' ? [canonicalUrl] : [canonicalUrl, canonicalUrl.slice(0, -1)],
  });
}

/** An OG alias is checked separately; it is never a transport destination. */
export function almaArticleUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PublisherReaderError('unsupported-article-url');
  }
  if (
    url.href !== raw ||
    url.origin !== ALMA_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/news\/[a-z0-9][a-z0-9-]{0,119}\.html$/u.test(url.pathname)
  )
    throw new PublisherReaderError('unsupported-article-url');
  return raw;
}

/** Fixed policy endpoint, derived only after the same trusted selected-entry check. */
export function publisherPolicyRequest(raw: unknown, expected?: unknown) {
  const entry = validatePublisherFeedEntry(raw, expected);
  if (entry.sourceId !== 'alma-ja') throw new PublisherReaderError('unsupported-publisher');
  return deepFreeze({
    url: ALMA_POLICY_URL,
    canonicalUrl: ALMA_POLICY_URL,
    allowedUrls: [ALMA_POLICY_URL],
  });
}
