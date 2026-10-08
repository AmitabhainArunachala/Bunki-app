/**
 * 言葉の鉱脈 deck + 覚える one-tap save verifier. Done = this is green.
 *
 * Half one reads the shipped deck as DATA: 323 words, each with one or more
 * passages (written for the deck to contract v2 first, then mined from real
 * Japanese or written earlier, each naming its source), every card's ruby
 * spells its passage with exactly one marked word, and the marked word carries
 * a kana reading.
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
 * Then the grade path: when storage refuses a write the card stays and the
 * ledger is untouched; a learning step that comes due while a card is open
 * waits until that card is answered, then comes next (fake clock).
 *
 * No card shows its own answer: a repeat of the word is blanked with it, and a
 * 字 card whose kanji is printed elsewhere in the passage is not built.
 *
 * Readings the tokeniser gets wrong (日本人 にん, 他の た, 一日 ついたち …) read as
 * tools/kotoba-deck-ruby.fixtures.json says, corrected by source/readings.json.
 *
 * Every card id in both decks is the one source/ids.json gives its key
 * (word, passage text, card kind), so reordering passages never moves an id.
 *
 * Then 復元: a pasted `{}` changes nothing and says why; an older, smaller
 * backup needs a second tap that names both counts, and the ledger it
 * replaces is kept under bunki-cloze:kotoba-mcd:before-restore. A stored
 * ledger the player cannot read is set aside before anything is saved.
 *
 * Then answering: the grade bar shows もう一度・難しい・正解・簡単 (Again · Hard · Good ·
 * Easy, CARD_CONTRACT_V2 §4 as amended 2026-10-09) whatever setting is stored; each key 1–4
 * grades its own FSRS rating and schedules the interval its pad showed; a ledger written by the
 * two-button player loads unchanged and takes a Hard; a cancelled or mostly vertical swipe
 * never grades; 4択 never asks a 字 card; 設定 has labelled controls and radio
 * groups (axe); the done screen keeps ↶ ひとつ戻す; every colour token in the
 * light themes clears 4.5:1.
 *
 * Then the back hierarchy (docs/srs/CARD_CONTRACT_V2.md §2–§4), both decks:
 *   a) the front has no readings, no English and nothing to tap in the passage;
 *   b) tier one under the passage: the word with reading and part of speech (no
 *      pitch: the decks have none), a reading over every kanji, the Japanese
 *      definition, no English;
 *   c) tier two as folds in a fixed order: 英語 (closed unless 設定 says always),
 *      英訳 of the target sentence only, 漢字の形と意味 (open on 字 cards), 類語
 *      (only with entries, only in review state), the word's other passages
 *      (titles only), then the source line;
 *   d) passage cards zoom: 全文／焦点 in the card header, remembered per deck;
 *      焦点 dims the other sentences (never removes them); a new card opens 全文,
 *      a card seen before 焦点; sentence cards have no zoom;
 *   e) the grade bar is fixed to the bottom of a phone screen (a 195-character
 *      passage never hides it) and carries the rule 「答えを見て理解が深まったなら
 *      もう一度」 once, dismissible, remembered in prefs.
 *
 * Then the visual system (CARD_CONTRACT_V2 §9, brief-2026-10-04/aesthetics.md):
 *   a) no 見て覚えるコツ panel, no topic hue, no level 1–3 edge, no amber tip bar; the method
 *      text lives in 設定;
 *   b) one hue axis per surface: the target in its part-of-speech colour, the card edge and
 *      the first chip by item kind (語／字), state chips and grades red/green/amber only,
 *      English in ink-2, a monochrome level chip (N1/N2/N3) only when the word has a level;
 *   c) every (text, surface) pair of every theme clears its floor (tools/contrast-kotoba.mjs);
 *   d) textures on the page, never on the card under the ruby;
 *   e) the reveal keeps the card node and fades the answer in (opacity/transform, ≤ 180 ms);
 *      a grade slides the old card out in its direction and the rail ticks on the compositor;
 *      with prefers-reduced-motion nothing moves or fades, and a swipe does not drag the card.
 *
 * Then the review loop (CARD_CONTRACT_V2 §3.7, §4), both decks where it applies:
 *   a) 削除 in the study top bar is one tap: the card leaves the sitting and every later queue, its FSRS
 *      record and id untouched (ledger: suspended, repairLog); the toast's 元に戻す brings it
 *      back; 設定 › 保留中のカード counts it and 復元 returns it to the queue;
 *   b) a card that has lapsed LEECH_LAPSES (5) times shows the repair ladder on its back after tier one, in
 *      order 別の文に替える → ヒントを付ける → 保留, each one tap and logged: the swap suspends the
 *      card and puts the word's next unseen passage on screen (due at once, after a reload too);
 *      the hint is stored in the ledger and shown on this card's front only, marked repaired
 *      (the front pin tolerates exactly that); 保留 suspends; a 字 card has nothing to swap to;
 *   c) 漢字の形と意味 lists the learner's own words (a card in the ledger) sharing a kanji (同) or
 *      a reading of one (読), never a word not met yet; each opens 語の一覧, whose ← returns to
 *      the card; the Anki back lists the same family over the words before it in deck order;
 *   d) a 参照・文法 line after the kanji fold only when the deck names one (none does yet).
 *
 * Then the Phase 1 follow-ups (STANDARD A37–A41):
 *   1. long passages: after the reveal the target sentence, the word and its definition sit above
 *      the pinned bar at the resting scroll position (km-298-m02, 焦点 and 全文); 焦点 folds the
 *      sentences around the target to two dimmed lines each with a ⋯ that opens them, in a
 *      gutter of its own (no visible glyph under the ⋯, folded or opened: km-109-m05, km-298-m02);
 *   2. kotoba-mcd opens in 読んで思い出す (the target marked, no blank, no hint); 穴埋め blanks it
 *      with no hint; 読んで思い出す leaves 字 cards out of the queue without suspending them, and
 *      穴埋め brings them back;
 *   3. 設定 has no 記録を消す (whole-deck reset is not offered);
 *   4. 出典 is the last fold: author, site (a link when there is one), licence, passage number;
 *   5. at the resting position no fold row is cut by the pinned bar, and the last fold scrolls
 *      clear of it; on the standalone study pages the study top bar stays on screen;
 *   6. 「タップして答えを見る」 and the swipe hint show for three sittings, then retire
 *      (prefs.sittings);
 *   7. the sentence deck says 「この語の他の文」; Anki says 形容動詞 and folds 出典; the 字 hue is
 *      at least ΔE_ok 10 from every other hue of its theme.
 *
 * Then the passage pilot (STANDARD A46, CARD_CONTRACT_V2 §2, §3, §6, §7): every card written to
 * contract v2 (it carries a register) is 4–5 sentences of 180–300 characters with the target once,
 * written for the deck, with a register code, a topic, a Japanese usage note (tipJa) and the
 * target sentence's English; a word's v2 passages differ in register; the MCD tokens file carries
 * Japanese senses for words that are not the deck's own (source/gloss_ja.json). In the browser a
 * pilot card's front shows its 4–5 sentences with the target marked once; its back puts tipJa in
 * tier one and the register and topic as small chips in the chip row; and a tapped word that is
 * not the deck's own shows a Japanese sense from that table in the entry sheet.
 *
 * Then the full passage run (STANDARD A49, A50): 323 words, 2435 cards (1897 語, 538 字) over 1897
 * passages, 954 of them contract v2 (54 pilot, 900 full run) and 454 mined; every word opens on a
 * contract-v2 passage and its v2 passages run unbroken from passage 1; every 字 card points at its
 * origin passage (the word's first older passage, the one its id was minted on) and no v2 passage
 * has one; a usage note, where a v2 passage has one, is one Japanese line. In the browser a
 * full-run card (論, 話) shows its 4–5 sentences, and its back puts tipJa in tier one.
 *
 * Usage: node verify-kotoba-mine.mjs   (rebuild the deck: python3 decks/kotoba-mine/tools/build.py)
 */

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright-core';
import { resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';

import { contrastTable, KIND_JI_FLOOR, kindJiTable } from './contrast-kotoba.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
// The battery's law: verify the built artifact, not the source tree. Deck sources, the release
// folder and the build tools live in the repository, outside the built site.
const CORRIDOR_DIR = resolveCorridorSite();
const SOURCE_CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const REPO_DIR = resolve(TOOL_DIR, '../../..');
const DATA_DIR = resolve(CORRIDOR_DIR, 'data');
const DECK_PATH = resolve(CORRIDOR_DIR, 'decks/kotoba-mcd/deck.json');
const SENTENCE_DECK_PATH = resolve(CORRIDOR_DIR, 'decks/kotoba-mine/deck.json');
const IDS_PATH = resolve(REPO_DIR, 'decks/kotoba-mine/source/ids.json');
const PILOT_PATH = resolve(REPO_DIR, 'decks/kotoba-mine/source/mcd/pilot-2026-10-04.json');
const RUBY_FIXTURES_PATH = resolve(REPO_DIR, 'tools/kotoba-deck-ruby.fixtures.json');

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
  check('every passage names its source; real mined passages and passages written for the deck', cards.every((c) => c.kind && c.src && (c.src.url || c.src.site)) && real.length > 0 && real.length < passages.size, `${passages.size} passages · ${real.length} mined · ${passages.size - real.length} written`);
  const mcd = cards.filter((c) => c.type);
  check('MCD: one word asked per card — 語 cards blank the word (and any repeat of it), 字 cards one kanji with its reading as the hint', mcd.length === cards.length && mcd.every((c) => c.type === 'word' || (c.type === 'kanji' && c.hint)) && !!deck.method?.length, `${cards.filter((c) => c.type === 'word').length} 語 · ${cards.filter((c) => c.type === 'kanji').length} 字`);
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

/* ------------------------------------------- card identity (F26, A25) */
/** the manifest key build.py gives a card: word, passage text and card kind, never position */
function cardKey(wid, card) {
  const h = createHash('sha1').update(card.ja, 'utf8').digest('hex').slice(0, 12);
  if (card.type === 'word') return `${wid}|word|${h}`;
  if (card.type === 'kanji') return `${wid}|kanji|${h}|${card.ruby.filter((seg) => seg.length > 2).findIndex((seg) => seg[2] === 1)}`;
  return `${wid}|sentence|${h}`;
}

function verifyIds(decks) {
  const manifest = readJson(IDS_PATH);
  for (const deck of decks) {
    const ids = manifest[deck.id] ?? {};
    const bad = deck.words.flatMap((w) => w.cards.filter((c) => ids[cardKey(w.id, c)] !== c.id).map((c) => `${c.id} ${cardKey(w.id, c)}`));
    const n = deck.words.reduce((sum, w) => sum + w.cards.length, 0);
    check(`${deck.id}: every card id is the one ids.json gives its key (word, passage, kind), not its position`, bad.length === 0 && Object.keys(ids).length === n, bad.slice(0, 3).join(' | ') || `${n}/${n} · ${(manifest.reserved?.[deck.id] ?? []).length} reserved`);
  }
}

/* ------------------------------------------ no card shows its answer (F15, F18) */
function verifyLeaks(decks) {
  const plain = (card, ...hidden) =>
    card.ruby
      .filter((seg) => !(seg.length > 2 && hidden.includes(seg[2])))
      .map((seg) => seg[0])
      .join('');
  const cards = decks.flatMap((deck) => deck.words.flatMap((w) => w.cards.map((c) => ({ c, w }))));
  const wordLeaks = cards.filter(({ c, w }) => c.type !== 'kanji' && (plain(c, 1, 3).includes(c.form) || plain(c, 1, 3).includes(w.term))).map(({ c }) => c.id);
  const kanjiLeaks = cards.filter(({ c }) => c.type === 'kanji' && plain(c, 1).includes(c.ruby.find((seg) => seg[2] === 1)[0])).map(({ c }) => c.id);
  const repeats = cards.filter(({ c }) => c.ruby.some((seg) => seg[2] === 3)).length;
  check('no 語 or 文 card prints its word outside the blanks (a repeat of the word is blanked too)', wordLeaks.length === 0, wordLeaks.slice(0, 4).join(' | ') || `0 · ${repeats} cards blank a repeat`);
  check('no 字 card prints its blanked kanji elsewhere in the passage', kanjiLeaks.length === 0, kanjiLeaks.slice(0, 4).join(' | ') || `0 of ${cards.filter(({ c }) => c.type === 'kanji').length}`);
}

/* ------------------------------------------- readings the tokeniser got wrong (F17) */
function verifyRuby(decks) {
  const byId = new Map(decks.flatMap((deck) => deck.words.flatMap((w) => w.cards.map((c) => [c.id, c]))));
  const { pairs } = readJson(RUBY_FIXTURES_PATH);
  const bad = [];
  for (const { card: id, surface, after = '', before = '', right, wrong } of pairs) {
    const card = byId.get(id);
    const found = [];
    let text = '';
    card?.ruby.forEach((seg, i) => {
      const rest = card.ruby.slice(i + 1).map((x) => x[0]).join('');
      if (seg[0] === surface && text.endsWith(after) && rest.startsWith(before)) found.push(seg[1]);
      text += seg[0];
    });
    if (!found.length || found.some((r) => r !== right)) bad.push(`${id}: ${after}${surface}=${found.join('/') || '(none)'}${found.includes(wrong) ? ` (${wrong})` : ''}`);
  }
  check('corrected readings stay corrected: 日本人 じん, 他の ほか, 一日 いちにち, 一般の方 かた, 土曜日 び, 寛仁 ともひと …', bad.length === 0, bad.slice(0, 4).join(' | ') || `${pairs.length}/${pairs.length} pairs (tools/kotoba-deck-ruby.fixtures.json)`);
}

/* ------------------------------------- the grade path (F01, F07, N02) */
const SEEDED = `try {
  if (!localStorage.getItem('__deck_seeded')) {
    localStorage.setItem('kairo-corridor-v1', ${JSON.stringify(JSON.stringify({ v: 1, taken: [], srs: {} }))});
    localStorage.setItem('__deck_seeded', '1');
  }
} catch {}`;
/** the card's sentence as written, without the readings of the back (and the ⋯ of a 焦点 group) */
const SENTENCE = `(() => { const p = document.querySelector('#kp-card .kp-sentence')?.cloneNode(true); p?.querySelectorAll('rt, .kp-more').forEach((r) => r.remove()); return p?.textContent ?? null; })()`;

async function verifyGradePath(browser, base) {
  const open = async (clock) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(SEEDED);
    const page = await context.newPage();
    if (clock) await page.clock.install({ time: new Date('2026-10-04T09:00:00') });
    await page.goto(`${base}/index.html?deck=kotoba`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
    await page.waitForSelector('#kp-start', { timeout: 15000 });
    return { context, page };
  };
  const LEDGER = 'bunki-cloze:kotoba-mine';

  // storage refuses the write: the card stays, the ledger is untouched, the learner is told
  {
    const { context, page } = await open(false);
    try {
      await page.click('#kp-start');
      await page.click('#kp-reveal');
      await page.waitForSelector('#kp-grade-good');
      const before = await page.evaluate(`({ ledger: localStorage.getItem(${JSON.stringify(LEDGER)}), count: document.querySelector('.kp-count').textContent })`);
      await page.evaluate(`Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }`);
      await page.click('#kp-grade-good');
      const after = await page.evaluate(`({ ledger: localStorage.getItem(${JSON.stringify(LEDGER)}), count: document.querySelector('.kp-count')?.textContent, card: !!document.querySelector('#kp-card'), grades: !!document.querySelector('#kp-grade-good'), backup: !!document.querySelector('#kp-to-backup'), text: document.querySelector('.kp').innerText })`);
      check(
        'when storage refuses the write, the card stays (1/N), the ledger is unchanged and the page says 保存できませんでした',
        /^1\//.test(after.count || '') && after.count === before.count && after.card && after.grades && after.backup && after.ledger === before.ledger && after.text.includes('Could not save.'),
        JSON.stringify({ count: after.count, card: after.card, grades: after.grades, backup: after.backup, ledgerUnchanged: after.ledger === before.ledger }),
      );
    } finally {
      await context.close();
    }
  }

  // a learning step that comes due mid-card waits until that card is answered
  {
    const { context, page } = await open(true);
    try {
      await page.click('#kp-start');
      await page.waitForSelector('#kp-card');
      const a = await page.evaluate(SENTENCE);
      await page.click('#kp-reveal');
      await page.click('#kp-grade-good'); // card A: next step in 10 minutes
      const due = await page.evaluate(`(() => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(LEDGER)})); const c = Object.values(s.cards)[0]; return (new Date(c.due) - Date.now()) / 60000; })()`);
      // a new sitting: A is not due yet, so it is not in the queue
      await page.click('#kp-quit');
      await page.click('#kp-start');
      await page.waitForSelector('#kp-card');
      const b = await page.evaluate(SENTENCE);
      await page.clock.fastForward('11:00');
      // the reveal repaints the screen after A came due: the card on screen is still B
      await page.click('#kp-reveal');
      await page.waitForSelector('#kp-grade-good');
      const stillB = await page.evaluate(SENTENCE);
      check(
        'a learning card that comes due while another card is open does not replace it',
        a !== b && stillB === b && due > 9 && due <= 10.1,
        JSON.stringify({ dueInMinutes: Math.round(due * 10) / 10, same: stillB === b }),
      );
      await page.click('#kp-grade-good');
      await page.waitForSelector('#kp-card');
      const shown = await page.evaluate(SENTENCE);
      check('…and it is the very next card once that one is answered', shown === a, shown?.slice(0, 24) ?? 'no card');
    } finally {
      await context.close();
    }
  }
}

/* ---------------------------------------------- restore (F02, A21) */
async function verifyRestore(browser, base) {
  const LEDGER = 'bunki-cloze:kotoba-mcd';
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(SEEDED);
  const page = await context.newPage();
  const raw = (key) => page.evaluate(`localStorage.getItem(${JSON.stringify(key)})`);
  const bootMcd = async () => {
    await page.goto(`${base}/index.html?deck=mcd`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
    await page.waitForSelector('#kp-start', { timeout: 15000 });
  };
  const gradeOne = async () => {
    await page.click('#kp-start');
    await page.click('#kp-reveal');
    await page.click('#kp-grade-good');
    await page.click('#kp-quit');
  };
  const restore = async (text) => {
    await page.fill('#kp-backup', text);
    await page.click('#kp-restore');
    return page.evaluate(`({ msg: document.getElementById('kp-backup-msg').textContent, button: document.getElementById('kp-restore').textContent })`);
  };
  try {
    await bootMcd();
    await gradeOne();
    const older = await raw(LEDGER);
    await gradeOne();
    const current = await raw(LEDGER);
    await page.click('#kp-to-settings');

    const empty = await restore('{}');
    check(
      '復元 with {} leaves the ledger bytes as they were and says no card records are in it',
      (await raw(LEDGER)) === current && empty.msg.includes('This backup has no card records.') && !empty.msg.includes('Restored') && empty.button === 'Restore',
      empty.msg,
    );

    const first = await restore(older);
    const untouched = (await raw(LEDGER)) === current;
    await page.click('#kp-restore');
    const done = await page.evaluate(`document.getElementById('kp-backup-msg').textContent`);
    const now = JSON.parse(await raw(LEDGER));
    check(
      'an older backup with fewer cards: the first tap shows both counts and asks again (置き換える); the second replaces and keeps the old ledger aside',
      first.msg.includes('Backup: 1 cards · 1 answers') && first.msg.includes('Current record: 2 cards · 2 answers') && first.msg.includes('fewer records') && first.button === 'Replace' && untouched && Object.keys(now.cards).length === 1 && now.log.length === 1 && (await raw(`${LEDGER}:before-restore`)) === current && done.includes('Restored'),
      JSON.stringify({ first: first.msg, button: first.button, untouched, done }),
    );

    // a stored ledger whose card records cannot be read is set aside before anything is saved
    const broken = JSON.stringify({ format: 'bunki-cloze-state', version: 1, deckId: 'kotoba-mcd', cards: { x: { due: 'not-a-date' } }, log: [] });
    await page.evaluate(`localStorage.setItem(${JSON.stringify(LEDGER)}, ${JSON.stringify(broken)})`);
    await bootMcd();
    const home = await page.evaluate(`document.querySelector('.kp-notice')?.textContent || ''`);
    check('an unreadable stored ledger is copied to bunki-cloze:kotoba-mcd:quarantine and the deck home says so', (await raw(`${LEDGER}:quarantine`)) === broken && home.includes('kept separately'), home);
  } finally {
    await context.close();
  }
}

/* -------------- delivery (F10, F34–F38, F40, F42, N05, N12; A04, A05) */
/** a stored MCD ledger with one 字 card due, so the first card of a sitting is that 字 card */
const DUE_KANJI = `(() => {
  const id = 'km-064-m02';
  localStorage.setItem('bunki-cloze:kotoba-mcd', JSON.stringify({ format: 'bunki-cloze-state', version: 1, deckId: 'kotoba-mcd', groupsOff: [], log: [],
    cards: { [id]: { due: '2020-01-01T00:00:00.000Z', stability: 1, difficulty: 5, state: 2, reps: 1, lapses: 0, elapsed_days: 1, scheduled_days: 1 } } }));
  localStorage.setItem('bunki-cloze:prefs:v3:kotoba-mcd', JSON.stringify({ mode: 'choice', newPerDay: 0 }));
})()`;
/** WCAG relative-luminance contrast of every colour token on the surfaces it sits on, per light theme */
const CONTRAST = `(() => {
  const root = document.querySelector('.kp');
  const probe = document.createElement('i');
  root.append(probe);
  const rgba = (v) => { probe.style.color = ''; probe.style.color = v; return getComputedStyle(probe).color.match(/[\\d.]+/g).map(Number); };
  const rgb = (v) => rgba(v).slice(0, 3);
  const lum = (c) => { const [r, g, b] = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v * t + b[i] * (1 - t)));
  const tokens = ['ink', 'ink-2', 'mute', 'cyan', 'red', 'amber', 'green', 'blue', 'violet', 'noun', 'verb', 'adj', 'adv', 'expr', 'sound', 'kind-go', 'kind-ji', 'kind-bun'];
  const out = {};
  const before = root.dataset.look;
  for (const look of ['light', 'sakura', 'washi']) {
    root.dataset.look = look;
    const t = Object.fromEntries([...tokens, 'bg', 'panel', 'panel-2'].map((k) => [k, rgb('var(--kp-' + k + ')')]));
    const wash = rgba('var(--kp-cyan-wash)');
    // the card panel, the second panel (tiles, kanji boxes; also the darkest texture tint), the page,
    // the tinted 正解 (Good) pad (12% green over the panel) and the accent wash (答えを見る, chosen settings)
    const surfaces = { panel: t.panel, 'panel-2': t['panel-2'], page: t.bg, 'good-button': mix(t.green, t.panel, 0.12), 'accent-wash': mix(wash.slice(0, 3), t.bg, wash[3] ?? 1) };
    let min = { ratio: 99 };
    for (const k of tokens) for (const [s, bg] of Object.entries(surfaces)) {
      const r = ratio(t[k], bg);
      if (r < min.ratio) min = { ratio: Math.round(r * 100) / 100, pair: k + ' on ' + s };
    }
    out[look] = min;
  }
  root.dataset.look = before;
  probe.remove();
  return out;
})()`;

/** a grade pad's wait as fmtWait prints it: a number and a unit, the unit singular exactly when the
 * number is 1 ("1 day", "2 days", "1 year", "1.5 years"; never "1 days" or "1.0 years") */
const WAIT = /^([\d.]+) (min|hr|days?|months?|years?)$/;
const waitOk = (w) => {
  const m = WAIT.exec(w || '');
  if (!m || /\.0$/.test(m[1])) return false;
  return m[2] === 'min' || m[2] === 'hr' || (Number(m[1]) === 1) === !m[2].endsWith('s');
};

async function verifyDelivery(browser, base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(SEEDED);
  const page = await context.newPage();
  const boot = async (q) => {
    await page.goto(`${base}/index.html${q}`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
    await page.waitForSelector('#kp-start', { timeout: 15000 });
  };
  const count = () => page.evaluate(`document.querySelector('.kp-count')?.textContent ?? null`);
  const logLength = (deck) => page.evaluate(`(JSON.parse(localStorage.getItem('bunki-cloze:${deck}') || 'null')?.log ?? []).length`);
  try {
    // four grade pads in order, Again · Hard · Good · Easy, whatever button setting is stored (D1, the
    // learner's 2026-10-08 decision; CARD_CONTRACT_V2 §4 as amended 2026-10-09, STANDARD A53)
    await boot('?deck=kotoba');
    await page.evaluate(`localStorage.setItem('bunki-cloze:prefs:v3:kotoba-mine', JSON.stringify({ grades: 'two' }))`);
    await boot('?deck=kotoba');
    await page.click('#kp-start');
    await page.waitForSelector('#kp-card .kp-target');
    await page.click('#kp-reveal');
    await page.waitForSelector('.kp-grade');
    const four = await page.evaluate(`({ n: document.querySelectorAll('.kp-grade').length, ids: [...document.querySelectorAll('.kp-grades .kp-grade')].map((b) => b.id).join(), labels: [...document.querySelectorAll('.kp-grade b')].map((b) => b.textContent).join('/'), keys: [...document.querySelectorAll('.kp-grade')].map((b) => b.getAttribute('aria-keyshortcuts')).join(), waits: [...document.querySelectorAll('.kp-grade small')].map((s) => s.textContent).join('/'), hint: document.querySelector('.kp-swipehint')?.textContent, position: getComputedStyle(document.querySelector('.kp-grades')).position })`);
    const untouched = (await count()) === '1/15' && (await logLength('kotoba-mine')) === 0;
    check('the grade bar shows Again · Hard · Good · Easy in that order (ids again, hard, good, easy; keys 1–4), each with an interval, whatever button setting is stored, and stays on screen (fixed)', four.n === 4 && four.ids === 'kp-grade-again,kp-grade-hard,kp-grade-good,kp-grade-easy' && four.labels === 'Again/Hard/Good/Easy' && four.keys === '1,2,3,4' && four.waits.split('/').length === 4 && four.waits.split('/').every(waitOk) && four.hint.includes('Good') && four.position === 'fixed' && untouched, JSON.stringify({ ...four, untouched }));

    // swipes: a cancelled gesture or a mostly vertical one never grades; a sideways one does (F34)
    const gesture = (moves, last) =>
      page.evaluate(`(() => {
        const n = document.querySelector('#kp-card');
        const ev = (type, x, y) => n.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, bubbles: true }));
        ev('pointerdown', 150, 100);
        for (const [x, y] of ${JSON.stringify(moves)}) ev('pointermove', x, y);
        ev(${JSON.stringify(last[0])}, ${last[1]}, ${last[2]});
        return { transform: n.style.transform, swipe: n.dataset.swipe ?? '' };
      })()`);
    const cancelled = await gesture([[255, 400]], ['pointercancel', 255, 400]);
    const afterCancel = { count: await count(), log: await logLength('kotoba-mine') };
    const vertical = await gesture([[255, 400]], ['pointerup', 255, 400]);
    const afterVertical = { count: await count(), log: await logLength('kotoba-mine') };
    await gesture([[200, 105], [260, 110]], ['pointerup', 260, 110]);
    const afterSwipe = { count: await count(), log: await logLength('kotoba-mine'), rating: await page.evaluate(`JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mine') || 'null')?.log?.at(-1)?.[1] ?? null`) };
    check(
      'a cancelled swipe and a mostly vertical one (dx 105, dy 300) never grade and put the card back; a sideways swipe grades 正解 (Good, rating 3)',
      afterCancel.count === '1/15' && afterCancel.log === 0 && cancelled.transform === '' && cancelled.swipe === '' && afterVertical.count === '1/15' && afterVertical.log === 0 && vertical.transform === '' && afterSwipe.log === 1 && afterSwipe.rating === 3 && afterSwipe.count !== '1/15',
      JSON.stringify({ afterCancel, afterVertical, afterSwipe }),
    );

    // settings: a labelled backup box, radio groups, the storage line, no label or aria violations (F36, N12)
    await page.click('#kp-quit');
    await page.click('#kp-to-settings');
    await page.waitForSelector('#kp-backup');
    await page.waitForFunction(`document.getElementById('kp-persist')?.textContent.includes('Device storage:')`);
    const settings = await page.evaluate(`({ label: document.querySelector('label[for="kp-backup"]')?.textContent, groups: document.querySelectorAll('.kp-settings [role="radiogroup"][aria-label]').length, checked: document.querySelectorAll('.kp-settings [role="radio"][aria-checked="true"]').length, persist: document.getElementById('kp-persist').textContent, gone: document.querySelectorAll('[data-pref^="grades:"], [data-pref^="furigana:"], [data-pref^="hint:"]').length,
      reset: [...document.querySelectorAll('.kp-settings button')].filter((b) => /記録を消す|消えます|erase.*record|delete.*record|reset.*record|clear.*record/i.test(b.textContent)).length + document.querySelectorAll('.kp-danger').length, backup: [...document.getElementById('kp-backup').closest('.kp-field').querySelectorAll('button')].map((b) => b.textContent) })`);
    const axe = await new AxeBuilder({ page }).include('.kp').analyze();
    const aria = axe.violations.filter((v) => v.id === 'label' || v.id.startsWith('aria-') || v.id === 'button-name').map((v) => v.id);
    check('設定: the backup box has a label, each choice row is a radio group with one checked (no 判定のボタン, no front ふりがな, no ヒント row: the front has no hint), the storage line shows, and axe finds no label or aria problems', settings.label === 'Backup text' && settings.groups === 4 && settings.checked === 4 && settings.gone === 0 && /^Device storage: (persistent|not persistent|unknown)$/.test(settings.persist) && aria.length === 0, JSON.stringify({ ...settings, aria }));
    check('3) 設定 › バックアップ offers コピー and 復元 and no 記録を消す: whole-deck reset is not offered (A34)', settings.reset === 0 && settings.backup.join() === 'Copy,Restore', JSON.stringify({ reset: settings.reset, backup: settings.backup }));

    // the done screen keeps ↶ ひとつ戻す (F37)
    await page.evaluate(`localStorage.setItem('bunki-cloze:prefs:v3:kotoba-mine', JSON.stringify({ ...JSON.parse(localStorage.getItem('bunki-cloze:prefs:v3:kotoba-mine')), newPerDay: 1 }))`);
    await page.evaluate(`localStorage.removeItem('bunki-cloze:kotoba-mine')`);
    await boot('?deck=kotoba');
    await page.click('#kp-start');
    await page.click('#kp-reveal');
    await page.waitForSelector('.kp-grade');
    // a new card answered 正解 (Good) comes back once in the sitting (its 10-minute step); the second answer ends it
    await page.click('#kp-grade-good');
    await page.click('#kp-reveal');
    await page.click('#kp-grade-good');
    await page.waitForSelector('.kp-done');
    const done = await page.evaluate(`({ undo: document.querySelectorAll('#kp-undo').length, text: document.querySelector('.kp-done').innerText.replace(/\\s+/g, ' ') })`);
    let back = null;
    if (done.undo) {
      await page.click('#kp-undo');
      await page.waitForSelector('.kp-grade');
      back = { count: await count(), log: await logLength('kotoba-mine') };
    }
    check('the done screen keeps ↶ ひとつ戻す and it brings the last card back', done.undo === 1 && done.text.includes('Recall rate') && back?.count === '2/2' && back.log === 1, JSON.stringify({ ...done, back }));

    // 4択 never asks a 字 card: it is answered as 穴埋め (F38)
    await page.evaluate(DUE_KANJI);
    await boot('?deck=mcd');
    await page.click('#kp-start');
    await page.waitForSelector('#kp-card');
    const kanji = await page.evaluate(`({ chip: document.querySelector('#kp-card .kp-kindchip')?.textContent, choices: document.querySelectorAll('.kp-choice').length, reveal: !!document.getElementById('kp-reveal'), blank: document.querySelector('#kp-card .kp-blank')?.textContent })`);
    await page.click('#kp-reveal');
    await page.waitForSelector('.kp-grade');
    const grades = await page.locator('.kp-grade').count();
    check('in 4択 a 字 card shows no choices: hint, 答えを見る and the four-pad grade bar instead', kanji.chip === 'Kanji' && kanji.choices === 0 && kanji.reveal && kanji.blank === '〔ざい〕' && grades === 4, JSON.stringify({ ...kanji, grades }));

    // each key grades its own FSRS rating (1 Again, 2 Hard, 3 Good, 4 Easy) on its own card, and the
    // interval it stores is the one its pad showed (a pad's text, read back as a range, holds the
    // scheduled due minus the review time); then a ledger written by the two-button player (ratings 1
    // and 3 only) loads unchanged and takes a Hard as one more row
    const UNIT = { min: 60e3, hr: 36e5, day: 864e5, days: 864e5, month: 30 * 864e5, months: 30 * 864e5, year: 365 * 864e5, years: 365 * 864e5 };
    const holds = (text, ms) => {
      const m = WAIT.exec(text || '');
      if (!m || !waitOk(text)) return false;
      const [n, u] = [Number(m[1]), UNIT[m[2]]];
      const half = /^years?$/.test(m[2]) ? 0.05 : 0.5;
      return ms >= Math.max(0, n - half) * u - 2000 && ms < (n + half) * u + 2000;
    };
    await page.evaluate(`localStorage.removeItem('bunki-cloze:kotoba-mine'); localStorage.removeItem('bunki-cloze:prefs:v3:kotoba-mine')`);
    await boot('?deck=kotoba');
    await page.click('#kp-start');
    const graded = [];
    for (const [key, name] of [['1', 'again'], ['2', 'hard'], ['3', 'good'], ['4', 'easy']]) {
      await page.waitForSelector('#kp-reveal');
      await page.click('#kp-reveal');
      await page.waitForSelector('.kp-grade');
      const shown = await page.evaluate(`({ id: document.getElementById('kp-card').dataset.card, wait: document.querySelector('#kp-grade-${name} small')?.textContent ?? null, log: (JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mine') || 'null')?.log ?? []).length })`);
      await page.keyboard.press(key);
      await page.waitForFunction(`(JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mine') || 'null')?.log ?? []).length === ${shown.log + 1}`, null, { timeout: 5000 });
      const stored = await page.evaluate(`(() => { const s = JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mine')); const row = s.log.at(-1); return { row, due: s.cards[row[0]]?.due ?? null }; })()`);
      const ms = Date.parse(stored.due) - Date.parse(stored.row[2]);
      graded.push({ key, name, card: shown.id, wait: shown.wait, row: stored.row.slice(0, 2), ms, holds: stored.row[0] === shown.id && stored.row[1] === Number(key) && holds(shown.wait, ms) });
    }
    check('keys 1–4 each grade their own rating (Again 1, Hard 2, Good 3, Easy 4) on the card on screen, and each stored interval is the one its pad showed', graded.length === 4 && graded.every((g) => g.holds) && new Set(graded.map((g) => g.card)).size === 4, JSON.stringify(graded));

    const OLD = JSON.stringify({ format: 'bunki-cloze-state', version: 1, deckId: 'kotoba-mine', groupsOff: [],
      cards: {
        'km-064-1': { due: '2020-01-01T00:00:00.000Z', stability: 3.2, difficulty: 5.1, elapsed_days: 3, scheduled_days: 3, learning_steps: 0, reps: 3, lapses: 1, state: 2, last_review: '2019-12-29T00:00:00.000Z', introducedAt: '2019-12-20T00:00:00.000Z' },
        'km-065-1': { due: '2099-01-01T00:00:00.000Z', stability: 30, difficulty: 4.2, elapsed_days: 9, scheduled_days: 30, learning_steps: 0, reps: 2, lapses: 0, state: 2, last_review: '2019-12-28T00:00:00.000Z', introducedAt: '2019-12-20T00:00:00.000Z' },
      },
      log: [['km-064-1', 3, '2019-12-20T00:00:00.000Z'], ['km-065-1', 3, '2019-12-20T00:01:00.000Z'], ['km-064-1', 1, '2019-12-26T00:00:00.000Z'], ['km-064-1', 3, '2019-12-29T00:00:00.000Z'], ['km-065-1', 3, '2019-12-28T00:00:00.000Z']] });
    await page.evaluate(`localStorage.setItem('bunki-cloze:kotoba-mine', ${JSON.stringify(OLD)}); localStorage.setItem('bunki-cloze:prefs:v3:kotoba-mine', JSON.stringify({ newPerDay: 0 }))`);
    await boot('?deck=kotoba');
    const oldHome = await page.evaluate(`({ due: document.querySelector('.kp-tiles .kp-c-due b')?.textContent ?? null, notice: document.querySelectorAll('.kp-notice').length, quarantine: localStorage.getItem('bunki-cloze:kotoba-mine:quarantine') })`);
    await page.click('#kp-start');
    await page.click('#kp-reveal');
    await page.waitForSelector('#kp-grade-hard');
    await page.keyboard.press('2');
    await page.waitForFunction(`JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mine')).log.length === 6`, null, { timeout: 5000 });
    const after = await page.evaluate(`JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mine'))`);
    const before = JSON.parse(OLD);
    check('a ledger written by the two-button player (ratings 1 and 3 only) loads as it is: its due card is counted, nothing is set aside, and a Hard adds one [id, 2, time] row after the old rows, the other record untouched',
      oldHome.due === '1' && oldHome.notice === 0 && oldHome.quarantine === null && JSON.stringify(after.log.slice(0, 5)) === JSON.stringify(before.log) && after.log[5][0] === 'km-064-1' && after.log[5][1] === 2 && JSON.stringify(after.cards['km-065-1']) === JSON.stringify(before.cards['km-065-1']) && after.cards['km-064-1'].reps === 4,
      JSON.stringify({ oldHome, last: after.log.at(-1), reps: after.cards['km-064-1']?.reps }));

    // every colour token clears 4.5:1 on the surfaces it sits on, in the light themes (F35, A20)
    const contrast = await page.evaluate(CONTRAST);
    check('light themes: every text colour, the kind colours and the four grade hues included, is at least 4.5:1 on the card, the second panel, the page, the 正解 pad and the accent wash', Object.values(contrast).every((m) => m.ratio >= 4.5), Object.entries(contrast).map(([k, m]) => `${k} ${m.ratio} (${m.pair})`).join(' · '));
  } finally {
    await context.close();
  }
}

/* ------------------------- the back hierarchy (CARD_CONTRACT_V2 §2–§4) */
const KANJI_RE = /[㐀-鿿々〆ヵヶ]/;
const FOLD_ORDER = ['English', 'Translation', 'Kanji form and meaning', 'Related words', 'Other sentences for this word', 'Source'];
const RULE_TEXT = '答えを見て理解が深まったなら もう一度';
const UI_RULE_TEXT = 'Choose Again if seeing the answer improved your understanding.';
/** where each sentence of a passage ends — the rule build.py and the player share */
function sentenceEnds(ja) {
  const out = [];
  let depth = 0;
  for (let i = 0; i < ja.length; ) {
    const ch = ja[i];
    if ('「『（(【〈《'.includes(ch)) depth++;
    else if ('」』）)】〉》'.includes(ch)) depth = Math.max(0, depth - 1);
    else if ('。！？!?'.includes(ch) && depth === 0) {
      let j = i + 1;
      while (j < ja.length && ('。！？!?'.includes(ja[j]) || '」』）)】〉》'.includes(ja[j]))) j++;
      out.push(j);
      i = j;
      continue;
    }
    i++;
  }
  const last = out.at(-1) ?? 0;
  if (last < ja.length) {
    if (ja.slice(last).trim() || !out.length) out.push(ja.length);
    else out[out.length - 1] = ja.length;
  }
  return out;
}

/** the back as data: readings everywhere, the gloss default, the target sentence's English */
function verifyBackData(decks) {
  const unread = decks.flatMap((deck) => deck.words.flatMap((w) => w.cards.flatMap((c) => c.ruby.filter((seg) => KANJI_RE.test(seg[0]) && !seg[1]).map((seg) => `${c.id} ${seg[0]}`))));
  check('b) every kanji in every passage has a reading for the back (none left bare)', unread.length === 0, unread.slice(0, 4).join(' | ') || `${decks.reduce((n, d) => n + d.words.reduce((m, w) => m + w.cards.length, 0), 0)} cards`);
  check('b) no pitch is shown because the decks carry none (the back omits it)', decks.every((d) => d.words.every((w) => w.pitch == null)));
  check('c) both decks default the English gloss to a tap (deck.defaults.gloss = tap, written by build.py)', decks.every((d) => d.defaults?.gloss === 'tap'), decks.map((d) => `${d.id} ${d.defaults?.gloss}`).join(' · '));
  check(
    '2) both decks open in 読んで思い出す (deck.defaults.mode = read, no front hint setting); the MCD method says so and that 字 cards come with 穴埋め',
    decks.every((d) => d.defaults?.mode === 'read' && !('hint' in d.defaults)) && decks[0].method.some((l) => l.includes('読んで思い出す')) && decks[0].method.some((l) => l.includes('字') && l.includes('穴埋め') && l.includes('記録は消えない')),
    decks.map((d) => `${d.id} ${JSON.stringify(d.defaults)}`).join(' · '),
  );
  const mcd = decks.find((d) => d.id === 'kotoba-mcd');
  const cards = mcd.words.flatMap((w) => w.cards);
  const bad = cards.filter((c) => c.enTarget != null && (!c.en.includes(c.enTarget) || (sentenceEnds(c.ja).length > 1 && c.enTarget === c.en))).map((c) => c.id);
  const withEn = cards.filter((c) => c.enTarget).length;
  const sameEnPerPassage = mcd.words.every((w) => w.cards.every((c) => c.enTarget === w.cards.find((x) => x.passage === c.passage && x.type === 'word').enTarget));
  check('c) a passage card carries the English of its target sentence only — part of the passage translation, never all of it when the passage has more than one sentence', bad.length === 0 && withEn / cards.length > 0.9 && sameEnPerPassage, bad.slice(0, 4).join(' | ') || `${withEn}/${cards.length} cards (the rest cannot be matched and show no 英訳)`);
}

/** the standalone study pages and the Anki templates keep parity with the player's front and back */
function verifyBackParity() {
  const tools = resolve(REPO_DIR, 'decks/kotoba-mine/tools');
  const release = resolve(REPO_DIR, 'decks/kotoba-mine/release');
  const bad = [];
  for (const dir of ['anki', 'anki-sentence']) {
    const front = readFileSync(resolve(tools, dir, 'front.html'), 'utf8');
    const back = readFileSync(resolve(tools, dir, 'back.html'), 'utf8');
    if (/furigana:|\{\{(Meaning|SentenceEN|SentenceFurigana|Tip|Kanji)\}\}/.test(front)) bad.push(`${dir}/front: readings or English`);
    if (/\{\{Hint\}\}|class="hint"/.test(front)) bad.push(`${dir}/front: a hint under the blank`);
    const at = ['{{furigana:SentenceFurigana}}', 'class="term"', 'class="posbadge"', '{{DefJA}}', '<summary>英語</summary>', '{{Meaning}}', '<summary>英訳</summary>', '<summary>漢字の形と意味</summary>', '<details class="fold src">', '<summary>出典</summary>'].map((k) => back.indexOf(k));
    if (back.slice(back.indexOf('<summary>出典</summary>')).includes('<details') || /\{\{Source\}\}/.test(back.slice(0, back.indexOf('<summary>出典</summary>')).replace(/<div class="chips">[\s\S]*?<\/div>/, ''))) bad.push(`${dir}/back: 出典 is not the last fold, or the source shows outside it`);
    if (at.some((i) => i < 0) || at.some((i, k) => k && i < at[k - 1])) bad.push(`${dir}/back: order ${at.join(',')}`);
    if (!/\{\{\^Hint\}\}\s*<details class="fold kfold" open>/.test(back) || /\{\{#Hint\}\}\s*<details class="fold kfold" open>/.test(back)) bad.push(`${dir}/back: 漢字 fold not open on 字 cards only`);
    if (/<details[^>]*class="fold (gloss|en)"[^>]* open/.test(back)) bad.push(`${dir}/back: an English fold starts open`);
    if (!/\{\{\^SentenceEN\}\}\s*<details class="fold en">\s*<summary>英訳<\/summary>[^{]*未対応/.test(back)) bad.push(`${dir}/back: no 英訳 fold when the sentence has no English`);
    for (const [name, t] of [['front', front], ['back', back]]) if (!t.includes('<div class="km item-{{Type}}') || !t.includes('<span class="chip lvchip">{{Type}}</span>')) bad.push(`${dir}/${name}: edge and first chip not by item kind`);
    const css = readFileSync(resolve(tools, dir, 'style.css'), 'utf8');
    if (/\.km\.kind-/.test(css) || !css.includes('.km.item-字')) bad.push(`${dir}/style.css: the edge is not the item kind`);
    for (const [name, t] of [['front', front], ['back', back]]) if (!t.includes('pos-{{POS}} {{Tags}}">') || !t.includes('<span class="chip levelchip"></span>')) bad.push(`${dir}/${name}: no level chip from the level::Nx tag`);
    if (!css.includes(".level\\:\\:N1 .levelchip::after {\n  content: 'N1';")) bad.push(`${dir}/style.css: the level chip has no N1 label`);
    if (!css.includes(".pos-adjna .posbadge::after {\n  content: '形容動詞';") || !/\.pos-adjna \.term \{/.test(css)) bad.push(`${dir}/style.css: no 形容動詞 badge`);
    if (!css.includes('#7f1f86') || !css.includes('#ffb0ea') || /#a3237a|#ff8fd8/.test(css)) bad.push(`${dir}/style.css: the 字 edge is not the player's retuned 白/墨 hue`);
    if (!back.includes('lang="en">{{Meaning}}') || !back.includes('lang="en">{{SentenceEN}}') || !back.includes('lang="en">{{Tip}}') || /<details[^>]*lang=/.test(back)) bad.push(`${dir}/back: lang="en" not on the English text alone`);
    if (!/<summary>漢字の形と意味<\/summary>\s*<div class="kanji">\{\{Kanji\}\}<\/div>/.test(back) || !css.includes('.kfam {')) bad.push(`${dir}: the kanji family has no place in the 漢字 fold`);
  }
  const tsv = readFileSync(resolve(release, 'kotoba-mcd.tsv'), 'utf8').trim().split('\n');
  const cols = tsv[2].replace('#columns:', '').split('\t');
  const byId = new Map(readJson(DECK_PATH).words.flatMap((w) => w.cards.map((c) => [c.id, c])));
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  const wrongEn = tsv.slice(3).map((l) => l.split('\t')).filter((r) => r[cols.indexOf('SentenceEN')] !== esc(byId.get(r[0])?.enTarget ?? '')).map((r) => r[0]);
  if (wrongEn.length) bad.push(`kotoba-mcd.tsv SentenceEN ≠ enTarget: ${wrongEn.slice(0, 3).join(', ')}`);
  const posOf = new Map(readJson(DECK_PATH).words.flatMap((w) => w.cards.map((c) => [c.id, w.pos])));
  const wrongPos = tsv.slice(3).map((l) => l.split('\t')).filter((r) => (posOf.get(r[0]) === 'な-adjective') !== (r[cols.indexOf('POS')] === 'adjna')).map((r) => r[0]);
  if (wrongPos.length) bad.push(`kotoba-mcd.tsv POS: な-adjectives are not adjna: ${wrongPos.slice(0, 3).join(', ')}`);
  for (const page of ['study.html', 'study-mcd.html']) {
    const html = readFileSync(resolve(release, page), 'utf8');
    if (!['function leechLadder', 'function deleteCard', 'function suspendedField', 'function kanjiFamily', 'function seeAlsoLine', 'function swapCard', 'restoreSuspended', 'LEECH_LAPSES = 5', 'kp-kfam', 'kp-rhint'].every((k) => html.includes(k))) bad.push(`${page}: no delete, ladder or kanji family`);
    if (!['function sentenceEnds', 'kp-folds', 'kp-zoom', 'ruleSeen', 'savePrefQuiet', 'kp-en-none', RULE_TEXT, 'function revealInPlace', 'kp-kindchip', 'kp-levelchip', 'prefers-reduced-motion'].every((k) => html.includes(k)) || /kp-tapword|is-four|VISUAL_TIPS|topicColour|kp-lvchip/.test(html)) bad.push(`${page}: not the current player`);
    if (!['function settleBack', 'function clampContext', 'function fitClamps', 'function sourceFold', 'kp-f-src', 'HINT_SITTINGS = 3', 'function skipFor', 'この語の他の文'].every((k) => html.includes(k)) || /記録を消す|kp-danger|'kp-hint'/.test(html)) bad.push(`${page}: not the Phase 1 follow-ups player`);
  }
  check('parity: the study pages bundle this player; the Anki fronts show no readings, English or hint; the Anki backs keep the same order (英語 and 英訳 closed, 漢字 open on 字 cards, 出典 the last fold) and translate only the target sentence; Anki edges and first chips by item kind (the retuned 字 hue), 形容動詞 on な-adjectives', bad.length === 0, bad.slice(0, 3).join(' | ') || 'anki, anki-sentence, study.html, study-mcd.html, kotoba-mcd.tsv');
}

/* ------------------------------------- the host lexicon adapter (Phase 2 stage B) */
/** a card of the MCD deck whose tokens hold a 語, a 字 and a 文法 token, with its side file */
function hostProbe() {
  const deck = readJson(DECK_PATH);
  const side = readJson(resolve(dirname(DECK_PATH), deck.tokens));
  const has = (rows, k) => rows.some((t) => t[3] === k && t[4]);
  const id = Object.keys(side.cards).find((cid) => ['語', '字', '文法'].every((k) => has(side.passages[side.cards[cid]], k)));
  return { deck, side, id };
}

async function verifyHost(browser, base) {
  const { deck, side, id } = hostProbe();
  check('tokens: both decks name a side file (deck.tokens) that build.py wrote beside them, and a card holds 語, 字 and 文法 tokens', deck.tokens === 'tokens.json' && readJson(SENTENCE_DECK_PATH).tokens === 'tokens.json' && side.format === 'bunki-cloze-tokens' && !!id, `${deck.tokens} · probe ${id}`);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(SEEDED);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const fetched = [];
  page.on('request', (r) => fetched.push(new URL(r.url()).pathname));
  try {
    await page.goto(`${base}/index.html?deck=mcd`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
    await page.waitForSelector('#kp-start', { timeout: 15000 });
    const before = fetched.filter((p) => p.endsWith('/tokens.json')).length;
    const ledgerBefore = await page.evaluate(`localStorage.getItem('bunki-cloze:kotoba-mcd')`);
    const recordBefore = await readAppRecord(page);
    const o = await page.evaluate(`(async () => {
      const m = await import(new URL('decks/player/mount.js', location.href).href);
      const h = m.hostAdapter();
      const toks = await m.tokensFor('kotoba-mcd', ${JSON.stringify(id)});
      const pick = (k) => toks.find((t) => t.k === k && t.ref);
      const word = h.lookup(pick('語')), kanji = h.lookup(pick('字')), grammar = h.lookup(pick('文法'));
      const other = h.lookup(toks.find((t) => t.k === 'other'));
      const takenBefore = h.isTaken(word);
      const took = await h.take(word);
      const again = await h.take(word);
      const kanjiTook = await h.take(kanji);
      return {
        host: document.querySelector('.kp')?.dataset.host,
        methods: ['lookup', 'open', 'isTaken', 'take', 'addToList'].filter((k) => typeof h?.[k] === 'function').length,
        lists: typeof h?.lists,
        tokens: toks.length, spells: toks.map((t) => t.s).join('').length,
        word, kanji: kanji && { t: kanji.t, id: kanji.id, gloss: kanji.gloss }, grammar: grammar && { t: grammar.t, id: grammar.id, label: grammar.label },
        other,
        takenBefore, took, again, kanjiTook,
        takenAfter: h.isTaken(word), kanjiTaken: h.isTaken(kanji),
        toast: document.getElementById('reader-toast')?.textContent || '',
        undo: !!document.getElementById('reader-toast-action'),
        chooser: document.querySelectorAll('#kp-chooser, .kp-chooser, #take-chooser, .take-chooser').length,
      };
    })()`);
    const wordId = o.word?.id, kanjiId = o.kanji?.id;
    const recordAfter = await waitForAppRecord(page, (r) => r.taken.some((t) => t.id === wordId) && r.taken.some((t) => t.id === kanjiId), { description: 'deck host captures' });
    o.rows = recordAfter.taken.filter((t) => t.id === wordId || t.id === kanjiId).map((t) => t.t + ':' + t.id);
    o.obs = (recordAfter.obslog || []).length - (recordBefore.obslog || []).length;
    o.srsSame = JSON.stringify(recordAfter.srs || {}) === JSON.stringify(recordBefore.srs || {});
    const loaded = fetched.filter((p) => p.endsWith('/tokens.json')).length - before;
    const ledgerAfter = await page.evaluate(`localStorage.getItem('bunki-cloze:kotoba-mcd')`);
    check(
      'host: the corridor mounts the deck with its lexicon adapter (lookup, open, isTaken, take, addToList; no lists() chooser feed); the tokens side file loads only when asked',
      o.host === 'corridor' && o.methods === 5 && o.lists === 'undefined' && before === 0 && loaded === 1,
      JSON.stringify({ host: o.host, methods: o.methods, tokensFetchedAtStart: before, onAsk: loaded }),
    );
    check(
      `host: lookup of known tokens on ${id} returns entries — a 語 with its reading and gloss, a 字 from kanji.json, a 文法 point from the grammar table; a particle returns null`,
      o.word?.t === 'word' && !!o.word.label && !!o.word.reading && !!o.word.gloss && o.kanji?.t === 'kanji' && !!o.kanji.gloss && o.grammar?.t === 'grammar' && !!o.grammar.label && o.other === null && o.spells > 0,
      JSON.stringify({ word: o.word && { id: o.word.id, label: o.word.label, reading: o.word.reading, gloss: o.word.gloss }, kanji: o.kanji, grammar: o.grammar, other: o.other }),
    );
    check(
      'host: take() is the corridor’s one-tap save (A51) — the word and a 字 land in the shared review pool (覚えるの札) of the durable record at once, with the Saved toast and 元に戻す and no chooser; a second take writes nothing; isTaken() then says so; the deck ledger, the observation log and the schedule are untouched',
      !o.takenBefore && o.took && o.again && o.kanjiTook && o.takenAfter && o.kanjiTaken && o.rows.length === 2 && /復習に保存しました|Saved to review/.test(o.toast) && o.undo && o.chooser === 0 && o.obs === 0 && o.srsSame && ledgerAfter === ledgerBefore,
      JSON.stringify({ rows: o.rows, toast: o.toast, undo: o.undo, chooser: o.chooser, obs: o.obs, srsSame: o.srsSame, ledgerSame: ledgerAfter === ledgerBefore }),
    );
    await page.evaluate(`(async () => {
      const m = await import(new URL('decks/player/mount.js', location.href).href);
      const toks = await m.tokensFor('kotoba-mcd', ${JSON.stringify(id)});
      const h = m.hostAdapter();
      h.open(h.lookup(toks.find((t) => t.k === '語' && t.ref)));
    })()`);
    await page.waitForSelector('#sheet', { timeout: 8000 });
    const sheet = await page.evaluate(`({ node: document.querySelector('#sheet')?.dataset.node, take: document.querySelector('#sheet #take')?.getAttribute('aria-pressed'), deck: !!document.querySelector('.kp') })`);
    check('host: open(entry) shows the corridor’s own entry sheet for the word (its 覚える already on), over the deck', /^word:/.test(sheet.node || '') && sheet.take === 'true' && sheet.deck, JSON.stringify(sheet));
    if (errors.length) check('no page errors with the host adapter', false, errors.slice(0, 2).join(' | '));
  } finally {
    await context.close();
  }
  const release = await startServer(resolve(REPO_DIR, 'decks/kotoba-mine/release'));
  const seen = [];
  try {
    for (const page of ['study-mcd.html', 'study.html']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await context.newPage();
      const asked = [];
      p.on('request', (r) => asked.push(new URL(r.url()).pathname));
      await p.goto(`${release.base}/${page}`, { waitUntil: 'load' });
      await p.waitForSelector('#kp-start', { timeout: 30000 });
      const host = await p.evaluate(`document.querySelector('.kp')?.dataset.host`);
      seen.push({ page, host, tokens: asked.filter((a) => a.includes('tokens')).length });
      await context.close();
    }
  } finally {
    release.server.close();
  }
  const html = ['study.html', 'study-mcd.html'].map((f) => readFileSync(resolve(REPO_DIR, 'decks/kotoba-mine/release', f), 'utf8'));
  check(
    'host: the standalone study pages mount with a null adapter (data-host none), bundle no host.js and no tokens, and fetch none',
    seen.every((x) => x.host === 'none' && x.tokens === 0) && html.every((t) => !t.includes('createHost') && !t.includes('bunki-cloze-tokens","version') && !/"tokens":"tokens/.test(t) && t.includes('function hostAdapter')),
    JSON.stringify(seen),
  );
}

/* ------------------------------------- the passage pilot (STANDARD A46, CARD_CONTRACT_V2 §2–§7) */
const REGISTERS = { 講: '講義', 報: '報道', 論: '論説', 話: '会話', 学: '学び', 語: '話し方' };
// the register chip's full name (its title and aria-label, mount.js REGISTER)
const REGISTER_NAMES = { 講: '講義・本の要約', 報: 'ニュース・解説', 論: 'エッセイ・思想', 話: '話し言葉', 学: '勉強法・学習の話', 語: '話し方・書き方の話' };
const TOPICS = { mind: '心と学び', india: 'インド・仏教', ai: 'AI・半導体', history: '世界史', language: '日本語' };
const UI_REGISTERS = { 講: 'Lecture', 報: 'Reporting', 論: 'Essay', 話: 'Conversation', 学: 'Learning', 語: 'Expression' };
const UI_REGISTER_NAMES = { 講: 'Lectures and book summaries', 報: 'News and commentary', 論: 'Essays and ideas', 話: 'Spoken language', 学: 'Study and learning', 語: 'Speaking and writing' };
const UI_TOPICS = { mind: 'Mind and learning', india: 'India and Buddhism', ai: 'AI and semiconductors', history: 'World history', language: 'Japanese' };
const PILOT_CARD = 'km-240-m06'; // 習得, 講 / history: 『解体新書』の蘭学者たち
// two full-run cards (source/mcd/v2-2026-10-05-b*.json), other registers than the pilot card's
const FULL_RUN_CARDS = ['km-064-m08', 'km-110-m07']; // 財政, 論 / india: 寺の財政 · 利率, 話 / ai: ローンの比較

function pilotCards(deck) {
  return deck.words.flatMap((w) => w.cards.filter((c) => c.register).map((c) => ({ ...c, word: w })));
}

function verifyPilotData(deck) {
  const cards = pilotCards(deck);
  const bad = [];
  for (const c of cards) {
    const n = sentenceEnds(c.ja).length;
    const marks = c.ruby.filter((seg) => seg.length > 2);
    if (n < 4 || n > 5) bad.push(`${c.id}: ${n} sentences`);
    if (c.ja.length < 180 || c.ja.length > 300) bad.push(`${c.id}: ${c.ja.length} characters`);
    if (c.type !== 'word' || marks.length !== 1 || marks[0][2] !== 1 || c.ja.split(c.form).length !== 2) bad.push(`${c.id}: target not once`);
    if (c.kind !== 'original' || c.src?.licence !== 'Bunki original') bad.push(`${c.id}: not written for the deck`);
    if (!REGISTERS[c.register] || !TOPICS[c.topic]) bad.push(`${c.id}: register ${c.register} topic ${c.topic}`);
    // a usage note only when the passage needs one (contract §3 item 4): one Japanese line where present
    if (c.tipJa != null && (typeof c.tipJa !== 'string' || !c.tipJa || c.tipJa.length > 80 || /[A-Za-z\n]/.test(c.tipJa))) bad.push(`${c.id}: tipJa`);
    if (!c.enTarget || !c.en.includes(c.enTarget)) bad.push(`${c.id}: no target-sentence English`);
    if (c.grammar && !c.grammar.every((g) => g.id && g.p)) bad.push(`${c.id}: grammar`);
    if (c.sense != null && (typeof c.sense !== 'string' || !c.sense || c.sense.length > 40 || /[A-Za-z]/.test(c.sense))) bad.push(`${c.id}: sense`);
  }
  const words = [...new Set(cards.map((c) => c.word.id))];
  check(
    'pilot and full run: every contract-v2 card is 4–5 sentences of 180–300 characters, the target once, written for the deck, with a register, a topic, a Japanese usage note and a Japanese sense where it names them, and its target sentence’s English',
    cards.length >= 54 && bad.length === 0,
    bad.slice(0, 4).join(' | ') || `${cards.length} cards · ${words.length} words · ${Object.keys(REGISTERS).map((r) => `${r}${cards.filter((c) => c.register === r).length}`).join(' ')} · tipJa ${cards.filter((c) => c.tipJa).length} · sense ${cards.filter((c) => c.sense).length}`,
  );
  const same = words.filter((wid) => {
    const regs = cards.filter((c) => c.word.id === wid).map((c) => c.register);
    return new Set(regs).size !== regs.length;
  });
  // A49: a word's contract-v2 passages come first, in one unbroken run from its first card
  const after = deck.words.filter((w) => {
    const v2 = w.cards.map((c, i) => (c.register ? i : -1)).filter((i) => i >= 0);
    return v2.length && v2.some((i, k) => i !== k);
  });
  check('pilot and full run: a word’s v2 passages differ in register (§5) and come first, unbroken from its first card (A49)', same.length === 0 && after.length === 0, [...same, ...after.map((w) => w.id)].join(' ') || `${words.length} words`);
  const side = readJson(resolve(dirname(DECK_PATH), deck.tokens));
  const ids = new Set(deck.words.map((w) => w.id));
  const lemmas = Object.keys(side.defs).filter((k) => !ids.has(k));
  check('pilot: the MCD tokens file carries Japanese senses for words that are not the deck’s own (gloss_ja.json), beside one definition per deck word', lemmas.length > 500 && deck.words.every((w) => side.defs[w.id]), `${lemmas.length} lemma senses · ${ids.size} deck words`);
}

/* ------------------------------------- the full passage run (STANDARD A49, A50) */
function verifyFullRunData(deck) {
  const cards = deck.words.flatMap((w) => w.cards.map((c) => ({ ...c, word: w })));
  const words = cards.filter((c) => c.type === 'word');
  const kanji = cards.filter((c) => c.type === 'kanji');
  const v2 = words.filter((c) => c.register);
  const mined = words.filter((c) => c.kind !== 'original');
  const pilot = new Set(Object.keys(readJson(PILOT_PATH)).map((n) => `km-${n.padStart(3, '0')}`));
  const run = v2.filter((c) => !pilot.has(c.word.id));
  check(
    'full run (A50): 323 words, 2435 cards — 1897 語 (one per passage) and 538 字 — over 1897 passages: 954 contract v2 (54 pilot, 900 full run over 303 words), 454 mined',
    deck.words.length === 323 && cards.length === 2435 && words.length === 1897 && kanji.length === 538 && new Set(words.map((c) => `${c.word.id}:${c.ja}`)).size === 1897 && v2.length === 954 && run.length === 900 && new Set(run.map((c) => c.word.id)).size === 303 && mined.length === 454,
    `${deck.words.length} words · ${cards.length} cards · ${words.length} 語 · ${kanji.length} 字 · ${v2.length} v2 (${v2.length - run.length} pilot, ${run.length} full run, ${new Set(run.map((c) => c.word.id)).size} words) · ${mined.length} mined`,
  );
  const late = deck.words.filter((w) => !(w.cards[0].type === 'word' && w.cards[0].register && w.cards[0].passage === 1 && w.cards[0].lv === 1));
  check('full run (A49): every word’s first passage is contract v2 — its first card is a 語 card with a register, passage 1, lv 1', late.length === 0, late.map((w) => w.id).join(' ') || `${deck.words.length}/${deck.words.length} words`);
  // A49: the 字 cards stay on the passage they were made from (their ids were minted there): the
  // word's first passage without a register; a v2 passage never has one
  const strays = kanji.filter((c) => {
    const origin = c.word.cards.find((x) => x.type === 'word' && !x.register);
    return !origin || c.ja !== origin.ja || c.passage !== origin.passage || c.src?.site !== origin.src?.site;
  });
  const onV2 = kanji.filter((c) => v2.some((x) => x.word === c.word && x.ja === c.ja));
  check(
    'full run (A49): every 字 card points at its origin passage — the word’s first passage without a register, the one its id was minted on — and no contract-v2 passage has a 字 card',
    strays.length === 0 && onV2.length === 0,
    [...strays, ...onV2].slice(0, 4).map((c) => `${c.id} (passage ${c.passage})`).join(' | ') || `${kanji.length} 字 cards on ${new Set(kanji.map((c) => `${c.word.id}:${c.passage}`)).size} origin passages`,
  );
}

async function verifyPilot(browser, base, cardId = PILOT_CARD, label = 'pilot') {
  const deck = readJson(DECK_PATH);
  const side = readJson(resolve(dirname(DECK_PATH), deck.tokens));
  const card = pilotCards(deck).find((c) => c.id === cardId);
  if (!card) {
    check(`${label}: ${cardId} is in the deck`, false);
    return;
  }
  // a word of this passage that is not the deck's own and has a sense in the table: keyed as the
  // build keys it (ref, lemma, surface), its surface printed once in the passage
  const ids = new Set(deck.words.map((w) => w.id));
  const terms = new Set(deck.words.map((w) => w.term));
  const rows = side.passages[side.cards[card.id]];
  // in the target sentence, which stays open when 焦点 folds the others
  const ends = sentenceEnds(card.ja);
  const at = card.ja.indexOf(card.form);
  const [from, to] = [ends.filter((e) => e <= at).at(-1) ?? 0, ends.find((e) => e > at)];
  const pick = rows
    .filter(([s, , , k]) => k === '語' && s !== card.form && card.ja.split(s).length === 2 && card.ja.indexOf(s) >= from && card.ja.indexOf(s) < to)
    .map(([s, b = '', , , ref = '']) => ({ s, key: [ref, b, s].find((x) => x && (terms.has(x) || Object.hasOwn(side.defs, x))) }))
    .find((t) => t.key && !terms.has(t.key) && !ids.has(t.key));
  const sense = pick ? side.defs[pick.key].map((r) => r[0]).join('') : '';
  const state = JSON.stringify({ format: 'bunki-cloze-state', version: 1, deckId: 'kotoba-mcd', groupsOff: [], log: [], cards: { [card.id]: { due: '2020-01-01T00:00:00.000Z', stability: 20, difficulty: 5, state: 2, reps: 3, lapses: 0, elapsed_days: 20, scheduled_days: 20 } } });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(SEEDED);
  await context.addInitScript(`try { if (!sessionStorage.getItem('__pilot_seeded')) { sessionStorage.setItem('__pilot_seeded', '1');
    localStorage.setItem('bunki-cloze:prefs:v3:kotoba-mcd', ${JSON.stringify(JSON.stringify({ ruleSeen: true, newPerDay: 0 }))});
    localStorage.setItem('bunki-cloze:kotoba-mcd', ${JSON.stringify(state)}); } } catch {}`);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(`${base}/index.html?deck=mcd`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
    await page.waitForSelector('#kp-start', { timeout: 15000 });
    await page.click('#kp-start');
    await page.waitForSelector('#kp-card');
    const front = await page.evaluate(`(() => { const f = document.getElementById('kp-card'); return { id: f.dataset.card, sentences: f.querySelectorAll('.kp-sentence .kp-s').length, target: [...f.querySelectorAll('.kp-sentence .kp-target')].map((n) => n.textContent), rt: f.querySelectorAll('rt').length, blank: f.querySelectorAll('.kp-blank').length, text: f.querySelector('.kp-sentence').textContent,
      chips: [...f.querySelectorAll('.kp-chips .kp-chip')].map((n) => n.textContent), reg: f.querySelector('.kp-chips .kp-regchip')?.getAttribute('aria-label') || '', rows: (() => { const tops = new Set([...f.querySelectorAll('.kp-chips .kp-chip')].map((n) => Math.round(n.getBoundingClientRect().top))); return tops.size; })() }; })()`);
    check(
      `${label}: ${card.id} (${card.word.term}, ${card.register}/${card.topic}) shows its ${sentenceEnds(card.ja).length} sentences with the target marked once, no readings, no gap`,
      front.id === card.id && front.sentences === sentenceEnds(card.ja).length && front.sentences >= 4 && front.target.length === 1 && front.target[0] === card.form && front.rt === 0 && front.blank === 0 && front.text === card.ja,
      JSON.stringify({ ...front, text: undefined }),
    );
    // one line at 390px, even with the longest topic chip (インド・仏教) beside a level chip
    // (km-064-m08). Round 4 (T8, T2): the front is the sentence, so the register and the source are no
    // longer bare chips there ("Lecture", "Examples"); the back's 出典 fold names the style in full
    check(
      `${label}: the topic sits as a small text chip in the card’s chip row in place of the word’s group; no register chip and no source chip on the front; one row on a phone`,
      front.chips.includes(UI_TOPICS[card.topic]) && !front.chips.includes(UI_REGISTERS[card.register]) && !front.chips.includes(deck.groups.find((g) => g.id === card.word.group)?.titleEn) && !front.chips.includes('Original composition') && front.reg === '' && front.rows === 1,
      JSON.stringify({ chips: front.chips, reg: front.reg, rows: front.rows }),
    );
    await page.click('#kp-reveal');
    await page.waitForSelector('.kp-grade');
    await page.waitForSelector('#kp-card .kp-sentence .kp-tok', { timeout: 15000 });
    const style = await page.evaluate(`document.querySelector('#kp-card .kp-f-src .kp-src-style')?.textContent ?? null`);
    check(`${label}: the back’s 出典 fold names the passage’s style in full (${UI_REGISTER_NAMES[card.register]})`, style === `Style ${UI_REGISTER_NAMES[card.register]}`, JSON.stringify({ style }));
    // on the back the 全文／焦点 toggle may take a line of its own; the chips keep theirs
    const backRows = await page.evaluate(`new Set([...document.querySelectorAll('#kp-card .kp-chips > .kp-chip')].map((n) => Math.round(n.getBoundingClientRect().top))).size`);
    check(`${label}: on the back the chips still sit on one row`, backRows === 1, JSON.stringify({ backRows }));
    const back = await page.evaluate(`(() => { const a = document.querySelector('#kp-card .kp-answer'); const kids = [...a.children].map((n) => n.className.split(' ')[0]); const note = a.querySelector(':scope > .kp-note'); return { kids, note: note?.textContent || '', lang: note?.closest('[lang]')?.lang, beforeFolds: kids.indexOf('kp-note') >= 0 && kids.indexOf('kp-note') < kids.indexOf('kp-folds'), afterDef: kids.indexOf('kp-note') === kids.indexOf('kp-def') + 1, grammar: [...document.querySelectorAll('#kp-see [data-grammar]')].map((n) => n.dataset.grammar) }; })()`);
    check(
      `${label}: the back puts the passage’s own usage note (tipJa) in tier one, right after the definition and before the folds, in Japanese`,
      back.note === card.tipJa && back.afterDef && back.beforeFolds && back.lang === 'ja',
      JSON.stringify(back),
    );
    check(`${label}: the passage’s grammar points appear in the back’s 文法 line`, (card.grammar || []).every((g) => back.grammar.includes(g.id)), JSON.stringify({ want: (card.grammar || []).map((g) => g.id), got: back.grammar }));
    let sheet = null;
    if (pick) {
      // the token whose text (its readings left out) is the picked surface: a ruby'd token's
      // textContent carries its <rt>, so a text filter would miss 減れ in 減<rt>へ</rt>れ
      await page.evaluate(`(() => { for (const n of document.querySelectorAll('#kp-card .kp-sentence .kp-tok:not(.kp-target):not([data-deck-word])')) {
        const c = n.cloneNode(true); c.querySelectorAll('rt, rp').forEach((r) => r.remove());
        if (c.textContent === ${JSON.stringify(pick.s)}) { n.dataset.verifyPick = '1'; return; } } })()`);
      await page.locator('#kp-card [data-verify-pick]').first().click();
      await page.waitForSelector('#kp-sheet');
      sheet = await page.evaluate(`(() => { const s = document.getElementById('kp-sheet'); return { term: s.querySelector('.kp-sheet-term')?.textContent, def: s.querySelector('.kp-sheet-def')?.textContent || '', none: s.querySelector('.kp-sheet-none')?.textContent || '', take: !!s.querySelector('#kp-take'), inDeck: !!s.querySelector('.kp-sheet-indeck') }; })()`);
    }
    check(
      `${label}: tapping a word that is not the deck’s own (${pick?.s ?? 'none found'}) shows its Japanese sense from gloss_ja.json in the entry sheet, not 「まだ辞書にありません」`,
      !!pick && !!sense && sheet?.def === sense && !sheet.none && !sheet.inDeck,
      JSON.stringify({ pick, sense, sheet }),
    );
    check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await context.close();
  }
}

/* ------------------------------------- tap → define → 覚える (Phase 2 stage C, STANDARD A44) */
/** the ledger's scheduler fields (an absent ledger or key read as empty, as the engine reads it):
 * what a tap must leave exactly as it was */
const SCHEDULE_OF = (key) => `(() => { const s = JSON.parse(localStorage.getItem(${JSON.stringify(key)}) || '{}'); return JSON.stringify({ cards: s.cards || {}, log: s.log || [], groupsOff: s.groupsOff || [], suspended: s.suspended || {}, repairs: s.repairs || {}, repairLog: s.repairLog || [] }); })()`;
const LOOKUPS_OF = (key) => `(JSON.parse(localStorage.getItem(${JSON.stringify(key)}) || '{}').lookups || [])`;
/** the tap targets' reach: elementFromPoint 21px above and below each sampled word's centre lands on that word */
const REACH = `(() => {
  const bar = document.querySelector('.kp-grades')?.getBoundingClientRect().top ?? innerHeight;
  const toks = [...document.querySelectorAll('#kp-card .kp-sentence .kp-tok:not(.kp-target)')].filter((t) => { const r = t.getClientRects(); if (r.length !== 1) return false; const c = (r[0].top + r[0].bottom) / 2; return c > 80 && c < bar - 30; }).slice(0, 12);
  const miss = [];
  for (const t of toks) {
    const r = t.getClientRects()[0];
    const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
    for (const dy of [-21, 21]) { const hit = document.elementFromPoint(x, y + dy); if (!hit || !t.contains(hit)) miss.push(t.textContent + (dy < 0 ? '↑' : '↓')); }
  }
  return { sampled: toks.length, miss, height: toks[0] ? toks[0].getClientRects()[0].height : 0 };
})()`;

async function verifyTap(browser, base) {
  const mcd = readJson(DECK_PATH);
  const side = readJson(resolve(dirname(DECK_PATH), mcd.tokens));
  const due = (deck, id) => JSON.stringify({ format: 'bunki-cloze-state', version: 1, deckId: deck, groupsOff: [], log: [], cards: { [id]: { due: '2020-01-01T00:00:00.000Z', stability: 20, difficulty: 5, state: 2, reps: 3, lapses: 0, elapsed_days: 20, scheduled_days: 20 } } });
  const open = async (q, deck, { prefs = null, state = null } = {}) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(SEEDED);
    await context.addInitScript(`try { if (!sessionStorage.getItem('__tap_seeded')) { sessionStorage.setItem('__tap_seeded', '1');
      localStorage.setItem('bunki-cloze:prefs:v3:${deck}', ${JSON.stringify(JSON.stringify({ ruleSeen: true, ...(prefs || {}) }))});
      ${state ? `localStorage.setItem('bunki-cloze:${deck}', ${JSON.stringify(state)});` : ''} } } catch {}`);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/index.html${q}`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
    await page.waitForSelector('#kp-start', { timeout: 15000 });
    await page.click('#kp-start');
    await page.waitForSelector('#kp-card');
    return { context, page, errors };
  };
  const env = async (page) => {
    const e = await readAppRecord(page);
    return { taken: (e.taken || []).map((t) => t.t + ':' + t.id), lists: e.lists || {}, obs: (e.obslog || []).length, srs: JSON.stringify(e.srs || {}) };
  };
  const KEY = 'bunki-cloze:kotoba-mcd';

  // 1. the corridor: a new card of 財政 (km-064-m01), then a due card of 金利 (km-109-m01), whose definition names 利息
  let o = await open('?deck=mcd', 'kotoba-mcd');
  try {
    const { page } = o;
    await page.waitForLoadState('networkidle');
    const front = await page.evaluate(`({ toks: document.querySelectorAll('#kp-card .kp-tok').length, roles: document.querySelectorAll('#kp-card .kp-sentence [role="button"], #kp-card .kp-sentence [tabindex]').length, card: document.getElementById('kp-card').dataset.card })`);
    check('tap: the front has no tap targets, even with the tokens loaded (front pin)', front.toks === 0 && front.roles === 0, JSON.stringify(front));
    await page.click('#kp-reveal');
    await page.waitForSelector('#kp-card .kp-sentence .kp-tok');
    const rows = side.passages[side.cards[front.card]];
    const card = mcd.words.flatMap((w) => w.cards).find((c) => c.id === front.card);
    // the lexical tokens outside the target: each is one tap target with that text (a 文法 cue's tokens as one)
    const marks = [];
    let at = 0;
    for (const [t, , m] of card.ruby) {
      if (m) marks.push([at, at + t.length]);
      at += t.length;
    }
    const want = [];
    at = 0;
    for (const [s, , , k = '', ref = ''] of rows) {
      const inTarget = marks.some(([a, b]) => at < b && at + s.length > a);
      const last = want.at(-1);
      if (k && !inTarget) {
        if (k === '文法' && last?.k === '文法' && last.ref === ref && last.end === at) {
          last.s += s;
          last.end += s.length;
        } else want.push({ s, k, ref, end: at + s.length });
      }
      at += s.length;
    }
    const back = await page.evaluate(`(() => {
      const plain = (n) => { const c = n.cloneNode(true); c.querySelectorAll('rt').forEach((r) => r.remove()); return c.textContent; };
      const toks = [...document.querySelectorAll('#kp-card .kp-sentence .kp-tok:not(.kp-target)')].map(plain);
      const t = document.querySelector('#kp-card .kp-sentence .kp-tok:not(.kp-target)');
      const rest = getComputedStyle(t).textDecorationLine;
      return { toks, def: [...document.querySelectorAll('#kp-card .kp-def .kp-tok')].map((n) => n.textContent), target: document.querySelectorAll('#kp-card .kp-sentence .kp-target.kp-tok').length, rest,
        roles: [...document.querySelectorAll('#kp-card .kp-tok')].every((n) => n.getAttribute('role') === 'button' && n.tabIndex === 0) };
    })()`);
    const missing = want.filter((w) => !back.toks.includes(w.s)).map((w) => w.s);
    check(
      `tap: after the reveal every word of ${front.card}'s passage (語・字・文法, ${want.length}) and of its definition is a tap target, the target too; buttons by role, in the tab order`,
      missing.length === 0 && back.toks.length >= want.length && back.def.length >= 2 && back.target >= 1 && back.roles,
      JSON.stringify({ want: want.length, got: back.toks.length, missing: missing.slice(0, 5), def: back.def, target: back.target }),
    );
    const reach = await page.evaluate(REACH);
    await page.hover('#kp-card .kp-sentence .kp-tok:not(.kp-target)');
    const hover = await page.evaluate(`(() => { const t = document.querySelector('#kp-card .kp-sentence .kp-tok:not(.kp-target)'); const cs = getComputedStyle(t); return cs.textDecorationLine + ' ' + cs.textDecorationStyle; })()`);
    check(
      'tap: each word reaches 44px tall (a press 21px above or below its centre lands on it), and has no underline until hover or focus, then a dotted one',
      reach.sampled >= 5 && reach.miss.length === 0 && back.rest === 'none' && hover === 'underline dotted',
      JSON.stringify({ ...reach, rest: back.rest, hover }),
    );

    const before = { sched: await page.evaluate(SCHEDULE_OF(KEY)), env: await env(page) };
    // a word of the passage that is not this deck's: 人口
    const tok = page.locator('#kp-card .kp-sentence .kp-tok:not(.kp-target):not([data-deck-word])').first();
    const tokText = await tok.evaluate((n) => { const c = n.cloneNode(true); c.querySelectorAll('rt').forEach((r) => r.remove()); return c.textContent; });
    await tok.click();
    await page.waitForSelector('#kp-sheet');
    await page.waitForTimeout(250);
    const sheet = await page.evaluate(`(() => { const s = document.getElementById('kp-sheet'); const en = s.querySelector('.kp-sheet-en'); return { depth: s.dataset.depth, key: s.dataset.key, term: s.querySelector('.kp-sheet-term')?.textContent, reading: s.querySelector('.kp-sheet-reading')?.textContent || '', ja: (s.querySelector('.kp-sheet-def') || s.querySelector('.kp-sheet-none'))?.textContent, enOpen: en?.open, enText: en?.querySelector('[lang="en"]')?.textContent || '', take: !!s.querySelector('#kp-take'), inDeck: !!s.querySelector('.kp-sheet-indeck'), modal: s.getAttribute('aria-modal'), focus: document.activeElement?.id }; })()`);
    const ledger1 = await page.evaluate(LOOKUPS_OF(KEY));
    check(
      `tap: a word of the passage (${tokText}) opens the entry sheet through the host — its reading, the Japanese sense (or a line that says the dictionary has none), English behind 英語 (closed), 覚える`,
      sheet.depth === '1' && /^(word|kanji|grammar):/.test(sheet.key) && !!sheet.term && !!sheet.ja && sheet.enOpen === false && !!sheet.enText && sheet.take && !sheet.inDeck && sheet.modal === 'true' && sheet.focus === 'kp-sheet-term',
      JSON.stringify(sheet),
    );
    await page.click('#kp-take');
    const id = sheet.key.replace(/^\w+:/, '');
    await waitForAppRecord(page, (r) => r.taken.some((t) => `${t.t}:${t.id}` === sheet.key), { description: 'one-tap deck capture' });
    await page.waitForSelector('#kp-sheet .kp-sheet-taken');
    const saved = await page.evaluate(`({ chooser: document.querySelectorAll('#kp-chooser, .kp-chooser, #kp-take-save, #kp-new-list').length, toast: document.getElementById('reader-toast')?.textContent || '', undo: !!document.getElementById('reader-toast-action'), list: !!document.getElementById('kp-take-list'), sheet: document.getElementById('kp-sheet')?.dataset.key })`);
    const after = { sched: await page.evaluate(SCHEDULE_OF(KEY)), env: await env(page) };
    check(
      'tap: 覚える is one tap through the corridor’s save path (A51) — no chooser appears; the word is in the shared review pool (覚えるの札) at once, still one row; the corridor shows 復習に保存しました with 元に戻す; the sheet says so and offers リストに追加…',
      saved.chooser === 0 && after.env.taken.filter((k) => k === sheet.key).length === 1 && after.env.taken.length === before.env.taken.length + 1 && /復習に保存しました|Saved to review/.test(saved.toast) && saved.undo && saved.list && saved.sheet === sheet.key,
      JSON.stringify({ ...saved, taken: after.env.taken }),
    );
    // the optional list: the corridor's own popover, over the deck sheet, writes the same guarded commit
    await page.click('#kp-take-list');
    await page.waitForSelector('#vocabulary-list-popover', { timeout: 5000 });
    const pop = await page.evaluate(`(() => { const p = document.getElementById('vocabulary-list-popover'); const r = p.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + Math.min(20, r.height / 2); const top = document.elementFromPoint(x, y); return { title: p.querySelector('.vocabulary-list-title')?.textContent || '', onTop: !!top && p.contains(top), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; })()`);
    check(
      'tap: リストに追加… opens the corridor’s list popover for the saved word, on top of the deck sheet and inside the screen',
      pop.title.includes(sheet.term || id) && pop.onTop && pop.inside,
      JSON.stringify(pop),
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('vocabulary-list-popover'), null, { timeout: 5000 }).catch(() => {});
    check(
      'tap: a tap is capture, never evidence — the deck ledger’s cards, log, suspensions and repairs are byte-identical, no card was added, the observation log and the corridor schedule did not move; the tap is one lookups[] row',
      before.sched === after.sched && after.env.obs === before.env.obs && after.env.srs === before.env.srs && ledger1.length === 1 && ledger1[0][1] === front.card && ledger1[0][2] === 'p' && ledger1[0][4] === sheet.key && ledger1[0][5] === 1,
      JSON.stringify({ same: before.sched === after.sched, obs: [before.env.obs, after.env.obs], lookups: ledger1 }),
    );
    // keys behind an open sheet do not grade; Escape closes it and gives focus back
    await page.keyboard.press('3');
    const graded = (await page.evaluate(SCHEDULE_OF(KEY))) !== before.sched;
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(`({ sheet: !!document.getElementById('kp-sheet'), card: document.getElementById('kp-card')?.dataset.card })`);
    check('tap: with the sheet open the grade keys do nothing; Escape closes it on the same card', !graded && !closed.sheet && closed.card === front.card, JSON.stringify({ graded, ...closed }));
    if (o.errors.length) check('no page errors with the tap', false, o.errors.slice(0, 2).join(' | '));
  } finally {
    await o.context.close();
  }

  o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0 }, state: due('kotoba-mcd', 'km-109-m01') });
  try {
    const { page } = o;
    await page.click('#kp-reveal');
    await page.waitForSelector('#kp-card .kp-sentence .kp-tok');
    const sched = await page.evaluate(SCHEDULE_OF(KEY));
    await page.click('#kp-card .kp-sentence .kp-target.kp-tok');
    await page.waitForSelector('#kp-sheet');
    const self = await page.evaluate(`(() => { const s = document.getElementById('kp-sheet'); return { key: s.dataset.key, term: s.querySelector('.kp-sheet-term')?.textContent, indeck: s.querySelector('.kp-sheet-indeck')?.textContent, take: s.querySelectorAll('#kp-take, #kp-chooser, .kp-take').length, full: !!s.querySelector('#kp-sheet-full'), defToks: [...s.querySelectorAll('.kp-sheet-def .kp-tok')].map((n) => n.textContent), stop: !!s.querySelector('.kp-sheet-stop') }; })()`);
    check(
      'tap: the card’s own word (a word enrolled in this deck) shows 「このデッキにあります」 and no 覚える',
      self.key === 'deck:km-109' && self.term === '金利' && self.indeck === 'Already in this deck' && self.take === 0 && !self.full && !self.stop && self.defToks.includes('利息'),
      JSON.stringify(self),
    );
    await page.click('#kp-sheet .kp-sheet-def .kp-tok[data-deck-word="km-113"]');
    await page.waitForSelector('#kp-sheet[data-depth="2"]');
    const deep = await page.evaluate(`(() => { const s = document.getElementById('kp-sheet'); return { key: s.dataset.key, term: s.querySelector('.kp-sheet-term')?.textContent, stop: s.querySelector('.kp-sheet-stop')?.textContent, toks: s.querySelectorAll('.kp-tok').length, def: s.querySelector('.kp-sheet-def')?.textContent, indeck: !!s.querySelector('.kp-sheet-indeck'), back: !!s.querySelector('#kp-sheet-back') }; })()`);
    check(
      'tap: a word in the sheet’s definition opens one more sheet (depth 2: 利息, also this deck’s), which says 「ここで止めよう」 and has nothing left to tap; ← goes back',
      deep.term === '利息' && deep.stop === 'Pause here' && deep.toks === 0 && !!deep.def && deep.indeck && deep.back,
      JSON.stringify(deep),
    );
    await page.click('#kp-sheet-back');
    await page.waitForSelector('#kp-sheet[data-depth="1"]');
    await page.click('#kp-sheet-close');
    // a word of the card's definition (お金) opens its sheet too
    await page.click('#kp-card .kp-def .kp-tok >> nth=0');
    await page.waitForSelector('#kp-sheet');
    const fromDef = await page.evaluate(`document.getElementById('kp-sheet').dataset.key`);
    const lookups = await page.evaluate(LOOKUPS_OF(KEY));
    const same = (await page.evaluate(SCHEDULE_OF(KEY))) === sched;
    check(
      'tap: lookups[] keeps where and how deep each tap was (passage target, sheet definition at depth 2, card definition) and the schedule is unchanged',
      same && lookups.map((r) => `${r[2]}${r[5]}`).join(',') === 'p1,s2,d1' && lookups[0][4] === 'deck:km-109' && lookups[1][4] === 'deck:km-113' && lookups[2][4] === fromDef,
      JSON.stringify({ same, lookups }),
    );
    await page.keyboard.press('Escape');
    await page.click('#kp-grade-good');
    const graded = await page.evaluate(`JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mcd'))`);
    check('tap: the card still grades as before, and its lookups stay in the ledger beside the answer', graded.log.length === 1 && graded.lookups.length === 3, JSON.stringify({ log: graded.log.length, lookups: graded.lookups.length }));
    if (o.errors.length) check('no page errors in the sheet recursion', false, o.errors.slice(0, 2).join(' | '));
  } finally {
    await o.context.close();
  }

  // 2. the standalone study pages: furigana, this deck's words only, a popover with no 覚える
  const release = await startServer(resolve(REPO_DIR, 'decks/kotoba-mine/release'));
  try {
    const seen = [];
    // a due card whose passage names another word of the deck: 返済 in km-109-m01 (金利), km-114-1 (元金)
    for (const [file, deckId, cardId] of [['study-mcd.html', 'kotoba-mcd', 'km-109-m01'], ['study.html', 'kotoba-mine', 'km-114-1']]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addInitScript(`try { if (!sessionStorage.getItem('__tap_seeded')) { sessionStorage.setItem('__tap_seeded', '1');
        localStorage.setItem('bunki-cloze:prefs:v3:${deckId}', ${JSON.stringify(JSON.stringify({ newPerDay: 0, ruleSeen: true }))});
        localStorage.setItem('bunki-cloze:${deckId}', ${JSON.stringify(due(deckId, cardId))}); } } catch {}`);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${release.base}/${file}`, { waitUntil: 'load' });
      await page.waitForSelector('#kp-start', { timeout: 30000 });
      await page.click('#kp-start');
      await page.waitForSelector('#kp-card');
      const front = await page.evaluate(`document.querySelectorAll('#kp-card .kp-tok').length`);
      await page.click('#kp-reveal');
      await page.waitForSelector('#kp-card .kp-def');
      const key = `bunki-cloze:${deckId}`;
      const shown = await page.evaluate(`document.getElementById('kp-card').dataset.card`);
      const sched = await page.evaluate(SCHEDULE_OF(key));
      const toks = await page.evaluate(`({ all: document.querySelectorAll('#kp-card .kp-tok').length, other: [...document.querySelectorAll('#kp-card .kp-tok:not(.kp-target)')].map((n) => n.dataset.deckWord || ''), rt: document.querySelectorAll('#kp-card .kp-sentence rt').length })`);
      await page.click('#kp-card .kp-sentence .kp-tok[data-deck-word]:not(.kp-target)');
      await page.waitForSelector('#kp-pop');
      const pop = await page.evaluate(`(() => { const p = document.getElementById('kp-pop'); const r = p.getBoundingClientRect(); const en = p.querySelector('details'); return { key: p.dataset.key, term: p.querySelector('.kp-pop-term')?.textContent, reading: p.querySelector('.kp-pop-reading')?.textContent || '', def: p.querySelector('.kp-pop-def')?.textContent || '', enOpen: en?.open, en: en?.querySelector('[lang="en"]')?.textContent || '', note: p.querySelector('.kp-pop-note')?.textContent || '', noteLines: (() => { const n = p.querySelector('.kp-pop-note'); return n ? Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight)) : 0; })(), take: p.querySelectorAll('.kp-take, #kp-take, .kp-chooser').length, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, sheet: !!document.getElementById('kp-sheet') }; })()`);
      const lookups = await page.evaluate(LOOKUPS_OF(key));
      const same = (await page.evaluate(SCHEDULE_OF(key))) === sched;
      await page.click('#kp-card .kp-kindchip');
      const closed = await page.evaluate(`!document.getElementById('kp-pop')`);
      await page.click('#kp-card .kp-sentence .kp-target.kp-tok');
      const self = await page.evaluate(`document.getElementById('kp-pop')?.dataset.key`);
      seen.push({ file, shown, front, toks, pop, self, lookups: lookups.length, same, closed });
      if (errors.length) check(`no page errors on ${file}`, false, errors.slice(0, 2).join(' | '));
      await context.close();
    }
    check(
      'tap, standalone (study-mcd.html, study.html): no tap target on the front; after the reveal furigana and only this deck’s own words are tappable (the built-in gloss map); a tap shows a small popover — term, reading, definition, English behind 英語 — with no 覚える and a one-line note saying so; a press elsewhere closes it; one lookups[] row, the schedule unchanged',
      seen.length === 2 && seen.every((x) => x.front === 0 && x.toks.rt > 0 && x.toks.other.length >= 1 && x.toks.other.every(Boolean) && x.pop.key === 'deck:km-107' && x.self === `deck:${x.shown.slice(0, 6)}` && !!x.pop.term && !!x.pop.reading && !!x.pop.def && x.pop.enOpen === false && !!x.pop.en && /^Save to your review cards in Bunki\.$/u.test(x.pop.note) && x.pop.noteLines === 1 && x.pop.take === 0 && x.pop.inside && !x.pop.sheet && x.lookups === 1 && x.same && x.closed),
      JSON.stringify(seen.map((x) => ({ file: x.file, card: x.shown, front: x.front, toks: x.toks.other, self: x.self, pop: { key: x.pop.key, term: x.pop.term, note: x.pop.note, noteLines: x.pop.noteLines, take: x.pop.take, inside: x.pop.inside }, lookups: x.lookups, same: x.same, closed: x.closed }))),
    );
  } finally {
    release.server.close();
  }
  const html = ['study.html', 'study-mcd.html'].map((f) => readFileSync(resolve(REPO_DIR, 'decks/kotoba-mine/release', f), 'utf8'));
  check('tap: the study pages carry the gloss map of their own deck (bunki-cloze-gloss) and still no tokens', html.every((t) => t.includes('"format":"bunki-cloze-gloss"') && !t.includes('bunki-cloze-tokens","version') && t.includes('function drawPop') && t.includes('ここで止めよう')), '');
  // 3. Anki: no tap-to-define, nothing added
  const anki = ['anki/front.html', 'anki/back.html', 'anki-sentence/front.html', 'anki-sentence/back.html'].map((f) => resolve(REPO_DIR, 'decks/kotoba-mine/tools', f)).filter(existsSync).map((f) => readFileSync(f, 'utf8'));
  check('tap: the Anki templates add nothing for it (no tap-to-define in Anki: furigana only, STANDARD A44)', anki.length >= 2 && anki.every((t) => !/kp-tok|kp-sheet|kp-pop|tap-to-define|onclick/.test(t)), `${anki.length} templates`);
}

async function verifyBack(browser, base) {
  const mcdDeck = readJson(DECK_PATH);
  const sentDeck = readJson(SENTENCE_DECK_PATH);
  const index = new Map([mcdDeck, sentDeck].flatMap((d) => d.words.flatMap((w) => w.cards.map((c) => [c.id, { c, w, deck: d.id }]))));
  const ledger = (deck, id, state = 2) => JSON.stringify({ format: 'bunki-cloze-state', version: 1, deckId: deck, groupsOff: [], log: [], cards: { [id]: { due: '2020-01-01T00:00:00.000Z', stability: 20, difficulty: 5, state, reps: 3, lapses: 0, elapsed_days: 20, scheduled_days: 20 } } });
  const repairedLedger = (deck, id, hint) => {
    const s = JSON.parse(ledger(deck, id));
    s.cards[id].lapses = 5;
    s.repairs = { [id]: { at: '2026-10-01T00:00:00.000Z', lapses: 5, hint } };
    s.repairLog = [[id, 'hint', '2026-10-01T00:00:00.000Z', hint]];
    return JSON.stringify(s);
  };
  /** a fresh page with this deck's prefs (and ledger) stored before the player boots */
  const open = async (q, deck, { prefs = null, state = null, sem = false } = {}) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(SEEDED);
    await context.addInitScript(`try { if (!sessionStorage.getItem('__back_seeded')) { sessionStorage.setItem('__back_seeded', '1');
      ${prefs ? `localStorage.setItem('bunki-cloze:prefs:v3:${deck}', ${JSON.stringify(JSON.stringify(prefs))});` : ''}
      ${state ? `localStorage.setItem('bunki-cloze:${deck}', ${JSON.stringify(state)});` : ''} } } catch {}`);
    if (sem) {
      // a 類語 entry for 財政 (sem.json has none for this deck's words yet): the gate is what is tested
      await context.route('**/decks/kotoba-mcd/deck.json', async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        json.words.find((w) => w.id === 'km-064').sem = [{ w: '家計', rel: 'fam', note: 'a household budget' }];
        await route.fulfill({ response, json });
      });
    }
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/index.html${q}`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
    await page.waitForSelector('#kp-start', { timeout: 15000 });
    await page.click('#kp-start');
    await page.waitForSelector('#kp-card');
    return { context, page, errors };
  };
  const cardId = (page) => page.evaluate(`document.getElementById('kp-card').dataset.card`);
  const FRONT = `(() => {
    const card = document.getElementById('kp-card');
    const rest = card.cloneNode(true);
    rest.querySelectorAll('.kp-chips, .kp-sentence').forEach((n) => n.remove());
    rest.querySelectorAll('.kp-taphint').forEach((n) => { if (['Recall the meaning, then tap', 'Tap to reveal the answer'].includes(n.textContent)) n.textContent = ''; });
    rest.querySelectorAll('.kp-rhint-label').forEach((n) => { if (n.textContent === 'Hint') n.textContent = ''; });
    return { rt: card.querySelectorAll('rt, ruby').length, taps: card.querySelectorAll('.kp-sentence :is(button, a, [role="button"], [tabindex], .kp-tapword)').length, tapwords: document.querySelectorAll('.kp-tapword').length,
      rhint: card.querySelectorAll('.kp-rhint').length, repaired: card.dataset.repaired ?? null,
      latin: /[A-Za-z]/.test(rest.textContent), folds: card.querySelectorAll('details').length, text: card.textContent, hint: card.querySelector('.kp-hint')?.textContent ?? null, zoom: !!card.querySelector('.kp-zoom') || !!card.dataset.zoom,
      blanks: card.querySelectorAll('.kp-blank').length, marked: card.querySelectorAll('.kp-sentence .kp-target').length, ctx: card.querySelectorAll('.kp-ctx, .kp-more').length };
  })()`;
  const BACK = `(() => {
    const card = document.getElementById('kp-card');
    const ans = card.querySelector('.kp-answer');
    const sentence = card.querySelector('.kp-sentence').cloneNode(true);
    sentence.querySelectorAll('ruby').forEach((r) => r.remove());
    // the part-of-speech badge is interface chrome (EN: noun, 日本語: 名詞; read as pos below), not the answer's text
    const tier1 = [...ans.querySelectorAll(':scope > .kp-word, :scope > .kp-def, :scope > .kp-note')].map((n) => { const x = n.cloneNode(true); x.querySelectorAll('.kp-posbadge').forEach((b) => b.remove()); return x.textContent; }).join(' ');
    const badge = ans.querySelector('.kp-word > .kp-posbadge');
    const fold = (cls) => { const d = card.querySelector('.' + cls); return d ? { open: d.open, text: d.textContent.replace(d.querySelector('summary').textContent, '').trim(), summary: d.querySelector('summary').textContent } : null; };
    return { pos: badge ? { text: badge.textContent, lang: badge.lang } : null, order: [...ans.children].map((n) => n.className), word: [...ans.querySelector('.kp-word').children].map((n) => n.className), pitch: !!card.querySelector('.kp-pitch'),
      bare: ${KANJI_RE}.test(sentence.textContent), rt: card.querySelectorAll('.kp-sentence rt').length, tier1, def: ans.querySelector('.kp-def')?.textContent,
      summaries: [...ans.querySelectorAll('.kp-folds > details > summary')].map((s) => s.textContent), native: [...ans.querySelectorAll('.kp-folds > *')].every((n) => n.tagName === 'DETAILS' || n.id === 'kp-see'),
      gloss: fold('kp-f-gloss'), en: fold('kp-f-en'), kanji: fold('kp-f-kanji'), sem: fold('kp-f-sem'), others: fold('kp-f-others'), src: fold('kp-f-src'),
      srcLink: card.querySelector('.kp-f-src a')?.getAttribute('href') ?? null, licenceLang: card.querySelector('.kp-licence [lang]')?.lang ?? null };
  })()`;
  const inOrder = (summaries) => {
    const at = summaries.map((t) => FOLD_ORDER.findIndex((k) => t.replace(/^Other passages for this word/, 'Other sentences for this word').startsWith(k)));
    return at.every((i) => i >= 0) && at.every((i, k) => k === 0 || i > at[k - 1]);
  };
  const close = async (o) => {
    if (o.errors.length) check('no page errors on the back', false, o.errors.slice(0, 2).join(' | '));
    await o.context.close();
  };

  // a) the front pin, both decks, with old prefs that used to add tap readings and an English hint
  const fronts = [];
  for (const [label, q, deck, opts] of [
    ['MCD 語 (読んで思い出す, the default)', '?deck=mcd', 'kotoba-mcd', {}],
    ['MCD 語 穴埋め', '?deck=mcd', 'kotoba-mcd', { prefs: { mode: 'self' } }],
    ['MCD 語, old prefs (穴埋め, tap ふりがな, English hint)', '?deck=mcd', 'kotoba-mcd', { prefs: { mode: 'self', furigana: 'tap', hint: 'en' } }],
    ['MCD 字 (穴埋め)', '?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0, mode: 'self' }, state: ledger('kotoba-mcd', 'km-064-m02') }],
    ['文 (読んで思い出す)', '?deck=kotoba', 'kotoba-mine', {}],
    ['文 穴埋め, old prefs (tap ふりがな, English hint)', '?deck=kotoba', 'kotoba-mine', { prefs: { mode: 'self', furigana: 'tap', hint: 'en' } }],
    ['MCD 語 repaired with a ladder hint (§4)', '?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0 }, state: repairedLedger('kotoba-mcd', 'km-064-m01', 'ざ○○○') }],
    ['文 repaired with a ladder hint (§4)', '?deck=kotoba', 'kotoba-mine', { prefs: { newPerDay: 0 }, state: repairedLedger('kotoba-mine', 'km-064-1', 'ざ○○○') }],
  ]) {
    const o = await open(q, deck, opts);
    const f = await o.page.evaluate(FRONT);
    const { c, w } = index.get(await cardId(o.page));
    const english = [w.meaning, c.en, w.tip].filter(Boolean).some((t) => f.text.includes(t));
    // a ladder hint is the one thing a repaired card adds to its front, marked as repaired; no other card shows one
    const repairOk = opts.state?.includes('"hint"') ? f.rhint === 1 && f.repaired === 'hint' : f.rhint === 0 && f.repaired === null;
    // 読んで思い出す marks the target and blanks nothing; 穴埋め blanks it (a 字 card with its 〔reading〕)
    const read = !opts.prefs?.mode || opts.prefs.mode === 'read';
    // (a 字 card marks the rest of its word around the blank)
    const asked = read ? f.marked >= 1 && f.blanks === 0 : f.blanks >= 1;
    fronts.push({ label, ok: f.rt === 0 && f.taps === 0 && f.tapwords === 0 && !f.latin && !english && f.folds === 0 && !f.zoom && f.hint === null && f.ctx === 0 && asked && repairOk, card: c.id, ...f, text: undefined });
    await close(o);
  }
  const badFront = fronts.filter((f) => !f.ok);
  check('a, 2) front pin, both decks: no furigana, no English, no tap targets in the passage, no folds, no hint under a blank — also with old tap-ふりがな / English-hint prefs stored; MCD opens in 読んで思い出す (target marked, nothing blanked), 穴埋め blanks it; only a card repaired with a ladder hint shows one, marked data-repaired', badFront.length === 0, badFront.length ? JSON.stringify(badFront[0]) : fronts.map((f) => `${f.label} ${f.card}`).join(' · '));

  // b, c) a new MCD 語 card: tier one, then the folds in order; d) zoom on a new card
  {
    const o = await open('?deck=mcd', 'kotoba-mcd');
    const { c, w } = index.get(await cardId(o.page));
    const zf = await o.page.evaluate(`document.getElementById('kp-card').dataset.zoom ?? null`);
    await o.page.click('#kp-reveal');
    await o.page.waitForSelector('.kp-grade');
    const b = await o.page.evaluate(BACK);
    const tier1 = b.order.slice(0, b.order.indexOf('kp-folds'));
    check(
      'b) tier one under the passage: the word (reading, part of speech, no pitch), a reading over every kanji, the Japanese definition, no English; the part-of-speech badge is chrome in the interface language (EN: noun)',
      b.word.join() === 'kp-term,kp-reading,kp-posbadge' && !b.pitch && !b.bare && b.rt > 0 && tier1[0] === 'kp-word' && tier1[1] === 'kp-def' && tier1.every((k) => ['kp-word', 'kp-def', 'kp-note'].includes(k.split(' ')[0])) && b.def === w.defJa && !/[A-Za-z]/.test(b.tier1) && zf === null &&
        // the badge follows the interface (this run is EN): the English name, marked lang=en, never 名詞 in EN chrome
        b.pos?.lang === 'en' && /^[a-z -]+$/.test(b.pos.text) && !/[\u3040-\u30ff\u3400-\u9fff]/u.test(b.pos.text),
      JSON.stringify({ card: c.id, order: b.order, word: b.word, rt: b.rt, bare: b.bare, pos: b.pos }),
    );
    const sibs = w.cards.filter((x) => x.type === 'word' && x.passage !== c.passage);
    check(
      'c) tier two: native folds in order 英語 → 英訳 → 漢字の形と意味 → (類語) → other passages → 出典, the folds last in the answer; 英語 is closed by default and holds the gloss',
      b.native && inOrder(b.summaries) && b.summaries[0] === 'English' && b.summaries.at(-1) === 'Source' && b.order.at(-1) === 'kp-folds' && b.gloss && !b.gloss.open && b.gloss.text.startsWith(w.meaning),
      JSON.stringify({ summaries: b.summaries, last: b.order.slice(-2), gloss: b.gloss?.open }),
    );
    const s = c.src;
    check(
      '4) 出典 is the last fold, closed: the site (a link when the record has a URL), the licence from card.src.licence (lang="en"), the author when there is one, and which passage of the word this is',
      b.src && !b.src.open && b.src.text.includes(s.site) && b.src.text.includes(s.licence) && b.src.text.includes(`Passage ${c.passage}`) && (!s.author || b.src.text.includes(s.author)) && b.srcLink === (s.url ?? null) && b.licenceLang === 'en',
      JSON.stringify({ card: c.id, src: b.src?.text, link: b.srcLink }),
    );
    check(
      'c) 英訳 is the target sentence only (not the passage); 漢字 closed on a 語 card; 類語 absent on a new card; other passages are titles only',
      b.en?.text === c.enTarget && c.enTarget !== c.en && b.kanji && !b.kanji.open && !b.sem && b.others?.summary === `Other passages for this word (${sibs.length})` && !b.others.open && sibs.every((x) => !b.others.text.includes(x.ja.slice(0, 10))),
      JSON.stringify({ en: b.en?.text?.slice(0, 50), kanji: b.kanji?.open, sem: !!b.sem, others: b.others?.summary }),
    );
    const zoom = async () =>
      o.page.evaluate(`(() => { const card = document.getElementById('kp-card'); const s = [...card.querySelectorAll('.kp-s')];
        const text = s.map((n) => { const k = n.cloneNode(true); k.querySelectorAll('rt').forEach((r) => r.remove()); return k.textContent; }).join('');
        return { zoom: card.dataset.zoom, n: s.length, focus: s.filter((n) => n.dataset.focus).length, dim: s.filter((n) => !n.dataset.focus).map((n) => +getComputedStyle(n).opacity), bright: s.filter((n) => n.dataset.focus).map((n) => +getComputedStyle(n).opacity), text,
          full: document.getElementById('kp-zoom-full')?.getAttribute('aria-pressed'), focusBtn: document.getElementById('kp-zoom-focus')?.getAttribute('aria-pressed'), inChips: !!card.querySelector('.kp-chips .kp-zoom') }; })()`);
    // the learner opens 英訳, then switches the zoom: the fold stays open (no repaint)
    await o.page.click('.kp-f-en > summary');
    const z1 = await zoom();
    const lang = await o.page.evaluate(`(() => { const ans = document.querySelector('#kp-card .kp-answer');
      const chrome = [...ans.querySelectorAll('.kp-folds summary, .kp-tip-label')].every((n) => n.closest('[lang]').lang === 'en');
      const en = [...ans.querySelectorAll('.kp-gloss, .kp-en')].every((n) => n.lang === 'en');
      return { chrome, en, details: [...ans.querySelectorAll('details')].every((d) => !d.hasAttribute('lang')) }; })()`);
    check('c) screen readers: EN fold summaries and English content carry lang="en", while native details add no language override', lang.chrome && lang.en && lang.details, JSON.stringify(lang));
    // 44px touch targets on the zoom toggle and the rule's ×, though they are drawn smaller
    const hits = await o.page.evaluate(`['kp-zoom-focus', 'kp-zoom-full', 'kp-rule-dismiss'].map((id) => { const n = document.getElementById(id); if (id !== 'kp-rule-dismiss') n.scrollIntoView({ block: 'center' }); const r = n.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const at = (dy) => document.elementFromPoint(cx, cy + dy) === n; return { id, h: Math.round(r.height), reach: at(-21) && at(21) }; })`);
    check('e) the zoom toggle and the rule\'s × each have a 44px hit area on a phone without growing on screen', hits.every((h) => h.reach && h.h < 44), JSON.stringify(hits));
    await o.page.click('#kp-zoom-focus');
    await o.page.waitForTimeout(400);
    const z2 = await zoom();
    const enOpen = await o.page.evaluate(`document.querySelector('#kp-card .kp-f-en').open`);
    check('d) switching 全文／焦点 does not rebuild the screen: an open 英訳 stays open', enOpen === true, String(enOpen));
    const stored = await o.page.evaluate(`JSON.parse(localStorage.getItem('bunki-cloze:prefs:v3:kotoba-mcd') || '{}').zoom`);
    check(
      'd) a new passage card opens 全文 after the reveal (no zoom on the front); 焦点 in the card header dims the other sentences, keeps them, and is remembered for the deck',
      z1.zoom === 'full' && z1.inChips && z1.full === 'true' && z1.n >= 2 && z1.focus === 1 && z1.dim.every((x) => x === 1) && z1.text === c.ja && z2.zoom === 'focus' && z2.focusBtn === 'true' && z2.n === z1.n && z2.dim.every((x) => x < 0.5) && z2.bright.every((x) => x === 1) && z2.text === c.ja && stored === 'focus',
      JSON.stringify({ before: { zoom: z1.zoom, n: z1.n, dim: z1.dim }, after: { zoom: z2.zoom, dim: z2.dim }, stored }),
    );

    // e) the grade bar is fixed to the screen bottom and carries the rule once
    const bar = await o.page.evaluate(`(() => { const b = document.querySelector('.kp-grades').getBoundingClientRect(); const g = document.getElementById('kp-grade-good').getBoundingClientRect();
      const hit = document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2); const t = document.getElementById('primary-tabs')?.getBoundingClientRect(); const tabs = t?.height > 0 ? t : null; return { position: getComputedStyle(document.querySelector('.kp-grades')).position, bottom: Math.round(b.bottom), top: Math.round(b.top), expectedBottom: Math.round(tabs?.top ?? innerHeight), tabsBottom: tabs ? Math.round(tabs.bottom) : null, viewport: innerHeight, noOverlap: b.bottom <= (tabs?.top ?? innerHeight), hit: !!hit?.closest('#kp-grade-good'), rule: document.getElementById('kp-rule')?.textContent ?? null }; })()`);
    await o.page.click('#kp-rule-dismiss');
    await o.page.waitForSelector('#kp-grade-good');
    const dismissed = await o.page.evaluate(`({ rule: !!document.getElementById('kp-rule'), seen: JSON.parse(localStorage.getItem('bunki-cloze:prefs:v3:kotoba-mcd') || '{}').ruleSeen, zoom: document.getElementById('kp-card').dataset.zoom, enOpen: document.querySelector('#kp-card .kp-f-en').open })`);
    check(
      'e) the grade bar is pinned to the bottom of the phone screen and shows 「答えを見て理解が深まったなら もう一度」 until dismissed; dismissing is remembered in prefs and keeps an open fold open',
      bar.position === 'fixed' && bar.bottom === bar.expectedBottom && bar.viewport === 844 && (bar.tabsBottom === null || bar.tabsBottom === 844) && bar.noOverlap && bar.hit && bar.rule?.includes(UI_RULE_TEXT) && !dismissed.rule && dismissed.seen === true && dismissed.zoom === 'focus' && dismissed.enOpen === true,
      JSON.stringify({ ...bar, dismissed }),
    );
    await close(o);
  }

  // c) a passage whose sentences cannot be matched to the English still has its 英訳 fold, saying so
  {
    const o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0 }, state: ledger('kotoba-mcd', 'km-109-m05') });
    const { c } = index.get(await cardId(o.page));
    await o.page.click('#kp-reveal');
    await o.page.waitForSelector('.kp-grade');
    const b = await o.page.evaluate(BACK);
    check('c) a passage with no matched sentence (km-109-m05) keeps the 英訳 fold in its place, saying 未対応, never the whole translation', c.id === 'km-109-m05' && c.enTarget == null && b.summaries[1] === 'Translation' && b.en?.text.includes('unavailable') && !b.en.text.includes(c.en.slice(0, 20)) && inOrder(b.summaries), JSON.stringify({ id: c.id, summaries: b.summaries, en: b.en?.text }));
    await close(o);
  }

  // e) shown once: answering the card it sat under retires the rule
  {
    const o = await open('?deck=kotoba', 'kotoba-mine');
    await o.page.click('#kp-reveal');
    await o.page.waitForSelector('#kp-rule');
    await o.page.click('#kp-grade-good');
    await o.page.click('#kp-reveal');
    await o.page.waitForSelector('.kp-grade');
    const next = await o.page.evaluate(`({ rule: !!document.getElementById('kp-rule'), seen: JSON.parse(localStorage.getItem('bunki-cloze:prefs:v3:kotoba-mine') || '{}').ruleSeen })`);
    check('e) the rule is shown once: after the card it sat under is answered, the next back has none (prefs ruleSeen)', !next.rule && next.seen === true, JSON.stringify(next));
    await close(o);
  }

  // 1, e) the longest passage (km-298-m02, 195 characters), seen before (焦点) and with 全文 chosen: at the
  // resting scroll position after the reveal the word and its definition sit above the pinned bar,
  // no fold row is cut by it; 焦点 folds the other sentences to two dimmed lines each with ⋯
  const RESTING = `new Promise((ok) => { let last = -1; let same = 0; const tick = () => { if (scrollY === last) { if (++same >= 6) return ok(Math.round(scrollY)); } else { same = 0; last = scrollY; } requestAnimationFrame(tick); }; tick(); })`;
  const AT_REST = `(() => { const box = (s) => document.querySelector(s)?.getBoundingClientRect(); const bar = box('.kp-grades'); const t = box('#kp-card .kp-term'); const d = box('#kp-card .kp-def'); const f = box('#kp-card .kp-s[data-focus]') || box('#kp-card .kp-target');
    const rows = [...document.querySelectorAll('#kp-card .kp-folds > details > summary')].map((n) => n.getBoundingClientRect());
    return { y: Math.round(scrollY), bar: Math.round(bar.top), term: Math.round(t.bottom), def: Math.round(d.bottom), sentenceTop: Math.round(f.top), cut: rows.filter((r) => r.top < bar.top - 0.5 && r.bottom > bar.top + 0.5).length }; })()`;
  const CLAMP = `(() => { const card = document.getElementById('kp-card'); return [...card.querySelectorAll('.kp-ctx')].map((g) => { const inner = g.querySelector('.kp-ctx-in'); const more = g.querySelector('.kp-more'); const s = g.querySelector('.kp-s');
    return { side: g.dataset.side, display: getComputedStyle(g).display, clip: g.dataset.clip, h: Math.round(inner.getBoundingClientRect().height), line: parseFloat(getComputedStyle(card.querySelector('.kp-sentence')).lineHeight), more: getComputedStyle(more).display !== 'none', expanded: more.getAttribute('aria-expanded'), dim: +getComputedStyle(s).opacity }; }); })()`;
  // every glyph of a 焦点 context group that is visible (inside the group's clip box and the viewport)
  // must stay clear of its ⋯: { glyphs, hits, at: the first glyph it covers }
  const PILL_CLEAR = `(() => { const out = []; for (const g of document.querySelectorAll('#kp-card .kp-ctx')) { const more = g.querySelector('.kp-more'); if (getComputedStyle(more).display === 'none') continue;
    const m = more.getBoundingClientRect(); const box = g.querySelector('.kp-ctx-in').getBoundingClientRect(); const walk = document.createTreeWalker(g.querySelector('.kp-ctx-flow'), NodeFilter.SHOW_TEXT); let glyphs = 0; let hits = 0; let at = null;
    for (let n = walk.nextNode(); n; n = walk.nextNode()) for (let i = 0; i < n.length; i++) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
      for (const q of r.getClientRects()) { if (!q.width || q.bottom <= Math.max(box.top, 0) || q.top >= Math.min(box.bottom, innerHeight)) continue; glyphs++;
        if (q.left < m.right - 0.5 && q.right > m.left + 0.5 && q.top < m.bottom - 0.5 && q.bottom > m.top + 0.5) { hits++; at ??= n.data[i]; } } }
    out.push({ side: g.dataset.side, glyphs, hits, at }); } return out; })()`;
  {
    const seen = [];
    for (const [id, look] of [
      ['km-109-m05', 'kokuban'],
      ['km-109-m05', 'dark'],
      ['km-298-m02', 'dark'],
    ]) {
      const o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0, zoom: 'auto', look }, state: ledger('kotoba-mcd', id) });
      const card = await cardId(o.page);
      await o.page.click('#kp-reveal');
      await o.page.waitForSelector('.kp-grade');
      await o.page.evaluate(RESTING);
      // the ⋯ in mid-screen, so the lines beside it are measured
      const look1 = async (g) => { await o.page.locator('#kp-card .kp-ctx .kp-more').nth(g).evaluate((n) => n.scrollIntoView({ block: 'center' })); return o.page.evaluate(PILL_CLEAR); };
      const pills = await o.page.locator('#kp-card .kp-ctx .kp-more:visible').count();
      const rest = [];
      const opened = [];
      for (let g = 0; g < pills; g++) rest.push((await look1(g))[g]);
      for (let g = 0; g < pills; g++) {
        await o.page.locator('#kp-card .kp-ctx .kp-more').nth(g).click();
        opened.push((await look1(g))[g]);
      }
      seen.push({ id, look, card, rest, opened });
      await close(o);
    }
    const all = seen.flatMap((x) => [...x.rest, ...x.opened]);
    check(
      '1) in 焦点 the ⋯ never sits on the passage: no visible glyph of a folded group intersects its ⋯, at rest or opened (km-109-m05 in 黒板 and 墨, km-298-m02)',
      seen.every((x) => x.card === x.id && x.rest.length >= 1 && x.opened.length === x.rest.length) && all.every((g) => g && g.glyphs > 0 && g.hits === 0),
      JSON.stringify(seen.map(({ id, look, rest, opened }) => ({ id, look, rest, opened }))),
    );
  }

  {
    const seen = {};
    for (const [label, zoom] of [
      ['焦点', 'auto'],
      ['全文', 'full'],
    ]) {
      const o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0, zoom }, state: ledger('kotoba-mcd', 'km-298-m02') });
      const id = await cardId(o.page);
      await o.page.click('#kp-reveal');
      await o.page.waitForSelector('.kp-grade');
      await o.page.evaluate(RESTING);
      const rest = await o.page.evaluate(AT_REST);
      const groups = await o.page.evaluate(CLAMP);
      const text = await o.page.evaluate(SENTENCE);
      let opened = null;
      if (label === '焦点') {
        const g = groups.findIndex((x) => x.more);
        if (g >= 0) {
          await o.page.locator('#kp-card .kp-ctx .kp-more').nth(g).click();
          opened = (await o.page.evaluate(CLAMP))[g];
        }
      }
      seen[label] = { id, rest, groups, text, opened };
      await close(o);
    }
    const f = seen['焦点'];
    const full = seen['全文'];
    const { c } = index.get('km-298-m02');
    check(
      '1) the longest passage (km-298-m02) at its resting position after the reveal, 焦点 and 全文: .kp-term and the definition sit above the pinned bar, no fold row is cut by it; in 焦点 the target sentence is on screen too',
      f.id === 'km-298-m02' && full.id === 'km-298-m02' && [f, full].every((x) => x.rest.term <= x.rest.bar && x.rest.def <= x.rest.bar && x.rest.cut === 0) && f.rest.sentenceTop >= 0,
      JSON.stringify({ 焦点: f.rest, 全文: full.rest }),
    );
    check(
      '1) 焦点 folds the sentences before and after the target to two dimmed lines each (never removed: the passage text is whole), with ⋯ (aria-expanded) on a group that runs longer, which opens it; 全文 lays the groups out inline with no ⋯',
      f.groups.length >= 1 && f.groups.every((g) => g.display === 'block' && g.h <= Math.ceil(2 * g.line) + 1 && g.dim < 0.5 && (g.clip === '1') === g.more) && f.groups.some((g) => g.more) && f.opened?.expanded === 'true' && f.opened.h > Math.ceil(2 * f.opened.line) + 1 &&
        f.text === c.ja && full.text === c.ja && full.groups.every((g) => g.display === 'contents' && !g.more && g.dim === 1),
      JSON.stringify({ focus: f.groups, opened: f.opened, full: full.groups.map((g) => [g.side, g.display, g.more]) }),
    );
  }

  // 5) a fold row is never cut by the pinned bar at the resting position (scroll-top when everything fits),
  // and the last fold (出典) scrolls clear of it — MCD new, seen, unmatched and 字 backs, and the sentence deck
  {
    const seen = [];
    for (const [label, q, deck, opts] of [
      ['MCD new (全文)', '?deck=mcd', 'kotoba-mcd', {}],
      ['MCD seen (焦点)', '?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0 }, state: ledger('kotoba-mcd', 'km-064-m01') }],
      ['MCD unmatched', '?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0 }, state: ledger('kotoba-mcd', 'km-109-m05') }],
      ['MCD 字 (穴埋め)', '?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0, mode: 'self' }, state: ledger('kotoba-mcd', 'km-064-m02') }],
      ['文', '?deck=kotoba', 'kotoba-mine', {}],
    ]) {
      const o = await open(q, deck, opts);
      await o.page.click('#kp-reveal');
      await o.page.waitForSelector('.kp-grade');
      await o.page.evaluate(RESTING);
      const rest = await o.page.evaluate(AT_REST);
      await o.page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
      const end = await o.page.evaluate(`(() => { const b = document.querySelector('.kp-grades').getBoundingClientRect(); const s = document.querySelector('#kp-card .kp-f-src > summary').getBoundingClientRect(); return { src: Math.round(s.bottom), bar: Math.round(b.top) }; })()`);
      seen.push({ label, card: await cardId(o.page), ...rest, end });
      await close(o);
    }
    check(
      '5) at the resting position after the reveal no fold row is cut by the pinned bar (each wholly above it or wholly below), the word and definition are above it, and the last fold (出典) scrolls clear of it',
      seen.every((x) => x.cut === 0 && x.term <= x.bar && x.def <= x.bar && x.end.src <= x.end.bar),
      JSON.stringify(seen.map(({ label, card, y, cut, end }) => ({ label, card, y, cut, src: end.src, bar: end.bar }))),
    );
  }

  // 5, A39) the standalone study pages have no host header, so the study top bar (× n/N 削除)
  // pins itself: after the reveal it stays on screen on a short passage (km-064-m01, due) and on a
  // word's long contract-v2 first passage (A49) alike, and tier one rests between it and the bar.
  {
    const release = await startServer(resolve(REPO_DIR, 'decks/kotoba-mine/release'));
    const seen = [];
    try {
      for (const [page, deck, state, short] of [
        ['study-mcd.html', 'kotoba-mcd', ledger('kotoba-mcd', 'km-064-m01'), true],
        ['study-mcd.html', 'kotoba-mcd', null, false],
        ['study.html', 'kotoba-mine', null, true],
      ]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const prefs = JSON.stringify(state ? { look: 'ai', newPerDay: 0 } : { look: 'ai' });
        await context.addInitScript(`try { localStorage.setItem('bunki-cloze:prefs:v3:${deck}', ${JSON.stringify(prefs)});
          ${state ? `localStorage.setItem('bunki-cloze:${deck}', ${JSON.stringify(state)});` : ''} } catch {}`);
        const p = await context.newPage();
        await p.goto(`${release.base}/${page}`, { waitUntil: 'load' });
        await p.waitForSelector('#kp-start', { timeout: 30000 });
        await p.click('#kp-start');
        await p.waitForSelector('#kp-card');
        const card = await p.evaluate(`document.getElementById('kp-card').dataset.card`);
        await p.click('#kp-reveal');
        await p.waitForSelector('.kp-grade');
        await p.evaluate(RESTING);
        const rest = await p.evaluate(AT_REST);
        const top = await p.evaluate(`(() => { const h = document.querySelector('.kp-top-study').getBoundingClientRect(); return { head: Math.round(h.top), headBottom: Math.round(h.bottom), termTop: Math.round(document.querySelector('#kp-card .kp-term').getBoundingClientRect().top) }; })()`);
        seen.push({ page, card, short, ...top, ...rest });
        await context.close();
      }
    } finally {
      release.server.close();
    }
    check(
      '5, A39) standalone study pages (no host header): the study top bar pins itself, so at rest after the reveal it is on screen (its top ≥ 0) on a short passage and on a long contract-v2 first passage alike, and the word and definition sit between it and the pinned grade bar',
      seen.length === 3 && seen.every((x) => x.head >= 0 && x.termTop >= x.headBottom && x.term <= x.bar && x.def <= x.bar) && seen[0].card === 'km-064-m01' && index.get(seen[1].card)?.c.register,
      JSON.stringify(seen),
    );
  }

  // e) the longest passage at the top of the page: the grade bar is on screen; the source fold scrolls clear of it
  {
    const o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0 }, state: ledger('kotoba-mcd', 'km-298-m02') });
    const id = await cardId(o.page);
    await o.page.click('#kp-reveal');
    await o.page.waitForSelector('.kp-grade');
    await o.page.evaluate(RESTING);
    await o.page.evaluate('window.scrollTo({ top: 0, behavior: "instant" })');
    const top = await o.page.evaluate(`(() => { const b = document.querySelector('.kp-grades').getBoundingClientRect(); const g = document.getElementById('kp-grade-again').getBoundingClientRect(); const t = document.getElementById('primary-tabs')?.getBoundingClientRect(); const tabs = t?.height > 0 ? t : null; return { bottom: Math.round(b.bottom), expectedBottom: Math.round(tabs?.top ?? innerHeight), tabsBottom: tabs ? Math.round(tabs.bottom) : null, viewport: innerHeight, noOverlap: b.bottom <= (tabs?.top ?? innerHeight), inView: g.top >= 0 && g.bottom <= innerHeight, hit: !!document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2)?.closest('#kp-grade-again') }; })()`);
    await o.page.evaluate('window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })');
    const end = await o.page.evaluate(`(() => { const b = document.querySelector('.kp-grades').getBoundingClientRect(); const s = document.querySelector('#kp-card .kp-f-src > summary').getBoundingClientRect(); return { src: Math.round(s.bottom), bar: Math.round(b.top) }; })()`);
    const z = await o.page.evaluate(`document.getElementById('kp-card').dataset.zoom`);
    check('e) the longest passage (195 characters): the grade bar is on screen at the top of the page and the 出典 fold scrolls clear of it; a card seen before opens in 焦点', id === 'km-298-m02' && top.bottom === top.expectedBottom && top.viewport === 844 && (top.tabsBottom === null || top.tabsBottom === 844) && top.noOverlap && top.inView && top.hit && end.src <= end.bar && z === 'focus', JSON.stringify({ id, top, end, zoom: z }));
    await close(o);
  }

  // 6) 「タップして答えを見る」 (and 「意味を思い出してからタップ」) and the swipe hint: the first three sittings of a deck, then gone
  {
    const seen = [];
    for (const [q, deck, sittings] of [
      ['?deck=kotoba', 'kotoba-mine', null],
      ['?deck=kotoba', 'kotoba-mine', 2],
      ['?deck=kotoba', 'kotoba-mine', 3],
      ['?deck=mcd', 'kotoba-mcd', 3],
    ]) {
      const o = await open(q, deck, { prefs: sittings == null ? null : { sittings } });
      const front = await o.page.evaluate(`document.querySelector('#kp-card .kp-taphint')?.textContent ?? null`);
      await o.page.click('#kp-reveal');
      await o.page.waitForSelector('.kp-grade');
      const swipe = await o.page.evaluate(`!!document.querySelector('.kp-swipehint')`);
      const stored = await o.page.evaluate(`JSON.parse(localStorage.getItem('bunki-cloze:prefs:v3:${deck}') || '{}').sittings`);
      seen.push({ deck, before: sittings ?? 0, stored, front, swipe });
      await close(o);
    }
    const [first, third, fourth, mcdFourth] = seen;
    check(
      '6) each sitting counts (prefs.sittings); the tap hint shows in the first three sittings of a deck and is gone from the fourth, on both decks; the swipe hint shows on the first back of the first sitting only',
      first.stored === 1 && first.front === 'Recall the meaning, then tap' && first.swipe && third.stored === 3 && !!third.front && !third.swipe && fourth.stored === 4 && fourth.front === null && !fourth.swipe && mcdFourth.stored === 4 && mcdFourth.front === null && !mcdFourth.swipe,
      JSON.stringify(seen),
    );
  }

  // 2) 読んで思い出す leaves a due 字 card out of the queue without suspending it; 穴埋め brings it back
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(SEEDED);
    await context.addInitScript(`try { if (!sessionStorage.getItem('__ji_seeded')) { sessionStorage.setItem('__ji_seeded', '1');
      localStorage.setItem('bunki-cloze:prefs:v3:kotoba-mcd', ${JSON.stringify(JSON.stringify({ newPerDay: 0 }))});
      localStorage.setItem('bunki-cloze:kotoba-mcd', ${JSON.stringify(ledger('kotoba-mcd', 'km-064-m02'))}); } } catch {}`);
    const page = await context.newPage();
    try {
      await page.goto(`${base}/index.html?deck=mcd`, { waitUntil: 'load' });
      await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
      await page.waitForSelector('#kp-start', { timeout: 15000 });
      const read = await page.evaluate(`({ start: document.getElementById('kp-start').textContent, disabled: document.getElementById('kp-start').disabled, mode: document.querySelector('[data-pref="mode:read"]')?.getAttribute('aria-checked') ?? null })`);
      await page.click('#kp-to-settings');
      const modeRead = await page.evaluate(`document.querySelector('[data-pref="mode:read"]').getAttribute('aria-checked')`);
      await page.click('[data-pref="mode:self"]');
      await page.click('.kp-top .kp-icon');
      await page.waitForSelector('#kp-start');
      const self = await page.evaluate(`document.getElementById('kp-start').textContent`);
      await page.click('#kp-start');
      await page.waitForSelector('#kp-card');
      const shown = await page.evaluate(`({ id: document.getElementById('kp-card').dataset.card, blank: document.querySelector('#kp-card .kp-blank')?.textContent ?? null })`);
      const l = await page.evaluate(`JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mcd'))`);
      check(
        '2) 読んで思い出す (the MCD default) leaves a due 字 card out of the queue — nothing suspended, its record kept; choosing 穴埋め brings it back, blanked with its reading',
        read.disabled && read.start === 'Done for today' && modeRead === 'true' && self === 'Begin — 1 card' && shown.id === 'km-064-m02' && shown.blank === '〔ざい〕' && !Object.keys(l.suspended ?? {}).length && l.cards['km-064-m02']?.stability === 20,
        JSON.stringify({ read, modeRead, self, shown, suspended: l.suspended ?? {} }),
      );
    } finally {
      await context.close();
    }
  }

  // c) a 字 card opens 漢字の形と意味; the sentence deck: 英訳 is its one sentence, no zoom, 英語 open when 設定 says always
  {
    const o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0, mode: 'self' }, state: ledger('kotoba-mcd', 'km-064-m02') });
    await o.page.click('#kp-reveal');
    await o.page.waitForSelector('.kp-grade');
    const b = await o.page.evaluate(BACK);
    check('c) on a 字 card 漢字の形と意味 is open by default', b.kanji?.open === true && inOrder(b.summaries), JSON.stringify({ summaries: b.summaries, kanji: b.kanji?.open }));
    await close(o);
  }
  {
    const o = await open('?deck=kotoba', 'kotoba-mine', { prefs: { gloss: 'show' } });
    const { c, w } = index.get(await cardId(o.page));
    await o.page.click('#kp-reveal');
    await o.page.waitForSelector('.kp-grade');
    const b = await o.page.evaluate(BACK);
    const z = await o.page.evaluate(`({ zoom: document.querySelectorAll('.kp-zoom, .kp-s').length, data: document.getElementById('kp-card').dataset.zoom ?? null })`);
    check(
      'c, d, 4, 7) sentence deck: 英語 stays open with 設定 › いつも開いておく, 英訳 is the sentence, the same fold order with 「この語の他の文」 and 出典 (site, licence, no passage number) last, and no zoom',
      b.gloss?.open === true && b.gloss.text.startsWith(w.meaning) && b.en?.text === c.en && inOrder(b.summaries) && b.order.at(-1) === 'kp-folds' && b.summaries.at(-1) === 'Source' &&
        (w.cards.length > 1 ? b.others?.summary === `Other sentences for this word (${w.cards.length - 1})` : !b.others) && b.src?.text.includes(c.src.site) && b.src.text.includes(c.src.licence) && !/(?:文章|Passage )\d/.test(b.src.text) && z.zoom === 0 && z.data === null && !b.bare,
      JSON.stringify({ card: c.id, summaries: b.summaries, gloss: b.gloss?.open, src: b.src?.text, zoom: z }),
    );
    await close(o);
  }

  // c) 類語 only with entries and only in review state (the entry is injected: sem.json has none for these words yet)
  {
    const seen = [];
    for (const [label, opts] of [
      ['new', { sem: true }],
      ['learning', { sem: true, prefs: { newPerDay: 0 }, state: ledger('kotoba-mcd', 'km-064-m01', 1) }],
      ['review', { sem: true, prefs: { newPerDay: 0 }, state: ledger('kotoba-mcd', 'km-064-m01', 2) }],
      ['review, no entries', { prefs: { newPerDay: 0 }, state: ledger('kotoba-mcd', 'km-064-m01', 2) }],
    ]) {
      const o = await open('?deck=mcd', 'kotoba-mcd', opts);
      const id = await cardId(o.page);
      await o.page.click('#kp-reveal');
      await o.page.waitForSelector('.kp-grade');
      const b = await o.page.evaluate(BACK);
      seen.push({ label, id, sem: !!b.sem, closed: b.sem ? !b.sem.open : null, text: b.sem?.text ?? '', order: inOrder(b.summaries), zoom: await o.page.evaluate(`document.getElementById('kp-card').dataset.zoom`) });
      await close(o);
    }
    const [fresh, learning, review, none] = seen;
    check(
      'c) 類語 appears only when the word has entries and the card is in review state (closed, after 漢字), never on a new or learning card; a card in review opens 焦点',
      // the new card is the word's first passage (a contract-v2 one since A49), the others km-064-m01
      seen.every((x) => x.id === (x === fresh ? index.get(x.id)?.w.cards[0].id : 'km-064-m01') && x.order) && index.get(fresh.id)?.w.id === 'km-064' && !fresh.sem && !learning.sem && review.sem && review.closed && review.text.includes('家計') && !none.sem && fresh.zoom === 'full' && review.zoom === 'focus',
      JSON.stringify(seen.map(({ label, id, sem, zoom }) => ({ label, id, sem, zoom }))),
    );
  }
}

