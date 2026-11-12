// The ear's mark never leaves a bar that is on screen (speech lane, 2026-11-13).
//
// The app draws a room's bar again several times while the room loads (Learn draws it five times). Each new bar came
// without the ear's mark, and the mark was put back by the voice layer's next look at the page, 60 ms and one whole
// scan later. On a slow machine that gap is long: the line's own check on GitHub read the Learn bar inside it and found
// no mark (run 43250667303, gate-everywhere.test.mjs cases 3 and 12), and a slow phone shows the mark blink.
//
// This check loads a room with the processor slowed, looks at every frame the browser draws from the first frame that
// shows a mark, and counts the frames in which a bar's gate stands without the mark beside it. None may.
//
// Served from the source folder, Chromium, silent (--mute-audio, media muted, speech stubbed).
//   node prototypes/corridor/tools/ear-place-with-bar.mjs [--rate 6] [--rooms dojo,tray,shelf]
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

const CORRIDOR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(CORRIDOR, '../../package.json'))('playwright-core');
const arg = (name, fallback) => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : fallback; };
const RATE = Number(arg('--rate', '6'));
const ROOMS = arg('--rooms', 'dojo,tray,shelf').split(',');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const server = createServer((request, response) => {
  const path = decodeURIComponent((request.url || '/').split('?')[0]);
  const file = resolve(CORRIDOR, path === '/' ? 'index.html' : path.replace(/^\/+/, ''));
  if (!file.startsWith(CORRIDOR) || !existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  response.end(readFileSync(file));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });

/** In the page, from its first script on: one note per drawn frame, once a mark has been seen. */
function watchFrames() {
  if (globalThis.speechSynthesis) Object.getPrototypeOf(globalThis.speechSynthesis).speak = function () {};
  try { localStorage.setItem('bunki-prototype:intro-dismissed:v1', '1'); } catch { /* storage may be blocked */ }
  const seen = (globalThis.__earFrames = { frames: 0, bare: 0, first: null, worst: 0, run: 0, redraws: 0 });
  let lastGate = null;
  const frame = () => {
    const gate = document.querySelector(':is(#app > .chrome, #sheet > .sheet-bar) > .bar-gate');
    const shown = gate && gate.getClientRects().length > 0;
    if (shown && gate !== lastGate) { if (lastGate) seen.redraws += 1; lastGate = gate; }
    const mark = shown && gate.nextElementSibling?.classList?.contains('ear-spot');
    if (seen.first === null && document.querySelector('.ear-spot')) seen.first = Math.round(performance.now());
    if (seen.first !== null && shown) {
      seen.frames += 1;
      if (mark) seen.run = 0;
      else { seen.bare += 1; seen.run += 1; seen.worst = Math.max(seen.worst, seen.run); }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

let failed = 0;
for (const room of ROOMS) {
  const context = await browser.newContext({ viewport: { width: 1728, height: 1050 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'Asia/Tokyo' });
  await silenceBrowserAudio(context);
  await context.addInitScript(watchFrames);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error.message || error)));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await page.goto(`${base}?room=${room}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(2500);
  const seen = await page.evaluate(() => globalThis.__earFrames);
  const ok = seen.first !== null && seen.frames > 0 && seen.bare === 0 && errors.length === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${room} at 1728, processor x${RATE}: the bar was drawn again ${seen.redraws} time(s); `
    + `${seen.frames} frame(s) showed a bar's gate after the first mark, ${seen.bare} of them without the mark beside it `
    + `(longest run ${seen.worst}); page errors ${errors.length}${seen.first === null ? '; no mark was ever seen' : ''}`);
  await context.close();
}
await browser.close();
await new Promise((done) => server.close(done));
console.log(`${ROOMS.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
