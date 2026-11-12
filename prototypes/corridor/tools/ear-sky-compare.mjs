#!/usr/bin/env node
/** The ear's word on the sky against the sky's own (2026-11-12, the engine's version 3). sky/mount.mjs answers the ear
 * with what stands under a point (host.earWordAt); the engine decides the same thing for its own tap (sky-world.js
 * onUp: pick(x, y, a finger's 14 px or a mouse's 5), handed to W.web.tap). This check taps the sky at sampled points
 * and, at the moment the engine hands its pick to W.web.tap, asks the mount about the same point: the two must name the
 * same thing (a word, a grammar sign, an item of an opened family) or both nothing.
 *
 * How the engine's own choice is seen: W.web.tap is replaced for the run by a spy that writes down the engine's pick
 * and the mount's answer, in the same frame, and does not act on the pick, so the sky's state stays for the next sample
 * (nothing opens, nothing closes). The taps are real input: a mouse click on the Mac, a finger's tap on a phone.
 *
 *   field     the drifting field, as it first stands
 *   grammar   looking up (the 文 seal's own W.lookUp): the grammar signs overhead
 *   word      a word opened (W.web.open): its characters, its family, its links
 *   kanji     a character opened: its parts and the words that carry it
 *   pattern   a grammar pattern opened: the pattern and its words
 *   above     the view from above (W.setOver): the engine picks nothing there; on the Mac the engine's own hover is read
 *             at each point (W.hoverKey, its pick with 4 px); on a phone the mount is asked at each point, and one real
 *             tap shows the engine leaves that view without asking its tap at all
 *
 * The points: the centres of what is drawn (words, signs, items), points just inside and just outside each one's reach,
 * and points spread evenly over the sky; a point where the app's own buttons or the sky's own controls stand over the
 * canvas is left out (the engine never sees a press there). What this cannot cover: the moment between a lift and its
 * click (ear-sky-lift.mjs), a drag (never a tap), the sky's keyboard buttons, and the 1 px between the engine's hover
 * reach (4 px) and its tap reach (5 px), which the mount answers as a tap would.
 *
 * Silent: the review's harness (review-ear/lib.mjs): Chromium with --mute-audio, or headless WebKit; media forced muted,
 * the device voice swallowed, the local stand-in voice server, nothing but this machine reached. Nothing is spoken: the
 * ear stays off and the voice is not paired.
 *
 *   REVIEW_BASE=http://127.0.0.1:19600/ node prototypes/corridor/tools/ear-sky-compare.mjs [--engine chromium|webkit]
 *        [--width 1728|390] [--ui bi|ja] [--samples 40] [--states field,grammar,word,kanji,pattern,above]
 *        [--voice-port 19601] [--out DIR]
 */
import { writeFileSync } from 'node:fs';
import { arg, open, reporter } from './review-ear/lib.mjs';

