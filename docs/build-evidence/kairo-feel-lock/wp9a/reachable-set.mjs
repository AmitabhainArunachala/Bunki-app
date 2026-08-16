/**
 * WP9a — static reachable-set analysis of the Drift word pool, PRE-FIX.
 *
 * This script models the tie-break as it stood at eeae6c5 (a static per-word
 * hash) and computes the ceiling that produced: the union of every word
 * refreshActive could EVER mount, over the camera's entire clamped range. It
 * deliberately keeps the old formula inline rather than reading it back out of
 * the source, so the "before" column of the report stays reproducible after the
 * fix landed. The post-fix behaviour is measured by paging-sim.mjs (pan
 * sessions) and instrument-pool.mjs (real Chromium).
 *
 * The Drift does NOT have a spawn pool in the usual sense. Every entry of
 * `WALL` (the merged seed list + wbig.json + the five hand-added N1 words) is
 * given a PERMANENT world coordinate by `buildWorld()`; panning moves a camera
 * over that fixed map. What decides whether a word is ever *readable* (a DOM
 * `.word` node you can tap, unfold, swipe) rather than a 3-px ink dot is
 * `refreshActive()`:
 *
 *     vis   = every word whose world point projects inside the viewport + 140px
 *     target = vis.sort((a,b) => b.pri - a.pri).slice(0, 64)
 *
 * and `rePri()` gives each word a STATIC priority:
 *
 *     pri = (lm===0 ? 8 : lm===1 ? 2.4 : 0)      // lm = |wordLevel - tide|
 *         + (store.unknown[w] ? 1.6 : 0)
 *         + (seedFragile ? 0.8 : 0)
 *         + ((strHash(w) >> 2) % 100) / 100      // fixed per word, forever
 *
 * Nothing in that expression varies with time, pan distance, or frame count.
 * So for a fixed tide + fixed localStorage the winner set at a given camera
 * pose is a constant. The reachable set at tide L is therefore purely
 * geometric:
 *
 *     R(L) = { w : level(w)=L and ∃ camera pose C with w visible at C and
 *              |{ v visible at C : level(v)=L, pri(v) > pri(w) }| < 64 }
 *
 * (own-level words always outrank everything else: min own-level pri is 8.0,
 * max near-level pri is 2.4+1.6+0.8+0.99 = 5.79, so the 64 slots are filled by
 * own-level words first and only spill over when fewer than 64 are on screen.)
 *
 * This script reproduces buildWorld/rePri/refreshActive bit-for-bit in Node
 * (same strHash with Math.imul, same clamps, same 64) and sweeps the camera
 * over its full clamped range on a fine grid, at each zoom of interest, to
 * compute R(L) per tide stop.
 *
 * Usage:
 *   node reachable-set.mjs                       # default 390x844 viewport
 *   node reachable-set.mjs --vw 1280 --vh 800
 *   node reachable-set.mjs --json out.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const SRC = resolve(ROOT, 'prototypes/drift/drift-artifact.html');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const VW = Number(arg('vw', 390));
const VH = Number(arg('vh', 844));
const JSON_OUT = arg('json', null);
// grid resolution: camera samples per axis over the clamped camera range
const GRID = Number(arg('grid', 160));

/* ---------------------------------------------------------------- source */
const src = readFileSync(SRC, 'utf8');

const grab = (start, end, label) => {
  const a = src.indexOf(start);
  if (a < 0) throw new Error(`anchor missing: ${label}`);
  const b = src.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`anchor end missing: ${label}`);
  return src.slice(a + start.length, b + end.length - end.length);
};

// const W=[ ... ]]; — the seed list (fragile/known flag in slot 3)
const wBlock = src.match(/const W=\[\n([\s\S]*?)\]\];\n/);
if (!wBlock) throw new Error('could not find const W=[...]');
const W = JSON.parse(`[${wBlock[1]}]]`);

// const WBIG=[...]; — one line
const wbigLine = src.split('\n').find((l) => l.startsWith('const WBIG=['));
if (!wbigLine) throw new Error('could not find const WBIG=');
const WBIG = JSON.parse(wbigLine.slice('const WBIG='.length, -1));

// EXTRA — the five N1 words the source appends by hand
const extraBlock = src.match(/for\(const e of \[\["過酷"[\s\S]*?\]\]\)\n/);
if (!extraBlock) throw new Error('could not find the EXTRA append block');
const EXTRA = JSON.parse(
  extraBlock[0].slice(extraBlock[0].indexOf('[['), extraBlock[0].lastIndexOf(']]') + 2),
);

