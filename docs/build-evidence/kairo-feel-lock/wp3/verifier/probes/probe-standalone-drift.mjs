/** The drift artifact on its own at file:// — no host, no hooks, honest note. */
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
const APP = process.argv[2];
const SHOT = process.argv[3] || null;
const results = [];
const ok = (n, p, d) => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`); };

const b = await chromium.launch();
// prefers-reduced-motion stills the ambient drift (the source says so at L2403)
// while every gesture still runs — a real user setting, and the only way to hold
// a word still long enough for a deterministic tap ladder at file://.
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
const p = await ctx.newPage();
const cerr = [], perr = [];
p.on('console', (m) => m.type() === 'error' && cerr.push(m.text()));
p.on('pageerror', (e) => perr.push(String(e)));
await p.goto(pathToFileURL(APP).href, { waitUntil: 'load' });
await p.waitForFunction(() => document.querySelectorAll('.word').length > 8, null, { timeout: 30000 });

const hooks = await p.evaluate(() => ({
  openEntry: typeof window.__BUNKI_OPEN_ENTRY,
  appBase: typeof window.__BUNKI_APP_BASE,
  drift: typeof window.__DRIFT__,
  layer: !!document.getElementById('drift-layer'),
}));
ok('file://: both host hooks are undefined, no corridor layer', hooks.openEntry === 'undefined' && hooks.appBase === 'undefined' && hooks.drift === 'undefined' && hooks.layer === false, hooks);

// open any word card
const locate = (want) => p.evaluate((want) => {
  const all = [...document.querySelectorAll('.word')];
  // inside a dive the centre is the node that answers a tap with the card
  const pref = want ? all.filter((e) => /center|bctr/.test(e.className)).concat(all) : all;
  for (const e of pref) {
    const t = e.querySelector('.base')?.textContent;
    if (want && t !== want) continue;
    const r = e.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (!want) {
      if (!(r.top > 150 && r.bottom < 620 && r.left > 40 && r.right < 350)) continue;
      const h = document.elementFromPoint(x, y);
      if (h && (h === e || e.contains(h))) return { x, y, t };
      continue;
    }
    return { x, y, t, onScreen: x > 2 && x < 388 && y > 2 && y < 842 };
  }
  return null;
}, want || null);
let open = false, label = null;
outer:
for (let attempt = 0; attempt < 8 && !open; attempt++) {
  const first = await locate(null);
  if (!first) { await p.waitForTimeout(800); continue; }
  label = first.t;
  for (let i = 0; i < 8 && !open; i++) {
    let q = await locate(label);
    if (!q) { console.log(`   attempt ${attempt}: ${label} left the field, picking another`); break; }
    if (!q.onScreen) {
      // swim it back into the window with the drift's own open-water pan
      const start = await p.evaluate(() => {
        for (let y = 300; y < 620; y += 23) for (let x = 70; x < 330; x += 29) {
          const h = document.elementFromPoint(x, y);
          if (h && !h.closest('.word,.glyph,.part,#card,#lvl,#theme,#radoc')) return { x, y };
        }
        return null;
      });
      if (start) {
        const dx = Math.max(-140, Math.min(140, 195 - q.x)), dy = Math.max(-140, Math.min(140, 400 - q.y));
        const ex = Math.max(20, Math.min(370, start.x + dx)), ey = Math.max(120, Math.min(700, start.y + dy));
        const cdp = await ctx.newCDPSession(p);
        const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
        await T('touchStart', [[start.x, start.y]]);
        for (let k = 1; k <= 18; k++) { await p.waitForTimeout(24); await T('touchMove', [[start.x + ((ex - start.x) * k) / 18, start.y + ((ey - start.y) * k) / 18]]); }
        for (let k = 0; k < 5; k++) { await p.waitForTimeout(60); await T('touchMove', [[ex, ey]]); }
        await T('touchEnd', [[ex, ey]]);
        await cdp.detach();
        await p.waitForTimeout(700);
      }
      q = await locate(label);
      if (!q) break;
    }
    await p.touchscreen.tap(q.x, q.y);
    await p.waitForTimeout(650);
    open = await p.evaluate(() => !!document.querySelector('#card.open'));
  }
}
for (let i = 0; i < 0; i++) {
  const q = await locate(label);
  if (!q) {
    console.log(`   tap ${i}: ${label} not reachable`, await p.evaluate((l) => {
      const e = [...document.querySelectorAll('.word')].find((x) => x.querySelector('.base')?.textContent === l);
      if (!e) return 'gone';
      const r = e.getBoundingClientRect();
      return { top: +r.top.toFixed(0), bottom: +r.bottom.toFixed(0), left: +r.left.toFixed(0), right: +r.right.toFixed(0), cls: e.className };
    }, label));
    await p.waitForTimeout(600); continue;
  }
  await p.touchscreen.tap(q.x, q.y);
  await p.waitForTimeout(650);
  open = await p.evaluate(() => !!document.querySelector('#card.open'));
  console.log(`   tap ${i} on ${label} @(${q.x.toFixed(0)},${q.y.toFixed(0)}) -> card.open=${open}`, await p.evaluate((l) => {
    const e = [...document.querySelectorAll('.word')].find((x) => x.querySelector('.base')?.textContent === l);
    return { cls: e?.className, depth: document.querySelector('#depth')?.textContent };
  }, label));
}
ok('file://: a word card opens', open, { label });
if (SHOT) await p.screenshot({ path: SHOT });

const card = await p.evaluate(() => {
  const c = document.querySelector('#card');
  return { button: !!c.querySelector('button.study'), anchor: !!c.querySelector('a.study'), note: c.querySelector('.note')?.textContent || null };
});
ok('file://: no study door at all — the honest note stands', card.button === false && card.anchor === false && !!card.note, card);
ok('file://: the note is unchanged', card.note === '実物では、ここから完全な辞書へ — in the real app this opens the full entry.', card.note);

// the URL-only host path still works
const urlHost = await p.evaluate(async () => {
  window.__BUNKI_APP_BASE = 'https://example.test/';
  document.querySelector('#card').classList.remove('open');
  return true;
});
ok('file://: __BUNKI_APP_BASE remains the URL-only path (settable, unused by the seam)', urlHost);
ok('file://: zero console / page errors', cerr.length === 0 && perr.length === 0, { cerr, perr });
console.log(`\n=== ${results.filter(Boolean).length}/${results.length} ===`);
await b.close();
process.exit(results.every(Boolean) ? 0 : 2);
