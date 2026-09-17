/** Actual source-shelf journeys with a synthetic native port. Network policy
 * and live feeds have separate native tests; this suite sends no publisher
 * requests and never treats fixture headlines as a content-quality sample. */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { CORRIDOR_DIR, startCorridorServer } from './verify-corridor.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';

const out = resolve(process.env.KAIRO_EVIDENCE_DIR || resolve(homedir(), '.dharma/bunki_audit/source-shelf'));
mkdirSync(out, { recursive: true });
const core = await import(pathToFileURL(resolve(CORRIDOR_DIR, 'modules/feed-core.mjs')).href);
const sources = core.SOURCE_REGISTRY;
const active = sources.filter((source) => source.mode === 'personal-feed');
assert(active.length >= 2);
const now = Date.now();
const checkedAt = new Date(now).toISOString();
const published = new Date(now - 2 * 3600_000).toUTCString();
const xmlEscape = (text) => String(text).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
const malicious = '<img src=x onerror="window.feedInjection=1">科学の見出し';
const replies = {};
for (const [ix, source] of active.entries()) {
  const titles = ix === 0 ? [malicious, '歴史を歩く'] : ix === 1 ? ['地域の食文化'] : [];
  const items = titles.map((title, i) => `<item><title>${xmlEscape(title)}</title><link>https://example.org/kairo-test/${ix}/${i}</link><pubDate>${published}</pubDate></item>`).join('');
  const snapshot = core.parseFeedXml(`<rss version="2.0"><channel><title>synthetic</title>${items}</channel></rss>`, {
    sourceId: source.id, finalUrl: source.feed.url, fetchedAt: checkedAt,
  });
  const applied = core.applyFeedResult(source, core.initialFeedState(), { status: 200, headers: {}, snapshot }, now);
  replies[source.id] = core.parseFeedRefreshResult({ sourceId: source.id, status: 'updated', entries: snapshot.entries,
    checkedAt, lastSuccessAt: checkedAt, nextCheckAt: new Date(applied.state.nextCheckAt).toISOString(),
    latestPublishedAt: snapshot.latestPublishedAt, freshness: applied.freshness, error: null }, source.id);
}
const { server, base } = await startCorridorServer();
const browserName = process.env.KAIRO_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(browserName));
const browser = await ({ chromium, webkit }[browserName]).launch(browserName === 'chromium'
  ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {});