/* --------------------------------------------------- WALL (source order) */
const LVLOF = {};
for (const e of WBIG) LVLOF[e[0]] = e[3];
const SEEDSET = new Set(W.map((e) => e[0]));
const WALL = W.map((e) => [e[0], e[1], e[2], e[3], e[4] || '', LVLOF[e[0]] || 3]).concat(
  WBIG.filter((e) => !SEEDSET.has(e[0])).map((e) => [e[0], e[1], e[2], 'k', '', e[3]]),
);
for (const e of EXTRA) if (!WALL.some((x) => x[0] === e[0])) WALL.push(e);

/* ------------------------------------------------------ buildWorld clone */
const strHash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const isKanji = (c) => /[一-鿿]/.test(c);

const HUBS = (() => {
  const count = {};
  for (const e of WALL) for (const c of e[0]) if (isKanji(c)) count[c] = (count[c] || 0) + 1;
  return Object.keys(count)
    .filter((c) => count[c] >= 6)
    .sort((a, b) => count[b] - count[a])
    .slice(0, 42);
})();

const WR = { w: VW * 3.2, h: VH * 3.2 };
const HUBPOS = {};
HUBS.forEach((h, i) => {
  const a = i * 2.39996;
  const r = 0.1 + 0.38 * Math.sqrt(i / HUBS.length);
  HUBPOS[h] = {
    x: WR.w / 2 + Math.cos(a) * r * WR.w * 0.92,
    y: WR.h / 2 + Math.sin(a) * r * WR.h * 0.92,
  };
});

const WORDS = WALL.map((e) => {
  const hs = [...e[0]].filter((c) => HUBPOS[c]);
  const hsh = strHash(e[0]);
  let x;
  let y;
  if (hs.length) {
    x =
      hs.reduce((s2, c) => s2 + HUBPOS[c].x, 0) / hs.length +
      ((hsh % 230) - 115) * (hs.length > 1 ? 1.5 : 1);
    y =
      hs.reduce((s2, c) => s2 + HUBPOS[c].y, 0) / hs.length +
      (((hsh >> 5) % 230) - 115) * (hs.length > 1 ? 1.5 : 1);
  } else {
    x = ((hsh % 1000) / 1000) * WR.w;
    y = (((hsh >> 10) % 1000) / 1000) * WR.h;
  }
  return {
    w: e[0],
    lvl: e[5] || 3,
    fragile: e[3] === 'f',
    hash: ((strHash(e[0]) >> 2) % 100) / 100,
    wx: clamp(x, 60, WR.w - 60),
    wy: clamp(y, 90, WR.h - 90),
  };
});

/* ------------------------------------------------- rePri clone, PRE-FIX form
 * store is empty (a fresh install): no `unknown` bonus. `wr.hash` keeps the
 * shipped `(strHash>>2)%100/100` verbatim — note `>>` is the SIGNED shift, so
 * for the ~half of words whose fnv hash has bit 31 set this term is NEGATIVE,
 * spanning (-0.99, 0.99) rather than [0, 0.99). It never broke the level bands
 * (own-level floor 8-0.99=7.01 still clears the near-level ceiling 5.79) but it
 * is the reason a naive rotation of this term leaves half the tier stranded —
 * see the fix note in drift-artifact.html's rePri(). */
const priAt = (wr, level) => {
  const lm = Math.abs(wr.lvl - level);
  return (lm === 0 ? 8 : lm === 1 ? 2.4 : 0) + (wr.fragile ? 0.8 : 0) + wr.hash;
};

/* ----------------------------------------------- refreshActive reachability
 * refreshActive() uses w2s(wr.wx, wr.wy) — the UNWANDERED world point — and
 * the window test `s.x > -pad && s.x < vw()+pad` with pad=140. With cam.rot=0
 * the visible set is the axis-aligned world box
 *     [cam.x - (vw/2+pad)/z, cam.x + (vw/2+pad)/z] x (same in y)
 * camClamp bounds cam.x to [mx, WR.w-mx], mx = min(WR.w*0.44, vw/(2z)*0.7).
 *
 * Own-level words fill the 64 slots before any other level can take one, so a
 * level-L word is ACTIVE at pose C iff fewer than 64 higher-pri level-L words
 * share the window. We sweep C on a GRIDxGRID lattice — a faithful model of
 * "the user pans everywhere" — and union the winners.
 */
