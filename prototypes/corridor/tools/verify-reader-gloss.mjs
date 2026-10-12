/** Reader popup and full-entry behavior against one immutable artifact.
 * Round 1 retired the tap ladder and timed hold-to-entry: one tap opens the
 * word, reading, meaning and Save together; Full entry opens the dictionary.
 * The lexical fixtures, exact candidate/head/reading/sense assertions, all four
 * durable capture doors, miss-state holds, dictionary failure/retry/stale-answer
 * checks and eight executable mutation controls remain independently asserted.
 * G2 also checks popup dismissal, keyboard reopening and unchanged prose in bi/ja.
 *
 * Fixtures are checked against served articles, core dictionary, index and shards
 * before a control can count as killed. Mutations affect served bytes only, must
 * match exactly once and must fail their declared rows with the declared witness;
 * missing rows, unrelated failures and page errors never count as a kill.
 *
 * Scope: desktop Chromium or WebKit (KAIRO_BROWSER); real pointer gestures and keyboard Enter/Escape.
 * This does not claim touch, contextual correctness, or voice acceptance.
 * Audio is silenced and no audio action is invoked. Evidence is written in finally.
 * Pin KAIRO_SITE_DIR, KAIRO_ARTIFACT_SHA256 and KAIRO_EXPECT_GITSHA for a prior build.
 */

import { entryCloseSelector } from './sheet-navigation-support.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';

import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecord } from './record-test-support.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { adjudicate, canonical, serveMutation, sha256 } from './reader-gloss-mutants.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');

