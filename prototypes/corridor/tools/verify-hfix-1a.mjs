/**
 * Hfix-1A · the reader and word surfaces after review round 1 (one-hand/HFIX1/BRIEF-A.md: the lead's confirmed list from
 * the round-1 shots, the Gemini critic's findings and FINDINGS.md). One named row per item, on the staged artifact, in the
 * engine KAIRO_BROWSER names (webkit or chromium; both when unset), at 390×844 unless the row names another size:
 *   1   the stage stands whole beside its word where a seat holds it; else it ends between two rows, says so with a fade at
 *       its foot, and scrolls by touch and keyboard;
 *       the print never moves for it (G3), and its seat never ends the word's writing (1.ink), while his own scroll does;
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
 *   9   the open screen's article title breaks only between its words (jaWords), at 390 and 320;
 *   10  the shelf's vertical room sign stands whole: 8 px from the glass's edges, under the bar and thread, clear of Tools;
 *   11  full-width Latin and digits in the reader (Ｍｕｊｉｎ, ２０２６) set proportionally (palt), unbroken, text unchanged;
 *   12  under 360 px a word on six lists shows at most three in the hold strip, then "All lists · 6", and the strip never
 *       scrolls inside itself; 390 keeps all six;
 *   14  W-2: a load the page abandons as it goes settles caught (no page error), and loads work again after pageshow;
 *       W-1: a dictionary shard that fails once is asked again, and the stage still lands on its sense;
 *   15  R3-3: さもなければかの is ば + かの (that), never ばか (idiot);
 *   16  H0-1: Today's note field shows its whole hint at 390 and 320, in English and 日本語;
 *   19  on a fresh device the first-use word demo's slip mounts once: its read-mini-rise runs once to its end at full
 *       opacity, and its answer comes in place (as shipped, and with the arrival stretched so the answer lands mid-rise);
 * HFIX1A_ONLY=1.ink,3. runs only the items with those row prefixes (a partial run, never an acceptance: exit 3 when green).
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
const PART = (process.env.HFIX1A_ONLY || '').split(',').map((p) => p.trim()).filter(Boolean);
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
  // a seat that scrolls the reading (the defect the round-1 capture found: every writing ended before its first stroke)
  'ink-seat': { item: '1.ink', source: [['corridor.js', '  card.style.top = `${top}px`;\n', "  card.style.top = `${top}px`;\n  if (card.id === 'mini' && !card.dataset.inkSeat) { card.dataset.inkSeat = '1'; window.scrollBy({ top: 40, behavior: 'instant' }); }\n"]] },
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
  'open-title': { item: '9.', css: '#drift-layer .scale-star-caption.is-words { word-break: normal !important; overflow-wrap: anywhere !important; line-break: auto !important; }' },
  'shelf-sign': { item: '10.', css: "body:not([data-view='drift']) #app:has(> .scale-thread) > main > .room-sign { top: calc(52px + env(safe-area-inset-top, 0px)) !important; right: 6px !important; }" },
  fullwidth: { item: '11.', css: '.tok-word .fw-run { font-feature-settings: normal !important; }' },
  'strip-lists': { item: '12.', source: [['corridor.js', '    const shownLists = window.innerWidth < 360 ? 3 : SEAL_LISTS_SHOWN;', '    const shownLists = SEAL_LISTS_SHOWN;'],
    ['corridor.js', '    open.fitLists = () => {', '    open.fitLists = () => { return;']] },
  'fetch-abort': { item: '14.abort', source: [['corridor.js', "addEventListener('pagehide', () => pageLoads.abort());", 'void pageLoads;']] },
  'fetch-retry': { item: '14.retry', source: [['corridor.js', "if (error?.name === 'AbortError' || signal.aborted || attempt >= 1) throw error;",
    "if (error?.name === 'AbortError' || signal.aborted || attempt >= 0) throw error;"]] },
  'seg-baka': { item: '15.', source: [['data/articles/aozora-049966-2.json',
    '{"s":"ば","b":"ば","p":"助詞","r":"ば","f":[{"t":"ば"}],"c":false,"rs":"segment"},{"s":"かの","b":"かの","p":"連体詞","r":"かの","f":[{"t":"かの"}],"c":true,"rs":"segment"}',
    '{"s":"ばか","b":"ばか","p":"名詞","r":"ばか","f":[{"t":"ばか"}],"c":true},{"s":"の","b":"の","p":"助詞","r":"の","f":[{"t":"の"}],"c":false}']] },
  // 19 · a slip drawn again on its own word is a new element again (the base's remount)
  remount: { item: '19.', source: [['corridor.js', '  const standing = arriving ? null : standingSlip();', '  const standing = null;']] },
  'note-hint': { item: '16.', css: '.chat-row:has(> #note-input) { flex-wrap: nowrap !important; } .chat-row > #note-input { flex: 1 !important; padding-inline: 20px !important; } .chat-row > #note-input::placeholder { font-size: var(--type-chrome) !important; }' },
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

async function session(browser, { width = 390, height = 844, world = 'hokusai', ui = 'bi', query = 'entry=shelf', reduced = false,
  fresh = false, css = null, init = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    reducedMotion: reduced ? 'reduce' : 'no-preference', serviceWorkers: 'block', timezoneId: 'Asia/Tokyo', colorScheme: 'light' });
  await silenceBrowserAudio(context);
  // a fresh device (item 19) has never seen the first-use word demo; every other walk has
  await context.addInitScript(([w, seen]) => { try { localStorage.setItem('kairo-theme', w); if (seen) localStorage.setItem('kairo-word-ladder-demo-v1', '1'); } catch { /* private */ } }, [world, !fresh]);
  if (init) await context.addInitScript(init);
  if (css) await context.addInitScript((text) => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = text; document.head.append(s); }); }, css);
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
  // 1 · in three worlds at 390×844 the stage shows all its rows, or ends between two rows and says it scrolls (a fade at
  // its foot); never a row sliced mid-glyph. The word stays on the glass, clear of the card, and the print never moves
  // for it (G3: the second activation exposes the stage without moving the print)
  for (const world of WORLDS) {
    const { context, page, errors } = await session(browser, { world });
    try {
      await openStory(page);
      await page.locator(WORD_SEL).first().scrollIntoViewIfNeeded();
      await delay(200);
      const before = await page.evaluate((sel) => ({ y: window.scrollY, word: document.querySelector(sel).getBoundingClientRect().top }), WORD_SEL);
      await stage(page);
      const f = await stageFacts(page);
      const whole = f.scrollHeight <= f.clientHeight + 1 && f.rows.every((r) => r.top >= f.seen.top - 0.5 && r.bottom <= f.seen.bottom + 0.5);
      const cutClean = f.scrollHeight > f.clientHeight + 1 && !sliced(f).length && f.more === 'true' && !!f.fade;
      const clear = f.word.top >= f.ceiling - 0.5 && f.word.bottom <= f.floor + 0.5 && (f.bottom <= f.word.top - 8 || f.top >= f.word.bottom + 8);
      const framed = f.top >= f.ceiling - 0.5 && f.bottom <= f.floor + 0.5;
      const still = Math.abs(f.scrollY - before.y) < 1 && Math.abs(f.word.top - before.word) < 2;
      check(`1.stage-whole · ${engine} ${world} 390×844 · every row shown, or a clean cut that says it scrolls; the word clear and the print still`,
        (whole || cutClean) && clear && framed && still && !errors.length,
        { whole, cutClean, clear, framed, still, moved: Math.round(f.scrollY - before.y), sliced: sliced(f).map((r) => r.row), more: f.more,
          top: Math.round(f.top), bottom: Math.round(f.bottom), scrollHeight: f.scrollHeight, clientHeight: f.clientHeight,
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
      // item 8: the rail offers a word's kanji only once that kanji has been entered, so the word → kanji step is the
      // page's kanji row (G6's own door, verify-word-grammar's g6Door); the other steps are the rail's
      const railAt = (to) => page.waitForFunction((s) => [...document.querySelectorAll('.scale-thread')].some((n) => !n.closest('[inert],[aria-hidden="true"]') && n.getClientRects().length && n.dataset.scale === s), to, { timeout: 8000 });
      for (const [from, to] of [['article', 'sentence'], ['sentence', 'word'], ['word', 'kanji'], ['kanji', 'part']]) {
        if (from === 'word') {
          const row = page.locator('#sheet .entry-row[data-kanjirow]').first();
          await row.scrollIntoViewIfNeeded(); await row.tap();
        } else await page.locator(`${RAIL}[data-scale="${from}"] button[data-scale-in]`).tap();
        await railAt(to);
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

async function itemOpenTitle(browser, engine) {
  // 9 · the open screen's article star: its caption's lines end only between the title's own words (the app's one word
  // rule, jaWords), at 390 and 320, in the world round 1 found 知床 broken in
  for (const width of [390, 320]) {
    const { context, page, errors } = await session(browser, { world: 'nami', width, query: 'entry=' });
    try {
      await page.waitForSelector('#drift-layer .scale-star-article .scale-star-caption', { timeout: 15_000 });
      await settle(page, 900);
      const f = await page.evaluate(() => {
        const cap = document.querySelector('#drift-layer .scale-star-article .scale-star-caption');
        const title = cap.textContent, words = window.__H1A__.run(`jaWords(${JSON.stringify(cap.textContent)})`);
        const ends = new Set(); let at = 0; for (const w of words) { at += w.length; ends.add(at); }
        const breaks = []; let prev = null, i = 0;
        const walk = document.createTreeWalker(cap, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) { const n = walk.currentNode; for (let k = 0; k < n.length; k += 1, i += 1) { const r = document.createRange(); r.setStart(n, k); r.setEnd(n, k + 1);
          const b = [...r.getClientRects()].find((q) => q.width > 0.1); if (!b) continue; if (prev && b.top > prev.bottom - 2) breaks.push(i); prev = b; } }
        return { title, words, breaks, inside: breaks.filter((x) => !ends.has(x) && !/\s/u.test(title[x - 1] || '')).map((x) => `${title.slice(Math.max(0, x - 4), x)}｜${title.slice(x, x + 4)}`) };
      });
      check(`9.open-title · ${engine} nami ${width} · the open screen's title breaks only between its words (${f.title})`,
        f.words.join('') === f.title && !f.inside.length && !errors.length, { breaks: f.breaks, inside: f.inside, words: f.words, errors });
    } finally { await context.close(); }
  }
}

async function itemShelfSign(browser, engine) {
  // 10 · the shelf's vertical room sign stands whole on the glass: 8 px or more from its edges, under the bar and the thread
  // (not behind them), clear of the Tools door and the first card; Today's sign keeps the same edge
  for (const [world, width, room] of [['akafuji', 390, 'shelf'], ['shu', 390, 'shelf'], ['hokusai', 320, 'shelf'], ['hokusai', 390, 'tray']]) {
    const { context, page, errors } = await session(browser, { world, width, query: room === 'shelf' ? 'entry=shelf' : 'entry=shelf&room=tray' });
    try {
      await page.waitForSelector('#app > main > .room-sign', { timeout: 15_000 });
      await settle(page, 500);
      const f = await page.evaluate(() => {
        const box = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return r.width ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null; };
        const sign = document.querySelector('#app > main > .room-sign'), s = box(sign);
        const glyphs = []; const walk = document.createTreeWalker(sign, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) { const r = document.createRange(); r.selectNodeContents(walk.currentNode); glyphs.push(...[...r.getClientRects()].filter((q) => q.width > 0.5)); }
        // what stands over the sign's glyphs (the sign itself takes no pointer: the topmost other thing at each glyph)
        const over = glyphs.map((g) => document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2)).filter((n) => n?.closest('#app > .chrome, #app > .scale-thread')).length;
        const frame = Math.max(box(document.querySelector('#app > .chrome'))?.bottom ?? 0, box(document.querySelector('#app > .scale-thread'))?.bottom ?? 0);
        const hits = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const tools = box(document.getElementById('shelf-tools-toggle')), card = box(document.querySelector('#shelf-reading-results > *'));
        return { sign: s, vw: document.documentElement.clientWidth, frame, over, glyphs: glyphs.length,
          inside: glyphs.every((g) => g.left >= 8 - 0.5 && g.right <= document.documentElement.clientWidth - 8 + 0.5 && g.top >= frame - 0.5),
          tools: hits(s, tools), card: hits(s, card), text: sign.textContent };
      });
      const edge = f.sign && f.sign.right <= f.vw - 8 + 0.5 && f.sign.left >= 8 - 0.5 && f.sign.top >= f.frame - 0.5;
      check(`10.room-sign · ${engine} ${world} ${width} ${room} · the room sign (${f.text}) stands whole, 8 px from the edge, under the bar and thread, clear of Tools and the cards`,
        edge && f.inside && f.glyphs > 0 && f.over === 0 && !f.tools && !f.card && !errors.length,
        { sign: f.sign && Object.fromEntries(Object.entries(f.sign).map(([k, v]) => [k, Math.round(v)])), vw: f.vw, frame: f.frame, over: f.over, tools: f.tools, card: f.card, errors });
    } finally { await context.close(); }
  }
}

async function itemFullWidth(browser, engine) {
  // 11 · L-4: in the startup story every run of full-width Latin letters or digits outside a ruby base is one span that
  // takes the face's proportional widths (narrower than its full-width setting) and never breaks; the text is as written
  const { context, page, errors } = await session(browser);
  try {
    await openStory(page);
    const f = await page.evaluate(() => {
      const reader = document.getElementById('reader');
      const loose = [];
      const walk = document.createTreeWalker(reader, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        const n = walk.currentNode;
        if (n.parentElement.closest('rt, rp, ruby, .fw-run, .tok-en, [aria-hidden="true"]')) continue;
        if (/[０-９Ａ-Ｚａ-ｚ]/u.test(n.data)) loose.push(n.data.slice(0, 20));
      }
      const runs = [...reader.querySelectorAll('.fw-run')].map((n) => {
        const cs = getComputedStyle(n), w = n.getBoundingClientRect().width;
        n.style.fontFeatureSettings = 'normal'; const full = n.getBoundingClientRect().width; n.style.fontFeatureSettings = '';
        return { text: n.textContent, palt: /palt/u.test(cs.fontFeatureSettings), nowrap: cs.whiteSpace === 'nowrap', lines: n.getClientRects().length, w, full, inRuby: !!n.closest('ruby') };
      });
      return { loose, runs, text: ['Ｍｕｊｉｎ', '２０２６'].every((t) => reader.textContent.includes(t)) };
    });
    const bad = f.runs.filter((r) => !r.palt || !r.nowrap || r.lines !== 1 || r.inRuby || !(r.w < r.full * 0.85));
    check(`11.fullwidth · ${engine} · Ｍｕｊｉｎ and ２０２６: each full-width run one span, proportional (palt), unbroken, its text as written`,
      f.runs.length >= 2 && f.runs.some((r) => r.text === 'Ｍｕｊｉｎ') && f.runs.some((r) => r.text === '２０２６') && !f.loose.length && !bad.length && f.text && !errors.length,
      { runs: f.runs.length, bad: bad.slice(0, 4).map((r) => ({ ...r, w: Math.round(r.w), full: Math.round(r.full) })), loose: f.loose.slice(0, 4), errors });
  } finally { await context.close(); }
}

async function itemStripLists(browser, engine) {
  // 12 · G5-1: 総理 on six of his lists, held (a right-click is a hold): under 360 px at most three lists stand in the strip's
  // first row, then "All lists · 6", and the strip never scrolls inside itself; All lists opens the rest; 390 keeps six
  const LISTS = ['仕事', '旅', 'ニュース', '政治', '経済', '読書'];
  for (const [width, height] of [[320, 568], [340, 700], [390, 844]]) {
    const { context, page, errors } = await session(browser, { width, height });
    try {
      await openStory(page);
      await page.evaluate((lists) => window.__H1A__.run(`(() => { const row = { t: 'word', id: '総理' }; S.lists = Object.fromEntries(${JSON.stringify(lists)}.map((n) => [n, [row]])); })()`), LISTS);
      const word = page.locator(WORD_SEL).first();
      await word.scrollIntoViewIfNeeded();
      await delay(200);
      await word.click({ button: 'right' });
      await page.locator('#seal-strip').waitFor({ timeout: 8000 });
      await settle(page, 600);
      const strip = () => page.evaluate(() => { const s = document.getElementById('seal-strip');
        return { chips: [...s.querySelectorAll('.seal-strip-lists > .seal-list')].filter((n) => n.getClientRects().length).map((n) => n.dataset.list),
          all: document.getElementById('seal-strip-all')?.textContent ?? null, scrollHeight: s.scrollHeight, clientHeight: s.clientHeight, more: s.dataset.more,
          everyList: [...s.querySelectorAll('.seal-list')].filter((n) => n.getClientRects().length).length }; });
      const folded = await strip();
      let opened = null;
      if (folded.all) { await page.locator('#seal-strip-all').click(); await delay(300); opened = await strip(); }
      const narrow = width < 360;
      const ok = narrow
        ? folded.chips.length >= 1 && folded.chips.length <= 3 && folded.all === 'All lists · 6' && folded.scrollHeight <= folded.clientHeight + 1 && folded.more !== 'true' && opened?.everyList === 6
        : folded.chips.length === 6 && !folded.all && folded.scrollHeight <= folded.clientHeight + 1;
      check(`12.strip-lists · ${engine} ${width}×${height} · ${narrow ? 'at most three of six lists, then "All lists · 6" opening the rest; no scroll inside the strip' : 'all six lists stand in the strip'}`,
        ok && !errors.length, { folded, opened, errors });
    } finally { await context.close(); }
  }
}

async function itemFetches(browser, engine) {
  // 14 · W-2: a load the page abandons as it goes (pagehide) is caught: 総理's page asks for its examples (the manifest
  // held), the page goes, and the load settles at once with no page error; back again (pageshow), loads work
  {
    const { context, page, errors } = await session(browser);
    let held = 0;
    await context.route(/\/data\/proprietary_safe\/examples\/manifest\.json$/u, async (route) => {
      held += 1;
      if (held === 1) await delay(8000);
      try { await route.continue(); } catch { /* the page abandoned it */ }
    });
    try {
      await openStory(page);
      await stage(page);
      await page.locator('#mini .mini-word').tap();
      await page.locator('#sheet').waitFor();
      await page.waitForFunction(() => window.__H1A__.run('D.examplePending?.size || 0') > 0, null, { timeout: 8000 });
      const before = errors.length;
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
      const settled = await page.waitForFunction(() => (window.__H1A__.run('D.examplePending?.size || 0')) === 0, null, { timeout: 1500 }).then(() => true, () => false);
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })));
      await page.evaluate(() => window.__H1A__.run(`(() => { D.exampleBank?.delete('総理'); S.stack = []; render(); go({ t: 'word', id: '大臣' }); })()`));
      const after = await page.waitForFunction(() => !!window.__H1A__.run('D.exampleManifest'), null, { timeout: 10_000 }).then(() => true, () => false);
      check(`14.abort-quiet · ${engine} · a load the page abandons as it goes settles at once, caught (no page error); back again, loads work`,
        held >= 1 && settled && after && errors.length === before && !errors.length, { held, settled, after, errors });
    } finally { await context.close(); }
  }
  // 14 · W-1: every dictionary detail shard fails once (a network failure), then answers: 総理's stage still lands on its
  // sense (the shard asked again), never on the fallback meaning
  {
    const { context, page, errors } = await session(browser);
    const asked = new Map();
    await context.route(/\/data\/share_alike\/dict-v2\/[0-9a-f]{2}\.json$/u, async (route) => {
      const key = new URL(route.request().url()).pathname, n = (asked.get(key) || 0) + 1;
      asked.set(key, n);
      if (n === 1) return route.abort('failed');
      return route.continue();
    });
    try {
      await openStory(page);
      await stage(page);
      await delay(800);
      const f = await page.evaluate(() => { const m = document.getElementById('mini');
        return { sense: m?.dataset.senseEntry ?? null, line: m?.querySelector('.mini-gloss')?.textContent ?? null, busy: m?.getAttribute('aria-busy') ?? null }; });
      check(`14.retry-shard · ${engine} · a detail shard that fails once is asked again: 総理's stage lands on its sense, not the fallback`,
        !!f.sense && f.busy !== 'true' && !!f.line && f.line !== '…' && [...asked.values()].some((n) => n >= 2) && !errors.length,
        { ...f, asked: Object.fromEntries(asked), errors });
    } finally { await context.close(); }
  }
}

