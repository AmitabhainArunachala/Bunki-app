/** verify-word-grammar · the word grammar's walk (MASTER_SPEC §4 G; G_PROGRAM_DESIGN §4). Slice G1 writes its "page" part:
 * the entry is a page, not a sheet (John, 2026-10-15: "this should come to the WHOLE SCREEN. not a swipable window… not have
 * that UGLY gap at the top"). Later G slices add their parts here. Served build only, WebKit and Chromium, 390×844, touch,
 * service workers blocked; every page error fails its walk and none is filtered.
 *   P1  the page: tap a reader word → its card → the card's band → #sheet covers the viewport (top 0 ± 1, height = innerHeight
 *       ± 1, width = innerWidth), no .sheet-grip, no .scrim, no max-height, its paper opaque and the world's (--color-paper)
 *   P2  the match cut is one travelling word (G1b): the page is whole from the tap, no view transition runs, and a copy of
 *       the word (.cut-word, animation 'kairo-cut') leaves from the card's headword glyphs and lands on the page's headword
 *       glyphs (the same word), which wait unseen until it lands; the page was built ahead at idle (data-built="ahead")
 *   P3  G3 cycle: page Back → original stage → Escape → bare; direct Ctrl+Enter page Back → bare
 *   P4  a word inside the page opens its OWN card — exactly one, on that word, clear of the page's bar (Back never covered);
 *       its band → depth 2; Back → nested stage over depth 1; dismiss → depth 1; Back → original stage → bare
 *   P5  Escape steps back one visible level through each page and its origin stage
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
 *   P14 never two layers of text (G1b; John's "jaggedness": the reader and its card showed through the arriving page at
 *       80–240 ms): in 墨 and 夜, the cut held at 0/40/80/120/160/240/320 ms — every view-transition animation paused at the
 *       same moment — and read back as pixels. Where the old state had ink and the settled new state is plain ground
 *       (outside the flying word's path), nothing may still show from 80 ms on: the arrival (reader + card → page) and Back
 *       (page → bare reader). The held frames are the evidence (<engine>-P14-<world>-<arrive|back>-<t>ms.png).
 *   P15 the kanji tiles grow with their text (G1b; the critic's finding 3): each KANJI IN THIS WORD glyph at twice its size
 *       (both engines) — and, in Chromium, the whole page at 200 % text (-webkit-text-size-adjust, the critic's probe; WebKit
 *       on a desktop does not apply it) — stays inside its tile, and the tile keeps its 48 px floor
 * G3 negative controls: --controls replays stalled tap2, uncleared ruby and a front door; harness failures are incomplete.
 * --controls-only runs only the G3 and G4 candidate schedules, mutants and restores, with no frame measurements.
 * --g3-only is an explicit narrow slice, never a claim that the retained G1 gates passed.
 * G4 (one-hand/G4/BRIEF.md) — ink: at the second rung the stage's ceremony follows depth (new and met write themselves over
 *   their お手本, the reading flowing in over the last 40 %; seen again arrives written; recalled and owned arrive bare with
 *   読 · 意 on request); the tempo is min(110, 1400 ÷ strokes) ≥ 45 ms a stroke scaled by the ONE 書く速さ slider, measured
 *   slow > middle > fast; any tap, key or wheel finishes the writing at once and still acts; Settings 筆 (first meeting ·
 *   always · never) and the 筆 replay mark; a hold and the demonstration never write; reduced motion arrives written; the
 *   stroke page's first frame holds the whole character as a faint ghost and the bug rail never overlaps the readings;
 *   声 is recorded audio only; WebKit frames ≤ 24 ms across the writing and its interrupt. --g4-only runs only G4.
 *   G4 negative controls (with --controls): the tap that finishes the writing is consumed → G4.interrupt.save-acts red;
 *   no ghost on the board → G4.ghost.first-frame and .first-pixels red; a second speed control → G4.one-speed red.
 * Negative controls (one-hand/G1/neg-control): the 91dvh cap back → P1 red; the scrim re-appended → P1 red; the word not
 * sent travelling (enterWord) → P2 red; the page fading in over the reader instead of arriving whole → P14 red. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';
import { readAppRecord } from './record-test-support.mjs';
import { restoreAppFixture } from './record-fixture-support.mjs';
import { serveMutation } from './reader-gloss-mutants.mjs';

assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable built site and its digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const verifierSha256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
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
const frames = [], browserVersions = {}, controls = [];
const controlsOnly = process.argv.includes('--controls-only');
const roomsOnly = process.argv.includes('--rooms-only');
const sentencesOnly = process.argv.includes('--sentences-only');
const kanaOnly = process.argv.includes('--kana-only');
const skyReadingsOnly = process.argv.includes('--sky-readings-only');
assert([controlsOnly, roomsOnly, sentencesOnly, kanaOnly, skyReadingsOnly].filter(Boolean).length <= 1, 'Choose one explicit narrow schedule');
const g4Only = process.argv.includes('--g4-only');
assert(!(g4Only && (controlsOnly || roomsOnly || sentencesOnly || kanaOnly || skyReadingsOnly)), 'Choose one explicit narrow schedule');
const g3Only = controlsOnly || roomsOnly || sentencesOnly || kanaOnly || skyReadingsOnly || process.argv.includes('--g3-only');
const withControls = controlsOnly || process.argv.includes('--controls');

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
  const story = opts?.story || STORY;
  await boot(page, opts);
  const direct = page.locator(`[data-passage="${story.id}"]:not([data-recommendation]) .shelf-open`).first();
  if (await direct.count()) await direct.click();
  else {
    await openShelfTools(page);
    await page.locator('#shelf-reading-search').fill(story.search);
    await page.locator('#shelf-reading-search').press('Enter');
    await page.locator(`#shelf-reading-results [data-passage="${story.id}"] .shelf-open`).first().click();
  }
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 20000 });
  await delay(900);
}
const readerWord = (page, label = WORD) => page.locator(`#reader .tok[data-prose-label="${label}"]`).first();
const visibleReading = (node) => [...node.querySelectorAll('ruby')].some((ruby) => {
  const rt = ruby.querySelector('rt');
  if (!rt?.textContent.trim()) return false;
  const style = getComputedStyle(rt);
  // The marker alone is not evidence of hidden ink: outside .reader it once
  // had no matching CSS at all. Judge the browser's actual rendered style.
  if (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rt.getClientRects().length > 0) return true;
  // The reader paints on-touch ruby in ::before to keep line geometry; deck backs use ::after.
  return ['::before', '::after'].some((pseudo) => {
    const ink = getComputedStyle(ruby, pseudo);
    return !['none', 'normal', '""', "''", ''].includes(ink.content) && ink.display !== 'none' && ink.visibility !== 'hidden' && Number(ink.opacity) > 0;
  });
});
/** Advance only an observed reading rung; a dead door is never rescued with an unconditional extra tap. */
async function stage(page, locator) {
  // A revealed ruby changes textContent. Retain the selected occurrence so
  // a text-filtered locator cannot silently move tap two to a neighboring word.
  const occurrence = await locator.elementHandle();
  assert(occurrence && await occurrence.evaluate((node) => node.isConnected), 'stage starts on a connected occurrence');
  await occurrence.tap();
  await page.waitForFunction((node) => !!document.getElementById('mini') || node.dataset.ladderRung === 'reading',
    occurrence, { timeout: 10000 });
  assert(await occurrence.evaluate((node) => node.isConnected), 'first activation must retain the same occurrence');
  if (!await page.locator('#mini').count()) {
    assert.equal(await occurrence.evaluate((node) => node.dataset.ladderRung), 'reading', 'only an observed reading rung permits tap two');
    await occurrence.tap();
  }
  await page.locator('#mini .mini-word').waitFor();
  assert(await occurrence.evaluate((node) => node.isConnected), 'the stage must retain its exact originating occurrence');
}
async function focusWord(page, locator) {
  const at = await locator.evaluate((node) => [...node.closest('[data-prose-roving]').querySelectorAll('.tok[data-para]')].indexOf(node));
  assert(at >= 0, 'the word belongs to its paragraph rover');
  await locator.locator('xpath=ancestor::*[@data-prose-roving][1]').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < at; i++) await page.keyboard.press('ArrowRight');
}
async function furigana(page, value) {
  await page.locator('#dials-toggle').click();
  await page.locator(`[data-dial="furigana:${value}"]`).click();
  await page.locator(`[data-dial="furigana:${value}"][aria-pressed="true"]`).waitFor();
  await page.locator('#dials-toggle').click();
}
async function ladderFacts(page, locator) {
  const reading = await locator.evaluate(visibleReading);
  return { reading, ...await page.evaluate(() => ({
    stages: document.querySelectorAll('#mini').length, page: !!document.getElementById('sheet'),
    word: document.querySelector('#mini .mini-word')?.textContent.trim() ?? null,
    save: document.querySelector('#mini #mini-take')?.disabled ?? null,
  })) };
}
async function leaveStage(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('mini'));
  await delay(250);
}
/** The page has arrived: present, and no page transition still running. */
async function pageSettled(page) {
  await page.locator('#sheet').waitFor({ timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('.cut-word') && !document.getAnimations().some((a) => a.id === 'kairo-cut' || String(a.effect?.pseudoElement || '').startsWith('::view-transition')), null, { timeout: 5000 }).catch(() => {});
  await delay(250);
}
async function bare(page) {
  await page.waitForFunction(() => !document.getElementById('sheet'), null, { timeout: 10000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('.cut-word') && !document.getAnimations().some((a) => a.id === 'kairo-cut' || String(a.effect?.pseudoElement || '').startsWith('::view-transition')), null, { timeout: 5000 }).catch(() => {});
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
    onPage: mini.hasAttribute('data-page') };
});
/** rAF deltas over the window, from just before a real tap on the locator. */
async function measure(page, locator) {
  if (typeof locator !== 'function') await locator.scrollIntoViewIfNeeded();
  await delay(250);
  const box = typeof locator === 'function' ? null : await locator.boundingBox();
  if (typeof locator !== 'function' && !box) return null;
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
  if (typeof locator === 'function') await locator();
  else await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await delay(FRAME_WINDOW + 250);
  const t = await page.evaluate(() => window.__g1f);
  const deltas = t.slice(1).map((v, i) => Math.round((v - t[i]) * 10) / 10);
  return { worst: Math.max(...deltas), p95: [...deltas].sort((a, b) => a - b)[Math.ceil(deltas.length * 0.95) - 1], over24: deltas.filter((d) => d > 24).length, frames: deltas.length, deltas };
}
const luminance = (color) => {
  const m = String(color).match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
  const scale = String(color).startsWith('color(') ? 1 : 255;
  const [r, g, b] = m.slice(0, 3).map((v) => { const c = v / scale; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/* The glyphs of a word on the screen, as corridor.js's glyphBox reads them: the union of its text's boxes, readings,
 * glosses and a headword's other spellings left out. */
const GLYPHS = () => {
  window.__glyphs = (element) => {
    if (!element?.isConnected) return null;
    const range = document.createRange(), walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.trim() || node.parentElement?.closest('rt, rp, .tok-en, .tok-state, .visually-hidden, .headword-alt')) continue;
      range.selectNodeContents(node);
      for (const box of range.getClientRects()) {
        if (!box.width || !box.height) continue;
        left = Math.min(left, box.left); top = Math.min(top, box.top); right = Math.max(right, box.right); bottom = Math.max(bottom, box.bottom);
      }
    }
    return Number.isFinite(left) ? { left: Math.round(left * 10) / 10, top: Math.round(top * 10) / 10, width: Math.round((right - left) * 10) / 10, height: Math.round((bottom - top) * 10) / 10 } : null;
  };
};
const glyphsOf = (page, selector) => page.evaluate((s) => window.__glyphs(document.querySelector(s)), selector);
/* G4 · every change of a stage headword's ink (data-ink: arriving · writing · settling; data-ink-ended: written · input ·
 * replaced), with the document clock and what the word held then — read by the walks, never written back. */
const INK_TRACE = () => {
  window.__ink = [];
  new MutationObserver((records) => {
    for (const record of records) {
      const word = record.target;
      if (!(word instanceof Element) || !word.classList.contains('mini-word')) continue;
      window.__ink.push({ at: performance.now(), name: record.attributeName, ink: word.dataset.ink ?? null, ended: word.dataset.inkEnded ?? null,
        chars: word.querySelectorAll('.ink-char').length, text: word.textContent });
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-ink', 'data-ink-ended'] });
};
/* G4 · 声 is recorded audio only: count every Audio made, every media play and every device-speech call. Counting only —
 * each call still reaches the native (test-silenced) implementation unchanged. */
const VOICE_SPY = () => {
  const spy = window.__voice = { audio: 0, plays: 0, speak: 0, utterances: 0, attempts: 0 };
  const NativeAudio = window.Audio;
  if (typeof NativeAudio === 'function') {
    window.Audio = new Proxy(NativeAudio, { construct(target, args, newTarget) { spy.audio += 1; return Reflect.construct(target, args, newTarget); } });
  }
  const media = window.HTMLMediaElement?.prototype;
  const play = media && Object.getOwnPropertyDescriptor(media, 'play');
  if (typeof play?.value === 'function') Object.defineProperty(media, 'play', { ...play, value: new Proxy(play.value, { apply(target, receiver, args) { spy.plays += 1; return Reflect.apply(target, receiver, args); } }) });
  const speech = window.SpeechSynthesis?.prototype;
  const speak = speech && Object.getOwnPropertyDescriptor(speech, 'speak');
  if (typeof speak?.value === 'function') Object.defineProperty(speech, 'speak', { ...speak, value: new Proxy(speak.value, { apply(target, receiver, args) { spy.speak += 1; return Reflect.apply(target, receiver, args); } }) });
  if (typeof window.SpeechSynthesisUtterance === 'function') {
    window.SpeechSynthesisUtterance = new Proxy(window.SpeechSynthesisUtterance, { construct(target, args, newTarget) { spy.utterances += 1; return Reflect.construct(target, args, newTarget); } });
  }
};
/** Two glyph boxes in the same place at the same size: 3 px, and 8 % of the height (2 px at least). */
const near = (a, b) => !!a && !!b && Math.abs(a.left - b.left) <= 3 && Math.abs(a.top - b.top) <= 3 && Math.abs(a.height - b.height) <= Math.max(2, b.height * 0.08);

/* P14 · the cut held still. Armed just before the tap: the first frame that runs the cut (the travelling word, or a view
 * transition) pauses every animation the tap started — the cut's, and anything that moves with it (a page fading in is held
 * too) — and each moment sets all of them to the same time t (each just short of its own end, so the cut stays open). */
const MOMENTS = Object.freeze([0, 40, 80, 120, 160, 240, 320]);
const armHold = (page) => page.evaluate(() => {
  const since = window.__cutSince = document.timeline.currentTime;
  const held = window.__cutHeldSet = new Set();
  window.__cutHeld = new Promise((done) => {
    const watch = () => {
      const all = document.getAnimations();
      if (!all.some((a) => a.id === 'kairo-cut' || String(a.effect?.pseudoElement || '').startsWith('::view-transition'))) { requestAnimationFrame(watch); return; }
      for (const a of all) if (a.pending || (a.startTime !== null && a.startTime >= since - 1)) { a.pause(); held.add(a); }
      done(held.size);
    };
    requestAnimationFrame(watch);
  });
});
const heldCount = (page) => page.evaluate(() => Promise.race([window.__cutHeld, new Promise((done) => setTimeout(() => done(0), 4000))]));
async function holdAt(page, t) {
  await page.evaluate((ms) => {
    const since = window.__cutSince, held = window.__cutHeldSet;
    for (const a of document.getAnimations()) if (a.pending || (a.startTime !== null && a.startTime >= since - 1)) held.add(a);
    for (const a of held) {
      a.pause();
      a.currentTime = Math.max(0, Math.min(ms, a.effect.getComputedTiming().endTime - 1));
    }
  }, t);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  return page.screenshot();
}
const releaseHold = (page) => page.evaluate(() => { for (const a of window.__cutHeldSet || []) a.play(); });
const boxOf = (page, selector) => page.evaluate((s) => {
  const r = document.querySelector(s)?.getBoundingClientRect();
  return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
}, selector);
/** An 8-bit RGB/RGBA PNG (what both engines' screenshots are), unfiltered to RGB bytes. */
function decodePng(buffer) {
  let at = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at), kind = buffer.toString('latin1', at + 4, at + 8), data = buffer.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    at += 12 + length;
  }
  assert(depth === 8 && (type === 2 || type === 6) && interlace === 0, `unexpected screenshot PNG: depth ${depth}, colour type ${type}, interlace ${interlace}`);
  const bpp = type === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(idat)), px = new Uint8Array(width * height * 3);
  let prev = new Uint8Array(stride), line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = v & 255;
    }
    for (let x = 0; x < width; x++) for (let k = 0; k < 3; k++) px[(y * width + x) * 3 + k] = line[x * bpp + k];
    [prev, line] = [line, prev];
  }
  return { width, height, px };
}
const apart = (p, i, q, j) => Math.max(Math.abs(p[i] - q[j]), Math.abs(p[i + 1] - q[j + 1]), Math.abs(p[i + 2] - q[j + 2]));
/** Old-state ink still on the glass. The mask: pixels where the screen just before the tap (`before`, the old state) has
 * ink — 64 or more apart from the settled new state — and the settled new state is plain there (flat: within 8 of each
 * neighbour 2 px away; a world's paper grain moves 1–4), outside the travelling word's road (`clear`, CSS px). Per held
 * moment: the share of the mask (%) that still differs from the settled state by more than 8. */
