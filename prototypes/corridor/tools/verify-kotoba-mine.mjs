/**
 * 言葉の鉱脈 deck + 覚える save-chooser verifier. Done = this is green.
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
 *   · 覚える asks where to save: nothing is written until 保存する, and a new
 *     list named in the chooser receives the word in the same commit.
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
 * Then answering: the grade bar shows もう一度／思い出せた and nothing else, even
 * with an old 難しい・簡単 setting stored; a cancelled or mostly vertical swipe
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
 * Usage: node verify-kotoba-mine.mjs   (rebuild the deck: python3 decks/kotoba-mine/tools/build.py)
 */

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright-core';

import { contrastTable } from './contrast-kotoba.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const CORRIDOR_DIR = resolve(TOOL_DIR, '..');
const DATA_DIR = resolve(CORRIDOR_DIR, 'data');
const DECK_PATH = resolve(CORRIDOR_DIR, 'decks/kotoba-mcd/deck.json');
const SENTENCE_DECK_PATH = resolve(CORRIDOR_DIR, 'decks/kotoba-mine/deck.json');
const IDS_PATH = resolve(CORRIDOR_DIR, '../../decks/kotoba-mine/source/ids.json');
const RUBY_FIXTURES_PATH = resolve(CORRIDOR_DIR, '../../tools/kotoba-deck-ruby.fixtures.json');

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
/** the card's sentence as written, without the readings a tap adds */
const SENTENCE = `(() => { const p = document.querySelector('#kp-card .kp-sentence')?.cloneNode(true); p?.querySelectorAll('rt').forEach((r) => r.remove()); return p?.textContent ?? null; })()`;

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
        /^1\//.test(after.count || '') && after.count === before.count && after.card && after.grades && after.backup && after.ledger === before.ledger && after.text.includes('保存できませんでした'),
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
      (await raw(LEDGER)) === current && empty.msg.includes('入っていません') && !empty.msg.includes('復元しました') && empty.button === '復元',
      empty.msg,
    );

    const first = await restore(older);
    const untouched = (await raw(LEDGER)) === current;
    await page.click('#kp-restore');
    const done = await page.evaluate(`document.getElementById('kp-backup-msg').textContent`);
    const now = JSON.parse(await raw(LEDGER));
    check(
      'an older backup with fewer cards: the first tap shows both counts and asks again (置き換える); the second replaces and keeps the old ledger aside',
      first.msg.includes('このバックアップ：1枚・1回答') && first.msg.includes('いまの記録：2枚・2回答') && first.msg.includes('いまより少ない') && first.button === '置き換える' && untouched && Object.keys(now.cards).length === 1 && now.log.length === 1 && (await raw(`${LEDGER}:before-restore`)) === current && done.includes('復元しました'),
      JSON.stringify({ first: first.msg, button: first.button, untouched, done }),
    );

    // a stored ledger whose card records cannot be read is set aside before anything is saved
    const broken = JSON.stringify({ format: 'bunki-cloze-state', version: 1, deckId: 'kotoba-mcd', cards: { x: { due: 'not-a-date' } }, log: [] });
    await page.evaluate(`localStorage.setItem(${JSON.stringify(LEDGER)}, ${JSON.stringify(broken)})`);
    await bootMcd();
    const home = await page.evaluate(`document.querySelector('.kp-notice')?.textContent || ''`);
    check('an unreadable stored ledger is copied to bunki-cloze:kotoba-mcd:quarantine and the deck home says so', (await raw(`${LEDGER}:quarantine`)) === broken && home.includes('別に保管しました'), home);
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
  const tokens = ['ink', 'ink-2', 'mute', 'cyan', 'red', 'amber', 'green', 'violet', 'noun', 'verb', 'adj', 'adv', 'expr', 'sound', 'kind-go', 'kind-ji', 'kind-bun'];
  const out = {};
  const before = root.dataset.look;
  for (const look of ['light', 'sakura', 'washi']) {
    root.dataset.look = look;
    const t = Object.fromEntries([...tokens, 'bg', 'panel', 'panel-2'].map((k) => [k, rgb('var(--kp-' + k + ')')]));
    const wash = rgba('var(--kp-cyan-wash)');
    // the card panel, the second panel (tiles, kanji boxes; also the darkest texture tint), the page,
    // the tinted 思い出せた button (12% green over the panel) and the accent wash (答えを見る, chosen settings)
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
    // two grade buttons, even with the old four-button setting stored; 2 and 4 do nothing (F10, A05; contract §4)
    await boot('?deck=kotoba');
    await page.evaluate(`localStorage.setItem('bunki-cloze:prefs:v3:kotoba-mine', JSON.stringify({ grades: 'four' }))`);
    await boot('?deck=kotoba');
    await page.click('#kp-start');
    await page.waitForSelector('#kp-card .kp-target');
    await page.click('#kp-reveal');
    await page.waitForSelector('.kp-grade');
    const two = await page.evaluate(`({ n: document.querySelectorAll('.kp-grade').length, labels: [...document.querySelectorAll('.kp-grade b')].map((b) => b.textContent).join('/'), hard: document.querySelectorAll('#kp-grade-hard, #kp-grade-easy').length, hint: document.querySelector('.kp-swipehint')?.textContent, position: getComputedStyle(document.querySelector('.kp-grades')).position })`);
    await page.keyboard.press('2');
    await page.keyboard.press('4');
    const keysIgnored = (await count()) === '1/15' && (await logLength('kotoba-mine')) === 0;
    check('the grade bar shows もう一度 and 思い出せた only (a stored 難しい・簡単 setting is ignored), stays on screen (fixed), and keys 2 and 4 do nothing', two.n === 2 && two.hard === 0 && two.labels === 'もう一度/思い出せた' && two.hint.includes('思い出せた') && two.position === 'fixed' && keysIgnored, JSON.stringify({ ...two, keysIgnored }));

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
    const afterSwipe = { count: await count(), log: await logLength('kotoba-mine') };
    check(
      'a cancelled swipe and a mostly vertical one (dx 105, dy 300) never grade and put the card back; a sideways swipe grades 思い出せた',
      afterCancel.count === '1/15' && afterCancel.log === 0 && cancelled.transform === '' && cancelled.swipe === '' && afterVertical.count === '1/15' && afterVertical.log === 0 && vertical.transform === '' && afterSwipe.log === 1 && afterSwipe.count !== '1/15',
      JSON.stringify({ afterCancel, afterVertical, afterSwipe }),
    );

    // settings: a labelled backup box, radio groups, the storage line, no label or aria violations (F36, N12)
    await page.click('#kp-quit');
    await page.click('#kp-to-settings');
    await page.waitForSelector('#kp-backup');
    await page.waitForFunction(`document.getElementById('kp-persist')?.textContent.includes('：')`);
    const settings = await page.evaluate(`({ label: document.querySelector('label[for="kp-backup"]')?.textContent, groups: document.querySelectorAll('.kp-settings [role="radiogroup"][aria-label]').length, checked: document.querySelectorAll('.kp-settings [role="radio"][aria-checked="true"]').length, persist: document.getElementById('kp-persist').textContent, gone: document.querySelectorAll('[data-pref^="grades:"], [data-pref^="furigana:"], [data-pref="hint:en"]').length })`);
    const axe = await new AxeBuilder({ page }).include('.kp').analyze();
    const aria = axe.violations.filter((v) => v.id === 'label' || v.id.startsWith('aria-') || v.id === 'button-name').map((v) => v.id);
    check('設定: the backup box has a label, each choice row is a radio group with one checked (no 判定のボタン, no front ふりがな, no English hint), the storage line shows, and axe finds no label or aria problems', settings.label === 'バックアップの文字列' && settings.groups === 5 && settings.checked === 5 && settings.gone === 0 && /^端末の保存領域：(確保済み|未確保|不明)$/.test(settings.persist) && aria.length === 0, JSON.stringify({ ...settings, aria }));

    // the done screen keeps ↶ ひとつ戻す (F37)
    await page.evaluate(`localStorage.setItem('bunki-cloze:prefs:v3:kotoba-mine', JSON.stringify({ ...JSON.parse(localStorage.getItem('bunki-cloze:prefs:v3:kotoba-mine')), newPerDay: 1 }))`);
    await page.evaluate(`localStorage.removeItem('bunki-cloze:kotoba-mine')`);
    await boot('?deck=kotoba');
    await page.click('#kp-start');
    await page.click('#kp-reveal');
    await page.waitForSelector('.kp-grade');
    // a new card answered 思い出せた comes back once in the sitting (its 10-minute step); the second answer ends it
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
    check('the done screen keeps ↶ ひとつ戻す and it brings the last card back', done.undo === 1 && done.text.includes('思い出せた割合') && back?.count === '2/2' && back.log === 1, JSON.stringify({ ...done, back }));

    // 4択 never asks a 字 card: it is answered as 穴埋め (F38)
    await page.evaluate(DUE_KANJI);
    await boot('?deck=mcd');
    await page.click('#kp-start');
    await page.waitForSelector('#kp-card');
    const kanji = await page.evaluate(`({ chip: document.querySelector('#kp-card .kp-kindchip')?.textContent, choices: document.querySelectorAll('.kp-choice').length, reveal: !!document.getElementById('kp-reveal'), blank: document.querySelector('#kp-card .kp-blank')?.textContent })`);
    await page.click('#kp-reveal');
    await page.waitForSelector('.kp-grade');
    const grades = await page.locator('.kp-grade').count();
    check('in 4択 a 字 card shows no choices: hint, 答えを見る and the grade bar instead', kanji.chip === '字' && kanji.choices === 0 && kanji.reveal && kanji.blank === '〔ざい〕' && grades === 2, JSON.stringify({ ...kanji, grades }));

    // every colour token clears 4.5:1 on the surfaces it sits on, in the light themes (F35, A20)
    const contrast = await page.evaluate(CONTRAST);
    check('light themes: every text colour, the kind colours included, is at least 4.5:1 on the card, the second panel, the page, the 思い出せた button and the accent wash', Object.values(contrast).every((m) => m.ratio >= 4.5), Object.entries(contrast).map(([k, m]) => `${k} ${m.ratio} (${m.pair})`).join(' · '));
  } finally {
    await context.close();
  }
}

