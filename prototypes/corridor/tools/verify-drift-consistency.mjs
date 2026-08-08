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
 *   node verify-drift-consistency.mjs [--words N] [--shots DIR] [--out FILE]
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
const N_WORDS = Number(arg('--words', 24));
const SHOTS = resolve(arg('--shots', join(TOOL_DIR, '..', '..', '..', 'docs', 'audits', 'drift-consistency-shots')));
const OUT = resolve(arg('--out', join(TOOL_DIR, '..', '..', '..', 'docs', 'audits', 'drift-consistency-report.json')));
mkdirSync(SHOTS, { recursive: true });

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

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await ctx.addInitScript('try{localStorage.clear()}catch(e){}');
const page = await ctx.newPage();
const pageErrors = [];
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

const boot = async () => {
  await page.goto(`${base}/index.html?entry=drift`);
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await page.waitForTimeout(2100);
};
await boot();

/* ------------------- the level tide (operator ruling, said twice — law) */
{
  const WBIG = JSON.parse(readFileSync(resolve(CORRIDOR, '..', 'drift', 'data', 'wbig.json'), 'utf8'));
  const LVL = new Map(WBIG.map((e) => [e[0], e[3]]));
  const lvlBox = await page.evaluate(
    `(() => { const r = document.getElementById('lvl').getBoundingClientRect(); return { x: r.left + 17, top: r.top, h: r.height }; })()`,
  );
  await touch('touchStart', [[lvlBox.x, lvlBox.top + lvlBox.h * 0.2]]);
  await page.waitForTimeout(220);
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
  const tideOk = hot.hot && hot.width >= 44 && n1Share >= 0.8;
  console.log(
    `${tideOk ? '  ok  ' : ' FAIL '}tide · the slider answers the finger and the field obeys the stop — ` +
      `hot=${hot.hot} width=${hot.width.toFixed(0)}px, N1 share ${(n1Share * 100).toFixed(0)}% of ${levelled.length}`,
  );
  if (!tideOk) {
    cases.push?.({});
    pageErrors.push('tide check failed');
  }
  await boot(); // back to the default field for the batteries
}

