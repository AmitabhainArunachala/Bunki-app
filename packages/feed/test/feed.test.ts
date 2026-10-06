import { describe, expect, it } from 'vitest';
import {
  applyFeedResult,
  canonicalFeedLink,
  feedFreshness,
  getFeedSource,
  initialFeedState,
  MAX_FEED_BYTES,
  parseFeedReference,
  parseFeedRequestState,
  parseFeedXml,
  planFeedRequest,
  SOURCE_REGISTRY,
  sourceCoverage,
  toFeedReference,
  validateFeedSource,
} from '../src/index.ts';

const now = '2026-09-10T03:00:00.000Z';
const nowMs = Date.parse(now);
const source = getFeedSource('asahi');
const rss = (items: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>テスト通信</title>${items}</channel></rss>`;
const item = (title = '科学の新しい話', extra = '', link = 'https://www.asahi.com/articles/one') =>
  `<item><title>${title}</title><link>${link}</link><pubDate>Thu, 10 Sep 2026 02:00:00 GMT</pubDate>${extra}</item>`;
const parse = (xml: string, sourceId = 'asahi') =>
  parseFeedXml(xml, { sourceId, finalUrl: getFeedSource(sourceId).feed!.url, fetchedAt: now });

describe('bounded XML feed metadata', () => {
  it('parses real RSS1/RDF structure by namespaces rather than prefix spelling', () => {
    const result = parse(
      `<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:d="http://purl.org/dc/elements/1.1/"><channel r:about="https://www.asahi.com/"><title>朝の科学</title></channel><item r:about="https://www.asahi.com/articles/one"><title>宇宙 &amp; 地球</title><link>https://www.asahi.com/articles/one#heading</link><d:date>2026-09-10T11:00:00+09:00</d:date><d:subject>科学</d:subject></item></r:RDF>`,
    );
    expect(result.format).toBe('rss1');
    expect(result.entries[0]).toMatchObject({
      title: '宇宙 & 地球',
      canonicalUrl: 'https://www.asahi.com/articles/one',
      publishedAt: '2026-09-10T02:00:00.000Z',
      categories: ['科学'],
      body: null,
    });
  });
  it('parses RSS2 CDATA as inert text and drops all body/media capabilities', () => {
    const result = parse(
      rss(
        item(
          '<![CDATA[<img src=x onerror=alert(1)> & 日本語]]>',
          '<description><![CDATA[<script>throw Error(1)</script>secret body]]></description><enclosure url="https://example.com/private.mp3" type="audio/mpeg"/>',
        ),
      ),
    );
    expect(result.entries[0]?.title).toContain('<img');
    expect(JSON.stringify(result)).not.toContain('secret body');
    expect(JSON.stringify(result)).not.toContain('private.mp3');
    expect(result.entries[0]?.readerMode).toBe('publisher-window');
  });
  it('parses Atom alternate links, relative xml:base and stable dates', () => {
    const result = parse(
      `<feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://www.asahi.com/articles/"><title>研究</title><entry xml:base="sub/"><id>urn:article:1</id><title>観測の話</title><published>2026-09-10T02:00:00Z</published><updated>2026-09-10T02:30:00Z</updated><link rel="self" href="private.atom"/><link rel="alternate" type="text/html" href="one#part"/><category term="宇宙"/></entry></feed>`,
    );
    expect(result.format).toBe('atom');
    expect(result.entries[0]).toMatchObject({
      canonicalUrl: 'https://www.asahi.com/articles/sub/one',
      publisherUid: 'urn:article:1',
      updatedAt: '2026-09-10T02:30:00.000Z',
      categories: ['宇宙'],
    });
  });
  it('keeps canonical identity across channel/GUID/fragment changes and versions changed metadata', () => {
    const first = parse(rss(item('朝の科学', '<guid isPermaLink="false">one</guid>'))).entries[0]!;
    const same = parse(
      rss(
        item(
          '朝の科学',
          '<guid isPermaLink="false">reissued</guid>',
          'https://www.asahi.com/articles/one#x',
        ),
      ),
      'asahi-science',
    ).entries[0]!;
    const revised = parse(rss(item('訂正された科学'))).entries[0]!;
    expect(first.id).toBe(same.id);
    expect(first.revisionId).toBe(same.revisionId);
    expect(first.id).toBe(revised.id);
    expect(first.revisionId).not.toBe(revised.revisionId);
    expect(Object.isFrozen(first)).toBe(true);
  });
  it('deduplicates an identical URL and isolates one invalid entry', () => {
    const result = parse(rss(item() + item() + item('危険', '', 'javascript:alert(1)')));
    expect(result.entries).toHaveLength(1);
    expect(result.duplicateItems).toBe(1);
    expect(result.rejectedItems).toBe(1);
  });
  it.each([
    '<!DOCTYPE rss SYSTEM "https://attacker.invalid/external.dtd">',
    '<!DOCTYPE rss [<!ENTITY leak SYSTEM "file:///etc/passwd">]>',
    '<!DOCTYPE rss [<!ENTITY a "ha"><!ENTITY b "&a;&a;&a;">]>',
  ])('rejects DTD/entity declarations before parsing: %s', (declaration) => {
    expect(() => parse(declaration + rss(item('&leak;')))).toThrow('xml-declarations-forbidden');
  });
  it.each([
    '<rss version="2.0"><channel><title>bad</channel></rss>',
    '<rss version="2.0"><channel><title>&unknown;</title></channel></rss>',
    '<html><body>Upstream blocked request</body></html>',
    '<rss version="2.0"><channel/><channel/></rss>',
    '<feed xmlns="https://attacker.invalid/atom"><title>x</title></feed>',
  ])('rejects malformed or unsupported XML: %s', (xml) => expect(() => parse(xml)).toThrow());
  it('rejects input size, depth, node and item floods', () => {
    expect(() => parse(' '.repeat(MAX_FEED_BYTES + 1))).toThrow('feed-size-limit');
    expect(() => parse('<a>'.repeat(100) + '</a>'.repeat(100))).toThrow('xml-complexity-limit');
    expect(() => parse('<a>' + '<x/>'.repeat(20_001) + '</a>')).toThrow('xml-complexity-limit');
    expect(() => parse(rss(item().repeat(251)))).toThrow('feed-item-limit');
  });
  it('does not count future or undated items as a fresh publication', () => {
    const result = parse(
      rss(
        '<item><title>未来</title><link>https://example.com/one</link><pubDate>2099-01-01T00:00:00Z</pubDate></item><item><title>不明</title><link>https://example.com/two</link><pubDate>2026-09-10 02:00</pubDate></item>',
      ),
    );
    expect(result.futureItems).toBe(1);
    expect(result.latestPublishedAt).toBeNull();
    expect(result.entries[1]?.publishedAt).toBeNull();
  });
  it('accepts a legitimately empty valid feed without treating it as fresh', () => {
    expect(parse(rss(''))).toMatchObject({ entries: [], latestPublishedAt: null });
    expect(() => parse(rss(item('', '', 'file:///etc/passwd')))).toThrow('no-valid-feed-items');
  });
  it('requires a registered source and exact final endpoint', () => {
    expect(() =>
      parseFeedXml(rss(item()), {
        sourceId: 'asahi',
        finalUrl: 'https://example.com/feed',
        fetchedAt: now,
      }),
    ).toThrow('unregistered-feed-url');
    expect(() => parse(rss(item()), 'unknown-source')).toThrow('unknown-source');
  });
});

