/**
 * Hfix-1A · the reader and word surfaces after review round 1 (one-hand/HFIX1/BRIEF-A.md: the lead's confirmed list from
 * the round-1 shots, the Gemini critic's findings and FINDINGS.md). One named row per item, on the staged artifact, in the
 * engine KAIRO_BROWSER names (webkit or chromium; both when unset), at 390×844 unless the row names another size:
 *   1   the stage stands whole beside its word (the reading moves the least that seats it, the word kept on the glass); a
 *       stage no seat can hold ends between two rows, says so with a fade at its foot, and scrolls by touch and keyboard;
 *   2   the open layers lie under no part of the 層 mark (it stands in their corner), whole on the glass; it folds them and
 *       goes home;
 *   3   at part depth the thread rests with no bead half under the sticky 宙, the current bead whole, also after a finger
 *       moves it;
 *   4   one Save on screen through the ladder: the bar's keep steps aside while a stage or a page stands, no door moves;
 *   5   Speak's top bar carries no Save;
 *   6   a word page shows its dictionary entry once (a lone door is the head of its senses) and names parts of speech in
 *       plain words, English or Japanese, with no JMdict romaji;
 *   7   a part page says what the part is in plain words (name, meaning, where it sits, in how many kanji); its number and
 *       strokes stay in its chips;
 *   8   a word page's thread offers no "kanji ›" before a kanji is entered from it; its way back in goes to the kanji entered;
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
  layers: { item: '2.', source: [['corridor.js', 'dockLayersMark(mark, block, null, () => layersOnGlass(block));', 'void layersOnGlass;']] },
  'one-save': { item: '4.', source: [['corridor.js', 'function paintKeepAside(button) {', 'function paintKeepAside(button) { return;']] },
  'speak-bar': { item: '5.', source: [['corridor.js', "  if (S.view === 'reader' && passage()) chrome.append(chromeKeep());",
    "  if ((S.view === 'reader' && passage()) || S.view === 'speak') chrome.append(chromeKeep());"]] },
  'one-entry': { item: '6.one', source: [['corridor.js', '  const lone = !node.readerChoice && dictionaryLoneDoor(node) &&', '  const lone = false &&']] },
  'plain-pos': { item: '6.plain', source: [['corridor.js', 'function dictionaryTag(tag) {', 'function dictionaryTag(tag) { return D.dictionaryIndex?.tags?.[tag] || tag;']] },
  'part-plain': { item: '7.', source: [['corridor.js', "        `${official.name}, ${meaning ? `the ${meaning} radical` : 'a radical'}, ${where[1]}.`,",
    '        `Official Kangxi radical no. ${official.n} — ${official.name} (${posText}). Below: the characters that contain this part.`,']] },
  'kanji-bead': { item: '8.', source: [['corridor.js', "  if (scale === 'word') return node?.enteredKanji && scaleWordKanji(node).includes(node.enteredKanji) ? 'kanji' : null;",
    "  if (scale === 'word') return scaleWordKanji(node).length ? 'kanji' : null;"]] },
  thread: { item: '3.', css: '.scale-thread { scroll-snap-type: none !important; }',
    source: [['corridor.js', '    if (delta) thread.scrollLeft = threadRest(thread, thread.scrollLeft + delta);', '    if (delta) thread.scrollLeft += delta;']] },
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

async function itemLayers(browser, engine) {
  // 2 · the 層 mark opens the layers and stands in their corner: no glyph or gloss of the block under it, the block whole on
  // the glass (a press anywhere folds it, so a phone can never scroll to its foot), and the mark folds it and goes home
  for (const world of WORLDS) {
    const { context, page, errors } = await session(browser, { world });
    try {
      await openStory(page);
      const home = await page.evaluate(() => { const r = document.getElementById('layers-mark').getBoundingClientRect(); return { left: r.left, top: r.top }; });
      await page.locator('#layers-mark').tap();
      await page.locator('#reader-layers').waitFor({ timeout: 6000 });
      await settle(page, 500);
      const f = await page.evaluate(() => {
        const mark = document.getElementById('layers-mark'), m = mark.getBoundingClientRect();
        const block = document.getElementById('reader-layers'), b = block.getBoundingClientRect();
        const under = [];
        const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) {
          const node = walk.currentNode;
          if (!node.textContent.trim() || node.parentElement.closest('#layers-mark')) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const q of range.getClientRects()) if (q.width > 0.5 && q.right > m.left - 2 && q.left < m.right + 2 && q.bottom > m.top - 2 && q.top < m.bottom + 2) under.push(node.textContent.trim().slice(0, 14));
        }
        const edge = (q, side) => { const n = document.querySelector(q); if (!n || !['fixed', 'sticky'].includes(getComputedStyle(n).position)) return null; const r = n.getBoundingClientRect(); return r.height ? r[side] : null; };
        const ceiling = Math.max(edge('#app > .chrome', 'bottom') ?? 0, edge('#app > .scale-thread', 'bottom') ?? 0);
        const floor = Math.min(innerHeight, edge('#primary-tabs', 'top') ?? innerHeight);
        return { under, block: [b.top, b.bottom], mark: [m.left, m.top, m.right, m.bottom], inBlock: m.top >= b.top - 1 && m.bottom <= b.bottom + 1 && m.left >= b.left - 1 && m.right <= b.right + 1,
          ceiling, floor, pressed: mark.getAttribute('aria-pressed') };
      });
      const onGlass = f.block[0] >= f.ceiling - 0.5 && f.block[1] <= f.floor + 0.5;
      check(`2.layers-clear · ${engine} ${world} · no glyph or gloss of the open layers under 層, the block whole on the glass`,
        !f.under.length && onGlass && f.inBlock && f.pressed === 'true' && !errors.length,
        { under: f.under, block: f.block.map(Math.round), mark: f.mark.map(Math.round), inBlock: f.inBlock, ceiling: f.ceiling, floor: f.floor, errors });
      await page.locator('#layers-mark').tap();
      await settle(page, 450);
      const back = await page.evaluate(() => { const mark = document.getElementById('layers-mark'), r = mark.getBoundingClientRect();
        return { block: !!document.getElementById('reader-layers'), left: r.left, top: r.top, docked: !!mark.dataset.docked, position: getComputedStyle(mark).position, pressed: mark.getAttribute('aria-pressed') }; });
      check(`2.layers-home · ${engine} ${world} · the mark folds its layers and goes home to the foot`,
        !back.block && !back.docked && back.position === 'fixed' && Math.abs(back.left - home.left) <= 1 && Math.abs(back.top - home.top) <= 1 && back.pressed === 'false',
        { back, home });
    } finally { await context.close(); }
  }
}

// G6's visible, live rail (verify-word-grammar's G6 part)
const RAIL = '.scale-thread:not([inert]):not([aria-hidden="true"]):not([inert] .scale-thread):not([aria-hidden="true"] .scale-thread):visible';
/** The rail as it rests: 宙's box and every bead's, the current one named. */
const railFacts = (page, scale) => page.evaluate((scale) => {
  const rail = [...document.querySelectorAll(`.scale-thread[data-scale="${scale}"]`)].find((n) => !n.closest('[inert],[aria-hidden="true"]') && n.getClientRects().length);
  if (!rail) return null;
  const r = rail.getBoundingClientRect(), out = rail.querySelector(':scope > [data-scale-out]').getBoundingClientRect();
  const beads = [...rail.children].filter((n) => !n.matches('[data-scale-out]')).map((n) => { const b = n.getBoundingClientRect();
    return { label: n.textContent.trim().slice(0, 12), left: b.left, right: b.right, current: n.getAttribute('aria-current') === 'step' }; });
  return { scrollLeft: rail.scrollLeft, scrollWidth: rail.scrollWidth, clientWidth: rail.clientWidth, left: r.left + rail.clientLeft,
    right: r.left + rail.clientLeft + rail.clientWidth, out: { left: out.left, right: out.right }, beads };
}, scale);
// a bead rests whole beside 宙, or wholly under it: never across 宙's edge (H1: "shelf" read "elf")
const straddling = (f) => f.beads.filter((b) => b.left < f.out.right - 0.5 && b.right > f.out.right + 0.5);
async function itemThread(browser, engine) {
  // 3 · the thread at part depth (G6: article → sentence → word → kanji → part), in three worlds: no bead half under 宙, the
  // current bead whole on the rail; and after a finger moves the rail, it rests the same way
  for (const world of WORLDS) {
    const { context, page, errors } = await session(browser, { world });
    try {
      await openStory(page);
      // the rail names its origin once a word has been opened (verify-word-grammar g6OpenOrigin)
      await stage(page);
      await page.keyboard.press('Escape'); await delay(250); await page.keyboard.press('Escape'); await delay(250);
      for (const [from, to] of [['article', 'sentence'], ['sentence', 'word'], ['word', 'kanji'], ['kanji', 'part']]) {
        await page.locator(`${RAIL}[data-scale="${from}"] button[data-scale-in]`).tap();
        await page.waitForFunction((s) => [...document.querySelectorAll('.scale-thread')].some((n) => !n.closest('[inert],[aria-hidden="true"]') && n.getClientRects().length && n.dataset.scale === s), to, { timeout: 8000 });
        await settle(page, 450);
      }
      const f = await railFacts(page, 'part');
      const current = f.beads.find((b) => b.current);
      const whole = !!current && current.left >= f.out.right - 0.5 && current.right <= f.right + 0.5;
      check(`3.thread-rest · ${engine} ${world} · at part depth no bead stands half under 宙, the current bead whole`,
        f.scrollWidth > f.clientWidth && !straddling(f).length && whole && !errors.length,
        { scrollLeft: f.scrollLeft, overflow: f.scrollWidth - f.clientWidth, straddling: straddling(f).map((b) => `${b.label} ${Math.round(b.left)}–${Math.round(b.right)}`),
          out: Math.round(f.out.right), current: current && [current.label, Math.round(current.left), Math.round(current.right)], errors });
      // a finger moves the rail part way back; where it comes to rest, no bead is half under 宙 either
      await page.evaluate(() => { const rail = [...document.querySelectorAll('.scale-thread[data-scale="part"]')].find((n) => n.getClientRects().length); rail.scrollBy({ left: -20, behavior: 'instant' }); });
      await delay(700);
      const g = await railFacts(page, 'part');
      check(`3.thread-moved · ${engine} ${world} · moved 20 px back by hand, the rail rests on a whole bead`, !straddling(g).length,
        { scrollLeft: g.scrollLeft, straddling: straddling(g).map((b) => `${b.label} ${Math.round(b.left)}–${Math.round(b.right)}`), out: Math.round(g.out.right) });
    } finally { await context.close(); }
  }
}

