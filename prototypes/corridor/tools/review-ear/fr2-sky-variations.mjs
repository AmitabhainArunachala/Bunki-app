// Re-check, round 2 (N1): the ear on the new first screen (the sky), past the builder's own cases. Headless Chromium drawing
// on this Mac's graphics card (--use-angle=metal), ?sky=1, muted, loopback, the stand-in voice.
//   touch-armed   a touch screen 1728 wide: armed, a finger's tap on a sky word: asked once, the sky does not open it, off
//   touch-held    the same screen, held on: a finger's tap on a sky word is the sky's (R-a): it opens, nothing asked
//   sideways      a phone held sideways (844 x 390, touch): the sky mounts; armed, a tap on a word: asked once, not opened
//   remount       the sky mounted again in the page (the interface language changes: mount.mjs start()), then armed, a
//                 click on a word: asked once, not opened (is the hook on the new engine's web?)
//   double        armed, two quick clicks on one word: asked once, the sky never opens it
//   drag          armed, a drag that starts on a word: the sky moves, nothing asked, the ear stays armed
//   empty         armed, a click on empty sky: nothing asked, the ear stays armed
//   bare          a word whose reading the sky leaves empty (W.rd ''): armed, a click on it: asked once, as the word
// Brought to the engine's version 3 (2026-11-12): the eye is W.cam and W.tgt (version 1's S.camTo never moves now), and
// the sky stands at phone size too: --engine webkit and --width 390 run every case at that width with a finger (a tap for
// a click); a double click and a mouse drag need a Mac's mouse and are named as skipped there.
//   node fr2-sky-variations.mjs --cases a,b [--voice-port 19532] [--engine chromium|webkit] [--width 1728|390]
import { arg, earMark, earState, holdOn, open, reporter } from './lib.mjs';

const CASES = arg('--cases', 'touch-armed,touch-held,sideways,remount,double,drag,empty,bare').split(',');
const OUT = process.env.REVIEW_OUT || '.';
const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '1728'));
const PHONE = WIDTH < 700;
const TAG = ENGINE === 'chromium' && WIDTH === 1728 ? 'chromium-metal' : `${ENGINE}-${WIDTH}`;
const { rows, record } = reporter(TAG);
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const port = Number(arg('--voice-port', '19532'));

