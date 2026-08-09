/* VERIFIER collateral sweep.
 *  A. 3 furigana x 3 kanji dial settings on one article: no token > 50px,
 *     screenshot of the first paragraph at each combo.
 *  B. spacing dials 0/1/2: the sp-word gap and bunsetsu grouping still apply.
 *  C. plain (non-content) token metrics vs the PRE-FIX build, token by token.
 *  D. no horizontal overflow at 320 / 390 / 1280.
 *  E. token-actions popover, lit state, 日本語のみ immersion chrome.
 * Usage: node v3-collateral.mjs [--root DIR] [--tag NAME] [--json OUT]
 */
/* global console */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { serve, phone, openArticle, CORRIDOR } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i > -1 ? process.argv[i + 1] : d;
};
const root = arg('--root', CORRIDOR);
const tag = arg('--tag', 'after');
const out = arg('--json', null);
const ARTICLE = 'wikinews:1403';
const SHOTS = resolve(HERE, 'out/shots');
mkdirSync(SHOTS, { recursive: true });

const report = { root, tag, dialMatrix: [], spacing: [], plainTokens: null, overflow: [], ui: {} };
const { server, base: origin } = await serve(root);
const { browser, page, errors } = await phone();

/* ---- A. dial matrix ---------------------------------------------------- */
for (const f of [0, 1, 2]) {
  for (const k of [0, 1, 2]) {
    const dials = `${k},${f},0`;
    await openArticle(page, origin, ARTICLE, `dials=${dials}`);
    const r = await page.evaluate(`(() => {
      let max = 0, over = 0, n = 0, txt = null, badRows = 0;
      for (const b of document.querySelectorAll('#reader button.tok')) {
        const h = b.getBoundingClientRect().height;
        n++;
        if (h > max) { max = h; txt = b.textContent; }
        if (h > 50) over++;
        if (b.classList.contains('content') && b.querySelectorAll(':scope > .tok-word').length !== 1) badRows++;
      }
      const rd = document.querySelector('#reader');
      return { n, max: +max.toFixed(2), over, txt, badRows,
               readerW: +rd.getBoundingClientRect().width.toFixed(2),
               scrollW: rd.scrollWidth, clientW: rd.clientWidth };
    })()`);
    await page
      .locator('#reader')
      .screenshot({ path: resolve(SHOTS, `dials-k${k}-f${f}-${tag}.png`) })
      .catch(() => {});
    report.dialMatrix.push({ dials, ...r });
    console.log(
      `dials k=${k} f=${f}: tokens=${r.n} max=${r.max} over50=${r.over} badWordRows=${r.badRows} readerScroll=${r.scrollW}/${r.clientW}`,
    );
  }
}

/* ---- B. spacing dials --------------------------------------------------- */
for (const s of [0, 1, 2]) {
  await openArticle(page, origin, ARTICLE, `dials=0,2,${s}`);
  const r = await page.evaluate(`(() => {
    const rd = document.querySelector('#reader');
    const doors = [...rd.querySelectorAll('.token-door')];
    // horizontal gap between consecutive rendered tokens on the SAME line
    const gaps = [];
    for (let i = 1; i < doors.length; i++) {
      const a = doors[i - 1].getBoundingClientRect(), b = doors[i].getBoundingClientRect();
      if (Math.abs(a.top - b.top) > 2) continue;
      gaps.push(+(b.left - a.right).toFixed(2));
    }
    gaps.sort((x, y) => x - y);
    return {
      classes: rd.className,
      bunsetsu: rd.querySelectorAll('.bunsetsu').length,
      gapMedian: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
      gapMax: gaps.length ? gaps[gaps.length - 1] : null,
      lines: new Set([...rd.querySelectorAll('.token-door')].map((d) => Math.round(d.getBoundingClientRect().top))).size,
      scrollW: rd.scrollWidth, clientW: rd.clientWidth,
    };
  })()`);
  report.spacing.push({ spacing: s, ...r });
  console.log(
    `spacing=${s}: classes="${r.classes}" bunsetsu=${r.bunsetsu} gapMedian=${r.gapMedian} gapMax=${r.gapMax} lines=${r.lines} scroll=${r.scrollW}/${r.clientW}`,
  );
}

/* ---- C. plain-token metrics (dumped; compared across builds outside) ---- */
await openArticle(page, origin, ARTICLE, 'dials=0,2,0');
report.plainTokens = await page.evaluate(`(() => {
  const rows = [];
  for (const s of document.querySelectorAll('#reader span.tok.plain')) {
    const r = s.getBoundingClientRect();
    const cs = getComputedStyle(s);
    rows.push([s.textContent, +r.left.toFixed(3), +r.top.toFixed(3), +r.width.toFixed(3), +r.height.toFixed(3), cs.display]);
  }
  return rows;
})()`);
console.log(`plain tokens captured: ${report.plainTokens.length}`);