/* ------------------------- the back hierarchy (CARD_CONTRACT_V2 §2–§4) */
const KANJI_RE = /[㐀-鿿々〆ヵヶ]/;
const FOLD_ORDER = ['英語', '英訳', '漢字の形と意味', '類語', 'この語の他の文章'];
const RULE_TEXT = '答えを見て理解が深まったなら もう一度';
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
  const mcd = decks.find((d) => d.id === 'kotoba-mcd');
  const cards = mcd.words.flatMap((w) => w.cards);
  const bad = cards.filter((c) => c.enTarget != null && (!c.en.includes(c.enTarget) || (sentenceEnds(c.ja).length > 1 && c.enTarget === c.en))).map((c) => c.id);
  const withEn = cards.filter((c) => c.enTarget).length;
  const sameEnPerPassage = mcd.words.every((w) => w.cards.every((c) => c.enTarget === w.cards.find((x) => x.passage === c.passage && x.type === 'word').enTarget));
  check('c) a passage card carries the English of its target sentence only — part of the passage translation, never all of it when the passage has more than one sentence', bad.length === 0 && withEn / cards.length > 0.9 && sameEnPerPassage, bad.slice(0, 4).join(' | ') || `${withEn}/${cards.length} cards (the rest cannot be matched and show no 英訳)`);
}

