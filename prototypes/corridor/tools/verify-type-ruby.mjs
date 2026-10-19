/** F · one type ladder, one ruby, and the floors his "furigana and english is too small, BARELY readable" (09-29) set
 * (MASTER_SPEC D5: a reading 10 CSS px or more, a gloss 13 or more, holding at 200 % text size). Read from the artifact.
 *
 *   L1 one ladder (sheets)   — every stylesheet the artifact serves: one block defines the ladder (13 --type-* steps,
 *                              4 --leading-*, a phone's reading 21 and display 29) and no other declares a --type-* step
 *                              or an old ladder (--t-*, --reference-*, --seal-font); every font-size and every size in a
 *                              font: shorthand is a step, a figure (a multiple of the headword step, alone or in a
 *                              clamp/min with vw/dvh), inherit, or one of the declared exceptions, listed exactly below.
 *   L2 one ruby (sheets)     — exactly one rule sizes a reading (rt, .5em); no rule draws a reading as a pseudo-element
 *                              (content: attr(data-r…)); the other rules that touch rt are the listed few (the deck's
 *                              concealment and reveal, WebKit's placement, two decks' own face and colour).
 *   L3 one ladder (rendered) — on a phone (390×844) through the shelf, the reader (readings always), a word's page, the
 *                              deck's back, Today, Words, Learn and Me: every text box's computed size is a step, a figure,
 *                              or a reading at half its word; the drift sky, SVG drawing text and sizes a script sets
 *                              inline are counted apart and listed, never folded into the pass.
 *   R1 readings, on touch    — 320 / 390 / 430 and 1368: a tapped word's reading is half the reader's size and 10 px or
 *                              more and centres over its word (within 1 px). Wider than its word, it overhangs the
 *                              neighbouring glyphs by half its excess on each side (ruby may overhang adjacent kana): it may
 *                              stand over their columns, but it never comes within 2 px of another reading and never runs
 *                              off its line's edge (at an edge it slides inward, flush with it). It moves no line (< 1 px).
 *                              (The lead's ruling, 2026-10-19.)
 *   R4 breaks, on touch      — the same widths: the line breaks of the reader's first 120 words are the same before and
 *                              after a touch reveal.
 *   W1 a fresh 320 reader    — on touch, a word near a line's end with a reading wider than itself: its reading stays
 *                              on the line, and the document, body and reader stay exactly 320 px wide revealed and folded
 *                              (G6's hidden-only width rule is gone with the pseudo readings it guarded).
 *   R2 readings, always      — the same widths with every reading shown: each 10 px or more at half its word; two
 *                              neighbouring readings never touch (2 px of paper or more between their texts); none
 *                              crosses a line; none meets the glyphs of its own line or of the line above (F's rule: an
 *                              always-shown reading wider than its word widens it, never overhangs); each sits over its word.
 *   R3 the deck's readings   — the deck's back (readings on), 390: the same as R2 over the card's sentence.
 *   G1 glosses               — the slip's meaning, a word's page meanings, the deck's English: 13 px or more.
 *   Z1 200 % text            — the reader at 200 % (the phone's 390 CSS px at twice the size: 195 CSS px wide), on touch
 *                              and always: R1's and R2's readings hold (floor, half, never touching another reading, never
 *                              crossing a line or running off it, on touch overhanging only its own line's neighbours,
 *                              always never meeting a glyph), the slip's meaning 13 px or more; a word wider than the line
 *                              is recorded with its place, not judged (see the note at the check).
 * Usage: KAIRO_SITE_DIR=<artifact> KAIRO_ARTIFACT_SHA256=<digest> node verify-type-ruby.mjs
 *        KAIRO_BROWSER=chromium|webkit limits the engines (unset or all: both).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Choose an existing artifact and its exact digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
mkdirSync(evidence, { recursive: true });
const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['webkit', 'chromium'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const results = [];
const record = (engine, name, passed, observations, error) => {
  results.push({ engine, name, passed, observations, ...(error ? { error } : {}) });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${engine}/${name} ${passed ? JSON.stringify(observations).slice(0, 500) : error}`);
};

/* ---------------------------------------------------------------- the sheets */
const LADDER = { caption: 12, label: 13, chrome: 14, control: 15, body: 16, lead: 18, seal: 22, reading: 23, section: 24, title: 29, display: 34, hero: 38, headword: 42 };
const PHONE_STEPS = { reading: 21, display: 29 };
const LEADING = { tight: 1.25, ui: 1.35, body: 1.55, reading: 1.9 };
/** Every literal size the artifact still sets, by file, selector and value: the ladder's own block and the declared
 * exceptions. A new literal anywhere, or one of these changed, is red. */
const EXCEPTIONS = [
  ['rooms/motion.css', 'rt', 'font-size', '0.5em'], // the one ruby: half its word
  ['corridor.css', 'svg.strokes text', 'font-size', '8px'], // drawn: the stroke grid's user units (109-unit box)
  ['corridor.css', '.stroke-num', 'font-size', '6px'], // drawn: the stroke grid's user units
];
/** the drift sky is generated from its frozen donor (tools/build-drift-layer.mjs): its sizes are listed whole, by digest,
 * until the generator carries the ladder; any change to them is red here */
