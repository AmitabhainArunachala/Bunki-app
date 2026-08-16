/**
 * Integration-seam probe: serve the ROUND-1 INTEGRATED corridor.js/css over
 * this branch's NEW article data and check the bilingual shelf renders the
 * feed candidates' English titles from the records themselves, 検収前 intact.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

import { chromium } from 'playwright-core';

const ROOT = '/tmp/claude-0/-home-user-Bunki-app/b3360808-e2ed-5db2-afd2-3ff21ea58fdf/scratchpad/corridor-integrated';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const server = createServer((request, response) => {
  const pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = resolve(ROOT, relative);
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  response.end(readFileSync(file));
});
await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
const base = `http://127.0.0.1:${server.address().port}`;

const index = JSON.parse(readFileSync(resolve(ROOT, 'data/articles/index.json'), 'utf8'));
const curated = index.articles.filter((row) => !String(row.file || '').startsWith('archive/'));
const feedRows = curated.filter((row) => row.titleEnSource === 'renkan-ai-2026-08');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${base}/index.html?entry=shelf&ui=bi`, { waitUntil: 'load' });
await page.waitForFunction(
  (expected) => document.body.dataset.ready === '1' && document.querySelectorAll('.shelf-item').length === expected,
  curated.length,
  { timeout: 30000 },
);
const cards = await page.evaluate(() =>
  Object.fromEntries(
    [...document.querySelectorAll('.shelf-item')].map((item) => [
      item.dataset.passage,
      {
        en: item.querySelector('.shelf-title-en')?.textContent ?? null,
        meta: item.querySelector('.shelf-meta')?.textContent ?? '',
      },
    ]),
  ),
);
let pass = 0;
let fail = 0;
for (const row of feedRows) {
  const card = cards[row.id];
  const ok = card && card.en === row.titleEn && /検収前/.test(card.meta);
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${row.id} · EN title from record + 検収前 — "${card?.en}"`);
  ok ? pass++ : fail++;
}
const allEn = curated.filter((row) => cards[row.id]?.en !== row.titleEn);
console.log(`${allEn.length === 0 ? ' ok ' : 'FAIL'}  all ${curated.length} shelf cards render titleEn from the record itself`);
if (allEn.length) fail++;
console.log(`\nintegrated-seam probe: ${pass + (allEn.length === 0 ? 1 : 0)}/${feedRows.length + 1} passed`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
