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
import { readAppRecord, readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';
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
const g3Only = controlsOnly || roomsOnly || sentencesOnly || kanaOnly || skyReadingsOnly || process.argv.includes('--g3-only');
const withControls = controlsOnly || process.argv.includes('--controls');
const g6FramesOnly=process.argv.includes('--g6-frames-only');
const g6ControlsOnly=process.argv.includes('--g6-controls-only');
const g6Only=g6FramesOnly||g6ControlsOnly||process.argv.includes('--g6-only');
assert(!(g6FramesOnly&&g6ControlsOnly),'Choose one G6 narrow schedule');
assert(!(g6Only&&g3Only),'G6 and G3 narrow schedules are distinct');

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
    thread: [...sheet.querySelectorAll(':scope > .scale-thread [data-stack-index][data-node]')].map(n => ({
      node:n.dataset.node, index:Number(n.dataset.stackIndex), reading:n.dataset.reading||'', seq:n.dataset.seq||null,
      current:n.getAttribute('aria-current')==='step', tag:n.tagName, tabIndex:n.tabIndex,
      visible:!!n.getClientRects().length&&!n.closest('[inert],[aria-hidden="true"]'), disabled:n.disabled===true })),
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

/* G6: scale travel, exact thread ancestry, retained source and sky input admission.
 * Uses this verifier's actual browser, artifact identity, rows and frame sampler.
 * Controlled scheduling/fault fixtures are explicitly labeled and byte-hashed. */

function g6ExactPageThread(facts,expected){
  const beads=facts?.thread||[];
  return beads.length===expected.length&&beads.every((b,i)=>b.node===expected[i]&&b.index===i&&b.visible&&b.current===(i===expected.length-1)&&
    (b.current?b.tag==='SPAN'&&b.tabIndex<0:b.tag==='BUTTON'&&!b.disabled&&b.tabIndex>=0))&&facts.node===expected.at(-1);
}

const G6_ORDER = Object.freeze(['sky', 'shelf', 'article', 'sentence', 'word', 'kanji', 'part']);
const G6_RAIL = '.scale-thread:not([inert]):not([aria-hidden="true"]):not([inert] .scale-thread):not([aria-hidden="true"] .scale-thread):visible';
const G6_ORIGIN = Object.freeze({ passage: STORY.id, index: 76, word: '総理', kanji: '総', part: '糸', reading: 'そうり' });
const G6_EDGES = Object.freeze(['article','sentence','word','kanji','part','kanji','word','sentence','article','shelf','sky','shelf','article']);
const G6_FORTY = Object.freeze(['article','sentence','word','kanji','part','kanji','word','sentence','article','shelf','sky','shelf','article','sentence','word','kanji','part','kanji','word','sentence','article','shelf','sky','shelf','article','sentence','word','kanji','part','kanji','word','sentence','article','shelf','sky','shelf','article','sentence','word','sentence','article']);
assert.equal(G6_EDGES.length, 13);
assert.equal(new Set(G6_EDGES.slice(1).map((to,i)=>`${G6_EDGES[i]}>${to}`)).size, 12);
assert.equal(G6_FORTY.length, 41);
for (const itinerary of [G6_EDGES, G6_FORTY]) for (let i=1; i<itinerary.length; i++)
  assert.equal(Math.abs(G6_ORDER.indexOf(itinerary[i])-G6_ORDER.indexOf(itinerary[i-1])), 1);

const g6ScaleFacts = (page) => page.evaluate(() => {
  const rails = [...document.querySelectorAll('.scale-thread[data-scale]')].filter(n=>!n.closest('[inert],[aria-hidden="true"]')&&n.getClientRects().length);
  const rail = rails[0];
  const active = document.activeElement;
  const rect = active?.getBoundingClientRect();
  const reader = document.getElementById('reader');
  return {
    firstBead: !!rail?.querySelector('button')?.hasAttribute('data-scale-out') && rail?.querySelector('button')?.textContent.trim()==='宙',
    railCount: rails.length, totalRailCount:document.querySelectorAll('.scale-thread[data-scale]').length,
    scale: rail?.dataset.scale || null, passage: rail?.dataset.passageId || null,
    tokenIndex: rail?.dataset.tokenIndex ?? null,
    sentenceStart: rail?.dataset.sentenceStart ?? null, sentenceEnd: rail?.dataset.sentenceEnd ?? null,
    node: document.getElementById('sheet')?.dataset.node || null,
    reading: document.querySelector('#sheet > .reading')?.textContent.trim() || '',
    beads: [...(rail?.querySelectorAll('[data-scale-bead]')||[])].map(n=>({scale:n.dataset.scaleBead,node:n.dataset.node||null,stackIndex:n.dataset.stackIndex??null,current:n.getAttribute('aria-current')==='step',disabled:n.disabled===true,tag:n.tagName,tabIndex:n.tabIndex,reading:n.dataset.reading||null,seq:n.dataset.seq||null})),
    sheetCount: document.querySelectorAll('#sheet').length,
    miniCount: document.querySelectorAll('#mini').length,
    view: document.body.dataset.view,
    readerVisible: !!reader && !reader.closest('[inert],[aria-hidden="true"]') && reader.getClientRects().length > 0,
    title: document.querySelector('main h1, #app h1')?.textContent.trim() || '',
    sentenceText: (()=>{const n=document.querySelector('#sheet .sent-reader')?.cloneNode(true);n?.querySelectorAll('rt,rp').forEach(x=>x.remove());return n?.textContent||null;})(),
    active: { tag: active?.tagName, id: active?.id, connected: !!active?.isConnected,
      inert: !!active?.closest('[inert],[aria-hidden="true"]'),
      visible: !!rect?.width && !!rect?.height, body: active === document.body },
    stamp: window.__g6DocumentStamp, scrollY,
  };
});
const g6OriginFacts = (page,index=G6_ORIGIN.index) => page.locator(`#reader .tok[data-index="${index}"]`).evaluate((node) => {
  const clone=node.cloneNode(true);clone.querySelectorAll('rt,rp').forEach(n=>n.remove());
  const rect=node.getBoundingClientRect();
  return { index:node.dataset.index, para:node.dataset.para, label:node.dataset.proseLabel,
    word:node.dataset.word||null, printed:clone.textContent, top:rect.top, bottom:rect.bottom,
    scrollY, connected:node.isConnected, focused:document.activeElement===node,
    title:document.querySelector('main h1, #app h1')?.textContent.trim()||'' };
});
const g6Learning = (record) => Object.fromEntries(['taken','srs','revlog','lists'].map(k=>[k,record[k]??null]));
const g6SameToken = (a,b) => ['index','para','label','word','printed','title'].every(k=>a[k]===b[k]);
async function g6Activate(page, locator, modality) {
  assert.equal(await locator.count(),1,'one exact real scale control');
  assert(await locator.isVisible() && await locator.isEnabled(),'scale control is exposed and enabled');
  if(modality==='touch') return locator.tap();
  await locator.focus();
  assert(await locator.evaluate(node=>document.activeElement===node),'native keyboard focus reaches actual control');
  await page.keyboard.press('Enter');
}
async function g6TabReach(page, locator) {
  // Start from the current real focus; no tabindex changes or private focus model.
  for(let n=0;n<160;n++){
    if(await locator.evaluate(node=>document.activeElement===node)) return {found:true,tabs:n};
    await page.keyboard.press('Tab');
  }
  return {found:false,tabs:160};
}
async function g6OpenOrigin(page, modality,{index=G6_ORIGIN.index,boot=true}={}) {
  if(boot){
  await page.goto(`${host.origin}/index.html?entry=drift&room=shelf&ui=bi`);
  await page.waitForFunction(()=>document.body.dataset.ready==='1',null,{timeout:30000});
  const direct=page.locator(`[data-passage="${STORY.id}"]:not([data-recommendation]) .shelf-open`).first();
  if(await direct.count()) await g6Activate(page,direct,modality);
  else{
    await openShelfTools(page);
    await page.locator('#shelf-reading-search').fill(STORY.search);
    await page.locator('#shelf-reading-search').press('Enter');
    await g6Activate(page,page.locator(`#shelf-reading-results [data-passage="${STORY.id}"] .shelf-open`).first(),modality);
  }
  }
  const word=page.locator(`#reader .tok[data-index="${index}"][data-prose-label="${G6_ORIGIN.word}"]`);
  await word.waitFor();await word.scrollIntoViewIfNeeded();await delay(300);
  const occurrence=await word.elementHandle();
  assert(occurrence && await occurrence.evaluate(n=>n.isConnected));
  if(modality==='touch')await occurrence.tap();
  else{await focusWord(page,word);await page.keyboard.press('Enter');}
  await page.waitForFunction(node=>node.dataset.ladderRung==='reading'||!!document.getElementById('mini'),occurrence,{timeout:10000});
  if(!await page.locator('#mini').count()){
    assert.equal(await occurrence.evaluate(node=>node.dataset.ladderRung),'reading');
    if(modality==='touch')await occurrence.tap();else await page.keyboard.press('Enter');
  }
  await page.locator('#mini .mini-word').waitFor();
  assert.equal((await slipFacts(page)).word,G6_ORIGIN.word);
  // Capture source provenance through the public full-entry route (go owns it).
  await g6Activate(page,page.locator('#mini .mini-word'),modality);await pageSettled(page);
  assert.equal(await page.locator('#sheet').getAttribute('data-node'),`word:${G6_ORIGIN.word}`);
  await g6Activate(page,page.locator('#sheet-back'),modality);await bare(page);
  assert.equal((await slipFacts(page)).word,G6_ORIGIN.word);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.getElementById('mini'));
  await delay(300);
  const origin=await g6OriginFacts(page,index);
  assert(origin.scrollY>0 && origin.top>=0 && origin.bottom<=844,'fixture is an actual nonzero visible source line');
  assert(await occurrence.evaluate(node=>node.isConnected),'preparation retains exact selected occurrence');
  const state=await g6ScaleFacts(page);
  assert.equal(state.scale,'article');assert.equal(state.tokenIndex,String(index));
  assert.equal(state.passage,G6_ORIGIN.passage);
  assert(Number.isInteger(Number(state.sentenceStart))&&Number(state.sentenceStart)<=index);
  assert(Number(state.sentenceEnd)>index,'retained source sentence includes selected occurrence');
  const sentenceText=await page.evaluate(([start,end])=>[...document.querySelectorAll('#reader .tok[data-index]')].filter(n=>Number(n.dataset.index)>=start&&Number(n.dataset.index)<end).map(n=>{const c=n.cloneNode(true);c.querySelectorAll('rt,rp').forEach(x=>x.remove());return c.textContent;}).join(''),[Number(state.sentenceStart),Number(state.sentenceEnd)]);
  assert(sentenceText.length>0,'actual source sentence text is nonempty');
  return {origin,stamp:state.stamp,sentenceText,range:[state.sentenceStart,state.sentenceEnd],learning:g6Learning(await readAppRecord(page))};
}
function g6ControlFor(page,from,to){
  if(from==='sky')return page.locator(`#drift-layer button[data-article-id="${G6_ORIGIN.passage}"]`);
  if(from==='shelf'&&to==='article')return page.locator(`[data-passage="${G6_ORIGIN.passage}"]:not([data-recommendation]) .shelf-open`).first();
  const direction=G6_ORDER.indexOf(to)>G6_ORDER.indexOf(from)?'in':'out';
  return page.locator(`${G6_RAIL}[data-scale="${from}"] button[data-scale-${direction}]`);
}
async function g6Move(page,{from,to,modality,home,timing=false}){
  const before=await g6ScaleFacts(page);
  assert.equal(before.scale,from,`edge begins at actual ${from}`);
  const control=g6ControlFor(page,from,to);
  if(modality==='keyboard')assert((await g6TabReach(page,control)).found,`real Tab order reaches ${from}→${to}`);
  let measurement=null;
  if(timing)measurement=await measure(page,()=>g6Activate(page,control,modality));
  else await g6Activate(page,control,modality);
  let arrived=true;
  try{await page.waitForFunction(scale=>[...document.querySelectorAll('.scale-thread')].some(n=>!n.closest('[inert],[aria-hidden="true"]')&&n.getClientRects().length&&n.dataset.scale===scale),to,{timeout:5000});}
  catch(error){if(error.name!=='TimeoutError')throw error;arrived=false;}
  // A missing inverse becomes a named transition assertion, not a swallowed harness exception.
  const after=await g6ScaleFacts(page);
  const identity=after.passage===G6_ORIGIN.passage && after.tokenIndex===home.origin.index &&
    JSON.stringify([after.sentenceStart,after.sentenceEnd])===JSON.stringify(home.range);
  const pageIdentity=to==='word'?after.node===`word:${G6_ORIGIN.word}`&&after.reading===G6_ORIGIN.reading:to==='kanji'?after.node===`kanji:${G6_ORIGIN.kanji}`:
    to==='part'?after.node===`radical:${G6_ORIGIN.part}`:to==='sentence'?after.node?.startsWith('sent:')&&after.sentenceText===home.sentenceText:
    to==='article'?after.view==='reader'&&after.readerVisible:to==='shelf'?after.view==='shelf':after.view==='drift';
  const ancestry=G6_ORDER.slice(0,G6_ORDER.indexOf(to)+1).every(scale=>after.beads.some(b=>b.scale===scale))&&
    after.beads.filter(b=>b.current).length===1&&after.beads.some(b=>b.scale===to&&b.current&&(b.disabled||(b.tag==='SPAN'&&b.tabIndex<0)));
  const focus=modality!=='keyboard'||(after.active.connected&&!after.active.inert&&after.active.visible&&!after.active.body);
  return {ok:arrived&&after.scale===to&&after.railCount===1&&after.firstBead&&after.sheetCount<=1&&after.miniCount===0&&identity&&pageIdentity&&ancestry&&focus&&after.stamp===home.stamp,
    observed:{from,to,arrived,before,after,identity,pageIdentity,ancestry,focus,measurement}};
}
async function g6Line(page,home){
  // Explicit production return completion; the verifier never corrects scroll.
  let returnCompleted=true;
  try {await page.waitForFunction(index=>document.querySelector('#reader')?.dataset.scaleReturnIndex===String(index),Number(home.origin.index),{timeout:5000});}
  catch(error){if(error.name!=='TimeoutError')throw error;returnCompleted=false;}
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const current=await g6OriginFacts(page,home.origin.index),state=await g6ScaleFacts(page);
  const delta=Math.abs(current.top-home.origin.top);
  return {ok:returnCompleted&&g6SameToken(home.origin,current)&&current.connected&&current.focused&&current.scrollY>0&&delta<=4&&state.scale==='article'&&
    state.passage===G6_ORIGIN.passage&&state.stamp===home.stamp,
    observed:{origin:home.origin,current,delta,state,returnCompleted}};
}
async function g6Walk(page,{modality,itinerary,emit,timing=false}){
  const home=await g6OpenOrigin(page,modality);
  let blocked=null;
  for(let i=1;i<itinerary.length;i++){
    const from=itinerary[i-1],to=itinerary[i],id=`edge-${i}.${from}-${to}`;
    if(blocked){emit(id,`${from}→${to} executes`,false,{unexecuted:true,blockedBy:blocked});continue;}
    try{
      const row=await g6Move(page,{from,to,modality,home,timing});
      emit(id,`${from}→${to}: one adjacent scale, original source, exposed focus`,row.ok,row.observed);
      if(row.observed.measurement){
        const m=row.observed.measurement;const over16_7=m.deltas.filter(d=>d>16.7).length;
        frames.push({engine,grammar:'G6',modality,edge:`${from}→${to}`,...m,over16_7});
        emit(`${id}.frames`,'per-edge worst≤24ms and ≤2 deltas over16.7ms in WebKit; Chromium recorded separately',
          Number.isFinite(m.worst)&&Number.isFinite(m.p95)&&(engine!=='webkit'||(m.worst<=24&&over16_7<=2)),{...m,over16_7});
      }
      if(!row.ok){blocked=id;continue;}
      if(to==='article'){
        const line=await g6Line(page,home);emit(`${id}.line`,'same source occurrence and nonzero line within4px',line.ok,line.observed);
      }
    }catch(error){blocked=id;emit(id,`${from}→${to} executes`,false,{harnessError:String(error.stack||error)});}
  }
  const after=g6Learning(await readAppRecord(page));
  emit('no-record-work','scale travel creates no saved card/list/grade work',JSON.stringify(home.learning)===JSON.stringify(after),{before:home.learning,after});
  return home;
}
async function g6TwoPointerPolicy(page,selector){
  const target=page.locator(selector).first();await target.waitFor();
  const before=await g6ScaleFacts(page);
  const witness=await target.evaluate(node=>{
    const r=node.getBoundingClientRect(),events=[],ancestors=[];
    for(let n=node;n;n=n.parentElement)ancestors.push({tag:n.tagName,id:n.id,action:getComputedStyle(n).touchAction});
    const fire=(type,id,x,y,primary)=>{const event=new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:primary,clientX:x,clientY:y,buttons:type==='pointercancel'?0:1});node.dispatchEvent(event);events.push({type,id,defaultPrevented:event.defaultPrevented,isTrusted:event.isTrusted});};
    const x=r.left+r.width/2,y=r.top+r.height/2;
    fire('pointerdown',601,x-12,y,true);fire('pointerdown',602,x+12,y,false);
    fire('pointermove',601,x-24,y,true);fire('pointermove',602,x+24,y,false);
    fire('pointercancel',601,x-24,y,true);fire('pointercancel',602,x+24,y,false);
    return {events,ancestors,viewport:document.querySelector('meta[name="viewport"]')?.content||'',label:'synthetic two-pointer actual-handler cancellation witness; not native pinch zoom'};
  });
  await delay(250);const after=await g6ScaleFacts(page);
  const policy=witness.ancestors.every(({action})=>action!=='none'&&(!/pan-[xy]/u.test(action)||action.includes('pinch-zoom')))&&
    !/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(?:\D|$)/iu.test(witness.viewport);
  return {ok:policy&&witness.events.filter(e=>e.type==='pointermove').length===2&&witness.events.every(e=>!e.defaultPrevented)&&
    after.scale===before.scale&&after.node===before.node&&after.miniCount===before.miniCount,
    observed:{before,after,...witness}};
}
async function g6NativeChromiumPinch(page,context,selector){
  const target=page.locator(selector).first();await target.scrollIntoViewIfNeeded();const box=await target.boundingBox();assert(box);
  const before=await g6ScaleFacts(page),cdp=await context.newCDPSession(page);
  await page.evaluate(()=>{window.__g6NativeEvents=[];const pointers=new Set();const capture=e=>{
    if(e.pointerType!=='touch')return;
    if(e.type==='pointerdown')pointers.add(e.pointerId);const count=pointers.size;
    queueMicrotask(()=>window.__g6NativeEvents.push({type:e.type,isTrusted:e.isTrusted,cancelable:e.cancelable,defaultPrevented:e.defaultPrevented,count}));
    if(e.type==='pointerup'||e.type==='pointercancel')pointers.delete(e.pointerId);
  };for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,capture,{capture:true});});
  const send=(type,rad)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[-1,1].map((sign,id)=>({id,x:box.x+box.width/2+sign*rad,y:box.y+box.height/2,radiusX:4,radiusY:4,force:1}))});
  try{await send('touchStart',12);for(const rad of [16,20,24,28]){await delay(40);await send('touchMove',rad);}await send('touchEnd');}
  finally{await cdp.detach();}
  await delay(300);const events=await page.evaluate(()=>window.__g6NativeEvents),after=await g6ScaleFacts(page);
  return {ok:events.some(e=>e.isTrusted&&e.count===2)&&events.filter(e=>e.count===2).every(e=>!e.defaultPrevented)&&before.scale===after.scale&&before.node===after.node,
    observed:{events,before,after,label:'Chromium native protocol multi-touch; does not establish physical iPhone zoom'}};
}
// G6 thread assertions use actual stack occurrence metadata, never crumb text.
function g6CanonicalBeads(facts){return facts.beads.filter(b=>b.stackIndex!==null);}
function g6BeadIdentity(b){return {node:b.node,index:b.stackIndex,reading:b.reading,seq:b.seq};}
async function g6Bead(page,scale,modality,{index=null}={}){
  const before=await g6ScaleFacts(page);
  const eligible=before.beads.filter(b=>b.scale===scale&&!b.current&&(index===null||b.stackIndex===String(index)));
  assert.equal(eligible.length,1,'one genuine ancestor occurrence');
  const target=eligible[0],suffix=index===null?'':`[data-stack-index="${index}"]`;
  const control=page.locator(`${G6_RAIL} button[data-scale-bead="${scale}"]${suffix}`);
  if(modality==='keyboard')assert((await g6TabReach(page,control)).found,'ancestor is reachable in native Tab order');
  await g6Activate(page,control,modality);
  await page.waitForFunction(scale=>[...document.querySelectorAll('.scale-thread')].some(n=>!n.closest('[inert],[aria-hidden="true"]')&&n.getClientRects().length&&n.dataset.scale===scale),scale,{timeout:5000});
  const after=await g6ScaleFacts(page),prefix=index===null?[]:g6CanonicalBeads(before).filter(b=>Number(b.stackIndex)<=Number(index)).map(g6BeadIdentity);
  const expected=index===null?after.node===null||scale==='sentence':JSON.stringify(g6CanonicalBeads(after).map(g6BeadIdentity))===JSON.stringify(prefix)&&after.node===target.node;
  return {ok:after.scale===scale&&after.railCount===1&&after.miniCount===0&&expected&&after.stamp===before.stamp&&after.beads.filter(b=>b.current).length===1&&
    (modality!=='keyboard'||after.active.connected&&!after.active.inert&&after.active.visible&&!after.active.body),observed:{before,after,target,prefix,expected}};
}
async function g6Descend(page,home,modality,to='part'){
  let from=(await g6ScaleFacts(page)).scale;
  while(from!==to){const next=G6_ORDER[G6_ORDER.indexOf(from)+1];assert(next,`real inner edge from ${from}`);const row=await g6Move(page,{from,to:next,home,modality});assert(row.ok,JSON.stringify(row.observed));from=next;}
}
async function g6ThreadAncestors(page,{modality,emit}){
  const home=await g6OpenOrigin(page,modality);
  for(const scale of ['word','kanji','sentence','article','shelf']){
    await g6Descend(page,home,modality);
    const before=await g6ScaleFacts(page),candidate=before.beads.find(b=>b.scale===scale&&!b.current);
    assert(candidate,`genuine ${scale} ancestor exists`);
    const row=await g6Bead(page,scale,modality,{index:candidate.stackIndex});
    emit(`bead.${scale}`,'direct ancestor retains exact canonical prefix and source identity',row.ok&&row.observed.after.tokenIndex===home.origin.index&&row.observed.after.passage===G6_ORIGIN.passage,row.observed);
    if(scale==='article'){const line=await g6Line(page,home);emit('bead.article.line','direct article bead restores the same nonzero source line',line.ok,line.observed);}
    if(scale==='shelf'){const step=await g6Move(page,{from:'shelf',to:'article',home,modality});assert(step.ok,JSON.stringify(step.observed));const line=await g6Line(page,home);emit('bead.shelf.line','shelf detour returns to that same source occurrence',line.ok,line.observed);}
  }
  emit('no-record-work','ancestor jumps create no saved cards or grades',JSON.stringify(home.learning)===JSON.stringify(g6Learning(await readAppRecord(page))));
}
async function g6RecursiveThread(page,{modality,emit}){
  await g6OpenOrigin(page,modality);
  await g6Activate(page,page.locator('#chrome-search'),modality);
  await page.locator('#nav-search-input').fill('過酷');
  const row=page.locator('.nav-search-row').filter({hasText:'過酷'}).first();await row.waitFor();
  await g6Activate(page,row,modality);await pageSettled(page);
  assert.equal(await page.locator('#sheet').getAttribute('data-node'),'word:過酷');
  const initial=await g6ScaleFacts(page),learning=g6Learning(await readAppRecord(page));
  for(const word of ['厳しい','過酷']){await g6Activate(page,page.locator(`#sheet button.sem-row[data-sem="${word}"]`),modality);await pageSettled(page);assert.equal(await page.locator('#sheet').getAttribute('data-node'),`word:${word}`);}
  const nested=await g6ScaleFacts(page),nodes=g6CanonicalBeads(nested),initialNodes=g6CanonicalBeads(initial);
  const expected=[...initialNodes.map(g6BeadIdentity),{node:'word:厳しい',index:String(initialNodes.length)},{node:'word:過酷',index:String(initialNodes.length+1)}];
  emit('recursive.order','native reciprocal semantic doors retain all three ordered word occurrences',nodes.length===expected.length&&nodes.every((b,i)=>b.node===expected[i].node&&b.stackIndex===expected[i].index)&&nodes.at(-1).current&&nodes[0].node===nodes.at(-1).node,{initial,nested,expected});
  const first=nodes.find(b=>b.node==='word:過酷');assert(first&&!first.current);
  const returned=await g6Bead(page,'word',modality,{index:first.stackIndex});
  emit('recursive.ancestor','earlier identical word bead selects its stack occurrence, not latest matching label',returned.ok&&g6CanonicalBeads(returned.observed.after).length===Number(first.stackIndex)+1,returned.observed);
  emit('recursive.no-record-work','recursive navigation makes no saved-card or grade work',JSON.stringify(learning)===JSON.stringify(g6Learning(await readAppRecord(page))));
}
// The sole altered byte seam delays one return callback. It does not replace its
// admission guard or scroll/focus body, and is NOT an unmodified-candidate proof.
const G6_RETURN_FRAME_FIXTURE={id:'deferred-return-frame',edits:[{file:'corridor.js',key:'hold-one-return-frame',
  from:'requestAnimationFrame(() => {\n    if (!current()) return;\n    window.scrollTo(0, visit.scroll);',
  to:'window.__g6ReturnFrames.defer(() => {\n    if (!current()) return;\n    window.scrollTo(0, visit.scroll);'}]};
