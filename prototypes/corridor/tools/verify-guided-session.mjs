/**
 * 案内つきの稽古 — the guided session, walked in real browsers against a built site.
 *
 * One script for the prototype's key checks (check-samurai, check-rematch-live,
 * check-restart, check-integrated-moments), plus the port's own claims:
 *   D  doors: the study hall and the JLPT room each open the room in one tap
 *   J  the journey: arrival → six questions → explanation, word and grammar branches that
 *      return to the same place → results and Learn → a fresh context → a sentence of
 *      one's own → the return field; progress survives a reload
 *   S  覚える is real: the session's words and targets land in the learner's deck, show on
 *      the lists page (#deck-table / #review-start) and in the app's own due queue
 *   M  moments: the samurai cut, the rematch (block and bow), the crane, quiet · playful ·
 *      dramatic, the off switch, reduced motion, Escape/Skip, no stacking, report reachable
 *   R  restart and restore keep sessions exact and leave other storage alone
 *   H  held: the room mounted on a blank page of the built site with a stub deck whose writes the
 *      script holds open — 外す during enrolment, a later FINISH, unreadable saved bytes and set
 *      fields that carry markup (the fusion review of 2026-09-28)
 *
 * Browsers: Chromium and WebKit (playwright-core), 390×844 and 1280×800, headless.
 * GUIDED_MOMENTS=0 skips the M checks, for a build that ships without the moments module.
 * Usage:
 *   KAIRO_EVIDENCE_DIR=~/.dharma/... node prototypes/corridor/tools/verify-guided-session.mjs
 *   KAIRO_SITE_DIR pins a staged site; GUIDED_SHOTS_DIR sets the screenshot folder;
 *   KAIRO_BROWSER=chromium|webkit|all (default all); GUIDED_PORT (default 57091).
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {
  resolveCorridorEvidence,
  resolveCorridorSite,
} from '../../../scripts/resolve-corridor-site.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');

const SITE = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
const SHOTS =
  process.env.GUIDED_SHOTS_DIR ||
  join(homedir(), '.dharma/bunki_review/2026-09-28/living-thread/shots');
const PORT = Number(process.env.GUIDED_PORT || 57091);
const WHICH = process.env.KAIRO_BROWSER || 'all';
// GUIDED_MOMENTS=0 verifies a build without guided-moments.mjs: the journey and the deck only
const MOMENTS = process.env.GUIDED_MOMENTS !== '0';
const ONLY_VIEWPORTS = process.env.GUIDED_VIEWPORTS
  ? process.env.GUIDED_VIEWPORTS.split(',')
  : null;
const PARTS = new Set((process.env.GUIDED_PARTS || 'journey,moments,restart,held').split(','));
/* Negative controls: GUIDED_FAULT serves one deliberately broken file, so a run can show that
 * the checks catch the fault. The anchor must exist, or the control would prove nothing. */
const FAULTS = {
  // the bridge claims a card it never wrote: the session says 'added', the deck stays empty
  'deck-lies': {
    file: 'corridor.js',
    from: "const saved = await toggleTaken(node, label);\n        return saved && guidedTaken(node) ? 'added' : 'failed';",
    to: "return 'added';",
  },
  // progress is never written: a reload must lose it
  'no-save': {
    file: 'guided-session-engine.mjs',
    from: 'storage.setItem(key, JSON.stringify(state));',
    to: 'void key;',
  },
  // the samurai never plays
  'no-samurai': {
    file: 'guided-moments.mjs',
    from: 'function play(request = {}) {',
    to: 'function play(request = {}) {\n    return false;',
  },
};
const FAULT = process.env.GUIDED_FAULT ? FAULTS[process.env.GUIDED_FAULT] : null;
assert(!process.env.GUIDED_FAULT || FAULT, `unknown GUIDED_FAULT ${process.env.GUIDED_FAULT}`);
async function newContext(browser, options) {
  const context = await browser.newContext(options);
  if (FAULT) {
    await context.route(`**/${FAULT.file}`, async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      assert.equal(
        body.split(FAULT.from).length,
        2,
        `fault anchor must occur once in ${FAULT.file}`,
      );
      await route.fulfill({ response, body: body.replace(FAULT.from, FAULT.to) });
    });
  }
  return context;
}
const KEY = 'kairo-guided-session-v1:kairo-guided-n2-living-thread-01';
const Q = [
  'kairo-original-jlpt-n2-short-01:q01',
  'kairo-original-jlpt-n2-short-01:q03',
  'kairo-original-jlpt-n2-short-01:q05',
  'kairo-original-jlpt-n2-short-01:q06',
  'kairo-original-jlpt-n2-short-01:q09',
  'kairo-original-jlpt-n2-short-01:q10',
];
const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
];

const results = [];
const problems = [];
let current = '';
function check(name, pass, detail = '') {
  results.push({ run: current, name, pass: !!pass, detail: String(detail).slice(0, 300) });
  console.log(
    `  ${pass ? 'ok  ' : 'FAIL'} ${current} · ${name}${detail ? `  — ${String(detail).slice(0, 160)}` : ''}`,
  );
  return !!pass;
}

const host = await startStaticHost({ site: SITE, port: PORT });
const origin = host.origin;
const room = (page) => page.locator('.guided-room');
const act = (page, action, extra = '') =>
  page.locator(`.guided-room [data-action="${action}"]${extra}`).first();
const stored = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), KEY);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const activeAction = (page) =>
  page.evaluate(
    () => document.activeElement?.dataset?.action || document.activeElement?.tagName || '',
  );

async function ready(page) {
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 60_000 });
}
/** The register lifts a room in over ~160 ms on arrival; shots wait for it to settle. */
async function settle(page) {
  await page
    .waitForFunction(() => !document.documentElement.dataset.roomEntering, null, { timeout: 5_000 })
    .catch(() => {});
  await page.waitForTimeout(260);
}
async function shot(page, dir, name, { full = false } = {}) {
  await settle(page);
  if (full) await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: full });
}
async function openRoomFromHall(page) {
  await page.locator('#chrome-dojo').click();
  await page.locator('button[data-study-door="guided"]').click();
  await room(page).waitFor({ timeout: 20_000 });
  await page.waitForSelector('.guided-room .gs-main', { timeout: 20_000 });
}
async function answer(page, value) {
  await page.locator(`.guided-room [name="answer"][value="${value}"]`).check();
  await act(page, 'check').click();
}
async function skipMoment(page) {
  if (await page.locator('.samurai-effect').count()) await page.keyboard.press('Escape');
  await page.locator('.samurai-effect').waitFor({ state: 'detached', timeout: 5_000 });
}
async function waitNoPending(page) {
  await page.waitForFunction(
    () => !document.querySelector('.guided-room .gs-card[data-deck="pending"]'),
    null,
    { timeout: 20_000 },
  );
}
/** axe-core over the room alone (the app's chrome has its own suites): no violation of any impact. */
async function axeClean(page, stage) {
  const result = await new AxeBuilder({ page }).include('.guided-room').analyze();
  const found = result.violations.map((v) => `${v.id}(${v.impact})×${v.nodes.length}`);
  check(`A11y ${stage}: axe finds no violation in the room`, found.length === 0, found.join(' '));
}
async function dueKeys(page) {
  return page.evaluate(() => window.__KAIRO_SRS__?.dueKeys?.() || []);
}
function watchErrors(page, sink) {
  page.on('pageerror', (error) => sink.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // the report client asks its service for /api/config; this static host has none
    if (/Failed to load resource/u.test(text) && /404/u.test(text)) return;
    sink.push(`console: ${text}`);
  });
}

