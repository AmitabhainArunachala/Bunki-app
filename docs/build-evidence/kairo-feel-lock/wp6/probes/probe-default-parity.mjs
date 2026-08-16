/**
 * WP6 — "the defaults are indistinguishable" as a differential measurement,
 * not an assurance.
 *
 * Two drift sources are driven side by side: the landed one (--a, normally the
 * file at HEAD) and this work package's (--b, the working tree). Math.random is
 * replaced by a seeded xorshift in an init script — the same trick
 * verify-drift-consistency uses for its fuzz — so both pages build the SAME
 * field, in the same order, from the same deck. The same gesture script then
 * runs against both, and after every single gesture a semantic trace is taken:
 * which word is the planet, which words are its satellites, which are unfolded,
 * which are glossed, how deep the dive stack is, what the tray and the depth
 * crumb read.
 *
 * Aiming is by headword, never by coordinate: the field breathes, so a fixed
 * (x,y) would drift apart between two runs for reasons that have nothing to do
 * with the change. Positions are therefore never compared; identities are.
 *
 * A single differing trace step fails the run and is printed in full.
 *
 * Usage:
 *   node probe-default-parity.mjs --a /path/pristine.html --b /path/wp6.html
 *                                 [--seeds 1729,2718,3141] [--out FILE]
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../../../..');
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const SRC_A = resolve(arg('--a', resolve(REPO, 'prototypes/drift/drift-artifact.html')));
const SRC_B = resolve(arg('--b', resolve(REPO, 'prototypes/drift/drift-artifact.html')));
const SEEDS = String(arg('--seeds', '1729,2718,3141')).split(',').map(Number);
const OUT = arg('--out', `${process.env.TMPDIR || '/tmp'}/wp6-default-parity.json`);

const page4 = (file) => {
  const body = fs.readFileSync(file, 'utf8');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head>
<body>${body}</body></html>`;
};
const HTML = { a: page4(SRC_A), b: page4(SRC_B) };

const server = http
  .createServer((q, r) => {
    const which = q.url.startsWith('/b') ? 'b' : 'a';
    r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    r.end(HTML[which]);
  })
  .listen(0, '127.0.0.1');
await new Promise((ok) => server.on('listening', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

// the seeded field: identical deck, identical shuffle, identical spawn order
const seedScript = (seed) => `(() => {
  try { localStorage.clear(); } catch (e) {}
  let state = (${seed} >>> 0) || 0x9e3779b9;
  Math.random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
})()`;

const TRACE = `(() => {
  const txt = (el) => (el.querySelector('.base') || {}).textContent || '';
  const cls = (c) => [...document.querySelectorAll('.word.' + c)].map(txt).filter(Boolean).sort();
  return {
    centre: (document.querySelector('.word.bctr') && txt(document.querySelector('.word.bctr'))) || null,
    sats: cls('bsat'),
    unfolded: cls('unfolded'),
    glossed: cls('glossed'),
    stack: stack.length,
    lockOn,
    family: typeof FOCUS !== 'undefined' ? FOCUS.map((f) => f.e[0]).sort() : null,
    depth: (document.getElementById('depth') || {}).textContent || '',
    tray: (document.getElementById('tray') || {}).textContent || '',
    card: !!(document.getElementById('card') || {}).classList && document.getElementById('card').classList.contains('open'),
    words: document.querySelectorAll('.word').length,
  };
})()`;

// pick a target by its position in a STABLE ordering (sorted headword), so both
// pages choose the same word without either one being told which
// Rank is a FRACTION of the candidate list (0..1), so three ranks give three
// different words however long the list happens to be on the day — an integer
// index modulo a short list collapses onto the same one or two words.
const PICK = (frac, needReading) => `(() => {
  const out = [];
  for (const el of document.querySelectorAll('.word')) {
    const n = nodeOf.get(el);
    if (!n || n.gone) continue;
    if (${needReading} && !n.r) continue;
    if (el.classList.contains('lod')) continue;
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) < 0.4 || cs.pointerEvents === 'none') continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 62 || cx > innerWidth - 28 || cy < 130 || cy > innerHeight - 165) continue;
    out.push(n.w);
  }
  out.sort();
  if (!out.length) return null;
  return { w: out[Math.min(out.length - 1, Math.floor(out.length * ${frac}))], pool: out.length };
})()`;

const POINT = (w) => `(() => {
  for (const el of document.querySelectorAll('.word')) {
    const n = nodeOf.get(el);
    if (n && !n.gone && n.w === ${JSON.stringify(w)}) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  }
  return null;
})()`;

const SATPICK = `(() => {
  const c = focusN && !focusN.gone ? focusN.w : null;
  const out = [];
  for (const el of document.querySelectorAll('.word.bsat')) {
    const n = nodeOf.get(el);
    if (!n || n.gone || n.w === c) continue;
    if (el.classList.contains('lod')) continue;
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) < 0.45 || cs.pointerEvents === 'none') continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 60 || cx > innerWidth - 26 || cy < 130 || cy > innerHeight - 165) continue;
    out.push(n.w);
  }
  out.sort();
  return out[0] || null;
})()`;

async function runOne(which, seed, forced) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  await ctx.addInitScript(seedScript(seed));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console.error: ' + m.text().slice(0, 200));
  });
  const cdp = await ctx.newCDPSession(p);
  const touch = (t, pts) => cdp.send('Input.dispatchTouchEvent', { type: t, touchPoints: pts });
  const wait = (ms) => p.waitForTimeout(ms);
  const tapAt = async (x, y) => {
    try {
      await touch('touchEnd', []);
    } catch {
      /* nothing live */
    }
    await touch('touchStart', [{ x, y }]);
    await wait(30);
    await touch('touchEnd', []);
    await wait(780);
  };
  const open = async () => {
    await p.goto(`${base}/${which}`, { waitUntil: 'load' });
    await wait(1900);
  };
  const trace = () => p.evaluate(TRACE);

  const steps = [];
  const step = async (label) => steps.push({ label, ...(await trace()) });
  const picks = { centres: [], blooms: [], sats: [] };

  // The world is laid out from strHash, not from the deck, so the seed shifts
  // the population but not where a given word sits. Breadth therefore comes
  // from walking several different ranks, not from the seed alone.
  const CENTRE_RANKS = [0.15, 0.5, 0.85];
  const SAT_RANKS = [0.3, 0.7];
  const pools = [];

  /* ---- the centre-word ladder, three taps on the same word, several words */
  for (let k = 0; k < CENTRE_RANKS.length; k++) {
    await open();
    await step(`boot-centre${k}`);
    let w0 = forced ? forced.centres[k] : null;
    if (!forced) {
      const got = await p.evaluate(PICK(CENTRE_RANKS[k], true));
      w0 = got && got.w;
      pools.push(got && got.pool);
    }
    picks.centres.push(w0);
    for (let i = 1; i <= 3; i++) {
      const pt = (await p.evaluate(POINT(w0))) || { x: 195, y: 420 };
      await tapAt(pt.x, pt.y);
      await step(`centre${k}-tap${i}:${w0}`);
    }
  }

  /* ---- the satellite walk, two taps on a satellite of a fresh bloom */
  for (let k = 0; k < SAT_RANKS.length; k++) {
    await open();
    await step(`boot-sat${k}`);
    let w1 = forced ? forced.blooms[k] : null;
    if (!forced) {
      const got = await p.evaluate(PICK(SAT_RANKS[k], true));
      w1 = got && got.w;
      pools.push(got && got.pool);
    }
    picks.blooms.push(w1);
    {
      const pt = (await p.evaluate(POINT(w1))) || { x: 195, y: 420 };
      await tapAt(pt.x, pt.y);
    }
    await step(`bloom${k}:${w1}`);
    const s1 = forced ? forced.sats[k] : await p.evaluate(SATPICK);
    picks.sats.push(s1);
    for (let i = 1; i <= 2; i++) {
      const pt = (await p.evaluate(POINT(s1))) || { x: 195, y: 300 };
      await tapAt(pt.x, pt.y);
      await step(`sat${k}-tap${i}:${s1}`);
    }
  }

  await ctx.close();
  return { picks, steps, errs, pools };
}

