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
 * G5 (hold = seal; one-hand/G5 brief): a held word fills a ring and is kept once (the durable record +1, the bookmark +1); a
 *   印 presses onto it and flies to the bookmark, landing on it; a failed keep shows no seal; a second hold opens the strip
 *   and writes nothing; Remove is the one way out; right-click and Shift+F10 do what a hold does (全項目 routes the keyboard
 *   to the page); New list… asks a name once; his lists are one tap each; the strip speaks plain full verbs (never "this
 *   sentence · save · ask the tutor · practice"), stays under 40 % of the screen and covers no button and not the word;
 *   a word held inside the word's page keeps its strip in the page, over no button; the bookmark lands on the kept
 *   words, and browsing them never starts a review; layers open only from 層, never move the paragraph's lines, and fold
 *   on any tap, Escape or the mark; the strip stands wholly on the glass at 320×568, 390×844 and 430×932 over no button,
 *   every control inside its painted box with no scroll of its own (Remove beside Saved ✓),
 *   and the bookmark's landed row is on the glass there; Remove un-saves everywhere and Undo brings every place back;
 *   with reduced motion nothing travels; on a deck card the front stays sealed and a back
 *   word's hold keeps it once and opens the strip; a Save in a bar stands inside it, 8 px clear of
 *   every screen edge, its target its doors' height (L-2); frames of the seal and the landing (WebKit ≤ 24 ms).
 *   --g5-only runs only these; --g5-controls adds: a second hold that un-keeps, a strip over a button, a layer that stays.
 * G3 negative controls: --controls replays uncleared ruby, a front door, and the sky glyph's z-index, hit region and caption
 *   width removed, and the Ladder's four (below); harness failures are incomplete.
 * Ladder (one-hand/LADDER; John, 10-19, checklist thread cecde60f — a spec change): G3's ladder rows are re-specified to his
 *   ladder: tap 1 the reading, tap 2 the English under the word, tap 3 the stage (ふりがな つねに: the English first; なし:
 *   the touched word's reading first; a word that is its own kana: its English first); the fold is as before. New rows:
 *   L.* (the climb with the English's size, ink and clearance and the DOTS hook data-depth-aside; the dials; a kana word;
 *   the box clear of the reading, the word and its English on the top line, mid-page and the last line at 320/390/430 and
 *   1440, day 藍 and night 夜, on touch and always; the box travelling with its word under a trackpad scroll) and M.* (a
 *   mouse or trackpad hold seals, John 17:19 thread 73dbfb5a: "HOLDING A WORD does nothing at all"). --ladder-only runs
 *   them. --controls adds tap1-opens-box, no-gloss-on-tap2, stalled-third and box-over-ruby (G3 schedules) and
 *   mouse-ignored, card-fixed-to-glass and no-aside-mark (Ladder schedules).
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
import { createHash, randomUUID } from 'node:crypto';
import { foldGeometryEqual, foldShiftBites, grammarSelection, grammarAcceptance, sharedHoverDiverges } from './vh-word-grammar-contracts.mjs';
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
import { armRecordWriteFailure, clearRecordWriteFailure, readAppRecord, readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';
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
// G5 · the story's own tokens, from the pinned build, so a layer's reading line is checked against the text's data
const storyTokens = (() => {
  const row = JSON.parse(readFileSync(resolve(site, 'data/articles/index.json'), 'utf8')).articles.find((article) => article.id === STORY.id);
  return JSON.parse(readFileSync(resolve(site, 'data/articles', row.file.split('/').at(-1)), 'utf8')).tokens;
})();
const WORD = '総理';
const WORLDS = Object.freeze(['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku']);
const FRAME_WINDOW = 1400;

const rows = [];
const selection = grammarSelection(process.argv.slice(2), { ladderWalks: (process.env.KAIRO_LADDER_WALKS || '').split(',').map(value => value.trim()).filter(Boolean) });
const runId = process.env.KAIRO_GATE_RUN_ID || randomUUID();
const completedWalks = [], g6Completed = [];
const g1Only = process.argv.includes('--g1-only');
const vhInkOnly = process.argv.includes('--vh-ink-only');
const vhOnly = vhInkOnly || process.argv.includes('--vh-contracts-only');
let mediaPhase = 'candidate';
let engine = '';
let rowProvenance = {phase:'control',walk:null};
const check = (id, title, ok, observed = '', provenance = rowProvenance) => {
  const actualProvenance = /^(?:[GL][1-5]?\.negative\.|G6\.(?:touch|keyboard)\.negative\.)/u.test(id) ? {phase:'control',walk:null} : provenance;
  rows.push({ id: `${engine}/${id}`, title, ok: !!ok, observed, ...actualProvenance });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}/${id} ${title}${ok ? '' : ` — ${JSON.stringify(observed).slice(0, 500)}`}`);
  return !!ok;
};
const frames = [], browserVersions = {}, controls = [], fixtures = [];
// G2 · --g2-only runs the G2 walks alone (never a claim that the G1 parts passed); --g2-control <name> runs them on a mutant
const g2Only = process.argv.includes('--g2-only') || process.argv.includes('--g2-control');
const g2Versions = {}, controlsRun = [];
const controlsOnly = process.argv.includes('--controls-only');
const roomsOnly = process.argv.includes('--rooms-only');
const sentencesOnly = process.argv.includes('--sentences-only');
const kanaOnly = process.argv.includes('--kana-only');
const skyReadingsOnly = process.argv.includes('--sky-readings-only');
const skyOwnershipOnly = process.argv.includes('--sky-ownership-only');
assert([controlsOnly, roomsOnly, sentencesOnly, kanaOnly, skyReadingsOnly, skyOwnershipOnly].filter(Boolean).length <= 1, 'Choose one explicit narrow schedule');
const g4Only = process.argv.includes('--g4-only');
assert(!(g4Only && (controlsOnly || roomsOnly || sentencesOnly || kanaOnly || skyReadingsOnly || skyOwnershipOnly)), 'Choose one explicit narrow schedule');
const g3Only = controlsOnly || roomsOnly || sentencesOnly || kanaOnly || skyReadingsOnly || skyOwnershipOnly || process.argv.includes('--g3-only');
const withControls = controlsOnly || process.argv.includes('--controls');
// G2's walks and G3's narrow schedules each skip the other's walks: one schedule per run
assert(!(g2Only && g3Only), 'Choose the G2 walks or a G3 schedule, not both');
assert(!(g2Only && g4Only), 'Choose the G2 walks or G4, not both');

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
// G5: --g5-only runs only the G5 walks (hold = seal, the strip, the tray flight, layers); --g5-controls adds its three
// negative controls (a second hold un-keeps, the strip covers a button, a layer stays open after a tap elsewhere)
const g5Controls = withControls || process.argv.includes('--g5-controls');
const g5Only = process.argv.includes('--g5-only');
assert(!(g5Only && (g2Only || g3Only || g4Only)), 'Choose one explicit narrow schedule');
// G6: --g6-only runs the scale-travel suite alone; --g6-thread-current-only its twelve current-thread contexts;
// --g6-frames-only its directed edges and frames; --g6-controls-only its controls with positives and restores
const g6ThreadCurrentOnly=process.argv.includes('--g6-thread-current-only');
const g6FramesOnly=process.argv.includes('--g6-frames-only');
const g6ControlsOnly=process.argv.includes('--g6-controls-only');
const g6Only=g6ThreadCurrentOnly||g6FramesOnly||g6ControlsOnly||process.argv.includes('--g6-only');
assert(!(g6ThreadCurrentOnly&&(g6FramesOnly||g6ControlsOnly||withControls)),'Current-thread narrow schedule is distinct');
assert(!(g6FramesOnly&&g6ControlsOnly),'Choose one G6 narrow schedule');
assert(!(g6Only&&g3Only),'G6 and G3 narrow schedules are distinct');
assert(!(g6Only && (g2Only || g4Only || g5Only)), 'Choose one explicit narrow schedule');
// Ladder: --ladder-only runs only the Ladder's walks (one-hand/LADDER), with their controls under --controls
const ladderOnly = process.argv.includes('--ladder-only');
assert(!(ladderOnly && (g2Only || g3Only || g4Only || g5Only || g6Only)), 'Choose one explicit narrow schedule');
const ladderOn = ladderOnly || !(vhOnly || g1Only || g2Only || g3Only || g4Only || g5Only || g6Only);
const ladderWalks = selection.ladderWalks;

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
/** Ladder (John, 10-19): a word set in text climbs reading → English → stage. Advance only an observed rung, each one past
 * the last (reading, then gloss); a dead door is never rescued with an unconditional extra tap, and a rung that did not move
 * is never tapped again. `activate` is the one gesture used for every step (a tap, a click, Enter). */
async function climbToStage(page, occurrence, activate) {
  const order = ['reading', 'gloss'];
  let last = null;
  for (let step = 0; step < 3; step++) {
    await activate();
    const rung = await page.waitForFunction(({ node, last }) => document.getElementById('mini') ? 'stage'
      : ['reading', 'gloss'].includes(node.dataset.ladderRung) && node.dataset.ladderRung !== last ? node.dataset.ladderRung : null,
      { node: occurrence, last }, { timeout: 10000 }).then((handle) => handle.jsonValue());
    assert(await occurrence.evaluate((node) => node.isConnected), 'each activation must retain the same occurrence');
    if (rung === 'stage') return;
    assert(order.indexOf(rung) > order.indexOf(last), `the ladder climbs one observed rung at a time (${last} → ${rung})`);
    last = rung;
  }
  assert.fail('no stage stood after the reading and the English');
}
async function stage(page, locator) {
  // A revealed ruby changes textContent. Retain the selected occurrence so
  // a text-filtered locator cannot silently move a later tap to a neighboring word.
  const occurrence = await locator.elementHandle();
  assert(occurrence && await occurrence.evaluate((node) => node.isConnected), 'stage starts on a connected occurrence');
  await climbToStage(page, occurrence, () => occurrence.tap());
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
/** Ladder · the English row under a word, as drawn: its text, whether it stands wholly under the word's glyphs, its size,
 * and the occurrences that wear the dots hook (data-depth-aside); null text when no row is drawn. */
const englishRow = (node) => {
  const row = node.querySelector(':scope > .tok-en');
  const ink = row?.querySelector('.tok-en-text') || row;
  const shown = !!row && getComputedStyle(row).display !== 'none' && getComputedStyle(row).visibility !== 'hidden' && row.getClientRects().length > 0;
  const glyphs = window.__glyphs?.(node);
  const box = shown ? ink.getBoundingClientRect() : null;
  return { english: shown ? ink.textContent.trim() : null, englishPx: shown ? parseFloat(getComputedStyle(ink).fontSize) : null,
    englishUnder: !!box && !!glyphs && box.top >= glyphs.top + glyphs.height - 1,
    aside: node.dataset.depthAside ?? null, asideElsewhere: [...document.querySelectorAll('[data-depth-aside]')].filter((other) => other !== node).length };
};
/** A tap, then the occurrence's own answer to it: its rung moves (or a stage stands or goes) before it is read. A lookup word
 * prepares its dictionary first, so a fixed pause can read it before it answers; this waits for the answer (≤ 10 s), and
 * a door that never answers is read as it stands, so its row still fails. */
async function tapSettled(page, locator, { pause = 250 } = {}) {
  const node = await locator.elementHandle();
  const before = await node.evaluate((n) => ({ rung: n.dataset.ladderRung || null, stages: document.querySelectorAll('#mini').length }));
  await locator.tap();
  await page.waitForFunction(({ n, before }) => (n.dataset.ladderRung || null) !== before.rung || document.querySelectorAll('#mini').length !== before.stages,
    { n: node, before }, { timeout: 10000 }).catch(() => {});
  await delay(pause);
}
async function ladderFacts(page, locator) {
  const reading = await locator.evaluate(visibleReading);
  const row = await locator.evaluate(englishRow);
  return { reading, ...row, ...await page.evaluate(() => ({
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
/* Ladder R4 · every frame (requestAnimationFrame) of every English row under a text word: its text and how many frames and ms
 * it stood, by the word's index (window.__enFrames) — read by the walks, never written back. */
const EN_FRAMES = () => {
  window.__enFrames = {};
  const tick = () => {
    for (const ink of document.querySelectorAll('.tok[data-index] > .tok-en > .tok-en-text')) {
      const list = (window.__enFrames[ink.closest('.tok[data-index]').dataset.index] ||= []), text = ink.textContent, last = list.at(-1);
      if (last && last.text === text) { last.frames += 1; last.until = performance.now(); }
      else list.push({ text, from: performance.now(), until: performance.now(), frames: 1 });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
/* Ladder R2 · every text an English row under a text word says, in order, by the word's index (window.__en): recorded in the
 * mutation's own microtask, so a text that stood for a frame is never missed — read by the walks, never written back. */
const EN_TRACE = () => {
  window.__en = {};
  const note = () => {
    for (const ink of document.querySelectorAll('.tok[data-index] > .tok-en > .tok-en-text')) {
      const list = (window.__en[ink.closest('.tok[data-index]').dataset.index] ||= []);
      if (list.at(-1) !== ink.textContent) list.push(ink.textContent);
    }
  };
  new MutationObserver(note).observe(document, { subtree: true, childList: true, characterData: true });
};
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

/* ── G2 · depth: the quiet dot (MASTER_SPEC §4 G, the G2 lines; §7 lines 13–14) ─────────────────────────────────────────
 * The article's first paragraph, seeded straight into the installation's own record (one word per depth, the record a
 * year of use leaves; no app reducer), in WebKit and Chromium at 390×844, every page error a failure:
 *   G2.1 states   出席 unmet (bare) · 官邸 met · 大賞 again · 表彰 recalled · 大臣 owned: each reader token wears exactly its
 *                 state; the four dots are four fills, each deeper than the last against the page; no line box moves
 *   G2.2 ring     kept = Review or a list: 大臣 (Review) and 式 (a list only) ring in the world's seal red; 官邸, 大賞, 表彰
 *                 (history, no longer kept) and 出席 never do
 *   G2.3 rooms    大臣's dot and ring in its slip, on its page's basis line, in its saved-words row, among Today's stars and
 *                 in the mirror (Kagami); Me's help line stands beside characters read unaided
 *   G2.4 reading  年 in 令和８年 reads ねん and 日 in ２５日 reads か; his owned, kept cards are 年 read とし and 日 read ひ:
 *                 each token is at most "met" and never rings; 年's slip and page do the same, and its page says the kept
 *                 card is another reading
 *   G2.5 not yet  挨拶 owned with his "Not yet": "again"; a Good review appended after it releases it to "owned"
 *   G2.6 basis    the page's one line names the days, the review state with present recall, and the reading; "I know this"
 *                 and "Not yet" are its two words
 *   G2.7 taps     looking up, opening pages and pressing both words leave taken, lists, srs, revlog, stats, suspended and
 *                 deepWords byte-identical, and change met
 * G2 controls (--g2-control <name>, an edit served in place of corridor.js, serveMutation): reading-check-dropped →
 * G2.4 red; tap-schedules → G2.7 red. The browser version is logged for every engine. */
const G2_PARA = Object.freeze({ unmet: 23, met: 14, again: 18, recalled: 20, owned: 13, listed: 21, capped: 6, homograph: 2, notYet: 31 });
const G2_DAY = 86400000;
const G2_SCHEDULING = ['taken', 'lists', 'srs', 'revlog', 'stats', 'suspended', 'deepWords'];
const g2Card = (now, { stability, daysAgo, state = 2 }) => ({ due: new Date(now + Math.round(stability * 0.6) * G2_DAY).toISOString(),
  last_review: new Date(now - daysAgo * G2_DAY).toISOString(), stability, difficulty: 5.1, elapsed_days: daysAgo,
  scheduled_days: Math.round(stability * 0.6) + daysAgo, reps: 7, lapses: 0, learning_steps: 0, state });
const g2Row = (t, key, g) => [t, key, g, 2, 3, 0.95, 40, 5, 42, 5, 30, t + 30 * G2_DAY];
const G2_CONTROLS = {
  'reading-check-dropped': { kills: ['G2.4', 'G2.4.rooms'], edits: [{ file: 'corridor.js', key: 'reading', from: '  const reading = shown ? kanaReadingKey(shown) || null : null;\n  const make =',
    to: '  const reading = null;\n  const make =' }] },
  'tap-schedules': { kills: ['G2.7'], edits: [{ file: 'corridor.js', key: 'schedules', from: '  const help = article ? readHelpPatch(latest, article, key, now) : null;',
    to: "  const help = article ? readHelpPatch(latest, article, key, now) : null;\n  if (plainRecord(latest.srs) && owns(latest.srs, srsKey('word', identity.id))) patch.srs = { ...latest.srs, [srsKey('word', identity.id)]: { ...latest.srs[srsKey('word', identity.id)], due: new Date(now).toISOString() } };" }] },
};
/** A word's stage (its card): the ladder's rungs up to it (Ladder: the reading, then the English, each tap only once its
 * rung is observed) — a dead door is never rescued with an unconditional extra tap. */
async function g2Stage(page, locator) {
  const occurrence = await locator.elementHandle();
  await climbToStage(page, occurrence, () => occurrence.tap());
  await page.locator('#mini .mini-word').waitFor();
}
/** The first paragraph just under the top bar, for the eye. */
async function g2ShowParagraph(page) {
  await page.evaluate(() => {
    const first = document.querySelector('#reader .tok[data-index]');
    const bar = [...document.querySelectorAll('.chrome, .nav-symbol')].reduce((edge, node) => Math.max(edge, node.getBoundingClientRect().bottom), 0);
    window.scrollTo(0, Math.max(0, first.getBoundingClientRect().top + window.scrollY - bar - 28));
  });
  await delay(400);
}
async function g2Walks(walk, browser, forcedControl = null) {
  const version = browser.version();
  console.log(`G2 ${engine} ${version}`);
  g2Versions[engine] = version;
  const controlAt = process.argv.indexOf('--g2-control');
  const controlId = forcedControl || (controlAt >= 0 ? process.argv[controlAt + 1] : null);
  const control = controlId ? G2_CONTROLS[controlId] : null;
  assert(controlAt < 0 || control, `--g2-control is one of ${Object.keys(G2_CONTROLS).join(', ')}`);
  const manifest = new Map(identity.files.map((file) => [file.path, file.sha256]));
  const served = { served: [], setupError: null };
  /** The record this boot left, changed off the page and committed straight into the installation's own store. */
  const seed = async (page, mutate) => {
    const snapshot = await readAppRecordSnapshot(page);
    const record = mutate(JSON.parse(JSON.stringify(snapshot.record)));
    await page.goto(`${host.origin}/__g2-blank`);
    const result = await page.evaluate(async (recordText) => {
      const core = await import('/modules/record-core.mjs');
      const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
      const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
      const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
      try {
        const before = await store.snapshot();
        await store.commitLocal({ changeId: `g2-seed-${crypto.randomUUID()}`, binding: policy.binding, expectedRevision: before.revision,
          occurredAt: new Date().toISOString(), mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: JSON.parse(recordText) }], operations: [] });
        return { stored: true };
      } catch (error) { return { stored: false, message: String(error?.message || error) }; }
      finally { await store.close(); }
    }, JSON.stringify(record));
    assert(result.stored, `seeded: ${result.message}`);
    return record;
  };
  const prepare = async (page) => {
    await page.route('**/__g2-blank', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>g2</title>' }));
    if (control) await serveMutation(page.context(), { origin: host.origin, manifest, control: served, edits: control.edits });
  };
  const token = (page, index) => page.locator(`#reader .tok[data-index="${index}"]`).first();
  /** What the reader shows of one token: its state, its ring, its painted dot and its row's box. */
  const tokenFacts = (page, index) => page.evaluate((at) => {
    const tok = document.querySelector(`#reader .tok[data-index="${at}"]`);
    const row = tok?.querySelector('.tok-word');
    if (!tok || !row) return null;
    const dot = getComputedStyle(row, '::after');
    return { text: row.textContent, depth: tok.dataset.depth || null, kept: tok.dataset.kept != null,
      dot: dot.content === 'none' ? null : { background: dot.backgroundColor, shadow: dot.boxShadow, position: dot.position,
        width: parseFloat(dot.width), height: parseFloat(dot.height), events: dot.pointerEvents }, rowHeight: Math.round(row.getBoundingClientRect().height * 10) / 10 };
  }, index);
  const record = (page) => readAppRecordSnapshot(page).then((snapshot) => snapshot.record);
  const scheduling = (value) => JSON.stringify(G2_SCHEDULING.map((key) => [key, value[key] ?? null]));
  /** The one paragraph, every state: the record a learner leaves after weeks of reading and review. */
  const seedParagraph = async (page, fixture) => {
    await openStory(page);
    const nodes = await page.evaluate((map) => Object.fromEntries(Object.entries(map).map(([name, at]) =>
      [name, { node: window.__KAIRO_DEPTH__.readerNode(at), key: window.__KAIRO_DEPTH__.key(window.__KAIRO_DEPTH__.readerNode(at) || {}),
        kind: window.__KAIRO_DEPTH__.identity(window.__KAIRO_DEPTH__.readerNode(at) || {})?.kind }])), G2_PARA);
    const today = await page.evaluate(() => window.__KAIRO_DEPTH__.day());
    const now = Date.now();
    const words = Object.fromEntries(Object.entries(nodes).map(([name, value]) => [name, value.node?.id]));
    check(`G2.F0.${fixture}`, 'the paragraph names its words, each the quick dictionary\'s own record (so no index decides them)',
      words.unmet === '出席' && words.met === '官邸' && words.again === '大賞' && words.recalled === '表彰' && words.owned === '大臣' &&
      words.listed === '式' && words.notYet === '挨拶' && ['unmet', 'met', 'again', 'recalled', 'owned', 'listed', 'notYet'].every((name) => nodes[name].kind === 'core'), nodes);
    const seeded = await seed(page, (value) => {
      const item = (id) => ({ t: 'word', id, label: id, ts: now - 40 * G2_DAY, started: now - 40 * G2_DAY });
      value.taken = [...value.taken, item('大臣'), item('挨拶'), item('日'), item('年')];
      value.lists = { ...value.lists, 式典: [{ t: 'word', id: '式', label: '式', ts: now - 3 * G2_DAY }] };
      value.srs = { ...value.srs, 'word:大臣': g2Card(now, { stability: 64, daysAgo: 3 }), 'word:表彰': g2Card(now, { stability: 12, daysAgo: 1 }),
        'word:挨拶': g2Card(now, { stability: 48, daysAgo: 2 }), 'word:日': g2Card(now, { stability: 80, daysAgo: 4 }),
        'word:年': g2Card(now, { stability: 90, daysAgo: 5 }) };
      // the mirror's frontier and Today's sky: 大臣 met twice in review lately, once missed
      value.revlog = [...value.revlog, g2Row(now - 3 * G2_DAY, 'word:大臣', 1), g2Row(now - 2 * G2_DAY, 'word:大臣', 3)];
      value.met = { version: 1, entries: {
        [nodes.met.key]: { first: today - 2, last: today - 2, days: 1 },
        [nodes.again.key]: { first: today - 9, last: today - 1, days: 3 },
        [nodes.recalled.key]: { first: today - 30, last: today - 4, days: 6 },
        [nodes.owned.key]: { first: today - 60, last: today - 2, days: 11 },
        [nodes.notYet.key]: { first: today - 20, last: today - 1, days: 4, said: { value: 'not-yet', at: now - G2_DAY, cursor: value.revlog.length } },
      } };
      return value;
    });
    await openStory(page);
    await page.waitForFunction(() => !!document.querySelector('#reader .tok[data-depth]'), null, { timeout: 8000 }).catch(() => {});
    await delay(400);
    return { nodes, seeded, now, today };
  };

  // G2.1 · G2.2 · G2.3 · G2.4 · G2.5 · G2.6 — one walk through the seeded paragraph and every room it reaches
  await walk('g2-depth', async (page) => {
    await prepare(page);
    const { seeded, now } = await seedParagraph(page,'depth');
    const facts = {};
    for (const [name, at] of Object.entries(G2_PARA)) facts[name] = await tokenFacts(page, at);
    await g2ShowParagraph(page);
    await page.screenshot({ path: resolve(evidence, `${engine}-G2-reader-ai.png`) });
    const want = { unmet: null, met: 'met', again: 'again', recalled: 'recalled', owned: 'owned' };
    const states = Object.entries(want).every(([name, depth]) => facts[name]?.depth === depth && (depth ? !!facts[name].dot : !facts[name].dot));
    const fills = ['met', 'again', 'recalled', 'owned'].map((name) => facts[name]?.dot?.background);
    // The reader's paper is a separate surface from the world's ground. The DOTS verifier also samples the raster,
    // including grain and ancestor opacity; this G2 row keeps the ordering and layout law and adds a visibility floor.
    const page0 = await page.evaluate(() => getComputedStyle(document.querySelector('#reader')).backgroundColor);
    const steps = fills.map((fill) => contrast(fill, page0));
    check('G2.1', 'the paragraph: 出席 bare · 官邸 met · 大賞 again · 表彰 recalled · 大臣 owned, four fills each deeper against the page, '
      + 'each fill at least 6 px, met at least 3:1 and known at least 3:1 on the reader paper, '
      + 'each dot out of the line (absolute, untouchable) and every row its natural height',
    states && new Set(fills).size === 4 && steps.every((ratio, i) => i === 0 || ratio > steps[i - 1]) &&
      steps[0] >= 3 && steps[2] >= 3 && steps[3] >= 3 &&
      ['met', 'again', 'recalled', 'owned'].every((name) => Math.min(facts[name].dot.width, facts[name].dot.height) >= 6) &&
      ['met', 'again', 'recalled', 'owned'].every((name) => facts[name].dot.position === 'absolute' && facts[name].dot.events === 'none') &&
      ['met', 'again', 'recalled', 'owned'].every((name) => Math.abs(facts[name].rowHeight - facts.unmet.rowHeight) <= 0.5), { facts, fills, steps });
    const seal = await page.evaluate(() => { const probe = document.createElement('i'); probe.style.color = 'var(--color-seal)'; document.body.append(probe);
      const color = getComputedStyle(probe).color; probe.remove(); return color; });
    const rings = (fact) => !!fact?.dot && fact.kept && String(fact.dot.shadow).includes(seal.replace(/\s+/g, ' '));
    check('G2.2', 'kept rings, one meaning: 大臣 (Review) and 式 (a list only) wear the seal-red ring; 官邸, 大賞, 表彰 (history only) and 出席 never',
      rings(facts.owned) && rings(facts.listed) && contrast(seal, page0) >= 3 &&
      ['met', 'again', 'recalled', 'unmet'].every((name) => !facts[name]?.kept && !/rgb|color/u.test(String(facts[name]?.dot?.shadow || 'none').replace('none', ''))),
      { owned: facts.owned, listed: facts.listed, seal });
    check('G2.4', '年 read ねん and 日 read か beside his owned, kept 年 read とし and 日 read ひ: each at most "met", and no ring',
      [facts.capped, facts.homograph].every((fact) => fact && ['met', null].includes(fact.depth) && !fact.kept), { capped: facts.capped, homograph: facts.homograph });
    check('G2.5', '挨拶, owned, with his "Not yet": the dot is "again"', facts.notYet?.depth === 'again', facts.notYet);
    // the rooms: 大臣's slip, its page's basis line
    await g2Stage(page, token(page, G2_PARA.owned));
    await delay(500);
    const slip = await page.evaluate(() => { const mini = document.getElementById('mini'); const dot = getComputedStyle(mini.querySelector('.mini-word'), '::after');
      return { depth: mini.dataset.depth || null, kept: mini.dataset.kept != null, dot: dot.content === 'none' ? null : dot.backgroundColor, shadow: dot.boxShadow }; });
    await page.locator('#mini .mini-word').tap();
    await pageSettled(page);
    await page.locator('#depth-basis').waitFor({ timeout: 8000 });
    await delay(400);
    const basis = await page.evaluate(() => { const line = document.getElementById('depth-basis'); const dot = line.querySelector('.depth-dot');
      return { text: line.querySelector('.depth-basis-said')?.textContent || '', depth: dot?.dataset.depth || null, kept: dot?.dataset.kept != null,
        words: [...line.querySelectorAll('.depth-word')].map((button) => button.textContent), painted: !!dot && getComputedStyle(dot).display !== 'none' }; });
    await page.screenshot({ path: resolve(evidence, `${engine}-G2-page-basis-ai.png`) });
    check('G2.6', 'the page names the basis in one line — days met (eleven seeded and today\'s look-up), review state with present recall, the reading — and offers "I know this" / "Not yet"; never "mastered"',
      /Familiar · met on 12 days/u.test(basis.text) && /in review · recall now \d+%/u.test(basis.text) && /read だいじん/u.test(basis.text) &&
      !/master/iu.test(basis.text) && basis.words.join('|') === 'I know this|Not yet', basis);
    // the saved-words row, Today's stars, the mirror, Me
    await page.locator('#sheet-back').tap();
    await bare(page);
    if (await page.locator('#mini').count()) { await page.keyboard.press('Escape'); await delay(300); }
    await page.locator('#tray').click();
    await page.waitForFunction(() => !!document.querySelector('.tray-line'), null, { timeout: 10000 });
    await delay(500);
    const row = await page.evaluate(() => { const line = [...document.querySelectorAll('.tray-line')].find((node) => node.querySelector('.w')?.textContent === '大臣');
      const dot = line?.querySelector('.depth-dot'); return dot ? { depth: dot.dataset.depth || null, kept: dot.dataset.kept != null, shown: getComputedStyle(dot).display } : null; });
    await page.locator('#tab-today').click().catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll('.today-star').length > 0, null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => { for (const star of document.querySelectorAll('.today-star')) star.hidden = false; });
    await delay(500);
    const star = await page.evaluate(() => { const node = [...document.querySelectorAll('.today-star')].find((s) => s.textContent.trim() === '大臣');
      return node ? { depth: node.dataset.depth || null, kept: node.dataset.kept != null, dot: getComputedStyle(node, '::after').content !== 'none' } : null; });
    await page.locator('#tab-me, #tab-progress').first().click();
    await page.waitForFunction(() => document.body.dataset.view === 'me' || !!document.getElementById('me-progress'), null, { timeout: 10000 });
    await delay(400);
    const help = await page.evaluate(() => { const line = document.getElementById('me-help'); return line ? { text: line.textContent, beside: !!line.previousElementSibling } : null; });
    await page.locator('#me-progress').click();
    await page.waitForFunction(() => document.body.dataset.view === 'kagami', null, { timeout: 10000 });
    await delay(500);
    const mirror = await page.evaluate(() => { const rowNode = [...document.querySelectorAll('.kagami-row')].find((node) => node.querySelector('.row-glyph')?.textContent === '大臣');
      const dot = rowNode?.querySelector('.depth-dot'); return rowNode ? { depth: dot?.dataset.depth || null, kept: dot?.dataset.kept != null,
        reading: rowNode.querySelector('.row-reading')?.textContent || '' } : null; });
    check('G2.3', '大臣 wears the same dot and ring in every room: its slip, its page\'s basis line, its saved-words row, Today\'s sky and the mirror; Me says its help line',
      slip.depth === 'owned' && slip.kept && !!slip.dot && basis.depth === 'owned' && basis.kept && basis.painted && row?.depth === 'owned' && row.kept &&
      row.shown !== 'none' && star?.depth === 'owned' && star.kept && star.dot && mirror?.depth === 'owned' && mirror.kept && mirror.reading === 'だいじん' &&
      !!help && /1,000/u.test(help.text), { slip, basis: { depth: basis.depth, kept: basis.kept }, row, star, mirror, help });
    // G2.5 · a Good review after his "Not yet" releases it
    const latest = await record(page);
    await seed(page, (value) => ({ ...value, revlog: [...value.revlog, g2Row(Date.now(), 'word:挨拶', 3)] }));
    await openStory(page);
    await page.waitForFunction((at) => !!document.querySelector(`#reader .tok[data-index="${at}"][data-depth]`), G2_PARA.notYet, { timeout: 8000 }).catch(() => {});
    await delay(300);
    const released = await tokenFacts(page, G2_PARA.notYet);
    check('G2.5.release', 'a Good review of 挨拶 appended after his "Not yet" releases it to "owned"', released?.depth === 'owned' && latest.met && Object.keys(latest.met.entries).length >= 5, released);
    if (engine === 'webkit' && !control) {
      // the same paragraph in 墨: the dot is the print's own ink at the same steps
      await boot(page, { world: 'sumi' });
      await openStory(page);
      await page.waitForFunction(() => !!document.querySelector('#reader .tok[data-depth]'), null, { timeout: 8000 }).catch(() => {});
      await g2ShowParagraph(page);
      await page.screenshot({ path: resolve(evidence, `${engine}-G2-reader-sumi.png`) });
    }
    void seeded; void now;
  });

  // G2.4 · the capped homograph opened: its slip and its page
  await walk('g2-reading', async (page) => {
    await prepare(page);
    await seedParagraph(page,'reading');
    await g2Stage(page, token(page, G2_PARA.homograph));
    // the full dictionary names 年 read ねん (#2084840): the card is drawn again with it
    await page.waitForFunction(() => /ねん/u.test(document.querySelector('#mini .mini-reading')?.textContent || '') && !!document.querySelector('#mini button.mini-word'), null, { timeout: 10000 }).catch(() => {});
    await delay(600);
    const slip = await page.evaluate(() => { const mini = document.getElementById('mini'); return { depth: mini.dataset.depth || null, kept: mini.dataset.kept != null,
      reading: mini.querySelector('.mini-reading')?.textContent || '' }; });
    let basis = null;
    if (await page.locator('#mini button.mini-word').count()) {
      await page.locator('#mini .mini-word').tap();
      await pageSettled(page);
      await page.locator('#depth-basis').waitFor({ timeout: 8000 }).catch(() => {});
      basis = await page.evaluate(() => { const line = document.getElementById('depth-basis'); const dot = line?.querySelector('.depth-dot');
        return line ? { text: line.textContent, depth: dot?.dataset.depth || null, kept: dot?.dataset.kept != null } : null; });
    }
    check('G2.4.rooms', '年 read ねん: its slip is at most "met" and unringed, and its page says, at most "met" and unringed, that the kept card is another reading',
      ['met', null].includes(slip.depth) && !slip.kept && slip.reading === 'ねん' && !!basis &&
      ['met', 'unmet'].includes(basis.depth) && !basis.kept && /another reading/u.test(basis.text), { slip, basis });
  });

  // G2.7 · looking up never schedules
  await walk('g2-taps', async (page) => {
    await prepare(page);
    await seedParagraph(page,'taps');
    const before = await record(page);
    for (const at of [G2_PARA.met, G2_PARA.owned, G2_PARA.unmet]) {
      await g2Stage(page, token(page, at));
      await delay(500);
      await page.keyboard.press('Escape');
      await delay(300);
    }
    await g2Stage(page, token(page, G2_PARA.owned));
    await delay(400);
    await page.locator('#mini .mini-word').tap();
    await pageSettled(page);
    await page.locator('#depth-known').click();
    await page.waitForFunction(() => document.getElementById('depth-known')?.getAttribute('aria-pressed') === 'true', null, { timeout: 8000 });
    await page.locator('#depth-not-yet').click();
    await page.waitForFunction(() => document.getElementById('depth-not-yet')?.getAttribute('aria-pressed') === 'true', null, { timeout: 8000 });
    await delay(600);
    const after = await record(page);
    const moved = G2_SCHEDULING.filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));
    const ownedKey = Object.keys(after.met?.entries || {}).find((key) => JSON.parse(key)[2] === '大臣');
    check('G2.7', 'three look-ups, a page and both of his words leave taken, lists, srs, revlog, stats, suspended and deepWords byte-identical; met holds his "Not yet"',
      scheduling(before) === scheduling(after) && moved.length === 0 && after.met?.entries?.[ownedKey]?.said?.value === 'not-yet' &&
      Object.keys(after.met.entries).length > Object.keys(before.met.entries).length, { moved, said: after.met?.entries?.[ownedKey]?.said });
  });
  if (control) controlsRun.push({ engine, control: controlId, served: served.served, setupError: served.setupError });
  return served;
}


