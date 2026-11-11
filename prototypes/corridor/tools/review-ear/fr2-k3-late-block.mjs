// Re-check, round 2 (K3 and ruling B3): the ear's own 8 s limit now cuts its read and lets the request on its way arrive
// (voice-seam.mjs cut(): owner.keep). If that request never arrives, the client's own 20 s deadline ends it with
// voice-timeout, and clipFor notes it (voice-seam.mjs note): the server is blocked for 15 s for everyone. Before this
// round the limit stopped the read and aborted the request, which notes nothing.
// The sequence: an article read playing (6 s clips); an armed tap on a word three sentences ahead; only that request is
// held back and never answered (every later request is answered at once). The ruling (B3): a refusal belongs to the
// turn refused; the read goes on and may stop only when it really needs a new clip the server refuses.
// --control: the ear's request is answered at 9 s instead (kept, as K3 wants): the read must go on as well.
//   node fr2-k3-late-block.mjs --engine chromium|webkit [--width 390] [--control]
import { arg, earMark, open, openArticle, readState, reporter } from './lib.mjs';

const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '390'));
const CONTROL = process.argv.includes('--control');
const tag = `${ENGINE}-${WIDTH}${CONTROL ? '-control' : ''}`;
const { rows, record } = reporter(tag);
const s = await open({ engine: ENGINE, width: WIDTH, clipSeconds: () => 6, voicePort: Number(arg('--voice-port', '19532')) });
const { page, press, fake } = s;
const waitFor = (fn, a, timeout) => page.waitForFunction(fn, a, { timeout }).then(() => true, () => false);
async function laterWord(ahead) {
  await page.evaluate(() => { const t = document.querySelector('#reader .tok[data-speaking]'); if (t) scrollBy(0, t.getBoundingClientRect().top - 110); });
  await s.sleep(500);
  for (let i = 0; i < 4; i += 1) {
    const at = await page.evaluate((ahead) => {
      const toks = [...document.querySelectorAll('#reader .tok[data-index]')];
      const lit = toks.map((t, k) => (t.hasAttribute('data-speaking') ? k : -1)).filter((k) => k >= 0);
      const bar = document.querySelector('.listen-row')?.getBoundingClientRect();
      const floor = Math.min(innerHeight - 200, bar && bar.top > 0 ? bar.top - 40 : innerHeight);
      let ends = 0;
      for (let k = lit[lit.length - 1] + 1; k < toks.length; k += 1) {
        if (/[。！？]/u.test(toks[k - 1].textContent)) ends += 1;
        const r = toks[k].getBoundingClientRect();
        if (ends >= ahead && toks[k].classList.contains('content') && r.top > 200 && r.bottom < floor && /\p{Script=Han}/u.test(toks[k].textContent))
          return { index: Number(toks[k].dataset.index), x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      return null;
    }, ahead);
    if (at) return at;
    await page.evaluate(() => scrollBy(0, 140));
    await s.sleep(500);
  }
  return null;
}
try {
  await openArticle(s);
  const first = (await readState(page)).first;
  await waitFor((prev) => { const t = document.querySelector('#reader .tok[data-speaking]'); return t && Number(t.dataset.index) > prev; }, first, 20000);
  await s.sleep(400);
  const was = await readState(page);
  const target = await laterWord(3);
  if (!target) throw new Error('no word three sentences ahead in view');
  await press(await earMark(page));
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
  // only the ear's own request is held: the hold is on for the moment of the tap, then off for every later request
  s.holdSpeaks(() => true);
  const t0 = Date.now();
  if (s.phone) await page.touchscreen.tap(target.x, target.y); else await page.mouse.click(target.x, target.y);
  await s.sleep(1500);
  s.holdSpeaks(null);
  const heldText = '';
  if (CONTROL) setTimeout(() => { void s.releaseHeld(); }, 9000 - 1500);
  const struck = await waitFor(() => document.documentElement.dataset.ear === 'novoice', null, 12000);
  const why = await page.evaluate(() => document.querySelector('.ear-why:not([hidden])')?.textContent || '');
  const struckAt = Math.round((Date.now() - t0) / 100) / 10;
  // the read, every 2 s, until 42 s after the tap
  const seen = [];
  let failedAt = null, note = '';
  while (Date.now() - t0 < 42000) {
    const st = await readState(page);
    const bar = await page.evaluate(() => document.querySelector('.listen-row')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 70) || '');
    seen.push(`${Math.round((Date.now() - t0) / 1000)}s ${st.state}@${st.first}`);
    if (!/playing|loading/.test(st.state) && Date.now() - t0 > 10000 && failedAt === null && /no connection|接続なし|wait a minute|1分|busy|混雑|could not|声を出せません|out of reach/i.test(bar)) { failedAt = Math.round((Date.now() - t0) / 1000); note = bar; }
    await s.sleep(2000);
  }
  const blocked = fake.speaks().filter((r) => r.status === 200).length;
  const problems = [];
  if (!struck) problems.push('the ear was not struck within 12 s');
  if (failedAt !== null) problems.push(`the read stopped ${failedAt} s after the tap; the bar says "${note}"`);
  record(`the ear's sentence ${CONTROL ? 'answered at 9 s' : 'never answered'} during a read: the ear gives up at 8 s, and the read goes on`, problems,
    `struck at ${struckAt} s: "${why}"; read from ${was.first}: ${seen.join(', ')}; clips answered ${blocked}${heldText}`);
} catch (error) {
  record('the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
}
if (!CONTROL) await s.releaseHeld().catch(() => {});
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