async function itemSegment(browser, engine) {
  // 15 · R3-3: in チベット旅行記, さもなければかの国に is さもなければ + かの: no ばか ("idiot") in the sentence, and the
  // slip on かの reads かの and means "that"
  const { context, page, errors } = await session(browser);
  try {
    assert(await page.evaluate(() => window.__H1A__.open('aozora:049966-2')), 'the article opens');
    await page.locator('#reader .tok[data-index="582"]').first().waitFor({ timeout: 20_000 });
    await settle(page, 600);
    const toks = await page.evaluate(() => [579, 580, 581, 582, 583].map((i) => { const n = document.querySelector(`#reader .tok[data-index="${i}"]`);
      const c = n?.cloneNode(true); c?.querySelectorAll('rt,rp,.tok-en').forEach((x) => x.remove()); return c ? c.textContent : null; }));
    const kano = page.locator('#reader .tok[data-index="582"]').first();
    let slip = null;
    if (toks[3] === 'かの') {
      await stage(page, '#reader .tok[data-index="582"]');
      slip = await page.evaluate(() => { const m = document.getElementById('mini'); return m ? { word: m.querySelector('.mini-word')?.childNodes[0]?.textContent ?? null,
        gloss: m.querySelector('.mini-gloss')?.textContent ?? '' } : null; });
    }
    void kano;
    // (かの has no meaning in the bundled dictionaries: its slip says so plainly; it must never be ばか's "idiot")
    check(`15.samonakereba · ${engine} · さもなければかの: ば + かの, no ばか; the slip on かの is かの, never "idiot"`,
      JSON.stringify(toks) === JSON.stringify(['さも', 'なけれ', 'ば', 'かの', '国']) && slip?.word === 'かの' && !/idiot|fool/iu.test(slip.gloss) && !errors.length,
      { toks, slip, errors });
  } finally { await context.close(); }
}

