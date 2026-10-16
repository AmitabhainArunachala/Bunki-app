/**
 * S · Today's sky follows his learning (John, 2026-10-16, on Today: "are those cards in the sky correlated with missed
 * reviews? with words that are marked as not known? or are they random? if so, make it logical"). On the staged
 * artifact, in English and 日本語, on a phone:
 *   Y1 a seeded record, entered through the app's own importer: a review answered Again yesterday (電話), a practice
 *      test answer wrong two hours ago (政府), a まだ mark (練習), a word looked up on two occasions twenty minutes apart and
 *      not kept (経済), a saved word due today (学校) → those five lead the sky in that rank (the latest miss first, then
 *      the older miss, the mark, the look-ups, the due card), each star's reason exactly its line, and each star's card
 *      (the slip) says the same line (#mini-why);
 *   Y2 a deck's Again (the N2 ledger in this device's storage, the deck's own schedule) names its word in the sky, with
 *      the day it was missed;
 *   Y3 a record with none of these → every star is from today's story (its words, two of its kanji) or the day word's
 *      family (a word sharing one of its kanji), each with its reason; no random JLPT word, no random saved word; ten at
 *      most;
 *   Y4 the walk writes nothing: the record read back after the stars were opened is the record seeded.
 * Negative control: KAIRO_SKY_NEGATIVE=random salts the drawn sky with one JLPT word from outside the story and the family
 * (labelled as the story's) → Y3 goes red.
 */
/* global window, document */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { startCorridorDev } from '../../../scripts/serve-corridor-dev.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { restoreAppFixture } from './record-fixture-support.mjs';
import { readAppRecord } from './record-test-support.mjs';

const NEGATIVE = process.env.KAIRO_SKY_NEGATIVE || '';
const out = resolveCorridorEvidence();
mkdirSync(out, { recursive: true });
const host = await startCorridorDev(0);
const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 1500) });
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${String(detail).slice(0, 300)}` : ''}`);
};
const engines =
  process.env.KAIRO_BROWSER === 'chromium'
    ? { chromium }
    : process.env.KAIRO_BROWSER === 'webkit'
      ? { webkit }
      : { chromium, webkit };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' };
// the deck ledger's first card, read from the artifact under test (decks/n2/deck.json)
const deck = JSON.parse(readFileSync(join(host.site, 'decks', 'n2', 'deck.json'), 'utf8'));
const DECK_WORD = deck.words[0].term;
const DECK_CARD = deck.words[0].cards[0].id;

// the bridge reads what Today drew from (its story, the day word); it changes nothing but, for the negative control, the
// drawn sky
const BRIDGE = `
window.__SKY__ = {
  story: () => { const pick = todayReadPick(); return pick ? (pick.passage.readingFacets?.forms || []) : []; },
  family: (word) => todayKanji(word).flatMap((c) => (D.kanjiWords?.[c] || []).map((w) => [w, c])),
  jlpt: (avoid) => Object.keys(D.words || {}).find((w) => D.words[w]?.jlpt && [...w].length === 2 && /\\p{Script=Han}/u.test(w) && !avoid.includes(w)),
};`;

const WHY = {
  bi: { test: 'missed in a test', yesterday: 'missed yesterday', unknown: 'you marked it not yet', twice: 'you looked it up twice', due: 'due today', story: "from today's story" },
  ja: { test: 'テストでまちがえた', yesterday: 'きのうまちがえた', unknown: '「まだ」にした', twice: '2回調べた', due: '今日の復習', story: '今日の読み物から' },
};
const kinWhy = (lang, kanji) => (lang === 'ja' ? `今日のことばと「${kanji}」が同じ` : `shares ${kanji} with today's word`);

function seededRecord(now) {
  const day = 86400000;
  return {
    v: 1,
    taken: [{ t: 'word', id: '学校', label: '学校', kind: '語', kindEn: 'word', from: null, ts: now - 9 * day }],
    srs: { 'word:学校': { due: new Date(now - 3600000).toISOString(), last_review: new Date(now - 5 * day).toISOString(), stability: 3, difficulty: 5, elapsed_days: 4, scheduled_days: 4, reps: 3, lapses: 0, learning_steps: 0, state: 2 } },
    revlog: [
      [now - 5 * day, 'word:学校', 3, 2, null, null, null, null, 3, 5, 4, 1200],
      [now - day, 'word:電話', 1, 2, null, null, null, null, 3, 5, 1, 1400],
    ],
    obslog: [
      [now - 2 * 3600000, 'mock', 'word:政府', 1, 'n3-01'],
      [now - 3 * day, 'reveal', 'word:練習', 0],
      [now - 2 * day, 'tap', 'word:経済', 2, 'wikinews:1403'],
      [now - 2 * day + 20 * 60000, 'tap', 'word:経済', 3, 'wikinews:1403'],
    ],
  };
}

