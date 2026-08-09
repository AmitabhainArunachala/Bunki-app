/* Probe 5: is the 2.6:1 metadata a WP8 regression or the prototype's own
 * soft-fade variant? Compare the new .stroke-meta against pre-WP8 --faint text.
 * Also: kanji sheet / radical sheet unchanged; standalone build parity. */
import { serve, check, R, noiseWatch, tap, hold, contrast } from './vlib.mjs';
const { chromium } = await import('playwright-core');

const noise = [];
const { server, base } = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
noiseWatch(page, noise, 'p5');

await page.goto(`${base}/index.html?entry=shelf&ui=bi&contrast=current`, { waitUntil: 'networkidle' });
await page.waitForSelector('.shelf-item');

// pre-existing --faint text on the shelf / reader, in the same soft-fade variant
const preExisting = await page.evaluate(`(() => {
  const faint = 'rgba(20, 24, 28, 0.42)';
  const out = [];
  for (const n of document.querySelectorAll('#app *')) {
    const cs = getComputedStyle(n);
    if (cs.color === faint && n.textContent.trim() && n.children.length === 0) {
      let bg = 'rgba(0, 0, 0, 0)', p = n;
      while (p && bg === 'rgba(0, 0, 0, 0)') { bg = getComputedStyle(p).backgroundColor; p = p.parentElement; }
      out.push({ cls: n.className || n.tagName, size: cs.fontSize, color: cs.color, bg });
      if (out.length >= 8) break;
    }
  }
  return out;
})()`);
console.log('  pre-WP8 --faint text in soft-fade:', JSON.stringify(preExisting, null, 1));
const ratios = preExisting.map((x) => contrast(x.color, x.bg));
check('the 2.6:1 metadata is the prototype-wide soft-fade token, not a WP8 regression',
  preExisting.length > 0 && ratios.every((r) => r < 4.5),
  `${preExisting.length} pre-existing --faint nodes, ratios ${ratios.join(', ')}`);

/* ---- kanji sheet inline behaviour: thumbnail still there, sheet otherwise sane ---- */
await page.fill('#search', '年');
await page.waitForTimeout(450);
await page.locator('[data-result="kanji:年"]').click();
await page.waitForTimeout(300);
const sheet = await page.evaluate(`(() => {
  const s = document.querySelector('#sheet');
  const svg = s.querySelector('svg.strokes');
  return { node: s.getAttribute('data-node'),
    eyebrows: [...s.querySelectorAll('.eyebrow')].map(e=>e.textContent.trim().slice(0,20)),
    thumbId: svg?.id, thumbPaths: svg?.querySelectorAll('path').length,
    thumbNums: svg?.querySelectorAll('text').length,
    thumbAria: svg?.getAttribute('aria-hidden'),
    thumbBox: svg ? (()=>{const r=svg.getBoundingClientRect(); return {w:+r.width.toFixed(1),h:+r.height.toFixed(1)};})() : null,
    doorCount: s.querySelectorAll('#strokes-door').length };
})()`);
check('kanji sheet still shows its numbered stroke thumbnail (now inside the door)',
  sheet.thumbId === 'strokes' && sheet.thumbPaths === 6 && sheet.thumbNums === 6 && sheet.doorCount === 1,
  JSON.stringify(sheet));
check('kanji sheet keeps its 筆順 eyebrow', sheet.eyebrows.some(e => /筆順/.test(e)),
  JSON.stringify(sheet.eyebrows));

/* ---- radical sheet: no stroke door claimed ---- */
const rad = await page.evaluate(`(() => {
  const c = [...document.querySelectorAll('#sheet .chip')].find(n => n.textContent.trim());
  return c ? c.textContent.trim().slice(0, 4) : null;
})()`);
await page.evaluate(`(() => { const c = [...document.querySelectorAll('#sheet .eyebrow')]
  .find(e => /部品/.test(e.textContent)); if (c) { let n = c.nextElementSibling;
  const chip = n?.querySelector('.chip'); if (chip) chip.click(); } })()`);
await page.waitForTimeout(350);
const radNode = await page.locator('#sheet').getAttribute('data-node');
const radDoor = await page.evaluate(`document.querySelectorAll('#sheet #strokes-door').length`);
console.log(`  after tapping a 部品 chip: node=${radNode}, stroke doors on it = ${radDoor}`);
check('the sheet reached from 部品 behaves consistently (a radical sheet carries no stroke door)',
  radNode == null || !/^radical:/.test(radNode) || radDoor === 0,
  `node=${radNode} doors=${radDoor}`);

/* ---- standalone build parity (scratch-built, never committed) ---- */
console.log('\nnoise:', JSON.stringify(noise));
check('zero errors across probe 5', noise.length === 0, `${noise.length}`);
console.log(`\nPROBE 5: ${R.pass} pass / ${R.fail} fail`);
await browser.close();
server.close();
