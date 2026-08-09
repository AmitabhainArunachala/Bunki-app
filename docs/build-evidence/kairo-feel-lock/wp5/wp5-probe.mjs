/**
 * WP5 acceptance probe — measures the four nav/polish items on rendered pixels.
 * Usage: node probe.mjs <label> <outDir>
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';
import pw from '/home/user/Bunki-app/node_modules/playwright-core/index.js';

const { chromium } = pw;
const CORRIDOR_DIR =
  '/home/user/Bunki-app/.claude/worktrees/agent-aaf8e1b35976ce311/prototypes/corridor';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
function startCorridorServer(rootDir = CORRIDOR_DIR) {
  const srv = createServer((req, res) => {
    const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = resolve(rootDir, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
    if (!file.startsWith(rootDir) || !existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    res.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    srv.once('error', fail);
    srv.listen(0, '127.0.0.1', () => ok({ server: srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

const label = process.argv[2] || 'run';
const outDir = resolve(process.argv[3] || '.');
mkdirSync(outDir, { recursive: true });

const out = { label, at: new Date().toISOString(), errors: [], items: {} };

const { server, base } = await startCorridorServer(CORRIDOR_DIR);
const browser = await chromium.launch();

async function newPage(width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    isMobile: width < 700,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') out.errors.push(`[${label}/${width}] console: ${m.text()}`);
  });
  page.on('pageerror', (e) => out.errors.push(`[${label}/${width}] pageerror: ${e.message}`));
  return page;
}
const shot = (page, name) => page.screenshot({ path: resolve(outDir, `${name}.png`) });
const boot = async (page, q = '?entry=shelf') => {
  await page.goto(`${base}/index.html${q}`);
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await page.waitForSelector('.shelf-item');
  await page.waitForTimeout(200);
};

/* ------------------------------------------------------------ (a) shelf scroll */
/* A real click on a door that is ALREADY fully inside the viewport, so
 * Playwright's scroll-into-view cannot move the page between the measurement
 * and the navigation. Returns the offset the shelf was standing at. */
/* Back-chain out of every open sheet with the sheet's own 戻る. The first
 * ~700ms after a token opens an entry, one click gets eaten (pre-existing,
 * unrelated to scroll), so settle first and then click until the layer is
 * actually gone. */
async function backChainOut(page) {
  await page.waitForTimeout(900);
  for (let i = 0; i < 6 && (await page.locator('#sheet').count()) > 0; i += 1) {
    await page.locator('#sheet-back').click();
    await page.waitForTimeout(500);
  }
  return (await page.locator('#sheet').count()) === 0;
}

/* Press a door and report the page's own scrollY AT THE INSTANT OF THE PRESS,
 * captured in-page. Playwright may scroll a target into view before clicking,
 * so a harness-side reading taken beforehand is not the offset the app sees;
 * this one is. */
async function pressDoor(page, selector, idx = 0) {
  await page.evaluate(`(() => {
    window.__Y_AT_PRESS__ = null;
    document.addEventListener('pointerdown', function once() {
      window.__Y_AT_PRESS__ = window.scrollY;
      document.removeEventListener('pointerdown', once, true);
    }, true);
  })()`);
  const requested = await page.evaluate('window.scrollY');
  await page.locator(selector).nth(idx).click();
  const before = await page.evaluate('window.__Y_AT_PRESS__ ?? window.scrollY');
  return { before, requested, idx };
}

async function doorInView(page, selector) {
  const idx = await page.evaluate(`(() => {
    const ns = [...document.querySelectorAll(${JSON.stringify(selector)})];
    return ns.findIndex((n) => {
      const b = n.getBoundingClientRect();
      // clear of the sticky chrome at the top and of the bottom edge, so
      // Playwright has little reason to scroll before it clicks
      return b.top >= 130 && b.bottom <= window.innerHeight - 60 && b.width > 0;
    });
  })()`);
  if (idx < 0) throw new Error(`no in-view door for ${selector}`);
  return pressDoor(page, selector, idx);
}

