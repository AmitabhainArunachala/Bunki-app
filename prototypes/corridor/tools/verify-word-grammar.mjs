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
 * G3 sky ownership: an active constellation glyph owns its printed ink above a later free word (言 / 誇り), and the transparent
 *   caption width beside it stays the free word's, annotated or not (筆 of 鉛筆, plus fixture-only 嘩/眩/貰 mounted by the
 *   actual missing-host-data branch). Geometry is explicitly controlled; this is not a natural scene/touch journey.
 *   --sky-ownership-only runs only that walk. --controls adds its three strict mutations and clean restores.
 * G3 negative controls: --controls replays stalled tap2, uncleared ruby, a front door, and the sky glyph's z-index, hit region
 *   and caption width removed; harness failures are incomplete.
 * --controls-only runs only the four candidate schedules, mutants and restores, with no frame measurements.
 * --g3-only is an explicit narrow slice, never a claim that the retained G1 gates passed.
 * Negative controls (one-hand/G1/neg-control): the 91dvh cap back → P1 red; the scrim re-appended → P1 red; the word not
 * sent travelling (enterWord) → P2 red; the page fading in over the reader instead of arriving whole → P14 red. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';
import { readAppRecord, readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';
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
const frames = [], browserVersions = {}, controls = [], fixtures = [];
const controlsOnly = process.argv.includes('--controls-only');
const roomsOnly = process.argv.includes('--rooms-only');
const sentencesOnly = process.argv.includes('--sentences-only');
const kanaOnly = process.argv.includes('--kana-only');
const skyReadingsOnly = process.argv.includes('--sky-readings-only');
const skyOwnershipOnly = process.argv.includes('--sky-ownership-only');
assert([controlsOnly, roomsOnly, sentencesOnly, kanaOnly, skyReadingsOnly, skyOwnershipOnly].filter(Boolean).length <= 1, 'Choose one explicit narrow schedule');
const g3Only = controlsOnly || roomsOnly || sentencesOnly || kanaOnly || skyReadingsOnly || skyOwnershipOnly || process.argv.includes('--g3-only');
const withControls = controlsOnly || process.argv.includes('--controls');
const g6ThreadCurrentOnly=process.argv.includes('--g6-thread-current-only');
const g6FramesOnly=process.argv.includes('--g6-frames-only');
const g6ControlsOnly=process.argv.includes('--g6-controls-only');
const g6Only=g6ThreadCurrentOnly||g6FramesOnly||g6ControlsOnly||process.argv.includes('--g6-only');
assert(!(g6ThreadCurrentOnly&&(g6FramesOnly||g6ControlsOnly||withControls)),'Current-thread narrow schedule is distinct');
assert(!(g6FramesOnly&&g6ControlsOnly),'Choose one G6 narrow schedule');
assert(!(g6Only&&g3Only),'G6 and G3 narrow schedules are distinct');

// Lead0235 names glyphs absent from the shipped sky and hosted kanji corpus. Supply only fixture word/caption DATA in
// the served response: real __lockWord → constellationLock → spawnGlyph → mountHostedNodeReading still runs. Do not
// invent production dictionary entries, alter the host's has/reading gate, or remove ruby to simulate these three cases.
const SKY_OWNERSHIP_NAMED = Object.freeze([
  { word: '喧嘩', glyph: '嘩' }, { word: '眩しい', glyph: '眩' }, { word: '貰う', glyph: '貰' },
]);
const SKY_FIXTURE_CAPTION = 'FIXTURE ONLY caption';
const skyFixtureAnchor = '// the semantic tier: LLM-authored typed relations (pilot slice)';
const skyFixtureRows = SKY_OWNERSHIP_NAMED.map(({ word }) => [word, '', 'fixture-only source', 'k', '', 3]);
const skyFixtureCaptions = Object.fromEntries(SKY_OWNERSHIP_NAMED.map(({ glyph }) => [glyph, SKY_FIXTURE_CAPTION]));
const skyFixtureEdit = Object.freeze({ file: 'drift-layer.js', key: 'fixture-only-named-glyph-data', from: skyFixtureAnchor,
  to: `/* Verification-only corpus/caption data, never shipped dictionary authority. */
if (${JSON.stringify(skyFixtureRows)}.some(row => WALL.some(entry => entry[0] === row[0])) ||
    ${JSON.stringify(SKY_OWNERSHIP_NAMED.map(({ glyph }) => glyph))}.some(glyph => glossOf(glyph)))
  throw new Error("named glyph fixture no longer matches the absent production corpus");
WALL.push(...${JSON.stringify(skyFixtureRows)});
Object.assign(K, ${JSON.stringify(skyFixtureCaptions)});
${skyFixtureAnchor}` });

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
  assert(await locator.evaluateAll(nodes=>nodes.length===1&&document.activeElement===nodes[0]),'native keyboard focus reaches actual control');
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
function g6SyntheticInputIntegrity(observed){
  const pointer=observed?.events||[],touch=observed?.touch||{},events=touch.events||[];
  const pointerSequence=pointer.map(e=>[e.type,e.id]);
  const touchSequence=events.map(e=>[e.type,e.count,e.changedCount]);
  const pointerComplete=JSON.stringify(pointerSequence)===JSON.stringify([['pointerdown',601],['pointerdown',602],['pointermove',601],['pointermove',602],['pointercancel',601],['pointercancel',602]])&&
    pointer.every(e=>e.cancelable&&e.afterDispatch&&e.connected&&e.accepted===!e.defaultPrevented);
  const touchComplete=JSON.stringify(touchSequence)===JSON.stringify([['touchstart',1,1],['touchstart',2,1],['touchmove',2,2],['touchmove',2,2],['touchcancel',0,2]])&&
    events.every(e=>e.cancelable&&e.afterDispatch&&e.connected&&e.accepted===!e.defaultPrevented);
  const continuity=!!observed?.before&&[observed.pointerAfter,observed.after].every(after=>after&&['stamp','scale','node','miniCount'].every(key=>after[key]===observed.before[key]));
  return {ok:touch.error==null&&pointerComplete&&touchComplete&&continuity,pointerComplete,touchComplete,continuity,error:touch.error??null,pointerSequence,touchSequence};
}
function g6NativeInputIntegrity(observed){
  const events=observed?.events||[],inventory=observed?.inventory||{},commands=observed?.commands||[];
  const commandSequence=commands.map(command=>command.type);
  const commandsComplete=JSON.stringify(commandSequence)===JSON.stringify(['touchStart','touchMove','touchMove','touchMove','touchMove','touchEnd'])&&commands.every(command=>command.completed);
  const downs=events.filter(e=>e.family==='pointer'&&e.type==='pointerdown');
  const terminals=events.filter(e=>e.family==='pointer'&&['pointerup','pointercancel'].includes(e.type));
  const terminalComplete=downs.length>=2&&new Set(downs.map(e=>e.pointerId)).size>=2&&downs.every(down=>terminals.some(end=>end.pointerId===down.pointerId&&end.timeStamp>=down.timeStamp))&&
    events.some(e=>e.family==='touch'&&['touchend','touchcancel'].includes(e.type)&&e.count===0)&&inventory.remaining===0;
  const continuity=events.length>0&&events.every(e=>e.trusted&&e.afterDispatch&&e.connected&&e.stamp===observed.before?.stamp)&&observed.before?.stamp===observed.after?.stamp;
  const moves=inventory.pointerMoves>0&&inventory.touchMoves>0;
  const sameContext=!!observed?.before&&!!observed?.after&&['scale','node','miniCount'].every(key=>observed.before[key]===observed.after[key]);
  return {ok:observed?.inputError===null&&commandsComplete&&terminalComplete&&continuity&&moves&&sameContext,inputError:observed?.inputError??null,commandsComplete,terminalComplete,continuity,moves,sameContext,commandSequence};
}
async function g6TwoPointerPolicy(page,selector){
  const target=page.locator(selector).first();await target.waitFor();
  const before=await g6ScaleFacts(page);
  const witness=await target.evaluate(node=>{
    const r=node.getBoundingClientRect(),events=[],ancestors=[];
    for(let n=node;n;n=n.parentElement)ancestors.push({tag:n.tagName,id:n.id,action:getComputedStyle(n).touchAction});
    const fire=(type,id,x,y,primary)=>{const event=new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:primary,clientX:x,clientY:y,buttons:type==='pointercancel'?0:1});const accepted=node.dispatchEvent(event);events.push({type,id,defaultPrevented:event.defaultPrevented,isTrusted:event.isTrusted,cancelable:event.cancelable,accepted,afterDispatch:event.eventPhase===Event.NONE,connected:node.isConnected});};
    const x=r.left+r.width/2,y=r.top+r.height/2;
    fire('pointerdown',601,x-12,y,true);fire('pointerdown',602,x+12,y,false);
    fire('pointermove',601,x-24,y,true);fire('pointermove',602,x+24,y,false);
    fire('pointercancel',601,x-24,y,true);fire('pointercancel',602,x+24,y,false);
    return {events,ancestors,viewport:document.querySelector('meta[name="viewport"]')?.content||'',label:'synthetic two-pointer actual-handler cancellation witness; not native pinch zoom'};
  });
  await delay(250);const pointerAfter=await g6ScaleFacts(page);
  const touch=await target.evaluate(node=>{
    if(typeof window.TouchEvent!=='function')return {error:'TouchEvent unavailable: coverage incomplete, never a pass or skip'};
    if(!node.isConnected)return {error:'source detached before the synthetic touch stream'};
    const box=node.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
    const legacy=typeof document.createTouch==='function'&&typeof document.createTouchList==='function';
    if(!legacy&&typeof window.Touch!=='function')return {error:'Touch construction unavailable: coverage incomplete, never a pass or skip'};
    const touch=(identifier,clientX)=>legacy?document.createTouch(window,node,identifier,clientX+scrollX,y+scrollY,clientX,y):
      new window.Touch({identifier,target:node,clientX,clientY:y,pageX:clientX+scrollX,pageY:y+scrollY,screenX:clientX,screenY:y,radiusX:4,radiusY:4,force:1});
    const list=touches=>legacy?document.createTouchList(...touches):touches;
    const events=[];
    const fire=(type,touches,changed)=>{
      const event=new window.TouchEvent(type,{bubbles:true,cancelable:true,composed:true,touches:list(touches),targetTouches:list(touches),changedTouches:list(changed)});
      const accepted=node.dispatchEvent(event);
      events.push({type,count:event.touches.length,changedCount:event.changedTouches.length,cancelable:event.cancelable,isTrusted:event.isTrusted,
        defaultPrevented:event.defaultPrevented,accepted,afterDispatch:event.eventPhase===Event.NONE,connected:node.isConnected});
    };
    try{
      let pair=[touch(601,x-12),touch(602,x+12)];
      fire('touchstart',[pair[0]],[pair[0]]);fire('touchstart',pair,[pair[1]]);
      for(const radius of [24,36]){pair=[touch(601,x-radius),touch(602,x+radius)];fire('touchmove',pair,pair);}
      fire('touchcancel',[],pair);
    }catch(error){return {error:String(error),events};}
    return {events,construction:legacy?'document.createTouch/createTouchList':'Touch constructor',label:'synthetic TouchEvents through actual handlers; not native WebKit or iPhone zoom'};
  });
  await delay(250);const after=await g6ScaleFacts(page);
  const policy=witness.ancestors.every(({action})=>action!=='none'&&(!/pan-[xy]/u.test(action)||action.includes('pinch-zoom')))&&
    !/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(?:\D|$)/iu.test(witness.viewport);
  const touchSequence=JSON.stringify((touch.events||[]).map(e=>[e.type,e.count,e.changedCount]));
  const touchOk=!touch.error&&touchSequence===JSON.stringify([['touchstart',1,1],['touchstart',2,1],['touchmove',2,2],['touchmove',2,2],['touchcancel',0,2]])&&
    touch.events.every(e=>e.cancelable&&e.afterDispatch&&e.connected&&e.accepted===!e.defaultPrevented&&!e.defaultPrevented);
  const inputIntegrity=g6SyntheticInputIntegrity({before,pointerAfter,after,...witness,touch});
  const same=facts=>facts.scale===before.scale&&facts.node===before.node&&facts.miniCount===before.miniCount;
  return {ok:inputIntegrity.ok&&policy&&witness.events.filter(e=>e.type==='pointermove').length===2&&witness.events.every(e=>!e.defaultPrevented)&&touchOk&&
    same(pointerAfter)&&same(after),
    observed:{before,pointerAfter,after,...witness,touch,touchOk,inputIntegrity}};
}
async function g6NativeChromiumPinch(page,context,selector){
  const target=page.locator(selector).first();await target.scrollIntoViewIfNeeded();const box=await target.boundingBox();assert(box);
  const before=await g6ScaleFacts(page),cdp=await context.newCDPSession(page);
  await page.evaluate(()=>{
    if(window.__g6PostDispatch)throw new Error('stale G6 post-dispatch witness');
    const raw=[],pointers=new Set(),types=['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','touchcancel'];
    const capture=event=>{
      const pointer=event.type.startsWith('pointer');
      if(pointer&&event.pointerType!=='touch')return;
      if(event.type==='pointerdown')pointers.add(event.pointerId);
      raw.push({event,captured:{type:event.type,family:pointer?'pointer':'touch',count:pointer?pointers.size:event.touches.length,
        pointerId:pointer?event.pointerId:null,trusted:event.isTrusted,cancelable:event.cancelable,timeStamp:event.timeStamp,stamp:window.__g6DocumentStamp,
        target:event.target?.id||String(event.target?.className||event.target?.nodeName||'')}});
      if(event.type==='pointerup'||event.type==='pointercancel')pointers.delete(event.pointerId);
    };
    for(const type of types)window.addEventListener(type,capture,{capture:true,passive:true});
    window.__g6PostDispatch={raw,pointers,stop:()=>{for(const type of types)window.removeEventListener(type,capture,true);}};
  });
  const commands=[];
  const send=async(type,rad)=>{const command={type,rad:rad??null,completed:false};commands.push(command);await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[-1,1].map((sign,id)=>({id,x:box.x+box.width/2+sign*rad,y:box.y+box.height/2,radiusX:4,radiusY:4,force:1}))});command.completed=true;};
  let inputError=null;
  try{await send('touchStart',12);for(const rad of [16,20,24,28]){await delay(40);await send('touchMove',rad);}await send('touchEnd');}
  catch(error){inputError=String(error.stack||error);}
  finally{await cdp.detach();}
  await delay(300);
  const witness=await page.evaluate(()=>{
    const state=window.__g6PostDispatch;
    try{return {events:state.raw.map(({event,captured})=>({...captured,defaultPrevented:event.defaultPrevented,afterDispatch:event.eventPhase===Event.NONE,connected:!!event.target?.isConnected})),remaining:[...state.pointers]};}
    finally{state.stop();delete window.__g6PostDispatch;}
  });
  const after=await g6ScaleFacts(page),events=witness.events;
  const downs=events.filter(e=>e.family==='pointer'&&e.type==='pointerdown');
  const pairs=events.filter(e=>e.count===2&&(e.family==='pointer'||e.type!=='touchend'));
  const inventory={pointerDowns:downs.length,pointerMoves:events.filter(e=>e.family==='pointer'&&e.type==='pointermove'&&e.count===2).length,
    touchMoves:events.filter(e=>e.family==='touch'&&e.type==='touchmove'&&e.count===2).length,
    cancelableTouchMoves:events.filter(e=>e.family==='touch'&&e.type==='touchmove'&&e.count===2&&e.cancelable).length,remaining:witness.remaining.length};
  const observed={events,inventory,commands,inputError,before,after,label:'trusted Chromium protocol multi-touch with post-dispatch cancellation observation; does not establish physical iPhone zoom'};
  const inputIntegrity=g6NativeInputIntegrity(observed);
  const ok=inputIntegrity.ok&&!inputError&&downs.length>=2&&inventory.pointerMoves>0&&inventory.touchMoves>0&&inventory.remaining===0&&events.every(e=>e.trusted&&e.afterDispatch&&e.stamp===before.stamp)&&
    pairs.every(e=>!e.defaultPrevented)&&before.scale===after.scale&&before.node===after.node;
  return {ok,observed:{...observed,inputIntegrity}};
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
// Passive geometry only. This code never scrolls, focuses, or calls an app helper.
function g6CurrentThreadDOM(action={}) {
  const active=()=>[...document.querySelectorAll('.scale-thread')].filter(n=>n.isConnected&&!n.closest('[inert],[hidden],[aria-hidden="true"]')&&n.getClientRects().length);
  const rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const offsets=()=>({window:{x:scrollX,y:scrollY},document:{x:document.documentElement.scrollLeft,y:document.documentElement.scrollTop},body:{x:document.body.scrollLeft,y:document.body.scrollTop},...Object.fromEntries(['app','reader','sheet'].map(id=>{const n=document.getElementById(id);return [id,n?{x:n.scrollLeft,y:n.scrollTop}:null];}))});
  const facts=(thread=active()[0])=>{
    if(!thread)return null;
    const currents=thread.querySelectorAll(':scope > [aria-current="step"]'),current=currents[0],outside=thread.querySelector(':scope > [data-scale-out]');
    const rail=rect(thread),bead=rect(current),out=rect(outside),viewport={width:document.documentElement.clientWidth,height:innerHeight};
    const left=Math.max(0,rail.left+thread.clientLeft),right=Math.min(viewport.width,rail.left+thread.clientLeft+thread.clientWidth);
    let currentLeft=left,currentRight=right;
    if(out&&outside!==current&&out.right>left&&out.left<right){if(out.left+out.width/2<=(left+right)/2)currentLeft=Math.max(left,out.right);else currentRight=Math.min(right,out.left);}
    const contained=(box,l,r)=>!!box&&box.width>0&&box.height>0&&box.left>=l&&box.right<=r&&box.top>=Math.max(0,rail.top)&&box.bottom<=Math.min(viewport.height,rail.bottom);
    return {at:performance.now(),scale:thread.dataset.scale,activeRails:active().length,connected:thread.isConnected,owner:thread.parentElement?.id||null,
      currentCount:currents.length,currentTag:current?.tagName,currentDisabled:current?.disabled===true,currentNode:current?.dataset.node||null,currentIndex:current?.dataset.stackIndex||null,
      currentIsOutside:current===outside,rail,bead,out,viewport,available:{left:currentLeft,right:currentRight},scrollLeft:thread.scrollLeft,scrollTop:thread.scrollTop,scrollWidth:thread.scrollWidth,clientWidth:thread.clientWidth,
      currentContained:contained(bead,currentLeft,currentRight),outsideContained:contained(out,left,right),offsets:offsets(),fontStatus:document.fonts.status,font:current?getComputedStyle(current).font:null,
      theme:document.documentElement.getAttribute('data-theme'),sheetWorld:document.getElementById('sheet')?.dataset.world||null,stamp:window.__g6DocumentStamp};
  };
  if(action.op==='observe'){
    if(window.__g6CurrentMount)throw new Error('current-thread observer already active');
    const old=[...document.querySelectorAll('.scale-thread')].map(node=>({node,scale:node.dataset.scale,left:node.scrollLeft,top:node.scrollTop})),seen=new Set(),mounts=[];
    const observer=new MutationObserver(()=>{
      for(const thread of active())if(thread.dataset.scale===action.scale&&!seen.has(thread)&&!old.some(row=>row.node===thread)){
        seen.add(thread);mounts.push({thread,initial:facts(thread)});
      }
    });
    observer.observe(document.getElementById('app'),{childList:true,subtree:true});
    window.__g6CurrentMount={finish:()=>{
      observer.disconnect();
      return {mounts:mounts.map(({thread,initial})=>({initial,settled:facts(thread),sameLiveOwner:thread.isConnected&&thread===active()[0]})),retained:old.filter(row=>row.node.isConnected).map(row=>({scale:row.scale,before:{left:row.left,top:row.top},after:{left:row.node.scrollLeft,top:row.node.scrollTop},inert:!!row.node.closest('[inert],[aria-hidden="true"]')}))};
    }};
    return {observing:action.scale,oldRails:old.length};
  }
  if(action.op==='finish'){
    if(!window.__g6CurrentMount)throw new Error('current-thread observer missing');
    try{return window.__g6CurrentMount.finish();}finally{delete window.__g6CurrentMount;}
  }
  return facts();
}
async function g6CurrentThreadGeometry(page){
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  return page.evaluate(g6CurrentThreadDOM);
}
async function g6CurrentThreadVisible(page,{emit,width,world}){
  const modality='touch',home=await g6OpenOrigin(page,modality),route=[];
  for(const [from,to]of [['article','sentence'],['sentence','word'],['word','kanji']]){
    const step=await g6Move(page,{from,to,home,modality});route.push(step);assert(step.ok,JSON.stringify(step.observed));
  }
  await pageSettled(page);
  await page.evaluate(g6CurrentThreadDOM,{op:'observe',scale:'part'});
  let observed;
  try{
    const step=await g6Move(page,{from:'kanji',to:'part',home,modality});route.push(step);
    await pageSettled(page);
    await page.waitForFunction(()=>document.fonts.status==='loaded',null,{timeout:10000});
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  }finally{observed=await page.evaluate(g6CurrentThreadDOM,{op:'finish'});}
  const part=await g6CurrentThreadGeometry(page),capture=resolve(evidence,`${engine}-G6-current-${width}-${world}-part.png`);
  await page.screenshot({path:capture});
  emit('current.context','actual requested width and palette with the retained nonzero source occurrence',part?.viewport.width===width&&part?.sheetWorld===world&&part?.stamp===home.stamp&&home.origin.scrollY>0,{width,world,part,origin:home.origin,capture});
  emit('current.part-route','four native inward edges reach the actual source-backed part',route.length===4&&route.every(row=>row.ok)&&part?.scale==='part'&&part.currentNode===`radical:${G6_ORIGIN.part}`,route);
  emit('current.part-contained','the whole part-current span is visible beside the wholly visible sticky outside control',part?.activeRails===1&&part?.currentCount===1&&part?.currentTag==='SPAN'&&part?.currentContained&&part?.outsideContained,{part,capture});
  const mount=observed.mounts[0],unchanged=observed.mounts.length===1&&mount.sameLiveOwner&&mount.initial.currentNode===mount.settled.currentNode&&
    JSON.stringify(mount.initial.offsets)===JSON.stringify(mount.settled.offsets)&&mount.initial.scrollTop===mount.settled.scrollTop&&
    observed.retained.length>0&&observed.retained.every(row=>row.inert&&JSON.stringify(row.before)===JSON.stringify(row.after));
  emit('current.part-scroll-only','first-layout correction leaves exact page/reader/sheet offsets and every retained inert rail unchanged',unchanged,observed);
  const ancestor=await g6Bead(page,'article',modality);assert(ancestor.ok,JSON.stringify(ancestor.observed));
  const returned=await g6Line(page,home);emit('current.return-line','native article bead returns the exact nonzero source line within4px',returned.ok,returned.observed);
  const outward=[];
  for(const [from,to]of [['article','shelf'],['shelf','sky']]){const row=await g6Move(page,{from,to,home,modality});outward.push(row);assert(row.ok,JSON.stringify(row.observed));}
  const sky=await g6CurrentThreadGeometry(page);
  emit('current.sky-contained','the genuine root-sky current is the fully visible disabled outside button',outward.every(row=>row.ok)&&sky?.scale==='sky'&&sky?.currentCount===1&&sky.currentIsOutside&&sky.currentTag==='BUTTON'&&sky.currentDisabled&&sky.currentContained&&sky.outsideContained,{sky,outward});
  for(const [from,to]of [['sky','shelf'],['shelf','article']]){const row=await g6Move(page,{from,to,home,modality});assert(row.ok,JSON.stringify(row.observed));}
  const skyReturn=await g6Line(page,home);emit('current.sky-return-line','root-sky detour preserves the same source and line within4px',skyReturn.ok,skyReturn.observed);
  const after=g6Learning(await readAppRecord(page));emit('current.no-record-work','current-bead visibility and native journeys create no saved-card or grade work',JSON.stringify(home.learning)===JSON.stringify(after),{before:home.learning,after});
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
  const recursiveCurrent=await g6CurrentThreadGeometry(page);
  emit('recursive.current-visible','new recursive rail exposes its entire current span beside the sticky outside control',recursiveCurrent?.activeRails===1&&recursiveCurrent?.currentTag==='SPAN'&&recursiveCurrent?.currentContained&&recursiveCurrent?.outsideContained,recursiveCurrent);
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
  else {
    if(kind==='key')await page.keyboard.press('PageDown');
    else{assert.equal(kind,'wheel');await page.mouse.move(380,500);await page.mouse.wheel(0,240);}
    // Native scrolling can animate beyond 150ms in WebKit. Observe it settle
    // before releasing the held app callback; do not mistake its own motion
    // for a stale return stealing the user's position.
    await page.evaluate(()=>new Promise((resolve,reject)=>{
      const start=performance.now();let last=scrollY,stable=0;
      function sample(){
        const current=scrollY;stable=Math.abs(current-last)<.1?stable+1:0;last=current;
        if(stable>=8)return resolve();
        if(performance.now()-start>2000)return reject(new Error('native scroll did not settle before return-frame release'));
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }));
  }
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
// Read only the tested asset's immutable vocabulary/hub construction. The VM
// has no browser state or host callbacks; the live camera is observed below.
let g6StaticHubCache = null;
function g6StaticSkyHubs() {
  if (g6StaticHubCache) return g6StaticHubCache;
  const source = readFileSync(resolve(site, 'drift-layer.js'), 'utf8');
  const sha256 = createHash('sha256').update(source).digest('hex');
  assert.equal(sha256, identity.files.find(f => f.path === 'drift-layer.js')?.sha256, 'hub geometry comes from pinned served bytes');
  const arrayLiteral = name => {
    const declaration = source.indexOf('const ' + name + '=');
    assert(declaration >= 0, `static ${name} declaration`);
    const start = source.indexOf('[', declaration);
    let depth = 0, quote = null, escape = false;
    for (let i = start; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (escape) escape = false;
        else if (c === '\\') escape = true;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '[') depth++;
      else if (c === ']' && --depth === 0) return source.slice(start, i + 1);
    }
    assert.fail(`unclosed static ${name} array`);
  };
  const wallStart = source.indexOf('const SEEDSET='), wallEnd = source.indexOf('// the semantic tier:', wallStart);
  const hubStart = source.indexOf('const HUBS='), hubEnd = source.indexOf('const HUBPOS=', hubStart);
  assert(wallStart >= 0 && wallEnd > wallStart && hubStart >= 0 && hubEnd > hubStart, 'static hub dependencies retain their declared boundaries');
  const hubs = vm.runInNewContext(`const W=${arrayLiteral('W')},WBIG=${arrayLiteral('WBIG')};const LVLOF={};for(const e of WBIG)LVLOF[e[0]]=e[3];const isKanji=c=>c>='\u3400'&&c<='\u9fff';${source.slice(wallStart,wallEnd)}${source.slice(hubStart,hubEnd)}HUBS;`, {}, { timeout: 1000 });
  assert(hubs.length > 0 && hubs.length <= 42, 'actual static hub list');
  return g6StaticHubCache = { hubs: [...hubs], sha256 };
}
async function g6PrivateHubPoint(page, hubs) {
  return page.evaluate(hubs => {
    const place = window.__DRIFT__?.capturePlace();
    if (!place) return null;
    const { camera: c, world: w } = place, cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    for (const [index, label] of hubs.entries()) {
      const a = index * 2.39996, r = .10 + .38 * Math.sqrt(index / hubs.length);
      const wx = w.width / 2 + Math.cos(a) * r * w.width * .92;
      const wy = w.height / 2 + Math.sin(a) * r * w.height * .92;
      const dx = wx - c.x, dy = wy - c.y;
      const sx = innerWidth / 2 + (dx * cs - dy * sn) * c.z;
      const sy = innerHeight / 2 + (dx * sn + dy * cs) * c.z;
      // A native touch footprint must stay on canvas, not merely its center.
      const offsets = [[0, 0], ...Array.from({ length: 16 }, (_, i) => [32 * Math.cos(i * Math.PI / 8), 32 * Math.sin(i * Math.PI / 8)])];
      for (const [ox, oy] of offsets) {
        const x = sx + ox, y = sy + oy;
        if (x < 54 || x > innerWidth - 30 || y < 135 || y > innerHeight - 140) continue;
        const disk = [{ x, y }, ...Array.from({ length: 16 }, (_, i) => ({ x: x + 30 * Math.cos(i * Math.PI / 8), y: y + 30 * Math.sin(i * Math.PI / 8) }))];
        if (disk.every(p => document.elementFromPoint(p.x, p.y)?.id === 'sky'))
          return { index, label, x, y, hub: { x: sx, y: sy }, touchFootprintRadius: 30, place };
      }
    }
    return null;
  }, hubs);
}
const g6PrivateFocusFacts = page => page.evaluate(() => {
  const n = document.activeElement, b = n?.getBoundingClientRect(), style = n ? getComputedStyle(n) : null;
  return { tag: n?.tagName, id: n?.id || null, out: !!n?.hasAttribute('data-scale-out'), inward: !!n?.hasAttribute('data-scale-in'),
    connected: !!n?.isConnected, disabled: !!n?.matches?.(':disabled'),
    visible: !!(b?.width && b?.height && b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < innerHeight &&
      style.visibility !== 'hidden' && Number(style.opacity) > 0 && !n.closest('[inert],[hidden],[aria-hidden="true"]')) };
});
async function g6PrivateSkyKeyboardReturn(page, { emit }) {
  const home = await g6SkyHome(page);
  const before = await g6SkyFacts(page), sourceBefore = await g6ScaleFacts(page);
  const record = await readAppRecordSnapshot(page), geometry = g6StaticSkyHubs();
  assert.equal(JSON.parse(before.place.path).length, 0, 'fixture begins at actual outer sky');
  assert.equal(sourceBefore.tokenIndex, String(home.origin.index), 'fixture retains a real nonzero source occurrence');
  const point = await g6PrivateHubPoint(page, geometry.hubs);
  assert(point, 'one actual canvas-owned hub with full native touch footprint');
  await page.evaluate(() => {
    window.__g6PrivateInputs = [];
    for (const type of ['pointerdown', 'pointerup', 'keydown']) addEventListener(type, e => window.__g6PrivateInputs.push({ type, key: e.key || null,
      trusted: e.isTrusted, target: e.target.tagName, out: !!e.target.hasAttribute?.('data-scale-out'), inward: !!e.target.hasAttribute?.('data-scale-in') }), { capture: true, passive: true });
  });
  await page.touchscreen.tap(point.x, point.y);
  await page.waitForFunction(() => document.body.classList.contains('drift-dived'), null, { timeout: 5000 });
  const entered = await g6SkyFacts(page);
  emit('private.entry', 'one native canvas hub tap enters one private depth without opening a word',
    JSON.parse(entered.place.path).length === 1 && !entered.mini && !entered.sheet, { point, entered, driftSha256: geometry.sha256 });
  assert.equal(JSON.parse(entered.place.path).length, 1, 'depth1 is the declared keyboard-return fixture');
  // This is the only explicit focus in the keyboard continuity test.
  const rail = page.locator('#app > .scale-thread [data-scale-out]');
  await rail.focus();
  const initialFocus = await g6PrivateFocusFacts(page);
  assert(initialFocus.out && initialFocus.visible && !initialFocus.disabled, 'the initial outward control owns the keyboard');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.body.classList.contains('drift-dived'), null, { timeout: 5000 });
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const root = await g6SkyFacts(page), focus = await g6PrivateFocusFacts(page), rootSource = await g6ScaleFacts(page);
  emit('private.root-focus', 'private depth1→root retains visible enabled inward keyboard focus',
    root.view === 'drift' && JSON.parse(root.place.path).length === 0 && focus.inward && focus.connected && focus.visible && !focus.disabled,
    { initialFocus, focus, root });
  await page.keyboard.press('Enter'); // No locator activation, Tab, or focus repair.
  let reached = true;
  try { await page.waitForFunction(() => document.body.dataset.view === 'shelf', null, { timeout: 1500 }); }
  catch { reached = false; }
  const next = await g6SkyFacts(page), nextSource = await g6ScaleFacts(page);
  const inputs = await page.evaluate(() => window.__g6PrivateInputs), keys = inputs.filter(e => e.type === 'keydown');
  emit('private.next-enter', 'the next unrepaired trusted Enter opens shelf', reached && next.view === 'shelf' && keys.length === 2 &&
    keys.every(e => e.trusted && e.key === 'Enter') && keys[0].out && keys[1].inward, { next, inputs });
  const sameSource = facts => ['passage', 'tokenIndex', 'sentenceStart', 'sentenceEnd'].every(k => facts[k] === sourceBefore[k]);
  const sameCamera = place => !!place && ['x', 'y', 'z', 'rot'].every(k => Math.abs(place.camera[k] - before.place.camera[k]) <= .5) &&
    ['scopeId', 'generation', 'sceneGeneration', 'path'].every(k => place[k] === before.place[k]);
  emit('private.source-camera', 'the private return and shelf step preserve the actual article occurrence and sky place',
    sameSource(rootSource) && sameSource(nextSource) && sameCamera(root.place) && sameCamera(next.place),
    { sourceBefore, rootSource, nextSource, beforePlace: before.place, rootPlace: root.place, nextPlace: next.place });
  const afterRecord = await readAppRecordSnapshot(page);
  emit('private.no-record-work', 'private return and keyboard scale travel make no record revision or learner work',
    record.revision === afterRecord.revision && JSON.stringify(record.record) === JSON.stringify(afterRecord.record),
    { beforeRevision: record.revision, afterRevision: afterRecord.revision });
}

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
  if(!await page.locator('#mini').count()){assert.equal(await word.getAttribute('data-ladder-rung'),'reading');await page.waitForFunction(()=>window.__DRIFT__?.canNavigate()===true,null,{timeout:10000});const again=await g6AimSkyWord(page,word);await page.touchscreen.tap(again.x,again.y);}
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
async function g6NativeSkyGrade(page,word,aim){
  // Observe the real input, including whether the printed center still owns it.
  await word.evaluate(node=>{
    const events=[];
    const observer=event=>{const target=event.target?.closest?.('.word');const row={type:event.type,id:event.pointerId,pointerType:event.pointerType,trusted:event.isTrusted,at:Date.now(),timeStamp:event.timeStamp,x:event.clientX,y:event.clientY,owner:target===node,label:target?.querySelector('.base')?.textContent||null,center:!!target?.classList.contains('bctr')};queueMicrotask(()=>events.push({...row,prevented:event.defaultPrevented}));};
    window.__g6GradeInput={events,stop:()=>{for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])removeEventListener(type,observer,true);}};
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])addEventListener(type,observer,{capture:true,passive:true});
  });
  let events;
  try{
    await page.mouse.move(aim.x,aim.y);await page.mouse.down();
    await page.mouse.move(aim.x+65,aim.y,{steps:1});await page.mouse.move(aim.x+105,aim.y,{steps:1});await page.mouse.up();
  }finally{events=await page.evaluate(()=>{const p=window.__g6GradeInput;p.stop();return p.events;});}
  const down=events.find(e=>e.type==='pointerdown'),up=events.find(e=>e.type==='pointerup'&&e.id===down?.id);
  const dx=up&&down?up.x-down.x:0,dy=up&&down?up.y-down.y:0,held=up&&down?up.at-down.at:Infinity;
  const valid=!!down?.owner&&down.label===aim.label&&!!up&&events.every(e=>e.trusted&&!e.prevented)&&!events.some(e=>e.type==='pointercancel')&&dx>52&&Math.abs(dy)<90&&(held<330||Math.abs(dx)/Math.max(held,1)>.45);
  const receipt={label:aim.label,dx,dy,held,valid,events};
  assert(valid,`one native flick must satisfy the existing input contract: ${JSON.stringify(receipt)}`);
  return receipt;
}
async function g6PendingGuard(page,{context,emit,kind}){
  // A fresh native sky cue is needed: no prior word lookup can retire it.
  await page.goto(`${host.origin}/index.html?entry=drift&ui=bi`);await page.waitForFunction(()=>document.body.dataset.ready==='1'&&window.__DRIFT__?.canNavigate()&&document.querySelector('#drift-layer')?.dataset.recordState==='active');
  let word=await g6PickSkyWord(page);
  if(kind==='grade'){
    const at=await g6AimSkyWord(page,word);await page.touchscreen.tap(at.x,at.y);await page.waitForFunction(()=>!document.querySelector('#drift-layer[data-record-cue-pending]')&&window.__DRIFT__?.canNavigate()===true);
    await waitForAppRecord(page,r=>r.driftState?.store?.cue===1,{description:'native cue-retirement acknowledgment'});
    await page.keyboard.press('Escape');if(await page.locator('#mini').count())await page.keyboard.press('Escape');
    // Escape folds the reading, not its native constellation. A satellite is
    // deliberately movable but not gradeable while that center is retained.
    await page.waitForFunction(node=>node.isConnected&&!node.dataset.ladderRung&&!document.getElementById('mini')&&window.__DRIFT__?.canNavigate()===true,word,{timeout:10000});
    const owner=await word.evaluate(node=>({label:node.querySelector('.base')?.textContent,center:node.classList.contains('bctr'),hasCenter:!!document.querySelector('#sky .word.bctr')}));
    assert(!owner.hasCenter||owner.center,`the original cue word must remain the gradeable bloom center: ${JSON.stringify(owner)}`);
  }
  const before=await g6HoldDriftCommit(page);
  try{
    const gestureAt=await g6AimSkyWord(page,word);
    let gradeInput=null;
    if(kind==='cue')await page.touchscreen.tap(gestureAt.x,gestureAt.y);
    else gradeInput=await g6NativeSkyGrade(page,word,gestureAt);
    await page.waitForFunction(kind=>window.__g6CommitHold.fired===1&&window.__DRIFT__.canNavigate()===false&&(kind==='cue'?document.querySelector('#drift-layer[data-record-cue-pending]'):document.querySelector('#drift-layer [data-record-pending][aria-busy="true"]')),kind,{timeout:10000}).catch(async error=>{const hold=await page.evaluate(()=>({fired:window.__g6CommitHold.fired,completed:window.__g6CommitHold.completed,aborted:window.__g6CommitHold.aborted,puts:window.__g6CommitHold.puts}));throw new Error(`${error.message}\nPending input receipt: ${JSON.stringify({kind,gestureAt,gradeInput,hold})}`,{cause:error});});
    if(kind==='cue'){await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('mini')&&!document.querySelector('#drift-layer [data-ladder-rung="reading"]'));}
    // No DB read while the real write transaction is deliberately outstanding.
    const held=await g6SkyFacts(page),point=await g6SkyPoint(page);assert(point);
    assert(kind==='cue'||held.grades.some(text=>text.includes(gestureAt.label)),'pending grade names the exact hit-owned word');
    const hand=await g6Hand(page,context,false);try{await g6Spread(hand,point);}finally{await hand.close();}
    const out=page.locator(`${G6_RAIL} [data-scale-in]`);if(await out.count()&&await out.isEnabled())await out.tap();
    const after=await g6SkyFacts(page),hold=await page.evaluate(()=>({fired:window.__g6CommitHold.fired,completed:window.__g6CommitHold.completed,aborted:window.__g6CommitHold.aborted}));
    emit('pending.block','real pending cue/judgment blocks sky gesture and scale controls before native acknowledgment',!after.allowed&&after.view==='drift'&&after.sheet===held.sheet&&hold.fired===1&&!hold.completed&&!hold.aborted,{kind,held,after,hold,gradeInput});
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
// RECEIVED-RECORD fixture, copied from verify-reader-doors D6. This is not a
// fresh reader Save producer. The public file importer admits the complete
// portable record; the actual served teacher module owns its content-derived ID.
const G6_RECEIVED_SOURCE=Object.freeze({savedAt:Date.parse('2026-09-25T00:00:00Z'),encounter:Object.freeze({
  sourceKind:'bundled-passage',sourceId:'aozora:000628',unit:'token-index',start:2347,end:2357,index:2351,
  quote:'」「それがわからんのだよ。',title:'ごん狐',attribution:'青空文庫 新美南吉「ごん狐」',
  url:'https://www.aozora.gr.jp/cards/000121/card628.html',target:Object.freeze({type:'word',id:'わかる'})
})});
async function g6ReceivedSourceReturn(page,{emit}){
 const receipt={label:'RECEIVED-RECORD exact canonical D6; native same-passage source return',steps:[],checks:[]};
 const RETAIN=989,PASSAGE_A=G6_RECEIVED_SOURCE.encounter.sourceId;
 const tokenFacts=async index=>page.locator(`#reader .tok[data-index="${index}"]`).evaluate(n=>{const r=n.getBoundingClientRect(),clone=n.cloneNode(true);clone.querySelectorAll('rt,rp').forEach(t=>t.remove());return{index:Number(n.dataset.index),word:n.dataset.word,printed:clone.textContent,connected:n.isConnected,top:r.top,bottom:r.bottom,scrollY,focused:document.activeElement===n,painted:!!n.getClientRects().length};});
 await boot(page);
 const bytes=readFileSync(resolve(site,'data/articles/aozora-000628.json'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),identity.files.find(f=>f.path==='data/articles/aozora-000628.json')?.sha256,'received fixture article equals served manifest');
 const article=JSON.parse(bytes),sourceDigest=createHash('sha256').update(JSON.stringify(article.tokens.map(t=>t.s))).digest('hex');
 const teacher=await import(pathToFileURL(resolve(site,'teacher-context.mjs')).href);
 const encounter=await teacher.createTeacherContext({...G6_RECEIVED_SOURCE.encounter,target:{...G6_RECEIVED_SOURCE.encounter.target},sourceDigest});
 assert.deepEqual(await teacher.verifyTeacherContext(encounter),encounter);
 const saved={t:'word',id:'わかる',label:'わかる',kind:'語',kindEn:'word',from:null,ts:G6_RECEIVED_SOURCE.savedAt,started:G6_RECEIVED_SOURCE.savedAt,sourceContextRef:encounter.id};
 await restoreAppFixture(page,{v:1,taken:[saved],teacherContexts:{version:1,activeRef:null,entries:[encounter]}});
 receipt.encounter=encounter;
 const imported=await readAppRecordSnapshot(page);receipt.imported={record:imported.record,revision:imported.revision};assert.equal(imported.record.taken[0].sourceContextRef,encounter.id);assert.equal(encounter.index,2351);
 assert.equal(article.tokens[RETAIN].b,'家');assert.equal(article.tokens[RETAIN].s,'家');assert.equal(article.tokens[2351].b,'わかる');assert.equal(article.tokens.slice(encounter.start,encounter.end).map(t=>t.s).join(''),encounter.quote);
 const direct=page.locator(`[data-passage="${PASSAGE_A}"]:not([data-recommendation]) .shelf-open`).first();
 if(await direct.count())await direct.tap();else{await openShelfTools(page);await page.locator('#shelf-reading-search').fill('ごん狐');await page.locator('#shelf-reading-search').press('Enter');await page.locator(`#shelf-reading-results [data-passage="${PASSAGE_A}"] .shelf-open`).first().tap();}
 const retained=page.locator(`#reader .tok[data-index="${RETAIN}"][data-word="家"]`);await retained.waitFor();await retained.scrollIntoViewIfNeeded();await stage(page,retained);await page.locator('#mini .mini-word').tap();await pageSettled(page);assert.equal(await page.locator('#sheet').getAttribute('data-node'),'word:家');await page.locator('#sheet-back').tap();await bare(page);await page.locator('#mini .mini-word').waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('mini'));await delay(300);
 const original=await tokenFacts(RETAIN),sourceBefore=await tokenFacts(2351),state=await g6ScaleFacts(page);receipt.retained={original,sourceBefore,state};assert(original.scrollY>0&&original.top>=0&&original.bottom<=844,'retained actual nonzero visible source');assert.equal(state.tokenIndex,String(RETAIN));assert.equal(state.passage,PASSAGE_A);assert(Math.abs(original.top-sourceBefore.top)>844,'actual two occurrences are more than one viewport apart');

 // Ordinary no-anchor shelf return is a control, not a substitute for explicit source navigation.
 await g6Activate(page,page.locator(`${G6_RAIL}[data-scale="article"] button[data-scale-out]`),'touch');await page.waitForFunction(()=>document.body.dataset.view==='shelf');
 await g6Activate(page,page.locator(`${G6_RAIL}[data-scale="shelf"] button[data-scale-in]`),'touch');
 await page.waitForFunction(()=>document.querySelector('#reader')?.dataset.scaleReturnIndex==='989');await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const ordinary=await tokenFacts(RETAIN),ordinaryState=await g6ScaleFacts(page);receipt.ordinary={original,returned:ordinary,state:ordinaryState,delta:ordinary.top-original.top};
 receipt.checks.push({id:'ordinary-no-anchor989',ok:ordinary.focused&&ordinary.scrollY>0&&Math.abs(ordinary.top-original.top)<=4&&ordinaryState.tokenIndex==='989'&&ordinaryState.passage===PASSAGE_A});
 assert(receipt.checks.at(-1).ok,'ordinary no-anchor989 return must remain exact');

 for(const [from,to]of [['article','shelf'],['shelf','sky']]){const before=await g6ScaleFacts(page);assert.equal(before.scale,from);await g6Activate(page,page.locator(`${G6_RAIL}[data-scale="${from}"] button[data-scale-out]`),'touch');await page.waitForFunction(v=>document.body.dataset.view===v,to==='sky'?'drift':'shelf');const after=await g6ScaleFacts(page);receipt.steps.push({name:`${from}->${to}`,before,after});assert.equal(after.passage,PASSAGE_A);assert.equal(after.tokenIndex,String(RETAIN));assert.equal(after.scale,to);}
 await page.waitForFunction(()=>[...document.querySelectorAll('#drift-layer .scale-star-kept')].some(n=>JSON.parse(n.dataset.keptKey)[0]==='わかる'));
 const stars=(await g6SkyFacts(page)).stars.filter(s=>JSON.parse(s.key)[0]==='わかる');assert.equal(stars.length,1);receipt.keptKey=stars[0].key;receipt.pan=await g6PanToKept(page,stars[0].key);const star=page.locator('#drift-layer .scale-star-kept').filter({hasText:'わかる'});assert.equal(await star.count(),1);await star.tap();await pageSettled(page);receipt.keptPage=await g6ScaleFacts(page);assert.equal(receipt.keptPage.node,'word:わかる');assert.equal(receipt.keptPage.tokenIndex,String(RETAIN));
 const details=page.locator('#sheet details.learning-source');assert.equal(await details.count(),1,'canonical received source disclosure exists');assert.equal(await details.locator('.teacher-source-quote').textContent(),encounter.quote);if(!await details.evaluate(n=>n.open))await details.locator('summary').tap();
 const sourceDoor=page.locator('#learning-source-return');assert.equal(await sourceDoor.count(),1);receipt.invoked={sourceIndex:encounter.index,sourceId:encounter.sourceId,retainedIndex:RETAIN,word:'わかる',quote:await details.locator('.teacher-source-quote').textContent(),before:await g6ScaleFacts(page),beforeRecordRevision:(await readAppRecordSnapshot(page)).revision};
 await sourceDoor.tap();await page.waitForFunction(pid=>document.body.dataset.view==='reader'&&document.querySelector('.listen-row')?.dataset.passage===pid&&!document.getElementById('sheet'),PASSAGE_A);
 await page.waitForFunction(({a,b})=>document.querySelector('#reader')?.dataset.scaleReturnIndex===String(a)||document.activeElement?.dataset?.index===String(b),{a:RETAIN,b:2351},{timeout:7000});
 await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const after=await readAppRecordSnapshot(page);receipt.landed={retained:await tokenFacts(RETAIN),source:await tokenFacts(2351),state:await g6ScaleFacts(page),completion:await page.locator('#reader').evaluate(n=>({...n.dataset})),sourceBack:await page.locator('#reader-source-back').count(),revision:after.revision,learningUnchanged:JSON.stringify(g6Learning(imported.record))===JSON.stringify(g6Learning(after.record))};
 receipt.landed.retainedDelta=receipt.landed.retained.top-original.top;receipt.sourceIndexMatches=receipt.landed.source.focused&&receipt.landed.source.top>=0&&receipt.landed.source.bottom<=844;receipt.reproducedWrongRetainedOccurrence=receipt.landed.retained.focused&&Math.abs(receipt.landed.retainedDelta)<=4&&!receipt.sourceIndexMatches;

 receipt.checks.push({id:'explicit-source2351',ok:receipt.sourceIndexMatches,observed:receipt.landed});

 const requestedBefore=await tokenFacts(2351);
 await g6Activate(page,page.locator(`${G6_RAIL}[data-scale="article"] button[data-scale-out]`),'touch');await page.waitForFunction(()=>document.body.dataset.view==='shelf');
 const outward=await g6ScaleFacts(page);
 await g6Activate(page,page.locator(`${G6_RAIL}[data-scale="shelf"] button[data-scale-in]`),'touch');
 await page.waitForFunction(()=>['989','2351'].includes(document.querySelector('#reader')?.dataset.scaleReturnIndex));await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const afterJourney=await tokenFacts(2351),journeyState=await g6ScaleFacts(page),journeyRecord=await readAppRecordSnapshot(page);
 receipt.followup={before:requestedBefore,outward,after:afterJourney,state:journeyState,delta:afterJourney.top-requestedBefore.top,completion:await page.locator('#reader').evaluate(n=>({...n.dataset}))};
 receipt.checks.push({id:'new-source-outward-inward2351',ok:outward.tokenIndex==='2351'&&journeyState.tokenIndex==='2351'&&afterJourney.focused&&afterJourney.top>=0&&afterJourney.bottom<=844&&afterJourney.scrollY>0&&Math.abs(receipt.followup.delta)<=4,observed:receipt.followup});
 receipt.checks.push({id:'learning-unchanged',ok:JSON.stringify(g6Learning(imported.record))===JSON.stringify(g6Learning(journeyRecord.record)),observed:{before:g6Learning(imported.record),after:g6Learning(journeyRecord.record)}});

 for(const row of receipt.checks)emit(row.id,{ 'ordinary-no-anchor989':'ordinary shelf return preserves retained989 exactly', 'explicit-source2351':'received saved source2351 overrides retained same-passage989', 'new-source-outward-inward2351':'outward/inward journey captures and returns the new source2351 within4px', 'learning-unchanged':'source/scale travel preserves saved learning roots' }[row.id],row.ok,row.observed||{label:receipt.label,ordinary:receipt.ordinary,encounter:receipt.encounter,retained:receipt.retained,steps:receipt.steps});

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
  const provenance=await g6FreshProvenance(page,row,saved.record);
  emit('kept.source-provenance','a fresh Save shows a source door exactly when its own valid provenance exists',provenance.ok,provenance);
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

const G6_TOUCHMOVE_FAULT=Object.freeze({file:'corridor.js',key:'cancel-text-touchmove',from:'function scaleThread() {',to:`// G6 negative control: bubble-phase two-touch touchmove cancellation on text.
document.addEventListener('touchmove', e => {
 if(e.touches.length===2 && !e.target.closest?.('#drift-layer')) {
  e.preventDefault(); window.__g6TouchmoveFault=(window.__g6TouchmoveFault||0)+1;
 }
}, {passive:false});
function scaleThread() {`});
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
  {id:'late-bubble-pointer',target:'text.native-two-pointer',schedule:'native-pinch',engines:['chromium'],edits:[{file:'corridor.js',key:'late-bubble-two-pointer',
    from:'function scaleThread() {',
    to:`// G6 negative control: late bubble-phase two-touch pointer cancellation on text.
const g6LatePointers = new Set();
addEventListener('pointerdown', e => { if(e.pointerType==='touch') g6LatePointers.add(e.pointerId); }, true);
for(const type of ['pointerup','pointercancel']) addEventListener(type,e=>g6LatePointers.delete(e.pointerId),true);
document.addEventListener('pointermove', e => {
 if(e.pointerType==='touch' && g6LatePointers.size===2 && !e.target.closest('#drift-layer')) {
  e.preventDefault(); window.__g6LatePointerFault=(window.__g6LatePointerFault||0)+1;
 }
}, {passive:false});
function scaleThread() {`}],
    witness:r=>r.observed.faults?.latePointer>0&&r.observed.events.some(e=>e.family==='pointer'&&e.type==='pointermove'&&e.count===2&&e.trusted&&e.defaultPrevented)},
  {id:'touchmove-cancel',target:'text.two-pointer',schedule:'pinch',edits:[G6_TOUCHMOVE_FAULT],
    witness:r=>r.observed.faults?.touchmove>0&&!!r.observed.touch?.events?.some(e=>e.type==='touchmove'&&e.count===2&&e.defaultPrevented)},
  {id:'touchmove-cancel-native',target:'text.native-two-pointer',schedule:'native-pinch',engines:['chromium'],edits:[G6_TOUCHMOVE_FAULT],
    witness:r=>r.observed.faults?.touchmove>0&&r.observed.events.some(e=>e.family==='touch'&&e.type==='touchmove'&&e.count===2&&e.trusted&&e.defaultPrevented)},
  {id:'invented-fresh-source',target:'kept.source-provenance',schedule:'provenance',modalities:['touch'],edits:[{file:'corridor.js',key:'invent-no-ref-source',
    from:"  const ref = learningContextRef(item);\n  if (!ref) return;\n",
    to:"  const ref = learningContextRef(item);\n  if (!ref) {\n    // G6 negative control: an invented source door on a word saved without provenance.\n    const fault = el('details', 'teacher-context learning-source'), door = el('button', 'chip learning-source-return', 'G6 fault');\n    door.type = 'button'; door.id = 'learning-source-return'; fault.append(el('summary', 'eyebrow', 'G6 fault'), door);\n    container.append(fault); window.__g6InventedSource = (window.__g6InventedSource || 0) + 1; return;\n  }\n"}],
    premise:rows=>rows.find(r=>r.id==='kept.source-provenance')?.observed?.branch==='no-ref',
    witness:r=>r.observed.branch==='no-ref'&&r.observed.counts.door>0&&r.observed.markers?.inventedSource>0},
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
  if(schedule==='native-pinch')return ['text.native-two-pointer'];
  if(schedule==='provenance')return [...G6_KEPT_IDS];
  if(schedule==='reverse')return ['setup.article-sentence','setup.sentence-word','setup.word-kanji','setup.kanji-part','reverse.part-kanji'];
  return ['setup.article-shelf','setup.shelf-sky','setup.sky-shelf','setup.shelf-article','return.line'];
}
async function g6ControlSchedule(page,{context,modality,schedule,emit}){
  if(schedule==='provenance')return g6KeptProjection(page,{emit});
  const home=await g6OpenOrigin(page,modality);
  const faults=()=>page.evaluate(()=>({textPinch:window.__g6TextPinchFaultFired||0,latePointer:window.__g6LatePointerFault||0,touchmove:window.__g6TouchmoveFault||0}));
  if(schedule==='pinch'){
    const result=await g6TwoPointerPolicy(page,`#reader .tok[data-index="${G6_ORIGIN.index}"]`);
    emit('text.two-pointer','two pointers on prose remain uncanceled and do not navigate',result.ok,{...result.observed,faults:await faults()});return;
  }
  if(schedule==='native-pinch'){
    const result=await g6NativeChromiumPinch(page,context,`#reader .tok[data-index="${G6_ORIGIN.index}"]`);
    emit('text.native-two-pointer','trusted two-touch input on prose stays uncanceled after dispatch and does not navigate',result.ok,{...result.observed,faults:await faults()});return;
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
// G6 drain recovery: one synthetic owned sky pointerdown deliberately omits its
// terminal. Keyboard sky→shelf→sky runs the real hide/show/renderDrift bridge refresh.
async function g6LostTerminal(page,{context,emit,native}){
  await g6SkyHome(page);
  const point=await g6SkyPoint(page);assert(point,'actual unobstructed sky geometry for the lost and fresh hands');
  const record=await readAppRecordSnapshot(page);
  const ghost=await page.evaluate(({x,y})=>{
    const target=document.elementFromPoint(x,y);
    if(!target?.closest('#drift-layer'))throw new Error('lost-terminal fixture point is not owned by the sky');
    target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:9001,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,buttons:1}));
    return {pointerId:9001,target:target.id||target.className,trusted:false,terminal:'deliberately omitted'};
  },point);
  const refresh=[];
  for(const [from,to,direction,view] of [['sky','shelf','in','shelf'],['shelf','sky','out','drift']]){
    await g6Activate(page,page.locator(`${G6_RAIL}[data-scale="${from}"] button[data-scale-${direction}]`),'keyboard');
    await page.waitForFunction(v=>document.body.dataset.view===v,view,{timeout:5000});refresh.push({from,to,view});
  }
  await page.waitForFunction(()=>window.__DRIFT__?.canNavigate()===true&&document.querySelector('#drift-layer')?.dataset.recordState==='active');
  const before=await g6SkyFacts(page);
  const evidence=await page.evaluate(()=>{
    let touchEvent='TouchEvent';
    let event;
    try{event=new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[]});}
    catch{touchEvent='Event with an empty touches list';event=new Event('touchend',{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:[]});}
    document.dispatchEvent(event);
    window.dispatchEvent(new PointerEvent('pointerup',{pointerId:799,pointerType:'touch',bubbles:true}));
    return {untrustedEmptyTouchList:{type:touchEvent,trusted:event.isTrusted,touches:event.touches.length},foreignTerminal:799};
  });
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.up();evidence.freshPrimaryMouse='native mouse press on the same sky water';
  await delay(300);
  const hand=await g6Hand(page,context,native);
  try{
    await g6Spread(hand,point);await delay(400);
    const consumed=await g6SkyFacts(page);
    if(!native){
      emit('lost.untrusted-drained','untrusted empty touch list, foreign terminal and a fresh primary mouse never release a lost owned touch',consumed.view==='drift'&&!consumed.mini&&!consumed.sheet&&consumed.place?.path===before.place?.path,{label:hand.label,ghost,refresh,evidence,before,consumed});
    }else{
      emit('lost.consumed','the first complete trusted hand after the lost terminal is consumed; untrusted, foreign and mouse evidence cannot release it',consumed.view==='drift'&&!consumed.mini&&!consumed.sheet&&consumed.place?.path===before.place?.path,{label:hand.label,ghost,refresh,evidence,before,consumed,events:await hand.events()});
      await g6Spread(hand,point);
      let reached=true;
      try{await page.waitForFunction(()=>document.body.dataset.view==='shelf',null,{timeout:5000});}
      catch(error){if(error.name!=='TimeoutError')throw error;reached=false;}
      const recovered=await g6SkyFacts(page),events=await hand.events();
      emit('lost.recovered','its trusted empty touch list retires the lost touch; the next fresh trusted spread takes one edge',reached&&recovered.view==='shelf'&&!recovered.mini&&!recovered.sheet&&events.every(e=>e.trusted),{label:hand.label,recovered,events});
    }
  }finally{await hand.close();}
  const after=await readAppRecordSnapshot(page);
  emit('lost.no-record-write','lost-terminal recovery makes no learner-record revision or data change',record.revision===after.revision&&JSON.stringify(record.record)===JSON.stringify(after.record),{beforeRevision:record.revision,afterRevision:after.revision});
}
async function g6InterruptedHold(page,{context,emit,native}){
  await g6SkyHome(page);
  const record=await readAppRecordSnapshot(page),learnerState=r=>JSON.stringify({driftState:r.driftState??null,...g6Learning(r)});
  const facts=word=>page.evaluate(n=>({locked:!!document.querySelector('#drift-layer .bctr'),rung:n.dataset.ladderRung||null,
    mini:!!document.getElementById('mini'),sheet:document.getElementById('sheet')?.dataset.node||null,view:document.body.dataset.view,
    path:window.__DRIFT__?.capturePlace()?.path??null}),word);
  const interrupt=kind=>page.evaluate(kind=>{
    if(kind==='blur'){window.dispatchEvent(new Event('blur'));return 'synthetic window blur';}
    Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true});
    Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    return 'synthetic hidden visibility override, then visible';
  },kind);
  const hand=await g6Hand(page,context,native);
  try{
    for(const kind of ['blur','hidden']){
      const word=await g6PickSkyWord(page),aim=await g6AimSkyWord(page,word),start=await facts(word);
      assert(!start.locked&&!start.rung&&!start.mini,`interruption ${kind} starts without a held constellation`);
      await hand.send('pointerdown',701,aim.x,aim.y);await delay(120);
      const how=await interrupt(kind);await delay(400);
      const held=await facts(word);
      await hand.send('pointerup',701,aim.x,aim.y);await delay(700);
      const after=await facts(word);
      emit(`hold.${kind}`,'an interrupted press loses its pending hold, drag and compatibility tap',!held.locked&&!after.locked&&!after.rung&&!after.mini&&!after.sheet&&after.view==='drift'&&after.path===start.path,{label:hand.label,interruption:how,aim,start,held,after});
    }
    const afterRecord=await readAppRecordSnapshot(page);
    emit('hold.no-record-write','interrupted holds make no cue, grade or saved-word change',learnerState(record.record)===learnerState(afterRecord.record),{beforeRevision:record.revision,afterRevision:afterRecord.revision});
    const word=await g6PickSkyWord(page),aim=await g6AimSkyWord(page,word);
    await hand.send('pointerdown',701,aim.x,aim.y);await delay(520);
    const held=await facts(word);
    await hand.send('pointerup',701,aim.x,aim.y);
    emit('hold.premise','the same uninterrupted press does arm and fire the native hold',held.locked&&held.view==='drift',{label:hand.label,aim,held});
  }finally{await hand.close();}
}
const g6StarProbe=(page,spec)=>page.evaluate(spec=>{
  const star=[...document.querySelectorAll('#drift-layer .scale-star')].find(n=>spec.articleId?n.dataset.articleId===spec.articleId:!!n.dataset.keptKey&&JSON.parse(n.dataset.keptKey)[0]===spec.keptWord);
  const lvl=document.querySelector('#drift-layer #lvl'),place=window.__DRIFT__?.capturePlace();
  if(!star||!lvl||!place)return {found:!!star,lvl:!!lvl,place:place||null};
  const c=place.camera,dx=(star.scaleX-c.x)*c.z,dy=(star.scaleY-c.y)*c.z,cs=Math.cos(c.rot),sn=Math.sin(c.rot);
  const r=star.getBoundingClientRect(),l=lvl.getBoundingClientRect(),style=getComputedStyle(lvl);
  const hot={left:l.left,top:l.top,right:l.left+56,bottom:l.bottom};
  const column={left:hot.left,top:0,right:hot.right,bottom:innerHeight};
  const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
  return {found:true,place,anchor:{x:innerWidth/2+dx*cs-dy*sn,y:innerHeight/2+dx*sn+dy*cs},
    star:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},center:{x,y},hidden:star.hidden,placement:star.dataset.scalePlacement||null,
    identity:{articleId:star.dataset.articleId||null,keptKey:star.dataset.keptKey||null},column,
    hit:!!hit&&(hit===star||star.contains(hit)),hitOwner:hit?.id||hit?.className||null,
    rail:{...hot,width:l.width,visible:!!lvl.getClientRects().length&&l.width>0&&style.display!=='none'&&style.visibility!=='hidden'&&style.pointerEvents!=='none'&&Number(style.opacity)>0,
      level:lvl.getAttribute('aria-valuenow'),hotClass:lvl.classList.contains('hot')},
    intersects:r.left<hot.right&&r.right>hot.left&&r.top<hot.bottom&&r.bottom>hot.top,
    columnIntersects:r.left<column.right&&r.right>column.left&&r.top<column.bottom&&r.bottom>column.top};
},spec);
async function g6CameraSettled(page){
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const start=performance.now();let last=null,stable=0;
    function sample(){
      const c=window.__DRIFT__?.capturePlace()?.camera,key=c?[c.x,c.y,c.z,c.rot].map(v=>v.toFixed(2)).join():null;
      stable=key&&key===last?stable+1:0;last=key;
      if(stable>=10)return resolve();
      if(performance.now()-start>12000)return reject(new Error('sky camera did not settle'));
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }));
}
async function g6PanStarNearRail(page,spec){
  const observations=[];
  for(let attempt=0;attempt<16;attempt++){
    await g6CameraSettled(page);await delay(320);
    const probe=await g6StarProbe(page,spec);observations.push(probe);
    if(!probe.found||!probe.place)return {reached:false,observations};
    const target={x:42,y:(probe.rail.top+probe.rail.bottom)/2};
    if(Math.abs(probe.anchor.x-target.x)<=10&&Math.abs(probe.anchor.y-target.y)<=60)return {reached:true,target,observations,probe};
    const p=await g6SkyPoint(page);if(!p)return {reached:false,observations,error:'no unobstructed native pan start'};
    // A native water drag also imparts momentum. Moving the entire error in one
    // fast gesture overshoots and oscillates; approach the measured target with
    // bounded smaller drags, retaining the same admission and tap hit checks.
    const step=(delta,tolerance)=>Math.abs(delta)<=tolerance?0:Math.sign(delta)*Math.min(75,Math.max(12,Math.abs(delta)*.35));
    const dx=step(target.x-probe.anchor.x,10),dy=step(target.y-probe.anchor.y,60),end={x:Math.max(8,p.x+dx),y:p.y+dy};
    probe.panInput={from:p,to:end,terminalMotion:.25};
    await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:15});
    // End with a real small reversal while still pressed, rather than release
    // the last large movement as a flick. The minimum displacement crosses the
    // actual water pan's 8px admission threshold; no camera state is assigned.
    await page.mouse.move(end.x+.25,end.y);await page.mouse.move(end.x,end.y);await page.mouse.up();
  }
  return {reached:false,observations};
}
async function g6StarNearRail(page,{emit,star}){
  let spec;
  if(star==='article'){await g6SkyHome(page);spec={articleId:G6_ORIGIN.passage};}
  else{
    const home=await g6OpenOrigin(page,'touch');
    await stage(page,page.locator(`#reader .tok[data-index="${home.origin.index}"]`));await page.locator('#mini-take').tap();
    await waitForAppRecord(page,r=>r.taken.some(n=>n.t==='word'&&n.id===G6_ORIGIN.word));
    await page.keyboard.press('Escape');await leaveStage(page);
    for(const [from,to]of [['article','shelf'],['shelf','sky']]){const moved=await g6Move(page,{from,to,home,modality:'touch'});assert(moved.ok,JSON.stringify(moved.observed));}
    await page.waitForFunction(id=>[...document.querySelectorAll('#drift-layer .scale-star-kept')].some(n=>JSON.parse(n.dataset.keptKey)[0]===id),G6_ORIGIN.word,{timeout:10000});
    spec={keptWord:G6_ORIGIN.word};
  }
  await page.waitForFunction(()=>window.__DRIFT__?.canNavigate()===true&&document.querySelector('#drift-layer')?.dataset.recordState==='active');
  const pan=await g6PanStarNearRail(page,spec);let probe=pan.probe;
  const admitted=pan.reached&&probe.rail.visible&&probe.rail.width>=40&&probe.anchor.x>=30&&probe.anchor.x<=probe.rail.right+6&&
    probe.anchor.y>=probe.rail.top+22&&probe.anchor.y<=probe.rail.bottom-22;
  emit('rail.admission','native pans place the star world anchor beside the visible level rail',admitted,{label:'native mouse pans; no camera setter',spec,pan});
  assert(admitted,'near-rail geometry was not reached; no clear-target claim');
  emit('rail.clear','the star stays outside the hot level-rail envelope and its full-height reserved column, and owns its own center',!probe.hidden&&!probe.intersects&&!probe.columnIntersects&&probe.hit&&probe.placement!=='blocked',{probe});
  const starSelector=spec.articleId?`.scale-star-article[data-article-id=${JSON.stringify(spec.articleId)}]`:`.scale-star-kept[data-kept-key=${JSON.stringify(probe.identity.keptKey)}]`;
  const starNode=page.locator(`#drift-layer ${starSelector}`),occurrence=await starNode.elementHandle();
  assert(occurrence&&await occurrence.evaluate(n=>n.isConnected),'the exact admitted star remains connected');
  const tab=await g6TabReach(page,starNode);assert(tab.found,'the admitted star is natively reachable by Tab');
  const viewport=page.viewportSize(),resizes=[];
  for(const height of [700,viewport.height]){
    await page.setViewportSize({...viewport,height});
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    const resized=await g6StarProbe(page,spec),same=await occurrence.evaluate((n,selector)=>n.isConnected&&n===document.querySelector(selector)&&document.activeElement===n,`#drift-layer ${starSelector}`);
    resizes.push({height,same,probe:resized});
  }
  emit('rail.resize-identity','native viewport resizing retains the focused exact star, keeps its hit center, and never moves it into the full-height rail column',
    resizes.every(row=>row.same&&row.probe.hit&&!row.probe.hidden&&!row.probe.columnIntersects&&JSON.stringify(row.probe.identity)===JSON.stringify(probe.identity)),{tab,resizes,identity:probe.identity});
  probe=await g6StarProbe(page,spec);
  const record=await readAppRecordSnapshot(page),place=probe.place,level=probe.rail.level;
  await page.touchscreen.tap(probe.center.x,probe.center.y);
  let reached=true;
  try{
    if(star==='article')await page.waitForFunction(()=>document.body.dataset.view==='shelf',null,{timeout:5000});
    else await page.locator(`#sheet[data-node="word:${G6_ORIGIN.word}"]`).waitFor({timeout:5000});
  }catch(error){if(error.name!=='TimeoutError')throw error;reached=false;}
  const landed=await page.evaluate(()=>{const lvl=document.querySelector('#drift-layer #lvl');return {view:document.body.dataset.view,sheet:document.getElementById('sheet')?.dataset.node||null,level:lvl?.getAttribute('aria-valuenow')??null,hot:!!lvl?.classList.contains('hot')};});
  emit('rail.destination','one native tap opens the star destination without touching the level rail',reached&&landed.level===level&&!landed.hot,{star,landed,level});
  if(star==='article')await g6Activate(page,page.locator(`${G6_RAIL}[data-scale="shelf"] button[data-scale-out]`),'touch');
  else{if(reached)await pageSettled(page);await page.locator('#sheet-back').tap();await bare(page);}
  await page.waitForFunction(()=>document.body.dataset.view==='drift'&&!document.getElementById('sheet')&&window.__DRIFT__?.canNavigate()===true,null,{timeout:5000});
  await g6CameraSettled(page);
  const returned=await page.evaluate(()=>({place:window.__DRIFT__?.capturePlace(),level:document.querySelector('#drift-layer #lvl')?.getAttribute('aria-valuenow')??null}));
  const same=!!returned.place&&['x','y','z','rot'].every(k=>Math.abs(returned.place.camera[k]-place.camera[k])<=.5)&&['scopeId','generation','sceneGeneration','path'].every(k=>returned.place[k]===place[k]);
  emit('rail.inverse','the native inverse returns to the exact prior sky place and level',same&&returned.level===level,{place,returned,level});
  const after=await readAppRecordSnapshot(page);
  emit('rail.no-record-write','near-rail star travel makes no learner-record revision or data change',record.revision===after.revision&&JSON.stringify(record.record)===JSON.stringify(after.record),{beforeRevision:record.revision,afterRevision:after.revision});
}
// G6 regression: a real dictionary preparation must not outlive its source layer.
// Only the request is delayed; all navigation uses existing public controls.
async function g6PendingWordMenu(page,{context,emit}){
  const requests=[],finished=[];
  let phase='boot',releaseRequest,released=false;
  const gate=new Promise(resolve=>{releaseRequest=resolve;});
  const release=()=>{if(!released){released=true;releaseRequest();}};
  const isIndex=url=>new URL(url).pathname.endsWith('/data/share_alike/dict-v2/index.json');
  const onFinished=request=>{if(isIndex(request.url()))finished.push({url:request.url(),phase,time:Date.now()});};
  const hold=async route=>{
    const row={url:route.request().url(),phase,startedAt:Date.now(),releasedAt:null};requests.push(row);
    await gate;row.releasedAt=Date.now();await route.continue();
  };
  context.on('requestfinished',onFinished);
  await context.route('**/data/share_alike/dict-v2/index.json',hold);
  try{
    await openStory(page);
    const word=page.locator('.reader-card h1 .japanese-lookup-word').filter({hasText:/\p{Script=Han}/u}).first();
    await word.waitFor();await word.scrollIntoViewIfNeeded();
    const anchor=await word.elementHandle();
    const sourceFacts=()=>anchor.evaluate(n=>({
      text:n.dataset.lookupText,connected:n.isConnected,inert:!!n.closest('[inert]'),hidden:!!n.closest('[aria-hidden="true"]'),
      view:document.body.dataset.view,sheet:document.querySelector('#sheet')?.dataset.node||null,
      title:document.querySelector('.reader-card h1')?.textContent||null,
      sentence:document.querySelector('#sheet .sent-reader')?.textContent||null,
    }));
    const before=await sourceFacts();
    // openStory's 900ms wait can meet the reader's 900ms bookmark debounce.
    // Observe its durable completion before claiming this menu wrote no record.
    const bookmarkPosition=await page.evaluate(()=>Math.round(scrollY));
    const recordBefore=await waitForAppRecord(page,record=>record.readerPos?.[STORY.id]===bookmarkPosition,{description:'native title-scroll bookmark committed before menu'});
    assert.equal(await page.evaluate(()=>Math.round(scrollY)),bookmarkPosition,'reader stays at its observed bookmark before menu');
    assert.equal(requests.length,0,'the controlled dictionary request must originate in the native menu action');
    phase='menu-prepare';await word.click({button:'right'});
    const deadline=Date.now()+7000;while(!requests.length&&Date.now()<deadline)await delay(25);
    const pending=requests.length===1&&requests[0].phase==='menu-prepare'&&!released&&await page.locator('#reader-word-menu').count()===0;
    emit('menu.pending-real-request','native word menu awaits its own real dictionary request',pending,{before,requests:structuredClone(requests),released});
    assert(pending,'the real menu preparation must be pending before navigation');
    phase='scale-move';
    const inward=page.locator('#app > .scale-thread[data-scale="article"] [data-scale-in]');
    assert.equal(await inward.count(),1,'one existing article-to-sentence control');
    await inward.click();await page.locator('#sheet[data-node^="sent:"]').waitFor();
    const afterMove=await sourceFacts(),moveScale=await g6ScaleFacts(page);
    const retained=afterMove.connected&&afterMove.inert&&afterMove.hidden&&afterMove.text===before.text&&moveScale.scale==='sentence'&&moveScale.active.id==='sheet-back'&&!moveScale.active.inert&&moveScale.active.visible;
    emit('menu.source-retained','scale move retains the actual inactive source and focuses its sentence',retained,{before,afterMove,moveScale});
    assert(retained,'fixture must retain the actual source under the active sentence layer');
    assert.equal(await page.locator('#reader-word-menu').count(),0);
    // Passive observation also catches a briefly mounted menu; it never alters focus or application state.
    await page.evaluate(()=>{
      const witness={mounted:[],focused:[]};
      const observer=new MutationObserver(records=>{
        for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){
          const menus=[...(node.matches('#reader-word-menu')?[node]:[]),...node.querySelectorAll('#reader-word-menu')];
          for(const menu of menus)witness.mounted.push({time:performance.now(),text:menu.textContent});
        }
      });
      observer.observe(document.body,{childList:true,subtree:true});
      const focus=event=>{if(event.target.closest?.('#reader-word-menu'))witness.focused.push({time:performance.now(),id:event.target.id});};
      document.addEventListener('focusin',focus,true);
      window.__g6PendingMenuWitness={witness,stop:()=>{observer.disconnect();document.removeEventListener('focusin',focus,true);}};
    });
    phase='release';release();
    const finishDeadline=Date.now()+10000;while(!finished.length&&Date.now()<finishDeadline)await delay(25);
    assert.equal(finished.length,1,'the held real dictionary response must finish');
    await page.waitForFunction(()=>window.__KAIRO_DICTIONARY_PERF__?.entries>0,null,{timeout:10000});
    const observationStartedAt=Date.now();await delay(8000);
    const afterRelease=await sourceFacts(),releaseScale=await g6ScaleFacts(page),recordAfter=await readAppRecord(page);
    const witness=await page.evaluate(()=>{const state=window.__g6PendingMenuWitness;state.stop();return state.witness;});
    const menus=await page.locator('body > #reader-word-menu').count();
    emit('menu.no-late-menu','completed dictionary preparation never mounts a menu over the new layer',menus===0&&witness.mounted.length===0,{menus,witness,requests,finished,observationStartedAt,observationEndedAt:Date.now()});
    const focus=releaseScale.active;
    emit('menu.no-late-focus','late preparation cannot steal focus from the current sentence control',witness.focused.length===0&&focus.id===moveScale.active.id&&focus.tag===moveScale.active.tag&&focus.connected&&!focus.inert&&focus.visible&&!focus.body,{before:moveScale.active,after:focus,lateMenuFocus:witness.focused});
    emit('menu.source-unchanged','the exact connected source and sentence remain unchanged',JSON.stringify(afterMove)===JSON.stringify(afterRelease)&&releaseScale.scale===moveScale.scale&&releaseScale.node===moveScale.node&&releaseScale.passage===moveScale.passage&&releaseScale.stamp===moveScale.stamp,{afterMove,afterRelease,moveScale,releaseScale});
    emit('menu.no-record-work','opening, navigating away and cancelling pending preparation write no record',JSON.stringify(recordBefore)===JSON.stringify(recordAfter),{before:recordBefore,after:recordAfter});
  }finally{
    release();context.off('requestfinished',onFinished);
    await page.evaluate(()=>window.__g6PendingMenuWitness?.stop()).catch(()=>{});
    await context.unroute('**/data/share_alike/dict-v2/index.json',hold);
  }
}

