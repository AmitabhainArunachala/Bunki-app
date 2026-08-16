/**
 * WP9a — empirical confirmation of the Drift pool's reachable ceiling.
 *
 * Runs the REAL drift prototype in real Chromium and counts, per tide stop,
 * the distinct words that ever become a readable DOM `.word` node. Three probes:
 *
 *   sweep  — walks the camera over its whole clamped range and unions the
 *            chooser's picks. On the pre-fix source this is the CEILING (§3 of
 *            the README). On the fixed source add `--pin-phase 0` to hold the
 *            paging wheel still: the phase-0 identity says that must reproduce
 *            the pre-fix ceiling exactly. WITHOUT --pin-phase the sweep turns
 *            the wheel — adjacent grid poses are ~25px apart in x and ~54px in
 *            y, well under the odometer's 200px teleport guard — and the number
 *            it returns is a union over (pose, phase) pairs, not a ceiling.
 *   drift  — a real CDP touch session: repeated finger pans across the glass
 *            with the frame loop running, sampling `#sky .word` labels as they
 *            appear. The curve a human actually walks.
 *   prove  — the targeted post-fix probe. Takes the words reachable-set.mjs
 *            found UNREACHABLE at default zoom and shows each one surfacing as
 *            a real DOM node after a bounded swim, driven through the source's
 *            own camClamp so the source's own pageOdometer turns the wheel.
 *
 * No instrumentation is added to the source. The drift prototype's script is a
 * classic top-level <script>, so its top-level bindings (`cam`, `WORDS`,
 * `WORDIX`, `ACTIVE`, `refreshActive`, `camClamp`, `lvlSet`, `WALL`) live in the
 * realm's global lexical environment and are readable from page.evaluate by
 * name — nothing had to be exported to measure any of this.
 *
 * Usage:
 *   node instrument-pool.mjs --probe sweep --zooms 1 --grid 40 --agree 64
 *   node instrument-pool.mjs --probe drift --seconds 90
 *   node instrument-pool.mjs --probe prove --sample 40 --out prove.json
 *   node instrument-pool.mjs --src /tmp/drift-prefix.html --probe sweep
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const DEFAULT_DRIFT = resolve(ROOT, 'prototypes/drift/drift-artifact.html');

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const PROBE = arg('probe', 'sweep');
const ZOOMS = String(arg('zooms', '1')).split(',').map(Number);
const GRID = Number(arg('grid', 40));
const SECONDS = Number(arg('seconds', 60));
const OUT = arg('out', null);
// hold the paging wheel still at this phase for the whole sweep. --pin-phase 0
// makes the fixed source measure exactly what the pre-fix source measures, which
// is the browser-level check on the phase-0 identity. Ignored on a build with no
// wheel, so the same command line works on both arms.
const PIN = argv.includes('--pin-phase') ? Number(arg('pin-phase', 0)) : null;
const VW = Number(arg('vw', 390));
const VH = Number(arg('vh', 844));

/* the prototype is artifact body content — wrap it the way its README does */
const DRIFT = resolve(process.cwd(), arg('src', DEFAULT_DRIFT));
const page_html =
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">' +
  `</head><body>${readFileSync(DRIFT, 'utf8')}</body></html>`;
console.log(`source: ${DRIFT}`);

const server = createServer((q, r) => {
  r.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'text/html; charset=utf-8' });
  r.end(page_html);
});
const base = await new Promise((ok) =>
  server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${server.address().port}`)),
);

const TIDES = [
  { lv: 1, label: 'N1', stop: 1 },
  { lv: 2, label: 'N2', stop: 2 },
  { lv: 3, label: 'N3', stop: 3 },
  { lv: 4, label: 'N4', stop: 4 },
  { lv: 5, label: 'N5', stop: 5 },
];

const pageErrors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await ctx.addInitScript(`try { localStorage.clear(); } catch (e) {}`);
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`);
});
await page.goto(base, { waitUntil: 'load' });
await page.waitForTimeout(1500);

/* the source's own bindings are reachable by name from the same realm */
const wired = await page.evaluate(
  `typeof cam === 'object' && typeof WORDS === 'object' && typeof refreshActive === 'function'`,
);
if (!wired) throw new Error('drift internals not reachable — the source shape changed');

/* set the tide exactly as the slider does (lvlSet(stopIndex, commit=true)) */
async function setTide(stop) {
  await page.evaluate(`lvlSet(${stop}, true)`);
  await page.waitForTimeout(700); // tideChange schedules refreshActive at +300ms
}

const tierByLevel = await page.evaluate(`(() => {
  const t = {};
  for (const e of WALL) { const l = e[5] || 3; t[l] = (t[l] || 0) + 1; }
  return t;
})()`);

const results = { probe: PROBE, viewport: { VW, VH }, tierByLevel, tides: {} };

