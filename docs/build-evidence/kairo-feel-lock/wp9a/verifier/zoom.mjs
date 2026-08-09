// VERIFIER: two honesty claims about the odometer —
//  (a) "the wheel does not turn on zoom"  (pinch about an off-centre midpoint
//      moves cam.x/cam.y, which camClamp feeds to the odometer)
//  (b) the 200px teleport guard: at low zoom a fast drag exceeds it, so the
//      odometer silently drops that pan.
import { chromium } from 'playwright-core';
const FILE = process.argv[2];
const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
await pg.goto('file://' + FILE);
await pg.waitForTimeout(1200);
const r = await pg.evaluate(() => {
  const out = {};
  // (a) a full pinch-in about a point 150px off-centre, in 40 steps
  pagePhase = 0;
  cam.x = WR.w / 2;
  cam.y = WR.h / 2;
  cam.z = 1;
  cam.rot = 0;
  camClamp();
  const p0 = pagePhase;
  const mid = { x: innerWidth / 2 + 150, y: innerHeight / 2 + 150 };
  for (let i = 0; i < 40; i++) {
    const w1 = s2wl(mid.x, mid.y);
    cam.z = Math.min(2.6, cam.z * 1.025);
    const w2 = s2wl(mid.x, mid.y);
    cam.x += w1.x - w2.x;
    cam.y += w1.y - w2.y;
    camClamp();
  }
  out.zoomPhaseTurn = +(pagePhase - p0).toFixed(6);
  out.zoomEnd = +cam.z.toFixed(3);

  // (b) the guard: how big a SCREEN delta is dropped, per zoom level
  out.guard = {};
  for (const z of [0.34, 0.5, 1, 2.6]) {
    cam.z = z;
    // camClamp's odometer discards a step of >=200 world px; one pointermove
    // of screen delta D at zoom z moves the camera D/z world px
    out.guard['z=' + z] = +(200 * z).toFixed(1); // screen px at which it drops
  }

  // (b') measured: a fast flick at min zoom
  cam.z = 0.34;
  cam.x = WR.w / 2;
  cam.y = WR.h / 2;
  camClamp();
  pagePhase = 0;
  let asked = 0;
  for (let i = 0; i < 60; i++) {
    // 90 screen px per pointermove — a brisk but ordinary flick
    const d = 90 / cam.z;
    const bx = cam.x;
    cam.x += d;
    camClamp();
    asked += Math.abs(cam.x - bx);
  }
  out.fastFlickAtMinZoom = {
    worldPxTravelled: Math.round(asked),
    phaseTurned: +pagePhase.toFixed(6),
    expectedIfCounted: +(asked / 40000).toFixed(6),
  };
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();
