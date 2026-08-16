/**
 * WP6 — the 2x2 tap-ladder matrix, probed rung by rung on the real surface.
 *
 * Two open settings, four combinations, and this file rules on NONE of them.
 * It only asserts that each combination does what its own definition says, and
 * that the two shipped defaults (stage3 · staged) behave exactly as the landed
 * build did. Which pair the operator keeps is not a question this instrument
 * answers or is allowed to answer.
 *
 *   V_LADDER  stage3 : tap = forefront + family + reading · tap2 = English · tap3 = entry
 *             stage4 : tap = forefront + family · tap2 = reading · tap3 = English · tap4 = entry
 *   V_SATTAP  staged   : first satellite tap reveals it where it stands, second recentres
 *             recenter : first satellite tap recentres it, then it climbs V_LADDER
 *
 * Rung state is read from RENDERED style, not from class names: the reading and
 * the English are the computed opacity of the word's own .yomi / .gloss spans,
 * the forefront is `focusN === node` AND the painted .bctr, the family is
 * FOCUS.length, the entry is stack.length. A rung that only flipped a class
 * without painting anything would fail here.
 *
 * Real Chromium, 390x844, touch, CDP touch events. Standalone drift source.
 *
 * Usage: node probe-ladder-matrix.mjs [--out FILE] [--src PATH] [--shots DIR]
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const SRC = resolve(arg('--src', resolve(HERE, '../../../../../prototypes/drift/drift-artifact.html')));
const OUT = arg('--out', `${process.env.TMPDIR || '/tmp'}/wp6-ladder-matrix.json`);
const SHOTS = arg('--shots', '');
const PORT = Number(arg('--port', '8951'));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const body = fs.readFileSync(SRC, 'utf8');
const pageHtml = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head>
<body>${body}</body></html>`;
const server = http
  .createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(pageHtml);
  })
  .listen(PORT);

const results = [];
const R = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${detail}`);
};

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 200)));
p.on('console', (m) => {
  if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console.error: ' + m.text().slice(0, 200));
});
const cdp = await ctx.newCDPSession(p);
const touch = (t, pts) => cdp.send('Input.dispatchTouchEvent', { type: t, touchPoints: pts });
const wait = (ms) => p.waitForTimeout(ms);
const shot = async (n) => {
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png` });
};

async function tapAt(x, y) {
  try {
    await touch('touchEnd', []);
  } catch {
    /* nothing live */
  }
  await touch('touchStart', [{ x, y }]);
  await wait(30);
  await touch('touchEnd', []);
  // the reveal spans transition over .5s — settle past it before measuring
  await wait(760);
}

/* --------------------------------------------------------------- helpers */

// nearest touchable, fully-painted word to a screen point, well clear of the
// chrome bands, optionally required to carry a reading (so the reading rung
// has something to show) and optionally excluding one headword.
const wordNear = (x, y, needReading = true, not = null) =>
  p.evaluate(
    ([x, y, needReading, not]) => {
      let best = null;
      let bd = 1e9;
      for (const el of document.querySelectorAll('.word')) {
        const n = nodeOf.get(el);
        if (!n || n.gone) continue;
        if (needReading && !n.r) continue;
        if (not != null && n.w === not) continue;
        if (el.classList.contains('lod')) continue;
        const cs = getComputedStyle(el);
        if (parseFloat(cs.opacity) < 0.45) continue;
        if (cs.pointerEvents === 'none') continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx < 74 || cx > innerWidth - 34 || cy < 130 || cy > innerHeight - 170) continue;
        const d = Math.hypot(cx - x, cy - y);
        if (d < bd) {
          bd = d;
          best = { cx, cy, w: n.w, r: n.r };
        }
      }
      return best;
    },
    [x, y, needReading, not],
  );

