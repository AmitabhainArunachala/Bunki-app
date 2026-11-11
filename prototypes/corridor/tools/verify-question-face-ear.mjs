/** The lead's ruling after the combine's review (F1, 2026-11-12): on a card's question face the only voice is the card's own
 * control. Muted and headless, loopback only, a built site served here and the repository's silent stand-in voice server
 * (fake-voice-server.mjs). No sound, no real voice server, no token or pairing code.
 *
 *   node prototypes/corridor/tools/verify-question-face-ear.mjs --site <built site> [--engine chromium|webkit] [--width 1728|390]
 *        [--port 19562] [--only several,unread,deck,select,onekey,probe,answer] [--shots <dir>]
 *
 *  several  a kanji with several readings (一) face-down in a kanji-only practice block, with no control of its own: on the
 *           Mac Option-click on the character, on the phone (and the Mac) the character selected: nothing is asked,
 *           nothing plays, no 読む chip, and the card stays face-down.
 *  unread   a word with no stored reading on its question face (no control of its own), and a word with no saved answer
 *           at all: the same.
 *  deck     the deck's recall face (its word printed and marked, its control standing): on the Mac Option-click on the
 *           marked word says what the control says (one request: the control's reading; the control then asks nothing:
 *           one clip, one voice key), and Option-click on another word of the sentence says nothing and leaves the card on
 *           its question side; a selection of the marked word offers no 読む chip; the control says its reading.
 *  select   a selection that starts above a review card's question face and ends in it, starts in it and ends below it, or
 *           spans it: no 読む chip, nothing asked. Positive controls: a selection beside the face, and one on an answer face,
 *           bring the chip as before.
 *  onekey   one word, one clip (the review's concern): an inflected word on the deck (its card printing 憧れた of 憧れる)
 *           says its reading under one voice key on its question side and its answer side; the reading is made once.
 *  probe    a practice block's reading check (読みの確認): its compound is the question, with no control: nothing is said and
 *           no chip stands on it.
 *  answer   answer faces are unchanged: Option-click (the Mac) on a revealed review card's word reads it.
 *
 * Exit code 0 when every check passes, 1 otherwise. One JSON line per check on stdout. */
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startFakeVoiceServer } from './fake-voice-server.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const SITE = arg('--site', process.env.KAIRO_SITE_DIR || '');
const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '1728'));
const PORT = Number(arg('--port', '19562'));
const SHOTS = arg('--shots', '');
const ONLY = new Set(arg('--only', 'several,unread,deck,select,onekey,probe,answer').split(',').filter(Boolean));
if (!SITE) { console.error('usage: verify-question-face-ear.mjs --site <built site>'); process.exit(2); }
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.m4a': 'audio/mp4', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(SITE, path.endsWith('/') ? `${path}index.html` : path);
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); statSync(file); } catch { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
const ORIGIN = `http://127.0.0.1:${PORT}`;
const fake = await startFakeVoiceServer({ origins: [ORIGIN], port: PORT + 1, clipSeconds: () => 0.8 });

const phone = WIDTH < 700;
const tag = `${ENGINE}-${WIDTH}`;
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch({ headless: true, ...(ENGINE === 'chromium' ? { args: ['--mute-audio'] } : {}) });
const results = [];
const report = (name, problems, detail) => { results.push({ name, pass: !problems.length }); console.log(JSON.stringify({ case: name, engine: ENGINE, width: WIDTH, pass: !problems.length, problems, detail })); };
const rows = (from) => fake.speaks().slice(from).map((row) => ({ text: row.text, voiceKey: row.voiceKey, status: row.status }));

async function freshPage({ ui = 'bi' } = {}) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: phone ? 844 : 1117 }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone,
    locale: 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
  await context.addInitScript(() => {
    const media = HTMLMediaElement.prototype, play = media.play;
    media.play = function () { this.muted = true; this.volume = 0; return play.call(this); };
    if (window.speechSynthesis) { const proto = Object.getPrototypeOf(window.speechSynthesis); proto.speak = function () {}; proto.cancel = function () {}; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const connect = AudioNode.prototype.connect; AudioNode.prototype.connect = function (dest, ...rest) { if (dest instanceof AudioDestinationNode) { const gain = this.context.createGain(); gain.gain.value = 0; connect.call(this, gain); return connect.call(gain, dest, ...rest); } return connect.call(this, dest, ...rest); }; }
    // a clip that sounds: the voice's own element starts playing a clip longer than the silence that primes it
    window.__clips = 0;
    document.addEventListener('playing', (e) => { const a = e.target; if (a?.matches?.('audio[data-speak-audio]') && a.duration > 0.2) window.__clips += 1; }, true);
  });
  await context.route('**/*', (route) => { const u = new URL(route.request().url()); return ['http:', 'https:'].includes(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname) ? route.abort() : route.continue(); });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const press = (target) => (typeof target === 'string' ? page.locator(target).first() : target)[phone ? 'tap' : 'click']();
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.goto(`${ORIGIN}/?ui=${ui}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
  const ok = page.locator('button', { hasText: /^(OK|わかった)$/ }).first();
  if (await ok.isVisible().catch(() => false)) { await ok.click().catch(() => {}); await sleep(300); }
  await press('#home-review'); await page.locator('#tab-me').waitFor(); await press('#tab-me'); await sleep(900);
  await page.locator('#me-settings').scrollIntoViewIfNeeded(); await press('#me-settings'); await sleep(700);
  await page.locator('#voice-pair-learner').scrollIntoViewIfNeeded();
  await page.locator('#voice-pair-learner').fill(`Bunki voice code: ${fake.issue({ learner: 'test-learner' })} (10 minutes) · learner: test-learner · server: ${fake.origin}`);
  await press('#voice-pair-submit');
  await page.waitForFunction(() => document.getElementById('settings-voice-server')?.dataset.paired === 'true', null, { timeout: 15000 });
  // nothing says itself on a shown answer: every request counted here is an act of the check
  await page.evaluate(async () => { const m = await import('/corridor.js'); m.setWordPref(m.WORD_VOICE_KEY, 'wordVoice', m.WORD_VOICE, 'off'); });
  if (!(await page.locator('#tab-learn').isVisible().catch(() => false))) await press('#home-review');
  await page.locator('#tab-learn').waitFor(); await press('#tab-learn'); await sleep(1200);
  const plays = () => page.evaluate(() => window.__clips || 0);
  return { context, page, press, sleep, plays };
}
async function kanjiBlock(s) {
  const mode = s.page.locator('.focus-mode', { hasText: /Kanji only|漢字だけ/ }).first();
  await mode.scrollIntoViewIfNeeded(); await s.press(mode); await s.sleep(400);
  const start = s.page.locator('.focus-start').first(); await start.scrollIntoViewIfNeeded(); await s.press(start); await s.sleep(1500);
}
/** Put `item` (or the block's own kanji that `pick` names) face-down on the block's review, as the block draws it. */
const stage = (s, how) => s.page.evaluate(async (how) => {
  const m = await import('/corridor.js');
  const rv = m.S.review;
  if (!m.S.focus || !rv) return { focus: !!m.S.focus, card: null };
  let item = null;
  if (how.kanji) {
    const readingsOf = (it) => { const d = m.kanjiDisplayRecord(it.id) || m.retainedKanjiRecord(it.id); return { state: d?.readingsState || null, all: [...new Set([...(d?.on || []), ...(d?.kun || [])])] }; };
    item = (m.S.focus.pool || []).find((it) => { if (it.t !== 'kanji') return false; const r = readingsOf(it);
      const one = r.state === 'complete' && r.all.length === 1 && /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(r.all[0]);
      return how.kanji === 'one' ? one : r.all.length > 1; }) || null;
  } else if (how.word) {
    // a word this record keeps an answer for with no reading (a saved snapshot without one), or with no answer at all
    const id = how.word;
    if (how.answer) m.S.deepWords = { ...m.S.deepWords, [id]: { m: ['a word kept with no reading'], r: '' } };
    item = { t: 'word', id, label: id };
  }
  if (!item) return { focus: true, card: null };
  rv.queue[rv.ix] = item; rv.revealed = false; rv.declared = null; m.render();
  await new Promise((r) => setTimeout(r, 500));
  const face = document.querySelector('.review-face');
  const front = face?.querySelector('.review-front');
  const r = front?.getBoundingClientRect();
  return { focus: true, card: item.label, face: face?.id || 'review-face', cardFace: face?.dataset.cardFace || null,
    control: document.getElementById('card-say-front')?.dataset.voiceText || null,
    at: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null };
}, how);
const faceDown = (s) => s.page.evaluate(async () => { const m = await import('/corridor.js'); return !m.S.review?.revealed && !document.querySelector('.grade-row'); });
async function optionClick(s, p) { await s.page.keyboard.down('Alt'); await s.page.mouse.click(p.x, p.y); await s.page.keyboard.up('Alt'); }
/** Select text by script (as a finger's or the keyboard's selection ends up) and wait for the 読む chip's decision. `spec`:
 * { from, to } where each is 'face' (the asked word on the face), 'before' (Japanese text above the face), 'after' (below),
 * or 'answer'; `face` names the face's selector and `word` (optional) the asked word inside it. Returns whether the chip
 * stands, and clicks it when it does (so a chip that should not stand shows what it would have sent). */
async function selectThen(s, spec) {
  const made = await s.page.evaluate(({ from, to, face: faceSel, word }) => {
    const face = document.querySelector(faceSel);
    if (!face) return { made: false, why: `no ${faceSel}` };
    const asked = (word && face.querySelector(word)) || face;
    const visible = (n) => { const r = document.createRange(); r.selectNodeContents(n); return [...r.getClientRects()].some((b) => b.width && b.height); };
    const japanese = (n) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(n.nodeValue || '');
    const usable = (n) => /\S/u.test(n.nodeValue || '') && visible(n) && !n.parentElement?.closest('[data-ear-own], input, textarea, select, [contenteditable], rt, .ear-chip');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    // the face's end is its asked word; above it any text the eye sees (what a selection dragged down from there takes in);
    // below it Japanese (so a selection there alone is something the chip would read: the positive control)
    let before = null, inside = null, after = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!usable(n)) continue;
      if (face.contains(n)) { if (asked.contains(n) && japanese(n)) inside ||= n; continue; }
      if (face.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING) before = n;
      else if (!after && japanese(n)) after = n;
    }
    const pick = { face: inside, before, after };
    const a = pick[from], b = pick[to];
    if (!a || !b) return { made: false, why: `no text ${!a ? from : to}`, have: Object.fromEntries(Object.entries(pick).map(([k, v]) => [k, v?.nodeValue?.slice(0, 12) || null])) };
    const range = document.createRange();
    range.setStart(a, 0);
    range.setEnd(b, Math.min(b.nodeValue.length, Math.max(1, [...b.nodeValue].length > 1 ? 2 : 1)));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    return { made: true, text: range.toString().replace(/\s+/gu, ' ').slice(0, 40) };
  }, spec);
  await s.sleep(600);
  const chip = await s.page.locator('.ear-chip').isVisible().catch(() => false);
  const n = fake.speaks().length, q = await s.plays();
  // Playwright's touch tap on the chip brings no click in headless WebKit; the chip's own click is dispatched, as a tap's
  if (chip) { await s.page.locator('.ear-chip').dispatchEvent('click', { detail: 1 }); await s.sleep(1500); }
  await s.page.evaluate(() => getSelection().removeAllRanges());
  await s.sleep(300);
  return { ...made, chip, sent: rows(n).map((r) => r.text), plays: (await s.plays()) - q };
}

const cases = {
  // ======================================================= a kanji with several readings, face-down in a practice block
  async several() {
    const s = await freshPage();
    try {
      await kanjiBlock(s);
      const shown = await stage(s, { kanji: 'several' });
      const problems = [];
      if (!shown.card) problems.push(`no kanji with several readings in the block (${JSON.stringify(shown)})`);
      if (shown.control) problems.push(`a control stands on ${shown.card}: ${shown.control}`);
      const n = fake.speaks().length, q = await s.plays();
      let act = null;
      if (shown.at && !phone) { await optionClick(s, shown.at); await s.sleep(1800); act = 'option-click'; }
      const afterClick = { sent: rows(n).map((r) => r.text), plays: (await s.plays()) - q, faceDown: await faceDown(s) };
      if (afterClick.sent.length) problems.push(`Option-click sent ${JSON.stringify(afterClick.sent)}`);
      if (afterClick.plays) problems.push(`${afterClick.plays} clip(s) played`);
      if (!afterClick.faceDown) problems.push('the Option-click turned the card over');
      const sel = await selectThen(s, { from: 'face', to: 'face', face: '.review-face' });
      if (!sel.made) problems.push(`no selection: ${sel.why}`);
      if (sel.chip) problems.push(`the 読む chip stood for the selected character${sel.sent.length ? ` and sent ${JSON.stringify(sel.sent)}` : ''}`);
      if (!(await faceDown(s))) problems.push('the card was turned over');
      if (SHOTS && phone) { await s.page.evaluate(() => { const f = document.querySelector('.review-face .review-front'); const t = [...f.childNodes].find((x) => x.nodeType === 3); const r = document.createRange(); r.selectNodeContents(t || f); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }); await s.sleep(700); await s.page.screenshot({ path: join(SHOTS, `${tag}-several-readings-selected-no-chip.png`) }); await s.page.evaluate(() => getSelection().removeAllRanges()); }
      report(`several · a kanji with several readings (${shown.card}), face-down in a practice block, no control: ${phone ? '' : 'Option-click and '}a selection say nothing, no chip, the card stays face-down`, problems, { ...shown, act, afterClick, sel });
    } finally { await s.context.close(); }
  },

  // ======================================================= a word with no stored reading; a word with no saved answer
  async unread() {
    for (const [label, how] of [['a word with no stored reading', { word: '桜餅語', answer: true }], ['a word with no saved answer', { word: '桜餅語', answer: false }]]) {
      const s = await freshPage();
      try {
        await kanjiBlock(s);
        const shown = await stage(s, how);
        const problems = [];
        if (!shown.card || !shown.at) problems.push(`the word is not on the face (${JSON.stringify(shown)})`);
        if (shown.control) problems.push(`a control stands: ${shown.control}`);
        if (shown.cardFace !== 'question') problems.push(`the face is not marked a question face (${shown.cardFace})`);
        const n = fake.speaks().length, q = await s.plays();
        if (shown.at && !phone) { await optionClick(s, shown.at); await s.sleep(1800); }
        const afterClick = { sent: rows(n).map((r) => r.text), plays: (await s.plays()) - q, faceDown: await faceDown(s) };
        if (afterClick.sent.length) problems.push(`Option-click sent ${JSON.stringify(afterClick.sent)}`);
        if (afterClick.plays) problems.push(`${afterClick.plays} clip(s) played`);
        if (!afterClick.faceDown) problems.push('the Option-click turned the card over');
        const sel = await selectThen(s, { from: 'face', to: 'face', face: '.review-face' });
        if (!sel.made) problems.push(`no selection: ${sel.why}`);
        if (sel.chip) problems.push(`the 読む chip stood${sel.sent.length ? ` and sent ${JSON.stringify(sel.sent)}` : ''}`);
        report(`unread · ${label} (${shown.face}): ${phone ? '' : 'Option-click and '}a selection say nothing, no chip, the card stays face-down`, problems, { ...shown, afterClick, sel });
      } finally { await s.context.close(); }
    }
  },

  // ======================================================= the deck's recall face
  async deck() {
    const s = await freshPage();
    const { page } = s;
    try {
      await page.evaluate(() => { for (const id of ['n2', 'n1', 'kotoba-master', 'kotoba-mcd', 'kotoba-mine', 'context-dense', 'senmon', 'personal']) localStorage.removeItem(`bunki-cloze:prefs:v3:${id}`); });
      await s.press('.learn-go-deck'); await page.locator('#kp-card').waitFor();
      await page.locator('#kp-listen-front').waitFor({ timeout: 8000 }).catch(() => {});
      await s.sleep(800);
      const g = await page.evaluate(() => {
        const card = document.querySelector('#kp-card');
        const target = card?.querySelector('.kp-sentence .kp-target');
        const box = (r) => (r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
        // another word of the sentence: the first Japanese letter outside the marked word
        let other = null;
        const walker = document.createTreeWalker(card?.querySelector('.kp-sentence') || document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n && !other; n = walker.nextNode()) {
          if (target?.contains(n) || n.parentElement?.closest('rt')) continue;
          const i = n.nodeValue.search(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u);
          if (i < 0) continue;
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
          const rect = r.getBoundingClientRect();
          if (rect.width && rect.top > 0 && rect.bottom < innerHeight) other = { at: box(rect), text: n.nodeValue.slice(i, i + 6) };
        }
        return { card: card?.dataset.card || null, kind: card?.dataset.kind || null, word: target?.textContent || null, control: !!document.getElementById('kp-listen-front'),
          at: box(target?.getBoundingClientRect()), other };
      });
      const problems = [];
      if (!g.control) problems.push(`no control on the recall face of ${g.card} (${g.kind})`);
      if (!g.at) problems.push('no marked word');
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `${tag}-deck-recall-face.png`) });
      const detail = { ...g };
      if (!phone) {
        // the marked word: what the control says, one request; the control then asks nothing and plays (one clip)
        let n = fake.speaks().length, q = await s.plays();
        if (g.at) { await optionClick(s, g.at); await s.sleep(1800); }
        detail.onWord = { sent: rows(n), plays: (await s.plays()) - q };
        n = fake.speaks().length; q = await s.plays();
        if (g.control) { await page.locator('#kp-listen-front').click(); await s.sleep(1800); }
        detail.control = { sent: rows(n), plays: (await s.plays()) - q };
        if (detail.onWord.sent.length !== 1) problems.push(`Option-click on the marked word sent ${JSON.stringify(detail.onWord.sent)}`);
        else if (!/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(detail.onWord.sent[0].text || '')) problems.push(`the ear sent ${detail.onWord.sent[0].text}, not a kana reading`);
        if (detail.control.sent.length) problems.push(`the control asked again (${JSON.stringify(detail.control.sent)}): not the clip the ear brought (another text or voice key)`);
        if (detail.control.plays < 1) problems.push('the control played nothing');
        // the rest of the sentence: nothing; the card stays on its question side
        n = fake.speaks().length; q = await s.plays();
        if (g.other) { await optionClick(s, g.other.at); await s.sleep(1800); }
        detail.onRest = { sent: rows(n).map((r) => r.text), plays: (await s.plays()) - q, answer: await page.evaluate(() => !!document.querySelector('#kp-card .kp-answer')) };
        if (!g.other) problems.push('no other word in the sentence');
        if (detail.onRest.sent.length) problems.push(`Option-click on ${g.other?.text} sent ${JSON.stringify(detail.onRest.sent)}`);
        if (detail.onRest.plays) problems.push(`Option-click on the rest of the sentence played ${detail.onRest.plays} clip(s)`);
        if (detail.onRest.answer) problems.push('the Option-click showed the answer');
      }
      // a selection of the marked word, and of the marked word with the rest of the sentence: no chip
      detail.select = await selectThen(s, { from: 'face', to: 'face', face: '#kp-card', word: '.kp-sentence .kp-target' });
      if (detail.select.chip) problems.push(`the 読む chip stood for the marked word${detail.select.sent.length ? ` and sent ${JSON.stringify(detail.select.sent)}` : ''}`);
      if (phone && g.control) {
        // the phone's only voice on this face: the control, saying its reading
        const n = fake.speaks().length;
        await s.press('#kp-listen-front'); await s.sleep(1800);
        detail.control = { sent: rows(n).map((r) => r.text) };
        if (detail.control.sent.length !== 1 || !/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(detail.control.sent[0] || '')) problems.push(`the control sent ${JSON.stringify(detail.control.sent)}`);
      }
      if (await page.evaluate(() => !!document.querySelector('#kp-card .kp-answer'))) problems.push('the answer was shown');
      report(`deck · the recall face: ${phone ? 'its control says the reading; a selection of the marked word brings no chip' : 'Option-click on the marked word says what the control says (one clip); on the rest of the sentence nothing; no chip'}`, problems, detail);
    } finally { await s.context.close(); }
  },

  // ======================================================= selections that cross a question face's edge
  async select() {
    // in Japanese, so the chrome above and below the face is Japanese a selection can start or end in
    const s = await freshPage({ ui: 'ja' });
    const { page } = s;
    try {
      // a word saved from its own page, asked in Today's review: its face prints it with its control, and the screen's
      // Japanese (the counts above, the button below) stands around the face
      await page.waitForFunction(async () => { const m = await import('/corridor.js'); return !m.D.passages.some((x) => !x.tokens && !x._loadFailed && !x.libraryCandidate && !String(x.file || '').startsWith('archive/') && m.D.libraryDiscoverable?.(x) !== false); }, null, { timeout: 60000, polling: 500 });
      const word = await page.evaluate(async () => { const m = await import('/corridor.js'); const dict = await import('/modules/dictionary.mjs');
        const words = [...new Set(Object.values(m.D.kanjiWords || {}).flat())].filter((w) => /^\p{Script=Han}{2}$/u.test(w));
        return words.find((w) => !dict.findExamples(w, 1).length) || words[0]; });
      await page.evaluate(async (id) => { const m = await import('/corridor.js'); m.go({ t: 'word', id }); }, word);
      await page.locator('#sheet-take').waitFor(); await s.sleep(600);
      await s.press('#sheet-take'); await page.locator('#mini-review').waitFor(); await s.press('#mini-review'); await s.sleep(900);
      await page.goto(`${ORIGIN}/?ui=ja`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
      await s.press('#home-review').catch(() => {}); await page.locator('#tab-today').waitFor(); await s.press('#tab-today'); await s.sleep(1000);
      await s.press('#review-start'); await page.locator('.review-face').first().waitFor(); await s.sleep(1500);
      const shown = await page.evaluate(() => ({ card: document.querySelector('.review-face .review-front')?.textContent || null, control: document.getElementById('card-say-front')?.dataset.voiceText || null }));
      const problems = [];
      if (!shown.control) problems.push(`no control on ${shown.card} (the face to cross)`);
      const runs = {};
      for (const [name, from, to] of [['starts above the face and ends in it', 'before', 'face'], ['starts in the face and ends below it', 'face', 'after'],
        ['spans the face', 'before', 'after']]) {
        runs[name] = await selectThen(s, { from, to, face: '.review-face' });
        if (!runs[name].made) problems.push(`${name}: no selection (${runs[name].why}${runs[name].have ? ` ${JSON.stringify(runs[name].have)}` : ''})`);
        else if (runs[name].chip) problems.push(`${name}: the 読む chip stood${runs[name].sent.length ? ` and sent ${JSON.stringify(runs[name].sent)}` : ''}`);
      }
      // the positive control: a selection beside the face (the Japanese below it) brings the chip
      runs.beside = await selectThen(s, { from: 'after', to: 'after', face: '.review-face' });
      if (runs.beside.made && !runs.beside.chip) problems.push(`a selection beside the face (${runs.beside.text}) brought no chip: the check cannot see the chip`);
      if (!(await faceDown(s))) problems.push('the card was turned over');
      report('select · a selection that starts above a question face and ends in it, starts in it and ends below, or spans it: no 読む chip, nothing sent (beside it: the chip)', problems, { card: shown.card, runs });
    } finally { await s.context.close(); }
  },

  // ======================================================= one word, one clip (fix round 1, the review's concern)
  // The deck's question side keyed its voice by the form printed in the passage (憧れた) and the answer side by the
  // dictionary form (憧れる): one reading asked twice, possibly in two voices. A deck whose first new card is an inflected
  // word's: every card of the words before it is put aside (suspended) in a fresh profile.
  async onekey() {
    const s = await freshPage();
    const { page } = s;
    try {
      const staged = await page.evaluate(async () => {
        const id = document.querySelector('.learn-go-deck')?.dataset.stageDeck;
        if (!id) return { why: 'no deck door' };
        for (const k of [`bunki-cloze:prefs:v3:${id}`]) localStorage.removeItem(k);
        const deck = await (await fetch(`/decks/${id}/deck.json`)).json();
        const at = new Date().toISOString();
        const suspended = {};
        let target = null;
        for (const word of deck.words) {
          const card = word.cards[0];
          if (card?.type === 'word' && card.form && card.form !== word.term && word.reading && word.pos !== 'expression') { target = { id: card.id, form: card.form, term: word.term, reading: word.reading }; break; }
          for (const c of word.cards) suspended[c.id] = { at, by: 'delete' };
        }
        if (!target) return { why: 'no inflected card' };
        localStorage.setItem(`bunki-cloze:${id}`, JSON.stringify({ format: 'bunki-cloze-state', version: 1, deckId: id, cards: {}, groupsOff: [], log: [], suspended, repairs: {}, repairLog: [], lookups: [] }));
        return { deck: id, ...target };
      });
      const problems = [];
      if (!staged.id) throw new Error(`nothing to stage: ${staged.why}`);
      await s.press(`.learn-go-deck[data-stage-deck="${staged.deck}"]`); await page.locator('#kp-card').waitFor();
      await page.locator('#kp-listen-front').waitFor({ timeout: 8000 }).catch(() => {});
      await s.sleep(600);
      const shown = await page.evaluate(() => ({ card: document.querySelector('#kp-card')?.dataset.card || null, printed: document.querySelector('#kp-card .kp-sentence .kp-target')?.textContent || null }));
      if (shown.card !== staged.id) problems.push(`the card shown is ${shown.card}, not ${staged.id}`);
      // the question side's control: its reading under its voice key
      let n = fake.speaks().length;
      if (await page.locator('#kp-listen-front').count()) { await s.press('#kp-listen-front'); await s.sleep(1800); } else problems.push('no question-side control');
      const front = rows(n);
      // the answer side's control: its reading first (kept already, under one key), then the sentence and the rest
      await s.press('#kp-reveal'); await page.locator('#kp-listen-word').waitFor({ timeout: 8000 }).catch(() => {});
      await s.sleep(800);
      n = fake.speaks().length;
      if (await page.locator('#kp-listen-word').count()) { await s.press('#kp-listen-word'); await s.sleep(6000); } else problems.push('no answer-side control');
      const answer = rows(n);
      if (front.length !== 1 || front[0].text !== staged.reading) problems.push(`the question side sent ${JSON.stringify(front)}, not ${staged.reading} once`);
      const keys = new Set([...front, ...answer].map((r) => r.voiceKey));
      if (keys.size !== 1) problems.push(`one word, ${keys.size} voice keys: ${[...keys].join(', ')}`);
      if (answer.some((r) => r.text === staged.reading)) problems.push(`the answer side asked for ${staged.reading} again: the same word made twice`);
      if (!answer.length) problems.push('the answer side sent nothing (its sentence is new: nothing to compare)');
      report(`onekey · an inflected word on the deck (${staged.form} of ${staged.term}): its two faces say it under one voice key, and its reading is made once`, problems,
        { staged, shown, front, answer: answer.map((r) => `${r.voiceKey} ${String(r.text).slice(0, 14)}`) });
    } finally { await s.context.close(); }
  },

  // ======================================================= the reading check: the reading is the question
  // A practice block's reading check (読みの確認) prints a compound and asks its reading: the face has no control, and the
  // ear must not say the word there (that would give the answer). After the reading is shown, the face is an answer face.
  async probe() {
    const s = await freshPage();
    const { page } = s;
    try {
      const mode = page.locator('.focus-mode', { hasText: /Reading check|読みの確認/ }).first();
      await mode.scrollIntoViewIfNeeded(); await s.press(mode); await s.sleep(400);
      const start = page.locator('.focus-start').first(); await start.scrollIntoViewIfNeeded(); await s.press(start);
      await page.locator('.review-face .review-front').first().waitFor({ timeout: 15000 }); await s.sleep(1200);
      const shown = await page.evaluate(async () => { const m = await import('/corridor.js'); const f = document.querySelector('.review-face');
        const r = f?.querySelector('.review-front')?.getBoundingClientRect();
        return { view: m.S.view, word: f?.querySelector('.review-front')?.textContent || null, cardFace: f?.dataset.cardFace || null,
          at: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null }; });
      const revealed = () => page.evaluate(async () => { const m = await import('/corridor.js'); return !!m.S.probe?.revealed; });
      const problems = [];
      if (shown.view !== 'probe' || !shown.at) problems.push(`no reading check face (${JSON.stringify(shown)})`);
      const n = fake.speaks().length, q = await s.plays();
      if (shown.at && !phone) { await optionClick(s, shown.at); await s.sleep(1800); }
      const onFace = { sent: rows(n).map((r) => r.text), plays: (await s.plays()) - q, revealed: await revealed() };
      if (onFace.sent.length) problems.push(`Option-click on the asked compound sent ${JSON.stringify(onFace.sent)}`);
      if (onFace.plays) problems.push(`${onFace.plays} clip(s) played`);
      if (onFace.revealed) problems.push('the Option-click showed the reading');
      const sel = await selectThen(s, { from: 'face', to: 'face', face: '.review-face' });
      if (sel.chip) problems.push(`the 読む chip stood for the compound${sel.sent.length ? ` and sent ${JSON.stringify(sel.sent)}` : ''}`);
      if (await revealed()) problems.push('the reading was shown');
      report(`probe · the reading check's question face (${shown.word}): ${phone ? '' : 'Option-click and '}a selection say nothing, no chip, the reading stays hidden`, problems, { ...shown, onFace, sel });
    } finally { await s.context.close(); }
  },

  // ======================================================= answer faces are unchanged
  async answer() {
    const s = await freshPage();
    try {
      await kanjiBlock(s);
      const shown = await stage(s, { kanji: 'several' });
      await s.page.evaluate(async () => { const m = await import('/corridor.js'); m.S.review.revealed = true; m.render(); });
      await s.sleep(800);
      const at = await s.page.evaluate(() => { const f = document.querySelector('.review-face .review-front'); const r = f?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; });
      const problems = [];
      const detail = { card: shown.card, cardFace: await s.page.evaluate(() => document.querySelector('.review-face')?.dataset.cardFace || null) };
      if (detail.cardFace) problems.push(`the answer face is marked ${detail.cardFace}`);
      if (!phone && at) {
        const n = fake.speaks().length;
        await optionClick(s, at); await s.sleep(1800);
        detail.optionClick = rows(n).map((r) => r.text);
        if (!detail.optionClick.length) problems.push('Option-click on the answer face sent nothing');
      }
      detail.select = await selectThen(s, { from: 'face', to: 'face', face: '.review-face' });
      if (!detail.select.chip) problems.push('a selection on the answer face brought no 読む chip');
      // (what the chip says may be a clip this page already holds: then it plays with no request)
      else if (!detail.select.sent.length && !detail.select.plays) problems.push('the chip on the answer face said nothing');
      report(`answer · the answer face is as before: ${phone ? '' : 'Option-click reads it; '}a selection brings the 読む chip`, problems, detail);
    } finally { await s.context.close(); }
  },
};

let failed = false;
try {
  for (const [name, run] of Object.entries(cases)) {
    if (!ONLY.has(name)) continue;
    try { await run(); } catch (error) { report(`${name}: the check ran to its end`, [String(error?.message || error).split('\n')[0].slice(0, 300)], null); }
  }
} finally {
  failed = results.some((r) => !r.pass);
  await browser.close(); server.close(); await fake.close?.();
  console.log(`${results.filter((r) => r.pass).length} of ${results.length} pass (${tag})`);
  process.exit(failed ? 1 : 0);
}
