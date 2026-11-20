/* global URL, document */
/** A silent Chromium page served from the corridor's own source folder, for tests that run one authored module or one
 * stylesheet as the app ships it. The host serves files under prototypes/corridor read-only and answers /__page with
 * an empty page that loads the named stylesheets; nothing is built and nothing is written. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const CORRIDOR = resolve(fileURLToPath(new URL('../prototypes/corridor', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.svg': 'image/svg+xml',
};
// no sound from tests (John, 2026-11-10): media is muted and speech is swallowed before any page script runs
const SILENCE = `(() => { try {
  const m = HTMLMediaElement.prototype, play = m.play;
  m.play = function () { this.muted = true; this.volume = 0; return play.call(this); };
  if (window.speechSynthesis) Object.getPrototypeOf(window.speechSynthesis).speak = function () {};
} catch {} })();`;

export async function openCorridorSourcePage({
  stylesheets = [],
  html = '',
  viewport = { width: 390, height: 844 },
} = {}) {
  const page404 = (res) => {
    res.writeHead(404);
    res.end();
  };
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/__page') {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      res.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8">${stylesheets
          .map((href) => `<link rel="stylesheet" href="/${href}">`)
          .join('')}</head><body>${html}</body></html>`,
      );
      return;
    }
    const file = normalize(join(CORRIDOR, path));
    if (!file.startsWith(CORRIDOR + sep)) return page404(res);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      page404(res);
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  const context = await browser.newContext({ viewport });
  await context.addInitScript(SILENCE);
  const page = await context.newPage();
  await page.goto(`${origin}/__page`);
  await page.evaluate(() => document.fonts.ready);
  return {
    page,
    origin,
    async close() {
      await browser.close();
      await new Promise((done) => server.close(done));
    },
  };
}
