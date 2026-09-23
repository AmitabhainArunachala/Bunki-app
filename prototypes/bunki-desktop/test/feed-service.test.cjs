'use strict';

const assert = require('node:assert/strict');
const { test, before } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createFeedService } = require('../lib/feed-service.cjs');
const { installFeedIPC } = require('../lib/feed-ipc.cjs');
const { externalPath } = require('../lib/paths.cjs');
const { verifyBundledArtifact } = require('../lib/artifact.cjs');

const output = externalPath(process.env.KAIRO_EVIDENCE_DIR || path.join(os.homedir(), '.dharma', 'bunki-desktop', 'feed-service-tests'));
fs.mkdirSync(output, { recursive: true });
const root = fs.mkdtempSync(path.join(output, 'service-'));
const xml = '<?xml version="1.0"?><rss version="2.0"><channel><title>Test publisher</title><item><title>日本語の記事</title><link>https://www.asahi.com/articles/fixture</link><pubDate>Thu, 10 Sep 2026 02:00:00 GMT</pubDate><description>not retained publisher body</description></item></channel></rss>';
let core;

before(async () => {
  const site = process.env.KAIRO_SITE_DIR || (await import('../../../scripts/resolve-corridor-site.mjs')).resolveCorridorSite();
  const identity = verifyBundledArtifact(site);
  assert(identity.files.some((row) => row.path === 'modules/feed-core.mjs'));
  core = await import(pathToFileURL(path.join(site, 'modules/feed-core.mjs')).href);
  assert(core.SOURCE_REGISTRY.length >= 17);
  assert.equal(new Set(core.SOURCE_REGISTRY.map((source) => source.id)).size, core.SOURCE_REGISTRY.length);
  fs.writeFileSync(path.join(root, 'artifact.json'), JSON.stringify({ site, artifactSha256: identity.artifactSha256, modules: identity.modules }, null, 2));
});

function fixture(overrides = {}) {
  let now = Date.parse('2026-09-10T03:00:00Z');
  const profile = fs.mkdtempSync(path.join(root, 'profile-'));
  const requests = [];
  let responder = async (source) => ({ status: 200, headers: { etag: '"one"' }, xml, finalUrl: source.feed.url });
  const options = { core, profile, now: () => now, network: { fetchSource: async (...args) => { requests.push({ id: args[0].id, headers: args[1] }); return responder(...args); } }, ...overrides };
  return { profile, requests, options, service: createFeedService(options), clock: (value) => { now = value; }, next: (reply) => { now = typeof reply.nextCheckAt === 'number' ? reply.nextCheckAt : Date.parse(reply.nextCheckAt); }, respond: (callback) => { responder = callback; } };
}

test('actual compiled module parses a response; durable state contains policy, never titles/body/URLs', async () => {
  const fx = fixture();
  const result = await fx.service.refresh('asahi');
  assert.equal(result.status, 'updated');
  assert.equal(result.entries[0].title, '日本語の記事');
  assert.equal(result.entries[0].body, null);
  const text = fs.readFileSync(path.join(fx.profile, 'feed-request-state-v1.json'), 'utf8');
  for (const forbidden of ['日本語の記事', 'not retained publisher body', 'https://', 'entries', 'canonicalUrl']) assert(!text.includes(forbidden), forbidden);
  assert.equal(fs.statSync(path.join(fx.profile, 'feed-request-state-v1.json')).mode & 0o777, 0o600);
  const deferred = await fx.service.refresh('asahi');
  assert.equal(deferred.status, 'deferred');
  assert.equal(fx.requests.length, 1);
  assert.equal(deferred.entries[0].id, result.entries[0].id);
  await fx.service.close();
});

test('restart preserves cadence while dropping publisher metadata and avoids invalid conditional 304', async () => {
  const fx = fixture();
  const first = await fx.service.refresh('asahi');
  await fx.service.close();
  const restarted = createFeedService(fx.options);
  const deferred = await restarted.refresh('asahi');
  assert.equal(deferred.status, 'deferred');
  assert.equal(deferred.entries.length, 0);
  assert.equal(fx.requests.length, 1);
  fx.next(first);
  fx.respond(async (source) => ({ status: 304, headers: {}, finalUrl: source.feed.url }));
  const unsolicited = await restarted.refresh('asahi');
  assert.equal(unsolicited.status, 'failed');
  assert.equal(unsolicited.error, 'feed-304-without-snapshot');
  assert.deepEqual(fx.requests[1].headers, {});
  assert.equal(unsolicited.lastSuccessAt, first.lastSuccessAt);
  await restarted.close();
});

