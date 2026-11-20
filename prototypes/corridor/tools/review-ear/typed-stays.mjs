// Review check (hunt 4, "what text can leave the device"): Japanese typed into the app's fields never reaches the voice
// server through the ear: the prototype's notes box (a textarea in a sheet) and the search field. Held on (Mac: a rest of
// the pointer over the field; phone: a tap in it), armed (a tap in it), and a selection of the typed text (the 読む chip
// must not appear). The sentinel text is unique, so any request carrying it is caught.
//   node typed-stays.mjs --engine chromium|webkit [--width 1728|390]
import { arg, dismissFirstLine, earMark, holdOn, open, reporter } from './lib.mjs';

const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '1728'));
const tag = `${ENGINE}-${WIDTH}`;
const { rows, record } = reporter(tag);
const s = await open({ engine: ENGINE, width: WIDTH, clipSeconds: () => 0.4, voicePort: Number(arg('--voice-port', '19532')) });
const { page, press, fake } = s;
const SECRET = '秘密の下書きです。誰にも送らない';
const leaked = () => fake.speaks().filter((r) => String(r.text || '').includes('秘密') || String(r.text || '').includes('下書き')).map((r) => r.text);
async function fieldCases(name, field, { mark = true } = {}) {
  const box = await field.boundingBox();
  const cx = box.x + Math.min(60, box.width / 2), cy = box.y + box.height / 2;
  // held on (set before, or here when a mark is reachable): a rest (Mac) or a tap (phone) on the field
  if (mark) await holdOn(s);
  if (s.phone) await page.touchscreen.tap(cx, cy); else { await page.mouse.move(cx, cy, { steps: 4 }); await s.sleep(900); await page.mouse.click(cx, cy); }
  await s.sleep(800);
  if (mark) {
    // armed: a tap in the field
    await press(await earMark(page)); await s.sleep(200);
    if ((await page.evaluate(() => document.documentElement.dataset.ear)) !== 'armed') { await press(await earMark(page)); await s.sleep(200); }
    if (s.phone) await page.touchscreen.tap(cx, cy); else await page.mouse.click(cx, cy);
    await s.sleep(800);
  }
  // the typed text selected inside the field
  await field.focus();
  await field.evaluate((f) => f.setSelectionRange?.(0, f.value.length));
  await s.sleep(500);
  const chip = await page.evaluate(() => !!document.querySelector('.ear-chip') && !document.querySelector('.ear-chip').hidden);
  const out = leaked();
  record(`${name}: typed Japanese never leaves through the ear`, [...(out.length ? [`sent: ${out.join(' | ')}`] : []), ...(chip ? ['the 読む chip shows over a selection inside the field'] : [])],
    `requests ${fake.speaks().length}; chip ${chip}; ear ${await page.evaluate(() => document.documentElement.dataset.ear)}`);
}
try {
  await s.ready();
  await dismissFirstLine(s);
  // the prototype's notes box
  // the sheet is modal and covers the ear's mark: on the Mac the ear is held on before it opens (a click is the app's)
  if (!s.phone) {
    await holdOn(s);
    await press('#prototype-open');
    await press('[data-pl-tab="notes"]');
    await page.locator('#pl-text').waitFor();
    await page.locator('#pl-text').fill(SECRET);
    await fieldCases('the prototype’s notes box (held on before it opened)', page.locator('#pl-text'), { mark: false });
    await page.keyboard.press('Escape').catch(() => {});
    await s.sleep(400);
  }
  // the search field
  await s.ready();
  await press('#home-review').catch(() => {});
  await page.locator('#tab-words').waitFor();
  await press('#tab-words'); await s.sleep(1000);
  await dismissFirstLine(s);
  await page.locator('#nav-search-input').fill(SECRET);
  await s.sleep(800);
  await fieldCases('the search field', page.locator('#nav-search-input'));
} catch (error) {
  record('the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
}
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; leaked ${leaked().length}; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