const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '1728'));
const UI = arg('--ui', 'bi');
const PHONE = WIDTH < 700;
const SAMPLES = Number(arg('--samples', PHONE ? '30' : '40'));
const STATES = arg('--states', 'field,grammar,word,kanji,pattern,above').split(',');
const OUT = arg('--out', process.env.REVIEW_OUT || '.');
const tag = `${ENGINE}-${WIDTH}-${UI}`;
const { rows, record } = reporter(tag);
const s = await open({ engine: ENGINE, width: WIDTH, ui: UI, touch: PHONE, pair: false, clipSeconds: () => 1,
  voicePort: Number(arg('--voice-port', '19601')), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const { page } = s;
const detail = {};

await s.ready('sky=1');
await page.waitForFunction(() => ['mounted', 'gave-back', 'off', 'stood-down'].includes(window.__bunkiSkyApp?.state), null, { timeout: 45000 });
const app = await page.evaluate(() => ({ ...window.__bunkiSkyApp }));
if (app.state !== 'mounted') {
  record('the sky mounts', [`state ${app.state}: ${app.reason || ''}`]);
} else {
  await page.waitForFunction(() => window.__SKY__?.W?.ready && window.__SKY__.W.fonts && window.__SKY__.W.hits.length > 10 && window.__SKY__.W.gram?.length, null, { timeout: 45000 });
  await s.sleep(2500);
  // the spy: the engine's own pick, and the mount's answer for the same point in the same frame; the pick is not acted on
  await page.evaluate(() => {
    const sky = window.__SKY__, W = sky.W, host = document.getElementById('bunki-sky');
    const idOf = (h) => (!h ? null : h.t === 'w' ? `w${h.i}` : h.t === 'g' ? `g${h.i}` : h.t === 'i' ? (h.item.kind === 'x' ? `x${h.item.text}` : `${h.item.kind}${h.item.id}`) : `?${h.t}`);
    window.__cmp = { log: [], idOf };
    W.web.tap = (h, e) => {
      let hook = null, threw = '';
      try { hook = host.earWordAt(e.clientX, e.clientY, { pointer: e.pointerType }); } catch (error) { threw = String(error && error.message || error).slice(0, 120); }
      window.__cmp.log.push({ type: e.type, x: e.clientX, y: e.clientY, pointer: e.pointerType, engine: idOf(h), hook: hook ? hook.id : null, said: hook ? hook.text : null, threw });
    };
  });
}

/** Points to sample in the present state: centres, reach edges, and an even spread; only where the canvas takes the press. */
const points = (n) => page.evaluate(({ n, slop }) => {
  const sky = window.__SKY__, W = sky.W, r = sky.wrap.getBoundingClientRect(), host = document.getElementById('bunki-sky');
  const canvas = host.shadowRoot.querySelector('canvas');
  const tabs = document.querySelector('#primary-tabs')?.getBoundingClientRect();
  const floor = Math.min(r.bottom, tabs && tabs.height ? tabs.top : r.bottom) - 4;
  const onCanvas = (x, y) => x > r.left + 2 && x < r.right - 2 && y > r.top + 64 && y < floor && document.elementFromPoint(x, y) === host && host.shadowRoot.elementFromPoint(x, y) === canvas;
  const things = [];
  if (W.web.isOpen()) for (const it of W.web.items.values()) { if (it.kind !== 'a' && it.a.x >= 0.5) things.push({ x: it.x.x, y: it.y.x, hw: it.w / 2, hh: it.s.x * 0.62 }); }
  else {
    for (const h of W.gHits) if (h.i >= 0) things.push({ x: h.x, y: h.y, hw: h.w / 2, hh: h.s * 0.7 });
    for (const i of W.hits) things.push({ x: W.vis[i * 5], y: W.vis[i * 5 + 1], hw: W.vis[i * 5 + 4] / 2, hh: W.vis[i * 5 + 2] * 0.62 });
  }
  let seed = 20261112; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const out = [], want = { centre: Math.round(n * 0.4), edge: Math.round(n * 0.2) };
  const shuffled = things.map((t) => [rnd(), t]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  for (const t of shuffled) { if (out.filter((p) => p.kind === 'centre').length >= want.centre) break; const x = r.left + t.x, y = r.top + t.y; if (onCanvas(x, y)) out.push({ kind: 'centre', x, y }); }
  for (const t of shuffled) {
    if (out.filter((p) => p.kind.startsWith('edge')).length >= want.edge) break;
    const side = rnd() < 0.5 ? -1 : 1, inside = rnd() < 0.5, d = t.hw + slop + (inside ? -1.5 : 2.5);
    const x = r.left + t.x + side * d, y = r.top + t.y + (rnd() - 0.5) * t.hh;
    if (onCanvas(x, y)) out.push({ kind: inside ? 'edge-in' : 'edge-out', x, y });
  }
  for (let k = 0; k < 400 && out.length < n; k += 1) { const x = r.left + 8 + rnd() * (r.width - 16), y = r.top + 70 + rnd() * (floor - r.top - 74); if (onCanvas(x, y)) out.push({ kind: 'spread', x, y }); }
  return out.slice(0, n).map((p) => ({ ...p, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
}, { n, slop: PHONE ? 14 : 5 });

async function tapAll(list) {
  const before = await page.evaluate(() => window.__cmp.log.length);
  const results = [];
  for (const p of list) {
    const n = await page.evaluate(() => window.__cmp.log.length);
    if (PHONE) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    await s.sleep(PHONE ? 140 : 90);
    const got = await page.evaluate((n) => window.__cmp.log.slice(n), n);
    results.push({ ...p, got });
  }
  return { results, logged: (await page.evaluate(() => window.__cmp.log.length)) - before };
}
function judge(state, results, { needNamed = 5 } = {}) {
  const problems = [], seen = results.filter((r) => r.got.length);
  let same = 0, named = 0;
  const wrong = [];
  for (const r of seen) {
    const g = r.got[r.got.length - 1];
    if (g.threw) { wrong.push(`${r.kind} ${r.x},${r.y}: the mount threw (${g.threw})`); continue; }
    if (g.engine === g.hook) { same += 1; if (g.engine) named += 1; } else wrong.push(`${r.kind} ${r.x},${r.y}: engine ${g.engine}, mount ${g.hook}`);
  }
  if (!seen.length) problems.push('no tap reached the engine');
  if (wrong.length) problems.push(`${wrong.length} differ: ${wrong.slice(0, 6).join('; ')}`);
  if (named < needNamed) problems.push(`only ${named} points named something (want ${needNamed} or more): the comparison would be empty`);
  const kinds = {}; for (const r of seen) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  detail[state] = { sampled: results.length, reachedEngine: seen.length, same, named, differ: wrong.length, kinds, wrong };
  record(`${state}: the mount names what the engine picks, at every sampled point`, problems,
    `${results.length} points, ${seen.length} reached the engine's tap, ${same} the same (${named} naming something, ${same - named} nothing), ${wrong.length} differ; ${JSON.stringify(kinds)}`);
}
const settle = (ms) => s.sleep(ms);
const shot = (name) => page.screenshot({ path: `${OUT}/ear-sky-compare-${tag}-${name}.png` }).catch(() => {});
async function run(state, body) {
  if (!STATES.includes(state) || app.state !== 'mounted') return;
  try { await body(); } catch (error) {
    record(`${state}: the case ran to its end`, [String(error.message).split('\n')[0].slice(0, 220)]);
    await shot(`${state}-error`);
  }
}
const reset = async () => {
  await page.evaluate(() => { const W = window.__SKY__.W; if (W.web.isOpen()) W.web.close(); if (W.tgt.ov > 0.5) W.setOver(false); W.resetView(); });
  await page.waitForFunction(() => window.__SKY__.S.view.over < 0.02 && !window.__SKY__.W.web.isOpen(), null, { timeout: 15000 });
  await settle(1800);
};

await run('field', async () => {
  await reset();
  await shot('field');
  judge('field', (await tapAll(await points(SAMPLES))).results);
});
await run('grammar', async () => {
  await reset();
  await page.evaluate(() => window.__SKY__.W.lookUp());
  await page.waitForFunction(() => window.__SKY__.W.gHits.filter((h) => h.i >= 0).length >= 4, null, { timeout: 15000 });
  await settle(1500);
  await shot('grammar');
  const list = await points(SAMPLES);
  const { results } = await tapAll(list);
  judge('grammar', results);
  const signs = results.filter((r) => r.got.some((g) => /^g/u.test(g.engine || ''))).length;
  record('grammar: some sampled points named a grammar sign, and the mount said its pattern', signs ? [] : ['no point named a grammar sign'],
    `${signs} points named a sign; said ${[...new Set(results.flatMap((r) => r.got.filter((g) => /^g/u.test(g.hook || '')).map((g) => g.said)))].slice(0, 5).join(' / ')}`);
});
async function opened(state, how) {
  await reset();
  const what = await page.evaluate(how);
  if (!what) throw new Error(`nothing to open for ${state}`);
  await page.waitForFunction(() => { const W = window.__SKY__.W; return W.web.isOpen() && [...W.web.items.values()].filter((it) => it.kind !== 'a' && it.a.x >= 0.5).length >= 3; }, null, { timeout: 15000 });
  await settle(1800);
  await shot(state);
  const { results } = await tapAll(await points(SAMPLES));
  const still = await page.evaluate(() => window.__SKY__.W.web.isOpen() && `${window.__SKY__.W.web.cur.kind}${window.__SKY__.W.web.cur.id}`);
  judge(state, results);
  record(`${state}: the run left the opened ${what} as it was (the spy acts on no pick)`, still === what ? [] : [`now ${still}`]);
}
await run('word', () => opened('word', () => {
  const sky = window.__SKY__, W = sky.W, r = sky.wrap.getBoundingClientRect();
  const i = W.hits.filter((k) => Array.from(W.D.words[k][0]).filter((c) => /\p{Script=Han}/u.test(c)).length >= 2 && W.vis[k * 5 + 1] > 60 && W.vis[k * 5 + 1] < r.height - 120)
    .sort((a, b) => W.vis[b * 5 + 2] - W.vis[a * 5 + 2])[0] ?? W.hits[0];
  if (i == null) return null;
  W.web.open('w', i);
  return `w${i}`;
}));
await run('kanji', () => opened('kanji', () => {
  const W = window.__SKY__.W, ki = W.D.kanji.findIndex((k) => k[5] && k[5].length >= 2 && W.fam[W.D.kanji.indexOf(k)]?.length >= 4);
  if (ki < 0) return null;
  W.web.open('k', ki);
  return `k${ki}`;
}));
await run('pattern', () => opened('pattern', () => {
  const W = window.__SKY__.W, g = W.gram.find((x) => x.words.length >= 3) || W.gram[0];
  if (!g) return null;
  W.web.open('g', g.i);
  return `g${g.i}`;
}));
await run('above', async () => {
  await reset();
  await page.evaluate(() => window.__SKY__.W.setOver(true));
  await page.waitForFunction(() => window.__SKY__.S.view.over > 0.95, null, { timeout: 15000 });
  await settle(1200);
  await shot('above');
  const list = await points(SAMPLES);
  const problems = [];
  let hoverSeen = 0, hookNamed = 0, hoverNamed = 0;
  for (const p of list) {
    if (!PHONE) { await page.mouse.move(p.x, p.y); await s.sleep(70); }
    const got = await page.evaluate(({ x, y, pointer }) => ({ hover: window.__SKY__.W.hoverKey || '', hook: document.getElementById('bunki-sky').earWordAt(x, y, { pointer })?.id || null }), { x: p.x, y: p.y, pointer: PHONE ? 'touch' : 'mouse' });
    if (got.hook) hookNamed += 1;
    if (!PHONE) { hoverSeen += 1; if (got.hover) hoverNamed += 1; }
  }
  if (hookNamed) problems.push(`the mount named something at ${hookNamed} of ${list.length} points from above`);
  if (hoverNamed) problems.push(`the engine's hover named something at ${hoverNamed} points from above (the premise is false)`);
  // one real tap: the engine leaves the view from above and never hands a pick to its tap
  const n = await page.evaluate(() => window.__cmp.log.length);
  const p = list[0];
  if (PHONE) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
  await s.sleep(400);
  const tapped = await page.evaluate((n) => window.__cmp.log.length - n, n);
  const left = await page.evaluate(() => window.__SKY__.W.tgt.ov < 0.5);
  if (tapped) problems.push(`the engine handed ${tapped} picks to its tap from above`);
  if (!left) problems.push('a tap from above did not bring the eye down (the premise of the view from above is false)');
  detail.above = { sampled: list.length, hookNamed, hoverSeen, hoverNamed, tapPicks: tapped, cameDown: left };
  record('above: the engine picks nothing, and neither does the mount', problems,
    `${list.length} points; the mount named ${hookNamed}; ${PHONE ? 'no hover on a phone' : `the engine's hover named ${hoverNamed} of ${hoverSeen}`}; a tap handed ${tapped} picks to the engine's tap and ${left ? 'brought the eye down' : 'did not bring it down'}`);
});

writeFileSync(`${OUT}/ear-sky-compare-${tag}.json`, JSON.stringify({ tag, app, detail }, null, 1));
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}${s.errors.length ? ` (${s.errors.slice(0, 2).join(' | ')})` : ''}; off this machine ${s.offMachine.length}`);
process.exit(failed || s.errors.length ? 1 : 0);