/* ------------------------- the review loop (CARD_CONTRACT_V2 §3.7, §4): delete, leech ladder, kanji family */
const ENGINE_PATH = resolve(CORRIDOR_DIR, 'decks/player/engine.js');
/** the kanji family as data: the player reads kanji[].r (the kanji's reading in the word) for 読 */
function familyOf(deck, word, learned) {
  return (word.kanji || [])
    .map((k) => {
      const same = deck.words.filter((w) => w.id !== word.id && learned(w) && w.kanji.some((j) => j.c === k.c));
      const read = deck.words.filter((w) => w.id !== word.id && learned(w) && !same.includes(w) && k.r && w.kanji.some((j) => j.r === k.r && j.c !== k.c));
      return { c: k.c, same: same.map((w) => w.term), read: read.map((w) => w.term) };
    })
    .filter((r) => r.same.length || r.read.length);
}
async function verifyReviewData(decks) {
  const engine = readFileSync(ENGINE_PATH, 'utf8');
  // a card deleted on its first showing (no record) never holds its word: the next passage is the first
  {
    const { buildQueue, emptyState } = await import(pathToFileURL(ENGINE_PATH).href);
    const now = new Date('2026-10-04T09:00:00Z');
    const culled = (d, ids) => ({ ...emptyState(d.id), suspended: Object.fromEntries(ids.map((id) => [id, { at: now.toISOString(), by: 'delete' }])) });
    const freshOf = (d, wordId, ids) => buildQueue({ ...d, words: d.words.filter((w) => w.id === wordId) }, culled(d, ids), now, 5).fresh;
    const [mcd, mine] = decks;
    // km-064 opens on its three contract-v2 passages (m06–m08, A49); m01 is the first older one,
    // with the 字 cards m02 and m03, then m04
    const v2 = ['km-064-m06', 'km-064-m07', 'km-064-m08'];
    const got = {
      mcd: freshOf(mcd, 'km-064', ['km-064-m06']),
      mcdOrigin: freshOf(mcd, 'km-064', [...v2, 'km-064-m01']),
      mcdKanji: freshOf(mcd, 'km-064', ['km-064-m02']),
      mine: freshOf(mine, 'km-064', ['km-064-1']),
    };
    check(
      'a) 削除 on a card never shown does not hold the word: the next passage (not that passage\'s 字 cards) becomes its first; deleting a 字 card leaves its passage first',
      mcd.words.find((w) => w.id === 'km-064').cards.slice(0, 4).map((c) => c.id).join() === [...v2, 'km-064-m01'].join() &&
        got.mcd.join() === 'km-064-m07' && got.mcdOrigin.join() === 'km-064-m04' && got.mcdKanji.join() === 'km-064-m06' && got.mine.join() === 'km-064-2',
      JSON.stringify(got),
    );
  }
  // 2) 読んで思い出す leaves every 字 card out of the queue (due and new) and touches none of them
  {
    const { buildQueue, emptyState, skipFor } = await import(pathToFileURL(ENGINE_PATH).href);
    const now = new Date('2026-10-04T09:00:00Z');
    const [mcd] = decks;
    const ji = mcd.words.flatMap((w) => w.cards.filter((c) => c.type === 'kanji').map((c) => c.id));
    const rec = { due: '2020-01-01T00:00:00.000Z', stability: 20, difficulty: 5, state: 2, reps: 3, lapses: 0, elapsed_days: 20, scheduled_days: 20, last_review: '2026-09-01T00:00:00.000Z', introducedAt: '2026-08-01T00:00:00.000Z' };
    // a 字 card due, and another word's 語 card due
    const state = { ...emptyState(mcd.id), cards: Object.fromEntries([ji[0], 'km-200-m01'].map((id) => [id, rec])) };
    const before = JSON.stringify(state);
    const read = buildQueue(mcd, state, now, 5000, { skip: skipFor('read') });
    const self = buildQueue(mcd, state, now, 5000, { skip: skipFor('self') });
    const isJi = (id) => ji.includes(id);
    check(
      `2) 読んで思い出す leaves all ${ji.length} 字 cards out of the queue (none due, none new) without suspending them; 穴埋め and 4択 keep them (skipFor)`,
      ji.length > 500 && !read.queue.some(isJi) && self.due.filter(isJi).length >= 1 && self.queue.some(isJi) && skipFor('choice') === null && JSON.stringify(state) === before && !state.suspended?.length,
      JSON.stringify({ read: { due: read.due.length, fresh: read.fresh.length, ji: read.queue.filter(isJi).length }, self: { due: self.due.length, ji: self.queue.filter(isJi).length } }),
    );
  }
  const constant = (name) => engine.match(new RegExp(`const ${name} = (\\d+);`))?.[1];
  check(
    'b) the leech threshold is 5 lapses (LEECH_LAPSES, contract §4); the unlock constants are unchanged (14 days, 3 lapses)',
    constant('LEECH_LAPSES') === '5' && constant('UNLOCK_STABILITY_DAYS') === '14' && constant('UNLOCK_AFTER_LAPSES') === '3',
    `LEECH_LAPSES ${constant('LEECH_LAPSES')} · UNLOCK_STABILITY_DAYS ${constant('UNLOCK_STABILITY_DAYS')} · UNLOCK_AFTER_LAPSES ${constant('UNLOCK_AFTER_LAPSES')}`,
  );
  // kanji[].r: kana, and for an all-kanji word whose kanji all have one, they spell the word's reading
  const bad = [];
  let n = 0;
  let all = 0;
  for (const d of decks)
    for (const w of d.words)
      for (const k of w.kanji) {
        all++;
        if (k.r == null) continue;
        n++;
        if (!/^[ぁ-ゖー]+$/.test(k.r)) bad.push(`${w.id} ${k.c} ${k.r}`);
      }
  for (const d of decks)
    for (const w of d.words) {
      const glyphs = [...w.term];
      if (glyphs.every((ch) => KANJI_RE.test(ch) && ch !== '々') && new Set(glyphs).size === glyphs.length && w.kanji.length === glyphs.length && w.kanji.every((k) => k.r) && w.kanji.map((k) => k.r).join('') !== w.reading) bad.push(`${w.id} ${w.term}: ${w.kanji.map((k) => k.r).join('+')} ≠ ${w.reading}`);
    }
  check('c) each kanji of a word carries its reading in that word (kanji[].r, from the kanji table, never guessed): kana only, and together they spell an all-kanji word', bad.length === 0 && n / all > 0.9, bad.slice(0, 3).join(' | ') || `${n / decks.length}/${all / decks.length} kanji per deck`);
  // the Anki back: the same family, over the words before this one in deck order (Anki's new-card order)
  const release = resolve(REPO_DIR, 'decks/kotoba-mine/release');
  const wrong = [];
  let rows = 0;
  for (const d of decks) {
    const tsv = readFileSync(resolve(release, `${d.id}.tsv`), 'utf8').trim().split('\n');
    const cols = tsv[2].replace('#columns:', '').split('\t');
    const byCard = new Map(d.words.flatMap((w, i) => w.cards.map((c) => [c.id, i])));
    for (const line of tsv.slice(3)) {
      const r = line.split('\t');
      const wi = byCard.get(r[0]);
      const field = r[cols.indexOf('Kanji')];
      const got = [...field.matchAll(/<li><b>(.)(?:<small>[^<]*<\/small>)?<\/b>(.*?)<\/li>/g)].map(([, c, body]) => ({ c, same: [...body.matchAll(/<i>同<\/i>([^<]+)/g)].map((m) => m[1]), read: [...body.matchAll(/<i>読<\/i>([^<]+)/g)].map((m) => m[1]) }));
      const want = familyOf(d, d.words[wi], (w) => d.words.indexOf(w) < wi).map((x) => ({ ...x, read: x.read.slice(0, 8) }));
      if (got.length) rows++;
      if (JSON.stringify(got) !== JSON.stringify(want)) wrong.push(`${d.id} ${r[0]}`);
    }
  }
  check('c) parity: the Anki 漢字 fold lists the kanji family (同 / 読) over the words before it in deck order, as the player derives it', wrong.length === 0 && rows > 0, wrong.slice(0, 3).join(' | ') || `${rows} notes with a family`);
}

