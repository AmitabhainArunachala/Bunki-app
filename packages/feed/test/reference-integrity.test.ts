import { describe, expect, it } from 'vitest';
import { getFeedSource, parseFeedReference, parseFeedXml, toFeedReference } from '../src/index.ts';
import { feedEntryId } from '../src/identity.ts';

const source = getFeedSource('asahi');
const entry = parseFeedXml(
  '<rss version="2.0"><channel><title>test</title><item><title>科学</title><link>https://www.asahi.com/articles/reference</link></item></channel></rss>',
  {
    sourceId: 'asahi',
    finalUrl: source.feed!.url,
    fetchedAt: '2026-09-10T03:00:00Z',
  },
).entries[0]!;
const reference = toFeedReference(entry);

describe('portable reference identity', () => {
  it('retains exactly the article reference without metadata', () => {
    expect(parseFeedReference(reference)).toEqual(reference);
    expect(Object.keys(reference).sort()).toEqual(
      ['format', 'v', 'sourceId', 'publisherId', 'entryId', 'canonicalUrl'].sort(),
    );
  });
  it.each([
    { entryId: 'feed:' + '0'.repeat(64) },
    { publisherId: 'mainichi' },
    { canonicalUrl: 'https://www.asahi.com/articles/replaced' },
    { canonicalUrl: 'https://www.asahi.com/articles/reference#silently-normalized' },
  ])('refuses a mismatched portable article identity: %j', (change) => {
    expect(() => parseFeedReference({ ...reference, ...change })).toThrow('invalid-feed-reference');
  });
  it('allows valid references to a future publisher without inventing current rights', () => {
    const publisherId = 'future-publisher';
    const canonicalUrl = 'https://example.org/japanese';
    const future = {
      ...reference,
      sourceId: 'future-source',
      publisherId,
      canonicalUrl,
      entryId: feedEntryId(publisherId, canonicalUrl),
    };
    expect(parseFeedReference(future)).toEqual(future);
  });
  it('cannot mint a new reference from a forged entry identity', () => {
    expect(() =>
      toFeedReference({ ...entry, canonicalUrl: 'https://example.org/replaced' }),
    ).toThrow('invalid-feed-reference');
  });
});
