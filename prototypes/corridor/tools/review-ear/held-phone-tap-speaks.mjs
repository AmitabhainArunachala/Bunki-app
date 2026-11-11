// Review check (the behaviour table, "Held on", iPhone column): "A tap on Japanese text speaks it and does nothing else,
// until the ear is tapped off." Held on at phone size, one tap on a word of an article's running text (no read playing)
// must ask the voice for that sentence once and must not be the app's own tap (no reading shown, no box opened).
// The negative control (--control): the same tap with the ear off asks nothing and is the app's own.
//   node held-phone-tap-speaks.mjs --engine chromium|webkit [--width 390] [--control]
import { arg, earMark, earState, holdOn, open, openArticle, reporter } from './lib.mjs';

const ENGINE = arg('--engine', 'webkit');
const WIDTH = Number(arg('--width', '390'));
const CONTROL = process.argv.includes('--control');
const tag = `${ENGINE}-${WIDTH}${CONTROL ? '-control' : ''}`;
const { rows, record } = reporter(tag);
const s = await open({ engine: ENGINE, width: WIDTH, clipSeconds: () => 2, voicePort: Number(arg('--voice-port', '19532')) });
const { page, press, fake } = s;
try {
  await openArticle(s, { start: false });
  if (!CONTROL) await holdOn(s);
  // the same visible kanji word as a person would pick: in plain view, clear of the bars
  const index = await page.evaluate(() => {
    const toks = [...document.querySelectorAll('#reader .tok.content[data-index]')];
    for (const t of toks.slice(3)) { const r = t.getBoundingClientRect(); if (r.top > 140 && r.bottom < innerHeight - 200 && /\p{Script=Han}/u.test(t.textContent)) return Number(t.dataset.index); }
    return -1;
  });
  const word = page.locator(`#reader .tok[data-index="${index}"]`).first();
  const before = await page.evaluate(() => ({ lit: document.querySelectorAll('#reader .tok.lit, #reader rt:not(.hidden-rt)').length, box: !!document.getElementById('mini')?.getClientRects().length }));
  const log = await page.evaluate(() => { window.__review = []; for (const t of ['pointerdown', 'click']) window.addEventListener(t, (e) => window.__review.push(`${t}:${e.pointerType ?? '-'}`), true); });
  const n = fake.speaks().length;
  await press(word);
  await s.sleep(1500);
  const asked = fake.speaks().slice(n).map((r) => `${r.voiceKey} "${String(r.text).slice(0, 20)}"`);
  const after = await page.evaluate(() => ({ lit: document.querySelectorAll('#reader .tok.lit').length, box: !!document.getElementById('mini')?.getClientRects().length, ear: document.documentElement.dataset.ear, events: window.__review.join(' ') }));
  const problems = [];
  if (CONTROL) {
    if (asked.length) problems.push(`the ear off asked ${asked.length}`);
    if (!after.lit && !after.box) problems.push('the tap was not the app’s own (no reading, no box)');
    record('ear off: a tap on a word is the app’s own and asks nothing', problems, `requests ${asked.length}; lit ${after.lit}; box ${after.box}; events ${after.events}`);
  } else {
    if (asked.length !== 1) problems.push(`${asked.length} requests, not 1`);
    if (after.lit || after.box) problems.push(`the tap was also the app's own (reading shown on ${after.lit} word(s), box ${after.box})`);
    record('held on, phone: a tap on a word of running text speaks its sentence and does nothing else', problems,
      `requests ${asked.join(', ') || 'none'}; ear ${after.ear}; events ${after.events}`);
  }
  void log; void before;
} catch (error) {
  record('the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
}
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
