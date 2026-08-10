/**
 * WP3 acceptance — the Drift word card's study door opens the corridor's own
 * full entry. Real Chromium, 390x844 touch, on the locally built standalone.
 *
 * Usage: node acceptance.mjs --app <standalone.html> --drift <drift-artifact.html>
 *        [--out results.json] [--shots DIR] [--seed N] [--drop 語]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : d;
};
const APP = resolve(arg('--app'));
const DRIFT = resolve(arg('--drift'));
const OUT = arg('--out') ? resolve(arg('--out')) : null;
const SHOTS = arg('--shots') ? resolve(arg('--shots')) : null;
const SEEDS = String(arg('--seeds', '1729,2718,3141,4201,911,7,13,86,99,404,512,808'))
  .split(',')
  .map(Number);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// The corridor's own semantic layer, read from the repo — the chain walk lives
// on these heads, so the harness must land the first entry on one of them.
const HERE = dirname(fileURLToPath(import.meta.url));
const SEM_HEADS = new Set(
  Object.keys(
    JSON.parse(
      readFileSync(
        resolve(HERE, '..', '..', '..', '..', 'prototypes/corridor/data/proprietary_safe/sem.json'),
        'utf8',
      ),
    ).edges,
  ),
);

let SEED = null;
const results = [];
const errors = [];
const notes = [];
const ok = (id, pass, detail, extra = {}) => {
  results.push({ id, pass: !!pass, detail, ...extra });
  console.log(`${pass ? ' PASS ' : ' FAIL '}${id.padEnd(30)} ${detail}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
// deterministic field: same seed, same words, same scatter
await ctx.addInitScript(`(() => {
  try { localStorage.clear(); } catch (e) {}
  const u = new URL(location.href);
  const raw = u.searchParams.get('__seed');
  if (raw != null) {
    let s = (Number(raw) >>> 0) || 0x9e3779b9;
    Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
  }
  const drop = u.searchParams.get('__drop');
  if (drop) {
    // Fault injection at the DATA layer, not the code layer: the corridor
    // genuinely does not carry this word. lookup(), has() and studyHtml() all
    // run exactly as shipped.
    const orig = JSON.parse;
    JSON.parse = function (t, r) {
      const v = orig.call(this, t, r);
      if (v && v['share_alike/dict'] && v['share_alike/words']) {
        delete v['share_alike/dict'].words[drop];
        delete v['share_alike/words'].words[drop];
        JSON.parse = orig;
      }
      return v;
    };
  }
})()`);

const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: pts.map(([x, y]) => ({ x, y, radiusX: 5, radiusY: 5, force: 1 })),
  });
const tapAt = async (x, y) => {
  await touch('touchStart', [[x, y]]);
  await page.waitForTimeout(70);
  await touch('touchEnd', []);
  await page.waitForTimeout(240);
};
const shot = async (name) => {
  if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `${name}.png`) });
};

/* ------------------------------------------------------------- helpers */
const wordBox = (label) =>
  page.evaluate(
    (l) => {
      for (const el of document.querySelectorAll('.word')) {
        if ((el.querySelector('.base')?.textContent || '') !== l) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2) continue;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
      }
      return null;
    },
    label,
  );

/** the constellation, as DOM identity — stamps survive only if the very same
 * elements survive; a rebuilt field loses them. */
const stampField = () =>
  page.evaluate(() => {
    let i = 0;
    for (const el of document.querySelectorAll('#drift-layer .word, #drift-layer .glyph'))
      el.dataset.wp3 = String(i++);
    return i;
  });
const readField = () =>
  page.evaluate(() => {
    const centreEl = document.querySelector('#drift-layer .word.center, #drift-layer .glyph.center');
    const members = [...document.querySelectorAll('#drift-layer .word, #drift-layer .glyph')].map(
      (el) => {
        const r = el.getBoundingClientRect();
        return {
          stamp: el.dataset.wp3 ?? null,
          label: (el.querySelector('.base') || el.querySelector('.g'))?.textContent || '',
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          centre: el.classList.contains('center'),
        };
      },
    );
    return {
      centre: (centreEl?.querySelector('.base') || centreEl?.querySelector('.g'))?.textContent || null,
      centreStamp: centreEl?.dataset.wp3 ?? null,
      depthCrumb: (document.getElementById('depth')?.textContent || '').trim(),
      layerActive: !!document.getElementById('drift-layer')?.classList.contains('active'),
      members,
    };
  });