const PAD = 140;
const CAP = 64;

function reachableAtZoom(level, z) {
  const halfW = (VW / 2 + PAD) / z;
  const halfH = (VH / 2 + PAD) / z;
  const mx = Math.min(WR.w * 0.44, (VW / (2 * z)) * 0.7);
  const my = Math.min(WR.h * 0.44, (VH / (2 * z)) * 0.7);
  const own = WORDS.filter((wr) => wr.lvl === level).map((wr) => ({
    ...wr,
    pri: priAt(wr, level),
  }));
  // descending pri — index in this array IS the rank
  own.sort((a, b) => b.pri - a.pri);
  const reachable = new Set();
  const camX0 = mx;
  const camX1 = WR.w - mx;
  const camY0 = my;
  const camY1 = WR.h - my;
  const stepX = (camX1 - camX0) / (GRID - 1);
  const stepY = (camY1 - camY0) / (GRID - 1);
  for (let i = 0; i < GRID; i++) {
    const cx = camX0 + i * stepX;
    for (let j = 0; j < GRID; j++) {
      const cy = camY0 + j * stepY;
      // walk own[] in pri order; the first CAP that fall in the window are the
      // ACTIVE set at this pose (identical to sort-then-slice(0,64))
      let taken = 0;
      for (let k = 0; k < own.length && taken < CAP; k++) {
        const wr = own[k];
        if (
          wr.wx > cx - halfW &&
          wr.wx < cx + halfW &&
          wr.wy > cy - halfH &&
          wr.wy < cy + halfH
        ) {
          reachable.add(wr.w);
          taken++;
        }
      }
    }
  }
  return { reachable, total: own.length, own };
}

/* --------------------------------------------------------------- report */
const LEVELS = [
  { lv: 1, label: 'N1' },
  { lv: 2, label: 'N2' },
  { lv: 3, label: 'N3' },
  { lv: 4, label: 'N4' },
  { lv: 5, label: 'N5' },
];
const ZOOMS = [
  { z: 1.0, name: 'z=1.00 (default / boot)' },
  { z: 2.6, name: 'z=2.60 (max pinch-in)' },
  { z: 0.34, name: 'z=0.34 (max pinch-out)' },
];

const tierByLevel = {};
for (const wr of WORDS) tierByLevel[wr.lvl] = (tierByLevel[wr.lvl] || 0) + 1;

const out = {
  viewport: { vw: VW, vh: VH },
  world: { w: WR.w, h: WR.h },
  grid: GRID,
  cap: CAP,
  wallSize: WALL.length,
  tierByLevel,
  perLevel: {},
};

console.log(`WP9a · Drift reachable-set (static) — viewport ${VW}x${VH}`);
console.log(`WALL = ${WALL.length} entries · world ${WR.w}x${WR.h} · cap ${CAP} · grid ${GRID}^2 poses\n`);

const header = ['tide', 'tier@level', ...ZOOMS.map((z) => z.name)];
const rows = [];
for (const L of LEVELS) {
  const cells = [];
  const detail = {};
  for (const Z of ZOOMS) {
    const { reachable, total } = reachableAtZoom(L.lv, Z.z);
    cells.push(`${reachable.size}/${total} (${((reachable.size / total) * 100).toFixed(1)}%)`);
    detail[Z.z] = { reachable: reachable.size, total };
    if (Z.z === 1.0) detail.unreachableAtZ1 = [...new Set(
      WORDS.filter((wr) => wr.lvl === L.lv).map((wr) => wr.w),
    )].filter((w) => !reachable.has(w));
  }
  rows.push([L.label, String(tierByLevel[L.lv]), ...cells]);
  out.perLevel[L.label] = detail;
}

const widths = header.map((h, i) =>
  Math.max(h.length, ...rows.map((r) => r[i].length)),
);
const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
console.log(line(header));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const r of rows) console.log(line(r));

console.log('');
for (const L of LEVELS) {
  const u = out.perLevel[L.label].unreachableAtZ1 || [];
  if (u.length) {
    console.log(
      `${L.label}: ${u.length} words UNREACHABLE at default zoom — e.g. ${u.slice(0, 12).join(' ')}`,
    );
  } else {
    console.log(`${L.label}: fully reachable at default zoom`);
  }
}

if (JSON_OUT) {
  writeFileSync(resolve(HERE, JSON_OUT), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`\nwrote ${JSON_OUT}`);
}
