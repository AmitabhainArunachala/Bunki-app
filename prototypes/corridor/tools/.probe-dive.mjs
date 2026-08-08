/* Adversarial probe — DIVE DEPTHS lane. Attacks the third act (dives),
 * orbiter taps, glyph/particle chips, cards, radoc, pinch grammar,
 * pointercancel, and grade races. DELETED after the run. */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(TOOL_DIR, '..');
const SHOTS = '/tmp/claude-0/-home-user-Bunki-app/f9bdd25d-9768-5ab6-a091-932d31fdca1c/scratchpad/adv/dive';
mkdirSync(SHOTS, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const server = createServer((q, r) => {
  const p = decodeURIComponent((q.url ?? '/').split('?')[0]);
  const f = resolve(CORRIDOR, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
  if (!f.startsWith(CORRIDOR) || !existsSync(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'cache-control': 'no-store', 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
  r.end(readFileSync(f));
});
const base = await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${server.address().port}`)));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
await ctx.addInitScript('try{localStorage.clear()}catch(e){}');
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(`[${scenario}] pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(`[${scenario}] console: ${m.text()}`));
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, radiusX: 5, radiusY: 5, force: 1 })) });
const tapAt = async (x, y) => { await touch('touchStart', [[x, y]]); await page.waitForTimeout(65); await touch('touchEnd', []); };
const dragAt = async (x0, y0, x1, y1, ms, steps = 8) => {
  await touch('touchStart', [[x0, y0]]);
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(ms / steps);
    await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
  }
  await touch('touchEnd', []);
};
const dragCancel = async (x0, y0, x1, y1, ms, steps = 8) => {
  await touch('touchStart', [[x0, y0]]);
  for (let i = 1; i <= steps; i++) {
    await page.waitForTimeout(ms / steps);
    await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
  }
  await touch('touchCancel', []);
};
const pinchAt = async (cx, cy, r0, r1, ms = 320, steps = 8) => {
  const pts = (r) => [[cx - r, cy], [cx + r, cy]];
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
  await page.waitForTimeout(2400);
};

/* ------------- probes ------------- */
const world = () => page.evaluate(`(() => ({
  depth: document.getElementById('depth')?.textContent ?? '',
  depthN: (document.getElementById('depth')?.textContent ?? '') === '' ? 0 :
    (document.getElementById('depth')?.textContent ?? '').split(' › ').length,
  card: document.getElementById('card')?.classList.contains('open') ?? false,
  radoc: document.getElementById('radoc')?.classList.contains('open') ?? false,
  tray: document.getElementById('drift-tray')?.textContent ?? '',
  sats: document.querySelectorAll('#drift-layer .word.bsat').length,
  bloomCentre: document.querySelector('#drift-layer .word.bctr')?.querySelector('.base')?.textContent ?? null,
}))()`);
const centreInfo = () => page.evaluate(`(() => {
  const el = document.querySelector('#drift-layer .word.center, #drift-layer .glyph.center, #drift-layer .part.center');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const label = el.querySelector('.base')?.textContent ?? el.querySelector('.g')?.textContent ?? el.querySelector('.pch')?.textContent ?? '';
  return { label, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width,
    op: parseFloat(el.style.opacity || '1'), pe: el.style.pointerEvents };
})()`);
// live tappable orbiters at the current depth (excludes receded + center)
const orbiters = () => page.evaluate(`(() => {
  const out = [];
  for (const el of document.querySelectorAll('#drift-layer .word, #drift-layer .glyph, #drift-layer .part')) {
    if (el.classList.contains('center')) continue;
    if (el.style.pointerEvents === 'none') continue;
    if ((el.style.filter || '').includes('blur')) continue;
    const op = parseFloat(el.style.opacity || '1');
    if (op < 0.35) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || r.left < 24 || r.right > 366 || r.top < 130 || r.bottom > 720) continue;
    const kind = el.classList.contains('glyph') ? (el.classList.contains('comp') ? 'radical' : 'glyph')
      : el.classList.contains('part') ? 'part' : 'word';
    const label = el.querySelector('.base')?.textContent ?? el.querySelector('.g')?.textContent ?? el.querySelector('.pch')?.textContent ?? '';
    out.push({ kind, label, x: r.x + r.width / 2, y: r.y + r.height / 2, op });
  }
  return out;
})()`);
const orbiterByLabel = async (label) => (await orbiters()).find((o) => o.label === label) ?? null;
const waterSpot = () => page.evaluate(`(() => {
  const boxes = [...document.querySelectorAll(
    '#drift-layer .word, #drift-layer .glyph, #drift-layer .part, .drift-door, #theme, #lvl, #drift-tray, #brand, #back, #card.open')]
    .map((el) => el.getBoundingClientRect()).filter((b) => b.width);
  for (let y = 150; y < 760; y += 42) for (let x = 40; x < 366; x += 36) {
    if (!boxes.some((b) => x > b.left - 34 && x < b.right + 34 && y > b.top - 34 && y < b.bottom + 34)) return { x, y };
  }
  return { x: 200, y: 140 };
})()`);
const pickFieldWord = (minKanji = 1) => page.evaluate(`(() => {
  const cands = [];
  for (const el of document.querySelectorAll('#drift-layer .word')) {
    const base = el.querySelector('.base')?.textContent ?? '';
    const r = el.getBoundingClientRect();
    const op = parseFloat(el.style.opacity || '1');
    if (!base || !r.width || op < 0.35) continue;
    if (r.left < 70 || r.right > 320 || r.top < 220 || r.bottom > 600) continue;
    const kanji = (base.match(/[\\u4e00-\\u9fff]/g) ?? []).length;
    if (kanji < ${minKanji}) continue;
    cands.push({ w: base, kanji, x: r.x + r.width / 2, y: r.y + r.height / 2, op });
  }
  cands.sort((a, b) => b.kanji - a.kanji || b.op - a.op);
  return cands[0] ?? null;
})()`);
const locate = (label) => page.evaluate(`(() => {
  for (const el of document.querySelectorAll('#drift-layer .word')) {
    if ((el.querySelector('.base')?.textContent ?? '') !== ${JSON.stringify('__X__')}.replace('__X__', ${JSON.stringify(label)})) continue;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width,
      unfolded: el.classList.contains('unfolded'), glossed: el.classList.contains('glossed'),
      op: parseFloat(el.style.opacity || '1'), pe: el.style.pointerEvents };
  }
  return null;
})()`);

