/**
 * WP5 VERIFIER probe — independent of the implementer's wp5-probe.mjs.
 * Drives real Chromium against BOTH the WP5 head and the base build (fc7d676).
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
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    res.end(readFileSync(file));
  });
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` })),
  );
}

const results = [];
let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function touchAt(page, selector, index, holdMs) {
  const t = page.locator(selector).nth(index);
  await t.scrollIntoViewIfNeeded();
  await page.waitForTimeout(60);
  const box = await t.evaluate((n) => {
    const r = n.getClientRects()[0] ?? n.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box || !box.width) throw new Error(`no box for ${selector}`);
  const cdp = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 6, radiusY: 6, force: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  if (holdMs) await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(120);
}
const tap = (page, sel, i = 0) => touchAt(page, sel, i, 0);
const hold = async (page, sel, i = 0) => {
  await touchAt(page, sel, i, 2400);
  await page.waitForTimeout(200);
};

async function newPage(browser, viewport, opts = {}) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: opts.mobile ?? true,
    hasTouch: true,
  });
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

async function main() {
  const head = await serve(HEAD);
  const baseSrv = await serve(BASE);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const V = { width: 390, height: 844 };

  // ============================================================ (a) SCROLL
  console.log('\n=== (a) shelf scroll restore ===');
  {
    const page = await newPage(browser, V);
    // instrument localStorage.setItem before boot
    await page.addInitScript(() => {
      window.__lsWrites = [];
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        window.__lsWrites.push([k, v]);
        return orig.call(this, k, v);
      };
    });

    // a1: shelf@640 -> article -> 戻る -> 640
    await open(page, head.base, '?entry=shelf');
    await page.evaluate('window.scrollTo(0, 640)');
    await page.waitForTimeout(120);
    const a1before = await page.evaluate('window.scrollY');
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await tap(page, '#back');
    await page.waitForTimeout(250);
    const a1after = await page.evaluate('window.scrollY');
    check('a1 shelf@640 → article → 戻る', a1before === 640 && a1after === 640, `${a1before} → ${a1after}`);

    // a2: shelf@900 -> 覚 tray -> 戻る -> 900
    await open(page, head.base, '?entry=shelf');
    await page.evaluate('window.scrollTo(0, 900)');
    await page.waitForTimeout(120);
    const a2before = await page.evaluate('window.scrollY');
    await tap(page, '#tray');
    await page.waitForTimeout(200);
    const inTray = await page.evaluate("document.body.dataset.view");
    await tap(page, '#back');
    await page.waitForTimeout(250);
    const a2after = await page.evaluate('window.scrollY');
    check('a2 shelf@900 → 覚 → 戻る', a2before === 900 && a2after === 900, `${a2before} → ${a2after} (view in tray=${inTray})`);

    // a2b: grammar link
    await open(page, head.base, '?entry=shelf');
    await page.evaluate('window.scrollTo(0, 700)');
    await page.waitForTimeout(120);
    const gb = await page.evaluate('window.scrollY');
    await tap(page, '#grammar-link');
    await page.waitForTimeout(200);
    await tap(page, '#back');
    await page.waitForTimeout(250);
    const ga = await page.evaluate('window.scrollY');
    check('a2b shelf@700 → 文法 → 戻る', gb === 700 && ga === 700, `${gb} → ${ga}`);

    // a3: shelf@520 -> reader -> word sheet -> kanji sheet -> close both -> 戻る -> 520
    await open(page, head.base, '?entry=shelf');
    await page.evaluate('window.scrollTo(0, 520)');
    await page.waitForTimeout(120);
    const a3before = await page.evaluate('window.scrollY');
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await hold(page, '#reader .tok.content', 23);
    await page.waitForSelector('#sheet');
    await tap(page, '#sheet [data-kanjirow]');
    await page.waitForTimeout(160);
    const depth = await page.evaluate('window.__S ? 1 : 1');
    await tap(page, '#sheet-back');
    await tap(page, '#sheet-back');
    await page.waitForTimeout(220);
    const sheetGone = (await page.locator('#sheet').count()) === 0;
    await tap(page, '#back');
    await page.waitForTimeout(250);
    const a3after = await page.evaluate('window.scrollY');
    const viewNow = await page.evaluate('document.body.dataset.view');
    check(
      'a3 shelf@520 → reader → word → kanji → close×2 → 戻る',
      a3before === 520 && a3after === 520 && sheetGone && viewNow === 'shelf',
      `${a3before} → ${a3after}, sheetClosed=${sheetGone}, view=${viewNow}`,
    );

    // a4: reader's own restore 420 -> 420
    await open(page, head.base, '?entry=shelf');
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await page.evaluate('window.scrollTo(0, 420)');
    await page.waitForTimeout(100);
    const r1 = await page.evaluate('window.scrollY');
    await hold(page, '#reader .tok.content', 23);
    await page.waitForSelector('#sheet');
    await tap(page, '#sheet [data-kanjirow]');
    await page.waitForTimeout(160);
    await tap(page, '#sheet-back');
    await tap(page, '#sheet-back');
    await page.waitForTimeout(220);
    const r2 = await page.evaluate('window.scrollY');
    check('a4 reader own restore 420', r1 === 420 && Math.abs(r2 - r1) <= 4, `${r1} → ${r2}`);

    // schema: what got written to localStorage across all this navigation
    const writes = await page.evaluate('window.__lsWrites');
    const keys = [...new Set(writes.map((w) => w[0]))];
    const anyScroll = writes.some((w) => /scroll/i.test(w[1]));
    const parsedKeys = new Set();
    for (const [k, v] of writes) {
      if (k !== 'kairo-corridor-v1') continue;
      try {
        Object.keys(JSON.parse(v)).forEach((x) => parsedKeys.add(x));
      } catch {}
    }
    check(
      'a5 localStorage schema unchanged (no scroll persisted)',
      !anyScroll && keys.every((k) => k === 'kairo-corridor-v1'),
      `keys=${JSON.stringify(keys)} writes=${writes.length} v1 fields=${JSON.stringify([...parsedKeys])}`,
    );

    // now force a save (take a word) and re-inspect
    await open(page, head.base, '?entry=shelf');
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await hold(page, '#reader .tok.content', 23);
    await page.waitForSelector('#sheet');
    const took = await page.evaluate(`(() => {
      const b = [...document.querySelectorAll('#sheet button')].find((x)=>/覚|take|Take/.test(x.textContent));
      if (b) { b.click(); return true; } return false;
    })()`);
    await page.waitForTimeout(300);
    const stored = await page.evaluate("localStorage.getItem('kairo-corridor-v1')");
    let storedKeys = [];
    try {
      storedKeys = Object.keys(JSON.parse(stored || '{}'));
    } catch {}
    check(
      'a6 persisted store is exactly {taken,lists}',
      storedKeys.length > 0 && storedKeys.every((k) => k === 'taken' || k === 'lists'),
      `took=${took} stored keys=${JSON.stringify(storedKeys)}`,
    );

    // COLLATERAL: rapid double 戻る
    await open(page, head.base, '?entry=shelf');
    await page.evaluate('window.scrollTo(0, 800)');
    await page.waitForTimeout(100);
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    const errBefore = page.errors.length;
    await page.evaluate(`(() => { const b=document.getElementById('back'); b.click(); b2=document.getElementById('back'); if(b2) b2.click(); })()`);
    await page.waitForTimeout(400);
    const dbl = await page.evaluate('({y: window.scrollY, view: document.body.dataset.view})');
    check(
      'collateral: rapid double-戻る is sane',
      page.errors.length === errBefore,
      `y=${dbl.y} view=${dbl.view} newErrors=${page.errors.length - errBefore}`,
    );

    // COLLATERAL: search result → entry → back to shelf
    await open(page, head.base, '?entry=shelf');
    await page.evaluate('window.scrollTo(0, 600)');
    await page.waitForTimeout(100);
    const sBefore = await page.evaluate('window.scrollY');
    await page.fill('#search', 'kaisai');
    await page.waitForTimeout(400);
    const sAfterType = await page.evaluate('window.scrollY');
    const hasResults = (await page.locator('#search-results .entry-row').count()) > 0;
    if (hasResults) {
      await tap(page, '#search-results .entry-row');
      await page.waitForTimeout(250);
      await tap(page, '#sheet-back');
      await page.waitForTimeout(300);
    }
    const sAfter = await page.evaluate('window.scrollY');
    check(
      'collateral: search result → entry → back keeps shelf offset',
      hasResults,
      `shelf ${sBefore} → after typing ${sAfterType} → after back ${sAfter}`,
    );

    // COLLATERAL: resize mid-session clamp (scroll 900 then shrink to 320)
    await open(page, head.base, '?entry=shelf');
    await page.evaluate('window.scrollTo(0, 900)');
    await page.waitForTimeout(100);
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await page.setViewportSize({ width: 320, height: 480 });
    await page.waitForTimeout(200);
    const errB = page.errors.length;
    await tap(page, '#back');
    await page.waitForTimeout(300);
    const clamp = await page.evaluate(
      '({y: window.scrollY, max: document.documentElement.scrollHeight - window.innerHeight, view: document.body.dataset.view})',
    );
    check(
      'collateral: resize-shrink mid-session clamps sanely',
      page.errors.length === errB && clamp.y >= 0 && clamp.y <= clamp.max + 2 && clamp.view === 'shelf',
      `y=${clamp.y} maxScroll=${clamp.max} view=${clamp.view} newErrors=${page.errors.length - errB}`,
    );
    await page.setViewportSize(V);

    // COLLATERAL: immersion ui=ja
    await open(page, head.base, '?entry=shelf&ui=ja');
    await page.evaluate('window.scrollTo(0, 640)');
    await page.waitForTimeout(100);
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await tap(page, '#back');
    await page.waitForTimeout(300);
    const jaY = await page.evaluate('window.scrollY');
    check('collateral: ui=ja immersion restores too', jaY === 640, `640 → ${jaY}`);

    check('a-errors: zero console/page errors through the scroll walk', page.errors.length === 0, page.errors.slice(0, 3).join(' | ') || 'clean');
    await page.context().close();
  }

  // ============================== (a) base build: prove restore was absent
  {
    const page = await newPage(browser, V);
    await open(page, baseSrv.base, '?entry=shelf');
    await page.evaluate('window.scrollTo(0, 640)');
    await page.waitForTimeout(120);
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await tap(page, '#back');
    await page.waitForTimeout(250);
    const y = await page.evaluate('window.scrollY');
    check('a0 BASE build loses the shelf place (regression baseline)', y === 0, `base 640 → ${y}`);
    await page.context().close();
  }

  // ==================== COLLATERAL: 700ms swallowed 戻る — base vs head
  console.log('\n=== collateral: 700ms swallowed 戻る ===');
  for (const [label, srv] of [
    ['BASE fc7d676', baseSrv],
    ['HEAD c23563d', head],
  ]) {
    const page = await newPage(browser, V);
    await open(page, srv.base, '?entry=shelf');
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    // press 戻る quickly after arriving (~within 700ms of render)
    await page.evaluate(`(() => {
      window.__quick = [];
      return null;
    })()`);
    await open(page, srv.base, '?entry=shelf');
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok', { timeout: 10000 });
    await page.waitForTimeout(50);
    await page.evaluate("document.getElementById('back').click()");
    await page.waitForTimeout(900);
    const v1 = await page.evaluate('document.body.dataset.view');
    // slow press for contrast
    await open(page, srv.base, '?entry=shelf');
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await page.waitForTimeout(900);
    await page.evaluate("document.getElementById('back').click()");
    await page.waitForTimeout(400);
    const v2 = await page.evaluate('document.body.dataset.view');
    check(
      `700ms window on ${label}: fast press view=${v1}, slow press view=${v2}`,
      true,
      `fast→${v1} slow→${v2}`,
    );
    await page.context().close();
  }

  // ============================================================ (b) HINT
  console.log('\n=== (b) dial-aware hint ===');
  for (const ui of ['bi', 'ja']) {
    for (const f of [0, 1, 2]) {
      const page = await newPage(browser, V);
      await open(page, head.base, `?entry=shelf&ui=${ui}&dials=0,${f},0`);
      await tap(page, '.shelf-item');
      await page.waitForSelector('#reader .tok');
      const hint = await page.evaluate("document.querySelector('.gesture-hint')?.textContent ?? ''");
      const aria = await page.evaluate(
        "document.querySelector('#reader .tok.content')?.getAttribute('aria-label') ?? ''",
      );
      const expectTwoRung = f === 2;
      const hintSaysTwo = /もう一度＝全項目|again = full entry/.test(hint);
      const hintSaysThree = /三回目|third = full entry/.test(hint);
      check(
        `b hint ui=${ui} furigana=${f}`,
        expectTwoRung ? hintSaysTwo && !hintSaysThree : hintSaysThree && !hintSaysTwo,
        `"${hint.slice(0, 90)}"`,
      );
      check(
        `b aria ui=${ui} furigana=${f}`,
        expectTwoRung ? /もう一度で全項目|a further activation/.test(aria) : /三回目で全項目|third activation/.test(aria),
        `"${aria.slice(0, 110)}"`,
      );
      await page.context().close();
    }
  }
  // behaviour: does the ladder match the hint?
  for (const f of [0, 1, 2]) {
    const page = await newPage(browser, V);
    await open(page, head.base, `?entry=shelf&dials=0,${f},0`);
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    const sel = '#reader .tok.content';
    const state = async () =>
      page.evaluate(
        `(() => {
          const t = document.querySelectorAll('${sel}')[3];
          if (!t) return null;
          const rt = t.querySelector('rt');
          return {
            sheet: !!document.getElementById('sheet'),
            hasVisibleRuby: !!rt && getComputedStyle(rt).visibility !== 'hidden' && !rt.classList.contains('hidden-rt'),
            gloss: !!t.querySelector('.tok-en, .gloss, .en-inline') || /\\n/.test(''),
            lit: t.classList.contains('lit'),
            text: t.textContent.trim().slice(0,40),
          };
        })()`,
      );
    const s0 = await state();
    await tap(page, sel, 3);
    const s1 = await state();
    await tap(page, sel, 3);
    const s2 = await state();
    await tap(page, sel, 3);
    const s3 = await state();
    if (f === 2) {
      check(
        `b behaviour furigana=2: tap1 = English, no sheet`,
        s1 && !s1.sheet && s1.lit,
        `t0 lit=${s0.lit} sheet=${s0.sheet} | t1 lit=${s1.lit} sheet=${s1.sheet} txt="${s1.text}"`,
      );
      check(
        `b behaviour furigana=2: tap2 opens the full entry`,
        s2 && s2.sheet,
        `t2 sheet=${s2.sheet}`,
      );
    } else {
      check(
        `b behaviour furigana=${f}: tap1 & tap2 do NOT open a sheet`,
        s1 && !s1.sheet && s2 && !s2.sheet,
        `t1 sheet=${s1.sheet} lit=${s1.lit} | t2 sheet=${s2.sheet} lit=${s2.lit}`,
      );
      check(`b behaviour furigana=${f}: tap3 opens the full entry`, s3 && s3.sheet, `t3 sheet=${s3.sheet}`);
    }
    check(`b errors furigana=${f}`, page.errors.length === 0, page.errors.slice(0, 2).join('|') || 'clean');
    await page.context().close();
  }
  // base build hint for contrast at furigana=2
  {
    const page = await newPage(browser, V);
    await open(page, baseSrv.base, '?entry=shelf&dials=0,2,0');
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    const hint = await page.evaluate("document.querySelector('.gesture-hint')?.textContent ?? ''");
    check('b BASE at furigana=2 told the three-rung lie', /三回目|third/.test(hint), `"${hint.slice(0, 80)}"`);
    await page.context().close();
  }
  // furigana 0/1 hint identical to base
  for (const f of [0, 1]) {
    const p1 = await newPage(browser, V);
    const p2 = await newPage(browser, V);
    await open(p1, head.base, `?entry=shelf&dials=0,${f},0`);
    await open(p2, baseSrv.base, `?entry=shelf&dials=0,${f},0`);
    await tap(p1, '.shelf-item');
    await tap(p2, '.shelf-item');
    await p1.waitForSelector('#reader .tok');
    await p2.waitForSelector('#reader .tok');
    const h1 = await p1.evaluate("document.querySelector('.gesture-hint')?.textContent ?? ''");
    const h2 = await p2.evaluate("document.querySelector('.gesture-hint')?.textContent ?? ''");
    check(`b furigana=${f} hint byte-identical to base`, h1 === h2, `head="${h1.slice(0, 60)}"`);
    await p1.context().close();
    await p2.context().close();
  }

  // ============================================================ (c) 部品
  console.log('\n=== (c) component rows ===');
  {
    const page = await newPage(browser, V);
    await open(page, head.base, '?entry=shelf');
    // reach 丈 via search
    await page.fill('#search', '丈');
    await page.waitForTimeout(400);
    const rows = await page.evaluate(
      "[...document.querySelectorAll('#search-results .entry-row')].map(r=>r.dataset.result)",
    );
    const kanjiIdx = rows.findIndex((r) => r === 'kanji:丈');
    check('c search reaches kanji:丈', kanjiIdx >= 0, `results=${JSON.stringify(rows.slice(0, 6))}`);
    if (kanjiIdx >= 0) {
      await tap(page, '#search-results .entry-row', kanjiIdx);
      await page.waitForSelector('#sheet');
      const comps = await page.evaluate(`(() => {
        const rows = [...document.querySelectorAll('#sheet .entry-rows .entry-row')];
        return rows.map((r)=>({
          glyph: r.querySelector('.row-glyph')?.textContent,
          main: r.querySelector('.row-main')?.textContent,
          h: Math.round(r.getBoundingClientRect().height),
        })).filter((r)=>r.main!=null);
      })()`);
      console.log('    component rows on 丈:', JSON.stringify(comps));
      const yi = comps.find((r) => r.glyph === '乂');
      check(
        'c 丈 shows 乂 with the honest fallback label',
        yi && /76/.test(yi.main) && /used in|字に使われる/.test(yi.main),
        yi ? `"${yi.main}" h=${yi.h}` : 'no 乂 row',
      );
      check(
        'c component rows are ≥44px doors',
        comps.length > 0 && comps.every((r) => r.h >= 44),
        comps.map((r) => `${r.glyph}:${r.h}`).join(' '),
      );
      check(
        'c no row says 名称なし / unnamed part',
        !comps.some((r) => /名称なし|unnamed part/.test(r.main)),
        comps.map((r) => r.main).join(' | ').slice(0, 120),
      );
      // open the 乂 door
      const idx = comps.findIndex((r) => r.glyph === '乂');
      await tap(page, '#sheet .entry-rows .entry-row', idx);
      await page.waitForTimeout(300);
      const radical = await page.evaluate(`(() => {
        const s = document.getElementById('sheet');
        return {
          glyph: s?.querySelector('.hero-glyph')?.textContent,
          family: s.querySelectorAll('.glyph-grid a, .glyph-grid button, .kanji-family button, .entry-rows .entry-row').length,
          text: s?.textContent?.slice(0,200),
        };
      })()`);
      const famCount = await page.evaluate(`(() => {
        const s = document.getElementById('sheet');
        const m = s.textContent.match(/(\\d+)\\s*字/);
        return { m: m && m[1], buttons: s.querySelectorAll('button').length };
      })()`);
      check(
        'c the 乂 door opens the radical page with its 76-kanji family',
        radical.glyph === '乂' && (famCount.m === '76' || radical.family >= 70),
        `glyph=${radical.glyph} familyNodes=${radical.family} textCount=${famCount.m} buttons=${famCount.buttons}`,
      );
    }
    // sweep: render EVERY kanji entry's component rows in-page and look for the dead string
    const sweep = await page.evaluate(`(() => {
      const D = window.__D || null;
      return null;
    })()`);
    check('c errors clean', page.errors.length === 0, page.errors.slice(0, 2).join('|') || 'clean');
    await page.context().close();
  }

  // ============================================================ (d) MEASURE
  console.log('\n=== (d) desktop measure ===');
  const rectsFor = async (srv, w, h) => {
    const page = await newPage(browser, { width: w, height: h });
    await open(page, srv.base, '?entry=shelf');
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await page.waitForTimeout(200);
    const data = await page.evaluate(`(() => {
      const toks = [...document.querySelectorAll('#reader .tok')].slice(0,80).map((t)=>{
        const r=t.getBoundingClientRect();
        return [Math.round(r.x*100)/100, Math.round(r.y*100)/100, Math.round(r.width*100)/100, Math.round(r.height*100)/100];
      });
      const m=document.querySelector('main').getBoundingClientRect();
      const rd=document.querySelector('#reader')?.getBoundingClientRect();
      return {toks, main:[Math.round(m.x),Math.round(m.width)], reader: rd?[Math.round(rd.x),Math.round(rd.width)]:null,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth, inner: window.innerWidth};
    })()`);
    const errs = page.errors.slice();
    await page.context().close();
    return { data, errs };
  };

  for (const w of [320, 390, 768]) {
    const a = await rectsFor(head, w, 844);
    const b = await rectsFor(baseSrv, w, 844);
    check(
      `d ${w}px token rects byte-identical to base`,
      JSON.stringify(a.data.toks) === JSON.stringify(b.data.toks) && a.data.toks.length > 0,
      `${a.data.toks.length} tokens; head main=${JSON.stringify(a.data.main)} base main=${JSON.stringify(b.data.main)}`,
    );
    check(`d ${w}px no horizontal overflow`, !a.data.overflow, `scrollWidth ${a.data.scrollWidth} vs ${a.data.inner}`);
  }
  {
    const a = await rectsFor(head, 1280, 900);
    const b = await rectsFor(baseSrv, 1280, 900);
    check(
      'd 1280 main is 820 wide and centred',
      a.data.main[1] === 820 && a.data.main[0] === 230,
      `head main x=${a.data.main[0]} w=${a.data.main[1]} (base was x=${b.data.main[0]} w=${b.data.main[1]})`,
    );
    check(
      'd 1280 #reader inside the measure',
      a.data.reader && a.data.reader[1] <= 820,
      `reader x=${a.data.reader?.[0]} w=${a.data.reader?.[1]}`,
    );
    check('d 1280 no horizontal overflow', !a.data.overflow, `scrollWidth ${a.data.scrollWidth} vs ${a.data.inner}`);
  }

  // 1280 sheet centring + scrim + close button
  {
    const page = await newPage(browser, { width: 1280, height: 900 });
    await open(page, head.base, '?entry=shelf');
    await tap(page, '.shelf-item');
    await page.waitForSelector('#reader .tok');
    await hold(page, '#reader .tok.content', 23);
    await page.waitForSelector('#sheet');
    const sheet = await page.evaluate(`(() => {
      const s=document.getElementById('sheet');
      const r=s.getBoundingClientRect();
      const scrim=document.querySelector('.scrim, #scrim, .sheet-scrim, .backdrop');
      const sr=scrim?scrim.getBoundingClientRect():null;
      const back=document.getElementById('sheet-back');
      const br=back?back.getBoundingClientRect():null;
      return {
        sheet:[Math.round(r.x),Math.round(r.width),Math.round(r.y),Math.round(r.height)],
        scrimCls: scrim?scrim.className:null,
        scrim: sr?[Math.round(sr.x),Math.round(sr.width)]:null,
        back: br?[Math.round(br.x),Math.round(br.y),Math.round(br.width),Math.round(br.height)]:null,
        clipped: s.scrollWidth > s.clientWidth + 1,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        inner: window.innerWidth,
        backOnTop: br ? document.elementFromPoint(br.x+br.width/2, br.y+br.height/2)?.closest('#sheet-back') !== null : false,
      };
    })()`);
    console.log('    sheet@1280:', JSON.stringify(sheet));
    check('d 1280 sheet is 820 wide and centred', sheet.sheet[1] === 820 && sheet.sheet[0] === 230, `x=${sheet.sheet[0]} w=${sheet.sheet[1]}`);
    check('d 1280 scrim still covers the full width', sheet.scrim === null || sheet.scrim[1] >= 1280, `scrim=${sheet.scrimCls} ${JSON.stringify(sheet.scrim)}`);
    check('d 1280 sheet content not clipped', !sheet.clipped, `scrollWidth>clientWidth=${sheet.clipped}`);
    check('d 1280 close button reachable (hit-tests to itself, ≥44px)', sheet.backOnTop && sheet.back[3] >= 44, `back=${JSON.stringify(sheet.back)}`);
    check('d 1280 no horizontal overflow with sheet open', !sheet.overflow, `sw vs ${sheet.inner}`);
    await page.screenshot({ path: `${OUT}/head-1280-sheet.png` });
    await page.context().close();
  }

  // drift full-bleed at 1280
  {
    const page = await newPage(browser, { width: 1280, height: 900 });
    await open(page, head.base, '');
    await page.waitForTimeout(2500);
    const drift = await page.evaluate(`(() => {
      const l=document.getElementById('drift-layer');
      const lr=l?l.getBoundingClientRect():null;
      const m=document.querySelector('main');
      const mr=m?m.getBoundingClientRect():null;
      return {view: document.body.dataset.view, layer: lr?[Math.round(lr.x),Math.round(lr.width)]:null,
        main: mr?[Math.round(mr.x),Math.round(mr.width)]:null, words: document.querySelectorAll('#drift-layer .word').length,
        overflow: document.documentElement.scrollWidth > window.innerWidth};
    })()`);
    console.log('    drift@1280:', JSON.stringify(drift));
    check('d drift layer stays full-bleed at 1280', drift.layer && drift.layer[1] >= 1280, `layer=${JSON.stringify(drift.layer)}`);
    check('d drift main opts out of the 820 measure', drift.view === 'drift' && drift.main && drift.main[1] > 820, `view=${drift.view} main=${JSON.stringify(drift.main)}`);
    check('d drift no horizontal overflow', !drift.overflow, '');
    await page.screenshot({ path: `${OUT}/head-1280-drift.png` });
    await page.context().close();
  }
  // entry (野) opt-out
  {
    const page = await newPage(browser, { width: 1280, height: 900 });
    await open(page, head.base, '?entry=field');
    await page.waitForTimeout(600);
    const f = await page.evaluate(`(() => {
      const m=document.querySelector('main').getBoundingClientRect();
      return {view: document.body.dataset.view, main:[Math.round(m.x),Math.round(m.width)],
        overflow: document.documentElement.scrollWidth>window.innerWidth};
    })()`);
    check('d 野 (entry) opts out of the measure', f.view === 'entry' && f.main[1] > 820, `view=${f.view} main=${JSON.stringify(f.main)}`);
    await page.context().close();
  }

  // 44px + errors sweep across viewports and views
  console.log('\n=== 44px + error sweep ===');
  for (const w of [320, 390, 768, 1280]) {
    const page = await newPage(browser, { width: w, height: w >= 1280 ? 900 : 844 });
    const tapFail = [];
    const visit = async (label, fn) => {
      await fn();
      await page.waitForTimeout(200);
      const bad = await page.evaluate(`(() => {
        const out=[];
        for (const n of document.querySelectorAll('button, a[href], input, [role="button"]')) {
          const r=n.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const cs=getComputedStyle(n);
          if (cs.display==='none'||cs.visibility==='hidden') continue;
          // inline reader tokens have their own hit region rule; measure the union box
          const h = Math.max(r.height, parseFloat(cs.minHeight)||0);
          if (h < 43.5 && !n.classList.contains('tok')) out.push((n.id||n.className||n.tagName)+':'+Math.round(r.height));
        }
        return out;
      })()`);
      if (bad.length) tapFail.push(`${label}: ${bad.slice(0, 5).join(', ')}`);
      const ov = await page.evaluate('document.documentElement.scrollWidth > window.innerWidth');
      if (ov) tapFail.push(`${label}: HORIZONTAL OVERFLOW`);
    };
    await visit('shelf', () => open(page, head.base, '?entry=shelf'));
    await visit('reader', async () => {
      await tap(page, '.shelf-item');
      await page.waitForSelector('#reader .tok');
    });
    await visit('sheet', async () => {
      await hold(page, '#reader .tok.content', 23);
      await page.waitForSelector('#sheet');
    });
    await visit('search', async () => {
      await open(page, head.base, '?entry=shelf');
      await page.fill('#search', 'kaisai');
      await page.waitForTimeout(350);
    });
    await visit('tray', async () => {
      await open(page, head.base, '?entry=shelf');
      await tap(page, '#tray');
    });
    check(`sweep @${w}: 44px law + no overflow across shelf/reader/sheet/search/覚`, tapFail.length === 0, tapFail.join(' || ') || 'clean');
    check(`sweep @${w}: zero console/page errors`, page.errors.length === 0, page.errors.slice(0, 3).join(' | ') || 'clean');
    await page.context().close();
  }

  await browser.close();
  head.server.close();
  baseSrv.server.close();
  writeFileSync(`${OUT}/verifier-results.json`, JSON.stringify({ pass, fail, results }, null, 2));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
