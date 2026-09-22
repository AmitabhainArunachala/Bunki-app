import { describe, expect, it } from 'vitest';
import {
  applyFeedResult,
  FEED_OPERATIONS,
  getFeedSource,
  initialFeedState,
  parseFeedEntry,
  parseFeedXml,
  planFeedRequest,
  SOURCE_REGISTRY,
  sourceCoverage,
  validateFeedSource,
} from '../src/index.ts';

const now = '2026-09-10T03:00:00.000Z';
const nowMs = Date.parse(now);
const addedFeeds = [
  'kitanippon',
  'toonippo',
  'kyoto-shimbun',
  'sanyo-shimbun',
  'naoj',
  'aist',
  'ndl-reference',
  'boj',
  'global-voices',
];
const fixture =
  '<rss version="2.0"><channel><title>Fixture</title><item><title>地域と文化</title><link>https://example.com/registry-fixture</link><pubDate>Mon, 03 Aug 2026 01:00:00 GMT</pubDate></item></channel></rss>';

describe('source catalog expansion', () => {
  it('preserves the original source IDs and publisher identities used by saved references and mutes', () => {
    const original = [
      ['asahi', 'asahi'],
      ['asahi-science', 'asahi'],
      ['asahi-culture', 'asahi'],
      ['asahi-food', 'asahi'],
      ['asahi-travel', 'asahi'],
      ['mainichi', 'mainichi'],
      ['nhk', 'nhk'],
      ['jst-science-portal', 'jst-science-portal'],
      ['hiragana-times', 'hiragana-times'],
      ['yomiuri', 'yomiuri'],
      ['newton', 'newton'],
      ['itmedia', 'itmedia'],
      ['impress-watch', 'impress-watch'],
      ['jaxa', 'jaxa'],
      ['riken', 'riken'],
      ['nippon', 'nippon'],
      ['afpbb', 'afpbb'],
    ] as const;
    const restoredMutes = JSON.parse(JSON.stringify(original.map(([id]) => id))) as string[];
    expect(restoredMutes.map((id) => getFeedSource(id).id)).toEqual(restoredMutes);
    for (const [id, publisherId] of original)
      expect(getFeedSource(id).publisherId).toBe(publisherId);
    expect(SOURCE_REGISTRY.filter((row) => row.publisherId === 'asahi')).toHaveLength(5);
  });

  it('counts channels, distinct publishers and publisher windows without counting them as full readers', () => {
    const coverage = sourceCoverage();
    const active = SOURCE_REGISTRY.filter((row) => row.mode === 'personal-feed');
    const windows = SOURCE_REGISTRY.filter((row) => row.mode === 'publisher-window');
    expect(new Set(SOURCE_REGISTRY.map((row) => row.id)).size).toBe(SOURCE_REGISTRY.length);
    expect(coverage.cataloguedChannels).toBe(SOURCE_REGISTRY.length);
    expect(coverage.cataloguedSources).toBe(coverage.cataloguedChannels);
    expect(coverage.independentPublishers).toBe(
      new Set(SOURCE_REGISTRY.map((row) => row.publisherId)).size,
    );
    expect(coverage.activePersonalFeeds).toBe(active.length);
    expect(coverage.activePersonalPublishers).toBe(
      new Set(active.map((row) => row.publisherId)).size,
    );
    expect(coverage.publisherWindowChannels).toBe(windows.length);
    expect(coverage.publisherWindowPublishers).toBe(
      new Set(windows.map((row) => row.publisherId)).size,
    );
    expect(coverage.cataloguedChannels).toBe(active.length + windows.length);
    expect(coverage.cataloguedChannels - coverage.independentPublishers).toBe(4);
    expect(coverage.fullReaderSources).toBe(0);
    expect(coverage.topics).toEqual(
      [...new Set(SOURCE_REGISTRY.flatMap((row) => row.topics))].sort(),
    );
  });

  it.each(addedFeeds)('permits the reviewed direct route and validates metadata for %s', (id) => {
    const source = getFeedSource(id);
    const plan = planFeedRequest(source, initialFeedState(), nowMs);
    expect(plan).toEqual({ kind: 'fetch', url: source.feed!.url, headers: {} });
    if (plan.kind !== 'fetch') throw new Error(`Reviewed source ${id} is not fetchable`);
    const snapshot = parseFeedXml(fixture, { sourceId: id, finalUrl: plan.url, fetchedAt: now });
    expect(parseFeedEntry(snapshot.entries[0])).toMatchObject({
      sourceId: id,
      publisherId: source.publisherId,
      title: '地域と文化',
      body: null,
      readerMode: 'publisher-window',
    });
    const result = applyFeedResult(
      source,
      initialFeedState(),
      { status: 200, headers: {}, snapshot },
      nowMs,
    );
    expect(planFeedRequest(source, result.state, nowMs)).toEqual({
      kind: 'deferred',
      nextCheckAt: nowMs + source.cadence.minIntervalMs,
    });
    expect(source.notes.length).toBeGreaterThan(0);
  });

  it('rejects same-host wrong paths and hostname-prefix redirects for every added feed', () => {
    for (const id of addedFeeds) {
      const source = getFeedSource(id);
      const endpoint = new URL(source.feed!.url);
      const wrongPath = new URL(endpoint);
      wrongPath.pathname += '/unreviewed';
      const wrongHost = new URL(endpoint);
      wrongHost.hostname += '.attacker.invalid';
      for (const url of [wrongPath, wrongHost])
        expect(() =>
          parseFeedXml(fixture, { sourceId: id, finalUrl: url.href, fetchedAt: now }),
        ).toThrow('unregistered-feed-url');
    }
  });

  it('requires both operation grants; an advertised XML link does not enable a source', () => {
    for (const id of ['hanako', 'tabizine', 'jetro', 'ninjal', 'tadoku']) {
      const source = getFeedSource(id);
      expect(source.feed).not.toBeNull();
      expect(planFeedRequest(source, initialFeedState(), nowMs)).toMatchObject({
        kind: 'unavailable',
      });
      expect(() => validateFeedSource({ ...source, mode: 'personal-feed' })).toThrow(
        'source-mode-without-basis',
      );
    }
    const source = getFeedSource('naoj');
    const withoutDisplay = {
      ...source,
      rights: {
        ...source.rights,
        'display-metadata': { ...source.rights['display-metadata'], status: 'unknown' },
      },
    };
    expect(() => validateFeedSource(withoutDisplay)).toThrow('source-mode-without-basis');
  });

  it('does not turn a historical feed redirecting to homepage HTML into a fetchable source', () => {
    const source = getFeedSource('ryukyu-shimpo');
    expect(source.feed).toBeNull();
    expect(planFeedRequest(source, initialFeedState(), nowMs)).toMatchObject({
      kind: 'unavailable',
    });
    expect(() =>
      parseFeedXml('<html><body>Publisher homepage</body></html>', {
        sourceId: source.id,
        finalUrl: source.homepage,
        fetchedAt: now,
      }),
    ).toThrow('unregistered-feed-url');
  });

  it('keeps all separately unimplemented rights closed even for licensed full-reader research candidates', () => {
    const otherOperations = FEED_OPERATIONS.filter(
      (operation) => !['personal-fetch', 'display-metadata'].includes(operation),
    );
    for (const source of SOURCE_REGISTRY) {
      for (const operation of otherOperations)
        expect(source.rights[operation].status).not.toBe('allowed');
      expect(source.rights['server-ingest'].status).toBe('denied');
      if (source.mode === 'personal-feed') {
        expect(source.rights['personal-fetch'].evidence.length).toBeGreaterThan(0);
        expect(new URL(source.feed!.url).protocol).toBe('https:');
        expect(source.cadence.minIntervalMs).toBeGreaterThanOrEqual(3_600_000);
      }
    }
  });

  it('reports a successful irregular publication feed as stale when its newest article is old', () => {
    const source = getFeedSource('global-voices');
    const snapshot = parseFeedXml(fixture, {
      sourceId: source.id,
      finalUrl: source.feed!.url,
      fetchedAt: now,
    });
    const result = applyFeedResult(
      source,
      initialFeedState(),
      { status: 200, headers: {}, snapshot },
      nowMs,
    );
    expect(result.status).toBe('updated');
    expect(result.freshness).toBe('stale');
    expect(result.state.lastSuccessAt).toBe(nowMs);
    expect(result.state.latestPublishedAt).toBe('2026-08-03T01:00:00.000Z');
  });
});