const DRIFT_CSS_SHA256 = process.env.F_DRIFT_CSS_SHA256 || null;
const cssFiles = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (['node_modules', 'vendor'].includes(name)) continue;
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.css')) cssFiles.push(path);
  }
};
walk(site);
/** declarations with their selector chain, comments stripped (a url() or a string may hold ; or {) */
function declarations(text) {
  const out = [];
  let i = 0, start = 0;
  const stack = [];
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); text = text.slice(0, i) + ' '.repeat(end + 2 - i) + text.slice(end + 2); continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < text.length && text[j] !== c) { if (text[j] === '\\') j++; j++; } i = j + 1; continue; }
    if (c === '(') { let depth = 1, j = i + 1; while (j < text.length && depth) { if (text[j] === '(') depth++; else if (text[j] === ')') depth--; j++; } i = j; continue; }
    if (c === '{') { stack.push(text.slice(start, i).trim().replace(/\s+/g, ' ')); i++; start = i; continue; }
    if (c === ';' || c === '}') {
      const raw = text.slice(start, i).trim();
      const m = raw.match(/^(--[\w-]+|[a-zA-Z-]+)\s*:\s*([\s\S]*)$/);
      if (m) out.push({ prop: m[1].toLowerCase(), value: m[2].trim().replace(/\s+/g, ' '), selector: stack.at(-1) || '', chain: [...stack] });
      if (c === '}') stack.pop();
      i++; start = i; continue;
    }
    i++;
  }
  return out;
}
const SIZE_TOKEN = /^var\(--type-(caption|label|chrome|control|body|lead|seal|reading|section|title|display|hero|headword)\)$/;
const FIGURE = /^calc\(var\(--type-headword\) \* [0-9.]+\)$/;
function sizeOf(decl) {
  const value = decl.value.replace(/\s*!important$/, '');
  if (decl.prop === 'font-size') return value;
  // the size in a font: shorthand — after style, variant, weight and stretch keywords
  const re = /(?:[a-z-]+\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)|"[^"]*"|'[^']*'|[^\s/,]+|\/|,)/gi;
  let m;
  while ((m = re.exec(value))) {
    const t = m[0];
    if (/^(normal|italic|oblique|small-caps|bold|bolder|lighter|condensed|expanded|semi-condensed|ultra-condensed)$/i.test(t)) continue;
    if (/^[1-9][0-9]{2}$/.test(t) || /^var\(--weight-/.test(t)) continue;
    if (/^(-?[0-9]*\.?[0-9]+)(px|rem|em|%)$/.test(t) || /^(var|calc|clamp|min|max)\(/i.test(t)) return t;
    return null; // inherit, a system font, a var() holding the whole font
  }
  return null;
}
/** a size the ladder governs: a step, a figure, or a clamp/min/max of steps, figures and viewport lengths */
function governed(size) {
  // a step, a figure, inherit, or 0 (no text drawn: a control that shows only its mark)
  if (SIZE_TOKEN.test(size) || FIGURE.test(size) || size === 'inherit' || size === '0') return true;
  const fn = size.match(/^(clamp|min|max)\((.*)\)$/);
  if (!fn) return false;
  const args = [];
  let depth = 0, cur = '';
  for (const ch of fn[2]) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { args.push(cur.trim()); cur = ''; } else cur += ch; }
  args.push(cur.trim());
  return args.every((arg) => SIZE_TOKEN.test(arg) || FIGURE.test(arg) || /^[0-9.]+(vw|vh|dvh|svh|cqw|cqi)$/.test(arg) || /^calc\([0-9.]+(vw|vh|dvh) \/ var\(--n, 2\)\)$/.test(arg));
}
{
  const bad = [], seenExceptions = new Set(), ladderBlocks = [], strayLadder = [], oldLadders = [], rubyRules = [], pseudoReadings = [], rtRules = [];
  let driftSha = null;
  for (const file of cssFiles) {
    const rel = relative(site, file).split('\\').join('/');
    const text = readFileSync(file, 'utf8');
    if (rel === 'drift-layer.css') { driftSha = createHash('sha256').update(text).digest('hex'); continue; }
    const decls = declarations(text);
    for (const d of decls) {
      if (/^--type-/.test(d.prop)) {
        if (rel === 'rooms/motion.css' && /^:root$/.test(d.selector)) ladderBlocks.push({ media: d.chain.length > 1 ? d.chain[0] : '', prop: d.prop, value: d.value });
        else strayLadder.push(`${rel} ${d.selector} ${d.prop}: ${d.value}`);
      }
      if (/^--(t-(body|label|chrome|read|section|display|hero)|reference-(small|body|title|headword)|seal-font)$/.test(d.prop)) oldLadders.push(`${rel} ${d.selector} ${d.prop}`);
      if (/^--leading-/.test(d.prop) && !(rel === 'rooms/motion.css' && d.selector === ':root')) strayLadder.push(`${rel} ${d.selector} ${d.prop}`);
      if (d.prop === 'content' && /attr\(data-r/.test(d.value)) pseudoReadings.push(`${rel} ${d.selector}`);
      const touchesRt = /(^|[\s,>+~(])rt\b(?![-\w])/.test(d.selector);
      if (touchesRt) rtRules.push(`${rel}|${d.selector}|${d.prop}`);
      if ((d.prop === 'font-size' || d.prop === 'font') && touchesRt) rubyRules.push(`${rel}|${d.selector}|${d.value}`);
      if (d.prop !== 'font-size' && d.prop !== 'font') continue;
      const size = sizeOf(d);
      if (!size || governed(size)) continue;
      const key = EXCEPTIONS.findIndex(([f, sel, prop, value]) => f === rel && sel === d.selector && prop === d.prop && value === size);
      if (key >= 0) { seenExceptions.add(key); continue; }
      bad.push(`${rel} :: ${d.selector} :: ${d.prop}: ${d.value}`);
    }
  }
  const ladder = Object.fromEntries(ladderBlocks.filter((b) => !b.media).map((b) => [b.prop.slice(7), b.value]));
  const phone = Object.fromEntries(ladderBlocks.filter((b) => /max-width:\s*520px/.test(b.media)).map((b) => [b.prop.slice(7), b.value]));
  try {
    assert.deepEqual(bad, [], `literal sizes outside the ladder:\n${bad.join('\n')}`);
    assert.equal(seenExceptions.size, EXCEPTIONS.length, `a declared exception is gone or changed: ${EXCEPTIONS.filter((_, i) => !seenExceptions.has(i)).map((e) => e.join(' ')).join('; ')}`);
    assert.deepEqual(ladder, Object.fromEntries(Object.entries(LADDER).map(([k, v]) => [k, `${v}px`])), `the ladder's one block: ${JSON.stringify(ladder)}`);
    assert.deepEqual(phone, Object.fromEntries(Object.entries(PHONE_STEPS).map(([k, v]) => [k, `${v}px`])), `a phone's steps: ${JSON.stringify(phone)}`);
    assert.deepEqual(strayLadder, [], `a ladder step declared outside the one block: ${strayLadder.join('; ')}`);
    assert.deepEqual(oldLadders, [], `an old ladder survives: ${oldLadders.join('; ')}`);
    if (DRIFT_CSS_SHA256) assert.equal(driftSha, DRIFT_CSS_SHA256, 'the drift sky\'s sheet changed');
    record('sheets', 'L1-one-ladder', true, { files: cssFiles.length, exceptions: EXCEPTIONS.length, ladder, phone, driftSha });
  } catch (error) { record('sheets', 'L1-one-ladder', false, null, error.message); }
  const RT_ALLOWED = new Set([
    'rooms/motion.css|rt|padding-inline', 'rooms/motion.css|rt|font-size', 'rooms/motion.css|rt|line-height', 'rooms/motion.css|rt|font-weight', 'rooms/motion.css|rt|letter-spacing', 'rooms/motion.css|rt|color',
    'rooms/motion.css|rt.hidden-rt|display', 'rooms/motion.css|rt|margin-block-end',
    "decks/player/player.css|.kp[data-readings='off'] .kp-sentence ruby:not(:is(.kp-target, .kp-tok.kp-lit) ruby) > rt|visibility",
    'decks/player/player.css|.kp-sentence.kp-enter rt|animation',
    'decks/context-dense/context-deck.css|ruby.cd-ruby rt|font-family', 'decks/context-dense/context-deck.css|ruby.cd-ruby rt|letter-spacing', 'decks/context-dense/context-deck.css|ruby.cd-ruby rt|color', 'decks/context-dense/context-deck.css|ruby.cd-ruby rt|line-height', 'decks/context-dense/context-deck.css|ruby.cd-ruby rt|user-select',
    'decks/context-dense/context-deck.css|.cd-miss .cd-ink, .cd-miss rt|color',
    'decks/personal/personal.css|.pc rt|font-family', 'decks/personal/personal.css|.pc rt|letter-spacing', 'decks/personal/personal.css|.pc rt|font-weight', 'decks/personal/personal.css|.pc rt|color',
    'decks/personal/personal.css|.pc-japanese rt|font-family', 'decks/personal/personal.css|.pc-japanese rt|letter-spacing', 'decks/personal/personal.css|.pc-japanese rt|color',
  ]);
  try {
    assert.deepEqual(rubyRules, ['rooms/motion.css|rt|0.5em'], `one rule sizes a reading: ${rubyRules.join('; ')}`);
    assert.deepEqual(pseudoReadings, [], `a reading drawn as a pseudo-element: ${pseudoReadings.join('; ')}`);
    const extra = rtRules.filter((r) => !RT_ALLOWED.has(r) && !/prefers-reduced-motion/.test(r) && !/kp-sentence\.kp-enter :is\(\.kp-target, rt\)/.test(r));
    assert.deepEqual(extra, [], `rules that touch a reading beyond the one rule and the listed few: ${extra.join('; ')}`);
    record('sheets', 'L2-one-ruby', true, { rubyRules, rtRules: rtRules.length });
  } catch (error) { record('sheets', 'L2-one-ruby', false, null, error.message); }
}

/* ---------------------------------------------------------------- the browser */
const host = await startStaticHost({ site, port: 0 });
const ARTICLE_TITLE = 'スタートアップ'; // 「日本スタートアップ大賞２０２６表彰式」: wide readings (表彰 ひょうしょう, 大賞 たいしょう)
const BRIDGE = `window.__F__ = {
  reader: async (n) => { S.stack = []; const p = D.passages.find((x) => !x.retired && String(x.title||'').includes(n)); await ensureArticle(p); openPassage(p.id); window.scrollTo(0, 0); return p.id; },
  dials: (k, f, s) => { S.dials = { kanji: k, furigana: f, spacing: s }; render(); },
  visit: (v) => { removeMini(); S.stack = []; S.strokes = null; S.view = v; render(); window.scrollTo(0, 0); },
};`;
/** G3 · a word in the reader is found by its prose name (an idle word carries no aria-label: its paragraph is the one
 * Tab stop), and a tap climbs its ladder. Ladder (John, 10-19): the first raises its reading in place, the next sets its
 * English under it, the next draws its card — each click only once the rung before it is seen, never a blind extra. */
const readerTok = (page, label) => page.locator(`#reader .tok[data-prose-label="${label}"]`).first();
async function climbToCard(page, tok) {
  const node = await tok.elementHandle();
  let last = null;
  for (let step = 0; step < 3 && !(await page.locator('#mini').count()); step++) {
    await tok.click();
    last = await page.waitForFunction(({ node, last }) => document.getElementById('mini') ? 'stage'
      : ['reading', 'gloss'].includes(node.dataset.ladderRung) && node.dataset.ladderRung !== last ? node.dataset.ladderRung : null,
      { node, last }, { timeout: 10000 }).then((handle) => handle.jsonValue());
  }
  await page.locator('#mini').waitFor();
}
/** the deck's back with its readings on, as a learner reaches it: the deck, Begin, 答えを見る, 読み on */
async function openDeckBack(page) {
  await page.goto(`${host.origin}/?deck=kotoba&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#app .kp').waitFor();
  await page.waitForTimeout(700);
  if (await page.locator('#app .kp-study #kp-quit').count()) { await page.locator('#kp-quit').click(); await page.waitForTimeout(500); }
  const begin = page.locator('#app .kp-home button.kp-primary, #app .kp-home .kp-begin, #app button[data-kp="begin"]').first();
  if (await begin.count()) await begin.click(); else await page.getByRole('button', { name: /Begin|始める|はじめる|Study|学習/u }).first().click();
  await page.locator('#kp-reveal').waitFor();
  await page.waitForTimeout(400);
  await page.locator('#kp-reveal').click();
  await page.waitForTimeout(800);
  if ((await page.locator('#app .kp').getAttribute('data-readings')) !== 'on') { await page.locator('#kp-readings').click(); await page.waitForTimeout(400); }
}
async function session(browser, viewport, { scale = 2, zoomed = false } = {}) {
  // 200 % text is a page laid out at half the width and drawn at twice the scale; a phone emulation would zoom such a page
  // out to fit its widest box (Chromium reported innerWidth 376 for a 195 px page), so the zoomed page is laid out as is
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, isMobile: !zoomed && viewport.width < 600, hasTouch: viewport.width < 600, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await silenceBrowserAudio(ctx);
  // the reader's first-visit tip, and (G3) its first-use demonstration of a word's stage, are a fresh device's alone
  await ctx.addInitScript(() => { try { localStorage.setItem('kairo-tip-reader-v1', '1'); localStorage.setItem('kairo-word-ladder-demo-v1', '1'); } catch { /* storage refused */ } });
  await ctx.route('**/corridor.js', async (route) => { const r = await route.fetch(); await route.fulfill({ response: r, body: (await r.text()) + BRIDGE }); });
  await ctx.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.fallback() : route.abort()));
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  await page.goto(`${host.origin}/?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && window.__F__);
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page, errors };
}
const openReader = async (page) => { await page.evaluate((t) => window.__F__.reader(t), ARTICLE_TITLE); await page.waitForFunction(() => document.querySelector('#reader .tok')); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400); };