function oldInkOnGlass(before, held, settled, clear, scale) {
  const { width, height, px } = settled, mask = [];
  const flat = (x, y, i) => [[2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dy]) => apart(px, i, px, ((y + dy) * width + x + dx) * 3) <= 8);
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const cx = x / scale, cy = y / scale;
      if (clear.some((b) => b && cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height)) continue;
      const i = (y * width + x) * 3;
      if (apart(before.px, i, px, i) >= 64 && flat(x, y, i)) mask.push(i);
    }
  }
  const share = {};
  for (const t of MOMENTS) {
    let lit = 0;
    for (const i of mask) if (apart(held[t].px, i, px, i) > 8) lit += 1;
    share[t] = mask.length ? Math.round((lit / mask.length) * 10000) / 100 : null;
  }
  return { mask: mask.length, share };
}
/** The flying word's path: the box spanning where it leaves and where it lands, with a margin. */
const pathOf = (a, b, m = 12) => (a && b ? { x: Math.min(a.x, b.x) - m, y: Math.min(a.y, b.y) - m,
  width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x) + 2 * m, height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) + 2 * m } : null);
const P14_LIMIT = 0.2; // % of the old state's ink still visible at any held moment from 80 ms on

try {
  for (engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    browserVersions[engine] = browser.version();
    console.log(`${engine} ${browserVersions[engine]}`);
    const walk = async (name, body, { viewport = { width: 390, height: 844 }, mobile = true, control = null, init = null, demo = false, reducedMotion = 'no-preference' } = {}) => {
      if (g3Only && !name.startsWith('G3')) return;
      if (g4Only && !name.startsWith('G4')) return;
      if (controlsOnly && !['G3-stalled', 'G3-clear', 'G3-front', 'G4-interrupt-save', 'G4-ghost', 'G4-one-speed'].includes(name)) return;
      if (roomsOnly && !['G3-words', 'G3-words-family', 'G3-sky', 'G3-sky-glyph', 'G3-particle'].includes(name)) return;
      if (sentencesOnly && name !== 'G3-front' && !name.startsWith('G3-sentence-')) return;
      if (kanaOnly && name !== 'G3-kana' && name !== 'G3-particle') return;
      if (skyReadingsOnly && name !== 'G3-sky-glyph' && name !== 'G3-particle') return;
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion });
      await context.addInitScript(GLYPHS);
      if (!demo) await context.addInitScript(() => localStorage.setItem('kairo-word-ladder-demo-v1', '1'));
      for (const script of [].concat(init || [])) await context.addInitScript(script);
      await silenceBrowserAudio(context);
      await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
      if (control) await serveMutation(context, { origin: host.origin, manifest: new Map(identity.files.map((file) => [file.path, file.sha256])), control, edits: control.edits });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => errors.push(error.message));
      try { await body(page); }
      catch (error) {
        if (control) control.error = String(error.stack || error);
        check(`${name}.error`, `${name} ran to the end`, false, String(error.stack || error).slice(0, 700));
        await page.screenshot({ path: resolve(evidence, `${engine}-${name}-error.png`) }).catch(() => {});
      } finally {
        if (control) control.pageErrors = errors;
        check(`${name}.page-errors`, `${name}: no page errors`, errors.length === 0, errors);
        await context.close();
      }
    };

    // These short schedules also run against named product mutations. Their checks always
    // record actual state; an exception, missing row or page error can never kill a mutant.
    const stalledProbe = async (page) => {
      await openStory(page);
      const word = readerWord(page);
      await word.tap(); await delay(300);
      const first = await ladderFacts(page, word);
      check('G3.control.reading', 'known on-touch first activation is reading only', first.reading && !first.stages && !first.page, first);
      await word.tap(); await delay(650);
      const second = await ladderFacts(page, word);
      check('G3.control.stage', 'second activation advances the revealed word to its stage', second.stages === 1 && second.word === WORD && !second.page, second);
    };
    const clearProbe = async (page) => {
      await openStory(page);
      const word = readerWord(page);
      await word.tap(); await delay(300);
      const first = await ladderFacts(page, word);
      check('G3.clear.reading', 'reading-clear fixture actually revealed its known reading', first.reading && !first.stages && !first.page, first);
      await page.keyboard.press('Escape'); await delay(300);
      const after = await ladderFacts(page, word);
      check('G3.clear.bare', 'Escape from the reading rung clears the raised ruby', !after.reading && !after.stages && !after.page, after);
    };
    const frontProbe = async (page) => {
      await page.goto(`${host.origin}/index.html?deck=mcd&ui=bi`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await page.locator('#kp-start').click();
      await page.locator('#kp-card .kp-sentence').waitFor();
      const facts = await page.evaluate(() => {
        const card = document.getElementById('kp-card');
        return { card: card.dataset.card, text: card.querySelector('.kp-sentence')?.textContent,
          reveal: !!document.getElementById('kp-reveal'),
          doors: card.querySelectorAll('.kp-sentence .kp-tok, .kp-sentence [data-deck-word], .kp-sentence [data-ladder-rung], .kp-sentence [role="button"]').length,
          readings: card.querySelectorAll('.kp-sentence rt').length, stages: document.querySelectorAll('#mini').length };
      });
      check('G3.front.fixture', 'the real deck has an unanswered card and nonempty Japanese sentence', !!facts.card && !!facts.text && facts.reveal, facts);
      check('G3.front.sealed', 'the unanswered sentence has no lookup doors, ruby or stage', facts.doors === 0 && facts.readings === 0 && facts.stages === 0, facts);
      const point = await page.locator('#kp-card .kp-sentence').evaluate((sentence) => {
        const walker = document.createTreeWalker(sentence, NodeFilter.SHOW_TEXT), range = document.createRange();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim()) continue;
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) {
            const x = Math.max(1, Math.min(innerWidth - 1, r.left + Math.min(r.width / 2, 12))), y = r.top + r.height / 2;
            if (x < innerWidth / 2 && y > 0 && y < innerHeight && sentence.contains(document.elementFromPoint(x, y))) return { x, y };
          }
        }
        return null;
      });
      assert(point, 'an uncovered sentence glyph is required for the sealed-front press');
      await page.touchscreen.tap(point.x, point.y); await delay(300);
      const after = await page.evaluate(() => ({ stage: !!document.getElementById('mini'), page: !!document.getElementById('sheet'), answered: !document.getElementById('kp-reveal') }));
      check('G3.front.press', 'a front sentence press cannot expose lookup help or answer the card', !after.stage && !after.page && !after.answered, after);
    };
    const schedules = {};
    for (const [name, probe] of [['G3-stalled', stalledProbe], ['G3-clear', clearProbe], ['G3-front', frontProbe]]) {
      const begin = rows.length;
      await walk(name, probe);
      schedules[name] = rows.slice(begin);
    }

    await walk('G3-ladder', async (page) => {
      for (const [mode, name] of [[1, 'on-touch'], [0, 'off'], [2, 'always']]) {
        await openStory(page);
        await furigana(page, mode);
        const word = readerWord(page);
        const moves = [];
        const takeMove = async (name, action) => { const timing = await measure(page, action); moves.push({ name, ...timing }); };
        await takeMove('bare→first', word);
        let first = await ladderFacts(page, word);
        check(`G3.${name}.first`, `${name}: first activation ${mode === 1 ? 'reveals only' : 'opens the stage without an empty reading rung'}`,
          mode === 1 ? first.reading && !first.stages && !first.page : first.stages === 1 && first.word === WORD && !first.page && first.reading === (mode === 2), first);
        if (mode === 1) await takeMove('reading→stage', word);
        const second = await ladderFacts(page, word);
        check(`G3.${name}.stage`, `${name}: one stage names the current word with a live Save`, second.stages === 1 && second.word === WORD && second.save === false && !second.page, second);
        await delay(1200);
        await takeMove('stage→page', page.locator('#mini .mini-word'));
        await pageSettled(page);
        check(`G3.${name}.page`, 'the stage band opens its own whole-screen page', coversViewport(await pageFacts(page)) && (await pageFacts(page)).headword.startsWith(WORD), await pageFacts(page));
        await takeMove('page→stage', page.locator('#sheet-back'));
        await bare(page);
        const returned = await ladderFacts(page, word);
        check(`G3.${name}.return-stage`, 'Back restores the same stage, not bare prose or another word', returned.stages === 1 && returned.word === WORD && !returned.page, returned);
        await takeMove('stage→bare', () => page.keyboard.press('Escape'));
        const gone = await ladderFacts(page, word);
        check(`G3.${name}.bare`, `${name}: stage Escape leaves no popup/page and ${mode === 2 ? 'retains always ruby' : 'clears summoned ruby'}`,
          !gone.stages && !gone.page && gone.reading === (mode === 2), gone);
        frames.push({ engine, grammar: 'G3', mode: name, moves });
        check(`G3.${name}.frames`, `${name}: per-move worst and p95 recorded${engine === 'webkit' ? ', every worst ≤ 24 ms' : ' (Chromium, never averaged with WebKit)'}`,
          moves.length === (mode === 1 ? 5 : 4) && moves.every((row) => Number.isFinite(row.worst) && Number.isFinite(row.p95) && (engine !== 'webkit' || row.worst <= 24)), moves.map(({ name, worst, p95 }) => ({ name, worst, p95 })));
      }
    });

    await walk('G3-direct-and-anchor', async (page) => {
      await openStory(page);
      const word = readerWord(page);
      await stage(page, word);
      await word.tap();
      await pageSettled(page);
      check('G3.anchor-third', 'tapping the same anchored word at the stage also opens its page', (await pageFacts(page)).headword.startsWith(WORD), await pageFacts(page));
      await page.keyboard.press('Escape'); await bare(page);
      check('G3.escape-stage', 'page Escape restores its stage', (await slipFacts(page)).word === WORD, await slipFacts(page));
      await leaveStage(page);
      await focusWord(page, word);
      await page.keyboard.press('Control+Enter'); await pageSettled(page);
      check('G3.direct-page', 'Ctrl+Enter opens the full entry directly', coversViewport(await pageFacts(page)), await pageFacts(page));
      await page.locator('#sheet-back').tap(); await bare(page);
      const direct = await ladderFacts(page, word);
      check('G3.direct-bare', 'a direct page returns directly to bare prose without inventing a stage', !direct.page && !direct.stages && !direct.reading, direct);
      await word.tap(); await delay(250);
      await page.locator('.reader-meta').click(); await delay(250);
      const outside = await ladderFacts(page, word);
      check('G3.outside-reading', 'outside press folds the reading rung to bare', !outside.reading && !outside.stages && !outside.page, outside);
      const pinch = await word.evaluate((node) => {
        const actions = [];
        for (let at = node; at; at = at.parentElement) actions.push({ tag: at.tagName, action: getComputedStyle(at).touchAction });
        return { actions, viewport: document.querySelector('meta[name="viewport"]')?.content || '' };
      });
      check('G3.native-pinch', 'native pinch remains allowed by text ancestors and viewport policy (physical gesture excluded)',
        pinch.actions.every(({ action }) => action !== 'none' && (!/pan-[xy]/u.test(action) || action.includes('pinch-zoom'))) && !/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(?:\D|$)/iu.test(pinch.viewport), pinch);
    });

    await walk('G3-current-save', async (page) => {
      await openStory(page, { story: { id: 'aozora:049966-1', search: '河口慧海' } });
      const meaning = page.locator('#reader .tok[data-index="540"]');
      const shina = page.locator('#reader .tok[data-index="547"]');
      await stage(page, meaning);
      const first = await page.locator('#chrome-keep').getAttribute('aria-label');
      check('G3.save.fixture', 'the first stage and bar refer to 意味', (await slipFacts(page)).word === '意味' && /意味/u.test(first || ''), { first, stage: await slipFacts(page) });
      await leaveStage(page);
      await stage(page, shina);
      await page.waitForFunction(() => document.getElementById('mini')?.getAttribute('aria-busy') !== 'true');
      const state = await page.evaluate(() => { const bar = document.getElementById('chrome-keep'), save = document.querySelector('#mini #mini-take'); return {
        word: document.querySelector('#mini .mini-word')?.textContent.trim(), held: save?.disabled, bar: bar && { name: bar.getAttribute('aria-label'), text: bar.textContent, disabled: bar.disabled, held: bar.classList.contains('reader-capture-held'), rest: bar.hasAttribute('data-save-rest') },
      }; });
      check('G3.save.current', 'unconfirmed シナ holds Save and never leaves live 意味 in the top bar', state.word === 'シナ' && state.held === true && (!state.bar || state.bar.rest || (state.bar.held && /シナ/u.test(`${state.bar.name} ${state.bar.text}`))) && !/意味/u.test(`${state.bar?.name} ${state.bar?.text}`), state);
      const beforeSave = await readAppRecord(page);
      if (state.bar && !state.bar.disabled) await page.locator('#chrome-keep').click();
      await delay(500);
      const record = await readAppRecord(page);
      check('G3.save.no-phantom', 'changing stage never saves the previous word', JSON.stringify(record.taken) === JSON.stringify(beforeSave.taken) && !record.taken.some((item) => item.t === 'word' && item.id === '意味'), record.taken);
    });

    await walk('G3-kana', async (page) => {
      await openStory(page, { story: { id: 'global-voices:2026-09-28-65726', search: 'ダマスカス' } });
      const word = page.locator('#reader .tok[data-index="0"]');
      check('G3.kana.fixture', 'the first word is the authored ダマスカス fixture', await word.getAttribute('data-prose-label') === 'ダマスカス', await word.textContent());
      await word.tap(); await delay(600);
      const same = await ladderFacts(page, word);
      check('G3.kana.identical', 'identical kana, including hiragana/katakana equivalents, skips an empty reading rung', same.stages === 1 && same.word === 'ダマスカス' && !same.page && !same.reading, same);
      await page.keyboard.press('Escape'); await delay(200);
      const particle = readerWord(page, 'の');
      await particle.tap(); await delay(600);
      const part = await ladderFacts(page, particle);
      check('G3.kana.particle', 'a one-character particle is a word door and reaches a nonempty stage', part.stages === 1 && !!part.word && !part.page, part);
      const particleSave = await page.evaluate(() => ({ miniSave: !!document.querySelector('#mini #mini-take'),
        barRest: document.getElementById('chrome-keep')?.hasAttribute('data-save-rest'),
        barKey: document.getElementById('chrome-keep')?.dataset.saveKey, barName: document.getElementById('chrome-keep')?.getAttribute('aria-label') }));
      check('G3.kana.particle-save-rest', 'a particle stage with no Save leaves the bar at rest with no previous target',
        !particleSave.miniSave && particleSave.barRest === true && particleSave.barKey === '', particleSave);
      const beforeParticleSave = await readAppRecord(page);
      await page.locator('#chrome-keep').click(); await delay(400);
      const afterParticleSave = await readAppRecord(page);
      check('G3.kana.particle-no-card', 'pressing the resting bar creates no particle card or stale previous-word card',
        JSON.stringify(beforeParticleSave.taken) === JSON.stringify(afterParticleSave.taken), { before: beforeParticleSave.taken, after: afterParticleSave.taken });
    });

    for (const surface of ['example', 'page']) for (const [mode, name] of [[0, 'off'], [1, 'on-touch'], [2, 'always']]) {
      await walk(`G3-sentence-${surface}-${name}`, async (page) => {
        await openStory(page); await furigana(page, mode);
        const month = page.locator('#reader .tok[data-index="4"]');
        assert.equal(await month.getAttribute('data-prose-label'), '月', 'the authored counting-month fixture stays exact');
        await stage(page, month); await page.locator('#mini .mini-word').tap(); await pageSettled(page);
        let target = page.locator('#sheet .example-ja .sentence-tok[data-prose-label="年"]').first();
        await target.waitFor();
        if (surface === 'page') {
          await target.locator('xpath=ancestor::p[contains(@class,"example-ja")][1]').locator('.sent-door').tap();
          await page.locator('#sheet .sent-reader').waitFor(); await delay(350);
          target = page.locator('#sheet .sent-reader .sentence-tok[data-prose-label="年"]').first();
        }
        await target.scrollIntoViewIfNeeded(); await delay(300);
        const id = `G3.sentence.${surface}.${name}`;
        const state = async () => ({ ...await ladderFacts(page, target), ...await target.evaluate(node => ({
          surface: node.dataset.proseLabel, outsideReader: !node.closest('.reader'), rung: node.dataset.ladderRung || null,
          annotations: [...node.querySelectorAll('rt')].map(rt => { const s = getComputedStyle(rt); return { text: rt.textContent,
            class: rt.className, display: s.display, visibility: s.visibility, opacity: s.opacity, boxes: rt.getClientRects().length }; }),
          parentPage: document.getElementById('sheet')?.dataset.node,
        })) });
        const resting = await state(), parentPage = resting.parentPage;
        check(`${id}.bare`, `${surface}/${name}: actual ruby ink is ${mode === 2 ? 'visible' : 'absent'} before activation outside .reader`,
          resting.surface === '年' && resting.outsideReader && !resting.stages && resting.reading === (mode === 2) &&
          (mode === 0 ? resting.annotations.length === 0 : resting.annotations.some(rt => rt.text === 'ねん')), resting);
        await target.tap(); await delay(350);
        const first = await state();
        check(`${id}.first`, `${surface}/${name}: first activation ${mode === 1 ? 'visibly reveals only reading' : 'opens the stage without an empty rung'}`,
          first.parentPage === parentPage && (mode === 1
            ? first.reading && first.rung === 'reading' && !first.stages
            : first.stages === 1 && first.word === '年' && first.reading === (mode === 2)), first);
        if (mode === 1) { await target.tap(); await delay(350); }
        const staged = await state();
        check(`${id}.stage`, `${surface}/${name}: one stage retains the occurrence and the rendered reading policy`,
          staged.stages === 1 && staged.word === '年' && staged.parentPage === parentPage && staged.reading === (mode !== 0), staged);
        if (staged.stages !== 1) return;
        await page.locator('#mini .mini-word').tap(); await pageSettled(page);
        const full = await pageFacts(page);
        check(`${id}.page`, 'the sentence word opens its own whole-screen entry', coversViewport(full) && full.headword.startsWith('年'), full);
        await page.locator('#sheet-back').tap(); await delay(550);
        const returned = await state();
        check(`${id}.return-stage`, 'Back restores the same sentence stage above its original page',
          returned.stages === 1 && returned.word === '年' && returned.parentPage === parentPage && returned.reading === (mode !== 0), returned);
        await page.keyboard.press('Escape'); await delay(350);
        const gone = await state();
        check(`${id}.clear`, `${surface}/${name}: dismissal ${mode === 2 ? 'keeps always-on ruby' : 'leaves no rendered reading'} and restores the parent page`,
          !gone.stages && gone.parentPage === parentPage && gone.reading === (mode === 2), gone);
      });
    }

    // These fixed-count room walks replace the old up-to-twelve sky taps as G3
    // evidence. The separate G5 list/save journey keeps its original scope.
    const openWeb = async (page, key, type = 'word') => {
      assert.equal(await page.evaluate(({ key, type }) => window.openWordWeb(key, { type }), { key, type }), true,
        `the installed Words navigation seam accepts ${type}:${key}`);
      await page.locator(`section.ww[data-ww-centre="${type}:${key}"] .ww-c-glyph`).waitFor();
      // Real focus keeps the asynchronous passage enrichment from replacing the
      // plate under the walk; no application state or animation is replaced.
      await page.locator('section.ww .ww-c-glyph').focus();
      await delay(350);
    };
    const webFacts = async (page, target) => ({ ...await ladderFacts(page, target), ...await target.evaluate(node => ({
      centre: node.closest('section.ww')?.dataset.wwCentre,
      rung: node.dataset.ladderRung || null,
      caption: node.querySelector('.ww-cap')?.textContent || '',
      captionRuby: !!node.querySelector('.ww-cap ruby'),
      glyphRuby: !!node.querySelector('.ww-g ruby'),
    })), recenter: await page.locator('#mini [data-action="word-web.centre"]').count() });
    const webPeripheral = async (page, target, id, centre, { caption = false } = {}) => {
      const word = await target.getAttribute('data-ww-key');
      const type = await target.getAttribute('data-ww-type') || 'kanji';
      assert(word, `${id}: a real typed web node is required`);
      await target.focus();
      const before = await webFacts(page, target);
      await target.tap(); await delay(350);
      const first = await webFacts(page, target);
      check(`${id}.reading`, 'first peripheral activation reveals only its own reading and keeps the plate',
        first.reading && !first.stages && !first.page && first.centre === centre && first.rung === 'reading' &&
        (!caption || (first.glyphRuby && !first.captionRuby && first.caption === before.caption)), first);
      await target.tap(); await delay(500);
      const second = await webFacts(page, target);
      check(`${id}.stage`, 'second peripheral activation opens one current stage with a separate recenter action',
        second.stages === 1 && second.word === word && !second.page && second.centre === centre && second.recenter === 1, second);
      await target.click({ button: 'right' }); await delay(350);
      const held = await webFacts(page, target);
      check(`${id}.hold-same-stage`, 'holding the staged occurrence refreshes that one stage without diving or re-centring',
        held.stages === 1 && held.word === word && !held.page && held.centre === centre && held.recenter === 1 && held.reading, held);
      if (held.page) return; // a named hold failure is never repaired with Back or extra taps
      await target.tap(); await delay(600);
      const third = await pageFacts(page);
      check(`${id}.page`, 'third peripheral activation opens its whole-screen entry', coversViewport(third) && third.headword.startsWith(word), third);
      if (!third) return; // keep the named assertion, never rescue the ladder with more taps
      await page.locator('#sheet-back').tap(); await bare(page);
      const returned = await webFacts(page, target);
      check(`${id}.return`, 'page Back restores the same stage, plate and explicit recenter action',
        returned.stages === 1 && returned.word === word && returned.centre === centre && returned.recenter === 1 && !returned.page, returned);
      await page.keyboard.press('Escape'); await delay(250);
      const gone = await webFacts(page, target);
      check(`${id}.bare`, 'stage Escape clears the summoned reading while preserving the plate',
        !gone.stages && !gone.page && !gone.reading && gone.centre === centre, gone);
      // Re-enter with exactly two taps before using the separate navigation door.
      await target.tap(); await delay(250); await target.tap(); await delay(350);
      const action = page.locator('#mini [data-action="word-web.centre"]');
      if (await action.count() === 1) {
        await action.tap(); await delay(550);
        const actual = await page.locator('section.ww').getAttribute('data-ww-centre');
        check(`${id}.recenter`, 'only the explicit stage action recentres the web and closes the stage',
          actual === `${type}:${word}` && !await page.locator('#mini, #sheet').count(), { actual, word });
      } else check(`${id}.recenter`, 'the explicit recenter action remains reachable on the next visit', false, await slipFacts(page));
    };
    await walk('G3-words', async (page) => {
      await openStory(page); await furigana(page, 1);
      await openWeb(page, '海');
      const centre = page.locator('section.ww .ww-c-glyph');
      check('G3.words.centre-fixture', 'Words centre already displays the actual 海 reading',
        await page.locator('section.ww .ww-c-r').isVisible() && (await page.locator('section.ww .ww-c-r').textContent()).trim() === 'うみ');
      await centre.tap(); await delay(500);
      const first = await webFacts(page, centre);
      check('G3.words.centre-stage', 'a visibly read centre opens its stage on the first activation', first.stages === 1 && first.word === '海' && !first.page, first);
      await centre.tap(); await delay(600);
      const full = await pageFacts(page);
      check('G3.words.centre-page', 'the centre second activation opens its whole-screen entry', coversViewport(full) && full.headword.startsWith('海'), full);
      if (full) {
        await page.locator('#sheet-back').tap(); await bare(page);
        check('G3.words.centre-return', 'centre page Back restores its own stage over the unchanged plate',
          (await slipFacts(page)).word === '海' && await page.locator('section.ww').getAttribute('data-ww-centre') === 'word:海', await slipFacts(page));
        await leaveStage(page);
        check('G3.words.centre-bare', 'centre dismissal keeps its pre-existing reading and leaves no stage/page',
          await page.locator('section.ww .ww-c-r').isVisible() && !await page.locator('#mini, #sheet').count());
      }
      await openWeb(page, '海');
      await webPeripheral(page, page.locator('.ww-node[data-ww-type="word"][data-ww-key="海洋"]'), 'G3.words.peripheral', 'word:海', { caption: true });
    });
    await walk('G3-words-family', async (page) => {
      await openStory(page); await furigana(page, 1);
      await openWeb(page, '休', 'kanji');
      const unknown = page.locator('.ww-node[data-ww-type="part"][data-ww-key="亻"]');
      await unknown.tap(); await delay(550);
      const noReading = await page.evaluate(() => ({ centre: document.querySelector('section.ww')?.dataset.wwCentre,
        stage: !!document.getElementById('mini'), page: !!document.getElementById('sheet'), summoned: !!document.querySelector('section.ww [data-ladder-rung], section.ww ruby') }));
      check('G3.words.unknown-part', 'a radical without a kanji reading still recentres and invents no reading or stage',
        noReading.centre === 'part:亻' && !noReading.stage && !noReading.page && !noReading.summoned, noReading);
      if (noReading.centre !== 'part:亻') return;
      await webPeripheral(page, page.locator('.ww-fam').first(), 'G3.words.family', 'part:亻');
    });
    await walk('G3-sky', async (page) => {
      for (const [mode, name] of [[1, 'on-touch'], [0, 'off'], [2, 'always']]) {
      await openStory(page); await furigana(page, mode);
      assert.equal((await readAppRecord(page)).dials.furigana, mode, 'the actual dial choice must be durable before sky navigation');
      await page.goto(`${host.origin}/?entry=drift&ui=bi`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await page.locator('#drift-layer.active .word').first().waitFor(); await delay(2300);
      const fixture = await page.evaluate(() => {
        const node = [...document.querySelectorAll('#drift-layer.active .word')].find(el => {
          const r = el.getBoundingClientRect(), word = el.querySelector('.base')?.textContent, reading = el.querySelector('.yomi')?.textContent;
          return /[\p{Script=Han}]/u.test(word || '') && reading && window.__BUNKI_OPEN_ENTRY?.has('word', word) &&
            r.left > 50 && r.right < innerWidth - 50 && r.top > 200 && r.bottom < innerHeight - 160 &&
            Number(getComputedStyle(el).opacity) > .5 && !el.classList.contains('unfolded');
        });
        if (!node) return null;
        node.dataset.g3Fixture = 'sky';
        return { word: node.querySelector('.base').textContent, reading: node.querySelector('.yomi').textContent };
      });
      assert(fixture, 'the actual sky must expose a visible known word carrying an authored reading');
      const id = `G3.sky.${name}`;
      const target = page.locator('#drift-layer .word[data-g3-fixture="sky"]');
      const facts = async () => ({ ...await ladderFacts(page, target), ...await target.evaluate(el => {
        const shown = selector => { const n = el.querySelector(selector), s = n && getComputedStyle(n); return !!n?.textContent.trim() && n.getClientRects().length > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0; };
        const opacity = selector => { const n = el.querySelector(selector); return n ? Number(getComputedStyle(n).opacity) : null; };
        return { skyReading: shown('.yomi'), skyGloss: shown('.gloss'), base: el.querySelector('.base')?.textContent,
          skyReadingOpacity: opacity('.yomi'), skyGlossOpacity: opacity('.gloss'),
          wholeNodeRuby: !!el.querySelector(':scope > ruby'),
          rung: el.dataset.ladderRung || null, classes: el.className, view: document.body.dataset.view };
      }) });
      const tap = async () => {
        const point = await target.locator('.base').evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, hit: el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) }; });
        assert(point.hit, `the fixed sky occurrence must be hit-testable: ${JSON.stringify(point)}`);
        await page.touchscreen.tap(point.x, point.y); await delay(650);
      };
      const waitForReadingFade = async () => {
        // The authored sky reading has a 500 ms opacity transition. Require its
        // actual paint to finish before beginning a new visit; do not use a
        // class marker or a near-zero opacity threshold as evidence of absence.
        const deadline = Date.now() + 1100;
        while (Date.now() < deadline) {
          const current = await facts();
          if (current.skyReading === (mode === 2) && !current.skyGloss) return;
          await delay(25);
        }
      };
      const resting = await facts();
      check(`${id}.bare`, `${name}: the actual sky follows the global reading dial before activation`,
        resting.skyReading === (mode === 2) && !resting.skyGloss && !resting.stages && !resting.page && !resting.wholeNodeRuby, resting);
      await tap(); const first = await facts();
      check(`${id}.first`, `${name}: sky tap one ${mode === 1 ? 'reveals only its authored reading' : 'opens its stage without an empty reading rung'}`,
        !first.wholeNodeRuby && first.base === fixture.word && !first.skyGloss && !first.page && (mode === 1
          ? first.skyReading && !first.stages && first.rung === 'reading'
          : first.stages === 1 && first.word === fixture.word && first.skyReading === (mode === 2)), { fixture, ...first });
      if (mode === 1) await tap();
      const second = await facts();
      check(`${id}.stage`, `${name}: sky ${mode === 1 ? 'tap two' : 'tap one'} opens the shared stage with the current word and Save`, second.stages === 1 && second.word === fixture.word && second.save === false && !second.page && second.view === 'drift' && !second.wholeNodeRuby, second);
      await tap(); const third = await pageFacts(page);
      check(`${id}.page`, `${name}: sky ${mode === 1 ? 'tap three' : 'tap two'} opens the same whole-screen word page`, coversViewport(third) && third.headword.startsWith(fixture.word), third);
      if (!third) continue;
      await page.locator('#sheet-back').tap(); await bare(page);
      const returned = await facts();
      check(`${id}.return-stage`, 'sky page Back restores its original stage', returned.stages === 1 && returned.word === fixture.word && !returned.page && returned.view === 'drift', returned);
      await page.keyboard.press('Escape'); await waitForReadingFade();
      const gone = await facts();
      check(`${id}.clear`, `sky stage Escape clears summoned help${mode === 2 ? ' while retaining always-on reading' : ''}`, !gone.stages && !gone.page && !gone.reading && gone.skyReading === (mode === 2) && !gone.skyGloss && !gone.wholeNodeRuby, gone);
      if (mode === 1) {
        await tap();
        const revealed = await facts();
        check(`${id}.revisit-reading`, 'a fresh visit starts again at the reading-only rung', revealed.skyReading && !revealed.stages && revealed.rung === 'reading', revealed);
        await page.keyboard.press('Escape'); await waitForReadingFade();
        const folded = await facts();
        check(`${id}.reading-close`, 'Escape also closes a reading-only sky visit', !folded.skyReading && !folded.skyGloss && !folded.stages && !folded.page && !folded.rung, folded);
      }
      }
    });

    await walk('G3-sky-glyph', async (page) => {
      for (const [mode, name] of [[0, 'off'], [1, 'on-touch'], [2, 'always']]) {
        await openStory(page); await furigana(page, mode);
        await page.goto(`${host.origin}/?entry=drift&ui=bi`);
        await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.__lockWord);
        await delay(1200);
        const canonical = await page.evaluate(() => ({
          kanji: window.__BUNKI_OPEN_SLIP.reading('kanji', '言'),
          particle: window.__BUNKI_OPEN_SLIP.reading('particle', 'は'),
          particleId: window.__BUNKI_OPEN_SLIP.reading('particle', 'wa'),
          identical: window.__BUNKI_OPEN_SLIP.reading('particle', 'の'),
          unknown: window.__BUNKI_OPEN_SLIP.reading('kanji', '☃'),
          stage: !!document.getElementById('mini'), page: !!document.getElementById('sheet'),
        }));
        const id = `G3.sky-glyph.${name}`;
        check(`${id}.canonical`, 'the pure host getter uses canonical kanji/particle readings without opening a visit',
          canonical.kanji === 'げん' && canonical.particle === 'わ' && canonical.particleId === 'わ' &&
          canonical.identical === 'の' && canonical.unknown === '' && !canonical.stage && !canonical.page, canonical);
        // This installed navigation seam creates the real constellation glyphs.
        // Hosted particle nodes have no reachable scene entry: spawnPart remains
        // behind legacy diveWord. Do not fabricate one or claim rendered coverage.
        assert.equal(await page.evaluate(() => window.__lockWord('言葉')), true, 'the authored 言葉 constellation exists');
        await page.waitForFunction(() => [...document.querySelectorAll('#drift-layer .glyph .g')].some(n => n.childNodes[0]?.textContent?.includes('言')));
        await delay(1800);
        const target = page.locator('#drift-layer .glyph').filter({ has: page.locator('.g ruby.drift-reading') }).filter({ hasText: '言' }).first();
        await target.waitFor();
        const state = async () => ({ ...await ladderFacts(page, target), ...await target.evaluate(node => {
          const base = node.querySelector('.g').cloneNode(true); base.querySelectorAll('rt').forEach(n => n.remove());
          const rt = node.querySelector('.g > ruby.drift-reading > rt'), style = rt && getComputedStyle(rt);
          return { base: base.textContent, annotation: rt?.textContent, opacity: style?.opacity,
            caption: node.querySelector(':scope > small')?.textContent,
            captionWrapped: !!node.querySelector('ruby small'), wholeNodeRuby: !!node.querySelector(':scope > ruby'),
            rung: node.dataset.ladderRung || null };
        }) });
        let activation = 0;
        const tap = async () => {
          const started = Date.now(), samples = [];
          let point;
          do {
            point = await target.evaluate(owner => {
              const node = owner.querySelector('.g'), r = node.getBoundingClientRect();
              const x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
              return { x, y, hit: hit?.closest('.glyph') === owner, childHit: node.contains(hit),
                blocker: hit?.outerHTML.slice(0, 400), rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
            });
            samples.push(point);
            if (point.hit) break;
            await delay(50);
          } while (Date.now() - started < 2000);
          check(`${id}.hit-${++activation}`, 'the same actual glyph owns the native tap point before one activation',
            point.hit, { waitedMs: Date.now() - started, samples });
          assert(point.hit, `the actual glyph remains obstructed: ${JSON.stringify(samples)}`);
          await page.touchscreen.tap(point.x, point.y); await delay(450);
        };
        const resting = await state();
        check(`${id}.bare`, `${name}: a spawned sky glyph follows the dial before its first activation`,
          resting.base === '言' && resting.annotation === 'げん' && resting.reading === (mode === 2) &&
          !resting.stages && !resting.page && !resting.captionWrapped && !resting.wholeNodeRuby, resting);
        await tap(); const first = await state();
        check(`${id}.first`, `${name}: first glyph activation follows the shared ladder`, mode === 1
          ? first.reading && first.rung === 'reading' && !first.stages && !first.page
          : first.stages === 1 && first.word === '言' && first.reading === (mode === 2) && !first.page, first);
        if (mode === 1) await tap();
        const staged = await state();
        check(`${id}.stage`, 'the glyph stage preserves its base, reading policy and separate caption',
          staged.stages === 1 && staged.word === '言' && staged.reading === (mode !== 0) &&
          staged.base === '言' && staged.caption === resting.caption && !staged.captionWrapped && !staged.wholeNodeRuby, staged);
        await tap(); await pageSettled(page); const full = await pageFacts(page);
        check(`${id}.page`, 'the next glyph activation enters its own whole-screen kanji page',
          coversViewport(full) && full.node === 'kanji:言', full);
        await page.locator('#sheet-back').tap(); await bare(page);
        const returned = await state();
        check(`${id}.return`, 'kanji page Back restores the same sky glyph stage',
          returned.stages === 1 && returned.word === '言' && !returned.page && returned.reading === (mode !== 0), returned);
        await page.keyboard.press('Escape'); await delay(250);
        const gone = await state();
        check(`${id}.clear`, 'glyph dismissal retains only the always-on reading',
          !gone.stages && !gone.page && !gone.rung && gone.reading === (mode === 2) &&
          gone.annotation === 'げん' && gone.base === '言' && gone.caption === resting.caption, gone);
      }
    });
    await walk('G3-particle', async (page) => {
      for (const [mode, name] of [[0, 'off'], [1, 'on-touch'], [2, 'always']]) {
        await openStory(page); await furigana(page, mode);
        const target = page.locator('#reader .tok[data-index="10"][data-prose-label="は"]');
        await target.scrollIntoViewIfNeeded();
        const state = async () => ({ ...await ladderFacts(page, target), ...await target.evaluate(node => ({
          annotations: [...node.querySelectorAll('rt')].map(rt => rt.textContent), rung: node.dataset.ladderRung || null,
        })) });
        const id = `G3.particle.${name}`, resting = await state();
        check(`${id}.bare`, `${name}: the actual は particle shows only the dial's resting reading`,
          !resting.stages && !resting.page && resting.reading === (mode === 2) &&
          (mode !== 2 || resting.annotations.includes('わ')), resting);
        await target.tap(); await delay(350); const first = await state();
        check(`${id}.first`, `${name}: meaningful は → わ uses the reading rung only on touch`, mode === 1
          ? first.reading && first.annotations.includes('わ') && first.rung === 'reading' && !first.stages
          : first.stages === 1 && first.word === 'は' && first.reading === (mode === 2), first);
        if (mode === 1) { await target.tap(); await delay(350); }
        const staged = await state();
        check(`${id}.stage`, 'the particle stage keeps its meaningful reading and has no Save',
          staged.stages === 1 && staged.word === 'は' && staged.reading === (mode !== 0) && staged.save === null, staged);
        await page.keyboard.press('Escape'); await delay(250); const gone = await state();
        check(`${id}.clear`, 'particle dismissal retains only the always-on reading',
          !gone.stages && !gone.page && !gone.rung && gone.reading === (mode === 2), gone);
      }
    });

    await walk('G3-demo', async (page) => {
      await boot(page);
      const learning = (r) => Object.fromEntries(['taken', 'srs', 'obslog', 'revlog', 'deepWords', 'lists'].map((key) => [key, r[key] ?? null]));
      const before = learning(await readAppRecord(page));
      await openStory(page);
      await page.locator('#mini[data-demo="true"] .mini-word').waitFor();
      const seen = await page.evaluate(() => ({ stages: document.querySelectorAll('#mini').length, word: document.querySelector('#mini[data-demo="true"] .mini-word')?.textContent.trim(),
        tip: document.querySelectorAll('#reader-tip').length, text: /Tap any word for its meaning\./u.test(document.body.innerText), key: localStorage.getItem('kairo-word-ladder-demo-v1') }));
      check('G3.demo.once', 'one word demonstrates its stage without a permanent instructional tip', seen.stages === 1 && !!seen.word && !seen.tip && !seen.text && seen.key === '1', seen);
      await delay(800);
      check('G3.demo.no-work', 'the automatic demonstration creates no lookup, saved card or review work', JSON.stringify(learning(await readAppRecord(page))) === JSON.stringify(before), { before, after: learning(await readAppRecord(page)) });
      await page.keyboard.press('Escape');
      await openStory(page); await delay(900);
      check('G3.demo.no-replay', 'navigation does not replay the demonstration', await page.locator('#mini[data-demo="true"], #reader-tip').count() === 0, await slipFacts(page));
    }, { demo: true });

    /* ======================================================================== G4 · ink (one-hand/G4/BRIEF.md)
     * Every G4 context records the stage headword's ink states as they change (INK_TRACE: data-ink, data-ink-ended, with
     * the document clock) and counts every recorded-media play, Audio construction and device-speech call (VOICE_SPY). */
    const g4Walk = (name, body, options = {}) => walk(name, body, { ...options, init: [INK_TRACE, VOICE_SPY, ...(options.init ? [options.init] : [])] });
    const inkTrace = (page) => page.evaluate(() => window.__ink || []);
    const voiceSpy = (page) => page.evaluate(() => ({ ...window.__voice }));
    // a stage that has begun writing and is mid-way: some strokes drawn, some not yet begun
    const midWriting = (page, timeout = 6000) => page.waitForFunction(() => {
      const word = document.querySelector('#mini .mini-word');
      if (word?.dataset.ink !== 'writing') return false;
      const offsets = [...word.querySelectorAll('.ink-wet path')].map((path) => parseFloat(getComputedStyle(path).strokeDashoffset));
      return offsets.some((value) => value <= 0.02) && offsets.some((value) => value >= 0.98);
    }, null, { timeout, polling: 'raf' });
    const settledInk = (page, timeout = 9000) => page.waitForFunction(() => {
      const word = document.querySelector('#mini .mini-word');
      return !!word && !word.dataset.ink && !!word.dataset.inkEnded && !word.querySelector('.ink-char');
    }, null, { timeout });
    const inkFacts = (page) => page.evaluate(() => {
      const mini = document.getElementById('mini'), word = mini?.querySelector('.mini-word');
      const reading = mini?.querySelector('.mini-reading'), gloss = mini?.querySelector('.mini-gloss');
      const shown = (node) => !!node && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden' && node.getClientRects().length > 0;
      const ghost = [...(word?.querySelectorAll('.ink-ghost') || [])];
      const flow = reading?.getAnimations().map((animation) => animation.effect.getComputedTiming())[0] || null;
      return { stage: !!mini, ceremony: mini?.dataset.ceremony ?? null, depth: mini?.dataset.depth ?? null,
        word: word?.textContent ?? null, ink: word?.dataset.ink ?? null, ended: word?.dataset.inkEnded ?? null,
        ms: Number(word?.dataset.inkMs || 0), strokes: Number(word?.dataset.inkStrokes || 0), chars: word?.querySelectorAll('.ink-char').length ?? 0,
        wet: [...(word?.querySelectorAll('.ink-wet path') || [])].map((path) => Math.round(parseFloat(getComputedStyle(path).strokeDashoffset) * 1000) / 1000),
        ghostPaths: ghost.reduce((n, g) => n + g.querySelectorAll('path').length, 0),
        ghostShown: ghost.length > 0 && ghost.every((g) => Number(getComputedStyle(g).opacity) > 0 && getComputedStyle(g).visibility !== 'hidden'),
        inkPointer: [...(word?.querySelectorAll('.ink-word, .ink-char, .ink-glyph') || [])].every((node) => getComputedStyle(node).pointerEvents === 'none'),
        // the band holds the word as one child while it writes, as G3 drew it (readers take its first node as the word)
        oneChild: !!word && word.childNodes.length === 1 && word.childNodes[0].textContent === word.textContent,
        ariaHidden: [...(word?.querySelectorAll('.ink-glyph') || [])].every((svg) => svg.getAttribute('aria-hidden') === 'true'),
        reading: reading ? { text: reading.textContent, shown: shown(reading), opacity: Number(getComputedStyle(reading).opacity),
          height: reading.getBoundingClientRect().height } : null,
        flow: flow && { delay: flow.delay, duration: flow.duration },
        gloss: gloss ? { shown: shown(gloss) } : null,
        asks: [...(mini?.querySelectorAll('.mini-ask-seal') || [])].map((button) => button.dataset.ask),
        brush: !!mini?.querySelector('#mini-brush'), voice: !!mini?.querySelector('#mini-voice'),
        speed: mini?.querySelectorAll('input[type="range"], .stroke-speed-wrap').length ?? 0 };
    });
    /* Words of the walked story at each depth, seeded through the actual import (restoreAppFixture). The cards follow the
     * pinned FSRS shape; recalled and owned are reviewed cards with present recall ≥ 0.9 at 10 and 60 days' stability. */
    const DEPTH_WORDS = Object.freeze({ unmet: '総理', met: '大臣', again: '官邸', recalled: '表彰', owned: '出席' });
    const depthRecord = () => {
      const T = Date.now(), iso = (ms) => new Date(ms).toISOString(), day = 86400000;
      const card = (fields) => ({ difficulty: 5, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, learning_steps: 0, ...fields });
      return { v: 1,
        taken: ['met', 'again', 'recalled', 'owned'].map((depth, i) => ({ t: 'word', id: DEPTH_WORDS[depth], label: DEPTH_WORDS[depth], ts: T - 3e7 - i, started: T - 3e7 - i })),
        srs: {
          [`word:${DEPTH_WORDS.met}`]: card({ due: iso(T), stability: 0, state: 0 }),
          [`word:${DEPTH_WORDS.again}`]: card({ due: iso(T + 600000), last_review: iso(T - 600000), stability: 0.4, reps: 1, state: 1, learning_steps: 1 }),
          [`word:${DEPTH_WORDS.recalled}`]: card({ due: iso(T + 9 * day), last_review: iso(T - day), stability: 10, elapsed_days: 1, scheduled_days: 10, reps: 4, state: 2 }),
          [`word:${DEPTH_WORDS.owned}`]: card({ due: iso(T + 58 * day), last_review: iso(T - 2 * day), stability: 60, elapsed_days: 2, scheduled_days: 60, reps: 7, state: 2 }),
        } };
    };
    const seedDepths = async (page) => { await boot(page); await restoreAppFixture(page, depthRecord()); };
    /** Settings, reached as he reaches it: the Me tab (or Progress, in the layout under test), then its Settings door. */
    const openSettings = async (page) => {
      await boot(page);
      await page.locator('#tab-me, #tab-progress').first().click();
      await page.locator('#me-settings').click();
      await page.locator('#settings-writing').waitFor();
    };
    /** A tap on a staged-and-writing word's own control, read the moment the tap has landed: the writing has finished at once
     * — ended by that input, and every stroke drawn (or already the plain word) — and the plain word follows the release. */
    const tapMidWriting = async (page, locator) => {
      await midWriting(page);
      const before = await inkFacts(page);
      await locator.tap();
      const after = await page.evaluate(() => {
        const word = document.querySelector('#mini .mini-word');
        const offsets = [...(word?.querySelectorAll('.ink-wet path') || [])].map((path) => parseFloat(getComputedStyle(path).strokeDashoffset));
        return { ended: [...(window.__ink || [])].filter((row) => row.ended === 'input').length,
          chars: word?.querySelectorAll('.ink-char').length ?? 0, drawn: offsets.every((value) => value <= 0.001) };
      });
      return { before, after };
    };
    /* The interrupt schedule the negative control replays: a tap on Save during the writing finishes it at once and still
     * saves the word. */
    const interruptSaveProbe = async (page) => {
      await openStory(page);
      await stage(page, readerWord(page));
      const { before, after } = await tapMidWriting(page, page.locator('#mini #mini-take'));
      check('G4.interrupt.save-writing', 'Save was pressed while the word was writing itself, strokes still to come', before.ink === 'writing' && before.wet.some((v) => v >= 0.98), before);
      const plain = await page.waitForFunction(() => { const word = document.querySelector('#mini .mini-word'); return !!word && !word.querySelector('.ink-char') && !word.dataset.ink; }, null, { timeout: 1000 }).then(() => true, () => false);
      check('G4.interrupt.save-at-once', 'the tap finished the writing at once — ended by that input, every stroke drawn — and the plain word stood once the tap was released',
        after.ended >= 1 && (after.chars === 0 || after.drawn) && plain, { ...after, plain });
      const saved = await page.waitForFunction(() => {
        const seal = document.querySelector('#mini #mini-take');
        return seal?.getAttribute('aria-pressed') === 'true' || seal?.classList.contains('taken') ? true : null;
      }, null, { timeout: 5000 }).then(() => true, () => false);
      const record = await readAppRecord(page);
      check('G4.interrupt.save-acts', 'the same tap still saved the word: the record keeps it and the Save says so',
        saved && record.taken.some((item) => item.t === 'word' && item.id === WORD), { saved, taken: record.taken.map((item) => `${item.t}:${item.id}`) });
    };
    /* The ghost schedule the negative control replays: the stroke page's first frame already holds the whole character as
     * a faint お手本 — read in the DOM at its first animation frame and in pixels at the first screenshot. */
    const GHOST_KANJI = '海';
    const ghostProbe = async (page) => {
      await boot(page);
      await page.evaluate(() => {
        window.__firstBoard = null;
        new MutationObserver((records, observer) => {
          if (!document.getElementById('stroke-page')) return;
          observer.disconnect();
          requestAnimationFrame(() => {
            const page = document.getElementById('stroke-page');
            const roots = [document.querySelector('.stroke-nums-lift'), page].filter(Boolean);
            const guides = roots.flatMap((root) => [...root.querySelectorAll('.stroke-guide')]);
            const visible = (node) => { for (let at = node; at && at !== document.documentElement; at = at.parentElement || at.parentNode?.host) {
              const style = getComputedStyle(at); if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false; } return true; };
            const stage = page.querySelector('.stroke-stage').getBoundingClientRect();
            const painted = guides.filter(visible).filter((guide) => { const box = guide.getBoundingClientRect();
              return box.width > 0 && box.right > stage.left && box.left < stage.right && box.bottom > stage.top && box.top < stage.bottom; });
            window.__firstBoard = { ready: page.dataset.inkReady, living: page.dataset.living, guides: guides.length, painted: painted.length,
              paths: painted.reduce((n, guide) => n + guide.querySelectorAll('path').length, 0) };
          });
        }).observe(document.body, { childList: true, subtree: true });
      });
      await openShelfTools(page);
      await page.locator('#search').fill(GHOST_KANJI);
      await page.locator(`[data-result="kanji:${GHOST_KANJI}"]`).first().click();
      await page.locator('#strokes-door').waitFor();
      const strokes = Number(await page.locator('#strokes-door').getAttribute('data-strokes'));
      await page.locator('#strokes-door').click();
      await page.locator('#stroke-page').waitFor();
      const shot = decodePng(await page.screenshot());
      const first = await page.evaluate(() => new Promise((done) => { const wait = () => (window.__firstBoard ? done(window.__firstBoard) : requestAnimationFrame(wait)); wait(); }));
      const box = await boxOf(page, '#stroke-page .stroke-stage');
      const scale = await page.evaluate(() => devicePixelRatio);
      // ink on the board: pixels at least 14 levels darker (day) or lighter (night) than the board's own median paper
      const sample = [], { width, px } = shot;
      for (let y = Math.round(box.y * scale) + 4; y < Math.round((box.y + box.height) * scale) - 4; y += 2)
        for (let x = Math.round(box.x * scale) + 4; x < Math.round((box.x + box.width) * scale) - 4; x += 2) {
          const i = (y * width + x) * 3; sample.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
        }
      const median = [...sample].sort((a, b) => a - b)[sample.length >> 1];
      const night = median < 110;
      const ink = sample.filter((value) => (night ? value - median : median - value) >= 14).length / sample.length;
      check('G4.ghost.first-frame', `the stroke page's first frame holds the whole ${GHOST_KANJI} as a faint お手本 (its ${strokes} strokes, painted over the board)`,
        first.painted >= 1 && first.paths === strokes, { ...first, strokes });
      check('G4.ghost.first-pixels', 'the first screenshot of the board is not empty: the ghost is ink on the paper, in pixels', ink >= 0.012, { ink: Math.round(ink * 10000) / 100, median, night });
    };
    /* The one speed control: the writing room's three-step slider, and no other anywhere a word writes itself. */
    const SPEED = '#stroke-speed-range, input[type="range"].stroke-speed-range, .stroke-speed-wrap input[type="range"]';
    const oneSpeedProbe = async (page) => {
      await openStory(page);
      await stage(page, readerWord(page));
      const onStage = await page.locator(`#mini :is(${SPEED})`).count();
      await page.keyboard.press('Escape');
      await openSettings(page);
      const inSettings = await page.locator(`#app main :is(${SPEED})`).count();
      const brushRow = await page.locator('#settings-brush button').count();
      await boot(page);
      await openShelfTools(page);
      await page.locator('#search').fill('総');
      await page.locator('[data-result="kanji:総"]').first().click();
      await page.locator('#strokes-door').click();
      await page.locator('#stroke-page').waitFor();
      const inRoom = await page.locator(`#stroke-page :is(${SPEED})`).count();
      const label = await page.locator('#stroke-page .stroke-speed-label').first().textContent().catch(() => '');
      check('G4.one-speed', 'exactly one writing-speed control: the writing room’s three-step slider — none on the stage, none in Settings (筆 sets only when)',
        onStage === 0 && inSettings === 0 && inRoom === 1 && /Writing speed|書く速さ/u.test(label || '') && brushRow === 3, { onStage, inSettings, inRoom, label, brushRow });
    };
    for (const [name, probe] of [['G4-interrupt-save', interruptSaveProbe], ['G4-ghost', ghostProbe], ['G4-one-speed', oneSpeedProbe]]) {
      const begin = rows.length;
      await g4Walk(name, probe);
      schedules[name] = rows.slice(begin);
    }

    await g4Walk('G4-depth', async (page) => {
      await seedDepths(page);
      for (const [depth, label] of Object.entries(DEPTH_WORDS)) {
        await openStory(page);
        const word = readerWord(page, label);
        await word.scrollIntoViewIfNeeded();
        await page.evaluate(() => { window.__ink = []; });
        await stage(page, word);
        const first = await inkFacts(page);
        if (depth === 'unmet' || depth === 'met') {
          check(`G4.depth.${depth}.write`, `${depth} (${label}): the word comes closer to write itself — its whole お手本 there from the first frame, the type held for the ink, the reading's place kept but unwritten, the word still one child of its band`,
            first.ceremony === 'write' && first.depth === depth && ['arriving', 'writing'].includes(first.ink) && first.chars === [...label].length &&
            first.ghostShown && first.ghostPaths === first.strokes && first.strokes > 0 && first.reading?.shown && first.reading.opacity === 0 && first.inkPointer && first.ariaHidden &&
            first.oneChild && first.word === label, first);
          await midWriting(page);
          const mid = await inkFacts(page);
          const ordered = mid.wet.every((value, i) => i === 0 || value >= mid.wet[i - 1] - 0.001);
          check(`G4.depth.${depth}.strokes`, 'mid-way the strokes are drawn one after another, in order: the first done, the last not begun',
            mid.ink === 'writing' && ordered && mid.wet[0] <= 0.02 && mid.wet.at(-1) >= 0.98, mid.wet);
          check(`G4.depth.${depth}.reading-flow`, 'the reading flows in over the writing’s last 40 % (its fade begins at 60 % of the writing and lasts 40 %)',
            !!mid.flow && Math.abs(mid.flow.delay - (0.6 * mid.ms - 0)) <= 2 && Math.abs(mid.flow.duration - 0.4 * mid.ms) <= 2 && mid.reading?.opacity < 1, { ms: mid.ms, flow: mid.flow, reading: mid.reading });
          await settledInk(page);
          const done = await inkFacts(page);
          const trace = (await inkTrace(page)).map((row) => row.ink || (row.ended ? `ended:${row.ended}` : 'plain'));
          check(`G4.depth.${depth}.settled`, 'written, the ink dries into the word’s own type: the plain word, its reading shown',
            done.ended === 'written' && done.chars === 0 && done.word === label && done.reading?.opacity === 1 && done.gloss?.shown, { done, trace });
        } else if (depth === 'again') {
          await delay(900);
          const later = await inkFacts(page);
          const trace = await inkTrace(page);
          check('G4.depth.again.written', `seen again (${label}): it arrives written, with its reading — no ink at any moment`,
            first.ceremony === 'written' && first.depth === 'again' && !first.ink && first.chars === 0 && first.reading?.shown && first.reading.opacity === 1 &&
            later.chars === 0 && trace.every((row) => !row.ink), { first, trace });
        } else {
          const ask = (what) => page.locator(`#mini .mini-ask-seal[data-ask="${what}"]`);
          const place = async () => ({ card: await boxOf(page, '#mini'), reading: await boxOf(page, '#mini .mini-ask-seal[data-ask="reading"]'),
            meaning: await boxOf(page, '#mini .mini-ask-seal[data-ask="meaning"]') });
          // the stage has settled: its entry has answered (a first draw may be drawn again) and it has risen
          await page.waitForFunction(() => document.getElementById('mini')?.getAttribute('aria-busy') !== 'true', null, { timeout: 5000 }).catch(() => {});
          await delay(450);
          const row0 = await place();
          check(`G4.depth.${depth}.bare`, `${depth} (${label}): it arrives bare — no ink, its reading and meaning held behind 読 · 意`,
            first.ceremony === 'bare' && first.depth === depth && first.chars === 0 && !first.reading?.shown && !first.gloss?.shown &&
            JSON.stringify(first.asks) === JSON.stringify(['reading', 'meaning']), first);
          await ask('reading').tap(); await delay(250);
          const read = await inkFacts(page);
          const row1 = await place();
          await ask('meaning').tap(); await delay(250);
          const meant = await inkFacts(page);
          const row2 = await place();
          const same = (a, b) => !!a && !!b && ['x', 'y', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) <= 0.5);
          const still = (a, b) => same(a.card, b.card) && same(a.reading, b.reading) && same(a.meaning, b.meaning);
          check(`G4.depth.${depth}.on-request`, '読 shows the reading, then 意 the meaning, one tap each, in place: the card, the 読 and the 意 never move',
            read.reading?.shown && !read.gloss?.shown && meant.reading?.shown && meant.gloss?.shown && still(row0, row1) && still(row1, row2) &&
            await ask('reading').getAttribute('aria-expanded') === 'true', { read: read.reading, meant: meant.gloss, row0, row1, row2 });
        }
        await page.keyboard.press('Escape'); await delay(250);
      }
      // the ceremony is the visit's: a return from the page keeps what was asked, and never writes again
      await openStory(page);
      await stage(page, readerWord(page, DEPTH_WORDS.recalled));
      await page.locator('#mini .mini-ask-seal[data-ask="reading"]').tap(); await delay(200);
      await page.locator('#mini .mini-word').tap(); await pageSettled(page);
      await page.locator('#sheet-back').tap(); await bare(page);
      const back = await inkFacts(page);
      check('G4.depth.return', 'Back from the page restores the bare stage as he left it (its reading asked, its meaning not) — no ink',
        back.ceremony === 'bare' && back.reading?.shown && !back.gloss?.shown && back.chars === 0, back);
    });

    await g4Walk('G4-tempo', async (page) => {
      const measured = {};
      for (const [step, name] of [[0, 'slow'], [2, 'fast'], [1, 'middle']]) {
        // his one slider, in the writing room, moved by the keyboard as he would
        await boot(page);
        await openShelfTools(page);
        await page.locator('#search').fill('総');
        await page.locator('[data-result="kanji:総"]').first().click();
        await page.locator('#strokes-door').click();
        const range = page.locator('#stroke-page #stroke-speed-range');
        await range.waitFor();
        await range.focus();
        const at = Number(await range.inputValue());
        for (let i = at; i !== step; i += step > at ? 1 : -1) await page.keyboard.press(step > at ? 'ArrowRight' : 'ArrowLeft');
        await range.dispatchEvent('change');
        const set = { value: await range.inputValue(), text: await range.getAttribute('aria-valuetext'), stored: await page.evaluate(() => localStorage.getItem('kairo-stroke-speed-v1')) };
        await page.locator('#strokes-back').click();
        await openStory(page);
        await page.evaluate(() => { window.__ink = []; });
        await stage(page, readerWord(page));
        await settledInk(page);
        const facts = await inkFacts(page);
        const trace = await inkTrace(page);
        const began = trace.find((row) => row.ink === 'writing'), ended = trace.find((row) => row.ended === 'written');
        measured[name] = { set, planned: facts.ms, strokes: facts.strokes, wall: began && ended ? Math.round(ended.at - began.at) : null };
        await page.keyboard.press('Escape'); await delay(200);
      }
      const { slow, middle, fast } = measured;
      const expect = (speed) => Math.round(Math.max(45, Math.min(110, 1400 / middle.strokes)) * middle.strokes * (1.1 / speed));
      check('G4.tempo.slider', 'the one slider set slow, fast and middle (0.7 · 1.6 · 1.1), as the device keeps it',
        slow.set.value === '0' && slow.set.stored === '0.7' && fast.set.value === '2' && fast.set.stored === '1.6' && middle.set.value === '1' && middle.set.stored === '1.1', measured);
      check('G4.tempo.planned', `総理 (${middle.strokes} strokes): each stroke min(110, 1400 ÷ strokes) ≥ 45 ms at the middle step — 1.4 s — scaled by the slider`,
        middle.strokes === 25 && middle.planned === 1400 && slow.planned === expect(0.7) && fast.planned === expect(1.6), measured);
      check('G4.tempo.measured', 'measured on the page clock, slow > middle > fast, each within a frame or two of its plan, and the middle ≤ 1.4 s (+ one frame)',
        [slow, middle, fast].every((m) => Number.isFinite(m.wall) && m.wall >= m.planned - 20 && m.wall <= m.planned + 120) &&
        slow.wall > middle.wall && middle.wall > fast.wall && middle.wall <= 1400 + 34, measured);
    });

    await g4Walk('G4-interrupt', async (page) => {
      // the word itself: the tap finishes the writing and still opens the page
      await openStory(page);
      await stage(page, readerWord(page));
      let { before, after } = await tapMidWriting(page, page.locator('#mini .mini-word'));
      await pageSettled(page);
      check('G4.interrupt.word', 'a tap on the writing word finishes it at once and still opens its page', before.ink === 'writing' && after.ended >= 1 &&
        coversViewport(await pageFacts(page)) && (await pageFacts(page)).headword.startsWith(WORD), { before: before.ink, after, page: await pageFacts(page) });
      await page.locator('#sheet-back').tap(); await bare(page);
      const back = await inkFacts(page);
      check('G4.interrupt.word-return', 'Back returns the stage written, and it never writes again on a return', back.ceremony === 'write' && back.chars === 0 && !back.ink, back);
      await leaveStage(page);
      // a key: Escape finishes the writing and still folds the stage
      await page.evaluate(() => { window.__ink = []; });
      await stage(page, readerWord(page));
      await midWriting(page);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('mini'), null, { timeout: 3000 }).catch(() => {});
      let trace = await inkTrace(page);
      check('G4.interrupt.key', 'a key (Escape) finishes the writing at once and still folds the stage', trace.some((row) => row.ended === 'input') && !await page.locator('#mini').count(), trace.slice(-3));
      // the paper: a tap beside the stage finishes the writing and still folds it
      await page.evaluate(() => { window.__ink = []; });
      await stage(page, readerWord(page));
      await midWriting(page);
      const gutter = await page.evaluate(() => { const r = document.getElementById('reader').getBoundingClientRect(); return { x: Math.max(2, r.left / 2), y: Math.min(innerHeight - 140, 760) }; });
      const onPaper = await page.evaluate(({ x, y }) => { const hit = document.elementFromPoint(x, y); return !!hit && !hit.closest('#mini, .tok, button, a, [role="button"]'); }, gutter);
      await page.touchscreen.tap(gutter.x, gutter.y);
      await page.waitForFunction(() => !document.getElementById('mini'), null, { timeout: 3000 }).catch(() => {});
      trace = await inkTrace(page);
      check('G4.interrupt.paper', 'a tap on the paper finishes the writing at once and still folds the stage', onPaper && trace.some((row) => row.ended === 'input') && !await page.locator('#mini').count(), { onPaper, gutter, trace: trace.slice(-3) });
      // a finger's scroll (Chromium: the devtools touch input drags the page; mobile WebKit has no drivable touch drag)
      if (engine === 'chromium') {
        await page.evaluate(() => { window.__ink = []; window.scrollTo(0, 0); });
        await delay(200);
        await stage(page, readerWord(page));
        await midWriting(page);
        const y0 = await page.evaluate(() => scrollY);
        const cdp = await page.context().newCDPSession(page);
        const x = 30, y = 760;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 30 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await delay(500);
        trace = await inkTrace(page);
        const y1 = await page.evaluate(() => scrollY);
        check('G4.interrupt.touch-scroll', 'a finger scrolling the page during the writing finishes it at once and the page still scrolls', trace.some((row) => row.ended === 'input') && y1 > y0, { y0, y1, trace: trace.slice(-3) });
      }
    });

    // a wheel (a Mac's trackpad or mouse): the writing finishes and the page still scrolls
    await g4Walk('G4-interrupt-desktop', async (page) => {
      await openStory(page);
      await page.evaluate(() => { window.__ink = []; window.scrollTo(0, 0); });
      await stage(page, readerWord(page));
      await midWriting(page);
      const y0 = await page.evaluate(() => scrollY);
      const at = await boxOf(page, '#reader');
      await page.mouse.move(at.x + at.width / 2, Math.min(at.y + at.height - 20, 600));
      await page.mouse.wheel(0, 300);
      await delay(500);
      const trace = await inkTrace(page);
      const y1 = await page.evaluate(() => scrollY);
      check('G4.interrupt.wheel', 'a wheel during the writing finishes it at once and the page still scrolls (a Mac window)', trace.some((row) => row.ended === 'input') && y1 > y0, { y0, y1, trace: trace.slice(-3) });
      // a mouse: the press that finishes the writing still clicks — the word opens its page, Save saves
      await page.keyboard.press('Escape'); await delay(300);
      await page.evaluate(() => { window.__ink = []; window.scrollTo(0, 0); });
      await delay(200);
      await stage(page, readerWord(page));
      await midWriting(page);
      await page.locator('#mini .mini-word').click();
      const opened = await page.locator('#sheet').waitFor({ timeout: 5000 }).then(() => true, () => false);
      const facts = opened ? await pageFacts(page) : null;
      check('G4.interrupt.mouse-word', 'a mouse click on the writing word finishes it at once and still opens its page', opened && facts?.headword.startsWith(WORD) &&
        (await inkTrace(page)).some((row) => row.ended === 'input'), { opened, headword: facts?.headword });
      if (opened) { await page.locator('#sheet-back').click(); await bare(page); }
      await page.keyboard.press('Escape'); await delay(300);
      await stage(page, readerWord(page, DEPTH_WORDS.met));
      await midWriting(page);
      await page.locator('#mini #mini-take').click();
      const saved = await page.waitForFunction(() => { const seal = document.querySelector('#mini #mini-take'); return seal?.getAttribute('aria-pressed') === 'true' || seal?.classList.contains('taken') ? true : null; },
        null, { timeout: 5000 }).then(() => true, () => false);
      const record = await readAppRecord(page);
      check('G4.interrupt.mouse-save', 'a mouse click on Save during the writing finishes it and still saves the word', saved && record.taken.some((item) => item.t === 'word' && item.id === DEPTH_WORDS.met),
        { saved, taken: record.taken.map((item) => `${item.t}:${item.id}`) });
    }, { viewport: { width: 1280, height: 800 }, mobile: false });

    await g4Walk('G4-brush', async (page) => {
      // Settings 筆 → never: the word arrives written; the device keeps the choice
      await openSettings(page);
      await page.locator('#settings-brush [data-value="never"]').click();
      const chosen = { pressed: await page.locator('#settings-brush [aria-pressed="true"]').getAttribute('data-value'),
        stored: await page.evaluate(() => localStorage.getItem('kairo-word-brush-v1')) };
      await openStory(page);
      await page.evaluate(() => { window.__ink = []; });
      await stage(page, readerWord(page));
      await delay(900);
      const never = await inkFacts(page);
      check('G4.brush.never', 'Settings 筆 never: a new word arrives written, its reading at once', chosen.pressed === 'never' && chosen.stored === 'never' &&
        never.ceremony === 'written' && never.chars === 0 && (await inkTrace(page)).every((row) => !row.ink) && never.reading?.opacity === 1, { chosen, never });
      // the 筆 mark writes it again under never, and changes nothing he keeps
      const record = async () => { const r = await readAppRecord(page); return JSON.stringify({ taken: r.taken, srs: r.srs, revlog: r.revlog }); };
      const kept = await record();
      await page.locator('#mini #mini-brush').tap();
      await midWriting(page);
      const again = await inkFacts(page);
      await settledInk(page);
      check('G4.brush.mark', 'the 筆 mark writes the word again — any depth, any 筆 — and never changes depth, record or scheduling',
        again.ink === 'writing' && again.depth === 'unmet' && (await inkFacts(page)).ended === 'written' && await record() === kept, { again, same: await record() === kept });
      await page.keyboard.press('Escape');
      // always: a word he has seen again writes too
      await seedDepths(page);
      await page.evaluate(() => localStorage.setItem('kairo-word-brush-v1', 'always'));
      await openStory(page);
      await stage(page, readerWord(page, DEPTH_WORDS.again));
      const always = await inkFacts(page);
      check('G4.brush.always', 'Settings 筆 always: a word seen again writes itself as it comes closer', always.ceremony === 'write' && always.depth === 'again' && ['arriving', 'writing'].includes(always.ink), always);
      await page.keyboard.press('Escape');
      // a hold never writes: the Words web's hold opens its stage written
      await page.evaluate(() => localStorage.setItem('kairo-word-brush-v1', 'first'));
      await openStory(page);
      await openWeb(page, '海');
      await page.evaluate(() => { window.__ink = []; });
      const node = page.locator('.ww-node[data-ww-type="word"][data-ww-key="海洋"]');
      await node.click({ button: 'right' }); await delay(900);
      const held = await inkFacts(page);
      check('G4.brush.hold', 'a hold (right-click) opens the word written — a hold never writes', held.stage && held.word === '海洋' && held.ceremony === 'written' &&
        held.chars === 0 && (await inkTrace(page)).every((row) => !row.ink), held);
      await page.keyboard.press('Escape');
    });

    await g4Walk('G4-demo', async (page) => {
      await openStory(page);
      await page.locator('#mini[data-demo="true"] .mini-word').waitFor();
      await delay(900);
      const demo = await inkFacts(page);
      check('G4.demo.no-ink', 'the one-time demonstration never writes: a cold record writes only the words he brings closer', demo.ceremony === 'written' && demo.chars === 0 &&
        (await inkTrace(page)).every((row) => !row.ink), demo);
    }, { demo: true });

    await g4Walk('G4-reduced', async (page) => {
      await openStory(page);
      await stage(page, readerWord(page));
      const first = await inkFacts(page);
      await delay(700);
      check('G4.reduced', 'reduced motion: the word arrives written, its reading at once, and no 筆 mark (nothing is written over time)',
        first.ceremony === 'written' && first.chars === 0 && !first.brush && first.reading?.opacity === 1 && (await inkTrace(page)).every((row) => !row.ink), first);
    }, { reducedMotion: 'reduce' });

    await g4Walk('G4-room', async (page) => {
      // the living ink's written strokes leave the ghost on the numbers' own clock; a 2-stroke 人 writes quickly
      await boot(page);
      await openShelfTools(page);
      await page.locator('#search').fill('人');
      await page.locator('[data-result="kanji:人"]').first().click();
      await page.locator('#strokes-door').click();
      await page.waitForFunction(() => { const p = document.getElementById('stroke-page'); return p && p.dataset.inkReady !== 'pending'; }, null, { timeout: 20000 });
      const living = await page.locator('#stroke-page').getAttribute('data-living');
      if (living === 'on') {
        await page.waitForFunction(() => Number(document.getElementById('stroke-page')?.dataset.strokeShown || 0) >= 2, null, { timeout: 30000 });
        await page.waitForFunction(() => [...document.querySelectorAll('.stroke-nums-lift .stroke-guide path')].every((path) => path.classList.contains('is-written')), null, { timeout: 30000 }).catch(() => {});
        const ghost = await page.evaluate(() => [...document.querySelectorAll('.stroke-nums-lift .stroke-guide path')].map((path) => path.classList.contains('is-written')));
        check('G4.ghost.leaves', 'over the living ink, each written stroke leaves the お手本: written, none of its ghost stays above the ink', ghost.length === 2 && ghost.every(Boolean), { living, ghost });
      } else check('G4.ghost.leaves', 'the classic diagram draws its ink over its own ghost (no living ink in this engine)', ['off', 'still'].includes(living), { living });
      // the bug rail never stands over the readings: the classic room at rest and scrolled, the quiet room awake
      const overlap = () => page.evaluate(() => {
        const rail = document.querySelector('#bunki-reports-root .br-rail');
        const box = rail && getComputedStyle(rail).display !== 'none' ? rail.getBoundingClientRect() : null;
        const rows = [...document.querySelectorAll('#stroke-page :is(.stroke-read-row, .stroke-reading-row)')].map((row) => row.getBoundingClientRect()).filter((r) => r.width && r.height);
        const hit = box ? rows.filter((r) => r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top).length : 0;
        return { rail: box && [box.x, box.y, box.width, box.height].map(Math.round), rows: rows.length, hit };
      });
      await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi&minimal=0`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await openShelfTools(page);
      await page.locator('#search').fill(GHOST_KANJI);
      await page.locator(`[data-result="kanji:${GHOST_KANJI}"]`).first().click();
      await page.locator('#strokes-door').click();
      await page.locator('#stroke-page .stroke-readings').waitFor();
      const rest = await overlap();
      await page.locator('#stroke-page').evaluate((room) => { room.scrollTop = 40; });
      await delay(200);
      const scrolled = await overlap();
      await page.screenshot({ path: resolve(evidence, `${engine}-G4-classic-room.png`) });
      check('G4.rail.classic', 'the classic writing room: the bug rail stands clear of the readings, at rest and scrolled', !!rest.rail && rest.rows >= 2 && rest.hit === 0 && scrolled.hit === 0, { rest, scrolled });
      await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await openShelfTools(page);
      await page.locator('#search').fill(GHOST_KANJI);
      await page.locator(`[data-result="kanji:${GHOST_KANJI}"]`).first().click();
      await page.locator('#strokes-door').click();
      await page.locator('.stroke-chrome-trigger').click();
      await page.waitForFunction(() => document.getElementById('stroke-page')?.dataset.chrome === 'awake');
      await delay(500);
      const awake = await overlap();
      check('G4.rail.quiet', 'the quiet room awake: the bug rail stands clear of the readings', !!awake.rail && awake.rows >= 2 && awake.hit === 0, awake);
    });

    await g4Walk('G4-voice', async (page) => {
      await openStory(page);
      await page.evaluate(() => { window.__voice.attempts = 0; });
      await stage(page, readerWord(page));
      await settledInk(page);
      const passive = await page.evaluate(() => { const voice = document.querySelector('#mini #mini-voice');
        return { voice: !!voice, flag: voice?.dataset.voiceUnavailable || null, name: voice?.title || '', note: document.querySelector('#mini .mini-say-note')?.textContent || null }; });
      check('G4.voice.passive', '声 on, a new word comes closer: no recording yet, so the 音 says so quietly (struck, its name) and nothing plays',
        passive.voice && !!passive.flag && /recording|収録音声/u.test(passive.name) && passive.note === null, passive);
      await page.locator('#mini #mini-voice').tap();
      await page.waitForFunction(() => !!document.querySelector('#mini .mini-say-note')?.textContent, null, { timeout: 4000 }).catch(() => {});
      const asked = await page.evaluate(() => ({ note: document.querySelector('#mini .mini-say-note')?.textContent || '', live: document.querySelector('#mini .mini-say-note')?.getAttribute('aria-live') }));
      check('G4.voice.asked', 'a tap on 音 says why, in a line he can read (and a screen reader hears): no recording, nothing played',
        /recording|収録音声/u.test(asked.note) && asked.live === 'polite', asked);
      await page.locator('#mini .mini-word').tap(); await pageSettled(page);
      await page.locator('#sheet-back').tap(); await bare(page);
      await delay(400);
      const kept = await page.evaluate(() => { const voice = document.querySelector('#mini #mini-voice');
        return { voice: !!voice, flag: voice?.dataset.voiceUnavailable || null, name: voice?.title || '' }; });
      check('G4.voice.return-keeps', 'back from the page, the stage drawn again keeps what the voice door said: 音 still struck, its reason its name',
        kept.voice && !!kept.flag && kept.flag === passive.flag && kept.name === passive.name, { passive, kept });
      const spy = await voiceSpy(page);
      check('G4.voice.never-device', 'recorded audio only: no device speech, no Audio made and nothing played without an admitted recording — on arrival, on 音, on a return from the page',
        spy.speak === 0 && spy.utterances === 0 && spy.audio === 0 && spy.plays === 0, spy);
    });

    await g4Walk('G4-frames', async (page) => {
      await openStory(page);
      const samples = [];
      for (let rep = 0; rep < 3; rep++) {
        const word = readerWord(page);
        await word.scrollIntoViewIfNeeded();
        await word.tap(); await delay(400);
        assert.equal(await word.evaluate((node) => node.dataset.ladderRung), 'reading', 'the measured tap two starts from the reading rung');
        await delay(250);
        const box = await word.boundingBox();
        // every frame from just before tap two until the word has settled, each with the ink's state in that frame
        await page.evaluate(() => new Promise((done) => {
          window.__g4f = [];
          requestAnimationFrame((t0) => {
            const tick = (t) => { const w = document.querySelector('#mini .mini-word'); window.__g4f.push([t, w?.dataset.ink || '']);
              if (t - t0 < 3200) requestAnimationFrame(tick); };
            requestAnimationFrame(tick); done();
          });
        }));
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await delay(3500);
        const f = await page.evaluate(() => window.__g4f);
        const deltas = (rowsOf) => rowsOf.slice(1).map((row, i) => Math.round((row[0] - rowsOf[i][0]) * 10) / 10);
        const begin = f.findIndex((row) => row[1] === 'writing'), end = f.findLastIndex((row) => row[1] === 'writing' || row[1] === 'settling');
        const writing = begin > 0 && end > begin ? deltas(f.slice(begin - 1, end + 2)) : [];
        const whole = deltas(f);
        const stat = (d) => d.length ? { worst: Math.max(...d), p95: [...d].sort((a, b) => a - b)[Math.ceil(d.length * 0.95) - 1], over24: d.filter((x) => x > 24).length, frames: d.length } : null;
        samples.push({ rep, phase: rep === 0 ? 'cold' : 'warm', writing: stat(writing), tap2: stat(whole), writingDeltas: writing, tap2Deltas: whole });
        await page.keyboard.press('Escape'); await delay(300);
      }
      // the interrupt's own frames, 600 ms from the input: a key that acts on nothing else (Shift) isolates the ink's own
      // finish — the gate; a tap on Save mid-writing (its menu, the record's write) is recorded beside it
      const interruptWindow = async (act) => {
        await stage(page, readerWord(page));
        await midWriting(page);
        await page.evaluate(() => new Promise((done) => { window.__g4i = []; requestAnimationFrame((t0) => { const tick = (t) => { window.__g4i.push(t); if (t - t0 < 600) requestAnimationFrame(tick); }; requestAnimationFrame(tick); done(); }); }));
        await act();
        await delay(800);
        const ti = await page.evaluate(() => window.__g4i);
        const id = ti.slice(1).map((v, i) => Math.round((v - ti[i]) * 10) / 10);
        const ended = (await inkFacts(page)).ended;
        await page.keyboard.press('Escape'); await delay(300);
        return { ended, worst: Math.max(...id), p95: [...id].sort((a, b) => a - b)[Math.ceil(id.length * 0.95) - 1], over24: id.filter((x) => x > 24).length, frames: id.length, deltas: id };
      };
      const interrupt = await interruptWindow(() => page.keyboard.press('Shift'));
      const saveBox = async () => page.locator('#mini #mini-take').boundingBox();
      const saveInterrupt = await interruptWindow(async () => { const box = await saveBox(); await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); });
      frames.push({ engine, grammar: 'G4', samples: samples.map(({ rep, phase, writing, tap2 }) => ({ rep, phase, writing, tap2 })), interrupt, saveInterrupt,
        deltas: samples.map(({ rep, writingDeltas, tap2Deltas }) => ({ rep, writingDeltas, tap2Deltas })) });
      const worstWriting = Math.max(...samples.map((s) => s.writing?.worst ?? Infinity));
      const summary = { writing: samples.map((s) => s.writing && { phase: s.phase, worst: s.writing.worst, p95: s.writing.p95 }),
        interrupt: { ended: interrupt.ended, worst: interrupt.worst, p95: interrupt.p95 }, saveTap: { ended: saveInterrupt.ended, worst: saveInterrupt.worst, p95: saveInterrupt.p95 },
        tap2: samples.map((s) => ({ phase: s.phase, worst: s.tap2.worst, p95: s.tap2.p95 })) };
      if (engine === 'webkit') {
        check('G4.frames.writing', 'the writing itself: worst frame ≤ 24 ms in WebKit, cold and warm (worst and p95 recorded)', samples.every((s) => s.writing?.frames > 20) && worstWriting <= 24, summary);
        check('G4.frames.interrupt', 'the interrupt — the ink finishing at once under an input (Shift) that does nothing else: worst frame ≤ 24 ms in WebKit', interrupt.ended === 'input' && interrupt.worst <= 24, summary);
      } else check('G4.frames.recorded', 'Chromium frames recorded beside WebKit (never averaged in)', samples.every((s) => s.writing?.frames > 20) && Number.isFinite(worstWriting), summary);
    });

    if (withControls) {
      const specs = [
        { id: 'stalled-second', run: 'G3-stalled', probe: stalledProbe, kill: 'G3.control.stage',
          witness: (row) => row.observed.reading && row.observed.stages === 0 && !row.observed.page,
          edits: [{ file: 'corridor.js', key: 'stall-reading-to-stage',
            from: "      ladderVisit.rung = anchor.dataset.ladderRung = 'stage';\n      return ladderVisit.openStage({ restore: false, demo: false });",
            to: "      return 'reading'; // G3 negative: the second activation stalls" }] },
        { id: 'ruby-survives-back', run: 'G3-clear', probe: clearProbe, kill: 'G3.clear.bare',
          witness: (row) => row.observed.reading && row.observed.stages === 0 && !row.observed.page,
          edits: [{ file: 'corridor.js', key: 'omit-clear-reveal', from: '  visit.clearReveal?.();', to: '  /* G3 negative: retain the raised reading */' }] },
        // The target word is available before the lazy token file; a non-null tap adapter
        // makes sentenceNodes use its existing tapNode on that real target even on the front.
        { id: 'front-door', run: 'G3-front', probe: frontProbe, kill: 'G3.front.sealed',
          witness: (row) => row.observed.doors > 0 && row.observed.reveal,
          edits: [{ file: 'decks/player/mount.js', key: 'front-tap-cover',
            from: "sentenceNodes(card, { front: true, blank: mode !== 'read', split: passage })",
            to: "sentenceNodes(card, { front: true, blank: mode !== 'read', split: passage, taps: backTaps(card, word) || { units: [], onTap: (unit, node) => tapped({ word }, node, { card, where: 'p', depth: 1 }) } })" },
          { file: 'decks/player/mount.js', key: 'front-door-gate',
            from: '    taps = null; // the front has nothing to tap, whatever is asked',
            to: '    /* G3 negative: retain the front tap cover */' }] },
      ];
      // --g4-only replays G4's three controls alone; G3's controls need G3's candidate schedules
      for (const spec of g4Only ? [] : specs) {
        const control = { engine, id: spec.id, edits: spec.edits, served: [], pageErrors: [] };
        const begin = rows.length;
        await walk(spec.run, spec.probe, { control });
        control.rows = rows.splice(begin);
        const baseline = schedules[spec.run];
        const expected = baseline.map((row) => row.id);
        const actual = control.rows.map((row) => row.id);
        const target = control.rows.find((row) => row.id === `${engine}/${spec.kill}`);
        const cleanCandidate = baseline.length > 1 && baseline.every((row) => row.ok) && new Set(expected).size === expected.length;
        const complete = !control.error && !control.setupError && control.pageErrors.length === 0 &&
          JSON.stringify(actual) === JSON.stringify(expected) && spec.edits.every((edit) => control.served.some((served) => served.file === edit.file && served.applied.some((applied) => applied.key === edit.key)));
        const killed = cleanCandidate && complete && target && !target.ok && spec.witness(target) &&
          control.rows.every((row) => row.id === target.id || row.ok);
        control.verdict = !cleanCandidate || !complete ? 'incomplete' : killed ? 'killed' : target?.ok ? 'survived' : 'contaminated';
        // Re-run the exact unmodified schedule in a new context. Source bytes are never edited on disk.
        const restoreBegin = rows.length;
        await walk(spec.run, spec.probe);
        control.restore = rows.splice(restoreBegin);
        const restored = JSON.stringify(control.restore.map((row) => row.id)) === JSON.stringify(expected) && control.restore.every((row) => row.ok);
        controls.push(control);
        check(`G3.negative.${spec.id}`, 'candidate passes, named product mutation fails its intended assertion, and unmodified restore passes',
          killed && restored, { verdict: control.verdict, cleanCandidate, complete, restored, target, setupError: control.setupError, error: control.error });
      }
      /* G4's three named controls (one-hand/G4/BRIEF.md). Each replays its exact candidate schedule against one served
       * product mutation (source bytes on disk are never edited); it is killed only when every named kill row fails for
       * its witnessed reason while every other row of the schedule still passes, and the unmodified restore passes. */
      const g4Specs = [
        { id: 'writing-blocks-tap', run: 'G4-interrupt-save', probe: interruptSaveProbe, kills: ['G4.interrupt.save-acts'],
          witness: (row) => row.observed.saved === false && !row.observed.taken.includes(`word:${WORD}`),
          edits: [{ file: 'corridor.js', key: 'ink-eats-its-tap', from: "  const interrupt = (event) => ink.end('input', event);",
            to: "  const interrupt = (event) => { if (event.type === 'pointerdown') window.addEventListener('click', (click) => click.stopImmediatePropagation(), { capture: true, once: true }); ink.end('input', event); }; // G4 negative: the tap that finishes the writing is consumed" }] },
        { id: 'empty-first-board', run: 'G4-ghost', probe: ghostProbe, kills: ['G4.ghost.first-frame', 'G4.ghost.first-pixels'],
          witness: (row) => row.id.endsWith('first-frame') ? row.observed.painted === 0 : row.observed.ink < 0.012,
          edits: [
            { file: 'editorial.css', key: 'no-quiet-ghost', from: "#stroke-page[data-minimal='on'] .stroke-guide { display: inline; }", to: '/* G4 negative: no ghost in the quiet room */' },
            { file: 'editorial.css', key: 'no-pending-overlay', from: "#stroke-page[data-ink-ready='pending'] .stroke-stage svg.stroke-canvas { position: absolute; inset: 0; }", to: '/* G4 negative: the diagram stays below the sheet */' },
            { file: 'editorial.css', key: 'no-living-lift', from: "body:has(#stroke-page[data-living='on']) .stroke-nums-lift { display: block; }", to: '/* G4 negative: the lifted layer stays hidden */' },
            { file: 'editorial.css', key: 'no-living-ghost', from: '.stroke-nums-lift .stroke-guide { display: inline; }', to: '/* G4 negative: no ghost over the living ink */' }] },
        { id: 'second-speed-control', run: 'G4-one-speed', probe: oneSpeedProbe, kills: ['G4.one-speed'],
          witness: (row) => row.observed.inSettings >= 1 && row.observed.inRoom === 1,
          edits: [{ file: 'corridor.js', key: 'speed-in-settings', from: "    el('p', 'settings-layout-note', tx('書く速さは、書の間のスライダー一つで決まります。',",
            to: "    strokeSpeedControl({ dataset: {} }), el('p', 'settings-layout-note', tx('書く速さは、書の間のスライダー一つで決まります。'," }] },
      ];
      for (const spec of g4Specs) {
        const control = { engine, id: spec.id, edits: spec.edits, served: [], pageErrors: [] };
        const begin = rows.length;
        await g4Walk(spec.run, spec.probe, { control });
        control.rows = rows.splice(begin);
        const baseline = schedules[spec.run] || [];
        const expected = baseline.map((row) => row.id);
        const actual = control.rows.map((row) => row.id);
        const killIds = spec.kills.map((id) => `${engine}/${id}`);
        const targets = killIds.map((id) => control.rows.find((row) => row.id === id));
        const cleanCandidate = baseline.length > 1 && baseline.every((row) => row.ok) && new Set(expected).size === expected.length;
        const complete = !control.error && !control.setupError && control.pageErrors.length === 0 &&
          JSON.stringify(actual) === JSON.stringify(expected) && spec.edits.every((edit) => control.served.some((served) => served.file === edit.file && served.applied.some((applied) => applied.key === edit.key)));
        const killed = cleanCandidate && complete && targets.every((row) => row && !row.ok && spec.witness(row)) &&
          control.rows.every((row) => killIds.includes(row.id) || row.ok);
        control.verdict = !cleanCandidate || !complete ? 'incomplete' : killed ? 'killed' : targets.every((row) => row?.ok) ? 'survived' : 'contaminated';
        const restoreBegin = rows.length;
        await g4Walk(spec.run, spec.probe);
        control.restore = rows.splice(restoreBegin);
        const restored = JSON.stringify(control.restore.map((row) => row.id)) === JSON.stringify(expected) && control.restore.every((row) => row.ok);
        controls.push(control);
        check(`G4.negative.${spec.id}`, 'candidate passes, the named product mutation fails its intended assertions, and the unmodified restore passes',
          killed && restored, { verdict: control.verdict, cleanCandidate, complete, restored, targets, setupError: control.setupError, error: control.error });
      }
    }

    // P1 · P2 · P3 · P9 · P10 · P12 — one walk through the reader's word into its page and out
    await walk('page', async (page) => {
      await openStory(page);
      await stage(page, readerWord(page));
      await page.locator('#mini .mini-word').waitFor();
      check('P3.card', `the reading rung then a tap on ${WORD} opens its stage`, (await slipFacts(page)).word === WORD, await slipFacts(page));
      await delay(1200); // the page is built ahead at idle once the card is up
      const leaves = await glyphsOf(page, '#mini .mini-word');
      // the flight read at its two ends: the first frame that runs 'kairo-cut' holds it at 0 and just short of its end
      const seen = page.evaluate(() => new Promise((done) => {
        const pseudo = new Set();
        const start = performance.now();
        let flight = null;
        const tick = () => {
          for (const animation of document.getAnimations()) if (animation.effect?.pseudoElement) pseudo.add(animation.effect.pseudoElement);
          const cut = document.getAnimations().find((animation) => animation.id === 'kairo-cut');
          if (cut && !flight) {
            const word = cut.effect?.target, end = cut.effect.getComputedTiming().endTime;
            const headword = document.querySelector('#sheet .headword');
            cut.pause();
            cut.currentTime = 0;
            const from = window.__glyphs(word);
            cut.currentTime = end - 1;
            const to = window.__glyphs(word);
            flight = { text: word?.textContent || '', copy: word?.classList.contains('cut-word') || false, duration: end, from, to,
              page: !!document.getElementById('sheet'), waiting: headword ? getComputedStyle(headword).opacity : null };
            cut.play();
          }
          if (performance.now() - start < 900) requestAnimationFrame(tick); else done({ pseudo: [...pseudo], flight });
        };
        requestAnimationFrame(tick);
      }));
      await page.locator('#mini .mini-word').tap();
      const arrival = await seen;
      await pageSettled(page);
      const lands = await glyphsOf(page, '#sheet .headword');
      const landed = await page.evaluate(() => ({ copies: document.querySelectorAll('.cut-word').length,
        headword: getComputedStyle(document.querySelector('#sheet .headword')).opacity }));
      const facts = await pageFacts(page);
      await page.screenshot({ path: resolve(evidence, `${engine}-P1-page.png`) });
      check('P1.viewport', 'the page covers the viewport: top 0, the whole height, the whole width', coversViewport(facts), facts);
      check('P1.grip', 'no grip', facts?.grip === 0, facts?.grip);
      check('P1.scrim', 'no dimming layer: no .scrim in the document', facts?.scrim === 0, facts?.scrim);
      check('P1.cap', 'no max-height and no radius', facts?.maxHeight === 'none' && facts?.radius === '0px', facts);
      check('P1.paper', "the page's paper is opaque and the world's", facts?.alpha === 1 && facts?.background === facts?.paper, facts);
      check('P1.bar', "the page's bar is the top of the screen", Math.abs(facts?.bar?.top ?? 99) <= 1, facts?.bar);
      check('P2.cut', "the page arrives by the match cut: whole at once, no view transition, and the word travels from the card's headword to the page's, which waits unseen until it lands",
        !!arrival.flight && arrival.pseudo.length === 0 && arrival.flight.copy && arrival.flight.page && arrival.flight.text === WORD &&
        arrival.flight.duration >= 200 && near(arrival.flight.from, leaves) && near(arrival.flight.to, lands) && arrival.flight.waiting === '0' &&
        landed.copies === 0 && landed.headword === '1', { ...arrival, leaves, lands, landed });
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
      const restored = await slipFacts(page);
      check('P3.stage-return', 'Back from a stage-origin page restores that word stage', restored.count === 1 && restored.word === WORD, restored);
      await leaveStage(page);
      const after = await page.evaluate((word) => {
        const tok = document.querySelector(`#reader .tok[data-prose-label="${word}"]`);
        return { sheet: !!document.getElementById('sheet'), mini: !!document.getElementById('mini'), lit: tok?.classList.contains('lit') || false,
          rubyShown: [...(tok?.querySelectorAll('rt') || [])].some((rt) => !rt.classList.contains('hidden-rt') && getComputedStyle(rt).display !== 'none' && rt.textContent.trim()),
          inert: document.querySelector('#app > main')?.inert || false };
      }, WORD);
      check('P3.close', 'Stage Escape leaves the reader bare: no page, no stage, the raised reading gone, the room live again',
        !after.sheet && !after.mini && !after.lit && !after.rubyShown && !after.inert, after);
      await stage(page, readerWord(page));
      await page.locator('#mini .mini-word').waitFor();
      check('P3.again', 'the same word from bare reveals then opens its stage again', (await slipFacts(page)).word === WORD, await slipFacts(page));
    });

    // P4 · P5 — a word inside the page, depth 2, Back twice; then Escape twice
    await walk('depth', async (page) => {
      await openStory(page);
      for (const way of ['back', 'escape']) {
        await stage(page, readerWord(page));
        await page.locator('#mini .mini-word').tap();
        await pageSettled(page);
        const inside = page.locator('#sheet .example .sentence-tok, #sheet .japanese-lookup-word').filter({ hasText: /^(内閣|大臣|官邸|日本|表彰|出席|大賞)$/u }).first();
        await inside.scrollIntoViewIfNeeded();
        await delay(300);
        const word = await inside.evaluate((node) => {
          const copy = node.cloneNode(true);
          copy.querySelectorAll('rt, rp, .tok-state, .tok-en').forEach((annotation) => annotation.remove());
          return copy.textContent.trim();
        });
        await stage(page, inside);
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
        await delay(600);
        const nested = await slipFacts(page);
        const one = await pageFacts(page);
        check(`P${way === 'back' ? 4 : 5}.${way}.depth1`, `${way} restores the nested word stage over ${WORD}'s page`,
          one?.headword.startsWith(WORD) && nested.count === 1 && nested.word === word, { one, nested });
        await leaveStage(page);
        check(`P${way === 'back' ? 4 : 5}.${way}.parent-page`, 'dismissing the nested stage leaves the parent page',
          (await pageFacts(page))?.headword.startsWith(WORD) && (await slipFacts(page)).count === 0, await pageFacts(page));
        if (way === 'back') await page.locator('#sheet-back').tap();
        else await page.keyboard.press('Escape');
        await bare(page);
        check(`P${way === 'back' ? 4 : 5}.${way}.parent-stage`, 'parent page returns to its original stage',
          (await slipFacts(page)).word === WORD, await slipFacts(page));
        await leaveStage(page);
        const gone = await ladderFacts(page, readerWord(page));
        check(`P${way === 'back' ? 4 : 5}.${way}.bare`, 'dismissing the original stage leaves the reader bare',
          !gone.page && !gone.stages && !gone.reading, gone);
      }
    });

    // P6 — no stale card: a card for a word below the page (a reading still on its way, a lookup still answering — here
    // the reader word's own activation, dispatched while the page stands over it) never floats over the page
    await walk('stale', async (page) => {
      await openStory(page);
      await stage(page, readerWord(page));
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
      await stage(page, inside);
      const own = await slipFacts(page);
      check('P6.page-word', 'a word on the page still opens its own card there', own.count === 1 && own.onPage, own);
    });

    // P7 — frames, the method of one-hand/G1/frames.json: three opens and three closes, cold first
    await walk('frames', async (page) => {
      await openStory(page);
      const own = [];
      for (let rep = 0; rep < 3; rep++) {
        await stage(page, readerWord(page));
        await page.locator('#mini .mini-word').waitFor();
        await delay(1300);
        const open = await measure(page, page.locator('#mini .mini-word'));
        await pageSettled(page);
        const close = await measure(page, page.locator('#sheet-back'));
        await bare(page);
        check(`P7.return-${rep}`, 'measured stage-origin Back restores the stage', (await slipFacts(page)).word === WORD, await slipFacts(page));
        await leaveStage(page);
        own.push({ rep, open, close });
        frames.push({ engine, rep, phase: rep === 0 ? 'cold' : 'warm', open: open && { worst: open.worst, p95: open.p95, over24: open.over24 }, close: close && { worst: close.worst, p95: close.p95, over24: close.over24 }, openDeltas: open?.deltas, closeDeltas: close?.deltas });
      }
      const worst = Math.max(...own.flatMap(({ open, close }) => [open?.worst ?? Infinity, close?.worst ?? Infinity]));
      if (engine === 'webkit') check('P7.frames', 'the worst frame while the page opens and closes is ≤ 24 ms in WebKit', worst <= 24, own.map(({ rep, open, close }) => ({ rep, open: open?.worst, close: close?.worst })));
      else check('P7.frames-recorded', 'Chromium frames recorded beside WebKit (never averaged in)', Number.isFinite(worst), own.map(({ rep, open, close }) => ({ rep, open: open?.worst, close: close?.worst })));
    });

    // P8 — every world: opaque paper, a readable headword; 墨 opaque and scrim-free at depths 1–4
    await walk('worlds', async (page) => {
      for (const world of WORLDS) {
        await openStory(page, { world });
        await stage(page, readerWord(page));
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
      // two entries never fold into one line, even with the same first gloss: 年 とし and 年 ねん stay two doors
      await boot(page);
      await page.locator('#chrome-search').click();
      await page.locator('#nav-search-input').fill('年');
      await page.locator('.nav-search-row').first().waitFor();
      await delay(700);
      await page.locator('.nav-search-row').first().click();
      await pageSettled(page);
      await page.waitForFunction(() => document.querySelectorAll('#sheet .dictionary-homograph').length >= 2, null, { timeout: 8000 }).catch(() => {});
      const doors = await page.evaluate(() => [...document.querySelectorAll('#sheet .dictionary-homograph')].map((line) => ({
        seq: line.dataset.dictionaryEntry, reading: line.querySelector('.row-reading')?.textContent || '', also: line.dataset.alsoEntries || '' })));
      check('P11.entries-apart', '年: とし (1468060) and ねん (2084840) stay two doors though both read "year"',
        doors.some((door) => door.seq === '1468060') && doors.some((door) => door.seq === '2084840') && doors.every((door) => !door.also || door.also.split(' ').every((seq) => seq === door.seq)), doors);
    });

    // P13 — a Mac window
    await walk('desktop', async (page) => {
      await openStory(page);
      await stage(page, readerWord(page));
      await page.locator('#mini .mini-word').click();
      await pageSettled(page);
      const facts = await pageFacts(page);
      await page.screenshot({ path: resolve(evidence, `${engine}-P13-desktop.png`) });
      check('P13.desktop', 'at 1280×800 the page covers the window', coversViewport(facts), facts);
    }, { viewport: { width: 1280, height: 800 }, mobile: false });

    // P15 — the kanji tiles hold their glyphs at twice the text
    await walk('text-200', async (page) => {
      await openStory(page);
      await stage(page, readerWord(page));
      await page.locator('#mini .mini-word').tap();
      await pageSettled(page);
      const tiles = (mode, keep = false) => page.evaluate(([how, stay]) => {
        const html = document.documentElement;
        const glyphs = [...document.querySelectorAll('#sheet .entry-row .row-glyph')];
        if (how === 'adjust') html.style.webkitTextSizeAdjust = '200%';
        if (how === 'double') for (const g of glyphs) g.style.fontSize = `${parseFloat(getComputedStyle(g).fontSize) * 2}px`;
        // the glyph's em square (a kanji is one em each way; its text box adds the font's whole ascent and descent, 1.3 em)
        // inside the tile's frame: the tile less its border
        const rows = glyphs.map((g) => {
          const range = document.createRange(); range.selectNodeContents(g);
          const text = range.getBoundingClientRect(), tile = g.getBoundingClientRect(), style = getComputedStyle(g);
          const em = parseFloat(style.fontSize), edge = parseFloat(style.borderTopWidth) || 0, mid = text.top + text.height / 2;
          const square = { left: text.left, right: text.left + Math.max(text.width, em), top: mid - em / 2, bottom: mid + em / 2 };
          return { glyph: g.textContent.trim(), font: style.fontSize, tile: [tile.width, tile.height].map((v) => Math.round(v * 10) / 10),
            inside: square.left >= tile.left + edge - 1 && square.right <= tile.right - edge + 1 && square.top >= tile.top + edge - 1 && square.bottom <= tile.bottom - edge + 1,
            floor: tile.width >= 47.5 && tile.height >= 47.5 };
        });
        if (!stay) {
          html.style.removeProperty('-webkit-text-size-adjust');
          for (const g of glyphs) g.style.removeProperty('font-size');
        }
        return rows;
      }, [mode, keep]);
      const plain = await tiles('plain');
      const double = await tiles('double');
      check('P15.double', "each kanji tile holds its glyph at twice the size, on a 48 px floor", double.length >= 2 && double.every((row) => row.inside && row.floor) && plain.every((row) => row.floor), { plain, double });
      if (engine === 'chromium') {
        const adjust = await tiles('adjust', true);
        await page.screenshot({ path: resolve(evidence, `${engine}-P15-text-200.png`) }).catch(() => {});
        await page.evaluate(() => document.documentElement.style.removeProperty('-webkit-text-size-adjust'));
        check('P15.text-200', 'at 200 % text (-webkit-text-size-adjust) every kanji tile still holds its glyph', adjust.length >= 2 && adjust.every((row) => row.inside && row.floor), adjust);
      }
    });

    // P14 — never two layers of text: the cut held at each moment, in 墨 and in a night world, arriving and going Back
    await walk('exposure', async (page) => {
      for (const world of ['sumi', 'yoru']) {
        await openStory(page, { world });
        const scale = await page.evaluate(() => devicePixelRatio);
        const save = (buffer, way, t) => writeFileSync(resolve(evidence, `${engine}-P14-${world}-${way}-${String(t).padStart(3, '0')}ms.png`), buffer);
        // arriving: the reader and its card → the page
        await stage(page, readerWord(page));
        await page.locator('#mini .mini-word').waitFor();
        await delay(1200);
        const leaves = await boxOf(page, '#mini .mini-word');
        const card = decodePng(await page.screenshot());
        await armHold(page);
        await page.locator('#mini .mini-word').tap();
        const arriveHeld = await heldCount(page);
        const shots = {};
        for (const t of MOMENTS) { const buffer = await holdAt(page, t); save(buffer, 'arrive', t); shots[t] = decodePng(buffer); }
        await releaseHold(page);
        await pageSettled(page);
        const page1 = decodePng(await page.screenshot());
        const lands = await boxOf(page, '#sheet .headword, #sheet .hero-glyph, #sheet h2');
        const arrive = oldInkOnGlass(card, shots, page1, [pathOf(leaves, lands)], scale);
        const arriveLate = MOMENTS.filter((t) => t >= 80).map((t) => arrive.share[t]);
        check(`P14.arrive-${world}`, `${world}: from 80 ms into the cut, nothing of the reader or its card shows above the arriving page`,
          arriveHeld > 0 && arrive.mask >= 2000 && arriveLate.every((share) => share !== null && share <= P14_LIMIT), { held: arriveHeld, ...arrive });
        // Preserve G1's direct-page → bare-reader pixel gate separately from G3's stage return.
        await page.locator('#sheet-back').tap();
        await bare(page);
        check(`P14.stage-return-${world}`, 'the stage-origin page restores its stage before the direct-entry probe', (await slipFacts(page)).word === WORD, await slipFacts(page));
        await leaveStage(page);
        await focusWord(page, readerWord(page));
        await page.keyboard.press('Control+Enter');
        await pageSettled(page);
        const leavingPage = decodePng(await page.screenshot());
        await armHold(page);
        await page.locator('#sheet-back').tap();
        const backHeld = await heldCount(page);
        const backShots = {};
        for (const t of MOMENTS) { const buffer = await holdAt(page, t); save(buffer, 'back', t); backShots[t] = decodePng(buffer); }
        await releaseHold(page);
        await bare(page);
        const reader = decodePng(await page.screenshot());
        const home = await readerWord(page).boundingBox();
        const back = oldInkOnGlass(leavingPage, backShots, reader, [pathOf(lands, home)], scale);
        const backLate = MOMENTS.filter((t) => t >= 80).map((t) => back.share[t]);
        check(`P14.back-${world}`, `${world}: from 80 ms into Back's cut, nothing of the leaving page shows above the reader`,
          backHeld > 0 && back.mask >= 2000 && backLate.every((share) => share !== null && share <= P14_LIMIT), { held: backHeld, ...back });
      }
    });

    await browser.close();
  }
} finally {
  await host.close();
}