test('304 uses a real in-memory snapshot and leaves publication freshness independent of HTTP success', async () => {
  const fx = fixture();
  const first = await fx.service.refresh('asahi');
  fx.clock(Date.parse(first.nextCheckAt) + 7 * 86_400_000);
  fx.respond(async (source) => ({ status: 304, headers: {}, finalUrl: source.feed.url }));
  const unchanged = await fx.service.refresh('asahi');
  assert.equal(unchanged.status, 'not-modified');
  assert.equal(unchanged.freshness, 'stale');
  assert.equal(unchanged.latestPublishedAt, first.latestPublishedAt);
  assert.equal(unchanged.entries[0].id, first.entries[0].id);
  assert.equal(fx.requests[1].headers['if-none-match'], '"one"');
  await fx.service.close();
});

test('each request failure preserves last good entries; other publishers remain usable', async () => {
  const fx = fixture();
  const first = await fx.service.refresh('asahi');
  for (const [status, expected] of [[403, 'forbidden'], [429, 'rate-limited'], [500, 'failed']]) {
    fx.next(JSON.parse(fs.readFileSync(path.join(fx.profile, 'feed-request-state-v1.json'), 'utf8')).sources.asahi);
    fx.respond(async (source) => ({ status: source.id === 'asahi' ? status : 200, headers: { 'retry-after': '7200' }, xml, finalUrl: source.feed.url }));
    const reply = await fx.service.refresh('asahi');
    assert.equal(reply.status, expected);
    assert.equal(reply.entries[0].id, first.entries[0].id);
    assert.equal(reply.lastSuccessAt, first.lastSuccessAt);
  }
  const other = await fx.service.refresh('mainichi');
  assert.equal(other.status, 'updated');
  await fx.service.close();
});

test('HTML/XXE error payloads become isolated failures rather than an empty successful feed', async () => {
  for (const badXml of ['<html><body>Access denied</body></html>', '<!DOCTYPE rss SYSTEM "file:///etc/passwd"><rss version="2.0"><channel/></rss>']) {
    const fx = fixture();
    fx.respond(async (source) => ({ status: 200, headers: {}, xml: badXml, finalUrl: source.feed.url }));
    const reply = await fx.service.refresh('asahi');
    assert.equal(reply.status, 'failed');
    assert.equal(reply.lastSuccessAt, null);
    assert.equal(reply.entries.length, 0);
    await fx.service.close();
  }
});

test('publisher-window and malformed source requests never invoke the network', async () => {
  const fx = fixture();
  for (const id of ['itmedia', 'hiragana-times', 'newton', 'yomiuri', 'impress-watch']) assert.equal((await fx.service.refresh(id)).status, 'publisher-window');
  for (const id of ['https://example.com/', 'unknown-source', { url: 'https://example.com/' }, '__proto__']) assert.throws(() => fx.service.refresh(id));
  assert.equal(fx.requests.length, 0);
  await fx.service.close();
});

test('no-store responses can be displayed once but have no retained process snapshot or validators', async () => {
  const fx = fixture();
  fx.respond(async (source) => ({ status: 200, headers: { 'cache-control': 'no-store', etag: '"secret"' }, xml, finalUrl: source.feed.url }));
  const first = await fx.service.refresh('asahi');
  assert.equal(first.entries.length, 1);
  assert.equal((await fx.service.refresh('asahi')).entries.length, 0);
  fx.next(first);
  await fx.service.refresh('asahi');
  assert.deepEqual(fx.requests[1].headers, {});
  await fx.service.close();
});

test('corrupt or symlink policy state is preserved and cannot silently reset request cadence', async () => {
  for (const symlink of [false, true]) {
    const fx = fixture();
    const state = path.join(fx.profile, 'feed-request-state-v1.json');
    const protectedFile = path.join(root, 'protected-' + Math.random() + '.json');
    fs.writeFileSync(protectedFile, 'preserve');
    if (symlink) fs.symlinkSync(protectedFile, state); else fs.writeFileSync(state, '{bad');
    const service = createFeedService(fx.options);
    assert.equal((await service.refresh('asahi')).error, 'feed-state-unavailable');
    assert.equal(fx.requests.length, 0);
    assert.equal(fs.readFileSync(protectedFile, 'utf8'), 'preserve');
    if (!symlink) assert.equal(fs.readFileSync(state, 'utf8'), '{bad');
    await service.close(); await fx.service.close();
  }
});

test('same-source refresh is deduplicated, global concurrency is bounded, and close cancels queued work', async () => {
  const fx = fixture();
  let active = 0;
  let maximum = 0;
  fx.respond((_source, _headers, signal) => new Promise((_resolve, reject) => {
    active += 1; maximum = Math.max(maximum, active);
    signal.addEventListener('abort', () => { active -= 1; reject(new Error('cancelled')); }, { once: true });
  }));
  const first = fx.service.refresh('asahi');
  assert.equal(fx.service.refresh('asahi'), first);
  const others = ['mainichi', 'jaxa', 'riken'].map((id) => fx.service.refresh(id));
  await fx.service.close();
  const results = await Promise.all([first, ...others]);
  assert.equal(maximum, 2);
  assert.equal(fx.requests.length, 2);
  assert(results.every((reply) => ['failed', 'unavailable'].includes(reply.status)));
});

