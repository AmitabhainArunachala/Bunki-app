#!/usr/bin/env node
/** The voice controls' floors (the lead's ruling of 2026-11-12, after the print look came into the build): one language
 * of states, colours from the ground each control really stands on. In one look of the app, at one width, every voice
 * control in each of its states is shown, pictured and measured on its pixels:
 *   rest     a glyph at rest 3:1 or more against its own ground (the 耳 off and struck; a card's speaker, the word box's
 *            音, the play bar's mark at rest)
 *   active   a glyph armed, held on or speaking 4.5:1 or more against its own ground (the plate or the seal it stands on)
 *   seal     a seal (held on, speaking) 3:1 or more against what lies around it
 *   wait     a control waiting for its clip (the play button while a sentence loads) 3:1 or more
 *   text     a line of text 4.5:1 or more: the struck mark's line and the play bar's note when the voice cannot answer
 *   room     the struck mark's line inside the screen with 16 px on each side, under the bar (never over its controls)
 * The measure: the colour covering most of the control's inner square is its ground, the glyph pixel furthest from it its
 * ink; what lies around a seal is the colour covering most of a 6 px ring just outside the control. Exit 0 when every
 * floor holds and every step ran.
 *
 * Silent: the review harness (review-ear/lib.mjs: headless WebKit or Chromium with --mute-audio, media forced muted, the
 * device voice swallowed, Web Audio at gain 0), loopback only, the repository's stand-in voice server, paired through the
 * app's own Settings; 声 (said by itself) turned off so a control can be seen at rest.
 *
 *   REVIEW_BASE=http://127.0.0.1:19600/ node prototypes/corridor/tools/verify-voice-legibility.mjs --look sumi
 *        [--width 1728|390] [--engine webkit|chromium] [--out DIR] [--voice-port 19601] [--steps a,b]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arg, dismissFirstLine, earMark, earState, holdOn, open } from './review-ear/lib.mjs';
const require = createRequire(new URL('../../../package.json', import.meta.url));
const { PNG } = require('pngjs');

const LOOK = arg('--look', 'hokusai');
const WIDTH = Number(arg('--width', '1728'));
const PHONE = WIDTH < 700;
const OUT = `${arg('--out', '.')}/${WIDTH}/${LOOK}`;
const STEPS = arg('--steps', '');
const BY_SELF = arg('--by-self', 'off');
const ENGINE = arg('--engine', 'webkit');
mkdirSync(OUT, { recursive: true });
const rows = [];
let n = 0;
const s = await open({ engine: ENGINE, width: WIDTH, clipSeconds: () => 4, voicePort: Number(arg('--voice-port', '19601')) });
const { page, fake } = s;
await s.context.addInitScript((look) => { try { localStorage.setItem('kairo-theme', look); } catch { /* none */ } }, LOOK);
const plates = [];
page.on('request', (r) => { if (/\/print\/[^/]+\.webp$/u.test(r.url())) plates.push(r.url().split('/print/')[1]); });

function luminance([r, g, b]) { const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b); }
const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
/** A control's glyph against its own ground, from a picture of it (CSS pixels). The ground is the colour that covers
 * most of the control's inner square (a seal's fill, a plate, the paper behind an icon), counted in coarse buckets; the
 * ink is the pixel of the glyph's own square (the middle 72%) furthest in brightness from that ground. */
