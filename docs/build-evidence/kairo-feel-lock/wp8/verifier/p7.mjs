/* Probe 7: the scratch-built standalone carries WP8 intact (file:// single file). */
import { check, R, noiseWatch } from './vlib.mjs';
const { chromium } = await import('playwright-core');
const noise = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
noiseWatch(page, noise, 'standalone');
const url = 'file://' + process.env.SA_HTML + '?entry=shelf&ui=bi';
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('#search', { timeout: 20000 });
await page.fill('#search', '年');
await page.waitForTimeout(600);
await page.locator('[data-result="kanji:年"]').click();
await page.waitForTimeout(350);
await page.evaluate(`document.querySelector('#strokes-door').click()`);
await page.waitForSelector('#stroke-page');
await page.waitForFunction(`document.querySelector('#stroke-page').dataset.state === 'done'`, { timeout: 25000 });
const s = await page.evaluate(`(() => { const p = document.querySelector('#stroke-page');
  const c = p.querySelector('#stroke-count'); const r = p.getBoundingClientRect();
  return { role: p.getAttribute('role'), text: c.textContent, state: p.dataset.state,
    full: r.width === innerWidth && r.height === innerHeight,
    drawn: [...p.querySelectorAll('.stroke-ink path')].filter(x => parseFloat(x.style.strokeDashoffset) < 0.01).length }; })()`);
check('a freshly built standalone carries the whole 筆順 page', s.role === 'dialog' && s.state === 'done' && s.full && s.drawn === 6,
  JSON.stringify(s));
check('standalone: zero errors', noise.filter(n => !/favicon/.test(n.text)).length === 0, JSON.stringify(noise));
console.log(`\nPROBE 7: ${R.pass} pass / ${R.fail} fail`);
await browser.close();
