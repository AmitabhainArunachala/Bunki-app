#!/usr/bin/env node
/** The ear on the new first screen, the sky (宙, sky/mount.mjs), at John's window, 1728 x 1117: the re-check's N1 and K5
 * (fix round 2, 2026-11-11). Brought to the engine's version 3 (2026-11-12): the sky now also stands at phone size, so
 * --width 390 runs the cases a finger can make (look, armed, off's tap); the rule for the word under a point is
 * version 3's (no W.hz: the largest drawn word wins, a grammar sign overhead before any word); the eye is W.cam and
 * W.tgt (version 1's S.cam stays at 0); the base the off case compares with serves the line's own version 3 mount
 * (--sky-base), because the old base's mount was written for version 1's engine. The sky draws its words in WebGL; headless Chromium on this Mac draws it on the graphics
 * card with --use-angle=metal --enable-gpu (the reviewer's fr1-sky-probe.mjs), and ?sky=1 gets past the mount's check
 * for a driven browser. A browser that cannot draw it keeps the old first screen: every case then says so and fails.
 *
 *   look    K5: the mark at rest beside the gate, cropped; the glyph's contrast on what stands behind it, measured
 *   armed   an armed tap on a sky word: asked once, as the word's reading; the sky does not open it; the ear goes off;
 *           nothing written to his record (every IndexedDB row, every localStorage key), the screen where it was
 *   option  ear off, Option-click on a sky word: asked once; the sky does not act
 *   held    held on: the pointer resting on a sky word asks for it; a click on another word is the sky's (it opens)
 *   off     ear off and no Option key: a click on a word, a drag and a rest, once as this head serves the sky and once
 *           with the four files this round changed (sky/mount.mjs, modules/ear.mjs, voice-layer.mjs, voice-seam.mjs)
 *           served from --base: the same word opens, the drag moves the sky, the rest wakes the word, no event is
 *           prevented, the same events reach the sky in the same order, and nothing is asked of the voice
 *
 * Silent: the review's harness (review-ear/lib.mjs): Chromium with --mute-audio, or headless WebKit; media forced muted,
 * the device voice swallowed, the local stand-in voice server, nothing but this machine reached.
 *
 *   REVIEW_BASE=http://127.0.0.1:19481/ node prototypes/corridor/tools/ear-sky.mjs [--engine chromium|webkit]
 *        [--width 1728|390] [--cases look,armed,option,held,off] [--voice-port 19482] [--base <commit>]
 *        [--sky-base <commit>] [--out DIR]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arg, earMark, earState, holdOn, open, reporter } from './review-ear/lib.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const { PNG } = require('pngjs');
const REPO = new URL('../../../', import.meta.url).pathname;

const ENGINE = arg('--engine', 'chromium');
const CASES = arg('--cases', 'look,armed,option,held,off').split(',');
const BASE = arg('--base', '7a7715f784c9f19db4658388b6e7d87c1d8fb8e3');
const SKY_BASE = arg('--sky-base', 'bf0e89e0c0c3ddf2d222ecb6de704a2dad4807cd');
const OUT = arg('--out', process.env.REVIEW_OUT || '.');
const WIDTH = Number(arg('--width', '1728'));
const PHONE = WIDTH < 700;
const tag = `${ENGINE}-${WIDTH}`;
const { rows, record } = reporter(tag);
const ALLOWED = new Set(['ls:kairo-voice-day']);
// The combine (voice/speech-lane-all-20261111): the offline clips (B3) keep every clip the server makes in the device's own
// database (bunki-voice-clips-v<n>): that is the voice's store, not the learner's record, so a write there is allowed; and a
// word said once plays from it the next time with no request, so each case that counts one request says a word not said yet.
const keptClips = (key) => /^idb:bunki-voice-clips-v\d+(\/|$)/u.test(key);
const said = [];
const s = await open({ engine: ENGINE, width: WIDTH, clipSeconds: () => 1, voicePort: Number(arg('--voice-port', '19532')),
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const { page, fake } = s;

const toSky = async () => {
  await s.ready('sky=1');
  await page.waitForFunction(() => ['mounted', 'gave-back', 'off', 'stood-down'].includes(window.__bunkiSkyApp?.state), null, { timeout: 45000 });
  const app = await page.evaluate(() => ({ ...window.__bunkiSkyApp }));
  if (app.state !== 'mounted') throw new Error(`the sky did not mount here: ${JSON.stringify(app)}`);
  await page.waitForFunction(() => window.__SKY__?.W?.ready && window.__SKY__.W.fonts && window.__SKY__.W.hits.length > (innerWidth < 700 ? 8 : 20), null, { timeout: 45000 });
  await s.sleep(2500);
  return app;
};
/** Words the sky drew in plain view, clear of the bars, largest first: where they stand now (CSS px), and their reading
 * as the mount gives it to the ear. */