const cardState = () =>
  page.evaluate(() => {
    const c = document.getElementById('card');
    if (!c) return { present: false };
    return {
      present: true,
      open: c.classList.contains('open'),
      head: c.querySelector('h1')?.textContent || '',
      hasStudyButton: !!c.querySelector('button.study[data-study-key]'),
      studyKind: c.querySelector('button.study')?.dataset.studyKind || null,
      studyKey: c.querySelector('button.study')?.dataset.studyKey || null,
      studyLabel: c.querySelector('.study')?.textContent || null,
      hasStudyAnchor: !!c.querySelector('a.study'),
      noteText: c.querySelector('.note')?.textContent || null,
    };
  });

const sheetState = () =>
  page.evaluate(() => {
    const s = document.getElementById('sheet');
    if (!s) return { open: false };
    return {
      open: true,
      node: s.dataset.node,
      headword: s.querySelector('.headword')?.textContent || '',
      reading: s.querySelector('.reading')?.textContent || '',
      senseCount: s.querySelectorAll('.senses .sense-list li').length || (s.querySelector('.senses .gloss') ? 1 : 0),
      senseText: s.querySelector('.senses')?.textContent?.slice(0, 90) || '',
      kanjiDoors: [...s.querySelectorAll('[data-kanjirow]')].map((b) => b.dataset.kanjirow),
      semRows: [...s.querySelectorAll('.sem-row')].map((b) => b.dataset.sem),
      depthCrumb: s.querySelector('.sheet-depth')?.textContent || '',
      stackDepth: Number(document.body.dataset.wp3stack || 0),
      crumb: document.querySelector('.crumb')?.textContent || '',
    };
  });

/** walk the drift tap ladder until the card opens (resilient to ladder
 * variants — WP6 is reshaping the ladder in the same file) */
const openCardFor = async (label, maxTaps = 7) => {
  const taps = [];
  for (let i = 0; i < maxTaps; i++) {
    const b = await wordBox(label);
    if (!b) return { opened: false, taps, reason: 'word not found' };
    await tapAt(b.x, b.y);
    await page.waitForTimeout(420);
    const c = await cardState();
    taps.push({ i: i + 1, at: [Math.round(b.x), Math.round(b.y)], cardOpen: c.open, head: c.head });
    if (c.open && c.head === label) return { opened: true, taps };
  }
  return { opened: false, taps, reason: 'card never opened' };
};

const boot = async (url) => {
  await page.goto(url);
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 45000 });
  await page.waitForTimeout(2400);
};

const fileUrl = (p, q = '') => `file://${p}${q}`;

