/** Independent review of the speech lane's one head (763776ea7, the combine): the ear on a character card's question side.
 * Muted and headless, loopback only, against a built site and the repository's silent stand-in voice server
 * (fake-voice-server.mjs). No sound, no real voice server, no token or pairing code.
 *
 *   node prototypes/corridor/tools/review-all/kanji-front-ear.mjs --site <built site> [--engine chromium|webkit]
 *        [--width 1728|390] [--port 19586]
 *
 * The card audio's rule for a question side (modules/card-audio.mjs, corridor.js reviewVoiceTarget): a kanji card is said
 * only by its one complete kana reading, "never infer one of a kanji's several readings"; with several readings (or a
 * record that is not complete) the face has no control and nothing is said. The combine's I2: "the card's own control and
 * the ear agree on the reading of a printed word", and the hidden answer is never spoken. A kanji card's answer is its
 * readings and meanings.
 *
 * K1 · kanji-only practice block (道場), a kanji whose readings are several (no question-side control): on the Mac,
 *      Option-click on the printed character; on the phone, the character selected and the ear's 読む chip pressed.
 *      Nothing may be sent (the voice would choose one of its readings, a reading the face does not print), and the card
 *      stays face-down.
 * K2 · the positive control: a kanji with one complete reading (its control stands): the ear sends exactly that reading.
 *
 * Exit code 0 when every case passes, 1 otherwise. One JSON line per case on stdout. */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startFakeVoiceServer } from '../fake-voice-server.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const SITE = arg('--site', process.env.KAIRO_SITE_DIR || '');
const ENGINE = arg('--engine', 'chromium');
const WIDTH = Number(arg('--width', '1728'));
const PORT = Number(arg('--port', '19586'));
if (!SITE) { console.error('usage: kanji-front-ear.mjs --site <built site>'); process.exit(2); }

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
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch({ headless: true, ...(ENGINE === 'chromium' ? { args: ['--mute-audio'] } : {}) });
const results = [];
const report = (name, pass, detail) => { results.push({ name, pass }); console.log(JSON.stringify({ case: name, engine: ENGINE, width: WIDTH, pass, detail })); };
const speaks = () => fake.speaks().map((row) => row.text);

async function freshPage() {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: phone ? 844 : 1117 }, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone,
    locale: 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
  await context.addInitScript(() => {
    const media = HTMLMediaElement.prototype, play = media.play;
    media.play = function () { this.muted = true; this.volume = 0; return play.call(this); };
    if (window.speechSynthesis) { const proto = Object.getPrototypeOf(window.speechSynthesis); proto.speak = function () {}; proto.cancel = function () {}; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const connect = AudioNode.prototype.connect; AudioNode.prototype.connect = function (dest, ...rest) { if (dest instanceof AudioDestinationNode) { const gain = this.context.createGain(); gain.gain.value = 0; connect.call(this, gain); return connect.call(gain, dest, ...rest); } return connect.call(this, dest, ...rest); }; }
  });
  await context.route('**/*', (route) => { const u = new URL(route.request().url()); return ['http:', 'https:'].includes(u.protocol) && !['127.0.0.1', 'localhost'].includes(u.hostname) ? route.abort() : route.continue(); });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const press = (target) => (typeof target === 'string' ? page.locator(target).first() : target)[phone ? 'tap' : 'click']();
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.goto(`${ORIGIN}/?ui=bi`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
  const ok = page.locator('button', { hasText: /^(OK|わかった)$/ }).first();
  if (await ok.isVisible().catch(() => false)) { await ok.click().catch(() => {}); await sleep(300); }
  await press('#home-review'); await page.locator('#tab-me').waitFor(); await press('#tab-me'); await sleep(900);
  await page.locator('#me-settings').scrollIntoViewIfNeeded(); await press('#me-settings'); await sleep(700);
  await page.locator('#voice-pair-learner').scrollIntoViewIfNeeded();
  await page.locator('#voice-pair-learner').fill(`Bunki voice code: ${fake.issue({ learner: 'test-learner' })} (10 minutes) · learner: test-learner · server: ${fake.origin}`);
  await press('#voice-pair-submit');
  await page.waitForFunction(() => document.getElementById('settings-voice-server')?.dataset.paired === 'true', null, { timeout: 15000 });
  await page.evaluate(async () => { const m = await import('/corridor.js'); m.setWordPref(m.WORD_VOICE_KEY, 'wordVoice', m.WORD_VOICE, 'off'); });
  if (!(await page.locator('#tab-learn').isVisible().catch(() => false))) await press('#home-review');
  await page.locator('#tab-learn').waitFor(); await press('#tab-learn'); await sleep(1200);
  const kanjiOnly = page.locator('.focus-mode', { hasText: /Kanji only|漢字だけ/ }).first();
  await kanjiOnly.scrollIntoViewIfNeeded(); await press(kanjiOnly); await sleep(400);
  const start = page.locator('.focus-start').first(); await start.scrollIntoViewIfNeeded(); await press(start); await sleep(1500);
  return { context, page, press, sleep };
}