const skyWords = () => page.evaluate(() => {
  const W = window.__SKY__.W, r = window.__SKY__.wrap.getBoundingClientRect();
  return W.hits.map((i) => ({ i, word: W.D.words[i][0], reading: W.rd[i], x: r.left + W.vis[i * 5], y: r.top + W.vis[i * 5 + 1], h: W.vis[i * 5 + 2] }))
    .filter((w) => w.y > 160 && w.y < innerHeight - 220 && w.x > Math.min(200, innerWidth * 0.15) && w.x < innerWidth - Math.min(200, innerWidth * 0.15) && w.h > (innerWidth < 700 ? 14 : 18) && /\p{Script=Han}/u.test(w.word))
    .sort((a, b) => b.h - a.h);
});
/** The word under a point as the engine's own tap picks it in the drifting field (sky-world.js pick, version 3, a
 * mouse's 5 px or a finger's 14), worked out here and not asked of the mount under test: nothing while a family is
 * open or from above, a grammar sign overhead before any word, then the largest drawn word. */
const skyAt = (x, y) => page.evaluate(({ x, y, slop }) => {
  const sky = window.__SKY__, W = sky.W, r = sky.wrap.getBoundingClientRect(), px = x - r.left, py = y - r.top;
  if (W.web?.isOpen?.() || sky.S.view.over > 0.3) return null;
  for (const h of W.gHits) if (h.i >= 0 && Math.abs(px - h.x) <= h.w / 2 + slop && Math.abs(py - h.y) <= h.s * 0.7 + slop) return { text: `grammar ${h.i}` };
  let best = -1, size = -Infinity;
  for (const i of W.hits) {
    const o = i * 5;
    if (Math.abs(px - W.vis[o]) <= W.vis[o + 4] / 2 + slop && Math.abs(py - W.vis[o + 1]) <= W.vis[o + 2] * 0.62 + slop && W.vis[o + 2] > size) { size = W.vis[o + 2]; best = i; }
  }
  return best >= 0 ? { text: W.D.words[best][0] } : null;
}, { x, y, slop: PHONE ? 14 : 5 });
/** A finger's tap at phone size, a mouse's click on the Mac. */
const tapAt = (x, y) => (PHONE ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
const webOpen = () => page.evaluate(() => {
  const W = window.__SKY__?.W, web = W?.web;
  return web?.isOpen?.() ? (web.cur.kind === 'w' ? W.D.words[web.cur.id][0] : `${web.cur.kind}${web.cur.id}`) : null;
});
const where = () => page.evaluate(() => ({ view: document.body.dataset.view || '', url: location.href, sky: window.__bunkiSkyApp?.state || '',
  sheet: !!document.getElementById('sheet')?.getClientRects().length && getComputedStyle(document.getElementById('sheet')).visibility !== 'hidden',
  web: window.__SKY__?.W?.web?.isOpen?.() ? 'open' : 'closed' }));
/** Every row of every IndexedDB database of the page, and every localStorage key (as ear-armed-record.mjs reads it). */
const readRecord = () => page.evaluate(async () => {
  const out = {};
  for (let i = 0; i < localStorage.length; i += 1) { const key = localStorage.key(i); out[`ls:${key}`] = localStorage.getItem(key); }
  const names = typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((d) => d.name).filter(Boolean) : [];
  const text = (value) => { try { return JSON.stringify(value, (k, v) => (v instanceof Blob ? `blob:${v.size}:${v.type}` : v instanceof ArrayBuffer ? `bytes:${v.byteLength}` : v)); } catch { return String(value); } };
  for (const name of names) {
    await new Promise((done) => {
      const request = indexedDB.open(name);
      request.onerror = () => { out[`idb:${name}`] = 'unreadable'; done(); };
      request.onupgradeneeded = () => { request.transaction.abort(); };
      request.onsuccess = () => {
        const db = request.result;
        const stores = [...db.objectStoreNames];
        if (!stores.length) { db.close(); done(); return; }
        const tx = db.transaction(stores, 'readonly');
        let left = stores.length;
        for (const store of stores) {
          const all = tx.objectStore(store).getAll();
          const keys = tx.objectStore(store).getAllKeys();
          keys.onsuccess = () => { out[`idb:${name}/${store}`] = text({ keys: keys.result, rows: all.result }); if (--left === 0) { db.close(); done(); } };
          keys.onerror = () => { out[`idb:${name}/${store}`] = 'unreadable'; if (--left === 0) { db.close(); done(); } };
        }
      };
    });
  }
  return out;
});
const sayable = (reading) => String(reading || '').split(/[;；]/u)[0].replace(/[(（][^)）]*[)）]/gu, '').replace(/[～〜~]/gu, '').trim();
/** The cases that need a Mac's mouse or keyboard (Option-click, a resting pointer, a mouse drag) are not run at phone
 * size: they are named as skipped, never counted as passed. */
