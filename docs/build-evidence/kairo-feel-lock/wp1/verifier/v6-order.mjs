/* VERIFIER: DOM order + state stability around paintTok's furigana:0 rebuild.
 *
 *  1. furigana:0 stem-ruby token: rest -> reveal -> gloss -> full entry -> back
 *     -> re-activate. Order must stay [.tok-word, .tok-en] throughout.
 *  2. The REACHABLE arm of the rebuild branch: a kana-only content token at
 *     furigana:0 never grows a <ruby>, so `hasReading !== !!built` stays true
 *     and the rebuild fires on EVERY paintTok — including the call that mounts
 *     the gloss. Pre-fix that call wiped the span; post-fix it swaps one row.
 *     Assert the gloss survives and the order is [word, gloss].
 *  3. Dial round-trip (0 -> 2 -> 0) with a revealed+glossed token.
 *
 * Usage: node v6-order.mjs [--root DIR] [--json OUT]
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

const SNAP = (i) => `(() => {
  const t = document.querySelector('#reader button.tok[data-index="${i}"]');
  if (!t) return null;
  return {
    order: [...t.children].map((c) => c.className || c.tagName.toLowerCase()),
    nodeKinds: [...t.childNodes].map((n) => n.nodeType === 3 ? 'text:' + JSON.stringify(n.textContent) : (n.className || n.tagName.toLowerCase())),
    rubyInsideWord: !!t.querySelector('.tok-word ruby') || (!t.querySelector('.tok-word') && !!t.querySelector('ruby')),
    hasRuby: !!t.querySelector('ruby'),
    wordRows: t.querySelectorAll('.tok-word').length,
    en: t.querySelector('.tok-en')?.textContent ?? null,
    lit: t.classList.contains('lit'),
    hasEnClass: t.classList.contains('has-en'),
    h: +t.getBoundingClientRect().height.toFixed(2),
    text: t.textContent,
  };
})()`;

const { server, base: origin } = await serve(root);
const { browser, page, errors } = await phone();
const report = { root, cases: [] };

async function tap(i) {
  const sel = `#reader button.tok[data-index="${i}"]`;
  await page.locator(sel).scrollIntoViewIfNeeded();
  await page.locator(sel).tap();
  await page.waitForTimeout(150);
}

/* ---- case 1: stem-ruby at furigana 0, through the entry and back ------- */
await openArticle(page, origin, ARTICLE, 'dials=0,0,0');
const IDX = 34; // 含め
const trail = [];
trail.push({ at: 'rest', ...(await page.evaluate(SNAP(IDX))) });
await tap(IDX);
trail.push({ at: 'reveal', ...(await page.evaluate(SNAP(IDX))) });
await tap(IDX);
trail.push({ at: 'gloss', ...(await page.evaluate(SNAP(IDX))) });
await tap(IDX);
await page.waitForTimeout(400);
const sheet = await page.evaluate(
  `(() => { const d = document.querySelector('[role="dialog"]'); return { open: !!d, name: d?.getAttribute('aria-label') ?? null }; })()`,
);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
trail.push({ at: 'after-entry-return', ...(await page.evaluate(SNAP(IDX))) });
await tap(IDX);
await page.waitForTimeout(400);
const sheet2 = await page.evaluate(
  `(() => { const d = document.querySelector('[role="dialog"]'); return { open: !!d }; })()`,
);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
trail.push({ at: 're-activated', ...(await page.evaluate(SNAP(IDX))) });
report.cases.push({ name: 'stem-ruby furigana:0 lifecycle', sheet, sheet2, trail });
for (const t of trail)
  console.log(
    `[1] ${t.at.padEnd(20)} order=${JSON.stringify(t.order)} nodes=${JSON.stringify(t.nodeKinds)} ruby=${t.hasRuby} rubyInWord=${t.rubyInsideWord} en=${JSON.stringify(t.en)} h=${t.h}`,
  );
console.log(`[1] entry sheet opened on 3rd tap: ${JSON.stringify(sheet)}; again: ${JSON.stringify(sheet2)}`);

/* ---- case 2: kana-only content token — rebuild fires on the gloss call -- */
await openArticle(page, origin, ARTICLE, 'dials=0,0,0');
const kana = await page.evaluate(`(() => {
  const found = [];
  for (const t of document.querySelectorAll('#reader button.tok.content')) {
    if (/[\\u4e00-\\u9fff]/.test(t.textContent)) continue; // no kanji => no reading pairs
    found.push({ index: +t.dataset.index, text: t.textContent, word: t.dataset.word });
  }
  return found.slice(0, 40);
})()`);
console.log(`[2] kana-only content tokens: ${kana.length} — ${kana.slice(0, 8).map((k) => k.text).join(' ')}`);
const case2 = [];
for (const k of kana.slice(0, 12)) {
  await openArticle(page, origin, ARTICLE, 'dials=0,0,0');
  const t0 = await page.evaluate(SNAP(k.index));
  await tap(k.index);
  const t1 = await page.evaluate(SNAP(k.index));
  await tap(k.index);
  const t2 = await page.evaluate(SNAP(k.index));
  case2.push({ ...k, rest: t0, tap1: t1, tap2: t2 });
  console.log(
    `[2] ${k.text.padEnd(8)} rest=${JSON.stringify(t0.order)} tap1=${JSON.stringify(t1.order)} tap2=${JSON.stringify(t2.order)} en=${JSON.stringify(t2.en)} h=${t0.h}/${t1.h}/${t2.h}`,
  );
}
report.cases.push({ name: 'kana-only rebuild arm', samples: case2 });

/* ---- case 3: dial round-trip with a revealed+glossed token -------------- */
await openArticle(page, origin, ARTICLE, 'dials=0,0,0');
await tap(IDX);
await tap(IDX);
const before = await page.evaluate(SNAP(IDX));
// open the dials fold and flip furigana to 2, then back to 0
await page.click('#dials-toggle');
await page.waitForTimeout(150);
const dialButtons = await page.evaluate(
  `[...document.querySelectorAll('.dials button')].map((b) => b.textContent)`,
);
async function setFurigana(n) {
  await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.dials .dial-row, .dials > div')];
    for (const r of rows) {
      if (/ふりがな|furigana/i.test(r.textContent)) {
        const b = [...r.querySelectorAll('button')][${n}];
        if (b) { b.click(); return true; }
      }
    }
    return false;
  })()`);
  await page.waitForTimeout(250);
}
await setFurigana(2);
const mid = await page.evaluate(SNAP(IDX));
await setFurigana(0);
const after = await page.evaluate(SNAP(IDX));
report.cases.push({ name: 'dial round-trip', dialButtons, before, mid, after });
console.log(`[3] dial buttons: ${JSON.stringify(dialButtons)}`);
for (const [label, s] of [['before', before], ['furigana=2', mid], ['back to 0', after]])
  console.log(`[3] ${label.padEnd(12)} order=${JSON.stringify(s.order)} ruby=${s.hasRuby} en=${JSON.stringify(s.en)} h=${s.h}`);

report.errors = errors;
console.log(`\nconsoleErr=${errors.console.length} pageErr=${errors.page.length}`);
if (errors.console.length) console.log(errors.console.slice(0, 6));
if (errors.page.length) console.log(errors.page.slice(0, 6));
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
await browser.close();
server.close();
