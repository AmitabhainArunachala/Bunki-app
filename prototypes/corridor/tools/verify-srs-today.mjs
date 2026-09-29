/**
 * Card-system slice 1 · "the number is the truth, and you pick a mode" (CARD_SYSTEM_SPEC §4, §9,
 * §13). One staged Corridor site, real Chromium, the real importer and the real ペース panel.
 *
 * Seed (every scenario, through the actual backup importer): 300 overdue Review cards and 40
 * started new cards, all real core-dictionary words so each card has an answer to show.
 *
 * For each preset pressed on the panel (やさしい Gentle, ふつう Standard, 本気 Hardcore):
 *   - the 復習する button's number == learn + review + new (the three counts) == the All-cards
 *     deck row == the queue the session freezes (__KAIRO_SRS__.session()) == the grades the
 *     session accepts before it says done, and the day matches §4 (100 / 200 / 330);
 *   - the done screen names the reviews the day's limit held back (200 / 100 / none) and offers
 *     "today only: raise the limit", which opens exactly those (Standard);
 *   - __KAIRO_SRS__.params() reports the preset's retention and learning steps, a changed policy
 *     writes one params row, and the same card's Good interval is longer at 85% than at 90%.
 * Negative controls: with reviewsPerDay = 50 the button and the home pill read 50, not 300;
 * two mutants of the served corridor.js — the old uncapped count on the button, and retention
 * not wired into FSRS — must each FAIL their named check, or this verifier fails.
 *
 * Claim boundary: Chromium at 390 px only; it proves counts, session length, the held-back
 * line, the raise door and the scheduler's retention/steps. It does not prove the §4 settings
 * stored for later slices (buttons, faces, English, MCD share, typing, new/review mix).
 *
 * Usage: KAIRO_SITE_DIR=<staged site> node verify-srs-today.mjs [--shots DIR]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';
import { restoreAppFixture } from './record-fixture-support.mjs';

const SITE = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
const argv = process.argv.slice(2);
const shotsAt = argv.indexOf('--shots');
const SHOTS = shotsAt >= 0 ? resolve(argv[shotsAt + 1]) : null;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const REVIEWS = 300;
const FRESH = 40;
// §4, as the queue must serve it for the seed: day = learn + min(due, reviews/day) + new room
const PRESETS = {
  gentle: { total: 100, review: 100, fresh: 0, held: 200, retention: 0.85, steps: ['10m'] },
  standard: { total: 200, review: 200, fresh: 0, held: 100, retention: 0.9, steps: ['1m', '10m'] },
  hardcore: { total: 330, review: 300, fresh: 30, held: 0, retention: 0.9, steps: ['1m', '10m'] },
};
/* The mutants, literal edits to the served corridor.js; each must match exactly once. */
const MUTANTS = {
  'uncapped-count': {
    find: '    const due = today.order;\n',
    replace: '    const due = srsDueItems();\n',
    mustFail: 'cap-50 · the button reads the capped day and equals the session',
  },
  'retention-unwired': {
    find: '    request_retention: policy ? policy.retention : pin.requestRetention,\n',
    replace: '    request_retention: pin.requestRetention,\n',
    mustFail: 'gentle · __KAIRO_SRS__.params() reports 85% retention and a step of 10m',
  },
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.m4a': 'audio/mp4', '.png': 'image/png', '.svg': 'image/svg+xml',
};
function serve(overrides = {}) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const rel = path === '/' ? 'index.html' : path.replace(/^\/+/u, '');
    const file = resolve(SITE, rel);
    let body;
    try {
      assert(file.startsWith(`${SITE}/`));
      body = overrides[rel] ?? readFileSync(file);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    response.writeHead(200, { 'cache-control': 'no-store', 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => done({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

// real core-dictionary words: since D23 a word card is presented only with an answer it can resolve
const DICT = JSON.parse(readFileSync(join(SITE, 'data/share_alike/dict.json'), 'utf8')).words;
const WORDS = Object.keys(DICT)
  .filter((w) => /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]{1,6}$/u.test(w) &&
    Array.isArray(DICT[w].m) && DICT[w].m.some((m) => typeof m === 'string' && m.trim()))
  .slice(0, REVIEWS + FRESH);
assert.equal(WORDS.length, REVIEWS + FRESH, 'The seed needs 340 core words with answers');

function seed(srsPrefs) {
  const T = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const taken = [];
  const srs = {};
  WORDS.forEach((id, i) => {
    if (i < REVIEWS) {
      taken.push({ t: 'word', id, label: id, ts: T - 3e7, started: T - 3e7 });
      // card 0 is the most overdue; every card is a real Review-state card, identical but for its due
      srs[`word:${id}`] = { due: iso(T - (REVIEWS - i) * 600000), last_review: iso(T - 12 * 86400000), stability: 8,
        difficulty: 5, elapsed_days: 9, scheduled_days: 9, reps: 3, lapses: 0, learning_steps: 0, state: 2 };
    } else taken.push({ t: 'word', id, label: id, ts: T - 2e7, started: T - 2e7 });
  });
  return { v: 1, taken, srs, ...(srsPrefs ? { srsPrefs } : {}) };
}

const firstInt = (text) => Number((String(text).match(/[0-9]+/u) || ['-1'])[0]);
const intervalDays = (text) => {
  const n = Number((String(text).match(/[0-9]+/u) || ['NaN'])[0]);
  return /分|min/u.test(text) ? n / 1440 : n;
};

async function suite(label, base, browser, { only = null } = {}) {
  const results = [];
  const check = (name, pass, detail = '') => {
    results.push({ name, pass: !!pass, detail: String(detail) });
    console.log(`${pass ? '  ok  ' : ' FAIL '} [${label}] ${name}${detail ? `  — ${detail}` : ''}`);
  };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await silenceBrowserAudio(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const open = async (query = '?entry=shelf&ui=bi') => {
    await page.goto(`${base}/index.html${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  };
  const tray = async () => {
    await page.locator('#tray').click();
    await page.waitForSelector('#review-start');
  };
  const trayNumbers = () => page.evaluate(() => ({
    button: document.getElementById('review-start')?.textContent ?? '',
    counts: [...document.querySelectorAll('#deck-counts .deck-count-n')].map((n) => Number(n.textContent)),
    all: [...document.querySelectorAll('.deck-row[data-deck="*"] > span:not(.d-name)')].map((n) => Number(n.textContent)),
    held: document.querySelector('.srs-held')?.textContent ?? '',
    today: window.__KAIRO_SRS__.today(),
  }));
  const choosePreset = async (id) => {
    if (!(await page.locator(`[data-preset="${id}"]`).count())) await page.locator('#srs-prefs-toggle').click();
    await page.locator(`[data-preset="${id}"]`).click();
    await waitForAppRecord(page, (record) => record.srsPrefs?.preset === id, { description: `the ${id} preset` });
    await page.waitForFunction((id) => document.querySelector(`[data-preset="${id}"]`)?.getAttribute('aria-pressed') === 'true', id);
  };
  // grade every card the session serves, Easy each time (no learning reinsertion), until done
  const walk = (max) => page.evaluate(async (max) => {
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
    const until = async (ok, what, ms = 15000) => {
      const start = performance.now();
      while (!ok()) {
        if (performance.now() - start > ms) throw new Error(`timed out waiting for ${what}`);
        await sleep(4);
      }
    };
    let accepted = 0;
    for (;;) {
      const session = window.__KAIRO_SRS__.session();
      if (!session || session.ix >= session.queue || accepted >= max) break;
      await until(() => document.querySelector('#reveal') || document.querySelector('.grade.g-easy'), 'a card');
      document.querySelector('#reveal')?.click();
      await until(() => document.querySelector('.grade.g-easy:not([disabled])'), 'the grades');
      document.querySelector('.grade.g-easy').click();
      await until(() => (window.__KAIRO_SRS__.session()?.ix ?? -1) > session.ix, 'the committed grade');
      accepted += 1;
    }
    return accepted;
  }, max);
  const doneScreen = () => page.evaluate(() => ({
    doors: document.querySelectorAll('.close-doors').length,
    reveal: document.querySelectorAll('#reveal').length,
    title: document.querySelector('.view-title')?.textContent ?? '',
    held: document.querySelector('.review-deferred')?.textContent ?? '',
    raise: !!document.getElementById('review-raise-limit'),
  }));

  await open();
  const goodInterval = {};
  for (const id of ['gentle', 'standard', 'hardcore']) {
    if (only && !only.startsWith(id)) continue;
    const want = PRESETS[id];
    await restoreAppFixture(page, seed(null));
    await open();
    await tray();
    await choosePreset(id);
    const shown = await trayNumbers();
    const params = await page.evaluate(() => window.__KAIRO_SRS__.params());
    const record = await readAppRecord(page);
    const button = firstInt(shown.button);
    const sum = shown.counts.reduce((a, b) => a + b, 0);
    check(`${id} · the button reads §4's day for the seed (${want.total})`, button === want.total, `"${shown.button.trim()}"`);
    check(`${id} · button == new + learn + review, the All-cards row and todayQueue`,
      button === sum && JSON.stringify(shown.counts) === JSON.stringify([want.fresh, 0, want.review]) &&
        JSON.stringify(shown.all) === JSON.stringify(shown.counts) &&
        shown.today.keys.length === button && shown.today.held === want.held,
      `counts ${shown.counts.join('/')} · all ${shown.all.join('/')} · today ${JSON.stringify({ ...shown.today, keys: shown.today.keys.length })}`);
    check(`${id} · the tray names the held-back reviews`,
      want.held ? firstInt(shown.held) === want.held : shown.held === '', JSON.stringify(shown.held));
    const scheduleRows = (record.obslog || []).filter((row) => row[1] === 'params' && row[2] === 'schedule');
    check(`${id} · __KAIRO_SRS__.params() reports ${Math.round(want.retention * 100)}% retention and ${want.steps.length > 1 ? 'steps' : 'a step of'} ${want.steps.join(' ')}`,
      params.retention === want.retention && JSON.stringify(params.learningSteps) === JSON.stringify(want.steps) &&
        record.srsPrefs.retention === want.retention,
      `params ${JSON.stringify({ retention: params.retention, learningSteps: params.learningSteps })}`);
    // the pin is 90% with 1m 10m: only Gentle changes the policy, and it writes exactly one row
    check(`${id} · a changed schedule policy is one params row; an unchanged one writes none`,
      id === 'gentle'
        ? scheduleRows.length === 1 && scheduleRows[0][3] === 0.85 && JSON.stringify(scheduleRows[0][4]) === '["10m"]'
        : scheduleRows.length === 0,
      JSON.stringify(scheduleRows.map((row) => row.slice(1))));
    if (only) continue;
    await page.locator('#review-start').click();
    await page.waitForSelector('#reveal');
    const session = await page.evaluate(() => window.__KAIRO_SRS__.session());
    const current = await page.evaluate(() => window.__KAIRO_SRS__.current());
    check(`${id} · the session freezes exactly the button's queue and counts the held-back`,
      session.queue === button && session.deferred === want.held && current === shown.today.keys[0],
      `session ${JSON.stringify(session)} · first ${current}`);
    await page.locator('#reveal').click();
    await page.waitForSelector('.grade.g-good .g-when');
    goodInterval[id] = await page.locator('.grade.g-good .g-when').textContent();
    const accepted = 1 + (await (async () => {
      await page.locator('.grade.g-easy').click();
      await page.waitForFunction(() => window.__KAIRO_SRS__.session()?.ix === 1);
      return walk(button + 5);
    })());
    const done = await doneScreen();
    const after = await readAppRecord(page);
    check(`${id} · the session accepts exactly the button's number of grades, then says done`,
      accepted === button && done.doors === 1 && done.reveal === 0 && firstInt(done.title) === button &&
        after.revlog.length === button,
      `${accepted} accepted · revlog ${after.revlog.length} · "${done.title.trim()}"`);
    check(`${id} · the done screen names the cards the day's limit held back`,
      want.held ? firstInt(done.held) === want.held && done.raise : done.held === '' && !done.raise,
      JSON.stringify({ held: done.held, raise: done.raise }));
    if (id === 'standard') {
      // today only: raise the limit — the held-back reviews open as the next session
      await page.locator('#review-raise-limit').click();
      await page.waitForSelector('#reveal');
      const raised = await page.evaluate(() => window.__KAIRO_SRS__.session());
      const stats = (await readAppRecord(page)).stats;
      const day = Object.keys(stats).find((key) => /^\d{4}-\d{2}-\d{2}$/u.test(key) && stats[key].extra);
      check('standard · "today only: raise the limit" opens exactly the held-back reviews',
        raised.queue === want.held && raised.deferred === 0 && stats[day]?.extra === want.held,
        `session ${JSON.stringify(raised)} · stats.extra ${stats[day]?.extra}`);
    }
  }
  if (!only) {
    const gentle = intervalDays(goodInterval.gentle);
    const standard = intervalDays(goodInterval.standard);
    const hardcore = intervalDays(goodInterval.hardcore);
    check('retention reaches FSRS · the same card\'s Good interval is longer at 85% than at 90%',
      gentle > standard && standard === hardcore && standard >= 1,
      `gentle ${goodInterval.gentle} · standard ${goodInterval.standard} · hardcore ${goodInterval.hardcore}`);
  }

  // negative control: a learner cap of 50 must read 50, not 300 (+ its new room: 0, spent by the cap)
  if (!only || only.startsWith('cap-50')) {
    await restoreAppFixture(page, seed({ newPerDay: 20, reviewsPerDay: 50 }));
    await open();
    await tray();
    const capped = await trayNumbers();
    await page.locator('#review-start').click();
    await page.waitForSelector('#reveal');
    const session = await page.evaluate(() => window.__KAIRO_SRS__.session());
    check('cap-50 · the button reads the capped day and equals the session',
      firstInt(capped.button) === 50 && session.queue === 50 && capped.today.held === 250 && session.deferred === 250,
      `"${capped.button.trim()}" · session ${JSON.stringify(session)}`);
    await open('?ui=bi');
    await page.waitForSelector('#home-review', { state: 'attached' });
    const pill = await page.locator('#home-review').textContent();
    check('cap-50 · the home pill reads the same 50', firstInt(pill) === 50, JSON.stringify(pill.trim()));
  }
  // the optional break (off by default: the walks above never met one): every 10 cards the
  // glass rests, the queue stays whole behind it, and 続ける turns the next card
  if (!only) {
    await restoreAppFixture(page, seed({ newPerDay: 20, reviewsPerDay: 50, pauseEvery: 10 }));
    await open();
    await tray();
    await page.locator('#review-start').click();
    await page.waitForSelector('#reveal');
    const accepted = await walk(10);
    await page.waitForSelector('#review-continue');
    const rest = await page.evaluate(() => ({ session: window.__KAIRO_SRS__.session(),
      left: document.querySelector('.review-break-left')?.textContent ?? '', reveal: document.querySelectorAll('#reveal').length }));
    await page.locator('#review-continue').click();
    await page.waitForSelector('#reveal');
    check('pause every 10 · the break comes after 10 grades, hides nothing, and 続ける goes on',
      accepted === 10 && rest.session.queue === 50 && rest.session.ix === 10 && firstInt(rest.left) === 40 && rest.reveal === 0,
      JSON.stringify(rest));
  }
  // switching presets rebuilds the scheduler and logs the policy it leaves for
  if (!only) {
    await restoreAppFixture(page, seed(null));
    await open();
    await tray();
    await choosePreset('gentle');
    await choosePreset('standard');
    const params = await page.evaluate(() => window.__KAIRO_SRS__.params());
    const rows = (await readAppRecord(page)).obslog.filter((row) => row[1] === 'params' && row[2] === 'schedule');
    check('Gentle → Standard rebuilds the live scheduler at 90% and 1m 10m, one row per change',
      params.retention === 0.9 && JSON.stringify(params.learningSteps) === '["1m","10m"]' &&
        JSON.stringify(rows.map((row) => row.slice(3))) === JSON.stringify([[0.85, ['10m']], [0.9, ['1m', '10m']]]),
      JSON.stringify(rows.map((row) => row.slice(1))));
    // a hand-set number relabels the preset Custom (from Standard) and keeps the policy
    const before = await page.locator('[data-pref-val="newPerDay"]').textContent();
    await page.locator('[data-pref-up="newPerDay"]').click();
    await page.waitForFunction((before) => document.querySelector('[data-pref-val="newPerDay"]')?.textContent !== before, before);
    const now = await page.locator('#srs-preset-now').textContent();
    const prefs = (await readAppRecord(page)).srsPrefs;
    check('a hand-set number relabels the preset "Custom (from Standard)"',
      prefs.preset === 'custom:standard' && prefs.newPerDay === 25 && /Custom \(from Standard\)|カスタム（ふつうから）/u.test(now) &&
        (await page.locator('.srs-preset[aria-pressed="true"]').count()) === 0,
      `${JSON.stringify(prefs)} · "${now.trim()}"`);
  }
  check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean');
  await context.close();
  return results;
}

/* John's screenshots: the ペース panel with the three presets and the tray's truthful count,
 * at 390 and 1280. Standard is pressed on a 300-due seed: 200 today, 100 held back. */
async function takeShots(base, browser) {
  mkdirSync(SHOTS, { recursive: true });
  const saved = [];
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await silenceBrowserAudio(context);
    const page = await context.newPage();
    const open = async (query = '?entry=shelf&ui=bi') => {
      await page.goto(`${base}/index.html${query}`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
    };
    await open();
    await restoreAppFixture(page, seed({ newPerDay: 20, reviewsPerDay: 200, retention: 0.9, preset: 'standard' }));
    await open();
    await page.locator('#tray').click();
    await page.waitForSelector('#review-start');
    await page.locator('#srs-prefs-toggle').click();
    await page.waitForSelector('#srs-prefs');
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(400);
    const clip = async (selectors, pad = 12, below = pad) => {
      const boxes = await page.evaluate((selectors) => selectors.map((s) => {
        const node = document.querySelector(s);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { x: r.left + scrollX, y: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY };
      }).filter(Boolean), selectors);
      const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
      const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
      return { x, y, width: Math.min(width - x, Math.max(...boxes.map((b) => b.right)) - x + pad),
        height: Math.max(...boxes.map((b) => b.bottom)) - y + below };
    };
    const home = join(SHOTS, `home-button-truthful-count-${width}.png`);
    await page.screenshot({ path: home, fullPage: true, clip: await clip(['.view-title', '#deck-counts', '#review-start', '.srs-held', '#deck-table']) });
    const pace = join(SHOTS, `pace-panel-three-presets-${width}.png`);
    await page.screenshot({ path: pace, fullPage: true, clip: await clip(['#srs-prefs-toggle', '#srs-prefs'], 12, 2) });
    // the galaxy's own 復習 pill reads the same number
    await open('?ui=bi');
    await page.waitForSelector('#home-review');
    await page.waitForTimeout(600);
    const pill = join(SHOTS, `home-pill-truthful-count-${width}.png`);
    await page.screenshot({ path: pill, clip: await clip(['#home-review'], 48) });
    saved.push(home, pace, pill);
    if (width === 390) {
      // the same panel in 日本語のみ, where each preset's line is the Japanese one
      await open('?entry=shelf&ui=ja');
      await page.locator('#tray').click();
      await page.waitForSelector('#review-start');
      await page.locator('#srs-prefs-toggle').click();
      await page.waitForSelector('#srs-prefs');
      await page.waitForTimeout(300);
      const ja = join(SHOTS, 'pace-panel-three-presets-390-ja.png');
      await page.screenshot({ path: ja, fullPage: true, clip: await clip(['#srs-prefs-toggle', '#srs-prefs'], 12, 2) });
      saved.push(ja);
    }
    await context.close();
  }
  return saved;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const identity = JSON.parse(readFileSync(join(SITE, 'build-identity.json'), 'utf8'));
const receipt = { format: 'kairo-srs-today-verification', version: 1, startedAt: new Date().toISOString(),
  artifactSha256: identity.artifactSha256, gitSha: identity.gitSha, verifierSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
  seed: { reviews: REVIEWS, fresh: FRESH }, presets: PRESETS };
let exitCode = 0;
try {
  const real = await serve();
  try {
    receipt.checks = await suite('build', real.base, browser);
    if (SHOTS) receipt.screenshots = await takeShots(real.base, browser);
  } finally { real.server.close(); }
  const failed = receipt.checks.filter((c) => !c.pass);
  if (failed.length) exitCode = 1;
  receipt.mutants = {};
  const source = readFileSync(join(SITE, 'corridor.js'), 'utf8');
  for (const [name, mutant] of Object.entries(MUTANTS)) {
    const hits = source.split(mutant.find).length - 1;
    assert.equal(hits, 1, `mutant ${name} must match the served corridor.js exactly once (matched ${hits})`);
    const mutated = await serve({ 'corridor.js': source.replace(mutant.find, mutant.replace) });
    try {
      const checks = await suite(`mutant ${name}`, mutated.base, browser, { only: mutant.mustFail });
      const target = checks.find((c) => c.name === mutant.mustFail);
      const caught = !!target && !target.pass;
      receipt.mutants[name] = { mustFail: mutant.mustFail, caught, checks };
      console.log(`${caught ? '  ok  ' : ' FAIL '} negative control · mutant ${name} is caught by "${mutant.mustFail}"`);
      if (!caught) exitCode = 1;
    } finally { mutated.server.close(); }
  }
  receipt.summary = { checks: receipt.checks.length, failed: failed.length,
    mutantsCaught: Object.values(receipt.mutants).filter((m) => m.caught).length, mutants: Object.keys(MUTANTS).length };
  console.log(`\n${receipt.checks.length - failed.length}/${receipt.checks.length} checks passed · ` +
    `${receipt.summary.mutantsCaught}/${receipt.summary.mutants} mutants caught`);
} catch (error) {
  receipt.error = error.stack || String(error);
  console.error(error);
  exitCode = 2;
} finally {
  await browser.close();
  receipt.finishedAt = new Date().toISOString();
  receipt.status = exitCode === 0 ? 'passed' : 'failed';
  writeFileSync(join(OUT, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`receipt → ${join(OUT, 'receipt.json')}`);
}
process.exit(exitCode);