// a live satellite of the standing constellation, furthest from the centre so
// the tap cannot graze the planet
const satNear = () =>
  p.evaluate(() => {
    const c = focusN && !focusN.gone ? focusN : null;
    let best = null;
    let bd = -1;
    for (const el of document.querySelectorAll('.word.bsat')) {
      const n = nodeOf.get(el);
      if (!n || n.gone || n === c) continue;
      if (el.classList.contains('lod')) continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) < 0.45 || cs.pointerEvents === 'none') continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 60 || cx > innerWidth - 26 || cy < 120 || cy > innerHeight - 160) continue;
      const d = c ? Math.hypot(cx - (c.x + c.dragX), cy - (c.y + c.dragY)) : 1e9;
      if (d > bd) {
        bd = d;
        best = { cx, cy, w: n.w, r: n.r };
      }
    }
    return best;
  });

// RENDERED rung state for one headword — nothing here reads a class as proof
// of a reveal; the reading and English are the painted opacity of their spans.
const rung = (w) =>
  p.evaluate((w) => {
    let el = null;
    let n = null;
    for (const e of document.querySelectorAll('.word')) {
      const c = nodeOf.get(e);
      if (c && !c.gone && c.w === w) {
        el = e;
        n = c;
        break;
      }
    }
    const base = {
      stack: stack.length,
      family: typeof FOCUS !== 'undefined' ? FOCUS.length : null,
      centre: focusN && !focusN.gone ? focusN.w : null,
      lockOn,
    };
    if (!el) return { ...base, present: false };
    const r = el.getBoundingClientRect();
    return {
      ...base,
      present: true,
      reading: +(+getComputedStyle(el.querySelector('.yomi')).opacity).toFixed(2),
      english: +(+getComputedStyle(el.querySelector('.gloss')).opacity).toFixed(2),
      forefront: el.classList.contains('bctr') && focusN === n,
      satellite: el.classList.contains('bsat'),
      op: +(+getComputedStyle(el).opacity).toFixed(3),
      pe: getComputedStyle(el).pointerEvents,
      cx: +(r.left + r.width / 2).toFixed(1),
      cy: +(r.top + r.height / 2).toFixed(1),
    };
  }, w);

// live centre of the held planet — the bloom glides the field, so every tap
// after the first must re-aim rather than reuse a stale rect
const focusPoint = () =>
  p.evaluate(() => (focusN && !focusN.gone ? { cx: focusN.x + focusN.dragX, cy: focusN.y + focusN.dragY } : null));

const pointOf = (w) =>
  p.evaluate((w) => {
    for (const e of document.querySelectorAll('.word')) {
      const n = nodeOf.get(e);
      if (n && !n.gone && n.w === w) {
        const r = e.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      }
    }
    return null;
  }, w);

// climb back out of every dive the walk opened, without a reload — the leak
// check has to run on one continuous field or it proves nothing
const surfaceHome = async () => {
  await p.evaluate(() => {
    let guard = 8;
    while (stack.length && guard--) surface();
    if (typeof recenterCam === 'function') recenterCam();
  });
  await wait(1400);
};

const familyIds = () =>
  p.evaluate(() => (typeof FOCUS !== 'undefined' ? FOCUS.map((f) => f.e[0]).sort().join('·') : ''));

/* ------------------------------------------------------------- the matrix */

const matrix = {};

async function openField(ladder, satTap, viaUrl) {
  const q = viaUrl ? `?ladder=${ladder}&sattap=${satTap}` : '';
  await p.goto(`http://127.0.0.1:${PORT}/${q}`, { waitUntil: 'load' });
  await wait(1900);
  if (!viaUrl) await p.evaluate(([l, s]) => window.__DRIFT_TAP__.set({ ladder: l, satTap: s }), [ladder, satTap]);
  const got = await p.evaluate(() => window.__DRIFT_TAP__.get());
  if (got.ladder !== ladder || got.satTap !== satTap)
    throw new Error(`seam did not take: wanted ${ladder}/${satTap}, got ${got.ladder}/${got.satTap}`);
  return got;
}