{
  const page = await newPage(390, 844);
  await boot(page);

  // door 1 — shelf card → reader → 戻る
  await page.evaluate('window.scrollTo(0, 640)');
  await page.waitForTimeout(200);
  const d1 = await doorInView(page, '.shelf-item');
  await page.waitForSelector('#reader');
  await page.waitForTimeout(500);
  const d1readerScroll = await page.evaluate('window.scrollY');
  await page.locator('#back').click();
  await page.waitForTimeout(500);
  const d1after = await page.evaluate('window.scrollY');
  const d1view = await page.evaluate('document.body.dataset.view');
  await shot(page, `${label}-a1-shelf-after-reader`);

  // door 2 — search → result entry sheet → one node deeper → back-chain out
  await page.evaluate('window.scrollTo(0, 0)');
  await page.waitForTimeout(120);
  await page.locator('#search').fill('water');
  await page.waitForTimeout(600);
  const nResults = await page.locator('[data-result]').count();
  await page.evaluate('window.scrollTo(0, 880)');
  await page.waitForTimeout(200);
  // prefer an in-view MULTI-KANJI WORD result — its sheet carries
  // 「この語の漢字」rows, so the back-chain is genuinely two layers deep
  const d2idx = await page.evaluate(`(() => {
    const ns = [...document.querySelectorAll('[data-result]')];
    const inView = (n) => { const b = n.getBoundingClientRect();
      return b.top >= 130 && b.bottom <= window.innerHeight - 60 && b.width > 0; };
    const k = ns.findIndex((n) => {
      const [t, id] = n.dataset.result.split(':');
      return inView(n) && t === 'word' && id.length >= 2;
    });
    return k >= 0 ? k : ns.findIndex(inView);
  })()`);
  if (d2idx < 0) throw new Error('no in-view search result');
  const d2 = await pressDoor(page, '[data-result]', d2idx);
  await page.waitForSelector('#sheet');
  await page.waitForTimeout(1000); // clear the ~700ms post-open swallow window
  const deepSel = '#sheet [data-kanjirow]';
  const deep = await page.locator(deepSel).count();
  if (deep) {
    await page.locator(deepSel).first().click();
    await page.waitForTimeout(600);
  }
  const depthNode = await page.evaluate(
    `document.getElementById('sheet')?.getAttribute('data-node') ?? 'none'`,
  );
  const d2closed = await backChainOut(page);
  const d2after = await page.evaluate('window.scrollY');
  const d2sheet = d2closed ? 0 : 1;
  await shot(page, `${label}-a2-shelf-after-search-entry`);

  // door 3 — shelf → 覚 lists → 戻る (the chrome is sticky, so any offset works)
  await page.locator('#search').fill('');
  await page.waitForTimeout(500);
  await page.evaluate('window.scrollTo(0, 900)');
  await page.waitForTimeout(200);
  const d3 = await pressDoor(page, '#tray'); // sticky chrome — always reachable
  await page.waitForTimeout(500);
  await page.locator('#back').click();
  await page.waitForTimeout(500);
  const d3after = await page.evaluate('window.scrollY');
  await shot(page, `${label}-a3-shelf-after-tray`);

  // door 4 — the reader's own place must still survive (regression guard)
  await page.evaluate('window.scrollTo(0, 0)');
  await page.waitForTimeout(150);
  await doorInView(page, '.shelf-item');
  await page.waitForSelector('#reader .tok');
  await page.evaluate('window.scrollTo(0, 420)');
  await page.waitForTimeout(300);
  const d4before = await page.evaluate('window.scrollY');
  const tokIdx = await page.evaluate(`(() => {
    const ns = [...document.querySelectorAll('#reader .tok.content')];
    return ns.findIndex((n) => { const r = n.getBoundingClientRect(); return r.top >= 90 && r.bottom <= 700; });
  })()`);
  for (let i = 0; i < 3 && (await page.locator('#sheet').count()) === 0; i += 1) {
    await page.locator('#reader .tok.content').nth(tokIdx).click();
    await page.waitForTimeout(300);
  }
  const d4closed = await backChainOut(page);
  const d4after = await page.evaluate('window.scrollY');

  // door 5 — the composed chain: shelf → reader → word sheet → kanji sheet →
  // back out of both sheets → 戻る → the SHELF offset must be back, exactly
  await page.locator('#back').click();
  await page.waitForTimeout(500);
  await page.evaluate('window.scrollTo(0, 520)');
  await page.waitForTimeout(250);
  const d5 = await doorInView(page, '.shelf-item');
  await page.waitForSelector('#reader .tok');
  await page.waitForTimeout(500);
  const d5tok = await page.evaluate(`(() => {
    const ns = [...document.querySelectorAll('#reader .tok.content')];
    return ns.findIndex((n) => { const r = n.getBoundingClientRect(); return r.top >= 130 && r.bottom <= 700; });
  })()`);
  for (let i = 0; i < 3 && (await page.locator('#sheet').count()) === 0; i += 1) {
    await page.locator('#reader .tok.content').nth(d5tok).click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1000); // clear the post-open swallow window
  const d5rows = await page.locator('#sheet [data-kanjirow]').count();
  if (d5rows) {
    await page.locator('#sheet [data-kanjirow]').first().click();
    await page.waitForTimeout(600);
  }
  const d5deep = await page.evaluate(
    `document.getElementById('sheet')?.getAttribute('data-node') ?? 'none'`,
  );
  const d5closed = await backChainOut(page);
  await page.locator('#back').click();
  await page.waitForTimeout(600);
  const d5after = await page.evaluate('window.scrollY');
  const d5view = await page.evaluate('document.body.dataset.view ?? "(none)"');
  await shot(page, `${label}-a5-shelf-after-deep-chain`);

  out.items.a = {
    door1_reader: {
      requested: d1.requested,
      before: d1.before,
      readerScrollWhileAway: d1readerScroll,
      after: d1after,
      exact: d1.before === d1after,
      view: d1view,
    },
    door2_search_entry: {
      resultCount: nResults,
      requested: d2.requested,
      before: d2.before,
      after: d2after,
      exact: d2.before === d2after,
      wentDeeper: deep > 0,
      deepestNode: depthNode,
      sheetClosed: d2sheet === 0,
    },
    door3_tray: { requested: d3.requested, before: d3.before, after: d3after, exact: d3.before === d3after },
    door4_reader_own_place: {
      before: d4before,
      after: d4after,
      exact: d4before === d4after,
      sheetClosed: d4closed,
    },
    door5_deep_chain: {
      before: d5.before,
      after: d5after,
      exact: d5.before === d5after,
      deepestNode: d5deep,
      kanjiRows: d5rows,
      sheetsClosed: d5closed,
      view: d5view,
    },
  };
  await page.context().close();
}

