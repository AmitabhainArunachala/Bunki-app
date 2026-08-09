/**
 * WP7 — prefers-reduced-motion is a hard stop on MOTION, never on INTERACTION.
 *
 * Under `reduce` the field must be completely still: zero drift, zero current,
 * zero pigment travel over a full ten seconds. Everything a finger asks for must
 * still answer — the tap ladder (furigana, then gloss), and the flick judgment,
 * which is the one and only way a word is allowed to leave the screen.
 *
 * Usage: node verify-reduced-still.mjs [--src PATH] [--out FILE] [--port N]
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SRC = resolve(arg('--src', resolve(HERE, '../../../../prototypes/drift/drift-artifact.html')));
const OUT = arg('--out', '');
const PORT = Number(arg('--port', '8991'));

const body = fs.readFileSync(SRC, 'utf8');
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body>${body}</body></html>`;
const server = http.createServer((q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html);
}).listen(PORT);

const results = [];
const R = (fix, pass, detail) => { results.push({ fix, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${fix}: ${detail}`); };

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
  hasTouch: true, isMobile: true, reducedMotion: 'reduce',
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console.error: ' + m.text().slice(0, 200)); });
const cdp = await ctx.newCDPSession(p);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
const wait = (ms) => p.waitForTimeout(ms);

await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await wait(4000);

R('reduced-media-query-seen', await p.evaluate(() => reduced === true),
  `the page's own \`reduced\` flag reads ${await p.evaluate(() => String(reduced))}`);

// ---- 1. stillness over ten seconds, measured on every moving thing ----
const still = await p.evaluate(async () => {
  const sample = () => ({
    words: nodes.filter((n) => n.kind === 'word' && n.mode === 'free' && !n.gone && !n.removed)
      .map((n) => [n.seqId, n.x, n.y]),
    blobs: blobs.map((x) => [x.x, x.y]),
    motes: MOTES.map((m) => [m.x, m.y]),
    fluid: Math.max(...Array.from(fvx).map(Math.abs), ...Array.from(fvy).map(Math.abs)),
    offs: WORDS.slice(0, 400).map((w) => [w.ox, w.oy]),
  });
  const a = sample();
  await new Promise((r) => setTimeout(r, 10000));
  const z = sample();
  const wa = new Map(a.words.map((w) => [w[0], w]));
  let maxWord = 0, moved = 0;
  for (const w of z.words) {
    const o = wa.get(w[0]); if (!o) continue;
    const d = Math.hypot(w[1] - o[1], w[2] - o[2]);
    if (d > maxWord) maxWord = d;
    if (d > 0) moved++;
  }
  const maxOf = (A, B) => Math.max(0, ...B.map((v, i) => A[i] ? Math.hypot(v[0] - A[i][0], v[1] - A[i][1]) : 0));
  return {
    words: z.words.length, maxWordPx: maxWord, wordsThatMoved: moved,
    maxBlobPx: maxOf(a.blobs, z.blobs),
    maxMoteFrac: maxOf(a.motes, z.motes),
    maxOffsetPx: maxOf(a.offs, z.offs),
    fluidBefore: a.fluid, fluidAfter: z.fluid,
  };
});
R('reduced-field-still',
  still.maxWordPx === 0 && still.wordsThatMoved === 0 && still.maxBlobPx === 0 &&
  still.maxMoteFrac === 0 && still.maxOffsetPx === 0 && still.fluidAfter === 0,
  `over 10s: ${still.wordsThatMoved}/${still.words} words moved (max ${still.maxWordPx}px), ` +
  `pigment pools max ${still.maxBlobPx}px, flow motes max ${still.maxMoteFrac}, ` +
  `drift offsets max ${still.maxOffsetPx}, fluid |v|max ${still.fluidBefore}->${still.fluidAfter}`);

// ---- 2. the tap ladder still climbs ----
async function tapAt(x, y) {
  await touch('touchStart', [{ x, y }]); await wait(30);
  await touch('touchEnd', []); await wait(320);
}
const target = await p.evaluate(() => {
  const cand = nodes.filter((n) => n.kind === 'word' && n.mode === 'free' && !n.gone && !n.removed &&
    n.x > 110 && n.x < innerWidth - 60 && n.y > 220 && n.y < innerHeight - 220 && n.r);
  cand.sort((a, c) => c.op - a.op);
  const n = cand[0];
  return n ? { id: n.seqId, x: n.x, y: n.y, w: n.w } : null;
});
if (!target) R('reduced-tap-ladder', false, 'no clear word to tap');
else {
  const cls = () => p.evaluate((id) => {
    const n = nodes.find((n) => n.seqId === id);
    return n ? { unfolded: n.el.classList.contains('unfolded'), glossed: n.el.classList.contains('glossed'), gone: !!n.gone } : null;
  }, target.id);
  const c0 = await cls();
  await tapAt(target.x, target.y);
  const c1 = await cls();
  await tapAt(target.x, target.y);
  const c2 = await cls();
  R('reduced-tap-ladder',
    !c0.unfolded && c1.unfolded && !c1.glossed && c2.unfolded && c2.glossed,
    `"${target.w}": rest ${JSON.stringify(c0)} -> one tap ${JSON.stringify(c1)} -> two taps ${JSON.stringify(c2)}`);
}

// ---- 3. the flick judgment is still the one way out ----
// First put the field back to open water. The tap ladder above left a
// constellation held, and `mayGrade = !FOCUS.length || n === focusN` — a flick
// on a word that is not the held planet is DESIGNED not to grade. Flicking one
// there would be testing the guard, not the judgment.
const water = await p.evaluate(() => {
  for (let y = 300; y < innerHeight - 260; y += 17)
    for (let x = 40; x < innerWidth - 40; x += 17) {
      const el = document.elementFromPoint(x, y);
      if (el && !el.closest('.word') && !el.closest('.glyph') && !el.closest('.part') &&
          !el.closest('#lvl') && !el.closest('#theme') && !el.closest('#card')) return { x, y };
    }
  return null;
});
if (water) { await tapAt(water.x, water.y); await wait(500); }
const focusLeft = await p.evaluate(() => FOCUS.length);
R('reduced-bloom-released', focusLeft === 0,
  water ? `water tap at ${water.x},${water.y} left FOCUS=${focusLeft}` : 'no open water found');
// A FRESH word: the one the tap ladder just climbed is unfolded and is the
// bloom centre, and a centre does not take a grade — flicking it would test
// nothing and report a false failure.
const flickTarget = await p.evaluate((usedId) => {
  const cand = nodes.filter((n) => n.kind === 'word' && n.mode === 'free' && !n.gone && !n.removed &&
    n.seqId !== usedId && !n.hlDom && n !== focusN &&
    !n.el.classList.contains('unfolded') &&
    n.x > 150 && n.x < innerWidth - 90 && n.y > 260 && n.y < innerHeight - 260);
  cand.sort((a, c) => c.op - a.op);
  const n = cand[0];
  return n ? { id: n.seqId, x: n.x, y: n.y, w: n.w } : null;
}, target ? target.id : -1);
if (!flickTarget) R('reduced-flick-judgment', false, 'no clear word to flick');
else {
  // A judgment is a FLICK: `flick = moved && (held < 330 || |dx|/held > 0.45)`.
  // Six moves with a 14ms wait each put `held` over 330ms once CDP round trips
  // are counted, and 96px/400ms is 0.24 — under the 0.45 bar. So: four moves,
  // no waits, a long throw. Fast and horizontal, which is what the gesture is.
  await touch('touchStart', [{ x: flickTarget.x, y: flickTarget.y }]);
  for (let i = 1; i <= 4; i++) await touch('touchMove', [{ x: flickTarget.x + i * 30, y: flickTarget.y }]);
  await touch('touchEnd', []);
  await wait(900);
  const after = await p.evaluate((id) => {
    const n = nodes.find((n) => n.seqId === id);
    return { found: !!n, gone: n ? !!n.gone : true, removed: n ? !!n.removed : true, graded: n && n.wref ? !!n.wref.gradedAt : null };
  }, flickTarget.id);
  R('reduced-flick-judgment', after.gone || after.removed || after.graded === true,
    `flicked "${flickTarget.w}" right (known): ${JSON.stringify(after)}`);
}

R('reduced-no-errors', errs.length === 0, errs.length ? errs.join(' | ') : 'none');

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ src: SRC, still, results }, null, 2));
await b.close(); server.close();
process.exit(passed === results.length ? 0 : 1);
