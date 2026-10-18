/**
 * Hunt regressions — the twelve defects the 2026-08-08 adversarial workflow
 * confirmed, each pinned as a permanent check so none can ever come back.
 * (docs/prompts/DRIFT_ZERO_QUIRK_SPEC_2026-08-08.md §4.3: the case stays in
 * the matrix forever after.)
 *
 * Usage: node verify-drift-hunt.mjs
 *
 * Four historical stagings assumed proximity-padded families and Drift's
 * former dictionary cards. Their product obligations remain unchanged.
 * Current fixtures use recorded seeds, actual member/body hits, and current
 * canvas hubs; no stored coordinate is treated as authority after a reload.
*/
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { readAppRecordSnapshot } from './record-test-support.mjs';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { chromium } from 'playwright-core';

const CORRIDOR = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
const EVIDENCE_PHASE = (process.env.DRIFT_HUNT_EVIDENCE_PHASE || 'current').replace(/[^a-z0-9_-]/gi, '');
const sourceSha256 = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const stagings = [];
const results = [];
mkdirSync(EVIDENCE, { recursive: true });
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
await ctx.addInitScript(() => {
  const seed = new URL(location.href).searchParams.get('__huntSeed');
  if (seed !== null) {
    let state = Number(seed) >>> 0;
    Math.random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
  }
  // Keep the verifier black-box while still locating the two kinds of ink
  // that have no DOM hit target: faint hub sprites and legacy canvas-only
  // semantic labels. The hooks observe real canvas calls; they do not reach
  // into Drift's closure or mutate its interaction state.
  window.__driftHuntCanvas = { hubs: [], labels: [] };
  const hubSymbols = new WeakMap();
  window.__driftHuntPointerDowns = [];
  addEventListener('pointerdown', (event) => {
    window.__driftHuntPointerDowns.push({
      id: event.pointerId,
      type: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      // which word body (if any) the page itself resolved this pointerdown
      // to — lets a staging PROVE a tap of its own never reached the member
      // it aimed at (a moving-target miss), which is the only ground on
      // which re-staging is honest
      word: event.target?.closest?.('.word')?.querySelector?.('.base')?.textContent ?? null,
      card: !!event.target?.closest?.('#card.open,#mini'),
    });
  }, true);
  const cap = (items, item) => {
    items.push(item);
    if (items.length > 1200) items.splice(0, 600);
  };
  const proto = window.CanvasRenderingContext2D.prototype;
  const drawImage = proto.drawImage;
  proto.drawImage = function (...args) {
    if (
      this.canvas?.id === 'fx' && args.length === 5 &&
      args[0] instanceof window.HTMLCanvasElement && args[0].width === 96 && args[0].height === 96
    ) {
      cap(window.__driftHuntCanvas.hubs, {
        label: hubSymbols.get(args[0]) ?? null,
        x: args[1] + args[3] / 2,
        y: args[2] + args[4] / 2,
        at: performance.now(),
      });
    }
    return drawImage.apply(this, args);
  };
  const fillText = proto.fillText;
  proto.fillText = function (text, x, y, ...rest) {
    if (this.canvas.width === 96 && this.canvas.height === 96) hubSymbols.set(this.canvas, String(text));
    if (this.canvas?.id === 'fx') {
      cap(window.__driftHuntCanvas.labels, {
        text: String(text), x, y, at: performance.now(),
      });
    }
    return fillText.call(this, text, x, y, ...rest);
  };
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const cdp = await ctx.newCDPSession(page);
const T = (type, pts) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: pts.map(([x, y, id]) => (id == null ? { x, y } : { x, y, id })),
  });
const M = (type, x, y) => cdp.send('Input.dispatchMouseEvent', {
  type,
  x,
  y,
  button: 'left',
  buttons: type === 'mousePressed' ? 1 : 0,
  clickCount: 1,
});
const runtimePointer = async (type, x, y, pointerId, isPrimary = false) => {
  // Historical synthetic control: preserve its exact browser-generated IDs.
  // This is not a physical partial-lift witness; the G6 canceled-hand cases
  // below use native CDP TouchLists and separately prove input completion.
  const terminal = type === 'pointerup' || type === 'pointercancel';
  const expression = `(() => {
    const target = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)}) || document.body;
    return target.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: ${JSON.stringify(pointerId)},
      pointerType: 'touch',
      isPrimary: ${JSON.stringify(isPrimary)},
      clientX: ${JSON.stringify(x)},
      clientY: ${JSON.stringify(y)},
      button: 0,
      buttons: ${terminal ? 0 : 1},
      pressure: ${terminal ? 0 : 0.5},
    }));
  })()`;
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(`Runtime pointer dispatch failed: ${result.exceptionDetails.text}`);
};
const pointerIdAt = (x, y) => page.evaluate(({ x, y }) => {
  let best = null;
  let distance = Infinity;
  for (const event of window.__driftHuntPointerDowns ?? []) {
    if (event.type !== 'touch') continue;
    const d = Math.hypot(event.x - x, event.y - y);
    if (d < distance) { distance = d; best = event.id; }
  }
  return distance < 3 ? best : null;
}, { x, y });
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
const boot = async (seed = null) => {
  await page.goto(`${base}/index.html?entry=drift${seed === null ? '' : `&__huntSeed=${seed}`}`);
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await page.waitForSelector('#drift-layer[data-record-state="active"]');
  await page.waitForTimeout(2300);
};
const wordAt = (label) => `(() => {
  const el = [...document.querySelectorAll('#drift-layer .word')].find((n) => (n.querySelector('.base')?.textContent ?? '') === ${JSON.stringify(label)});
  if (!el) return { exists: false };
  const r = el.getBoundingClientRect();
  return {
    exists: true,
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
    width: r.width,
    height: r.height,
    op: parseFloat(el.style.opacity || '1'),
  };
})()`;
const world = `(() => ({
  ctr: document.querySelector('#drift-layer .word.bctr')?.querySelector('.base')?.textContent ?? null,
  sats: document.querySelectorAll('#drift-layer .word.bsat').length,
  tray: document.getElementById('drift-tray')?.textContent ?? '',
  depth: document.getElementById('depth')?.textContent ?? '',
  card: !!document.getElementById('mini') || (document.getElementById('card')?.classList.contains('open') ?? false),
  sheet: document.getElementById('sheet')?.dataset.node ?? null,
  radoc: document.getElementById('radoc')?.classList.contains('open') ?? false,
  members: [...document.querySelectorAll('#drift-layer .word.bsat')]
    .map((el) => el.querySelector('.base')?.textContent ?? '').filter(Boolean).sort(),
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
const openWater = `(() => {
  const blocked = [...document.querySelectorAll(
    '#drift-layer .word, #drift-layer .glyph, #drift-layer .part, .drift-door, #theme, #lvl, #card.open, #radoc.open'
  )].map((el) => el.getBoundingClientRect());
  const spots = [[70,180],[320,190],[80,690],[310,670],[195,720],[55,260],[335,290],[195,205]];
  for (const [x, y] of spots) {
    if (!blocked.some((b) => x > b.left - 12 && x < b.right + 12 && y > b.top - 12 && y < b.bottom + 12))
      return { x, y };
  }
  return null;
})()`;
const freshHub = `(() => {
  const now = performance.now();
  const nodes = [...document.querySelectorAll('#drift-layer .word.bctr, #drift-layer .word.bsat')]
    .map((el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const seen = new Set();
  const hubs = (window.__driftHuntCanvas?.hubs ?? []).filter((h) => now - h.at < 220).reverse();
  for (const h of hubs) {
    const key = Math.round(h.x) + ',' + Math.round(h.y);
    if (seen.has(key)) continue;
    seen.add(key);
    // Current meaning families can cover one side of a sun. Sample its
    // visible body, staying inside the original 34px door radius and outside
    // member near-miss forgiveness. The later empty-field tap proves the door.
    for (const [dx, dy] of [[0,0],[24,0],[-24,0],[0,-24],[0,24],[17,-17],[-17,-17],[17,17],[-17,17]]) {
      const x = h.x + dx, y = h.y + dy;
      if (x < 52 || x > 338 || y < 170 || y > 690) continue;
      const memberDistance = Math.min(...nodes.map((n) => Math.hypot(n.x - x, n.y - y)));
      if (memberDistance < 58) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit?.closest?.('.word,.glyph,.part,#theme,#lvl,.drift-door,#ginga-symbol,#ginga-theme-seal')) continue;
      return { label: h.label, x, y, canvas: { x: h.x, y: h.y }, offset: [dx, dy], memberDistance };
    }
  }
  return null;
})()`;
const shot = (name) => page.screenshot({
  path: resolve(EVIDENCE, name.replace(/\.png$/, `-${EVIDENCE_PHASE}.png`)),
});

let fails = 0;
const check = (name, pass, detail = '') => {
  if (!pass) fails += 1;
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? '  ok  ' : ' FAIL '}${name}${detail ? '  — ' + detail : ''}`);
};