const MAC_ONLY = new Set(['option', 'held', 'off']);
async function run(name, body) {
  if (!CASES.includes(name)) return;
  if (PHONE && MAC_ONLY.has(name)) { console.log(`SKIP  ${tag} · ${name}: needs a Mac's mouse or keyboard; not run at phone size`); return; }
  try { await body(); } catch (error) {
    record(`${name}: the case ran to its end`, [String(error.message).split('\n')[0].slice(0, 220)]);
    await page.screenshot({ path: `${OUT}/ear-sky-${tag}-${name}-error.png` }).catch(() => {});
  }
}
/** A word in plain view that the sky would pick at its own centre (no nearer word over it). */
async function cleanWord(skip = []) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    for (const w of await skyWords()) {
      if (skip.includes(w.word)) continue;
      const at = await skyAt(w.x, w.y);
      if (at && at.text === w.word) return w;
    }
    await s.sleep(300);
  }
  throw new Error('no sky word stands clear in plain view');
}

/* ------------------------------------------------------------------ K5: the mark at rest, measured */
function luminance([r, g, b]) {
  const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
await run('look', async () => {
  await toSky();
  const box = await page.evaluate(() => {
    const spot = document.querySelector('#ginga-symbol + .ear-spot .ear-mark');
    const r = spot.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, ear: document.documentElement.dataset.ear };
  });
  const clip = { x: Math.max(0, box.x - 70), y: Math.max(0, box.y - 6), width: box.w + 140, height: box.h + 12 };
  const shot = await page.screenshot({ clip });
  writeFileSync(`${OUT}/ear-sky-mark-${tag}.png`, shot);
  const full = await page.screenshot({ clip: { x: Math.max(0, clip.x - 300), y: 0, width: Math.min(760, WIDTH - Math.max(0, clip.x - 300)), height: 160 } });
  writeFileSync(`${OUT}/ear-sky-mark-wide-${tag}.png`, full);
  // inside the mark: its glyph is the inner 16 x 16 px; its ground the ring between the glyph and the hairline box
  // a seal's glyph against its own ground: inside the seal, the inner 16 x 16 px hold the glyph; the ring between the
  // glyph and the seal's hairline box is its ground. The gate beside it is measured the same way, for comparison.
  const measure = async (selector) => {
    const r = await page.evaluate((sel) => { const el = document.querySelector(sel); const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, selector);
    const png = PNG.sync.read(await page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } }));
    const px = (x, y) => { const o = (Math.round(y) * png.width + Math.round(x)) * 4; return [png.data[o], png.data[o + 1], png.data[o + 2]]; };
    const cx = r.w / 2, cy = r.h / 2, glyph = [], ground = [];
    for (let y = -8; y <= 8; y += 1) for (let x = -8; x <= 8; x += 1) glyph.push(px(cx + x, cy + y));
    for (let y = -13; y <= 13; y += 1) for (let x = -13; x <= 13; x += 1) if (Math.max(Math.abs(x), Math.abs(y)) >= 11) ground.push(px(cx + x, cy + y));
    const byLum = (list) => list.map((c) => [luminance(c), c]).sort((a, b) => a[0] - b[0]);
    const g = byLum(ground), groundMid = g[Math.floor(g.length / 2)][1], mid = luminance(groundMid);
    // the glyph's strokes: the pixel of its box furthest from the ground's own brightness
    const ink = byLum(glyph).reduce((best, cur) => (Math.abs(cur[0] - mid) > Math.abs(best[0] - mid) ? cur : best))[1];
    return { ink, ground: groundMid, contrast: ratio(ink, groundMid) };
  };
  const mark = await measure('#ginga-symbol + .ear-spot .ear-mark');
  const gate = await measure('#ginga-symbol');
  const show = (m) => `rgb(${m.ink.join(',')}) on rgb(${m.ground.join(',')}): ${m.contrast.toFixed(2)}:1`;
  record('K5: the mark at rest on the sky stands out from its ground (glyph against ground, 3:1 or more)', mark.contrast >= 3 ? [] : [`contrast ${mark.contrast.toFixed(2)}`],
    `ear ${box.ear}; the mark ${show(mark)}; the gate beside it ${show(gate)}; pictures ear-sky-mark-${tag}.png, ear-sky-mark-wide-${tag}.png`);
});

