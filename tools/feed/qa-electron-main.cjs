'use strict';

// Test entry only. It is outside electron-builder's packaged file list and is
// never loaded by the ordinary app. All publisher requests are synthetic here.
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { externalPath } = require('../../prototypes/bunki-desktop/lib/paths.cjs');
assert.equal(process.env.BUNKI_TEST_MODE, '1');
const evidence = externalPath(process.env.BUNKI_TEST_EVIDENCE);
externalPath(process.env.BUNKI_TEST_PROFILE);
const advance = Number(process.env.KAIRO_FEED_QA_ADVANCE_MS || 0);
assert(Number.isInteger(advance) && advance >= 0 && advance <= 7 * 86_400_000);
const mode = process.env.KAIRO_FEED_QA_MODE || 'normal';
assert(['normal', 'rate-limited'].includes(mode));
fs.mkdirSync(evidence, { recursive: true });
const fixture = JSON.parse(
  fs.readFileSync(externalPath(process.env.KAIRO_PUBLISHER_QA_FIXTURE), 'utf8'),
);
assert.equal(fixture.format, 'kairo-publisher-qa-fixture');
assert.equal(fixture.v, 1);
assert.equal(fixture.sourceId, 'global-voices');
assert.equal(fixture.url, 'https://jp.globalvoices.org/2026/08/03/65560/');
assert(Buffer.byteLength(fixture.html) <= 2_000_000);
assert.equal(Buffer.byteLength(fixture.html), fixture.responseBytes);
assert.equal(createHash('sha256').update(fixture.html).digest('hex'), fixture.responseSha256);
const library = require('../../prototypes/bunki-desktop/lib/feed-service.cjs');
const create = library.createFeedService;
library.createFeedService = (options) =>
  create({
    ...options,
    now: () => Date.now() + advance,
    network: {
      fetchSource: async (source, headers) => {
        fs.appendFileSync(
          path.join(evidence, 'feed-requests.jsonl'),
          JSON.stringify({ sourceId: source.id, url: source.feed.url, headers, synthetic: true }) +
            '\n',
        );
        if (source.id === 'asahi' && mode === 'rate-limited')
          return { status: 429, headers: { 'retry-after': '7200' }, finalUrl: source.feed.url };
        const xml =
          source.id === 'global-voices'
            ? `<rss version="2.0"><channel><title>Original QA publisher</title><item><title>${fixture.title}</title><link>${fixture.url}</link><pubDate>${new Date(fixture.publishedAt).toUTCString()}</pubDate></item></channel></rss>`
            : `<rss version="2.0"><channel><title>QA publisher</title><item><title><![CDATA[<img src=x onerror="window.feedInjected=1"> 日本語のニュース]]></title><link>https://www.asahi.com/articles/qa-feed</link><pubDate>${new Date(Date.now() - 60_000).toUTCString()}</pubDate><description>synthetic body must be discarded</description></item></channel></rss>`;
        return {
          status: 200,
          headers: { etag: '"synthetic-one"' },
          xml,
          finalUrl: source.feed.url,
        };
      },
    },
  });
const publisherLibrary = require('../../prototypes/bunki-desktop/lib/publisher-reader.cjs');
const createReader = publisherLibrary.createPublisherReader;
publisherLibrary.createPublisherReader = (options) =>
  createReader({
    ...options,
    enabled: () => true,
    network: {
      fetchArticle: async (entry, selection, signal) => {
        if (signal?.aborted) throw new options.core.PublisherReaderError('cancelled');
        const request = options.core.publisherArticleRequest(entry, selection);
        assert.equal(request.canonicalUrl, fixture.url);
        fs.appendFileSync(
          path.join(evidence, 'publisher-requests.jsonl'),
          JSON.stringify({
            sourceId: entry.sourceId,
            entryId: entry.id,
            revisionId: entry.revisionId,
            canonicalUrl: request.canonicalUrl,
            responseSha256: fixture.responseSha256,
            responseBytes: fixture.responseBytes,
            synthetic: true,
          }) + '\n',
        );
        return {
          status: 200,
          html: fixture.html,
          finalUrl: fixture.url,
          contentType: 'text/html; charset=UTF-8',
          responseSha256: fixture.responseSha256,
          responseBytes: fixture.responseBytes,
          durationMs: 1,
        };
      },
    },
  });
require('../../prototypes/bunki-desktop/main.cjs');