const targetPoint = (selector, label) => page.evaluate(({ selector, label }) => {
  const text = (el) => { const copy = el.querySelector('.base,.g,.pch')?.cloneNode(true); copy?.querySelectorAll('rt').forEach((rt) => rt.remove()); return copy?.textContent; };
  const candidates = [...document.querySelectorAll(selector)].filter((el) => text(el) === label);
  const point = candidates.map((el) => {
    const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    return { el, label, x, y, hit: el.contains(document.elementFromPoint(x, y)), classes: el.className };
  }).find((candidate) => candidate.hit) ?? null;
  if (!point) return null;
  window.__driftHuntMemberHit = null;
  addEventListener('pointerdown', (event) => {
    const actual = event.target?.closest?.(selector);
    window.__driftHuntMemberHit = {
      sameNode: actual === point.el,
      label: actual ? text(actual) : null,
      trusted: event.isTrusted, type: event.pointerType,
    };
  }, { capture: true, once: true });
  const { el: _el, ...geometry } = point;
  return geometry;
}, { selector, label });
async function tapMember(selector, label, trace) {
  let point = null, waitedMs = 0;
  // Orbiters can pass behind other real bodies. Wait for a clear current
  // hit before delivering any input; never replay a delivered gesture.
  for (let attempt = 0; attempt < 60 && !point; attempt++) {
    point = await targetPoint(selector, label);
    if (!point) { await page.waitForTimeout(100); waitedMs += 100; }
  }
  assert(point, `The current family must expose a hit-owned ${label}`);
  const action = { kind: 'tap', selector, ...point, waitedMs };
  trace.actions.push(action);
  await tap(point.x, point.y);
  action.delivered = await page.evaluate(() => window.__driftHuntMemberHit);
  if (!action.delivered?.sameNode || !action.delivered.trusted || action.delivered.type !== 'touch') {
    const error = new Error(`Staging touch for ${label} reached ${JSON.stringify(action.delivered)}`);
    error.code = action.delivered?.trusted && action.delivered.type === 'touch'
      && action.delivered.sameNode === false ? 'OBSERVED_TARGET_MISS' : 'UNCONFIRMED_TARGET';
    throw error;
  }
  await page.waitForTimeout(1100);
}
async function stageHubDive(name) {
  const hub = await stageHubBloom(name);
  const trace = stagings[stagings.length - 1];
  await tap(hub.x, hub.y); await page.waitForTimeout(700);
  const released = await page.evaluate(world);
  assert.equal(released.ctr, null, 'The first hub touch releases the held family');
  assert.equal(released.depth, '', 'Release must not also dive');
  await tap(hub.x, hub.y); await page.waitForTimeout(1200);
  const dived = await page.evaluate(world);
  assert.equal(dived.depth, hub.label, 'The next actual canvas-hub touch enters its own kanji');
  trace.actions.push({ kind: 'canvas-hub-release-then-dive', hub, released, dived });
  trace.subject = hub.label;
  return trace;
}
async function stageCard(kind) {
  try {
    const trace = await stageHubDive(`hosted-${kind}`);
    const selector = '#drift-layer .glyph.center';
    await tapMember(selector, trace.subject, trace);
    const first = await page.locator(selector).getAttribute('data-ladder-rung');
    assert(['reading', 'stage'].includes(first), 'A supported hosted kanji answers on the shared ladder');
    if (first === 'reading') {
      assert.equal(await page.locator('#mini,#sheet').count(), 0);
      await tapMember(selector, trace.subject, trace);
    }
    await page.locator('#mini').waitFor();
    assert.equal(await page.locator('#mini .mini-word').textContent(), trace.subject);
    assert.equal(await page.locator(selector).getAttribute('data-ladder-rung'), 'stage');
    trace.meaning = await page.locator('#mini .mini-gloss').textContent();
    const kanji = JSON.parse(readFileSync(resolve(CORRIDOR, 'data/share_alike/kanji.json'), 'utf8')).kanji[trace.subject];
    trace.expectedMeaning = String(kanji?.m || '').toLowerCase();
    assert(trace.expectedMeaning, 'The pinned kanji source supplies this meaning');
    assert.equal(trace.meaning?.trim().toLowerCase(), trace.expectedMeaning, 'The shared kanji stage names its own canonical meaning, never a missing word entry');
    if (kind === 'page') {
      await tapMember(selector, trace.subject, trace);
      await page.locator(`#sheet[data-node="kanji:${trace.subject}"]`).waitFor();
      assert.equal(await page.locator('#mini').count(), 0);
    }
    trace.state = await page.evaluate(world);
    await shot(`staging-hosted-${kind}.png`);
    return true;
  } catch (error) {
    const trace = stagings[stagings.length - 1];
    if (trace) trace.error = error.message;
    console.log(JSON.stringify({ staging: trace, error: error.message }));
    return false;
  }
}
async function stageHubBloom(name) {
  await boot(1729);
  const trace = { name, seed: 1729, actions: [] };
  stagings.push(trace);
  await tapMember('#drift-layer .word', '外出', trace);
  await page.waitForTimeout(600);
  trace.state = await page.evaluate(world);
  trace.hub = await page.evaluate(freshHub);
  assert.equal(trace.state.ctr, '外出');
  assert(trace.hub?.label, 'A current canvas hub must be both observed and hit-testable as open water');
  return trace.hub;
}

/* 1 · camera hands never judge (P0) — a third finger on a word while two
 * fingers pinch, then a pinch finger lifts: nothing may be graded. */
await boot();
let w = await page.evaluate(anyWord);
await tap(w.x, w.y);
await page.waitForTimeout(900);
let before = await page.evaluate(world);
await page.evaluate(`window.__driftHuntPointerDowns.length = 0`);
const liftA = [w.x + 120, w.y + 6, 11];
const liftB = [w.x - 40, w.y + 170, 12];
const liftC = [w.x, w.y, 13];
await T('touchStart', [liftA]);
await T('touchStart', [liftA, liftB]);
await page.waitForTimeout(60);
await T('touchStart', [liftA, liftB, liftC]);
await page.waitForTimeout(80);
const liftAId = await pointerIdAt(liftA[0], liftA[1]);
if (liftAId != null) await runtimePointer('pointerup', liftA[0], liftA[1], liftAId, true);
await page.waitForTimeout(700);
let after = await page.evaluate(world);
let word = await page.evaluate(wordAt(w.w));
check('hunt · a lifting pinch finger never grades the word beneath a third finger',
  liftAId != null && after.tray === before.tray && word.exists,
  `A id=${liftAId}; tray "${before.tray}" → "${after.tray}", word present=${word.exists}`);
await T('touchCancel', []);

/* 2 · the hosted entry explanation replaces the private radical card.
 * Its content and Back control preserve the exact underlying canvas dive.
 * The shared entry page retains the modal-isolation obligation. */
const pageReady = await stageCard('page');
const modalTrace = stagings[stagings.length - 1];
const depthBefore = (await page.evaluate(world)).depth;
if (pageReady) {
  const heading = page.locator('#sheet .hero-mean').first();
  const r = await heading.boundingBox();
  assert(r, 'The actual hosted entry heading is visible');
  await tap(r.x + r.width / 2, r.y + r.height / 2);
  const contentAfter = await page.evaluate(world);
  check('hunt · shared entry explanation taps do not dismantle the canvas dive',
    contentAfter.sheet === `kanji:${modalTrace.subject}` && contentAfter.depth === depthBefore,
    `canonical entry ${contentAfter.sheet}; canvas depth ${depthBefore} → ${contentAfter.depth}`);
  const back = await page.locator('#sheet-back').evaluate((node) => {
    const r = node.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    return { x, y, hitsSelf: node.contains(document.elementFromPoint(x, y)) };
  });
  check('hunt · the shared entry Back control is reachable by a finger', back.hitsSelf, JSON.stringify(back));
  await tap(back.x, back.y); await page.locator('#mini').waitFor();
  const closed = await page.evaluate(world);
  check('hunt · shared entry Back restores the exact stage and canvas dive',
    !closed.sheet && closed.depth === depthBefore &&
      await page.locator('#mini .mini-word').textContent() === modalTrace.subject &&
      await page.locator('#mini .mini-gloss').textContent() === modalTrace.meaning,
    `Back restores exact ${modalTrace.subject} stage; canvas depth ${closed.depth}`);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mini,#sheet').count(), 0);
} else {
  check('hunt · shared entry explanation taps do not dismantle the canvas dive', false, 'Actual canvas hub → canonical entry staging failed');
  check('hunt · the shared entry Back control is reachable by a finger', false, 'Canonical entry staging failed');
  check('hunt · shared entry Back restores the exact stage and canvas dive', false, 'Canonical entry staging failed');
}

/* 3 · a real canvas-hub dive retains its level through the shared ladder,
 * then slow/held open-water gestures remain navigation-neutral. */
