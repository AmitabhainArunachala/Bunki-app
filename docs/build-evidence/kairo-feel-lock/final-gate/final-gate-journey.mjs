/**
 * FINAL GATE — the full user-journey QA for the KAIRO/Bunki feel-lock campaign.
 *
 * Drives the COMMITTED deliverable, prototypes/corridor/corridor-standalone.html,
 * in real Chromium at 390x844 with CDP touch and at 320 / 1280 widths, taking a
 * numbered screenshot at every step of the 20-stage gate journey.
 *
 * This is a VERIFIER. Every check asserts on RENDERED PIXELS or real DOM state.
 * "The function returned successfully" is never evidence here.
 *
 * Interaction mechanics follow the two instruments that already live in this
 * repo, because the drift field is a moving target and naive taps miss:
 *   - words are found by their .base glyph text and their live centre is read
 *     immediately before the touch (verify-drift-consistency.mjs's wordProbe)
 *   - after a bloom the satellites glide for ~1.4s before they can be tapped
 *   - camera zoom is read off the rendered word transforms (the camera scale
 *     is baked into every word's matrix), rotation off the angle between two
 *     tracked words, pan off the field centroid — the corridor build wraps its
 *     drift layer in an IIFE, so `cam` is not reachable and geometry is the
 *     honest instrument anyway
 *
 * Console errors and page errors are a GLOBAL gate, attributed per stage.
 *
 * Usage: node final-gate-journey.mjs [--shots DIR] [--out FILE]
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..', '..');
const TARGET = resolve(REPO, 'prototypes', 'corridor', 'corridor-standalone.html');

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const SHOTS = resolve(argOf('--shots', join(HERE, 'shots')));
const OUT = resolve(argOf('--out', join(HERE, 'final-gate-results.json')));
mkdirSync(SHOTS, { recursive: true });

const MOBILE = { width: 390, height: 844 };

/* ------------------------------------------------------------- harness */
const results = [];
let stage = 'setup';
const stageErrors = new Map();

function noteError(msg) {
  const list = stageErrors.get(stage) ?? [];
  list.push(msg);
  stageErrors.set(stage, list);
}
const errCount = () => stageErrors.get(stage)?.length ?? 0;

function check(item, name, pass, detail = '', shot = '') {
  results.push({ item, stage, name, pass: !!pass, detail: String(detail), shot });
  console.log(`${pass ? '  ok  ' : ' FAIL '} [${item}] ${name}${detail ? `  — ${detail}` : ''}`);
}

let shotSeq = 0;
async function shoot(page, label) {
  shotSeq += 1;
  const file = join(SHOTS, `${String(shotSeq).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file });
  return file.replace(REPO + '/', '');
}

/* --------------------------------------------------------------- server */
function startServer() {
  const html = readFileSync(TARGET);
  const server = createServer((req, res) => {
    res.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}

/* ---------------------------------------------------------- CDP gestures */
function gestures(page, cdp) {
  const wait = (ms) => page.waitForTimeout(ms);
  const touch = (type, pts) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: pts.map((p) => ({ x: p.x, y: p.y, radiusX: 6, radiusY: 6, force: 1 })),
    });

  // every gesture starts from a clean touch state, exactly as verify-v11 does:
  // a leftover live touch silently swallows the next gesture's first move
  const clearTouch = async () => { try { await touch('touchEnd', []); } catch { /* nothing live */ } };

  const tapAt = async (x, y, holdMs = 0) => {
    await clearTouch();
    await touch('touchStart', [{ x, y }]);
    if (holdMs) await wait(holdMs);
    await touch('touchEnd', []);
    await wait(200);
  };
  const doubleTapAt = async (x, y) => {
    await tapAt(x, y);
    await wait(90);
    await tapAt(x, y);
    await wait(1600);
  };
  const swipe = async (x1, y1, x2, y2, steps = 12) => {
    await clearTouch();
    await touch('touchStart', [{ x: x1, y: y1 }]);
    for (let i = 1; i <= steps; i += 1) {
      await touch('touchMove', [{ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps }]);
      await wait(16);
    }
    await touch('touchEnd', []);
    await wait(500);
  };
  // vertical pinch, clear of #lvl on the left and #theme top-right
  const pinch = async (cx, cy, from, to, steps = 16) => {
    await clearTouch();
    let d = from;
    await touch('touchStart', [{ x: cx, y: cy - d }, { x: cx, y: cy + d }]);
    for (let i = 1; i <= steps; i += 1) {
      d = from + ((to - from) * i) / steps;
      await touch('touchMove', [{ x: cx, y: cy - d }, { x: cx, y: cy + d }]);
      await wait(16);
    }
    await touch('touchEnd', []);
    await wait(400);
  };
  // the drift layer's judgment is a FLICK: held < 330 ms, or faster than
  // 0.45 px/ms, and more than 52 px horizontally. No inter-move waits here.
  const flick = async (x1, y1, dx, steps = 3) => {
    await clearTouch();
    await touch('touchStart', [{ x: x1, y: y1 }]);
    for (let i = 1; i <= steps; i += 1) await touch('touchMove', [{ x: x1 + (dx * i) / steps, y: y1 }]);
    await touch('touchEnd', []);
    await wait(700);
  };
  const twist = async (cx, cy, deg, steps = 14) => {
    await clearTouch();
    const r = 130;
    await touch('touchStart', [{ x: cx - r, y: cy }, { x: cx + r, y: cy }]);
    for (let i = 1; i <= steps; i += 1) {
      const a = ((deg * Math.PI) / 180) * (i / steps);
      await touch('touchMove', [
        { x: cx - r * Math.cos(a), y: cy - r * Math.sin(a) },
        { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) },
      ]);
      await wait(14);
    }
    await touch('touchEnd', []);
    await wait(300);
  };
  return { tapAt, doubleTapAt, swipe, flick, pinch, twist, wait };
}

/** Tap a DOM element by selector, aiming at its first line fragment.
 *
 * scrollIntoViewIfNeeded parks an element flush with the top of the viewport,
 * which on this surface is UNDER the fixed chrome bar — the touch then lands on
 * the chrome and the tap is silently lost. So after scrolling we hit-test the
 * aim point and, if something else is on top, nudge the window until the
 * element itself answers at that point. */
async function tapSel(page, g, selector, index = 0, holdMs = 0) {
  const loc = page.locator(selector).nth(index);
  await loc.waitFor({ state: 'attached', timeout: 8000 });
  await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(120);
  const aim = await loc.evaluate((n) => {
    const boxOf = () => {
      const r = n.getClientRects()[0] ?? n.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
    };
    let b = boxOf();
    for (let i = 0; i < 6; i += 1) {
      const hit = document.elementFromPoint(b.x, b.y);
      if (hit && (hit === n || n.contains(hit) || hit.contains(n))) return { ...b, clear: true };
      // scroll the element toward the middle of the viewport and look again
      window.scrollBy(0, b.y - window.innerHeight / 2);
      b = boxOf();
    }
    return { ...b, clear: false };
  });
  if (!aim || !aim.w) throw new Error(`tapSel: no box for ${selector}[${index}]`);
  await page.waitForTimeout(120);
  const final = await loc.evaluate((n) => {
    const r = n.getClientRects()[0] ?? n.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await g.tapAt(final.x, final.y, holdMs);
}

/** how deep the dive stack is — the depth readout is a breadcrumb, not a number */
const depthOf = (text) => (String(text).trim() ? String(text).replace(/\s*∞\s*$/, '').split('›').length : 0);

/** best-fit ensemble rotation between two labelled point clouds (2D Kabsch).
 * Only words present in BOTH snapshots take part, so the field's own respawn
 * cannot manufacture or hide a rotation. */
function fitRotation(before, after) {
  const map = new Map(before.map((b) => [b[0], b]));
  const pairs = [];
  for (const a of after) {
    const b = map.get(a[0]);
    if (b) pairs.push([b, a]);
  }
  if (pairs.length < 4) return { rad: null, n: pairs.length };
  const mean = (arr, i) => arr.reduce((s, p) => s + p[i], 0) / arr.length;
  const bx = mean(pairs.map((p) => p[0]), 1);
  const by = mean(pairs.map((p) => p[0]), 2);
  const ax = mean(pairs.map((p) => p[1]), 1);
  const ay = mean(pairs.map((p) => p[1]), 2);
  let num = 0;
  let den = 0;
  for (const [b, a] of pairs) {
    const ux = b[1] - bx;
    const uy = b[2] - by;
    const vx = a[1] - ax;
    const vy = a[2] - ay;
    num += ux * vy - uy * vx;
    den += ux * vx + uy * vy;
  }
  return { rad: Math.atan2(num, den), n: pairs.length };
}

const wordCloud = (page) =>
  page.evaluate(`(() => [...document.querySelectorAll('#drift-layer .word')].map((w) => {
    const r = w.getBoundingClientRect();
    return [w.querySelector('.base')?.textContent ?? '', r.x + r.width / 2, r.y + r.height / 2];
  }).filter((n) => n[0]))()`);

/** tap open water until the dive stack is empty (a water tap is the way up) */
async function surfaceFully(page, g, tries = 8) {
  for (let i = 0; i < tries; i += 1) {
    const st = await page.evaluate(worldProbe);
    if (!st.depthOpen && !st.centre && !st.cardOpen) return st;
    const wp = await waterPoint(page);
    await g.tapAt(wp.x, wp.y);
    await g.wait(900);
  }
  return page.evaluate(worldProbe);
}

/* ------------------------------------------------------- drift probes */
const wordProbe = (label) => `(() => {
  for (const el of document.querySelectorAll('#drift-layer .word')) {
    const base = el.querySelector('.base')?.textContent ?? '';
    if (base !== ${JSON.stringify(label)}) continue;
    const r = el.getBoundingClientRect();
    return { exists: true, x: r.x + r.width / 2, y: r.y + r.height / 2,
      onScreen: r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 96 && r.top < innerHeight - 64,
      opacity: parseFloat(el.style.opacity || '1'),
      unfolded: el.classList.contains('unfolded'),
      glossed: el.classList.contains('glossed'),
      isCentre: el.classList.contains('bctr'),
      isSat: el.classList.contains('bsat') };
  }
  return { exists: false };
})()`;

const worldProbe = `(() => ({
  words: document.querySelectorAll('#drift-layer .word').length,
  centre: document.querySelector('#drift-layer .word.bctr')?.querySelector('.base')?.textContent ?? null,
  diveCentre: document.querySelector('#drift-layer .word.center')?.querySelector('.base')?.textContent ?? null,
  sats: document.querySelectorAll('#drift-layer .word.bsat').length,
  unfolded: document.querySelectorAll('#drift-layer .word.unfolded').length,
  glossed: document.querySelectorAll('#drift-layer .word.glossed').length,
  tray: document.getElementById('drift-tray')?.textContent ?? '',
  depthText: document.getElementById('depth')?.textContent ?? '',
  depthOpen: (document.getElementById('depth')?.textContent ?? '') !== '',
  cardOpen: document.getElementById('card')?.classList.contains('open') ?? false,
  sheetOpen: !!document.getElementById('sheet'),
}))()`;

/** a word comfortably inside the field, away from chrome */
const pickWord = (page, exclude = []) =>
  page.evaluate(`(() => {
    const done = new Set(${JSON.stringify(exclude)});
    const out = [];
    for (const el of document.querySelectorAll('#drift-layer .word')) {
      const base = el.querySelector('.base')?.textContent ?? '';
      const r = el.getBoundingClientRect();
      if (!base || done.has(base) || !r.width) continue;
      if (r.left < 46 || r.right > innerWidth - 46 || r.top < 175 || r.bottom > innerHeight - 155) continue;
      const op = parseFloat(el.style.opacity || '1');
      if (op < 0.2) continue;
      out.push({ w: base, opacity: op });
    }
    out.sort((a, b) => b.opacity - a.opacity);
    return out[0] ?? null;
  })()`);

const waterPoint = (page) =>
  page.evaluate(`(() => {
    for (let y = 260; y < innerHeight - 200; y += 13) {
      for (let x = 60; x < innerWidth - 30; x += 13) {
        const el = document.elementFromPoint(x, y);
        if (!el) continue;
        if (el.closest('.word') || el.closest('#lvl') || el.closest('#hint') || el.closest('#theme')
          || el.closest('#depth') || el.closest('#drift-tray') || el.closest('#brand') || el.closest('#seal')
          || el.closest('#card') || el.closest('.chrome') || el.closest('#variants') || el.closest('#enter-shelf-door')) continue;
        return { x, y };
      }
    }
    return { x: 200, y: 500 };
  })()`);

/** camera zoom read off the rendered word matrices (the camera scale is in every word) */
const camZoom = (page) =>
  page.evaluate(`(() => {
    const s = [];
    for (const w of document.querySelectorAll('#drift-layer .word')) {
      const t = getComputedStyle(w).transform;
      if (!t || t === 'none') continue;
      const m = new DOMMatrixReadOnly(t);
      s.push(Math.hypot(m.a, m.b));
    }
    s.sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  })()`);

/** the field centroid — pan shows up here */
const centroid = (page) =>
  page.evaluate(`(() => {
    let x = 0, y = 0, n = 0;
    for (const w of document.querySelectorAll('#drift-layer .word')) {
      const r = w.getBoundingClientRect();
      x += r.x + r.width / 2; y += r.y + r.height / 2; n += 1;
    }
    return n ? { x: x / n, y: y / n, n } : null;
  })()`);

/** the bearing between two named words — camera rotation shows up here */
const bearing = (page, a, b) =>
  page.evaluate(`(() => {
    const find = (t) => {
      for (const el of document.querySelectorAll('#drift-layer .word'))
        if ((el.querySelector('.base')?.textContent ?? '') === t) {
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      return null;
    };
    const A = find(${JSON.stringify(a)}), B = find(${JSON.stringify(b)});
    if (!A || !B) return null;
    return { rad: Math.atan2(B.y - A.y, B.x - A.x), dist: Math.hypot(B.x - A.x, B.y - A.y) };
  })()`);

/** total px of word motion over `ms`, matched by .base label */
async function driftMotion(page, ms) {
  const snap = () =>
    page.evaluate(`(() => [...document.querySelectorAll('#drift-layer .word')].map((w) => {
      const r = w.getBoundingClientRect();
      return [w.querySelector('.base')?.textContent ?? '', r.x, r.y];
    }))()`);
  const before = await snap();
  await page.waitForTimeout(ms);
  const after = await snap();
  const map = new Map(before.map((b) => [b[0], b]));
  let total = 0;
  let moved = 0;
  let n = 0;
  let worst = 0;
  for (const a of after) {
    const b = map.get(a[0]);
    if (!b) continue;
    const d = Math.hypot(a[1] - b[1], a[2] - b[2]);
    total += d;
    if (d > 0.5) moved += 1;
    if (d > worst) worst = d;
    n += 1;
  }
  return { total, moved, n, worst, perSec: n ? total / n / (ms / 1000) : 0 };
}

async function hintContrast(page) {
  return page.evaluate(`(() => {
    const hint = document.getElementById('hint');
    if (!hint) return null;
    const parse = (s) => {
      const m = String(s).match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number);
      return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
    };
    const lum = (rgb) => {
      const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const cs = getComputedStyle(hint);
    const fg = parse(cs.color);
    let bg = parse(cs.backgroundColor);
    const ground = parse(getComputedStyle(document.body).backgroundColor) || { rgb: [251,250,245], a: 1 };
    if (!bg || bg.a === 0) bg = ground;
    const bgc = bg.rgb.map((v, i) => v * bg.a + ground.rgb[i] * (1 - bg.a));
    const fgc = fg.rgb.map((v, i) => v * fg.a + bgc[i] * (1 - fg.a));
    const l1 = lum(fgc), l2 = lum(bgc);
    return { text: hint.textContent.trim().slice(0, 40), opacity: Number(cs.opacity),
      ratio: Math.round(((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)) * 100) / 100 };
  })()`);
}

/** WP1's law is about the INTERACTIVE token — `#reader button.tok` — which is
 * what tears into two stacked rows when a ruby and its okurigana become sibling
 * flex items. Plain non-interactive `span.tok.plain` runs are ordinary text and
 * wrap across lines like any prose, so both are measured and reported apart. */
async function tokenHeights(page) {
  return page.evaluate(`(() => {
    const measure = (list) => {
      let max = 0, maxText = '', over = 0, offenders = [];
      for (const t of list) {
        const h = t.getBoundingClientRect().height;
        if (h > 50) { over += 1; offenders.push({ t: t.textContent.slice(0, 10), h: Math.round(h * 100) / 100, lines: t.getClientRects().length, cls: t.className }); }
        if (h > max) { max = h; maxText = t.textContent.slice(0, 12); }
      }
      return { count: list.length, max: Math.round(max * 100) / 100, maxText, over, offenders: offenders.slice(0, 4) };
    };
    const btn = measure([...document.querySelectorAll('#reader button.tok')]);
    const plain = measure([...document.querySelectorAll('#reader .tok:not(button)')]);
    return { ...btn, plain };
  })()`);
}

/** open a named article from a clean shelf, so no earlier reveal state leaks in */
async function openArticle(page, g, passageId = null) {
  let last = { index: -1, id: '', title: '', tokens: 0 };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await toShelf(page);
    const want = attempt === 0 ? passageId : null;
    const idx = await page.evaluate(`(() => {
      const items = [...document.querySelectorAll('.shelf-item')];
      const want = ${JSON.stringify(want)};
      let i = want ? items.findIndex((n) => n.dataset.passage === want) : ${JSON.stringify(0)} + ${attempt};
      if (i < 0 || i >= items.length) i = 0;
      return { index: i, id: items[i]?.dataset?.passage ?? '', title: items[i]?.querySelector('.shelf-title')?.textContent ?? '' };
    })()`);
    await tapSel(page, g, '.shelf-item', idx.index).catch(() => {});
    await page
      .waitForFunction(() => document.querySelectorAll('#reader button.tok').length > 5, null, { timeout: 12000 })
      .catch(() => {});
    let tokens = await page.evaluate(`document.querySelectorAll('#reader button.tok').length`);
    if (tokens <= 5) {
      // the CDP touch did not take (an overlay can swallow it right after a
      // view change) — fall back to Playwright's actionability-checked click
      await page.locator('.shelf-item').nth(idx.index).click({ timeout: 8000 }).catch(() => {});
      await page
        .waitForFunction(() => document.querySelectorAll('#reader button.tok').length > 5, null, { timeout: 15000 })
        .catch(() => {});
      tokens = await page.evaluate(`document.querySelectorAll('#reader button.tok').length`);
    }
    await page.waitForTimeout(500);
    const diag = await page.evaluate(`(() => ({ view: document.body.dataset.view ?? '',
      drift: document.getElementById('drift-layer')?.classList.contains('active') ?? false,
      title: document.querySelector('.view-title')?.textContent ?? '' }))()`);
    last = { ...idx, tokens, ...diag };
    if (tokens > 5) return last;
  }
  return last;
}

const overflow = (page) =>
  page.evaluate(`(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }))()`);

/* ------------------------------------------------------- page factories */
async function newPage(browser, opts = {}) {
  const context = await browser.newContext({
    viewport: opts.viewport ?? MOBILE,
    hasTouch: opts.touch !== false,
    isMobile: opts.touch !== false,
    deviceScaleFactor: 2,
    reducedMotion: opts.reducedMotion ?? 'no-preference',
  });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') noteError(`console: ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => noteError(`pageerror: ${String(e.message).slice(0, 240)}`));
  page.on('requestfailed', (r) => noteError(`requestfailed: ${r.url().slice(0, 120)}`));
  const cdp = await context.newCDPSession(page);
  return { context, page, g: gestures(page, cdp) };
}

async function boot(page, base) {
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.getElementById('drift-layer'), null, { timeout: 30000 });
  await page.waitForTimeout(1600);
}

/** walk back to the drift front door the way a reader does: the 入口 row names
 * 墨流しの野 as home, and 戻る from the shelf steps out into it (the strip alone
 * only records the choice — corridor.js:639 is where the shelf hands over). */
async function toDrift(page, g) {
  await toShelf(page);
  await page.evaluate(`document.querySelector('button[data-variant="entry:drift"]')?.click()`);
  await page.waitForTimeout(700);
  for (let i = 0; i < 4; i += 1) {
    const on = await page.evaluate(`document.getElementById('drift-layer')?.classList.contains('active') ?? false`);
    if (on) break;
    await page.locator('#back').click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(800);
  return page.evaluate(`document.getElementById('drift-layer')?.classList.contains('active') ?? false`);
}

/** walk from wherever we are onto the shelf */
async function toShelf(page) {
  for (let i = 0; i < 6; i += 1) {
    // a query left in the field replaces the whole shelf with search results —
    // clear it first, or every later "open an article" has nothing to open
    await page.evaluate(`(() => {
      const s = document.getElementById('search');
      if (s && s.value) { s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); }
    })()`);
    await page.waitForTimeout(200);
    const n = await page.evaluate(`document.querySelectorAll('.shelf-item').length`);
    if (n) return n;
    const inDrift = await page.evaluate(`document.getElementById('drift-layer')?.classList.contains('active') ?? false`);
    if (inDrift) await page.evaluate(`document.getElementById('enter-shelf-door')?.click()`);
    else {
      // a stroke page is a full-screen layer over the sheet — close it first,
      // or every door underneath is unreachable
      await page.evaluate(`(() => {
        document.getElementById('strokes-close')?.click();
        document.getElementById('mini')?.remove();
      })()`);
      await page.waitForTimeout(300);
      await page.evaluate(`document.getElementById('sheet-close')?.click()`);
      await page.waitForTimeout(300);
      await page.evaluate(`document.getElementById('back')?.click()`);
    }
    await page.waitForTimeout(800);
  }
  return page.evaluate(`document.querySelectorAll('.shelf-item').length`);
}

/* ================================================================ MAIN */
async function main() {
  if (!existsSync(TARGET)) throw new Error(`missing deliverable: ${TARGET}`);
  const bytes = readFileSync(TARGET).length;
  const { server, base } = await startServer();
  const browser = await chromium.launch();
  console.log(`target ${TARGET} (${bytes} bytes)`);
  console.log(`serving ${base}\n`);
  // a watchdog, so a stuck locator can never cost the gate its report
  const WATCHDOG_MS = 22 * 60 * 1000;
  const watchdog = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`watchdog: the walk exceeded ${WATCHDOG_MS / 60000} minutes`)), WATCHDOG_MS).unref?.(),
  );
  try {
    await Promise.race([run(browser, base, bytes), watchdog]);
  } catch (e) {
    check(0, 'the journey ran to completion', false, `THREW in stage ${stage}: ${e && e.message}`);
    console.error(e);
  } finally {
    await browser.close();
    server.close();
  }

  let totalErrors = 0;
  for (const [, list] of stageErrors) totalErrors += list.length;
  const byStage = [...stageErrors.entries()].map(([s, l]) => ({ stage: s, count: l.length, messages: [...new Set(l)].slice(0, 6) }));
  const failed = results.filter((r) => !r.pass);
  writeFileSync(OUT, JSON.stringify({
    target: TARGET.replace(REPO + '/', ''), bytes, generatedAt: new Date().toISOString(),
    totals: { checks: results.length, passed: results.length - failed.length, failed: failed.length },
    consoleErrors: { total: totalErrors, byStage }, results,
  }, null, 2));

  console.log('\n========================= ERROR LEDGER =========================');
  if (!byStage.length) console.log('  zero console/page errors across every stage');
  for (const e of byStage) console.log(`  ${e.stage}: ${e.count} — ${e.messages.join(' | ').slice(0, 220)}`);
  console.log('\n========================= GATE SUMMARY =========================');
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  for (const f of failed) console.log(`  FAIL [${f.item}] ${f.name} — ${f.detail}`);
  console.log(`results -> ${OUT}`);
  process.exit(failed.length ? 1 : 0);
}