/* ------------------------------------------------------------------ sweep */
/* The pose walk. `select(z)` is a MIRROR of refreshActive's chooser: same
 * WORDS array, same source-computed `wr.pri` (set by the page's own rePri),
 * same w2s projection, same pad=140, same 64 — it only skips the DOM mount,
 * which is what makes a dense sweep affordable (a real mount is 64 nodes a
 * pose). `--agree N` then re-walks N poses calling the REAL refreshActive and
 * asserts its ACTIVE set equals the mirror's pick pose-for-pose, so the mirror
 * is not taken on trust. */
const MIRROR = `
// the paging wheel exists only in the fixed source; mirror whichever chooser
// this build actually has, so --agree is a real check on both arms
window.__wp9aPaged = (typeof PAGE_SPAN !== 'undefined' && typeof pageOf === 'function');
window.__wp9aScore = window.__wp9aPaged
  ? function (wr) { return wr.pri + PAGE_SPAN * pageOf(wr); }
  : function (wr) { return wr.pri; };
window.__wp9aSelect = function (z) {
  cam.z = z;
  const pad = 140, vis = [];
  for (const wr of WORDS) {
    const s = w2s(wr.wx, wr.wy);
    wr.sx = s.x; wr.sy = s.y;
    if (wr.gradedAt && performance.now() - wr.gradedAt < 180000) continue;
    if (s.x > -pad && s.x < vw() + pad && s.y > -pad && s.y < vh() + pad) vis.push(wr);
  }
  const score = window.__wp9aScore;
  vis.sort((a, b) => score(b) - score(a));
  return vis.slice(0, 64);
};
window.__wp9aPoses = function (z, GRID) {
  const mx = Math.min(WR.w*0.44, vw()/(2*z)*0.7);
  const my = Math.min(WR.h*0.44, vh()/(2*z)*0.7);
  const x0 = mx, x1 = WR.w - mx, y0 = my, y1 = WR.h - my;
  const out = [];
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++)
    out.push([x0 + (x1-x0)*(GRID===1?0.5:i/(GRID-1)), y0 + (y1-y0)*(GRID===1?0.5:j/(GRID-1))]);
  return out;
};`;

async function sweep(tide, z) {
  await setTide(tide.stop);
  const r = await page.evaluate(
    `(() => {
      const z = ${z}, GRID = ${GRID}, PIN = ${PIN === null ? 'null' : PIN};
      const seen = new Set(); const curve = [];
      cam.z = z; cam.rot = 0;
      const poses = window.__wp9aPoses(z, GRID);
      for (let p = 0; p < poses.length; p++) {
        cam.x = poses[p][0]; cam.y = poses[p][1]; camClamp();
        // NOTE: adjacent grid poses are only ~25px apart in x and ~54px in y —
        // under the odometer's 200px teleport guard — so a bare sweep DOES turn
        // the wheel and measures a union over (pose, phase) pairs. --pin-phase
        // holds it still, which is how the phase-0 identity is checked here.
        if (PIN !== null && window.__wp9aPaged) pagePhase = PIN;
        for (const wr of window.__wp9aSelect(z)) seen.add(wr.e[0]);
        if ((p+1) % 50 === 0) curve.push([p+1, seen.size]);
      }
      curve.push([poses.length, seen.size]);
      return { count: seen.size, poses: poses.length, curve, words: [...seen] };
    })()`,
  );
  return r;
}

/* mirror-vs-real agreement: N random poses, real refreshActive each time */
async function agree(tide, z, n) {
  await setTide(tide.stop);
  return page.evaluate(
    `(() => {
      const z = ${z}, N = ${n}, PIN = ${PIN === null ? 'null' : PIN};
      cam.z = z; cam.rot = 0;
      const poses = window.__wp9aPoses(z, Math.ceil(Math.sqrt(N)));
      let checked = 0, mismatched = 0, sample = null;
      for (const [px, py] of poses) {
        cam.x = px; cam.y = py; camClamp();
        if (PIN !== null && window.__wp9aPaged) pagePhase = PIN;
        const mirror = new Set(window.__wp9aSelect(z).map((wr) => wr.e[0]));
        // let the source's own function do the real thing at the same pose
        for (const wr of [...ACTIVE]) { if (wr.node) { wr.node.gone = true; } }
        ACTIVE.clear();
        refreshActive();
        const real = new Set([...ACTIVE].map((wr) => wr.e[0]));
        checked++;
        if (real.size !== mirror.size || [...real].some((w) => !mirror.has(w))) {
          mismatched++;
          if (!sample) sample = {
            pose: [px, py], realSize: real.size, mirrorSize: mirror.size,
            onlyReal: [...real].filter((w) => !mirror.has(w)).slice(0, 8),
            onlyMirror: [...mirror].filter((w) => !real.has(w)).slice(0, 8),
          };
        }
      }
      return { checked, mismatched, sample };
    })()`,
  );
}