/* ------------- reporting ------------- */
let scenario = 'boot';
const violations = [];
const log = (msg) => console.log(`[${scenario}] ${msg}`);
let shotN = 0;
const fail = async (title, detail) => {
  const shot = join(SHOTS, `v${String(++shotN).padStart(2, '0')}-${scenario}.png`);
  try { await page.screenshot({ path: shot }); } catch {}
  violations.push({ scenario, title, detail, shot });
  console.log(`  !! [${scenario}] ${title} — ${detail}`);
};
const ok = (msg) => console.log(`  ok [${scenario}] ${msg}`);

// dive a field word via three staged taps; returns dived word label or null
async function diveIntoWord() {
  const w = await pickFieldWord(1);
  if (!w) return null;
  let p = await locate(w.w);
  await tapAt(p.x, p.y); await page.waitForTimeout(800);
  p = await locate(w.w); if (!p) return null;
  await tapAt(p.x, p.y); await page.waitForTimeout(550);
  p = await locate(w.w); if (!p) return null;
  await tapAt(p.x, p.y); await page.waitForTimeout(1400);
  const wd = await world();
  return wd.depthN >= 1 ? w.w : null;
}

/* =================== S1: staged reveal + 3-level chain + home =================== */
scenario = 'S1-chain';
await boot();
{
  const w = await pickFieldWord(2) ?? await pickFieldWord(1);
  if (!w) { await fail('no candidate word', 'field empty in safe zone'); }
  else {
    let p = await locate(w.w);
    await tapAt(p.x, p.y); await page.waitForTimeout(800);
    let wd = await world(); p = await locate(w.w);
    if (wd.depthN) await fail('I1 single tap dived', `word=${w.w} depth=${wd.depth}`);
    else if (!p?.unfolded) await fail('I1 no furigana on tap', `word=${w.w}`);
    else ok(`tap1 unfold ${w.w}, sats=${wd.sats}`);
    if (wd.sats < 6 && wd.bloomCentre === w.w) await fail('I2 bloom floor', `word=${w.w} sats=${wd.sats} < 6`);
    await tapAt(p.x, p.y); await page.waitForTimeout(550);
    wd = await world(); p = await locate(w.w);
    if (wd.depthN) await fail('I1 second tap dived', `word=${w.w}`);
    else if (!p?.glossed) await fail('I1 no gloss on 2nd tap', `word=${w.w}`);
    else ok('tap2 gloss');
    await tapAt(p.x, p.y); await page.waitForTimeout(1400);
    wd = await world();
    if (wd.depthN !== 1) await fail('I1 third tap did not dive', `word=${w.w} depth="${wd.depth}"`);
    else ok(`tap3 dived, depth="${wd.depth}"`);
    // staged reveal on an orbiting word at depth 1
    const orbs = await orbiters();
    const ow = orbs.find((o) => o.kind === 'word');
    if (!ow) await fail('I2 no tappable word orbiter at depth 1', `word=${w.w} orbiters=${orbs.length}`);
    else {
      let q = await orbiterByLabel(ow.label);
      await tapAt(q.x, q.y); await page.waitForTimeout(650);
      let st = await page.evaluate(`(() => { for (const el of document.querySelectorAll('#drift-layer .word'))
        if ((el.querySelector('.base')?.textContent ?? '') === ${JSON.stringify(ow.label)})
          return { u: el.classList.contains('unfolded'), g: el.classList.contains('glossed') }; return null; })()`);
      let wd2 = await world();
      if (wd2.depthN !== 1) await fail('I1 orbiter tap changed depth', `orb=${ow.label} depth=${wd2.depth}`);
      else if (!st?.u) await fail('I1 orbiter tap no furigana', `orb=${ow.label}`);
      else ok(`orbiter tap1 unfold ${ow.label}`);
      q = await orbiterByLabel(ow.label);
      if (q) {
        await tapAt(q.x, q.y); await page.waitForTimeout(550);
        st = await page.evaluate(`(() => { for (const el of document.querySelectorAll('#drift-layer .word'))
          if ((el.querySelector('.base')?.textContent ?? '') === ${JSON.stringify(ow.label)})
            return { g: el.classList.contains('glossed') }; return null; })()`);
        wd2 = await world();
        if (wd2.depthN !== 1) await fail('I1 orbiter 2nd tap changed depth', `orb=${ow.label} depth=${wd2.depth}`);
        else if (!st?.g) await fail('I1 orbiter 2nd tap no gloss', `orb=${ow.label}`);
        else ok('orbiter tap2 gloss');
        q = await orbiterByLabel(ow.label);
        if (q) {
          await tapAt(q.x, q.y); await page.waitForTimeout(1400);
          wd2 = await world();
          if (wd2.depthN !== 2) await fail('I1 orbiter 3rd tap did not dive', `orb=${ow.label} depth="${wd2.depth}"`);
          else ok(`orbiter tap3 dived, depth="${wd2.depth}"`);
        }
      }
    }
    // glyph dive → depth 3
    const g = (await orbiters()).find((o) => o.kind === 'glyph' || o.kind === 'radical');
    if (!g) log('no glyph orbiter for level 3 (skip)');
    else {
      await tapAt(g.x, g.y); await page.waitForTimeout(1400);
      const wd3 = await world();
      if (wd3.depthN < 3) await fail('I1 glyph tap did not deepen', `glyph=${g.label} depth="${wd3.depth}"`);
      else ok(`glyph dived, depth="${wd3.depth}"`);
    }
    // surface all the way home with water taps
    for (let i = 0; i < 8; i++) {
      const d = (await world()).depthN;
      if (!d) break;
      const ws = await waterSpot();
      await tapAt(ws.x, ws.y); await page.waitForTimeout(950);
      const d2 = (await world()).depthN;
      if (d2 >= d) { await fail('I8 water tap did not surface', `depth stayed ${d2} (tap ${i} at ${ws.x},${ws.y})`); break; }
    }
    const home = await world();
    if (home.depthN) await fail('I8 depth not empty at home', `depth="${home.depth}"`);
    else ok('surfaced home, #depth empty');
    // surface field still obeys I1/I4: bloom + chain once
    await page.waitForTimeout(1200);
    const w2 = await pickFieldWord(1);
    if (w2) {
      const pp = await locate(w2.w);
      await tapAt(pp.x, pp.y); await page.waitForTimeout(1400);
      const wd4 = await world();
      if (wd4.bloomCentre !== w2.w || wd4.sats < 6) await fail('I2/I4 post-dive bloom broken', `word=${w2.w} centre=${wd4.bloomCentre} sats=${wd4.sats}`);
      else {
        ok(`post-dive bloom ${w2.w} sats=${wd4.sats}`);
        const sat = await page.evaluate(`(() => {
          for (const el of document.querySelectorAll('#drift-layer .word.bsat')) {
            const r = el.getBoundingClientRect();
            if (r.width && r.left > 40 && r.right < 350 && r.top > 160 && r.bottom < 690)
              return { w: el.querySelector('.base')?.textContent ?? '', x: r.x + r.width / 2, y: r.y + r.height / 2 };
          } return null; })()`);
        if (sat) {
          await tapAt(sat.x, sat.y); await page.waitForTimeout(700);
          const s1 = await locate(sat.w);
          if (!s1) await fail('I4 satellite vanished on tap', `sat=${sat.w}`);
          else {
            const s1p = await locate(sat.w);
            await tapAt(s1p.x, s1p.y); await page.waitForTimeout(1400);
            const wd5 = await world();
            if (wd5.bloomCentre !== sat.w && !wd5.depthN) await fail('I4 chain re-centre failed', `sat=${sat.w} centre=${wd5.bloomCentre}`);
            else ok(`chain re-centre ok (centre=${wd5.bloomCentre ?? 'dived'})`);
          }
        }
      }
    }
  }
}

