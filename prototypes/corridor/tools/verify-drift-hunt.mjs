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
const openWater = `(() => {
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
    `document.querySelectorAll('#drift-layer .word.unfolded, #drift-layer .word.glossed').length`);
  // a label we hold no reading for must reach its gloss on the FIRST tap:
  // its furigana stage would answer with nothing visible
  const muteOk = !sat9.mute || st.glossed > 0 || (await page.evaluate(
    `document.querySelectorAll('#drift-layer .word.glossed').length`)) > 0;
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
  return { x: r.left + r.width / 2, y: r.bottom + 22 };   // 22px below its edge, inside 44px
})()`);
if (ctr10) await tap(ctr10.x, ctr10.y);
await page.waitForTimeout(500);
let after10 = await page.evaluate(lockState);
check('hunt · a 44px near-miss under a lock forgives instead of razing',
  before10.ctr !== null && after10.ctr !== null,
  `centre "${before10.ctr}" → "${after10.ctr}"`);

/* 11 · a deliberate release is never consumed by the hub-sun door, and no
 * constellation rides into a dive (P1). Six independent blooms, each
 * released on far water — one of them lands on a hub sooner or later. */
// Find a real hub the only way the DOM allows: hubs have no element, so probe
// water with nothing held — a point that dives IS a hub centre. The field
// boots deterministically, so the same screen point is the same hub next boot.
// The bloom glides the camera, so the hub must be found in the SAME camera
// state it will be used in: stage the bloom, release it, then probe.
await boot();
const wStage = await page.evaluate(anyWord);
await tap(wStage.x, wStage.y);
await page.waitForTimeout(1200);
const clearWater = await page.evaluate(openWater);
if (clearWater) { await tap(clearWater.x, clearWater.y); await page.waitForTimeout(500); }
let hub = null;
for (let y = 236; y < 728 && !hub; y += 30) {
  for (let x = 44; x < 350 && !hub; x += 30) {
    // a hub sun IS a galaxy centre, so words cluster around it — a radial
    // clearance test excludes exactly where hubs live. Hit-test instead.
    const clear = await page.evaluate(`(() => {
      const el = document.elementFromPoint(${x}, ${y});
      if (!el) return false;
      return !el.closest('.word,.glyph,.part,#lvl,#theme,#card,#radoc,#drift-tray,.drift-door,header,nav,button,a');
    })()`);
    if (!clear) continue;
    await tap(x, y);
    await page.waitForTimeout(420);
    const st = await page.evaluate(lockState);
    if (st.depth !== '') { hub = { x, y, ch: st.depth }; break; }
    if (st.ctr !== null) { await tap(x, y); await page.waitForTimeout(300); }  // stray bloom: clear it
  }
}
if (hub) {
  await boot();
  const wh = await page.evaluate(anyWord);
  await tap(wh.x, wh.y);
  await page.waitForTimeout(1200);   // identical staging to the probe pass
  const held = await page.evaluate(lockState);
  await tap(hub.x, hub.y);
  await page.waitForTimeout(700);
  const after = await page.evaluate(lockState);
  check('hunt · a release on a hub sun releases the constellation instead of diving',
    held.ctr !== null && after.depth === '' && after.ctr === null,
    `hub "${hub.ch}" at (${hub.x},${hub.y}) · held "${held.ctr}" → ctr ${after.ctr}, depth "${after.depth}"`);
} else {
  check('hunt · a release on a hub sun releases the constellation instead of diving', false,
    'no hub found by probing — the check cannot prove anything, treat as red');
}

/* 12 · a foreign finger cannot carry a held word (pointermove had no
 * ownership check; #card swallows pointerdown and has no pointermove
 * listener at all, so a thumb resting on the open card was invisible to the
 * touch set while its every move still reached the drag branch, P1).
 * Run inside a dive with the card open: no camera pan, no tide rail, so a
 * raw pixel delta is honest here. */
