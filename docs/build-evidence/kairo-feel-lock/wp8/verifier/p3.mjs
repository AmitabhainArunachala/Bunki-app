/* Probe 3: no-data kanji, Escape, back() ordering against a sheet stack,
 * repeated open/close for state leaks, localStorage silence. */
import { serve, check, R, noiseWatch, tap, hold } from './vlib.mjs';
const { chromium } = await import('playwright-core');

const noise = [];
const { server, base } = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
noiseWatch(page, noise, 'p3');
await page.addInitScript(() => {
  window.__ls = [];
  const o = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { window.__ls.push({ k, v: String(v).slice(0, 40) }); return o.call(this, k, v); };
  window.__raf = 0;
  const or = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { window.__raf += 1; return or(cb); };
});

/* =============== 1. a kanji WITHOUT stroke data: 丑 =============== */
await page.goto(`${base}/index.html?entry=shelf&ui=bi`, { waitUntil: 'networkidle' });
await page.waitForSelector('#search');
await page.fill('#search', '丑');
await page.waitForTimeout(500);
await page.waitForSelector('[data-result="kanji:丑"]', { timeout: 8000 });
await page.locator('[data-result="kanji:丑"]').click();
await page.waitForTimeout(350);
const node = await page.locator('#sheet').getAttribute('data-node');
check('search reaches the 丑 kanji sheet', node === 'kanji:丑', `node=${node}`);

const bareDoor = await page.evaluate(`(() => {
  const d = document.querySelector('#strokes-door');
  if (!d) return null;
  const r = d.getBoundingClientRect();
  return { cls: d.className, strokes: +d.dataset.strokes, label: d.getAttribute('aria-label'),
           title: d.querySelector('.stroke-door-title')?.textContent,
           sub: d.querySelector('.stroke-door-sub')?.textContent,
           hasThumb: !!d.querySelector('svg.strokes'),
           glyph: d.querySelector('.stroke-door-glyph')?.textContent,
           color: getComputedStyle(d).color, border: getComputedStyle(d).borderColor,
           bg: getComputedStyle(d).backgroundColor,
           w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
})()`);
check('丑 door exists and is marked bare (no thumbnail, glyph instead)',
  bareDoor && bareDoor.strokes === 0 && !bareDoor.hasThumb && bareDoor.glyph === '丑' && /bare/.test(bareDoor.cls),
  JSON.stringify(bareDoor));

await page.evaluate(`document.querySelector('#strokes-door').click()`);
await page.waitForSelector('#stroke-page');
const nd = await page.evaluate(`(() => {
  const p = document.querySelector('#stroke-page');
  const r = p.getBoundingClientRect();
  const line = p.querySelector('.stroke-missing-line');
  const note = p.querySelector('.stroke-missing-note');
  const gr = p.querySelector('.stroke-missing-glyph');
  const red = getComputedStyle(document.documentElement).getPropertyValue('--red').trim();
  return { state: p.dataset.state, strokes: +p.dataset.strokes, role: p.getAttribute('role'),
    modal: p.getAttribute('aria-modal'),
    box: { x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1) },
    vp: { w: innerWidth, h: innerHeight },
    line: line?.textContent, note: note?.textContent, glyph: gr?.textContent,
    lineColor: line ? getComputedStyle(line).color : null,
    noteColor: note ? getComputedStyle(note).color : null,
    glyphColor: gr ? getComputedStyle(gr).color : null,
    boxBg: getComputedStyle(p.querySelector('.stroke-missing')).backgroundColor,
    boxBorder: getComputedStyle(p.querySelector('.stroke-missing')).borderColor,
    pageBg: getComputedStyle(p).backgroundColor,
    redToken: red,
    hasCounter: !!p.querySelector('#stroke-count'),
    hasReplay: !!p.querySelector('#stroke-replay'),
    controls: [...p.querySelectorAll('button')].map(b => b.id),
    ariaLive: p.querySelector('[role=alert]') ? 'alert-present' : 'none',
  };
})()`);
check('丑 page is a full-screen dialog with the honest fallback',
  nd.state === 'nodata' && nd.strokes === 0 && nd.role === 'dialog' && nd.modal === 'true' &&
  nd.box.w === nd.vp.w && nd.box.h === nd.vp.h,
  JSON.stringify({ state: nd.state, box: nd.box, vp: nd.vp }));