/* ============================================================ THE WALK */
async function run(browser, base, bytes) {
  /* ---------------------------------------------------------- 1 ARRIVAL */
  stage = '1-arrival';
  const m = await newPage(browser);
  const { page, g } = m;
  await boot(page, base);
  let shot = await shoot(page, 'arrival-390x844');

  check(1, 'the deliverable is the committed 8,944,600-byte standalone', bytes === 8944600, `${bytes} bytes`, shot);
  const arrival = await page.evaluate(worldProbe);
  const chrome = await page.evaluate(`(() => ({
    layer: document.getElementById('drift-layer')?.classList.contains('active'),
    hint: document.getElementById('hint')?.textContent?.trim() ?? '',
    theme: document.getElementById('theme')?.textContent ?? '',
    lvl: !!document.getElementById('lvl'), door: !!document.getElementById('enter-shelf-door'),
  }))()`);
  check(1, 'the drift front door renders (layer active, words painted, chrome up)',
    chrome.layer && arrival.words > 20 && chrome.lvl && chrome.door,
    `layer=${chrome.layer} words=${arrival.words} theme=${chrome.theme} hint="${chrome.hint}"`, shot);

  const motion = await driftMotion(page, 3000);
  check(1, 'the field is alive — nonzero drift measured on rendered word boxes',
    motion.perSec > 0.5 && motion.moved > 10,
    `${motion.moved}/${motion.n} words moved, mean ${motion.perSec.toFixed(2)} px/s, worst ${motion.worst.toFixed(1)} px over 3s`, shot);
  check(1, 'stage 1: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* --------------------------------------------- 2 LADDER + CHAIN WALK */
  stage = '2-ladder';
  const seed = await pickWord(page);
  let w = await page.evaluate(wordProbe(seed.w));
  await g.tapAt(w.x, w.y);
  await g.wait(1400);
  let rung1 = await page.evaluate(wordProbe(seed.w));
  let world = await page.evaluate(worldProbe);
  shot = await shoot(page, 'ladder-rung1-forefront-family-reading');
  check(2, 'rung 1 (3-stage default): the word comes forefront with its family and its reading',
    rung1.exists && rung1.unfolded && rung1.isCentre && world.sats > 0,
    `"${seed.w}" unfolded=${rung1.unfolded} centre=${rung1.isCentre} satellites=${world.sats} glossed=${rung1.glossed}`, shot);

  w = await page.evaluate(wordProbe(seed.w));
  await g.tapAt(w.x, w.y);
  await g.wait(700);
  const rung2 = await page.evaluate(wordProbe(seed.w));
  shot = await shoot(page, 'ladder-rung2-english');
  check(2, 'rung 2: the English gloss appears on the same word',
    rung2.exists && rung2.glossed, `"${seed.w}" glossed=${rung2.glossed} unfolded=${rung2.unfolded}`, shot);

  const centreBefore = (await page.evaluate(worldProbe)).centre;
  w = await page.evaluate(wordProbe(seed.w));
  await g.tapAt(w.x, w.y);
  await g.wait(1700);
  const dived = await page.evaluate(worldProbe);
  shot = await shoot(page, 'ladder-rung3-carried-in');
  check(2, 'rung 3: the word is carried in — the dive stack takes its first level',
    depthOf(dived.depthText) >= 1,
    `depth breadcrumb "${dived.depthText}" (${depthOf(dived.depthText)} level(s)); centre="${dived.centre}"`, shot);

  // the WP3 seam: inside the dive, tapping the level's centre opens the drift
  // word card, whose 「この語を学ぶ →」 door hands the word to the corridor's
  // own entry sheet. The dive centre wears .center (the bloom centre wears .bctr).
  const ctrNow = dived.diveCentre ?? dived.centre;
  const cp = ctrNow ? await page.evaluate(wordProbe(ctrNow)) : { exists: false };
  if (cp.exists) {
    await g.tapAt(cp.x, cp.y);
    await g.wait(1300);
  }
  const cardState = await page.evaluate(`(() => {
    const c = document.getElementById('card');
    return { open: c?.classList.contains('open') ?? false,
      study: !!c?.querySelector('button.study[data-study-key]'),
      studyKey: c?.querySelector('button.study')?.getAttribute('data-study-key') ?? '',
      studyLabel: c?.querySelector('button.study')?.textContent ?? '',
      note: c?.querySelector('.note')?.textContent ?? '' };
  })()`);
  shot = await shoot(page, 'ladder-drift-card-with-study-door');
  check(2, 'WP3 seam: the drift word card carries a real study door (not the placeholder note)',
    cardState.open && cardState.study,
    `card open=${cardState.open}, study door=${cardState.study} key="${cardState.studyKey}" label="${cardState.studyLabel.trim()}", placeholder note="${cardState.note.slice(0, 40)}"`, shot);

  if (cardState.study) {
    await page.locator('#card button.study').click({ timeout: 4000 }).catch(() => {});
    await g.wait(1400);
  }
  const entry = await page.evaluate(`(() => {
    const s = document.getElementById('sheet');
    return {
      sheet: !!s, node: s?.dataset?.node ?? '',
      headword: s?.querySelector('.headword')?.textContent ?? '',
      senses: s ? s.querySelectorAll('.sense-list li').length : 0,
      kanjiDoors: s ? s.querySelectorAll('[data-kanjirow]').length : 0,
      semRows: s ? s.querySelectorAll('.sem-row').length : 0,
      semEmpty: s ? !!s.querySelector('.sem-empty') : false,
      take: !!document.getElementById('take'),
      driftAsleep: !(document.getElementById('drift-layer')?.classList.contains('active') ?? false),
    };
  })()`);
  shot = await shoot(page, 'ladder-full-entry-wp3-seam');
  check(2, 'the full entry opens through the WP3 seam — the corridor’s own #sheet',
    entry.sheet, `#sheet=${entry.sheet} node="${entry.node}" headword="${entry.headword}" driftLayerAsleep=${entry.driftAsleep}`, shot);
  check(2, 'WP3 entry carries senses, kanji doors and a semantic neighbourhood section',
    entry.sheet && entry.senses > 0 && entry.kanjiDoors > 0 && (entry.semRows > 0 || entry.semEmpty),
    `senses=${entry.senses} kanjiDoors=${entry.kanjiDoors} semRows=${entry.semRows} honest-empty-note=${entry.semEmpty} 覚える=${entry.take}`, shot);

  // where the word has no curated edges the sheet says so and offers words that
  // do — follow that door and prove the 意味の近く rows really render
  let semProof = { rows: entry.semRows, head: entry.headword, via: 'this word' };
  if (entry.semRows === 0 && entry.semEmpty) {
    await tapSel(page, g, '#sheet .chip', 0).catch(() => {});
    await g.wait(1200);
    semProof = await page.evaluate(`(() => { const s = document.getElementById('sheet');
      return { rows: s ? s.querySelectorAll('.sem-row').length : 0,
        head: s?.querySelector('.headword')?.textContent ?? '',
        notes: s ? [...s.querySelectorAll('.sem-note')].slice(0, 2).map((n) => n.textContent.slice(0, 40)) : [],
        via: 'the honest empty-note chip' }; })()`);
  }
  shot = await shoot(page, 'ladder-sem-rows');
  check(2, 'the 意味の近く rows render with their discrimination notes', semProof.rows > 0,
    `${semProof.rows} sem rows on "${semProof.head}" (reached via ${semProof.via})${semProof.notes ? '; e.g. ' + JSON.stringify(semProof.notes) : ''}`, shot);

  for (let i = 0; i < 3; i += 1) {
    if (!(await page.evaluate(`!!document.getElementById('sheet')`))) break;
    await page.locator('#sheet-close').click({ timeout: 2500 }).catch(() => {});
    await g.wait(900);
  }
  await g.wait(600);
  const afterClose = await page.evaluate(worldProbe);
  check(2, 'closing the entry hands the field back with the dive level untouched',
    depthOf(afterClose.depthText) >= 1 && afterClose.diveCentre === ctrNow,
    `depth "${afterClose.depthText}", dive centre "${ctrNow}" -> "${afterClose.diveCentre}"`, shot);

  // chain walk: carry a word in at each level until the stack is >= 3 deep.
  // Inside a dive the tappable words are the level's orbiters (top 0.92), so we
  // aim only at bright, non-centre words — a tap on a receded word is a tap on
  // open water, and open water surfaces a level instead of adding one.
  // a level's own orbiters: the kanji (.glyph) and parts (.part) that swim
  // around the centre, and its sibling words. A kanji carries in on one tap,
  // a word climbs its rungs first — either way the stack grows by one.
  const orbiter = () => page.evaluate(`(() => {
    const centre = document.querySelector('#drift-layer .word.center')?.querySelector('.base')?.textContent ?? '';
    const out = [];
    const scan = (sel, kind, textSel) => {
      for (const el of document.querySelectorAll('#drift-layer ' + sel)) {
        const label = el.querySelector(textSel)?.textContent ?? '';
        if (!label || label === centre || el.classList.contains('center')) continue;
        if (getComputedStyle(el).pointerEvents === 'none') continue;
        const r = el.getBoundingClientRect();
        if (!r.width || r.left < 30 || r.right > innerWidth - 30 || r.top < 170 || r.bottom > innerHeight - 150) continue;
        const op = parseFloat(el.style.opacity || '1');
        if (op < 0.35) continue;
        out.push({ label, kind, opacity: op, x: r.x + r.width / 2, y: r.y + r.height / 2 });
      }
    };
    scan('.glyph', 'kanji', '.g');
    scan('.part', 'part', '.pch');
    scan('.word', 'word', '.base');
    // a kanji dives on a single tap — prefer it, then the brightest of the rest
    out.sort((a, b) => (a.kind === 'kanji' ? -1 : 0) - (b.kind === 'kanji' ? -1 : 0) || b.opacity - a.opacity);
    return out[0] ?? null;
  })()`);
  const livePoint = (kind, label) => page.evaluate(`(() => {
    const sel = ${JSON.stringify(kind)} === 'kanji' ? '.glyph' : (${JSON.stringify(kind)} === 'part' ? '.part' : '.word');
    const inner = ${JSON.stringify(kind)} === 'kanji' ? '.g' : (${JSON.stringify(kind)} === 'part' ? '.pch' : '.base');
    for (const el of document.querySelectorAll('#drift-layer ' + sel)) {
      if ((el.querySelector(inner)?.textContent ?? '') !== ${JSON.stringify(label)}) continue;
      const r = el.getBoundingClientRect();
      if (!r.width) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  })()`);
  const trail = [`${seed.w}:"${dived.depthText}"`];
  for (let d = 0; d < 14; d += 1) {
    const st0 = await page.evaluate(worldProbe);
    if (depthOf(st0.depthText) >= 3) break;
    const nxt = await orbiter();
    if (!nxt) break;
    let depthWas = depthOf(st0.depthText);
    for (let t = 0; t < 4; t += 1) {
      const p = await livePoint(nxt.kind, nxt.label);
      if (!p) break;
      await g.tapAt(p.x, p.y);
      await g.wait(1200);
      const now = depthOf((await page.evaluate(worldProbe)).depthText);
      if (now !== depthWas) { depthWas = now; break; }
    }
    const st = await page.evaluate(worldProbe);
    trail.push(`${nxt.kind} ${nxt.label}:"${st.depthText}"`);
  }
  world = await page.evaluate(worldProbe);
  shot = await shoot(page, 'chain-walk-depth');
  check(2, 'the chain walk reaches depth >= 3', depthOf(world.depthText) >= 3,
    `depth breadcrumb "${world.depthText}" = ${depthOf(world.depthText)} levels; trail = ${trail.join(' → ')}`, shot);

  const unwound = await surfaceFully(page, g, 10);
  shot = await shoot(page, 'unwound-to-surface');
  check(2, 'unwinding returns fully to the surface (dive stack empty, field repopulated)',
    !unwound.depthOpen && unwound.words > 20,
    `depth="${unwound.depthText}" words=${unwound.words} centre=${unwound.centre}`, shot);

  // the constellation is intact: raise one again and it still holds a family
  const again = await pickWord(page);
  const ap = await page.evaluate(wordProbe(again.w));
  await g.tapAt(ap.x, ap.y);
  await g.wait(1500);
  const intact = await page.evaluate(worldProbe);
  shot = await shoot(page, 'constellation-intact-after-walk');
  check(2, 'the constellation machinery is intact after the walk (a centre still gathers its family)',
    intact.centre === again.w && intact.sats > 0,
    `raised "${again.w}": centre="${intact.centre}" satellites=${intact.sats} (the walk began on "${centreBefore}")`, shot);
  check(2, 'stage 2: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* ------------------------------------------------ 3 SATELLITE (staged) */
  stage = '3-satellite';
  const wp = await waterPoint(page);
  await g.tapAt(wp.x, wp.y);
  await g.wait(600);
  const seed3 = await pickWord(page);
  let s3 = await page.evaluate(wordProbe(seed3.w));
  await g.tapAt(s3.x, s3.y);
  await g.wait(1500);
  const before3 = await page.evaluate(worldProbe);
  const satPick = await page.evaluate(`(() => {
    const sats = [...document.querySelectorAll('#drift-layer .word.bsat')].map((el) => {
      const r = el.getBoundingClientRect();
      return { el, r, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    for (const s of sats) {
      if (!s.r.width || s.r.left < 40 || s.r.right > innerWidth - 40 || s.r.top < 170 || s.r.bottom > innerHeight - 170) continue;
      if (sats.some((o) => o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 34)) continue;
      return { w: s.el.querySelector('.base')?.textContent ?? '' };
    }
    return null;
  })()`);
  shot = await shoot(page, 'constellation-raised');
  check(3, 'a constellation raises with reachable satellites', before3.sats > 0 && !!satPick,
    `centre="${before3.centre}" satellites=${before3.sats} pick="${satPick?.w ?? 'none'}"`, shot);

  if (satPick?.w) {
    let sp = await page.evaluate(wordProbe(satPick.w));
    await g.tapAt(sp.x, sp.y);
    await g.wait(900);
    const satAfter1 = await page.evaluate(wordProbe(satPick.w));
    const world1 = await page.evaluate(worldProbe);
    shot = await shoot(page, 'satellite-tap1-reveal-in-place');
    check(3, 'staged default — satellite tap 1 reveals it IN PLACE, centre unchanged',
      satAfter1.exists && satAfter1.unfolded && world1.centre === before3.centre,
      `"${satPick.w}" unfolded=${satAfter1.unfolded} glossed=${satAfter1.glossed}; centre "${before3.centre}" -> "${world1.centre}"`, shot);

    sp = await page.evaluate(wordProbe(satPick.w));
    await g.tapAt(sp.x, sp.y);
    await g.wait(1500);
    const world2 = await page.evaluate(worldProbe);
    const satAfter2 = await page.evaluate(wordProbe(satPick.w));
    shot = await shoot(page, 'satellite-tap2-recentre');
    check(3, 'staged default — satellite tap 2 recentres: the satellite becomes the planet',
      satAfter2.exists && (world2.centre === satPick.w || world2.depthOpen),
      `centre "${before3.centre}" -> "${world2.centre}", satellites=${world2.sats}, depth="${world2.depthText}"`, shot);
  } else {
    check(3, 'staged default — satellite tap 1 reveals it IN PLACE', false, 'no reachable satellite to tap', shot);
    check(3, 'staged default — satellite tap 2 recentres', false, 'no reachable satellite to tap', shot);
  }
  check(3, 'stage 3: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* ---------------------------------------------------------- 4 CAMERA */
  stage = '4-camera';
  await surfaceFully(page, g, 8);
  let wpt = await waterPoint(page);
  await g.doubleTapAt(wpt.x, wpt.y);
  await g.wait(1200);

  const zRest = await camZoom(page);
  const cRest = await centroid(page);
  const cloudRest = await wordCloud(page);

  await g.swipe(200, 300, 200, 620);
  const cPan = await centroid(page);
  shot = await shoot(page, 'camera-panned');
  const panDelta = cRest && cPan ? Math.hypot(cPan.x - cRest.x, cPan.y - cRest.y) : 0;
  check(4, 'pan moves the field', panDelta > 40,
    `field centroid (${cRest?.x.toFixed(0)},${cRest?.y.toFixed(0)}) -> (${cPan?.x.toFixed(0)},${cPan?.y.toFixed(0)}) = ${panDelta.toFixed(1)} px`, shot);

  await g.pinch(195, 420, 45, 200);
  const zIn = await camZoom(page);
  shot = await shoot(page, 'camera-pinch-in');
  check(4, 'pinch out (spread) zooms in', zIn && zRest && zIn > zRest * 1.2,
    `camera scale ${zRest?.toFixed(3)} -> ${zIn?.toFixed(3)} (read off the rendered word matrices)`, shot);

  await g.pinch(195, 420, 200, 45);
  const zOut = await camZoom(page);
  shot = await shoot(page, 'camera-pinch-out');
  check(4, 'pinch in zooms back out', zOut && zIn && zOut < zIn * 0.9,
    `camera scale ${zIn?.toFixed(3)} -> ${zOut?.toFixed(3)}`, shot);

  // mess the camera up on all three axes, then double-tap open water.
  // Rotation is measured as the best-fit ensemble rotation of the words that
  // survive across each snapshot — a twist rotates the whole vault, so it shows
  // up here and ambient drift does not.
  await surfaceFully(page, g, 4);
  await g.doubleTapAt((await waterPoint(page)).x, (await waterPoint(page)).y);
  await g.wait(1200);
  const cloudBase = await wordCloud(page);
  await g.pinch(195, 420, 45, 200);
  await g.twist(195, 420, 150);
  const cloudTwisted = await wordCloud(page);
  const rotTwist = fitRotation(cloudBase, cloudTwisted);
  await g.swipe(195, 300, 195, 620);
  await g.wait(1300);
  const zMessy = await camZoom(page);
  const cloudMessy = await wordCloud(page);
  const rotMessy = fitRotation(cloudBase, cloudMessy);
  shot = await shoot(page, 'camera-messy');
  // The double-tap must land on TRUE open water. At z=2.6 the words are large
  // and drifting, so a point that was water when it was found can be under a
  // word by the time the finger arrives — that is aim, not the app. Re-aim and
  // retry up to three times; only a camera that still refuses to come home is a
  // gate failure.
  let zHome = null;
  let rotHome = { rad: null, n: 0 };
  let homeTries = 0;
  for (let i = 0; i < 3; i += 1) {
    homeTries = i + 1;
    const w0 = await page.evaluate(worldProbe);
    if (w0.centre || w0.unfolded || w0.cardOpen || w0.depthOpen) {
      const wc = await waterPoint(page);
      await g.tapAt(wc.x, wc.y);
      await g.wait(800);
    }
    wpt = await waterPoint(page);
    await g.doubleTapAt(wpt.x, wpt.y);
    await g.wait(1900);
    zHome = await camZoom(page);
    const cloudHome = await wordCloud(page);
    rotHome = fitRotation(cloudBase, cloudHome);
    if (zHome !== null && Math.abs(zHome - 1) < 0.06) break;
  }
  shot = await shoot(page, 'camera-return-to-rest');
  check(4, 'the twist actually registered before the reset was asked for',
    rotTwist.rad !== null && Math.abs(rotTwist.rad) > 0.5,
    `best-fit ensemble rotation over ${rotTwist.n} tracked words = ${rotTwist.rad?.toFixed(3)} rad under a 150° twist`, shot);
  check(4, 'double-tap on open water returns to rest: camera z -> 1 and rotation -> 0',
    zHome !== null && Math.abs(zHome - 1) < 0.06 && rotHome.rad !== null && Math.abs(rotHome.rad) < 0.08,
    `z ${zMessy?.toFixed(3)} -> ${zHome?.toFixed(4)} (rest was ${zRest?.toFixed(4)}); ensemble |rotation| vs the pre-twist field ${Math.abs(rotMessy.rad ?? NaN).toFixed(3)} -> ${Math.abs(rotHome.rad ?? NaN).toFixed(4)} rad over ${rotHome.n} tracked words; ${homeTries} double-tap attempt(s)`, shot);
  check(4, 'stage 4: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* ------------------------------------------------------ 5 TIDE SLIDER */
  stage = '5-tide';
  const tideBox = await page.locator('#lvl').evaluate((n) => {
    const r = n.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const STOPS = ['自', 'N1', 'N2', 'N3', 'N4', 'N5'];
  const tideLog = [];
  let tideOk = true;
  for (const want of ['N5', 'N4', 'N3', 'N2', 'N1']) {
    const ix = STOPS.indexOf(want);
    // clamp the press INSIDE the track: the bottom stop sits at the very edge
    // and a press one pixel past it never reaches #lvl at all
    const y = tideBox.y + Math.min(tideBox.h - 2, Math.max(2, (ix / (STOPS.length - 1)) * tideBox.h));
    const x = tideBox.x + tideBox.w / 2;
    const errBefore = errCount();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(2200);
    const st = await page.evaluate(`(() => ({
      info: document.getElementById('lvlInfo')?.textContent?.trim() ?? '',
      words: document.querySelectorAll('#drift-layer .word').length,
    }))()`);
    const s = await shoot(page, `tide-${want}`);
    tideLog.push({ want, info: st.info, words: st.words, newErrors: errCount() - errBefore, shot: s });
    if (!st.info.startsWith(want) || st.words < 10) tideOk = false;
  }
  shot = tideLog[tideLog.length - 1].shot;
  check(5, 'the tide slider hits every stop N5→N1 and repopulates the field at each',
    tideOk, tideLog.map((t) => `${t.want}: ${t.words} words, "${t.info.slice(0, 22)}", +${t.newErrors} err`).join(' | '), shot);
  check(5, 'stage 5: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* -------------------------------------------------------- 6 ALL THEMES */
  stage = '6-themes';
  const THEME_NAMES = ['北斎', '墨', '岩絵具', '緑青', '夜'];
  const themeLog = [];
  for (let i = 0; i < THEME_NAMES.length + 1; i += 1) {
    await page.evaluate(`(() => { const h = document.getElementById('hint'); if (h) { h.style.opacity = '1'; } })()`);
    await g.wait(300);
    const name = await page.evaluate(`document.getElementById('theme')?.textContent?.trim() ?? ''`);
    const hc = await hintContrast(page);
    const s = await shoot(page, `theme-${name}`);
    themeLog.push({ name, ratio: hc?.ratio ?? null, hint: hc?.text ?? '', shot: s });
    if (i === THEME_NAMES.length) break;
    await page.locator('#theme').click({ timeout: 8000 }).catch(() => {});
    await g.wait(900);
  }
  const seenThemes = themeLog.map((t) => t.name);
  const uniqueSeen = [...new Set(seenThemes)];
  check(6, 'every drift theme cycles, including 夜',
    THEME_NAMES.every((n) => uniqueSeen.includes(n)), `cycle: ${seenThemes.join(' → ')}`, themeLog.at(-1).shot);
  const worstHint = Math.min(...themeLog.map((t) => t.ratio ?? 0));
  check(6, 'the hint pill stays legible (>= 4.5:1) in every theme',
    themeLog.every((t) => (t.ratio ?? 0) >= 4.5), themeLog.map((t) => `${t.name}=${t.ratio}`).join(' '), themeLog.at(-1).shot);
  check(6, 'stage 6: zero console/page errors', errCount() === 0, `${errCount()} errors`, themeLog.at(-1).shot);

  /* --------------------------------------------------- 7 SHELF + WP5 SCROLL */
  stage = '7-shelf';
  const shelfCount = await toShelf(page);
  shot = await shoot(page, 'shelf-top');
  check(7, 'the shelf carries 40 articles (WP9b)', shelfCount === 40, `${shelfCount} shelf items`, shot);

  await page.evaluate(`window.scrollTo(0, Math.round(document.body.scrollHeight * 0.74))`);
  await g.wait(700);
  const scrollBefore = await page.evaluate(`Math.round(window.scrollY)`);
  const pickShelf = await page.evaluate(`(() => {
    const items = [...document.querySelectorAll('.shelf-item')];
    let best = null, bd = Infinity;
    for (const it of items) {
      const r = it.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - innerHeight / 2);
      if (d < bd) { bd = d; best = it; }
    }
    return best ? { index: items.indexOf(best), title: best.querySelector('.shelf-title')?.textContent ?? '', id: best.dataset.passage } : null;
  })()`);
  shot = await shoot(page, 'shelf-scrolled-deep');
  await tapSel(page, g, '.shelf-item', pickShelf.index);
  await page.waitForSelector('#reader .tok', { timeout: 25000 }).catch(() => {});
  await g.wait(700);
  const opened = await page.evaluate(`(() => ({
    title: document.querySelector('.view-title')?.textContent ?? '',
    tokens: document.querySelectorAll('#reader .tok').length,
  }))()`);
  shot = await shoot(page, 'article-opened-from-deep-shelf');
  check(7, 'an article opens from deep in the shelf', opened.tokens > 20,
    `"${opened.title.slice(0, 28)}" (${pickShelf.id}), ${opened.tokens} tokens, shelf offset was ${scrollBefore}`, shot);

  await page.locator('#back').click({ timeout: 8000 }).catch(() => {});
  await g.wait(1000);
  const scrollAfter = await page.evaluate(`Math.round(window.scrollY)`);
  shot = await shoot(page, 'shelf-scroll-restored');
  check(7, 'WP5: 戻る restores the shelf scroll offset exactly',
    scrollAfter === scrollBefore, `${scrollBefore} -> ${scrollAfter} (delta ${scrollAfter - scrollBefore} px)`, shot);
  check(7, 'stage 7: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* --------------------------------------------------------- 8 SEARCH */
  stage = '8-search';
  await page.evaluate(`window.scrollTo(0, 0)`);
  await g.wait(400);
  const SEARCHES = [
    { q: '世', kind: 'kanji' },
    { q: 'せかい', kind: 'kana' },
    { q: 'sekai', kind: 'romaji' },
    { q: 'world', kind: 'English', wantFirst: '世界' },
  ];
  for (const c of SEARCHES) {
    await toShelf(page);
    await page.locator('#search').fill('');
    await g.wait(250);
    await page.locator('#search').fill(c.q);
    await g.wait(900);
    const res = await page.evaluate(`(() => {
      const box = document.getElementById('search-results') || document.getElementById('shelf-body');
      if (!box) return { count: 0, first: '', firstJa: '' };
      const hits = [...box.querySelectorAll('button')].filter((n) => n.textContent.trim());
      return { count: hits.length,
        first: hits[0]?.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 50) ?? '',
        firstJa: hits[0]?.querySelector('.l-ja, .headword, .hit-word')?.textContent?.trim() ?? '' };
    })()`);
    const s1 = await shoot(page, `search-${c.kind}-${c.q}`);
    check(8, `search — ${c.kind} "${c.q}" returns results`, res.count > 0,
      `${res.count} hits, first "${res.first}"`, s1);
    if (c.wantFirst) {
      check(8, `search — English "${c.q}" ranks ${c.wantFirst} first`,
        res.first.includes(c.wantFirst) || res.firstJa.includes(c.wantFirst),
        `first hit "${res.first}" (ja part "${res.firstJa}")`, s1);
    }
    if (res.count > 0) {
      await tapSel(page, g, '#search-results button, #shelf-body button', 0).catch(() => {});
      await g.wait(1100);
      const op = await page.evaluate(`(() => ({
        sheet: !!document.getElementById('sheet'),
        head: document.querySelector('#sheet .headword')?.textContent ?? '',
        node: document.getElementById('sheet')?.dataset?.node ?? '',
        reader: document.querySelectorAll('#reader .tok').length,
      }))()`);
      const s2 = await shoot(page, `search-${c.kind}-${c.q}-opened`);
      check(8, `search — "${c.q}": the first result opens an entry`, op.sheet || op.reader > 0,
        `sheet=${op.sheet} node="${op.node}" headword="${op.head}" readerTokens=${op.reader}`, s2);
      await page.locator('#sheet-close').click({ timeout: 1500 }).catch(() => {});
      await g.wait(500);
    }
  }
  await toShelf(page);
  await page.locator('#search').fill('').catch(() => {});
  await g.wait(500);
  check(8, 'stage 8: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* --------------------------------------------------------- 9 GRAMMAR */
  stage = '9-grammar';
  await page.evaluate(`document.getElementById('grammar-link')?.click()`);
  await g.wait(900);
  const gram = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.entry-row[data-grammar]')];
    return { title: document.querySelector('.view-title')?.textContent ?? '', rows: rows.length,
      bakari: rows.findIndex((b) => b.dataset.grammar === 'bakari') };
  })()`);
  shot = await shoot(page, 'grammar-index');
  check(9, 'the grammar door opens a grammar index', gram.rows > 10 && gram.bakari >= 0,
    `title "${gram.title.slice(0, 24)}", ${gram.rows} grammar rows, ばかり at row ${gram.bakari}`, shot);
  if (gram.bakari >= 0) {
    await tapSel(page, g, '.entry-row[data-grammar]', gram.bakari);
    await g.wait(1200);
  }
  const gramEntry = await page.evaluate(`(() => {
    const s = document.getElementById('sheet');
    const t = s ? s.textContent.replace(/\\s+/g, ' ') : '';
    return { sheet: !!s, node: s?.dataset?.node ?? '',
      head: s?.querySelector('.headword')?.textContent ?? '',
      formation: s?.querySelector('.formation')?.textContent ?? '',
      examples: s ? s.querySelectorAll('.example').length : 0, text: t.slice(0, 150) };
  })()`);
  shot = await shoot(page, 'grammar-entry-bakari');
  check(9, 'a grammar entry (ばかり) opens with its formation and examples',
    gramEntry.sheet && gramEntry.head.includes('ばかり') && gramEntry.examples > 0,
    `node="${gramEntry.node}" headword="${gramEntry.head}" formation="${gramEntry.formation}" examples=${gramEntry.examples}`, shot);
  await page.locator('#sheet-close').click({ timeout: 1500 }).catch(() => {});
  await g.wait(500);
  check(9, 'stage 9: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* -------------------------------------- 10 NEW WP9b ARTICLE + WP1 TOKENS */
  stage = '10-article';
  await toShelf(page);
  const n5 = await page.evaluate(`(() => {
    const items = [...document.querySelectorAll('.shelf-item')];
    const i = items.findIndex((n) => /bunki-graded-n5/.test(n.dataset.passage || ''));
    return { index: i, id: items[i]?.dataset?.passage ?? '', title: items[i]?.querySelector('.shelf-title')?.textContent ?? '' };
  })()`);
  check(10, 'a NEW WP9b article (bunki-graded-n5-*) is on the shelf', n5.index >= 0,
    `index ${n5.index}, id "${n5.id}", title "${n5.title}"`, shot);
  await tapSel(page, g, '.shelf-item', Math.max(0, n5.index));
  await page.waitForSelector('#reader .tok', { timeout: 25000 }).catch(() => {});
  await g.wait(800);
  const rs = await page.evaluate(`(() => ({
    tokens: document.querySelectorAll('#reader .tok').length,
    content: document.querySelectorAll('#reader .tok.content').length,
    ruby: document.querySelectorAll('#reader ruby').length,
    rt: document.querySelectorAll('#reader rt:not(.hidden-rt)').length,
    title: document.querySelector('.view-title')?.textContent ?? '',
    hint: document.querySelector('.gesture-hint')?.textContent?.trim() ?? '',
  }))()`);
  shot = await shoot(page, 'wp9b-n5-article-open');
  check(10, 'the WP9b article renders its tokens with furigana', rs.tokens > 20 && rs.rt > 0,
    `${rs.tokens} tokens (${rs.content} content), ${rs.ruby} ruby, ${rs.rt} visible rt — "${rs.title.slice(0, 26)}"`, shot);

  const th = await tokenHeights(page);
  check(10, 'WP1: zero interactive tokens taller than 50px (every button.tok measured)', th.over === 0,
    `${th.count} button.tok measured, tallest ${th.max}px on "${th.maxText}", over-50 = ${th.over}`, shot);
  check(10, 'WP1 (wider read): no non-interactive .tok run is a TORN token either',
    th.plain.offenders.every((o) => o.lines > 1),
    `${th.plain.count} plain .tok runs, tallest ${th.plain.max}px; over-50 = ${th.plain.over}` +
    (th.plain.offenders.length ? `; all of them ordinary line wraps: ${JSON.stringify(th.plain.offenders)}` : ''), shot);

  // the reader ladder AT THE DIAL DEFAULT (ふりがな = つねに), which is the
  // two-rung ladder the app's own hint states
  const tokIdx = await page.evaluate(`(() => {
    const ts = [...document.querySelectorAll('#reader .tok.content')];
    return ts.findIndex((t) => (t.dataset.word || '').length >= 2);
  })()`);
  const tokState = (i) => page.evaluate(`(() => {
    const t = document.querySelectorAll('#reader .tok.content')[${i}];
    return { word: t?.dataset?.word ?? '', rt: t ? t.querySelectorAll('rt:not(.hidden-rt)').length : 0,
      en: t ? t.querySelectorAll('.tok-en').length : 0, enText: t?.querySelector('.tok-en')?.textContent ?? '',
      sheet: !!document.getElementById('sheet') };
  })()`);
  const t0 = await tokState(Math.max(0, tokIdx));
  await tapSel(page, g, '#reader .tok.content', Math.max(0, tokIdx));
  const t1 = await tokState(Math.max(0, tokIdx));
  shot = await shoot(page, 'reader-default-tap1');
  check(10, 'reader at the dial default (ふりがな=つねに): the reading is already on and tap 1 gives the English',
    t1.en > t0.en && !t1.sheet,
    `hint says "${rs.hint}"; token "${t0.word}" rt ${t0.rt} -> ${t1.rt}, tok-en ${t0.en} -> ${t1.en} ("${t1.enText.slice(0, 24)}"), sheet=${t1.sheet}`, shot);
  await tapSel(page, g, '#reader .tok.content', Math.max(0, tokIdx));
  await g.wait(900);
  const t2 = await tokState(Math.max(0, tokIdx));
  shot = await shoot(page, 'reader-default-tap2-full-entry');
  check(10, 'reader at the dial default: tap 2 opens the full entry', t2.sheet,
    `sheet=${t2.sheet} headword="${await page.evaluate(`document.querySelector('#sheet .headword')?.textContent ?? ''`)}"`, shot);
  await page.locator('#sheet-close').click({ timeout: 1500 }).catch(() => {});
  await g.wait(500);

  // and the three-rung ladder with the readings dial off, which is the shape
  // the brief names: tap = reading, tap 2 = English, tap 3 = full entry.
  // Re-open the article first so no earlier reveal clings to the token — a word
  // that already carries its English would fake rung 2.
  await openArticle(page, g, n5.id);
  await page.evaluate(`document.getElementById('dials-toggle')?.click()`);
  await g.wait(500);
  await page.evaluate(`document.querySelector('button[data-dial="furigana:0"]')?.click()`);
  await g.wait(700);
  const hintOff = await page.evaluate(`document.querySelector('.gesture-hint')?.textContent?.trim() ?? ''`);
  // S.revealed / S.glossed are keyed by token INDEX and are not cleared between
  // articles, so this rung test must stand on a token no earlier tap has touched
  const freshIdx = await page.evaluate(`(() => {
    const ts = [...document.querySelectorAll('#reader .tok.content')];
    return ts.findIndex((t) => (t.dataset.word || '').length >= 2
      && t.querySelectorAll('.tok-en').length === 0
      && t.querySelectorAll('rt:not(.hidden-rt)').length === 0);
  })()`);
  const freshWord = await page.evaluate(`document.querySelectorAll('#reader .tok.content')[${Math.max(0, freshIdx)}]?.dataset?.word ?? ''`);
  const u0 = await tokState(Math.max(0, freshIdx));
  await tapSel(page, g, '#reader .tok.content', Math.max(0, freshIdx));
  const u1 = await tokState(Math.max(0, freshIdx));
  shot = await shoot(page, 'reader-3rung-tap1-reading');
  check(10, 'reader with ふりがな off: tap 1 reveals the reading only', u1.rt > u0.rt && u1.en === 0 && !u1.sheet,
    `hint "${hintOff}"; untouched token "${freshWord}" (index ${freshIdx}): rt ${u0.rt} -> ${u1.rt}, tok-en ${u0.en} -> ${u1.en}, sheet=${u1.sheet}`, shot);
  await tapSel(page, g, '#reader .tok.content', Math.max(0, freshIdx));
  const u2 = await tokState(Math.max(0, freshIdx));
  shot = await shoot(page, 'reader-3rung-tap2-english');
  check(10, 'reader with ふりがな off: tap 2 puts the English under the word', u2.en > 0 && !u2.sheet,
    `tok-en=${u2.en} "${u2.enText.slice(0, 24)}", sheet=${u2.sheet}`, shot);
  await tapSel(page, g, '#reader .tok.content', Math.max(0, freshIdx));
  await g.wait(900);
  const u3 = await tokState(Math.max(0, freshIdx));
  shot = await shoot(page, 'reader-3rung-tap3-full-entry');
  check(10, 'reader with ふりがな off: tap 3 opens the full entry', u3.sheet, `sheet=${u3.sheet}`, shot);
  await page.locator('#sheet-close').click({ timeout: 1500 }).catch(() => {});
  await page.evaluate(`document.querySelector('button[data-dial="furigana:2"]')?.click()`);
  await g.wait(600);
  check(10, 'stage 10: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* ------------------------------------------------- 11 THE THREE DIALS */
  stage = '11-dials';
  // a clean article again: the ladder tests above left glosses under words, and
  // a token carrying its English is legitimately taller — that would measure the
  // reveal, not the dial
  await openArticle(page, g, n5.id);
  // S.dialsOpen survives a re-render, so only reach for the toggle when the
  // panel is actually shut — an unconditional click would close it
  if (!(await page.evaluate(`!!document.querySelector('.dials')`))) {
    await page.evaluate(`document.getElementById('dials-toggle')?.click()`);
    await g.wait(700);
  }
  const dialRows = await page.evaluate(`(() => [...document.querySelectorAll('.dials .dial')].map((r) => r.querySelector('.dial-label')?.textContent?.trim() ?? ''))()`);
  shot = await shoot(page, 'dials-open');
  check(11, 'all three reader dials are present (漢字 / ふりがな / 分かち)', dialRows.length === 3,
    `${dialRows.length} dials: ${dialRows.join(' | ')}`, shot);

  const dialLog = [];
  const DIALS = ['kanji', 'furigana', 'spacing'];
  let hintAt2 = '';
  let hintAt0 = '';
  for (const key of DIALS) {
    for (let s = 0; s < 3; s += 1) {
      const clicked = await page.evaluate(`(() => { const b = document.querySelector('button[data-dial="${key}:${s}"]'); if (!b) return false; b.click(); return true; })()`);
      await g.wait(600);
      const mh = await tokenHeights(page);
      const hint = await page.evaluate(`document.querySelector('.gesture-hint')?.textContent?.trim() ?? ''`);
      if (key === 'furigana' && s === 2) hintAt2 = hint;
      if (key === 'furigana' && s === 0) hintAt0 = hint;
      const sShot = await shoot(page, `dial-${key}-${s}`);
      dialLog.push({ key, s, clicked, max: mh.max, over: mh.over, tokens: mh.count, hint: hint.slice(0, 70), shot: sShot });
    }
    await page.evaluate(`document.querySelector('button[data-dial="${key}:${key === 'furigana' ? 2 : 0}"]')?.click()`);
    await g.wait(500);
  }
  shot = await shoot(page, 'dials-back-to-default');
  const worstDialMax = Math.max(...dialLog.map((d) => d.max));
  const brokeOut = dialLog.filter((d) => d.over > 0 || !d.clicked || d.tokens < 5);
  check(11, 'every dial setting cycles cleanly — max interactive token height never exceeds 50px',
    brokeOut.length === 0 && worstDialMax <= 50,
    `9 settings driven; worst max button.tok height ${worstDialMax}px; settings breaking the ceiling: ${brokeOut.length}` +
    (brokeOut.length ? ` → ${JSON.stringify(brokeOut.map((b) => `${b.key}:${b.s}=${b.max}px/${b.over}over`))}` : ''), shot);
  check(11, 'WP5b: the hint copy changes when the ふりがな dial reaches つねに',
    hintAt2 !== hintAt0 && /English|英語/.test(hintAt2) && !/reading|ふりがな/.test(hintAt2),
    `off: "${hintAt0}" | always: "${hintAt2}"`, shot);
  check(11, 'stage 11: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* --------------------------------------------- 12 WP6 VARIANT COMBOS */
  stage = '12-wp6-variants';
  // the 入口 row only re-homes the app from the shelf, so stand on the shelf
  // before asking for the drift universe back
  await toShelf(page);
  const vOpen = await page.evaluate(`(() => { const b = document.querySelector('#variants .vbody');
    return b ? getComputedStyle(b).display !== 'none' : false; })()`);
  if (!vOpen) await page.evaluate(`document.getElementById('variants-toggle')?.click()`);
  await g.wait(700);
  const setV = async (row, opt) => {
    await page.evaluate(`document.querySelector('button[data-variant="${row}:${opt}"]')?.click()`);
    await g.wait(700);
  };
  const combos = [['stage3', 'staged'], ['stage3', 'recenter'], ['stage4', 'staged'], ['stage4', 'recenter']];
  const comboLog = [];
  for (const [ladder, sat] of combos) {
    await setV('ladder', ladder);
    await setV('sattap', sat);
    const got = await page.evaluate(`window.__DRIFT_TAP__.get()`);
    const measure = await page.evaluate(`document.querySelector('#variants .measure')?.textContent ?? ''`);
    comboLog.push({ want: `${ladder}/${sat}`, got: `${got.ladder}/${got.satTap}`, measure: measure.slice(-46) });
  }
  shot = await shoot(page, 'wp6-combos-set');
  check(12, 'WP6: all four ladder × satellite combos are settable from the strip and reach the drift layer',
    comboLog.every((c) => c.want === c.got), comboLog.map((c) => `${c.want}→${c.got}`).join(' | '), shot);

  // behavioural proof — stage4 rung 1 raises the family with NOTHING read
  await setV('ladder', 'stage4');
  await setV('sattap', 'staged');
  await toDrift(page, g);
  const inDrift = await page.evaluate(`document.getElementById('drift-layer')?.classList.contains('active') ?? false`);
  // stage4's rung 1 only has a rung to stand on where a family can actually
  // bloom — the code says so itself, and answers with the reading where none
  // comes up. So keep trying words until one raises a family; that is the case
  // the row is about.
  let s4 = null;
  const tried4 = [];
  if (inDrift) {
    for (let i = 0; i < 4; i += 1) {
      await surfaceFully(page, g, 4);
      const seed4 = await pickWord(page, tried4);
      if (!seed4) break;
      tried4.push(seed4.w);
      const p4 = await page.evaluate(wordProbe(seed4.w));
      if (!p4.exists) continue;
      await g.tapAt(p4.x, p4.y);
      await g.wait(1700);
      const q4 = await page.evaluate(wordProbe(seed4.w));
      const w4 = await page.evaluate(worldProbe);
      s4 = { word: seed4.w, unfolded: q4.unfolded, glossed: q4.glossed, sats: w4.sats, centre: w4.centre, tried: [...tried4] };
      if (w4.sats > 0) break;
    }
  }
  shot = await shoot(page, 'wp6-stage4-rung1-family-only');
  check(12, 'WP6 stage4 changes the rung behaviour: rung 1 raises the family with nothing read yet',
    !!s4 && s4.sats > 0 && !s4.unfolded,
    s4 ? `"${s4.word}": satellites=${s4.sats} centre="${s4.centre}" unfolded=${s4.unfolded} glossed=${s4.glossed} (stage3 rung 1 had unfolded=true); words tried: ${JSON.stringify(s4.tried)}` : `could not reach the drift field (inDrift=${inDrift})`, shot);

  // recenter satellite behaviour
  await setV('ladder', 'stage3');
  await setV('sattap', 'recenter');
  await g.wait(800);
  let sRec = null;
  const triedRec = [];
  for (let attempt = 0; attempt < 6 && !sRec; attempt += 1) {
    await surfaceFully(page, g, 5);
    const seed5 = await pickWord(page, triedRec);
    if (!seed5) continue;
    triedRec.push(seed5.w);
    const p5 = await page.evaluate(wordProbe(seed5.w));
    if (!p5.exists) continue;
    await g.tapAt(p5.x, p5.y);
    await g.wait(1800); // satellites glide to their ring before they are tappable
    const c0 = (await page.evaluate(worldProbe)).centre;
    const satP = await page.evaluate(`(() => {
      const sats = [...document.querySelectorAll('#drift-layer .word.bsat')].map((el) => {
        const r = el.getBoundingClientRect();
        return { el, r, x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      for (const s of sats) {
        if (!s.r.width || s.r.left < 25 || s.r.right > innerWidth - 25 || s.r.top < 160 || s.r.bottom > innerHeight - 150) continue;
        if (sats.some((o) => o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 26)) continue;
        return { w: s.el.querySelector('.base')?.textContent ?? '' };
      }
      return null;
    })()`);
    if (!satP?.w) continue;
    const sp2 = await page.evaluate(wordProbe(satP.w));
    if (!sp2.exists) continue;
    await g.tapAt(sp2.x, sp2.y);
    await g.wait(1800);
    const c1 = (await page.evaluate(worldProbe)).centre;
    sRec = { sat: satP.w, before: c0, after: c1, attempt: attempt + 1 };
  }
  shot = await shoot(page, 'wp6-sattap-recenter-tap1');
  check(12, 'WP6 recenter changes the rung behaviour: ONE satellite tap makes it the planet',
    !!sRec && sRec.after === sRec.sat,
    sRec ? `tapped satellite "${sRec.sat}" once: centre "${sRec.before}" -> "${sRec.after}" (staged needed two taps)` : 'no satellite reachable under recenter', shot);

  await setV('ladder', 'stage3');
  await setV('sattap', 'staged');
  const restored = await page.evaluate(`window.__DRIFT_TAP__.get()`);
  check(12, 'both WP6 rows switch back to their defaults (3-stage / staged)',
    restored.ladder === 'stage3' && restored.satTap === 'staged', JSON.stringify(restored), shot);
  check(12, 'stage 12: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* ------------------------------------------------------- 13 PARTICLE */
  stage = '13-particle';
  await setV('entry', 'shelf');
  await g.wait(1200);
  const artForParticle = await openArticle(page, g, null);
  const readerUp = await page.evaluate(`document.querySelectorAll('#reader .tok').length`);
  check(13, 'the reader is standing before the particle hold', readerUp > 20,
    `"${artForParticle.title}" (${artForParticle.id}) with ${readerUp} tokens; body[data-view]="${artForParticle.view}" driftActive=${artForParticle.drift}`, shot);
  // the particle doors are the tokens the reader itself marks .particle — a
  // plain span that merely reads は is not one
  // Aim at a particle already clear of the fixed chrome and read its live
  // centre — scrollIntoViewIfNeeded parks a token at the top edge, underneath
  // the chrome bar, and the touch then lands on the chrome instead.
  const partCount = await page.evaluate(`document.querySelectorAll('#reader .tok.particle').length`);
  await page.evaluate(`window.scrollTo(0, 0)`);
  await g.wait(400);
  const partPick = await page.evaluate(`(() => {
    const pick = () => {
      for (const n of document.querySelectorAll('#reader .tok.particle')) {
        const r = n.getClientRects()[0] ?? n.getBoundingClientRect();
        if (!r.width || r.top < 200 || r.bottom > innerHeight - 120) continue;
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!hit || hit.closest('.tok.particle') !== n) continue;
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, txt: n.textContent.trim() };
      }
      return null;
    };
    let got = pick();
    for (let i = 0; i < 6 && !got; i += 1) { window.scrollBy(0, 240); got = pick(); }
    return got;
  })()`);
  const partText = partPick?.txt ?? '';
  if (partPick) {
    // FULL_MS is 2100 ms — hold past it, then let the sheet arrive
    await g.tapAt(partPick.x, partPick.y, 2600);
    await g.wait(900);
  }
  const particle = await page.evaluate(`(() => {
    const s = document.getElementById('sheet');
    return { sheet: !!s, node: s?.dataset?.node ?? '', head: s?.querySelector('.headword')?.textContent ?? '',
      role: s?.querySelector('.sense-pos')?.textContent ?? '',
      examples: s ? s.querySelectorAll('.example').length : 0,
      text: s ? s.textContent.replace(/\\s+/g, ' ').slice(0, 140) : '' };
  })()`);
  shot = await shoot(page, 'particle-page');
  check(13, 'holding a particle opens its particle page with examples',
    particle.sheet && particle.examples > 0,
    `${partCount} particle doors in this article; held "${partText}" → node="${particle.node}" headword="${particle.head}" role="${particle.role}" examples=${particle.examples}`, shot);
  await page.locator('#sheet-close').click({ timeout: 1500 }).catch(() => {});
  await g.wait(500);
  check(13, 'stage 13: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* ------------------------------------------------ 14 WP8 STROKE PAGE */
  stage = '14-strokes';
  if (!(await page.evaluate(`document.querySelectorAll('#reader .tok.content').length`))) {
    await openArticle(page, g, null);
  }
  // clear any quick-look left standing, then hold a kanji-bearing word until a
  // word sheet with kanji doors is actually open — try a few words, because not
  // every entry carries a kanji row
  await page.evaluate(`document.getElementById('mini')?.remove()`);
  let kRows = 0;
  const kCands = await page.evaluate(`(() => {
    const ts = [...document.querySelectorAll('#reader .tok.content')];
    const out = [];
    ts.forEach((t, i) => { if (/[\\u4e00-\\u9fff]/.test(t.dataset.word || t.textContent)) out.push(i); });
    return out.slice(0, 6);
  })()`);
  for (const kIdx of kCands) {
    await page.locator('#sheet-close').click({ timeout: 1000 }).catch(() => {});
    await g.wait(400);
    await tapSel(page, g, '#reader .tok.content', kIdx, 2600).catch(() => {});
    await page.waitForSelector('#sheet', { timeout: 8000 }).catch(() => {});
    await g.wait(600);
    kRows = await page.evaluate(`document.querySelectorAll('#sheet [data-kanjirow]').length`);
    if (kRows > 0) break;
  }
  await tapSel(page, g, '#sheet [data-kanjirow]', 0).catch(() => {});
  await g.wait(900);
  const kSheet = await page.evaluate(`(() => ({
    sheet: !!document.getElementById('sheet'), node: document.getElementById('sheet')?.dataset?.node ?? '',
    door: !!document.getElementById('strokes-door'), strokes: document.getElementById('strokes-door')?.dataset?.strokes ?? '',
  }))()`);
  shot = await shoot(page, 'kanji-sheet-with-stroke-door');
  check(14, 'a kanji door opens a kanji sheet carrying the 筆順 door',
    kSheet.sheet && kSheet.door, `${kRows} kanji rows on the word sheet; kanji sheet node="${kSheet.node}", door strokes=${kSheet.strokes}`, shot);

  const sheetScroll = await page.evaluate(`(() => { const s = document.getElementById('sheet'); if (!s) return -1; s.scrollTop = 120; return Math.round(s.scrollTop); })()`);
  await page.locator('#strokes-door').click({ timeout: 4000 }).catch(() => {});
  await g.wait(1000);
  const sp = await page.evaluate(`(() => {
    const p = document.getElementById('stroke-page');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { full: Math.round(r.width) >= innerWidth - 2 && Math.round(r.height) >= innerHeight - 2,
      w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight,
      kanji: p.dataset.kanji, state: p.dataset.state, motion: p.dataset.motion, numbers: p.dataset.numbers,
      counter: document.getElementById('stroke-count')?.textContent ?? '',
      current: Number(document.getElementById('stroke-count')?.dataset?.current ?? -1),
      total: document.getElementById('stroke-count')?.dataset?.total ?? '',
      replay: !!document.getElementById('stroke-replay'), numbersBtn: !!document.getElementById('stroke-numbers'),
      paths: document.querySelectorAll('#stroke-canvas .stroke-ink path').length };
  })()`);
  shot = await shoot(page, 'stroke-page-open');
  check(14, 'WP8: the stroke page opens full-screen with a counter, replay and a numbers toggle',
    !!sp && sp.full && sp.replay && sp.numbersBtn && sp.paths > 0,
    sp ? `${sp.w}×${sp.h} vs viewport ${sp.vw}×${sp.vh}; kanji=${sp.kanji} state=${sp.state} motion=${sp.motion}; counter "${sp.counter}" of ${sp.total}; ${sp.paths} stroke paths` : 'no #stroke-page', shot);

  const c0 = sp?.current ?? -1;
  await g.wait(2600);
  const c1 = await page.evaluate(`Number(document.getElementById('stroke-count')?.dataset?.current ?? -1)`);
  shot = await shoot(page, 'stroke-page-animating');
  check(14, 'WP8: the strokes animate — the counter advances unaided', c1 > c0,
    `stroke counter ${c0} → ${c1} over 2.6s (of ${sp?.total})`, shot);

  await page.locator('#stroke-replay').click({ timeout: 3000 }).catch(() => {});
  await g.wait(500);
  const cR = await page.evaluate(`Number(document.getElementById('stroke-count')?.dataset?.current ?? -1)`);
  await g.wait(1800);
  const cR2 = await page.evaluate(`Number(document.getElementById('stroke-count')?.dataset?.current ?? -1)`);
  shot = await shoot(page, 'stroke-page-replay');
  check(14, 'WP8: replay restarts the animation from the first stroke', cR < c1 && cR2 > cR,
    `after replay counter dropped to ${cR} then climbed to ${cR2} (was ${c1})`, shot);

  // the numbers are hidden by display:none on their GROUP, so a child's own
  // computed style still reads "visible" — measure rendered geometry instead
  const numsState = () => page.evaluate(`(() => {
    const grp = document.querySelector('#stroke-canvas .stroke-nums');
    const gr = grp?.getBoundingClientRect();
    return { flag: document.getElementById('stroke-page')?.dataset?.numbers ?? '',
      groupDisplay: grp ? getComputedStyle(grp).display : 'none',
      groupPainted: !!(gr && gr.width > 0 && gr.height > 0),
      painted: [...document.querySelectorAll('#stroke-canvas .stroke-num')]
        .filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length };
  })()`);
  const numsBefore = await numsState();
  await page.locator('#stroke-numbers').click({ timeout: 3000 }).catch(() => {});
  await g.wait(600);
  const numsAfter = await numsState();
  shot = await shoot(page, 'stroke-page-numbers-off');
  check(14, 'WP8: the numbers toggle changes what is painted',
    numsAfter.flag === 'off' && numsBefore.groupPainted && !numsAfter.groupPainted,
    `data-numbers ${numsBefore.flag} → ${numsAfter.flag}; the 番号 group display ${numsBefore.groupDisplay} → ${numsAfter.groupDisplay}, painted box ${numsBefore.groupPainted} → ${numsAfter.groupPainted} (${numsBefore.painted} → ${numsAfter.painted} numerals with a rendered box)`, shot);
  await page.locator('#stroke-numbers').click({ timeout: 3000 }).catch(() => {});
  await g.wait(400);

  await page.locator('#strokes-back').click({ timeout: 3000 }).catch(() => {});
  await g.wait(900);
  const backSheet = await page.evaluate(`(() => { const s = document.getElementById('sheet');
    return { sheet: !!s, scroll: s ? Math.round(s.scrollTop) : -1, node: s?.dataset?.node ?? '', page: !!document.getElementById('stroke-page') }; })()`);
  shot = await shoot(page, 'stroke-back-restores-sheet');
  check(14, 'WP8: 戻る returns to the kanji sheet at its exact scroll offset',
    backSheet.sheet && !backSheet.page && backSheet.scroll === sheetScroll,
    `sheet=${backSheet.sheet} node="${backSheet.node}" scrollTop ${sheetScroll} → ${backSheet.scroll}`, shot);

  // the honest fallback: 丑 has no stroke data. Reach it through the app's own
  // front door — the search field — because __BUNKI_OPEN_ENTRY is the WP3 seam
  // and answers only while the drift universe is the standing view.
  await page.locator('#sheet-close').click({ timeout: 1500 }).catch(() => {});
  await toShelf(page);
  await page.locator('#search').fill('丑').catch(() => {});
  await g.wait(900);
  const hits丑 = await page.evaluate(`(() => {
    const box = document.getElementById('search-results') || document.getElementById('shelf-body');
    const hits = [...(box?.querySelectorAll('button') ?? [])];
    return { n: hits.length, first: hits[0]?.textContent?.trim().slice(0, 30) ?? '' };
  })()`);
  await tapSel(page, g, '#search-results button, #shelf-body button', 0).catch(() => {});
  await g.wait(1200);
  // the first hit is the WORD 丑; its kanji row is the door onto the kanji
  // sheet, which is where the 筆順 door lives
  let node丑 = await page.evaluate(`document.getElementById('sheet')?.dataset?.node ?? ''`);
  if (!node丑.startsWith('kanji:')) {
    await tapSel(page, g, '#sheet [data-kanjirow]', 0).catch(() => {});
    await g.wait(1000);
    node丑 = await page.evaluate(`document.getElementById('sheet')?.dataset?.node ?? ''`);
  }
  const opened丑 = `search "丑" → ${hits丑.n} hits, first "${hits丑.first}"; landed on ${node丑}`;
  await g.wait(300);
  const door丑 = await page.evaluate(`(() => {
    const d = document.getElementById('strokes-door');
    const info = { door: !!d, strokes: d?.dataset?.strokes ?? '', node: document.getElementById('sheet')?.dataset?.node ?? '' };
    if (d) d.click();
    return info;
  })()`);
  await g.wait(900);
  const fallback = await page.evaluate(`(() => {
    const p = document.getElementById('stroke-page');
    const miss = document.getElementById('stroke-missing');
    return { page: !!p, state: p?.dataset?.state ?? '', kanji: p?.dataset?.kanji ?? '', missing: !!miss,
      inkPaths: document.querySelectorAll('#stroke-canvas .stroke-ink path').length,
      text: (miss?.textContent ?? p?.textContent ?? '').replace(/\\s+/g, ' ').slice(0, 160) };
  })()`);
  shot = await shoot(page, 'stroke-nodata-fallback-丑');
  check(14, 'WP8: a no-data kanji (丑) gives an honest fallback, not an empty frame',
    fallback.page && fallback.state === 'nodata' && fallback.missing && fallback.inkPaths === 0,
    `open=${opened丑} sheetNode="${door丑.node}" door.strokes="${door丑.strokes}" → page state="${fallback.state}" missing=${fallback.missing} inkPaths=${fallback.inkPaths}; it says: "${fallback.text.slice(0, 100)}"`, shot);
  await page.locator('#strokes-back').click({ timeout: 3000 }).catch(() => {});
  await page.locator('#sheet-close').click({ timeout: 3000 }).catch(() => {});
  await page.evaluate(`(() => { const s = document.getElementById('search');
    if (s) { s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await g.wait(800);
  check(14, 'stage 14: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* ---------------------------------------------- 15 覚える / MEMORIZE */
  stage = '15-memorize';
  await openArticle(page, g, null);
  // hold words until one opens a full entry carrying 覚える — a short token can
  // sit under the chrome or have no entry behind it
  for (let i = 0; i < 5; i += 1) {
    if (await page.evaluate(`!!document.getElementById('take')`)) break;
    await page.locator('#sheet-close').click({ timeout: 1000 }).catch(() => {});
    await page.evaluate(`document.getElementById('mini')?.remove()`);
    await g.wait(400);
    await tapSel(page, g, '#reader .tok.content', i, 2600).catch(() => {});
    await page.waitForSelector('#sheet', { timeout: 8000 }).catch(() => {});
    await g.wait(600);
  }
  const takeBefore = await page.evaluate(`(() => ({
    btn: !!document.getElementById('take'), label: document.getElementById('take')?.textContent ?? '',
    head: document.querySelector('#sheet .headword')?.textContent ?? '', node: document.getElementById('sheet')?.dataset?.node ?? '' }))()`);
  await page.locator('#take').click({ timeout: 4000 }).catch(() => {});
  await g.wait(900);
  const takeAfter = await page.evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return { label: document.getElementById('take')?.textContent ?? '', taken: Array.isArray(s.taken) ? s.taken.length : 0,
      first: s.taken?.[0] ? JSON.stringify(s.taken[0]).slice(0, 90) : '' };
  })()`);
  shot = await shoot(page, 'memorize-taken');
  check(15, '覚える takes an item from a full entry and stores it',
    takeBefore.btn && /✓/.test(takeAfter.label) && takeAfter.taken > 0,
    `"${takeBefore.label.trim()}" → "${takeAfter.label.trim()}" on "${takeBefore.head}"; store.taken=${takeAfter.taken}, first=${takeAfter.first}`, shot);

  await page.locator('#sheet-close').click({ timeout: 2000 }).catch(() => {});
  await g.wait(500);
  await page.evaluate(`document.getElementById('tray')?.click()`);
  await g.wait(1000);
  const lists = await page.evaluate(`(() => {
    const main = document.querySelector('main') || document.body;
    const t = main.textContent.replace(/\\s+/g, ' ');
    const lines = [...main.querySelectorAll('.tray-line')];
    return { title: document.querySelector('.view-title')?.textContent ?? '',
      rows: lines.length,
      firstRow: lines[0] ? lines[0].textContent.replace(/\\s+/g, ' ').trim().slice(0, 60) : '',
      when: lines[0]?.querySelector('.when')?.textContent ?? '',
      heads: [...main.querySelectorAll('.list-head')].map((n) => n.textContent.trim().slice(0, 24)),
      text: t.slice(0, 400),
      cloze: /［|＿|〔|\\[\\s*\\]|文脈|cloze|MCD/i.test(t),
      // the schedule preview renders the FSRS due-time on each line
      schedule: /(in \\d+ ?(min|hour|day|month))|(\\d+\\s*(分|時間|日|月)後)|(auto · monthly)|(\\d{4}年\\d{1,2}月)/i.test(t),
      mastery: /(mastery|習熟度|習得度|達成率)|\\b\\d{1,3}\\s*%/i.test(t) };
  })()`);
  shot = await shoot(page, 'memorize-lists-view');
  check(15, 'the lists view shows the taken item', /覚える|Memoriz/i.test(lists.title) && lists.rows > 0,
    `title "${lists.title}"; ${lists.rows} tray line(s) under ${JSON.stringify(lists.heads)}; first line "${lists.firstRow}"`, shot);
  check(15, 'a cloze / schedule preview renders in the memorize loop',
    lists.cloze || lists.schedule,
    `cloze=${lists.cloze} schedule=${lists.schedule}; the line's next-due reads "${lists.when}" — "${lists.text.slice(0, 120)}"`, shot);
  check(15, 'FSRS pin: no aggregate mastery score anywhere on the memorize surfaces',
    !lists.mastery, `mastery/percentage pattern present = ${lists.mastery}`, shot);
  check(15, 'stage 15: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* ------------------------------------------------ 16 RELOAD / PERSIST */
  stage = '16-persistence';
  // make a drift judgment so bunki-drift-v1 has something to survive
  const inDrift16 = await toDrift(page, g);
  let judged = null;
  let trayAfter = '';
  if (inDrift16) {
    // a flick grades the word — the drift store's own judgment gesture. It only
    // counts while nothing is focused (mayGrade), so surface first.
    for (let i = 0; i < 4 && !judged; i += 1) {
      await surfaceFully(page, g, 4);
      // the flick needs 120 px of room inside the viewport, or the finger
      // leaves the surface mid-gesture and the judgment never lands
      const seed16 = await page.evaluate(`(() => {
        for (const el of document.querySelectorAll('#drift-layer .word')) {
          const b = el.querySelector('.base')?.textContent ?? '';
          const r = el.getBoundingClientRect();
          if (!b || !r.width) continue;
          if (r.left < 60 || r.right > innerWidth - 150 || r.top < 200 || r.bottom > innerHeight - 200) continue;
          if (parseFloat(el.style.opacity || '1') < 0.4) continue;
          return { w: b };
        }
        return null;
      })()`);
      if (!seed16) break;
      const p16 = await page.evaluate(wordProbe(seed16.w));
      if (!p16.exists) continue;
      await g.flick(p16.x, p16.y, 120);
      trayAfter = await page.evaluate(`document.getElementById('drift-tray')?.textContent ?? ''`);
      const wrote = await page.evaluate(`localStorage.getItem('bunki-drift-v1')`);
      if (wrote) judged = seed16.w;
    }
  }
  const pre = await page.evaluate(`(() => ({ corridor: localStorage.getItem('kairo-corridor-v1'), drift: localStorage.getItem('bunki-drift-v1') }))()`);
  shot = await shoot(page, 'before-reload');
  await page.reload({ waitUntil: 'load' });
  await g.wait(2200);
  const post = await page.evaluate(`(() => {
    const c = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
    return { taken: Array.isArray(c.taken) ? c.taken.length : 0,
      first: c.taken?.[0] ? JSON.stringify(c.taken[0]).slice(0, 80) : '',
      drift: localStorage.getItem('bunki-drift-v1') };
  })()`);
  shot = await shoot(page, 'after-reload');
  check(16, 'reload: the 覚える item survives in kairo-corridor-v1',
    post.taken > 0 && post.taken === takeAfter.taken, `taken ${takeAfter.taken} → ${post.taken}, first=${post.first}`, shot);
  check(16, 'reload: the drift judgment survives in bunki-drift-v1',
    !!pre.drift && post.drift === pre.drift,
    `flicked "${judged}" (tray now "${trayAfter.trim()}"); bunki-drift-v1 pre=${pre.drift ? pre.drift.slice(0, 70) : 'null'} post=${post.drift ? post.drift.slice(0, 70) : 'null'}`, shot);
  check(16, 'stage 16: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* -------------------------------------------------- 17 IMMERSION MODE */
  stage = '17-immersion';
  await toShelf(page);
  await page.evaluate(`document.querySelector('button[data-lang="ja"]')?.click()`);
  await g.wait(1000);
  const jaShelf = await page.evaluate(`(() => {
    const sel = '.eyebrow, .view-title, .shelf-title-en, .en-sub, .en-inline, .level-note, .shelf-snippet, .grammar-link, #back, #tray, .crumb';
    const ACRO = /^(JLPT|UTC|CC|BY|SA|NC|ND|SKR|NHK|JR|AI|N[1-5])$/;
    const offenders = [];
    for (const n of document.querySelectorAll(sel)) {
      const hits = (n.textContent.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !ACRO.test(w));
      if (hits.length) offenders.push({ cls: n.className.toString().slice(0, 24), words: [...new Set(hits)].slice(0, 3) });
    }
    const ph = document.getElementById('search')?.placeholder ?? '';
    if (/[A-Za-z]{3,}/.test(ph)) offenders.push({ cls: 'search@placeholder', words: [ph.slice(0, 24)] });
    const all = [...document.querySelectorAll(sel)].map((n) => n.textContent).join(' ') + ' ' + ph;
    // JLPT / UTC / SKR and the like are proper-noun acronyms inside level notes
    // and source provenance — content the app names, not English chrome
    const ACRONYM = /^(JLPT|UTC|CC|BY|SA|NC|ND|SKR|NHK|JR|AI|N[1-5])$/;
    const latin = (all.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !ACRONYM.test(w));
    // an .en-sub that renders NO text is not a leak — corridor.js emits the
    // element with an empty string in 日本語 mode. Count what is painted.
    const enNodes = [...document.querySelectorAll('.en-sub, .en-inline, .shelf-title-en')]
      .filter((n) => n.textContent.trim().length > 0);
    return { enNodes: enNodes.length,
      enNodeIds: enNodes.slice(0, 4).map((n) => n.className + ':"' + n.textContent.trim().slice(0, 20) + '" inside ' + (n.parentElement ? (n.parentElement.className || n.parentElement.id || n.parentElement.tagName) : '?')),
      latin: [...new Set(latin)].slice(0, 10), latinCount: latin.length,
      offenders: offenders.slice(0, 6),
      items: document.querySelectorAll('.shelf-item').length };
  })()`);
  shot = await shoot(page, 'immersion-ja-shelf');
  check(17, '日本語のみ: the shelf sheds its English chrome — no latin leaks',
    jaShelf.enNodes === 0 && jaShelf.latinCount === 0,
    `${jaShelf.items} items; english affordance nodes=${jaShelf.enNodes} ${JSON.stringify(jaShelf.enNodeIds)}; latin runs=${jaShelf.latinCount} ${JSON.stringify(jaShelf.latin)}; carried by ${JSON.stringify(jaShelf.offenders)}`, shot);

  await tapSel(page, g, '.shelf-item', 0).catch(() => {});
  await page.waitForSelector('#reader .tok', { timeout: 25000 }).catch(() => {});
  await g.wait(700);
  const jaReader = await page.evaluate(`(() => {
    const sel = '.eyebrow, .view-title, .gesture-hint, .en-sub, .en-inline, #dials-toggle, .crumb, .level-note';
    const ACRO = /^(JLPT|UTC|CC|BY|SA|NC|ND|SKR|NHK|JR|AI|N[1-5])$/;
    const offenders = [];
    for (const n of document.querySelectorAll(sel)) {
      const hits = (n.textContent.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !ACRO.test(w));
      if (hits.length) offenders.push({ cls: n.className.toString().slice(0, 24), words: [...new Set(hits)].slice(0, 3) });
    }
    const t = [...document.querySelectorAll(sel)].map((n) => n.textContent).join(' ');
    const latin = (t.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !ACRO.test(w));
    return { enNodes: [...document.querySelectorAll('.en-sub, .en-inline')].filter((n) => n.textContent.trim()).length,
      latin: [...new Set(latin)].slice(0, 10),
      latinCount: latin.length, offenders: offenders.slice(0, 6),
      tokens: document.querySelectorAll('#reader .tok').length,
      hint: document.querySelector('.gesture-hint')?.textContent?.trim() ?? '' };
  })()`);
  shot = await shoot(page, 'immersion-ja-reader');
  check(17, '日本語のみ: the reader chrome carries no latin',
    jaReader.enNodes === 0 && jaReader.latinCount === 0,
    `${jaReader.tokens} tokens; hint "${jaReader.hint}"; english nodes=${jaReader.enNodes}; latin=${jaReader.latinCount} ${JSON.stringify(jaReader.latin)}; carried by ${JSON.stringify(jaReader.offenders)}`, shot);

  await page.locator('#back').click({ timeout: 2000 }).catch(() => {});
  await g.wait(700);
  await page.evaluate(`document.querySelector('button[data-lang="bi"]')?.click()`);
  await g.wait(900);
  const backBi = await page.evaluate(`document.querySelectorAll('.en-sub, .en-inline, .shelf-title-en').length`);
  shot = await shoot(page, 'immersion-back-to-EN');
  check(17, 'switching back to EN restores the bilingual chrome', backBi > 0, `${backBi} english affordances back`, shot);
  check(17, 'stage 17: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);

  /* -------------------------------------------- 18 VARIANTS PANEL / TAPS */
  stage = '18-variants-panel';
  const panelOpen = await page.evaluate(`(() => (document.querySelector('#variants .vbody') ? getComputedStyle(document.querySelector('#variants .vbody')).display !== 'none' : false))()`);
  if (!panelOpen) {
    await page.evaluate(`document.getElementById('variants-toggle')?.click()`);
    await g.wait(700);
  }
  const panel = await page.evaluate(`(() => {
    const bar = document.getElementById('variants');
    if (!bar) return null;
    const rows = [...bar.querySelectorAll('.vrow')].map((r) => r.querySelector('.vlabel')?.textContent?.trim() ?? '');
    const btns = [...bar.querySelectorAll('.vseg button')].map((b) => {
      const r = b.getBoundingClientRect();
      return { text: b.textContent.trim().slice(0, 18), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    });
    return { rows, btns, small: btns.filter((b) => b.h < 44 || b.w < 44) };
  })()`);
  shot = await shoot(page, 'variants-panel-all-rows');
  const WANT = ['A 札の形', 'B 難易度', 'C 可読性', 'D 入口', 'E 奥行', 'F 触れの段', 'G 衛星の触れ'];
  const missingRows = WANT.filter((r) => !panel?.rows?.some((x) => x.startsWith(r)));
  check(18, 'every variants row is present, including WP6’s F 触れの段 and G 衛星の触れ',
    missingRows.length === 0, missingRows.length ? `missing: ${missingRows.join(', ')}` : `${panel.rows.length} rows: ${panel.rows.map((r) => r.split(/\s/)[0]).join(' ')}`, shot);
  check(18, 'every variants control is at least 44px on both axes',
    (panel?.small?.length ?? 1) === 0,
    panel ? `${panel.btns.length} controls; ${panel.small.length} under 44px${panel.small.length ? ' → ' + JSON.stringify(panel.small.slice(0, 4)) : ''}` : 'no panel', shot);
  check(18, 'stage 18: zero console/page errors', errCount() === 0, `${errCount()} errors`, shot);
  await m.context.close();

  /* ------------------------------------------------ 19 REDUCED MOTION */
  stage = '19-reduced-motion';
  {
    const r = await newPage(browser, { reducedMotion: 'reduce' });
    const rp = r.page;
    const rg = r.g;
    await boot(rp, base);
    let s = await shoot(rp, 'reduced-motion-arrival');
    const still = await driftMotion(rp, 5000);
    check(19, 'prefers-reduced-motion: the drift field is completely still (0.00 px/s over 5s)',
      still.total === 0 && still.moved === 0,
      `${still.moved}/${still.n} words moved; total ${still.total.toFixed(2)} px, worst single word ${still.worst.toFixed(2)} px, mean ${still.perSec.toFixed(3)} px/s over 5s`, s);

    const rseed = await pickWord(rp);
    const rprobe = await rp.evaluate(wordProbe(rseed.w));
    await rg.tapAt(rprobe.x, rprobe.y);
    await rg.wait(1200);
    const rAfter = await rp.evaluate(worldProbe);
    s = await shoot(rp, 'reduced-motion-tap-still-works');
    check(19, 'reduced motion: interactions still work — a tap still climbs the ladder',
      rAfter.unfolded > 0 || rAfter.sats > 0,
      `tapped "${rseed.w}": unfolded=${rAfter.unfolded} satellites=${rAfter.sats} centre="${rAfter.centre}"`, s);

    await toShelf(rp);
    await tapSel(rp, rg, '.shelf-item', 0).catch(() => {});
    await rp.waitForSelector('#reader .tok', { timeout: 25000 }).catch(() => {});
    const rk = await rp.evaluate(`(() => { const ts = [...document.querySelectorAll('#reader .tok.content')];
      return ts.findIndex((t) => /[\\u4e00-\\u9fff]/.test(t.dataset.word || t.textContent)); })()`);
    await tapSel(rp, rg, '#reader .tok.content', Math.max(0, rk), 2400);
    await rp.waitForSelector('#sheet', { timeout: 10000 }).catch(() => {});
    await rg.wait(500);
    await tapSel(rp, rg, '#sheet [data-kanjirow]', 0).catch(() => {});
    await rg.wait(800);
    await rp.locator('#strokes-door').click({ timeout: 4000 }).catch(() => {});
    await rg.wait(900);
    const rsp = await rp.evaluate(`(() => { const p = document.getElementById('stroke-page');
      return p ? { motion: p.dataset.motion, state: p.dataset.state,
        prev: !!document.getElementById('stroke-prev'), next: !!document.getElementById('stroke-next'),
        current: Number(document.getElementById('stroke-count')?.dataset?.current ?? -1),
        total: document.getElementById('stroke-count')?.dataset?.total ?? '' } : null; })()`);
    const rc0 = rsp?.current ?? -1;
    await rg.wait(2600);
    const rc1 = await rp.evaluate(`Number(document.getElementById('stroke-count')?.dataset?.current ?? -1)`);
    s = await shoot(rp, 'reduced-motion-stroke-page-static');
    check(19, 'reduced motion: the stroke page is static — nothing animates on its own',
      !!rsp && rsp.motion === 'reduced' && rc1 === rc0,
      rsp ? `data-motion=${rsp.motion}; counter ${rc0} → ${rc1} over 2.6s (of ${rsp.total})` : 'no #stroke-page', s);
    // in reduced motion the page opens fully drawn, so 次の画 has nowhere left
    // to go: step BACK first, then forward, and require both to move
    await rp.locator('#stroke-prev').click({ timeout: 3000 }).catch(() => {});
    await rg.wait(500);
    const rcBack = await rp.evaluate(`Number(document.getElementById('stroke-count')?.dataset?.current ?? -1)`);
    await rp.locator('#stroke-next').click({ timeout: 3000 }).catch(() => {});
    await rg.wait(500);
    const rc2 = await rp.evaluate(`Number(document.getElementById('stroke-count')?.dataset?.current ?? -1)`);
    s = await shoot(rp, 'reduced-motion-stroke-stepped');
    check(19, 'reduced motion: the stroke page offers step-through and both directions move',
      !!rsp && rsp.prev && rsp.next && rcBack < rc1 && rc2 > rcBack,
      rsp ? `prev=${rsp.prev} next=${rsp.next}; counter ${rc1} →(前の画) ${rcBack} →(次の画) ${rc2} of ${rsp.total}` : 'no #stroke-page', s);
    check(19, 'stage 19: zero console/page errors', errCount() === 0, `${errCount()} errors`, s);
    await r.context.close();
  }

  /* ------------------------------------------------- 20 320px and 1280px */
  stage = '20-widths';
  {
    const n = await newPage(browser, { viewport: { width: 320, height: 720 } });
    const p = n.page;
    const ng = n.g;
    await boot(p, base);
    const rows = [];
    let s = await shoot(p, '320-drift');
    rows.push({ label: 'drift', ...(await overflow(p)) });
    await toShelf(p);
    s = await shoot(p, '320-shelf');
    rows.push({ label: 'shelf', ...(await overflow(p)) });
    await p.locator('#search').fill('世').catch(() => {});
    await ng.wait(900);
    s = await shoot(p, '320-search');
    rows.push({ label: 'search', ...(await overflow(p)) });
    await p.locator('#search').fill('').catch(() => {});
    await ng.wait(600);
    await tapSel(p, ng, '.shelf-item', 0).catch(() => {});
    await p.waitForSelector('#reader .tok', { timeout: 20000 }).catch(() => {});
    await ng.wait(700);
    s = await shoot(p, '320-reader');
    rows.push({ label: 'reader', ...(await overflow(p)) });
    await tapSel(p, ng, '#reader .tok.content', 0, 2400).catch(() => {});
    await ng.wait(900);
    s = await shoot(p, '320-sheet');
    rows.push({ label: 'sheet', ...(await overflow(p)) });
    const bad = rows.filter((r) => r.scrollW > r.clientW + 1);
    check(20, '320px: no horizontal overflow on shelf / reader / sheet / search',
      bad.length === 0, rows.map((r) => `${r.label} ${r.scrollW}/${r.clientW}`).join(' · '), s);
    await n.context.close();
  }
  {
    const n = await newPage(browser, { viewport: { width: 1280, height: 900 }, touch: false });
    const p = n.page;
    const ng = n.g;
    await boot(p, base);
    const bleed = await p.evaluate(`(() => { const l = document.getElementById('drift-layer'); const r = l.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, x: Math.round(r.x), y: Math.round(r.y),
        words: document.querySelectorAll('#drift-layer .word').length }; })()`);
    let s = await shoot(p, '1280-drift');
    check(20, '1280px: the drift field is full-bleed',
      Math.abs(bleed.w - bleed.vw) <= 2 && Math.abs(bleed.h - bleed.vh) <= 2 && bleed.x === 0 && bleed.y === 0,
      `layer ${bleed.w}×${bleed.h} at (${bleed.x},${bleed.y}) vs viewport ${bleed.vw}×${bleed.vh}; ${bleed.words} words`, s);

    const rows = [{ label: 'drift', ...(await overflow(p)) }];
    await toShelf(p);
    s = await shoot(p, '1280-shelf');
    rows.push({ label: 'shelf', ...(await overflow(p)) });
    await p.locator('#search').fill('sekai').catch(() => {});
    await ng.wait(900);
    s = await shoot(p, '1280-search');
    rows.push({ label: 'search', ...(await overflow(p)) });
    await p.locator('#search').fill('').catch(() => {});
    await ng.wait(600);
    await p.locator('.shelf-item').first().click({ timeout: 8000 }).catch(() => {});
    await p.waitForSelector('#reader .tok', { timeout: 25000 }).catch(() => {});
    await ng.wait(800);
    s = await shoot(p, '1280-reader');
    rows.push({ label: 'reader', ...(await overflow(p)) });
    const measure = await p.evaluate(`(() => { const b = document.getElementById('reader').getBoundingClientRect();
      return { w: Math.round(b.width), left: Math.round(b.left), right: Math.round(innerWidth - b.right), vw: innerWidth }; })()`);
    check(20, 'WP5d: the 1280 reader measure is 760–880px and centred',
      measure.w >= 760 && measure.w <= 880 && Math.abs(measure.left - measure.right) <= 4,
      `measure ${measure.w}px; gutters ${measure.left} / ${measure.right} at viewport ${measure.vw}`, s);

    await p.locator('#reader .tok.content').first().click({ timeout: 8000 }).catch(() => {});
    await ng.wait(400);
    await p.locator('#reader .tok.content').first().click({ timeout: 8000 }).catch(() => {});
    await ng.wait(1000);
    s = await shoot(p, '1280-sheet');
    rows.push({ label: 'sheet', ...(await overflow(p)) });
    const deskEntry = await p.evaluate(`(() => ({ sheet: !!document.getElementById('sheet'),
      head: document.querySelector('#sheet .headword')?.textContent ?? '' }))()`);
    check(20, '1280px desktop: a full entry opens from the reader without touch', deskEntry.sheet,
      `sheet=${deskEntry.sheet} headword="${deskEntry.head}"`, s);
    const bad = rows.filter((r) => r.scrollW > r.clientW + 1);
    check(20, '1280px: no horizontal overflow on shelf / reader / sheet / search',
      bad.length === 0, rows.map((r) => `${r.label} ${r.scrollW}/${r.clientW}`).join(' · '), s);
    check(20, 'stage 20: zero console/page errors', errCount() === 0, `${errCount()} errors`, s);
    await n.context.close();
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
