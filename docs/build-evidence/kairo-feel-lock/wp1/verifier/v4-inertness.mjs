/* VERIFIER: is the .tok-word wrapper really inert where it should be?
 *
 * The cleanest control is furigana:0 — no <ruby> anywhere, so there is nothing
 * to tear and the fix must be a pure no-op. If EVERY token's rect and every
 * plain token's inline advance is identical to the pre-fix build there, the
 * wrapper adds no box and no break opportunity. Also dumps the advance of each
 * plain token at furigana:2 (line-wrap independent: sum of client rects).
 *
 * Usage: node v4-inertness.mjs --root DIR --json OUT
 */
/* global console */
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { serve, phone, openArticle, CORRIDOR } from './lib.mjs';

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : d;
};
const root = arg('--root', CORRIDOR);
const out = arg('--json', null);
const ARTICLE = 'wikinews:1403';

const DUMP = `(() => {
  const rd = document.querySelector('#reader');
  const all = [];
  for (const t of rd.querySelectorAll('.tok')) {
    const r = t.getBoundingClientRect();
    const rects = [...t.getClientRects()];
    all.push({
      cls: t.className,
      text: t.textContent,
      x: +r.left.toFixed(3), y: +r.top.toFixed(3),
      w: +r.width.toFixed(3), h: +r.height.toFixed(3),
      nRects: rects.length,
      advance: +rects.reduce((s, q) => s + q.width, 0).toFixed(3),
    });
  }
  return { tokens: all, readerH: +rd.getBoundingClientRect().height.toFixed(2), scrollH: rd.scrollHeight };
})()`;

const { server, base: origin } = await serve(root);
const { browser, page, errors } = await phone();
const dump = {};
for (const dials of ['0,0,0', '0,2,0']) {
  await openArticle(page, origin, ARTICLE, `dials=${dials}`);
  dump[dials] = await page.evaluate(DUMP);
  console.log(`${root.split('/').pop()} dials=${dials}: tokens=${dump[dials].tokens.length} readerH=${dump[dials].readerH}`);
}
dump.errors = errors;
if (out) writeFileSync(out, JSON.stringify(dump, null, 2));
await browser.close();
server.close();