async function verifyReview(browser, base) {
  const mcdDeck = readJson(DECK_PATH);
  // the card 別の文に替える puts in a leech's place (engine swapTarget): the word's first 語 card of
  // another passage that was never shown — for km-064-m01, its first contract-v2 passage (A49)
  const swapOf = (id) => {
    const w = mcdDeck.words.find((x) => x.cards.some((c) => c.id === id));
    const from = w.cards.find((c) => c.id === id);
    return w.cards.find((c) => c.id !== id && c.type === from.type && c.passage !== from.passage);
  };
  const card = (id, { state = 2, lapses = 0, due = '2020-01-01T00:00:00.000Z' } = {}) => ({ [id]: { due, stability: state === 2 ? 20 : 1, difficulty: 5, state, reps: 6, lapses, elapsed_days: 1, scheduled_days: 1, last_review: '2026-09-01T00:00:00.000Z' } });
  const ledger = (deck, cards, extra = {}) => JSON.stringify({ format: 'bunki-cloze-state', version: 1, deckId: deck, groupsOff: [], log: [], cards: Object.assign({}, ...cards), ...extra });
  const LATER = '2099-01-01T00:00:00.000Z';
  const open = async (q, deck, state, { inject = null, prefs = {} } = {}) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(SEEDED);
    await context.addInitScript(`try { if (!sessionStorage.getItem('__review_seeded')) { sessionStorage.setItem('__review_seeded', '1');
      localStorage.setItem('bunki-cloze:prefs:v3:${deck}', ${JSON.stringify(JSON.stringify({ newPerDay: 0, ruleSeen: true, ...prefs }))});
      localStorage.setItem('bunki-cloze:${deck}', ${JSON.stringify(state)}); } } catch {}`);
    if (inject) {
      await context.route(`**/decks/${deck}/deck.json`, async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        inject(json);
        await route.fulfill({ response, json });
      });
    }
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const boot = async () => {
      await page.goto(`${base}/index.html${q}`, { waitUntil: 'load' });
      await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
      await page.waitForSelector('#kp-start', { timeout: 15000 });
    };
    await boot();
    return { context, page, errors, boot };
  };
  const close = async (o) => {
    if (o.errors.length) check('no page errors in the review loop', false, o.errors.slice(0, 2).join(' | '));
    await o.context.close();
  };
  const read = (page, deck) => page.evaluate(`JSON.parse(localStorage.getItem('bunki-cloze:${deck}'))`);
  const onScreen = (page) => page.evaluate(`({ id: document.getElementById('kp-card')?.dataset.card ?? null, count: document.querySelector('.kp-count')?.textContent ?? null, revealed: !!document.querySelector('.kp-grade'), toast: document.querySelector('.kp-toast')?.textContent ?? null, undo: !!document.getElementById('kp-toast-undo') })`);
  const start = async (page) => {
    await page.click('#kp-start');
    await page.waitForSelector('#kp-card');
  };
  const revealCard = async (page) => {
    await page.click('#kp-reveal');
    await page.waitForSelector('.kp-grade');
  };

  // a) 削除: one tap, out of the sitting and the queue, record untouched; 元に戻す; 設定 › 保留中のカード › 復元
  for (const [q, deck, a, b] of [
    ['?deck=mcd', 'kotoba-mcd', 'km-064-m01', 'km-065-m01'],
    ['?deck=kotoba', 'kotoba-mine', 'km-064-1', 'km-065-1'],
  ]) {
    const o = await open(q, deck, ledger(deck, [card(a, { due: '2020-01-01T00:00:00.000Z' }), card(b, { due: '2020-01-02T00:00:00.000Z' })]));
    try {
      await start(o.page);
      await revealCard(o.page);
      const first = await onScreen(o.page);
      const before = await read(o.page, deck);
      const tools = await o.page.evaluate(`(() => { const d = document.getElementById('kp-delete'); d.scrollIntoView({ block: 'center' }); const r = d.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const at = (dy) => document.elementFromPoint(cx, cy + dy) === d;
        return { inTop: !!d.closest('.kp-top-study') && !d.closest('#kp-card'), lastInTop: d.parentElement.lastElementChild === d, h: Math.round(r.height), reach: at(-21) && at(21), label: d.textContent }; })()`);
      await o.page.click('#kp-delete');
      await o.page.waitForSelector('#kp-toast-undo');
      const gone = await onScreen(o.page);
      const l1 = await read(o.page, deck);
      await o.page.click('#kp-toast-undo');
      await o.page.waitForSelector('.kp-grade');
      const back = await onScreen(o.page);
      const l2 = await read(o.page, deck);
      await o.page.click('#kp-delete');
      await o.page.waitForSelector('#kp-toast-undo');
      await o.boot();
      const home = await o.page.evaluate(`document.getElementById('kp-start').textContent`);
      await o.page.click('#kp-to-settings');
      await o.page.waitForSelector('#kp-suspended');
      const counted = await o.page.evaluate(`document.getElementById('kp-suspended').textContent`);
      await o.page.click('#kp-unsuspend');
      await o.page.waitForSelector('#kp-suspended');
      const after = await o.page.evaluate(`({ text: document.getElementById('kp-suspended').textContent, disabled: document.getElementById('kp-unsuspend').disabled })`);
      const l3 = await read(o.page, deck);
      await o.page.click('.kp-top .kp-icon');
      const homeAfter = await o.page.evaluate(`document.getElementById('kp-start').textContent`);
      const lastRow = l1.repairLog?.at(-1) ?? [];
      check(
        `a) ${deck}: 削除 at the right end of the study top bar (one tap, 44px reach) takes the card out of the sitting at once, keeps its FSRS record and id, and says how to undo; 元に戻す brings it back on screen`,
        tools.inTop && tools.lastInTop && tools.h >= 44 && tools.reach && tools.label === 'Remove' && first.id === a && first.count === '1/2' && gone.id === b && gone.count === '1/1' && gone.undo && /Card removed/.test(gone.toast) &&
          l1.suspended?.[a]?.by === 'delete' && JSON.stringify(l1.cards[a]) === JSON.stringify(before.cards[a]) && lastRow[0] === a && lastRow[1] === 'delete' && !l1.suspended?.[b] &&
          back.id === a && back.revealed && back.count === '1/2' && !l2.suspended?.[a],
        JSON.stringify({ tools, first: first.id, gone, back: back.id, suspended: l1.suspended, row: lastRow.slice(0, 2) }),
      );
      check(
        `a) ${deck}: after a reload the deleted card is not in the queue; 設定 › 保留中のカード counts it and 復元 puts it back (logged), with the record as it was`,
        /1 cards/.test(home) && /^1 cards \(Remove 1\)$/.test(counted) && after.text === 'None' && after.disabled && Object.keys(l3.suspended).length === 0 && l3.repairLog.at(-1)[1] === 'restore' && l3.repairLog.at(-1)[0] === a && JSON.stringify(l3.cards[a]) === JSON.stringify(before.cards[a]) && /2 cards/.test(homeAfter),
        JSON.stringify({ home, counted, after, homeAfter }),
      );
    } finally {
      await close(o);
    }
  }

  // b) the leech ladder: on a card with 5 lapses, in order; not on 4
  {
    const o = await open('?deck=mcd', 'kotoba-mcd', ledger('kotoba-mcd', [card('km-064-m01', { lapses: 5 }), card('km-065-m01', { lapses: 4, due: '2020-01-02T00:00:00.000Z' })]));
    try {
      await start(o.page);
      await revealCard(o.page);
      const ladder = await o.page.evaluate(`(() => { const l = document.getElementById('kp-ladder'); if (!l) return null; const steps = [...l.querySelectorAll('.kp-ladder-step')];
        return { head: l.querySelector('.kp-ladder-head').textContent, steps: steps.map((b) => b.dataset.step), labels: steps.map((b) => b.querySelector('b').textContent), enabled: steps.map((b) => !b.disabled), swapTo: steps[0].querySelector('small').textContent, hint: steps[1].querySelector('small').textContent,
          afterTierOne: !!l.previousElementSibling?.matches('.kp-def, .kp-note'), beforeFolds: !!l.nextElementSibling?.matches('.kp-folds'), inAnswer: l.parentElement.classList.contains('kp-answer'), keep: !!document.getElementById('kp-ladder-keep') }; })()`);
      // tier one stays on the first screen with the ladder shown (learning-design L0 + L1 + grade bar at 390×844)
      const firstScreen = await o.page.evaluate(`(() => { const box = (s) => document.querySelector(s).getBoundingClientRect(); const t = box('.kp-term'), d = box('.kp-def'), g = box('.kp-grades');
        return { vh: innerHeight, scrollY: Math.round(scrollY), term: [Math.round(t.top), Math.round(t.bottom)], def: [Math.round(d.top), Math.round(d.bottom)], bar: Math.round(g.top) }; })()`);
      await o.page.click('#kp-ladder-hint');
      await o.page.waitForSelector('.kp-grade');
      const hinted = { ladder: await o.page.locator('#kp-ladder').count(), ledger: await read(o.page, 'kotoba-mcd') };
      await o.page.click('#kp-grade-good');
      await o.page.waitForSelector('#kp-card');
      const second = await onScreen(o.page);
      await revealCard(o.page);
      const noLadder = await o.page.locator('#kp-ladder').count();
      check(
        'b) a card with 5 lapses shows the repair ladder after tier one (the definition or usage note) and before the folds, in order 別の文に替える → ヒントを付ける → 保留 (and このまま続ける); a card with 4 does not',
        ladder && ladder.head === 'Difficulty on this sentence: 5 times' && ladder.steps.join() === 'swap,hint,suspend' && ladder.labels.join('/') === 'Use another sentence/Add a hint/Pause' && ladder.enabled.every(Boolean) && ladder.swapTo.startsWith(`Passage ${swapOf('km-064-m01').passage} `) && ladder.afterTierOne && ladder.beforeFolds && ladder.inAnswer && ladder.keep && second.id === 'km-065-m01' && noLadder === 0,
        JSON.stringify({ ladder, second: second.id, noLadder }),
      );
      check(
        'b) with the ladder shown on km-064-m01 at 390×844, the revealed word (.kp-term) and its definition sit inside the first screen, above the grade bar, with no scroll',
        firstScreen.scrollY === 0 && firstScreen.vh === 844 && firstScreen.term[0] >= 0 && firstScreen.term[1] <= firstScreen.bar && firstScreen.def[1] <= firstScreen.bar,
        JSON.stringify(firstScreen),
      );
      const r = hinted.ledger.repairs?.['km-064-m01'];
      check(
        'b) ヒントを付ける: one tap stores the hint for this card in the ledger (repairs, logged), the ladder closes, and the card is still graded as usual',
        hinted.ladder === 0 && r?.hint === 'ざ○○○' && r.lapses === 5 && hinted.ledger.repairLog.at(-1).join('|').startsWith('km-064-m01|hint|') && hinted.ledger.log.length === 0 && second.id === 'km-065-m01',
        JSON.stringify({ repairs: hinted.ledger.repairs, row: hinted.ledger.repairLog.at(-1) }),
      );
    } finally {
      await close(o);
    }
  }
  {
    // the hint on the front of that card only, after a reload
    const o = await open('?deck=mcd', 'kotoba-mcd', ledger('kotoba-mcd', [card('km-064-m01', { lapses: 5 }), card('km-065-m01', { due: '2020-01-02T00:00:00.000Z' })], { repairs: { 'km-064-m01': { at: '2026-10-01T00:00:00.000Z', lapses: 5, hint: 'ざ○○○' } } }));
    try {
      await start(o.page);
      const f1 = await o.page.evaluate(`({ id: document.getElementById('kp-card').dataset.card, repaired: document.getElementById('kp-card').dataset.repaired ?? null, hint: document.querySelector('#kp-card .kp-rhint')?.textContent ?? null })`);
      await revealCard(o.page);
      const b1 = await o.page.evaluate(`({ rhint: document.querySelectorAll('#kp-card .kp-rhint').length, ladder: !!document.getElementById('kp-ladder') })`);
      await o.page.click('#kp-grade-good');
      await o.page.waitForSelector('#kp-card');
      const f2 = await o.page.evaluate(`({ id: document.getElementById('kp-card').dataset.card, repaired: document.getElementById('kp-card').dataset.repaired ?? null, hint: document.querySelectorAll('#kp-card .kp-rhint').length })`);
      check(
        'b) the hint shows on the front of the repaired card only (marked data-repaired, gone after the reveal); the next card has none; no ladder until it lapses again',
        f1.id === 'km-064-m01' && f1.repaired === 'hint' && f1.hint === 'Hintざ○○○' && b1.rhint === 0 && !b1.ladder && f2.id === 'km-065-m01' && f2.repaired === null && f2.hint === 0,
        JSON.stringify({ f1, b1, f2 }),
      );
    } finally {
      await close(o);
    }
  }
  {
    // 別の文に替える: the next unseen passage of the word takes the card's place, due now (also after a reload)
    const o = await open('?deck=mcd', 'kotoba-mcd', ledger('kotoba-mcd', [card('km-064-m01', { lapses: 5 }), card('km-065-m01', { due: LATER })]));
    try {
      await start(o.page);
      await revealCard(o.page);
      const before = await read(o.page, 'kotoba-mcd');
      await o.page.click('#kp-ladder-swap');
      await o.page.waitForSelector('#kp-reveal');
      const now = await onScreen(o.page);
      const l = await read(o.page, 'kotoba-mcd');
      await o.boot();
      await start(o.page);
      const reloaded = await onScreen(o.page);
      const target = swapOf('km-064-m01');
      check(
        'b) 別の文に替える: one tap suspends the leech (record and the word\'s other progress kept), logs the swap, and puts the word\'s next unseen passage on screen, due at once — still first after a reload',
        now.id === target.id && !now.revealed && now.count === '1/1' && /Changed to another sentence/.test(now.toast) && now.undo && l.suspended['km-064-m01']?.by === 'swap' && l.repairs['km-064-m01']?.swap === target.id && JSON.stringify(l.cards['km-064-m01']) === JSON.stringify(before.cards['km-064-m01']) && !l.cards[target.id] && l.repairLog.at(-1).join('|').startsWith(`km-064-m01|swap|`) && l.repairLog.at(-1)[3] === target.id && reloaded.id === target.id && reloaded.count === '1/1',
        JSON.stringify({ now, reloaded: reloaded.id, target: target.id, suspended: l.suspended, repairs: l.repairs }),
      );
    } finally {
      await close(o);
    }
  }
  {
    // 保留 (sentence deck), and a 字 card that has nothing to swap to
    const o = await open('?deck=kotoba', 'kotoba-mine', ledger('kotoba-mine', [card('km-064-1', { lapses: 6 }), card('km-065-1', { due: '2020-01-02T00:00:00.000Z' })]));
    try {
      await start(o.page);
      await revealCard(o.page);
      const swapTo = await o.page.evaluate(`document.querySelector('#kp-ladder-swap small').textContent`);
      await o.page.click('#kp-ladder-suspend');
      await o.page.waitForSelector('#kp-toast-undo');
      const now = await onScreen(o.page);
      const l = await read(o.page, 'kotoba-mine');
      check(
        'b) 保留 (sentence deck): one tap suspends the leech (by leech, logged as suspend) and the next card comes up; on a sentence card the swap names 例文2',
        swapTo.startsWith('Example 2 ') && now.id === 'km-065-1' && /Card paused/.test(now.toast) && l.suspended['km-064-1']?.by === 'leech' && l.repairLog.at(-1)[1] === 'suspend' && l.repairs['km-064-1']?.lapses === 6,
        JSON.stringify({ swapTo, now, suspended: l.suspended, row: l.repairLog.at(-1) }),
      );
    } finally {
      await close(o);
    }
  }
  {
    const o = await open('?deck=mcd', 'kotoba-mcd', ledger('kotoba-mcd', [card('km-064-m02', { lapses: 5 })]), { prefs: { mode: 'self' } });
    try {
      await start(o.page);
      await revealCard(o.page);
      const ji = await o.page.evaluate(`({ swap: document.getElementById('kp-ladder-swap')?.disabled, why: document.querySelector('#kp-ladder-swap small')?.textContent, hint: document.querySelector('#kp-ladder-hint small')?.textContent })`);
      await o.page.click('#kp-ladder-keep');
      await o.page.waitForSelector('.kp-grade');
      const kept = { ladder: await o.page.locator('#kp-ladder').count(), r: (await read(o.page, 'kotoba-mcd')).repairs['km-064-m02'] };
      check(
        'b) a 字 card has no passage to swap to (step disabled, said so) and its hint is the kanji\'s parts; このまま続ける closes the ladder until the next lapse (logged as keep)',
        ji.swap === true && ji.why === 'No alternative sentence available' && ji.hint === 'Show “貝＋才” on the front' && kept.ladder === 0 && kept.r?.keep === true && kept.r.lapses === 5,
        JSON.stringify({ ji, kept }),
      );
    } finally {
      await close(o);
    }
  }

  // c) the kanji family: the learner's own words only; 同 and 読; a link into 語の一覧 and back
  {
    const state = ledger('kotoba-mcd', [card('km-064-m01'), card('km-188-m01', { due: LATER }), card('km-189-m01', { due: LATER }), card('km-127-m01', { due: LATER })]);
    const o = await open('?deck=mcd', 'kotoba-mcd', state);
    try {
      await start(o.page);
      await revealCard(o.page);
      await o.page.click('.kp-f-kanji > summary');
      const fam = await o.page.evaluate(`[...document.querySelectorAll('#kp-card .kp-f-kanji .kp-kfam > li')].map((li) => ({ c: li.querySelector('.kp-kfam-c').firstChild.textContent, r: li.querySelector('.kp-kfam-c small')?.textContent ?? null,
        same: [...li.querySelectorAll('.kp-fam[data-mark="同"]')].map((b) => b.lastChild.textContent), read: [...li.querySelectorAll('.kp-fam[data-mark="読"]')].map((b) => b.lastChild.textContent) }))`);
      const learnedIds = new Set(Object.keys(JSON.parse(state).cards).map((id) => id.replace(/-m\d+$/, '')));
      const want = familyOf(mcdDeck, mcdDeck.words.find((w) => w.id === 'km-064'), (w) => learnedIds.has(w.id));
      const shape = fam.map(({ c, same, read }) => ({ c, same, read }));
      const famReach = await o.page.evaluate(`(() => { const d = document.querySelector('#kp-card .kp-fam'); d.scrollIntoView({ block: 'center' }); const r = d.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; return document.elementFromPoint(cx, cy - 21) === d && document.elementFromPoint(cx, cy + 21) === d; })()`);
      await o.page.click('#kp-card .kp-fam[data-word="km-188"]');
      await o.page.waitForSelector('.kp-row.is-open');
      const list = await o.page.evaluate(`({ title: document.querySelector('.kp-title')?.textContent, open: document.querySelector('.kp-row.is-open')?.dataset.word, detail: !!document.querySelector('.kp-detail') })`);
      await o.page.click('.kp-top .kp-icon');
      await o.page.waitForSelector('#kp-card');
      const back = await onScreen(o.page);
      check(
        'c) 漢字の形と意味 lists the learner\'s own words sharing a kanji (同 財閥) or a kanji reading (読 制圧 for せい, 自由自在 for ざい), with the reading, each a 44px link; words not met yet (財物, 起爆剤…) are left out',
        JSON.stringify(shape) === JSON.stringify(want) && JSON.stringify(shape) === JSON.stringify([{ c: '財', same: ['財閥'], read: ['自由自在'] }, { c: '政', same: [], read: ['制圧'] }]) && fam[0].r === 'ざい' && fam[1].r === 'せい' && famReach,
        JSON.stringify(fam),
      );
      check('c) each family word opens its row in 語の一覧, and ← returns to the card, still revealed', list.title === 'Word list' && list.open === 'km-188' && list.detail && back.id === 'km-064-m01' && back.revealed, JSON.stringify({ list, back }));
    } finally {
      await close(o);
    }
  }
  {
    // a new learner: no family yet, so the fold holds only the anatomy
    const o = await open('?deck=mcd', 'kotoba-mcd', ledger('kotoba-mcd', [card('km-064-m01')]));
    try {
      await start(o.page);
      await revealCard(o.page);
      const none = await o.page.evaluate(`({ kfam: document.querySelectorAll('#kp-card .kp-kfam').length, tiles: document.querySelectorAll('#kp-card .kp-kj').length, see: !!document.getElementById('kp-see') })`);
      check('c, d) with no other word met, the kanji fold holds the anatomy only; with no see-also or grammar in the deck there is no 参照 line', none.kfam === 0 && none.tiles === 2 && !none.see, JSON.stringify(none));
    } finally {
      await close(o);
    }
  }

  // d) see-also and grammar: one line right after the kanji fold, only when the deck names them
  {
    const o = await open('?deck=mcd', 'kotoba-mcd', ledger('kotoba-mcd', [card('km-064-m01')]), {
      inject: (deck) => {
        const w = deck.words.find((x) => x.id === 'km-064');
        w.seeAlso = ['財閥', '国家予算'];
        w.grammar = [{ id: 'n4-nagara', p: '〜ながら' }];
      },
    });
    try {
      await start(o.page);
      await revealCard(o.page);
      const see = await o.page.evaluate(`(() => { const s = document.getElementById('kp-see'); if (!s) return null; return { prev: s.previousElementSibling?.className, inFolds: s.parentElement.classList.contains('kp-folds'), labels: [...s.querySelectorAll('.kp-see-label')].map((n) => n.textContent),
        links: [...s.querySelectorAll('.kp-see-link')].map((b) => b.dataset.word || 'grammar:' + b.dataset.grammar), items: [...s.querySelectorAll('.kp-see-item')].map((n) => n.textContent) }; })()`);
      // the corridor passes its host adapter, so the grammar point opens the corridor's own grammar sheet
      await o.page.click('#kp-see [data-grammar]');
      await o.page.waitForSelector('#sheet', { timeout: 8000 });
      const sheet = await o.page.evaluate(`({ node: document.querySelector('#sheet')?.dataset.node, head: document.querySelector('#sheet .headword')?.textContent })`);
      await o.page.keyboard.press('Escape');
      await o.page.waitForSelector('#sheet', { state: 'detached', timeout: 8000 });
      await o.page.click('#kp-see .kp-see-link[data-word]');
      await o.page.waitForSelector('.kp-row.is-open');
      const opened = await o.page.evaluate(`document.querySelector('.kp-row.is-open')?.dataset.word`);
      check(
        'd) a see-also and a grammar id in the deck show as one line right after the kanji fold: 参照 links to a deck word (語の一覧) and shows a word outside the deck as text; in the corridor the grammar point opens the corridor’s grammar sheet through the host adapter',
        see && see.inFolds && see.prev === 'kp-fold kp-f-kanji' && see.labels.join() === 'See also,Grammar' && see.links.join() === 'km-188,grammar:n4-nagara' && see.items.join() === '国家予算' && /^grammar:/.test(sheet.node || '') && /ながら/.test(sheet.head || '') && opened === 'km-188',
        JSON.stringify({ see, sheet, opened }),
      );
    } finally {
      await close(o);
    }
  }
}