async function contrast(selector, ring0 = 0, ring1 = 6) {
  const r = await page.evaluate((sel) => { const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 4); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }, selector);
  if (!r || r.w < 6 || r.h < 6 || r.y < 0 || r.y + r.h > page.viewportSize().height) return null;
  const vp = page.viewportSize(), pad = ring1;
  const outer = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad) };
  outer.width = Math.min(vp.width - outer.x, r.w + 2 * pad); outer.height = Math.min(vp.height - outer.y, r.h + 2 * pad);
  const ring = PNG.sync.read(await page.screenshot({ clip: outer, scale: 'css' }));
  const rb = new Map();
  for (let y = 0; y < ring.height; y += 1) for (let x = 0; x < ring.width; x += 1) {
    const dx = Math.max(r.x - outer.x - x, x - (r.x - outer.x + r.w - 1), 0), dy = Math.max(r.y - outer.y - y, y - (r.y - outer.y + r.h - 1), 0);
    if (Math.max(dx, dy) <= ring0) continue;
    const o = (y * ring.width + x) * 4, c = [ring.data[o], ring.data[o + 1], ring.data[o + 2]], k = c.map((v) => v >> 4).join(',');
    const b = rb.get(k) || { n: 0, sum: [0, 0, 0] }; b.n += 1; b.sum = b.sum.map((v, i) => v + c[i]); rb.set(k, b);
  }
  const rtop = [...rb.values()].sort((a, b) => b.n - a.n)[0];
  const behind = rtop ? rtop.sum.map((v) => Math.round(v / rtop.n)) : null;
  const png = PNG.sync.read(await page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h }, scale: 'css' }));
  const px = (x, y) => { const xi = Math.max(0, Math.min(png.width - 1, Math.round(x))), yi = Math.max(0, Math.min(png.height - 1, Math.round(y))); const o = (yi * png.width + xi) * 4; return [png.data[o], png.data[o + 1], png.data[o + 2]]; };
  const cx = png.width / 2, cy = png.height / 2, half = Math.min(png.width, png.height) / 2, glyph = [], buckets = new Map();
  for (let y = -half; y <= half; y += 1) for (let x = -half; x <= half; x += 1) {
    const m = Math.max(Math.abs(x), Math.abs(y)), c = px(cx + x, cy + y);
    if (m <= 0.36 * half) glyph.push(c);
    if (m <= 0.66 * half) { const k = c.map((v) => v >> 4).join(','); const b = buckets.get(k) || { n: 0, sum: [0, 0, 0] }; b.n += 1; b.sum = b.sum.map((v, i) => v + c[i]); buckets.set(k, b); }
  }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0], groundC = top.sum.map((v) => Math.round(v / top.n)), gl = luminance(groundC);
  const ink = glyph.reduce((best, cur) => (Math.abs(luminance(cur) - gl) > Math.abs(luminance(best) - gl) ? cur : best));
  return { ratio: Number(ratio(ink, groundC).toFixed(2)), ink: `rgb(${ink.join(',')})`, ground: `rgb(${groundC.join(',')})`, groundShare: Number((top.n / [...buckets.values()].reduce((a, b) => a + b.n, 0)).toFixed(2)), box: `${Math.round(r.w)}x${Math.round(r.h)}`,
    behind: behind ? `rgb(${behind.join(',')})` : null, sealRatio: behind ? Number(ratio(groundC, behind).toFixed(2)) : null };
}
/** A line of text against its own box: the colour covering most of the box, and the text pixel furthest from it. */
async function textContrast(selector) {
  const r = await page.evaluate((sel) => { const el = [...document.querySelectorAll(sel)].find((e) => !e.hidden && e.getClientRects().length && e.textContent.trim()); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, right: b.right, vw: innerWidth }; }, selector);
  if (!r || r.w < 4 || r.h < 4) return null;
  const vp = page.viewportSize(), x = Math.max(0, r.x), y = Math.max(0, r.y);
  const png = PNG.sync.read(await page.screenshot({ clip: { x, y, width: Math.max(1, Math.min(vp.width - x, r.w)), height: Math.max(1, Math.min(vp.height - y, r.h)) }, scale: 'css' }));
  const buckets = new Map(), all = [];
  for (let i = 0; i < png.data.length; i += 4) { const c = [png.data[i], png.data[i + 1], png.data[i + 2]]; all.push(c); const k = c.map((v) => v >> 4).join(','); const b = buckets.get(k) || { n: 0, sum: [0, 0, 0] }; b.n += 1; b.sum = b.sum.map((v, j) => v + c[j]); buckets.set(k, b); }
  const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0], bg = top.sum.map((v) => Math.round(v / top.n)), gl = luminance(bg);
  const ink = all.reduce((best, cur) => (Math.abs(luminance(cur) - gl) > Math.abs(luminance(best) - gl) ? cur : best));
  return { ratio: Number(ratio(ink, bg).toFixed(2)), ink: `rgb(${ink.join(',')})`, ground: `rgb(${bg.join(',')})`, left: Math.round(r.x), right: Math.round(r.right), top: Math.round(r.y), width: Math.round(r.w), vw: r.vw };
}
/** One picture of the whole screen (JPEG, to keep the folder small) and, when a selector is given, a PNG of that control
 * with room round it, with what the page says about it. */
