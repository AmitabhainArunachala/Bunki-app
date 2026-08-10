/**
 * The Drift interaction-consistency sweep — the charter's instrument.
 * (docs/prompts/DRIFT_CONSISTENCY_CHARTER_2026-08-08.md)
 *
 * Drives the FUSED app with real CDP touch at 390×844 and runs a gesture
 * battery against a stratified sample of words, recording expected vs
 * observed for every case, classifying each into the charter's outcome
 * taxonomy, and screenshotting every divergence. The report is JSON; the
 * console prints the cluster table the fix phase works from.
 *
 * Usage:
 *   node verify-drift-consistency.mjs [--mode fast|full] [--words N]
 *     [--chain-hops N] [--fuzz-seeds N,N,N] [--fuzz-gestures N]
 *     [--soak-ms N] [--shots DIR] [--out FILE]
 *
 * Battery per word (charter §2, v1 slice — the operator-reported cases):
 *   tap            → unfolds + blooms (C1, C2)   [kana words included]
 *   tap again      → glosses (C1)
 *   slow drag →    → word MOVES and SURVIVES (C3) — never graded
 *   pinch over it  → constellation survives, camera zooms (C4, C5)
 *   water tap      → deliberate release works (C5)
 *   fast flick →   → grade fires (the flick IS the judgment gesture)
 *   pointercancel  → next gesture still clean (C6)
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(TOOL_DIR, '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const numberArg = (name, fallback, { min = 0 } = {}) => {
  const value = Number(arg(name, fallback));
  if (!Number.isFinite(value) || value < min) throw new Error(`${name} must be a number >= ${min}`);
  return value;
};
const MODE = arg('--mode', 'fast');
if (!['fast', 'full'].includes(MODE)) throw new Error('--mode must be fast or full');

// `fast` is the bounded PR gate. `full` selects the binding A0 quantities,
// but the receipt below still refuses to promote obligations the instrument
// does not yet encode (notably the complete node × gesture × state matrix and
// randomized fuzz). A selected mode is never itself evidence.
const N_WORDS = numberArg('--words', MODE === 'full' ? 200 : 3, { min: 1 });
const CHAIN_HOPS = numberArg('--chain-hops', MODE === 'full' ? 25 : 3, { min: 1 });
const SOAK_MS = numberArg('--soak-ms', MODE === 'full' ? 300_000 : 0);
const FUZZ_GESTURES = numberArg('--fuzz-gestures', MODE === 'full' ? 400 : 12);
const FUZZ_SEEDS = String(arg('--fuzz-seeds', MODE === 'full' ? '1729,2718,3141' : '1729'))
  .split(',')
  .filter(Boolean)
  .map((seed) => Number(seed));
if (FUZZ_SEEDS.some((seed) => !Number.isSafeInteger(seed))) throw new Error('--fuzz-seeds must be comma-separated integers');
const SHOTS = resolve(arg('--shots', join(TOOL_DIR, '..', '..', '..', 'docs', 'audits', 'drift-consistency-shots')));
const OUT = resolve(arg('--out', join(TOOL_DIR, '..', '..', '..', 'docs', 'audits', 'drift-consistency-report.json')));
mkdirSync(SHOTS, { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });

const startedAt = new Date().toISOString();
const cases = [];
const pageErrors = [];
let fatalError = null;
let matrixWordsTested = 0;
let chainCompleted = 0;
const chainStrata = new Set();
let strataProbe = { status: 'not-run' };
let soakProbe = { status: SOAK_MS ? 'pending' : 'not-run', durationMs: SOAK_MS };
const fuzzCompleted = new Map(FUZZ_SEEDS.map((seed) => [seed, 0]));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const server = createServer((q, r) => {
  const p = decodeURIComponent((q.url ?? '/').split('?')[0]);
  const f = resolve(CORRIDOR, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
  if (!f.startsWith(CORRIDOR) || !existsSync(f)) {
    r.writeHead(404);
    r.end();
    return;
  }
  r.writeHead(200, { 'cache-control': 'no-store', 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
  r.end(readFileSync(f));
});
const base = await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${server.address().port}`)));

let browser;
let page;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await ctx.addInitScript(`(() => {
  try { localStorage.clear(); } catch (error) {}
  const raw = new URL(location.href).searchParams.get('__fuzzSeed');
  if (raw == null) return;
  let state = (Number(raw) >>> 0) || 0x9e3779b9;
  Math.random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
})()`);
page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, radiusX: 5, radiusY: 5, force: 1 })) });
const tapAt = async (x, y) => {
  await touch('touchStart', [[x, y]]);
  await page.waitForTimeout(65);
  await touch('touchEnd', []);
};
const dragAt = async (x0, y0, x1, y1, ms, steps = 8) => {
  await touch('touchStart', [[x0, y0]]);
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(ms / steps);
    await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
  }
  await touch('touchEnd', []);
};
const pinchAt = async (cx, cy, r0, r1, ms = 320, steps = 8) => {
  const pts = (r) => [
    [cx - r, cy],
    [cx + r, cy],
  ];
  await touch('touchStart', [pts(r0)[0]]);
  await touch('touchStart', pts(r0));
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(ms / steps);
    const r = r0 + ((r1 - r0) * i) / steps;
    await touch('touchMove', pts(r));
  }
  await touch('touchEnd', []);
};

let currentTheme = '北斎';
let shotN = 0;
const file = async (word, gesture, expected, outcome, detail, extra = {}) => {
  const bad = outcome !== 'ok';
  const entry = {
    word: word.w,
    kanji: word.kanji ?? null,
    theme: currentTheme,
    gesture,
    expected,
    outcome,
    detail,
    shot: null,
    ...extra,
  };
  if (bad && shotN < 40 && page) {
    const safeGesture = gesture.replace(/[^a-z0-9-]+/gi, '-');
    entry.shot = `case-${String(++shotN).padStart(2, '0')}-${safeGesture}.png`;
    try {
      await page.screenshot({ path: join(SHOTS, entry.shot) });
    } catch (error) {
      entry.screenshotError = error instanceof Error ? error.message : String(error);
      pageErrors.push(`failure screenshot failed for ${gesture}: ${entry.screenshotError}`);
      entry.shot = null;
    }
  }
  cases.push(entry);
  const mark = bad ? ' !! ' : ' ok ';
  console.log(`${mark}${word.w.padEnd(12)} ${gesture.padEnd(18)} ${outcome}${detail ? ' — ' + detail : ''}`);
};

const boot = async (theme = '北斎', fuzzSeed = null) => {
  const seedQuery = Number.isSafeInteger(fuzzSeed) ? `&__fuzzSeed=${fuzzSeed}` : '';
  await page.goto(`${base}/index.html?entry=drift${seedQuery}`);
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await page.waitForTimeout(2100);
  for (let attempts = 0; attempts < 5; attempts++) {
    const observed = await page.locator('#theme').textContent();
    if (observed === theme) {
      currentTheme = theme;
      return;
    }
    await page.locator('#theme').click();
    await page.waitForTimeout(80);
  }
  throw new Error(`theme ${theme} was not reachable through the visible theme control`);
};
await boot();

/* ------------------- the level tide (operator ruling, said twice — law) */
{
  const WBIG = JSON.parse(readFileSync(resolve(CORRIDOR, '..', 'drift', 'data', 'wbig.json'), 'utf8'));
  const LVL = new Map(WBIG.map((e) => [e[0], e[3]]));
  const lvlBox = await page.evaluate(
    `(() => { const r = document.getElementById('lvl').getBoundingClientRect(); return { x: r.left + r.width / 2, top: r.top, w: r.width, h: r.height }; })()`,
  );
  await touch('touchStart', [[lvlBox.x, lvlBox.top + lvlBox.h * 0.2]]);
  await page.waitForTimeout(320);
  const hot = await page.evaluate(
    `(() => { const el = document.getElementById('lvl'); return { hot: el.classList.contains('hot'), width: el.getBoundingClientRect().width }; })()`,
  );
  await touch('touchEnd', []);
  await page.waitForTimeout(2600);
  const words = await page.evaluate(
    `[...document.querySelectorAll('#drift-layer .word')].map((el) => el.querySelector('.base')?.textContent ?? '').filter(Boolean)`,
  );
  const levelled = words.map((w) => LVL.get(w)).filter(Boolean);
  const n1Share = levelled.length ? levelled.filter((l) => l === 1).length / levelled.length : 0;
  const tideOk = lvlBox.w >= 44 && hot.hot && hot.width >= 44 && n1Share >= 0.8;
  console.log(
    `${tideOk ? '  ok  ' : ' FAIL '}tide · the slider answers the finger and the field obeys the stop — ` +
      `rest=${lvlBox.w.toFixed(0)}px hot=${hot.hot}/${hot.width.toFixed(0)}px, N1 share ${(n1Share * 100).toFixed(0)}% of ${levelled.length}`,
  );
  await file(
    { w: 'level tide', kanji: null },
    'tide-stop',
    'hot control >=44px and selected level >=80% of visible words',
    tideOk ? 'ok' : 'misfired',
    `restWidth=${lvlBox.w.toFixed(1)}px; hot=${hot.hot}; hotWidth=${hot.width.toFixed(1)}px; N1=${(n1Share * 100).toFixed(1)}% (${levelled.length} levelled words)`,
    { state: 'surface', coordinates: { x: lvlBox.x, y: lvlBox.top + lvlBox.h * 0.2 } },
  );
  await boot(); // back to the default field for the batteries
}