/* ------------------------------------------------------------ D + J + S + M */
async function journey(browser, browserName, viewport) {
  current = `${browserName}-${viewport.name}`;
  const dir = join(SHOTS, current);
  mkdirSync(dir, { recursive: true });
  const context = await newContext(browser, {
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const errors = [];
  watchErrors(page, errors);
  const overflowAt = [];
  const noOverflow = async (stage) => {
    const extra = await overflow(page);
    if (extra > 0) overflowAt.push(`${stage}:${extra}`);
  };
  try {
    await page.goto(`${origin}/index.html?entry=shelf&ui=bi`);
    await ready(page);
    await page.evaluate(() => localStorage.setItem('unrelated-data', 'keep'));

    // D · two doors, one tap each
    await page.locator('#chrome-dojo').click();
    const hallDoor = page.locator('button[data-study-door="guided"]');
    check('D1 the study hall lists the guided session as a door', await hallDoor.isVisible());
    await shot(page, dir, '00-study-hall-door');
    await page.locator('button[data-study-door="mock"]').click();
    const jlptDoor = page.locator('button[data-guided-door="mock"]');
    await jlptDoor.waitFor({ timeout: 20_000 });
    check(
      'D2 the JLPT room offers the guided session beside its chooser',
      await jlptDoor.isVisible(),
    );
    await shot(page, dir, '00-jlpt-room-door');
    await jlptDoor.click();
    await room(page).waitFor();
    await page.waitForSelector('.guided-room .gs-main', { timeout: 20_000 });
    check(
      'D3 the JLPT door opens the room in one tap',
      (await room(page).getAttribute('data-stage')) === 'home',
    );
    await page.locator('#back').click();
    check(
      'D4 戻る from the room front returns to the JLPT room',
      await page.locator('.exam-levels').isVisible(),
    );
    await openRoomFromHall(page);
    check(
      'D5 the study hall door opens the room in one tap',
      (await room(page).getAttribute('data-stage')) === 'home',
    );

    // J · arrival and setup
    check('J1 arrival names the set and its size', /N2/u.test(await room(page).innerText()));
    await shot(page, dir, '01-arrival', { full: true });
    await axeClean(page, 'arrival');
    await noOverflow('arrival');
    await act(page, 'setup').click();
    await shot(page, dir, '02-setup', { full: true });
    await act(page, 'start').click();
    check(
      'J2 the first question opens',
      (await room(page).getAttribute('data-stage')) === 'question',
    );
    check(
      'J3 the chrome recedes during the attempt (T8)',
      (await page.evaluate(() => document.documentElement.dataset.room)) === 'attempt',
    );
    await shot(page, dir, '03-question-1');
    await axeClean(page, 'question');
    await noOverflow('question');

    // M · the samurai on a wrong answer (check-samurai)
    const before = await stored(page);
    await answer(page, 1);
    const t0 = Date.now();
    if (MOMENTS) {
      await page.locator('.samurai-effect').waitFor({ timeout: 3_000 });
      check(
        'M1 a wrong answer launches the samurai',
        (await page.locator('.samurai-effect').count()) === 1,
      );
      check(
        'M2 the verdict stays explicit',
        (await page.locator('#samurai-effect-title').innerText()).trim() === 'Incorrect.',
      );
      for (const ms of [650, 1350, 1950]) {
        await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
        await page.screenshot({ path: join(dir, `04-samurai-${ms}.png`) });
        if (ms === 1350) {
          check(
            'M3 impact and paper break-up phases occur',
            (await page.locator('.samurai-effect--impact.samurai-effect--resolve').count()) === 1,
          );
        }
      }
      await page.locator('.samurai-effect').waitFor({ state: 'detached', timeout: 5_000 });
    } else {
      await page.waitForTimeout(400);
      check(
        'J3b without the moments module no overlay plays',
        (await page.locator('.samurai-effect').count()) === 0,
      );
    }
    const afterCut = await stored(page);
    check(
      'M4 the moment never changes the saved response',
      JSON.stringify(afterCut.answers) ===
        JSON.stringify({
          ...before.answers,
          [Q[0]]: { ...before.answers[Q[0]], choice: 1, correct: false },
        }),
    );
    check('M5 focus returns to the explanation door', (await activeAction(page)) === 'explain');
    check(
      'M6 the chosen wrong option carries the on-sheet cut',
      (await page.locator('.guided-room .gs-choice.is-wrong .gs-slash').count()) === 1,
    );
    await shot(page, dir, '05-verdict-cut');
    if (MOMENTS) {
      await act(page, 'samurai-replay').click();
      await page.locator('.samurai-effect').waitFor();
      await page.keyboard.press('Escape');
      check('M7 Escape dismisses a replay', (await page.locator('.samurai-effect').count()) === 0);
      check(
        'M8 Escape returns focus to the replay door',
        (await activeAction(page)) === 'samurai-replay',
      );
    }

    // J · the explanation, and a word door with the crane (check-integrated-moments)
    await act(page, 'explain').click();
    check(
      'J4 the explanation is the lacquer sheet',
      (await page.locator('.guided-room .gs-lacquer').count()) === 1,
    );
    check(
      'J5 the target carries its reading',
      (await page.locator('.guided-room .gs-target').innerText()).includes('てんけん'),
    );
    await shot(page, dir, '06-explanation', { full: true });
    await axeClean(page, 'explanation');
    await noOverflow('explanation');
    const doors = page.locator('.guided-room .gs-word[data-word="word_62"]');
    check('J6 teaching words are doors', (await page.locator('.guided-room .gs-word').count()) > 3);
    const occurrence = (await doors.count()) - 1;
    await doors.nth(occurrence).click();
    check(
      'J7 a word door opens the word with its reading',
      (await page.locator('.guided-room h1').innerText()).includes('せんもんか'),
    );
    await shot(page, dir, '07-word');
    await act(page, 'entry').click();
    await page.locator('#sheet').waitFor({ timeout: 10_000 });
    check(
      'J7b the word opens its full dictionary entry over the room',
      (await page.locator('#sheet').innerText()).includes('専門家'),
    );
    await page.locator('#sheet-back').click();
    await page.locator('#sheet').waitFor({ state: 'detached', timeout: 5_000 });
    check(
      'J7c closing the entry returns to the word, in place',
      (await room(page).getAttribute('data-stage')) === 'word',
    );
    const trayBefore = await page.locator('#tray').innerText();
    const answersBeforeSave = JSON.stringify((await stored(page)).answers);
    await act(page, 'save-word').click();
    if (MOMENTS) {
      await page.locator('.bunki-moment').waitFor({ timeout: 5_000 });
      check(
        'M9 the crane carries the saved word',
        (await page
          .locator('.bunki-moment:not(.bunki-moment--still) .bunki-moment__crane')
          .count()) === 1,
      );
      check(
        'M10 the crane says what was saved',
        (await page.locator('.bunki-moment__message').innerText()).includes('専門家'),
      );
      await page.waitForTimeout(700);
      await page.screenshot({ path: join(dir, '08-crane.png') });
    } else {
      await page.waitForFunction(() =>
        document.querySelector('.guided-room .gs-card[data-deck="ready"]'),
      );
      await shot(page, dir, '08-saved');
    }
    check(
      'M11 saving keeps keyboard focus in the room',
      (await activeAction(page)) === 'close-word',
    );
    const afterSave = await stored(page);
    check(
      'S1 the saved word is recorded once, with its source',
      afterSave.savedWords.length === 1 &&
        afterSave.savedWords[0].wordId === 'word_62' &&
        afterSave.savedWords[0].sourceId === Q[0] &&
        afterSave.savedWords[0].status === 'added',
      JSON.stringify(afterSave.savedWords),
    );
    check(
      'S2 saving never changes a recorded answer',
      JSON.stringify(afterSave.answers) === answersBeforeSave,
    );
    check(
      'S3 覚える reached the real deck (the 覚 count moved)',
      (await page.locator('#tray').innerText()) !== trayBefore,
      `${trayBefore} → ${await page.locator('#tray').innerText()}`,
    );
    check(
      'S4 the word is in the app’s own review queue',
      (await dueKeys(page)).includes('word:専門家'),
    );
    if (MOMENTS) await page.locator('.bunki-moment').waitFor({ state: 'detached', timeout: 5_000 });
    await act(page, 'close-word').click();
    check(
      'J8 closing the word returns focus to the exact occurrence',
      await page.evaluate(
        (n) =>
          document.activeElement ===
          document.querySelectorAll('.guided-room .gs-word[data-word="word_62"]')[n],
        occurrence,
      ),
    );

    // J · Q2 correct: no samurai
    await act(page, 'next').click();
    await answer(page, 1);
    await page.waitForTimeout(400);
    check('M12 a correct answer never cuts', (await page.locator('.samurai-effect').count()) === 0);
    check(
      'J9 a correct answer puts Next first',
      (await page.locator('.guided-room .gs-button.primary[data-action="next"]').count()) === 1,
    );
    // a card added outside the room, through the app's own dictionary sheet (its 覚える), is
    // read back by the room like any other real row
    await act(page, 'explain').click();
    await page.locator('.guided-room .gs-word[data-word="word_58"]').first().click();
    await act(page, 'entry').click();
    await page.locator('#sheet #take').click();
    await page.waitForFunction(
      () => document.querySelector('#sheet #take')?.getAttribute('aria-pressed') === 'true',
    );
    check(
      'S0 the app’s own entry sheet adds 支障 while the room waits underneath',
      (await dueKeys(page)).includes('word:支障'),
    );
    await page.locator('#sheet-back').click();
    await page.locator('#sheet').waitFor({ state: 'detached', timeout: 5_000 });
    check(
      'S0b the room’s word door reads that card as already in the deck',
      (await page.locator('.guided-room [data-action="save-word"]').isDisabled()) &&
        (await page
          .locator('.guided-room .gs-deck-line .gs-card[data-card="word:支障"]')
          .count()) === 1,
    );
    await act(page, 'close-word').click();
    await act(page, 'next').click();

    // J · Q3: explanation first, a grammar branch, back to the same place
    await act(page, 'explain').click();
    const assisted = await stored(page);
    check(
      'J10 an explanation before answering marks the answer assisted',
      assisted.answers[Q[2]].helpBefore === true,
    );
    await page.locator('.guided-room [data-action="branch"][data-key="sumu"]').click();
    check(
      'J11 a branch opens as its own sheet',
      (await room(page).getAttribute('data-stage')) === 'branch',
    );
    await shot(page, dir, '09-branch');
    await page.locator('#back').click();
    check(
      'J12 戻る closes the branch and returns to the explanation',
      (await room(page).getAttribute('data-stage')) === 'insight',
    );
    check(
      'J13 focus returns to the branch door it left',
      (await page.evaluate(() => document.activeElement?.dataset?.key)) === 'sumu',
    );
    await act(page, 'question').click();
    await answer(page, 1);
    await skipMoment(page);
    await act(page, 'next').click();

    // Q4 wrong; Q5 flagged and right; Q6 right
    await answer(page, 0);
    await skipMoment(page);
    await act(page, 'next').click();
    await act(page, 'flag').click();
    await answer(page, 3);
    await shot(page, dir, '10-reading-notice', { full: true });
    await noOverflow('reading');
    await act(page, 'next').click();
    await answer(page, 0);
    await act(page, 'next').click();
    check(
      'J14 after six questions the summary gathers them',
      (await room(page).getAttribute('data-stage')) === 'summary',
    );
    await shot(page, dir, '11-summary', { full: true });

    // S · results and Learn: missed and flagged targets go into the real deck
    await act(page, 'finish').click();
    await waitNoPending(page);
    const finished = await stored(page);
    check(
      'J15 Learn gathers the missed and flagged questions',
      JSON.stringify(finished.learn.map((row) => row.id)) ===
        JSON.stringify([Q[0], Q[2], Q[3], Q[4]]),
      JSON.stringify(finished.learn.map((row) => row.id)),
    );
    const statuses = Object.fromEntries(
      finished.learn.flatMap((row) => row.cards.map((card) => [card.key, card.status])),
    );
    check(
      'S5 each enrolable target was added to the deck',
      statuses['word:点検'] === 'added' &&
        statuses['grammar:n2-mono-no'] === 'added' &&
        statuses['word:受付'] === 'added' &&
        statuses['word:済ませる'] === 'added',
      JSON.stringify(statuses),
    );
    check(
      'S6 a pattern Bunki has no card for says so instead of inventing one',
      (await page
        .locator('.guided-room [data-learn-row$=":q05"] .gs-card[data-deck="none"]')
        .count()) === 1,
    );
    const due = await dueKeys(page);
    const expected = [
      'word:専門家',
      'word:点検',
      'grammar:n2-mono-no',
      'word:受付',
      'word:済ませる',
    ];
    check(
      'S7 every session card is new and waiting in the app’s due queue',
      expected.every((key) => due.includes(key)),
      JSON.stringify(due),
    );
    check(
      'S8 the results rows read the real deck',
      (await page.locator('.guided-room .gs-card[data-deck="ready"]').count()) >= 4,
    );
    await shot(page, dir, '12-results', { full: true });
    await axeClean(page, 'results');
    await noOverflow('results');

    // J · the prepared question for Sensei, and the tutor room's way back
    await act(page, 'sensei-target').click();
    const prepared = await page.locator('#guided-sensei-prompt').inputValue();
    check(
      'J15b Sensei receives the sentence, the first answer and the source',
      prepared.includes('My first answer') && prepared.includes('kairo-original-jlpt-n2-short-01'),
    );
    await shot(page, dir, '12b-sensei', { full: true });
    await act(page, 'tutor').click();
    await page.waitForFunction(() => document.body.dataset.view === 'ai');
    check('J15c the tutor room opens', true);
    await page.locator('#back').click();
    check(
      'J15d 戻る from the tutor returns to the prepared question',
      (await room(page).getAttribute('data-stage')) === 'sensei',
    );
    await page.locator('.guided-room [data-action="nav"][data-view="learn"]').click();

    // undo and restore one row through the same door
    await act(page, 'undo', `[data-id="${Q[4]}"]`).click();
    await page.waitForFunction(
      (id) =>
        !!JSON.parse(
          localStorage.getItem('kairo-guided-session-v1:kairo-guided-n2-living-thread-01'),
        ).learn.find((row) => row.id === id)?.removed,
      Q[4],
    );
    const removedDue = await dueKeys(page);
    check(
      'S9 Remove takes the session’s own cards out of the deck',
      !removedDue.includes('word:受付') && !removedDue.includes('word:済ませる'),
      JSON.stringify(removedDue),
    );
    await act(page, 'undo', `[data-id="${Q[4]}"]`).click();
    await page.waitForFunction(
      (id) =>
        JSON.parse(
          localStorage.getItem('kairo-guided-session-v1:kairo-guided-n2-living-thread-01'),
        ).learn.find((row) => row.id === id)?.removed === false,
      Q[4],
    );
    await waitNoPending(page);
    const restoredDue = await dueKeys(page);
    check(
      'S10 Restore puts them back',
      restoredDue.includes('word:受付') && restoredDue.includes('word:済ませる'),
      JSON.stringify(restoredDue),
    );
    await page.locator('.guided-room [data-action="nav"][data-view="learn"]').click();
    await shot(page, dir, '13-learn', { full: true });
    await axeClean(page, 'learn');
    check(
      'S11 Learn lists the saved word with its deck state',
      (await page
        .locator('.guided-room [data-saved-word="word_62"] .gs-card[data-deck="ready"]')
        .count()) === 1,
    );

    // M · the rematch (check-rematch-live): the missed 点検, met again and answered right
    await act(page, 'practice', `[data-id="${Q[0]}"]`).click();
    check(
      'J16 a fresh context opens for the chosen target',
      (await page.locator('.guided-room [data-fresh="tenken"]').count()) === 1,
    );
    await shot(page, dir, '14-fresh');
    await page.locator('.guided-room [name="fresh-answer"][value="0"]').check();
    await act(page, 'check-fresh').click();
    if (MOMENTS) {
      await page.locator('.samurai-effect--rematch').waitFor({ timeout: 3_000 });
      check(
        'M13 the rematch plays for a missed target answered right later',
        (await page.locator('.samurai-effect--rematch').count()) === 1,
      );
      check(
        'M14 the rematch verdict is explicit',
        (await page.locator('#samurai-effect-title').innerText()).trim() === 'Correct.',
      );
      await page.waitForTimeout(700);
      check(
        'M16 the learner blocks (guard) before the samurai bows',
        (await page.locator('.samurai-effect--guard').count()) === 1,
      );
      await page.screenshot({ path: join(dir, '15-rematch-block.png') });
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(dir, '16-rematch-bow.png') });
      await page.keyboard.press('Escape');
    }
    check(
      'M15 the original answer stays wrong in the record',
      (await stored(page)).answers[Q[0]].correct === false,
    );
    check(
      'M17 after the fresh verdict, focus rests on the next step',
      (await activeAction(page)) === 'expression',
    );
    await shot(page, dir, '17-fresh-verdict');

    // J · a sentence of one's own, then the return field
    await act(page, 'expression').click();
    await page.locator('#guided-draft').fill('実物を見ないことには、何も決められない。');
    await shot(page, dir, '18-expression');
    await act(page, 'record-return').click();
    check('J17 the return field opens', (await room(page).getAttribute('data-stage')) === 'field');
    const field = await stored(page);
    check('J18 the practised target is marked practised', field.reviewed.includes(Q[0]));
    check(
      'J19 the field reads the real deck: 5 session cards and 支障 from the sheet are ready',
      /復習する · 6/u.test(await act(page, 'review').innerText()),
      await act(page, 'review').innerText(),
    );
    check(
      'J19b a target with no Learn row still shows the card the deck already holds',
      /Ready to review/u.test(
        await page.locator('.guided-room .gs-node[data-index="1"]').innerText(),
      ),
      await page.locator('.guided-room .gs-node[data-index="1"]').innerText(),
    );
    check(
      'J20 the sentence is kept as the learner’s own words',
      (await page.locator('.guided-room .gs-personal-line').innerText()).includes(
        '実物を見ないことには',
      ),
    );
    await shot(page, dir, '19-return-field', { full: true });
    await axeClean(page, 'return field');
    await noOverflow('field');
    await act(page, 'return-home').click();
    check(
      'J21 returning, the front door carries what is ready in the deck',
      (await page.locator('.guided-room .gs-duecard').count()) === 1,
    );
    await shot(page, dir, '20-return-home', { full: true });

    // J · progress survives a reload
    const beforeReload = await stored(page);
    await page.reload();
    await ready(page);
    await openRoomFromHall(page);
    const afterReload = await stored(page);
    check(
      'J22 reload keeps the whole session',
      JSON.stringify(afterReload) === JSON.stringify(beforeReload),
    );
    check(
      'J23 reload returns to the same place in the room',
      (await room(page).getAttribute('data-stage')) === 'home' &&
        (await page.locator('.guided-room .gs-duecard').count()) === 1,
    );
    await page.locator('.guided-room [data-action="nav"][data-view="learn"]').click();
    check(
      'J24 reload keeps the saved word in Learn',
      (await page.locator('.guided-room [data-saved-word="word_62"]').count()) === 1,
    );

    // S · the SRS lists page shows the session's cards
    await act(page, 'deck').click();
    await page.locator('#deck-table').waitFor();
    const counts = await page.evaluate(() => {
      const all = document.querySelector('#deck-table .deck-row.deck-all');
      return {
        newCount: Number(all?.querySelector('.c-new')?.textContent || 0),
        start: document.querySelector('#review-start')?.textContent || '',
        disabled: document.querySelector('#review-start')?.disabled,
      };
    });
    check(
      'S12 #deck-table counts the six new cards (five from the session, 支障 from the sheet)',
      counts.newCount === 6,
      JSON.stringify(counts),
    );
    check(
      'S13 #review-start offers them for review',
      counts.disabled === false && /6/u.test(counts.start),
      JSON.stringify(counts),
    );
    await shot(page, dir, '21-srs-lists', { full: true });
    await page.locator('#review-start').click();
    await page.waitForFunction(() => document.body.dataset.view === 'review');
    const face = await page.locator('#app main').innerText();
    check(
      'S14 the first review card is one the session added',
      ['専門家', '点検', 'ものの', '受付', '済ませる', '支障'].some((word) => face.includes(word)),
      face.slice(0, 80),
    );
    await shot(page, dir, '22-srs-review-card');
    await page.locator('#zen-exit').click();
    await page.locator('#deck-table').waitFor();
    await page.locator('#back').click();
    check('S15 戻る from the lists page returns to the guided room', await room(page).isVisible());

    check('X1 no horizontal overflow at any stage', overflowAt.length === 0, overflowAt.join(' '));
    check(
      'X2 unrelated storage is untouched',
      (await page.evaluate(() => localStorage.getItem('unrelated-data'))) === 'keep',
    );
  } catch (error) {
    check('journey completed without an exception', false, error.message);
    await page.screenshot({ path: join(dir, 'zz-failure.png') }).catch(() => {});
  } finally {
    check('X3 no page errors', errors.length === 0, errors.join(' | '));
    problems.push(...errors.map((error) => `${current}: ${error}`));
    await context.close();
  }
}

