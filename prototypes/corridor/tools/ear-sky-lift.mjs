#!/usr/bin/env node
/** One pick for one tap on the sky, and every way into the sky's tap (fix round 3 of the ear, S2 and S3; the re-check's
 * fr2 concerns Q2 and Q3). A touch screen 1728 wide, the sky drawn on the graphics card (Chromium with
 * --use-angle=metal, or headless WebKit), ?sky=1.
 *
 *   drift-away    armed: a finger lifts on a sky word, and before the click the field drifts so that nothing stands
 *                 under the point. The sky asked the ear as the finger lifted and was told the tap is the ear's; the click
 *                 must speak that word (once), not lose the tap: the sky does not open it, the ear goes off.
 *   drift-other   armed: the same, but at the click another word stands under the point: the word spoken is the one
 *                 under the finger as it lifted, never the other.
 *   cancel-armed  armed: a finger lands on a sky word and the browser cancels the touch (pointercancel; the engine runs
 *                 its tap on it too): the sky does not open the word, nothing is asked (no tap was made), the ear stays
 *                 armed. Chromium only (a raw touch cancel through the browser's own input).
 *   cancel-off    ear off: the same cancel is the sky's own, as without the ear: the word opens, nothing asked.
 *   cancel-held   held on (a touch screen: sky words are controls, R-a): the same cancel is the sky's own: it opens.
 * The drift is made by a click listener registered before the app's own (an init script), which moves the drawn field
 * in W.vis for that one moment, as the frames do while the words drift; it records what the sky names under the point
 * at the click, so each case shows the drift took effect.
 *
 * Silent: the review's harness (review-ear/lib.mjs): Chromium with --mute-audio, or headless WebKit; media forced muted,
 * the device voice swallowed, the local stand-in voice server, nothing but this machine reached.
 *
 *   REVIEW_BASE=http://127.0.0.1:19481/ node prototypes/corridor/tools/ear-sky-lift.mjs [--engine chromium|webkit]
 *        [--cases drift-away,drift-other,cancel-armed,cancel-off,cancel-held] [--voice-port 19482] [--out DIR]
 */
import { arg, earMark, earState, holdOn, open, reporter } from './review-ear/lib.mjs';

const ENGINE = arg('--engine', 'chromium');
const ALL = ENGINE === 'chromium' ? 'drift-away,drift-other,cancel-armed,cancel-off,cancel-held' : 'drift-away,drift-other';
const CASES = arg('--cases', ALL).split(',');
const OUT = arg('--out', process.env.REVIEW_OUT || '.');
const port = Number(arg('--voice-port', '19532'));
const tag = `${ENGINE}-touch-1728`;
const { rows, record } = reporter(tag);
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

function drifter() {
  window.addEventListener('pointercancel', () => { window.__cancels = (window.__cancels || 0) + 1; }, true);
  window.addEventListener('click', (event) => {
    const d = window.__drift;
    if (!d || !event.isTrusted) return;
    window.__drift = null;
    const sky = window.__SKY__, W = sky && sky.W;
    if (!W || !W.vis) return;
    if (d.mode === 'away') for (const i of W.hits) W.vis[i * 5] += 3000;
    if (d.mode === 'other') {
      const a = d.from * 5, b = d.to * 5;
      W.vis[b] = W.vis[a]; W.vis[b + 1] = W.vis[a + 1]; W.vis[a] += 3000;
    }
    const host = document.getElementById('bunki-sky');
    const seen = host && host.earWordAt(event.clientX, event.clientY, { pointer: 'touch' });
    window.__driftSeen = { mode: d.mode, at: [event.clientX, event.clientY], seen: seen ? seen.text : null };
  }, true);
}

async function sky() {
  const s = await open({ engine: ENGINE, width: 1728, touch: true, clipSeconds: () => 1, voicePort: port, args: GPU });
  await s.context.addInitScript(drifter);
  await s.ready('sky=1');
  const ok = await s.page.waitForFunction(() => window.__bunkiSkyApp?.state === 'mounted' && window.__SKY__?.W?.ready && window.__SKY__.W.fonts && window.__SKY__.W.hits.length > 20, null, { timeout: 45000 }).then(() => true, () => false);
  if (!ok) { const st = await s.page.evaluate(() => JSON.stringify(window.__bunkiSkyApp)); await s.close(); throw new Error(`the sky did not mount: ${st}`); }
  await s.sleep(2500);
  return s;
}
/** Sky words in plain view that the ear's wordAt names at their centre, with what the ear would send. */
const clearWords = (page) => page.evaluate(() => {
  const sky = window.__SKY__, W = sky.W, r = sky.wrap.getBoundingClientRect(), host = document.getElementById('bunki-sky');
  return W.hits.map((i) => ({ i, word: W.D.words[i][0], x: r.left + W.vis[i * 5], y: r.top + W.vis[i * 5 + 1], h: W.vis[i * 5 + 2] }))
    .filter((w) => w.y > 170 && w.y < innerHeight - 200 && w.x > 160 && w.x < innerWidth - 160 && w.h > 12 && /\p{Script=Han}/u.test(w.word))
    .map((w) => ({ ...w, said: host.earWordAt(w.x, w.y, { pointer: 'touch' }) }))
    .filter((w) => w.said?.text === w.word)
    .sort((a, b) => b.h - a.h);
});
const opened = (page) => page.evaluate(() => {
  const W = window.__SKY__?.W, web = W?.web;
  return web?.isOpen?.() ? (web.cur.kind === 'w' ? W.D.words[web.cur.id][0] : `${web.cur.kind}${web.cur.id}`) : null;
});
async function arm(s) {
  await s.press(await earMark(s.page));
  await s.page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
}
async function run(name, body) {
  if (!CASES.includes(name)) return;
  let s = null;
  try { s = await sky(); await body(s); } catch (error) {
    record(`${name}: the case ran to its end`, [String(error.message).split('\n')[0].slice(0, 220)]);
  } finally {
    if (s) { await s.page.screenshot({ path: `${OUT}/ear-sky-lift-${tag}-${name}.png` }).catch(() => {}); await s.close(); }
  }
}
const spoken = (w) => w.said.reading || w.word;