/* ------------------------------------------------------------------ drift */
async function driftSession(tide, z, seconds) {
  await setTide(tide.stop);
  await page.evaluate(`(() => { cam.z = ${z}; cam.rot = 0; camClamp(); })()`);
  // a page-side collector: union every .word label the field mounts, sampled
  // by MutationObserver so nothing that flashes between polls is missed
  await page.evaluate(`(() => {
    window.__wp9a = new Set();
    const grab = () => {
      for (const el of document.querySelectorAll('#sky .word .base'))
        window.__wp9a.add(el.textContent);
    };
    if (window.__wp9aObs) window.__wp9aObs.disconnect();
    window.__wp9aObs = new MutationObserver(grab);
    window.__wp9aObs.observe(document.getElementById('sky'), { childList: true, subtree: true });
    window.__wp9aGrab = grab;
    grab();
  })()`);

  const curve = [];
  const t0 = Date.now();
  const cx = VW / 2;
  const cy = VH / 2;
  let step = 0;
  while ((Date.now() - t0) / 1000 < seconds) {
    // a real finger pan: down, a few moves, up — the drag stirs the fluid and
    // carries the camera exactly as a human swim does
    const ang = step * 2.39996;
    const dx = Math.cos(ang) * 150;
    const dy = Math.sin(ang) * 240;
    await page.touchscreen.tap(-1, -1).catch(() => {});
    const cdp = await page.context().newCDPSession(page);
    const pts = [];
    const N = 6;
    for (let k = 0; k <= N; k++) pts.push([cx + (dx * k) / N, cy + (dy * k) / N]);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: pts[0][0], y: pts[0][1] }],
    });
    for (let k = 1; k <= N; k++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: pts[k][0], y: pts[k][1] }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(160);
    await page.evaluate(`window.__wp9aGrab()`);
    step++;
    if (step % 10 === 0) {
      const n = await page.evaluate(`window.__wp9a.size`);
      curve.push([Math.round((Date.now() - t0) / 1000), step, n]);
    }
  }
  await page.evaluate(`window.__wp9aGrab()`);
  const words = await page.evaluate(`[...window.__wp9a]`);
  await page.evaluate(`window.__wp9aObs.disconnect()`);
  return { count: words.length, pans: step, seconds, curve, words };
}

/* ------------------------------------------------------------------ prove
 * The targeted post-fix probe. reachable-set.mjs names, per tide, the words the
 * pre-fix chooser could NEVER mount at default zoom. This walks a sample of
 * them in the real page: park the camera near the word, then swim — small
 * camera increments pushed through the source's OWN camClamp (so the source's
 * own pageOdometer turns the wheel exactly as a finger would) with the source's
 * OWN refreshActive running each tick — and wait for the word to appear as a
 * real DOM `.word` node. Reports hit rate and the pan distance it cost. */
async function prove(tide, words, budgetPx) {
  await setTide(tide.stop);
  return page.evaluate(
    `(async () => {
      const want = ${JSON.stringify(words)};
      const budget = ${budgetPx};
      const tick = () => new Promise((r) => setTimeout(r, 16));
      const out = [];
      for (const w of want) {
        const wr = WORDIX[w];
        if (!wr) { out.push({ w, ok: false, why: 'not in WORDIX' }); continue; }
        cam.z = 1; cam.rot = 0; cam.x = wr.wx; cam.y = wr.wy; camClamp();
        let travelled = 0, hit = false, ang = 0;
        while (travelled < budget && !hit) {
          // one round ~= what the camera covers between two refreshActive ticks
          // during a real swim. Every increment is 24px, safely under the
          // odometer's 200px teleport guard, so the source's own wheel turns.
          ang += 0.37;
          for (let k = 0; k < 20; k++) {
            const bx = cam.x, by = cam.y;
            cam.x += Math.cos(ang) * 24; cam.y += Math.sin(ang) * 24;
            camClamp();
            travelled += Math.hypot(cam.x - bx, cam.y - by);
            // stay in the word's own corner of the sky — a learner looking here,
            // not touring the world to find one word. 240 keeps the word inside
            // the visible window (half-window is 335 x 562 at z=1) the whole
            // time, so this measures the wheel and not the camera finding it.
            if (Math.hypot(cam.x - wr.wx, cam.y - wr.wy) > 240) ang += Math.PI;
          }
          refreshActive();
          if (ACTIVE.has(wr) && wr.node && !wr.node.gone &&
              wr.node.el && wr.node.el.isConnected &&
              wr.node.el.querySelector('.base').textContent === w) hit = true;
          // let the source's own 600ms removal timers drain instead of piling up
          await tick();
        }
        out.push({ w, ok: hit, travelled: Math.round(travelled) });
      }
      return out;
    })()`,
  );
}

