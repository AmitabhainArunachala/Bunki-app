// Review check (hunt 6, "the read under the ear"): an article being read, and the ear taking a turn (the phone's way:
// tap the ear, tap a word of a later sentence). The rule (John, 2026-11-11): "when i hit play, the only thing that should
// stop that is hitting the pause button itself"; the builder's A9: the read yields to the ear and takes itself up again
// at the same sentence. Each case starts a fresh read of the first article:
//   two     two ear turns in a row: after the second voice ends the read takes itself up at the sentence it had reached
//   refused the server refuses the ear's sentence (429 request-rate-limit, one minute): the ear is struck; the read takes
//           itself up at the same sentence (its sentence and the next two are already on the device)
//   hung    the ear's sentence never arrives; he presses pause meanwhile; when it arrives and ends, the read stays paused
//   left    the ear speaks and he leaves the article (Back): no read starts again anywhere afterwards
//   node read-under-ear.mjs --engine webkit|chromium [--width 390] [--cases two,refused,hung,left]
import { arg, earMark, open, openArticle, readState, reporter } from './lib.mjs';

const ENGINE = arg('--engine', 'webkit');
const WIDTH = Number(arg('--width', '390'));
const CASES = arg('--cases', 'two,refused,hung,left').split(',');
const OUT = process.env.REVIEW_OUT || '.';
const tag = `${ENGINE}-${WIDTH}`;
const { rows, record } = reporter(tag);
const s = await open({ engine: ENGINE, width: WIDTH, clipSeconds: () => 6, voicePort: Number(arg('--voice-port', '19532')) });
const { page, press, fake } = s;
const waitFor = (fn, a, timeout) => page.waitForFunction(fn, a, { timeout }).then(() => true, () => false);

/** a visible kanji word at least `ahead` sentence ends after the lit sentence, clear of the bars, measured after the page
 * has settled (the read scrolls by itself); returned with the point a finger would touch */