/* ------------------------------------------------------------- probes */
const KANJI_RE = '/[\\u4e00-\\u9fff]/';
const wordProbe = (label, requiredClass = null) => `(() => {
  const K = ${KANJI_RE};
  const target = ${JSON.stringify(label)};
  const requiredClass = ${JSON.stringify(requiredClass)};
  for (const el of document.querySelectorAll('#drift-layer .word')) {
    const base = el.querySelector('.base')?.textContent ?? '';
    if (base !== target) continue;
    if (requiredClass && !el.classList.contains(requiredClass)) continue;
    const r = el.getBoundingClientRect();
    const op = parseFloat(el.style.opacity || '1');
    return {
      exists: true,
      x: r.x + r.width / 2, y: r.y + r.height / 2,
      onScreen: r.width > 0 && r.right > 0 && r.left < 390 && r.bottom > 96 && r.top < 780,
      opacity: op,
      pe: el.style.pointerEvents || '',
      unfolded: el.classList.contains('unfolded') || el.classList.contains('glossed'),
      glossed: el.classList.contains('glossed'),
      isCentre: el.classList.contains('bctr'),
    };
  }
  return { exists: false };
})()`;
const aimWord = async (label, requiredClass = null, requiredGlossed = null) => {
  let previous = null;
  let last = { exists: false, aimable: false, reason: 'not found' };
  for (let attempt = 0; attempt < 6; attempt++) {
    last = await page.evaluate(`(() => {
      const target = ${JSON.stringify(label)};
      const requiredClass = ${JSON.stringify(requiredClass)};
      const requiredGlossed = ${JSON.stringify(requiredGlossed)};
      const candidates = [...document.querySelectorAll('#drift-layer .word')]
        .filter((el) => (el.querySelector('.base')?.textContent ?? '') === target)
        .filter((el) => !requiredClass || el.classList.contains(requiredClass))
        .filter((el) => requiredGlossed == null || el.classList.contains('glossed') === requiredGlossed);
      for (const el of candidates) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y)?.closest?.('.word') ?? null;
        const visible = r.width > 0 && r.height > 0 && r.left > 28 && r.right < 362 && r.top > 145 && r.bottom < 710;
        const interactive = getComputedStyle(el).pointerEvents !== 'none' && Number(getComputedStyle(el).opacity) >= 0.12;
        if (visible && interactive && hit === el) return { exists: true, aimable: true, x, y };
      }
      return { exists: candidates.length > 0, aimable: false, reason: candidates.length ? 'not safely hit-owned' : 'not found' };
    })()`);
    if (last.aimable) {
      if (previous && Math.hypot(last.x - previous.x, last.y - previous.y) <= 2.5) return last;
      previous = last;
    } else {
      previous = null;
    }
    await page.waitForTimeout(120);
  }
  return { ...last, aimable: false, reason: last.aimable ? 'still moving' : last.reason };
};
const worldProbe = `(() => ({
  bloomCentre: document.querySelector('#drift-layer .word.bctr')?.querySelector('.base')?.textContent ?? null,
  sats: document.querySelectorAll('#drift-layer .word.bsat').length,
  tray: document.getElementById('drift-tray')?.textContent ?? '',
  depthOpen: (document.getElementById('depth')?.textContent ?? '') !== '',
  cardOpen: document.getElementById('card')?.classList.contains('open') ?? false,
}))()`;
const bloomGeometryProbe = `(() => {
  const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const safe = { left: 12, top: 112, right: innerWidth - 12, bottom: innerHeight - 142 };
  const round = (value) => Math.round(value * 10) / 10;
  const allSatellites = [...document.querySelectorAll('#drift-layer .word.bsat')];
  const satellites = allSatellites
    .map((el, index) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        index,
        word: el.querySelector('.base')?.textContent ?? '',
        visible: r.width > 0 && r.height > 0 && style.display !== 'none' &&
          style.visibility !== 'hidden' && Number(style.opacity) > 0.05,
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      };
    })
    .filter((entry) => entry.visible);
  const outsideViewport = satellites.filter(({ rect: r }) =>
    r.left < viewport.left || r.top < viewport.top || r.right > viewport.right || r.bottom > viewport.bottom);
  const outsideSafeBody = satellites.filter(({ rect: r }) =>
    r.left < safe.left || r.top < safe.top || r.right > safe.right || r.bottom > safe.bottom);
  const overlaps = [];
  for (let i = 0; i < satellites.length; i++) {
    for (let j = i + 1; j < satellites.length; j++) {
      const a = satellites[i];
      const b = satellites[j];
      const width = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const height = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (width > 0.01 && height > 0.01)
        overlaps.push({ a: a.word, b: b.word, width: round(width), height: round(height) });
    }
  }
  const describe = ({ index, word, rect: r }) => ({
    index,
    word,
    rect: { left: round(r.left), top: round(r.top), right: round(r.right), bottom: round(r.bottom) },
  });
  return {
    ok: outsideViewport.length === 0 && outsideSafeBody.length === 0 && overlaps.length === 0,
    bloomCentre: document.querySelector('#drift-layer .word.bctr')?.querySelector('.base')?.textContent ?? null,
    total: allSatellites.length,
    visible: satellites.length,
    safe,
    satellites: satellites.map(describe),
    outsideViewport: outsideViewport.map(describe),
    outsideSafeBody: outsideSafeBody.map(describe),
    overlaps,
  };
})()`;
const waitForBloomSettled = async (expectedCentre, { timeoutMs = 6000, intervalMs = 200, requiredSamples = 3 } = {}) => {
  const started = Date.now();
  let previous = null;
  let consecutive = 0;
  let latest = null;
  let maxMotion = Infinity;
  while (Date.now() - started <= timeoutMs) {
    latest = await page.evaluate(bloomGeometryProbe);
    const current = new Map(latest.satellites.map((entry) => [`${entry.index}:${entry.word}`, entry.rect]));
    const comparable = previous && previous.size === current.size &&
      [...current.keys()].every((key) => previous.has(key));
    maxMotion = comparable
      ? Math.max(0, ...[...current].flatMap(([key, rect]) => {
          const prior = previous.get(key);
          return [
            Math.abs(rect.left - prior.left),
            Math.abs(rect.top - prior.top),
            Math.abs(rect.right - prior.right),
            Math.abs(rect.bottom - prior.bottom),
          ];
        }))
      : Infinity;
    const stateReady = latest.bloomCentre === expectedCentre && latest.total > 0 && latest.visible === latest.total;
    const stable = comparable && maxMotion <= 0.75;
    consecutive = stateReady && latest.ok && stable ? consecutive + 1 : 0;
    if (consecutive >= requiredSamples) {
      return { settled: true, elapsedMs: Date.now() - started, consecutive, maxMotion, geometry: latest };
    }
    previous = current;
    await page.waitForTimeout(intervalMs);
  }
  return {
    settled: false,
    elapsedMs: Date.now() - started,
    consecutive,
    maxMotion,
    geometry: latest,
  };
};

