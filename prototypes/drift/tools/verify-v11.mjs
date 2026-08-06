// v11 coherence verification — drives real CDP touch on the composed surface
// and asserts each of the 9 ranked fixes (design-doc §8.15). Prints PASS/FAIL
// per fix. Run: node prototypes/drift/tools/verify-v11.mjs
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const body = fs.readFileSync(DIR + '/drift-artifact.html', 'utf8');
const page = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head>
<body>${body}</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page);
}).listen(8931);

const results = [];
const R = (fix, pass, detail) => { results.push({ fix, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${fix}: ${detail}`); };

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 430, height: 900 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console.error: ' + m.text().slice(0, 200)); });
const cdp = await ctx.newCDPSession(p);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
const wait = ms => p.waitForTimeout(ms);
const clearTouch = async () => { try { await touch('touchEnd', []); } catch {} };
async function tapAt(x, y) { await clearTouch(); await touch('touchStart', [{ x, y }]); await wait(30); await touch('touchEnd', []); await wait(240); }
// a genuine quick double-tap: two taps ~140ms apart, inside the artifact's window
async function doubleTapAt(x, y) {
  await clearTouch();
  await touch('touchStart', [{ x, y }]); await wait(30); await touch('touchEnd', []); await wait(90);
  await touch('touchStart', [{ x, y }]); await wait(30); await touch('touchEnd', []); await wait(260);
}
async function longPress(x, y, ms = 520) { await clearTouch(); await touch('touchStart', [{ x, y }]); await wait(ms); await touch('touchEnd', []); await wait(320); }
async function swipe(x0, y0, x1, y1, steps = 14, hold = 12) {
  await clearTouch();
  await touch('touchStart', [{ x: x0, y: y0 }]);
  for (let i = 1; i <= steps; i++) { await touch('touchMove', [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }]); await wait(hold); }
  await touch('touchEnd', []); await wait(240);
}
// vertical pinch — keeps both fingers clear of the left #lvl slider and the
// top-right #theme pill, which would otherwise swallow an edge-started touch
async function pinch(cx, cy, from, to, steps = 16) {
  await clearTouch(); let d = from;
  await touch('touchStart', [{ x: cx, y: cy - d }, { x: cx, y: cy + d }]);
  for (let i = 1; i <= steps; i++) { d = from + (to - from) * i / steps; await touch('touchMove', [{ x: cx, y: cy - d }, { x: cx, y: cy + d }]); await wait(16); }
  await touch('touchEnd', []); await wait(280);
}
async function twist(cx, cy, deg, steps = 14) {
  await clearTouch(); const r = 150; let a = 0;
  await touch('touchStart', [{ x: cx - r, y: cy }, { x: cx + r, y: cy }]);
  for (let i = 1; i <= steps; i++) {
    a = (deg * Math.PI / 180) * i / steps;
    await touch('touchMove', [{ x: cx - r * Math.cos(a), y: cy - r * Math.sin(a) }, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }]);
    await wait(14);
  }
  await touch('touchEnd', []); await wait(200);
}
const st = () => p.evaluate(() => ({
  z: +cam.z.toFixed(3), rot: +cam.rot.toFixed(3), stack: stack.length, lockOn,
  focus: (typeof FOCUS !== 'undefined' ? FOCUS.length : null),
  focusVis: (typeof FOCUS !== 'undefined' ? FOCUS.filter(w => w.vis === frameCount).length : null),
  unfolded: document.querySelectorAll('.word.unfolded').length,
}));
// nearest DOM word to a screen point (returns center px + text)
const nearestWord = (x, y) => p.evaluate(([x, y]) => {
  let best = null, bd = 1e9;
  for (const el of document.querySelectorAll('.word')) {
    if (parseFloat(getComputedStyle(el).opacity) < 0.3) continue;
    const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const d = Math.hypot(cx - x, cy - y); if (d < bd) { bd = d; best = { cx, cy, t: el.textContent }; }
  }
  return best;
}, [x, y]);
// a point with no word AND no canvas-drawn hub under it (hubs aren't DOM)
const emptyPoint = () => p.evaluate(() => {
  const cand = [[30, 130], [400, 800], [30, 800], [400, 130], [215, 830], [30, 450], [400, 450]];
  const hubFree = (x, y) => (typeof hubAt !== 'function') || hubAt(x, y) == null;
  for (const [x, y] of cand) {
    const e = document.elementFromPoint(x, y);
    if ((!e || !e.closest('.word,.glyph,.part,#card,#theme,#lvl,#hint,#brand')) && hubFree(x, y)) return [x, y];
  }
  return [215, 830];
});
// max legible overlap fraction among words with opacity>=thr and font>=minF
const overlapStats = (thr = 0.42, minF = 15) => p.evaluate(([thr, minF]) => {
  const R = [];
  for (const el of document.querySelectorAll('.word')) {
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) < thr) continue;
    if (parseFloat(cs.fontSize) < minF) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2) continue;
    R.push(r);
  }
  let worst = 0, pairs = 0;
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
    const a = R[i], b = R[j];
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox <= 0 || oy <= 0) continue;
    const f = (ox * oy) / Math.min(a.width * a.height, b.width * b.height);
    if (f > 0.25) pairs++;
    worst = Math.max(worst, f);
  }
  return { count: R.length, worst: +worst.toFixed(2), badPairs: pairs };
}, [thr, minF]);

await p.goto('http://127.0.0.1:8931/', { waitUntil: 'networkidle' });
await wait(3000);
const s0 = await st();
console.log('rest:', JSON.stringify(s0));

// ---- Fix 4: collision avoidance at rest ----
let ov = await overlapStats();
R('4-rest-overlap', ov.worst <= 0.30 && ov.badPairs === 0, `worst=${ov.worst}, badPairs=${ov.badPairs}, legibleWords=${ov.count}`);

// ---- Fix 6: chrome keep-out ----
const chromeHit = await p.evaluate(() => {
  const cr = ['brand', 'hint', 'theme'].map(id => document.getElementById(id)).filter(e => e && parseFloat(getComputedStyle(e).opacity) > 0.05).map(e => e.getBoundingClientRect());
  let hits = 0;
  for (const el of document.querySelectorAll('.word')) {
    if (parseFloat(getComputedStyle(el).opacity) < 0.42) continue;
    const r = el.getBoundingClientRect();
    for (const c of cr) { if (r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom) { hits++; break; } }
  }
  return hits;
});
R('6-chrome-keepout', chromeHit === 0, `${chromeHit} legible words overlap chrome`);

// ---- Fix 1: pinch-surface must not bleed into zoom-out ----
// dive into a word (3 taps), then one pinch-in; stack should surface to 0, z stay ~1
let w = await nearestWord(215, 450);
if (w) { await tapAt(w.cx, w.cy); await tapAt(w.cx, w.cy); await tapAt(w.cx, w.cy); }
let sd = await st();
if (sd.stack >= 1) {
  const zBefore = sd.z;
  await pinch(215, 450, 120, 40); // pinch IN
  const sa = await st();
  R('1-pinch-surface-nobleed', sa.stack < sd.stack && sa.z > 0.7, `stack ${sd.stack}->${sa.stack}, z ${zBefore}->${sa.z} (must stay >0.7, not 0.34)`);
  // clean up to surface
  for (let i = 0; i < 4 && (await st()).stack > 0; i++) { const [ex, ey] = await emptyPoint(); await tapAt(ex, ey); }
} else {
  R('1-pinch-surface-nobleed', false, `could not enter a dive (stack=${sd.stack})`);
}
// reset home
await p.evaluate(() => { if (typeof recenterCam === 'function') recenterCam(); });
await wait(900);

// ---- Fix 3: rotation clamp ----
await twist(215, 450, 160); await twist(215, 450, 160); await twist(215, 450, 160);
let sr = await st();
R('3-rot-clamp', Math.abs(sr.rot) <= Math.PI + 0.01, `cam.rot=${sr.rot} (must be within ±${(+Math.PI).toFixed(2)})`);

// ---- Fix 2: return-to-rest via double-tap empty water ----
await p.evaluate(() => recenterCam()); await wait(900); // clean slate
await pinch(215, 450, 40, 210); // zoom in
await twist(215, 450, 150);     // rotate the vault
await swipe(215, 300, 215, 640); // pan off-center
await wait(1200); // let pan momentum settle so a hub can't drift under the tap
let messy = await st();
let [ex, ey] = await emptyPoint(); // freshly empty at the settled position
await doubleTapAt(ex, ey); // quick double-tap empty water → home
await wait(1700);
let home = await st();
R('2-return-to-rest', Math.abs(home.z - 1) < 0.06 && Math.abs(home.rot) < 0.06, `messy(z=${messy.z},rot=${messy.rot}) -> home(z=${home.z},rot=${home.rot})`);

// ---- Fix 4b: no legible overprint after zoom ----
await pinch(215, 450, 40, 210); await wait(400);
ov = await overlapStats();
R('4-zoom-overlap', ov.worst <= 0.40, `after zoom worst=${ov.worst}, badPairs=${ov.badPairs}`);
await p.evaluate(() => recenterCam()); await wait(1000);

// ---- Fix 9 + 8: unfold-clear on lock, constellation persists at min zoom ----
let A = await nearestWord(150, 400), B = await nearestWord(300, 520);
if (A && B) {
  await tapAt(A.cx, A.cy); // unfold A (furigana)
  let u1 = (await st()).unfolded;
  await longPress(B.cx, B.cy, 560); // lock B
  let sl = await st();
  R('9-unfold-clear-on-lock', sl.unfolded === 0 && sl.lockOn === true, `unfolded ${u1}->${sl.unfolded}, lockOn=${sl.lockOn}, members=${sl.focus}`);
  // Fix 8: zoom field to genuine min, constellation must stay rendered
  await pinch(215, 450, 200, 45); await pinch(215, 450, 200, 45); await wait(500);
  let s8 = await st();
  R('8-lock-persists-minzoom', s8.z <= 0.5 && s8.lockOn === true && s8.focusVis >= Math.min(10, s8.focus), `z=${s8.z} (want ≤0.5), lockOn=${s8.lockOn}, focus=${s8.focus}, visibleMembers=${s8.focusVis}`);
  // release lock via water tap, no stuck unfold
  [ex, ey] = await emptyPoint(); await tapAt(ex, ey); await wait(300);
  let s9b = await st();
  R('9-lock-release-clean', s9b.lockOn === false && s9b.unfolded === 0, `after release lockOn=${s9b.lockOn}, unfolded=${s9b.unfolded}`);
} else {
  R('9-unfold-clear-on-lock', false, 'could not find two words');
}
await p.evaluate(() => recenterCam()); await wait(900);

// ---- Fix 5 + 7: theme legibility ----
// cycle to each theme via the theme button, sample
const themeContrast = () => p.evaluate(() => {
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 1]; const p = m[1].split(',').map(x => parseFloat(x)); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; };
  const gs = getComputedStyle(document.body);
  // ground: read the veil/root ground var via computed on body background isn't reliable; use --ground
  const groundHex = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim() || '#FBFAF5';
  const gh = groundHex.replace('#', ''); const gr = [parseInt(gh.slice(0, 2), 16), parseInt(gh.slice(2, 4), 16), parseInt(gh.slice(4, 6), 16)];
  const gl = lum(gr[0], gr[1], gr[2]);
  // foreground words: take those with largest font & opacity>=.5, composite color over ground with element opacity
  let vals = [];
  for (const el of document.querySelectorAll('.word')) {
    const cs = getComputedStyle(el); const op = parseFloat(cs.opacity); const fs = parseFloat(cs.fontSize);
    if (op < 0.5 || fs < 18) continue;
    const [r, g, bl] = parse(cs.color);
    const cr2 = r * op + gr[0] * (1 - op), cg = g * op + gr[1] * (1 - op), cb = bl * op + gr[2] * (1 - op);
    const fl = lum(cr2, cg, cb);
    vals.push((Math.max(fl, gl) + 0.05) / (Math.min(fl, gl) + 0.05));
  }
  vals.sort((a, b) => a - b);
  const med = vals.length ? vals[Math.floor(vals.length / 2)] : null;
  const min = vals.length ? vals[0] : null;
  // hint contrast (pill): text color over its own background
  const hint = document.getElementById('hint'); let hintCr = null; let hintBg = null;
  if (hint) {
    hint.textContent = 'テスト hint'; hint.style.opacity = '1';
    const hs = getComputedStyle(hint); const [hr, hg, hb] = parse(hs.color); hintBg = hs.backgroundColor;
    const [br, bg, bb, ba] = parse(hs.backgroundColor);
    // composite bg over ground, then text over bg
    const mr = br * ba + gr[0] * (1 - ba), mg = bg * ba + gr[1] * (1 - ba), mb = bb * ba + gr[2] * (1 - ba);
    const bl2 = lum(mr, mg, mb); const tl = lum(hr, hg, hb);
    hintCr = (Math.max(tl, bl2) + 0.05) / (Math.min(tl, bl2) + 0.05);
  }
  const name = document.getElementById('theme')?.textContent || '?';
  return { name, med: med && +med.toFixed(2), min: min && +min.toFixed(2), n: vals.length, hintCr: hintCr && +hintCr.toFixed(2), hintBg };
});
const themes = {};
for (let i = 0; i < 5; i++) {
  const tc = await themeContrast();
  themes[tc.name] = tc;
  // Fix 5: the hint pill must clear 4.5:1 in every theme
  R(`5-hint[${tc.name}]`, tc.hintCr == null || tc.hintCr >= 4.5, `hint contrast=${tc.hintCr} on ${tc.hintBg}`);
  await tapAt(405, 34); await wait(600); // advance theme
}
// Fix 7: 緑青 and 岩絵具 must no longer be legibility outliers — they should
// reach parity with the untouched light themes (北斎/墨), not match the dark 夜.
const lightBase = Math.min(themes['北斎']?.med ?? 99, themes['墨']?.med ?? 99);
for (const nm of ['岩絵具', '緑青']) {
  const m = themes[nm]?.med;
  const ok = m != null && m >= 2.4 && m >= 0.9 * lightBase;
  R(`7-parity[${nm}]`, ok, `fg med=${m} vs light-theme baseline ${lightBase.toFixed(2)} (want ≥2.4 and ≥90% of baseline)`);
}
R('7-night-legible', (themes['夜']?.med ?? 0) >= 3.0, `夜 fg med=${themes['夜']?.med}`);

console.log('\nERRORS:', errs.length ? errs : 'none');
const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
fs.writeFileSync(`${process.env.TMPDIR || '/tmp'}/verify-v11-results.json`, JSON.stringify({ results, errs }, null, 2));
await b.close();
server.close();
process.exit(errs.length || passed < results.length ? 1 : 0);