/* =================== S2: radoc overlay tap-through (run twice) =================== */
for (const run of [1, 2]) {
  scenario = `S2-radoc-r${run}`;
  await boot();
  const dived = await diveIntoWord();
  if (!dived) { await fail('setup', 'could not dive'); continue; }
  // find a kanji glyph orbiter, dive it, open its card
  let opened = false;
  for (let attempt = 0; attempt < 3 && !opened; attempt++) {
    const g = (await orbiters()).find((o) => o.kind === 'glyph');
    if (!g) break;
    await tapAt(g.x, g.y); await page.waitForTimeout(1300);
    const c = await centreInfo();
    if (!c) break;
    await tapAt(c.x, c.y); await page.waitForTimeout(700);
    const wd = await world();
    if (!wd.card) { await fail('centre tap did not open card', `centre=${c.label}`); break; }
    const radQ = await page.evaluate(`(() => { const b = document.getElementById('radQ');
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!radQ) { // no family list on this kanji: close card, go deeper via another glyph
      const ws = await waterSpot(); await tapAt(ws.x, ws.y); await page.waitForTimeout(600); continue;
    }
    await tapAt(radQ.x, radQ.y); await page.waitForTimeout(700);
    opened = (await world()).radoc;
  }
  if (!opened) { log('could not open radoc (no kanji with family reachable) — skip'); continue; }
  const before = await world();
  ok(`radoc open at depth="${before.depth}" card=${before.card}`);
  // tap the explainer's own paragraph text — must be inert wrt the world
  const pSpot = await page.evaluate(`(() => { const p = document.querySelector('#radoc .wrap p');
    const r = p.getBoundingClientRect(); return { x: r.x + Math.min(80, r.width / 2), y: r.y + r.height / 2 }; })()`);
  await tapAt(pSpot.x, pSpot.y); await page.waitForTimeout(700);
  let after = await world();
  if (after.card !== before.card)
    await fail('overlay tap-through: card closed beneath radoc', `tap on #radoc paragraph closed the card (card ${before.card}→${after.card}, radoc still ${after.radoc})`);
  if (after.depthN !== before.depthN)
    await fail('overlay tap-through: dive surfaced beneath radoc', `depth "${before.depth}"→"${after.depth}"`);
  // keep tapping the paragraph: does the dive stack pop under the modal?
  for (let i = 0; i < 5; i++) {
    const d0 = (await world()).depthN;
    if (!d0) break;
    await tapAt(pSpot.x, pSpot.y); await page.waitForTimeout(800);
    const d1 = (await world()).depthN;
    if (d1 < d0) {
      await fail('overlay tap-through: water-tap semantics under modal', `paragraph tap #${i + 2} surfaced ${d0}→${d1} while radoc stayed open`);
    } else break;
  }
  after = await world();
  log(`end state: depth="${after.depth}" card=${after.card} radoc=${after.radoc}`);
  // radocX: does closing the explainer also secretly close/surface things?
  if (after.radoc) {
    const xSpot = await page.evaluate(`(() => { const b = document.getElementById('radocX');
      const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const b2 = await world();
    await tapAt(xSpot.x, xSpot.y); await page.waitForTimeout(700);
    const a2 = await world();
    if (a2.radoc) await fail('radoc X did not close', '');
    if (a2.depthN < b2.depthN) await fail('radoc X tap surfaced a dive level', `depth "${b2.depth}"→"${a2.depth}"`);
    if (b2.card && !a2.card) await fail('radoc X tap closed the card beneath', 'X should only close the explainer');
  }
}

/* =================== S3: pointercancel ghost offset on dive centre (run twice) =================== */
for (const run of [1, 2]) {
  scenario = `S3-cancel-r${run}`;
  await boot();
  const dived = await diveIntoWord();
  if (!dived) { await fail('setup', 'could not dive'); continue; }
  const c0 = await centreInfo();
  if (!c0) { await fail('setup', 'no centre'); continue; }
  const HOME = { x: 195, y: 844 * 0.40 };
  // slow drag the centre far away, then pointercancel mid-hold
  await dragCancel(c0.x, c0.y, c0.x + 120, c0.y + 150, 500, 8);
  await page.waitForTimeout(2500); // centre glides home if state is clean
  const c1 = await centreInfo();
  if (!c1) { await fail('I8 centre vanished after pointercancel', `word=${dived}`); continue; }
  const off1 = Math.hypot(c1.x - HOME.x, c1.y - HOME.y);
  await page.waitForTimeout(2000);
  const c2 = await centreInfo();
  const off2 = Math.hypot(c2.x - HOME.x, c2.y - HOME.y);
  if (off2 > 40 && Math.abs(off2 - off1) < 12)
    await fail('I8 pointercancel leaves permanent ghost offset', `centre=${dived} rests ${off2.toFixed(0)}px from its slot (${c2.x.toFixed(0)},${c2.y.toFixed(0)}) vs (195,338); unchanged 2s later — dragX/dragY never reset by pointercancel`);
  else ok(`centre offset after cancel: ${off1.toFixed(0)}px → ${off2.toFixed(0)}px`);
  // follow-up tap must still work (I8 next gesture clean)
  const c3 = await centreInfo();
  await tapAt(c3.x, c3.y); await page.waitForTimeout(700);
  const wd = await world();
  if (!wd.card) await fail('I8 tap after pointercancel dead', 'centre tap did not open card');
  else ok('tap after cancel opened card');
  // does the tap make the centre teleport/glide (committing the stale offset)?
  const c4 = await centreInfo();
  await page.waitForTimeout(1600);
  const c5 = await centreInfo();
  const moved = Math.hypot(c5.x - c4.x, c5.y - c4.y);
  if (moved > 40) log(`note: centre glided ${moved.toFixed(0)}px after the tap (stale offset committed then re-lerped)`);
}

/* =================== S4: grade-the-centre races =================== */
scenario = 'S4-race-A';
await boot();
{
  // build depth 2: word dive, then orbiter word 3-tap
  const dived = await diveIntoWord();
  if (!dived) await fail('setup', 'could not dive');
  else {
    const ow = (await orbiters()).find((o) => o.kind === 'word');
    if (ow) {
      let q = ow;
      for (let t = 0; t < 3 && q; t++) {
        await tapAt(q.x, q.y); await page.waitForTimeout(t === 2 ? 1300 : 600);
        if (t < 2) q = await orbiterByLabel(ow.label);
      }
    }
    const wd0 = await world();
    if (wd0.depthN >= 2) {
      const c = await centreInfo();
      const tray0 = wd0.tray;
      // fast horizontal flick on the centre = deliberate grade (allowed)
      await dragAt(c.x, c.y, c.x + 95, c.y - 4, 90, 3);
      await page.waitForTimeout(120);
      // ...but a water tap inside grade's 350ms auto-surface window
      const ws = await waterSpot();
      await tapAt(ws.x, ws.y);
      await page.waitForTimeout(1200);
      const wd1 = await world();
      if (wd1.tray === tray0) log('flick did not grade centre (skip race check)');
      else if (wd1.depthN <= wd0.depthN - 2)
        await fail('I8 double-surface race', `flick-graded centre at depth ${wd0.depthN}, water tap ~120ms later: expected depth ${wd0.depthN - 1}, got ${wd1.depthN} ("${wd1.depth}") — queued auto-surface popped a second level`);
      else ok(`race A: depth ${wd0.depthN}→${wd1.depthN} tray "${tray0}"→"${wd1.tray}"`);
    } else log(`could not reach depth 2 (depth=${wd0.depth}) — skip`);
  }
}
scenario = 'S4-race-B';
await boot();
{
  const dived = await diveIntoWord();
  if (!dived) await fail('setup', 'could not dive');
  else {
    const wd0 = await world();
    const c = await centreInfo();
    const g = (await orbiters()).find((o) => o.kind === 'glyph' || o.kind === 'radical');
    if (!g) log('no glyph orbiter — skip');
    else {
      await dragAt(c.x, c.y, c.x + 95, c.y - 4, 90, 3); // grade the centre
      await page.waitForTimeout(100);
      await tapAt(g.x, g.y); // dive the kanji inside the 350ms window
      await page.waitForTimeout(1100);
      const wd1 = await world();
      const c1 = await centreInfo();
      const live = c1 && c1.op > 0.15 && c1.pe !== 'none';
      if (wd1.tray === wd0.tray) log('flick did not grade centre — skip');
      else if (wd1.depthN >= 2 && live) ok(`race B: kanji dive survived (depth="${wd1.depth}")`);
      else {
        await fail('I8 grade race kills fresh dive / centre-less level',
          `graded centre, tapped glyph ${g.label} ~100ms later: depth="${wd1.depth}" liveCentre=${live ? c1.label : 'NONE'} — queued auto-surface popped the dive the user just entered${!live && wd1.depthN ? ', leaving a level whose centre was graded away' : ''}`);
        // can we still get home?
        for (let i = 0; i < 6 && (await world()).depthN; i++) {
          const ws = await waterSpot(); await tapAt(ws.x, ws.y); await page.waitForTimeout(900);
        }
        const home = await world();
        if (home.depthN) await fail('I8 stuck: cannot surface home after race', `depth="${home.depth}"`);
        else log('recovered home via water taps');
      }
    }
  }
}

/* =================== S5: pinch grammar at depth =================== */
scenario = 'S5-pinch';
await boot();
{
  const dived = await diveIntoWord();
  if (!dived) await fail('setup', 'could not dive');
  else {
    // pinch-out over an orbiter word must dive into it
    const ow = (await orbiters()).find((o) => o.kind === 'word');
    if (ow) {
      const d0 = (await world()).depthN;
      await pinchAt(ow.x, ow.y, 30, 105);
      await page.waitForTimeout(1200);
      const d1 = (await world()).depthN;
      if (d1 !== d0 + 1) await fail('I10 pinch-out over orbiter did not dive', `depth ${d0}→${d1} (orb=${ow.label})`);
      else ok(`pinch-out dived into ${ow.label}`);
    }
    // pinch-out over the centre opens its card
    const c = await centreInfo();
    if (c) {
      await pinchAt(c.x, c.y, 30, 105);
      await page.waitForTimeout(800);
      const wd = await world();
      if (!wd.card) log(`note: pinch-out over centre did not open card (card=${wd.card})`);
      else ok('pinch-out over centre opened card');
      // pinch-in with card open: closes card only, keeps depth
      const d2 = wd.depthN;
      await pinchAt(195, 430, 110, 40);
      await page.waitForTimeout(800);
      const wd2 = await world();
      if (wd.card && (wd2.card || wd2.depthN !== d2))
        await fail('I10 pinch-in with card open', `expected card-close only: card=${wd2.card} depth ${d2}→${wd2.depthN}`);
      else ok('pinch-in closed card, depth kept');
    }
    // pinch-in surfaces exactly one level each time, all the way home
    for (let i = 0; i < 8; i++) {
      const d = (await world()).depthN;
      if (!d) break;
      await pinchAt(195, 500, 110, 40);
      await page.waitForTimeout(900);
      const d2 = (await world()).depthN;
      if (d2 !== d - 1) { await fail('I10 pinch-in did not surface exactly one level', `depth ${d}→${d2}`); break; }
    }
    const home = await world();
    if (home.depthN) await fail('I8 pinch-in could not reach home', `depth="${home.depth}"`);
    else ok('pinch-in surfaced home, #depth empty');
  }
}

/* =================== S6: drags, vertical flicks, judgment at depth =================== */
scenario = 'S6-drag';
await boot();
{
  const dived = await diveIntoWord();
  if (!dived) await fail('setup', 'could not dive');
  else {
    const tray0 = (await world()).tray;
    // slow drag an orbiter word: survives, no grade
    const ow = (await orbiters()).find((o) => o.kind === 'word');
    if (ow) {
      await dragAt(ow.x, ow.y, ow.x + 74, ow.y - 8, 560);
      await page.waitForTimeout(1100);
      const wd = await world();
      const still = await orbiterByLabel(ow.label);
      if (wd.tray !== tray0) await fail('I3/I7 slow drag graded an orbiter', `orb=${ow.label} tray "${tray0}"→"${wd.tray}"`);
      else if (!still) await fail('I3 orbiter vanished after slow drag', `orb=${ow.label}`);
      else ok(`slow drag survived (${ow.label})`);
    }
    // vertical fast flick on an orbiter: |dy|>=90 → NOT a judgment
    const ow2 = (await orbiters()).find((o) => o.kind === 'word');
    if (ow2) {
      const t0 = (await world()).tray;
      await dragAt(ow2.x, ow2.y, ow2.x + 20, ow2.y + 150, 90, 3);
      await page.waitForTimeout(1000);
      const wd = await world();
      const still = await orbiterByLabel(ow2.label);
      if (wd.tray !== t0) await fail('I7 vertical flick graded', `orb=${ow2.label} tray "${t0}"→"${wd.tray}"`);
      else if (!still) await fail('I3 orbiter vanished after vertical flick', `orb=${ow2.label}`);
      else ok(`vertical flick inert (${ow2.label})`);
    }
    // slow drag the centre: survives, glides back
    const c = await centreInfo();
    if (c) {
      const t0 = (await world()).tray;
      await dragAt(c.x, c.y, c.x + 70, c.y + 60, 560);
      await page.waitForTimeout(2200);
      const c2 = await centreInfo();
      const wd = await world();
      if (wd.tray !== t0) await fail('I3 slow drag graded the centre', `tray "${t0}"→"${wd.tray}"`);
      else if (!c2 || c2.op < 0.2) await fail('I3 centre vanished after slow drag', '');
      else ok(`centre slow drag survived (rest at ${c2.x.toFixed(0)},${c2.y.toFixed(0)})`);
    }
    // particle chip: flick it — what happens? (record behaviour)
    const pc = (await orbiters()).find((o) => o.kind === 'part');
    if (pc) {
      const t0 = (await world()).tray;
      await dragAt(pc.x, pc.y, pc.x + 95, pc.y, 90, 3);
      await page.waitForTimeout(1000);
      const wd = await world();
      log(`particle ${pc.label} flick: tray "${t0}"→"${wd.tray}" (graded=${wd.tray !== t0})`);
    }
    // water slow-drag must NOT surface; water flick must NOT surface; water tap MUST
    const d0 = (await world()).depthN;
    let ws = await waterSpot();
    await dragAt(ws.x, ws.y, ws.x + 90, ws.y + 40, 560);
    await page.waitForTimeout(700);
    if ((await world()).depthN !== d0) await fail('I8 water slow-drag surfaced', 'drag on water popped a level');
    else ok('water slow-drag inert');
    ws = await waterSpot();
    await dragAt(ws.x, ws.y, ws.x + 110, ws.y, 90, 3);
    await page.waitForTimeout(700);
    if ((await world()).depthN !== d0) await fail('I8 water flick surfaced', 'flick on water popped a level');
    else ok('water flick inert');
  }
}

/* =================== S7: theme cycling + card/stroke button at depth =================== */
scenario = 'S7-theme-card';
await boot();
{
  const dived = await diveIntoWord();
  if (!dived) await fail('setup', 'could not dive');
  else {
    const g = (await orbiters()).find((o) => o.kind === 'glyph');
    if (g) { await tapAt(g.x, g.y); await page.waitForTimeout(1300); }
    const d0 = (await world()).depthN;
    const themeBtn = await page.evaluate(`(() => { const b = document.getElementById('theme');
      const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    for (let i = 0; i < 4; i++) {
      await tapAt(themeBtn.x, themeBtn.y); await page.waitForTimeout(500);
      const wd = await world(); const c = await centreInfo();
      if (wd.depthN !== d0 || !c || c.op < 0.2) {
        await fail('I5/I9 theme cycle broke dive state', `cycle ${i + 1}: depth ${d0}→${wd.depthN} centre=${c ? c.label : 'GONE'}`);
        break;
      }
      await page.screenshot({ path: join(SHOTS, `theme-${i}-depth${d0}.png`) });
    }
    ok('theme cycles kept dive intact (shots saved)');
    // centre card: stroke replay + family row dive (diveFromList)
    const c = await centreInfo();
    await tapAt(c.x, c.y); await page.waitForTimeout(700);
    let wd = await world();
    if (!wd.card) log('no card opened on centre tap — skip card checks');
    else {
      const sb = await page.evaluate(`(() => { const b = document.getElementById('strokeBtn');
        if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (sb) {
        await tapAt(sb.x, sb.y); await page.waitForTimeout(900);
        wd = await world();
        if (!wd.card) await fail('stroke replay closed the card', '筆順 button should replay in place');
        else ok('stroke replay ok');
      }
      const row = await page.evaluate(`(() => { const r0 = document.querySelector('#card .rrow');
        if (!r0) return null; const r = r0.getBoundingClientRect();
        return { ch: r0.getAttribute('data-ch'), x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 18) }; })()`);
      if (row) {
        const dBefore = (await world()).depthN;
        await tapAt(row.x, row.y); await page.waitForTimeout(1400);
        wd = await world();
        const c2 = await centreInfo();
        if (wd.depthN !== dBefore + 1 || !c2 || c2.label !== row.ch)
          await fail('family-row dive failed', `row=${row.ch}: depth ${dBefore}→${wd.depthN} centre=${c2 ? c2.label : 'none'} card=${wd.card}`);
        else ok(`family-row dived into ${row.ch} (depth="${wd.depth}")`);
        // surface from ephemeral dive
        const ws = await waterSpot(); await tapAt(ws.x, ws.y); await page.waitForTimeout(1000);
        const wd2 = await world();
        if (wd2.depthN !== dBefore) await fail('surfacing from family-row dive broken', `depth ${wd.depthN}→${wd2.depthN} expected ${dBefore}`);
        else ok('surfaced from family-row dive');
      }
    }
    // home
    for (let i = 0; i < 8 && (await world()).depthN; i++) {
      const wsp = await waterSpot(); await tapAt(wsp.x, wsp.y); await page.waitForTimeout(900);
    }
    const home = await world();
    if (home.depthN) await fail('I8 not home after S7', `depth="${home.depth}"`);
    else ok('home clean');
  }
}

/* =================== S8: pointercancel on orbiter + clean next gesture =================== */
scenario = 'S8-cancel-orbiter';
await boot();
{
  const dived = await diveIntoWord();
  if (!dived) await fail('setup', 'could not dive');
  else {
    const ow = (await orbiters()).find((o) => o.kind === 'word');
    if (!ow) log('no word orbiter — skip');
    else {
      await dragCancel(ow.x, ow.y, ow.x + 130, ow.y + 120, 420, 6);
      await page.waitForTimeout(1500);
      const still = await orbiterByLabel(ow.label);
      const wd = await world();
      if (!still) await fail('I8 orbiter vanished after pointercancel', `orb=${ow.label}`);
      else {
        // next tap must be a clean stage-1 reveal
        await tapAt(still.x, still.y); await page.waitForTimeout(650);
        const st = await page.evaluate(`(() => { for (const el of document.querySelectorAll('#drift-layer .word'))
          if ((el.querySelector('.base')?.textContent ?? '') === ${JSON.stringify(ow.label)})
            return { u: el.classList.contains('unfolded') }; return null; })()`);
        const wd2 = await world();
        if (wd2.depthN !== wd.depthN) await fail('I8 tap after cancel changed depth', `depth ${wd.depthN}→${wd2.depthN}`);
        else if (!st?.u) await fail('I8 tap after cancel dead', `orb=${ow.label} no furigana`);
        else ok('orbiter clean after pointercancel');
      }
    }
  }
}

/* ------------- summary ------------- */
scenario = 'summary';
console.log('\n==== DIVE LANE RESULT ====');
console.log(`violations: ${violations.length}`);
for (const v of violations) console.log(` - [${v.scenario}] ${v.title} :: ${v.detail} :: ${v.shot}`);
console.log(`page errors: ${pageErrors.length}`);
for (const e of pageErrors) console.log(' * ' + e);
await browser.close();
server.close();
process.exit(0);