/* ------------------------------------------------------------ (b) reader hint */
{
  const page = await newPage(390, 844);
  const rows = [];
  for (const lang of ['bi', 'ja']) {
    await boot(page);
    if (lang === 'ja') {
      await page.locator('#lang [data-lang="ja"]').click();
      await page.waitForTimeout(250);
    }
    await page.locator('.shelf-item').first().click();
    await page.waitForSelector('#reader .tok');
    await page.waitForTimeout(300);
    for (const v of [0, 1, 2]) {
      if (!(await page.locator('[data-dial]').count())) {
        await page.locator('#dials-toggle').click();
        await page.waitForTimeout(200);
      }
      await page.locator(`[data-dial="furigana:${v}"]`).click();
      await page.waitForTimeout(300);
      const hint = await page.locator('.gesture-hint').innerText();
      const aria = await page.locator('#reader .tok.content').first().getAttribute('aria-label');
      rows.push({ lang, furigana: v, hint, ariaTail: aria?.split(' · ').slice(-1)[0] });
      await shot(page, `${label}-b-hint-${lang}-furigana${v}`);
    }
    // behavioural check that the ladder really is 2 rungs at dial 2
    if (lang === 'bi') {
      const tok = page.locator('#reader .tok.content').nth(2);
      await tok.click();
      await page.waitForTimeout(250);
      const afterTap1 = {
        en: (await tok.locator('.tok-en').count()) > 0,
        sheet: await page.locator('#sheet').count(),
      };
      await tok.click();
      await page.waitForTimeout(350);
      const afterTap2 = { sheet: await page.locator('#sheet').count() };
      out.items.bLadderAtDial2 = { afterTap1, afterTap2 };
    }
  }
  out.items.b = { rows };
  await page.context().close();
}