const SITE = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
const ENGINE = process.env.KAIRO_BROWSER || 'chromium';
if (!['chromium', 'webkit'].includes(ENGINE)) throw new Error('KAIRO_BROWSER must be chromium or webkit');
const results = [];
const pageErrors = [];
const controls = [];
const faults = { index500: 0, indexHeld: 0 };
let currentCase = 'setup';
const check = (name, pass, detail = '', extra = {}) => {
  results.push({ case: currentCase, ...extra, name, pass: !!pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
};
/** The candidate's rows: verdicts, by id. A control's rows go to its own record instead. */
const record = (id, name, pass, detail = '', observed) => check(name, pass, detail, observed === undefined ? { id } : { id, observed });
/** A missing fixture element stops its block; a block records every row it never reached as failed and unreached. */
const must = (value, what) => {
  if (!value) throw new Error(`missing: ${what}`);
  return value;
};
const hira = (text) => String(text || '').replace(/[ァ-ヶ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/* ------------------------------------------------------------------ fixtures */
const NEWS = Object.freeze({ id: 'wikinews:12024', file: 'data/articles/wikinews-12024.json' });
const NOBARA = Object.freeze({ id: 'aozora:051034', file: 'data/articles/aozora-051034.json' });
const HOJOKI = Object.freeze({ id: 'real-hojoki', file: 'data/articles/real-hojoki.json' });
const HANDWRITING = Object.freeze({ id: 'bunki-essay-n2-handwriting', file: 'data/articles/bunki-essay-n2-handwriting.json' });
const MUSUBI = Object.freeze({ id: 'bunki-essay-n2-feel-jingu-musubi', file: 'data/articles/bunki-essay-n2-feel-jingu-musubi.json' });
const MUSUBI_VISUAL = Object.freeze({ id: 'bunki-graded-n3-musubi-visual', file: 'data/articles/bunki-graded-n3-musubi-visual.json' });
const tok = (passage, index, token) => Object.freeze({ passage, index, token: Object.freeze(token) });
const CORE = tok(NEWS, 445, { s: '厳しい', b: '厳しい', p: '形容詞', r: 'きびしい', f: [{ t: '厳', r: 'きび' }, { t: 'しい' }], c: true });
const IU = tok(NEWS, 447, { s: 'いう', b: 'いう', p: '動詞', r: 'いう', f: [{ t: 'いう' }], c: true });
const MIKOMI = tok(NEWS, 443, { s: '見込', b: '見込', p: '名詞', r: 'みこみ', f: [{ t: '見込', r: 'みこみ' }], c: true });
const DARE = tok(NOBARA, 256, { s: 'だれ', b: 'だれ', p: '代名詞', r: 'だれ', f: [{ t: 'だれ' }], c: true });
const ITT = tok(NOBARA, 656, { s: 'いっ', b: 'いう', p: '動詞', r: 'いっ', f: [{ t: 'いっ' }], c: true });
const YUKE = tok(NOBARA, 992, { s: 'ゆけ', b: 'ゆく', p: '動詞', r: 'ゆけ', f: [{ t: 'ゆけ' }], c: true });
const HI = tok(HOJOKI, 167, { s: 'ひ', b: 'ひ', p: '名詞', r: 'ひ', f: [{ t: 'ひ' }], c: true });
const WAKAT = tok(HANDWRITING, 139, { s: '分かっ', b: '分かる', p: '動詞', r: 'わかっ', f: [{ t: '分', r: 'わ' }, { t: 'かっ' }], c: true });
const SAN = tok(MUSUBI, 621, { s: '産', b: '産', p: '名詞', r: 'さん', f: [{ t: '産', r: 'さん' }], c: true });
const SAN_TWIN = tok(MUSUBI_VISUAL, 118, { s: '産', b: '産', p: '名詞', r: 'さん', f: [{ t: '産', r: 'さん' }], c: true });
const FIXTURES = [CORE, IU, MIKOMI, DARE, ITT, YUKE, HI, WAKAT, SAN, SAN_TWIN];
/** The fixture foundation, exactly: no control kill is admitted unless each of these F0 rows ran once and passed. */
const F0_IDS = Object.freeze([...FIXTURES.map((fixture) => `F0.${fixture.passage.id}#${fixture.index}`),
  'F0.core', 'F0.misses', 'F0.iu', 'F0.dare', 'F0.yuku', 'F0.san', 'F0.hi', 'F0.bases', 'F0.glosses', 'F0.senses']);
const MISS_BASES = ['いう', '見込', 'だれ', 'ゆく', 'ひ', '分かる', '産'];

// what each door must show: candidates as the chooser lists them, entries as the full sheet displays them
const IU_CHOICES = [
  { seq: '1254600', head: '結う', reading: 'いう', gloss: 'to do up (hair)' },
  { seq: '1587040', head: '言う', reading: 'いう', gloss: 'to say' },
];
const IU_PICK = { seq: '1587040', head: '言う', headword: '言う／云う・謂う', reading: 'いう', gloss: 'to say' };
const DARE_CHOICES = [
  { seq: '1370860', head: '垂れ', reading: 'だれ', gloss: 'sauce (esp. soy or mirin-based dipping sauce)' },
  { seq: '1416830', head: '誰', reading: 'だれ', gloss: 'who' },
  { seq: '2665140', head: 'ダレ', reading: 'ダレ', gloss: 'undercut (of a machined edge)' },
];
const DARE_TARE = { seq: '1370860', head: '垂れ', headword: '垂れ／垂', reading: 'だれ', gloss: 'sauce (esp. soy or mirin-based dipping sauce)' };
const DARE_WHO = { seq: '1416830', head: '誰', headword: '誰', reading: 'だれ', gloss: 'who' };
const YUKE_ENTRY = { seq: '1578850', head: '行く', headword: '行く／往く', reading: 'ゆく', gloss: 'to go', by: 'reading' };
const WAKARU_ENTRY = { seq: '1606560', head: '分かる', headword: '分かる／解る・判る・分る・理解る', reading: 'わかる', gloss: 'to understand', by: 'spelling' };
const MIKOMI_ENTRY = { seq: '1604480', head: '見込', headword: '見込／見込み・見こみ', reading: 'みこみ', gloss: 'hope', by: 'spelling' };
const HI_FIRST_SIX = [
  { seq: '1193610', head: '火', reading: 'ひ', gloss: 'fire' }, { seq: '1463770', head: '日', reading: 'ひ', gloss: 'day' },
  { seq: '1482860', head: '否', reading: 'ひ', gloss: 'no' }, { seq: '1483520', head: '比', reading: 'ひ', gloss: 'ratio' },
  { seq: '1484590', head: '費', reading: 'ひ', gloss: 'cost' }, { seq: '1484710', head: '非', reading: 'ひ', gloss: 'fault' },
];
const HI_TOTAL = 10;
const SAN_ROW = '2036160';
const CORE_ENTRY = { seq: '1262530', headword: '厳しい', reading: 'きびしい', gloss: 'severe', ruby: 'きび' };
const CAPTURED_ROW = Object.freeze({ t: 'word', id: '厳しい', label: '厳しい', kind: '語', kindEn: 'word',
  from: { passage: NEWS.id, index: CORE.index }, ctx: { p: NEWS.id, i: CORE.index, scope: 'sent' } });
// the served shards' first sense of every entry a full sheet is asserted to display
const FIRST_SENSES = { 1262530: 'severe', 1587040: 'to say', 1370860: DARE_TARE.gloss, 1416830: 'who', 1578850: 'to go',
  1606560: 'to understand', 1604480: 'hope' };

/* the app's own words, bilingual chrome (ui=bi) unless a check says ja */
const MISS = { bi: 'Not in the quick dictionary. Full entry looks it up in the whole dictionary.', ja: 'この語は簡易辞書にありません。「全項目」で全辞書を引けます。' };
const WORD = { bi: 'word', ja: '語' };
const HINT = { bi: 'Enter: reading and meaning · Shift+F10: more actions · Ctrl+Enter: full entry', ja: 'Enterで読みと意味。Shift+F10でほかの操作。Ctrl+Enterで全項目。' };
const CHOOSER_TITLE = { ja: '候補から選ぶ（この文での意味は確かめてください）', en: 'Choose the word — check it fits this sentence' };
const UNAVAILABLE = 'The full dictionary could not be opened, so no entry can be matched to this word. The reader and its quick dictionary still work.';
const CAPTURE_REASON = (spelling) => `${spelling} isn't in the quick dictionary, so it can't be saved here. Full entry looks it up in the whole dictionary.`;
const LEARNING_ROOTS = ['taken', 'lists', 'srs', 'revlog', 'deepWords', 'suspended', 'teacherContexts', 'assessmentLearning', 'sentencePractice'];
const INDEX_PATH = '/data/share_alike/dict-v2/index.json';
const isIndex = (url) => url.pathname === INDEX_PATH;

/* ------------------------------------------------------------------ controls */
// Each mutation must match exactly once in the pinned served bytes; the checkout is never edited.
const EDITS = Object.freeze({
  primaryOnly: Object.freeze({ file: 'corridor.js', from: 'collect((row, kana) => kataToHira(kana) === reading)',
    to: "collect((row, kana) => kataToHira(String(row[2] || '')) === reading && kataToHira(kana) === reading)" }),
  noSurface: Object.freeze({ file: 'corridor.js', from: "  const surface = choice.s === base ? kataToHira(choice.r || '') : '';\n",
    to: "  const surface = '';\n" }),
  entryHead: Object.freeze({ file: 'corridor.js',
    from: '      const head = spelled ? base : row[4].find((form) => readerReadingFits(row, k, form)) || row[5][k];\n',
    to: '      const head = spelled ? base : row[1];\n' }),
  noOverlay: Object.freeze({ file: 'corridor.js',
    from: '  const rec = found && node.readerChoice && node.matchedHead\n    ? { ...found, head: node.matchedHead, r: node.reading || found.r, alt: found.alt === node.matchedHead ? null : found.alt }\n    : found;\n',
    to: '  const rec = found;\n' }),
  altKept: Object.freeze({ file: 'corridor.js', from: 'r: node.reading || found.r, alt: found.alt === node.matchedHead ? null : found.alt }',
    to: 'r: node.reading || found.r, alt: found.alt }' }),
  coreWrongEntry: Object.freeze({ file: 'corridor.js', from: '  if (D.dict[token.b]) return node;\n',
    to: "  if (D.dict[token.b]) return { ...node, seq: '1254600' };\n" }),
  captureInert: Object.freeze({ file: 'corridor.js', from: 'async function toggleTaken(node, label) {\n',
    to: 'async function toggleTaken(node, label) {\n  return false;\n' }),
  miniUnheld: Object.freeze({ file: 'corridor.js', from: "  const held = (reader && !D.dict[token.b]) || !g?.m?.some(meaning => typeof meaning === 'string' && meaning.trim());\n", to: '  const held = false;\n' }),
});
const RUN_ROWS = Object.freeze({
  core: Object.freeze(['G1.popup', 'G1.seal', 'G1.mini', 'G1.entry']),
  match: Object.freeze(['M.iu.chooser', 'M.iu.choose', 'M.iu.back', 'M.itt.chooser', 'M.itt.choose', 'M.dare.chooser', 'M.dare.tare',
    'M.dare.back', 'M.dare.key', 'M.yuke.single', 'M.hi.cap', 'M.wakat.single', 'M.san.offered', 'M.iu.yuu']),
  capture: Object.freeze(['mini', 'seal', 'sheet', 'foot'].flatMap((door) => [`G7.${door}.door`, `G7.${door}.captured`])),
  held: Object.freeze(['G5.mini-held', 'G5.mini-click', 'G5.seal-held', 'G5.seal-panel', 'G5.iu-chooser-held', 'G5.iu-entry-held',
    'G5.after-iu', 'G5.dare-held', 'G5.after-dare']),
});
const seen = (rows, id) => rows.get(id)?.observed ?? {};
const CONTROLS = Object.freeze([
  Object.freeze({ name: 'c1', title: "the kana branch admits a row only by its primary reading (8d0fbccf's rule)", edits: ['primaryOnly'], run: 'match',
    requires: ['M.wakat.single', 'M.san.offered', 'M.dare.key'],
    kills: ['M.iu.chooser', 'M.itt.chooser', 'M.yuke.single'],
    // M.iu.yuu depends on the 結う candidate this rule removes (Codex D11 verifier r2)
    allowed: ['M.iu.choose', 'M.iu.back', 'M.itt.choose', 'M.dare.chooser', 'M.dare.tare', 'M.dare.back', 'M.hi.cap', 'M.iu.yuu'],
    witness: (rows) => (seen(rows, 'M.iu.chooser').noteSeq === IU_PICK.seq && seen(rows, 'M.iu.chooser').noteState === 'single'
      && seen(rows, 'M.itt.chooser').noteSeq === IU_PICK.seq && seen(rows, 'M.yuke.single').choiceState === 'none'
      ? '' : 'いう/いっ did not open 言う directly, or ゆけ was not absent') }),
  Object.freeze({ name: 'c2', title: "the uninflected token's own reading no longer required", edits: ['noSurface'], run: 'match',
    requires: ['M.iu.chooser', 'M.wakat.single'],
    kills: ['M.san.offered'],
    allowed: [],
    witness: (rows) => (seen(rows, 'M.san.offered').noteSeq === SAN_ROW ? '' : `産 did not open #${SAN_ROW}`) }),
  Object.freeze({ name: 'c3', title: "a kana match headed by the entry's head (row[1])", edits: ['entryHead'], run: 'match',
    requires: ['M.iu.chooser', 'M.wakat.single', 'M.san.offered'],
    kills: ['M.dare.chooser'],
    allowed: ['M.dare.tare'],
    witness: (rows) => (seen(rows, 'M.dare.chooser').candidates?.[0]?.head === 'たれ' ? '' : 'だれ did not list たれ first') }),
  Object.freeze({ name: 'c5', title: "the r3 overlay removed (lookup()'s own head and reading)", edits: ['noOverlay'], run: 'match',
    requires: ['M.iu.chooser', 'M.iu.choose', 'M.dare.chooser'],
    kills: ['M.yuke.single', 'M.dare.tare', 'M.iu.yuu'],
    allowed: [],
    witness: (rows) => (seen(rows, 'M.yuke.single').headword === 'ゆく／行く・往く' && seen(rows, 'M.dare.tare').headword === 'だれ／垂れ・垂'
      && seen(rows, 'M.iu.yuu').headword === 'いう／結う'
      ? '' : 'ゆけ, 垂れ and 結う were not displayed under lookup()\'s heads ゆく, だれ and いう') }),
  Object.freeze({ name: 'c9', title: "lookup()'s alt kept beside the chosen head (r4 reverted)", edits: ['altKept'], run: 'match',
    requires: ['M.iu.chooser', 'M.iu.choose'],
    kills: ['M.iu.yuu'],
    allowed: ['M.dare.tare', 'M.dare.key', 'M.yuke.single', 'M.wakat.single'],
    witness: (rows) => (seen(rows, 'M.iu.yuu').headword === '結う／結う' ? '' : '結う was not displayed 結う／結う') }),
  Object.freeze({ name: 'c6', title: "a core hit's full entry opened on a wrong row (seq 1254600)", edits: ['coreWrongEntry'], run: 'core',
    requires: ['G1.popup', 'G1.mini'],
    kills: ['G1.entry'],
    allowed: [],
    witness: (rows) => (seen(rows, 'G1.entry').firstGloss === 'to do up (hair)' ? '' : 'the core sheet did not show 結う\'s first sense') }),
  Object.freeze({ name: 'c7', title: 'toggleTaken() inert while every door still looks enabled', edits: ['captureInert'], run: 'capture',
    requires: ['G7.mini.door', 'G7.seal.door', 'G7.sheet.door', 'G7.foot.door'],
    kills: ['G7.mini.captured', 'G7.seal.captured', 'G7.sheet.captured', 'G7.foot.captured'],
    allowed: [],
    witness: (rows) => (['mini', 'seal', 'sheet', 'foot'].every((door) => seen(rows, `G7.${door}.captured`).added?.length === 0)
      ? '' : 'a door captured something') }),
  Object.freeze({ name: 'c8', title: "the mini's hold removed for a core miss", edits: ['miniUnheld'], run: 'held',
    requires: ['G5.seal-held', 'G5.iu-chooser-held'],
    kills: ['G5.mini-held', 'G5.after-iu'],
    allowed: ['G5.mini-click', 'G5.after-dare'],
    witness: (rows) => (seen(rows, 'G5.after-iu').changed?.includes('taken') ? '' : 'いう was not captured') }),
]);

/* ------------------------------------------------------------------- browser */
const DESK = { width: 1280, height: 860 };
const ready = (page) => page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
let host = null, origin = null, browser = null;
let manifest = null; // path → sha256 from the served build-identity.json, read in G0

/** A fresh context, service workers blocked; a control's contexts serve its edited corridor.js. */
async function newContext(sink, mutation = null) {
  const context = await browser.newContext({ viewport: DESK, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await silenceBrowserAudio(context);
  context.on('page', (page) => page.on('pageerror', (error) => {
    if (sink.length < 20) sink.push({ case: currentCase, message: error.message });
  }));
  if (mutation) await serveMutation(context, { origin, manifest, control: mutation.control, edits: mutation.edits });
  return context;
}

async function openArticle(page, passage, query = 'dials=0,1,0&ui=bi') {
  await page.goto(`${origin}/index.html?entry=shelf&${query}`); await ready(page);
  const door = page.locator(`[data-passage="${passage.id}"]:not([data-recommendation]) .shelf-open`).first();
  must(await door.count(), `the shelf door for ${passage.id}`);
  await door.click();
  await page.waitForFunction((pid) => document.querySelector('.listen-row')?.dataset.passage === pid && document.querySelector('#reader .tok'),
    passage.id, { timeout: 15_000 });
  // Article loading can replace the first token render; wait until the token population settles.
  let previous = -1;
  for (let attempt = 0; attempt < 40; attempt++) {
    const count = await page.locator('#reader .tok').count();
    if (count > 0 && count === previous) return;
    previous = count;
    await delay(300);
  }
  throw new Error(`the reader tokens of ${passage.id} never settled`);
}

/** Where one element's centre is, and whether that point is the element itself. The sticky chrome is not scrolled to. */
async function probeCentre(locator, { scroll = true } = {}) {
  const count = await locator.count();
  if (count !== 1) return { count, own: false };
  if (scroll) await locator.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await delay(120);
  return { count, ...(await locator.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const x = box.left + box.width / 2, y = box.top + box.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, own: !!hit && (hit === node || node.contains(hit)), word: node.dataset.word ?? null,
      hit: hit ? `${hit.tagName.toLowerCase()}.${[...hit.classList].join('.')}` : null };
  })) };
}
async function ownCentre(locator, what, options) {
  const probe = await probeCentre(locator, options);
  must(probe.count === 1, `${what}: exactly one element (found ${probe.count})`);
  must(probe.own, `${what}: its centre is the element itself (hit ${probe.hit})`);
  return probe;
}
async function tokenCentre(page, fixture) {
  const probe = await ownCentre(page.locator(`#reader .tok[data-index="${fixture.index}"]`), `${fixture.passage.id} token #${fixture.index}`);
  must(probe.word === fixture.token.b, `${fixture.passage.id} token #${fixture.index} is ${fixture.token.b} (found ${probe.word})`);
  return probe;
}
async function tap(page, fixture) {
  const { x, y } = await tokenCentre(page, fixture);
  await page.mouse.click(x, y);
  await delay(150);
}
/** One real tap opens the popup; a second tap would dismiss it. */
async function openPopup(page, fixture) {
  if (await page.locator('#mini .mini-word').count() && await page.locator('#mini .mini-word').textContent() === fixture.token.b) return;
  await tap(page, fixture);
  await page.locator('#mini .mini-word').filter({ hasText: fixture.token.b }).waitFor();
}
async function fullEntry(page, fixture) {
  await openPopup(page, fixture);
  await press(page, '#mini .mini-entry');
  await page.locator('#sheet').waitFor();
}
async function press(page, selector, options) {
  const { x, y } = await ownCentre(page.locator(selector), selector, options);
  await page.mouse.click(x, y);
  await delay(150);
}
const dismissMiniForSeal = async (page) => {
  if (await page.locator('#mini').count()) {
    await page.keyboard.press('Escape');
    await page.waitForSelector('#mini', { state: 'detached' });
  }
};
const pressSeal = async (page) => {
  await dismissMiniForSeal(page);
  return press(page, '#reader-take', { scroll: false });
};
async function closeIfOpen(page) {
  if (!(await page.locator('#sheet').count())) return;
  await press(page, await entryCloseSelector(page));
  await page.waitForFunction(() => !document.getElementById('sheet'), null, { timeout: 5_000 });
}
const chooserFocus = (page, id) => page.waitForFunction((focusId) => document.querySelector('#sheet #reader-choice')?.dataset.state === 'choose'
  && document.activeElement?.id === focusId, id, { timeout: 5_000 }).catch(() => {});

const tokenState = (page, fixture) => page.evaluate((index) => {
  const node = document.querySelector(`#reader .tok[data-index="${index}"]`);
  if (!node) return null;
  const bare = node.cloneNode(true);
  for (const extra of bare.querySelectorAll('rt, .tok-en')) extra.remove();
  const lines = node.querySelectorAll('.tok-en');
  return { surface: bare.textContent, visibleRuby: [...node.querySelectorAll('rt')].filter((rt) => !rt.classList.contains('hidden-rt'))
    .map((rt) => rt.textContent).join(''), lines: lines.length, line: lines[0]?.outerHTML ?? null,
    // R4 (2026-09-30): the name is the word, the rest is its description — read together, in order
    hasEn: node.classList.contains('has-en'), label: [node.getAttribute('aria-label') || '',
      ...(node.getAttribute('aria-describedby') || '').split(/\s+/u).filter(Boolean).map((id) => document.getElementById(id)?.textContent || '')]
      .filter(Boolean).join(' · ') };
}, fixture.index);

const miniState = (page) => page.evaluate(() => {
  const mini = document.getElementById('mini');
  if (!mini) return null;
  return { word: mini.querySelector('.mini-word')?.textContent ?? null, reading: mini.querySelector('.mini-reading')?.textContent ?? null,
    gloss: mini.querySelector('.mini-gloss')?.outerHTML ?? null, text: mini.textContent };
});

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
    seal: seal && { disabled: seal.disabled, ariaDisabled: seal.getAttribute('aria-disabled'), held: seal.classList.contains('reader-capture-held'),
      pressed: seal.getAttribute('aria-pressed'), label: seal.getAttribute('aria-label') },
    panel: panel && { reason: panel.querySelector('#reader-take-reason')?.textContent ?? null,
      reasonVisible: visible(panel.querySelector('#reader-take-reason')),
      captureControls: panel.querySelectorAll('#take, .take, .context-picker, .list-picker').length },
    mini: mini && { takeDisabled: miniTake ? miniTake.disabled : null, takePressed: miniTake?.getAttribute('aria-pressed') ?? null,
      held: !!miniTake?.classList.contains('reader-capture-held'), describedBy: miniTake?.getAttribute('aria-describedby') ?? null,
      reason: miniReason?.textContent ?? null, reasonVisible: visible(miniReason) },
  };
});

