// VERIFIER's own static reachable-set sweep, written from the source, not from
// the implementer's script. Uses world coordinates read out of the REAL page and
// pri recomputed by me; replicates w2s / camClamp / refreshActive's filter+sort.
import fs from 'node:fs';
const B = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/v/';
const fx = JSON.parse(fs.readFileSync(B + 'fixed.json', 'utf8'));
const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  }),
);
const GRID = +(argv.grid || 240);
const Z = +(argv.z || 1);
const MODE = argv.mode || 'old'; // old | phase0 | phase
const PHASE = +(argv.phase || 0);

const strHash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const VW = 390,
  VH = 844,
  WRw = fx.WR.w,
  WRh = fx.WR.h;
const words = fx.words.map(([w, wx, wy]) => {
  const e = fx.wall.find; // unused
  return { w, wx, wy };
});
const meta = new Map(fx.wall.map((e) => [e[0], { f: e[1] === 'f', L: e[2] }]));
for (const o of words) Object.assign(o, meta.get(o.w));

function keysFor(level, phase) {
  for (const o of words) {
    const lm = Math.abs(o.L - level);
    const bandOnly = (lm === 0 ? 8 : lm === 1 ? 2.4 : 0) + 0 + (o.f ? 0.8 : 0);
    const T = ((strHash(o.w) >> 2) % 100) / 100;
    const h01 = ((strHash(o.w) >> 2) % 100) / 200 + 0.5;
    o.old = bandOnly + T;
    const pg = h01 < phase ? h01 - phase + 1 : h01 - phase;
    o.neu = bandOnly + 2.0 * pg;
  }
}

const mx = Math.min(WRw * 0.44, VW / (2 * Z) * 0.7);
const my = Math.min(WRh * 0.44, VH / (2 * Z) * 0.7);
const camLoX = mx,
  camHiX = WRw - mx,
  camLoY = my,
  camHiY = WRh - my;
const pad = 140;

function sweep(level, phase, useNew) {
  keysFor(level, phase);
  const key = useNew ? 'neu' : 'old';
  // pre-bucket by world position for speed: only words within the window matter
  const list = words.slice();
  const reach = new Set();
  const halfW = (VW / 2 + pad) / Z,
    halfH = (VH / 2 + pad) / Z;
  for (let i = 0; i < GRID; i++) {
    const cx = camLoX + ((camHiX - camLoX) * i) / (GRID - 1);
    // words whose wx is in range for this column
    const col = list.filter((o) => Math.abs(o.wx - cx) < halfW);
    col.sort((a, b) => a.wy - b.wy);
    for (let j = 0; j < GRID; j++) {
      const cy = camLoY + ((camHiY - camLoY) * j) / (GRID - 1);
      const vis = [];
      for (const o of col) {
        if (o.wy - cy <= -halfH) continue;
        if (o.wy - cy >= halfH) break;
        vis.push(o);
      }
      vis.sort((a, b) => b[key] - a[key]);
      const n = Math.min(64, vis.length);
      for (let k = 0; k < n; k++) if (vis[k].L === level) reach.add(vis[k].w);
    }
  }
  return reach;
}

const tiers = {};
for (const o of words) tiers[o.L] = (tiers[o.L] || 0) + 1;
const res = {};
for (const L of [1, 2, 3, 4, 5]) {
  const useNew = MODE !== 'old';
  const r = sweep(L, MODE === 'phase' ? PHASE : 0, useNew);
  res['N' + L] = { reachable: r.size, tier: tiers[L], pct: +((100 * r.size) / tiers[L]).toFixed(1) };
  res['N' + L + '_words'] = [...r];
  console.log(
    `N${L}  ${r.size} / ${tiers[L]}  (${((100 * r.size) / tiers[L]).toFixed(1)}%)   [mode=${MODE} grid=${GRID} z=${Z}]`,
  );
}
if (argv.out) fs.writeFileSync(argv.out, JSON.stringify(res));
