/** Design pass 2026-09-30, steps 1–2: the reader and the bookshelf, measured in a real browser.
 *
 *   R1 flush tokens     — adjacent reader tokens on one line leave no gap between their glyphs
 *                         (base text only, readings excluded), before and after a reading shows;
 *                         and no whitespace text node stands between token elements.
 *   R2 readability      — Japanese body 21–22 px at 1368 / 18–19 px at 390; a shown reading is
 *                         ≥ 0.55 × the body; the tap's English (in the word popup, reader lane
 *                         2026-10-02) is ≥ 15 px at ≥ 4.5:1; the body text itself is ≥ 4.5:1.
 *   R3 first sentence   — every token of the first sentence is inside the first viewport, and
 *                         nothing fixed (tip, bar, bug) covers it, at 390×844 and 1368×900.
 *   S1 learner wording  — no visible "signals disagree", 不一致 or "awaiting John" on the shelf or
 *                         in a reading.
 *   S2 first story      — the first shelf card's headline is inside 390×844 and not covered.
 *   S3 one count        — every number the unfiltered shelf states about its size is the same
 *                         number, and it equals the stories on the shelf (grid + today's band).
 *   S4 picture cards    — (FEEL pass 2026-10-02, John: "there are now NO pictures at all… we want
 *                         this to be like a magazine") every article card on the shelf carries ONE
 *                         picture slot, a fixed 3:2 box: the record's own picture (index.json
 *                         "picture".src, loaded, decorative inside the card) where it has one, else a
 *                         calm block whose only words are its topic in small type (never a kanji, no
 *                         larger than 16 px). Every card has a kicker, the headline, a level chip and
 *                         in English its English line; the lead adds its first sentence. The short
 *                         word definitions carry no picture and stand in their own band. The 永 seal
 *                         sits inside the 本棚 title, ≤ 48 px. Control: 2ae957bb, whose cards had no
 *                         picture slot at all.
 *   T1 tools (glance)   — (glance pass 2026-10-01) the shelf's study tools sit behind ONE visible
 *                         学習ツール Tools button in the title row: as served no tool door is visible,
 *                         and the first story follows the filter chips (or, with the filters folded
 *                         into the Tools sheet, the title block) with no other control between.
 *                         The button opens one panel in which every door keeps its id, is visible
 *                         inside the viewport and names itself in Japanese, on one line, with its English
 *                         gloss (the accessible name says both); a door in it still opens its room.
 *                         Control: 7ef0e985, whose thirteen text doors stood in a row under the filters.
 *   M1 title block      — (glance pass) at 1368 and 390 the date and the article count stand on one
 *                         line; the 未確認 note is one short line that still counts the pending stories
 *                         against the total, and its ⓘ opens the longer explanation; the 永 seal stays
 *                         ≤ 48 px inside the title. Control: 7ef0e985, whose phone dateline broke the
 *                         count onto a second line and whose note ran to three lines.
 *   O1 no clipped row   — (glance pass) at 320, 390 and 1368 the shelf as served, and with its tools
 *                         panel open, never runs past the screen's side: no element of the shelf
 *                         crosses the viewport's left or right edge, no row scrolls sideways, the page
 *                         itself does not, and the look-up field's hint fits inside the field.
 *                         Control: 7ef0e985, whose phone chip bar and today's six scrolled sideways
 *                         with a chip and a card cut mid-word at the edge.
 *   P1 tip in the page  — (glance pass; reader lane 2026-10-02) at 1368 and 390, on a first visit, the
 *                         one-time hint says, in one plain line, "Tap any word for its meaning." (round 4,
 *                         John T4: the explanation was "too verbose"). It is a note in the page's flow
 *                         (never fixed, sticky or absolute) that ends above the article's first word,
 *                         and at four scroll depths no on-screen word is covered by it. The first word
 *                         that opens its popup makes it disappear without moving the text, and it is
 *                         remembered, so the next visit opens without it; its × removes it at once and
 *                         for good. Control: 3166ded3, whose tip taught the three-tap ladder and stayed.
 *   W1 ダマスカス saves  — (glance pass; reader lane 2026-10-02) at 1368 and 390, the word popup for
 *                         ダマスカス (Damascus, the fixture article's first word, read だますかす by the
 *                         article and ダマスカス by the dictionary: one reading in two scripts) offers a live
 *                         Save at full strength with no held reason, and one press saves it: the button
 *                         reads "Saved ✓", the record holds exactly one ダマスカス card, and no list window
 *                         opens. A genuinely different reading stays held, in plain words
 *                         (test-word-saved-answer K1). Control: 7ef0e985 (seal disabled) and 3166ded3
 *                         (the press opened the list window and saved nothing).
 *   W2 one word, one card — (gate review on 8dea3c2e) at 1368, ダマスカス saved from the popup and then
 *                         opened in 全項目 shows "memorizing" there, with no conflict note and no replace
 *                         offer; saved in 全項目 first, the popup's Save is live and pressed ("Saved ✓")
 *                         with no held reason and no "open that card". Control: 8dea3c2e, where the quick
 *                         look kept だますかす as the card's reading and 全項目 called it "another reading".
 *   G1 one tap, the meaning — (reader lane 2026-10-02, John #8/#11) at 1368 and 390, ONE tap on 郊外 opens
 *                         the popup with the word, its reading こうがい, its meaning "suburb", a filled
 *                         Save and "Full entry ›", inside the screen; nothing is written under the word.
 *                         A tap on another word moves the popup; Escape puts it away and gives focus back
 *                         to the word. Control: 3166ded3, whose first tap showed only the reading.
 *   G2 menu → one card  — (John #11 "right click and choose save") a right-click on 郊外 opens the word menu
 *                         at the pointer: Save word · Save the sentence · Full entry · Ask the tutor about
 *                         this sentence · Copy. Save word makes exactly one 郊外 card carrying its sentence
 *                         (the capture path's ctx), the menu closes, a polite toast says so, and the menu
 *                         then shows "Saved ✓" unavailable. A right-click off the words keeps the browser's
 *                         own menu. Control: 3166ded3, which had no word menu.
 *   G3 Save + Undo      — (John #17) at 1368 and 390, the popup's Save makes one card in one press, no list
 *                         window opens, the button reads "Saved ✓" and a role=status toast reads "Saved to
 *                         review · Undo"; Undo takes the card back out and the button reads "Save" again.
 *                         Control: 3166ded3, whose Save opened dialog#vocabulary-list-dialog.
 *   G4 keyboard menu    — the focused word's Shift+F10 (and the ContextMenu key) opens the menu with the
 *                         first item focused; ↓ moves; Escape closes it and focus returns to the word.
 *                         Enter on the word opens the popup with focus on Save; Escape returns to the word.
 *                         Control: 3166ded3 (no menu).
 *   G5 lists popover    — (John #17; round 4 T5, "click save and then add to list from there") the popup
 *                         offers no list until the word is saved; after Save, at 1368 "Add to a list" opens
 *                         a compact non-modal popover beside the link (no dialog#vocabulary-list-dialog),
 *                         whose inline "New list" field makes a list holding the word and whose checkbox
 *                         takes it off again while the card stays; at 390 the popover is a short sheet
 *                         on the screen's foot. Control: 3166ded3.
 *                         In the galaxy, where a word's entry opens over the sky and a word of its example
 *                         sentences opens the same popup, the path is the same: no list before Save, the
 *                         list beside "Saved ✓", and none again after Undo. Control: 890cd522, which
 *                         showed "Add to a list" beside an unsaved Save there.
 *   G6 sentence door    — (John #18; round 4 T5) no sentence bar shows when a word is chosen (no sentence
 *                         action shows outside the popup); the popup's last band is one named door,
 *                         "Study this sentence", showing the sentence's start; it opens the sentence in
 *                         the card, the word marked, with "Ask the tutor" and "Practice it" and a quiet
 *                         "Save the sentence", which keeps that sentence on the tutor page without making
 *                         it the active one; and Ask the tutor opens the tutor with that sentence as its
 *                         active context. Control: 3166ded3, whose bar floated in on the first tap.
 *                         At 390 and 320 the sentence view keeps the word card's top within 1px, stays
 *                         inside the screen, saves one tutor entry without activation or navigation,
 *                         and Back to the word restores the word's Save. Focus stays wholly inside
 *                         the popup and article scroll stays still on opening, Tab to Ask/Practice,
 *                         and return from Practice, including a shorter kana-word card whose sentence
 *                         needs more room than its word view.
 *                         With motion enabled (390 and 320), return from Practice lands on the sentence
 *                         pane with Practice focused and wholly visible for a particle (の), a lookup word
 *                         (ダマスカス, whose popup opens after its dictionary rows load) and a content word
 *                         (その); each returned card, and a card whose sentence is opened while it is still
 *                         rising, sits on the word card's seat within 1px. Control: 890cd522.
 *   G7 version switch   — (John #9) the 原文 / やさしい版 switch names each side and its level ("原文 Original
 *                         · N1", "やさしい版 Simplified · N3") with the caption "Simplified: the same story
 *                         in easier Japanese." (round 4: shorter), and an article without a
 *                         simplified version shows no switch. Control: 3166ded3 ("easier N3", no caption).
 *                         On a phone (390 and 320) each side of the switch and its ⓘ is a box at least
 *                         44px tall and wide (the brief's hit floor; added in round 4's review).
 *   G8 motion            — at 390 and 320, computed nonzero transitions and animation keyframes use
 *                         transform and opacity only, with reduced motion disabled so the rule cannot
 *                         pass by suppressing motion, across the reader room (#app: the top bar, the tab
 *                         bar, the title card, bookmarks, the play bar, the article and its footer), its
 *                         text settings, the word menu, the word/sentence popup, the Save toast, and the
 *                         list sheet reached by Save, then Add to a list. Control: 890cd522, whose chips,
 *                         top bar, tab bar and settings choices animated colour.
 *   G9 Japanese breaks   — at 390 and 320, the source title and article text survive unchanged, opening
 *                         brackets share a painted line with the following glyph, closing punctuation
 *                         shares one with the preceding glyph, and title lookup words do not split.
 *   J1 JLPT room        — the room and a question show no "awaiting John" / "machine-checked"
 *                         text; unreviewed tests wear the 未確認 chip; each level card carries its
 *                         level colour hook and a count of its tests (steps 3–4).
 *   K1 keyboard (R4)    — from the end of the title block to the article's close (読み終えた), a 3-paragraph
 *                         article costs at most paragraphs + 3 Tab presses: one stop per paragraph;
 *                         ←/→ move between words and Home/End reach a paragraph's ends; a word is
 *                         named by itself (control: bfb7ed50, where every word is a Tab stop).
 *   A1 no F1            — with a stored F1 preference and the listen control pressed where one
 *                         exists, no F1 clip is requested and no narration manifest naming F1 loads.
 *
 * Negative controls: the original design checks were run against the pre-pass artifact (72b8b3ab),
 * except R2's furigana ratio, which that build already met; its control is a scoped style injection
 * (the reading at 0.46em, the corridor.css default) that the check must reject. The round 4 review's
 * hit-floor checks target the first pass's 40px version choices, rather than an earlier 44px control.
 * Usage: KAIRO_SITE_DIR=<artifact> KAIRO_ARTIFACT_SHA256=<digest> node verify-design-reader-shelf.mjs
 *        KAIRO_BROWSER=chromium|webkit limits the engines; --control adds the injected control.
 */
import { openShelfTools } from './shelf-tools-support.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Choose an existing artifact and its exact digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const withControl = process.argv.includes('--control');