/* G6: scale travel, exact thread ancestry, retained source and sky input admission.
 * G5 merge: the word's menu is the hold's strip (#seal-strip; a right-click or Shift+F10 is a hold). A hold whose door is
 * still preparing is retired by navigation, Escape, a press elsewhere or a newer hold (corridor.js sealPending), exactly as
 * the pending menu was; a completed hold keeps its word.
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
// The merged shelf (N2's twenty more articles and the rest) holds 171 focusable stops at 390 px, and focus lands on the
// rail's inward door, after its 宙: forward Tab reaches 宙 at the 171st press. The budget covers the real order, not a count.
const G6_TAB_BUDGET = 400;
async function g6TabReach(page, locator) {
  // Start from the current real focus; no tabindex changes or private focus model.
  for(let n=0;n<G6_TAB_BUDGET;n++){
    if(await locator.evaluate(node=>document.activeElement===node)) return {found:true,tabs:n};
    await page.keyboard.press('Tab');
  }
  return {found:false,tabs:G6_TAB_BUDGET};
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
  // Ladder · the reading, the English, then the stage: one observed rung per activation, by the same modality
  if(modality!=='touch')await focusWord(page,word);
  await climbToStage(page,occurrence,()=>modality==='touch'?occurrence.tap():page.keyboard.press('Enter'));
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
// Hfix-1A (the lead's item 8; it pinned the word rail's "kanji ›" on every word page): a word's rail offers its way in only
// back to the kanji entered from it in the visit, so the first word → kanji edge goes through the page's own kanji row (the
// door a learner sees) and every later one through the rail (verify-hfix-1a 8.* holds the rule itself)
async function g6Door(page,from,to){
  if(from==='word'&&to==='kanji'){
    const rail=page.locator(`${G6_RAIL}[data-scale="word"] button[data-scale-in]`);
    if(await rail.count())return rail;
    return page.locator(`#sheet .entry-row[data-kanjirow="${G6_ORIGIN.kanji}"]`);
  }
  return g6ControlFor(page,from,to);
}
async function g6Move(page,{from,to,modality,home,timing=false}){
  const before=await g6ScaleFacts(page);
  assert.equal(before.scale,from,`edge begins at actual ${from}`);
  const control=await g6Door(page,from,to);
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
  const visual=()=>{const v=window.visualViewport;return v?{offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,pageLeft:v.pageLeft,pageTop:v.pageTop,scale:v.scale,width:v.width,height:v.height}:null;};
  const offsets=()=>({visualViewport:visual(),window:{x:scrollX,y:scrollY},document:{x:document.documentElement.scrollLeft,y:document.documentElement.scrollTop},body:{x:document.body.scrollLeft,y:document.body.scrollTop},...Object.fromEntries(['app','reader','sheet'].map(id=>{const n=document.getElementById(id);return [id,n?{x:n.scrollLeft,y:n.scrollTop}:null];}))});
  const facts=(thread=active()[0])=>{
    if(!thread)return null;
    const currents=thread.querySelectorAll(':scope > [aria-current="step"]'),current=currents[0],outside=thread.querySelector(':scope > [data-scale-out]');
    const rail=rect(thread),bead=rect(current),out=rect(outside),viewport={width:document.documentElement.clientWidth,height:innerHeight},visualViewport=visual();
    const visualViewportValid=!!visualViewport&&Object.values(visualViewport).every(Number.isFinite)&&visualViewport.scale>0&&visualViewport.width>0&&visualViewport.height>0;
    const left=Math.max(0,rail.left+thread.clientLeft,visualViewport?.offsetLeft??NaN),right=Math.min(viewport.width,rail.left+thread.clientLeft+thread.clientWidth,(visualViewport?.offsetLeft??NaN)+(visualViewport?.width??NaN));
    let currentLeft=left,currentRight=right;
    if(out&&outside!==current&&out.right>left&&out.left<right){if(out.left+out.width/2<=(left+right)/2)currentLeft=Math.max(left,out.right);else currentRight=Math.min(right,out.left);}
    const contained=(box,l,r)=>visualViewportValid&&!!box&&box.width>0&&box.height>0&&box.left>=l&&box.right<=r&&box.top>=Math.max(0,rail.top,visualViewport.offsetTop)&&box.bottom<=Math.min(viewport.height,rail.bottom,visualViewport.offsetTop+visualViewport.height);
    return {at:performance.now(),scale:thread.dataset.scale,activeRails:active().length,connected:thread.isConnected,owner:thread.parentElement?.id||null,
      currentCount:currents.length,currentTag:current?.tagName,currentDisabled:current?.disabled===true,currentNode:current?.dataset.node||null,currentIndex:current?.dataset.stackIndex||null,
      currentIsOutside:current===outside,rail,bead,out,viewport,visualViewport,visualViewportValid,available:{left:currentLeft,right:currentRight},scrollLeft:thread.scrollLeft,scrollTop:thread.scrollTop,scrollWidth:thread.scrollWidth,clientWidth:thread.clientWidth,
      currentContained:contained(bead,currentLeft,currentRight),outsideContained:contained(out,left,right),offsets:offsets(),fontStatus:document.fonts.status,font:current?getComputedStyle(current).font:null,
      theme:document.documentElement.getAttribute('data-theme'),sheetWorld:document.getElementById('sheet')?.dataset.world||null,stamp:window.__g6DocumentStamp};
  };
  if(action.op==='observe'){
    if(window.__g6CurrentMount)throw new Error('current-thread observer already active');
    const old=[...document.querySelectorAll('.scale-thread')].map((node,index)=>({node,index,owner:node.parentElement,ownerId:node.parentElement?.id||null,scale:node.dataset.scale,left:node.scrollLeft,top:node.scrollTop})),seen=new Set(),mounts=[];
    const observer=new MutationObserver(()=>{
      for(const thread of active())if(thread.dataset.scale===action.scale&&!seen.has(thread)&&!old.some(row=>row.node===thread)){
        seen.add(thread);mounts.push({thread,initial:facts(thread)});
      }
    });
    observer.observe(document.getElementById('app'),{childList:true,subtree:true});
    window.__g6CurrentMount={finish:()=>{
      observer.disconnect();
      return {mounts:mounts.map(({thread,initial})=>({initial,settled:facts(thread),sameLiveOwner:thread.isConnected&&thread===active()[0]})),priorCount:old.length,priorRails:old.map(row=>({index:row.index,scale:row.scale,owner:row.ownerId,before:{left:row.left,top:row.top},connected:row.node.isConnected,retired:!row.node.isConnected,sameParent:row.node.parentElement===row.owner,after:row.node.isConnected?{left:row.node.scrollLeft,top:row.node.scrollTop}:null,inert:!!row.node.closest('[inert],[aria-hidden="true"]')})),roomRails:[...document.querySelectorAll('#app > .scale-thread')].map(node=>({connected:node.isConnected,fresh:!old.some(row=>row.node===node),inert:!!node.closest('[inert],[aria-hidden="true"]'),left:node.scrollLeft,top:node.scrollTop}))};
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
    try{const step=await g6Move(page,{from,to,home,modality});route.push(step);assert(step.ok,JSON.stringify(step.observed));}
    catch(error){
      const actual=await page.evaluate(()=>{
        const rail=[...document.querySelectorAll('.scale-thread')].find(n=>!n.closest('[inert],[aria-hidden="true"]')&&n.getClientRects().length);
        const rows=[...(rail?.children||[])].map(node=>{const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return {tag:node.tagName,text:node.textContent,scaleIn:node.hasAttribute('data-scale-in'),current:node.getAttribute('aria-current'),rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},centre:{x,y},hits:document.elementsFromPoint(x,y).slice(0,6).map(n=>({tag:n.tagName,id:n.id,class:n.className,text:n.textContent?.slice(0,80)}))};});
        return {scale:rail?.dataset.scale,scrollLeft:rail?.scrollLeft,rows,scrollY,theme:document.documentElement.getAttribute('data-theme')};
      });
      writeFileSync(resolve(evidence,`${engine}-G6-current-${width}-${world}-${from}-${to}-native-failure.json`),JSON.stringify({from,to,width,world,error:String(error.stack||error),actual},null,2));
      throw error;
    }
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
  const paper=await pageFacts(page),appliedWorld=part?.theme===''?'hokusai':part?.theme;
  emit('current.context','actual requested width and applied palette/paper with the retained nonzero source occurrence',part?.viewport.width===width&&appliedWorld===world&&paper?.background===paper?.paper&&paper?.alpha===1&&part?.stamp===home.stamp&&home.origin.scrollY>0,{width,world,appliedWorld,paper,part,origin:home.origin,capture});
  emit('current.part-route','four native inward edges reach the actual source-backed part',route.length===4&&route.every(row=>row.ok)&&part?.scale==='part'&&part.currentNode===`radical:${G6_ORIGIN.part}`,route);
  emit('current.part-contained','the whole part-current span is visible beside the wholly visible sticky outside control',part?.activeRails===1&&part?.currentCount===1&&part?.currentTag==='SPAN'&&part?.currentContained&&part?.outsideContained,{part,capture});
  const mount=observed.mounts[0],unchanged=observed.mounts.length===1&&mount.sameLiveOwner&&mount.initial.currentNode===mount.settled.currentNode&&
    mount.initial.visualViewportValid&&mount.settled.visualViewportValid&&
    JSON.stringify(mount.initial.offsets)===JSON.stringify(mount.settled.offsets)&&mount.initial.scrollTop===mount.settled.scrollTop&&
    observed.priorCount>0&&observed.priorRails.length===observed.priorCount&&observed.priorRails.every((row,index)=>row.index===index&&
      (row.retired?!row.connected&&row.after===null:row.connected&&row.sameParent&&row.inert&&JSON.stringify(row.before)===JSON.stringify(row.after)))&&
    observed.priorRails.some(row=>row.owner==='app')&&observed.roomRails.length===1&&observed.roomRails.every(row=>row.connected&&row.fresh&&row.inert&&row.left===0&&row.top===0);
  emit('current.part-scroll-only','first-layout correction preserves exact visual viewport/page/reader/sheet offsets and accounts for every retired or surviving inert rail',unchanged,observed);
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
/** The record once its revision has held still across three reads 200 ms apart (at most 6 s): a write the app makes
 * on its own after an action (G2's encounter on a stage) lands before a baseline is taken. */
