/**
 * ADVERSARIAL PROBE — lane: CHAIN ENDURANCE
 * Walks planet -> satellite -> new planet chains and tries to break
 * I2/I3/I4/I6/I7/I8 through endurance, interleaving, glide-taps, and
 * revisit cycles. Deleted after the run.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(TOOL_DIR, '..');
const SHOTS = '/tmp/claude-0/-home-user-Bunki-app/f9bdd25d-9768-5ab6-a091-932d31fdca1c/scratchpad/adv/chain';
mkdirSync(SHOTS, { recursive: true });

const argv = process.argv.slice(2);
const only = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 ? new Set(argv[i + 1].split(',')) : null;
})();

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
  if (!f.startsWith(CORRIDOR) || !existsSync(f)) { r.writeHead(404); r.end(); return; }
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
page.on('pageerror', (e) => pageErrors.push({ where: WHERE(), msg: String(e.message) }));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/vendor\/ts-fsrs\.mjs/.test(t) && /MIME/.test(t)) return; // probe-server artifact, excluded per brief
  pageErrors.push({ where: WHERE(), msg: t });
});
let curRecipe = 'boot', curHop = 0;
const WHERE = () => `${curRecipe}#h${curHop}`;

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

const boot = async () => {
  await page.goto(`${base}/index.html?entry=drift`);
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  await page.waitForTimeout(2400);
};

/* ---------------------------------------------------------------- probes */
const wordProbe = (label) => page.evaluate(`(() => {
  const target = ${JSON.stringify(label)};
  for (const el of document.querySelectorAll('#drift-layer .word')) {
    const base = el.querySelector('.base')?.textContent ?? '';
    if (base !== target) continue;
    const r = el.getBoundingClientRect();
    const op = parseFloat(el.style.opacity || '1');
    return {
      exists: true,
      x: r.x + r.width / 2, y: r.y + r.height / 2,
      onScreen: r.width > 0 && r.right > 8 && r.left < 382 && r.bottom > 100 && r.top < 780,
      opacity: op,
      unfolded: el.classList.contains('unfolded') || el.classList.contains('glossed'),
      glossed: el.classList.contains('glossed'),
      isCentre: el.classList.contains('bctr'),
      isSat: el.classList.contains('bsat'),
    };
  }
  return { exists: false };
})()`);

const worldProbe = () => page.evaluate(`(() => ({
  bloomCentre: document.querySelector('#drift-layer .word.bctr')?.querySelector('.base')?.textContent ?? null,
  sats: document.querySelectorAll('#drift-layer .word.bsat').length,
  words: document.querySelectorAll('#drift-layer .word').length,
  tray: document.getElementById('drift-tray')?.textContent ?? '',
  depth: document.getElementById('depth')?.textContent ?? '',
  cardOpen: document.getElementById('card')?.classList.contains('open') ?? false,
}))()`);

const pickFree = (excludeArr) => page.evaluate(`(() => {
  const done = new Set(${JSON.stringify(excludeArr)});
  const cands = [];
  for (const el of document.querySelectorAll('#drift-layer .word')) {
    const base = el.querySelector('.base')?.textContent ?? '';
    const r = el.getBoundingClientRect();
    if (!base || done.has(base) || !r.width) continue;
    if (el.classList.contains('bctr') || el.classList.contains('bsat')) continue;
    if (el.classList.contains('unfolded') || el.classList.contains('glossed')) continue;
    if (r.left < 46 || r.right > 344 || r.top < 170 || r.bottom > 690) continue;
    const op = parseFloat(el.style.opacity || '1');
    if (op < 0.12) continue;
    const kanji = (base.match(/[\\u4e00-\\u9fff]/g) ?? []).length;
    cands.push({ w: base, kanji, opacity: op });
  }
  cands.sort((a, b) => a.kanji - b.kanji || b.opacity - a.opacity);
  return cands[0] ?? null;
})()`);

