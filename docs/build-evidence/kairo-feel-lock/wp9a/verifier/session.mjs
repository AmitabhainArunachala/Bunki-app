// VERIFIER's own long-pan browser session. Counts DISTINCT words that become
// REAL, CONNECTED DOM with the right text, driving the camera through the
// source's OWN camClamp so the source's own odometer (if any) turns.
//
// node session.mjs --file=<html> --level=1 --rounds=N [--pin] [--still] [--seed=k]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  }),
);
const FILE = argv.file;
const LEVEL = +(argv.level || 1);
const ROUNDS = +(argv.rounds || 1500);
const SEED = +(argv.seed || 12345);
const PIN = !!argv.pin;
const STILL = !!argv.still;

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
pg.on('console', (m) => {
  if (m.type() === 'error') errs.push('console: ' + m.text());
});
await pg.goto('file://' + FILE);
await pg.waitForTimeout(1200);

// set the tide exactly the way the tide slider does
await pg.evaluate((L) => {
  if (typeof level !== 'undefined' && level !== L) {
    level = L;
    tideChange();
  }
}, LEVEL);
await pg.waitForTimeout(700);

const hasPaging = await pg.evaluate(() => typeof pagePhase !== 'undefined');
if (PIN && !hasPaging) throw new Error('--pin on a source with no wheel');

const res = await pg.evaluate(
  async ({ ROUNDS, SEED, LEVEL, PIN, STILL, hasPaging }) => {
    // xorshift so the walk is reproducible and mine, not the page's Math.random
    let s = SEED >>> 0;
    const rnd = () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
    const seen = new Set();
    const trace = [];
    let panPx = 0,
      evictions = 0,
      onGlassFades = 0,
      centreFades = 0,
      ticks = 0;
    let prevLive = new Set();

    const liveNow = () => {
      const out = new Set();
      for (const wr of ACTIVE) {
        const nd = wr.node;
        if (!nd || nd.removed || nd.gone) continue;
        const el = nd.el;
        if (!el || !el.isConnected) continue;
        const base = el.querySelector('.base');
        if (!base || base.textContent !== wr.e[0]) continue;
        out.add(wr.e[0]);
      }
      return out;
    };
    const wrOf = (w) => WORDIX[w];

    for (let r = 0; r < ROUNDS; r++) {
      if (PIN && hasPaging) pagePhase = 0;
      if (!STILL) {
        // one finger-drag, delivered in 6 sub-steps so camClamp/odometer see
        // honest increments — exactly how the real pointermove handler feeds it
        const ang = rnd() * Math.PI * 2;
        const dist = 40 + rnd() * 320;
        const stepx = (Math.cos(ang) * dist) / 6,
          stepy = (Math.sin(ang) * dist) / 6;
        for (let k = 0; k < 6; k++) {
          const bx = cam.x,
            by = cam.y;
          cam.x += stepx;
          cam.y += stepy;
          camClamp();
          panPx += Math.hypot(cam.x - bx, cam.y - by);
        }
      }
      if (PIN && hasPaging) pagePhase = 0;
      refreshActive();
      ticks++;
      const live = liveNow();
      // a word that was live and is no longer, while its world point is STILL
      // inside the viewport, is an on-glass fade (an eviction, not a pan-off)
      for (const w of prevLive) {
        if (!live.has(w)) {
          evictions++;
          const wr = wrOf(w);
          if (wr) {
            const p = w2s(wr.wx, wr.wy);
            if (p.x > 0 && p.x < innerWidth && p.y > 0 && p.y < innerHeight) {
              onGlassFades++;
              // the CENTRE HALF of the glass — the middle 50% on each axis
              if (
                p.x > innerWidth * 0.25 &&
                p.x < innerWidth * 0.75 &&
                p.y > innerHeight * 0.25 &&
                p.y < innerHeight * 0.75
              )
                centreFades++;
            }
          }
        }
      }
      prevLive = live;
      for (const w of live) seen.add(w);
      if (r % 50 === 0)
        trace.push({
          r,
          panPx: Math.round(panPx),
          phase: hasPaging ? +pagePhase.toFixed(5) : null,
          seenAtLevel: [...seen].filter((w) => WORDIX[w] && (WORDIX[w].e[5] || 3) === LEVEL).length,
        });
      // let the DOM settle so removeNode's timers run like the real page
      if (r % 25 === 0) await new Promise((f) => setTimeout(f, 0));
    }
    const tier = WALL.filter((e) => (e[5] || 3) === LEVEL).length;
    const seenLevel = [...seen].filter((w) => WORDIX[w] && (WORDIX[w].e[5] || 3) === LEVEL);
    return {
      tier,
      distinctAtLevel: seenLevel.length,
      distinctAll: seen.size,
      panPx: Math.round(panPx),
      turns: hasPaging ? +(panPx / 40000).toFixed(2) : null,
      finalPhase: hasPaging ? +pagePhase.toFixed(5) : null,
      ticks,
      evictions,
      onGlassFades,
      centreFades,
      perTickWhole: +(onGlassFades / ticks).toFixed(3),
      perTickCentre: +(centreFades / ticks).toFixed(3),
      perSecWhole: +(onGlassFades / ticks / 0.65).toFixed(3),
      perSecCentre: +(centreFades / ticks / 0.65).toFixed(3),
      trace,
      sample: seenLevel.slice(0, 5),
    };
  },
  { ROUNDS, SEED, LEVEL, PIN, STILL, hasPaging },
);

console.log(
  JSON.stringify(
    {
      file: FILE.split('/').pop(),
      level: LEVEL,
      rounds: ROUNDS,
      pinned: PIN,
      still: STILL,
      hasPaging,
      ...res,
      trace: undefined,
      pageErrors: errs.length,
    },
    null,
    1,
  ),
);
console.log('trace:', JSON.stringify(res.trace));
if (errs.length) console.log('ERRS', errs.slice(0, 10));
if (argv.out) fs.writeFileSync(argv.out, JSON.stringify({ argv, res, errs }));
await b.close();
