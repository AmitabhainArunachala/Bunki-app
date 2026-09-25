/**
 * Reader gloss doors (D11): a core miss says so on the quick look; the full-entry door matches
 * the token's base form instead of opening the deep index's first row (kanji base form → rows
 * that write it exactly; kana base form → rows whose primary reading it is; neither → token.r);
 * and a token the core dictionary lacks is never captured from the reader.
 *
 * Why 覚 is held even where one row opens directly (the spec said "open it as today"): the
 * capture path stores the entry's seq, but a card is keyed by the spelling and reviewBack()
 * looks that spelling up WITHOUT the seq. Once the index holds the form's rows it answers with
 * their first row, so a いう card would be reviewed as 結う. reviewBack() is left alone here.
 *
 * Fixtures are literals, read at 9ceb139e by a read-only Node script over the article JSON,
 * data/share_alike/dict.json, words.json and dict-v2/index.json. F0 re-reads the served bytes;
 * a fixture that no longer holds fails, it is never skipped.
 *   wikinews:12024 (JRおおさか東線部分開業) #445 厳しい/厳しい/きびしい: core hit, first sense "severe"
 *   wikinews:12024 #447 いう/いう/いう: core miss, words.json gloss "" (…収支見込は厳しいという見方もある)
 *   wikinews:12024 #443 見込/見込/みこみ: core miss; its one row read みこみ is 見込み 1604480
 *   aozora:051034 (野ばら) #256 だれ/だれ/だれ: core miss (…国境のところには、だれが植えた…)
 *   real-hojoki (方丈記) #167 ひ/ひ/ひ: core miss; a tokenizer split of ならひ, which stays open
 *   bunki-essay-n2-handwriting #139 分かっ/分かる/わかっ: conjugated core miss (…三か月続けて分かったのは)
 *   aozora:051034 #656 いっ/いう/いっ: conjugated core miss (…と、老人はいって、大きな)
 * Deep rows for the form, index order: いう → 結う 1254600 (read ゆう), 言う 1587040 (read いう);
 * だれ → たれ/垂れ 1370860 (read たれ), 誰 1416830 (だれ), ダレ 2665140 (ダレ); ひ → 8 rows read ひ;
 * 分かる → 1606560 alone. いう has exactly ONE row read いう, so its long hold takes the one-row
 * branch and opens 言う directly (G3a); the chooser itself is exercised on だれ (G3b) and its cap
 * of 6 on ひ (G3c).
 *
 *   G0 identity: the served build is the expected clean commit, and corridor.js and corridor.css
 *      hash to build-identity.json. A failure stops the run. F0: the fixtures hold in served data.
 *   G1 tap 2 on a core hit is unchanged: 厳しい gains exactly <span class="tok-en">severe</span>,
 *      its label and mini are the core record's, its mini 覚 and the chrome seal stay enabled and
 *      unheld, and its long hold opens the ordinary entry.
 *      Control: drop readerEntryNode's D.dict test and the core entry grows the match note and a
 *      held 覚; drop readerQuickRecord's and the tap-2 line becomes the word layer's
 *      "hard; rigorous; strict" instead of the core's "severe"; drop readerTakeHeld's D.dict test
 *      and the core hit's chrome seal turns aria-disabled.
 *   G2 a core miss says so: いう's tap 2 adds <span class="tok-en tok-en-miss">—</span>, and its
 *      label and mini say "Not in the quick dictionary — hold for the full dictionary"
 *      (ja: この語は簡易辞書にありません・長押しで全辞書); tap 3 clears it.
 *      Control: HEAD 9ceb139e adds nothing on tap 2, and its mini says "(no gloss yet)".
 *   G3 the long hold never opens a homophone.
 *      a. いう opens 言う 1587040 directly: headword いう／言う・云う・謂う, reading いう, first gloss
 *         "to say"; no candidate is offered, and 結う is never opened or offered.
 *         Control: HEAD opens rows[0] = 結う (headword いう／結う, first gloss "to do up (hair)").
 *      b. だれ lists 誰 1416830 then ダレ 2665140 as native buttons, both read だれ; たれ/垂れ
 *         (read たれ) is never offered and nothing opens by itself. A real click on 誰 opens it
 *         (headword だれ／誰, reading だれ, first gloss "who"); 戻る by pointer and by keyboard
 *         returns to the chooser with focus on 誰's button.
 *         Control: HEAD opens rows[0] = 垂れ, "sauce (esp. soy or mirin-based dipping sauce)".
 *      c. ひ has 8 rows read ひ: exactly the first 6 in index order, and "Showing 6 of 8 candidates".
 *         Control: HEAD opens rows[0] = 火 with no chooser.
 *   G4 the index answers 500: the long hold on いう shows the honest unavailable state (no entry,
 *      no candidate, 覚 held) and the fault demonstrably fired; the core hit still glosses and いう
 *      still says its honest miss; once the fault clears, the retry opens 言う. Stale answers: with
 *      the index held, いう's sheet is closed and 見込's opened; the release paints 見込み 1604480
 *      and never 言う.
 *      Control: HEAD tells いう, which has no gloss, "The immediate gloss is available, but the
 *      complete entry could not be opened."; a resolver that opened its answer with go() from the
 *      async callback would push 言う over 見込's sheet.
 *   G5 none of it touches the learning record: the durable record's taken, lists, srs, revlog,
 *      deepWords, suspended, teacherContexts, assessmentLearning and sentencePractice equal the
 *      snapshot taken before any gesture, checked after the いう paths (G2, G3a) and again after the
 *      だれ paths (G3b). Real clicks land on every held 覚: the miss-state mini's (disabled, reason
 *      shown in the mini), the chrome seal while いう is selected (aria-disabled; it opens the
 *      reason in the capture panel, which holds no capture control), the sheet bar's and the
 *      entry foot's; the only new rows are the reader's existing 'tap' observations.
 *      Control: on HEAD the mini's 覚 is enabled, and the first click captures word:いう with an
 *      empty deepWords.いう snapshot (the chrome seal would capture it just the same, and the いう
 *      sheet's 覚 with entrySeq 1254600, 結う), so the first comparison fails.
 *   G6 a conjugated token finds its word through its base form, by a long hold.
 *      a. 分かっ (base 分かる, kanji): the one row that writes 分かる, 1606560, opens directly
 *         (match by spelling): headword 分かる／解る・判る・分る・理解る, reading わかる, first gloss
 *         "to understand".
 *         Control: the pre-change token.r rule of this patch's first draft says "No dictionary
 *         entry is read わかっ."; HEAD opens the same row with no match note and an enabled 覚.
 *      b. いっ (base いう, kana): the one row read いう, 言う 1587040, opens directly (match by
 *         reading), never 結う.
 *         Control: HEAD opens rows[0] = 結う; the token.r draft says "No dictionary entry is read いっ."
 *
 * Each case runs in its own browser context and fails on its own; a missing fixture element fails
 * its case and never skips it. Every gesture on a token or a sheet control is a real pointer at
 * that element's own centre, checked with elementFromPoint, never locator.click: Playwright
 * retries a locator click that another element would receive, which hides exactly the
 * interception defects these doors had. Service workers are blocked, so every dictionary request
 * reaches the routed network.
 *
 * Usage: node verify-reader-gloss.mjs   (KAIRO_SITE_DIR may pin a staged artifact)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';

import { chromium } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');

const SITE = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
const results = [];
const pageErrors = [];
const faults = { index500: 0, indexHeld: 0 };
let currentCase = 'setup';
const check = (name, pass, detail = '') => {
  results.push({ case: currentCase, name, pass: !!pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
};
/** A missing fixture element fails its case; nothing is skipped. */
const must = (value, what) => {
  if (!value) throw new Error(`missing: ${what}`);
  return value;
};
const hira = (text) => String(text || '').replace(/[ァ-ヶ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/* ------------------------------------------------------------------ fixtures */
const NEWS = { id: 'wikinews:12024', file: 'wikinews-12024.json' };
const NOBARA = { id: 'aozora:051034', file: 'aozora-051034.json' };
const HOJOKI = { id: 'real-hojoki', file: 'real-hojoki.json' };
const CORE = { passage: NEWS, index: 445, s: '厳しい', b: '厳しい', r: 'きびしい', gloss: 'severe' };
const IU = { passage: NEWS, index: 447, s: 'いう', b: 'いう', r: 'いう' };
const MIKOMI = { passage: NEWS, index: 443, s: '見込', b: '見込', r: 'みこみ' };
const DARE = { passage: NOBARA, index: 256, s: 'だれ', b: 'だれ', r: 'だれ' };
const HI = { passage: HOJOKI, index: 167, s: 'ひ', b: 'ひ', r: 'ひ' };
const HANDWRITING = { id: 'bunki-essay-n2-handwriting', file: 'bunki-essay-n2-handwriting.json' };
const WAKAT = { passage: HANDWRITING, index: 139, s: '分かっ', b: '分かる', r: 'わかっ' };
const ITT = { passage: NOBARA, index: 656, s: 'いっ', b: 'いう', r: 'いっ' };
const MISSES = [IU, MIKOMI, DARE, HI];
/** [seq, primary reading] of every deep row carrying the form, by seq */
const FORM_ROWS = {
  いう: [['1254600', 'ゆう'], ['1587040', 'いう']],
  見込: [['1604480', 'みこみ']],
  だれ: [['1370860', 'たれ'], ['1416830', 'だれ'], ['2665140', 'ダレ']],
  分かる: [['1606560', 'わかる']],
};
const WAKARU_ENTRY = { seq: '1606560', headword: '分かる／解る・判る・分る・理解る', reading: 'わかる', gloss: 'to understand' };
const IU_ENTRY = { seq: '1587040', headword: 'いう／言う・云う・謂う', reading: 'いう', gloss: 'to say' };
const YUU_SEQ = '1254600';
const MIKOMI_SEQ = '1604480';
const DARE_CHOICES = [
  { seq: '1416830', head: '誰', reading: 'だれ', gloss: 'who' },
  { seq: '2665140', head: 'ダレ', reading: 'ダレ', gloss: 'undercut (of a machined edge)' },
];
const TARE_SEQ = '1370860';
const DARE_ENTRY = { seq: '1416830', headword: 'だれ／誰', reading: 'だれ', gloss: 'who' };
const HI_FIRST_SIX = ['1193610', '1463770', '1482860', '1483520', '1484590', '1484710'];
const HI_TOTAL = 8;

/* the app's own words, bilingual chrome (ui=bi) unless a check says ja */
const MISS = { bi: 'Not in the quick dictionary — hold for the full dictionary', ja: 'この語は簡易辞書にありません・長押しで全辞書' };
const WORD = { bi: 'word', ja: '語' };
const HINT = { bi: 'a third activation clears; hold for the full entry; focus for more actions', ja: '三回目で元どおり。長押しで全項目。フォーカスで別の操作。' };
const CHOOSER_TITLE = { ja: '候補から選ぶ（この文での意味は確かめてください）', en: 'Choose the word — check it fits this sentence' };
const UNAVAILABLE = 'The full dictionary could not be opened, so no entry can be matched to this word. The reader and its quick dictionary still work.';
const CAPTURE_REASON = (spelling) => `覚 is off for this word: it has no quick-dictionary entry, so a card saved under the spelling ${spelling} could be answered on review with no meaning or another word's.`;
const LEARNING_ROOTS = ['taken', 'lists', 'srs', 'revlog', 'deepWords', 'suspended', 'teacherContexts', 'assessmentLearning', 'sentencePractice'];
const INDEX_PATH = '/data/share_alike/dict-v2/index.json';
const isIndex = (url) => url.pathname === INDEX_PATH;

/* ------------------------------------------------------------------- browser */
const ready = (page) => page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
let host = null, origin = null, browser = null;

async function newContext() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  context.on('page', (page) => page.on('pageerror', (error) => {
    if (pageErrors.length < 20) pageErrors.push({ case: currentCase, message: error.message });
  }));
  return context;
}

async function openArticle(page, passage, query = 'dials=0,1,0&ui=bi') {
  await page.goto(`${origin}/index.html?entry=shelf&${query}`); await ready(page);
  const door = page.locator(`[data-passage="${passage.id}"]:not([data-recommendation]) .shelf-open`).first();
  must(await door.count(), `the shelf door for ${passage.id}`);
  await door.click();
  await page.waitForFunction((pid) => document.querySelector('.listen-row')?.dataset.passage === pid && document.querySelector('#reader .tok'),
    passage.id, { timeout: 15_000 });
  // the article text arrives on its own and re-renders once: a hold begun on the first render dies
  let previous = -1;
  for (let attempt = 0; attempt < 40; attempt++) {
    const count = await page.locator('#reader .tok').count();
    if (count > 0 && count === previous) return;
    previous = count;
    await delay(300);
  }
  throw new Error(`the reader tokens of ${passage.id} never settled`);
}

/** The centre of one element, which must be the element itself (or inside it). The sticky
 * chrome is never scrolled to: it is on screen wherever the reader stands. */
async function ownCentre(locator, what, { scroll = true } = {}) {
  must(await locator.count() === 1, what);
  if (scroll) await locator.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await delay(120);
  const probe = await locator.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, own: !!hit && (hit === node || node.contains(hit)), word: node.dataset.word ?? null,
      hit: hit ? `${hit.tagName.toLowerCase()}.${[...hit.classList].join('.')}` : null };
  });
  must(probe.own, `${what}: its centre is the element itself (hit ${probe.hit})`);
  return probe;
}