// The centre-word ladder: tap the same word until it opens its entry, and
// record what is painted after every single tap.
async function walkCentreLadder(tag, ladder) {
  const w0 = await wordNear(195, 430, true);
  if (!w0) throw new Error('no probe word found');
  const steps = [{ tap: 0, ...(await rung(w0.w)) }];
  let aim = { cx: w0.cx, cy: w0.cy };
  const maxTaps = ladder === 'stage4' ? 4 : 3;
  for (let i = 1; i <= maxTaps; i++) {
    await tapAt(aim.cx, aim.cy);
    const s = await rung(w0.w);
    steps.push({ tap: i, ...s });
    if (s.stack > 0) break;
    const fp = (await focusPoint()) || (await pointOf(w0.w));
    if (fp) aim = fp;
  }
  await shot(`${tag}-centre`);
  return { word: w0.w, reading: w0.r, steps };
}

async function walkSatellite(tag, ladder, satTap) {
  // stand a constellation up first: one tap on a fresh word raises the family
  // under either ladder (stage3 also reads it; stage4 does not — both fine)
  const w0 = await wordNear(195, 430, true);
  if (!w0) throw new Error('no probe word for the satellite walk');
  await tapAt(w0.cx, w0.cy);
  const centreBefore = (await rung(w0.w)).centre;
  const famBefore = await familyIds();
  const sat = await satNear();
  if (!sat) throw new Error('no satellite standing after the centre tap');
  const s0 = await rung(sat.w);
  await tapAt(sat.cx, sat.cy);
  const s1 = await rung(sat.w);
  const fam1 = await familyIds();
  let s2 = null;
  let fam2 = null;
  if (satTap === 'staged') {
    const pt = (await pointOf(sat.w)) || sat;
    await tapAt(pt.cx, pt.cy);
    s2 = await rung(sat.w);
    fam2 = await familyIds();
  }
  await shot(`${tag}-sat`);
  return { centre: w0.w, centreBefore, sat: sat.w, satReading: sat.r, famBefore, s0, s1, fam1, s2, fam2 };
}

