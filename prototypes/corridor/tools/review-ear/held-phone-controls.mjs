// Review check (hunt 3, "stuck or lost work"): the ear held on, on a phone. The brief's rules: "Never spoken: the app's
// own controls", and held on he can always turn the ear off, grade a card, leave a screen. Each case below is one tap a
// person makes with the ear held on (by a long press on the mark, on Today); each must do what the same tap does with the
// ear off, and none may be read aloud. Run in both interface languages: in the Japanese one the app's controls carry
// Japanese labels (戻る, 今日 読む 学ぶ 辞書 私, 1 枚 待っている), and in both the prototype's notes button is 試.
//   node held-phone-controls.mjs --engine chromium|webkit --ui ja|bi [--width 390] [--voice-port 19532]
import { arg, dismissFirstLine, earMark, earState, holdOn, open, openArticle, reporter } from './lib.mjs';

const ENGINE = arg('--engine', 'chromium');
const UI = arg('--ui', 'ja');
const WIDTH = Number(arg('--width', '390'));
const OUT = process.env.REVIEW_OUT || '.';
// --control: the same taps with the ear OFF (the negative control: each tap must do its work and ask nothing)
const CONTROL = process.argv.includes('--control');
const tag = `${ENGINE}-${WIDTH}-${UI}${CONTROL ? '-control' : ''}`;
const { rows, record } = reporter(tag);
const s = await open({ engine: ENGINE, width: WIDTH, ui: UI, clipSeconds: () => 0.6, voicePort: Number(arg('--voice-port', '19532')) });
const { page, press, fake } = s;
const at = () => page.evaluate(() => ({ view: document.body.dataset.view || '', sheet: document.getElementById('sheet')?.dataset.node || '',
  notes: !!document.getElementById('prototype-sheet')?.getClientRects().length, reveal: !!document.getElementById('reveal'),
  marks: document.querySelectorAll('.ear-mark').length }));
const toToday = async () => {
  await s.ready();
  await press('#home-review').catch(() => {});
  await page.locator('#tab-today').waitFor();
  await press('#tab-today'); await s.sleep(1200);
  await dismissFirstLine(s);
};
const heldOnToday = async () => {
  await toToday();
  if ((await earState(page)) !== 'off') { await press(await earMark(page)); await s.sleep(300); }
  if (!CONTROL) await holdOn(s);
};
/** one tap with the ear held on: what changed, and what was sent to the voice server */
async function heldTap(name, selector, changed) {
  try {
    await heldOnToday();
    const target = page.locator(selector).first();
    const label = ((await target.textContent().catch(() => '')) || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    const before = await at();
    const n = fake.speaks().length;
    await press(target);
    await s.sleep(1500);
    const after = await at();
    const asked = fake.speaks().slice(n).map((r) => `${r.voiceKey} "${r.text}"`);
    const problems = [];
    if (!changed(before, after)) problems.push('the tap did not do what it does with the ear off');
    if (asked.length) problems.push(`the control was read aloud: ${asked.join(', ')}`);
    record(`held on: a tap on ${name} does its own work and is not read aloud`, problems,
      `"${label}"; view ${before.view} → ${after.view}; notes ${after.notes}; requests ${asked.length}; ear ${await earState(page)}`);
    await page.screenshot({ path: `${OUT}/held-${tag}-${name.replace(/\W+/g, '-')}.png` }).catch(() => {});
  } catch (error) {
    record(`held on: a tap on ${name}`, [`the check could not run: ${String(error.message).split('\n')[0].slice(0, 160)}`]);
  }
}

try {
  // a saved word, so that Today has a card to review
  await openArticle(s, { start: false });
  const word = page.locator('.reader .tok.content').first();
  for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await press(word); await s.sleep(700); }
  await press('#mini-take'); await s.sleep(900);

  // 1. the long press holds it on; then ONE tap on the mark turns it off ("until the ear is tapped off")
  if (!CONTROL) {
  await toToday();
  await holdOn(s);
  await press(await earMark(page));
  await s.sleep(400);
  const afterOneTap = await earState(page);
  record('held on by a long press, one tap on the mark turns the ear off', afterOneTap === 'off' ? [] : [`after one tap the ear is "${afterOneTap}"`], `after one tap: ${afterOneTap}`);
  }

  // 2–5. the app's own controls, held on
  await heldTap('the start-review card', '#review-start', (b, a) => a.reveal);
  await heldTap('the Learn tab', '#tab-learn', (b, a) => a.view !== b.view);
  await heldTap('Back', '#app > .chrome [data-bar-back], #app > .chrome button.back', (b, a) => a.view !== b.view);
  await heldTap('the prototype’s notes button 試', '#prototype-open', (b, a) => a.notes);

  // 6. a screen he reaches with the ear held on keeps a mark to turn it off (the review card). The coordinator's ruling C1
  // (2026-11-11, after this review): the study card's look does not change, so the ear is never left on where its mark is
  // not shown; entering a screen without one turns the ear off, silently. Held on from Today, then the review card.
  await heldOnToday();
  await press('#review-start');
  await page.locator('#reveal').waitFor();
  await s.sleep(600);
  const review = await at();
  const earNow = await earState(page);
  record('the review card: the ear is not left on without a mark to turn it off (ruling C1)',
    review.marks || CONTROL || earNow === 'off' ? [] : [`no ear mark on the review card and the ear is "${earNow}"`], `${review.marks} mark(s) on ${review.view}; ear ${earNow}`);
} catch (error) {
  record('the check ran to its end', [String(error.message).split('\n')[0].slice(0, 200)]);
  await page.screenshot({ path: `${OUT}/held-${tag}-error.png` }).catch(() => {});
}
await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