const pickOne = (exclude) => page.evaluate(`(() => {
  const done = new Set(${JSON.stringify([...exclude])});
  const K = ${KANJI_RE};
  const cands = [];
  for (const el of document.querySelectorAll('#drift-layer .word')) {
    const base = el.querySelector('.base')?.textContent ?? '';
    const r = el.getBoundingClientRect();
    if (!base || done.has(base) || !r.width) continue;
    if (r.left < 46 || r.right > 344 || r.top < 170 || r.bottom > 690) continue;
    const op = parseFloat(el.style.opacity || '1');
    if (op < 0.12) continue;
    const kanji = (base.match(/[\\u4e00-\\u9fff]/g) ?? []).length;
    cands.push({ w: base, kanji, opacity: op });
  }
  if (!cands.length) return null;
  // prefer the strata we have seen least: kana-only, then single-kanji
  cands.sort((a, b) => a.kanji - b.kanji || b.opacity - a.opacity);
  return cands[0];
})()`);

const pickWords = (want) => page.evaluate(`(() => {
  const K = ${KANJI_RE};
  const seen = new Set();
  const out = [];
  for (const el of document.querySelectorAll('#drift-layer .word')) {
    const base = el.querySelector('.base')?.textContent ?? '';
    const r = el.getBoundingClientRect();
    if (!base || seen.has(base) || !r.width) continue;
    if (r.left < 46 || r.right > 344 || r.top < 170 || r.bottom > 700) continue;
    const kanji = (base.match(/[\\u4e00-\\u9fff]/g) ?? []).length;
    const op = parseFloat(el.style.opacity || '1');
    if (op < 0.12) continue;
    seen.add(base);
    out.push({ w: base, kanji, opacity: op });
  }
  // stratify: kana-only first (rarest on screen), then 1-kanji, then rest
  const kana = out.filter((o) => o.kanji === 0);
  const one = out.filter((o) => o.kanji === 1);
  const multi = out.filter((o) => o.kanji >= 2);
  return [...kana, ...one, ...multi].slice(0, ${want});
})()`);

/* ------------------------------------------------------------- battery */
const waterPoint = () =>
  page.evaluate(`(() => {
    const boxes = [...document.querySelectorAll('#drift-layer .word, #drift-layer .glyph, .drift-door, #theme, #lvl')]
      .map((el) => el.getBoundingClientRect());
    const spots = [[200, 210], [330, 250], [120, 300], [260, 640], [90, 560], [340, 400]];
    for (const [x, y] of spots) {
      if (!boxes.some((b) => x > b.left - 8 && x < b.right + 8 && y > b.top - 8 && y < b.bottom + 8))
        return { x, y };
    }
    return { x: 200, y: 150 };
  })()`);
const settle = async () => {
  // a deliberate tap on TRUE open water, found empirically — a fixed point
  // once landed on the shelf door and quietly navigated the whole app away
  const water = await waterPoint();
  await tapAt(water.x, water.y);
  await page.waitForTimeout(450);
};

/* -------------------------------- deterministic kana/equivalence stratum */
await boot();
const strataSeed = { w: '静か', kanji: 1 };
const strataExpected = [
  { label: '穏やか', relation: 'synonym' },
  { label: 'うるさい', relation: 'kana-only antonym' },
];
const lockOpened = await page.evaluate(`window.__lockWord(${JSON.stringify(strataSeed.w)})`);
await page.waitForTimeout(1400);
const strataObserved = await page.evaluate(`(() => {
  const labels = ${JSON.stringify(strataExpected.map((entry) => entry.label))};
  const result = {};
  for (const label of labels) {
    const el = [...document.querySelectorAll('#drift-layer .word')]
      .find((candidate) => (candidate.querySelector('.base')?.textContent ?? '') === label);
    if (!el) { result[label] = { exists: false }; continue; }
    const r = el.getBoundingClientRect();
    result[label] = {
      exists: true,
      interactive: getComputedStyle(el).pointerEvents !== 'none',
      satellite: el.classList.contains('bsat'),
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      onScreen: r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 96 && r.top < innerHeight - 64,
    };
  }
  return result;
})()`);
let strataOk = Boolean(lockOpened);
for (const expected of strataExpected) {
  const observed = strataObserved[expected.label];
  const materialized = Boolean(observed?.exists && observed.interactive && observed.satellite && observed.onScreen);
  strataOk &&= materialized;
  await file(
    { w: expected.label, kanji: (expected.label.match(/[\u4e00-\u9fff]/g) ?? []).length },
    'lock-stratum',
    `${expected.relation} is a materialized, visible, interactive lock member`,
    materialized ? 'ok' : 'dead',
    observed?.exists
      ? `interactive=${observed.interactive}; satellite=${observed.satellite}; onScreen=${observed.onScreen}`
      : 'relation remained absent or canvas-only',
    { state: 'lock', relation: expected.relation },
  );
}
strataProbe = {
  status: strataOk ? 'verified' : 'failed',
  seed: strataSeed.w,
  expected: strataExpected,
  observed: strataObserved,
  note: 'The primary wbig index has zero kana-only labels; the semantic lock seam is the deterministic kana node stratum.',
};
await boot();