/** every visible reading under a root: size, its word's size, text box, ruby boxes, its word's glyph boxes */
const READINGS = (rootSel) => {
  const root = document.querySelector(rootSel);
  if (!root) return { missing: rootSel };
  const textBox = (node) => { const r = document.createRange(); r.selectNodeContents(node); return [...r.getClientRects()].filter((b) => b.width > 0 && b.height > 0); };
  const rows = [];
  for (const rt of root.querySelectorAll('rt')) {
    const cs = getComputedStyle(rt);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const ruby = rt.parentElement;
    const base = [...ruby.childNodes].filter((n) => n !== rt && (n.nodeType === 3 || n.tagName !== 'RT'));
    const baseBoxes = base.flatMap((n) => (n.nodeType === 3 ? textBox(n) : [...n.getClientRects()]));
    const rtBoxes = textBox(rt);
    if (!rtBoxes.length || !baseBoxes.length) continue;
    // its line's block: past every inline box, and past a block that is the inside of an inline box (the reader's word
    // is an inline-flex door around a block row)
    const inlineLevel = (node) => !!node && /^inline|^ruby|^contents$/.test(getComputedStyle(node).display);
    let block = ruby.parentElement;
    while (block && block !== document.body && (inlineLevel(block) || inlineLevel(block.parentElement))) block = block.parentElement;
    const bb = block.getBoundingClientRect(), bs = getComputedStyle(block);
    const line = { l: bb.left + parseFloat(bs.borderLeftWidth) + parseFloat(bs.paddingLeft), r: bb.right - parseFloat(bs.borderRightWidth) - parseFloat(bs.paddingRight) };
    rows.push({ text: rt.textContent, size: parseFloat(cs.fontSize), word: parseFloat(getComputedStyle(ruby).fontSize), rtFs: parseFloat(cs.fontSize), line,
      rt: { l: rtBoxes[0].left, r: rtBoxes.at(-1).right, t: Math.min(...rtBoxes.map((b) => b.top)), b: Math.max(...rtBoxes.map((b) => b.bottom)) },
      base: { l: Math.min(...baseBoxes.map((b) => b.left)), r: Math.max(...baseBoxes.map((b) => b.right)), t: Math.min(...baseBoxes.map((b) => b.top)), b: Math.max(...baseBoxes.map((b) => b.bottom)) },
      rubyRects: ruby.getClientRects().length });
  }
  // every glyph box of base text in the root (rt and glosses excluded), for collisions with readings
  const glyphs = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('rt, .tok-en, .kp-gloss, .kp-en') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  while (walker.nextNode()) {
    const fs = parseFloat(getComputedStyle(walker.currentNode.parentElement).fontSize);
    for (const b of textBox(walker.currentNode)) glyphs.push({ l: b.left, r: b.right, t: b.top, b: b.bottom, fs });
  }
  return { rows, glyphs, scrollWidth: document.scrollingElement.scrollWidth, innerWidth };
};
/** R4 · the reader's line breaks: the index of each word that starts a line (by its first glyph's top, its text and
 * never its reading), over the first `count` words */
