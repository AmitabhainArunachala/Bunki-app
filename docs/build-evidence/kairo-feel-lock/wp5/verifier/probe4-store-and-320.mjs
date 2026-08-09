import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const HEAD = '/home/user/Bunki-app/.claude/worktrees/agent-aed90f45a6a07960b/prototypes/corridor';
const BASE = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/base/prototypes/corridor';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function serve(root) {
  const server = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const file = resolve(root, rel);
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'cache-control': 'no-store', 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` })));
}
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${n}${d ? `  — ${d}` : ''}`); };
async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.errors = errors;
  return page;
}
async function open(page, base, q = '') {
  await page.goto(`${base}/index.html${q}`, { waitUntil: 'load' });
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
}
async function touchAt(page, selector, index, holdMs) {
  const t = page.locator(selector).nth(index);
  await t.scrollIntoViewIfNeeded();
  await page.waitForTimeout(60);
  const box = await t.evaluate((n) => { const r = n.getClientRects()[0] ?? n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  const cdp = await page.context().newCDPSession(page);
  const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 6, radiusY: 6, force: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  if (holdMs) await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(120);
}
const hold = async (p, s, i = 0) => { await touchAt(p, s, i, 2400); await p.waitForTimeout(250); };

async function main() {
  const head = await serve(HEAD);
  const baseSrv = await serve(BASE);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const V = { width: 390, height: 844 };

  console.log('\n=== take → persist: HEAD vs BASE (is any failure pre-existing?) ===');
  for (const [label, srv] of [['HEAD', head], ['BASE', baseSrv]]) {
    const page = await newPage(browser, V);
    await page.addInitScript(() => {
      window.__ls = [];
      const o = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { window.__ls.push([k, v]); return o.call(this, k, v); };
    });
    await open(page, srv.base, '?entry=shelf');
    await page.evaluate("document.querySelector('.shelf-item').click()");
    await page.waitForSelector('#reader .tok');
    await hold(page, '#reader .tok.content', 23);
    await page.waitForSelector('#sheet');
    const info = await page.evaluate(`(() => {
      const t = document.getElementById('take');
      if (!t) return {found:false, ids:[...document.querySelectorAll('#sheet button')].map(b=>b.id).filter(Boolean)};
      const r = t.getBoundingClientRect();
      let err = null;
      try { t.click(); } catch(e) { err = String(e); }
      return {found:true, text:t.textContent.trim(), rect:[Math.round(r.width),Math.round(r.height)], err};
    })()`);
    await page.waitForTimeout(600);
    const ls = await page.evaluate('window.__ls');
    const stored = await page.evaluate("localStorage.getItem('kairo-corridor-v1')");
    const takenNow = await page.evaluate("document.getElementById('take')?.textContent");
    let keys = [];
    try { keys = Object.keys(JSON.parse(stored || '{}')); } catch {}
    console.log(`  ${label}: takeBtn=${JSON.stringify(info)} writes=${ls.length} stored=${(stored||'null').slice(0,80)} btnAfter="${takenNow}" errors=${JSON.stringify(page.errors.slice(0,2))}`);
    check(`${label}: 覚える persists {taken,lists} only`,
      keys.length > 0 && keys.every(k => k === 'taken' || k === 'lists') && !/scroll/i.test(stored || ''),
      `schema=${JSON.stringify(keys)}`);
    await page.context().close();
  }

  console.log('\n=== @320 sheet: open via the tap ladder and audit ===');
  {
    const page = await newPage(browser, { width: 320, height: 568 });
    await open(page, head.base, '?entry=shelf');
    await page.evaluate("document.querySelector('.shelf-item').click()");
    await page.waitForSelector('#reader .tok');
    // default dial furigana=2 → 2 activations open the entry
    for (let i = 0; i < 5; i++) {
      if (await page.locator('#sheet').count()) break;
      await page.evaluate(`(() => {
        const v=[...document.querySelectorAll('#reader .tok.content')].filter(t=>{const r=t.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;});
        v[2]?.click();
      })()`);
      await page.waitForTimeout(220);
    }
    const opened = (await page.locator('#sheet').count()) > 0;
    const audit = await page.evaluate(`(() => {
      const out=[];
      for (const n of document.querySelectorAll('button, a[href], input, [role="button"]')) {
        if (n.classList.contains('tok')) continue;
        const r=n.getBoundingClientRect(); if(!r.width||!r.height) continue;
        const cs=getComputedStyle(n); if(cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0') continue;
        if (r.height < 43.5) out.push((n.id||n.className||n.tagName)+':'+Math.round(r.height));
      }
      const s=document.getElementById('sheet');
      const sr=s?s.getBoundingClientRect():null;
      return {bad:[...new Set(out)], sheet: sr?[Math.round(sr.x),Math.round(sr.width)]:null,
        overflow: document.documentElement.scrollWidth > innerWidth+1, sw: document.documentElement.scrollWidth};
    })()`);
    check('@320 sheet opens, 44px law holds, no overflow',
      opened && audit.bad.length === 0 && !audit.overflow,
      `opened=${opened} sheet=${JSON.stringify(audit.sheet)} bad=${JSON.stringify(audit.bad)} sw=${audit.sw}`);
    check('@320 zero errors', page.errors.length === 0, page.errors.slice(0, 2).join('|') || 'clean');
    await page.context().close();
  }

  // sheet at 320/390/768: max-width inert (sheet spans full width)
  console.log('\n=== sheet width: measure inert below 820 ===');
  for (const w of [320, 390, 768]) {
    for (const [label, srv] of [['HEAD', head], ['BASE', baseSrv]]) {
      const page = await newPage(browser, { width: w, height: 844 });
      await open(page, srv.base, '?entry=shelf');
      await page.evaluate("document.querySelector('.shelf-item').click()");
      await page.waitForSelector('#reader .tok');
      await hold(page, '#reader .tok.content', 23);
      const ok = (await page.locator('#sheet').count()) > 0;
      const r = ok ? await page.evaluate("(() => {const s=document.getElementById('sheet').getBoundingClientRect(); return [Math.round(s.x), Math.round(s.width)];})()") : null;
      console.log(`  ${label} @${w}: sheet=${JSON.stringify(r)}`);
      if (label === 'HEAD') check(`@${w} sheet spans the full viewport (measure inert)`, r && r[0] === 0 && r[1] === w, JSON.stringify(r));
      await page.context().close();
    }
  }

  await browser.close();
  head.server.close(); baseSrv.server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
}
main().catch(e => { console.error(e); process.exit(2); });
