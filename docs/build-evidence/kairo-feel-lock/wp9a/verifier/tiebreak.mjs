// VERIFIER: is the phase-0 "exact identity" exact at the level of the CHOSEN SET,
// or only up to float tie-collapse?
import fs from 'node:fs';
const B = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/v/';
const fx = JSON.parse(fs.readFileSync(B + 'fixed.json', 'utf8'));
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
const band = (w, L, u) =>
  (Math.abs(lvl.get(w) - L) === 0 ? 8 : Math.abs(lvl.get(w) - L) === 1 ? 2.4 : 0) +
  (u[w] ? 1.6 : 0) +
  (fragile.get(w) ? 0.8 : 0);
const T = (w) => ((strHash(w) >> 2) % 100) / 100;
const h01 = (w) => ((strHash(w) >> 2) % 100) / 200 + 0.5;
const oldK = (w, L, u) =>
  (Math.abs(lvl.get(w) - L) === 0 ? 8 : Math.abs(lvl.get(w) - L) === 1 ? 2.4 : 0) +
  (u[w] ? 1.6 : 0) +
  (fragile.get(w) ? 0.8 : 0) +
  T(w);
const newK = (w, L, u) => band(w, L, u) + 2.0 * h01(w);

// How many DISTINCT float values does each key take, and does old->new merge/split ties?
function audit(L, u, label) {
  const ws = fx.wall.map((e) => e[0]);
  const om = new Map(),
    nm = new Map();
  for (const w of ws) {
    om.set(oldK(w, L, u), (om.get(oldK(w, L, u)) || 0) + 1);
    nm.set(newK(w, L, u), (nm.get(newK(w, L, u)) || 0) + 1);
  }
  // pairs that tie under old but not new, and vice versa
  let brokeTie = 0,
    madeTie = 0,
    inverted = 0;
  // group by nominal key to keep it O(n log n)-ish: compare consecutive in old order
  const sorted = ws.slice().sort((a, b) => oldK(b, L, u) - oldK(a, L, u));
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i],
      b = sorted[i + 1];
    const do_ = oldK(a, L, u) - oldK(b, L, u);
    const dn = newK(a, L, u) - newK(b, L, u);
    if (do_ === 0 && dn !== 0) brokeTie++;
    if (do_ !== 0 && dn === 0) madeTie++;
    if (do_ > 0 && dn < 0) inverted++;
    if (do_ < 0 && dn > 0) inverted++;
  }
  console.log(
    `${label}: distinct old keys ${om.size}, new keys ${nm.size}; adjacent pairs — ties broken by the fix ${brokeTie}, ties created ${madeTie}, true inversions ${inverted}`,
  );
}
audit(3, {}, 'N3 fresh');
const unk = {};
let i = 0;
for (const e of fx.wall) if (i++ % 7 === 0) unk[e[0]] = 1;
audit(3, unk, 'N3 ~14% unknown');

// Now the thing that actually matters: does the CHOSEN 64-SET ever differ?
function setDiff(L, u, trials) {
  const order = fx.words.map((w) => w[0]);
  let setDiffs = 0,
    orderDiffs = 0,
    worst = null,
    totalSwapped = 0;
  for (let t = 0; t < trials; t++) {
    const n = 80 + Math.floor(Math.random() * 900);
    const s = Math.floor(Math.random() * (order.length - n));
    const list = order.slice(s, s + n);
    const A = list.slice().sort((a, b) => oldK(b, L, u) - oldK(a, L, u)).slice(0, 64);
    const Bs = list.slice().sort((a, b) => newK(b, L, u) - newK(a, L, u)).slice(0, 64);
    const sa = new Set(A),
      sb = new Set(Bs);
    const only = [...sb].filter((x) => !sa.has(x));
    if (only.length) {
      setDiffs++;
      totalSwapped += only.length;
      if (!worst || only.length > worst.n)
        worst = { n: only.length, in: only, out: [...sa].filter((x) => !sb.has(x)) };
    } else if (A.join('') !== Bs.join('')) orderDiffs++;
  }
  console.log(
    `  tide N${L}: over ${trials} windows — chosen-SET differs in ${setDiffs}, same set different order in ${orderDiffs}; total words swapped ${totalSwapped}` +
      (worst ? `; worst window swapped ${worst.n}: in=${worst.in.slice(0, 3)} out=${worst.out.slice(0, 3)}` : ''),
  );
}
console.log('chosen-64 set comparison, fresh store:');
for (const L of [1, 2, 3, 4, 5]) setDiff(L, {}, 600);
console.log('chosen-64 set comparison, ~14% marked unknown:');
for (const L of [1, 3, 5]) setDiff(L, unk, 600);

// what exactly is the float story on one concrete broken tie?
const ws = fx.wall.map((e) => e[0]);
outer: for (const a of ws)
  for (const b of ws) {
    if (a === b) continue;
    if (oldK(a, 3, unk) === oldK(b, 3, unk) && newK(a, 3, unk) !== newK(b, 3, unk)) {
      console.log('example broken tie:', a, b);
      console.log('  bands', band(a, 3, unk), band(b, 3, unk), 'T', T(a), T(b));
      console.log('  oldK', oldK(a, 3, unk), oldK(b, 3, unk));
      console.log('  newK', newK(a, 3, unk), newK(b, 3, unk));
      console.log('  2*h01 - (T+1):', 2 * h01(a) - (T(a) + 1), 2 * h01(b) - (T(b) + 1));
      break outer;
    }
  }
