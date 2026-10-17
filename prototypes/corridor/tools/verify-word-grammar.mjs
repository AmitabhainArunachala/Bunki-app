/** verify-word-grammar · the word grammar's walk (MASTER_SPEC §4 G; G_PROGRAM_DESIGN §4). Slice G1 writes its "page" part:
 * the entry is a page, not a sheet (John, 2026-10-15: "this should come to the WHOLE SCREEN. not a swipable window… not have
 * that UGLY gap at the top"). Later G slices add their parts here. Served build only, WebKit and Chromium, 390×844, touch,
 * service workers blocked; every page error fails its walk and none is filtered.
 *   P1  the page: tap a reader word → its card → the card's band → #sheet covers the viewport (top 0 ± 1, height = innerHeight
 *       ± 1, width = innerWidth), no .sheet-grip, no .scrim, no max-height, its paper opaque and the world's (--color-paper)
 *   P2  the match cut is one travelling word (G1b): the page is whole from the tap, no view transition runs, and a copy of
 *       the word (.cut-word, animation 'kairo-cut') leaves from the card's headword glyphs and lands on the page's headword
 *       glyphs (the same word), which wait unseen until it lands; the page was built ahead at idle (data-built="ahead")
 *   P3  the cycle: Close → no page, no card, the reading the tap raised is gone; the same word from bare opens its card again
 *   P4  a word inside the page opens its OWN card — exactly one, on that word, clear of the page's bar (Back never covered);
 *       its band → depth 2 (‹ Back, a crumb of two); Back → depth 1 (the first word's page); Back → bare
 *   P5  Escape steps back one level: depth 2 → depth 1 → bare
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
 * Negative controls (one-hand/G1/neg-control): the 91dvh cap back → P1 red; the scrim re-appended → P1 red; the word not
 * sent travelling (enterWord) → P2 red; the page fading in over the reader instead of arriving whole → P14 red. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';
import { readAppRecordSnapshot } from './record-test-support.mjs';
import { serveMutation } from './reader-gloss-mutants.mjs';

assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable built site and its digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
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
const frames = [];
// G2 · --g2-only runs the G2 walks alone (never a claim that the G1 parts passed); --g2-control <name> runs them on a mutant
const g2Only = process.argv.includes('--g2-only') || process.argv.includes('--g2-control');
const g2Versions = {}, controlsRun = [];

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
  await boot(page, opts);
  const direct = page.locator(`[data-passage="${STORY.id}"]:not([data-recommendation]) .shelf-open`).first();
  if (await direct.count()) await direct.click();
  else {
    await openShelfTools(page);
    await page.locator('#shelf-reading-search').fill(STORY.search);
    await page.locator('#shelf-reading-search').press('Enter');
    await page.locator(`#shelf-reading-results [data-passage="${STORY.id}"] .shelf-open`).first().click();
  }
  await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 20000 });
  await delay(900);
}
const readerWord = (page, label = WORD) => page.locator(`#reader .tok[aria-label="${label}"]`).first();
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
  await locator.scrollIntoViewIfNeeded();
  await delay(250);
  const box = await locator.boundingBox();
  if (!box) return null;
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
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await delay(FRAME_WINDOW + 250);
  const t = await page.evaluate(() => window.__g1f);
  const deltas = t.slice(1).map((v, i) => Math.round((v - t[i]) * 10) / 10);
  return { worst: Math.max(...deltas), over24: deltas.filter((d) => d > 24).length, frames: deltas.length, deltas };
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
  'reading-check-dropped': { kills: ['G2.4'], edits: [{ file: 'corridor.js', key: 'reading', from: '  const reading = shown ? kanaReadingKey(shown) || null : null;\n  const make =',
    to: '  const reading = null;\n  const make =' }] },
  'tap-schedules': { kills: ['G2.7'], edits: [{ file: 'corridor.js', key: 'schedules', from: '  const help = article ? readHelpPatch(latest, article, key, now) : null;',
    to: "  const help = article ? readHelpPatch(latest, article, key, now) : null;\n  if (plainRecord(latest.srs) && owns(latest.srs, srsKey('word', identity.id))) patch.srs = { ...latest.srs, [srsKey('word', identity.id)]: { ...latest.srs[srsKey('word', identity.id)], due: new Date(now).toISOString() } };" }] },
};
/** The first paragraph just under the top bar, for the eye. */
async function g2ShowParagraph(page) {
  await page.evaluate(() => {
    const first = document.querySelector('#reader .tok[data-index]');
    const bar = [...document.querySelectorAll('.chrome, .nav-symbol')].reduce((edge, node) => Math.max(edge, node.getBoundingClientRect().bottom), 0);
    window.scrollTo(0, Math.max(0, first.getBoundingClientRect().top + window.scrollY - bar - 28));
  });
  await delay(400);
}
async function g2Walks(walk, browser) {
  const version = browser.version();
  console.log(`G2 ${engine} ${version}`);
  g2Versions[engine] = version;
  const controlAt = process.argv.indexOf('--g2-control');
  const control = controlAt >= 0 ? G2_CONTROLS[process.argv[controlAt + 1]] : null;
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
        width: parseFloat(dot.width), events: dot.pointerEvents }, rowHeight: Math.round(row.getBoundingClientRect().height * 10) / 10 };
  }, index);
  const record = (page) => readAppRecordSnapshot(page).then((snapshot) => snapshot.record);
  const scheduling = (value) => JSON.stringify(G2_SCHEDULING.map((key) => [key, value[key] ?? null]));
  /** The one paragraph, every state: the record a learner leaves after weeks of reading and review. */
  const seedParagraph = async (page) => {
    await openStory(page);
    const nodes = await page.evaluate((map) => Object.fromEntries(Object.entries(map).map(([name, at]) =>
      [name, { node: window.__KAIRO_DEPTH__.readerNode(at), key: window.__KAIRO_DEPTH__.key(window.__KAIRO_DEPTH__.readerNode(at) || {}),
        kind: window.__KAIRO_DEPTH__.identity(window.__KAIRO_DEPTH__.readerNode(at) || {})?.kind }])), G2_PARA);
    const today = await page.evaluate(() => window.__KAIRO_DEPTH__.day());
    const now = Date.now();
    const words = Object.fromEntries(Object.entries(nodes).map(([name, value]) => [name, value.node?.id]));
    check('G2.F0.fixture', 'the paragraph names its words, each the quick dictionary\'s own record (so no index decides them)',
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
    const { seeded, now } = await seedParagraph(page);
    const facts = {};
    for (const [name, at] of Object.entries(G2_PARA)) facts[name] = await tokenFacts(page, at);
    await g2ShowParagraph(page);
    await page.screenshot({ path: resolve(evidence, `${engine}-G2-reader-ai.png`) });
    const want = { unmet: null, met: 'met', again: 'again', recalled: 'recalled', owned: 'owned' };
    const states = Object.entries(want).every(([name, depth]) => facts[name]?.depth === depth && (depth ? !!facts[name].dot : !facts[name].dot));
    const fills = ['met', 'again', 'recalled', 'owned'].map((name) => facts[name]?.dot?.background);
    const page0 = await page.evaluate(() => { const probe = document.createElement('i'); probe.style.cssText = 'position:fixed;width:1px;height:1px;background:var(--depth-ground)';
      document.querySelector('#reader').append(probe); const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color; });
    const steps = fills.map((fill) => contrast(fill, page0));
    check('G2.1', 'the paragraph: 出席 bare · 官邸 met · 大賞 again · 表彰 recalled · 大臣 owned, four fills each deeper against the page, '
      + 'each dot out of the line (absolute, untouchable) and every row its natural height',
    states && new Set(fills).size === 4 && steps.every((ratio, i) => i === 0 || ratio > steps[i - 1]) &&
      ['met', 'again', 'recalled', 'owned'].every((name) => facts[name].dot.position === 'absolute' && facts[name].dot.events === 'none') &&
      ['met', 'again', 'recalled', 'owned'].every((name) => Math.abs(facts[name].rowHeight - facts.unmet.rowHeight) <= 0.5), { facts, fills, steps });
    const seal = await page.evaluate(() => { const probe = document.createElement('i'); probe.style.color = 'var(--color-seal)'; document.body.append(probe);
      const color = getComputedStyle(probe).color; probe.remove(); return color; });
    const rings = (fact) => !!fact?.dot && fact.kept && String(fact.dot.shadow).includes(seal.replace(/\s+/g, ' '));
    check('G2.2', 'kept rings, one meaning: 大臣 (Review) and 式 (a list only) wear the seal-red ring; 官邸, 大賞, 表彰 (history only) and 出席 never',
      rings(facts.owned) && rings(facts.listed) && ['met', 'again', 'recalled', 'unmet'].every((name) => !facts[name]?.kept && !/rgb|color/u.test(String(facts[name]?.dot?.shadow || 'none').replace('none', ''))),
      { owned: facts.owned, listed: facts.listed, seal });
    check('G2.4', '年 read ねん and 日 read か beside his owned, kept 年 read とし and 日 read ひ: each at most "met", and no ring',
      [facts.capped, facts.homograph].every((fact) => fact && ['met', null].includes(fact.depth) && !fact.kept), { capped: facts.capped, homograph: facts.homograph });
    check('G2.5', '挨拶, owned, with his "Not yet": the dot is "again"', facts.notYet?.depth === 'again', facts.notYet);
    // the rooms: 大臣's slip, its page's basis line
    await token(page, G2_PARA.owned).tap();
    await page.locator('#mini .mini-word').waitFor();
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
    await seedParagraph(page);
    await token(page, G2_PARA.homograph).tap();
    await page.locator('#mini .mini-word').waitFor();
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
    await seedParagraph(page);
    const before = await record(page);
    for (const at of [G2_PARA.met, G2_PARA.owned, G2_PARA.unmet]) {
      await token(page, at).tap();
      await page.locator('#mini .mini-word').waitFor();
      await delay(500);
      await page.keyboard.press('Escape');
      await delay(300);
    }
    await token(page, G2_PARA.owned).tap();
    await page.locator('#mini .mini-word').waitFor();
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
  if (control) controlsRun.push({ engine, control: process.argv[controlAt + 1], served: served.served, setupError: served.setupError });
}

try {
  for (engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    const walk = async (name, body, { viewport = { width: 390, height: 844 }, mobile = true } = {}) => {
      if (g2Only && !name.startsWith('g2')) return;
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
      await context.addInitScript(GLYPHS);
      await silenceBrowserAudio(context);
      await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => errors.push(error.message));
      try { await body(page); }
      catch (error) {
        check(`${name}.error`, `${name} ran to the end`, false, String(error.stack || error).slice(0, 700));
        await page.screenshot({ path: resolve(evidence, `${engine}-${name}-error.png`) }).catch(() => {});
      } finally {
        check(`${name}.page-errors`, `${name}: no page errors`, errors.length === 0, errors);
        await context.close();
      }
    };

    // P1 · P2 · P3 · P9 · P10 · P12 — one walk through the reader's word into its page and out
    await walk('page', async (page) => {
      await openStory(page);
      await readerWord(page).tap();
      await page.locator('#mini .mini-word').waitFor();
      check('P3.card', `a tap on ${WORD} opens its card`, (await slipFacts(page)).word === WORD, await slipFacts(page));
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
      const after = await page.evaluate((word) => {
        const tok = document.querySelector(`#reader .tok[aria-label="${word}"]`);
        return { sheet: !!document.getElementById('sheet'), mini: !!document.getElementById('mini'), lit: tok?.classList.contains('lit') || false,
          rubyShown: [...(tok?.querySelectorAll('rt') || [])].some((rt) => !rt.classList.contains('hidden-rt') && getComputedStyle(rt).display !== 'none' && rt.textContent.trim()),
          inert: document.querySelector('#app > main')?.inert || false };
      }, WORD);
      check('P3.close', 'Close leaves the reader bare: no page, no card, the raised reading gone, the room live again',
        !after.sheet && !after.mini && !after.lit && !after.rubyShown && !after.inert, after);
      await readerWord(page).tap();
      await page.locator('#mini .mini-word').waitFor();
      check('P3.again', 'the same word from bare opens its card again', (await slipFacts(page)).word === WORD, await slipFacts(page));
    });

    // P4 · P5 — a word inside the page, depth 2, Back twice; then Escape twice
    await walk('depth', async (page) => {
      await openStory(page);
      for (const way of ['back', 'escape']) {
        await readerWord(page).tap();
        await page.locator('#mini .mini-word').tap();
        await pageSettled(page);
        const inside = page.locator('#sheet .example .sentence-tok, #sheet .japanese-lookup-word').filter({ hasText: /^(内閣|大臣|官邸|日本|表彰|出席|大賞)$/u }).first();
        await inside.scrollIntoViewIfNeeded();
        await delay(300);
        const word = (await inside.textContent()).trim();
        await inside.tap();
        await page.locator('#mini .mini-word').waitFor();
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
        await delay(200);
        await page.waitForFunction(() => document.getElementById('sheet-back')?.textContent.trim() === 'Close', null, { timeout: 5000 }).catch(() => {});
        await delay(500);
        const one = await pageFacts(page);
        check(`P${way === 'back' ? 4 : 5}.${way}.depth1`, `${way === 'back' ? 'Back' : 'Escape'} steps out one level, to ${WORD}'s page`, one?.back === 'Close' && one.headword.startsWith(WORD), one);
        if (way === 'back') await page.locator('#sheet-back').tap();
        else await page.keyboard.press('Escape');
        await bare(page);
        const gone = await page.evaluate(() => ({ sheet: !!document.getElementById('sheet'), mini: !!document.getElementById('mini') }));
        check(`P${way === 'back' ? 4 : 5}.${way}.bare`, `${way === 'back' ? 'Back' : 'Escape'} again leaves the reader bare`, !gone.sheet && !gone.mini, gone);
      }
    });

    // P6 — no stale card: a card for a word below the page (a reading still on its way, a lookup still answering — here
    // the reader word's own activation, dispatched while the page stands over it) never floats over the page
    await walk('stale', async (page) => {
      await openStory(page);
      await readerWord(page).tap();
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
      await inside.tap();
      await page.locator('#mini .mini-word').waitFor({ timeout: 8000 }).catch(() => {});
      const own = await slipFacts(page);
      check('P6.page-word', 'a word on the page still opens its own card there', own.count === 1 && own.onPage, own);
    });

    // P7 — frames, the method of one-hand/G1/frames.json: three opens and three closes, cold first
    await walk('frames', async (page) => {
      await openStory(page);
      const own = [];
      for (let rep = 0; rep < 3; rep++) {
        await readerWord(page).tap();
        await page.locator('#mini .mini-word').waitFor();
        await delay(1300);
        const open = await measure(page, page.locator('#mini .mini-word'));
        await pageSettled(page);
        const close = await measure(page, page.locator('#sheet-back'));
        await bare(page);
        own.push({ rep, open, close });
        frames.push({ engine, rep, phase: rep === 0 ? 'cold' : 'warm', open: open && { worst: open.worst, over24: open.over24 }, close: close && { worst: close.worst, over24: close.over24 }, openDeltas: open?.deltas, closeDeltas: close?.deltas });
      }
      const worst = Math.max(...own.flatMap(({ open, close }) => [open?.worst ?? Infinity, close?.worst ?? Infinity]));
      if (engine === 'webkit') check('P7.frames', 'the worst frame while the page opens and closes is ≤ 24 ms in WebKit', worst <= 24, own.map(({ rep, open, close }) => ({ rep, open: open?.worst, close: close?.worst })));
      else check('P7.frames-recorded', 'Chromium frames recorded beside WebKit (never averaged in)', Number.isFinite(worst), own.map(({ rep, open, close }) => ({ rep, open: open?.worst, close: close?.worst })));
    });

    // P8 — every world: opaque paper, a readable headword; 墨 opaque and scrim-free at depths 1–4
    await walk('worlds', async (page) => {
      for (const world of WORLDS) {
        await openStory(page, { world });
        await readerWord(page).tap();
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
      await readerWord(page).click();
      await page.locator('#mini .mini-word').click();
      await pageSettled(page);
      const facts = await pageFacts(page);
      await page.screenshot({ path: resolve(evidence, `${engine}-P13-desktop.png`) });
      check('P13.desktop', 'at 1280×800 the page covers the window', coversViewport(facts), facts);
    }, { viewport: { width: 1280, height: 800 }, mobile: false });

    // P15 — the kanji tiles hold their glyphs at twice the text
    await walk('text-200', async (page) => {
      await openStory(page);
      await readerWord(page).tap();
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
        await readerWord(page).tap();
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
        // Back: the page → the bare reader, the word travelling home
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

    await g2Walks(walk, browser);
    await browser.close();
  }
} finally {
  await host.close();
}

function innerHeightOf(facts) { return facts?.inner?.height || 844; }

writeFileSync(resolve(evidence, 'verify-word-grammar.json'), JSON.stringify({ site, gitSha: identity.gitSha, artifactSha256: identity.artifactSha256,
  browsers: g2Versions, ...(g2Only ? { scope: 'G2 walks only' } : {}), ...(controlsRun.length ? { control: controlsRun } : {}), rows, frames }, null, 1));
const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} — evidence ${evidence}`);
process.exit(failed.length ? 1 : 0);