/* ------------------------- the visual system (CARD_CONTRACT_V2 §9, aesthetics.md) */
const WBIG_PATH = resolve(SOURCE_CORRIDOR_DIR, '../drift/data/wbig.json');
/** the colours the card actually paints, next to the theme tokens they must equal */
const PAINT = `(() => {
  const card = document.getElementById('kp-card');
  const kp = document.querySelector('.kp');
  const probe = document.createElement('i');
  kp.append(probe);
  const tok = (k) => { probe.style.color = 'var(--kp-' + k + ')'; return getComputedStyle(probe).color; };
  const color = (sel) => { const n = card.querySelector(sel) || document.querySelector(sel); return n ? getComputedStyle(n).color : null; };
  const chips = [...card.querySelectorAll('.kp-chips > .kp-chip')];
  const out = {
    look: kp.dataset.look, kind: card.dataset.kind, classes: card.className, topicVar: card.style.getPropertyValue('--kp-topic'),
    edge: getComputedStyle(card).borderLeftColor, kindChip: chips[0]?.textContent, kindChipColor: chips[0] ? getComputedStyle(chips[0]).color : null,
    chips: chips.map((c) => c.textContent), level: card.querySelector('.kp-levelchip')?.textContent ?? null, levelLabel: card.querySelector('.kp-levelchip')?.getAttribute('aria-label') ?? null,
    levelColor: color('.kp-levelchip'), levelBg: card.querySelector('.kp-levelchip') ? getComputedStyle(card.querySelector('.kp-levelchip')).backgroundColor : null,
    state: color('.kp-st-new, .kp-st-learn'), target: color('.kp-target'), targetLine: card.querySelector('.kp-target') ? getComputedStyle(card.querySelector('.kp-target')).textDecorationLine : null,
    term: color('.kp-term'), gloss: color('.kp-gloss'), en: color('.kp-en'), tip: color('.kp-tip'),
    tipBar: card.querySelector('.kp-tip') ? getComputedStyle(card.querySelector('.kp-tip')).borderLeftWidth : null,
    again: color('#kp-grade-again b'), hard: color('#kp-grade-hard b'), good: color('#kp-grade-good b'), easy: color('#kp-grade-easy b'),
    cardTex: getComputedStyle(card).backgroundImage, pageTex: getComputedStyle(kp).backgroundImage,
    tok: Object.fromEntries(['ink', 'ink-2', 'panel-2', 'kind-go', 'kind-ji', 'red', 'green', 'amber', 'blue', 'noun', 'verb', 'adj', 'adv', 'expr', 'sound'].map((k) => [k, tok(k)])),
  };
  probe.style.color = 'var(--kp-panel-2)';
  out.tok['panel-2'] = getComputedStyle(probe).color;
  probe.remove();
  return out;
})()`;
/** every animation and transition under .kp, and every element whose transform is not the identity */
const MOTION = `(() => {
  const kp = document.querySelector('.kp');
  const secs = (v) => Math.max(0, ...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 0.001 : 1)));
  const moving = [];
  let longest = 0;
  for (const n of [kp, ...kp.querySelectorAll('*')]) {
    const cs = getComputedStyle(n);
    const t = secs(cs.transitionDuration);
    const a = cs.animationName !== 'none' ? secs(cs.animationDuration) : 0;
    longest = Math.max(longest, t, a);
    if (cs.transform !== 'none' && cs.transform !== 'matrix(1, 0, 0, 1, 0, 0)') moving.push(n.className || n.tagName);
  }
  return { longest: Math.round(longest * 1000), moving: moving.slice(0, 4), running: document.getAnimations().length };
})()`;
/** records the cards that come and go while a grade is answered */
const WATCH = `(() => {
  window.__kpSeen = [];
  new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.classList?.contains('kp-ghost')) window.__kpSeen.push({ cls: n.className, id: n.id, ids: n.querySelectorAll('[id]').length, hidden: n.getAttribute('aria-hidden'), inert: n.inert }); })
    .observe(document.body, { childList: true, subtree: true });
})()`;