async function g6PendingMenuCancel(page,{context,emit,kind}){
  const requests=[],finished=[];
  let phase='boot',releaseRequest,released=false;
  const gate=new Promise(resolve=>{releaseRequest=resolve;});
  const release=()=>{if(!released){released=true;releaseRequest();}};
  const isIndex=url=>new URL(url).pathname.endsWith('/data/share_alike/dict-v2/index.json');
  const onFinished=request=>{if(isIndex(request.url()))finished.push({url:request.url(),phase,time:Date.now()});};
  const hold=async route=>{
    const row={url:route.request().url(),phase,startedAt:Date.now(),releasedAt:null};requests.push(row);
    await gate;row.releasedAt=Date.now();await route.continue();
  };
  context.on('requestfinished',onFinished);
  await context.route('**/data/share_alike/dict-v2/index.json',hold);
  try{
    await openStory(page);
    const words=page.locator('.reader-card h1 .japanese-lookup-word').filter({hasText:/\p{Script=Han}/u});
    const first=words.first();await first.waitFor();await first.scrollIntoViewIfNeeded();
    const anchor=await first.elementHandle();
    let other=null;
    if(kind==='overlap'){
      const texts=await words.evaluateAll(nodes=>nodes.map(n=>n.dataset.lookupText));
      const at=texts.findIndex((text,i)=>i>0&&!text.includes(texts[0])&&!texts[0].includes(text));
      assert(at>0,'two distinct real title lookup words');
      other=await words.nth(at).elementHandle();
    }
    let keyboardFocus=null;
    if(kind==='escape'){
      const block=first.locator('xpath=ancestor::*[@data-prose-roving][1]');
      const at=await anchor.evaluate(n=>{const block=n.closest('[data-prose-roving]');return block?[...block.querySelectorAll('.japanese-lookup-word')].filter(w=>w.closest('[data-prose-roving]')===block).indexOf(n):-1;});
      assert(at>=0&&await block.evaluate(n=>n.tabIndex===0&&!n.closest('[inert],[aria-hidden="true"]')),'the title word has an exposed native paragraph Tab stop');
      keyboardFocus=await g6TabReach(page,block);
      assert(keyboardFocus.found,'native Tab reaches the actual title paragraph');
      await page.keyboard.press('Home');
      for(let i=0;i<at;i++)await page.keyboard.press('ArrowRight');
      assert(await anchor.evaluate(n=>n.isConnected&&document.activeElement===n),'native rover keys focus the exact title word before menu preparation');
    }
    const bookmarkPosition=await page.evaluate(()=>Math.round(scrollY));
    const recordBefore=await waitForAppRecord(page,record=>record.readerPos?.[STORY.id]===bookmarkPosition,{description:'native title-scroll bookmark committed before menu'});
    assert.equal(requests.length,0,'the controlled dictionary request must originate in the native menu action');
    const sourceFacts=()=>anchor.evaluate(n=>({text:n.dataset.lookupText,connected:n.isConnected,inert:!!n.closest('[inert]'),
      view:document.body.dataset.view,sheet:document.querySelector('#sheet')?.dataset.node||null,scrollY:Math.round(scrollY),focused:document.activeElement===n}));
    const focusFacts=()=>page.evaluate(()=>{const n=document.activeElement;return {tag:n?.tagName||null,id:n?.id||null,text:n?.dataset?.lookupText||null,
      className:String(n?.className||''),body:n===document.body,inMenu:!!n?.closest?.('#reader-word-menu'),connected:!!n?.isConnected};});
    const before=await sourceFacts();
    phase='menu-prepare';
    if(kind==='escape')await page.keyboard.press('Shift+F10');
    else await anchor.click({button:'right'});
    const deadline=Date.now()+7000;while(!requests.length&&Date.now()<deadline)await delay(25);
    if(other){await other.click({button:'right'});await delay(150);}
    const pending=requests.length>=1&&requests.every(row=>row.phase==='menu-prepare')&&!released&&await page.locator('#reader-word-menu').count()===0;
    emit('menu.pending-held','the native word menu awaits its own held real dictionary request',pending,{kind,before,keyboardFocus,requests:structuredClone(requests),released});
    assert(pending,'the real menu preparation must be pending before its cancellation');
    await page.evaluate(()=>{
      const witness={mounted:[],focused:[]};
      const observer=new MutationObserver(records=>{
        for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){
          const menus=[...(node.matches('#reader-word-menu')?[node]:[]),...node.querySelectorAll('#reader-word-menu')];
          for(const menu of menus)witness.mounted.push({time:performance.now(),label:menu.getAttribute('aria-label')||'',text:menu.textContent});
        }
      });
      observer.observe(document.body,{childList:true,subtree:true});
      const focus=event=>{if(event.target.closest?.('#reader-word-menu'))witness.focused.push({time:performance.now(),id:event.target.id});};
      document.addEventListener('focusin',focus,true);
      window.__g6MenuCancelWitness={witness,stop:()=>{observer.disconnect();document.removeEventListener('focusin',focus,true);}};
    });
    phase='cancel';
    let outside=null;
    if(kind==='escape')await page.keyboard.press('Escape');
    else if(kind==='outside'){
      outside=await page.evaluate(()=>{
        for(const y of [420,520,320,620])for(const x of [24,40,12]){
          const n=document.elementFromPoint(x,y);
          if(n&&!n.closest('button,a,input,textarea,select,summary,[role="button"],[tabindex],.tok,.japanese-lookup-word,#reader-word-menu,.scale-thread'))
            return {x,y,tag:n.tagName,id:n.id,className:String(n.className||'')};
        }
        return null;
      });
      assert(outside,'an actual non-control point in the same reader room');
      await page.mouse.click(outside.x,outside.y);
    }else if(kind==='room'){
      const back=page.locator('#back');assert.equal(await back.count(),1,'the room chrome Back control');
      await back.click();await page.waitForFunction(()=>document.body.dataset.view==='shelf');
    }
    const cancelled=await sourceFacts(),cancelledFocus=await focusFacts();
    phase='release';release();
    const finishDeadline=Date.now()+10000;while(!finished.length&&Date.now()<finishDeadline)await delay(25);
    assert(finished.length>=1,'the held real dictionary response must finish');
    await page.waitForFunction(()=>window.__KAIRO_DICTIONARY_PERF__?.entries>0,null,{timeout:10000});
    await delay(kind==='overlap'?1500:8000);
    const afterRelease=await sourceFacts(),afterFocus=await focusFacts();
    const witness=await page.evaluate(()=>{const state=window.__g6MenuCancelWitness;state.stop();return state.witness;});
    const menus=await page.locator('body > #reader-word-menu').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')||''));
    if(kind==='overlap'){
      const otherText=await other.evaluate(n=>n.dataset.lookupText);
      const newest=menus.length===1&&witness.mounted.length===1&&menus[0].includes(otherText)&&!menus[0].includes(before.text);
      emit('menu.newest-only','overlapping preparations mount only the newest request, never the superseded word',newest,{menus,witness,first:before.text,other:otherText,requests,finished});
      await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('reader-word-menu'));
    }else{
      const sameRoom=kind!=='room'?cancelled.view==='reader'&&cancelled.connected&&!cancelled.inert&&cancelled.scrollY===before.scrollY&&(kind!=='escape'||cancelled.focused):cancelled.view==='shelf';
      emit('menu.cancel-state',kind==='escape'?'Escape retires the pending menu and leaves focus on its word':kind==='outside'?'an outside press retires the pending menu in the same room':'ordinary room navigation retires the pending menu',
        sameRoom,{kind,before,cancelled,cancelledFocus,outside});
      emit('menu.no-late-menu','the completed preparation never mounts a cancelled menu',menus.length===0&&witness.mounted.length===0,{menus,witness,requests,finished});
      emit('menu.no-late-focus','the completed preparation cannot take focus',witness.focused.length===0&&!afterFocus.inMenu&&JSON.stringify(afterFocus)===JSON.stringify(cancelledFocus),{cancelledFocus,afterFocus,witness});
      emit('menu.source-unchanged','the source word, room and scroll stay as the cancellation left them',JSON.stringify(afterRelease)===JSON.stringify(cancelled),{cancelled,afterRelease});
    }
    const recordAfter=await readAppRecord(page);
    emit('menu.no-record-work','opening and cancelling the pending menu write no record',JSON.stringify(recordBefore)===JSON.stringify(recordAfter),{before:recordBefore,after:recordAfter});
  }finally{
    release();context.off('requestfinished',onFinished);
    await page.evaluate(()=>window.__g6MenuCancelWitness?.stop()).catch(()=>{});
    await context.unroute('**/data/share_alike/dict-v2/index.json',hold);
  }
}
async function g6SourcelessParticle(page,{modality,emit}){
  const home=await g6OpenOrigin(page,modality),end=Number(home.range[1]);
  const index=await page.evaluate(end=>{const n=[...document.querySelectorAll('#reader .tok.particle[data-index][data-para]')].find(n=>Number(n.dataset.index)>=end);return n?Number(n.dataset.index):null;},end);
  assert(Number.isInteger(index),'an actual reader particle outside the retained source sentence');
  const token=page.locator(`#reader .tok.particle[data-index="${index}"]`);
  await token.scrollIntoViewIfNeeded();await delay(300);
  if(modality==='touch'){await stage(page,token);await g6Activate(page,page.locator('#mini .mini-word'),'touch');}
  else{await focusWord(page,token);await page.keyboard.press('Control+Enter');}
  await pageSettled(page);
  const opened=await g6ScaleFacts(page),scales=opened.beads.map(b=>b.scale);
  emit('particle.no-sentence-bead','a source-less particle page never gains the retained older sentence',
    opened.node?.startsWith('particle:')&&scales.includes('article')&&!scales.includes('sentence')&&opened.tokenIndex===String(home.origin.index),
    {index,origin:home.origin.index,range:home.range,opened});
  const control=page.locator(`${G6_RAIL} button[data-scale-bead="article"]`);
  if(modality==='keyboard')assert((await g6TabReach(page,control)).found,'article bead is reachable in native Tab order');
  await g6Activate(page,control,modality);
  await page.waitForFunction(()=>!document.getElementById('sheet'),null,{timeout:5000});await bare(page);
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const landed=await page.evaluate(({index,origin})=>{
    const token=document.querySelector(`#reader .tok[data-index="${index}"]`),old=document.querySelector(`#reader .tok[data-index="${origin}"]`),box=token?.getBoundingClientRect();
    return {view:document.body.dataset.view,sheet:!!document.getElementById('sheet'),focusedParticle:document.activeElement===token,focusedOrigin:document.activeElement===old,
      visible:!!box&&box.bottom>0&&box.top<innerHeight,returnIndex:document.querySelector('#reader')?.dataset.scaleReturnIndex??null,scrollY};
  },{index,origin:home.origin.index});
  emit('particle.article-return','the article bead returns to the particle that opened the page, never the retained older line',
    landed.view==='reader'&&!landed.sheet&&landed.focusedParticle&&!landed.focusedOrigin&&landed.visible&&landed.returnIndex!==String(home.origin.index),{index,origin:home.origin.index,landed});
  emit('particle.no-record-work','particle travel creates no saved card or grade work',JSON.stringify(home.learning)===JSON.stringify(g6Learning(await readAppRecord(page))));
}
async function g6ArchiveShelf(page,{emit}){
  await page.goto(`${host.origin}/index.html?entry=drift&room=shelf&ui=bi`);
  await page.waitForFunction(()=>document.body.dataset.ready==='1',null,{timeout:30000});
  const learning=g6Learning(await readAppRecord(page));
  const link=page.locator('#archive-link');await link.scrollIntoViewIfNeeded();await link.tap();
  await page.locator('.archive-year').first().waitFor({timeout:15000});
  const year=await page.evaluate(()=>{const toggles=[...document.querySelectorAll('.archive-year')];const count=t=>Number((t.textContent.match(/·\s*([0-9]+)/u)||[0,0])[1]);
    return toggles.reduce((best,t)=>count(t)>count(best)?t:best,toggles[0]).dataset.year;});
  await page.locator(`.archive-year[data-year="${year}"]`).tap();
  await page.locator('.archive-row').first().waitFor();
  const archiveFacts=()=>page.evaluate(()=>({view:document.body.dataset.view,scrollY:Math.round(scrollY),
    expanded:[...document.querySelectorAll('.archive-year[aria-expanded="true"]')].map(n=>n.dataset.year),
    focus:(()=>{const n=document.activeElement,r=n?.getBoundingClientRect();return {tag:n?.tagName||null,body:n===document.body,connected:!!n?.isConnected,
      visible:!!r?.width&&!!r?.height&&r.bottom>0&&r.top<innerHeight&&!n.closest('[inert],[aria-hidden="true"]')};})()}));
  const rows=page.locator('.archive-row');
  const row=rows.nth(Math.min(12,await rows.count()-1));await row.scrollIntoViewIfNeeded();await delay(300);
  const archive=await archiveFacts(),id=await row.getAttribute('data-passage');
  assert(archive.view==='archive'&&archive.scrollY>0&&archive.expanded.includes(year),`an expanded year at a nonzero archive scroll: ${JSON.stringify(archive)}`);
  const openRow=async()=>{
    await page.locator(`.archive-row[data-passage=${JSON.stringify(id)}]`).tap();
    await page.waitForFunction(id=>document.body.dataset.view==='reader'&&document.querySelector('.listen-row')?.dataset.passage===id&&!!document.querySelector('#reader .tok.content[data-index][data-para]'),id,{timeout:20000});
    await delay(600);
  };
  await openRow();
  const index=await page.evaluate(()=>{const n=[...document.querySelectorAll('#reader .tok.content[data-index][data-para]')].find(n=>{const r=n.getBoundingClientRect();return r.top>140&&r.bottom<innerHeight-160&&!n.classList.contains('particle');});return n?Number(n.dataset.index):null;});
  assert(Number.isInteger(index),'an actual visible archive word');
  const word=page.locator(`#reader .tok[data-index="${index}"]`);
  const openPage=async()=>{await stage(page,word);await page.locator('#mini .mini-word').tap();await pageSettled(page);assert((await page.locator('#sheet').getAttribute('data-node'))?.startsWith('word:'));};
  await openPage();await page.locator('#sheet-back').tap();await bare(page);await leaveStage(page);
  const origin=await g6OriginFacts(page,index);
  await page.locator('#back').tap();
  await page.waitForFunction(()=>['archive','shelf'].includes(document.body.dataset.view));await delay(300);
  const back=await archiveFacts();
  emit('archive.back','ordinary Back from an archive article returns to its expanded year list at the same scroll',
    back.view==='archive'&&back.scrollY===archive.scrollY&&back.expanded.includes(year)&&back.focus.connected&&back.focus.visible&&!back.focus.body,{archive,back,id,index});
  await openRow();
  let returned=true;
  try{await page.waitForFunction(index=>document.querySelector('#reader')?.dataset.scaleReturnIndex===String(index),index,{timeout:5000});}catch(error){if(error.name!=='TimeoutError')throw error;returned=false;}
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const reopened=await g6OriginFacts(page,index);
  emit('archive.reopen-line','the archive row reopens the same archive occurrence within4px',returned&&reopened.focused&&Math.abs(reopened.top-origin.top)<=4,{origin,reopened,returned});
  await openPage();
  await page.locator(`${G6_RAIL} button[data-scale-bead="shelf"]`).tap();
  await page.waitForFunction(()=>['archive','shelf'].includes(document.body.dataset.view)&&!document.getElementById('sheet'));await delay(300);
  const bead=await archiveFacts();
  emit('archive.shelf-bead','the shelf bead of an archive word page lands on its year list at the same scroll',
    bead.view==='archive'&&bead.scrollY===archive.scrollY&&bead.expanded.includes(year),{archive,bead});
  await page.locator(`${G6_RAIL}[data-scale="shelf"] button[data-scale-out]`).tap();
  await page.waitForFunction(()=>document.body.dataset.view==='drift');
  await page.waitForFunction(()=>window.__DRIFT__?.canNavigate()===true);
  await page.locator(`${G6_RAIL}[data-scale="sky"] button[data-scale-in]`).tap();
  await page.waitForFunction(()=>['archive','shelf'].includes(document.body.dataset.view));await delay(300);
  const inward=await archiveFacts();
  emit('archive.sky-inward','archive → sky → inward returns to the archive year list at its scroll',inward.view==='archive'&&inward.scrollY===archive.scrollY&&inward.expanded.includes(year),{archive,inward});
  await page.locator(`${G6_RAIL}[data-scale="shelf"] button[data-scale-in]`).tap();
  let skyReturned=true;
  try{await page.waitForFunction(index=>document.body.dataset.view==='reader'&&document.querySelector('#reader')?.dataset.scaleReturnIndex===String(index),index,{timeout:8000});}catch(error){if(error.name!=='TimeoutError')throw error;skyReturned=false;}
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const article=await g6OriginFacts(page,index),passage=await page.evaluate(()=>document.querySelector('.listen-row')?.dataset.passage||null);
  emit('archive.sky-return-line','the next inward step returns the same archive article and occurrence within4px',skyReturned&&passage===id&&article.focused&&Math.abs(article.top-origin.top)<=4,{origin,article,passage,id});
  await page.locator('#back').tap();await page.waitForFunction(()=>['archive','shelf'].includes(document.body.dataset.view));await delay(300);
  const again=await archiveFacts();
  await page.locator('#back').tap();await page.waitForFunction(()=>document.body.dataset.view!=='archive');await delay(300);
  const curated=await archiveFacts();
  emit('archive.back-to-shelf','Back from the archive itself still reaches the curated shelf',again.view==='archive'&&curated.view==='shelf',{again,curated});
  emit('archive.no-record-work','archive scale travel creates no saved card or grade work',JSON.stringify(learning)===JSON.stringify(g6Learning(await readAppRecord(page))));
}
async function g6ReadOnBookmark(page,{modality,emit}){
  const home=await g6OpenOrigin(page,modality);
  const native=modality==='touch'&&engine==='chromium'?'touch-drag':'PageDown';
  const start=await page.evaluate(()=>Math.round(scrollY));
  const gestures=[];
  const settleReading=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const begun=performance.now();let last=scrollY,stable=0;
    const sample=()=>{stable=Math.abs(scrollY-last)<.1?stable+1:0;last=scrollY;if(stable>=8)return resolve();if(performance.now()-begun>4000)return reject(new Error('native reading scroll did not settle'));requestAnimationFrame(sample);};requestAnimationFrame(sample);}));
  if(native==='PageDown')for(let n=0;n<4&&await page.evaluate(()=>Math.round(scrollY))-start<=900;n++){await page.keyboard.press('PageDown');await delay(400);}
  else{
    const cdp=await page.context().newCDPSession(page);
    try{for(let n=0;n<3&&await page.evaluate(()=>Math.round(scrollY))-start<=900;n++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:700,radiusX:3,radiusY:3,force:1}]});
      for(let y=660;y>=180;y-=40){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:195,y,radiusX:3,radiusY:3,force:1}]});await delay(16);}
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settleReading();
      gestures.push({number:n+1,scrollY:await page.evaluate(()=>Math.round(scrollY))});
    }}finally{await cdp.detach();}
  }
  await settleReading();
  const reading=await page.evaluate(origin=>{
    const tokens=[...document.querySelectorAll('#reader .tok[data-index][data-para]')],old=document.querySelector(`#reader .tok[data-index="${origin}"]`).getBoundingClientRect();
    const tops=Object.fromEntries(tokens.filter(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight;}).map(n=>[n.dataset.index,n.getBoundingClientRect().top]));
    return {scrollY:Math.round(scrollY),originVisible:old.bottom>0&&old.top<innerHeight,tops};
  },home.origin.index);
  const bookmark=await waitForAppRecord(page,record=>record.readerPos?.[STORY.id]===reading.scrollY,{description:'durable bookmark at the read-farther line'}).then(()=>true,()=>false);
  await delay(300);
  emit('readon.read-farther','native reading moves past the retained line and commits its durable bookmark',
    reading.scrollY-start>844&&!reading.originVisible&&Object.keys(reading.tops).length>0&&bookmark,{native,start,gestures,reading:{...reading,tops:Object.keys(reading.tops).length},bookmark,origin:home.origin.index});
  const back=page.locator('#back');
  if(modality==='keyboard'){assert((await g6TabReach(page,back)).found,'room Back is reachable in native Tab order');await page.keyboard.press('Enter');}
  else await back.tap();
  await page.waitForFunction(()=>document.body.dataset.view==='shelf');await delay(300);
  const shelf=await g6ScaleFacts(page),recaptured=shelf.tokenIndex;
  emit('readon.exit-recaptured','the next exit retains the newer visible line, not the read-past origin',
    recaptured!==null&&recaptured!==String(home.origin.index)&&Object.hasOwn(reading.tops,recaptured)&&Number(recaptured)>=Number(home.range[1]),{recaptured,origin:home.origin.index,range:home.range,shelf});
  const card=page.locator(`[data-passage="${G6_ORIGIN.passage}"]:not([data-recommendation]) .shelf-open`).first();
  if(modality==='keyboard'){assert((await g6TabReach(page,card)).found,'shelf card is reachable in native Tab order');await page.keyboard.press('Enter');}
  else await card.tap();
  let returned=true;
  try{await page.waitForFunction(index=>document.body.dataset.view==='reader'&&document.querySelector('#reader')?.dataset.scaleReturnIndex===index,recaptured,{timeout:8000});}catch(error){if(error.name!=='TimeoutError')throw error;returned=false;}
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const landed=recaptured!==null?await g6OriginFacts(page,Number(recaptured)):null;
  const delta=landed?Math.abs(landed.top-reading.tops[recaptured]):null;
  emit('readon.reopen-line','reopening lands on that newer line within4px, focused',returned&&!!landed?.focused&&landed.scrollY>0&&delta<=4,{recaptured,landed,delta,returned,
    returnIndex:await page.evaluate(()=>document.querySelector('#reader')?.dataset.scaleReturnIndex??null)});
  emit('readon.no-record-work','reading on and reopening create no saved card or grade work',JSON.stringify(home.learning)===JSON.stringify(g6Learning(await readAppRecord(page))));
}
const G6_KEPT_IDS=Object.freeze(['kept.identity','kept.native-door','kept.source-provenance','kept.no-record-write','kept.list-only','kept.removed']);
async function g6FreshProvenance(page,row,record){
  const sheet=page.locator(`#sheet[data-node="word:${G6_ORIGIN.word}"]`);
  const counts={sheets:await sheet.count(),details:await sheet.locator('details.learning-source').count(),door:await sheet.locator('#learning-source-return').count()};
  const markers=await page.evaluate(()=>({inventedSource:window.__g6InventedSource||0}));
  const ref=row?.sourceContextRef||null,label=`actual fresh Save at token${G6_ORIGIN.index}; not the historical token43 observation`;
  if(!ref)return {ok:counts.sheets===1&&counts.details===0&&counts.door===0,branch:'no-ref',counts,row,markers,label};
  const entry=record.teacherContexts?.entries?.find(item=>item.id===ref)||null;
  if(!entry)return {ok:false,branch:'dangling-ref',counts,row,ref,markers,label};
  const path=`data/articles/${G6_ORIGIN.passage.replace(/:/gu,'-')}.json`,bytes=readFileSync(resolve(site,path));
  const served=createHash('sha256').update(bytes).digest('hex')===identity.files.find(file=>file.path===path)?.sha256;
  const tokens=JSON.parse(bytes).tokens,digest=createHash('sha256').update(JSON.stringify(tokens.map(token=>token.s))).digest('hex');
  const teacher=await import(pathToFileURL(resolve(site,'teacher-context.mjs')).href);
  let verified;
  try{verified=JSON.stringify(await teacher.verifyTeacherContext(entry))===JSON.stringify(entry);}catch{verified=false;}
  const matching=served&&verified&&entry.sourceKind==='bundled-passage'&&entry.sourceId===G6_ORIGIN.passage&&entry.index===G6_ORIGIN.index&&
    entry.sourceDigest===digest&&entry.quote===tokens.slice(entry.start,entry.end).map(token=>token.s).join('')&&entry.target?.id===G6_ORIGIN.word;
  const quote=counts.details===1?(await sheet.locator('details.learning-source .teacher-source-quote').textContent()):null;
  return {ok:matching&&counts.sheets===1&&counts.details===1&&counts.door===1&&quote===entry.quote,branch:'valid-ref',counts,row,entry,verified,served,quote,markers,label};
}

