/**
 * v11 coherence verification — the composed-surface instrument.
 *
 * Recovered from the v11 coherence campaign (1f582fc) and re-aimed at the
 * CURRENT drift build. It drives the real surface with real CDP touch at the
 * 390x844 profile.
 *
 * THE MEASUREMENT RULE, after independent verification found the first cut of
 * this file tautological: no check may use an opacity threshold the arbiter
 * itself controls. The first version of 4-rest-overlap and 6-chrome-keepout
 * skipped words under 0.42 while the arbiter's whole action was to push
 * contested words under 0.42 — they could not fail. Everything below now
 * measures EVERY rendered word.
 *
 * The law checks run first and are the ones that must be able to fail:
 *   law-rest-presence   no word is painted fainter than the faintest word the
 *                       field paints unaided (self-anchored to spawnWord's own
 *                       opacity ladder, which the arbiter cannot move)
 *   law-rest-reachable  no rendered word is pointer-transparent or hit-tests to
 *                       nothing; a real tap on a ghost brings it back
 *   law-ghost-residual  deleting a ghost must change its own box by at least
 *                       half the pixel signal of the quietest KEPT word
 *   law-zoom-presence   the same presence bar under a hard zoom
 *
 * The mechanism checks:
 *   1  pinch mode latched at gesture start (surfacing never bleeds into zoom)
 *   2  return-to-rest: double-tap open water eases pan + zoom + twist home
 *   3  rotation bounded to +-pi (with the twist proven to have registered)
 *   4  reading contention at rest and after zoom — for every geometrically
 *      overlapping pair of rendered words, one must be clearly figure and the
 *      other clearly ground. Raw geometry is reported unchanged: the arbiter
 *      paints, it does not move words.
 *   5  hint pill >= 4.5:1 in every theme, raised by the app's own setHint and
 *      asserted to actually render (5 checks, one per pigment world)
 *   6  chrome keep-out: no word at READING presence under chrome
 *   7  darkened foreground pigments reach parity (2 checks + the night floor)
 *   8  lock-time unfold clear, lock whole at min zoom, clean release
 *
 * Zero console errors and zero page errors are a hard gate on top.
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
// Open water: no word, no chrome, no canvas hub (hubs are not DOM) — and with
// real CLEARANCE from every word box. "elementFromPoint is not a word" alone is
// not enough: the field drifts, so a point that merely grazes open water can be
// under a word 300ms later, which turns a double-tap probe into a word tap and
// quietly corrupts every step after it. Pick the candidate furthest from any word.
const emptyPoint = () =>
  p.evaluate(() => {
    const cand = [];
    for (let x = 30; x <= 360; x += 30) for (let y = 110; y <= 720; y += 40) cand.push([x, y]);
    const hubFree = (x, y) => typeof hubAt !== 'function' || hubAt(x, y) == null;
    const rects = [...document.querySelectorAll('.word,.glyph,.part')].map((e) => e.getBoundingClientRect());
    let best = null;
    let bestClear = -1;
    for (const [x, y] of cand) {
      const e = document.elementFromPoint(x, y);
      if (e && e.closest('.word,.glyph,.part,#card,#theme,#lvl,#hint,#brand,#depth,#tray,#radoc')) continue;
      if (!hubFree(x, y)) continue;
      let clear = 1e9;
      for (const r of rects) {
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        clear = Math.min(clear, Math.hypot(dx, dy));
      }
      if (clear > bestClear) { bestClear = clear; best = [x, y]; }
    }
    return best || [195, 700];
  });
// The reading-presence line the arbiter itself refuses to cross (ARB_MIN in the
// source). Below it a word is atmosphere by the field's own definition, and the
// arbiter never contests it — so it is the only defensible line for "these two
// words are fighting over the same reading".
const READING = 0.44;

// A full census of EVERY rendered word — no opacity gate anywhere, so nothing
// the arbiter dims can hide from the numbers. This replaces the old
// overlapStats/chromeOverlap, both of which skipped words under 0.42 and were
// therefore incapable of failing once the arbiter ran.
const census = () =>
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
    const gh = (getComputedStyle(document.documentElement).getPropertyValue('--ground').trim() || '#FBFAF5').replace('#', '');
    const gr = [parseInt(gh.slice(0, 2), 16), parseInt(gh.slice(2, 4), 16), parseInt(gh.slice(4, 6), 16)];
    const gl = lum(gr[0], gr[1], gr[2]);

    // chrome regions, for the keep-out measurement
    const cr = [];
    for (const id of ['brand', 'depth', 'theme', 'tray', 'hint', 'lvl']) {
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

    const W = [];
    for (const el of document.querySelectorAll('.word')) {
      const cs = getComputedStyle(el);
      const op = parseFloat(cs.opacity);
      if (!(op > 0.002)) continue; // a word at literally zero is mid-removal, not rendered
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue;
      const n = typeof nodeOf !== 'undefined' ? nodeOf.get(el) : null;
      const c = parse(cs.color);
      const a = (c[3] == null ? 1 : c[3]) * op;
      const fl = lum(c[0] * a + gr[0] * (1 - a), c[1] * a + gr[1] * (1 - a), c[2] * a + gr[2] * (1 - a));
      const contrast = (Math.max(fl, gl) + 0.05) / (Math.min(fl, gl) + 0.05);
      // reachability, measured through the app's OWN tap path: sample a grid
      // inside the word's box, resolve each point exactly as pointerdown does
      // (elementFromPoint -> loudestWordAt), and ask whether any point in the
      // word's own area would deliver the tap to this word.
      let reach = false;
      let reachPts = 0;
      let onScreenPts = 0;
      let openPts = 0; // samples inside this word's box where nothing at all is on top
      let hubPts = 0;  // samples where a canvas-drawn hub sun owns the point
      const openWhat = [];
      for (let gx = 1; gx <= 5; gx++)
        for (let gy = 1; gy <= 5; gy++) {
          const px2 = r.left + (r.width * gx) / 6;
          const py2 = r.top + (r.height * gy) / 6;
          // strictly INSIDE the viewport: elementFromPoint returns null on the
          // far edge, which would read as "open sky over this word" for any word
          // hanging off the bottom or right of the screen
          if (px2 < 1 || px2 > innerWidth - 1 || py2 < 1 || py2 > innerHeight - 1) continue;
          onScreenPts++;
          const he = document.elementFromPoint(px2, py2);
          const hw = he && he.closest ? he.closest('.word,.glyph,.part') : null;
          const hc = he && he.closest ? he.closest('#brand,#depth,#theme,#tray,#hint,#lvl,#card,#radoc') : null;
          let cand = hw ? (typeof nodeOf !== 'undefined' ? nodeOf.get(hw) : null) : null;
          // mirror the source's single touch-arbitration rule: a hub sun outranks
          // a GHOST. Hubs are canvas-drawn, so hit-testing cannot see them and
          // the harness has to apply the same rule the handler does.
          const onHub = typeof hubAt === 'function' && stack.length === 0 && hubAt(px2, py2) != null;
          const gf = typeof ghostFloor !== 'undefined' ? ghostFloor : 0.3;
          if (cand && cand.kind === 'word' && onHub && (parseFloat(cand.el.style.opacity) || 1) <= gf + 0.01) cand = null;
          if (cand && cand.el === el) {
            reachPts++;
            reach = true;
          } else if (onHub) {
            hubPts++;
          } else if (!hw && !hc) {
            openPts++;
            if (openWhat.length < 3) openWhat.push({ x: Math.round(px2), y: Math.round(py2), el: he ? (he.id ? '#' + he.id : he.tagName + '.' + String(he.className || '')) : 'null' });
          }
        }
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hitEl = document.elementFromPoint(cx, cy);
      const hitWord = hitEl && hitEl.closest ? hitEl.closest('.word') : null;
      const hitChrome = hitEl && hitEl.closest ? hitEl.closest('#brand,#depth,#theme,#tray,#hint,#lvl,#card,#radoc') : null;
      const chrome = cr.filter((q) => r.right > q.r.left && r.left < q.r.right && r.bottom > q.r.top && r.top < q.r.bottom).map((q) => q.id);
      W.push({
        t: el.textContent.slice(0, 8),
        op: +op.toFixed(4),
        contrast: +contrast.toFixed(3),
        pe: cs.pointerEvents,
        collide: n && n.collide != null ? +n.collide.toFixed(3) : null,
        // the word's UNARBITRATED presence — spawnWord's own ladder, which the
        // arbiter cannot move. The self-anchor is measured against this.
        baseOp: n && n.op != null ? +n.op.toFixed(4) : null,
        ghosted: !!(n && n.collide != null && n.collide < 0.5),
        seqId: n ? n.seqId : null,
        box: { x: r.left, y: r.top, w: r.width, h: r.height },
        hitSelf: hitWord === el,
        hitOther: !!hitWord && hitWord !== el,
        underChrome: !!hitChrome,
        reach,
        reachPts,
        onScreenPts,
        openPts,
        hubPts,
        openWhat,
        chrome,
      });
    }

    // the presence a word needs before the arbiter will let it push another
    // one back — read from the live source, not restated here
    const winMin = (typeof ghostFloor !== 'undefined' ? ghostFloor : 0.3) / 0.53;

    // geometric overlap over ALL rendered words, plus reading contention
    let rawWorst = 0;
    let rawPairs = 0;
    let worstContend = 0;
    const contendBad = [];
    for (let i = 0; i < W.length; i++)
      for (let j = i + 1; j < W.length; j++) {
        const a = W[i].box;
        const b = W[j].box;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox <= 0 || oy <= 0) continue;
        const f = (ox * oy) / Math.min(a.w * a.h, b.w * b.h);
        rawWorst = Math.max(rawWorst, f);
        if (f > 0.25) rawPairs++;
        if (f <= 0.25) continue;
        const hi = Math.max(W[i].op, W[j].op);
        const lo = Math.min(W[i].op, W[j].op);
        const contend = lo / hi;
        worstContend = Math.max(worstContend, contend);
        if (contend > 0.55)
          contendBad.push({
            a: W[i].t,
            b: W[j].t,
            f: +f.toFixed(2),
            hi: +hi.toFixed(3),
            lo: +lo.toFixed(3),
            contend: +contend.toFixed(2),
            cA: W[i].collide,
            cB: W[j].collide,
            // Is this tangle the arbiter's to answer for? Two ways yes:
            //   · the louder word carries enough presence that the arbiter
            //     should have receded the other, or
            //   · the arbiter DID separate them — exactly one is a ghost — and
            //     the separation it produced is still too close. That is its own
            //     work, judged. This is what makes CONTEND_MAX falsifiable:
            //     loosen it and the arbiter starts receding words against
            //     winners too quiet to make room, landing here rather than being
            //     excused as untouched.
            // Ghost-over-ghost is neither: both words are ground, nothing is
            // competing for reading, and pushing either lower would breach the
            // floor. Counted separately, never folded into the pass.
            arbitrable: hi >= winMin,
            bothGhosts: W[i].ghosted && W[j].ghosted,
          });
      }

    const ghosts = W.filter((w) => w.ghosted);
    // scope: the arbiter owes reachability for the words IT receded. Words that
    // simply lie under other words at full presence are the field's own
    // pre-existing crowding — reported, and compared against the baseline.
    // A ghost standing on a galaxy sun yields its tap to the door by design.
    // It is separated out and counted — never folded into the pass — so the
    // gate below can still say: every ghost NOT under a hub is promotable.
    const unreachedGhostsAll = ghosts.filter((w) => !w.reach && !w.underChrome);
    const unreachedGhosts = unreachedGhostsAll.filter((w) => w.hubPts === 0);
    const hubShadowedGhosts = unreachedGhostsAll.filter((w) => w.hubPts > 0);
    const unreachedOther = W.filter((w) => !w.ghosted && !w.reach && !w.underChrome);
    const present = W.filter((w) => !w.ghosted);
    const minOf = (arr, k) => (arr.length ? Math.min(...arr.map((x) => x[k])) : null);
    return {
      words: W.length,
      ghosts: ghosts.length,
      present: present.length,
      rawWorst: +rawWorst.toFixed(3),
      rawPairs,
      worstContend: +worstContend.toFixed(2),
      contendBad,
      chromeAtReading: W.filter((w) => w.chrome.length && w.op >= 0.44).map((w) => ({ w: w.t, chrome: w.chrome.join('+'), op: w.op })),
      chromeAny: W.filter((w) => w.chrome.length).map((w) => ({ w: w.t, chrome: w.chrome.join('+'), op: w.op })),
      peNone: W.filter((w) => w.pe === 'none').map((w) => w.t),
      unreachableGhosts: unreachedGhosts.map((w) => ({ t: w.t, op: w.op, onScreenPts: w.onScreenPts, openPts: w.openPts, pe: w.pe })),
      hubShadowedGhosts: hubShadowedGhosts.map((w) => ({ t: w.t, op: w.op, hubPts: w.hubPts })),
      // A ghost is "lost" only if there is a sample point inside its own box,
      // on screen, with NOTHING on top of it — open sky over the word — and the
      // word still does not take the tap there. That would mean the recede
      // itself took it away. Every other case is one word covering another,
      // which the field does at this zoom with or without an arbiter.
      ghostsLostWithNothingOver: unreachedGhosts.filter((w) => w.openPts > 0).map((w) => ({ t: w.t, op: w.op, pe: w.pe, openPts: w.openPts, openWhat: w.openWhat, box: w.box })),
      unreachableOther: unreachedOther.map((w) => ({ t: w.t, op: w.op })),
      underChromeOnly: W.filter((w) => !w.reach && w.underChrome).map((w) => w.t),
      ghostFloor: typeof ghostFloor !== 'undefined' ? +ghostFloor.toFixed(3) : null,
      winMin: +winMin.toFixed(3),
      minBaseOp: W.length ? Math.min(...W.map((w) => (w.baseOp == null ? 1 : w.baseOp))) : null,
      minGhostOp: minOf(ghosts, 'op'),
      maxGhostOp: ghosts.length ? Math.max(...ghosts.map((x) => x.op)) : null,
      minPresentOp: minOf(present, 'op'),
      minGhostContrast: minOf(ghosts, 'contrast'),
      minPresentContrast: minOf(present, 'contrast'),
      sampleGhosts: ghosts.slice(0, 6).map((g) => ({ t: g.t, op: g.op, contrast: g.contrast, seqId: g.seqId })),
    };
  });

// Residual-signal test (the verifier's method): screenshot, display:none ONE
// word, screenshot, diff that word's own box. A word that changes nothing when
// deleted was never on screen. Ghosts are compared against kept controls in the
// same frame, so the bar is the field's own idea of "a word is here".
async function residualSignal(maxEach = 3) {
  await p.evaluate(() => {
    // pin positions so the only difference between the two frames is the hide
    window.__pins = nodes.map((n) => ({ n, x: n.x, y: n.y }));
    window.__pl = setInterval(() => {
      for (const q of window.__pins) {
        q.n.x = q.x;
        q.n.y = q.y;
      }
    }, 8);
  });
  await wait(500);
  const picks = await p.evaluate((maxEach) => {
    const g = [];
    const k = [];
    for (const n of nodes) {
      if (n.kind !== 'word' || n.gone || n.removed || !n.el) continue;
      const r = n.el.getBoundingClientRect();
      if (r.width < 6 || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) continue;
      const rec = { id: n.seqId, w: n.w.slice(0, 6), op: +parseFloat(getComputedStyle(n.el).opacity).toFixed(4), box: { x: Math.round(r.left), y: Math.round(r.top), ww: Math.round(r.width), hh: Math.round(r.height) } };
      if (n.collide != null && n.collide < 0.5) g.push(rec);
      else if (n.collide > 0.95) k.push(rec);
    }
    return { ghost: g.slice(0, maxEach), keep: k.slice(0, maxEach) };
  }, maxEach);
  const baseBuf = await p.screenshot();
  const baseD = 'data:image/png;base64,' + baseBuf.toString('base64');
  const rows = [];
  for (const grp of ['ghost', 'keep'])
    for (const it of picks[grp]) {
      await p.evaluate((id) => {
        const n = nodes.find((n) => n.seqId === id);
        if (n) n.el.style.display = 'none';
      }, it.id);
      await wait(240);
      const buf = await p.screenshot();
      const d = await p.evaluate(
        async ([a, bb, r]) => {
          const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = s; });
          const [ia, ib] = await Promise.all([load(a), load(bb)]);
          const c = document.createElement('canvas');
          c.width = ia.width;
          c.height = ia.height;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(ia, 0, 0);
          const A = g.getImageData(0, 0, c.width, c.height).data;
          g.clearRect(0, 0, c.width, c.height);
          g.drawImage(ib, 0, 0);
          const B = g.getImageData(0, 0, c.width, c.height).data;
          let maxD = 0, sum = 0, n = 0, gt8 = 0;
          for (let y = r.y; y < Math.min(c.height, r.y + r.hh); y++)
            for (let x = r.x; x < Math.min(c.width, r.x + r.ww); x++) {
              const i = (y * c.width + x) * 4;
              const dd = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
              maxD = Math.max(maxD, dd);
              sum += dd;
              n++;
              if (dd > 8) gt8++;
            }
          return { maxD, mean: +(sum / Math.max(1, n)).toFixed(2), pctGt8: +((100 * gt8) / Math.max(1, n)).toFixed(1) };
        },
        [baseD, 'data:image/png;base64,' + buf.toString('base64'), it.box],
      );
      rows.push({ kind: grp === 'ghost' ? 'GHOST' : 'KEPT', w: it.w, op: it.op, ...d });
      await p.evaluate((id) => {
        const n = nodes.find((n) => n.seqId === id);
        if (n) n.el.style.display = '';
      }, it.id);
      await wait(160);
    }
  await p.evaluate(() => clearInterval(window.__pl));
  return rows;
}

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

    // Foreground words: the large ones that carry reading weight, composited at
    // their UNARBITRATED presence (n.op). This is a claim about pigment, so it
    // must not depend on which words the arbiter happens to have ghosted in this
    // frame — reading the rendered opacity made the sample, and the median, move
    // with the arbiter rather than with the palette.
    const vals = [];
    for (const el of document.querySelectorAll('.word')) {
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (fs < 18) continue;
      const n = typeof nodeOf !== 'undefined' ? nodeOf.get(el) : null;
      const op = n && n.op != null ? n.op : parseFloat(cs.opacity);
      if (op < 0.5) continue;
      const c = parse(cs.color);
      vals.push(ratio(over([c[0], c[1], c[2]], (c[3] == null ? 1 : c[3]) * op, gr), gr));
    }
    vals.sort((a, b) => a - b);
    const med = vals.length ? vals[Math.floor(vals.length / 2)] : null;
    const min = vals.length ? vals[0] : null;

    // The hint pill, measured AS THE SURFACE SHOWS IT. setHint() is the app's
    // own way of raising a hint, so nothing here forces opacity — a pill that
    // rendered invisible would be caught by hintRendered rather than flattered
    // by the harness.
    const hint = document.getElementById('hint');
    let hintCr = null;
    let hintBg = null;
    let hintRendered = null;
    if (hint) {
      const hs = getComputedStyle(hint);
      hintRendered = +parseFloat(hs.opacity).toFixed(3);
      hintBg = hs.backgroundColor;
      const bgc = parse(hs.backgroundColor);
      const plate = over([bgc[0], bgc[1], bgc[2]], bgc[3], gr);
      const tc = parse(hs.color);
      hintCr = ratio(over([tc[0], tc[1], tc[2]], tc[3] == null ? 1 : tc[3], plate), plate);
    }
    const name = document.getElementById('theme')?.textContent || '?';
    return {
      name,
      med: med && +med.toFixed(2),
      min: min && +min.toFixed(2),
      n: vals.length,
      hintCr: hintCr && +hintCr.toFixed(2),
      hintBg,
      hintRendered,
    };
  });

await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await wait(3200);
const s0 = await st();
console.log('rest:', JSON.stringify(s0));
notes.rest = s0;
await shot('01-rest');

// ---- THE LAW: nothing on this screen disappears without a flick judgment ----
// These three run FIRST because they are the checks that must be able to fail.
// They measure every rendered word with no opacity gate, so the arbiter cannot
// satisfy them by pushing words under a threshold.
let cen = await census();
notes.restCensus = cen;
console.log(`census: ${cen.words} words · ${cen.ghosts} ghosted · rawWorstOverlap=${cen.rawWorst} · minGhostOp=${cen.minGhostOp} minPresentOp=${cen.minPresentOp}`);

// (a) presence — no word is pushed fainter than the faintest the field paints
// unaided. Self-anchoring: the bar is set by spawnWord's own opacity ladder,
// which predates the arbiter and which the arbiter cannot move.
{
  // the bar: no ghost is painted fainter than the faintest presence spawnWord's
  // own ladder produces for any word in the same frame
  const anchored = cen.minGhostOp == null || (cen.minBaseOp != null && cen.minGhostOp >= cen.minBaseOp - 0.005);
  R(
    'law-rest-presence',
    anchored,
    `faintest ghost op=${cen.minGhostOp} vs the field's own faintest unarbitrated presence ${cen.minBaseOp} (live floor ${cen.ghostFloor}); ghost contrast ${cen.minGhostContrast}:1 vs quietest present word ${cen.minPresentContrast}:1 — ${cen.ghosts}/${cen.words} ghosted`,
  );
}

// (b) reachability — paint recedes, touch does not. Static: every rendered word
// has at least one point in its own box that the app's real tap path resolves
// to it. Dynamic: a genuine CDP tap on such a point brings a ghost back.
{
  const probe = await p.evaluate(() => {
    // a ghost, and a point inside it that the real tap path delivers to it
    for (const n of nodes) {
      if (n.kind !== 'word' || n.gone || n.removed || !n.el) continue;
      if (!(n.collide != null && n.collide < 0.5)) continue;
      const r = n.el.getBoundingClientRect();
      for (let gx = 1; gx <= 3; gx++)
        for (let gy = 1; gy <= 3; gy++) {
          const x = r.left + (r.width * gx) / 4;
          const y = r.top + (r.height * gy) / 4;
          if (x < 20 || x > innerWidth - 20 || y < 70 || y > innerHeight - 120) continue;
          // open water only: a point on a galaxy sun would answer with the door
          if (typeof hubAt === 'function' && hubAt(x, y) != null) continue;
          const he = document.elementFromPoint(x, y);
          const hw = he && he.closest ? he.closest('.word,.glyph,.part') : null;
          const cand = hw ? nodeOf.get(hw) : null;
          if (cand === n) return { seqId: n.seqId, w: n.w, x, y, opBefore: +parseFloat(getComputedStyle(n.el).opacity).toFixed(3) };
        }
    }
    return null;
  });
  let gestureOk = null;
  let after = null;
  if (probe) {
    await tapAt(probe.x, probe.y);
    await wait(500);
    after = await p.evaluate((id) => {
      const n = nodes.find((n) => n.seqId === id);
      if (!n || !n.el) return null;
      return { collide: +n.collide.toFixed(2), isFocus: focusN === n, hl: !!n.hlDom, unfolded: n.el.classList.contains('unfolded') };
    }, probe.seqId);
    // the tap answered THIS word: it became the bloom centre, or it unfolded
    gestureOk = !!after && (after.isFocus || after.unfolded || after.hl);
    const [rx0, ry0] = await emptyPoint();
    await tapAt(rx0, ry0); // put the field back
    await wait(700);
  }
  R(
    'law-rest-reachable',
    cen.peNone.length === 0 && cen.unreachableGhosts.length === 0 &&
      (cen.ghosts === 0 || (probe != null && gestureOk === true)),
    `pointer-events:none on ${cen.peNone.length}; ghosts not under a hub with no reachable point: ${cen.unreachableGhosts.length}${cen.unreachableGhosts.length ? ' ' + JSON.stringify(cen.unreachableGhosts) : ''}; ${cen.ghosts ? `live tap on ghost "${probe ? probe.w : '—'}" (op ${probe ? probe.opBefore : '—'}) -> ${after ? JSON.stringify(after) : 'n/a'}` : 'no ghost was manufactured: geometry needed no receding'} · ${cen.hubShadowedGhosts.length} ghost(s) standing on a galaxy sun yield their tap to the door by design · pre-existing crowding, not the arbiter's doing: ${cen.unreachableOther.length} full-presence words fully covered by other words, ${cen.underChromeOnly.length} covered by chrome`,
  );
  notes.reachProbe = { probe, after, gestureOk };
}

// (c) residual signal — deleting a ghost must visibly change the screen
{
  await wait(900);
  const rows = await residualSignal(3);
  notes.residual = rows;
  const gh = rows.filter((r) => r.kind === 'GHOST');
  const kp = rows.filter((r) => r.kind === 'KEPT');
  const minGhostMean = gh.length ? Math.min(...gh.map((r) => r.mean)) : null;
  const minKeptMean = kp.length ? Math.min(...kp.map((r) => r.mean)) : null;
  // the bar: a ghost must carry at least half the residual signal of the
  // quietest word the arbiter chose to KEEP in the same frame
  const ok = minGhostMean == null || (minKeptMean != null && minGhostMean >= 0.5 * minKeptMean);
  R(
    'law-ghost-residual',
    ok,
    `deleting a ghost changes its box by mean Δ ${gh.map((r) => r.mean).join('/')} (max Δ ${gh.map((r) => r.maxD).join('/')}); kept controls mean Δ ${kp.map((r) => r.mean).join('/')} — bar is ≥50% of the quietest kept (${minKeptMean})`,
  );
}
await goHome();
await wait(1800);
cen = await census();
notes.restCensus2 = cen;

// ---- Fix 4: spatial arbitration at the resting surface ----
// Measured as READING CONTENTION over every rendered word, not as an overlap
// count among words above a threshold the arbiter controls. The geometry does
// not change — the arbiter paints, it does not move words — so rawWorst is
// reported as a diagnostic and is expected to stay high.
{
  const arb = cen.contendBad.filter((c) => c.arbitrable);
  const unarb = cen.contendBad.filter((c) => !c.arbitrable && !c.bothGhosts);
  const gg = cen.contendBad.filter((c) => c.bothGhosts);
  notes.restUnarbitrable = unarb;
  notes.restGhostOverGhost = gg;
  R(
    '4-rest-contention',
    arb.length === 0,
    `arbitrable contending pairs=${arb.length} (bar 0) · left standing: ${unarb.length} where both words are too quiet to win (receding either would breach the floor ${cen.ghostFloor}) + ${gg.length} ghost-over-ghost (both already ground) · worstContention=${cen.worstContend} · raw geometry unchanged: worstOverlap=${cen.rawWorst} over ${cen.rawPairs} pairs of ${cen.words} words${arb.length ? ' :: ' + JSON.stringify(arb.slice(0, 4)) : ''}`,
  );
}

// ---- Fix 6: chrome keep-out ----
R(
  '6-chrome-keepout',
  cen.chromeAtReading.length === 0,
  `${cen.chromeAtReading.length} words at reading presence (≥${READING}) under chrome; ${cen.chromeAny.length} present under chrome at all (as ghosts)${cen.chromeAtReading.length ? ' :: ' + JSON.stringify(cen.chromeAtReading.slice(0, 6)) : ''}`,
);

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
// A clamp that reads 0 because the twist never registered would pass a naive
// bound check, so the twist is proven to bite first.
const rot0 = (await st()).rot;
await twist(195, 420, 160);
const rot1 = (await st()).rot;
await twist(195, 420, 160);
await twist(195, 420, 160);
const sr = await st();
notes.rot = { rot0, rot1, rot3: sr.rot };
const twistBit = Math.abs(rot1 - rot0) > 0.5;
R(
  '3-rot-clamp',
  twistBit && Math.abs(sr.rot) <= Math.PI + 0.01,
  `twist registered: rot ${rot0} -> ${rot1} (must move >0.5); after 3x160deg rot=${sr.rot} (must be within +-${Math.PI.toFixed(2)})`,
);

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

// ---- Fix 4b: no reading contention after a hard zoom ----
await pinch(195, 420, 45, 200);
await wait(1800);
const cz2 = await census();
notes.zoomCensus = cz2;
{
  const arbZ = cz2.contendBad.filter((c) => c.arbitrable);
  notes.zoomUnarbitrable = cz2.contendBad.filter((c) => !c.arbitrable && !c.bothGhosts);
  notes.zoomGhostOverGhost = cz2.contendBad.filter((c) => c.bothGhosts);
  R(
    '4-zoom-contention',
    arbZ.length === 0,
    `after zoom (z=${(await st()).z}) arbitrable contending pairs=${arbZ.length}, left standing ${notes.zoomUnarbitrable.length} too-quiet-to-win + ${notes.zoomGhostOverGhost.length} ghost-over-ghost, worstContention=${cz2.worstContend} · raw worstOverlap=${cz2.rawWorst} over ${cz2.rawPairs} pairs of ${cz2.words} words${arbZ.length ? ' :: ' + JSON.stringify(arbZ.slice(0, 3)) : ''}`,
  );
}
// The law holds at zoom too. Reachability at 2.6x cannot be judged by comparing
// ghosts against other words: a ghost IS, by selection, a word that overlaps
// something, so of course it is covered more often — the field at this zoom has
// words on top of words whether or not an arbiter runs (the f433edf baseline
// has 8 of 41 fully covered here, with no arbiter at all).
// The question the law actually asks is narrower and answerable: is any ghost
// out of reach for a reason OTHER than another word sitting over that pixel? A
// ghost that hit-tests to nothing, or carries pointer-events:none, would have
// been taken away by the recede itself. Words covering words is crowding; a
// word made transparent to touch is a disappearance.
R(
  'law-zoom-presence',
  (cz2.minGhostOp == null || (cz2.minBaseOp != null && cz2.minGhostOp >= cz2.minBaseOp - 0.005)) &&
    cz2.peNone.length === 0 &&
    cz2.ghostsLostWithNothingOver.length === 0,
  `zoomed: faintest ghost op=${cz2.minGhostOp} vs the field's faintest unarbitrated ${cz2.minBaseOp} (floor ${cz2.ghostFloor}); pointer-events:none on ${cz2.peNone.length}; ghosts out of reach with nothing over them: ${cz2.ghostsLostWithNothingOver.length}${cz2.ghostsLostWithNothingOver.length ? ' ' + JSON.stringify(cz2.ghostsLostWithNothingOver) : ''}; ${cz2.hubShadowedGhosts.length} yielding to a galaxy sun · crowding context: ${cz2.unreachableGhosts.length}/${cz2.ghosts} ghosts and ${cz2.unreachableOther.length}/${cz2.words - cz2.ghosts} full-presence words are covered by other words at this zoom`,
);
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
  // raise a hint the way the app raises one, then let its 1.2s opacity
  // transition finish before reading it — measuring mid-fade would report a
  // pill that is on its way up as if it were the steady state
  await p.evaluate(() => {
    if (typeof setHint === 'function') setHint('テスト hint');
    else document.getElementById('hint').textContent = 'テスト hint';
  });
  await wait(1500);
  const tc = await themeContrast();
  themes[tc.name] = tc;
  R(
    `5-hint[${tc.name}]`,
    tc.hintCr != null && tc.hintCr >= 4.5 && tc.hintRendered != null && tc.hintRendered > 0.9,
    `hint text/plate contrast=${tc.hintCr} on ${tc.hintBg}; pill actually rendered at opacity ${tc.hintRendered} (must be >0.9, not forced by the harness)`,
  );
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