const stageReady = await stageCard('stage');
const visitTrace = stagings[stagings.length - 1];
const inDive = await page.evaluate(world);
let visitOk = false;
if (stageReady) {
  await tapMember('#drift-layer .glyph.center', visitTrace.subject, visitTrace);
  await page.locator(`#sheet[data-node="kanji:${visitTrace.subject}"]`).waitFor();
  await page.locator('#sheet-back').click(); await page.locator('#mini').waitFor();
  const sameStage = await page.locator('#mini .mini-word').textContent() === visitTrace.subject &&
    await page.locator('#mini .mini-gloss').textContent() === visitTrace.meaning;
  await page.keyboard.press('Escape');
  visitOk = sameStage && await page.locator('#mini,#sheet').count() === 0 &&
    await page.locator('#drift-layer .glyph.center').getAttribute('data-ladder-rung') === null &&
    (await page.evaluate(world)).depth === inDive.depth;
}
check('hunt · the dive’s centre follows reading, stage and page; Back restores stage and folding keeps the dive',
  visitOk, JSON.stringify({ subject: visitTrace?.subject, depth: inDive.depth, sameMeaning: visitOk }));
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
  const trace = { name: `walk-hop-${hop + 1}`, actions: [] }; stagings.push(trace);
  await tapMember('#drift-layer .word.bsat', sat.w, trace);
  assert.equal((await page.evaluate(world)).ctr, sat.w, 'The actual satellite becomes the next family centre');
  const rung = await page.locator('#drift-layer .word.bctr').getAttribute('data-ladder-rung');
  assert(['reading', 'stage'].includes(rung));
  if (rung === 'stage') assert.equal(await page.locator('#mini .mini-word').textContent(), sat.w);
  await page.keyboard.press('Escape');
  assert.equal((await page.evaluate(world)).ctr, sat.w, 'Folding lookup retains the walked family');
}
await page.waitForTimeout(2000); // two recycler passes
const origin = await page.evaluate(wordAt(w.w));
check('hunt · a walked planet is never culled by the recycler',
  origin.exists, `origin word ${w.w} present after two hops + 2s = ${origin.exists}`);

/* ---- the four spend-killed claims, re-hunted and closed (2026-08-08) ----
 * Three were refuted as filed; the probes that refuted them found five real
 * defects underneath. Each is pinned here so none can come back. */

const TI = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const press = async (x, y, ms = 620) => {
  await T('touchStart', [[x, y]]);
  await page.waitForTimeout(ms);
  await T('touchEnd', []);
};
const lockState = `(() => {
  const sats = [...document.querySelectorAll('#drift-layer .word.bsat')];
  return {
    ctr: document.querySelector('#drift-layer .word.bctr')?.querySelector('.base')?.textContent ?? null,
    sats: sats.length,
    mute: sats.filter((n) => !(n.querySelector('.yomi')?.textContent ?? '')).length,
    glossed: sats.filter((n) => n.classList.contains('glossed')).length,
    depth: document.getElementById('depth')?.textContent ?? '',
  };
})()`;
// a lock member far enough from its neighbours to be aimed at unambiguously
const someSat = `(() => {
  const sats = [...document.querySelectorAll('#drift-layer .word.bsat')].map((el) => {
    const r = el.getBoundingClientRect();
    return { el, r, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }).filter((s) => s.r.width && s.r.left > 30 && s.r.right < 360 && s.r.top > 150 && s.r.bottom < 700);
  for (const s of sats) {
    if (sats.some((o) => o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 40)) continue;
    return { w: s.el.querySelector('.base')?.textContent ?? '',
             mute: !(s.el.querySelector('.yomi')?.textContent ?? ''), x: s.x, y: s.y };
  }
  return null;
})()`;
// open water: >=90px from every member and every glyph anchor
const openWaterForLock = `(() => {
  const bodies = [...document.querySelectorAll('#drift-layer .word, #drift-layer .glyph')].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  for (let y = 250; y < 640; y += 26) for (let x = 70; x < 320; x += 26) {
    if (bodies.every((b) => Math.hypot(b.x - x, b.y - y) >= 90)) return { x, y };
  }
  return null;
})()`;

/* 7 · a lock does not destroy the word it locks onto (headless lock, P1) */
await boot();
w = await page.evaluate(anyWord);
await tap(w.x, w.y);
await page.waitForTimeout(1200);
let sat7 = await page.evaluate(someSat);
if (sat7) {
  await press(sat7.x, sat7.y);
  await page.waitForTimeout(1400); // past the 500ms removeNode window
  const st = await page.evaluate(lockState);
  check('hunt · a long-press keeps the word it locks onto (no headless lock)',
    st.ctr !== null, `centre after lock + 1.4s = ${st.ctr}`);
} else {
  check('hunt · a long-press keeps the word it locks onto (no headless lock)', false, 'no aimable satellite');
}

/* 8 · a locked constellation is made of real words, not canvas paint (I2) */
const st8 = await page.evaluate(lockState);
check('hunt · lock members are touchable words, not canvas labels',
  st8.sats >= 5, `${st8.sats} DOM .bsat under lock (was 0-1 when members were fillText)`);

/* 9 · a label with no reading answers with its gloss at the first tap, and
 * touching it never razes the constellation (the ghost-tap razing, P1) */
let sat9 = await page.evaluate(`(() => {
  const pick = ${someSat};
  return pick;   // someSat already skips crowded labels
})()`);
if (sat9) {
  await tap(sat9.x, sat9.y);
  await page.waitForTimeout(500);
  const st = await page.evaluate(lockState);
  const answered = await page.evaluate(
    `document.querySelectorAll('#drift-layer .word[data-ladder-rung]').length`);
  // a label we hold no reading for must reach its gloss on the FIRST tap:
  // its furigana stage would answer with nothing visible
  const muteOk = !sat9.mute || await page.locator('#mini .mini-word').textContent().catch(() => '') === sat9.w;
  check('hunt · tapping a constellation label answers instead of razing it',
    st.ctr !== null && answered > 0 && muteOk,
    `"${sat9.w}" mute=${sat9.mute} · centre survived=${st.ctr !== null}, answered=${answered}, glossed=${st.glossed}`);
} else {
  check('hunt · tapping a constellation label answers instead of razing it', false, 'no aimable satellite');
}

/* 10 · fat-finger forgiveness is reachable under a lock (it sat below an
 * unconditional lock release and was dead code, P1) */
await boot();
w = await page.evaluate(anyWord);
await press(w.x, w.y);
await page.waitForTimeout(1400);
let before10 = await page.evaluate(lockState);
// the lock glides the camera to its centre, so aim at where the centre IS now
const ctr10 = await page.evaluate(`(() => {
  const el = document.querySelector('#drift-layer .word.bctr');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (const distance of [36, 40, 43]) for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    const x = cx + Math.cos(angle) * distance, y = cy + Math.sin(angle) * distance;
    if (x < 4 || x > innerWidth - 4 || y < 4 || y > innerHeight - 4) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit?.closest?.('.word,.glyph,.part')) return { x, y, distance, water: true };
  }
  return { x: cx, y: cy, distance: 0, water: false };
})()`);
if (ctr10) await tap(ctr10.x, ctr10.y);
await page.waitForTimeout(500);
let after10 = await page.evaluate(lockState);
check('hunt · a 44px near-miss under a lock forgives instead of razing',
  ctr10?.water === true && before10.ctr !== null && after10.ctr !== null,
  `true-water=${ctr10?.water ?? false} at ${ctr10?.distance ?? '—'}px; centre "${before10.ctr}" → "${after10.ctr}"`);

/* 11 · a deliberate release is never consumed by the hub-sun door, and no
 * constellation rides into a dive (P1). Observe a clear canvas hub in this
 * held scene. Its second tap, after release, must prove it is a real door. */
const hub = await stageHubBloom('hub-release');
const hubHeld = await page.evaluate(lockState);
await tap(hub.x, hub.y);
await page.waitForTimeout(700);
const hubReleased = await page.evaluate(lockState);
let hubDoor = null;
if (hubReleased.depth === '' && hubReleased.ctr === null) {
  await tap(hub.x, hub.y);
  await page.waitForTimeout(1100);
  hubDoor = await page.evaluate(lockState);
}
stagings[stagings.length - 1].release = hubReleased;
stagings[stagings.length - 1].door = hubDoor;
check('hunt · a release on a hub sun releases the constellation instead of diving',
  hubHeld.ctr !== null && hubReleased.depth === '' && hubReleased.ctr === null && !!hubDoor?.depth,
  `canvas hub "${hub.label}" at (${hub.x.toFixed(1)},${hub.y.toFixed(1)}) · held "${hubHeld.ctr}" → ctr ${hubReleased.ctr}, depth "${hubReleased.depth}"; next tap depth="${hubDoor?.depth ?? ''}"`);

/* 12 · a foreign finger cannot carry a held word (pointermove had no
 * ownership check; #card swallows pointerdown and has no pointermove
 * listener at all, so a thumb resting on the open card was invisible to the
 * touch set while its every move still reached the drag branch, P1).
 * The exact outside owner touch folds the shared stage before a foreign finger arrives.
 * Run inside a real hub dive: no camera pan, no tide rail, so a
 * raw pixel delta is honest here. */
// Orbiters keep circling on their own inside a dive. Keep the same field
// displacement baseline and compare the held word with its moving peers.
const fieldPos = `(() => Object.fromEntries([...document.querySelectorAll('#drift-layer .word')]
  .map((el) => {
    const r = el.getBoundingClientRect();
    return [el.querySelector('.base')?.textContent ?? '', [r.left + r.width / 2, r.top + r.height / 2]];
  })))()`;