const results = [];
const errors = [];
let externalRequests = 0;
let page;
let context;
async function fresh(native) {
  context = await browser.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === base) return route.continue();
    externalRequests += 1; return route.abort();
  });
  await context.addInitScript(({ native, replies }) => {
    if (!localStorage.getItem('source-shelf-fixture')) {
      localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1, taken: [], srs: {}, revlog: [], obslog: [],
        futureRoot: { preserve: 'private-sentinel-not-a-headline' } }));
      localStorage.setItem('source-shelf-fixture', '1');
    }
    window.feedCalls = [];
    if (native) window.kairoFeeds = Object.freeze({
      async refresh(id) {
        window.feedCalls.push({ args: [...arguments] });
        const reply = structuredClone(replies[id]);
        if (sessionStorage.getItem('feed-fixture-mode') === 'invalid') {
          reply.entries = [{ ...reply.entries[0], body: 'unpermitted-body-sentinel' }];
        } else if (sessionStorage.getItem('feed-fixture-mode') === 'deferred-empty') {
          reply.status = 'deferred'; reply.entries = [];
        } else if (sessionStorage.getItem('feed-fixture-mode') === 'offline') {
          throw new Error('synthetic-offline');
        }
        return reply;
      },
    });
  }, { native, replies });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#feed-link').click();
  if (native) await idle();
}
async function idle() {
  await page.waitForFunction(() => document.querySelector('#feed-refresh-all')?.disabled === false);
}
const record = () => readAppRecord(page);
async function check(name, run) {
  await run(); results.push({ name, pass: true });
}
try {
  await fresh(false);
  await check('browser-has-publisher-doors-and-honest-native-headline-availability', async () => {
    assert(await page.locator('#feed-refresh-all').isDisabled());
    assert.equal(await page.locator('.feed-publisher-link').count(), new Set(sources.map((source) => source.publisherId)).size);
    assert.match(await page.locator('#feed-results').textContent(), /Mac app also fetches headlines/u);
    const links = await page.locator('.feed-publisher-link').evaluateAll((nodes) => nodes.map((a) => ({ href: a.href, rel: a.rel, target: a.target })));
    assert(links.every((a) => a.href.startsWith('https://') && a.rel.includes('noreferrer') && a.target === '_blank'));
    assert.equal(externalRequests, 0);
  });
  await page.locator('#feed-panel-sources').click();
  await page.locator(`[data-feed-follow="${active[0].id}"]`).click();
  await waitForAppRecord(page, (record) => record.feedLibrary?.mutedSourceIds.includes(active[0].id));
  await check('source-choice-persists-on-reload-with-unknown-record-fields-intact', async () => {
    const before = await record();
    assert.deepEqual(before.feedLibrary.mutedSourceIds, [active[0].id]);
    assert.equal(before.futureRoot.preserve, 'private-sentinel-not-a-headline');
    await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1');
    await page.locator('#feed-link').click(); await page.locator('#feed-panel-sources').click();
    assert.equal(await page.locator(`[data-feed-follow="${active[0].id}"]`).getAttribute('aria-pressed'), 'false');
    assert.deepEqual((await record()).feedLibrary, before.feedLibrary);
  });
  await context.close();
  await fresh(true);
  await check('native-id-only-refresh-reaches-actual-shelf-with-safe-titles-and-publication-dates', async () => {
    const calls = await page.evaluate(() => window.feedCalls);
    assert.deepEqual(calls.map((call) => call.args).sort(), active.map((source) => [source.id]).sort());
    assert.equal(await page.locator('.feed-entry').count(), 3);
    assert.match(await page.locator('#feed-results').textContent(), /Published/u);
    assert.equal(await page.evaluate(() => window.feedInjection), undefined);
    assert.equal(await page.locator('#feed-results img, #feed-results script').count(), 0);
    assert.equal(externalRequests, 0);
  });
  await check('search-filters-headlines-without-losing-input-focus', async () => {
    await page.locator('#feed-search').fill('食文化');
    assert.equal(await page.locator('.feed-entry').count(), 1);
    assert.equal(await page.locator('#feed-search').evaluate((node) => node === document.activeElement), true);
    await page.locator('#feed-search').fill('');
    assert.equal(await page.locator('.feed-entry').count(), 3);
  });
  const firstId = replies[active[0].id].entries[0].id;
  await page.locator(`[data-feed-save="${firstId}"]`).click();
  await waitForAppRecord(page, (record) => record.feedLibrary?.savedReferences.length === 1);
  await check('saved-link-retains-no-publisher-headline-or-body-and-creates-no-learning-debt', async () => {
    const value = await record();
    assert.equal(value.feedLibrary.savedReferences.length, 1);
    assert.deepEqual(Object.keys(value.feedLibrary.savedReferences[0]).sort(), ['format', 'v', 'sourceId', 'publisherId', 'entryId', 'canonicalUrl'].sort());
    assert.equal(JSON.stringify(value).includes('科学の見出し'), false);
    assert.equal(JSON.stringify(value).includes('unpermitted-body-sentinel'), false);
    assert.deepEqual(value.taken, []); assert.deepEqual(value.srs, {});
    assert.deepEqual(value.revlog, []); assert.deepEqual(value.obslog, []);
    await page.locator('#feed-panel-saved').click();
    assert.equal(await page.locator('.feed-entry').count(), 1);
  });
  await page.locator('#feed-panel-latest').click();
  await page.evaluate(() => sessionStorage.setItem('feed-fixture-mode', 'invalid'));
  await page.locator('#feed-refresh-all').click(); await idle();
  await check('invalid-native-reply-preserves-earlier-headlines-and-saved-record', async () => {
    assert.equal(await page.locator('.feed-entry').count(), 3);
    assert.equal(await page.locator('#feed-results').textContent().then((s) => s.includes('unpermitted-body-sentinel')), false);
    await page.locator('#feed-panel-sources').click();
    assert.match(await page.locator(`[data-feed-source="${active[0].id}"]`).textContent(), /Could not refresh/u);
    assert.equal((await record()).feedLibrary.savedReferences.length, 1);
  });
  await page.evaluate(() => sessionStorage.removeItem('feed-fixture-mode'));
  await page.locator(`[data-feed-follow="${active[0].id}"]`).click();
  await waitForAppRecord(page, (record) => record.feedLibrary?.mutedSourceIds.includes(active[0].id));
  await page.locator('#feed-panel-latest').click();
  await check('muting-removes-source-headlines-without-deleting-saved-links', async () => {
    assert.equal(await page.locator('.feed-entry').count(), 1);
    await page.locator('#feed-panel-saved').click();
    assert.equal(await page.locator('.feed-entry').count(), 1);
    assert.equal((await record()).feedLibrary.savedReferences.length, 1);
  });
  await page.screenshot({ path: resolve(out, 'desktop-saved-link.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#feed-panel-sources').click();
  await check('phone-source-controls-fit-viewport-and-keep-touch-targets', async () => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const sizes = await page.locator('.feed-follow').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    assert(sizes.every((height) => height >= 44));
    await page.screenshot({ path: resolve(out, 'phone-sources.png'), fullPage: true });
  });
  await page.evaluate(() => sessionStorage.setItem('feed-fixture-mode', 'deferred-empty'));
  await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#feed-link').click(); await idle();
  await check('restart-retains-bookmarks-and-truthfully-shows-cadence-without-cached-headlines', async () => {
    assert.equal(await page.locator('.feed-entry').count(), 0);
    await page.locator('#feed-panel-saved').click();
    assert.equal(await page.locator('.feed-entry').count(), 1);
    assert.match(await page.locator('.feed-entry').textContent(), /headline are not stored/u);
    await page.locator('#feed-panel-sources').click();
    assert.match(await page.locator(`[data-feed-source="${active[1].id}"]`).textContent(), /Next check/u);
  });
  const beforeInvalid = await record();
  const tampered = structuredClone(beforeInvalid);
  tampered.feedLibrary.savedReferences[0].body = 'not-permitted-in-reference';
  const invalidRaw = JSON.stringify(tampered);
  await page.evaluate((raw) => localStorage.setItem('kairo-corridor-v1', raw), invalidRaw);
  await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1');
  await check('malformed-restored-source-record-is-protected-without-silent-field-stripping', async () => {
    await page.locator('#store-alert').waitFor();
    assert.match(await page.locator('#store-alert').textContent(), /invalid data/u);
    assert.equal(await page.evaluate(() => localStorage.getItem('kairo-corridor-v1')), invalidRaw);
  });
  assert.deepEqual(errors, []); assert.equal(externalRequests, 0);
} catch (error) {
  results.push({ name: 'source-shelf-journey', pass: false, error: error.message });
  await page?.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {});
  console.error(error.message);
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise((done) => server.close(done));
}
const failures = results.filter((result) => !result.pass).length;
const hashFile = (file) => createHash('sha256').update(readFileSync(resolve(CORRIDOR_DIR, file))).digest('hex');
writeFileSync(resolve(out, 'receipt.json'), JSON.stringify({
  browser: browserName, site: CORRIDOR_DIR, corridorSha256: hashFile('corridor.js'),
  controllerSha256: hashFile('feed-controller.mjs'), results, failures, pageErrors: errors, externalRequests,
  limitation: 'Synthetic native port and browser viewports. Live publisher/network and actual native bridge behavior have separate receipts; no full-reader, licensing, iOS or whole-product acceptance claim.',
}, null, 2) + '\n');
console.log(`Source shelf: ${results.length - failures}/${results.length} passed.`);
process.exitCode = failures || errors.length ? 1 : 0;