const g6InstallReturnFrameFixture=()=>{const queued=[];window.__g6ReturnFrames={defer:fn=>{queued.push(fn);return queued.length;},count:()=>queued.length,release:()=>{const all=queued.splice(0);all.forEach(fn=>requestAnimationFrame(fn));return all.length;}};};
async function g6AbandonedReturn(page,{modality,emit,kind}){
  const home=await g6OpenOrigin(page,modality);await g6Descend(page,home,modality);
  await g6Bead(page,'article',modality);
  await page.waitForFunction(()=>window.__g6ReturnFrames.count()===1);
  const pending=await page.evaluate(()=>({queued:window.__g6ReturnFrames.count(),marker:document.querySelector('#reader')?.dataset.scaleReturnIndex||null}));
  assert.equal(pending.marker,null,'new source fixture has no stale completed-return marker');
  if(kind==='navigate'){await g6Activate(page,page.locator('#chrome-search'),modality);await page.locator('#nav-search-input').waitFor();await page.locator('#nav-search-input').focus();}
  else if(kind==='key'){await page.keyboard.press('PageDown');await delay(150);}
  else{assert.equal(kind,'wheel');await page.mouse.move(380,500);await page.mouse.wheel(0,240);await delay(150);}
  const before=await page.evaluate(()=>({view:document.body.dataset.view,scrollY,focused:document.activeElement?.id||null,marker:document.querySelector('#reader')?.dataset.scaleReturnIndex||null}));
  const released=await page.evaluate(()=>window.__g6ReturnFrames.release());await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const after=await page.evaluate(()=>({view:document.body.dataset.view,scrollY,focused:document.activeElement?.id||null,marker:document.querySelector('#reader')?.dataset.scaleReturnIndex||null}));
  emit(`abandoned.${kind}`,'an admitted return frame cannot steal focus/scroll after native superseding input',released===1&&JSON.stringify(before)===JSON.stringify(after)&&after.marker===null,{label:'controlled scheduling fixture, one exact served-byte override',pending,before,after,released,input:kind==='key'?'native PageDown':kind==='wheel'?'native mouse wheel':'native navigation control',sourceIndex:home.origin.index});
}
async function g6ReplacementSource(page,{modality,emit}){
  const old=await g6OpenOrigin(page,modality);
  const fresh=await g6OpenOrigin(page,modality,{index:43,boot:false});
  assert(old.origin.index!==fresh.origin.index&&old.origin.word===fresh.origin.word,'two real occurrences of the same word');
  for(const [from,to]of [['article','shelf'],['shelf','sky'],['sky','shelf'],['shelf','article']]){const moved=await g6Move(page,{from,to,home:fresh,modality});assert(moved.ok,JSON.stringify(moved.observed));}
  const returned=await g6Line(page,fresh);
  emit('source.replaced','later same-spelling occurrence replaces the earlier return target',returned.ok&&returned.observed.current.index==='43'&&returned.observed.current.index!==old.origin.index,{old:old.origin,fresh:fresh.origin,...returned.observed});
}

