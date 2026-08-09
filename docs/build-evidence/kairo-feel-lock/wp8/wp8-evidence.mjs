/**
 * WP8 · the full-screen stroke-order page — scripted evidence.
 *
 * Asserts on rendered DOM and measured pixels in real Chromium, never on "the
 * function returned". Reuses the corridor verifier's own static server and its
 * CDP touch dispatch, so the walk here is the same walk a finger takes.
 *
 * Usage: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node wp8-evidence.mjs
 * Output: ./shots/*.png and ./wp8-measurements.json next to this file.
 */
import console from 'node:console';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(HERE, '../../../../prototypes/corridor');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/** Same static server the corridor's own verifier uses — copied rather than
 * imported, because importing that module runs its whole 91-check suite. */
function startCorridorServer(rootDir = CORRIDOR_DIR) {
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
    server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}
const SHOTS = resolve(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };
const MIN_TAP = 44;

const results = [];
let failures = 0;
const measurements = {};
const noise = { console: [], pageerror: [], requestfailed: [] };

function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail) });
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}

function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      noise.console.push({ label, type: m.type(), text: m.text() });
    }
  });
  page.on('pageerror', (e) => noise.pageerror.push({ label, text: String(e) }));
  page.on('requestfailed', (r) =>
    noise.requestfailed.push({ label, url: r.url(), err: r.failure()?.errorText }),
  );
}

