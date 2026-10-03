/**
 * 単語帳 (言葉の鉱脈) verifier. Done = this is green.
 *
 * Half one reads the shipped deck as DATA: every card's anchor `i` must land
 * on a token of its module's article whose base form IS the card's headword
 * — the exact condition the review cloze (renderSentenceTokens, targetId ===
 * token.b) needs to blank the word inside its mined sentence — and every
 * module's article must stand on the shelf index as an original-lane text.
 *
 * Half two drives the room in real Chromium:
 *   · the shelf door opens the deck; a module lists every word;
 *   · nothing is enrolled until ぜんぶ覚える is pressed, and then every row
 *     is a started 覚える row carrying ctx into the module's article, and
 *     the module becomes a named list;
 *   · この鉱脈だけ復習 opens a review whose face is the mined sentence with
 *     the word blanked;
 *   · the record survives a reload without quarantine.
 *
 * Usage: node verify-kotoba-mine.mjs   (regenerate data: python3 decks/kotoba-mine/tools/build_deck.py)
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const DATA_DIR = resolve(CORRIDOR_DIR, 'data');
const DECK_PATH = resolve(DATA_DIR, 'share_alike/decks/kotoba-mine.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function startServer(rootDir = CORRIDOR_DIR) {
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

let failures = 0;
function check(name, pass, detail = '') {
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/* ------------------------------------------------- half one: the deck */
function verifyDeck() {
  const deck = readJson(DECK_PATH);
  const index = readJson(resolve(DATA_DIR, 'articles/index.json'));
  const rows = new Map(index.articles.map((a) => [a.id, a]));
  check('the deck is schema 1, names its law and both licences', deck.schemaVersion === 1 && /door, not a schedule/u.test(deck.law) &&
    /JMdict/u.test(deck.licence.english_glosses) && /Bunki original/u.test(deck.licence.passages_sentences_definitions));
  const cards = deck.modules.flatMap((m) => m.cards);
  const heads = new Set(cards.map((c) => c.n));
  check('every mined word is one card — 323 in all, none twice', cards.length === 323 && heads.size === 323, `${cards.length} cards, ${heads.size} distinct`);
  const anchorProblems = [];
  const shapeProblems = [];
  for (const m of deck.modules) {
    const row = rows.get(m.article);
    if (!row) {
      anchorProblems.push(`${m.id}: article ${m.article} not on the shelf index`);
      continue;
    }
    if (row.pool !== 'original' || row.licence !== 'Bunki original' || row.titleEnSource !== 'shelf-map-2026' || row.review) {
      shapeProblems.push(`${m.article}: index row provenance`);
    }
    const body = readJson(resolve(DATA_DIR, 'articles', row.file));
    for (const c of m.cards) {
      if (!c.w || !c.r || !c.g || !c.d || !Array.isArray(c.s) || c.s.length < 2) shapeProblems.push(`${m.id}#${c.n}: fields`);
      for (const [ja, form, en] of c.s || []) if (!ja.includes(form) || !en) shapeProblems.push(`${m.id}#${c.n}: sentence`);
      const tok = body.tokens[c.i];
      if (!Number.isInteger(c.i) || !tok) anchorProblems.push(`${m.id}#${c.n} ${c.w}: no anchor`);
      else if (tok.b !== c.w || !tok.c || !tok.f?.length) anchorProblems.push(`${m.id}#${c.n} ${c.w}: token ${tok.s}/${tok.b}`);
    }
  }
  check('every module passage stands on the shelf as an original-lane text', shapeProblems.length === 0, shapeProblems.slice(0, 4).join(' | ') || `${deck.modules.length} passages`);
  check('every card is anchored on a live token whose base form is its headword (the cloze can blank it)', anchorProblems.length === 0, anchorProblems.slice(0, 4).join(' | ') || `${cards.length}/${cards.length}`);
  const source = readFileSync(resolve(CORRIDOR_DIR, 'corridor.js'), 'utf8');
  check('the room enrolls through the guarded store path only', source.includes('const patch = deckEnrollPatch(deck, mod, fresh);') && source.includes('commitStorePatch(patch)'));
  return deck;
}