/* --------------------------------------------------- M · switches and reduced motion */
async function switches(browser, browserName) {
  current = `${browserName}-moments`;
  const dir = join(SHOTS, current);
  mkdirSync(dir, { recursive: true });
  const context = await newContext(browser, {
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const errors = [];
  watchErrors(page, errors);
  try {
    await page.goto(`${origin}/index.html?entry=shelf&ui=bi`);
    await ready(page);
    await openRoomFromHall(page);
    await page.locator('.guided-room [data-moment-mode]').selectOption('dramatic');
    await act(page, 'samurai-demo').click();
    await page.locator('.samurai-effect').waitFor();
    check(
      'M20 dramatic is a real style',
      (await page.locator('.samurai-effect--dramatic').count()) === 1,
    );
    check(
      'M21 the demo says no result is recorded',
      /no result recorded/iu.test(await page.locator('.samurai-effect__eyebrow').innerText()),
    );
    // dramatic cuts to black at the strike (1020 ms); the stage returns by ~1300 ms
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(dir, '30-dramatic.png') });
    await page.locator('[data-moment-skip]').click();
    check('M22 Skip dismisses', (await page.locator('.samurai-effect').count()) === 0);
    await page.locator('.guided-room [data-moment-mode]').selectOption('quiet');
    await act(page, 'setup').click();
    await act(page, 'start').click();
    await answer(page, 1);
    await page.waitForTimeout(500);
    check(
      'M23 quiet plays no samurai on a miss, only the cut on the sheet',
      (await page.locator('.samurai-effect').count()) === 0 &&
        (await page.locator('.guided-room .gs-slash').count()) === 1,
    );
    await act(page, 'samurai-replay').click();
    await page.locator('.samurai-effect--quiet').waitFor();
    check(
      'M24 quiet still plays an explicit replay, briefly',
      (await page.locator('.samurai-effect--quiet').count()) === 1,
    );
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(dir, '31-quiet-replay.png') });
    await page.locator('.samurai-effect').waitFor({ state: 'detached', timeout: 3_000 });
    await page.locator('.guided-room [data-moment-mode]').selectOption('playful');
    await act(page, 'moments-toggle').click();
    await page.reload();
    await ready(page);
    await openRoomFromHall(page);
    check(
      'M25 the off switch persists across a reload',
      (await act(page, 'moments-toggle').getAttribute('aria-pressed')) === 'false',
    );
    await act(page, 'next').click();
    await answer(page, 0);
    await page.waitForTimeout(500);
    check(
      'M26 with moments off, a miss plays nothing',
      (await page.locator('.samurai-effect').count()) === 0,
    );
    await act(page, 'moments-toggle').click();
    const sprite = await page.evaluate(async () => {
      const probe = document.createElement('div');
      probe.className = 'samurai-effect__samurai-art';
      document.body.append(probe);
      const url = getComputedStyle(probe).backgroundImage;
      probe.remove();
      const src = url.replace(/^url\(["']?/u, '').replace(/["']?\)$/u, '');
      const image = new Image();
      image.src = src;
      await image.decode();
      return { url, width: image.naturalWidth, height: image.naturalHeight };
    });
    check(
      'M27 the sprite sheet is the provenance-noted asset and decodes',
      /guided\/samurai-sprites-v2\.png/u.test(sprite.url) &&
        sprite.width === 1226 &&
        sprite.height === 1283,
      JSON.stringify(sprite),
    );
    const provenance = await page.request.get(`${origin}/guided/SAMURAI-PROVENANCE.md`);
    check(
      'M28 the sprite’s provenance note ships beside it',
      provenance.ok() &&
        (await provenance.text()).includes(
          '4073e2511a9b7379f3736355e9cda52fd878a7b1b778e24e79bfdf9cccc67848',
        ),
    );
    await act(page, 'samurai-demo').click();
    await page.locator('.samurai-effect').waitFor();
    await page.locator('[data-moment-report]').click();
    await page.waitForFunction(() => !!document.querySelector('dialog.br-sheet[open]'), null, {
      timeout: 5_000,
    });
    check(
      'M29 Report a problem is reachable from the moment',
      (await page.locator('dialog.br-sheet[open]').count()) === 1,
    );
    check(
      'M30 opening a report ends the moment and lifts the glass',
      (await page.locator('.samurai-effect').count()) === 0 &&
        !(await page.evaluate(() => document.getElementById('app').hasAttribute('inert'))),
    );
    await page.locator('dialog.br-sheet [data-br="close"]').first().click();
  } catch (error) {
    check('moment switches completed without an exception', false, error.message);
    await page.screenshot({ path: join(dir, 'zz-failure.png') }).catch(() => {});
  } finally {
    check('X3 no page errors', errors.length === 0, errors.join(' | '));
    problems.push(...errors.map((error) => `${current}: ${error}`));
    await context.close();
  }

  current = `${browserName}-reduced`;
  const reducedContext = await newContext(browser, {
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const reduced = await reducedContext.newPage();
  const reducedErrors = [];
  watchErrors(reduced, reducedErrors);
  try {
    await reduced.goto(`${origin}/index.html?entry=shelf&ui=bi`);
    await ready(reduced);
    await openRoomFromHall(reduced);
    await act(reduced, 'setup').click();
    await act(reduced, 'start').click();
    await answer(reduced, 1);
    await reduced.waitForTimeout(500);
    check(
      'M31 reduced motion suppresses the automatic samurai',
      (await reduced.locator('.samurai-effect').count()) === 0,
    );
    check(
      'M32 reduced motion still shows the cut, drawn',
      (await reduced.locator('.guided-room .gs-slash').count()) === 1,
    );
    await act(reduced, 'samurai-replay').click();
    await reduced.locator('.samurai-effect').waitFor();
    check(
      'M33 an explicit replay is still available',
      (await reduced.locator('.samurai-effect').count()) === 1,
    );
    await reduced.waitForTimeout(100);
    check(
      'M34 the explicit replay actually animates',
      await reduced
        .locator('.samurai-effect__samurai')
        .evaluate((node) => getComputedStyle(node).animationName !== 'none'),
    );
    await reduced.locator('[data-moment-skip]').click();
    await reduced.evaluate(() => {
      document.querySelector('.guided-room [data-action="samurai-replay"]').click();
      document.querySelector('.guided-room [data-action="samurai-replay"]').click();
    });
    check('M35 replays never stack', (await reduced.locator('.samurai-effect').count()) === 1);
    await reduced.evaluate(() =>
      document.querySelector('.guided-room [data-action="next"]').click(),
    );
    check(
      'M36 navigation takes the moment off the glass',
      (await reduced.locator('.samurai-effect').count()) === 0,
    );
    await act(reduced, 'explain').click();
    await reduced.locator('.guided-room .gs-word').first().click();
    await act(reduced, 'save-word').click();
    await reduced.locator('.bunki-moment').waitFor();
    check(
      'M37 under reduced motion the crane stays still: only the line',
      (await reduced.locator('.bunki-moment--still').count()) === 1,
    );
    await reduced.screenshot({
      path: join(SHOTS, `${browserName}-moments`, '32-reduced-save.png'),
    });
  } catch (error) {
    check('reduced-motion walk completed without an exception', false, error.message);
  } finally {
    check('X3 no page errors', reducedErrors.length === 0, reducedErrors.join(' | '));
    problems.push(...reducedErrors.map((error) => `${current}: ${error}`));
    await reducedContext.close();
  }
}

/* ------------------------------------------------------------------ R · restart */
async function restart(browser, browserName) {
  current = `${browserName}-restart`;
  const dir = join(SHOTS, current);
  mkdirSync(dir, { recursive: true });
  const context = await newContext(browser, {
    viewport: { width: 390, height: 844 },
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const errors = [];
  watchErrors(page, errors);
  try {
    await page.goto(`${origin}/index.html?entry=shelf&ui=bi`);
    await ready(page);
    const original = await page.evaluate(
      async ({ key, ids }) => {
        const engine = await import('/guided-session-engine.mjs');
        const set = await (await fetch('/guided/sets/n2-living-thread-01.json')).json();
        let state = engine.createGuidedState(set.id, ids);
        const step = (event) => {
          state = engine.reduceGuidedState(state, { at: 1000, ...event });
        };
        step({ type: 'START' });
        for (const q of set.questions)
          step({
            type: 'COMMIT',
            id: q.id,
            choice: (q.correct + 1) % q.options.length,
            correct: false,
          });
        step({ type: 'DRAFT', text: '前のセッションの文章。' });
        step({
          type: 'FINISH',
          questions: set.questions.map((q) => ({ id: q.id, target: q.target.label })),
        });
        localStorage.setItem(key, JSON.stringify(state));
        localStorage.setItem('unrelated-data', 'keep');
        return state;
      },
      { key: KEY, ids: Q },
    );
    await openRoomFromHall(page);
    const state = () => stored(page);
    check('R1 a completed session is reproduced', (await state()).finished === true);
    if (MOMENTS) {
      await act(page, 'samurai-demo').click();
      await page.locator('.samurai-effect').waitFor();
      check(
        'R2 watch works on a completed session',
        (await page.locator('.samurai-effect').count()) === 1,
      );
      await page.keyboard.press('Escape');
    }
    check(
      'R3 watching (or opening) never regrades',
      JSON.stringify(await state()) === JSON.stringify(original),
    );
    await act(page, 'restart').click();
    let s = await state();
    check(
      'R4 restart opens question 1, fresh and unlocked',
      s.view === 'question' &&
        s.index === 0 &&
        s.started &&
        !s.finished &&
        Object.values(s.answers).every((a) => a.choice === null) &&
        (await page.locator('.guided-room [name="answer"]:enabled').count()) === 4,
    );
    check(
      'R5 the old Learn rows and draft do not leak',
      !s.learn.length && !s.draft && !s.fresh.revealed,
    );
    check(
      'R6 the previous session is kept exactly',
      (await page.evaluate((key) => localStorage.getItem(`${key}:previous`), KEY)) ===
        JSON.stringify(original),
    );
    await shot(page, dir, '40-restarted', { full: true });
    // check-integrated-moments: every target carries its reading, every explanation has doors
    const readings = await page.evaluate(async () =>
      (await (await fetch('/guided/sets/n2-living-thread-01.json')).json()).questions.map(
        (q) => q.target.reading,
      ),
    );
    for (const [i, reading] of readings.entries()) {
      await page.locator(`.guided-room .gs-progress [data-index="${i}"]`).click();
      await act(page, 'explain').click();
      check(
        `R6.${i + 1} Q${i + 1}’s target carries its reading`,
        (await page.locator('.guided-room .gs-target').innerText()).includes(reading),
        reading,
      );
      check(
        `R6.${i + 1} Q${i + 1}’s explanation has word doors`,
        (await page.locator('.guided-room .gs-word').count()) > 0,
      );
      await act(page, 'question').click();
    }
    await page.locator('.guided-room .gs-progress [data-index="0"]').click();
    await answer(page, 1);
    await skipMoment(page);
    s = await state();
    check('R7 a new wrong answer is recorded', s.answers[Q[0]].choice === 1);
    await page.reload();
    await ready(page);
    await openRoomFromHall(page);
    check(
      'R8 reload keeps the new answer and does not restart again',
      JSON.stringify(await state()) === JSON.stringify(s) &&
        (await page.locator('.samurai-effect').count()) === 0,
    );
    await act(page, 'restore-session').click();
    check(
      'R9 restore brings back results, Learn and draft exactly',
      JSON.stringify(await state()) === JSON.stringify(original),
    );
    await act(page, 'restart').click();
    await page.locator('.guided-room [name="answer"][value="1"]').check();
    await act(page, 'restart').click();
    check(
      'R10 restart also clears a tentative selection',
      (await page.locator('.guided-room [name="answer"]:checked').count()) === 0 &&
        (await act(page, 'check').isDisabled()),
    );
    check(
      'R11 unrelated storage is untouched',
      (await page.evaluate(() => localStorage.getItem('unrelated-data'))) === 'keep',
    );
    await page.locator('.guided-room [data-action="nav"][data-view="about"]').click();
    check(
      'R12 the about page carries the truthful source label',
      /not an official JLPT paper/u.test(await room(page).innerText()),
    );
    await shot(page, dir, '41-about', { full: true });
    await act(page, 'reset').click();
    await act(page, 'reset-confirm').click();
    const cleared = await state();
    check(
      'R13 a confirmed reset clears only this session',
      cleared.view === 'home' &&
        !cleared.started &&
        Object.values(cleared.answers).every((a) => a.choice === null) &&
        (await page.evaluate(() => localStorage.getItem('unrelated-data'))) === 'keep',
    );
  } catch (error) {
    check('restart walk completed without an exception', false, error.message);
    await page.screenshot({ path: join(dir, 'zz-failure.png') }).catch(() => {});
  } finally {
    check('X3 no page errors', errors.length === 0, errors.join(' | '));
    problems.push(...errors.map((error) => `${current}: ${error}`));
    await context.close();
  }
}

/* ------------------------------------------------------------------ H (held) */
const HELD_PAGE = `${origin}/__guided-held.html`;
/** Mount the real room (guided-session.mjs from the built site) over a stub host whose deck
 * writes wait until the script releases them. `status` rewrites one question's source status. */
async function mountHeld(page, { seedBytes = null, status = null } = {}) {
  await page.goto(HELD_PAGE);
  await page.evaluate(
    async ({ key, seedBytes, status }) => {
      if (seedBytes !== null) localStorage.setItem(key, seedBytes);
      const { createGuidedSession } = await import('/guided-session.mjs');
      const deck = new Map();
      const probe = { hold: true, pending: [], deck, writes: [] };
      const nodeKey = (node) => `${node.t}:${node.id}`;
      let room;
      const host = {
        english: () => true,
        storage: () => localStorage,
        render: () => {
          const main = document.getElementById('main');
          main.replaceChildren();
          room.render(main);
        },
        fetchJson: (path) =>
          fetch(new URL(path, document.baseURI))
            .then((response) => response.json())
            .then((json) => {
              if (status && Array.isArray(json.questions)) json.questions[0].source.status = status;
              return json;
            }),
        openReport: null,
        openTutor: null,
        openEntry: () => {},
        deck: {
          status: (node) => ({ state: deck.has(nodeKey(node)) ? 'taken' : 'take' }),
          info: (nodes) =>
            nodes.map((node) =>
              deck.has(nodeKey(node))
                ? { taken: true, ready: false, studied: false, kind: 'new', when: 'new' }
                : { taken: false, ready: false, studied: false, kind: null, when: '' },
            ),
          title: (node) => node.id,
          add: (node) =>
            new Promise((resolve) => {
              const finish = () => {
                const id = nodeKey(node);
                probe.writes.push(`add ${id}`);
                if (deck.has(id)) return resolve('existing');
                deck.set(id, true);
                return resolve('added');
              };
              if (probe.hold) probe.pending.push(finish);
              else finish();
            }),
          remove: async (node) => {
            probe.writes.push(`remove ${nodeKey(node)}`);
            deck.delete(nodeKey(node));
            return true;
          },
          review: () => false,
          open: () => {},
        },
      };
      probe.release = () => probe.pending.splice(0).forEach((finish) => finish());
      probe.snapshot = () => room.snapshot();
      window.__heldProbe = probe;
      room = createGuidedSession(host);
      host.render();
    },
    { key: KEY, seedBytes, status },
  );
  await page.waitForSelector('.guided-room .gs-main', { timeout: 20_000 });
}
const heldDeck = (page) => page.evaluate(() => [...window.__heldProbe.deck.keys()].sort());
const heldPending = (page) => page.evaluate(() => window.__heldProbe.pending.length);
async function releaseAll(page) {
  for (let round = 0; round < 20; round += 1) {
    await page.waitForTimeout(80);
    if (!(await heldPending(page))) {
      await page.waitForTimeout(120);
      if (!(await heldPending(page))) return;
    }
    await page.evaluate(() => window.__heldProbe.release());
  }
}

async function held(browser, browserName) {
  current = `${browserName}-held`;
  const context = await newContext(browser, {
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  await context.route(HELD_PAGE, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html lang="ja"><meta charset="utf-8"><title>held</title><main id="main"></main></html>',
    }),
  );
  const page = await context.newPage();
  const errors = [];
  watchErrors(page, errors);
  try {
    // 外す while the deck write of an earlier row is still out, then a later FINISH
    await mountHeld(page);
    await page.evaluate(
      async ({ key, ids }) => {
        const engine = await import('/guided-session-engine.mjs');
        const at = Date.now();
        const correct = [0, 1, 0, 2, 3, 0];
        const missed = new Set([0, 1, 4]);
        let state = engine.createGuidedState('kairo-guided-n2-living-thread-01', ids);
        state = engine.reduceGuidedState(state, { type: 'START', at, source: 'held-probe' });
        ids.forEach((id, i) => {
          const choice = missed.has(i) ? (correct[i] + 1) % 4 : correct[i];
          state = engine.reduceGuidedState(state, { type: 'COMMIT', id, choice, correct: !missed.has(i), at, source: 'held-probe' });
        });
        state = engine.reduceGuidedState(state, { type: 'NAVIGATE', view: 'summary', at, source: 'held-probe' });
        engine.saveGuidedState(localStorage, key, state);
      },
      { key: KEY, ids: Q },
    );
    await mountHeld(page);
    await act(page, 'finish').click();
    await page.waitForFunction(() => window.__heldProbe.pending.length === 1, null, { timeout: 10_000 });
    const q09 = Q[4];
    const removeDoor = page.locator(`.guided-room [data-action="undo"][data-id="${q09}"]`);
    check('H1 外す is not offered while the room is still writing its cards', await removeDoor.isDisabled());
    await page.evaluate((id) => document.querySelector(`.guided-room [data-action="undo"][data-id="${id}"]`)?.click(), q09);
    // a later FINISH while the first write is still out: flag q10, walk to the summary, gather again
    await act(page, 'source', '[data-index="4"]').click();
    await act(page, 'source', '[data-index="5"]').click();
    await act(page, 'flag').click();
    await act(page, 'next').click();
    await act(page, 'finish').click();
    await releaseAll(page);
    const settled = await page.evaluate(() => window.__heldProbe.snapshot());
    const row = (id) => settled.learn.find((entry) => entry.id === id);
    const deckNow = await heldDeck(page);
    check(
      'H2 a row the learner tried to remove mid-write is not left removed with its cards in the deck',
      !(row(q09)?.removed && ['word:受付', 'word:済ませる'].some((key) => deckNow.includes(key))),
      JSON.stringify({ removed: row(q09)?.removed, deck: deckNow }),
    );
    check(
      'H3 a row gathered by a later FINISH is enrolled in the same pass',
      row(Q[5])?.cards.every((card) => card.status === 'added') && deckNow.includes('word:限り'),
      JSON.stringify(row(Q[5])),
    );
    check(
      'H4 nothing is left "adding to your deck…"',
      settled.learn.every((entry) => entry.cards.every((card) => card.status !== 'pending')) &&
        (await page.locator('.guided-room .gs-card[data-deck="pending"]').count()) === 0,
      JSON.stringify(settled.learn.map((entry) => entry.cards.map((card) => card.status))),
    );
    await page.waitForFunction(
      (id) => !document.querySelector(`.guided-room [data-action="undo"][data-id="${id}"]`)?.disabled,
      q09,
      { timeout: 10_000 },
    );
    await removeDoor.click();
    await releaseAll(page);
    const after = await page.evaluate(() => window.__heldProbe.snapshot());
    const deckAfter = await heldDeck(page);
    check(
      'H5 once the deck is quiet, 外す takes exactly that row\'s cards out',
      after.learn.find((entry) => entry.id === q09)?.removed &&
        !deckAfter.includes('word:受付') &&
        !deckAfter.includes('word:済ませる') &&
        ['word:点検', 'word:支障', 'word:限り'].every((key) => deckAfter.includes(key)),
      JSON.stringify(deckAfter),
    );

    // saved bytes that are not JSON: kept aside, never overwritten, and saving still works
    await page.evaluate(() => localStorage.clear());
    const broken = '{"set":"kairo-guided-n2-living-thread-01","answers":{';
    await mountHeld(page, { seedBytes: broken });
    const footer = await page.locator('#guided-save-status').innerText();
    check('H6 unreadable saved bytes do not claim saving is unavailable', !/unavailable/u.test(footer), footer);
    await act(page, 'setup').click();
    await act(page, 'start').click();
    const kept = await page.evaluate((key) => localStorage.getItem(`${key}:unreadable`), KEY);
    const saved = await page.evaluate((key) => localStorage.getItem(key), KEY);
    check(
      'H7 the unreadable bytes are kept aside exactly, and the new session saves beside them',
      kept === broken && saved !== broken && JSON.parse(saved).started === true,
      JSON.stringify({ kept, saved: saved?.slice(0, 40) }),
    );

    // a set field carrying markup is shown as text, never parsed
    await page.evaluate(() => localStorage.clear());
    await mountHeld(page, { status: '<b id="guided-injected">x</b>' });
    await act(page, 'setup').click();
    await act(page, 'start').click();
    await page.locator('.guided-room .gs-aside details summary').click();
    const source = await page.locator('.guided-room .gs-aside details p').first().innerText();
    check(
      'H8 a question\'s source status is escaped like every other set field',
      (await page.locator('#guided-injected').count()) === 0 && source.includes('<b id="guided-injected">'),
      source.slice(0, 160),
    );
  } catch (error) {
    check('held walk completed without an exception', false, error.message);
  } finally {
    check('X4 no page errors', errors.length === 0, errors.join(' | '));
    problems.push(...errors.map((error) => `${current}: ${error}`));
    await context.close();
  }
}

try {
  const engines = { chromium, webkit };
  const names = WHICH === 'all' ? ['chromium', 'webkit'] : [WHICH];
  for (const name of names) {
    assert(engines[name], `unknown browser ${name}`);
    const browser = await engines[name].launch();
    try {
      for (const viewport of VIEWPORTS) {
        if (PARTS.has('journey') && (!ONLY_VIEWPORTS || ONLY_VIEWPORTS.includes(viewport.name))) {
          await journey(browser, name, viewport);
        }
      }
      if (MOMENTS && PARTS.has('moments')) await switches(browser, name);
      if (PARTS.has('restart')) await restart(browser, name);
      if (PARTS.has('held')) await held(browser, name);
    } finally {
      await browser.close();
    }
  }
} finally {
  await host.close();
  const failed = results.filter((row) => !row.pass);
  const report = {
    site: SITE,
    shots: SHOTS,
    fault: process.env.GUIDED_FAULT || null,
    moments: MOMENTS,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
    problems,
  };
  writeFileSync(
    join(EVIDENCE, 'guided-session-checks.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      passed: report.passed,
      failed: report.failed,
      evidence: EVIDENCE,
      shots: SHOTS,
    }),
  );
  if (failed.length) process.exitCode = 1;
}
