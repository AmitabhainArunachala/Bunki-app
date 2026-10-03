/**
 * 単語帳 ⇄ study cards round trip. Done = this is green.
 *
 * The deck's study page (decks/kotoba-mine/release/study.html) is published
 * beside the corridor at decks/kotoba-mine/, on the same origin, so the two
 * doors share one localStorage. This drives both in real Chromium:
 *
 *   L1  ?deck=kotoba-mine opens 単語帳 on the deck, with a door to the cards
 *   L2  &module=m03-fab opens that module, whose door targets its passage
 *   L3  the door loads the cards on that module; their Bunki link returns
 *       to the same module in 単語帳
 *   L4  a word studied on the cards shows as such in 単語帳 (one ledger read,
 *       never written by the corridor)
 *   L5  the published copy is byte-identical to the release study.html
 *   L6  no page or console error on either side
 *
 * Claim boundary: same-origin serving from this directory, as pages-app.yml
 * assembles it. It does not prove GitHub Pages itself, the service worker's
 * offline cache, or the single-file standalone corridor (which links to the
 * published cards instead of a neighbour directory).
 *
 * Usage: node verify-kotoba-study-link.mjs
 *        [--corridor-js <file>] [--study <file>]   (serve these instead — the negative control)
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const REPO = resolve(CORRIDOR_DIR, '../..');
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? resolve(process.argv[i + 1]) : null;
};
const OVERRIDE = {
  '/corridor.js': arg('--corridor-js'),
  '/decks/kotoba-mine/index.html': arg('--study'),
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function startServer() {
  const server = createServer((request, response) => {
    let path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    const file = OVERRIDE[path] || resolve(CORRIDOR_DIR, path.replace(/^\/+/, ''));
    if (!OVERRIDE[path] && (!file.startsWith(CORRIDOR_DIR) || !existsSync(file))) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    if (!existsSync(file)) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'cache-control': 'no-store', 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

let failures = 0;
function check(name, pass, detail = '') {
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function main() {
  const deck = JSON.parse(readFileSync(resolve(CORRIDOR_DIR, 'data/share_alike/decks/kotoba-mine.json'), 'utf8'));
  const mod = deck.modules.find((m) => m.id === 'm03-fab');
  const published = resolve(CORRIDOR_DIR, 'decks/kotoba-mine/index.html');
  const release = resolve(REPO, 'decks/kotoba-mine/release/study.html');
  const same = existsSync(published) && existsSync(release) && readFileSync(published).equals(readFileSync(release));
  check('L5 the published cards are byte-identical to release/study.html', OVERRIDE['/decks/kotoba-mine/index.html'] ? false : same);

  const { server, base } = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // the service worker would serve its own cache between the two halves; this run is about the pages
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'serviceWorker', { value: undefined });
    } catch {}
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  const corridorReady = () => page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  const attempt = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      check(name, false, 'threw: ' + String(e.message || e).split('\n')[0]);
    }
  };

  try {
    await attempt('L1 ?deck=kotoba-mine opens 単語帳 with a door to the cards', async () => {
      await page.goto(`${base}/index.html?deck=kotoba-mine`, { waitUntil: 'load' });
      await corridorReady();
      await page.waitForSelector('[data-deck-module]', { timeout: 15000 });
      const door = await page.locator('#deck-study').evaluate((a) => a.href);
      check('L1 ?deck=kotoba-mine opens 単語帳 with a door to the cards', door === `${base}/decks/kotoba-mine/`, door);
    });

    await attempt('L2 &module= opens that module, its door aimed at the passage', async () => {
      await page.goto(`${base}/index.html?deck=kotoba-mine&module=m03-fab`, { waitUntil: 'load' });
      await corridorReady();
      await page.waitForSelector('#deck-study-module', { timeout: 15000 });
      const title = await page.locator('h1.view-title').textContent();
      const door = await page.locator('#deck-study-module').evaluate((a) => a.href);
      check('L2 &module= opens that module, its door aimed at the passage',
        title.trim() === mod.title.ja.split(' — ')[0] && door === `${base}/decks/kotoba-mine/#m03-fab`, `${title} → ${door}`);
    });

    await attempt('L3 the door opens the cards on that module; their Bunki link comes back', async () => {
      await page.locator('#deck-study-module').click();
      await page.waitForSelector('.article h2', { timeout: 15000 });
      const heading = await page.locator('.article h2').textContent();
      const back = await page.locator('#bunki-module').evaluate((a) => a.href);
      check('L3 the door opens the cards on that module; their Bunki link comes back',
        page.url() === `${base}/decks/kotoba-mine/#m03-fab` && heading === mod.passageTitle && back === `${base}/?deck=kotoba-mine&module=m03-fab`,
        `${heading} · back → ${back}`);
    });

    await attempt('L4 a word studied on the cards shows in 単語帳', async () => {
      await page.locator('.article .primary').click(); // この鉱脈を学ぶ
      await page.waitForSelector('#card', { timeout: 8000 });
      const face = await page.evaluate(() => cur.face);
      const word = await page.evaluate(() => byKey.get(cur.face.split(':')[0]).term);
      await page.keyboard.press('Space');
      await page.keyboard.press('3');
      await page.keyboard.press('Escape');
      await page.click('[data-tab="read"]');
      await page.locator('#bunki-module').click();
      await corridorReady();
      await page.waitForSelector('.deck-card', { timeout: 15000 });
      const row = page.locator('.deck-card', { has: page.locator('.lesson-enroll-word', { hasText: word }) }).first();
      const state = await row.locator('.deck-card-state').textContent();
      const corridorTouched = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('kairo-corridor-v1') || '{}');
        return (s.taken || []).length;
      });
      check('L4 a word studied on the cards shows in 単語帳', /カード · 学習中|cards · learning/.test(state) && corridorTouched === 0,
        `${face} ${word}: "${state}", corridor rows ${corridorTouched}`);
    });
  } finally {
    await browser.close();
    server.close();
  }
  check('L6 no page or console errors on either side', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
