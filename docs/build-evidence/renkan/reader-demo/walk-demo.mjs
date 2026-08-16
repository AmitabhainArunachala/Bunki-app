#!/usr/bin/env node
/**
 * RENKAN C1 — the exact-SHA end-to-end reader demonstration.
 *
 * Rubric: docs/operator/BUNKI_READING_EXCELLENCE_RUBRIC_AND_CLOSURE_SPEC_2026-08-15.md
 * (§8 R0/R1, §9.8 screenshot itinerary) and the constitution's §8 golden walk.
 *
 * READ-ONLY on the product: this script serves prototypes/corridor as-is with
 * `python3 -m http.server` and drives it with playwright-core (chromium,
 * mobile emulation 390×844 primary + a 320×568 spot check). It writes only
 * evidence: screenshots + walk-log.json + README.md under
 * docs/build-evidence/renkan/reader-demo/<full-head-sha>/.
 *
 * Honesty rules (campaign):
 *  - every assertion that fails is recorded as FAIL with detail; the walk
 *    continues and captures the failure screenshot;
 *  - the walk asserts what IS true — it never fakes a door that is absent;
 *  - web-verified only, no physical device, no audio (the corridor has none).
 *
 * Determinism: fresh learner store (cold open), fixed articles
 * (wikinews:1403 for the approved lane, bunki-graded-n3-zoka-sanjin-morning
 * as the flagship 検収前 reading), fixed token indices (0 朝 for the tap
 * ladder, 282 結論 for quick look / capture).
 */
import { chromium } from 'playwright-core';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const SERVE_DIR = join(REPO, 'prototypes', 'corridor');
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8907;
const BASE = `http://127.0.0.1:${PORT}`;
const APP = `${BASE}/index.html?ui=bi&entry=shelf`;

const FLAGSHIP = 'bunki-graded-n3-zoka-sanjin-morning';
const FLAGSHIP_TITLE = '造化三神に出会う朝';
const APPROVED = 'wikinews:1403';
const APPROVED_TITLE = '世界自然遺産に7箇所を追加 知床半島も';
const LADDER_INDEX = 0; //  朝 — first token, on-screen at article top
const LADDER_WORD = '朝';
const CAPTURE_INDEX = 282; // 結論 — mid-article content word (para 3)
const CAPTURE_WORD = '結論';
const STORE_KEY = 'kairo-corridor-v1';

const git = (...args) => execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).trim();
const SHA = git('rev-parse', 'HEAD');
const TREE = git('rev-parse', 'HEAD^{tree}');
const BRANCH = git('rev-parse', '--abbrev-ref', 'HEAD');
const DIRTY = git('status', '--porcelain')
  .split('\n')
  .filter((l) => l && !l.includes('docs/build-evidence/renkan/reader-demo'));

const OUT = join(HERE, SHA);
mkdirSync(OUT, { recursive: true });

/* ---------------------------------------------------------------- logbook */
const log = {
  campaign: 'RENKAN one-push 2026-08-16 · Wave C · C1 reader demonstration',
  product: 'Bunki corridor prototype (KAIRO) — prototypes/corridor',
  coordinate: {
    gitSha: SHA,
    gitTree: TREE,
    branch: BRANCH,
    workingTreeClean: DIRTY.length === 0,
    workingTreeNote: DIRTY.length ? `uncommitted paths outside evidence dir: ${DIRTY.join(', ')}` : 'clean apart from this evidence dir',
    serveMode: `python3 -m http.server ${PORT} --bind 127.0.0.1 (cwd: prototypes/corridor, static, unmodified tree)`,
    url: APP,
    browser: `playwright-core chromium (headless), executable ${CHROMIUM}`,
    viewportPrimary: '390x844, deviceScaleFactor 3, mobile emulation with touch (iPhone 12/13/14 class)',
    viewportSpotCheck: '320x568, deviceScaleFactor 2, mobile emulation with touch (iPhone SE 1st-gen class)',
    learnerState: 'cold open — empty localStorage; every later stage builds on the state the walk itself created',
    generatedAt: new Date().toISOString(),
  },
  honesty: {
    webVerifiedOnly: true,
    physicalDevice: false,
    deployedUrl: false,
    audio: 'the corridor reader has NO audio implementation (rubric §3.4) — no audio stage exists to walk',
    note: 'headless Chromium mobile emulation on a local static server; not a physical-iPhone audit and not a deployed-URL receipt',
  },
  fixedChoices: {
    flagship: { id: FLAGSHIP, title: FLAGSHIP_TITLE, lane: '段階別読み物 · Bunki · 検収前 (human-review-pending)' },
    approved: { id: APPROVED, title: APPROVED_TITLE, lane: 'ウィキニュース CC BY 2.5 (approved lane)' },
    ladderToken: { index: LADDER_INDEX, word: LADDER_WORD },
    captureToken: { index: CAPTURE_INDEX, word: CAPTURE_WORD },
  },
  stages: [],
  console: [],
  requestFailures: [],
  totals: null,
};

