/** verify-reading-truth · slice R (2026-10-16). The reading a word door shows is the reading its text gives the token,
 * and the entry it stands for is the one read that way: in 令和8年 the ruby says ねん, and the card said とし. A door with
 * no reading of its own (Words, the sky, prose), or with the quick dictionary's own reading, answers from the quick
 * dictionary as before. Served build only, WebKit and Chromium, 390×844, touch.
 *   F0  the served fixtures: token rows, the quick dictionary's readings, the full dictionary's entries
 *   A1  reader, one tap: the card's reading is the token's (年 ねん, 月 がつ, 時 じ, 一日 ついたち) and its meaning is
 *       the entry read that way; each twin read like the quick dictionary (年 とし, 月 つき, 時 とき) is unchanged
 *   A2  reader, the second tap: the entry reads ねん and is entry 2084840
 *   A3  Save keeps the entry and the reading shown (entrySeq 2084840, cueReading ねん); export → import keeps them
 *   A4  the stable case: Words search 年 opens the quick dictionary's とし; 総理 is unchanged
 *   A5  a sentence's words (an entry's 用例): a 年 counting years reads ねん
 *   A6  a deck card's back: a word the deck reads otherwise than the quick dictionary shows the deck's reading
 *   A7  the guided session: every word's card reads as the session reads it
 *   A8  the full dictionary first: スタートアップ is a normal card; 高市 says it has no entry and promises no door
 *   A9  the cold first tap (L): with the full dictionary held, 月 in 9月 (がつ) shows a quiet "…" and a held Save, never
 *       the quick dictionary's つき "Moon"; released, がつ's meaning; answered 500, the "…" stays. Every case counts every
 *       page error (L dropped R's ResizeObserver filter; the capture case listens too)
 *   A10 (N, 2026-10-17) a word no entry is read for: Kawaguchi's 訳 read やく; every dictionary the build serves reads
 *       訳 only わけ ("reason"). An entry read otherwise counts as missing. With the full dictionary held, the first tap
 *       shows 「やく …」 with Save held. Once it answers, the same card, with no second tap, says "No dictionary entry for
 *       this reading.", its Save held, with "So it can't be saved here.". Its meaning line never shows わけ's meaning,
 *       and its page (the second tap) shows no meaning
 *   R   recorded, never asserted: 式 in 表彰式 and 改造 in 内閣改造 (sense: the tokens carry no sense data), ちかい in
 *       the phonetic parenthetical (G3), し of する (an inflected verb reads its dictionary form), the first paint
 * Negative control: the same run against a build with R's reading edits reverted fails A1 on 年 (とし). */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { loadGuidedIndex, loadGuidedSet } from '../guided-session-content.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';

assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable built site and its digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const json = (path) => JSON.parse(readFileSync(resolve(site, path), 'utf8'));
const k2h = (s) => String(s || '').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

/* ------------------------------------------------------------------ fixtures */
const art = (id, file, search) => Object.freeze({ id, file: `data/articles/${file}`, search });
const STARTUP = art('kantei:jp-105-actions-202609-25startup', 'kantei-jp-105-actions-202609-25startup.json', 'スタートアップ大賞');
const MESSAGE = art('kantei:jp-105-discourse-20260923message', 'kantei-jp-105-discourse-20260923message.json', '観光・食文化交流');
const WIKINEWS = art('wikinews:45227', 'wikinews-45227.json', '21年の歴史');
const KOJIKI = art('bunki-essay-n2-kojiki-myth-history', 'bunki-essay-n2-kojiki-myth-history.json', '古事記');
const DIARY = art('bunki-graded-n3-nakaima-diary', 'bunki-graded-n3-nakaima-diary.json', '中今');
const CABINET = art('jawiki:5294446', 'jawiki-5294446.json', '高市内閣');
const KAWAGUCHI = art('aozora:049966-1', 'aozora-049966-1.json', 'チベット旅行記');
// a homograph read otherwise than the quick dictionary names its entry; its twin read like the quick dictionary is the core
const PAIRS = Object.freeze([
  { name: '年 ねん (令和8年: a counter)', at: STARTUP, index: 2, s: '年', r: 'ねん', seq: '2084840' },
  { name: '年 とし (twin)', at: MESSAGE, index: 39, s: '年', r: 'とし', core: true },
  { name: '月 がつ', at: WIKINEWS, index: 12, s: '月', r: 'がつ', seq: '2871532' },
  { name: '月 つき (twin)', at: WIKINEWS, index: 107, s: '月', r: 'つき', core: true },
  { name: '時 じ', at: KOJIKI, index: 489, s: '時', r: 'じ', seq: '2020680' },
  { name: '時 とき (twin)', at: KOJIKI, index: 8, s: '時', r: 'とき', core: true },
  { name: '一日 ついたち', at: DIARY, index: 167, s: '一日', r: 'ついたち', seq: '2225040' },
]);
const STARTUP_WORD = { at: STARTUP, index: 17, s: 'スタートアップ', seq: '2303530', gloss: 'startup' };
// L · the cold first tap: 月 in 9月 reads がつ; the quick dictionary's 月 reads つき ("Moon")
const COLD = { at: STARTUP, index: 4, s: '月', r: 'がつ', seq: '2871532' };
const NAME = { at: STARTUP, index: 8, s: '高市' };
// N · a word no entry is read for: 訳 in シナ訳 reads やく; the served dictionaries' 訳 reads only わけ ("reason")
const UNREAD = { at: KAWAGUCHI, index: 548, s: '訳', r: 'やく' };
const NO_READING = 'No dictionary entry for this reading.';
const STABLE = { at: STARTUP, index: 9, s: '総理', r: 'そうり' };
const RECORDED = Object.freeze([
  { name: '式 in 表彰式 (sense)', at: STARTUP, index: 21, s: '式' },
  { name: '改造 in 第2次高市改造内閣 (sense)', at: CABINET, index: 5, s: '改造' },
  { name: 'ちかい in the phonetic parenthetical', at: CABINET, index: 11, s: 'ちかい' },
  { name: 'し of する (an inflected verb)', at: CABINET, index: 54, s: 'し' },
]);
const UNCONFIRMED = ['This entry’s answer cannot be confirmed yet, so it cannot be memorized.', 'この項目の答えをまだ確かめられないため、覚えられない。'];
const NO_ENTRY = 'No dictionary entry for this spelling.';
const SAVE_REASON = 'So it can’t be saved here.';

