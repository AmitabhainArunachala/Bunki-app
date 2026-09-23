/**
 * Real Chromium verification of the exhaustive reference libraries.
 * No application internals are patched or exposed to the test.
 * Usage: node prototypes/corridor/tools/verify-reference.mjs [--shots DIR] [--case pending-route]
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecord } from './record-test-support.mjs';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const tools = dirname(fileURLToPath(import.meta.url));
const root = resolveCorridorSite();
const require = createRequire(import.meta.url);
const core = require(resolve(root, 'reference-core.js'));
const json = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const input = {
  dict: json('data/share_alike/dict.json').words,
  words: json('data/share_alike/words.json').words,
  kanji: json('data/share_alike/kanji.json').kanji,
  kanken: json('data/proprietary_safe/kanken.json').levels,
  kmeta: json('data/share_alike/strokes.json').meta,
  extra: json('data/share_alike/reference-extra.json'),
};
const catalog = core.createCatalog(input);
const shotsArg = process.argv.indexOf('--shots');
const shots = shotsArg < 0 ? resolveCorridorEvidence() : resolve(process.argv[shotsArg + 1]);
const caseArg = process.argv.indexOf('--case');
const selectedCase = caseArg < 0 ? null : process.argv[caseArg + 1];
assert.ok(caseArg < 0 || selectedCase === 'pending-route', '--case must be pending-route');
if (shots) mkdirSync(shots, { recursive: true });
const checks = [];
const excludedChecks = [];
const check = async (name, run, caseId = null) => {
  if (selectedCase && selectedCase !== caseId) { excludedChecks.push(name); return; }
  try {
    await run();
    checks.push({ name, pass: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    checks.push({ name, pass: false, error: String(error) });
    console.error(`FAIL ${name}: ${error}`);
  }
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = createServer((request, response) => {
  const path = resolve(root, `.${decodeURIComponent((request.url || '/').split('?')[0])}`);
  const file = path === root ? resolve(root, 'index.html') : path;
  if (!file.startsWith(root + sep) || !existsSync(file)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await silenceBrowserAudio(context);
const externalRequests = [];
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (!['http:', 'https:'].includes(url.protocol) || url.origin === base) return route.continue();
  externalRequests.push({ origin: url.origin, pathname: url.pathname });
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const boot = async (p, url = `${base}/index.html?entry=shelf`) => {
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForFunction(() => document.body.dataset.ready === '1');
  await p.click('#levels-link');
};
const overview = async () => {
  if (await page.locator('.sheet').count()) {
    await page.waitForTimeout(800);
    await page.click('#sheet-close');
  }
  if (await page.locator('#reference-library[data-view="collection"]').count()) {
    await page.click('#reference-back');
  }
  await page.waitForSelector('#reference-library[data-view="overview"]');
};
const open = async (collection) => {
  await overview();
  await page.click(`#reference-tab-${collection.family === 'jlpt-kanji' ? 'kanji' : 'vocabulary'}`);
  await page.locator(`[data-reference-collection="${collection.id}"]`).click();
  await page.waitForSelector('#reference-results-count');
};
const rows = (p = page) => p.locator('[data-entry-id]').evaluateAll((nodes) => nodes.map((n) => n.dataset.referenceKey || n.dataset.entryId));
const snapshot = async (p = page) => {
  const s = await readAppRecord(p);
  return Object.fromEntries(['taken', 'srs', 'revlog', 'obslog', 'lessonsDone', 'mockDone', 'mockRun'].map((key) => [key, s[key] ?? null]));
};
const capture = async (name) => {
  if (shots) await page.screenshot({ path: resolve(shots, `${name}.png`), fullPage: false });
};
const openCoreKanji = async (p) => {
  await p.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
  await p.waitForFunction(() => document.body.dataset.ready === '1');
  assert.equal(await p.locator('#store-alert').isVisible(), false, 'The regression page must own a writable learner record');
  await p.click('#chrome-search');
  await p.fill('#nav-search-input', '学校');
  await p.press('#nav-search-input', 'Enter');
  await p.waitForSelector('.sheet[data-node="word:学校"]');
  await p.click('[data-kanjirow="学"]');
  await p.waitForSelector('.sheet[data-node="kanji:学"]');
};
let initial;
const temp = mkdtempSync(resolve(resolveCorridorEvidence(), 'reference-browser-'));
try {
  await check('the reference door boots without console exceptions', async () => {
    await boot(page);
    await page.waitForSelector('#reference-library[data-view="overview"]');
    initial = await snapshot();
    assert.equal(Number(await page.locator('[data-reference-collection="jlpt:N1"]').getAttribute('data-count')), catalog.stats.counts['jlpt:N1']);
    assert.equal(await page.locator('[data-reference-collection="kanken:1級"]').getAttribute('data-count'), '2675');
    await capture('mobile-overview');
    assert.deepEqual(errors, []);
  });

  for (const collection of catalog.collections) {
    await check(`${collection.id}: complete count, first page, final page, correct final entry`, async () => {
      await open(collection);
      assert.equal(Number(await page.locator('#reference-results-count').getAttribute('data-total')), collection.count);
      assert.deepEqual(await rows(), collection.entries.slice(0, 100).map((entry) => entry.key));
      if (collection.count > 100) {
        await page.click('#reference-page-last');
        const expected = core.search(collection, '', { page: Math.ceil(collection.count / 100), pageSize: 100 });
        assert.deepEqual(await rows(), expected.entries.map((entry) => entry.key));
        assert.equal(await page.locator('#reference-page-next').isDisabled(), true);
        assert.equal(await page.locator('#reference-page-last').isDisabled(), true);
      } else {
        assert.equal(await page.locator('#reference-page-first').isDisabled(), true);
      }
      if (!collection.count) assert.equal(await page.locator('.reference-empty').count(), 1);
    });
  }

  const n1 = catalog.collections.find((collection) => collection.id === 'jlpt:N1');
  await check('N1 intermediate paging, jump, and bottom controls reach exact records', async () => {
    await open(n1);
    await page.click('#reference-page-next');
    assert.deepEqual(await rows(), n1.entries.slice(100, 200).map((entry) => entry.key));
    await page.fill('#reference-page-jump', '10');
    await page.click('#reference-page-go');
    assert.deepEqual(await rows(), n1.entries.slice(900, 1000).map((entry) => entry.key));
    await page.click('#reference-bottom-prev');
    assert.deepEqual(await rows(), n1.entries.slice(800, 900).map((entry) => entry.key));
    await page.click('#reference-page-first');
    assert.deepEqual(await rows(), n1.entries.slice(0, 100).map((entry) => entry.key));
  });

  for (const query of [n1.entries.at(-1).id, 'water', 'ｺﾝﾄﾛｰﾙ', 'コントロール', 'こんとろーる', '  ', '<img src=x onerror=alert(1)>']) {
    await check(`full-corpus search agrees with engine for ${JSON.stringify(query)}`, async () => {
      await open(n1);
      await page.fill('#reference-search', query);
      const expected = core.search(n1, query, { pageSize: 100 });
      assert.deepEqual(await rows(), expected.entries.map((entry) => entry.key));
      assert.equal(Number(await page.locator('#reference-results-count').getAttribute('data-total')), expected.total);
      assert.equal(await page.locator('#reference-list img').count(), 0);
    });
  }

  await check('empty search state can clear and return keyboard focus', async () => {
    await page.fill('#reference-search', 'not-a-real-bunki-entry-zzzzzz');
    assert.equal((await rows()).length, 0);
    assert.equal(await page.locator('#reference-page-next').isDisabled(), true);
    await page.click('#reference-empty-clear');
    assert.equal((await rows()).length, 100);
    assert.equal(await page.locator('#reference-search').inputValue(), '');
    await page.waitForFunction(() => document.activeElement?.id === 'reference-search');
  });

  await check('canonical entry close restores search, page, row focus, and scroll', async () => {
    await page.click('#reference-page-next');
    const row = page.locator('[data-entry-id]').nth(7);
    const entryId = await row.getAttribute('data-entry-id');
    const rowId = await row.getAttribute('id');
    await row.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await row.click();
    await page.waitForSelector('.sheet');
    assert.ok((await page.locator('.sheet').innerText()).includes(entryId));
    await page.waitForTimeout(850);
    await page.click('#sheet-close');
    await page.waitForFunction((id) => document.activeElement?.id === id, rowId);
    assert.equal(await page.locator('#reference-results-count').getAttribute('data-page'), '2');
    assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - scrollBefore) <= 3);
  });

  await check('supplemental and glyphless records open honest read-only source sheets', async () => {
    const grade = catalog.collections.find((collection) => collection.id === 'kanken:1級');
    for (const entry of [
      grade.entries.find((e) => !e.missingGlyph && !input.kanji[e.id] && e.reading),
      grade.entries.find((e) => e.missingGlyph),
    ]) {
      assert.ok(entry);
      await open(grade);
      await page.fill('#reference-search', entry.id);
      await page.locator(`[data-entry-id="${entry.id}"]`).click();
      await page.waitForSelector('.sheet');
      const text = await page.locator('.sheet').innerText();
      assert.ok(text.includes(entry.reading || 'Reading not supplied') || text.includes('読み未収録'));
      assert.equal(await page.locator('.sheet .take').count(), 0);
      await page.waitForTimeout(850);
      await page.click('#sheet-close');
    }
  });

  await check('same-spelling vocabulary preserves exact source reading through open and Back', async () => {
    for (const [level, reading] of [['N5', '～がつ'], ['N4', '～つき']]) {
      await open(catalog.collections.find(collection => collection.id === `jlpt:${level}`));
      await page.fill('#reference-search', '～月');
      const key = JSON.stringify(['～月', reading]);
      const row = page.locator('[data-entry-id="～月"]').filter({ hasText: reading });
      assert.equal(await row.count(), 1);
      assert.equal(await row.getAttribute('data-reference-key'), key);
      const rowId = await row.getAttribute('id');
      await row.click();
      await page.waitForSelector('.sheet');
      assert.ok((await page.locator('.sheet').innerText()).includes(reading));
      const entry = catalog.collections.find(collection => collection.id === `jlpt:${level}`).entries.find(entry => entry.key === key);
      assert.equal(await page.locator('.sheet').getAttribute('data-node'), entry.canonicalTarget ? 'word:～月' : `reference:${key}`);
      if (!entry.canonicalTarget) assert.equal(await page.locator('.sheet .take').count(), 0);
      await page.click('#sheet-close');
      await page.waitForFunction(id => document.activeElement?.id === id, rowId);
      assert.equal(await page.locator('#reference-search').inputValue(), '～月');
    }
  });

  await check('browse and detail navigation leave all personal-study evidence unchanged', async () => {
    assert.deepEqual(await snapshot(), initial);
  });

  for (const width of [320, 390, 1280]) {
    await check(`${width}px overview and N1 list have no horizontal overflow`, async () => {
      await page.setViewportSize({ width, height: 844 });
      await overview();
      await page.evaluate(() => window.scrollTo(0, 0));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await capture(`overview-${width}`);
      await open(n1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await capture(`n1-${width}`);
    });
  }

  await check('dark-world styling preserves the reference view and its controls', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem('kairo-theme', 'yoru'));
    await page.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    await page.click('#levels-link');
    await page.waitForSelector('#reference-library');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'yoru');
    await capture('dark-overview');
    await open(n1);
    await capture('dark-n1');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  });

  await check('library Back, Mock papers, and My Study remain distinct destinations', async () => {
    await page.click('#back');
    await page.waitForSelector('#reference-library[data-view="overview"]');
    await page.click('#reference-mock');
    await page.waitForSelector('[data-mock-set="n5-01"]');
    await page.click('#back');
    await page.waitForSelector('#reference-library[data-view="overview"]');
    await page.click('#reference-study');
    assert.equal(await page.locator('#reference-library').count(), 0);
  });

  await check('missing reference module fails visibly without breaking the reading shelf', async () => {
    const p = await context.newPage();
    await p.route('**/reference-core.js', (route) => route.abort());
    await boot(p);
    await p.waitForSelector('#reference-unavailable');
    await p.click('#reference-back');
    await p.waitForSelector('#levels-link');
    await p.close();
  });

  await check('missing reference data can be retried without reloading or mutating study', async () => {
    const p = await context.newPage();
    await p.route('**/reference-extra.json', (route) => route.fulfill({ status: 503, body: '{}' }));
    await boot(p);
    await p.waitForSelector('#reference-unavailable');
    await p.unroute('**/reference-extra.json');
    await p.click('#reference-retry');
    await p.waitForSelector('#reference-library[data-view="overview"]');
    await p.close();
  });

  await check('pending optional reference data leaves the reading shelf available', async () => {
    const p = await context.newPage();
    let held;
    await p.route('**/reference-extra.json', route => { held = route; });
    try {
      await p.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
      await p.waitForFunction(() => document.body.dataset.ready === '1');
      assert.ok(await p.locator('#levels-link').isVisible());
      assert.ok(await p.locator('[data-passage]').count() > 0);
      assert.ok(held, 'The optional request must still be pending at this observation');
      await held.fulfill({ status: 503, body: '{}' }); held = null;
      await p.click('#levels-link');
      await p.waitForSelector('#reference-unavailable');
      await p.unroute('**/reference-extra.json');
      await p.click('#reference-retry');
      await p.waitForSelector('#reference-library[data-view="overview"]');
    } finally {
      if (held) await held.abort().catch(() => {});
      await p.close();
    }
  });

  await check('cancelled loading collection leaves the next ordinary library visit at overview', async () => {
    await page.goto('about:blank'); // Release the primary page's learner-record lock.
    const p = await context.newPage();
    p.setDefaultTimeout(10000);
    p.on('pageerror', error => errors.push(String(error)));
    let held;
    await p.route('**/reference-extra.json', route => { held = route; });
    try {
      await openCoreKanji(p);
      const before = await snapshot(p);
      const door = p.locator('[data-reference-door^="jlpt-kanji:"]');
      const destination = await door.getAttribute('data-reference-door');
      await door.click();
      await p.waitForSelector('#reference-unavailable');
      assert.ok(await p.locator('#reference-retry').isDisabled(), 'The request must still belong to the loading visit');
      assert.ok(held, 'The sidecar request is held until the user cancels the visit');
      await p.click('#reference-back');
      await p.waitForSelector('.sheet[data-node="kanji:学"]');
      await p.click('#sheet-close');
      await p.click('#back');
      await p.waitForSelector('#levels-link');
      const response = p.waitForResponse(reply => reply.url().endsWith('/reference-extra.json') && reply.ok());
      await held.continue(); held = null;
      await (await response).finished();
      await p.unroute('**/reference-extra.json');
      await p.click('#levels-link');
      await p.waitForSelector('#reference-library');
      if (shots) await p.screenshot({ path: resolve(shots, 'cancelled-loading-library-destination.png') });
      assert.equal(await p.locator('#reference-library').getAttribute('data-view'), 'overview',
        `Cancelled ${destination} must not override the ordinary overview door`);
      assert.deepEqual(await snapshot(p), before);
      assert.deepEqual(externalRequests, []);
      assert.deepEqual(errors, []);
    } catch (error) {
      if (shots) await p.screenshot({ path: resolve(shots, 'cancelled-loading-failure.png') }).catch(() => {});
      throw error;
    } finally {
      if (held) await held.abort().catch(() => {});
      await p.close();
    }
  }, 'pending-route');

  await check('retry within the same loading collection retains its exact destination and caller', async () => {
    await page.goto('about:blank');
    const p = await context.newPage();
    p.setDefaultTimeout(10000);
    p.on('pageerror', error => errors.push(String(error)));
    let held;
    await p.route('**/reference-extra.json', route => { held = route; });
    try {
      await openCoreKanji(p);
      const before = await snapshot(p);
      const door = p.locator('[data-reference-door^="jlpt-kanji:"]');
      const destination = await door.getAttribute('data-reference-door');
      const label = await door.textContent();
      await door.click(); await p.waitForSelector('#reference-unavailable');
      assert.ok(held);
      await held.fulfill({ status: 503, body: '{}' }); held = null;
      await p.waitForFunction(() => document.querySelector('#reference-retry')?.disabled === false);
      await p.unroute('**/reference-extra.json');
      await p.click('#reference-retry');
      await p.waitForSelector('#reference-library[data-view="collection"]');
      const collection = catalog.collections.find(item => item.id === destination);
      assert.deepEqual(await rows(p), collection.entries.slice(0, 100).map(item => item.key));
      assert.equal(Number(await p.locator('#reference-results-count').getAttribute('data-total')), collection.count);
      if (shots) await p.screenshot({ path: resolve(shots, 'same-visit-retry-exact-collection.png') });
      await p.click('#reference-back');
      await p.waitForSelector('.sheet[data-node="kanji:学"]');
      await p.waitForFunction(text => document.activeElement?.textContent === text, label);
      assert.deepEqual(await snapshot(p), before);
      assert.deepEqual(externalRequests, []);
      assert.deepEqual(errors, []);
    } catch (error) {
      if (shots) await p.screenshot({ path: resolve(shots, 'same-visit-retry-failure.png') }).catch(() => {});
      throw error;
    } finally {
      if (held) await held.abort().catch(() => {});
      await p.close();
    }
  }, 'pending-route');

  await check('standalone reference browsing works with every network request blocked', async () => {
    const out = resolve(temp, 'index.html');
    execFileSync(process.execPath, [resolve(tools, 'build-standalone.mjs'), out], { timeout: 120000, stdio: 'pipe', env: { ...process.env, KAIRO_SITE_DIR: root } });
    const p = await context.newPage();
    await p.route('http**://**/*', (route) => route.abort());
    await boot(p, `${pathToFileURL(out).href}?entry=shelf`);
    await p.waitForSelector('#reference-library');
    await p.locator('[data-reference-collection="jlpt:N1"]').click();
    await p.click('#reference-page-last');
    assert.deepEqual(await rows(p), core.search(n1, '', { page: Math.ceil(n1.count / 100), pageSize: 100 }).entries.map(entry => entry.key));
    await p.click('#reference-back');
    await p.locator('[data-reference-collection="kanken:1級"]').click();
    await p.fill('#reference-search', '丫');
    assert.ok((await rows(p)).includes('丫'));
    await p.close();
  });

  await check('no uncaught application exceptions occurred', async () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
  rmSync(temp, { recursive: true, force: true });
  if (shots) writeFileSync(resolve(shots, 'results.json'), `${JSON.stringify(checks, null, 2)}\n`);
  if (shots) writeFileSync(resolve(shots, 'execution.json'), `${JSON.stringify({ selectedCase, excludedChecks, externalRequests,
    browser: { engine: 'Chromium', version: browser.version(), headless: true, maximumContexts: 1 } }, null, 2)}\n`);
}
const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} reference browser checks passed.`);
process.exitCode = failed.length ? 1 : 0;
