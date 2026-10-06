import { z } from 'zod';
import { feedEntryId } from './identity.ts';

export const FEED_OPERATIONS = [
  'personal-fetch',
  'display-metadata',
  'retain-metadata',
  'sync-metadata',
  'excerpt-display',
  'display-body',
  'retain-body',
  'sync-body',
  'server-ingest',
  'ai-transform',
  'synthesize-audio',
  'publisher-audio',
  'image-display',
] as const;
export type FeedOperation = (typeof FEED_OPERATIONS)[number];

const hasControl = (value: string) =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
  });
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !hasControl(value));
export const sourceIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/u);
export const instantSchema = z.string().datetime({ offset: true });

export class FeedError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'FeedError';
  }
}

export function canonicalFeedLink(value: string, base?: string): string {
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    value.trim() !== value ||
    hasControl(value) ||
    /[\s\\]/u.test(value)
  )
    throw new FeedError('unsafe-link');
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new FeedError('unsafe-link');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname)
    throw new FeedError('unsafe-link');
  if (
    !url.hostname.includes('.') ||
    url.hostname.startsWith('[') ||
    /^[0-9.]+$/u.test(url.hostname) ||
    ['.localhost', '.local', '.internal'].some((suffix) => url.hostname.endsWith(suffix))
  )
    throw new FeedError('non-public-link');
  url.hash = '';
  return url.href;
}

const webUrl = text(4096).transform((value) => canonicalFeedLink(value));
const evidenceSchema = z.strictObject({ url: webUrl, checkedAt: instantSchema, note: text(700) });
export type FeedEvidence = z.infer<typeof evidenceSchema>;
const decisionSchema = z.strictObject({
  status: z.enum(['allowed', 'denied', 'unknown']),
  scope: z.literal('personal-device'),
  reason: text(700),
  evidence: z.array(evidenceSchema).min(1).max(5),
});
export type FeedDecision = z.infer<typeof decisionSchema>;
export type FeedRights = Readonly<Record<FeedOperation, FeedDecision>>;

export const feedSourceSchema = z.strictObject({
  id: sourceIdSchema,
  publisherId: sourceIdSchema,
  name: text(150),
  publisher: text(150),
  homepage: webUrl,
  language: z.literal('ja'),
  topics: z.array(text(40)).min(1).max(16),
  mode: z.enum(['personal-feed', 'publisher-window']),
  feed: z
    .strictObject({
      url: webUrl.refine((value) => new URL(value).protocol === 'https:'),
      redirectUrls: z.array(webUrl.refine((value) => new URL(value).protocol === 'https:')).max(5),
      interfaceEvidence: evidenceSchema,
    })
    .nullable(),
  cadence: z.strictObject({
    minIntervalMs: z.number().int().min(60_000),
    staleAfterMs: z.number().int().min(60_000),
    label: text(120),
  }),
  rights: z.record(z.enum(FEED_OPERATIONS), decisionSchema),
  notes: z.array(text(700)).max(10),
});
export type FeedSource = z.infer<typeof feedSourceSchema>;

export interface FeedEntry {
  readonly id: string;
  readonly revisionId: string;
  readonly sourceId: string;
  readonly publisherId: string;
  readonly publisherUid: string | null;
  readonly canonicalUrl: string;
  /** Text only. Consumers must use textContent, never innerHTML. */
  readonly title: string;
  readonly publishedAt: string | null;
  readonly updatedAt: string | null;
  readonly categories: readonly string[];
  readonly discoveredAt: string;
  readonly body: null;
  readonly readerMode: 'publisher-window';
}

export interface FeedSnapshot {
  readonly sourceId: string;
  readonly publisherId: string;
  readonly format: 'rss1' | 'rss2' | 'atom';
  readonly title: string;
  readonly fetchedAt: string;
  readonly finalUrl: string;
  readonly entries: readonly FeedEntry[];
  readonly rejectedItems: number;
  readonly duplicateItems: number;
  readonly futureItems: number;
  readonly latestPublishedAt: string | null;
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function validateFeedSource(raw: unknown): FeedSource {
  const result = feedSourceSchema.safeParse(raw);
  if (!result.success) throw new FeedError('invalid-source-definition');
  if (
    result.data.mode === 'personal-feed' &&
    (!result.data.feed ||
      result.data.rights['personal-fetch'].status !== 'allowed' ||
      result.data.rights['display-metadata'].status !== 'allowed')
  )
    throw new FeedError('source-mode-without-basis');
  return deepFreeze(result.data);
}

export function mayUseFeed(source: FeedSource, operation: FeedOperation): boolean {
  return source.rights[operation].status === 'allowed';
}

const referenceSchema = z.strictObject({
  format: z.literal('kairo-feed-reference'),
  v: z.literal(1),
  sourceId: sourceIdSchema,
  publisherId: sourceIdSchema,
  entryId: z.string().regex(/^feed:[a-f0-9]{64}$/u),
  canonicalUrl: text(4096).refine((value) => canonicalFeedLink(value) === value),
});
export type FeedReference = z.infer<typeof referenceSchema>;
/** Sync references independently of publisher metadata/body retention. */
export function toFeedReference(entry: FeedEntry): FeedReference {
  return parseFeedReference({
    format: 'kairo-feed-reference',
    v: 1,
    sourceId: entry.sourceId,
    publisherId: entry.publisherId,
    entryId: entry.id,
    canonicalUrl: entry.canonicalUrl,
  });
}
export function parseFeedReference(raw: unknown): FeedReference {
  try {
    const result = referenceSchema.parse(raw);
    if (result.entryId !== feedEntryId(result.publisherId, result.canonicalUrl))
      throw new Error('reference-identity');
    return deepFreeze(result);
  } catch {
    throw new FeedError('invalid-feed-reference');
  }
}