let stageNo = 0;
let currentStage = null;
function stage(id, title) {
  stageNo += 1;
  currentStage = { n: stageNo, id, title, screenshots: [], assertions: [], status: 'PASS' };
  log.stages.push(currentStage);
  console.log(`\n== stage ${String(stageNo).padStart(2, '0')} · ${id} — ${title}`);
  return currentStage;
}
function assert(name, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  currentStage.assertions.push({ name, status, detail: String(detail) });
  if (!ok) currentStage.status = 'FAIL';
  console.log(`   ${status}  ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}
function info(name, detail = '') {
  currentStage.assertions.push({ name, status: 'INFO', detail: String(detail) });
  console.log(`   INFO  ${name}${detail ? ` — ${detail}` : ''}`);
}
async function shot(page, label) {
  const file = `${String(stageNo).padStart(2, '0')}-${currentStage.id}-${label}.png`;
  await page.screenshot({ path: join(OUT, file) });
  currentStage.screenshots.push(file);
  console.log(`   shot  ${file}`);
  return file;
}

/* ------------------------------------------------------------ page helpers */
const store = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), STORE_KEY);
const scrollY = (page) => page.evaluate(() => Math.round(window.scrollY));
const tokCount = (page) => page.locator('#reader .tok').count();
async function waitReader(page, minTokens = 1) {
  await page.waitForFunction(
    (n) => document.querySelectorAll('#reader .tok').length >= n,
    minTokens,
    { timeout: 20000 },
  );
}
async function settle(page, ms = 250) {
  await page.waitForTimeout(ms);
}
/** Center a token in the viewport — top-aligned scrolling parks it under the
 * fixed chrome bar, where a real finger (and Playwright) cannot land. */
async function centerTok(page, index) {
  await page.evaluate((i) => {
    document.querySelector(`#reader .tok[data-index="${i}"]`)?.scrollIntoView({ block: 'center' });
  }, index);
  await settle(page, 300);
}
/** A point inside the token that the token itself actually receives.
 * Finding (recorded in the walk-log): the 44px expanded hit regions of
 * adjacent tokens overlap, and the LATER token in DOM order wins the overlap
 * — the geometric center of a narrow token can resolve to its neighbour. */
async function tokPoint(page, index) {
  return page.evaluate((i) => {
    const tok = document.querySelector(`#reader .tok[data-index="${i}"]`);
    if (!tok) return null;
    const r = tok.getBoundingClientRect();
    const center = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const centerOwn = !!center && (center === tok || tok.contains(center));
    for (const fx of [0.5, 0.35, 0.25, 0.15, 0.65, 0.75]) {
      for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const x = r.x + r.width * fx;
        const y = r.y + r.height * fy;
        const el = document.elementFromPoint(x, y);
        if (el && (el === tok || tok.contains(el))) {
          return { x, y, fx, fy, centerOwn, centerHit: center ? `${center.tagName}.${center.className}` : null };
        }
      }
    }
    return null;
  }, index);
}
async function tapTok(page, index) {
  const p = await tokPoint(page, index);
  if (!p) throw new Error(`no point on token ${index} receives the tap`);
  await page.mouse.click(p.x, p.y);
  return p;
}

/* --------------------------------------------------------------- the walk */
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: SERVE_DIR,
  stdio: 'ignore',
});
process.on('exit', () => server.kill());

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
// evidence hook only: capture the export blob's bytes so the envelope can be
// asserted (the sandboxed viewer cannot complete a real download). This does
// not alter product behavior — createObjectURL still returns its real URL.
await context.addInitScript(() => {
  window.__walkExports = [];
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = orig(blob);
    try {
      if (blob instanceof Blob) blob.text().then((text) => window.__walkExports.push({ url, text }));
    } catch {}
    return url;
  };
});
const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning')
    log.console.push({ type: msg.type(), text: msg.text().slice(0, 400) });
});
page.on('pageerror', (err) => log.console.push({ type: 'pageerror', text: String(err).slice(0, 400) }));
page.on('requestfailed', (req) =>
  log.requestFailures.push({ url: req.url(), failure: req.failure()?.errorText || '?' }),
);
page.on('response', (res) => {
  if (res.status() >= 400) log.requestFailures.push({ url: res.url(), failure: `HTTP ${res.status()}` });
});
page.on('download', (d) => d.cancel().catch(() => {}));

