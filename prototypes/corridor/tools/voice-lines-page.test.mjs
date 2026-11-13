// The voice's one vocabulary on the page (speech lane, 2026-11-13): a press that finds no voice says the true cause beside
// the control, in the ruled words (modules/voice-lines.mjs, held to the lead's ruling by tools/voice-lines.test.mjs); the
// line goes after about four seconds or at the next press; a slow answer and a busy server are two causes; an upgrade
// answer (426) says to update; the ear names a pairing the server ended "pair again" on its label as in its line.
//
// Served from the source folder, Chromium only, silent (--mute-audio, media muted, speech stubbed), against the
// repository's silent stand-in voice server on this machine. Waits for the page, never for a fixed time.
//   node --test prototypes/corridor/tools/voice-lines-page.test.mjs
// The lane's proof runs it with the processor slowed (the throttle is Chromium's):
//   VOICE_LINES_RATE=12 node --test prototypes/corridor/tools/voice-lines-page.test.mjs
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { startFakeVoiceServer } from './fake-voice-server.mjs';
import { VOICE_WORDS, voiceEarLabel, voiceLineOf } from '../modules/voice-lines.mjs';

const CORRIDOR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(CORRIDOR, '../../package.json'))('playwright-core');
const RATE = Number(process.env.VOICE_LINES_RATE || 1);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const WORD = '?ui=bi&read=wikinews:1403&word=開催';
const MARK = '#sheet .voice-say[data-voice-say="entry-headword"]';
const en = (pair) => pair[1];

