/* Probe 2: nail down the two probe-1 failures — numbers toggle mechanism and
 * the scroll restore — with measurements taken at the exact instants. */
import { serve, check, R, noiseWatch, tap, hold } from './vlib.mjs';
const { chromium } = await import('playwright-core');

const noise = [];
const { server, base } = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
noiseWatch(page, noise, 'p2');

await page.goto(`${base}/index.html?entry=shelf&ui=bi`, { waitUntil: 'networkidle' });
await page.waitForSelector('.shelf-item');
await tap(page, '.shelf-item');
await page.waitForSelector('#reader .tok');
await hold(page, '#reader .tok.content');
await page.waitForSelector('#sheet [data-kanjirow]');
await tap(page, '#sheet [data-kanjirow]');
await page.waitForTimeout(300);

/* ---- A. scroll restore, measured at the exact instant of the click ---- */
// Set the scroll, then fire a real click on the door WITHOUT any scrollIntoView,
// reading scrollTop in the same task as the dispatch.
const a = await page.evaluate(`(() => {
  const s = document.querySelector('#sheet');
  s.scrollTop = 1731;
  const atClick = s.scrollTop;
  document.querySelector('#strokes-door').click();
  return { set: 1731, atClick, h: s.scrollHeight };
})()`);
await page.waitForSelector('#stroke-page');
const openTop = await page.evaluate(`document.querySelector('#sheet').scrollTop`);
console.log('  A: set/atClick/openTop =', a.set, a.atClick, openTop, 'of', a.h);
await page.evaluate(`document.querySelector('#strokes-back').click()`);
await page.waitForTimeout(350);
const backTop = await page.evaluate(`document.querySelector('#sheet').scrollTop`);
check('A · scrollTop restored exactly (click dispatched with no scrollIntoView)',
  backTop === a.atClick, `${a.atClick} → ${backTop} (of ${a.h})`);

/* ---- B. same, but through a genuine touch tap (playwright scrollIntoView) ---- */
await page.evaluate(`document.querySelector('#sheet').scrollTop = 1731`);
const beforeTap = await page.evaluate(`document.querySelector('#sheet').scrollTop`);
await tap(page, '#strokes-door');
await page.waitForSelector('#stroke-page');
const openTop2 = await page.evaluate(`document.querySelector('#sheet').scrollTop`);
await tap(page, '#strokes-back');
await page.waitForTimeout(350);
const backTop2 = await page.evaluate(`document.querySelector('#sheet').scrollTop`);
console.log(`  B: before tap ${beforeTap} → sheet scrollTop at open ${openTop2} → after back ${backTop2}`);
check('B · restore equals the scroll the sheet actually had when the page opened',
  backTop2 === openTop2, `open ${openTop2} → back ${backTop2}`);
check('B · the implementer\'s 1731→1731 headline reproduces only if nothing scrolls the sheet first',
  beforeTap === 1731 && backTop2 !== 1731 ? false : true,
  `set 1731, at-open ${openTop2}, restored ${backTop2}`);

/* ---- C. numbers toggle measured the way the CSS actually works ---- */
await page.evaluate(`document.querySelector('#strokes-door').click()`);
await page.waitForSelector('#stroke-page');
await page.waitForFunction(`document.querySelector('#stroke-page').dataset.state === 'done'`, { timeout: 25000 });
const numState = async () => page.evaluate(`(() => {
  const g = document.querySelector('.stroke-nums');
  const one = document.querySelector('.stroke-num');
  const r = one ? one.getBoundingClientRect() : null;
  return { attr: document.querySelector('#stroke-page').dataset.numbers,
           display: g ? getComputedStyle(g).display : null,
           opacity: one ? getComputedStyle(one).opacity : null,
           painted: r ? (r.width > 0 && r.height > 0) : null,
           pressed: document.querySelector('#stroke-numbers').getAttribute('aria-pressed') };
})()`);
const n1 = await numState();
await page.evaluate(`document.querySelector('#stroke-numbers').click()`);
await page.waitForTimeout(150);
const n2 = await numState();
await page.evaluate(`document.querySelector('#stroke-numbers').click()`);
await page.waitForTimeout(200);
const n3 = await numState();
check('C · numbers toggle really hides the group (display:none) and restores it',
  n1.display !== 'none' && n1.painted === true &&
  n2.display === 'none' && n2.painted === false && n2.pressed === 'false' &&
  n3.display !== 'none' && n3.painted === true && n3.pressed === 'true',
  `on=${JSON.stringify(n1)} off=${JSON.stringify(n2)} back=${JSON.stringify(n3)}`);

/* ---- D. does the numbers preference survive closing the page? ---- */
await page.evaluate(`document.querySelector('#stroke-numbers').click()`); // → off
await page.waitForTimeout(120);
await page.evaluate(`document.querySelector('#strokes-back').click()`);
await page.waitForTimeout(300);
await page.evaluate(`document.querySelector('#strokes-door').click()`);
await page.waitForSelector('#stroke-page');
await page.waitForTimeout(200);
const n4 = await numState();
check('D · the numbers preference survives a close/reopen', n4.attr === 'off' && n4.pressed === 'false',
  JSON.stringify(n4));

console.log('\nnoise:', JSON.stringify(noise));
console.log(`\nPROBE 2: ${R.pass} pass / ${R.fail} fail`);
await browser.close();
server.close();