// `words` is the live node count, which the 650ms recycler moves on wall-clock
// time — two browser contexts never agree on it and it says nothing about the
// ladder. Everything the change could touch (planet, satellites, reveal sets,
// dive depth, crumb, tray, card) is compared exactly.
const cmp = (s) => {
  if (!s) return 'null';
  const { words, ...rest } = s;
  return JSON.stringify(rest);
};

const rows = [];
let allSame = true;
for (const seed of SEEDS) {
  // A goes first and CHOOSES; B is then forced onto exactly the words A walked,
  // so the comparison is of behaviour, never of which word the field offered.
  const A = await runOne('a', seed, null);
  const B = await runOne('b', seed, A.picks);
  const diffs = [];
  const n = Math.max(A.steps.length, B.steps.length);
  for (let i = 0; i < n; i++) {
    if (cmp(A.steps[i]) !== cmp(B.steps[i])) diffs.push({ i, a: A.steps[i] || null, b: B.steps[i] || null });
  }
  const reached = B.steps.every((s) => s != null);
  const ok = diffs.length === 0 && reached && A.errs.length === 0 && B.errs.length === 0;
  allSame = allSame && ok;
  rows.push({ seed, picks: A.picks, steps: A.steps.length, diffs, errsA: A.errs, errsB: B.errs, rawA: A.steps, rawB: B.steps });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  seed ${seed}: ${A.steps.length} traced states, ${diffs.length} differing · ` +
      `walked ${JSON.stringify(A.picks)} on both (candidate pools ${JSON.stringify(A.pools)}) · errors A/B=${A.errs.length}/${B.errs.length}`,
  );
  for (const d of diffs) console.log(`      step ${d.i}\n        A ${JSON.stringify(d.a)}\n        B ${JSON.stringify(d.b)}`);
}

console.log(`\n${rows.filter((r) => r.diffs.length === 0).length}/${rows.length} seeds identical`);
fs.writeFileSync(OUT, JSON.stringify({ a: SRC_A, b: SRC_B, at: new Date().toISOString(), seeds: SEEDS, rows }, null, 2));
console.log(`results -> ${OUT}`);
await b.close();
server.close();
process.exit(allSame ? 0 : 1);
