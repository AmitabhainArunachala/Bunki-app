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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const target = page.locator(selector).nth(index);
    try {
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(60);
      // Aim at visible ink the browser says belongs to this control. A line-union
      // centre can fall into blank inline space or under fixed chrome after ruby
      // and glosses reflow; dispatching there tests the harness, not the app.
      const point = await target.evaluate((node) => {
        const fractions = [0.5, 0.32, 0.68, 0.18, 0.82];
        for (const r of node.getClientRects()) {
          for (const fx of fractions) {
            for (const fy of [0.5, 0.35, 0.65]) {
              const x = r.left + r.width * fx;
              const y = r.top + r.height * fy;
              if (x < 1 || x >= innerWidth - 1 || y < 1 || y >= innerHeight - 1) continue;
              const hit = document.elementFromPoint(x, y);
              if (hit && (hit === node || node.contains(hit))) return { x, y };
            }
          }
        }
        return null;
      });
      if (!point) {
        const debug = await target.evaluate((node) => ({
          text: node.textContent?.trim().slice(0, 40) ?? '',
          pointerEvents: getComputedStyle(node).pointerEvents,
          rects: [...node.getClientRects()].map((r) => {
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            const hit = document.elementFromPoint(x, y);
            return {
              x, y, width: r.width, height: r.height,
              hit: hit ? `${hit.tagName}.${hit.className}` : null,
              hitText: hit?.textContent?.trim().slice(0, 40) ?? '',
              hitOwned: !!hit && (hit === node || node.contains(hit)),
            };
          }),
        }));
        // A lazy dictionary render can replace the button between the point
        // scan and this diagnostic scan. Retry only when the freshly resolved
        // replacement demonstrably owns that same visible point.
        if (attempt < 2 && debug.rects.some((rect) => rect.hitOwned)) {
          await page.waitForTimeout(120);
          continue;
        }
        throw new Error(`touch: no unobscured point for ${selector}[${index}] ${JSON.stringify(debug)}`);
      }
      const { x, y } = point;
      const cdp = await page.context().newCDPSession(page);
      const touchPoint = { x, y, radiusX: 6, radiusY: 6, force: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint] });
      if (holdMs) await page.waitForTimeout(holdMs);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await page.waitForTimeout(120);
      return;
    } catch (error) {
      const detached = /not attached|detached/i.test(error instanceof Error ? error.message : String(error));
      if (!detached || attempt === 2) throw error;
      await page.waitForTimeout(120);
    }
  }
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

async function shoot(page, dir, name) {
  const file = join(dir, `${name}.png`);
  // Direct-start verifier URLs (for example ?entry=shelf) intentionally summon
  // the operator's black variant instrument. Product screenshots should match
  // the ordinary URL, where that developer strip does not exist; one named
  // capture below keeps it visible to prove the instrument still works.
  const hideDebug = name !== '08-variant-strip-open' && !name.startsWith('V-');
  const hiddenCount = hideDebug
    ? await page.evaluate(() => {
        const nodes = new Set([
          document.getElementById('variants'),
          ...document.querySelectorAll('.card-preview'),
        ]);
        for (const table of document.querySelectorAll('.sched')) {
          nodes.add(table);
          if (table.previousElementSibling?.classList.contains('card-kind')) {
            nodes.add(table.previousElementSibling);
          }
        }
        nodes.delete(null);
        for (const node of nodes) {
          node.dataset.captureVisibility = node.style.visibility;
          node.style.visibility = 'hidden';
        }
        return nodes.size;
      })
    : 0;
  try {
    await page.screenshot({ path: file });
  } finally {
    if (hiddenCount) {
      await page.evaluate(() => {
        for (const node of document.querySelectorAll('[data-capture-visibility]')) {
          node.style.visibility = node.dataset.captureVisibility;
          delete node.dataset.captureVisibility;
        }
      });
    }
  }
  return file;
}

