/**
 * Hunt regressions — the eight defects the 2026-08-08 adversarial workflow
 * confirmed, each pinned as a permanent check so none can ever come back.
 * (docs/prompts/DRIFT_ZERO_QUIRK_SPEC_2026-08-08.md §4.3: the case stays in
 * the matrix forever after.)
 *
 * Usage: node verify-drift-hunt.mjs
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const CORRIDOR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const server = createServer((q, r) => {
  const p = decodeURIComponent((q.url ?? '/').split('?')[0]);
  const f = resolve(CORRIDOR, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
  if (!f.startsWith(CORRIDOR) || !existsSync(f)) return void (r.writeHead(404), r.end());
  r.writeHead(200, { 'cache-control': 'no-store', 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
  r.end(readFileSync(f));
});
const base = await new Promise((ok) =>
  server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${server.address().port}`)),
);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await ctx.addInitScript('try{localStorage.clear()}catch(e){}');
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const cdp = await ctx.newCDPSession(page);
const T = (type, pts) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
const tap = async (x, y) => {
  await T('touchStart', [[x, y]]);
  await page.waitForTimeout(65);
  await T('touchEnd', []);
};
const drag = async (x0, y0, x1, y1, ms, steps = 8) => {
  await T('touchStart', [[x0, y0]]);
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(ms / steps);
    await T('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
  }
  await T('touchEnd', []);
};
const boot = async () => {
  await page.goto(`${base}/index.html?entry=drift`);
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await page.waitForTimeout(2300);
};
const wordAt = (label) => `(() => {
  const el = [...document.querySelectorAll('#drift-layer .word')].find((n) => (n.querySelector('.base')?.textContent ?? '') === ${JSON.stringify(label)});
  if (!el) return { exists: false };
  const r = el.getBoundingClientRect();
  return { exists: true, x: r.x + r.width / 2, y: r.y + r.height / 2, op: parseFloat(el.style.opacity || '1') };
})()`;
const world = `(() => ({
  ctr: document.querySelector('#drift-layer .word.bctr')?.querySelector('.base')?.textContent ?? null,
  sats: document.querySelectorAll('#drift-layer .word.bsat').length,
  tray: document.getElementById('drift-tray')?.textContent ?? '',
  depth: document.getElementById('depth')?.textContent ?? '',
  card: document.getElementById('card')?.classList.contains('open') ?? false,
  radoc: document.getElementById('radoc')?.classList.contains('open') ?? false,
}))()`;
const anyWord = `(() => {
  for (const el of document.querySelectorAll('#drift-layer .word')) {
    const r = el.getBoundingClientRect();
    if (!r.width || el.style.pointerEvents === 'none') continue;
    if (parseFloat(el.style.opacity || '1') < 0.35) continue;   // a fading word is not a target
    if (/[\\u4e00-\\u9fff]/.test(el.textContent) && r.left > 70 && r.right < 310 && r.top > 300 && r.bottom < 600)
      return { w: el.querySelector('.base').textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
})()`;

let fails = 0;
const check = (name, pass, detail = '') => {
  if (!pass) fails += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '}${name}${detail ? '  — ' + detail : ''}`);
};

/* 1 · camera hands never judge (P0) — a third finger on a word while two
 * fingers pinch, then a pinch finger lifts: nothing may be graded. */
await boot();
let w = await page.evaluate(anyWord);
await tap(w.x, w.y);
await page.waitForTimeout(900);
let before = await page.evaluate(world);
await T('touchStart', [[w.x + 120, w.y + 6]]);
await T('touchStart', [[w.x + 120, w.y + 6], [w.x - 40, w.y + 170]]);
await page.waitForTimeout(60);
await T('touchStart', [[w.x + 120, w.y + 6], [w.x - 40, w.y + 170], [w.x, w.y]]);
await page.waitForTimeout(80);
await T('touchEnd', [[w.x - 40, w.y + 170], [w.x, w.y]]);
await page.waitForTimeout(700);
let after = await page.evaluate(world);
let word = await page.evaluate(wordAt(w.w));
check('hunt · a lifting pinch finger never grades the word beneath a third finger',
  after.tray === before.tray && word.exists,
  `tray "${before.tray}" → "${after.tray}", word present=${word.exists}`);
