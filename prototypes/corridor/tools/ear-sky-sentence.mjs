#!/usr/bin/env node
/** The ear reads a sentence under an opened word on the sky (2026-11-12). Version 3 of the sky shows, under an opened
 * word, a sentence from the learner's own reading: a caption the engine prints and does not pick (a tap there lets the
 * family go). sky/mount.mjs makes it the ear's: armed or held on, a tap on it says that sentence and the family stays
 * open; with the ear off the engine acts as before.
 *
 *   armed     armed, a tap on the sentence: asked once, the sentence's Japanese (not its English, not its source); the
 *             family stays open; the ear goes off
 *   held      held on: on a phone a tap on the sentence says it (a sentence is running text, not one of the sky's
 *             controls) and the family stays open, the ear still held; on the Mac the pointer resting on it says it
 *   option    the Mac, ear off, Option-click on the sentence: said, the family stays open
 *   off       ear off, a tap on the sentence: nothing asked, and the engine lets the family go, as it always did
 * On a phone the engine shows no sentence under an opened word (sky-web.js: .cap .cx is not displayed under 720 px), so
 * there the sentence is an opened grammar pattern's example (its .exj row), which the phone does show; on the Mac both.
 * 声 (said by itself) is turned off, so an opened word does not say itself and every request is a tap's.
 *
 * Silent: the review harness (review-ear/lib.mjs), loopback, the stand-in voice; ?sky=1.
 *   REVIEW_BASE=http://127.0.0.1:19600/ node prototypes/corridor/tools/ear-sky-sentence.mjs [--engine webkit|chromium]
 *        [--width 1728|390] [--cases armed,held,option,off] [--voice-port 19601] [--out DIR]
 */
import { arg, earMark, earState, holdOn, open, reporter } from './review-ear/lib.mjs';

const ENGINE = arg('--engine', 'webkit');
const WIDTH = Number(arg('--width', '1728'));
const PHONE = WIDTH < 700;
const CASES = arg('--cases', PHONE ? 'armed,held,off' : 'armed,held,option,off').split(',');
const OUT = arg('--out', process.env.REVIEW_OUT || '.');
const port = Number(arg('--voice-port', '19601'));
const tag = `${ENGINE}-${WIDTH}`;
const { rows, record } = reporter(tag);
const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

async function sky() {
  const s = await open({ engine: ENGINE, width: WIDTH, touch: PHONE, clipSeconds: () => 2, voicePort: port, args: GPU });
  await s.ready('sky=1');
  const ok = await s.page.waitForFunction(() => window.__bunkiSkyApp?.state === 'mounted' && window.__SKY__?.W?.ready && window.__SKY__.W.ctx?.wordSent, null, { timeout: 45000 }).then(() => true, () => false);
  if (!ok) { const st = await s.page.evaluate(() => JSON.stringify(window.__bunkiSkyApp)); await s.close(); throw new Error(`the sky did not mount with its context: ${st}`); }
  await s.sleep(2000);
  await s.page.evaluate(async () => { const m = await import('/corridor.js'); m.setWordPref(m.WORD_VOICE_KEY, 'wordVoice', m.WORD_VOICE, 'off'); });
  return s;
}
/** Open a word that has a sentence (on a phone, a grammar pattern with an example) by the engine's own open, wait for its
 * caption, and return a point on the sentence's Japanese with the sentence as the caption shows it. */
async function openWithSentence(s, kind = PHONE ? 'g' : 'w') {
  const word = await s.page.evaluate((kind) => {
    const W = window.__SKY__.W, C = W.ctx;
    if (kind === 'g') { const g = W.gram.find((x) => x.ex && x.ex.length && x.ex[0][0]); W.web.open('g', g.i); return g.p; }
    const i = W.hits.find((k) => C.wordSent[k]?.length) ?? Number(Object.keys(C.wordSent)[0]);
    W.web.open('w', i);
    return W.D.words[i][0];
  }, kind);
  const sel = kind === 'g' ? '.cap .exj' : '.cap .cx';
  await s.page.waitForFunction((sel) => { const b = window.__SKY__.ui.querySelector(sel); return b && b.getClientRects().length && Number(getComputedStyle(b.closest('.cap')).opacity) > 0.9; }, sel, { timeout: 8000 });
  await s.sleep(800);
  const at = await s.page.evaluate((sel) => {
    const block = window.__SKY__.ui.querySelector(sel);
    const nodes = [];
    const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) nodes.push(c); else if (c.nodeType === 1 && !c.matches('.en, .src, button')) walk(c); } };
    walk(block);
    // the middle of the sentence's longest run of plain text (not its marked word)
    const range = document.createRange();
    const rects = nodes.flatMap((n) => { range.selectNodeContents(n); return [...range.getClientRects()]; }).filter((x) => x.width > 20).sort((a, b) => b.width - a.width);
    const r = rects[0] || range.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: nodes.map((n) => n.nodeValue).join('').trim(), english: block.querySelector('.en')?.textContent || block.nextElementSibling?.textContent || '' };
  }, sel);
  return { word, kind, ...at };
}
const family = (page) => page.evaluate(() => { const W = window.__SKY__.W, web = W.web; return web.isOpen() ? `${web.cur.kind}${web.cur.id}` : null; });
async function run(name, body) {
  if (!CASES.includes(name)) return;
  let s = null;
  try { s = await sky(); await body(s); } catch (error) {
    record(`${name}: the case ran to its end`, [String(error.message).split('\n')[0].slice(0, 220)]);
  } finally { if (s) { await s.page.screenshot({ path: `${OUT}/ear-sky-sentence-${tag}-${name}.png` }).catch(() => {}); await s.close(); } }
}
const tap = (s, p) => (PHONE ? s.page.touchscreen.tap(p.x, p.y) : s.page.mouse.click(p.x, p.y));