/* ------------------------------------------------------------------ report */
const rows = [];
let engine = 'data';
const check = (id, title, ok, observed = '') => {
  rows.push({ engine, id, title, ok: !!ok, observed });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}/${id} ${title}${ok ? '' : ` — ${typeof observed === 'string' ? observed : JSON.stringify(observed)}`}`);
};
const record = (id, title, observed) => {
  rows.push({ engine, id, title, recorded: true, observed });
  console.log(`rec  ${engine}/${id} ${title} — ${JSON.stringify(observed)}`);
};

/* ------------------------------------------------------------------ F0: the served fixtures */
const core = json('data/share_alike/dict.json').words;
const entries = json('data/share_alike/dict-v2/index.json').entries;
const bySeq = new Map(entries.map((row) => [String(row[0]), row]));
const firstGloss = (seq, reading) => {
  const row = bySeq.get(seq);
  const k = row?.[5]?.findIndex((kana) => k2h(kana) === k2h(reading)) ?? -1;
  return row && k >= 0 ? row[3] : null;
};
const tokenAt = (fixture) => json(fixture.at.file).tokens?.[fixture.index] || null;
for (const pair of PAIRS) {
  const token = tokenAt(pair);
  check(`F0.${pair.name}`, `${pair.at.id} #${pair.index} is ${pair.s} read ${pair.r}, uninflected, a content word`,
    token?.s === pair.s && token.b === pair.s && token.r === pair.r && token.c === true, token);
  if (pair.core) check(`F0.core.${pair.name}`, `the quick dictionary reads ${pair.s} ${pair.r}`, k2h(core[pair.s]?.r) === k2h(pair.r), core[pair.s]);
  else {
    check(`F0.core.${pair.name}`, `the quick dictionary reads ${pair.s} otherwise than ${pair.r}`, !!core[pair.s] && k2h(core[pair.s].r) !== k2h(pair.r), core[pair.s]);
    check(`F0.index.${pair.name}`, `the full dictionary's entry ${pair.seq} writes ${pair.s} and reads ${pair.r}`,
      bySeq.get(pair.seq)?.[4]?.includes(pair.s) && bySeq.get(pair.seq)[5].some((kana) => k2h(kana) === k2h(pair.r)), bySeq.get(pair.seq)?.slice(0, 6));
  }
}
check('F0.startup', `${STARTUP.id} #17 is スタートアップ; the quick dictionary lacks it; entry 2303530 is its one entry`,
  tokenAt(STARTUP_WORD)?.s === 'スタートアップ' && !core['スタートアップ'] && bySeq.get('2303530')?.[5]?.includes('スタートアップ')
    && entries.filter((row) => row[1] === 'スタートアップ' || row[4].includes('スタートアップ') || row[5].includes('スタートアップ')).length === 1,
  tokenAt(STARTUP_WORD));
check('F0.name', `${STARTUP.id} #8 is 高市, a name no dictionary lists`, tokenAt(NAME)?.s === '高市' && tokenAt(NAME).c === false && !core['高市']
  && !entries.some((row) => row[1] === '高市' || row[4].includes('高市') || row[5].includes('高市')), tokenAt(NAME));