/** Every Save a finger could press now: shown (visible, on the glass) and the topmost thing at its own centre. */
const liveSaves = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('button.save-one, [data-save-one], #mini-take, #sheet-take, #chrome-keep')])]
  .filter((n) => {
    const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
    if (!r.width || !r.height || cs.visibility !== 'visible' || Number(cs.opacity) === 0 || r.bottom <= 0 || r.top >= innerHeight) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === n || n.contains(hit));
  }).map((n) => n.id || n.className.split(' ')[0]));
async function itemOneSave(browser, engine) {
  // 4 · one Save on screen through the ladder, in three worlds: bare (the bar's), the stage (its own), the page (its own),
  // Back to the stage, folded (the bar's again, naming the word); the bar's other doors never move
  for (const world of WORLDS) {
    const { context, page, errors } = await session(browser, { world });
    try {
      await openStory(page);
      const tray = () => page.evaluate(() => { const r = document.getElementById('tray')?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top)] : null; });
      const at = { bare: { saves: await liveSaves(page), tray: await tray() } };
      await stage(page);
      at.stage = { saves: await liveSaves(page), tray: await tray() };
      await page.locator('#mini .mini-word').tap();
      await page.locator('#sheet').waitFor();
      await settle(page, 700);
      at.page = { saves: await liveSaves(page) };
      await page.locator('#sheet-back').first().click();
      await page.waitForFunction(() => !document.getElementById('sheet') && !!document.getElementById('mini'), null, { timeout: 8000 }).catch(() => {});
      await settle(page, 500);
      at.back = { saves: await liveSaves(page) };
      await page.keyboard.press('Escape');
      await settle(page, 400);
      at.folded = { saves: await liveSaves(page), name: await page.locator('#chrome-keep').getAttribute('aria-label') };
      const one = (list, id) => list.length === 1 && list[0] === id;
      check(`4.one-save · ${engine} ${world} · one Save on screen: bare the bar's, the stage's, the page's, Back the stage's, folded the bar's naming 総理; no door moved`,
        one(at.bare.saves, 'chrome-keep') && one(at.stage.saves, 'mini-take') && one(at.page.saves, 'sheet-take') && one(at.back.saves, 'mini-take') &&
        one(at.folded.saves, 'chrome-keep') && /総理/u.test(at.folded.name || '') && JSON.stringify(at.bare.tray) === JSON.stringify(at.stage.tray) && !errors.length, { ...at, errors });
    } finally { await context.close(); }
  }
}
async function itemSpeakBar(browser, engine) {
  // 5 · Speak's bar carries no Save (round 1: "Save a…" cut in hakuu, rokusho, nami): reached as he reaches it, Learn → Speak
  for (const world of ['hakuu', 'hokusai']) {
    const { context, page, errors } = await session(browser, { world });
    try {
      await page.locator('#tab-learn').tap();
      await page.waitForFunction(() => ['dojo', 'tests'].includes(document.body.dataset.view), null, { timeout: 15_000 });
      await settle(page, 500);
      await page.locator('[data-study-door="speak"]').first().tap();
      await page.waitForFunction(() => document.body.dataset.view === 'speak', null, { timeout: 15_000 });
      await settle(page, 1200);
      const bar = await page.evaluate(() => {
        const chrome = document.querySelector('#app > .chrome');
        return { saves: chrome ? chrome.querySelectorAll('[data-save-bar], button.save-one, [data-save-one]').length : -1,
          words: chrome ? [...chrome.querySelectorAll('button')].map((n) => n.textContent.replace(/\s+/gu, ' ').trim()).filter((t) => /^(Save|保存)/u.test(t)) : [] };
      });
      check(`5.speak-bar · ${engine} ${world} · Speak's top bar carries no Save`, bar.saves === 0 && !bar.words.length && !errors.length, { ...bar, errors });
    } finally { await context.close(); }
  }
}