const LINE_BREAKS = (count) => {
  const starts = [];
  let last = null, words = 0;
  for (const t of [...document.querySelectorAll('#reader .tok')].slice(0, count)) {
    const w = t.querySelector('.tok-word') || t;
    const n = w.querySelector('ruby')?.firstChild || [...w.childNodes].find((c) => c.nodeType === 3);
    if (!n) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const b = [...r.getClientRects()].find((x) => x.width > 0);
    if (!b) continue;
    words++;
    const top = Math.round(b.top + scrollY);
    if (last == null || Math.abs(top - last) > 4) { starts.push(t.dataset.index ?? String(words)); last = top; }
  }
  return { starts, words };
};
/** R2's geometry: floors, ratio, neighbours, lines, collisions, centring */
function judgeReadings(found, { gap = 2, floor = 10, touch = false } = {}) {
  const issues = [];
  const { rows, glyphs } = found;
  for (const r of rows) {
    if (r.size < floor) issues.push(`${r.text} ${r.size}px under ${floor}`);
    if (Math.abs(r.size - r.word / 2) > 0.06) issues.push(`${r.text} ${r.size}px is not half its word (${r.word}px)`);
    if (r.rubyRects !== 1) issues.push(`${r.text} crosses a line (${r.rubyRects} boxes)`);
    // no reading runs off its line's edge (an always-shown one never overhangs; one shown on touch slides inward there)
    if (r.line && (r.rt.l < r.line.l - 0.5 || r.rt.r > r.line.r + 0.5)) issues.push(`${r.text} runs off its line's edge (${r.rt.l.toFixed(1)}–${r.rt.r.toFixed(1)} on ${r.line.l.toFixed(1)}–${r.line.r.toFixed(1)})`);
    const centre = (r.rt.l + r.rt.r) / 2 - (r.base.l + r.base.r) / 2;
    const flush = touch && r.line && (Math.abs(r.rt.l - r.line.l) <= 1 || Math.abs(r.rt.r - r.line.r) <= 1);
    if (Math.abs(centre) > 1 && !flush) issues.push(`${r.text} sits ${centre.toFixed(1)} px off its word`);
    // no glyph of the line above, or (shown always) of its own line beside its word, meets the reading. On touch it may
    // stand over its own line's neighbours: it overhangs them, never another reading (below). Ink, not boxes: a Japanese
    // face's text box runs from its ascent to its descent (Noto: 1.15 em above the baseline, 0.288 em below), while
    // its glyphs stand in the ideographic em box (0.88 em above, 0.12 em below); the two ink boxes must not overlap.
    const ink = (box, fs) => { const asc = (box.b - box.t) - 0.288 * fs; return { t: box.t + asc - 0.88 * fs, b: box.t + asc + 0.12 * fs }; };
    const rtInk = ink(r.rt, r.rtFs);
    for (const g of glyphs) {
      if (g.l >= r.base.l - 0.5 && g.r <= r.base.r + 0.5 && Math.abs(g.t - r.base.t) < 2) continue; // its own word
      if (touch && Math.abs(g.t - r.base.t) < 2) continue; // its own line's neighbours: overhung, on touch
      const gInk = ink(g, g.fs);
      const overlapX = Math.min(g.r, r.rt.r) - Math.max(g.l, r.rt.l), overlapY = Math.min(gInk.b, rtInk.b) - Math.max(gInk.t, rtInk.t);
      if (overlapX > 0.5 && overlapY > 0.5) { issues.push(`${r.text} meets a glyph (${overlapX.toFixed(1)}×${overlapY.toFixed(1)} at ${g.fs}px)`); break; }
    }
  }
  const lines = new Map();
  for (const r of rows) { const k = Math.round(r.rt.t / 4); if (!lines.has(k)) lines.set(k, []); lines.get(k).push(r); }
  let closest = Infinity;
  for (const line of lines.values()) {
    line.sort((a, b) => a.rt.l - b.rt.l);
    for (let i = 1; i < line.length; i++) {
      const g = line[i].rt.l - line[i - 1].rt.r;
      closest = Math.min(closest, g);
      if (g < gap) issues.push(`${line[i - 1].text}|${line[i].text} ${g.toFixed(1)} px apart`);
    }
  }
  return { issues, readings: rows.length, sizes: [...new Set(rows.map((r) => r.size))], closest: Number.isFinite(closest) ? +closest.toFixed(1) : null };
}
const GLOSS = (selectors) => selectors.map((sel) => [...document.querySelectorAll(sel)].filter((n) => n.checkVisibility() && n.textContent.trim())
  .map((n) => ({ sel, size: parseFloat(getComputedStyle(n).fontSize), text: n.textContent.trim().slice(0, 24) }))).flat();