// pick a satellite of the current bloom, preferring the given strata (0 kana-only,
// 1 one-kanji, 2 multi), skipping labels in exclude, staying inside the safe zone.
const pickSat = (excludeArr, prefer) => page.evaluate(`(() => {
  const done = new Set(${JSON.stringify(excludeArr)});
  const sats = [...document.querySelectorAll('#drift-layer .word.bsat')].map((el) => {
    const r = el.getBoundingClientRect();
    return { el, r, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const cands = [];
  for (const s of sats) {
    const base = s.el.querySelector('.base')?.textContent ?? '';
    if (!base || done.has(base)) continue;
    if (!s.r.width || s.r.left < 36 || s.r.right > 354 || s.r.top < 150 || s.r.bottom > 690) continue;
    const crowded = sats.some((o) => o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 34);
    if (crowded) continue;
    const kanji = (base.match(/[\\u4e00-\\u9fff]/g) ?? []).length;
    cands.push({ w: base, kanji: Math.min(kanji, 2), x: s.x, y: s.y });
  }
  if (!cands.length) return null;
  const pref = ${JSON.stringify(prefer)};
  cands.sort((a, b) => (Math.abs(a.kanji - pref) - Math.abs(b.kanji - pref)));
  return cands[0];
})()`);

// settle-aware aim: only report a position once it moved <6px over 200ms
const settleAim = async (label, maxTries = 14) => {
  let prev = await wordProbe(label);
  for (let i = 0; i < maxTries; i++) {
    await page.waitForTimeout(200);
    const cur = await wordProbe(label);
    if (!cur.exists) return cur;
    if (prev.exists && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 6) return cur;
    prev = cur;
  }
  return prev;
};

/* ------------------------------------------------------------ recording */
const violations = [];
let shotN = 0;
const flag = async (kind, detail) => {
  const shot = `${String(++shotN).padStart(2, '0')}-${curRecipe}-h${curHop}-${kind}.png`.replace(/[^\w.\-]/g, '_');
  try { await page.screenshot({ path: join(SHOTS, shot) }); } catch {}
  violations.push({ recipe: curRecipe, hop: curHop, kind, detail, shot });
  console.log(` !! [${curRecipe} h${curHop}] ${kind} — ${detail}`);
};
const ok = (msg) => console.log(`  ok [${curRecipe} h${curHop}] ${msg}`);

let totalHops = 0;
const walked = []; // labels walked this recipe (reset per recipe)
let trayRef = '';

const waterTap = async () => {
  const spot = await page.evaluate(`(() => {
    const boxes = [...document.querySelectorAll('#drift-layer .word, #drift-layer .glyph, .drift-door, #theme, #lvl, #back')]
      .map((el) => el.getBoundingClientRect()).filter((b) => b.width);
    const spots = [[200,210],[330,250],[120,300],[260,640],[90,560],[340,400],[60,220],[300,180]];
    for (const [x, y] of spots) {
      const near = boxes.some((b) => x > b.left - 46 && x < b.right + 46 && y > b.top - 46 && y < b.bottom + 46);
      if (!near) return { x, y, clear: true };
    }
    // fall back: farthest of the spots from any box centre
    let best = null;
    for (const [x, y] of spots) {
      let d = 1e9;
      for (const b of boxes) d = Math.min(d, Math.hypot(x - (b.left + b.width/2), y - (b.top + b.height/2)));
      if (!best || d > best.d) best = { x, y, d };
    }
    return { x: best.x, y: best.y, clear: false };
  })()`);
  await tapAt(spot.x, spot.y);
  await page.waitForTimeout(500);
  return spot;
};

/**
 * One chain hop onto satellite `label`: reveal tap + re-centre tap, then the
 * lane's full assert battery. Returns { state: 'ok'|'dived'|'lost', world }.
 */
