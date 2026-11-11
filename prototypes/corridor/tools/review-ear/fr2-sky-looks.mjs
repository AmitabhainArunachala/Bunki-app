// Re-check, round 2 (K5): the ear's mark at rest on the sky, in every look the app has (the sky follows the look:
// mount.mjs setLook on data-theme). The measure is the builder's own (tools/ear-sky.mjs look): the glyph's most distant
// pixel from the mark's ground, against that ground. Chromium on the graphics card, ?sky=1, 1728 x 1117, muted, loopback.
//   node fr2-sky-looks.mjs [--engine chromium]
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arg, open, reporter } from './lib.mjs';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { PNG } = require('pngjs');
const OUT = process.env.REVIEW_OUT || '.';
const { rows, record } = reporter('chromium-metal-1728');
const LOOKS = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku'];
const s = await open({ engine: 'chromium', width: 1728, clipSeconds: () => 1, voicePort: Number(arg('--voice-port', '19532')), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const { page } = s;
function luminance([r, g, b]) { const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); }
const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
async function measure(selector) {
  const r = await page.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, selector);
  const png = PNG.sync.read(await page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } }));
  const px = (x, y) => { const o = (Math.round(y) * png.width + Math.round(x)) * 4; return [png.data[o], png.data[o + 1], png.data[o + 2]]; };
  const cx = r.w / 2, cy = r.h / 2, glyph = [], ground = [];
  for (let y = -8; y <= 8; y += 1) for (let x = -8; x <= 8; x += 1) glyph.push(px(cx + x, cy + y));
  for (let y = -13; y <= 13; y += 1) for (let x = -13; x <= 13; x += 1) if (Math.max(Math.abs(x), Math.abs(y)) >= 11) ground.push(px(cx + x, cy + y));
  const byLum = (list) => list.map((c) => [luminance(c), c]).sort((a, b) => a[0] - b[0]);
  const g = byLum(ground), groundMid = g[Math.floor(g.length / 2)][1], mid = luminance(groundMid);
  const ink = byLum(glyph).reduce((best, cur) => (Math.abs(cur[0] - mid) > Math.abs(best[0] - mid) ? cur : best))[1];
  return { ink, ground: groundMid, contrast: ratio(ink, groundMid) };
}
try {
  await s.ready('sky=1');
  await page.waitForFunction(() => window.__bunkiSkyApp?.state === 'mounted' && window.__SKY__?.W?.ready, null, { timeout: 45000 });
  await s.sleep(2500);
  for (const look of LOOKS) {
    await page.evaluate((look) => { if (look === 'hokusai') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', look); }, look);
    await s.sleep(2200);
    const state = await page.evaluate(() => ({ ear: document.documentElement.dataset.ear, sky: document.documentElement.dataset.bunkiSky }));
    const m = await measure('#ginga-symbol + .ear-spot .ear-mark');
    const shot = await page.evaluate(() => { const b = document.querySelector('#ginga-symbol + .ear-spot .ear-mark').getBoundingClientRect(); return { x: b.left - 90, y: Math.max(0, b.top - 6), width: b.width + 180, height: b.height + 12 }; });
    writeFileSync(`${OUT}/fr2-sky-look-${look}.png`, await page.screenshot({ clip: shot }));
    record(`look ${look}: the mark at rest stands out from its ground (3:1 or more)`, m.contrast >= 3 ? [] : [`${m.contrast.toFixed(2)}:1`],
      `ear ${state.ear}, sky ${state.sky}; rgb(${m.ink.join(',')}) on rgb(${m.ground.join(',')}): ${m.contrast.toFixed(2)}:1`);
  }
} catch (error) {
  record('the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
}
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`chromium-metal-1728: ${rows.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
