/**
 * v11 coherence verification — the composed-surface instrument.
 *
 * Recovered from the v11 coherence campaign (1f582fc) and re-aimed at the
 * CURRENT drift build. It drives the real surface with real CDP touch at the
 * 390x844 profile and asserts the eight ported mechanisms as 17 checks:
 *
 *   1  pinch mode latched at gesture start (surfacing never bleeds into zoom)
 *   2  return-to-rest: double-tap open water eases pan + zoom + twist home
 *   3  rotation bounded to +-pi
 *   4  spatial arbitration at rest (4-rest-overlap) and after zoom (4-zoom-overlap)
 *   5  hint pill >= 4.5:1 in every theme (5 checks, one per pigment world)
 *   6  chrome keep-out: no legible word under brand/depth/theme/tray/hint/lvl
 *   7  darkened foreground pigments reach parity (2 checks + the night floor)
 *   8  lock-time unfold clear, and lock release leaves nothing unfolded
 *   8b lock constellation stays whole at min zoom (needed by 8-lock-persists)
 *
 * Zero console errors and zero page errors are a hard gate on top of 17/17.
 *
 * Usage:
 *   node prototypes/drift/tools/verify-v11.mjs
 *     [--src PATH]   verify a different drift html (used to capture the
 *                    pre-fix baseline from git without touching the tree)
 *     [--shots DIR]  write evidence screenshots
 *     [--out FILE]   write the results JSON here
 *     [--label NAME] tag the run in the JSON
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const SRC = resolve(arg('--src', DIR + '/drift-artifact.html'));
const SHOTS = arg('--shots', '');
const OUT = arg('--out', `${process.env.TMPDIR || '/tmp'}/verify-v11-results.json`);
const LABEL = arg('--label', 'run');
const PORT = Number(arg('--port', '8934'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const body = fs.readFileSync(SRC, 'utf8');
const pageHtml = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head>
<body>${body}</body></html>`;

const server = http
  .createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(pageHtml);
  })
  .listen(PORT);

const results = [];
const notes = {};
const R = (fix, pass, detail) => {
  results.push({ fix, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${fix}: ${detail}`);
};

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
// the operator's device profile: 390x844, touch, mobile
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: Number(arg('--dsf', '1')),
  hasTouch: true,
  isMobile: true,
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
p.on('console', (m) => {
  if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console.error: ' + m.text().slice(0, 200));
});
const cdp = await ctx.newCDPSession(p);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
const wait = (ms) => p.waitForTimeout(ms);
const clearTouch = async () => {
  try {
    await touch('touchEnd', []);
  } catch {
    /* no live touch to end */
  }
};
const shot = async (name) => {
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png` });
};

async function tapAt(x, y) {
  await clearTouch();
  await touch('touchStart', [{ x, y }]);
  await wait(30);
  await touch('touchEnd', []);
  await wait(260);
}
// a genuine quick double-tap: two taps ~120ms apart, inside the 420ms window
async function doubleTapAt(x, y) {
  await clearTouch();
  await touch('touchStart', [{ x, y }]);
  await wait(30);
  await touch('touchEnd', []);
  await wait(90);
  await touch('touchStart', [{ x, y }]);
  await wait(30);
  await touch('touchEnd', []);
  await wait(260);
}
async function longPress(x, y, ms = 560) {
  await clearTouch();
  await touch('touchStart', [{ x, y }]);
  await wait(ms);
  await touch('touchEnd', []);
  await wait(340);
}
async function swipe(x0, y0, x1, y1, steps = 14, hold = 12) {
  await clearTouch();
  await touch('touchStart', [{ x: x0, y: y0 }]);
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }]);
    await wait(hold);
  }
  await touch('touchEnd', []);
  await wait(240);
}
// vertical pinch — keeps both fingers clear of the left #lvl slider band and
// the top-right #theme pill, either of which would swallow an edge-started touch
async function pinch(cx, cy, from, to, steps = 16) {
  await clearTouch();
  let d = from;
  await touch('touchStart', [
    { x: cx, y: cy - d },
    { x: cx, y: cy + d },
  ]);
  for (let i = 1; i <= steps; i++) {
    d = from + ((to - from) * i) / steps;
    await touch('touchMove', [
      { x: cx, y: cy - d },
      { x: cx, y: cy + d },
    ]);
    await wait(16);
  }
  await touch('touchEnd', []);
  await wait(300);
}
// r=130 keeps the sweep clear of #lvl (0..44px) at 390 wide
async function twist(cx, cy, deg, steps = 14) {
  await clearTouch();
  const r = 130;
  let a = 0;
  await touch('touchStart', [
    { x: cx - r, y: cy },
    { x: cx + r, y: cy },
  ]);
  for (let i = 1; i <= steps; i++) {
    a = ((deg * Math.PI) / 180) * i / steps;
    await touch('touchMove', [
      { x: cx - r * Math.cos(a), y: cy - r * Math.sin(a) },
      { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) },
    ]);
    await wait(14);
  }
  await touch('touchEnd', []);
  await wait(220);
}

const st = () =>
  p.evaluate(() => ({
    z: +cam.z.toFixed(3),
    rot: +cam.rot.toFixed(3),
    stack: stack.length,
    lockOn,
    focus: typeof FOCUS !== 'undefined' ? FOCUS.length : null,
    focusVis: typeof FOCUS !== 'undefined' ? FOCUS.filter((w) => w.vis === frameCount).length : null,
    unfolded: document.querySelectorAll('.word.unfolded').length,
    words: document.querySelectorAll('.word').length,
  }));
// the build may predate recenterCam (baseline runs); never throw on it
const goHome = async () => {
  await p.evaluate(() => {
    if (typeof recenterCam === 'function') recenterCam();
    else {
      cam.z = 1;
      cam.rot = 0;
      cam.vx = 0;
      cam.vy = 0;
    }
  });
  await wait(1100);
};
// nearest touchable DOM word to a screen point (returns its live centre + text).
// `thr` is the opacity floor; `not` excludes a word by text so a second probe
// cannot land back on the first one.
const nearestWord = (x, y, thr = 0.35, not = null) =>
  p.evaluate(
    ([x, y, thr, not]) => {
      let best = null;
      let bd = 1e9;
      for (const el of document.querySelectorAll('.word')) {
        const cs = getComputedStyle(el);
        if (parseFloat(cs.opacity) < thr) continue;
        if (cs.pointerEvents === 'none') continue;
        if (not != null && el.textContent === not) continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx < 60 || cx > innerWidth - 20 || cy < 70 || cy > innerHeight - 120) continue;
        const d = Math.hypot(cx - x, cy - y);
        if (d < bd) {
          bd = d;
          best = { cx, cy, t: el.textContent };
        }
      }
      return best;
    },
    [x, y, thr, not],
  );
// the live centre of the held node — taps chain reliably off this, never off a
// stale rect (the bloom moves the planet the moment the first tap lands)
const focusPoint = () => p.evaluate(() => (focusN && !focusN.gone ? { cx: focusN.x + focusN.dragX, cy: focusN.y + focusN.dragY } : null));
// a point with no word AND no canvas-drawn hub under it (hubs are not DOM)
const emptyPoint = () =>
  p.evaluate(() => {
    const cand = [
      [30, 120],
      [360, 120],
      [360, 700],
      [30, 700],
      [195, 700],
      [195, 150],
      [360, 430],
      [110, 120],
    ];
    const hubFree = (x, y) => typeof hubAt !== 'function' || hubAt(x, y) == null;
    for (const [x, y] of cand) {
      const e = document.elementFromPoint(x, y);
      if (
        (!e || !e.closest('.word,.glyph,.part,#card,#theme,#lvl,#hint,#brand,#depth,#tray,#radoc')) &&
        hubFree(x, y)
      )
        return [x, y];
    }
    return [195, 700];
  });
// max legible overlap fraction among words with opacity>=thr and font>=minF
const overlapStats = (thr = 0.42, minF = 15) =>
  p.evaluate(
    ([thr, minF]) => {
      const R = [];
      for (const el of document.querySelectorAll('.word')) {
        const cs = getComputedStyle(el);
        if (parseFloat(cs.opacity) < thr) continue;
        if (parseFloat(cs.fontSize) < minF) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2) continue;
        R.push(r);
      }
      let worst = 0;
      let pairs = 0;
      for (let i = 0; i < R.length; i++)
        for (let j = i + 1; j < R.length; j++) {
          const a = R[i];
          const b = R[j];
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox <= 0 || oy <= 0) continue;
          const f = (ox * oy) / Math.min(a.width * a.height, b.width * b.height);
          if (f > 0.25) pairs++;
          worst = Math.max(worst, f);
        }
      return { count: R.length, worst: +worst.toFixed(2), badPairs: pairs };
    },
    [thr, minF],
  );
// legible words overlapping any fixed chrome region
const chromeOverlap = (thr = 0.42) =>
  p.evaluate((thr) => {
    const ids = ['brand', 'depth', 'theme', 'tray', 'hint', 'lvl'];
    const cr = [];
    for (const id of ids) {
      const e = document.getElementById(id);
      if (!e) continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (parseFloat(cs.opacity || '1') <= 0.05) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      cr.push({ id, r });
    }
    const hits = [];
    for (const el of document.querySelectorAll('.word')) {
      if (parseFloat(getComputedStyle(el).opacity) < thr) continue;
      const r = el.getBoundingClientRect();
      for (const c of cr)
        if (r.right > c.r.left && r.left < c.r.right && r.bottom > c.r.top && r.top < c.r.bottom) {
          hits.push({ w: el.textContent.slice(0, 6), chrome: c.id });
          break;
        }
    }
    return { regions: cr.map((c) => c.id), hits };
  }, thr);

// per-theme composited contrast. Text alpha and element opacity are both
// carried through the composite — reading the raw colour would flatter a
// --faint hint by pretending it is painted at full strength.
const themeContrast = () =>
  p.evaluate(() => {
    const lin = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const parse = (s) => {
      const m = String(s).match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 1];
      const q = m[1].split(',').map((x) => parseFloat(x));
      return [q[0], q[1], q[2], q[3] == null ? 1 : q[3]];
    };
    const over = (fg, a, bg) => [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
    const ratio = (a, b) => {
      const la = lum(a[0], a[1], a[2]);
      const lb = lum(b[0], b[1], b[2]);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const groundHex = (getComputedStyle(document.documentElement).getPropertyValue('--ground').trim() || '#FBFAF5').replace('#', '');
    const gr = [parseInt(groundHex.slice(0, 2), 16), parseInt(groundHex.slice(2, 4), 16), parseInt(groundHex.slice(4, 6), 16)];

    // foreground words: the loud, large ones — what the eye actually reads
    const vals = [];
    for (const el of document.querySelectorAll('.word')) {
      const cs = getComputedStyle(el);
      const op = parseFloat(cs.opacity);
      const fs = parseFloat(cs.fontSize);
      if (op < 0.5 || fs < 18) continue;
      const c = parse(cs.color);
      vals.push(ratio(over([c[0], c[1], c[2]], (c[3] == null ? 1 : c[3]) * op, gr), gr));
    }
    vals.sort((a, b) => a - b);
    const med = vals.length ? vals[Math.floor(vals.length / 2)] : null;
    const min = vals.length ? vals[0] : null;

    // the hint pill: its own text over its own paper over the ground
    const hint = document.getElementById('hint');
    let hintCr = null;
    let hintBg = null;
    if (hint) {
      const prevText = hint.textContent;
      const prevOp = hint.style.opacity;
      hint.textContent = 'テスト hint';
      hint.style.opacity = '1';
      const hs = getComputedStyle(hint);
      hintBg = hs.backgroundColor;
      const bgc = parse(hs.backgroundColor);
      const plate = over([bgc[0], bgc[1], bgc[2]], bgc[3], gr);
      const tc = parse(hs.color);
      hintCr = ratio(over([tc[0], tc[1], tc[2]], tc[3] == null ? 1 : tc[3], plate), plate);
      hint.textContent = prevText;
      hint.style.opacity = prevOp;
    }
    const name = document.getElementById('theme')?.textContent || '?';
    return {
      name,
      med: med && +med.toFixed(2),
      min: min && +min.toFixed(2),
      n: vals.length,
      hintCr: hintCr && +hintCr.toFixed(2),
      hintBg,
    };
  });

await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await wait(3200);
const s0 = await st();
console.log('rest:', JSON.stringify(s0));
notes.rest = s0;
await shot('01-rest');

// ---- Fix 4: spatial arbitration at the resting surface ----
let ov = await overlapStats();
notes.restOverlap = ov;
R('4-rest-overlap', ov.worst <= 0.3 && ov.badPairs === 0, `worst=${ov.worst}, badPairs=${ov.badPairs}, legibleWords=${ov.count}`);

// ---- Fix 6: chrome keep-out ----
const ch = await chromeOverlap();
notes.chrome = ch;
R('6-chrome-keepout', ch.hits.length === 0, `${ch.hits.length} legible words over chrome [${ch.regions.join(',')}]${ch.hits.length ? ' :: ' + JSON.stringify(ch.hits.slice(0, 6)) : ''}`);

// ---- Fix 1: a pinch that surfaces must not bleed into camera zoom-out ----
// dive into a word (three taps, chained off the live focus centre), then one
// pinch-IN: the stack must surface and the zoom must stay where it was.
let w = await nearestWord(195, 420);
if (w) {
  await tapAt(w.cx, w.cy);
  for (let i = 0; i < 2; i++) {
    const fp = (await focusPoint()) || w;
    await tapAt(fp.cx, fp.cy);
  }
}
let sd = await st();
if (sd.stack >= 1) {
  const zBefore = sd.z;
  await pinch(195, 420, 150, 45); // pinch IN, inside the dive
  const sa = await st();
  notes.pinchSurface = { before: sd, after: sa };
  R('1-pinch-surface-nobleed', sa.stack < sd.stack && sa.z > 0.7, `stack ${sd.stack}->${sa.stack}, z ${zBefore}->${sa.z} (must stay >0.7, not floor at 0.34)`);
  await shot('02-pinch-surface');
  for (let i = 0; i < 4 && (await st()).stack > 0; i++) {
    const [ex0, ey0] = await emptyPoint();
    await tapAt(ex0, ey0);
  }
} else {
  R('1-pinch-surface-nobleed', false, `could not enter a dive (stack=${sd.stack}, word=${w && w.t})`);
}
await goHome();

// ---- Fix 3: rotation clamp ----
await twist(195, 420, 160);
await twist(195, 420, 160);
await twist(195, 420, 160);
const sr = await st();
notes.rot = sr;
R('3-rot-clamp', Math.abs(sr.rot) <= Math.PI + 0.01, `cam.rot=${sr.rot} after 3x160deg twist (must be within +-${Math.PI.toFixed(2)})`);

// ---- Fix 2: return-to-rest via double-tap on open water ----
await goHome();
await pinch(195, 420, 45, 200); // zoom in
await twist(195, 420, 150); // rotate the vault
await swipe(195, 300, 195, 620); // pan off-centre
await wait(1300); // let pan momentum settle so no hub drifts under the tap
const messy = await st();
notes.messy = messy;
await shot('03-messy');
// spend one tap clearing anything held, so the double-tap lands on open water
if (messy.lockOn || messy.focus) {
  const [cx0, cy0] = await emptyPoint();
  await tapAt(cx0, cy0);
  await wait(500);
}
let [ex, ey] = await emptyPoint();
await doubleTapAt(ex, ey);
await wait(1900);
const home = await st();
notes.home = home;
R('2-return-to-rest', Math.abs(home.z - 1) < 0.06 && Math.abs(home.rot) < 0.06, `messy(z=${messy.z},rot=${messy.rot}) -> home(z=${home.z},rot=${home.rot}) via double-tap at ${ex},${ey}`);
await shot('04-home');

// ---- Fix 4b: no legible overprint after a hard zoom ----
await pinch(195, 420, 45, 200);
await wait(900);
ov = await overlapStats();
notes.zoomOverlap = ov;
R('4-zoom-overlap', ov.worst <= 0.4, `after zoom (z=${(await st()).z}) worst=${ov.worst}, badPairs=${ov.badPairs}, legibleWords=${ov.count}`);
await shot('05-zoomed');
await goHome();

// ---- Fix 8 + 8b: unfold clear on lock, constellation whole at min zoom ----
const A = await nearestWord(140, 380);
await tapAt(A ? A.cx : 195, A ? A.cy : 420); // one tap on A: furigana unfolds
// let A's bloom ring finish gliding before reading B's live centre — a
// satellite read mid-glide is 40px stale by the time the press lands
await wait(1400);
const u1 = (await st()).unfolded;
// B is a DIFFERENT word: locking B must fold A's reveal, not its own
const B = A ? await nearestWord(280, 540, 0.2, A.t) : null;
if (A && B) {
  await longPress(B.cx, B.cy, 560); // lock B
  const sl = await st();
  notes.lock = { A: A.t, B: B.t, unfoldedBefore: u1, after: sl };
  R('8-unfold-clear-on-lock', u1 >= 1 && sl.unfolded === 0 && sl.lockOn === true, `tapped A=${A.t.slice(0, 6)} (unfolded=${u1}), locked B=${B.t.slice(0, 6)} -> unfolded=${sl.unfolded}, lockOn=${sl.lockOn}, members=${sl.focus}`);
  await shot('06-lock');
  await pinch(195, 420, 200, 45);
  await pinch(195, 420, 200, 45);
  await wait(600);
  const s8 = await st();
  notes.lockMinZoom = s8;
  R('8-lock-persists-minzoom', s8.z <= 0.5 && s8.lockOn === true && s8.focusVis >= Math.min(10, s8.focus), `z=${s8.z} (want <=0.5), lockOn=${s8.lockOn}, focus=${s8.focus}, visibleMembers=${s8.focusVis}`);
  await shot('07-lock-minzoom');
  const [rx, ry] = await emptyPoint();
  await tapAt(rx, ry);
  await wait(400);
  const s9b = await st();
  notes.lockRelease = s9b;
  R('8-lock-release-clean', s9b.lockOn === false && s9b.unfolded === 0, `after water-tap release lockOn=${s9b.lockOn}, unfolded=${s9b.unfolded}`);
} else {
  R('8-unfold-clear-on-lock', false, `could not find two distinct touchable words (A=${A && A.t}, B=${B && B.t})`);
  R('8-lock-persists-minzoom', false, 'skipped: no lock established');
  R('8-lock-release-clean', false, 'skipped: no lock established');
}
await goHome();

// ---- Fix 5 + 7: legibility across all five pigment worlds ----
const themeBox = await p.evaluate(() => {
  const r = document.getElementById('theme').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const themes = {};
for (let i = 0; i < 5; i++) {
  await wait(500);
  const tc = await themeContrast();
  themes[tc.name] = tc;
  R(`5-hint[${tc.name}]`, tc.hintCr != null && tc.hintCr >= 4.5, `hint text/plate contrast=${tc.hintCr} on ${tc.hintBg}`);
  await shot(`08-theme-${i}-${tc.name}`);
  await tapAt(themeBox.x, themeBox.y); // advance to the next pigment world
}
notes.themes = themes;
// Fix 7: 岩絵具 and 緑青 must stop being legibility outliers — parity with the
// untouched light worlds (北斎 / 墨), not a match to the dark 夜.
const lightBase = Math.min(themes['北斎']?.med ?? 99, themes['墨']?.med ?? 99);
for (const nm of ['岩絵具', '緑青']) {
  const m = themes[nm]?.med;
  const ok = m != null && m >= 2.4 && m >= 0.9 * lightBase;
  R(`7-parity[${nm}]`, ok, `fg med=${m} (n=${themes[nm]?.n}) vs light baseline ${lightBase.toFixed(2)} — want >=2.4 and >=90% of baseline`);
}
R('7-night-legible', (themes['夜']?.med ?? 0) >= 3.0, `夜 fg med=${themes['夜']?.med} (n=${themes['夜']?.n})`);

console.log('\nERRORS:', errs.length ? errs : 'none');
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
fs.writeFileSync(
  OUT,
  JSON.stringify({ label: LABEL, src: SRC, when: new Date().toISOString(), passed, total: results.length, results, errs, notes }, null, 2),
);
console.log(`results -> ${OUT}`);
await b.close();
server.close();
process.exit(errs.length || passed < results.length ? 1 : 0);
