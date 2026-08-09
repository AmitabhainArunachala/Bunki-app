/** The no-dead-door guard, on data the corridor genuinely does not carry. */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';

const APP = process.argv[2];
const WORD = process.argv[3] || '天気';
const SHOT = process.argv[4] || null;
const results = [];
const ok = (n, p, d) => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const cerr = [], perr = [];
p.on('console', (m) => m.type() === 'error' && cerr.push(m.text()));
p.on('pageerror', (e) => perr.push(String(e)));
await p.goto(pathToFileURL(APP).href, { waitUntil: 'load' });
await p.waitForFunction(() => document.querySelectorAll('#drift-layer .word').length > 8, null, { timeout: 30000 });

const seam = await p.evaluate((w) => ({
  hasWord: window.__BUNKI_OPEN_ENTRY.has('word', w),
  hasKanji: window.__BUNKI_OPEN_ENTRY.has('kanji', '天'),
  hasOther: window.__BUNKI_OPEN_ENTRY.has('word', '元気'),
}), WORD);
ok(`has() is false for the word the data no longer carries (${WORD}), still true for a neighbour`, seam.hasWord === false && seam.hasKanji === false && seam.hasOther === true, seam);

// open() must also refuse
const refused = await p.evaluate((w) => {
  window.__BUNKI_OPEN_ENTRY.open('word', w);
  return !document.querySelector('#sheet');
}, WORD);
ok('open() refuses an absent entry — no sheet, no navigation', refused);

// tide to N5, pan to the word, open its card
const box = await p.evaluate(() => { const r = document.querySelector('#drift-layer #lvl').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const cdp = await ctx.newCDPSession(p);
const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
const cx = box.x + box.w / 2, bot = box.y + box.h - 3;
await T('touchStart', [[cx, box.y + box.h / 2]]); await p.waitForTimeout(60);
await T('touchMove', [[cx, bot]]); await p.waitForTimeout(60);
await T('touchEnd', [[cx, bot]]); await p.waitForTimeout(3000);

const locate = () => p.evaluate((w) => {
  const e = [...document.querySelectorAll('#drift-layer .word')].find((x) => x.querySelector('.base')?.textContent.trim() === w);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
}, WORD);

for (let i = 0; i < 8; i++) {
  const pos = await locate();
  if (!pos) break;
  if (pos.cy > 150 && pos.cy < 600 && pos.cx > 40 && pos.cx < 350) break;
  const start = await p.evaluate(() => {
    for (let y = 300; y < 620; y += 23) for (let x = 70; x < 330; x += 29) {
      const h = document.elementFromPoint(x, y);
      if (h && !h.closest('.word,.glyph,.part,#card,#lvl,#theme,#radoc,.chrome,#enter-shelf-door')) return { x, y };
    }
    return null;
  });
  if (!start) break;
  const dx = Math.max(-120, Math.min(120, 195 - pos.cx)), dy = Math.max(-120, Math.min(120, 330 - pos.cy));
  const ex = Math.max(20, Math.min(370, start.x + dx)), ey = Math.max(120, Math.min(700, start.y + dy));
  await T('touchStart', [[start.x, start.y]]);
  for (let k = 1; k <= 18; k++) { await p.waitForTimeout(28); await T('touchMove', [[start.x + ((ex - start.x) * k) / 18, start.y + ((ey - start.y) * k) / 18]]); }
  for (let k = 0; k < 6; k++) { await p.waitForTimeout(70); await T('touchMove', [[ex, ey]]); }
  await T('touchEnd', [[ex, ey]]); await p.waitForTimeout(800);
}
const pos = await locate();
ok(`the absent word ${WORD} is still on screen — it did not disappear from the field`, !!pos, pos);

let open = false;
for (let i = 0; i < 8 && !open; i++) {
  const q = await locate();
  if (!q) break;
  await p.touchscreen.tap(q.cx, q.cy);
  await p.waitForTimeout(650);
  open = await p.evaluate(() => !!document.querySelector('#drift-layer #card.open'));
}
ok('its card still opens', open);
if (SHOT) await p.screenshot({ path: SHOT });

const card = await p.evaluate(() => {
  const c = document.querySelector('#drift-layer #card');
  return {
    head: c.querySelector('.chead,.head,h1,h2')?.textContent || c.textContent.slice(0, 24),
    button: !!c.querySelector('button.study'),
    anchor: !!c.querySelector('a.study'),
    anyStudy: c.querySelectorAll('.study').length,
    note: c.querySelector('.note')?.textContent || null,
    kanjiCells: c.querySelectorAll('.rrow,.kcell,.scell').length,
  };
});
ok('NO DEAD DOOR: no button.study and no a.study on the card', card.button === false && card.anchor === false && card.anyStudy === 0, card);
ok('the card keeps its honest note instead', !!card.note && /実物では/.test(card.note), card.note);
ok('zero console / page errors', cerr.length === 0 && perr.length === 0, { cerr, perr });

console.log(`\n=== ${results.filter(Boolean).length}/${results.length} ===`);
await b.close();
process.exit(results.every(Boolean) ? 0 : 2);