// each battery picks its word FRESH from the live viewport — camera drift
// between batteries then costs coverage variety, never false "vanished" rows
const tested = new Set();
for (let round = 0; round < N_WORDS; round++) {
  // every battery is hermetic: a fresh boot on a virgin store, so no case
  // inherits the camera, grades, or blooms of the one before it
  if (round > 0) await boot();
  let word = await pickOne(tested);
  if (!word) {
    await dragAt(200, 300, 200 + ((round % 3) - 1) * 130, 470, 260); // pan for fresh words
    await page.waitForTimeout(700);
    word = await pickOne(tested);
    if (!word) break;
  }
  tested.add(word.w);
  let at = await page.evaluate(wordProbe(word.w));
  if (!at.exists || !at.onScreen) continue;
  matrixWordsTested++;

  // The field drifts between probe and touch, and words overlap. Aiming from
  // a stale coordinate lands the tap on a neighbour and reports the innocent
  // word "dead" — a missed aim is not a defect, so confirm what is under the
  // finger before pressing, and re-aim if the field moved.
  let aimed = false;
  for (let a = 0; a < 3 && !aimed; a++) {
    at = await page.evaluate(wordProbe(word.w));
    if (!at.exists || !at.onScreen) break;
    aimed = await page.evaluate(`(() => {
      const el = document.elementFromPoint(${at.x}, ${at.y});
      const w = el && el.closest ? el.closest('.word') : null;
      return !!w && (w.querySelector('.base')?.textContent ?? '') === ${JSON.stringify(word.w)};
    })()`);
    if (!aimed) await page.waitForTimeout(180);
  }
  if (!aimed) continue;   // never reached the word: no case, no verdict

  // C1/C2 — tap: unfold + bloom (every word, kana included)
  await tapAt(at.x, at.y);
  await page.waitForTimeout(750);
  let s = await page.evaluate(wordProbe(word.w));
  let w0 = await page.evaluate(worldProbe);
  if (!s.exists) await file(word, 'tap', 'unfold+bloom', 'vanished', 'word gone after a tap');
  else if (w0.depthOpen) await file(word, 'tap', 'unfold+bloom', 'misfired', 'single tap dived');
  else if (!s.unfolded) {
    const forensic = await page.evaluate(`(() => {
      const copies = [...document.querySelectorAll('#drift-layer .word')]
        .filter((n) => (n.querySelector('.base')?.textContent ?? '') === ${JSON.stringify(word.w)})
        .map((n) => ({ cls: n.className, op: n.style.opacity, pe: n.style.pointerEvents }));
      const el = document.elementFromPoint(${at.x}, ${at.y});
      return { copies, under: el ? (el.closest('.word') ? 'word:' + (el.closest('.word').querySelector('.base')?.textContent ?? '') : el.tagName + '#' + el.id) : null,
               unfoldedNow: [...document.querySelectorAll('#drift-layer .word.unfolded')].map((n) => n.querySelector('.base')?.textContent) };
    })()`);
    await file(word, 'tap', 'unfold+bloom', 'dead', `no furigana (op=${at.opacity.toFixed(2)}->${s.opacity.toFixed(2)}) ${JSON.stringify(forensic)}`);
  }
  else if (w0.bloomCentre !== word.w) await file(word, 'tap', 'unfold+bloom', 'dead', `no constellation (sats=${w0.sats})`);
  else await file(word, 'tap', 'unfold+bloom', 'ok', `${w0.sats} satellites`);

  const bloomAlive = w0.bloomCentre === word.w;

  // C1 — second tap: gloss, still here
  if (s.exists) {
    s = await page.evaluate(wordProbe(word.w));
    // the bloom's assembly easing keeps moving the centre for a beat after the
    // first tap: confirm the finger is still over the word before the second
    let aimed2 = false;
    for (let a = 0; a < 3 && !aimed2; a++) {
      s = await page.evaluate(wordProbe(word.w));
      if (!s.exists || !s.onScreen) break;
      aimed2 = await page.evaluate(`(() => {
        const el = document.elementFromPoint(${s.x}, ${s.y});
        const w = el && el.closest ? el.closest('.word') : null;
        return !!w && (w.querySelector('.base')?.textContent ?? '') === ${JSON.stringify(word.w)};
      })()`);
      if (!aimed2) await page.waitForTimeout(180);
    }
    if (s.exists && s.onScreen && aimed2) {
      await tapAt(s.x, s.y);
      await page.waitForTimeout(500);
      const s2 = await page.evaluate(wordProbe(word.w));
      const w2 = await page.evaluate(worldProbe);
      if (!s2.exists && !w2.depthOpen) await file(word, 'tap-again', 'gloss', 'vanished', '');
      else if (w2.depthOpen) await file(word, 'tap-again', 'gloss', 'misfired', 'second tap dived (third act came early)');
      else if (!s2.glossed) await file(word, 'tap-again', 'gloss', 'dead', `no English (op=${s.opacity.toFixed(2)} pe="${s.pe}" unfolded=${s2.unfolded})`);
      else await file(word, 'tap-again', 'gloss', 'ok', '');
    }
  }

  // C4/C5 — pinch over the constellation: camera zooms, bloom survives
  if (bloomAlive) {
    const before = await page.evaluate(worldProbe);
    await pinchAt(195, 430, 40, 110);
    await page.waitForTimeout(600);
    const afterPinch = await page.evaluate(worldProbe);
    if (before.bloomCentre && afterPinch.bloomCentre !== before.bloomCentre)
      await file(word, 'pinch', 'bloom survives zoom', 'dismissed', 'pinch killed the constellation');
    else await file(word, 'pinch', 'bloom survives zoom', 'ok', '');
    await pinchAt(195, 430, 110, 42); // zoom back out
    await page.waitForTimeout(500);
  }

  // C3 — slow horizontal drag: the word MOVES and SURVIVES (never a grade)
  s = await page.evaluate(wordProbe(word.w));
  if (s.exists && s.onScreen) {
    const trayBefore = (await page.evaluate(worldProbe)).tray;
    await dragAt(s.x, s.y, s.x + 74, s.y - 8, 520);
    await page.waitForTimeout(900);
    const s3 = await page.evaluate(wordProbe(word.w));
    const w3 = await page.evaluate(worldProbe);
    if (!s3.exists || s3.opacity < 0.05)
      await file(word, 'slow-drag', 'moves, survives', 'misfired', `word destroyed by a slow drag (tray "${trayBefore}" → "${w3.tray}")`);
    else if (w3.tray !== trayBefore)
      await file(word, 'slow-drag', 'moves, survives', 'misfired', 'slow drag graded the word');
    else await file(word, 'slow-drag', 'moves, survives', 'ok', '');
  }

  await settle();

  // I3/I4 (spec v2, ratified Q1/Q2) — the satellite chain: tapping a
  // satellite REVEALS it (never destroys); tapping again re-centres the
  // constellation on it; a flick on a satellite never grades.
  const chainStart = await aimWord(word.w);
  if (chainStart.aimable) {
    await tapAt(chainStart.x, chainStart.y);
    // A family assembles from corpus positions, so a fixed delay made this
    // coverage depend on whether the chosen words happened to begin nearby.
    // Use the same bounded, geometry-aware settlement contract as the long
    // chain below before selecting a satellite for the three I3/I4 probes.
    const matrixBloomSettle = await waitForBloomSettled(word.w);
    const satPick = matrixBloomSettle.settled ? await page.evaluate(`(() => {
      const sats = [...document.querySelectorAll('#drift-layer .word.bsat')].map((el) => {
        const r = el.getBoundingClientRect();
        return { el, r, x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      for (const s of sats) {
        if (!s.r.width || s.r.left < 30 || s.r.right > 360 || s.r.top < 150 || s.r.bottom > 700) continue;
        const crowded = sats.some((o) => o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 34);
        if (crowded) continue;
        return { w: s.el.querySelector('.base')?.textContent ?? '' };
      }
      return null;
    })()`) : null;
    if (!matrixBloomSettle.settled) {
      const geometry = matrixBloomSettle.geometry;
      await file(
        word,
        'sat-flick',
        'a settled satellite exists for the chain battery',
        'detached',
        `settle timeout ${matrixBloomSettle.elapsedMs}ms; ` +
          `viewport=${JSON.stringify(geometry?.outsideViewport ?? [])}; ` +
          `safeBody=${JSON.stringify(geometry?.outsideSafeBody ?? [])}; ` +
          `overlaps=${JSON.stringify(geometry?.overlaps ?? [])}`,
      );
    }
    if (satPick && satPick.w) {
      const satWord = { w: satPick.w, kanji: (satPick.w.match(/[\u4e00-\u9fff]/g) ?? []).length };
      // flick a satellite: must NOT grade while the constellation is open
      const trayBeforeFlick = (await page.evaluate(worldProbe)).tray;
      const flickAim = await aimWord(satPick.w, 'bsat');
      if (!flickAim.aimable) {
        await file(satWord, 'sat-flick', 'no judgment on satellites', 'detached', flickAim.reason);
        await settle();
        continue;
      }
      await dragAt(flickAim.x, flickAim.y, flickAim.x + 90, flickAim.y, 90, 3);
      await page.waitForTimeout(800);
      const afterSatFlick = await page.evaluate(worldProbe);
      const satAfterFlick = await page.evaluate(wordProbe(satPick.w, 'bsat'));
      if (afterSatFlick.tray !== trayBeforeFlick)
        await file(satWord, 'sat-flick', 'no judgment on satellites', 'misfired', 'satellite was graded inside a constellation');
      else if (!satAfterFlick.exists)
        await file(satWord, 'sat-flick', 'no judgment on satellites', 'vanished', 'satellite gone after a flick');
      else await file(satWord, 'sat-flick', 'no judgment on satellites', 'ok', '');
      // tap the satellite: it must REVEAL in place, never vanish
      const sat2 = await aimWord(satPick.w, 'bsat', false);
      if (sat2.aimable) {
        await tapAt(sat2.x, sat2.y);
        await page.waitForTimeout(700);
        const sat3 = await page.evaluate(wordProbe(satPick.w, 'bsat'));
        if (!sat3.exists || sat3.opacity < 0.05)
          await file(satWord, 'sat-tap', 'reveals in place', 'vanished', 'satellite dissolved on first tap');
        else if (!sat3.unfolded)
          await file(satWord, 'sat-tap', 'reveals in place', 'dead', 'no reveal');
        else await file(satWord, 'sat-tap', 'reveals in place', 'ok', '');
        // tap again: the constellation re-centres on it — the chain walk
        const sat4 = await aimWord(satPick.w, 'bsat', true);
        if (sat4.aimable) {
          await tapAt(sat4.x, sat4.y);
          await page.waitForTimeout(1100);
          const w5 = await page.evaluate(worldProbe);
          const sat5 = await page.evaluate(wordProbe(satPick.w, 'bctr'));
          if (!sat5.exists)
            await file(satWord, 'sat-recentre', 'becomes the planet', 'vanished', 'satellite gone on second tap');
          else if (w5.bloomCentre !== satPick.w && !w5.depthOpen)
            await file(satWord, 'sat-recentre', 'becomes the planet', 'dead', `centre is ${w5.bloomCentre ?? 'nothing'}`);
          else await file(satWord, 'sat-recentre', 'becomes the planet', 'ok', `${w5.sats} new satellites`);
        }
      }
    }
    await settle();
  }

  // C6 — pointercancel mid-press, then a clean tap must still work.
  // Hermetic: its contract is cancel-then-tap on a clean field; the polluted
  // mid-battery variant becomes its own designed case later.
  await boot();
  const sc = await page.evaluate(wordProbe(word.w)).then(async (p0) => {
    if (p0.exists && p0.onScreen) return p0;
    const alt = await pickOne(new Set());
    return alt ? page.evaluate(wordProbe(alt.w)).then((p1) => ({ ...p1, alt: alt.w })) : p0;
  });
  const cancelWord = sc.alt ? { w: sc.alt, kanji: word.kanji } : word;
  if (sc.exists && sc.onScreen) {
    await touch('touchStart', [[sc.x, sc.y]]);
    await page.waitForTimeout(120);
    await touch('touchCancel', []);
    await page.waitForTimeout(250);
    const sc2 = await page.evaluate(wordProbe(cancelWord.w));
    if (sc2.exists && sc2.onScreen) {
      await tapAt(sc2.x, sc2.y);
      await page.waitForTimeout(650);
      const w4 = await page.evaluate(worldProbe);
      const sc3 = await page.evaluate(wordProbe(cancelWord.w));
      if (!sc3.exists) await file(cancelWord, 'cancel+tap', 'clean tap after cancel', 'vanished', '');
      else if (!sc3.unfolded && w4.bloomCentre !== cancelWord.w)
        await file(cancelWord, 'cancel+tap', 'clean tap after cancel', 'dead', 'gesture state dangling after pointercancel');
      else await file(cancelWord, 'cancel+tap', 'clean tap after cancel', 'ok', '');
    }
  }

  await settle();
}