const hop = async (label, { skipSettle = false } = {}) => {
  totalHops++; curHop++;
  const trayBefore = (await worldProbe()).tray;

  // tap 1 — reveal in place
  let p = skipSettle ? await wordProbe(label) : await settleAim(label);
  if (!p.exists) { await flag('target-missing-pre', `${label} not in DOM before hop`); return { state: 'lost' }; }
  if (!p.onScreen) { await flag('target-offscreen-pre', `${label} offscreen before hop`); return { state: 'lost' }; }
  await tapAt(p.x, p.y);
  await page.waitForTimeout(650);
  let w = await worldProbe();
  let s = await wordProbe(label);
  if (!s.exists || s.opacity < 0.05) {
    await flag('vanished-on-reveal-tap', `${label} gone after first (reveal) tap [I3/I4]`);
    return { state: 'lost' };
  }
  if (w.depth) {
    await flag('dived-on-first-tap', `${label}: first satellite tap opened a dive (depth="${w.depth}") [I1/I4]`);
    return { state: 'dived', world: w };
  }
  if (w.tray !== trayBefore) {
    await flag('tray-changed-on-tap', `${label}: tray "${trayBefore}" -> "${w.tray}" from a plain tap [I7]`);
  }
  if (!s.unfolded) ok(`${label} reveal tap gave no furigana class (recorded, not fatal)`);

  // tap 2 — re-centre
  p = skipSettle ? await wordProbe(label) : await settleAim(label);
  if (!p.exists || !p.onScreen) { await flag('lost-between-taps', `${label} gone/offscreen between reveal and re-centre`); return { state: 'lost' }; }
  await tapAt(p.x, p.y);
  await page.waitForTimeout(1600); // cascade + camera glide
  w = await worldProbe();
  s = await wordProbe(label);

  if (!s.exists || s.opacity < 0.05) {
    await flag('vanished-on-recentre', `${label} gone after second (re-centre) tap [I3/I4]`);
    return { state: 'lost', world: w };
  }
  if (w.depth) {
    // observed dive on second sat tap — record, caller decides
    return { state: 'dived', world: w };
  }
  if (w.bloomCentre !== label) {
    await flag('not-centred', `${label}: second tap did not re-centre (centre=${w.bloomCentre ?? 'none'}, sats=${w.sats}) [I4]`);
    return { state: 'lost', world: w };
  }
  if (w.sats < 1) {
    await flag('no-satellites', `${label}: centred but 0 satellites [I2/I4]`);
  } else if (w.sats < 6) {
    // bloom floor is 6 (I2) — give the cascade one more beat, then flag
    await page.waitForTimeout(900);
    const w2 = await worldProbe();
    if (w2.bloomCentre === label && w2.sats < 6)
      await flag('bloom-floor', `${label}: only ${w2.sats} satellites after 2.5s (floor is 6) [I2]`);
    w = w2;
  }
  if (w.tray !== trayBefore) {
    await flag('tray-changed-on-hop', `${label}: tray "${trayBefore}" -> "${w.tray}" without a flick [I7]`);
  }
  walked.push(label);
  ok(`hop -> ${label} centred, sats=${w.sats}`);
  return { state: 'ok', world: w };
};

const assertWalkedAlive = async () => {
  for (const wlabel of walked) {
    const s = await wordProbe(wlabel);
    if (!s.exists || s.opacity < 0.05)
      await flag('walked-word-lost', `${wlabel} walked earlier this chain is no longer in the field [I4]`);
  }
};

const startBloom = async (excludeArr = []) => {
  const w0 = await pickFree([...excludeArr, ...walked]);
  if (!w0) return null;
  const p = await settleAim(w0.w);
  if (!p.exists || !p.onScreen) return null;
  await tapAt(p.x, p.y);
  await page.waitForTimeout(1500);
  const w = await worldProbe();
  if (w.bloomCentre !== w0.w) {
    await flag('seed-no-bloom', `seed tap on ${w0.w} did not bloom (centre=${w.bloomCentre ?? 'none'})`);
    return null;
  }
  walked.push(w0.w);
  return w0.w;
};

const recipes = {};

/* R1 — long chain: 12 hops, mixed strata, single boot */
recipes.R1_long_chain = async () => {
  await boot();
  curHop = 0; walked.length = 0;
  const seed = await startBloom();
  if (!seed) return;
  trayRef = (await worldProbe()).tray;
  for (let i = 0; i < 12; i++) {
    const sat = await pickSat(walked, i % 3);
    if (!sat) { ok(`no eligible satellite at hop ${i + 1}, panning`);
      await dragAt(200, 400, 200, 320, 420); await page.waitForTimeout(900);
      const sat2 = await pickSat(walked, i % 3);
      if (!sat2) { ok('chain starved of satellites'); break; }
      const r2 = await hop(sat2.w); if (r2.state !== 'ok') { if (r2.state === 'dived') { ok(`dived at hop ${curHop} on ${sat2.w} (2nd tap) — recorded`); } break; }
      continue;
    }
    const r = await hop(sat.w);
    if (r.state === 'dived') { ok(`second sat tap dived on ${sat.w} — recorded, ending chain`); break; }
    if (r.state === 'lost') break;
  }
  await assertWalkedAlive();
};