check('F0.cold', `${STARTUP.id} #4 is 月 read がつ, uninflected; the quick dictionary reads it つき; entry ${COLD.seq} reads がつ`,
  tokenAt(COLD)?.s === '月' && tokenAt(COLD).b === '月' && tokenAt(COLD).r === 'がつ' && core['月']?.r === 'つき' && k2h(core['月'].r) !== 'がつ'
    && bySeq.get(COLD.seq)?.[5]?.some((kana) => k2h(kana) === 'がつ'), { token: tokenAt(COLD), core: core['月'] });
check('F0.unread', `${KAWAGUCHI.id} #548 is 訳 read やく, uninflected, a content word; the quick dictionary reads 訳 わけ; no entry the full dictionary serves writes 訳 and reads やく`,
  tokenAt(UNREAD)?.s === '訳' && tokenAt(UNREAD).b === '訳' && tokenAt(UNREAD).r === 'やく' && tokenAt(UNREAD).c === true && k2h(core['訳']?.r) === 'わけ'
    && entries.some((row) => row[4].includes('訳')) && !entries.some((row) => row[4].includes('訳') && row[5].some((kana) => k2h(kana) === 'やく')),
  { token: tokenAt(UNREAD), core: core['訳'], rows: entries.filter((row) => row[4].includes('訳') && row[1] === '訳').map((row) => row.slice(0, 4)) });
check('F0.stable', `${STARTUP.id} #9 is 総理 read そうり, like the quick dictionary`, tokenAt(STABLE)?.r === 'そうり' && core['総理']?.r === 'そうり', tokenAt(STABLE));
for (const fixture of RECORDED) check(`F0.${fixture.name}`, `${fixture.at.id} #${fixture.index} is ${fixture.s}`, tokenAt(fixture)?.s === fixture.s, tokenAt(fixture));
check('F0.no-sense', 'reader tokens carry no sense, gloss or entry number (s b p r f c, and rs)',
  [STARTUP, CABINET].every((a) => json(a.file).tokens.every((t) => Object.keys(t).every((key) => ['s', 'b', 'p', 'r', 'f', 'c', 'rs'].includes(key)))));
const guidedJson = async (path) => json(path);
const guided = await loadGuidedSet((await loadGuidedIndex(guidedJson))[0], guidedJson);
check('F0.guided', 'every guided word reads as the quick dictionary reads it (so its card can only agree)',
  Object.values(guided.words).every((word) => !core[word.surface] || k2h(core[word.surface].r) === k2h(word.reading)),
  Object.values(guided.words).filter((word) => core[word.surface] && k2h(core[word.surface].r) !== k2h(word.reading)).map((w) => w.surface));
const F0_OK = rows.every((row) => row.recorded || row.ok);

/* ------------------------------------------------------------------ the browser */
const host = await startStaticHost({ site, port: 0 });
async function boot(page, query = '?entry=shelf&ui=bi') {
  await page.goto(`${host.origin}/index.html${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
}
async function openArticle(page, at) {
  await boot(page);
  const direct = page.locator(`[data-passage="${at.id}"]:not([data-recommendation]) .shelf-open`).first();
  if (await direct.count()) await direct.click();
  else {
    await openShelfTools(page);
    await page.locator('#shelf-reading-search').fill(at.search);
    await page.locator('#shelf-reading-search').press('Enter');
    await page.locator(`#shelf-reading-results [data-passage="${at.id}"] .shelf-open`).first().click();
  }
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 20000 });
}
const tok = (page, index) => page.locator(`#reader .tok[data-index="${index}"]`).first();
/** A real tap on the element itself: Playwright scrolls it in, finds a point the element owns, and taps there. */
async function tapAt(page, locator) {
  await locator.tap({ timeout: 15000 });
}
async function closeMini(page) {
  for (let attempt = 0; attempt < 3 && await page.locator('#mini').count(); attempt++) {
    await page.locator('#mini').press('Escape').catch(() => {});
    await delay(200);
  }
}
const miniState = (page) => page.evaluate(() => {
  const mini = document.getElementById('mini');
  if (!mini) return null;
  const take = mini.querySelector('#mini-take');
  return { word: mini.querySelector('.mini-word')?.childNodes[0]?.textContent ?? null, reading: mini.querySelector('.mini-reading')?.textContent ?? '',
    gloss: mini.querySelector('.mini-gloss')?.textContent ?? '', take: take ? { disabled: take.disabled, text: take.textContent.trim() } : null,
    reason: mini.querySelector('#mini-take-reason')?.textContent ?? null };
});
/** The slip as it first paints, and as it settles: a slip drawn before the full dictionary answered is aria-busy
 * until the answer redraws it (or the answer changes nothing). */