await T('touchEnd', []);

/* 2 · the radical explainer is a modal, not a hole (P0) — its taps must not
 * dismantle the dive stack, and its close button must be reachable. */
await boot();
w = await page.evaluate(anyWord);
await tap(w.x, w.y);
await page.waitForTimeout(500);
await tap(w.x, w.y);
await page.waitForTimeout(400);
await tap(w.x, w.y);
await page.waitForTimeout(1500); // dive
let glyph = await page.evaluate(`(() => {
  const el = document.querySelector('#drift-layer .glyph');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
if (glyph) {
  await tap(glyph.x, glyph.y);
  await page.waitForTimeout(1500);
}
// the explainer lives on a radical card: hop into a radical chip
const part = await page.evaluate(`(() => {
  const el = document.querySelector('#drift-layer .part, #drift-layer .glyph.comp');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
if (part) {
  await tap(part.x, part.y);
  await page.waitForTimeout(1600);
}
const depthBefore = (await page.evaluate(world)).depth;
const radQ = await page.evaluate(`(() => {
  const c = document.getElementById('card');
  if (!c || !c.classList.contains('open')) {
    const ctr = document.querySelector('#drift-layer .word.center, #drift-layer .glyph.center');
    if (ctr) { const r = ctr.getBoundingClientRect(); return { openFirst: { x: r.x + r.width / 2, y: r.y + r.height / 2 } }; }
  }
  const b = document.querySelector('#drift-layer .radq');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
if (radQ?.openFirst) {
  await tap(radQ.openFirst.x, radQ.openFirst.y);
  await page.waitForTimeout(900);
}
const radQ2 = await page.evaluate(`(() => {
  const b = document.querySelector('#drift-layer .radq');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
if (radQ2) {
  await tap(radQ2.x, radQ2.y);
  await page.waitForTimeout(700);
  const openState = await page.evaluate(world);
  await tap(195, 400); // a paragraph of the explainer
  await page.waitForTimeout(500);
  const afterP = await page.evaluate(world);
  check('hunt · explainer taps do not dismantle the world beneath it',
    openState.radoc && afterP.depth === openState.depth && afterP.radoc,
    `depth "${openState.depth}" → "${afterP.depth}", still open=${afterP.radoc}`);
  const xBtn = await page.evaluate(`(() => {
    const b = document.getElementById('radocX');
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, hitsSelf: b.contains(hit) || hit === b };
  })()`);
  check('hunt · the explainer close button is reachable by a finger', xBtn.hitsSelf,
    `hit-test at (${xBtn.x.toFixed(0)},${xBtn.y.toFixed(0)}) reaches the X: ${xBtn.hitsSelf}`);
  await tap(xBtn.x, xBtn.y);
  await page.waitForTimeout(600);
  const closed = await page.evaluate(world);
  check('hunt · the explainer closes without navigating the app away',
    !closed.radoc && closed.depth === depthBefore,
    `radoc open=${closed.radoc}, depth "${depthBefore}" → "${closed.depth}"`);
} else {
  check('hunt · explainer reachable in a dive', false, 'no 部首とは？ button found');
}

/* 3 · inside a dive, only a deliberate tap surfaces (P1) */
await boot();
w = await page.evaluate(anyWord);
for (let i = 0; i < 3; i++) {
  const at = await page.evaluate(wordAt(w.w));
  if (!at.exists) break;
  await tap(at.x, at.y);
  await page.waitForTimeout(i === 2 ? 1500 : 450);
}
const inDive = await page.evaluate(world);
await drag(300, 620, 210, 620, 560); // slow drag on water
await page.waitForTimeout(700);
const afterDrag = await page.evaluate(world);
check('hunt · a slow drag on water inside a dive does not surface a level',
  inDive.depth !== '' && afterDrag.depth === inDive.depth,
  `depth "${inDive.depth}" → "${afterDrag.depth}"`);
await T('touchStart', [[300, 640]]);
await page.waitForTimeout(900);
await T('touchEnd', []);
await page.waitForTimeout(600);
const afterHold = await page.evaluate(world);
check('hunt · a long press on water inside a dive does not surface a level',
  afterHold.depth === inDive.depth, `depth "${inDive.depth}" → "${afterHold.depth}"`);

/* 4 · a cancelled drag leaves no ghost offset (P1) */
await boot();
w = await page.evaluate(anyWord);
const home = { x: w.x, y: w.y };
await T('touchStart', [[home.x, home.y]]);
for (let i = 1; i <= 8; i++) {
  await page.waitForTimeout(60);
  await T('touchMove', [[home.x + 15 * i, home.y + 18 * i]]);
}
await T('touchCancel', []);
await page.waitForTimeout(1400);
const ghost = await page.evaluate(wordAt(w.w));
check('hunt · pointercancel leaves no ghost drag offset',
  ghost.exists && Math.hypot(ghost.x - home.x, ghost.y - home.y) < 60,
  `word rests ${ghost.exists ? Math.hypot(ghost.x - home.x, ghost.y - home.y).toFixed(0) : '—'}px from home`);

/* 5 · a judgment sticks — the graded word does not swim back seconds later */
await boot();
w = await page.evaluate(anyWord);
const fresh5 = await page.evaluate(wordAt(w.w));
if (fresh5.exists) { w.x = fresh5.x; w.y = fresh5.y; }
// an unambiguous flick: 130px in two strides, no dwell — CDP round-trips
// otherwise push a scripted gesture past the deliberateness threshold
await T('touchStart', [[w.x, w.y]]);
await T('touchMove', [[w.x + 65, w.y]]);
await T('touchMove', [[w.x + 130, w.y]]);
await T('touchEnd', []);
await page.waitForTimeout(1200);
const graded = await page.evaluate(world);
await page.waitForTimeout(4200);
const backAgain = await page.evaluate(wordAt(w.w));
check('hunt · a flick judgment sticks (the word does not rematerialize)',
  graded.tray !== '' && (!backAgain.exists || backAgain.op < 0.05),
  `tray "${graded.tray}"; word back after 5s = ${backAgain.exists && backAgain.op >= 0.05}`);

/* 6 · the walk is not culled — a walked planet stays in the field (P1) */
await boot();
w = await page.evaluate(anyWord);
await tap(w.x, w.y);
await page.waitForTimeout(1300);
for (let hop = 0; hop < 2; hop++) {
  const sat = await page.evaluate(`(() => {
    const sats = [...document.querySelectorAll('#drift-layer .word.bsat')].map((el) => {
      const r = el.getBoundingClientRect();
      return { el, r, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    for (const s of sats) {
      if (!s.r.width || s.r.left < 40 || s.r.right > 350 || s.r.top < 190 || s.r.bottom < 0 || s.r.bottom > 650) continue;
      if (sats.some((o) => o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 34)) continue;
      return { w: s.el.querySelector('.base')?.textContent, x: s.x, y: s.y };
    }
    return null;
  })()`);
  if (!sat) break;
  await tap(sat.x, sat.y);
  await page.waitForTimeout(600);
  const fresh = await page.evaluate(wordAt(sat.w));
  if (fresh.exists) {
    await tap(fresh.x, fresh.y);
    await page.waitForTimeout(1600);
  }
}
await page.waitForTimeout(2000); // two recycler passes
const origin = await page.evaluate(wordAt(w.w));
check('hunt · a walked planet is never culled by the recycler',
  origin.exists, `origin word ${w.w} present after two hops + 2s = ${origin.exists}`);

check('hunt · no page errors across the regression battery', errs.length === 0, errs.slice(0, 2).join(' | '));

console.log(`\n${fails === 0 ? 'ALL HUNT REGRESSIONS GREEN' : fails + ' HUNT REGRESSION(S) FAILING'}`);
await browser.close();
server.close();
process.exit(fails === 0 ? 0 : 1);