async function g6SkyHome(page){
  const home=await g6OpenOrigin(page,'touch');
  for(const [from,to]of [['article','shelf'],['shelf','sky']]){const r=await g6Move(page,{from,to,modality:'touch',home});assert(r.ok);}
  await page.waitForFunction(()=>window.__DRIFT__?.canNavigate()===true&&document.querySelector('#drift-layer')?.dataset.recordState==='active');
  return home;
}
const g6SkyFacts=page=>page.evaluate(()=>({view:document.body.dataset.view,mini:!!document.getElementById('mini'),sheet:document.getElementById('sheet')?.dataset.node||null,
  allowed:window.__DRIFT__?.canNavigate(),place:window.__DRIFT__?.capturePlace(),cuePending:document.querySelector('#drift-layer')?.hasAttribute('data-record-cue-pending'),
  grades:[...document.querySelectorAll('#drift-layer [data-record-pending][aria-busy="true"]')].map(n=>n.textContent),
  stars:[...document.querySelectorAll('#drift-layer .scale-star-kept')].map(n=>({key:n.dataset.keptKey,label:n.textContent,hidden:n.hidden,color:getComputedStyle(n).color}))}));
async function g6SkyPoint(page){
  return page.evaluate(()=>{
    const layer=document.getElementById('drift-layer'),sky=document.getElementById('sky');
    const eligible=(x,y)=>{const n=document.elementFromPoint(x,y);return n&&sky?.contains(n)&&layer?.contains(n)&&!n.closest('.word,.glyph,.part,#card,#radoc,#lvl,.scale-star,[data-drift-chrome]');};
    for(const y of [410,500,300,600,210])for(const x of [195,145,245])if([-64,-28,28,64].every(dx=>eligible(x+dx,y)))return {x,y,owners:[-64,-28,28,64].map(dx=>{const n=document.elementFromPoint(x+dx,y);return {tag:n.tagName,id:n.id,className:n.className};})};
    return null;
  });
}
async function g6Hand(page,context,native){
  const cdp=native?await context.newCDPSession(page):null;
  await page.evaluate(()=>{window.__g6HandEvents=[];const observe=e=>{if(e.pointerType!=='touch')return;queueMicrotask(()=>window.__g6HandEvents.push({type:e.type,id:e.pointerId,trusted:e.isTrusted,prevented:e.defaultPrevented,target:e.target.id||e.target.className}));};for(const t of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(t,observe,{capture:true,passive:true});});
  const points=new Map();
  const send=async(type,id,x,y,{foreign=false}={})=>{
    if(type==='pointerdown'||type==='pointermove')points.set(id,{id,x,y,radiusX:3,radiusY:3,force:1});else points.delete(id);
    if(native){
      assert(!foreign,'native schedule uses browser-targeted geometry, not forced foreign DOM targets');
      const method=type==='pointerdown'?'touchStart':type==='pointermove'?'touchMove':type==='pointercancel'?'touchCancel':'touchEnd';
      if(method==='touchCancel')points.clear();
      await cdp.send('Input.dispatchTouchEvent',{type:method,touchPoints:method==='touchCancel'?[]:[...points.values()]});
    }else await page.evaluate(({type,id,x,y,foreign})=>{
      window.__g6SyntheticTargets??=new Map();
      const targets=window.__g6SyntheticTargets;
      const foreignTarget=foreign?document.getElementById('ginga-symbol'):null;
      if(foreign){
        const r=foreignTarget?.getBoundingClientRect();
        if(!foreignTarget?.isConnected||!r?.width||!r?.height||foreignTarget.closest('[inert],[aria-hidden="true"]'))throw new Error('The actual hero foreign-chrome button is not exposed');
        x=r.left+r.width/2;y=r.top+r.height/2;
        if(document.elementFromPoint(x,y)?.closest('#ginga-symbol')!==foreignTarget)throw new Error('The actual hero foreign-chrome button is not hit-owned');
      }
      if(type==='pointerdown')targets.set(id,foreign?foreignTarget:document.elementFromPoint(x,y));
      const target=targets.get(id)||(foreign?foreignTarget:document.elementFromPoint(x,y));
      if(!target)throw new Error('No real pointer target at fixture geometry');
      target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:id,isPrimary:id===701,clientX:x,clientY:y,buttons:['pointerup','pointercancel'].includes(type)?0:1}));
      if(['pointerup','pointercancel'].includes(type))targets.delete(id);
    },{type,id,x,y,foreign});
  };
  return {send,close:async()=>{if(cdp)await cdp.detach();},events:()=>page.evaluate(()=>window.__g6HandEvents),label:native?'Chromium native protocol multi-touch':'synthetic PointerEvents through actual installed sky handlers'};
}
async function g6Spread(hand,p){await hand.send('pointerdown',701,p.x-28,p.y);await hand.send('pointerdown',702,p.x+28,p.y);await hand.send('pointermove',701,p.x-64,p.y);await hand.send('pointermove',702,p.x+64,p.y);await hand.send('pointerup',701,p.x-64,p.y);await hand.send('pointerup',702,p.x+64,p.y);}
async function g6SkyGesture(page,{context,emit,kind,native}){
  await g6SkyHome(page);const point=await g6SkyPoint(page);assert(point,'actual unobstructed sky geometry for both fingers');
  const before=await g6SkyFacts(page),record=await readAppRecordSnapshot(page),hand=await g6Hand(page,context,native);
  try{
    if(kind==='spread')await g6Spread(hand,point);
    else{
      await hand.send('pointerdown',701,point.x-28,point.y);await hand.send('pointerdown',702,point.x+28,point.y);
      if(kind==='third')await hand.send('pointerdown',703,point.x,point.y+32);
      if(kind==='cancel')await hand.send('pointercancel',702,point.x+28,point.y);
      if(kind==='foreign')await hand.send('pointercancel',799,point.x,point.y,{foreign:true});
      if(kind==='contract'){
        await hand.send('pointermove',701,point.x-8,point.y);await hand.send('pointermove',702,point.x+8,point.y);
      }else if(!native||kind!=='cancel'){
        await hand.send('pointermove',701,point.x-64,point.y);if(kind!=='cancel')await hand.send('pointermove',702,point.x+64,point.y);
      }
      const during=await g6SkyFacts(page);
      const blocked=kind!=='foreign';
      emit('hand.gate','third/cancel/outermost contraction refuse; foreign cancel cannot cancel the owned pair',blocked?during.view==='drift'&&during.place?.path===before.place.path:during.view==='shelf',{kind,point,before,during,label:hand.label});
      if(!native||kind!=='cancel'){await hand.send('pointerup',701,point.x-64,point.y);if(kind!=='cancel')await hand.send('pointerup',702,point.x+64,point.y);if(kind==='third')await hand.send('pointerup',703,point.x,point.y+32);}
      if(blocked){await g6Spread(hand,point);}
    }
    await page.waitForFunction(()=>document.body.dataset.view==='shelf',null,{timeout:5000});
    const after=await g6SkyFacts(page),events=await hand.events(),afterRecord=await readAppRecordSnapshot(page);
    emit('hand.one-edge','one accepted fresh two-finger spread reaches shelf, never skips to article or opens a word',after.view==='shelf'&&!after.mini&&!after.sheet&&events.filter(e=>e.type==='pointerdown').length>=2&&(!native||events.every(e=>e.trusted)),{point,before,after,events,label:hand.label});
    emit('hand.no-record-write','sky scale gestures make no native learner-record revision or data change',record.revision===afterRecord.revision&&JSON.stringify(record.record)===JSON.stringify(afterRecord.record),{beforeRevision:record.revision,afterRevision:afterRecord.revision});
  }finally{await hand.close();}
}
async function g6PickSkyWord(page){
  const handle=await page.waitForFunction(()=>{
    const all=[...document.querySelectorAll('#drift-layer .word')];
    for(const n of all){const b=n.querySelector('.base')?.getBoundingClientRect();if(!b||b.left<115||b.right>innerWidth-115||b.top<150||b.bottom>innerHeight-170)continue;const x=b.left+b.width/2,y=b.top+b.height/2;if(document.elementFromPoint(x,y)?.closest('.word')===n&&Number(getComputedStyle(n).opacity)>.3)return n;}
    return null;
  },null,{timeout:5000});
  const node=handle.asElement();assert(node,'one actual visible, hit-owned sky word');return node;
}
async function g6AimSkyWord(page,word){
  const aim=await word.evaluate(node=>{const r=node.querySelector('.base')?.getBoundingClientRect();if(!r)return null;const x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,label:node.querySelector('.base').textContent,connected:node.isConnected,hit:document.elementFromPoint(x,y)?.closest('.word')===node};});
  assert(aim?.connected&&aim.hit,'the same printed sky word must own the real input point');return aim;
}
async function g6SkyStageGate(page,{context,emit,native}){
  await g6SkyHome(page);const word=await g6PickSkyWord(page);
  const tapAt=await g6AimSkyWord(page,word);await page.touchscreen.tap(tapAt.x,tapAt.y);await page.waitForFunction(n=>n.dataset.ladderRung==='reading'||!!document.getElementById('mini'),word,{timeout:10000});
  if(!await page.locator('#mini').count()){assert.equal(await word.getAttribute('data-ladder-rung'),'reading');const again=await g6AimSkyWord(page,word);await page.touchscreen.tap(again.x,again.y);}
  await page.locator('#mini .mini-word').waitFor();const mini=await slipFacts(page),before=await g6SkyFacts(page),record=await readAppRecordSnapshot(page);
  const witness=native?await g6NativeChromiumPinch(page,context,'#mini .mini-word'):await g6TwoPointerPolicy(page,'#mini .mini-word');
  const after=await g6SkyFacts(page),stage=await slipFacts(page),afterRecord=await readAppRecordSnapshot(page);
  emit('stage.blocks-sky','two pointers on actual hosted stage text retain native text policy and never enter sky scale navigation',witness.ok&&after.view==='drift'&&after.mini&&!after.sheet&&stage.word===mini.word,{before,after,mini,stage,witness});
  emit('stage.no-record-write','stage text hand does not save or grade',record.revision===afterRecord.revision&&JSON.stringify(record.record)===JSON.stringify(afterRecord.record),{beforeRevision:record.revision,afterRevision:afterRecord.revision});
}
// Hold only a real learner-record transaction which changes driftState. Native
// puts still occur; no reducer, storage read, public bridge or acknowledgment is mocked.
async function g6HoldDriftCommit(page){
  const snapshot=await readAppRecordSnapshot(page);
  await page.evaluate(({databaseName,baseline})=>{
    const original=IDBObjectStore.prototype.put,seen=new WeakSet();
    const probe=window.__g6CommitHold={fired:0,released:false,completed:false,aborted:false,puts:[],release:()=>{probe.released=true;},disarm:()=>{IDBObjectStore.prototype.put=original;}};
    IDBObjectStore.prototype.put=function(...args){
      const request=original.apply(this,args);
      if(this.transaction.db.name!==databaseName||this.name!=='kairo_replication_rows')return request;
      const row=args[0];probe.puts.push({kind:row?.kind,key:row?.key||null});
      if(row?.kind!=='document'||probe.fired)return request;
      const document=JSON.parse(row.text);if(document.collection!=='learner-record'||JSON.stringify(document.value.driftState)===baseline)return request;
      const tx=this.transaction;if(seen.has(tx))return request;seen.add(tx);probe.fired++;
      tx.addEventListener('complete',()=>{probe.completed=true;});tx.addEventListener('abort',()=>{probe.aborted=true;});
      const keep=()=>{if(probe.released)return;const r=tx.objectStore('kairo_replication_rows').get('g6-native-hold-absent-key');r.onsuccess=keep;};keep();
      return request;
    };
  },{databaseName:snapshot.installation.databaseName,baseline:JSON.stringify(snapshot.record.driftState)});
  return snapshot;
}
async function g6PendingGuard(page,{context,emit,kind}){
  // A fresh native sky cue is needed: no prior word lookup can retire it.
  await page.goto(`${host.origin}/index.html?entry=drift&ui=bi`);await page.waitForFunction(()=>document.body.dataset.ready==='1'&&window.__DRIFT__?.canNavigate()&&document.querySelector('#drift-layer')?.dataset.recordState==='active');
  let word=await g6PickSkyWord(page);
  if(kind==='grade'){
    const at=await g6AimSkyWord(page,word);await page.touchscreen.tap(at.x,at.y);await page.waitForFunction(()=>!document.querySelector('#drift-layer[data-record-cue-pending]'));
    await waitForAppRecord(page,r=>r.driftState?.store?.cue===1,{description:'native cue-retirement acknowledgment'});
    await page.keyboard.press('Escape');if(await page.locator('#mini').count())await page.keyboard.press('Escape');
    word=await g6PickSkyWord(page);
  }
  const before=await g6HoldDriftCommit(page);
  try{
    const gestureAt=await g6AimSkyWord(page,word);
    if(kind==='cue')await page.touchscreen.tap(gestureAt.x,gestureAt.y);
    else{await page.mouse.move(gestureAt.x,gestureAt.y);await page.mouse.down();await page.mouse.move(gestureAt.x+65,gestureAt.y,{steps:1});await page.mouse.move(gestureAt.x+105,gestureAt.y,{steps:1});await page.mouse.up();}
    await page.waitForFunction(kind=>window.__g6CommitHold.fired===1&&window.__DRIFT__.canNavigate()===false&&(kind==='cue'?document.querySelector('#drift-layer[data-record-cue-pending]'):document.querySelector('#drift-layer [data-record-pending][aria-busy="true"]')),kind,{timeout:10000});
    if(kind==='cue'){await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('mini')&&!document.querySelector('#drift-layer [data-ladder-rung="reading"]'));}
    // No DB read while the real write transaction is deliberately outstanding.
    const held=await g6SkyFacts(page),point=await g6SkyPoint(page);assert(point);
    assert(kind==='cue'||held.grades.some(text=>text.includes(gestureAt.label)),'pending grade names the exact hit-owned word');
    const hand=await g6Hand(page,context,false);try{await g6Spread(hand,point);}finally{await hand.close();}
    const out=page.locator(`${G6_RAIL} [data-scale-in]`);if(await out.count()&&await out.isEnabled())await out.tap();
    const after=await g6SkyFacts(page),hold=await page.evaluate(()=>({fired:window.__g6CommitHold.fired,completed:window.__g6CommitHold.completed,aborted:window.__g6CommitHold.aborted}));
    emit('pending.block','real pending cue/judgment blocks sky gesture and scale controls before native acknowledgment',!after.allowed&&after.view==='drift'&&after.sheet===held.sheet&&hold.fired===1&&!hold.completed&&!hold.aborted,{kind,held,after,hold});
    await page.evaluate(()=>window.__g6CommitHold.release());await page.waitForFunction(()=>window.__g6CommitHold.completed&&window.__DRIFT__.canNavigate());
    const durable=await readAppRecordSnapshot(page);
    const b=before.record.driftState?.store||{cue:0,lk:0,lu:0},a=durable.record.driftState.store;
    const changed=kind==='cue'?a.cue===1&&b.cue!==1&&a.lk===b.lk&&a.lu===b.lu&&durable.record.obslog.length===before.record.obslog.length:a.lk===b.lk+1&&a.lu===b.lu&&durable.record.obslog.filter(x=>x[1]==='drift').length===before.record.obslog.filter(x=>x[1]==='drift').length+1;
    emit('pending.commit','release commits the original native intent once and clears pending admission',changed&&durable.revision>before.revision&&await page.evaluate(()=>window.__g6CommitHold.fired===1&&!window.__g6CommitHold.aborted),{kind,before:before.record.driftState,after:durable.record.driftState,beforeRevision:before.revision,afterRevision:durable.revision});
    const freshPoint=await g6SkyPoint(page);assert(freshPoint);const freshHand=await g6Hand(page,context,false);try{await g6Spread(freshHand,freshPoint);}finally{await freshHand.close();}
    await page.waitForFunction(()=>document.body.dataset.view==='shelf',null,{timeout:5000});const resumed=await readAppRecordSnapshot(page);
    emit('pending.resume','fresh scale gesture works after acknowledgment without a second cue or grade',JSON.stringify(resumed.record.driftState)===JSON.stringify(durable.record.driftState),{kind,view:await page.locator('body').getAttribute('data-view'),durable:durable.record.driftState,resumed:resumed.record.driftState});
  }finally{await page.evaluate(()=>{window.__g6CommitHold?.release();window.__g6CommitHold?.disarm();});}
}
async function g6PanToKept(page,key){
  const observations=[];
  // World coordinates are read only to choose real drag direction. Every success
  // still requires the actual DOM point to be visible and hit-owned.
  for(let attempt=0;attempt<16;attempt++){
    const target=await page.evaluate(key=>{
      const n=[...document.querySelectorAll('#drift-layer .scale-star-kept')].find(n=>n.dataset.keptKey===key);if(!n)return null;
      const r=n.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
      const place=window.__DRIFT__.capturePlace();if(!place)return null;const c=place.camera,dx=(n.scaleX-c.x)*c.z,dy=(n.scaleY-c.y)*c.z,cs=Math.cos(c.rot),sn=Math.sin(c.rot);
      return {hidden:n.hidden,hit:n===hit||n.contains(hit),x,y,desired:{x:innerWidth/2+dx*cs-dy*sn,y:innerHeight/2+dx*sn+dy*cs},place};
    },key);assert(target,'kept identity remains published during native pan');observations.push(target);
    if(!target.hidden&&target.hit&&target.x>20&&target.x<370&&target.y>80&&target.y<744)return observations;
    const p=await g6SkyPoint(page);assert(p,'unobstructed real pan start');const dx=Math.max(-150,Math.min(150,195-target.desired.x)),dy=Math.max(-150,Math.min(150,410-target.desired.y));
    await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:15});await page.mouse.up();await delay(180);
  }
  assert.fail(`Kept point was not reachable by sixteen native drags: ${JSON.stringify(observations)}`);
}
async function g6KeptProjection(page,{emit}){
  const home=await g6OpenOrigin(page,'touch'),origin=page.locator(`#reader .tok[data-index="${home.origin.index}"]`);
  await stage(page,origin);await page.locator('#mini-take').tap();
  await waitForAppRecord(page,r=>r.taken.some(n=>n.t==='word'&&n.id===G6_ORIGIN.word));
  await page.locator('#vocabulary-list-new').tap();
  await page.locator('#vocabulary-list-name').fill('G6 projection');await page.locator('#vocabulary-list-create').tap();
  await waitForAppRecord(page,r=>r.lists['G6 projection']?.some(n=>n.t==='word'&&n.id===G6_ORIGIN.word));
  await page.keyboard.press('Escape');await leaveStage(page);
  const saved=await readAppRecordSnapshot(page),row=saved.record.taken.find(n=>n.t==='word'&&n.id===G6_ORIGIN.word);
  for(const [from,to]of [['article','shelf'],['shelf','sky']]){const result=await g6Move(page,{from,to,home,modality:'touch'});assert(result.ok);}
  await page.waitForFunction(id=>[...document.querySelectorAll('#drift-layer .scale-star-kept')].filter(n=>JSON.parse(n.dataset.keptKey)[0]===id).length===1,G6_ORIGIN.word,{timeout:10000});
  const points=await g6SkyFacts(page),own=points.stars.filter(n=>JSON.parse(n.key)[0]===G6_ORIGIN.word);assert.equal(own.length,1);
  const key=own[0].key,identityKey=JSON.parse(key),expectedSeq=row.entrySeq||null;
  emit('kept.identity','Review and list membership project one exact saved lexical identity',identityKey[0]===G6_ORIGIN.word&&identityKey[1]===(expectedSeq?'seq':'core')&&identityKey[2]===expectedSeq&&(!row.cueReading||identityKey[3]===row.cueReading),{row,point:own[0],identityKey});
  const before=await readAppRecordSnapshot(page),pan=await g6PanToKept(page,key);
  const target=page.locator('#drift-layer .scale-star-kept').filter({hasText:G6_ORIGIN.word});assert.equal(await target.count(),1);
  await target.tap();await pageSettled(page);const entry=await g6ScaleFacts(page),after=await readAppRecordSnapshot(page);
  emit('kept.native-door','native hit on the kept point opens its saved word and reading',entry.node===`word:${G6_ORIGIN.word}`&&entry.reading===G6_ORIGIN.reading&&await page.locator('#sheet .sense-list li').count()>0,{entry,key,pan});
  emit('kept.no-record-write','projection, native pan and point opening do not change the native learner record',before.revision===after.revision&&JSON.stringify(before.record)===JSON.stringify(after.record),{beforeRevision:before.revision,afterRevision:after.revision});
  await page.locator('#sheet-back').tap();await page.waitForFunction(()=>!document.getElementById('sheet'));
  for(const [from,to]of [['sky','shelf'],['shelf','article']]){const result=await g6Move(page,{from,to,home,modality:'touch'});assert(result.ok);}
  await stage(page,page.locator(`#reader .tok[data-index="${home.origin.index}"]`));await page.locator('#mini-take').tap();await page.locator('#mini-review').uncheck();
  await waitForAppRecord(page,r=>!r.taken.some(n=>n.t==='word'&&n.id===G6_ORIGIN.word));
  await page.keyboard.press('Escape');await leaveStage(page);
  for(const [from,to]of [['article','shelf'],['shelf','sky']]){const result=await g6Move(page,{from,to,home,modality:'touch'});assert(result.ok);}
  const listOnly=await g6SkyFacts(page),listRecord=await readAppRecordSnapshot(page);
  emit('kept.list-only','acknowledged Review removal retains the same point while list membership remains',listOnly.stars.filter(n=>n.key===key).length===1&&listRecord.revision>saved.revision&&listRecord.record.lists['G6 projection'].some(n=>n.id===G6_ORIGIN.word),{stars:listOnly.stars,savedRevision:saved.revision,listRevision:listRecord.revision});
  for(const [from,to]of [['sky','shelf'],['shelf','article']]){const result=await g6Move(page,{from,to,home,modality:'touch'});assert(result.ok);}
  await stage(page,page.locator(`#reader .tok[data-index="${home.origin.index}"]`));
  // The real Save re-saves and opens its menu. Remove Review again before
  // removing the remaining list membership; each change waits for native durability.
  await page.locator('#mini-take').tap();await waitForAppRecord(page,r=>r.taken.some(n=>n.t==='word'&&n.id===G6_ORIGIN.word));
  await page.locator('#mini-review').uncheck();await waitForAppRecord(page,r=>!r.taken.some(n=>n.t==='word'&&n.id===G6_ORIGIN.word));
  await page.locator('#vocabulary-list-popover input[data-list="G6 projection"]').uncheck();
  await waitForAppRecord(page,r=>!r.lists['G6 projection'].some(n=>n.t==='word'&&n.id===G6_ORIGIN.word));
  await page.keyboard.press('Escape');await leaveStage(page);
  for(const [from,to]of [['article','shelf'],['shelf','sky']]){const result=await g6Move(page,{from,to,home,modality:'touch'});assert(result.ok);}
  await page.waitForFunction(key=>![...document.querySelectorAll('#drift-layer .scale-star-kept')].some(n=>n.dataset.keptKey===key),key,{timeout:10000});
  const removed=await g6SkyFacts(page),removedRecord=await readAppRecordSnapshot(page);
  emit('kept.removed','new committed projection removes the old exact identity when final membership leaves',!removed.stars.some(n=>n.key===key)&&removedRecord.revision>listRecord.revision,{removed,listRevision:listRecord.revision,removedRevision:removedRecord.revision});
}

