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
 * G5 (hold = seal; one-hand/G5 brief): a held word fills a ring and is kept once (the durable record +1, the bookmark +1); a
 *   印 presses onto it and flies to the bookmark, landing on it; a failed keep shows no seal; a second hold opens the strip
 *   and writes nothing; Remove is the one way out; right-click and Shift+F10 do what a hold does (全項目 routes the keyboard
 *   to the page); New list… asks a name once; his lists are one tap each; the strip speaks plain full verbs (never "this
 *   sentence · save · ask the tutor · practice"), stays under 40 % of the screen and covers no button and not the word;
 *   a word held inside the word's page keeps its strip in the page, over no button; the bookmark lands on the kept
 *   words, and browsing them never starts a review; layers open only from 層, never move the paragraph's lines, and fold
 *   on any tap, Escape or the mark; the strip stands wholly on the glass at 320×568, 390×844 and 430×932 over no button,
 *   and the bookmark's landed row is on the glass there; Remove un-saves everywhere and Undo brings every place back;
 *   with reduced motion nothing travels; on a deck card the front stays sealed and a back
 *   word's hold keeps it once and opens the strip; a Save in a bar stands inside it, 8 px clear of
 *   every screen edge, its target its doors' height (L-2); frames of the seal and the landing (WebKit ≤ 24 ms).
 *   --g5-only runs only these; --g5-controls adds: a second hold that un-keeps, a strip over a button, a layer that stays.
 * G3 negative controls: --controls replays stalled tap2, uncleared ruby and a front door; harness failures are incomplete.
 * --controls-only runs only the three candidate schedules, mutants and restores, with no frame measurements.
 * --g3-only is an explicit narrow slice, never a claim that the retained G1 gates passed.
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
import { armRecordWriteFailure, clearRecordWriteFailure, readAppRecord, waitForAppRecord } from './record-test-support.mjs';
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
// G5 · the story's own tokens, from the pinned build, so a layer's reading line is checked against the text's data
const storyTokens = (() => {
  const row = JSON.parse(readFileSync(resolve(site, 'data/articles/index.json'), 'utf8')).articles.find((article) => article.id === STORY.id);
  return JSON.parse(readFileSync(resolve(site, 'data/articles', row.file.split('/').at(-1)), 'utf8')).tokens;
})();
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
const g3Only = controlsOnly || roomsOnly || sentencesOnly || kanaOnly || skyReadingsOnly || process.argv.includes('--g3-only');
const withControls = controlsOnly || process.argv.includes('--controls');
// G5: --g5-only runs only the G5 walks (hold = seal, the strip, the tray flight, layers); --g5-controls adds its three
// negative controls (a second hold un-keeps, the strip covers a button, a layer stays open after a tap elsewhere)
const g5Controls = process.argv.includes('--g5-controls');
const g5Only = process.argv.includes('--g5-only');
assert(!(g5Only && g3Only), 'Choose one explicit narrow schedule');

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
    const walk = async (name, body, { viewport = { width: 390, height: 844 }, mobile = true, control = null, init = null, demo = false } = {}) => {
      if (g3Only && !name.startsWith('G3')) return;
      if (g5Only && !name.startsWith('G5')) return;
      if (controlsOnly && !['G3-stalled', 'G3-clear', 'G3-front'].includes(name)) return;
      if (roomsOnly && !['G3-words', 'G3-words-family', 'G3-sky', 'G3-sky-glyph', 'G3-particle'].includes(name)) return;
      if (sentencesOnly && name !== 'G3-front' && !name.startsWith('G3-sentence-')) return;
      if (kanaOnly && name !== 'G3-kana' && name !== 'G3-particle') return;
      if (skyReadingsOnly && name !== 'G3-sky-glyph' && name !== 'G3-particle') return;
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
      await context.addInitScript(GLYPHS);
      if (!demo) await context.addInitScript(() => localStorage.setItem('kairo-word-ladder-demo-v1', '1'));
      if (init) await context.addInitScript(init);
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
      for (const spec of specs) {
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
    }

    // ------------------------------------------------------------------------------------- G5 · hold = seal (MASTER_SPEC §4 G)
    // Holds: real touch through CDP in Chromium; WebKit has no touch-hold API, so there the same pointer sequence is
    // dispatched on the word and runs the app's own handlers. Every keep is read back from the durable native record.
    const G5_HOLD_MS = 760;
    const g5Facts = (page) => page.evaluate(() => {
      const strip = document.getElementById('seal-strip');
      const box = strip?.getBoundingClientRect();
      const fill = document.getAnimations().find((animation) => animation.id === 'kairo-hold-ring');
      return {
        count: Number(document.getElementById('tray')?.dataset.count ?? NaN),
        digit: document.querySelector('#tray .tray-count')?.textContent ?? null,
        strip: !!strip, side: strip?.dataset.side ?? null,
        box: box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height } : null,
        status: document.getElementById('seal-strip-status')?.textContent ?? '',
        lists: [...(strip?.querySelectorAll('.seal-list[data-list]') || [])].filter((node) => node.getClientRects().length)
          .map((node) => ({ name: node.dataset.list, pressed: node.getAttribute('aria-pressed') })),
        acts: [...(strip?.querySelectorAll('[data-strip-action]') || [])].filter((node) => !node.hidden).map((node) => ({ action: node.dataset.stripAction, text: node.textContent.trim() })),
        text: strip?.innerText ?? '',
        focusIn: !!strip?.contains(document.activeElement),
        seals: document.querySelectorAll('.seal-flight').length, rings: document.querySelectorAll('.hold-ring').length,
        ringRunning: fill?.playState === 'running' || (fill?.playState === 'finished'),
        layers: document.querySelectorAll('[data-layers]').length, layerBlock: document.querySelectorAll('#reader-layers').length,
        page: !!document.getElementById('sheet'), stage: !!document.getElementById('mini'), view: document.body.dataset.view || '',
      };
    });
    const cardsOf = (record, id = WORD) => (record.taken || []).filter((row) => row.t === 'word' && row.id === id).length;
    const g5Learning = (r) => Object.fromEntries(['taken', 'srs', 'revlog', 'lists', 'deepWords'].map((key) => [key, r[key] ?? null]));
    /** A finger held still on the element's centre for `ms`; the facts are read `at` ms in, while the ring fills. */
    const holdOn = async (page, locator, { ms = G5_HOLD_MS, at = 330, id = 41, settle = 220 } = {}) => {
      if (settle) { await locator.scrollIntoViewIfNeeded(); await delay(settle); }
      const box = await locator.boundingBox();
      assert(box, 'the held word is on the glass');
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      let mid = null;
      if (engine === 'chromium') {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 5, radiusY: 5, force: 1 }] });
        await delay(at); mid = await g5Facts(page); await delay(ms - at);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      } else {
        const fire = (type) => page.evaluate(({ type, x, y, id }) => {
          const target = type === 'pointerdown' ? document.elementFromPoint(x, y) : window.__g5HoldTarget;
          window.__g5HoldTarget = target;
          target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: 'touch',
            isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerdown' ? 1 : 0, pressure: type === 'pointerdown' ? 0.5 : 0 }));
        }, { type, x, y, id });
        await fire('pointerdown'); await delay(at); mid = await g5Facts(page); await delay(ms - at); await fire('pointerup');
      }
      return { mid, point: { x, y } };
    };
    /** Every frame's seal: its centre and opacity while it is on the glass (null stops the sampler). */
    const traceSeal = (page) => page.evaluate(() => {
      window.__g5Trail = [];
      const trail = window.__g5Trail;
      const tick = () => {
        if (window.__g5Trail !== trail) return;
        const stamp = document.querySelector('.seal-stamp');
        if (stamp) { const r = stamp.getBoundingClientRect(); trail.push([Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), Number(getComputedStyle(stamp).opacity)]); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const sealTrail = (page) => page.evaluate(() => { const trail = window.__g5Trail || []; window.__g5Trail = null; return trail; });
    const landed = (page) => page.waitForFunction(() => !document.querySelector('.seal-flight'), null, { timeout: 5000 }).then(() => delay(120));
    /** The strip's place: its height against the screen, and every control drawn under it (its centre or a corner on the glass
     * under the strip), the held word's glyphs included. */
    const stripCover = (page, wordSelector) => page.evaluate((wordSelector) => {
      const strip = document.getElementById('seal-strip');
      if (!strip) return null;
      const r = strip.getBoundingClientRect();
      const under = (x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && strip.contains(document.elementFromPoint(x, y));
      const covered = [];
      for (const node of document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="menuitem"]')) {
        if (strip.contains(node) || node.closest('[inert], [hidden]')) continue;
        const b = node.getBoundingClientRect();
        if (!b.width || !b.height || b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom) continue;
        const style = getComputedStyle(node);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        const points = [[b.left + b.width / 2, b.top + b.height / 2], [b.left + 2, b.top + 2], [b.right - 2, b.top + 2], [b.left + 2, b.bottom - 2], [b.right - 2, b.bottom - 2]];
        if (points.some(([x, y]) => under(x, y))) covered.push({ tag: node.tagName, id: node.id, text: (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 30) });
      }
      const word = wordSelector ? window.__glyphs(document.querySelector(wordSelector)) : null;
      const overWord = !!word && !(word.left + word.width <= r.left || word.left >= r.right || word.top + word.height <= r.top || word.top >= r.bottom);
      return { top: r.top, bottom: r.bottom, height: r.height, inner: innerHeight, share: r.height / innerHeight, covered, overWord };
    }, wordSelector);
    const BANNED = /^(this sentence|save|ask the tutor|practice|open the web)$/iu;
    const BANNED_ANYWHERE = /this sentence|open the web|この文/iu;
    const labelsClean = (facts) => facts.acts.every((act) => !BANNED.test(act.text)) && !BANNED_ANYWHERE.test(facts.text);

    // G5 schedules that the negative controls replay (each check always records the actual state)
    const g5SecondProbe = async (page) => {
      await openStory(page);
      const word = readerWord(page);
      await holdOn(page, word);
      await page.locator('#seal-strip').waitFor();
      await landed(page);
      const first = await g5Facts(page), firstRecord = await readAppRecord(page);
      check('G5.first-hold', 'the first hold keeps the word once and the bookmark counts +1', cardsOf(firstRecord) === 1 && first.strip && first.count === 1, { first, cards: cardsOf(firstRecord) });
      await page.keyboard.press('Escape');
      await delay(200);
      await traceSeal(page);
      await holdOn(page, word, { id: 42 });
      await page.locator('#seal-strip').waitFor();
      await delay(1000);
      const trail = await sealTrail(page);
      const second = await g5Facts(page), secondRecord = await readAppRecord(page);
      check('G5.second-hold', 'a second hold opens the strip and writes nothing: one card, the same learning record, the same count, no new seal',
        second.strip && second.count === first.count && cardsOf(secondRecord) === 1 && trail.length === 0 &&
        JSON.stringify(g5Learning(secondRecord)) === JSON.stringify(g5Learning(firstRecord)), { second, cards: cardsOf(secondRecord), trail: trail.length });
    };
    const g5PlaceProbe = async (page) => {
      await openStory(page);
      const word = readerWord(page);
      await word.evaluate((node) => node.setAttribute('data-g5-held', ''));
      await holdOn(page, word);
      await page.locator('#seal-strip').waitFor();
      await landed(page);
      const place = await stripCover(page, '[data-g5-held]');
      check('G5.strip.place', 'the strip stands beside the word under 40 % of the screen and covers no button and not the word',
        !!place && place.share <= 0.4 && place.covered.length === 0 && !place.overWord, place);
    };
    const g5LayerProbe = async (page) => {
      await openStory(page);
      await page.locator('#layers-mark').tap();
      await delay(300);
      const open = await g5Facts(page);
      check('G5.layers.mark-opens', 'the 層 mark opens one paragraph’s layers', open.layers === 1 && open.layerBlock === 1, open);
      // the paper beside the text: the reader's own margin, no word under it
      const paper = await page.evaluate(() => {
        const reader = document.getElementById('reader').getBoundingClientRect();
        for (let y = Math.max(reader.top + 8, 140); y < Math.min(reader.bottom, innerHeight - 160); y += 6) {
          const x = Math.max(4, reader.left - 6);
          const hit = document.elementFromPoint(x, y);
          if (hit && !hit.closest('.tok, button, a, [role="button"], #reader-layers')) return { x, y };
        }
        return null;
      });
      assert(paper, 'a point of paper beside the text is required');
      await page.touchscreen.tap(paper.x, paper.y);
      await delay(300);
      const folded = await g5Facts(page);
      check('G5.layers.fold-paper', 'a tap anywhere else folds the layers: no layer and no layer block stays', folded.layers === 0 && folded.layerBlock === 0, folded);
    };
    const g5Schedules = {};
    for (const [name, probe] of [['G5-second', g5SecondProbe], ['G5-place', g5PlaceProbe], ['G5-layer-fold', g5LayerProbe]]) {
      const begin = rows.length;
      await walk(name, probe);
      g5Schedules[name] = rows.slice(begin);
    }

    await walk('G5-seal', async (page) => {
      await openStory(page);
      const word = readerWord(page);
      const start = await g5Facts(page), startRecord = await readAppRecord(page);
      await traceSeal(page);
      const { mid } = await holdOn(page, word);
      check('G5.ring', 'a held finger fills a ring under it before the hold commits; nothing is kept yet', mid.rings === 1 && mid.ringRunning && !mid.strip && mid.count === start.count, mid);
      await page.locator('#seal-strip').waitFor();
      const opened = await g5Facts(page);
      // the strip answers in the commit's frame; the seal presses in the next one
      const pressed = await page.waitForFunction(() => document.querySelectorAll('.seal-flight').length, null, { timeout: 2000 }).then((handle) => handle.jsonValue()).catch(() => 0);
      await landed(page);
      const trail = await sealTrail(page);
      const done = await g5Facts(page), record = await readAppRecord(page);
      const tray = await boxOf(page, '#tray');
      const wordBox = await page.evaluate(() => window.__glyphs(document.querySelector('#reader .tok[data-prose-label="総理"]')));
      const shown = trail.filter(([, , opacity]) => opacity > 0.05);
      const from = shown[0], to = shown.at(-1);
      const centre = tray && [tray.x + tray.width / 2, tray.y + tray.height / 2];
      check('G5.seal.kept', 'the hold keeps the word once: one card in the durable record, the bookmark +1 in its name and its digit',
        cardsOf(record) === cardsOf(startRecord) + 1 && cardsOf(record) === 1 && done.count === start.count + 1 && done.digit === String(start.count + 1), { start: start.count, done, cards: cardsOf(record) });
      check('G5.seal.flight', 'a 印 presses onto the word and flies to the bookmark, landing on it', pressed === 1 && shown.length >= 6 && !!from && !!to && !!centre &&
        Math.hypot(from[0] - (wordBox.left + wordBox.width), from[1] - wordBox.top) <= 40 && Math.hypot(to[0] - centre[0], to[1] - centre[1]) <= 24 && done.seals === 0,
        { pressed, frames: shown.length, from, to, centre, wordBox });
      check('G5.seal.strip', 'the strip opens with the word kept: Saved, his lists, New list…, then 全項目 · Full entry, Save the sentence, Copy, the tutor and Remove',
        opened.strip && /Saved/u.test(opened.status) && JSON.stringify(opened.acts.map((act) => act.action)) === JSON.stringify(['entry', 'sentence', 'copy', 'ask-tutor', 'remove']) &&
        await page.locator('#seal-strip-new').isVisible(), opened);
      check('G5.labels', 'plain full verbs: never the rejected row "this sentence · save · ask the tutor · practice", nor "Open the web"', labelsClean(opened), opened.acts);
      await page.screenshot({ path: resolve(evidence, `${engine}-G5-strip.png`) });
      // Remove: the one way out, its review history kept
      const beforeRemove = await readAppRecord(page);
      await page.locator('#seal-strip [data-strip-action="remove"]').tap();
      const removed = await waitForAppRecord(page, (r) => cardsOf(r) === 0, { description: 'the explicit Remove' }).catch(() => null);
      await delay(250);
      const out = await g5Facts(page);
      check('G5.remove', 'Remove is the one way out: the card leaves the record, the bookmark counts it, its schedule and history stay', !!removed &&
        out.count === done.count - 1 && !out.strip && JSON.stringify(removed.srs || {}) === JSON.stringify(beforeRemove.srs || {}) &&
        JSON.stringify(removed.revlog || []) === JSON.stringify(beforeRemove.revlog || []), { out, cards: removed && cardsOf(removed) });
      // a failed keep shows no seal and no count (the seal is a consequence of durable success)
      await armRecordWriteFailure(page, 'quota', { roots: ['taken'] });
      await traceSeal(page);
      await holdOn(page, word, { id: 43 });
      await page.locator('#seal-strip').waitFor();
      await delay(1000);
      const failedTrail = await sealTrail(page);
      const fault = await clearRecordWriteFailure(page);
      const failed = await g5Facts(page), failedRecord = await readAppRecord(page);
      check('G5.seal.durable', 'a keep that fails to persist presses no seal and counts nothing; the strip says so',
        fault.fired > 0 && failedTrail.length === 0 && failed.count === out.count && cardsOf(failedRecord) === 0 && /Could not save|not ready|protected/iu.test(failed.status), { fault, failed, trail: failedTrail.length });
    });

    await walk('G5-keys', async (page) => {
      await openStory(page);
      const word = readerWord(page);
      await word.scrollIntoViewIfNeeded();
      await delay(250);
      const start = await g5Facts(page);
      await word.click({ button: 'right' });
      await page.locator('#seal-strip').waitFor();
      await landed(page);
      const right = await g5Facts(page), rightRecord = await readAppRecord(page);
      check('G5.right-click', 'a right-click does what a hold does: the word is kept once and the strip opens', right.strip && cardsOf(rightRecord) === 1 && right.count === start.count + 1, right);
      await page.keyboard.press('Escape');
      await delay(200);
      const back = await page.evaluate(() => ({ strip: !!document.getElementById('seal-strip'), focus: document.activeElement?.dataset?.proseLabel || null }));
      check('G5.escape', 'Escape closes the strip and gives the keyboard back to the word', !back.strip && back.focus === WORD, back);
      await focusWord(page, word);
      await page.keyboard.press('Shift+F10');
      await page.locator('#seal-strip').waitFor();
      await delay(300);
      const keyed = await g5Facts(page), keyedRecord = await readAppRecord(page);
      check('G5.shift-f10', 'Shift+F10 opens the same strip with the keyboard inside it and 全項目 in it; nothing is kept twice',
        keyed.strip && keyed.focusIn && keyed.acts.some((act) => act.action === 'entry' && /全項目/u.test(act.text)) && cardsOf(keyedRecord) === 1 && keyed.count === right.count, keyed);
      await page.locator('#seal-strip [data-strip-action="entry"]').focus();
      await page.keyboard.press('Enter');
      await pageSettled(page);
      const full = await pageFacts(page);
      check('G5.full-entry', '全項目 · Full entry routes the keyboard to the word’s whole-screen page', coversViewport(full) && full.headword.startsWith(WORD), full);
    });

    await walk('G5-lists', async (page) => {
      await openStory(page);
      const word = readerWord(page);
      await holdOn(page, word);
      await page.locator('#seal-strip').waitFor();
      await landed(page);
      for (const name of ['仕事', '旅']) {
        await page.locator('#seal-strip-new').tap();
        await page.locator('#seal-strip-name').fill(name);
        await page.locator('#seal-strip-create').tap();
        await waitForAppRecord(page, (r) => r.lists?.[name]?.some((row) => row.id === WORD), { description: `the new list ${name}` }).catch(() => {});
        await page.locator(`#seal-strip .seal-list[data-list="${name}"]`).waitFor().catch(() => {});
      }
      const made = await g5Facts(page), madeRecord = await readAppRecord(page);
      check('G5.new-list', 'New list… asks a name once and puts the word on it', ['仕事', '旅'].every((name) => madeRecord.lists?.[name]?.length === 1 &&
        made.lists.some((row) => row.name === name && row.pressed === 'true')), { lists: madeRecord.lists, strip: made.lists });
      await page.keyboard.press('Escape');
      const other = page.locator('#reader .tok[data-prose-label="大賞"]').first();
      await holdOn(page, other, { id: 44 });
      await page.locator('#seal-strip').waitFor();
      await landed(page);
      const offered = await g5Facts(page);
      await page.locator('#seal-strip .seal-list[data-list="旅"]').tap();
      const onList = await waitForAppRecord(page, (r) => r.lists?.['旅']?.some((row) => row.id === '大賞'), { description: 'one tap on a list' }).catch(() => null);
      await delay(250);
      const after = await g5Facts(page);
      check('G5.list.one-tap', 'his lists stand in the strip, and one tap puts the word on one', offered.lists.map((row) => row.name).sort().join() === ['仕事', '旅'].sort().join() &&
        offered.lists.every((row) => row.pressed === 'false') && !!onList && after.lists.find((row) => row.name === '旅')?.pressed === 'true' && after.strip, { offered: offered.lists, after: after.lists });
      check('G5.list.labels', 'the strip with lists still speaks in plain full verbs', labelsClean(after), after.acts);
    });

    // a word held inside the word's page: the strip stands in the page (it scrolls with it), under its bar, over no button
    /** The word's page draws itself again when its dictionary row lands (reviveBuiltAhead → refreshWordSheet), later on a
     * loaded machine: wait until the page has stood still — no node added or removed in it for 700 ms — before choosing
     * anything inside it (a word chosen earlier can be swapped out under the gesture). Returns how long it took. */
    const pageQuiet = (page) => page.evaluate(() => new Promise((done) => {
      const began = performance.now();
      let last = performance.now();
      const sheet = () => document.getElementById('sheet');
      const inPage = (n) => n?.nodeType === 1 && (n.id === 'sheet' || !!n.closest?.('#sheet') || !!n.querySelector?.('#sheet'));
      const watch = new MutationObserver((list) => {
        if (list.some((m) => inPage(m.target) || [...m.addedNodes, ...m.removedNodes].some(inPage))) last = performance.now();
      });
      watch.observe(document.body, { childList: true, subtree: true });
      const tick = () => {
        const now = performance.now();
        if ((sheet() && now - last >= 700) || now - began > 12000) { watch.disconnect(); done({ quiet: now - began <= 12000, ms: Math.round(now - began) }); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    await walk('G5-page', async (page) => {
      await openStory(page);
      await stage(page, readerWord(page));
      await page.locator('#mini .mini-word').tap();
      await pageSettled(page);
      await pageQuiet(page);
      const inside = page.locator('#sheet .example .sentence-tok, #sheet .japanese-lookup-word').filter({ hasText: /^(内閣|大臣|官邸|日本|表彰|出席|大賞)$/u }).first();
      await inside.scrollIntoViewIfNeeded();
      await delay(300);
      await inside.evaluate((node) => node.setAttribute('data-g5-held', ''));
      const start = await g5Facts(page), before = await readAppRecord(page);
      await holdOn(page, inside, { id: 46 });
      await page.locator('#sheet #seal-strip').waitFor();
      await landed(page);
      const held = await g5Facts(page), after = await readAppRecord(page);
      const place = await stripCover(page, '[data-g5-held]');
      const word = await inside.evaluate((node) => { const copy = node.cloneNode(true); copy.querySelectorAll('rt, rp, .tok-state, .tok-en').forEach((n) => n.remove()); return copy.textContent.trim(); });
      check('G5.page.kept', `a word held inside the page (${word}) is kept once, and the page stays`, held.page && (after.taken || []).length === (before.taken || []).length + 1 &&
        held.count === start.count + 1 && /Saved/u.test(held.status), { held, word });
      check('G5.page.strip', 'its strip stands in the page under 40 % of the screen, over no button and not over the word', held.strip && !!place &&
        place.share <= 0.4 && place.covered.length === 0 && !place.overWord, place);
      await page.keyboard.press('Escape');
      await delay(250);
      const gone = await g5Facts(page);
      check('G5.page.escape', 'Escape takes the strip away and leaves the page as it was', !gone.strip && gone.page, gone);
    });

    // the deck's card: its front stays sealed (a hold there keeps nothing, reveals nothing, opens no strip); on its back a
    // hold keeps the word once through the corridor's one keep and opens the strip beside it, a second hold un-keeps
    // nothing, Escape puts the strip away, and a right-click is the same hold
    await walk('G5-deck', async (page) => {
      await page.goto(`${host.origin}/index.html?deck=mcd&ui=bi`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await page.locator('#kp-start').click();
      await page.locator('#kp-card .kp-sentence').waitFor();
      await delay(400);
      const front = await page.locator('#kp-card .kp-sentence').evaluate((sentence) => {
        const walker = document.createTreeWalker(sentence, NodeFilter.SHOW_TEXT), range = document.createRange();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim()) continue;
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) {
            const x = Math.max(1, Math.min(innerWidth - 1, r.left + Math.min(r.width / 2, 12))), y = r.top + r.height / 2;
            if (y > 0 && y < innerHeight && sentence.contains(document.elementFromPoint(x, y))) return { x, y };
          }
        }
        return null;
      });
      assert(front, 'an uncovered front glyph is required for the sealed-front hold');
      const record0 = await readAppRecord(page);
      await page.evaluate(({ x, y }) => { document.elementFromPoint(x, y)?.setAttribute('data-g5-front', ''); }, front);
      await holdOn(page, page.locator('[data-g5-front]'), { id: 70, settle: 0 });
      await delay(500);
      const sealedFront = await page.evaluate(() => ({ strip: !!document.getElementById('seal-strip'), rings: document.querySelectorAll('.hold-ring').length,
        seals: document.querySelectorAll('.seal-flight').length, stage: !!document.getElementById('mini'), page: !!document.getElementById('sheet'),
        unanswered: !!document.getElementById('kp-reveal') }));
      const record1 = await readAppRecord(page);
      check('G5.deck.front-sealed', 'a hold on the card’s front keeps nothing, reveals nothing and opens no strip: the front stays sealed',
        !sealedFront.strip && sealedFront.rings === 0 && sealedFront.seals === 0 && !sealedFront.stage && !sealedFront.page && sealedFront.unanswered &&
        (record1.taken || []).length === (record0.taken || []).length, { sealedFront, taken: [(record0.taken || []).length, (record1.taken || []).length] });
      await page.locator('#kp-reveal').click();
      // the back's sentence words (mount.js tapNode: .kp-tok); a kanji word, so it has an entry to keep
      const backWord = page.locator('#kp-card .kp-tok').filter({ visible: true, hasText: /[\u4e00-\u9fff]/u }).first();
      await backWord.waitFor();
      await delay(400);
      await backWord.evaluate((node) => node.setAttribute('data-g5-deck-held', ''));
      const held = page.locator('[data-g5-deck-held]');
      const start = await g5Facts(page);
      await holdOn(page, held, { id: 71 });
      await page.locator('#seal-strip').waitFor({ timeout: 8000 });
      await landed(page);
      const first = await g5Facts(page), record2 = await readAppRecord(page);
      const place = await stripCover(page, '[data-g5-deck-held]');
      check('G5.deck.back-hold', 'a hold on a word of the card’s back keeps it once, through the one keep, and opens the strip beside it',
        first.strip && /Saved/u.test(first.status) && (record2.taken || []).length === (record1.taken || []).length + 1 &&
        (Number.isNaN(start.count) || first.count === start.count + 1), { start: { count: start.count }, first, taken: (record2.taken || []).length });
      check('G5.deck.back-strip', 'its strip stands under 40 % of the screen, over no button and not over the word', !!place && place.share <= 0.4 &&
        place.covered.length === 0 && !place.overWord, place);
      await holdOn(page, held, { id: 72 });
      await delay(500);
      const second = await g5Facts(page), record3 = await readAppRecord(page);
      check('G5.deck.second-hold', 'a second hold on the kept back word un-keeps nothing: the same one card, its strip again',
        second.strip && (record3.taken || []).length === (record2.taken || []).length && (Number.isNaN(first.count) || second.count === first.count), { second, taken: (record3.taken || []).length });
      await page.keyboard.press('Escape'); await delay(300);
      const away = await g5Facts(page);
      check('G5.deck.escape', 'Escape puts the deck’s strip away; the card stays answered', !away.strip && !(await page.locator('#kp-reveal').count()), away);
      // another kanji word of the back, a different word from the one held
      const heldText = await held.evaluate((node) => { const c = node.cloneNode(true); c.querySelectorAll('rt, rp').forEach((n) => n.remove()); return c.textContent.trim(); });
      const others = page.locator('#kp-card .kp-tok:not([data-g5-deck-held])').filter({ visible: true, hasText: /[\u4e00-\u9fff]/u });
      let other = null;
      for (let i = 0, n = await others.count(); i < n && !other; i++) {
        const text = await others.nth(i).evaluate((node) => { const c = node.cloneNode(true); c.querySelectorAll('rt, rp').forEach((m) => m.remove()); return c.textContent.trim(); });
        if (text !== heldText) other = others.nth(i);
      }
      if (other) {
        await other.scrollIntoViewIfNeeded(); await delay(200);
        await other.click({ button: 'right' });
        await page.locator('#seal-strip').waitFor({ timeout: 8000 });
        await landed(page).catch(() => {});
        const right = await g5Facts(page), record4 = await readAppRecord(page);
        check('G5.deck.right-click', 'a right-click on another back word is the same hold: the strip, and that word kept (one more card)',
          right.strip && /Saved/u.test(right.status) && (record4.taken || []).length === (record3.taken || []).length + 1, { right, taken: (record4.taken || []).length });
        await page.keyboard.press('Escape'); await delay(200);
      }
      await page.screenshot({ path: resolve(evidence, `${engine}-G5-deck.png`) });
    });

    // L-2 (MISSION/FINDINGS.md; MASTER_SPEC D5): a Save in a bar is a door of the bar. On the word's page its face stands
    // inside the bar, at least 8 px from every screen edge, and its target spans the height of the bar's other doors
    // (Close, search) — as Save and as Saved ✓, on a phone and on a Mac window.
    const barSaveFacts = (page) => page.evaluate(() => {
      const bar = document.querySelector('#sheet > .sheet-bar'), save = document.getElementById('sheet-take');
      if (!bar || !save) return null;
      const box = (n) => { const b = n.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height }; };
      const others = ['sheet-back', 'sheet-search'].map((id) => document.getElementById(id)).filter((n) => n?.getClientRects().length).map((n) => ({ id: n.id, ...box(n) }));
      const face = box(save), x = (face.left + face.right) / 2;
      const top = Math.min(...others.map((o) => o.top)), bottom = Math.max(...others.map((o) => o.bottom));
      const reach = [top + 0.5, (top + bottom) / 2, bottom - 0.5].map((y) => save.contains(document.elementFromPoint(x, y)));
      const rule = parseFloat(getComputedStyle(bar).borderBottomWidth) || 0;
      return { inner: [innerWidth, innerHeight], bar: box(bar), rule, face, others, reach, text: save.textContent.replace(/\s+/g, ' ').trim() };
    });
    const barSaveOk = (f) => !!f && f.others.length === 2 && f.others.every((o) => Math.abs(o.height - f.others[0].height) < 0.5) &&
      f.face.top >= 8 && f.face.left >= 8 && f.face.right <= f.inner[0] - 8 && f.face.bottom <= f.inner[1] - 8 &&
      f.face.top >= f.bar.top && f.face.bottom <= f.bar.bottom - f.rule && f.face.height < f.others[0].height && f.reach.every(Boolean);
    for (const [form, viewport, mobile] of [['phone', { width: 390, height: 844 }, true], ['mac', { width: 1280, height: 800 }, false]]) {
      await walk(`G5-bar-save-${form}`, async (page) => {
        await openStory(page);
        await stage(page, readerWord(page));
        await page.locator('#mini .mini-word').tap();
        await pageSettled(page);
        await pageQuiet(page);
        const before = await barSaveFacts(page);
        check(`G5.bar-save.${form}.save`, `${form}: the page bar’s Save stands inside its bar, at least 8 px from every screen edge, its target the height of Close and search`,
          barSaveOk(before) && /Save/u.test(before.text), before);
        await page.locator('#sheet-take').tap();
        await page.waitForFunction(() => /Saved/u.test(document.getElementById('sheet-take')?.textContent || ''), null, { timeout: 8000 });
        await page.keyboard.press('Escape'); await delay(300);
        const after = await barSaveFacts(page);
        check(`G5.bar-save.${form}.saved`, `${form}: as Saved ✓ it stands the same way, inside its bar and 8 px clear of the screen’s edges`,
          barSaveOk(after) && /Saved/u.test(after.text), after);
        await page.screenshot({ path: resolve(evidence, `${engine}-G5-bar-save-${form}.png`), clip: { x: 0, y: 0, width: viewport.width, height: 96 } });
      }, { viewport, mobile });
    }

    // reduced motion: the same keep and strip, and nothing travels (no ring sweep, no flight; the seal shows where it pressed)
    await walk('G5-reduced', async (page) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openStory(page);
      const word = readerWord(page);
      const start = await g5Facts(page);
      await page.evaluate(() => {
        window.__g5Anims = [];
        const seen = window.__g5Anims;
        const tick = () => {
          if (window.__g5Anims !== seen) return;
          for (const a of document.getAnimations()) if (/^kairo-(seal|hold-ring)/u.test(String(a.id))) seen.push(a.id);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const { mid } = await holdOn(page, word);
      await page.locator('#seal-strip').waitFor();
      const pressed = await page.evaluate(() => ({ still: document.querySelectorAll('.seal-flight.is-still').length, moving: document.querySelectorAll('.seal-flight:not(.is-still)').length }));
      await delay(1000);
      const anims = await page.evaluate(() => { const list = [...new Set(window.__g5Anims || [])]; window.__g5Anims = null; return list; });
      const done = await g5Facts(page), record = await readAppRecord(page);
      check('G5.reduced', 'with reduced motion a hold still keeps the word once and opens its strip, and nothing travels: the ring is drawn whole, the seal shows where it pressed and leaves',
        mid.rings === 1 && done.strip && cardsOf(record) === 1 && done.count === start.count + 1 && anims.length === 0 && pressed.moving === 0 && done.seals === 0,
        { mid: { rings: mid.rings }, pressed, anims, done: { strip: done.strip, count: done.count, seals: done.seals } });
    });

    // The strip stands wholly on the glass (the visual viewport, under the bar and above the foot's bar and doors) at every
    // phone size, over no button, under 40 % of the screen, the word still on the glass: for a word near the top, the first
    // word and a word near the foot (lead, 2026-10-18: at 320×568 it once fell past the fold; at a 357-wide Chromium layout
    // it covered 層). Then the bookmark lands on the row it focuses, on the glass, at that size.
    const glassFacts = (page) => page.evaluate(() => {
      const strip = document.getElementById('seal-strip'), held = document.querySelector('[data-g5-held]');
      const vv = window.visualViewport;
      const glass = { top: vv ? vv.offsetTop : 0, left: vv ? vv.offsetLeft : 0, bottom: vv ? vv.offsetTop + vv.height : innerHeight, right: vv ? vv.offsetLeft + vv.width : innerWidth };
      const fixedEdge = (sel, edge) => { const n = document.querySelector(sel); if (!n || !['fixed', 'sticky'].includes(getComputedStyle(n).position)) return null; const b = n.getBoundingClientRect(); return b.height ? b[edge] : null; };
      const band = { top: Math.max(glass.top, fixedEdge('#app > .chrome', 'bottom') ?? glass.top),
        bottom: Math.min(glass.bottom, fixedEdge('#primary-tabs', 'top') ?? glass.bottom) };
      const box = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
      const s = box(strip), word = held ? window.__glyphs(held) : null;
      const wordBox = word && { top: word.top, bottom: word.top + word.height, left: word.left, right: word.left + word.width };
      return { inner: [innerWidth, innerHeight], vv: vv ? { w: vv.width, h: vv.height, scale: vv.scale } : null, glass, band, side: strip?.dataset.side ?? null, strip: s, word: wordBox,
        stripOnGlass: !!s && s.top >= band.top - 0.5 && s.bottom <= band.bottom + 0.5 && s.left >= glass.left - 0.5 && s.right <= glass.right + 0.5,
        wordOnGlass: !!wordBox && wordBox.top >= band.top - 0.5 && wordBox.bottom <= band.bottom + 0.5 };
    });
    /** Put a content word of the reader (kanji, on the left half, so no fixed door at the foot is over it) at `y` on the
     * glass, mark it as the one to hold, and return it. */
    const wordAt = async (page, where) => {
      const index = await page.evaluate((where) => {
        document.querySelector('[data-g5-held]')?.removeAttribute('data-g5-held');
        // the band between the fixed bar and the fixed foot (only what stays put on the glass counts)
        const fixedEdge = (sel, edge) => { const n = document.querySelector(sel); if (!n || !['fixed', 'sticky'].includes(getComputedStyle(n).position)) return null; const b = n.getBoundingClientRect(); return b.height ? b[edge] : null; };
        const vv = window.visualViewport, glassBottom = vv ? vv.offsetTop + vv.height : innerHeight;
        const chrome = fixedEdge('#app > .chrome', 'bottom') ?? 0;
        const foot = Math.min(glassBottom, fixedEdge('#primary-tabs', 'top') ?? glassBottom, fixedEdge('.listen-row', 'top') ?? glassBottom);
        const words = [...document.querySelectorAll('#reader .tok[data-index]')].filter((n) => /[一-鿿]/u.test(n.textContent) && !n.classList.contains('particle')
          && n.getBoundingClientRect().left < innerWidth * 0.45);
        // a word far enough down the story that the reading can scroll it to that place (the story's first lines cannot
        // be brought down to the foot)
        const targetFor = (n) => (where === 'foot' ? foot - 30 - n.getBoundingClientRect().height : chrome + 12);
        const pick = words.find((n, i) => i >= 6 && n.getBoundingClientRect().top + scrollY >= targetFor(n) + 40) || words.at(-1);
        const r = pick.getBoundingClientRect();
        const target = targetFor(pick);
        window.scrollBy(0, r.top - target);
        pick.setAttribute('data-g5-held', '');
        return pick.dataset.index;
      }, where);
      await delay(400);
      const word = page.locator(`#reader .tok[data-index="${index}"]`);
      word.before = await word.evaluate((n) => Math.round(n.getBoundingClientRect().top));
      return word;
    };
    for (const [form, viewport] of [['320x568', { width: 320, height: 568 }], ['390x844', { width: 390, height: 844 }], ['430x932', { width: 430, height: 932 }]]) {
      await walk(`G5-glass-${form}`, async (page) => {
        await openStory(page);
        const cases = [['first', async () => { const w = readerWord(page); await w.evaluate((n) => { document.querySelector('[data-g5-held]')?.removeAttribute('data-g5-held'); n.setAttribute('data-g5-held', ''); }); return w; }],
          ['foot', () => wordAt(page, 'foot')], ['top', () => wordAt(page, 'top')]];
        let id = 80;
        for (const [name, choose] of cases) {
          const word = await choose();
          await holdOn(page, word, { id: id++ });
          await page.locator('#seal-strip').waitFor();
          await landed(page);
          const glass = await glassFacts(page), place = await stripCover(page, '[data-g5-held]');
          glass.wordTopBeforeHold = word.before ?? null;
          check(`G5.glass.${form}.${name}`, `${form}, a word ${name === 'first' ? 'where the story opens' : `near the ${name}`}: the strip stands wholly on the glass, over no button, under 40 % of the screen, the word still on the glass`,
            glass.stripOnGlass && glass.wordOnGlass && !!place && place.covered.length === 0 && place.share <= 0.4 && !place.overWord, { ...glass, covered: place?.covered, share: place?.share, overWord: place?.overWord });
          if (name === 'foot') await page.screenshot({ path: resolve(evidence, `${engine}-G5-glass-${form}-foot.png`) });
          await page.keyboard.press('Escape'); await delay(250);
        }
        // the bookmark lands on the row it focuses (the newest kept word's), on the glass at this size. At 320 the room's bar
        // (eight doors, 376 px of them, base 92e5492f too) stands the bookmark off the glass, so a finger cannot reach it
        // there: the bookmark is then pressed by its own click, and that it was off the glass is kept with the facts
        const tray = await page.locator('#tray').evaluate((node) => {
          const r = node.getBoundingClientRect(), vv = window.visualViewport;
          return { left: Math.round(r.left), right: Math.round(r.right), onGlass: r.left >= (vv ? vv.offsetLeft : 0) && r.right <= (vv ? vv.offsetLeft + vv.width : innerWidth) };
        });
        if (tray.onGlass) await page.locator('#tray').tap();
        else await page.locator('#tray').evaluate((node) => node.click());
        await delay(800);
        const land = await page.evaluate(() => {
          const row = document.activeElement?.closest?.('.tray-line[data-kept-key]') || null;
          const box = row?.getBoundingClientRect();
          const vv = window.visualViewport;
          const ceiling = Math.max(vv ? vv.offsetTop : 0, document.querySelector('#app > .chrome')?.getBoundingClientRect().bottom || 0);
          const floor = Math.min(vv ? vv.offsetTop + vv.height : innerHeight, document.getElementById('primary-tabs')?.getBoundingClientRect().top || innerHeight);
          const rows = [...document.querySelectorAll('#app main .tray-line[data-kept-key]')];
          return { view: document.body.dataset.view, key: row?.dataset.keptKey || null, landedMark: !!row && row.hasAttribute('data-landed'),
            isLastOfItsKey: !!row && rows.filter((n) => n.dataset.keptKey === row.dataset.keptKey).at(-1) === row,
            row: box ? { top: Math.round(box.top), bottom: Math.round(box.bottom) } : null, ceiling: Math.round(ceiling), floor: Math.round(floor) };
        });
        check(`G5.bookmark.${form}`, `${form}: the bookmark lands on the row it focuses — the newest kept word's last row — and that row is on the glass`,
          land.view === 'tray' && !!land.row && land.landedMark && land.isLastOfItsKey && land.row.top >= land.ceiling && land.row.bottom <= land.floor, { ...land, tray });
        await page.screenshot({ path: resolve(evidence, `${engine}-G5-bookmark-${form}.png`) });
      }, { viewport, mobile: true });
    }

    // Remove un-saves the word everywhere (lead's ruling, 2026-10-18): out of taken and off every list, so Today shows it
    // nowhere, in one durable write; Undo brings back every place it held, in their places
    await walk('G5-remove-everywhere', async (page) => {
      await openStory(page);
      const first = readerWord(page), other = page.locator('#reader .tok[data-prose-label="大賞"]').first();
      const backToReader = async () => {
        await page.locator('#app > .chrome [data-bar-back]').first().tap();
        await page.locator('#reader .tok[data-index]').first().waitFor();
        await delay(400);
      };
      const rowsOf = (page, key) => page.evaluate((key) => [...document.querySelectorAll('#app main .tray-line[data-kept-key]')].filter((n) => n.dataset.keptKey === key).length, key);
      const placesOf = (record, id) => ({ taken: (record.taken || []).map((row, index) => ({ row, index })).filter(({ row }) => row.t === 'word' && row.id === id),
        lists: Object.entries(record.lists || {}).flatMap(([name, rows]) => (rows || []).map((row, index) => ({ name, index, row })).filter(({ row }) => row.t === 'word' && row.id === id)) });
      await holdOn(page, first, { id: 90 });
      await page.locator('#seal-strip').waitFor(); await landed(page);
      await page.locator('#seal-strip-new').tap();
      await page.locator('#seal-strip-name').fill('朝');
      await page.locator('#seal-strip-create').tap();
      await waitForAppRecord(page, (r) => r.lists?.['朝']?.some((row) => row.id === WORD), { description: 'the list 朝' });
      await page.keyboard.press('Escape'); await delay(250);
      await holdOn(page, other, { id: 91 });
      await page.locator('#seal-strip').waitFor(); await landed(page);
      await page.locator('#seal-strip .seal-list[data-list="朝"]').tap();
      const kept = await waitForAppRecord(page, (r) => r.lists?.['朝']?.some((row) => row.id === '大賞'), { description: '大賞 on 朝' });
      const before = placesOf(kept, '大賞'), count0 = (await g5Facts(page)).count;
      // Remove, from the word's own strip
      await page.locator('#seal-strip [data-strip-action="remove"]').tap();
      const gone = await waitForAppRecord(page, (r) => placesOf(r, '大賞').taken.length === 0 && placesOf(r, '大賞').lists.length === 0, { description: 'Remove un-saves everywhere' }).catch(() => null);
      await delay(200);
      const afterRemove = await g5Facts(page);
      const undo = page.locator('#reader-toast-action');
      const undoShown = await undo.isVisible().catch(() => false);
      // Undo: every place back, in its place
      if (undoShown) await undo.tap();
      const back = await waitForAppRecord(page, (r) => placesOf(r, '大賞').taken.length === before.taken.length && placesOf(r, '大賞').lists.length === before.lists.length,
        { description: 'Undo restores every place' }).catch(() => null);
      await delay(300);
      const afterUndo = await g5Facts(page);
      await page.locator('#tray').tap(); await delay(800);
      const todayAfterUndo = { 大賞: await rowsOf(page, 'word:大賞'), 総理: await rowsOf(page, `word:${WORD}`) };
      check('G5.remove.undo', 'Undo brings back every place Remove took: the card’s row and each list row, the same and in the same places; the bookmark and Today again',
        !!back && JSON.stringify(placesOf(back, '大賞')) === JSON.stringify(before) && afterUndo.count === count0 && todayAfterUndo['大賞'] >= 2 && todayAfterUndo['大賞'] === todayAfterUndo['総理'],
        { undoShown, before, back: back && placesOf(back, '大賞'), counts: [count0, afterRemove.count, afterUndo.count], todayAfterUndo });
      // Remove again, then Today: the word appears nowhere saved
      await backToReader();
      await holdOn(page, other, { id: 92 });
      await page.locator('#seal-strip').waitFor(); await landed(page);
      await page.locator('#seal-strip [data-strip-action="remove"]').tap();
      const goneAgain = await waitForAppRecord(page, (r) => placesOf(r, '大賞').taken.length === 0 && placesOf(r, '大賞').lists.length === 0, { description: 'Remove again' }).catch(() => null);
      await delay(300);
      await page.locator('#tray').tap(); await delay(800);
      const todayAfterRemove = await rowsOf(page, 'word:大賞'), stillThere = await rowsOf(page, `word:${WORD}`);
      check('G5.remove.everywhere', 'Remove un-saves the word everywhere in one write: out of taken, off every list, the bookmark −1, the strip gone, and Today shows it nowhere (the other word stays)',
        !!gone && !!goneAgain && afterRemove.count === count0 - 1 && !afterRemove.strip && undoShown && todayAfterRemove === 0 && stillThere >= 2,
        { gone: gone && placesOf(gone, '大賞'), count: [count0, afterRemove.count], strip: afterRemove.strip, undoShown, todayAfterRemove, stillThere });
      await page.screenshot({ path: resolve(evidence, `${engine}-G5-remove-today.png`) });
    });

    await walk('G5-tray', async (page) => {
      await openStory(page);
      const word = readerWord(page);
      await holdOn(page, word);
      await page.locator('#seal-strip').waitFor();
      await landed(page);
      await page.keyboard.press('Escape');
      await page.locator('#tray').tap();
      await delay(700);
      const land = await page.evaluate((key) => {
        const row = [...document.querySelectorAll('#app main .tray-line[data-kept-key]')].filter((node) => node.dataset.keptKey === key).at(-1);
        const box = row?.getBoundingClientRect();
        const ceiling = document.querySelector('#app > .chrome')?.getBoundingClientRect().bottom || 0;
        const floor = document.getElementById('primary-tabs')?.getBoundingClientRect().top || innerHeight;
        return { view: document.body.dataset.view, scrollY: Math.round(scrollY), row: box ? { top: Math.round(box.top), bottom: Math.round(box.bottom) } : null,
          ceiling: Math.round(ceiling), floor: Math.round(floor), focused: !!row && document.activeElement === row };
      }, `word:${WORD}`);
      check('G5.bookmark.lands', 'the bookmark lands on the kept words: Today scrolled to the newest kept word, on the glass under the bar, the keyboard on it',
        land.view === 'tray' && land.scrollY > 0 && !!land.row && land.row.top >= land.ceiling && land.row.bottom <= land.floor && land.focused, land);
      await page.screenshot({ path: resolve(evidence, `${engine}-G5-bookmark.png`) });
      // browsing never starts a review: a row opens its word's page; a list's name opens its page; Review this list is its own button
      const row = page.locator(`#app main .tray-line[data-kept-key="word:${WORD}"]`).last();
      await row.tap();
      await pageSettled(page);
      const opened = await page.evaluate(() => ({ view: document.body.dataset.view, page: !!document.getElementById('sheet') }));
      await page.locator('#sheet-back').tap();
      await bare(page);
      await page.locator('#app main .list-open').last().tap();
      await delay(400);
      const list = await page.evaluate(() => ({ view: document.body.dataset.view,
        reviews: [...document.querySelectorAll('#app main .list-review')].map((node) => ({ text: node.textContent.trim(), tag: node.tagName })) }));
      check('G5.browse.no-review', 'browsing the kept words never starts a review: a row opens its page, a list’s name its list; "Review this list" is a button of its own',
        opened.view === 'tray' && opened.page && list.view === 'list' && list.reviews.every((button) => button.tag === 'BUTTON' && /^Review this list · \d+$/u.test(button.text)), { opened, list });
    });

    await walk('G5-layers', async (page) => {
      await openStory(page);
      const rest = await page.evaluate(() => ({ layers: document.querySelectorAll('[data-layers]').length, block: document.querySelectorAll('#reader-layers').length,
        marks: document.querySelectorAll('#layers-mark').length, pressed: document.getElementById('layers-mark')?.getAttribute('aria-pressed') }));
      check('G5.layers.rest', 'at rest the reading is bare: no layer is open; 層 is one quiet mark', rest.layers === 0 && rest.block === 0 && rest.marks === 1 && rest.pressed === 'false', rest);
      const word = readerWord(page);
      await word.tap(); await delay(350);
      const tapped = await g5Facts(page);
      await page.keyboard.press('Escape'); await delay(200);
      await holdOn(page, word);
      await page.locator('#seal-strip').waitFor();
      const held = await g5Facts(page);
      await page.keyboard.press('Escape'); await delay(200);
      check('G5.layers.only-mark', 'a tap and a hold never open layers: only the 層 mark does', tapped.layers === 0 && tapped.layerBlock === 0 && held.layers === 0 && held.layerBlock === 0, { tapped, held });
      const paragraph = '#reader > [data-reader-prose]';
      // measured from the reader's own top, so a scroll is never mistaken for a line that moved
      const geometry = () => page.evaluate((paragraph) => {
        const origin = document.getElementById('reader').getBoundingClientRect().top;
        return [...document.querySelectorAll(paragraph)].map((node) => {
          const r = node.getBoundingClientRect();
          return [Math.round(r.top - origin), Math.round(r.height), [...node.querySelectorAll('.tok[data-index]')].slice(0, 12)
            .map((tok) => { const b = tok.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top - origin)]; })];
        });
      }, paragraph);
      const plain = await geometry();
      await page.locator('#layers-mark').tap(); await delay(350);
      const open = await page.evaluate(() => {
        const node = document.querySelector('#reader > [data-layers="open"]');
        const words = node ? [...node.querySelectorAll('.tok[data-index] ruby')] : [];
        // nothing is painted over the paragraph's words: its layers stand under it
        const shown = words.filter((ruby) => { const ink = getComputedStyle(ruby, '::before'); return ink.content !== 'none' && Number(ink.opacity) > 0.5; }).length;
        const block = document.getElementById('reader-layers');
        return { open: document.querySelectorAll('[data-layers]').length, rubies: words.length, shown, block: !!block, after: node?.nextElementSibling === block,
          indices: node ? [...node.querySelectorAll('.tok[data-index]')].map((tok) => Number(tok.dataset.index)) : [],
          kana: block?.querySelector('.reader-layers-reading .reader-layers-kana')?.textContent ?? null,
          meanings: block ? [...block.querySelectorAll('.reader-layers-meanings .reader-layers-ja')].map((word) => word.textContent) : [],
          labels: block ? [...block.querySelectorAll('.reader-layers-label')].map((label) => label.textContent) : [],
          pressed: document.getElementById('layers-mark')?.getAttribute('aria-pressed'), index: [...document.querySelectorAll('#reader > [data-reader-prose]')].indexOf(node) };
      });
      const during = await geometry();
      // the reading line is the paragraph read in kana: each written piece by the text's own reading, kana and marks as written
      const expectedKana = open.indices.map((index) => { const token = storyTokens[index]; return token?.f?.length ? token.f.map((pair) => pair.r || pair.t).join('') : token?.s ?? '\u0000'; }).join('');
      check('G5.layers.open', 'the 層 mark opens one paragraph’s layers in one block under it: the paragraph read in kana, its words’ meanings, and nothing painted over its words',
        open.open === 1 && open.block && open.after && open.rubies > 0 && open.shown === 0 && open.kana === expectedKana && open.meanings.length > 0 &&
        open.labels[0] === '読' && open.labels[1] === '意' && open.pressed === 'true', { ...open, expectedKana });
      check('G5.layers.lines-hold', 'the paragraph’s own lines never move while its layers are open (its layers stand under it)',
        open.index >= 0 && JSON.stringify(during.slice(0, open.index + 1)) === JSON.stringify(plain.slice(0, open.index + 1)), { open: open.index, plain: plain.slice(0, open.index + 1), during: during.slice(0, open.index + 1) });
      await page.screenshot({ path: resolve(evidence, `${engine}-G5-layers.png`) });
      // the layers, then a tap on a word: the layers fold, and the word's own ladder still runs
      const other = page.locator('#reader .tok[data-prose-label="大賞"]').first();
      await other.tap(); await delay(350);
      const folded = await page.evaluate(() => ({ layers: document.querySelectorAll('[data-layers]').length, block: document.querySelectorAll('#reader-layers').length,
        rung: document.querySelector('#reader .tok[data-prose-label="大賞"]')?.dataset.ladderRung || null, stage: !!document.getElementById('mini'),
        pressed: document.getElementById('layers-mark')?.getAttribute('aria-pressed') }));
      check('G5.layers.fold-word', 'with the layers open, a tap on a word folds them and still climbs that word’s ladder', folded.layers === 0 && folded.block === 0 &&
        (folded.rung === 'reading' || folded.stage) && folded.pressed === 'false', folded);
      const bareAgain = await geometry();
      check('G5.layers.bare-again', 'folded, the reading is bare and every line where it was', JSON.stringify(bareAgain) === JSON.stringify(plain), { plain: plain.length, bareAgain: bareAgain.length });
      await page.keyboard.press('Escape'); await delay(200);
      await page.locator('#layers-mark').tap(); await delay(250);
      await page.keyboard.press('Escape'); await delay(250);
      const escaped = await g5Facts(page);
      await page.locator('#layers-mark').tap(); await delay(250);
      await page.locator('#layers-mark').tap(); await delay(250);
      const toggled = await g5Facts(page);
      check('G5.layers.fold-keys', 'Escape folds the layers, and so does the mark again', escaped.layers === 0 && escaped.layerBlock === 0 && toggled.layers === 0 && toggled.layerBlock === 0, { escaped, toggled });
    });

    /** P7's method over a window that holds the whole move: rAF deltas from just before the gesture. */
    const measureMove = async (page, action, windowMs) => {
      await delay(250);
      await page.evaluate((ms) => new Promise((done) => {
        window.__g5f = [];
        requestAnimationFrame((t0) => {
          window.__g5f.push(t0);
          const until = t0 + ms;
          const tick = (t) => { window.__g5f.push(t); if (t < until) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          done();
        });
      }), windowMs);
      const began = Date.now();
      await action();
      await delay(Math.max(0, windowMs + 250 - (Date.now() - began)));
      const t = await page.evaluate(() => window.__g5f);
      const deltas = t.slice(1).map((v, i) => Math.round((v - t[i]) * 10) / 10);
      const sorted = [...deltas].sort((a, b) => a - b);
      return { worst: Math.max(...deltas), p95: sorted[Math.ceil(deltas.length * 0.95) - 1], over24: deltas.filter((d) => d > 24).length, frames: deltas.length, window: windowMs };
    };
    await walk('G5-frames', async (page) => {
      // P7's method: rAF deltas over the move's window, from just before the gesture, three samples (the first cold)
      for (let sample = 0; sample < 3; sample++) {
        await openStory(page);
        const word = readerWord(page);
        await word.scrollIntoViewIfNeeded(); await delay(400);
        const seal = await measureMove(page, () => holdOn(page, word, { id: 50 + sample, settle: 0 }), 1900);
        if (seal) frames.push({ engine, move: `G5 hold → seal → bookmark #${sample + 1}`, ...seal, deltas: undefined });
        await landed(page).catch(() => {});
        await page.keyboard.press('Escape'); await delay(250);
        const tray = await measureMove(page, () => page.locator('#tray').tap(), 1400);
        if (tray) frames.push({ engine, move: `G5 bookmark → kept words #${sample + 1}`, ...tray, deltas: undefined });
        // keep the record fresh for the next sample: take the word out by its explicit Remove
        await openStory(page);
        await holdOn(page, readerWord(page), { id: 60 + sample });
        await page.locator('#seal-strip').waitFor();
        await page.locator('#seal-strip [data-strip-action="remove"]').tap();
        await delay(400);
      }
      if (engine === 'webkit') {
        // one gate per move, never averaged: the hold's seal and its flight to the bookmark; the bookmark's landing
        for (const [id, prefix, title] of [['seal', 'G5 hold → seal', 'the hold, the 印 pressed and its flight to the bookmark'],
          ['landing', 'G5 bookmark → kept words', 'the bookmark’s landing on the kept words (a room change)']]) {
          // the frames list also holds G3's mode rows and P7's reps (no .move): only this walk's own rows are read
          const mine = frames.filter((row) => row.engine === engine && typeof row.move === 'string' && row.move.startsWith(prefix));
          const worst = Math.max(...mine.map((row) => row.worst));
          check(`G5.frames.${id}`, `${title}: the worst frame ≤ 24 ms in WebKit (a proxy; the phone is the truth)`, mine.length === 3 && worst <= 24,
            mine.map((row) => ({ move: row.move, worst: row.worst, p95: row.p95, over24: row.over24 })));
        }
      }
    });

    if (g5Controls) {
      const specs = [
        { id: 'second-hold-unkeeps', run: 'G5-second', probe: g5SecondProbe, kill: 'G5.second-hold',
          witness: (row) => row.observed.cards === 0,
          edits: [{ file: 'corridor.js', key: 'second-hold-toggles',
            from: "  if (before === 'taken') return { status: 'already-kept', key };",
            to: "  if (before === 'taken') { await toggleTaken(node, label); return { status: 'already-kept', key }; } // G5 negative: the naive toggle" }] },
        { id: 'strip-covers-a-button', run: 'G5-place', probe: g5PlaceProbe, kill: 'G5.strip.place',
          witness: (row) => row.observed?.covered?.length > 0,
          edits: [{ file: 'corridor.js', key: 'strip-over-the-foot',
            from: '  let seat = seatsNow();',
            to: "  let seat = { top: (document.getElementById('dials-toggle')?.getBoundingClientRect().top ?? ceiling) - 8, tall: h, side: 'below' }; // G5 negative: laid over a button" }] },
        { id: 'layer-stays-open', run: 'G5-layer-fold', probe: g5LayerProbe, kill: 'G5.layers.fold-paper',
          witness: (row) => row.observed.layers > 0 || row.observed.layerBlock > 0,
          edits: [{ file: 'corridor.js', key: 'layers-never-fold',
            from: "  if (!readerLayers || event.target?.closest?.('#layers-mark')) return;\n  foldReaderLayers();",
            to: "  if (!readerLayers || event.target?.closest?.('#layers-mark')) return; // G5 negative: the layers stay" }] },
      ];
      for (const spec of specs) {
        const control = { engine, id: spec.id, edits: spec.edits, served: [], pageErrors: [] };
        const begin = rows.length;
        await walk(spec.run, spec.probe, { control });
        control.rows = rows.splice(begin);
        const baseline = g5Schedules[spec.run] || [];
        const expected = baseline.map((row) => row.id);
        const actual = control.rows.map((row) => row.id);
        const target = control.rows.find((row) => row.id === `${engine}/${spec.kill}`);
        const cleanCandidate = baseline.length > 1 && baseline.every((row) => row.ok) && new Set(expected).size === expected.length;
        const complete = !control.error && control.pageErrors.length === 0 && JSON.stringify(actual) === JSON.stringify(expected) &&
          spec.edits.every((edit) => control.served.some((served) => served.file === edit.file && served.applied.some((applied) => applied.key === edit.key)));
        let witnessed = false;
        try { witnessed = !!target && spec.witness(target); } catch { witnessed = false; }
        const killed = cleanCandidate && complete && !!target && !target.ok && witnessed && control.rows.every((row) => row.id === target.id || row.ok);
        control.verdict = !cleanCandidate || !complete ? 'incomplete' : killed ? 'killed' : target?.ok ? 'survived' : 'contaminated';
        const restoreBegin = rows.length;
        await walk(spec.run, spec.probe);
        control.restore = rows.splice(restoreBegin);
        const restored = JSON.stringify(control.restore.map((row) => row.id)) === JSON.stringify(expected) && control.restore.every((row) => row.ok);
        controls.push(control);
        check(`G5.negative.${spec.id}`, 'candidate passes, the named product mutation fails its intended assertion, and the unmodified restore passes',
          killed && restored, { verdict: control.verdict, cleanCandidate, complete, restored, target, error: control.error });
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

writeFileSync(resolve(evidence, 'verify-word-grammar.json'), JSON.stringify({ site, gitSha: identity.gitSha, artifactSha256: identity.artifactSha256, verifierSha256, browserVersions, scope: skyReadingsOnly ? 'G3 actual sky glyph and reader particle across all dials; canonical host getter; hosted sky particle rendering unproven because its legacy scene is unreachable; no G1 or frame gates' : controlsOnly ? 'G3 negative controls only; exact candidate schedules, mutants and restores; no G1 or frame gates' : roomsOnly ? 'G3 Words, sky words/glyphs, and reader particle; fixed activation counts; no G1 or frame gates' : sentencesOnly ? 'G3 sentence/example rendered ruby, all three dials, and sealed front; no G1 or frame gates' : kanaOnly ? 'G3 identical kana, particle bar Save, and meaningful particle dials; no G1 or frame gates' : g3Only ? 'G3 only; G1 gates not run' : g5Only ? `G5 only${g5Controls ? ' with its negative controls' : ''}; G1 and G3 gates not run` : `G1, G3 and G5${g5Controls ? ' with G5 negative controls' : ''}`, rows, frames, controls }, null, 1));
const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} — evidence ${evidence}`);
process.exit(failed.length ? 1 : 0);
