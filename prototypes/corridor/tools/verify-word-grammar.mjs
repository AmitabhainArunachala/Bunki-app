/** verify-word-grammar · the word grammar's walk (MASTER_SPEC §4 G; G_PROGRAM_DESIGN §4). Slice G1 writes its "page" part:
 * the entry is a page, not a sheet (John, 2026-10-15: "this should come to the WHOLE SCREEN. not a swipable window… not have
 * that UGLY gap at the top"). Later G slices add their parts here. Served build only, WebKit and Chromium, 390×844, touch,
 * service workers blocked; every page error fails its walk and none is filtered.
 *   P1  the page: tap a reader word → its card → the card's band → #sheet covers the viewport (top 0 ± 1, height = innerHeight
 *       ± 1, width = innerWidth), no .sheet-grip, no .scrim, no max-height, its paper opaque and the world's (--color-paper)
 *   P2  the match cut: while the page arrives document.getAnimations() holds ::view-transition-group(word-hero), from the
 *       card's headword to the page's headword (the same word); the page was built ahead at idle (data-built="ahead")
 *   P3  the cycle: Close → no page, no card, the reading the tap raised is gone; the same word from bare opens its card again
 *   P4  a word inside the page opens its OWN card — exactly one, on that word, clear of the page's bar (Back never covered);
 *       its band → depth 2 (‹ Back, a crumb of two); Back → depth 1 (the first word's page); Back → bare
 *   P5  Escape steps back one level: depth 2 → depth 1 → bare
 *   P6  no stale card: a reader word's card still on its way never floats over a page opened meanwhile (Ctrl+Enter)
 *   P7  frames: the worst rAF delta while the page opens and while it closes, ≤ 24 ms in WebKit (Chromium recorded, never
 *       averaged in); the method is one-hand/G1/probe/frames-probe.mjs's (1400 ms from just before a real tap)
 *   P8  every world: the page's paper is opaque and its headword reads at ≥ 4.5:1 on it; in 墨 the page stays opaque and
 *       scrim-free at depths 1–4
 *   P9  the word's kanji near the top: the first KANJI IN THIS WORD row starts within 40 % of the viewport (総理)
 *   P10 the bug-report door from the page: its own report entry inside the page, the rail visible above it
 *   P11 one line per gloss: 海's readings that share "sea" are one line, うみ first, the others after "also"
 *   P12 the tapped word's own example first: the article's sentence leads, the rest are folded under "More examples"
 *   P13 a Mac window (1280×800): the page covers the window
 * Negative controls (one-hand/G1/neg-control): the 91dvh cap back → P1 red; the scrim re-appended → P1 red; word-hero taken
 * off the page's headword → P2 red. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';

assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable built site and its digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

// the story every part walks: its 総理, 大賞 and 令和8年 are the doors (R's fixture, verify-reading-truth)
const STORY = Object.freeze({ id: 'kantei:jp-105-actions-202609-25startup', search: 'スタートアップ大賞' });
const WORD = '総理';
const WORLDS = Object.freeze(['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku']);
const FRAME_WINDOW = 1400;

const rows = [];
let engine = '';
const check = (id, title, ok, observed = '') => {
  rows.push({ id: `${engine}/${id}`, title, ok: !!ok, observed });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}/${id} ${title}${ok ? '' : ` — ${JSON.stringify(observed).slice(0, 500)}`}`);
  return !!ok;
};
const frames = [];

const host = await startStaticHost({ site, port: 0 });
async function boot(page, { world = null } = {}) {
  if (world) {
    // the world is a device preference read at boot: set it on a booted page, then boot again (a navigation that cut the
    // first boot's fetches short would leave aborted fetches as page errors that belong to the harness, not the app)
    await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
    await delay(500);
    await page.evaluate((id) => localStorage.setItem('kairo-theme', id), world);
  }
  await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
}
async function openStory(page, opts) {
  await boot(page, opts);
  const direct = page.locator(`[data-passage="${STORY.id}"]:not([data-recommendation]) .shelf-open`).first();
  if (await direct.count()) await direct.click();
  else {
    await openShelfTools(page);
    await page.locator('#shelf-reading-search').fill(STORY.search);
    await page.locator('#shelf-reading-search').press('Enter');
    await page.locator(`#shelf-reading-results [data-passage="${STORY.id}"] .shelf-open`).first().click();
  }
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 20000 });
  await delay(900);
}
const readerWord = (page, label = WORD) => page.locator(`#reader .tok[aria-label="${label}"]`).first();
/** The page has arrived: present, and no page transition still running. */
async function pageSettled(page) {
  await page.locator('#sheet').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => !document.getAnimations().some((a) => String(a.effect?.pseudoElement || '').startsWith('::view-transition')), null, { timeout: 5000 }).catch(() => {});
  await delay(250);
}
async function bare(page) {
  await page.waitForFunction(() => !document.getElementById('sheet'), null, { timeout: 10000 }).catch(() => {});
  await page.waitForFunction(() => !document.getAnimations().some((a) => String(a.effect?.pseudoElement || '').startsWith('::view-transition')), null, { timeout: 5000 }).catch(() => {});
  await delay(250);
}
/** The page's place, skin and paper, read as rendered. */
const pageFacts = (page) => page.evaluate(() => {
  const sheet = document.getElementById('sheet');
  if (!sheet) return null;
  const rect = sheet.getBoundingClientRect(), style = getComputedStyle(sheet);
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:-9px;top:-9px;width:1px;height:1px;background:var(--color-paper, #f5efe0)';
  document.body.append(probe);
  const paper = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const alpha = (color) => { const m = String(color).match(/[\d.]+/g) || []; return m.length > 3 ? Number(m[3]) : 1; };
  const bar = sheet.querySelector(':scope > .sheet-bar')?.getBoundingClientRect();
  return {
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, inner: { width: innerWidth, height: innerHeight },
    maxHeight: style.maxHeight, radius: style.borderTopLeftRadius, background: style.backgroundColor, paper, alpha: alpha(style.backgroundColor),
    grip: document.querySelectorAll('.sheet-grip').length, scrim: document.querySelectorAll('.scrim').length,
    node: sheet.dataset.node, back: document.getElementById('sheet-back')?.textContent.trim() || '',
    depth: sheet.querySelector('.sheet-depth')?.textContent || '', built: sheet.dataset.built || '',
    headword: (sheet.querySelector('.headword, .hero-glyph, h2')?.textContent || '').trim(),
    bar: bar ? { top: bar.top, bottom: bar.bottom } : null,
  };
});
const coversViewport = (facts) => !!facts && Math.abs(facts.rect.top) <= 1 && Math.abs(facts.rect.left) <= 1 &&
  Math.abs(facts.rect.height - facts.inner.height) <= 1 && Math.abs(facts.rect.width - facts.inner.width) <= 1;
const slipFacts = (page) => page.evaluate(() => {
  const slips = [...document.querySelectorAll('#mini')];
  const mini = slips[0];
  if (!mini) return { count: 0 };
  const rect = mini.getBoundingClientRect();
  return { count: slips.length, word: mini.querySelector('.mini-word')?.textContent.trim() || '', top: rect.top, bottom: rect.bottom,
    onPage: mini.hasAttribute('data-page'), leaving: mini.hasAttribute('data-leaving') };
});
/** rAF deltas over the window, from just before a real tap on the locator. */
async function measure(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await delay(250);
  const box = await locator.boundingBox();
  if (!box) return null;
  await page.evaluate((ms) => new Promise((done) => {
    window.__g1f = [];
    requestAnimationFrame((t0) => {
      window.__g1f.push(t0);
      const until = t0 + ms;
      const tick = (t) => { window.__g1f.push(t); if (t < until) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      done();
    });
  }), FRAME_WINDOW);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await delay(FRAME_WINDOW + 250);
  const t = await page.evaluate(() => window.__g1f);
  const deltas = t.slice(1).map((v, i) => Math.round((v - t[i]) * 10) / 10);
  return { worst: Math.max(...deltas), over24: deltas.filter((d) => d > 24).length, frames: deltas.length, deltas };
}
const luminance = (color) => {
  const m = String(color).match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
  const scale = String(color).startsWith('color(') ? 1 : 255;
  const [r, g, b] = m.slice(0, 3).map((v) => { const c = v / scale; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

try {
  for (engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    const walk = async (name, body, { viewport = { width: 390, height: 844 }, mobile = true } = {}) => {
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
      await silenceBrowserAudio(context);
      await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => errors.push(error.message));
      try { await body(page); }
      catch (error) {
        check(`${name}.error`, `${name} ran to the end`, false, String(error.stack || error).slice(0, 700));
        await page.screenshot({ path: resolve(evidence, `${engine}-${name}-error.png`) }).catch(() => {});
      } finally {
        check(`${name}.page-errors`, `${name}: no page errors`, errors.length === 0, errors);
        await context.close();
      }
    };

    // P1 · P2 · P3 · P9 · P10 · P12 — one walk through the reader's word into its page and out
    await walk('page', async (page) => {
      await openStory(page);
      await readerWord(page).tap();
      await page.locator('#mini .mini-word').waitFor();
      check('P3.card', `a tap on ${WORD} opens its card`, (await slipFacts(page)).word === WORD, await slipFacts(page));
      await delay(1200); // the page is built ahead at idle once the card is up
      const seen = page.evaluate(() => new Promise((done) => {
        const names = new Set();
        const start = performance.now();
        const tick = () => {
          for (const animation of document.getAnimations()) if (animation.effect?.pseudoElement) names.add(animation.effect.pseudoElement);
          if (performance.now() - start < 700) requestAnimationFrame(tick); else done([...names]);
        };
        requestAnimationFrame(tick);
      }));
      await page.locator('#mini .mini-word').tap();
      const animations = await seen;
      await pageSettled(page);
      const facts = await pageFacts(page);
      await page.screenshot({ path: resolve(evidence, `${engine}-P1-page.png`) });
      check('P1.viewport', 'the page covers the viewport: top 0, the whole height, the whole width', coversViewport(facts), facts);
      check('P1.grip', 'no grip', facts?.grip === 0, facts?.grip);
      check('P1.scrim', 'no dimming layer: no .scrim in the document', facts?.scrim === 0, facts?.scrim);
      check('P1.cap', 'no max-height and no radius', facts?.maxHeight === 'none' && facts?.radius === '0px', facts);
      check('P1.paper', "the page's paper is opaque and the world's", facts?.alpha === 1 && facts?.background === facts?.paper, facts);
      check('P1.bar', "the page's bar is the top of the screen", Math.abs(facts?.bar?.top ?? 99) <= 1, facts?.bar);
      check('P2.cut', 'the page arrives by the match cut: ::view-transition-group(word-hero) runs', animations.includes('::view-transition-group(word-hero)'), animations);
      check('P2.same-word', "the page's headword is the card's word", facts?.headword?.startsWith(WORD), facts?.headword);
      check('P2.built-ahead', 'the page was built at idle while the card was up; the tap only mounted it', facts?.built === 'ahead', facts?.built);
      const kanji = await page.evaluate(() => document.querySelector('#sheet .entry-row[data-kanjirow]')?.getBoundingClientRect().top ?? null);
      check('P9.kanji-top', "the word's kanji start within 40 % of the screen", kanji != null && kanji <= innerHeightOf(facts) * 0.4, { kanji, height: facts?.inner.height });
      const report = await page.evaluate(() => {
        const rail = document.querySelector('#bunki-reports-root .br-rail');
        const box = rail?.getBoundingClientRect(), style = rail && getComputedStyle(rail);
        return { entries: document.querySelectorAll('#sheet .report-line [data-report-entry="open"]').length,
          rail: !!rail && style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.bottom <= innerHeight + 1 };
      });
      check('P10.report', 'the bug-report door is reachable from the page: its own entry, and the rail above it', report.entries === 1 && report.rail, report);
      const examples = await page.evaluate(() => {
        const list = [...document.querySelectorAll('#sheet .example')];
        const fold = document.querySelector('#sheet details.more-examples');
        return { first: list[0]?.hasAttribute('data-own') || false, firstText: list[0]?.querySelector('.example-ja')?.textContent.slice(0, 40) || '',
          visible: list.filter((ex) => !ex.closest('details')).length, folded: fold ? fold.querySelectorAll('.example').length : 0, foldOpen: fold?.open ?? null };
      });
      check('P12.own-first', "the tapped word's own sentence leads the examples", examples.first && examples.firstText.includes(WORD), examples);
      check('P12.fold', 'the rest wait, folded, under More examples', examples.visible <= 2 && (examples.folded === 0 || examples.foldOpen === false), examples);
      // P3 the cycle
      await page.locator('#sheet-back').tap();
      await bare(page);
      const after = await page.evaluate((word) => {
        const tok = document.querySelector(`#reader .tok[aria-label="${word}"]`);
        return { sheet: !!document.getElementById('sheet'), mini: !!document.getElementById('mini'), lit: tok?.classList.contains('lit') || false,
          rubyShown: [...(tok?.querySelectorAll('rt') || [])].some((rt) => !rt.classList.contains('hidden-rt') && getComputedStyle(rt).display !== 'none' && rt.textContent.trim()),
          inert: document.querySelector('#app > main')?.inert || false };
      }, WORD);
      check('P3.close', 'Close leaves the reader bare: no page, no card, the raised reading gone, the room live again',
        !after.sheet && !after.mini && !after.lit && !after.rubyShown && !after.inert, after);
      await readerWord(page).tap();
      await page.locator('#mini .mini-word').waitFor();
      check('P3.again', 'the same word from bare opens its card again', (await slipFacts(page)).word === WORD, await slipFacts(page));
    });

    // P4 · P5 — a word inside the page, depth 2, Back twice; then Escape twice
    await walk('depth', async (page) => {
      await openStory(page);
      for (const way of ['back', 'escape']) {
        await readerWord(page).tap();
        await page.locator('#mini .mini-word').tap();
        await pageSettled(page);
        const inside = page.locator('#sheet .example .sentence-tok, #sheet .japanese-lookup-word').filter({ hasText: /^(内閣|大臣|官邸|日本|表彰|出席|大賞)$/u }).first();
        await inside.scrollIntoViewIfNeeded();
        await delay(300);
        const word = (await inside.textContent()).trim();
        await inside.tap();
        await page.locator('#mini .mini-word').waitFor();
        await delay(400);
        const slip = await slipFacts(page);
        const facts = await pageFacts(page);
        check(`P4.${way}.own-card`, `a word inside the page (${word}) opens its own card, one, on the page`, slip.count === 1 && slip.onPage && !!slip.word, slip);
        check(`P4.${way}.back-uncovered`, "the card leaves the page's bar uncovered", slip.top >= (facts?.bar?.bottom ?? 45) - 1, { slip, bar: facts?.bar });
        await page.locator('#mini .mini-word').tap();
        await pageSettled(page);
        const two = await pageFacts(page);
        await page.screenshot({ path: resolve(evidence, `${engine}-P4-${way}-depth2.png`) });
        check(`P4.${way}.depth2`, 'its band opens depth 2: ‹ Back and a crumb of two', two?.back === 'Back' && two.depth.split('›').length === 2 && coversViewport(two), two);
        if (way === 'back') await page.locator('#sheet-back').tap();
        else await page.keyboard.press('Escape');
        await delay(200);
        await page.waitForFunction(() => document.getElementById('sheet-back')?.textContent.trim() === 'Close', null, { timeout: 5000 }).catch(() => {});
        await delay(500);
        const one = await pageFacts(page);
        check(`P${way === 'back' ? 4 : 5}.${way}.depth1`, `${way === 'back' ? 'Back' : 'Escape'} steps out one level, to ${WORD}'s page`, one?.back === 'Close' && one.headword.startsWith(WORD), one);
        if (way === 'back') await page.locator('#sheet-back').tap();
        else await page.keyboard.press('Escape');
        await bare(page);
        const gone = await page.evaluate(() => ({ sheet: !!document.getElementById('sheet'), mini: !!document.getElementById('mini') }));
        check(`P${way === 'back' ? 4 : 5}.${way}.bare`, `${way === 'back' ? 'Back' : 'Escape'} again leaves the reader bare`, !gone.sheet && !gone.mini, gone);
      }
    });

    // P6 — no stale card: a card for a word below the page (a reading still on its way, a lookup still answering — here
    // the reader word's own activation, dispatched while the page stands over it) never floats over the page
    await walk('stale', async (page) => {
      await openStory(page);
      await readerWord(page).tap();
      await page.locator('#mini .mini-word').tap();
      await pageSettled(page);
      for (const index of [2, 5, 9]) {
        await page.evaluate((i) => document.querySelector(`#reader .tok[data-index="${i}"]`)?.click(), index);
        await delay(500);
      }
      await delay(800);
      const state = await page.evaluate(() => ({ sheet: document.getElementById('sheet')?.dataset.node || null,
        stray: [...document.querySelectorAll('#mini')].filter((mini) => !mini.hasAttribute('data-page')).length }));
      await page.screenshot({ path: resolve(evidence, `${engine}-P6-stale.png`) });
      check('P6.no-stale', 'no card for a word below floats over the page', !!state.sheet && state.stray === 0, state);
      // and a word on the page still gets its own card, clear of the bar
      const inside = page.locator('#sheet .japanese-lookup-word').first();
      await inside.scrollIntoViewIfNeeded();
      await inside.tap();
      await page.locator('#mini .mini-word').waitFor({ timeout: 8000 }).catch(() => {});
      const own = await slipFacts(page);
      check('P6.page-word', 'a word on the page still opens its own card there', own.count === 1 && own.onPage, own);
    });

    // P7 — frames, the method of one-hand/G1/frames.json: three opens and three closes, cold first
    await walk('frames', async (page) => {
      await openStory(page);
      const own = [];
      for (let rep = 0; rep < 3; rep++) {
        await readerWord(page).tap();
        await page.locator('#mini .mini-word').waitFor();
        await delay(1300);
        const open = await measure(page, page.locator('#mini .mini-word'));
        await pageSettled(page);
        const close = await measure(page, page.locator('#sheet-back'));
        await bare(page);
        own.push({ rep, open, close });
        frames.push({ engine, rep, phase: rep === 0 ? 'cold' : 'warm', open: open && { worst: open.worst, over24: open.over24 }, close: close && { worst: close.worst, over24: close.over24 }, openDeltas: open?.deltas, closeDeltas: close?.deltas });
      }
      const worst = Math.max(...own.flatMap(({ open, close }) => [open?.worst ?? Infinity, close?.worst ?? Infinity]));
      if (engine === 'webkit') check('P7.frames', 'the worst frame while the page opens and closes is ≤ 24 ms in WebKit', worst <= 24, own.map(({ rep, open, close }) => ({ rep, open: open?.worst, close: close?.worst })));
      else check('P7.frames-recorded', 'Chromium frames recorded beside WebKit (never averaged in)', Number.isFinite(worst), own.map(({ rep, open, close }) => ({ rep, open: open?.worst, close: close?.worst })));
    });

    // P8 — every world: opaque paper, a readable headword; 墨 opaque and scrim-free at depths 1–4
    await walk('worlds', async (page) => {
      for (const world of WORLDS) {
        await openStory(page, { world });
        await readerWord(page).tap();
        await page.locator('#mini .mini-word').tap();
        await pageSettled(page);
        const facts = await page.evaluate(() => {
          const sheet = document.getElementById('sheet');
          const head = sheet?.querySelector('.headword');
          const probe = document.createElement('div');
          probe.style.cssText = 'position:fixed;left:-9px;top:-9px;width:1px;height:1px;background:var(--color-paper, #f5efe0)';
          document.body.append(probe);
          const paper = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return { theme: document.documentElement.dataset.theme || '', background: sheet ? getComputedStyle(sheet).backgroundColor : null, paper,
            ink: head ? getComputedStyle(head).color : null };
        });
        const ratio = facts.background && facts.ink ? Math.round(contrast(facts.background, facts.ink) * 100) / 100 : 0;
        const opaque = !/rgba\([^)]*,\s*0(\.\d+)?\)|transparent/.test(String(facts.background)) && facts.background === facts.paper;
        check(`P8.${world}`, `${world}: the page's paper is the world's and opaque; its headword reads at ≥ 4.5:1`, opaque && ratio >= 4.5, { ...facts, ratio });
        if (world === 'sumi') {
          await page.screenshot({ path: resolve(evidence, `${engine}-P8-sumi-depth1.png`) });
          const depths = [await pageFacts(page)];
          const depthOf = () => page.evaluate(() => document.getElementById('sheet') ? (document.querySelector('#sheet .sheet-depth')?.textContent || 'x').split('›').length : 0);
          for (let depth = 2; depth <= 4; depth++) {
            // a door one level deeper: a kanji row, a word of its prose or of an example (through its card's band)
            const doors = page.locator('#sheet .entry-row[data-kanjirow], #sheet .japanese-lookup-word, #sheet .example .sentence-tok');
            for (let at = 0; at < 8 && await depthOf() < depth; at++) {
              const door = doors.nth(at);
              if (!await door.count()) break;
              await door.scrollIntoViewIfNeeded();
              await door.tap();
              await delay(500);
              if (await page.locator('#mini .mini-word').count()) await page.locator('#mini .mini-word').tap();
              await page.waitForFunction((n) => (document.querySelector('#sheet .sheet-depth')?.textContent || 'x').split('›').length >= n, depth, { timeout: 4000 }).catch(() => {});
              if (await page.locator('#mini').count()) await page.keyboard.press('Escape');
            }
            await pageSettled(page);
            await page.locator('#sheet').evaluate((sheet) => { sheet.scrollTop = sheet.scrollHeight; });
            await delay(300);
            depths.push({ ...await pageFacts(page), level: await depthOf() });
            await page.screenshot({ path: resolve(evidence, `${engine}-P8-sumi-depth${depth}.png`) });
          }
          check('P8.sumi-depths', '墨: the page stays opaque, scrim-free and whole-screen at depths 1–4 (scrolled to its foot)',
            depths.length === 4 && depths.every((facts, i) => facts && facts.alpha === 1 && facts.scrim === 0 && coversViewport(facts) && (i === 0 || facts.level === i + 1)),
            depths.map((facts) => facts && { node: facts.node, alpha: facts.alpha, scrim: facts.scrim, depth: facts.depth, level: facts.level }));
        }
      }
    });

    // P11 — one line per gloss: 海 from the dictionary's search
    await walk('gloss', async (page) => {
      await openStory(page);
      await page.locator('#chrome-search').click();
      await page.locator('#nav-search-input').fill('海');
      await page.locator('.nav-search-row').first().waitFor();
      await delay(700);
      const row = page.locator('.nav-search-row', { hasText: 'うみ' }).first();
      await (await row.count() ? row : page.locator('.nav-search-row').first()).click();
      await pageSettled(page);
      const lines = await page.evaluate(() => [...document.querySelectorAll('#sheet .dictionary-homograph')].map((line) => ({
        reading: line.querySelector('.row-reading')?.textContent || '', also: line.querySelector('.row-also')?.textContent || '',
        gloss: line.querySelector('.row-gloss')?.textContent || '' })));
      const sea = lines.find((line) => line.reading === 'うみ');
      check('P11.one-line', '海: the readings sharing "sea" are one line — うみ first, み, わた, わだ after "also"',
        !!sea && ['み', 'わた', 'わだ'].every((kana) => sea.also.includes(kana)) && !lines.some((line) => line !== sea && line.gloss === sea.gloss), lines);
    });

    // P13 — a Mac window
    await walk('desktop', async (page) => {
      await openStory(page);
      await readerWord(page).click();
      await page.locator('#mini .mini-word').click();
      await pageSettled(page);
      const facts = await pageFacts(page);
      await page.screenshot({ path: resolve(evidence, `${engine}-P13-desktop.png`) });
      check('P13.desktop', 'at 1280×800 the page covers the window', coversViewport(facts), facts);
    }, { viewport: { width: 1280, height: 800 }, mobile: false });

    await browser.close();
  }
} finally {
  await host.close();
}

function innerHeightOf(facts) { return facts?.inner?.height || 844; }

writeFileSync(resolve(evidence, 'verify-word-grammar.json'), JSON.stringify({ site, gitSha: identity.gitSha, artifactSha256: identity.artifactSha256, rows, frames }, null, 1));
const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} — evidence ${evidence}`);
process.exit(failed.length ? 1 : 0);
