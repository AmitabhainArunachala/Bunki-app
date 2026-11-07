/** verify-daily-loop · slice L (2026-10-16). The daily loop never needs a reload (John: "quick and punchy"): after a deck
 * sitting the Learn room's doors still open their rooms, and after the guided session a deck still opens. Served build
 * only, WebKit and Chromium, 390×844, touch, service workers blocked, a fresh record for each loop. Every page error fails
 * its loop; none is filtered.
 *   L1  deck → Guided: Learn → the N2 deck → five grades on revealed cards (Again, Hard, Good, Easy, Good), each one
 *       written to the deck's own ledger → quit → the deck's ← → Learn → the Guided door: the room arrives → setup →
 *       start → its first question (stage "question", its answer choices). Before L this stalled: the deck left behind
 *       kept a detached root, mount.js:123's `&&` gave false, and `false?.querySelector()` threw inside render()
 *   L2  Guided → deck → Guided: Learn → Guided → its first question → save and leave → Back → Learn → the N2 deck → its
 *       first card → a grade, written → quit → ← → Learn → the Guided door again: the room arrives, the session waits
 * Negative control: mount.js:123 with its `&&` restored fails L1 at the Guided step. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';

assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable built site and its digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

const DECK = 'n2';
const LEDGER = `bunki-cloze:${DECK}`;
const GRADES = Object.freeze(['again', 'hard', 'good', 'easy', 'good']);
const ROOM_MS = 15000;

const rows = [];
let engine = '';
const check = (id, title, ok, observed = '') => {
  rows.push({ id: `${engine}/${id}`, title, ok: !!ok, observed });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}/${id} ${title}${ok ? '' : ` — ${JSON.stringify(observed).slice(0, 400)}`}`);
  return !!ok;
};

const host = await startStaticHost({ site, port: 0 });
const view = (page) => page.evaluate(() => document.body.dataset.view);
const ledger = (page) => page.evaluate((key) => localStorage.getItem(key), LEDGER);
async function boot(page) {
  await page.goto(`${host.origin}/index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
}
/** Learn, by the chrome's own door (the tab bar's Learn where the chrome has none). */
async function learn(page) {
  const door = page.locator('#chrome-dojo');
  if (await door.isVisible().catch(() => false)) await door.click();
  else await page.locator('[id^="tab-"]', { hasText: /Learn|学ぶ/u }).first().click();
  await page.locator('button[data-study-door="guided"]').waitFor({ state: 'visible', timeout: ROOM_MS });
}
/** The Guided door: whether the room arrives at all (the stall is the room never arriving). */
async function openGuided(page) {
  await page.locator('button[data-study-door="guided"]').click();
  const arrived = await page.waitForSelector('.guided-room .gs-main', { timeout: ROOM_MS }).then(() => true, () => false);
  return { arrived, view: await view(page), stage: arrived ? await page.locator('.guided-room').getAttribute('data-stage') : null };
}
/** From the room's arrival to its first question. */
async function firstQuestion(page) {
  await page.locator('.guided-room [data-action="setup"]').first().click();
  await page.locator('.guided-room [data-action="start"]').first().click();
  await page.waitForFunction(() => document.querySelector('.guided-room')?.dataset.stage === 'question', null, { timeout: ROOM_MS });
  return {
    stage: await page.locator('.guided-room').getAttribute('data-stage'),
    answers: await page.locator('.guided-room [name="answer"]').count(),
    question: await page.locator('.guided-room [data-question]').first().getAttribute('data-question').catch(() => null),
  };
}
/** The N2 deck's sitting: open, start, then one grade per entry of `grades`, each on a revealed card and each written to
 * the deck's own ledger before the next face. Returns what each grade did. */
