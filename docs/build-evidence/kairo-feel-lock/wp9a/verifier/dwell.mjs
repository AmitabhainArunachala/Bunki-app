// VERIFIER, adversarial: is the AFTER coverage real reading time, or a flicker?
// For each mounted appearance, measure how many consecutive 650ms ticks the word
// stays live DOM. If the wheel buys coverage by flashing words for one tick, the
// "98.7% reachable" would be worthless.
import { chromium } from 'playwright-core';
const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  }),
);
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
pg.on('pageerror', (e) => errs.push(String(e)));
await pg.goto('file://' + argv.file);
await pg.waitForTimeout(1200);
await pg.evaluate((L) => {
  if (level !== L) {
    level = L;
    tideChange();
  }
}, +argv.level);
await pg.waitForTimeout(700);
const r = await pg.evaluate(
  async ({ ROUNDS, SEED, LEVEL, PIN }) => {
    let s = SEED >>> 0;
    const rnd = () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
    const live = () => {
      const o = new Set();
      for (const wr of ACTIVE) {
        const n = wr.node;
        if (!n || n.removed || n.gone || !n.el || !n.el.isConnected) continue;
        if ((wr.e[5] || 3) !== LEVEL) continue;
        o.add(wr.e[0]);
      }
      return o;
    };
    const open = new Map(); // word -> ticks so far in this appearance
    const runs = [];
    let prev = new Set();
    for (let r0 = 0; r0 < ROUNDS; r0++) {
      if (PIN && typeof pagePhase !== 'undefined') pagePhase = 0;
      const ang = rnd() * Math.PI * 2,
        dist = 40 + rnd() * 320;
      const sx = (Math.cos(ang) * dist) / 6,
        sy = (Math.sin(ang) * dist) / 6;
      for (let k = 0; k < 6; k++) {
        cam.x += sx;
        cam.y += sy;
        camClamp();
      }
      if (PIN && typeof pagePhase !== 'undefined') pagePhase = 0;
      refreshActive();
      const now = live();
      for (const w of now) open.set(w, (open.get(w) || 0) + 1);
      for (const w of prev)
        if (!now.has(w)) {
          runs.push(open.get(w) || 1);
          open.delete(w);
        }
      prev = now;
      if (r0 % 25 === 0) await new Promise((f) => setTimeout(f, 0));
    }
    runs.sort((a, c) => a - c);
    const q = (p) => runs[Math.floor(runs.length * p)] || 0;
    return {
      appearances: runs.length,
      oneTickShare: +(runs.filter((x) => x === 1).length / runs.length).toFixed(3),
      p25: q(0.25),
      median: q(0.5),
      p75: q(0.75),
      p95: q(0.95),
      mean: +(runs.reduce((a, c) => a + c, 0) / runs.length).toFixed(2),
      meanSeconds: +((runs.reduce((a, c) => a + c, 0) / runs.length) * 0.65).toFixed(2),
    };
  },
  { ROUNDS: +(argv.rounds || 1200), SEED: 12345, LEVEL: +argv.level, PIN: !!argv.pin },
);
console.log(
  (argv.file.split('/').pop() + (argv.pin ? ' [pinned]' : '')).padEnd(32),
  'N' + argv.level,
  JSON.stringify(r),
  'errs',
  errs.length,
);
await b.close();