async function g6SettledRecord(page){
  let last=await readAppRecordSnapshot(page),still=0;
  for(let n=0;n<30&&still<3;n++){await delay(200);const next=await readAppRecordSnapshot(page);still=next.revision===last.revision?still+1:0;last=next;}
  return last;
}
async function g6SkyStageGate(page,{context,emit,native}){
  await g6SkyHome(page);const word=await g6PickSkyWord(page);
  const tapAt=await g6AimSkyWord(page,word);await page.touchscreen.tap(tapAt.x,tapAt.y);await page.waitForFunction(n=>n.dataset.ladderRung==='reading'||!!document.getElementById('mini'),word,{timeout:10000});
  if(!await page.locator('#mini').count()){assert.equal(await word.getAttribute('data-ladder-rung'),'reading');await page.waitForFunction(()=>window.__DRIFT__?.canNavigate()===true,null,{timeout:10000});const again=await g6AimSkyWord(page,word);await page.touchscreen.tap(again.x,again.y);}
  // G2 · a stage opened writes its encounter (met) a moment after it appears: the baseline is read once the record holds
  // still, so only the hand under test can change it
  await page.locator('#mini .mini-word').waitFor();const mini=await slipFacts(page),before=await g6SkyFacts(page),record=await g6SettledRecord(page);
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
    {file:'corridor.js',key:'displace-return-target',from:'const delta = scaleLineTop(anchor) - visit.viewportY;',to:'const delta = scaleLineTop(anchor) - (visit.viewportY + 80);'},
    {file:'corridor.js',key:'displace-stability-target',from:'const remaining = scaleLineTop(anchor) - visit.viewportY;',to:'const remaining = scaleLineTop(anchor) - (visit.viewportY + 80);'},
    {file:'corridor.js',key:'displace-post-focus-target',from:'const afterFocus = scaleLineTop(anchor) - visit.viewportY;',to:'const afterFocus = scaleLineTop(anchor) - (visit.viewportY + 80);'},
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
    const pending=requests.length===1&&requests[0].phase==='menu-prepare'&&!released&&await page.locator('#seal-strip').count()===0;
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
    assert.equal(await page.locator('#seal-strip').count(),0);
    // Passive observation also catches a briefly mounted menu; it never alters focus or application state.
    await page.evaluate(()=>{
      const witness={mounted:[],focused:[]};
      const observer=new MutationObserver(records=>{
        for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){
          const menus=[...(node.matches('#seal-strip')?[node]:[]),...node.querySelectorAll('#seal-strip')];
          for(const menu of menus)witness.mounted.push({time:performance.now(),text:menu.textContent});
        }
      });
      observer.observe(document.body,{childList:true,subtree:true});
      const focus=event=>{if(event.target.closest?.('#seal-strip'))witness.focused.push({time:performance.now(),id:event.target.id});};
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
    const menus=await page.locator('body > #seal-strip').count();
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
      className:String(n?.className||''),body:n===document.body,inMenu:!!n?.closest?.('#seal-strip'),connected:!!n?.isConnected};});
    const before=await sourceFacts();
    phase='menu-prepare';
    if(kind==='escape')await page.keyboard.press('Shift+F10');
    else await anchor.click({button:'right'});
    const deadline=Date.now()+7000;while(!requests.length&&Date.now()<deadline)await delay(25);
    if(other){await other.click({button:'right'});await delay(150);}
    const pending=requests.length>=1&&requests.every(row=>row.phase==='menu-prepare')&&!released&&await page.locator('#seal-strip').count()===0;
    emit('menu.pending-held','the native word menu awaits its own held real dictionary request',pending,{kind,before,keyboardFocus,requests:structuredClone(requests),released});
    assert(pending,'the real menu preparation must be pending before its cancellation');
    await page.evaluate(()=>{
      const witness={mounted:[],focused:[]};
      const observer=new MutationObserver(records=>{
        for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){
          const menus=[...(node.matches('#seal-strip')?[node]:[]),...node.querySelectorAll('#seal-strip')];
          for(const menu of menus)witness.mounted.push({time:performance.now(),label:menu.getAttribute('aria-label')||'',text:menu.textContent});
        }
      });
      observer.observe(document.body,{childList:true,subtree:true});
      const focus=event=>{if(event.target.closest?.('#seal-strip'))witness.focused.push({time:performance.now(),id:event.target.id});};
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
          if(n&&!n.closest('button,a,input,textarea,select,summary,[role="button"],[tabindex],.tok,.japanese-lookup-word,#seal-strip,.scale-thread'))
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
    const menus=await page.locator('body > #seal-strip').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')||''));
    if(kind==='overlap'){
      const otherText=await other.evaluate(n=>n.dataset.lookupText);
      const newest=menus.length===1&&witness.mounted.length===1&&menus[0].includes(otherText)&&!menus[0].includes(before.text);
      emit('menu.newest-only','overlapping preparations mount only the newest request, never the superseded word',newest,{menus,witness,first:before.text,other:otherText,requests,finished});
      await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('seal-strip'));
    }else{
      const sameRoom=kind!=='room'?cancelled.view==='reader'&&cancelled.connected&&!cancelled.inert&&cancelled.scrollY===before.scrollY&&(kind!=='escape'||cancelled.focused):cancelled.view==='shelf';
      emit('menu.cancel-state',kind==='escape'?'Escape retires the pending menu and leaves focus on its word':kind==='outside'?'an outside press retires the pending menu in the same room':'ordinary room navigation retires the pending menu',
        sameRoom,{kind,before,cancelled,cancelledFocus,outside});
      emit('menu.no-late-menu','the completed preparation never mounts a cancelled menu',menus.length===0&&witness.mounted.length===0,{menus,witness,requests,finished});
      emit('menu.no-late-focus','the completed preparation cannot take focus',witness.focused.length===0&&!afterFocus.inMenu&&JSON.stringify(afterFocus)===JSON.stringify(cancelledFocus),{cancelledFocus,afterFocus,witness});
      emit('menu.source-unchanged','the source word, room and scroll stay as the cancellation left them',JSON.stringify(afterRelease)===JSON.stringify(cancelled),{cancelled,afterRelease});
    }
    const recordAfter=await readAppRecord(page);
    if(kind==='overlap'){
      // G5 · a completed hold keeps its word (hold = seal): the newest hold's word is kept once, the superseded word never,
      // and nothing but the keep's own roots (taken, its deepWords snapshot) changes
      const otherText=await other.evaluate(n=>n.dataset.lookupText);
      const added=recordAfter.taken.filter(row=>!recordBefore.taken.some(old=>old.t===row.t&&old.id===row.id));
      const changed=[...new Set([...Object.keys(recordBefore),...Object.keys(recordAfter)])].filter(key=>JSON.stringify(recordBefore[key])!==JSON.stringify(recordAfter[key]));
      const keptNewest=added.length===1&&added[0].t==='word'&&(added[0].label===otherText||added[0].id===otherText)&&
        !added.some(row=>row.label===before.text||row.id===before.text)&&changed.every(key=>['taken','deepWords'].includes(key));
      emit('menu.no-record-work','overlapping holds keep only the newest word, once, and never the superseded one',keptNewest,{before:recordBefore,after:recordAfter,added,changed});
    }else emit('menu.no-record-work','opening and cancelling the pending hold write no record',JSON.stringify(recordBefore)===JSON.stringify(recordAfter),{before:recordBefore,after:recordAfter});
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
      if(publish)for(const row of localRows)check(`G6.${name}.${row.id}`,row.title,row.ok,row.observed,{phase:'candidate',walk:`G6.${name}`});
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
        // Q · the front's passage is drawn again once its own tokens arrive (data-words="tokens"): the witness is fired at
        // the settled sentence, never at the one about to be replaced (site-6: six synthetic pointers on a detached <p>)
        await page.waitForFunction(()=>document.querySelector('#kp-card .kp-sentence')?.dataset.words==='tokens',null,{timeout:10000});
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
    // G6's suite runs beside the walks, never under another slice's narrow schedule
    if (!vhOnly && !g1Only && !g2Only && !g3Only && !g4Only && !g5Only && !ladderOnly) { await runG6Suite(browser); g6Completed.push(engine); }
    const retainedWalks = new Map();
    const walk = async (name, body, { viewport = { width: 390, height: 844 }, mobile = true, control = null, init = null, demo = false, phase = 'candidate', reducedMotion = 'no-preference', dsf = 2 } = {}) => {
      if (vhInkOnly && name!=='G4-interrupt-save') return;
      if (vhOnly && !['page','exposure','g2-depth','g2-reading','g2-taps','G4-interrupt-save','G5-room-hover','G5-layers'].includes(name)) return;
      if (g1Only && /^(?:G[2-6]|g2|L-)/u.test(name)) return;
      if (g2Only && !name.startsWith('g2')) return;
      if (g6Only && !name.startsWith('G6')) return;
      if (ladderOnly && !name.startsWith('L-')) return;
      // KAIRO_LADDER_WALKS=<prefix,…> narrows --ladder-only to the walks named (a red or a probe's scope; never an acceptance)
      if (ladderOnly && ladderWalks.length && !ladderWalks.some((prefix) => name.startsWith(prefix))) return;
      // --controls-only is a G3 schedule that also replays G4's three candidate schedules (G4-named)
      if (g3Only && !name.startsWith('G3') && !(controlsOnly && name.startsWith('G4'))) return;
      if (g4Only && !name.startsWith('G4')) return;
      if (g5Only && !name.startsWith('G5')) return;
      if (controlsOnly && !['G3-stalled', 'G3-stalled-stage', 'G3-clear', 'G3-front', 'G3-sky-ownership', 'G4-interrupt-save', 'G4-ghost', 'G4-one-speed'].includes(name)) return;
      if (roomsOnly && !['G3-words', 'G3-words-family', 'G3-sky', 'G3-sky-glyph', 'G3-sky-ownership', 'G3-particle'].includes(name)) return;
      if (skyOwnershipOnly && name !== 'G3-sky-ownership') return;
      if (sentencesOnly && name !== 'G3-front' && !name.startsWith('G3-sentence-')) return;
      if (kanaOnly && name !== 'G3-kana' && name !== 'G3-particle') return;
      if (skyReadingsOnly && name !== 'G3-sky-glyph' && name !== 'G3-particle') return;
      const began = rows.length;
      const completion = { engine, name, phase: control ? `mutant:${control.id}` : phase, complete: false };
      completedWalks.push(completion);
      mediaPhase = completion.phase.replaceAll(':','-');
      if (!control && phase === 'candidate') retainedWalks.set(name, { body, options: { viewport, mobile, init, demo, reducedMotion, dsf }, start: began });
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: true, deviceScaleFactor: dsf, serviceWorkers: 'block', reducedMotion });
      await context.addInitScript(GLYPHS);
      if (!demo) await context.addInitScript(() => localStorage.setItem('kairo-word-ladder-demo-v1', '1'));
      for (const script of [].concat(init || [])) await context.addInitScript(script);
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
      const priorProvenance = rowProvenance;
      rowProvenance = {phase:completion.phase,walk:name};
      try { await body(page); completion.complete = true; }
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
        completion.complete &&= errors.length === 0;
        completion.rowIds = rows.slice(began).map(row => row.id);
        if (!control && phase === 'candidate') retainedWalks.get(name).rows = rows.slice(began);
        try { await context.close(); } finally { rowProvenance = priorProvenance; }
      }
    };

    // These short schedules also run against named product mutations. Their checks always
    // record actual state; an exception, missing row or page error can never kill a mutant.
    // Ladder (John, 10-19, checklist thread cecde60f — a spec change): tap 1 the reading, tap 2 the English under the word,
    // tap 3 the stage. G3.control.stage moves to the third activation (G3-stalled-stage); the second is G3.control.gloss.
    const stalledProbe = async (page) => {
      await openStory(page);
      const word = readerWord(page);
      await word.tap(); await delay(300);
      const first = await ladderFacts(page, word);
      check('G3.control.reading', 'known on-touch first activation is reading only: no English, no stage', first.reading && !first.english && !first.stages && !first.page, first);
      await word.tap(); await delay(650);
      const second = await ladderFacts(page, word);
      check('G3.control.gloss', 'second activation keeps the reading and sets the word\'s English under it, with no stage',
        second.reading && !!second.english && second.english !== '—' && second.englishUnder && !second.stages && !second.page, second);
    };
    /** The box over the word: its rect against the word's reading (rt element ∪ its text boxes), its glyphs and its English
     * row, each measured as rendered; null parts are reported, never assumed clear. */
    const boxClear = (page, word) => word.evaluate((node) => {
      const mini = document.getElementById('mini');
      const range = document.createRange();
      const union = (rects) => { const list = rects.filter((r) => r.width > 0.5 && r.height > 0.5);
        return list.length ? { top: Math.min(...list.map((r) => r.top)), bottom: Math.max(...list.map((r) => r.bottom)),
          left: Math.min(...list.map((r) => r.left)), right: Math.max(...list.map((r) => r.right)) } : null; };
      const rts = [...node.querySelectorAll('rt')].filter((rt) => !rt.classList.contains('hidden-rt') && getComputedStyle(rt).display !== 'none' && rt.textContent.trim());
      const reading = union(rts.flatMap((rt) => { range.selectNodeContents(rt); return [rt.getBoundingClientRect(), ...range.getClientRects()]; }));
      const g = window.__glyphs(node), glyphs = g && { top: g.top, bottom: g.top + g.height, left: g.left, right: g.left + g.width };
      const row = node.querySelector(':scope > .tok-en .tok-en-text');
      const english = row ? union([row.getBoundingClientRect()]) : null;
      const box = mini && union([mini.getBoundingClientRect()]);
      const hit = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const round = (r) => r && Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 10) / 10]));
      return { box: round(box), reading: round(reading), glyphs: round(glyphs), english: round(english), side: mini?.dataset.side ?? null,
        overReading: hit(box, reading), overWord: hit(box, glyphs), overEnglish: hit(box, english),
        clear: !!box && !!glyphs && (rts.length === 0 || !!reading) && !hit(box, reading) && !hit(box, glyphs) && !hit(box, english) };
    });
    const stalledStageProbe = async (page) => {
      await openStory(page);
      const word = readerWord(page);
      await word.tap(); await delay(300);
      const first = await ladderFacts(page, word);
      await word.tap(); await delay(650);
      const second = await ladderFacts(page, word);
      check('G3.control.climb', 'the reading, then the English under the word, each observed before the next tap',
        first.reading && !first.english && !first.stages && second.reading && !!second.english && !second.stages, { first, second });
      await word.tap(); await delay(900);
      const third = await ladderFacts(page, word);
      check('G3.control.stage', 'third activation opens the word\'s stage, its reading and English kept under it',
        third.stages === 1 && third.word === WORD && !third.page && third.reading && !!third.english, third);
      const clear = await boxClear(page, word);
      check('G3.control.stage-clear', 'the stage covers neither the word\'s reading, nor the word, nor its English', clear.clear, clear);
    };
    const clearProbe = async (page) => {
      await openStory(page);
      const word = readerWord(page);
      await word.tap(); await delay(300);
      const first = await ladderFacts(page, word);
      check('G3.clear.reading', 'reading-clear fixture actually revealed its known reading, and only it: no English, no stage', first.reading && !first.english && !first.stages && !first.page, first);
      await page.keyboard.press('Escape'); await delay(300);
      const after = await ladderFacts(page, word);
      check('G3.clear.bare', 'Escape from the reading rung clears the raised ruby', !after.reading && !after.stages && !after.page, after);
    };
    const frontProbe = async (page) => {
      await page.goto(`${host.origin}/index.html?deck=mcd&ui=bi`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await page.locator('#kp-start').click();
      await page.locator('#kp-card .kp-sentence').waitFor();
      // Q · the front is drawn twice: at once, then again with the back's word units once the deck's tokens arrive
      // (upgradeFront replaces the sentence). Measure the front it settles on, never one being replaced
      await page.waitForFunction(() => document.querySelector('#kp-card > .kp-sentence')?.dataset.words === 'tokens', null, { timeout: 15000 }).catch(() => {});
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
    for (const [name, probe] of [['G3-stalled', stalledProbe], ['G3-stalled-stage', stalledStageProbe], ['G3-clear', clearProbe], ['G3-front', frontProbe], ['G3-sky-ownership', skyOwnershipProbe]]) {
      const begin = rows.length;
      await walk(name, probe);
      schedules[name] = rows.slice(begin);
    }

    // Ladder (John, 10-19, a spec change): on touch and off, tap 1 shows the word's reading, tap 2 its English under it, tap 3
    // the stage; with readings always up, tap 1 its English and tap 2 the stage. The fold is as before: Escape returns the
    // word bare (always ruby kept). Every move's frames are recorded.
    await walk('G3-ladder', async (page) => {
      for (const [mode, name] of [[1, 'on-touch'], [0, 'off'], [2, 'always']]) {
        await openStory(page);
        await furigana(page, mode);
        const word = readerWord(page);
        const moves = [];
        const takeMove = async (name, action) => { const timing = await measure(page, action); moves.push({ name, ...timing }); };
        await takeMove('bare→first', word);
        const first = await ladderFacts(page, word);
        check(`G3.${name}.first`, `${name}: first activation ${mode === 2 ? 'sets the English under the word, its reading already up, no stage' : 'shows only the word\'s reading: no English, no stage'}`,
          mode === 2 ? first.reading && !!first.english && first.englishUnder && !first.stages && !first.page
            : first.reading && !first.english && !first.stages && !first.page, first);
        if (mode !== 2) {
          await takeMove('reading→english', word);
          const english = await ladderFacts(page, word);
          check(`G3.${name}.english`, `${name}: second activation keeps the reading and sets the English under the word, no stage`,
            english.reading && !!english.english && english.englishUnder && !english.stages && !english.page, english);
        }
        await takeMove('english→stage', word);
        const second = await ladderFacts(page, word);
        check(`G3.${name}.stage`, `${name}: one stage names the current word with a live Save; the reading and the English stay under it`,
          second.stages === 1 && second.word === WORD && second.save === false && !second.page && second.reading && !!second.english, second);
        await delay(1200);
        await takeMove('stage→page', page.locator('#mini .mini-word'));
        await pageSettled(page);
        check(`G3.${name}.page`, 'the stage band opens its own whole-screen page', coversViewport(await pageFacts(page)) && (await pageFacts(page)).headword.startsWith(WORD), await pageFacts(page));
        await takeMove('page→stage', page.locator('#sheet-back'));
        await bare(page);
        const returned = await ladderFacts(page, word);
        check(`G3.${name}.return-stage`, 'Back restores the same stage, not bare prose or another word, with its reading and English',
          returned.stages === 1 && returned.word === WORD && !returned.page && returned.reading && !!returned.english, returned);
        await takeMove('stage→bare', () => page.keyboard.press('Escape'));
        const gone = await ladderFacts(page, word);
        check(`G3.${name}.bare`, `${name}: stage Escape leaves no popup/page and no English, and ${mode === 2 ? 'retains always ruby' : 'clears summoned ruby'}`,
          !gone.stages && !gone.page && !gone.english && !gone.aside && gone.reading === (mode === 2), gone);
        frames.push({ engine, grammar: 'G3', mode: name, moves });
        check(`G3.${name}.frames`, `${name}: per-move worst and p95 recorded${engine === 'webkit' ? ', every worst ≤ 24 ms' : ' (Chromium, never averaged with WebKit)'}`,
          moves.length === (mode === 2 ? 5 : 6) && moves.every((row) => Number.isFinite(row.worst) && Number.isFinite(row.p95) && (engine !== 'webkit' || row.worst <= 24)), moves.map(({ name, worst, p95 }) => ({ name, worst, p95 })));
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
      // Ladder · from the English rung, as now: one outside press and the word is bare again (John's W3)
      await word.tap(); await delay(250); await word.tap(); await delay(350);
      const glossed = await ladderFacts(page, word);
      await page.locator('.reader-meta').click(); await delay(250);
      const outsideEnglish = await ladderFacts(page, word);
      check('G3.outside-english', 'outside press folds the English rung to bare in one step: no reading, no English, no aside mark',
        glossed.reading && !!glossed.english && !glossed.stages && !outsideEnglish.reading && !outsideEnglish.english && !outsideEnglish.aside &&
        !outsideEnglish.stages && !outsideEnglish.page, { glossed, outsideEnglish });
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
      // Hfix-1A (one Save on screen; it pinned "the bar names the stage's word" while the stage stood): while a stage stands
      // the bar's Save steps aside (hidden, its room kept, inert) and still names that word; folded, it returns naming it
      const keep = () => page.evaluate(() => { const bar = document.getElementById('chrome-keep'); return bar && { name: bar.getAttribute('aria-label'), text: bar.textContent,
        disabled: bar.disabled, held: bar.classList.contains('reader-capture-held'), rest: bar.hasAttribute('data-save-rest'),
        aside: bar.hasAttribute('data-aside') && bar.inert && getComputedStyle(bar).visibility === 'hidden', shown: !bar.inert && getComputedStyle(bar).visibility === 'visible' }; });
      await stage(page, meaning);
      const first = await keep();
      check('G3.save.fixture', 'the first stage refers to 意味, and while it stands the bar\'s Save steps aside, naming 意味', (await slipFacts(page)).word === '意味' && first?.aside === true && /意味/u.test(first.name || ''), { first, stage: await slipFacts(page) });
      await leaveStage(page);
      const folded = await keep();
      check('G3.save.folded', 'folded, the bar\'s Save returns and names 意味', folded?.shown === true && !folded.aside && /意味/u.test(folded.name || ''), folded);
      await stage(page, shina);
      await page.waitForFunction(() => document.getElementById('mini')?.getAttribute('aria-busy') !== 'true');
      const state = await page.evaluate(() => { const save = document.querySelector('#mini #mini-take'); return { word: document.querySelector('#mini .mini-word')?.textContent.trim(), held: save?.disabled }; });
      state.bar = await keep();
      check('G3.save.current', 'unconfirmed シナ holds Save; the bar\'s Save stands aside and never leaves live 意味 in the top bar', state.word === 'シナ' && state.held === true && state.bar?.aside === true && (state.bar.rest || (state.bar.held && /シナ/u.test(`${state.bar.name} ${state.bar.text}`))) && !/意味/u.test(`${state.bar?.name} ${state.bar?.text}`), state);
      await leaveStage(page);
      state.folded = await keep();
      check('G3.save.current-folded', 'folded, the bar\'s Save returns and never names live 意味: at rest, or holding シナ', state.folded?.shown === true && (state.folded.rest || (state.folded.held && /シナ/u.test(`${state.folded.name} ${state.folded.text}`))) && !/意味/u.test(`${state.folded.name} ${state.folded.text}`), state.folded);
      const beforeSave = await readAppRecord(page);
      if (state.folded && !state.folded.disabled) await page.locator('#chrome-keep').click();
      await delay(500);
      const record = await readAppRecord(page);
      check('G3.save.no-phantom', 'changing stage never saves the previous word', JSON.stringify(record.taken) === JSON.stringify(beforeSave.taken) && !record.taken.some((item) => item.t === 'word' && item.id === '意味'), record.taken);
    });

    await walk('G3-kana', async (page) => {
      await openStory(page, { story: { id: 'global-voices:2026-09-28-65726', search: 'ダマスカス' } });
      const word = page.locator('#reader .tok[data-index="0"]');
      check('G3.kana.fixture', 'the first word is the authored ダマスカス fixture', await word.getAttribute('data-prose-label') === 'ダマスカス', await word.textContent());
      // Ladder · a word that is its own kana has no reading to show: its first activation is its English, its second the stage
      await tapSettled(page, word, { pause: 350 });
      const same = await ladderFacts(page, word);
      check('G3.kana.identical', 'identical kana, including hiragana/katakana equivalents, skips an empty reading rung: its first activation is its English under it',
        !same.reading && !!same.english && same.englishUnder && !same.stages && !same.page, same);
      await tapSettled(page, word, { pause: 600 });
      const kanaStage = await ladderFacts(page, word);
      check('G3.kana.stage', 'its second activation opens its stage, with no reading rung invented', kanaStage.stages === 1 && kanaStage.word === 'ダマスカス' && !kanaStage.page && !kanaStage.reading, kanaStage);
      await page.keyboard.press('Escape'); await delay(200);
      const particle = readerWord(page, 'の');
      await tapSettled(page, particle, { pause: 350 });
      const partEnglish = await ladderFacts(page, particle);
      await tapSettled(page, particle, { pause: 600 });
      const part = await ladderFacts(page, particle);
      check('G3.kana.particle', 'a one-character particle is a word door: its English (its role) under it first, then a nonempty stage',
        !!partEnglish.english && !partEnglish.stages && !partEnglish.page && part.stages === 1 && !!part.word && !part.page, { partEnglish, part });
      const barState = () => page.evaluate(() => { const bar = document.getElementById('chrome-keep'); return { miniSave: !!document.querySelector('#mini #mini-take'),
        barRest: bar?.hasAttribute('data-save-rest'), barKey: bar?.dataset.saveKey, barName: bar?.getAttribute('aria-label'),
        aside: !!bar && bar.hasAttribute('data-aside') && bar.inert && getComputedStyle(bar).visibility === 'hidden' }; });
      const particleSave = await barState();
      // Hfix-1A: while the particle's stage stands the bar's Save stands aside (one Save on screen), still at rest
      check('G3.kana.particle-save-rest', 'a particle stage with no Save leaves the bar at rest with no previous target, standing aside while the stage stands',
        !particleSave.miniSave && particleSave.barRest === true && particleSave.barKey === '' && particleSave.aside, particleSave);
      await page.keyboard.press('Escape'); await delay(300);
      const particleFolded = await barState();
      check('G3.kana.particle-folded-rest', 'folded, the bar\'s Save returns at rest with no previous target',
        particleFolded.barRest === true && particleFolded.barKey === '' && !particleFolded.aside, particleFolded);
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
        // Ladder (John, 10-19): a sentence's word climbs as the reader's does — its reading where it is not already up (off
        // too), then its English under it, then its stage
        await tapSettled(page, target, { pause: 300 });
        const first = await state();
        check(`${id}.first`, `${surface}/${name}: first activation ${mode === 2 ? 'sets the English under the word, its reading already up' : 'visibly reveals only its reading'}`,
          first.parentPage === parentPage && !first.stages && (mode === 2
            ? first.reading && first.rung === 'gloss' && !!first.english && first.englishUnder
            : first.reading && first.rung === 'reading' && !first.english), first);
        if (mode !== 2) {
          await tapSettled(page, target, { pause: 300 });
          const english = await state();
          check(`${id}.english`, `${surface}/${name}: second activation keeps the reading and sets the English under the word`,
            english.parentPage === parentPage && !english.stages && english.reading && english.rung === 'gloss' && !!english.english && english.englishUnder, english);
        }
        await tapSettled(page, target, { pause: 450 });
        const staged = await state();
        check(`${id}.stage`, `${surface}/${name}: one stage retains the occurrence, its reading and its English`,
          staged.stages === 1 && staged.word === '年' && staged.parentPage === parentPage && staged.reading && !!staged.english, staged);
        if (staged.stages !== 1) return;
        await page.locator('#mini .mini-word').tap(); await pageSettled(page);
        const full = await pageFacts(page);
        check(`${id}.page`, 'the sentence word opens its own whole-screen entry', coversViewport(full) && full.headword.startsWith('年'), full);
        await page.locator('#sheet-back').tap(); await delay(550);
        const returned = await state();
        check(`${id}.return-stage`, 'Back restores the same sentence stage above its original page',
          returned.stages === 1 && returned.word === '年' && returned.parentPage === parentPage && returned.reading && !!returned.english, returned);
        await page.keyboard.press('Escape'); await delay(350);
        const gone = await state();
        check(`${id}.clear`, `${surface}/${name}: dismissal ${mode === 2 ? 'keeps always-on ruby' : 'leaves no rendered reading'}, no English, and restores the parent page`,
          !gone.stages && gone.parentPage === parentPage && gone.reading === (mode === 2) && !gone.english, gone);
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
        // Ladder (John, 10-19): meaningful は → わ shows its reading first wherever it is not up (on touch and off), then its
        // English (its role) under it, then its stage; with readings always up, its English comes first
        await tapSettled(page, target, { pause: 300 }); const first = await state();
        check(`${id}.first`, `${name}: meaningful は → わ ${mode === 2 ? 'keeps わ and sets its English under it first' : 'uses the reading rung first'}`, mode === 2
          ? first.reading && first.annotations.includes('わ') && first.rung === 'gloss' && !!first.english && !first.stages
          : first.reading && first.annotations.includes('わ') && first.rung === 'reading' && !first.english && !first.stages, first);
        if (mode !== 2) {
          await tapSettled(page, target, { pause: 300 }); const english = await state();
          check(`${id}.english`, `${name}: its second activation keeps わ and sets its English (its role) under it`,
            english.reading && english.rung === 'gloss' && !!english.english && !english.stages, english);
        }
        await tapSettled(page, target, { pause: 450 });
        const staged = await state();
        check(`${id}.stage`, 'the particle stage keeps its meaningful reading and its English, and has no Save',
          staged.stages === 1 && staged.word === 'は' && staged.reading && !!staged.english && staged.save === null, staged);
        await page.keyboard.press('Escape'); await delay(250); const gone = await state();
        check(`${id}.clear`, 'particle dismissal retains only the always-on reading, and no English',
          !gone.stages && !gone.page && !gone.rung && !gone.english && gone.reading === (mode === 2), gone);
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

    /* ======================================================================== Ladder (one-hand/LADDER/BRIEF.md)
     * John, 10-19 17:13 (checklist thread cecde60f): "one tap should just be the furigana, two taps should be the furigana
     * plus the english word underneath, three taps should reveal the box ... the box, when displayed above the word, cuts off
     * the furigana"; 17:19 (thread 73dbfb5a, on the Mac): "HOLDING A WORD does nothing at all". The phone is WebKit at
     * 390×844 by touch; the Mac is Chromium at 1440×900 by mouse (L-mouse also runs WebKit at 1440×900: Safari on a Mac).
     * --ladder-only runs only these; with --controls their three named controls run too. */
    const desk = engine === 'chromium';
    const ladderView = desk ? { viewport: { width: 1440, height: 900 }, mobile: false } : {};
    const press = async (page, locator) => {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (desk) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      else await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    };
    // a press, then the occurrence's own answer to it (its rung moves, or a stage stands or goes), never a fixed guess
    const pressSettled = async (page, locator, pause = 350) => {
      const node = await locator.elementHandle();
      const before = await node.evaluate((n) => ({ rung: n.dataset.ladderRung || null, stages: document.querySelectorAll('#mini').length }));
      await press(page, locator);
      await page.waitForFunction(({ n, before }) => (n.dataset.ladderRung || null) !== before.rung || document.querySelectorAll('#mini').length !== before.stages,
        { n: node, before }, { timeout: 10000 }).catch(() => {});
      // Ladder R4 · the English rung keeps its line empty until its gloss is settled (the lead's F1 ruling): read it settled
      await page.waitForFunction((n) => !n.querySelector(':scope > .tok-en.tok-en-wait'), node, { timeout: 8000 }).catch(() => {});
      await delay(pause);
    };
    // the English row as read: the world's own ink, and no word or reading of another line under it
    const englishLook = (node) => {
      const ink = node.querySelector(':scope > .tok-en .tok-en-text');
      if (!ink) return { ink: false, coversNothing: false };
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-ink)';
      document.body.append(probe);
      const worldInk = getComputedStyle(probe).color;
      probe.remove();
      const box = ink.getBoundingClientRect(), range = document.createRange(), covered = [];
      const hit = (r) => r.width > 0.5 && r.height > 0.5 && box.left < r.right && r.left < box.right && box.top < r.bottom && r.top < box.bottom;
      for (const other of document.querySelectorAll('#reader .tok')) {
        if (other === node || other.contains(node) || node.contains(other)) continue;
        const g = window.__glyphs(other);
        const rects = g ? [{ left: g.left, right: g.left + g.width, top: g.top, bottom: g.top + g.height, width: g.width, height: g.height }] : [];
        for (const rt of other.querySelectorAll('rt')) {
          if (rt.classList.contains('hidden-rt') || getComputedStyle(rt).display === 'none') continue;
          range.selectNodeContents(rt); rects.push(rt.getBoundingClientRect(), ...range.getClientRects());
        }
        if (rects.some(hit)) covered.push(other.dataset.proseLabel || other.textContent);
      }
      return { ink: getComputedStyle(ink).color === worldInk, inkColor: getComputedStyle(ink).color, worldInk, coversNothing: covered.length === 0, covered: covered.slice(0, 6) };
    };
    const othersReading = (word) => word.evaluate((node) => [...document.querySelectorAll('#reader rt')].filter((rt) => !node.contains(rt) &&
      !rt.classList.contains('hidden-rt') && rt.textContent.trim() && getComputedStyle(rt).display !== 'none' && rt.getClientRects().length > 0).length);
    const ladderSchedules = {};
    const ladderClimb = async (page) => {
      await openStory(page);
      const word = readerWord(page);
      await pressSettled(page, word, 300);
      const t1 = await ladderFacts(page, word);
      check('L.tap1', 'tap 1: only the reading over the word: no English, no box', t1.reading && !t1.english && !t1.stages && !t1.page, t1);
      await pressSettled(page, word, 450);
      const t2 = { ...await ladderFacts(page, word), ...await word.evaluate(englishLook) };
      check('L.tap2', 'tap 2: the reading stays and the English stands under the word, ≥ 13 px, in the world\'s ink, over no word or reading of the next line; no box',
        t2.reading && !!t2.english && t2.english !== '—' && t2.englishUnder && t2.englishPx >= 13 && t2.ink && t2.coversNothing && !t2.stages && !t2.page, t2);
      check('L.dots', 'tap 2: data-depth-aside="meaning" on this occurrence and on no other (the DOTS hook)', t2.aside === 'meaning' && t2.asideElsewhere === 0,
        { aside: t2.aside, elsewhere: t2.asideElsewhere });
      await page.screenshot({ path: resolve(evidence, `${engine}-L-tap2.png`) });
      await pressSettled(page, word, 700);
      const t3 = await ladderFacts(page, word), c3 = await boxClear(page, word);
      check('L.tap3', 'tap 3: the box stands, over neither the word\'s reading, nor the word, nor its English', t3.stages === 1 && t3.word === WORD && !t3.page && c3.clear, { t3, c3 });
      await page.screenshot({ path: resolve(evidence, `${engine}-L-tap3.png`) });
      await press(page, page.locator('#mini .mini-word')); await pageSettled(page);
      const full = await pageFacts(page);
      check('L.page', 'then the box\'s word opens the full page, as now', coversViewport(full) && full.headword.startsWith(WORD), full);
      await press(page, page.locator('#sheet-back')); await bare(page);
      const back = await ladderFacts(page, word);
      check('L.back', 'Back returns to the box with the reading and the English still standing', back.stages === 1 && back.word === WORD && back.reading && !!back.english, back);
      await page.keyboard.press('Escape'); await delay(400);
      const folded = await ladderFacts(page, word);
      check('L.fold', 'Escape returns the word bare in one step, as now: no box, no reading, no English, the aside mark gone',
        !folded.stages && !folded.page && !folded.reading && !folded.english && !folded.aside && folded.asideElsewhere === 0, folded);
    };
    const ladderScroll = async (page) => {
      await openStory(page);
      await page.evaluate(() => { const reader = document.getElementById('reader'); scrollTo(0, Math.max(0, reader.getBoundingClientRect().top + scrollY - 140)); });
      await delay(500);
      for (const [dir, where, dy] of [['down', 'bottom', 90], ['up', 'top', -90]]) {
        const index = await pickPlace(page, where);
        const word = page.locator(`#reader .tok[data-index="${index}"]`);
        for (let step = 0; step < 3 && !(await page.locator('#mini').count()); step++) { await pressSettled(page, word, 600); }
        // D7 may glide the text to make the box room: the scroll under test starts once the page stands still
        await page.evaluate(() => new Promise((done) => { let last = scrollY, still = 0; const tick = () => { still = scrollY === last ? still + 1 : 0; last = scrollY; if (still >= 6) done(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
        const before = { ...await boxClear(page, word), scrollY: await page.evaluate(() => scrollY) };
        const wb = await word.boundingBox();
        // the pointer rests on the text, away from the box: a scroll there is the page's, as a trackpad's is
        await page.mouse.move(wb.x + wb.width / 2, before.side === 'above' ? wb.y + wb.height + 36 : wb.y - 36);
        await page.mouse.wheel(0, dy); await delay(700);
        const after = { ...await boxClear(page, word), scrollY: await page.evaluate(() => scrollY) };
        const moved = after.glyphs && before.glyphs ? after.glyphs.top - before.glyphs.top : NaN;
        const rode = after.box && before.box ? after.box.top - before.box.top : NaN;
        check(`L.scroll.${dir}`, `after a 90 px trackpad scroll ${dir} (the box ${before.side} its word), the box travels with its word and covers neither its reading nor the word`,
          before.clear && after.clear && Math.abs(moved) >= 60 && Math.abs(rode - moved) <= 1, { before, after, moved, rode });
        await page.keyboard.press('Escape'); await delay(400);
      }
    };
    const ladderMouse = async (page) => {
      await openStory(page);
      await page.evaluate(() => {
        window.__sealFlights = 0;
        new MutationObserver((records) => { for (const record of records) for (const node of record.addedNodes) if (node.classList?.contains('seal-flight')) window.__sealFlights += 1; })
          .observe(document.body, { childList: true });
      });
      const word = readerWord(page);
      await word.scrollIntoViewIfNeeded(); await delay(300);
      const centre = async () => { const b = await word.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
      const saved = async () => (await readAppRecord(page)).taken.filter((item) => item.t === 'word' && item.id === WORD).length;
      const flights = () => page.evaluate(() => window.__sealFlights);
      const s0 = await saved();
      let at = await centre();
      await page.mouse.move(at.x, at.y); await page.mouse.down();
      await delay(300);
      const ring = await page.locator('.hold-ring').count();
      await delay(450); await page.mouse.up(); await delay(900);
      const first = { ring, strip: await page.locator('#seal-strip').count(), saved: [s0, await saved()], flights: await flights(), ladder: await ladderFacts(page, word),
        rung: await word.getAttribute('data-ladder-rung') };
      check('M.hold', 'a mouse held still on the word: its ring by 300 ms, then the seal, the strip and +1 saved; its release climbs no rung',
        first.ring === 1 && first.strip === 1 && first.saved[1] === s0 + 1 && first.flights === 1 && !first.ladder.reading && !first.ladder.english && !first.ladder.stages && !first.rung, first);
      await page.keyboard.press('Escape'); await delay(400);
      at = await centre();
      await page.mouse.move(at.x, at.y); await page.mouse.down(); await delay(750); await page.mouse.up(); await delay(900);
      const second = { strip: await page.locator('#seal-strip').count(), saved: await saved(), flights: await flights() };
      check('M.second-hold', 'a second mouse hold opens the strip and the word stays saved once: no duplicate, no second seal',
        second.strip === 1 && second.saved === s0 + 1 && second.flights === 1, second);
      await page.keyboard.press('Escape'); await delay(400);
      at = await centre();
      await page.mouse.move(at.x, at.y); await page.mouse.down(); await delay(220);
      const ringBegan = await page.locator('.hold-ring').count();
      for (let step = 1; step <= 8; step++) { await page.mouse.move(at.x + step * 6, at.y + 1); await delay(16); }
      await delay(520);
      const ringLeft = await page.locator('.hold-ring').count();
      await page.mouse.up(); await delay(400);
      const drag = { ringBegan, ringLeft, selected: await page.evaluate(() => String(getSelection() || '')), strip: await page.locator('#seal-strip').count(),
        saved: await saved(), flights: await flights() };
      check('M.drag', 'held 200 ms then dragged: the ring began and left with the move, the drag selected text, and nothing more was sealed',
        drag.ringBegan === 1 && drag.ringLeft === 0 && drag.selected.length > 0 && drag.strip === 0 && drag.saved === s0 + 1 && drag.flights === 1, drag);
      await page.evaluate(() => getSelection()?.removeAllRanges()); await delay(200);
      const climb = [];
      for (let step = 0; step < 3; step++) { at = await centre(); await page.mouse.click(at.x, at.y); await delay(800); climb.push(await ladderFacts(page, word)); }
      check('M.click', 'quick clicks still climb the ladder: the reading, then the English, then the box',
        climb[0].reading && !climb[0].english && !climb[0].stages && climb[1].reading && !!climb[1].english && !climb[1].stages && climb[2].stages === 1 && climb[2].word === WORD,
        climb.map(({ reading, english, stages }) => ({ reading, english, stages })));
    };
    // the word nearest a place on the glass (the first line under the bars, the middle, the last line over the tabs): a
    // kanji content word whose glyphs stand wholly in the reading area there
    const pickPlace = (page, where) => page.evaluate((where) => {
      const edge = (sel, side, fallback) => { const node = document.querySelector(sel); if (!node) return fallback; const style = getComputedStyle(node);
        if (!['fixed', 'sticky'].includes(style.position) || style.display === 'none') return fallback; const box = node.getBoundingClientRect(); return box.height ? box[side] : fallback; };
      const top = Math.max(edge('#app > .chrome', 'bottom', 0), edge('#app > .scale-thread', 'bottom', 0)) + 24;
      const bottom = Math.min(edge('#primary-tabs', 'top', innerHeight), edge('.listen-row', 'top', innerHeight), innerHeight) - 10;
      const target = where === 'top' ? top : where === 'bottom' ? bottom : (top + bottom) / 2;
      let best = null;
      for (const tok of document.querySelectorAll('#reader .tok.content[data-index]')) {
        if (!/\p{Script=Han}/u.test(tok.dataset.proseLabel || '')) continue;
        const box = window.__glyphs(tok);
        if (!box || box.top < top || box.top + box.height > bottom) continue;
        const distance = Math.abs((where === 'bottom' ? box.top + box.height : box.top) - target);
        if (!best || distance < best.distance) best = { distance, index: tok.dataset.index };
      }
      return best?.index ?? null;
    }, where);
    const ladderPlace = (viewport) => async (page) => {
      for (const world of ['hokusai', 'yoru']) {
        await openStory(page, { world });
        for (const [mode, dial] of [[1, 'on-touch'], [2, 'always']]) {
          if (mode !== 1) await furigana(page, mode);
          await page.evaluate(() => { const reader = document.getElementById('reader'); scrollTo(0, Math.max(0, reader.getBoundingClientRect().top + scrollY - 140)); });
          await delay(500);
          const places = [];
          for (const where of ['top', 'mid', 'bottom']) {
            const index = await pickPlace(page, where);
            if (index == null) { places.push({ where, index: null }); continue; }
            const word = page.locator(`#reader .tok[data-index="${index}"]`);
            for (let step = 0; step < 3 && !(await page.locator('#mini').count()); step++) { await pressSettled(page, word, 600); }
            await delay(500);
            places.push({ where, index, label: await word.getAttribute('data-prose-label'), ...await boxClear(page, word) });
            if (where === 'top') await page.screenshot({ path: resolve(evidence, `${engine}-L-place-${viewport.width}-${world}-${dial}-top.png`) });
            await page.keyboard.press('Escape'); await delay(350);
          }
          check(`L.place.${viewport.width}x${viewport.height}.${world}.${dial}`, `${viewport.width}×${viewport.height}, ${world}, ${dial}: on the top line, mid-page and the last line the box covers neither the word's reading, nor the word, nor its English`,
            places.length === 3 && places.every((place) => place.index != null && place.clear), places);
        }
      }
    };
    // the lead's sweep (10-19, W2): the top bar's ‹ Back with a reading, an English or a box up folds the word first, as
    // Escape does (bare in one step), and only the next Back leaves the article
    const ladderBack = async (page) => {
      const results = [];
      for (const [rungs, label] of [[1, 'reading'], [2, 'english'], [3, 'box']]) {
        await openStory(page);
        const word = readerWord(page);
        for (let step = 0; step < rungs; step++) await pressSettled(page, word, step === 2 ? 700 : 350);
        const up = await ladderFacts(page, word);
        await press(page, page.locator('#back')); await delay(600);
        // a Back that left the article leaves no word to read: that is recorded, never waited for
        const view = await page.evaluate(() => document.body.dataset.view);
        const first = { view, ...(view === 'reader' && await word.count() ? await ladderFacts(page, word) : { left: true }) };
        let second = { view };
        if (view === 'reader') { await press(page, page.locator('#back')); await delay(1000); second = await page.evaluate(() => ({ view: document.body.dataset.view })); }
        results.push({ label, up: { reading: up.reading, english: up.english, stages: up.stages },
          first: { view: first.view, reading: first.reading, english: first.english, stages: first.stages, page: first.page }, second });
      }
      check('L.bar-back', 'the top bar\'s ‹ Back with a reading, an English or a box up folds the word bare in one step and stays in the article; the next Back leaves it',
        results.length === 3 && results.every((row) => (row.label === 'reading' ? row.up.reading && !row.up.english && !row.up.stages
          : row.label === 'english' ? !!row.up.english && !row.up.stages : row.up.stages === 1) &&
          row.first.view === 'reader' && !row.first.reading && !row.first.english && !row.first.stages && !row.first.page && row.second.view !== 'reader'), results);
    };
    // the lead's sweep (10-19, D7): 総理 high, in the middle and low on the glass; its box shows both kanji rows (総, 理) whole —
    // inside its painted box, clear of its fading foot, between the bars and the floor — with no scroll of its own, and stands
    // on neither the word nor its reading
    const d7Facts = (word) => word.evaluate((node) => {
      const mini = document.getElementById('mini');
      if (!mini) return { mini: false };
      const edge = (sel, side, fallback) => { const n = document.querySelector(sel); if (!n) return fallback; const style = getComputedStyle(n);
        if (!['fixed', 'sticky'].includes(style.position) || style.display === 'none') return fallback; const b = n.getBoundingClientRect(); return b.height ? b[side] : fallback; };
      const ceiling = Math.max(edge('#app > .chrome', 'bottom', 0), edge('#app > .scale-thread', 'bottom', 0));
      const floor = Math.min(edge('#primary-tabs', 'top', innerHeight), edge('.listen-row', 'top', innerHeight), innerHeight);
      const box = mini.getBoundingClientRect(), more = mini.dataset.more === 'true';
      const shownFoot = box.top + mini.clientHeight - (more ? 32 : 0);
      const rows = [...mini.querySelectorAll('.mini-kanji > .mini-kanji-row')].map((row) => {
        const b = row.getBoundingClientRect();
        return { text: row.textContent.trim().slice(0, 1), top: Math.round(b.top), bottom: Math.round(b.bottom),
          whole: b.top >= box.top - 0.5 && b.bottom <= shownFoot + 0.5 && b.top >= ceiling - 0.5 && b.bottom <= floor + 0.5 };
      });
      const web = mini.querySelector(':scope > .mini-web')?.getBoundingClientRect();
      return { mini: true, scrollTop: mini.scrollTop, more, compact: mini.classList.contains('is-compact'), glide: mini.dataset.glide ?? null,
        mustFoot: web ? Math.round(web.bottom - box.top + mini.scrollTop) : null, scrollY: Math.round(scrollY),
        box: { top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), right: Math.round(box.right) }, ceiling, floor, rows };
    });
    // the word as the card's seat counts it before the stage (its reading over it, its English under it), and the two rooms
    const d7Before = (word) => word.evaluate((node) => {
      const edge = (sel, side, fallback) => { const n = document.querySelector(sel); if (!n) return fallback; const style = getComputedStyle(n);
        if (!['fixed', 'sticky'].includes(style.position) || style.display === 'none') return fallback; const b = n.getBoundingClientRect(); return b.height ? b[side] : fallback; };
      const ceiling = Math.max(8, edge('#app > .chrome', 'bottom', 0), edge('#app > .scale-thread', 'bottom', 0));
      const floor = Math.min(edge('#primary-tabs', 'top', innerHeight), edge('.listen-row', 'top', innerHeight), innerHeight) - 8;
      const range = document.createRange();
      const rects = [node.getBoundingClientRect(), ...[...node.querySelectorAll('rt')].filter((rt) => !rt.classList.contains('hidden-rt'))
        .flatMap((rt) => { range.selectNodeContents(rt); return [rt.getBoundingClientRect(), ...range.getClientRects()]; })].filter((r) => r.height > 0.5);
      const top = Math.min(...rects.map((r) => r.top)), bottom = Math.max(...rects.map((r) => r.bottom));
      // G5's 層 mark at the foot is a floor too for a box that would stand over it (docked in its open block, it is none)
      const markNode = document.getElementById('layers-mark'), markBox = markNode && !markNode.dataset.docked ? markNode.getBoundingClientRect() : null;
      const mark = markBox?.height ? { top: markBox.top, left: markBox.left, right: markBox.right } : null;
      return { scrollY: Math.round(scrollY), roomAbove: Math.round(top - 10 - ceiling), roomBelow: Math.round(floor - (bottom + 10)), wordBottom: bottom, mark };
    });
    const ladderD7 = (viewport) => async (page) => {
      await openStory(page);
      const word = readerWord(page);
      const places = [];
      for (const where of ['high', 'middle', 'low']) {
        await word.evaluate((node, where) => {
          const edge = (sel, side, fallback) => { const n = document.querySelector(sel); if (!n) return fallback; const style = getComputedStyle(n);
            if (!['fixed', 'sticky'].includes(style.position) || style.display === 'none') return fallback; const b = n.getBoundingClientRect(); return b.height ? b[side] : fallback; };
          const ceiling = Math.max(edge('#app > .chrome', 'bottom', 0), edge('#app > .scale-thread', 'bottom', 0));
          const floor = Math.min(edge('#primary-tabs', 'top', innerHeight), edge('.listen-row', 'top', innerHeight), innerHeight);
          const target = where === 'high' ? ceiling + 36 : where === 'middle' ? (ceiling + floor) / 2 - 20 : floor - 90;
          scrollBy(0, node.getBoundingClientRect().top - target);
        }, where);
        await delay(450);
        const placed = await word.evaluate((node) => Math.round(node.getBoundingClientRect().top));
        let before = null;
        for (let step = 0; step < 3 && !(await page.locator('#mini').count()); step++) {
          // the word as it stands just before the tap that opens its card: its rooms decide whether the print may move
          if (['gloss', 'reading'].includes(await word.getAttribute('data-ladder-rung')) || step === 2) before = await d7Before(word);
          await pressSettled(page, word, 500);
        }
        await delay(1100);
        const seen = await d7Facts(word), clear = await boxClear(page, word);
        const moved = seen.mini && before ? seen.scrollY - before.scrollY : null;
        // the print stays still, unless even the compact card's kanji rows had no room beside the word where it stood (D7's
        // case 3), and then it moved exactly the glide the card records
        const still = moved !== null && Math.abs(moved) < 1 && seen.glide === null;
        // the room below ends at the 層 mark where the box, as it stands, spans it (G5: no box over the mark)
        const overMark = !!before?.mark && seen.box && seen.box.left < before.mark.right && seen.box.right > before.mark.left;
        const roomBelow = before && overMark ? Math.min(before.roomBelow, Math.round(before.mark.top - 8 - (before.wordBottom + 10))) : before?.roomBelow;
        const glideJustified = moved !== null && seen.glide !== null && seen.compact && seen.mustFoot !== null &&
          Math.max(before.roomAbove, roomBelow) < seen.mustFoot - 1 && Math.abs(moved - Number(seen.glide)) <= 2;
        places.push({ where, placed, before, overMark, roomBelow, moved, still, glideJustified, ...seen, clear: clear.clear, overReading: clear.overReading, overWord: clear.overWord });
        if (where !== 'high') await page.screenshot({ path: resolve(evidence, `${engine}-L-d7-${viewport.width}-${where}.png`) });
        await page.keyboard.press('Escape'); await delay(400);
      }
      check(`L.d7.${viewport.width}x${viewport.height}`, `${viewport.width}×${viewport.height}: 総理 high, in the middle and low, its box shows 総's and 理's kanji rows whole with no scroll of its own, over neither the word nor its reading; the print still, unless even the compact box had no room there (then it glides exactly that)`,
        places.length === 3 && places.every((place) => place.mini && place.scrollTop === 0 && place.rows?.length === 2 &&
          place.rows[0].text === '総' && place.rows[1].text === '理' && place.rows.every((row) => row.whole) && place.clear &&
          (place.still || place.glideJustified)), places);
    };
    // Ladder R2/R4 · D7 on short glasses. R4 (the lead's ruling on the critic's r2 read, 10-20): the fade may lie on a row's
    // blank padding, never on its ink (every text the box draws, its kanji tiles, Save and the keys beside it); 理 shows
    // whole at 390×560; a scrolled cut box never shows a gap between its rows. The critic's ten short placements (総理 at
    // 30, 45 and 60 % of the clear glass at 390×520, 390×560 and 320×568, and the second 総理 mid-glass at 320×568), each at
    // DPR 1, 2 and 3, WebKit touch, the box opened by observed rungs. The clear glass is read from the glass itself (the
    // first and last points the reader's text answers at the column's centre), so a dock or a bar at the foot moves it
    const clearGlass = (page) => page.evaluate(() => {
      const reader = document.getElementById('reader').getBoundingClientRect(), x = reader.left + reader.width / 2;
      // the reader's own area (its text, the article's head above it), never a bar, a dock or the box (the critic's clearZone)
      const text = (y) => { const e = document.elementFromPoint(x, y); return !!e?.closest('#reader, main') && !e.closest('[data-bar], .chrome, #tabs, nav, header, #mini'); };
      let top = 0; while (top < innerHeight && !text(top)) top += 1;
      let bottom = innerHeight - 1; while (bottom > top && !text(bottom)) bottom -= 1;
      // a dock at the foot (the reader's #app::after strip, Hfix-2e part 2's X-13) takes no pointer: read its own box
      const dock = getComputedStyle(document.getElementById('app'), '::after');
      const dockTop = dock.display !== 'none' && dock.position === 'fixed' && dock.content !== 'none' && parseFloat(dock.height) > 0
        ? innerHeight - (parseFloat(dock.bottom) || 0) - parseFloat(dock.height) : Infinity;
      return { top, bottom: Math.min(bottom + 1, dockTop), dockTop: Number.isFinite(dockTop) ? Math.round(dockTop) : null };
    });
    const d7InkFacts = (page) => page.evaluate(() => {
      const mini = document.getElementById('mini');
      if (!mini) return { mini: false };
      const box = mini.getBoundingClientRect(), border = parseFloat(getComputedStyle(mini).borderTopWidth) || 0;
      const seen = { top: box.top + border, bottom: box.top + border + mini.clientHeight };
      const after = getComputedStyle(mini, '::after'), more = mini.dataset.more === 'true';
      const fade = more && after.content !== 'none' && after.content !== 'normal' ? parseFloat(after.height) : 0;
      const fadeTop = seen.bottom - fade, range = document.createRange(), ink = [];
      const add = (what, r) => { if (r.width > 0.5 && r.height > 0.5) ink.push({ what, top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10 }); };
      const walker = document.createTreeWalker(mini, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const host = t.parentElement;
        if (!t.nodeValue.trim() || !host?.getClientRects().length || host.closest('.visually-hidden, [hidden]')) continue;
        const style = getComputedStyle(host);
        if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
        range.selectNodeContents(t);
        for (const r of range.getClientRects()) add(t.nodeValue.trim().slice(0, 10), r);
      }
      for (const n of mini.querySelectorAll('.mini-kanji-glyph, .mini-take, .mini-actions button')) if (n.getClientRects().length) add(n.className.split(' ')[0] + (n.matches('.mini-kanji-glyph') ? `:${n.textContent.trim()}` : ''), n.getBoundingClientRect());
      const visible = (r) => r.bottom > seen.top + 0.5 && r.top < seen.bottom - 0.5;
      const kanji = [...mini.querySelectorAll('.mini-kanji > .mini-kanji-row')].map((row) => {
        const g = row.querySelector('.mini-kanji-glyph'), rects = [g?.getBoundingClientRect()].filter(Boolean);
        const w = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) { if (!t.nodeValue.trim()) continue; range.selectNodeContents(t); rects.push(...[...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5)); }
        const top = Math.min(...rects.map((r) => r.top)), bottom = Math.max(...rects.map((r) => r.bottom));
        return { kanji: g?.textContent.trim() ?? '', inkTop: Math.round(top * 10) / 10, inkBottom: Math.round(bottom * 10) / 10,
          whole: top >= seen.top - 0.5 && bottom <= (fade ? fadeTop : seen.bottom) + 0.5 };
      });
      return { mini: true, compact: mini.classList.contains('is-compact'), cut: mini.scrollHeight > mini.clientHeight + 1, more, fade,
        seen: { top: Math.round(seen.top * 10) / 10, bottom: Math.round(seen.bottom * 10) / 10 }, fadeTop: Math.round(fadeTop * 10) / 10,
        inkUnderFade: fade ? ink.filter((r) => visible(r) && r.bottom > fadeTop + 0.5).map((r) => `${r.what} ${r.top}–${r.bottom}`) : [],
        inkAcross: ink.filter((r) => r.top < seen.bottom - 0.5 && r.bottom > seen.bottom + 0.5).map((r) => `${r.what} ${r.top}–${r.bottom}`),
        kanji, folds: [...mini.querySelectorAll('[data-fold]')].length, glide: mini.dataset.glide ?? null, side: mini.dataset.side ?? null };
    });
    const D7_PLACES = { '390x520': [[0, 0.3], [0, 0.45], [0, 0.6]], '390x560': [[0, 0.3], [0, 0.45], [0, 0.6]], '320x568': [[1, 0.45], [0, 0.3], [0, 0.45], [0, 0.6]] };
    const placeWord = async (page, word, spot) => {
      for (let k = 0; k < 2; k++) {
        const glass = await clearGlass(page);
        await word.evaluate((node, { glass, spot }) => scrollBy(0, window.__glyphs(node).top - (glass.top + (glass.bottom - glass.top) * spot)), { glass, spot });
        await delay(300);
      }
    };
    const openBox = async (page, word) => {
      const rungs = [];
      for (let step = 0; step < 3 && !(await page.locator('#mini').count()); step++) {
        await pressSettled(page, word, 500);
        rungs.push(await page.locator('#mini').count() ? 'stage' : await word.getAttribute('data-ladder-rung'));
      }
      await delay(1500);
      return rungs;
    };
    const ladderD7Ink = (viewport, dsf) => async (page) => {
      await openStory(page);
      const size = `${viewport.width}x${viewport.height}`, places = [];
      for (const [nth, spot] of D7_PLACES[size]) {
        const word = page.locator(`#reader .tok[data-prose-label="${WORD}"]`).nth(nth);
        await placeWord(page, word, spot);
        const glass = await clearGlass(page), index = Number(await word.getAttribute('data-index'));
        const rungs = await openBox(page, word);
        const seen = await d7InkFacts(page), clear = await boxClear(page, word);
        places.push({ index, spot, glass, rungs, ...seen, clear: clear.clear, overReading: clear.overReading, overWord: clear.overWord, overEnglish: clear.overEnglish });
        if (spot === 0.45) await page.screenshot({ path: resolve(evidence, `${engine}-L-d7-ink-${size}-dsf${dsf}-${nth ? 'second' : 'first'}.png`) });
        await page.keyboard.press('Escape'); await delay(400);
        if (await page.locator('#mini').count()) { await page.keyboard.press('Escape'); await delay(400); }
      }
      const riWhole = size !== '390x560' || places.every((place) => place.kanji?.length === 2 && place.kanji.every((k) => k.whole));
      check(`L.d7.ink.${size}.dpr${dsf}`, `${viewport.width}×${viewport.height} at DPR ${dsf}: 総理 at 30, 45 and 60 % of the clear glass${size === '320x568' ? ' and the second 総理 mid-glass' : ''}: its box, opened by observed rungs, is compact; where it is cut its fade lies on no ink (its texts, kanji tiles, Save and its keys) and the cut crosses none; it stands on neither the word, its reading nor its English${size === '390x560' ? '; 理 shows whole (総 and 理 both above the fade)' : ''}`,
        places.length === D7_PLACES[size].length && riWhole && places.every((place) => place.mini && place.compact && place.rungs.at(-1) === 'stage' && place.clear &&
          (!place.cut || (place.more && place.fade >= 16 && place.inkUnderFade.length === 0 && place.inkAcross.length === 0))), places);
    };
    // Ladder R4 · a cut box scrolled through its rows shows no gap between them: its kanji rows abut as in the whole box
    // (round 2 folded them 33 px apart), and no row is folded. 390×520 is held (the lead's call on a shorter head): its
    // fold is recorded, never judged here
    const ladderD7Gap = async (page) => {
      await openStory(page);
      const out = [];
      for (const viewport of [{ width: 390, height: 560 }, { width: 320, height: 568 }]) {
        await page.setViewportSize(viewport);
        await delay(400);
        const word = page.locator(`#reader .tok[data-prose-label="${WORD}"]`).first();
        await placeWord(page, word, 0.45);
        await openBox(page, word);
        const steps = [];
        const facts = () => page.evaluate(() => {
          const mini = document.getElementById('mini');
          if (!mini) return null;
          const rows = [...mini.querySelectorAll('.mini-kanji > .mini-kanji-row')].map((r) => r.getBoundingClientRect());
          return { scrollTop: Math.round(mini.scrollTop), cut: mini.scrollHeight > mini.clientHeight + 1, folds: mini.querySelectorAll('[data-fold]').length,
            gaps: rows.slice(1).map((r, k) => Math.round((r.top - rows[k].bottom) * 10) / 10) };
        });
        for (let k = 0; k < 12; k++) {
          const f = await facts();
          if (!f) break;
          steps.push(f);
          const end = await page.evaluate(() => { const m = document.getElementById('mini'); const before = m.scrollTop; m.scrollTop += 40; return m.scrollTop === before; });
          if (end) break;
          await delay(120);
        }
        out.push({ size: `${viewport.width}x${viewport.height}`, steps });
        await page.keyboard.press('Escape'); await delay(400);
        if (await page.locator('#mini').count()) { await page.keyboard.press('Escape'); await delay(400); }
      }
      check('L.d7.scroll-gap', 'a cut box scrolled through its rows (390×560 and 320×568, 総理 mid-glass) shows no gap between them: its kanji rows abut, no row is folded',
        out.length === 2 && out.every((o) => o.steps.length > 0 && o.steps[0].cut && o.steps.every((st) => st.folds === 0 && st.gaps.every((g) => Math.abs(g) <= 1))), out);
    };
    // Ladder R2 · the English rung's words (the critic's round-1 FAIL, 10-20: tap 2 repeated the quick dictionary's first
    // gloss, and 9 of the story's 102 content words showed "—"). On a cold dictionary (its index answering 1.8 s late), every
    // text an English row says is recorded as it changes (EN_TRACE). A word whose sense the article's sense data names (the
    // sidecar: 先 in 出荷先 is "destination", ため in 広げていくために "sake") never says another meaning, not even first; a word
    // whose box has a meaning says it under the word (スタートアップ: "startup"), a word whose box has none says nothing,
    // and no row ever says "—". Ladder R3 (the lead's ruling, 10-20, on Kimi's check 0458): Kimi's worst five, from the
    // reviewed rows the sense data now has for both test articles — 式 in 表彰式 "ceremony", フード in フードテック "food",
    // ロール in ロールモデル "role", 誠 in 誠に "indeed", 対応 in 災害対応 "response" (the second article) — and ため led by
    // "purpose"
    const GLOSS_A2 = Object.freeze({ id: 'kantei:jp-105-actions-202609-15hyousyou', search: '防災功労者' });
    const GLOSS_SENSE = [{ index: 155, s: '先', english: 'destination', never: 'point' }, { index: 256, s: 'ため', english: 'purpose', never: 'good' },
      { index: 21, s: '式', english: 'ceremony', never: 'way' }, { index: 318, s: 'フード', english: 'food', never: 'hood' },
      { index: 191, s: 'ロール', english: 'role', never: 'roll' }, { index: 207, s: '誠', english: 'indeed', never: 'truth' },
      { story: GLOSS_A2, index: 244, s: '対応', english: 'response', never: 'correspondence' }];
    const glossWant = (w) => GLOSS_SENSE.find((f) => f.index === w.index && (f.story?.id || STORY.id) === w.at);
    const GLOSS_PLAIN = [{ index: 17, s: 'スタートアップ', english: 'startup' }, { index: 90, s: 'Ｍｕｊｉｎ' }, { index: 123, s: 'ＡＩ' }, { index: 128, s: '実装' },
      { index: 212, s: 'ござい' }, { index: 217, s: '各賞' }];
    const ladderGloss = async (page) => {
      await page.route('**/data/share_alike/dict-v2/index.json', async (route) => { await delay(1800); await route.continue().catch(() => {}); });
      const words = [], traced = [];
      const walkWords = async (fixtures) => { for (const fixture of fixtures) {
        const word = page.locator(`#reader .tok[data-index="${fixture.index}"]`);
        await word.evaluate((node) => node.scrollIntoView({ block: 'center' }));
        await delay(250);
        const label = await word.getAttribute('data-prose-label');
        for (let step = 0; step < 2 && (await word.getAttribute('data-ladder-rung')) !== 'gloss' && !(await page.locator('#mini').count()); step++) {
          await pressSettled(page, word, 300);
        }
        const rung = await word.getAttribute('data-ladder-rung');
        // its answer: the row stops waiting once its reading's rows and its sense are in (the first word waits for the index)
        await page.waitForFunction((node) => !node.querySelector(':scope > .tok-en.tok-en-wait'), await word.elementHandle(), { timeout: 15000 }).catch(() => {});
        await delay(words.length ? 1200 : 2600);
        const row = await word.evaluate((node) => {
          const line = node.querySelector(':scope > .tok-en'), ink = line?.querySelector('.tok-en-text');
          return { english: ink ? ink.textContent : null, drawn: !!line && getComputedStyle(line).display !== 'none' && line.getClientRects().length > 0 && !!ink?.textContent.trim() };
        });
        // the box: what its meaning line says once it has settled (not busy, its sense not pending)
        await pressSettled(page, word, 300);
        await page.waitForFunction(() => { const m = document.getElementById('mini'); return !!m && !m.getAttribute('aria-busy') && m.dataset.sense !== 'pending'; }, null, { timeout: 15000 }).catch(() => {});
        await delay(300);
        const box = await page.evaluate(() => { const gloss = document.querySelector('#mini .mini-gloss');
          return { box: !!document.getElementById('mini'), gloss: gloss?.textContent.trim() ?? null, miss: !!gloss?.matches('.mini-miss, .mini-wait') }; });
        words.push({ ...fixture, at: fixture.story?.id || STORY.id, label, rung, ...row, ...box, seen: await page.evaluate((i) => window.__en?.[i] || [], fixture.index) });
        await page.keyboard.press('Escape'); await delay(350);
        if (await page.locator('#mini').count()) { await page.keyboard.press('Escape'); await delay(350); }
      } };
      // the story, then the second test article (its own page: a cold dictionary again)
      await openStory(page);
      await walkWords([...GLOSS_SENSE.filter((f) => !f.story), ...GLOSS_PLAIN]);
      traced.push(await page.evaluate(() => window.__en || {}));
      await openStory(page, { story: GLOSS_A2 });
      await walkWords(GLOSS_SENSE.filter((f) => f.story));
      traced.push(await page.evaluate(() => window.__en || {}));
      const dashes = traced.flatMap((all) => Object.entries(all).flatMap(([index, texts]) => texts.filter((text) => /^\s*[—–-]\s*$/u.test(text)).map((text) => `#${index} ${text}`)));
      const plain = words.filter((w) => !w.never);
      check('L.gloss.never-dash', 'no English row under a word ever says "—" (the story\'s dash words on a cold dictionary): a word whose box has a meaning says it under the word (スタートアップ "startup"), a word whose box has none says nothing, its rung standing',
        plain.length === GLOSS_PLAIN.length && dashes.length === 0 && plain.every((w) => {
          const want = GLOSS_PLAIN.find((f) => f.index === w.index);
          return w.rung === 'gloss' && w.box && (w.gloss && !w.miss ? w.drawn && !!w.english?.trim() : !w.drawn && !w.english?.trim()) &&
            (!want.english || w.english === want.english);
        }), { dashes, words: plain });
      const sensed = words.filter((w) => w.never);
      // another meaning: any text but the sense's own (a dash is no meaning; L.gloss.never-dash judges it)
      for (const w of sensed) w.wrong = w.seen.filter((text) => text.trim() && !/^[—–-]$/u.test(text.trim()) && text.trim() !== glossWant(w)?.english);
      check('L.gloss.sense', 'a word whose sense the article\'s sense data names says that sense\'s gloss under it, on a cold dictionary, and never another meaning first: 先 in 出荷先 "destination", ため "purpose"; Kimi\'s worst five 式 "ceremony", フード "food", ロール "role", 誠 "indeed", 対応 "response"',
        sensed.length === GLOSS_SENSE.length && sensed.every((w) => !!glossWant(w) && w.rung === 'gloss' && w.drawn && w.english === glossWant(w).english && !w.wrong.length),
        { words: sensed.map(({ at, index, s, label, rung, english, drawn, gloss, seen, wrong }) => ({ at, index, s, label, rung, english, drawn, box: gloss, seen, wrong })) });
    };
    // Ladder R4 · F1 (the lead's ruling on the critic's r2 read, 10-20: "never show an English word that later changes"): on
    // a cold dictionary (its index 1.8 s late) every frame of each English row is recorded; the words the critic saw swap
    // (また "again" → "and", とも, おら/おり, 全て in both test articles; くれる and しまう in Bunki's own) show no gloss but
    // their settled one, an empty line before it. F2 ("the row must match the box"): te-form もらう and いただく say under
    // the word the gloss their box leads with ("to get someone to do something"), as the box draws it
    const GLOSS_STORIES = {
      gratitude: Object.freeze({ id: 'bunki-graded-n3-gratitude-week', search: '感謝の言葉' }),
      hofstadter: Object.freeze({ id: 'bunki-read-n2-hofstadter-law', search: 'ホフスタッター' }),
    };
    const SETTLED_CASES = [{ story: STORY, words: [132, 185, 282, 304, 316, 351, 369, 385] }, { story: GLOSS_A2, words: [165, 248, 338] },
      { story: GLOSS_STORIES.gratitude, words: [273] }, { story: GLOSS_STORIES.hofstadter, words: [185] }];
    const BOX_CASES = [{ story: STORY, words: [344] }, { story: GLOSS_STORIES.gratitude, words: [195] }, { story: GLOSS_STORIES.hofstadter, words: [332, 470] }];
    // the box's first meaning line, trimmed as the row trims it (corridor.js boxLeadGloss)
    const boxTrim = (text) => { const plain = String(text || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim() || String(text || '');
      return plain.length > 18 && plain.includes(',') ? plain.split(',')[0].trim() : plain; };
    const englishWalk = async (page, cases) => {
      await page.route('**/data/share_alike/dict-v2/index.json', async (route) => { await delay(1800); await route.continue().catch(() => {}); });
      const words = [];
      for (const { story, words: list } of cases) {
        await openStory(page, { story });
        for (const index of list) {
          const word = page.locator(`#reader .tok[data-index="${index}"]`);
          await word.evaluate((node) => node.scrollIntoView({ block: 'center' }));
          await delay(250);
          const label = await word.getAttribute('data-prose-label');
          for (let step = 0; step < 2 && (await word.getAttribute('data-ladder-rung')) !== 'gloss' && !(await page.locator('#mini').count()); step++) {
            await pressSettled(page, word, 300);
          }
          const rung = await word.getAttribute('data-ladder-rung');
          await delay(400);
          const english = await word.evaluate((node) => node.querySelector(':scope > .tok-en .tok-en-text')?.textContent ?? null);
          await pressSettled(page, word, 300);
          await page.waitForFunction(() => { const m = document.getElementById('mini'); return !!m && !m.getAttribute('aria-busy') && m.dataset.sense !== 'pending'; }, null, { timeout: 15000 }).catch(() => {});
          await delay(300);
          const box = await page.evaluate(() => document.querySelector('#mini .mini-gloss')?.textContent.trim() ?? null);
          const frames = (await page.evaluate((i) => window.__enFrames?.[i] || [], index)).map((f) => ({ text: f.text, frames: f.frames, ms: Math.round(f.until - f.from) }));
          words.push({ at: story.id, index, label, rung, english, box, frames, other: frames.filter((f) => f.text.trim() && f.text !== english) });
          await page.keyboard.press('Escape'); await delay(350);
          if (await page.locator('#mini').count()) { await page.keyboard.press('Escape'); await delay(350); }
        }
      }
      return words;
    };
    const ladderSettled = async (page) => {
      const words = await englishWalk(page, SETTLED_CASES);
      check('L.gloss.settled', 'cold (the index 1.8 s late), frame by frame: また, とも, おら/おり and 全て in both test articles, くれる and しまう in Bunki\'s own show under the word only their settled gloss, an empty line before it, never one that later changes',
        words.length === SETTLED_CASES.reduce((n, c) => n + c.words.length, 0) && words.every((w) => w.rung === 'gloss' && !!w.english?.trim() && !w.other.length), words);
    };
    const ladderBox = async (page) => {
      const words = await englishWalk(page, BOX_CASES);
      check('L.gloss.box', 'te-form いただく (担い手になっていただく) and もらう (gratitude-week, hofstadter-law) say under the word the gloss their box leads with, as the box draws it, never "to receive"',
        words.length === BOX_CASES.reduce((n, c) => n + c.words.length, 0) && words.every((w) => w.rung === 'gloss' && !!w.box && w.english === boxTrim(w.box) && !w.other.length), words);
    };
    const ladderRun = async (name, body, options = {}) => {
      const begin = rows.length;
      await walk(name, body, options);
      ladderSchedules[name] = rows.slice(begin);
    };
    await ladderRun('L-climb', ladderClimb, ladderView);
    await walk('L-dials', async (page) => {
      // always: the reading is up at rest, so tap 1 is the English and tap 2 the box
      await openStory(page); await furigana(page, 2);
      let word = readerWord(page);
      await pressSettled(page, word, 450);
      const a1 = await ladderFacts(page, word);
      check('L.always.tap1', 'ふりがな always: tap 1 is the English under the word (its reading already up), no box', a1.reading && !!a1.english && a1.englishUnder && !a1.stages && !a1.page, a1);
      await pressSettled(page, word, 700);
      const a2 = await ladderFacts(page, word);
      check('L.always.tap2', 'ふりがな always: tap 2 is the box', a2.stages === 1 && a2.word === WORD && !a2.page, a2);
      await page.keyboard.press('Escape'); await delay(300);
      // off: a tap still shows that one word's reading first (that is what tapping is for), then its English, then the box
      await openStory(page); await furigana(page, 0);
      word = readerWord(page);
      await pressSettled(page, word, 300);
      const o1 = { ...await ladderFacts(page, word), others: await othersReading(word) };
      check('L.off.tap1', 'ふりがな off: tap 1 shows that one word\'s reading and no other: no English, no box', o1.reading && o1.others === 0 && !o1.english && !o1.stages && !o1.page, o1);
      await pressSettled(page, word, 450);
      const o2 = await ladderFacts(page, word);
      check('L.off.tap2', 'ふりがな off: tap 2 keeps the reading and sets the English under the word, no box', o2.reading && !!o2.english && o2.englishUnder && !o2.stages, o2);
      await pressSettled(page, word, 700);
      const o3 = await ladderFacts(page, word);
      check('L.off.tap3', 'ふりがな off: tap 3 is the box', o3.stages === 1 && o3.word === WORD && !o3.page, o3);
      await page.keyboard.press('Escape'); await delay(400);
      const of = { ...await ladderFacts(page, word), others: await othersReading(word) };
      check('L.off.fold', 'ふりがな off: the fold leaves the word bare, no reading anywhere', !of.stages && !of.reading && !of.english && of.others === 0, of);
    }, ladderView);
    await walk('L-kana', async (page) => {
      await openStory(page, { story: { id: 'global-voices:2026-09-28-65726', search: 'ダマスカス' } });
      const word = page.locator('#reader .tok[data-index="0"]');
      const label = await word.getAttribute('data-prose-label');
      await pressSettled(page, word, 450);
      const k1 = await ladderFacts(page, word);
      check('L.kana.tap1', 'a kana-only word (ダマスカス): tap 1 is its English, with no reading invented, no box', label === 'ダマスカス' && !k1.reading && !!k1.english && k1.englishUnder && !k1.stages, { label, ...k1 });
      await pressSettled(page, word, 700);
      const k2 = await ladderFacts(page, word);
      check('L.kana.tap2', 'a kana-only word: tap 2 is the box', k2.stages === 1 && k2.word === 'ダマスカス' && !k2.page, k2);
    }, ladderView);
    for (const viewport of desk ? [{ width: 1440, height: 900 }] : [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }])
      await walk(`L-place-${viewport.width}`, ladderPlace(viewport), { viewport, mobile: !desk });
    // a trackpad scroll is the Mac's (on the phone a scroll begins with a touch, which folds the box as now): both engines at
    // 1440×900 by mouse wheel, WebKit standing for Safari on a Mac (mobile WebKit has no wheel)
    const macView = { viewport: { width: 1440, height: 900 }, mobile: false };
    await ladderRun('L-scroll', ladderScroll, macView);
    await ladderRun('L-mouse', ladderMouse, { viewport: { width: 1440, height: 900 }, mobile: false });
    await ladderRun('L-back', ladderBack, ladderView);
    const d7Views = desk ? [{ width: 1440, height: 900 }] : [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }];
    // the D7 control runs where John reads: the Mac in Chromium, the 390×844 phone in WebKit
    const d7Control = desk ? d7Views[0] : d7Views[1];
    for (const viewport of d7Views) await ladderRun(`L-d7-${viewport.width}`, ladderD7(viewport), { viewport, mobile: !desk });
    // Ladder R2 · D7's fade on the short glasses, where the critic found it on a row: the phone (the Mac's glass is never this
    // short); the English rung's words in both engines
    const d7ShortViews = desk ? [] : [{ width: 390, height: 520 }, { width: 390, height: 560 }, { width: 320, height: 568 }];
    for (const viewport of d7ShortViews) for (const dsf of [1, 2, 3]) {
      await ladderRun(`L-d7i-${viewport.width}x${viewport.height}-dpr${dsf}`, ladderD7Ink(viewport, dsf), { viewport, mobile: true, dsf });
    }
    if (!desk) await ladderRun('L-d7-gap', ladderD7Gap, { viewport: { width: 390, height: 560 }, mobile: true });
    const glossView = { ...ladderView, init: EN_TRACE };
    await ladderRun('L-gloss', ladderGloss, glossView);
    const settledView = { ...ladderView, init: EN_FRAMES };
    await ladderRun('L-settled', ladderSettled, settledView);
    await ladderRun('L-box', ladderBox, settledView);
    if (withControls && ladderOn) {
      // the Ladder's own named controls: each served in memory (page.route), never edited on disk; killed only when its named
      // rows fail for the witnessed reason while every other row of its schedule passes, and the unmodified restore passes
      const ladderSpecs = [
        { id: 'mouse-ignored', run: 'L-mouse', body: ladderMouse, options: { viewport: { width: 1440, height: 900 }, mobile: false },
          kills: ['M.hold', 'M.second-hold', 'M.drag'], witness: (row) => row.observed.ring === 0 && row.observed.strip === 0,
          edits: [{ file: 'corridor.js', key: 'mouse-never-holds', from: "    if (mouse && (event.button !== 0 || event.ctrlKey)) return;",
            to: '    if (mouse) return; // Ladder negative: a mouse or trackpad press is never a hold' }] },
        { id: 'card-fixed-to-glass', run: 'L-scroll', body: ladderScroll, options: macView, kills: ['L.scroll.down', 'L.scroll.up'],
          witness: (row) => Math.abs(row.observed.rode) < 1 && Math.abs(row.observed.moved) >= 60,
          edits: [{ file: 'corridor.js', key: 'card-stays-on-the-glass',
            from: "  const ox = scroller === 'window' ? window.scrollX : 0, oy = scroller === 'window' ? startScroll + shift : 0;\n  if (scroller === 'window') {",
            to: "  const ox = 0, oy = 0; // Ladder negative: the card is fixed to the glass\n  if (false) {" }] },
        { id: 'back-leaves-at-once', run: 'L-back', body: ladderBack, options: ladderView, kills: ['L.bar-back'],
          witness: (row) => row.observed.some((step) => step.first.view !== 'reader'),
          edits: [{ file: 'corridor.js', key: 'bar-back-cleared-at-press',
            from: "(!ladderVisit.demo && target.closest?.('#back, [data-bar-back]'))",
            to: "false /* Ladder negative: the bar's Back clears the word at its press */" }] },
        { id: 'no-room-made', run: `L-d7-${d7Control.width}`, body: ladderD7(d7Control),
          options: { viewport: d7Control, mobile: !desk }, kills: [`L.d7.${d7Control.width}x${d7Control.height}`],
          witness: (row) => row.observed.some((place) => place.rows?.some((r) => !r.whole)),
          edits: [{ file: 'corridor.js', key: 'no-compact-card',
            from: "    if (top == null && !sentence && anchor?.matches?.('#reader .tok, .japanese-lookup-word, .sentence-tok') &&\n        card.querySelector(':scope > .mini-web') && !card.classList.contains('is-compact')) {",
            to: '    if (false) { // Ladder negative: no compact card' },
          { file: 'corridor.js', key: 'no-glide',
            from: '    if (top == null && !sentence && scroller && card._mayGlide && Math.max(roomAbove - shift, roomBelow + shift) < mustShowHeight(card)) {',
            to: '    if (false) { // Ladder negative: no room made; the card is cut where it stands' }] },
        { id: 'no-aside-mark', run: 'L-climb', body: ladderClimb, options: ladderView, kills: ['L.dots'], witness: (row) => row.observed.aside === null,
          edits: [{ file: 'corridor.js', key: 'english-without-aside', from: "  if (hasEn) span.dataset.depthAside = 'meaning';",
            to: "  if (false) span.dataset.depthAside = 'meaning'; // Ladder negative: the English row leaves the dot in place" }] },
        // Ladder R2 · the cut takes no account of its fade (Hfix-1A's rowCut alone): at 390×560 the fade lies on 理's row
        ...(desk ? [] : [{ id: 'fade-on-a-row', run: 'L-d7i-390x560-dpr2', body: ladderD7Ink({ width: 390, height: 560 }, 2),
          options: { viewport: { width: 390, height: 560 }, mobile: true, dsf: 2 }, kills: ['L.d7.ink.390x560.dpr2'],
          witness: (row) => row.observed.some((place) => place.inkUnderFade?.length > 0),
          edits: [{ file: 'corridor.js', key: 'cut-without-its-fade',
            from: "      const fit = (card.classList.contains('is-compact') ? fadeCut(card, room) : null) ?? rowCut(card, room);",
            to: '      const fit = rowCut(card, room); // Ladder negative: the cut leaves its fade no room' }] }]),
        // Ladder R4 · F1's control: the row paints the word's quick gloss at once, then its settled one (round 2's swap)
        { id: 'provisional-paint', run: 'L-settled', body: ladderSettled, options: settledView, kills: ['L.gloss.settled'],
          witness: (row) => row.observed.some((w) => w.other?.length > 0),
          edits: [{ file: 'corridor.js', key: 'english-painted-at-once', from: "  const line = inlineGlossLine(settled ? readerTokenLead(token) : '', !settled);",
            to: "  const line = inlineGlossLine(readerTokenLead(token), !settled); // Ladder negative: the quick gloss painted at once" }] },
        // Ladder R4 · F2's control: the row takes the dictionary's shortest early gloss, not the one its box leads with
        { id: 'row-not-the-box', run: 'L-box', body: ladderBox, options: settledView, kills: ['L.gloss.box'],
          witness: (row) => row.observed.some((w) => w.box && w.english !== boxTrim(w.box)),
          edits: [{ file: 'corridor.js', key: 'english-shortest-gloss', from: '  return boxLeadGloss(readerQuickRecordAsRead(door));',
            to: "  return inlineGloss(readerQuickRecordAsRead(door)) || ''; // Ladder negative: the shortest early gloss" }] },
        // Ladder R4 · the scroll-gap row's control: round 2's fold where the ink leaves the fade room (390×560)
        ...(desk ? [] : [{ id: 'fold-at-560', run: 'L-d7-gap', body: ladderD7Gap, options: { viewport: { width: 390, height: 560 }, mobile: true },
          kills: ['L.d7.scroll-gap'], witness: (row) => row.observed.some((o) => o.steps.some((st) => st.folds > 0)),
          edits: [{ file: 'corridor.js', key: 'fold-where-the-ink-has-room', from: '  if (best) return best;\n', to: '  if (false) return best; // Ladder negative: a fold instead\n' },
            { file: 'corridor.js', key: 'fold-from-the-row-box', from: '    const inkFoot = Math.max(0, ...ink.filter(([top]) => top < foot.bottom - 0.5).map(([, bottom]) => bottom));',
              to: "    const inkFoot = foot.bottom; // Ladder negative: round 3's fold, measured from the row's box" }] }]),
        // Ladder R2 · a word with no English says the dash again
        { id: 'dash-for-none', run: 'L-gloss', body: ladderGloss, options: glossView, kills: ['L.gloss.never-dash'],
          witness: (row) => row.observed.dashes?.length > 0,
          edits: [{ file: 'corridor.js', key: 'english-dash', from: "  line.querySelector('.tok-en-text').textContent = text || '';",
            to: "  line.querySelector('.tok-en-text').textContent = text || '—'; // Ladder negative: the dash" },
          { file: 'corridor.js', key: 'english-dash-drawn', from: "  line.classList.toggle('tok-en-miss', !text && !waiting);",
            to: "  line.classList.toggle('tok-en-miss', false); // Ladder negative: the dash is drawn" }] },
        // Ladder R2 · the English rung takes the word's own first gloss, never the sense its sentence uses
        { id: 'english-ignores-sense', run: 'L-gloss', body: ladderGloss, options: glossView, kills: ['L.gloss.sense'],
          witness: (row) => row.observed.words?.some((w) => w.wrong?.length > 0),
          edits: [{ file: 'corridor.js', key: 'english-without-sense', from: 'const readerTokenLead = (token) => readerDoorLead(readingToken(token));',
            to: 'const readerTokenLead = (token) => readerDoorLead(readingTokenEntry(token)); // Ladder negative: the English never takes the sense' }] },
      ];
      for (const spec of ladderSpecs) {
        // a narrowed run (KAIRO_LADDER_WALKS) runs only the controls of the walks it ran
        if (ladderOnly && ladderWalks.length && !ladderWalks.some((prefix) => spec.run.startsWith(prefix))) continue;
        const baseline = ladderSchedules[spec.run] || [];
        const expected = baseline.map((row) => row.id);
        const control = { engine, id: `ladder:${spec.id}`, edits: spec.edits, served: [], pageErrors: [] };
        const begin = rows.length;
        await walk(spec.run, spec.body, { ...spec.options, control });
        control.rows = rows.splice(begin);
        const kills = spec.kills.map((id) => `${engine}/${id}`);
        const targets = kills.map((id) => control.rows.find((row) => row.id === id));
        const cleanCandidate = baseline.length > 1 && baseline.every((row) => row.ok) && new Set(expected).size === expected.length;
        const complete = !control.error && control.pageErrors.length === 0 && JSON.stringify(control.rows.map((row) => row.id)) === JSON.stringify(expected) &&
          spec.edits.every((edit) => control.served.some((served) => served.file === edit.file && served.applied.some((applied) => applied.key === edit.key)));
        const killed = cleanCandidate && complete && targets.every((row) => row && !row.ok) && spec.witness(targets[0]) &&
          control.rows.every((row) => kills.includes(row.id) || row.ok);
        control.verdict = !cleanCandidate || !complete ? 'incomplete' : killed ? 'killed' : targets.some((row) => row?.ok) ? 'survived' : 'contaminated';
        const restoreBegin = rows.length;
        await walk(spec.run, spec.body, { ...spec.options, phase: `restore:${spec.id}` });
        control.restore = rows.splice(restoreBegin);
        const restored = JSON.stringify(control.restore.map((row) => row.id)) === JSON.stringify(expected) && control.restore.every((row) => row.ok);
        controls.push(control);
        check(`L.negative.${spec.id}`, 'candidate passes, named product mutation fails its intended assertions, and unmodified restore passes',
          killed && restored, { verdict: control.verdict, cleanCandidate, complete, restored, targets, error: control.error });
      }
    }

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
      await page.evaluate(() => {
        window.__vhHeldInk = null;
        window.addEventListener('pointerdown', () => {
          const word = document.querySelector('#mini .mini-word');
          const offsets = [...(word?.querySelectorAll('.ink-wet path') || [])].map(path=>parseFloat(getComputedStyle(path).strokeDashoffset));
          window.__vhHeldInk={ended:word?.dataset.inkEnded==='input'?1:0, chars:word?.querySelectorAll('.ink-char').length??0,
            offsets, drawn:offsets.length>0 && offsets.every(value=>Number.isFinite(value)&&value<=0.001)};
        }, {capture:true,once:true});
      });
      await locator.tap();
      const after = await page.evaluate(() => window.__vhHeldInk);
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
        // G2 · the encounter ledger counts the reading the first tap raises (a reading raised is an encounter), so a word
        // never met before stands at "met" by its stage: still a first meeting, which writes itself. Its having no
        // encounter before the tap is read from the record
        const metBefore = Object.keys((await readAppRecord(page)).met?.entries || {}).some((key) => { try { return JSON.parse(key)[2] === label; } catch { return false; } });
        await stage(page, word);
        const first = await inkFacts(page);
        const stageDepthOf = depth === 'unmet' ? (metBefore ? null : 'met') : depth;
        if (depth === 'unmet' || depth === 'met') {
          check(`G4.depth.${depth}.write`, `${depth} (${label}): the word comes closer to write itself — its whole お手本 there from the first frame, the type held for the ink, the reading's place kept but unwritten, the word still one child of its band`,
            first.ceremony === 'write' && first.depth === stageDepthOf && ['arriving', 'writing'].includes(first.ink) && first.chars === [...label].length &&
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
      check('G4.tempo.slider', 'the one slider set slow, fast and middle (0.55 · 2.2 · 1.1), as the device keeps it',
        slow.set.value === '0' && slow.set.stored === '0.55' && fast.set.value === '2' && fast.set.stored === '2.2' && middle.set.value === '1' && middle.set.stored === '1.1', measured);
      check('G4.tempo.planned', `総理 (${middle.strokes} strokes): each stroke min(110, 1400 ÷ strokes) ≥ 45 ms at the middle step — 1.4 s — scaled by the slider`,
        middle.strokes === 25 && middle.planned === 1400 && slow.planned === expect(0.55) && fast.planned === expect(2.2), measured);
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
      // paper a finger lands on: no word within a fingertip of it, since Chromium adjusts a touch to a door near it (Hfix-1A:
      // item 11's proportional digits reflowed the story, and its "た。" line came to sit at the old fixed point)
      const gutter = await page.evaluate(() => {
        const r = document.getElementById('reader').getBoundingClientRect(), x = Math.max(2, r.left / 2);
        const near = (y) => [...document.querySelectorAll('#reader .tok, #reader button, #reader a, #reader [role="button"]')].some((n) => {
          const b = n.getBoundingClientRect(); return b.width && b.left - x < 40 && b.top - 28 < y && b.bottom + 28 > y; });
        for (let y = Math.min(innerHeight - 140, 760); y > 160; y -= 6) if (!near(y)) return { x, y };
        return { x, y: Math.min(innerHeight - 140, 760) };
      });
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
        // G2 · the stage's depth is the ledger's (a never-met word stands at "met" once its first tap raised the reading): the
        // mark leaves it as the stage had it
        again.ink === 'writing' && again.depth === never.depth && (await inkFacts(page)).ended === 'written' && await record() === kept, { again, never: never.depth, same: await record() === kept });
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
        // the build's state decides which absence it names: no recording yet for this word, or (the merged build: the voice
        // lane's word clips are withdrawn) no recorded voices at all — either is the honest reason, struck and silent
        passive.voice && !!passive.flag && /record(?:ing|ed)|収録音声/u.test(passive.name) && passive.note === null, passive);
      await page.locator('#mini #mini-voice').tap();
      await page.waitForFunction(() => !!document.querySelector('#mini .mini-say-note')?.textContent, null, { timeout: 4000 }).catch(() => {});
      const asked = await page.evaluate(() => ({ note: document.querySelector('#mini .mini-say-note')?.textContent || '', live: document.querySelector('#mini .mini-say-note')?.getAttribute('aria-live') }));
      check('G4.voice.asked', 'a tap on 音 says why, in a line he can read (and a screen reader hears): no recording, nothing played',
        /record(?:ing|ed)|収録音声/u.test(asked.note) && asked.live === 'polite', asked);
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
        assert.equal(await word.evaluate((node) => node.dataset.ladderRung), 'reading', 'the climb starts from the reading rung');
        // Ladder (John, 10-19): the English under the word comes next; the stage, whose writing is measured, is tap three
        await word.tap(); await delay(400);
        assert.equal(await word.evaluate((node) => node.dataset.ladderRung), 'gloss', 'the measured tap three starts from the English rung');
        await delay(250);
        const box = await word.boundingBox();
        // every frame from just before tap three until the word has settled, each with the ink's state in that frame
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

    if (withControls && !g1Only && !g2Only && !g5Only && !g6Only && !ladderOnly) {
      const specs = [
        // Ladder (John, 10-19): the four rung controls. Each is served in memory (page.route); source bytes are never edited.
        { id: 'tap1-opens-box', run: 'G3-clear', probe: clearProbe, kill: 'G3.clear.reading',
          witness: (row) => row.observed.stages === 1 && !row.observed.english,
          edits: [{ file: 'corridor.js', key: 'first-activation-to-stage',
            from: '  if (climbing && dialReveals && reading && kataToHira(reading)',
            to: '  if (false && climbing && dialReveals && reading && kataToHira(reading)' },
          { file: 'corridor.js', key: 'no-first-english', from: '  if (climbing && options.gloss) return ladderGlossRung(visit);\n',
            to: '  // Ladder negative: the first activation opens the stage\n' }] },
        { id: 'no-gloss-on-tap2', run: 'G3-stalled', probe: stalledProbe, kill: 'G3.control.gloss',
          witness: (row) => row.observed.stages === 1 && !row.observed.english,
          edits: [{ file: 'corridor.js', key: 'skip-english-rung',
            from: "    if (ladderVisit.rung === 'reading' && ladderVisit.gloss) return ladderGlossRung(ladderVisit);",
            to: '    // Ladder negative: the second activation skips the English and opens the stage' }] },
        // Retain VH's historical control ID: the stage transition is now tap3; both absent-stage assertions must fail.
        { id: 'stalled-second', run: 'G3-stalled-stage', probe: stalledStageProbe, kills: ['G3.control.stage', 'G3.control.stage-clear'],
          witness: (row) => row.observed.stages === 0 && row.observed.reading && !!row.observed.english,
          edits: [{ file: 'corridor.js', key: 'stall-english-to-stage',
            from: '      return ladderVisit.openStage({ restore: false, demo: false, meaningShown });',
            to: "      return 'gloss'; // Ladder negative: the third activation stalls" }] },
        { id: 'stalled-third', run: 'G3-stalled-stage', probe: stalledStageProbe, kills: ['G3.control.stage', 'G3.control.stage-clear'],
          witness: (row) => row.observed.stages === 0 && row.observed.reading && !!row.observed.english,
          edits: [{ file: 'corridor.js', key: 'stall-english-to-stage',
            from: '      return ladderVisit.openStage({ restore: false, demo: false, meaningShown });',
            to: "      return 'gloss'; // Ladder negative: the third activation stalls" }] },
        { id: 'box-over-ruby', run: 'G3-stalled-stage', probe: stalledStageProbe, kill: 'G3.control.stage-clear',
          witness: (row) => row.observed.overReading || row.observed.overWord,
          edits: [{ file: 'rooms/read.css', key: 'box-laid-on-the-word',
            from: "#mini[data-side='above'] { --mini-rise: -10px; }",
            to: "#mini[data-side='above'] { --mini-rise: -10px; translate: 0 60px; }\n#mini[data-side='below'] { translate: 0 -60px; } /* Ladder negative: the box laid over the word and its reading */" }] },
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
            to: '    /* G3 negative: retain the front tap cover */' },
          // Q · the front is drawn again when the deck's tokens arrive (upgradeFront): the mutant keeps its cover there too
          { file: 'decks/player/mount.js', key: 'front-tap-cover-upgrade',
            from: "  const sentence = sentenceNodes(card, { front: true, blank: cardMode() !== 'read', split: !!card.type });",
            to: "  const sentence = sentenceNodes(card, { front: true, blank: cardMode() !== 'read', split: !!card.type, taps: backTaps(card, ctx.index.cards.get(id).word) || { units: [], onTap: () => {} } });" }] },
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
      // --g4-only replays G4's three controls alone; G3's controls need G3's candidate schedules
      for (const spec of (g4Only || vhOnly) ? [] : specs.filter((spec) => !skyOwnershipOnly || spec.run === 'G3-sky-ownership')) {
        const control = { engine, id: spec.id, edits: spec.edits, served: [], pageErrors: [] };
        const begin = rows.length;
        await walk(spec.run, spec.probe, { control });
        control.rows = rows.splice(begin);
        const baseline = schedules[spec.run];
        const expected = baseline.map((row) => row.id);
        const actual = control.rows.map((row) => row.id);
        // a control names one row it kills (kill) or several (kills): every named row fails, the first for its witnessed
        // reason, and every other row of the schedule still passes
        const kills = (spec.kills || [spec.kill]).map((id) => `${engine}/${id}`);
        const targets = kills.map((id) => control.rows.find((row) => row.id === id));
        const target = targets[0];
        const cleanCandidate = baseline.length > 1 && baseline.every((row) => row.ok) && new Set(expected).size === expected.length;
        const fixtureReady = spec.run !== 'G3-sky-ownership' || ['corpus', 'fixture', 'setup'].every((part) =>
          control.rows.some((row) => row.id === `${engine}/G3.sky-ownership.${part}` && row.ok));
        const complete = !control.error && !control.setupError && control.pageErrors.length === 0 &&
          fixtureReady && JSON.stringify(actual) === JSON.stringify(expected) && spec.edits.every((edit) => control.served.some((served) => served.file === edit.file && served.applied.some((applied) => applied.key === edit.key)));
        const killed = cleanCandidate && complete && targets.every((row) => row && !row.ok) && spec.witness(target) &&
          control.rows.every((row) => kills.includes(row.id) || row.ok);
        control.verdict = !cleanCandidate || !complete ? 'incomplete' : killed ? 'killed' : targets.some((row) => row?.ok) ? 'survived' : 'contaminated';
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
      /* G4's three named controls (one-hand/G4/BRIEF.md). Each replays its exact candidate schedule against one served
       * product mutation (source bytes on disk are never edited); it is killed only when every named kill row fails for
       * its witnessed reason while every other row of the schedule still passes, and the unmodified restore passes. */
      const g4Specs = [
        { id:'missing-final-stroke',run:'G4-interrupt-save',probe:interruptSaveProbe,kills:['G4.interrupt.save-at-once'],
          witness:row=>row.observed.ended>=1 && row.observed.chars>0 && row.observed.offsets.some(v=>v>0.001) && row.observed.plain,
          edits:[{file:'corridor.js',key:'last-stroke-not-finished',from:'      for (const animation of ink.anims) animation.finish();',
            to:"      for (const animation of ink.anims) animation.finish();\n      word.querySelector('.ink-wet path:last-child')?.style.setProperty('stroke-dashoffset','1','important');"}]},
        { id:'never-plain-after-input',run:'G4-interrupt-save',probe:interruptSaveProbe,kills:['G4.interrupt.save-at-once'],
          witness:row=>row.observed.ended>=1 && row.observed.drawn && row.observed.plain===false,
          edits:[{file:'corridor.js',key:'retain-finished-wrapper',from:'        setTimeout(ink.dispose, 0);',to:'        /* VH negative: finished ink never becomes plain. */'}]},

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
      // G4's controls replay G4's candidate schedules, which a G3 narrow schedule (other than --controls-only) does not run
      for (const spec of g3Only && !controlsOnly ? [] : g4Specs.filter(spec=>!vhOnly || spec.run==='G4-interrupt-save')) {
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
        await g4Walk(spec.run, spec.probe, { phase: `restore:${spec.id}` });
        control.restore = rows.splice(restoreBegin);
        const restored = JSON.stringify(control.restore.map((row) => row.id)) === JSON.stringify(expected) && control.restore.every((row) => row.ok);
        controls.push(control);
        check(`G4.negative.${spec.id}`, 'candidate passes, the named product mutation fails its intended assertions, and the unmodified restore passes',
          killed && restored, { verdict: control.verdict, cleanCandidate, complete, restored, targets, setupError: control.setupError, error: control.error });
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
      // Hfix-1B (item 11): no tutor is set up here, so no "Ask the tutor" (verify-hfix-rooms holds the strip with one)
      check('G5.seal.strip', 'the strip opens with the word kept: Saved ✓ and Remove beside it, his lists, New list…, then 全項目 · Full entry, Save the sentence and Copy (no tutor set up: no tutor door)',
        opened.strip && /Saved/u.test(opened.status) && JSON.stringify(opened.acts.map((act) => act.action)) === JSON.stringify(['remove', 'entry', 'sentence', 'copy']) &&
        await page.locator('#seal-strip .seal-strip-lists > #seal-strip-status + [data-strip-action="remove"]').count() === 1 &&
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

    await walk('G5-room-hover', async page=>{
      await openStory(page); await readerWord(page).click(); await page.keyboard.press('Escape');
      const keep=page.locator('#app > .chrome button.save-one.chrome-keep');
      const back=page.locator('#app > .chrome [data-bar-back]');
      await keep.waitFor();
      const sample=async()=>{
        await keep.hover(); await delay(250);
        const held=await keep.evaluate(n=>({hover:n.matches(':hover'),background:getComputedStyle(n).backgroundColor,disabled:n.disabled}));
        await back.hover(); await delay(250);
        const peer=await back.evaluate(n=>({hover:n.matches(':hover'),background:getComputedStyle(n).backgroundColor,disabled:n.disabled}));
        return {held,peer,equal:held.hover&&peer.hover&&!held.disabled&&!peer.disabled&&held.background===peer.background&&held.background!=='rgba(0, 0, 0, 0)'};
      };
      const baseline=await sample();check('G5.room.shared-hover','room Keep shares its room bar hover background',baseline.equal,baseline);
      if(withControls){
        const style=await keep.getAttribute('style');await keep.evaluate(n=>n.style.setProperty('background','rgb(255, 0, 255)','important'));
        const mutant=await sample();await keep.evaluate((n,value)=>value===null?n.removeAttribute('style'):n.setAttribute('style',value),style);
        const restore=await sample();const killed=baseline.equal&&!mutant.equal&&sharedHoverDiverges(mutant,baseline)&&restore.equal;
        controls.push({engine,id:'G5.room-keep-hover',kind:'DOM style mutation',baseline,mutant,restore,verdict:killed?'killed':'incomplete'});
        check('G5.negative.room-keep-hover','only room Keep diverges from shared hover; clean style restores equality',killed,{baseline,mutant,restore});
      }
    },{viewport:{width:1280,height:800},mobile:false});

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
    // every control of the open strip stands wholly inside its painted box, and nothing scrolls inside it (lead's ruling,
    // 2026-10-18: Remove beside Saved ✓, so no row needs the strip's own scroll)
    const stripFit = (page) => page.evaluate(() => {
      const strip = document.getElementById('seal-strip');
      if (!strip) return null;
      const box = strip.getBoundingClientRect();
      const inner = { top: box.top + strip.clientTop, left: box.left + strip.clientLeft, bottom: box.top + strip.clientTop + strip.clientHeight, right: box.left + strip.clientLeft + strip.clientWidth };
      const controls = [...strip.querySelectorAll('button, input')].filter((n) => !n.hidden && !n.closest('[hidden]') && n.getClientRects().length)
        .map((n) => { const r = n.getBoundingClientRect(); return { id: n.id || n.dataset.stripAction || n.dataset.list || n.textContent.trim().slice(0, 16), top: Math.round(r.top), bottom: Math.round(r.bottom), inside: r.top >= inner.top - 0.5 && r.bottom <= inner.bottom + 0.5 && r.left >= inner.left - 0.5 && r.right <= inner.right + 0.5 }; });
      const remove = strip.querySelector('[data-strip-action="remove"]');
      return { scrollHeight: strip.scrollHeight, clientHeight: strip.clientHeight, more: strip.dataset.more ?? null, scrollTop: strip.scrollTop,
        removeInFirstRow: !!remove?.closest('.seal-strip-lists') && remove.previousElementSibling?.id === 'seal-strip-status',
        controls, outside: controls.filter((c) => !c.inside).map((c) => c.id) };
    });
    /** Put a content word of the reader (kanji, on the left half, so no fixed door at the foot is over it) at `y` on the
     * glass, mark it as the one to hold, and return it. */
    const wordAt = async (page, where) => {
      const index = await page.evaluate((where) => {
        document.querySelector('[data-g5-held]')?.removeAttribute('data-g5-held');
        // the band between the fixed bar and the fixed foot (only what stays put on the glass counts)
        const fixedEdge = (sel, edge) => { const n = document.querySelector(sel); if (!n || !['fixed', 'sticky'].includes(getComputedStyle(n).position)) return null; const b = n.getBoundingClientRect(); return b.height ? b[edge] : null; };
        const vv = window.visualViewport, glassBottom = vv ? vv.offsetTop + vv.height : innerHeight;
        // G6 · the room's scale rail sticks under the bar: the band starts under whichever stays put lowest
        const chrome = Math.max(fixedEdge('#app > .chrome', 'bottom') ?? 0, fixedEdge('#app > .scale-thread', 'bottom') ?? 0);
        const foot = Math.min(glassBottom, fixedEdge('#primary-tabs', 'top') ?? glassBottom, fixedEdge('.listen-row', 'top') ?? glassBottom);
        // R3 · a name (.named: the text uses it as a name, no dictionary meaning) cannot be kept, so it is never the held word
        const words = [...document.querySelectorAll('#reader .tok[data-index]')].filter((n) => /[一-鿿]/u.test(n.textContent) && !n.classList.contains('particle') && !n.classList.contains('named')
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
        // G6 · the room's scale rail sits under the bar, so at 320×568 the story's first 総理 opens under the 層 mark and the
        // foot: the word is brought wholly onto the glass first (only if it is not already), as a reader brings a word up
        // before holding it
        const cases = [['first', async () => { const w = readerWord(page); await w.evaluate((n) => {
          document.querySelector('[data-g5-held]')?.removeAttribute('data-g5-held'); n.setAttribute('data-g5-held', '');
          const edge = (sel, side) => { const e = document.querySelector(sel); if (!e || !['fixed', 'sticky'].includes(getComputedStyle(e).position)) return null; const b = e.getBoundingClientRect(); return b.height ? b[side] : null; };
          const vv = window.visualViewport, glass = vv ? vv.offsetTop + vv.height : innerHeight;
          const top = Math.max(edge('#app > .chrome', 'bottom') ?? 0, edge('#app > .scale-thread', 'bottom') ?? 0);
          const foot = Math.min(glass, edge('#primary-tabs', 'top') ?? glass, edge('.listen-row', 'top') ?? glass, edge('#layers-mark', 'top') ?? glass);
          const r = n.getBoundingClientRect();
          if (r.top < top + 4 || r.bottom > foot - 4) window.scrollBy(0, r.top - (top + (foot - top) / 2));
        }); await delay(300); return w; }],
          ['foot', () => wordAt(page, 'foot')], ['top', () => wordAt(page, 'top')]];
        let id = 80;
        for (const [name, choose] of cases) {
          const word = await choose();
          await holdOn(page, word, { id: id++ });
          await page.locator('#seal-strip').waitFor();
          await landed(page);
          const glass = await glassFacts(page), place = await stripCover(page, '[data-g5-held]'), fits = await stripFit(page);
          glass.wordTopBeforeHold = word.before ?? null;
          check(`G5.strip.fits.${form}.${name}`, `${form}, ${name}${name === 'first' ? '' : ' (with his three lists)'}: every control of the strip stands wholly inside its painted box, Remove beside Saved ✓, and nothing scrolls inside it`,
            !!fits && fits.outside.length === 0 && fits.scrollHeight <= fits.clientHeight && fits.more !== 'true' && fits.removeInFirstRow, fits);
          check(`G5.glass.${form}.${name}`, `${form}, a word ${name === 'first' ? 'where the story opens' : `near the ${name}`}: the strip stands wholly on the glass, over no button, under 40 % of the screen, the word still on the glass`,
            glass.stripOnGlass && glass.wordOnGlass && !!place && place.covered.length === 0 && place.share <= 0.4 && !place.overWord, { ...glass, covered: place?.covered, share: place?.share, overWord: place?.overWord });
          if (name === 'foot') await page.screenshot({ path: resolve(evidence, `${engine}-G5-glass-${form}-foot.png`) });
          if (name === 'first') {
            // his lists for the holds that follow: three, as a learner keeps them
            for (const list of ['仕事', '旅', 'ニュースの語']) {
              await page.locator('#seal-strip-new').tap();
              await page.locator('#seal-strip-name').fill(list);
              await page.locator('#seal-strip-create').tap();
              await page.locator(`#seal-strip .seal-list[data-list="${list}"]`).waitFor();
            }
          }
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
        return [...document.querySelectorAll(paragraph)].map((node, index) => {
          const r = node.getBoundingClientRect();
          return { id: `${index}:${node.querySelector('.tok[data-index]')?.dataset.index}`, top: r.top - origin, height: r.height,
            tokens: [...node.querySelectorAll('.tok[data-index]')].slice(0, 12).map((tok) => {
              const b = tok.getBoundingClientRect(); return { id: tok.dataset.index, left: b.left, top: b.top - origin };
            }) };
        });
      }, paragraph);
      const plain = await geometry();
      await page.locator('#layers-mark').tap(); await delay(350);
      const open = await page.evaluate(() => {
        const node = document.querySelector('#reader > [data-layers="open"]');
        const words = node ? [...node.querySelectorAll('.tok[data-index] ruby')] : [];
        // nothing is painted over the paragraph's words: its layers stand under it
        // F · a reading is the one ruby, a native rt: one that shows counts as painted, as a ::before reading would
        const shown = words.filter((ruby) => {
          const rt = ruby.querySelector('rt'), native = rt && getComputedStyle(rt);
          if (native && rt.textContent && native.display !== 'none' && native.visibility !== 'hidden' && Number(native.opacity) > 0.5 && rt.getClientRects().length > 0) return true;
          const ink = getComputedStyle(ruby, '::before'); return ink.content !== 'none' && Number(ink.opacity) > 0.5;
        }).length;
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
      // F · the tap that folded the layers raised 大賞's reading (G3's first rung), a native rt: in WebKit its line may settle by
      // under a pixel, which F's own ruler calls no movement (a reading "moves no line", < 1 px). Every line and word is where
      // it was: raw coordinates, strict < 1 px, never rounded before comparison.
      check('G5.layers.bare-again', 'folded, the reading is bare and every raw coordinate moves strictly less than 1 px', foldGeometryEqual(bareAgain, plain), { plain, bareAgain });
      if (g5Controls) {
        for (const [id, amount] of [['fold-shift-one-pixel', 1], ['fold-shift-one-quarter-over', 1.25]]) {
          const beforeScroll = await page.evaluate(() => [scrollX, scrollY]);
          const direction = bareAgain[0].top >= plain[0].top ? 1 : -1;
          const previous = await page.locator(paragraph).first().evaluate((node, dy) => {
            const previous = node.style.transform; node.style.transform = `translateY(${dy}px) ${previous}`; return previous;
          }, amount * direction);
          const shifted = await geometry();
          const afterScroll = await page.evaluate(() => [scrollX, scrollY]);
          await page.locator(paragraph).first().evaluate((node, value) => { node.style.transform = value; }, previous);
          const restoredGeometry = await geometry();
          const killed = foldGeometryEqual(bareAgain, plain) && foldShiftBites({ plain, baseline: bareAgain, shifted, amount, direction });
          const restored = foldGeometryEqual(restoredGeometry, plain) && JSON.stringify(beforeScroll) === JSON.stringify(afterScroll);
          controls.push({ engine, id, kind: 'post-fold DOM geometry mutation', amount, direction, baseline: bareAgain, shifted, restore: restoredGeometry, beforeScroll, afterScroll, verdict: killed && restored ? 'killed' : 'incomplete' });
          check(`G5.negative.${id}`, 'the real folded paragraph shifted by the declared amount fails raw geometry; restoring its style passes without page scroll', killed && restored, { amount, direction, beforeScroll, afterScroll, shifted, restoredGeometry });
        }
      }
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

    if (g5Controls && !vhOnly && !g1Only && !g2Only && !g3Only && !g4Only && !g6Only && !ladderOnly) {
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
        await walk(spec.run, spec.probe, { phase: `restore:${spec.id}` });
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
        const save = (buffer, way, t) => writeFileSync(resolve(evidence, `${engine}-${mediaPhase}-P14-${world}-${way}-${String(t).padStart(3, '0')}ms.png`), buffer);
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

    const g2Start = rows.length;
    if (!g1Only) await g2Walks(walk, browser);
    const g2Baseline = rows.slice(g2Start);
    if (withControls && ((vhOnly && !vhInkOnly) || g2Only || selection.fullRequested) && !process.argv.includes('--g2-control')) {
      for (const [id, spec] of Object.entries(G2_CONTROLS)) {
        const begin = rows.length;
        const served = await g2Walks((name, body, options = {}) => walk(name, body, { ...options, phase: `mutant:${id}` }), browser, id);
        const mutant = rows.splice(begin);
        const restoreBegin = rows.length;
        await g2Walks((name, body, options = {}) => walk(name, body, { ...options, phase: `restore:${id}` }), browser);
        const restore = rows.splice(restoreBegin);
        const expected = g2Baseline.map(row => row.id), kills = spec.kills.map(key => `${engine}/${key}`);
        const targets = kills.map(key => mutant.find(row => row.id === key));
        const same = value => JSON.stringify(value.map(row => row.id)) === JSON.stringify(expected);
        const witnessed = id === 'reading-check-dropped'
          ? targets.every(row => row && !row.ok && (row.id.endsWith('.rooms')
            ? row.observed?.slip?.kept || row.observed?.basis?.kept || !['met', null].includes(row.observed?.slip?.depth) || (row.observed?.slip?.reading==='ねん' && row.observed?.basis?.text.includes('this reading’s entry is not settled') && !row.observed?.basis?.text.includes('another reading'))
            : [row.observed?.capped, row.observed?.homograph].some(fact => fact && (fact.kept || !['met', null].includes(fact.depth)))))
          : targets.every(row => row && !row.ok && row.observed?.moved?.length > 0);
        const clean = g2Baseline.length > 0 && g2Baseline.every(row => row.ok) && new Set(expected).size === expected.length;
        const complete = same(mutant) && same(restore) && !served.setupError && spec.edits.every(edit =>
          served.served.some(file => file.file === edit.file && file.applied.some(applied => applied.key === edit.key)));
        const killed = clean && complete && witnessed && mutant.every(row => kills.includes(row.id) || row.ok);
        const restored = same(restore) && restore.every(row => row.ok);
        const control = { engine, id: `G2.${id}`, edits: spec.edits, ...served, baseline: g2Baseline, rows: mutant, restore,
          verdict: !clean || !complete ? 'incomplete' : killed && restored ? 'killed' : 'contaminated' };
        controls.push(control);
        check(`G2.negative.${id}`, 'exact G2 candidate, witnessed product fault, clean restore', killed && restored, { clean, complete, witnessed, restored, targets });
      }
    }
    if (withControls && ((vhOnly && !vhInkOnly) || g1Only || selection.fullRequested)) {
      const specs = [
        { id: 'page-capped', run: 'page', kills: ['P1.viewport', 'P1.cap'],
          witness: row => row.observed?.maxHeight !== 'none' && row.observed?.maxHeight !== undefined,
          edits: [{file:'editorial.css',key:'restore-91dvh-cap',from:'  max-width: none;\n  max-height: none;\n  margin: 0;',to:'  max-width: none;\n  max-height: 91dvh;\n  margin: 0;'}] },
        { id: 'scrim-appended', run: 'page', kills: ['P1.scrim'], witness: row => row.observed > 0,
          edits: [{file:'corridor.js',key:'append-scrim',from:'  const sheet = prebuilt || buildPage(node);',to:"  const sheet = prebuilt || buildPage(node);\n  const scrim = el('div', 'scrim'); scrim.style.pointerEvents = 'none'; root.append(scrim);"}] },
        { id: 'word-not-travelling', run: 'page', kills: ['P2.cut'], witness: row => !row.observed?.flight && row.observed?.landed?.headword === '1',
          edits: [{file:'corridor.js',key:'remove-word-travel',from:'  if (leaves) flyWord(leaves, heroOf(sheet));',to:'  /* VH-1 negative: the word never travels. */'}] },
        { id: 'page-fades-over-reader', run: 'exposure', kills: ['P14.arrive-sumi', 'P14.arrive-yoru'],
          witness: row => row.observed?.mask >= 2000 && Object.entries(row.observed.share || {}).some(([time, share]) => Number(time) >= 80 && share > P14_LIMIT),
          edits: [{file:'corridor.js',key:'fade-page-over-reader',from:'  if (leaves) flyWord(leaves, heroOf(sheet));',to:"  if (leaves) { sheet.animate([{opacity: 0}, {opacity: 1}], {duration: 320, fill: 'none', id: 'vh-page-fade'}); flyWord(leaves, heroOf(sheet)); }"}] },
      ];
      for (const spec of specs) {
        const schedule = retainedWalks.get(spec.run);
        assert(schedule, `Missing G1 control candidate ${spec.run}`);
        const baseline = schedule.rows;
        const expected = baseline.map(row => row.id), kills = spec.kills.map(id => `${engine}/${id}`);
        const control = { engine, id: `G1.${spec.id}`, edits: spec.edits, served: [], pageErrors: [], baseline };
        const begin = rows.length;
        await walk(spec.run, schedule.body, { ...schedule.options, control });
        control.rows = rows.splice(begin);
        const targets = kills.map(id => control.rows.find(row => row.id === id));
        const same = result => JSON.stringify(result.map(row => row.id)) === JSON.stringify(expected);
        const clean = baseline.length > 1 && baseline.every(row => row.ok) && new Set(expected).size === expected.length;
        const complete = !control.error && !control.setupError && !control.pageErrors.length && same(control.rows) && spec.edits.every(edit =>
          control.served.some(file => file.file === edit.file && file.applied.some(applied => applied.key === edit.key)));
        const witnessed = targets.every(row => row && !row.ok && spec.witness(row));
        const killed = clean && complete && witnessed && control.rows.every(row => kills.includes(row.id) || row.ok);
        const restoreBegin = rows.length;
        await walk(spec.run, schedule.body, { ...schedule.options, phase: `restore:${spec.id}` });
        control.restore = rows.splice(restoreBegin);
        const restored = same(control.restore) && control.restore.every(row => row.ok);
        control.verdict = !clean || !complete ? 'incomplete' : killed && restored ? 'killed' : 'contaminated';
        controls.push(control);
        check(`G1.negative.${spec.id}`, 'G1 candidate passes, the exact fault has its named pixel/geometry witness, and clean restore passes', killed && restored,
          { clean, complete, witnessed, restored, targets, error: control.error || control.setupError });
      }
    }
    await browser.close();
  }
} catch(error) {
  check('schedule.error','word-grammar schedule completes',false,String(error.stack||error));
} finally {
  await host.close();
}

function innerHeightOf(facts) { return facts?.inner?.height || 844; }

const admission = grammarAcceptance({ argv: process.argv.slice(2), ladderWalks, engines, rows, walks: completedWalks, g6Completed, controls, runtimeFiles: identity.files });
writeFileSync(resolve(evidence, 'verify-word-grammar.json'), JSON.stringify({ schemaVersion: 1, runId, engines, requestedScope: selection, walks: completedWalks, g6Completed, ...admission, site, gitSha: identity.gitSha, artifactSha256: identity.artifactSha256, verifierSha256, browserVersions, scope: ladderOnly ? `Ladder only (accepted36798e80): tap ladder, placement, trackpad scroll and mouse hold${withControls ? ' with its engine-specific negative controls' : ''}${ladderWalks.length ? `; NARROWED to ${ladderWalks.join(', ')}` : ''}; diagnostic, no G1–G6/full acceptance` : vhOnly ? 'VH-1 repaired contracts only; diagnostic, no full acceptance' : g1Only ? 'G1 candidate and controls only; diagnostic' : g2Only ? 'G2 walks only' : g6ThreadCurrentOnly ? 'G6 current-thread visibility: six width/palette native contexts only' : g6FramesOnly ? 'G6 twelve directed edges and frames only; draft scope limits in g6-<engine>.json' : g6ControlsOnly ? 'G6 controls with positives and restores only' : g6Only ? 'G6 core schedule only; no G1/G2/G3/G4/G5 claim; draft scope limits in g6-<engine>.json' : g4Only ? `G4 only${withControls ? ' with its three negative controls' : ''}; G1, G2, G3 and G5 gates not run` : g5Only ? `G5 only${g5Controls ? ' with its negative controls' : ''}; G1, G2, G3 and G4 gates not run` : skyOwnershipOnly ? `G3 controlled sky glyph hit ownership${withControls ? ' and its negative controls' : ''}; named 嘩/眩/貰 use fixture-only corpus/captions, actual product mount/hit code; no natural-input, G1 or frame claim` : skyReadingsOnly ? 'G3 actual sky glyph and reader particle across all dials; canonical host getter; hosted sky particle rendering unproven because its legacy scene is unreachable; no G1 or frame gates' : controlsOnly ? 'G3 and G4 negative controls only; exact candidate schedules, mutants and restores; no G1 or frame gates' : roomsOnly ? 'G3 Words, sky words/glyphs, and reader particle; fixed activation counts; no G1 or frame gates' : sentencesOnly ? 'G3 sentence/example rendered ruby, all three dials, and sealed front; no G1 or frame gates' : kanaOnly ? 'G3 identical kana, particle bar Save, and meaningful particle dials; no G1 or frame gates' : g3Only ? 'G3 only; G1 gates not run' : `G1, G2, G3, G4, G5 and G6 core (G6 scope limits in per-engine receipt)${g5Controls ? ' with G5 negative controls' : ''}`, ...(Object.keys(g2Versions).length ? { browsers: g2Versions } : {}), ...(controlsRun.length ? { control: controlsRun } : {}), rows, frames, controls, fixtures }, null, 1));
const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} — evidence ${evidence}`);
process.exit(failed.length || (selection.fullRequested && !admission.fullAcceptance) ? 1 : admission.fullAcceptance ? 0 : 3);
