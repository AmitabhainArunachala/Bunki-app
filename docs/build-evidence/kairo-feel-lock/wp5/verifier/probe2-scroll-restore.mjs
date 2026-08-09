/**
 * WP5 VERIFIER probe 2 — (a) scroll restore done honestly.
 * Doors are pressed WITHOUT scrollIntoViewIfNeeded: we pick a door already on
 * screen at the target offset, and we also record the page's own scrollY at the
 * instant of the press via a capture-phase pointerdown listener.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const HEAD = '/home/user/Bunki-app/.claude/worktrees/agent-aed90f45a6a07960b/prototypes/corridor';
const BASE =
  '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/base/prototypes/corridor';
const OUT = '/tmp/claude-0/-home-user-Bunki-app/9e7c9a90-e719-59a3-a8fb-9ae967a15c46/scratchpad/out';
mkdirSync(OUT, { recursive: true });
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
function serve(root) {
  const server = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const file = resolve(root, rel);
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404);
      res.end('nf');
      return;
    }
    res.writeHead(200, { 'cache-control': 'no-store', 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` })));
}
const results = [];
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
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
  // record the page's own scrollY at the instant any door is pressed
  await page.evaluate(`(() => {
    window.__press = [];
    document.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('button, a');
      window.__press.push({ y: window.scrollY, id: t?.id || t?.className || '?' });
    }, true);
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button, a');
      window.__press.push({ y: window.scrollY, id: (t?.id || t?.className || '?') + '#click' });
    }, true);
  })()`);
}
/** Press a door that is ALREADY on screen — never scroll to reach it. */
async function pressVisible(page, selector, opts = {}) {
  const res = await page.evaluate(
    ([sel, need]) => {
      const nodes = [...document.querySelectorAll(sel)];
      const vis = nodes.filter((n) => {
        const r = n.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0;
      });
      const target = vis[0];
      if (!target) return { ok: false, count: nodes.length, visible: 0 };
      const before = window.scrollY;
      target.click();
      return { ok: true, before, count: nodes.length, visible: vis.length };
    },
    [selector, opts],
  );
  await page.waitForTimeout(250);
  return res;
}
async function scrollTo(page, y) {
  await page.evaluate(`window.scrollTo(0, ${y})`);
  await page.waitForTimeout(150);
  return page.evaluate('window.scrollY');
}
const scrollY = (page) => page.evaluate('window.scrollY');
const view = (page) => page.evaluate('document.body.dataset.view ?? (document.getElementById("reader") ? "reader" : "?")');
async function clickId(page, id) {
  await page.evaluate(`document.getElementById('${id}')?.click()`);
  await page.waitForTimeout(300);
}

