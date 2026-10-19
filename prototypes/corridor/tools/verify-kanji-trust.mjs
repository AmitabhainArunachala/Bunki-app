/** Kanji-trust — the kanji reference and lessons tell the truth, in real WebKit and Chromium at 390×844.
 *
 *   K01-sei / K01-kai / K01-o  生 開 汚 show every reading the official 2010 table lists (kind kept: 音 against
 *                              音, 訓 against 訓), the lessons' selection first.
 *   K01-official               中 shows ジュウ — a reading only the official table gives — starred and named.
 *   K01-joyo-forms             剝 and 𠮟 (official forms kanji.json lacks) are found by reading and open whole.
 *   K01-stroke-extended        胤 (the SKIP index's KANJIDIC2 record) shows the same readings in its writing room as
 *                              on its entry: イン / たね, never — / —.
 *   K01-stroke-failed          every reading's download fails: 生's writing room says its lists are the lessons'
 *                              selection and offers Try again; the retry says it is loading, then draws every official
 *                              reading, both in the same room (the ink is not restarted); the entry beneath is whole
 *                              when the room closes.
 *   K03-lookup                 食 by たべる, taberu, タベル, ﾀﾍﾞﾙ, ｔａｂｅｒｕ, たべr (an IME mid-word) and た;
 *                              生 by いきる, うまれる, なま; かいう never finds 介 (two readings are never joined).
 *   K04-kodansha               #8 is 胤 in both editions, 2013 #22 is 仔; 胤 opens with both numbers; a fixed
 *                              sample of the numbers whose glyph kanji.json lacks all answer.
 *   K05-frequency              1001–2501 counts 1,150, all 1,150 reachable; Back from the last lands on the
 *                              same band, still open, at the same place.
 *   K05-reading-all            た: every counted hit reachable.
 *   K05-nested-return          た, all shown → the last hit → its search icon → なま → Back, close: the finder is
 *                              た again, every hit shown, at the same place.
 *   K05-nested-search-page     the same in the search room: reading た → the last hit → its search icon → meaning
 *                              "water" → Back, close: the reading lens, た, every hit shown, at the same place.
 *   K05-idioms                 一: as many idioms reachable as the heading counts (135).
 *   K05-parts                  父 found by 父 and by ちち though it is used in fewer than 8 kanji.
 *   K06-load                   a failed first load of the frequency table, the Kodansha table and the complete
 *                              readings each says so with a retry (never "no match"); the retry answers the
 *                              same band / number / reading with no reload; a genuine no-match keeps its words.
 *   K07-words                  椎 → 椎茸 (しいたけ) and 藍 → 藍 (あい) through their alternate spellings, opening
 *                              that very entry; 梨 → 梨 (なし) from the build-time JMdict words; 淫 says plainly
 *                              that no word in the app's dictionaries contains it.
 *   K08-lessons                10級-1 failed 0/10 stays listed with its score and reopens with its misses marked;
 *                              going over the missed ones keeps the score; a partial 5/10 and a perfect 10/10
 *                              retake both stay reachable ("last time" shown); 鹿 (7級's tail) has a lesson;
 *                              nothing is enrolled.
 * Controls (`--control <name>`, in-memory page.route edits, no disk copies) must turn their rows red:
 *   recap-browse · refilter-kkld · drop-official-reading · stroke-own-record · silent-stroke-readings · redraw-room ·
 *   forget-finder · failed-lesson-disappears.
 * Usage: KAIRO_SITE_DIR=<site> KAIRO_ARTIFACT_SHA256=<digest> KAIRO_EVIDENCE_DIR=<dir>
 *        [KAIRO_BROWSER=webkit|chromium|all] [--shots] [--control <name>] [--only <row,row>] node verify-kanji-trust.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecord } from './record-test-support.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const site = resolveCorridorSite();
const evidence = resolveCorridorEvidence();
mkdirSync(evidence, { recursive: true });
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['webkit', 'chromium'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const shots = process.argv.includes('--shots');
const controlAt = process.argv.indexOf('--control');
const controlName = controlAt >= 0 ? process.argv[controlAt + 1] : null;
const PHONE = { width: 390, height: 844 };

const data = (path) => JSON.parse(readFileSync(resolve(site, 'data', path), 'utf8'));
const kanji = data('share_alike/kanji.json').kanji;
const radicals = data('share_alike/kanji.json').radicals;
const kkld = data('share_alike/kkld.json');
const idioms = data('share_alike/idioms.json');
const skip = data('share_alike/skip.json');
const official = new Map(JSON.parse(readFileSync(resolve(REPO, 'tools/fixtures/reference/joyo-2010.json'), 'utf8')).rows.map(([glyph, readings]) => [glyph, readings]));
const rank = new Map(skip.entries.filter((entry) => entry.frequency != null).map((entry) => [entry.literal, entry.frequency]));
const band1001 = Object.keys(kanji).filter((glyph) => rank.get(glyph) >= 1001 && rank.get(glyph) <= 2501);

/** In-memory edits a control applies to the served files; each must break exactly the behaviour its rows hold. */
const CONTROLS = {
  'recap-browse': { rows: ['K05-frequency', 'K05-reading-all'], file: 'corridor.js',
    edit: (text) => replaceOnce(text, 'if (kdxGridShown(chars, CAP, open).length < chars.length) {', 'if (false) {') },
  'refilter-kkld': { rows: ['K04-kodansha'], file: 'corridor.js',
    edit: (text) => replaceOnce(text, 'return [...(table?.[String(Number(number))] || [])];', 'return [...(table?.[String(Number(number))] || [])].filter((c) => D.kanji[c]);') },
  'drop-official-reading': { rows: ['K01-sei'], file: 'data/share_alike/reference-extra.json',
    edit: (text) => {
      const doc = JSON.parse(text);
      const row = doc.kanjiReadings.find(([glyph]) => glyph === '生');
      row[2] = row[2].filter((reading) => !['う.まれる', 'うま.れる', 'う.まれ', 'うまれ'].includes(reading));
      return JSON.stringify(doc);
    } },
  'stroke-own-record': { rows: ['K01-stroke-extended'], file: 'corridor.js',
    edit: (text) => replaceOnce(text, 'return kanjiEntryRecord(id, S.stack', 'return kanjiDisplayRecord(id, S.stack') },
  'silent-stroke-readings': { rows: ['K01-stroke-failed'], file: 'corridor.js',
    edit: (text) => replaceOnce(text, '    ...strokeReadingsStatus(k),\n', '') },
  'redraw-room': { rows: ['K01-stroke-failed'], file: 'corridor.js',
    edit: (text) => replaceOnce(text, "if (document.querySelector('#stroke-page [data-stroke-readings]')) refreshStrokeReadings();", 'render();') },
  'forget-finder': { rows: ['K05-nested-return', 'K05-nested-search-page'], file: 'corridor.js',
    edit: (text) => replaceOnce(text, 'kdx: home.kdx || undefined, searchLens: home.searchLens,', '') },
  'failed-lesson-disappears': { rows: ['K08-lessons'], file: 'corridor.js',
    edit: (text) => replaceOnce(text, 'const shown = all ? plan : plan.filter((l) => again.has(l) || next.includes(l));', 'const shown = all ? plan.filter((l) => !S.lessonsDone[l.id]) : plan.filter((l) => next.includes(l));') },
};
function replaceOnce(text, from, to) {
  assert.equal(text.split(from).length, 2, `control edit must match exactly once: ${from.slice(0, 60)}`);
  return text.replace(from, to);
}
const control = controlName ? CONTROLS[controlName] : null;
assert(!controlName || control, `unknown control ${controlName}`);
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt >= 0 ? process.argv[onlyAt + 1].split(',') : null;

