/* Probe 6: adversarial edges — 1-stroke kanji, 23-stroke kanji, double-fire
 * the door, keyboard-only entry, replay spam, close mid-replay. */
import { serve, check, R, noiseWatch } from './vlib.mjs';
const { chromium } = await import('playwright-core');

const noise = [];
const { server, base } = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function open(ch, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...opts });
  const page = await ctx.newPage();
  noiseWatch(page, noise, ch);
  await page.addInitScript(() => {
    window.__raf = 0;
    const o = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { window.__raf += 1; return o(cb); };
  });
  await page.goto(`${base}/index.html?entry=shelf&ui=bi`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#search');
  await page.fill('#search', ch);
  await page.waitForTimeout(500);
  await page.waitForSelector(`[data-result="kanji:${ch}"]`, { timeout: 8000 });
  await page.locator(`[data-result="kanji:${ch}"]`).click();
  await page.waitForTimeout(320);
  return { ctx, page };
}
const SNAP = `(() => {
  const p = document.querySelector('#stroke-page');
  if (!p) return null;
  const inked = [...p.querySelectorAll('.stroke-ink path')].map(x => {
    const l = Number(x.dataset.len)||0, o = parseFloat(x.style.strokeDashoffset||'NaN');
    return l ? +(1-o/l).toFixed(4) : null; });
  const c = p.querySelector('#stroke-count');
  return { state: p.dataset.state, strokes: +p.dataset.strokes, inked,
    text: c?.textContent, cur: +c?.dataset.current, total: +c?.dataset.total,
    prevDis: p.querySelector('#stroke-prev')?.disabled, nextDis: p.querySelector('#stroke-next')?.disabled,
    countRole: c?.getAttribute('role'), pages: document.querySelectorAll('.stroke-page').length,
    focusable: [...p.querySelectorAll('button')].filter(b=>!b.disabled && b.offsetParent!==null).map(b=>b.id) };
})()`;

/* ---- 1-stroke kanji 一 ---- */
{
  const { ctx, page } = await open('一');
  await page.evaluate(`document.querySelector('#strokes-door').click()`);
  await page.waitForSelector('#stroke-page');
  await page.waitForFunction(`document.querySelector('#stroke-page').dataset.state === 'done'`, { timeout: 15000 });
  const s = await page.evaluate(SNAP);
  check('一 (1 stroke): animates to 1 / 1 and completes', s.strokes === 1 && s.cur === 1 && s.total === 1 && s.inked[0] > 0.999,
    JSON.stringify({ text: s.text, state: s.state, drawn: s.inked }));
  await ctx.close();
}
{
  const { ctx, page } = await open('一', { reducedMotion: 'reduce' });
  await page.evaluate(`document.querySelector('#strokes-door').click()`);
  await page.waitForSelector('#stroke-page');
  await page.waitForTimeout(300);
  const s = await page.evaluate(SNAP);
  check('一 under reduced motion: BOTH step controls are permanently disabled (1 stroke has no steps)',
    s.prevDis === true && s.nextDis === true, `prev disabled=${s.prevDis} next disabled=${s.nextDis}, focusable=${JSON.stringify(s.focusable)}`);
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const inPage = await page.evaluate(`!!document.querySelector('#stroke-page').contains(document.activeElement)`);
  check('一 reduced motion: focus trap still holds with two dead controls', inPage, `activeInPage=${inPage}`);
  await ctx.close();
}

/* ---- a 23-stroke kanji ---- */
{
  const { ctx, page } = await open('鑑');
  await page.evaluate(`document.querySelector('#strokes-door').click()`);
  await page.waitForSelector('#stroke-page');
  const t0 = Date.now();
  await page.waitForFunction(`document.querySelector('#stroke-page').dataset.state === 'done'`, { timeout: 60000 });
  const ms = Date.now() - t0;
  const s = await page.evaluate(SNAP);
  const overflow = await page.evaluate(`(() => { const p=document.querySelector('#stroke-page');
    return { docS: document.documentElement.scrollWidth, docC: document.documentElement.clientWidth,
             pS: p.scrollHeight, pC: p.clientHeight }; })()`);
  check('鑑 (23 strokes): completes, all drawn, counter 23 / 23',
    s.strokes === 23 && s.cur === 23 && s.inked.every(d => d > 0.999),
    `${s.text} in ${ms}ms, layout ${JSON.stringify(overflow)}`);
  check('鑑: the page does not overflow with 23 numbered strokes',
    overflow.docS <= overflow.docC && overflow.pS <= overflow.pC + 1,
    JSON.stringify(overflow));
  await ctx.close();
}

/* ---- double-fire the door, replay spam, close mid-replay ---- */
{
  const { ctx, page } = await open('年');
  await page.evaluate(`(() => { const d = document.querySelector('#strokes-door'); d.click(); d.click(); d.click(); })()`);
  await page.waitForSelector('#stroke-page');
  await page.waitForTimeout(400);
  const s = await page.evaluate(SNAP);
  check('triple-firing the door still yields exactly one stroke page', s.pages === 1, `pages=${s.pages}`);
  // replay spam
  for (let i = 0; i < 12; i++) await page.evaluate(`document.querySelector('#stroke-replay').click()`);
  await page.waitForTimeout(120);
  const mid = await page.evaluate(SNAP);
  await page.waitForFunction(`document.querySelector('#stroke-page').dataset.state === 'done'`, { timeout: 25000 });
  const end = await page.evaluate(SNAP);
  check('12× replay spam: one animation survives, still finishes cleanly',
    end.cur === end.total && end.inked.every(d => d > 0.999), `mid=${mid.text} end=${end.text}`);
  // close mid-replay
  await page.evaluate(`document.querySelector('#stroke-replay').click()`);
  await page.waitForTimeout(80);
  await page.evaluate(`document.querySelector('#strokes-close').click()`);
  await page.waitForTimeout(200);
  const rafA = await page.evaluate('window.__raf');
  await page.waitForTimeout(900);
  const rafB = await page.evaluate('window.__raf');
  check('closing mid-replay kills the rAF loop', rafB - rafA <= 2, `idle rAF ${rafB - rafA}`);
  // keyboard-only entry: focus the door and press Enter
  await page.evaluate(`document.querySelector('#strokes-door').focus()`);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#stroke-page');
  const kb = await page.evaluate(`(() => ({ open: !!document.querySelector('#stroke-page'),
    active: document.activeElement.id }))()`);
  check('the door opens from the keyboard and hands focus into the dialog',
    kb.open && kb.active === 'strokes-back', JSON.stringify(kb));
  await ctx.close();
}

console.log('\nnoise:', JSON.stringify(noise));
check('zero errors across probe 6', noise.length === 0, `${noise.length}`);
console.log(`\nPROBE 6: ${R.pass} pass / ${R.fail} fail`);
await browser.close();
server.close();