async function main() {
  const head = await serve(HEAD);
  const baseSrv = await serve(BASE);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const V = { width: 390, height: 844 };

  console.log('\n=== (a) shelf scroll restore — doors pressed in place ===');
  for (const [label, srv] of [['HEAD', head], ['BASE', baseSrv]]) {
    console.log(`\n  -- ${label} --`);
    const page = await newPage(browser, V);

    // door 1: shelf@640 -> article -> 戻る
    await open(page, srv.base, '?entry=shelf');
    const y0 = await scrollTo(page, 640);
    const p1 = await pressVisible(page, '.shelf-item');
    await page.waitForSelector('#reader .tok', { timeout: 15000 });
    await clickId(page, 'back');
    await page.waitForTimeout(250);
    const y1 = await scrollY(page);
    check(`${label} door1 shelf@640 → article → 戻る`, label === 'HEAD' ? y1 === 640 : true,
      `set=${y0} pressedAt=${p1.before} restored=${y1} (visible items ${p1.visible}/${p1.count})`);

    // door 3: shelf@900 -> 覚 -> 戻る
    await open(page, srv.base, '?entry=shelf');
    const y2 = await scrollTo(page, 900);
    await clickId(page, 'tray');
    await clickId(page, 'back');
    const y3 = await scrollY(page);
    check(`${label} door3 shelf@900 → 覚 → 戻る`, label === 'HEAD' ? y3 === 900 : true, `set=${y2} restored=${y3}`);

    // grammar
    await open(page, srv.base, '?entry=shelf');
    const y4 = await scrollTo(page, 700);
    await clickId(page, 'grammar-link');
    const inG = await view(page);
    await clickId(page, 'back');
    const y5 = await scrollY(page);
    check(`${label} shelf@700 → 文法 → 戻る`, label === 'HEAD' ? y5 === 700 : true, `set=${y4} inGrammar=${inG} restored=${y5}`);

    // door 5: shelf@520 -> reader -> word sheet -> kanji sheet -> out -> 戻る
    await open(page, srv.base, '?entry=shelf');
    const y6 = await scrollTo(page, 520);
    const p5 = await pressVisible(page, '.shelf-item');
    await page.waitForSelector('#reader .tok', { timeout: 15000 });
    // open a word sheet without moving the reader: click a visible token
    const opened = await page.evaluate(`(() => {
      const toks=[...document.querySelectorAll('#reader .tok.content')].filter((t)=>{
        const r=t.getBoundingClientRect(); return r.top>=0 && r.bottom<=window.innerHeight;});
      return toks.length;
    })()`);
    // use the app's own go() path via three activations (dial default furigana=2 => 2 taps)
    for (let i = 0; i < 4; i++) {
      const has = await page.locator('#sheet').count();
      if (has) break;
      await page.evaluate(`(() => {
        const toks=[...document.querySelectorAll('#reader .tok.content')].filter((t)=>{
          const r=t.getBoundingClientRect(); return r.top>=0 && r.bottom<=window.innerHeight;});
        toks[2]?.click();
      })()`);
      await page.waitForTimeout(200);
    }
    const sheetOpened = (await page.locator('#sheet').count()) > 0;
    const krow = await page.locator('#sheet [data-kanjirow]').count();
    if (krow) {
      await page.evaluate("document.querySelector('#sheet [data-kanjirow]').click()");
      await page.waitForTimeout(250);
    }
    // close every sheet layer, waiting out the 700ms swallow
    for (let i = 0; i < 6; i++) {
      if ((await page.locator('#sheet').count()) === 0) break;
      await page.waitForTimeout(800);
      await clickId(page, 'sheet-back');
    }
    const sheetGone = (await page.locator('#sheet').count()) === 0;
    const yReader = await scrollY(page);
    await clickId(page, 'back');
    await page.waitForTimeout(250);
    const y7 = await scrollY(page);
    const v7 = await view(page);
    check(`${label} door5 shelf@520 → reader → word → kanji → out → 戻る`,
      label === 'HEAD' ? y7 === 520 && sheetGone && v7 === 'shelf' : true,
      `set=${y6} pressedAt=${p5.before} sheetOpened=${sheetOpened} kanjiRows=${krow} closed=${sheetGone} readerY=${yReader} restored=${y7} view=${v7}`);

    // door 4: reader's own place 420
    await open(page, srv.base, '?entry=shelf');
    await pressVisible(page, '.shelf-item');
    await page.waitForSelector('#reader .tok', { timeout: 15000 });
    const yr0 = await scrollTo(page, 420);
    for (let i = 0; i < 4; i++) {
      if (await page.locator('#sheet').count()) break;
      await page.evaluate(`(() => {
        const toks=[...document.querySelectorAll('#reader .tok.content')].filter((t)=>{
          const r=t.getBoundingClientRect(); return r.top>=0 && r.bottom<=window.innerHeight;});
        toks[2]?.click();
      })()`);
      await page.waitForTimeout(200);
    }
    for (let i = 0; i < 6; i++) {
      if ((await page.locator('#sheet').count()) === 0) break;
      await page.waitForTimeout(800);
      await clickId(page, 'sheet-back');
    }
    const yr1 = await scrollY(page);
    check(`${label} door4 reader's own place 420`, Math.abs(yr1 - yr0) <= 4, `${yr0} → ${yr1}`);

    check(`${label} zero errors in (a)`, page.errors.length === 0, page.errors.slice(0, 3).join(' | ') || 'clean');
    await page.context().close();
  }

  // ---- localStorage schema, instrumented across a full navigation session
  console.log('\n=== (a) localStorage schema ===');
  {
    const page = await newPage(browser, V);
    await page.addInitScript(() => {
      window.__ls = [];
      const o = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        window.__ls.push([k, v]);
        return o.call(this, k, v);
      };
    });
    await open(page, head.base, '?entry=shelf');
    await scrollTo(page, 640);
    await pressVisible(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await clickId(page, 'back');
    await scrollTo(page, 900);
    await clickId(page, 'tray');
    await clickId(page, 'back');
    await clickId(page, 'grammar-link');
    await clickId(page, 'back');
    const navWrites = await page.evaluate('window.__ls');
    check('navigation alone writes nothing to localStorage',
      navWrites.length === 0,
      `writes=${JSON.stringify(navWrites).slice(0, 200)}`);

    // now actually take a word so the store IS written
    await pressVisible(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    for (let i = 0; i < 4; i++) {
      if (await page.locator('#sheet').count()) break;
      await page.evaluate(`(() => {
        const toks=[...document.querySelectorAll('#reader .tok.content')].filter((t)=>{
          const r=t.getBoundingClientRect(); return r.top>=0 && r.bottom<=window.innerHeight;});
        toks[2]?.click();
      })()`);
      await page.waitForTimeout(200);
    }
    const takeInfo = await page.evaluate(`(() => {
      const btns=[...document.querySelectorAll('#sheet button')];
      const b=btns.find((x)=>/覚え|覚る|覚|take/i.test(x.textContent||''));
      if(b){ b.click(); return {clicked:true, label:b.textContent.trim().slice(0,20)}; }
      return {clicked:false, labels: btns.map(x=>x.textContent.trim().slice(0,12)).slice(0,10)};
    })()`);
    await page.waitForTimeout(400);
    const writes = await page.evaluate('window.__ls');
    const stored = await page.evaluate("localStorage.getItem('kairo-corridor-v1')");
    let keys = [];
    try { keys = Object.keys(JSON.parse(stored || '{}')); } catch {}
    const allKeysWritten = [...new Set(writes.map((w) => w[0]))];
    const anyScrollInPayload = writes.some((w) => /scroll/i.test(w[1]));
    check('taking a word writes exactly {taken,lists} under kairo-corridor-v1',
      keys.length > 0 && keys.every((k) => k === 'taken' || k === 'lists') &&
      allKeysWritten.every((k) => k === 'kairo-corridor-v1') && !anyScrollInPayload,
      `take=${JSON.stringify(takeInfo).slice(0,120)} lsKeys=${JSON.stringify(allKeysWritten)} schema=${JSON.stringify(keys)} scrollInPayload=${anyScrollInPayload}`);
    await page.context().close();
  }

  // ---- collateral scenarios
  console.log('\n=== collateral ===');
  {
    const page = await newPage(browser, V);
    // ui=ja immersion
    await open(page, head.base, '?entry=shelf&ui=ja');
    await scrollTo(page, 640);
    await pressVisible(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await clickId(page, 'back');
    const jy = await scrollY(page);
    check('ui=ja immersion restores the shelf', jy === 640, `640 → ${jy}`);

    // search result → entry sheet → back (path that never re-shows the shelf list)
    await open(page, head.base, '?entry=shelf');
    const sy0 = await scrollTo(page, 880);
    await page.evaluate("document.getElementById('search').focus()");
    await page.keyboard.type('kaisai');
    await page.waitForTimeout(500);
    const syType = await scrollY(page);
    const nres = await page.locator('#search-results .entry-row').count();
    let syAfter = null, sheetOpened = false;
    if (nres) {
      await page.evaluate("document.querySelector('#search-results .entry-row').click()");
      await page.waitForTimeout(350);
      sheetOpened = (await page.locator('#sheet').count()) > 0;
      await page.waitForTimeout(800);
      await clickId(page, 'sheet-back');
      await page.waitForTimeout(300);
      syAfter = await scrollY(page);
    }
    check('search result → entry → back keeps the shelf offset',
      nres > 0 && sheetOpened && syAfter === syType,
      `set=${sy0} afterTyping=${syType} results=${nres} sheet=${sheetOpened} afterBack=${syAfter}`);

    // rapid double 戻る
    await open(page, head.base, '?entry=shelf');
    await scrollTo(page, 800);
    await pressVisible(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    const eb = page.errors.length;
    await page.evaluate(`(() => { const b=document.getElementById('back'); b.click(); b.click(); })()`);
    await page.waitForTimeout(500);
    const d = await page.evaluate('({y: window.scrollY, view: document.body.dataset.view, max: document.documentElement.scrollHeight - window.innerHeight})');
    check('rapid double-戻る: no error, sane landing',
      page.errors.length === eb && d.y >= 0 && d.y <= d.max + 2,
      `y=${d.y} view=${d.view} maxScroll=${d.max} newErrors=${page.errors.length - eb}`);

    // resize mid-session: scroll 900 on shelf, go to reader, shrink to 320, back
    await open(page, head.base, '?entry=shelf');
    await scrollTo(page, 900);
    await pressVisible(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await page.setViewportSize({ width: 320, height: 480 });
    await page.waitForTimeout(300);
    const eb2 = page.errors.length;
    await clickId(page, 'back');
    await page.waitForTimeout(300);
    const c2 = await page.evaluate('({y: window.scrollY, view: document.body.dataset.view, max: document.documentElement.scrollHeight - window.innerHeight, ow: document.documentElement.scrollWidth > window.innerWidth})');
    check('resize-shrink mid-session: clamped, no error, no overflow',
      page.errors.length === eb2 && c2.y >= 0 && c2.y <= c2.max + 2 && c2.view === 'shelf' && !c2.ow,
      `y=${c2.y} maxScroll=${c2.max} view=${c2.view} overflow=${c2.ow} newErrors=${page.errors.length - eb2}`);
    await page.setViewportSize(V);

    // extreme: shrink so hard the old offset exceeds max scroll
    await open(page, head.base, '?entry=shelf');
    await scrollTo(page, 900);
    await pressVisible(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await page.setViewportSize({ width: 1280, height: 4000 });
    await page.waitForTimeout(300);
    await clickId(page, 'back');
    await page.waitForTimeout(300);
    const c3 = await page.evaluate('({y: window.scrollY, max: Math.max(0, document.documentElement.scrollHeight - window.innerHeight), view: document.body.dataset.view})');
    check('offset > max scroll after growth: clamps, never negative/NaN',
      Number.isFinite(c3.y) && c3.y >= 0 && c3.y <= c3.max + 2,
      `y=${c3.y} maxScroll=${c3.max} view=${c3.view}`);

    check('collateral errors clean', page.errors.length === 0, page.errors.slice(0, 3).join(' | ') || 'clean');
    await page.context().close();
  }

  // ---- 700ms swallowed 戻る: base vs head, using a build-agnostic signal
  console.log('\n=== 700ms swallowed sheet-戻る: pre-existing? ===');
  for (const [label, srv] of [['BASE fc7d676', baseSrv], ['HEAD c23563d', head]]) {
    const page = await newPage(browser, V);
    const trial = async (waitMs) => {
      await open(page, srv.base, '?entry=shelf');
      await pressVisible(page, '.shelf-item');
      await page.waitForSelector('#reader .tok', { timeout: 15000 });
      for (let i = 0; i < 4; i++) {
        if (await page.locator('#sheet').count()) break;
        await page.evaluate(`(() => {
          const toks=[...document.querySelectorAll('#reader .tok.content')].filter((t)=>{
            const r=t.getBoundingClientRect(); return r.top>=0 && r.bottom<=window.innerHeight;});
          toks[2]?.click();
        })()`);
        await page.waitForTimeout(200);
      }
      const opened = (await page.locator('#sheet').count()) > 0;
      if (!opened) return { opened, closedByFirstPress: null };
      await page.waitForTimeout(waitMs);
      await page.evaluate("document.getElementById('sheet-back')?.click()");
      await page.waitForTimeout(350);
      const closed = (await page.locator('#sheet').count()) === 0;
      return { opened, closedByFirstPress: closed };
    };
    const fast = await trial(50);
    const slow = await trial(900);
    check(`${label}: first sheet-戻る within 700ms`, true,
      `fast(50ms) closed=${fast.closedByFirstPress} · slow(900ms) closed=${slow.closedByFirstPress}`);
    await page.context().close();
  }

  await browser.close();
  head.server.close();
  baseSrv.server.close();
  writeFileSync(`${OUT}/verifier-results-2.json`, JSON.stringify({ pass, fail, results }, null, 2));
  console.log(`\n${pass} passed, ${fail} failed`);
}
main().catch((e) => { console.error(e); process.exit(2); });