/* ------------------------------------------------------------------ N1: armed, Option, held */
await run('armed', async () => {
  await toSky();
  await s.press(await earMark(page));
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
  const before = await readRecord();
  const was = await where();
  const n = fake.speaks().length;
  const w = await cleanWord(said);
  said.push(w.word);
  await tapAt(w.x, w.y);
  await s.sleep(1600);
  const asked = fake.speaks().slice(n);
  const after = await readRecord();
  const now = await where();
  const opened = await webOpen();
  const ear = await earState(page);
  await page.screenshot({ path: `${OUT}/ear-sky-armed-${tag}.png` });
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]);
  const written = changed.filter((key) => !ALLOWED.has(key) && !keptClips(key));
  const moved = Object.keys(was).filter((key) => was[key] !== now[key]);
  const want = sayable(w.reading) || w.word;
  const problems = [];
  if (asked.length !== 1) problems.push(`${asked.length} requests, not 1`);
  else if (asked[0].text !== want) problems.push(`asked "${asked[0].text}", not the word's reading "${want}"`);
  if (opened) problems.push(`the sky opened ${opened}`);
  if (ear === 'armed') problems.push('the ear is still armed');
  if (written.length) problems.push(`written to the record: ${written.join(', ')}`);
  if (moved.length) problems.push(`the screen moved: ${moved.map((k) => `${k} ${JSON.stringify(was[k])} → ${JSON.stringify(now[k])}`).join(', ')}`);
  record('armed: a tap on a sky word speaks its reading and does nothing else; nothing written, nothing moved', problems,
    `"${w.word}"; asked ${asked.map((r) => `${r.voiceKey} "${r.text}"`).join(', ') || 'nothing'}; sky opened ${opened}; ear ${ear}; record keys ${Object.keys(after).length}, changed ${changed.join(', ') || 'none'}`);
});