for (const ladder of ['stage3', 'stage4']) {
  for (const satTap of ['staged', 'recenter']) {
    const tag = `${ladder}+${satTap}`;
    const errsBefore = errs.length;
    await openField(ladder, satTap, true);
    const centre = await walkCentreLadder(tag, ladder);
    await openField(ladder, satTap, true);
    const sat = await walkSatellite(tag, ladder, satTap);
    matrix[tag] = { centre, sat, newErrors: errs.length - errsBefore };

    /* ---- centre-ladder assertions, straight from each setting's definition */
    const S = centre.steps;
    const at = (i) => S.find((s) => s.tap === i) || {};
    if (ladder === 'stage3') {
      R(
        `${tag} · centre rung1 = forefront + family + reading`,
        at(1).forefront === true && at(1).family > 0 && at(1).reading === 1 && at(1).english === 0 && at(1).stack === 0,
        `"${centre.word}" forefront=${at(1).forefront} family=${at(1).family} reading=${at(1).reading} english=${at(1).english} stack=${at(1).stack}`,
      );
      R(
        `${tag} · centre rung2 = English`,
        at(2).english === 1 && at(2).reading === 1 && at(2).stack === 0,
        `reading=${at(2).reading} english=${at(2).english} stack=${at(2).stack}`,
      );
      R(
        `${tag} · centre rung3 = entry (and no rung before it dived)`,
        at(3).stack === 1 && at(1).stack === 0 && at(2).stack === 0,
        `stack after taps 1/2/3 = ${at(1).stack}/${at(2).stack}/${at(3).stack}`,
      );
    } else {
      R(
        `${tag} · centre rung1 = forefront + family, nothing read`,
        at(1).forefront === true && at(1).family > 0 && at(1).reading === 0 && at(1).english === 0 && at(1).stack === 0,
        `"${centre.word}" forefront=${at(1).forefront} family=${at(1).family} reading=${at(1).reading} english=${at(1).english} stack=${at(1).stack}`,
      );
      R(
        `${tag} · centre rung2 = reading, still no English`,
        at(2).reading === 1 && at(2).english === 0 && at(2).stack === 0,
        `reading=${at(2).reading} english=${at(2).english} stack=${at(2).stack}`,
      );
      R(
        `${tag} · centre rung3 = English`,
        at(3).english === 1 && at(3).reading === 1 && at(3).stack === 0,
        `reading=${at(3).reading} english=${at(3).english} stack=${at(3).stack}`,
      );
      R(
        `${tag} · centre rung4 = entry (and no rung before it dived)`,
        at(4).stack === 1 && at(1).stack === 0 && at(2).stack === 0 && at(3).stack === 0,
        `stack after taps 1/2/3/4 = ${at(1).stack}/${at(2).stack}/${at(3).stack}/${at(4).stack}`,
      );
      R(
        `${tag} · the extra rung does not rebuild the family under the finger`,
        at(1).family === at(2).family && at(1).centre === at(2).centre,
        `family ${at(1).family}→${at(2).family}, centre "${at(1).centre}"→"${at(2).centre}"`,
      );
    }
    R(
      `${tag} · the walked word never disappears`,
      S.every((s) => s.present === true),
      `present at every rung: ${S.map((s) => s.present).join(',')}`,
    );
    // the extra rung changes reveal PACING, so the arbiter sees the word in a
    // state it did not see before — it must still never be pushed out of reach
    // or under the field's own presence floor while the finger is on it
    R(
      `${tag} · the word under the finger stays reachable and present at every rung`,
      S.filter((s) => s.tap > 0).every((s) => s.pe !== 'none' && s.op >= 0.32),
      S.filter((s) => s.tap > 0)
        .map((s) => `tap${s.tap} op=${s.op} pe=${s.pe}`)
        .join(' · '),
    );

    /* ------------------------------------------- satellite-tap assertions */
    if (satTap === 'staged') {
      R(
        `${tag} · satellite tap1 reveals it in place, the planet keeps its seat`,
        sat.s1.present === true &&
          sat.s1.reading === 1 &&
          sat.s1.english === 1 &&
          sat.s1.centre === sat.centreBefore &&
          sat.fam1 === sat.famBefore,
        `"${sat.sat}" reading=${sat.s1.reading} english=${sat.s1.english} centre "${sat.centreBefore}"→"${sat.s1.centre}" family unchanged=${sat.fam1 === sat.famBefore}`,
      );
      R(
        `${tag} · satellite tap2 makes it the centre with its own family`,
        sat.s2.centre === sat.sat && sat.s2.forefront === true && sat.s2.family > 0 && sat.fam2 !== sat.famBefore,
        `centre "${sat.s1.centre}"→"${sat.s2.centre}" forefront=${sat.s2.forefront} family=${sat.s2.family} (new set=${sat.fam2 !== sat.famBefore})`,
      );
    } else {
      const wantReading = ladder === 'stage3' ? 1 : 0;
      R(
        `${tag} · satellite tap1 recentres it at once with its own family`,
        sat.s1.centre === sat.sat && sat.s1.forefront === true && sat.s1.family > 0 && sat.fam1 !== sat.famBefore,
        `centre "${sat.centreBefore}"→"${sat.s1.centre}" forefront=${sat.s1.forefront} family=${sat.s1.family} (new set=${sat.fam1 !== sat.famBefore})`,
      );
      R(
        `${tag} · the recentred satellite lands on rung 1 of ${ladder}`,
        sat.s1.reading === wantReading && sat.s1.english === (ladder === 'stage3' && !sat.satReading ? 1 : 0),
        `reading=${sat.s1.reading} (want ${wantReading}) english=${sat.s1.english}, satellite carries a reading=${!!sat.satReading}`,
      );
    }
    R(
      `${tag} · the tapped satellite never disappears`,
      sat.s1.present === true && (sat.s2 == null || sat.s2.present === true),
      `present after tap1=${sat.s1.present}${sat.s2 ? `, after tap2=${sat.s2.present}` : ''}`,
    );
    R(
      `${tag} · the tapped satellite stays reachable and present`,
      sat.s1.pe !== 'none' && sat.s1.op >= 0.32 && (sat.s2 == null || (sat.s2.pe !== 'none' && sat.s2.op >= 0.32)),
      `tap1 op=${sat.s1.op} pe=${sat.s1.pe}${sat.s2 ? ` · tap2 op=${sat.s2.op} pe=${sat.s2.pe}` : ''}`,
    );
    R(`${tag} · no page or console errors`, errs.length - errsBefore === 0, `${errs.length - errsBefore} new`);
  }
}