async function tokenCentre(page, fixture) {
  const probe = await ownCentre(page.locator(`#reader .tok[data-index="${fixture.index}"]`), `${fixture.passage.id} token #${fixture.index}`);
  must(probe.word === fixture.b, `${fixture.passage.id} token #${fixture.index} is ${fixture.b} (found ${probe.word})`);
  return probe;
}
async function tap(page, fixture) {
  const { x, y } = await tokenCentre(page, fixture);
  await page.mouse.click(x, y);
  await delay(150);
}
async function hold(page, fixture, ms) {
  const { x, y } = await tokenCentre(page, fixture);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
/** past the mini (430 ms), short of the entry (2100 ms); the release click is inert for 800 ms */
const quickHold = async (page, fixture) => { await hold(page, fixture, 800); await delay(900); };
/** a word sheet opens on a 2.4 s press-and-hold, as a finger does it */
const longHold = (page, fixture) => hold(page, fixture, 2400);
async function press(page, selector, options) {
  const { x, y } = await ownCentre(page.locator(selector), selector, options);
  await page.mouse.click(x, y);
  await delay(150);
}
const pressSeal = (page) => press(page, '#reader-take', { scroll: false });

/** The reader's capture doors: the chrome seal, its panel, and the mini's 覚 when open. */
const captureState = (page) => page.evaluate(() => {
  const visible = (node) => {
    if (!node) return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden';
  };
  const seal = document.getElementById('reader-take');
  const panel = document.getElementById('capture-panel');
  const mini = document.getElementById('mini');
  const miniTake = mini?.querySelector('#mini-take');
  const miniReason = mini?.querySelector('#mini-take-reason');
  return {
    seal: seal && { disabled: seal.disabled, ariaDisabled: seal.getAttribute('aria-disabled'),
      held: seal.classList.contains('reader-capture-held'), pressed: seal.getAttribute('aria-pressed'), label: seal.getAttribute('aria-label') },
    panel: panel && { reason: panel.querySelector('#reader-take-reason')?.textContent ?? null,
      reasonVisible: visible(panel.querySelector('#reader-take-reason')),
      captureControls: panel.querySelectorAll('#take, .take, .context-picker, .list-picker').length },
    mini: mini && { takeDisabled: miniTake ? miniTake.disabled : null, takePressed: miniTake?.getAttribute('aria-pressed') ?? null,
      held: !!miniTake?.classList.contains('reader-capture-held'), describedBy: miniTake?.getAttribute('aria-describedby') ?? null,
      reason: miniReason?.textContent ?? null, reasonVisible: visible(miniReason) },
  };
});
async function closeSheet(page) {
  await press(page, '#sheet-close');
  await page.waitForFunction(() => !document.getElementById('sheet'), null, { timeout: 5_000 });
}

const tokenState = (page, fixture) => page.evaluate((index) => {
  const node = document.querySelector(`#reader .tok[data-index="${index}"]`);
  if (!node) return null;
  const lines = node.querySelectorAll('.tok-en');
  return { lines: lines.length, line: lines[0]?.outerHTML ?? null, hasEn: node.classList.contains('has-en'),
    label: node.getAttribute('aria-label') || '' };
}, fixture.index);

const miniState = (page) => page.evaluate(() => {
  const mini = document.getElementById('mini');
  if (!mini) return null;
  return { gloss: mini.querySelector('.mini-gloss')?.outerHTML ?? null,
    reading: mini.querySelector('.mini-reading')?.textContent ?? null, text: mini.textContent };
});

/** Wait for a word sheet to finish: an entry with its senses in, or the chooser past pending. */
const settleSheet = (page, timeout = 30_000) => page.waitForFunction(() => {
  const sheet = document.getElementById('sheet');
  if (!sheet || sheet.querySelector('.dictionary-opening')) return false;
  const state = sheet.querySelector('#reader-choice')?.dataset.state;
  return state ? state !== 'pending' : !!sheet.querySelector('.senses, .gloss.absent');
}, null, { timeout });

const sheetState = (page) => page.evaluate(() => {
  const sheet = document.getElementById('sheet');
  if (!sheet) return null;
  const choice = sheet.querySelector('#reader-choice');
  const note = sheet.querySelector('#reader-choice-note');
  const reason = sheet.querySelector('#reader-choice-capture');
  const firstSense = sheet.querySelector('.senses .dictionary-sense');
  const firstGloss = firstSense?.querySelector('.dictionary-glosses li, p.gloss') || sheet.querySelector('.senses p.gloss');
  const take = sheet.querySelector('#sheet-take'), foot = sheet.querySelector('#take');
  const visible = (node) => {
    if (!node) return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden';
  };
  return {
    node: sheet.dataset.node || null,
    choiceState: choice?.dataset.state ?? null,
    noteSeq: note?.dataset.seq ?? null,
    noteState: note?.dataset.state ?? null,
    noteBy: note?.dataset.by ?? null,
    headword: sheet.querySelector('.headword')?.textContent ?? null,
    reading: sheet.querySelector('.reading')?.textContent ?? null,
    firstGloss: firstGloss?.textContent ?? null,
    senses: !!sheet.querySelector('.senses'),
    homographs: !!sheet.querySelector('.dictionary-homographs'),
    candidates: [...sheet.querySelectorAll('.reader-choice-row')].map((row) => ({
      seq: row.dataset.readerChoice ?? null, tag: row.tagName.toLowerCase(), type: row.getAttribute('type'),
      head: row.querySelector('.row-word')?.firstChild?.textContent ?? null,
      reading: row.querySelector('.row-reading')?.textContent ?? null,
      gloss: row.querySelector('.row-gloss')?.textContent ?? null,
    })),
    offers: [...sheet.querySelectorAll('[data-reader-choice], [data-dictionary-entry]')]
      .map((item) => item.dataset.readerChoice ?? item.dataset.dictionaryEntry),
    title: sheet.querySelector('#reader-choice-title')?.firstChild?.textContent ?? null,
    titleEn: sheet.querySelector('#reader-choice-title .en-inline')?.textContent ?? null,
    more: sheet.querySelector('.reader-choice-more')?.textContent ?? null,
    unavailable: sheet.querySelector('#reader-choice-unavailable')?.textContent ?? null,
    retry: !!sheet.querySelector('#reader-choice-retry'),
    reason: reason?.textContent ?? null,
    reasonVisible: visible(reason),
    takeDisabled: take ? take.disabled : null,
    takePressed: take?.getAttribute('aria-pressed') ?? null,
    takeDescribedBy: take?.getAttribute('aria-describedby') ?? null,
    footDisabled: foot ? foot.disabled : null,
    depth: sheet.querySelector('.sheet-depth')?.textContent ?? null,
    focused: document.activeElement?.id || null,
  };
});
const brief = (state) => JSON.stringify(state && {
  node: state.node, choice: state.choiceState, note: [state.noteSeq, state.noteState, state.noteBy], head: state.headword,
  reading: state.reading, gloss: state.firstGloss, candidates: state.candidates.map((c) => c.seq), take: state.takeDisabled,
  foot: state.footDisabled, focused: state.focused,
});

async function installedRecord(page) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { return await readAppRecord(page); } catch { await delay(250); }
  }
  return readAppRecord(page); // the last attempt's own error fails the case
}