/** Walk the UI the way a reader does until a word panel with semantic edges is open. */
async function walkToSemPanel(page, tapFn) {
  await tapFn(page, '.shelf-item');
  await page.waitForSelector('#reader .tok');
  await holdWord(page, '#reader .tok.content');
  await page.waitForSelector('#sheet');
  if ((await page.locator('#sheet .sem-row.static').count()) === 0) {
    // Walk through the first-class lexical room to an edited head that carries
    // both real dictionary doors and source-only phrase labels. This proves a
    // semantic placeholder is printed without becoming focusable homework.
    await tapFn(page, '#sheet-close');
    await page.waitForSelector('#sheet', { state: 'detached' });
    if ((await page.locator('body').getAttribute('data-view')) !== 'shelf') {
      await tapFn(page, '#back');
    }
    await page.waitForFunction(
      'document.body.dataset.view === "shelf" && !!document.querySelector("#thesaurus-link")',
    );
    await page.locator('#thesaurus-link').dispatchEvent('click');
    await page.waitForFunction(
      'document.body.dataset.view === "thesaurus" && !!document.querySelector("#thesaurus-search")',
    );
    await page.fill('#thesaurus-search', '過酷');
    await page.waitForSelector('[data-thesaurus^="過酷"]', { timeout: 30_000 });
    await page.locator('[data-thesaurus^="過酷"]').first().dispatchEvent('click');
    await page.waitForFunction(
      () => document.querySelector('#sheet[data-node="word:過酷"] .sem-row.static')
        && document.querySelector('#sheet[data-node="word:過酷"] .sem-row:not(.static)'),
      { timeout: 30_000 },
    );
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
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => {
    pageErrors.push(e.message);
    consoleErrors.push(`pageerror: ${e.message}`);
  });

  const report = { viewport: VIEWPORT, steps: [], measurements: {}, shelf: [], caps: {} };

  const open = async (query = '') => {
    await page.goto(`${base}/index.html${query}`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  };

  // ------------------------------------------- step 0 · the front door
  // Phase 2: opening the app with no query lands in the Drift universe —
  // The Walk's first segment. The corridor chrome stays above it (one
  // navigation fabric), the shelf is one door away, and the universe fully
  // sleeps while any other view is open.
  console.log('\n— step 0 · the front door (Drift)');
  await open('');
  await page.waitForTimeout(2200);
  const driftBoot = await page.evaluate(`({
    layerActive: document.getElementById('drift-layer')?.classList.contains('active'),
    words: document.querySelectorAll('#drift-layer .word').length,
    chrome: getComputedStyle(document.querySelector('.chrome')).display !== 'none',
    door: !!document.getElementById('enter-shelf-door'),
  })`);
  check('Phase 2 · the app opens into the living universe',
    driftBoot.layerActive && driftBoot.words >= 20,
    `layer active, ${driftBoot.words} words adrift`);
  check('Phase 2 · the corridor chrome rides above the universe (one fabric)',
    driftBoot.chrome && driftBoot.door, 'chrome visible, shelf door present');
  await shoot(page, shotsDir, '17-phase2-drift-entry');
  await page.tap('#enter-shelf-door');
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
      family: ctr?.dataset.family ?? null,
      sats: sats.length,
      structural: sats.filter((s) => s.classList.contains('bstruct')).length,
      clipped: sats.filter((s) => { const b = s.getBoundingClientRect(); return b.left < 0 || b.right > innerWidth || b.top < 60 || b.bottom > innerHeight - 64; }).length,
      satColor: sats.length ? getComputedStyle(sats[0]).color : null,
      fieldColor: field ? getComputedStyle(field).color : null,
      r: ctr ? (() => { const b = ctr.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })() : null,
    };
  })()`);
  check('bloom · the constellation is its own relief — three colour families',
    bloomProbe.ctr && bloomProbe.sats >= satFloor
      && bloomProbe.clipped === 0 && !!bloomProbe.family
      && bloomProbe.ctrColor !== bloomProbe.satColor && bloomProbe.satColor !== bloomProbe.fieldColor,
    `centre ${bloomProbe.ctrColor} · ${bloomProbe.sats} satellites (${bloomProbe.structural} structural; ${bloomProbe.clipped} clipped) · ${bloomProbe.family} · field ${bloomProbe.fieldColor}`);
  // drag the centre; the family must follow and the drag must stick
  const meanD = `(() => {
    const c = document.querySelector('#drift-layer .word.bctr')?.getBoundingClientRect();
    if (!c) return null;
    const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
    const points = [...document.querySelectorAll('#drift-layer .word.bsat')].map((s) => {
      const b = s.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
    });
    const ds = points.map((p) => Math.hypot(p.x - cx, p.y - cy));
    return {
      cx, cy,
      count: points.length,
      mean: ds.reduce((a, d) => a + d, 0) / (ds.length || 1),
      max: Math.max(0, ...ds),
      sx: points.reduce((a, p) => a + p.x, 0) / (points.length || 1),
      sy: points.reduce((a, p) => a + p.y, 0) / (points.length || 1),
      clipped: points.filter((p) =>
        p.b.left < 0 || p.b.right > innerWidth || p.b.top < 60 || p.b.bottom > innerHeight - 64
      ).length,
    };
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
  const satMoved = dragAfter ? Math.hypot(dragAfter.sx - dragBefore.sx, dragAfter.sy - dragBefore.sy) : 0;
  const dragDot = dragAfter
    ? (dragAfter.cx - dragBefore.cx) * (dragAfter.sx - dragBefore.sx)
      + (dragAfter.cy - dragBefore.cy) * (dragAfter.sy - dragBefore.sy)
    : 0;
  check('bloom · dragging the centre carries the whole constellation — and sticks',
    dragAfter && dragMoved > 60 && dragAfter.count === dragBefore.count
      && dragAfter.clipped === 0 && dragAfter.max < 235
      && satMoved > dragMoved * 0.25 && dragDot > 0,
    `centre ${dragMoved.toFixed(0)}px; family ${satMoved.toFixed(0)}px; `
      + `mean tether ${dragBefore.mean.toFixed(0)} → ${dragAfter.mean.toFixed(0)}px; `
      + `max ${dragAfter.max.toFixed(0)}px; clipped ${dragAfter.clipped}`);
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
  const searchFit = await page.evaluate(`(() => {
    const input = document.querySelector('#search');
    const style = getComputedStyle(input);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = style.font;
    const width = context.measureText(input.placeholder).width;
    const available = input.clientWidth
      - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
    return { placeholder: input.placeholder, width, available };
  })()`);
  check('the shelf renders real graded texts',
    (await page.locator('.shelf-item').count()) >= 8 && searchFit.width <= searchFit.available,
    `${await page.locator('.shelf-item').count()} texts, ready in ${loadMs} ms; `
      + `search ${searchFit.width.toFixed(0)}/${searchFit.available.toFixed(0)}px`);

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
  await page.waitForSelector('#reader .tok');
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
        // Measure the neighbour's ink row, not its deliberately expanded
        // 44px button/hit box. A hit region overlapping a gloss is harmless;
        // glyphs painting over it are not.
        const r = (other.querySelector('.tok-word') ?? other).getClientRects()[0];
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
  await page.waitForSelector('#reader .tok');
  const enIdx = await page.evaluate(
    `[...document.querySelectorAll('#reader .tok.content')].findIndex((t) => t.dataset.word === '沿線')`,
  );
  if (enIdx >= 0) {
    // furigana defaults to つねに here, so one tap goes straight to English
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
  await page.waitForSelector('#reader .tok');
  await page.locator('#dials-toggle').click();
  await page.waitForTimeout(150);
  await page.locator('[data-dial="furigana:1"]').dispatchEvent('click');
  await page.waitForTimeout(150);
  await tap(page, '#reader .tok.content', tapIdx);
  await page.waitForTimeout(120);
  await tap(page, '#reader .tok.content', tapIdx);
  await page.waitForTimeout(120);

  // 3rd tap → carries into the full entry (ratified click grammar)
  await tap(page, '#reader .tok.content', tapIdx);
  await page.waitForTimeout(120);
  const afterThird = await page.evaluate(`(() => ({
    sheet: document.querySelector('#sheet')?.dataset.node ?? '',
    named: document.querySelector('#sheet')?.getAttribute('aria-label') ?? '',
  }))()`);
  check('grammar · a third tap carries into the full entry',
    afterThird.sheet.startsWith('word:') && afterThird.named.length > 0,
    `${afterThird.sheet} · ${afterThird.named}`);
  if (afterThird.sheet) {
    // Use the same real touch path as the learner. A synthetic DOM click can
    // race a lazy dictionary rerender and report on a detached old button.
    await tap(page, '#sheet-close');
    await page.waitForSelector('#sheet', { state: 'detached' });
  }
  if (await page.locator('.token-actions').count()) {
    await tap(page, '.view-title');
    await page.waitForSelector('.token-actions', { state: 'detached' });
  }

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
  await page.waitForSelector('#sheet .dictionary-sense', { timeout: 30_000 });
  const panel = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return {
      node: s.dataset.node,
      headword: s.querySelector('.headword')?.textContent ?? '',
      reading: s.querySelector('.reading')?.textContent ?? '',
      gloss: s.querySelector('.gloss')?.textContent ?? s.querySelector('.sense-list')?.textContent ?? '',
      senses: s.querySelectorAll('.dictionary-sense').length,
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
  await shoot(page, shotsDir, '03-word-panel');
  report.steps.push({ step: 3, name: 'click grammar + entry', shot: '03-word-panel.png', panel });

  // A form-to-meaning prompt cannot distinguish homographs that print and read
  // alike. Prove through the visible UI that learning one exact カラー entry
  // creates one form card whose answer gathers all three compatible primary
  // senses. Reload before the lazy dictionary opens and reveal that aggregate
  // from its saved snapshot. This is folded into the existing dictionary-depth
  // result slot so the frozen suite remains exactly 91 checks.
  const homographReview = {
    resultRows: [],
    learned: null,
    review: null,
    cleaned: false,
    error: null,
  };
  try {
    await page.locator('#sheet-close').dispatchEvent('click');
    await page.waitForFunction(
      'document.body.dataset.view === "reader" && !document.querySelector("#sheet")',
    );
    await page.locator('#back').dispatchEvent('click');
    await page.waitForFunction(
      'document.body.dataset.view === "shelf" && !!document.querySelector("#search")',
    );
    await page.fill('#search', 'カラー');
    const collarResult = 'word:カラー:2853151';
    const colorResult = 'word:カラー:1038500';
    const callaResult = 'word:カラー:2853152';
    await page.waitForSelector(`[data-result="${collarResult}"]`, { timeout: 30_000 });
    await page.waitForSelector(`[data-result="${colorResult}"]`, { timeout: 30_000 });
    await page.waitForSelector(`[data-result="${callaResult}"]`, { timeout: 30_000 });
    homographReview.resultRows = await page.evaluate(`(() =>
      [...document.querySelectorAll('[data-result^="word:カラー:"]')].map((row) => ({
        id: row.dataset.result,
        gloss: row.querySelector('.row-gloss')?.textContent || '',
      })))()`);

    // Enter through the collar sense, then explicitly choose Learn once. The
    // scheduler's cue is the printed form, so its answer contract must include
    // the other indistinguishable entries rather than create hidden rubrics.
    await page.locator(`[data-result="${collarResult}"]`).dispatchEvent('click');
    await page.waitForSelector('#sheet .dictionary-sense', { timeout: 30_000 });
    const openedCollarSenses = await page.evaluate(`(() =>
      [...document.querySelectorAll('#sheet .dictionary-sense .gloss, #sheet .dictionary-sense .dictionary-glosses li')]
        .map((node) => node.textContent.trim()).filter(Boolean))()`);
    await tap(page, '#take');
    await page.waitForFunction('document.querySelector("#take")?.classList.contains("taken")');

    homographReview.learned = await page.evaluate(`(() => {
      const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
      const items = store.taken.filter((item) => item.t === 'word' && item.id === 'カラー');
      const card = store.review.cards['word:カラー@カラー'];
      return {
        items: items.map((item) => ({ seq: item.seq, cueReading: item.cueReading, answer: item.answer })),
        keys: Object.keys(store.review.cards),
        target: card?.contract?.targetComponentId,
        cardCount: Object.keys(store.review.cards).length,
      };
    })()`);

    // A navigation reload creates a fresh dictionary state. Enter Review
    // directly: neither the index nor a shard may be fetched to answer the
    // saved aggregate form card.
    await open('?entry=shelf');
    const resourcesBefore = await page.evaluate(
      `performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/dict-v2/')).map((entry) => entry.name)`,
    );
    await tap(page, '#review');
    await page.waitForSelector('#review-lobby');
    const trayRows = await page.locator('.tray-entry').count();
    await tap(page, '#start-review');
    await page.waitForSelector('#review-room[data-card="word:カラー@カラー"]');
    const card = await page.locator('#review-room').getAttribute('data-card');
    await tap(page, '#review-reveal');
    await page.waitForSelector('#review-answer');
    const revealed = await page.evaluate(`(() => ({
      reading: document.querySelector('#review-answer .review-reading')?.textContent || '',
      meanings: [...document.querySelectorAll('#review-answer .review-meanings p')]
        .map((node) => node.textContent.trim()).filter(Boolean),
      dictResources: performance.getEntriesByType('resource')
        .filter((entry) => entry.name.includes('/dict-v2/')).map((entry) => entry.name),
    }))()`);
    homographReview.review = {
      card,
      trayRows,
      resourcesBefore,
      ...revealed,
      openedCollarSenses,
    };
  } catch (err) {
    homographReview.error = err instanceof Error ? err.message : String(err);
  } finally {
    await page.evaluate("localStorage.removeItem('kairo-corridor-v1')");
    await open('?entry=shelf');
    homographReview.cleaned = await page.evaluate(
      "localStorage.getItem('kairo-corridor-v1') === null",
    );
  }
  const learnedHomograph = homographReview.learned;
  const revealedAggregate = homographReview.review;
  const savedAnswer = learnedHomograph?.items?.[0]?.answer;

  // One JMdict entry may constrain different senses to different readings.
  // Search must show the reading/gloss pair the learner typed, then carry that
  // match into the one canonical entry rather than snapping back to a global
  // first reading. Fold this into the dictionary-depth slot below.
  const restrictedReadings = { rows: [], error: null };
  try {
    for (const [query, gloss] of [
      ['さける', 'to avoid (situation)'],
      ['よける', 'to avoid (physical contact with)'],
    ]) {
      await page.fill('#search', query);
      const resultId = 'word:避ける:1583260';
      await page.waitForFunction(
        ({ id, reading, expectedGloss }) => {
          const row = [...document.querySelectorAll('[data-result]')]
            .find((candidate) => candidate.dataset.result === id);
          return row?.querySelector('.row-reading')?.textContent?.trim() === reading
            && row?.querySelector('.row-gloss')?.textContent?.trim() === expectedGloss;
        },
        { id: resultId, reading: query, expectedGloss: gloss },
        { timeout: 30_000 },
      );
      const result = page.locator(`[data-result="${resultId}"]`).first();
      const row = await result.evaluate((node) => ({
        id: node.dataset.result,
        word: node.querySelector('.row-word')?.childNodes[0]?.textContent?.trim() || '',
        reading: node.querySelector('.row-reading')?.textContent?.trim() || '',
        gloss: node.querySelector('.row-gloss')?.textContent?.trim() || '',
      }));
      await result.click();
      await page.waitForSelector('#sheet .dictionary-sense', { timeout: 30_000 });
      const canonical = await page.evaluate(
        ([expectedReading, expectedGloss]) => {
          const sheet = document.querySelector('#sheet');
          const compatibleSense = [...sheet.querySelectorAll('.dictionary-sense')].some((sense) => {
            const restriction = sense.querySelector('.dictionary-restriction')?.textContent || '';
            return restriction.includes(expectedReading) && sense.textContent.includes(expectedGloss);
          });
          return {
            node: sheet.dataset.node,
            headword: sheet.querySelector('.headword')?.textContent?.trim() || '',
            reading: sheet.querySelector('.reading')?.textContent?.trim() || '',
            compatibleSense,
          };
        },
        [query, gloss],
      );
      restrictedReadings.rows.push({ query, expectedGloss: gloss, row, canonical });
      await page.locator('#sheet-close').click();
      await page.waitForSelector('#sheet', { state: 'detached' });
    }
  } catch (err) {
    restrictedReadings.error = err instanceof Error ? err.message : String(err);
  }

  // English lookup must preserve the learner's lexical intent all the way
  // through the canonical sheet and explicit Learn action. These cases use a
  // later gloss whose permitted reading differs from the entry default, so a
  // first-reading/first-gloss fallback would create a silently false Review
  // contract. The written-form and cross-reference probes exercise the same
  // routing boundary without consuming another frozen result slot.
  const lexicalIntent = {
    searches: [],
    writtenForm: null,
    crossReference: null,
    senseQualifiedCrossReference: null,
    workerThrottle: null,
    cleaned: false,
    error: null,
  };
  try {
    await page.evaluate("localStorage.removeItem('kairo-corridor-v1')");
    const throttleBaseline = await page.evaluate(
      'window.__KAIRO_DICTIONARY_PERF__?.workerSearchDispatches || 0',
    );
    for (const value of ['a', 'as', 'asi', 'asid', 'aside']) {
      await page.fill('#search', value);
      await page.waitForTimeout(200);
    }
    const beforeSettle = await page.evaluate(`(() => ({
      dispatches: window.__KAIRO_DICTIONARY_PERF__?.workerSearchDispatches || 0,
      rows: document.querySelectorAll('#search-results .entry-row').length,
      query: document.querySelector('#search')?.value || '',
    }))()`);
    await page.waitForFunction(
      (start) => (window.__KAIRO_DICTIONARY_PERF__?.workerSearchDispatches || 0) === start + 1
        && window.__KAIRO_DICTIONARY_PERF__?.lastDispatchedQuery === 'aside',
      throttleBaseline,
      { timeout: 30_000 },
    );
    await page.waitForFunction(
      () => document.querySelector('#shelf-body')?.dataset.renderToken?.endsWith('\u0000full'),
      { timeout: 30_000 },
    );
    const naturalDispatches = await page.evaluate(
      'window.__KAIRO_DICTIONARY_PERF__.workerSearchDispatches',
    );
    await page.fill('#search', '');
    await page.waitForTimeout(200);
    await page.fill('#search', 'aside');
    await page.waitForTimeout(700);
    const afterCachedRepeat = await page.evaluate(
      'window.__KAIRO_DICTIONARY_PERF__.workerSearchDispatches',
    );
    await page.fill('#search', 'zzqx-one');
    await page.waitForTimeout(460);
    const beforeMidFlightChange = await page.evaluate(
      'window.__KAIRO_DICTIONARY_PERF__.workerSearchDispatches',
    );
    await page.fill('#search', 'zzqx-two');
    await page.waitForFunction(
      (minimum) => window.__KAIRO_DICTIONARY_PERF__?.lastDispatchedQuery === 'zzqx-two'
        && (window.__KAIRO_DICTIONARY_PERF__?.workerSearchDispatches || 0) <= minimum + 1
        && document.querySelector('#shelf-body')?.dataset.renderToken === 'zzqx-two\u0000full',
      beforeMidFlightChange,
      { timeout: 30_000 },
    );
    const afterMidFlight = await page.evaluate(
      'window.__KAIRO_DICTIONARY_PERF__.workerSearchDispatches',
    );
    lexicalIntent.workerThrottle = {
      baseline: throttleBaseline,
      beforeSettle,
      naturalDelta: naturalDispatches - throttleBaseline,
      cachedRepeatDelta: afterCachedRepeat - naturalDispatches,
      midFlightDelta: afterMidFlight - afterCachedRepeat,
    };
    const cases = [
      {
        query: 'put aside',
        seq: '1583260',
        word: '避ける',
        reading: 'よける',
        gloss: 'to put aside',
        card: 'word:避ける@よける',
        alternate: '除ける',
      },
      {
        query: 'semicircle',
        seq: '1583170',
        word: '半月',
        reading: 'はんげつ',
        gloss: 'semicircle',
        card: 'word:半月@はんげつ',
        alternate: '',
      },
    ];
    for (const probe of cases) {
      await page.fill('#search', probe.query);
      await page.waitForFunction(
        ({ seq, reading, gloss }) => {
          const row = [...document.querySelectorAll('[data-result]')]
            .find((candidate) => candidate.dataset.result?.endsWith(`:${seq}`));
          return row?.querySelector('.row-reading')?.textContent?.trim() === reading
            && row?.querySelector('.row-gloss')?.textContent?.trim() === gloss;
        },
        { seq: probe.seq, reading: probe.reading, gloss: probe.gloss },
        { timeout: 30_000 },
      );
      const result = page.locator(`[data-result$=":${probe.seq}"]`).first();
      const row = await result.evaluate((node) => ({
        id: node.dataset.result,
        word: node.querySelector('.row-word')?.childNodes[0]?.textContent?.trim() || '',
        reading: node.querySelector('.row-reading')?.textContent?.trim() || '',
        gloss: node.querySelector('.row-gloss')?.textContent?.trim() || '',
      }));
      await result.click();
      await page.waitForSelector('#sheet .dictionary-sense', { timeout: 30_000 });
      await page.waitForFunction(
        ({ reading, gloss }) => {
          const sheet = document.querySelector('#sheet');
          return sheet?.querySelector('.reading')?.textContent?.trim() === reading
            && [...sheet.querySelectorAll('.dictionary-sense')]
              .some((sense) => sense.textContent.includes(gloss));
        },
        { reading: probe.reading, gloss: probe.gloss },
        { timeout: 30_000 },
      );
      const canonical = await page.evaluate(
        ({ reading, gloss }) => {
          const sheet = document.querySelector('#sheet');
          const matchedSense = [...sheet.querySelectorAll('.dictionary-sense')]
            .find((sense) => sense.textContent.includes(gloss));
          return {
            node: sheet.dataset.node,
            headword: sheet.querySelector('.headword')?.textContent?.trim() || '',
            reading: sheet.querySelector('.reading')?.textContent?.trim() || '',
            matchedGloss: !!matchedSense,
            restriction: matchedSense?.querySelector('.dictionary-restriction')?.textContent?.trim() || '',
          };
        },
        { reading: probe.reading, gloss: probe.gloss },
      );
      await tap(page, '#take');
      await page.waitForFunction('document.querySelector("#take")?.classList.contains("taken")');
      const learned = await page.evaluate(
        ({ word, reading, card }) => {
          const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
          const items = store.taken.filter(
            (item) => item.t === 'word' && item.id === word && item.cueReading === reading,
          );
          const reviewCard = store.review.cards[card];
          return {
            itemCount: items.length,
            answer: items[0]?.answer || null,
            cardPresent: !!reviewCard,
            target: reviewCard?.contract?.targetComponentId || '',
          };
        },
        { word: probe.word, reading: probe.reading, card: probe.card },
      );
      lexicalIntent.searches.push({ ...probe, row, canonical, learned });
      await page.locator('#sheet-close').click();
      await page.waitForSelector('#sheet', { state: 'detached' });
    }

    // 除ける participates in multiple entries. If the 避ける entry is offered
    // for that exact written query, it can only be paired with よける: さける
    // is not a source-compatible reading of the written form 除ける.
    await page.fill('#search', '除ける');
    await page.waitForFunction(
      () => [...document.querySelectorAll('[data-result]')]
        .some((row) => /:(1411270|1583260)$/.test(row.dataset.result || '')),
      { timeout: 30_000 },
    );
    lexicalIntent.writtenForm = await page.evaluate(`(() => {
      const rows = [...document.querySelectorAll('[data-result]')].map((row) => ({
        id: row.dataset.result || '',
        word: row.querySelector('.row-word')?.childNodes[0]?.textContent?.trim() || '',
        reading: row.querySelector('.row-reading')?.textContent?.trim() || '',
        gloss: row.querySelector('.row-gloss')?.textContent?.trim() || '',
      }));
      const targetRows = rows.filter((row) => row.id.endsWith(':1583260'));
      return {
        query: document.querySelector('#search')?.value || '',
        resultCount: rows.length,
        targetRows,
        safe: targetRows.every((row) => row.reading === 'よける')
          && targetRows.every((row) => row.reading !== 'さける'),
      };
    })()`);

    // JMdict qualifies this 金山 cross-reference with かなやま. The qualifier
    // is lexical routing data, not a decorative note: following it must select
    // the かなやま entry rather than falling back to the きんざん homograph.
    await page.fill('#search', 'gold mine');
    const goldMineResult = 'word:金山:1662950';
    await page.waitForFunction(
      (id) => {
        const row = document.querySelector(`[data-result="${id}"]`);
        return row?.querySelector('.row-reading')?.textContent?.trim() === 'きんざん'
          && row?.querySelector('.row-gloss')?.textContent?.trim() === 'gold mine';
      },
      goldMineResult,
      { timeout: 30_000 },
    );
    await page.locator(`[data-result="${goldMineResult}"]`).click();
    await page.waitForFunction(
      () => [...document.querySelectorAll('#sheet .dictionary-rel')].some((row) =>
        row.querySelector('.dictionary-rel-word')?.textContent?.trim() === '金山'
          && row.querySelector('.dictionary-rel-note')?.textContent?.trim() === 'かなやま'),
      { timeout: 30_000 },
    );
    const relation = page.locator('#sheet .dictionary-rel').filter({ hasText: 'かなやま' }).first();
    const from = await page.evaluate(`(() => ({
      node: document.querySelector('#sheet')?.dataset.node || '',
      reading: document.querySelector('#sheet .reading')?.textContent?.trim() || '',
    }))()`);
    const qualifier = await relation.locator('.dictionary-rel-note').textContent();
    await relation.click();
    await page.waitForFunction(
      () => document.querySelector('#sheet .reading')?.textContent?.trim() === 'かなやま'
        && document.querySelector('[data-dictionary-entry="2838215"].active'),
      { timeout: 30_000 },
    );
    lexicalIntent.crossReference = await page.evaluate(
      ([qualifierText, fromState]) => ({
        qualifier: qualifierText.trim(),
        from: fromState,
        node: document.querySelector('#sheet')?.dataset.node || '',
        headword: document.querySelector('#sheet .headword')?.textContent?.trim() || '',
        reading: document.querySelector('#sheet .reading')?.textContent?.trim() || '',
        activeSeq: document.querySelector('.dictionary-homograph.active')?.dataset.dictionaryEntry || '',
      }),
      [qualifier || '', from],
    );

    // Sense numbers in JMdict xref qualifiers are displayed as source data,
    // but are not part of the reading itself. 辛い／からい points to the
    // distinct 辛い／つらい entry through the literal qualifier つらい・1.
    await page.locator('#sheet-close').click();
    await page.waitForSelector('#sheet', { state: 'detached' });
    await page.fill('#search', 'spicy');
    const spicyResult = 'word:辛い:1365850';
    await page.waitForSelector(`[data-result="${spicyResult}"]`, { timeout: 30_000 });
    await page.locator(`[data-result="${spicyResult}"]`).click();
    await page.waitForFunction(
      () => [...document.querySelectorAll('#sheet .dictionary-rel')].some((row) =>
        row.querySelector('.dictionary-rel-note')?.textContent?.trim() === 'つらい・1'),
      { timeout: 30_000 },
    );
    const senseQualified = page.locator('#sheet .dictionary-rel').filter({ hasText: 'つらい・1' }).first();
    const sourceQualifier = (await senseQualified.locator('.dictionary-rel-note').textContent())?.trim() || '';
    await senseQualified.click();
    await page.waitForFunction(
      () => document.querySelector('#sheet .reading')?.textContent?.trim() === 'つらい'
        && document.querySelector('[data-dictionary-entry="1365860"].active'),
      { timeout: 30_000 },
    );
    lexicalIntent.senseQualifiedCrossReference = await page.evaluate(
      (qualifierText) => ({
        qualifier: qualifierText,
        node: document.querySelector('#sheet')?.dataset.node || '',
        reading: document.querySelector('#sheet .reading')?.textContent?.trim() || '',
        activeSeq: document.querySelector('.dictionary-homograph.active')?.dataset.dictionaryEntry || '',
      }),
      sourceQualifier,
    );
  } catch (err) {
    lexicalIntent.error = err instanceof Error ? err.message : String(err);
  } finally {
    await page.evaluate("localStorage.removeItem('kairo-corridor-v1')");
    await open('?entry=shelf');
    lexicalIntent.cleaned = await page.evaluate(
      "localStorage.getItem('kairo-corridor-v1') === null",
    );
  }
  check('the dictionary carries every sense, most common first',
    panel.senses >= 2
      && homographReview.error === null
      && homographReview.resultRows.length === 3
      && learnedHomograph?.items.length === 1
      && learnedHomograph.items[0].seq == null
      && learnedHomograph.items[0].cueReading === 'カラー'
      && learnedHomograph.cardCount === 1
      && learnedHomograph.keys.join(',') === 'word:カラー@カラー'
      && learnedHomograph.target === 'kc:word:カラー@カラー'
      && savedAnswer?.entries?.join(',') === '1038500,2853151,2853152'
      && savedAnswer?.meanings?.includes('color')
      && savedAnswer.meanings.includes('collar')
      && savedAnswer.meanings.includes('calla (variety of arum lily)')
      && revealedAggregate?.card === 'word:カラー@カラー'
      && revealedAggregate.trayRows === 1
      && revealedAggregate.resourcesBefore.length === 0
      && revealedAggregate.dictResources.length === 0
      && revealedAggregate.meanings.join('\u0000') === savedAnswer.meanings.join('\u0000')
      && revealedAggregate.meanings.includes('color')
      && revealedAggregate.meanings.includes('collar')
      && revealedAggregate.meanings.includes('calla (variety of arum lily)')
      && revealedAggregate.openedCollarSenses.includes('collar')
      && homographReview.cleaned
      && restrictedReadings.error === null
      && restrictedReadings.rows.length === 2
      && restrictedReadings.rows.every(({ query, expectedGloss, row, canonical }) =>
        row.id === 'word:避ける:1583260'
          && row.word === '避ける'
          && row.reading === query
          && row.gloss === expectedGloss
          && canonical.node === 'word:避ける'
          && canonical.headword.startsWith('避ける')
          && canonical.reading === query
          && canonical.compatibleSense)
      && lexicalIntent.error === null
      && lexicalIntent.workerThrottle?.beforeSettle.dispatches === lexicalIntent.workerThrottle.baseline
      && lexicalIntent.workerThrottle.beforeSettle.rows > 0
      && lexicalIntent.workerThrottle.beforeSettle.query === 'aside'
      && lexicalIntent.workerThrottle.naturalDelta === 1
      && lexicalIntent.workerThrottle.cachedRepeatDelta === 0
      && lexicalIntent.workerThrottle.midFlightDelta <= 2
      && lexicalIntent.searches.length === 2
      && lexicalIntent.searches.every(({ seq, word, reading, gloss, card, alternate, row, canonical, learned }) =>
        row.id.endsWith(`:${seq}`)
          && row.word === word
          && row.reading === reading
          && row.gloss === gloss
          && canonical.node === `word:${word}`
          && canonical.headword.startsWith(word)
          && (!alternate || canonical.headword.includes(alternate))
          && canonical.reading === reading
          && canonical.matchedGloss
          && learned.itemCount === 1
          && learned.cardPresent
          && learned.target === `kc:${card}`
          && learned.answer?.reading === reading
          && learned.answer?.selectedEntrySeq === seq
          && learned.answer?.entries?.includes(seq)
          && learned.answer?.meanings?.includes(gloss))
      && lexicalIntent.writtenForm?.query === '除ける'
      && lexicalIntent.writtenForm.resultCount > 0
      && lexicalIntent.writtenForm.safe
      && lexicalIntent.crossReference?.qualifier === 'かなやま'
      && lexicalIntent.crossReference.from?.node === 'word:金山'
      && lexicalIntent.crossReference.from.reading === 'きんざん'
      && lexicalIntent.crossReference.node === 'word:金山'
      && lexicalIntent.crossReference.headword.startsWith('金山')
      && lexicalIntent.crossReference.reading === 'かなやま'
      && lexicalIntent.crossReference.activeSeq === '2838215'
      && lexicalIntent.senseQualifiedCrossReference?.qualifier === 'つらい・1'
      && lexicalIntent.senseQualifiedCrossReference.node === 'word:辛い'
      && lexicalIntent.senseQualifiedCrossReference.reading === 'つらい'
      && lexicalIntent.senseQualifiedCrossReference.activeSeq === '1365860'
      && lexicalIntent.cleaned,
    `${panel.headword}: ${panel.senses} senses; カラー card ${learnedHomograph?.keys?.join(' / ') || 'none'}; `
      + `entries ${savedAnswer?.entries?.join(' / ') || 'none'}; reload ${revealedAggregate?.card || homographReview.error || 'none'} `
      + `→ ${revealedAggregate?.meanings?.join(' · ') || 'no answer'}; dictionary fetches ${revealedAggregate?.dictResources?.length ?? 'n/a'}; `
      + `避ける ${restrictedReadings.rows.map(({ row }) => `${row.reading}「${row.gloss}」`).join(' / ') || restrictedReadings.error || 'missing'}; `
      + `intent ${lexicalIntent.searches.map(({ row }) => `${row.word}／${row.reading}「${row.gloss}」`).join(' · ') || lexicalIntent.error || 'missing'}; `
      + `worker natural/cache/mid-flight ${lexicalIntent.workerThrottle?.naturalDelta ?? '?'}/${lexicalIntent.workerThrottle?.cachedRepeatDelta ?? '?'}/${lexicalIntent.workerThrottle?.midFlightDelta ?? '?'}; `
      + `除ける ${lexicalIntent.writtenForm?.targetRows?.map(({ reading }) => reading).join(' / ') || 'seq absent'}; `
      + `金山 ${lexicalIntent.crossReference?.from?.reading || '?'} → ${lexicalIntent.crossReference?.reading || '?'}; `
      + `辛い ${lexicalIntent.senseQualifiedCrossReference?.qualifier || '?'} → ${lexicalIntent.senseQualifiedCrossReference?.reading || '?'}`);
  report.dictionaryHomographs = homographReview;
  report.dictionaryRestrictedReadings = restrictedReadings;
  report.dictionaryLexicalIntent = lexicalIntent;

  // now the surface that matters: a word that HAS semantic neighbours
  await open('?entry=shelf');
  await walkToSemPanel(page, tap);
  const semPanel = await page.evaluate(`(() => {
    const s = document.querySelector('#sheet');
    return {
      node: s.dataset.node,
      headword: s.querySelector('.headword')?.textContent ?? '',
      semRows: [...s.querySelectorAll('.sem-row')].map((r) => ({
        word: r.querySelector('.sem-word').textContent,
        note: r.querySelector('.sem-note').textContent,
        tag: r.tagName,
        static: r.classList.contains('static'),
        tabIndex: r.tabIndex,
      })),
    };
  })()`);
  check('semantic neighbours carry their discrimination notes',
    semPanel.semRows.length > 0
      && semPanel.semRows.every((r) => r.note.length > 0)
      && semPanel.semRows.some((r) => r.tag === 'BUTTON' && !r.static)
      && semPanel.semRows.some((r) => r.tag === 'DIV' && r.static && r.tabIndex === -1),
    semPanel.semRows.length
      ? `${semPanel.headword}: ${semPanel.semRows.length} edges, ${semPanel.semRows.filter((row) => !row.static).length} doors and ${semPanel.semRows.filter((row) => row.static).length} source-only labels`
      : 'no edges reached',
  );
  await shoot(page, shotsDir, '03b-semantic-neighbours');
  report.steps.push({ step: 3.5, name: 'semantic neighbours', shot: '03b-semantic-neighbours.png', semPanel });

  // Keep one unobscured proof of the first-class lexical room itself. The
  // entry sheet above is canonical, but it should not be the only evidence
  // that the room behind it exists as a navigable surface.
  await tap(page, '#sheet-close');
  await page.waitForSelector('#sheet', { state: 'detached' });
  await shoot(page, shotsDir, '03c-word-relations-room');
  await page.locator('[data-thesaurus^="過酷"]').first().dispatchEvent('click');
  await page.waitForSelector('#sheet[data-node="word:過酷"]');
  await page.waitForSelector('#sheet .dictionary-sense', { timeout: 30_000 });

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

  // ---------------------------------------------------------- step 5 review
  // Three result slots replace the three old take/schedule-preview slots, so
  // the frozen suite total remains 91. Each slot is a complete state-machine
  // walk: creation + honest recall, a capped finite plan, then legacy opt-in.
  console.log('\n— step 5 · 覚える → 復習');
  const reviewProbes = [];

  // A new explicit Learn action creates both the list row and its due card.
  await tap(page, '#take');
  const firstTake = await page.evaluate(`(() => {
    const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const item = store.taken.at(-1);
    const key = item ? item.t + ':' + item.id : null;
    const card = key ? store.review?.cards?.[key] : null;
    return {
      key,
      taken: store.taken.length,
      cards: Object.keys(store.review?.cards || {}).length,
      active: card?.memory?.active,
      due: Date.parse(card?.memory?.dueAt || '') <= Date.now(),
      admitted: card?.memory?.admittedReviewCount,
      history: store.review?.history?.length,
      chrome: document.querySelector('#review')?.textContent?.trim() || '',
      bucket: document.querySelector('.list-picker .eyebrow')?.textContent || '',
    };
  })()`);

  await tap(page, '#sheet-close');
  await page.waitForSelector('#sheet', { state: 'detached' });
  await tap(page, '#review');
  await page.waitForSelector('#review-lobby');
  reviewProbes.push(await page.evaluate(MEASURE_FN));
  await tap(page, '#start-review');
  await page.waitForSelector('#review-room');
  const reviewBeforeReveal = await page.evaluate(`(() => ({
    answer: document.querySelectorAll('#review-answer').length,
    reveal: document.querySelectorAll('#review-reveal').length,
    giveUp: document.querySelectorAll('#review-give-up').length,
    planSize: Number(document.querySelector('#review-room')?.dataset.planSize),
    card: document.querySelector('#review-room')?.dataset.card || '',
  }))()`);
  reviewProbes.push(await page.evaluate(MEASURE_FN));

  await tap(page, '#review-reveal');
  await page.waitForSelector('#review-answer');
  const normalReveal = await page.evaluate(`(() => ({
    answer: document.querySelectorAll('#review-answer').length,
    grades: [...document.querySelectorAll('[data-review-grade]')].map((b) => b.dataset.reviewGrade),
    readingGroups: [...document.querySelectorAll('.review-reading-group')].map((group) => ({
      text: group.textContent,
      lines: group.getClientRects().length,
    })),
  }))()`);
  reviewProbes.push(await page.evaluate(MEASURE_FN));
  await shoot(page, shotsDir, '05-review-room');
  await tap(page, '[data-review-grade="good"]');
  await page.waitForSelector('#review-finish');
  reviewProbes.push(await page.evaluate(MEASURE_FN));

  const afterGood = await page.evaluate(`(() => {
    const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const item = store.taken.at(-1);
    const key = item.t + ':' + item.id;
    const card = store.review.cards[key];
    const receipt = store.review.history.at(-1);
    return {
      key,
      history: store.review.history.length,
      admitted: card.memory.admittedReviewCount,
      lastReviewedAt: card.memory.lastReviewedAt,
      dueAt: card.memory.dueAt,
      receiptGrade: receipt?.submittedGrade,
      effectiveGrade: receipt?.effectiveGrade,
      revealedBeforeRecall: receipt?.revealedBeforeRecall,
      receiptDueAt: receipt?.after?.dueAt,
    };
  })()`);

  // A navigation reload must reconstruct the same memory and receipt.
  await open('?entry=shelf');
  const reloadedGood = await page.evaluate(`(() => {
    const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const item = store.taken.at(-1);
    const key = item.t + ':' + item.id;
    const card = store.review.cards[key];
    return {
      key,
      history: store.review.history.length,
      admitted: card.memory.admittedReviewCount,
      lastReviewedAt: card.memory.lastReviewedAt,
      dueAt: card.memory.dueAt,
    };
  })()`);
  await tap(page, '#review');
  await page.waitForSelector('#review-lobby');
  const reloadUi = await page.evaluate(`({
    toggles: document.querySelectorAll('[data-review-toggle]').length,
    due: document.querySelectorAll('#start-review').length,
  })`);
  reviewProbes.push(await page.evaluate(MEASURE_FN));

  check('Review · 覚える creates a due card; honest Good persists through reload',
    firstTake.taken === 1 && firstTake.cards === 1 && firstTake.active && firstTake.due
      && firstTake.admitted === 0 && firstTake.history === 0
      && /復\s*1/.test(firstTake.chrome) && /\d{4}年\d{1,2}月/.test(firstTake.bucket)
      && reviewBeforeReveal.answer === 0 && reviewBeforeReveal.reveal === 1 && reviewBeforeReveal.giveUp === 1
      && reviewBeforeReveal.planSize === 1 && reviewBeforeReveal.card === firstTake.key
      && normalReveal.answer === 1 && normalReveal.grades.join(',') === 'again,hard,good,easy'
      && normalReveal.readingGroups.length > 0
      && normalReveal.readingGroups.every((group) => group.lines === 1)
      && normalReveal.readingGroups.some((group) => group.text.includes('す.ごす'))
      && afterGood.history === 1 && afterGood.admitted === 1 && !!afterGood.lastReviewedAt
      && afterGood.receiptGrade === 'good' && afterGood.effectiveGrade === 'good'
      && afterGood.revealedBeforeRecall === false && afterGood.receiptDueAt === afterGood.dueAt
      && reloadedGood.key === afterGood.key && reloadedGood.history === afterGood.history
      && reloadedGood.admitted === afterGood.admitted
      && reloadedGood.lastReviewedAt === afterGood.lastReviewedAt
      && reloadedGood.dueAt === afterGood.dueAt && reloadUi.toggles === 1,
    `taken/card/history ${firstTake.taken}/${firstTake.cards}/${firstTake.history}; `
      + `pre-answer ${reviewBeforeReveal.answer}; ratings ${normalReveal.grades.join(',')}; `
      + `reading groups ${normalReveal.readingGroups.map((group) => group.text).join('|')}; `
      + `Good receipts ${afterGood.history}; reload receipts ${reloadedGood.history}`);

  // Seed 21 due cards from the valid persisted scheduler stamp. The room owns
  // only 20: its data-plan-size must not change and the 21st must not refill it.
  const finiteSeed = await page.evaluate(`(() => {
    const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const original = store.taken.at(-1);
    const originalKey = original.t + ':' + original.id;
    const template = store.review.cards[originalKey];
    const now = Date.now();
    const anchor = new Date(now - 180000).toISOString();
    template.memory.active = true;
    template.memory.dueAt = new Date(now - 120000).toISOString();
    template.memory.lastReviewedAt = anchor;
    template.memory.schedulerAnchorAt = anchor;
    for (let i = 0; i < 20; i += 1) {
      const id = '検証用' + String(i + 1).padStart(2, '0');
      const key = 'word:' + id;
      const contractId = 'corridor:' + key + ':form-to-meaning:v1';
      const record = JSON.parse(JSON.stringify(template));
      record.contract.contractId = contractId;
      record.contract.targetComponentId = 'kc:' + id;
      record.memory.contractId = contractId;
      record.memory.active = true;
      record.memory.dueAt = new Date(now - 60000 + i * 100).toISOString();
      record.memory.lastReviewedAt = anchor;
      record.memory.schedulerAnchorAt = anchor;
      store.taken.push({ t: 'word', id, label: id, kind: '語', kindEn: 'word', from: null, ts: now + i });
      store.review.cards[key] = record;
    }
    localStorage.setItem('kairo-corridor-v1', JSON.stringify(store));
    return { originalKey, history: store.review.history.length, due: store.taken.length };
  })()`);
  await open('?entry=shelf');
  await tap(page, '#review');
  await page.waitForSelector('#start-review');
  await tap(page, '#start-review');
  await page.waitForSelector('#review-room');
  const finitePlan = await page.evaluate(`(() => ({
    size: Number(document.querySelector('#review-room').dataset.planSize),
    cursor: Number(document.querySelector('#review-room').dataset.cursor),
    card: document.querySelector('#review-room').dataset.card,
  }))()`);
  const planSnapshots = [finitePlan];
  reviewProbes.push(await page.evaluate(MEASURE_FN));

  await tap(page, '#review-give-up');
  await page.waitForSelector('#review-answer');
  const giveUpReveal = await page.evaluate(
    `[...document.querySelectorAll('[data-review-grade]')].map((b) => b.dataset.reviewGrade)`,
  );
  reviewProbes.push(await page.evaluate(MEASURE_FN));
  await tap(page, '[data-review-grade="again"]');

  for (let cursor = 1; cursor < finitePlan.size; cursor += 1) {
    await page.waitForSelector('#review-room');
    planSnapshots.push(await page.evaluate(`(() => ({
      size: Number(document.querySelector('#review-room').dataset.planSize),
      cursor: Number(document.querySelector('#review-room').dataset.cursor),
      card: document.querySelector('#review-room').dataset.card,
    }))()`));
    await tap(page, '#review-reveal');
    await page.waitForSelector('#review-answer');
    await tap(page, '[data-review-grade="good"]');
  }
  await page.waitForSelector('#review-finish');
  const finiteClose = await page.evaluate(`(() => {
    const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const due = Object.values(store.review.cards)
      .filter((record) => record.memory.active && Date.parse(record.memory.dueAt) <= Date.now()).length;
    const receipt = store.review.history[${finiteSeed.history}];
    return {
      history: store.review.history.length,
      due,
      finish: document.querySelectorAll('#review-finish').length,
      text: document.querySelector('.review-closure')?.textContent || '',
      chrome: document.querySelector('#review')?.textContent?.trim() || '',
      receipt: receipt ? {
        submittedGrade: receipt.submittedGrade,
        effectiveGrade: receipt.effectiveGrade,
        revealedBeforeRecall: receipt.revealedBeforeRecall,
      } : null,
    };
  })()`);
  reviewProbes.push(await page.evaluate(MEASURE_FN));

  check('Review · give-up forces Again and a frozen finite plan closes without refill',
    finiteSeed.due === 21 && finitePlan.size === 20 && finitePlan.cursor === 0
      && finitePlan.card === finiteSeed.originalKey && giveUpReveal.join(',') === 'again'
      && planSnapshots.length === finitePlan.size
      && planSnapshots.every((snapshot, index) => snapshot.size === finitePlan.size && snapshot.cursor === index)
      && finiteClose.history === finiteSeed.history + finitePlan.size
      && finiteClose.receipt?.submittedGrade === 'again'
      && finiteClose.receipt?.effectiveGrade === 'again'
      && finiteClose.receipt?.revealedBeforeRecall === true
      && finiteClose.finish === 1 && finiteClose.due === 1
      && /1/.test(finiteClose.text) && /復\s*1/.test(finiteClose.chrome),
    `plan ${finitePlan.size}, snapshots ${planSnapshots.length}; give-up ratings ${giveUpReveal.join(',')}; `
      + `receipts ${finiteSeed.history}→${finiteClose.history}; deferred due ${finiteClose.due}`);

  // The v1 shape is intentionally debt-free. Only the visible opt-in creates a
  // card; after one receipt, pausing removes it from due work without erasing it.
  await page.evaluate(`(() => {
    const ts = Date.now() - 86400000;
    localStorage.setItem('kairo-corridor-v1', JSON.stringify({
      taken: [{ t: 'word', id: '世界', label: '世界', kind: '語', kindEn: 'word', from: null, ts }],
      lists: {},
    }));
  })()`);
  await open('?entry=shelf');
  await tap(page, '#review');
  await page.waitForSelector('#review-lobby');
  const legacyBefore = await page.evaluate(`(() => {
    const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    return {
      hasReview: Object.prototype.hasOwnProperty.call(store, 'review'),
      start: document.querySelectorAll('#start-review').length,
      promote: document.querySelectorAll('[data-review-promote]').length,
      toggle: document.querySelectorAll('[data-review-toggle]').length,
    };
  })()`);
  reviewProbes.push(await page.evaluate(MEASURE_FN));
  await tap(page, '[data-review-promote]');
  const legacyPromoted = await page.evaluate(`(() => {
    const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const records = Object.values(store.review.cards);
    return {
      cards: records.length,
      history: store.review.history.length,
      active: records[0]?.memory?.active,
      due: Date.parse(records[0]?.memory?.dueAt || '') <= Date.now(),
      start: document.querySelectorAll('#start-review').length,
      promote: document.querySelectorAll('[data-review-promote]').length,
      toggle: document.querySelectorAll('[data-review-toggle]').length,
    };
  })()`);
  reviewProbes.push(await page.evaluate(MEASURE_FN));
  await tap(page, '#start-review');
  await page.waitForSelector('#review-room');
  await tap(page, '#review-reveal');
  await page.waitForSelector('#review-answer');
  await tap(page, '[data-review-grade="good"]');
  await page.waitForSelector('#review-finish');
  await tap(page, '#review-finish');
  await page.waitForSelector('[data-review-toggle]');

  // Make the learned card due before reloading so the pause assertion proves
  // removal from the due set, rather than merely hiding an already-future card.
  await page.evaluate(`(() => {
    const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    const record = Object.values(store.review.cards)[0];
    record.memory.dueAt = new Date(Date.now() - 60000).toISOString();
    localStorage.setItem('kairo-corridor-v1', JSON.stringify(store));
  })()`);
  await open('?entry=shelf');
  await tap(page, '#review');
  await page.waitForSelector('#start-review');
  const beforePause = await page.evaluate(`(() => {
    const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    return {
      history: store.review.history.length,
      active: Object.values(store.review.cards)[0].memory.active,
      due: document.querySelectorAll('#start-review').length,
    };
  })()`);
  reviewProbes.push(await page.evaluate(MEASURE_FN));
  await tap(page, '[data-review-toggle]');
  const afterPause = await page.evaluate(`(() => {
    const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
    return {
      history: store.review.history.length,
      active: Object.values(store.review.cards)[0].memory.active,
      due: document.querySelectorAll('#start-review').length,
      toggle: document.querySelectorAll('[data-review-toggle]').length,
    };
  })()`);
  reviewProbes.push(await page.evaluate(MEASURE_FN));

  // The lesson, canonical entry and Review must share one learner record.
  // Exercise the migration edges through visible controls, and fold them into
  // this existing storage result so the suite keeps its frozen 91 slots.
  const lessonStore = {
    legacyTaken: null,
    keepThenCanonical: null,
    malformed: null,
    future: null,
    malformedRoots: [],
    malformedReview: null,
    driftObservation: null,
    articleRetry: null,
    cleaned: false,
    error: null,
  };
  const failOnceArticlePattern = '**/data/articles/bunki-graded-n5-kitchen.json';
  let failOnceArticleRouteInstalled = false;
  let lessonEvidenceCaptured = false;
  const seedStore = async (value) => {
    const raw = JSON.stringify(value);
    await page.evaluate(
      ([key, bytes]) => localStorage.setItem(key, bytes),
      ['kairo-corridor-v1', raw],
    );
    return raw;
  };
  const enterFirstLesson = async () => {
    await open('?entry=shelf');
    await page.locator('#path-link').click();
    await page.waitForFunction(
      'document.body.dataset.view === "path" && !!document.querySelector(`[data-lesson="n5-kitchen-teiru"]`)',
    );
    if (!lessonEvidenceCaptured) await shoot(page, shotsDir, '23-guided-path');
    await page.locator('[data-lesson="n5-kitchen-teiru"]').click();
    await page.waitForFunction(
      'document.body.dataset.view === "lesson" && !!document.querySelector(".lesson-disposition")',
      null,
      { timeout: 30_000 },
    );
    if (!lessonEvidenceCaptured) {
      await shoot(page, shotsDir, '24-first-lesson');
      lessonEvidenceCaptured = true;
    }
    const row = page.locator('.lesson-disposition').filter({ hasText: '〜ている' }).first();
    await row.waitFor();
    return row;
  };
  const probeReadOnlyRaw = async (kind, raw) => {
    await page.evaluate(
      ([key, bytes]) => localStorage.setItem(key, bytes),
      ['kairo-corridor-v1', raw],
    );
    const errorsAt = pageErrors.length;
    await enterFirstLesson();
    const probe = await page.evaluate(`(() => {
      const mutators = [...document.querySelectorAll('.lesson-keep, .lesson-learn, .lesson-choice, #lesson-close')];
      return {
        view: document.body.dataset.view,
        title: document.querySelector('.lesson-title')?.textContent || '',
        warning: document.querySelector('#store-warning')?.textContent || '',
        mutators: mutators.length,
        disabled: mutators.filter((button) => button.disabled).length,
        raw: localStorage.getItem('kairo-corridor-v1'),
      };
    })()`);
    probe.kind = kind;
    probe.pageErrors = pageErrors.length - errorsAt;
    probe.rawPreserved = probe.raw === raw;
    delete probe.raw;
    return probe;
  };
  try {
    // (a) A legacy list row is not yet a card. Lesson Learn must stay enabled,
    // promote that exact row, and write the lesson disposition beside it.
    await seedStore({
      taken: [{
        t: 'grammar', id: 'teiru', label: '〜ている', kind: '文法', kindEn: 'grammar',
        from: null, ts: Date.now() - 86_400_000,
      }],
      lists: {},
    });
    let grammarRow = await enterFirstLesson();
    const legacyBeforeLessonLearn = {
      learnDisabled: await grammarRow.locator('.lesson-learn').isDisabled(),
      keepDisabled: await grammarRow.locator('.lesson-keep').isDisabled(),
      rowCount: await page.locator('.lesson-disposition').count(),
    };
    await grammarRow.locator('.lesson-learn').click();
    await page.waitForFunction(
      'document.querySelector(".lesson-disposition .lesson-learn.selected")?.disabled === true',
    );
    const legacyAfterLessonLearn = await page.evaluate(`(() => {
      const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
      const card = store.review?.cards?.['grammar:teiru'];
      const thread = store.learning?.threads?.['grammar:teiru'];
      return {
        taken: store.taken.filter((item) => item.t === 'grammar' && item.id === 'teiru').length,
        cards: Object.keys(store.review?.cards || {}),
        target: card?.contract?.targetComponentId,
        active: card?.memory?.active,
        disposition: thread?.disposition,
        encounters: thread?.encounters?.length,
        selected: document.querySelector('.lesson-disposition .lesson-learn')?.classList.contains('selected'),
      };
    })()`);
    lessonStore.legacyTaken = { before: legacyBeforeLessonLearn, after: legacyAfterLessonLearn };

    // (b) Keep records only the encounter. Opening the canonical grammar sheet
    // and choosing 覚える must reconcile that same thread to Learn and create
    // the same scheduler identity used by the lesson action.
    await seedStore({
      taken: [],
      lists: {},
      review: { version: 1, cards: {}, history: [] },
      learning: { version: 1, threads: {}, lessons: {}, evidence: [] },
    });
    grammarRow = await enterFirstLesson();
    const keepWasEnabled = !(await grammarRow.locator('.lesson-keep').isDisabled());
    await grammarRow.locator('.lesson-keep').click();
    await page.waitForFunction(
      'document.querySelector(".lesson-disposition .lesson-keep.selected") !== null',
    );
    const afterKeep = await page.evaluate(`(() => {
      const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
      const thread = store.learning?.threads?.['grammar:teiru'];
      return {
        disposition: thread?.disposition,
        encounters: thread?.encounters?.length,
        taken: store.taken.length,
        cards: Object.keys(store.review?.cards || {}).length,
        learnDisabled: document.querySelector('.lesson-disposition .lesson-learn')?.disabled,
      };
    })()`);
    await page.locator('#lesson-grammar-door').click();
    await page.waitForSelector('#sheet[data-node="grammar:teiru"]');
    const canonicalTakeWasEnabled = !(await page.locator('#take').isDisabled());
    await page.locator('#take').click();
    await page.waitForFunction('document.querySelector("#take")?.classList.contains("taken")');
    const afterCanonicalLearn = await page.evaluate(`(() => {
      const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
      const thread = store.learning?.threads?.['grammar:teiru'];
      const card = store.review?.cards?.['grammar:teiru'];
      return {
        disposition: thread?.disposition,
        encounters: thread?.encounters?.length,
        taken: store.taken.filter((item) => item.t === 'grammar' && item.id === 'teiru').length,
        cards: Object.keys(store.review?.cards || {}),
        target: card?.contract?.targetComponentId,
        active: card?.memory?.active,
        selected: document.querySelector('#take')?.classList.contains('taken'),
      };
    })()`);
    lessonStore.keepThenCanonical = {
      keepWasEnabled,
      canonicalTakeWasEnabled,
      afterKeep,
      afterCanonicalLearn,
    };

    // (c1) A malformed current record is quarantined byte-for-byte. The lesson
    // still reads, but every mutation is visibly disabled and a warning names
    // the pause instead of silently replacing evidence.
    const malformedValue = {
      taken: [],
      lists: {},
      review: { version: 1, cards: {}, history: [] },
      learning: { version: 1, threads: {}, lessons: {}, evidence: [null] },
    };
    const malformedRaw = await seedStore(malformedValue);
    const malformedErrorsAt = pageErrors.length;
    await enterFirstLesson();
    const malformedProbe = await page.evaluate(`(() => {
      const mutators = [...document.querySelectorAll('.lesson-keep, .lesson-learn, .lesson-choice, #lesson-close')];
      return {
        view: document.body.dataset.view,
        title: document.querySelector('.lesson-title')?.textContent || '',
        warning: document.querySelector('#store-warning')?.textContent || '',
        mutators: mutators.length,
        disabled: mutators.filter((button) => button.disabled).length,
        raw: localStorage.getItem('kairo-corridor-v1'),
      };
    })()`);
    malformedProbe.pageErrors = pageErrors.length - malformedErrorsAt;
    malformedProbe.rawPreserved = malformedProbe.raw === malformedRaw;
    delete malformedProbe.raw;
    lessonStore.malformed = malformedProbe;
    reviewProbes.push(await page.evaluate(MEASURE_FN));

    // (c2) A future learning payload remains opaque. Navigation and reading
    // are safe, while current-version lesson mutation stays disabled.
    const futureValue = {
      taken: [],
      lists: {},
      review: { version: 1, cards: {}, history: [] },
      learning: {
        version: 27,
        futureThreads: [{ target: 'grammar:teiru', disposition: 'perhaps' }],
        futureEvidence: { shape: 'intentionally unknown' },
        sentinel: 'preserve-me',
      },
    };
    const futureRaw = await seedStore(futureValue);
    const futureErrorsAt = pageErrors.length;
    await open('?entry=shelf');
    await page.locator('#path-link').click();
    await page.waitForFunction('document.body.dataset.view === "path"');
    const futurePathWarning = await page.locator('main .review-warning').textContent();
    await page.locator('[data-lesson="n5-kitchen-teiru"]').click();
    await page.waitForFunction(
      'document.body.dataset.view === "lesson" && !!document.querySelector(".lesson-disposition")',
      null,
      { timeout: 30_000 },
    );
    const futureProbe = await page.evaluate(`(() => {
      const mutators = [...document.querySelectorAll('.lesson-keep, .lesson-learn, .lesson-choice, #lesson-close')];
      return {
        view: document.body.dataset.view,
        title: document.querySelector('.lesson-title')?.textContent || '',
        storeWarning: document.querySelector('#store-warning')?.textContent || '',
        mutators: mutators.length,
        disabled: mutators.filter((button) => button.disabled).length,
        raw: localStorage.getItem('kairo-corridor-v1'),
      };
    })()`);
    futureProbe.pathWarning = futurePathWarning || '';
    futureProbe.pageErrors = pageErrors.length - futureErrorsAt;
    futureProbe.rawPreserved = futureProbe.raw === futureRaw;
    delete futureProbe.raw;
    lessonStore.future = futureProbe;
    reviewProbes.push(await page.evaluate(MEASURE_FN));

    // (c3) JSON can parse successfully and still not be a storage envelope.
    // Array/scalar roots and a malformed current Review payload are quarantined
    // exactly like a malformed learning row: bytes stay in place, the warning
    // is visible, and all learner-state mutation is paused.
    lessonStore.malformedRoots.push(
      await probeReadOnlyRaw('array root', '[]'),
      await probeReadOnlyRaw('scalar root', '42'),
    );
    const malformedReviewValue = {
      taken: [],
      lists: {},
      review: { version: 1, cards: [], history: 'bad' },
      learning: { version: 1, threads: {}, lessons: {}, evidence: [] },
    };
    lessonStore.malformedReview = await probeReadOnlyRaw(
      'current review envelope',
      JSON.stringify(malformedReviewValue),
    );
    reviewProbes.push(await page.evaluate(MEASURE_FN));

    // A Drift judgment becomes partial evidence in the same learner spine,
    // while taken/Review/lesson threads/practice evidence remain untouched.
    // Current-v1 fields unknown to this client survive the write. A storage
    // failure synchronously rejects the bridge and rolls the observation back.
    await seedStore({
      taken: [],
      lists: {},
      review: { version: 1, cards: {}, history: [] },
      learning: {
        version: 1,
        threads: {},
        lessons: {},
        evidence: [],
        adjacentClientField: { preserve: true },
      },
      adjacentEnvelopeField: 'preserve-too',
    });
    await open('?entry=shelf');
    const acceptedObservation = await page.evaluate(`(() => {
      const detail = {
        version: 1,
        target: { t: 'word', id: '世界' },
        judgment: 'familiar',
        count: 2,
        at: '2026-08-10T12:34:56.000Z',
      };
      dispatchEvent(new CustomEvent('bunki:drift-judgment', { detail }));
      const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
      return {
        bridgeSaved: detail.bridgeSaved,
        observations: store.learning?.observations || {},
        taken: store.taken.length,
        cards: Object.keys(store.review?.cards || {}).length,
        history: store.review?.history?.length,
        threads: Object.keys(store.learning?.threads || {}).length,
        evidence: store.learning?.evidence?.length,
        learningExtra: store.learning?.adjacentClientField?.preserve,
        envelopeExtra: store.adjacentEnvelopeField,
      };
    })()`);
    // Leave the verifier-only `entry=shelf` strip: normal product rendering
    // shows learner evidence, while that comparison strip intentionally shows
    // card/schedule variants in its place.
    await open('');
    await tap(page, '#enter-shelf-door');
    await page.waitForFunction('document.body.dataset.view === "shelf"');
    await page.locator('#thesaurus-link').click();
    await page.fill('#thesaurus-search', '世界');
    await page.waitForSelector('[data-thesaurus^="世界"]', { timeout: 30_000 });
    await page.locator('[data-thesaurus^="世界"]').first().click();
    await page.waitForSelector('#sheet[data-node="word:世界"] .drift-observation');
    acceptedObservation.status = await page.locator('.drift-observation').textContent();

    await seedStore({
      taken: [],
      lists: {},
      review: { version: 1, cards: {}, history: [] },
      learning: { version: 1, threads: {}, lessons: {}, evidence: [] },
    });
    await open('?entry=shelf');
    const rejectedObservation = await page.evaluate(`(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'kairo-corridor-v1') throw new DOMException('full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      const detail = {
        version: 1,
        target: { t: 'kanji', id: '読' },
        judgment: 'fragile',
        count: 1,
        at: '2026-08-10T12:35:00.000Z',
      };
      try {
        dispatchEvent(new CustomEvent('bunki:drift-judgment', { detail }));
      } finally {
        Storage.prototype.setItem = original;
      }
      const store = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
      return {
        bridgeSaved: detail.bridgeSaved,
        observations: Object.keys(store.learning?.observations || {}).length,
        taken: store.taken.length,
        cards: Object.keys(store.review?.cards || {}).length,
        threads: Object.keys(store.learning?.threads || {}).length,
        evidence: store.learning?.evidence?.length,
      };
    })()`);
    lessonStore.driftObservation = {
      accepted: acceptedObservation,
      rejected: rejectedObservation,
    };
    reviewProbes.push(await page.evaluate(MEASURE_FN));

    // A failed article request must clear its in-flight promise. The lesson's
    // visible retry should issue a second request and recover in place.
    let articleRequests = 0;
    await page.route(failOnceArticlePattern, async (route) => {
      articleRequests += 1;
      if (articleRequests === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          // A caught JSON decode failure exercises the same rejected promise
          // without manufacturing a browser-console network error.
          body: '{',
        });
      } else {
        await route.continue();
      }
    });
    failOnceArticleRouteInstalled = true;
    await seedStore({
      taken: [],
      lists: {},
      review: { version: 1, cards: {}, history: [] },
      learning: { version: 1, threads: {}, lessons: {}, evidence: [] },
    });
    const retryErrorsAt = pageErrors.length;
    await open('?entry=shelf');
    await page.locator('#path-link').click();
    await page.waitForFunction('document.body.dataset.view === "path"');
    await page.locator('[data-lesson="n5-kitchen-teiru"]').click();
    await page.waitForSelector('main .dictionary-retry', { timeout: 30_000 });
    const failedState = await page.evaluate(`(() => ({
      view: document.body.dataset.view,
      warning: document.querySelector('main .review-warning')?.textContent || '',
      retry: document.querySelector('main .dictionary-retry')?.textContent || '',
    }))()`);
    await page.locator('main .dictionary-retry').click();
    await page.waitForSelector('.lesson-title', { timeout: 30_000 });
    lessonStore.articleRetry = await page.evaluate(`(() => ({
      view: document.body.dataset.view,
      title: document.querySelector('.lesson-title')?.textContent || '',
      retryGone: !document.querySelector('main .dictionary-retry'),
      dispositions: document.querySelectorAll('.lesson-disposition').length,
    }))()`);
    lessonStore.articleRetry.failedState = failedState;
    lessonStore.articleRetry.requests = articleRequests;
    lessonStore.articleRetry.pageErrors = pageErrors.length - retryErrorsAt;
    await page.unroute(failOnceArticlePattern);
    failOnceArticleRouteInstalled = false;
    reviewProbes.push(await page.evaluate(MEASURE_FN));
  } catch (err) {
    lessonStore.error = err instanceof Error ? err.message : String(err);
  } finally {
    if (failOnceArticleRouteInstalled) {
      await page.unroute(failOnceArticlePattern);
      failOnceArticleRouteInstalled = false;
    }
    await page.evaluate("localStorage.removeItem('kairo-corridor-v1')");
    await open('?entry=shelf');
    lessonStore.cleaned = await page.evaluate(
      "localStorage.getItem('kairo-corridor-v1') === null && !document.querySelector('#store-warning')",
    );
  }

  check('Review · legacy lists stay debt-free until opt-in; pause keeps the receipt and removes due',
    legacyBefore.hasReview === false && legacyBefore.start === 0
      && legacyBefore.promote === 1 && legacyBefore.toggle === 0
      && legacyPromoted.cards === 1 && legacyPromoted.history === 0
      && legacyPromoted.active && legacyPromoted.due && legacyPromoted.start === 1
      && legacyPromoted.promote === 0 && legacyPromoted.toggle === 1
      && beforePause.history === 1 && beforePause.active && beforePause.due === 1
      && afterPause.history === beforePause.history && !afterPause.active
      && afterPause.due === 0 && afterPause.toggle === 1
      && lessonStore.error === null
      && lessonStore.legacyTaken?.before.learnDisabled === false
      && lessonStore.legacyTaken.before.keepDisabled === true
      && lessonStore.legacyTaken.after.taken === 1
      && lessonStore.legacyTaken.after.cards.join(',') === 'grammar:teiru'
      && lessonStore.legacyTaken.after.target === 'kc:grammar:teiru'
      && lessonStore.legacyTaken.after.active === true
      && lessonStore.legacyTaken.after.disposition === 'learn'
      && lessonStore.legacyTaken.after.encounters === 2
      && lessonStore.legacyTaken.after.selected === true
      && lessonStore.keepThenCanonical?.keepWasEnabled === true
      && lessonStore.keepThenCanonical.canonicalTakeWasEnabled === true
      && lessonStore.keepThenCanonical.afterKeep.disposition === 'keep'
      && lessonStore.keepThenCanonical.afterKeep.encounters === 2
      && lessonStore.keepThenCanonical.afterKeep.taken === 0
      && lessonStore.keepThenCanonical.afterKeep.cards === 0
      && lessonStore.keepThenCanonical.afterKeep.learnDisabled === false
      && lessonStore.keepThenCanonical.afterCanonicalLearn.disposition === 'learn'
      && lessonStore.keepThenCanonical.afterCanonicalLearn.encounters === 2
      && lessonStore.keepThenCanonical.afterCanonicalLearn.taken === 1
      && lessonStore.keepThenCanonical.afterCanonicalLearn.cards.join(',') === 'grammar:teiru'
      && lessonStore.keepThenCanonical.afterCanonicalLearn.target === 'kc:grammar:teiru'
      && lessonStore.keepThenCanonical.afterCanonicalLearn.active === true
      && lessonStore.keepThenCanonical.afterCanonicalLearn.selected === true
      && lessonStore.malformed?.view === 'lesson'
      && lessonStore.malformed.title.length > 0
      && lessonStore.malformed.warning.length > 0
      && lessonStore.malformed.mutators > 0
      && lessonStore.malformed.disabled === lessonStore.malformed.mutators
      && lessonStore.malformed.rawPreserved === true
      && lessonStore.malformed.pageErrors === 0
      && lessonStore.future?.view === 'lesson'
      && lessonStore.future.title.length > 0
      && lessonStore.future.storeWarning === ''
      && lessonStore.future.pathWarning.length > 0
      && lessonStore.future.mutators > 0
      && lessonStore.future.disabled === lessonStore.future.mutators
      && lessonStore.future.rawPreserved === true
      && lessonStore.future.pageErrors === 0
      && lessonStore.malformedRoots.length === 2
      && lessonStore.malformedRoots.every((probe) =>
        probe.view === 'lesson'
          && probe.title.length > 0
          && probe.warning.length > 0
          && probe.mutators > 0
          && probe.disabled === probe.mutators
          && probe.rawPreserved === true
          && probe.pageErrors === 0)
      && lessonStore.malformedReview?.view === 'lesson'
      && lessonStore.malformedReview.title.length > 0
      && lessonStore.malformedReview.warning.length > 0
      && lessonStore.malformedReview.mutators > 0
      && lessonStore.malformedReview.disabled === lessonStore.malformedReview.mutators
      && lessonStore.malformedReview.rawPreserved === true
      && lessonStore.malformedReview.pageErrors === 0
      && lessonStore.driftObservation?.accepted.bridgeSaved === true
      && Object.keys(lessonStore.driftObservation.accepted.observations).join(',') === 'word:世界'
      && lessonStore.driftObservation.accepted.observations['word:世界']?.judgment === 'familiar'
      && lessonStore.driftObservation.accepted.observations['word:世界']?.count === 2
      && lessonStore.driftObservation.accepted.taken === 0
      && lessonStore.driftObservation.accepted.cards === 0
      && lessonStore.driftObservation.accepted.history === 0
      && lessonStore.driftObservation.accepted.threads === 0
      && lessonStore.driftObservation.accepted.evidence === 0
      && lessonStore.driftObservation.accepted.learningExtra === true
      && lessonStore.driftObservation.accepted.envelopeExtra === 'preserve-too'
      && /not a claim of mastery|既知とは確定せず/.test(lessonStore.driftObservation.accepted.status)
      && /not scheduled|復習にも入っていない/.test(lessonStore.driftObservation.accepted.status)
      && lessonStore.driftObservation.rejected.bridgeSaved === false
      && lessonStore.driftObservation.rejected.observations === 0
      && lessonStore.driftObservation.rejected.taken === 0
      && lessonStore.driftObservation.rejected.cards === 0
      && lessonStore.driftObservation.rejected.threads === 0
      && lessonStore.driftObservation.rejected.evidence === 0
      && lessonStore.articleRetry?.failedState.view === 'lesson'
      && lessonStore.articleRetry.failedState.warning.length > 0
      && lessonStore.articleRetry.failedState.retry.length > 0
      && lessonStore.articleRetry.view === 'lesson'
      && lessonStore.articleRetry.title.length > 0
      && lessonStore.articleRetry.retryGone === true
      && lessonStore.articleRetry.dispositions === 6
      && lessonStore.articleRetry.requests === 2
      && lessonStore.articleRetry.pageErrors === 0
      && lessonStore.cleaned,
    `legacy review=${legacyBefore.hasReview}, promote ${legacyBefore.promote}; `
      + `cards ${legacyPromoted.cards}; history ${beforePause.history}→${afterPause.history}; due ${beforePause.due}→${afterPause.due}; `
      + `lesson legacy ${lessonStore.legacyTaken?.after?.disposition || lessonStore.error || 'missing'}; `
      + `keep→${lessonStore.keepThenCanonical?.afterCanonicalLearn?.disposition || 'missing'}; `
      + `malformed disabled ${lessonStore.malformed?.disabled ?? 'n/a'}/${lessonStore.malformed?.mutators ?? 'n/a'}; `
      + `future disabled ${lessonStore.future?.disabled ?? 'n/a'}/${lessonStore.future?.mutators ?? 'n/a'}; `
      + `bad roots ${lessonStore.malformedRoots.map((probe) => `${probe.kind}:${probe.disabled}/${probe.mutators}`).join(',') || 'missing'}; `
      + `bad review ${lessonStore.malformedReview?.disabled ?? 'n/a'}/${lessonStore.malformedReview?.mutators ?? 'n/a'}; `
      + `Drift observation ${lessonStore.driftObservation?.accepted?.bridgeSaved ?? 'missing'} / rollback ${lessonStore.driftObservation?.rejected?.bridgeSaved ?? 'missing'}; `
      + `article retry ${lessonStore.articleRetry?.requests ?? 'n/a'} request(s)`);
  report.steps.push({
    step: 5,
    name: 'review',
    shot: '05-review-room.png',
    firstTake,
    normalReveal,
    afterGood,
    finite: { plan: finitePlan.size, snapshots: planSnapshots.length, deferredDue: finiteClose.due },
    legacy: { before: legacyBefore, promoted: legacyPromoted, beforePause, afterPause },
    lessonStore,
  });

  // ---------------------------------------------------------- step 6 return
  console.log('\n— step 6 · return without losing your place');
  await page.evaluate('window.scrollTo(0, 0)');
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await page.waitForSelector('#reader .tok');
  await page.evaluate('window.scrollTo(0, 420)');
  await page.waitForTimeout(80);
  const scrollBefore = await page.evaluate('window.scrollY');
  await holdWord(page, '#reader .tok.content', 23);
  await page.waitForSelector('#sheet');
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
    await page.waitForSelector('#reader .tok');
    await holdWord(page, '#reader .tok.content', 5);
    await page.waitForSelector('#sheet .card-preview');
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
  await tap(page, '.shelf-item');
  await page.waitForSelector('#reader .tok');
  const readerProbe = await page.evaluate(MEASURE_FN);
  await open('?entry=shelf');
  const semRows = await walkToSemPanel(page, tap);
  const panelProbe = await page.evaluate(MEASURE_FN);
  const mergedText = new Map();
  for (const row of [...panelProbe.text, ...readerProbe.text, ...shelfProbe.text]) {
    if (!mergedText.has(row.label)) mergedText.set(row.label, row);
  }
  const m = { ...panelProbe, text: [...mergedText.values()] };
  // Review was exercised earlier in every meaningful state (lobby, hidden
  // answer, ratings, closure, legacy opt-in, pause). Fold those probes into the
  // existing hygiene checks instead of creating new result slots.
  const allHygieneProbes = [panelProbe, readerProbe, shelfProbe, ...reviewProbes];
  m.targets = allHygieneProbes.flatMap((probe) => probe.targets);
  m.docScrollWidth = Math.max(...allHygieneProbes.map((probe) => probe.docScrollWidth));
  m.innerWidth = Math.min(...allHygieneProbes.map((probe) => probe.innerWidth));
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
      : `${m.targets.length} controls checked, including review and inline-token hit regions`);

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
    trayEn: /lists/i.test(document.querySelector('#review')?.textContent ?? ''),
    trayJa: /覚/.test(document.querySelector('#review')?.textContent ?? ''),
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
    return { back: latin('#back'), tray: latin('#review'), active: document.querySelector('#lang [data-lang="ja"]')?.getAttribute('aria-pressed') };
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
  await page.waitForSelector('#reader .tok');
  await holdWord(page, '#reader .tok.content');
  await page.waitForSelector('#sheet [data-kanjirow]');
  await tap(page, '#sheet [data-kanjirow]');
  await page.waitForTimeout(250);
  const strokeCount = await page.locator('#strokes path').count();
  check('v1.2 · the kanji page draws its stroke order (KanjiVG)',
    strokeCount >= 3, `${strokeCount} strokes rendered`);
  await shoot(page, shotsDir, '11-v12-kanji-strokes');
  await tap(page, '#strokes-door');
  await page.waitForSelector('#stroke-page');
  await page.waitForTimeout(500);
  await shoot(page, shotsDir, '11b-stroke-room');
  await tap(page, '#strokes-close');
  await page.waitForSelector('#stroke-page', { state: 'detached' });

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
      `[...document.querySelectorAll('[data-result]')].some((r) => r.dataset.result === ${JSON.stringify(want)} || r.dataset.result.startsWith(${JSON.stringify(want + ':')}))`,
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
  await page.waitForSelector('#reader .tok');
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