const host = await startStaticHost({ site, port: 0 });
const results = [];
let engineResults = [];

async function session(browser, { routes = [] } = {}) {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await silenceBrowserAudio(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('kairo-tip-reader-v1', '1'); } catch { /* storage refused */ } });
  await ctx.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.fallback() : route.abort()));
  if (control) {
    await ctx.route(`**/${control.file}`, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: control.edit(await response.text()) });
    });
  }
  for (const [pattern, handler] of routes) await ctx.route(pattern, handler);
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message || error).slice(0, 240)));
  await page.goto(`${host.origin}/?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  return { ctx, page, errors };
}
async function finder(page) {
  await page.locator('#shelf-tools-toggle').click();
  await page.locator('#kanjidex-link').click();
  await page.locator('.kdx-lens').first().waitFor();
}
const lens = (page, name) => page.locator('.kdx-lens', { hasText: name }).first().click();
const settle = (page, ms = 450) => page.waitForTimeout(ms);
const glyphsIn = (page, scope) => page.locator(`${scope} .kdx-glyph`).evaluateAll((buttons) => buttons.map((b) => b.textContent));
async function readingSearch(page, query) {
  await page.locator('#kdx-textfield').fill(query);
  await settle(page, 500);
}
/** Every reading the complete record needs has arrived (the sidecar loads after boot). */
async function readingsArrived(page) {
  await page.waitForFunction(() => !document.querySelector('[data-kanji-readings="pending"], [data-kdx-readings="pending"]'), null, { timeout: 15000 });
}
async function openEntry(page, glyph) {
  await lens(page, 'Kodansha number');
  await page.locator('#kdx-kkld').fill(glyph);
  await settle(page, 350);
  await page.locator(`#kdx-kkld-results .kdx-glyph[data-kdx-hit="${glyph}"]`).click({ timeout: 5000 });
  await page.locator('#sheet .hero-glyph').waitFor();
  await readingsArrived(page);
  await settle(page, 400);
}
async function closeSheet(page) {
  const selector = (await page.locator('#sheet-close').isVisible()) ? '#sheet-close' : '#sheet-back';
  await page.locator(selector).click();
  await settle(page, 600);
}
/** A reading search with every hit shown, then its last hit opened from where it lies on the page. */
async function expandedReadingResults(page, query) {
  await readingSearch(page, query);
  const more = page.locator('#kdx-results [data-kdx-more]');
  if (await more.count()) await more.click();
  await settle(page, 400);
  const shown = await glyphsIn(page, '#kdx-results');
  const last = page.locator(`#kdx-results .kdx-glyph[data-kdx-hit="${shown.at(-1)}"]`);
  await last.scrollIntoViewIfNeeded();
  await settle(page, 300);
  const y = await page.evaluate(() => window.scrollY);
  await last.click();
  await page.locator('#sheet .hero-glyph').waitFor();
  await settle(page, 500);
  return { shown, y };
}
/** Back from a search opened on an entry, then the entry closed: the finder as it now stands. */
async function backToFinder(page) {
  await page.locator('#back').click();
  await settle(page, 900);
  if (await page.locator('#sheet').isVisible()) await closeSheet(page);
  return { query: await page.inputValue('#kdx-textfield'), shown: (await glyphsIn(page, '#kdx-results')).length, y: await page.evaluate(() => window.scrollY) };
}
/** The entry's writing room, its readings woken: each list as the room shows it, with any star kept. */
async function strokeRoomReadings(page) {
  await page.locator('#strokes-door').click();
  await page.locator('#stroke-page').waitFor();
  await page.locator('.stroke-chrome-trigger').first().click();
  await settle(page, 500);
  const values = await page.locator('#stroke-awake-field .stroke-reading-value').allTextContents();
  const list = (text) => (text || '').split('・').map((s) => s.replace(/[（）]/g, '').trim()).filter((s) => s && s !== '—');
  return { on: list(values[0]), kun: list(values[1]) };
}
const plain = (reading) => reading.replace(/[.\-*\s]/g, '');
const kindOf = (reading) => (/[ァ-ヺ]/.test(reading) ? 'on' : 'kun');