test('IPC accepts only top-frame fixed operations and an exact source ID argument', async () => {
  const handlers = new Map();
  const calls = [];
  const event = {};
  installFeedIPC({ ipcMain: { handle: (channel, action) => handlers.set(channel, action) }, fromApp: (value) => value === event,
    service: { listSources: () => core.SOURCE_REGISTRY, refresh: (id) => { calls.push(id); return { sourceId: id }; } } });
  assert.equal(handlers.size, 3);
  assert.deepEqual(handlers.get('bunki:feeds:list')(event), core.SOURCE_REGISTRY);
  assert.deepEqual(handlers.get('bunki:feeds:refresh')(event, 'asahi'), { sourceId: 'asahi' });
  for (const args of [[], [{ url: 'https://example.com' }], ['https://example.com'], ['asahi', { cookie: 'private' }]]) assert.throws(() => handlers.get('bunki:feeds:refresh')(event, ...args));
  assert.throws(() => handlers.get('bunki:feeds:list')(event, 'extra'));
  assert.throws(() => handlers.get('bunki:feeds:list')({}));
  assert.throws(() => handlers.get('bunki:feeds:refresh')({}, 'asahi'));
  assert.throws(() => handlers.get('bunki:feeds:read')(event, {}), /publisher-reader-unavailable/u);
  assert.throws(() => handlers.get('bunki:feeds:read')({}, {}), /feed-frame-forbidden/u);
  assert.deepEqual(calls, ['asahi']);
});

test('selected article lookup uses current native feed membership and loses metadata on restart', async () => {
  const fx = fixture();
  const articleXml = (title) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title><item><title>${title}</title><link>https://jp.globalvoices.org/2026/08/03/123456/</link><pubDate>Mon, 03 Aug 2026 02:00:00 GMT</pubDate></item></channel></rss>`;
  fx.respond(async (source) => ({ status: 200, headers: {}, xml: articleXml('保存前の見出し'), finalUrl: source.feed.url }));
  const first = await fx.service.refresh('global-voices');
  const entry = first.entries[0]; assert(entry);
  const selection = { sourceId: entry.sourceId, entryId: entry.id, revisionId: entry.revisionId };
  assert.deepEqual(fx.service.resolveEntry(selection), entry);
  assert.equal(fx.service.resolveEntry({ ...selection, revisionId: 'feedv:' + '0'.repeat(64) }), null);
  assert.throws(() => fx.service.resolveEntry({ ...selection, url: 'https://attacker.invalid/' }));
  fx.next(first);
  fx.respond(async (source) => ({ status: 200, headers: {}, xml: articleXml('更新した見出し'), finalUrl: source.feed.url }));
  const second = await fx.service.refresh('global-voices');
  assert.notEqual(second.entries[0].revisionId, selection.revisionId);
  assert.equal(fx.service.resolveEntry(selection), null);
  const current = { ...selection, revisionId: second.entries[0].revisionId };
  assert.deepEqual(fx.service.resolveEntry(current), second.entries[0]);
  await fx.service.close();
  assert.equal(fx.service.resolveEntry(current), null);
  const restarted = createFeedService(fx.options);
  assert.equal(restarted.resolveEntry(current), null);
  await restarted.close();
});

test('article IPC checks trusted frame and closed selection before dispatch', () => {
  const handlers = new Map(); const calls = []; const event = {};
  installFeedIPC({ ipcMain: { handle: (channel, action) => handlers.set(channel, action) },
    fromApp: (value) => value === event, service: {},
    reader: { read: (raw) => { const selected = core.parsePublisherReadSelection(raw); calls.push(selected); return selected; } } });
  // Obtain real identity formats from the parser rather than accepting renderer URLs.
  const parsed = core.parseFeedXml('<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture</title><item><title>日本語</title><link>https://jp.globalvoices.org/2026/08/03/123456/</link></item></channel></rss>',
    { sourceId: 'global-voices', finalUrl: core.getFeedSource('global-voices').feed.url, fetchedAt: '2026-09-10T03:00:00.000Z' });
  const selection = { sourceId: 'global-voices', entryId: parsed.entries[0].id, revisionId: parsed.entries[0].revisionId };
  assert.deepEqual(handlers.get('bunki:feeds:read')(event, selection), selection);
  for (const args of [[], [selection, {}], ['https://jp.globalvoices.org/'], [{ ...selection, url: 'https://attacker.invalid/' }]]) {
    assert.throws(() => handlers.get('bunki:feeds:read')(event, ...args));
  }
  assert.throws(() => handlers.get('bunki:feeds:read')({}, selection), /feed-frame-forbidden/u);
  assert.equal(calls.length, 1);
});