/* ---- D. overflow at 320 / 390 / 1280 ------------------------------------ */
for (const w of [320, 390, 1280]) {
  await page.setViewportSize({ width: w, height: 844 });
  await openArticle(page, origin, ARTICLE, 'dials=0,2,0');
  const r = await page.evaluate(`(() => {
    const de = document.documentElement, rd = document.querySelector('#reader');
    let widest = null, worst = 0;
    for (const n of document.querySelectorAll('#reader *')) {
      const b = n.getBoundingClientRect();
      if (b.right > worst) { worst = b.right; widest = n.className || n.tagName; }
    }
    let maxTok = 0;
    for (const b of document.querySelectorAll('#reader button.tok')) maxTok = Math.max(maxTok, b.getBoundingClientRect().height);
    return {
      docScrollW: de.scrollWidth, docClientW: de.clientWidth,
      bodyScrollW: document.body.scrollWidth,
      readerScrollW: rd.scrollWidth, readerClientW: rd.clientWidth,
      rightmost: +worst.toFixed(2), rightmostNode: String(widest), maxTok: +maxTok.toFixed(2),
    };
  })()`);
  report.overflow.push({ width: w, ...r });
  console.log(
    `w=${w}: doc ${r.docScrollW}/${r.docClientW} body ${r.bodyScrollW} reader ${r.readerScrollW}/${r.readerClientW} rightmost=${r.rightmost} (${r.rightmostNode}) maxTok=${r.maxTok}`,
  );
}
await page.setViewportSize({ width: 390, height: 844 });

/* ---- E. popover / lit / immersion --------------------------------------- */
await openArticle(page, origin, ARTICLE, 'dials=0,2,0');
const sel = '#reader button.tok.content[data-index="34"]';
await page.locator(sel).scrollIntoViewIfNeeded();
await page.locator(sel).focus();
await page.waitForTimeout(150);
report.ui.popoverOnFocus = await page.evaluate(`(() => {
  const t = document.querySelector('${sel}');
  const door = t.closest('.token-door');
  const acts = door?.querySelector('.token-actions');
  if (!acts) return { present: false };
  const r = acts.getBoundingClientRect();
  const btns = [...acts.querySelectorAll('button')].map((b) => ({ text: b.textContent, w: +b.getBoundingClientRect().width.toFixed(1), h: +b.getBoundingClientRect().height.toFixed(1) }));
  return { present: true, hidden: acts.hasAttribute('hidden'), w: +r.width.toFixed(1), h: +r.height.toFixed(1), inViewport: r.top >= 0 && r.bottom <= innerHeight, buttons: btns };
})()`);
console.log('popover on focus:', JSON.stringify(report.ui.popoverOnFocus));
await page
  .screenshot({ path: resolve(SHOTS, `popover-${tag}.png`) })
  .catch(() => {});

await page.locator(sel).tap();
await page.waitForTimeout(150);
report.ui.lit = await page.evaluate(`(() => {
  const t = document.querySelector('${sel}');
  return { lit: t.classList.contains('lit'), h: +t.getBoundingClientRect().height.toFixed(2), order: [...t.children].map((c) => c.className) };
})()`);
console.log('lit state:', JSON.stringify(report.ui.lit));

await openArticle(page, origin, ARTICLE, 'dials=0,2,0&ui=ja');
report.ui.immersion = await page.evaluate(`(() => {
  let max = 0, over = 0, n = 0;
  for (const b of document.querySelectorAll('#reader button.tok')) {
    const h = b.getBoundingClientRect().height; n++; if (h > max) max = h; if (h > 50) over++;
  }
  return { n, max: +max.toFixed(2), over, hasLatinChrome: /[A-Za-z]/.test(document.querySelector('.grammar-hint')?.textContent ?? '') };
})()`);
console.log('immersion (ui=ja):', JSON.stringify(report.ui.immersion));
await page.screenshot({ path: resolve(SHOTS, `immersion-${tag}.png`) }).catch(() => {});

report.errors = errors;
console.log(`\nconsoleErr=${errors.console.length} pageErr=${errors.page.length}`);
if (errors.console.length) console.log(errors.console.slice(0, 6));
if (errors.page.length) console.log(errors.page.slice(0, 6));
if (out) writeFileSync(out, JSON.stringify(report, null, 2));

await browser.close();
server.close();
