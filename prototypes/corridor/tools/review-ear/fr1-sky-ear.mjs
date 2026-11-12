// Re-check of the fix round, the new first screen (宙, sky/mount.mjs): the brief says no headless browser can draw it, but
// headless Chromium on this Mac draws it on the graphics card with --use-angle=metal (renderer "ANGLE Metal Renderer: Apple
// M5 Max"; fr1-sky-probe.mjs). Muted, loopback only, the stand-in voice, ?sky=1 (a driven browser keeps the old screen
// otherwise), 1728 x 1117 (John's window; the sky shows only at 720 and wider).
// The rulings: B5, "an armed tap speaks and does nothing else on every surface"; the table, held on, on the Mac, a rest of the
// pointer on Japanese speaks it; Option-click on any Japanese speaks it; C1, the ear never left on where its mark is not shown.
// The engine's version 3 (2026-11-12) puts the sky on a phone as well: --engine webkit and --width 390 run the cases a
// finger can make (mark, armed, by a tap); Option-click and a resting pointer need a Mac and are named as skipped there.
//   node fr1-sky-ear.mjs [--cases mark,armed,option,rest] [--engine chromium|webkit] [--width 1728|390]
import { arg, earMark, earState, holdOn, open, reporter } from './lib.mjs';

const CASES = arg('--cases', 'mark,armed,option,rest').split(',');
const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '1728'));
const PHONE = WIDTH < 700;
const tag = ENGINE === 'chromium' && WIDTH === 1728 ? 'chromium-metal-1728' : `${ENGINE}-${WIDTH}`;
const { rows, record } = reporter(tag);
const OUT = process.env.REVIEW_OUT || '.';
const s = await open({ engine: ENGINE, width: WIDTH, clipSeconds: () => 1, voicePort: Number(arg('--voice-port', '19532')),
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const { page, fake } = s;
const toSky = async () => {
  await s.ready('sky=1');
  await page.waitForFunction(() => window.__bunkiSkyApp?.state === 'mounted' && window.__SKY__?.W?.ready && window.__SKY__.W.hits.length > 20, null, { timeout: 45000 });
  await s.sleep(2500);
};
/** words the sky has drawn, where they stand on the screen now (CSS px), clear of the bars */
const skyWords = () => page.evaluate(() => {
  const W = window.__SKY__.W, r = window.__SKY__.wrap.getBoundingClientRect();
  return W.hits.map((i) => ({ i, word: W.D.words[i][0], x: r.left + W.vis[i * 5], y: r.top + W.vis[i * 5 + 1], h: W.vis[i * 5 + 2] }))
    .filter((w) => w.y > 160 && w.y < innerHeight - 220 && w.x > Math.min(200, innerWidth * 0.15) && w.x < innerWidth - Math.min(200, innerWidth * 0.15) && w.h > 14 && /\p{Script=Han}/u.test(w.word))
    .sort((a, b) => b.h - a.h);
});
const webOpen = () => page.evaluate(() => !!window.__SKY__?.W?.web?.isOpen?.());
// the combine (voice/speech-lane-all-20261111): with the offline clips (B3) a word said once plays from the device's store
// the next time with no request, so the Option-click case says a word the armed case did not, and the rest case words
// neither did
const said = [];
async function run(name, body) {
  if (!CASES.includes(name)) return;
  if (PHONE && (name === 'option' || name === 'rest')) { console.log(`SKIP  ${tag} · ${name}: needs a Mac's keyboard or resting pointer; not run at phone size`); return; }
  try { await body(); } catch (error) {
    record(`${name}: the case ran to its end`, [String(error.message).split('\n')[0].slice(0, 200)]);
    await page.screenshot({ path: `${OUT}/fr1-sky-${name}-error.png` }).catch(() => {});
  }
}

await run('mark', async () => {
  await toSky();
  await page.screenshot({ path: `${OUT}/fr1-sky-mounted.png` });
  const mark = await earMark(page).then(() => true, () => false);
  record('the sky shows the ear’s mark, reachable', mark ? [] : ['no reachable ear mark on the sky'], `state ${await page.evaluate(() => window.__bunkiSkyApp.state)}`);
});

await run('armed', async () => {
  await toSky();
  const [w] = await skyWords();
  if (w) said.push(w.word);
  if (!w) throw new Error('no sky word drawn in plain view');
  await s.press(await earMark(page));
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
  const n = fake.speaks().length;
  if (PHONE) await page.touchscreen.tap(w.x, w.y); else await page.mouse.click(w.x, w.y);
  await s.sleep(1500);
  const asked = fake.speaks().slice(n).map((r) => `${r.voiceKey} "${r.text}"`);
  const opened = await webOpen();
  await page.screenshot({ path: `${OUT}/fr1-sky-armed-tap.png` });
  record('armed, a tap on a word of the sky: spoken, and nothing else (B5)', [...(asked.length === 1 ? [] : [`${asked.length} requests`]), ...(opened ? ['the sky opened the word'] : []), ...((await earState(page)) === 'armed' ? ['the ear is still armed'] : [])],
    `"${w.word}"; requests ${asked.join(', ') || 'none'}; sky opened ${opened}; ear ${await earState(page)}`);
});

await run('option', async () => {
  await toSky();
  const w = (await skyWords()).find((one) => !said.includes(one.word));
  if (!w) throw new Error('no sky word drawn in plain view');
  said.push(w.word);
  const n = fake.speaks().length;
  await page.keyboard.down('Alt');
  await page.mouse.click(w.x, w.y);
  await page.keyboard.up('Alt');
  await s.sleep(1500);
  const asked = fake.speaks().slice(n).map((r) => `"${r.text}"`);
  record('ear off, Option-click on a word of the sky: spoken (the table: Option-click on any Japanese)', asked.length === 1 ? [] : [`${asked.length} requests; sky opened ${await webOpen()}`], `"${w.word}"; requests ${asked.join(', ') || 'none'}`);
});

await run('rest', async () => {
  await toSky();
  await holdOn(s);
  // words not said yet in this run (a word said once plays from the device's store with no request: the combine)
  const words = (await skyWords()).filter((one) => !said.includes(one.word));
  if (!words.length) throw new Error('no sky word drawn in plain view');
  const n = fake.speaks().length;
  for (const w of words.slice(0, 2)) { await page.mouse.move(w.x, w.y, { steps: 6 }); await s.sleep(900); }
  const asked = fake.speaks().slice(n).map((r) => `"${r.text}"`);
  record('held on, the pointer resting on words of the sky: spoken', asked.length ? [] : ['nothing asked'], `${words.slice(0, 2).map((w) => w.word).join(', ')}; requests ${asked.join(', ') || 'none'}; ear ${await earState(page)}`);
});

await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