describe('source capabilities and reference continuity', () => {
  it('counts independent publishers separately from extra channels and full readers', () => {
    const count = sourceCoverage();
    expect(count.independentPublishers).toBeGreaterThanOrEqual(12);
    expect(count.cataloguedSources).toBeGreaterThan(count.independentPublishers);
    expect(count.topics.length).toBeGreaterThanOrEqual(8);
    expect(count.fullReaderSources).toBe(0);
    for (const name of ['asahi', 'mainichi', 'yomiuri', 'newton', 'hiragana-times'])
      expect(getFeedSource(name).name).toBeTruthy();
  });
  it('never promotes interface availability to body/AI/sync permissions', () => {
    for (const row of SOURCE_REGISTRY) {
      expect(row.rights['display-body'].status).not.toBe('allowed');
      expect(row.rights['ai-transform'].status).not.toBe('allowed');
      expect(row.rights['sync-body'].status).not.toBe('allowed');
      expect(row.rights['server-ingest'].status).toBe('denied');
    }
    expect(getFeedSource('itmedia').feed).not.toBeNull();
    expect(planFeedRequest(getFeedSource('itmedia'), initialFeedState(), nowMs)).toMatchObject({
      kind: 'unavailable',
    });
    expect(() =>
      validateFeedSource({ ...getFeedSource('itmedia'), mode: 'personal-feed' }),
    ).toThrow('source-mode-without-basis');
  });
  it('syncs only source identity and canonical references, rejecting copied publisher metadata', () => {
    const entry = parse(rss(item())).entries[0]!;
    const reference = toFeedReference(entry);
    expect(Object.keys(reference).sort()).toEqual([
      'canonicalUrl',
      'entryId',
      'format',
      'publisherId',
      'sourceId',
      'v',
    ]);
    expect(parseFeedReference(reference)).toEqual(reference);
    expect(() => parseFeedReference({ ...reference, title: entry.title })).toThrow(
      'invalid-feed-reference',
    );
  });
  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,x',
    'https://user:pass@example.com/',
    'http://127.0.0.1/a',
    'https://[::1]/',
    'https://private.local/',
    'https://example.com\\@localhost/a',
  ])('rejects unsafe canonical links: %s', (url) => expect(() => canonicalFeedLink(url)).toThrow());
});