let server, base, fake, browser, context;
before(async () => {
  server = createServer((request, response) => {
    const path = decodeURIComponent((request.url || '/').split('?')[0]);
    const file = resolve(CORRIDOR, path === '/' ? 'index.html' : path.replace(/^\/+/, ''));
    if (!file.startsWith(CORRIDOR) || !existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}/`;
  fake = await startFakeVoiceServer({ origins: [base.slice(0, -1)], missesPerMinute: 100000 });
  browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  context = await browser.newContext({ viewport: { width: 1728, height: 1050 }, locale: 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block' });
  await silenceBrowserAudio(context);
  await context.addInitScript(() => {
    if (globalThis.speechSynthesis) Object.getPrototypeOf(globalThis.speechSynthesis).speak = function () {};
    globalThis.__plays = 0;
    document.addEventListener('playing', (event) => { if (event.target?.matches?.('audio[data-speak-audio]') && event.target.duration > 0.2) globalThis.__plays += 1; }, true);
    // said by itself off: every request the stand-in sees is a press
    try { localStorage.setItem('kairo-voice-by-itself-v1', 'off'); localStorage.setItem('bunki-prototype:intro-dismissed:v1', '1'); } catch { /* storage may be blocked */ }
  });
  // nothing leaves this machine
  await context.route('**/*', (route) => (new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()));
  // paired once, through the app's own Settings: the pairing outlives each page of this context
  const page = await open('?ui=bi&room=me', '#me-settings');
  await page.locator('#me-settings').click();
  await page.locator('#voice-pair-learner').fill(`Bunki voice code: ${fake.issue({ learner: 'test-learner' })} (10 minutes) · learner: test-learner · server: ${fake.origin}`);
  await page.locator('#voice-pair-submit').click();
  await page.waitForFunction(() => document.getElementById('settings-voice-server')?.dataset.paired === 'true', null, { timeout: 60000 });
  await page.close();
});
after(async () => {
  await context?.close().catch(() => {});
  await browser?.close();
  await fake?.close();
  await new Promise((done) => server?.close(done) ?? done());
});

/** A page of the paired context, the processor slowed as asked, once the app and its voice layer stand. */
async function open(address, wait) {
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(String(error.message || error)));
  if (RATE > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await page.goto(base + address, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1' && 'ear' in document.documentElement.dataset, null, { timeout: 120000 });
  await page.locator(wait).first().waitFor({ timeout: 120000 });
  await settled(page);
  return page;
}
/** The page has stopped changing: nothing added or removed for a second (the ear's own nodes apart). A page goes on
 * drawing after it says ready, longer on a slow machine; a press lands after this, not after a fixed time. */
async function settled(page) {
  await page.evaluate(() => new Promise((done) => {
    let last = performance.now();
    const own = (node) => node.nodeType === 1 && node.closest?.('[data-ear-own]');
    const seen = new MutationObserver((records) => { if (records.some((record) => !own(record.target))) last = performance.now(); });
    seen.observe(document.body, { childList: true, subtree: true });
    const look = () => { if (performance.now() - last > 1000) { seen.disconnect(); done(); } else setTimeout(look, 100); };
    setTimeout(look, 100);
  }));
}
/** The line beside the mark, or null. */
const lineBeside = (sel) => { const next = document.querySelector(sel)?.nextElementSibling; return next?.classList.contains('voice-note') && next.textContent ? next.textContent : null; };
const until = (page, read, arg, ms = 60000) => page.waitForFunction(read, arg, { timeout: ms, polling: 50 }).then((handle) => handle.jsonValue());
/** How long the line stood, in ms, timed in the page from when it was first seen. */
const stood = (page) => page.evaluate(async (sel) => {
  const read = () => { const next = document.querySelector(sel)?.nextElementSibling; return next?.classList.contains('voice-note') && next.textContent; };
  const from = performance.now();
  while (read() && performance.now() - from < 15000) await new Promise((done) => setTimeout(done, 50));
  return Math.round(performance.now() - from);
}, MARK);

test('a busy voice (503) is said beside the mark in the ruled words, as its title too, and the line goes after about four seconds', async () => {
  const page = await open(WORD, MARK);
  fake.clearNext();
  fake.failNext({ status: 503, error: 'voice-unavailable' }, { status: 503, error: 'voice-unavailable' });
  await page.locator(MARK).click();
  const seen = await until(page, lineBeside, MARK);
  assert.equal(seen, en(voiceLineOf('voice-unavailable')));
  assert.equal(await page.locator(MARK).getAttribute('title'), seen);
  assert.notEqual(seen, en(voiceLineOf('voice-timeout')), 'busy is not "took too long"');
  const ms = await stood(page);
  assert.ok(ms >= 2500 && ms <= 9000, `the line stood ${ms} ms (about four seconds; the first look came after it appeared)`);
  // and the mark is called by its name again
  assert.equal(await page.locator(MARK).getAttribute('title'), en(VOICE_WORDS.listen));
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('an upgrade answer (426) says to update the app, with no tap advice; the next press takes the line away at once, and a voice leaves none', async () => {
  const page = await open(WORD, MARK);
  fake.clearNext();
  fake.failNext({ status: 426, error: 'upgrade-required' });
  await page.locator(MARK).click();
  const seen = await until(page, lineBeside, MARK);
  assert.equal(seen, en(voiceLineOf('upgrade-required')));
  assert.doesNotMatch(seen, /tap/iu);
  const played = await page.evaluate(() => globalThis.__plays);
  // the next press: the line goes as the press lands (read right after the click is handled, before any answer can
  // come), and the voice that answers leaves no line
  await page.evaluate((sel) => {
    // a listener on the mark added after the app's own runs right after it, in the same dispatch
    const mark = document.querySelector(sel);
    mark.addEventListener('click', () => {
      const next = mark.nextElementSibling;
      globalThis.__lineAtPress = next?.classList.contains('voice-note') && next.textContent ? next.textContent : '';
    }, { once: true });
  }, MARK);
  await page.locator(MARK).click();
  assert.equal(await page.evaluate(() => globalThis.__lineAtPress), '', 'the line went with the press');
  await until(page, (n) => globalThis.__plays > n, played);
  assert.equal(await page.evaluate(lineBeside, MARK), null);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('a pairing the server ended (401): the ear says "pair again" on its label as in its line', async () => {
  const page = await open(WORD, '#sheet > .sheet-bar > .bar-gate + .ear-spot .ear-mark');
  fake.clearNext();
  fake.failNext({ status: 401, error: 'authentication-required' });
  await page.locator('#sheet > .sheet-bar > .bar-gate + .ear-spot .ear-mark').click();
  await page.waitForFunction(() => document.documentElement.dataset.ear === 'armed');
  await page.locator('#sheet > h2.headword').click();
  const [line, label] = await until(page, () => {
    const spot = document.querySelector('#sheet > .sheet-bar > .bar-gate + .ear-spot');
    const why = spot?.querySelector('.ear-why');
    return why && !why.hidden && why.textContent ? [why.textContent, spot.querySelector('.ear-mark').getAttribute('aria-label')] : null;
  });
  assert.equal(line, en(voiceLineOf('authentication-required')));
  assert.equal(label, en(voiceEarLabel('novoice', 'authentication-required')));
  assert.deepEqual(page.errors, []);
  await page.close();
});
