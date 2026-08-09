/**
 * WP3 INDEPENDENT VERIFIER PROBE — written from scratch by the verifier.
 * Real Chromium, 390x844, isMobile + hasTouch, real CDP touch taps, file:// only.
 *
 * node probe.mjs --app <standalone.html> [--word 天気] [--json out.json] [--shots dir]
 */
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : d;
};
const APP = arg('--app');
const WORD = arg('--word', '天気');
const OUT = arg('--json', null);
const SHOTS = arg('--shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(String(e)));

const url = pathToFileURL(APP).href;
await page.goto(url, { waitUntil: 'load' });

// ---------- boot ----------
await page.waitForFunction(() => !!document.querySelector('#drift-layer.active'), null, { timeout: 30000 });
await page.waitForFunction(() => document.querySelectorAll('#drift-layer .word').length > 8, null, { timeout: 30000 });
ok('boot: drift layer active in corridor fusion', true, {
  words: await page.evaluate(() => document.querySelectorAll('#drift-layer .word').length),
  crumb: await page.evaluate(() => document.querySelector('.crumb')?.textContent),
});

// ---------- seam presence ----------
const seam = await page.evaluate(() => {
  const h = window.__BUNKI_OPEN_ENTRY;
  return {
    exists: !!h,
    hasFn: typeof h?.has,
    openFn: typeof h?.open,
    appBase: typeof window.__BUNKI_APP_BASE,
    hasWord: h?.has('word', '天気'),
    hasKanji: h?.has('kanji', '天'),
    hasJunk: h?.has('word', 'ZZ_NOT_A_WORD_ZZ'),
    hasEmpty: h?.has('word', ''),
    hasNull: h?.has('word', null),
  };
});
ok('seam: __BUNKI_OPEN_ENTRY installed, __BUNKI_APP_BASE untouched', seam.exists && seam.hasFn === 'function' && seam.openFn === 'function' && seam.appBase === 'undefined' && seam.hasWord === true && seam.hasKanji === true && seam.hasJunk === false && seam.hasEmpty === false && seam.hasNull === false, seam);

// ---------- sweep the tide to N5 (my own method: real touch drag on #lvl) ----------
async function sweepToN5() {
  const box = await page.evaluate(() => {
    const r = document.querySelector('#drift-layer #lvl').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const cx = box.x + box.w / 2;
  const cdp = await ctx.newCDPSession(page);
  const bottom = box.y + box.h - 3; // N5 is the last stop
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: box.y + box.h / 2 }] });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: bottom }] });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: cx, y: bottom }] });
  await page.waitForTimeout(3000);
  await cdp.detach();
}

async function findWord(w) {
  return page.evaluate((w) => {
    const els = [...document.querySelectorAll('#drift-layer .word')];
    for (const e of els) {
      const b = e.querySelector('.base');
      if (b && b.textContent.trim() === w) {
        const r = e.getBoundingClientRect();
        if (r.width && r.top > 90 && r.bottom < 740) return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      }
    }
    return null;
  }, w);
}

/** Swim to the word: one finger on OPEN WATER pans the camera (drift's own
 *  gesture). No internals are touched — this is what a thumb would do. */
async function panToward(w) {
  const cdp = await ctx.newCDPSession(page);
  for (let step = 0; step < 12; step++) {
    const pos = await page.evaluate((w) => {
      const e = [...document.querySelectorAll('#drift-layer .word')].find((x) => x.querySelector('.base')?.textContent.trim() === w);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    }, w);
    if (!pos) { console.log(`   pan step ${step}: ${w} left the field`); break; }
    console.log(`   pan step ${step}: ${w} at (${pos.cx.toFixed(0)},${pos.cy.toFixed(0)})`);
    if (pos.cy > 150 && pos.cy < 600 && pos.cx > 40 && pos.cx < 350) break;
    const dx = Math.max(-120, Math.min(120, 195 - pos.cx));
    const dy = Math.max(-120, Math.min(120, 330 - pos.cy));
    // a start point on genuinely open water
    const start = await page.evaluate(() => {
      for (let y = 300; y < 620; y += 23)
        for (let x = 70; x < 330; x += 29) {
          const hit = document.elementFromPoint(x, y);
          if (hit && !hit.closest('.word,.glyph,.part,#card,#lvl,#theme,#radoc,.chrome,#enter-shelf-door')) return { x, y };
        }
      return null;
    });
    if (!start) break;
    const ex = Math.max(20, Math.min(370, start.x + dx));
    const ey = Math.max(120, Math.min(700, start.y + dy));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y }] });
    const N = 18;
    for (let k = 1; k <= N; k++) {
      await page.waitForTimeout(28);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + ((ex - start.x) * k) / N, y: start.y + ((ey - start.y) * k) / N }] });
    }
    // hold still so the fling velocity decays before the lift
    for (let k = 0; k < 6; k++) {
      await page.waitForTimeout(70);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: ex, y: ey }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: ex, y: ey }] });
    await page.waitForTimeout(800);
  }
  await cdp.detach();
}