let stage = null;
let p0 = null;
let confirmedOwner = null;
let ownerStagingFailure = 'no owner touch attempted';
for (let attempt = 1; attempt <= 3; attempt++) {
  const cardReady = await stageCard('stage');
  const trace = stagings[stagings.length - 1];
  const staging = trace.ownerStaging = { attempt, status: 'preparing' };
  if (!cardReady) {
    staging.status = ownerStagingFailure = 'card staging failed';
    break;
  }
  // Reset observations, take p0 and aim in one synchronous evaluation. No
  // page read, screenshot or wait belongs between this snapshot and native
  // touchStart: the selected body continues orbiting after we return.
  const snapshot = await page.evaluate(`(() => {
    window.__driftHuntPointerDowns.length = 0;
    window.__driftHuntOwnerHit = null;
    const p0 = ${fieldPos};
    const card = document.getElementById('mini');
    const cr = card ? card.getBoundingClientRect() : null;
    const words = [...document.querySelectorAll('#drift-layer .word')];
    // Keep the highest/leftmost hit-owned orbiter at least 20px clear of the shared stage, on any side.
    const orb = words.map((el) => {
      const r = el.getBoundingClientRect();
      return { el, r, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }).filter((o) => o.r.width && !o.el.classList.contains('center') &&
      parseFloat(o.el.style.opacity || '1') > 0.4 && o.r.top > 110 && o.r.bottom < 560 &&
      (!cr || o.r.bottom < cr.top - 20 || o.r.top > cr.bottom + 20 || o.r.right < cr.left - 20 || o.r.left > cr.right + 20) &&
      o.el.contains(document.elementFromPoint(o.x, o.y)))
      .sort((a, b) => (a.y + a.x) - (b.y + b.x))[0];
    const corner = cr ? { x: cr.right - 26, y: cr.top + 20 } : null;
    const stage = {
      card: corner ? { ...corner, hit: card.contains(document.elementFromPoint(corner.x, corner.y)) } : null,
      orb: orb ? {
        w: orb.el.querySelector('.base')?.textContent ?? '', x: orb.x, y: orb.y,
        rect: { left: orb.r.left, top: orb.r.top, right: orb.r.right, bottom: orb.r.bottom },
        matchCount: words.filter((el) => el.querySelector('.base')?.textContent === orb.el.querySelector('.base')?.textContent).length,
      } : null,
    };
    if (stage.card?.hit && stage.orb) {
      // Observe exact DOM ownership at delivery; a duplicate label must not
      // turn a touch of a different body into a successful owner staging.
      addEventListener('pointerdown', (event) => {
        const word = event.target?.closest?.('.word');
        window.__driftHuntOwnerHit = {
          id: event.pointerId, type: event.pointerType, isPrimary: event.isPrimary,
          isTrusted: event.isTrusted, x: event.clientX, y: event.clientY,
          word: word?.querySelector('.base')?.textContent ?? null,
          card: !!event.target?.closest?.('#card.open,#mini'),
          sameNode: word === orb.el, at: performance.now(),
        };
      }, { capture: true, once: true });
    }
    return { stage, p0, aimedAt: performance.now() };
  })()`);
  stage = snapshot.stage;
  p0 = snapshot.p0;
  staging.snapshot = snapshot;
  if (!stage.card?.hit || !stage.orb) {
    staging.status = ownerStagingFailure = 'no hit-owned card/owner staging';
    break;
  }
  await TI('touchStart', [{ x: stage.orb.x, y: stage.orb.y, id: 1 }]);
  const confirmation = await page.evaluate(() => ({
    hit: window.__driftHuntOwnerHit,
    downs: window.__driftHuntPointerDowns.slice(),
    observedAt: performance.now(),
    stagePresent: !!document.getElementById('mini'),
    depth: document.getElementById('depth')?.textContent ?? '',
  }));
  staging.confirmation = confirmation;
  const first = confirmation.downs.length === 1 ? confirmation.downs[0] : null;
  const hit = confirmation.hit;
  const observedTouch = first?.type === 'touch' && hit?.type === 'touch' &&
    first.id === hit.id && first.word === hit.word && first.card === hit.card &&
    hit.isTrusted === true && Math.hypot(first.x - stage.orb.x, first.y - stage.orb.y) < 1;
  if (observedTouch && hit.sameNode && hit.word === stage.orb.w) {
    confirmedOwner = hit;
    staging.status = 'owner-confirmed';
    break;
  }
  await TI('touchCancel', []);
  const wrongInitialTarget = observedTouch && hit.sameNode === false;
  staging.status = ownerStagingFailure = wrongInitialTarget
    ? 'observed wrong initial target' : 'initial owner touch unconfirmed';
  // Only a proven first-touch miss can re-stage. Missing/ambiguous events,
  // failed setup and every correctly delivered gesture are terminal here.
  if (!wrongInitialTarget || attempt === 3) break;
}
if (confirmedOwner) {
  await page.waitForTimeout(90);
  await TI('touchStart', [{ x: stage.orb.x, y: stage.orb.y, id: 1 }, { x: stage.card.x, y: stage.card.y, id: 2 }]);
  for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(40);
    await TI('touchMove', [{ x: stage.orb.x, y: stage.orb.y, id: 1 },
                           { x: stage.card.x - i * 22, y: stage.card.y + i * 6, id: 2 }]);
  }
  const p1 = await page.evaluate(fieldPos);
  const observedFingers = await page.evaluate(() => window.__driftHuntPointerDowns);
  await TI('touchCancel', []);
  await page.waitForTimeout(300);
  const deltas = Object.keys(p0).filter((k) => p1[k] && k !== stage.orb.w)
    .map((k) => Math.hypot(p1[k][0] - p0[k][0], p1[k][1] - p0[k][1])).sort((a, b) => a - b);
  // receded words are frozen, so the all-words median is 0 and useless as a
  // reference. Orbiters are what the held word is one of — compare to those,
  // and never to itself, or the comparison is circular.
  const live = deltas.filter((d) => d > 1);
  const median = live.length ? live[Math.floor(live.length / 2)] : 0;
  const target = p0[stage.orb.w] && p1[stage.orb.w]
    ? Math.hypot(p1[stage.orb.w][0] - p0[stage.orb.w][0], p1[stage.orb.w][1] - p0[stage.orb.w][1]) : -1;
  const ownerFinger = observedFingers.find((finger) => finger.word === stage.orb.w);
  const foreignFinger = observedFingers.find((finger) => finger.id !== ownerFinger?.id &&
    Math.hypot(finger.x - stage.card.x, finger.y - stage.card.y) < 1);
  const ownerConfirmation = stagings[stagings.length - 1].ownerStaging.confirmation;
  stagings[stagings.length - 1].fingers = { stage, observedFingers, target, median, confirmedOwner, p0, p1 };
  check('hunt · a foreign finger cannot carry the owned word after its shared stage folds',
    ownerFinger && foreignFinger && ownerFinger.id !== foreignFinger.id &&
      ownerConfirmation.stagePresent === false && ownerConfirmation.depth !== '' && foreignFinger.card === false &&
      target >= 0 && target - median < 30,
    `held ${target.toFixed(1)}px vs orbiter median ${median.toFixed(1)}px of ${live.length} moving ` +
    `(all-words median ${(deltas[Math.floor(deltas.length / 2)] ?? 0).toFixed(1)}px, max ${(deltas[deltas.length - 1] ?? 0).toFixed(1)}px); ` +
    `owner id=${ownerFinger?.id ?? null}, foreign id=${foreignFinger?.id ?? null}; stage folded=${ownerConfirmation.stagePresent === false}`);
} else {
  check('hunt · a foreign finger cannot carry the owned word after its shared stage folds', false,
    `staging failed: ${ownerStagingFailure}; card=${!!stage?.card} orbiter=${!!stage?.orb}`);
}

/* 13 · a finger on the glass is not inactivity — the bloom must outlive the
 * 10s fade while it is being held perfectly still (P2) */
await boot();
w = await page.evaluate(anyWord);
await tap(w.x, w.y);
await page.waitForTimeout(1100);
const water13 = await page.evaluate(openWaterForLock);
if (water13) {
  await T('touchStart', [[water13.x, water13.y]]);
  await page.waitForTimeout(12500); // no further events: a genuinely static touch
  const st = await page.evaluate(lockState);
  await T('touchEnd', []);
  check('hunt · a held finger keeps a constellation alive past the 10s fade',
    st.ctr !== null, `centre after 12.5s of a static held finger = ${st.ctr}`);
} else {
  check('hunt · a held finger keeps a constellation alive past the 10s fade', false, 'no open water');
}

/* 14 · semantic constellation members are touchable DOM, including kana.
 * The legacy canvas fallback was visible but untouchable: tapping its label
 * hit water and dismantled the lock. A kana-only member must also be able to
 * become a centre whose same-level fallback has real members. */
