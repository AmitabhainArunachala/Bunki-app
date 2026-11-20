// Re-check of the fix round: one variation per finding that the fix might not cover. Muted, stand-in voice, loopback.
//   box-refused  (B3) a playing read; the word box's speaker; the server refuses the word (429): the read takes itself up
//   paused-refused (B3, C2, C5) a paused read; an armed ear tap; the server refuses (429): the ear shows the per-minute
//                line, the bar stays paused, and play takes the read up at its sentence
//   enter        (B4) armed, the Learn tab (学ぶ in the Japanese UI) focused and pressed with Enter: it navigates, nothing asked
//   sky-held     (R-a) held on, on the phone, a finger's tap on a sky word (role=button, a control): the sky's own, nothing asked
//   sky-then     (B5) armed tap on a sky word, then at once a plain tap on another: the second is the sky's own, asks nothing
//   hung-limit   (C3) a playing read; the ear's sentence never arrives: the ear gives up (struck, plain line), the read resumes
//   deck         (C1) held on in Learn's bar, then the deck card (no mark there): the ear rests off
//   node fr1-variations.mjs --engine chromium|webkit [--width 390] [--ui ja|bi] --cases a,b,c
import { arg, dismissFirstLine, earMark, earState, holdOn, open, openArticle, readState, reporter } from './lib.mjs';