for (const mode of ['away', 'other']) {
  await run(`drift-${mode}`, async (s) => {
    const [w, other] = (await clearWords(s.page)).filter((one, k, all) => all.findIndex((x) => x.word === one.word) === k);
    if (!w || (mode === 'other' && !other)) throw new Error('not enough clear sky words in view');
    await arm(s);
    const n = s.fake.speaks().length;
    await s.page.evaluate((d) => { window.__drift = d; }, { mode, from: w.i, to: other?.i ?? -1 });
    await s.page.touchscreen.tap(w.x, w.y);
    await s.sleep(1500);
    const seen = await s.page.evaluate(() => window.__driftSeen || null);
    const asked = s.fake.speaks().slice(n).map((r) => r.text);
    const isOpen = await opened(s.page), ear = await earState(s.page);
    const problems = [];
    if (!seen) problems.push('the drift did not happen at the click');
    else if (mode === 'away' ? seen.seen !== null : seen.seen !== other.word) problems.push(`at the click the sky named ${seen.seen ?? 'nothing'}, not the drift's`);
    if (asked.length !== 1) problems.push(`${asked.length} requests, not 1`);
    else if (!asked[0].includes(spoken(w))) problems.push(`spoke "${asked[0]}", not the lifted word's "${spoken(w)}"`);
    if (isOpen) problems.push(`the sky opened ${isOpen}`);
    if (ear !== 'off' && ear !== 'speaking') problems.push(`the ear is ${ear}, not off`);
    record(mode === 'away' ? 'armed, the field drifts away between the lift and the click: the lifted word is spoken once, not lost'
      : 'armed, another word drifts under the point before the click: the lifted word is spoken, not the other',
    problems, `lifted on "${w.word}" (${spoken(w)})${mode === 'other' ? `, then "${other.word}" under the point` : ''}; at the click the sky named ${seen?.seen ?? 'nothing'}; asked ${asked.map((t) => `"${t}"`).join(', ') || 'nothing'}; opened ${isOpen}; ear ${ear}`);
  });
}

/** A finger lands on the word and the browser cancels the touch: pointerdown, then pointercancel, no click. */
async function cancelOn(s, w) {
  const cdp = await s.context.newCDPSession(s.page);
  const before = await s.page.evaluate(() => window.__cancels || 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: w.x, y: w.y }] });
  await s.sleep(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await s.sleep(1500);
  return (await s.page.evaluate(() => window.__cancels || 0)) - before;
}
for (const [name, mode] of [['cancel-armed', 'armed'], ['cancel-off', 'off'], ['cancel-held', 'held']]) {
  await run(name, async (s) => {
    if (ENGINE !== 'chromium') throw new Error('a raw touch cancel needs Chromium');
    const [w] = await clearWords(s.page);
    if (!w) throw new Error('no clear sky word in view');
    if (mode === 'armed') await arm(s);
    if (mode === 'held') await holdOn(s);
    const n = s.fake.speaks().length;
    const cancels = await cancelOn(s, w);
    const asked = s.fake.speaks().slice(n).map((r) => r.text);
    const isOpen = await opened(s.page), ear = await earState(s.page);
    const problems = [];
    if (cancels < 1) problems.push('no pointercancel reached the page');
    if (asked.length) problems.push(`${asked.length} requests, not 0`);
    if (mode === 'armed' && isOpen) problems.push(`the sky opened ${isOpen}: the ear should have taken that word`);
    if (mode !== 'armed' && isOpen !== w.word) problems.push(`the sky did not open "${w.word}" (opened ${isOpen}): a cancel there is the sky's own`);
    if (ear !== mode) problems.push(`the ear is ${ear}, not ${mode}`);
    record(mode === 'armed' ? 'armed, a touch on a sky word cancelled: the sky does not open it, nothing asked, still armed'
      : mode === 'off' ? 'ear off, a touch on a sky word cancelled: the sky\'s own (it opens), nothing asked'
        : 'held on (touch), a touch on a sky word cancelled: the sky\'s own (R-a), nothing asked',
    problems, `"${w.word}"; pointercancel ${cancels}; asked ${asked.length}; opened ${isOpen}; ear ${ear}`);
  });
}

const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