/* R2 — chain interleaved with slow drags of the centre (never a grade) */
recipes.R2_slow_drag_centre = async () => {
  await boot();
  curHop = 0; walked.length = 0;
  const seed = await startBloom();
  if (!seed) return;
  for (let i = 0; i < 6; i++) {
    const w = await worldProbe();
    const centre = w.bloomCentre;
    if (!centre) { await flag('held-lost', `constellation gone before drag (hop cycle ${i}) [I6]`); break; }
    const c = await settleAim(centre);
    if (c.exists && c.onScreen) {
      const trayBefore = (await worldProbe()).tray;
      const dx = i % 2 ? -70 : 70;
      await dragAt(c.x, c.y, c.x + dx, c.y + 12, 560); // slow: ~0.13 px/ms
      await page.waitForTimeout(900);
      const after = await worldProbe();
      const cs = await wordProbe(centre);
      if (!cs.exists || cs.opacity < 0.05)
        await flag('slow-drag-destroyed', `${centre} destroyed by slow drag of the centre [I3]`);
      if (after.tray !== trayBefore)
        await flag('slow-drag-graded', `slow drag of ${centre} changed tray "${trayBefore}" -> "${after.tray}" [I3/I7]`);
      if (after.bloomCentre !== centre)
        await flag('tether-broken-by-drag', `constellation released by a slow drag of its centre (centre now ${after.bloomCentre ?? 'none'}) [I6]`);
    }
    const sat = await pickSat(walked, i % 3);
    if (!sat) { ok('no satellite for next hop'); break; }
    const r = await hop(sat.w);
    if (r.state !== 'ok') { if (r.state === 'dived') ok(`dived on ${sat.w} 2nd tap — recorded`); break; }
  }
  await assertWalkedAlive();
};

/* R3 — chain interleaved with water releases + fresh blooms */
recipes.R3_release_rebloom = async () => {
  await boot();
  curHop = 0; walked.length = 0;
  for (let cycle = 0; cycle < 3; cycle++) {
    const seed = await startBloom();
    if (!seed) break;
    for (let i = 0; i < 2; i++) {
      const sat = await pickSat(walked, (cycle + i) % 3);
      if (!sat) break;
      const r = await hop(sat.w);
      if (r.state !== 'ok') { if (r.state === 'dived') ok(`dived — recorded`); break; }
    }
    // deliberate water release
    const trayBefore = (await worldProbe()).tray;
    const spot = await waterTap();
    const after = await worldProbe();
    if (after.bloomCentre && spot.clear)
      await flag('water-release-failed', `clear water tap at (${spot.x},${spot.y}) did not release (centre=${after.bloomCentre}) [I6]`);
    if (after.tray !== trayBefore)
      await flag('water-tap-graded', `water tap changed tray "${trayBefore}" -> "${after.tray}" [I7]`);
    await assertWalkedAlive();
  }
};