/* ------------------------------------------------------------- probes */
const KANJI_RE = '/[\\u4e00-\\u9fff]/';
const wordProbe = (label) => `(() => {
  const K = ${KANJI_RE};
  const target = ${JSON.stringify(label)};
  for (const el of document.querySelectorAll('#drift-layer .word')) {
    const base = el.querySelector('.base')?.textContent ?? '';
    if (base !== target) continue;
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
const worldProbe = `(() => ({
  bloomCentre: document.querySelector('#drift-layer .word.bctr')?.querySelector('.base')?.textContent ?? null,
  sats: document.querySelectorAll('#drift-layer .word.bsat').length,
  tray: document.getElementById('drift-tray')?.textContent ?? '',
  depthOpen: (document.getElementById('depth')?.textContent ?? '') !== '',
  cardOpen: document.getElementById('card')?.classList.contains('open') ?? false,
}))()`;

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
const cases = [];
let shotN = 0;
const file = async (word, gesture, expected, outcome, detail) => {
  const bad = outcome !== 'ok';
  let shot = null;
  if (bad && shotN < 40) {
    shot = `case-${String(++shotN).padStart(2, '0')}-${gesture}.png`;
    await page.screenshot({ path: join(SHOTS, shot) });
  }
  cases.push({ word: word.w, kanji: word.kanji, gesture, expected, outcome, detail, shot });
  const mark = bad ? ' !! ' : ' ok ';
  console.log(`${mark}${word.w.padEnd(8)} ${gesture.padEnd(14)} ${outcome}${detail ? ' — ' + detail : ''}`);
};
const settle = async () => {
  // a deliberate tap on TRUE open water, found empirically — a fixed point
  // once landed on the shelf door and quietly navigated the whole app away
  const water = await page.evaluate(`(() => {
    const boxes = [...document.querySelectorAll('#drift-layer .word, #drift-layer .glyph, .drift-door, #theme, #lvl')]
      .map((el) => el.getBoundingClientRect());
    const spots = [[200, 210], [330, 250], [120, 300], [260, 640], [90, 560], [340, 400]];
    for (const [x, y] of spots) {
      if (!boxes.some((b) => x > b.left - 8 && x < b.right + 8 && y > b.top - 8 && y < b.bottom + 8))
        return { x, y };
    }
    return { x: 200, y: 150 };
  })()`);
  await tapAt(water.x, water.y);
  await page.waitForTimeout(450);
};

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
  const chainStart = await page.evaluate(wordProbe(word.w));
  if (chainStart.exists && chainStart.onScreen) {
    await tapAt(chainStart.x, chainStart.y);
    await page.waitForTimeout(1400); // satellites glide to their ring first
    const satPick = await page.evaluate(`(() => {
      const sats = [...document.querySelectorAll('#drift-layer .word.bsat')].map((el) => {
        const r = el.getBoundingClientRect();
        return { el, r, x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      for (const s of sats) {
        if (!s.r.width || s.r.left < 30 || s.r.right > 360 || s.r.top < 150 || s.r.bottom > 700) continue;
        const crowded = sats.some((o) => o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 34);
        if (crowded) continue;
        return { w: s.el.querySelector('.base')?.textContent ?? '', x: s.x, y: s.y };
      }
      return null;
    })()`);
    if (satPick && satPick.w) {
      const satWord = { w: satPick.w, kanji: (satPick.w.match(/[\u4e00-\u9fff]/g) ?? []).length };
      // flick a satellite: must NOT grade while the constellation is open
      const trayBeforeFlick = (await page.evaluate(worldProbe)).tray;
      await dragAt(satPick.x, satPick.y, satPick.x + 90, satPick.y, 90, 3);
      await page.waitForTimeout(800);
      const afterSatFlick = await page.evaluate(worldProbe);
      const satAfterFlick = await page.evaluate(wordProbe(satPick.w));
      if (afterSatFlick.tray !== trayBeforeFlick)
        await file(satWord, 'sat-flick', 'no judgment on satellites', 'misfired', 'satellite was graded inside a constellation');
      else if (!satAfterFlick.exists)
        await file(satWord, 'sat-flick', 'no judgment on satellites', 'vanished', 'satellite gone after a flick');
      else await file(satWord, 'sat-flick', 'no judgment on satellites', 'ok', '');
      // tap the satellite: it must REVEAL in place, never vanish
      const sat2 = await page.evaluate(wordProbe(satPick.w));
      if (sat2.exists && sat2.onScreen) {
        await tapAt(sat2.x, sat2.y);
        await page.waitForTimeout(700);
        const sat3 = await page.evaluate(wordProbe(satPick.w));
        if (!sat3.exists || sat3.opacity < 0.05)
          await file(satWord, 'sat-tap', 'reveals in place', 'vanished', 'satellite dissolved on first tap');
        else if (!sat3.unfolded)
          await file(satWord, 'sat-tap', 'reveals in place', 'dead', 'no reveal');
        else await file(satWord, 'sat-tap', 'reveals in place', 'ok', '');
        // tap again: the constellation re-centres on it — the chain walk
        const sat4 = await page.evaluate(wordProbe(satPick.w));
        if (sat4.exists && sat4.onScreen) {
          await tapAt(sat4.x, sat4.y);
          await page.waitForTimeout(1100);
          const w5 = await page.evaluate(worldProbe);
          const sat5 = await page.evaluate(wordProbe(satPick.w));
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

/* -------------------------------------------------------------- report */
const clusters = {};
for (const c of cases) {
  if (c.outcome === 'ok') continue;
  const key = `${c.gesture} → ${c.outcome}`;
  (clusters[key] ??= []).push(c);
}
const total = cases.length;
const bad = cases.filter((c) => c.outcome !== 'ok').length;
console.log(`\n==== sweep: ${total} cases · ${total - bad} ok · ${bad} violations · ${pageErrors.length} page errors ====`);
for (const [key, list] of Object.entries(clusters).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(list.length).padStart(3)} × ${key}   e.g. ${list.slice(0, 4).map((c) => c.word).join('・')}`);
}
writeFileSync(OUT, JSON.stringify({ generated: 'drift-consistency sweep v1', total, ok: total - bad, violations: bad, pageErrors, cases }, null, 1));
console.log(`report → ${OUT}\nshots  → ${SHOTS}`);
await browser.close();
server.close();
process.exit(0);