await run('option', async () => {
  await toSky();
  const n = fake.speaks().length;
  const w = await cleanWord(said);
  said.push(w.word);
  await page.keyboard.down('Alt');
  await page.mouse.click(w.x, w.y);
  await page.keyboard.up('Alt');
  await s.sleep(1500);
  const asked = fake.speaks().slice(n);
  const opened = await webOpen();
  const want = sayable(w.reading) || w.word;
  record('ear off, Option-click on a sky word: speaks it, and the sky does not act', [...(asked.length === 1 ? [] : [`${asked.length} requests`]),
    ...(asked[0] && asked[0].text !== want ? [`asked "${asked[0].text}", not "${want}"`] : []), ...(opened ? [`the sky opened ${opened}`] : [])],
    `"${w.word}"; asked ${asked.map((r) => `"${r.text}"`).join(', ') || 'nothing'}; sky opened ${opened}; ear ${await earState(page)}`);
});

await run('held', async () => {
  await toSky();
  await holdOn(s);
  const n = fake.speaks().length;
  const a = await cleanWord(said);
  said.push(a.word);
  await page.mouse.move(a.x, a.y, { steps: 6 });
  await s.sleep(900);
  const rested = fake.speaks().slice(n);
  const m = fake.speaks().length;
  const b = await cleanWord([...said]);
  await page.mouse.move(b.x, b.y, { steps: 2 });
  await page.mouse.click(b.x, b.y);
  await s.sleep(900);
  const clicked = fake.speaks().slice(m);
  const opened = await webOpen();
  const want = sayable(a.reading) || a.word;
  record('held on, on the Mac: resting the pointer on a sky word speaks it', rested.length === 1 && rested[0].text === want ? [] : [`asked ${rested.map((r) => `"${r.text}"`).join(', ') || 'nothing'}, not "${want}" once`],
    `"${a.word}"; asked ${rested.map((r) => `"${r.text}"`).join(', ') || 'nothing'}; ear ${await earState(page)}`);
  record('held on, on the Mac: a click on a sky word acts as usual (the sky opens it), and asks nothing', [...(opened ? [] : ['the sky did not open the word']), ...(clicked.length ? [`${clicked.length} requests`] : [])],
    `"${b.word}"; sky opened ${opened}; asked ${clicked.map((r) => `"${r.text}"`).join(', ') || 'nothing'}`);
  await page.keyboard.press('Escape');
  await s.sleep(600);
});

/* ------------------------------------------------------------------ ear off: the sky as without the ear */
// the base: the ear's modules as they were before the round (--base), and the sky's mount as the line has it for the
// engine's version 3, with no ear in it (--sky-base): the base's own mount was written for version 1's engine
const BASE_FILES = { 'sky/mount.mjs': [SKY_BASE, 'prototypes/corridor/sky/mount.mjs'], 'modules/ear.mjs': [BASE, 'prototypes/corridor/modules/ear.mjs'],
  'modules/voice-layer.mjs': [BASE, 'prototypes/corridor/modules/voice-layer.mjs'], 'modules/voice-seam.mjs': [BASE, 'prototypes/corridor/modules/voice-seam.mjs'] };
