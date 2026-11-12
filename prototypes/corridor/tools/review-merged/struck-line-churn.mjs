// Review of the merged branch (hunt 6 and 7, the struck ear's line): since 09740ceea the ear's mount() paints every mark
// (paintMark) at each rescan of the voice layer, and paintMark sets the struck line's text again (why.textContent = ...).
// Setting text replaces the line's text node, which is a childList change under body, which the voice layer's
// MutationObserver answers with another rescan 60 ms later (voice-layer.mjs rescan: mountMarks, the bands, ear.mount()).
// While the line shows (about 4 s) that may be a loop. This counts, from the moment the mark is struck until 5 s later:
// the childList records under body whose target is the struck line, and the main thread's long tasks (Chromium).
// The rule asked of it: the line is written once when it shows and once when it goes; the page does not keep working.
//   node struck-line-churn.mjs --engine chromium|webkit [--width 1728|390]
import { arg, dismissFirstLine, earMark, open, reporter } from '../review-ear/lib.mjs';

const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '1728'));
const tag = `${ENGINE}-${WIDTH}`;
const { rows, record } = reporter(tag);
// unpaired: any tap the ear takes is struck with "not paired" at once, and nothing is asked of a server
const s = await open({ engine: ENGINE, width: WIDTH, pair: false, voicePort: Number(arg('--voice-port', '19612')) });
const { page, press } = s;
try {
  await s.ready();
  await press('#home-review').catch(() => {});
  await page.locator('#tab-today').waitFor();
  await press('#tab-today'); await s.sleep(1500);
  await dismissFirstLine(s);
  await page.evaluate(() => {
    window.__churn = { lines: 0, records: 0, long: 0, longMs: 0 };
    new MutationObserver((list) => {
      for (const m of list) { window.__churn.records += 1; if (m.target.closest?.('.ear-why') || m.target.classList?.contains('ear-why')) window.__churn.lines += 1; }
    }).observe(document.body, { childList: true, subtree: true });
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__churn.long += 1; window.__churn.longMs += e.duration; } }).observe({ type: 'longtask', buffered: false }); } catch { /* WebKit has no long tasks */ }
  });
  // arm the ear and tap a word of Today's Japanese: unpaired, the mark is struck with its line
  await press(await earMark(page));
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
  const target = await page.evaluate(() => {
    for (const el of document.querySelectorAll('main *')) {
      if (el.children.length || !/[\p{Script=Han}]{2}/u.test(el.textContent)) continue;
      const r = el.getBoundingClientRect();
      if (r.top > 140 && r.bottom < innerHeight - 160 && r.width > 10) return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: el.textContent.trim().slice(0, 12) };
    }
    return null;
  });
  if (!target) throw new Error('no Japanese on Today in plain view');
  await page.evaluate(() => { window.__churn.lines = 0; window.__churn.records = 0; window.__churn.long = 0; window.__churn.longMs = 0; });
  if (s.phone) await page.touchscreen.tap(target.x, target.y); else await page.mouse.click(target.x, target.y);
  const struck = await page.waitForFunction(() => document.documentElement.dataset.ear === 'novoice', null, { timeout: 3000 }).then(() => true, () => false);
  await s.sleep(5000);
  const c = await page.evaluate(() => ({ ...window.__churn, ear: document.documentElement.dataset.ear, shown: !document.querySelector('.ear-why')?.hidden }));
  const problems = [];
  if (!struck) problems.push('the mark was not struck');
  if (c.lines > 4) problems.push(`the struck line was written ${c.lines} times in 5 s (the page rescans itself while it shows)`);
  record('a struck mark writes its line once to show it and once to take it away; the page does not keep working', problems,
    `tapped "${target.text}"; line writes ${c.lines}; childList records under body ${c.records}; long tasks ${c.long} (${Math.round(c.longMs)} ms); ear now ${c.ear}, line shown ${c.shown}`);
} catch (error) {
  record('the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
}
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