/* ------------------------------------------- the defaults do not get dirty */
// Switch a live field all the way out to the far corner of the matrix and back
// to the shipped pair, then walk the ladder again: nothing from the non-default
// combination may survive the trip home.
{
  const errsBefore = errs.length;
  await openField('stage4', 'recenter', false);
  const away = await walkCentreLadder('leak-away', 'stage4');
  await surfaceHome();
  await p.evaluate(() => window.__DRIFT_TAP__.set({ ladder: 'stage3', satTap: 'staged' }));
  const back = await p.evaluate(() => window.__DRIFT_TAP__.get());
  const centre = await walkCentreLadder('leak-home', 'stage3');
  const at = (i) => centre.steps.find((s) => s.tap === i) || {};
  matrix['leak-check'] = { away, back, centre };
  R(
    'leak · after stage4+recenter and back, the ladder is three rungs again',
    back.ladder === 'stage3' &&
      back.satTap === 'staged' &&
      at(1).reading === 1 &&
      at(1).forefront === true &&
      at(1).family > 0 &&
      at(2).english === 1 &&
      at(3).stack === 1,
    `seam=${back.ladder}/${back.satTap} · rung1 reading=${at(1).reading} forefront=${at(1).forefront} family=${at(1).family} · rung2 english=${at(2).english} · rung3 stack=${at(3).stack}`,
  );
  R('leak · no errors on the round trip', errs.length - errsBefore === 0, `${errs.length - errsBefore} new`);
}

/* ------------------------- an untouched field is the field as it shipped */
{
  const errsBefore = errs.length;
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await wait(1900);
  const got = await p.evaluate(() => window.__DRIFT_TAP__.get());
  const centre = await walkCentreLadder('default', 'stage3');
  const at = (i) => centre.steps.find((s) => s.tap === i) || {};
  const sat = await (async () => {
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
    await wait(1900);
    return walkSatellite('default', 'stage3', 'staged');
  })();
  matrix['untouched-default'] = { got, centre, sat };
  R(
    'default · an unset field is stage3 + staged',
    got.ladder === 'stage3' && got.satTap === 'staged',
    `${got.ladder} / ${got.satTap}`,
  );
  R(
    'default · unset centre ladder is 3 rungs, reading on the first',
    at(1).reading === 1 && at(1).english === 0 && at(1).forefront === true && at(2).english === 1 && at(3).stack === 1,
    `rung1 reading=${at(1).reading}/english=${at(1).english}/forefront=${at(1).forefront} · rung2 english=${at(2).english} · rung3 stack=${at(3).stack}`,
  );
  R(
    'default · unset satellite tap reveals in place, second tap recentres',
    sat.s1.reading === 1 && sat.s1.english === 1 && sat.s1.centre === sat.centreBefore && sat.s2.centre === sat.sat,
    `tap1 reading/english=${sat.s1.reading}/${sat.s1.english} centre held="${sat.s1.centre}" · tap2 centre="${sat.s2.centre}"`,
  );
  R('default · no errors', errs.length - errsBefore === 0, `${errs.length - errsBefore} new`);
}

R('zero console/page errors across the whole matrix', errs.length === 0, errs.length ? errs.join(' | ') : 'none');

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
fs.writeFileSync(OUT, JSON.stringify({ src: SRC, at: new Date().toISOString(), results, matrix, errs }, null, 2));
console.log(`results -> ${OUT}`);
await b.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
