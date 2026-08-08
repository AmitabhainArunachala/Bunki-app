/**
 * Hunt regressions — the twelve defects the 2026-08-08 adversarial workflow
 * confirmed, each pinned as a permanent check so none can ever come back.
 * (docs/prompts/DRIFT_ZERO_QUIRK_SPEC_2026-08-08.md §4.3: the case stays in
 * the matrix forever after.)
 *
 * Usage: node verify-drift-hunt.mjs
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const CORRIDOR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE = resolve(CORRIDOR, 'evidence', 'a0-drift-hunts-20260808');
const EVIDENCE_PHASE = (process.env.DRIFT_HUNT_EVIDENCE_PHASE || 'current').replace(/[^a-z0-9_-]/gi, '');
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
  try { localStorage.clear(); } catch {}

  // Keep the verifier black-box while still locating the two kinds of ink
  // that have no DOM hit target: faint hub sprites and legacy canvas-only
  // semantic labels. The hooks observe real canvas calls; they do not reach
  // into Drift's closure or mutate its interaction state.
  window.__driftHuntCanvas = { hubs: [], labels: [] };
  window.__driftHuntPointerDowns = [];
  addEventListener('pointerdown', (event) => {
    window.__driftHuntPointerDowns.push({
      id: event.pointerId,
      type: event.pointerType,
      x: event.clientX,
      y: event.clientY,
    });
  }, true);
  const cap = (items, item) => {
    items.push(item);
    if (items.length > 1200) items.splice(0, 600);
  };
  const proto = CanvasRenderingContext2D.prototype;
  const drawImage = proto.drawImage;
  proto.drawImage = function (...args) {
    if (
      this.canvas?.id === 'fx' && args.length === 5 &&
      args[0] instanceof HTMLCanvasElement && args[0].width === 96 && args[0].height === 96
    ) {
      cap(window.__driftHuntCanvas.hubs, {
        x: args[1] + args[3] / 2,
        y: args[2] + args[4] / 2,
        at: performance.now(),
      });
    }
    return drawImage.apply(this, args);
  };
  const fillText = proto.fillText;
  proto.fillText = function (text, x, y, ...rest) {
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
  // CDP Input cannot encode a partial touch lift: touchEnd/touchCancel require
  // an empty point list. Preserve the browser-generated active identities,
  // then deliver the one changed PointerEvent through CDP Runtime so the app
  // receives the exact A-up / B+C-move sequence without an invalid protocol
  // payload or a guessed pointer id.
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
      buttons: ${type === 'pointerup' ? 0 : 1},
      pressure: ${type === 'pointerup' ? 0 : 0.5},
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
const boot = async () => {
  await page.goto(`${base}/index.html?entry=drift`);
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
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
  card: document.getElementById('card')?.classList.contains('open') ?? false,
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
    if (h.x < 52 || h.x > 338 || h.y < 170 || h.y > 690) continue;
    if (nodes.some((n) => Math.hypot(n.x - h.x, n.y - h.y) < 58)) continue;
    const hit = document.elementFromPoint(h.x, h.y);
    if (hit?.closest?.('.word,.glyph,.part,#theme,#lvl,.drift-door')) continue;
    return { x: h.x, y: h.y };
  }
  return null;
})()`;
const shot = (name) => page.screenshot({
  path: resolve(EVIDENCE, name.replace(/\.png$/, `-${EVIDENCE_PHASE}.png`)),
});

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

/* 7 · semantic constellation members are touchable DOM, including kana.
 * The legacy canvas fallback was visible but untouchable: tapping its label
 * hit water and dismantled the lock. A kana-only member must also be able to
 * become a centre whose same-level fallback has real members. */