/** The entry's readings as listed (on and kun apart), with any star kept. */
async function entryReadings(page) {
  const cells = await page.locator('#sheet dl.kv dd').allTextContents();
  return { on: (cells[0] || '').split('・').map((s) => s.trim()).filter(Boolean), kun: (cells[1] || '').split('・').map((s) => s.trim()).filter(Boolean) };
}
function officialMissing(glyph, readings) {
  const have = { on: new Set(readings.on.map(plain)), kun: new Set(readings.kun.map(plain)) };
  return (official.get(glyph) || []).filter((reading) => !have[kindOf(reading)].has(plain(reading)));
}

const ROWS = {
  async 'K01-sei'(ctx) { return entryRow(ctx, '生'); },
  async 'K01-kai'(ctx) { return entryRow(ctx, '開'); },
  async 'K01-o'(ctx) { return entryRow(ctx, '汚'); },
  async 'K01-official'({ page }) {
    await openEntry(page, '中');
    const readings = await entryReadings(page);
    const note = await page.locator('#kanji-reading-official').textContent({ timeout: 3000 }).catch(() => '');
    assert(readings.on.includes('ジュウ*'), `中 on: ${readings.on.join('・')}`);
    assert(/Jōyō kanji table \(2010\)/.test(note), `the star is not named: "${note}"`);
    await closeSheet(page);
    return `中 on ${readings.on.join('・')} · "${note.trim()}"`;
  },
  async 'K01-joyo-forms'({ page }) {
    await lens(page, 'by reading');
    await readingsArrived(page);
    const found = {};
    for (const [query, glyph] of [['はがす', '剝'], ['しかる', '𠮟']]) {
      await readingSearch(page, query);
      found[glyph] = (await glyphsIn(page, '#kdx-results')).includes(glyph);
    }
    assert(found['剝'] && found['𠮟'], `by reading: ${JSON.stringify(found)}`);
    await readingSearch(page, 'はがす');
    await page.locator('#kdx-results .kdx-glyph[data-kdx-hit="剝"]').click();
    await page.locator('#sheet .hero-glyph').waitFor();
    await settle(page, 1200);
    const hero = (await page.locator('#sheet .hero-glyph').textContent()).trim();
    const readings = await entryReadings(page);
    assert.equal(hero, '剝');
    assert.deepEqual(officialMissing('剝', readings), [], `剝 lacks ${officialMissing('剝', readings)}`);
    await closeSheet(page);
    return `剝 by はがす, 𠮟 by しかる; 剝 opens: ${readings.on.join('・')} / ${readings.kun.join('・')}`;
  },
  async 'K01-stroke-extended'({ page }) {
    // 胤 is in no lesson and KanjiVG has no strokes for it: its entry is the wider SKIP index's KANJIDIC2 record,
    // reached here by its SKIP code in the search room (a door every build has)
    await page.locator('#chrome-search').click();
    await page.locator('#nav-search-input').fill('skip:1-1-8');
    await page.locator('[data-skip-hit="胤"]').click();
    await page.locator('#sheet .hero-glyph').waitFor();
    await settle(page, 600);
    const entry = await entryReadings(page);
    const room = await strokeRoomReadings(page);
    if (shots) await page.screenshot({ path: shotPath('yin-stroke') });
    const shown = (readings) => `${readings.on.join('・') || '—'} / ${readings.kun.join('・') || '—'}`;
    assert(entry.on.includes('イン') && entry.kun.includes('たね'), `胤's entry: ${shown(entry)}`);
    assert.deepEqual({ on: room.on.map(plain), kun: room.kun.map(plain) }, { on: entry.on.map(plain), kun: entry.kun.map(plain) },
      `胤: entry ${shown(entry)}, writing room ${shown(room)}`);
    return `胤 by skip:1-1-8: entry ${shown(entry)} = writing room ${shown(room)}`;
  },
  async 'K01-stroke-failed'(_, browser) {
    // every reading's download fails until the learner asks again; that request is then held, then let through
    let network = 'fail';
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const { ctx, page, errors } = await session(browser, { routes: [['**/data/share_alike/reference-extra.json', async (route) => {
      if (network === 'fail') return route.abort('failed');
      await held;
      return route.fallback();
    }]] });
    try {
      await finder(page);
      await openEntry(page, '生');
      const entryState = await page.locator('#sheet [data-kanji-readings]').getAttribute('data-kanji-readings', { timeout: 3000 }).catch(() => null);
      const lesson = await strokeRoomReadings(page);
      const status = await page.locator('#stroke-readings-status').innerText({ timeout: 3000 }).catch(() => '');
      const retry = page.locator('#stroke-readings-retry');
      if (shots) await page.screenshot({ path: shotPath('sei-stroke-failed') });
      assert(/only the readings chosen for lessons/.test(status) && await retry.isVisible(),
        `the writing room lists ${lesson.on.join('・')} / ${lesson.kun.join('・')} and says "${status}"${await retry.count() ? '' : ', with no retry'}`);
      assert(entryState === 'failed', `生's entry is "${entryState}", not failed`);
      // the network is back: the retry says it is loading, then draws every reading, both in the same room, still
      // writing (never drawn again from the start)
      network = 'hold';
      await page.evaluate(() => { window.__ktrustRoom = document.getElementById('stroke-page'); });
      await retry.click();
      const loading = await page.locator('#stroke-readings-status[data-stroke-readings="pending"]').innerText({ timeout: 5000 }).catch(() => '');
      const sameWhileLoading = await page.evaluate(() => window.__ktrustRoom === document.getElementById('stroke-page'));
      release();
      assert(/loading every reading/.test(loading) && sameWhileLoading, `after Try again the room says "${loading}", same room ${sameWhileLoading}`);
      await page.locator('#stroke-readings-status').waitFor({ state: 'detached', timeout: 15000 });
      const values = await page.locator('#stroke-awake-field .stroke-reading-value').allTextContents();
      const list = (text) => (text || '').split('・').map((s) => s.replace(/[（）]/g, '').trim()).filter(Boolean);
      const whole = { on: list(values[0]), kun: list(values[1]) };
      const sameRoom = await page.evaluate(() => window.__ktrustRoom === document.getElementById('stroke-page'));
      if (shots) await page.screenshot({ path: shotPath('sei-stroke-retried') });
      assert(sameRoom, 'the retry drew the writing room again');
      assert.deepEqual(officialMissing('生', whole), [], `after the retry the room lacks ${officialMissing('生', whole)}`);
      // the entry beneath is whole too once the room closes
      await page.locator('#strokes-back').click();
      await page.locator('#stroke-page').waitFor({ state: 'detached' });
      await settle(page, 400);
      const after = await entryReadings(page);
      assert.deepEqual(officialMissing('生', after), [], `the entry after the room lacks ${officialMissing('生', after)}`);
      assert(!errors.length, `page errors: ${errors.join(' | ')}`);
      return `failed: room ${lesson.on.join('・')} / ${lesson.kun.join('・')} with "${status.replace(/\s+/g, ' ')}" + Try again; retry: "${loading.replace(/\s+/g, ' ')}", then ${whole.on.length + whole.kun.length} readings, every official one, in the same room; entry whole after`;
    } finally {
      release();
      await ctx.close();
    }
  },
  async 'K03-lookup'({ page }) {
    await lens(page, 'by reading');
    await readingsArrived(page);
    const misses = [];
    const seen = {};
    for (const [query, glyph] of [['たべる', '食'], ['taberu', '食'], ['タベル', '食'], ['ﾀﾍﾞﾙ', '食'], ['ｔａｂｅｒｕ', '食'], ['たべr', '食'], ['た', '食'],
      ['いきる', '生'], ['うまれる', '生'], ['なま', '生'], ['ikiru', '生']]) {
      await readingSearch(page, query);
      const hits = await glyphsIn(page, '#kdx-results');
      seen[query] = hits.length;
      if (!hits.includes(glyph)) misses.push(`${glyph} by ${query}`);
    }
    await readingSearch(page, 'かいう');
    if ((await glyphsIn(page, '#kdx-results')).includes('介')) misses.push('介 by かいう (two readings joined)');
    assert(!misses.length, misses.join(' · '));
    return Object.entries(seen).map(([q, n]) => `${q}:${n}`).join(' ');
  },
  async 'K04-kodansha'({ page }) {
    await lens(page, 'Kodansha number');
    await page.locator('#kdx-kkld').waitFor();
    const misses = [];
    const ask = async (ed, number) => {
      await page.locator(`[data-kdx-kkld-ed="${ed}"]`).click();
      await page.locator('#kdx-kkld').fill(String(number));
      await settle(page, 250);
      return { glyphs: await glyphsIn(page, '#kdx-kkld-results'), text: await page.locator('#kdx-kkld-results').innerText() };
    };
    for (const [ed, number, glyph] of [['ed2013', 8, '胤'], ['ed1999', 8, '胤'], ['ed2013', 22, '仔']]) {
      const got = await ask(ed, number);
      if (!got.glyphs.includes(glyph) || /No kanji carries that number/.test(got.text)) misses.push(`${ed} #${number}: ${got.glyphs.join('') || 'nothing'}`);
    }
    // a fixed sample of the numbers whose glyph kanji.json lacks, both editions
    const outside = [['ed2013', kkld.byNumber2013], ['ed1999', kkld.byNumber1999]].flatMap(([ed, table]) =>
      Object.entries(table).flatMap(([number, glyphs]) => glyphs.filter((glyph) => !kanji[glyph]).map((glyph) => [ed, number, glyph])));
    const sample = outside.filter((_, index) => index % Math.ceil(outside.length / 24) === 0);
    for (const [ed, number, glyph] of sample) {
      const got = await ask(ed, number);
      if (!got.glyphs.includes(glyph)) misses.push(`${ed} #${number} → ${glyph}: ${got.glyphs.join('') || 'nothing'}`);
    }
    await ask('ed2013', 8);
    if (!misses.length) {
      await page.locator('#kdx-kkld-results .kdx-glyph[data-kdx-hit="胤"]').click();
      await page.locator('#sheet .hero-glyph').waitFor();
      await settle(page, 1500);
      const chip = await page.locator('#kanji-kkld').textContent({ timeout: 5000 }).catch(() => '');
      if (!/2013 ed\. #8\b/.test(chip) || !/1999 ed\. #8\b/.test(chip)) misses.push(`胤's sheet: "${chip}"`);
      await closeSheet(page);
    }
    assert(!misses.length, misses.slice(0, 8).join(' · '));
    return `#8 → 胤 (2013, 1999), 2013 #22 → 仔, ${sample.length} sampled outside-core numbers answer, 胤 sheet names both`;
  },
  async 'K05-frequency'({ page }) {
    await lens(page, 'by frequency');
    await page.locator('[data-kdx-freq="1001"]').click();
    await settle(page, 600);
    const heading = (await page.locator('main .eyebrow').allTextContents()).find((text) => /found/.test(text)) || '';
    const more = page.locator('[data-kdx-more]');
    if (await more.count()) await more.click();
    await settle(page, 600);
    const shown = await glyphsIn(page, 'main');
    assert(/1,150 found/.test(heading), `heading "${heading}"`);
    assert.equal(shown.length, 1150, `${shown.length} reachable of 1,150`);
    assert.deepEqual([...shown].sort(), [...band1001].sort(), 'the band lists exactly its 1,150 kanji');
    const last = shown.at(-1);
    await page.locator(`main .kdx-glyph[data-kdx-hit="${last}"]`).scrollIntoViewIfNeeded();
    await settle(page, 300);
    const before = await page.evaluate(() => window.scrollY);
    await page.locator(`main .kdx-glyph[data-kdx-hit="${last}"]`).click();
    await page.locator('#sheet .hero-glyph').waitFor();
    await settle(page, 700);
    await closeSheet(page);
    const after = await page.evaluate(() => window.scrollY);
    const stillOn = await page.locator('[data-kdx-freq="1001"][aria-pressed="true"]').count();
    const reachable = (await glyphsIn(page, 'main')).length;
    assert(stillOn && reachable === 1150 && Math.abs(after - before) <= 4, `back: band ${stillOn}, ${reachable} shown, scroll ${before}→${after}`);
    return `"${heading}" → 1,150 reachable; back from ${last}: same band, ${reachable} shown, scroll ${before}→${after}`;
  },
  async 'K05-reading-all'({ page }) {
    await lens(page, 'by reading');
    await readingsArrived(page);
    await readingSearch(page, 'た');
    const count = Number(await page.locator('#kdx-results .eyebrow').getAttribute('data-kdx-count', { timeout: 3000 }).catch(() => NaN));
    const first = (await glyphsIn(page, '#kdx-results')).length;
    const more = page.locator('#kdx-results [data-kdx-more]');
    if (await more.count()) await more.click();
    await settle(page, 400);
    const all = (await glyphsIn(page, '#kdx-results')).length;
    assert(count > 200 && all === count, `た: counted ${count}, first ${first}, reachable ${all}`);
    return `た: ${count} counted, first page ${first}, all ${all} reachable`;
  },
  async 'K05-nested-return'({ page }) {
    await lens(page, 'by reading');
    await readingsArrived(page);
    const outer = await expandedReadingResults(page, 'た');
    await page.locator('#sheet-search').click();
    await page.locator('[data-search-lens="reading"]').click();
    await settle(page, 300);
    await readingSearch(page, 'なま');
    const nested = (await glyphsIn(page, 'main')).length;
    const back = await backToFinder(page);
    if (shots) await page.screenshot({ path: shotPath('nested-return') });
    assert(back.query === 'た' && back.shown === outer.shown.length && Math.abs(back.y - outer.y) <= 4,
      `back from なま (${nested} hits): query "${back.query}", ${back.shown} of ${outer.shown.length} shown, scroll ${outer.y}→${back.y}`);
    return `た: ${outer.shown.length} shown → ${outer.shown.at(-1)} → its search icon → なま (${nested}) → Back, close: "${back.query}", ${back.shown} shown, scroll ${outer.y}→${back.y}`;
  },
  async 'K05-nested-search-page'({ page }) {
    await page.locator('#chrome-search').click();
    await page.locator('[data-search-lens="reading"]').click();
    await readingsArrived(page);
    const outer = await expandedReadingResults(page, 'た');
    await page.locator('#sheet-search').click();
    await page.locator('[data-search-lens="meaning"]').click();
    await settle(page, 300);
    await page.locator('#kdx-textfield').fill('water');
    await settle(page, 500);
    const nested = (await glyphsIn(page, 'main')).length;
    const back = await backToFinder(page);
    const lensOn = await page.locator('[data-search-lens="reading"][aria-pressed="true"]').count();
    assert(lensOn && back.query === 'た' && back.shown === outer.shown.length && Math.abs(back.y - outer.y) <= 4,
      `back from meaning "water" (${nested} hits): reading lens ${lensOn}, query "${back.query}", ${back.shown} of ${outer.shown.length} shown, scroll ${outer.y}→${back.y}`);
    return `search room, reading た: ${outer.shown.length} shown → ${outer.shown.at(-1)} → its search icon → meaning "water" (${nested}) → Back, close: reading lens, "${back.query}", ${back.shown} shown, scroll ${outer.y}→${back.y}`;
  },
  async 'K05-idioms'({ page }) {
    await openEntry(page, '一');
    const want = idioms.byKanji['一'].length;
    const heading = (await page.locator('#sheet .eyebrow', { hasText: 'idioms' }).textContent()).trim();
    const more = page.locator('#kanji-idioms-more');
    if (await more.count()) await more.click();
    await settle(page, 300);
    const chips = await page.locator('#sheet .chip.t-idiom .big').allTextContents();
    await closeSheet(page);
    assert(heading.startsWith(`${want} `) && chips.length === want && idioms.byKanji['一'].every((w) => chips.includes(w)), `heading "${heading}", ${chips.length} reachable of ${want}`);
    return `"${heading}" — ${chips.length} reachable`;
  },
  async 'K05-parts'({ page }) {
    await lens(page, 'by its parts');
    const found = {};
    for (const query of ['父', 'ちち']) {
      await page.locator('#kdx-partfilter').fill(query);
      await settle(page, 300);
      found[query] = await page.locator('#kdx-partgrid [data-kdx-part="父"]').count();
    }
    assert(found['父'] && found['ちち'], `父 by 父: ${found['父']}, by ちち: ${found['ちち']}`);
    await page.locator('#kdx-partgrid [data-kdx-part="父"]').click();
    await settle(page, 400);
    const hits = await glyphsIn(page, 'main');
    const want = radicals['父'].kanji.filter((glyph) => kanji[glyph]);
    assert.deepEqual([...hits].sort(), [...want].sort(), `父 lists ${hits.join('')}`);
    return `父 by 父 and ちち (${radicals['父'].kanjiCount} kanji, under the browsing threshold): ${hits.join('')}`;
  },
  async 'K07-words'({ page }) {
    const notes = [];
    for (const [glyph, spelling, reading, gloss] of [['椎', '椎茸', 'しいたけ', /shiitake/], ['藍', '藍', 'あい', /indigo|knotweed/]]) {
      await openEntry(page, glyph);
      const row = page.locator(`#sheet [data-word-spelling="${spelling}"]`);
      assert(await row.count(), `${glyph}: no row for ${spelling}`);
      const text = await row.innerText();
      assert(text.includes(reading) && gloss.test(text), `${glyph} row: ${text}`);
      await row.click();
      await page.locator('#sheet .headword').waitFor();
      await settle(page, 700);
      const head = (await page.locator('#sheet .headword').last().innerText()).trim();
      const shown = (await page.locator('#sheet .reading').first().innerText().catch(() => '')).trim();
      assert(head.includes(reading) && head.includes(spelling) && shown === reading, `${spelling} opens "${head}" read "${shown}"`);
      notes.push(`${glyph} → ${spelling}: "${head}" ${shown}`);
      await closeSheet(page);
    }
    await openEntry(page, '梨');
    const jm = page.locator('#sheet [data-jmdict-seq="1549860"]');
    assert(await jm.count(), '梨: no build-time word 梨 (なし)');
    const jmText = await jm.innerText();
    assert(jmText.includes('なし') && /nashi|pear/.test(jmText), `梨 row: ${jmText}`);
    notes.push(`梨 → ${jmText.replace(/\s+/g, ' ')}`);
    await closeSheet(page);
    await openEntry(page, '淫');
    const wordless = await page.locator('#sheet [data-wordless="checked"]').innerText({ timeout: 3000 }).catch(() => '');
    assert(/No word in this app.s dictionaries contains this kanji/.test(wordless), `淫: "${wordless}"`);
    notes.push(`淫: "${wordless}"`);
    await closeSheet(page);
    return notes.join(' · ');
  },
  async 'K06-load'(_, browser) {
    const notes = [];
    // the frequency table: first request fails, then the network is back
    {
      let fail = 1;
      const { ctx, page } = await session(browser, { routes: [['**/data/share_alike/skip.json', (route) => (fail-- > 0 ? route.abort('failed') : route.fallback())]] });
      await page.evaluate(() => { window.__ktrustSameDocument = 1; });
      await finder(page);
      await lens(page, 'by frequency');
      await settle(page, 900);
      const failed = await page.locator('main [data-kdx-load="failed"]').count();
      const retry = page.locator('#kdx-freq-retry');
      assert(failed && await retry.count(), 'the frequency table failure is not said, or has no retry');
      assert(!(await page.locator('main', { hasText: 'No character matches' }).count()), 'a failure is shown as "no match"');
      await page.locator('[data-kdx-freq="1001"]').click();
      await settle(page, 300);
      await page.locator('#kdx-freq-retry').click();
      await page.locator('main .kdx-glyph').first().waitFor({ timeout: 15000 });
      const heading = (await page.locator('main .eyebrow').allTextContents()).find((text) => /found/.test(text)) || '';
      const same = await page.evaluate(() => window.__ktrustSameDocument === 1);
      assert(/1,150 found/.test(heading) && same, `retry answered "${heading}", same document ${same}`);
      notes.push(`frequency: failure + retry → "${heading}" in the same document`);
      await ctx.close();
    }
    // the Kodansha table (fetched at boot) and the complete readings (the reference sidecar)
    {
      let failKkld = 1;
      let failExtra = 1;
      const { ctx, page } = await session(browser, { routes: [
        ['**/data/share_alike/kkld.json', (route) => (failKkld-- > 0 ? route.abort('failed') : route.fallback())],
        ['**/data/share_alike/reference-extra.json', (route) => (failExtra-- > 0 ? route.abort('failed') : route.fallback())],
      ] });
      await page.evaluate(() => { window.__ktrustSameDocument = 1; });
      await finder(page);
      await lens(page, 'Kodansha number');
      await page.locator('#kdx-kkld').fill('8');
      await settle(page, 500);
      assert(await page.locator('#kdx-kkld-results [data-kdx-load="failed"]').count() && await page.locator('#kdx-kkld-retry').count(), 'the Kodansha failure is not said, or has no retry');
      assert(!/No kanji carries that number/.test(await page.locator('#kdx-kkld-results').innerText()), 'a failure is shown as "no kanji carries that number"');
      await page.locator('#kdx-kkld-retry').click();
      await page.locator('#kdx-kkld-results .kdx-glyph[data-kdx-hit="胤"]').waitFor({ timeout: 15000 });
      assert.equal(await page.inputValue('#kdx-kkld'), '8');
      notes.push('Kodansha: failure + retry → #8 胤');
      await page.locator('#kdx-kkld').fill('9999');
      await settle(page, 300);
      const none = await page.locator('#kdx-kkld-results').innerText();
      assert(/No kanji carries that number in this edition/.test(none) && !(await page.locator('#kdx-kkld-results [data-kdx-load]').count()), `a genuine no-match: "${none}"`);
      notes.push('#9999: a genuine no-match keeps its words');
      await lens(page, 'by reading');
      await readingSearch(page, 'うまれる');
      await page.locator('#kdx-results [data-kdx-readings="failed"]').waitFor({ timeout: 15000 });
      assert(await page.locator('#kdx-readings-retry').count(), 'the readings failure has no retry');
      assert(!(await page.locator('#kdx-results', { hasText: 'No character matches' }).count()), 'a readings failure is shown as "no match"');
      await page.locator('#kdx-readings-retry').click();
      await page.locator('#kdx-results .kdx-glyph[data-kdx-hit="生"]').waitFor({ timeout: 15000 });
      const same = await page.evaluate(() => window.__ktrustSameDocument === 1);
      assert(same && await page.inputValue('#kdx-textfield') === 'うまれる', 'the retry reloaded or lost the query');
      notes.push('readings: failure + retry → 生 by うまれる, same document');
      await ctx.close();
    }
    return notes.join(' · ');
  },
  async 'K08-lessons'({ page }) {
    const notes = [];
    const recordBefore = await readAppRecord(page);
    await page.locator('#shelf-tools-toggle').click();
    await page.locator('#lessons-link').click();
    await page.locator('.lesson-row').first().waitFor();
    let labelled = null;
    const runLesson = async (start, answer) => {
      await start();
      await page.locator('#lesson-next').waitFor({ timeout: 5000 });
      labelled ??= await page.locator('.lesson-reading-note').count();
      for (let i = 0; i < 14 && !(await page.locator('.lesson-option').count()); i++) {
        await page.locator('#lesson-next').click();
        await settle(page, 80);
      }
      // one answer per question the quiz counts ("quiz — 1 / 10"); each waits for that question's live options, so
      // a slow save of the last answer is waited for, never answered twice
      const total = Number((await page.locator('main .card-kind').first().innerText()).match(/\/\s*(\d+)/)?.[1] || 0);
      for (let index = 0; index < total; index++) {
        await page.locator('.lesson-option:not([disabled])').first().waitFor();
        const glyph = (await page.locator('.review-front').innerText()).trim();
        const options = await page.locator('.lesson-option').allTextContents();
        const right = kanji[glyph]?.m;
        const pick = answer(index) ? options.indexOf(right) : options.findIndex((text) => text !== right);
        await page.locator('.lesson-option').nth(pick).click();
        await page.locator('#lesson-next:not([disabled])').click();
      }
      await page.locator('.lesson-enroll').waitFor();
      return (await page.locator('h1.view-title').innerText()).trim();
    };
    const first = page.locator('.lesson-row', { hasText: '一・七・三・上' }).first();
    const zero = await runLesson(() => first.click(), () => false);
    assert.equal(zero, '0 of 10');
    const retryDoors = [await page.locator('#lesson-missed').count(), await page.locator('#lesson-retake').count()];
    if (shots) {
      await page.locator('#lesson-missed').scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: shotPath('lesson-zero-retry') });
    }
    // the missed ones, all right this time: the lesson's score stays 0/10
    const missedRun = retryDoors[0] ? await runLesson(() => page.locator('#lesson-missed').click(), () => true).catch(() => null) : null;
    let record = await readAppRecord(page);
    const keptScore = record.lessonsDone?.['10級-1'];
    const missedRows = (record.obslog || []).filter((row) => row[1] === 'lesson' && row[4] === '10級-1:missed').length;
    notes.push(`0/10 → doors ${retryDoors.join('/')}; missed-only run "${missedRun}" → score ${keptScore?.score}/${keptScore?.total}, ${missedRows} practice rows`);
    await page.locator('main button', { hasText: 'back to lessons' }).click();
    await page.locator('.lesson-row').first().waitFor();
    await settle(page, 400);
    const listed = page.locator('.lesson-row', { hasText: '一・七・三・上' });
    const listedText = (await listed.count()) ? (await listed.first().innerText()).replace(/\s+/g, ' ') : 'NOT LISTED';
    if (shots) {
      await listed.first().scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: shotPath('lesson-zero-list') });
    }
    // reopen it: the items missed last time are marked; then a partial 5/10, then a perfect 10/10
    let marked = 0;
    let partial = null;
    let perfect = null;
    let perfectText = 'NOT REACHABLE';
    if (await listed.count()) {
      await listed.first().click();
      marked = await page.locator('[data-lesson-missed]').count();
      await page.locator('#back').click().catch(() => {});
      await page.locator('.lesson-row').first().waitFor();
      partial = await runLesson(() => page.locator('.lesson-row', { hasText: '一・七・三・上' }).first().click(), (i) => i < 5);
      perfect = await runLesson(() => page.locator('#lesson-retake').click(), () => true);
      await page.locator('main button', { hasText: 'back to lessons' }).click();
      await page.locator('.lesson-row').first().waitFor();
      const lane = page.locator('[data-lesson-lane="kanji:10級"]');
      if (await lane.count()) await lane.click();
      await settle(page, 300);
      const again = page.locator('.lesson-row[data-lesson="10級-1"]');
      if (await again.count()) perfectText = (await again.first().innerText()).replace(/\s+/g, ' ');
    }
    // 7級's tail: 鹿 has its own lesson
    const seven = page.locator('[data-lesson-lane="kanji:7級"]');
    if (await seven.count()) await seven.click();
    await settle(page, 300);
    const tail = await page.locator('.lesson-row', { hasText: '鹿' }).count();
    record = await readAppRecord(page);
    const enrolled = (record.taken || []).length - (recordBefore.taken || []).length + Object.keys(record.srs || {}).length - Object.keys(recordBefore.srs || {}).length;
    notes.push(`list "${listedText}"; reopened with ${marked} marked; partial "${partial}", retake "${perfect}" → "${perfectText}"; 鹿 lesson ${tail}; enrolled ${enrolled}; lesson reading labelled ${labelled}`);
    assert(retryDoors[0] && retryDoors[1], 'the 0/10 end screen has no way to retry');
    assert(labelled, 'the kanji lesson card does not label its readings as the lesson\'s selection');
    assert(missedRun === '10 of 10' && keptScore?.score === 0 && keptScore?.total === 10 && missedRows === 10, notes.at(-2));
    assert(/0\/10/.test(listedText), `the failed lesson: ${listedText}`);
    assert.equal(marked, 1, 'the reopened lesson marks the first item missed last time');
    assert(partial === '5 of 10' && perfect === '10 of 10' && /10\/10/.test(perfectText) && /last time 5\/10/.test(perfectText), notes.at(-1));
    assert(tail && enrolled === 0, notes.at(-1));
    return notes.join(' · ');
  },
};
async function entryRow({ page }, glyph) {
  await openEntry(page, glyph);
  const readings = await entryReadings(page);
  const missing = officialMissing(glyph, readings);
  const core = kanji[glyph];
  const lessonFirst = core.kun.every((reading, index) => readings.kun[index]?.replace(/\*$/, '') === reading) && core.on.every((reading, index) => readings.on[index]?.replace(/\*$/, '') === reading);
  if (shots && glyph === '生') {
    await page.locator('#sheet dl.kv').scrollIntoViewIfNeeded();
    await page.screenshot({ path: shotPath('sei-entry') });
  }
  await closeSheet(page);
  assert(!missing.length, `${glyph} lacks ${missing.join('・')} (on ${readings.on.join('・')} / kun ${readings.kun.join('・')})`);
  assert(lessonFirst, `${glyph}: the lessons' readings do not lead the list`);
  return `${glyph}: ${(official.get(glyph) || []).length} official readings present; on ${readings.on.join('・')} / kun ${readings.kun.join('・')}`;
}
let currentEngine = '';
const shotPath = (name) => resolve(evidence, `after-${currentEngine}-${name}.png`);