const FLOORS = { rest: 3, active: 4.5, seal: 3, wait: 3, text: 4.5 };
const floorRows = [];
function floor(name, what, value, need, detail = '') {
  const pass = value != null && value >= need;
  floorRows.push({ look: LOOK, width: WIDTH, name, what, value, need, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${LOOK} ${WIDTH} · ${name} · ${what}: ${value ?? 'not measured'} (floor ${need})${detail ? ` ${detail}` : ''}`);
}
async function shot(name, { sel = null, measure = null, note = '', kind = null, seal = false, ring = [0, 6] } = {}) {
  n += 1;
  const base = `${String(n).padStart(2, '0')}-${name}`;
  const row = { look: LOOK, width: WIDTH, n, name, file: `${base}.jpg`, ear: await earState(page).catch(() => ''), note };
  try { await page.screenshot({ path: `${OUT}/${base}.jpg`, type: 'jpeg', quality: 82 }); } catch (e) { row.error = String(e.message).slice(0, 120); }
  if (sel) {
    const box = await page.evaluate((s0) => { const el = [...document.querySelectorAll(s0)].find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 2); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, cut: b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight }; }, sel).catch(() => null);
    if (box) {
      const vp = page.viewportSize(), pad = 60, x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
      const clip = { x, y, width: Math.max(1, Math.min(vp.width - x, box.w + 2 * pad)), height: Math.max(1, Math.min(vp.height - y, box.h + 2 * pad)) };
      try { await page.screenshot({ path: `${OUT}/${base}-crop.png`, clip }); row.crop = `${base}-crop.png`; } catch { /* off screen */ }
      row.box = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h), cut: box.cut };
      // what stands over the control's centre: the control itself, or something covering it
      row.covered = await page.evaluate(({ s0, b }) => { const el = [...document.querySelectorAll(s0)].find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 2); const hit = document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2); return !el || !hit ? 'unknown' : el === hit || el.contains(hit) ? '' : `${hit.tagName.toLowerCase()}#${hit.id}.${String(hit.className).split(' ')[0]}`; }, { s0: sel, b: box }).catch(() => 'unknown');
    } else row.missing = true;
  }
  if (measure) row.contrast = await contrast(measure, ring[0], ring[1]).catch(() => null);
  if (kind) floor(name, `glyph (${kind})`, row.contrast?.ratio ?? null, FLOORS[kind], row.contrast ? `${row.contrast.ink} on ${row.contrast.ground}` : '');
  if (seal) floor(name, 'seal against what lies around it', row.contrast?.sealRatio ?? null, FLOORS.seal, row.contrast ? `${row.contrast.ground} on ${row.contrast.behind}` : '');
  rows.push(row);
  console.log(`SHOT ${LOOK} ${WIDTH} ${base}${row.missing ? ' (control not found)' : ''}${row.contrast ? ` contrast ${row.contrast.ratio}:1` : ''}${row.covered ? ` covered by ${row.covered}` : ''}`);
  return row;
}
const MARK = '.ear-mark[data-review-ear]';
async function markShot(where, state) {
  await earMark(page).catch(() => null);
  const active = ['armed', 'held', 'speaking'].includes(state);
  const row = await shot(`${where}-ear-${state}`, { sel: MARK, measure: MARK, kind: active ? 'active' : 'rest', seal: state === 'held' || state === 'speaking' });
  if (state === 'novoice') {
    const t = await textContrast('.ear-why');
    row.why = t;
    floor(`${where}-ear-novoice`, 'its line (text)', t?.ratio ?? null, FLOORS.text, t ? `${t.ink} on ${t.ground}` : 'no line shown');
    const mark = await page.evaluate(() => { const m = document.querySelector('.ear-mark[data-review-ear]'); const b = m?.getBoundingClientRect(); return b ? { bottom: b.bottom } : null; });
    const inside = t && t.left >= 16 && t.right <= t.vw - 16 && mark && t.top >= mark.bottom;
    floor(`${where}-ear-novoice`, 'its line inside the screen with 16 px a side, under the mark', inside ? 1 : 0, 1, t ? `left ${t.left}, right ${t.right} of ${t.vw}, top ${t.top} (mark bottom ${Math.round(mark?.bottom ?? -1)})` : 'no line');
  }
  return row;
}
const tapAt = (x, y) => (PHONE ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
async function step(name, body) {
  if (STEPS && !STEPS.split(',').includes(name)) return;
  try { await body(); } catch (error) { rows.push({ look: LOOK, width: WIDTH, name, error: String(error.message).split('\n')[0].slice(0, 200) }); console.log(`FAIL ${LOOK} ${WIDTH} ${name}: ${String(error.message).split('\n')[0].slice(0, 200)}`); await page.screenshot({ path: `${OUT}/error-${name}.jpg`, type: 'jpeg', quality: 70 }).catch(() => {}); }
}
const settle = (ms = 700) => s.sleep(ms);
const tab = async (id) => { if (!(await page.locator(`#tab-${id}`).isVisible().catch(() => false))) { await s.ready(); await s.press('#home-review').catch(() => {}); } await page.locator(`#tab-${id}`).waitFor(); await s.press(`#tab-${id}`); await settle(1100); };
const pref = (value) => page.evaluate(async (v) => { const m = await import('/corridor.js'); m.setWordPref('kairo-read-highlight-v1', 'readHighlight', Object.freeze(['on', 'off']), v); }, value);
/** For a moment the voice server refuses every new sentence (429, a one-second wait), as when its rate is used up: the
 * route answers for it, so nothing is left scripted afterwards. */
const ORIGIN = new URL(process.env.REVIEW_BASE).origin;
async function refuse(on) {
  if (on) await s.context.route('**/v1/audio/speak', (r) => (r.request().method() !== 'POST' ? r.continue() : r.fulfill({ status: 429, headers: { 'content-type': 'application/json', 'access-control-allow-origin': ORIGIN, 'access-control-expose-headers': 'Retry-After', 'retry-after': '1', 'cache-control': 'no-store' }, body: JSON.stringify({ error: 'request-rate-limit' }) })));
  else await s.context.unroute('**/v1/audio/speak');
}
const offEar = async () => { for (let i = 0; i < 3 && (await earState(page)) !== 'off'; i += 1) { if ((await earState(page)) === 'speaking') { await page.keyboard.press('Escape'); await settle(400); continue; } await s.press(await earMark(page)); await settle(400); } };

// 0 · the print look is on: the tone scale's variables exist on a page other than the first screen, the plates load,
// and turning the attribute off (a control, put back at once) takes them away
await step('print-on', async () => {
  await s.ready(); await dismissFirstLine(s); await tab('me');
  // 声 (a card's answer and an opened word said by themselves) is on by default; --by-self off turns it off, so a face's
  // own control can be seen at rest after a reveal
  if (BY_SELF !== 'default') await page.evaluate(async (v) => { const m = await import('/corridor.js'); m.setWordPref(m.WORD_VOICE_KEY, 'wordVoice', m.WORD_VOICE, v); }, BY_SELF);
  const on = await page.evaluate(() => {
    const read = () => ({ ground: getComputedStyle(document.body).getPropertyValue('--dp-ground').trim(), sheet: getComputedStyle(document.body).getPropertyValue('--dp-sheet').trim() });
    const html = document.documentElement, was = html.getAttribute('data-live-depth');
    const withIt = read(); html.setAttribute('data-live-depth', '0'); const without = read(); html.setAttribute('data-live-depth', was);
    return { attr: was, theme: html.getAttribute('data-theme') || '(hokusai)', view: document.body.dataset.view, designLayer: window.__bunkiLiveDepth === true, withIt, without };
  });
  rows.push({ look: LOOK, width: WIDTH, name: 'print-on', ...on, plates: [...new Set(plates)] });
  console.log(`PRINT ${LOOK} ${WIDTH} ${JSON.stringify(on)} plates ${[...new Set(plates)].join(',')}`);
});
// 1 · Settings: 筆と声 and "Highlight what is being read"
await step('settings', async () => {
  await page.locator('#me-settings').scrollIntoViewIfNeeded(); await s.press('#me-settings'); await settle(900);
  await page.locator('#settings-voice-server').first().scrollIntoViewIfNeeded(); await settle(400);
  await shot('settings-voice', { sel: '#settings-voice-server' });
  await page.locator('#settings-highlight').first().scrollIntoViewIfNeeded().catch(() => {}); await settle(400);
  await shot('settings-highlight', { sel: '#settings-highlight' });
});
// 2 · the ear on the sky
const skyWord = (skip) => page.evaluate((skip) => {
  const sky = window.__SKY__, W = sky.W, r = sky.wrap.getBoundingClientRect(), host = document.getElementById('bunki-sky');
  return W.hits.map((i) => ({ w: W.D.words[i][0], x: r.left + W.vis[i * 5], y: r.top + W.vis[i * 5 + 1], h: W.vis[i * 5 + 2] }))
    .filter((w) => !skip.includes(w.w) && w.y > 150 && w.y < innerHeight - 160 && w.x > 50 && w.x < innerWidth - 70 && w.h > 13 && /\p{Script=Han}/u.test(w.w) && host.earWordAt(w.x, w.y, { pointer: innerWidth < 700 ? 'touch' : 'mouse' })?.text === w.w)
    .sort((a, b) => b.h - a.h)[0] || null;
}, skip);
const said = [];
await step('sky', async () => {
  await s.ready('sky=1');
  await page.waitForFunction(() => window.__bunkiSkyApp?.state === 'mounted' && window.__SKY__?.W?.ready && window.__SKY__.W.hits.length > 8, null, { timeout: 45000 });
  await settle(2500); await dismissFirstLine(s);
  await markShot('sky', 'off');
  await s.press(await earMark(page)); await settle(400); await markShot('sky', 'armed');
  await s.press(await earMark(page)); await settle(400);
  await holdOn(s); await markShot('sky', 'held');
  await s.press(await earMark(page)); await settle(400);
  let w = await skyWord(said); if (w) said.push(w.w);
  await s.press(await earMark(page)); await settle(300);
  if (w) { await tapAt(w.x, w.y); await page.waitForFunction(() => document.documentElement.dataset.ear === 'speaking', null, { timeout: 5000 }).catch(() => {}); await settle(250); }
  await markShot('sky', 'speaking');
  await offEar(); await settle(4200);
});
// 3 · a reading page: the ear, the play bar, the sentence band, the word box, Save
const bar = '#listen-toggle';
const row = () => page.evaluate(() => document.querySelector('.listen-row')?.dataset.voiceState || '');
const tokAt = async (i) => { const t = page.locator('.reader .tok.content').nth(i); await t.evaluate((el) => el.scrollIntoView({ block: 'center' })); await settle(500); return t.boundingBox(); };
await step('reader-ear', async () => {
  await s.ready(); await dismissFirstLine(s);
  await s.press('#ginga-symbol'); await s.press('.bubble-shelf'); await page.locator('.shelf-open').first().waitFor();
  await s.press(page.locator('.shelf-open').first()); await page.locator('.reader .tok.content').first().waitFor(); await settle(1500);
  for (let i = 0; i < 3 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await settle(400); }
  await dismissFirstLine(s);
  await markShot('reader', 'off');
  await s.press(await earMark(page)); await settle(400);
  if (!PHONE) { const b = await tokAt(8); if (b) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await settle(500); } }
  await markShot('reader', 'armed');
  if (!PHONE) await page.mouse.move(4, 300);
  await s.press(await earMark(page)); await settle(400);
  await holdOn(s); await markShot('reader', 'held');
  const b = await tokAt(5);
  if (PHONE) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); else { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); }
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'speaking', null, { timeout: 6000 }).catch(() => {});
  await settle(250); await markShot('reader', 'speaking');
  if (!PHONE) await page.mouse.move(4, 300);
  await offEar(); await settle(4300); await offEar();
});
await step('play-bar', async () => {
  await page.evaluate(() => scrollTo(0, 0)); await settle(300);
  if (!(await page.locator(bar).isVisible().catch(() => false))) await s.press('#listen-open').catch(() => {});
  await page.locator(bar).waitFor(); await settle(400);
  await shot('playbar-idle', { sel: '.listen-row', measure: '#listen-open svg', ring: [7, 12], note: await row(), kind: 'rest' });
  s.holdSpeaks(() => true);
  await s.press(bar); await settle(900);
  await shot('playbar-loading', { sel: '.listen-row', measure: bar, note: await row(), kind: 'wait' });
  s.holdSpeaks(null); await s.releaseHeld();
  await page.waitForFunction(() => document.querySelector('#reader [data-speaking]'), null, { timeout: 15000 }).catch(() => {});
  await settle(500);
  await shot('playbar-playing', { sel: '.listen-row', measure: '#listen-open svg', ring: [7, 12], note: await row(), kind: 'active', seal: true });
  await shot('band-highlight-on', { sel: '#reader [data-speaking]', note: `lit words ${await page.evaluate(() => document.querySelectorAll('#reader .tok[data-speaking]').length)}` });
  await s.press(bar); await settle(700);
  await shot('playbar-paused', { sel: '.listen-row', measure: '#listen-open svg', ring: [7, 12], note: await row(), kind: 'rest' });
  await pref('off'); await settle(300);
  await s.press(bar); await page.waitForFunction(() => document.querySelector('.listen-row')?.dataset.voiceState === 'playing', null, { timeout: 15000 }).catch(() => {}); await settle(900);
  await shot('band-highlight-off', { sel: '#reader [data-speaking]', note: `state ${await row()}; bands drawn ${await page.evaluate(() => document.querySelectorAll('.read-band').length)}` });
  await s.press(bar); await settle(500); await pref('on');
});
/** A word's box in the reader for a word the dictionary holds (its Save enabled): the first such of these tokens. */
async function boxFor(indexes) {
  for (const index of indexes) {
    for (let i = 0; i < 3 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await settle(300); }
    const tok = page.locator('.reader .tok.content').nth(index);
    await tok.scrollIntoViewIfNeeded();
    for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await s.press(tok); await settle(500); }
    if (!(await page.locator('#mini').isVisible().catch(() => false))) continue;
    const ok = await page.evaluate(() => { const b = document.getElementById('mini-take'); return !!b && !b.disabled && !!document.getElementById('mini-voice'); });
    if (ok) return index;
  }
  throw new Error('no word box with Save and 音 among the tokens tried');
}
await step('word-box', async () => {
  if (!(await page.locator('.reader .tok.content').first().isVisible().catch(() => false))) {
    await s.ready(); await dismissFirstLine(s);
    await s.press('#ginga-symbol'); await s.press('.bubble-shelf'); await page.locator('.shelf-open').first().waitFor();
    await s.press(page.locator('.shelf-open').first()); await page.locator('.reader .tok.content').first().waitFor(); await settle(1500);
    await dismissFirstLine(s);
  }
  const used = await boxFor([0, 2, 6, 8, 10, 12]);
  await settle(500);
  await shot('wordbox-save-oto', { sel: '#mini', measure: '#mini-voice', kind: 'rest' });
  await s.press('#mini-voice'); await settle(500);
  await shot('wordbox-oto-speaking', { sel: '#mini-voice', measure: '#mini-voice', kind: 'active', seal: true, note: await page.evaluate(() => { const b = document.getElementById('mini-voice'); return `class "${b?.className}" aria-pressed ${b?.getAttribute('aria-pressed')} aria-busy ${b?.getAttribute('aria-busy')} data-voice-state ${b?.dataset.voiceState || ''}; ear ${document.documentElement.dataset.ear}; speaking anywhere ${!!document.querySelector('.is-speaking')}`; }) });
  await settle(3800);
  await s.press('#mini-take'); await page.locator('#vocabulary-list-popover').waitFor(); await settle(500);
  await shot('save-chooser', { sel: '#vocabulary-list-popover' });
  await s.press('#mini-review'); await settle(1200);
  await shot('save-saved-to-line', { sel: '.save-place-line', note: await page.evaluate(() => (document.querySelector('.save-place-line')?.innerText || '').replace(/\s+/gu, ' ').slice(0, 100)) });
  // a second word saved with its sentence, for the review card
  await boxFor([used + 6, used + 9, used + 12, used + 15]).catch(() => null);
  await s.press('#mini-take').catch(() => {}); await page.locator('#mini-review').waitFor({ timeout: 5000 }).catch(() => {}); await s.press('#mini-review').catch(() => {}); await settle(800);
  for (let i = 0; i < 3 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await settle(300); }
});
// 4 · the review card, the deck card, the kanji practice block
const speaker = async (name, sel) => {
  await shot(`${name}-rest`, { sel, measure: `${sel} svg`, ring: [7, 12], kind: 'rest', note: `speaking ${await page.evaluate((x) => !!document.querySelector(x)?.classList.contains('is-speaking'), sel)}` });
  await s.press(sel); await settle(500);
  await shot(`${name}-speaking`, { sel, measure: `${sel} svg`, ring: [7, 12], kind: 'active', seal: true, note: `speaking ${await page.evaluate((x) => !!document.querySelector(x)?.classList.contains('is-speaking'), sel)}` });
  await settle(4300);
};
await step('review-card', async () => {
  await tab('today'); await dismissFirstLine(s);
  await s.press('#review-start'); await page.locator('.review-face').first().waitFor(); await settle(1500);
  if (await page.locator('#card-say-front').count()) await speaker('review-question', '#card-say-front');
  else await shot('review-question-no-control', { note: 'this face has no question-side control' });
  await s.press('#reveal'); await page.locator('#card-say').waitFor(); await settle(1500);
  await speaker('review-answer', '#card-say');
});
await step('deck-card', async () => {
  await s.ready(); await tab('learn');
  await s.press('.learn-go-deck'); await page.locator('#kp-card').waitFor(); await settle(3000);
  if (await page.locator('#kp-listen-front').count()) await speaker('deck-question', '#kp-listen-front');
  else await shot('deck-question-no-control', { note: 'this face has no question-side control' });
  await s.press('#kp-reveal'); await settle(1800);
  await speaker('deck-answer', '#kp-listen-word');
});
await step('kanji-practice', async () => {
  await page.goto(`${process.env.REVIEW_BASE}?kanji=${encodeURIComponent('週')}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
  await page.locator('#sheet-take').waitFor(); await settle(600);
  await s.press('#sheet-take'); await page.locator('#mini-review').waitFor(); await s.press('#mini-review'); await settle(900);
  await s.ready(); await tab('learn');
  const mode = page.locator('.focus-mode', { hasText: /Kanji only|漢字だけ/ }).first();
  await mode.scrollIntoViewIfNeeded(); await s.press(mode); await settle(400);
  const start = page.locator('.focus-start').first(); await start.scrollIntoViewIfNeeded(); await s.press(start);
  await page.locator('.review-face').first().waitFor(); await settle(1500);
  if (await page.locator('#card-say-front').count()) await speaker('kanji-practice-question', '#card-say-front');
  else await shot('kanji-practice-no-control', { note: 'the face drawn has no control' });
});

// 5 · last, because a refused sentence makes the voice wait before it asks again: the voice server refusing every new
// sentence (429), on a second article (nothing of it kept on the device) and on the sky
await step('refusals', async () => {
  await s.ready(); await dismissFirstLine(s);
  await s.press('#ginga-symbol'); await s.press('.bubble-shelf'); await page.locator('.shelf-open').nth(1).waitFor();
  await s.press(page.locator('.shelf-open').nth(1)); await page.locator('.reader .tok.content').first().waitFor(); await settle(1500);
  for (let i = 0; i < 3 && (await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await page.keyboard.press('Escape'); await settle(400); }
  await dismissFirstLine(s);
  if (!(await page.locator(bar).isVisible().catch(() => false))) await s.press('#listen-open').catch(() => {});
  await page.locator(bar).waitFor(); await settle(300);
  await refuse(true);
  await s.press(bar); await settle(2500);
  await shot('playbar-failure', { sel: '.listen-row', measure: '#listen-open svg', ring: [7, 12], kind: 'rest', note: `${await row()}: ${await page.evaluate(() => (document.querySelector('.listen-row')?.innerText || '').replace(/\s+/gu, ' ').slice(0, 140))}` });
  { const t = await textContrast('#listen-note'); floor('playbar-failure', "the bar's note (text)", t?.ratio ?? null, FLOORS.text, t ? `${t.ink} on ${t.ground}` : 'no note'); }
  if (['playing', 'loading'].includes(await row())) await s.press(bar);
  await settle(800);
  await s.press(await earMark(page)); await settle(300);
  const c = await tokAt(20); await tapAt(c.x + c.width / 2, c.y + c.height / 2);
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'novoice', null, { timeout: 6000 }).catch(() => {});
  await settle(250); await markShot('reader', 'novoice');
  rows[rows.length - 1].why = await page.evaluate(() => { const w = [...document.querySelectorAll('.ear-why')].find((e) => !e.hidden && e.textContent); if (!w) return 'no line'; const r = w.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return `"${w.textContent.slice(0, 60)}" at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}; visible ${w.checkVisibility ? w.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : '?'}; on top ${!!hit && (hit === w || w.contains(hit))} (${hit ? hit.tagName.toLowerCase() + '.' + String(hit.className).split(' ')[0] : 'none'})`; });
  console.log(`WHY ${LOOK} ${WIDTH} reader: ${rows[rows.length - 1].why}`);
  await settle(4300); await offEar();
  await s.ready('sky=1');
  await page.waitForFunction(() => window.__bunkiSkyApp?.state === 'mounted' && window.__SKY__?.W?.ready && window.__SKY__.W.hits.length > 8, null, { timeout: 45000 });
  await settle(2500); await dismissFirstLine(s);
  const w = await skyWord(said);
  await s.press(await earMark(page)); await settle(300);
  if (w) { await tapAt(w.x, w.y); await page.waitForFunction(() => document.documentElement.dataset.ear === 'novoice', null, { timeout: 6000 }).catch(() => {}); await settle(250); }
  await markShot('sky', 'novoice');
  await refuse(false);
});

writeFileSync(`${OUT}/tour.json`, JSON.stringify({ look: LOOK, width: WIDTH, engine: ENGINE, errors: s.errors, offMachine: s.offMachine, rows, floors: floorRows }, null, 1));
await s.close();
const failed = rows.filter((r) => r.error).length, under = floorRows.filter((f) => !f.pass).length;
console.log(`${LOOK} ${WIDTH}: ${floorRows.length - under} of ${floorRows.length} floors hold, ${under} under; ${rows.filter((r) => r.file).length} pictures, ${failed} steps failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed || under ? 1 : 0);