/* --------------------------------------------------- half two: the room */
async function main() {
  console.log('— 単語帳: the deck as data');
  const deck = verifyDeck();
  const m1 = deck.modules[0];

  console.log('\n— 単語帳: the room, in a real browser');
  const { server, base } = await startServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(`try {
    if (!localStorage.getItem('__deck_seeded')) {
      localStorage.setItem('kairo-corridor-v1', ${JSON.stringify(JSON.stringify({ v: 1, taken: [], srs: {} }))});
      localStorage.setItem('__deck_seeded', '1');
    }
  } catch {}`);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  const store = () => page.evaluate(`JSON.parse(localStorage.getItem('kairo-corridor-v1'))`);

  try {
    await page.goto(`${base}/index.html?entry=shelf`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
    await page.waitForSelector('#decks-link', { timeout: 8000 });
    await page.click('#decks-link');
    await page.waitForSelector(`[data-deck-module="${m1.id}"]`, { timeout: 15000 });
    const listed = await page.evaluate(`document.querySelectorAll('[data-deck-module]').length`);
    check('the shelf door opens the deck and lists every module', listed === deck.modules.length, `${listed}/${deck.modules.length}`);

    await page.click(`[data-deck-module="${m1.id}"]`);
    await page.waitForSelector('#deck-enroll-all', { timeout: 8000 });
    const before = await store();
    const words = await page.evaluate(`document.querySelectorAll('[data-deck-enroll]').length`);
    check('a module lists every word, and opening it enrolls nothing', words === m1.cards.length && before.taken.length === 0, `${words} words · ${before.taken.length} taken`);
    const readDoor = await page.evaluate(`!!document.getElementById('deck-read')`);
    check('the module’s passage is one tap away', readDoor);

    await page.click('#deck-enroll-all');
    await page.waitForFunction(`document.querySelectorAll('[data-deck-enroll]:disabled').length === ${m1.cards.length}`, null, { timeout: 8000 });
    const after = await store();
    const rows = after.taken.filter((t) => m1.cards.some((c) => c.w === t.id));
    const withCtx = rows.filter((t) => t.t !== 'word' || (t.ctx?.p === m1.article && t.ctx.scope === 'sent' && Number.isInteger(t.ctx.i)));
    const listName = Object.keys(after.lists || {}).find((n) => n.includes(m1.title.ja.split(' — ')[0]));
    check('ぜんぶ覚える enrolls every word as a started row with its mined sentence as context',
      rows.length === m1.cards.length && rows.every((t) => Number.isFinite(t.started)) && withCtx.length === rows.length,
      `${rows.length} rows · ${withCtx.length} with ctx`);
    check('the module becomes a named list (the filtered-review scope)', !!listName && after.lists[listName].length === m1.cards.length, listName || 'no list');

    await page.waitForSelector('#deck-review', { timeout: 8000 });
    await page.click('#deck-review');
    await page.waitForSelector('.review-face', { timeout: 15000 });
    await page.waitForFunction(`!!document.querySelector('.review-cloze')`, null, { timeout: 15000 });
    const face = await page.evaluate(`(() => {
      const c = document.querySelector('.review-cloze');
      return { text: c ? c.textContent : '', blank: c ? c.textContent.includes('＿＿＿') : false };
    })()`);
    check('この鉱脈だけ復習 asks the word blanked inside its mined sentence', face.blank && face.text.length > 10, face.text.slice(0, 40));

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
    const reloaded = await page.evaluate(`(() => {
      const s = JSON.parse(localStorage.getItem('kairo-corridor-v1'));
      const alert = document.getElementById('store-alert');
      return { taken: s.taken.length, quarantined: !!(alert && !alert.hidden && alert.textContent) };
    })()`);
    check('the enrolled rows survive a reload with no quarantine', reloaded.taken === m1.cards.length && !reloaded.quarantined, JSON.stringify(reloaded));
    check('no console errors in the room', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks green');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