await file(
  { w: 'matrix coverage', kanji: null },
  'sample-count',
  `${N_WORDS} distinct visible words complete the encoded battery`,
  matrixWordsTested === N_WORDS ? 'ok' : 'error',
  `${matrixWordsTested}/${N_WORDS} words completed`,
  { state: 'coverage' },
);

/* ------------------------------------------ endurance chain (A0 / A2) */
await boot();
const chainStartWord = await pickOne(new Set());
if (!chainStartWord) {
  await file(
    { w: 'chain', kanji: null },
    'chain-start',
    'a visible word starts the endurance walk',
    'dead',
    'no visible start word',
    { state: 'bloom' },
  );
} else {
  let centre = chainStartWord.w;
  chainStrata.add(chainStartWord.kanji === 0 ? 'kana' : chainStartWord.kanji === 1 ? 'one-kanji' : 'multi-kanji');
  const start = await aimWord(centre);
  if (!start.aimable) throw new Error(`chain start ${centre} was not safely aimable: ${start.reason}`);
  await tapAt(start.x, start.y);
  await page.waitForTimeout(1600);

  for (let hop = 1; hop <= CHAIN_HOPS; hop++) {
    const walked = new Set(cases.filter((entry) => entry.gesture === 'chain-hop').map((entry) => entry.word));
    const satellite = await page.evaluate(`(() => {
      const centre = ${JSON.stringify(centre)};
      const walked = new Set(${JSON.stringify([...walked])});
      const candidates = [...document.querySelectorAll('#drift-layer .word.bsat:not(.glossed)')].map((el) => {
        const r = el.getBoundingClientRect();
        const w = el.querySelector('.base')?.textContent ?? '';
        return { w, x: r.left + r.width / 2, y: r.top + r.height / 2, r };
      }).filter((candidate) => candidate.w && candidate.w !== centre &&
        candidate.r.width > 0 && candidate.r.left > 28 && candidate.r.right < 362 &&
        candidate.r.top > 145 && candidate.r.bottom < 710);
      candidates.sort((a, b) => Number(walked.has(a.w)) - Number(walked.has(b.w)) || a.w.localeCompare(b.w, 'ja'));
      const selected = candidates[0];
      return selected ? { w: selected.w } : null;
    })()`);
    if (!satellite) {
      await file(
        { w: centre, kanji: (centre.match(/[\u4e00-\u9fff]/g) ?? []).length },
        'chain-hop',
        `hop ${hop}/${CHAIN_HOPS} finds a visible satellite`,
        'dead',
        'no uncrowded on-screen satellite',
        { state: 'bloom', hop },
      );
      break;
    }

    const previousCentre = centre;
    const first = await aimWord(satellite.w, 'bsat', false);
    if (!first.aimable) {
      await file(
        { w: satellite.w, kanji: (satellite.w.match(/[\u4e00-\u9fff]/g) ?? []).length },
        'chain-hop',
        `hop ${hop}/${CHAIN_HOPS} is owned by the intended live satellite`,
        'detached',
        first.reason,
        { state: 'bloom', hop },
      );
      break;
    }
    await tapAt(first.x, first.y);
    await page.waitForTimeout(650);
    const revealed = await page.evaluate(wordProbe(satellite.w, 'bsat'));
    const afterReveal = await page.evaluate(worldProbe);
    if (!revealed.exists || !revealed.glossed || afterReveal.bloomCentre !== previousCentre) {
      await file(
        { w: satellite.w, kanji: (satellite.w.match(/[\u4e00-\u9fff]/g) ?? []).length },
        'chain-hop',
        `hop ${hop}/${CHAIN_HOPS} reveals in place before re-centring`,
        !revealed.exists ? 'vanished' : 'misfired',
        `exists=${revealed.exists}; glossed=${revealed.glossed}; centre=${afterReveal.bloomCentre ?? 'none'}`,
        { state: 'bloom', hop, coordinates: { x: first.x, y: first.y } },
      );
      break;
    }

    const second = await aimWord(satellite.w, 'bsat', true);
    if (!second.aimable) {
      await file(
        { w: satellite.w, kanji: (satellite.w.match(/[\u4e00-\u9fff]/g) ?? []).length },
        'chain-hop',
        `hop ${hop}/${CHAIN_HOPS} remains aimable for the second tap`,
        'detached',
        second.reason,
        { state: 'bloom', hop },
      );
      break;
    }
    await tapAt(second.x, second.y);
    const settleResult = await waitForBloomSettled(satellite.w);
    const afterRecentre = await page.evaluate(worldProbe);
    const newCentre = await page.evaluate(wordProbe(satellite.w, 'bctr'));
    const oldCentre = await page.evaluate(wordProbe(previousCentre));
    const recentreOk =
      newCentre.exists &&
      newCentre.isCentre &&
      oldCentre.exists &&
      afterRecentre.bloomCentre === satellite.w &&
      // Sparse, sourced families are valid. Requiring six here rewarded the
      // old arbitrary filler that the semantic integrity pass removed.
      afterRecentre.sats > 0;
    const geometry = settleResult.geometry;
    const hopOk = recentreOk && settleResult.settled && geometry?.ok;
    const geometryDetail = geometry
      ? `settled=${settleResult.settled}; settleMs=${settleResult.elapsedMs}; ` +
        `stableSamples=${settleResult.consecutive}; maxMotion=${Number.isFinite(settleResult.maxMotion) ? settleResult.maxMotion.toFixed(2) : 'unmatched'}; ` +
        `geometry=${geometry.ok ? 'clear' : 'broken'}; visible=${geometry.visible}/${geometry.total}; ` +
        `viewport=${JSON.stringify(geometry.outsideViewport)}; ` +
        `safeBody=${JSON.stringify(geometry.outsideSafeBody)}; overlaps=${JSON.stringify(geometry.overlaps)}`
      : 'geometry=not-reached';
    await file(
      { w: satellite.w, kanji: (satellite.w.match(/[\u4e00-\u9fff]/g) ?? []).length },
      'chain-hop',
      `hop ${hop}/${CHAIN_HOPS} makes the satellite the held planet and keeps every visible satellite inside the safe body without overlap`,
      hopOk ? 'ok' : !newCentre.exists || !oldCentre.exists ? 'vanished' : 'detached',
      `centre=${afterRecentre.bloomCentre ?? 'none'}; sats=${afterRecentre.sats}; priorExists=${oldCentre.exists}; ${geometryDetail}`,
      { state: 'bloom', hop },
    );
    if (!hopOk) break;
    centre = satellite.w;
    chainCompleted++;
    const kanji = (satellite.w.match(/[\u4e00-\u9fff]/g) ?? []).length;
    chainStrata.add(kanji === 0 ? 'kana' : kanji === 1 ? 'one-kanji' : 'multi-kanji');
  }
}

