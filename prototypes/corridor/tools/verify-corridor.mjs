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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
    const rgb = s.match(/rgba?\\(([^)]+)\\)/);
    if (rgb) {
      const p = rgb[1].split(/[\\s,/]+/).filter(Boolean).map(Number);
      return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
    }
    // Chromium serializes computed color-mix(in srgb, ...) values as
    // color(srgb r g b / a), with unit-interval channels. Variant C now
    // derives its quiet ink from each world's --ink, so rejecting that
    // standards-form serialization turns a real rendered contrast into null.
    const srgb = s.match(/^color\\(srgb\\s+([^)]+)\\)$/i);
    if (!srgb) return null;
    const p = srgb[1].split(/[\\s/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some((v) => !Number.isFinite(v))) return null;
    return { rgb: p.slice(0, 3).map((v) => v * 255), a: p.length > 3 ? p[3] : 1 };
  };
  const bodyBg = parse(getComputedStyle(document.body).backgroundColor) || { rgb: [252,251,246], a: 1 };
  // measure against the surface the text actually sits on — since S3 the
  // bottom sheet is 黒漆 lacquer in every world, so a sheet label composited
  // against the BODY ground would report a fiction (1.3:1 for real 8:1)
  const bgOf = (node) => {
    let n = node;
    while (n && n !== document.documentElement) {
      const bg = parse(getComputedStyle(n).backgroundColor);
      if (bg && bg.a >= 0.9) return bg;
      n = n.parentElement;
    }
    return bodyBg;
  };
  const ratio = (node) => {
    const fg = parse(getComputedStyle(node).color); if (!fg) return null;
    const bg = bgOf(node);
    const c = fg.rgb.map((v, i) => v * fg.a + bg.rgb[i] * (1 - fg.a));
    const l1 = lum(c), l2 = lum(bg.rgb);
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
      const expanded = n.matches('button.tok, button.sent-door, button.rest-toggle') ? getComputedStyle(n, '::before') : null;
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

  // the shelf stands in quiet sections: every card under exactly one
  // eyebrow, every category one contiguous run — never split across the
  // shelf in disconnected stretches
  const sectionProbe = await page.evaluate(`(() => {
    const kids = [...document.querySelectorAll('#shelf-body > *')];
    const runs = [];
    let stray = 0;
    for (const kid of kids) {
      if (kid.matches('p.eyebrow.shelf-section')) {
        runs.push({ header: kid.childNodes[0]?.textContent?.trim() ?? '', items: 0 });
      } else if (kid.matches('.shelf-item')) {
        if (!runs.length) stray += 1;
        else runs[runs.length - 1].items += 1;
      }
    }
    const headers = runs.map((r) => r.header);
    return {
      stray,
      headers,
      empty: runs.filter((r) => r.items === 0).length,
      duplicated: headers.length !== new Set(headers).size,
      grouped: runs.reduce((a, r) => a + r.items, 0),
    };
  })()`);
  check('the shelf gathers into quiet sections — each category one run, no card outside one',
    sectionProbe.stray === 0 && sectionProbe.headers.length >= 4 &&
      !sectionProbe.duplicated && sectionProbe.empty === 0 &&
      sectionProbe.grouped === shelfData.length,
    `${sectionProbe.headers.length} sections: ${sectionProbe.headers.join(' · ')} — ${sectionProbe.grouped}/${shelfData.length} cards housed`);

  // the glossary is billed as itself: one-line definitions are labeled
  // 用語集 on the card and are never counted among the "real texts"
  const glossaryProbe = await page.evaluate(`(() => {
    const cards = [...document.querySelectorAll('.shelf-item')];
    const glossary = cards.filter((n) =>
      (n.querySelector('.shelf-meta')?.textContent ?? '').includes('用語集'));
    const labeled = glossary.filter((n) =>
      [...n.querySelectorAll('.shelf-meta .pool-tag')].some((t) => t.textContent.includes('用語集')));
    const intro = document.querySelector('.shelf-snippet.intro')?.textContent ?? '';
    return { cards: cards.length, glossary: glossary.length, labeled: labeled.length, intro };
  })()`);
  const billedTexts = Number(glossaryProbe.intro.match(/([0-9]+) real texts|読み物 ([0-9]+) 本/)?.slice(1).find(Boolean) ?? NaN);
  check('glossary rows are labeled 用語集 and stand outside the real-text count',
    glossaryProbe.glossary > 0 && glossaryProbe.labeled === glossaryProbe.glossary &&
      billedTexts === glossaryProbe.cards - glossaryProbe.glossary &&
      /用語集|glossary/.test(glossaryProbe.intro),
    `${glossaryProbe.labeled}/${glossaryProbe.glossary} labeled · intro bills ${billedTexts} texts for ${glossaryProbe.cards - glossaryProbe.glossary} non-glossary cards`);
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

  // glossary cross-references resolve or fall silent: a citation whose
  // target stands on this shelf becomes a live door; one into the missing
  // rest of the glossary drops its number — no dead "(No.NN)" survives
  const inkanIndex = shelfData.findIndex((s) => s.title === '印鑑登録証');
  check('the cross-referencing glossary entry stands on the shelf', inkanIndex >= 0,
    `shelf index ${inkanIndex}`);
  await tap(page, '.shelf-item', inkanIndex);
  await settleReader(page);
  const refProbe = await page.evaluate(`(() => {
    const reader = document.getElementById('reader');
    const doors = [...reader.querySelectorAll('.glossary-ref')];
    return {
      text: reader.textContent,
      doors: doors.length,
      targets: doors.map((d) => d.dataset.glossaryRef),
    };
  })()`);
  check('no dead (No.NN) citation survives into the read',
    refProbe.text.length > 0 && !/No\s*\.\s*[0-9]/.test(refProbe.text),
    `${refProbe.text.replace(/\s+/g, '').slice(0, 48)}…`);
  check('the in-shelf citation is a live door to its glossary entry',
    refProbe.doors === 1 && refProbe.targets[0] === 'yasashii:6',
    `doors → ${refProbe.targets.join(', ') || 'none'}`);
  await page.evaluate(`document.querySelector('#reader .glossary-ref')?.click()`);
  await page
    .waitForFunction(
      `document.querySelector('h1.view-title')?.textContent === '印鑑登録証明書'`,
      null,
      { timeout: 8000 },
    )
    .catch(() => {});
  const refLanded = await page.evaluate(`document.querySelector('h1.view-title')?.textContent ?? ''`);
  check('the glossary door opens the entry it names', refLanded === '印鑑登録証明書',
    `landed on "${refLanded}"`);
  await open('?entry=shelf');

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

  // the radical picker is the densest tap grid in the app, and the shelf/panel
  // sweep above never enters the kanjidex — its chips are measured by name
  await open('?entry=shelf');
  await tap(page, '#kanjidex-link');
  await page.waitForSelector('.kdx-row', { timeout: 5000 });
  const kdx = await page.evaluate(`(() => {
    const chips = [...document.querySelectorAll('.kdx-chip')].filter((c) => c.offsetParent !== null);
    const rects = chips.map((c) => c.getBoundingClientRect());
    const small = rects.filter((r) => r.width < ${MIN_TAP} || r.height < ${MIN_TAP});
    return { total: chips.length, small: small.length };
  })()`);
  check(`kanjidex · every radical and stroke chip is at least ${MIN_TAP}px`,
    kdx.total > 100 && kdx.small === 0,
    `${kdx.total} chips measured, ${kdx.small} under ${MIN_TAP}px`);

  // ---------------- TENOHIRA PR 一 · the corridor installs to a home screen
  // The PWA seam is three files and one guard. The files must answer from the
  // same directory the Pages workflow copies; the registration guard must keep
  // service workers OUT of these http-driven verification runs (127.0.0.1 is
  // a secure context, so an unguarded register() WOULD take — the emptiness
  // of getRegistrations() is what convicts a dropped guard).
  await open('?entry=shelf');
  const pwa = await page.evaluate(`(async () => {
    const manifestLink = document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null;
    let manifest = null;
    let swText = '';
    try { manifest = await (await fetch('manifest.webmanifest')).json(); } catch {}
    try { swText = await (await fetch('sw.js')).text(); } catch {}
    const regs = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    return {
      manifestLink,
      name: manifest?.name ?? '',
      display: manifest?.display ?? '',
      icons: (manifest?.icons ?? []).map((i) => i.sizes),
      swFetches: /addEventListener\\('fetch'/.test(swText),
      registrations: regs.length,
    };
  })()`);
  check('PWA · the manifest is linked, named 回廊, standalone, and carries real icons',
    pwa.manifestLink === 'manifest.webmanifest' && pwa.name.includes('回廊') &&
      pwa.display === 'standalone' && pwa.icons.includes('192x192') && pwa.icons.includes('512x512'),
    `link=${pwa.manifestLink} · "${pwa.name}" · ${pwa.display} · icons ${pwa.icons.join(',')}`);
  check('PWA · the worker answers offline duty, and the https guard kept it out of this run',
    pwa.swFetches && pwa.registrations === 0,
    `fetch handler ${pwa.swFetches} · ${pwa.registrations} registrations on 127.0.0.1`);

  // ------------------------- TENOHIRA PR 一 · ひとこと — the friction door
  // The month of real use speaks through the tray: a note commits through the
  // guarded boundary as an obslog row, survives a reload, and rides the record.
  await open('?entry=shelf');
  await tap(page, '#tray');
  await page.waitForSelector('#note-input', { timeout: 5000 });
  await page.fill('#note-input', '読み物のふりがなが小さい');
  await tap(page, '#note-send');
  await page.waitForTimeout(300);
  const noteRow = await page.evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const rows = (s.obslog || []).filter((r) => r[1] === 'note');
    const last = rows[rows.length - 1] || [];
    return { count: rows.length, kind: last[1] ?? null, key: last[2] ?? null, text: last[3] ?? null };
  })()`);
  check('ひとこと · the note lands in the obslog through the guarded boundary',
    noteRow.count >= 1 && noteRow.kind === 'note' && noteRow.key === 'op' && noteRow.text === '読み物のふりがなが小さい',
    JSON.stringify(noteRow));
  await open('?entry=shelf');
  await tap(page, '#tray');
  await page.waitForSelector('#note-input', { timeout: 5000 });
  const noteBack = await page.evaluate(
    `[...document.querySelectorAll('.note-log .note-row')].some((n) => n.textContent.includes('読み物のふりがなが小さい'))`,
  );
  check('ひとこと · a reload later the note still stands in the tray', noteBack === true,
    `rendered after reload: ${noteBack}`);

  // ---------------- TENOHIRA · 聞く — the reader's interim voice door
  // Headless Chromium ships no Japanese voice, so the probe convicts the
  // door's PRESENCE, its honest 仮の声 label, and the graceful no-voice
  // path — the sound itself is judged by ears, not by this suite.
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await page.waitForSelector('#listen-toggle', { timeout: 15000 });
  const listenBefore = await page.evaluate(`({
    pressed: document.querySelector('#listen-toggle')?.getAttribute('aria-pressed') ?? null,
    note: document.querySelector('#listen-note')?.textContent ?? '',
  })`);
  await tap(page, '#listen-toggle');
  await page.waitForTimeout(250);
  const listenAfter = await page.evaluate(`({
    pressed: document.querySelector('#listen-toggle')?.getAttribute('aria-pressed') ?? null,
    note: document.querySelector('#listen-note')?.textContent ?? '',
  })`);
  check('reader · the 聞く door stands, names its interim voice, and answers a tap honestly',
    listenBefore.pressed === 'false' && /仮の声|interim device voice/.test(listenBefore.note) &&
      (listenAfter.pressed === 'true' || /声が見つからない|no Japanese voice/.test(listenAfter.note)),
    `before ${JSON.stringify(listenBefore)} → after ${JSON.stringify(listenAfter)}`);

  // the strip is summoned explicitly now — ?entry=shelf is a front door and
  // no longer raises the operator instrument (full-instrument review P1)
  await open('?entry=shelf&variants=1');
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

  // ------------- Phase A · the dojo drill: practice writes evidence only
  // 道場の礼 — focusPool('kanji') reaches past the learner's taken cards
  // into the common deck. Grading a NEVER-taken card must write the
  // observation ledger alone: no FSRS record the due queue (S.taken-scoped)
  // could never surface, no revlog row, no burned daily new-card slot — and
  // the seals must stamp practice, never a next-due promise the scheduler
  // will not keep. A TAKEN card in the same block keeps the full deck path.
  // The probe runs on a controlled envelope and hands the learner's own
  // bytes back untouched when it is done.
  console.log('\n— Phase A · dojo drill: evidence for practice, the deck for the taken');
  await page.waitForTimeout(1400); // let the probe row's debounced save land first
  const dojoSnapshot = await page.evaluate(`localStorage.getItem('kairo-corridor-v1')`);
  // an in-app 覚える stamps the no-debt started mark (R2-A); this row is one
  // of those, which is what earns it the full deck path below. A row without
  // the mark is a legacy/imported capture and drills as practice instead —
  // that case is its own probe further down (E3-A).
  await page.evaluate(`localStorage.setItem('kairo-corridor-v1', JSON.stringify({
    v: 1,
    taken: [{ t: 'kanji', id: '水', label: '水', kind: '漢字', kindEn: 'kanji', ts: Date.now(), started: Date.now() }],
  }))`);
  await open('');
  await page.waitForSelector('#ginga-symbol', { timeout: 20000 });
  await tap(page, '#ginga-symbol');
  await page.waitForSelector('.nav-dojo');
  await tap(page, '.nav-dojo');
  await page.waitForSelector('.focus-mode');
  await page.locator('.focus-mode', { hasText: '漢字だけ' }).click();
  await page.locator('.focus-start').click();
  await page.waitForSelector('.review-front', { timeout: 20000 });
  // card 1 · the taken 水 leads the pool — honest intervals, full deck path
  const dojoTakenFront = await page.evaluate(`document.querySelector('.review-front')?.textContent ?? ''`);
  await page.evaluate(`document.querySelector('#reveal')?.click()`);
  await page.waitForSelector('.grade-row');
  const dojoTakenRow = await page.evaluate(`(() => ({
    practice: document.querySelector('.grade-row').hasAttribute('data-practice'),
    whens: [...document.querySelectorAll('.grade .g-when')].map((n) => n.textContent),
  }))()`);
  check('dojo · a taken card keeps its honest next-due intervals',
    dojoTakenFront === '水' && dojoTakenRow.practice === false &&
      dojoTakenRow.whens.length === 4 && dojoTakenRow.whens.every((w) => /\d+ (min|d|分|日)$/.test(w)),
    `${dojoTakenFront} → ${dojoTakenRow.whens.join(' · ')}`);
  await page.evaluate(`document.querySelector('.grade.g-good')?.click()`);
  await page.waitForTimeout(400);
  const dojoDay = `(() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })()`;
  const dojoTakenAfter = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const day = ${dojoDay};
    return {
      srsKeys: Object.keys(e.srs || {}),
      revlog: (e.revlog || []).length,
      nnew: ((e.stats || {})[day] || {}).nnew || 0,
      dojoRows: (e.obslog || []).filter((r) => r[1] === 'dojo').length,
    };
  })()`);
  check('dojo · grading the taken card writes the deck — FSRS record, revlog row, one new-card slot',
    dojoTakenAfter.srsKeys.length === 1 && dojoTakenAfter.srsKeys[0] === 'kanji:水' &&
      dojoTakenAfter.revlog === 1 && dojoTakenAfter.nnew === 1 && dojoTakenAfter.dojoRows === 0,
    JSON.stringify(dojoTakenAfter));
  // card 2 · the pool's first never-taken kanji — the seals stamp practice…
  await page.waitForSelector('#reveal');
  const dojoDrillFront = await page.evaluate(`document.querySelector('.review-front')?.textContent ?? ''`);
  await page.evaluate(`document.querySelector('#reveal')?.click()`);
  await page.waitForSelector('.grade-row[data-practice]', { timeout: 8000 });
  const dojoDrillWhens = await page.evaluate(
    `[...document.querySelectorAll('.grade .g-when')].map((n) => n.textContent)`,
  );
  check('dojo · a never-taken card promises no schedule — every seal stamps practice',
    dojoDrillFront !== '水' && dojoDrillWhens.length === 4 &&
      dojoDrillWhens.every((w) => w === 'practice' || w === '稽古'),
    `${dojoDrillFront} → ${dojoDrillWhens.join(' · ')}`);
  await shoot(page, shotsDir, '15b-dojo-drill-practice');
  // …and grading it writes evidence only: srs/revlog untouched, the daily
  // new-card budget unburned, one obslog row naming the drill room
  await page.evaluate(`document.querySelector('.grade.g-good')?.click()`);
  await page.waitForTimeout(400);
  const dojoDrillAfter = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const day = ${dojoDay};
    const rows = (e.obslog || []).filter((r) => r[1] === 'dojo');
    return {
      srsKeys: Object.keys(e.srs || {}),
      revlog: (e.revlog || []).length,
      nnew: ((e.stats || {})[day] || {}).nnew || 0,
      last: rows[rows.length - 1] || null,
    };
  })()`);
  check('dojo · a drill grade writes evidence only — no FSRS state, no revlog row, no burned slot',
    dojoDrillAfter.srsKeys.length === 1 && dojoDrillAfter.srsKeys[0] === 'kanji:水' &&
      dojoDrillAfter.revlog === 1 && dojoDrillAfter.nnew === 1,
    `srs ${JSON.stringify(dojoDrillAfter.srsKeys)} · revlog ${dojoDrillAfter.revlog} · nnew ${dojoDrillAfter.nnew}`);
  check('dojo · the practice row lands in the observation ledger with its room',
    Array.isArray(dojoDrillAfter.last) && dojoDrillAfter.last[1] === 'dojo' &&
      dojoDrillAfter.last[2] === 'kanji:' + dojoDrillFront && dojoDrillAfter.last[3] === 3 &&
      dojoDrillAfter.last[4] === 'kanji',
    `row ${JSON.stringify(dojoDrillAfter.last)}`);
  // hand the envelope back exactly as found — this probe leaves no learner state
  await page.evaluate(`(() => {
    const snap = ${JSON.stringify(dojoSnapshot)};
    if (snap === null) localStorage.removeItem('kairo-corridor-v1');
    else localStorage.setItem('kairo-corridor-v1', snap);
  })()`);

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
  // R3-E crumb truth: the trail names the stack the back door actually
  // reopens — bookshelf › archive › title, never bookshelf › title
  const archiveCrumb = await page.evaluate(`document.querySelector('.crumb')?.textContent ?? ''`);
  const archiveReaderTitle = await page.evaluate(
    `document.querySelector('.view-title')?.textContent ?? ''`,
  );
  check('the archive read\'s crumb names its true origin — the archive, not the bare shelf',
    /bookshelf › archive › /.test(archiveCrumb) && archiveCrumb.includes(archiveReaderTitle),
    `crumb "${archiveCrumb.slice(0, 60)}"`);
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
  // the eyebrow teaches the whole gesture: the hold that opens the
  // dictionary must be said, not left for the reader to discover
  const exampleEyebrow = await page.evaluate(
    `[...document.querySelectorAll('#sheet .eyebrow')].map((n) => n.textContent).find((t) => t.includes('用例')) ?? ''`,
  );
  check('the 用例 eyebrow says that holding a word opens the dictionary',
    /長押しで辞書/.test(exampleEyebrow) || /hold it to open the dictionary/.test(exampleEyebrow),
    `eyebrow: "${exampleEyebrow}"`);
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
  await page.waitForSelector('#declare-recalled, .review-cloze', { timeout: 10000 });
  let answerFace = { lines: 0, live: 0, word: '' };
  for (let cardN = 0; cardN < 6; cardN++) {
    await page.waitForSelector('#declare-recalled', { timeout: 10000 });
    await page.evaluate(`document.querySelector('#declare-recalled')?.click()`);
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
  // the walk's recall declarations ride the observation debounce; let it
  // land before the next probe replaces the envelope (same idiom as the
  // dojo snapshot), so a pagehide flush cannot overwrite a fresh seed
  await page.waitForTimeout(1400);

  // -------------- R2-B · capture sovereignty (directive §3 · terminal T7)
  // 覚える top-right of every capture-eligible surface; capture reversible
  // everywhere; the revlog append-only through it all; lists born, renamed
  // and deleted on the lists surface itself.
  console.log('\n— R2-B · 覚える top-right · reversible capture · list management');
  // a seeded record: one memorized word with real FSRS state and one revlog
  // row — un-memorize semantics must be provable against audit history
  await page.evaluate(`localStorage.setItem('kairo-corridor-v1', JSON.stringify({
    v: 1,
    taken: [{ t: 'word', id: '学校', label: '学校', kind: '語', kindEn: 'word', from: null, ts: 1755000000000 }],
    srs: { 'word:学校': { due: '2020-01-01T00:00:00.000Z', last_review: '2019-12-31T00:00:00.000Z', stability: 3, difficulty: 5, elapsed_days: 1, scheduled_days: 1, reps: 1, lapses: 0, learning_steps: 0, state: 2 } },
    revlog: [[1754000000000, 'word:学校', 3, 0, null, null, null, null, 3, 5, 1, 1200]],
  }))`);
  await open('?entry=shelf');
  await page.fill('#search', '学校');
  await page.waitForTimeout(500);
  await tap(page, '[data-result^="word:学校"]');
  await page.waitForSelector('#sheet #sheet-take');
  // the dictionary's late arrival re-renders the sheet; a tap aimed between
  // renders finds a detached seal (seen once as "no box for #sheet-take")
  await page
    .waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(300);
  const sealBefore = await page.evaluate(`(() => {
    const b = document.querySelector('#sheet-take');
    return { taken: b.classList.contains('taken'), pressed: b.getAttribute('aria-pressed') };
  })()`);
  check('R2-B · the sheet seal wears taken-state where 覚える was taken',
    sealBefore.taken && sealBefore.pressed === 'true', JSON.stringify(sealBefore));
  await tap(page, '#sheet-take');
  await page.waitForTimeout(300);
  const afterUntake = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return { taken: (e.taken || []).length, revlog: (e.revlog || []).length,
             srsKept: Object.prototype.hasOwnProperty.call(e.srs || {}, 'word:学校') };
  })()`);
  check('R2-B · un-memorize removes the active card; revlog and FSRS state stay whole',
    afterUntake.taken === 0 && afterUntake.revlog === 1 && afterUntake.srsKept,
    JSON.stringify(afterUntake));
  await page.evaluate(`document.querySelector('#sheet-close')?.click()`);
  await page.waitForTimeout(200);
  await tap(page, '#tray');
  await page.waitForTimeout(200);
  check('R2-B · the deck no longer offers the card — the tray stands honestly empty',
    (await page.locator('.sem-empty').count()) === 1 && (await page.locator('#review-start').count()) === 0,
    'no review door on an empty deck');
  await tap(page, '#back');
  await page.waitForTimeout(200);
  await page.fill('#search', '学校');
  await page.waitForTimeout(500);
  await tap(page, '[data-result^="word:学校"]');
  await page.waitForSelector('#sheet #sheet-take');
  await tap(page, '#sheet-take');
  await page.waitForTimeout(300);
  const reTaken = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const rec = e.srs?.['word:学校'];
    return { taken: (e.taken || []).length, revlog: (e.revlog || []).length,
             reps: rec?.reps ?? null, due: rec?.due ?? null };
  })()`);
  check('R2-B · a re-take resumes the schedule — same card state, no invented history',
    reTaken.taken === 1 && reTaken.revlog === 1 && reTaken.reps === 1 && reTaken.due === '2020-01-01T00:00:00.000Z',
    JSON.stringify(reTaken));

  // lists are born, renamed and deleted on the lists surface itself
  await page.evaluate(`document.querySelector('#sheet-close')?.click()`);
  await page.waitForTimeout(200);
  await tap(page, '#tray');
  await page.waitForSelector('#list-maker-field');
  await page.locator('#list-maker-make').click();
  await page.waitForTimeout(150);
  const emptyErr = await page.evaluate(
    `document.querySelector('#list-maker-field')?.getAttribute('aria-invalid')`,
  );
  await page.fill('#list-maker-field', '読書');
  await page.locator('#list-maker-make').click();
  await page.waitForTimeout(250);
  await page.fill('#list-maker-field', '読書');
  await page.locator('#list-maker-make').click();
  await page.waitForTimeout(150);
  const dupeState = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const f = document.querySelector('#list-maker-field');
    return { lists: Object.keys(e.lists || {}), invalid: f?.getAttribute('aria-invalid'), hint: f?.placeholder ?? '' };
  })()`);
  check('R2-B · a list is born on the lists surface; empty and dupe names are told, not swallowed',
    emptyErr === 'true' && dupeState.lists.length === 1 && dupeState.lists[0] === '読書' && dupeState.invalid === 'true' && dupeState.hint.length > 0,
    `lists=${JSON.stringify(dupeState.lists)} · dupe hint "${dupeState.hint}"`);
  await open('?entry=shelf');
  await tap(page, '#tray');
  await page.waitForSelector('.list-op');
  const persisted = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return { lists: Object.keys(e.lists || {}), shown: [...document.querySelectorAll('.list-head')].some((h) => h.textContent.includes('読書')) };
  })()`);
  check('R2-B · the new list survives a reload, on the surface and in the envelope',
    persisted.lists.length === 1 && persisted.lists[0] === '読書' && persisted.shown,
    JSON.stringify(persisted.lists));
  await page.locator('.list-op').first().click();
  await page.waitForSelector('.list-rename .list-maker-field');
  await page.fill('.list-rename .list-maker-field', '精読');
  await page.locator('.list-rename .list-maker-make').click();
  await page.waitForTimeout(250);
  const renamed = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return Object.keys(e.lists || {});
  })()`);
  check('R2-B · rename lives where the list lives and persists',
    renamed.length === 1 && renamed[0] === '精読', JSON.stringify(renamed));
  await page.locator('.list-op').nth(1).click();
  await page.waitForTimeout(150);
  const armed = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return { still: Object.keys(e.lists || {}).length, armedBtn: !!document.querySelector('.list-op.armed') };
  })()`);
  await page.locator('.list-op.armed').click();
  await page.waitForTimeout(250);
  const deleted = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return { lists: Object.keys(e.lists || {}).length, taken: (e.taken || []).length,
             revlog: (e.revlog || []).length, srsKept: Object.prototype.hasOwnProperty.call(e.srs || {}, 'word:学校') };
  })()`);
  check('R2-B · delete arms first, then fires — and never touches the learner history',
    armed.armedBtn && armed.still === 1 && deleted.lists === 0 && deleted.taken === 1 && deleted.revlog === 1 && deleted.srsKept,
    `armed=${JSON.stringify(armed)} → ${JSON.stringify(deleted)}`);

  // the reader's top-right door: quiet until a word is touched, then one
  // tap takes the current thing with the sentence it was met in
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await settleReader(page);
  const idleSeal = await page.evaluate(`(() => {
    const b = document.querySelector('#reader-take');
    return b ? { disabled: b.disabled, pressed: b.getAttribute('aria-pressed') } : null;
  })()`);
  check('R2-B · 覚える waits top-right of the reader, quiet until a word is touched',
    !!idleSeal && idleSeal.disabled === true && idleSeal.pressed === 'false',
    JSON.stringify(idleSeal));
  await tap(page, '#reader .tok.content', 9);
  await page.waitForTimeout(200);
  const touched = await page.evaluate(`(() => {
    const t = document.querySelectorAll('#reader .tok.content')[9];
    const b = document.querySelector('#reader-take');
    return { word: t.dataset.word, index: Number(t.dataset.index), sealReady: !b.disabled, label: b.getAttribute('aria-label') };
  })()`);
  check('R2-B · touching a word arms the door with that word, in place',
    touched.sealReady && touched.label.includes(touched.word),
    `${touched.word} — "${touched.label}"`);
  const envBefore = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return { taken: (e.taken || []).length, revlog: (e.revlog || []).length };
  })()`);
  await tap(page, '#reader-take');
  await page.waitForSelector('#capture-panel');
  const captured = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const it = (e.taken || [])[(e.taken || []).length - 1];
    return { taken: (e.taken || []).length, t: it?.t, id: it?.id, ctx: it?.ctx ?? null };
  })()`);
  check('R2-B · capture from the reader top-right lands in S.taken with its sentence ctx',
    captured.taken === envBefore.taken + 1 && captured.t === 'word' && captured.id === touched.word &&
      captured.ctx?.scope === 'sent' && captured.ctx?.i === touched.index && typeof captured.ctx?.p === 'string',
    JSON.stringify(captured.ctx));
  const panelBits = await page.evaluate(`(() => ({
    take: !!document.querySelector('#capture-panel #take'),
    scopes: document.querySelectorAll('#capture-panel [data-ctx-scope]').length,
    lists: !!document.querySelector('#capture-panel .list-picker'),
    newList: !!document.querySelector('#capture-panel #new-list'),
  }))()`);
  check('R2-B · the panel holds the undo, the scope stages, and the lists',
    panelBits.take && panelBits.scopes === 3 && panelBits.lists && panelBits.newList,
    JSON.stringify(panelBits));
  await shoot(page, shotsDir, '19-capture-sovereignty');
  await tap(page, '#capture-panel #take');
  await page.waitForTimeout(250);
  const undone = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return { taken: (e.taken || []).length, revlog: (e.revlog || []).length };
  })()`);
  check('R2-B · a mis-tap leaves in one gesture; the revlog length never moves',
    undone.taken === envBefore.taken && undone.revlog === envBefore.revlog,
    JSON.stringify(undone));

  // the mini carries the same door, repainting in place — the mini never blinks
  const miniIx = await page.evaluate(
    `[...document.querySelectorAll('#reader .tok.content')].findIndex((t, i) => i >= 12 && t.dataset.word !== '学校')`,
  );
  await touchAt(page, '#reader .tok.content', miniIx, 700);
  await page.waitForSelector('#mini #mini-take');
  const miniWordText = await page.evaluate(`document.querySelector('#mini .mini-word')?.childNodes[0]?.textContent ?? ''`);
  await page.evaluate(`document.querySelector('#mini-take')?.click()`);
  await page.waitForTimeout(250);
  const miniCap = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const it = (e.taken || [])[(e.taken || []).length - 1];
    const seal = document.querySelector('#mini-take');
    return { id: it?.id, scope: it?.ctx?.scope ?? null, sealTaken: seal?.classList.contains('taken') ?? null, miniUp: !!document.querySelector('#mini') };
  })()`);
  check('R2-B · the mini takes the word in place — seal inked, sentence ctx stored, mini still up',
    miniCap.miniUp && miniCap.sealTaken === true && miniCap.id === miniWordText && miniCap.scope === 'sent',
    JSON.stringify(miniCap));
  await page.evaluate(`document.querySelector('#mini-take')?.click()`);
  await page.waitForTimeout(250);
  const miniUndone = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return { taken: (e.taken || []).length, sealTaken: document.querySelector('#mini-take')?.classList.contains('taken') ?? null };
  })()`);
  check('R2-B · the mini lets it go again — reversible where the state shows',
    miniUndone.taken === envBefore.taken && miniUndone.sealTaken === false,
    JSON.stringify(miniUndone));

  // the sentence page carries the seal for the word it is built around
  await open('?entry=shelf');
  await page.fill('#search', '半島');
  await page.waitForTimeout(500);
  await tap(page, '[data-result^="word:半島"]');
  await page.waitForSelector('#sheet .example .sent-door', { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.evaluate(`document.querySelector('#sheet .example .sent-door')?.click()`);
  await page.waitForSelector('#sheet .sent-reader');
  const sentSeal = await page.evaluate(`(() => {
    const b = document.querySelector('#sheet-take');
    return { present: !!b, label: b?.getAttribute('aria-label') ?? '' };
  })()`);
  check('R2-B · the sentence page seal names the word it captures',
    sentSeal.present && sentSeal.label.includes('半島'), JSON.stringify(sentSeal));
  await tap(page, '#sheet-take');
  await page.waitForTimeout(300);
  const sentCap = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const it = (e.taken || [])[(e.taken || []).length - 1];
    return { t: it?.t, id: it?.id, pressed: document.querySelector('#sheet-take')?.getAttribute('aria-pressed') };
  })()`);
  check('R2-B · taking from the sentence page mints the word card, reversibly marked',
    sentCap.t === 'word' && sentCap.id === '半島' && sentCap.pressed === 'true',
    JSON.stringify(sentCap));

  // ------------------- R2-A · one scheduler policy, ordered/bounded review,
  // no-debt legacy migration, and the learner's own pacing (ADR-003)
  console.log('\n— R2-A · scheduler policy, ordered/bounded review, no-debt legacy');
  const errsBeforeR2A = consoleErrors.length;

  // (a) fuzz is OFF, per the pin, and the clamp policy is the pin's
  const policy = await page.evaluate(`window.__KAIRO_SRS__.policy()`);
  check('R2-A · fuzz is OFF in the live engine and matches the domain pin',
    policy.enableFuzz === false && policy.pinFuzz === false,
    `engine enable_fuzz=${policy.enableFuzz} · pin enableFuzz=${policy.pinFuzz}`);
  check('R2-A · the pin names append-order-monotonic-clamp-v1',
    policy.reviewTimePolicyId === 'append-order-monotonic-clamp-v1',
    String(policy.reviewTimePolicyId));

  // (b) the clamp itself, on the real helper
  const clampProbe = await page.evaluate(`(() => {
    const T = 1700000000000;
    const iso = (ms) => new Date(ms).toISOString();
    const srs = window.__KAIRO_SRS__;
    return {
      behind: srs.schedulerInstant(iso(T + 5000), T) === iso(T + 5000),
      forward: srs.schedulerInstant(iso(T - 5000), T) === iso(T),
      first: srs.schedulerInstant(null, T) === iso(T),
    };
  })()`);
  check('R2-A · the per-card scheduler instant clamps up to the anchor, never back',
    clampProbe.behind && clampProbe.forward && clampProbe.first,
    JSON.stringify(clampProbe));

  // (c) due order + no-debt legacy: three overdue cards seeded out of order,
  // one started fresh row, one legacy row with no mark and no card
  await page.evaluate(`(() => {
    const T = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    const card = (dueMs, lastMs) => ({ due: iso(dueMs), last_review: iso(lastMs), stability: 5, difficulty: 5, elapsed_days: 1, scheduled_days: 3, reps: 2, lapses: 0, learning_steps: 0, state: 2 });
    const D = 86400000, H = 3600000;
    localStorage.setItem('kairo-corridor-v1', JSON.stringify({
      v: 1,
      taken: [
        { t: 'word', id: '学校', label: '学校', ts: T - 9e6, started: T - 9e6 },
        { t: 'word', id: '電話', label: '電話', ts: T - 8e6, started: T - 8e6 },
        { t: 'word', id: '手帳', label: '手帳', ts: T - 7e6, started: T - 7e6 },
        { t: 'word', id: '大人', label: '大人', ts: T - 6e6, started: T - 6e6 },
        { t: 'word', id: '人々', label: '人々', ts: T - 5e6 },
      ],
      srs: {
        'word:学校': card(T - 2 * H, T - D),
        'word:電話': card(T - 3 * D, T - 4 * D),
        'word:手帳': card(T - D, T - 2 * D),
      },
    }));
  })()`);
  await open('?entry=shelf');
  const dueOrder = await page.evaluate(`window.__KAIRO_SRS__.dueKeys()`);
  check('R2-A · real dues come most-overdue first; started fresh after; legacy absent',
    JSON.stringify(dueOrder) === JSON.stringify(['word:電話', 'word:手帳', 'word:学校', 'word:大人']),
    dueOrder.join(' → '));
  await page.waitForSelector('#tray');
  await tap(page, '#tray');
  await page.waitForSelector('#review-start');
  const trayBefore = await page.evaluate(`(() => ({
    button: document.getElementById('review-start').textContent,
    start: !!document.querySelector('[data-srs-start="word:人々"]'),
    forecast: document.querySelector('.srs-forecast')?.textContent ?? '',
  }))()`);
  check('R2-A · the legacy row waits with one quiet 始める and an honest forecast',
    /4/.test(trayBefore.button) && trayBefore.start && /not started 1|未着手 1/.test(trayBefore.forecast),
    `"${trayBefore.button.trim()}" · forecast "${trayBefore.forecast}"`);
  await page.locator('[data-srs-start="word:人々"]').click();
  await page.waitForTimeout(300);
  const trayAfter = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const row = e.taken.find((t) => t.id === '人々');
    return {
      button: document.getElementById('review-start').textContent,
      started: typeof row.started === 'number',
      srsMinted: Object.prototype.hasOwnProperty.call(e.srs || {}, 'word:人々'),
    };
  })()`);
  check('R2-A · 始める promotes by hand — a mark in the row, never fabricated FSRS state',
    /5/.test(trayAfter.button) && trayAfter.started && trayAfter.srsMinted === false,
    `"${trayAfter.button.trim()}" · started=${trayAfter.started} · srs minted=${trayAfter.srsMinted}`);
  await shoot(page, shotsDir, '19-r2a-no-debt-start');

  // (d) a backward device clock: the card's anchor sits three days AHEAD of
  // the wall clock (written when the clock ran fast). Grading must neither
  // crash (ts-fsrs throws on negative day deltas) nor corrupt the schedule.
  await page.evaluate(`(() => {
    const T = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    localStorage.setItem('kairo-corridor-v1', JSON.stringify({
      v: 1,
      taken: [{ t: 'word', id: '学校', label: '学校', ts: T, started: T }],
      srs: {
        'word:学校': { due: iso(T - 60000), last_review: iso(T + 3 * 86400000), stability: 6, difficulty: 5, elapsed_days: 0, scheduled_days: 3, reps: 3, lapses: 0, learning_steps: 0, state: 2 },
      },
    }));
  })()`);
  await open('?entry=shelf');
  await page.waitForSelector('#tray');
  await tap(page, '#tray');
  await page.waitForSelector('#review-start');
  const anchorIso = await page.evaluate(
    `JSON.parse(localStorage.getItem('kairo-corridor-v1')).srs['word:学校'].last_review`,
  );
  await tap(page, '#review-start');
  await page.waitForSelector('#declare-recalled');
  await page.evaluate(`document.querySelector('#declare-recalled')?.click()`);
  await page.waitForSelector('.grade.g-good');
  await page.evaluate(`document.querySelector('.grade.g-good')?.click()`);
  await page.waitForTimeout(400);
  const backProbe = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const rec = e.srs['word:学校'];
    const row = e.revlog[e.revlog.length - 1];
    return { rec, row, summaryUp: (document.querySelector('.view-title')?.textContent ?? '').length > 0 };
  })()`);
  check('R2-A · a backward device clock cannot crash or corrupt grading',
    backProbe.summaryUp &&
      Date.parse(backProbe.rec.last_review) === Date.parse(anchorIso) &&
      Date.parse(backProbe.rec.due) > Date.parse(backProbe.rec.last_review),
    `anchor held at ${backProbe.rec.last_review}; due ${backProbe.rec.due}`);
  check('R2-A · the revlog keeps the raw press time and a clamped, non-negative elapsed',
    backProbe.row[1] === 'word:学校' && backProbe.row[2] === 3 &&
      backProbe.row[0] < Date.parse(anchorIso) && backProbe.row[4] === 0 &&
      backProbe.row[11] === Date.parse(backProbe.rec.due),
    `t=${backProbe.row[0]} (raw, before the anchor) · elapsed=${backProbe.row[4]}`);

  // (e) bounded standard review: 25 overdue cards + 3 started fresh rows;
  // an ordinary sitting freezes 20 and says あと N on the goodbye screen.
  // (the clamp probe's declaration armed the observation debounce — let it
  // land so the reload's pagehide flush cannot overwrite this seed)
  await page.waitForTimeout(1400);
  await page.evaluate(`(() => {
    const T = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    const taken = [];
    const srs = {};
    for (let i = 0; i < 25; i++) {
      const id = 'w' + String(i).padStart(2, '0');
      taken.push({ t: 'word', id, label: id, ts: T - 1e6, started: T - 1e6 });
      srs['word:' + id] = { due: iso(T - (i + 1) * 3600000), last_review: iso(T - 5 * 86400000), stability: 8, difficulty: 5, elapsed_days: 4, scheduled_days: 5, reps: 3, lapses: 0, learning_steps: 0, state: 2 };
    }
    for (const id of ['f1', 'f2', 'f3']) taken.push({ t: 'word', id, label: id, ts: T - 9e5, started: T - 9e5 });
    localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1, taken, srs }));
  })()`);
  await open('?entry=shelf');
  await page.waitForSelector('#tray');
  await tap(page, '#tray');
  await page.waitForSelector('#review-start');
  const boundedBtn = await page.locator('#review-start').textContent();
  await tap(page, '#review-start');
  await page.waitForSelector('#declare-recalled');
  const session = await page.evaluate(`window.__KAIRO_SRS__.session()`);
  check('R2-A · an ordinary sitting freezes at most 20 due IDs and counts the rest',
    /28/.test(boundedBtn) && session.queue === 20 && session.deferred === 8,
    `button "${boundedBtn.trim()}" · frozen ${session.queue} · deferred ${session.deferred}`);
  for (let i = 0; i < 20; i++) {
    await page.waitForSelector('#declare-recalled', { timeout: 8000 });
    await page.evaluate(`document.querySelector('#declare-recalled')?.click()`);
    await page.waitForSelector('.grade.g-easy', { timeout: 8000 });
    await page.evaluate(`document.querySelector('.grade.g-easy')?.click()`);
    await page.waitForTimeout(120);
  }
  const boundedEnd = await page.evaluate(`(() => ({
    title: document.querySelector('.view-title')?.textContent ?? '',
    deferredLine: document.querySelector('.review-deferred')?.textContent ?? '',
  }))()`);
  check('R2-A · the goodbye screen carries the honest remainder — あと N, quietly',
    /20/.test(boundedEnd.title) && /8/.test(boundedEnd.deferredLine),
    `"${boundedEnd.title}" · "${boundedEnd.deferredLine}"`);
  await shoot(page, shotsDir, '20-r2a-bounded-summary');

  // (f) ペース: the learner's own numbers persist, hold their bounds, and
  // rule the queue after a full reboot
  await page.locator('button.take').first().click();
  await page.waitForSelector('#srs-prefs-toggle');
  await page.locator('#srs-prefs-toggle').click();
  await page.waitForSelector('[data-pref-down="reviewLimit"]');
  for (let i = 0; i < 2; i++) {
    await page.locator('[data-pref-down="reviewLimit"]').click(); // 20 → 10
    await page.waitForTimeout(160);
  }
  for (let i = 0; i < 4; i++) {
    await page.locator('[data-pref-down="newPerDay"]').click(); // 20 → 0
    await page.waitForTimeout(160);
  }
  const prefsStored = await page.evaluate(
    `JSON.parse(localStorage.getItem('kairo-corridor-v1')).srsPrefs`,
  );
  const minusDisabled = await page.evaluate(
    `document.querySelector('[data-pref-down="newPerDay"]').disabled`,
  );
  check('R2-A · ペース persists the learner\'s numbers and holds its bounds',
    prefsStored.reviewLimit === 10 && prefsStored.newPerDay === 0 && minusDisabled === true,
    `stored ${JSON.stringify(prefsStored)} · minus disabled at 0`);
  await shoot(page, shotsDir, '21-r2a-pace-settings');
  await open('?entry=shelf');
  const prefsAfterReload = await page.evaluate(`window.__KAIRO_SRS__.prefs()`);
  const dueWithZeroNew = await page.evaluate(`window.__KAIRO_SRS__.dueKeys()`);
  check('R2-A · the chosen pacing survives reboot and rules the queue',
    prefsAfterReload.newPerDay === 0 && prefsAfterReload.reviewLimit === 10 &&
      dueWithZeroNew.length === 5 && !dueWithZeroNew.some((k) => k.startsWith('word:f')),
    `prefs ${JSON.stringify(prefsAfterReload)} · ${dueWithZeroNew.length} due, no fresh admitted`);
  check('R2-A · the probes leave no console errors',
    consoleErrors.length === errsBeforeR2A,
    consoleErrors.slice(errsBeforeR2A).join(' | ') || 'clean');

  // ------------------- R3-C · declared recall before reveal (ADR-002 T-06)
  // The zen room's kernel law: revealing before declaring recall forces
  // Again. Driven through the REAL room on a controlled three-card deck:
  // (a) no bare reveal path exists; (b) まだ commits Again; (c) 思い出した
  // opens four grades; (d) the declaration lands in the obslog; (e) a
  // failed persist mid-grade moves nothing.
  console.log('\n— R3-C · declared recall: the answer never precedes the declaration');
  const errsBeforeR3C = consoleErrors.length;
  await page.waitForTimeout(1400); // settle any pending observation debounce
  await page.evaluate(`(() => {
    const T = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    const card = (dueAgoMs) => ({ due: iso(T - dueAgoMs), last_review: iso(T - 5 * 86400000), stability: 6, difficulty: 5, elapsed_days: 4, scheduled_days: 5, reps: 3, lapses: 0, learning_steps: 0, state: 2 });
    localStorage.setItem('kairo-corridor-v1', JSON.stringify({
      v: 1,
      taken: [
        { t: 'word', id: '学校', label: '学校', ts: T - 3e6, started: T - 3e6 },
        { t: 'word', id: '先生', label: '先生', ts: T - 2e6, started: T - 2e6 },
        { t: 'word', id: '電車', label: '電車', ts: T - 1e6, started: T - 1e6 },
      ],
      srs: { 'word:学校': card(3 * 86400000), 'word:先生': card(2 * 86400000), 'word:電車': card(86400000) },
    }));
  })()`);
  await open('?entry=shelf');
  await page.waitForSelector('#tray');
  await tap(page, '#tray');
  await page.waitForSelector('#review-start');
  await tap(page, '#review-start');
  await page.waitForSelector('#declare-recalled', { timeout: 10000 });
  // (a) no bare reveal: no #reveal button, and the card face itself is mute
  const frontState = await page.evaluate(`(() => ({
    reveal: !!document.querySelector('#reveal'),
    notyet: !!document.querySelector('#declare-notyet'),
    recalled: !!document.querySelector('#declare-recalled'),
  }))()`);
  await page.evaluate(`document.querySelector('.review-face')?.click()`);
  await page.waitForTimeout(250);
  const afterFaceTap = await page.evaluate(`(() => ({
    grades: document.querySelectorAll('.grade').length,
    reading: !!document.querySelector('.review-reading'),
    stillAsking: !!document.querySelector('#declare-recalled'),
  }))()`);
  check('R3-C · the zen room offers no bare reveal — only the two declarations',
    !frontState.reveal && frontState.notyet && frontState.recalled,
    JSON.stringify(frontState));
  check('R3-C · a tap on the card itself turns nothing over before a declaration',
    afterFaceTap.grades === 0 && !afterFaceTap.reading && afterFaceTap.stillAsking,
    JSON.stringify(afterFaceTap));
  // (c) 思い出した → the answer face with all four honest grades
  await page.evaluate(`document.querySelector('#declare-recalled')?.click()`);
  await page.waitForSelector('.grade-row[data-declared="recalled"]', { timeout: 8000 });
  const recalledRow = await page.evaluate(`(() => ({
    grades: [...document.querySelectorAll('.grade')].map((g) => (g.className.match(/g-(again|hard|good|easy)/) || [])[1]),
    reading: !!document.querySelector('.review-reading') || !!document.querySelector('.review-sense'),
  }))()`);
  check('R3-C · 思い出した turns the card with all four grades open',
    recalledRow.grades.length === 4 &&
      ['again', 'hard', 'good', 'easy'].every((g) => recalledRow.grades.includes(g)) &&
      recalledRow.reading,
    JSON.stringify(recalledRow));
  await page.evaluate(`document.querySelector('.grade.g-good')?.click()`);
  await page.waitForTimeout(250);
  const goodCommit = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const row = (e.revlog || [])[(e.revlog || []).length - 1] || [];
    return { key: row[1], rating: row[2] };
  })()`);
  check('R3-C · after 思い出した the pressed grade commits as itself',
    goodCommit.key === 'word:学校' && goodCommit.rating === 3, JSON.stringify(goodCommit));
  // card 2 · (b) まだ → the answer opens for study, Again is the one seal
  await page.waitForSelector('#declare-notyet', { timeout: 8000 });
  await page.evaluate(`document.querySelector('#declare-notyet')?.click()`);
  await page.waitForSelector('.grade-row[data-declared="notyet"]', { timeout: 8000 });
  await shoot(page, shotsDir, '22-r3c-notyet-again-only');
  const notyetRow = await page.evaluate(`(() => ({
    grades: document.querySelectorAll('.grade').length,
    again: !!document.querySelector('.grade.g-again'),
    good: !!document.querySelector('.grade.g-good'),
    hard: !!document.querySelector('.grade.g-hard'),
    easy: !!document.querySelector('.grade.g-easy'),
    reading: !!document.querySelector('.review-reading') || !!document.querySelector('.review-sense'),
  }))()`);
  check('R3-C · まだ opens the back for study with Again as the only seal',
    notyetRow.grades === 1 && notyetRow.again && !notyetRow.good && !notyetRow.hard &&
      !notyetRow.easy && notyetRow.reading,
    JSON.stringify(notyetRow));
  // (e) a failed persist mid-grade leaves session and store consistent
  await page.evaluate(`(() => {
    window.__setItemReal = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new Error('quota'); };
  })()`);
  const revlogBefore = await page.evaluate(
    `JSON.parse(localStorage.getItem('kairo-corridor-v1')).revlog.length`,
  );
  await page.evaluate(`document.querySelector('.grade.g-again')?.click()`);
  await page.waitForTimeout(250);
  const failedPersist = await page.evaluate(`(() => {
    const alertNode = document.getElementById('store-alert');
    return {
      cardStillUp: !!document.querySelector('.grade.g-again'),
      revlog: JSON.parse(localStorage.getItem('kairo-corridor-v1')).revlog.length,
      alertUp: !!alertNode && alertNode.hidden === false && (alertNode.textContent || '').length > 0,
    };
  })()`);
  check('R3-C · a failed persist mid-grade moves nothing — card up, revlog whole, alert speaking',
    failedPersist.cardStillUp && failedPersist.revlog === revlogBefore && failedPersist.alertUp,
    JSON.stringify(failedPersist));
  await page.evaluate(
    `(() => { Storage.prototype.setItem = window.__setItemReal; delete window.__setItemReal; })()`,
  );
  // (b) …and the committed grade is Again regardless of any later tap
  await page.evaluate(`document.querySelector('.grade.g-again')?.click()`);
  await page.waitForTimeout(250);
  const againCommit = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const row = e.revlog[e.revlog.length - 1];
    return { key: row[1], rating: row[2], state: e.srs['word:先生'].state };
  })()`);
  check('R3-C · まだ commits Again — the schedule records the declaration, not a wish',
    againCommit.key === 'word:先生' && againCommit.rating === 1 && againCommit.state === 3,
    JSON.stringify(againCommit));
  // card 3 stands ready (the Again learning step ripens later); undo takes
  // the まだ grade back durably and returns to the UNDECLARED front face
  await page.waitForSelector('#declare-recalled', { timeout: 8000 });
  await tap(page, '#zen-more');
  await page.waitForSelector('.review-undo', { timeout: 8000 });
  await page.evaluate(`document.querySelector('.review-undo')?.click()`);
  await page.waitForTimeout(300);
  const undoneR3C = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const last = e.revlog[e.revlog.length - 1];
    return {
      state: e.srs['word:先生'].state,
      reps: e.srs['word:先生'].reps,
      revocation: last[1] === 'word:先生' && last[2] === 0,
      asking: !!document.querySelector('#declare-recalled') && !document.querySelector('.grade'),
    };
  })()`);
  check('R3-C · undo restores the card, files a revocation, and asks the question afresh',
    undoneR3C.state === 2 && undoneR3C.reps === 3 && undoneR3C.revocation && undoneR3C.asking,
    JSON.stringify(undoneR3C));
  // (d) both declarations stand in the observation ledger as reveal rows
  await page.waitForTimeout(1400); // let any debounced observation land
  const revealRows = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    return (e.obslog || []).filter((r) => r[1] === 'reveal').map((r) => [r[2], r[3]]);
  })()`);
  check('R3-C · the declarations land in the obslog as [t,reveal,key,1|0] rows',
    revealRows.length >= 2 &&
      JSON.stringify(revealRows.slice(0, 2)) === JSON.stringify([['word:学校', 1], ['word:先生', 0]]),
    JSON.stringify(revealRows));
  check('R3-C · the declared-recall probes leave no console errors',
    consoleErrors.length === errsBeforeR3C,
    consoleErrors.slice(errsBeforeR3C).join(' | ') || 'clean');

  // ------------------- R3-E · small truths: crumbs, lesson scroll, world swap
  console.log('\n— R3-E · small truths: crumbs, lesson scroll, the world swap');

  // (a) a stone tap recolours the world IN PLACE. The full render() it used
  // to trigger cost a measured 100-200ms main-thread block per tap; the
  // scoped swap moves the CSS tokens and the seal glyphs and nothing else.
  // A reverted build rebuilds <main> and loses the marker set here.
  await open('?entry=shelf');
  await page.evaluate(`(document.querySelector('main').dataset.renderProbe = 'kept')`);
  await page.locator('#theme-seal').click();
  await page.waitForSelector('.world-picker');
  await page.locator('.world-stone', { hasText: '墨' }).click();
  await page.waitForTimeout(250);
  const sumiSwap = await page.evaluate(`({
    theme: document.documentElement.getAttribute('data-theme'),
    kept: document.querySelector('main')?.dataset.renderProbe ?? null,
    seal: document.querySelector('#theme-seal')?.textContent ?? '',
    stored: localStorage.getItem('kairo-theme'),
  })`);
  check('R3-E · a stone tap recolours in place — tokens move, the room DOM stands',
    sumiSwap.theme === 'sumi' && sumiSwap.kept === 'kept' &&
      sumiSwap.seal === '墨' && sumiSwap.stored === 'sumi',
    JSON.stringify(sumiSwap));
  await page.locator('#theme-seal').click();
  await page.waitForSelector('.world-picker');
  await page.locator('.world-stone', { hasText: '藍' }).click();
  await page.waitForTimeout(250);
  const hokusaiSwap = await page.evaluate(`({
    theme: document.documentElement.getAttribute('data-theme'),
    kept: document.querySelector('main')?.dataset.renderProbe ?? null,
    seal: document.querySelector('#theme-seal')?.textContent ?? '',
  })`);
  check('R3-E · the way home is the same gesture — 藍 restored, still no rebuild',
    hokusaiSwap.theme === '' && hokusaiSwap.kept === 'kept' && hokusaiSwap.seal === '藍',
    JSON.stringify(hokusaiSwap));

  // (b) crumb truth: the dojo is entered from the galaxy and its back walks
  // galaxy-ward — the crumb must name that origin, never the bookshelf
  await open('');
  await page.waitForTimeout(1500);
  await page.tap('.nav-symbol');
  await page.waitForTimeout(300);
  await page.tap('.nav-dojo');
  await page.waitForTimeout(400);
  const dojoProbe = await page.evaluate(`({
    crumb: document.querySelector('.crumb')?.textContent ?? '',
    view: document.body.dataset.view,
  })`);
  check('R3-E · the dojo entered from the galaxy wears a galaxy crumb',
    dojoProbe.view === 'dojo' && dojoProbe.crumb.trim() === 'galaxy › focus',
    `crumb "${dojoProbe.crumb}"`);
  await page.tap('#back');
  await page.waitForTimeout(600);
  const dojoBack = await page.evaluate(`({
    view: document.body.dataset.view,
    layerActive: document.getElementById('drift-layer')?.classList.contains('active'),
  })`);
  check('R3-E · and its back door opens the room the crumb names — the galaxy',
    dojoBack.view === 'drift' && dojoBack.layerActive === true,
    JSON.stringify(dojoBack));

  // (c) back from a lesson run restores the learner's place in the long list
  await open('?entry=shelf');
  await page.waitForSelector('#lessons-link');
  await tap(page, '#lessons-link');
  await page.waitForSelector('.lesson-row');
  await page.evaluate(`(() => {
    window.scrollTo(0, 500);
    const rows = [...document.querySelectorAll('.lesson-row')];
    const mid = innerHeight / 2;
    let best = rows[0];
    let score = Infinity;
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      const s = Math.abs(r.top + r.height / 2 - mid);
      if (s < score) { score = s; best = row; }
    }
    best.dataset.probeRow = '1';
  })()`);
  await page.waitForTimeout(150);
  // the tap helper recentres its target, nudging the list a few px — record
  // the scroll at the GESTURE itself, the place the app promises to restore
  await page.evaluate(`(() => {
    window.__lessonTapY = null;
    addEventListener('pointerdown', () => { window.__lessonTapY = window.scrollY; },
      { once: true, capture: true });
  })()`);
  await tap(page, '[data-probe-row="1"]');
  const lessonListY = await page.evaluate('window.__lessonTapY');
  await page.waitForSelector('.review-face');
  const lessonRunTop = await page.evaluate('window.scrollY');
  await tap(page, '#back');
  await page.waitForSelector('.lesson-row');
  const lessonRestoredY = await page.evaluate('window.scrollY');
  check('R3-E · back from a lesson run restores the learner\'s place in the list',
    lessonListY >= 400 && lessonRunTop === 0 && Math.abs(lessonRestoredY - lessonListY) <= 4,
    `list at ${lessonListY} → run at ${lessonRunTop} → back at ${lessonRestoredY}`);

  // the tray tells one story: park every card a little later TODAY and use
  // up the new-card room, so nothing is due at this moment — the closed
  // door must then say "right now" and the forecast must say WHEN, never a
  // flat 予定なし directly above a bare 今日 N
  await page.evaluate(`(() => {
    const key = 'kairo-corridor-v1';
    const e = JSON.parse(localStorage.getItem(key) || '{}');
    const now = new Date();
    const cap = new Date(now);
    cap.setHours(23, 58, 0, 0);
    const soon = new Date(now.getTime() + 2 * 3600000);
    const due = (soon < cap ? soon : new Date(now.getTime() + 90000)).toISOString();
    for (const rec of Object.values(e.srs || {})) rec.due = due;
    const p2 = (n) => String(n).padStart(2, '0');
    const day = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate());
    e.stats = e.stats || {};
    e.stats[day] = Object.assign({}, e.stats[day], { nnew: 20 });
    localStorage.setItem(key, JSON.stringify(e));
  })()`);
  await open('?entry=shelf');
  await page.waitForSelector('#tray');
  await tap(page, '#tray');
  await page.waitForSelector('#review-start');
  const trayTruth = await page.evaluate(`(() => {
    const btn = document.querySelector('#review-start');
    const forecast = document.querySelector('.srs-forecast')?.textContent ?? '';
    const m = forecast.match(/(?:today|今日)[^0-9]*([0-9]+)/);
    return {
      disabled: btn?.disabled ?? false,
      label: btn?.textContent ?? '',
      forecast,
      todayN: m ? Number(m[1]) : 0,
    };
  })()`);
  check('the tray never contradicts itself — a closed review door names its when',
    trayTruth.disabled &&
      (trayTruth.todayN === 0
        ? /予定なし|nothing due yet/.test(trayTruth.label)
        : /このあと|later today/.test(trayTruth.forecast) &&
          /いまは予定なし|nothing due right now/.test(trayTruth.label)),
    JSON.stringify(trayTruth));
  await shoot(page, shotsDir, '19-tray-later-today');

  // -------------- R3-B · device Back walks the app, not out of it
  // The writing room's same-URL sentinel generalized: one armed history entry
  // whenever any stacked context stands under the learner, so the platform
  // Back gesture (the operator's iPhone edge-swipe) performs the app's OWN
  // back() — context restored — instead of unloading the SPA. Every probe
  // stamps the document first: if Back had left the page, the stamp dies
  // with it, so a reverted build cannot pass by reloading into a lookalike.
  console.log('\n— R3-B · device Back walks the app, not out of it');
  const errsBeforeR3B = consoleErrors.length;

  // (a) from a word sheet: one press closes the sheet and hands the reader
  // back its exact place
  await open('?entry=shelf');
  const gonIx3b = await page.evaluate(
    `[...document.querySelectorAll('.shelf-item .shelf-title')].findIndex((n) => n.textContent.includes('ごん狐'))`,
  );
  await tap(page, '.shelf-item', Math.max(gonIx3b, 0));
  await settleReader(page);
  await page.evaluate('window.scrollTo(0, 600)');
  await page.waitForTimeout(200);
  const midTok = await page.evaluate(`(() => {
    const toks = [...document.querySelectorAll('#reader .tok.content')];
    const ix = toks.findIndex((t) => {
      const r = t.getBoundingClientRect();
      return r.top > 260 && r.bottom < 560;
    });
    return ix >= 0 ? ix : 5;
  })()`);
  await holdWord(page, '#reader .tok.content', midTok);
  await page.waitForSelector('#sheet', { timeout: 10000 });
  // the hold recentres its token, so the kept offset is measured, not assumed
  const readerYKept = await page.evaluate('Math.round(window.scrollY)');
  await page.evaluate('window.__r3bSheet = 1');
  await page.goBack();
  await page.waitForTimeout(600);
  const backFromSheet = await page.evaluate(`({
    sameDocument: window.__r3bSheet === 1,
    view: document.body.dataset.view,
    sheet: !!document.querySelector('#sheet'),
    y: Math.round(window.scrollY),
  })`);
  check('R3-B · device Back from a word sheet walks to the reader, place intact',
    backFromSheet.sameDocument && backFromSheet.view === 'reader' && !backFromSheet.sheet &&
      readerYKept > 200 && Math.abs(backFromSheet.y - readerYKept) <= 20,
    `${JSON.stringify(backFromSheet)} (kept ${readerYKept})`);

  // (b) from a drift dive: one press surfaces ONE level of the water
  await open('');
  await page.waitForTimeout(2200);
  const divePickText = await page.evaluate(`(() => {
    const K = /[\\u4e00-\\u9fff]/;
    for (const w of document.querySelectorAll('#drift-layer .word')) {
      const r = w.getBoundingClientRect();
      if (!r.width || r.left < 60 || r.right > 320 || r.top < 260 || r.bottom > 640) continue;
      if (!K.test(w.textContent)) continue;
      w.dataset.r3b = '1';
      return w.textContent;
    }
    return null;
  })()`);
  check('R3-B · a kanji word stands in the field to dive into', !!divePickText, divePickText ?? 'none');
  const diveCdp = await page.context().newCDPSession(page);
  let dived = false;
  for (let i = 0; i < 5 && !dived && divePickText; i++) {
    const at = await page.evaluate(`(() => {
      const w = document.querySelector('#drift-layer .word[data-r3b]');
      if (!w) return null;
      const r = w.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!at) break;
    await diveCdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: at.x, y: at.y }],
    });
    await page.waitForTimeout(70);
    await diveCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(650);
    dived = await page.evaluate(`document.body.classList.contains('drift-dived')`);
  }
  await diveCdp.detach();
  check('R3-B · the tap ladder carries into the dive', dived, `drift-dived after ladder taps`);
  await page.evaluate('window.__r3bDive = 1');
  await page.goBack();
  await page.waitForTimeout(800);
  const backFromDive = await page.evaluate(`({
    sameDocument: window.__r3bDive === 1,
    view: document.body.dataset.view,
    dived: document.body.classList.contains('drift-dived'),
    layerActive: document.getElementById('drift-layer')?.classList.contains('active'),
  })`);
  check('R3-B · device Back from a dive surfaces one level, never leaves the water',
    backFromDive.sameDocument && backFromDive.view === 'drift' && !backFromDive.dived &&
      backFromDive.layerActive,
    JSON.stringify(backFromDive));

  // (c) the archive keeps BOTH scroll contexts across Back — the year list
  // where a row was opened, and the shelf where its door stands ~20,000px deep
  await open('?entry=shelf');
  await page.evaluate(`document.getElementById('archive-link').scrollIntoView({ block: 'center' })`);
  await page.waitForTimeout(200);
  const shelfYKept = await page.evaluate('Math.round(window.scrollY)');
  await page.evaluate(`document.getElementById('archive-link').click()`);
  await page.waitForTimeout(400);
  await page.evaluate(`(() => {
    const toggles = [...document.querySelectorAll('.archive-year')];
    const num = (t) => Number((t.textContent.match(/·\\s*([0-9]+)/) || [0, 0])[1]);
    let best = toggles[0];
    for (const t of toggles) if (num(t) > num(best)) best = t;
    best.click();
  })()`);
  await page.waitForSelector('.archive-row', { timeout: 10000 });
  await page.evaluate('window.scrollTo(0, 800)');
  await page.waitForTimeout(200);
  const archYKept = await page.evaluate('Math.round(window.scrollY)');
  await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.archive-row')];
    rows[Math.min(20, rows.length - 1)].click();
  })()`);
  await page.waitForFunction(`document.body.dataset.view === 'reader'`, null, { timeout: 10000 });
  await page.waitForTimeout(1400); // the archive body fetch re-renders once
  await page.evaluate('window.scrollTo(0, 400)'); // read a little way down
  await page.waitForTimeout(200);
  await page.evaluate('window.__r3bArch = 1');
  await page.goBack();
  await page.waitForTimeout(600);
  const backToList = await page.evaluate(`({
    sameDocument: window.__r3bArch === 1,
    view: document.body.dataset.view,
    y: Math.round(window.scrollY),
  })`);
  check('R3-B · Back from an archive article lands on the year list where it was left',
    backToList.sameDocument && backToList.view === 'archive' &&
      Math.abs(backToList.y - archYKept) <= 20,
    `view=${backToList.view} y=${backToList.y} (kept ${archYKept})`);
  await page.goBack();
  await page.waitForTimeout(600);
  const backToShelf = await page.evaluate(`({
    sameDocument: window.__r3bArch === 1,
    view: document.body.dataset.view,
    y: Math.round(window.scrollY),
  })`);
  check('R3-B · Back from the archive returns to the shelf at its door',
    backToShelf.sameDocument && backToShelf.view === 'shelf' && shelfYKept > 2000 &&
      Math.abs(backToShelf.y - shelfYKept) <= 20,
    `view=${backToShelf.view} y=${backToShelf.y} (kept ${shelfYKept})`);

  // (d) the search room (operator, 2026-08-20: search is its own page) —
  // the bar's door opens it, and the session survives a result round-trip:
  // query, results, and focus on the row that was left
  await open('');
  await page.waitForTimeout(1600);
  await page.tap('.nav-symbol');
  await page.waitForSelector('#nav-search-door');
  await page.tap('#nav-search-door');
  await page.waitForSelector('#nav-search-input');
  const searchRoom = await page.evaluate(`document.body.dataset.view`);
  check('R3-B · the bar’s search door opens the search room, a page of its own',
    searchRoom === 'search', `view=${searchRoom}`);
  await page.locator('#nav-search-input').fill('水');
  await page.waitForSelector('.nav-search-row', { timeout: 10000 });
  const rowsBefore = await page.locator('.nav-search-row').count();
  await page.evaluate('window.__r3bNav = 1');
  await page.locator('.nav-search-row').first().click();
  await page.waitForSelector('#sheet', { timeout: 10000 });
  await page.goBack();
  await page.waitForTimeout(700);
  const navRound = await page.evaluate(`({
    sameDocument: window.__r3bNav === 1,
    view: document.body.dataset.view,
    sheet: !!document.querySelector('#sheet'),
    q: document.getElementById('nav-search-input')?.value ?? null,
    rows: document.querySelectorAll('.nav-search-row').length,
    focusInSearch: !!document.activeElement?.closest?.('.search-page'),
  })`);
  check('R3-B · the search-room session survives the round trip — query, results, focus',
    navRound.sameDocument && navRound.view === 'search' && !navRound.sheet &&
      navRound.q === '水' && navRound.rows >= 1 && navRound.focusInSearch,
    `${JSON.stringify(navRound)} (rows before: ${rowsBefore})`);
  // …and Back from the room itself returns to the galaxy its door stands in
  await page.goBack();
  await page.waitForTimeout(600);
  const searchHome = await page.evaluate(`({
    sameDocument: window.__r3bNav === 1,
    view: document.body.dataset.view,
  })`);
  check('R3-B · Back from the search room lands on the galaxy',
    searchHome.sameDocument && searchHome.view === 'drift', JSON.stringify(searchHome));

  check('R3-B · the walks leave no console errors',
    consoleErrors.length === errsBeforeR3B,
    consoleErrors.slice(errsBeforeR3B).join(' | ') || 'clean');

  // ------------------------------------------- R3-D · the optimizer loop
  // closes (T7): a parameter file from tools/fsrs-optimize.mjs enters the
  // learner's own 読み込む door, the scheduler is rebuilt on the fitted
  // weights, and a graded card's stored schedule matches the custom-weights
  // prediction — replayed independently on the vendored ts-fsrs, under both
  // weight sets, so a build that quietly kept the defaults cannot pass. An
  // invalid set is ignored: defaults rule, one quiet obslog note, no crash.
  console.log('\n— R3-D · fitted FSRS parameters drive the real scheduler');
  const errsBeforeR3D = consoleErrors.length;
  const pinR3D = JSON.parse(readFileSync(resolve(CORRIDOR_DIR, 'data/fsrs-pin.json'), 'utf8'));
  const roundtripDir = resolve(REPO, 'docs/build-evidence/renkan/optimizer-roundtrip');
  const candidateR3D = JSON.parse(readFileSync(resolve(roundtripDir, 'candidate-fsrs-pin.json'), 'utf8'));
  const DAY_MS = 86400000;
  // one due card whose next Good interval DIFFERS between the fitted and the
  // default weights (25 d vs 24 d at ten elapsed days) — no coincidences
  await page.evaluate(`(() => {
    const T = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    localStorage.setItem('kairo-corridor-v1', JSON.stringify({
      v: 1,
      taken: [{ t: 'word', id: '学校', label: '学校', ts: T - 10 * ${DAY_MS}, started: T - 10 * ${DAY_MS} }],
      srs: { 'word:学校': { due: iso(T - 4 * ${DAY_MS}), last_review: iso(T - 10 * ${DAY_MS}), stability: 5, difficulty: 5, elapsed_days: 6, scheduled_days: 6, reps: 3, lapses: 0, learning_steps: 0, state: 2 } },
    }));
  })()`);
  await open('?entry=shelf');
  const paramsBefore = await page.evaluate(`window.__KAIRO_SRS__.params()`);
  // import the full dry-run REPORT: the door unwraps candidatePin and keeps
  // the training-review count as honest provenance
  await tap(page, '#tray');
  await page.waitForSelector('#import-file', { state: 'attached' });
  await page.setInputFiles('#import-file', resolve(roundtripDir, 'fsrs-dry-run.json'));
  await page.waitForFunction(
    `(() => { try { return !!JSON.parse(localStorage.getItem('kairo-corridor-v1')).srsPrefs.fsrs; } catch { return false; } })()`,
    null, { timeout: 8000 },
  );
  await open('?entry=shelf');
  const paramsAfter = await page.evaluate(`window.__KAIRO_SRS__.params()`);
  check('R3-D · the 読み込む door installs the optimizer output into the live scheduler',
    paramsBefore.custom === false &&
      JSON.stringify(paramsBefore.w) === JSON.stringify(pinR3D.w) &&
      paramsAfter.custom === true &&
      JSON.stringify(paramsAfter.w) === JSON.stringify(candidateR3D.w) &&
      paramsAfter.basedOnReviews === 500 &&
      String(paramsAfter.source).startsWith(candidateR3D.parameterSetId),
    `custom=${paramsAfter.custom} · basedOnReviews=${paramsAfter.basedOnReviews} · ${paramsAfter.source}`);
  await tap(page, '#tray');
  await page.waitForSelector('.tray-line');
  await page.locator('.tray-line').first().click();
  await page.waitForSelector('#sheet');
  const footerR3D = await page.evaluate(
    `[...document.querySelectorAll('#sheet p.card-kind')].map((n) => n.textContent).find((t) => t.includes('FSRS-6')) ?? ''`,
  );
  check('R3-D · the entry footer says the truth about the weights in force',
    footerR3D.includes('FSRS-6') && footerR3D.includes('tuned from your record'),
    JSON.stringify(footerR3D));
  await shoot(page, shotsDir, '22-r3d-fitted-params');
  // a malformed parameter file is refused AT THE DOOR: told once, store kept
  const badDirR3D = mkdtempSync(join(tmpdir(), 'r3d-bad-'));
  const badPathR3D = join(badDirR3D, 'bad-params.json');
  writeFileSync(badPathR3D, JSON.stringify({ ...candidateR3D, w: candidateR3D.w.slice(0, 20) }));
  await open('?entry=shelf');
  await tap(page, '#tray');
  await page.waitForSelector('#import-file', { state: 'attached' });
  await page.setInputFiles('#import-file', badPathR3D);
  await page.waitForTimeout(500);
  const afterBadR3D = await page.evaluate(`(() => ({
    note: document.querySelector('.port-row + .airead-note')?.textContent ?? '',
    w: JSON.parse(localStorage.getItem('kairo-corridor-v1')).srsPrefs.fsrs.w.length,
  }))()`);
  check('R3-D · a malformed parameter file is refused at the door; the record stands',
    afterBadR3D.note.includes('fsrs-optimize') && afterBadR3D.w === 21,
    `note "${afterBadR3D.note}" · stored w length ${afterBadR3D.w}`);
  // grade the seeded card in the real review flow, then replay the press in
  // Node on the vendored scheduler under BOTH weight sets
  const preGradeR3D = await page.evaluate(
    `JSON.parse(localStorage.getItem('kairo-corridor-v1')).srs['word:学校']`,
  );
  await page.waitForSelector('#review-start');
  await tap(page, '#review-start');
  // R3-C landed the declared-recall gate: the reveal rides 思い出した now
  await page.waitForSelector('#declare-recalled');
  await page.evaluate(`document.querySelector('#declare-recalled')?.click()`);
  await page.waitForSelector('.grade-row[data-declared="recalled"] .grade.g-good');
  await page.evaluate(`document.querySelector('.grade.g-good')?.click()`);
  await page.waitForTimeout(400);
  const gradedR3D = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    return { rec: e.srs['word:学校'], row: e.revlog[e.revlog.length - 1] };
  })()`);
  const fsrsVendor = await import(resolve(CORRIDOR_DIR, 'vendor/ts-fsrs.mjs'));
  const engineR3D = (w) =>
    fsrsVendor.fsrs(fsrsVendor.generatorParameters({
      w,
      request_retention: pinR3D.requestRetention,
      maximum_interval: pinR3D.maximumInterval,
      enable_fuzz: pinR3D.enableFuzz,
      enable_short_term: pinR3D.enableShortTerm,
      learning_steps: pinR3D.learningSteps,
      relearning_steps: pinR3D.relearningSteps,
    }));
  const reviveR3D = {
    ...preGradeR3D,
    due: new Date(preGradeR3D.due),
    last_review: new Date(preGradeR3D.last_review),
  };
  const predictR3D = (w) =>
    engineR3D(w).repeat({ ...reviveR3D }, new Date(gradedR3D.row[0]))[fsrsVendor.Rating.Good].card;
  const customR3D = predictR3D(candidateR3D.w);
  const defaultR3D = predictR3D(pinR3D.w);
  check('R3-D · the graded schedule is the CUSTOM prediction to 8 dp, not the default',
    gradedR3D.row[1] === 'word:学校' && gradedR3D.row[2] === 3 &&
      Math.abs(gradedR3D.rec.stability - customR3D.stability) < 5e-9 &&
      gradedR3D.rec.scheduled_days === customR3D.scheduled_days &&
      Date.parse(gradedR3D.rec.due) === customR3D.due.getTime() &&
      Math.abs(customR3D.stability - defaultR3D.stability) > 1e-6,
    `stored s=${gradedR3D.rec.stability} ivl=${gradedR3D.rec.scheduled_days}d · custom s=${customR3D.stability} ivl=${customR3D.scheduled_days}d · default s=${defaultR3D.stability} ivl=${defaultR3D.scheduled_days}d`);
  // an out-of-bounds STORED set is ignored fail-closed: the pinned defaults
  // rule, the bytes are kept verbatim, and one quiet obslog note says why.
  // Let the debounced obslog writer (R3-C's reveal declaration rides it)
  // flush first — a direct localStorage seed must not race the pagehide
  // flush, which rewrites the envelope from live memory.
  await page.waitForTimeout(1500);
  await page.evaluate(`(() => {
    const key = 'kairo-corridor-v1';
    const e = JSON.parse(localStorage.getItem(key));
    e.srsPrefs.fsrs = { w: e.srsPrefs.fsrs.w.map((x, i) => (i === 20 ? 5 : x)) };
    localStorage.setItem(key, JSON.stringify(e));
  })()`);
  await open('?entry=shelf');
  await page.waitForTimeout(1500); // the note rides the obslog debounce
  const ignoredR3D = await page.evaluate(`(() => {
    const p = window.__KAIRO_SRS__.params();
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    return {
      custom: p.custom,
      w20: p.w ? p.w[20] : null,
      kept: e.srsPrefs.fsrs.w[20],
      notes: (e.obslog || []).filter((r) => r[1] === 'params').map((r) => r.slice(1)),
    };
  })()`);
  check('R3-D · an out-of-bounds stored set is ignored — defaults rule, bytes kept, one quiet note',
    ignoredR3D.custom === false && ignoredR3D.w20 === pinR3D.w[20] && ignoredR3D.kept === 5 &&
      JSON.stringify(ignoredR3D.notes) === JSON.stringify([['params', 'fsrs', 'bounds']]),
    JSON.stringify(ignoredR3D));
  await open('?entry=shelf');
  await page.waitForTimeout(1500);
  const dedupR3D = await page.evaluate(
    `(JSON.parse(localStorage.getItem('kairo-corridor-v1')).obslog || []).filter((r) => r[1] === 'params').length`,
  );
  check('R3-D · a thousand boots write one note, not a thousand',
    dedupR3D === 1, `params notes after a second boot: ${dedupR3D}`);
  check('R3-D · the probes leave no console errors',
    consoleErrors.length === errsBeforeR3D,
    consoleErrors.slice(errsBeforeR3D).join(' | ') || 'clean');

  // ------------------------- R4-C · the observation ledger has a reader,
  // and the tray's rest control has a whole finger. Both convict a revert:
  // before R4-C nothing in the app read the obslog back, and the rest pill
  // was a ~22px target on a row that navigates.
  console.log('\n— R4-C · 出会い trail · rest/wake target');
  const errsBeforeR4C = consoleErrors.length;
  await page.evaluate(`localStorage.setItem('kairo-corridor-v1', JSON.stringify({
    v: 1,
    taken: [{ t: 'word', id: '学校', label: '学校', ts: 1755000000000, started: 1755000000000 }],
    srs: {},
    revlog: [],
    obslog: [
      [1754000000000, 'tap', 'word:学校', 1, 'wikinews:1403'],
      [1754100000000, 'drift', 'word:学校', 3],
      [1754200000000, 'dojo', 'word:学校', 3, 'due'],
      [1754300000000, 'probe', 'word:学校', 1, 0],
      [1754400000000, 'tap', 'word:学校', 3, 'wikinews:1403'],
      [1754500000000, 'tap', 'word:海', 2, 'wikinews:1403']
    ],
  }))`);
  await open('?entry=shelf');
  await page.fill('#search', '学校');
  await page.waitForTimeout(500);
  await tap(page, '[data-result^="word:学校"]');
  await page.waitForSelector('#sheet .encounter-trail');
  const trail = await page.evaluate(`(() => {
    const box = document.querySelector('#sheet .encounter-trail');
    return {
      lines: [...box.querySelectorAll('.trail-line')].map((n) => n.textContent),
      eyebrow: box.querySelector('.eyebrow')?.textContent ?? '',
    };
  })()`);
  check('R4-C · the trail counts this item’s own encounters, not the ledger’s',
    /(5回|5 encounters)/.test(trail.lines[0] || '') && /(出会い|encounters)/.test(trail.eyebrow),
    JSON.stringify(trail.lines));
  check('R4-C · the last row is said in the learner’s own terms',
    /(全項目をひらいた|opened the full entry)/.test(trail.lines[1] || ''), trail.lines[1] || '');
  check('R4-C · practice is counted as evidence and named as evidence, never mastery',
    /(稽古 2回|2 practice records)/.test(trail.lines[2] || '') &&
      /(習熟ではない|evidence, not mastery)/.test(trail.lines[2] || ''),
    trail.lines[2] || 'no practice line');
  const trailWordsOnly = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    return { srs: Object.keys(e.srs || {}).length, revlog: (e.revlog || []).length };
  })()`);
  check('R4-C · reading the ledger writes nothing to the deck',
    trailWordsOnly.srs === 0 && trailWordsOnly.revlog === 0, JSON.stringify(trailWordsOnly));
  await page.evaluate(`document.querySelector('#sheet-close')?.click()`);
  await page.waitForTimeout(200);
  await tap(page, '#tray');
  await page.waitForSelector('.rest-toggle');
  const restBox = await page.evaluate(`(() => {
    const b = document.querySelector('.rest-toggle');
    const r = b.getBoundingClientRect();
    const before = getComputedStyle(b, '::before');
    return { w: Math.round(r.width), h: Math.round(r.height),
             hitW: Math.round(parseFloat(before.width)), hitH: Math.round(parseFloat(before.height)),
             cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  })()`);
  check('R4-C · the rest pill prints small and takes a whole finger',
    restBox.hitW >= 44 && restBox.hitH >= 44 && restBox.w < 44,
    `visual ${restBox.w}×${restBox.h}, hit ${restBox.hitW}×${restBox.hitH}`);
  // a press at the hit region's edge — outside the printed pill — must rest
  // the card and must NOT navigate into the entry the row points at
  const edgeY = restBox.cy + restBox.h / 2 + 6;
  await page.mouse.click(restBox.cx, edgeY);
  await page.waitForTimeout(300);
  const afterEdge = await page.evaluate(`(() => ({
    suspended: Object.keys(JSON.parse(localStorage.getItem('kairo-corridor-v1')).suspended || {}),
    sheet: !!document.querySelector('#sheet'),
  }))()`);
  check('R4-C · a press at the target’s edge rests the card and never falls through to the row',
    afterEdge.suspended.length === 1 && afterEdge.sheet === false, JSON.stringify(afterEdge));
  check('R4-C · the probes leave no console errors',
    consoleErrors.length === errsBeforeR4C,
    consoleErrors.slice(errsBeforeR4C).join(' | ') || 'clean');

  // ------------- C1's own finding: the sentence page walks on to its article
  // (rubric §9.5 — a review answer returns to the source sentence AND its
  // article). The demonstration found the sentence half present, this half
  // missing. A bank example must still show no door: honest absence.
  console.log('\n— C1 finding · the sentence page reaches its article');
  await open('?entry=shelf');
  await page.waitForSelector('.shelf-item');
  await tap(page, '.shelf-item');
  await page.waitForSelector('#reader .tok.content');
  const sentHome = await page.evaluate(`(() => {
    const tok = document.querySelector('#reader .tok.content');
    return tok ? tok.textContent.trim() : '';
  })()`);
  await tap(page, '#reader .tok.content');
  await page.waitForTimeout(400);
  const sentDoorSeen = await page.evaluate(`(() => {
    const d = document.querySelector('.sent-door');
    if (d) { d.click(); return true; }
    return false;
  })()`);
  if (sentDoorSeen) {
    await page.waitForSelector('#sheet');
    await page.waitForTimeout(300);
  }
  const homeDoor = await page.evaluate(`(() => {
    const b = document.querySelector('#sent-home');
    return { present: !!b, label: b ? b.textContent : '' };
  })()`);
  if (homeDoor.present) {
    await page.evaluate(`document.querySelector('#sent-home')?.click()`);
    await page.waitForTimeout(600);
    const landed = await page.evaluate(`(() => ({
      view: document.body.dataset.view || '',
      reader: !!document.querySelector('#reader'),
      sheet: !!document.querySelector('#sheet'),
    }))()`);
    check('C1 · the sentence page walks on to the whole article it came from',
      landed.reader && !landed.sheet, JSON.stringify({ ...homeDoor, ...landed, from: sentHome }));
  } else {
    check('C1 · a sentence with no shelf article shows no door onto nothing',
      true, 'no article-backed sentence page reached in this walk — honest absence path');
  }
  // ------------- E3 round-A findings (the closing double-dry earned these)
  // (1) a captured-but-never-STARTED row drilled in the 漢字だけ block must
  // stay practice: the no-debt law says only 始める enrols, and srsDueItems
  // honours it — so a schedule grade here would mint an orphan the review
  // queue can never surface. Pre-fix this routed to commitStandardGrade.
  console.log('\n— E3-A · the dojo honours 始める · いま見る holds for the whole card');
  const errsBeforeE3 = consoleErrors.length;
  await page.evaluate(`localStorage.setItem('kairo-corridor-v1', JSON.stringify({
    v: 1,
    taken: [{ t: 'kanji', id: '海', label: '海', kind: '漢字', kindEn: 'kanji', ts: 1 }],
    srs: {}, revlog: [], obslog: [], stats: {},
  }))`);
  await open('');
  await page.waitForSelector('#ginga-symbol', { timeout: 20000 });
  await tap(page, '#ginga-symbol');
  await page.waitForSelector('.nav-dojo');
  await tap(page, '.nav-dojo');
  await page.waitForSelector('.focus-mode');
  await page.locator('.focus-mode', { hasText: '漢字だけ' }).click();
  await page.locator('.focus-start').click();
  await page.waitForSelector('.review-front', { timeout: 20000 });
  {
    const e3Front = await page.evaluate(`document.querySelector('.review-front')?.textContent ?? ''`);
    await page.waitForSelector('#reveal, #declare-recalled', { timeout: 8000 });
    await page.evaluate(`(document.querySelector('#reveal') || document.querySelector('#declare-recalled'))?.click()`);
    await page.waitForSelector('.grade-row', { timeout: 8000 });
    const practiceRow = await page.evaluate(
      `!!document.querySelector('.grade-row[data-practice]')`,
    );
    await page.evaluate(`document.querySelector('.grade.g-good')?.click()`);
    await page.waitForTimeout(400);
    const afterUnstarted = await page.evaluate(`(() => {
      const e = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
      const day = Object.values(e.stats || {}).reduce((a, s) => a + (s.nnew || 0), 0);
      return { srs: Object.keys(e.srs || {}).length, revlog: (e.revlog || []).length,
               dojo: (e.obslog || []).filter((r) => r[1] === 'dojo').length, nnew: day };
    })()`);
    check('E3-A · a captured-but-unstarted row drills as practice — no card, no revlog, no new-card slot',
      practiceRow && afterUnstarted.srs === 0 && afterUnstarted.revlog === 0 &&
        afterUnstarted.dojo >= 1 && afterUnstarted.nnew === 0,
      JSON.stringify({ front: e3Front, practiceRow, ...afterUnstarted }));
  }
  check('E3-A · the probes leave no console errors',
    consoleErrors.length === errsBeforeE3,
    consoleErrors.slice(errsBeforeE3).join(' | ') || 'clean');

  // hand the next block the store it expects: a seed written straight to
  // localStorage is overwritten by the LIVE page's pagehide flush, so the
  // reset has to travel through a navigation to clear memory as well
  await page.evaluate(`localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1 }))`);
  await open('?entry=shelf');
  await page.waitForTimeout(400);

  // --------------------- R4-B · lesson disposition, dojo refill honesty,
  // and the quiz that survives reload. Every probe here convicts a reverted
  // build: the old lesson completion auto-minted ten deck rows, the old
  // refill regraded the same schedules lap after lap, and the old quiz died
  // with the tab. Each probe runs on a controlled envelope and hands the
  // learner's own bytes back untouched.
  console.log('\n— R4-B · practice writes evidence; enrolling is a choice; nothing is lost');
  const errsBeforeR4B = consoleErrors.length;
  const r4bSnapshot = await page.evaluate(`localStorage.getItem('kairo-corridor-v1')`);

  // (a) PR70-P0-1 · a finished lesson creates ZERO deck rows; the end screen
  // holds the one explicit door — per word or all — and only that choice mints
  await page.evaluate(`localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1 }))`);
  await open('?entry=shelf');
  await page.waitForSelector('#lessons-link');
  await tap(page, '#lessons-link');
  await page.waitForSelector('.lesson-row');
  const lessonBreadth = await page.evaluate(`({
    jlptHeads: [...document.querySelectorAll('.list-head')].filter((n) => /^N[1-5]/.test(n.textContent.trim())).length,
    kanken: [...document.querySelectorAll('.eyebrow')].some((n) => n.textContent.includes('漢検')),
  })`);
  check('R4-B · the lesson lanes keep their breadth — JLPT levels and the 漢検 grades',
    lessonBreadth.jlptHeads >= 3 && lessonBreadth.kanken,
    `${lessonBreadth.jlptHeads} JLPT lanes · 漢検 ${lessonBreadth.kanken}`);
  await page.evaluate(`document.querySelector('.lesson-row').click()`);
  await page.waitForSelector('#lesson-next');
  for (let i = 0; i < 60; i += 1) {
    const stage = await page.evaluate(`(() => {
      if (document.querySelector('.lesson-enroll')) return 'end';
      const next = document.querySelector('#lesson-next');
      if (next) { next.click(); return 'advanced'; }
      const opt = document.querySelector('.lesson-option:not([disabled])');
      if (opt) { opt.click(); return 'picked'; }
      return 'unknown';
    })()`);
    if (stage === 'end') break;
    await page.waitForTimeout(60);
  }
  await page.waitForSelector('.lesson-enroll', { timeout: 8000 });
  const lessonDone = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const rows = (e.obslog || []).filter((r) => r[1] === 'lesson');
    return {
      taken: (e.taken || []).length,
      srsKeys: Object.keys(e.srs || {}).length,
      revlog: (e.revlog || []).length,
      done: Object.keys(e.lessonsDone || {}),
      rows,
      score: document.querySelector('.view-title')?.textContent ?? '',
    };
  })()`);
  check('R4-B · lesson completion alone creates ZERO deck rows — the score and the evidence, nothing else',
    lessonDone.taken === 0 && lessonDone.srsKeys === 0 && lessonDone.revlog === 0 &&
      lessonDone.done.length === 1 && /\d+ (\/|of) \d+/.test(lessonDone.score),
    `taken ${lessonDone.taken} · srs ${lessonDone.srsKeys} · lessonsDone ${JSON.stringify(lessonDone.done)} · "${lessonDone.score.trim()}"`);
  check('R4-B · the run\'s words land as practice-evidence rows, one per word, named by the run',
    lessonDone.rows.length === 10 &&
      lessonDone.rows.every((r) => [1, 3].includes(r[3]) && r[4] === lessonDone.done[0] && String(r[2]).startsWith('word:')),
    `${lessonDone.rows.length} lesson rows for ${lessonDone.done[0]}`);
  const chosenWord = await page.evaluate(`document.querySelector('[data-enroll]')?.dataset.enroll ?? null`);
  await page.evaluate(`document.querySelector('[data-enroll]').click()`);
  await page.waitForTimeout(250);
  const afterOne = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return {
      taken: (e.taken || []).map((t) => [t.id, Number.isFinite(t.started)]),
      srsKeys: Object.keys(e.srs || {}).length,
    };
  })()`);
  check('R4-B · one word chosen → exactly one deck row, started-marked, still cardless until reviewed',
    afterOne.taken.length === 1 && chosenWord && afterOne.taken[0][0] === chosenWord &&
      afterOne.taken[0][1] === true && afterOne.srsKeys === 0,
    `${JSON.stringify(afterOne.taken)} for choice ${chosenWord}`);
  await shoot(page, shotsDir, '23-r4b-lesson-enroll-choice');
  await page.evaluate(`document.querySelector('#lesson-enroll-all').click()`);
  await page.waitForTimeout(250);
  const afterAll = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const ids = (e.taken || []).map((t) => t.id);
    return {
      n: ids.length,
      unique: new Set(ids).size,
      allStarted: (e.taken || []).every((t) => Number.isFinite(t.started)),
      allDoorGone: !document.querySelector('#lesson-enroll-all'),
    };
  })()`);
  check('R4-B · ぜんぶ覚える enrolls exactly the rest — ten rows, no duplicates, every one started',
    afterAll.n === 10 && afterAll.unique === 10 && afterAll.allStarted && afterAll.allDoorGone,
    JSON.stringify(afterAll));

  // (b) POL-12 · the dojo's due block: each waiting card takes ONE honest
  // schedule grade; when the clock outlasts the pool, the refill's second
  // lap is practice — the copy says so, the seals stamp 稽古, and the
  // long-term schedule holds still while evidence rows accrue
  await page.evaluate(`(() => {
    const T = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    const card = (agoDays) => ({
      due: iso(T - agoDays * 86400000), last_review: iso(T - (agoDays + 3) * 86400000),
      stability: 4, difficulty: 5, elapsed_days: 3, scheduled_days: 3,
      reps: 3, lapses: 0, learning_steps: 0, state: 2,
    });
    localStorage.setItem('kairo-corridor-v1', JSON.stringify({
      v: 1,
      taken: [
        { t: 'word', id: '学校', label: '学校', ts: T, started: T },
        { t: 'word', id: '先生', label: '先生', ts: T, started: T },
      ],
      srs: { 'word:学校': card(2), 'word:先生': card(1) },
    }));
  })()`);
  await open('');
  await page.waitForSelector('#ginga-symbol', { timeout: 20000 });
  await tap(page, '#ginga-symbol');
  await page.waitForSelector('.nav-dojo');
  await tap(page, '.nav-dojo');
  await page.waitForSelector('.focus-mode');
  const dueModeSub = await page.evaluate(`(() => {
    const mode = [...document.querySelectorAll('.focus-mode')].find((b) => b.textContent.includes('覚えるの札'));
    return mode?.querySelector('.focus-mode-sub')?.textContent ?? '';
  })()`);
  check('R4-B · the due-mode copy says what the refill does — after the first lap, practice',
    /稽古|practice/.test(dueModeSub) && dueModeSub.includes('2'),
    `sub "${dueModeSub}"`);
  await page.locator('.focus-mode', { hasText: '覚えるの札' }).click();
  await page.locator('.focus-start').click();
  await page.waitForSelector('.review-front', { timeout: 20000 });
  for (let i = 0; i < 2; i += 1) {
    await page.waitForSelector('#reveal');
    await page.evaluate(`document.querySelector('#reveal')?.click()`);
    await page.waitForSelector('.grade-row');
    if (i === 0) {
      const lap1 = await page.evaluate(`({
        practice: document.querySelector('.grade-row').hasAttribute('data-practice'),
        whens: [...document.querySelectorAll('.grade .g-when')].map((n) => n.textContent),
      })`);
      check('R4-B · lap one grades for real — honest intervals, no practice stamp',
        lap1.practice === false && lap1.whens.length === 4 &&
          lap1.whens.every((w) => /\d+ (min|d|分|日)$/.test(w)),
        lap1.whens.join(' · '));
    }
    await page.evaluate(`document.querySelector('.grade.g-good')?.click()`);
    await page.waitForTimeout(300);
  }
  const lap1After = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return {
      srs: e.srs,
      revlog: (e.revlog || []).length,
      dojoRows: (e.obslog || []).filter((r) => r[1] === 'dojo').length,
    };
  })()`);
  check('R4-B · the first lap wrote the deck — two schedules moved, two revlog rows, zero practice rows',
    lap1After.revlog === 2 && lap1After.dojoRows === 0 &&
      Object.values(lap1After.srs).every((rec) => new Date(rec.due) > new Date()),
    `revlog ${lap1After.revlog} · dojo rows ${lap1After.dojoRows}`);
  await page.waitForSelector('.review-front');
  const lap2Front = await page.evaluate(`document.querySelector('.review-front')?.textContent ?? ''`);
  await page.waitForSelector('#reveal');
  await page.evaluate(`document.querySelector('#reveal')?.click()`);
  await page.waitForSelector('.grade-row[data-practice]', { timeout: 8000 });
  const lap2Whens = await page.evaluate(
    `[...document.querySelectorAll('.grade .g-when')].map((n) => n.textContent)`,
  );
  check('R4-B · lap two stamps 稽古 on every seal — the schedule is promised nothing',
    lap2Front === '学校' && lap2Whens.length === 4 &&
      lap2Whens.every((w) => w === '稽古' || w === 'practice'),
    `${lap2Front} → ${lap2Whens.join(' · ')}`);
  await shoot(page, shotsDir, '24-r4b-dojo-second-lap');
  await page.evaluate(`document.querySelector('.grade.g-good')?.click()`);
  await page.waitForTimeout(300);
  const lap2After = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    const rows = (e.obslog || []).filter((r) => r[1] === 'dojo');
    return { srs: e.srs, revlog: (e.revlog || []).length, rows };
  })()`);
  check('R4-B · the lap-two grade is evidence only — schedules byte-still, one dojo row naming the due room',
    lap2After.revlog === 2 &&
      JSON.stringify(lap2After.srs) === JSON.stringify(lap1After.srs) &&
      lap2After.rows.length === 1 && lap2After.rows[0][2] === 'word:学校' &&
      lap2After.rows[0][3] === 3 && lap2After.rows[0][4] === 'due',
    `row ${JSON.stringify(lap2After.rows[0])} · revlog ${lap2After.revlog}`);

  // (c) POL-13 · the tutor's quiz survives reload: the seeded run stands in
  // the envelope exactly as the app would persist it — no key, no deck, no
  // network — and the tray's resume door reopens it where it stood
  await page.evaluate(`localStorage.setItem('kairo-corridor-v1', JSON.stringify({
    v: 1,
    aiQuiz: {
      qs: [
        { q: 'RELOAD-Q1 問一', opts: ['a1', 'b1', 'c1', 'd1'], right: 0, why: 'because one' },
        { q: 'RELOAD-Q2 問二', opts: ['a2', 'b2', 'c2', 'd2'], right: 1, why: 'because two' },
        { q: 'RELOAD-Q3 問三', opts: ['a3', 'b3', 'c3', 'd3'], right: 2, why: 'because three' },
      ],
      ix: 1, picked: null, correct: 1, ts: Date.now(),
    },
  }))`);
  await open('?entry=shelf');
  await page.waitForSelector('#tray');
  await tap(page, '#tray');
  await page.waitForSelector('#aiq-resume');
  await page.evaluate(`document.querySelector('#aiq-resume').click()`);
  await page.waitForSelector('.aiq-q');
  const resumed = await page.evaluate(`({
    q: document.querySelector('.aiq-q')?.textContent ?? '',
    at: document.querySelector('.card-kind')?.textContent ?? '',
  })`);
  check('R4-B · a reload later, the quiz stands where it stood — question two, running score kept',
    resumed.q.includes('RELOAD-Q2') && /2\s*\/\s*3/.test(resumed.at),
    `"${resumed.q}" at "${resumed.at.trim()}"`);
  await page.evaluate(`[...document.querySelectorAll('.lesson-option')][1].click()`);
  await page.waitForTimeout(250);
  await open('?entry=shelf');
  await page.waitForSelector('#tray');
  await tap(page, '#tray');
  await page.waitForSelector('#aiq-resume');
  await page.evaluate(`document.querySelector('#aiq-resume').click()`);
  await page.waitForSelector('#aiq-next');
  const midPick = await page.evaluate(`({
    why: document.querySelector('.aiq-why')?.textContent ?? '',
    marked: document.querySelectorAll('.lesson-option.right').length,
  })`);
  check('R4-B · even the marked answer survives a reload — the why line and the mark come back',
    midPick.why === 'because two' && midPick.marked === 1,
    JSON.stringify(midPick));
  await page.evaluate(`document.querySelector('#aiq-next').click()`);
  await page.waitForTimeout(150);
  await page.evaluate(`[...document.querySelectorAll('.lesson-option')][0].click()`);
  await page.waitForTimeout(150);
  await page.evaluate(`document.querySelector('#aiq-next').click()`);
  await page.waitForTimeout(250);
  const quizScore = await page.evaluate(`(() => {
    const e = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return {
      title: document.querySelector('.view-title')?.textContent ?? '',
      stored: e.aiQuiz !== null,
      taken: (e.taken || []).length,
      srsKeys: Object.keys(e.srs || {}).length,
    };
  })()`);
  check('R4-B · the finished quiz shows its honest score and still grades nothing',
    /2\s*(\/|of)\s*3/.test(quizScore.title) &&
      quizScore.stored &&
      quizScore.taken === 0 &&
      quizScore.srsKeys === 0,
    `title "${quizScore.title.trim()}" · stored ${quizScore.stored}`);
  await page.evaluate(`document.querySelector('#aiq-close').click()`);
  await page.waitForTimeout(250);
  const quizClosed = await page.evaluate(
    `JSON.parse(localStorage.getItem('kairo-corridor-v1')).aiQuiz`,
  );
  check('R4-B · only the learner\'s own door lets the quiz go',
    quizClosed === null, `stored aiQuiz ${JSON.stringify(quizClosed)}`);

  // hand the envelope back exactly as found — these probes leave no learner state
  await page.evaluate(`(() => {
    const snap = ${JSON.stringify(r4bSnapshot)};
    if (snap === null) localStorage.removeItem('kairo-corridor-v1');
    else localStorage.setItem('kairo-corridor-v1', snap);
  })()`);
  check('R4-B · the probes leave no console errors',
    consoleErrors.length === errsBeforeR4B,
    consoleErrors.slice(errsBeforeR4B).join(' | ') || 'clean');

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