async function slip(page, locator, { keyboard = false } = {}) {
  await closeMini(page);
  if (keyboard) { await locator.focus(); await page.keyboard.press('Enter'); } else await tapAt(page, locator);
  await page.locator('#mini').waitFor({ timeout: 20000 });
  const first = await miniState(page);
  await page.waitForFunction(() => document.getElementById('mini')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 });
  await delay(100);
  return { first, settled: (await miniState(page)) || first };
}
/** Wait until a region's markup has held still for `quiet` ms (an entry sheet refreshes as its data arrive). */
async function stillFor(page, selector, quiet = 800, timeout = 15000) {
  let last = null, since = Date.now();
  for (const deadline = Date.now() + timeout; Date.now() < deadline; await delay(150)) {
    const now = await page.evaluate((s) => document.querySelector(s)?.innerHTML ?? null, selector);
    if (now !== last) { last = now; since = Date.now(); } else if (Date.now() - since >= quiet) return;
  }
}
const sheetState = (page) => page.evaluate(() => ({
  reading: document.querySelector('#sheet .reading')?.textContent ?? null,
  active: [...document.querySelectorAll('#sheet .dictionary-homograph.active')].map((row) => row.dataset.dictionaryEntry),
}));

async function readerCases(page) {
  for (const pair of PAIRS) {
    await openArticle(page, pair.at);
    const { first, settled } = await slip(page, tok(page, pair.index));
    const expected = pair.core ? { reading: core[pair.s].r, gloss: core[pair.s].m[0] } : { reading: pair.r, gloss: firstGloss(pair.seq, pair.r) };
    check(`A1.${pair.name}`, `the card for ${pair.s} in ${pair.at.id} reads ${pair.r} and means "${expected.gloss}"`,
      settled?.word === pair.s && k2h(settled.reading) === k2h(pair.r) && k2h(settled.reading) === k2h(expected.reading)
        && settled.gloss === expected.gloss && settled.take && !settled.take.disabled, { first, settled });
    if (pair === PAIRS[0]) {
      record('R.first-paint', 'the first paint of 年 (the full dictionary may still be opening)', first);
      // A2 · the second tap opens the entry the card stood for
      await tapAt(page, tok(page, pair.index));
      await page.locator('#sheet').waitFor({ timeout: 20000 });
      let entry = await sheetState(page);
      for (const deadline = Date.now() + 15000; Date.now() < deadline && !(entry.reading === pair.r && entry.active.includes(pair.seq)); await delay(200))
        entry = await sheetState(page);
      check('A2.entry', `the second tap opens entry ${pair.seq}, read ${pair.r}`, entry.reading === pair.r && entry.active.includes(pair.seq), entry);
      await page.keyboard.press('Escape');
      await delay(300);
    }
  }
}

async function captureCase(browser, contextOptions) {
  const context = await browser.newContext(contextOptions);
  await silenceBrowserAudio(context);
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
  const page = await context.newPage();
  // L · Save unfolds its menu inside the card: the path WebKit used to raise its ResizeObserver page error on
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let exported = null;
  try {
    await openArticle(page, STARTUP);
    const { settled } = await slip(page, tok(page, 2));
    check('A3.ready', 'the card for 年 in 令和8年 offers Save', settled?.reading === 'ねん' && settled.take && !settled.take.disabled, settled);
    await page.locator('#mini #mini-take').click();
    const saved = await waitForAppRecord(page, (rec) => (rec.taken || []).some((row) => row.t === 'word' && row.id === '年'),
      { description: 'the 年 card', timeout: 15000 });
    const row = saved.taken.find((r) => r.t === 'word' && r.id === '年'), snap = saved.deepWords?.['年'];
    check('A3.capture', 'Save keeps entry 2084840 and the reading shown (cueReading ねん), with its validated selection',
      row?.entrySeq === '2084840' && row.cueReading === 'ねん' && snap?.seq === '2084840' && snap.r === 'ねん' && snap.selection?.r === 'ねん'
        && snap.selection?.seq === '2084840', { row, snap });
    await page.keyboard.press('Escape');
    await closeMini(page);
    if (!(await page.locator('#note-input').count())) await page.locator('#tray').click();
    const download = page.waitForEvent('download', { timeout: 15000 });
    await page.locator('#export-store').click();
    const stream = await (await download).createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    exported = Buffer.concat(chunks);
  } finally {
    check('capture.page-errors', 'capture (Save, its menu unfolding in the card, export): no page errors', errors.length === 0, errors);
    await context.close();
  }
  const fresh = await browser.newContext(contextOptions);
  await silenceBrowserAudio(fresh);
  await fresh.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
  try {
    const page = await fresh.newPage();
    await boot(page);
    if (!(await page.locator('#note-input').count())) await page.locator('#tray').click();
    await page.evaluate(() => { window.__readingTruthDocument = 1; });
    await page.locator('#import-file').setInputFiles({ name: 'reading-truth.json', mimeType: 'application/json', buffer: exported });
    await page.waitForFunction(() => window.__readingTruthDocument !== 1, null, { timeout: 20000 });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
    const back = await waitForAppRecord(page, (rec) => (rec.taken || []).some((row) => row.t === 'word' && row.id === '年'),
      { description: 'the imported 年 card', timeout: 15000 });
    const row = back.taken.find((r) => r.t === 'word' && r.id === '年'), snap = back.deepWords?.['年'];
    check('A3.round-trip', 'export → import keeps entry 2084840, cueReading ねん and the snapshot',
      row?.entrySeq === '2084840' && row.cueReading === 'ねん' && snap?.seq === '2084840' && snap.r === 'ねん', { row, snap });
  } finally { await fresh.close(); }
}

