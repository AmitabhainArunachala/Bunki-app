/**
 * WP9a — pan-session simulation of the Drift pool, BEFORE and AFTER the paging
 * fix, plus the on-glass eviction accounting that the trance boundary rests on.
 *
 * Reuses the same buildWorld/rePri/refreshActive clone as reachable-set.mjs but
 * drives it the way a finger does: a random walk of drags across the world,
 * with the camera clamped exactly as camClamp does, refreshActive run every
 * 650 ms of simulated time, and (in the AFTER model) the pan odometer turning
 * `pagePhase`.
 *
 * It answers three questions:
 *   1. coverage — distinct own-level words that ever become readable DOM, as a
 *      function of pan distance travelled, before vs after.
 *   2. time-to-full-cycle — the pan distance at which coverage saturates.
 *   3. trance cost — how many words the recycler fades out WHILE STILL ON THE
 *      GLASS per refreshActive tick, before vs after. The fix is only honest if
 *      that number barely moves.
 *
 * Usage:
 *   node paging-sim.mjs                       # both models, all tides
 *   node paging-sim.mjs --drags 4000 --seed 7
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const SRC = resolve(ROOT, 'prototypes/drift/drift-artifact.html');

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const VW = Number(arg('vw', 390));
const VH = Number(arg('vh', 844));
const DRAGS = Number(arg('drags', 3000));
const SEED = Number(arg('seed', 1));
const OUT = arg('out', null);

/* ------------------------------------------------ source-derived constants */
const src = readFileSync(SRC, 'utf8');
const wBlock = src.match(/const W=\[\n([\s\S]*?)\]\];\n/);
const W = JSON.parse(`[${wBlock[1]}]]`);
const wbigLine = src.split('\n').find((l) => l.startsWith('const WBIG=['));
const WBIG = JSON.parse(wbigLine.slice('const WBIG='.length, -1));
const extraBlock = src.match(/for\(const e of \[\["過酷"[\s\S]*?\]\]\)\n/);
const EXTRA = JSON.parse(
  extraBlock[0].slice(extraBlock[0].indexOf('[['), extraBlock[0].lastIndexOf(']]') + 2),
);
// read the fix's own constants out of the source so the sim cannot drift from it
const spanM = src.match(/const PAGE_SPAN=([\d.]+), PAGE_CYCLE=(\d+);/);
const PAGE_SPAN = Number(arg('span', spanM ? spanM[1] : 3.0));
const PAGE_CYCLE = Number(arg('cycle', spanM ? spanM[2] : 40000));
// h01 as the source computes it: the old tie-break rescaled into [0,1)
const seatM = src.match(/wr\.h01=\(\(strHash\(e\[0\]\)>>2\)%(\d+)\)\/(\d+)\+([\d.]+);/);
if (!seatM) throw new Error('could not read the paging wheel seat expression from the source');
const [SEAT_MOD, SEAT_DIV, SEAT_OFF] = [Number(seatM[1]), Number(seatM[2]), Number(seatM[3])];
const PAGED = Boolean(spanM);

const LVLOF = {};
for (const e of WBIG) LVLOF[e[0]] = e[3];
const SEEDSET = new Set(W.map((e) => e[0]));
const WALL = W.map((e) => [e[0], e[1], e[2], e[3], e[4] || '', LVLOF[e[0]] || 3]).concat(
  WBIG.filter((e) => !SEEDSET.has(e[0])).map((e) => [e[0], e[1], e[2], 'k', '', e[3]]),
);
for (const e of EXTRA) if (!WALL.some((x) => x[0] === e[0])) WALL.push(e);

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
      hs.reduce((s, c) => s + HUBPOS[c].x, 0) / hs.length +
      ((hsh % 230) - 115) * (hs.length > 1 ? 1.5 : 1);
    y =
      hs.reduce((s, c) => s + HUBPOS[c].y, 0) / hs.length +
      (((hsh >> 5) % 230) - 115) * (hs.length > 1 ? 1.5 : 1);
  } else {
    x = ((hsh % 1000) / 1000) * WR.w;
    y = (((hsh >> 10) % 1000) / 1000) * WR.h;
  }
  return {
    w: e[0],
    lvl: e[5] || 3,
    fragile: e[3] === 'f',
    // the two hash granularities: %100 is what pri used before the fix,
    // %1000 is the paging wheel's seat
    h100: ((strHash(e[0]) >> 2) % 100) / 100,
    h01: ((strHash(e[0]) >> 2) % SEAT_MOD) / SEAT_DIV + SEAT_OFF,
    wx: clamp(x, 60, WR.w - 60),
    wy: clamp(y, 90, WR.h - 90),
  };
});

/* --------------------------------------------------------------- the loop */
const PAD = 140;
const CAP = 64;
// re-seeded at the top of every run(), so 'before', 'frozen' and 'after' swim
// the IDENTICAL path and the only difference between their columns is the
// chooser. That also makes 'frozen' an exact self-check: the phase-0 wheel adds
// a constant, so its numbers must come out bit-identical to 'before'.
const makeRng = (seed) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
};