/* ------------------------------------------------------------------- run */
await page.evaluate(MIRROR);

if (PROBE === 'prove') {
  const listPath = arg('unreachable', 'reachable-set.json');
  const pre = JSON.parse(readFileSync(resolve(HERE, listPath), 'utf8'));
  const N = Number(arg('sample', 40));
  // one full turn of the wheel is PAGE_CYCLE (40,000) world px; the default
  // budget is a little over that, so a word that never appears inside a
  // complete rotation is a real miss and not a starved probe
  const BUDGET = Number(arg('budget', 50000));
  results.prove = {};
  for (const tide of TIDES) {
    const all = pre.perLevel[tide.label].unreachableAtZ1 || [];
    // evenly spaced sample across the list, so this is not a lucky prefix
    const stride = Math.max(1, Math.floor(all.length / N));
    const sample = [];
    for (let i = 0; i < all.length && sample.length < N; i += stride) sample.push(all[i]);
    const r = await prove(tide, sample, BUDGET);
    const ok = r.filter((x) => x.ok);
    const dist = ok.map((x) => x.travelled).sort((a, b) => a - b);
    results.prove[tide.label] = {
      preFixUnreachable: all.length,
      sampled: sample.length,
      nowSurfaced: ok.length,
      medianPanPx: dist.length ? dist[dist.length >> 1] : null,
      maxPanPx: dist.length ? dist[dist.length - 1] : null,
      misses: r.filter((x) => !x.ok).map((x) => x.w),
    };
    console.log(
      `${tide.label}: ${ok.length}/${sample.length} of a sample of the ${all.length} ` +
        `pre-fix-unreachable words now surface as real DOM ` +
        `(median pan ${dist.length ? dist[dist.length >> 1] : '—'} world px` +
        `${r.filter((x) => !x.ok).length ? `, misses: ${r.filter((x) => !x.ok).map((x) => x.w).join(' ')}` : ''})`,
    );
  }
  results.pageErrors = pageErrors;
  console.log(`\npage errors: ${pageErrors.length}`);
  if (pageErrors.length) console.log(pageErrors.slice(0, 10).join('\n'));
  await browser.close();
  server.close();
  if (OUT) {
    writeFileSync(resolve(HERE, OUT), `${JSON.stringify(results, null, 2)}\n`);
    console.log(`wrote ${OUT}`);
  }
  process.exit(0);
}

if (PROBE === 'sweep') {
  // prove the mirror IS refreshActive's chooser before trusting any sweep
  results.agreement = {};
  for (const tide of TIDES) {
    for (const z of ZOOMS) {
      const a = await agree(tide, z, Number(arg('agree', 100)));
      results.agreement[`${tide.label}@z${z}`] = a;
      console.log(
        `agreement ${tide.label} z=${z}: ${a.checked - a.mismatched}/${a.checked} poses identical` +
          (a.sample ? ` — sample ${JSON.stringify(a.sample)}` : ''),
      );
    }
  }
  console.log('');
}

for (const tide of TIDES) {
  results.tides[tide.label] = { tier: tierByLevel[tide.lv], zooms: {} };
  for (const z of ZOOMS) {
    const r = PROBE === 'drift' ? await driftSession(tide, z, SECONDS) : await sweep(tide, z);
    // only own-level words count toward the tier's coverage
    const ownLevel = await page.evaluate(
      `(() => {
        const set = new Set(${JSON.stringify(r.words)});
        const lv = {};
        for (const e of WALL) lv[e[0]] = e[5] || 3;
        let own = 0;
        for (const w of set) if (lv[w] === ${tide.lv}) own++;
        return own;
      })()`,
    );
    results.tides[tide.label].zooms[z] = {
      distinctSurfaced: r.count,
      ownLevelSurfaced: ownLevel,
      poses: r.poses ?? null,
      pans: r.pans ?? null,
      seconds: r.seconds ?? null,
      curve: r.curve,
    };
    console.log(
      `${tide.label} z=${z} — own-level surfaced ${ownLevel}/${tierByLevel[tide.lv]} ` +
        `(${((ownLevel / tierByLevel[tide.lv]) * 100).toFixed(1)}%) ` +
        `· distinct total ${r.count} · ${r.poses ? `${r.poses} poses` : `${r.pans} pans / ${r.seconds}s`}`,
    );
  }
}

results.pageErrors = pageErrors;
console.log(`\npage errors: ${pageErrors.length}`);
if (pageErrors.length) console.log(pageErrors.slice(0, 10).join('\n'));

await browser.close();
server.close();

if (OUT) {
  // curves and counts only — the full word lists are large and derivable
  writeFileSync(resolve(HERE, OUT), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`wrote ${OUT}`);
}