/* R4 — taps DURING camera glide (deliberately unsettled) */
recipes.R4_glide_taps = async () => {
  await boot();
  curHop = 0; walked.length = 0;
  const seed = await startBloom();
  if (!seed) return;
  for (let i = 0; i < 5; i++) {
    // pick edge-most satellite to provoke a camera glide on re-centre
    const sat = await page.evaluate(`(() => {
      const sats = [...document.querySelectorAll('#drift-layer .word.bsat')].map((el) => {
        const r = el.getBoundingClientRect();
        return { w: el.querySelector('.base')?.textContent ?? '', x: r.left + r.width/2, y: r.top + r.height/2, r };
      }).filter((s) => s.w && s.r.width && s.x > 40 && s.x < 350 && s.y > 150 && s.y < 690);
      if (!sats.length) return null;
      const walked = new Set(${JSON.stringify(walked)});
      const free = sats.filter((s) => !walked.has(s.w));
      const pool = free.length ? free : sats;
      pool.sort((a, b) => Math.min(b.x, 390-b.x, b.y, 844-b.y) - Math.min(a.x, 390-a.x, a.y, 844-a.y));
      return pool[pool.length - 1]; // closest to an edge
    })()`);
    if (!sat) { ok('no edge satellite'); break; }
    // hop with NO settle-aiming: live-aim both taps while things may be moving
    const r = await hop(sat.w, { skipSettle: true });
    if (r.state === 'dived') { ok(`dived — recorded`); break; }
    if (r.state === 'lost') break;
    // immediately (glide likely in progress) tap the next satellite live-aimed
    await page.waitForTimeout(120);
    const quick = await pickSat(walked, 0);
    if (quick) {
      const trayBefore = (await worldProbe()).tray;
      const centreBefore = (await worldProbe()).bloomCentre;
      const live = await wordProbe(quick.w);
      if (live.exists && live.onScreen) {
        await tapAt(live.x, live.y);
        // measure how far the tap point was from the nearest member at impact
        const dist = await page.evaluate(`(() => {
          let d = 1e9;
          for (const el of document.querySelectorAll('#drift-layer .word.bctr, #drift-layer .word.bsat')) {
            const r = el.getBoundingClientRect();
            d = Math.min(d, Math.hypot(${live.x} - (r.left + r.width/2), ${live.y} - (r.top + r.height/2)));
          }
          return d;
        })()`);
        await page.waitForTimeout(700);
        const wAfter = await worldProbe();
        const sAfter = await wordProbe(quick.w);
        if (!sAfter.exists || sAfter.opacity < 0.05)
          await flag('glide-tap-vanished', `${quick.w} vanished from a tap during camera glide (tap ${dist.toFixed(0)}px from nearest member) [I3]`);
        if (wAfter.tray !== trayBefore)
          await flag('glide-tap-graded', `tap during glide changed tray "${trayBefore}" -> "${wAfter.tray}" [I7]`);
        if (!wAfter.bloomCentre && dist < 34 && !wAfter.depth)
          await flag('glide-tap-released', `tap during glide ${dist.toFixed(0)}px from a member (<44px) released the constellation (was ${centreBefore}) [I6]`);
      }
    }
  }
  await assertWalkedAlive();
};

/* R5 — re-tap the previous planet after re-centring on a satellite */
recipes.R5_retap_prev = async () => {
  await boot();
  curHop = 0; walked.length = 0;
  const seed = await startBloom();
  if (!seed) return;
  const sat = await pickSat(walked, 2);
  if (!sat) return;
  const r = await hop(sat.w);
  if (r.state !== 'ok') { ok(`hop to ${sat.w} -> ${r.state}; recipe ends`); return; }
  // previous planet `seed` is glossed; tap it once
  curHop++;
  const trayBefore = (await worldProbe()).tray;
  const p = await settleAim(seed);
  if (!p.exists) { await flag('prev-planet-gone', `previous planet ${seed} left the field after re-centre [I4]`); return; }
  if (!p.onScreen) { ok(`previous planet ${seed} glided offscreen (not flagged; still in DOM)`); return; }
  await tapAt(p.x, p.y);
  await page.waitForTimeout(900);
  let w = await worldProbe();
  let s = await wordProbe(seed);
  if (!s.exists || s.opacity < 0.05) { await flag('prev-retap-vanished', `${seed} vanished when re-tapped [I3]`); return; }
  if (w.tray !== trayBefore) await flag('prev-retap-graded', `re-tap of previous planet changed tray [I7]`);
  ok(`re-tap prev planet ${seed}: depth="${w.depth}" centre=${w.bloomCentre} (observed)`);
  if (w.depth) return; // dived — record via log; can't continue
  // tap it a second time — should re-centre back (the A->B->A walk)
  const p2 = await settleAim(seed);
  if (p2.exists && p2.onScreen) {
    await tapAt(p2.x, p2.y);
    await page.waitForTimeout(1400);
    w = await worldProbe();
    s = await wordProbe(seed);
    if (!s.exists || s.opacity < 0.05) { await flag('prev-retap2-vanished', `${seed} vanished on second re-tap [I3]`); return; }
    ok(`second re-tap of ${seed}: depth="${w.depth}" centre=${w.bloomCentre} sats=${w.sats} (observed)`);
    if (!w.depth && w.bloomCentre !== seed)
      await flag('walk-back-failed', `walking back to ${seed} did not re-centre (centre=${w.bloomCentre ?? 'none'}) [I4]`);
  }
};