/* ---------------------------------------------- theme/camera parity smoke */
for (const theme of ['北斎', '夜']) {
  await boot(theme);
  const candidate = await pickOne(new Set());
  if (!candidate) {
    await file(
      { w: `${theme} theme`, kanji: null },
      'theme-camera',
      'theme exposes an interactive word',
      'dead',
      'no visible candidate',
      { state: 'surface' },
    );
    continue;
  }
  const before = await page.evaluate(wordProbe(candidate.w));
  await tapAt(before.x, before.y);
  await page.waitForTimeout(850);
  const opened = await page.evaluate(worldProbe);
  await pinchAt(195, 430, 44, 96, 220, 6);
  await page.waitForTimeout(450);
  const navigated = await page.evaluate(worldProbe);
  const themeOk = opened.bloomCentre === candidate.w && navigated.bloomCentre === candidate.w;
  await file(
    candidate,
    'theme-camera',
    `${theme} preserves the held constellation through a camera pinch`,
    themeOk ? 'ok' : 'dismissed',
    `before=${opened.bloomCentre ?? 'none'}; after=${navigated.bloomCentre ?? 'none'}`,
    { state: 'bloom' },
  );
}

/* --------------------------------------- seeded invariant fuzz (A0 / A3) */
const makePrng = (seed) => {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
};
const openFuzzBloom = async (seed) => {
  await boot('北斎', seed);
  const candidate = await pickOne(new Set());
  if (!candidate) return null;
  const probe = await page.evaluate(wordProbe(candidate.w));
  await tapAt(probe.x, probe.y);
  await page.waitForTimeout(1600);
  const world = await page.evaluate(worldProbe);
  return world.bloomCentre === candidate.w ? candidate.w : null;
};