/** One capture door as a learner meets it: present once, enabled (not held), unpressed, its centre itself. */
async function doorState(page, selector, options) {
  const probe = await probeCentre(page.locator(selector), options);
  const state = await page.evaluate((sel) => {
    const node = document.querySelector(sel);
    return node && { disabled: node.disabled, ariaDisabled: node.getAttribute('aria-disabled'),
      held: node.classList.contains('reader-capture-held'), pressed: node.getAttribute('aria-pressed') };
  }, selector);
  return { count: probe.count, own: probe.own, hit: probe.hit ?? null, ...(state || {}) };
}

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
  const headword = sheet.querySelector('.headword');
  const primaryHead = headword?.cloneNode(true);
  primaryHead?.querySelectorAll('.headword-alt').forEach(node => node.remove());
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
    headword: headword?.textContent ?? null,
    headLabel: primaryHead?.textContent ?? null,
    reading: sheet.querySelector('p.reading')?.textContent ?? null,
    firstGloss: firstGloss?.textContent ?? null,
    senses: !!sheet.querySelector('.senses'),
    detailsIn: !!sheet.querySelector('.senses .dictionary-sense'),
    absent: !!sheet.querySelector('.gloss.absent'),
    warning: !!sheet.querySelector('.dictionary-warning'),
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
    noneText: sheet.querySelector('#reader-choice-none')?.textContent ?? null,
    mismatchText: sheet.querySelector('#reader-choice-mismatch')?.textContent ?? null,
    unavailable: sheet.querySelector('#reader-choice-unavailable')?.textContent ?? null,
    retry: !!sheet.querySelector('#reader-choice-retry'),
    reason: reason?.textContent ?? null,
    reasonVisible: visible(reason),
    takeDisabled: take ? take.disabled : null,
    takeDescribedBy: take?.getAttribute('aria-describedby') ?? null,
    footDisabled: foot ? foot.disabled : null,
    depth: sheet.querySelector('.sheet-depth')?.textContent ?? null,
    focused: document.activeElement?.id || null,
    text: sheet.textContent,
  };
});
/** What a row keeps as evidence: enough for a control's witness, without the sheet's whole text. */
const observe = (state) => (state ? {
  node: state.node, choiceState: state.choiceState, noteSeq: state.noteSeq, noteState: state.noteState, noteBy: state.noteBy,
  headword: state.headword, headLabel: state.headLabel, reading: state.reading, firstGloss: state.firstGloss,
  candidates: state.candidates.map(({ seq, head, reading, gloss }) => ({ seq, head, reading, gloss })), more: state.more,
  noneText: state.noneText, focused: state.focused, depth: state.depth, takeDisabled: state.takeDisabled, footDisabled: state.footDisabled,
} : { sheet: null });
const brief = (state) => JSON.stringify(observe(state));
/** An entry the reader matched, as its full sheet displays it: head, exact reading, first sense, and 覚 held. */
const shows = (state, entry, how) => !!state && state.noteSeq === entry.seq && state.noteState === how
  && state.headLabel === entry.head && state.headword === entry.headword && state.reading === entry.reading
  && state.firstGloss === entry.gloss && state.detailsIn && !state.absent && !state.warning && !state.homographs
  && state.choiceState === null && state.takeDisabled === true && state.footDisabled === true && state.reasonVisible;