const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '390'));
const UI = arg('--ui', 'ja');
const CASES = arg('--cases', 'box-refused,paused-refused,enter,sky-held,sky-then,deck').split(',');
const OUT = process.env.REVIEW_OUT || '.';
const tag = `${ENGINE}-${WIDTH}-${UI}`;
const { rows, record } = reporter(tag);
const s = await open({ engine: ENGINE, width: WIDTH, ui: UI, clipSeconds: () => 6, voicePort: Number(arg('--voice-port', '19532')) });
const { page, press, fake } = s;
const waitFor = (fn, a, timeout) => page.waitForFunction(fn, a, { timeout }).then(() => true, () => false);
const tapAt = async (p) => { if (s.phone) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };
async function run(name, body) {
  if (!CASES.includes(name)) return;
  try { await body(); } catch (error) {
    record(`${name}: the case ran to its end`, [String(error.message).split('\n')[0].slice(0, 200)]);
    await page.screenshot({ path: `${OUT}/fr1-${tag}-${name}-error.png` }).catch(() => {});
  }
}
async function freshRead() {
  await openArticle(s);
  const first = (await readState(page)).first;
  await waitFor((prev) => { const t = document.querySelector('#reader .tok[data-speaking]'); return t && Number(t.dataset.index) > prev; }, first, 20000);
  await s.sleep(400);
  return readState(page);
}
/** a visible kanji word at least `ahead` sentence ends after the lit sentence */
async function laterWord(ahead) {
  await page.evaluate(() => { const t = document.querySelector('#reader .tok[data-speaking]'); if (t) scrollBy(0, t.getBoundingClientRect().top - 110); });
  await s.sleep(500);
  for (let i = 0; i < 4; i += 1) {
    const at = await laterWordHere(ahead);
    if (at) return at;
    await page.evaluate(() => scrollBy(0, 140));
    await s.sleep(500);
  }
  return null;
}
function laterWordHere(ahead) {
  return page.evaluate((ahead) => {
    const toks = [...document.querySelectorAll('#reader .tok[data-index]')];
    const lit = toks.map((t, i) => (t.hasAttribute('data-speaking') ? i : -1)).filter((i) => i >= 0);
    const bar = document.querySelector('.listen-row')?.getBoundingClientRect();
    const floor = Math.min(innerHeight - 200, bar && bar.top > 0 ? bar.top - 40 : innerHeight);
    let ends = 0;
    for (let i = lit[lit.length - 1] + 1; i < toks.length; i += 1) {
      if (/[。！？]/u.test(toks[i - 1].textContent)) ends += 1;
      const r = toks[i].getBoundingClientRect();
      if (ends >= ahead && toks[i].classList.contains('content') && r.top > 200 && r.bottom < floor && /\p{Script=Han}/u.test(toks[i].textContent))
        return { index: Number(toks[i].dataset.index), x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }, ahead);
}
const back = (first, timeout) => waitFor((first) => {
  const t = document.querySelector('#reader .tok[data-speaking]');
  return t && Number(t.dataset.index) === first && /playing|loading/.test(document.querySelector('.listen-row')?.dataset.voiceState || '');
}, first, timeout);

await run('box-refused', async () => {
  const was = await freshRead();
  // a word of the lit sentence's line opens its box (the read goes on)
  const index = await page.evaluate(() => { const t = [...document.querySelectorAll('#reader .tok.content[data-index]')].find((t) => { const r = t.getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight - 260 && /\p{Script=Han}/u.test(t.textContent) && !t.hasAttribute('data-speaking'); }); return t ? Number(t.dataset.index) : -1; });
  const word = page.locator(`#reader .tok[data-index="${index}"]`).first();
  for (let i = 0; i < 4 && !(await page.locator('#mini').isVisible().catch(() => false)); i += 1) { await press(word); await s.sleep(700); }
  const at = (await readState(page)).first;
  const n = fake.speaks().length;
  fake.failNext({ status: 429, error: 'request-rate-limit', headers: { 'Retry-After': '60' } });
  await press('#mini-voice');
  const ok = await back(at, 9000);
  await s.sleep(400);
  const after = await readState(page);
  const refused = fake.speaks().slice(n).filter((r) => r.status === 429).map((r) => `"${String(r.text).slice(0, 10)}"`);
  const note = await page.evaluate(() => document.querySelector('.listen-row')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) || '');
  record('a playing read; the box’s speaker is refused (429): the read takes itself up at its sentence', [...(refused.length ? [] : ['the word was not asked']), ...(ok ? [] : [`the read is ${after.state} at ${after.first}; the bar says "${note}"`])],
    `read at ${was.first} → box at ${at}; refused ${refused.join(', ')}; after ${after.state} at ${after.first}`);
});

await run('paused-refused', async () => {
  await freshRead();
  await press('#listen-toggle');
  await waitFor(() => document.querySelector('.listen-row')?.dataset.voiceState === 'paused', null, 6000);
  const was = await readState(page);
  const target = await laterWord(3);
  if (!target) throw new Error('no word three sentences ahead in view');
  fake.failNext({ status: 429, error: 'request-rate-limit', headers: { 'Retry-After': '60' } });
  await press(await earMark(page));
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
  await tapAt(target);
  const struck = await waitFor(() => document.documentElement.dataset.ear === 'novoice', null, 6000);
  const why = await page.evaluate(() => document.querySelector('.ear-why:not([hidden])')?.textContent || '');
  await s.sleep(800);
  const mid = await readState(page);
  await press('#listen-toggle');
  const resumed = await back(was.first, 9000);
  const after = await readState(page);
  const problems = [];
  if (!struck) problems.push('the ear was not struck');
  if (!/minute|1分/.test(why)) problems.push(`the ear's line is "${why}", not the per-minute reason`);
  if (mid.state !== 'paused') problems.push(`the bar is "${mid.state}" after the ear's refusal, not paused`);
  if (!resumed) problems.push(`play did not take the read up at ${was.first} (${after.state} at ${after.first})`);
  record('a paused read; the ear refused (429): struck with the per-minute line, the bar stays paused, play resumes at its sentence', problems,
    `why "${why}"; bar ${mid.state}; after play ${after.state} at ${after.first}`);
});

await run('enter', async () => {
  await s.ready();
  await press('#home-review').catch(() => {});
  await page.locator('#tab-today').waitFor();
  await press('#tab-today'); await s.sleep(1000);
  await dismissFirstLine(s);
  await press(await earMark(page));
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
  const label = ((await page.locator('#tab-learn').textContent()) || '').trim();
  const n = fake.speaks().length;
  await page.locator('#tab-learn').focus();
  await page.keyboard.press('Enter');
  await s.sleep(1200);
  const view = await page.evaluate(() => document.body.dataset.view);
  const asked = fake.speaks().slice(n).length;
  record('armed: Enter on a focused tab with a Japanese name navigates and asks nothing', [...(view === 'dojo' ? [] : [`still on ${view}`]), ...(asked ? [`asked ${asked}`] : [])],
    `"${label}"; view ${view}; requests ${asked}; ear ${await earState(page)}`);
  if ((await earState(page)) !== 'off') await press(await earMark(page)).catch(() => {});
});

const skyWords = () => page.evaluate(() => [...document.querySelectorAll('#sky div.word')].map((w, i) => { const r = w.getBoundingClientRect(); return { i, x: r.left + r.width / 2, y: r.top + r.height / 2, ok: r.top > 120 && r.bottom < innerHeight - 160 && r.left > 40 && r.right < innerWidth - 40 }; }).filter((w) => w.ok));
const skyState = () => page.evaluate(() => ({ unfolded: document.querySelectorAll('#sky .unfolded, #sky .glossed').length, cls: [...document.querySelectorAll('#sky div.word')].map((w) => w.className).join('|').length,
  box: !!document.getElementById('mini')?.getClientRects().length, sheet: document.getElementById('sheet')?.dataset.node || '' }));

await run('sky-held', async () => {
  await s.ready(); await s.sleep(1800);
  await holdOn(s);
  const [w] = await skyWords();
  if (!w) throw new Error('no sky word in plain view');
  const before = await skyState();
  const n = fake.speaks().length;
  await tapAt(w);
  await s.sleep(1500);
  const after = await skyState();
  const asked = fake.speaks().slice(n).map((r) => `"${r.text}"`);
  const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
  // ruling R-a: a sky word is a div with role=button (drift-layer.js 1190), one of the app's controls: held on, on the
  // phone, it acts as always and is not spoken (the armed tap speaks it)
  record('held on, a finger’s tap on a sky word (a control under R-a): the sky’s own, nothing asked', [...(asked.length === 0 ? [] : [`${asked.length} requests`]), ...(changed.length ? [] : ['the sky did not act'])],
    `requests ${asked.join(', ') || 'none'}; changed ${changed.join(', ') || 'nothing'}; ear ${await earState(page)}`);
  if ((await earState(page)) !== 'off') { await press(await earMark(page)).catch(() => {}); }
});

await run('sky-then', async () => {
  await s.ready(); await s.sleep(1800);
  const words = await skyWords();
  if (words.length < 2) throw new Error('fewer than two sky words in plain view');
  await press(await earMark(page));
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
  const n = fake.speaks().length;
  await tapAt(words[0]);
  await s.sleep(150);
  const mid = await skyState();
  await tapAt(words[1]);
  await s.sleep(1500);
  const after = await skyState();
  const asked = fake.speaks().slice(n).map((r) => `"${r.text}"`);
  record('armed tap on a sky word, then at once a plain tap on another: one request, and the second tap is the sky’s', [...(asked.length === 1 ? [] : [`${asked.length} requests`]), ...(after.cls !== mid.cls || after.unfolded !== mid.unfolded ? [] : ['the second tap did nothing in the sky'])],
    `requests ${asked.join(', ')}; after the first ${JSON.stringify(mid)}; after the second ${JSON.stringify(after)}`);
});

await run('hung-limit', async () => {
  const was = await freshRead();
  const target = await laterWord(3);
  if (!target) throw new Error('no word three sentences ahead in view');
  s.holdSpeaks(() => true);
  const t0 = Date.now();
  await press(await earMark(page));
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
  await tapAt(target);
  const struck = await waitFor(() => document.documentElement.dataset.ear === 'novoice', null, 14000);
  const after = Math.round((Date.now() - t0) / 100) / 10;
  const why = await page.evaluate(() => document.querySelector('.ear-why:not([hidden])')?.textContent || '');
  const resumed = await back(was.first, 6000);
  const st = await readState(page);
  s.holdSpeaks(null);
  await s.releaseHeld();
  record('the ear’s sentence never arrives during a read: the ear gives up with its line, and the read takes itself up', [...(struck ? [] : ['the ear was not struck within 14 s']), ...(why ? [] : ['no plain line']), ...(resumed ? [] : [`the read is ${st.state} at ${st.first}`])],
    `struck after ${after} s: "${why}"; read ${was.first} → ${st.first} ${st.state}`);
});

await run('deck', async () => {
  await s.ready();
  await press('#home-review').catch(() => {});
  await page.locator('#tab-learn').waitFor();
  await press('#tab-learn'); await s.sleep(1200);
  await dismissFirstLine(s);
  await holdOn(s);
  // the deck's door is the app's own control: held on, it acts (R-a)
  await press('.learn-go-deck');
  await page.locator('#kp-reveal').waitFor({ timeout: 8000 });
  await s.sleep(700);
  const st = await page.evaluate(() => ({ ear: document.documentElement.dataset.ear, marks: [...document.querySelectorAll('.ear-mark')].filter((m) => { const r = m.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.width && hit?.closest('.ear-mark') === m; }).length }));
  record('held on, then the deck card: no reachable mark there, so the ear rests off', st.marks || st.ear === 'off' ? [] : [`the ear is "${st.ear}" and no mark can be reached`], JSON.stringify(st));
});

await s.close();
const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed; page errors ${s.errors.length}; off this machine ${s.offMachine.length}`);
process.exit(failed ? 1 : 0);
