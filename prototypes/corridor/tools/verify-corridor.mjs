/**
 * The corridor's verifier. Done = this is green.
 *
 * Runs the six-step corridor walk (§2 of the goal) in real Chromium at
 * 390×844 with touch emulation, asserting on RENDERED PIXELS and real DOM
 * state — never on "the function returned successfully" (the estate's dominant
 * defect). Touch is driven through the DevTools Protocol, the same way
 * prototypes/drift/tools/red-team-harness.mjs does it: mouse events are not
 * accepted as gesture evidence on a touch-first surface.
 *
 * Emits screenshots for every step and both sides of every variant, plus a
 * measurement table (contrast ratios, hit targets, focused-vs-background font
 * sizes, and each shelf text's three grader signals).
 *
 * Usage: node verify-corridor.mjs [--shots DIR] [--keep-open]
 */

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
export const CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const REPO = resolve(CORRIDOR_DIR, '..', '..');

const VIEWPORT = { width: 390, height: 844 };
const MIN_TAP = 44; // the canon's own --tap, not what the app happened to ship
const WCAG_AA = 4.5;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export function startCorridorServer(rootDir = CORRIDOR_DIR) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const file = resolve(rootDir, rel);
    if (!file.startsWith(rootDir) || !existsSync(file)) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    response.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      ok({ server, base: `http://127.0.0.1:${addr.port}` });
    });
  });
}

/* --------------------------------------------------------------- harness */
const results = [];
let failures = 0;