const at = (fixture) => `${fixture.passage.id} #${fixture.index} ${fixture.token.s}`;

async function installedRecord(page) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { return await readAppRecord(page); } catch { await delay(250); }
  }
  return readAppRecord(page); // the last attempt's own error stops the block
}
/** The durable record once `predicate` holds, or at the deadline: a capture that never lands is an observation here. */
async function recordUntil(page, predicate, timeout) {
  const deadline = Date.now() + timeout;
  let current = await readAppRecord(page);
  while (!predicate(current) && Date.now() < deadline) {
    await delay(100);
    current = await readAppRecord(page);
  }
  return { record: current, met: !!predicate(current) };
}
/** The learning roots against the baseline, once the reader's own tap rows show the record is live. */
async function learningSince(page, before) {
  const live = await recordUntil(page, (current) => current.obslog.length > before.obslog.length, 10_000);
  await delay(1_500);
  const now = await readAppRecord(page);
  return { live: live.met, changed: LEARNING_ROOTS.filter((root) => !isDeepStrictEqual(before[root] ?? null, now[root] ?? null)),
    added: now.obslog.slice(before.obslog.length).map((row) => row[1]) };
}

/** Record each declared id exactly once. A body records rows as it observes them. If it stops on an unexpected error,
 * every row it never reached is recorded failed and `unreached`: adjudication reads that as incomplete, never a kill. */
async function block(rec, ids, body) {
  const done = new Set();
  const once = (id, name, pass, detail = '', observed = {}) => {
    if (!ids.includes(id) || done.has(id)) throw new Error(`row ${id} is not declared in this block, or is recorded twice`);
    done.add(id);
    rec(id, name, pass, detail, observed);
  };
  try { await body(once); } catch (error) {
    const unrecorded = ids.filter((id) => !done.has(id));
    for (const id of unrecorded) { done.add(id); rec(id, `${id}: not reached`, false, `stopped: ${error.message}`, { unreached: true }); }
    // an error after the block's last row (a close, say) is still this schedule's failure: it is never dropped
    if (!unrecorded.length)
      rec(`${ids.at(-1)}.after`, `${ids.join(', ')}: an error after the last row`, false, `stopped after its rows: ${error.message}`,
        { unreached: true, afterRows: true });
  }
  for (const id of ids) if (!done.has(id)) { done.add(id); rec(id, `${id}: not recorded`, false, 'the block ended without this row', { unreached: true }); }
}

/* ---------------------------------------------------------------- schedules */
/** G1: one tap shows the complete quick look without inserting a gloss into prose. */
async function coreRun(open, rec) {
  const page = await (await open()).newPage();
  await block(rec, RUN_ROWS.core, async (once) => {
    await openArticle(page, CORE.passage);
    await openPopup(page, CORE);
    const token = await tokenState(page, CORE);
    once('G1.popup', `G1 ${at(CORE)}: one tap preserves the word, reveals its ruby, and leaves meaning in the popup`,
      token?.surface === CORE.token.s && token.visibleRuby === CORE_ENTRY.ruby && token.lines === 0 && !token.hasEn
        && token.label === `${CORE.token.s} · ${WORD.bi} · ${CORE_ENTRY.reading} · ${HINT.bi}`,
      JSON.stringify(token), { token });
    const seal = (await captureState(page)).seal;
    once('G1.seal', `G1 with ${CORE.token.s} selected, the chrome seal is enabled and not held`,
      !!seal && seal.disabled === false && seal.ariaDisabled === null && !seal.held, JSON.stringify(seal), { seal });
    await openPopup(page, CORE);
    const mini = await miniState(page), take = (await captureState(page)).mini;
    once('G1.mini', `G1 its mini: word ${CORE.token.s}, reading ${CORE_ENTRY.reading}, gloss exactly "${CORE_ENTRY.gloss}"; its 覚 enabled and not held`,
      mini?.word === CORE.token.s && mini.reading === CORE_ENTRY.reading && mini.gloss === `<span class="mini-gloss">${CORE_ENTRY.gloss}</span>`
        && take?.takeDisabled === false && !take.held && take.reason === null, JSON.stringify({ mini, take }), { mini, take });
    await fullEntry(page, CORE);
    await settleSheet(page);
    const entry = await sheetState(page);
    once('G1.entry', `G1 its full sheet displays exactly ${CORE_ENTRY.headword} / ${CORE_ENTRY.reading} / first sense "${CORE_ENTRY.gloss}", complete (senses in, no absence, no warning), the ordinary door (no chooser, no match note, both 覚 enabled)`,
      entry?.node === `word:${CORE.token.b}` && entry.headword === CORE_ENTRY.headword && entry.headLabel === CORE_ENTRY.headword
        && entry.reading === CORE_ENTRY.reading && entry.firstGloss === CORE_ENTRY.gloss && entry.detailsIn && !entry.absent && !entry.warning
        && entry.choiceState === null && entry.noteSeq === null && entry.reason === null && entry.takeDisabled === false && entry.footDisabled === false,
      brief(entry), observe(entry));
  });
}