/* R6 — A->B->A->B x6: state rot under revisits */
recipes.R6_ab_cycle = async () => {
  await boot();
  curHop = 0; walked.length = 0;
  const A = await startBloom();
  if (!A) return;
  const sat = await pickSat([A], 1);
  if (!sat) return;
  const B = sat.w;
  let r = await hop(B);
  if (r.state !== 'ok') { ok(`initial hop to B=${B} -> ${r.state}`); return; }
  let target = A;
  for (let i = 0; i < 10; i++) {
    curHop++;
    const trayBefore = (await worldProbe()).tray;
    const p = await settleAim(target);
    if (!p.exists) { await flag('ab-word-lost', `${target} left the DOM during A<->B cycling (iteration ${i}) [I4]`); return; }
    if (!p.onScreen) { ok(`${target} offscreen at iteration ${i}; panning back`);
      await dragAt(200, 420, 200 + (p.x < 195 ? 120 : -120), 420, 420); await page.waitForTimeout(800);
      continue;
    }
    await tapAt(p.x, p.y);
    await page.waitForTimeout(1200);
    const w = await worldProbe();
    const s = await wordProbe(target);
    if (!s.exists || s.opacity < 0.05) { await flag('ab-vanished', `${target} vanished on revisit tap (iteration ${i}) [I3/I4]`); return; }
    if (w.tray !== trayBefore) await flag('ab-graded', `revisit tap graded: tray "${trayBefore}" -> "${w.tray}" (iteration ${i}) [I7]`);
    if (w.depth) { ok(`revisit tap on ${target} dived at iteration ${i} (depth="${w.depth}") — observed, cycle ends`); return; }
    if (w.bloomCentre === target) {
      ok(`cycle ${i}: centre now ${target} (sats=${w.sats})`);
      if (w.sats < 1) await flag('ab-no-sats', `${target} re-centred with 0 satellites (iteration ${i}) [I2]`);
      target = target === A ? B : A;
    } else {
      // not yet centred (reveal stage) — tap again next loop on same target
      ok(`cycle ${i}: tap on ${target} did not centre (centre=${w.bloomCentre ?? 'none'}) — tapping again`);
    }
  }
  const a2 = await wordProbe(A); const b2 = await wordProbe(B);
  if (!a2.exists) await flag('ab-A-lost-final', `A=${A} missing after cycle [I4]`);
  if (!b2.exists) await flag('ab-B-lost-final', `B=${B} missing after cycle [I4]`);
};

/* R7 — chain, 10s true inactivity (release), chain again */
recipes.R7_inactivity = async () => {
  await boot();
  curHop = 0; walked.length = 0;
  const seed = await startBloom();
  if (!seed) return;
  for (let i = 0; i < 2; i++) {
    const sat = await pickSat(walked, i);
    if (!sat) break;
    const r = await hop(sat.w);
    if (r.state !== 'ok') { ok(`hop -> ${r.state}`); break; }
  }
  const wBefore = await worldProbe();
  if (wBefore.bloomCentre) {
    await page.waitForTimeout(11000); // true inactivity > 10s
    const wAfter = await worldProbe();
    if (wAfter.bloomCentre)
      await flag('inactivity-no-release', `constellation still held ${wAfter.bloomCentre} after 11s of true inactivity [I6]`);
    else ok('10s inactivity released the constellation');
    if (wAfter.tray !== wBefore.tray)
      await flag('inactivity-graded', `tray changed during inactivity "${wBefore.tray}" -> "${wAfter.tray}" [I7]`);
    await assertWalkedAlive();
  }
  // chain again on a fresh word
  const seed2 = await startBloom();
  if (!seed2) { ok('no fresh word for the second chain'); return; }
  const sat2 = await pickSat(walked, 2);
  if (sat2) {
    const r2 = await hop(sat2.w);
    if (r2.state === 'ok') ok('chain resumed cleanly after inactivity release');
    else ok(`post-release hop -> ${r2.state}`);
  }
  await assertWalkedAlive();
};