const order = control ? control.rows : only || Object.keys(ROWS);
assert(order.every((row) => ROWS[row]), `unknown row in ${order.join(',')}`);
let failures = 0;
for (const engine of engines) {
  currentEngine = engine;
  const browser = await { chromium, webkit }[engine].launch({ headless: true });
  const version = browser.version();
  const load = execFileSync('uptime', { encoding: 'utf8' }).trim();
  console.log(`== ${engine} ${version} · ${load}${control ? ` · CONTROL ${controlName}` : ''}`);
  engineResults = [];
  for (const row of order) {
    const started = Date.now();
    let pass = false;
    let detail = '';
    let errors = [];
    try {
      if (row === 'K06-load' || row === 'K01-stroke-failed') {
        detail = await ROWS[row](null, browser);
      } else {
        const opened = await session(browser);
        errors = opened.errors;
        try {
          if (row !== 'K08-lessons') await finder(opened.page);
          if (shots && row === 'K03-lookup') {
            await lens(opened.page, 'by reading');
            await readingsArrived(opened.page);
            await readingSearch(opened.page, 'たべる');
            await opened.page.screenshot({ path: shotPath('taberu-search') });
          }
          if (shots && row === 'K04-kodansha') {
            await lens(opened.page, 'Kodansha number');
            await opened.page.locator('#kdx-kkld').fill('8');
            await settle(opened.page, 400);
            await opened.page.screenshot({ path: shotPath('kodansha-8') });
          }
          detail = await ROWS[row](opened, browser);
          if (shots && row === 'K05-frequency') {
            await opened.page.locator('main .kdx-glyph').last().scrollIntoViewIfNeeded();
            await opened.page.screenshot({ path: shotPath('freq-1001-end') });
          }
          if (shots && row === 'K07-words') {
            await openEntry(opened.page, '椎');
            await opened.page.locator('#sheet [data-word-spelling="椎茸"]').scrollIntoViewIfNeeded().catch(() => {});
            await opened.page.screenshot({ path: shotPath('shii-words') });
          }
        } finally {
          await opened.ctx.close();
        }
      }
      if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
      pass = true;
    } catch (error) {
      // the first lines name the locator a timeout waited on
      detail = String(error.message || error).split('\n').filter(Boolean).slice(0, 3).join(' ⏎ ').slice(0, 600);
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    engineResults.push({ row, pass, detail, seconds });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${engine} ${row} (${seconds}s) — ${detail}`);
  }
  await browser.close();
  results.push({ engine, version, load, rows: engineResults });
  if (control) {
    for (const row of engineResults) {
      if (row.pass) { failures += 1; console.log(`CONTROL ${controlName} FAILED TO BITE: ${engine} ${row.row} stayed green`); }
      else console.log(`CONTROL ${controlName} bites: ${engine} ${row.row} red`);
    }
  } else failures += engineResults.filter((row) => !row.pass).length;
}
await host.close?.();
const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const receipt = { schemaVersion: 1, site, gitSha: manifest.gitSha, sourceDirty: manifest.sourceDirty, artifactSha256: manifest.artifactSha256,
  control: controlName, results, failures };
writeFileSync(resolve(evidence, `verify-kanji-trust${controlName ? `-control-${controlName}` : ''}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(control ? (failures ? `CONTROL ${controlName}: ${failures} row(s) stayed green` : `CONTROL ${controlName}: every targeted row red`)
  : (failures ? `KANJI-TRUST: ${failures} row(s) failed` : `KANJI-TRUST CLEAN — ${order.length} rows × ${engines.length} engine(s)`));
process.exit(failures ? 1 : 0);
