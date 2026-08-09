/**
 * The 漢字 card takes the same seam. Run against the normal fusion (door
 * expected) and against a fusion whose bundle no longer carries the character
 * (note expected) — closing the implementer's own stated risk #3.
 *
 * node probe-kanji.mjs <app.html> <expectDoor:yes|no> [shot.png]
 */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';

const APP = process.argv[2];
const EXPECT = process.argv[3] === 'yes';
const SHOT = process.argv[4] || null;
const results = [];
const ok = (n, p, d) => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const p = await ctx.newPage();
const cerr = [], perr = [];
p.on('console', (m) => m.type() === 'error' && cerr.push(m.text()));
p.on('pageerror', (e) => perr.push(String(e)));
await p.goto(pathToFileURL(APP).href, { waitUntil: 'load' });
await p.waitForFunction(() => document.querySelectorAll('#drift-layer .word').length > 8, null, { timeout: 30000 });

const TARGET = process.argv[5] || '言';
const seam = await p.evaluate((t) => ({ target: t, hasTarget: window.__BUNKI_OPEN_ENTRY.has('kanji', t), hasKi: window.__BUNKI_OPEN_ENTRY.has('kanji', '気') }), TARGET);
ok(`has('kanji','${TARGET}') is ${EXPECT}`, seam.hasTarget === EXPECT, seam);

// dive: pick any word, tap it up the ladder into a dive, then tap a glyph twice
const locate = (sel) => p.evaluate((sel) => {
  const els = [...document.querySelectorAll(sel)];
  const pick = els.find((e) => /center|bctr/.test(e.className)) || els[0];
  if (!pick) return null;
  const r = pick.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: pick.textContent.trim().slice(0, 6), on: r.x > 2 && r.right < 388 && r.y > 2 && r.bottom < 842 };
}, sel);

const wordAt = () => p.evaluate(() => {
  for (const e of document.querySelectorAll('#drift-layer .word')) {
    const r = e.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (!(r.top > 150 && r.bottom < 600 && r.left > 40 && r.right < 350)) continue;
    const h = document.elementFromPoint(x, y);
    if (h && (h === e || e.contains(h))) return { x, y, t: e.querySelector('.base')?.textContent };
  }
  return null;
});

let inDive = false, label = null;
for (let a = 0; a < 8 && !inDive; a++) {
  const w = await wordAt();
  if (!w) { await p.waitForTimeout(700); continue; }
  label = w.t;
  for (let i = 0; i < 4 && !inDive; i++) {
    const q = await p.evaluate((l) => {
      const els = [...document.querySelectorAll('#drift-layer .word')].filter((e) => e.querySelector('.base')?.textContent === l);
      const e = els.find((x) => /center|bctr/.test(x.className)) || els[0];
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, label);
    if (!q) break;
    await p.touchscreen.tap(q.x, q.y);
    await p.waitForTimeout(600);
    inDive = await p.evaluate(() => (document.querySelector('#drift-layer #depth')?.textContent || '').length > 0);
  }
}
ok('dive: reached a word level (a 漢字 layer exists)', inDive, { label, depth: await p.evaluate(() => document.querySelector('#drift-layer #depth')?.textContent) });

// tap a glyph to dive into it, then tap the centre glyph to open the kanji card
let cardOpen = false, glyph = null;
for (let i = 0; i < 8 && !cardOpen; i++) {
  const g = await locate('#drift-layer .glyph');
  if (!g) { await p.waitForTimeout(500); continue; }
  glyph = g.t;
  await p.touchscreen.tap(g.x, g.y);
  await p.waitForTimeout(650);
  cardOpen = await p.evaluate(() => !!document.querySelector('#drift-layer #card.open'));
}
ok('card: a 漢字 card opens', cardOpen, { glyph, depth: await p.evaluate(() => document.querySelector('#drift-layer #depth')?.textContent) });
if (SHOT) await p.screenshot({ path: SHOT });

const card = await p.evaluate(() => {
  const c = document.querySelector('#drift-layer #card');
  const bt = c.querySelector('button.study');
  return {
    door: !!bt, kind: bt?.getAttribute('data-study-kind'), key: bt?.getAttribute('data-study-key'),
    anchor: !!c.querySelector('a.study'),
    note: c.querySelector('.note')?.textContent || null,
    strokeCellBeforeDoor: (() => {
      const cell = c.querySelector('.scell'); const tail = c.querySelector('.note,.study');
      if (!cell || !tail) return null;
      return !!(cell.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING);
    })(),
  };
});
if (EXPECT) {
  ok('漢字 card: the same seam draws a kanji door', card.door && card.kind === 'kanji' && !!card.key, card);
  const opened = await p.evaluate(() => {
    const bt = document.querySelector('#drift-layer #card button.study');
    bt.scrollIntoView({ block: 'center' });
    const r = bt.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, key: bt.getAttribute('data-study-key'), rect: { x: +r.x.toFixed(0), y: +r.y.toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0) }, ownsPoint: !!hit && (hit === bt || bt.contains(hit)) };
  });
  await p.touchscreen.tap(opened.x, opened.y);
  await p.waitForTimeout(700);
  const sheet = await p.evaluate(() => document.querySelector('#sheet')?.dataset.node);
  ok('漢字 card: the door opens the corridor kanji entry', sheet === `kanji:${opened.key}`, { sheet, expected: `kanji:${opened.key}`, door: opened });
} else {
  ok('漢字 card: NO door when the character is absent from the corridor — note instead', card.door === false && card.anchor === false && !!card.note, card);
}
ok('the stroke cell is still inserted before the card tail', card.strokeCellBeforeDoor !== false, { strokeCellBeforeDoor: card.strokeCellBeforeDoor });
ok('zero console / page errors', cerr.length === 0 && perr.length === 0, { cerr, perr });
console.log(`\n=== ${results.filter(Boolean).length}/${results.length} ===`);
await b.close();
process.exit(results.every(Boolean) ? 0 : 2);
