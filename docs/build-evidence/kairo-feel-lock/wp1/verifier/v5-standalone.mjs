/* VERIFIER collateral: the COMMITTED single-file build
 * prototypes/corridor/corridor-standalone.html — the artifact the README says
 * can be handed over / emailed to a phone. It embeds a COPY of corridor.js and
 * corridor.css, so it only carries the fix if it was regenerated.
 *
 * Usage: node v5-standalone.mjs [--file NAME] [--json OUT]
 */
/* global console */
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { serve, phone } from './lib.mjs';

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : d;
};
const file = arg('--file', 'corridor-standalone.html');
const out = arg('--json', null);

const { server, base } = await serve();
const { browser, page, errors } = await phone();
await page.goto(`${base}/${file}?entry=shelf`, { waitUntil: 'load' });
await page.waitForSelector('.shelf-item', { timeout: 20000 });
await page.click('.shelf-item[data-passage="wikinews:1403"]');
await page.waitForSelector('#reader button.tok.content', { timeout: 20000 });
await page.waitForTimeout(400);

const r = await page.evaluate(`(() => {
  let max = 0, over = 0, n = 0, txt = null;
  const worst = [];
  for (const b of document.querySelectorAll('#reader button.tok')) {
    const h = b.getBoundingClientRect().height;
    n++;
    if (h > max) { max = h; txt = b.textContent; }
    if (h > 50) { over++; if (worst.length < 6) worst.push({ text: b.textContent, h: +h.toFixed(2) }); }
  }
  return { n, max: +max.toFixed(2), over, txt, worst,
           hasWordRow: !!document.querySelector('.tok-word'),
           cssRule: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((x) => (x.selectorText||'').includes('tok-word')); } catch { return false; } }) };
})()`);
console.log(`${file}: tokens=${r.n} max=${r.max} over50=${r.over} hasWordRow=${r.hasWordRow} cssRulePresent=${r.cssRule}`);
console.log('worst:', JSON.stringify(r.worst));
console.log(`consoleErr=${errors.console.length} pageErr=${errors.page.length}`);
if (out) writeFileSync(out, JSON.stringify({ file, ...r, errors }, null, 2));
await browser.close();
server.close();
