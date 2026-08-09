/**
 * WP6 — the two v11 checks that do not reach their own precondition under the
 * four-rung ladder, re-run with the rung budget the ladder actually costs.
 *
 * Running the whole v11 suite under every combination (v11-under-every-combo)
 * gives 21/21 for both stage3 combinations and 19/21 for both stage4 ones. The
 * two that drop are:
 *
 *   1-pinch-surface-nobleed  — the suite taps a word three times to open a dive
 *                              and then pinches in. Under stage4 three taps land
 *                              on the English rung, so the dive is never opened
 *                              and the check reports "could not enter a dive".
 *   8-unfold-clear-on-lock   — the suite taps A once and requires unfolded>=1
 *                              before locking B. Under stage4 one tap raises the
 *                              family and reads nothing, so the precondition is
 *                              not met and the check cannot run.
 *
 * Neither is a statement about the field: both are the suite counting rungs.
 * This file makes that claim falsifiable by driving the SAME two mechanisms with
 * one extra tap, and asserts the same outcomes verify-v11 asserts. If the four-
 * rung ladder had actually broken surfacing or the lock's fold, these fail.
 *
 * The v11 numbers are reported as measured and are NOT adjusted anywhere.
 *
 * Usage: node probe-stage4-v11-preconditions.mjs [--out FILE] [--src PATH]
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const SRC = resolve(arg('--src', resolve(HERE, '../../../../../prototypes/drift/drift-artifact.html')));
const OUT = arg('--out', `${process.env.TMPDIR || '/tmp'}/wp6-stage4-preconditions.json`);
const PORT = Number(arg('--port', '8971'));

const body = fs.readFileSync(SRC, 'utf8');
const pageHtml = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head>
<body>${body}</body></html>`;
const server = http
  .createServer((q, r) => {
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    r.end(pageHtml);
  })
  .listen(PORT);

const results = [];
const notes = {};
const R = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
};

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
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
const touch = (t, pts) => cdp.send('Input.dispatchTouchEvent', { type: t, touchPoints: pts });
const wait = (ms) => p.waitForTimeout(ms);
const clearTouch = async () => {
  try {
    await touch('touchEnd', []);
  } catch {
    /* nothing live */
  }
};

/* the gesture vocabulary below is verify-v11's, unchanged, so the two
 * mechanisms are driven exactly as the suite drives them */
async function tapAt(x, y) {
  await clearTouch();
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

const st = () =>
  p.evaluate(() => ({
    z: +cam.z.toFixed(3),
    rot: +cam.rot.toFixed(3),
    stack: stack.length,
    lockOn,
    focus: typeof FOCUS !== 'undefined' ? FOCUS.length : null,
    unfolded: document.querySelectorAll('.word.unfolded').length,
    words: document.querySelectorAll('.word').length,
  }));
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
const focusPoint = () =>
  p.evaluate(() => (focusN && !focusN.gone ? { cx: focusN.x + focusN.dragX, cy: focusN.y + focusN.dragY } : null));

async function openField(ladder, satTap) {
  await p.goto(`http://127.0.0.1:${PORT}/?ladder=${ladder}&sattap=${satTap}`, { waitUntil: 'load' });
  await wait(1900);
  const got = await p.evaluate(() => window.__DRIFT_TAP__.get());
  if (got.ladder !== ladder || got.satTap !== satTap) throw new Error(`seam did not take: ${JSON.stringify(got)}`);
}

for (const satTap of ['staged', 'recenter']) {
  const tag = `stage4+${satTap}`;

  /* ---- 1-pinch-surface-nobleed, with the four-rung budget ---- */
  await openField('stage4', satTap);
  const w = await nearestWord(195, 420);
  if (w) {
    await tapAt(w.cx, w.cy);
    for (let i = 0; i < 3; i++) {
      const fp = (await focusPoint()) || w;
      await tapAt(fp.cx, fp.cy);
    }
  }
  const sd = await st();
  if (sd.stack >= 1) {
    await pinch(195, 420, 150, 45);
    const sa = await st();
    notes[`${tag}-pinch`] = { before: sd, after: sa, word: w && w.t };
    R(
      `${tag} · a pinch that surfaces still does not bleed into zoom (4 taps to the dive)`,
      sa.stack < sd.stack && sa.z > 0.7,
      `4 taps opened the dive (stack=${sd.stack}); pinch-in → stack ${sd.stack}->${sa.stack}, z ${sd.z}->${sa.z} (must stay >0.7)`,
    );
  } else {
    notes[`${tag}-pinch`] = { before: sd, word: w && w.t };
    R(`${tag} · a pinch that surfaces still does not bleed into zoom (4 taps to the dive)`, false, `four taps did not open a dive (stack=${sd.stack}, word=${w && w.t})`);
  }

  /* ---- 8-unfold-clear-on-lock, with the rung that actually reveals ---- */
  await openField('stage4', satTap);
  const A = await nearestWord(140, 380);
  await tapAt(A ? A.cx : 195, A ? A.cy : 420); // rung 1: forward + family
  {
    const fp = (await focusPoint()) || A;
    await tapAt(fp.cx, fp.cy); // rung 2: the reading — the reveal the check needs
  }
  await wait(1400);
  const u1 = (await st()).unfolded;
  const B = A ? await nearestWord(280, 540, 0.2, A.t) : null;
  if (A && B) {
    await longPress(B.cx, B.cy, 560);
    const sl = await st();
    notes[`${tag}-lock`] = { A: A.t, B: B.t, unfoldedBefore: u1, after: sl };
    R(
      `${tag} · a lock still folds another word's reveal (2 taps to the reading)`,
      u1 >= 1 && sl.unfolded === 0 && sl.lockOn === true,
      `tapped A=${A.t.slice(0, 6)} twice (unfolded=${u1}), locked B=${B.t.slice(0, 6)} → unfolded=${sl.unfolded}, lockOn=${sl.lockOn}, members=${sl.focus}`,
    );
  } else {
    R(`${tag} · a lock still folds another word's reveal (2 taps to the reading)`, false, 'no A/B pair on screen');
  }
}

R('zero console/page errors', errs.length === 0, errs.length ? errs.join(' | ') : 'none');

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
fs.writeFileSync(OUT, JSON.stringify({ src: SRC, at: new Date().toISOString(), results, notes, errs }, null, 2));
console.log(`results -> ${OUT}`);
await b.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
