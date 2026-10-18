/**
 * Hfix-1A · the reader and word surfaces after review round 1 (one-hand/HFIX1/BRIEF-A.md: the lead's confirmed list from
 * the round-1 shots, the Gemini critic's findings and FINDINGS.md). One named row per item, on the staged artifact, in the
 * engine KAIRO_BROWSER names (webkit or chromium; both when unset), at 390×844 unless the row names another size:
 *   1   the stage stands whole beside its word (the reading moves the least that seats it, the word kept on the glass); a
 *       stage no seat can hold ends between two rows, says so with a fade at its foot, and scrolls by touch and keyboard;
 * Negative controls: HFIX1A_NEGATIVE=<id> runs one item with its defect put back (the base's own lines served in place of
 * the fix, or CSS over the page) and that item's rows must go red; --controls runs every control after the plain run and
 * writes one row per control (killed = at least one of its item's rows red, with no page error). Claim boundary: headless
 * engines on a desk, not a phone; touch scrolling is a real gesture in Chromium only (WebKit has no touch input here: its
 * row reads the scroller's own styles and scrolls by keyboard).
 */
/* global window, document, getComputedStyle, innerWidth, innerHeight */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const CONTROLS = process.argv.includes('--controls');
const ONLY = process.env.HFIX1A_NEGATIVE || '';
const out = resolveCorridorEvidence();
mkdirSync(out, { recursive: true });
const host = await startCorridorDev(0);
const engines = process.env.KAIRO_BROWSER === 'chromium' ? { chromium }
  : process.env.KAIRO_BROWSER === 'webkit' ? { webkit } : { chromium, webkit };
const STORY = 'kantei:jp-105-actions-202609-25startup';
const WORD = '総理';
const WORD_SEL = `#reader .tok[data-prose-label="${WORD}"], #reader .tok[aria-label="${WORD}"]`;
const WORLDS = ['hokusai', 'yoru', 'akafuji'];
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

// the doors this check walks through, appended to the module's own source (it changes nothing it does not name)
const BRIDGE = `
window.__H1A__ = {
  open: async (id) => { try { removeMini(); } catch {} S.stack = []; const p = D.passages.find((x) => x.id === id); if (!p) return false; await ensureArticle(p); openPassage(p.id); window.scrollTo(0, 0); return true; },
  run: (src) => eval(src),
};`;

/* The negative controls: each item's defect put back. `source` serves the base's own lines in place of the fix
 * ([file, the fix's text, the base's text]); `css` lays the base's look over the page. `item` is the row prefix that
 * must go red. */
const CONTROL = {
  stage: { item: '1.', source: [
    ['corridor.js', 'const move = readingMoveFor(anchor, r, m.height, ceiling, floor, { most: true });', 'const move = 0;'],
    ['corridor.js', 'const fit = rowCut(card, Math.max(roomAbove, roomBelow, 96));', 'const fit = Math.max(roomAbove, roomBelow, 96);'],
  ] },
  'stage-fade': { item: '1.', css: "#mini[data-more='true']::after { content: none !important; }" },
};

const rows = [];
let control = null; // the control running now (its id), or null for the plain run
const check = (id, pass, detail = '') => {
  const name = control ? `${id} [control ${control}]` : id;
  rows.push({ id, control, pass: !!pass, detail: typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500) });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 320)}` : ''}`);
};