async function sky({ width = WIDTH, height = null, touch = PHONE } = {}) {
  const s = await open({ engine: ENGINE, width, height, touch, clipSeconds: () => 1, voicePort: port, args: GPU });
  await s.ready('sky=1');
  const ok = await s.page.waitForFunction(() => window.__bunkiSkyApp?.state === 'mounted' && window.__SKY__?.W?.ready && window.__SKY__.W.hits.length > (Math.min(innerWidth, innerHeight) < 700 ? 8 : 20), null, { timeout: 45000 }).then(() => true, () => false);
  if (!ok) { const st = await s.page.evaluate(() => JSON.stringify(window.__bunkiSkyApp)); await s.close(); throw new Error(`the sky did not mount: ${st}`); }
  await s.sleep(2500);
  return s;
}
/** sky words in plain view that the sky's own pick and the ear's wordAt both name at their centre */
const clearWords = (page, filter = 'true') => page.evaluate((filter) => {
  const sky = window.__SKY__, W = sky.W, r = sky.wrap.getBoundingClientRect(), host = document.getElementById('bunki-sky');
  const keep = new Function('W', 'i', `return ${filter};`);
  return W.hits.map((i) => ({ i, word: W.D.words[i][0], rd: W.rd[i], x: r.left + W.vis[i * 5], y: r.top + W.vis[i * 5 + 1], h: W.vis[i * 5 + 2] }))
    .filter((w) => w.y > 170 && w.y < innerHeight - 200 && w.x > Math.min(160, innerWidth * 0.12) && w.x < innerWidth - Math.min(160, innerWidth * 0.12) && w.h > 12 && /\p{Script=Han}/u.test(w.word) && keep(W, w.i))
    .filter((w) => host.earWordAt(w.x, w.y, { pointer: innerWidth < 700 ? 'touch' : 'mouse' })?.text === w.word)
    .sort((a, b) => b.h - a.h);
}, filter);
const opened = (page) => page.evaluate(() => !!window.__SKY__?.W?.web?.isOpen?.());
/** Where the eye looks (version 3: W.cam.a round the ring, W.tgt.yaw and pitch), as text to compare before and after. */
const cam = (page) => page.evaluate(() => { const W = window.__SKY__.W; return [W.cam.a, W.tgt.yaw, W.tgt.pitch].map((v) => v.toFixed(4)).join('|'); });
async function arm(s) { await s.press(await earMark(s.page)); await s.page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 }); }
const tap = (s, w) => (s.phone ? s.page.touchscreen.tap(w.x, w.y) : s.page.mouse.click(w.x, w.y));
async function run(name, body) {
  if (!CASES.includes(name)) return;
  if (PHONE && (name === 'double' || name === 'drag')) { console.log(`SKIP  ${TAG} · ${name}: needs a Mac's mouse; not run at phone size`); return; }
  try { await body(); } catch (error) { record(`${name}: the case ran to its end`, [String(error.message).split('\n')[0].slice(0, 200)]); }
}
const verdict = async (s, name, n, { want = 1, open: wantOpen = false, ear = 'off' } = {}, extra = '') => {
  const asked = s.fake.speaks().slice(n).map((r) => `"${r.text}"`);
  const isOpen = await opened(s.page), e = await earState(s.page);
  const problems = [];
  if (asked.length !== want) problems.push(`${asked.length} requests, not ${want}`);
  if (isOpen !== wantOpen) problems.push(wantOpen ? 'the sky did not open the word' : 'the sky opened the word');
  if (ear && e !== ear && !(ear === 'off' && e === 'speaking')) problems.push(`the ear is ${e}, not ${ear}`);
  await s.page.screenshot({ path: `${OUT}/fr2-sky-${name}.png` }).catch(() => {});
  record(name, problems, `requests ${asked.join(', ') || 'none'}; opened ${isOpen}; ear ${e}${extra ? `; ${extra}` : ''}`);
};

