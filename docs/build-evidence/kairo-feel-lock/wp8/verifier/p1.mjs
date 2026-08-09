/* WP8 verifier probe 1: the happy path — reader → word → kanji → 筆順 page. */
import { serve, check, R, noiseWatch, tap, hold } from './vlib.mjs';
const { chromium } = await import('playwright-core');

const PHONE = { width: 390, height: 844 };
const noise = [];

const PROBE = `(() => {
  const page = document.querySelector('#stroke-page');
  if (!page) return null;
  const inked = [...page.querySelectorAll('.stroke-ink path')].map((p) => {
    const len = Number(p.dataset.len) || 0;
    const off = parseFloat(p.style.strokeDashoffset || 'NaN');
    return { len: +len.toFixed(2), off: +off.toFixed(2),
             drawn: len === 0 ? null : +(1 - off / len).toFixed(4) };
  });
  const c = page.querySelector('#stroke-count');
  const r = page.getBoundingClientRect();
  const nums = [...page.querySelectorAll('.stroke-num')].map(n => +getComputedStyle(n).opacity);
  return {
    role: page.getAttribute('role'), modal: page.getAttribute('aria-modal'),
    label: page.getAttribute('aria-label'),
    kanji: page.dataset.kanji, state: page.dataset.state,
    motion: page.dataset.motion, numbers: page.dataset.numbers,
    strokes: +page.dataset.strokes,
    box: { x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1) },
    vp: { w: window.innerWidth, h: window.innerHeight },
    scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
    counterText: c ? c.textContent : null,
    current: c ? +c.dataset.current : null, total: c ? +c.dataset.total : null,
    inked, nums,
    numsVisible: nums.filter(o => o > 0.5).length,
    active: document.activeElement ? (document.activeElement.id || document.activeElement.className) : null,
    inert: (() => { const o={}; for (const ch of document.querySelector('#app').children)
      o[ch.id || ch.className || 'anon'] = { inert: !!ch.inert, ah: ch.getAttribute('aria-hidden') }; return o; })(),
    missing: page.querySelector('.stroke-missing-line')?.textContent ?? null,
    missingNote: page.querySelector('.stroke-missing-note')?.textContent ?? null,
    missingGlyph: page.querySelector('.stroke-missing-glyph')?.textContent ?? null,
    meta: page.querySelector('.stroke-meta')?.textContent ?? null,
  };
})()`;

/** strict-prefix property: drawn strokes must be 1,1,...,partial,0,0,...,0 */
function prefixViolation(inked) {
  let seenPartial = false, seenZero = false;
  for (let i = 0; i < inked.length; i++) {
    const d = inked[i].drawn;
    if (d == null) return `stroke ${i} has zero length`;
    if (seenZero && d > 0.001) return `stroke ${i} drawn ${d} after an undrawn stroke`;
    if (seenPartial && d > 0.001) return `stroke ${i} drawn ${d} after a partial stroke`;
    if (d < 0.001) seenZero = true;
    else if (d < 0.999) { if (seenPartial) return `two partial strokes (${i})`; seenPartial = true; }
  }
  return null;
}

const { server, base } = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
noiseWatch(page, noise, 'happy');

// instrument localStorage.setItem for the whole session
await page.addInitScript(() => {
  window.__lsWrites = [];
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    window.__lsWrites.push({ k, v: String(v).slice(0, 60), t: Date.now() });
    return orig.call(this, k, v);
  };
  window.__rafCount = 0;
  const oraf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { window.__rafCount += 1; return oraf(cb); };
});

await page.goto(`${base}/index.html?entry=shelf&ui=bi`, { waitUntil: 'networkidle' });
await page.waitForSelector('.shelf-item');
await tap(page, '.shelf-item');
await page.waitForSelector('#reader .tok');
await hold(page, '#reader .tok.content');
await page.waitForSelector('#sheet [data-kanjirow]');
const wordNode = await page.locator('#sheet').getAttribute('data-node');
check('reader → word sheet opened', !!wordNode, `sheet node=${wordNode}`);

await tap(page, '#sheet [data-kanjirow]');
await page.waitForTimeout(300);
const kanjiNode = await page.locator('#sheet').getAttribute('data-node');
check('word sheet → kanji sheet', /kanji/.test(String(kanjiNode)), `node=${kanjiNode}`);