/** A chooser fixture: Full entry lists exactly `choices`; a real click on `pick` opens it as displayed; 戻る, and the keyboard. */
async function chooserFixture(page, once, { fixture, id, choices, pick, pickRow, back = false, keyboard = null }) {
  await fullEntry(page, fixture);
  await settleSheet(page);
  const state = await sheetState(page);
  const listed = state ? state.candidates.map(({ seq, head, reading, gloss }) => ({ seq, head, reading, gloss })) : null;
  once(`${id}.chooser`, `${at(fixture)}: an explicit chooser of exactly ${choices.map((c) => `${c.head}/${c.reading}#${c.seq}`).join(', ')}, in that order, as native buttons, nothing opened by itself, 覚 held`,
    state?.node === `word:${fixture.token.b}` && state.choiceState === 'choose' && state.noteSeq === null && !state.senses
      && canonical(listed) === canonical(choices) && state.candidates.every((c) => c.tag === 'button' && c.type === 'button')
      && state.title === CHOOSER_TITLE.en && state.titleEn === null && state.takeDisabled === true && state.reasonVisible,
    brief(state), observe(state));
  const button = `#reader-choice-${pick.seq}`;
  if ((await page.locator(button).count()) === 1) {
    await press(page, button);
    await settleSheet(page);
    const entry = await sheetState(page);
    once(`${id}.${pickRow}`, `${at(fixture)}: a real click on ${pick.head}/${pick.reading} opens #${pick.seq}, displayed ${pick.headword} (head ${pick.head}) read ${pick.reading}, first sense "${pick.gloss}", 覚 held`,
      shows(entry, pick, 'chosen'), brief(entry), observe(entry));
    if (back) {
      await press(page, '#sheet-back');
      await chooserFocus(page, button.slice(1));
      const returned = await sheetState(page);
      once(`${id}.back`, `${at(fixture)}: 戻る (pointer) returns to the chooser with focus on ${pick.head}'s button`,
        returned?.choiceState === 'choose' && returned.focused === button.slice(1), brief(returned), observe(returned));
    }
  } else {
    // an observed absence, not an error: the rows that need this candidate fail, and the keyboard step still runs
    for (const row of [`${id}.${pickRow}`, ...(back ? [`${id}.back`] : [])])
      once(row, `${row}: needs the chooser's ${pick.head} (#${pick.seq})`, false, `no candidate #${pick.seq} was offered`, observe(state));
  }
  if (keyboard) {
    const other = `#reader-choice-${keyboard.seq}`;
    const current = await sheetState(page);
    if (current?.choiceState !== 'choose' || (await page.locator(other).count()) !== 1) {
      once(`${id}.key`, `${id}.key: needs the chooser's ${keyboard.head} (#${keyboard.seq})`, false, 'no chooser with that candidate', { entry: observe(current) });
    } else {
      await page.locator(other).focus();
      await page.keyboard.press('Enter');
      await settleSheet(page);
      const entryByKey = await sheetState(page);
      await page.locator('#sheet-back').focus();
      await page.keyboard.press('Enter');
      await chooserFocus(page, other.slice(1));
      const backByKey = await sheetState(page);
      once(`${id}.key`, `${at(fixture)}: Enter on ${keyboard.head}'s button opens #${keyboard.seq} displayed exactly ${keyboard.headword} read ${keyboard.reading}, "${keyboard.gloss}"; Enter on 戻る returns focus to that button`,
        shows(entryByKey, keyboard, 'chosen') && backByKey?.choiceState === 'choose' && backByKey.focused === other.slice(1),
        JSON.stringify({ entry: observe(entryByKey), back: observe(backByKey) }), { entry: observe(entryByKey), back: observe(backByKey) });
    }
  }
  await closeIfOpen(page);
}

/** A one-row fixture: Full entry opens the entry directly, by the rule named in `entry.by`, as displayed. */
async function singleFixture(page, once, id, fixture, entry) {
  await fullEntry(page, fixture);
  await settleSheet(page);
  const state = await sheetState(page);
  once(id, `${at(fixture)}: the one row opens directly, #${entry.seq} matched by ${entry.by}, displayed ${entry.headword} (head ${entry.head}) read ${entry.reading}, first sense "${entry.gloss}"`,
    shows(state, entry, 'single') && state.noteBy === entry.by && state.candidates.length === 0, brief(state), observe(state));
  await closeIfOpen(page);
}

/** G3/G6: the full-entry door of every lexical case, each article in a fresh document. */
async function matchRun(open, rec) {
  const page = await (await open()).newPage();
  await block(rec, ['M.iu.chooser', 'M.iu.choose', 'M.iu.back'], async (once) => {
    await openArticle(page, IU.passage);
    await chooserFixture(page, once, { fixture: IU, id: 'M.iu', choices: IU_CHOICES, pick: IU_PICK, pickRow: 'choose', back: true });
  });
  await block(rec, ['M.iu.yuu'], async (once) => {
    // r4: lookup()'s alt was computed for いう; beside the chosen head 結う it may never repeat it (結う／結う)
    await openArticle(page, IU.passage);
    await fullEntry(page, IU);
    await settleSheet(page);
    const yuu = IU_CHOICES.find((choice) => choice.head === '結う');
    let entry = null;
    if ((await page.locator(`#reader-choice-${yuu.seq}`).count()) === 1) {
      await press(page, `#reader-choice-${yuu.seq}`);
      await settleSheet(page);
      entry = await sheetState(page);
    }
    once('M.iu.yuu', `${at(IU)}: a real click on 結う/いう opens #${yuu.seq} displayed exactly 結う (no repeated alternate) read いう`,
      entry?.noteSeq === yuu.seq && entry.headword === '結う' && entry.headLabel === '結う' && entry.reading === 'いう',
      brief(entry), observe(entry));
    await closeIfOpen(page);
  });
  await block(rec, ['M.itt.chooser', 'M.itt.choose'], async (once) => {
    await openArticle(page, ITT.passage);
    await chooserFixture(page, once, { fixture: ITT, id: 'M.itt', choices: IU_CHOICES, pick: IU_PICK, pickRow: 'choose' });
  });
  await block(rec, ['M.dare.chooser', 'M.dare.tare', 'M.dare.back', 'M.dare.key'], async (once) => {
    await openArticle(page, DARE.passage);
    await chooserFixture(page, once, { fixture: DARE, id: 'M.dare', choices: DARE_CHOICES, pick: DARE_TARE, pickRow: 'tare', back: true, keyboard: DARE_WHO });
  });
  await block(rec, ['M.yuke.single'], async (once) => {
    await openArticle(page, YUKE.passage);
    await singleFixture(page, once, 'M.yuke.single', YUKE, YUKE_ENTRY);
  });
  await block(rec, ['M.hi.cap'], async (once) => {
    await openArticle(page, HI.passage);
    await fullEntry(page, HI);
    await settleSheet(page);
    const state = await sheetState(page);
    const listed = state ? state.candidates.map(({ seq, head, reading, gloss }) => ({ seq, head, reading, gloss })) : null;
    once('M.hi.cap', `${at(HI)}: at most six — exactly the first six of the ${HI_TOTAL} rows that list ひ, in the index's order, and "Showing 6 of ${HI_TOTAL} candidates"`,
      state?.choiceState === 'choose' && canonical(listed) === canonical(HI_FIRST_SIX) && state.more === `Showing 6 of ${HI_TOTAL} candidates`,
      brief(state), observe(state));
    await closeIfOpen(page);
  });
  await block(rec, ['M.wakat.single'], async (once) => {
    await openArticle(page, WAKAT.passage);
    await singleFixture(page, once, 'M.wakat.single', WAKAT, WAKARU_ENTRY);
  });
  await block(rec, ['M.san.offered'], async (once) => {
    await openArticle(page, SAN.passage);
    await fullEntry(page, SAN);
    await settleSheet(page);
    const state = await sheetState(page);
    const listed = state ? state.candidates.map(({ seq, head, reading }) => ({ seq, head, reading })) : null;
    once('M.san.offered', `${at(SAN)} read ${SAN.token.r} (the 産巣日 fragment): no entry of 産 is read ${SAN.token.r}, so its one entry is offered under its own reading, 産/うぶ #${SAN_ROW}, the mismatch named; nothing opens by itself and nothing says absent (r4)`,
      state?.node === `word:${SAN.token.b}` && state.choiceState === 'choose' && state.noteSeq === null && !state.senses
        && canonical(listed) === canonical([{ seq: SAN_ROW, head: '産', reading: 'うぶ' }])
        && typeof state.mismatchText === 'string' && state.mismatchText.includes(SAN.token.r)
        && state.noneText === null && !state.absent && state.takeDisabled === true,
      brief(state), observe(state));
    await closeIfOpen(page);
  });
}