function run(level, model, drags) {
  const rng = makeRng(SEED);
  const z = 1;
  const halfW = (VW / 2 + PAD) / z;
  const halfH = (VH / 2 + PAD) / z;
  const mx = Math.min(WR.w * 0.44, (VW / (2 * z)) * 0.7);
  const my = Math.min(WR.h * 0.44, (VH / (2 * z)) * 0.7);
  const base = WORDS.map((wr) => {
    const lm = Math.abs(wr.lvl - level);
    return (lm === 0 ? 8 : lm === 1 ? 2.4 : 0) + (wr.fragile ? 0.8 : 0);
  });
  const cam = { x: WR.w / 2, y: WR.h / 2 };
  let phase = 0;
  let odoX = cam.x;
  let odoY = cam.y;
  let travelled = 0;
  const seen = new Set();
  let active = new Set();
  let ticks = 0;
  let onGlassEvictions = 0;
  let centreEvictions = 0;
  const curve = [];
  const tierSize = WORDS.filter((wr) => wr.lvl === level).length;

  // 'before'  — the shipped tie-break: a static ±0.99 hash rider
  // 'frozen'  — the new wheel with pagePhase pinned at 0 (isolates how much of
  //             the churn is the wheel TURNING vs merely the new tie-break)
  // 'after'   — the wheel turning on the pan odometer, as shipped by the fix
  const priOf = (i) =>
    model === 'before'
      ? base[i] + WORDS[i].h100
      : base[i] + PAGE_SPAN * ((WORDS[i].h01 - (model === 'frozen' ? 0 : phase) + 1) % 1);

  for (let d = 0; d < drags; d++) {
    // one finger drag: a step of 40–360 world px in a slowly-turning direction,
    // applied in 6 sub-steps so camClamp+odometer see honest small increments
    const ang = rng() * Math.PI * 2;
    const len = 40 + rng() * 320;
    for (let k = 0; k < 6; k++) {
      cam.x = clamp(cam.x + (Math.cos(ang) * len) / 6, mx, WR.w - mx);
      cam.y = clamp(cam.y + (Math.sin(ang) * len) / 6, my, WR.h - my);
      const dd = Math.hypot(cam.x - odoX, cam.y - odoY);
      if (dd < 200) phase = (phase + dd / PAGE_CYCLE) % 1;
      travelled += dd;
      odoX = cam.x;
      odoY = cam.y;
    }
    // refreshActive tick
    const vis = [];
    for (let i = 0; i < WORDS.length; i++) {
      const wr = WORDS[i];
      if (
        wr.wx > cam.x - halfW &&
        wr.wx < cam.x + halfW &&
        wr.wy > cam.y - halfH &&
        wr.wy < cam.y + halfH
      )
        vis.push(i);
    }
    vis.sort((a, b) => priOf(b) - priOf(a));
    const target = new Set(vis.slice(0, CAP));
    // trance accounting: an ACTIVE word dropped from target while its world
    // point is still inside the GLASS PROPER (viewport, not the pad ring) is a
    // fade-out the eye can catch. This is what must not get worse.
    for (const i of active) {
      if (target.has(i)) continue;
      const wr = WORDS[i];
      const sx = VW / 2 + (wr.wx - cam.x) * z;
      const sy = VH / 2 + (wr.wy - cam.y) * z;
      if (sx > 0 && sx < VW && sy > 0 && sy < VH) onGlassEvictions++;
      // the centre half of the glass — where the resting eye actually is, and
      // the only place a fade reads as "a word vanished" rather than "the pan
      // carried it away"
      if (sx > VW * 0.25 && sx < VW * 0.75 && sy > VH * 0.25 && sy < VH * 0.75)
        centreEvictions++;
    }
    active = target;
    for (const i of target) if (WORDS[i].lvl === level) seen.add(WORDS[i].w);
    ticks++;
    if ((d + 1) % 100 === 0)
      curve.push([d + 1, Math.round(travelled), seen.size, +(seen.size / tierSize).toFixed(4)]);
  }
  return {
    tierSize,
    covered: seen.size,
    pct: +((seen.size / tierSize) * 100).toFixed(1),
    travelled: Math.round(travelled),
    onGlassEvictionsPerTick: +(onGlassEvictions / ticks).toFixed(2),
    centreEvictionsPerTick: +(centreEvictions / ticks).toFixed(2),
    curve,
  };
}