// 6 · the first sense's part of speech on each fixture's page, as a learner names it, in each interface language
const POS_ORACLE = {
  bi: { 総理: 'noun · abbreviation', 高い: 'i-adjective', 書く: 'verb (godan) · transitive verb', 静か: 'na-adjective', 大きな: 'pre-noun adjective' },
  ja: { 総理: '名詞 · 略語', 高い: 'い形容詞', 書く: '五段動詞 · 他動詞', 静か: 'な形容詞', 大きな: '連体詞' },
};
// the romaji JMdict writes into its descriptions (futsuumeishi, keiyoushi …): never shown
const ROMAJI_TAG = /\((?:futsuumeishi|keiyoushi|keiyodoshi|fukushi|fukushitekimeishi|jisoumeishi|rentaishi|kandoushi|sonkeigo|kenjougo|teineigo)\)/u;
const pageFacts = (page) => page.evaluate(() => {
  const sheet = document.getElementById('sheet');
  const leaves = [...sheet.querySelectorAll('*')].filter((n) => !n.children.length && n.getClientRects().length && getComputedStyle(n).visibility === 'visible');
  return { node: sheet.dataset.node, blocks: [...sheet.querySelectorAll('.dictionary-homographs')].map((n) => ({ head: n.classList.contains('is-entry-head'), inSenses: !!n.closest('.senses') })),
    doors: [...sheet.querySelectorAll('.dictionary-homograph[data-dictionary-entry]')].map((n) => ({ seq: n.dataset.dictionaryEntry, live: !n.disabled, text: n.textContent.replace(/\s+/gu, ' ').trim() })),
    forms: sheet.querySelectorAll('.dictionary-forms').length, pos: [...sheet.querySelectorAll('.sense-pos')].map((n) => n.textContent),
    texts: leaves.map((n) => n.textContent.trim()) };
});
async function itemEntry(browser, engine) {
  // 6 · 総理's whole page, reached as he reaches it (stage → its band): one entry block — its door the head of its senses,
  // no card of its own, the meaning shown once
  {
    const { context, page, errors } = await session(browser);
    try {
      await openStory(page);
      await stage(page);
      await page.locator('#mini .mini-word').tap();
      await page.locator('#sheet').waitFor();
      await page.waitForFunction(() => !!document.querySelector('#sheet .dictionary-senses .sense-pos'), null, { timeout: 15_000 });
      await settle(page, 600);
      const f = await pageFacts(page);
      const meaning = 'prime minister (as the head of a cabinet government)';
      const copies = f.texts.filter((t) => t.includes(meaning)).length;
      check(`6.one-entry · ${engine} · 総理's page shows its dictionary entry once: the door is the head of its senses, no card of its own`,
        f.blocks.length === 1 && f.blocks[0].head && f.blocks[0].inSenses && f.doors.length === 1 && f.doors[0].live && /総理/u.test(f.doors[0].text) &&
        !f.doors[0].text.includes('prime minister') && f.forms === 0 && copies === 1 && !errors.length, { ...f, texts: undefined, copies, errors });
    } finally { await context.close(); }
  }
  // 6 · parts of speech in plain words, in both interface languages (bi = English): the oracle's first sense, and no
  // JMdict romaji anywhere; in 日本語 no Latin letters at all
  for (const ui of ['bi', 'ja']) {
    const { context, page, errors } = await session(browser, { ui });
    try {
      const seen = {};
      for (const word of Object.keys(POS_ORACLE[ui])) {
        await page.evaluate((id) => window.__H1A__.run(`(() => { S.stack = []; go({ t: 'word', id: ${JSON.stringify(id)} }); })()`), word);
        await page.waitForFunction(() => !!document.querySelector('#sheet .dictionary-senses .sense-pos'), null, { timeout: 15_000 }).catch(() => {});
        await settle(page, 250);
        seen[word] = (await pageFacts(page)).pos;
        await page.evaluate(() => window.__H1A__.run('(() => { S.stack = []; render(); })()'));
        await delay(200);
      }
      const wrong = Object.entries(POS_ORACLE[ui]).filter(([word, want]) => seen[word]?.[0] !== want);
      const romaji = Object.values(seen).flat().filter((t) => ROMAJI_TAG.test(t) || (ui === 'ja' && /[A-Za-z]/u.test(t)));
      check(`6.plain-pos · ${engine} ${ui} · parts of speech in plain words: ${Object.values(POS_ORACLE[ui]).join(' / ')}; no romaji tags`,
        !wrong.length && !romaji.length && !errors.length, { wrong: wrong.map(([w, want]) => `${w}: "${seen[w]?.[0]}" (want "${want}")`), romaji: romaji.slice(0, 6), errors });
    } finally { await context.close(); }
  }
}

