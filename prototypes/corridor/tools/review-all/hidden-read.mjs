/** Independent review of the speech lane's one head (763776ea7): what an article read he started does when the page is
 * hidden (the builder's I12 report), on this head and on the build on the owner's phone (6b005c6b4), and what a later
 * press on the bar's play does. Muted and headless, loopback only, the repository's silent stand-in voice server.
 *
 *   node prototypes/corridor/tools/review-all/hidden-read.mjs --site <built site> [--engine webkit|chromium] [--width 390]
 *        [--port 19586]
 *
 * Reports (exit 0 always; this is a measurement, not a verdict): the read before, while hidden and after the page is shown
 * again (the bar's data-voice-state, its button's label, the lit sentence, whether a voice element plays), then the same
 * after one press on the bar's button. Hidden is the page's own: document.hidden and visibilityState read hidden, and the
 * visibilitychange event fires, as on a locked phone. */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const SITE = arg('--site', '');
const ENGINE = arg('--engine', 'webkit');
const WIDTH = Number(arg('--width', '390'));
const PORT = Number(arg('--port', '19586'));
if (!SITE) { console.error('usage: hidden-read.mjs --site <built site>'); process.exit(2); }
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
const { open, openArticle } = await import('../review-ear/lib.mjs');

const s = await open({ engine: ENGINE, width: WIDTH, voicePort: PORT + 1, clipSeconds: () => 3 });
const { page } = s;
const look = () => page.evaluate(() => {
  const row = document.querySelector('.listen-row');
  const btn = document.getElementById('listen-toggle');
  const lit = [...document.querySelectorAll('#reader .tok[data-speaking]')];
  const sounding = [...document.querySelectorAll('audio')].filter((a) => !a.paused && !a.ended && a.currentTime > 0).length;
  return { bar: row?.dataset.voiceState || '', button: btn?.getAttribute('aria-label') || '', pressed: btn?.getAttribute('aria-pressed') || '',
    lit: lit.length ? Number(lit[0].dataset.index) : -1, sounding, hidden: document.hidden };
});
const setHidden = (hidden) => page.evaluate((hidden) => {
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);
const out = { engine: ENGINE, width: WIDTH, site: SITE.split('/').pop() };
try {
  await openArticle(s, { start: true });
  await s.sleep(4500);
  out.playing = await look();
  const n0 = s.fake.speaks().length;
  await setHidden(true);
  await s.sleep(2500);
  out.hidden = { ...(await look()), asked: s.fake.speaks().length - n0 };
  await setHidden(false);
  await s.sleep(2500);
  out.shownAgain = { ...(await look()), asked: s.fake.speaks().length - n0 };
  await s.press('#listen-toggle');
  await s.sleep(3000);
  out.afterOnePress = { ...(await look()), asked: s.fake.speaks().length - n0 };
} catch (error) {
  out.error = String(error?.message || error).split('\n')[0].slice(0, 300);
} finally {
  console.log(JSON.stringify(out));
  await s.close();
  server.close();
  process.exit(0);
}
