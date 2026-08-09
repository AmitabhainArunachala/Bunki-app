/* VERIFIER claim 1 + 5: every button.tok in every article, default dials.
 * height must be <= 50px; ::before hit region must be >= 44px both axes.
 * Usage: node v1-heights.mjs [--dials k,f,s] [--json OUT]
 */
/* global console */
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { serve, phone, openShelf, passageIds, openArticle, CORRIDOR } from './lib.mjs';

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : d;
};
const dials = arg('--dials', null);
const out = arg('--json', null);
const root = arg('--root', CORRIDOR);
const LIMIT = 50;

const { server, base } = await serve(root);
const { browser, page, errors } = await phone();
const q = dials ? `dials=${dials}` : '';

await openShelf(page, base, q);
const ids = await passageIds(page);
console.log(`articles: ${ids.length}  dials=${dials ?? 'default(0,2,0)'}`);

const offenders = [];
const smallHits = [];
const perArticle = [];
let total = 0;
let max = 0;
let maxAt = null;
let min = Infinity;

for (const id of ids) {
  await openArticle(page, base, id, q);
  const r = await page.evaluate(`(() => {
    const out = { tokens: 0, max: 0, maxText: null, min: Infinity, over: [], smallHit: [] };
    for (const b of document.querySelectorAll('#reader button.tok')) {
      const h = b.getBoundingClientRect().height;
      out.tokens++;
      if (h > out.max) { out.max = h; out.maxText = b.textContent; }
      if (h < out.min) out.min = h;
      if (h > 50) out.over.push({ text: b.textContent, h: +h.toFixed(2), rows: b.querySelectorAll('.tok-word').length });
      const cs = getComputedStyle(b, '::before');
      const w = parseFloat(cs.width), ph = parseFloat(cs.height);
      if (!(w >= 44) || !(ph >= 44)) out.smallHit.push({ text: b.textContent, w, h: ph });
    }
    return out;
  })()`);
  total += r.tokens;
  if (r.max > max) {
    max = r.max;
    maxAt = { id, text: r.maxText };
  }
  if (r.min < min) min = r.min;
  for (const o of r.over) offenders.push({ id, ...o });
  for (const s of r.smallHit) smallHits.push({ id, ...s });
  perArticle.push({ id, tokens: r.tokens, max: +r.max.toFixed(2), min: +r.min.toFixed(2), over: r.over.length });
  console.log(
    `  ${id.padEnd(24)} tokens=${String(r.tokens).padStart(4)} max=${r.max.toFixed(2)} min=${r.min.toFixed(2)} over=${r.over.length} smallHit=${r.smallHit.length}`,
  );
}

const report = {
  dials: dials ?? 'default',
  articles: ids.length,
  totalTokens: total,
  maxHeight: +max.toFixed(2),
  maxAt,
  minHeight: +min.toFixed(2),
  limit: LIMIT,
  offenders,
  offenderCount: offenders.length,
  smallHitCount: smallHits.length,
  smallHits: smallHits.slice(0, 20),
  consoleErrors: errors.console,
  pageErrors: errors.page,
  perArticle,
};
console.log(
  `\nTOTAL tokens=${total} max=${max.toFixed(2)} min=${min.toFixed(2)} offenders>${LIMIT}px=${offenders.length} smallHits=${smallHits.length} consoleErr=${errors.console.length} pageErr=${errors.page.length}`,
);
if (offenders.length) console.log('first offenders:', JSON.stringify(offenders.slice(0, 10)));
if (errors.console.length) console.log('console:', errors.console.slice(0, 5));
if (errors.page.length) console.log('page:', errors.page.slice(0, 5));
if (out) writeFileSync(out, JSON.stringify(report, null, 2));

await browser.close();
server.close();
process.exit(offenders.length || errors.page.length ? 1 : 0);