// 7 · the part page's sentence, word for word, for 糸 (round 1's page) and three other positions, in both languages
const PART_ORACLE = {
  bi: { 糸: 'いとへん, the thread radical, on the left of 68 kanji.', 艹: 'くさかんむり, the grass radical, across the top of 82 kanji.',
    辶: 'しんにょう, the walk radical, wrapping the left and foot of 57 kanji.', 戈: 'ほこづくり, the halberd radical, on the right of 48 kanji.' },
  ja: { 糸: 'いとへんは「いと」の部首。68字の左側にある。', 艹: 'くさかんむりは「くさ」の部首。82字の上にのる。',
    辶: 'しんにょうは部首のひとつ。57字の左から下を囲む。', 戈: 'ほこづくりは「ほこ」の部首。48字の右側にある。' },
};
async function itemPart(browser, engine) {
  // 7 · the part page says what the part is in plain words; its number and strokes stay in its chips
  for (const ui of ['bi', 'ja']) {
    const { context, page, errors } = await session(browser, { ui });
    try {
      const seen = {};
      for (const part of Object.keys(PART_ORACLE[ui])) {
        await page.evaluate((id) => window.__H1A__.run(`(() => { S.stack = []; go({ t: 'radical', id: ${JSON.stringify(id)} }); })()`), part);
        await page.locator('#sheet .note').waitFor({ timeout: 10_000 });
        await settle(page, 250);
        seen[part] = await page.evaluate(() => ({ note: document.querySelector('#sheet .note')?.textContent ?? null,
          chips: [...document.querySelectorAll('#sheet .hero .pool-tag')].map((n) => n.textContent) }));
        await page.evaluate(() => window.__H1A__.run('(() => { S.stack = []; render(); })()'));
        await delay(200);
      }
      const wrong = Object.entries(PART_ORACLE[ui]).filter(([part, want]) => seen[part]?.note !== want);
      const chips = seen['糸']?.chips || [];
      const facts = chips.some((t) => /(部首|radical) 120/u.test(t)) && chips.some((t) => /68 (字|kanji)/u.test(t)) && chips.some((t) => /6 (画|strokes)/u.test(t));
      const technical = Object.values(seen).filter((f) => /Kangxi|康熙|Below:|下は、/u.test(f.note || ''));
      check(`7.part-plain · ${engine} ${ui} · the part page says what the part is in plain words (${PART_ORACLE[ui]['糸']}); radical 120, 6 strokes and 68 kanji stay in its chips`,
        !wrong.length && facts && !technical.length && !errors.length, { wrong: wrong.map(([p]) => `${p}: "${seen[p]?.note}"`), chips, errors });
    } finally { await context.close(); }
  }
}