/* R8 — pointercancel injected mid-chain, then keep chaining */
recipes.R8_cancel_mid_chain = async () => {
  await boot();
  curHop = 0; walked.length = 0;
  const seed = await startBloom();
  if (!seed) return;
  for (let i = 0; i < 3; i++) {
    const sat = await pickSat(walked, i);
    if (!sat) break;
    // start a touch on the satellite, then cancel it
    const p = await settleAim(sat.w);
    if (!p.exists || !p.onScreen) break;
    const trayBefore = (await worldProbe()).tray;
    await touch('touchStart', [[p.x, p.y]]);
    await page.waitForTimeout(140);
    await touch('touchCancel', []);
    await page.waitForTimeout(300);
    const wc = await worldProbe();
    const sc = await wordProbe(sat.w);
    if (!sc.exists || sc.opacity < 0.05) { await flag('cancel-destroyed', `${sat.w} destroyed by touchcancel [I3/I8]`); break; }
    if (wc.tray !== trayBefore) await flag('cancel-graded', `touchcancel graded: "${trayBefore}" -> "${wc.tray}" [I7/I8]`);
    if (Math.hypot((sc.x ?? 0) - p.x, (sc.y ?? 0) - p.y) > 60)
      await flag('cancel-teleport', `${sat.w} teleported ${Math.hypot(sc.x - p.x, sc.y - p.y).toFixed(0)}px on touchcancel [I8]`);
    // now the real hop must still work cleanly
    const r = await hop(sat.w);
    if (r.state === 'dived') { ok('dived — recorded'); break; }
    if (r.state === 'lost') { await flag('post-cancel-hop-broken', `hop on ${sat.w} failed right after a pointercancel [I8]`); break; }
  }
  await assertWalkedAlive();
};

/* R9 — deliberate flick mid-chain: tray must change exactly then, chain continues */
recipes.R9_flick_then_chain = async () => {
  await boot();
  curHop = 0; walked.length = 0;
  const seed = await startBloom();
  if (!seed) return;
  const s1 = await pickSat(walked, 0);
  if (!s1) return;
  const r1 = await hop(s1.w);
  if (r1.state !== 'ok') { ok(`setup hop -> ${r1.state}`); return; }
  // deliberate fast horizontal flick on the held planet (the centre)
  curHop++;
  const centre = (await worldProbe()).bloomCentre;
  const trayBefore = (await worldProbe()).tray;
  const c = await settleAim(centre);
  if (!c.exists || !c.onScreen) return;
  await dragAt(c.x, c.y, c.x + 100, c.y, 80, 3); // ~1.25 px/ms, well over 0.45
  await page.waitForTimeout(1100);
  const wf = await worldProbe();
  if (wf.tray === trayBefore)
    await flag('deliberate-flick-ignored', `fast flick on held planet ${centre} did not grade (tray unchanged "${trayBefore}") [I3/I7]`);
  else ok(`deliberate flick graded ${centre}: tray "${trayBefore}" -> "${wf.tray}"`);
  // chain must continue from a fresh bloom
  const seed2 = await startBloom();
  if (!seed2) { ok('no fresh word after flick'); return; }
  const s2 = await pickSat(walked, 1);
  if (s2) {
    const r2 = await hop(s2.w);
    ok(`post-flick hop -> ${r2.state}`);
  }
};

/* ------------------------------------------------------------------ run */
for (const [name, fn] of Object.entries(recipes)) {
  if (only && !only.has(name.split('_')[0])) continue;
  curRecipe = name; curHop = 0;
  console.log(`\n== ${name} ==`);
  try { await fn(); } catch (e) { console.log(` xx [${name}] probe error: ${e.message}`); }
}

console.log(`\n==== chain endurance: ${totalHops} hops · ${violations.length} violations · ${pageErrors.length} page errors ====`);
for (const v of violations) console.log(`  ${v.shot}  [${v.recipe} h${v.hop}] ${v.kind} — ${v.detail}`);
for (const e of pageErrors) console.log(`  PAGEERROR [${e.where}] ${e.msg}`);
await browser.close();
server.close();
process.exit(0);
