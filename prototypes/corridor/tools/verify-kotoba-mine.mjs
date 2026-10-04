/**
 * 言葉の鉱脈 deck + 覚える one-tap save verifier. Done = this is green.
 *
 * Half one reads the shipped deck as DATA: 323 words, each with one or more
 * sentences (mostly mined from real Japanese, each naming its source), every
 * card's ruby spells its sentence with exactly one marked word, and the
 * marked word carries a kana reading.
 *
 * Half two drives the corridor in real Chromium:
 *   · 集中道場 › デッキ lists the deck; opening it shows the deck home;
 *   · a card shows the sentence with the word marked, reveals readings,
 *     meaning and source, and a grade lands in
 *     the deck's own ledger (bunki-cloze:kotoba-mine), never the word queue;
 *   · the ledger survives a reload; the 4-choice mode answers in one tap;
 *   · 覚える is one tap (the reader's save path): the word is written at once,
 *     the list drawer opens with it, and a list named there receives the word
 *     through the same guarded commit.
 *
 * Usage: node verify-kotoba-mine.mjs   (rebuild the deck: python3 decks/kotoba-mine/tools/build.py)
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright-core';
import { resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';

// The battery's law: verify the built artifact, not the source tree.
const CORRIDOR_DIR = resolveCorridorSite();
const DECK_PATH = resolve(CORRIDOR_DIR, 'decks/kotoba-mcd/deck.json');
const SENTENCE_DECK_PATH = resolve(CORRIDOR_DIR, 'decks/kotoba-mine/deck.json');

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
  check('the deck is a bunki-cloze-deck v1 with 12 topics', deck.format === 'bunki-cloze-deck' && deck.version === 1 && deck.groups.length === 12);
  const cards = deck.words.flatMap((w) => w.cards.map((c) => ({ ...c, word: w })));
  check('323 words, each with one or more sentences, best first', deck.words.length === 323 && deck.words.every((w) => w.cards.length && w.cards.map((c) => c.lv).join() === w.cards.map((_, i) => i + 1).join()), `${deck.words.length} words · ${cards.length} cards`);
  const passages = new Map(cards.map((c) => [`${c.word.id}:${c.ja}`, c]));
  const real = [...passages.values()].filter((c) => c.kind !== 'original');
  check('every passage names its source; real mined passages and passages written for the deck', cards.every((c) => c.kind && c.src && (c.src.url || c.src.site)) && real.length / passages.size >= 0.4, `${passages.size} passages · ${real.length} mined · ${passages.size - real.length} written`);
  const mcd = cards.filter((c) => c.type);
  check('MCD: one gap per card — 語 cards blank the word, 字 cards one kanji with its reading as the hint', mcd.length === cards.length && mcd.every((c) => c.type === 'word' || (c.type === 'kanji' && c.hint)) && !!deck.method?.length, `${cards.filter((c) => c.type === 'word').length} 語 · ${cards.filter((c) => c.type === 'kanji').length} 字`);
  const bad = [];
  for (const c of cards) {
    const target = c.ruby.filter((seg) => seg[2] === 1);
    if (c.ruby.map((seg) => seg[0]).join('') !== c.ja) bad.push(`${c.id}: ruby ≠ sentence`);
    if (target.length !== 1 || (c.type !== 'kanji' && target[0][0] !== c.form)) bad.push(`${c.id}: target`);
    else if (!/^[ぁ-ゖー]+$/.test(target[0][1])) bad.push(`${c.id}: reading ${target[0][1]}`);
    if (!c.en) bad.push(`${c.id}: no English`);
  }
  check('every card spells its sentence, asks exactly one word, and gives it a kana reading', bad.length === 0, bad.slice(0, 4).join(' | ') || `${cards.length}/${cards.length}`);
  return deck;
}

/* --------------------------------------------------- half two: the app */
async function main() {
  console.log('— 言葉の鉱脈: the deck as data');
  const deck = verifyDeck();
  const sentences = readJson(SENTENCE_DECK_PATH);
  const sc = sentences.words.flatMap((w) => w.cards);
  check('言葉の鉱脈・文 sits beside it: 323 words of real single sentences, each with its source', sentences.id === 'kotoba-mine' && sentences.words.length === 323 && sc.every((c) => !c.type && c.src && c.ruby.filter((g) => g[2] === 1).length === 1), `${sc.length} sentence cards`);
  check('the two decks open in different colour themes', deck.defaults?.look && sentences.defaults?.look && deck.defaults.look !== sentences.defaults.look, `${deck.defaults?.look} · ${sentences.defaults?.look}`);

  console.log('\n— 集中道場 › デッキ, in a real browser');
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
  const ls = (key) => page.evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}) || 'null')`);
  const boot = async (q = '?entry=shelf') => {
    await page.goto(`${base}/index.html${q}`, { waitUntil: 'load' });
    if (q) await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
  };

  try {
    await boot('');
    await page.waitForSelector('#ginga-symbol', { timeout: 20000 });
    await page.click('#ginga-symbol');
    await page.waitForSelector('.nav-dojo');
    await page.click('.nav-dojo');
    await page.waitForSelector('[data-deck="kotoba-mine"]', { timeout: 8000 });
    const rows = await page.evaluate(`[...document.querySelectorAll('.dojo-deck')].map((b) => b.dataset.deck)`);
    check('集中道場 opens with the deck list: 私の文脈, then 言葉の鉱脈・MCD and ・文 side by side, 文脈札, and the saved-word queue', rows[0] === 'personal' && rows[1] === 'kotoba-mcd' && rows[2] === 'kotoba-mine' && rows.includes('context') && rows.includes('mine'), rows.join(', '));

    await page.click('[data-deck="kotoba-mcd"]');
    await page.waitForSelector('#kp-start', { timeout: 15000 });
    check('the deck home explains the method (このデッキのしくみ)', (await page.locator('#kp-method').count()) === 1);
    const home = await page.evaluate(`({ start: document.getElementById('kp-start').textContent, groups: document.querySelectorAll('.kp-group').length })`);
    check('the deck home shows today’s count and the 12 topics', /15/.test(home.start) && home.groups === 12, JSON.stringify(home));

    await page.click('#kp-start');
    await page.waitForSelector('#kp-card .kp-blank');
    check('a card is a passage with one gap and a Japanese hint — no readings, no English', (await page.locator('#kp-card .kp-blank').count()) === 1 && (await page.locator('#kp-card rt').count()) === 0 && (await page.locator('#kp-card .kp-endetails').count()) === 0);
    await page.click('#kp-reveal');
    await page.waitForSelector('#kp-grade-good');
    const back = await page.evaluate(`({ rt: document.querySelectorAll('#kp-card rt').length, target: !!document.querySelector('#kp-card .kp-target'), term: document.querySelector('.kp-term')?.textContent, src: !!document.querySelector('#kp-card .kp-src') })`);
    check('the answer puts readings over the kanji, gives the meaning, and names the source', back.rt > 0 && back.target && !!back.term && back.src, JSON.stringify(back));
    const takenBefore = (await readAppRecord(page)).taken.length;
    await page.click('#kp-grade-good');
    const ledger = await ls('bunki-cloze:kotoba-mcd');
    const after = await readAppRecord(page);
    check('a grade lands in the deck’s own ledger and never in the word queue', Object.keys(ledger?.cards || {}).length === 1 && after.taken.length === takenBefore && (after.revlog || []).length === 0, `${Object.keys(ledger?.cards || {}).length} card · ${after.taken.length} taken`);

    await boot('?deck=mcd');
    await page.waitForSelector('#kp-start', { timeout: 15000 });
    const kept = await ls('bunki-cloze:kotoba-mcd');
    check('?deck=mcd opens the MCD deck directly and the ledger survived the reload', Object.keys(kept?.cards || {}).length === 1);
    await page.click('#kp-to-settings');
    await page.click('[data-pref="mode:choice"]');
    await page.click('.kp-icon');
    await page.click('#kp-start');
    await page.waitForSelector('.kp-choice');
    const choices = await page.locator('.kp-choice').count();
    await page.click('.kp-choice');
    await page.waitForSelector('.kp-verdict');
    check('4-choice mode: four words, one tap answers and grades', choices === 4 && (await ls('bunki-cloze:kotoba-mcd')).log.length === 2);
    await boot('?deck=kotoba');
    await page.waitForSelector('#kp-start', { timeout: 15000 });
    await page.click('#kp-start');
    await page.waitForSelector('#kp-card .kp-target');
    const sent = await page.evaluate(`({ look: document.querySelector('.kp')?.dataset.look, blank: document.querySelectorAll('#kp-card .kp-blank').length })`);
    check('?deck=kotoba opens 言葉の鉱脈・文: a real sentence with the word marked, in its own theme', sent.blank === 0 && sent.look === 'dark', JSON.stringify(sent));

    // 覚える is one tap (round-1 save path): the row is written through the
    // guarded commit at once, and the list drawer opens under the finger so
    // where the word went is right there.
    await boot();
    await page.fill('#search', '金利');
    await page.waitForSelector('[data-result^="word:金利"]', { timeout: 15000 });
    await page.click('[data-result^="word:金利"]');
    await page.waitForSelector('#sheet #take');
    await page.click('#sheet #take');
    await waitForAppRecord(page, (record) => record.taken.some((t) => t.id === '金利'),
      { description: 'one-tap sheet save' });
    await page.waitForSelector('#sheet .list-picker .fold-head.open');
    const saved = await waitForAppRecord(page, (record) => record.taken.some((t) => t.id === '金利'),
      { description: 'saved word record' });
    check('one tap on 覚える saves the word and opens its lists, nothing more written yet',
      saved.taken.length === 1 && Object.keys(saved.lists || {}).length === 0,
      `${saved.taken.length} rows · lists ${Object.keys(saved.lists || {}).length}`);
    // a list named in the drawer receives the word through the same guarded commit
    await page.click('#sheet #new-list');
    await page.fill('#sheet [id^="list-picker-name:"]', '経済ニュース');
    await page.click('#sheet .list-maker-make');
    const listed = await waitForAppRecord(page, (record) =>
      (record.lists?.['経済ニュース'] || []).some((x) => x.id === '金利'), { description: 'new list membership' });
    check('the new list receives the word, still one card', listed.taken.length === 1 &&
      listed.taken.filter((t) => t.id === '金利').length === 1, JSON.stringify(Object.keys(listed.lists || {})));
    const where = await page.evaluate(`document.querySelector('#sheet .list-picker .fold-sub')?.textContent || ''`);
    check('the sheet then says where the word went', where.includes('経済ニュース'), where);
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
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