async function touchAt(page, selector, index, holdMs) {
  const target = page.locator(selector).nth(index);
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(60);
  const box = await target.evaluate((node) => {
    const r = node.getClientRects()[0] ?? node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box || !box.width) throw new Error(`touch: no box for ${selector}`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 6, radiusY: 6, force: 1 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  if (holdMs) await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(120);
}

const tap = (page, sel, i = 0) => touchAt(page, sel, i, 0);
const hold = async (page, sel, i = 0) => {
  await touchAt(page, sel, i, 2400);
  await page.waitForTimeout(200);
};

const shoot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

/** Everything the stroke page will admit about itself, read off the DOM. */
const PROBE = `(() => {
  const page = document.querySelector('#stroke-page');
  if (!page) return null;
  const inked = [...page.querySelectorAll('.stroke-ink path')].map((p) => {
    const len = Number(p.dataset.len) || 0;
    const off = parseFloat(p.style.strokeDashoffset || '0');
    return { len: Math.round(len * 10) / 10, off: Math.round(off * 10) / 10,
             drawn: len === 0 ? 0 : Math.round((1 - off / len) * 1000) / 1000 };
  });
  const counter = page.querySelector('#stroke-count');
  const nums = page.querySelector('.stroke-nums');
  const r = page.getBoundingClientRect();
  return {
    role: page.getAttribute('role'),
    ariaModal: page.getAttribute('aria-modal'),
    ariaLabel: page.getAttribute('aria-label'),
    kanji: page.dataset.kanji,
    state: page.dataset.state,
    motion: page.dataset.motion,
    numbers: page.dataset.numbers,
    strokes: Number(page.dataset.strokes),
    box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    counterText: counter ? counter.textContent : null,
    current: counter ? Number(counter.dataset.current) : null,
    total: counter ? Number(counter.dataset.total) : null,
    inked,
    fullyDrawn: inked.filter((s) => s.drawn > 0.999).length,
    untouched: inked.filter((s) => s.drawn < 0.001).length,
    numbersDisplay: nums ? getComputedStyle(nums).display : null,
    numbersVisible: nums ? [...nums.querySelectorAll('.stroke-num')]
      .filter((t) => Number(getComputedStyle(t).opacity) > 0.5).length : null,
    missingGlyph: (() => {
      const g = page.querySelector('.stroke-missing-glyph');
      if (!g) return null;
      return { text: g.textContent, fontSize: Math.round(parseFloat(getComputedStyle(g).fontSize)) };
    })(),
    missingLine: page.querySelector('.stroke-missing-line')?.textContent ?? null,
    missingNote: page.querySelector('.stroke-missing-note')?.textContent ?? null,
    activeId: document.activeElement ? (document.activeElement.id || document.activeElement.className) : null,
    behindInert: (() => {
      const out = {};
      for (const child of document.querySelector('#app').children) {
        const key = child.id || child.className || 'anon';
        out[key] = { inert: !!child.inert, ariaHidden: child.getAttribute('aria-hidden') };
      }
      return out;
    })(),
  };
})()`;

const TAP_PROBE = `(() => {
  const page = document.querySelector('#stroke-page');
  if (!page) return [];
  return [...page.querySelectorAll('button, [role=button], a')]
    .filter((n) => n.offsetParent !== null)
    .map((n) => {
      const r = n.getBoundingClientRect();
      return { id: n.id || n.className, text: (n.textContent || '').trim().slice(0, 18),
               w: Math.round(r.width), h: Math.round(r.height) };
    });
})()`;

const THEME_PROBE = `(() => {
  const cs = (sel, prop) => {
    const n = document.querySelector(sel);
    return n ? getComputedStyle(n)[prop] : null;
  };
  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return {
    bodyClasses: document.body.className,
    tokens: { ink: token('--ink'), ink2: token('--ink-2'), ground: token('--ground'),
              ground0: token('--ground-0'), ground2: token('--ground-2'),
              line: token('--line'), faint: token('--faint'), ai: token('--ai') },
    paperPage: cs('#stroke-page', 'backgroundColor'),
    paperCanvas: cs('.stroke-canvas', 'backgroundColor'),
    inkStroke: cs('.stroke-ink path', 'stroke'),
    guideStroke: cs('.stroke-guide path', 'stroke'),
    numFill: cs('.stroke-num', 'fill'),
    metaColor: cs('.stroke-meta', 'color'),
    countColor: cs('.stroke-count', 'color'),
    replayColor: cs('#stroke-replay', 'color'),
  };
})()`;

/** reader → hold a content word → tap its kanji row → the kanji sheet. */
async function walkToKanjiSheet(page, base, open) {
  await open('?entry=shelf');
  await tap(page, '.shelf-item');
  await page.waitForSelector('#reader .tok');
  await hold(page, '#reader .tok.content');
  await page.waitForSelector('#sheet [data-kanjirow]');
  await tap(page, '#sheet [data-kanjirow]');
  await page.waitForTimeout(250);
  return page.locator('#sheet').getAttribute('data-node');
}

/** search → a kanji result → its sheet (the only door to the rarer characters). */
async function searchToKanjiSheet(page, open, ch) {
  await open('?entry=shelf');
  await page.fill('#search', ch);
  await page.waitForTimeout(400);
  const sel = `[data-result="kanji:${ch}"]`;
  await page.waitForSelector(sel, { timeout: 5000 });
  await page.locator(sel).click();
  await page.waitForTimeout(300);
  return page.locator('#sheet').getAttribute('data-node');
}

/** The census, straight out of the two shipped layers — not from memory. */
function strokeCensus() {
  const strokes = JSON.parse(readFileSync(join(CORRIDOR_DIR, 'data/share_alike/strokes.json'), 'utf8'));
  const kanji = JSON.parse(readFileSync(join(CORRIDOR_DIR, 'data/share_alike/kanji.json'), 'utf8'));
  const chars = Object.keys(kanji.kanji);
  const withData = chars.filter((c) => strokes.strokes[c]?.length);
  const without = chars.filter((c) => !strokes.strokes[c]?.length);
  return {
    kanjiInLayer: chars.length,
    withStrokeData: withData.length,
    withoutStrokeData: without.length,
    strokeKeysNotInKanjiLayer: Object.keys(strokes.strokes).filter((c) => !(c in kanji.kanji)),
    firstTwentyWithout: without.slice(0, 20),
  };
}

async function main() {
  measurements.census = strokeCensus();
  console.log(
    `— census: ${measurements.census.withoutStrokeData} of ${measurements.census.kanjiInLayer} kanji have no KanjiVG paths`,
  );
  const { server, base } = await startCorridorServer();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--font-render-hinting=none'],
  });

  const newPhone = async (extra = {}) => {
    const context = await browser.newContext({
      viewport: PHONE,
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
      ...extra,
    });
    const page = await context.newPage();
    return { context, page };
  };

  /* =============================================== 1 · a kanji WITH strokes */
  console.log('\n— 1 · a kanji with stroke data: it draws itself');
  {
    const { context, page } = await newPhone();
    watch(page, 'A1');
    const open = async (q = '') => {
      await page.goto(`${base}/${q}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('document.body.dataset.ready === "1"');
      await page.waitForTimeout(150);
    };
    const node = await walkToKanjiSheet(page, base, open);
    measurements.a1 = { sheetNode: node };

    const doorBox = await page.locator('#strokes-door').boundingBox();
    const doorStrokes = await page.locator('#strokes path').count();
    check('1 · the kanji sheet still carries the KanjiVG diagram, now as a door',
      doorStrokes >= 3 && doorBox.height >= MIN_TAP,
      `${node}: ${doorStrokes} paths, door ${Math.round(doorBox.width)}×${Math.round(doorBox.height)}px`);
    measurements.a1.door = { paths: doorStrokes, w: Math.round(doorBox.width), h: Math.round(doorBox.height) };
    await shoot(page, '01-kanji-sheet-with-door');

    await tap(page, '#strokes-door');
    await page.waitForSelector('#stroke-page');
    const t0 = await page.evaluate(PROBE);
    await shoot(page, '02-strokes-start');

    check('1 · the page is a full-screen dialog',
      t0.role === 'dialog' && t0.ariaModal === 'true' &&
      t0.box.w === t0.viewport.w && t0.box.h === t0.viewport.h && t0.box.x === 0 && t0.box.y === 0,
      `role=${t0.role} modal=${t0.ariaModal} box ${t0.box.w}×${t0.box.h} vs viewport ${t0.viewport.w}×${t0.viewport.h}`);
    check('1 · focus lands inside the page, everything behind it is inert',
      t0.activeId === 'strokes-back' &&
      Object.entries(t0.behindInert).every(([k, v]) => k === 'stroke-page' ? !v.inert : v.inert),
      `focus=${t0.activeId}; ${JSON.stringify(t0.behindInert)}`);
    check('1 · at the start nothing is drawn yet',
      t0.fullyDrawn === 0 && t0.untouched >= t0.strokes - 1 && t0.current <= 1,
      `${t0.counterText}, drawn=${t0.fullyDrawn}/${t0.strokes}, untouched=${t0.untouched}`);

    // sample the middle of the animation
    await page.waitForTimeout(Math.max(400, t0.strokes * 120));
    const tMid = await page.evaluate(PROBE);
    await shoot(page, '03-strokes-mid');
    check('1 · mid-flight the strokes are partly drawn, in order',
      tMid.state === 'drawing' && tMid.fullyDrawn > 0 && tMid.fullyDrawn < tMid.strokes &&
      tMid.current > t0.current,
      `${tMid.counterText}, drawn=${tMid.fullyDrawn}/${tMid.strokes}, state=${tMid.state}`);
    const prefixOrder = tMid.inked.every((s, i) =>
      i < tMid.fullyDrawn ? s.drawn > 0.999 : true);
    check('1 · the ink arrives strictly in stroke order (a drawn prefix, never a gap)',
      prefixOrder, `first ${tMid.fullyDrawn} complete, remainder ${tMid.inked.slice(tMid.fullyDrawn).map((s) => s.drawn).join(', ')}`);

    await page.waitForFunction(`document.querySelector('#stroke-page')?.dataset.state === 'done'`, null, { timeout: 30000 });
    const tEnd = await page.evaluate(PROBE);
    await shoot(page, '04-strokes-end');
    check('1 · at the end every stroke is complete and the counter reads n/n',
      tEnd.fullyDrawn === tEnd.strokes && tEnd.current === tEnd.total && tEnd.state === 'done',
      `${tEnd.counterText}, drawn=${tEnd.fullyDrawn}/${tEnd.strokes}`);
    measurements.a1.timeline = { start: t0, mid: tMid, end: tEnd };

    // replay
    await tap(page, '#stroke-replay');
    await page.waitForTimeout(120);
    const replayEarly = await page.evaluate(PROBE);
    await shoot(page, '05-strokes-replay-early');
    check('1 · replay starts the hand over from the first stroke',
      replayEarly.fullyDrawn < tEnd.strokes && replayEarly.current <= 2 && replayEarly.state === 'drawing',
      `after replay: ${replayEarly.counterText}, drawn=${replayEarly.fullyDrawn}/${replayEarly.strokes}`);
    await page.waitForFunction(`document.querySelector('#stroke-page')?.dataset.state === 'done'`, null, { timeout: 30000 });
    const replayEnd = await page.evaluate(PROBE);
    check('1 · replay finishes the whole glyph again',
      replayEnd.fullyDrawn === replayEnd.strokes && replayEnd.current === replayEnd.total,
      replayEnd.counterText);
    measurements.a1.replay = { early: replayEarly, end: replayEnd };

    // stroke-number toggle
    const numsOn = await page.evaluate(PROBE);
    await tap(page, '#stroke-numbers');
    await page.waitForTimeout(150);
    const numsOff = await page.evaluate(PROBE);
    await shoot(page, '06-strokes-numbers-off');
    await tap(page, '#stroke-numbers');
    await page.waitForTimeout(150);
    const numsBack = await page.evaluate(PROBE);
    check('1 · the stroke-number toggle really removes and restores the numbers',
      numsOn.numbersDisplay !== 'none' && numsOn.numbersVisible === numsOn.strokes &&
      numsOff.numbersDisplay === 'none' && numsBack.numbersDisplay !== 'none' &&
      numsBack.numbersVisible === numsBack.strokes,
      `on: display=${numsOn.numbersDisplay} shown=${numsOn.numbersVisible} → off: display=${numsOff.numbersDisplay} → on again: display=${numsBack.numbersDisplay} shown=${numsBack.numbersVisible}`);
    measurements.a1.numbers = { on: numsOn.numbersVisible, offDisplay: numsOff.numbersDisplay, back: numsBack.numbersVisible };

    /* ---------------------------------------------- 5 · hit targets (phone) */
    const taps = await page.evaluate(TAP_PROBE);
    const small = taps.filter((t) => t.w < MIN_TAP || t.h < MIN_TAP);
    check(`5 · every control on the page is at least ${MIN_TAP}px (390px touch)`,
      small.length === 0,
      small.length ? small.map((t) => `${t.id} ${t.w}×${t.h}`).join(', ')
        : taps.map((t) => `${t.id} ${t.w}×${t.h}`).join(' · '));
    measurements.taps = { phone: taps };

    /* --------------------------------- 4 · back returns the sheet untouched */
    console.log('\n— 4 · back returns the kanji sheet exactly where it was');
    await tap(page, '#strokes-back');
    await page.waitForTimeout(250);
    check('4 · back closes the page and the kanji sheet is standing again',
      (await page.locator('#stroke-page').count()) === 0 &&
      (await page.locator('#sheet').getAttribute('data-node')) === node,
      `sheet=${await page.locator('#sheet').getAttribute('data-node')}`);

    // now with the sheet deliberately scrolled away from the top
    const scrolled = await page.evaluate(`(() => {
      const s = document.querySelector('#sheet');
      s.scrollTop = Math.round(s.scrollHeight * 0.45);
      return { scrollTop: s.scrollTop, scrollHeight: s.scrollHeight, winY: window.scrollY,
               chars: s.textContent.length, buttons: s.querySelectorAll('button').length };
    })()`);
    await page.waitForTimeout(120);
    await page.evaluate(`document.querySelector('#strokes-door').click()`);
    await page.waitForSelector('#stroke-page');
    await page.waitForTimeout(200);

    // focus never escapes the dialog, forwards or backwards
    const ring = [];
    for (let i = 0; i < 7; i += 1) {
      await page.keyboard.press('Tab');
      ring.push(await page.evaluate(
        `(() => { const a = document.activeElement; return { id: a?.id || a?.tagName,
          inside: !!document.querySelector('#stroke-page')?.contains(a) }; })()`));
    }
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Shift+Tab');
      ring.push(await page.evaluate(
        `(() => { const a = document.activeElement; return { id: a?.id || a?.tagName,
          inside: !!document.querySelector('#stroke-page')?.contains(a) }; })()`));
    }
    check('4 · focus is trapped inside the page (10 Tab/Shift-Tab presses)',
      ring.every((r) => r.inside), ring.map((r) => r.id).join(' → '));
    measurements.a4focus = ring;

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const after = await page.evaluate(`(() => {
      const s = document.querySelector('#sheet');
      return { present: !!s, node: s?.dataset.node, scrollTop: s ? s.scrollTop : null,
               winY: window.scrollY, active: document.activeElement?.id || null,
               page: !!document.querySelector('#stroke-page'),
               chars: s ? s.textContent.length : null,
               buttons: s ? s.querySelectorAll('button').length : null };
    })()`);
    check('4 · Escape returns to the same sheet at the identical scroll position',
      !after.page && after.node === node && after.scrollTop === scrolled.scrollTop &&
      after.winY === scrolled.winY,
      `sheet scrollTop ${scrolled.scrollTop} → ${after.scrollTop} (of ${scrolled.scrollHeight}); window ${scrolled.winY} → ${after.winY}`);
    check('4 · and the sheet itself came back identical (same text, same doors)',
      after.chars === scrolled.chars && after.buttons === scrolled.buttons,
      `${scrolled.chars} chars / ${scrolled.buttons} buttons → ${after.chars} / ${after.buttons}`);
    check('4 · focus returns to the door that was pressed',
      after.active === 'strokes-door', `activeElement = #${after.active}`);
    measurements.a4 = { before: scrolled, after };
    await shoot(page, '07-back-to-sheet-same-place');

    await context.close();
  }

  /* ========================================== 2 · a kanji WITHOUT stroke data */
  console.log('\n— 2 · one of the 448 with no KanjiVG paths');
  {
    const { context, page } = await newPhone();
    watch(page, 'A2');
    const open = async (q = '') => {
      await page.goto(`${base}/${q}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('document.body.dataset.ready === "1"');
      await page.waitForTimeout(150);
    };
    const target = process.env.WP8_NOSTROKE || '丑';
    const node = await searchToKanjiSheet(page, open, target);
    const doorInfo = await page.evaluate(`(() => {
      const d = document.querySelector('#strokes-door');
      const r = d.getBoundingClientRect();
      return { strokes: d.dataset.strokes, label: d.getAttribute('aria-label'),
               text: d.textContent, w: Math.round(r.width), h: Math.round(r.height),
               svg: !!d.querySelector('svg') };
    })()`);
    check('2 · the door exists for a kanji with no stroke data, and says so',
      doorInfo.strokes === '0' && !doorInfo.svg && doorInfo.h >= MIN_TAP &&
      /not yet available/.test(doorInfo.label),
      `${node}: door ${doorInfo.w}×${doorInfo.h}px — "${doorInfo.text.replace(/\s+/g, ' ')}"`);
    await shoot(page, '08-nodata-sheet-door');

    await tap(page, '#strokes-door');
    await page.waitForSelector('#stroke-page');
    await page.waitForTimeout(250);
    const probe = await page.evaluate(PROBE);
    await shoot(page, '09-nodata-page-en');
    check('2 · the page degrades honestly: the glyph large, the absence stated',
      probe.state === 'nodata' && probe.strokes === 0 &&
      probe.missingGlyph && probe.missingGlyph.text === target && probe.missingGlyph.fontSize >= 120 &&
      /not yet available/i.test(probe.missingLine || ''),
      `${target}: glyph ${probe.missingGlyph?.fontSize}px, line "${probe.missingLine}", note "${probe.missingNote}"`);
    check('2 · the fallback page is still a full-screen dialog with a way out',
      probe.role === 'dialog' && probe.box.w === probe.viewport.w &&
      (await page.locator('#strokes-back').count()) === 1 &&
      (await page.locator('#strokes-close').count()) === 1,
      `box ${probe.box.w}×${probe.box.h}`);
    measurements.a2 = { kanji: target, sheetNode: node, door: doorInfo, page: probe };

    // and in 日本語のみ — the honest line must exist in both languages
    await page.goto(`${base}/?ui=ja&entry=shelf`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('document.body.dataset.ready === "1"');
    await page.fill('#search', target);
    await page.waitForTimeout(400);
    await page.locator(`[data-result="kanji:${target}"]`).click();
    await page.waitForTimeout(300);
    await page.evaluate(`document.querySelector('#strokes-door').click()`);
    await page.waitForSelector('#stroke-page');
    await page.waitForTimeout(200);
    const ja = await page.evaluate(PROBE);
    await shoot(page, '10-nodata-page-ja');
    check('2 · the same honesty in 日本語のみ (tx() both ways)',
      /筆順のデータはまだない/.test(ja.missingLine || ''), `"${ja.missingLine}" / "${ja.missingNote}"`);
    measurements.a2.ja = { line: ja.missingLine, note: ja.missingNote };

    await context.close();
  }

  /* ================================================= 3 · reduced motion */
  console.log('\n— 3 · prefers-reduced-motion: no drawing, step through by hand');
  {
    const { context, page } = await newPhone({ reducedMotion: 'reduce' });
    watch(page, 'A3');
    const open = async (q = '') => {
      await page.goto(`${base}/${q}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('document.body.dataset.ready === "1"');
      await page.waitForTimeout(150);
    };
    const node = await walkToKanjiSheet(page, base, open);
    await tap(page, '#strokes-door');
    await page.waitForSelector('#stroke-page');
    await page.waitForTimeout(60);
    const immediate = await page.evaluate(PROBE);
    await page.waitForTimeout(900);
    const later = await page.evaluate(PROBE);
    await shoot(page, '11-reduced-immediate');
    check('3 · reduced motion shows the finished glyph immediately and never animates',
      immediate.motion === 'reduced' && immediate.state === 'static' &&
      immediate.fullyDrawn === immediate.strokes &&
      later.fullyDrawn === later.strokes && later.counterText === immediate.counterText,
      `${node}: at 60ms ${immediate.counterText} drawn=${immediate.fullyDrawn}/${immediate.strokes}; at 960ms ${later.counterText} drawn=${later.fullyDrawn}`);
    check('3 · replay is absent; prev/next take its place',
      (await page.locator('#stroke-replay').count()) === 0 &&
      (await page.locator('#stroke-prev').count()) === 1 &&
      (await page.locator('#stroke-next').count()) === 1,
      'stroke-prev + stroke-next present, stroke-replay absent');

    const steps = [];
    for (let i = 0; i < 3; i += 1) {
      await tap(page, '#stroke-prev');
      await page.waitForTimeout(80);
      steps.push(await page.evaluate(PROBE));
    }
    await shoot(page, '12-reduced-stepped-back');
    const stepsDown = steps.every((s, i) =>
      s.current === immediate.total - (i + 1) && s.fullyDrawn === s.current);
    check('3 · step-through walks back one stroke at a time',
      stepsDown, steps.map((s) => `${s.counterText}(drawn ${s.fullyDrawn})`).join(' → '));
    await tap(page, '#stroke-next');
    await page.waitForTimeout(80);
    const forward = await page.evaluate(PROBE);
    check('3 · step-through walks forward again',
      forward.current === steps[steps.length - 1].current + 1 &&
      forward.fullyDrawn === forward.current,
      `${steps[steps.length - 1].counterText} → ${forward.counterText}`);
    await shoot(page, '13-reduced-stepped-forward');

    // clamp at stroke 1 and at n
    for (let i = 0; i < immediate.total + 3; i += 1) {
      await page.evaluate(`document.querySelector('#stroke-prev')?.click()`);
    }
    const floor = await page.evaluate(PROBE);
    check('3 · the step-through never runs off either end',
      floor.current === 1 && (await page.locator('#stroke-prev').isDisabled()),
      `floor at ${floor.counterText}, prev disabled=${await page.locator('#stroke-prev').isDisabled()}`);

    const taps = await page.evaluate(TAP_PROBE);
    const small = taps.filter((t) => t.w < MIN_TAP || t.h < MIN_TAP);
    check(`5 · reduced-motion controls also clear ${MIN_TAP}px`,
      small.length === 0,
      small.length ? small.map((t) => `${t.id} ${t.w}×${t.h}`).join(', ')
        : taps.map((t) => `${t.id} ${t.w}×${t.h}`).join(' · '));
    measurements.a3 = { immediate, later, steps, forward, floor };
    measurements.taps.reduced = taps;

    await context.close();
  }

  /* ============================================ 6 · both themes, and desktop */
  console.log('\n— 6 · ink and paper follow the active theme');
  {
    const themes = [
      ['layered-wcag', '?entry=shelf&depth=layered&contrast=wcag'],
      ['flat-fade', '?entry=shelf&depth=flat&contrast=current'],
    ];
    measurements.themes = {};
    for (const [name, query] of themes) {
      const { context, page } = await newPhone();
      watch(page, `A6:${name}`);
      const open = async (q = '') => {
        await page.goto(`${base}/${q}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction('document.body.dataset.ready === "1"');
        await page.waitForTimeout(150);
      };
      await walkToKanjiSheet(page, base, open);
      // the walk resets the query string, so re-enter through the same variant
      await page.goto(`${base}/${query}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('document.body.dataset.ready === "1"');
      await tap(page, '.shelf-item');
      await page.waitForSelector('#reader .tok');
      await hold(page, '#reader .tok.content');
      await page.waitForSelector('#sheet [data-kanjirow]');
      await tap(page, '#sheet [data-kanjirow]');
      await page.waitForTimeout(250);
      await tap(page, '#strokes-door');
      await page.waitForSelector('#stroke-page');
      await page.waitForFunction(`document.querySelector('#stroke-page')?.dataset.state === 'done'`, null, { timeout: 30000 });
      const theme = await page.evaluate(THEME_PROBE);
      await shoot(page, `14-theme-${name}`);
      measurements.themes[name] = theme;
      const rgb = (hex) => {
        const h = hex.replace('#', '');
        return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
      };
      check(`6 · ${name}: the ink is exactly the theme's --ink`,
        theme.inkStroke === rgb(theme.tokens.ink), `${theme.inkStroke} === --ink ${theme.tokens.ink}`);
      check(`6 · ${name}: the writing square is exactly the theme's raised paper --ground-0`,
        theme.paperCanvas === rgb(theme.tokens.ground0),
        `${theme.paperCanvas} === --ground-0 ${theme.tokens.ground0}`);
      const expectedPage = name === 'layered-wcag' ? theme.tokens.ground2 : theme.tokens.ground;
      check(`6 · ${name}: the page's own ground follows the depth variant`,
        theme.paperPage === rgb(expectedPage),
        `${theme.paperPage} === ${name === 'layered-wcag' ? '--ground-2' : '--ground'} ${expectedPage}`);
      await context.close();
    }
    const a = measurements.themes['layered-wcag'];
    const b = measurements.themes['flat-fade'];
    check('6 · the two themes really do paint differently (paper + faint text)',
      a.paperPage !== b.paperPage && a.metaColor !== b.metaColor,
      `paper ${a.paperPage} vs ${b.paperPage}; faint text ${a.metaColor} vs ${b.metaColor}`);
  }

  /* ------------------------------------------------------------ desktop 1280 */
  console.log('\n— 1280 desktop');
  {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();
    watch(page, 'desktop');
    await page.goto(`${base}/?entry=shelf`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('document.body.dataset.ready === "1"');
    await page.locator('.shelf-item').first().click();
    await page.waitForSelector('#reader .tok');
    await page.evaluate(`(() => {
      const t = document.querySelector('#reader .tok.content');
      t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    })()`);
    await page.waitForTimeout(200);
    // keyboard route may not open the sheet on every build — fall back to search
    if (!(await page.locator('#sheet').count())) {
      await page.goto(`${base}/?entry=shelf`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction('document.body.dataset.ready === "1"');
      await page.fill('#search', '開');
      await page.waitForTimeout(400);
      await page.locator('[data-result="kanji:開"]').click();
      await page.waitForTimeout(300);
    } else if (!(await page.locator('#strokes-door').count())) {
      await page.locator('#sheet [data-kanjirow]').first().click();
      await page.waitForTimeout(250);
    }
    await page.locator('#strokes-door').click();
    await page.waitForSelector('#stroke-page');
    await page.waitForTimeout(400);
    await shoot(page, '15-desktop-1280-mid');
    await page.waitForFunction(`document.querySelector('#stroke-page')?.dataset.state === 'done'`, null, { timeout: 30000 });
    const probe = await page.evaluate(PROBE);
    const taps = await page.evaluate(TAP_PROBE);
    await shoot(page, '16-desktop-1280-end');
    check('1280 · the page fills the desktop viewport and completes',
      probe.box.w === DESKTOP.width && probe.box.h === DESKTOP.height &&
      probe.fullyDrawn === probe.strokes,
      `${probe.kanji}: ${probe.box.w}×${probe.box.h}, ${probe.counterText}`);
    const small = taps.filter((t) => t.w < MIN_TAP || t.h < MIN_TAP);
    check(`5 · desktop controls clear ${MIN_TAP}px too`, small.length === 0,
      small.length ? small.map((t) => `${t.id} ${t.w}×${t.h}`).join(', ')
        : taps.map((t) => `${t.id} ${t.w}×${t.h}`).join(' · '));

    // keyboard: Escape from a keyboard-opened page
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('1280 · Escape closes the page from the keyboard',
      (await page.locator('#stroke-page').count()) === 0 &&
      (await page.locator('#sheet').count()) === 1, 'sheet still standing');
    measurements.desktop = { page: probe, taps };
    await context.close();
  }

  /* --------------------------------------------------------------- hygiene */
  check('7 · zero console errors, page errors, or failed requests throughout',
    noise.console.length === 0 && noise.pageerror.length === 0 && noise.requestfailed.length === 0,
    `console=${noise.console.length} pageerror=${noise.pageerror.length} requestfailed=${noise.requestfailed.length}` +
    (noise.console.length ? ` :: ${JSON.stringify(noise.console.slice(0, 4))}` : '') +
    (noise.pageerror.length ? ` :: ${JSON.stringify(noise.pageerror.slice(0, 4))}` : ''));

  await browser.close();
  server.close();

  const report = {
    generated: new Date().toISOString(),
    viewports: { phone: PHONE, desktop: DESKTOP },
    minTap: MIN_TAP,
    checks: results,
    passed: results.filter((r) => r.pass).length,
    total: results.length,
    measurements,
    noise,
  };
  writeFileSync(resolve(HERE, 'wp8-measurements.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${report.passed}/${report.total} checks passed`);
  console.log(`shots → ${SHOTS}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