const G6_MUTANTS = Object.freeze([
  {id:'missing-reverse',target:'reverse.part-kanji',schedule:'reverse',edits:[{file:'corridor.js',key:'remove-part-reverse',
    from:"function scaleOut() {\n  const target = scaleOutTarget();",
    to:"function scaleOut() {\n  if (scaleName() === 'part') return false; // G6 control: inverse absent\n  const target = scaleOutTarget();"}],
    witness:r=>r.observed.before.scale==='part'&&r.observed.after.scale==='part'&&!r.observed.arrived},
  {id:'captured-text-pinch',target:'text.two-pointer',schedule:'pinch',edits:[{file:'corridor.js',key:'capture-text-pinch',
    from:'function scaleThread() {',
    to:`// G6 negative control: wrong document-wide two-touch cancellation.
const g6BadPointers = new Set();
document.addEventListener('pointerdown', e => { if(e.pointerType==='touch') g6BadPointers.add(e.pointerId); }, true);
for(const type of ['pointerup','pointercancel']) document.addEventListener(type,e=>g6BadPointers.delete(e.pointerId),true);
document.addEventListener('pointermove', e => {
 if(e.pointerType==='touch' && g6BadPointers.size===2 && !e.target.closest('#drift-layer')) {
  e.preventDefault(); window.__g6TextPinchFaultFired=(window.__g6TextPinchFaultFired||0)+1;
 }
}, {capture:true,passive:false});
function scaleThread() {`}],
    witness:r=>r.observed.events.some(e=>e.type==='pointermove'&&e.defaultPrevented)},
  {id:'lost-return-line',target:'return.line',schedule:'line',edits:[
    {file:'corridor.js',key:'displace-return-target',from:'const delta = anchor.getBoundingClientRect().top - visit.viewportY;',to:'const delta = anchor.getBoundingClientRect().top - (visit.viewportY + 80);'},
    {file:'corridor.js',key:'displace-stability-target',from:'const remaining = anchor.getBoundingClientRect().top - visit.viewportY;',to:'const remaining = anchor.getBoundingClientRect().top - (visit.viewportY + 80);'},
    {file:'corridor.js',key:'displace-post-focus-target',from:'const afterFocus = anchor.getBoundingClientRect().top - visit.viewportY;',to:'const afterFocus = anchor.getBoundingClientRect().top - (visit.viewportY + 80);'},
  ],witness:r=>r.observed.delta>4&&g6SameToken(r.observed.origin,r.observed.current)&&r.observed.current.connected},
]);
function g6WalkIds(itinerary,timing){
  const ids=[];
  for(let i=1;i<itinerary.length;i++){
    const id=`edge-${i}.${itinerary[i-1]}-${itinerary[i]}`;ids.push(id);
    if(timing)ids.push(`${id}.frames`);
    if(itinerary[i]==='article')ids.push(`${id}.line`);
  }
  return [...ids,'no-record-work'];
}
function g6ControlIds(schedule){
  if(schedule==='pinch')return ['text.two-pointer'];
  if(schedule==='reverse')return ['setup.article-sentence','setup.sentence-word','setup.word-kanji','setup.kanji-part','reverse.part-kanji'];
  return ['setup.article-shelf','setup.shelf-sky','setup.sky-shelf','setup.shelf-article','return.line'];
}
async function g6ControlSchedule(page,{modality,schedule,emit}){
  const home=await g6OpenOrigin(page,modality);
  if(schedule==='pinch'){
    const result=await g6TwoPointerPolicy(page,`#reader .tok[data-index="${G6_ORIGIN.index}"]`);
    emit('text.two-pointer','two pointers on prose remain uncanceled and do not navigate',result.ok,result.observed);return;
  }
  const itinerary=schedule==='reverse'?['article','sentence','word','kanji','part']:['article','shelf','sky','shelf','article'];
  for(let i=1;i<itinerary.length;i++){
    const from=itinerary[i-1],to=itinerary[i],row=await g6Move(page,{from,to,modality,home});
    emit(`setup.${from}-${to}`,'real unmodified prerequisite edge',row.ok,row.observed);
    assert(row.ok,`control setup must reach ${to}`);
  }
  if(schedule==='reverse'){
    const row=await g6Move(page,{from:'part',to:'kanji',modality,home});
    emit('reverse.part-kanji','part retains its actual kanji inverse',row.ok,row.observed);
  }else{
    const row=await g6Line(page,home);emit('return.line','same source occurrence returns within4px',row.ok,row.observed);
  }
}
async function runG6Suite(browser){
  const results=[];
  const run=async(name,ids,body,{control=null,publish=true,init=null}={})=>{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block'});
    await context.addInitScript(()=>{localStorage.setItem('kairo-word-ladder-demo-v1','1');window.__g6DocumentStamp=crypto.randomUUID();});
    if(init)await context.addInitScript(init);
    await silenceBrowserAudio(context);
    await context.route('**/*',route=>new URL(route.request().url()).origin===host.origin?route.continue():route.abort());
    if(control)await serveMutation(context,{origin:host.origin,manifest:new Map(identity.files.map(f=>[f.path,f.sha256])),control,edits:control.edits});
    const page=await context.newPage(),localRows=[],pageErrors=[],consoleErrors=[];
    page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(30000);
    page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
    const result={name,engine,startedAt:new Date().toISOString(),rows:localRows,pageErrors,consoleErrors,control};
    const emit=(id,title,ok,observed)=>{assert(!localRows.some(r=>r.id===id),`duplicate G6 row ${id}`);localRows.push({id,title,ok:!!ok,observed});};
    try{await body(page,{context,emit});}
    catch(error){result.error=String(error.stack||error);}
    finally{
      if(result.error||localRows.some(r=>!r.ok)||ids.some(id=>!localRows.some(r=>r.id===id))){
        const diagnosticPath=resolve(evidence,`${engine}-G6-${name.replace(/[^a-z0-9.-]/giu,'_')}-failure.png`);
        try{result.failureState=await g6ScaleFacts(page);await page.screenshot({path:diagnosticPath});result.failureScreenshot=diagnosticPath;}
        catch(error){result.diagnosticError=String(error.stack||error);}
      }
      for(const id of ids)if(!localRows.some(r=>r.id===id))emit(id,'required assertion was not executed',false,{unexecuted:true,harnessError:result.error||'schedule stopped'});
      emit('errors','no page or console errors',!pageErrors.length&&!consoleErrors.length&&!result.diagnosticError,{pageErrors,consoleErrors,diagnosticError:result.diagnosticError||null});
      emit('schedule','exact declared assertion set completed without harness error',!result.error&&localRows.length===ids.length+1&&ids.every(id=>localRows.some(r=>r.id===id&&!r.observed?.unexecuted)),{expected:ids,actual:localRows.map(r=>r.id),error:result.error||null});
      result.endedAt=new Date().toISOString();
      if(control){control.error=result.error;control.pageErrors=pageErrors;control.consoleErrors=consoleErrors;}
      if(publish)for(const row of localRows)check(`G6.${name}.${row.id}`,row.title,row.ok,row.observed);
      const resultPath=resolve(evidence,`${engine}-G6-${name.replace(/[^a-z0-9.-]/giu,'_')}.json`);
      try{writeFileSync(resultPath,JSON.stringify({site,gitSha:identity.gitSha,artifactSha256:identity.artifactSha256,verifierSha256,browserVersion:browserVersions[engine],node:process.version,result},null,2));}
      finally{await context.close();}
      results.push(result);
    }
    return result;
  };
  if(!g6ControlsOnly){
    for(const modality of ['touch','keyboard']){
      await run(`${modality}.edges`,g6WalkIds(G6_EDGES,true),(page,{emit})=>g6Walk(page,{modality,itinerary:G6_EDGES,emit,timing:true}));
      if(g6FramesOnly)continue;
      await run(`${modality}.forty`,g6WalkIds(G6_FORTY,false),(page,{emit})=>g6Walk(page,{modality,itinerary:G6_FORTY,emit}));
    }
    if(!g6FramesOnly){
      for(const modality of ['touch','keyboard']){
        await run(`${modality}.thread`,['bead.word','bead.kanji','bead.sentence','bead.article','bead.article.line','bead.shelf','bead.shelf.line','no-record-work'],(page,{emit})=>g6ThreadAncestors(page,{modality,emit}));
        await run(`${modality}.recursion`,['recursive.order','recursive.ancestor','recursive.no-record-work'],(page,{emit})=>g6RecursiveThread(page,{modality,emit}));
        await run(`${modality}.replacement-source`,['source.replaced'],(page,{emit})=>g6ReplacementSource(page,{modality,emit}));
        for(const kind of ['navigate',engine==='webkit'?'key':'wheel']){
          const control={engine,id:`G6.${modality}.abandoned-${kind}`,edits:G6_RETURN_FRAME_FIXTURE.edits,served:[]};
          await run(`${modality}.abandoned-${kind}`,[`abandoned.${kind}`],(page,{emit})=>g6AbandonedReturn(page,{modality,emit,kind}),{control,init:g6InstallReturnFrameFixture});
        }
      }
      for(const native of engine==='chromium'?[false,true]:[false]){
        for(const kind of native?['spread','third','cancel','contract']:['spread','third','cancel','foreign','contract']){
          await run(`sky.${native?'native':'handlers'}.${kind}`,[...(kind==='spread'?[]:['hand.gate']),'hand.one-edge','hand.no-record-write'],(page,{context,emit})=>g6SkyGesture(page,{context,emit,kind,native}));
        }
        await run(`sky.${native?'native':'handlers'}.stage`,['stage.blocks-sky','stage.no-record-write'],(page,{context,emit})=>g6SkyStageGate(page,{context,emit,native}));
      }
      for(const kind of ['cue','grade'])await run(`sky.pending-${kind}`,['pending.block','pending.commit','pending.resume'],(page,{context,emit})=>g6PendingGuard(page,{context,emit,kind}));
      await run('sky.kept-projection',['kept.identity','kept.native-door','kept.no-record-write','kept.list-only','kept.removed'],(page,{emit})=>g6KeptProjection(page,{emit}));
      const ids=['reader.synthetic','word.synthetic','sentence.synthetic','stage.synthetic'];
      await run('text-policy',ids,async(page,{context,emit})=>{
        const home=await g6OpenOrigin(page,'touch');
        let row=await g6TwoPointerPolicy(page,`#reader .tok[data-index="${G6_ORIGIN.index}"]`);emit('reader.synthetic','reader two-pointer policy',row.ok,row.observed);
        let moved=await g6Move(page,{from:'article',to:'sentence',modality:'touch',home});assert(moved.ok);
        row=await g6TwoPointerPolicy(page,'#sheet .sent-reader');emit('sentence.synthetic','sentence two-pointer policy',row.ok,row.observed);
        moved=await g6Move(page,{from:'sentence',to:'word',modality:'touch',home});assert(moved.ok);
        row=await g6TwoPointerPolicy(page,'#sheet .headword');emit('word.synthetic','entry text two-pointer policy',row.ok,row.observed);
        // Return structurally to article before opening the existing shared stage.
        moved=await g6Move(page,{from:'word',to:'sentence',modality:'touch',home});assert(moved.ok);
        moved=await g6Move(page,{from:'sentence',to:'article',modality:'touch',home});assert(moved.ok);
        await stage(page,page.locator(`#reader .tok[data-index="${G6_ORIGIN.index}"]`));
        row=await g6TwoPointerPolicy(page,'#mini .mini-word');emit('stage.synthetic','shared stage text two-pointer policy',row.ok,row.observed);
      });
      if(engine==='chromium')await run('native-text-pinch',['reader.native-chromium'],async(page,{context,emit})=>{
        await g6OpenOrigin(page,'touch');
        const row=await g6NativeChromiumPinch(page,context,`#reader .tok[data-index="${G6_ORIGIN.index}"]`);
        emit('reader.native-chromium','native two-pointer reader route preserves text default',row.ok,row.observed);
      });
      await run('deck-text-policy',['front.policy','front.sealed','back.policy'],async(page,{emit})=>{
        await page.goto(`${host.origin}/index.html?deck=mcd&ui=bi`);
        await page.waitForFunction(()=>document.body.dataset.ready==='1',null,{timeout:30000});
        await page.locator('#kp-start').tap();await page.locator('#kp-card .kp-sentence').waitFor();
        const front=await page.locator('#kp-card').evaluate(n=>({card:n.dataset.card,reveal:!!document.getElementById('kp-reveal'),doors:n.querySelectorAll('.kp-tok,[data-deck-word],rt').length}));
        assert(front.card&&front.reveal&&front.doors===0,'actual unanswered sealed-front fixture');
        let row=await g6TwoPointerPolicy(page,'#kp-card .kp-sentence');emit('front.policy','sealed deck text retains two-pointer default',row.ok,row.observed);
        const after=await page.locator('#kp-card').evaluate(n=>({card:n.dataset.card,reveal:!!document.getElementById('kp-reveal'),doors:n.querySelectorAll('.kp-tok,[data-deck-word],rt').length}));
        emit('front.sealed','two pointers neither reveal nor create a front lookup door',JSON.stringify(front)===JSON.stringify(after),{front,after});
        await page.locator('#kp-reveal').tap();await page.waitForFunction(()=>!document.getElementById('kp-reveal'));
        row=await g6TwoPointerPolicy(page,'#kp-card .kp-sentence');emit('back.policy','revealed deck text retains two-pointer default',row.ok,row.observed);
      });
    }
  }
  if((withControls||g6ControlsOnly)&&!g6FramesOnly){
    for(const modality of ['touch','keyboard'])for(const spec of G6_MUTANTS){
      const ids=g6ControlIds(spec.schedule),body=(page,{emit})=>g6ControlSchedule(page,{modality,schedule:spec.schedule,emit});
      const baseline=await run(`${modality}.control-${spec.id}.positive`,ids,body,{publish:false});
      const control={engine,id:`G6.${modality}.${spec.id}`,edits:spec.edits,served:[],pageErrors:[]};
      const mutant=await run(`${modality}.control-${spec.id}.mutant`,ids,body,{control,publish:false});
      const restore=await run(`${modality}.control-${spec.id}.restore`,ids,body,{publish:false});
      const clean=baseline.rows.every(r=>r.ok),restored=restore.rows.every(r=>r.ok);
      const equal=JSON.stringify(mutant.rows.map(r=>r.id))===JSON.stringify(baseline.rows.map(r=>r.id))&&JSON.stringify(restore.rows.map(r=>r.id))===JSON.stringify(baseline.rows.map(r=>r.id));
      const target=mutant.rows.find(r=>r.id===spec.target);
      const served=spec.edits.every(edit=>control.served.some(s=>s.file===edit.file&&s.applied.some(a=>a.key===edit.key)));
      const complete=equal&&!mutant.error&&!control.setupError&&!mutant.pageErrors.length&&!mutant.consoleErrors.length&&served&&mutant.rows.every(r=>!r.observed?.unexecuted);
      const killed=clean&&complete&&target&&!target.ok&&spec.witness(target)&&mutant.rows.every(r=>r.id===spec.target||r.ok);
      control.verdict=!clean||!complete?'incomplete':killed?'killed':target?.ok?'survived':'contaminated';
      control.baseline=baseline.rows;control.rows=mutant.rows;control.restore=restore.rows;controls.push(control);
      check(`G6.${modality}.negative.${spec.id}`,'positive executes, exact fault fails its named assertion, and restore executes',killed&&restored,{verdict:control.verdict,clean,complete,restored,target,served,setupError:control.setupError||null});
    }
  }
  writeFileSync(resolve(evidence,`g6-${engine}.json`),JSON.stringify({site,gitSha:identity.gitSha,artifactSha256:identity.artifactSha256,verifierSha256,browserVersion:browserVersions[engine],node:process.version,
    scope:g6FramesOnly?'G6 twelve directed edges × touch/keyboard plus per-edge frames only':g6ControlsOnly?'G6 three named controls × touch/keyboard with positives/restores only':'G6 directed edges, forty-step walks, exact thread ancestry, return lifecycle, sky actual-handler/native Chromium gestures, native pending records and kept membership projection; controls only when requested',
    limitations:['WebKit two-pointer witness uses synthetic PointerEvents, not native iPhone zoom','Abandoned-return cases use one explicitly hashed served-byte scheduling seam; not untouched-candidate proof','Kept projection browser cases cover native membership revisions and retained saved identity; separate lifted-function tests cover conflicting seq/reading identities','Private sky dive routes remain covered by canonical Drift verifiers; these G6 gestures exercise surface scale admission'],results},null,2));
}