const semanticMember = (label) => page.evaluate((target) => {
  const all = [...document.querySelectorAll('#drift-layer .word')]
    .filter((node) => (node.querySelector('.base')?.textContent ?? '') === target);
  // This hunt names the staged LOCK MEMBER. When a .bsat element carries the
  // label, aim and read THAT element — the field can hold a second, ordinary
  // copy of the same headword, and sampling whichever copy is hit-owned first
  // both tapped the wrong body and then read the wrong body's reveal state
  // (the measured flake: the first reveal tap "lost" on a 13px field copy
  // while the real member sat untouched). When no .bsat match exists the scan
  // falls back to every copy, so the canvas-era failure this hunt pins —
  // a member with no DOM body at all — still convicts exactly as before.
  const staged = all.filter((node) => node.classList.contains('bsat'));
  const matches = staged.length ? staged : all;
  let fallback = null;
  for (const el of matches.reverse()) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.right <= 0 ||
        r.top >= innerHeight || r.left >= innerWidth || el.style.pointerEvents === 'none') continue;
    for (const [fx, fy] of [[.5,.5],[.25,.5],[.75,.5],[.5,.25],[.5,.75],[.25,.25],[.75,.25],[.25,.75],[.75,.75]]) {
      const x = r.x + r.width * fx;
      const y = r.y + r.height * fy;
      const hit = document.elementFromPoint(x, y);
      const state = {
        dom: true,
        x,
        y,
        hitSelf: hit === el || el.contains(hit),
        hitLabel: hit?.closest?.('.word')?.querySelector('.base')?.textContent ?? hit?.id ?? hit?.className ?? null,
        reading: el.querySelector('.yomi')?.textContent ?? '',
        unfolded: el.classList.contains('unfolded'),
        glossed: el.classList.contains('glossed'),
        rung: el.dataset.ladderRung || null,
      };
      if (state.hitSelf) return state;
      fallback ??= state;
    }
  }
  if (fallback) return fallback;
  const now = performance.now();
  const ink = [...(window.__driftHuntCanvas?.labels ?? [])].reverse()
    .find((point) => point.text === target && now - point.at < 260);
  return ink ? { dom: false, hitSelf: false, hitLabel: 'canvas', reading: '', x: ink.x, y: ink.y, unfolded: false, glossed: false } : null;
}, label);
const aimSemantic = async (label) => {
  // Members glide (lock assembly, camera lock-glide): a single hit-owned
  // sample can be stale by the time the 65ms tap lands, so the aim demands
  // the same stability verify-drift-consistency's aimWord does — two
  // consecutive owned samples within 2.5px. The assertions downstream are
  // untouched; this only refuses to tap a target that is still moving.
  let state = null;
  let previous = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    state = await semanticMember(label);
    if (state?.dom && state.hitSelf) {
      if (previous && Math.hypot(state.x - previous.x, state.y - previous.y) <= 2.5) return state;
      previous = state;
    } else {
      previous = null;
    }
    await page.waitForTimeout(120);
  }
  return state;
};
// A lock member can be CREEPING (measured at ~30px/s after a lock-to-lock
// handoff: the whole constellation glides while the camera's lock-glide tail
// settles), so a touch aimed from a sample even ~100ms old can land past the
// member's 13-19px body — on water — and under a lock a water tap is a
// deliberate release: the staging razes its own subject and reports the
// PRODUCT dead. touchMember therefore samples the live body and dispatches in
// the same breath, then reads back which word the page's own pointerdown
// resolved to. attempted=false means no hit-owned body existed to touch;
// delivered=false with attempted=true is a PROVEN moving-target miss — the
// only ground on which a re-stage is honest. A delivered touch that fails to
// produce the contracted response is never retried: that is the product's
// failure, exactly what this hunt exists to catch.
const touchMember = async (label, hold = 0) => {
  const at = await semanticMember(label);
  if (!at?.dom || !at.hitSelf) return { attempted: false, delivered: false, reason: 'no hit-owned body' };
  await page.evaluate(`window.__driftHuntPointerDowns.length = 0`);
  if (hold > 0) await press(at.x, at.y, hold);
  else await tap(at.x, at.y);
  const downs = await page.evaluate(`(window.__driftHuntPointerDowns ?? []).map((d) => d.word ?? null)`);
  return {
    attempted: true,
    delivered: downs.length > 0 && downs[downs.length - 1] === label,
    reason: `pointerdown resolved to ${JSON.stringify(downs)}`,
  };
};
const missed = (touch) => touch.attempted && !touch.delivered;
await boot();
let semanticFinal = null;
for (let staging = 1; staging <= 3; staging++) {
  if (staging > 1) await boot();
  const lockStarted = await page.evaluate(`window.__lockWord?.('過酷') === true`);
  await page.waitForTimeout(1400);
  const semanticTarget = await aimSemantic('残酷');
  const semanticBefore = await page.evaluate(world);
  await shot('07-semantic-member-before.png');
  let tapOne = { attempted: false, delivered: false, reason: 'not attempted' };
  if (semanticTarget?.hitSelf) {
    tapOne = await touchMember('残酷');
    await page.waitForTimeout(550);
  }
  const semanticRevealOne = await semanticMember('残酷');
  const semanticAfterOne = await page.evaluate(world);
  // the app's slip belongs to a dive's centre (the one-hand pass), never to a lock member's reveal
  const slipOne = await page.evaluate(`document.getElementById('mini')?.querySelector('.mini-word')?.textContent ?? null`);
  const semanticSecondAim = await aimSemantic('残酷');
  let tapTwo = { attempted: false, delivered: false, reason: 'not attempted' };
  if (semanticSecondAim?.hitSelf) {
    tapTwo = await touchMember('残酷');
    await page.waitForTimeout(500);
  }
  const semanticRevealTwo = await semanticMember('残酷');
  const semanticStage = await page.locator('#mini').evaluate(n => ({word:n.querySelector('.mini-word')?.textContent,gloss:n.querySelector('.mini-gloss')?.textContent})).catch(() => null);
  const semanticAfterTwo = await page.evaluate(world);
  const ok =
    lockStarted && semanticTarget?.dom === true && semanticTarget.hitSelf === true &&
    semanticTarget.reading !== '' &&
    semanticBefore.ctr === '過酷' && semanticAfterOne.ctr === '過酷' && semanticAfterTwo.ctr === '過酷' &&
    semanticRevealOne?.rung === 'reading' && semanticRevealOne.unfolded === true && semanticRevealOne.glossed === false && slipOne === null &&
    semanticRevealTwo?.rung === 'stage' && semanticRevealTwo.unfolded === true && semanticStage?.word === '残酷' && !!semanticStage.gloss?.trim();
  semanticFinal = {
    ok,
    detail:
      `DOM=${semanticTarget?.dom ?? false}, hitSelf=${semanticTarget?.hitSelf ?? false}; ` +
      `stage1=${semanticRevealOne?.unfolded ?? false}/${semanticRevealOne?.glossed ?? false} slip=${JSON.stringify(slipOne)}, ` +
      `stage2=${semanticRevealTwo?.unfolded ?? false}/${semanticRevealTwo?.glossed ?? false}; ` +
      `centre "${semanticBefore.ctr}" → "${semanticAfterOne.ctr}" → "${semanticAfterTwo.ctr}"` +
      `; staging ${staging}/3 (tap1 ${tapOne.reason}; tap2 ${tapTwo.reason})`,
  };
  if (ok || !(missed(tapOne) || missed(tapTwo))) break;
}
check('hunt · a corpus-backed semantic member is staged, hit-testable DOM interaction (reading then shared stage, same lock identity)',
  semanticFinal.ok, semanticFinal.detail);

const closeSemanticStage = async (expectedWord) => {
  const before = await page.evaluate(world);
  const actualWord = await page.locator('#mini .mini-word').textContent().catch(() => null);
  if (actualWord !== expectedWord) return {ok:false,expectedWord,actualWord,reason:'expected stage was not mounted'};
  await page.keyboard.press('Escape');
  let closed = true;
  try {
    await page.waitForFunction(() => !document.getElementById('mini') && !document.getElementById('sheet') && window.__DRIFT__.canNavigate(),null,{timeout:5000});
  } catch { closed = false; }
  const after = await page.evaluate(world);
  return {ok:closed && before.ctr === after.ctr,expectedWord,actualWord,before,after,closed};
};
// Native dismissal is a fixture precondition: the G6 stage intentionally
// rejects a hold behind it. Preserve the already-observed stage facts.
const semanticClosure = await closeSemanticStage('残酷');
stagings.push({case:'semantic-stage-native-closure',...semanticClosure});

// Start the lock afresh so the old canvas failure cannot mask the kana-only
// fallback half of the hunt.
let kanaFinal = null;
for (let staging = 1; staging <= 3; staging++) {
  await page.evaluate(`window.__lockWord?.('厳しい')`);
  await page.waitForTimeout(1200);
  const kanaTarget = await aimSemantic('きつい');
  let kanaTap = { attempted: false, delivered: false, reason: 'not attempted' };
  if (kanaTarget?.hitSelf) {
    kanaTap = await touchMember('きつい');
    await page.waitForTimeout(500);
  }
  const kanaAnswered = await semanticMember('きつい');
  const kanaCentreAfterAnswer = await page.evaluate(world);
  const kanaStage = await page.locator('#mini').evaluate(n => ({word:n.querySelector('.mini-word')?.textContent,gloss:n.querySelector('.mini-gloss')?.textContent})).catch(() => null);
  const kanaClosure = await closeSemanticStage('きつい');
  stagings.push({case:'kana-stage-native-closure',staging,...kanaClosure});
  const kanaForLock = await aimSemantic('きつい');
  let kanaPress = { attempted: false, delivered: false, reason: 'not attempted' };
  if (semanticClosure.ok && kanaClosure.ok && kanaForLock?.hitSelf) {
    kanaPress = await touchMember('きつい', 620);
    await page.waitForTimeout(900);
  }
  const kanaFallback = await page.evaluate(world);
  await shot('07-semantic-dom-kana-fallback.png');
  // RULE REWRITTEN 2026-08-10: the same-level fallback this check demanded
  // (sats >= 6 for a kana word with no strong ties) was exactly the defect
  // the operator logged as "tap-families admitting unrelated words" — the
  // fallback tier was removed. The current rule: a kana-only word focuses
  // cleanly and its bloom admits ONLY meaning-related members, which may be
  // none at all. No strangers, honest emptiness.
  const ok =
    semanticClosure.ok && kanaClosure.ok &&
    kanaTarget?.dom === true && kanaTarget.hitSelf === true && kanaTarget.reading === '' &&
    kanaAnswered?.rung === 'stage' && kanaStage?.word === 'きつい' && !!kanaStage.gloss?.trim() &&
    kanaCentreAfterAnswer.ctr === '厳しい' && kanaFallback.ctr === 'きつい' &&
    kanaFallback.members.length === kanaFallback.sats;
  kanaFinal = {
    ok,
    detail:
      `DOM=${kanaTarget?.dom ?? false}, hitSelf=${kanaTarget?.hitSelf ?? false}, hit=${JSON.stringify(kanaTarget?.hitLabel ?? null)}, ` +
      `reading=${JSON.stringify(kanaTarget?.reading ?? null)}, first=${kanaAnswered?.unfolded ?? false}/${kanaAnswered?.glossed ?? false}; ` +
      `centre="${kanaCentreAfterAnswer.ctr}"→"${kanaFallback.ctr}", DOM sats=${kanaFallback.sats}, ` +
      `members=${kanaFallback.members.join('・')}` +
      `; native closures=${semanticClosure.ok}/${kanaClosure.ok}; staging ${staging}/3 (tap ${kanaTap.reason}; press ${kanaPress.reason})`,
  };
  if (ok || !(missed(kanaTap) || missed(kanaPress))) break;
}
check('hunt · a kana-only word focuses cleanly and its bloom admits no strangers',
  kanaFinal.ok, kanaFinal.detail);

