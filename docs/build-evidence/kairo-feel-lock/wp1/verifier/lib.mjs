/* Verifier's own harness — written independently of the implementer's scripts.
 * Static server + Chromium context helpers for the WP1 re-measurement. */
/* global console */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '../../../../..');
export const CORRIDOR = resolve(REPO, 'prototypes/corridor');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export function serve(rootDir = CORRIDOR) {
  const root = resolve(rootDir);
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const file = resolve(root, rel);
    if (!file.startsWith(root) || !existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    res.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () =>
      ok({ server, base: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}

export async function phone(width = 390, height = 844) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = { console: [], page: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') errors.console.push(m.text());
  });
  page.on('pageerror', (e) => errors.page.push(String(e)));
  return { browser, context, page, errors };
}

export async function openShelf(page, base, query = '') {
  const q = query ? `&${query}` : '';
  await page.goto(`${base}/index.html?entry=shelf${q}`, { waitUntil: 'load' });
  await page.waitForSelector('.shelf-item', { timeout: 20000 });
}

export async function passageIds(page) {
  return page.evaluate(
    `[...document.querySelectorAll('.shelf-item')].map((n) => n.dataset.passage)`,
  );
}

export async function openArticle(page, base, id, query = '') {
  await openShelf(page, base, query);
  await page.click(`.shelf-item[data-passage="${id}"]`);
  await page.waitForSelector('#reader .tok', { timeout: 20000 });
  // article body arrives from its own file — wait until content tokens exist
  await page
    .waitForFunction(`document.querySelectorAll('#reader button.tok.content').length > 5`, {
      timeout: 20000,
    })
    .catch(() => {});
}