try {
  for (engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    browserVersions[engine] = browser.version();
    console.log(`${engine} ${browserVersions[engine]}`);
    if (!g3Only) await runG6Suite(browser);
    const walk = async (name, body, { viewport = { width: 390, height: 844 }, mobile = true, control = null, init = null, demo = false } = {}) => {
      if (g6Only && !name.startsWith('G6')) return;
      if (g3Only && !name.startsWith('G3')) return;
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

    if (withControls && !g6Only) {
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
        const expectedThread = [`word:${WORD}`, `word:${slip.word}`];
        const ancestor = page.locator('#sheet > .scale-thread button[data-stack-index="0"]');
        const keyboardReach = await g6TabReach(page, ancestor);
        check(`P4.${way}.depth2`, 'its band opens depth 2: Back and two exact ordered thread occurrences, ancestor keyboard-reachable',
          two?.back === 'Back' && coversViewport(two) && g6ExactPageThread(two, expectedThread) && keyboardReach.found, { ...two, expectedThread, keyboardReach });
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
          const expectedNodes = [`word:${WORD}`];
          const firstDepth = await pageFacts(page);
          const depths = [{ ...firstDepth, expectedNodes:[...expectedNodes], threadExact:g6ExactPageThread(firstDepth,expectedNodes), level:1 }];
          const depthOf = () => page.locator('#sheet > .scale-thread [data-stack-index][data-node]').count();
          for (let depth = 2; depth <= 4; depth++) {
            // One exact live door and one G3 ladder. Preserve actual node ancestry;
            // no crumb substring, blind tap loop, or swallowed wait is used.
            const doors=page.locator('#sheet .entry-row[data-kanjirow], #sheet .japanese-lookup-word, #sheet .example .sentence-tok');
            assert(await doors.count()>0,`a real native door exists at depth ${depth-1}`);
            const door=doors.first();await door.scrollIntoViewIfNeeded();
            const kanji=await door.getAttribute('data-kanjirow');let expectedNode;
            if(kanji){expectedNode=`kanji:${kanji}`;await door.tap();}
            else{await stage(page,door);const nested=await slipFacts(page);assert(nested.word);expectedNode=`word:${nested.word}`;await page.locator('#mini .mini-word').tap();}
            expectedNodes.push(expectedNode);
            await page.waitForFunction(count=>document.querySelectorAll('#sheet > .scale-thread [data-stack-index][data-node]').length===count,depth,{timeout:5000});
            const ancestor=page.locator('#sheet > .scale-thread button[data-stack-index="0"]');
            const keyboardReach=await g6TabReach(page,ancestor);
            await pageSettled(page);
            await page.locator('#sheet').evaluate((sheet) => { sheet.scrollTop = sheet.scrollHeight; });
            await delay(300);
            const levelFacts=await pageFacts(page);
            depths.push({ ...levelFacts, level:await depthOf(), expectedNodes:[...expectedNodes], threadExact:g6ExactPageThread(levelFacts,expectedNodes), keyboardReach });
            await page.screenshot({ path: resolve(evidence, `${engine}-P8-sumi-depth${depth}.png`) });
          }
          check('P8.sumi-depths', '墨: the page stays opaque, scrim-free and whole-screen at depths 1–4 (scrolled to its foot)',
            depths.length === 4 && depths.every((facts, i) => facts && facts.alpha === 1 && facts.scrim === 0 && coversViewport(facts) && facts.level === i + 1 && facts.threadExact && (i === 0 || facts.keyboardReach.found)),
            depths.map((facts) => facts && { node:facts.node,alpha:facts.alpha,scrim:facts.scrim,thread:facts.thread,expectedNodes:facts.expectedNodes,threadExact:facts.threadExact,keyboardReach:facts.keyboardReach,level:facts.level }));
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

writeFileSync(resolve(evidence, 'verify-word-grammar.json'), JSON.stringify({ site, gitSha: identity.gitSha, artifactSha256: identity.artifactSha256, verifierSha256, browserVersions, scope: g6FramesOnly ? 'G6 twelve directed edges and frames only; draft scope limits in g6-<engine>.json' : g6ControlsOnly ? 'G6 controls with positives and restores only' : g6Only ? 'G6 core schedule only; no G1/G3 claim; draft scope limits in g6-<engine>.json' : skyReadingsOnly ? 'G3 actual sky glyph and reader particle across all dials; canonical host getter; hosted sky particle rendering unproven because its legacy scene is unreachable; no G1 or frame gates' : controlsOnly ? 'G3 negative controls only; exact candidate schedules, mutants and restores; no G1 or frame gates' : roomsOnly ? 'G3 Words, sky words/glyphs, and reader particle; fixed activation counts; no G1 or frame gates' : sentencesOnly ? 'G3 sentence/example rendered ruby, all three dials, and sealed front; no G1 or frame gates' : kanaOnly ? 'G3 identical kana, particle bar Save, and meaningful particle dials; no G1 or frame gates' : g3Only ? 'G3 only; G1 gates not run' : 'G1, G3 and G6 core (G6 scope limits in per-engine receipt)', rows, frames, controls }, null, 1));
const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} — evidence ${evidence}`);
process.exit(failed.length ? 1 : 0);