// the door exists on the kanji sheet
const door = await page.evaluate(`(() => {
  const d = document.querySelector('#strokes-door');
  if (!d) return null;
  const r = d.getBoundingClientRect();
  return { strokes: +d.dataset.strokes, label: d.getAttribute('aria-label'),
           hasThumb: !!d.querySelector('svg.strokes'),
           thumbNums: d.querySelectorAll('svg.strokes text').length,
           w:+r.width.toFixed(1), h:+r.height.toFixed(1), tag: d.tagName };
})()`);
check('kanji sheet has a 筆順 door (button)', door && door.tag === 'BUTTON', JSON.stringify(door));
check('door keeps the numbered thumbnail for a kanji WITH data',
  door && door.hasThumb && door.thumbNums === door.strokes,
  `strokes=${door?.strokes} thumbNumbers=${door?.thumbNums}`);

// scroll the sheet somewhere non-trivial
const scrollInfo = await page.evaluate(`(() => {
  const s = document.querySelector('#sheet');
  s.scrollTop = Math.round(s.scrollHeight * 0.45);
  return { top: s.scrollTop, h: s.scrollHeight, text: s.textContent.length,
           doors: s.querySelectorAll('button, [role=button]').length };
})()`);
console.log('  sheet before:', JSON.stringify(scrollInfo));

await tap(page, '#strokes-door');
await page.waitForSelector('#stroke-page');
const t0 = await page.evaluate(PROBE);
check('stroke page is role=dialog aria-modal=true',
  t0.role === 'dialog' && t0.modal === 'true', `role=${t0.role} modal=${t0.modal} label=${t0.label}`);
check('stroke page fills the viewport exactly',
  t0.box.x === 0 && t0.box.y === 0 && t0.box.w === t0.vp.w && t0.box.h === t0.vp.h,
  `box=${JSON.stringify(t0.box)} vp=${JSON.stringify(t0.vp)}`);
check('no horizontal overflow at 390', t0.scrollW <= t0.clientW, `scrollW=${t0.scrollW} clientW=${t0.clientW}`);
check('sheet + everything but #stroke-page is inert',
  Object.entries(t0.inert).every(([k, v]) => (k === 'stroke-page' ? !v.inert : v.inert)),
  JSON.stringify(t0.inert));

// sample the animation at several mid-points, checking the prefix property each time
const samples = [];
for (let i = 0; i < 14; i++) {
  const s = await page.evaluate(PROBE);
  samples.push({ ms: i * 220, state: s.state, current: s.current, text: s.counterText,
                 drawn: s.inked.map((x) => x.drawn), viol: prefixViolation(s.inked) });
  if (s.state === 'done') break;
  await page.waitForTimeout(220);
}
const viols = samples.filter((s) => s.viol);
check('strict-prefix property holds at every sampled mid-point',
  viols.length === 0,
  viols.length ? JSON.stringify(viols[0]) : `${samples.length} samples, all prefixes`);
const currents = samples.map((s) => s.current);
check('counter is monotonically non-decreasing and advances',
  currents.every((c, i) => i === 0 || c >= currents[i - 1]) && currents.at(-1) > currents[0],
  `counter path ${currents.join('→')}`);
const anyPartial = samples.some((s) => s.drawn.some((d) => d > 0.001 && d < 0.999));
check('at least one sample caught a stroke mid-draw (it really animates)', anyPartial,
  `samples with a partial stroke: ${samples.filter(s=>s.drawn.some(d=>d>0.001&&d<0.999)).length}`);

await page.waitForFunction(`document.querySelector('#stroke-page')?.dataset.state === 'done'`, { timeout: 25000 });
const done = await page.evaluate(PROBE);
check('animation completes: all strokes drawn, counter n/n',
  done.inked.every((s) => s.drawn > 0.999) && done.current === done.total && done.total === done.strokes,
  `${done.counterText}, fully drawn ${done.inked.filter(s=>s.drawn>0.999).length}/${done.strokes}`);

// replay
const rafBefore = await page.evaluate('window.__rafCount');
await tap(page, '#stroke-replay');
await page.waitForTimeout(120);
const early = await page.evaluate(PROBE);
check('replay resets to the beginning',
  early.current <= 1 && early.inked.filter((s) => s.drawn > 0.999).length < done.strokes,
  `after replay: ${early.counterText}, fully drawn ${early.inked.filter(s=>s.drawn>0.999).length}`);
await page.waitForFunction(`document.querySelector('#stroke-page')?.dataset.state === 'done'`, { timeout: 25000 });
const done2 = await page.evaluate(PROBE);
check('replay completes again', done2.current === done2.total && done2.inked.every(s => s.drawn > 0.999),
  done2.counterText);