async function stableCases(page) {
  await boot(page);
  await openShelfTools(page);
  await page.fill('#search', '年');
  await page.waitForSelector('#search-results [data-result="word:年"]', { timeout: 20000 });
  await page.locator('#search-results [data-result="word:年"]').first().click();
  await page.locator('#sheet').waitFor({ timeout: 15000 });
  await delay(800);
  const words = await sheetState(page);
  check('A4.words', 'Words search 年 (no reading of its own) opens the quick dictionary\'s 年, read とし', words.reading === core['年'].r, words);
  await openArticle(page, STARTUP);
  const { settled } = await slip(page, tok(page, STABLE.index));
  check('A4.reads-like-core', '総理 (read like the quick dictionary) is the quick dictionary\'s card, unchanged',
    settled?.reading === 'そうり' && settled.gloss === core['総理'].m[0] && settled.take && !settled.take.disabled, settled);
  const startup = await slip(page, tok(page, STARTUP_WORD.index));
  check('A8.startup', 'スタートアップ, missing from the quick dictionary, is the full dictionary\'s card: startup, Save live',
    startup.settled?.gloss === STARTUP_WORD.gloss && startup.settled.take && !startup.settled.take.disabled && !startup.settled.reason, startup);
  const name = await slip(page, tok(page, NAME.index));
  check('A8.no-entry', '高市 says it has no entry, and its Save says only that it cannot be saved here',
    name.settled?.gloss === NO_ENTRY && name.settled.take?.disabled && name.settled.reason === SAVE_REASON, name.settled);
  for (const fixture of RECORDED.filter((f) => f.at === STARTUP)) record(`R.${fixture.name}`, fixture.name, (await slip(page, tok(page, fixture.index))).settled);
  await openArticle(page, CABINET);
  for (const fixture of RECORDED.filter((f) => f.at === CABINET)) record(`R.${fixture.name}`, fixture.name, (await slip(page, tok(page, fixture.index))).settled);
  await closeMini(page);
}

async function sentenceCase(page) {
  // an entry's 用例 carry the reader's grammar. 月's entry, opened from 9月 in the startup article (its text is then
  // loaded, so its dated sentence is among the examples), shows 年 counting years as a door
  await openArticle(page, STARTUP);
  await slip(page, tok(page, 4));
  await tapAt(page, tok(page, 4));
  await page.locator('#sheet').waitFor({ timeout: 15000 });
  const year = page.locator('#sheet .example-ja .sentence-tok').filter({ hasText: /^年$/u });
  await year.first().waitFor({ timeout: 20000 });
  await stillFor(page, '#sheet');
  const counting = await year.evaluateAll((nodes) => nodes.findIndex((node) => /[0-9０-９〇一二三四五六七八九十]$/u.test(node.previousSibling?.textContent || '')));
  check('A5.found', 'a 用例 under 月 counts a year (a numeral, then 年)', counting >= 0, counting);
  if (counting < 0) return;
  const { settled } = await slip(page, year.nth(counting));
  check('A5.sentence', 'that 年 reads ねん, the entry read that way, Save live', settled?.reading === 'ねん'
    && settled.gloss === firstGloss('2084840', 'ねん') && settled.take && !settled.take.disabled, settled);
  await closeMini(page);
}

/** A9 · the cold first tap (L, 2026-10-16): until the full dictionary names the entry a card's own reading stands for,
 * the card borrows no other reading's meaning. The full dictionary's index is held; 月 in 9月 (read がつ; the quick
 * dictionary's 月 reads つき, "Moon") is tapped, and every text the card's meaning line ever shows is recorded in the page.
 * Held: the line is a quiet "…" and Save is held. Released: がつ's meaning, Save live. Answered with a 500: the "…" stays. */