/** L3: every visible text box's size, by the element that sets it */
const CENSUS = (ladder) => {
  const off = [], inline = [], scene = [], drawn = [];
  let checked = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (!el.checkVisibility?.() || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.width === 0) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (el.closest('#drift-layer')) { scene.push(size); continue; }
    if (el.closest('svg')) { drawn.push(size); continue; }
    checked++;
    if (el.tagName === 'RT') { const word = parseFloat(getComputedStyle(el.parentElement).fontSize); if (Math.abs(size - word / 2) < 0.06) continue; }
    if (ladder.some((v) => Math.abs(v - size) < 0.05)) continue;
    if (size > 42) continue; // a figure past the headword step (how it is written is L1's: a multiple of the step, or fluid between multiples)
    const setter = [el, ...(() => { const a = []; let p = el.parentElement; while (p && p !== document.body) { a.push(p); p = p.parentElement; } return a; })()].find((n) => n.style?.fontSize);
    if (setter) { inline.push({ tag: el.tagName, cls: String(el.className).slice(0, 40), size, by: String(setter.className || setter.tagName).slice(0, 40) }); continue; }
    off.push({ tag: el.tagName, cls: String(el.className).slice(0, 50), size, text: el.textContent.trim().slice(0, 16) });
  }
  return { checked, off, inline, scene: [...new Set(scene)].length, drawn: [...new Set(drawn)] };
};