async function runG6Suite(browser){
  const results=[];
  const run=async(name,ids,body,{control=null,publish=true,init=null,viewport={width:390,height:844},mobile=true}={})=>{
    const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block'});
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
  if(!g6FramesOnly&&!g6ControlsOnly)for(const width of [320,390,430])for(const world of ['hokusai','sumi']){
    await run(`current-thread.${width}.${world}`,['current.context','current.part-route','current.part-contained','current.part-scroll-only','current.return-line','current.sky-contained','current.sky-return-line','current.no-record-work'],(page,{emit})=>g6CurrentThreadVisible(page,{emit,width,world}),{viewport:{width,height:844},init:`localStorage.setItem('kairo-theme',${JSON.stringify(world)})`});
  }
  if(!g6ControlsOnly&&!g6ThreadCurrentOnly){
    for(const modality of ['touch','keyboard']){
      await run(`${modality}.edges`,g6WalkIds(G6_EDGES,true),(page,{emit})=>g6Walk(page,{modality,itinerary:G6_EDGES,emit,timing:true}));
      if(g6FramesOnly)continue;
      await run(`${modality}.forty`,g6WalkIds(G6_FORTY,false),(page,{emit})=>g6Walk(page,{modality,itinerary:G6_FORTY,emit}));
    }
    if(!g6FramesOnly){
      await run('pending-word-menu',['menu.pending-real-request','menu.source-retained','menu.no-late-menu','menu.no-late-focus','menu.source-unchanged','menu.no-record-work'],g6PendingWordMenu,{viewport:{width:1024,height:900},mobile:false});
      for(const kind of ['escape','outside','room','overlap'])await run(`pending-word-menu.${kind}`,kind==='overlap'?['menu.pending-held','menu.newest-only','menu.no-record-work']:
        ['menu.pending-held','menu.cancel-state','menu.no-late-menu','menu.no-late-focus','menu.source-unchanged','menu.no-record-work'],(page,{context,emit})=>g6PendingMenuCancel(page,{context,emit,kind}),{viewport:{width:1024,height:900},mobile:false});
      await run('archive.shelf',['archive.back','archive.reopen-line','archive.shelf-bead','archive.sky-inward','archive.sky-return-line','archive.back-to-shelf','archive.no-record-work'],(page,{emit})=>g6ArchiveShelf(page,{emit}));
      for(const modality of ['touch','keyboard']){
        await run(`${modality}.sourceless-particle`,['particle.no-sentence-bead','particle.article-return','particle.no-record-work'],(page,{emit})=>g6SourcelessParticle(page,{modality,emit}));
        await run(`${modality}.read-on`,['readon.read-farther','readon.exit-recaptured','readon.reopen-line','readon.no-record-work'],(page,{emit})=>g6ReadOnBookmark(page,{modality,emit}));
      }
      for(const modality of ['touch','keyboard']){
        await run(`${modality}.thread`,['bead.word','bead.kanji','bead.sentence','bead.article','bead.article.line','bead.shelf','bead.shelf.line','no-record-work'],(page,{emit})=>g6ThreadAncestors(page,{modality,emit}));
        await run(`${modality}.recursion`,['recursive.current-visible','recursive.order','recursive.ancestor','recursive.no-record-work'],(page,{emit})=>g6RecursiveThread(page,{modality,emit}));
        await run(`${modality}.replacement-source`,['source.replaced'],(page,{emit})=>g6ReplacementSource(page,{modality,emit}));
        for(const kind of ['navigate',engine==='webkit'?'key':'wheel']){
          const control={engine,id:`G6.${modality}.abandoned-${kind}`,edits:G6_RETURN_FRAME_FIXTURE.edits,served:[]};
          await run(`${modality}.abandoned-${kind}`,[`abandoned.${kind}`],(page,{emit})=>g6AbandonedReturn(page,{modality,emit,kind}),{control,init:g6InstallReturnFrameFixture});
        }
      }
      await run('sky.private-keyboard', ['private.entry','private.root-focus','private.next-enter','private.source-camera','private.no-record-work'], (page,{emit})=>g6PrivateSkyKeyboardReturn(page,{emit}));
      for(const native of engine==='chromium'?[false,true]:[false]){
        for(const kind of native?['spread','third','cancel','contract']:['spread','third','cancel','foreign','contract']){
          await run(`sky.${native?'native':'handlers'}.${kind}`,[...(kind==='spread'?[]:['hand.gate']),'hand.one-edge','hand.no-record-write'],(page,{context,emit})=>g6SkyGesture(page,{context,emit,kind,native}));
        }
        await run(`sky.${native?'native':'handlers'}.stage`,['stage.blocks-sky','stage.no-record-write'],(page,{context,emit})=>g6SkyStageGate(page,{context,emit,native}));
      }
      for(const kind of ['cue','grade'])await run(`sky.pending-${kind}`,['pending.block','pending.commit','pending.resume'],(page,{context,emit})=>g6PendingGuard(page,{context,emit,kind}));
      for(const native of engine==='chromium'?[false,true]:[false]){
        const mode=native?'native':'handlers';
        await run(`sky.${mode}.lost-terminal`,native?['lost.consumed','lost.recovered','lost.no-record-write']:['lost.untrusted-drained','lost.no-record-write'],(page,{context,emit})=>g6LostTerminal(page,{context,emit,native}));
        await run(`sky.${mode}.interrupted-hold`,['hold.blur','hold.hidden','hold.no-record-write','hold.premise'],(page,{context,emit})=>g6InterruptedHold(page,{context,emit,native}));
      }
      for(const star of ['article','kept'])await run(`sky.star-rail.${star}`,['rail.admission','rail.clear','rail.resize-identity','rail.destination','rail.inverse','rail.no-record-write'],(page,{emit})=>g6StarNearRail(page,{emit,star}));
      await run('source.received-occurrence',['ordinary-no-anchor989','explicit-source2351','new-source-outward-inward2351','learning-unchanged'],(page,{emit})=>g6ReceivedSourceReturn(page,{emit}));
      await run('sky.kept-projection',[...G6_KEPT_IDS],(page,{emit})=>g6KeptProjection(page,{emit}));
      const ids=['reader.synthetic','word.synthetic','sentence.synthetic','stage.synthetic'];
      await run('text-policy',ids,async(page,{emit})=>{
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
      if((spec.engines&&!spec.engines.includes(engine))||(spec.modalities&&!spec.modalities.includes(modality)))continue;
      const ids=g6ControlIds(spec.schedule),body=(page,{context,emit})=>g6ControlSchedule(page,{context,modality,schedule:spec.schedule,emit});
      const baseline=await run(`${modality}.control-${spec.id}.positive`,ids,body,{publish:false});
      const control={engine,id:`G6.${modality}.${spec.id}`,edits:spec.edits,served:[],pageErrors:[]};
      const mutant=await run(`${modality}.control-${spec.id}.mutant`,ids,body,{control,publish:false});
      const restore=await run(`${modality}.control-${spec.id}.restore`,ids,body,{publish:false});
      const clean=baseline.rows.every(r=>r.ok),restored=restore.rows.every(r=>r.ok);
      const equal=JSON.stringify(mutant.rows.map(r=>r.id))===JSON.stringify(baseline.rows.map(r=>r.id))&&JSON.stringify(restore.rows.map(r=>r.id))===JSON.stringify(baseline.rows.map(r=>r.id));
      const target=mutant.rows.find(r=>r.id===spec.target);
      const served=spec.edits.every(edit=>control.served.some(s=>s.file===edit.file&&s.applied.some(a=>a.key===edit.key)));
      const inputIntegrity=spec.schedule==='pinch'?g6SyntheticInputIntegrity(target?.observed):spec.schedule==='native-pinch'?g6NativeInputIntegrity(target?.observed):{ok:true};
      const complete=equal&&!mutant.error&&!control.setupError&&!mutant.pageErrors.length&&!mutant.consoleErrors.length&&served&&mutant.rows.every(r=>!r.observed?.unexecuted)&&inputIntegrity.ok;
      const exercised=!spec.premise||spec.premise(baseline.rows);
      const killed=clean&&complete&&exercised&&target&&!target.ok&&spec.witness(target)&&mutant.rows.every(r=>r.id===spec.target||r.ok);
      control.verdict=!clean||!complete?'incomplete':!exercised?'not-exercised':killed?'killed':target?.ok?'survived':'contaminated';
      control.baseline=baseline.rows;control.rows=mutant.rows;control.restore=restore.rows;controls.push(control);
      check(`G6.${modality}.negative.${spec.id}`,'positive executes, exact fault fails its named assertion, and restore executes',killed&&restored,{verdict:control.verdict,clean,complete,exercised,restored,inputIntegrity,target,served,setupError:control.setupError||null});
    }
  }
  writeFileSync(resolve(evidence,`g6-${engine}.json`),JSON.stringify({site,gitSha:identity.gitSha,artifactSha256:identity.artifactSha256,verifierSha256,browserVersion:browserVersions[engine],node:process.version,
    scope:g6ThreadCurrentOnly?'G6 current-thread visibility: six width/palette native contexts only':g6FramesOnly?'G6 twelve directed edges × touch/keyboard plus per-edge frames only':g6ControlsOnly?`G6 named controls ${G6_MUTANTS.filter(spec=>!spec.engines||spec.engines.includes(engine)).map(spec=>`${spec.id} × ${(spec.modalities||['touch','keyboard']).join('/')}`).join(', ')} with positives/restores only`:'G6 directed edges, forty-step walks, exact thread ancestry, return lifecycle, sky actual-handler/native Chromium gestures, native pending records and kept membership projection; controls only when requested',
    limitations:['WebKit two-pointer witness uses synthetic PointerEvents and TouchEvents through actual handlers, not native iPhone zoom','Chromium native text pinch is trusted protocol input sampled after dispatch, not physical-phone evidence','Abandoned-return cases use one explicitly hashed served-byte scheduling seam; not untouched-candidate proof','Kept projection browser cases cover native membership revisions and retained saved identity; separate lifted-function tests cover conflicting seq/reading identities','Private sky dive routes remain covered by canonical Drift verifiers; these G6 gestures exercise surface scale admission','Lost-terminal cases create the lost owned pointer with one synthetic sky pointerdown whose terminal is deliberately omitted; recovery is proven only with trusted Chromium protocol TouchEvents, while WebKit cases prove only that untrusted lists, foreign terminals and a fresh mouse cannot release the drain','Interrupted-hold cases dispatch a synthetic window blur and a synthetic hidden visibility override, not an operating-system app switch','A lost mouse terminal is retired only by a later trusted event from that same mouse with no button down; a lost pen terminal stays draining until that pen pointer terminates','Star/level-rail cases reach near-rail geometry by native mouse pans; rail exclusion in the compact and saturated fallbacks is proven by lifted-function tests only'],results},null,2));
}


try {
  for (engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    browserVersions[engine] = browser.version();
    console.log(`${engine} ${browserVersions[engine]}`);
    if (!g3Only) await runG6Suite(browser);
    const walk = async (name, body, { viewport = { width: 390, height: 844 }, mobile = true, control = null, init = null, demo = false, phase = 'candidate' } = {}) => {
      if (g6Only && !name.startsWith('G6')) return;
      if (g3Only && !name.startsWith('G3')) return;
      if (controlsOnly && !['G3-stalled', 'G3-clear', 'G3-front', 'G3-sky-ownership'].includes(name)) return;
      if (roomsOnly && !['G3-words', 'G3-words-family', 'G3-sky', 'G3-sky-glyph', 'G3-sky-ownership', 'G3-particle'].includes(name)) return;
      if (skyOwnershipOnly && name !== 'G3-sky-ownership') return;
      if (sentencesOnly && name !== 'G3-front' && !name.startsWith('G3-sentence-')) return;
      if (kanaOnly && name !== 'G3-kana' && name !== 'G3-particle') return;
      if (skyReadingsOnly && name !== 'G3-sky-glyph' && name !== 'G3-particle') return;
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
      await context.addInitScript(GLYPHS);
      if (!demo) await context.addInitScript(() => localStorage.setItem('kairo-word-ladder-demo-v1', '1'));
      if (init) await context.addInitScript(init);
      await silenceBrowserAudio(context);
      await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
      const setup = name === 'G3-sky-ownership' ? { engine, name, phase: control ? `mutant:${control.id}` : phase,
        scope: 'Fixture-only named word/caption data; actual product mount/hit code; controlled geometry',
        edits: [skyFixtureEdit], served: [], pageErrors: [] } : null;
      if (setup) await serveMutation(context, { origin: host.origin, manifest: new Map(identity.files.map((file) => [file.path, file.sha256])), control: setup, edits: setup.edits });
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
        if (setup) {
          setup.pageErrors = errors;
          setup.complete = !setup.setupError && setup.served.length > 0 && setup.served.every((served) =>
            served.file === skyFixtureEdit.file && served.applied.length === 1 && served.applied[0].key === skyFixtureEdit.key) &&
            new Set(setup.served.map((served) => served.mutantSha256)).size === 1;
          fixtures.push(setup);
          check('G3.sky-ownership.setup', 'each served ownership fixture starts from pinned bytes and applies the same data-only setup exactly once', setup.complete, setup);
        }
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
    // A controlled CSS ownership fixture, not a natural scene/touch claim. Actual mounted nodes keep their product
    // classes, z-index, hit rules and host admission; only their transforms/order are temporarily arranged in one task.
    // 熾烈 supplies a real unhosted glyph, but no wide donor caption. Lead0235's exact absent glyphs use the separately
    // receipted corpus/caption fixture above; 筆's unmounted-ruby case remains an additional structural regression.
    const skyOwnershipProbe = async (page) => {
      const lock = async (word, kanji) => {
        await page.goto(`${host.origin}/?entry=drift&ui=bi`);
        await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.__lockWord);
        await delay(1200);
        // Materialize the exact existing cover through the installed seam. Never substitute an arbitrary word.
        const opened = await page.evaluate((w) => ({ cover: window.__lockWord('誇り'), target: window.__lockWord(w) }), word);
        assert(opened.cover && opened.target, `the exact 誇り cover and ${word} constellation must exist`);
        await page.waitForFunction((ch) => [...document.querySelectorAll('#drift-layer.active #sky > .glyph.hosted-constellation-glyph')]
          .some((node) => {
            const g = node.querySelector(':scope > .g'), copy = g?.cloneNode(true);
            copy?.querySelectorAll('rt').forEach((rt) => rt.remove());
            return copy?.textContent === ch;
          }), kanji);
        await delay(1800);
        await page.evaluate(() => document.fonts.ready.then(() => true));
      };
      const own = (kanji, { sourceWord, bare = false, captionRequired = false } = {}) => page.evaluate(async ({ kanji, sourceWord, bare, captionRequired }) => {
        // First let the app bring the exact cover into view. Locking it and a distant target in the same task leaves
        // its old world position edge-faded to zero, even if a later DOM transform puts its rectangle on the glass.
        // This bounded lifecycle wait changes no camera, opacity, display or product hit rule. Every case uses it.
        const opened = { cover: window.__lockWord('誇り'), target: false };
        const sky = document.querySelector('#drift-layer.active #sky');
        const liveCover = () => [...sky.querySelectorAll(':scope > .word.bctr')]
          .find((node) => node.querySelector('.base')?.textContent === '誇り');
        const lifecycle = { samples: [], admitted: false }, start = performance.now();
        let word = null, previous = null, stable = 0;
        while (performance.now() - start < 5000) {
          await new Promise(requestAnimationFrame);
          word = liveCover();
          const box = word?.querySelector('.base').getBoundingClientRect(), css = word && getComputedStyle(word);
          const sample = { elapsed: performance.now() - start, connected: !!word?.isConnected,
            mounted: !!word?.style.transform, opacity: css ? Number(css.opacity) : 0,
            visible: css?.display !== 'none' && css?.visibility === 'visible' && !word?.closest('[inert]'),
            box: box && { x: box.x, y: box.y, width: box.width, height: box.height },
            inView: !!box && box.width > 0 && box.height > 0 && box.left >= 64 && box.right <= innerWidth - 64 &&
              box.top >= 96 && box.bottom <= innerHeight - 96 };
          lifecycle.samples.push(sample);
          stable = sample.inView && previous && Math.abs(box.x - previous.x) < 1 && Math.abs(box.y - previous.y) < 1 ? stable + 1 : 0;
          previous = sample.box;
          if (sample.connected && sample.mounted && sample.visible && sample.opacity > 0 && stable >= 6) {
            lifecycle.admitted = true; lifecycle.elapsed = sample.elapsed; lifecycle.stableFrames = stable; break;
          }
        }
        if (!lifecycle.admitted) return { kanji, sourceWord, opened, lifecycle, controlledGeometry: true,
          admitted: false, setupError: 'exact 誇り did not become visibly mounted and settled before target admission' };
        opened.target = window.__lockWord(sourceWord);
        await new Promise(requestAnimationFrame);
        const textOf = (node) => {
          const holder = node.querySelector(':scope > .g > ruby.drift-reading') || node.querySelector(':scope > .g');
          return holder && [...holder.childNodes].find((child) => child.nodeType === Node.TEXT_NODE);
        };
        const glyph = [...sky.querySelectorAll(':scope > .glyph.hosted-constellation-glyph')].find((node) => textOf(node)?.nodeValue === kanji);
        const facts = { kanji, sourceWord, opened, lifecycle, frameBoundaryObserved: true, appTransformMounted: !!glyph?.style.transform,
          glyph: !!glyph, controlledGeometry: true, admitted: false, attempts: [],
          canonical: { has: window.__BUNKI_OPEN_SLIP.has('kanji', kanji), reading: window.__BUNKI_OPEN_SLIP.reading('kanji', kanji) } };
        if (!glyph) return facts;
        const style = (node) => getComputedStyle(node);
        if (!word?.isConnected || word.querySelector('.base')?.textContent !== '誇り')
          return { ...facts, cover: null, setupError: 'the admitted exact 誇り cover is absent; no substitute permitted' };
        const g = glyph.querySelector(':scope > .g'), caption = glyph.querySelector(':scope > small');
        const original = { glyphTransform: glyph.style.transform, wordTransform: word.style.transform,
          wordParent: word.parentNode, wordNext: word.nextSibling, children: [...g.childNodes] };
        const ruby = bare ? g.querySelector(':scope > ruby.drift-reading') : null;
        const rubyChildren = ruby ? [...ruby.childNodes] : [];
        const rect = (r) => ({ x: r.x, y: r.y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height });
        const identity = (node) => node ? { tag: node.tagName.toLowerCase(), id: node.id, classes: [...node.classList],
          ancestor: node.closest('.word,.glyph,[data-drift-chrome],#lvl,.crumb')?.outerHTML.slice(0, 300) || null } : null;
        const range = document.createRange(), coverRange = document.createRange();
        const inkRect = () => { range.selectNodeContents(textOf(glyph)); return range.getBoundingClientRect(); };
        const coverInk = () => { coverRange.selectNodeContents(word.querySelector('.base')); return coverRange.getBoundingClientRect(); };
        try {
          if (ruby) g.replaceChildren(...rubyChildren.filter((child) => child.nodeName !== 'RT'));
          sky.append(word);
          Object.assign(facts, { cover: word.querySelector('.base').textContent,
            later: !!(glyph.compareDocumentPosition(word) & Node.DOCUMENT_POSITION_FOLLOWING),
            annotated: !!g.querySelector(':scope > ruby.drift-reading'), unmountedForStructuralCase: !!ruby,
            stacked: glyph.classList.contains('center') || glyph.classList.contains('comp'),
            caption: caption?.textContent || '', captionOpacity: caption ? style(caption).opacity : null,
            glyphOpacity: Number(style(glyph).opacity), coverOpacity: Number(style(word).opacity),
            visiblyMounted: [glyph, word].every((node) => node.isConnected && node.getClientRects().length > 0 &&
              style(node).display !== 'none' && style(node).visibility === 'visible' && Number(style(node).opacity) > 0 && !node.closest('[inert]')),
            coverFree: style(word).zIndex === '1' && style(word).pointerEvents !== 'none' && style(word).visibility !== 'hidden',
            original: { glyph: rect(glyph.getBoundingClientRect()), cover: rect(word.getBoundingClientRect()) } });
          const skyBox = sky.getBoundingClientRect();
          const clip = { left: Math.max(0, skyBox.left) + 8, top: Math.max(0, skyBox.top) + 8,
            right: Math.min(innerWidth, skyBox.right) - 8, bottom: Math.min(innerHeight, skyBox.bottom) - 8 };
          facts.viewport = { width: innerWidth, height: innerHeight }; facts.clip = clip;
          const inside = (r) => r.width > 0 && r.height > 0 && r.left >= clip.left && r.right <= clip.right && r.top >= clip.top && r.bottom <= clip.bottom;
          const placeCover = (point) => {
            word.style.transform = original.wordTransform;
            const start = coverInk();
            word.style.transform = `translate(${point.x - start.left - start.width / 2}px, ${point.y - start.top - start.height / 2}px) ${original.wordTransform}`;
            const ink = coverInk(), stack = document.elementsFromPoint(point.x, point.y), hit = document.elementFromPoint(point.x, point.y);
            // Ignore only the tested glyph when checking the underlying target. A mutant that loses the glyph's hit
            // region still has the same valid setup; unrelated chrome/words and offscreen points never qualify.
            const underlying = stack.find((node) => !glyph.contains(node));
            return { ...point, owner: glyph.contains(hit) ? 'glyph' : word.contains(hit) ? 'cover' : hit ? 'foreign' : null,
              coverInk: rect(ink), coverRect: rect(word.getBoundingClientRect()), hit: identity(hit), stack: stack.slice(0, 8).map(identity),
              admitted: point.x >= clip.left && point.x <= clip.right && point.y >= clip.top && point.y <= clip.bottom &&
                ink.left <= point.x && point.x <= ink.right && ink.top <= point.y && point.y <= ink.bottom && word.contains(underlying) };
          };
          // A hard-bounded grid admits geometry without inspecting the desired glyph-vs-cover product outcome.
          for (const fy of [.45, .3, .65]) for (const fx of [.5, .35, .65]) {
            glyph.style.transform = original.glyphTransform;
            const from = inkRect(), x = clip.left + (clip.right - clip.left) * fx, y = clip.top + (clip.bottom - clip.top) * fy;
            glyph.style.transform = `translate(${x - from.left - from.width / 2}px, ${y - from.top - from.height / 2}px) ${original.glyphTransform}`;
            const ink = inkRect(), box = glyph.getBoundingClientRect(), captionBox = caption?.getBoundingClientRect();
            const gap = Math.min(ink.left - box.left, box.right - ink.right);
            const trial = { grid: { fx, fy }, ink: rect(ink), box: rect(box), captionBox: captionBox && rect(captionBox), gap };
            facts.attempts.push(trial);
            if (!inside(box) || (captionRequired && (!captionBox || !inside(captionBox) || gap < 4))) continue;
            trial.centre = placeCover({ x: ink.left + ink.width / 2, y: ink.top + ink.height / 2 });
            if (captionRequired) trial.side = placeCover({ x: box.left + (ink.left - box.left) / 2, y: ink.top + ink.height / 2 });
            if (!trial.centre.admitted || (captionRequired && !trial.side.admitted)) continue;
            Object.assign(facts, { admitted: true, selected: trial, centre: trial.centre.owner, side: trial.side?.owner || null });
            return facts;
          }
          facts.setupError = 'no clear in-viewport geometry among the nine fixed candidates';
          return facts;
        } finally {
          glyph.style.transform = original.glyphTransform;
          word.style.transform = original.wordTransform;
          original.wordParent.insertBefore(word, original.wordNext?.parentNode === original.wordParent ? original.wordNext : null);
          if (ruby) { ruby.replaceChildren(...rubyChildren); g.replaceChildren(...original.children); }
          facts.restored = glyph.style.transform === original.glyphTransform && word.style.transform === original.wordTransform &&
            word.parentNode === original.wordParent && word.nextSibling === original.wordNext &&
            original.children.every((child, index) => g.childNodes[index] === child);
        }
      }, { kanji, sourceWord, bare, captionRequired });
      await lock('言葉', '言');
      const said = await own('言', { sourceWord: '言葉' });
      await lock('鉛筆', '筆');
      const brush = await own('筆', { sourceWord: '鉛筆', captionRequired: true });
      const bare = await own('筆', { sourceWord: '鉛筆', bare: true, captionRequired: true });
      const named = {};
      for (const { word, glyph } of SKY_OWNERSHIP_NAMED) {
        await lock(word, glyph);
        named[glyph] = await own(glyph, { sourceWord: word, captionRequired: true });
      }
      const cases = { said, brush, bare, ...named }, captions = { brush, bare, ...named };
      check('G3.sky-ownership.corpus', 'fixture-only 嘩/眩/貰 are actual mounted unannotated glyphs; hosted readings/pages remain absent',
        Object.keys(named).length === 3 && Object.values(named).every((c) => c.glyph && !c.annotated && !c.unmountedForStructuralCase &&
          c.canonical.has === false && c.canonical.reading === '' && c.caption === SKY_FIXTURE_CAPTION), named);
      check('G3.sky-ownership.fixture', 'actual glyphs and exact 誇り use clear controlled geometry; only the tested pair owns each admitted point',
        Object.values(cases).every((c) => c.lifecycle?.admitted && c.opened.cover && c.opened.target && c.appTransformMounted && c.glyph && c.cover === '誇り' && c.later && !c.stacked && c.visiblyMounted && c.coverFree && c.coverOpacity > 0 &&
          c.glyphOpacity > 0 && c.admitted && c.restored) && said.annotated && brush.annotated && !bare.annotated &&
          Object.values(captions).every((c) => c.selected?.gap >= 4 && c.selected.side.admitted && c.captionOpacity === '0'), cases);
      check('G3.sky-ownership.centre', 'each exact glyph owns its printed centre above the later 誇り, annotated or not',
        Object.values(cases).every((c) => c.centre === 'glyph'), cases);
      check('G3.sky-ownership.caption', 'each transparent caption side belongs to 誇り, including all three naturally unannotated fixture glyphs',
        Object.values(captions).every((c) => c.side === 'cover'), captions);
    };
    const schedules = {};
    for (const [name, probe] of [['G3-stalled', stalledProbe], ['G3-clear', clearProbe], ['G3-front', frontProbe], ['G3-sky-ownership', skyOwnershipProbe]]) {
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
        { id: 'glyph-z-dropped', run: 'G3-sky-ownership', probe: skyOwnershipProbe, kill: 'G3.sky-ownership.centre',
          witness: (row) => Object.values(row.observed).every((c) => c.centre === 'cover'),
          edits: [{ file: 'drift-layer.css', key: 'drop-glyph-z',
            from: '#drift-layer.active #sky > .glyph.hosted-constellation-glyph:not(.comp):not(.center) {\n  z-index: 2;\n}',
            to: '#drift-layer.active #sky > .glyph.hosted-constellation-glyph:not(.comp):not(.center) {\n}' }] },
        { id: 'glyph-hit-region-removed', run: 'G3-sky-ownership', probe: skyOwnershipProbe, kill: 'G3.sky-ownership.centre',
          witness: (row) => Object.values(row.observed).every((c) => c.centre === 'cover'),
          edits: [{ file: 'drift-layer.css', key: 'remove-glyph-hit-region',
            from: ':not(.comp):not(.center) > small {\n  pointer-events: auto;\n}',
            to: ':not(.comp):not(.center) > small {\n  pointer-events: none;\n}' }] },
        { id: 'bare-glyph-caption-width', run: 'G3-sky-ownership', probe: skyOwnershipProbe, kill: 'G3.sky-ownership.caption',
          witness: (row) => row.observed.brush.side === 'cover' && ['bare', '嘩', '眩', '貰'].every((key) => row.observed[key]?.side === 'glyph'),
          edits: [{ file: 'drift-layer.css', key: 'bare-glyph-full-width', from: '  width: fit-content;\n  margin-inline: auto;\n', to: '' }] },
      ];
      for (const spec of specs.filter((spec) => !skyOwnershipOnly || spec.run === 'G3-sky-ownership')) {
        const control = { engine, id: spec.id, edits: spec.edits, served: [], pageErrors: [] };
        const begin = rows.length;
        await walk(spec.run, spec.probe, { control });
        control.rows = rows.splice(begin);
        const baseline = schedules[spec.run];
        const expected = baseline.map((row) => row.id);
        const actual = control.rows.map((row) => row.id);
        const target = control.rows.find((row) => row.id === `${engine}/${spec.kill}`);
        const cleanCandidate = baseline.length > 1 && baseline.every((row) => row.ok) && new Set(expected).size === expected.length;
        const fixtureReady = spec.run !== 'G3-sky-ownership' || ['corpus', 'fixture', 'setup'].every((part) =>
          control.rows.some((row) => row.id === `${engine}/G3.sky-ownership.${part}` && row.ok));
        const complete = !control.error && !control.setupError && control.pageErrors.length === 0 &&
          fixtureReady && JSON.stringify(actual) === JSON.stringify(expected) && spec.edits.every((edit) => control.served.some((served) => served.file === edit.file && served.applied.some((applied) => applied.key === edit.key)));
        const killed = cleanCandidate && complete && target && !target.ok && spec.witness(target) &&
          control.rows.every((row) => row.id === target.id || row.ok);
        control.verdict = !cleanCandidate || !complete ? 'incomplete' : killed ? 'killed' : target?.ok ? 'survived' : 'contaminated';
        // Re-run without the product mutant, retaining identical explicitly synthetic fixture data where declared.
        // Source bytes are never edited on disk.
        const restoreBegin = rows.length;
        await walk(spec.run, spec.probe, { phase: `restore:${spec.id}` });
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

writeFileSync(resolve(evidence, 'verify-word-grammar.json'), JSON.stringify({ site, gitSha: identity.gitSha, artifactSha256: identity.artifactSha256, verifierSha256, browserVersions, scope: g6ThreadCurrentOnly ? 'G6 current-thread visibility: six width/palette native contexts only' : g6FramesOnly ? 'G6 twelve directed edges and frames only; draft scope limits in g6-<engine>.json' : g6ControlsOnly ? 'G6 controls with positives and restores only' : g6Only ? 'G6 core schedule only; no G1/G3 claim; draft scope limits in g6-<engine>.json' : skyOwnershipOnly ? `G3 controlled sky glyph hit ownership${withControls ? ' and its negative controls' : ''}; named 嘩/眩/貰 use fixture-only corpus/captions, actual product mount/hit code; no natural-input, G1 or frame claim` : skyReadingsOnly ? 'G3 actual sky glyph and reader particle across all dials; canonical host getter; hosted sky particle rendering unproven because its legacy scene is unreachable; no G1 or frame gates' : controlsOnly ? 'G3 negative controls only; exact candidate schedules, mutants and restores; no G1 or frame gates' : roomsOnly ? 'G3 Words, sky words/glyphs, and reader particle; fixed activation counts; no G1 or frame gates' : sentencesOnly ? 'G3 sentence/example rendered ruby, all three dials, and sealed front; no G1 or frame gates' : kanaOnly ? 'G3 identical kana, particle bar Save, and meaningful particle dials; no G1 or frame gates' : g3Only ? 'G3 only; G1 gates not run' : 'G1, G3 and G6 core (G6 scope limits in per-engine receipt)', rows, frames, controls, fixtures }, null, 1));
const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} — evidence ${evidence}`);
process.exit(failed.length ? 1 : 0);