const INDEX_PATH = '/data/share_alike/dict-v2/index.json';
async function coldCase(browser, contextOptions, answer) {
  const tag = answer === 'fail' ? 'A9.unanswered' : 'A9.cold';
  const context = await browser.newContext(contextOptions);
  await silenceBrowserAudio(context);
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
  let release = () => {}, asked = 0;
  const gate = new Promise((done) => { release = done; });
  await context.route((url) => url.pathname === INDEX_PATH, async (route) => {
    asked += 1;
    await gate;
    try {
      if (answer === 'fail') await route.fulfill({ status: 500, contentType: 'application/json', body: '{"syntheticFailure":"verify-reading-truth A9"}' });
      else await route.continue();
    } catch { /* the context closed first */ }
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const meaning = firstGloss(COLD.seq, COLD.r);
  try {
    await openArticle(page, COLD.at);
    await closeMini(page);
    await page.evaluate(() => {
      window.__readingTruthGlosses = [];
      const seen = () => {
        for (const node of document.querySelectorAll('#mini .mini-gloss')) {
          if (window.__readingTruthGlosses.at(-1) !== node.textContent) window.__readingTruthGlosses.push(node.textContent);
        }
      };
      new MutationObserver(seen).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await tapAt(page, tok(page, COLD.index));
    await page.locator('#mini').waitFor({ timeout: 20000 });
    for (let attempt = 0; attempt < 80 && !asked; attempt++) await delay(250);
    const held = await miniState(page);
    const line = await page.evaluate(() => {
      const node = document.querySelector('#mini .mini-gloss');
      return node ? { className: node.className, color: node.style.color, weight: node.style.fontWeight,
        busy: document.getElementById('mini').getAttribute('aria-busy'),
        describedBy: document.querySelector('#mini #mini-take')?.getAttribute('aria-describedby') ?? null } : null;
    });
    // L · while the right entry is on its way the Save area is the held Save alone: no D23 sentence, nothing it points to
    check(`${tag}.held`, 'with the full dictionary held, the card for 月 in 9月 reads がつ, its meaning line is a quiet "…" (the world\'s muted ink), Save is held and says nothing',
      asked > 0 && held?.word === '月' && k2h(held.reading) === 'がつ' && held.gloss === '…' && line?.className === 'mini-gloss mini-wait'
        && line.color === 'var(--mini-head-ink-2)' && line.weight === '400' && line.busy === 'true' && held.take?.disabled === true
        && held.reason === null && line.describedBy === null, { asked, held, line });
    await delay(1200);
    const still = await miniState(page);
    check(`${tag}.still`, 'a moment later, still held, it still borrows nothing and still says nothing',
      still?.gloss === '…' && still.take?.disabled === true && still.reason === null, still);
    release();
    await page.waitForFunction(() => document.getElementById('mini')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 });
    await delay(300);
    const settled = await miniState(page);
    if (answer === 'fail') {
      // the same run: a dead end (the dictionary cannot answer) keeps D23's sentence, and the held Save points to it
      const describedBy = await page.locator('#mini #mini-take').getAttribute('aria-describedby');
      check(`${tag}.settled`, 'unanswered (the index answers 500): the "…" stays, Save stays held, and now it says why (D23\'s sentence) — never つき\'s meaning',
        k2h(settled?.reading) === 'がつ' && settled.gloss === '…' && settled.take?.disabled === true && UNCONFIRMED.includes(settled.reason)
          && describedBy === 'mini-take-reason', { settled, describedBy });
    } else {
      check(`${tag}.settled`, `released: the card fills with がつ's meaning ("${meaning}"), Save live`,
        k2h(settled?.reading) === 'がつ' && settled.gloss === meaning && settled.take && !settled.take.disabled, settled);
    }
    const shown = await page.evaluate(() => window.__readingTruthGlosses);
    const allowed = answer === 'fail' ? ['…'] : ['…', meaning];
    check(`${tag}.never-borrowed`, `the meaning line never showed another reading's meaning (the quick dictionary's つき: "${core['月'].m[0]}")`,
      shown.length > 0 && shown.every((text) => allowed.includes(text)), shown);
  } catch (error) {
    check(`${tag}.error`, `${tag} ran to the end`, false, String(error.stack || error).slice(0, 600));
  } finally {
    release();
    check(`${tag}.page-errors`, `${tag}: no page errors`, errors.length === 0, errors);
    await context.close();
  }
}

/** A10 · a word no entry is read for (N, 2026-10-17; Codex 0304): the cold first tap on Kawaguchi's 訳 (やく) settles,
 * in the same card, to "No dictionary entry for this reading." once the held full dictionary answers; its meaning line
 * never shows わけ's "reason"; the second tap's page shows no meaning. */
async function unreadCase(browser, contextOptions) {
  const tag = 'A10';
  const context = await browser.newContext(contextOptions);
  await silenceBrowserAudio(context);
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
  let release = () => {}, asked = 0;
  const gate = new Promise((done) => { release = done; });
  await context.route((url) => url.pathname === INDEX_PATH, async (route) => {
    asked += 1;
    await gate;
    try { await route.continue(); } catch { /* the context closed first */ }
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const other = core['訳']?.m?.[0];
  try {
    await openArticle(page, UNREAD.at);
    await closeMini(page);
    await page.evaluate(() => {
      window.__readingTruthGlosses = [];
      const seen = () => {
        for (const node of document.querySelectorAll('#mini .mini-gloss')) {
          if (window.__readingTruthGlosses.at(-1) !== node.textContent) window.__readingTruthGlosses.push(node.textContent);
        }
      };
      new MutationObserver(seen).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await tapAt(page, tok(page, UNREAD.index));
    await page.locator('#mini').waitFor({ timeout: 20000 });
    for (let attempt = 0; attempt < 80 && !asked; attempt++) await delay(250);
    const held = await miniState(page);
    check(`${tag}.held`, 'with the full dictionary held, the card for 訳 reads やく, its meaning line is a quiet "…", Save is held and says nothing',
      asked > 0 && held?.word === '訳' && k2h(held.reading) === 'やく' && held.gloss === '…' && held.take?.disabled === true && held.reason === null,
      { asked, held });
    release();
    await page.waitForFunction(() => document.getElementById('mini')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 });
    await delay(600);
    const settled = await miniState(page);
    check(`${tag}.settled`, `answered, the same card — no second tap — says "${NO_READING}", reads やく, its Save held with "${SAVE_REASON}"`,
      k2h(settled?.reading) === 'やく' && settled.gloss === NO_READING && settled.take?.disabled === true && settled.reason === SAVE_REASON, settled);
    const shown = await page.evaluate(() => window.__readingTruthGlosses);
    check(`${tag}.never-borrowed`, `the meaning line never showed わけ's meaning ("${other}")`,
      shown.length > 0 && shown.every((text) => ['…', NO_READING].includes(text)), shown);
    await page.locator('#mini .mini-word').click();
    await page.locator('#sheet').waitFor({ timeout: 20000 });
    await delay(800);
    const sheet = await page.evaluate(() => {
      const node = document.getElementById('sheet');
      return node ? { head: node.querySelector('.headword')?.textContent ?? null, reading: node.querySelector('.reading')?.textContent ?? null,
        absent: node.querySelector('.gloss.absent')?.textContent ?? null, senses: node.querySelectorAll('.senses, .sense-list').length } : null;
    });
    check(`${tag}.page`, 'the second tap\'s page is 訳 read やく and shows no meaning (no senses; its plain no-gloss line)',
      sheet?.head === '訳' && k2h(sheet.reading) === 'やく' && !!sheet.absent && sheet.senses === 0, sheet);
  } catch (error) {
    check(`${tag}.error`, `${tag} ran to the end`, false, String(error.stack || error).slice(0, 600));
  } finally {
    release();
    check(`${tag}.page-errors`, `${tag}: no page errors`, errors.length === 0, errors);
    await context.close();
  }
}

async function deckCase(page) {
  const file = json('decks/kotoba-mcd/tokens.json');
  await boot(page, '?deck=mcd&ui=bi');
  await page.locator('#kp-start').click();
  let tried = 0;
  for (; tried < 20; tried++) {
    if (await page.locator('#kp-reveal').count()) await page.locator('#kp-reveal').click();
    else if (await page.locator('.kp-choice').count()) await page.locator('.kp-choice').first().click();
    await page.locator('#kp-card .kp-sentence .kp-tok').first().waitFor({ timeout: 15000 });
    const id = await page.locator('#kp-card').getAttribute('data-card');
    const passage = file.passages?.[file.cards?.[id]] || [];
    const surfaces = passage.map(([s]) => s);
    // every word on this back the deck reads otherwise than the quick dictionary (uninflected, once on the card)
    const candidates = passage.filter(([s, b = '', r = '', k = '', ref = '']) => k === '語' && (!b || b === s) && r
      && core[ref || s] && k2h(core[ref || s].r) !== k2h(r) && surfaces.filter((x) => x === s).length === 1);
    // a revealed word wears its ruby: it is found by its own text, the rt set aside; the card's own word (its note
    // stands where Save would) is not the case here
    const hitIndex = candidates.length ? await page.evaluate((wanted) => {
      const all = [...document.querySelectorAll('#kp-card .kp-sentence .kp-tok:not(.kp-target)')];
      const own = (node) => { const copy = node.cloneNode(true); copy.querySelectorAll('rt, rp').forEach((n) => n.remove()); return copy.textContent; };
      for (let i = 0; i < wanted.length; i++) {
        const hit = all.find((node) => own(node) === wanted[i]);
        if (hit) { hit.dataset.readingTruth = 'target'; return i; }
      }
      return -1;
    }, candidates.map(([s]) => s)) : -1;
    if (hitIndex >= 0) {
      const pick = candidates[hitIndex];
      const [s, , r] = pick;
      const target = page.locator('[data-reading-truth="target"]');
      const one = await slip(page, target);
      check('A6.deck', `a deck back's ${s}, read ${r} by the deck (the quick dictionary reads ${core[pick[4] || s].r}), shows ${r}`,
        k2h(one.first?.reading) === k2h(r) && k2h(one.settled?.reading) === k2h(r), { card: id, token: pick, ...one });
      // the tap asked the full dictionary: a later look stands for the entry read that way, with Save live
      let two = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        await closeMini(page);
        await delay(800);
        two = (await slip(page, target)).settled;
        if (two?.take && !two.take.disabled) break;
      }
      check('A6.deck-entry', `a later look at ${s} is the full dictionary's entry read ${r}, Save live`,
        k2h(two?.reading) === k2h(r) && two.take && !two.take.disabled, two);
      await closeMini(page);
      return;
    }
    await page.locator('#kp-grade-good').click();
    await delay(400);
  }
  check('A6.deck', 'a deck back within 20 cards carries a word the deck reads otherwise than the quick dictionary', false, `${tried} cards`);
}

async function guidedCase(page) {
  await boot(page);
  await page.locator('#chrome-dojo').click();
  await page.locator('[data-study-door="guided"]').click();
  await page.locator('.guided-room [data-action="setup"]').first().click();
  await page.locator('.guided-room [data-action="start"]').first().click();
  const q = guided.questions[0];
  await page.locator(`.guided-room [name="answer"][value="${q.correct}"]`).check();
  await page.locator('.guided-room [data-action="check"]').first().click();
  await page.locator('.guided-room [data-action="explain"]').first().click();
  const doors = page.locator('.guided-room .gs-word[data-action="word"]');
  await doors.first().waitFor({ timeout: 15000 });
  const count = Math.min(await doors.count(), 4);
  const seen = [];
  for (let n = 0; n < count; n++) {
    const key = await doors.nth(n).getAttribute('data-word');
    // the room's band can lie over a door at this width: the keyboard reaches each door as a finger would
    const { settled } = await slip(page, doors.nth(n), { keyboard: true });
    seen.push({ key, word: guided.words[key], settled });
  }
  check('A7.guided', 'every guided word\'s card reads as the session reads it', count > 0
    && seen.every(({ word, settled }) => k2h(settled?.reading) === k2h(word?.reading)), seen);
  await closeMini(page);
}

try {
  if (!F0_OK) throw new Error('F0: the served fixtures moved; nothing below would mean what it says');
  for (engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    const contextOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      serviceWorkers: 'block', reducedMotion: 'reduce' };
    const each = async (name, body) => {
      const context = await browser.newContext(contextOptions);
      await silenceBrowserAudio(context);
      await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(15000);
      // L · every page error counts: the ResizeObserver loop error this line used to drop (R) was the slip's own
      // observer resizing the card inside its callback, fixed at its source (keepFloatingBeside)
      page.on('pageerror', (error) => errors.push(error.message));
      try { await body(page); }
      catch (error) {
        check(`${name}.error`, `${name} ran to the end`, false, String(error.stack || error).slice(0, 600));
        await page.screenshot({ path: resolve(evidence, `${engine}-${name}.png`), fullPage: false }).catch(() => {});
      } finally {
        check(`${name}.page-errors`, `${name}: no page errors`, errors.length === 0, errors);
        await context.close();
      }
    };
    await each('reader', readerCases);
    await each('stable', stableCases);
    await each('sentence', sentenceCase);
    await each('deck', deckCase);
    await each('guided', guidedCase);
    try { await captureCase(browser, contextOptions); }
    catch (error) { check('capture.error', 'capture ran to the end', false, String(error.stack || error).slice(0, 600)); }
    for (const answer of ['held', 'fail']) {
      try { await coldCase(browser, contextOptions, answer); }
      catch (error) { check(`A9.${answer}.error`, `A9 (${answer}) ran to the end`, false, String(error.stack || error).slice(0, 600)); }
    }
    try { await unreadCase(browser, contextOptions); }
    catch (error) { check('A10.error', 'A10 ran to the end', false, String(error.stack || error).slice(0, 600)); }
    await browser.close();
  }
} finally {
  await host.close();
  const failed = rows.filter((row) => !row.recorded && !row.ok);
  writeFileSync(resolve(evidence, 'verify-reading-truth.json'), `${JSON.stringify({ site, served: identity.gitSha, artifactSha256: identity.artifactSha256,
    engines, failed: failed.length, rows }, null, 2)}\n`);
  console.log(`\n${rows.filter((row) => !row.recorded).length - failed.length} passed, ${failed.length} failed, ${rows.filter((row) => row.recorded).length} recorded · evidence ${evidence}`);
  process.exitCode = failed.length ? 1 : 0;
}