/* 15 · pointer identity is part of gesture authority. A mouse/foreign pointer
 * may not move a touch-held word. A third sky finger cancels the entire
 * physical hand until all its fingers (including later joiners) end. */
await boot();
w = await page.evaluate(anyWord);
await page.mouse.move(w.x, w.y);
const identityHome = await page.evaluate(wordAt(w.w));
await T('touchStart', [[identityHome.x, identityHome.y, 21]]);
await page.waitForTimeout(70);
await page.mouse.move(identityHome.x + 141, identityHome.y);
await page.waitForTimeout(180);
const identityAfter = await page.evaluate(wordAt(w.w));
const foreignDisplacement = identityAfter.exists
  ? Math.hypot(identityAfter.x - identityHome.x, identityAfter.y - identityHome.y)
  : Infinity;
await T('touchCancel', []);

check('hunt · a foreign pointermove cannot drag a touch-held word',
  foreignDisplacement < 8,
  `foreign-pointer displacement=${Number.isFinite(foreignDisplacement) ? foreignDisplacement.toFixed(1) : '∞'}px`);

// G6's surface scale hand is canceled by a third pointer. These mandatory
// native streams keep the physical CDP TouchList honest across partial lifts;
// historical synthetic pointer controls elsewhere remain separate evidence.
const huntScaleFacts = async () => ({
  ...await page.evaluate(() => ({
    view: document.body.dataset.view,
    active: document.getElementById('drift-layer')?.classList.contains('active'),
    inert: document.getElementById('drift-layer')?.inert,
    ready: window.__DRIFT__.canNavigate(), place: window.__DRIFT__.capturePlace(),
    mini: !!document.getElementById('mini'), sheet: !!document.getElementById('sheet'),
    viewportScale: visualViewport?.scale ?? 1,
  })),
  world: await page.evaluate(world),
});
const settleHuntScale = async (trace) => {
  let facts = await huntScaleFacts(), equal = 0;
  const started = Date.now();
  trace.settling = [];
  for (let n = 0; n < 40 && equal < 2; n++) {
    await page.waitForTimeout(100);
    const next = await huntScaleFacts();
    trace.settling.push(next.place);
    equal = isDeepStrictEqual(facts.place, next.place) ? equal + 1 : 0;
    facts = next;
  }
  trace.settlingMs = Date.now() - started;
  assert(equal >= 2, 'the actual camera settles within four seconds without a setter');
  assert(facts.view === 'drift' && facts.active && !facts.inert && facts.ready && !facts.mini && !facts.sheet,
    'the native hand starts in admitted visible sky');
  assert.equal(facts.place?.path, '[]', 'surface scale fixture starts outside a private dive');
  return facts;
};
const nativeSkyPoints = () => page.evaluate(() => {
  const ink = [...document.querySelectorAll('#drift-layer .word, #drift-layer .glyph, #drift-layer .part')]
    .map(n => n.getBoundingClientRect()).filter(r => r.width && r.height);
  const safe = [];
  for (let y = 230; y <= 614; y += 24) for (let x = 78; x <= 318; x += 24) {
    if (ink.some(r => Math.hypot(x-r.x-r.width/2, y-r.y-r.height/2) < 44)) continue;
    const disk = [[x,y], ...Array.from({length:16}, (_,i) => [x+30*Math.cos(i*Math.PI/8),y+30*Math.sin(i*Math.PI/8)])];
    if (disk.every(([px,py]) => document.elementFromPoint(px,py)?.id === 'sky')) safe.push([x,y]);
  }
  // Bounded scan, native footprint ownership (including stars/chrome), and
  // enough margin for the deliberately large canceled/fresh spread.
  const compatible = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]) >= 54 && [a,b].every((p,i) => {
    const q = i ? a : b, x = (p[0]+q[0])/2+(p[0]-q[0])*0.8, y = (p[1]+q[1])/2+(p[1]-q[1])*0.8;
    return x >= 35 && x <= 355 && y >= 100 && y <= 744;
  });
  for (const first of safe) {
    const selected = [first];
    for (const point of safe) {
      if (selected.every(other => compatible(point,other))) selected.push(point);
      if (selected.length === 4) return {points:selected,ownershipRadius:30,footprintSamples:17,wordForgiveness:44,candidates:safe.length};
    }
  }
  return null;
});
const beginNativeHandWitness = async () => page.evaluate(() => {
  const stamp = `${location.href}:${performance.timeOrigin}`;
  const witness = { stamp, events:[], live:new Set(), routes:[document.body.dataset.view], listeners:[] };
  for (const type of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','touchcancel']) {
    const listener = event => {
      if (event.pointerType && event.pointerType !== 'touch') return;
      if (type === 'pointerdown') witness.live.add(event.pointerId);
      if (type === 'pointerup' || type === 'pointercancel') witness.live.delete(event.pointerId);
      witness.events.push({event, captured:{type,id:event.pointerId ?? null,count:event.touches?.length ?? null,
        target:event.target?.id || null,word:event.target?.closest?.('.word')?.querySelector('.base')?.textContent || null,
        x:event.clientX ?? null,y:event.clientY ?? null,trusted:event.isTrusted,cancelable:event.cancelable,
        connected:event.target?.isConnected === true,stamp}});
    };
    addEventListener(type,listener,{capture:true,passive:true}); witness.listeners.push([type,listener]);
  }
  witness.observer = new MutationObserver(() => {
    const view = document.body.dataset.view;
    if (witness.routes.at(-1) !== view) witness.routes.push(view);
  });
  witness.observer.observe(document.body,{attributes:true,attributeFilter:['data-view']});
  window.__huntNativeHandWitness = witness;
});
const readNativeHandWitness = (stop = false) => page.evaluate(stop => {
  const w = window.__huntNativeHandWitness;
  if (!w) return null;
  const receipt = {stamp:w.stamp,live:[...w.live],routes:w.routes.slice(),events:w.events.map(({event,captured}) => ({...captured,
    defaultPrevented:event.defaultPrevented,postDispatch:event.eventPhase === Event.NONE,
    stillConnected:event.target?.isConnected === true,sameDocument:event.target?.ownerDocument === document}))};
  if (stop) {
    w.observer.disconnect(); for (const [type,listener] of w.listeners) removeEventListener(type,listener,true);
    delete window.__huntNativeHandWitness;
  }
  return receipt;
}, stop);
const spreadHuntPair = (points, factor) => {
  const [a,b,...rest] = points, mx = (a[0]+b[0])/2, my = (a[1]+b[1])/2;
  return [[mx+(a[0]-mx)*factor,my+(a[1]-my)*factor,a[2]],
    [mx+(b[0]-mx)*factor,my+(b[1]-my)*factor,b[2]],...rest];
};
const sameHuntSky = (actual,before) => actual.view === 'drift' && actual.active && !actual.inert &&
  actual.ready && !actual.mini && !actual.sheet && actual.viewportScale === before.viewportScale &&
  isDeepStrictEqual(actual.place,before.place) && isDeepStrictEqual(actual.world,before.world);