async function itemKanjiBead(browser, engine) {
  // 8 · 総理's whole page (stage → band): its rail ends at the word, no "kanji ›" (a level he has not entered); in through
  // 理's own row and out again, the rail's way in returns to 理, the kanji entered
  const { context, page, errors } = await session(browser);
  try {
    await openStory(page);
    await stage(page);
    await page.locator('#mini .mini-word').tap();
    await page.locator('#sheet').waitFor();
    await settle(page, 600);
    const wordRail = () => page.evaluate(() => { const rail = [...document.querySelectorAll('.scale-thread[data-scale="word"]')].find((n) => !n.closest('[inert],[aria-hidden="true"]') && n.getClientRects().length);
      return rail ? { beads: [...rail.children].map((n) => n.textContent.trim()), inward: [...rail.querySelectorAll('[data-scale-in]')].map((n) => n.textContent.trim()) } : null; });
    const first = await wordRail();
    await page.locator('#sheet .entry-row[data-kanjirow="理"]').tap();
    await page.waitForFunction(() => document.getElementById('sheet')?.dataset.node === 'kanji:理', null, { timeout: 8000 });
    await settle(page, 500);
    await page.locator(`${RAIL}[data-scale="kanji"] button[data-scale-out]`).tap();
    await page.waitForFunction(() => document.getElementById('sheet')?.dataset.node?.startsWith('word:'), null, { timeout: 8000 });
    await settle(page, 500);
    const back = await wordRail();
    let into = null;
    if (back?.inward.length === 1) {
      await page.locator(`${RAIL}[data-scale="word"] button[data-scale-in]`).tap();
      await page.waitForFunction(() => document.getElementById('sheet')?.dataset.node?.startsWith('kanji:'), null, { timeout: 8000 }).catch(() => {});
      into = await page.evaluate(() => document.getElementById('sheet')?.dataset.node ?? null);
    }
    check(`8.kanji-bead · ${engine} · 総理's page shows no "kanji ›" before a kanji is entered; back out of 理, its way in returns to 理`,
      !!first && first.inward.length === 0 && !first.beads.some((t) => /kanji|漢字/u.test(t)) && back?.inward.length === 1 && into === 'kanji:理' && !errors.length,
      { first, back, into, errors });
  } finally { await context.close(); }
}

const ITEMS = [
  { id: 'stage', prefix: '1.', run: itemStage },
  { id: 'layers', prefix: '2.', run: itemLayers },
  { id: 'thread', prefix: '3.', run: itemThread },
  { id: 'one-save', prefix: '4.', run: itemOneSave },
  { id: 'speak-bar', prefix: '5.', run: itemSpeakBar },
  { id: 'entry', prefix: '6.', run: itemEntry },
  { id: 'part', prefix: '7.', run: itemPart },
  { id: 'kanji-bead', prefix: '8.', run: itemKanjiBead },
];

const log = { engines: {} };
async function runAll(only = null) {
  for (const [engine, type] of Object.entries(engines)) {
    const browser = await type.launch();
    log.engines[engine] = browser.version();
    console.log(`— ${engine} ${browser.version()}${control ? ` · negative control: ${control}` : ''}`);
    try {
      for (const item of ITEMS) {
        if (only && !only.some((prefix) => prefix.startsWith(item.prefix))) continue;
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
        const red = mine.filter((r) => r.id.startsWith(CONTROL[id].item) && !r.pass);
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