async function sequence(label) {
  await toSky();
  const wrapped = await page.evaluate(() => String(window.__SKY__.W.web.tap).includes('earTakes'));
  const ear = await earState(page);
  await page.evaluate(() => {
    const wrap = document.getElementById('bunki-sky').shadowRoot.querySelector('.sky');
    window.__seen = { events: [], moves: 0, prevented: 0 };
    for (const type of ['pointerdown', 'pointerup', 'click', 'pointermove', 'pointercancel'])
      wrap.addEventListener(type, (event) => {
        if (event.defaultPrevented) window.__seen.prevented += 1;
        if (type === 'pointermove') window.__seen.moves += 1; else window.__seen.events.push(type);
      });
  });
  const n = fake.speaks().length;
  // where the eye looks, in thousandths of a radian round the ring (version 3: W.cam.a and W.tgt.yaw; S.cam is version 1's)
  const W = () => page.evaluate(() => ({ x: 1000 * (window.__SKY__.W.cam.a + window.__SKY__.W.tgt.yaw), hover: window.__SKY__.W.hoverKey || '' }));
  // a click on a word
  const w = await cleanWord();
  await page.mouse.click(w.x, w.y);
  await s.sleep(900);
  const opened = await webOpen();
  await page.keyboard.press('Escape');
  await s.sleep(1400);
  const closed = !(await webOpen());
  // a drag across the sky, 240 px to the left
  const x0 = 864, y0 = 420;
  await page.mouse.move(x0, y0);
  const c0 = (await W()).x;
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) { await page.mouse.move(x0 - i * 20, y0); await s.sleep(16); }
  await page.mouse.up();
  const c1 = (await W()).x;
  const afterDrag = await webOpen();
  await s.sleep(1500);
  // a rest on a word
  const r = await cleanWord();
  await page.mouse.move(r.x, r.y, { steps: 4 });
  await s.sleep(900);
  const hover = (await W()).hover;
  const tip = await page.evaluate(() => document.getElementById('bunki-sky').shadowRoot.querySelector('.tip')?.style.opacity || '');
  const seen = await page.evaluate(() => window.__seen);
  return { label, wrapped, ear, word: w.word, opened, closed, drag: Math.round(c1 - c0), afterDrag, rest: r.word, hover, wantHover: `w:${r.i}`, tip, seen, asked: fake.speaks().length - n };
}
await run('off', async () => {
  const served = await sequence('this head');
  const contents = Object.fromEntries(Object.entries(BASE_FILES).map(([url, [commit, path]]) => [url, execFileSync('git', ['-C', REPO, 'show', `${commit}:${path}`], { encoding: 'utf8' })]));
  for (const [url, body] of Object.entries(contents))
    await s.context.route(`**/${url}`, (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body }));
  const base = await sequence(`the base ${BASE.slice(0, 9)} with the line's mount ${SKY_BASE.slice(0, 9)}`);
  for (const url of Object.keys(contents)) await s.context.unroute(`**/${url}`);
  const problems = [];
  if (!served.wrapped) problems.push('this head does not ask the ear before the sky taps (the comparison would prove nothing)');
  if (base.wrapped) problems.push('the base run still serves this head’s mount');
  for (const run of [served, base]) {
    if (run.ear !== 'off') problems.push(`${run.label}: the ear is ${run.ear}`);
    if (run.opened !== run.word) problems.push(`${run.label}: a click on ${run.word} opened ${run.opened}`);
    if (!run.closed) problems.push(`${run.label}: Escape did not let the word go`);
    if (Math.abs(run.drag) < 60) problems.push(`${run.label}: the drag moved the sky by ${run.drag}`);
    if (run.afterDrag) problems.push(`${run.label}: the drag opened ${run.afterDrag}`);
    if (run.hover !== run.wantHover || run.tip !== '1') problems.push(`${run.label}: the rest on ${run.rest} woke ${run.hover || 'nothing'} (tip ${run.tip})`);
    if (run.seen.prevented) problems.push(`${run.label}: ${run.seen.prevented} events reached the sky already prevented`);
    if (run.asked) problems.push(`${run.label}: ${run.asked} requests`);
  }
  if (served.seen.events.join(' ') !== base.seen.events.join(' ')) problems.push(`the events differ: ${served.seen.events.join(' ')} | ${base.seen.events.join(' ')}`);
  const ratioDrag = served.drag / (base.drag || 1);
  if (!(ratioDrag > 0.6 && ratioDrag < 1.6)) problems.push(`the drags differ: ${served.drag} and ${base.drag}`);
  const show = (run) => `${run.label}: click ${run.word} → ${run.opened}; drag ${run.drag}; rest ${run.rest} → ${run.hover}; events ${run.seen.events.join(' ')} (+${run.seen.moves} moves); prevented ${run.seen.prevented}; asked ${run.asked}`;
  record('ear off, no Option key: the sky answers a click, a drag and a rest as it does without the ear', problems, `${show(served)} || ${show(base)}`);
});

await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
