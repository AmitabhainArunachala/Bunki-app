// Review of the merged branch (hunt 6, the lead's ruling for the voice controls: "at rest a control looks like its
// neighbour (the 耳 like the gate button beside it)"). At rest, the 耳's plate and ink are measured on their pixels next to
// the gate's: the colour covering most of each button's inner square is its plate, the pixel of its glyph square furthest
// from that plate its ink (the builder's own measure, tools/verify-voice-legibility.mjs). The two plates must be alike
// and the two inks must be alike (plates under 1.5:1 apart; inks under 2.5:1 apart, since the gate's torii is drawn in thin
// SVG strokes that a browser lightens more than the 耳's type). The first screen (the sky, drawn on the graphics
// card: Chromium with --use-angle=metal, or headless WebKit) and, as the control, a reading page's bar.
//   node mark-like-gate.mjs --engine chromium|webkit [--width 1728|390] [--looks hokusai,sumi,yoru] [--where sky,bar]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { arg, dismissFirstLine, open, reporter } from '../review-ear/lib.mjs';

const require = createRequire(new URL('../../../../package.json', import.meta.url));
const { PNG } = require('pngjs');
const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '1728'));
const LOOKS = arg('--looks', 'hokusai,sumi,yoru').split(',');
const WHERE = arg('--where', 'sky,bar').split(',');
const OUT = process.env.REVIEW_OUT || '.';
const tag = `${ENGINE}-${WIDTH}`;
const { rows, record } = reporter(tag);
const s = await open({ engine: ENGINE, width: WIDTH, pair: false, voicePort: Number(arg('--voice-port', '19612')),
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const { page } = s;
const lum = ([r, g, b]) => { const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); };
const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
async function measure(selector, name) {
  const r = await page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, selector);
  if (!r || !r.w) return null;
  const buf = await page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
  writeFileSync(`${OUT}/like-gate-${tag}-${name}.png`, buf);
  const png = PNG.sync.read(buf), k = png.width / r.w;
  const px = (x, y) => { const o = (Math.round(y * k) * png.width + Math.round(x * k)) * 4; return [png.data[o], png.data[o + 1], png.data[o + 2]]; };
  // the plate: the commonest colour (in 16-step buckets) of the inner square between the glyph and the edge
  const counts = new Map(), cx = r.w / 2, cy = r.h / 2;
  for (let y = -12; y <= 12; y += 1) for (let x = -12; x <= 12; x += 1) {
    if (Math.max(Math.abs(x), Math.abs(y)) < 9) continue;
    const c = px(cx + x, cy + y), key = c.map((v) => v >> 4).join();
    const e = counts.get(key) || { n: 0, c }; e.n += 1; counts.set(key, e);
  }
  const plate = [...counts.values()].sort((a, b) => b.n - a.n)[0].c;
  let ink = plate;
  for (let y = -6; y <= 6; y += 1) for (let x = -6; x <= 6; x += 1) { const c = px(cx + x, cy + y); if (Math.abs(lum(c) - lum(plate)) > Math.abs(lum(ink) - lum(plate))) ink = c; }
  return { plate, ink };
}
const show = (m) => `ink rgb(${m.ink.join(',')}) on plate rgb(${m.plate.join(',')})`;
async function compare(where, look) {
  const gateSel = where === 'sky' ? '#ginga-symbol' : '#app > .chrome > .bar-gate';
  const earSel = where === 'sky' ? '#ginga-symbol + .ear-spot .ear-mark' : '#app > .chrome > .bar-gate + .ear-spot .ear-mark';
  const gate = await measure(gateSel, `${where}-${look}-gate`), ear = await measure(earSel, `${where}-${look}-ear`);
  if (!gate || !ear) { record(`${where}, ${look}: the gate and the 耳 at rest`, ['a button was not found']); return; }
  const plates = ratio(gate.plate, ear.plate), inks = ratio(gate.ink, ear.ink);
  const problems = [];
  if (plates >= 1.5) problems.push(`the plates differ ${plates.toFixed(2)}:1`);
  if (inks >= 2.5) problems.push(`the inks differ ${inks.toFixed(2)}:1`);
  record(`${where}, ${look}: at rest the 耳 looks like the gate beside it`, problems, `gate ${show(gate)}; 耳 ${show(ear)}; ear ${await page.evaluate(() => document.documentElement.dataset.ear)}`);
}
try {
  for (const look of LOOKS) {
    for (const where of WHERE) {
      if (where === 'sky') {
        await s.ready('sky=1');
        await page.evaluate((look) => { if (look === 'hokusai') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', look); }, look);
        const ok = await page.waitForFunction(() => window.__bunkiSkyApp?.state === 'mounted' && window.__SKY__?.W?.ready, null, { timeout: 45000 }).then(() => true, () => false);
        if (!ok) { record(`sky, ${look}`, [`the sky did not mount: ${await page.evaluate(() => JSON.stringify(window.__bunkiSkyApp))}`]); continue; }
        await s.sleep(2500);
      } else {
        await s.ready();
        await page.evaluate((look) => { if (look === 'hokusai') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', look); }, look);
        await s.press('#home-review').catch(() => {});
        await page.locator('#tab-today').waitFor();
        await s.press('#tab-today'); await s.sleep(1500);
        await dismissFirstLine(s);
      }
      await compare(where, look);
    }
  }
} catch (error) {
  record('the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
}
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