check('丑 fallback is bilingual and says what IS known',
  /筆順のデータはまだない/.test(nd.line) && /Stroke data not yet available/.test(nd.line) &&
  /画/.test(nd.note) && /KanjiVG/.test(nd.note),
  `line="${nd.line}" note="${nd.note}"`);
check('丑 fallback is NOT styled as a warning (no --red anywhere, no role=alert)',
  nd.lineColor !== nd.redToken && ![nd.lineColor, nd.noteColor, nd.glyphColor, nd.boxBorder, nd.boxBg]
    .some((c) => c === nd.redToken) && nd.ariaLive === 'none',
  `--red=${nd.redToken}; line=${nd.lineColor} note=${nd.noteColor} glyph=${nd.glyphColor} border=${nd.boxBorder}`);
check('丑 page offers no counter/replay it cannot honour',
  !nd.hasCounter && !nd.hasReplay, `controls=${JSON.stringify(nd.controls)}`);

// exit 1: ✕
await page.evaluate(`document.querySelector('#strokes-close').click()`);
await page.waitForTimeout(300);
const afterClose = await page.evaluate(`({ open: !!document.querySelector('#stroke-page'),
  node: document.querySelector('#sheet')?.getAttribute('data-node'),
  active: document.activeElement.id || document.activeElement.className })`);
check('丑 exit via ✕ returns to the sheet with focus on the door',
  !afterClose.open && afterClose.node === 'kanji:丑' && afterClose.active === 'strokes-door',
  JSON.stringify(afterClose));

// exit 2: Escape
await page.evaluate(`document.querySelector('#strokes-door').click()`);
await page.waitForSelector('#stroke-page');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const afterEsc = await page.evaluate(`({ open: !!document.querySelector('#stroke-page'),
  node: document.querySelector('#sheet')?.getAttribute('data-node'),
  active: document.activeElement.id || document.activeElement.className })`);
check('丑 exit via Escape returns to the sheet with focus on the door',
  !afterEsc.open && afterEsc.node === 'kanji:丑' && afterEsc.active === 'strokes-door',
  JSON.stringify(afterEsc));
check('zero errors across the whole 丑 visit', noise.length === 0, JSON.stringify(noise));

/* =============== 2. back() ordering with a sheet stack beneath =============== */
await page.goto(`${base}/index.html?entry=shelf&ui=bi`, { waitUntil: 'networkidle' });
await page.waitForSelector('.shelf-item');
await tap(page, '.shelf-item');
await page.waitForSelector('#reader .tok');
await hold(page, '#reader .tok.content');
await page.waitForSelector('#sheet [data-kanjirow]');
const stack0 = await page.locator('#sheet').getAttribute('data-node');
await tap(page, '#sheet [data-kanjirow]');
await page.waitForTimeout(280);
const stack1 = await page.locator('#sheet').getAttribute('data-node');
// go one deeper: a component/radical or another kanji, so the stack is ≥3 deep
const deeper = await page.evaluate(`(() => {
  const c = [...document.querySelectorAll('#sheet .chip, #sheet [data-kanjirow]')]
    .find(n => n.textContent.trim().length);
  if (!c) return null; c.click(); return c.textContent.trim().slice(0,6);
})()`);
await page.waitForTimeout(300);
const stack2 = await page.locator('#sheet').getAttribute('data-node');
console.log(`  stack: ${stack0} → ${stack1} → ${stack2} (tapped "${deeper}")`);
check('a sheet stack ≥3 deep exists beneath', stack0 !== stack1 && stack1 !== stack2,
  `${stack0} / ${stack1} / ${stack2}`);

const hasDoor = await page.evaluate(`!!document.querySelector('#strokes-door')`);
if (!hasDoor) {
  // walk back to a kanji sheet if the deepest is a radical
  await page.evaluate(`document.querySelector('#sheet [data-action="navigation.back"], #sheet .sheet-back')?.click()`);
  await page.waitForTimeout(250);
}
const nodeUnder = await page.locator('#sheet').getAttribute('data-node');
await page.evaluate(`document.querySelector('#strokes-door').click()`);
await page.waitForSelector('#stroke-page');
await page.evaluate(`document.querySelector('#strokes-back').click()`);
await page.waitForTimeout(300);
const peel = await page.evaluate(`({ open: !!document.querySelector('#stroke-page'),
  node: document.querySelector('#sheet')?.getAttribute('data-node') })`);