for (const seed of FUZZ_SEEDS) {
  if (FUZZ_GESTURES === 0) continue;
  const random = makePrng(seed);
  let centre = await openFuzzBloom(seed);
  if (!centre) {
    await file(
      { w: `fuzz seed ${seed}`, kanji: null },
      'fuzz-start',
      'a deterministic visible word opens a held constellation',
      'dead',
      'could not open the seeded starting bloom',
      { state: 'fuzz', seed, step: 0 },
    );
    continue;
  }

  for (let step = 1; step <= FUZZ_GESTURES; step++) {
    const actionNames = ['pinch-out', 'pinch-in', 'pan', 'cancel', 'theme', 'slow-drag', 'sat-reveal', 'water-release'];
    let action = actionNames[Math.floor(random() * actionNames.length)];
    const beforeWorld = await page.evaluate(worldProbe);
    const beforeCentre = await page.evaluate(wordProbe(centre));
    const errorsBefore = pageErrors.length;
    let actionDetail = '';
    let actionSpecificOk = true;
    let coordinates = null;

    if (action === 'pinch-out') {
      const radius = 82 + Math.floor(random() * 20);
      coordinates = { cx: 195, cy: 430, fromRadius: 42, toRadius: radius };
      await pinchAt(195, 430, 42, radius, 150, 4);
      await page.waitForTimeout(180);
    } else if (action === 'pinch-in') {
      const radius = 38 + Math.floor(random() * 12);
      coordinates = { cx: 195, cy: 430, fromRadius: 94, toRadius: radius };
      await pinchAt(195, 430, 94, radius, 150, 4);
      await page.waitForTimeout(180);
    } else if (action === 'pan') {
      const water = await waterPoint();
      const dx = random() < 0.5 ? -36 : 36;
      const dy = random() < 0.5 ? -24 : 24;
      coordinates = { x0: water.x, y0: water.y, x1: water.x + dx, y1: water.y + dy };
      await dragAt(water.x, water.y, water.x + dx, water.y + dy, 150, 4);
      await page.waitForTimeout(180);
    } else if (action === 'cancel') {
      const x = 70 + Math.floor(random() * 250);
      const y = 190 + Math.floor(random() * 440);
      coordinates = { x, y };
      await touch('touchStart', [[x, y]]);
      await page.waitForTimeout(35);
      await touch('touchCancel', []);
      await page.waitForTimeout(120);
    } else if (action === 'theme') {
      await page.locator('#theme').click();
      await page.waitForTimeout(140);
      currentTheme = (await page.locator('#theme').textContent()) ?? currentTheme;
    } else if (action === 'slow-drag') {
      if (!beforeCentre.exists || !beforeCentre.onScreen) {
        actionSpecificOk = false;
        actionDetail = 'held centre was not aimable before the drag';
      } else {
        const dx = beforeCentre.x > 230 ? -30 : 30;
        coordinates = { x0: beforeCentre.x, y0: beforeCentre.y, x1: beforeCentre.x + dx, y1: beforeCentre.y + 8 };
        const trayBefore = beforeWorld.tray;
        await dragAt(beforeCentre.x, beforeCentre.y, beforeCentre.x + dx, beforeCentre.y + 8, 440, 7);
        await page.waitForTimeout(220);
        actionSpecificOk = (await page.evaluate(worldProbe)).tray === trayBefore;
        actionDetail = actionSpecificOk ? '' : 'slow drag changed the judgment tray';
      }
    } else if (action === 'sat-reveal') {
      await page.waitForTimeout(500);
      const satellite = await page.evaluate(`(() => {
        const candidates = [...document.querySelectorAll('#drift-layer .word.bsat:not(.glossed)')].map((el) => {
          const r = el.getBoundingClientRect();
          return { w: el.querySelector('.base')?.textContent ?? '', x: r.left + r.width / 2, y: r.top + r.height / 2, r };
        }).filter((candidate) => candidate.w && candidate.r.width > 0 && candidate.r.left > 28 &&
          candidate.r.right < 362 && candidate.r.top > 145 && candidate.r.bottom < 710);
        const candidate = candidates.find((entry) =>
          !candidates.some((other) => other !== entry && Math.hypot(other.x - entry.x, other.y - entry.y) < 38));
        return candidate ? { w: candidate.w } : null;
      })()`);
      const revealAim = satellite ? await aimWord(satellite.w, 'bsat', false) : null;
      if (!satellite || !revealAim?.aimable) {
        action = 'cancel-fallback';
        await touch('touchStart', [[195, 430]]);
        await page.waitForTimeout(35);
        await touch('touchCancel', []);
        await page.waitForTimeout(120);
      } else {
        coordinates = { x: revealAim.x, y: revealAim.y, satellite: satellite.w };
        await tapAt(revealAim.x, revealAim.y);
        await page.waitForTimeout(500);
        const revealed = await page.evaluate(wordProbe(satellite.w, 'bsat'));
        const afterReveal = await page.evaluate(worldProbe);
        actionSpecificOk = revealed.exists && revealed.glossed && afterReveal.bloomCentre === centre;
        actionDetail = `satellite=${satellite.w}; exists=${revealed.exists}; glossed=${revealed.glossed}`;
      }
    } else {
      const water = await waterPoint();
      coordinates = { x: water.x, y: water.y };
      await tapAt(water.x, water.y);
      await page.waitForTimeout(500);
      const released = await page.evaluate(worldProbe);
      const prior = await page.evaluate(wordProbe(centre));
      actionSpecificOk = released.bloomCentre == null && !released.depthOpen && prior.exists;
      actionDetail = `centre=${released.bloomCentre ?? 'none'}; depthOpen=${released.depthOpen}; priorExists=${prior.exists}`;
    }

    const afterWorld = await page.evaluate(worldProbe);
    const afterCentre = await page.evaluate(wordProbe(centre));
    const preservesHeld =
      action === 'water-release'
        ? actionSpecificOk
        : actionSpecificOk && afterWorld.bloomCentre === centre && afterCentre.exists;
    const noNewErrors = pageErrors.length === errorsBefore;
    const actionOk = preservesHeld && noNewErrors;
    await file(
      { w: centre, kanji: (centre.match(/[\u4e00-\u9fff]/g) ?? []).length },
      `fuzz-${action}`,
      action === 'water-release'
        ? 'deliberate water tap releases the constellation without deleting its planet'
        : 'camera/state action preserves the held planet and emits no runtime error',
      actionOk ? 'ok' : actionSpecificOk ? 'dismissed' : 'misfired',
      actionDetail || `centre=${afterWorld.bloomCentre ?? 'none'}; exists=${afterCentre.exists}; newErrors=${pageErrors.length - errorsBefore}`,
      { state: 'fuzz', seed, step, coordinates },
    );
    if (!actionOk) break;
    fuzzCompleted.set(seed, step);

    if (action === 'water-release' && step < FUZZ_GESTURES) {
      centre = await openFuzzBloom(seed);
      if (!centre) {
        await file(
          { w: `fuzz seed ${seed}`, kanji: null },
          'fuzz-reopen',
          'the next deterministic fuzz segment can reopen a held constellation',
          'dead',
          `failed after step ${step}`,
          { state: 'fuzz', seed, step },
        );
        break;
      }
    }
  }
}

