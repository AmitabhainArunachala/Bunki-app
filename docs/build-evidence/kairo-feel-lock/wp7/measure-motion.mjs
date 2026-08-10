/**
 * WP7 motion instrument — measures aliveness and frame health on the real
 * surface at the operator's 390x844 touch profile.
 *
 * Three numbers, all sampled per-rAF inside the page so nothing is inferred:
 *   speed      median per-word path length / second over the window ("is it
 *              moving at all"), plus mean and net drift
 *   coherence  mean(v . tangent_hat) / mean(|v|) taken around the current's
 *              wandering centre. 0 = random jitter, +-1 = pure rotation.
 *              A second figure, radial, is reported so a pure in/out pull
 *              cannot be mistaken for a current.
 *   frames     rAF delta p50/p95/p99 + long-frame counts
 *
 * Usage:
 *   node measure-motion.mjs --src PATH [--label NAME] [--out FILE]
 *        [--seconds 10] [--reduced] [--port 8951] [--shot FILE]
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import process from 'node:process';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);

// --src FILE serves one html file at /; --dir DIR --page REL serves a whole
// tree, which is how the corridor fusion has to be measured (it loads
// drift-layer.js, corridor.js and its data as separate requests)
const DIR = arg('--dir', '');
const PAGE = arg('--page', 'index.html?entry=drift');
const SRC = arg('--src', '');
if (!SRC && !DIR) { console.error('need --src FILE or --dir DIR'); process.exit(2); }
const LABEL = arg('--label', 'run');
const OUT = arg('--out', '');
const SHOT = arg('--shot', '');
const SECONDS = Number(arg('--seconds', '10'));
const PORT = Number(arg('--port', '8951'));
const REDUCED = has('--reduced');
const SETTLE = Number(arg('--settle', '4000'));

let body = SRC ? fs.readFileSync(SRC, 'utf8') : '';
// --set NAME=VALUE,... rewrites the operator tunables in place so a feel sweep
// costs one process and never leaves a half-tuned value in the source
const SET = arg('--set', '');
const setApplied = {};
if (SET) {
  for (const kv of SET.split(',')) {
    const [k, v] = kv.split('=');
    const re = new RegExp(`const ${k}=[^;]*;`);
    if (!re.test(body)) { console.error(`--set: ${k} not found in source`); process.exit(2); }
    body = body.replace(re, `const ${k}=${v};`);
    setApplied[k] = Number(v);
  }
}
// the corridor fusion is already a whole document; the drift standalone is a
// fragment that wants the same shell verify-v11 gives it
const isDoc = /<!doctype/i.test(body.slice(0, 400));
const pageHtml = isDoc ? body : `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head>
<body>${body}</body></html>`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  if (!DIR) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(pageHtml);
    return;
  }
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = resolve(DIR, rel);
  if (!file.startsWith(resolve(DIR))) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = file.slice(file.lastIndexOf('.'));
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT);

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
  reducedMotion: REDUCED ? 'reduce' : 'no-preference',
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console.error: ' + m.text().slice(0, 200)); });

await p.goto(`http://127.0.0.1:${PORT}/${DIR ? PAGE : ''}`, { waitUntil: 'load' });
await p.waitForTimeout(SETTLE);

// The standalone exposes its globals; the corridor fusion wraps the very same
// code in an IIFE, so there `nodes` is unreachable and the words are read off
// the DOM instead — from el.style.transform, which the field writes as a plain
// string, so sampling costs no layout and cannot itself cost frames.
const viaGlobals = await p.evaluate(() => typeof nodes !== 'undefined' && Array.isArray(nodes));
const domWords = await p.evaluate(() => document.querySelectorAll('#drift-layer .word, .word').length);
if (!viaGlobals && !domWords) { console.error('no drift field found on this page'); await b.close(); server.close(); process.exit(3); }

const sample = await p.evaluate(async ([secs, useGlobals]) => {
  const t0 = performance.now();
  const frames = [];        // rAF deltas
  const track = new Map();  // key -> {pts:[{t,x,y}]}
  const motes = [];         // mote sample series
  const centres = [];       // current centre per sample
  const TR = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/;
  let last = t0;
  return await new Promise((resolve) => {
    function tick(now) {
      frames.push(now - last); last = now;
      // The eye runs on the field's OWN clock (curT — elapsed animated time),
      // not on wall time. Reading it with performance.now() puts the harness's
      // idea of the centre out of phase with the real one the moment a frame is
      // dropped, and the tangential figure collapses for no reason but that.
      const c = (typeof currentCenter === 'function')
              ? currentCenter(typeof curT === 'number' ? curT : now)
              : { x: innerWidth / 2, y: innerHeight / 2 };
      centres.push({ t: now, x: c.x, y: c.y });
      if (useGlobals) {
        for (const n of nodes) {
          if (n.removed || n.gone || n.frozen) continue;
          if (n.kind !== 'word' || n.mode !== 'free') continue;
          let e = track.get(n.seqId);
          if (!e) { e = { pts: [] }; track.set(n.seqId, e); }
          e.pts.push({ t: now, x: n.x, y: n.y });
        }
        if (typeof MOTES !== 'undefined') {
          motes.push(MOTES.map((m) => ({ x: m.x * innerWidth, y: m.y * innerHeight })));
        }
      } else {
        for (const el of document.querySelectorAll('#drift-layer .word')) {
          const m = TR.exec(el.style.transform || '');
          if (!m) continue;
          const key = (el.querySelector('.base')?.textContent || '') + '|' + el.style.fontSize;
          let e = track.get(key);
          if (!e) { e = { pts: [] }; track.set(key, e); }
          e.pts.push({ t: now, x: +m[1], y: +m[2] });
        }
      }
      if (now - t0 < secs * 1000) requestAnimationFrame(tick);
      else resolve({ frames, centres,
        words: [...track.entries()].map(([id, e]) => ({ id, pts: e.pts })),
        motes, dur: now - t0, sampledVia: useGlobals ? 'globals' : 'dom-transform' });
    }
    requestAnimationFrame(tick);
  });
}, [SECONDS, viaGlobals]);

const q = (a, x) => { if (!a.length) return 0; const s = [...a].sort((m, n) => m - n); return s[Math.min(s.length - 1, Math.floor(x * s.length))]; };
const med = (a) => q(a, 0.5);

// ---- speed: path length per second, per word, over the full window ----
const perWord = [];
for (const w of sample.words) {
  if (w.pts.length < sample.frames.length * 0.9) continue; // present the whole window only
  let path = 0;
  for (let i = 1; i < w.pts.length; i++) {
    const dx = w.pts[i].x - w.pts[i - 1].x, dy = w.pts[i].y - w.pts[i - 1].y;
    const d = Math.hypot(dx, dy);
    if (d > 60) { path = -1; break; }   // a teleport = recycled word, drop it
    path += d;
  }
  if (path < 0) continue;
  const a = w.pts[0], z = w.pts[w.pts.length - 1];
  perWord.push({ id: w.id, pxPerSec: path / (sample.dur / 1000), net: Math.hypot(z.x - a.x, z.y - a.y) });
}
const speeds = perWord.map((w) => w.pxPerSec);
const nets = perWord.map((w) => w.net);

// ---- coherence: tangential vs radial vs total, around the wandering centre ----
function angular(series, centres, stride) {
  let tan = 0, rad = 0, tot = 0, n = 0;
  for (const w of series) {
    for (let i = stride; i < w.pts.length; i += stride) {
      const a = w.pts[i - stride], z = w.pts[i];
      const vx = z.x - a.x, vy = z.y - a.y;
      const sp = Math.hypot(vx, vy);
      if (sp > 60 * stride) continue;
      const c = centres[Math.min(centres.length - 1, i)];
      const rx = (a.x + z.x) / 2 - c.x, ry = (a.y + z.y) / 2 - c.y;
      const r = Math.hypot(rx, ry) || 1;
      tan += (vx * -ry + vy * rx) / r;   // + = counter-clockwise in screen coords
      rad += (vx * rx + vy * ry) / r;
      tot += sp; n++;
    }
  }
  return n ? { tangential: +(tan / tot).toFixed(4), radial: +(rad / tot).toFixed(4),
               meanStepPx: +(tot / n).toFixed(4), samples: n } : null;
}
const keep = new Set(perWord.map((x) => x.id));
const wordSeries = sample.words.filter((w) => keep.has(w.id));
const coh = angular(wordSeries, sample.centres, 12);

const moteSeries = [];
if (sample.motes.length && sample.motes[0].length) {
  const nM = sample.motes[0].length;
  for (let k = 0; k < nM; k++) moteSeries.push({ pts: sample.motes.map((f, i) => ({ t: sample.centres[i].t, x: f[k].x, y: f[k].y })) });
}
const moteCoh = moteSeries.length ? angular(moteSeries, sample.centres, 6) : null;

// ---- flock order: do neighbouring words travel TOGETHER? -------------------
// |sum v| / sum |v| across every tracked word at the same instant. This is the
// honest coherence test for a tethered field: anchored words cannot show a net
// circulation about the eye (a bounded orbit integrates to zero no matter how
// coherent it is), but a real current makes them all lean the same way at once.
// Independent jitter over N words floors at ~1/sqrt(N).
function flockOrder(series, stride) {
  const len = Math.min(...series.map((w) => w.pts.length));
  const vals = [];
  for (let i = stride; i < len; i += stride) {
    let sx = 0, sy = 0, mag = 0;
    for (const w of series) {
      const vx = w.pts[i].x - w.pts[i - stride].x, vy = w.pts[i].y - w.pts[i - stride].y;
      if (Math.hypot(vx, vy) > 60 * stride) continue;
      sx += vx; sy += vy; mag += Math.hypot(vx, vy);
    }
    if (mag > 0) vals.push(Math.hypot(sx, sy) / mag);
  }
  return vals.length ? { mean: +(vals.reduce((a, c) => a + c, 0) / vals.length).toFixed(4),
                         min: +Math.min(...vals).toFixed(4), max: +Math.max(...vals).toFixed(4),
                         frames: vals.length, nWords: series.length,
                         jitterFloor: +(1 / Math.sqrt(series.length)).toFixed(4) } : null;
}
const flock = wordSeries.length > 3 ? flockOrder(wordSeries, 12) : null;

// ---- pair alignment: the coherence test a TETHERED field can actually pass --
// mean cos(angle) between the velocities of two words, bucketed by how far
// apart they stand. Independent jitter gives ~0 at every separation. A real
// current gives a high value for near neighbours, decaying with distance and
// going negative across the eye of the gyre — the signature of a rotation.
function pairAlign(series, stride) {
  const len = Math.min(...series.map((w) => w.pts.length));
  const buckets = [[0, 100], [100, 250], [250, 450], [450, 1e4]];
  const acc = buckets.map(() => ({ sum: 0, n: 0 }));
  for (let i = stride; i < len; i += stride) {
    const v = series.map((w) => {
      const vx = w.pts[i].x - w.pts[i - stride].x, vy = w.pts[i].y - w.pts[i - stride].y;
      const m = Math.hypot(vx, vy);
      return { x: w.pts[i].x, y: w.pts[i].y, vx, vy, m };
    }).filter((a) => a.m > 1e-3 && a.m < 60 * stride);
    for (let a = 0; a < v.length; a++) for (let c = a + 1; c < v.length; c++) {
      const d = Math.hypot(v[a].x - v[c].x, v[a].y - v[c].y);
      const b = buckets.findIndex(([lo, hi]) => d >= lo && d < hi);
      if (b < 0) continue;
      acc[b].sum += (v[a].vx * v[c].vx + v[a].vy * v[c].vy) / (v[a].m * v[c].m);
      acc[b].n++;
    }
  }
  const out = {};
  buckets.forEach(([lo, hi], i) => {
    out[`${lo}-${hi > 1000 ? 'inf' : hi}px`] = acc[i].n
      ? { meanCos: +(acc[i].sum / acc[i].n).toFixed(4), pairs: acc[i].n } : null;
  });
  return out;
}

// ---- shear: how fast NEIGHBOURS move relative to each other ----------------
// This, not absolute speed, is what makes two words newly overlap — and every
// new overlap starts a ~0.33s window in which the WP2 arbiter has decided but
// its 0.12 ease has not finished, which is exactly what 4-*-contention samples.
// Coherent current motion carries neighbours together and contributes almost
// nothing here; the private per-word zig-zag contributes all of it. Reported so
// the tuning can buy speed from the current rather than from the jitter.
function shear(series, stride, dur) {
  const len = Math.min(...series.map((w) => w.pts.length));
  let sum = 0, n = 0;
  for (let i = stride; i < len; i += stride) {
    const v = series.map((w) => ({
      x: w.pts[i].x, y: w.pts[i].y,
      vx: w.pts[i].x - w.pts[i - stride].x, vy: w.pts[i].y - w.pts[i - stride].y,
    }));
    for (let a = 0; a < v.length; a++) for (let c = a + 1; c < v.length; c++) {
      if (Math.hypot(v[a].x - v[c].x, v[a].y - v[c].y) >= 100) continue;
      sum += Math.hypot(v[a].vx - v[c].vx, v[a].vy - v[c].vy); n++;
    }
  }
  const perStep = n ? sum / n : 0;
  const secPerStep = (dur / 1000) / (len / stride);
  return { meanRelSpeedPxPerSec: +(perStep / secPerStep).toFixed(3), pairs: n };
}
const align = wordSeries.length > 3 ? pairAlign(wordSeries, 12) : null;
const shr = wordSeries.length > 3 ? shear(wordSeries, 12, sample.dur) : null;

const fr = sample.frames.slice(2);
const out = {
  label: LABEL, src: SRC, reducedMotion: REDUCED, seconds: SECONDS,
  tunablesOverridden: Object.keys(setApplied).length ? setApplied : null,
  wordsTracked: perWord.length,
  speed: {
    medianPxPerSec: +med(speeds).toFixed(3),
    meanPxPerSec: +(speeds.reduce((a, c) => a + c, 0) / (speeds.length || 1)).toFixed(3),
    p90PxPerSec: +q(speeds, 0.9).toFixed(3),
    maxPxPerSec: +Math.max(0, ...speeds).toFixed(3),
    medianNetPx: +med(nets).toFixed(3),
    maxNetPx: +Math.max(0, ...nets).toFixed(3),
  },
  coherence: { wordsAboutEye: coh, motesAboutEye: moteCoh, wordFlockOrder: flock,
               wordPairAlignment: align, neighbourShear: shr },
  frames: {
    n: fr.length,
    p50: +med(fr).toFixed(2), p95: +q(fr, 0.95).toFixed(2), p99: +q(fr, 0.99).toFixed(2),
    max: +Math.max(...fr).toFixed(2),
    over20ms: fr.filter((d) => d > 20).length,
    over50ms: fr.filter((d) => d > 50).length,
    fpsFromP50: +(1000 / med(fr)).toFixed(1),
  },
  centreTravelPx: (() => {
    let d = 0; for (let i = 1; i < sample.centres.length; i++)
      d += Math.hypot(sample.centres[i].x - sample.centres[i - 1].x, sample.centres[i].y - sample.centres[i - 1].y);
    return +d.toFixed(1);
  })(),
  errors: errs,
};
console.log(JSON.stringify(out, null, 2));
if (SHOT) await p.screenshot({ path: SHOT });
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
await b.close();
server.close();