await boot();
w = await page.evaluate(anyWord);
await tap(w.x, w.y);
await page.waitForTimeout(500);
await tap(w.x, w.y);
await page.waitForTimeout(400);
await tap(w.x, w.y);
await page.waitForTimeout(1600); // dive
const centre = await page.evaluate(`(() => {
  const el = document.querySelector('#drift-layer .word.center');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
if (centre) { await tap(centre.x, centre.y); await page.waitForTimeout(700); } // opens the card
const stage = await page.evaluate(`(() => {
  const card = document.getElementById('card');
  const cr = card && card.classList.contains('open') ? card.getBoundingClientRect() : null;
  // the tear is (foreign finger − owner finger) × 0.9 horizontally, so the
  // two fingers must be as far apart as the surface allows for the failure to
  // be unmistakable against ordinary orbit drift
  const orb = [...document.querySelectorAll('#drift-layer .word')].map((el) => {
    const r = el.getBoundingClientRect();
    return { el, r, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }).filter((o) => o.r.width && !o.el.classList.contains('center') &&
    parseFloat(o.el.style.opacity || '1') > 0.4 && o.r.top > 110 && o.r.bottom < 560 &&
    (!cr || o.r.bottom < cr.top - 20))
    .sort((a, b) => (a.y + a.x) - (b.y + b.x))[0];   // highest and leftmost
  return {
    card: cr ? { x: cr.right - 26, y: cr.top + 20 } : null,   // far corner of the card
    orb: orb ? { w: orb.el.querySelector('.base')?.textContent ?? '', x: orb.x, y: orb.y } : null,
  };
})()`);
// orbiters keep circling on their own inside a dive, so a raw pixel delta
// measures orbit, not carry. Compare the held word against the field's own
// median displacement over the identical window — the way the hunt measured.
const fieldPos = `(() => Object.fromEntries([...document.querySelectorAll('#drift-layer .word')]
  .map((el) => {
    const r = el.getBoundingClientRect();
    return [el.querySelector('.base')?.textContent ?? '', [r.left + r.width / 2, r.top + r.height / 2]];
  })))()`;
if (stage.card && stage.orb) {
  const p0 = await page.evaluate(fieldPos);
  await TI('touchStart', [{ x: stage.orb.x, y: stage.orb.y, id: 1 }]);
  await page.waitForTimeout(90);
  await TI('touchStart', [{ x: stage.orb.x, y: stage.orb.y, id: 1 }, { x: stage.card.x, y: stage.card.y, id: 2 }]);
  for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(40);
    await TI('touchMove', [{ x: stage.orb.x, y: stage.orb.y, id: 1 },
                           { x: stage.card.x - i * 22, y: stage.card.y + i * 6, id: 2 }]);
  }
  const p1 = await page.evaluate(fieldPos);
  await TI('touchEnd', [{ x: stage.orb.x, y: stage.orb.y, id: 1 },
                        { x: stage.card.x - 132, y: stage.card.y + 36, id: 2 }]);
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
  check('hunt · a finger the gesture never owned cannot carry a held word',
    target >= 0 && target - median < 30,
    `held ${target.toFixed(1)}px vs orbiter median ${median.toFixed(1)}px of ${live.length} moving ` +
    `(all-words median ${(deltas[Math.floor(deltas.length / 2)] ?? 0).toFixed(1)}px, max ${(deltas[deltas.length - 1] ?? 0).toFixed(1)}px)`);
} else {
  check('hunt · a finger the gesture never owned cannot carry a held word', false,
    `staging failed: card=${!!stage.card} orbiter=${!!stage.orb}`);
}

/* 13 · a finger on the glass is not inactivity — the bloom must outlive the
 * 10s fade while it is being held perfectly still (P2) */
await boot();
w = await page.evaluate(anyWord);
await tap(w.x, w.y);
await page.waitForTimeout(1100);
const water13 = await page.evaluate(openWater);
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

check('hunt · no page errors across the regression battery', errs.length === 0, errs.slice(0, 2).join(' | '));

console.log(`\n${fails === 0 ? 'ALL HUNT REGRESSIONS GREEN' : fails + ' HUNT REGRESSION(S) FAILING'}`);
await browser.close();
server.close();
process.exit(fails === 0 ? 0 : 1);