/* ------------------------------------------------------------ (c) component rows */
{
  const page = await newPage(390, 844);
  await boot(page);
  // 丈 → part 乂 has an empty radical name in data/share_alike/kanji.json
  await page.locator('#search').fill('丈');
  await page.waitForTimeout(600);
  const results = await page.evaluate(
    `[...document.querySelectorAll('[data-result]')].map((n) => n.dataset.result)`,
  );
  const kanjiIdx = results.findIndex((r) => r === 'kanji:丈');
  if (kanjiIdx >= 0) {
    await page.locator('[data-result]').nth(kanjiIdx).click();
    await page.waitForSelector('#sheet');
    await page.waitForTimeout(400);
    const rows = await page.evaluate(`(() => {
      const h = [...document.querySelectorAll('#sheet .eyebrow')].find((n) => n.textContent.includes('部品'));
      const box = h?.nextElementSibling;
      if (!box) return null;
      return [...box.querySelectorAll('.entry-row')].map((r) => {
        const b = r.getBoundingClientRect();
        return {
          tag: r.tagName,
          type: r.getAttribute('type'),
          glyph: r.querySelector('.row-glyph')?.textContent,
          main: r.querySelector('.row-main')?.textContent,
          chevron: r.querySelector('.row-go')?.textContent,
          w: Math.round(b.width),
          h: Math.round(b.height),
        };
      });
    })()`);
    out.items.c = { results, componentRows: rows };
    await shot(page, `${label}-c-components-丈`);
    // the row must still be a working door
    if (rows?.length) {
      // click the NAMELESS row specifically — it must still be a working door
      await page.evaluate(`(() => {
        const h = [...document.querySelectorAll('#sheet .eyebrow')].find((n) => n.textContent.includes('部品'));
        const row = [...h.nextElementSibling.querySelectorAll('.entry-row')]
          .find((r) => r.querySelector('.row-glyph')?.textContent === '乂');
        row.click();
      })()`);
      await page.waitForTimeout(450);
      out.items.c.doorOpens = await page.evaluate(
        `(() => ({ node: document.getElementById('sheet')?.getAttribute('data-node'),
                   hero: document.querySelector('#sheet .hero-mean')?.textContent }))()`,
      );
      await shot(page, `${label}-c-component-door-乂`);
    }
  } else {
    out.items.c = { error: 'kanji:丈 not in results', results };
  }
  await page.context().close();
}

/* ------------------------------------------------------------ (d) measure */
{
  const perWidth = {};
  for (const w of [320, 390, 768, 1280]) {
    const page = await newPage(w, 900);
    await boot(page);
    const shelf = await page.evaluate(`(() => {
      const b = document.querySelector('main').getBoundingClientRect();
      return { x: +b.x.toFixed(2), w: +b.width.toFixed(2),
               scrollW: document.documentElement.scrollWidth,
               clientW: document.documentElement.clientWidth };
    })()`);
    await shot(page, `${label}-d-${w}-shelf`);
    await page.locator('.shelf-item').first().click();
    await page.waitForSelector('#reader .tok');
    await page.waitForTimeout(500);
    const m = await page.evaluate(`(() => {
      const r = (n) => { const b = n.getBoundingClientRect(); return { x: +b.x.toFixed(2), w: +b.width.toFixed(2) }; };
      return {
        vw: window.innerWidth,
        main: r(document.querySelector('main')),
        reader: r(document.getElementById('reader')),
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      };
    })()`);
    m.overflow = m.scrollW > m.clientW;
    m.shelf = shelf;
    m.shelfOverflow = shelf.scrollW > shelf.clientW;
    // token rect fingerprint — the 390px byte-equality evidence
    m.tokens = await page.evaluate(
      `[...document.querySelectorAll('#reader .tok')].slice(0, 80).map((n) => { const b = n.getBoundingClientRect(); return [+b.x.toFixed(2), +b.y.toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2)]; })`,
    );
    await shot(page, `${label}-d-${w}-reader`);
    // sheet
    const tok = page.locator('#reader .tok.content').first();
    for (let i = 0; i < 3 && (await page.locator('#sheet').count()) === 0; i += 1) {
      await tok.click();
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(300);
    m.sheet = await page.evaluate(`(() => {
      const s = document.getElementById('sheet');
      if (!s) return null;
      const b = s.getBoundingClientRect();
      return { x: +b.x.toFixed(2), w: +b.width.toFixed(2) };
    })()`);
    m.sheetOverflow = await page.evaluate(
      'document.documentElement.scrollWidth > document.documentElement.clientWidth',
    );
    await shot(page, `${label}-d-${w}-sheet`);
    perWidth[w] = m;
    await page.context().close();
  }
  out.items.d = perWidth;
}

await browser.close();
server.close();
writeFileSync(resolve(outDir, `${label}.json`), JSON.stringify(out, null, 2));
console.log('errors:', out.errors.length ? out.errors : 'none');
console.log('a:', JSON.stringify(out.items.a, null, 1));
console.log('b:', JSON.stringify(out.items.b.rows, null, 1));
console.log('b ladder@dial2:', JSON.stringify(out.items.bLadderAtDial2));
console.log('c:', JSON.stringify({ rows: out.items.c.componentRows, door: out.items.c.doorOpens }, null, 1));
for (const [w, m] of Object.entries(out.items.d)) {
  console.log(
    `d ${w}: main ${m.main.w}@${m.main.x} · reader ${m.reader.w}@${m.reader.x} · sheet ${m.sheet ? `${m.sheet.w}@${m.sheet.x}` : '—'} · overflow read=${m.overflow} shelf=${m.shelfOverflow} sheet=${m.sheetOverflow}`,
  );
}