/** G7: a real capture of the core hit through each of its four separately wired doors, each in its own context. */
async function captureRun(open, rec) {
  const doors = [
    { door: 'mini', name: "the mini's 覚", selector: '#mini-take', prepare: (page) => openPopup(page, CORE) },
    { door: 'seal', name: 'the chrome seal 覚える', selector: '#reader-take', seal: true, prepare: async (page) => { await tap(page, CORE); await dismissMiniForSeal(page); } },
    { door: 'sheet', name: "the entry sheet bar's 覚", selector: '#sheet-take', prepare: async (page) => { await fullEntry(page, CORE); await settleSheet(page); } },
    { door: 'foot', name: "the entry foot's 覚える", selector: '#take', prepare: async (page) => { await fullEntry(page, CORE); await settleSheet(page); } },
  ];
  for (const { door, name, selector, seal = false, prepare } of doors) {
    await block(rec, [`G7.${door}.door`, `G7.${door}.captured`], async (once) => {
      const page = await (await open()).newPage();
      await openArticle(page, CORE.passage);
      const before = await installedRecord(page);
      await prepare(page);
      const state = await doorState(page, selector, { scroll: !seal });
      const usable = state.count === 1 && state.own && state.disabled === false && state.ariaDisabled !== 'true' && !state.held;
      once(`G7.${door}.door`, `G7 ${name} on ${at(CORE)}: present once, enabled, not held, unpressed, its centre itself`,
        usable && state.pressed === 'false', JSON.stringify(state), state);
      if (!usable) {
        once(`G7.${door}.captured`, `G7 ${name}: needs a usable door`, false, 'no usable door to press', {});
        return;
      }
      await (seal ? pressSeal(page) : press(page, selector));
      const { record: after, met } = await recordUntil(page, (current) => current.taken.length > before.taken.length, 8_000);
      const added = after.taken.filter((row) => !before.taken.some((old) => old.t === row.t && old.id === row.id));
      const changed = LEARNING_ROOTS.filter((root) => root !== 'taken' && !isDeepStrictEqual(before[root] ?? null, after[root] ?? null));
      const row = added[0];
      const { ts, started, ...identity } = row || {};
      once(`G7.${door}.captured`, `G7 ${name} captures ${CORE.token.b} durably as exactly ${canonical(CAPTURED_ROW)} with started = ts, nothing else in the learning roots, no deepWords snapshot`,
        met && added.length === 1 && after.taken.length === before.taken.length + 1 && canonical(identity) === canonical(CAPTURED_ROW)
          && Number.isFinite(ts) && started === ts && changed.length === 0 && !Object.hasOwn(after.deepWords || {}, CORE.token.b),
        JSON.stringify({ added, changed }), { added, changed });
    });
  }
}

/** G5: the no-capture baseline on core misses, one document per article, with real clicks on every held door. */
async function heldRun(open, rec) {
  const page = await (await open()).newPage();
  await block(rec, RUN_ROWS.held, async (once) => {
    await openArticle(page, IU.passage);
    const before = await installedRecord(page);
    await openPopup(page, IU);
    const mini = (await captureState(page)).mini;
    once('G5.mini-held', `G5 ${at(IU)}: the miss-state mini holds its 覚 and shows why`, mini?.takeDisabled === true && mini.held
      && mini.describedBy === 'mini-take-reason' && mini.reasonVisible && mini.reason === 'So it can’t be saved here.', JSON.stringify(mini), { mini });
    await press(page, '#mini-take');
    const miniAfter = (await captureState(page)).mini;
    once('G5.mini-click', 'G5 a real click on that 覚 leaves it held and unpressed', miniAfter?.takeDisabled === true && miniAfter.held
      && miniAfter.takePressed === 'false', JSON.stringify(miniAfter), { mini: miniAfter });
    const seal = (await captureState(page)).seal;
    once('G5.seal-held', `G5 with ${IU.token.s} selected, the chrome seal is held (aria-disabled) and its name is the reason`,
      seal?.ariaDisabled === 'true' && seal.held && seal.label === CAPTURE_REASON(IU.token.b), JSON.stringify(seal), { seal });
    await pressSeal(page);
    const opened = await captureState(page);
    once('G5.seal-panel', 'G5 a real click on the held seal opens only the reason, with no capture control in the panel',
      !!opened.panel?.reasonVisible && opened.panel.reason === CAPTURE_REASON(IU.token.b) && opened.panel.captureControls === 0,
      JSON.stringify(opened.panel), { panel: opened.panel });
    await fullEntry(page, IU);
    await page.waitForFunction(() => !document.getElementById('capture-panel'), null, { timeout: 5_000 });
    await settleSheet(page);
    await press(page, '#sheet-take');
    const chooser = await sheetState(page);
    once('G5.iu-chooser-held', `G5 ${IU.token.s}'s chooser holds the sheet bar's 覚 under a real click, and says why`,
      chooser?.choiceState === 'choose' && chooser.takeDisabled === true && chooser.reasonVisible, brief(chooser), observe(chooser));
    let entry = null;
    if ((await page.locator(`#reader-choice-${IU_PICK.seq}`).count()) === 1) {
      await press(page, `#reader-choice-${IU_PICK.seq}`);
      await settleSheet(page);
      await press(page, '#sheet-take');
      await press(page, '#take');
      entry = await sheetState(page);
    }
    once('G5.iu-entry-held', `G5 the chosen ${IU_PICK.head} holds both 覚 doors under real clicks`,
      entry?.noteSeq === IU_PICK.seq && entry.takeDisabled === true && entry.footDisabled === true, brief(entry), observe(entry));
    await closeIfOpen(page);
    const afterIu = await learningSince(page, before);
    once('G5.after-iu', 'G5 after いう: the learning roots equal the first snapshot, and the only new rows are tap observations',
      afterIu.live && afterIu.changed.length === 0 && afterIu.added.length > 0 && afterIu.added.every((kind) => kind === 'tap'),
      JSON.stringify(afterIu), afterIu);
    await openArticle(page, DARE.passage);
    await fullEntry(page, DARE);
    await settleSheet(page);
    await press(page, '#sheet-take');
    let tare = null;
    if ((await page.locator(`#reader-choice-${DARE_TARE.seq}`).count()) === 1) {
      await press(page, `#reader-choice-${DARE_TARE.seq}`);
      await settleSheet(page);
      await press(page, '#sheet-take');
      await press(page, '#take');
      tare = await sheetState(page);
    }
    once('G5.dare-held', `G5 ${DARE.token.s}'s chosen ${DARE_TARE.head} holds both 覚 doors under real clicks`,
      tare?.noteSeq === DARE_TARE.seq && tare.takeDisabled === true && tare.footDisabled === true, brief(tare), observe(tare));
    await closeIfOpen(page);
    const afterDare = await learningSince(page, before);
    once('G5.after-dare', 'G5 after だれ: the learning roots still equal the first snapshot, and the only new rows are tap observations',
      afterDare.live && afterDare.changed.length === 0 && afterDare.added.every((kind) => kind === 'tap'), JSON.stringify(afterDare), afterDare);
  });
}

const SCHEDULES = Object.freeze({ core: coreRun, match: matchRun, capture: captureRun, held: heldRun });

/** A candidate schedule: fresh contexts, the candidate's own bytes, rows recorded as verdicts. */
async function candidateSchedule(name) {
  currentCase = `S-${name}`;
  const contexts = [];
  const open = async () => { const context = await newContext(pageErrors); contexts.push(context); return context; };
  try { await SCHEDULES[name](open, record); } catch (error) {
    results.push({ case: currentCase, name: `${currentCase} terminal`, pass: false, detail: error.stack || String(error) });
    console.log(`  FAIL ${currentCase} terminal — ${error.message}`);
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
  }
}

/** A candidate-only case: its own contexts; a terminal failure is recorded and the run goes on. */
async function runCase(name, body) {
  currentCase = name;
  const contexts = [];
  const open = async () => { const context = await newContext(pageErrors); contexts.push(context); return context; };
  try { await body(open); } catch (error) {
    results.push({ case: name, name: `${name} terminal`, pass: false, detail: error.stack || String(error) });
    console.log(`  FAIL ${name} terminal — ${error.message}`);
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
  }
}

