// VERIFIER: the "a pile cannot be separated by panning" step of the argument.
import fs from 'node:fs';
const B = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/v/';
const fx = JSON.parse(fs.readFileSync(B + 'fixed.json', 'utf8'));
const lvl = new Map(fx.wall.map((e) => [e[0], e[2]]));
// window at z=1 (from camClamp + refreshActive's pad, recomputed): 670 x 1124 world px
const WINW = 390 + 2 * 140,
  WINH = 844 + 2 * 140;
console.log('visible window at z=1 (world px):', WINW, 'x', WINH);
console.log('hub jitter half-span: ±115 (single-hub) / ±172.5 (multi-hub) on each axis');
console.log('=> a jittered pile spans at most 345 x 345, inside a', WINW, 'x', WINH, 'window\n');

for (const L of [1, 2, 3, 4, 5]) {
  const pts = fx.words.filter(([w]) => lvl.get(w) === L).map(([w, x, y]) => ({ w, x, y }));
  // for every word, how many same-level words share ANY window containing it —
  // conservatively, how many lie within the window centred on it
  let over64 = 0,
    maxN = 0,
    sum = 0;
  for (const p of pts) {
    let n = 0;
    for (const q of pts)
      if (Math.abs(q.x - p.x) < WINW / 2 && Math.abs(q.y - p.y) < WINH / 2) n++;
    if (n > 64) over64++;
    maxN = Math.max(maxN, n);
    sum += n;
  }
  console.log(
    `N${L}: tier ${pts.length}; words whose own centred window already holds >64 same-level words: ${over64} (${((100 * over64) / pts.length).toFixed(1)}%); densest window ${maxN}; mean ${(sum / pts.length).toFixed(1)}`,
  );
}