/* ------------------------------------------------------------------ report */
const LEVELS = [
  [1, 'N1'],
  [2, 'N2'],
  [3, 'N3'],
  [4, 'N4'],
  [5, 'N5'],
];
// the identity the fix rests on: at pagePhase 0 the wheel adds a CONSTANT to
// every word, so it cannot reorder the field. Assert it rather than assert it
// in prose.
{
  let worst = 0;
  for (const wr of WORDS) worst = Math.max(worst, Math.abs(PAGE_SPAN * wr.h01 - (wr.h100 + 1)));
  console.log(
    `phase-0 identity check: max |PAGE_SPAN*h01 - (oldTieBreak + 1)| = ${worst} ` +
      `over ${WORDS.length} words — 0 means the unpanned field ranks exactly as it always did`,
  );
  if (worst > 1e-9) throw new Error('phase-0 identity broken — the rest state would move');
}
console.log(
  `WP9a · paging simulation — viewport ${VW}x${VH}, ${DRAGS} drags, seed ${SEED}\n` +
    `source constants: PAGE_SPAN=${PAGE_SPAN} PAGE_CYCLE=${PAGE_CYCLE} ` +
    `seat=(hash>>2)%${SEAT_MOD}/${SEAT_DIV}+${SEAT_OFF} (paging ${PAGED ? 'PRESENT' : 'ABSENT'} in source)\n`,
);
const out = { vw: VW, vh: VH, drags: DRAGS, seed: SEED, PAGE_SPAN, PAGE_CYCLE, levels: {} };
const rows = [];
for (const [lv, label] of LEVELS) {
  const b = run(lv, 'before', DRAGS);
  const f = run(lv, 'frozen', DRAGS);
  const a = run(lv, 'after', DRAGS);
  out.levels[label] = { before: b, frozen: f, after: a };
  // the self-check: same path, and phase 0 adds only a constant, so the frozen
  // wheel must reproduce the pre-fix chooser exactly
  if (b.covered !== f.covered || b.onGlassEvictionsPerTick !== f.onGlassEvictionsPerTick)
    throw new Error(
      `${label}: frozen wheel diverged from the pre-fix chooser ` +
        `(covered ${b.covered} vs ${f.covered}, fades ${b.onGlassEvictionsPerTick} vs ${f.onGlassEvictionsPerTick})`,
    );
  rows.push([
    label,
    String(b.tierSize),
    `${b.covered} (${b.pct}%)`,
    `${a.covered} (${a.pct}%)`,
    `${b.onGlassEvictionsPerTick} / ${b.centreEvictionsPerTick}`,
    `${f.onGlassEvictionsPerTick} / ${f.centreEvictionsPerTick}`,
    `${a.onGlassEvictionsPerTick} / ${a.centreEvictionsPerTick}`,
  ]);
}
const header = [
  'tide',
  'tier',
  'covered BEFORE',
  'covered AFTER',
  'fades glass/centre BEFORE',
  'wheel FROZEN',
  'wheel TURNING',
];
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (c) => c.map((x, i) => x.padEnd(widths[i])).join('  ');
console.log(line(header));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const r of rows) console.log(line(r));
console.log(
  `\npan distance travelled: ${out.levels.N1.after.travelled} world px ` +
    `(${(out.levels.N1.after.travelled / PAGE_CYCLE).toFixed(1)} full paging cycles, ` +
    `${(out.levels.N1.after.travelled / VH).toFixed(0)} screen-heights)`,
);

/* ------------------------------------------------------------ hold still
 * The trance claim the fix rests on: the wheel is turned by the pan odometer
 * and by nothing else, so a camera that is not moving cannot re-sort the field
 * no matter how long refreshActive keeps ticking. Run 600 ticks with the finger
 * off the glass and count evictions. */
function holdStill(level, ticks) {
  const z = 1;
  const halfW = (VW / 2 + PAD) / z;
  const halfH = (VH / 2 + PAD) / z;
  const cam = { x: WR.w / 2, y: WR.h / 2 };
  let phase = 0.371; // mid-rotation, so this is not a special case of phase=0
  let odoX = cam.x;
  let odoY = cam.y;
  const base = WORDS.map((wr) => {
    const lm = Math.abs(wr.lvl - level);
    return (lm === 0 ? 8 : lm === 1 ? 2.4 : 0) + (wr.fragile ? 0.8 : 0);
  });
  let active = null;
  let evictions = 0;
  for (let t = 0; t < ticks; t++) {
    // the frame loop still runs camClamp every frame with the camera at rest
    const d = Math.hypot(cam.x - odoX, cam.y - odoY);
    if (d < 200) phase = (phase + d / PAGE_CYCLE) % 1;
    odoX = cam.x;
    odoY = cam.y;
    const vis = [];
    for (let i = 0; i < WORDS.length; i++) {
      const wr = WORDS[i];
      if (
        wr.wx > cam.x - halfW &&
        wr.wx < cam.x + halfW &&
        wr.wy > cam.y - halfH &&
        wr.wy < cam.y + halfH
      )
        vis.push(i);
    }
    vis.sort(
      (a, b) =>
        base[b] + PAGE_SPAN * ((WORDS[b].h01 - phase + 1) % 1) -
        (base[a] + PAGE_SPAN * ((WORDS[a].h01 - phase + 1) % 1)),
    );
    const target = new Set(vis.slice(0, CAP));
    if (active) for (const i of active) if (!target.has(i)) evictions++;
    active = target;
  }
  return evictions;
}
const stillRows = LEVELS.map(([lv, label]) => [label, String(holdStill(lv, 600))]);
out.holdStill = Object.fromEntries(stillRows);
console.log(
  `\nhold-still (600 refreshActive ticks, finger off the glass, phase pinned mid-rotation):\n  ` +
    stillRows.map(([l, n]) => `${l} evictions=${n}`).join(' · '),
);

if (OUT) {
  writeFileSync(resolve(HERE, OUT), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${OUT}`);
}
