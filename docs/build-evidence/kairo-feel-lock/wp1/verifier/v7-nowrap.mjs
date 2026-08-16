/* VERIFIER risk probe: `.tok.content > .tok-word { white-space: nowrap }` is a
 * NEW constraint — a token can no longer break inside itself. At the narrowest
 * supported width (320px) a long token could therefore overflow the column.
 * Sweep every article at 320px and report the widest token vs the reader width,
 * plus any document-level horizontal overflow.
 * Usage: node v7-nowrap.mjs [--root DIR] [--width 320] [--json OUT]
 */
/* global console */
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { serve, phone, openShelf, passageIds, openArticle, CORRIDOR } from './lib.mjs';

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : d;
};
const root = arg('--root', CORRIDOR);
const width = Number(arg('--width', '320'));
const out = arg('--json', null);

const { server, base: origin } = await serve(root);
const { browser, page, errors } = await phone(width, 844);
await openShelf(page, origin, '');
const ids = await passageIds(page);
const rows = [];
let worst = null;
let overflowed = [];
for (const id of ids) {
  await openArticle(page, origin, id, '');
  const r = await page.evaluate(`(() => {
    const rd = document.querySelector('#reader');
    const rw = rd.getBoundingClientRect().width;
    let maxW = 0, txt = null, spill = 0;
    for (const t of rd.querySelectorAll('.tok')) {
      const b = t.getBoundingClientRect();
      if (b.width > maxW) { maxW = b.width; txt = t.textContent; }
      if (b.right > rd.getBoundingClientRect().right + 0.5) spill++;
    }
    return { rw: +rw.toFixed(2), maxW: +maxW.toFixed(2), txt, spill,
             docScroll: document.documentElement.scrollWidth,
             docClient: document.documentElement.clientWidth };
  })()`);
  rows.push({ id, ...r });
  if (!worst || r.maxW > worst.maxW) worst = { id, ...r };
  if (r.spill || r.docScroll > r.docClient) overflowed.push({ id, ...r });
}
console.log(
  `width=${width}: widest token ${worst.maxW}px ("${worst.txt}") in ${worst.id}; reader width ${worst.rw}px`,
);
console.log(`articles with a token spilling past the reader or doc overflow: ${overflowed.length}`);
if (overflowed.length) console.log(JSON.stringify(overflowed.slice(0, 5), null, 1));
console.log(`consoleErr=${errors.console.length} pageErr=${errors.page.length}`);
if (out) writeFileSync(out, JSON.stringify({ root, width, worst, overflowed, rows, errors }, null, 2));
await browser.close();
server.close();
