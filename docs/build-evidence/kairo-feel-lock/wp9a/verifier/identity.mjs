// VERIFIER: independent check of (1) tier sizes, (2) the pri/h01 algebra,
// (3) the phase-0 ordering identity, (4) the own-level-outranks bound.
import fs from 'node:fs';
const B = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/v/';
const fx = JSON.parse(fs.readFileSync(B + 'fixed.json', 'utf8'));
const px = JSON.parse(fs.readFileSync(B + 'prefix.json', 'utf8'));

// --- tier sizes -------------------------------------------------------------
const lvCount = {};
for (const [, , L] of fx.wall) lvCount[L] = (lvCount[L] || 0) + 1;
console.log('WALL size (fixed):', fx.wall.length, 'per level:', lvCount);
const lvCountP = {};
for (const [, , L] of px.wall) lvCountP[L] = (lvCountP[L] || 0) + 1;
console.log('WALL size (prefix):', px.wall.length, 'per level:', lvCountP);
console.log(
  'WALL identical across arms:',
  JSON.stringify(fx.wall) === JSON.stringify(px.wall),
);
console.log(
  'world coords identical across arms:',
  JSON.stringify(fx.words.map((w) => [w[0], w[1], w[2]])) ===
    JSON.stringify(px.words.map((w) => [w[0], w[1], w[2]])),
);

// --- strHash, reimplemented from the source ---------------------------------
const strHash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const fragile = new Map(fx.wall.map((e) => [e[0], e[1] === 'f']));
const lvl = new Map(fx.wall.map((e) => [e[0], e[2]]));

// --- the OLD pri and the NEW (pri, h01), recomputed by me -------------------
function oldPri(w, level, unknown) {
  const lm = Math.abs(lvl.get(w) - level);
  return (
    (lm === 0 ? 8 : lm === 1 ? 2.4 : 0) +
    (unknown[w] ? 1.6 : 0) +
    (fragile.get(w) ? 0.8 : 0) +
    ((strHash(w) >> 2) % 100) / 100
  );
}
function newPri(w, level, unknown) {
  const lm = Math.abs(lvl.get(w) - level);
  return (lm === 0 ? 8 : lm === 1 ? 2.4 : 0) + (unknown[w] ? 1.6 : 0) + (fragile.get(w) ? 0.8 : 0);
}
const h01 = (w) => ((strHash(w) >> 2) % 100) / 200 + 0.5;

// cross-check my recomputation against what the two real pages hold
let bad = 0,
  badH = 0;
for (const [w, , , pri, h] of px.words) if (oldPri(w, px.level, px.store.unknown) !== pri) bad++;
for (const [w, , , pri, h] of fx.words) {
  if (newPri(w, fx.level, fx.store.unknown) !== pri) bad++;
  if (h01(w) !== h) badH++;
}
console.log('my recomputation vs live pages — pri mismatches:', bad, ' h01 mismatches:', badH);

// --- the tie-break's true range ---------------------------------------------
const T = fx.wall.map((e) => ((strHash(e[0]) >> 2) % 100) / 100);
console.log(
  'old tie-break range: [',
  Math.min(...T),
  ',',
  Math.max(...T),
  '] distinct seats:',
  new Set(T).size,
  ' negative share:',
  (T.filter((t) => t < 0).length / T.length).toFixed(3),
);
const H = fx.wall.map((e) => h01(e[0]));
console.log('h01 range: [', Math.min(...H), ',', Math.max(...H), '] all in [0,1):',
  H.every((h) => h >= 0 && h < 1));

// --- the claimed identity 2*h01 == oldTieBreak + 1 --------------------------
let maxDev = 0;
for (const e of fx.wall) {
  const w = e[0];
  const dev = Math.abs(2 * h01(w) - (((strHash(w) >> 2) % 100) / 100 + 1));
  if (dev > maxDev) maxDev = dev;
}
console.log('max |2*h01 - (oldTieBreak+1)| over', fx.wall.length, 'words =', maxDev);

// --- the ORDERING identity, which is what actually matters ------------------
// pageOf at phase 0, from the source
const PAGE_SPAN = 2.0;
const pageOf0 = (w) => (h01(w) < 0 ? h01(w) + 1 : h01(w));
function checkOrdering(level, unknown, label) {
  // full tier, and then 400 random viewport-sized subsets, sorted both ways
  const all = fx.wall.map((e) => e[0]);
  const cmpOld = (a, b) => oldPri(b, level, unknown) - oldPri(a, level, unknown);
  const cmpNew = (a, b) =>
    newPri(b, level, unknown) + PAGE_SPAN * pageOf0(b) -
    (newPri(a, level, unknown) + PAGE_SPAN * pageOf0(a));
  let fails = 0,
    top64fails = 0;
  const trial = (list) => {
    const A = list.slice().sort(cmpOld);
    const Bs = list.slice().sort(cmpNew);
    if (A.join('') !== Bs.join('')) fails++;
    if (A.slice(0, 64).join('') !== Bs.slice(0, 64).join('')) top64fails++;
  };
  trial(all);
  // random subsets in original WORDS order (that is the order refreshActive builds vis in)
  const order = fx.words.map((w) => w[0]);
  for (let i = 0; i < 400; i++) {
    const n = 80 + Math.floor(Math.random() * 900);
    const start = Math.floor(Math.random() * (order.length - n));
    trial(order.slice(start, start + n));
  }
  console.log(
    `ordering identity ${label}: full-list+400 random slices — permutation mismatches: ${fails}, top-64 mismatches: ${top64fails}`,
  );
}
checkOrdering(3, {}, 'tide N3, fresh store');
for (const L of [1, 2, 3, 4, 5]) checkOrdering(L, {}, `tide N${L}, fresh store`);
// with judgments set on a random 15% of words
const unk = {};
for (const e of fx.wall) if (Math.random() < 0.15) unk[e[0]] = 1;
for (const L of [1, 5]) checkOrdering(L, unk, `tide N${L}, 15% marked unknown`);

// --- the level-band bound ---------------------------------------------------
function bounds(level, unknown) {
  let ownMin = Infinity,
    nearMax = -Infinity,
    ownMinNew = Infinity,
    nearMaxNew = -Infinity;
  for (const e of fx.wall) {
    const w = e[0],
      lm = Math.abs(lvl.get(w) - level);
    const o = oldPri(w, level, unknown);
    const n = newPri(w, level, unknown) + PAGE_SPAN * 0.999; // worst-case page term
    const nlo = newPri(w, level, unknown) + 0; // best-case
    if (lm === 0) {
      ownMin = Math.min(ownMin, o);
      ownMinNew = Math.min(ownMinNew, nlo);
    } else if (lm === 1) {
      nearMax = Math.max(nearMax, o);
      nearMaxNew = Math.max(nearMaxNew, n);
    }
  }
  return { ownMin, nearMax, ownMinNew, nearMaxNew };
}
// worst case: every word marked unknown
const allUnk = {};
for (const e of fx.wall) allUnk[e[0]] = 1;
for (const L of [1, 3, 5]) {
  const b = bounds(L, allUnk);
  console.log(
    `tide N${L} (all words marked unknown, worst case) — OLD own-min ${b.ownMin.toFixed(3)} vs near-max ${b.nearMax.toFixed(3)} => ${b.ownMin > b.nearMax}; NEW own-min ${b.ownMinNew.toFixed(3)} vs near-max ${b.nearMaxNew.toFixed(3)} => ${b.ownMinNew > b.nearMaxNew}`,
  );
}
