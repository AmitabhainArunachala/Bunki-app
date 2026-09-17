/** Real-input recursive walk regression. No application state is exposed or patched.
 * node prototypes/corridor/tools/verify-reference-connections.mjs [--shots DIR] [--case source-return]
 * Covers returns, not full corpus correctness (verify-reference.mjs owns that).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
const root = resolveCorridorSite();
const shotsIndex = process.argv.indexOf('--shots');
const shots = shotsIndex < 0 ? resolveCorridorEvidence() : resolve(process.argv[shotsIndex + 1]);
const caseIndex = process.argv.indexOf('--case');
const selectedCase = caseIndex < 0 ? null : process.argv[caseIndex + 1];
assert.ok(caseIndex < 0 || selectedCase === 'source-return', '--case must be source-return');
if (shots) mkdirSync(shots, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent((request.url || '/').split('?')[0]);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + sep)) return response.writeHead(403).end();
    const body = readFileSync(file);
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
await silenceBrowserAudio(context);
const externalRequests = [];
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin === base) return route.continue();
  externalRequests.push({ origin: url.origin, pathname: url.pathname });
  return route.abort();
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const results = [];
const excludedChecks = [];
const check = async (name, run, caseId = null) => {
  if (selectedCase && selectedCase !== caseId) { excludedChecks.push(name); return; }
  try { await run(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) {
    results.push({ name, pass: false, error: String(error) }); console.error(`FAIL ${name}: ${error}`);
    if (shots) await page.screenshot({ path: resolve(shots, `failed-${results.length}.png`) }).catch(() => {});
  }
};
const boot = async () => {
  await page.goto(`${base}/?entry=shelf`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1');
};
const library = async (id = 'jlpt:N5', query = '') => {
  await boot(); await page.click('#levels-link');
  if (id.startsWith('jlpt-kanji:')) await page.click('#reference-tab-kanji');
  await page.locator(`[data-reference-collection="${id}"]`).click();
  if (query) await page.fill('#reference-search', query);
};
const entry = async (word = '学校', collection = 'jlpt:N5') => {
  await library(collection, word);
  const matches = catalog.collections.find((item) => item.id === collection).entries
    .filter((item) => item.id === word && item.canonicalTarget?.type === 'word');
  assert.equal(matches.length, 1, 'a canonical test entry must resolve one exact form and reading');
  await page.locator(`[data-reference-key=${JSON.stringify(matches[0].key)}]`).click();
  await nodeIs(`word:${word}`);
};
const nodeIs = async (node) => page.waitForFunction((value) => document.querySelector('.sheet')?.dataset.node === value, node);
const focusedText = () => page.evaluate(() => document.activeElement.textContent);
const sheetScroll = () => page.locator('.sheet').evaluate((n) => n.scrollTop);
const stable = async () => {
  // Two frames allow the sheet's explicit restore to settle, not a timed sleep.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
};
const capture = async (name) => { await stable(); if (shots) await page.screenshot({ path: resolve(shots, `${name}.png`) }); };
const evidence = async () => {
  const s = await readAppRecord(page);
  const defaults = { taken: [], srs: {}, revlog: [], obslog: [], lessonsDone: {}, mockDone: {}, mockRun: null };
  // A first reader bookmark materializes the envelope; empty fields still
  // mean zero evidence, whether absent on disk or normalized by the store.
  return Object.fromEntries(Object.entries(defaults).map(([key, empty]) => [key, s[key] ?? empty]));
};
const json = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const fixtures = {
  dict: json('data/share_alike/dict.json').words, words: json('data/share_alike/words.json').words,
  kanji: json('data/share_alike/kanji.json').kanji, kanken: json('data/proprietary_safe/kanken.json').levels,
  kmeta: json('data/share_alike/strokes.json').meta, extra: json('data/share_alike/reference-extra.json'),
};
const catalog = createRequire(import.meta.url)(resolve(root, 'reference-core.js')).createCatalog(fixtures);
let initial;
try {
  await check('library names the current room, exposes dictionary search, and starts without study debt', async () => {
    await boot(); initial = await evidence(); await page.click('#levels-link');
    assert.equal(await page.locator('.crumb b').innerText(), 'reference library');
    assert.match(await page.locator('.crumb').getAttribute('aria-label'), /bookshelf.*reference library/);
    assert.ok(await page.locator('#reference-global-search').isVisible());
    await capture('after-mobile-overview');
  });
  await check('paged/sorted collection → canonical sheet → row restores page, sort, scroll and focus', async () => {
    await library('jlpt:N1'); await page.selectOption('#reference-sort', 'headword'); await page.click('#reference-page-next');
    const row = page.locator('[data-entry-id]').nth(20); const id = await row.getAttribute('id');
    await row.scrollIntoViewIfNeeded(); await stable(); const scroll = await page.evaluate(() => scrollY);
    await row.click(); await page.waitForSelector('.sheet'); await page.click('#sheet-reference-return');
    await page.waitForFunction((id) => document.activeElement.id === id, id);
    assert.equal(await page.locator('#reference-results-count').getAttribute('data-page'), '2');
    assert.equal(await page.locator('#reference-sort').inputValue(), 'headword');
    assert.ok(Math.abs(await page.evaluate(() => scrollY) - scroll) <= 3);
  });
  await check('word → kanji → component → family kanji walks back to the exact doors', async () => {
    await entry(); await capture('after-mobile-word'); await page.click('[data-kanjirow="学"]'); await nodeIs('kanji:学');
    const part = page.locator('[data-component]').first(); const label = await part.innerText();
    await part.scrollIntoViewIfNeeded(); await stable(); const scroll = await sheetScroll(); await part.click();
    await page.waitForSelector('.sheet[data-node^="radical:"]'); await capture('after-mobile-component');
    const family = page.locator('.sheet .t-kanji').last(); const familyLabel = await family.textContent(); await family.click();
    await page.waitForSelector('.sheet[data-node^="kanji:"]'); await page.click('#sheet-back'); await stable();
    assert.equal(await focusedText(), familyLabel);
    await page.click('#sheet-back'); await nodeIs('kanji:学'); await stable();
    assert.equal((await focusedText()).replace(/\n/g, ''), label.replace(/\n/g, ''));
    assert.ok(Math.abs(await sheetScroll() - scroll) <= 3);
    await page.click('#sheet-back'); await nodeIs('word:学校');
    assert.match(await focusedText(), /学/);
  });
  await check('expanded compounds survive recursion with their position and focus', async () => {
    await entry('人'); await page.click('[data-kanjirow="人"]'); await page.click('.sheet .more-row');
    const count = await page.locator('.compound').count(); assert.ok(count > 24);
    const compound = page.locator('.compound').nth(35); const label = await compound.textContent();
    await compound.scrollIntoViewIfNeeded(); await stable(); const scroll = await sheetScroll(); await compound.click();
    await page.waitForSelector('.sheet[data-node^="word:"]'); await page.click('#sheet-back'); await nodeIs('kanji:人'); await stable();
    assert.equal(await page.locator('.compound').count(), count); assert.equal(await focusedText(), label);
    assert.ok(Math.abs(await sheetScroll() - scroll) <= 3); await capture('after-expanded-compound-return');
  });
  await check('canonical level chips open complete reference collections and return through browser Back', async () => {
    await entry(); await page.click('[data-reference-door="jlpt:N5"]');
    assert.equal(await page.locator('#reference-search').inputValue(), '');
    assert.match(await page.locator('#reference-back').innerText(), /学校/);
    await page.goBack(); await nodeIs('word:学校');
  });
  await check('kanji Kentei and JLPT doors return to the same canonical kanji and filtered origin', async () => {
    await entry(); await page.click('[data-kanjirow="学"]');
    for (const prefix of ['kanken:', 'jlpt-kanji:']) {
      const chip = page.locator(`[data-reference-door^="${prefix}"]`); const label = await chip.textContent();
      const box = await chip.boundingBox(); assert.ok(box.height >= 44, 'interactive metadata needs a 44px target');
      await chip.click(); await page.waitForSelector('#reference-library[data-view="collection"]'); await page.click('#reference-back');
      await nodeIs('kanji:学'); assert.equal(await focusedText(), label);
    }
    await page.click('#sheet-reference-return'); assert.equal(await page.locator('#reference-search').inputValue(), '学校');
  });
  await check('sheet search → result → nested search returns in order to query, sheet and original collection', async () => {
    await entry(); await page.click('[data-kanjirow="学"]'); await page.click('#sheet-search');
    await page.waitForFunction(() => document.activeElement.id === 'nav-search-input');
    await page.fill('#nav-search-input', '水'); await page.press('#nav-search-input', 'Enter');
    await page.waitForSelector('.sheet'); const resultNode = await page.locator('.sheet').getAttribute('data-node');
    await page.click('#sheet-search'); await page.fill('#nav-search-input', 'zz-no-match-zz'); await page.click('#back');
    await nodeIs(resultNode); await page.click('#sheet-close'); assert.equal(await page.locator('#nav-search-input').inputValue(), '水');
    await page.click('#back'); await nodeIs('kanji:学'); await capture('after-search-return-preserved-sheet');
    await page.click('#sheet-reference-return'); assert.equal(await page.locator('#reference-search').inputValue(), '学校');
  });
  await check('empty collection search can widen to dictionary and return without losing its filter', async () => {
    await library('jlpt:N1', 'zz-no-match-zz'); await page.click('#reference-empty-global-search');
    assert.equal(await page.locator('#nav-search-input').inputValue(), 'zz-no-match-zz');
    await page.click('#back'); assert.equal(await page.locator('#reference-search').inputValue(), 'zz-no-match-zz');
    await page.waitForFunction(() => document.activeElement.id === 'reference-empty-global-search');
    await page.click('#reference-empty-clear'); assert.equal(await page.locator('#reference-search').inputValue(), '');
  });
  await check('source sentence → real article → return restores sentence, word, library and focus', async () => {
    await boot(); await page.locator('[data-passage="wikinews:1403"]').first().click(); await page.waitForSelector('#reader .tok');
    await page.click('#back'); await page.click('#levels-link'); await page.click('[data-reference-collection="jlpt:N4"]');
    await page.fill('#reference-search', '世界'); await page.click('[data-entry-id="世界"]'); await nodeIs('word:世界');
    await page.locator('.sent-door').first().click(); await page.waitForSelector('#sent-home');
    const sentence = await page.locator('.sent-reader').innerText(); await page.click('#sent-home');
    await page.waitForSelector('#reader'); assert.ok((await page.locator('main').innerText()).includes('知床'));
    await capture('after-source-article'); await page.click('#source-entry-return');
    assert.equal(await page.locator('.sent-reader').innerText(), sentence);
    await page.waitForFunction(() => document.activeElement.id === 'sent-home');
    await page.click('#sheet-back'); await nodeIs('word:世界'); await page.click('#sheet-reference-return');
    assert.equal(await page.locator('#reference-search').inputValue(), '世界');
  });
  await check('My Study and Mock papers return to the exact collection instead of the reading shelf', async () => {
    await library('jlpt:N1', 'water');
    for (const door of ['reference-study', 'reference-mock']) {
      await page.click(`#${door}`); await page.click('#back');
      await page.waitForSelector('#reference-library[data-view="collection"]');
      assert.equal(await page.locator('#reference-search').inputValue(), 'water');
      await page.waitForFunction((id) => document.activeElement.id === id, door);
    }
  });
  await check('attested missing kanji readings display with provenance and continue into the writing room', async () => {
    const collection = catalog.collections.find((c) => c.entries.some((e) => e.id === '旺') && c.family === 'kanken');
    await library(collection.id, '旺'); await page.click('[data-entry-id="旺"]'); await nodeIs('kanji:旺');
    assert.match(await page.locator('.kv').innerText(), /さかん/);
    await page.locator('.reference-entry-provenance summary').click();
    assert.match(await page.locator('.reference-entry-provenance').innerText(), /kotobako.*kanji_65fa/);
    await capture('after-attested-reading-provenance');
    await page.click('#strokes-door'); await page.waitForSelector('#stroke-page');
    await page.click('.stroke-chrome-trigger'); assert.match(await page.locator('#stroke-page').innerText(), /さかん/);
    await page.goBack(); await nodeIs('kanji:旺');
    await page.waitForFunction(() => document.activeElement.id === 'strokes-door');
    assert.equal(fixtures.kanji['旺'].kun.includes('さかん'), false, 'fixture stays distinct from the display fallback');
  });
  await check('read-only source records expose attested related forms and return without enrollment', async () => {
    const collection = catalog.collections.find((c) => c.family === 'kanken' && c.entries.some((e) => !e.canonicalTarget && e.relatedForms?.length));
    const source = collection.entries.find((e) => !e.canonicalTarget && e.relatedForms?.length);
    await library(collection.id, source.id); await page.locator(`[data-entry-id="${source.id}"]`).click();
    await nodeIs(`reference:${source.id}`); assert.equal(await page.locator('#sheet-take').count(), 0);
    const door = page.locator('[data-reference-related]').first(); const label = await door.textContent();
    await capture('after-source-only-connections'); await door.click(); await page.waitForSelector('.sheet');
    await page.click('#sheet-back'); await nodeIs(`reference:${source.id}`); assert.equal(await focusedText(), label);
    assert.equal(await page.locator('#sheet-take').count(), 0);
  });
  await check('language choice has group semantics and individually pressed buttons', async () => {
    await boot(); assert.equal(await page.locator('#lang').getAttribute('role'), 'group');
    assert.equal(await page.locator('#lang').getAttribute('aria-pressed'), null);
    await page.click('#lang [data-lang="ja"]'); assert.equal(await page.locator('#lang [data-lang="ja"]').getAttribute('aria-pressed'), 'true');
    await page.click('#levels-link'); await capture('after-japanese-overview');
    await page.click('#lang [data-lang="bi"]'); assert.equal(await page.locator('#lang [data-lang="bi"]').getAttribute('aria-pressed'), 'true');
  });
  await check('all passive recursive browsing leaves enrollment and learning evidence unchanged', async () => {
    assert.deepEqual(await evidence(), initial); assert.deepEqual(errors, []);
  });
  await check('explicit Memorize updates shared My Study once, with no retrieval credit', async () => {
    await entry(); await page.click('#sheet-take'); await page.waitForFunction(() => document.querySelector('#sheet-take')?.getAttribute('aria-pressed') === 'true');
    await page.click('#sheet-reference-return'); assert.ok(await page.locator('[data-entry-id="学校"] .reference-entry-saved').isVisible());
    const after = await evidence(); assert.equal(after.taken.length, (initial.taken?.length || 0) + 1); assert.deepEqual(after.revlog, initial.revlog);
    await page.click('#reference-study'); assert.ok((await page.locator('main').innerText()).includes('学校')); await page.click('#back');
    await page.click('[data-entry-id="学校"]'); await page.click('#sheet-take');
    const removed = await waitForAppRecord(page, record => !record.taken.some(item => item.t === 'word' && item.id === '学校'));
    assert.equal(removed.taken.length, initial.taken?.length || 0);
  });
  for (const width of [320, 390, 1280]) {
    await check(`${width}px library, word and source-tag disclosure fit their viewport`, async () => {
      await page.setViewportSize({ width, height: 844 }); await boot(); await page.click('#levels-link');
      await capture(`after-overview-${width}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.click('[data-reference-collection="jlpt:N5"]'); await page.fill('#reference-search', '学校'); await page.click('[data-entry-id="学校"]');
      await page.waitForSelector('[data-kanjirow="学"]'); await capture(`after-word-${width}`);
      await page.locator('.reference-entry-provenance summary').click(); await capture(`after-provenance-${width}`);
      assert.ok(await page.locator('.sheet').evaluate((n) => n.scrollWidth <= n.clientWidth + 1));
      const rect = await page.locator('.sheet').boundingBox(); assert.ok(rect.x >= 0 && rect.x + rect.width <= width + 1);
    });
  }
  await check('nested article detour restores the exact live review, taken item and source identity', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot();
    const article = json('data/articles/index.json').articles.find(item => item.id === 'wikinews:1403');
    const body = json(`data/articles/${article.file}`);
    const word = '世界';
    const index = body.tokens.findIndex(token => token.b === word && token.c);
    assert.ok(index >= 0);
    await page.locator(`[data-passage="${article.id}"]`).first().click();
    const token = page.locator(`#reader .tok[data-index="${index}"][data-word="${word}"]`);
    await token.click();
    await page.click('#reader-sentence-practice');
    await page.locator('#sentence-choose-cloze').check();
    await page.click('#sentence-practice-confirm');
    await page.waitForSelector('#sentence-review-start');
    const chosen = await waitForAppRecord(page, record => record.sentencePractice?.entries.some(entry =>
      entry.context.sourceId === article.id && entry.context.index === index));
    const practice = chosen.sentencePractice.entries.find(entry => entry.context.sourceId === article.id && entry.context.index === index);
    const taken = chosen.taken.find(item => item.t === 'sentence' && item.id === practice.plan.id);
    assert.ok(taken && Number.isFinite(taken.started));
    assert.equal(taken.sourceContextRef, practice.context.id);
    assert.equal(practice.context.sourceKind, 'bundled-passage');
    const surfaces = body.tokens.map(item => item.s);
    assert.equal(practice.context.sourceDigest, createHash('sha256').update(JSON.stringify(surfaces)).digest('hex'));
    assert.equal(practice.context.quote, surfaces.slice(practice.context.start, practice.context.end).join(''));
    assert.equal(practice.context.title, article.title);
    await page.click('#sentence-review-start');
    await page.fill('#sentence-recall-answer', body.tokens[index].s);
    await page.click('#sentence-recall-check');
    await page.waitForSelector('.grade.g-easy');
    const answered = await readAppRecord(page);
    const response = answered.sentencePractice.responses.at(-1);
    assert.equal(response.text, body.tokens[index].s);
    const session = await page.evaluate(() => window.__KAIRO_SRS__.session());
    assert.equal(session.queue, 1); assert.equal(session.ix, 0);
    if (shots) writeFileSync(resolve(shots, 'source-return-before-detour.json'), `${JSON.stringify({ record: answered, session, practiceId: practice.plan.id, responseId: response.id }, null, 2)}\n`);
    await page.click('#review-source-return');
    await page.waitForSelector('#reader-source-back');
    assert.match(await page.locator('#reader-source-back').innerText(), /Resume review/);
    await page.waitForFunction(tokenIndex => document.activeElement?.matches(`#reader .tok[data-index="${tokenIndex}"]`), index);
    await page.click('#chrome-search');
    await page.fill('#nav-search-input', word); await page.press('#nav-search-input', 'Enter');
    await nodeIs(`word:${word}`);
    await page.locator('.sent-door').first().click();
    await page.waitForSelector('#sent-home');
    const sentence = await page.locator('.sent-reader').innerText();
    await page.click('#sent-home');
    await page.waitForSelector('#source-entry-return');
    assert.equal(await page.locator('h1.view-title').innerText(), article.title);
    await capture('review-source-nested-article');
    await page.click('#source-entry-return');
    assert.equal(await page.locator('.sent-reader').innerText(), sentence);
    await page.click('#sheet-close');
    assert.equal(await page.locator('#nav-search-input').inputValue(), word);
    await page.click('#back');
    await page.waitForSelector('#reader');
    await capture('review-source-after-nested-return');
    assert.equal(await page.locator('#reader-source-back').count(), 1, 'Nested article return must retain the live Resume review caller');
    assert.match(await page.locator('#reader-source-back').innerText(), /Resume review/);
    await page.click('#reader-source-back');
    await page.waitForSelector('.grade.g-easy');
    await page.waitForFunction(() => document.activeElement?.id === 'review-source-return');
    assert.deepEqual(await page.evaluate(() => window.__KAIRO_SRS__.session()), session);
    const returned = await readAppRecord(page);
    for (const key of ['taken', 'srs', 'revlog', 'stats', 'obslog', 'sentencePractice', 'teacherContexts', 'lists'])
      assert.deepEqual(returned[key], answered[key], `Passive source detour preserves ${key}`);
    assert.equal(returned.taken.find(item => item.id === practice.plan.id).sourceContextRef, practice.context.id);
    if (shots) writeFileSync(resolve(shots, 'source-return-resumed.json'), `${JSON.stringify({ record: returned, session }, null, 2)}\n`);
    await capture('exact-live-review-resumed');
    await page.click('.grade.g-easy');
    await page.waitForSelector('.review-summary');
    const graded = await waitForAppRecord(page, record => record.revlog.length === answered.revlog.length + 1);
    assert.equal(graded.revlog.at(-1)[1], `sentence:${practice.plan.id}`);
    assert.ok(graded.sentencePractice.grades.some(grade => grade.responseId === response.id));
    assert.equal(graded.srs[`sentence:${practice.plan.id}`].reps, 1);
    assert.deepEqual(graded.taken, answered.taken);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(errors, []);
    if (shots) writeFileSync(resolve(shots, 'source-return-one-explicit-grade.json'), `${JSON.stringify(graded, null, 2)}\n`);
  }, 'source-return');
  await check('no uncaught application exceptions', async () => assert.deepEqual(errors, []));
} finally {
  await browser.close(); await new Promise((done) => server.close(done));
  if (shots) writeFileSync(resolve(shots, 'connections-results.json'), `${JSON.stringify(results, null, 2)}\n`);
  if (shots) writeFileSync(resolve(shots, 'execution.json'), `${JSON.stringify({ selectedCase, excludedChecks, externalRequests,
    browser: { engine: 'Chromium', version: browser.version(), headless: true, maximumContexts: 1 } }, null, 2)}\n`);
}
const failures = results.filter((r) => !r.pass);
console.log(`\n${results.length - failures.length}/${results.length} recursive connection checks passed.`);
process.exitCode = failures.length ? 1 : 0;