const semanticMember = (label) => page.evaluate((target) => {
  const el = [...document.querySelectorAll('#drift-layer .word')]
    .find((node) => (node.querySelector('.base')?.textContent ?? '') === target);
  if (el) {
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      dom: true,
      x,
      y,
      hitSelf: hit === el || el.contains(hit),
      unfolded: el.classList.contains('unfolded'),
      glossed: el.classList.contains('glossed'),
    };
  }
  const now = performance.now();
  const ink = [...(window.__driftHuntCanvas?.labels ?? [])].reverse()
    .find((point) => point.text === target && now - point.at < 260);
  return ink ? { dom: false, hitSelf: false, x: ink.x, y: ink.y, unfolded: false, glossed: false } : null;
}, label);
await boot();
const lockStarted = await page.evaluate(`window.__lockWord?.('厳しい') === true`);
await page.waitForTimeout(1400);
const semanticTarget = await semanticMember('きつい');
const semanticBefore = await page.evaluate(world);
await shot('07-semantic-member-before.png');
if (semanticTarget) {
  await tap(semanticTarget.x, semanticTarget.y);
  await page.waitForTimeout(550);
}
const semanticRevealOne = await semanticMember('きつい');
const semanticAfterOne = await page.evaluate(world);
if (semanticRevealOne?.dom) {
  await tap(semanticRevealOne.x, semanticRevealOne.y);
  await page.waitForTimeout(500);
}
const semanticRevealTwo = await semanticMember('きつい');
const semanticAfterTwo = await page.evaluate(world);
check('hunt · a semantic canvas label is replaced by staged, hit-testable DOM interaction',
  lockStarted && semanticTarget?.dom === true && semanticTarget.hitSelf === true &&
    semanticBefore.ctr === '厳しい' && semanticAfterOne.ctr === '厳しい' && semanticAfterTwo.ctr === '厳しい' &&
    semanticRevealOne?.unfolded === true && semanticRevealOne.glossed === false &&
    semanticRevealTwo?.unfolded === true && semanticRevealTwo.glossed === true,
  `DOM=${semanticTarget?.dom ?? false}, hitSelf=${semanticTarget?.hitSelf ?? false}; ` +
    `stage1=${semanticRevealOne?.unfolded ?? false}/${semanticRevealOne?.glossed ?? false}, ` +
    `stage2=${semanticRevealTwo?.unfolded ?? false}/${semanticRevealTwo?.glossed ?? false}; ` +
    `centre "${semanticBefore.ctr}" → "${semanticAfterOne.ctr}" → "${semanticAfterTwo.ctr}"`);