/** the standalone study pages and the Anki templates keep parity with the player's front and back */
function verifyBackParity() {
  const tools = resolve(CORRIDOR_DIR, '../../decks/kotoba-mine/tools');
  const release = resolve(CORRIDOR_DIR, '../../decks/kotoba-mine/release');
  const bad = [];
  for (const dir of ['anki', 'anki-sentence']) {
    const front = readFileSync(resolve(tools, dir, 'front.html'), 'utf8');
    const back = readFileSync(resolve(tools, dir, 'back.html'), 'utf8');
    if (/furigana:|\{\{(Meaning|SentenceEN|SentenceFurigana|Tip|Kanji)\}\}/.test(front)) bad.push(`${dir}/front: readings or English`);
    const at = ['{{furigana:SentenceFurigana}}', 'class="term"', 'class="posbadge"', '{{DefJA}}', '<summary>英語</summary>', '{{Meaning}}', '<summary>英訳</summary>', '<summary>漢字の形と意味</summary>', 'class="src"'].map((k) => back.indexOf(k));
    if (at.some((i) => i < 0) || at.some((i, k) => k && i < at[k - 1])) bad.push(`${dir}/back: order ${at.join(',')}`);
    if (!/\{\{\^Hint\}\}\s*<details class="fold kfold" open>/.test(back) || /\{\{#Hint\}\}\s*<details class="fold kfold" open>/.test(back)) bad.push(`${dir}/back: 漢字 fold not open on 字 cards only`);
    if (/<details[^>]*class="fold (gloss|en)"[^>]* open/.test(back)) bad.push(`${dir}/back: an English fold starts open`);
    if (!/\{\{\^SentenceEN\}\}\s*<details class="fold en">\s*<summary>英訳<\/summary>[^{]*未対応/.test(back)) bad.push(`${dir}/back: no 英訳 fold when the sentence has no English`);
    for (const [name, t] of [['front', front], ['back', back]]) if (!t.includes('<div class="km item-{{Type}}') || !t.includes('<span class="chip lvchip">{{Type}}</span>')) bad.push(`${dir}/${name}: edge and first chip not by item kind`);
    const css = readFileSync(resolve(tools, dir, 'style.css'), 'utf8');
    if (/\.km\.kind-/.test(css) || !css.includes('.km.item-字')) bad.push(`${dir}/style.css: the edge is not the item kind`);
    if (!back.includes('lang="en">{{Meaning}}') || !back.includes('lang="en">{{SentenceEN}}') || !back.includes('lang="en">{{Tip}}') || /<details[^>]*lang=/.test(back)) bad.push(`${dir}/back: lang="en" not on the English text alone`);
  }
  const tsv = readFileSync(resolve(release, 'kotoba-mcd.tsv'), 'utf8').trim().split('\n');
  const cols = tsv[2].replace('#columns:', '').split('\t');
  const byId = new Map(readJson(DECK_PATH).words.flatMap((w) => w.cards.map((c) => [c.id, c])));
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  const wrongEn = tsv.slice(3).map((l) => l.split('\t')).filter((r) => r[cols.indexOf('SentenceEN')] !== esc(byId.get(r[0])?.enTarget ?? '')).map((r) => r[0]);
  if (wrongEn.length) bad.push(`kotoba-mcd.tsv SentenceEN ≠ enTarget: ${wrongEn.slice(0, 3).join(', ')}`);
  for (const page of ['study.html', 'study-mcd.html']) {
    const html = readFileSync(resolve(release, page), 'utf8');
    if (!['function sentenceEnds', 'kp-folds', 'kp-zoom', 'ruleSeen', 'savePrefQuiet', 'kp-en-none', RULE_TEXT, 'function revealInPlace', 'kp-kindchip', 'kp-levelchip', 'prefers-reduced-motion'].every((k) => html.includes(k)) || /kp-tapword|is-four|VISUAL_TIPS|topicColour|kp-lvchip/.test(html)) bad.push(`${page}: not the current player`);
  }
  check('parity: the study pages bundle this player; the Anki fronts show no readings or English; the Anki backs keep the same order (英語 and 英訳 closed, 漢字 open on 字 cards) and translate only the target sentence; Anki edges and first chips by item kind', bad.length === 0, bad.slice(0, 3).join(' | ') || 'anki, anki-sentence, study.html, study-mcd.html, kotoba-mcd.tsv');
}

async function verifyBack(browser, base) {
  const mcdDeck = readJson(DECK_PATH);
  const sentDeck = readJson(SENTENCE_DECK_PATH);
  const index = new Map([mcdDeck, sentDeck].flatMap((d) => d.words.flatMap((w) => w.cards.map((c) => [c.id, { c, w, deck: d.id }]))));
  const ledger = (deck, id, state = 2) => JSON.stringify({ format: 'bunki-cloze-state', version: 1, deckId: deck, groupsOff: [], log: [], cards: { [id]: { due: '2020-01-01T00:00:00.000Z', stability: 20, difficulty: 5, state, reps: 3, lapses: 0, elapsed_days: 20, scheduled_days: 20 } } });
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
    return { rt: card.querySelectorAll('rt, ruby').length, taps: card.querySelectorAll('.kp-sentence :is(button, a, [role="button"], [tabindex], .kp-tapword)').length, tapwords: document.querySelectorAll('.kp-tapword').length,
      latin: /[A-Za-z]/.test(rest.textContent), folds: card.querySelectorAll('details').length, text: card.textContent, hint: card.querySelector('.kp-hint')?.textContent ?? null, zoom: !!card.querySelector('.kp-zoom') || !!card.dataset.zoom };
  })()`;
  const BACK = `(() => {
    const card = document.getElementById('kp-card');
    const ans = card.querySelector('.kp-answer');
    const sentence = card.querySelector('.kp-sentence').cloneNode(true);
    sentence.querySelectorAll('ruby').forEach((r) => r.remove());
    const tier1 = [...ans.querySelectorAll(':scope > .kp-word, :scope > .kp-def, :scope > .kp-note')].map((n) => n.textContent).join(' ');
    const fold = (cls) => { const d = card.querySelector('.' + cls); return d ? { open: d.open, text: d.textContent.replace(d.querySelector('summary').textContent, '').trim(), summary: d.querySelector('summary').textContent } : null; };
    return { order: [...ans.children].map((n) => n.className), word: [...ans.querySelector('.kp-word').children].map((n) => n.className), pitch: !!card.querySelector('.kp-pitch'),
      bare: ${KANJI_RE}.test(sentence.textContent), rt: card.querySelectorAll('.kp-sentence rt').length, tier1, def: ans.querySelector('.kp-def')?.textContent,
      summaries: [...ans.querySelectorAll('.kp-folds > details > summary')].map((s) => s.textContent), native: [...ans.querySelectorAll('.kp-folds > *')].every((n) => n.tagName === 'DETAILS'),
      gloss: fold('kp-f-gloss'), en: fold('kp-f-en'), kanji: fold('kp-f-kanji'), sem: fold('kp-f-sem'), others: fold('kp-f-others') };
  })()`;
  const inOrder = (summaries) => {
    const at = summaries.map((t) => FOLD_ORDER.findIndex((k) => t.startsWith(k)));
    return at.every((i) => i >= 0) && at.every((i, k) => k === 0 || i > at[k - 1]);
  };
  const close = async (o) => {
    if (o.errors.length) check('no page errors on the back', false, o.errors.slice(0, 2).join(' | '));
    await o.context.close();
  };

  // a) the front pin, both decks, with old prefs that used to add tap readings and an English hint
  const fronts = [];
  for (const [label, q, deck, opts] of [
    ['MCD 語', '?deck=mcd', 'kotoba-mcd', {}],
    ['MCD 語, old prefs (tap ふりがな, English hint)', '?deck=mcd', 'kotoba-mcd', { prefs: { furigana: 'tap', hint: 'en' } }],
    ['MCD 字', '?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0 }, state: ledger('kotoba-mcd', 'km-064-m02') }],
    ['文 (読んで思い出す)', '?deck=kotoba', 'kotoba-mine', {}],
    ['文 穴埋め, old prefs (tap ふりがな, English hint)', '?deck=kotoba', 'kotoba-mine', { prefs: { mode: 'self', furigana: 'tap', hint: 'en' } }],
  ]) {
    const o = await open(q, deck, opts);
    const f = await o.page.evaluate(FRONT);
    const { c, w } = index.get(await cardId(o.page));
    const english = [w.meaning, c.en, w.tip].filter(Boolean).some((t) => f.text.includes(t));
    fronts.push({ label, ok: f.rt === 0 && f.taps === 0 && f.tapwords === 0 && !f.latin && !english && f.folds === 0 && !f.zoom && (f.hint == null || !/[A-Za-z]/.test(f.hint)), card: c.id, ...f, text: undefined });
    await close(o);
  }
  const badFront = fronts.filter((f) => !f.ok);
  check('a) front pin, both decks: no furigana, no English, no tap targets in the passage, no folds — also with old tap-ふりがな / English-hint prefs stored', badFront.length === 0, badFront.length ? JSON.stringify(badFront[0]) : fronts.map((f) => `${f.label} ${f.card}`).join(' · '));

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
      'b) tier one under the passage: the word (reading, part of speech, no pitch), a reading over every kanji, the Japanese definition, no English',
      b.word.join() === 'kp-term,kp-reading,kp-posbadge' && !b.pitch && !b.bare && b.rt > 0 && tier1[0] === 'kp-word' && tier1[1] === 'kp-def' && tier1.every((k) => ['kp-word', 'kp-def', 'kp-note'].includes(k)) && b.def === w.defJa && !/[A-Za-z]/.test(b.tier1) && zf === null,
      JSON.stringify({ card: c.id, order: b.order, word: b.word, rt: b.rt, bare: b.bare }),
    );
    const sibs = w.cards.filter((x) => x.type === 'word' && x.passage !== c.passage);
    check(
      'c) tier two: native folds in order 英語 → 英訳 → 漢字の形と意味 → (類語) → other passages, then the source line last; 英語 is closed by default and holds the gloss',
      b.native && inOrder(b.summaries) && b.summaries[0] === '英語' && b.order.at(-1) === 'kp-src' && b.order.at(-2) === 'kp-folds' && b.gloss && !b.gloss.open && b.gloss.text.startsWith(w.meaning),
      JSON.stringify({ summaries: b.summaries, last: b.order.slice(-2), gloss: b.gloss?.open }),
    );
    check(
      'c) 英訳 is the target sentence only (not the passage); 漢字 closed on a 語 card; 類語 absent on a new card; other passages are titles only',
      b.en?.text === c.enTarget && c.enTarget !== c.en && b.kanji && !b.kanji.open && !b.sem && b.others?.summary === `この語の他の文章（${sibs.length}）` && !b.others.open && sibs.every((x) => !b.others.text.includes(x.ja.slice(0, 10))),
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
      const ja = [...ans.querySelectorAll('.kp-folds summary, .kp-tip-label')].every((n) => n.closest('[lang]').lang === 'ja');
      const en = [...ans.querySelectorAll('.kp-gloss, .kp-en')].every((n) => n.lang === 'en');
      return { ja, en, details: [...ans.querySelectorAll('details')].every((d) => !d.hasAttribute('lang')) }; })()`);
    check('c) screen readers: the fold summaries read as Japanese, only the English text inside carries lang="en"', lang.ja && lang.en && lang.details, JSON.stringify(lang));
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
      const hit = document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2); return { position: getComputedStyle(document.querySelector('.kp-grades')).position, bottom: Math.round(b.bottom), top: Math.round(b.top), hit: !!hit?.closest('#kp-grade-good'), rule: document.getElementById('kp-rule')?.textContent ?? null }; })()`);
    await o.page.click('#kp-rule-dismiss');
    await o.page.waitForSelector('#kp-grade-good');
    const dismissed = await o.page.evaluate(`({ rule: !!document.getElementById('kp-rule'), seen: JSON.parse(localStorage.getItem('bunki-cloze:prefs:v3:kotoba-mcd') || '{}').ruleSeen, zoom: document.getElementById('kp-card').dataset.zoom, enOpen: document.querySelector('#kp-card .kp-f-en').open })`);
    check(
      'e) the grade bar is pinned to the bottom of the phone screen and shows 「答えを見て理解が深まったなら もう一度」 until dismissed; dismissing is remembered in prefs and keeps an open fold open',
      bar.position === 'fixed' && bar.bottom === 844 && bar.hit && bar.rule?.includes(RULE_TEXT) && !dismissed.rule && dismissed.seen === true && dismissed.zoom === 'focus' && dismissed.enOpen === true,
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
    check('c) a passage with no matched sentence (km-109-m05) keeps the 英訳 fold in its place, saying 未対応, never the whole translation', c.id === 'km-109-m05' && c.enTarget == null && b.summaries[1] === '英訳' && b.en?.text.includes('未対応') && !b.en.text.includes(c.en.slice(0, 20)) && inOrder(b.summaries), JSON.stringify({ id: c.id, summaries: b.summaries, en: b.en?.text }));
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

  // e) the longest passage (km-298-m02, 195 characters): the grade bar is on screen without scrolling, and the source line scrolls clear of it
  {
    const o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0 }, state: ledger('kotoba-mcd', 'km-298-m02') });
    const id = await cardId(o.page);
    await o.page.click('#kp-reveal');
    await o.page.waitForSelector('.kp-grade');
    await o.page.evaluate('window.scrollTo(0, 0)');
    const top = await o.page.evaluate(`(() => { const b = document.querySelector('.kp-grades').getBoundingClientRect(); const g = document.getElementById('kp-grade-again').getBoundingClientRect(); return { bottom: Math.round(b.bottom), inView: g.top >= 0 && g.bottom <= innerHeight, hit: !!document.elementFromPoint(g.left + g.width / 2, g.top + g.height / 2)?.closest('#kp-grade-again') }; })()`);
    await o.page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
    const end = await o.page.evaluate(`(() => { const b = document.querySelector('.kp-grades').getBoundingClientRect(); const s = document.querySelector('#kp-card .kp-src').getBoundingClientRect(); return { src: Math.round(s.bottom), bar: Math.round(b.top) }; })()`);
    const z = await o.page.evaluate(`document.getElementById('kp-card').dataset.zoom`);
    check('e) the longest passage (195 characters): the grade bar is on screen at the top of the page and the source line scrolls clear of it; a card seen before opens in 焦点', id === 'km-298-m02' && top.bottom === 844 && top.inView && top.hit && end.src <= end.bar && z === 'focus', JSON.stringify({ id, top, end, zoom: z }));
    await close(o);
  }

  // c) a 字 card opens 漢字の形と意味; the sentence deck: 英訳 is its one sentence, no zoom, 英語 open when 設定 says always
  {
    const o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0 }, state: ledger('kotoba-mcd', 'km-064-m02') });
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
      'c, d) sentence deck: 英語 stays open with 設定 › いつも開いておく, 英訳 is the sentence, the same fold order, and no zoom',
      b.gloss?.open === true && b.gloss.text.startsWith(w.meaning) && b.en?.text === c.en && inOrder(b.summaries) && b.order.at(-1) === 'kp-src' && z.zoom === 0 && z.data === null && !b.bare,
      JSON.stringify({ summaries: b.summaries, gloss: b.gloss?.open, zoom: z }),
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
      seen.every((x) => x.id === 'km-064-m01' && x.order) && !fresh.sem && !learning.sem && review.sem && review.closed && review.text.includes('家計') && !none.sem && fresh.zoom === 'full' && review.zoom === 'focus',
      JSON.stringify(seen.map(({ label, sem, zoom }) => ({ label, sem, zoom }))),
    );
  }
}

/* ------------------------- the visual system (CARD_CONTRACT_V2 §9, aesthetics.md) */
const WBIG_PATH = resolve(CORRIDOR_DIR, '../drift/data/wbig.json');
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
    again: color('#kp-grade-again b'), good: color('#kp-grade-good b'),
    cardTex: getComputedStyle(card).backgroundImage, pageTex: getComputedStyle(kp).backgroundImage,
    tok: Object.fromEntries(['ink', 'ink-2', 'panel-2', 'kind-go', 'kind-ji', 'red', 'green', 'amber', 'noun', 'verb', 'adj', 'adv', 'expr', 'sound'].map((k) => [k, tok(k)])),
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
      home.tips === 0 && home.method === 0 && home.topic === 0 && set.method && set.summary === 'このデッキのしくみ' && set.lines === mcd.method.length && set.groups === 5,
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
      front.kind === 'go' && !/kp-lv\d|kp-topic/.test(front.classes) && !front.topicVar && front.edge === t['kind-go'] && front.kindChip === '語' && front.kindChipColor === t['kind-go'] &&
        back.target === t.noun && back.targetLine.includes('underline') && back.term === t.noun && front.state === t['ink-2'] &&
        w.level === 'N1' && front.level === 'N1' && front.levelLabel === 'N1相当（公開リストによる目安）' && front.levelColor === t['ink-2'] && front.levelBg === t['panel-2'],
      JSON.stringify({ kind: front.kind, edge: front.edge, chip: front.kindChipColor, target: back.target, state: front.state, level: front.level, chips: front.chips }),
    );
    check(
      `b) ${look}: English is never coloured (gloss, 英訳 and the note in ink-2, no amber bar on the note); the grades are red and green`,
      back.gloss === t['ink-2'] && back.en === t['ink-2'] && back.tip === t['ink-2'] && back.tipBar === '0px' && back.again === t.red && back.good === t.green,
      JSON.stringify({ gloss: back.gloss, en: back.en, tip: back.tip, tipBar: back.tipBar, again: back.again, good: back.good }),
    );
    await close(o);
  }

  // b) a 字 card: its own edge and chip colour; a word without a level: no level chip; the sentence deck: 語, no "3/1"
  {
    const o = await open('?deck=mcd', 'kotoba-mcd', { prefs: { newPerDay: 0, look: 'washi' }, state: due('kotoba-mcd', 'km-064-m02') });
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
      ji.kind === 'ji' && ji.kindChip === '字' && ji.edge === ji.tok['kind-ji'] && ji.kindChipColor === ji.tok['kind-ji'] && ji.edge !== ji.tok['kind-go'] && ji.state === ji.tok.amber &&
        none.level === null && !none.chips.some((c) => /^N\d$/.test(c)) && s.kindChip === '語' && s.edge === s.tok['kind-go'] && !s.chips.some((c) => /\d+\/\d+/.test(c)) && s.level === 'N1',
      JSON.stringify({ ji: [ji.kind, ji.kindChip, ji.edge], none: none.chips, sentence: s.chips }),
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
      'e) the reveal keeps the card node, its chips and the screen (no rebuild): the readings fade in and the answer rises in 120–180 ms, opacity and transform only',
      kept.card && kept.study && kept.top && kept.chips && kept.cards === 1 && !kept.reveal && kept.grades === 2 && kept.answer === 'kp-rise' && kept.answerMs >= 120 && kept.answerMs <= 180 && kept.rt === 'kp-fade' && kept.rtMs <= 230 && motion.longest <= 180,
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
      'e) a grade slides the answered card out its way (思い出せた right, もう一度 left; an inert copy without ids, gone after the slide) while the next card settles; the rail ticks by transform in 120 ms',
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
  const said = (d) => (d.method ?? []).join('');
  check('the method text names the same two buttons the player shows (もう一度／思い出せた), never 覚えた', said(deck).includes('「もう一度／思い出せた」') && said(sentences).includes('「思い出せた」') && !said(deck).includes('覚えた') && !said(sentences).includes('覚えた'), deck.method?.at(-1) ?? '');
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
    check('集中道場 opens with the deck list: 言葉の鉱脈・MCD then ・文, with 文脈札 and the saved-word queue', rows.indexOf('kotoba-mcd') >= 0 && rows.indexOf('kotoba-mine') === rows.indexOf('kotoba-mcd') + 1 && rows.includes('context') && rows.includes('mine'), rows.join(', '));

    await page.click('[data-deck="kotoba-mcd"]');
    await page.waitForSelector('#kp-start', { timeout: 15000 });
    check('the deck home leads with the count and topics: no method panel there, no 見て覚えるコツ panel', (await page.locator('#kp-method, #kp-tips, .kp-tips').count()) === 0);
    const home = await page.evaluate(`({ start: document.getElementById('kp-start').textContent, groups: document.querySelectorAll('.kp-group').length })`);
    check('the deck home shows today’s count and the 12 topics', /15/.test(home.start) && home.groups === 12, JSON.stringify(home));

    await page.click('#kp-start');
    await page.waitForSelector('#kp-card .kp-blank');
    check('a card is a passage with one gap and a Japanese hint — no readings, no English', (await page.locator('#kp-card .kp-blank').count()) === 1 && (await page.locator('#kp-card rt').count()) === 0 && (await page.locator('#kp-card details').count()) === 0);
    await page.click('#kp-reveal');
    await page.waitForSelector('#kp-grade-good');
    const back = await page.evaluate(`({ rt: document.querySelectorAll('#kp-card rt').length, target: !!document.querySelector('#kp-card .kp-target'), term: document.querySelector('.kp-term')?.textContent, src: !!document.querySelector('#kp-card .kp-src') })`);
    check('the answer puts readings over the kanji, gives the meaning, and names the source', back.rt > 0 && back.target && !!back.term && back.src, JSON.stringify(back));
    const takenBefore = (await ls('kairo-corridor-v1')).taken.length;
    await page.click('#kp-grade-good');
    const ledger = await ls('bunki-cloze:kotoba-mcd');
    const after = await ls('kairo-corridor-v1');
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

    // 覚える asks where to save
    await boot();
    await page.fill('#search', '金利');
    await page.waitForSelector('[data-result^="word:金利"]', { timeout: 15000 });
    await page.click('[data-result^="word:金利"]');
    await page.waitForSelector('#sheet #take');
    await page.click('#sheet #take');
    await page.waitForSelector('#take-chooser');
    const pending = (await ls('kairo-corridor-v1')).taken.length;
    check('覚える opens “どこに保存しますか？” and writes nothing yet', pending === 0 && (await page.locator('#take-chooser .take-always').count()) === 1, `${pending} rows`);
    await page.fill('#take-new-list', '経済ニュース');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-pick-list="経済ニュース"][aria-pressed="true"]');
    await page.click('#take-save');
    await page.waitForTimeout(250);
    const saved = await ls('kairo-corridor-v1');
    check('保存する writes the word and its new list together', saved.taken.some((t) => t.id === '金利') && (saved.lists?.['経済ニュース'] || []).some((x) => x.id === '金利'), JSON.stringify(Object.keys(saved.lists || {})));
    const where = await page.evaluate(`document.querySelector('#sheet .list-picker .fold-sub')?.textContent || ''`);
    check('the sheet then says where the word went', /覚えるの札|daily review/.test(where) && where.includes('経済ニュース'), where);
    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

    console.log('\n— a grade is saved before the card moves on');
    await verifyGradePath(browser, base);

    console.log('\n— 復元 cannot erase progress');
    await verifyRestore(browser, base);

    console.log('\n— answering: swipes, buttons, 設定, contrast');
    await verifyDelivery(browser, base);

    console.log('\n— the back hierarchy (CARD_CONTRACT_V2 §2–§4): front pin, tiers, folds, zoom, grade bar');
    await verifyBack(browser, base);

    console.log('\n— the visual system (CARD_CONTRACT_V2 §9): colour axes, contrast, textures, motion');
    await verifyVisual(browser, base);
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