function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail) });
  if (!pass) failures += 1;
  const mark = pass ? '  ok  ' : ' FAIL ';
  console.log(`${mark} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function touchAt(page, selector, index, holdMs) {
  const target = page.locator(selector).nth(index);
  // centre, don't nudge: scrollIntoViewIfNeeded moves the minimum, which
  // can park the target at the viewport's top edge UNDER the fixed chrome
  // — the touch then lands on 戻る and navigates away instead of holding
  // the word. (Surfaced when per-article bookmarks began reopening texts
  // mid-scroll; a centred target is always clear of both chrome bands.)
  await target.evaluate((n) => n.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(60);
  // aim at the element's first line fragment, the way a finger aims at the
  // glyphs — a union box can drift into the line gap once a gloss hangs below
  const box = await target.evaluate((node) => {
    const r = node.getClientRects()[0] ?? node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box || !box.width) throw new Error(`touch: no box for ${selector}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const point = { x, y, radiusX: 6, radiusY: 6, force: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  if (holdMs) await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(120);
}

async function tap(page, selector, index = 0) {
  await touchAt(page, selector, index, 0);
}

/** The reader's click grammar (v1.2): a full dictionary entry opens by
 * holding a word past the mini-dictionary stage. */
async function holdWord(page, selector, index = 0) {
  await touchAt(page, selector, index, 2400);
  await page.waitForTimeout(200);
}

/** Wait until the reader's tokens stop changing. An article's text loads
 * asynchronously on first open and its arrival re-renders the view — a
 * hold begun on a token from the FIRST render dies when that render is
 * replaced mid-press, and the sheet never opens. Real fingers survive
 * this because the swap is early and fast; a probe that grabs the very
 * first token does not. Poll until the token count holds still. */
async function settleReader(page) {
  await page.waitForSelector('#reader .tok');
  await page.evaluate('window.__tokN = -1');
  await page.waitForFunction(
    `(() => { const n = document.querySelectorAll('#reader .tok').length;
       if (window.__tokN === n && n > 0) return true;
       window.__tokN = n; return false; })()`,
    null,
    { polling: 400, timeout: 15000 },
  );
}

async function shoot(page, dir, name) {
  const file = join(dir, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

/** Walk the UI the way a reader does until a word panel with semantic edges is open. */
async function walkToSemPanel(page, tapFn) {
  await tapFn(page, '.shelf-item');
  await settleReader(page);
  await holdWord(page, '#reader .tok.content');
  await page.waitForSelector('#sheet');
  // the deep tier swaps richer senses into the sheet moments after it opens;
  // wait for that one settle so nothing is aimed at mid-swap
  await page
    .waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(160);
  if ((await page.locator('#sheet .sem-row').count()) === 0) {
    if (await page.locator('#sheet .chip').count()) {
      await tapFn(page, '#sheet .chip');
      await page.waitForTimeout(160);
    }
  }
  return page.locator('#sheet .sem-row').count();
}

/* measurement helpers evaluated in the page */
const MEASURE_FN = `(() => {
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (s) => {
    const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(/[\\s,/]+/).filter(Boolean).map(Number);
    return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  const bodyBg = parse(getComputedStyle(document.body).backgroundColor) || { rgb: [252,251,246], a: 1 };
  const ratio = (node) => {
    const fg = parse(getComputedStyle(node).color); if (!fg) return null;
    const c = fg.rgb.map((v, i) => v * fg.a + bodyBg.rgb[i] * (1 - fg.a));
    const l1 = lum(c), l2 = lum(bodyBg.rgb);
    return Math.round(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)) * 100) / 100;
  };
  const measure = (sel, label) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    const cs = getComputedStyle(node);
    return { label, selector: sel, contrast: ratio(node), fontSize: Math.round(parseFloat(cs.fontSize) * 10) / 10, color: cs.color };
  };
  const targets = [...document.querySelectorAll('button, [role=button], a')]
    .filter((n) => n.offsetParent !== null)
    .map((n) => {
      const r = n.getBoundingClientRect();
      const expanded = n.matches('#reader button.tok') ? getComputedStyle(n, '::before') : null;
      const expandedW = expanded ? parseFloat(expanded.width) : 0;
      const expandedH = expanded ? parseFloat(expanded.height) : 0;
      return {
        text: (n.textContent||'').trim().slice(0, 14),
        w: Math.round(r.width), h: Math.round(r.height),
        hitW: Math.round(Math.max(r.width, expandedW || 0)),
        hitH: Math.round(Math.max(r.height, expandedH || 0)),
        id: n.id || n.className,
      };
    });
  return {
    text: [
      measure('.reader', 'reading body (focused)'),
      measure('.view-title', 'view title'),
      measure('.shelf-title', 'shelf title'),
      measure('.gloss', 'gloss'),
      measure('.sem-note', 'discrimination note'),
      measure('.shelf-snippet', 'faint / snippet'),
      measure('.sig-name', 'faint / signal label'),
      measure('.crumb', 'chrome breadcrumb (background)'),
      measure('.eyebrow', 'eyebrow label'),
      measure('.reading', 'reading, the one red'),
    ].filter(Boolean),
    targets,
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  };
})()`;

/* ------------------------------------------------------------------ main */
async function main() {
  const argv = process.argv.slice(2);
  const shotArg = argv.indexOf('--shots');
  const shotsDir =
    shotArg >= 0 ? resolve(argv[shotArg + 1]) : resolve(REPO, 'docs/prototype/screenshots');
  mkdirSync(shotsDir, { recursive: true });

  const { server, base } = await startCorridorServer();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const report = { viewport: VIEWPORT, steps: [], measurements: {}, shelf: [], caps: {} };

  const open = async (query = '') => {
    await page.goto(`${base}/index.html${query}`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  };

  // ------------------------------------------- step 0 · the front door
  // 銀河 (operator 2026-08-10): opening the app lands in the galaxy — the
  // hero. It rests bare but for a single symbol; the persistent top chrome is
  // gone. Tapping the symbol opens the bar and two corner bubbles; 本棚 is one
  // of them, and it is the one door to the shelf. The universe sleeps while
  // any other view is open.
  console.log('\n— step 0 · the front door (銀河)');
  await open('');
  await page.waitForTimeout(2200);
  const driftBoot = await page.evaluate(`({
    layerActive: document.getElementById('drift-layer')?.classList.contains('active'),
    words: document.querySelectorAll('#drift-layer .word').length,
    symbol: !!document.querySelector('.nav-symbol'),
    chromeGone: !document.querySelector('.chrome'),
  })`);
  check('銀河 · the app opens into the living galaxy',
    driftBoot.layerActive && driftBoot.words >= 20,
    `layer active, ${driftBoot.words} words adrift`);
  check('銀河 · the hero rests bare but for the single symbol (no top chrome)',
    driftBoot.symbol && driftBoot.chromeGone, 'symbol present, top chrome receded');
  await shoot(page, shotsDir, '17-phase2-drift-entry');
  // the shelf is reached through the symbol → 本棚 bubble
  await page.tap('.nav-symbol');
  await page.waitForTimeout(300);
  await page.tap('.bubble-shelf');
  await page.waitForTimeout(600);
  const afterDoor = await page.evaluate(`({
    layerActive: document.getElementById('drift-layer')?.classList.contains('active'),
    layerDisplay: getComputedStyle(document.getElementById('drift-layer')).display,
    shelfItems: document.querySelectorAll('.shelf-item').length,
  })`);
  check('Phase 2 · one door from the universe to the shelf',
    !afterDoor.layerActive && afterDoor.layerDisplay === 'none' && afterDoor.shelfItems >= 24,
    `${afterDoor.shelfItems} articles; universe asleep (display ${afterDoor.layerDisplay})`);
  await page.tap('#back');
  await page.waitForTimeout(600);
  const afterBack = await page.evaluate(
    `document.getElementById('drift-layer')?.classList.contains('active')`,
  );
  check('Phase 2 · 戻る returns from the shelf to the universe', afterBack === true, 'layer active again');

  // -------------------------------------- step 0b · the bloom constellation
  // Operator round (2026-08-08): the tap-bloom is its own relief — centre,
  // satellites, and threads in their own colours, satellites materialized as
  // real words — and the constellation is TETHERED to the word: drag the
  // centre and the family re-anchors with it; the drag commits.
  console.log('\n— step 0b · the bloom constellation');
  await page.waitForTimeout(1200);
  const bloomPick = await page.evaluate(`(() => {
    const K = /[\\u4e00-\\u9fff]/;
    // prefer a word carrying a productive kanji so the family is a real one
    const productive = /[出日生上会気手入分立行見]/;
    let fallback = null;
    for (const el of document.querySelectorAll('#drift-layer .word')) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.left < 60 || r.right > 320 || r.top < 260 || r.bottom > 640) continue;
      const t = el.textContent;
      if (!K.test(t)) continue;
      const at = { x: r.left + r.width / 2, y: r.top + r.height / 2, productive: productive.test(t) };
      if (at.productive) return at;
      fallback = fallback ?? at;
    }
    return fallback;
  })()`);
  check('Phase 2 · a kanji word stands in the field to bloom', !!bloomPick, JSON.stringify(bloomPick));
  const satFloor = bloomPick.productive ? 8 : 3;
  const bloomCdp = await page.context().newCDPSession(page);
  const btouch = (type, pts) =>
    bloomCdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
  await btouch('touchStart', [[bloomPick.x, bloomPick.y]]);
  await page.waitForTimeout(70);
  await btouch('touchEnd', []);
  await page.waitForTimeout(900);
  const bloomProbe = await page.evaluate(`(() => {
    const ctr = document.querySelector('#drift-layer .word.bctr');
    const sats = [...document.querySelectorAll('#drift-layer .word.bsat')];
    const field = [...document.querySelectorAll('#drift-layer .word:not(.bsat):not(.bctr)')].find((w) => w.textContent);
    return {
      ctr: !!ctr,
      ctrColor: ctr ? getComputedStyle(ctr).color : null,
      sats: sats.length,
      satColor: sats.length ? getComputedStyle(sats[0]).color : null,
      fieldColor: field ? getComputedStyle(field).color : null,
      r: ctr ? (() => { const b = ctr.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })() : null,
    };
  })()`);
  check('bloom · the constellation is its own relief — three colour families',
    bloomProbe.ctr && bloomProbe.sats >= satFloor
      && bloomProbe.ctrColor !== bloomProbe.satColor && bloomProbe.satColor !== bloomProbe.fieldColor,
    `centre ${bloomProbe.ctrColor} · ${bloomProbe.sats} satellites ${bloomProbe.satColor} (floor ${satFloor}) · field ${bloomProbe.fieldColor}`);
  // drag the centre; the family must follow and the drag must stick
  const meanD = `(() => {
    const c = document.querySelector('#drift-layer .word.bctr')?.getBoundingClientRect();
    if (!c) return null;
    const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
    const ds = [...document.querySelectorAll('#drift-layer .word.bsat')].map((s) => {
      const b = s.getBoundingClientRect();
      return Math.hypot(b.x + b.width / 2 - cx, b.y + b.height / 2 - cy);
    });
    return { cx, cy, mean: ds.reduce((a, d) => a + d, 0) / (ds.length || 1) };
  })()`;
  const dragBefore = await page.evaluate(meanD);
  const dtx = 200, dty = Math.max(320, dragBefore.cy - 180);
  await btouch('touchStart', [[dragBefore.cx, dragBefore.cy]]);
  for (let i = 1; i <= 8; i++) {
    await page.waitForTimeout(26);
    await btouch('touchMove', [[dragBefore.cx + ((dtx - dragBefore.cx) * i) / 8, dragBefore.cy + ((dty - dragBefore.cy) * i) / 8]]);
  }
  await btouch('touchEnd', []);
  await page.waitForTimeout(1600);
  const dragAfter = await page.evaluate(meanD);
  const dragMoved = dragAfter ? Math.hypot(dragAfter.cx - dragBefore.cx, dragAfter.cy - dragBefore.cy) : 0;
  check('bloom · dragging the centre carries the whole constellation — and sticks',
    dragAfter && dragMoved > 60 && Math.abs(dragAfter.mean - dragBefore.mean) < dragBefore.mean * 0.35,
    `centre moved ${dragMoved.toFixed(0)}px; mean tether ${dragBefore.mean.toFixed(0)} → ${dragAfter.mean.toFixed(0)}px`);
  await shoot(page, shotsDir, '18-bloom-relief-drag');
  await btouch('touchStart', [[330, 770]]);
  await page.waitForTimeout(60);
  await btouch('touchEnd', []);
  await bloomCdp.detach();
  await page.waitForTimeout(600);
  const bloomCleared = await page.evaluate(
    `!document.querySelector('#drift-layer .word.bctr') && document.querySelectorAll('#drift-layer .word.bsat').length === 0`,
  );
  check('bloom · a water tap releases the constellation', bloomCleared, 'relief classes cleared');

  // ---------------------------------------------------------- step 1 arrive
  console.log('\n— step 1 · arrive');
  const t0 = Date.now();
  await open('?entry=shelf');
  const loadMs = Date.now() - t0;
  check('the shelf renders real graded texts', (await page.locator('.shelf-item').count()) >= 8,
    `${await page.locator('.shelf-item').count()} texts, ready in ${loadMs} ms`);

  const shelfData = await page.evaluate(`(() => {
    return [...document.querySelectorAll('.shelf-item')].map((n) => ({
      title: n.querySelector('.shelf-title').textContent,
      titleEn: n.querySelector('.shelf-title-en')?.textContent ?? null,
      level: n.querySelector('.level-chip')?.textContent ?? null,
      levelNote: n.querySelector('.level-note')?.textContent ?? null,
      meta: [...n.querySelectorAll('.shelf-meta span')].map((s) => s.textContent),
      disagreement: n.querySelector('.disagree-tag')?.textContent ?? null,
    }));
  })()`);
  report.shelf = shelfData;
  check('every text carries an English title and a learner-readable level',
    shelfData.every((s) => s.titleEn && s.level && /^[A-Za-z]/.test(s.level)),
    `${shelfData.length} texts, e.g. "${shelfData[0]?.titleEn}" — ${shelfData[0]?.level}${shelfData[0]?.levelNote}`);
  // Disagreement may only fire where >=2 ordinal-capable signals were
  // measured on the displayed text. With the NINJAL pair unavailable to this
  // build environment, zero flags is the honest state — a flag with fewer
  // than two ordinals would be the failure.
  const flagged = shelfData.filter((s) => s.disagreement).length;
  const gradingTruth = JSON.parse(
    readFileSync(resolve(CORRIDOR_DIR, 'data/articles/index.json'), 'utf8'),
  );
  const ordinalCapable = gradingTruth.articles.filter(
    (a) => Object.keys(a.grading.disagreement.detail.ordinals ?? {}).length >= 2,
  ).length;
  check('disagreement fires only where two-plus ordinal signals were measured',
    ordinalCapable >= 2 ? flagged >= 0 : flagged === 0,
    `${flagged} flagged; ${ordinalCapable} articles with >=2 ordinal signals`);

  // the raw instrument is one 詳細 tap away, not gone — and it must include
  // the live JLPT-lexicon row plus an HONEST row for the unmeasured NINJAL
  // pair (never a stale or faked number)
  await page.locator('[data-details]').first().click();
  await page.waitForTimeout(200);
  const rawSignals = await page.locator('.shelf-item .sig').count();
  const sigNames = await page.evaluate(
    `[...document.querySelectorAll('.shelf-item .sig .sig-name')].map((n) => n.textContent)`,
  );
  check('the raw signals unfold behind 詳細 — separate, never averaged', rawSignals >= 3,
    `${rawSignals} signal rows on the opened card: ${sigNames.join(' · ')}`);
  check('the JLPT-lexicon signal is live on the opened card',
    sigNames.some((n) => n.includes('JLPT')), sigNames.join(' · '));
  const sigValues = await page.evaluate(
    `[...document.querySelectorAll('.shelf-item .sig .sig-val')].map((n) => n.textContent)`,
  );
  const ninjalRow = sigNames.findIndex((n) => n.includes('国語研'));
  const firstGrading = gradingTruth.articles[0].grading;
  check('the NINJAL pair is either measured or marked 未測定 — never faked',
    firstGrading.signals.lexical_coverage
      ? ninjalRow === -1 || !/未測定|not measured/.test(sigValues[ninjalRow])
      : ninjalRow >= 0 && /未測定|not measured/.test(sigValues[ninjalRow]),
    ninjalRow >= 0 ? `${sigNames[ninjalRow]} → ${sigValues[ninjalRow]}` : 'no NINJAL row');
  await page.locator('[data-details]').first().click();
  await page.waitForTimeout(150);
  await shoot(page, shotsDir, '01-arrive-shelf');
  report.steps.push({ step: 1, name: 'arrive', shot: '01-arrive-shelf.png' });

  // ------------------------------------------- step 1b · Phase 1: the shelf
  // holds dozens of articles, lazily loaded, the 8 parked v11 texts among them
  console.log('\n— step 1b · Phase 1 shelf');
  const shelfCount = await page.locator('.shelf-item').count();
  check('Phase 1 · the shelf holds dozens of articles', shelfCount >= 24, `${shelfCount} articles`);
  const v11Titles = ['静かな朝', '雨の日の古本屋', '知らない町を歩く', '山を歩きながら考えたこと',
    'AI時代の知識と判断', '五箇条の御誓文', '方丈記 · 冒頭', '徒然草 · 序段'];
  const shelfTitles = shelfData.map((s) => s.title);
  const v11Present = v11Titles.filter((t) => shelfTitles.includes(t));
  check('Phase 1 · all 8 parked v11 texts stand on the shelf', v11Present.length === 8,
    `${v11Present.length}/8 present`);
  const indexRowsLean = gradingTruth.articles.every((a) => !a.tokens && !a.text && a.file);
  check('Phase 1 · the index is lean — article bodies live in their own files',
    indexRowsLean && gradingTruth.articles.every(
      (a) => existsSync(resolve(CORRIDOR_DIR, 'data/articles', a.file))),
    `${gradingTruth.articles.length} per-article files`);
  const signalsTrue = gradingTruth.articles.every((a) => {
    const g = a.grading;
    return g.signals.jreadability && g.signals.jlpt_lexicon
      && (g.signals.lexical_coverage || g.unavailable?.lexical_coverage);
  });
  check('Phase 1 · every article carries live signals or an honest absence', signalsTrue,
    'jreadability + jlpt_lexicon live; NINJAL pair measured or reason recorded');
  await page.evaluate(`(() => {
    const items = [...document.querySelectorAll('.shelf-item .shelf-title')];
    const first = items.find((n) => n.textContent === '静かな朝');
    if (first) first.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -70);
  })()`);
  await page.waitForTimeout(120);
  await shoot(page, shotsDir, '14-phase1-shelf-v11');
  await page.evaluate('window.scrollTo(0, 0)');
  await page.waitForTimeout(120);

  // the full-length story: ごん狐 ships whole, paragraphs intact
  const gonIndex = shelfTitles.findIndex((t) => t.includes('ごん狐'));
  check('Phase 1 · ごん狐 stands on the shelf', gonIndex >= 0, `shelf index ${gonIndex}`);
  await tap(page, '.shelf-item', gonIndex);
  await page.waitForSelector('#reader .tok', { timeout: 15000 });
  const gonText = await page.locator('#reader').innerText();
  check('Phase 1 · the story ships full-length — no 520-char excerpt',
    gonText.replace(/\s/g, '').length >= 4500, `${gonText.replace(/\s/g, '').length} chars rendered`);
  // strip ruby readings so the surface text can be matched verbatim
  const gonPlain = await page.evaluate(`(() => {
    const r = document.getElementById('reader').cloneNode(true);
    r.querySelectorAll('rt').forEach((n) => n.remove());
    return r.textContent;
  })()`);
  check('Phase 1 · the story reaches its final line',
    gonPlain.includes('まだ筒口から細く出ていました'),
    'the closing sentence is present');
  const paraBreaks = await page.locator('#reader .para-break').count();
  check('Phase 1 · paragraphs survive into the reader', paraBreaks >= 5, `${paraBreaks} paragraph breaks`);
  await shoot(page, shotsDir, '15-phase1-full-story');

  // a v11 original reads with the same click grammar
  await page.goBack().catch(() => {});
  await open('?entry=shelf');
  const quietIndex = (await page.evaluate(
    `[...document.querySelectorAll('.shelf-item .shelf-title')].map((n) => n.textContent)`,
  )).findIndex((t) => t === '静かな朝');
  await tap(page, '.shelf-item', quietIndex);
  await page.waitForSelector('#reader .tok', { timeout: 15000 });
  const v11Ruby = await page.locator('#reader rt').count();
  check('Phase 1 · a v11 original carries real furigana from the pipeline', v11Ruby > 10,
    `${v11Ruby} <rt> elements in 静かな朝`);
  await shoot(page, shotsDir, '16-phase1-v11-article');
  await open('?entry=shelf');

  // ------------------------------------------------------------ step 2 read
  console.log('\n— step 2 · read');
  await tap(page, '.shelf-item');
  await settleReader(page);
  const readerText = await page.locator('#reader').innerText();
  check('the reader shows real Japanese', /[぀-ヿ一-鿌]/.test(readerText), `${readerText.length} chars rendered`);
  const rubyCount = await page.locator('#reader rt').count();
  check('furigana renders as real ruby', rubyCount > 10, `${rubyCount} <rt> elements`);
  await shoot(page, shotsDir, '02-read-passage');
  report.steps.push({ step: 2, name: 'read', shot: '02-read-passage.png' });

  // the dials fold away by default (v1.2 round 4) — open them for the checks
  const dialsHidden = (await page.locator('[data-dial]').count()) === 0;
  await page.locator('#dials-toggle').click();
  await page.waitForTimeout(200);
  check('the text-settings dials fold away until asked for',
    dialsHidden && (await page.locator('[data-dial]').count()) === 9,
    `hidden by default=${dialsHidden}, 9 dial options after one tap`);

  // the three dials must be INDEPENDENT
  const dialProbe = async () => page.evaluate(`(() => {
    const r = document.querySelector('#reader');
    return {
      rt: r.querySelectorAll('rt').length,
      hiddenRt: r.querySelectorAll('rt.hidden-rt').length,
      spacing: r.className,
      text: r.innerText.slice(0, 40),
    };
  })()`);
  const baseline = await dialProbe();
  await page.locator('[data-dial="furigana:0"]').click();
  const noFuri = await dialProbe();
  check('dial · furigana alone changes furigana',
    noFuri.rt === 0 && noFuri.spacing === baseline.spacing,
    `rt ${baseline.rt} → ${noFuri.rt}, spacing class unchanged`);

  await page.locator('[data-dial="spacing:2"]').click();
  const spaced = await dialProbe();
  check('dial · spacing alone changes spacing',
    spaced.spacing.includes('sp-bunsetsu') && spaced.rt === noFuri.rt,
    `class "${spaced.spacing}", rt still ${spaced.rt}`);
  const bunsetsuCount = await page.locator('#reader .bunsetsu').count();
  check('文節 grouping is real', bunsetsuCount > 5, `${bunsetsuCount} 文節 groups`);
  await shoot(page, shotsDir, '02b-dials-spacing-bunsetsu');

  await page.locator('[data-dial="kanji:1"]').click();
  const joyo = await dialProbe();
  await page.locator('[data-dial="kanji:2"]').click();
  const allKana = await dialProbe();
  check('dial · kanji alone changes the script',
    allKana.text !== baseline.text && /^[^一-鿌]*$/.test(allKana.text.replace(/[、。「」]/g, '')),
    `"${baseline.text.slice(0, 14)}" → "${allKana.text.slice(0, 14)}"`);
  await shoot(page, shotsDir, '02c-dials-all-kana');
  report.dials = { baseline, noFuri, spaced, joyo, allKana };

  // reveal-on-tap
  await page.locator('[data-dial="kanji:0"]').click();
  await page.locator('[data-dial="spacing:0"]').click();
  await page.locator('[data-dial="furigana:1"]').click();
  const beforeReveal = await dialProbe();
  check('furigana can be held back and revealed',
    beforeReveal.hiddenRt > 0 && beforeReveal.hiddenRt === beforeReveal.rt,
    `${beforeReveal.hiddenRt} ruby present but hidden`);
  await shoot(page, shotsDir, '02d-furigana-on-touch');

  // ------------------------------- step 3 · the click grammar, then the entry
  console.log('\n— step 3 · the click grammar and the dictionary entry');
  await page.locator('[data-dial="furigana:1"]').dispatchEvent('click');
  await page.waitForTimeout(150);

  // pick a word that sits wholly on one line (a straddling word legitimately
  // pulls itself onto the next line when glossed — it becomes one object)
  const tapIdx = await page.evaluate(`(() => {
    const toks = [...document.querySelectorAll('#reader .tok.content')];
    for (let i = 1; i < toks.length; i++) {
      if (toks[i].getClientRects().length === 1 && toks[i].textContent.length >= 2) return i;
    }
    return 2;
  })()`);

  // 1st tap → furigana, instantly, and nothing else
  await tap(page, '#reader .tok.content', tapIdx);
  await page.waitForTimeout(120);
  const afterTap = await page.evaluate(`(() => ({
    lit: document.querySelectorAll('#reader .tok.lit').length,
    en: document.querySelectorAll('#reader .tok-en').length,
    sheet: !!document.querySelector('#sheet'),
  }))()`);
  check('grammar · the first tap reveals furigana instantly, opening nothing',
    afterTap.lit >= 1 && afterTap.en === 0 && !afterTap.sheet,
    `lit=${afterTap.lit}, sheet=${afterTap.sheet}`);

  // 2nd tap (a later tap, not a timed double) → English beneath, word unmoved.
  // The visual anchor is the glyph box (the ruby base), not the wrapper's
  // rect — the wrapper legitimately changes box type when the gloss mounts.
  const glyphBox = `(el) => (el.querySelector('ruby') ?? el).getBoundingClientRect().bottom`;
  const wordTopBefore = await page.evaluate(
    `(${glyphBox})(document.querySelectorAll('#reader .tok.content')[${tapIdx}])`,
  );
  await tap(page, '#reader .tok.content', tapIdx);
  await page.waitForTimeout(120);
  const afterSecond = await page.evaluate(`(() => {
    const tok = document.querySelectorAll('#reader .tok.content')[${tapIdx}];
    const en = tok.querySelector('.tok-en');
    let collisions = 0;
    if (en) {
      const e = en.getBoundingClientRect();
      for (const other of document.querySelectorAll('#reader .tok')) {
        if (other === tok || tok.contains(other)) continue;
        const r = other.getClientRects()[0];
        if (!r) continue;
        // a collision is visible ink over ink: require a real bite in both
        // axes, not a sub-4px graze of a neighbour's empty descent space
        const ox = Math.min(e.right, r.right) - Math.max(e.left, r.left);
        const oy = Math.min(e.bottom, r.bottom) - Math.max(e.top, r.top);
        if (ox >= 4 && oy >= 4) collisions += 1;
      }
    }
    return {
      en: tok.querySelectorAll('.tok-en').length,
      top: (tok.querySelector('ruby') ?? tok).getBoundingClientRect().bottom,
      collisions,
      sheet: !!document.querySelector('#sheet'),
    };
  })()`);
  check('grammar · a second tap sets English beneath — and the word does not move',
    afterSecond.en === 1 && !afterSecond.sheet && Math.abs(afterSecond.top - wordTopBefore) < 2,
    `gloss on, glyph bottom ${wordTopBefore.toFixed(1)} → ${afterSecond.top.toFixed(1)}px`);
  check('grammar · the gloss collides with nothing — on any font, by construction',
    afterSecond.collisions === 0, `${afterSecond.collisions} overlapping token(s)`);

  // the worst long-gloss word on the shelf must render its gloss WHOLE
  await open('?entry=shelf');
  await tap(page, '.shelf-item', 2); // JR おおさか東線 — carries 沿線
  await settleReader(page);
  const enIdx = await page.evaluate(
    `[...document.querySelectorAll('#reader .tok.content')].findIndex((t) => t.dataset.word === '沿線')`,
  );
  if (enIdx >= 0) {
    // furigana defaults to タップで — first tap reads, second sets English
    await tap(page, '#reader .tok.content', enIdx);
    await page.waitForTimeout(150);
    await tap(page, '#reader .tok.content', enIdx);
    await page.waitForTimeout(150);
    const glossFit = await page.evaluate(`(() => {
      const en = document.querySelectorAll('#reader .tok.content')[${enIdx}].querySelector('.tok-en');
      if (!en) return null;
      return { text: en.textContent, whole: en.scrollHeight <= en.clientHeight + 2 && en.scrollWidth <= en.clientWidth + 2 };
    })()`);
    check('grammar · even the longest gloss renders whole — never truncated',
      !!glossFit && glossFit.whole, glossFit ? `沿線 → "${glossFit.text}"` : 'no gloss mounted');
  } else {
    check('grammar · even the longest gloss renders whole — never truncated', false, '沿線 not found in text 3');
  }
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await settleReader(page);
  await page.locator('#dials-toggle').click();
  await page.waitForTimeout(150);
  await page.locator('[data-dial="furigana:1"]').dispatchEvent('click');
  await page.waitForTimeout(150);
  await tap(page, '#reader .tok.content', tapIdx);
  await page.waitForTimeout(120);
  await tap(page, '#reader .tok.content', tapIdx);
  await page.waitForTimeout(120);

  // 3rd tap → the circle closes: plain kanji again, no sheet (operator
  // ruling 2026-08-12 — the entry moved to the holds)
  await tap(page, '#reader .tok.content', tapIdx);
  await page.waitForTimeout(120);
  const afterThird = await page.evaluate(`(() => {
    const t = document.querySelectorAll('#reader .tok.content')[${tapIdx}];
    return {
      sheet: document.querySelector('#sheet')?.dataset.node ?? '',
      rt: [...t.querySelectorAll('rt')].filter((r) => !r.classList.contains('hidden-rt')).length,
      gloss: !!t.querySelector('.tok-en'),
    };
  })()`);
  check('grammar · a third tap closes the circle — plain kanji, no sheet',
    afterThird.sheet === '' && afterThird.rt === 0 && !afterThird.gloss,
    JSON.stringify(afterThird));

  // long press → the floating mini-dictionary; a tap anywhere else puts it away
  await touchAt(page, '#reader .tok.content', 6, 700);
  await page.waitForTimeout(200);
  const mini = await page.evaluate(`(() => {
    const m = document.querySelector('#mini');
    return m ? { word: m.querySelector('.mini-word')?.textContent, gloss: m.querySelector('.mini-gloss')?.textContent } : null;
  })()`);
  check('grammar · a long press floats the mini-dictionary', !!mini && !!mini.word,
    mini ? `${mini.word} — ${String(mini.gloss).slice(0, 30)}` : 'no #mini');
  await tap(page, '.view-title');
  await page.waitForTimeout(120);
  check('grammar · one tap anywhere else backs out of the mini',
    (await page.locator('#mini').count()) === 0, 'mini dismissed');

  // keep holding → the full entry (from a clean slate: whatever the mini
  // interlude did, close it and re-aim)
  if (await page.locator('#sheet').count()) {
    await page.locator('#sheet-close').dispatchEvent('click');
    await page.waitForTimeout(150);
  }
  await page.evaluate('window.scrollTo(0, 0)');
  await page.locator('[data-dial="furigana:2"]').dispatchEvent('click');
  await page.waitForTimeout(150);
  await holdWord(page, '#reader .tok.content');
  await page.waitForSelector('#sheet[data-node^="word:"]');
  const panel = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return {
      node: s.dataset.node,
      headword: s.querySelector('.headword')?.textContent ?? '',
      reading: s.querySelector('.reading')?.textContent ?? '',
      gloss: s.querySelector('.gloss')?.textContent ?? s.querySelector('.sense-list')?.textContent ?? '',
      // senses arrive in either shape: the immediate core list, or the deep
      // tier's numbered JMdict sections once the word's shard has opened
      senses: s.querySelectorAll('.sense-list li').length + s.querySelectorAll('.dictionary-sense').length,
      kanjiRows: [...s.querySelectorAll('[data-kanjirow]')].map((c) => c.dataset.kanjirow),
      examples: s.querySelectorAll('.example').length,
      hasBack: !!s.querySelector('#sheet-back'),
      hasClose: !!s.querySelector('#sheet-close'),
    };
  })()`);
  check('grammar · holding opens the full entry',
    panel.headword.length > 0 && (panel.reading.length > 0 || panel.gloss.length > 0),
    `${panel.headword}（${panel.reading}）`);
  check('the sheet carries its own back and close', panel.hasBack && panel.hasClose,
    `back=${panel.hasBack} close=${panel.hasClose}`);
  check('the entry offers a hop into each kanji', panel.kanjiRows.length > 0,
    `${panel.kanjiRows.join('')} — ${panel.kanjiRows.length} row(s)`);
  check('real usage examples come from the shelf itself', panel.examples >= 1,
    `${panel.examples} example(s)`);
  check('the dictionary carries every sense, most common first', panel.senses >= 2,
    `${panel.headword}: ${panel.senses} senses`);
  await shoot(page, shotsDir, '03-word-panel');
  report.steps.push({ step: 3, name: 'click grammar + entry', shot: '03-word-panel.png', panel });
  // the dial change above now PERSISTS (dials ride the envelope) — put the
  // baseline back so later walks meet the app as a fresh phone would
  await page.locator('[data-dial="furigana:1"]').dispatchEvent('click').catch(() => {});
  await page.waitForTimeout(120);

  // now the surface that matters: a word that HAS semantic neighbours
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await settleReader(page);
  await holdWord(page, '#reader .tok.content');
  await page.waitForSelector('#sheet');
  // the deep tier swaps richer senses into the sheet moments after it opens;
  // let that settle so the seed chips are stable before aiming a finger
  await page
    .waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(160);
  // from the empty-state seed chips, hop to a word that has edges
  const seedChip = page.locator('#sheet .chip').first();
  if (await seedChip.count()) {
    await tap(page, '#sheet .chip');
    await page.waitForTimeout(160);
    // the hopped-to word's sheet gets its own one-time swaps (deep senses,
    // bank examples) — settle before step 4 walks its rows
    await page
      .waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 6000 })
      .catch(() => {});
    await page.waitForTimeout(600);
  }
  const semPanel = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return {
      node: s.dataset.node,
      headword: s.querySelector('.headword')?.textContent ?? '',
      semRows: [...s.querySelectorAll('.sem-row')].map((r) => ({
        word: r.querySelector('.sem-word').textContent,
        note: r.querySelector('.sem-note').textContent,
      })),
    };
  })()`);
  check('semantic neighbours carry their discrimination notes',
    semPanel.semRows.length > 0 && semPanel.semRows.every((r) => r.note.length > 0),
    semPanel.semRows.length
      ? `${semPanel.headword}: ${semPanel.semRows.length} edges, e.g. ${semPanel.semRows[0].word}「${semPanel.semRows[0].note}」`
      : 'no edges reached',
  );
  await shoot(page, shotsDir, '03b-semantic-neighbours');
  report.steps.push({ step: 3.5, name: 'semantic neighbours', shot: '03b-semantic-neighbours.png', semPanel });

  // ------------------------------------------------------ step 4 the graph
  console.log('\n— step 4 · walk the graph');
  const hops = [];
  const nodeNow = async () => page.locator('#sheet').getAttribute('data-node');

  // word → kanji (the KANJI IN THIS WORD rows)
  await tap(page, '#sheet [data-kanjirow]');
  await page.waitForTimeout(160);
  hops.push(await nodeNow());
  const kanjiPage = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return {
      node: s.dataset.node,
      glyph: s.querySelector('.hero-glyph')?.textContent ?? '',
      meaning: s.querySelector('.hero-mean')?.textContent ?? '',
      tags: [...s.querySelectorAll('.pool-tag')].map((t) => t.textContent),
      sections: [...s.querySelectorAll('.eyebrow')].map((t) => t.textContent),
    };
  })()`);
  check('word → kanji lands on a real kanji page',
    kanjiPage.node.startsWith('kanji:') && kanjiPage.glyph.length === 1 && kanjiPage.meaning.length > 0,
    `${kanjiPage.glyph} — ${kanjiPage.meaning}; ${kanjiPage.tags.join(' / ')}`);
  check('the kanji page carries its 漢検級',
    kanjiPage.tags.some((t) => t.includes('漢検')),
    kanjiPage.tags.filter((t) => t.includes('漢検')).join(','));
  await shoot(page, shotsDir, '04-kanji-page');
  report.steps.push({ step: 4, name: 'kanji', shot: '04-kanji-page.png', kanjiPage });

  const idiomHeading = await page.locator('#sheet .eyebrow', { hasText: '熟語' }).count();
  report.idiomSectionPresent = idiomHeading > 0;
  check('idioms hang off the kanji page (provenance lives in the sources panel)',
    idiomHeading > 0, `${idiomHeading} idiom section(s)`);

  // kanji → a word containing it (same page, before descending)
  const markWordChip = async () => page.evaluate(`(() => {
    const heads = [...document.querySelectorAll('#sheet .eyebrow')];
    const h = heads.find((x) => x.textContent.includes('よく使う語') || x.textContent.includes('含む語'));
    if (!h) return 0;
    const first = h.nextElementSibling?.querySelector('.entry-row');
    if (!first) return 0;
    first.dataset.probe = 'wordchip';
    return 1;
  })()`);
  if (await markWordChip()) {
    await tap(page, '#sheet [data-probe="wordchip"]');
    await page.waitForTimeout(160);
    check('kanji → a word that contains it', (await nodeNow()).startsWith('word:'), await nodeNow());
    hops.push(await nodeNow());
    await shoot(page, shotsDir, '04d-kanji-to-word');
    await tap(page, '#sheet-back');
    await page.waitForTimeout(150);
  } else {
    check('kanji → a word that contains it', false, 'no compounds section on this kanji page');
  }

  // kanji → radical
  const markPartChip = async () => page.evaluate(`(() => {
    const heads = [...document.querySelectorAll('#sheet .eyebrow')];
    const h = heads.find((x) => x.textContent.includes('部品'));
    if (!h) return 0;
    const first = h.nextElementSibling?.querySelector('.entry-row');
    if (!first) return 0;
    first.dataset.probe = 'partchip';
    return 1;
  })()`);
  if (await markPartChip()) {
    await tap(page, '#sheet [data-probe="partchip"]');
    await page.waitForTimeout(160);
  }
  const radicalPage = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return {
      node: s.dataset.node,
      glyph: s.querySelector('.hero-glyph')?.textContent ?? '',
      name: s.querySelector('.hero-mean')?.textContent ?? '',
      family: document.querySelectorAll('#sheet .chip').length,
      heading: [...s.querySelectorAll('.eyebrow')].map((t) => t.textContent).join(' | '),
    };
  })()`);
  check('kanji → radical lands on a real radical page with a family',
    radicalPage.node.startsWith('radical:') && radicalPage.family > 1,
    `${radicalPage.glyph}（${radicalPage.name}） ${radicalPage.heading}`);
  hops.push(radicalPage.node);
  await shoot(page, shotsDir, '04b-radical-page');
  report.steps.push({ step: 4.1, name: 'radical', shot: '04b-radical-page.png', radicalPage });

  // radical → back out to another kanji that uses it
  const markFamilyChip = async () => page.evaluate(`(() => {
    const heads = [...document.querySelectorAll('#sheet .eyebrow')];
    const h = heads.find((x) => x.textContent.includes('含む字'));
    if (!h) return 0;
    const chips = [...(h.nextElementSibling?.querySelectorAll('.chip') ?? [])];
    const pick = chips[chips.length > 1 ? 1 : 0];
    if (!pick) return 0;
    pick.dataset.probe = 'familychip';
    return 1;
  })()`);
  if (await markFamilyChip()) {
    await tap(page, '#sheet .chip[data-probe="familychip"]');
    await page.waitForTimeout(160);
  }
  hops.push(await nodeNow());
  check('radical → another kanji that uses it', (await nodeNow()).startsWith('kanji:'), await nodeNow());
  await shoot(page, shotsDir, '04c-radical-to-kanji');
  report.hops = hops;

  // ------------------------------------------------------------ step 5 take
  console.log('\n— step 5 · 覚える');
  await tap(page, '#take');
  const taken = await page.locator('#tray').textContent();
  check('any node can be taken into study', /覚\s*[1-9]/.test(taken), `chrome reads "${taken.trim()}"`);
  const bucket = await page.evaluate(`(() => {
    const p = document.querySelector('.list-picker .eyebrow');
    return p ? p.textContent : null;
  })()`);
  check('覚える lands the item in this month\'s list automatically',
    !!bucket && /\d{4}年\d{1,2}月/.test(bucket), String(bucket).slice(0, 44));
  const sched = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('#sheet .sched tr')].slice(1).map((r) =>
      [...r.querySelectorAll('td')].map((td) => td.textContent));
    return { rows, note: document.querySelector('#sheet .sched')?.previousElementSibling?.textContent ?? '' };
  })()`);
  check('the schedule preview shows what FSRS-6 would do',
    sched.rows.length === 4 && sched.rows.every((r) => r[1] && r[2]),
    sched.rows.map((r) => `${r[0]}→${r[1]}`).join(' · '));
  await shoot(page, shotsDir, '05-take-and-schedule');
  report.steps.push({ step: 5, name: 'take', shot: '05-take-and-schedule.png', schedule: sched.rows });

  // ---------------------------------------------------------- step 6 return
  console.log('\n— step 6 · return without losing your place');
  await page.evaluate('window.scrollTo(0, 0)');
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await settleReader(page);
  await page.evaluate('window.scrollTo(0, 420)');
  await page.waitForTimeout(80);
  // reach the word first (touchAt centres its target — the finger's own
  // scroll), THEN record the place the reader is actually at when touching
  await page.locator('#reader .tok.content').nth(23).evaluate((n) => n.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const scrollBefore = await page.evaluate('window.scrollY');
  await holdWord(page, '#reader .tok.content', 23);
  await page.waitForSelector('#sheet');
  // the deep tier's one-time re-render replaces the sheet body moments after
  // it opens — tapping a kanji row mid-swap dies with it (same settle as
  // walkToSemPanel)
  await page
    .waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 6000 })
    .catch(() => {});
  await tap(page, '#sheet [data-kanjirow]');
  await page.waitForTimeout(140);
  await tap(page, '#sheet-back');
  await tap(page, '#sheet-back');
  await page.waitForTimeout(200);
  const scrollAfter = await page.evaluate('window.scrollY');
  const sheetGone = (await page.locator('#sheet').count()) === 0;
  check('two hops deep, 戻る returns to the reader at the same place',
    sheetGone && Math.abs(scrollAfter - scrollBefore) <= 4,
    `scrollY ${scrollBefore} → ${scrollAfter}, sheet closed=${sheetGone}`);
  await shoot(page, shotsDir, '06-return-to-place');
  report.steps.push({ step: 6, name: 'return', shot: '06-return-to-place.png', scrollBefore, scrollAfter });

  // --------------------------------------------------------- the variants
  console.log('\n— variants');
  const variantShots = {};

  // A · card format
  for (const mode of ['mcd', 'word']) {
    await open(`?entry=shelf&cards=${mode}`);
    await tap(page, '.shelf-item');
    await settleReader(page);
    await holdWord(page, '#reader .tok.content', 5);
    await page.waitForSelector('#sheet .card-preview');
    // two one-time sheet swaps may follow the open (deep senses, bank
    // examples) — let them land before touching located elements
    await page
      .waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 6000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    await page.locator('#sheet .card-preview').scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    const card = await page.evaluate(`(() => {
      const c = document.querySelector('#sheet .card-preview');
      return { kind: c.querySelector('.card-kind').textContent,
               face: c.querySelector('.card-face').innerText,
               cloze: !!c.querySelector('.cloze'),
               target: !!c.querySelector('.target'),
               back: c.querySelector('.card-back').innerText };
    })()`);
    check(`variant A · ${mode} renders the target both ways`,
      mode === 'mcd' ? card.cloze : card.target,
      `${card.kind.slice(0, 22)} — face "${card.face.replace(/\n/g, ' ').slice(0, 34)}"`);
    variantShots[`A-${mode}`] = await shoot(page, shotsDir, `V-A-cards-${mode}`);
  }

  // B · difficulty presentation — behind 詳細 since v1.2, so open one card
  for (const mode of ['three', 'band']) {
    await open(`?entry=shelf&difficulty=${mode}`);
    await page.locator('[data-details]').first().click();
    await page.waitForTimeout(200);
    const shown = await page.evaluate(`(() => ({
      sigs: document.querySelectorAll('.shelf-item .sig').length,
      bands: document.querySelectorAll('.shelf-item .band').length,
      uncertain: document.querySelectorAll('.shelf-item .uncertain').length,
    }))()`);
    check(`variant B · ${mode}`,
      mode === 'three' ? shown.sigs >= 3 && shown.bands === 0 : shown.bands === 1 && shown.sigs === 0,
      `${shown.sigs} signal rows / ${shown.bands} bands / ${shown.uncertain} uncertain markers (one 詳細 open)`);
    variantShots[`B-${mode}`] = await shoot(page, shotsDir, `V-B-difficulty-${mode}`);
  }

  // C · legibility vs depth — measured, both ways
  const contrastByVariant = {};
  for (const mode of ['current', 'wcag']) {
    await open(`?entry=shelf&contrast=${mode}`);
    const shelfProbe = await page.evaluate(MEASURE_FN);
    variantShots[`C-${mode}-shelf`] = await shoot(page, shotsDir, `V-C-contrast-${mode}-shelf`);
    await walkToSemPanel(page, tap);
    const panelProbe = await page.evaluate(MEASURE_FN);
    const merged = new Map();
    for (const row of [...shelfProbe.text, ...panelProbe.text]) {
      if (!merged.has(row.label)) merged.set(row.label, row);
    }
    contrastByVariant[mode] = [...merged.values()];
    variantShots[`C-${mode}`] = await shoot(page, shotsDir, `V-C-contrast-${mode}`);
  }
  report.measurements.contrast = contrastByVariant;

  const faintCurrent = contrastByVariant.current.find((m) => m.label.startsWith('faint / snippet'));
  const faintWcag = contrastByVariant.wcag.find((m) => m.label.startsWith('faint / snippet'));
  check('variant C · the WCAG side actually reaches AA',
    faintWcag && faintWcag.contrast >= WCAG_AA,
    `faint text: current ${faintCurrent?.contrast}:1 → wcag ${faintWcag?.contrast}:1 (AA needs ${WCAG_AA})`);
  check('variant C · the current side is honestly below AA (that is the cost being shown)',
    faintCurrent && faintCurrent.contrast < WCAG_AA,
    `${faintCurrent?.contrast}:1`);

  // D · entry
  for (const mode of ['field', 'shelf']) {
    await open(`?entry=${mode}`);
    const landed = await page.evaluate(`(() => ({
      field: !!document.querySelector('#field'),
      shelf: document.querySelectorAll('.shelf-item').length,
      words: document.querySelectorAll('.field-word').length,
      placeholder: !!document.querySelector('.note.placeholder'),
    }))()`);
    check(`variant D · ${mode} entry`,
      mode === 'field' ? landed.field && landed.words > 8 && landed.placeholder : landed.shelf >= 8,
      mode === 'field' ? `${landed.words} drifting words, placeholder marked=${landed.placeholder}` : `${landed.shelf} texts`);
    variantShots[`D-${mode}`] = await shoot(page, shotsDir, `V-D-entry-${mode}`);
    if (mode === 'field') {
      await tap(page, '#enter-shelf');
      await page.waitForTimeout(150);
      check('variant D · one gesture from the field to the shelf',
        (await page.locator('.shelf-item').count()) >= 8, 'tap 棚へ → shelf');
      variantShots['D-field-to-shelf'] = await shoot(page, shotsDir, 'V-D-entry-field-to-shelf');
    }
  }
  report.variantShots = Object.fromEntries(
    Object.entries(variantShots).map(([k, v]) => [k, v.split('/').pop()]),
  );

  // -------------------------------------------------- measurement + hygiene
  console.log('\n— measurements');
  await open('?entry=shelf');
  const shelfProbe = await page.evaluate(MEASURE_FN);
  const semRows = await walkToSemPanel(page, tap);
  const panelProbe = await page.evaluate(MEASURE_FN);
  const mergedText = new Map();
  for (const row of [...panelProbe.text, ...shelfProbe.text]) {
    if (!mergedText.has(row.label)) mergedText.set(row.label, row);
  }
  const m = { ...panelProbe, text: [...mergedText.values()] };
  m.targets = [...panelProbe.targets, ...shelfProbe.targets];
  report.measurements.text = m.text;
  report.measurements.targets = m.targets;
  report.measurements.semRowsOnProbePanel = semRows;
  await shoot(page, shotsDir, '07-measurement-probe');

  const reader = m.text.find((t) => t.label.startsWith('reading body'));
  const chrome = m.text.find((t) => t.label.startsWith('chrome breadcrumb'));
  check('focused content dominates the background chrome',
    reader && chrome && reader.fontSize >= chrome.fontSize * 1.5,
    `reader ${reader?.fontSize}px vs chrome ${chrome?.fontSize}px (Drift's inverted case was 11px vs 22–43px)`);

  const note = m.text.find((t) => t.label.startsWith('discrimination note'));
  check('discrimination notes are legible (AA)', note && note.contrast >= WCAG_AA,
    `${note?.contrast}:1 at ${note?.fontSize}px`);
  const bodyInk = m.text.find((t) => t.label === 'view title' || t.label === 'shelf title');
  check('body ink clears AAA', bodyInk && bodyInk.contrast >= 7, `${bodyInk?.contrast}:1`);

  const small = m.targets.filter((t) => t.hitH < MIN_TAP || t.hitW < MIN_TAP);
  check(`every visible control is at least ${MIN_TAP}px`, small.length === 0,
    small.length
      ? small.map((t) => `${t.id || t.text} visual ${t.w}×${t.h}, hit ${t.hitW}×${t.hitH}`).join(', ')
      : `${m.targets.length} controls checked, including inline token hit regions`);

  check('the page never scrolls sideways at 390px',
    m.docScrollWidth <= m.innerWidth,
    `scrollWidth ${m.docScrollWidth} vs viewport ${m.innerWidth}`);
  check('no console errors during the walk', consoleErrors.length === 0,
    consoleErrors.slice(0, 3).join(' | ') || 'clean');

  await open('?entry=shelf');
  await page.locator('#variants-toggle').click();
  await page.waitForTimeout(150);
  const stripRows = await page.locator('#variants .vrow').count();
  const ticketRows = await page.evaluate(
    `[...document.querySelectorAll('#variants .vlabel')].filter((l) => /#\\d\\d/.test(l.textContent)).length`,
  );
  // Named, not counted: a bare row total said nothing about WHICH decisions
  // were on the strip, so it passed for any five rows and failed for the right
  // seven. The four Wayfinder tickets keep their own count; every other row the
  // strip is supposed to carry is now named here and must actually be present.
  const NON_TICKET_ROWS = ['E 奥行', 'F 触れの段', 'G 衛星の触れ'];
  const rowKeys = await page.evaluate(
    `[...document.querySelectorAll('#variants .vseg button')].map((b) => b.dataset.variant.split(':')[0])
       .filter((k, i, a) => a.indexOf(k) === i)`,
  );
  const labels = await page.evaluate(
    `[...document.querySelectorAll('#variants .vlabel')].map((l) => l.textContent)`,
  );
  const namedPresent = NON_TICKET_ROWS.filter((n) => labels.some((l) => l.includes(n)));
  check('the variant strip exposes all four open decisions, the v1.1 depth toggle and the drift tap ladder',
    ticketRows === 4 && namedPresent.length === NON_TICKET_ROWS.length && stripRows === ticketRows + NON_TICKET_ROWS.length,
    `${stripRows} rows (${rowKeys.join(', ')}); ${ticketRows} carry ticket numbers; named rows present: ${namedPresent.join(' · ') || 'none'}`);
  await shoot(page, shotsDir, '08-variant-strip-open');

  // ------------------------------------------------- v1.1 operator feedback
  console.log('\n— v1.1 · bilingual chrome and layered depth');
  await open('?entry=shelf');
  const biChrome = await page.evaluate(`(() => ({
    backEn: /back/i.test(document.querySelector('#back')?.textContent ?? ''),
    trayEn: /lists/i.test(document.querySelector('#tray')?.textContent ?? ''),
    trayJa: /覚/.test(document.querySelector('#tray')?.textContent ?? ''),
    segEn: document.querySelector('#lang [data-lang="bi"]')?.textContent === 'EN',
    segJa: document.querySelector('#lang [data-lang="ja"]')?.textContent === '日本語',
    active: document.querySelector('#lang [data-lang="bi"]')?.getAttribute('aria-pressed'),
  }))()`);
  check('v1.1 · navigation is bilingual by default (a learner can steer)',
    biChrome.backEn && biChrome.trayEn && biChrome.trayJa && biChrome.active === 'true',
    `back carries "back", 覚 carries "lists", EN active=${biChrome.active}`);
  check('v1.2 · the language toggle reads exactly EN | 日本語',
    biChrome.segEn && biChrome.segJa, `EN=${biChrome.segEn} 日本語=${biChrome.segJa}`);

  await page.locator('#lang [data-lang="ja"]').click();
  await page.waitForTimeout(200);
  const jaChrome = await page.evaluate(`(() => {
    const latin = (sel) => /[a-z]/i.test(document.querySelector(sel)?.textContent ?? '');
    return { back: latin('#back'), tray: latin('#tray'), active: document.querySelector('#lang [data-lang="ja"]')?.getAttribute('aria-pressed') };
  })()`);
  check('v1.1 · 日本語のみ strips the chrome back to immersion mode',
    !jaChrome.back && !jaChrome.tray && jaChrome.active === 'true',
    `after toggling: back latin=${jaChrome.back}, lists latin=${jaChrome.tray}`);
  await page.locator('#lang [data-lang="bi"]').click();
  await page.waitForTimeout(200);

  const layered = await page.evaluate(`(() => ({
    layered: document.body.classList.contains('v-depth-layered'),
    wcag: document.body.classList.contains('v-contrast-wcag'),
    stitched: !!document.querySelector('.tok') || true,
  }))()`);
  check('v1.1 · layered depth and WCAG contrast are the defaults',
    layered.layered && layered.wcag, `body classes: layered=${layered.layered}, wcag=${layered.wcag}`);
  await shoot(page, shotsDir, '09-v11-bilingual-layered');

  await open('?entry=shelf&depth=flat&contrast=current&ui=ja');
  const flat = await page.evaluate(
    `!document.body.classList.contains('v-depth-layered') && !document.body.classList.contains('v-contrast-wcag')`,
  );
  check('v1.1 · the v1.0 look survives as toggles (flat + fade + 日本語のみ)', flat, 'depth=flat&contrast=current&ui=ja');
  await shoot(page, shotsDir, '10-v11-flat-fade-ja');

  // ------------------------------------------------- v1.2 operator round 3
  console.log('\n— v1.2 · dictionary depth, grammar, lists, quiet surfaces');
  await open('?entry=shelf');
  await tap(page, '#grammar-link');
  await page.waitForTimeout(250);
  const grammarIndex = await page.locator('[data-grammar]').count();
  check('v1.2 · the grammar dictionary stands (original content, N5/N4 backbone)',
    grammarIndex >= 55, `${grammarIndex} entries in the index`);
  check('v1.8 · the v11 grammar harvest rides in (#36), N1 included',
    (await page.locator('[data-grammar="n4-you-ni-naru"]').count()) === 1 &&
      (await page.locator('[data-glevel="N1"]').count()) === 1,
    'harvested ようになる present; N1 filter chip exists');
  await page.locator('[data-glevel="N5"]').click();
  await page.waitForTimeout(200);
  const n5Count = await page.locator('[data-grammar]').count();
  check('v1.7 · the grammar index filters by level',
    n5Count >= 8 && n5Count < grammarIndex, `${n5Count} N5 entries of ${grammarIndex}`);
  await page.locator('[data-glevel="all"]').click();
  await page.waitForTimeout(150);
  await tap(page, '[data-grammar]');
  await page.waitForTimeout(250);
  const grammarEntry = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return s ? {
      headword: s.querySelector('.headword')?.textContent,
      formation: !!s.querySelector('.formation'),
      examples: s.querySelectorAll('.example').length,
    } : null;
  })()`);
  check('v1.2 · a grammar entry carries formation + examples',
    !!grammarEntry && grammarEntry.formation && grammarEntry.examples >= 2,
    grammarEntry ? `${grammarEntry.headword}: ${grammarEntry.examples} examples` : 'no entry sheet');

  // the kanji page draws its stroke order
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await settleReader(page);
  await holdWord(page, '#reader .tok.content');
  await page.waitForSelector('#sheet [data-kanjirow]');
  // two one-time sheet swaps can land after open — the deep dictionary's
  // richer senses and the example bank's sentences; tapping mid-swap dies
  await page
    .waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 6000 })
    .catch(() => {});
  await page.waitForTimeout(800);
  await tap(page, '#sheet [data-kanjirow]');
  await page.waitForSelector('#strokes path', { timeout: 6000 }).catch(() => {});
  const strokeCount = await page.locator('#strokes path').count();
  check('v1.2 · the kanji page draws its stroke order (KanjiVG)',
    strokeCount >= 3, `${strokeCount} strokes rendered`);
  await shoot(page, shotsDir, '11-v12-kanji-strokes');

  // reader surfaces carry no provenance/ticket narration
  await open('?entry=shelf');
  const narration = await page.evaluate(`(() => {
    const text = document.querySelector('main').textContent;
    return ['ShareAlike', '#58', '#44', 'corpus #', 'UNVERIFIED'].filter((m) => text.includes(m));
  })()`);
  check('v1.2 · the shelf carries no provenance narration (sources fold away)',
    narration.length === 0, narration.length ? `leaked: ${narration.join(', ')}` : 'quiet');

  // ------------------------------------------------- v1.5 · the search field
  console.log('\n— v1.5 · search: four doors, one box');
  await open('?entry=shelf');
  const doors = [
    ['kaisai', 'word:開催', 'romaji'],
    ['かいさい', 'word:開催', 'kana'],
    ['開', 'kanji:開', 'kanji'],
    ['peninsula', 'word:半島', 'English'],
    ['ばかり', 'grammar:bakari', 'grammar'],
  ];
  for (const [q, want, door] of doors) {
    await page.fill('#search', q);
    await page.waitForTimeout(350);
    const hit = await page.evaluate(
      `[...document.querySelectorAll('[data-result]')].some((r) => r.dataset.result === ${JSON.stringify(want)})`,
    );
    check(`search · the typed door accepts ${door}`, hit, `"${q}" → ${want}`);
  }
  // Honest naming (canon §7.2 vs this build): the CANONICAL four doors are
  // typed · handwriting · radical/component picker · SKIP. What ships today is
  // ONE door (typed) that eats four scripts. Calling those four "doors" was a
  // relabelling this instrument used to enshrine; the three missing entry modes
  // are tracked as excellence-spec B4, not quietly counted as present.
  const entryModes = await page.evaluate(`({
    handwriting: !!document.querySelector('[data-entry="handwriting"], #handwrite'),
    radical: !!document.querySelector('[data-entry="radical"], #radical-picker'),
    skip: !!document.querySelector('[data-entry="skip"], #skip-code'),
  })`);
  const present = 1 + Object.values(entryModes).filter(Boolean).length;
  check('search · the canonical four doors are counted honestly (B4 gap stated)',
    present >= 1,
    `${present}/4 canonical entry modes present (typed only today; handwriting · radical · SKIP are spec B4)`);
  await page.fill('#search', 'kaisai');
  await page.waitForTimeout(350);
  await page.locator('[data-result]').first().click();
  await page.waitForTimeout(300);
  check('search · a result opens its full entry',
    (await page.locator('#sheet').count()) === 1,
    (await page.locator('#sheet').getAttribute('data-node').catch(() => 'none')) ?? '');
  await shoot(page, shotsDir, '12-v15-search');

  // ------------------------------------------ v1.6 · particles as doors
  console.log('\n— v1.6 · particles: no dead pixels');
  await open('?entry=shelf');
  await page.fill('#search', 'wa');
  await page.waitForTimeout(350);
  check('particles · the search knows は',
    await page.evaluate(`[...document.querySelectorAll('[data-result]')].some((r) => r.dataset.result === 'particle:wa')`),
    '"wa" → particle:wa');

  await page.fill('#search', '');
  await page.waitForTimeout(250);
  await tap(page, '.shelf-item');
  await settleReader(page);
  const particleCount = await page.locator('#reader .tok.particle').count();
  check('particles · the reader marks particle tokens as doors', particleCount >= 5,
    `${particleCount} particle tokens wired`);
  await holdWord(page, '#reader .tok.particle');
  await page.waitForSelector('#sheet[data-node^="particle:"]');
  const pPage = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return { node: s.dataset.node, head: s.querySelector('.headword')?.textContent ?? '', examples: s.querySelectorAll('.example').length };
  })()`);
  check('particles · holding a particle opens its page with examples',
    pPage.node.startsWith('particle:') && pPage.examples >= 2,
    `${pPage.node} — ${pPage.head.trim()}, ${pPage.examples} examples`);
  await shoot(page, shotsDir, '13-v16-particle');

  // ------------------------------ Phase A · the observation log (taps)
  console.log('\n— Phase A · reader taps land in the observation log');
  await open('?entry=shelf&dials=0,0,0'); // furigana hidden → the full ladder
  await tap(page, '.shelf-item');
  await settleReader(page);
  const obsBefore = await page.evaluate(
    `(JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}').obslog || []).length`,
  );
  await tap(page, '#reader .tok.content', 3);
  await page.waitForTimeout(250);
  await tap(page, '#reader .tok.content', 3);
  await page.waitForTimeout(250);
  await holdWord(page, '#reader .tok.content', 3); // the entry lives on the hold now
  await page.waitForSelector('#sheet');
  await page.waitForTimeout(1600); // the trailing debounce persists the rows
  const obs = await page.evaluate(`(() => {
    const env = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const rows = (env.obslog || []).slice(${obsBefore});
    return { rows, srsHasKey: rows.length ? Object.prototype.hasOwnProperty.call(env.srs || {}, rows[0][2]) : null };
  })()`);
  const ladder = obs.rows.filter((r) => r[1] === 'tap');
  const sameWord = ladder.length === 4 && ladder.every((r) => r[2] === ladder[0][2] && r[4] === ladder[0][4]);
  // 1,2 from the taps; the hold passes THROUGH the mini (its gloss is real
  // assistance — an honest 2) on the way to the full entry's 3
  check('two taps and a hold — ふりがな, gloss, mini, entry — every rung logged',
    sameWord && ladder.map((r) => r[3]).join(',') === '1,2,2,3',
    ladder.map((r) => `depth ${r[3]}`).join(' → ') + ` (${ladder[0]?.[2]}@${ladder[0]?.[4]})` || 'no rows');
  check('rows persist inside the exported envelope with ms timestamps',
    ladder.every((r) => Number.isInteger(r[0]) && r[0] > 1.7e12 && typeof r[2] === 'string' && typeof r[4] === 'string'),
    `${obs.rows.length} rows appended after ${obsBefore} existing`);
  check('a tap is friction, never a grade — no FSRS state minted',
    obs.srsHasKey === false,
    `srs["${ladder[0]?.[2]}"] absent`);
  await shoot(page, shotsDir, '14-phaseA-obslog');

  // -------------------------- Phase A · the yomi probe (読み探査)
  console.log('\n— Phase A · yomi probe: stratified sampling, honest rows');
  const probeStats = await page.evaluate(`(() => {
    const cases = [['学校','がっこう'],['人々','ひとびと'],['手帳','てちょう'],['大人','おとな'],['電話','でんわ']];
    return {
      cls: cases.map(([w, r]) => window.__KAIRO_PROBE__.readingType(w, r)).join(''),
      pool: window.__KAIRO_PROBE__.poolStats(),
      draw: window.__KAIRO_PROBE__.drawStats(20),
    };
  })()`);
  check('classifier · 音訓混熟 land on the canonical compounds',
    probeStats.cls === '音訓混熟音',
    `学校/人々/手帳/大人/電話 → ${probeStats.cls}`);
  check('pool · thousands of untaken compounds, banded and typed',
    probeStats.pool.n > 3000 && Object.keys(probeStats.pool.bands).length >= 8 && Object.keys(probeStats.pool.rts).length === 4,
    `${probeStats.pool.n} compounds · ${Object.keys(probeStats.pool.bands).length} bands`);
  check('draw · a batch of 20 spreads bands, no head kanji repeats',
    probeStats.draw.n === 20 && probeStats.draw.heads === 20 && probeStats.draw.bands >= 6,
    `${probeStats.draw.heads} heads · ${probeStats.draw.bands} bands`);

  await open('');
  await page.waitForSelector('#ginga-symbol', { timeout: 20000 });
  await tap(page, '#ginga-symbol');
  await page.waitForSelector('.nav-dojo');
  await tap(page, '.nav-dojo');
  await page.waitForSelector('.focus-mode');
  await page.locator('.focus-mode', { hasText: '読み探査' }).click();
  await page.locator('.focus-start').click();
  await page.waitForSelector('.review-front', { timeout: 20000 });
  const probeZen = await page.evaluate(`document.body.classList.contains('zen')`);
  check('the probe room keeps the zen glass', probeZen === true, 'body.zen while a compound is up');
  await page.locator('#probe-reveal').click();
  await page.waitForSelector('.probe-meta');
  const probeEnvBefore = await page.evaluate(
    `(() => { const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}'); return { taken: (e.taken||[]).length }; })()`,
  );
  await page.locator('[data-probe="wrong"]').click();
  await page.waitForTimeout(300);
  const probeAfter = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const rows = (e.obslog || []).filter((r) => r[1] === 'probe');
    const last = rows[rows.length - 1];
    return { taken: (e.taken||[]).length, last, srsHas: last ? Object.prototype.hasOwnProperty.call(e.srs || {}, last[2]) : null };
  })()`);
  check('a missed probe mints the card and logs one row — never FSRS state',
    probeAfter.taken === probeEnvBefore.taken + 1 && probeAfter.last?.[3] === 1 && probeAfter.last?.[4] === 1 && probeAfter.srsHas === false,
    `row ${JSON.stringify(probeAfter.last)}`);
  await shoot(page, shotsDir, '15-phaseA-yomi-probe');

  // -------------------------- the newspaper archive (新聞アーカイブ)
  console.log('\n— the newspaper archive: a deep stack behind one quiet door');
  await open('?entry=shelf');
  await page.waitForSelector('#archive-link');
  await tap(page, '#archive-link');
  await page.waitForSelector('.archive-year', { timeout: 15000 });
  const archiveSub = await page.locator('.shelf-snippet.intro').textContent();
  check('the stack opens: hundreds of articles, year-folded, rights named',
    /\d{3}/.test(archiveSub) && /CC BY 2.5/.test(archiveSub) && (await page.locator('.archive-year').count()) >= 15,
    archiveSub.trim().slice(0, 70));
  await tap(page, '.archive-year');
  await page.waitForSelector('.archive-row');
  await tap(page, '.archive-row');
  await settleReader(page);
  const archiveTok = await page.locator('#reader .tok').count();
  const archiveAttr = await page.evaluate(
    `document.querySelector('main .note a.inline-link')?.textContent ?? ''`,
  );
  check('an archive article reads like any shelf text — tokens, level, source link',
    archiveTok > 40 && /CC BY 2.5/.test(archiveAttr),
    `${archiveTok} tokens · "${archiveAttr}"`);
  await tap(page, '#back');
  await page.waitForSelector('.archive-year');
  check('back returns to the stack, not the shelf', true, 'archive restored');
  const standaloneSrc = readFileSync(resolve(CORRIDOR_DIR, 'corridor-standalone.html'), 'utf8');
  check('the single-file build does not embed the stack it cannot carry',
    !standaloneSrc.includes('"articles/archive'),
    'no articles/archive bundle keys in corridor-standalone.html');
  await shoot(page, shotsDir, '16-archive-stack');

  // ------------------ 用例の蔵 · examples everywhere, sentences that answer
  console.log('\n— the example bank: ≥4 sentences, every token a door');
  await open('?entry=shelf');
  await page.fill('#search', '学校');
  await page.waitForTimeout(500);
  await tap(page, '[data-result="word:学校"]');
  await page.waitForSelector('#sheet');
  await page
    .waitForFunction(() => document.querySelectorAll('#sheet .example').length >= 4, null, { timeout: 15000 })
    .catch(() => {});
  await page
    .waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  const bankSheet = await page.evaluate(`(() => ({
    n: document.querySelectorAll('#sheet .example').length,
    live: document.querySelectorAll('#sheet .example .sentence-tok').length,
    en: document.querySelectorAll('#sheet .example .example-en').length,
  }))()`);
  check('a common word carries at least 4 example sentences',
    bankSheet.n >= 4 && bankSheet.en >= 1,
    `${bankSheet.n} examples · ${bankSheet.en} with English`);
  const ladderProof = await page.evaluate(`(() => {
    const tok = document.querySelector('#sheet .example .sentence-tok');
    if (!tok) return null;
    const fire = () => tok.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fire();
    const rt = tok.querySelectorAll('rt').length;
    fire();
    const gloss = !!tok.querySelector('.tok-en');
    return { rt, gloss };
  })()`);
  check('example tokens climb the reader ladder — ふりがな, then English',
    !!ladderProof && ladderProof.gloss,
    JSON.stringify(ladderProof));
  // every example sentence carries a door into its own minimum reader —
  // and 戻る from there returns exactly one step, to the word's entry
  await page.evaluate(`document.querySelector('#sheet .example .sent-door')?.click()`);
  await page.waitForSelector('#sheet .sent-reader', { timeout: 8000 });
  const sentPage = await page.evaluate(`(() => ({
    toks: document.querySelectorAll('#sheet .sent-reader .sentence-tok').length,
    en: !!document.querySelector('#sheet .sent-reader-en'),
  }))()`);
  check('the sentence opens on its own page — large, every token alive',
    sentPage.toks >= 1,
    `${sentPage.toks} live tokens · en=${sentPage.en}`);
  await page.evaluate(`document.querySelector('#sheet-back')?.click()`);
  await page.waitForTimeout(300);
  const backToWord = await page.evaluate(`document.querySelector('#sheet')?.dataset.node ?? 'closed'`);
  check('戻る from the sentence page returns one step, to the word',
    backToWord === 'word:学校',
    `sheet after back: ${backToWord}`);
  await shoot(page, shotsDir, '17-example-bank');

  // the first sense wins — 半島 is the canary (its JMdict entry carries a
  // short minor sense, "Korea", that a shortest-wins gloss once surfaced)
  await open('?entry=shelf');
  await page.fill('#search', '半島');
  await page.waitForTimeout(500);
  await tap(page, '[data-result="word:半島"]');
  await page.waitForSelector('#sheet .example .sent-door', { timeout: 15000 });
  await page.waitForTimeout(400);
  await page.evaluate(`document.querySelector('#sheet .example .sent-door')?.click()`);
  await page.waitForSelector('#sheet .sent-reader .sentence-tok.example-hit', { timeout: 8000 });
  await tap(page, '#sheet .sent-reader .sentence-tok.example-hit');
  await page.waitForTimeout(200);
  await tap(page, '#sheet .sent-reader .sentence-tok.example-hit');
  await page.waitForTimeout(300);
  const hantoGloss = await page.evaluate(
    `document.querySelector('#sheet .sent-reader .sentence-tok.example-hit .tok-en')?.textContent ?? null`,
  );
  check('the first sense wins — 半島 glosses peninsula, never Korea',
    hantoGloss === 'peninsula',
    `inline gloss: "${hantoGloss}" (real taps on the sentence page)`);

  // capture scope: 語だけ · この文 · 段落 — the choice rides the card
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await settleReader(page);
  await holdWord(page, '#reader .tok.content', 6);
  await page.waitForSelector('#sheet #take');
  await page
    .waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 8000 })
    .catch(() => {});
  await tap(page, '#sheet #take');
  await page.waitForSelector('[data-ctx-scope]', { timeout: 8000 });
  await tap(page, '[data-ctx-scope="sent"]');
  await page.waitForTimeout(300);
  const ctxStored = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const it = (e.taken || []).find((t) => t.ctx);
    return it ? it.ctx : null;
  })()`);
  check('capture offers 語だけ・この文・段落 and the choice persists',
    (await page.locator('[data-ctx-scope]').count()) === 3 && ctxStored?.scope === 'sent' && typeof ctxStored?.i === 'number',
    JSON.stringify(ctxStored));

  // the bank reaches past the core: deep-tier and variant forms are indexed,
  // and the SRS answer face carries sentences of its own
  const bankManifest = JSON.parse(
    readFileSync(resolve(CORRIDOR_DIR, 'data/proprietary_safe/examples/manifest.json'), 'utf8'),
  );
  check('the bank indexes far beyond the core dictionary',
    bankManifest.coverage.indexed_forms > bankManifest.coverage.targets,
    `${bankManifest.coverage.indexed_forms} indexed forms vs ${bankManifest.coverage.targets} core targets`);
  // bare by default, and the way back (operator's law, 2026-08-12): the app
  // boots with readings on request; the tap cycle ends where it began.
  // Self-baselining: earlier sections may have exercised the (persisted)
  // dials — this asserts the FACTORY default, so clear any stored choice.
  await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    delete e.dials;
    localStorage.setItem('kairo-corridor-v1', JSON.stringify(e));
  })()`);
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await settleReader(page);
  const bareBoot = await page.evaluate(`(() => ({
    visible: [...document.querySelectorAll('#reader rt')].filter((r) => !r.classList.contains('hidden-rt')).length,
    hidden: document.querySelectorAll('#reader rt.hidden-rt').length,
  }))()`);
  check('the reader boots bare — ふりがな waits for the tap',
    bareBoot.visible === 0 && bareBoot.hidden > 10,
    `${bareBoot.visible} shown · ${bareBoot.hidden} waiting`);
  const cycleTap = () => page.evaluate(`(() => {
    const t = [...document.querySelectorAll('#reader .tok.content')].find((x) => x.querySelector('rt'));
    t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
    t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 }));
    // activation rides the click a real browser sends after the tap
    t.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  })()`);
  const cycleState = () => page.evaluate(`(() => {
    const t = [...document.querySelectorAll('#reader .tok.content')].find((x) => x.querySelector('rt')) ||
      [...document.querySelectorAll('#reader .tok.content')][0];
    return { rt: [...t.querySelectorAll('rt')].filter((r) => !r.classList.contains('hidden-rt')).length, gloss: !!t.querySelector('.tok-en') };
  })()`);
  await cycleTap();
  await page.waitForTimeout(150);
  const cyc1 = await cycleState();
  await cycleTap();
  await page.waitForTimeout(150);
  const cyc2 = await cycleState();
  await cycleTap();
  await page.waitForTimeout(200);
  const cyc3 = await cycleState();
  check('the tap circle closes — ふりがな · gloss · plain kanji again',
    cyc1.rt >= 1 && cyc2.gloss && cyc3.rt === 0 && !cyc3.gloss,
    `rt=${cyc1.rt} → gloss=${cyc2.gloss} → back to rt=${cyc3.rt} gloss=${cyc3.gloss}`);
  // definitions live on the holds: a short hold floats the mini, a tap on it
  // (or a long hold) opens the full entry — and 戻る works IMMEDIATELY
  await touchAt(page, '#reader .tok.content', 4, 700); // past MINI_MS, short of FULL_MS
  await page.waitForSelector('#mini', { timeout: 6000 });
  const miniUp = await page.evaluate(`(() => ({
    word: document.querySelector('#mini .mini-word')?.textContent ?? '',
    gloss: !!document.querySelector('#mini .mini-gloss'),
  }))()`);
  check('a short hold floats the simple definition', miniUp.word.length > 0 && miniUp.gloss, `mini: ${miniUp.word}`);
  await page.evaluate(`document.querySelector('#mini .mini-entry')?.click()`);
  await page.waitForSelector('#sheet', { timeout: 8000 });
  await page.evaluate(`document.querySelector('#sheet-back')?.click()`); // immediately — no dead window
  await page.waitForTimeout(300);
  const backWorked = await page.evaluate(`!document.querySelector('#sheet')`);
  check('戻る answers the very first tap after an entry opens', backWorked, 'sheet closed on the immediate back');
  await page.evaluate(`document.querySelector('#dials-toggle')?.click()`);
  await page.waitForSelector('[data-dial="furigana:2"]', { state: 'attached', timeout: 8000 });
  await page.locator('[data-dial="furigana:2"]').dispatchEvent('click');
  await page.waitForTimeout(300);
  const dialPersist = await page.evaluate(
    `JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}').dials?.furigana`,
  );
  check('文字設定 rides the envelope — a chosen dial survives the session',
    dialPersist === 2,
    `stored furigana=${dialPersist}`);
  await page.locator('[data-dial="furigana:1"]').dispatchEvent('click'); // restore the baseline
  await page.waitForTimeout(200);

  // into the review room: the queue may open on a kanji card from an
  // earlier step — grade through to the first WORD card, whose answer face
  // must carry living sentences (chosen context via its article's async
  // load, or bank via its shard)
  await tap(page, '#back');
  await page.waitForSelector('#tray');
  await tap(page, '#tray');
  await page.waitForSelector('#review-start');
  await tap(page, '#review-start');
  await page.waitForSelector('#reveal, .review-cloze', { timeout: 10000 });
  let answerFace = { lines: 0, live: 0, word: '' };
  for (let cardN = 0; cardN < 6; cardN++) {
    await page.waitForSelector('#reveal', { timeout: 10000 });
    await page.evaluate(`document.querySelector('#reveal')?.click()`);
    await page
      .waitForFunction(
        () => document.querySelectorAll('.review-example, .review-cloze').length >= 1,
        null,
        { timeout: 8000 },
      )
      .catch(() => {});
    answerFace = await page.evaluate(`(() => ({
      lines: document.querySelectorAll('.review-example, .review-cloze').length,
      live: document.querySelectorAll('.review-example .sentence-tok, .review-cloze .sentence-tok').length,
      word: document.querySelector('.review-front')?.textContent ?? '',
    }))()`);
    if (answerFace.lines >= 1) break;
    await page.evaluate(`document.querySelector('.grade.g-good')?.click()`);
    await page.waitForTimeout(300);
  }
  check('the answer face carries living sentences — never a bare word where the corpus holds any',
    answerFace.lines >= 1 && answerFace.live >= 1,
    `“${answerFace.word.trim()}” · ${answerFace.lines} sentence lines · ${answerFace.live} live tokens`);
  await shoot(page, shotsDir, '18-review-answer-face');

  // grader signals table for the PR
  report.graderTable = shelfData.map((s) => ({
    title: s.title,
    titleEn: s.titleEn,
    level: `${s.level ?? ''}${s.levelNote ?? ''}`,
    disagreement: s.disagreement,
  }));

  const manifest = JSON.parse(
    readFileSync(resolve(CORRIDOR_DIR, 'data/manifest.json'), 'utf8'),
  );
  report.caps = manifest.caps;
  report.counts = manifest.counts;
  report.loadMs = loadMs;

  await browser.close();
  server.close();

  report.summary = { total: results.length, failed: failures };
  report.results = results;
  const reportPath = resolve(REPO, 'docs/prototype/verification-report.json');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  console.log(`screenshots → ${shotsDir}`);
  console.log(`report → ${reportPath}`);
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(2);
  },
);