async function runControl(spec) {
  currentCase = `C-${spec.name}`;
  const edits = spec.edits.map((key) => ({ key, ...EDITS[key] }));
  const control = { name: spec.name, title: spec.title, run: spec.run,
    edits: edits.map(({ key, file, from, to }) => ({ key, file, from, to, fromSha256: sha256(from), toSha256: sha256(to) })),
    served: [], rows: [], pageErrors: [], setupError: null, error: null, verdict: null, reason: null };
  const rec = (id, name, pass, detail = '', observed) => {
    control.rows.push({ id, name, pass: !!pass, detail, ...(observed === undefined ? {} : { observed }) });
    console.log(`    [${spec.name}] ${pass ? 'ok  ' : 'fail'} ${name}`);
  };
  const contexts = [];
  const open = async () => { const context = await newContext(control.pageErrors, { control, edits }); contexts.push(context); return context; };
  try { await SCHEDULES[spec.run](open, rec); } catch (error) { control.error = error.message; } finally {
    for (const context of contexts) await context.close().catch(() => {});
  }
  [control.verdict, control.reason] = adjudicate(spec, control, { runRows: RUN_ROWS, editFile: (key) => EDITS[key].file, candidateRows: results, foundationIds: F0_IDS });
  check(`C ${spec.name} (${spec.title}) is killed by ${spec.kills.join(' + ')}`, control.verdict === 'killed', `${control.verdict}: ${control.reason}`,
    { id: `C.${spec.name}` });
  return control;
}

