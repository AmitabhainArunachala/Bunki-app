// VERIFIER's own dump: read the source's own globals out of a real page.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const file = process.argv[2];
const out = process.argv[3];
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = [];
pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
pg.on('console', (m) => {
  if (m.type() === 'error') errs.push('console: ' + m.text());
});
await pg.goto('file://' + file);
await pg.waitForTimeout(1500);
const d = await pg.evaluate(() => ({
  wall: WALL.map((e) => [e[0], e[3], e[5]]),
  words: WORDS.map((w) => [w.e[0], w.wx, w.wy, w.pri, typeof w.h01 === 'number' ? w.h01 : null]),
  WR: { w: WR.w, h: WR.h },
  cam: { ...cam },
  level,
  vw: innerWidth,
  vh: innerHeight,
  hasPage: typeof pagePhase !== 'undefined',
  store: JSON.parse(JSON.stringify(store)),
  activeCount: ACTIVE.size,
}));
fs.writeFileSync(out, JSON.stringify({ ...d, errs }));
console.log(
  'WALL',
  d.wall.length,
  'WORDS',
  d.words.length,
  'WR',
  d.WR,
  'vw/vh',
  d.vw,
  d.vh,
  'level',
  d.level,
  'paging?',
  d.hasPage,
  'ACTIVE',
  d.activeCount,
  'errs',
  errs.length,
);
if (errs.length) console.log(errs.slice(0, 10));
await b.close();