check('戻る peels the stroke layer first and never pops the sheet beneath',
  !peel.open && peel.node === nodeUnder, `under=${nodeUnder} after=${JSON.stringify(peel)}`);

// Escape twice: first closes stroke page, second dismisses the sheet stack
await page.evaluate(`document.querySelector('#strokes-door').click()`);
await page.waitForSelector('#stroke-page');
await page.keyboard.press('Escape');
await page.waitForTimeout(280);
const esc1 = await page.evaluate(`({ open: !!document.querySelector('#stroke-page'),
  node: document.querySelector('#sheet')?.getAttribute('data-node') })`);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const esc2 = await page.evaluate(`({ open: !!document.querySelector('#stroke-page'),
  sheet: !!document.querySelector('#sheet'),
  node: document.querySelector('#sheet')?.getAttribute('data-node') })`);
check('Escape #1 peels only the stroke layer; Escape #2 acts on the sheet',
  !esc1.open && esc1.node === nodeUnder && esc2.open === false,
  `esc1=${JSON.stringify(esc1)} esc2=${JSON.stringify(esc2)}`);

/* =============== 3. 10× open/close for state leaks =============== */
await page.goto(`${base}/index.html?entry=shelf&ui=bi`, { waitUntil: 'networkidle' });
await page.waitForSelector('.shelf-item');
await tap(page, '.shelf-item');
await page.waitForSelector('#reader .tok');
await hold(page, '#reader .tok.content');
await page.waitForSelector('#sheet [data-kanjirow]');
await tap(page, '#sheet [data-kanjirow]');
await page.waitForTimeout(300);
const cycNode = await page.locator('#sheet').getAttribute('data-node');
const cycles = [];
for (let i = 0; i < 10; i++) {
  const rafA = await page.evaluate('window.__raf');
  await page.evaluate(`document.querySelector('#strokes-door').click()`);
  await page.waitForSelector('#stroke-page');
  await page.waitForTimeout(i % 2 ? 120 : 900); // half interrupted mid-draw
  const method = i % 3;
  if (method === 0) await page.evaluate(`document.querySelector('#strokes-back').click()`);
  else if (method === 1) await page.evaluate(`document.querySelector('#strokes-close').click()`);
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(260);
  const rafB = await page.evaluate('window.__raf');
  await page.waitForTimeout(500);
  const rafC = await page.evaluate('window.__raf');
  cycles.push({
    i, method: ['back', 'close', 'esc'][method],
    open: await page.evaluate(`!!document.querySelector('#stroke-page')`),
    node: await page.locator('#sheet').getAttribute('data-node'),
    doors: await page.evaluate(`document.querySelectorAll('#strokes-door').length`),
    pages: await page.evaluate(`document.querySelectorAll('#stroke-page, .stroke-page').length`),
    idleRaf: rafC - rafB,
  });
}
check('10 open/close cycles leave no stroke page and no duplicate doors',
  cycles.every((c) => !c.open && c.doors === 1 && c.pages === 0 && c.node === cycNode),
  JSON.stringify(cycles.filter((c) => c.open || c.doors !== 1 || c.pages !== 0)) || 'clean');
check('no orphan rAF loop survives any of the 10 closes (incl. mid-draw interrupts)',
  cycles.every((c) => c.idleRaf <= 2),
  `idle rAF per cycle: ${cycles.map((c) => `${c.method}:${c.idleRaf}`).join(' ')}`);

const ls = await page.evaluate('window.__ls');
check('no localStorage writes anywhere in this whole session', ls.length === 0, JSON.stringify(ls));
check('zero console/page/network errors across probe 3', noise.length === 0, JSON.stringify(noise));

console.log(`\nPROBE 3: ${R.pass} pass / ${R.fail} fail`);
await browser.close();
server.close();
