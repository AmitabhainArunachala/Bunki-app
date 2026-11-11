/** Independent review of the speech lane's one head (763776ea7): does a kept clip play in WebKit when the network is gone,
 * not only when Playwright's offline switch is on? Muted and headless, loopback only, the repository's silent stand-in
 * voice server; no sound, no real voice server, no token or pairing code.
 *
 *   node prototypes/corridor/tools/review-all/webkit-network-gone.mjs --site <built site> [--engine webkit|chromium]
 *        [--width 390] [--port 19588] [--mode gone|airplane|playwright]
 *
 * Online, the ear says one sentence of an article (armed tap) and the clip is kept on the device. The page is loaded again
 * and the article opened. Then the network goes:
 *   gone       the site's server and the stand-in voice server are both shut (every request now fails at the socket);
 *   airplane   the same, and the page is told it is offline (navigator.onLine false and the offline event), as a phone
 *              in airplane mode is;
 *   playwright Playwright's own offline switch (the builder saw it refuse the kept clip's blob: address in WebKit).
 * The same sentence is tapped again: PASS when the voice element plays a clip longer than the priming silence with no
 * media error, and no speak request reached the stand-in. */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const SITE = arg('--site', '');
const ENGINE = arg('--engine', 'webkit');
const WIDTH = Number(arg('--width', '390'));
const PORT = Number(arg('--port', '19588'));
const MODE = arg('--mode', 'gone');
if (!SITE) { console.error('usage: webkit-network-gone.mjs --site <built site>'); process.exit(2); }
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
process.env.REVIEW_BASE = `http://127.0.0.1:${PORT}/`;
const { open, openArticle, earMark, earState } = await import('../review-ear/lib.mjs');

const s = await open({ engine: ENGINE, width: WIDTH, voicePort: PORT + 1, clipSeconds: () => 0.8 });
const { page, press, context } = s;
await context.addInitScript(() => {
  window.__ev = [];
  for (const type of ['playing', 'error']) document.addEventListener(type, (e) => {
    const a = e.target;
    if (a?.matches?.('audio[data-speak-audio]')) window.__ev.push({ type, d: a.duration, src: String(a.currentSrc).slice(0, 5), err: a.error ? a.error.code : 0 });
  }, true);
});
const failed = [];
page.on('requestfailed', (r) => { if (/\/v1\/audio\//.test(r.url())) failed.push(new URL(r.url()).pathname); });
const tapWord = async (n) => {
  const w = page.locator('.reader .tok.content').nth(n); await w.scrollIntoViewIfNeeded(); const b = await w.boundingBox();
  if (s.phone) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
};
const keptKeys = () => page.evaluate(() => new Promise((done) => {
  const req = indexedDB.open('bunki-voice-clips-v1');
  req.onsuccess = () => { const db = req.result; try { const r = db.transaction(['index'], 'readonly').objectStore('index').getAllKeys(); r.onsuccess = () => { done(r.result.map(String)); db.close(); }; } catch (e) { done([String(e)]); } };
  req.onerror = () => done(['open failed']);
}));
let verdict = { pass: false };
try {
  await openArticle(s, { start: false });
  await press(await earMark(page)); await s.sleep(300);
  const n0 = s.fake.speaks().length;
  await tapWord(8); await s.sleep(3000);
  const online = { asked: s.fake.speaks().slice(n0).map((r) => r.text), events: await page.evaluate(() => window.__ev) };
  const kept = await keptKeys();
  await openArticle(s, { start: false });
  const speaksBefore = s.fake.speaks().length;
  if (MODE === 'playwright') await context.setOffline(true);
  else {
    await s.fake.close();
    await new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); });
    if (MODE === 'airplane') await page.evaluate(() => { Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
  }
  await page.evaluate(() => { window.__ev = []; });
  await press(await earMark(page)); await s.sleep(300);
  await tapWord(8); await s.sleep(3000);
  const events = await page.evaluate(() => window.__ev);
  const after = { asked: s.fake.speaks().length - speaksBefore, failed: [...failed], events, ear: await earState(page),
    line: await page.evaluate(() => [...document.querySelectorAll('.ear-spot')].map((x) => x.lastElementChild).find((x) => x && !x.hidden)?.textContent || '') };
  const played = events.some((e) => e.type === 'playing' && e.d > 0.2);
  const errored = events.some((e) => e.type === 'error');
  verdict = { pass: online.asked.length > 0 && kept.length > 0 && played && !errored && after.asked === 0, mode: MODE, online, kept: kept.length, after };
} catch (error) {
  verdict = { pass: false, error: String(error?.message || error).split('\n')[0].slice(0, 300) };
} finally {
  console.log(JSON.stringify({ case: `a kept clip plays with the network ${MODE}`, engine: ENGINE, width: WIDTH, ...verdict }));
  await s.close();
  server.close();
  process.exit(verdict.pass ? 0 : 1);
}
