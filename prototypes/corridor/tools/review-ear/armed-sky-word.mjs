// Review check (hunt 3, "can an ear tap ever ... reveal, ... or write to his record"; the table: armed, "the next tap on
// Japanese speaks it and does nothing else"): the galaxy (the sky on the first screen) acts on the pointer's lift
// (drift-layer.js pointerup -> tapNode: the cue retired, the app's ladder, the word unfolded), not on the click the ear
// consumes. Armed, one tap on a sky word must ask the voice once and leave the sky as it was. --control: the same tap with
// the ear off (the sky acts, nothing is asked), which shows what "the sky acted" looks like.
//   node armed-sky-word.mjs --engine chromium|webkit [--width 390|1728] [--control]
import { arg, earMark, open, reporter } from './lib.mjs';

const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '390'));
const CONTROL = process.argv.includes('--control');
const tag = `${ENGINE}-${WIDTH}${CONTROL ? '-control' : ''}`;
const { rows, record } = reporter(tag);
const s = await open({ engine: ENGINE, width: WIDTH, clipSeconds: () => 0.6, voicePort: Number(arg('--voice-port', '19532')) });
const { page, fake } = s;
const skyState = () => page.evaluate(() => ({
  unfolded: document.querySelectorAll('#sky .unfolded, #sky .glossed, #sky .hosted-reading-shown').length,
  focus: document.querySelectorAll('#sky .focus, #sky .is-focus, #sky .planet').length,
  box: !!document.getElementById('mini')?.getClientRects().length,
  card: !!document.querySelector('#card.open'),
  sheet: document.getElementById('sheet')?.dataset.node || '',
  hint: (document.querySelector('#hint, .drift-hint')?.textContent || '').trim().slice(0, 40),
  classes: [...document.querySelectorAll('#sky div.word')].map((w) => w.className).join('|').length,
}));
try {
  await s.ready();
  await s.sleep(1800);
  const index = await page.evaluate(() => [...document.querySelectorAll('#sky div.word')].findIndex((w) => { const r = w.getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight - 160 && r.left > 40 && r.right < innerWidth - 40; }));
  if (index < 0) throw new Error('no sky word in plain view');
  const word = page.locator('#sky div.word').nth(index);
  const label = ((await word.textContent()) || '').trim().slice(0, 12);
  if (!CONTROL) {
    await s.press(await earMark(page));
    await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
  }
  const before = await skyState();
  const n = fake.speaks().length;
  const b = await word.boundingBox();
  if (s.phone) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await s.sleep(1500);
  const after = await skyState();
  const asked = fake.speaks().slice(n).map((r) => `${r.voiceKey} "${r.text}"`);
  const changed = Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  await page.screenshot({ path: `${process.env.REVIEW_OUT || '.'}/armed-sky-word-${tag}.png` }).catch(() => {});
  if (CONTROL) record('ear off: a tap on a sky word is the sky’s own and asks nothing', [...(asked.length ? [`asked ${asked.length}`] : []), ...(changed.length ? [] : ['the sky did not change'])],
    `"${label}"; changed ${changed.join(', ') || 'nothing'}; requests ${asked.length}`);
  else record('armed: a tap on a sky word speaks it and does nothing else', [...(asked.length === 1 ? [] : [`${asked.length} requests, not 1`]), ...(changed.length ? [`the sky acted too: ${changed.map((k) => `${k} ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`).join('; ')}`] : [])],
    `"${label}"; requests ${asked.join(', ') || 'none'}; ear ${await page.evaluate(() => document.documentElement.dataset.ear)}`);
} catch (error) {
  record('the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
}
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