function verifyLevels(decks) {
  const pairs = new Map();
  for (const [w, r, , l] of readJson(WBIG_PATH)) if (Number.isInteger(l)) pairs.set(`${w}|${r}`, new Set([...(pairs.get(`${w}|${r}`) ?? []), l]));
  const bad = [];
  let n = 0;
  for (const d of decks)
    for (const w of d.words) {
      const found = pairs.get(`${w.term}|${w.reading}`);
      const want = found?.size === 1 ? `N${[...found][0]}` : undefined;
      if (w.level !== want) bad.push(`${d.id} ${w.id} ${w.term} ${w.level} ≠ ${want}`);
      if (w.level) n++;
    }
  const named = decks.every((d) => (d.method ?? []).some((line) => line.includes('目安') && line.includes('open-anki-jlpt-decks')));
  check('b) word.level comes from the public list (wbig.json, joined on headword and reading, one level only) and the method names the list as a 目安', bad.length === 0 && n > 0 && named, bad.slice(0, 3).join(' | ') || `${n / decks.length} of ${decks[0].words.length} words levelled per deck`);
}

async function verifyVisual(browser, base) {
  const mcd = readJson(DECK_PATH);
  const sent = readJson(SENTENCE_DECK_PATH);
  verifyLevels([mcd, sent]);
  const { rows, failures: low } = contrastTable();
  check(
    'c) contrast (tools/contrast-kotoba.mjs, read from player.css): passage ≥ 7, body, gloss, muted text, every chip, state, accent and part-of-speech colour ≥ 4.5 in all eight themes',
    low.length === 0,
    low.slice(0, 3).join(' | ') || rows.map((r) => `${r.look} ${Math.min(...Object.values(r).filter((v) => typeof v === 'number'))}`).join(' · '),
  );

  const ji = kindJiTable();
  check(
    `7) the 字 hue (a 字 card's edge and chip) is at least ΔE_ok ${KIND_JI_FLOOR} from every other hue of its theme (washi and sakura no longer share the verb's blue; 墨, 白 and 抹茶 moved off the sound-word pink)`,
    ji.failures.length === 0,
    ji.failures.slice(0, 3).join(' | ') || ji.rows.map((r) => `${r.look} ${r.value} ΔE${r.deltaE} (${r.nearest})`).join(' · '),
  );

  const due = (deck, id) => JSON.stringify({ format: 'bunki-cloze-state', version: 1, deckId: deck, groupsOff: [], log: [], cards: { [id]: { due: '2020-01-01T00:00:00.000Z', stability: 20, difficulty: 5, state: 2, reps: 3, lapses: 0, elapsed_days: 20, scheduled_days: 20 } } });
  const open = async (q, deck, { prefs = null, state = null, reduce = false, start = true } = {}) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(SEEDED);
    await context.addInitScript(`try { if (!sessionStorage.getItem('__vis_seeded')) { sessionStorage.setItem('__vis_seeded', '1');
      ${prefs ? `localStorage.setItem('bunki-cloze:prefs:v3:${deck}', ${JSON.stringify(JSON.stringify(prefs))});` : ''}
      ${state ? `localStorage.setItem('bunki-cloze:${deck}', ${JSON.stringify(state)});` : ''} } } catch {}`);
    const page = await context.newPage();
    if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${base}/index.html${q}`, { waitUntil: 'load' });
    await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
    await page.waitForSelector('#kp-start', { timeout: 15000 });
    if (start) {
      await page.click('#kp-start');
      await page.waitForSelector('#kp-card');
    }
    return { context, page, errors };
  };
  const close = async (o) => {
    if (o.errors.length) check('no page errors in the visual checks', false, o.errors.slice(0, 2).join(' | '));
    await o.context.close();
  };
  const reveal = async (page) => {
    await page.click('#kp-reveal');
    await page.waitForSelector('.kp-grade');
  };

  // a) the home and 設定: no tips panel, no topic hue; the method moved to 設定
  {
    const o = await open('?deck=mcd', 'kotoba-mcd', { start: false });
    const home = await o.page.evaluate(`({ tips: document.querySelectorAll('#kp-tips, .kp-tips').length, method: document.querySelectorAll('#kp-method').length,
      topic: [...document.querySelectorAll('.kp-group')].filter((g) => g.style.getPropertyValue('--kp-topic') || parseFloat(getComputedStyle(g).borderLeftWidth) > 1).length })`);
    await o.page.click('#kp-to-settings');
    await o.page.waitForSelector('#kp-backup');
    const set = await o.page.evaluate(`(() => { const m = document.querySelector('.kp-settings #kp-method'); return { method: !!m, summary: m?.querySelector('summary')?.textContent, lines: m ? m.querySelectorAll('p').length : 0, groups: document.querySelectorAll('.kp-settings [role="radiogroup"]').length }; })()`);
    check(
      'a) the deck home has no 見て覚えるコツ panel, no method panel and no topic hue on its rows; このデッキのしくみ sits in 設定 with every line of the method',
      home.tips === 0 && home.method === 0 && home.topic === 0 && set.method && set.summary === 'How this deck works' && set.lines === mcd.method.length && set.groups === 4,
      JSON.stringify({ home, set }),
    );
    await close(o);
  }

  // b) a new MCD 語 card with a level (財政 N1), front and back, in 墨 and 白
  for (const look of ['dark', 'light']) {
    const o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { look } });
    const front = await o.page.evaluate(PAINT);
    await reveal(o.page);
    await o.page.evaluate(`document.querySelectorAll('#kp-card details').forEach((d) => (d.open = true))`);
    const back = await o.page.evaluate(PAINT);
    const t = back.tok;
    const w = mcd.words.find((x) => x.id === 'km-064');
    check(
      `a, b) ${look}: the 語 card's edge and first chip are the 語 colour (no level 1–3 edge, no topic hue), the target and term its noun colour and underlined, 初めて in ink-2, the level chip N1 monochrome with its 目安 label`,
      front.kind === 'go' && !/kp-lv\d|kp-topic/.test(front.classes) && !front.topicVar && front.edge === t['kind-go'] && front.kindChip === 'Word' && front.kindChipColor === t['kind-go'] &&
        back.target === t.noun && back.targetLine.includes('underline') && back.term === t.noun && front.state === t['ink-2'] &&
        w.level === 'N1' && front.level === 'N1' && front.levelLabel === 'N1 equivalent (estimated from public lists)' && front.levelColor === t['ink-2'] && front.levelBg === t['panel-2'],
      JSON.stringify({ kind: front.kind, edge: front.edge, chip: front.kindChipColor, target: back.target, state: front.state, level: front.level, chips: front.chips }),
    );
    check(
      `b) ${look}: English is never coloured (gloss, 英訳 and the note in ink-2, no amber bar on the note); the four grades are red, amber, green and blue`,
      back.gloss === t['ink-2'] && back.en === t['ink-2'] && back.tip === t['ink-2'] && back.tipBar === '0px' && back.again === t.red && back.hard === t.amber && back.good === t.green && back.easy === t.blue && new Set([t.red, t.amber, t.green, t.blue]).size === 4,
      JSON.stringify({ gloss: back.gloss, en: back.en, tip: back.tip, tipBar: back.tipBar, again: back.again, hard: back.hard, good: back.good, easy: back.easy }),
    );
    await close(o);
  }

  // b) a 字 card: its own edge and chip colour; a word without a level: no level chip; the sentence deck: 語, no "3/1"
  {
    const o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0, look: 'washi', mode: 'self' }, state: due('kotoba-mcd', 'km-064-m02') });
    const ji = await o.page.evaluate(PAINT);
    await close(o);
    const p = await open('?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0 }, state: due('kotoba-mcd', 'km-066-m01') });
    const none = await p.page.evaluate(PAINT);
    await close(p);
    const q = await open('?deck=kotoba', 'kotoba-mine');
    const s = await q.page.evaluate(PAINT);
    await close(q);
    check(
      'b) 字 card: edge and chip in the 字 colour; a word with no level (利回り) has no level chip; the sentence deck says 語 and its source, never a "3/1" count',
      ji.kind === 'ji' && ji.kindChip === 'Kanji' && ji.edge === ji.tok['kind-ji'] && ji.kindChipColor === ji.tok['kind-ji'] && ji.edge !== ji.tok['kind-go'] && ji.state === ji.tok.amber &&
        none.level === null && !none.chips.some((c) => /^N\d$/.test(c)) && s.kindChip === 'Word' && s.edge === s.tok['kind-go'] && !s.chips.some((c) => /\d+\/\d+/.test(c)) && s.level === 'N1',
      JSON.stringify({ ji: [ji.kind, ji.kindChip, ji.edge], none: none.chips, sentence: s.chips }),
    );
  }

  // b) one hue on the asked word: the reading over a verb target takes the target's part-of-speech colour, not the accent (Anki parity: .sentence rt sets only opacity)
  {
    const seen = [];
    for (const look of ['dark', 'washi']) {
      const o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0, look }, state: due('kotoba-mcd', 'km-200-m01') });
      await reveal(o.page);
      const v = await o.page.evaluate(`(() => { const card = document.getElementById('kp-card'); const t = card.querySelector('.kp-target'); const rts = t ? [...t.querySelectorAll('rt')] : [];
        const kp = document.querySelector('.kp'); const probe = document.createElement('i'); kp.append(probe); const tok = (k) => { probe.style.color = 'var(--kp-' + k + ')'; return getComputedStyle(probe).color; };
        const out = { id: card.dataset.card, pos: card.className, target: t ? getComputedStyle(t).color : null, rt: rts.map((r) => getComputedStyle(r).color), verb: tok('verb'), accent: tok('cyan') }; probe.remove(); return out; })()`);
      seen.push({ look, ...v });
      await close(o);
    }
    check(
      'b) 墨 and 和紙, verb card km-200-m01 (追い上げる): the reading over the target is the target\'s own verb colour, never the accent',
      seen.every((v) => v.id === 'km-200-m01' && /kp-pos-verb/.test(v.pos) && v.target === v.verb && v.rt.length > 0 && v.rt.every((c) => c === v.target) && v.target !== v.accent),
      JSON.stringify(seen.map(({ look, target, rt, accent }) => ({ look, target, rt: [...new Set(rt)], accent }))),
    );
  }

  // b) Anki: the level chip comes from the note's level::Nx tag through {{Tags}}; a note without the tag shows none
  {
    const tools = resolve(REPO_DIR, 'decks/kotoba-mine/tools');
    const seen = [];
    for (const dir of ['anki', 'anki-sentence']) {
      const css = readFileSync(resolve(tools, dir, 'style.css'), 'utf8');
      const front = readFileSync(resolve(tools, dir, 'front.html'), 'utf8');
      const fill = (tags) => front.replace(/\{\{#\w+\}\}[\s\S]*?\{\{\/\w+\}\}/g, '').replace('{{Tags}}', tags).replace(/\{\{[^}]+\}\}/g, 'x');
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.setContent(`<style>${css}</style><div class="card">${fill('kotoba-mcd card1 source::news level::N1')}${fill('kotoba-mcd card1 source::news')}</div>`);
      const chips = await page.evaluate(`[...document.querySelectorAll('.levelchip')].map((c) => ({ display: getComputedStyle(c).display, label: getComputedStyle(c, '::after').content }))`);
      seen.push({ dir, chips });
      await context.close();
    }
    check(
      'b) Anki (both note types): a note tagged level::N1 shows an N1 chip in the chip row, a note without a level tag shows none; no new field',
      seen.every(({ chips }) => chips.length === 2 && chips[0].display !== 'none' && chips[0].label === '"N1"' && chips[1].display === 'none'),
      JSON.stringify(seen),
    );
  }

  // d) textures: on the page, never on the card (和紙 paper, 黒板 chalk)
  {
    const seen = [];
    for (const look of ['washi', 'kokuban', 'sakura']) {
      const o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { look } });
      await reveal(o.page);
      const v = await o.page.evaluate(PAINT);
      seen.push({ look, card: v.cardTex, page: v.pageTex !== 'none' });
      await close(o);
    }
    check('d) 和紙, 黒板 and 桜 paint their texture on the page; the card under the ruby is plain', seen.every((x) => x.card === 'none' && x.page), JSON.stringify(seen));
  }

  // e) the reveal keeps the card; the answer fades in within 180 ms; a grade slides the card out its way
  {
    const o = await open('?deck=mcd', 'kotoba-mcd');
    await o.page.evaluate(`window.__kpNodes = { card: document.getElementById('kp-card'), study: document.querySelector('.kp-study'), top: document.querySelector('.kp-top'), chips: document.querySelector('#kp-card .kp-chips') }`);
    await o.page.click('#kp-reveal');
    const kept = await o.page.evaluate(`(() => { const n = window.__kpNodes; const a = document.querySelector('#kp-card .kp-answer'); const cs = getComputedStyle(a); const rt = document.querySelector('#kp-card rt');
      return { card: document.getElementById('kp-card') === n.card, study: document.querySelector('.kp-study') === n.study, top: document.querySelector('.kp-top') === n.top, chips: document.querySelector('#kp-card .kp-chips') === n.chips,
        cards: document.querySelectorAll('#kp-card').length, reveal: !!document.getElementById('kp-reveal'), grades: document.querySelectorAll('.kp-grade').length,
        answer: cs.animationName, answerMs: parseFloat(cs.animationDuration) * 1000, rt: rt ? getComputedStyle(rt).animationName : null, rtMs: rt ? (parseFloat(getComputedStyle(rt).animationDuration) + parseFloat(getComputedStyle(rt).animationDelay)) * 1000 : null }; })()`);
    const motion = await o.page.evaluate(MOTION);
    check(
      'e) the reveal keeps the card node, its chips and the screen (no rebuild): the readings fade in (140 ms after a 40 ms delay, done by 180 ms) and the answer rises in 120–180 ms, opacity and transform only',
      kept.card && kept.study && kept.top && kept.chips && kept.cards === 1 && !kept.reveal && kept.grades === 4 && kept.answer === 'kp-rise' && kept.answerMs >= 120 && kept.answerMs <= 180 && kept.rt === 'kp-fade' && Math.round(kept.rtMs) <= 180 && motion.longest <= 180,
      JSON.stringify({ ...kept, longest: motion.longest }),
    );
    await o.page.evaluate(WATCH);
    const rail0 = await o.page.evaluate(`getComputedStyle(document.querySelector('.kp-progress i')).getPropertyValue('--kp-frac')`);
    await o.page.click('#kp-grade-good');
    await o.page.waitForSelector('#kp-reveal');
    const after = await o.page.evaluate(`(() => { const i = document.querySelector('.kp-progress i'); const cs = getComputedStyle(i); const total = +document.querySelector('.kp-count').textContent.split('/')[1];
      return { seen: window.__kpSeen, advance: document.querySelector('.kp-study').dataset.advance, arrive: document.getElementById('kp-card').classList.contains('kp-arrive'), cards: document.querySelectorAll('#kp-card').length,
        frac: +i.style.getPropertyValue('--kp-frac'), want: 1 / total, prop: cs.transitionProperty, ms: parseFloat(cs.transitionDuration) * 1000 }; })()`);
    await o.page.waitForTimeout(500);
    const gone = await o.page.evaluate(`document.querySelectorAll('.kp-ghost').length`);
    await reveal(o.page);
    await o.page.evaluate(`window.__kpSeen = []`);
    await o.page.click('#kp-grade-again');
    await o.page.waitForSelector('#kp-reveal');
    const again = await o.page.evaluate(`({ seen: window.__kpSeen, advance: document.querySelector('.kp-study').dataset.advance })`);
    check(
      'e) a grade slides the answered card out its way (正解 right, もう一度 left; an inert copy without ids, gone after the slide) while the next card settles; the rail ticks by transform in 120 ms',
      after.seen.length === 1 && after.seen[0].cls.includes('kp-out-good') && !after.seen[0].id && after.seen[0].ids === 0 && after.seen[0].hidden === 'true' && after.seen[0].inert && after.advance === 'good' && after.arrive && after.cards === 1 && gone === 0 &&
        again.seen.length === 1 && again.seen[0].cls.includes('kp-out-again') && again.advance === 'again' && rail0 === '0' && Math.abs(after.frac - after.want) < 1e-9 && after.prop === 'transform' && after.ms === 120,
      JSON.stringify({ good: after.seen[0]?.cls, again: again.seen[0]?.cls, gone, rail: [rail0, after.frac, after.prop, after.ms] }),
    );
    await close(o);
  }

  // e) prefers-reduced-motion: no transform, no animation, no transition anywhere; swipe does not drag
  {
    const o = await open('?deck=kotoba', 'kotoba-mine', { reduce: true });
    await o.page.evaluate(`window.__kpCard = document.getElementById('kp-card')`);
    await o.page.click('#kp-reveal');
    await o.page.waitForSelector('.kp-grade');
    const still = await o.page.evaluate(`document.getElementById('kp-card') === window.__kpCard`);
    const revealed = await o.page.evaluate(MOTION);
    await o.page.evaluate(WATCH);
    const drag = await o.page.evaluate(`(() => { const n = document.getElementById('kp-card'); const ev = (type, x, y) => n.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 9, bubbles: true }));
      ev('pointerdown', 100, 100); ev('pointermove', 160, 102); const mid = { transform: n.style.transform, swipe: n.dataset.swipe }; ev('pointermove', 230, 104); ev('pointerup', 230, 104); return mid; })()`);
    await o.page.waitForSelector('#kp-reveal');
    const advanced = await o.page.evaluate(`(() => { const i = document.querySelector('.kp-progress i'); return { seen: window.__kpSeen.length, count: document.querySelector('.kp-count').textContent, total: +document.querySelector('.kp-count').textContent.split('/')[1], rail: getComputedStyle(i).transform, width: i.getBoundingClientRect().width, track: i.parentElement.getBoundingClientRect().width,
      arrive: document.getElementById('kp-card').classList.contains('kp-arrive'), log: JSON.parse(localStorage.getItem('bunki-cloze:kotoba-mine') || '{"log":[]}').log.length }; })()`);
    const moved = await o.page.evaluate(MOTION);
    check(
      'e) prefers-reduced-motion (emulateMedia): the reveal keeps the card, nothing animates or transitions, no element is transformed; a swipe marks the edge without dragging and still grades; no slide-out, the rail is a plain width',
      still && revealed.longest === 0 && revealed.moving.length === 0 && revealed.running === 0 && drag.transform === '' && drag.swipe === 'good' && advanced.seen === 0 && !advanced.arrive && advanced.log === 1 && advanced.count.startsWith('2/') &&
        advanced.rail === 'none' && Math.abs(advanced.width - advanced.track / advanced.total) < 1 && moved.longest === 0 && moved.moving.length === 0 && moved.running === 0,
      JSON.stringify({ still, revealed, drag, advanced, moved }),
    );
    await close(o);
  }
}