async function laterWord(ahead = 2) {
  const find = () => page.evaluate((ahead) => {
    const toks = [...document.querySelectorAll('#reader .tok[data-index]')];
    const lit = toks.filter((t) => t.hasAttribute('data-speaking'));
    if (!lit.length) return null;
    const bar = document.querySelector('.listen-row')?.getBoundingClientRect();
    const floor = Math.min(innerHeight - 200, bar && bar.top > 0 ? bar.top - 40 : innerHeight);
    let ends = 0;
    for (let i = toks.indexOf(lit[lit.length - 1]) + 1; i < toks.length; i += 1) {
      if (/[。！？]/u.test(toks[i - 1].textContent)) ends += 1;
      const r = toks[i].getBoundingClientRect();
      if (ends >= ahead && toks[i].classList.contains('content') && r.top > 200 && r.bottom < floor && r.width > 6 && /\p{Script=Han}/u.test(toks[i].textContent))
        return { index: Number(toks[i].dataset.index), x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }, ahead);
  // the lit sentence brought up near the top by hand, so the sentences after it fill the screen
  await page.evaluate(() => { const t = document.querySelector('#reader .tok[data-speaking]'); if (t) scrollBy(0, t.getBoundingClientRect().top - 110); });
  await s.sleep(500);
  let at = await find();
  for (let i = 0; i < 3 && !at; i += 1) { await page.evaluate(() => scrollBy(0, 120)); await s.sleep(500); at = await find(); }
  if (!at) throw new Error(`no visible word ${ahead} sentence(s) after the lit one`);
  return at;
}
/** a visible kanji word at least one sentence end after the word `from` (no scrolling: the screen as it stands) */
const wordAfter = (from) => page.evaluate((from) => {
  const toks = [...document.querySelectorAll('#reader .tok[data-index]')];
  const start = toks.findIndex((t) => Number(t.dataset.index) === from);
  const bar = document.querySelector('.listen-row')?.getBoundingClientRect();
  const floor = Math.min(innerHeight - 200, bar && bar.top > 0 ? bar.top - 40 : innerHeight);
  let ends = 0;
  for (let i = start + 1; i < toks.length; i += 1) {
    if (/[。！？]/u.test(toks[i - 1].textContent)) ends += 1;
    const r = toks[i].getBoundingClientRect();
    if (ends >= 1 && toks[i].classList.contains('content') && r.top > 120 && r.bottom < floor && /\p{Script=Han}/u.test(toks[i].textContent))
      return { index: Number(toks[i].dataset.index), x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}, from);
/** two visible kanji words in two sentences other than the lit one: one before it, one after it */
async function twoOtherWords() {
  await page.evaluate(() => { const t = document.querySelector('#reader .tok[data-speaking]'); if (t) scrollBy(0, t.getBoundingClientRect().top - 330); });
  await s.sleep(500);
  return page.evaluate(() => {
    const toks = [...document.querySelectorAll('#reader .tok[data-index]')];
    const lit = toks.map((t, i) => (t.hasAttribute('data-speaking') ? i : -1)).filter((i) => i >= 0);
    const ok = (t) => { const r = t.getBoundingClientRect(); return t.classList.contains('content') && r.top > 120 && r.bottom < innerHeight - 260 && /\p{Script=Han}/u.test(t.textContent); };
    const at = (t) => { const r = t.getBoundingClientRect(); return { index: Number(t.dataset.index), x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    let before = null, after = null;
    for (let i = lit[0] - 1; i >= 0 && !before; i -= 1) if (ok(toks[i])) before = at(toks[i]);
    for (let i = lit[lit.length - 1] + 2; i < toks.length && !after; i += 1) if (ok(toks[i])) after = at(toks[i]);
    return [before, after];
  });
}
async function earTurn(at) {
  await press(await earMark(page));
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
  // the point measured a moment ago, touched at once (the read may move the page again)
  const now = await page.evaluate((index) => { const r = document.querySelector(`#reader .tok[data-index="${index}"]`)?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }, at.index);
  const p = now || at;
  if (s.phone) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
}
/** a fresh read, advanced past its first sentence */
async function freshRead() {
  await openArticle(s);
  const first = (await readState(page)).first;
  await waitFor((prev) => { const t = document.querySelector('#reader .tok[data-speaking]'); return t && Number(t.dataset.index) > prev; }, first, 20000);
  await s.sleep(400);
  return readState(page);
}
const earBusy = () => page.evaluate(() => document.documentElement.dataset.ear === 'speaking' || document.documentElement.hasAttribute('data-ear-voice'));
const readBack = (first, timeout) => waitFor((first) => {
  const t = document.querySelector('#reader .tok[data-speaking]');
  return t && Number(t.dataset.index) === first && /playing|loading/.test(document.querySelector('.listen-row')?.dataset.voiceState || '');
}, first, timeout);

async function run(name, body) {
  if (!CASES.includes(name)) return;
  try { await body(); } catch (error) {
    record(`${name}: the case ran to its end`, [String(error.message).split('\n')[0].slice(0, 200)]);
    await page.screenshot({ path: `${OUT}/read-under-ear-${tag}-${name}-error.png` }).catch(() => {});
  }
}

await run('two', async () => {
  const was = await freshRead();
  const asksBefore = fake.speaks().length;
  const [a, b] = await twoOtherWords();
  if (!a || !b) throw new Error('no word before and after the lit sentence in view');
  await earTurn(a);
  await waitFor(() => document.documentElement.dataset.ear === 'speaking', null, 6000);
  await s.sleep(300);
  await earTurn(b);
  await s.sleep(300);
  const during = await readState(page);
  const ended = await waitFor(() => !(document.documentElement.dataset.ear === 'speaking' || document.documentElement.hasAttribute('data-ear-voice')), null, 20000);
  const back = await readBack(was.first, 12000);
  const after = await readState(page);
  const problems = [];
  if (!ended) problems.push('the ear’s second voice did not end');
  if (!back) problems.push(`the read did not take itself up at word ${was.first} (it is at ${after.first}, ${after.state})`);
  if (after.earBands) problems.push(`${after.earBands} ear band(s) left`);
  // the two sentences are ones the read has already fetched (the one before it, the next one): the ear asks nothing new
  const earAsks = fake.speaks().slice(asksBefore).filter((r) => r.status === 200 && !r.cached).map((r) => `"${String(r.text).slice(0, 14)}"`);
  console.log(`  two: new clips asked during the two ear turns and after: ${earAsks.length} ${earAsks.join(', ')}; read's own texts: ${fake.speaks().slice(0, asksBefore).map((r) => `"${String(r.text).slice(0, 14)}"`).join(', ')}`);
  record('two ear turns in a row during a read: the read takes itself up at the sentence it had reached', problems,
    `read at ${was.first} (session ${was.session}); during ${during.state} (session ${during.session}); after ${after.first} ${after.state} (session ${after.session})`);
});

await run('refused', async () => {
  const was = await freshRead();
  const at = await laterWord(3);
  const n = fake.speaks().length;
  fake.failNext({ status: 429, error: 'request-rate-limit', headers: { 'Retry-After': '60' } });
  await earTurn(at);
  await waitFor(() => document.documentElement.dataset.ear === 'novoice', null, 6000);
  const struck = await page.evaluate(() => ({ ear: document.documentElement.dataset.ear, why: document.querySelector('.ear-why:not([hidden])')?.textContent || '' }));
  const back = await readBack(was.first, 8000);
  await s.sleep(500);
  const after = await readState(page);
  const note = await page.evaluate(() => document.querySelector('.listen-row')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) || '');
  const refusedRow = fake.speaks().slice(n).find((r) => r.status === 429);
  const problems = [];
  if (!refusedRow) problems.push('the server was not asked for the ear’s sentence');
  if (!back) problems.push(`the read did not take itself up at word ${was.first}: it is ${after.state || 'gone'} at ${after.first}; the bar says "${note}"`);
  record('the server refuses the ear’s sentence during a read: the read takes itself up at the same sentence', problems,
    `ear ${struck.ear} "${struck.why}"; refused "${String(refusedRow?.text || '').slice(0, 16)}"; read ${was.first} → ${after.first} ${after.state}`);
  await page.screenshot({ path: `${OUT}/read-under-ear-${tag}-refused.png` }).catch(() => {});
});

await run('hung', async () => {
  const was = await freshRead();
  const at = await laterWord(3);
  s.holdSpeaks(() => true);
  await earTurn(at);
  await s.sleep(2500);
  const during = await readState(page);
  // he presses pause on the bar while nothing is heard
  if (!(await page.locator('#listen-toggle').isVisible().catch(() => false))) await press('#listen-open');
  await press('#listen-toggle');
  await s.sleep(800);
  const paused = await readState(page);
  s.holdSpeaks(null);
  await s.releaseHeld();
  const ended = await waitFor(() => !(document.documentElement.dataset.ear === 'speaking' || document.documentElement.hasAttribute('data-ear-voice')), null, 20000);
  await s.sleep(2500);
  const after = await readState(page);
  const problems = [];
  if (!/paused/.test(paused.state)) problems.push(`the pause pressed while the ear's sentence was on its way left the bar "${paused.state}"`);
  if (/playing|loading/.test(after.state)) problems.push(`the read he paused started again by itself (${after.state} at ${after.first})`);
  if (!ended) problems.push('the ear’s voice did not end');
  record('the ear’s sentence never arrives during a read; he pauses; then it arrives: the read stays paused', problems,
    `while waiting the bar said ${during.state} (ear ${during.ear}); after pause ${paused.state}; after the ear ${after.state} at ${after.first}`);
});

await run('left', async () => {
  await freshRead();
  const at = await laterWord(2);
  await earTurn(at);
  await waitFor(() => document.documentElement.dataset.ear === 'speaking', null, 6000);
  const backButton = page.locator('#app > .chrome [data-bar-back], #app > .chrome button.back').first();
  await press(backButton);
  await s.sleep(500);
  const left = await page.evaluate(() => document.body.dataset.view);
  const n = fake.speaks().length;
  const session = (await readState(page)).session;
  await s.sleep(6000);
  const later = fake.speaks().slice(n).map((r) => `${r.voiceKey} "${String(r.text).slice(0, 12)}"`);
  const after = await readState(page);
  const problems = [];
  if (left === 'reader') problems.push('Back did not leave the article');
  if (later.length) problems.push(`after he left, the server was asked ${later.length} more time(s): ${later.join(', ')}`);
  if (after.session !== session) problems.push(`a read started again after he left (session ${session} → ${after.session})`);
  if (after.earVoice || after.ear === 'speaking') problems.push('the ear still speaks on the next screen');
  record('the ear speaks during a read and he leaves the article: nothing starts again', problems, `left for ${left}; requests after ${later.length}; session ${session} → ${after.session}; ear ${after.ear}`);
});

await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