const sameHuntRecord = (actual,before) => actual.revision === before.revision && isDeepStrictEqual(actual.record,before.record);
const runCanceledHuntHand = async (schedule) => {
  const trace = {case:'native-canceled-hand',schedule,inputError:null,commands:[],states:[],complete:false};
  let active = [], witnessStarted = false;
  const send = async (label,type,points) => {
    // CDP partial touchEnd names the contacts being released. Keep the
    // caller's desired remaining list separate and prove it from native events.
    const protocolPoints = type === 'touchEnd' && points.length
      ? active.filter(p=>!points.some(next=>next[2]===p[2])) : points;
    const command = {label,type,points:points.map(p=>p.slice()),protocolPoints:protocolPoints.map(p=>p.slice()),acknowledged:false};
    trace.commands.push(command);
    try { await T(type,protocolPoints); command.acknowledged = true; active = points; }
    catch (error) { trace.inputError = String(error); throw error; }
    await page.waitForTimeout(35);
    command.observed = await readNativeHandWitness();
    const touch = command.observed.events.findLast(e=>e.type.startsWith('touch'));
    command.physicalListMatches = command.observed.live.length === points.length && touch?.count === points.length;
  };
  const state = async label => {
    const facts = await huntScaleFacts(); trace.states.push({label,facts}); return facts;
  };
  try {
    await boot();
    trace.before = await settleHuntScale(trace);
    trace.recordBefore = await readAppRecordSnapshot(page);
    trace.aim = await nativeSkyPoints();
    assert(trace.aim, 'four native sky-owned footprints exist; never substitute words, stars or chrome');
    const [a,b,c,d] = trace.aim.points.map(([x,y],i)=>[x,y,301+i]);
    await beginNativeHandWitness(); witnessStarted = true;
    await send('A down','touchStart',[a]);
    await send('B down','touchStart',[a,b]);
    await send('C cancels hand','touchStart',[a,b,c]);
    const checks = [];
    checks.push(await state('third pointer cancels'));
    let remainder;
    if (schedule === 'originals-first') {
      await send('A up; B/C remain','touchEnd',[b,c]); checks.push(await state('A up'));
      await send('B up; C remains','touchEnd',[c]); checks.push(await state('only third remains'));
      await send('D down while C remains','touchStart',[c,d]); remainder = [c,d];
    } else if (schedule === 'third-first') {
      await send('C up; A/B remain','touchEnd',[a,b]); checks.push(await state('third up'));
      remainder = [a,b];
    } else remainder = [a,b,c];
    remainder = remainder.map(([x,y,id])=>[x+1,y+1,id]);
    await send('canceled remainder translates one pixel','touchMove',remainder);
    trace.noJump = await state('one-pixel remainder');
    trace.noJumpOk = checks.every(f=>sameHuntSky(f,trace.before)) && sameHuntSky(trace.noJump,trace.before);
    remainder = spreadHuntPair(remainder,1.6);
    await send('canceled remainder deliberately spreads 1.6x','touchMove',remainder);
    checks.push(await state('deliberate canceled spread'));
    if (schedule === 'third-first') {
      await send('D joins canceled A/B remainder','touchStart',[...remainder,d]);
      await send('A up; B/D remain','touchEnd',[remainder[1],d]);
      await send('B/D still quarantined','touchMove',[[remainder[1][0]+1,remainder[1][1]+1,remainder[1][2]],[d[0]+1,d[1]+1,d[2]]]);
      checks.push(await state('replacement after third-first lift'));
      await send('B up; D remains','touchEnd',[[d[0]+1,d[1]+1,d[2]]]);
    } else if (schedule === 'originals-first') {
      await send('C up; D remains','touchEnd',[remainder[1]]);
    }
    if (schedule !== 'touchcancel') {
      await send('last canceled finger moves','touchMove',active.map(([x,y,id])=>[x+1,y+1,id]));
      checks.push(await state('last canceled finger'));
    }
    const recordCanceled = await readAppRecordSnapshot(page);
    trace.canceledRecord = recordCanceled;
    trace.noRevivalOk = checks.every(f=>sameHuntSky(f,trace.before)) && sameHuntRecord(recordCanceled,trace.recordBefore);
    await send('physical all up',schedule === 'touchcancel' ? 'touchCancel' : 'touchEnd',[]);
    trace.allUp = await readNativeHandWitness();
    assert(trace.allUp.live.length === 0 && trace.allUp.events.at(-1)?.count === 0,
      'native terminals and an empty physical TouchList precede the next hand');
    trace.freshAim = await nativeSkyPoints();
    assert(trace.freshAim, 'a fresh native pair has real sky-owned footprints');
    const fresh = trace.freshAim.points.slice(0,2).map(([x,y],i)=>[x,y,401+i]);
    await send('fresh A down','touchStart',[fresh[0]]);
    await send('fresh B down','touchStart',fresh);
    await send('fresh spread crosses once','touchMove',spreadHuntPair(fresh,1.6));
    await page.waitForFunction(() => document.body.dataset.view === 'shelf',null,{timeout:5000});
    trace.shelf = await state('fresh shelf crossing');
    await send('crossed hand continues moving','touchMove',spreadHuntPair(fresh,1.8));
    trace.afterExtraMove = await state('no second crossing');
    await send('fresh physical all up','touchEnd',[]);
    trace.input = await readNativeHandWitness(true); witnessStarted = false;
    const events = trace.input.events, downs = events.filter(e=>e.type==='pointerdown');
    const ids = [...new Set(downs.map(e=>e.id))];
    const expectedDowns = schedule === 'touchcancel' ? 5 : 6;
    const expectedCommands = {'originals-first':16,'third-first':17,touchcancel:11}[schedule];
    const allUpCommand = trace.commands.findIndex(c=>c.label === 'physical all up');
    trace.inputIntegrity = trace.inputError === null && trace.commands.length === expectedCommands &&
      trace.commands.every(c=>c.acknowledged) && allUpCommand >= 0 &&
      trace.commands.slice(0,allUpCommand+1).every(c=>c.physicalListMatches) &&
      downs.length === expectedDowns && ids.length === expectedDowns && downs.every(e=>e.target==='sky' && !e.word) &&
      ids.every(id=>events.some(e=>e.id===id && ['pointerup','pointercancel'].includes(e.type))) &&
      events.some(e=>e.type==='pointermove') && events.some(e=>e.type==='touchmove') &&
      events.every(e=>e.trusted && e.connected && e.stillConnected && e.sameDocument && e.postDispatch && e.stamp===trace.input.stamp) &&
      trace.input.live.length === 0 && events.at(-1)?.count === 0 &&
      (schedule !== 'touchcancel' || events.some(e=>e.type==='pointercancel') && events.some(e=>e.type==='touchcancel' && e.count===0));
    trace.freshOk = trace.shelf.view === 'shelf' && !trace.shelf.active && trace.shelf.inert &&
      !trace.shelf.mini && !trace.shelf.sheet && isDeepStrictEqual(trace.shelf.place,trace.before.place) &&
      isDeepStrictEqual(trace.shelf.world,trace.before.world) && isDeepStrictEqual(trace.afterExtraMove,trace.shelf) &&
      isDeepStrictEqual(trace.input.routes,['drift','shelf']);
    const inverse = page.locator('.scale-thread[data-scale="shelf"] [data-scale-out]');
    assert.equal(await inverse.count(),1,'one real shelf-to-sky inverse');
    assert(await inverse.isVisible() && await inverse.isEnabled(),'the inverse is visibly enabled');
    trace.inverseHit = await inverse.evaluate(n => {
      const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {owned:hit===n||n.contains(hit),label:n.textContent,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};
    });
    assert(trace.inverseHit.owned,'the visible inverse owns the native tap');
    await inverse.tap();
    await page.waitForFunction(() => document.body.dataset.view === 'drift' && document.getElementById('drift-layer')?.classList.contains('active') && !document.getElementById('drift-layer')?.inert,null,{timeout:5000});
    trace.returned = await state('visible inverse returned');
    trace.recordAfter = await readAppRecordSnapshot(page);
    trace.returnOk = sameHuntSky(trace.returned,trace.before) && sameHuntRecord(trace.recordAfter,trace.recordBefore);
    trace.complete = true;
  } catch (error) {
    trace.error = {message:error.message,stack:error.stack};
  } finally {
    // Cleanup is recorded and can never turn an incomplete stream into a pass.
    if (active.length) {
      try { await T('touchCancel',[]); trace.cleanupCanceled = true; }
      catch (error) { trace.cleanupError = String(error); }
    }
    if (witnessStarted) trace.input = await readNativeHandWitness(true);
    await shot(`08-native-canceled-${schedule}.png`);
    stagings.push(trace);
    writeFileSync(resolve(EVIDENCE,`${EVIDENCE_PHASE}-native-canceled-${schedule}.json`),JSON.stringify(trace,null,2)+'\n');
  }
  return trace;
};

const canceledHands = [];
for (const schedule of ['originals-first','third-first','touchcancel']) canceledHands.push(await runCanceledHuntHand(schedule));
const handPassed = (key) => canceledHands.length === 3 && canceledHands.every(t=>t.complete && t.inputIntegrity && t[key]);
const handDetail = (key) => canceledHands.map(t=>`${t.schedule}: complete=${t.complete}, native=${t.inputIntegrity ?? false}, ${key}=${t[key] ?? false}${t.error ? `, error=${t.error.message}` : ''}`).join(' | ');
check('hunt · a canceled three-pointer hand does not jump when a remainder moves',handPassed('noJumpOk'),handDetail('noJumpOk'));
check('hunt · a canceled three-pointer hand cannot revive before all physical pointers end',handPassed('noRevivalOk'),handDetail('noRevivalOk'));
check('hunt · a fully released canceled hand admits exactly one fresh native scale crossing',handPassed('freshOk'),handDetail('freshOk'));
check('hunt · the fresh-hand visible inverse restores the retained sky place without record changes',handPassed('returnOk'),handDetail('returnOk'));

/* 16 · lifecycle clocks yield to an active finger even when it is perfectly
 * still. This deliberately crosses the ten-second idle expiry boundary. */