async function sitting(page, grades) {
  await page.locator(`[data-deck="${DECK}"]`).click();
  await page.locator('#kp-start').waitFor({ timeout: ROOM_MS });
  await page.locator('#kp-start').click();
  const done = [];
  for (const grade of grades) {
    await page.locator('#kp-reveal').waitFor({ state: 'visible', timeout: ROOM_MS });
    const card = await page.locator('#kp-card').getAttribute('data-card');
    const before = await ledger(page);
    await page.locator('#kp-reveal').click();
    await page.locator(`#kp-grade-${grade}`).waitFor({ state: 'visible', timeout: ROOM_MS });
    await page.locator(`#kp-grade-${grade}`).click();
    let after = before;
    for (const deadline = Date.now() + 5000; Date.now() < deadline && after === before; await delay(100)) after = await ledger(page);
    done.push({ grade, card, written: after !== before && after !== null });
  }
  return done;
}
/** Quit the sitting, then the deck's own ← back to Learn. */
async function leaveDeck(page) {
  await page.locator('#kp-quit').click();
  await page.locator('.kp-home').waitFor({ timeout: ROOM_MS });
  await page.locator('.kp-top .kp-icon').first().click();
  await page.locator('button[data-study-door="guided"]').waitFor({ state: 'visible', timeout: ROOM_MS });
}

try {
  for (engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    const contextOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
      serviceWorkers: 'block', reducedMotion: 'reduce' };
    const loop = async (name, body) => {
      const context = await browser.newContext(contextOptions);
      await silenceBrowserAudio(context);
      await context.route('**/*', (route) => (new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort()));
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(ROOM_MS);
      page.on('pageerror', (error) => errors.push(error.message));
      try { await body(page); }
      catch (error) {
        check(`${name}.error`, `${name} ran to the end`, false, String(error.stack || error).slice(0, 600));
        await page.screenshot({ path: resolve(evidence, `${engine}-${name}-error.png`) }).catch(() => {});
      } finally {
        check(`${name}.page-errors`, `${name}: no page errors`, errors.length === 0, errors);
        await context.close();
      }
    };

    await loop('L1', async (page) => {
      await boot(page);
      await learn(page);
      const graded = await sitting(page, GRADES);
      check('L1.grades', `five grades (${GRADES.join(', ')}) on revealed cards, each written to the deck's ledger`,
        graded.length === 5 && graded.every((g) => g.written && g.card), graded);
      await leaveDeck(page);
      check('L1.learn', 'quit and ← bring Learn back', (await view(page)) === 'dojo', await view(page));
      const room = await openGuided(page);
      check('L1.guided', 'after the deck, the Guided door opens its room (no reload)', room.arrived && room.view === 'guided' && room.stage === 'home', room);
      if (!room.arrived) {
        await page.screenshot({ path: resolve(evidence, `${engine}-L1-guided-stalled.png`) });
        return;
      }
      const first = await firstQuestion(page);
      check('L1.question', 'its first question arrives: stage "question", its answer choices', first.stage === 'question' && first.answers >= 2, first);
      await delay(400);
      await page.screenshot({ path: resolve(evidence, `${engine}-L1-guided-first-question.png`) });
    });

    await loop('L2', async (page) => {
      await boot(page);
      await learn(page);
      const room = await openGuided(page);
      check('L2.guided', 'Learn → Guided: the room arrives', room.arrived && room.view === 'guided', room);
      const first = await firstQuestion(page);
      check('L2.question', 'its first question arrives', first.stage === 'question' && first.answers >= 2, first);
      await page.locator('.guided-room [data-action="leave"]').first().click();
      await page.waitForFunction(() => document.querySelector('.guided-room')?.dataset.stage !== 'question', null, { timeout: ROOM_MS });
      await page.locator('#back').click();
      await page.locator('button[data-study-door="guided"]').waitFor({ state: 'visible', timeout: ROOM_MS });
      check('L2.learn', 'save and leave, then Back: Learn', (await view(page)) === 'dojo', await view(page));
      const graded = await sitting(page, ['good']);
      check('L2.deck', 'after Guided, the deck opens, shows its first card and takes a grade', graded.length === 1 && graded[0].written && !!graded[0].card, graded);
      await leaveDeck(page);
      const again = await openGuided(page);
      check('L2.guided-again', 'after the deck, the Guided door opens its room again (no reload)', again.arrived && again.view === 'guided', again);
    });
    await browser.close();
  }
} finally {
  await host.close();
  const failed = rows.filter((row) => !row.ok);
  writeFileSync(resolve(evidence, 'verify-daily-loop.json'), `${JSON.stringify({ site, served: identity.gitSha, artifactSha256: identity.artifactSha256,
    engines, failed: failed.length, rows }, null, 2)}\n`);
  console.log(`\n${rows.length - failed.length}/${rows.length} passed · evidence ${evidence}`);
  process.exitCode = failed.length ? 1 : 0;
}