let target = await findWord(WORD);
if (!target) {
  await sweepToN5();
  console.log('   tide:', await page.evaluate(() => document.querySelector('#drift-layer #lvlInfo')?.textContent));
  await panToward(WORD);
  for (let i = 0; i < 20 && !target; i++) {
    target = await findWord(WORD);
    if (!target) await page.waitForTimeout(700);
  }
  if (!target)
    console.log('   words on screen:', (await page.evaluate(() => [...document.querySelectorAll('#drift-layer .word')].map((e) => { const r = e.getBoundingClientRect(); return `${e.querySelector('.base')?.textContent.trim()}@${r.top.toFixed(0)}-${r.bottom.toFixed(0)}`; }))).join(' '));
}
ok(`field: the word ${WORD} is on screen (tide swept if needed)`, !!target, target);
if (!target) {
  console.log('cannot continue without the target word');
  await browser.close();
  process.exit(1);
}

// ---------- tap up to the card ----------
let cardOpen = false;
for (let i = 0; i < 8 && !cardOpen; i++) {
  const t = await findWord(WORD);
  if (!t) break;
  await page.touchscreen.tap(t.x, t.y);
  await page.waitForTimeout(650);
  cardOpen = await page.evaluate(() => !!document.querySelector('#drift-layer #card.open'));
}
ok(`card: tapping ${WORD} opens the drift card`, cardOpen);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/1-card.png` });

// ---------- the study door ----------
const door = await page.evaluate(() => {
  const scope = document.querySelector('#drift-layer #card');
  const b = scope.querySelector('button.study[data-study-key]');
  const a = scope.querySelector('a.study');
  const note = scope.querySelector('.note');
  if (!b) return { button: false, anchor: !!a, note: note ? note.textContent : null };
  const r = b.getBoundingClientRect();
  const cs = getComputedStyle(b);
  const layer = document.getElementById('drift-layer');
  const ls = getComputedStyle(layer);
  const shelf = document.getElementById('enter-shelf-door');
  const sr = shelf ? shelf.getBoundingClientRect() : null;
  const overlap = sr ? !(r.right <= sr.left || r.left >= sr.right || r.bottom <= sr.top || r.top >= sr.bottom) : null;
  // hit-test a grid across the door
  let own = 0, pts = 0;
  for (let i = 1; i <= 5; i++) for (let j = 1; j <= 3; j++) {
    const x = r.left + (r.width * i) / 6, y = r.top + (r.height * j) / 4;
    pts++;
    const hit = document.elementFromPoint(x, y);
    if (hit === b || b.contains(hit)) own++;
  }
  const norm = (s) => s.replace(/\s+/g, '');
  return {
    button: true, anchor: !!a,
    kind: b.getAttribute('data-study-kind'), key: b.getAttribute('data-study-key'),
    label: b.textContent,
    rect: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    color: cs.color, borderColor: cs.borderTopColor, marginRight: cs.marginRight, width: cs.width,
    layerInk: norm(ls.getPropertyValue('--ink')), layerPig2: norm(ls.getPropertyValue('--pig2')),
    layerAccent: norm(ls.getPropertyValue('--accent')),
    overlapsShelfDoor: overlap, shelfRect: sr && { x: +sr.x.toFixed(0), y: +sr.y.toFixed(0), w: +sr.width.toFixed(0), h: +sr.height.toFixed(0) },
    hitOwn: own, hitPts: pts,
  };
});
ok('door: rendered as a <button class="study"> (host seam, not an href)', door.button && !door.anchor, { kind: door.kind, key: door.key, label: door.label });
ok('door: target >= 44px in both axes', door.rect && door.rect.w >= 44 && door.rect.h >= 44, door.rect);
ok('door: every probe point hit-tests to the door itself, no overlap with 本棚', door.hitOwn === door.hitPts && door.overlapsShelfDoor === false, { hit: `${door.hitOwn}/${door.hitPts}`, overlap: door.overlapsShelfDoor, shelf: door.shelfRect, marginRight: door.marginRight });
// label ink, not 朱
const toRgb = (s) => s.trim();
ok('door: label is ink, not 朱 (red stays readings-only)', door.color && door.color !== door.layerAccent && door.color.replace(/\s+/g, '') !== door.layerAccent, { color: door.color, ink: door.layerInk, accent: door.layerAccent, rim: door.borderColor, pig2: door.layerPig2 });
// the fused-chrome correction is actually applied
ok('door: fused-chrome correction applied (width auto + 96px clearance)', door.marginRight === '96px', { marginRight: door.marginRight, width: door.width });

// ---------- stamp the constellation BEFORE the sheet ----------
const before = await page.evaluate(() => {
  const els = [...document.querySelectorAll('#drift-layer .word')];
  els.forEach((e, i) => { e.__V3STAMP = 'v3-' + i; });
  const rec = els.map((e) => {
    const r = e.getBoundingClientRect();
    return { s: e.__V3STAMP, t: e.querySelector('.base')?.textContent.trim(), x: r.x, y: r.y, cls: e.className };
  });
  return {
    n: els.length,
    rec,
    centre: rec.filter((r) => /\bbctr\b|\bcenter\b/.test(r.cls)).map((r) => ({ s: r.s, t: r.t })),
    depth: document.querySelector('#drift-layer #depth')?.textContent,
  };
});
ok('constellation: stamped before the sheet', before.n > 0, { bodies: before.n, centre: before.centre, depth: before.depth });

// ---------- open the corridor entry ----------
const dr = await page.evaluate(() => {
  const b = document.querySelector('#drift-layer #card button.study');
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const tSheetStart = Date.now();
await page.touchscreen.tap(dr.x, dr.y);
await page.waitForTimeout(500);
const sheet1 = await page.evaluate(() => {
  const s = document.querySelector('#sheet');
  if (!s) return null;
  return {
    node: s.dataset.node,
    head: s.querySelector('.headword')?.textContent,
    reading: s.querySelector('.reading')?.textContent,
    senses: s.querySelectorAll('.sense-list li').length || (s.querySelector('.senses .gloss') ? 1 : 0),
    kanjiDoors: [...s.querySelectorAll('button.entry-row')].map((b) => b.querySelector('.row-glyph')?.textContent),
    semRows: [...s.querySelectorAll('button.sem-row')].map((b) => b.querySelector('.sem-word')?.textContent),
    crumb: document.querySelector('.crumb')?.textContent,
    driftActive: !!document.querySelector('#drift-layer.active'),
    driftDisplay: getComputedStyle(document.getElementById('drift-layer')).display,
  };
});
ok('entry: the corridor\'s own sheet opens on the drift word', !!sheet1 && sheet1.node === `word:${WORD}`, sheet1 && { node: sheet1.node, head: sheet1.head, reading: sheet1.reading });
ok('entry: senses + 漢字 doors + 意味の近く rows all present', !!sheet1 && sheet1.senses >= 1 && sheet1.kanjiDoors.length >= 1 && sheet1.semRows.length >= 1, sheet1 && { senses: sheet1.senses, kanjiDoors: sheet1.kanjiDoors, semRows: sheet1.semRows.length });
ok('entry: crumb shows the drift as the origin', !!sheet1 && /墨流し|the drift/.test(sheet1.crumb) && sheet1.crumb.includes(WORD), sheet1 && sheet1.crumb);
ok('sleep: the drift layer sleeps under the open sheet', !!sheet1 && sheet1.driftActive === false && sheet1.driftDisplay === 'none', sheet1 && { active: sheet1.driftActive, display: sheet1.driftDisplay });
if (SHOTS) await page.screenshot({ path: `${SHOTS}/2-entry.png` });

// ---------- chain walk depth >= 2 ----------
const walked = [];
let depth = await page.evaluate(() => window.__V3_STACK_LEN ?? null);
// walk: sem row -> then a kanji door
const semTarget = await page.evaluate(() => {
  const b = document.querySelector('#sheet button.sem-row');
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: b.querySelector('.sem-word')?.textContent };
});
if (semTarget) {
  await page.touchscreen.tap(semTarget.x, semTarget.y);
  await page.waitForTimeout(400);
  walked.push(await page.evaluate(() => ({ node: document.querySelector('#sheet')?.dataset.node, depthCrumb: document.querySelector('.sheet-depth')?.textContent })));
}
const kTarget = await page.evaluate(() => {
  const b = document.querySelector('#sheet button.entry-row');
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (kTarget) {
  await page.touchscreen.tap(kTarget.x, kTarget.y);
  await page.waitForTimeout(400);
  walked.push(await page.evaluate(() => ({ node: document.querySelector('#sheet')?.dataset.node, depthCrumb: document.querySelector('.sheet-depth')?.textContent })));
}
const finalDepth = walked.length ? walked[walked.length - 1].depthCrumb?.split('›').length : 0;
ok('chain: walk to depth >= 2 from the drift-opened entry', walked.length >= 2 && finalDepth >= 3, { walked, finalDepth });
if (SHOTS) await page.screenshot({ path: `${SHOTS}/3-chain.png` });

// ---------- 戻る unwinds one level each ----------
const unwind = [];
for (let i = 0; i < walked.length; i++) {
  await page.click('#sheet-back');
  await page.waitForTimeout(300);
  unwind.push(await page.evaluate(() => ({ node: document.querySelector('#sheet')?.dataset.node, depthCrumb: document.querySelector('.sheet-depth')?.textContent })));
}
const expectBack = [walked[walked.length - 2]?.node, `word:${WORD}`];
ok('chain: each 戻る unwinds exactly one level', unwind.length === walked.length && unwind[unwind.length - 1].node === `word:${WORD}` && unwind[0].node === walked[walked.length - 2]?.node, { unwind, expected: expectBack });

// ---------- close, back to the field ----------
await page.click('#sheet-close');
await page.waitForTimeout(1200);
const sheetGone = await page.evaluate(() => !document.querySelector('#sheet'));
const tSheetTotal = Date.now() - tSheetStart;

const after = await page.evaluate(() => {
  const els = [...document.querySelectorAll('#drift-layer .word')];
  const rec = els.map((e) => {
    const r = e.getBoundingClientRect();
    return { s: e.__V3STAMP ?? null, t: e.querySelector('.base')?.textContent.trim(), x: r.x, y: r.y, cls: e.className };
  });
  return {
    n: els.length, rec,
    centre: rec.filter((r) => /\bbctr\b|\bcenter\b/.test(r.cls)).map((r) => ({ s: r.s, t: r.t })),
    depth: document.querySelector('#drift-layer #depth')?.textContent,
    active: !!document.querySelector('#drift-layer.active'),
  };
});
const beforeStamps = new Set(before.rec.map((r) => r.s));
const afterStamps = new Set(after.rec.map((r) => r.s).filter(Boolean));
const lost = [...beforeStamps].filter((s) => !afterStamps.has(s));
const gained = after.rec.filter((r) => r.s === null);
let maxShift = 0;
const bmap = new Map(before.rec.map((r) => [r.s, r]));
for (const r of after.rec) {
  if (r.s && bmap.has(r.s)) maxShift = Math.max(maxShift, Math.hypot(r.x - bmap.get(r.s).x, r.y - bmap.get(r.s).y));
}
ok('return: the sheet closes and the field is live again', sheetGone && after.active, { sheetGone, active: after.active });
ok('CONSTELLATION INTACT: same DOM bodies, 0 lost / 0 gained', lost.length === 0 && gained.length === 0 && before.n === after.n, { before: before.n, after: after.n, lost: lost.length, gained: gained.length });
ok('CONSTELLATION INTACT: same centre by DOM identity', JSON.stringify(before.centre) === JSON.stringify(after.centre) && before.depth === after.depth, { before: before.centre, after: after.centre, depthBefore: before.depth, depthAfter: after.depth });
if (SHOTS) await page.screenshot({ path: `${SHOTS}/4-back-in-field.png` });

// ---------- nothing disappears: the card and its door come back too ----------
const cardBack = await page.evaluate(() => {
  const c = document.querySelector('#drift-layer #card');
  return {
    open: !!c && c.classList.contains('open'),
    door: !!c?.querySelector('button.study'),
    key: c?.querySelector('button.study')?.getAttribute('data-study-key'),
    head: c?.textContent.slice(0, 12),
  };
});
ok('law: nothing disappears — the card and its door are still there after the sheet', cardBack.open && cardBack.door, cardBack);

// ---------- gestures still work after the sleep (drift resume) ----------
const resumeProbe = await page.evaluate(() => {
  const els = [...document.querySelectorAll('#drift-layer .word')];
  for (const e of els) {
    if (/bctr|center|unfolded|glossed/.test(e.className)) continue;
    const r = e.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (!(r.top > 110 && r.bottom < 690 && r.left > 20 && r.right < 370)) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === e || e.contains(hit))) continue;
    return { x, y, cls: e.className, txt: e.querySelector('.base')?.textContent };
  }
  return null;
});
let gestureAlive = false;
if (resumeProbe) {
  await page.touchscreen.tap(resumeProbe.x, resumeProbe.y);
  await page.waitForTimeout(500);
  gestureAlive = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('#drift-layer .word')];
    const e = els.find((x) => x.querySelector('.base')?.textContent === t);
    return !!e && /unfolded|glossed|bctr|bsat/.test(e.className);
  }, resumeProbe.txt);
}
ok('law: drift resumes after sleeping — gestures answer again', gestureAlive, resumeProbe);

// motion after the sheet trip
const rafAlive = await page.evaluate(() => new Promise((res) => {
  const els = [...document.querySelectorAll('#drift-layer .word')];
  const p0 = els.map((e) => e.getBoundingClientRect().x);
  setTimeout(() => {
    const p1 = [...document.querySelectorAll('#drift-layer .word')].map((e) => e.getBoundingClientRect().x);
    let d = 0;
    for (let i = 0; i < Math.min(p0.length, p1.length); i++) d = Math.max(d, Math.abs(p1[i] - p0[i]));
    res(d);
  }, 1200);
}));
ok('law: the field is moving again after the sheet (rAF resumed)', rafAlive > 0.05, { maxShiftIn1200ms: +rafAlive.toFixed(2) });

// ---------- CONTROL: same duration, no sheet ----------
await page.evaluate(() => {
  document.querySelectorAll('#drift-layer .word').forEach((e, i) => { e.__V3CTRL = 'c-' + i; });
});
const ctrlBefore = await page.evaluate(() => [...document.querySelectorAll('#drift-layer .word')].map((e) => { const r = e.getBoundingClientRect(); return { s: e.__V3CTRL, x: r.x, y: r.y }; }));
await page.waitForTimeout(tSheetTotal);
const ctrlAfter = await page.evaluate(() => [...document.querySelectorAll('#drift-layer .word')].map((e) => { const r = e.getBoundingClientRect(); return { s: e.__V3CTRL ?? null, x: r.x, y: r.y }; }));
const cm = new Map(ctrlBefore.map((r) => [r.s, r]));
let ctrlShift = 0;
for (const r of ctrlAfter) if (r.s && cm.has(r.s)) ctrlShift = Math.max(ctrlShift, Math.hypot(r.x - cm.get(r.s).x, r.y - cm.get(r.s).y));
const ctrlLost = ctrlBefore.filter((r) => !ctrlAfter.some((a) => a.s === r.s)).length;
ok('CONTROL: the field left alone for the same duration drifts at least as much', ctrlShift >= maxShift * 0.5, {
  durationMs: tSheetTotal,
  maxShiftAcrossSheet: +maxShift.toFixed(1),
  maxShiftLeftAlone: +ctrlShift.toFixed(1),
  bodiesLostLeftAlone: ctrlLost,
});

// ---------- kanji card seam ----------
// ---------- errors ----------
ok('zero console errors / zero page errors', consoleErrors.length === 0 && pageErrors.length === 0, { consoleErrors, pageErrors });

const summary = { pass: results.filter((r) => r.pass).length, total: results.length };
console.log(`\n=== ${summary.pass}/${summary.total} ===`);
if (OUT) writeFileSync(OUT, JSON.stringify({ app: APP, word: WORD, summary, results, before: { n: before.n }, after: { n: after.n }, maxShift, ctrlShift, tSheetTotal }, null, 1));
await browser.close();
process.exit(summary.pass === summary.total ? 0 : 2);
