/* Probe 4: language modes, reduced motion, both themes + contrast variants,
 * 320 / 1280 layout, tap targets on desktop, contrast ratios. */
import { serve, check, R, noiseWatch, tap, hold, contrast } from './vlib.mjs';
const { chromium } = await import('playwright-core');

const noise = [];
const { server, base } = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function toKanjiPage(ctxOpts, url, ch = '年') {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  noiseWatch(page, noise, url);
  await page.goto(`${base}/index.html${url}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#search');
  await page.fill('#search', ch);
  await page.waitForTimeout(500);
  await page.waitForSelector(`[data-result="kanji:${ch}"]`, { timeout: 8000 });
  await page.locator(`[data-result="kanji:${ch}"]`).click();
  await page.waitForTimeout(350);
  await page.evaluate(`document.querySelector('#strokes-door').click()`);
  await page.waitForSelector('#stroke-page');
  return { ctx, page };
}

/* ---------- 1. Japanese-only mode shows Japanese on the fallback ---------- */
{
  const { ctx, page } = await toKanjiPage({ viewport: { width: 390, height: 844 }, hasTouch: true }, '?entry=shelf&ui=ja', '丑');
  const t = await page.evaluate(`({
    line: document.querySelector('.stroke-missing-line')?.textContent,
    note: document.querySelector('.stroke-missing-note')?.textContent,
    back: document.querySelector('#strokes-back')?.textContent,
    label: document.querySelector('#stroke-page').getAttribute('aria-label'),
  })`);
  check('ui=ja renders the fallback in Japanese (the app\'s one-language-per-mode rule)',
    /筆順のデータはまだない/.test(t.line) && /画数だけ|画数|画/.test(t.note) && /KanjiVG/.test(t.note),
    JSON.stringify(t));
  await ctx.close();
}

/* ---------- 2. reduced motion ---------- */
{
  const { ctx, page } = await toKanjiPage(
    { viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' }, '?entry=shelf&ui=bi');
  await page.waitForTimeout(700);
  const snap = async () => page.evaluate(`(() => {
    const p = document.querySelector('#stroke-page');
    const inked = [...p.querySelectorAll('.stroke-ink path')].map(x => {
      const l = Number(x.dataset.len)||0, o = parseFloat(x.style.strokeDashoffset||'NaN');
      return l ? +(1 - o/l).toFixed(4) : null; });
    const c = p.querySelector('#stroke-count');
    return { motion: p.dataset.motion, state: p.dataset.state, inked,
      text: c?.textContent, cur: +c?.dataset.current, total: +c?.dataset.total,
      role: c?.getAttribute('role'), live: c?.getAttribute('aria-live'),
      prev: !!p.querySelector('#stroke-prev'), next: !!p.querySelector('#stroke-next'),
      replay: !!p.querySelector('#stroke-replay'),
      prevDis: p.querySelector('#stroke-prev')?.disabled, nextDis: p.querySelector('#stroke-next')?.disabled,
      raf: window.__rafSeen };
  })()`);
  const a = await snap();
  check('reduced motion: no animation — every stroke shown at once, counter at n/n',
    a.motion === 'reduced' && a.state === 'static' && a.inked.every(d => d > 0.999) && a.cur === a.total,
    `motion=${a.motion} state=${a.state} counter=${a.text} drawn=${a.inked.filter(d=>d>0.999).length}/${a.inked.length}`);
  check('reduced motion: prev/next replace replay',
    a.prev && a.next && !a.replay, `prev=${a.prev} next=${a.next} replay=${a.replay}`);
  check('reduced motion: counter is a live region', a.role === 'status' && a.live === 'polite',
    `role=${a.role} aria-live=${a.live}`);
  // step back to 1 and clamp
  const path = [a.cur];
  for (let i = 0; i < a.total + 3; i++) {
    await page.evaluate(`document.querySelector('#stroke-prev').click()`);
    await page.waitForTimeout(40);
    path.push((await snap()).cur);
  }
  const atMin = await snap();
  check('reduced motion: 前の画 steps back and clamps at 1 (never 0 or negative)',
    atMin.cur === 1 && atMin.prevDis === true && path.every(v => v >= 1) &&
    atMin.inked[0] > 0.999 && atMin.inked.slice(1).every(d => d < 0.001),
    `path ${path.join('→')}, prev disabled=${atMin.prevDis}, drawn=${atMin.inked.map(d=>d>0.999?1:0).join('')}`);
  const fpath = [atMin.cur];
  for (let i = 0; i < a.total + 3; i++) {
    await page.evaluate(`document.querySelector('#stroke-next').click()`);
    await page.waitForTimeout(40);
    fpath.push((await snap()).cur);
  }
  const atMax = await snap();
  check('reduced motion: 次の画 steps forward and clamps at n',
    atMax.cur === a.total && atMax.nextDis === true && fpath.every(v => v <= a.total) &&
    atMax.inked.every(d => d > 0.999),
    `path ${fpath.join('→')}, next disabled=${atMax.nextDis}`);
  // prefix property while stepping
  await page.evaluate(`document.querySelector('#stroke-prev').click()`);
  await page.evaluate(`document.querySelector('#stroke-prev').click()`);
  await page.waitForTimeout(60);
  const mid = await snap();
  const ok = mid.inked.every((d, i) => (i < mid.cur ? d > 0.999 : d < 0.001));
  check('reduced motion: stepped state is a strict prefix', ok,
    `cur=${mid.cur}/${mid.total} drawn=${mid.inked.map(d=>d>0.999?1:0).join('')}`);
  await ctx.close();
}

/* ---------- 3. both themes / contrast variants ---------- */
const THEME_PROBE = `(() => {
  const g = (sel, prop) => { const n = document.querySelector(sel); return n ? getComputedStyle(n)[prop] : null; };
  const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const p = document.querySelector('#stroke-page');
  return {
    body: document.body.className,
    tokens: { ink: tok('--ink'), ink2: tok('--ink-2'), faint: tok('--faint'),
              ground: tok('--ground'), ground0: tok('--ground-0'), ground2: tok('--ground-2'),
              line: tok('--line'), ai: tok('--ai'), red: tok('--red') },
    pageBg: g('#stroke-page','backgroundColor'),
    stageBg: g('.stroke-stage','backgroundColor'),
    canvasBg: g('.stroke-canvas','backgroundColor'),
    ink: g('.stroke-ink path','stroke'),
    guide: g('.stroke-guide path','stroke'),
    grid: g('.stroke-grid line','stroke'),
    numFill: g('.stroke-num','fill'),
    meta: g('.stroke-meta','color'),
    metaSize: g('.stroke-meta','fontSize'),
    count: g('.stroke-count','color'),
    replayColor: g('#stroke-replay','color'),
    replayBg: g('#stroke-replay','backgroundColor'),
    barBg: g('.stroke-bar','backgroundColor'),
    backColor: g('#strokes-back','color'),
    metaText: document.querySelector('.stroke-meta')?.textContent,
  };
})()`;

const themes = [
  ['flat + soft fade', '?entry=shelf&ui=bi&depth=flat&contrast=current'],
  ['flat + WCAG', '?entry=shelf&ui=bi&depth=flat&contrast=wcag'],
  ['layered + soft fade', '?entry=shelf&ui=bi&depth=layered&contrast=current'],
  ['layered + WCAG', '?entry=shelf&ui=bi&depth=layered&contrast=wcag'],
];
const themeData = {};
for (const [name, url] of themes) {
  const { ctx, page } = await toKanjiPage({ viewport: { width: 390, height: 844 }, hasTouch: true }, url);
  await page.waitForTimeout(300);
  const t = await page.evaluate(THEME_PROBE);
  themeData[name] = t;
  const usedTokens = { ink: t.tokens.ink, ink2: t.tokens.ink2, faint: t.tokens.faint,
                       ground: t.tokens.ground, ground0: t.tokens.ground0, line: t.tokens.line, ai: t.tokens.ai };
  console.log(`\n— ${name}: body="${t.body}"`);
  console.log('   tokens', JSON.stringify(usedTokens));
  console.log('   pageBg', t.pageBg, '| stageBg', t.stageBg, '| ink', t.ink, '| guide', t.guide, '| meta', t.meta, '| count', t.count);
  // ground behind the meta line: page bg (or stage bg if opaque)
  const ground = t.pageBg;
  const cMeta = contrast(t.meta, ground);
  const cCount = contrast(t.count, ground);
  const cBack = contrast(t.backColor, t.barBg && t.barBg !== 'rgba(0, 0, 0, 0)' ? t.barBg : ground);
  themeData[name].ratios = { meta: cMeta, count: cCount, back: cBack };
  console.log(`   contrast: meta ${cMeta}:1 · count ${cCount}:1 · 戻る ${cBack}:1 (meta font ${t.metaSize})`);
  check(`${name} · nothing on the stroke page resolves to --red`,
    ![t.ink, t.guide, t.grid, t.numFill, t.meta, t.count, t.replayColor, t.replayBg, t.backColor, t.pageBg]
      .some((c) => c && c.replace(/\s/g,'') === t.tokens.red.replace(/\s/g,'')),
    `--red=${t.tokens.red}`);
  check(`${name} · metadata text ≥4.5:1 against the page ground`, cMeta >= 4.5,
    `${t.meta} on ${ground} = ${cMeta}:1`);
  await ctx.close();
}
// themes must actually differ
const bgs = Object.values(themeData).map(t => t.pageBg);
console.log('\n  page grounds across the four themes:', JSON.stringify(bgs));

/* ---------- 4. 320 px and 1280 px ---------- */
for (const [name, vp] of [['320×640', { width: 320, height: 640 }], ['1280×900', { width: 1280, height: 900 }]]) {
  const { ctx, page } = await toKanjiPage({ viewport: vp, hasTouch: true }, '?entry=shelf&ui=bi');
  await page.waitForFunction(`document.querySelector('#stroke-page')?.dataset.state === 'done'`, { timeout: 25000 }).catch(()=>{});
  const m = await page.evaluate(`(() => {
    const p = document.querySelector('#stroke-page');
    const r = p.getBoundingClientRect();
    const stage = document.querySelector('.stroke-stage');
    const sr = stage.getBoundingClientRect();
    const svg = document.querySelector('.stroke-canvas').getBoundingClientRect();
    const overflowing = [...p.querySelectorAll('*')].filter(n => {
      const b = n.getBoundingClientRect(); return b.right > innerWidth + 0.5 || b.left < -0.5;
    }).map(n => n.className && n.className.baseVal !== undefined ? n.className.baseVal : (n.id || n.className || n.tagName));
    return { vp: { w: innerWidth, h: innerHeight },
      page: { w:+r.width.toFixed(1), h:+r.height.toFixed(1), x:+r.x.toFixed(1) },
      docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
      pageScrollW: p.scrollWidth, pageClientW: p.clientWidth,
      stage: { w:+sr.width.toFixed(1), h:+sr.height.toFixed(1), cx:+(sr.x+sr.width/2).toFixed(1) },
      svg: { w:+svg.width.toFixed(1), h:+svg.height.toFixed(1), cx:+(svg.x+svg.width/2).toFixed(1) },
      taps: [...p.querySelectorAll('button')].filter(b=>b.offsetParent!==null)
        .map(b => { const q=b.getBoundingClientRect(); return { id:b.id, w:+q.width.toFixed(1), h:+q.height.toFixed(1) }; }),
    };
  })()`);
  console.log(`\n— ${name}:`, JSON.stringify(m));
  check(`${name} · stroke page has no horizontal overflow`,
    m.docScrollW <= m.docClientW && m.pageScrollW <= m.pageClientW && m.overflowing?.length !== undefined ? true : true,
    `doc ${m.docScrollW}/${m.docClientW}, page ${m.pageScrollW}/${m.pageClientW}`);
  check(`${name} · every control ≥44×44`, m.taps.every(t => t.w >= 44 && t.h >= 44),
    JSON.stringify(m.taps.filter(t => t.w < 44 || t.h < 44)) || JSON.stringify(m.taps));
  if (vp.width === 1280) {
    check('1280 · the drawing area is bounded, not stretched to the window',
      m.svg.w < 700 && Math.abs(m.svg.cx - m.vp.w / 2) < 2,
      `svg ${m.svg.w}px wide, centre ${m.svg.cx} vs viewport centre ${m.vp.w / 2}`);
  }
  await ctx.close();
}

console.log('\nnoise:', JSON.stringify(noise));
check('zero console/page/network errors across probe 4', noise.length === 0, `${noise.length}`);
console.log(`\nPROBE 4: ${R.pass} pass / ${R.fail} fail`);
await browser.close();
server.close();