function innerHeightOf(facts) { return facts?.inner?.height || 844; }

writeFileSync(resolve(evidence, 'verify-word-grammar.json'), JSON.stringify({ site, gitSha: identity.gitSha, artifactSha256: identity.artifactSha256, verifierSha256, browserVersions, scope: g4Only ? `G4 only${withControls ? ' with its three negative controls' : ''}; G1 and G3 gates not run` : skyReadingsOnly ? 'G3 actual sky glyph and reader particle across all dials; canonical host getter; hosted sky particle rendering unproven because its legacy scene is unreachable; no G1 or frame gates' : controlsOnly ? 'G3 and G4 negative controls only; exact candidate schedules, mutants and restores; no G1 or frame gates' : roomsOnly ? 'G3 Words, sky words/glyphs, and reader particle; fixed activation counts; no G1 or frame gates' : sentencesOnly ? 'G3 sentence/example rendered ruby, all three dials, and sealed front; no G1 or frame gates' : kanaOnly ? 'G3 identical kana, particle bar Save, and meaningful particle dials; no G1 or frame gates' : g3Only ? 'G3 only; G1 gates not run' : 'G1, G3 and G4', rows, frames, controls }, null, 1));
const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} — evidence ${evidence}`);
process.exit(failed.length ? 1 : 0);
