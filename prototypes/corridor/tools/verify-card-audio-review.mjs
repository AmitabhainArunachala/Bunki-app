/** Independent review of the card-audio change (voice/card-audio-20261111, 4f1cd736b): two browser cases that fail on its
 * head and pass on its base (e74cffd7e). Muted and headless, loopback only, against a built site and the repository's
 * silent stand-in voice server (fake-voice-server.mjs). No sound, no real voice server, no token or pairing code.
 *
 *   node prototypes/corridor/tools/verify-card-audio-review.mjs --site <built site> [--engine webkit|chromium] [--width 390] [--port 19556]
 *
 * B1 · practice block (道場): a tap on the question side's audio control must keep the card face-down. A practice block
 *      turns its card over on any click on the face (renderReview: `if (S.focus) face.addEventListener('click', …)`), and
 *      the new #card-say-front stands inside that face without stopping its click. The kanji-only block draws the pool's
 *      own items; the first one with a single complete reading (週 in today's pool) is shown face-down, as the block
 *      draws it, and its control is tapped.
 * B2 · deck answer side at phone width: the word's type (`.kp-posbadge`, "noun" / 名詞) stays on the word's line, as at
 *      the base. The new control is put between the reading and the type and pushes the type onto a line of its own.
 *
 * Exit code 0 when every case passes, 1 otherwise. One JSON line per case on stdout. */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startFakeVoiceServer } from './fake-voice-server.mjs';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const SITE = arg('--site', process.env.KAIRO_SITE_DIR || '');
const ENGINE = arg('--engine', 'webkit');
const WIDTH = Number(arg('--width', '390'));
const PORT = Number(arg('--port', '19556'));
if (!SITE) { console.error('usage: verify-card-audio-review.mjs --site <built site>'); process.exit(2); }

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
const fake = await startFakeVoiceServer({ origins: [ORIGIN], port: PORT + 1 });

const phone = WIDTH < 700;
const browser = await (ENGINE === 'webkit' ? webkit : chromium).launch({ headless: true, ...(ENGINE === 'chromium' ? { args: ['--mute-audio'] } : {}) });
const results = [];
const report = (name, pass, detail) => { results.push({ name, pass }); console.log(JSON.stringify({ case: name, engine: ENGINE, width: WIDTH, pass, detail })); };

/** A fresh, silent page: every media element muted, the device voice swallowed, Web Audio at gain 0, nothing off this machine. */
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
  // paired with the stand-in through the app's own Settings; 声 (said by itself) off, so every request is a tap's
  await press('#home-review'); await page.locator('#tab-me').waitFor(); await press('#tab-me'); await sleep(900);
  await page.locator('#me-settings').scrollIntoViewIfNeeded(); await press('#me-settings'); await sleep(700);
  await page.locator('#voice-pair-learner').scrollIntoViewIfNeeded();
  await page.locator('#voice-pair-learner').fill(`Bunki voice code: ${fake.issue({ learner: 'test-learner' })} (10 minutes) · learner: test-learner · server: ${fake.origin}`);
  await press('#voice-pair-submit');
  await page.waitForFunction(() => document.getElementById('settings-voice-server')?.dataset.paired === 'true', null, { timeout: 15000 });
  await page.evaluate(async () => { const m = await import('/corridor.js'); m.setWordPref(m.WORD_VOICE_KEY, 'wordVoice', m.WORD_VOICE, 'off'); });
  const learn = async () => {
    if (!(await page.locator('#tab-learn').isVisible().catch(() => false))) await press('#home-review');
    await page.locator('#tab-learn').waitFor(); await press('#tab-learn'); await sleep(1200);
  };
  return { context, page, press, sleep, learn };
}
const speaks = () => fake.speaks().map((row) => row.text);

let failed = false;
try {
  // ---------------------------------------------------------------- B1 · practice block: the question side's control
  {
    const { context, page, press, sleep, learn } = await freshPage();
    await learn();
    const kanjiOnly = page.locator('.focus-mode', { hasText: /Kanji only|漢字だけ/ }).first();
    await kanjiOnly.scrollIntoViewIfNeeded(); await press(kanjiOnly); await sleep(400);
    const start = page.locator('.focus-start').first(); await start.scrollIntoViewIfNeeded(); await press(start); await sleep(1500);
    // the block's own pool, in its order: the first kanji with one complete reading, shown face-down as the block draws it
    const shown = await page.evaluate(async () => {
      const m = await import('/corridor.js');
      const rv = m.S.review, pool = m.S.focus?.pool || [];
      const single = pool.find((item) => { const d = m.kanjiDisplayRecord(item.id) || m.retainedKanjiRecord(item.id);
        return item.t === 'kanji' && d?.readingsState === 'complete' && new Set([...(d.on || []), ...(d.kun || [])]).size === 1; });
      if (!m.S.focus || !single) return { focus: !!m.S.focus, single: null };
      rv.queue[rv.ix] = single; rv.revealed = false; rv.declared = null; m.render();
      await new Promise((r) => setTimeout(r, 300));
      return { focus: true, single: single.label, controls: [...document.querySelectorAll('.review-face button')].filter((b) => /say|voice|listen/.test(`${b.id} ${b.className}`)).map((b) => b.id || b.className) };
    });
    const before = speaks().length;
    let afterTap = null;
    for (const id of shown.controls || []) {
      await press(`.review-face #${id}`); await sleep(1200);
      afterTap = await page.evaluate(async () => { const m = await import('/corridor.js'); return { revealed: !!m.S.review?.revealed }; });
      if (afterTap.revealed) break;
    }
    const sent = speaks().slice(before);
    const pass = !!shown.focus && !!shown.single && (!shown.controls?.length || afterTap?.revealed === false);
    report('B1 practice block: a tap on the question side audio control keeps the card face-down', pass,
      { card: shown.single, controls: shown.controls, revealedAfterTap: afterTap?.revealed ?? null, sent });
    failed ||= !pass;
    await context.close();
  }
  // ---------------------------------------------------------------- B2 · deck answer: the word's type on the word's line
  {
    const { context, page, press, sleep, learn } = await freshPage();
    await learn();
    await press('.learn-go-deck');
    await page.locator('#kp-reveal').waitFor(); await sleep(2500);
    await press('#kp-reveal'); await sleep(1800);
    const row = await page.evaluate(() => {
      const box = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
      const word = document.querySelector('#kp-card .kp-word');
      return { term: box(word?.querySelector('.kp-term')), badge: box(word?.querySelector('.kp-posbadge')), badgeText: word?.querySelector('.kp-posbadge')?.textContent || null };
    });
    const pass = !!row.term && !!row.badge && row.badge.top < row.term.bottom;
    report('B2 deck answer at phone width: the word type stays on the word line', pass, row);
    failed ||= !pass;
    await context.close();
  }
} catch (error) {
  console.log(JSON.stringify({ case: 'run', pass: false, detail: String(error?.message || error).split('\n')[0].slice(0, 300) }));
  failed = true;
} finally {
  await browser.close(); server.close(); await fake.close?.();
}
console.log(`${results.filter((r) => r.pass).length} of ${results.length} pass (${ENGINE}, ${WIDTH})`);
process.exit(failed ? 1 : 0);