async function itemNoteHint(browser, engine) {
  // 16 · H0-1: Today's note field shows its whole hint (measured in its own placeholder font against the field's content
  // box), at 390 and 320, in English and 日本語; its "keep it" stays whole and clear of it
  for (const [width, ui] of [[390, 'bi'], [320, 'bi'], [390, 'ja'], [320, 'ja']]) {
    const { context, page, errors } = await session(browser, { width, ui, query: 'entry=shelf&room=tray' });
    try {
      await page.waitForSelector('#note-input', { timeout: 15_000 });
      await settle(page, 400);
      const f = await page.evaluate(() => {
        const input = document.getElementById('note-input'), cs = getComputedStyle(input), ph = getComputedStyle(input, '::placeholder');
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${ph.fontStyle} ${ph.fontWeight} ${ph.fontSize} ${ph.fontFamily}`;
        const need = ctx.measureText(input.placeholder).width, room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const a = input.getBoundingClientRect(), b = document.getElementById('note-send')?.getBoundingClientRect();
        const overlap = !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return { hint: input.placeholder, need: Math.round(need), room: Math.round(room), overlap, send: !!b && b.width > 0 && b.right <= document.documentElement.clientWidth };
      });
      check(`16.note-hint · ${engine} ${width} ${ui} · Today's note field shows its whole hint ("${f.hint}"), its keep clear of it`,
        f.need <= f.room && !f.overlap && f.send && !errors.length, { ...f, errors });
    } finally { await context.close(); }
  }
}

async function itemStageInk(browser, engine) {
  // 1 · its writing: seating the stage (and seating it again as its content settles) never scrolls the reading, so the
  // word still writes itself (筆 at a first meeting) to the end; a scroll by his hand ends the writing at once (found by the
  // round-1 capture's screen 06: a seat that moved the reading ended every writing before its first stroke)
  const walk = async (scrollMidway) => {
    const { context, page, errors } = await session(browser, { world: 'hokusai' });
    try {
      await openStory(page);
      const tok = page.locator(WORD_SEL).first();
      await tok.scrollIntoViewIfNeeded(); await delay(250);
      await page.evaluate(() => {
        window.__ink = [];
        new MutationObserver((list) => { for (const m of list) { const v = m.target.getAttribute(m.attributeName);
          if (v && m.target.closest('#mini')) window.__ink.push(`${m.attributeName === 'data-ink' ? 'ink' : 'ended'}:${v}`); } })
          .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-ink', 'data-ink-ended'] });
      });
      await tok.tap();
      const rung = await page.waitForFunction((el) => (document.getElementById('mini') ? 'stage' : el.dataset.ladderRung === 'reading' ? 'reading' : null),
        await tok.elementHandle(), { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
      const y0 = await page.evaluate(() => window.scrollY);
      if (rung === 'reading') await tok.tap();
      await page.locator('#mini .mini-word').waitFor({ timeout: 10_000 });
      if (scrollMidway) {
        const writing = await page.waitForFunction(() => window.__ink.includes('ink:writing'), null, { timeout: 4000 }).then(() => true, () => false);
        if (writing) { await delay(150); await page.evaluate(() => window.scrollBy({ top: 30, behavior: 'instant' })); }
      }
      await page.waitForFunction(() => window.__ink.some((v) => v.startsWith('ended:')), null, { timeout: 8000 }).catch(() => {});
      const f = await page.evaluate(() => ({ log: window.__ink.slice(), y: Math.round(window.scrollY), ceremony: document.getElementById('mini')?.dataset.ceremony || null }));
      return { ...f, moved: Math.round(f.y - y0), errors };
    } finally { await context.close(); }
  };
  const a = await walk(false);
  check(`1.ink-seat · ${engine} · the stage seated beside its word (the print still: ${a.moved} px), its word writes itself to the end`,
    a.ceremony === 'write' && a.moved === 0 && a.log.includes('ink:writing') && a.log.includes('ended:written') && !a.log.includes('ended:input') && !a.errors.length, a);
  const b = await walk(true);
  check(`1.ink-hand · ${engine} · a scroll by his hand ends the writing at once`,
    b.ceremony === 'write' && b.log.includes('ink:writing') && b.log.includes('ended:input') && !b.log.includes('ended:written') && !b.errors.length, b);
}

// 19 · every #mini[data-demo] the document shows, each with its arrival sampled at every frame (as sol's VH-1 sweep observes
// it: a MutationObserver over the document, the named CSSAnimation read-mini-rise). A copy set and removed inside one task
// (placeFloating's inert measuring copy) is never at a frame, so never a displayed mount
const DEMO_OBSERVER = () => {
  const seen = new WeakSet();
  window.__demoMounts = [];
  const observe = () => {
    const mini = document.querySelector('#mini[data-demo="true"]');
    if (!mini || seen.has(mini)) return;
    seen.add(mini);
    const row = { at: performance.now(), frames: 0, samples: [], finished: false, superseded: false };
    window.__demoMounts.push({ mini, row });
    const sample = () => {
      if (!mini.isConnected) { row.superseded = !row.finished; return; }
      row.frames += 1;
      const rise = mini.getAnimations().find((a) => a.animationName === 'read-mini-rise');
      const s = { t: Math.round(performance.now() - row.at), state: rise ? rise.playState : 'none', current: rise ? Math.round(rise.currentTime ?? -1) : null,
        opacity: Number(getComputedStyle(mini).opacity), gloss: (mini.querySelector('.mini-gloss')?.textContent || '').trim().slice(0, 24), busy: mini.getAttribute('aria-busy') };
      if (rise) { row.named = true; row.duration = Number(rise.effect.getComputedTiming().duration); }
      row.samples.push(s);
      if (!rise && row.named && s.opacity === 1) { row.finished = true; row.endedAt = s.t; }
      if (rise?.playState === 'finished' && s.opacity === 1) { row.finished = true; row.endedAt = s.t; }
      if (row.samples.length < 400) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  };
  new MutationObserver(observe).observe(document, { childList: true, subtree: true });
};
const ALL_WORLDS = ['sumi', 'shu', 'iwa', 'hokusai', 'akafuji', 'keyblock', 'rokusho', 'yoru', 'kaku', 'nami', 'hakuu'];
async function itemDemoArrival(browser, engine) {
  // 19 · on a fresh device the first-use word demo's slip is mounted once: its arrival (read-mini-rise) runs once to its end
  // at full opacity, and what it says is brought up to its answer in place. In all eleven worlds as shipped (sol's VH-1
  // re-judgement: at base every world, both engines, mounted it twice, the first still rising), and in two with the
  // arrival stretched to 1.6 s so its answer lands while it rises (the change mid-arrival is required there). Reached as
  // he reaches it: the shelf's own door to the story
  for (const [world, stretched] of [...ALL_WORLDS.map((w) => [w, false]), ['hokusai', true], ['yoru', true]]) {
    const { context, page, errors } = await session(browser, { world, fresh: true, init: DEMO_OBSERVER,
      css: stretched ? '#mini { animation-duration: 1600ms !important; }' : null });
    try {
      const door = page.locator(`[data-passage="${STORY}"]:not([data-recommendation]) .shelf-open`).first();
      if (await door.count()) { await door.scrollIntoViewIfNeeded(); await door.click(); }
      else await page.evaluate((id) => window.__H1A__.open(id), STORY);
      await page.locator('#mini[data-demo="true"] .mini-word').waitFor({ timeout: 15_000 });
      await page.waitForFunction(() => { const m = document.querySelector('#mini[data-demo="true"]');
        return !!m && m.getAttribute('aria-busy') !== 'true' && !m.querySelector('[data-sense-wait], .mini-wait') && window.__demoMounts.every(({ row }) => row.finished || row.superseded); },
      null, { timeout: 15_000 }).catch(() => {});
      await delay(400);
      const f = await page.evaluate(() => {
        const current = document.querySelector('#mini[data-demo="true"]');
        const mounts = window.__demoMounts.map(({ mini, row }) => ({ current: mini === current, frames: row.frames, named: !!row.named, duration: row.duration,
          finished: row.finished, superseded: row.superseded, endedAt: row.endedAt ?? null,
          first: row.samples[0] || null, last: row.samples[row.samples.length - 1] || null,
          // what it said while it rose, and once risen
          rising: [...new Set(row.samples.filter((s) => s.state === 'running').map((s) => s.gloss))], settled: (current?.querySelector('.mini-gloss')?.textContent || '').trim() }));
        return { mounts, seen: localStorage.getItem('kairo-word-ladder-demo-v1'), word: current?.querySelector('.mini-word')?.textContent.trim() || null,
          theme: document.documentElement.dataset.theme || 'hokusai' };
      });
      const shown = f.mounts.filter((m) => m.frames > 0);
      const one = shown.length === 1 && shown[0].current;
      const arrival = one && shown[0].named && shown[0].finished && !shown[0].superseded && shown[0].last?.opacity === 1;
      const answered = one && !!shown[0].settled && shown[0].settled !== '…';
      const midway = !stretched || (one && shown[0].rising.length > 1);
      check(`19.demo-arrival · ${engine} ${world}${stretched ? ' (arrival stretched to 1.6 s)' : ''} · the first-use demo's slip mounts once, its read-mini-rise runs once to its end at full opacity, its answer comes in place${stretched ? ' while it rises' : ''}`,
        f.seen === '1' && f.theme === world && one && arrival && answered && midway && !errors.length, { ...f, shown: shown.length, errors });
    } finally { await context.close(); }
  }
}

const ITEMS = [
  { id: 'stage', prefix: '1.', run: itemStage },
  { id: 'stage-ink', prefix: '1.ink', run: itemStageInk },
  { id: 'layers', prefix: '2.', run: itemLayers },
  { id: 'thread', prefix: '3.', run: itemThread },
  { id: 'one-save', prefix: '4.', run: itemOneSave },
  { id: 'speak-bar', prefix: '5.', run: itemSpeakBar },
  { id: 'entry', prefix: '6.', run: itemEntry },
  { id: 'part', prefix: '7.', run: itemPart },
  { id: 'kanji-bead', prefix: '8.', run: itemKanjiBead },
  { id: 'open-title', prefix: '9.', run: itemOpenTitle },
  { id: 'shelf-sign', prefix: '10.', run: itemShelfSign },
  { id: 'fullwidth', prefix: '11.', run: itemFullWidth },
  { id: 'strip-lists', prefix: '12.', run: itemStripLists },
  { id: 'fetches', prefix: '14.', run: itemFetches },
  { id: 'segment', prefix: '15.', run: itemSegment },
  { id: 'note-hint', prefix: '16.', run: itemNoteHint },
  { id: 'demo-arrival', prefix: '19.', run: itemDemoArrival },
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
    await runAll(PART.length ? PART : null);
    if (CONTROLS && !PART.length) {
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
    console.log(failed.length ? `HFIX-1A FAIL — ${failed.length} of ${rows.filter((r) => !r.control).length}` : `HFIX-1A PASS — ${rows.filter((r) => !r.control).length} rows${PART.length ? ` — PARTIAL RUN (${PART.join(', ')}): never an acceptance` : ''}`);
    if (failed.length || !rows.length) process.exitCode = 1;
    else if (PART.length) process.exitCode = 3;
  }
} finally {
  writeFileSync(join(out, `hfix-1a${ONLY ? `-negative-${ONLY}` : CONTROLS ? '-controls' : ''}.json`), `${JSON.stringify({ engines: log.engines, negative: ONLY || null, controls: CONTROLS, rows }, null, 2)}\n`);
  await host.close();
}