await run('touch-armed', async () => {
  const s = await sky({ touch: true });
  try {
    const [w] = await clearWords(s.page);
    if (!w) throw new Error('no clear sky word in view');
    await arm(s);
    const n = s.fake.speaks().length;
    await tap(s, w); await s.sleep(1500);
    await verdict(s, `touch screen ${WIDTH}, armed: a tap on a sky word is spoken once and not opened`, n, {}, `"${w.word}"`);
  } finally { await s.close(); }
});
await run('touch-held', async () => {
  const s = await sky({ touch: true });
  try {
    const [w] = await clearWords(s.page);
    if (!w) throw new Error('no clear sky word in view');
    await holdOn(s);
    const n = s.fake.speaks().length;
    await tap(s, w); await s.sleep(1500);
    await verdict(s, `touch screen ${WIDTH}, held on: a tap on a sky word is the sky’s own (R-a)`, n, { want: 0, open: true, ear: 'held' }, `"${w.word}"`);
  } finally { await s.close(); }
});
await run('sideways', async () => {
  const s = await sky({ width: 844, height: 390, touch: true });
  try {
    const words = await clearWords(s.page);
    const w = words[0];
    if (!w) throw new Error('no clear sky word on a sideways phone');
    const spot = await s.page.evaluate(() => { const m = document.querySelector('#ginga-symbol + .ear-spot .ear-mark'); const r = m?.getBoundingClientRect(); return r ? `${Math.round(r.left)},${Math.round(r.top)}` : 'none'; });
    await arm(s);
    const n = s.fake.speaks().length;
    await tap(s, w); await s.sleep(1500);
    await verdict(s, 'phone held sideways (844 x 390): armed, a tap on a sky word is spoken once and not opened', n, {}, `"${w.word}"; mark at ${spot}`);
  } finally { await s.close(); }
});
await run('remount', async () => {
  const s = await sky();
  try {
    // the mount starts the sky again when the interface language changes (its observer on body's class)
    for (let k = 0; k < 2; k += 1) {
      await s.page.evaluate(() => document.body.classList.toggle('ui-bi'));
      await s.page.waitForFunction(() => window.__SKY__?.W?.ready && window.__SKY__.W.hits.length > (Math.min(innerWidth, innerHeight) < 700 ? 8 : 20), null, { timeout: 30000 });
      await s.sleep(2500);
    }
    const [w] = await clearWords(s.page);
    await arm(s);
    const n = s.fake.speaks().length;
    await tap(s, w); await s.sleep(1500);
    await verdict(s, 'the sky mounted again in the page: armed, a click on a word is spoken once and not opened', n, {}, `"${w.word}"`);
  } finally { await s.close(); }
});
await run('double', async () => {
  const s = await sky();
  try {
    const [w] = await clearWords(s.page);
    await arm(s);
    const n = s.fake.speaks().length;
    // a real double-click: two presses, the second with click count 2 (mouse.click with clickCount 2 sends three)
    await s.page.mouse.move(w.x, w.y);
    await s.page.mouse.down({ clickCount: 1 }); await s.page.mouse.up({ clickCount: 1 });
    await s.page.mouse.down({ clickCount: 2 }); await s.page.mouse.up({ clickCount: 2 });
    await s.sleep(1500);
    await verdict(s, 'armed, two quick clicks on one sky word: asked once, the sky never opens it', n, { ear: null }, `"${w.word}"`);
  } finally { await s.close(); }
});
await run('drag', async () => {
  const s = await sky();
  try {
    const [w] = await clearWords(s.page);
    await arm(s);
    const before = await cam(s.page);
    const n = s.fake.speaks().length;
    await s.page.mouse.move(w.x, w.y); await s.page.mouse.down();
    for (let k = 1; k <= 8; k += 1) { await s.page.mouse.move(w.x + k * 25, w.y + k * 6); await s.sleep(30); }
    await s.page.mouse.up(); await s.sleep(1200);
    const after = await cam(s.page);
    await verdict(s, 'armed, a drag that starts on a sky word: the sky moves, nothing asked, the ear stays armed', n, { want: 0, ear: 'armed' }, `camera ${before === after ? 'did not move' : 'moved'}`);
  } finally { await s.close(); }
});
await run('empty', async () => {
  const s = await sky();
  try {
    const empty = await s.page.evaluate(() => {
      const host = document.getElementById('bunki-sky');
      const p = innerWidth < 700 ? 'touch' : 'mouse', m = Math.min(200, innerWidth * 0.15);
      for (let y = 220; y < innerHeight - 220; y += 23) for (let x = m; x < innerWidth - m; x += 31) if (!host.earWordAt(x, y, { pointer: p }) && !host.earWordAt(x + 12, y + 12, { pointer: p })) return { x, y };
      return null;
    });
    if (!empty) throw new Error('no empty sky found');
    await arm(s);
    const n = s.fake.speaks().length;
    await tap(s, empty); await s.sleep(1200);
    await verdict(s, 'armed, a click on empty sky: nothing asked, the ear stays armed', n, { want: 0, ear: 'armed' });
  } finally { await s.close(); }
});
await run('bare', async () => {
  const s = await sky();
  try {
    let words = [];
    for (let k = 0; k < 10 && !words.length; k += 1) { words = await clearWords(s.page, "W.rd[i] === ''"); if (!words.length) { await s.page.mouse.wheel(0, 400); await s.sleep(1500); } }
    const w = words[0];
    if (!w) throw new Error('no clear sky word without a reading in view');
    await arm(s);
    const n = s.fake.speaks().length;
    await tap(s, w); await s.sleep(1500);
    await verdict(s, 'armed, a click on a sky word the sky gives no reading: asked once (as the word), not opened', n, {}, `"${w.word}" (reading in data: ${await s.page.evaluate((i) => JSON.stringify(window.__SKY__.W.D.words[i][1]), w.i)})`);
  } finally { await s.close(); }
});
const failed = rows.filter((r) => !r.pass).length;
console.log(`${TAG}: ${rows.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