async function readSky(page) {
  await page.waitForFunction(() => document.querySelectorAll('.today-star:not([hidden])').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  return page.evaluate(() => [...document.querySelectorAll('.today-star')]
    .filter((n) => !n.hidden && n.getBoundingClientRect().width)
    .map((n) => ({ text: n.textContent, kind: [...n.classList].find((c) => c !== 'today-star') || '', why: n.dataset.why || '', rank: Number(n.dataset.rank || 0) }))
    .sort((a, b) => a.rank - b.rank));
}
async function tapStar(page, text) {
  const star = page.locator('.today-star:not([hidden])', { hasText: text }).first();
  if (!(await star.count())) return { word: '', why: '(not in the sky)' };
  const box = await star.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('#mini[data-from="sky"]').waitFor({ timeout: 8000 });
  const line = await page.evaluate(() => ({ word: document.querySelector('#mini .mini-word')?.textContent || '', why: document.getElementById('mini-why')?.textContent || '' }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  return line;
}

try {
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch();
    try {
      for (const lang of ['bi', 'ja']) {
        const label = `${engine} ${lang}`;
        const why = WHY[lang];
        // Y1, Y2, Y4 — his learning first
        {
          const context = await browser.newContext({ ...phone, timezoneId: 'Asia/Tokyo' });
          await silenceBrowserAudio(context);
          const page = await context.newPage();
          page.setDefaultTimeout(20_000);
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.route('**/corridor.js', async (route) => {
            const response = await route.fetch();
            await route.fulfill({ response, body: `${await response.text()}\n${BRIDGE}` });
          });
          await page.goto(`${host.origin}/index.html?entry=shelf&ui=${lang}`);
          await page.waitForFunction(() => document.body.dataset.ready === '1');
          const now = await page.evaluate(() => Date.now());
          const seeded = seededRecord(now);
          await restoreAppFixture(page, seeded);
          await page.goto(`${host.origin}/index.html?room=tray&ui=${lang}`);
          await page.waitForFunction(() => document.body.dataset.ready === '1');
          const stars = await readSky(page);
          const dayWord = await page.evaluate(() => [...document.querySelectorAll('.dw-glyph .dw-k')].map((n) => n.textContent).join(''));
          const expected = [
            ['政府', 'missed', why.test], ['電話', 'missed', why.yesterday], ['練習', 'unknown', why.unknown],
            ['経済', 'looked', why.twice], ['学校', 'due', why.due],
          ].filter(([w]) => w !== dayWord);
          const lead = stars.slice(0, expected.length).map((s) => [s.text, s.kind, s.why]);
          check(`${label} · Y1 the sky leads with his learning, in rank: the latest miss, the older miss, the まだ, the look-ups, the due card`,
            JSON.stringify(lead) === JSON.stringify(expected), `${JSON.stringify(lead)} (day word ${dayWord})`);
          check(`${label} · Y1 every star says why it is there; ten at most`, stars.length <= 10 && stars.every((s) => s.why), stars.map((s) => `${s.text}:${s.why}`).join(' · '));
          for (const [word, , line] of expected) {
            const shown = await tapStar(page, word);
            check(`${label} · Y1 ${word}'s card says why: "${line}"`, shown.word === word && shown.why === line, JSON.stringify(shown));
          }
          // Y2 — a deck's Again, from this device's ledger for the N2 deck
          await page.evaluate(({ card, at }) => {
            localStorage.setItem('bunki-cloze:n2', JSON.stringify({ format: 'bunki-cloze-state', version: 1, deckId: 'n2', cards: {}, groupsOff: [], log: [[card, 1, at]], suspended: {}, repairs: {}, repairLog: [], lookups: [] }));
          }, { card: DECK_CARD, at: new Date(now - 86400000).toISOString() });
          await page.goto(`${host.origin}/index.html?room=tray&ui=${lang}`);
          await page.waitForFunction(() => document.body.dataset.ready === '1');
          const deckStar = await page.waitForFunction((w) => [...document.querySelectorAll('.today-star:not([hidden])')].find((n) => n.textContent === w)?.dataset.why || null, DECK_WORD, { timeout: 15000 })
            .then((handle) => handle.jsonValue()).catch(() => null);
          check(`${label} · Y2 a deck's Again (${DECK_WORD}) stands in the sky with its day`, deckStar === why.yesterday, String(deckStar));
          // Y4 — nothing written
          const after = await readAppRecord(page);
          // compared by value, key order aside (the store writes its own key order)
          const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
          const same = ['taken', 'srs', 'revlog', 'obslog'].every((root) => JSON.stringify(canon(after?.[root] ?? null)) === JSON.stringify(canon(seeded[root])));
          check(`${label} · Y4 opening the stars wrote nothing: taken, srs, revlog and obslog are as seeded`, same,
            JSON.stringify(['taken', 'srs', 'revlog', 'obslog'].map((r) => [r, JSON.stringify(after?.[r] ?? null).length, JSON.stringify(seeded[r]).length])));
          check(`${label} · Y1 no page errors`, errors.length === 0, errors.join(' | '));
          await page.screenshot({ path: join(out, `sky-seeded-${engine}-${lang}.png`) });
          await context.close();
        }
        // Y3 — a record with none of these: today's story and the day word's family only
        {
          const context = await browser.newContext(phone);
          await silenceBrowserAudio(context);
          const page = await context.newPage();
          page.setDefaultTimeout(20_000);
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.route('**/corridor.js', async (route) => {
            const response = await route.fetch();
            await route.fulfill({ response, body: `${await response.text()}\n${BRIDGE}` });
          });
          await page.goto(`${host.origin}/index.html?room=tray&ui=${lang}`);
          await page.waitForFunction(() => document.body.dataset.ready === '1' && window.__SKY__);
          await page.waitForTimeout(600);
          if (NEGATIVE === 'random') {
            await page.evaluate(() => {
              const avoid = [...window.__SKY__.story(), ...[...document.querySelectorAll('.today-star')].map((n) => n.textContent)];
              const word = window.__SKY__.jlpt(avoid);
              const lane = document.querySelector('.today-sky-lane');
              const star = document.createElement('button');
              star.className = 'today-star read';
              star.textContent = word;
              star.dataset.why = document.querySelector('.today-star.read')?.dataset.why || "from today's story";
              star.dataset.rank = '99';
              star.style.cssText = 'position:absolute;left:40%;top:4px;font-size:16px';
              lane.append(star);
            });
          }
          const stars = await readSky(page);
          const dayWord = await page.evaluate(() => [...document.querySelectorAll('.dw-glyph .dw-k')].map((n) => n.textContent).join(''));
          const story = await page.evaluate(() => window.__SKY__.story());
          const family = new Map(await page.evaluate((w) => window.__SKY__.family(w), dayWord));
          const storyKanji = new Set(stars.filter((s) => s.kind === 'read').flatMap((s) => [...s.text]));
          const wrong = stars.filter((s) => !(
            (s.kind === 'read' && story.includes(s.text) && s.why === why.story) ||
            (s.kind === 'glyph' && storyKanji.has(s.text) && s.why === why.story) ||
            (s.kind === 'kin' && family.has(s.text) && s.why === kinWhy(lang, family.get(s.text)))));
          check(`${label} · Y3 with nothing to remember, every star is today's story or the day word's family, with its reason`,
            stars.length > 0 && wrong.length === 0, `${stars.length} stars; outside: ${JSON.stringify(wrong)}`);
          check(`${label} · Y3 no random filler kinds (far JLPT words, a random saved word); ten at most`,
            stars.length <= 10 && !stars.some((s) => ['far', 'mine'].includes(s.kind)), stars.map((s) => s.kind).join(','));
          check(`${label} · Y3 no page errors`, errors.length === 0, errors.join(' | '));
          await page.screenshot({ path: join(out, `sky-fresh-${engine}-${lang}.png`) });
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  const failed = checks.filter((c) => !c.pass);
  console.log(failed.length ? `TODAY SKY (S) FAIL — ${failed.length} of ${checks.length}` : `TODAY SKY (S) PASS — ${checks.length} checks`);
  if (failed.length) process.exitCode = 1;
} finally {
  writeFileSync(join(out, 'today-sky-s.json'), `${JSON.stringify({ negative: NEGATIVE, checks }, null, 2)}\n`);
  await host.close();
}
assert(checks.length > 0, 'at least one check ran');
