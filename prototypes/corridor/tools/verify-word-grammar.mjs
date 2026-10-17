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
import { inflateSync } from 'node:zlib';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';
import { readAppRecord } from './record-test-support.mjs';
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
    const walk = async (name, body, { viewport = { width: 390, height: 844 }, mobile = true, control = null, init = null, demo = false, phase = 'candidate' } = {}) => {
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
            coverFree: style(word).zIndex === 'auto' && style(word).pointerEvents !== 'none' && style(word).visibility !== 'hidden',
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
        { id: 'glyph-z-dropped', run: 'G3-sky-ownership', probe: skyOwnershipProbe, kill: 'G3.sky-ownership.centre',
          witness: (row) => Object.values(row.observed).every((c) => c.centre === 'cover'),
          edits: [{ file: 'drift-layer.css', key: 'drop-glyph-z',
            from: '#drift-layer.active #sky > .glyph.hosted-constellation-glyph:not(.comp):not(.center) {\n  z-index: 1;\n}',
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

writeFileSync(resolve(evidence, 'verify-word-grammar.json'), JSON.stringify({ site, gitSha: identity.gitSha, artifactSha256: identity.artifactSha256, verifierSha256, browserVersions, scope: skyOwnershipOnly ? `G3 controlled sky glyph hit ownership${withControls ? ' and its negative controls' : ''}; named 嘩/眩/貰 use fixture-only corpus/captions, actual product mount/hit code; no natural-input, G1 or frame claim` : skyReadingsOnly ? 'G3 actual sky glyph and reader particle across all dials; canonical host getter; hosted sky particle rendering unproven because its legacy scene is unreachable; no G1 or frame gates' : controlsOnly ? 'G3 negative controls only; exact candidate schedules, mutants and restores; no G1 or frame gates' : roomsOnly ? 'G3 Words, sky words/glyphs, and reader particle; fixed activation counts; no G1 or frame gates' : sentencesOnly ? 'G3 sentence/example rendered ruby, all three dials, and sealed front; no G1 or frame gates' : kanaOnly ? 'G3 identical kana, particle bar Save, and meaningful particle dials; no G1 or frame gates' : g3Only ? 'G3 only; G1 gates not run' : 'G1 and G3', rows, frames, controls, fixtures }, null, 1));
const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} — evidence ${evidence}`);
process.exit(failed.length ? 1 : 0);