/** Stage the block's own pool item that `single` picks (one complete reading, or several), face-down, as the block draws it. */
const stage = (page, single) => page.evaluate(async (single) => {
  const m = await import('/corridor.js');
  const rv = m.S.review, pool = m.S.focus?.pool || [];
  const readingsOf = (item) => { const d = m.kanjiDisplayRecord(item.id) || m.retainedKanjiRecord(item.id); return { state: d?.readingsState || null, all: [...new Set([...(d?.on || []), ...(d?.kun || [])])] }; };
  const pick = pool.find((item) => { if (item.t !== 'kanji') return false; const r = readingsOf(item);
    const one = r.state === 'complete' && r.all.length === 1 && /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(r.all[0]);
    return single ? one : r.all.length > 1; });
  if (!m.S.focus || !rv || !pick) return { focus: !!m.S.focus, card: null };
  rv.queue[rv.ix] = pick; rv.revealed = false; rv.declared = null; m.render();
  await new Promise((r) => setTimeout(r, 400));
  const front = document.querySelector('.review-face .review-front');
  const r = front?.getBoundingClientRect();
  return { focus: true, card: pick.label, readings: readingsOf(pick).all, control: document.getElementById('card-say-front')?.dataset.voiceText || null,
    closed: document.querySelector('.review-face')?.dataset.earClosed || null, at: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null };
}, single);

/** The ear's deliberate act on the printed character: Option-click on the Mac; on the phone, the character selected and 読む. */
async function earOn(s, shown) {
  if (!phone) {
    await s.page.keyboard.down('Alt'); await s.page.mouse.click(shown.at.x, shown.at.y); await s.page.keyboard.up('Alt');
    return 'option-click';
  }
  const chip = await s.page.evaluate(() => {
    const front = document.querySelector('.review-face .review-front');
    const text = [...front.childNodes].find((n) => n.nodeType === 3);
    const range = document.createRange(); range.selectNodeContents(text || front);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    return true;
  });
  await s.sleep(500);
  const visible = await s.page.locator('.ear-chip').isVisible().catch(() => false);
  if (chip && visible) await s.page.locator('.ear-chip').tap();
  return visible ? 'select-then-読む' : 'select (no 読む chip)';
}

let failed = false;
try {
  for (const [name, single] of [['K1', false], ['K2', true]]) {
    const s = await freshPage();
    try {
      const shown = await stage(s.page, single);
      const before = speaks().length;
      let act = null;
      if (shown.at) { act = await earOn(s, shown); await s.sleep(2000); }
      const sent = speaks().slice(before);
      const revealed = await s.page.evaluate(async () => { const m = await import('/corridor.js'); return !!m.S.review?.revealed; });
      let pass;
      if (name === 'K1') {
        pass = !!shown.card && !shown.control && !sent.length && !revealed;
        report('K1 a kanji with several readings, face-down in a practice block (no control of its own): the ear sends nothing', pass,
          { ...shown, act, sent, revealed });
      } else {
        pass = !!shown.card && !!shown.control && (phone || (sent.length === 1 && sent[0] === shown.control)) && !revealed;
        report('K2 positive control: a kanji with one complete reading: the ear sends that reading and nothing else', pass, { ...shown, act, sent, revealed });
      }
      failed ||= !pass;
    } finally { await s.context.close(); }
  }
} catch (error) {
  console.log(JSON.stringify({ case: 'run', pass: false, detail: String(error?.message || error).split('\n')[0].slice(0, 300) }));
  failed = true;
} finally {
  await browser.close(); server.close(); await fake.close?.();
  console.log(`${results.filter((r) => r.pass).length} of ${results.length} cases pass (${ENGINE}-${WIDTH})`);
  process.exit(failed ? 1 : 0);
}