describe('conditional requests, cadence, freshness and isolated failures', () => {
  it('uses validators only with a retained snapshot and preserves publication time on 304', () => {
    const updated = applyFeedResult(
      source,
      initialFeedState(),
      {
        status: 200,
        headers: { etag: '"one"', 'last-modified': 'Thu, 10 Sep 2026 02:00:00 GMT' },
        snapshot: parse(rss(item())),
      },
      nowMs,
    );
    expect(planFeedRequest(source, updated.state, nowMs)).toMatchObject({ kind: 'deferred' });
    expect(planFeedRequest(source, updated.state, updated.state.nextCheckAt, true)).toMatchObject({
      kind: 'fetch',
      headers: { 'if-none-match': '"one"' },
    });
    expect(planFeedRequest(source, updated.state, updated.state.nextCheckAt, false)).toMatchObject({
      kind: 'fetch',
      headers: {},
    });
    const next = applyFeedResult(
      source,
      updated.state,
      { status: 304, headers: {} },
      nowMs + 24 * 3_600_000,
    );
    expect(next.state.latestPublishedAt).toBe(updated.state.latestPublishedAt);
    expect(next.state.lastSuccessAt).toBe(nowMs + 24 * 3_600_000);
  });
  it('honors no-store, max-age and safe conditional header constraints', () => {
    const updated = applyFeedResult(
      source,
      initialFeedState(),
      {
        status: 200,
        headers: { etag: 'x\r\nCookie: bad', 'cache-control': 'no-store, max-age=7200' },
        snapshot: parse(rss(item())),
      },
      nowMs,
    );
    expect(updated.state.cacheable).toBe(false);
    expect(updated.state.etag).toBeNull();
    expect(updated.state.nextCheckAt - nowMs).toBe(7_200_000);
  });
  it.each([
    [403, 'forbidden'],
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'failed'],
  ])('isolates HTTP %s and retains the last good state', (status, expected) => {
    const previous = applyFeedResult(
      source,
      initialFeedState(),
      { status: 200, headers: {}, snapshot: parse(rss(item())) },
      nowMs,
    ).state;
    const result = applyFeedResult(
      source,
      previous,
      { status: status as number, headers: {} },
      nowMs + 3_600_000,
    );
    expect(result.status).toBe(expected);
    expect(result.state.lastSuccessAt).toBe(previous.lastSuccessAt);
    expect(result.state.failures).toBe(1);
    expect(result.state.nextCheckAt).toBeGreaterThan(nowMs + 3_600_000);
    expect(previous.failures).toBe(0);
  });
  it('respects Retry-After without aggressive automatic retry', () => {
    expect(
      applyFeedResult(
        source,
        initialFeedState(),
        { status: 429, headers: { 'retry-after': '7200' } },
        nowMs,
      ).state.nextCheckAt,
    ).toBe(nowMs + 7_200_000);
    expect(
      applyFeedResult(
        source,
        initialFeedState(),
        { status: 429, headers: { 'retry-after': new Date(nowMs + 4 * 3_600_000).toUTCString() } },
        nowMs,
      ).state.nextCheckAt,
    ).toBe(nowMs + 4 * 3_600_000);
  });
  it('distinguishes stale daily news from a healthy monthly magazine', () => {
    const state = {
      ...initialFeedState(),
      lastSuccessAt: nowMs,
      latestPublishedAt: '2026-08-24T00:00:00.000Z',
    };
    expect(feedFreshness(source, state, nowMs)).toBe('stale');
    expect(feedFreshness(getFeedSource('hiragana-times'), state, nowMs)).toBe('current');
    expect(feedFreshness(source, initialFeedState(), nowMs)).toBe('never-fetched');
  });
  it('validates persisted request state rather than accepting imported endpoints or headers', () => {
    expect(parseFeedRequestState(initialFeedState())).toEqual(initialFeedState());
    expect(() =>
      parseFeedRequestState({ ...initialFeedState(), url: 'https://example.com/' }),
    ).toThrow();
    expect(() =>
      parseFeedRequestState({ ...initialFeedState(), etag: 'x\r\nAuthorization: secret' }),
    ).toThrow();
    expect(() => parseFeedRequestState({ ...initialFeedState(), nextCheckAt: Infinity })).toThrow();
  });
});