/* --------------------------------------------------- half two: the app */
async function main() {
  console.log('— 言葉の鉱脈: the deck as data');
  const deck = verifyDeck();
  const sentences = readJson(SENTENCE_DECK_PATH);
  const sc = sentences.words.flatMap((w) => w.cards);
  check('言葉の鉱脈・文 sits beside it: 323 words of real single sentences, each with its source', sentences.id === 'kotoba-mine' && sentences.words.length === 323 && sc.every((c) => !c.type && c.src && c.ruby.filter((g) => g[2] === 1).length === 1), `${sc.length} sentence cards`);
  verifyIds([deck, sentences]);
  verifyLeaks([deck, sentences]);
  verifyRuby([deck, sentences]);
  verifyBackData([deck, sentences]);
  verifyBackParity();
  verifyPilotData(deck);
  verifyFullRunData(deck);
  const said = (d) => (d.method ?? []).join('');
  check('the method text names the same four grades the player shows (もう一度・難しい・正解・簡単), never the retired 思い出せた button or 覚えた', said(deck).includes('「もう一度・難しい・正解・簡単」') && ['「正解」', '「難しい」', '「簡単」', '「もう一度」'].every((g) => said(sentences).includes(g)) && !said(deck).includes('「思い出せた」') && !said(sentences).includes('「思い出せた」') && !said(deck).includes('覚えた') && !said(sentences).includes('覚えた'), deck.method?.at(-1) ?? '');
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
    check('集中道場 lists 私の文脈, N2, N1, 専門, 言葉の鉱脈・MCD and ・文, 文脈札, and the saved-word queue', JSON.stringify(rows) === JSON.stringify(['personal', 'n2', 'n1', 'senmon', 'kotoba-mcd', 'kotoba-mine', 'context', 'mine']), rows.join(', '));

    await page.click('[data-deck="kotoba-mcd"]');
    await page.waitForSelector('#kp-start', { timeout: 15000 });
    check('the deck home leads with the count and topics: no method panel there, no 見て覚えるコツ panel', (await page.locator('#kp-method, #kp-tips, .kp-tips').count()) === 0);
    const home = await page.evaluate(`({ start: document.getElementById('kp-start').textContent, groups: document.querySelectorAll('.kp-group').length })`);
    check('the deck home shows today’s count and the 12 topics', /15/.test(home.start) && home.groups === 12, JSON.stringify(home));
    // T2 (the 2026-10-08 tour): "the four windows but maybe not so big", in the old home's colours. The
    // player injects its own stylesheet when it mounts: read the tiles once it has applied (a sheet that
    // never applies leaves them stacked and uncoloured, and the check fails)
    await page.waitForFunction(`getComputedStyle(document.querySelector('.kp-home .kp-tiles')).display === 'grid'`, null, { timeout: 5000 }).catch(() => {});
    const tiles = await page.evaluate(`[...document.querySelectorAll('.kp-home .kp-tiles > .kp-tile')].map((n) => ({ n: n.querySelector('b')?.textContent ?? null, label: n.querySelector('span')?.textContent ?? null, color: getComputedStyle(n.querySelector('b')).color, h: Math.round(n.getBoundingClientRect().height), top: Math.round(n.getBoundingClientRect().top) }))`);
    const hue = await page.evaluate(`(() => { const kp = document.querySelector('.kp'); const i = document.createElement('i'); kp.append(i); const tok = (k) => { i.style.color = 'var(--kp-' + k + ')'; return getComputedStyle(i).color; }; const out = { amber: tok('amber'), ink: tok('ink'), green: tok('green'), red: tok('red') }; i.remove(); return out; })()`);
    // figures carry a thousands separator (2,435): read them back without it
    const num = (x) => Number(String(x).replace(/,/g, ''));
    const begin = num(/\d[\d,]*/.exec(home.start)?.[0]);
    check('the deck home shows four small tiles in one row, Due · New · Known · Difficult, with the queue’s own counts (due + new is the start button’s number), in amber, ink, green and red (T2)',
      tiles.length === 4 && tiles.map((x) => x.label).join() === 'Due,New,Known,Difficult' && tiles.every((x) => /^\d{1,3}(,\d{3})*$/.test(x.n)) && num(tiles[0].n) + num(tiles[1].n) === begin &&
        new Set(tiles.map((x) => x.top)).size === 1 && tiles.every((x) => x.h <= 72) && tiles[0].color === hue.amber && tiles[1].color === hue.ink && tiles[2].color === hue.green && tiles[3].color === hue.red,
      JSON.stringify({ tiles, begin }));

    await page.click('#kp-start');
    await page.waitForSelector('#kp-card .kp-target');
    check('a card is a passage with the word marked (読んで思い出す) — no gap, no hint, no readings, no English', (await page.locator('#kp-card .kp-blank, #kp-card .kp-hint').count()) === 0 && (await page.locator('#kp-card .kp-sentence .kp-target').count()) >= 1 && (await page.locator('#kp-card rt').count()) === 0 && (await page.locator('#kp-card details').count()) === 0);
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
    await boot('?deck=mcd');
    await page.waitForSelector('#kp-start', { timeout: 15000 });
    await page.click('#kp-to-settings');
    await page.click('[data-pref="mode:self"]');
    await page.click('.kp-icon');
    await page.click('#kp-start');
    await page.waitForSelector('#kp-card .kp-blank');
    check('穴埋め (the MCD blank preset): one gap and nothing under it — no hint, no readings, no English', (await page.locator('#kp-card .kp-blank').count()) >= 1 && (await page.locator('#kp-card .kp-hint').count()) === 0 && (await page.locator('#kp-card rt').count()) === 0);
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
    // the commit resolves before the sheet re-renders: wait (bounded) for the drawer to redraw, then read it
    await page.waitForFunction(() => (document.querySelector('#sheet .list-picker .fold-sub')?.textContent || '').includes('経済ニュース'),
      null, { timeout: 5000 }).catch(() => {});
    const where = await page.evaluate(`document.querySelector('#sheet .list-picker .fold-sub')?.textContent || ''`);
    check('the sheet then says where the word went', where.includes('経済ニュース'), where);
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

    console.log('\n— a grade is saved before the card moves on');
    await verifyGradePath(browser, base);

    console.log('\n— 復元 cannot erase progress');
    await verifyRestore(browser, base);

    console.log('\n— answering: swipes, buttons, 設定, contrast');
    await verifyDelivery(browser, base);

    console.log('\n— the host lexicon adapter: tokens beside the deck, lookup in the corridor, none standalone');
    await verifyHost(browser, base);

    console.log('\n— tap → define → 覚える, after the reveal only (CARD_CONTRACT_V2 §3, STANDARD A44)');
    await verifyTap(browser, base);

    console.log('\n— the passage pilot (STANDARD A46): 4–5 sentences, tipJa in tier one, register and topic chips, Japanese senses');
    await verifyPilot(browser, base);

    console.log('\n— the full passage run (STANDARD A49, A50): a full-run passage on the card, tipJa in tier one');
    for (const id of FULL_RUN_CARDS) await verifyPilot(browser, base, id, 'full run');

    console.log('\n— the back hierarchy (CARD_CONTRACT_V2 §2–§4): front pin, tiers, folds, zoom, grade bar');
    await verifyBack(browser, base);

    console.log('\n— the visual system (CARD_CONTRACT_V2 §9): colour axes, contrast, textures, motion');
    await verifyVisual(browser, base);

    console.log('\n— the review loop (CARD_CONTRACT_V2 §3.7, §4): delete, leech ladder, kanji family, see-also');
    await verifyReviewData([deck, sentences]);
    await verifyReview(browser, base);
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
