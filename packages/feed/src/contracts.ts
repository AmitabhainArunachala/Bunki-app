import { z } from 'zod';
import {
  canonicalFeedLink,
  deepFreeze,
  FeedError,
  instantSchema,
  sourceIdSchema,
  type FeedEntry,
} from './model.ts';
import { getFeedSource } from './registry.ts';
import { feedEntryId, feedRevisionId } from './identity.ts';

export const FEED_REFRESH_STATUSES = [
  'updated',
  'not-modified',
  'forbidden',
  'rate-limited',
  'not-found',
  'failed',
  'publisher-window',
  'deferred',
  'unavailable',
] as const;
export const FEED_FRESHNESS_VALUES = [
  'never-fetched',
  'publication-date-unknown',
  'stale',
  'current',
] as const;
const text = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine(
      (value) =>
        !Array.from(value).some((char) => {
          const code = char.charCodeAt(0);
          return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
        }),
    );
const instant = instantSchema.refine((value) => Date.parse(value) >= 0);
const entrySchema = z.strictObject({
  id: z.string().regex(/^feed:[a-f0-9]{64}$/u),
  revisionId: z.string().regex(/^feedv:[a-f0-9]{64}$/u),
  sourceId: sourceIdSchema,
  publisherId: sourceIdSchema,
  publisherUid: text(4096).nullable(),
  canonicalUrl: text(4096),
  title: text(1000),
  publishedAt: instant.nullable(),
  updatedAt: instant.nullable(),
  discoveredAt: instant,
  categories: z.array(text(120)).max(20),
  body: z.null(),
  readerMode: z.literal('publisher-window'),
});

/** Validate metadata crossing a native/renderer boundary, including its digest. */
export function parseFeedEntry(raw: unknown): FeedEntry {
  try {
    const entry = entrySchema.parse(raw);
    const source = getFeedSource(entry.sourceId);
    if (
      source.publisherId !== entry.publisherId ||
      canonicalFeedLink(entry.canonicalUrl) !== entry.canonicalUrl ||
      JSON.stringify([...new Set(entry.categories)].sort()) !== JSON.stringify(entry.categories) ||
      entry.id !== feedEntryId(entry.publisherId, entry.canonicalUrl) ||
      entry.revisionId !== feedRevisionId(entry)
    )
      throw new Error('entry-identity-mismatch');
    return deepFreeze(entry);
  } catch {
    throw new FeedError('invalid-feed-entry');
  }
}

const replySchema = z.strictObject({
  sourceId: sourceIdSchema,
  status: z.enum(FEED_REFRESH_STATUSES),
  entries: z.array(z.unknown()).max(250),
  checkedAt: instant.nullable(),
  lastSuccessAt: instant.nullable(),
  nextCheckAt: instant,
  latestPublishedAt: instant.nullable(),
  freshness: z.enum(FEED_FRESHNESS_VALUES),
  error: z
    .string()
    .regex(/^[a-z0-9-]{1,80}$/u)
    .nullable(),
});
export type FeedRefreshResult = Omit<z.infer<typeof replySchema>, 'entries'> & {
  readonly entries: readonly FeedEntry[];
};

export function parseFeedRefreshResult(raw: unknown, expectedSourceId?: string): FeedRefreshResult {
  try {
    if (
      !raw ||
      typeof raw !== 'object' ||
      !Array.isArray((raw as Record<string, unknown>)['entries']) ||
      ((raw as Record<string, unknown>)['entries'] as unknown[]).length > 250
    )
      throw new Error('result-size');
    const result = replySchema.parse(raw);
    const source = getFeedSource(result.sourceId);
    if (expectedSourceId !== undefined && result.sourceId !== expectedSourceId)
      throw new Error('source-mismatch');
    const entries = result.entries.map(parseFeedEntry);
    if (
      entries.some((entry) => entry.sourceId !== source.id) ||
      new Set(entries.map((entry) => entry.id)).size !== entries.length
    )
      throw new Error('entry-source-or-duplicate');
    if (result.checkedAt !== null && Date.parse(result.nextCheckAt) < Date.parse(result.checkedAt))
      throw new Error('invalid-cadence');
    if (
      result.lastSuccessAt !== null &&
      (result.checkedAt === null || Date.parse(result.lastSuccessAt) > Date.parse(result.checkedAt))
    )
      throw new Error('invalid-success-clock');
    if (
      result.latestPublishedAt !== null &&
      (result.lastSuccessAt === null ||
        Date.parse(result.latestPublishedAt) > Date.parse(result.lastSuccessAt) + 300_000)
    )
      throw new Error('invalid-publication-clock');
    if (
      result.lastSuccessAt === null &&
      (entries.length > 0 || result.freshness !== 'never-fetched')
    )
      throw new Error('unfetched-metadata');
    if (
      result.lastSuccessAt !== null &&
      (result.latestPublishedAt === null
        ? result.freshness !== 'publication-date-unknown'
        : !['stale', 'current'].includes(result.freshness))
    )
      throw new Error('invalid-freshness');
    if (
      ['updated', 'not-modified'].includes(result.status) &&
      (source.mode !== 'personal-feed' || result.lastSuccessAt === null || result.error !== null)
    )
      throw new Error('invalid-success');
    if (
      ['forbidden', 'rate-limited', 'not-found', 'failed'].includes(result.status) &&
      result.checkedAt === null
    )
      throw new Error('failure-without-check');
    if (
      result.status === 'publisher-window' &&
      (source.mode !== 'publisher-window' || entries.length)
    )
      throw new Error('invalid-publisher-route');
    if (result.status === 'deferred' && result.error !== null) throw new Error('invalid-deferred');
    return deepFreeze({ ...result, entries });
  } catch {
    throw new FeedError('invalid-feed-result');
  }
}