try {
  for (const engine of engines) {
    const browser = await { chromium, webkit }[engine].launch({ headless: true });
    const version = browser.version();
    const run = async (name, viewport, body, opts) => {
      const s = await session(browser, viewport, opts);
      try {
        const observations = await body(s);
        assert.deepEqual(s.errors, [], 'no page errors');
        record(`${engine} ${version}`, name, true, observations);
      } catch (error) {
        await s.page.screenshot({ path: resolve(evidence, `${engine}-${name}-FAIL.png`) }).catch(() => {});
        record(`${engine} ${version}`, name, false, null, String(error.message || error).split('\n').slice(0, 6).join(' | '));
      } finally { await s.ctx.close(); }
    };
    const phoneLadder = Object.values({ ...LADDER, ...PHONE_STEPS });
    await run('L3-one-ladder-rendered', { width: 390, height: 844 }, async ({ page }) => {
      const rooms = {};
      const take = async (label) => { rooms[label] = await page.evaluate(CENSUS, phoneLadder); };
      await page.evaluate(() => window.__F__.visit('shelf')); await page.waitForTimeout(600); await take('shelf');
      await openReader(page); await page.evaluate(() => window.__F__.dials(0, 2, 0)); await page.waitForTimeout(500); await take('reader-always');
      await page.evaluate(() => window.__F__.dials(0, 1, 0)); await page.waitForTimeout(400);
      const tok = readerTok(page, '大臣');
      await tok.scrollIntoViewIfNeeded(); await climbToCard(page, tok); await page.waitForTimeout(300); await take('slip');
      await page.locator('#mini button.mini-word').click(); await page.waitForTimeout(900); await take('page');
      for (const room of ['tray', 'thesaurus', 'dojo', 'me']) { await page.evaluate((v) => window.__F__.visit(v), room); await page.waitForTimeout(900); await take(room); }
      await openDeckBack(page); await take('deck-back');
      const off = Object.entries(rooms).flatMap(([room, c]) => c.off.map((o) => ({ room, ...o })));
      assert.deepEqual(off, [], `text off the ladder: ${JSON.stringify(off.slice(0, 12))}`);
      return Object.fromEntries(Object.entries(rooms).map(([room, c]) => [room, { checked: c.checked, inline: c.inline.length, inlineSizes: [...new Set(c.inline.map((i) => i.size))], scene: c.scene }]));
    });
    for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1368, height: 900 }]) {
      const w = viewport.width;
      await run(`R1-on-touch-${w}`, viewport, async ({ page }) => {
        await openReader(page);
        const before = await page.evaluate(READINGS, '#reader');
        assert.equal(before.rows.length, 0, 'on touch, no reading shows before a tap');
        const tok = readerTok(page, '表彰');
        await tok.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const y0 = await page.evaluate(() => scrollY);
        // where each word's first glyph stands (its text, not its button's box)
        const glyphFoot = () => [...document.querySelectorAll('#reader .tok')].slice(0, 80).map((t) => {
          const w = t.querySelector('.tok-word') || t;
          const n = w.querySelector('ruby')?.firstChild || [...w.childNodes].find((c) => c.nodeType === 3);
          if (!n) return null;
          const r = document.createRange(); r.selectNodeContents(n);
          const b = [...r.getClientRects()].find((x) => x.width > 0);
          return b ? Math.round(b.bottom * 10) / 10 : null;
        });
        const tops = await page.evaluate(glyphFoot);
        await tok.click();
        await page.waitForTimeout(400);
        const after = await page.evaluate(READINGS, '#reader');
        const shown = after.rows.filter((r) => r.text === 'ひょうしょう');
        assert.equal(shown.length, 1, `the tapped word shows its reading: ${JSON.stringify(after.rows.map((r) => r.text))}`);
        const judged = judgeReadings({ rows: shown, glyphs: after.glyphs }, { touch: true });
        assert.deepEqual(judged.issues, [], judged.issues.join('; '));
        const y1 = await page.evaluate(() => scrollY);
        const tops2 = await page.evaluate(glyphFoot);
        const moved = tops.map((t, i) => (t == null || tops2[i] == null ? 0 : Math.abs(tops2[i] + (y1 - y0) - t))).filter((d) => d >= 1);
        assert.deepEqual(moved, [], `a shown reading moves no line: ${moved.slice(0, 5).join(', ')}`);
        const over = shown[0].rt.r - shown[0].rt.l - (shown[0].base.r - shown[0].base.l);
        return { size: shown[0].size, word: shown[0].word, overhang: Math.round(Math.max(0, over) * 10) / 10 };
      });
      await run(`R4-breaks-on-touch-${w}`, viewport, async ({ page }) => {
        await openReader(page);
        const tok = readerTok(page, '表彰');
        await tok.scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        const before = await page.evaluate(LINE_BREAKS, 120);
        await tok.click();
        await page.waitForTimeout(400);
        const shown = (await page.evaluate(READINGS, '#reader')).rows.filter((r) => r.text === 'ひょうしょう');
        assert.equal(shown.length, 1, 'the tapped word shows its reading');
        const after = await page.evaluate(LINE_BREAKS, 120);
        assert(before.words >= 60, `the reader's first words are measured: ${before.words}`);
        assert.deepEqual(after.starts, before.starts, `a touch reveal re-breaks no line: ${JSON.stringify({ before: before.starts, after: after.starts })}`);
        return { words: before.words, lines: before.starts.length };
      });
      await run(`R2-always-${w}`, viewport, async ({ page }) => {
        await openReader(page);
        await page.evaluate(() => window.__F__.dials(0, 2, 0));
        await page.waitForTimeout(500);
        const found = await page.evaluate(READINGS, '#reader');
        assert(found.rows.length > 30, `readings shown: ${found.rows.length}`);
        const judged = judgeReadings(found);
        assert.deepEqual(judged.issues, [], judged.issues.slice(0, 8).join('; '));
        await page.screenshot({ path: resolve(evidence, `${engine}-R2-always-${w}.png`) });
        return { readings: judged.readings, sizes: judged.sizes, closest: judged.closest };
      });
    }
    await run('W1-fresh-320-reveal-fold', { width: 320, height: 700 }, async ({ page }) => {
      await openReader(page);
      const widths = () => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth,
        reader: document.querySelector('#reader')?.scrollWidth ?? null, inner: innerWidth, visual: visualViewport?.width ?? null, scale: visualViewport?.scale ?? null }));
      const exact = (w) => w.doc === 320 && w.body <= 320 && w.reader != null && w.reader <= 320 && w.inner === 320 && w.visual === 320 && w.scale === 1;
      const fresh = await widths();
      assert(exact(fresh), `a fresh 320 reader is 320 wide: ${JSON.stringify(fresh)}`);
      // the word nearest its line's end whose hidden reading is wider than it (ruby[data-...] aside: the reader's own)
      const index = await page.evaluate(() => {
        let best = null;
        for (const tok of [...document.querySelectorAll('#reader .tok[data-index]')].slice(0, 200)) {
          const rt = tok.querySelector('ruby > rt.hidden-rt'); const ruby = rt?.parentElement;
          if (!rt || ruby.querySelectorAll('rt').length !== 1) continue;
          const base = [...ruby.childNodes].filter((n) => n !== rt).map((n) => n.textContent).join('');
          if ([...rt.textContent].length * 0.5 <= [...base].length + 0.5) continue;
          const inlineLevel = (node) => !!node && /^inline|^ruby|^contents$/.test(getComputedStyle(node).display);
          let block = tok.parentElement;
          while (block && (inlineLevel(block) || inlineLevel(block.parentElement))) block = block.parentElement;
          const lineRight = block.getBoundingClientRect().right - parseFloat(getComputedStyle(block).paddingRight);
          const room = lineRight - ruby.getBoundingClientRect().right;
          if (room >= 0 && (!best || room < best.room)) best = { index: tok.dataset.index, room };
        }
        return best?.index ?? null;
      });
      assert(index != null, 'a word with a wider reading near its line\'s end');
      const tok = page.locator(`#reader .tok[data-index="${index}"]`);
      await tok.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      const before = await page.evaluate(LINE_BREAKS, 200);
      await tok.click();
      await page.waitForTimeout(400);
      const shown = (await page.evaluate(READINGS, '#reader')).rows;
      assert.equal(shown.length, 1, `one reading shows: ${JSON.stringify(shown.map((r) => r.text))}`);
      const judged = judgeReadings({ rows: shown, glyphs: [] }, { touch: true });
      assert.deepEqual(judged.issues, [], judged.issues.join('; '));
      const revealed = await widths();
      assert(exact(revealed), `revealed, the reader stays 320 wide: ${JSON.stringify(revealed)}`);
      assert.deepEqual((await page.evaluate(LINE_BREAKS, 200)).starts, before.starts, 'the reveal re-breaks no line');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      const folded = await page.evaluate(READINGS, '#reader');
      assert.equal(folded.rows.length, 0, `folded, no reading shows: ${JSON.stringify(folded.rows.map((r) => r.text))}`);
      const after = await widths();
      assert(exact(after), `folded, the reader stays 320 wide: ${JSON.stringify(after)}`);
      return { word: index, reading: shown[0].text, base: Math.round(shown[0].base.r - shown[0].base.l), rt: Math.round(shown[0].rt.r - shown[0].rt.l),
        flushRight: Math.abs(shown[0].rt.r - shown[0].line.r) <= 1, widths: { fresh, revealed, after } };
    });
    await run('R3-deck-back-390', { width: 390, height: 844 }, async ({ page }) => {
      await openDeckBack(page);
      const found = await page.evaluate(READINGS, '#kp-card .kp-sentence');
      assert(found.rows.length > 3, `the back's readings: ${found.rows.length}`);
      const judged = judgeReadings(found);
      assert.deepEqual(judged.issues, [], judged.issues.slice(0, 8).join('; '));
      await page.locator('#kp-card .kp-f-gloss > summary').click().catch(() => {});
      await page.waitForTimeout(300);
      const gloss = await page.evaluate(GLOSS, ['#kp-card .kp-gloss', '#kp-card .kp-en']);
      assert(gloss.length > 0 && gloss.every((g) => g.size >= 13), `the deck's English 13 px or more: ${JSON.stringify(gloss)}`);
      await page.screenshot({ path: resolve(evidence, `${engine}-R3-deck-back.png`) });
      return { readings: judged.readings, sizes: judged.sizes, closest: judged.closest, gloss: [...new Set(gloss.map((g) => g.size))] };
    });
    await run('G1-glosses-390', { width: 390, height: 844 }, async ({ page }) => {
      await openReader(page);
      const tok = readerTok(page, '大臣');
      await tok.scrollIntoViewIfNeeded(); await climbToCard(page, tok); await page.waitForTimeout(400);
      const slip = await page.evaluate(GLOSS, ['#mini .mini-gloss']);
      await page.locator('#mini button.mini-word').click(); await page.waitForTimeout(900);
      const pageGloss = await page.evaluate(GLOSS, ['#sheet .gloss', '#sheet .sense-list li', '#sheet .example-en', '.sheet .gloss', '.sheet .sense-list li']);
      assert(slip.length === 1 && slip[0].size >= 13, `the slip's meaning: ${JSON.stringify(slip)}`);
      assert(pageGloss.length > 0 && pageGloss.every((g) => g.size >= 13), `the page's meanings: ${JSON.stringify(pageGloss.slice(0, 6))}`);
      return { slip: slip[0].size, page: [...new Set(pageGloss.map((g) => g.size))] };
    });
    // 200 % text: the phone's 390 CSS px at twice the size is a 195 CSS px page drawn at four device pixels
    await run('Z1-200-percent', { width: 195, height: 422 }, async ({ page }) => {
      await openReader(page);
      assert.equal(await page.evaluate(() => innerWidth), 195, 'the page is laid out at 195 CSS px');
      const tok = readerTok(page, '表彰');
      await tok.scrollIntoViewIfNeeded(); await tok.click(); await page.waitForTimeout(400);
      const touch = await page.evaluate(READINGS, '#reader');
      const shown = touch.rows.filter((r) => r.text === 'ひょうしょう');
      assert.equal(shown.length, 1, 'a tap shows its reading at 200 %');
      const j1 = judgeReadings({ rows: shown, glyphs: touch.glyphs }, { touch: true });
      assert.deepEqual(j1.issues, [], j1.issues.join('; '));
      // G3 · the next tap draws the card: its meaning is what is judged (one line at least, never an empty pass)
      if (!(await page.locator('#mini').count())) await tok.click();
      await page.locator('#mini').waitFor(); await page.waitForTimeout(400);
      const slip = await page.evaluate(GLOSS, ['#mini .mini-gloss']);
      assert(slip.length > 0 && slip.every((g) => g.size >= 13), `the slip's meaning at 200 %: ${JSON.stringify(slip)}`);
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.__F__.dials(0, 2, 0));
      await page.waitForTimeout(500);
      const always = await page.evaluate(READINGS, '#reader');
      const j2 = judgeReadings(always);
      assert.deepEqual(j2.issues, [], j2.issues.slice(0, 8).join('; '));
      // every line of the text stands inside the text's own column (the app's chrome at 195 CSS px is another matter,
      // recorded, not judged here)
      const column = await page.evaluate(() => {
        const reader = document.querySelector('#reader'), box = reader.getBoundingClientRect(), cs = getComputedStyle(reader);
        const right = box.right - parseFloat(cs.paddingRight) + 1, left = box.left + parseFloat(cs.paddingLeft) - 1;
        // a closing mark may hang into the paper's margin (ぶら下げ: it never starts a line), never past the paper
        const hanging = /^[、。，．」』）〉》〕］｝！？]+$/u;
        const out = [...reader.querySelectorAll('.tok')].map((t) => ({ t, r: t.getBoundingClientRect(), text: t.textContent.trim() }))
          .filter(({ r, text }) => r.width && (hanging.test(text) ? r.right > box.right || r.left < box.left : r.right > right || r.left < left))
          .map(({ r, text }) => `${text.slice(0, 12)} [${r.left.toFixed(1)}–${r.right.toFixed(1)} in ${left.toFixed(1)}–${right.toFixed(1)}]`);
        return { out, readerScroll: reader.scrollWidth - reader.clientWidth, pageScroll: document.scrollingElement.scrollWidth - innerWidth };
      });
      // recorded, not judged: a bracketed word wider than a 163 px line (「スタートアップ」 is 189 px at 21 px) cannot fit
      // a 195 px page whatever breaks; WebKit keeps it whole and its closing mark runs past the edge
      await page.screenshot({ path: resolve(evidence, `${engine}-Z1-200-percent.png`) });
      return { readings: j2.readings, sizes: j2.sizes, closest: j2.closest, slip: slip.map((g) => g.size), pageScroll: column.pageScroll, pastTheColumn: column.out };
    }, { scale: 4, zoomed: true });
    await browser.close();
  }
} finally {
  await host.close();
  const receipt = {
    artifactSha256: manifest.artifactSha256, gitSha: manifest.gitSha, sourceDirty: manifest.sourceDirty,
    verifierSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    scope: 'F type and ruby: one ladder (sheets and rendered), one ruby rule, readings at half their word and 10 px or more on touch and always at 320/390/430/1368, never touching another reading, never crossing or running off a line, over their word (a touch reading overhangs its neighbours instead of widening its word; an always reading never meets a glyph), moving and re-breaking no line; a fresh 320 reader 320 wide revealed and folded; the deck back the same; glosses 13 px or more; the reader at 200 % text',
    results,
    // per engine: L3, R1 ×4, R4 ×4, R2 ×4, W1, R3, G1, Z1
    passed: results.length === 2 + engines.length * 17 && results.every((row) => row.passed),
  };
  writeFileSync(resolve(evidence, 'type-ruby.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`${results.filter((r) => r.passed).length}/${results.length} passed · evidence ${evidence}`);
  if (!receipt.passed) process.exitCode = 1;
}