/** Each case runs on its own contexts and fails on its own; none is skipped. */
async function runCase(name, body) {
  currentCase = name;
  const contexts = [];
  const open = async () => { const context = await newContext(); contexts.push(context); return context; };
  try {
    await body(open);
  } catch (error) {
    results.push({ case: name, name: `${name} terminal`, pass: false, detail: error.stack || String(error) });
    console.log(`  FAIL ${name} terminal — ${error.message}`);
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
  }
}

try {
  host = await startStaticHost({ site: SITE, port: 0 });
  origin = host.origin;
  browser = await chromium.launch();

  currentCase = 'G0';
  {
    const context = await newContext();
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/index.html?entry=shelf`); await ready(page);
      const identity = await (await page.request.get(`${origin}/build-identity.json`)).json();
      let head = null; try { head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* outside a checkout */ }
      const expected = process.env.KAIRO_EXPECT_GITSHA || head;
      const files = new Map(identity.files.map((row) => [row.path, row.sha256]));
      const served = async (path) => createHash('sha256').update(Buffer.from(await (await page.request.get(`${origin}/${path}`)).body())).digest('hex');
      const js = await served('corridor.js'), css = await served('corridor.css');
      check('G0 served build is the expected clean commit (corridor.js and corridor.css)', identity.gitSha === expected && identity.sourceDirty === false
        && js === files.get('corridor.js') && css === files.get('corridor.css'), `served=${identity.gitSha} expected=${expected}`);
      if (results.some((r) => !r.pass)) throw new Error('identity failed');

      const json = async (path) => {
        const response = await page.request.get(`${origin}/${path}`);
        must(response.ok(), `${path} is served`);
        return response.json();
      };
      const articles = {};
      for (const passage of [NEWS, NOBARA, HOJOKI, HANDWRITING]) {
        articles[passage.id] = await json(`data/articles/${passage.file}`);
        check(`F0 ${passage.id} is the served article`, articles[passage.id].id === passage.id, articles[passage.id].id);
      }
      for (const fixture of [CORE, ...MISSES, WAKAT, ITT]) {
        const token = articles[fixture.passage.id].tokens?.[fixture.index];
        check(`F0 ${fixture.passage.id} #${fixture.index} is ${fixture.s}/${fixture.b}/${fixture.r}, a content token`,
          !!token && token.s === fixture.s && token.b === fixture.b && token.r === fixture.r && token.c === true, JSON.stringify(token));
      }
      const dict = (await json('data/share_alike/dict.json')).words;
      const words = (await json('data/share_alike/words.json')).words;
      check('F0 厳しい is a core hit read きびしい whose first sense is "severe"',
        dict[CORE.b]?.r === CORE.r && dict[CORE.b]?.m?.[0] === CORE.gloss, JSON.stringify(dict[CORE.b]));
      for (const fixture of MISSES) {
        check(`F0 ${fixture.b} is a core miss with no word-layer gloss`, !Object.hasOwn(dict, fixture.b) && !words[fixture.b]?.g,
          JSON.stringify(words[fixture.b] ?? null));
      }
      check('F0 分かる (the base of 分かっ) is a core miss', !Object.hasOwn(dict, WAKAT.b), JSON.stringify(dict[WAKAT.b] ?? null));
      const index = await json(INDEX_PATH.slice(1));
      must(Array.isArray(index.entries), 'the served index carries its entries');
      const rowsOf = (form) => index.entries.filter((row) => row[1] === form || row[4].includes(form) || row[5].includes(form));
      for (const [form, expectedRows] of Object.entries(FORM_ROWS)) {
        const found = rowsOf(form).map((row) => [String(row[0]), row[2]]).sort((a, b) => Number(a[0]) - Number(b[0]));
        check(`F0 the deep rows carrying ${form} are exactly the committed ones`, isDeepStrictEqual(found, expectedRows), JSON.stringify(found));
      }
      const hiRows = rowsOf(HI.b).filter((row) => hira(row[2]) === HI.r).map((row) => String(row[0])).sort((a, b) => Number(a) - Number(b));
      check(`F0 ${HI_TOTAL} deep rows are read ひ, the committed six first`, hiRows.length === HI_TOTAL
        && isDeepStrictEqual(hiRows.slice(0, 6), HI_FIRST_SIX), JSON.stringify(hiRows));
    } finally {
      await context.close().catch(() => {});
    }
  }

  await runCase('G1', async (open) => {
    const page = await (await open()).newPage();
    await openArticle(page, NEWS);
    await tap(page, CORE);
    await tap(page, CORE);
    const line = await tokenState(page, CORE);
    check('G1 tap 2 on the core hit adds exactly its gloss line', line?.lines === 1 && line.hasEn
      && line.line === `<span class="tok-en">${CORE.gloss}</span>`, JSON.stringify(line));
    check('G1 its label is the core record\'s', line?.label === `${CORE.s} · ${WORD.bi} · ${CORE.r} · ${CORE.gloss} · ${HINT.bi}`, line?.label);
    const seal = (await captureState(page)).seal;
    check('G1 with the core hit selected, the chrome seal captures as before (enabled, not held)', seal?.disabled === false
      && seal.ariaDisabled === null && !seal.held, JSON.stringify(seal));
    await quickHold(page, CORE);
    const mini = await miniState(page);
    check('G1 its mini shows the core reading and first sense', mini?.reading === CORE.r
      && mini?.gloss === `<span class="mini-gloss">${CORE.gloss}</span>`, JSON.stringify(mini));
    const miniTake = (await captureState(page)).mini;
    check('G1 its mini 覚 is enabled and carries no held reason', miniTake?.takeDisabled === false && !miniTake.held
      && miniTake.reason === null, JSON.stringify(miniTake));
    await longHold(page, CORE);
    await settleSheet(page);
    const sheet = await sheetState(page);
    check('G1 its long hold opens the ordinary entry: no chooser, no match note, 覚 enabled', sheet?.node === `word:${CORE.b}`
      && sheet.choiceState === null && sheet.noteSeq === null && sheet.reason === null && sheet.takeDisabled === false
      && sheet.footDisabled === false, brief(sheet));
  });

  for (const lang of ['bi', 'ja']) {
    await runCase(`G2 ${lang}`, async (open) => {
      const page = await (await open()).newPage();
      await openArticle(page, NEWS, `dials=0,1,0&ui=${lang}`);
      await tap(page, IU);
      const one = await tokenState(page, IU);
      await tap(page, IU);
      const two = await tokenState(page, IU);
      check(`G2 ${lang}: tap 1 shows the reading and no English line`, one?.lines === 0, JSON.stringify(one));
      check(`G2 ${lang}: tap 2 marks the honest miss instead of adding nothing`, two?.lines === 1 && two.hasEn
        && two.line === '<span class="tok-en tok-en-miss">—</span>', JSON.stringify(two));
      check(`G2 ${lang}: the label says the same`, two?.label === `${IU.s} · ${WORD[lang]} · ${MISS[lang]} · ${HINT[lang]}`, two?.label);
      await quickHold(page, IU);
      const mini = await miniState(page);
      check(`G2 ${lang}: the mini says it plainly, never "(no gloss yet)"`, mini?.gloss === `<span class="mini-gloss mini-miss">${MISS[lang]}</span>`
        && !/no gloss yet|語釈なし/u.test(mini.text), JSON.stringify(mini));
      await tap(page, IU);
      const three = await tokenState(page, IU);
      check(`G2 ${lang}: tap 3 closes the circle, marker and all`, three?.lines === 0 && !three.hasEn, JSON.stringify(three));
    });
  }

  await runCase('G3a', async (open) => {
    const page = await (await open()).newPage();
    await openArticle(page, NEWS);
    await longHold(page, IU);
    await settleSheet(page);
    const iu = await sheetState(page);
    check('G3a いう takes the one-row branch: 言う 1587040 opens directly, with no chooser', iu?.noteSeq === IU_ENTRY.seq
      && iu.noteState === 'single' && iu.choiceState === null && iu.candidates.length === 0, brief(iu));
    check('G3a positive: wikinews:12024 #447 いう → headword いう／言う・云う・謂う, reading いう, first gloss "to say"',
      iu?.node === `word:${IU.b}` && iu.headword === IU_ENTRY.headword && iu.reading === IU_ENTRY.reading && iu.firstGloss === IU_ENTRY.gloss, brief(iu));
    check('G3a 結う is neither opened nor offered, and no other row of the form is listed', iu?.noteSeq !== YUU_SEQ
      && !iu.headword?.includes('結う') && iu.firstGloss !== 'to do up (hair)' && !iu.offers.includes(YUU_SEQ) && !iu.homographs, brief(iu));
    check('G3a 覚 is held in the sheet bar and at the foot, and the sheet says why', iu?.takeDisabled === true && iu.footDisabled === true
      && iu.takeDescribedBy === 'reader-choice-capture' && iu.reasonVisible && iu.reason === CAPTURE_REASON(IU.b), brief(iu));
    await closeSheet(page);
  });

  await runCase('G3b', async (open) => {
    const page = await (await open()).newPage();
    await openArticle(page, NOBARA);
    await longHold(page, DARE);
    await settleSheet(page);
    const chooser = await sheetState(page);
    check('G3b だれ opens a chooser and nothing opens by itself', chooser?.node === `word:${DARE.b}` && chooser.choiceState === 'choose'
      && chooser.noteSeq === null && !chooser.senses, brief(chooser));
    check('G3b the candidates are the rows read だれ, in index order: 誰 1416830, ダレ 2665140',
      isDeepStrictEqual(chooser?.candidates.map(({ seq, head, reading, gloss }) => ({ seq, head, reading, gloss })), DARE_CHOICES),
      JSON.stringify(chooser?.candidates));
    check('G3b each is a native button read だれ; たれ/垂れ 1370860 is never offered', chooser?.candidates.length <= 6
      && chooser.candidates.every((c) => c.tag === 'button' && c.type === 'button' && hira(c.reading) === DARE.r)
      && !chooser.offers.includes(TARE_SEQ), JSON.stringify(chooser?.offers));
    check('G3b the heading asks the learner to check the sentence', chooser?.title === CHOOSER_TITLE.ja && chooser.titleEn === CHOOSER_TITLE.en,
      JSON.stringify([chooser?.title, chooser?.titleEn]));
    check('G3b 覚 is held in the chooser, and the sheet says why', chooser?.takeDisabled === true && chooser.reasonVisible
      && chooser.reason === CAPTURE_REASON(DARE.b), brief(chooser));
    const chosenButton = `#reader-choice-${DARE_ENTRY.seq}`;
    await press(page, chosenButton);
    await settleSheet(page);
    const chosen = await sheetState(page);
    check('G3b positive: a real click on 誰 opens seq 1416830 — headword だれ／誰, reading だれ, first gloss "who"',
      chosen?.noteSeq === DARE_ENTRY.seq && chosen.noteState === 'chosen' && chosen.headword === DARE_ENTRY.headword
      && chosen.reading === DARE_ENTRY.reading && chosen.firstGloss === DARE_ENTRY.gloss, brief(chosen));
    check('G3b the chosen entry keeps the article token (word:だれ), offers no other row, and holds 覚', chosen?.node === `word:${DARE.b}`
      && !chosen.homographs && chosen.takeDisabled === true && chosen.footDisabled === true && chosen.reasonVisible, brief(chosen));
    const backToChooser = (id) => page.waitForFunction((focusId) => document.querySelector('#sheet #reader-choice')?.dataset.state === 'choose'
      && document.activeElement?.id === focusId, id, { timeout: 5_000 }).catch(() => {});
    await press(page, '#sheet-back');
    await backToChooser(chosenButton.slice(1));
    const pointerBack = await sheetState(page);
    check('G3b 戻る (pointer) returns to the chooser with focus on the chosen button', pointerBack?.choiceState === 'choose'
      && pointerBack.focused === chosenButton.slice(1), brief(pointerBack));
    await page.keyboard.press('Enter');
    await settleSheet(page);
    const keyed = await sheetState(page);
    check('G3b Enter on that focused button opens the same entry', keyed?.noteSeq === DARE_ENTRY.seq && keyed.firstGloss === DARE_ENTRY.gloss, brief(keyed));
    await page.locator('#sheet-back').focus();
    await page.keyboard.press('Enter');
    await backToChooser(chosenButton.slice(1));
    const keyBack = await sheetState(page);
    check('G3b 戻る (keyboard) returns focus to the chosen button', keyBack?.choiceState === 'choose'
      && keyBack.focused === chosenButton.slice(1), brief(keyBack));
    await closeSheet(page);
  });

  await runCase('G3c', async (open) => {
    const page = await (await open()).newPage();
    await openArticle(page, HOJOKI);
    await longHold(page, HI);
    await settleSheet(page);
    const many = await sheetState(page);
    check('G3c ひ offers exactly the first 6 of its 8 rows read ひ, in index order', many?.choiceState === 'choose'
      && isDeepStrictEqual(many.candidates.map((c) => c.seq), HI_FIRST_SIX) && many.candidates.every((c) => hira(c.reading) === HI.r),
      JSON.stringify(many?.candidates.map((c) => [c.seq, c.reading])));
    check('G3c and says how many were left out', many?.more === `Showing 6 of ${HI_TOTAL} candidates`, String(many?.more));
    await closeSheet(page);
  });

  await runCase('G4', async (open) => {
    const context = await open();
    const fail = (route) => {
      faults.index500 += 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"syntheticFailure":"verify-reader-gloss G4"}' });
    };
    await context.route(isIndex, fail);
    const page = await context.newPage();
    await openArticle(page, NEWS);
    await longHold(page, IU);
    await settleSheet(page);
    const down = await sheetState(page);
    check('G4 the 500 on the index demonstrably fired', faults.index500 > 0, `index 500s: ${faults.index500}`);
    check('G4 the long hold on いう shows the honest unavailable state with a retry', down?.choiceState === 'unavailable'
      && down.unavailable === UNAVAILABLE && down.retry, brief(down));
    check('G4 nothing opens and nothing is offered; 覚 is held and says why', down?.noteSeq === null && down.candidates.length === 0
      && !down.senses && down.takeDisabled === true && down.reasonVisible, brief(down));
    await closeSheet(page);
    await tap(page, CORE);
    await tap(page, CORE);
    const core = await tokenState(page, CORE);
    check('G4 with the index down, the core hit still glosses', core?.line === `<span class="tok-en">${CORE.gloss}</span>`, JSON.stringify(core));
    await tap(page, IU);
    await tap(page, IU);
    const miss = await tokenState(page, IU);
    check('G4 with the index down, いう still says its honest miss', miss?.line === '<span class="tok-en tok-en-miss">—</span>', JSON.stringify(miss));
    const seen = faults.index500;
    await longHold(page, IU);
    await settleSheet(page);
    const again = await sheetState(page);
    check('G4 a second hold asks the index again and is still honestly unavailable', again?.choiceState === 'unavailable'
      && faults.index500 > seen, `${brief(again)} · index 500s: ${faults.index500}`);
    await context.unroute(isIndex, fail);
    await press(page, '#reader-choice-retry');
    await settleSheet(page);
    const recovered = await sheetState(page);
    check('G4 once the fault clears, the retry opens 言う 1587040', recovered?.noteSeq === IU_ENTRY.seq
      && recovered.firstGloss === IU_ENTRY.gloss, brief(recovered));
  });

  await runCase('G4 stale', async (open) => {
    const context = await open();
    let release = () => {};
    const gate = new Promise((done) => { release = done; });
    const heldIndex = async (route) => {
      faults.indexHeld += 1;
      await gate;
      try { await route.continue(); } catch { /* the context closed first */ }
    };
    await context.route(isIndex, heldIndex);
    try {
      const page = await context.newPage();
      await openArticle(page, NEWS);
      await longHold(page, IU);
      for (let attempt = 0; attempt < 60 && !faults.indexHeld; attempt++) await delay(250);
      must(faults.indexHeld > 0, 'the index request reached the held route');
      const pending = await sheetState(page);
      check('G4 stale: いう waits on the held index (the existing opening line)', pending?.choiceState === 'pending', brief(pending));
      await press(page, '#sheet-back');
      await page.waitForFunction(() => !document.getElementById('sheet'), null, { timeout: 5_000 });
      await longHold(page, MIKOMI);
      await page.waitForFunction(() => document.querySelector('#sheet')?.dataset.node === 'word:見込'
        && document.querySelector('#sheet #reader-choice')?.dataset.state === 'pending', null, { timeout: 5_000 });
      release();
      await settleSheet(page);
      const first = await sheetState(page);
      await delay(1_000);
      const later = await sheetState(page);
      check('G4 stale: the released index paints 見込\'s own entry, 見込み 1604480', first?.node === 'word:見込'
        && first.noteSeq === MIKOMI_SEQ, brief(first));
      check('G4 stale: いう\'s abandoned answer opens nothing and paints nothing', [first, later].every((state) => state?.node === 'word:見込'
        && state.noteSeq === MIKOMI_SEQ && state.depth === null && !state.offers.includes(IU_ENTRY.seq)), `${brief(first)} → ${brief(later)}`);
    } finally {
      release();
    }
  });

  await runCase('G5', async (open) => {
    const page = await (await open()).newPage();
    await openArticle(page, NEWS);
    const before = await installedRecord(page);
    /** Compare the learning roots once the record is live: the reader's own tap rows landed. */
    const learningUnchanged = async (stage) => {
      await waitForAppRecord(page, (record) => record.obslog.length > before.obslog.length, { description: `the reader tap observations (${stage})` });
      await delay(1_500);
      const now = await readAppRecord(page);
      const changed = LEARNING_ROOTS.filter((root) => !isDeepStrictEqual(before[root] ?? null, now[root] ?? null));
      check(`G5 ${stage}: captures, grades, lists and deep words are untouched`, changed.length === 0, changed.join(', ') || 'none changed');
      const added = now.obslog.slice(before.obslog.length);
      check(`G5 ${stage}: the only new rows are the reader's existing tap observations`, added.length > 0 && added.every((row) => row[1] === 'tap'),
        JSON.stringify(added.map((row) => row[1])));
    };

    // the G2 and G3a paths on いう, with real clicks wherever 覚 stands (HEAD: enabled, and it captures)
    await tap(page, IU);
    await tap(page, IU);
    await quickHold(page, IU);
    const miniHeld = (await captureState(page)).mini;
    check('G5 the miss-state mini holds its 覚 and shows why', miniHeld?.takeDisabled === true && miniHeld.held
      && miniHeld.describedBy === 'mini-take-reason' && miniHeld.reasonVisible && miniHeld.reason === CAPTURE_REASON(IU.b), JSON.stringify(miniHeld));
    await press(page, '#mini-take');
    const miniAfter = (await captureState(page)).mini;
    check('G5 a real click on the mini\'s held 覚 leaves it held and unpressed', miniAfter?.takeDisabled === true
      && miniAfter.takePressed === 'false', JSON.stringify(miniAfter));
    const sealHeld = (await captureState(page)).seal;
    check('G5 with いう selected, the chrome seal is held (aria-disabled) and its name is the reason', sealHeld?.ariaDisabled === 'true'
      && sealHeld.held && sealHeld.pressed === 'false' && sealHeld.label === CAPTURE_REASON(IU.b), JSON.stringify(sealHeld));
    await pressSeal(page);
    const opened = await captureState(page);
    check('G5 a real click on the held seal opens only the reason, with no capture control in the panel', opened.panel?.reasonVisible
      && opened.panel.reason === CAPTURE_REASON(IU.b) && opened.panel.captureControls === 0 && opened.seal?.pressed === 'false',
      JSON.stringify(opened));
    await pressSeal(page);
    await page.waitForFunction(() => !document.getElementById('capture-panel'), null, { timeout: 5_000 });
    await longHold(page, IU);
    await settleSheet(page);
    const iu = await sheetState(page);
    check('G5 the いう entry (言う 1587040) is the sheet under test', iu?.noteSeq === IU_ENTRY.seq, brief(iu));
    await press(page, '#sheet-take');
    await press(page, '#take');
    const iuAfter = await sheetState(page);
    check('G5 real clicks leave the held 覚 held (sheet bar and entry foot)', iuAfter?.takeDisabled === true && iuAfter.takePressed === 'false'
      && iuAfter.footDisabled === true, brief(iuAfter));
    await closeSheet(page);
    await learningUnchanged('after いう');

    // the G3b path on だれ: 覚 in the chooser, then in the chosen entry
    await openArticle(page, NOBARA);
    await longHold(page, DARE);
    await settleSheet(page);
    await press(page, '#sheet-take');
    await press(page, `#reader-choice-${DARE_ENTRY.seq}`);
    await settleSheet(page);
    const chosen = await sheetState(page);
    check('G5 the chosen 誰 entry (1416830) is the sheet under test', chosen?.noteSeq === DARE_ENTRY.seq, brief(chosen));
    await press(page, '#sheet-take');
    await press(page, '#take');
    const chosenAfter = await sheetState(page);
    check('G5 the chosen entry\'s 覚 stays held under real clicks', chosenAfter?.takeDisabled === true && chosenAfter.takePressed === 'false'
      && chosenAfter.footDisabled === true, brief(chosenAfter));
    await closeSheet(page);
    await learningUnchanged('after だれ');
  });

  await runCase('G6a', async (open) => {
    const page = await (await open()).newPage();
    await openArticle(page, HANDWRITING);
    await longHold(page, WAKAT);
    await settleSheet(page);
    const state = await sheetState(page);
    check('G6a positive: bunki-essay-n2-handwriting #139 分かっ (base 分かる) opens 1606560 directly, matched by spelling — '
      + 'headword 分かる／解る・判る・分る・理解る, reading わかる, first gloss "to understand"', state?.node === `word:${WAKAT.b}`
      && state.noteSeq === WAKARU_ENTRY.seq && state.noteState === 'single' && state.noteBy === 'spelling'
      && state.headword === WAKARU_ENTRY.headword && state.reading === WAKARU_ENTRY.reading && state.firstGloss === WAKARU_ENTRY.gloss,
      brief(state));
    check('G6a no chooser and no absence line; 覚 is held with its reason', state?.choiceState === null && state.candidates.length === 0
      && state.takeDisabled === true && state.footDisabled === true && state.reason === CAPTURE_REASON(WAKAT.b), brief(state));
  });

  await runCase('G6b', async (open) => {
    const page = await (await open()).newPage();
    await openArticle(page, NOBARA);
    await longHold(page, ITT);
    await settleSheet(page);
    const state = await sheetState(page);
    check('G6b positive: aozora:051034 #656 いっ (base いう) opens 言う 1587040 directly, matched by reading — '
      + 'headword いう／言う・云う・謂う, reading いう, first gloss "to say"', state?.node === `word:${ITT.b}`
      && state.noteSeq === IU_ENTRY.seq && state.noteState === 'single' && state.noteBy === 'reading'
      && state.headword === IU_ENTRY.headword && state.reading === IU_ENTRY.reading && state.firstGloss === IU_ENTRY.gloss, brief(state));
    check('G6b 結う is neither opened nor offered', state?.noteSeq !== YUU_SEQ && !state.offers.includes(YUU_SEQ)
      && state.firstGloss !== 'to do up (hair)' && !state.headword?.includes('結う'), brief(state));
  });
} catch (error) {
  results.push({ case: currentCase, name: `terminal (${currentCase})`, pass: false, detail: error.stack || String(error) });
  console.log(`  FAIL terminal in ${currentCase} — ${error.message}`);
} finally {
  await browser?.close().catch((error) => results.push({ name: 'browser · cleanup', pass: false, detail: error.message }));
  await host?.close().catch((error) => results.push({ name: 'host · cleanup', pass: false, detail: error.message }));
  if (pageErrors.length) results.push({ name: 'no uncaught page errors', pass: false, detail: JSON.stringify(pageErrors) });
  writeFileSync(resolve(EVIDENCE, 'reader-gloss.json'), JSON.stringify({
    origin, fixtures: { CORE, IU, MIKOMI, DARE, HI, WAKAT, ITT, FORM_ROWS, IU_ENTRY, DARE_CHOICES, DARE_ENTRY, WAKARU_ENTRY,
      HI_FIRST_SIX, HI_TOTAL },
    faults, results, pageErrors, lastCase: currentCase,
  }, null, 2) + '\n');
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · evidence ${EVIDENCE}`);
process.exit(failed.length ? 1 : 0);