// Start the lock afresh so the old canvas failure cannot mask the kana-only
// fallback half of the hunt.
await page.evaluate(`window.__lockWord?.('厳しい')`);
await page.waitForTimeout(1200);
const kanaTarget = await page.evaluate(`(() => {
  const el = [...document.querySelectorAll('#drift-layer .word')]
    .find((n) => (n.querySelector('.base')?.textContent ?? '') === 'きつい');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
if (kanaTarget) {
  await T('touchStart', [[kanaTarget.x, kanaTarget.y]]);
  await page.waitForTimeout(560);
  await T('touchEnd', []);
  await page.waitForTimeout(900);
}
const kanaFallback = await page.evaluate(world);
await shot('07-semantic-dom-kana-fallback.png');
check('hunt · a kana-only semantic word grows a meaningful same-level fallback constellation',
  kanaFallback.ctr === 'きつい' && kanaFallback.sats >= 6 && kanaFallback.members.length === kanaFallback.sats,
  `centre="${kanaFallback.ctr}", DOM sats=${kanaFallback.sats}, members=${kanaFallback.members.join('・')}`);

/* 8 · pointer identity is part of gesture authority. A mouse/foreign pointer
 * may not move a touch-held word, and changing the active pair after a third
 * finger joins must rebase the pinch before its next 1px translation. */
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

await boot();
w = await page.evaluate(anyWord);
await page.evaluate(`window.__driftHuntPointerDowns.length = 0`);
const a0 = [45, 190, 31];
const b0 = [145, 190, 32];
const a1 = [35, 190, 31];
const b1 = [155, 190, 32];
await T('touchStart', [a0]);
await T('touchStart', [a0, b0]);
await T('touchMove', [a1, b1]);
await page.waitForTimeout(180);
const held = await page.evaluate(wordAt(w.w));
const c0 = [held.x, held.y, 33];
await T('touchStart', [a1, b1, c0]);
await page.waitForTimeout(70);
const aPointer = await pointerIdAt(a0[0], a0[1]);
const bPointer = await pointerIdAt(b0[0], b0[1]);
const cPointer = await pointerIdAt(c0[0], c0[1]);
if (aPointer != null) await runtimePointer('pointerup', a1[0], a1[1], aPointer, true);
await page.waitForTimeout(100);
const pinchBefore = await page.evaluate(wordAt(w.w));
if (bPointer != null) await runtimePointer('pointermove', b1[0] + 1, b1[1] + 1, bPointer);
if (cPointer != null) await runtimePointer('pointermove', held.x + 1, held.y + 1, cPointer);
await page.waitForTimeout(260);
const pinchAfter = await page.evaluate(wordAt(w.w));
const pinchScale = pinchBefore.exists && pinchAfter.exists && pinchBefore.width
  ? pinchAfter.width / pinchBefore.width
  : Infinity;
await shot('08-pointer-identity-pinch-rebase.png');
await T('touchCancel', []);
check('hunt · a foreign pointermove cannot drag a touch-held word',
  foreignDisplacement < 8,
  `foreign-pointer displacement=${Number.isFinite(foreignDisplacement) ? foreignDisplacement.toFixed(1) : '∞'}px`);
check('hunt · a replacement pinch pair rebases before its first translated move',
  aPointer != null && bPointer != null && cPointer != null && pinchScale > 0.92 && pinchScale < 1.08,
  `browser ids A/B/C=${aPointer}/${bPointer}/${cPointer}; ` +
    `1px replacement-pair scale=${Number.isFinite(pinchScale) ? pinchScale.toFixed(3) : '∞'}×`);

/* 9 · lifecycle clocks yield to an active finger even when it is perfectly
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

/* 10 · release coordinates carry no authority without a delivered move.
 * A water-down/hub-up discontinuity must not dive. A genuine hub tap still
 * dives, but it first retires the bloom so theme changes and surfacing cannot
 * resurrect ghost satellites. */
await boot();
w = await page.evaluate(anyWord);
await tap(w.x, w.y);
await page.waitForTimeout(1100);
const releaseBefore = await page.evaluate(world);
const releaseWater = await page.evaluate(openWater);
const releaseHub = await page.evaluate(freshHub);
if (releaseWater && releaseHub) {
  await M('mousePressed', releaseWater.x, releaseWater.y);
  await page.waitForTimeout(65);
  await M('mouseReleased', releaseHub.x, releaseHub.y); // intentionally no mouseMoved
  await page.waitForTimeout(750);
}
const releaseAfter = await page.evaluate(world);

await boot();
w = await page.evaluate(anyWord);
await tap(w.x, w.y);
await page.waitForTimeout(1100);
const deliberateHub = await page.evaluate(freshHub);
if (deliberateHub) {
  await tap(deliberateHub.x, deliberateHub.y);
  await page.waitForTimeout(1100);
}
const deliberateDive = await page.evaluate(world);
if (deliberateDive.depth) {
  await page.tap('#drift-layer #theme');
  await page.waitForTimeout(350);
  const diveWater = await page.evaluate(openWater);
  if (diveWater) {
    await tap(diveWater.x, diveWater.y);
    await page.waitForTimeout(1200);
  }
}
const afterThemeSurface = await page.evaluate(world);
await shot('10-hub-release-theme-cleanup.png');
check('hunt · hub release cannot hijack a gesture or leave themed ghost satellites',
  !!releaseWater && !!releaseHub && releaseAfter.depth === '' && releaseAfter.ctr === releaseBefore.ctr &&
    releaseBefore.sats > 0 && releaseAfter.sats === releaseBefore.sats &&
    JSON.stringify(releaseAfter.members) === JSON.stringify(releaseBefore.members) &&
    !!deliberateHub && deliberateDive.depth !== '' &&
    afterThemeSurface.depth === '' && afterThemeSurface.ctr === null && afterThemeSurface.sats === 0,
  `terminal ${Math.hypot((releaseHub?.x ?? 0) - (releaseWater?.x ?? 0), (releaseHub?.y ?? 0) - (releaseWater?.y ?? 0)).toFixed(0)}px: ` +
    `depth="${releaseAfter.depth}", centre="${releaseAfter.ctr}", sats=${releaseBefore.sats}→${releaseAfter.sats}, ` +
    `same identities=${JSON.stringify(releaseAfter.members) === JSON.stringify(releaseBefore.members)}; deliberate depth="${deliberateDive.depth}"; ` +
    `after theme+surface centre="${afterThemeSurface.ctr}", sats=${afterThemeSurface.sats}`);

check('hunt · no page errors across the regression battery', errs.length === 0, errs.slice(0, 2).join(' | '));

console.log(`\n${fails === 0 ? 'ALL HUNT REGRESSIONS GREEN' : fails + ' HUNT REGRESSION(S) FAILING'}`);
await browser.close();
server.close();
process.exit(fails === 0 ? 0 : 1);
