import { describe, expect, it } from 'vitest';
import {
  FEED_REFRESH_STATUSES,
  getFeedSource,
  parseFeedEntry,
  parseFeedRefreshResult,
  parseFeedXml,
} from '../src/index.ts';

const now = '2026-09-10T03:00:00.000Z';
const source = getFeedSource('asahi');
const snapshot = parseFeedXml(
  '<rss version="2.0"><channel><title>検証</title><item><title>日本語のニュース</title><link>https://www.asahi.com/articles/one</link><pubDate>Thu, 10 Sep 2026 02:00:00 GMT</pubDate><category>科学</category></item></channel></rss>',
  { sourceId: source.id, finalUrl: source.feed!.url, fetchedAt: now },
);
const entry = snapshot.entries[0]!;
const reply = {
  sourceId: source.id,
  status: 'updated',
  entries: [entry],
  checkedAt: now,
  lastSuccessAt: now,
  nextCheckAt: '2026-09-10T04:00:00.000Z',
  latestPublishedAt: snapshot.latestPublishedAt,
  freshness: 'current',
  error: null,
};

describe('native feed data contracts', () => {
  it('accepts the parser output and freezes independently parsed entry/result data', () => {
    expect(parseFeedEntry(entry)).toEqual(entry);
    expect(parseFeedRefreshResult(reply, 'asahi')).toEqual(reply);
    expect(Object.isFrozen(parseFeedRefreshResult(reply).entries[0])).toBe(true);
    expect(FEED_REFRESH_STATUSES).toContain('publisher-window');
  });
  it.each([
    { id: 'feed:' + '0'.repeat(64) },
    { revisionId: 'feedv:' + '0'.repeat(64) },
    { title: 'replaced title without revision' },
    { canonicalUrl: 'https://www.asahi.com/articles/one#fragment' },
    { canonicalUrl: 'javascript:alert(1)' },
    { publisherId: 'mainichi' },
    { sourceId: 'unknown-source' },
    { categories: ['科学', '科学'] },
    { body: '<p>unexpected body</p>' },
    { html: '<script>bad</script>' },
    { publishedAt: '2026-09-10 02:00' },
    { title: 'control\u0000text' },
  ])('rejects forged, ambiguous or broadened entry data: %j', (change) => {
    expect(() => parseFeedEntry({ ...entry, ...change })).toThrow('invalid-feed-entry');
  });
  it('rejects a source result switched across the expected channel or containing another channel entry', () => {
    expect(() => parseFeedRefreshResult(reply, 'mainichi')).toThrow('invalid-feed-result');
    expect(() => parseFeedRefreshResult({ ...reply, sourceId: 'asahi-science' })).toThrow(
      'invalid-feed-result',
    );
  });
  it.each([
    { entries: [entry, entry] },
    { entries: Array(251).fill(entry) },
    { entries: null },
    { status: 'success-ish' },
    { html: '<p>extra</p>' },
    { error: 'https://secret.invalid' },
    { nextCheckAt: '2026-09-10T02:00:00.000Z' },
    { lastSuccessAt: '2026-09-10T05:00:00.000Z' },
    { latestPublishedAt: '2099-01-01T00:00:00.000Z' },
    { freshness: 'never-fetched' },
    { latestPublishedAt: null },
    { status: 'publisher-window' },
    { error: 'unexpected-error-with-success' },
  ])('rejects incoherent or oversized native results: %j', (change) => {
    expect(() => parseFeedRefreshResult({ ...reply, ...change })).toThrow('invalid-feed-result');
  });
  it('accepts truthful errors, deferred and publisher-only routes without granting body capabilities', () => {
    for (const status of [
      'failed',
      'forbidden',
      'not-found',
      'rate-limited',
      'deferred',
      'unavailable',
    ]) {
      expect(parseFeedRefreshResult({ ...reply, status }).status).toBe(status);
    }
    const empty = {
      ...reply,
      sourceId: 'newton',
      status: 'publisher-window',
      entries: [],
      checkedAt: null,
      lastSuccessAt: null,
      nextCheckAt: '1970-01-01T00:00:00.000Z',
      latestPublishedAt: null,
      freshness: 'never-fetched',
      error: 'publisher-route-or-unresolved-basis',
    };
    expect(parseFeedRefreshResult(empty, 'newton').entries).toEqual([]);
    expect(() => parseFeedRefreshResult({ ...empty, entries: [entry] })).toThrow(
      'invalid-feed-result',
    );
  });
});