try {
  host = await startStaticHost({ site: SITE, port: 0 });
  origin = host.origin;
  browser = await ({ chromium, webkit })[ENGINE].launch();

  currentCase = 'G0';
  {
    const context = await newContext(pageErrors);
    try {
      const page = await context.newPage();
      await page.goto(`${origin}/index.html?entry=shelf`); await ready(page);
      const identity = await (await page.request.get(`${origin}/build-identity.json`)).json();
      manifest = new Map(identity.files.map((row) => [row.path, row.sha256]));
      let head = null; try { head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* outside a checkout */ }
      const expected = process.env.KAIRO_EXPECT_GITSHA || head;
      const served = async (path) => sha256(Buffer.from(await (await page.request.get(`${origin}/${path}`)).body()));
      const js = await served('corridor.js'), css = await served('corridor.css');
      check('G0 served build is the expected clean commit (corridor.js and corridor.css)', identity.gitSha === expected && identity.sourceDirty === false
        && js === manifest.get('corridor.js') && css === manifest.get('corridor.css'), `served=${identity.gitSha} expected=${expected}`, { id: 'G0.identity' });
      if (results.some((r) => !r.pass)) throw new Error('identity failed');

      currentCase = 'F0';
      const json = async (path) => {
        const response = await page.request.get(`${origin}/${path}`);
        must(response.ok(), `${path} is served`);
        return response.json();
      };
      const articles = new Map();
      for (const fixture of FIXTURES) {
        if (!articles.has(fixture.passage.id)) articles.set(fixture.passage.id, await json(fixture.passage.file));
        const article = articles.get(fixture.passage.id);
        const token = article.tokens?.[fixture.index];
        check(`F0 ${fixture.passage.id} #${fixture.index} is exactly ${canonical(fixture.token)}`, article.id === fixture.passage.id
          && canonical(token) === canonical(fixture.token), JSON.stringify(token), { id: `F0.${fixture.passage.id}#${fixture.index}` });
      }
      const dict = (await json('data/share_alike/dict.json')).words;
      const words = (await json('data/share_alike/words.json')).words;
      check(`F0 ${CORE.token.b} is a core hit read ${CORE_ENTRY.reading} whose first sense is "${CORE_ENTRY.gloss}"`,
        dict[CORE.token.b]?.r === CORE_ENTRY.reading && dict[CORE.token.b]?.m?.[0] === CORE_ENTRY.gloss, JSON.stringify(dict[CORE.token.b]), { id: 'F0.core' });
      check(`F0 ${MISS_BASES.join(', ')} are core misses; いう has no word-layer gloss (the quick look's miss)`,
        MISS_BASES.every((base) => !Object.hasOwn(dict, base)) && !words[IU.token.b]?.g, JSON.stringify(words[IU.token.b] ?? null), { id: 'F0.misses' });
      const index = await json(INDEX_PATH.slice(1));
      must(Array.isArray(index.entries), 'the served index carries its entries');
      const rowsOf = (form) => index.entries.filter((row) => row[1] === form || row[4].includes(form) || row[5].includes(form));
      const bySeq = new Map(index.entries.map((row) => [String(row[0]), row]));
      const seqs = (form) => rowsOf(form).map((row) => String(row[0])).sort((a, b) => Number(a) - Number(b));
      const lists = (seq, reading) => (bySeq.get(seq)?.[5] || []).some((kana) => hira(kana) === hira(reading));
      // a reading's own written-form restriction, by its exact index: 0 every written form, 1 none, an array the permitted indexes
      const permits = (seq, reading, form) => {
        const row = bySeq.get(seq);
        const k = row?.[5].indexOf(reading) ?? -1, w = row?.[4].indexOf(form) ?? -1;
        return k >= 0 && w >= 0 && (row[11][k] === 0 || (Array.isArray(row[11][k]) && row[11][k].includes(w)));
      };
      check('F0 いう: the rows carrying it are exactly 結う#1254600 and 言う#1587040, and both list いう (結う reads ゆう first)',
        canonical(seqs('いう')) === canonical(['1254600', '1587040']) && lists('1254600', 'いう') && lists('1587040', 'いう')
          && bySeq.get('1254600')[5][0] === 'ゆう' && permits('1254600', 'いう', '結う') && permits('1587040', 'いう', '言う'),
        JSON.stringify(seqs('いう')), { id: 'F0.iu' });
      check('F0 だれ: the rows carrying it are 垂れ/たれ#1370860, 誰#1416830 and ダレ#2665140, each listing だれ; 1370860 lets だれ be written 垂れ; ダレ is kana only',
        canonical(seqs('だれ')) === canonical(['1370860', '1416830', '2665140']) && ['1370860', '1416830', '2665140'].every((seq) => lists(seq, 'だれ'))
          && permits('1370860', 'だれ', '垂れ') && bySeq.get('1370860')[4][1] === '垂' && bySeq.get('2665140')[4].length === 0,
        JSON.stringify(seqs('だれ')), { id: 'F0.dare' });
      check('F0 ゆく: the one row carrying it is 行く#1578850, which lists ゆく (after いく) and lets it be written 行く and 往く',
        canonical(seqs('ゆく')) === canonical(['1578850']) && bySeq.get('1578850')[5][1] === 'ゆく' && permits('1578850', 'ゆく', '行く')
          && permits('1578850', 'ゆく', '往く'), JSON.stringify(seqs('ゆく')), { id: 'F0.yuku' });
      check('F0 産: the one row carrying it, #2036160, reads only ウブ/うぶ, never さん',
        canonical(seqs('産')) === canonical([SAN_ROW]) && bySeq.get(SAN_ROW)[4].includes('産')
          && bySeq.get(SAN_ROW)[5].every((kana) => hira(kana) === 'うぶ') && !lists(SAN_ROW, 'さん'), JSON.stringify(bySeq.get(SAN_ROW)?.[5]), { id: 'F0.san' });
      const hiRows = rowsOf('ひ').filter((row) => row[5].some((kana) => hira(kana) === 'ひ')).map((row) => String(row[0]));
      check(`F0 ひ: ${HI_TOTAL} rows list it, the six expected among them, each with that head and first gloss`,
        hiRows.length === HI_TOTAL && HI_FIRST_SIX.every((c) => hiRows.includes(c.seq) && bySeq.get(c.seq)[4].includes(c.head) && bySeq.get(c.seq)[3] === c.gloss),
        JSON.stringify(hiRows), { id: 'F0.hi' });
      check('F0 分かる and 見込: one row each, 分かる#1606560 read わかる and 見込み#1604480 read みこみ, both writing the base form',
        canonical(seqs('分かる')) === canonical(['1606560']) && permits('1606560', 'わかる', '分かる')
          && canonical(seqs('見込')) === canonical(['1604480']) && permits('1604480', 'みこみ', '見込'), JSON.stringify([seqs('分かる'), seqs('見込')]), { id: 'F0.bases' });
      check('F0 the chooser glosses are the rows\' own summaries', [...IU_CHOICES, ...DARE_CHOICES].every((c) => bySeq.get(c.seq)?.[3] === c.gloss),
        JSON.stringify([...IU_CHOICES, ...DARE_CHOICES].map((c) => bySeq.get(c.seq)?.[3])), { id: 'F0.glosses' });
      const shards = new Map();
      for (let shard = 0; shard < 16; shard++) {
        for (const entry of (await json(`data/share_alike/dict-v2/${shard.toString(16).padStart(2, '0')}.json`)).entries) shards.set(String(entry[0]), entry);
      }
      const firstSenses = Object.fromEntries(Object.keys(FIRST_SENSES).map((seq) => {
        const gloss = shards.get(seq)?.[3]?.[0]?.[10]?.[0];
        return [seq, gloss && !gloss[1] && !gloss[2] ? gloss[0] : null];
      }));
      check('F0 every asserted first sense is the served shard\'s own, unmarked', canonical(firstSenses) === canonical(FIRST_SENSES),
        JSON.stringify(firstSenses), { id: 'F0.senses' });
    } finally {
      await context.close().catch(() => {});
    }
  }

  for (const name of Object.keys(SCHEDULES)) await candidateSchedule(name);

  for (const lang of ['bi', 'ja']) {
    await runCase(`G2 ${lang}`, async (open) => {
      const page = await (await open()).newPage();
      await openArticle(page, IU.passage, `dials=0,1,0&ui=${lang}`);
      await tap(page, IU);
      const one = await tokenState(page, IU), mini = await miniState(page);
      check(`G2 ${lang}: one tap shows the honest dictionary miss in the popup`,
        mini?.word === IU.token.b && mini.reading === IU.token.r
          && mini.gloss === `<span class="mini-gloss mini-miss">${MISS[lang]}</span>`
          && !/no gloss yet|語釈なし|No dictionary entry for this spelling\.|この表記の辞書項目はありません。/u.test(mini.text), JSON.stringify(mini), { id: `G2.${lang}.popup` });
      check(`G2 ${lang}: prose keeps its surface and plain word name with keyboard instructions`,
        one?.surface === IU.token.s && one.lines === 0 && !one.hasEn
          && one.label === `${IU.token.s} · ${WORD[lang]} · ${HINT[lang]}`, JSON.stringify(one), { id: `G2.${lang}.prose` });
      await tap(page, IU);
      check(`G2 ${lang}: tapping the same word dismisses its popup without a gloss rung`,
        await page.locator('#mini').count() === 0 && (await tokenState(page, IU))?.lines === 0, '', { id: `G2.${lang}.dismiss` });
      const word = page.locator(`#reader .tok[data-index="${IU.index}"]`);
      await word.focus();
      await page.keyboard.press('Enter');
      await page.locator('#mini').waitFor();
      check(`G2 ${lang}: Enter reopens the popup and focuses Full entry for an unsavable word`,
        await page.locator('#mini .mini-entry').evaluate(node => node === document.activeElement), '', { id: `G2.${lang}.keyboard` });
      await page.keyboard.press('Escape');
      await page.locator('#mini').waitFor({ state: 'detached' });
      check(`G2 ${lang}: Escape returns focus to the original word`,
        await word.evaluate(node => node === document.activeElement), '', { id: `G2.${lang}.escape` });
    });
  }

  await runCase('G4', async (open) => {
    const context = await open();
    const fail = (route) => {
      faults.index500 += 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"syntheticFailure":"verify-reader-gloss G4"}' });
    };
    await context.route(isIndex, fail);
    const page = await context.newPage();
    await openArticle(page, IU.passage);
    await fullEntry(page, IU);
    await settleSheet(page);
    const down = await sheetState(page);
    check('G4 the 500 on the index demonstrably fired', faults.index500 > 0, `index 500s: ${faults.index500}`, { id: 'G4.fired' });
    check('G4 Full entry on いう shows the honest unavailable state with a retry', down?.choiceState === 'unavailable'
      && down.unavailable === UNAVAILABLE && down.retry, brief(down), { id: 'G4.unavailable' });
    check('G4 nothing opens and nothing is offered; 覚 is held and says why', down?.noteSeq === null && down.candidates.length === 0
      && !down.senses && down.takeDisabled === true && down.reasonVisible, brief(down), { id: 'G4.nothing' });
    await closeIfOpen(page);
    await openPopup(page, CORE);
    const core = await miniState(page);
    check('G4 with the index down, the core hit still glosses', core?.gloss === `<span class="mini-gloss">${CORE_ENTRY.gloss}</span>`, JSON.stringify(core),
      { id: 'G4.core' });
    await openPopup(page, IU);
    const miss = await miniState(page);
    check('G4 with the index down, いう still says its honest miss', miss?.gloss === `<span class="mini-gloss mini-miss">${MISS.bi}</span>`, JSON.stringify(miss),
      { id: 'G4.miss' });
    const seenFaults = faults.index500;
    await fullEntry(page, IU);
    await settleSheet(page);
    const again = await sheetState(page);
    check('G4 reopening Full entry asks the index again and is still honestly unavailable', again?.choiceState === 'unavailable'
      && faults.index500 > seenFaults, `${brief(again)} · index 500s: ${faults.index500}`, { id: 'G4.again' });
    await context.unroute(isIndex, fail);
    await press(page, '#reader-choice-retry');
    await settleSheet(page);
    const recovered = await sheetState(page);
    check('G4 once the fault clears, the retry lists いう\'s two candidates', recovered?.choiceState === 'choose'
      && canonical(recovered.candidates.map((c) => c.seq)) === canonical(IU_CHOICES.map((c) => c.seq)), brief(recovered), { id: 'G4.recovered' });
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
      await openArticle(page, IU.passage);
      await fullEntry(page, IU);
      for (let attempt = 0; attempt < 60 && !faults.indexHeld; attempt++) await delay(250);
      must(faults.indexHeld > 0, 'the index request reached the held route');
      const pending = await sheetState(page);
      check('G4 stale: いう waits on the held index (the existing opening line)', pending?.choiceState === 'pending', brief(pending), { id: 'G4s.pending' });
      await press(page, '#sheet-back');
      await page.waitForFunction(() => !document.getElementById('sheet'), null, { timeout: 5_000 });
      await fullEntry(page, MIKOMI);
      await page.waitForFunction(() => document.querySelector('#sheet')?.dataset.node === 'word:見込'
        && document.querySelector('#sheet #reader-choice')?.dataset.state === 'pending', null, { timeout: 5_000 });
      release();
      await settleSheet(page);
      const first = await sheetState(page);
      await delay(1_000);
      const later = await sheetState(page);
      check(`G4 stale: the released index paints 見込's own entry, #${MIKOMI_ENTRY.seq} displayed ${MIKOMI_ENTRY.headword} read ${MIKOMI_ENTRY.reading}`,
        first?.node === 'word:見込' && shows(first, MIKOMI_ENTRY, 'single') && first.noteBy === MIKOMI_ENTRY.by, brief(first), { id: 'G4s.mikomi' });
      check('G4 stale: いう\'s abandoned answer opens nothing and paints nothing', [first, later].every((state) => state?.node === 'word:見込'
        && state.noteSeq === MIKOMI_ENTRY.seq && state.depth === null && !state.offers.includes(IU_PICK.seq)), `${brief(first)} → ${brief(later)}`,
      { id: 'G4s.no-stale' });
    } finally {
      release();
    }
  });

  for (const spec of CONTROLS) controls.push(await runControl(spec));
} catch (error) {
  results.push({ case: currentCase, name: `terminal (${currentCase})`, pass: false, detail: error.stack || String(error) });
  console.log(`  FAIL terminal in ${currentCase} — ${error.message}`);
} finally {
  await browser?.close().catch((error) => results.push({ name: 'browser · cleanup', pass: false, detail: error.message }));
  await host?.close().catch((error) => results.push({ name: 'host · cleanup', pass: false, detail: error.message }));
  if (pageErrors.length) results.push({ name: 'no uncaught page errors', pass: false, detail: JSON.stringify(pageErrors) });
  writeFileSync(resolve(EVIDENCE, 'reader-gloss.json'), JSON.stringify({
    origin, engine: ENGINE, fixtures: { FIXTURES, IU_CHOICES, IU_PICK, DARE_CHOICES, DARE_TARE, DARE_WHO, YUKE_ENTRY, WAKARU_ENTRY, MIKOMI_ENTRY, HI_FIRST_SIX,
      HI_TOTAL, SAN_ROW, CORE_ENTRY, CAPTURED_ROW, FIRST_SENSES },
    faults, results, controls, pageErrors, lastCase: currentCase,
  }, null, 2) + '\n');
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · evidence ${EVIDENCE}`);
process.exit(failed.length ? 1 : 0);