// wait for the server (Node-side probe — keeps the page's console record clean)
for (let i = 0; i < 50; i++) {
  try {
    const res = await fetch(`${BASE}/data/manifest.json`);
    if (res.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

try {
  /* ---- 01 cold-open shelf ------------------------------------------------ */
  stage('cold-open-shelf', 'cold open of the bookshelf at 390×844 (?ui=bi)');
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForSelector('#shelf-body .shelf-item', { timeout: 30000 });
  await settle(page, 600);
  assert('cold open lands on the bookshelf', await page.locator('#shelf-body').count() === 1);
  const freshStore = await store(page);
  assert(
    'learner state is cold (no taken items, no srs, no revlog)',
    !freshStore || ((freshStore.taken || []).length === 0 && Object.keys(freshStore.srs || {}).length === 0 && (freshStore.revlog || []).length === 0),
    `store=${freshStore ? 'seeded-empty envelope' : 'absent'}`,
  );
  const sections = await page.$$eval('.shelf-section', (els) => els.map((e) => e.textContent.trim()));
  assert('shelf renders category sections', sections.length >= 3, `sections: ${sections.join(' | ')}`);
  assert('段階別読み物 (graded readings) section present', sections.some((s) => s.includes('段階別読み物')));
  assert('ニュース (news) section present', sections.some((s) => s.includes('ニュース')));
  const enTitles = await page.locator('.shelf-title-en').count();
  const cards = await page.locator('.shelf-item').count();
  assert('EN titles rendered under ?ui=bi', enTitles > 0, `${enTitles} EN titles on ${cards} cards`);
  assert('every shelf card carries an EN title', enTitles === cards, `${enTitles}/${cards}`);
  const kenshu = await page.$$eval('.shelf-meta', (els) => els.filter((e) => e.textContent.includes('検収前')).length);
  assert('検収前 (pre-acceptance) marks visible on unapproved cards', kenshu > 0, `${kenshu} cards marked 検収前`);
  info('shelf intro line', await page.locator('.shelf-snippet.intro').first().textContent());
  await shot(page, 'top-390x844');
  await page.locator(`.shelf-item[data-passage="${FLAGSHIP}"]`).scrollIntoViewIfNeeded();
  await settle(page, 300);
  await shot(page, 'graded-section-390x844');

  /* ---- 02 approved-lane article ----------------------------------------- */
  stage('open-approved-article', 'approved lane: a wikinews article opens with its full body');
  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForSelector('#shelf-body .shelf-item', { timeout: 30000 });
  const approvedCard = page.locator(`.shelf-item[data-passage="${APPROVED}"] .shelf-open`);
  await approvedCard.scrollIntoViewIfNeeded();
  const shelfYBeforeApproved = await scrollY(page);
  await approvedCard.click();
  await waitReader(page, 10);
  await settle(page, 400);
  const approvedH1 = (await page.locator('h1.view-title').textContent()).trim();
  assert('reader title matches the index exactly', approvedH1 === APPROVED_TITLE, `h1="${approvedH1}"`);
  const approvedToks = await tokCount(page);
  assert('article body loads as interactive tokens', approvedToks > 50, `${approvedToks} tokens rendered`);
  assert(
    'attribution + licence present at body end',
    await page.locator('main .note a.inline-link').count() >= 1,
    await page.locator('main .note').last().textContent(),
  );
  const approvedEyebrow = (await page.locator('main .eyebrow').first().textContent()).trim();
  assert('approved lane labeled (no 検収前 mark)', approvedEyebrow.includes('ウィキニュース') && !approvedEyebrow.includes('検収前'), `eyebrow="${approvedEyebrow}"`);
  await shot(page, 'reader-390x844');
  await page.locator('#back').click();
  await page.waitForSelector('#shelf-body', { timeout: 10000 });
  await settle(page, 300);
  const shelfYAfterBack = await scrollY(page);
  assert(
    'back returns to the shelf at the same scroll position',
    Math.abs(shelfYAfterBack - shelfYBeforeApproved) <= 20,
    `before=${shelfYBeforeApproved}px after=${shelfYAfterBack}px`,
  );

  /* ---- 03 flagship 検収前 article ---------------------------------------- */
  stage('open-flagship-article', 'the flagship 検収前 reading opens (bunki-graded-n3-zoka-sanjin-morning)');
  const flagCard = page.locator(`.shelf-item[data-passage="${FLAGSHIP}"] .shelf-open`);
  await flagCard.scrollIntoViewIfNeeded();
  await settle(page, 150);
  const shelfYBeforeFlag = await scrollY(page);
  await flagCard.click();
  await waitReader(page, 600);
  await settle(page, 400);
  const flagH1 = (await page.locator('h1.view-title').textContent()).trim();
  assert('reader title matches the index exactly', flagH1 === FLAGSHIP_TITLE, `h1="${flagH1}"`);
  const flagEyebrow = (await page.locator('main .eyebrow').first().textContent()).trim();
  assert('検収前 provenance carried into the reader', flagEyebrow.includes('検収前'), `eyebrow="${flagEyebrow}"`);
  const flagToks = await tokCount(page);
  assert('full 703-token body rendered', flagToks >= 650, `${flagToks} tokens`);
  info('level line', (await page.locator('.level-line').first().textContent()).trim());
  await shot(page, 'reader-top-390x844');

  /* ---- 04 dial: kanji ---------------------------------------------------- */
  stage('dial-kanji', '文字設定: the kanji dial (すべて仮名)');
  await page.locator('#dials-toggle').click();
  await page.waitForSelector('[data-dial="kanji:2"]');
  await page.locator('[data-dial="kanji:2"]').click();
  await settle(page, 400);
  assert(
    'dial reflects the choice (aria-pressed)',
    (await page.locator('[data-dial="kanji:2"]').getAttribute('aria-pressed')) === 'true',
  );
  const kanaText = await page.locator(`#reader .tok[data-index="2"]`).textContent();
  assert('図書 renders as kana としょ in all-kana mode', kanaText.includes('としょ') && !kanaText.includes('図書'), `token 2 = "${kanaText.trim()}"`);
  await shot(page, 'all-kana-390x844');
  await page.locator('[data-dial="kanji:0"]').click();
  await settle(page, 300);
  const backText = await page.locator(`#reader .tok[data-index="2"]`).textContent();
  assert('dial returns — そのまま restores 図書', backText.includes('図書'), `token 2 = "${backText.trim()}"`);

  /* ---- 05 dial: furigana ------------------------------------------------- */
  stage('dial-furigana', '文字設定: the furigana dial (つねに)');
  await page.locator('[data-dial="furigana:2"]').click();
  await settle(page, 400);
  const visibleRt = await page.$$eval('#reader rt', (els) => els.filter((e) => !e.classList.contains('hidden-rt')).length);
  assert('ふりがな つねに shows readings across the body', visibleRt > 100, `${visibleRt} visible rt elements`);
  await shot(page, 'furigana-always-390x844');
  await page.locator('[data-dial="furigana:1"]').click();
  await settle(page, 300);
  const hiddenRt = await page.$$eval('#reader rt', (els) => els.filter((e) => e.classList.contains('hidden-rt')).length);
  assert('ふりがな 触れて hides readings until touched', hiddenRt > 100, `${hiddenRt} hidden rt elements`);

  /* ---- 06 dial: spacing -------------------------------------------------- */
  stage('dial-spacing', '文字設定: the spacing dial (文節 → 語の間 → なし)');
  await page.locator('[data-dial="spacing:2"]').click();
  await settle(page, 400);
  const bunsetsu = await page.locator('#reader .bunsetsu').count();
  assert(
    '文節 groups the text into phrase units',
    (await page.locator('#reader.sp-bunsetsu').count()) === 1 && bunsetsu > 50,
    `${bunsetsu} phrase groups`,
  );
  await shot(page, 'spacing-bunsetsu-390x844');
  await page.locator('[data-dial="spacing:1"]').click();
  await settle(page, 300);
  assert('語の間 word spacing applies', (await page.locator('#reader.sp-word').count()) === 1);
  await shot(page, 'spacing-words-390x844');
  await page.locator('[data-dial="spacing:0"]').click();
  await settle(page, 300);
  assert(
    'なし restores the unspaced text',
    (await page.locator('#reader.sp-word, #reader.sp-bunsetsu').count()) === 0,
  );
  await page.locator('#dials-toggle').click(); // fold the dials away
  await settle(page, 200);

  /* ---- 07 tap ladder ----------------------------------------------------- */
  stage('tap-ladder', `the progressive tap ladder on 「${LADDER_WORD}」: furigana → gloss → plain`);
  const ladderTok = () => page.locator(`#reader .tok[data-index="${LADDER_INDEX}"]`);
  await centerTok(page, LADDER_INDEX);
  const rtBefore = await ladderTok().evaluate((el) => [...el.querySelectorAll('rt')].every((r) => r.classList.contains('hidden-rt')));
  assert('before any tap the reading is hidden (ふりがな 触れて)', rtBefore);
  const p1 = await tapTok(page, LADDER_INDEX);
  if (!p1.centerOwn)
    info(
      'FINDING · overlapping 44px hit regions',
      `the geometric center of narrow token ${LADDER_INDEX}「${LADDER_WORD}」resolves to its DOM-later neighbour (${p1.centerHit}); the tap landed at fx=${p1.fx} instead. Adjacent expanded hit regions overlap and the later token wins — a center-tap on a one-kanji word can fall on the following (inert) particle.`,
    );
  await settle(page, 250);
  const afterTap1 = await ladderTok().evaluate((el) => ({
    lit: el.classList.contains('lit'),
    rt: [...el.querySelectorAll('rt')].filter((r) => !r.classList.contains('hidden-rt')).map((r) => r.textContent).join(''),
  }));
  assert('tap 1 lifts the furigana', afterTap1.lit && afterTap1.rt === 'あさ', `rt="${afterTap1.rt}"`);
  await shot(page, 'tap1-furigana-390x844');
  await tapTok(page, LADDER_INDEX);
  await settle(page, 250);
  const afterTap2 = await ladderTok().evaluate((el) => ({
    hasEn: el.classList.contains('has-en'),
    gloss: el.querySelector('.tok-en')?.textContent || '',
  }));
  assert('tap 2 opens the English gloss beneath', afterTap2.hasEn && afterTap2.gloss.length > 0, `gloss="${afterTap2.gloss}"`);
  await shot(page, 'tap2-gloss-390x844');
  await tapTok(page, LADDER_INDEX);
  await settle(page, 250);
  const afterTap3 = await ladderTok().evaluate((el) => ({
    lit: el.classList.contains('lit'),
    hasEn: el.classList.contains('has-en'),
  }));
  assert('tap 3 closes the circle back to plain kanji', !afterTap3.lit && !afterTap3.hasEn);

  /* ---- 08 long-press quick look ------------------------------------------ */
  stage('quick-look', `long-press on 「${CAPTURE_WORD}」 floats the mini dictionary`);
  const capTok = () => page.locator(`#reader .tok[data-index="${CAPTURE_INDEX}"]`);
  await centerTok(page, CAPTURE_INDEX);
  const readerYAtEntry = await scrollY(page);
  const holdPoint = await tokPoint(page, CAPTURE_INDEX);
  assert('the token offers a point a finger can hold', !!holdPoint, JSON.stringify(holdPoint));
  await page.mouse.move(holdPoint.x, holdPoint.y);
  await page.mouse.down();
  await page.waitForTimeout(700); // > 430ms mini threshold, < 2100ms full threshold
  await page.mouse.up();
  await page.waitForSelector('#mini', { timeout: 5000 });
  const mini = await page.evaluate(() => ({
    word: document.querySelector('#mini .mini-word')?.textContent || '',
    reading: document.querySelector('#mini .mini-reading')?.textContent || '',
    gloss: document.querySelector('#mini .mini-gloss')?.textContent || '',
    seal: !!document.querySelector('#mini-take'),
    entryDoor: !!document.querySelector('#mini .mini-entry'),
  }));
  assert('mini names the held word', mini.word === CAPTURE_WORD, `word="${mini.word}"`);
  assert('mini carries reading + simple definition', mini.reading === 'けつろん' && mini.gloss.length > 0, `reading="${mini.reading}" gloss="${mini.gloss}"`);
  assert('mini carries the 覚 seal and the full-entry door', mini.seal && mini.entryDoor);
  await shot(page, 'mini-390x844');

  /* ---- 09 full entry (dictionary door) ----------------------------------- */
  stage('full-entry', 'the mini opens into the full dictionary entry');
  await page.locator('#mini .mini-entry').click();
  await page.waitForSelector('#sheet', { timeout: 5000 });
  await settle(page, 400);
  const sheetNode = await page.locator('#sheet').getAttribute('data-node');
  assert('full entry sheet opens for the word', sheetNode === `word:${CAPTURE_WORD}`, `data-node="${sheetNode}"`);
  assert('sheet carries its own 覚 seal (top-right) and 戻る', (await page.locator('#sheet-take').count()) === 1 && (await page.locator('#sheet-back').count()) === 1);
  const sheetText = await page.locator('#sheet').textContent();
  assert('entry shows reading and senses', sheetText.includes('けつろん'), 'reading けつろん present in entry');
  await shot(page, 'entry-sheet-390x844');

  /* ---- 10 back with context restored ------------------------------------- */
  stage('back-restores-context', '戻る returns to the article at the same scroll position');
  await page.locator('#sheet-back').click();
  await settle(page, 400);
  assert('sheet closed back into the reader', (await page.locator('#sheet').count()) === 0 && (await page.locator('#reader').count()) === 1);
  const readerYAfterBack = await scrollY(page);
  assert(
    'scroll position restored (≤20px)',
    Math.abs(readerYAfterBack - readerYAtEntry) <= 20,
    `before=${readerYAtEntry}px after=${readerYAfterBack}px`,
  );

  /* ---- 11 覚える capture from the top-right -------------------------------- */
  stage('capture-top-right', '覚える (top-right) captures the word with its sentence; scope choice offered');
  const takeBtn = page.locator('#reader-take');
  assert('the top-right 覚える door is armed for the touched word', (await takeBtn.count()) === 1 && !(await takeBtn.isDisabled()));
  await takeBtn.click();
  await page.waitForSelector('#capture-panel', { timeout: 5000 });
  await settle(page, 300);
  assert('capture panel opens under the seal', (await page.locator('#capture-panel .capture-word').textContent()) === CAPTURE_WORD);
  const scopeChips = await page.$$eval('#capture-panel [data-ctx-scope]', (els) =>
    els.map((e) => ({ scope: e.dataset.ctxScope, on: e.classList.contains('on-list') })),
  );
  assert(
    'scope stages offered: 語だけ · この文 · 段落ごと',
    scopeChips.length === 3 && scopeChips.some((c) => c.scope === 'word') && scopeChips.some((c) => c.scope === 'sent') && scopeChips.some((c) => c.scope === 'para'),
    JSON.stringify(scopeChips),
  );
  assert('この文 (sentence) is the default capture scope', scopeChips.find((c) => c.scope === 'sent')?.on === true);
  let s1 = await store(page);
  const takenItem = (s1?.taken || []).find((t) => t.t === 'word' && t.id === CAPTURE_WORD);
  assert(
    'S.taken gained the word with its context (ctx {p,i,scope})',
    !!takenItem && takenItem.ctx?.p === FLAGSHIP && takenItem.ctx?.i === CAPTURE_INDEX && takenItem.ctx?.scope === 'sent',
    `taken=${JSON.stringify(takenItem)}`,
  );
  assert('capture is start-marked (no hidden debt semantics)', Number.isFinite(takenItem?.started));
  await shot(page, 'capture-panel-390x844');
  await page.locator('#capture-panel [data-ctx-scope="para"]').click();
  await settle(page, 300);
  s1 = await store(page);
  assert(
    'scope choice commits — 段落ごと widens the stored ctx',
    (s1.taken || []).find((t) => t.id === CAPTURE_WORD)?.ctx?.scope === 'para',
  );
  await shot(page, 'capture-scope-para-390x844');
  await page.locator('#capture-panel [data-ctx-scope="sent"]').click();
  await settle(page, 300);
  s1 = await store(page);
  assert(
    'scope choice returns — この文 narrows the stored ctx back',
    (s1.taken || []).find((t) => t.id === CAPTURE_WORD)?.ctx?.scope === 'sent',
  );
  await page.mouse.click(20, 800); // tap the reader margin, outside the panel — it puts itself away
  await settle(page, 300);
  assert('tap outside closes the panel; the seal shows taken', (await page.locator('#capture-panel').count()) === 0 && (await takeBtn.getAttribute('aria-pressed')) === 'true');
  const underInk = await capTok().evaluate((el) => el.classList.contains('tok-learning'));
  assert('the captured word carries the learning under-ink in the text', underInk);

  /* ---- 12 tray ------------------------------------------------------------ */
  stage('tray', 'the lists tray: one captured item, review offered');
  await page.locator('#tray').click();
  await settle(page, 400);
  const trayTitle = (await page.locator('h1.view-title').textContent()).trim();
  assert('tray counts the one captured item', trayTitle.includes('1'), `title="${trayTitle}"`);
  const reviewBtn = page.locator('#review-start');
  assert('復習する offers the due session', (await reviewBtn.count()) === 1 && !(await reviewBtn.isDisabled()), (await reviewBtn.textContent()).trim());
  info('forecast line', ((await page.locator('.srs-forecast').first().textContent()) || '').trim());
  await shot(page, 'tray-390x844');

  /* ---- 13 review front face (declared recall) ----------------------------- */
  stage('review-front', 'review opens zen: the captured sentence asks, declaration gates the answer');
  await reviewBtn.click();
  await settle(page, 500);
  assert('zen review room (world recedes)', await page.evaluate(() => document.body.classList.contains('zen')));
  assert(
    'the card asks inside the captured sentence (cloze)',
    (await page.locator('.review-cloze').count()) === 1,
    'ctx {p,i,scope:sent} resolved from the article',
  );
  const blankHidesTarget = await page.evaluate((w) => !document.querySelector('.review-cloze').textContent.includes(w), CAPTURE_WORD);
  assert('the blank holds the word’s place (target hidden before reveal)', blankHidesTarget);
  assert(
    '想起の二道: 思い出した / まだ gate the reveal — no bare answer button',
    (await page.locator('#declare-recalled').count()) === 1 && (await page.locator('#declare-notyet').count()) === 1 && (await page.locator('#reveal').count()) === 0,
  );
  await shot(page, 'front-390x844');

  /* ---- 14 declared recall → answer face ----------------------------------- */
  stage('review-answer', '思い出した turns the card: all four grades open');
  await page.locator('#declare-recalled').click();
  await settle(page, 400);
  const gradeRow = page.locator('.grade-row');
  assert('declaration recorded — grade row opens declared=recalled', (await gradeRow.getAttribute('data-declared')) === 'recalled');
  assert('all four honest grades stand (再・難・良・易)', (await page.locator('.grade-row .grade').count()) === 4);
  const answerFace = await page.evaluate(() => ({
    front: document.querySelector('.review-front')?.textContent || '',
    reading: document.querySelector('.review-reading')?.textContent || '',
    senses: document.querySelectorAll('.review-sense').length,
  }));
  assert(
    'answer face: word, reading, senses',
    answerFace.front === CAPTURE_WORD && answerFace.reading === 'けつろん' && answerFace.senses > 0,
    JSON.stringify(answerFace),
  );
  await shot(page, 'answer-390x844');

  /* ---- 15 the door back toward the article -------------------------------- */
  stage('review-sentence-door', 'the answer face’s ▹ door: what exists, asserted honestly');
  const doorCount = await page.locator('.review-cloze .sent-door').count();
  assert('the captured sentence carries its ▹ door on the answer face', doorCount === 1);
  await page.locator('.review-cloze .sent-door').click();
  await page.waitForSelector('#sheet', { timeout: 5000 });
  await settle(page, 400);
  const sentSrc = ((await page.locator('#sheet .example-src').textContent().catch(() => '')) || '').trim();
  assert(
    'the door opens the sentence page, naming its source',
    (await page.locator('#sheet .sent-reader').count()) === 1 && sentSrc.includes('段階別読み物'),
    `source line="${sentSrc}"`,
  );
  const articleDoor = await page.evaluate(() => {
    // is there any control on this sheet that opens the FULL article?
    return [...document.querySelectorAll('#sheet button, #sheet a')].some((el) =>
      /記事|article|本文|ひらく本文/.test(el.textContent + (el.getAttribute('aria-label') || '')) && !/文だけ|sentence/.test(el.getAttribute('aria-label') || ''),
    );
  });
  assert(
    'a door from the review answer face to the FULL article exists',
    articleDoor,
    articleDoor
      ? 'found'
      : 'PRODUCT GAP (recorded honestly): the ▹ door opens the sentence on its own page with its source label, but no control walks on to the full article body (rubric §9.5 "Review answer snapshot returns to the source sentence and article" — only the sentence half exists)',
  );
  await shot(page, 'sentence-page-390x844');
  await page.locator('#sheet-back').click();
  await settle(page, 400);
  assert(
    '戻る returns to the review answer face, state intact',
    (await page.locator('.grade-row').count()) === 1 && (await page.locator('.review-front').textContent()) === CAPTURE_WORD,
  );

  /* ---- 16 grade Good → revlog --------------------------------------------- */
  stage('grade-good', '良 (Good) commits: FSRS learning steps honoured, revlog rows written');
  const beforeGrade = Date.now();
  await page.locator('.grade.g-good').click();
  await settle(page, 500);
  const s2 = await store(page);
  const firstRow = (s2?.revlog || [])[0] || [];
  assert('the first grade wrote its revlog row', (s2?.revlog || []).length === 1, `revlog rows: ${(s2?.revlog || []).length}`);
  assert(
    'revlog row shape: [ts, key, rating, stBefore, elapsed, r, sBefore, dBefore, sAfter, dAfter, ivl, dueAfter]',
    firstRow.length === 12 && firstRow[1] === `word:${CAPTURE_WORD}` && firstRow[2] === 3 && firstRow[3] === 0,
    JSON.stringify(firstRow),
  );
  assert(
    'the row’s instant is real (ts ≈ now, dueAfter > ts)',
    Math.abs(firstRow[0] - beforeGrade) < 60000 && firstRow[11] > firstRow[0],
    `ts=${firstRow[0]} dueAfter=${firstRow[11]} (+${Math.round((firstRow[11] - firstRow[0]) / 60000)}min)`,
  );
  // A first Good lands in a learning step (state 1, due in minutes); the
  // session re-inserts the pass and pulls it early (learn-ahead) instead of
  // parking the learner — so the sitting closes only when the card graduates.
  let grades = 1;
  for (let i = 0; i < 4; i++) {
    if (((await page.locator('h1.view-title').count()) && /復習おわり|Session done/.test((await page.locator('h1.view-title').textContent()) || ''))) break;
    if (await page.locator('#declare-recalled').count()) {
      if (i === 0)
        info(
          'learning step honoured',
          'Good on the new card scheduled a same-session learning step (due +10min); the session pulled the re-inserted pass early (learn-ahead) and the same card asks again — the sitting ends when the card graduates',
        );
      await page.locator('#declare-recalled').click();
      await settle(page, 300);
      await page.locator('.grade.g-good').click();
      grades += 1;
      await settle(page, 500);
    } else {
      await settle(page, 500);
    }
  }
  const s2b = await store(page);
  const revlog = s2b?.revlog || [];
  assert('one revlog row per grade pressed', revlog.length === grades, `${revlog.length} rows for ${grades} grades`);
  assert(
    'revlog instants are monotonic and all rows name the card',
    revlog.every((r, i) => r[1] === `word:${CAPTURE_WORD}` && (i === 0 || r[0] >= revlog[i - 1][0])),
    revlog.map((r) => r[0]).join(' → '),
  );
  const srsRec = s2b?.srs?.[`word:${CAPTURE_WORD}`];
  assert('FSRS card state persisted with a future due', !!srsRec && new Date(srsRec.due).getTime() > beforeGrade, JSON.stringify(srsRec)?.slice(0, 200));
  assert('the day’s stats counted the reviews', (Object.values(s2b?.stats || {}).find((v) => v && typeof v === 'object' && 'n' in v)?.n || 0) >= grades);
  const doneTitle = ((await page.locator('h1.view-title').textContent().catch(() => '')) || '').trim();
  assert(
    'session closes honestly, counting grades pressed',
    /復習おわり|Session done/.test(doneTitle) && doneTitle.includes(String(grades)),
    `"${doneTitle}" after ${grades} grades`,
  );
  await shot(page, 'session-done-390x844');
  await page.locator('main button.take', { hasText: 'リストへ' }).click();
  await settle(page, 400);
  assert('リストへ returns to the tray', /覚える|Memorizing/.test((await page.locator('h1.view-title').textContent()) || ''));

  /* ---- 17 export door ------------------------------------------------------ */
  stage('export-envelope', '書き出す: the record leaves as the v:1 envelope');
  await page.locator('#export-store').scrollIntoViewIfNeeded();
  await shot(page, 'port-row-390x844');
  await page.locator('#export-store').click();
  await page.waitForFunction(() => window.__walkExports.length > 0, undefined, { timeout: 5000 });
  const envelope = JSON.parse(await page.evaluate(() => window.__walkExports[0].text));
  assert('envelope version v:1', envelope.v === 1);
  const NEED = ['taken', 'lists', 'srs', 'revlog', 'obslog', 'deepWords', 'lessonsDone', 'suspended', 'stats', 'srsPrefs', 'readDone', 'readerPos', 'dials'];
  const missing = NEED.filter((k) => !(k in envelope));
  assert('envelope carries the learner-state keys', missing.length === 0, missing.length ? `missing: ${missing.join(',')}` : `keys: ${Object.keys(envelope).join(',')}`);
  assert(
    'envelope content matches the walk (1 taken · 1 srs card · one revlog row per grade)',
    envelope.taken?.length === 1 && Object.keys(envelope.srs || {}).length === 1 && envelope.revlog?.length === grades,
    `taken=${envelope.taken?.length} srs=${Object.keys(envelope.srs || {}).length} revlog=${envelope.revlog?.length} grades=${grades}`,
  );
  const s3 = await store(page);
  assert('export stamped stats.lastExportTs', Number.isFinite(s3?.stats?.lastExportTs));

  /* ---- 18 device-Back walks one level at a time ---------------------------- */
  stage('device-back', 'device Back walks the app’s own stack, one level, sentinel-armed');
  assert(
    'the history sentinel is armed while there is anywhere to walk',
    await page.evaluate(() => !!(history.state && history.state.bunkiWalk)),
  );
  await page.goBack();
  await settle(page, 600);
  assert(
    'Back 1: tray → the article it was opened from (not the shelf)',
    (await page.locator('#reader').count()) === 1 && ((await page.locator('.crumb').textContent()) || '').includes(FLAGSHIP_TITLE),
    `crumb="${((await page.locator('.crumb').textContent()) || '').trim()}"`,
  );
  await shot(page, 'back1-reader-390x844');
  await page.goBack();
  await settle(page, 600);
  assert('Back 2: reader → shelf', (await page.locator('#shelf-body').count()) === 1);
  const shelfYAfterWalk = await scrollY(page);
  assert(
    'shelf scroll context restored after the walk',
    Math.abs(shelfYAfterWalk - shelfYBeforeFlag) <= 20,
    `left at ${shelfYBeforeFlag}px, returned to ${shelfYAfterWalk}px`,
  );
  await settle(page, 400);
  assert(
    'at home the sentinel is consumed — the next Back would honestly leave the app',
    await page.evaluate(() => !(history.state && history.state.bunkiWalk)),
  );

  /* ---- 19 reload mid-article ----------------------------------------------- */
  stage('reload-resume', 'reload mid-article: the bookmark survives, position restored ≤20px');
  await page.locator(`.shelf-item[data-passage="${FLAGSHIP}"] .shelf-open`).click();
  await waitReader(page, 600);
  await page.evaluate(() => window.scrollTo(0, 1600));
  await page.waitForTimeout(1300); // > 900ms debounce → readerPos persisted
  const s4 = await store(page);
  assert('scroll bookmark persisted to the store', Math.abs((s4?.readerPos?.[FLAGSHIP] ?? -1) - 1600) <= 2, `readerPos=${s4?.readerPos?.[FLAGSHIP]}`);
  const anchorTok = await page.evaluate(() => {
    const tok = [...document.querySelectorAll('#reader .tok[data-index]')].find((t) => t.getBoundingClientRect().top >= 0);
    return tok ? Number(tok.dataset.index) : -1;
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#shelf-body .shelf-item', { timeout: 30000 });
  info(
    'reload lands on the front door (view is session state, the bookmark is store state)',
    'the shelf card now carries the 途中 in-progress mark',
  );
  const inProgress = await page
    .locator(`.shelf-item[data-passage="${FLAGSHIP}"] .shelf-meta`)
    .textContent();
  assert('the shelf remembers: 途中 (in progress) on the card', inProgress.includes('途中'), `meta="${inProgress.trim()}"`);
  await page.locator(`.shelf-item[data-passage="${FLAGSHIP}"] .shelf-open`).click();
  await waitReader(page, 600);
  await settle(page, 600);
  const resumedY = await scrollY(page);
  const resumedTok = await page.evaluate(() => {
    const tok = [...document.querySelectorAll('#reader .tok[data-index]')].find((t) => t.getBoundingClientRect().top >= 0);
    return tok ? Number(tok.dataset.index) : -1;
  });
  assert('reopening restores the exact position (≤20px)', Math.abs(resumedY - 1600) <= 20, `saved=1600px resumed=${resumedY}px`);
  assert(
    'the same sentence is at the top of the glass',
    Math.abs(resumedTok - anchorTok) <= 12,
    `anchor token ${anchorTok} → resumed token ${resumedTok}`,
  );
  assert('the captured word still carries its under-ink after reload', await capTok().evaluate((el) => el.classList.contains('tok-learning')));
  await shot(page, 'resumed-390x844');

  /* ---- 20 320×568 spot check ------------------------------------------------ */
  stage('spot-320', '320×568 spot check: shelf and reader hold the small glass');
  const state = await context.storageState();
  const small = await browser.newContext({
    viewport: { width: 320, height: 568 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    storageState: state,
  });
  const sp = await small.newPage();
  await sp.goto(APP, { waitUntil: 'load' });
  await sp.waitForSelector('#shelf-body .shelf-item', { timeout: 30000 });
  await settle(sp, 500);
  const shelfOverflow = await sp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert('shelf: no horizontal overflow at 320px', shelfOverflow <= 1, `overflow=${shelfOverflow}px`);
  await shot(sp, 'shelf-320x568');
  await sp.locator(`.shelf-item[data-passage="${FLAGSHIP}"] .shelf-open`).click();
  await sp.waitForFunction(() => document.querySelectorAll('#reader .tok').length >= 600, undefined, { timeout: 20000 });
  await settle(sp, 400);
  const readerOverflow = await sp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert('reader: no horizontal overflow at 320px', readerOverflow <= 1, `overflow=${readerOverflow}px`);
  assert('reader title correct at 320px', ((await sp.locator('h1.view-title').textContent()) || '').trim() === FLAGSHIP_TITLE);
  await sp.evaluate(() => window.scrollTo(0, 0));
  await settle(sp, 300);
  await shot(sp, 'reader-320x568');
  await small.close();
} catch (err) {
  // an unexpected crash is itself evidence — record it and the screen it died on
  if (currentStage) {
    assert('stage completed without an unexpected error', false, String(err?.stack || err).slice(0, 600));
    try {
      await shot(page, 'UNEXPECTED-FAILURE');
    } catch {}
  } else {
    log.stages.push({ n: 0, id: 'setup', title: 'setup', screenshots: [], assertions: [{ name: 'setup', status: 'FAIL', detail: String(err) }], status: 'FAIL' });
  }
}

/* ------------------------------------------------------------- close out */
await browser.close();
server.kill();

const totals = {
  stages: log.stages.length,
  stagesPass: log.stages.filter((s) => s.status === 'PASS').length,
  stagesFail: log.stages.filter((s) => s.status === 'FAIL').length,
  assertions: log.stages.reduce((a, s) => a + s.assertions.filter((x) => x.status !== 'INFO').length, 0),
  assertionsPass: log.stages.reduce((a, s) => a + s.assertions.filter((x) => x.status === 'PASS').length, 0),
  assertionsFail: log.stages.reduce((a, s) => a + s.assertions.filter((x) => x.status === 'FAIL').length, 0),
};
log.totals = totals;
writeFileSync(join(OUT, 'walk-log.json'), JSON.stringify(log, null, 2) + '\n');

const failLines = [
  ...log.stages
    .filter((s) => s.status === 'FAIL')
    .map((s) => {
      const f = s.assertions.filter((a) => a.status === 'FAIL');
      return `- **${String(s.n).padStart(2, '0')} ${s.id}** — ${f.map((a) => `${a.name}: ${a.detail || 'failed'}`).join('; ')}`;
    }),
  ...log.stages.flatMap((s) =>
    s.assertions
      .filter((a) => a.status === 'INFO' && a.name.startsWith('FINDING'))
      .map((a) => `- **${String(s.n).padStart(2, '0')} ${s.id}** (INFO finding, stage itself passed) — ${a.name}: ${a.detail}`),
  ),
].join('\n');

const readme = `# RENKAN C1 — end-to-end reader demonstration

**SHA:** \`${SHA}\`  ·  **tree:** \`${TREE}\`  ·  **branch:** \`${BRANCH}\`
**Date:** ${new Date().toISOString().slice(0, 10)}
**Serve:** \`python3 -m http.server ${PORT}\` from \`prototypes/corridor\` (static, unmodified tree)
**Driver:** playwright-core → headless Chromium (\`${CHROMIUM}\`), mobile emulation 390×844 dpr3 touch, plus a 320×568 spot check
**Learner state:** cold open (empty store); every stage builds on the state the walk itself created
**Result:** ${totals.stagesPass}/${totals.stages} stages PASS · ${totals.assertionsPass}/${totals.assertions} assertions PASS (${totals.assertionsFail} FAIL)

## What was demonstrated (each stage screenshotted, DOM-asserted in walk-log.json)

1. Cold-open shelf — category sections, EN titles under \`?ui=bi\`, 検収前 marks on unapproved cards.
2. Approved lane — \`${APPROVED}\` opens its full body, exact title match, attribution + licence, back restores shelf scroll.
3. Flagship 検収前 reading — \`${FLAGSHIP}\` (${FLAGSHIP_TITLE}), full 703-token body, provenance carried into the reader.
4–6. The three dials — 漢字 (all-kana proven on 図書→としょ), ふりがな (つねに/触れて), 分かち (文節/語の間/なし).
7. The progressive tap ladder on 「${LADDER_WORD}」 — furigana → gloss → plain, the circle closes.
8. Long-press quick look on 「${CAPTURE_WORD}」 — mini dictionary with reading, gloss, 覚 seal, full-entry door.
9. The full dictionary entry (sheet) with its own 覚 seal.
10. 戻る restores the article at the same scroll position (≤20px).
11. 覚える from the top-right — word captured **with its sentence** (\`ctx {p,i,scope}\`); scope stages 語だけ/この文/段落ごと proven to commit.
12. The tray — the captured item counted, review offered.
13–14. Declared-recall review — the captured sentence asks as a cloze; 思い出した/まだ gate the reveal; all four grades open after 思い出した.
15. The answer face's ▹ sentence door — opens the sentence page with its source label; **see finding below**.
16. 良 (Good) — the new card enters its learning step (due +10min), the session pulls the re-inserted pass early (learn-ahead) and closes when the card graduates; one revlog row per grade (12-field shape, rating 3, monotonic instants, future due), FSRS state + day stats persisted.
17. Export door — the \`v:1\` envelope produced and key-asserted; \`lastExportTs\` stamped.
18. Device Back — sentinel-armed, walks one level at a time (tray → its article → shelf, scroll restored), consumed at home.
19. Reload mid-article — bookmark persisted (900ms debounce), shelf shows 途中, reopening restores the position ≤20px and the same sentence.
20. 320×568 spot check — shelf and reader, no horizontal overflow.

${totals.stagesFail ? `## Honest failures / findings\n\n${failLines}\n` : '## Honest failures / findings\n\n(none — every assertion passed)\n'}
## What was NOT demonstrated (honesty labels)

- **No audio.** The corridor reader has no audio implementation (rubric §3.4); there is no audio stage to walk and none is claimed.
- **Web-verified only.** Headless Chromium mobile emulation on a local static server — not a physical iPhone, not Safari/WebKit, not a deployed URL. The URL↔SHA receipt here binds a *local* serve of this exact tree, not a public deployment.
- **No comprehension questions, sharing, offline, or VoiceOver stages** — those rubric surfaces are not in this walk's scope (§9.8 items 5, 10, 12, 13, 15 remain open).
- The walk exercises one learner journey deterministically; it is a demonstration of the loop, not a coverage battery (the battery is \`docs/build-evidence/renkan/battery-*\`).

## The claim this evidence supports

> On SHA \`${SHA}\` (local static serve of \`prototypes/corridor\`, headless mobile Chromium 390×844), the complete reader loop — shelf → article → dials → tap ladder → quick look → full entry → 覚える capture with sentence context → tray → declared-recall review → Good grade with revlog → device-Back walk → reload-resume → v:1 export — was executed end-to-end and DOM-asserted, ${totals.assertionsPass}/${totals.assertions} assertions passing; web-verified only, no audio, no physical device.

## Reproduce

\`\`\`bash
node docs/build-evidence/renkan/reader-demo/walk-demo.mjs
\`\`\`

Outputs land in \`docs/build-evidence/renkan/reader-demo/<head-sha>/\` (this directory): numbered stage screenshots, \`walk-log.json\` (coordinate, per-assertion PASS/FAIL with detail, console/network records), and this README.
`;
writeFileSync(join(OUT, 'README.md'), readme);

console.log(`\n==== DONE: ${totals.stagesPass}/${totals.stages} stages PASS, ${totals.assertionsPass}/${totals.assertions} assertions PASS (${totals.assertionsFail} FAIL)`);
console.log(`==== evidence: ${OUT}`);
process.exit(totals.stagesFail > 0 ? 1 : 0);