try {
  /* ============================================ 1-3 · the seam, end to end */
  /* The field is a WORLD, wider than the 390x844 window: a word can be real,
   * rendered and simply off-camera. Panning open water is the drift's own way
   * of reaching it, so the harness uses that rather than teleporting. */
  const openWater = () =>
    page.evaluate(() => {
      for (let y = 680; y >= 160; y -= 24)
        for (let x = 60; x <= 330; x += 30) {
          const h = document.elementFromPoint(x, y);
          if (!h) continue;
          if (
            h.closest(
              '.word,.glyph,#card,#lvl,#brand,#depth,#theme,#hint,#drift-tray,.chrome,.variants,#radoc,.sheet,.scrim',
            )
          )
            continue;
          return { x, y };
        }
      return null;
    });
  const slowDrag = async (x0, y0, dx, dy) => {
    const steps = 18;
    await touch('touchStart', [[x0, y0]]);
    for (let i = 1; i <= steps; i++) {
      await page.waitForTimeout(28);
      await touch('touchMove', [[x0 + (dx * i) / steps, y0 + (dy * i) / steps]]);
    }
    // hold still so the fling velocity decays to nothing before the lift
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(70);
      await touch('touchMove', [[x0 + dx, y0 + dy]]);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(900);
  };
  const locate = (label) =>
    page.evaluate((l) => {
      for (const el of document.querySelectorAll('#drift-layer .word')) {
        if ((el.querySelector('.base')?.textContent || '') !== l) continue;
        const q = el.getBoundingClientRect();
        const x = q.left + q.width / 2;
        const y = q.top + q.height / 2;
        const hit = document.elementFromPoint(x, y);
        return { x, y, inside: !!hit && (hit === el || el.contains(hit)) };
      }
      return null;
    }, label);
  const bringIntoView = async (label, tries = 8) => {
    const steps = [];
    for (let i = 0; i < tries; i++) {
      const w = await locate(label);
      steps.push(w ? { x: Math.round(w.x), y: Math.round(w.y), inside: w.inside } : null);
      if (!w) return { ok: false, steps, reason: 'word left the field' };
      if (w.inside && w.y > 140 && w.y < 620 && w.x > 40 && w.x < 350) return { ok: true, steps };
      const ow = await openWater();
      if (!ow) return { ok: false, steps, reason: 'no open water to pan from' };
      let dx = 195 - w.x;
      let dy = 420 - w.y;
      const m = Math.hypot(dx, dy);
      const cap = 170;
      if (m > cap) {
        dx = (dx * cap) / m;
        dy = (dy * cap) / m;
      }
      const sx = Math.min(Math.max(ow.x, 20), 370);
      const sy = Math.min(Math.max(ow.y, 180), 700);
      const ex = Math.min(Math.max(sx + dx, 15), 375);
      const ey = Math.min(Math.max(sy + dy, 120), 720);
      await slowDrag(sx, sy, ex - sx, ey - sy);
    }
    return { ok: false, steps, reason: 'could not pan it into reach' };
  };

  // a word counts as reachable only if the point we would tap actually
  // hit-tests to it — the same rule the consistency sweep uses
  const fieldWords = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#drift-layer .word')]
        .map((el) => {
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          const hit = document.elementFromPoint(x, y);
          return {
            label: el.querySelector('.base')?.textContent || '',
            y,
            w: r.width,
            reachable: !!hit && (hit === el || el.contains(hit)),
          };
        })
        .filter((o) => o.label && o.w > 2),
    );

  // the level tide, driven through the visible control (STOPS: 0=自 … 5=N5)
  const setTide = async (ix) => {
    const r = await page.evaluate(() => {
      const b = document.querySelector('#drift-layer #lvl').getBoundingClientRect();
      return { x: b.left + b.width / 2, top: b.top, h: b.height };
    });
    const y = r.top + r.h * Math.min(0.985, ix / 5);
    await touch('touchStart', [[r.x, y]]);
    await page.waitForTimeout(250);
    await touch('touchEnd', []);
    await page.waitForTimeout(3500);
    return page.evaluate(() => document.getElementById('lvlInfo')?.textContent || '');
  };

  // Find a deterministic field that carries a word the corridor can open AND
  // has a semantic neighbourhood for. The corridor's 意味の近く layer is only 82
  // heads deep against a 22,934-word dictionary, so the harness sweeps the
  // level tide and seeds rather than pretending the first field will do.
  let target = null;
  let TIDE = null;
  let tideLabel = '';
  const search = [];
  outer: for (const tide of [5, 4, 3]) {
    for (const seed of SEEDS) {
      await boot(fileUrl(APP, `?__seed=${seed}`));
      const label = await setTide(tide);
      const words = await fieldWords();
      const reachable = words.filter((o) => o.reachable).map((o) => o.label);
      const all = words.map((o) => o.label);
      const openable = await page.evaluate(
        (list) => list.filter((w) => window.__BUNKI_OPEN_ENTRY?.has('word', w)),
        all,
      );
      const heads = openable.filter((w) => SEM_HEADS.has(w));
      search.push({
        tide,
        seed,
        stop: label,
        fieldWords: words.length,
        reachable: reachable.length,
        openable: openable.length,
        semHeads: heads,
      });
      if (heads.length) {
        SEED = seed;
        TIDE = tide;
        tideLabel = label;
        target = heads[0];
        break outer;
      }
    }
  }
  notes.push({ seedSearch: search, chosenSeed: SEED, chosenTide: TIDE, tideLabel, target });
  if (!target) throw new Error('no field in the seed sweep carried a corridor sem head');
  const view = await page.evaluate(() => document.body.dataset.view);
  ok('0-boot', view === 'drift', `standalone booted at seed ${SEED}, tide ${tideLabel}, body[data-view]=${view}`);
  const pan = await bringIntoView(target);
  ok(
    '0b-reach-word',
    pan.ok,
    `word 「${target}」 panned into reach with ${pan.steps.length - 1} open-water drag(s): ${pan.steps.map((s2) => (s2 ? `(${s2.x},${s2.y})${s2.inside ? '*' : ''}` : 'gone')).join(' -> ')}`,
  );

  const before0 = await readField();
  const stamped = await stampField();
  const opened = await openCardFor(target);
  ok(
    '1a-card-opens',
    opened.opened,
    `field word 「${target}」 · ${opened.taps.length} taps on the drift ladder → card open${opened.reason ? ' — ' + opened.reason : ''}`,
    { taps: opened.taps },
  );
  const card = await cardState();
  await shot('1-card');
  ok(
    '1b-study-door',
    card.open && card.hasStudyButton && card.studyKey === target && !card.noteText,
    `card 「${card.head}」 carries a study door (button, key=${card.studyKey}, label=${JSON.stringify(card.studyLabel)}), placeholder note=${card.noteText === null ? 'absent' : JSON.stringify(card.noteText)}`,
    { card },
  );

  // the constellation as it stands with the card open. The dive's orbiters are
  // still easing into their orbits right after the card opens, so the snapshot
  // waits for the field to settle — otherwise the "positional shift" measured
  // across the sheet would be mostly the field's own ordinary motion.
  await page.waitForTimeout(2600);
  const beforeSheet = await readField();
  const sheetOpenedAt = Date.now();

  // tap the study door
  const doorBox = await page.evaluate(() => {
    const b = document.querySelector('#drift-layer #card button.study');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    // every point of the door must hit-test to the door itself — the corridor's
    // own 本棚 door is fixed over the card's bottom-right corner, so this is
    // where two doors could end up under one finger
    const owned = [];
    for (const fx of [0.06, 0.25, 0.5, 0.75, 0.94])
      for (const fy of [0.2, 0.5, 0.8]) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        const hit = document.elementFromPoint(x, y);
        owned.push(!!hit && (hit === b || b.contains(hit)));
      }
    // the scoped rule must actually have survived the extractor's CSS scoper
    const cs = getComputedStyle(b);
    const layer = getComputedStyle(document.getElementById('drift-layer'));
    const toRgb = (v) => {
      const p2 = document.createElement('span');
      p2.style.color = v.trim();
      document.body.append(p2);
      const out = getComputedStyle(p2).color;
      p2.remove();
      return out;
    };
    const styled = {
      color: cs.color,
      inkVar: toRgb(layer.getPropertyValue('--ink')),
      accentVar: toRgb(layer.getPropertyValue('--accent')),
      borderColor: cs.borderTopColor,
      pig2Var: toRgb(layer.getPropertyValue('--pig2')),
      radius: cs.borderTopLeftRadius,
    };
    const shelf = document.querySelector('.drift-door')?.getBoundingClientRect() || null;
    const overlapsShelf =
      !!shelf && !(r.right <= shelf.left || r.left >= shelf.right || r.bottom <= shelf.top || r.top >= shelf.bottom);
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      w: r.width,
      h: r.height,
      styled,
      ownedAll: owned.every(Boolean),
      ownedCount: owned.filter(Boolean).length,
      probes: owned.length,
      overlapsShelf,
    };
  });
  ok(
    '1c-door-target',
    !!doorBox &&
      doorBox.h >= 44 &&
      doorBox.ownedAll &&
      !doorBox.overlapsShelf &&
      doorBox.styled.color === doorBox.styled.inkVar &&
      doorBox.styled.color !== doorBox.styled.accentVar &&
      doorBox.styled.borderColor === doorBox.styled.pig2Var,
    doorBox
      ? `door hit target ${doorBox.w.toFixed(0)}x${doorBox.h.toFixed(0)}px; ${doorBox.ownedCount}/${doorBox.probes} probe points hit-test to the door itself; ` +
        `overlaps the corridor's own 本棚 door = ${doorBox.overlapsShelf}; ` +
        `label ${doorBox.styled.color} = --ink ${doorBox.styled.inkVar} (not 朱 --accent ${doorBox.styled.accentVar}), rim ${doorBox.styled.borderColor} = --pig2 ${doorBox.styled.pig2Var} — the scoped rule survived the extractor`
      : 'no door',
  );
  await tapAt(doorBox.x, doorBox.y);
  await page.waitForTimeout(500);
  await shot('2-entry-sheet');
  const s1 = await sheetState();
  ok(
    '1d-entry-opens',
    s1.open && s1.node === `word:${target}`,
    `corridor full entry opened: sheet[data-node]=${s1.node}, headword=${s1.headword}, reading=${s1.reading}`,
  );
  ok(
    '1e-entry-complete',
    s1.open && s1.senseCount >= 1 && s1.kanjiDoors.length >= 1 && s1.semRows.length >= 1,
    `senses=${s1.senseCount} · kanji doors=[${s1.kanjiDoors.join('')}] · chain-walk sem rows=${s1.semRows.length} (${s1.semRows.slice(0, 4).join(' ')})`,
    { entry: s1 },
  );
  const driftAsleep = await page.evaluate(() => {
    const l = document.getElementById('drift-layer');
    return { active: l.classList.contains('active'), display: getComputedStyle(l).display };
  });
  ok(
    '1f-drift-sleeps-under-sheet',
    !driftAsleep.active && driftAsleep.display === 'none',
    `drift layer under the sheet: active=${driftAsleep.active} display=${driftAsleep.display} (its window pointer listeners cannot read sheet taps as open water)`,
  );

  /* -------------------------------------------- 2 · the chain walk, depth>=2 */
  const hop1 = s1.semRows[0];
  await page.click(`#sheet .sem-row[data-sem="${hop1}"]`);
  await page.waitForTimeout(320);
  const s2 = await sheetState();
  await shot('3-chain-depth2');
  ok(
    '2a-chain-depth2',
    s2.open && s2.node === `word:${hop1}` && s2.depthCrumb.includes(target) && s2.depthCrumb.includes(hop1),
    `word → related word: ${target} › ${hop1} — sheet[data-node]=${s2.node}, sheet depth crumb="${s2.depthCrumb}"`,
  );
  let s3 = null;
  if (s2.semRows.length) {
    const hop2 = s2.semRows[0];
    await page.click(`#sheet .sem-row[data-sem="${hop2}"]`);
    await page.waitForTimeout(320);
    s3 = await sheetState();
    ok(
      '2b-chain-depth3',
      s3.open && s3.node === `word:${hop2}`,
      `depth 3 by a second sem row: ${target} › ${hop1} › ${hop2} — crumb="${s3.depthCrumb}"`,
    );
  } else if (s2.kanjiDoors.length) {
    const hop2 = s2.kanjiDoors[0];
    await page.click(`#sheet [data-kanjirow="${hop2}"]`);
    await page.waitForTimeout(320);
    s3 = await sheetState();
    ok(
      '2b-chain-depth3',
      s3.open && s3.node === `kanji:${hop2}`,
      `depth 3 by a 漢字 door (「${hop1}」 carries no authored 意味の近く notes — only 82 of the corridor's 22,934 words do — so the chain continues through its kanji): ` +
        `${target} › ${hop1} › ${hop2} — crumb="${s3.depthCrumb}"`,
    );
  } else {
    ok('2b-chain-depth3', false, `no third hop available from ${hop1}`);
  }
  // unwind
  const unwound = [];
  for (let i = 0; i < (s3 ? 2 : 1); i++) {
    await page.click('#sheet-back');
    await page.waitForTimeout(300);
    unwound.push((await sheetState()).node);
  }
  ok(
    '2c-back-chain',
    unwound[unwound.length - 1] === `word:${target}`,
    `back-chain unwinds: ${unwound.join(' → ')} (expected to land on word:${target})`,
  );

  /* ----------------------------- 3 · closing returns to the field, intact */
  await page.click('#sheet-close');
  const sheetMs = Date.now() - sheetOpenedAt;
  await page.waitForTimeout(2600);
  await shot('4-back-in-field');
  const after = await readField();
  const sheetGone = await page.evaluate(() => !document.getElementById('sheet'));
  const beforeM = beforeSheet.members;
  const afterM = after.members;
  const beforeIds = beforeM.map((m) => `${m.stamp}:${m.label}`);
  const afterIds = afterM.map((m) => `${m.stamp}:${m.label}`);
  const same =
    beforeIds.length === afterIds.length && beforeIds.every((v, i) => v === afterIds[i]);
  const lost = beforeIds.filter((v) => !afterIds.includes(v));
  const gained = afterIds.filter((v) => !beforeIds.includes(v));
  let maxShift = 0;
  for (const b of beforeM) {
    const a = afterM.find((m) => m.stamp === b.stamp);
    if (a) maxShift = Math.max(maxShift, Math.hypot(a.x - b.x, a.y - b.y));
  }
  ok(
    '3a-back-in-field',
    sheetGone && after.layerActive,
    `sheet dismissed, drift layer active again (view=${await page.evaluate(() => document.body.dataset.view)})`,
  );
  ok(
    '3b-constellation-intact',
    same && after.centre === beforeSheet.centre && after.centreStamp === beforeSheet.centreStamp,
    `centre ${beforeSheet.centre}(#${beforeSheet.centreStamp}) → ${after.centre}(#${after.centreStamp}); ` +
      `${beforeIds.length} stamped bodies before, ${afterIds.length} after; lost=${lost.length} gained=${gained.length}; ` +
      `max positional shift ${maxShift.toFixed(1)}px; depth crumb "${beforeSheet.depthCrumb}" → "${after.depthCrumb}"`,
    { before: beforeSheet, after, lost, gained, maxShift, stamped, before0: before0.members.length },
  );
  // the control: the same field, the same wall-clock, no sheet at all. Without
  // it a positional delta is unreadable — the drift is a living field and its
  // orbiters move whether or not anything covered them.
  const ctlBefore = await readField();
  await page.waitForTimeout(sheetMs + 2600);
  const ctlAfter = await readField();
  let ctlShift = 0;
  for (const b of ctlBefore.members) {
    const a = ctlAfter.members.find((m) => m.stamp === b.stamp);
    if (a) ctlShift = Math.max(ctlShift, Math.hypot(a.x - b.x, a.y - b.y));
  }
  ok(
    '3b-control',
    ctlAfter.members.length === ctlBefore.members.length && ctlAfter.centre === ctlBefore.centre,
    `control — the same field left alone for the same ${((sheetMs + 2600) / 1000).toFixed(1)}s with no sheet: ` +
      `max positional shift ${ctlShift.toFixed(1)}px, centre ${ctlAfter.centre}, ${ctlAfter.members.length} bodies. ` +
      `The sheet's ${maxShift.toFixed(1)}px is ${maxShift <= ctlShift * 1.35 + 8 ? 'within' : 'ABOVE'} the field's own motion over the same time.`,
    { controlShift: ctlShift, sheetShift: maxShift, sheetMs },
  );

  /* ------------------- the same seam on a 漢字 card (studyHtml is shared) */
  // the dive that opened the word card put this word's kanji in orbit; diving
  // one of them gives the kanji card, whose study door runs the same host hook
  const findGlyph = () =>
    page.evaluate(() => {
      for (const el of document.querySelectorAll('#drift-layer .glyph')) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(hit === el || el.contains(hit))) continue;
        if (y < 130 || y > 640) continue;
        return { ch: el.querySelector('.g')?.textContent || '', x, y };
      }
      return null;
    });
  let glyph = await findGlyph();
  for (let i = 0; i < 4 && !glyph; i++) {
    // the orbit has carried them out of reach — pan the way a finger would
    const ow = await openWater();
    if (!ow) break;
    await slowDrag(
      Math.min(Math.max(ow.x, 20), 370),
      Math.min(Math.max(ow.y, 200), 680),
      i % 2 ? -120 : 120,
      i % 2 ? 90 : -90,
    );
    glyph = await findGlyph();
  }
  if (glyph) {
    await tapAt(glyph.x, glyph.y); // dive into the kanji
    await page.waitForTimeout(900);
    const c = await page.evaluate(() => {
      const el = document.querySelector('#drift-layer .glyph.center');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (c) {
      await tapAt(c.x, c.y); // open its card
      await page.waitForTimeout(700);
      const kc = await cardState();
      await shot('7-kanji-card');
      if (kc.hasStudyButton) {
        // a 漢字 card is long (stroke cell + the radical family), and the fused
        // layer clips it — the door has to be scrolled to before it can be tapped
        const kb = await page.evaluate(() => {
          const card = document.getElementById('card');
          const b = card.querySelector('button.study');
          b.scrollIntoView({ block: 'end' });
          const r = b.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          const hit = document.elementFromPoint(x, y);
          return { x, y, onTarget: !!hit && (hit === b || b.contains(hit)) };
        });
        await page.waitForTimeout(200);
        await tapAt(kb.x, kb.y);
        await page.waitForTimeout(700);
        const ks = await sheetState();
        await shot('8-kanji-entry');
        ok(
          '6-kanji-door',
          ks.open && ks.node === `kanji:${kc.studyKey}`,
          `the same seam on a 漢字 card: 「${kc.head}」 door hit-tests on target=${kb.onTarget} → sheet[data-node]=${ks.node} (studyHtml is shared, so the kanji door is the word door)`,
        );
        if (ks.open) {
          await page.click('#sheet-close');
          await page.waitForTimeout(500);
        }
      } else {
        ok(
          '6-kanji-door',
          !!kc.noteText,
          `漢字 card 「${kc.head}」 — the corridor does not carry this character, so no door: note=${JSON.stringify(kc.noteText)}`,
        );
      }
    } else {
      ok('6-kanji-door', false, 'the kanji dive produced no centre glyph');
    }
  } else {
    ok('6-kanji-door', false, 'no reachable glyph in the field to dive');
  }

  const errsAfterMain = errors.length;
  ok('3c-zero-errors-so-far', errsAfterMain === 0, `console/page errors through acceptance 1-3: ${errsAfterMain}`);

  /* ------------------------------------ 4 · a word the corridor does NOT have */
  const drop = target;
  await boot(fileUrl(APP, `?__seed=${SEED}&__drop=${encodeURIComponent(drop)}`));
  await setTide(TIDE);
  await bringIntoView(drop);
  const stillAbsent = await page.evaluate(
    (w) => ({
      has: window.__BUNKI_OPEN_ENTRY.has('word', w),
    }),
    drop,
  );
  const opened4 = await openCardFor(drop);
  const card4 = await cardState();
  await shot('5-absent-word-card');
  ok(
    '4-no-dead-door',
    opened4.opened &&
      !stillAbsent.has &&
      card4.open &&
      !card4.hasStudyButton &&
      !card4.hasStudyAnchor &&
      !!card4.noteText,
    `「${drop}」 removed from the corridor's dictionary (dict + words) before boot → has()=${stillAbsent.has}; ` +
      `card renders (head=${card4.head}), study door absent, card shows the honest note: ${JSON.stringify(card4.noteText)}`,
    { card: card4 },
  );

  /* ------------------------------ 5 · the standalone drift, opened directly */
  const preErrors = errors.length;
  await page.goto(fileUrl(DRIFT, `?__seed=${SEED}`));
  await page.waitForTimeout(3000);
  const hook = await page.evaluate(() => ({
    openEntry: typeof window.__BUNKI_OPEN_ENTRY,
    appBase: typeof window.__BUNKI_APP_BASE,
    drift: typeof window.__DRIFT__,
  }));
  const cands5 = await page.evaluate(() =>
    [...document.querySelectorAll('.word')]
      .map((el) => ({ label: el.querySelector('.base')?.textContent || '', r: el.getBoundingClientRect() }))
      .filter((o) => o.label && o.r.width > 2 && o.r.top > 60 && o.r.bottom < 720)
      .map((o) => o.label),
  );
  const t5 = cands5[0];
  const opened5 = await openCardFor(t5);
  const card5 = await page.evaluate(() => {
    const c = document.getElementById('card');
    return {
      open: c.classList.contains('open'),
      head: c.querySelector('h1')?.textContent || '',
      note: c.querySelector('.note')?.textContent || null,
      study: !!c.querySelector('.study'),
    };
  });
  await shot('6-standalone-drift');
  ok(
    '5-standalone-placeholder',
    opened5.opened &&
      card5.open &&
      !card5.study &&
      card5.note === '実物では、ここから完全な辞書へ — in the real app this opens the full entry.' &&
      hook.openEntry === 'undefined' &&
      hook.appBase === 'undefined',
    `file:// drift, no host hooks (__BUNKI_OPEN_ENTRY=${hook.openEntry}, __BUNKI_APP_BASE=${hook.appBase}); ` +
      `card 「${card5.head}」 keeps the unchanged placeholder note ${JSON.stringify(card5.note)}, study door=${card5.study}`,
  );
  ok(
    '5b-standalone-zero-errors',
    errors.length === preErrors,
    `errors during the standalone-drift pass: ${errors.length - preErrors}`,
  );
} catch (e) {
  ok('FATAL', false, e.stack || String(e));
} finally {
  ok('errors-total', errors.length === 0, `console + page errors across the whole run: ${errors.length}${errors.length ? ' — ' + errors.slice(0, 6).join(' | ') : ''}`);
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (OUT) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ app: APP, drift: DRIFT, seed: SEED, results, errors, notes }, null, 2));
    console.log(`results -> ${OUT}`);
  }
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
}