// numbers toggle
const numsOn = await page.evaluate(PROBE);
await tap(page, '#stroke-numbers');
await page.waitForTimeout(180);
const numsOff = await page.evaluate(PROBE);
const pressed = await page.locator('#stroke-numbers').getAttribute('aria-pressed');
await tap(page, '#stroke-numbers');
await page.waitForTimeout(180);
const numsBack = await page.evaluate(PROBE);
check('stroke-number toggle hides and restores the numbers',
  numsOn.numsVisible > 0 && numsOff.numsVisible === 0 && numsBack.numsVisible > 0 && pressed === 'false',
  `on=${numsOn.numsVisible} off=${numsOff.numsVisible} back=${numsBack.numsVisible} aria-pressed(off)=${pressed}`);

// tap targets at 390
const taps = await page.evaluate(`[...document.querySelectorAll('#stroke-page button, #stroke-page [role=button], #stroke-page a')]
  .filter(n => n.offsetParent !== null)
  .map(n => { const r = n.getBoundingClientRect(); return { id: n.id||n.className, w:+r.width.toFixed(1), h:+r.height.toFixed(1) }; })`);
const small = taps.filter((t) => t.w < 44 || t.h < 44);
check('every stroke-page control ≥44×44 at 390×844', small.length === 0,
  small.length ? JSON.stringify(small) : JSON.stringify(taps));

// focus trap
await page.locator('#strokes-back').focus();
const trap = [];
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Tab');
  trap.push(await page.evaluate(`(() => { const a = document.activeElement;
    return { id: a.id || a.className, inPage: !!document.querySelector('#stroke-page')?.contains(a) }; })()`));
}
const shiftTrap = [];
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('Shift+Tab');
  shiftTrap.push(await page.evaluate(`(() => { const a = document.activeElement;
    return { id: a.id || a.className, inPage: !!document.querySelector('#stroke-page')?.contains(a) }; })()`));
}
check('focus stays trapped inside the dialog (8 Tab + 4 Shift+Tab)',
  trap.every((t) => t.inPage) && shiftTrap.every((t) => t.inPage),
  `tab ring: ${[...new Set(trap.map(t=>t.id))].join(' → ')}`);

// back via 戻る: scroll + focus restore
const rafBeforeClose = await page.evaluate('window.__rafCount');
await tap(page, '#strokes-back');
await page.waitForTimeout(350);
const after = await page.evaluate(`(() => {
  const s = document.querySelector('#sheet');
  const a = document.activeElement;
  return { open: !!document.querySelector('#stroke-page'), top: s ? s.scrollTop : null,
           h: s ? s.scrollHeight : null, text: s ? s.textContent.length : null,
           doors: s ? s.querySelectorAll('button, [role=button]').length : null,
           node: s ? s.getAttribute('data-node') : null,
           active: a ? (a.id || a.className) : null,
           strokesState: window.__S ? 'exposed' : 'n/a',
           inert: (() => { const o={}; for (const ch of document.querySelector('#app').children)
             o[ch.id||ch.className||'anon'] = { inert: !!ch.inert, ah: ch.getAttribute('aria-hidden') }; return o; })() };
})()`);
check('戻る closes the stroke page', after.open === false, `#stroke-page present=${after.open}`);
check('sheet scrollTop restored EXACTLY', after.top === scrollInfo.top,
  `${scrollInfo.top} → ${after.top} (of ${after.h})`);
check('same sheet node / same content after return',
  after.node === kanjiNode && after.text === scrollInfo.text && after.doors === scrollInfo.doors,
  `node ${kanjiNode}→${after.node}, chars ${scrollInfo.text}→${after.text}, doors ${scrollInfo.doors}→${after.doors}`);
check('focus returns to the door that was pressed', after.active === 'strokes-door', `activeElement=${after.active}`);
check('sheet is live again (not inert) after close',
  after.inert.sheet && after.inert.sheet.inert === false, JSON.stringify(after.inert));

// rAF leak: is a loop still running after close?
const rafAfterClose1 = await page.evaluate('window.__rafCount');
await page.waitForTimeout(1200);
const rafAfterClose2 = await page.evaluate('window.__rafCount');
check('no rAF loop keeps running after the page closes',
  rafAfterClose2 - rafAfterClose1 <= 2,
  `rAF calls in 1.2s idle after close: ${rafAfterClose2 - rafAfterClose1} (total ${rafAfterClose2}, at close ${rafBeforeClose})`);

// localStorage writes over the whole visit
const writes = await page.evaluate('window.__lsWrites');
console.log('  localStorage writes during the whole visit:', JSON.stringify(writes));

console.log('\nnoise:', JSON.stringify(noise, null, 1));
check('zero console/page/network errors on the happy path', noise.length === 0, `${noise.length} events`);

console.log(`\nPROBE 1: ${R.pass} pass / ${R.fail} fail`);
await browser.close();
server.close();
process.exit(R.fail ? 1 : 0);
