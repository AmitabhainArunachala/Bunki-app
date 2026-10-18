/** Design pass 2026-09-30, steps 1–2: the reader and the bookshelf, measured in a real browser.
 *
 *   R1 flush tokens     — adjacent reader tokens on one line leave no gap between their glyphs
 *                         (base text only, readings excluded), before and after a reading shows;
 *                         and no whitespace text node stands between token elements.
 *   R2 readability      — (F, 2026-10-18: one ladder, one ruby; was 21–22 / 18–19 px and a reading
 *                         ≥ 0.55 × the body, drawn as ruby::before) the Japanese body is the ladder's
 *                         reading step, exactly 23 px at 1368 and 21 px at 390; a shown reading is a
 *                         native <rt> at exactly half the body and 10 px or more (MASTER_SPEC D5), at
 *                         ≥ 4.5:1 on its paper; the tap's English (in the word popup, reader lane
 *                         2026-10-02) is ≥ 15 px at ≥ 4.5:1; the body text itself is ≥ 4.5:1.
 *   R3 first sentence   — every token of the first sentence is inside the first viewport, and
 *                         nothing fixed (tip, bar, bug) covers it, at 390×844 and 1368×900.
 *   S1 learner wording  — no visible "signals disagree", 不一致 or "awaiting John" on the shelf or
 *                         in a reading.
 *   S2 first story      — the first shelf card's headline is inside 390×844 and not covered.
 *   S3 one count        — every number the unfiltered shelf states about its size is the same
 *                         number, and it equals the stories on the shelf (grid + today's band).
 *   S4 picture cards    — (FEEL pass 2026-10-02, John: "there are now NO pictures at all… we want
 *                         this to be like a magazine") every article card whose row has a picture or a
 *                         key kanji carries ONE picture slot, a fixed 3:2 box: the record's own picture
 *                         (index.json "picture".src, loaded, decorative inside the card) where it has
 *                         one, else its key kanji (index.json "heroKanji") alone, set at a third of the
 *                         box's height or more on the world's paper. A row with neither has no band at
 *                         all, and no card shows a category placeholder block (N, 2026-10-17, rewrites
 *                         the pin "else a calm block whose only words are its topic in small type, never
 *                         a kanji, no larger than 16 px"). Every card has a kicker, the headline, a level chip and
 *                         in English its English line; the lead adds its first sentence. No short word
 *                         definition stands on the shelf (N, 2026-10-17: culled as not articles). The 永 seal
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
 *                         line; (S, 2026-10-16) no provenance note — no AI作成 / Made by AI, no ⓘ — on the
 *                         shelf in either language; the 永 seal stays ≤ 48 px inside the title. Control: 7ef0e985, whose phone dateline broke the
 *                         count onto a second line and whose note ran to three lines.
 *   O1 no clipped row   — (glance pass) at 320, 390 and 1368 the shelf as served, and with its tools
 *                         panel open, never runs past the screen's side: no element of the shelf
 *                         crosses the viewport's left or right edge, no row scrolls sideways, the page
 *                         itself does not, and the look-up field's hint fits inside the field.
 *                         Control: 7ef0e985, whose phone chip bar and today's six scrolled sideways
 *                         with a chip and a card cut mid-word at the edge.
 *   P1 word demonstration — G3 replaces the permanent tip with one silent, text-free word stage on
 *                         a genuinely fresh record. It creates no lookup/review work, does not replay
 *                         after navigation/reload, and a saved-history record suppresses it even without
 *                         the device-only seen key. Both 390 and 1368 are exercised.
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
 *   G1 stage meaning   — G3's known on-touch word reveals its reading, then opens the stage with
 *                         its meaning, Save and full-entry band. Switching words yields exactly one stage;
 *                         Escape closes it and restores focus. verify-word-grammar pins every rung.
 *   G2 hold → one card  — (John #11 "right click and choose save"; G5 hold = seal, 2026-10-18) a right-click on
 *                         郊外 seals it: exactly one 郊外 card carrying its sentence (the capture path's ctx),
 *                         and the strip opens beside the word (never over it) with a polite status that says
 *                         Saved and the word's acts in plain full verbs: 全項目 · Full entry · Save the
 *                         sentence · Copy · Remove (Ask the tutor about the word only with a tutor set up:
 *                         Hfix-1B). A second right-click is the
 *                         same strip and still one card. A right-click off the words keeps the browser's own
 *                         menu. Control: 3166ded3, which had no word menu; 92e5492f, whose menu saved nothing
 *                         until its Save was chosen.
 *   G3 Save + Review off — (John #17; 1.3.0 Save ▾) at 1368 and 390, the popup's Save makes one card in one
 *                         press, no list window opens, the button reads "Saved ✓" and its menu unfolds inside
 *                         the card with Review checked; Review off takes the card back out and the button
 *                         reads "Save" again.
 *                         Control: 3166ded3, whose Save opened dialog#vocabulary-list-dialog.
 *   G4 keyboard strip   — the focused word's Shift+F10 (and the ContextMenu key) seals it and opens the strip
 *                         with its first control focused (New list… on a record with no lists); ↓ moves to
 *                         全項目 · Full entry; Escape closes it and focus returns to the word.
 *                         Enter on the word opens the popup with focus on Save; Escape returns to the word.
 *                         Control: 3166ded3 (no menu).
 *   G5 lists popover    — (John #17; round 4 T5, "click save and then add to list from there") the popup
 *                         has no list button; Save ▾ saves the word and unfolds its menu inside the card
 *                         under the button, at 1368 and 390 (no dialog#vocabulary-list-dialog, never over the
 *                         kanji or sentence bands), whose "+ New list" row becomes a name field that makes a
 *                         list holding the word and whose checkbox takes it off again while the card stays.
 *                         Control: 3166ded3.
 *                         In the galaxy, where a word's entry opens over the sky and a word of its example
 *                         sentences opens the same popup, the path is the same: no menu before Save, the
 *                         menu under "Saved ✓", and none again after Review off. Control: 890cd522, which
 *                         showed "Add to a list" beside an unsaved Save there.
 *                         That popup's word band is laid out there too: the word, its reading and its meaning
 *                         each stand on a row of their own, and the band itself is the door into the full entry
 *                         (a chevron at its end), at least 44px tall, inside the card and the screen, not covered.
 *                         Control: 76c40528, whose galaxy popup ran the three together on one line.
 *   G6 sentence door    — (John #18; round 4 T5) no sentence bar shows when a word is chosen (no sentence
 *                         action shows outside the popup); the popup's last band is one named door,
 *                         "Study this sentence", showing the sentence's start; it opens the sentence in
 *                         the card, the word marked, with "Ask the tutor" (a tutor set up) and "Practice it" and a quiet
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
 *                         A word card below 大丈夫 in やまなし at 390×844 keeps that below seat and its
 *                         top within 1px when its shorter sentence opens; the anchor and article scroll
 *                         stay unchanged, with no page errors. Control: 98f29059.
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
 *                         text and (S) no provenance chip or line at all; each level card carries its
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
import { entryCloseSelector } from './sheet-navigation-support.mjs';
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
import { setUpDeviceTutor } from './tutor-fixture-support.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Choose an existing artifact and its exact digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const browserVersions = {};
const g3Only = process.argv.includes('--g3-only');
const spacingOnly = process.argv.includes('--spacing-only');
const fixesOnly = process.argv.includes('--design-fixes-only');
assert([g3Only, spacingOnly, fixesOnly].filter(Boolean).length <= 1, 'Choose one explicit narrow design schedule');
const verifierSha256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const DEMO_KEY = 'kairo-word-ladder-demo-v1';
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
    // Native prose may wrap within one token. Its union spans the empty
    // distance between line ends; only the actual fragment widths carry ink.
    const excess = [...word.getClientRects()].reduce((sum, rect) => sum + rect.width, 0) - probe.getBoundingClientRect().width;
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
  const nodes = [...document.querySelectorAll('#app, #app *, #mini, #mini *, #seal-strip, #seal-strip *, #reader-toast, #reader-toast *, #vocabulary-list-popover, #vocabulary-list-popover *')];
  const groups = { topBar: '#app > .chrome button', tabBar: '#primary-tabs .primary-tab', titleCard: '.reader-card button, .reader-card summary',
    bookmark: '#reader-place-save', playBar: '.listen-row', words: '#reader .tok[data-prose-label]', finished: '#read-fin', settings: '.dials .seg button',
    menu: '#seal-strip', popup: '#mini button', toast: '#reader-toast', listAdd: '#vocabulary-list-create' };
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

async function focusToken(page, index) {
  const tok = page.locator(`#reader .tok[data-index="${index}"]`);
  const at = await tok.evaluate((node) => [...node.closest('[data-prose-roving]').querySelectorAll('.tok[data-para]')].indexOf(node));
  assert(at >= 0, `token ${index} has no paragraph rover`);
  await tok.locator('xpath=ancestor::*[@data-prose-roving][1]').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < at; i++) await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.index), String(index), 'paragraph rover selected the wrong word');
}

async function tapToken(page, index, { scroll = true } = {}) {
  const tok = page.locator(`#reader .tok[data-index="${index}"]`);
  if (scroll) await tok.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  const box = await tok.evaluate((node) => { const r = node.getClientRects()[0]; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y);
  // Lookup-only words may still be resolving their dictionary index after
  // 250 ms. Observe this activation on the exact node; never add a retry tap.
  const activated = await tok.elementHandle();
  try {
    await page.waitForFunction((node) => node?.isConnected &&
      (node.dataset.ladderRung === 'reading' ||
        (node.dataset.ladderRung === 'stage' && !!document.querySelector('#mini'))), activated, { timeout: 5000 });
  } finally { await activated?.dispose(); }
  if (!await page.locator('#mini').count()) {
    const revealed = await tok.evaluate((node) => node.dataset.ladderRung === 'reading');
    assert(revealed, `token ${index}: first activation produced neither the reading rung nor a stage`);
    await tok.click();
    await page.waitForSelector('#mini');
    await page.waitForTimeout(250);
  }
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
    browserVersions[engine] = browser.version();
    console.log(`${engine} ${browserVersions[engine]}`);
    const context = async (viewport, init, { demo = false } = {}) => {
      const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await silenceBrowserAudio(ctx);
      if (!demo) await ctx.addInitScript((key) => localStorage.setItem(key, '1'), DEMO_KEY);
      if (init) await ctx.addInitScript(init);
      await ctx.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
      const page = await ctx.newPage();
      page.setDefaultTimeout(15000);
      return { ctx, page };
    };
    const run = async (name, viewport, body, init, options) => {
      if (g3Only && !/^(P1-fresh-word-demo-|P1-history-only-no-demo$|G1-stage-meaning-|G4-keyboard-menu$|K1-keyboard-roving$)/u.test(name)) return;
      if (spacingOnly && !/^R1-flush-tokens-(1368|390)$/u.test(name)) return;
      if (fixesOnly && !/^(R1-flush-tokens-(1368|390)|W2-one-word-one-card-reverse|G6-sentence-below-seat-390|G8-reader-popup-motion-(390|320))$/u.test(name)) return;
      const { ctx, page } = await context(viewport, init, options);
      const pageErrors = [], pageErrorDetails = [], networkEvents = [];
      const traceRequest = (event, request) => {
        if (/\/dict-v2\//u.test(request.url())) networkEvents.push({ event, phase: page.__verifierPhase || 'walk', url: request.url(), failure: request.failure()?.errorText || null });
      };
      page.on('request', (request) => traceRequest('request', request));
      page.on('requestfinished', (request) => traceRequest('finished', request));
      page.on('requestfailed', (request) => traceRequest('failed', request));
      page.on('pageerror', (error) => { pageErrors.push(error.message); pageErrorDetails.push({ phase: page.__verifierPhase || 'walk', message: error.message }); });
      try {
        const observations = await body(page);
        assert.deepEqual(pageErrors, [], 'unfiltered browser page errors');
        results.push({ engine, name, passed: true, observations });
        console.log(`PASS ${engine}/${name} ${JSON.stringify(observations)}`);
      } catch (error) {
        const screenshot = resolve(evidence, `${engine}-${name}.png`);
        await page.screenshot({ path: screenshot, animations: 'disabled' }).catch(() => {});
        results.push({ engine, name, passed: false, error: String(error.message || error), pageErrorDetails, networkEvents, screenshot });
        console.log(`FAIL ${engine}/${name}: ${String(error.message || error).split('\n')[0]}`);
      } finally { await ctx.close(); }
    };

    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`R1-flush-tokens-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        if (withControl) await page.addStyleTag({ content: '#reader .tok[data-index="1"] .tok-word { padding-inline-end: 8px !important; }' });
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
        if (withControl) await page.addStyleTag({ content: '#reader rt { font-size: 0.46em !important; }' });
        const body = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#reader')).fontSize));
        const want = label === '1368' ? 23 : 21; // the ladder's reading step (21 on a phone)
        assert.equal(body, want, `Japanese body ${body}px, wanted the reading step ${want}px`);
        const bodyContrast = await page.evaluate(contrastOf, '#reader .tok.content');
        assert(bodyContrast >= 4.5, `reading text contrast ${bodyContrast}:1`);
        await tapToken(page, 1);
        // what is painted is the <rt> itself (one ruby, native): no pseudo-element draws a reading
        const rt = await page.evaluate(() => {
          const node = [...document.querySelectorAll('#reader .tok[data-index="1"] rt')].find((n) => !n.classList.contains('hidden-rt'));
          if (!node) return null;
          const cs = getComputedStyle(node), ruby = node.parentElement;
          const pseudo = ['::before', '::after'].map((p) => getComputedStyle(ruby, p).content).filter((c) => c && c !== 'none' && c !== 'normal');
          return { size: parseFloat(cs.fontSize), opacity: Number(cs.opacity), shown: cs.display !== 'none' && cs.visibility !== 'hidden',
            text: node.textContent, carrier: 'rt', pseudo };
        });
        assert(rt && rt.shown && rt.opacity > 0.9 && rt.text, `the first tap shows no reading: ${JSON.stringify(rt)}`);
        assert.deepEqual(rt.pseudo, [], `a pseudo-element draws a reading: ${JSON.stringify(rt.pseudo)}`);
        assert(Math.abs(rt.size / body - 0.5) <= 0.01, `furigana ${rt.size}px is ${(rt.size / body).toFixed(2)}× the body, not half`);
        assert(rt.size >= 10, `furigana ${rt.size}px is under 10px`);
        const readingContrast = await page.evaluate(contrastOf, '#reader .tok[data-index="1"] rt:not(.hidden-rt)');
        assert(readingContrast >= 4.5, `the reading's contrast ${readingContrast}:1`);
        // one tap is the meaning (reader lane 2026-10-02): the English stands in the word's popup
        const gloss = await page.evaluate(() => {
          const node = document.querySelector('#mini .mini-gloss');
          return node ? { size: parseFloat(getComputedStyle(node).fontSize), text: node.textContent } : null;
        });
        assert(gloss, 'the tap shows no English in its popup');
        const glossContrast = await page.evaluate(contrastOf, '#mini .mini-gloss');
        assert(gloss.size >= 15, `English gloss ${gloss.size}px`);
        assert(glossContrast >= 4.5, `English gloss contrast ${glossContrast}:1`);
        return { body, bodyContrast, furigana: rt.size, carrier: rt.carrier, ratio: Math.round((rt.size / body) * 100) / 100, readingContrast, gloss: gloss.size, glossContrast };
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
          let kanjiSheets = 0;
          for (const card of articles) {
            const slots = card.querySelectorAll('.story-picture');
            const slot = slots[0];
            const row = byId.get(card.dataset.passage) || {};
            // N (2026-10-17) rewrites the pin "a row with no picture shows the calm block with its topic word": a row with
            // no picture shows its key kanji (heroKanji) on the world's paper, and a row with neither has no band at all
            const heroKanji = typeof row.heroKanji === 'string' && /^[\p{Script=Han}々]{1,2}$/u.test(row.heroKanji) ? row.heroKanji : '';
            if (card.querySelector('.is-placeholder, .story-picture-word')) bad.push(`${card.dataset.passage}: a category placeholder block`);
            if (!row.picture?.src && !heroKanji) {
              if (slots.length) bad.push(`${card.dataset.passage}: a row with neither picture nor key kanji wears ${slots.length} band(s)`);
              continue;
            }
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
              const glyph = slot.querySelector('.story-hero-kanji');
              const words = slot.textContent.trim();
              const size = glyph ? parseFloat(getComputedStyle(glyph).fontSize) : 0;
              // the key kanji alone, large (a third of the box's height or more), and nothing else in the band
              if (img || !slot.classList.contains('is-kanji') || !glyph) bad.push(`${card.dataset.passage}: a picture-less row does not show its key kanji`);
              else if (words !== heroKanji || size < box.height / 3) bad.push(`${card.dataset.passage}: the key kanji band reads "${words}" at ${size}px in a ${Math.round(box.height)}px box`);
              else kanjiSheets += 1;
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
          const keyed = index.articles.filter((row) => !row.picture?.src && row.heroKanji && cards.some((card) => card.dataset.passage === row.id)).length;
          return { cards: cards.length, articles: articles.length, definitions: definitions.length, pictured, named, kanjiSheets, keyed, bad: bad.slice(0, 4), badCount: bad.length,
            incomplete: incomplete.slice(0, 4), incompleteCount: incomplete.length,
            lede: lead?.querySelector('.story-lede')?.textContent ?? '', sealInTitle: !!seal?.closest('.shelf-mast-title'),
            seal: sealBox ? Math.round(Math.max(sealBox.width, sealBox.height)) : 0 };
        });
        // N (2026-10-17) rewrites the pin "word definitions stand on the shelf, in their own band": the ten left through
        // the cull queue as not articles — none stands, and every card is an article wearing its picture slot
        assert(probe.cards > 20 && probe.articles === probe.cards && probe.definitions === 0, `${probe.cards} cards, ${probe.articles} articles, ${probe.definitions} word definitions`);
        assert.equal(probe.badCount, 0, `picture slots wrong: ${probe.bad.join(' | ')}`);
        assert(probe.named > 0 && probe.pictured === probe.named, `${probe.pictured} of the ${probe.named} pictures the index names stand on their cards`);
        assert(probe.keyed > 0 && probe.kanjiSheets === probe.keyed, `${probe.kanjiSheets} of the ${probe.keyed} key kanji the index names stand on their cards`);
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
        // S · no provenance on the shelf (John, 2026-10-16: "and made by AI!! do not write that!!!!"). This pinned the AI作成
        // note — its count against the total, its one line, its ⓘ and the explanation behind it. The new truth: the
        // masthead carries no such note in any form, in either language; how a story was made stays in its record.
        assert.equal(probe.note, '', `the shelf still carries a provenance note: "${probe.note}"`);
        assert(!probe.why, 'a provenance ⓘ is still on the shelf');
        const masthead = await page.evaluate(() => [...document.querySelectorAll('.shelf-masthead, #shelf-reading-results')].map((n) => n.innerText).join(' \n '));
        assert(!/Made by AI|AI作成|not yet checked|人の確認|未確認|unreviewed/iu.test(masthead), `the shelf names provenance: "${masthead.match(/.{0,30}(Made by AI|AI作成|not yet checked|人の確認|未確認|unreviewed).{0,30}/iu)?.[0]}"`);
        assert(probe.seal > 0 && probe.seal <= 48, `the 永 seal is ${probe.seal}px`);
        return { note: null, seal: probe.seal };
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
      const fieldVisible = !!field && shown(field);
      if (fieldVisible) {
        const style = getComputedStyle(field);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const room = field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        hint = { text: field.placeholder, width: Math.ceil(ctx.measureText(field.placeholder).width), room: Math.floor(room) };
      }
      return { crossing: crossing.slice(0, 4), crossingCount: crossing.length, sideways, pageScroll: document.documentElement.scrollWidth > innerWidth + 1, fieldVisible, hint };
    };
    for (const [label, viewport] of [['320', NARROW], ['390', PHONE], ['1368', DESK]]) {
      await run(`O1-no-clipped-row-${label}`, viewport, async (page) => {
        await open(page);
        const served = await page.evaluate(clippedRows);
        assert.equal(served.fieldVisible, false, 'the lookup field must wait inside the closed Tools panel at arrival');
        await openShelfTools(page);
        const tools = await page.evaluate(clippedRows);
        assert.equal(tools.fieldVisible, true, 'the Tools panel must expose the actual lookup field');
        for (const [state, probe] of [['as served', served], ['tools open', tools]]) {
          assert.equal(probe.crossingCount, 0, `${state}: ${probe.crossingCount} shelf elements cross the screen's side: ${probe.crossing.join(' | ')}`);
          assert.equal(probe.sideways.length, 0, `${state}: rows that scroll sideways: ${probe.sideways.join(', ')}`);
          assert(!probe.pageScroll, `${state}: the page scrolls sideways`);
          if (probe.fieldVisible) assert(probe.hint && probe.hint.width <= probe.hint.room, `${state}: the look-up hint is cut: ${JSON.stringify(probe.hint)}`);
        }
        return { hint: tools.hint.text, toolsOpened: true, fieldHiddenAtArrival: !served.fieldVisible };
      });
    }

    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`P1-fresh-word-demo-${label}`, viewport, async (page) => {
        page.__verifierPhase = 'fresh shelf';
        await open(page);
        const learning = (record) => Object.fromEntries(['taken', 'srs', 'obslog', 'revlog', 'lists', 'teacherContexts']
          .map((key) => [key, record[key] ?? null]));
        const before = learning(await readAppRecord(page));
        page.__verifierPhase = 'open article';
        await openArticle(page, ARTICLE);
        await page.locator('#mini[data-demo="true"] .mini-word').waitFor();
        const demonstration = await page.evaluate(() => ({
          word: document.querySelector('#mini[data-demo="true"] .mini-word')?.textContent.trim(),
          stages: document.querySelectorAll('#mini').length,
          tip: document.querySelectorAll('#reader-tip').length,
          instructions: /Tap any word for its meaning\./u.test(document.body.innerText),
          seen: localStorage.getItem('kairo-word-ladder-demo-v1'),
          audio: window.__g3DemoAudio,
        }));
        assert(demonstration.word && demonstration.stages === 1, `fresh demo did not choose one real word: ${JSON.stringify(demonstration)}`);
        assert(!demonstration.tip && !demonstration.instructions, 'the permanent reader tip remains');
        assert.equal(demonstration.seen, '1', 'demonstration did not remember its device-only seen mark');
        assert.equal(demonstration.audio, 0, 'the demonstration played audio');
        await page.waitForTimeout(800);
        assert.deepEqual(learning(await readAppRecord(page)), before, 'the demonstration created learner history or review work');
        await page.keyboard.press('Escape');
        page.__verifierPhase = 'navigation after demo';
        await openArticle(page, ARTICLE);
        await page.waitForTimeout(1000);
        assert.equal(await page.locator('#mini[data-demo="true"], #reader-tip').count(), 0, 'demonstration/tip replayed after navigation');
        page.__verifierPhase = 'reload after demo';
        await page.reload();
        await page.waitForFunction(() => document.body.dataset.ready === '1');
        await page.waitForTimeout(1000);
        assert.equal(await page.locator('#mini[data-demo="true"], #reader-tip').count(), 0, 'demonstration/tip replayed after reload');
        page.__verifierPhase = 'lookup-only setup';
        // A lookup alone is history too: no saved card is needed to suppress the demo.
        await openArticle(page, ARTICLE);
        const beforeLookup = await readAppRecord(page);
        page.__verifierPhase = 'deliberate lookup';
        await tapToken(page, 1);
        const looked = await waitForAppRecord(page, (r) => r.obslog.length > beforeLookup.obslog.length, { description: 'lookup-only history' });
        assert.equal(looked.taken.length, 0, 'lookup-only fixture accidentally saved a card');
        page.__verifierPhase = 'navigate after lookup';
        await page.evaluate((key) => localStorage.removeItem(key), DEMO_KEY);
        await openArticle(page, ARTICLE);
        await page.waitForTimeout(1000);
        assert.equal(await page.locator('#mini[data-demo="true"]').count(), 0, 'lookup-only history received a demonstration');
        assert.deepEqual(learning(await readAppRecord(page)), learning(looked), 'suppressed lookup-history demo changed learning roots');
        page.__verifierPhase = 'saved-history setup';
        // Establish real saved history through its UI, then remove only the device mark. The
        // durable record, not this mark, must prevent teaching an existing learner again.
        await openArticle(page, ARTICLE);
        await tapToken(page, 1);
        await page.locator('#mini #mini-take:not([disabled])').click();
        page.__verifierPhase = 'save history';
        const saved = await waitForAppRecord(page, (r) => r.taken.some((item) => item.t === 'word' && item.id === '郊外'),
          { description: 'history fixture saved through the real stage' });
        page.__verifierPhase = 'navigate after Save';
        await page.evaluate((key) => localStorage.removeItem(key), DEMO_KEY);
        await openArticle(page, ARTICLE);
        await page.waitForTimeout(1000);
        assert.equal(await page.locator('#mini[data-demo="true"], #reader-tip').count(), 0, 'a learner with saved history received the demonstration');
        assert.deepEqual(learning(await readAppRecord(page)), learning(saved), 'suppressed demonstration changed learner history');
        return { demonstration, navigationReplay: false, reloadReplay: false, historyReplay: false, lookupHistoryReplay: false };
      }, () => {
        window.__g3DemoAudio = 0;
        const play = window.HTMLMediaElement.prototype.play;
        window.HTMLMediaElement.prototype.play = function (...args) { window.__g3DemoAudio++; return play.apply(this, args); };
        if (window.speechSynthesis) {
          const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
          window.speechSynthesis.speak = (...args) => { window.__g3DemoAudio++; return speak(...args); };
        }
      }, { demo: true });
    }

    await run('P1-history-only-no-demo', PHONE, async (page) => {
      await open(page);
      const before = await readAppRecord(page);
      assert.equal(before.readerPos?.['aozora:049966-1'], 120, 'real migration must retain the history-only position fixture');
      assert.equal(before.taken.length, 0, 'history-only fixture has no saved card');
      assert.equal((before.obslog || []).length, 0, 'history-only fixture has no lookup');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), DEMO_KEY), null, 'no device seen key may suppress this fixture');
      await openArticle(page, ARTICLE); await page.waitForTimeout(1200);
      assert.equal(await page.locator('#mini[data-demo="true"], #reader-tip').count(), 0, 'existing reader-position history must suppress the demonstration');
      const after = await readAppRecord(page);
      for (const key of ['taken', 'srs', 'obslog', 'revlog', 'lists', 'teacherContexts']) assert.deepEqual(after[key], before[key], `suppressed demonstration changed ${key}`);
      assert.equal(after.readerPos?.['aozora:049966-1'], 120, 'opening another article lost existing reading position');
      return { savedCards: 0, lookups: 0, priorArticlePosition: 120, demonstration: false };
    }, () => {
      // Migration input only. The app installs and reads its normal native record;
      // the verifier never writes the active database or replaces a state reducer.
      if (!localStorage.getItem('g3-history-fixture-installed')) {
        localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1, taken: [], srs: {}, readerPos: { 'aozora:049966-1': 120 } }));
        localStorage.setItem('g3-history-fixture-installed', '1');
      }
    }, { demo: true });

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
          // Save ▾'s own menu unfolds inside the card (1.3.0): a dialog, but no window
          window: [...document.querySelectorAll('dialog[open], [role="dialog"]:not(#mini):not(#mini *)')].some((n) => n.getClientRects().length > 0) }));
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
    // S · the page's one Save is its bar's (#sheet-take); the foot's 覚える (#take) these pinned is gone
    const fullEntryState = (page) => page.evaluate(() => {
      const take = document.querySelector('#sheet #sheet-take');
      return { take: take && { pressed: take.getAttribute('aria-pressed'), disabled: take.disabled, held: take.classList.contains('word-capture-held') },
        note: document.querySelector('#word-capture-note')?.textContent.trim() ?? null, replace: !!document.querySelector('#word-capture-replace') };
    });
    await run('W2-one-word-one-card', DESK, async (page) => {
      // quick look first, then 全項目
      await openArticle(page, ARTICLE);
      await saveFromQuickLook(page);
      await page.locator('#mini button.mini-word').click(); // the band is the door
      await page.waitForSelector('#sheet #sheet-take');
      const full = await fullEntryState(page);
      assert(full.take?.pressed === 'true' && !full.take.disabled && !full.take.held && full.note === null && !full.replace,
        `saved from the quick look, 全項目 does not show it saved: ${JSON.stringify(full)}`);
      return { full };
    });
    // 全項目 first, then the quick look (a fresh context: a fresh record)
    await run('W2-one-word-one-card-reverse', DESK, async (page) => {
      await openArticle(page, ARTICLE);
      await page.locator('#reader .tok[data-index="0"]').click();
      await page.waitForSelector('#mini button.mini-word');
      await page.locator('#mini button.mini-word').click();
      await page.waitForSelector('#sheet #sheet-take:not([disabled])');
      await page.locator('#sheet #sheet-take').click();
      await page.waitForFunction(() => document.querySelector('#sheet #sheet-take')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5_000 });
      await page.locator(await entryCloseSelector(page)).click();
      await page.waitForFunction(() => !document.querySelector('#sheet'), null, { timeout: 5_000 });
      await page.locator('#mini .mini-word').waitFor(); // G3: Back from a stage-origin page restores that stage.
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
      const box = mini.getBoundingClientRect(), take = mini.querySelector('#mini-take'), door = mini.querySelector('button.mini-word[data-action="entry.open"]'), head = mini.querySelector('.mini-head');
      return { word: mini.querySelector('.mini-word')?.textContent, reading: mini.querySelector('.mini-reading')?.textContent,
        gloss: mini.querySelector('.mini-gloss')?.textContent, save: take && { label: take.textContent, disabled: take.disabled,
          filled: getComputedStyle(take).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(take).backgroundColor !== 'transparent' },
        door: door && { name: door.getAttribute('aria-label'), chevron: getComputedStyle(head, '::after').content !== 'none', entryButton: !!mini.querySelector('.mini-entry') },
        inside: box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        underWord: document.querySelectorAll('#reader .tok-en').length };
    });
    const cardsFor = (record, id) => record.taken.filter((t) => t.t === 'word' && t.id === id);
    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`G1-stage-meaning-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        await tapToken(page, SUBURB);
        // R3 (Grok 2029) · a slip drawn before its word's sense is at hand shows a quiet "…" (aria-busy, R2's contract) until
        // it is: the card is read once answered, up to 5 s, then asserted exactly as before
        await page.waitForFunction(() => !!document.getElementById('mini') && document.getElementById('mini').getAttribute('aria-busy') !== 'true',
          null, { timeout: 5_000 }).catch(() => {});
        const one = await popupState(page);
        assert(one, 'reading → stage opened no popup');
        assert.deepEqual([one.word, one.reading, one.gloss], ['郊外', 'こうがい', 'suburb'], `the stage does not show the word, reading and meaning: ${JSON.stringify(one)}`);
        assert(one.save?.label === 'Save' && !one.save.disabled && one.save.filled, `no filled Save: ${JSON.stringify(one.save)}`);
        assert(one.door?.name === 'Open the full entry' && one.door.chevron && !one.door.entryButton, `the band is not the door into the full entry: ${JSON.stringify(one.door)}`);
        assert(one.inside && one.underWord === 0, `the popup is off screen, or English was written under the word: ${JSON.stringify(one)}`);
        await tapToken(page, 2);
        const moved = await page.evaluate(() => ({ count: document.querySelectorAll('#mini').length, word: document.querySelector('#mini .mini-word')?.textContent }));
        const third = await page.evaluate(() => document.querySelector('#reader .tok[data-index="2"] .tok-word')?.textContent.replace(/\s/gu, ''));
        assert(moved.count === 1 && moved.word && moved.word !== '郊外' && third.includes(moved.word.slice(0, 1)), `another word did not move the popup: ${JSON.stringify({ moved, third })}`);
        await focusToken(page, 2);
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
      const wordBox = await tok.evaluate((node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
      await page.mouse.click(at.x, at.y, { button: 'right' });
      await page.waitForSelector('#seal-strip');
      const record = await waitForAppRecord(page, (r) => cardsFor(r, '郊外').length > 0, { description: '郊外 sealed by the right-click' });
      await page.waitForTimeout(300);
      const strip = await page.evaluate(() => {
        const node = document.getElementById('seal-strip'), box = node.getBoundingClientRect(), status = document.getElementById('seal-strip-status');
        return { role: node.getAttribute('role'), items: [...node.querySelectorAll('[data-strip-action]')].filter((item) => !item.hidden).map((item) => item.textContent.trim()),
          status: status && { text: status.textContent.trim(), role: status.getAttribute('role') }, top: box.top, bottom: box.bottom, left: box.left, right: box.right };
      });
      // the word's one way out stands beside Saved ✓ in the first row (lead's ruling, 2026-10-18); the acts follow under the hairline
      // Hfix-1B (item 11): no tutor is set up here, so the strip has no "Ask the tutor about the word"
      assert.deepEqual(strip.items, ['Remove', '全項目 · Full entry', 'Save the sentence', 'Copy'], `the strip: ${JSON.stringify(strip.items)}`);
      assert.equal(await page.locator('#seal-strip .seal-strip-lists > #seal-strip-status + [data-strip-action="remove"]').count(), 1, 'Remove does not stand beside Saved ✓');
      const overWord = !(strip.right <= wordBox.left || strip.left >= wordBox.right || strip.bottom <= wordBox.top || strip.top >= wordBox.bottom);
      assert(strip.role === 'dialog' && !overWord, `the strip is not beside its word: ${JSON.stringify({ strip, wordBox })}`);
      const after = await readAppRecord(page);
      const cards = cardsFor(after, '郊外');
      assert.equal(cards.length, 1, `the right-click made ${cards.length} 郊外 cards`);
      assert(cards[0].ctx?.scope === 'sent' && cards[0].ctx.p === ARTICLE && cards[0].ctx.i === SUBURB, `the card lost its sentence: ${JSON.stringify(cards[0])}`);
      // S · what the keep says, it says once and politely (Saved), and nothing about review
      assert(strip.status && /^Saved\b/u.test(strip.status.text) && !/review/iu.test(strip.status.text) && strip.status.role === 'status', `no polite status: ${JSON.stringify(strip.status)}`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#seal-strip').count(), 0, 'Escape left the strip open');
      await page.mouse.click(at.x, at.y, { button: 'right' });
      await page.waitForSelector('#seal-strip');
      await page.waitForTimeout(300);
      const again = await page.evaluate(() => ({ status: document.getElementById('seal-strip-status')?.textContent.trim(),
        remove: !document.querySelector('#seal-strip [data-strip-action="remove"]')?.hidden }));
      assert.deepEqual(again, { status: 'Saved ✓', remove: true }, `the second right-click does not show the word kept: ${JSON.stringify(again)}`);
      assert.equal(cardsFor(await readAppRecord(page), '郊外').length, 1, 'a second right-click duplicated or removed the card');
      await page.keyboard.press('Escape');
      // the browser keeps its own menu off the words
      const offWord = await page.evaluate(() => {
        const title = document.querySelector('h1.view-title');
        const event = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
        return title.dispatchEvent(event);
      });
      assert.equal(offWord, true, 'a right-click off the words lost the browser menu');
      return { items: strip.items.length, cards: cards.length, ctx: cards[0].ctx, srs: !!record.srs, status: strip.status.text };
    });

    for (const [label, viewport] of [['1368', DESK], ['390', PHONE]]) {
      await run(`G3-save-and-undo-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        await tapToken(page, SUBURB);
        await page.locator('#mini #mini-take').click();
        await waitForAppRecord(page, (r) => cardsFor(r, '郊外').length === 1, { description: 'one press saves 郊外' });
        // the durable write lands a beat before the app repaints its button and raises the toast: wait for the page
        await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'true'
          && !!document.querySelector('#mini #vocabulary-list-popover.is-inline'), null, { timeout: 5_000 }).catch(() => {});
        const saved = await page.evaluate(() => ({ label: document.querySelector('#mini #mini-take')?.textContent, pressed: document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed'),
          window: !!document.querySelector('#vocabulary-list-dialog, dialog[open]'),
          toast: document.querySelector('#reader-toast:not([hidden])')?.innerText.replace(/\s+/gu, ' ').trim() ?? null,
          role: document.querySelector('#reader-toast')?.getAttribute('role') }));
        assert(saved.label === 'Saved ✓' && saved.pressed === 'true' && !saved.window, `one press did not save in place: ${JSON.stringify(saved)}`);
        // Save ▾ (1.3.0): the press that saves unfolds the word's menu inside the card, its Review row checked —
        // that row is the way back out (the menu's opening puts the Save toast away)
        const menu = await page.evaluate(() => { const pop = document.querySelector('#mini #vocabulary-list-popover.is-inline'), review = pop?.querySelector('#mini-review');
          return { inline: !!pop, review: review ? review.checked : null }; });
        assert(menu.inline && menu.review === true, `Save ▾ did not unfold its menu with Review checked: ${JSON.stringify(menu)}`);
        await page.locator('#mini #mini-review').uncheck();
        const undone = await waitForAppRecord(page, (r) => cardsFor(r, '郊外').length === 0, { description: 'Review off takes the card out' });
        await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5_000 }).catch(() => {});
        const label2 = await page.locator('#mini #mini-take').textContent();
        assert.equal(label2, 'Save', 'after Review off the button does not read Save');
        return { saved: saved.label, toast: saved.toast, afterUndo: cardsFor(undone, '郊外').length };
      });
    }

    await run('G4-keyboard-menu', DESK, async (page) => {
      await openArticle(page, ARTICLE);
      const word = page.locator(`#reader .tok[data-index="${SUBURB}"]`);
      await focusToken(page, SUBURB);
      await page.keyboard.press('Shift+F10');
      await page.waitForSelector('#seal-strip');
      const control = () => page.evaluate(() => document.activeElement?.closest('#seal-strip') ? document.activeElement.dataset.stripAction || document.activeElement.id : null);
      const first = await control();
      await page.keyboard.press('ArrowDown');
      const second = await control();
      await page.keyboard.press('Escape');
      const back = await page.evaluate(() => ({ menu: !!document.getElementById('seal-strip'), focus: document.activeElement?.dataset.index }));
      assert.deepEqual([first, second, back.menu, back.focus], ['seal-strip-new', 'entry', false, String(1)], `Shift+F10, ↓, Escape: ${JSON.stringify({ first, second, back })}`);
      await page.keyboard.press('ContextMenu');
      await page.waitForSelector('#seal-strip');
      const byKey = await control();
      assert.equal(byKey, 'seal-strip-new', 'the ContextMenu key did not open the strip with the keyboard inside it');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Enter');
      const reveal = await word.evaluate((node) => node.dataset.ladderRung === 'reading');
      assert(reveal && await page.locator('#mini').count() === 0, 'first Enter did not stop at the reading rung');
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
        // one path (round 4, T5; 1.3.0 Save ▾): the popup has no list button; Save saves the word and unfolds its
        // menu inside the card, under the button — never a window, never over another band
        assert.equal(await page.locator('#mini #mini-lists, #mini .mini-entry').count(), 0, 'the popup carries a list or entry button');
        assert.equal(await page.locator('#vocabulary-list-popover').count(), 0, 'a menu is open before Save');
        await page.locator('#mini #mini-take').click();
        await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5_000 });
        await page.waitForSelector('#mini #vocabulary-list-popover.is-inline');
        const shape = await page.evaluate(() => {
          const mini = document.getElementById('mini'), pop = document.getElementById('vocabulary-list-popover'), box = pop.getBoundingClientRect(), card = mini.getBoundingClientRect(), take = document.getElementById('mini-take').getBoundingClientRect();
          const bands = [...mini.querySelectorAll('.mini-web, .mini-sentence-wrap')].map((n) => n.getBoundingClientRect()).filter((r) => r.height);
          return { modal: !!document.querySelector('dialog[open], #vocabulary-list-dialog'), inCard: pop.closest('#mini') === mini, position: getComputedStyle(pop).position,
            inside: box.left >= card.left - 0.5 && box.right <= card.right + 0.5 && box.top >= card.top - 0.5 && box.bottom <= card.bottom + 0.5,
            underSave: box.top >= take.bottom - 1, aboveBands: bands.every((r) => r.top >= box.bottom - 0.5), expanded: document.getElementById('mini-take').getAttribute('aria-expanded'),
            newList: !!pop.querySelector('#vocabulary-list-new'), width: Math.round(box.width), height: Math.round(box.height), viewport: [innerWidth, innerHeight] };
        });
        assert(!shape.modal && shape.inCard && shape.position === 'static' && shape.inside && shape.underSave && shape.aboveBands && shape.expanded === 'true' && shape.newList,
          `Save ▾'s menu is not inside the card under its button: ${JSON.stringify(shape)}`);
        await page.locator('#vocabulary-list-new').click();
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
        const mini = document.getElementById('mini'), take = mini?.querySelector('#mini-take'), menu = mini?.querySelector('#vocabulary-list-popover.is-inline');
        const shown = (node) => !!node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
        return { view: document.body.dataset.view, word: mini?.querySelector('.mini-word')?.textContent ?? null, save: take?.textContent ?? null,
          pressed: take?.getAttribute('aria-pressed') ?? null, held: take?.disabled ?? null, hasMenu: !!take?.dataset.saveMenu, list: shown(menu), note: shown(mini?.querySelector('.mini-take-note')) };
      });
      // a word of an example sentence whose Save is live and not yet pressed
      let before = null;
      const tokens = page.locator('#sheet .example .sentence-tok');
      for (let i = 0, n = Math.min(await tokens.count(), 30); i < n && !before; i += 1) {
        await tokens.nth(i).scrollIntoViewIfNeeded();
        await tokens.nth(i).click();
        await page.waitForTimeout(250);
        const seen = await path();
        if (seen.hasMenu && seen.held === false && seen.pressed === 'false') before = seen;
        else await page.keyboard.press('Escape');
      }
      assert(before, 'no example word in the galaxy entry offers a live, unpressed Save');
      // S · no caption beside Save (John, 2026-10-16: ":goes into review is excessive and 無駄"): this pinned the
      // "goes into review" note under an unpressed Save; the new truth is the Save alone, no note at any moment
      assert(before.view === 'drift' && before.save === 'Save' && !before.list && !before.note, `the galaxy popup opens its menu before the word is saved, or a caption stands beside Save: ${JSON.stringify(before)}`);
      const band = await page.evaluate(() => {
        const mini = document.getElementById('mini'), head = mini.querySelector('.mini-head'), door = mini.querySelector('button.mini-word[data-action="entry.open"]');
        const box = (node) => { const r = node.getBoundingClientRect(); return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height }; };
        const h = box(head), e = box(door), end = document.elementFromPoint(h.right - 20, h.top + h.height / 2), mid = document.elementFromPoint(e.left + e.width / 2, e.top + e.height / 2);
        return { card: box(mini), screen: { width: innerWidth, height: innerHeight }, band: h, entry: e, entryName: door.getAttribute('aria-label'),
          chevron: getComputedStyle(head, '::after').content !== 'none', entryOnTop: !!mid && door.contains(mid), bandIsDoor: !!end && (end === door || door.contains(end)),
          entryButton: !!mini.querySelector('.mini-entry'),
          // the word is a button whose padding reaches 5px past its glyph line (its 44px hit): a row is the content box
          rows: ['.mini-word', '.mini-reading', '.mini-gloss'].map((selector) => mini.querySelector(selector)).filter(Boolean)
            .map((node) => { const r = node.getBoundingClientRect(), s = getComputedStyle(node), pt = parseFloat(s.paddingTop) || 0, pb = parseFloat(s.paddingBottom) || 0;
              return { part: node.classList[0], text: node.textContent, top: r.top + pt, right: r.right, bottom: r.bottom - pb, left: r.left, width: r.width, height: r.height - pt - pb }; }) };
      });
      assert(band.rows.length >= 2 && band.rows.every((row) => row.width > 0 && row.height > 0), `the galaxy popup's word band is missing a line: ${JSON.stringify(band.rows)}`);
      const runOn = band.rows.slice(1).map((row, i) => [band.rows[i], row]).filter(([above, below]) => below.top < above.bottom - 1).map(([above, below]) => `${above.part} and ${below.part}`);
      assert.equal(runOn.length, 0, `the galaxy popup runs its word, reading and meaning together on one line (${runOn.join('; ')}): ${JSON.stringify(band.rows)}`);
      assert(band.entry.width >= 44 && band.entry.height >= 44 && band.band.height >= 44, `the galaxy popup's door into the full entry is under 44px: ${JSON.stringify({ entry: band.entry, band: band.band })}`);
      assert(band.entryName === 'Open the full entry' && band.entryOnTop && band.bandIsDoor && band.chevron && !band.entryButton,
        `the galaxy popup's band is not the door into the full entry: ${JSON.stringify({ name: band.entryName, onTop: band.entryOnTop, bandIsDoor: band.bandIsDoor, chevron: band.chevron, entryButton: band.entryButton })}`);
      assert(band.band.left >= band.card.left - 1 && band.band.right <= band.card.right + 1 && band.band.top >= band.card.top - 1 && band.band.bottom <= band.card.bottom + 1
        && band.band.left >= 0 && band.band.right <= band.screen.width && band.band.top >= 0 && band.band.bottom <= band.screen.height,
        `the galaxy popup's band leaves its card or the screen: ${JSON.stringify(band)}`);
      await page.locator('#mini #mini-take').click();
      await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5_000 });
      await waitForAppRecord(page, (r) => cardsFor(r, before.word).length === 1, { description: 'the galaxy popup saved one card' });
      const saved = await path();
      assert(saved.save === 'Saved ✓' && saved.list && !saved.note, `after Save the galaxy popup does not unfold its menu: ${JSON.stringify(saved)}`);
      // the menu's Review row is the way back out; Escape folds the menu away and the card is as before
      await page.locator('#mini #mini-review').uncheck();
      await waitForAppRecord(page, (r) => cardsFor(r, before.word).length === 0, { description: 'Review off takes the card out' });
      await page.waitForFunction(() => document.querySelector('#mini #mini-take')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5_000 });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('vocabulary-list-popover'), null, { timeout: 5_000 });
      const undone = await path();
      assert(undone.save === 'Save' && !undone.list && !undone.note, `after Review off the galaxy popup still shows its menu, or a caption beside Save: ${JSON.stringify(undone)}`);
      return { taps, entry: entry.node, word: before.word, before, saved, undone, band: { rows: band.rows.map((row) => `${row.part}@${Math.round(row.top)}`), entry: [Math.round(band.entry.width), Math.round(band.entry.height)] } };
    });

    await run('G6-sentence-row', DESK, async (page) => {
      await openArticle(page, ARTICLE);
      await setUpDeviceTutor(page); // precondition now (Hfix-1B, item 11): a tutor set up, so the pane offers Ask the tutor
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
        // S · the sentence's keep is the one Save (button.save-one, Save · Saved ✓); it pinned "Save the sentence" with a hint line
        keep: (() => { const k = document.querySelector('#mini .mini-sentence-pane #reader-context-save'); return k && { one: k.matches('button.save-one[data-save-one]'), text: k.textContent }; })(),
      }));
      assert.deepEqual([pane.marked, pane.choices, pane.keep], ['郊外', ['Ask the tutor', 'Practice it'], { one: true, text: 'Save' }], `the sentence pane: ${JSON.stringify(pane)}`);
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

    await run('G6-sentence-below-seat-390', PHONE, async (page) => {
      const pageErrors = [], pageErrorDetails = [], networkEvents = [];
      const traceRequest = (event, request) => {
        if (/\/dict-v2\//u.test(request.url())) networkEvents.push({ event, phase: page.__verifierPhase || 'walk', url: request.url(), failure: request.failure()?.errorText || null });
      };
      page.on('request', (request) => traceRequest('request', request));
      page.on('requestfinished', (request) => traceRequest('finished', request));
      page.on('requestfailed', (request) => traceRequest('failed', request));
      page.on('pageerror', (error) => { pageErrors.push(error.message); pageErrorDetails.push({ phase: page.__verifierPhase || 'walk', message: error.message }); });
      await open(page);
      await page.locator('#shelf-body [data-passage="aozora:046605"] .shelf-open').first().click();
      const token = page.locator('#reader .tok[data-index="816"]');
      await token.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      // the public fixture seats token 816 at the viewport top it had at article scroll 4716 before the ladder
      // (332 px down a 390×844 screen, its card below it); the page has grown, so the scroll is derived from the token
      const fixture = await page.evaluate(() => {
        const t = document.querySelector('#reader .tok[data-index="816"]').getBoundingClientRect();
        const y = Math.round(t.top + scrollY - 332);
        window.scrollTo(0, y);
        return { y, top: document.querySelector('#reader .tok[data-index="816"]').getBoundingClientRect().top };
      });
      assert(Math.abs(fixture.top - 332) <= 1.5 && fixture.y > 0, `the fixture seats the word at 332 px: ${JSON.stringify(fixture)}`);
      await tapToken(page, 816, { scroll: false }); // G3 · a tap on the word the fixture seats, where it stands
      await page.waitForSelector('#mini #mini-sentence-open');
      await page.waitForTimeout(400);
      const seat = () => page.evaluate(() => {
        const anchor = document.querySelector('#reader .tok[data-index="816"]').getBoundingClientRect();
        const mini = document.querySelector('#mini'), card = mini.getBoundingClientRect();
        return {
          word: mini.querySelector('.mini-word')?.textContent,
          anchor: { top: anchor.top, bottom: anchor.bottom, left: anchor.left, right: anchor.right },
          card: { top: card.top, bottom: card.bottom,
            side: card.top >= anchor.bottom ? 'below' : card.bottom <= anchor.top ? 'above' : 'overlap' },
          sentence: mini.querySelector('.mini-sentence-pane')?.hidden === false,
          quote: mini.querySelector('.mini-sentence-full')?.textContent,
          scrollY,
        };
      });
      const word = await seat();
      assert.equal(word.word, '大丈夫', 'token 816 of やまなし opens its own word');
      assert.equal(word.scrollY, fixture.y, `The public below-word fixture keeps its article scroll (${fixture.y})`);
      assert.equal(word.card.side, 'below', `the public fixture must start with the word card below its anchor: ${JSON.stringify(word)}`);
      assert.equal(word.sentence, false, 'The public fixture starts on the word view');
      await page.locator('#mini #mini-sentence-open').click();
      await page.waitForTimeout(400);
      const sentence = await seat();
      assert.equal(sentence.sentence, true, 'Study this sentence opens the sentence view');
      assert.equal(sentence.quote, '大丈夫だ、安心しろ。', 'The sentence view carries the chosen public sentence');
      assert.equal(sentence.card.side, 'below', `opening a shorter sentence must keep the below-word seat: ${JSON.stringify({ word, sentence })}`);
      assert(Math.abs(sentence.card.top - word.card.top) <= 1,
        `opening a shorter sentence moved the below-word card's top: ${JSON.stringify({ word, sentence })}`);
      assert.equal(sentence.scrollY, word.scrollY, 'Opening the below-word sentence must not move the article scroll');
      assert.deepEqual(sentence.anchor, word.anchor, 'Opening the below-word sentence must not move its token anchor');
      assert.deepEqual(pageErrors, [], 'The public below-word sentence path must have no page errors');
      return { article: 'aozora:046605', index: 816, word, sentence, pageErrors };
    });

    for (const [label, viewport] of [['390', PHONE], ['320', NARROW]]) {
      await run(`G6-sentence-pane-seat-${label}`, viewport, async (page) => {
        await openArticle(page, ARTICLE);
        await setUpDeviceTutor(page); // precondition now (Hfix-1B, item 11): a tutor set up, so Tab meets Ask the tutor first
        await tapToken(page, SUBURB);
        const box = () => page.locator('#mini').evaluate((node) => {
          const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height,
            clipped: !!node.style.maxHeight, side: node.dataset.side,
            // G6 · the chrome's edge is the frame's foot: the scale thread stands under the bar as its second row
            chromeBottom: Math.max(...['#app > .chrome', '#app > .scale-thread'].map((sel) => {
              const edge = document.querySelector(sel);
              return edge && ['fixed', 'sticky'].includes(getComputedStyle(edge).position) ? edge.getBoundingClientRect().bottom : 0;
            })) };
        });
        const focused = () => page.evaluate(() => {
          const mini = document.querySelector('#mini'), active = document.activeElement;
          const r = active.getBoundingClientRect(), m = mini.getBoundingClientRect();
          return { id: active.id, inside: mini.contains(active), scrollY,
            control: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
            popup: { top: m.top, bottom: m.bottom, left: m.left, right: m.right } };
        });
        const revealFrames = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
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
        assert.equal(await page.locator('#mini #mini-sentence-open').isVisible(), false,
          'The sentence door is hidden while its pane is open');
        assert(Math.abs(sentence.top - word.top) <= 1, `opening the sentence moved the card's top edge: ${JSON.stringify({ word, sentence })}`);
        assert(sentence.bottom <= viewport.height, `the sentence card falls outside the screen: ${JSON.stringify(sentence)}`);
        assertFocus(focus, beforeScroll);
        await page.keyboard.press('Tab');
        await revealFrames();
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
        // 郊外's card still floats over the text (its band is a door into the entry): put it away first, as a finger
        // would have to, then tap the next word where it stands
        await page.locator('#mini').focus();
        await page.keyboard.press('Escape');
        await page.locator('#mini').waitFor({ state: 'detached' });
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
        await revealFrames();
        const shortAskFocus = await focused();
        assertFocus(shortAskFocus, shortScroll, 'reader-teacher');
        await page.keyboard.press('Tab');
        await revealFrames();
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
        // Save ▾ (1.3.0): the save unfolds the menu inside the card (its opening puts the Save toast away)
        await page.waitForSelector('#mini #vocabulary-list-popover.is-inline #vocabulary-list-new');
        const saved = await page.evaluate(measureReaderMotion);
        assert(saved.animations > word.animations - 1, `motion check did not observe the saved popup and its menu: ${JSON.stringify(saved.covered)}`);
        assert.deepEqual(saved.violations, [], 'The saved popup and its menu may animate only transform and opacity');
        await page.locator('#vocabulary-list-new').click();
        await page.waitForSelector('#vocabulary-list-popover #vocabulary-list-create');
        const lists = await page.evaluate(measureReaderMotion);
        assert.equal(lists.covered.listAdd, 1, `motion check did not observe the menu's Add: ${JSON.stringify(lists.covered)}`);
        assert.deepEqual(lists.violations, [], 'The menu may animate only transform and opacity');
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await page.locator('#dials-toggle').click();
        await page.waitForSelector('.dials .seg button');
        const settings = await page.evaluate(measureReaderMotion);
        assert(settings.covered.settings > 0, `motion check did not observe the text settings: ${JSON.stringify(settings.covered)}`);
        assert.deepEqual(settings.violations, [], 'The text settings may animate only transform and opacity');
        await page.locator('#dials-toggle').click();
        await focusToken(page, SUBURB);
        await page.keyboard.press('Shift+F10');
        await page.waitForSelector('#seal-strip');
        const menu = await page.evaluate(measureReaderMotion);
        assert.equal(menu.covered.menu, 1, `motion check did not observe the strip: ${JSON.stringify(menu.covered)}`);
        assert.deepEqual(menu.violations, [], 'The strip may animate only transform and opacity');
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
      // S · no provenance in the learner's app (John, 2026-10-16): this pinned "a 未確認 chip on unreviewed tests"; the new
      // truth is no provenance chip or line in the room or a question — the review state stays in the form's record
      const leaks = [room.text, question].flatMap((t) => t.match(/.{0,20}(awaiting John|machine-checked|Made by AI|AI作成|Written by AI|AIが書きました|not yet checked|未確認|人の確認).{0,20}/giu) || []);
      assert.equal(leaks.length, 0, `diagnostic or provenance wording: ${leaks.join(' | ')}`);
      assert.equal(room.chips, 0, `${room.chips} provenance chips on the tests`);
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
      const first = page.locator('#reader [data-reader-prose][tabindex="0"]').first();
      const idle = await page.evaluate(() => ({ paragraphs: document.querySelectorAll('#reader [data-reader-prose][tabindex="0"]').length,
        buttons: document.querySelectorAll('#reader button.tok, #reader .tok[role="button"]').length }));
      assert.deepEqual(idle, { paragraphs, buttons: 0 }, 'idle prose must have one paragraph stop and no word buttons');
      await first.focus();
      await page.keyboard.press('Home');
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
        // the bar stands folded to its mark (one-hand 5a-ii): the mark opens it before its play control is pressed
        if (await listen.count()) {
          await page.locator('#listen-open').click();
          await page.waitForSelector('.listen-row.play-bar[data-open="true"]', { timeout: 5000 });
          if (await listen.isEnabled()) { await listen.click(); await page.waitForTimeout(1500); }
        }
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
    verifierSha256,
    control: withControl ? (spacingOnly ? '8px padding after the actual 郊外 token' : '8px token padding; rt and ruby::before forced to 0.46em') : null,
    scope: fixesOnly ? 'R1 fragment spacing, W2 saved page return, G6 pinned below seat, and G8 motion coverage only; other design gates not run' : spacingOnly ? 'R1 actual inline-fragment widths and same-line printed-token gaps at 1368/390 only; no other design gates' : 'Design pass steps 1–2: reader token flushness, readability, first screen; shelf wording, first story and text-first cards; no F1 audio; glance pass: the study tools behind one button, a one-line title block, no clipped row at 320/390/1368, the silent fresh-record word demonstration with no permanent tip, ダマスカス savable, one word one card; reader lane: reading then stage shows the meaning, the word menu saves one card, Save is one tap with Undo, the menu by keyboard, the lists popover, the sentence row and phone seating, sentence Save without activation, the version switch with 44px hit boxes, transform/opacity-only motion across the reader room and the popup Save and list path, the same one path in the galaxy, return from Practice on lookup and content words with motion enabled, a public below-word sentence seat with unchanged anchor and article scroll, and Japanese punctuation line breaks with source text preserved',
    browserVersions,
    selectedScope: fixesOnly ? 'Six exact changed or diagnosed design cases per engine' : spacingOnly ? 'R1 spacing only, both viewport sizes' : g3Only ? 'G3 demonstration, stage, keyboard and prose; older design gates not run' : 'all design gates',
    results,
    passed: results.length === engines.length * (fixesOnly ? 6 : spacingOnly ? 2 : g3Only ? 7 : 50) && results.every((row) => row.passed),
  };
  writeFileSync(resolve(evidence, 'design-reader-shelf.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`${results.filter((r) => r.passed).length}/${results.length} passed · evidence ${evidence}`);
  if (!receipt.passed) process.exitCode = 1;
}