async function session(browser, { width = 390, height = 844, world = 'hokusai', ui = 'bi', query = 'entry=shelf', reduced = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    reducedMotion: reduced ? 'reduce' : 'no-preference', serviceWorkers: 'block', timezoneId: 'Asia/Tokyo', colorScheme: 'light' });
  await silenceBrowserAudio(context);
  await context.addInitScript((w) => { try { localStorage.setItem('kairo-theme', w); localStorage.setItem('kairo-word-ladder-demo-v1', '1'); } catch { /* private */ } }, world);
  const spec = control ? CONTROL[control] : null;
  const files = [...new Set((spec?.source || []).map(([f]) => f))];
  for (const file of files) await context.route(new RegExp(`/${file.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&')}(\\?.*)?$`), async (route) => {
    const r = await route.fetch();
    let body = await r.text();
    for (const [f, from, to] of spec.source) if (f === file) {
      assert.equal(body.split(from).length, 2, `control ${control}: "${from.slice(0, 60)}" must be in ${file} exactly once`);
      body = body.replace(from, to);
    }
    if (file === 'corridor.js') body += BRIDGE;
    await route.fulfill({ response: r, body });
  });
  if (!files.includes('corridor.js')) await context.route(/\/corridor\.js(\?.*)?$/u, async (route) => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: (await r.text()) + BRIDGE });
  });
  if (spec?.css) await context.addInitScript((css) => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.append(s); }); }, spec.css);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 240)));
  await page.goto(`${host.origin}/index.html?${query}&ui=${ui}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && window.__H1A__, null, { timeout: 60_000 });
  return { context, page, errors };
}
const settle = async (page, ms = 500) => {
  await page.waitForTimeout(ms);
  await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity).length === 0, null, { timeout: 4000 }).catch(() => {});
};
async function openStory(page) {
  assert(await page.evaluate((id) => window.__H1A__.open(id), STORY), `the story ${STORY} opens`);
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 20_000 });
  await settle(page, 700);
}
// G3 · tap 1 raises the reading, tap 2 brings the stage; the stage's ink and its sense settle before it is measured
async function stage(page, sel = WORD_SEL) {
  const tok = page.locator(sel).first();
  await tok.scrollIntoViewIfNeeded();
  await delay(200);
  await tok.tap();
  const rung = await page.waitForFunction((el) => (document.getElementById('mini') ? 'stage' : el.dataset.ladderRung === 'reading' ? 'reading' : null),
    await tok.elementHandle(), { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
  if (rung === 'reading') await tok.tap();
  await page.locator('#mini .mini-word').waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => { const m = document.getElementById('mini'); const w = m?.querySelector('.mini-word');
    return m && m.getAttribute('aria-busy') !== 'true' && (!w?.dataset.ink || !!w.dataset.inkEnded); }, null, { timeout: 12_000 }).catch(() => {});
  await settle(page, 400);
  return tok;
}
/** The stage, measured: its rows against its visible box, the word it stands for, the frame it stands in. */
const stageFacts = (page) => page.evaluate((sel) => {
  const card = document.getElementById('mini');
  if (!card) return null;
  const box = card.getBoundingClientRect(), border = parseFloat(getComputedStyle(card).borderTopWidth) || 0;
  const seen = { top: box.top + border, bottom: box.top + border + card.clientHeight };
  const rows = [...card.querySelectorAll('.mini-head, .mini-actions, .mini-band-head, .mini-kanji-row, .mini-sentence-open, .mini-take-reason, .mini-word-note')]
    .filter((n) => n.getClientRects().length).map((n) => { const r = n.getBoundingClientRect(); return { row: n.className.split(' ')[0], top: r.top, bottom: r.bottom }; });
  const word = document.querySelector(sel).getBoundingClientRect();
  const edge = (q, side) => { const n = document.querySelector(q); if (!n || !['fixed', 'sticky'].includes(getComputedStyle(n).position)) return null; const r = n.getBoundingClientRect(); return r.height ? r[side] : null; };
  const ceiling = Math.max(edge('#app > .chrome', 'bottom') ?? 0, edge('#app > .scale-thread', 'bottom') ?? 0);
  const floor = Math.min(innerHeight, edge('#primary-tabs', 'top') ?? innerHeight);
  // the app's own floor for a card: the tab bar, a listening row, a deck's grades, or the 層 mark where the card spans it
  const mark = document.getElementById('layers-mark')?.getBoundingClientRect();
  const spans = mark?.height && mark.right > box.left && mark.left < box.right;
  const cardFloor = Math.min(floor, edge('.listen-row', 'top') ?? floor, edge('.kp-grades', 'top') ?? floor, spans ? mark.top : floor);
  const after = getComputedStyle(card, '::after');
  return { top: box.top, bottom: box.bottom, seen, scrollHeight: card.scrollHeight, clientHeight: card.clientHeight, scrollTop: card.scrollTop,
    overflowY: getComputedStyle(card).overflowY, touchAction: getComputedStyle(card).touchAction, more: card.dataset.more || null,
    fade: after.content !== 'none' && after.content !== 'normal' ? { position: after.position, height: parseFloat(after.height), image: after.backgroundImage.slice(0, 80) } : null,
    rows, word: { top: word.top, bottom: word.bottom }, ceiling, floor, cardFloor, scrollY: window.scrollY, side: card.dataset.side };
}, WORD_SEL);
// a row is whole on the glass, or wholly past the cut: never across it (half a glyph)
const sliced = (f) => f.rows.filter((r) => r.top < f.seen.bottom - 0.5 && r.bottom > f.seen.bottom + 0.5);

async function itemStage(browser, engine) {
  // 1 · the stage stands whole, in three worlds: no row past its box, the word on the glass and clear of the card
  for (const world of WORLDS) {
    const { context, page, errors } = await session(browser, { world });
    try {
      await openStory(page);
      const before = await page.evaluate(() => window.scrollY);
      await stage(page);
      const f = await stageFacts(page);
      const whole = f.scrollHeight <= f.clientHeight + 1 && f.rows.every((r) => r.top >= f.seen.top - 0.5 && r.bottom <= f.seen.bottom + 0.5);
      const clear = f.word.top >= f.ceiling - 0.5 && f.word.bottom <= f.floor + 0.5 && (f.bottom <= f.word.top - 8 || f.top >= f.word.bottom + 8);
      const framed = f.top >= f.ceiling - 0.5 && f.bottom <= f.floor + 0.5;
      // the least move: a moved stage's far edge meets its frame (8 px over the tab bar or the 層 mark it spans, or the
      // frame's foot), or the reading never moved
      const moved = Math.round(f.scrollY - before);
      const least = moved === 0 || (moved > 0 ? f.cardFloor - f.bottom >= 6.5 && f.cardFloor - f.bottom <= 10 : f.top - f.ceiling >= -0.5 && f.top - f.ceiling <= 2);
      check(`1.stage-whole · ${engine} ${world} 390×844`, whole && clear && framed && least && !errors.length,
        { whole, clear, framed, least, moved, top: Math.round(f.top), bottom: Math.round(f.bottom), scrollHeight: f.scrollHeight, clientHeight: f.clientHeight,
          word: [Math.round(f.word.top), Math.round(f.word.bottom)], ceiling: f.ceiling, floor: f.floor, errors });
    } finally { await context.close(); }
  }
  // 1 · a short glass (390×560): no seat holds the stage, so it ends between two rows, fades at its foot and scrolls
  {
    const { context, page, errors } = await session(browser, { height: 560 });
    try {
      await openStory(page);
      await stage(page);
      const f = await stageFacts(page);
      const cut = sliced(f);
      check(`1.stage-cut · ${engine} 390×560 · the cut falls between two rows`, f.scrollHeight > f.clientHeight + 1 && !cut.length,
        { cut: cut.map((r) => `${r.row} ${Math.round(r.top)}–${Math.round(r.bottom)} across ${Math.round(f.seen.bottom)}`), scrollHeight: f.scrollHeight, clientHeight: f.clientHeight });
      check(`1.stage-fade · ${engine} 390×560 · a fade at its foot says there is more`,
        f.more === 'true' && f.fade?.position === 'sticky' && f.fade.height >= 16 && /gradient/u.test(f.fade.image), { more: f.more, fade: f.fade });
      // keyboard: Tab through the stage to its last door; the stage follows, shows it whole, and the fade leaves at the end
      await page.locator('#mini .mini-take, #mini button').first().focus();
      for (let i = 0; i < 14; i += 1) {
        if (await page.evaluate(() => document.activeElement?.matches?.('#mini .mini-sentence-open') || false)) break;
        await page.keyboard.press('Tab');
        await delay(60);
      }
      await delay(300);
      const k = await stageFacts(page);
      const door = await page.evaluate(() => { const d = document.activeElement; if (!d?.matches?.('#mini .mini-sentence-open')) return null; const r = d.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
      check(`1.stage-keys · ${engine} 390×560 · Tab reaches the last row, the stage scrolls it whole, the fade leaves`,
        !!door && door.top >= k.seen.top - 0.5 && door.bottom <= k.seen.bottom + 0.5 && k.scrollTop > 0 && k.more === 'false', { door, scrollTop: k.scrollTop, more: k.more });
      // keyboard again from the top: PageDown inside the stage scrolls it
      await page.evaluate(() => { document.getElementById('mini').scrollTop = 0; });
      await page.locator('#mini .mini-take, #mini button').first().focus();
      await delay(100);
      await page.keyboard.press('PageDown');
      await delay(400);
      const p = await stageFacts(page);
      // touch: a real finger drag in Chromium; in WebKit the scroller's own styles allow one
      let touched = null;
      await page.evaluate(() => { document.getElementById('mini').scrollTop = 0; });
      if (engine === 'chromium') {
        const cdp = await page.context().newCDPSession(page);
        const b = await page.locator('#mini').boundingBox();
        await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height * 0.7), yDistance: -160, gestureSourceType: 'touch', speed: 800 });
        await delay(500);
        touched = (await stageFacts(page)).scrollTop;
        await cdp.detach();
      }
      check(`1.stage-scrolls · ${engine} 390×560 · PageDown${engine === 'chromium' ? ' and a finger' : ''} scroll the stage`,
        p.scrollTop > 0 && p.overflowY === 'auto' && !/none|pan-x(?!.*pan-y)/u.test(p.touchAction) && (engine !== 'chromium' || touched > 0) && !errors.length,
        { pageDown: p.scrollTop, finger: touched, overflowY: p.overflowY, touchAction: p.touchAction, errors });
    } finally { await context.close(); }
  }
}

const ITEMS = [
  { id: 'stage', prefix: '1.', run: itemStage },
];

const log = { engines: {} };
async function runAll(only = null) {
  for (const [engine, type] of Object.entries(engines)) {
    const browser = await type.launch();
    log.engines[engine] = browser.version();
    console.log(`— ${engine} ${browser.version()}${control ? ` · negative control: ${control}` : ''}`);
    try {
      for (const item of ITEMS) {
        if (only && !only.includes(item.prefix)) continue;
        try { await item.run(browser, engine); }
        catch (error) { check(`${item.prefix}${item.id} · ${engine} · the walk ran`, false, String(error?.message || error).split('\n')[0]); }
      }
    } finally { await browser.close(); }
  }
}

try {
  if (ONLY) {
    assert(CONTROL[ONLY], `unknown control ${ONLY}`);
    control = ONLY;
    await runAll([CONTROL[ONLY].item]);
    const red = rows.filter((r) => r.id.startsWith(CONTROL[ONLY].item) && !r.pass);
    console.log(red.length ? `CONTROL ${ONLY} KILLED — ${red.length} red` : `CONTROL ${ONLY} SURVIVED — nothing went red`);
    if (!red.length) process.exitCode = 1;
  } else {
    await runAll();
    if (CONTROLS) {
      for (const id of Object.keys(CONTROL)) {
        const start = rows.length;
        control = id;
        await runAll([CONTROL[id].item]);
        control = null;
        const mine = rows.slice(start);
        const red = mine.filter((r) => !r.pass);
        const erred = mine.filter((r) => /page errors|the walk ran/u.test(r.id) && !r.pass);
        check(`control.${id} · its item's rows go red with the defect back`, red.length > 0 && !erred.length,
          { red: red.map((r) => r.id).slice(0, 6), erred: erred.map((r) => r.id) });
      }
    }
    const failed = rows.filter((r) => !r.control && !r.pass);
    console.log(failed.length ? `HFIX-1A FAIL — ${failed.length} of ${rows.filter((r) => !r.control).length}` : `HFIX-1A PASS — ${rows.filter((r) => !r.control).length} rows`);
    if (failed.length || !rows.length) process.exitCode = 1;
  }
} finally {
  writeFileSync(join(out, `hfix-1a${ONLY ? `-negative-${ONLY}` : CONTROLS ? '-controls' : ''}.json`), `${JSON.stringify({ engines: log.engines, negative: ONLY || null, controls: CONTROLS, rows }, null, 2)}\n`);
  await host.close();
}
