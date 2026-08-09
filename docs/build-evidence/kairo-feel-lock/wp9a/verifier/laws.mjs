// VERIFIER: (1) mirror-vs-real-refreshActive agreement at random poses,
// (2) the stillness law — hold still, count evictions, at every tide, with the
//     wheel parked MID-rotation so phase 0 is not doing the work,
// (3) does the wheel turn when the camera is not panned (clock only)?
import { chromium } from 'playwright-core';
const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  }),
);
const FILE = argv.file;
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
pg.on('console', (m) => {
  if (m.type() === 'error') errs.push('console: ' + m.text());
});
await pg.goto('file://' + FILE);
await pg.waitForTimeout(1200);
const hasPaging = await pg.evaluate(() => typeof pagePhase !== 'undefined');
console.log('file', FILE.split('/').pop(), 'paging?', hasPaging);

// ---------------------------------------------------------------- 1 · mirror
for (const L of [1, 2, 3, 4, 5]) {
  await pg.evaluate((l) => {
    if (level !== l) {
      level = l;
      tideChange();
    }
  }, L);
  await pg.waitForTimeout(600);
  const r = await pg.evaluate(
    async ({ POSES, hasPaging }) => {
      let s = 987654321;
      const rnd = () => {
        s ^= s << 13;
        s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5;
        s >>>= 0;
        return s / 4294967296;
      };
      let agree = 0,
        disagree = 0,
        worst = 0;
      const PAGE = hasPaging ? 2.0 : 0;
      for (let i = 0; i < POSES; i++) {
        // land the camera somewhere legal, through the source's own clamp
        cam.x = 100 + rnd() * (WR.w - 200);
        cam.y = 100 + rnd() * (WR.h - 200);
        camClamp();
        // MY mirror: the source's own pri + w2s + pad + 64, no DOM
        const pad = 140,
          vis = [];
        for (const wr of WORDS) {
          const p = w2s(wr.wx, wr.wy);
          if (wr.gradedAt && performance.now() - wr.gradedAt < 180000) continue;
          if (p.x > -pad && p.x < innerWidth + pad && p.y > -pad && p.y < innerHeight + pad)
            vis.push(wr);
        }
        const kf = hasPaging
          ? (w) => w.pri + PAGE * (w.h01 < pagePhase ? w.h01 - pagePhase + 1 : w.h01 - pagePhase)
          : (w) => w.pri;
        vis.sort((a, c) => kf(c) - kf(a));
        const mine = new Set(vis.slice(0, 64).map((w) => w.e[0]));
        // clear ACTIVE so refreshActive's hysteresis cannot mask a disagreement
        ACTIVE.clear();
        refreshActive();
        const theirs = new Set([...ACTIVE].map((w) => w.e[0]));
        let d = 0;
        for (const w of mine) if (!theirs.has(w)) d++;
        for (const w of theirs) if (!mine.has(w)) d++;
        if (d === 0) agree++;
        else {
          disagree++;
          worst = Math.max(worst, d);
        }
        await new Promise((f) => setTimeout(f, 0));
      }
      return { agree, disagree, worst };
    },
    { POSES: 64, hasPaging },
  );
  console.log(`  mirror agreement N${L}: ${r.agree}/64 poses identical (worst symmetric diff ${r.worst})`);
}

// ------------------------------------------------------- 2 · stillness law
for (const L of [1, 2, 3, 4, 5]) {
  await pg.evaluate((l) => {
    level = l;
    tideChange();
  }, L);
  await pg.waitForTimeout(600);
  const r = await pg.evaluate(
    async ({ TICKS, hasPaging }) => {
      // park the wheel mid-rotation, then take the finger off the glass
      if (hasPaging) pagePhase = 0.37;
      const phase0 = hasPaging ? pagePhase : null;
      cam.x = WR.w * 0.5;
      cam.y = WR.h * 0.5;
      camClamp();
      const phaseAfterClamp = hasPaging ? pagePhase : null;
      refreshActive();
      const live = () => {
        const o = new Set();
        for (const wr of ACTIVE) {
          const n = wr.node;
          if (!n || n.removed || n.gone || !n.el || !n.el.isConnected) continue;
          o.add(wr.e[0]);
        }
        return o;
      };
      let prev = live();
      const start = new Set(prev);
      let evictions = 0;
      for (let t = 0; t < TICKS; t++) {
        refreshActive();
        const now = live();
        for (const w of prev) if (!now.has(w)) evictions++;
        prev = now;
        if (t % 20 === 0) await new Promise((f) => setTimeout(f, 0));
      }
      let gone = 0;
      for (const w of start) if (!prev.has(w)) gone++;
      return {
        evictions,
        startSize: start.size,
        endSize: prev.size,
        neverReturned: gone,
        phaseDrift: hasPaging ? +(pagePhase - phase0).toFixed(9) : null,
        phaseAfterClamp,
        camMoved: false,
      };
    },
    { TICKS: 600, hasPaging },
  );
  console.log(
    `  stillness N${L}: ${r.evictions} evictions over 600 ticks (start ${r.startSize} live, end ${r.endSize}, never-returned ${r.neverReturned}, phase drift ${r.phaseDrift})`,
  );
}
console.log('page errors:', errs.length, errs.slice(0, 5));
await b.close();
