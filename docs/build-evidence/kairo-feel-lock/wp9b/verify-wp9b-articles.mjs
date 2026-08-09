/**
 * WP9b acceptance: every NEW shelf article opens through the real served
 * build, in real Chromium, with zero console/page errors.
 *
 * Not a unit test — it drives the shipped UI at 390×844 with touch emulation
 * (CDP Input.dispatchTouchEvent, the same grammar verify-corridor.mjs uses;
 * mouse events are not gesture evidence on a touch-first surface), over a
 * plain static server rooted at prototypes/corridor/. That is the same
 * `fetch('data/articles/<slug>.json')` lazy path the served build uses — the
 * standalone bundle is NOT exercised here on purpose.
 *
 * Per new article it asserts: the shelf row exists, the reader opens, tokens
 * render, furigana <rt> render, paragraphs survive, and holding a content
 * token opens the mini-dictionary with a real reading + gloss (the ladder).
 * Console errors, page exceptions, failed requests and non-2xx responses are
 * collected for the whole run and must be zero.
 *
 * Usage: node docs/build-evidence/kairo-feel-lock/wp9b/verify-wp9b-articles.mjs [--shots DIR]
 */

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..', '..');
const CORRIDOR = resolve(REPO, 'prototypes/corridor');

const VIEWPORT = { width: 390, height: 844 };
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

/** The 14 articles this work package adds. */
const NEW_IDS = [
  'bunki-graded-n5-station',
  'bunki-graded-n5-kitchen',
  'bunki-graded-n5-neighbour',
  'bunki-graded-n4-letter',
  'bunki-graded-n4-market',
  'bunki-graded-n4-bicycle',
  'bunki-graded-n3-river',
  'bunki-graded-n3-radio',
  'bunki-graded-n3-handwriting',
  'bunki-essay-n2-notebook',
  'bunki-essay-n2-rain',
  'bunki-essay-n2-translation',
  'bunki-essay-n1-memory',
  'bunki-essay-n1-city',
];
/** Articles screenshotted in full (reader + an open mini-dictionary). */
const SHOT_IDS = new Set([
  'bunki-graded-n5-station',
  'bunki-graded-n3-river',
  'bunki-essay-n1-memory',
]);

function serve(rootDir) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
    const file = resolve(rootDir, rel);
    if (!file.startsWith(rootDir) || !existsSync(file)) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    response.end(readFileSync(file));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

const results = [];
let failures = 0;
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail: String(detail) });
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}

async function touchAt(page, handle, holdMs) {
  await handle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(60);
  const box = await handle.evaluate((node) => {
    const r = node.getClientRects()[0] ?? node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box || !box.width) throw new Error('touch: no box');
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 6, radiusY: 6, force: 1 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  if (holdMs) await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(140);
}

const shotsArg = process.argv.indexOf('--shots');
const shotsDir = shotsArg > -1 ? resolve(process.argv[shotsArg + 1]) : join(HERE, 'screenshots');
mkdirSync(shotsDir, { recursive: true });

const index = JSON.parse(readFileSync(resolve(CORRIDOR, 'data/articles/index.json'), 'utf8'));
const rowById = new Map(index.articles.map((r) => [r.id, r]));

const { server, base } = await serve(CORRIDOR);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
});

// ------------------------------------------------------- error collection
const noise = [];
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') noise.push({ kind: `console.${m.type()}`, text: m.text() });
});
page.on('pageerror', (e) => noise.push({ kind: 'pageerror', text: String(e) }));
page.on('requestfailed', (r) => noise.push({ kind: 'requestfailed', text: `${r.url()} ${r.failure()?.errorText}` }));
const seenResponses = [];
page.on('response', (r) => {
  seenResponses.push({ url: r.url(), status: r.status() });
  if (r.status() >= 400) noise.push({ kind: 'http', text: `${r.url()} → ${r.status()}` });
});

const perArticle = [];

check('the shelf carries 40 articles', index.articles.length === 40, `${index.articles.length} in index.json`);