await boot();
w = await page.evaluate(anyWord);
await tap(w.x, w.y);
await page.waitForTimeout(900);
const heldBloomBefore = await page.evaluate(world);
const stillWater = await page.evaluate(openWater);
if (stillWater) {
  await T('touchStart', [[stillWater.x, stillWater.y, 41]]);
  await page.waitForTimeout(11200);
}
const heldBloomAfter = await page.evaluate(world);
await shot('09-stationary-hold-lifecycle.png');
if (stillWater) await T('touchEnd', []);
check('hunt · a stationary active pointer prevents bloom lifecycle expiry beneath it',
  !!stillWater && heldBloomBefore.ctr !== null &&
    heldBloomAfter.ctr === heldBloomBefore.ctr && heldBloomBefore.sats > 0 &&
    heldBloomAfter.sats === heldBloomBefore.sats &&
    JSON.stringify(heldBloomAfter.members) === JSON.stringify(heldBloomBefore.members),
  `water=${JSON.stringify(stillWater)}; centre "${heldBloomBefore.ctr}" → "${heldBloomAfter.ctr}", ` +
    `sats=${heldBloomBefore.sats} → ${heldBloomAfter.sats}, ` +
    `same identities=${JSON.stringify(heldBloomAfter.members) === JSON.stringify(heldBloomBefore.members)} after 11.2s`);

/* 17 · pointer cancellation is authoritative only for a tracked pointer, and
 * a real cancellation starts a fresh idle interval instead of expiring the
 * bloom immediately after a long hold. */
await boot();
w = await page.evaluate(anyWord);
await tap(w.x, w.y);
await page.waitForTimeout(900);
const cancelBefore = await page.evaluate(world);
const cancelWater = await page.evaluate(openWater);
if (cancelWater) {
  await T('touchStart', [[cancelWater.x, cancelWater.y, 51]]);
  await page.waitForTimeout(10400);
  await runtimePointer('pointercancel', cancelWater.x, cancelWater.y, 999999);
  await page.waitForTimeout(900);
}
const afterForeignCancel = await page.evaluate(world);
if (cancelWater) await T('touchCancel', []);
await page.waitForTimeout(1200);
const afterTrackedCancel = await page.evaluate(world);
check('hunt · foreign cancel cannot erase a tracked hand or its bloom lifecycle',
  !!cancelWater && cancelBefore.ctr !== null && afterForeignCancel.ctr === cancelBefore.ctr &&
    afterTrackedCancel.ctr === cancelBefore.ctr &&
    JSON.stringify(afterForeignCancel.members) === JSON.stringify(cancelBefore.members) &&
    JSON.stringify(afterTrackedCancel.members) === JSON.stringify(cancelBefore.members),
  `centre "${cancelBefore.ctr}" → foreign "${afterForeignCancel.ctr}" → tracked+1.2s "${afterTrackedCancel.ctr}"; ` +
    `foreign identities=${JSON.stringify(afterForeignCancel.members) === JSON.stringify(cancelBefore.members)}, ` +
    `fresh-idle identities=${JSON.stringify(afterTrackedCancel.members) === JSON.stringify(cancelBefore.members)}`);

/* 18 · release coordinates carry no authority without a delivered move.
 * A water-down/hub-up discontinuity must be a no-op. A deliberate hub tap
 * first releases the held bloom; the same tap on the now-open field is a real
 * door, and no constellation may survive the resulting dive. */
await boot();
w = await page.evaluate(anyWord);
const nodeBefore = await page.evaluate(wordAt(w.w));
const nodeReleaseWater = await page.evaluate(openWater);
const nodeTrayBefore = (await page.evaluate(world)).tray;
if (nodeBefore.exists && nodeReleaseWater) {
  await M('mousePressed', nodeBefore.x, nodeBefore.y);
  await page.waitForTimeout(65);
  await M('mouseReleased', nodeReleaseWater.x, nodeReleaseWater.y); // deliberately no move event
  await page.waitForTimeout(650);
}
const nodeAfter = await page.evaluate(wordAt(w.w));
const nodeWorldAfter = await page.evaluate(world);
check('hunt · node-down/far-up without a delivered move is not a tap, drag, or grade',
  nodeBefore.exists && !!nodeReleaseWater && nodeAfter.exists &&
    Math.hypot(nodeAfter.x - nodeBefore.x, nodeAfter.y - nodeBefore.y) < 12 &&
    nodeWorldAfter.tray === nodeTrayBefore && nodeWorldAfter.ctr === null && nodeWorldAfter.depth === '',
  `word displacement=${nodeAfter.exists ? Math.hypot(nodeAfter.x - nodeBefore.x, nodeAfter.y - nodeBefore.y).toFixed(1) : '∞'}px; ` +
    `tray ${JSON.stringify(nodeTrayBefore)}→${JSON.stringify(nodeWorldAfter.tray)}, ctr=${nodeWorldAfter.ctr}, depth=${JSON.stringify(nodeWorldAfter.depth)}`);

const releaseHub = await stageHubBloom('terminal-hub-release');
const releaseBefore = await page.evaluate(world);
const releaseWater = await page.evaluate(openWater);
if (releaseWater && releaseHub) {
  await M('mousePressed', releaseWater.x, releaseWater.y);
  await page.waitForTimeout(65);
  await M('mouseReleased', releaseHub.x, releaseHub.y); // intentionally no mouseMoved
  await page.waitForTimeout(750);
}
const releaseAfter = await page.evaluate(world);
stagings[stagings.length - 1].terminal = { water: releaseWater, before: releaseBefore, after: releaseAfter };

const deliberateHub = await stageHubBloom('deliberate-hub-release');
const deliberateBefore = await page.evaluate(world);
if (deliberateHub) {
  await tap(deliberateHub.x, deliberateHub.y);
  await page.waitForTimeout(650);
}
const deliberateRelease = await page.evaluate(world);
if (deliberateHub && deliberateRelease.depth === '' && deliberateRelease.ctr === null) {
  await tap(deliberateHub.x, deliberateHub.y);
  await page.waitForTimeout(1100);
}
const deliberateDive = await page.evaluate(world);
const themeBefore = await page.getAttribute('html', 'data-theme');
if (deliberateDive.depth) {
  await page.tap('#ginga-theme-seal');
  await page.waitForSelector('.world-picker');
  await page.locator('.world-stone[aria-pressed="false"]').first().tap();
  await page.waitForTimeout(350);
  const diveWater = await page.evaluate(openWater);
  if (diveWater) {
    await tap(diveWater.x, diveWater.y);
    await page.waitForTimeout(1200);
  }
}
const afterThemeSurface = await page.evaluate(world);
const themeAfter = await page.getAttribute('html', 'data-theme');
stagings[stagings.length - 1].release = deliberateRelease;
stagings[stagings.length - 1].dive = deliberateDive;
stagings[stagings.length - 1].theme = { before: themeBefore, after: themeAfter };
stagings[stagings.length - 1].surfaced = afterThemeSurface;
await shot('10-hub-release-theme-cleanup.png');
check('hunt · hub release cannot hijack a gesture or leave themed ghost satellites',
  !!releaseWater && !!releaseHub && releaseAfter.depth === '' && releaseAfter.ctr === releaseBefore.ctr &&
    releaseBefore.sats > 0 && releaseAfter.sats === releaseBefore.sats &&
    JSON.stringify(releaseAfter.members) === JSON.stringify(releaseBefore.members) &&
    !!deliberateHub && deliberateBefore.ctr !== null && deliberateRelease.depth === '' &&
    deliberateRelease.ctr === null && deliberateRelease.sats === 0 && deliberateDive.depth !== '' &&
    themeAfter !== themeBefore && afterThemeSurface.depth === '' && afterThemeSurface.ctr === null && afterThemeSurface.sats === 0,
  `terminal ${Math.hypot((releaseHub?.x ?? 0) - (releaseWater?.x ?? 0), (releaseHub?.y ?? 0) - (releaseWater?.y ?? 0)).toFixed(0)}px: ` +
    `depth="${releaseAfter.depth}", centre="${releaseAfter.ctr}", sats=${releaseBefore.sats}→${releaseAfter.sats}, ` +
    `same identities=${JSON.stringify(releaseAfter.members) === JSON.stringify(releaseBefore.members)}; ` +
    `deliberate release ctr="${deliberateBefore.ctr}"→"${deliberateRelease.ctr}", depth="${deliberateRelease.depth}"; ` +
    `second-tap depth="${deliberateDive.depth}"; ` +
    `theme=${JSON.stringify(themeBefore)}→${JSON.stringify(themeAfter)}; after theme+surface centre="${afterThemeSurface.ctr}", sats=${afterThemeSurface.sats}`);

check('hunt · no page errors across the regression battery', errs.length === 0, errs.slice(0, 2).join(' | '));

console.log(`\n${fails === 0 ? 'ALL HUNT REGRESSIONS GREEN' : fails + ' HUNT REGRESSION(S) FAILING'}`);
writeFileSync(resolve(EVIDENCE, 'drift-hunt-report.json'), JSON.stringify({ schemaVersion: 1, engine: 'chromium', artifact: JSON.parse(readFileSync(resolve(CORRIDOR, 'build-identity.json'))).artifactSha256, site: CORRIDOR, sourceSha256, results, stagings, errors: errs, pass: fails === 0 }, null, 2) + '\n');
await browser.close();
server.close();
process.exit(fails === 0 ? 0 : 1);
