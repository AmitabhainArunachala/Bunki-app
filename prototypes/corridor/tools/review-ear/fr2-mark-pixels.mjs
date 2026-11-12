// Re-check, round 2 (K5): off the sky the mark at rest must be unchanged. The same crops of the mark at rest, taken from
// this head and from 7a7715f78 (each served on its own port), compared pixel by pixel: Today's bar at 390 (touch) and the
// old first screen at 1728 (a driven browser keeps it). Headless Chromium, muted, loopback, nothing paired.
// Since the lead's ruling of 2026-11-12 (one language of states) the mark at rest is meant to change: it looks like the
// gate beside it, in that gate's ink, plate and hairline, wherever it stands. The pin is now that rule: on each screen the
// mark's glyph takes the gate's ink and its plate the gate's plate (within 2 of 255 a channel), and its glyph against
// what it stands on holds 3:1. The crops are still taken from both heads and kept, for the eye.
//   HEAD=http://127.0.0.1:19530/ BASE=http://127.0.0.1:19531/ node fr2-mark-pixels.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { chromium } from '../../../../node_modules/playwright-core/index.mjs';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { PNG } = require('pngjs');
const OUT = process.env.REVIEW_OUT || '.';
const sites = { head: process.env.HEAD || 'http://127.0.0.1:19530/', base: process.env.BASE || '' };
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1 , EXCLUDE localhost'] });
async function crop(origin, screen) {
  const phone = screen === 'today-390';
  const page = await (await browser.newContext({ viewport: { width: phone ? 390 : 1728, height: phone ? 844 : 1117 }, deviceScaleFactor: 2, hasTouch: phone, isMobile: phone, serviceWorkers: 'block', reducedMotion: 'reduce' })).newPage();
  await page.addInitScript(() => { const p = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { this.muted = true; return p.call(this); }; });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
  if (phone) { await page.locator('#home-review').click().catch(() => {}); await page.locator('#tab-today').click(); }
  await page.waitForTimeout(2500);
  const sel = phone ? '#app > .chrome > .bar-gate + .ear-spot .ear-mark' : '#ginga-symbol + .ear-spot .ear-mark';
  const box = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }, sel);
  const png = await page.screenshot({ clip: box, animations: 'disabled' });
  const rule = await page.evaluate((sel) => {
    const m = document.querySelector(sel), gate = m.closest('.ear-spot').previousElementSibling, g = m.querySelector('.ear-glyph');
    const plate = (el) => { const b = getComputedStyle(el, '::before').backgroundColor; return b && b !== 'rgba(0, 0, 0, 0)' ? b : getComputedStyle(el).backgroundColor; };
    return { glyph: getComputedStyle(g).color, gateInk: getComputedStyle(gate).color, plate: getComputedStyle(m, '::before').backgroundColor, gatePlate: plate(gate) };
  }, sel);
  const css = await page.evaluate((sel) => { const m = document.querySelector(sel); const g = m.querySelector('.ear-glyph'); return `${getComputedStyle(g).color} | ${getComputedStyle(m, '::before').backgroundColor} | ${getComputedStyle(m, '::before').borderColor}`; }, sel);
  await page.context().close();
  return { png, css, rule };
}
const rgb = (t) => (String(t).match(/[\d.]+/gu) || []).map(Number);
const near = (a, b) => { const x = rgb(a), y = rgb(b); if (x.length < 3 || y.length < 3) return a === b; const ax = x[3] ?? 1, ay = y[3] ?? 1; return Math.abs(ax - ay) < 0.02 && (ax < 0.02 || [0, 1, 2].every((i) => Math.abs(x[i] - y[i]) <= 2)); };
let bad = 0;
for (const screen of ['today-390', 'door-1728']) {
  // the base (BASE) is optional now: its crop is only for the eye
  const a = await crop(sites.head, screen), b = sites.base ? await crop(sites.base, screen) : null;
  writeFileSync(`${OUT}/fr2-mark-${screen}-head.png`, a.png); if (b) writeFileSync(`${OUT}/fr2-mark-${screen}-base.png`, b.png);
  const A = PNG.sync.read(a.png), B = b ? PNG.sync.read(b.png) : null;
  let diff = 0;
  if (!B) diff = 'no base';
  else if (A.width !== B.width || A.height !== B.height) diff = -1;
  else for (let i = 0; i < A.data.length; i += 4) if (Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2])) > 2) diff += 1;
  const follows = near(a.rule.glyph, a.rule.gateInk) && near(a.rule.plate, a.rule.gatePlate);
  if (!follows) bad += 1;
  console.log(`${follows ? 'PASS' : 'FAIL'}  ${screen}: the mark at rest takes the gate's ink and plate: glyph ${a.rule.glyph} (gate ${a.rule.gateInk}), plate ${a.rule.plate} (gate ${a.rule.gatePlate}); pixels against the base differ at ${diff} of ${A.width * A.height} (expected, kept for the eye)`);
}
await browser.close();
process.exit(bad ? 1 : 0);
