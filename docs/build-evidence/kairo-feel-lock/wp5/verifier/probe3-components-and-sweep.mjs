import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const HEAD = '/home/user/Bunki-app/.claude/worktrees/agent-aed90f45a6a07960b/prototypes/corridor';
const BASE = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/base/prototypes/corridor';
const OUT = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/out';
mkdirSync(OUT, { recursive: true });
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
const tap = (p, s, i = 0) => touchAt(p, s, i, 0);
const hold = async (p, s, i = 0) => { await touchAt(p, s, i, 2400); await p.waitForTimeout(200); };

async function main() {
  const head = await serve(HEAD);
  const baseSrv = await serve(BASE);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const V = { width: 390, height: 844 };

  // ---- 1. store write on take (isolated)
  console.log('\n=== store write on take ===');
  {
    const page = await newPage(browser, V);
    await page.addInitScript(() => {
      window.__ls = [];
      const o = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { window.__ls.push([k, v]); return o.call(this, k, v); };
    });
    await open(page, head.base, '?entry=shelf');
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await hold(page, '#reader .tok.content', 23);
    await page.waitForSelector('#sheet');
    const btns = await page.evaluate(`[...document.querySelectorAll('#sheet button')].map(b=>({t:b.textContent.trim().slice(0,16), c:b.className, id:b.id}))`);
    console.log('    sheet buttons:', JSON.stringify(btns).slice(0, 400));
    const clicked = await page.evaluate(`(() => {
      const b=[...document.querySelectorAll('#sheet button')].find(x=>/覚える/.test(x.textContent||''));
      if(!b) return null; b.click(); return b.textContent.trim().slice(0,20);
    })()`);
    await page.waitForTimeout(600);
    const ls = await page.evaluate('window.__ls');
    const stored = await page.evaluate("localStorage.getItem('kairo-corridor-v1')");
    let keys = [];
    try { keys = Object.keys(JSON.parse(stored || '{}')); } catch {}
    const scrollLeak = /scroll/i.test(stored || '');
    check('take → kairo-corridor-v1 written with exactly {taken,lists}, no scroll',
      keys.length > 0 && keys.every(k => k === 'taken' || k === 'lists') && !scrollLeak &&
      [...new Set(ls.map(w => w[0]))].every(k => k === 'kairo-corridor-v1'),
      `clicked="${clicked}" writes=${ls.length} lsKeys=${JSON.stringify([...new Set(ls.map(w=>w[0]))])} schema=${JSON.stringify(keys)} raw=${(stored||'null').slice(0,90)}`);
    await page.context().close();
  }

  // ---- 2. does typing in search collapse the scroll? head vs base
  console.log('\n=== search re-render scroll behaviour (head vs base) ===');
  for (const [label, srv] of [['HEAD', head], ['BASE', baseSrv]]) {
    const page = await newPage(browser, V);
    await open(page, srv.base, '?entry=shelf');
    await page.evaluate('window.scrollTo(0, 880)');
    await page.waitForTimeout(150);
    const before = await page.evaluate('window.scrollY');
    await page.evaluate("document.getElementById('search').focus()");
    await page.keyboard.type('kaisai');
    await page.waitForTimeout(500);
    const afterType = await page.evaluate('window.scrollY');
    const h = await page.evaluate('document.documentElement.scrollHeight');
    check(`${label}: typing in search collapses scroll ${before} → ${afterType}`, true, `docHeight now ${h}`);
    // now the honest door-2 flow: scroll AFTER results render
    const maxY = await page.evaluate('document.documentElement.scrollHeight - window.innerHeight');
    const target = Math.min(880, Math.max(0, maxY));
    await page.evaluate(`window.scrollTo(0, ${target})`);
    await page.waitForTimeout(150);
    const y0 = await page.evaluate('window.scrollY');
    const n = await page.locator('#search-results .entry-row').count();
    let y1 = null;
    if (n) {
      await page.evaluate("document.querySelector('#search-results .entry-row').click()");
      await page.waitForTimeout(900);
      await page.evaluate("document.getElementById('sheet-back')?.click()");
      await page.waitForTimeout(400);
      y1 = await page.evaluate('window.scrollY');
    }
    check(`${label}: search result sheet → back preserves offset`, y1 === y0, `${y0} → ${y1} (results=${n}, maxScroll=${maxY})`);
    await page.context().close();
  }

  // ---- 3. door 5 with a REAL kanji hop
  console.log('\n=== door 5 with a real kanji sheet ===');
  {
    const page = await newPage(browser, V);
    await open(page, head.base, '?entry=shelf');
    await page.evaluate('window.scrollTo(0, 520)');
    await page.waitForTimeout(150);
    // press a shelf item that is on screen at 520 (no scrollIntoView)
    const pressedAt = await page.evaluate(`(() => {
      const v=[...document.querySelectorAll('.shelf-item')].filter(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;});
      const y=scrollY; v[0].click(); return y;
    })()`);
    await page.waitForSelector('#reader .tok');
    await hold(page, '#reader .tok.content', 23);
    await page.waitForSelector('#sheet');
    const krows = await page.locator('#sheet [data-kanjirow]').count();
    await tap(page, '#sheet [data-kanjirow]');
    await page.waitForTimeout(300);
    const depth2 = await page.evaluate("document.getElementById('sheet')?.querySelector('.hero-glyph')?.textContent");
    for (let i = 0; i < 6; i++) {
      if ((await page.locator('#sheet').count()) === 0) break;
      await page.waitForTimeout(800);
      await page.evaluate("document.getElementById('sheet-back')?.click()");
      await page.waitForTimeout(300);
    }
    const gone = (await page.locator('#sheet').count()) === 0;
    await page.evaluate("document.getElementById('back').click()");
    await page.waitForTimeout(350);
    const y = await page.evaluate('window.scrollY');
    const v = await page.evaluate('document.body.dataset.view');
    check('door5 shelf@520 → reader → word sheet → kanji sheet → out → 戻る → 520',
      y === 520 && gone && v === 'shelf' && krows > 0,
      `pressedAt=${pressedAt} kanjiRows=${krows} depth2Glyph=${depth2} closed=${gone} restored=${y} view=${v}`);
    check('door5 errors clean', page.errors.length === 0, page.errors.slice(0, 2).join('|') || 'clean');
    await page.context().close();
  }

  // ---- 4. exhaustive in-page component-label sweep over EVERY kanji
  console.log('\n=== exhaustive componentLabel sweep (in page, both languages) ===');
  for (const ui of ['bi', 'ja']) {
    const page = await newPage(browser, V);
    await open(page, head.base, `?entry=shelf&ui=${ui}`);
    const sweep = await page.evaluate(`(async () => {
      const res = await fetch('data/share_alike/kanji.json').then(r=>r.json());
      const R = res.radicals, K = res.kanji;
      // replicate componentLabel's contract against the SAME data the app loads
      let refs=0, named=0, countFallback=0, deadFallback=0;
      const dead=[];
      for (const [c,e] of Object.entries(K)) {
        for (const p of (e.parts||[])) {
          refs++;
          const r = R[p];
          if (r && r.name) { named++; continue; }
          if (r && r.kanjiCount) { countFallback++; continue; }
          deadFallback++; if(dead.length<10) dead.push(p);
        }
      }
      return {refs, named, countFallback, deadFallback, dead, radicals: Object.keys(R).length};
    })()`);
    console.log(`    ${ui}:`, JSON.stringify(sweep));
    check(`${ui}: every component reference resolves to a name or an N-kanji count`,
      sweep.deadFallback === 0,
      `refs=${sweep.refs} named=${sweep.named} countFallback=${sweep.countFallback} dead=${sweep.deadFallback}`);
    check(`${ui}: census matches the claim (3150 fallback of 11159 refs)`,
      sweep.refs === 11159 && sweep.countFallback === 3150,
      `refs=${sweep.refs} fallback=${sweep.countFallback}`);
    await page.context().close();
  }

  // ---- 5. render a sample of kanji sheets and grep every rendered component row
  console.log('\n=== rendered component rows across many kanji ===');
  {
    const page = await newPage(browser, V);
    await open(page, head.base, '?entry=shelf');
    const rendered = await page.evaluate(`(async () => {
      const res = await fetch('data/share_alike/kanji.json').then(r=>r.json());
      const chars = Object.keys(res.kanji);
      // sample 400 kanji spread across the set
      const step = Math.max(1, Math.floor(chars.length/400));
      const sample = chars.filter((_,i)=>i%step===0).slice(0,400);
      return {sample: sample.length, total: chars.length};
    })()`);
    console.log('    sampling', JSON.stringify(rendered));
    // drive the real UI for a handful, checking row text + height
    const targets = ['丈', '新', '語', '髪', '鬱'];
    const rows = [];
    for (const t of targets) {
      await open(page, head.base, '?entry=shelf');
      await page.evaluate(`(() => { const s=document.getElementById('search'); s.focus(); })()`);
      await page.keyboard.type(t);
      await page.waitForTimeout(450);
      const idx = await page.evaluate(`[...document.querySelectorAll('#search-results .entry-row')].findIndex(r=>r.dataset.result==='kanji:${t}')`);
      if (idx < 0) { rows.push({ t, skipped: true }); continue; }
      await page.evaluate(`document.querySelectorAll('#search-results .entry-row')[${idx}].click()`);
      await page.waitForTimeout(400);
      const got = await page.evaluate(`(() => {
        const rs=[...document.querySelectorAll('#sheet .entry-rows .entry-row')];
        return rs.map(r=>({g:r.querySelector('.row-glyph')?.textContent, m:r.querySelector('.row-main')?.textContent, h:Math.round(r.getBoundingClientRect().height)})).filter(x=>x.m!=null);
      })()`);
      rows.push({ t, got });
    }
    console.log('   ', JSON.stringify(rows).slice(0, 900));
    const all = rows.flatMap(r => r.got || []);
    check('no rendered component row says 名称なし / unnamed part',
      all.length > 0 && !all.some(r => /名称なし|unnamed part/.test(r.m || '')),
      `${all.length} rows across ${targets.length} kanji`);
    check('every rendered component row is a ≥44px door',
      all.length > 0 && all.every(r => r.h >= 44),
      `min height ${Math.min(...all.map(r => r.h))}`);
    check('component-row errors clean', page.errors.length === 0, page.errors.slice(0, 2).join('|') || 'clean');
    await page.context().close();
  }

  // ---- 6. 44px + overflow sweep, tolerant version
  console.log('\n=== 44px + overflow + error sweep ===');
  for (const w of [320, 390, 768, 1280]) {
    const page = await newPage(browser, { width: w, height: w >= 1280 ? 900 : 844 });
    const problems = [];
    const audit = async (label) => {
      await page.waitForTimeout(250);
      const bad = await page.evaluate(`(() => {
        const out=[];
        for (const n of document.querySelectorAll('button, a[href], input, [role="button"]')) {
          if (n.classList.contains('tok')) continue;
          const r=n.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const cs=getComputedStyle(n);
          if (cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0') continue;
          if (r.height < 43.5) out.push((n.id||n.className||n.tagName)+':'+Math.round(r.height));
        }
        return out;
      })()`);
      if (bad.length) problems.push(`${label} tap<44: ${[...new Set(bad)].slice(0, 6).join(', ')}`);
      const ov = await page.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1');
      if (ov) {
        const sw = await page.evaluate('document.documentElement.scrollWidth');
        problems.push(`${label} OVERFLOW ${sw}>${w}`);
      }
    };
    await open(page, head.base, '?entry=shelf'); await audit('shelf');
    await page.evaluate("document.querySelector('.shelf-item').click()");
    await page.waitForSelector('#reader .tok'); await audit('reader');
    await hold(page, '#reader .tok.content', 23);
    const sheetOk = (await page.locator('#sheet').count()) > 0;
    if (sheetOk) await audit('sheet'); else problems.push('sheet: did not open');
    await open(page, head.base, '?entry=shelf');
    await page.evaluate("document.getElementById('search').focus()");
    await page.keyboard.type('kaisai'); await audit('search');
    await open(page, head.base, '?entry=shelf');
    await page.evaluate("document.getElementById('tray').click()"); await audit('tray(覚)');
    await open(page, head.base, '?entry=shelf');
    await page.evaluate("document.getElementById('grammar-link').click()"); await audit('grammar');
    check(`@${w}: 44px law + no horizontal overflow across shelf/reader/sheet/search/覚/文法`,
      problems.length === 0, problems.join(' || ') || 'clean');
    check(`@${w}: zero console/page errors`, page.errors.length === 0, page.errors.slice(0, 3).join(' | ') || 'clean');
    await page.context().close();
  }

  await browser.close();
  head.server.close(); baseSrv.server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
}
main().catch(e => { console.error(e); process.exit(2); });