/* --------------------------------------------------- optional ambient soak */
if (SOAK_MS > 0) {
  await boot();
  const errorsBeforeSoak = pageErrors.length;
  await page.waitForTimeout(SOAK_MS);
  const candidate = await pickOne(new Set());
  let responsive = Boolean(candidate);
  let observed = null;
  if (candidate) {
    const before = await page.evaluate(wordProbe(candidate.w));
    await tapAt(before.x, before.y);
    await page.waitForTimeout(850);
    observed = await page.evaluate(worldProbe);
    responsive = observed.bloomCentre === candidate.w;
  }
  const soakOk = responsive && pageErrors.length === errorsBeforeSoak;
  soakProbe = {
    status: soakOk ? 'probe-verified' : 'failed',
    durationMs: SOAK_MS,
    postSoakBattery: 'single tap+bloom smoke; full matrix rerun remains a separate obligation',
    observed,
  };
  await file(
    { w: candidate?.w ?? 'ambient soak', kanji: candidate?.kanji ?? null },
    'soak-resume',
    `${SOAK_MS}ms ambient soak leaves Drift responsive and page-error-free`,
    soakOk ? 'ok' : 'error',
    `responsive=${responsive}; newPageErrors=${pageErrors.length - errorsBeforeSoak}`,
    { state: 'soak' },
  );
}

} catch (error) {
  fatalError = error instanceof Error ? { message: error.message, stack: error.stack ?? null } : { message: String(error), stack: null };
  console.error(fatalError.stack ?? fatalError.message);
} finally {
  if (browser) {
    try {
      await browser.close();
    } catch (error) {
      pageErrors.push(`browser close failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  await new Promise((resolveClose) => server.close(resolveClose));

  const uniquePageErrors = [...new Set(pageErrors)];
  for (const message of uniquePageErrors) {
    cases.push({
      word: 'runtime',
      kanji: null,
      theme: currentTheme,
      gesture: 'page-error',
      expected: 'zero pageerror or console error events',
      outcome: 'error',
      detail: message,
      shot: null,
      state: 'runtime',
    });
  }
  if (fatalError) {
    cases.push({
      word: 'verifier',
      kanji: null,
      theme: currentTheme,
      gesture: 'fatal-error',
      expected: 'the complete selected sweep writes a receipt',
      outcome: 'error',
      detail: fatalError.message,
      shot: null,
      state: 'instrument',
    });
  }

  const clusters = {};
  for (const c of cases) {
    if (c.outcome === 'ok') continue;
    const key = `${c.gesture} → ${c.outcome}`;
    (clusters[key] ??= []).push(c);
  }
  const total = cases.length;
  const bad = cases.filter((c) => c.outcome !== 'ok').length;
  const chainViolations = cases.filter((entry) => entry.gesture === 'chain-hop' && entry.outcome !== 'ok').length;
  const fuzzCases = cases.filter((entry) => entry.gesture.startsWith('fuzz-'));
  const fuzzViolations = fuzzCases.filter((entry) => entry.outcome !== 'ok').length;
  const fuzzVerified =
    new Set(FUZZ_SEEDS).size >= 3 &&
    FUZZ_GESTURES >= 400 &&
    FUZZ_SEEDS.every((seed) => (fuzzCompleted.get(seed) ?? 0) >= 400) &&
    fuzzViolations === 0;
  const primaryWords = JSON.parse(readFileSync(resolve(CORRIDOR, '..', 'drift', 'data', 'wbig.json'), 'utf8'));
  const primaryKana = primaryWords.filter((entry) => !/[\u4e00-\u9fff]/.test(entry[0])).length;
  const encodedGestures = [...new Set(cases.map((entry) => entry.gesture))].sort();
  const fullMatrixGaps = [
    '>=200 nodes across family-size, residency, fragility, glyph, radical, particle, and dive-depth strata',
    'third tap, long press, four-direction/two-speed drag, both flicks, open-water pinch, twist, pan/release, and depth-1/depth-2 gestures',
    'all five themes across the full node × gesture × state matrix',
    ...(!fuzzVerified ? ['three replayable 400-gesture fuzz seeds'] : []),
    'a full encoded battery after the five-minute soak',
    'two consecutive dry full-matrix runs',
  ];
  const chainVerified = CHAIN_HOPS >= 25 && chainCompleted >= 25 && chainStrata.size >= 2 && chainViolations === 0;
  const report = {
    schemaVersion: 2,
    generated: 'drift-consistency sweep v2',
    startedAt,
    finishedAt: new Date().toISOString(),
    sourceSha: process.env.GITHUB_SHA ?? null,
    mode: MODE,
    configuration: {
      words: N_WORDS,
      chainHops: CHAIN_HOPS,
      fuzzSeeds: FUZZ_SEEDS,
      fuzzGesturesPerSeed: FUZZ_GESTURES,
      soakMs: SOAK_MS,
      viewport: { width: 390, height: 844, deviceScaleFactor: 2 },
      browser: process.env.CHROMIUM_PATH ? 'explicit CHROMIUM_PATH' : 'playwright pinned chromium',
    },
    gate: {
      scope: MODE === 'fast' ? 'bounded PR regression slice' : 'expanded A0 evidence run (not full acceptance authority)',
      status: bad === 0 ? 'pass' : 'fail',
      exitCode: bad === 0 ? 0 : 1,
      promotionRule: 'pass iff every executed case is ok, no page/console/fatal errors occur, and requested sample counts complete',
    },
    totals: { total, ok: total - bad, violations: bad, pageErrors: uniquePageErrors.length },
    coverage: {
      matrix: {
        requestedWords: N_WORDS,
        completedWords: matrixWordsTested,
        encodedGestures,
        encodedStates: ['surface', 'bloom', 'lock', ...(SOAK_MS ? ['soak'] : [])],
        themes: ['北斎', '夜'],
      },
      lexicalInventory: { primaryWords: primaryWords.length, primaryKanaOnly: primaryKana },
      deterministicKanaAndEquivalenceStratum: strataProbe,
      chain: {
        requestedHops: CHAIN_HOPS,
        completedHops: chainCompleted,
        observedStrata: [...chainStrata].sort(),
        violations: chainViolations,
      },
      fuzz: {
        status: fuzzVerified ? 'verified' : fuzzViolations ? 'failed' : FUZZ_GESTURES ? 'sampled' : 'not-run',
        seedsRequested: FUZZ_SEEDS,
        gesturesPerSeed: FUZZ_GESTURES,
        completedBySeed: Object.fromEntries(fuzzCompleted),
        violations: fuzzViolations,
        replay: 'rerun with the recorded --fuzz-seeds and --fuzz-gestures; each seeded page also receives deterministic Math.random',
        obligation: '3 × 400 seeded, replayable gestures',
      },
      soak: soakProbe,
    },
    acceptance: {
      A1_fullMatrixTwice: { status: 'not-proven', gaps: fullMatrixGaps },
      A2_chain25: {
        status: chainVerified ? 'verified' : chainViolations ? 'failed' : 'not-proven',
        reason: chainVerified
          ? '25 consecutive hops completed across at least two observed strata'
          : `${chainCompleted}/${Math.max(25, CHAIN_HOPS)} required hops; strata=${[...chainStrata].sort().join(',') || 'none'}`,
      },
      A3_fuzz3x400: {
        status: fuzzVerified ? 'verified' : fuzzViolations ? 'failed' : 'not-proven',
        reason: fuzzVerified
          ? 'at least three distinct seeds completed 400 invariant-checked gestures each'
          : `${FUZZ_SEEDS.length} seed(s) selected at ${FUZZ_GESTURES} gestures; completed=${JSON.stringify(Object.fromEntries(fuzzCompleted))}`,
      },
      A4_soak5mThenFullBattery: {
        status: soakProbe.status === 'failed' ? 'failed' : 'not-proven',
        reason: SOAK_MS >= 300_000
          ? 'five-minute ambient probe ran, but the complete post-soak matrix remains unencoded'
          : `selected soak was ${SOAK_MS}ms; acceptance requires 300000ms plus the full battery`,
      },
      A5_corridor: { status: 'not-run', reason: 'verify-corridor.mjs is a separate gate' },
      A6_operatorWalk: { status: 'human-only', reason: 'the verifier cannot self-grant the operator criterion' },
    },
    fatalError,
    pageErrors: uniquePageErrors,
    clusters: Object.fromEntries(Object.entries(clusters).map(([key, list]) => [key, list.length])),
    cases,
  };

  console.log(`\n==== sweep: ${total} cases · ${total - bad} ok · ${bad} violations · ${uniquePageErrors.length} page errors ====`);
  for (const [key, list] of Object.entries(clusters).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(list.length).padStart(3)} × ${key}   e.g. ${list.slice(0, 4).map((c) => c.word).join('・')}`);
  }
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`report → ${OUT}\nshots  → ${SHOTS}`);
  process.exitCode = bad === 0 ? 0 : 1;
}