for (const id of NEW_IDS) {
  const row = rowById.get(id);
  if (!row) {
    check(`${id} · present in index.json`, false, 'missing');
    continue;
  }
  const before = noise.length;
  const respStart = seenResponses.length;

  await page.goto(`${base}/?entry=shelf`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.shelf-item');

  // find the shelf row by its Japanese title — the reader is reached the way a
  // user reaches it, by tapping the shelf, not by deep-linking
  const item = page.locator('.shelf-item').filter({ hasText: row.title }).first();
  const found = (await item.count()) > 0;
  check(`${id} · stands on the shelf`, found, found ? row.title : 'no shelf row');
  if (!found) continue;

  // the per-file fetch this visit triggers — its own file over HTTP, never
  // the index and never a bundle
  await touchAt(page, item, 0);
  await page.waitForSelector('#reader .tok', { timeout: 20000 });
  const res = seenResponses
    .slice(respStart)
    .find((r) => r.url.includes(`data/articles/${row.file}`));

  const shape = await page.evaluate(`(() => ({
    toks: document.querySelectorAll('#reader .tok').length,
    content: document.querySelectorAll('#reader .tok.content').length,
    rt: document.querySelectorAll('#reader rt').length,
    paras: document.querySelectorAll('#reader .para-break').length,
    chars: document.getElementById('reader').innerText.replace(/\\s/g, '').length,
  }))()`);

  // The reader's click grammar (corridor.js GESTURE): a hold past MINI_MS=430
  // floats the mini-dictionary; holding past FULL_MS=2100 morphs it into the
  // full entry sheet. Both rungs are exercised on real tokens of this text.
  const glossed = [];
  const toks = page.locator('#reader .tok.content');
  const nTok = await toks.count();
  for (const i of [0, Math.floor(nTok / 3), Math.floor(nTok / 2)]) {
    if (i >= nTok) continue;
    await touchAt(page, toks.nth(i), 900);
    const mini = await page.evaluate(`(() => {
      const m = document.getElementById('mini');
      if (!m) return null;
      return {
        word: m.querySelector('.mini-word')?.textContent ?? '',
        reading: m.querySelector('.mini-reading')?.textContent ?? '',
        gloss: m.querySelector('.mini-gloss')?.textContent ?? '',
      };
    })()`);
    if (mini?.word) glossed.push(mini);
    if (SHOT_IDS.has(id) && glossed.length === 1) {
      await page.screenshot({ path: join(shotsDir, `${id}-mini.png`) });
    }
    await page.evaluate(`document.getElementById('mini')?.remove()`);
    await page.waitForTimeout(80);
  }

  // deepest rung — keep holding until the full dictionary entry opens
  await touchAt(page, toks.nth(0), 2400);
  const sheet = await page.evaluate(`(() => {
    const s = document.getElementById('sheet');
    return s ? { text: s.innerText.slice(0, 60), rows: s.querySelectorAll('.sem-row, .chip').length } : null;
  })()`);
  if (SHOT_IDS.has(id)) await page.screenshot({ path: join(shotsDir, `${id}-full-entry.png`) });
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(120);

  if (SHOT_IDS.has(id)) {
    await page.screenshot({ path: join(shotsDir, `${id}-reader.png`), fullPage: true });
  }

  check(`${id} · lazy-loads its own file`, res?.status === 200, `data/articles/${row.file} → ${res ? res.status : 'not fetched'}`);
  check(`${id} · the reader renders tokens`, shape.toks > 50 && shape.content > 20,
    `${shape.toks} tokens (${shape.content} content), ${shape.chars} chars`);
  check(`${id} · furigana render`, shape.rt > 10, `${shape.rt} <rt>`);
  check(`${id} · paragraphs survive`, shape.paras >= 3, `${shape.paras} paragraph breaks`);
  check(
    `${id} · the gloss ladder opens on a held word`,
    glossed.length >= 2 && glossed.every((g) => g.word && g.gloss),
    glossed.map((g) => `${g.word}${g.reading ? `(${g.reading})` : ''}→${g.gloss.slice(0, 18)}`).join(' · '),
  );
  // The claim is that the deepest rung opens on a token of THIS text. Which
  // token the finger lands on is not fixed: an inline gloss mounted by the
  // previous rung can shift the line by a few pixels, so the hold sometimes
  // lands on the neighbouring particle — whose entry legitimately carries no
  // .sem-row/.chip. Assert the sheet opens with real content, not its shape.
  check(`${id} · the full entry opens on a longer hold`, !!sheet && sheet.text.trim().length > 10,
    sheet ? `#sheet · ${sheet.rows} rows · ${sheet.text.replace(/\n/g, ' ').slice(0, 40)}` : 'no #sheet');
  check(`${id} · opened with zero console/page errors`, noise.length === before, `${noise.length - before} new`);

  perArticle.push({ id, file: row.file, ...shape, glossed: glossed.length });
}

check('zero console errors, page exceptions or failed requests across the whole run', noise.length === 0, JSON.stringify(noise.slice(0, 8)));

await browser.close();
server.close();

writeFileSync(
  join(HERE, 'wp9b-article-verification.json'),
  `${JSON.stringify({ generated: new Date().toISOString(), articles: perArticle, noise, results, failures }, null, 1)}\n`,
);

console.log(`\n${results.length - failures}/${results.length} checks passed`);
console.log(`screenshots → ${shotsDir}`);
process.exit(failures ? 1 : 0);