const ARTICLE = 'global-voices:2026-09-28-65726'; // 「ダマスカス 郊外 ジャラマナ」, 「正 反対」, 「「 連帯 の 畑 」」
const fixtureArticle = JSON.parse(readFileSync(resolve(site, 'data/articles/global-voices-2026-09-28-65726.json'), 'utf8'));
const NARRATED = 'aozora:000628';
const THREE_PARAS = 'real-hojoki'; // 方丈記 · 冒頭: three paragraphs // ごん狐: the pre-pass build carried F1 narration for it
const DESK = { width: 1368, height: 900 }, PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 700 };
const GAP_MAX = 1.5; // px between one token's last glyph and the next token's first
const DIAGNOSTIC = /signals disagree|不一致|awaiting John/iu;

const host = await startStaticHost({ site, port: 0 });
const results = [];

async function open(page, search = '') {
  await page.goto(`${host.origin}/?entry=shelf&ui=bi${search}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.waitForTimeout(400);
}
async function openArticle(page, id, search = '') {
  await open(page, search);
  await page.evaluate((pid) => document.querySelector(`#shelf-body [data-passage="${pid}"] .shelf-open`).click(), id);
  await page.waitForFunction(() => document.body.dataset.view === 'reader' && document.querySelector('#reader .tok'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

/** Glyph gaps between adjacent tokens, measured on base text (never inside <rt>). */
const measureGaps = (count) => {
  const reader = document.querySelector('#reader');
  const stray = [...reader.querySelectorAll('*')].concat(reader)
    .flatMap((node) => [...node.childNodes])
    .filter((node) => node.nodeType === 3 && !node.textContent.trim() && !node.parentElement.closest('rt'))
    .filter((node) => node.parentElement === reader || node.parentElement.classList.contains('token-door') || node.parentElement.classList.contains('bunsetsu'));
  // Two measures, because engines disagree about ruby: WebKit reports the base glyphs where they
  // sit, Chromium reports a base text box already widened to its reading. So besides the glyph
  // gap between tokens, each word's box is compared with the same base text set plain in the
  // reader's own font: any excess is air the reading pried into the line.
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:0;top:0;padding:0;margin:0;border:0';
  reader.append(probe);
  const boxes = [];
  for (const tok of [...reader.querySelectorAll('.tok')].slice(0, count)) {
    const word = tok.querySelector('.tok-word') || tok;
    const walker = document.createTreeWalker(word, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('rt, .tok-en') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const rects = [];
    let base = '';
    while (walker.nextNode()) {
      base += walker.currentNode.textContent;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      rects.push(...[...range.getClientRects()].filter((r) => r.width > 0));
    }
    if (!rects.length) continue;
    probe.textContent = base;
    const excess = word.getBoundingClientRect().width - probe.getBoundingClientRect().width;
    boxes.push({ text: base, index: Number(tok.dataset.index), first: rects[0], last: rects.at(-1), excess });
  }
  probe.remove();
  let worst = { gap: 0 };
  for (let i = 1; i < boxes.length; i += 1) {
    const a = boxes[i - 1], b = boxes[i];
    if (a.excess > worst.gap) worst = { gap: Math.round(a.excess * 100) / 100, pair: `${a.text} (box wider than its text)`, at: a.index };
    if (Math.abs(a.last.top - b.first.top) > 3 || b.first.left < a.last.left) continue; // a line break
    const gap = b.first.left - a.last.right;
    if (gap > worst.gap) worst = { gap: Math.round(gap * 100) / 100, pair: `${a.text}|${b.text}`, at: a.index };
  }
  return { tokens: boxes.length, worst, strayWhitespace: stray.length };
};

/** The rendered base glyphs, rather than wrapper names, establish Japanese line-breaking behavior. */
const measureJapaneseBreaks = (selector) => {
  const node = document.querySelector(selector);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => n.parentElement.closest('rt, .tok-en') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const glyphs = [];
  let text = '';
  while (walker.nextNode()) {
    const current = walker.currentNode;
    text += current.textContent;
    let offset = 0;
    for (const char of current.textContent) {
      const range = document.createRange();
      range.setStart(current, offset); offset += char.length; range.setEnd(current, offset);
      const rect = [...range.getClientRects()].find((box) => box.width > 0 && box.height > 0);
      if (rect && !/\s/u.test(char)) glyphs.push({ char, y: rect.top + rect.height / 2 });
    }
  }
  const opening = /[「『（〈《〔［｛]/u, closing = /[、。，．！？」』）〉》〕］｝]/u;
  const violations = [];
  let openings = 0, closings = 0;
  for (let i = 0; i < glyphs.length; i += 1) {
    const here = glyphs[i];
    const neighbor = opening.test(here.char) ? glyphs[i + 1] : closing.test(here.char) ? glyphs[i - 1] : null;
    if (opening.test(here.char)) openings += 1;
    if (closing.test(here.char)) closings += 1;
    if (neighbor && Math.abs(here.y - neighbor.y) > 3) violations.push({ mark: here.char, neighbor: neighbor.char, gap: +Math.abs(here.y - neighbor.y).toFixed(1) });
  }
  const splitWords = [...node.querySelectorAll('.japanese-lookup-word')].flatMap((word) => {
    const range = document.createRange(); range.selectNodeContents(word);
    const centers = [...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0).map((box) => box.top + box.height / 2);
    return centers.length && Math.max(...centers) - Math.min(...centers) > 3 ? [word.textContent] : [];
  });
  return { text, glyphs: glyphs.length, openings, closings, violations, splitWords };
};

/** Read the actual cascade and named keyframes, including pseudo-elements, with motion enabled. */
const measureReaderMotion = () => {
  const allowed = new Set(['transform', 'opacity']);
  const definitions = new Map();
  const collect = (rules) => {
    for (const rule of rules) {
      if (rule.type === CSSRule.KEYFRAMES_RULE) definitions.set(rule.name, [...rule.cssRules].flatMap((frame) => [...frame.style]));
      else if (rule.cssRules) collect(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) collect(sheet.cssRules);
  const seconds = (value) => parseFloat(value) * (value.trim().endsWith('ms') ? 0.001 : 1);
  const violations = [];
  let transitions = 0, animations = 0;
  const nodes = [...document.querySelectorAll('#app, #app *, #mini, #mini *, #reader-word-menu, #reader-word-menu *, #reader-toast, #reader-toast *, #vocabulary-list-popover, #vocabulary-list-popover *')];
  const groups = { topBar: '#app > .chrome button', tabBar: '#primary-tabs .primary-tab', titleCard: '.reader-card button, .reader-card summary',
    bookmark: '#reader-place-save', playBar: '.listen-row', words: '#reader button', finished: '#read-fin', settings: '.dials .seg button',
    menu: '#reader-word-menu', popup: '#mini button', toast: '#reader-toast', listAdd: '#vocabulary-list-create' };
  const covered = Object.fromEntries(Object.entries(groups).map(([group, selector]) => [group, nodes.filter((node) => node.matches(selector)).length]));
  for (const node of nodes) for (const pseudo of [null, '::before', '::after']) {
    const style = getComputedStyle(node, pseudo);
    const name = `${node.id || node.className}${pseudo || ''}`;
    const durations = style.transitionDuration.split(',').map(seconds);
    style.transitionProperty.split(',').map((value) => value.trim()).forEach((property, i) => {
      if (property !== 'none' && durations[i % durations.length] > 0) {
        transitions += 1;
        if (!allowed.has(property)) violations.push({ name, kind: 'transition', property });
      }
    });
    const animationDurations = style.animationDuration.split(',').map(seconds);
    style.animationName.split(',').map((value) => value.trim()).forEach((animation, i) => {
      if (animation === 'none' || !(animationDurations[i % animationDurations.length] > 0)) return;
      animations += 1;
      const properties = definitions.get(animation);
      if (!properties) violations.push({ name, kind: 'animation', animation, property: 'missing keyframes' });
      for (const property of new Set(properties || [])) if (!allowed.has(property)) violations.push({ name, kind: 'animation', animation, property });
    });
  }
  return { nodes: nodes.length, transitions, animations, violations, covered };
};

/** WCAG contrast of a node's text against the first opaque background behind it. */
const contrastOf = (selector) => {
  const node = document.querySelector(selector);
  if (!node) return null;
  const parse = (value) => {
    const srgb = value.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/u);
    if (srgb) return { rgb: [srgb[1], srgb[2], srgb[3]].map((v) => Number(v) * 255), a: srgb[4] === undefined ? 1 : Number(srgb[4]) };
    const rgb = value.match(/rgba?\(([^)]+)\)/u);
    if (!rgb) return null;
    const parts = rgb[1].split(/[\s,/]+/u).filter(Boolean).map(Number);
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
  };
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  let bg = null;
  for (let el = node; el && !bg; el = el.parentElement) {
    const c = parse(getComputedStyle(el).backgroundColor);
    if (c && c.a > 0.95) bg = c;
  }
  bg ||= { rgb: [255, 255, 255], a: 1 };
  const fg = parse(getComputedStyle(node).color);
  const mixed = fg.rgb.map((v, i) => v * fg.a + bg.rgb[i] * (1 - fg.a));
  const [l1, l2] = [lum(mixed), lum(bg.rgb)];
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
};

async function tapToken(page, index) {
  const tok = page.locator(`#reader .tok[data-index="${index}"]`);
  await tok.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  const box = await tok.evaluate((node) => { const r = node.getClientRects()[0]; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(250);
}

/** The popup's painted box and which of its views is open. */
const popupSeat = (page) => page.locator('#mini').evaluate((node) => {
  const r = node.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, word: node.querySelector('.mini-word')?.textContent ?? null,
    sentence: node.querySelector('.mini-sentence-pane')?.hidden === false, scrollY };
});

/** The focused control, and whether it lies wholly inside the popup's painted box. */
const popupFocus = (page) => page.evaluate(() => {
  const mini = document.querySelector('#mini'), active = document.activeElement;
  if (!mini || !active) return { id: active?.id ?? null, inside: false, shown: false, scrollY };
  const r = active.getBoundingClientRect(), m = mini.getBoundingClientRect();
  return { id: active.id, inside: mini.contains(active), scrollY,
    shown: r.height > 0 && r.top >= m.top - 1 && r.bottom <= m.bottom + 1 && r.left >= m.left - 1 && r.right <= m.right + 1 };
});

try {
  for (const engine of engines) {
    const browser = await { chromium, webkit }[engine].launch({ headless: true });
    const context = async (viewport, init) => {
      const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await silenceBrowserAudio(ctx);
      if (init) await ctx.addInitScript(init);
      await ctx.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
      const page = await ctx.newPage();
      page.setDefaultTimeout(15000);
      return { ctx, page };
    };
    const run = async (name, viewport, body, init) => {
      const { ctx, page } = await context(viewport, init);
      try {
        const observations = await body(page);
        results.push({ engine, name, passed: true, observations });
        console.log(`PASS ${engine}/${name} ${JSON.stringify(observations)}`);
      } catch (error) {
        const screenshot = resolve(evidence, `${engine}-${name}.png`);
        await page.screenshot({ path: screenshot, animations: 'disabled' }).catch(() => {});
        results.push({ engine, name, passed: false, error: String(error.message || error), screenshot });
        console.log(`FAIL ${engine}/${name}: ${String(error.message || error).split('\n')[0]}`);
      } finally { await ctx.close(); }
    };

    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`R1-flush-tokens-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        const resting = await page.evaluate(measureGaps, 220);
        assert(resting.tokens > 100, `measured only ${resting.tokens} tokens`);
        assert.equal(resting.strayWhitespace, 0, 'whitespace text nodes stand between reader tokens');
        assert(resting.worst.gap <= GAP_MAX, `gap ${resting.worst.gap}px at ${resting.worst.pair} (token ${resting.worst.at})`);
        await tapToken(page, 1); // 郊外: its reading shows
        const shown = await page.evaluate(measureGaps, 220);
        assert(shown.worst.gap <= GAP_MAX, `with a reading shown: gap ${shown.worst.gap}px at ${shown.worst.pair}`);
        return { resting: resting.worst, shown: shown.worst, tokens: resting.tokens };
      });

      await run(`R2-readability-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        if (withControl) await page.addStyleTag({ content: '#reader rt, #reader ruby::before { font-size: 0.46em !important; }' });
        const body = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#reader')).fontSize));
        const [lo, hi] = label === '1368' ? [21, 22] : [18, 19];
        assert(body >= lo && body <= hi, `Japanese body ${body}px, wanted ${lo}–${hi}px`);
        const bodyContrast = await page.evaluate(contrastOf, '#reader .tok.content');
        assert(bodyContrast >= 4.5, `reading text contrast ${bodyContrast}:1`);
        await tapToken(page, 1);
        // measure what is painted: the <rt> itself, or the ruby's ::before when the reader draws
        // the reading there (the <rt> then stays in the DOM, undisplayed, as the reading's record)
        const rt = await page.evaluate(() => {
          const node = [...document.querySelectorAll('#reader .tok[data-index="1"] rt')].find((n) => !n.classList.contains('hidden-rt'));
          if (!node) return null;
          const drawn = getComputedStyle(node).display === 'none' ? getComputedStyle(node.parentElement, '::before') : getComputedStyle(node);
          const text = drawn === getComputedStyle(node) ? node.textContent : drawn.content.replace(/^"|"$/gu, '');
          return { size: parseFloat(drawn.fontSize), opacity: Number(drawn.opacity), text, expected: node.textContent,
            carrier: getComputedStyle(node).display === 'none' ? 'ruby::before' : 'rt' };
        });
        assert(rt && rt.opacity > 0.9 && rt.text === rt.expected, `the first tap shows no reading: ${JSON.stringify(rt)}`);
        assert(rt.size / body >= 0.55, `furigana ${rt.size}px is ${(rt.size / body).toFixed(2)}× the body`);
        // one tap is the meaning (reader lane 2026-10-02): the English stands in the word's popup
        const gloss = await page.evaluate(() => {
          const node = document.querySelector('#mini .mini-gloss');
          return node ? { size: parseFloat(getComputedStyle(node).fontSize), text: node.textContent } : null;
        });
        assert(gloss, 'the tap shows no English in its popup');
        const glossContrast = await page.evaluate(contrastOf, '#mini .mini-gloss');
        assert(gloss.size >= 15, `English gloss ${gloss.size}px`);
        assert(glossContrast >= 4.5, `English gloss contrast ${glossContrast}:1`);
        return { body, bodyContrast, furigana: rt.size, carrier: rt.carrier, ratio: Math.round((rt.size / body) * 100) / 100, gloss: gloss.size, glossContrast };
      });

      await run(`R3-first-sentence-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        const probe = await page.evaluate(() => {
          const toks = [...document.querySelectorAll('#reader .tok')];
          const end = toks.findIndex((t) => /[。！？]/u.test(t.textContent));
          const sentence = toks.slice(0, end + 1);
          const misses = [];
          for (const t of sentence) {
            const r = t.getClientRects()[0];
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            const hit = document.elementFromPoint(x, y);
            if (r.bottom > innerHeight || r.top < 0) misses.push({ t: t.textContent, bottom: Math.round(r.bottom), why: 'outside' });
            else if (!hit || !t.contains(hit)) misses.push({ t: t.textContent, why: `covered by ${hit?.tagName.toLowerCase()}.${[...(hit?.classList || [])].join('.')}` });
          }
          const last = sentence.at(-1).getClientRects()[0];
          return { tokens: sentence.length, lastBottom: Math.round(last.bottom), viewport: innerHeight, misses: misses.slice(0, 4), missCount: misses.length };
        });
        assert.equal(probe.missCount, 0, `first sentence not wholly on the first screen: ${JSON.stringify(probe.misses)}`);
        return probe;
      });
    }

    await run('S1-learner-wording', DESK, async (page) => {
      const seen = [];
      for (const ui of ['bi', 'ja']) {
        await page.goto(`${host.origin}/?entry=shelf&ui=${ui}`);
        await page.waitForFunction(() => document.body.dataset.ready === '1');
        await page.waitForTimeout(400);
        const shelf = await page.evaluate(() => document.body.innerText);
        if (DIAGNOSTIC.test(shelf)) seen.push(`shelf/${ui}: ${shelf.match(/.{0,30}(signals disagree|不一致|awaiting John).{0,30}/iu)?.[0]}`);
        await page.evaluate((pid) => document.querySelector(`#shelf-body [data-passage="${pid}"] .shelf-open`).click(), ARTICLE);
        await page.waitForFunction(() => document.querySelector('#reader .tok'));
        const reader = await page.evaluate(() => document.body.innerText);
        if (DIAGNOSTIC.test(reader)) seen.push(`reader/${ui}: ${reader.match(/.{0,30}(signals disagree|不一致|awaiting John).{0,30}/iu)?.[0]}`);
      }
      assert.equal(seen.length, 0, seen.join(' | '));
      return { screens: 4 };
    });

    await run('S2-first-story-above-fold-390', PHONE, async (page) => {
      await open(page);
      const probe = await page.evaluate(() => {
        const card = document.querySelector('#shelf-reading-results > [data-passage]');
        const title = card.querySelector('.shelf-title');
        const r = title.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + Math.min(r.width, 40) / 2, r.top + Math.min(r.height, 30) / 2);
        return { passage: card.dataset.passage, top: Math.round(r.top), bottom: Math.round(r.bottom), viewport: innerHeight, own: !!hit && card.contains(hit) };
      });
      assert(probe.bottom <= probe.viewport, `first story headline ends at ${probe.bottom}px of ${probe.viewport}`);
      assert(probe.own, 'something covers the first story headline');
      return probe;
    });

    await run('S3-counts-agree', DESK, async (page) => {
      await open(page);
      const probe = await page.evaluate(() => {
        const cards = new Set([...document.querySelectorAll('#shelf-body [data-passage] .shelf-open')]
          .map((n) => n.closest('[data-passage]').dataset.passage)).size;
        const lines = [...document.querySelectorAll('.shelf-masthead p, .shelf-masthead .shelf-review-text, .shelf-results-count')]
          .filter((n) => n.offsetParent !== null || n.classList.contains('shelf-results-count')).map((n) => n.innerText);
        // a size is "N articles" / "N本" / "of (these) N"; "N of" is a subset (the unreviewed count)
        const numbers = lines.flatMap((t) => [
          ...[...t.matchAll(/(\d+)\s*(?:readings|articles|本)/gu)].map((m) => Number(m[1])),
          ...[...t.matchAll(/of (?:these )?(\d+)/gu)].map((m) => Number(m[1])),
        ]);
        return { cards, lines, numbers };
      });
      assert(probe.numbers.length, `no size stated: ${JSON.stringify(probe.lines)}`);
      assert(probe.numbers.every((n) => n === probe.cards), `stated ${JSON.stringify(probe.numbers)} for ${probe.cards} stories: ${JSON.stringify(probe.lines)}`);
      return probe;
    });

    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`S4-picture-cards-${label}`, viewport, async (page) => {
        await open(page);
        // let every picture the index names arrive (they are lazy below the fold)
        await page.evaluate(async () => {
          for (const img of document.querySelectorAll('#shelf-body img.story-img')) img.loading = 'eager';
          await Promise.all([...document.querySelectorAll('#shelf-body img.story-img')].map((img) => img.decode().catch(() => {})));
        });
        const probe = await page.evaluate(async () => {
          const index = await (await fetch('data/articles/index.json')).json();
          const byId = new Map(index.articles.map((row) => [row.id, row]));
          const cards = [...document.querySelectorAll('#shelf-body .story-card')];
          const glossary = (card) => byId.get(card.dataset.passage)?.source === 'isa-yasashii-glossary';
          const articles = cards.filter((card) => !glossary(card)), definitions = cards.filter(glossary);
          const bad = [];
          let pictured = 0;
          for (const card of articles) {
            const slots = card.querySelectorAll('.story-picture');
            const slot = slots[0];
            const row = byId.get(card.dataset.passage) || {};
            if (slots.length !== 1) { bad.push(`${card.dataset.passage}: ${slots.length} picture slots`); continue; }
            const box = slot.getBoundingClientRect();
            const ratio = box.width / box.height;
            // the lead's spread on a wide screen lets its picture fill the story's height; every other slot is 3:2
            if (!card.classList.contains('story-lead') || innerWidth < 900) {
              if (Math.abs(ratio - 1.5) > 0.02) bad.push(`${card.dataset.passage}: picture box ${Math.round(box.width)}×${Math.round(box.height)}`);
            }
            const img = slot.querySelector('img');
            if (row.picture?.src) {
              const src = img ? new URL(img.getAttribute('src'), location.href).pathname : '';
              if (!img || src !== `/data/${row.picture.src}`) bad.push(`${card.dataset.passage}: picture ${src || 'missing'} for ${row.picture.src}`);
              else if (!(img.complete && img.naturalWidth > 0)) bad.push(`${card.dataset.passage}: picture did not load`);
              else if (img.alt !== '') bad.push(`${card.dataset.passage}: picture inside the card is not decorative`);
              else pictured += 1;
            } else {
              const words = slot.textContent.trim();
              const size = parseFloat(getComputedStyle(slot.querySelector('.story-picture-word') || slot).fontSize);
              if (img || !slot.classList.contains('is-placeholder')) bad.push(`${card.dataset.passage}: a picture slot with no picture is not the calm block`);
              else if (/[\p{Script=Han}]/u.test(words) || size > 16 || !words) bad.push(`${card.dataset.passage}: the calm block reads "${words}" at ${size}px`);
            }
          }
          for (const card of definitions) {
            if (card.querySelector('.story-picture, img')) bad.push(`${card.dataset.passage}: a word definition carries a picture`);
            if (!card.closest('.shelf-definitions')) bad.push(`${card.dataset.passage}: a word definition stands among the articles`);
          }
          const incomplete = cards.filter((card) => !card.querySelector('.story-kicker') || !card.querySelector('.shelf-title')?.textContent.trim() ||
            !card.querySelector('.level-chip')?.textContent.trim() || !card.querySelector('.shelf-title-en')?.textContent.trim()).map((card) => card.dataset.passage);
          const lead = document.querySelector('#shelf-reading-results .story-lead');
          const seal = document.querySelector('.shelf-masthead .shelf-art');
          const sealBox = seal?.getBoundingClientRect();
          const named = index.articles.filter((row) => row.picture?.src && cards.some((card) => card.dataset.passage === row.id)).length;
          return { cards: cards.length, articles: articles.length, definitions: definitions.length, pictured, named, bad: bad.slice(0, 4), badCount: bad.length,
            incomplete: incomplete.slice(0, 4), incompleteCount: incomplete.length,
            lede: lead?.querySelector('.story-lede')?.textContent ?? '', sealInTitle: !!seal?.closest('.shelf-mast-title'),
            seal: sealBox ? Math.round(Math.max(sealBox.width, sealBox.height)) : 0 };
        });
        assert(probe.cards > 20 && probe.articles > 20 && probe.definitions > 0, `only ${probe.cards} cards, ${probe.definitions} word definitions`);
        assert.equal(probe.badCount, 0, `picture slots wrong: ${probe.bad.join(' | ')}`);
        assert(probe.named > 0 && probe.pictured === probe.named, `${probe.pictured} of the ${probe.named} pictures the index names stand on their cards`);
        assert.equal(probe.incompleteCount, 0, `cards missing kicker, headline, English line or level: ${probe.incomplete.join(', ')}`);
        assert(/[。！？…]$/u.test(probe.lede), `the lead has no first-sentence teaser: "${probe.lede}"`);
        assert(probe.sealInTitle && probe.seal > 0 && probe.seal <= 48, `the 永 seal is not a small mark inside the title: ${JSON.stringify(probe)}`);
        return { cards: probe.cards, pictured: probe.pictured, definitions: probe.definitions, lede: probe.lede.slice(0, 24), seal: probe.seal };
      });
    }

    const TOOL_DOORS = ['feed', 'source-inbox', 'levels', 'lessons', 'mock', 'decks', 'kagami', 'grammar', 'thesaurus', 'yoji', 'kanjidex', 'ai', 'airead', 'context-deck'].map((d) => `${d}-link`);
    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`T1-tools-behind-one-button-${label}`, viewport, async (page) => {
        await open(page);
        const served = await page.evaluate((ids) => {
          const shown = (n) => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
          const toggle = document.getElementById('shelf-tools-toggle');
          // the filters fold into the Tools sheet (fix lane rooms, 2026-10-08): when the chip bar is
          // not drawn, nothing may stand between the title block and the first story
          const chipbar = document.querySelector('#shelf-body .shelf-chipbar');
          const chips = shown(chipbar) ? chipbar : document.querySelector('#shelf-body .shelf-masthead');
          const first = document.querySelector('#shelf-reading-results > [data-passage]');
          // every control drawn between the chip bar's foot and the first story's top
          const between = chips && first ? [...document.querySelectorAll('#shelf-body button, #shelf-body a[href], #shelf-body summary')].filter((n) => {
            if (!shown(n) || chips.contains(n) || first.contains(n)) return false;
            const r = n.getBoundingClientRect();
            return r.top >= chips.getBoundingClientRect().bottom - 1 && r.bottom <= first.getBoundingClientRect().top + 1;
          }).map((n) => n.id || n.textContent.trim().slice(0, 16)) : ['(no chip bar or story)'];
          return {
            toggle: toggle && { shown: shown(toggle), expanded: toggle.getAttribute('aria-expanded'), controls: toggle.getAttribute('aria-controls'),
              text: toggle.textContent.replace(/\s+/gu, ' ').trim(), inTitle: !!toggle.closest('.shelf-masthead') },
            doors: ids.filter((id) => document.getElementById(id)).length,
            visibleDoors: ids.filter((id) => shown(document.getElementById(id))),
            between,
          };
        }, TOOL_DOORS);
        assert(served.toggle?.shown && served.toggle.inTitle && /^Tools/u.test(served.toggle.text), `no 学習ツール button in the title block: ${JSON.stringify(served.toggle)}`);
        assert.equal(served.toggle.expanded, 'false', 'the tools panel is open on arrival');
        assert.equal(served.visibleDoors.length, 0, `tool doors visible before the button is pressed: ${served.visibleDoors.join(', ')}`);
        assert.equal(served.between.length, 0, `controls between the filters and the first story: ${served.between.join(', ')}`);
        await page.locator('#shelf-tools-toggle').click();
        const opened = await page.evaluate((ids) => {
          const panel = document.getElementById(document.getElementById('shelf-tools-toggle').getAttribute('aria-controls'));
          const doors = ids.map((id) => document.getElementById(id)).filter(Boolean);
          return {
            expanded: document.getElementById('shelf-tools-toggle').getAttribute('aria-expanded'),
            panel: !!panel && panel.getClientRects().length > 0,
            missing: ids.filter((id) => !document.getElementById(id)),
            tiles: doors.map((door) => {
              const r = door.getBoundingClientRect();
              const ja = door.querySelector('.l-ja');
              const range = document.createRange();
              if (ja) range.selectNodeContents(ja);
              const lines = ja ? new Set([...range.getClientRects()].filter((b) => b.width > 0).map((b) => Math.round(b.top))).size : 0;
              return { id: door.id, inPanel: !!panel?.contains(door), inView: r.width > 0 && r.left >= 0 && r.right <= innerWidth + 0.5,
                ja: ja?.textContent.trim() || '', oneLine: lines === 1, en: door.querySelector('.en-sub')?.textContent.trim() || '',
                name: door.getAttribute('aria-label') || '' };
            }),
          };
        }, TOOL_DOORS);
        assert.equal(opened.expanded, 'true', 'the button does not report the panel open');
        assert(opened.panel, 'the tools panel is not shown');
        assert.deepEqual(opened.missing, [], `the panel is missing doors: ${opened.missing.join(', ')}`);
        const bad = opened.tiles.filter((t) => !t.inPanel || !t.inView || !t.ja || !t.oneLine || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t.ja) || t.name !== t.ja);
        assert.equal(bad.length, 0, `tiles not in the panel, off screen, broken over two lines, or missing their active English accessible name: ${JSON.stringify(bad.slice(0, 3))}`);
        await page.locator('#grammar-link').click();
        await page.waitForFunction(() => document.body.dataset.view === 'grammar');
        return { doors: served.doors, tiles: opened.tiles.length, toggle: served.toggle.text };
      });
    }

    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`M1-title-block-${label}`, viewport, async (page) => {
        await open(page);
        const probe = await page.evaluate(() => {
          const lines = (node) => {
            if (!node) return 0;
            const tops = new Set();
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const text = walker.currentNode;
              if (!text.textContent.trim() || !text.parentElement.getClientRects().length || text.parentElement.closest('details:not([open]) > :not(summary)')) continue;
              const range = document.createRange();
              range.selectNodeContents(text);
              for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top / 4));
            }
            return tops.size;
          };
          const date = document.querySelector('.shelf-dateline .dateline-date');
          const tally = [...document.querySelectorAll('.shelf-dateline :is(.tally-long, .tally-short)')].find((n) => n.getClientRects().length);
          const note = document.querySelector('.shelf-review-note');
          const seal = document.querySelector('.shelf-masthead .shelf-art')?.getBoundingClientRect();
          const why = note?.querySelector('details');
          return { dateTop: Math.round(date?.getBoundingClientRect().top ?? -1), tallyTop: Math.round(tally?.getBoundingClientRect().top ?? -99),
            datelineLines: lines(document.querySelector('.shelf-dateline')), noteLines: lines(note), note: note?.innerText.trim() ?? '',
            why: !!why?.querySelector('summary'), seal: seal ? Math.round(Math.max(seal.width, seal.height)) : 0 };
        });
        assert(Math.abs(probe.dateTop - probe.tallyTop) <= 2 && probe.datelineLines === 1, `date and count are not one line: ${JSON.stringify(probe)}`);
        assert(/Unreviewed/u.test(probe.note) && /\d+.*\d+/u.test(probe.note), `the 未確認 note does not count the pending stories against the total: "${probe.note}"`);
        assert.equal(probe.noteLines, 1, `the 未確認 note runs to ${probe.noteLines} lines: "${probe.note}"`);
        assert(probe.why, 'the 未確認 note has no ⓘ for its longer explanation');
        await page.locator('.shelf-review-note summary').click();
        const explained = await page.evaluate(() => {
          const p = document.querySelector('.shelf-review-note details[open] > p');
          const r = p?.getBoundingClientRect();
          return p ? { text: p.innerText.trim(), inView: r.left >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight } : null;
        });
        assert(explained && explained.text.length > 40 && explained.inView, `the ⓘ opens no readable explanation: ${JSON.stringify(explained)}`);
        assert(probe.seal > 0 && probe.seal <= 48, `the 永 seal is ${probe.seal}px`);
        return { note: probe.note, explanation: explained.text.slice(0, 40), seal: probe.seal };
      });
    }

    /** Everything on the shelf that crosses the screen's side, scrolls sideways, or is cut. */
    const clippedRows = () => {
      const shown = (n) => n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
      const label = (n) => `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}.${[...n.classList].slice(0, 2).join('.')}`;
      const crossing = [...document.querySelectorAll('#shelf-body *')].filter((n) => {
        if (!shown(n) || n.closest('.is-quiet')) return false;
        const r = n.getBoundingClientRect();
        return r.width > 0 && (r.left < -0.5 || r.right > innerWidth + 0.5);
      }).map((n) => `${label(n)} ${Math.round(n.getBoundingClientRect().left)}→${Math.round(n.getBoundingClientRect().right)}`);
      const sideways = [...document.querySelectorAll('#shelf-body, #shelf-body *')].filter((n) => shown(n) &&
        ['auto', 'scroll'].includes(getComputedStyle(n).overflowX) && n.scrollWidth > n.clientWidth + 1).map(label);
      const field = document.querySelector('#search');
      let hint = null;
      if (field) {
        const style = getComputedStyle(field);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const room = field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        hint = { text: field.placeholder, width: Math.ceil(ctx.measureText(field.placeholder).width), room: Math.floor(room) };
      }
      return { crossing: crossing.slice(0, 4), crossingCount: crossing.length, sideways, pageScroll: document.documentElement.scrollWidth > innerWidth + 1, hint };
    };
    for (const [label, viewport] of [['320', NARROW], ['390', PHONE], ['1368', DESK]]) {
      await run(`O1-no-clipped-row-${label}`, viewport, async (page) => {
        await open(page);
        const served = await page.evaluate(clippedRows);
        const toggle = page.locator('#shelf-tools-toggle');
        if (await toggle.count()) await toggle.click();
        const tools = await page.evaluate(clippedRows);
        for (const [state, probe] of [['as served', served], ['tools open', tools]]) {
          assert.equal(probe.crossingCount, 0, `${state}: ${probe.crossingCount} shelf elements cross the screen's side: ${probe.crossing.join(' | ')}`);
          assert.equal(probe.sideways.length, 0, `${state}: rows that scroll sideways: ${probe.sideways.join(', ')}`);
          assert(!probe.pageScroll, `${state}: the page scrolls sideways`);
          assert(probe.hint && probe.hint.width <= probe.hint.room, `${state}: the look-up hint is cut: ${JSON.stringify(probe.hint)}`);
        }
        return { hint: served.hint.text, toolsOpened: await toggle.count() > 0 };
      });
    }

    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`P1-tip-in-the-page-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        const tip = await page.evaluate(() => {
          const node = document.getElementById('reader-tip');
          if (!node) return null;
          const first = document.querySelector('#reader .tok').getBoundingClientRect();
          return { position: getComputedStyle(node).position, bottom: Math.round(node.getBoundingClientRect().bottom), firstTop: Math.round(first.top),
            text: node.innerText.trim() };
        });
        assert(tip, 'no first-visit tip on a first visit');
        assert.equal(tip.text, 'Tap any word for its meaning.', 'the hint is not the plain wording');
        assert(['static', 'relative'].includes(tip.position), `the tip is ${tip.position}, not part of the page`);
        assert(tip.bottom <= tip.firstTop, `the tip ends at ${tip.bottom}px, below the first word's top ${tip.firstTop}px`);
        const covered = [];
        for (const depth of [0, 300, 700, 1200]) {
          await page.evaluate((y) => window.scrollTo(0, y), depth);
          await page.waitForTimeout(120);
          covered.push(...await page.evaluate((y) => [...document.querySelectorAll('#reader .tok')].flatMap((t) => {
            const r = t.getClientRects()[0];
            if (!r || r.bottom <= 0 || r.top >= innerHeight) return [];
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return hit?.closest('#reader-tip') ? [`${t.textContent}@${y}`] : [];
          }), depth));
        }
        assert.equal(covered.length, 0, `words covered by the tip: ${covered.slice(0, 5).join(', ')}`);
        await page.evaluate(() => window.scrollTo(0, 0));
        // the word's distance below the tip: the header may change height when a word is chosen
        // (that is the header's business); the tip must neither leave nor move the text
        const gap = () => {
          const t = document.getElementById('reader-tip');
          const w = document.querySelector('#reader .tok[data-index="1"]').getBoundingClientRect();
          return t ? Math.round(w.top - t.getBoundingClientRect().bottom) : null;
        };
        const before = await page.evaluate(gap);
        await tapToken(page, 1);
        const after = { gap: await page.evaluate(gap), remembered: await page.evaluate(() => localStorage.getItem('kairo-tip-reader-v1')),
          popup: await page.locator('#mini').count(),
          visible: await page.evaluate(() => { const t = document.getElementById('reader-tip'); return !!t && getComputedStyle(t).visibility !== 'hidden' && Number(getComputedStyle(t).opacity) > 0.01; }) };
        assert.equal(after.popup, 1, 'the first tap opened no popup');
        assert(after.gap !== null && Math.abs(after.gap - before) <= 1, `the first tap moved the text under the tip: ${JSON.stringify({ before, ...after })}`);
        assert(!after.visible, 'the hint still shows after the first successful tap');
        assert.equal(after.remembered, '1', 'choosing a word did not remember the tip as seen');
        await openArticle(page, ARTICLE);
        assert.equal(await page.locator('#reader-tip').count(), 0, 'the tip came back on the next visit');
        await page.evaluate(() => localStorage.removeItem('kairo-tip-reader-v1'));
        await openArticle(page, THREE_PARAS);
        await page.locator('#reader-tip .reader-tip-close').click();
        const dismissed = await page.evaluate((key) => ({ tip: !!document.getElementById('reader-tip'), remembered: localStorage.getItem(key) }), 'kairo-tip-reader-v1');
        assert(!dismissed.tip && dismissed.remembered === '1', `the × did not dismiss and remember the tip: ${JSON.stringify(dismissed)}`);
        return { position: tip.position, gapAboveText: tip.firstTop - tip.bottom, text: tip.text };
      });
    }

    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`W1-damascus-can-be-saved-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        await page.locator('#reader .tok[data-index="0"]').click();
        await page.waitForSelector('#mini #mini-take');
        const probe = await page.evaluate(() => {
          const seal = document.querySelector('#mini #mini-take');
          return { word: document.querySelector('#mini .mini-word')?.textContent, reading: document.querySelector('#mini .mini-reading')?.textContent,
            disabled: seal.disabled, held: seal.classList.contains('reader-capture-held'), opacity: Number(getComputedStyle(seal).opacity),
            reason: document.querySelector('#mini .mini-take-reason')?.textContent.trim() ?? null };
        });
        assert.equal(probe.word, 'ダマスカス', `the fixture's first word is ${probe.word}`);
        assert(!probe.disabled && !probe.held && probe.opacity >= 0.9 && probe.reason === null,
          `ダマスカス (read だますかす in the article, ダマスカス in the dictionary: one reading) cannot be saved: ${JSON.stringify(probe)}`);
        await page.locator('#mini #mini-take').click();
        const record = await waitForAppRecord(page, (r) => r.taken.some((t) => t.t === 'word' && t.id === 'ダマスカス'), { description: 'ダマスカス saved in one press' });
        // the durable write lands a beat before the app repaints its button: wait for the page, then read it
        await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5_000 }).catch(() => {});
        const saved = await page.evaluate(() => ({ label: document.querySelector('#mini #mini-take')?.textContent, pressed: document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed'),
          window: [...document.querySelectorAll('dialog[open], [role="dialog"]:not(#mini)')].some((n) => n.getClientRects().length > 0) }));
        const cards = record.taken.filter((t) => t.t === 'word' && t.id === 'ダマスカス').length;
        assert(saved.label === 'Saved ✓' && saved.pressed === 'true' && !saved.window && cards === 1, `one press did not save ダマスカス once: ${JSON.stringify({ ...saved, cards })}`);
        return { reading: probe.reading, saved: saved.label, cards };
      });
    }

    // the popup's one-tap Save; then 全項目 from the same popup
    const saveFromQuickLook = async (page) => {
      await page.locator('#reader .tok[data-index="0"]').click();
      await page.waitForSelector('#mini #mini-take:not([disabled])');
      await page.locator('#mini #mini-take').click();
      await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5_000 });
    };
    const fullEntryState = (page) => page.evaluate(() => {
      const take = document.querySelector('#sheet #take');
      return { take: take && { pressed: take.getAttribute('aria-pressed'), disabled: take.disabled, held: take.classList.contains('word-capture-held') },
        note: document.querySelector('#word-capture-note')?.textContent.trim() ?? null, replace: !!document.querySelector('#word-capture-replace') };
    });
    await run('W2-one-word-one-card', DESK, async (page) => {
      // quick look first, then 全項目
      await openArticle(page, ARTICLE);
      await saveFromQuickLook(page);
      await page.locator('#mini .mini-entry').click();
      await page.waitForSelector('#sheet #take');
      const full = await fullEntryState(page);
      assert(full.take?.pressed === 'true' && !full.take.disabled && !full.take.held && full.note === null && !full.replace,
        `saved from the quick look, 全項目 does not show it saved: ${JSON.stringify(full)}`);
      return { full };
    });
    // 全項目 first, then the quick look (a fresh context: a fresh record)
    await run('W2-one-word-one-card-reverse', DESK, async (page) => {
      await openArticle(page, ARTICLE);
      await page.locator('#reader .tok[data-index="0"]').click();
      await page.waitForSelector('#mini .mini-entry');
      await page.locator('#mini .mini-entry').click();
      await page.waitForSelector('#sheet #take:not([disabled])');
      await page.locator('#sheet #take').click();
      await page.waitForFunction(() => document.querySelector('#sheet #take')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5_000 });
      await page.locator('#sheet-close').click();
      await page.waitForFunction(() => !document.querySelector('#sheet'), null, { timeout: 5_000 });
      await page.locator('#reader .tok[data-index="0"]').click();
      await page.waitForSelector('#mini #mini-take');
      const quick = await page.evaluate(() => {
        const seal = document.querySelector('#mini #mini-take');
        return { pressed: seal.getAttribute('aria-pressed'), disabled: seal.disabled, held: seal.classList.contains('reader-capture-held'),
          reason: document.querySelector('#mini #mini-take-reason')?.textContent.trim() ?? null, open: !!document.querySelector('#mini #mini-take-open') };
      });
      assert(quick.pressed === 'true' && !quick.disabled && !quick.held && quick.reason === null && !quick.open,
        `saved in 全項目, the quick look does not show it saved: ${JSON.stringify(quick)}`);
      return { quick };
    });

    // the reader's word doors (reader lane, 2026-10-02): one tap is the meaning, the menu saves, Save is one tap
    const SUBURB = 1; // 郊外, the fixture's second word: a core dictionary word read こうがい, "suburb"
    const popupState = (page) => page.evaluate(() => {
      const mini = document.getElementById('mini');
      if (!mini) return null;
      const box = mini.getBoundingClientRect(), take = mini.querySelector('#mini-take'), entry = mini.querySelector('.mini-entry');
      return { word: mini.querySelector('.mini-word')?.textContent, reading: mini.querySelector('.mini-reading')?.textContent,
        gloss: mini.querySelector('.mini-gloss')?.textContent, save: take && { label: take.textContent, disabled: take.disabled,
          filled: getComputedStyle(take).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(take).backgroundColor !== 'transparent' },
        entry: entry && { label: entry.textContent, disabled: entry.disabled },
        inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        underWord: document.querySelectorAll('#reader .tok-en').length };
    });
    const cardsFor = (record, id) => record.taken.filter((t) => t.t === 'word' && t.id === id);
    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`G1-one-tap-meaning-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        await tapToken(page, SUBURB);
        const one = await popupState(page);
        assert(one, 'one tap opened no popup');
        assert.deepEqual([one.word, one.reading, one.gloss], ['郊外', 'こうがい', 'suburb'], `one tap does not show the word, reading and meaning: ${JSON.stringify(one)}`);
        assert(one.save?.label === 'Save' && !one.save.disabled && one.save.filled, `no filled Save: ${JSON.stringify(one.save)}`);
        assert(/^Full entry\s*›$/u.test(one.entry?.label ?? '') && !one.entry.disabled, `no Full entry › link: ${JSON.stringify(one.entry)}`);
        assert(one.inside && one.underWord === 0, `the popup is off screen, or English was written under the word: ${JSON.stringify(one)}`);
        await tapToken(page, 2);
        const moved = await page.evaluate(() => ({ count: document.querySelectorAll('#mini').length, word: document.querySelector('#mini .mini-word')?.textContent }));
        const third = await page.evaluate(() => document.querySelector('#reader .tok[data-index="2"] .tok-word')?.textContent.replace(/\s/gu, ''));
        assert(moved.count === 1 && moved.word && moved.word !== '郊外' && third.includes(moved.word.slice(0, 1)), `another word did not move the popup: ${JSON.stringify({ moved, third })}`);
        await page.locator('#reader .tok[data-index="2"]').focus();
        await page.keyboard.press('Escape');
        const closed = await page.evaluate(() => ({ mini: !!document.getElementById('mini'), focus: document.activeElement?.dataset.index }));
        assert(!closed.mini && closed.focus === '2', `Escape did not put the popup away and keep the word: ${JSON.stringify(closed)}`);
        return { popup: [one.word, one.reading, one.gloss], moved: moved.word };
      });
    }

    await run('G2-menu-save-one-card', DESK, async (page) => {
      await openArticle(page, ARTICLE);
      const tok = page.locator(`#reader .tok[data-index="${SUBURB}"]`);
      await tok.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      const at = await tok.evaluate((node) => { const r = node.getClientRects()[0]; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await page.mouse.click(at.x, at.y, { button: 'right' });
      await page.waitForSelector('#reader-word-menu');
      const menu = await page.evaluate(() => {
        const node = document.getElementById('reader-word-menu'), box = node.getBoundingClientRect();
        return { role: node.getAttribute('role'), items: [...node.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent), left: box.left, top: box.top };
      });
      assert.deepEqual(menu.items, ['Save word', 'Save the sentence', 'Full entry', 'Ask the tutor about this sentence', 'Copy'], `the word menu: ${JSON.stringify(menu.items)}`);
      assert(menu.role === 'menu' && Math.abs(menu.left - at.x) <= 2 && Math.abs(menu.top - at.y) <= 2, `the menu is not at the pointer: ${JSON.stringify({ menu, at })}`);
      await page.locator('#reader-word-menu [data-menu-action="save-word"]').click();
      const record = await waitForAppRecord(page, (r) => cardsFor(r, '郊外').length > 0, { description: '郊外 saved from the menu' });
      await page.waitForFunction(() => !!document.querySelector('#reader-toast:not([hidden])'), null, { timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(300);
      const after = await readAppRecord(page);
      const cards = cardsFor(after, '郊外');
      assert.equal(cards.length, 1, `the menu made ${cards.length} 郊外 cards`);
      assert(cards[0].ctx?.scope === 'sent' && cards[0].ctx.p === ARTICLE && cards[0].ctx.i === SUBURB, `the card lost its sentence: ${JSON.stringify(cards[0])}`);
      const toast = await page.evaluate(() => { const t = document.querySelector('#reader-toast:not([hidden])'); return t && { text: t.innerText.replace(/\s+/gu, ' ').trim(), role: t.getAttribute('role'), live: t.getAttribute('aria-live') }; });
      assert(toast && /^Saved to review\b/u.test(toast.text) && toast.role === 'status' && toast.live === 'polite', `no polite toast: ${JSON.stringify(toast)}`);
      assert.equal(await page.locator('#reader-word-menu').count(), 0, 'the menu stayed open after Save word');
      await page.mouse.click(at.x, at.y, { button: 'right' });
      await page.waitForSelector('#reader-word-menu');
      const again = await page.evaluate(() => { const item = document.querySelector('#reader-word-menu [data-menu-action="save-word"]'); return { label: item.textContent, disabled: item.getAttribute('aria-disabled') }; });
      assert.deepEqual(again, { label: 'Saved ✓', disabled: 'true' }, `the menu does not show the word saved: ${JSON.stringify(again)}`);
      await page.keyboard.press('Escape');
      // the browser keeps its own menu off the words
      const offWord = await page.evaluate(() => {
        const title = document.querySelector('h1.view-title');
        const event = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
        return title.dispatchEvent(event);
      });
      assert.equal(offWord, true, 'a right-click off the words lost the browser menu');
      return { items: menu.items.length, cards: cards.length, ctx: cards[0].ctx, srs: !!record.srs, toast: toast.text };
    });

    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`G3-save-and-undo-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        await tapToken(page, SUBURB);
        await page.locator('#mini #mini-take').click();
        await waitForAppRecord(page, (r) => cardsFor(r, '郊外').length === 1, { description: 'one press saves 郊外' });
        // the durable write lands a beat before the app repaints its button and raises the toast: wait for the page
        await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'true'
          && !!document.querySelector('#reader-toast:not([hidden])'), null, { timeout: 5_000 }).catch(() => {});
        const saved = await page.evaluate(() => ({ label: document.querySelector('#mini #mini-take')?.textContent, pressed: document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed'),
          window: !!document.querySelector('#vocabulary-list-dialog, dialog[open]'),
          toast: document.querySelector('#reader-toast:not([hidden])')?.innerText.replace(/\s+/gu, ' ').trim() ?? null,
          role: document.querySelector('#reader-toast')?.getAttribute('role') }));
        assert(saved.label === 'Saved ✓' && saved.pressed === 'true' && !saved.window, `one press did not save in place: ${JSON.stringify(saved)}`);
        assert(saved.toast === 'Saved to review Undo' && saved.role === 'status', `the toast: ${JSON.stringify(saved)}`);
        await page.locator('#reader-toast-action').click();
        const undone = await waitForAppRecord(page, (r) => cardsFor(r, '郊外').length === 0, { description: 'Undo takes the card out' });
        await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5_000 }).catch(() => {});
        const label2 = await page.locator('#mini #mini-take').textContent();
        assert.equal(label2, 'Save', 'after Undo the button does not read Save');
        return { saved: saved.label, toast: saved.toast, afterUndo: cardsFor(undone, '郊外').length };
      });
    }

    await run('G4-keyboard-menu', DESK, async (page) => {
      await openArticle(page, ARTICLE);
      const word = page.locator(`#reader .tok[data-index="${SUBURB}"]`);
      await word.focus();
      await page.keyboard.press('Shift+F10');
      await page.waitForSelector('#reader-word-menu');
      const first = await page.evaluate(() => document.activeElement?.dataset.menuAction);
      await page.keyboard.press('ArrowDown');
      const second = await page.evaluate(() => document.activeElement?.dataset.menuAction);
      await page.keyboard.press('Escape');
      const back = await page.evaluate(() => ({ menu: !!document.getElementById('reader-word-menu'), focus: document.activeElement?.dataset.index }));
      assert.deepEqual([first, second, back.menu, back.focus], ['save-word', 'save-sentence', false, String(1)], `Shift+F10, ↓, Escape: ${JSON.stringify({ first, second, back })}`);
      await page.keyboard.press('ContextMenu');
      const byKey = await page.evaluate(() => document.activeElement?.closest('#reader-word-menu') ? document.activeElement.dataset.menuAction : null);
      assert.equal(byKey, 'save-word', 'the ContextMenu key did not open the menu');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#mini');
      const popup = await page.evaluate(() => document.activeElement?.id);
      await page.keyboard.press('Escape');
      const after = await page.evaluate(() => ({ mini: !!document.getElementById('mini'), focus: document.activeElement?.dataset.index }));
      assert(popup === 'mini-take' && !after.mini && after.focus === String(1), `Enter, then Escape: ${JSON.stringify({ popup, after })}`);
      return { first, second, popupFocus: popup };
    });

    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`G5-lists-popover-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        await tapToken(page, SUBURB);
        // one path (round 4, T5): the popup offers no list before Save; after it, Add to a list stands beside Saved ✓
        assert.equal(await page.locator('#mini #mini-lists').isVisible(), false, 'the popup offers a list before the word is saved');
        await page.locator('#mini #mini-take').click();
        await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5_000 });
        await page.locator('#mini #mini-lists').click();
        await page.waitForSelector('#vocabulary-list-popover');
        const shape = await page.evaluate(() => {
          const pop = document.getElementById('vocabulary-list-popover'), box = pop.getBoundingClientRect(), link = document.getElementById('mini-lists').getBoundingClientRect();
          return { modal: !!document.querySelector('dialog[open], #vocabulary-list-dialog'), width: Math.round(box.width), height: Math.round(box.height),
            bottom: Math.round(box.bottom), left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top), linkBottom: Math.round(link.bottom),
            viewport: [innerWidth, innerHeight], fixed: getComputedStyle(pop).position };
        });
        assert(!shape.modal && shape.fixed === 'fixed', `the lists open as a window: ${JSON.stringify(shape)}`);
        if (label === '1368') assert(shape.width <= 340 && Math.abs(shape.top - shape.linkBottom) <= 12, `not a compact popover beside its link: ${JSON.stringify(shape)}`);
        else assert(shape.left === 0 && shape.right === shape.viewport[0] && Math.abs(shape.bottom - shape.viewport[1]) <= 1 && shape.height <= shape.viewport[1] * 0.62 + 1,
          `not a short sheet at the foot: ${JSON.stringify(shape)}`);
        await page.locator('#vocabulary-list-name').fill('Syria');
        await page.locator('#vocabulary-list-create').click();
        await waitForAppRecord(page, (r) => r.lists?.Syria?.some((m) => m.t === 'word' && m.id === '郊外') && cardsFor(r, '郊外').length === 1,
          { description: 'a new list holding 郊外, and its one card' });
        const box = page.locator('#vocabulary-list-popover input[data-list="Syria"]');
        assert(await box.isChecked(), 'the new list is not ticked');
        await box.uncheck();
        const off = await waitForAppRecord(page, (r) => r.lists?.Syria && !r.lists.Syria.some((m) => m.id === '郊外'), { description: '郊外 off the list' });
        assert.equal(cardsFor(off, '郊外').length, 1, 'taking it off a list removed the card');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#vocabulary-list-popover').count(), 0, 'Escape left the popover open');
        return shape;
      });
    }

    // the galaxy's own way to a word's entry is its tap ladder; the entry's example words open the same popup
    await run('G5-galaxy-one-path', PHONE, async (page) => {
      await page.goto(`${host.origin}/?entry=drift&ui=bi`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await page.waitForSelector('#drift-layer.active .word');
      await page.waitForTimeout(2300);
      let taps = 0;
      for (; taps < 12 && !(await page.locator('#sheet').count()); taps += 1) {
        const at = await page.evaluate(() => {
          let word = document.querySelector('#drift-layer .word[data-one-path]');
          if (!word?.getBoundingClientRect().width) {
            word = [...document.querySelectorAll('#drift-layer .word')].find((node) => {
              const r = node.getBoundingClientRect();
              return r.width && /[\u4e00-\u9fff]/u.test(node.textContent) && parseFloat(node.style.opacity || '1') > 0.5
                && r.left > 60 && r.right < innerWidth - 60 && r.top > 260 && r.bottom < innerHeight - 200;
            });
            if (word) word.dataset.onePath = '1';
          }
          const r = word?.getBoundingClientRect();
          return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
        });
        if (at) await page.mouse.click(at.x, at.y);
        await page.waitForTimeout(700);
      }
      const entry = await page.evaluate(() => ({ view: document.body.dataset.view, node: document.querySelector('#sheet')?.dataset.node ?? null }));
      assert(entry.view === 'drift' && entry.node?.startsWith('word:'), `the galaxy's taps did not open a word's entry over the sky: ${JSON.stringify({ taps, entry })}`);
      await page.waitForFunction(() => document.querySelectorAll('#sheet .example .sentence-tok').length > 0);
      await page.waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(400);
      const path = () => page.evaluate(() => {
        const mini = document.getElementById('mini'), take = mini?.querySelector('#mini-take'), lists = mini?.querySelector('#mini-lists');
        const shown = (node) => !!node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
        return { view: document.body.dataset.view, word: mini?.querySelector('.mini-word')?.textContent ?? null, save: take?.textContent ?? null,
          pressed: take?.getAttribute('aria-pressed') ?? null, held: take?.disabled ?? null, hasList: !!lists, list: shown(lists), note: shown(mini?.querySelector('.mini-take-note')) };
      });
      // a word of an example sentence whose Save is live and not yet pressed
      let before = null;
      const tokens = page.locator('#sheet .example .sentence-tok');
      for (let i = 0, n = Math.min(await tokens.count(), 30); i < n && !before; i += 1) {
        await tokens.nth(i).scrollIntoViewIfNeeded();
        await tokens.nth(i).click();
        await page.waitForTimeout(250);
        const seen = await path();
        if (seen.hasList && seen.held === false && seen.pressed === 'false') before = seen;
        else await page.keyboard.press('Escape');
      }
      assert(before, 'no example word in the galaxy entry offers a live, unpressed Save');
      assert(before.view === 'drift' && before.save === 'Save' && !before.list && before.note, `the galaxy popup offers a list before the word is saved: ${JSON.stringify(before)}`);
      await page.locator('#mini #mini-take').click();
      await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5_000 });
      await waitForAppRecord(page, (r) => cardsFor(r, before.word).length === 1, { description: 'the galaxy popup saved one card' });
      const saved = await path();
      assert(saved.save === 'Saved ✓' && saved.list && !saved.note, `after Save the galaxy popup does not offer the list: ${JSON.stringify(saved)}`);
      await page.locator('#reader-toast-action').click();
      await waitForAppRecord(page, (r) => cardsFor(r, before.word).length === 0, { description: 'Undo takes the card out' });
      await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5_000 });
      const undone = await path();
      assert(undone.save === 'Save' && !undone.list && undone.note, `after Undo the galaxy popup still offers a list: ${JSON.stringify(undone)}`);
      return { taps, entry: entry.node, word: before.word, before, saved, undone };
    });

    await run('G6-sentence-row', DESK, async (page) => {
      await openArticle(page, ARTICLE);
      await tapToken(page, SUBURB);
      const row = await page.evaluate(() => ({
        bar: [...document.querySelectorAll('.teacher-door, #reader-context-save, #reader-teacher, #reader-sentence-practice')]
          .filter((n) => !n.closest('#mini') && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden').length,
        label: document.querySelector('#mini .mini-sentence .mini-sentence-label')?.innerText.trim() ?? null,
        quote: document.querySelector('#mini .mini-sentence .mini-sentence-quote')?.textContent ?? null,
      }));
      assert.equal(row.bar, 0, 'a sentence bar shows when a word is chosen');
      // one named door (round 4, T5): it names itself and shows the sentence's own start
      assert.equal(row.label, 'Study this sentence', `the popup's sentence door: ${JSON.stringify(row)}`);
      assert(row.quote?.startsWith('ダマスカス郊外'), `the door does not show its sentence: ${JSON.stringify(row)}`);
      await page.locator('#mini #mini-sentence-open').click();
      const pane = await page.evaluate(() => ({
        marked: document.querySelector('#mini .mini-sentence-pane:not([hidden]) .mini-sentence-full mark')?.textContent ?? null,
        choices: [...document.querySelectorAll('#mini .mini-sentence-pane .mini-sentence-action-name')].map((n) => n.textContent),
        keep: document.querySelector('#mini .mini-sentence-pane #reader-context-save .mini-sentence-keep-name')?.textContent ?? null,
      }));
      assert.deepEqual([pane.marked, pane.choices, pane.keep], ['郊外', ['Ask the tutor', 'Practice it'], 'Save the sentence'], `the sentence pane: ${JSON.stringify(pane)}`);
      // the sentence's own Save keeps it on the tutor page, in the reader, without making it the active sentence
      const unkept = await readAppRecord(page);
      await page.locator('#mini #reader-context-save').click();
      const kept = await waitForAppRecord(page, (r) => (r.teacherContexts?.entries || []).some((entry) => entry.sourceId === ARTICLE && entry.quote?.startsWith('ダマスカス郊外')),
        { description: 'the sentence kept on the tutor page' });
      assert.equal(kept.teacherContexts.activeRef ?? null, unkept.teacherContexts?.activeRef ?? null, 'Save the sentence made it the active sentence');
      assert.equal(await page.evaluate(() => document.body.dataset.view), 'reader', 'Save the sentence left the reader');
      await page.locator('#mini #reader-teacher').click();
      await page.waitForFunction(() => document.body.dataset.view === 'ai');
      const record = await readAppRecord(page);
      const active = record.teacherContexts?.entries?.find((entry) => entry.id === record.teacherContexts.activeRef);
      assert(active?.sourceId === ARTICLE && active.quote.startsWith('ダマスカス郊外') && active.target?.id === '郊外',
        `the tutor did not open on that sentence: ${JSON.stringify(active)}`);
      return { door: row.label, pane, quote: active.quote.slice(0, 20) };
    });

    for (const [label, viewport] of [['390', PHONE], ['320', NARROW]]) {
      await run(`G6-sentence-pane-seat-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        await tapToken(page, SUBURB);
        const box = () => page.locator('#mini').evaluate((node) => {
          const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height,
            clipped: !!node.style.maxHeight, side: node.dataset.side,
            chromeBottom: document.querySelector('#app > .chrome')?.getBoundingClientRect().bottom };
        });
        const focused = () => page.evaluate(() => {
          const mini = document.querySelector('#mini'), active = document.activeElement;
          const r = active.getBoundingClientRect(), m = mini.getBoundingClientRect();
          return { id: active.id, inside: mini.contains(active), scrollY,
            control: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
            popup: { top: m.top, bottom: m.bottom, left: m.left, right: m.right } };
        });
        const assertFocus = (seen, beforeScroll, expectedId = null) => {
          assert(seen.inside, `the focused sentence control must be inside the popup: ${JSON.stringify(seen)}`);
          if (expectedId) assert.equal(seen.id, expectedId, 'The sentence control keeps the intended focus');
          assert(seen.control.top >= seen.popup.top - 1 && seen.control.bottom <= seen.popup.bottom + 1
            && seen.control.left >= seen.popup.left - 1 && seen.control.right <= seen.popup.right + 1,
          `the focused sentence action must be wholly visible inside the popup: ${JSON.stringify(seen)}`);
          assert.equal(seen.scrollY, beforeScroll, 'Opening and focusing the sentence must not move the article scroll');
        };
        const word = await box();
        if (word.clipped && word.side === 'above') assert(Math.abs(word.top - word.chromeBottom) <= 1,
          'A clipped word card must meet the chrome edge, leaving no strip of cut title glyphs');
        const beforeScroll = await page.evaluate(() => scrollY);
        await page.locator('#mini #mini-sentence-open').click();
        await page.waitForTimeout(200); // ResizeObserver has placed the settled sentence view.
        const sentence = await box();
        const focus = await focused();
        assert(Math.abs(sentence.top - word.top) <= 1, `opening the sentence moved the card's top edge: ${JSON.stringify({ word, sentence })}`);
        assert(sentence.bottom <= viewport.height, `the sentence card falls outside the screen: ${JSON.stringify(sentence)}`);
        assertFocus(focus, beforeScroll);
        await page.keyboard.press('Tab');
        const askFocus = await focused();
        assertFocus(askFocus, beforeScroll, 'reader-teacher');
        assert.equal(await page.locator('#mini .mini-sentence-full mark').textContent(), '郊外');
        assert.equal(await page.locator('#mini #mini-take').isVisible(), false, 'The sentence view still offers the word Save');
        const before = await readAppRecord(page);
        await page.locator('#mini #reader-context-save').click();
        const kept = await waitForAppRecord(page, (r) => (r.teacherContexts?.entries || []).some((entry) => entry.sourceId === ARTICLE && entry.quote?.startsWith('ダマスカス郊外')));
        assert.equal(kept.teacherContexts.entries.filter((entry) => entry.sourceId === ARTICLE && entry.quote?.startsWith('ダマスカス郊外')).length, 1, 'Save the sentence keeps exactly one tutor entry');
        assert.equal(kept.teacherContexts.activeRef ?? null, before.teacherContexts?.activeRef ?? null, 'Save the sentence must not activate it');
        assert.equal(await page.evaluate(() => document.body.dataset.view), 'reader', 'Save the sentence must stay in the reader');
        await page.locator('#mini #mini-sentence-back').click();
        assert.equal(await page.locator('#mini #mini-take').isVisible(), true, 'Back to the word restores its Save');
        assert.equal(await page.locator('#mini .mini-sentence-pane').isVisible(), false, 'Back to the word hides the sentence view');
        // その has no kanji band: its shorter word card exposes the sentence view's clipped-focus regression.
        await tapToken(page, 12); // tapToken centers the real article token before opening its word popup.
        const shortWord = await box();
        const shortScroll = await page.evaluate(() => scrollY);
        await page.locator('#mini #mini-sentence-open').click();
        await page.waitForTimeout(200);
        const shortSentence = await box();
        const shortFocus = await focused();
        assert(Math.abs(shortSentence.top - shortWord.top) <= 1, `the shorter word card's sentence moved its top: ${JSON.stringify({ shortWord, shortSentence })}`);
        assertFocus(shortFocus, shortScroll);
        await page.keyboard.press('Tab');
        const shortAskFocus = await focused();
        assertFocus(shortAskFocus, shortScroll, 'reader-teacher');
        await page.keyboard.press('Tab');
        const practiceFocus = await focused();
        assertFocus(practiceFocus, shortScroll, 'reader-sentence-practice');
        await page.locator('#mini #reader-sentence-practice').click();
        await page.waitForFunction(() => document.body.dataset.view === 'sentence-practice');
        await page.locator('#sentence-practice-back').click();
        await page.waitForFunction(() => document.body.dataset.view === 'reader' && document.activeElement?.id === 'reader-sentence-practice');
        await page.waitForTimeout(200);
        const returnedFocus = await focused();
        assertFocus(returnedFocus, shortScroll, 'reader-sentence-practice');
        return { word, sentence, focus, askFocus, shortWord, shortSentence, shortFocus, shortAskFocus, practiceFocus, returnedFocus, kept: 1, activeRef: kept.teacherContexts.activeRef ?? null };
      });

      await run(`G6-sentence-return-motion-${label}`, viewport, async (page) => {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await openArticle(page, ARTICLE);
        const putAway = async () => {
          if (!await page.locator('#mini').count()) return;
          await page.locator('#mini').focus();
          await page.keyboard.press('Escape');
        };
        // の is a particle; ダマスカス is a name, whose popup opens through the lookup door once its dictionary
        // rows are in; その is a content word. All three must come back the same way.
        const problems = [], returns = {};
        for (const [index, text] of [[4, 'の'], [0, 'ダマスカス'], [12, 'その']]) {
          await tapToken(page, index);
          await page.waitForSelector('#mini #mini-sentence-open');
          await page.waitForTimeout(400); // the card has finished rising
          const left = await popupSeat(page);
          assert.equal(left.word, text, `token ${index} of the fixture article`);
          await page.locator('#mini #mini-sentence-open').click();
          await page.locator('#mini #reader-sentence-practice').click();
          await page.waitForFunction(() => document.body.dataset.view === 'sentence-practice');
          await page.locator('#sentence-practice-back').click();
          await page.waitForFunction(() => document.body.dataset.view === 'reader');
          await page.waitForFunction(() => document.activeElement?.id === 'reader-sentence-practice', null, { timeout: 5_000 })
            .catch(() => {});
          await page.waitForTimeout(400);
          const focus = await popupFocus(page);
          const returned = await page.locator('#mini').count() ? await popupSeat(page) : null;
          returns[text] = { focus, returned };
          if (focus.id !== 'reader-sentence-practice' || !focus.inside || !focus.shown) problems.push(`${text}: Practice is not focused and wholly visible inside the popup: ${JSON.stringify(focus)}`);
          if (focus.scrollY !== left.scrollY) problems.push(`${text}: the article moved from ${left.scrollY} to ${focus.scrollY}`);
          if (!returned?.sentence || returned.word !== text) problems.push(`${text}: its sentence pane did not reopen: ${JSON.stringify(returned)}`);
          else {
            await page.locator('#mini #mini-sentence-back').click();
            await page.waitForTimeout(200);
            const word = await popupSeat(page);
            returns[text].word = word;
            if (word.sentence || Math.abs(returned.top - word.top) > 1) problems.push(`${text}: the returned sentence card is off the word card's seat: ${JSON.stringify({ returned, word })}`);
          }
          await putAway();
        }
        // その once more: its sentence is opened by a second tap while the card is still rising
        await tapToken(page, 12);
        await page.waitForSelector('#mini #mini-sentence-open');
        await page.waitForTimeout(400);
        const settled = await popupSeat(page);
        await putAway();
        const point = (selector) => page.locator(selector).evaluate((node) => { const r = node.getClientRects()[0]; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        const tok = await point('#reader .tok[data-index="12"]');
        await page.mouse.click(tok.x, tok.y);
        const door = await point('#mini #mini-sentence-open');
        await page.mouse.click(door.x, door.y);
        await page.waitForFunction(() => document.querySelector('#mini .mini-sentence-pane')?.hidden === false);
        await page.waitForTimeout(500);
        const rising = await popupSeat(page);
        if (rising.scrollY !== settled.scrollY || !rising.sentence || Math.abs(rising.top - settled.top) > 1) {
          problems.push(`その: a sentence opened while the card rises is off the word card's seat: ${JSON.stringify({ settled, rising })}`);
        }
        assert.deepEqual(problems, [], 'Returning from Practice, and opening a sentence while the card rises, must land on the sentence pane at the word card\'s seat');
        return { returns, settled, rising };
      });
    }

    await run('G7-version-switch', DESK, async (page) => {
      await openArticle(page, ARTICLE);
      const read = () => page.evaluate(() => ({
        choices: [...document.querySelectorAll('.version-toggle .version-choice')].map((b) => [b.innerText.replace(/\s+/gu, ' ').trim(), b.getAttribute('aria-pressed')]),
        caption: document.querySelector('.version-caption')?.textContent ?? null,
      }));
      const shown = await read();
      assert.deepEqual(shown.choices, [['Original · N1', 'true'], ['Simplified · N3', 'false']], `the switch: ${JSON.stringify(shown.choices)}`);
      // round 4 (John T4, "the explanaiton (that is too verbose"): the note behind the switch's ⓘ is one short line
      assert.equal(shown.caption, 'Simplified: the same story in easier Japanese.');
      await page.locator('.version-toggle .version-choice[aria-pressed="false"]').click();
      await page.waitForFunction(() => document.querySelector('.version-toggle .version-choice[aria-pressed="true"]')?.innerText.includes('Simplified'));
      await openArticle(page, THREE_PARAS);
      const none = await read();
      assert(none.choices.length === 0 && none.caption === null, `an article without a simplified version shows the switch: ${JSON.stringify(none)}`);
      return shown;
    });
    // round 4 review: on a phone each side of the switch and its ⓘ keep the 44px hit floor
    for (const [label, viewport] of [['390', PHONE], ['320', NARROW]]) {
      await run(`G7-version-switch-hit-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        const boxes = await page.evaluate(() => [...document.querySelectorAll('.version-toggle .version-choice, .version-toggle .version-help > summary')]
          .map((n) => { const r = n.getBoundingClientRect(); return { name: n.innerText.replace(/\s+/gu, ' ').trim() || n.getAttribute('aria-label'), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; }));
        assert.equal(boxes.length, 3, `the switch's controls: ${JSON.stringify(boxes)}`);
        for (const box of boxes) assert(box.w >= 44 && box.h >= 44, `a control of the version switch is under 44px: ${JSON.stringify(box)}`);
        return boxes;
      });
    }

    for (const [label, viewport] of [['390', PHONE], ['320', NARROW]]) {
      await run(`G8-reader-popup-motion-${label}`, viewport, async (page) => {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await openArticle(page, ARTICLE);
        await tapToken(page, SUBURB);
        const word = await page.evaluate(measureReaderMotion);
        assert(word.nodes > 100 && word.transitions > 0 && word.animations > 0, `motion check did not observe the reader and popup: ${JSON.stringify(word)}`);
        for (const group of ['topBar', 'tabBar', 'titleCard', 'bookmark', 'playBar', 'words', 'finished', 'popup']) {
          assert(word.covered[group] > 0, `motion check did not observe the reader's ${group}: ${JSON.stringify(word.covered)}`);
        }
        assert.deepEqual(word.violations, [], 'Reader and word popup may animate only transform and opacity');
        await page.locator('#mini #mini-sentence-open').click();
        const sentence = await page.evaluate(measureReaderMotion);
        assert.deepEqual(sentence.violations, [], 'The sentence popup may animate only transform and opacity');
        // the popup's own path, by its public controls: Save, its toast, then Add to a list and the sheet's Add
        await page.locator('#mini #mini-sentence-back').click();
        await page.locator('#mini #mini-take').click();
        await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5_000 });
        await page.waitForSelector('#reader-toast:not([hidden])');
        const saved = await page.evaluate(measureReaderMotion);
        assert(saved.covered.toast === 1 && saved.animations > word.animations - 1, `motion check did not observe the Save toast: ${JSON.stringify(saved.covered)}`);
        assert.deepEqual(saved.violations, [], 'The saved popup and its toast may animate only transform and opacity');
        await page.locator('#mini #mini-lists').click();
        await page.waitForSelector('#vocabulary-list-popover #vocabulary-list-create');
        const lists = await page.evaluate(measureReaderMotion);
        assert.equal(lists.covered.listAdd, 1, `motion check did not observe the list sheet's Add: ${JSON.stringify(lists.covered)}`);
        assert.deepEqual(lists.violations, [], 'The list sheet may animate only transform and opacity');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await page.locator('#dials-toggle').click();
        await page.waitForSelector('.dials .seg button');
        const settings = await page.evaluate(measureReaderMotion);
        assert(settings.covered.settings > 0, `motion check did not observe the text settings: ${JSON.stringify(settings.covered)}`);
        assert.deepEqual(settings.violations, [], 'The text settings may animate only transform and opacity');
        await page.locator('#dials-toggle').click();
        await page.locator(`#reader .tok[data-index="${SUBURB}"]`).focus();
        await page.keyboard.press('Shift+F10');
        await page.waitForSelector('#reader-word-menu');
        const menu = await page.evaluate(measureReaderMotion);
        assert.equal(menu.covered.menu, 1, `motion check did not observe the word menu: ${JSON.stringify(menu.covered)}`);
        assert.deepEqual(menu.violations, [], 'The word menu may animate only transform and opacity');
        return { word, sentence, saved, lists, settings, menu };
      });

      await run(`G9-japanese-line-breaks-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        await page.evaluate(() => document.fonts.ready);
        const title = await page.evaluate(measureJapaneseBreaks, '.reader-card h1.view-title');
        const article = await page.evaluate(measureJapaneseBreaks, '#reader');
        assert.equal(title.text, fixtureArticle.title, 'Lookup preserves the exact Japanese title');
        assert.equal(article.text, fixtureArticle.tokens.map((token) => token.s).join(''), 'Kinsoku preserves the exact article text');
        assert(title.openings > 0 && title.closings > 0 && article.openings > 0 && article.closings > 0, 'The fixture must exercise opening brackets and closing punctuation in both title and article');
        assert.deepEqual(title.violations, [], 'Title punctuation must stay on the painted line of its neighboring word');
        assert.deepEqual(article.violations, [], 'Article punctuation must stay on the painted line of its neighboring word');
        assert.deepEqual(title.splitWords, [], 'Japanese lookup words in the title must not split across lines');
        return { title: { glyphs: title.glyphs, openings: title.openings, closings: title.closings }, article: { glyphs: article.glyphs, openings: article.openings, closings: article.closings } };
      });
    }

    await run('J1-jlpt-room-wording', DESK, async (page) => {
      await open(page);
      await openShelfTools(page);
      await page.evaluate(() => document.getElementById('mock-link').click());
      await page.waitForSelector('[data-exam-start]');
      const room = await page.evaluate(() => ({
        text: document.querySelector('#app main').innerText,
        chips: document.querySelectorAll('#app main .status-chip').length,
        levels: [...document.querySelectorAll('[data-exam-level]')].map((n) => ({ level: n.dataset.level || null, tests: n.querySelector('.exam-level-tests')?.textContent || '' })),
      }));
      await page.evaluate(() => document.querySelector('[data-exam-start]').click());
      await page.waitForSelector('.exam-confirm');
      await page.locator('.exam-confirm button', { hasText: /study/i }).first().click();
      await page.waitForSelector('.exam-paper');
      const question = await page.evaluate(() => document.querySelector('#app main').innerText);
      const leaks = [room.text, question].flatMap((t) => t.match(/.{0,20}(awaiting John|machine-checked).{0,20}/giu) || []);
      assert.equal(leaks.length, 0, `diagnostic wording: ${leaks.join(' | ')}`);
      assert(room.chips > 0, 'no 未確認 chip on unreviewed tests');
      assert(room.levels.length === 5 && room.levels.every((l) => l.level && /\d/u.test(l.tests)), `level cards: ${JSON.stringify(room.levels)}`);
      return { chips: room.chips, levels: room.levels };
    });

    await run('K1-keyboard-roving', DESK, async (page) => {
      await openArticle(page, THREE_PARAS);
      const paragraphs = await page.evaluate(() => document.querySelectorAll('#reader .para-break').length + 1);
      assert.equal(paragraphs, 3, `fixture has ${paragraphs} paragraphs`);
      // start at the end of the title block: the title's own lookup words are prose lookup (Codex's
      // prose R4, one stop per block when it lands); this counts the reader from there to its close
      await page.evaluate(() => {
        const t = document.querySelector('h1.view-title');
        const last = [...t.querySelectorAll('button, a[href], [tabindex]')].at(-1);
        if (last) last.focus(); else { t.tabIndex = -1; t.focus(); }
      });
      let presses = 0;
      for (; presses < 400; presses += 1) {
        if (await page.evaluate(() => document.activeElement?.id === 'read-fin')) break;
        await page.keyboard.press('Tab');
      }
      assert(presses <= paragraphs + 3, `${presses} Tab presses from the title to 読み終えた for ${paragraphs} paragraphs`);
      const first = page.locator('#reader button.tok[tabindex="0"]').first();
      await first.focus();
      const walk = await page.evaluate(() => {
        const a = document.activeElement;
        return { index: a.dataset.index, name: a.getAttribute('aria-label'), word: a.querySelector('.tok-word')?.textContent.replace(/\s/gu, '') ?? '' };
      });
      await page.keyboard.press('ArrowRight');
      const right = await page.evaluate(() => document.activeElement?.dataset.index);
      await page.keyboard.press('End');
      const end = await page.evaluate(() => ({ index: document.activeElement?.dataset.index, para: document.activeElement?.dataset.para }));
      await page.keyboard.press('Home');
      const home = await page.evaluate(() => document.activeElement?.dataset.index);
      assert(Number(right) > Number(walk.index), `→ did not move forward (${walk.index} → ${right})`);
      assert(Number(end.index) > Number(right) && home === walk.index, `Home/End: ${JSON.stringify({ end, home, start: walk.index })}`);
      assert(walk.name && !/activation|word ·|読みと意味/u.test(walk.name), `a word is named by more than itself: "${walk.name}"`);
      return { paragraphs, presses, name: walk.name };
    });

    await run('A1-no-f1-audio', DESK, async (page) => {
      const requests = [];
      page.on('request', (r) => requests.push(r.url()));
      const manifests = [];
      page.on('response', async (response) => {
        if (/article-narration\.json/u.test(response.url())) manifests.push(await response.json().then((j) => j.voice ?? null).catch(() => 'unreadable'));
      });
      for (const id of [NARRATED, ARTICLE]) {
        await openArticle(page, id);
        const listen = page.locator('#listen-toggle');
        if (await listen.count() && await listen.isEnabled()) { await listen.click(); await page.waitForTimeout(1500); }
      }
      const listenText = await page.evaluate(() => document.querySelector('.listen-row')?.innerText ?? '');
      const f1 = requests.filter((u) => /\/audio\/(narration|w)\/f1\//u.test(u));
      assert.equal(f1.length, 0, `F1 clips requested: ${f1.slice(0, 3).join(', ')}`);
      assert(!manifests.includes('f1'), 'a narration manifest naming F1 was loaded');
      assert(!/\bF1\b/u.test(listenText), `the listen row names F1: ${listenText}`);
      return { f1Requests: 0, narrationManifests: manifests, listenText };
    }, () => { try { localStorage.setItem('kairo-rec-voice-v1', 'f1'); } catch { /* storage refused */ } });

    await browser.close();
  }
} finally {
  await host.close();
  const receipt = {
    artifactSha256: manifest.artifactSha256, gitSha: manifest.gitSha, sourceDirty: manifest.sourceDirty,
    verifierSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
    control: withControl ? 'rt and ruby::before forced to 0.46em' : null,
    scope: 'Design pass steps 1–2: reader token flushness, readability, first screen; shelf wording, first story and text-first cards; no F1 audio; glance pass: the study tools behind one button, a one-line title block, no clipped row at 320/390/1368, the first-visit tip in the page, ダマスカス savable, one word one card; reader lane: one tap shows the meaning, the word menu saves one card, Save is one tap with Undo, the menu by keyboard, the lists popover, the sentence row and phone seating, sentence Save without activation, the version switch with 44px hit boxes, transform/opacity-only motion across the reader room and the popup Save and list path, the same one path in the galaxy, return from Practice on lookup and content words with motion enabled, and Japanese punctuation line breaks with source text preserved',
    results,
    passed: results.length === engines.length * 48 && results.every((row) => row.passed),
  };
  writeFileSync(resolve(evidence, 'design-reader-shelf.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`${results.filter((r) => r.passed).length}/${results.length} passed · evidence ${evidence}`);
  if (!receipt.passed) process.exitCode = 1;
}