await run('armed', async (s) => {
  const p = await openWithSentence(s);
  const before = await family(s.page);
  await s.press(await earMark(s.page));
  await s.page.waitForFunction(() => document.documentElement.dataset.ear === 'armed', null, { timeout: 3000 });
  const n = s.fake.speaks().length;
  await tap(s, p); await s.sleep(1200);
  const asked = s.fake.speaks().slice(n).map((r) => r.text), after = await family(s.page), ear = await earState(s.page);
  const problems = [];
  if (asked.length !== 1) problems.push(`${asked.length} requests, not 1`);
  else if (asked[0] !== p.text.replace(/\s+/gu, '')) problems.push(`asked "${asked[0]}", not the sentence "${p.text}"`);
  if (asked.some((t) => p.english && t.includes(p.english.slice(0, 12)))) problems.push('the English was sent');
  if (after !== before) problems.push(`the family ${before} became ${after}`);
  if (ear === 'armed') problems.push('the ear is still armed');
  record('armed: a tap on the sentence under an opened word says it once and the family stays open', problems, `"${p.word}": "${p.text.slice(0, 40)}"; asked ${asked.map((t) => `"${t.slice(0, 30)}"`).join(', ') || 'nothing'}; family ${after}; ear ${ear}`);
});
await run('held', async (s) => {
  const p = await openWithSentence(s);
  const before = await family(s.page);
  await holdOn(s);
  const n = s.fake.speaks().length;
  if (PHONE) await tap(s, p); else { await s.page.mouse.move(p.x, p.y, { steps: 4 }); }
  await s.sleep(1500);
  const asked = s.fake.speaks().slice(n).map((r) => r.text), after = await family(s.page), ear = await earState(s.page);
  const problems = [];
  if (asked.length !== 1) problems.push(`${asked.length} requests, not 1`);
  if (after !== before) problems.push(`the family ${before} became ${after}`);
  if (ear !== 'held' && ear !== 'speaking') problems.push(`the ear is ${ear}`);
  record(`held on: ${PHONE ? 'a tap on' : 'the pointer resting on'} the sentence says it and the family stays open`, problems, `asked ${asked.map((t) => `"${t.slice(0, 30)}"`).join(', ') || 'nothing'}; family ${after}; ear ${ear}`);
});
await run('option', async (s) => {
  const p = await openWithSentence(s);
  const before = await family(s.page);
  const n = s.fake.speaks().length;
  await s.page.keyboard.down('Alt'); await s.page.mouse.click(p.x, p.y); await s.page.keyboard.up('Alt'); await s.sleep(1200);
  const asked = s.fake.speaks().slice(n).map((r) => r.text), after = await family(s.page);
  record('ear off, Option-click on the sentence: said, and the family stays open', [...(asked.length === 1 ? [] : [`${asked.length} requests`]), ...(after === before ? [] : [`the family became ${after}`])],
    `asked ${asked.map((t) => `"${t.slice(0, 30)}"`).join(', ') || 'nothing'}; family ${after}`);
});
await run('off', async (s) => {
  const p = await openWithSentence(s);
  const n = s.fake.speaks().length;
  await tap(s, p); await s.sleep(1500);
  const asked = s.fake.speaks().slice(n), after = await family(s.page);
  record('ear off, a tap on the sentence: the engine lets the family go, as before, and nothing is asked', [...(asked.length ? [`${asked.length} requests`] : []), ...(after ? [`the family is still ${after}`] : [])], `family ${after}`);
});

const failed = rows.filter((r) => !r.pass).length;
console.log(`${tag}: ${rows.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
