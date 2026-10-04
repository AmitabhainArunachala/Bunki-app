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
 * Then answering: the 文 front never makes the marked word a tap target; the
 * grade bar shows もう一度／思い出せた (all four after 難しい・簡単も使う); a
 * cancelled or mostly vertical swipe never grades; 4択 never asks a 字 card;
 * 設定 has labelled controls and radio groups (axe); the done screen keeps
 * ↶ ひとつ戻す; every colour token in the light themes clears 4.5:1.
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
      await page.waitForSelector('#kp-card .kp-tapword');
      const b = await page.evaluate(SENTENCE);
      await page.locator('#kp-card .kp-tapword').first().click();
      await page.clock.fastForward('11:00');
      const taps = await page.locator('#kp-card .kp-tapword').count();
      if (taps) await page.locator('#kp-card .kp-tapword').first().click();
      else await page.locator('#kp-card rt').first().click();
      const stillB = await page.evaluate(SENTENCE);
      check(
        'a learning card that comes due while another card is open does not replace it',
        a !== b && stillB === b && due > 9 && due <= 10.1,
        JSON.stringify({ dueInMinutes: Math.round(due * 10) / 10, secondTap: taps ? 'tapword' : 'ruby', same: stillB === b }),
      );
      await page.click('#kp-reveal');
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
  const tokens = ['ink', 'ink-2', 'mute', 'cyan', 'red', 'amber', 'green', 'violet', 'noun', 'verb', 'adj', 'adv', 'expr', 'sound'];
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
    // 文 front: the asked word is never a tap target before the answer (N05, A04)
    await boot('?deck=kotoba');
    await page.click('#kp-start');
    await page.waitForSelector('#kp-card .kp-target');
    const front = await page.evaluate(`({ tapTarget: document.querySelectorAll('#kp-card .kp-target .kp-tapword').length, target: document.querySelectorAll('#kp-card .kp-target').length, otherTaps: document.querySelectorAll('#kp-card .kp-tapword').length, rt: document.querySelectorAll('#kp-card rt').length })`);
    check('文 front: the marked word is plain text (no tap reading) before the answer; the other kanji words keep their tap', front.tapTarget === 0 && front.target >= 1 && front.rt === 0 && front.otherTaps > 0, JSON.stringify(front));

    // two grade buttons by default; 2 and 4 do nothing then (F10, A05)
    await page.click('#kp-reveal');
    await page.waitForSelector('.kp-grade');
    const two = await page.evaluate(`({ n: document.querySelectorAll('.kp-grade').length, labels: [...document.querySelectorAll('.kp-grade b')].map((b) => b.textContent).join('/'), hint: document.querySelector('.kp-swipehint')?.textContent, sticky: getComputedStyle(document.querySelector('.kp-grades')).position })`);
    await page.keyboard.press('2');
    await page.keyboard.press('4');
    const keysIgnored = (await count()) === '1/15' && (await logLength('kotoba-mine')) === 0;
    check('the grade bar shows もう一度 and 思い出せた only, stays on screen (sticky), and keys 2 and 4 do nothing', two.n === 2 && two.labels === 'もう一度/思い出せた' && two.hint.includes('思い出せた') && two.sticky === 'sticky' && keysIgnored, JSON.stringify({ ...two, keysIgnored }));

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
    const settings = await page.evaluate(`({ label: document.querySelector('label[for="kp-backup"]')?.textContent, groups: document.querySelectorAll('.kp-settings [role="radiogroup"][aria-label]').length, checked: document.querySelectorAll('.kp-settings [role="radio"][aria-checked="true"]').length, persist: document.getElementById('kp-persist').textContent })`);
    const axe = await new AxeBuilder({ page }).include('.kp').analyze();
    const aria = axe.violations.filter((v) => v.id === 'label' || v.id.startsWith('aria-') || v.id === 'button-name').map((v) => v.id);
    check('設定: the backup box has a label, each choice row is a radio group with one checked, the storage line shows, and axe finds no label or aria problems', settings.label === 'バックアップの文字列' && settings.groups === 7 && settings.checked === 7 && /^端末の保存領域：(確保済み|未確保|不明)$/.test(settings.persist) && aria.length === 0, JSON.stringify({ ...settings, aria }));

    // 難しい・簡単も使う shows all four; the done screen keeps ↶ ひとつ戻す (F37)
    await page.click('[data-pref="grades:four"]');
    await page.evaluate(`localStorage.setItem('bunki-cloze:prefs:v3:kotoba-mine', JSON.stringify({ ...JSON.parse(localStorage.getItem('bunki-cloze:prefs:v3:kotoba-mine')), newPerDay: 1 }))`);
    await page.evaluate(`localStorage.removeItem('bunki-cloze:kotoba-mine')`);
    await boot('?deck=kotoba');
    await page.click('#kp-start');
    await page.click('#kp-reveal');
    await page.waitForSelector('.kp-grade');
    const four = await page.evaluate(`[...document.querySelectorAll('.kp-grade b')].map((b) => b.textContent).join('/')`);
    check('after 難しい・簡単も使う the grade bar shows all four', four === 'もう一度/難しい/思い出せた/簡単', four);
    await page.click('#kp-grade-easy');
    await page.waitForSelector('.kp-done');
    const done = await page.evaluate(`({ undo: document.querySelectorAll('#kp-undo').length, text: document.querySelector('.kp-done').innerText.replace(/\\s+/g, ' ') })`);
    let back = null;
    if (done.undo) {
      await page.click('#kp-undo');
      await page.waitForSelector('.kp-grade');
      back = { count: await count(), log: await logLength('kotoba-mine') };
    }
    check('the done screen keeps ↶ ひとつ戻す and it brings the last card back', done.undo === 1 && done.text.includes('思い出せた割合') && back?.count === '1/1' && back.log === 0, JSON.stringify({ ...done, back }));

    // 4択 never asks a 字 card: it is answered as 穴埋め (F38)
    await page.evaluate(DUE_KANJI);
    await boot('?deck=mcd');
    await page.click('#kp-start');
    await page.waitForSelector('#kp-card');
    const kanji = await page.evaluate(`({ chip: document.querySelector('#kp-card .kp-lvchip')?.textContent, choices: document.querySelectorAll('.kp-choice').length, reveal: !!document.getElementById('kp-reveal'), blank: document.querySelector('#kp-card .kp-blank')?.textContent })`);
    await page.click('#kp-reveal');
    await page.waitForSelector('.kp-grade');
    const grades = await page.locator('.kp-grade').count();
    check('in 4択 a 字 card shows no choices: hint, 答えを見る and the grade bar instead', kanji.chip === '字' && kanji.choices === 0 && kanji.reveal && kanji.blank === '〔ざい〕' && grades === 2, JSON.stringify({ ...kanji, grades }));

    // every colour token clears 4.5:1 on the surfaces it sits on, in the light themes (F35, A20)
    const contrast = await page.evaluate(CONTRAST);
    check('light themes: every text colour is at least 4.5:1 on the card, the second panel, the page, the 思い出せた button and the accent wash', Object.values(contrast).every((m) => m.ratio >= 4.5), Object.entries(contrast).map(([k, m]) => `${k} ${m.ratio} (${m.pair})`).join(' · '));
  } finally {
    await context.close();
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

    console.log('\n— answering: swipes, buttons, the 文 front, 設定, contrast');
    await verifyDelivery(browser, base);
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
