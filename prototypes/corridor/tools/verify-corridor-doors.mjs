/**
 * Reliable doors: no room may render an empty main.
 *
 * The learner's own complaint (2026-09-24): the JLPT room went blank when he
 * entered it from the 道場 door. A window that does not own the record, and a
 * room renderer that throws, both left `main` with zero children while the
 * dispatcher counted the room as handled. Each case below walks the route he
 * walks (shelf → 道場 → JLPT) in isolated browser contexts and asserts that the
 * room says something true instead of nothing.
 *
 *   T0 identity: the served build names the commit under test.
 *   T1 second window: JLPT from the dojo door shows an explicit state, never blank.
 *   T3 renderer fault (injected by this harness only): a visible error state with
 *      a working retry, instead of an empty page.
 *   T6 his path, one window: dojo → JLPT → N1 at 1728×996 dpr2 and 390×844.
 *
 * Claim boundary: isolated headless contexts prove these code paths, not what
 * his own Chrome profile does (extensions, discarded or frozen tabs).
 *
 * Usage: node verify-corridor-doors.mjs   (KAIRO_SITE_DIR may pin a staged artifact)
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');

const SITE = resolveCorridorSite();
const EVIDENCE = resolveCorridorEvidence();
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
};

const host = await startStaticHost({ site: SITE, port: 0 });
const origin = host.origin;
const browser = await chromium.launch();

async function ready(page) {
  await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30_000 });
}
async function mainState(page) {
  return page.evaluate(() => {
    const main = document.querySelector('#app main');
    return {
      kids: main ? main.children.length : -1,
      text: (main?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 240),
      state: main?.querySelector('[data-room-state]')?.dataset.roomState || null,
      error: !!main?.querySelector('[data-room-error]'),
    };
  });
}
async function settle(page) {
  // A room either draws content or states why it cannot; poll for either, bounded.
  try {
    await page.waitForFunction(() => (document.querySelector('#app main')?.children.length || 0) > 0,
      null, { timeout: 5_000 });
  } catch { /* the assertion below reports the empty main */ }
  return mainState(page);
}
// The room is complete only once its catalog has resolved: the history/legacy
// doors are appended after the data, never while it is still loading.
async function catalogComplete(page, timeout = 10_000) {
  try {
    await page.waitForFunction(() => !!document.querySelector('#app main #exam-legacy'), null, { timeout });
    return true;
  } catch { return false; }
}
async function enterJlptFromDojo(page, { fromDoor = false } = {}) {
  if (fromDoor) {
    // the front door: open the 回廊 navigation, then its 集中道場 door
    await page.locator('#ginga-symbol').click();
    await page.locator('button.nav-dojo').click();
  } else await page.locator('#chrome-dojo').click();
  await page.locator('button[data-study-door="mock"]').click();
  return settle(page);
}

try {
  // T0 — the build under test is the one named, byte for byte, or nothing below counts.
  const context0 = await browser.newContext();
  const page0 = await context0.newPage();
  const identity = await (await page0.request.get(`${origin}/build-identity.json`)).json();
  let head = null;
  try { head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* outside a checkout */ }
  const expectedSha = process.env.KAIRO_EXPECT_GITSHA || head;
  const pinnedArtifact = process.env.KAIRO_ARTIFACT_SHA256;
  check('T0 served gitSha is the expected commit', !!expectedSha && identity.gitSha === expectedSha,
    `served=${identity.gitSha} expected=${expectedSha} sourceDirty=${identity.sourceDirty}`);
  check('T0 served build is clean', identity.sourceDirty === false, `sourceDirty=${identity.sourceDirty}`);
  if (pinnedArtifact) check('T0 served artifact is the pinned digest', identity.artifactSha256 === pinnedArtifact,
    `served=${identity.artifactSha256} pinned=${pinnedArtifact}`);
  const manifest = new Map(identity.files.map((row) => [row.path, row.sha256]));
  for (const path of ['index.html', 'corridor.js', 'corridor.css', 'assessment-view.mjs']) {
    const bytes = Buffer.from(await (await page0.request.get(`${origin}/${path}`)).body());
    const served = createHash('sha256').update(bytes).digest('hex');
    check(`T0 served ${path} matches its manifest entry`, served === manifest.get(path), served.slice(0, 16));
  }
  await context0.close();
  if (results.some((r) => !r.pass)) throw new Error('T0 identity failed: no behaviour below would describe the named build');

  // T1 — two windows in one profile share the record lock.
  {
    const context = await browser.newContext({ viewport: { width: 1728, height: 996 }, deviceScaleFactor: 2 });
    const owner = await context.newPage(); await owner.goto(`${origin}/index.html?entry=shelf`); await ready(owner);
    const second = await context.newPage(); await second.goto(`${origin}/index.html?entry=shelf`); await ready(second);
    const state = await enterJlptFromDojo(second);
    check('T1 second window: JLPT from the dojo door is never an empty main', state.kids > 0, JSON.stringify(state));
    check('T1 second window: the room says it is blocked, not booting', state.state === 'blocked', `state=${state.state}`);
    const overlap = await second.evaluate(() => {
      const alert = document.getElementById('store-alert');
      const title = document.querySelector('#app main .room-state .view-title');
      if (!title) return { title: false };
      const shown = !!alert && !alert.hidden && getComputedStyle(alert).display !== 'none';
      if (!shown) return { shown, intersects: false };
      const a = alert.getBoundingClientRect(), t = title.getBoundingClientRect();
      return { shown, intersects: a.left < t.right && t.left < a.right && a.top < t.bottom && t.top < a.bottom };
    });
    check('T1 second window: nothing covers the room title (one carrier for the reason)', overlap.title !== false && !overlap.intersects, JSON.stringify(overlap));
    for (const width of [390]) {
      await second.setViewportSize({ width, height: 844 });
      const narrow = await second.evaluate(() => {
        const alert = document.getElementById('store-alert');
        const title = document.querySelector('#app main .room-state .view-title');
        const shown = !!alert && !alert.hidden && getComputedStyle(alert).display !== 'none';
        if (!shown || !title) return { shown, intersects: false };
        const a = alert.getBoundingClientRect(), t = title.getBoundingClientRect();
        return { shown, intersects: a.left < t.right && t.left < a.right && a.top < t.bottom && t.top < a.bottom };
      });
      check(`T1 second window at ${width}px: nothing covers the room title`, !narrow.intersects, JSON.stringify(narrow));
    }
    await second.screenshot({ path: resolve(EVIDENCE, 't1-second-window.png') });
    await context.close();
  }

  // T3 — a renderer fault injected by this harness (never by the product).
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    let faulty = true;
    await context.route('**/assessment-view.mjs', async (route) => {
      const response = await route.fetch();
      let body = await response.text();
      if (faulty) {
        const anchor = '    render(main) {\n';
        assert.ok(body.includes(anchor), 'fault anchor present in assessment-view.mjs');
        body = body.replace(anchor, `${anchor}      if (globalThis.__doorsFault) throw new Error('injected room fault');\n`);
      }
      await route.fulfill({ response, body });
    });
    await context.addInitScript(() => { globalThis.__doorsFault = true; });
    const page = await context.newPage(); await page.goto(`${origin}/index.html?entry=shelf`); await ready(page);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const state = await enterJlptFromDojo(page);
    check('T3 a throwing room shows a visible error state', state.error && state.kids > 0, JSON.stringify(state));
    const retry = page.locator('[data-room-error] button[data-room-retry]');
    if (await retry.count()) {
      await page.evaluate(() => { globalThis.__doorsFault = false; });
      await retry.click();
      const complete = await catalogComplete(page);
      const after = await mainState(page);
      check('T3 retry leaves the fault and draws the completed room', !after.error && complete, JSON.stringify(after));
    } else check('T3 retry leaves the fault and draws the room', false, 'no retry control');
    await page.screenshot({ path: resolve(EVIDENCE, 't3-room-error.png') });
    faulty = false;
    await context.close();
  }

  // T10 — N1 is not a dead end: with no checked N1 test, the room names the older N1 sets
  // (each marked 検収前) and one of them opens into a real question.
  for (const [viewport, fromDoor] of [[{ width: 1728, height: 996 }, false], [{ width: 1728, height: 996 }, true],
    [{ width: 390, height: 844 }, false], [{ width: 390, height: 844 }, true]]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(); await page.goto(fromDoor ? origin : `${origin}/index.html?entry=shelf`); await ready(page);
    await enterJlptFromDojo(page, { fromDoor });
    await catalogComplete(page);
    const initial = await page.evaluate(() => document.querySelector('[data-exam-level][aria-pressed="true"]')?.dataset.examLevel);
    check(`T10 ${viewport.width}px ${fromDoor ? 'door' : 'shelf'}: a first visit opens at the default level (N2)`, initial === 'N2', `initial=${initial}`);
    await page.locator('[data-exam-level="N1"]').click();
    // the learner's choice is remembered: a fresh visit opens at N1 with no click
    await page.reload(); await ready(page);
    await enterJlptFromDojo(page, { fromDoor });
    await catalogComplete(page);
    const remembered = await page.evaluate(() => document.querySelector('[data-exam-level][aria-pressed="true"]')?.dataset.examLevel);
    check(`T10 ${viewport.width}px ${fromDoor ? 'door' : 'shelf'}: after a reload the room opens at the level he chose (N1)`, remembered === 'N1', `opened at ${remembered}`);
    const doors = page.locator('[data-exam-older="N1"] [data-legacy-set]');
    await doors.first().waitFor({ timeout: 10_000 }).catch(() => {});
    const listed = await page.evaluate(() => [...document.querySelectorAll('[data-exam-older="N1"] [data-legacy-set]')]
      .map((door) => ({ id: door.dataset.legacySet, pending: door.textContent.includes('検収前'), text: door.textContent })));
    // expected identities and counts come from the artifact's own data, never from this file
    const expected = (await (await page.request.get(`${origin}/data/mock/index.json`)).json()).sets.filter((set) => set.level === 'N1');
    const matches = listed.length === expected.length && expected.every((set, i) => listed[i]?.id === set.setId && listed[i].text.includes(String(set.items)));
    check(`T10 ${viewport.width}px ${fromDoor ? 'door' : 'shelf'} N1: every older N1 set is named with its real id and question count`, expected.length > 0 && matches,
      JSON.stringify({ listed: listed.map((row) => row.id), expected: expected.map((set) => `${set.setId}:${set.items}`) }));
    const limits = await page.evaluate(() => document.querySelector('[data-exam-older="N1"] .exam-older-limits')?.textContent || '');
    check(`T10 ${viewport.width}px ${fromDoor ? 'door' : 'shelf'} N1: the room says what these sets lack (no listening, no timer)`, /no listening|聴解/u.test(limits), limits);
    check(`T10 ${viewport.width}px ${fromDoor ? 'door' : 'shelf'} N1: every older set is marked 検収前 (answers not yet checked)`, listed.length > 0 && listed.every((row) => row.pending));
    if (listed.length) {
      await doors.first().click();
      const started = await page.waitForSelector('#mock-next', { timeout: 15_000 }).then(() => true, () => false);
      check(`T10 ${viewport.width}px ${fromDoor ? 'door' : 'shelf'} N1: an older set opens into a real question`, started);
    }
    await page.screenshot({ path: resolve(EVIDENCE, `t10-n1-${viewport.width}-${fromDoor ? 'door' : 'shelf'}.png`), fullPage: true });
    await context.close();
  }

  // T9 — the completion check itself discriminates: with the catalog stalled forever,
  // the room must NOT count as complete (a loading room once passed as 'drawn').
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route('**/data/assessment/catalog.json', () => { /* never answered */ });
    const page = await context.newPage(); await page.goto(`${origin}/index.html?entry=shelf`); await ready(page);
    await enterJlptFromDojo(page);
    const complete = await catalogComplete(page, 4_000);
    const state = await mainState(page);
    check('T9 control: a stalled catalog is not counted as a completed room', !complete, JSON.stringify(state));
    await context.close();
  }

  // T8 — a late rejection from somewhere else never paints an error on the healthy front door,
  // whose main is deliberately empty (Drift draws on its own layer).
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage(); await page.goto(origin); await ready(page);
    const before = await mainState(page);
    await page.evaluate(() => new Promise((done) => {
      setTimeout(() => { Promise.reject(new Error('late fault from a room already left')); }, 50);
      setTimeout(done, 400);
    }));
    const after = await mainState(page);
    check('T8 a stray late rejection leaves the healthy front door untouched',
      !after.error && after.kids === before.kids, JSON.stringify({ before, after }));
    await context.close();
  }

  // T6 — his path, one window, both viewports, both routes into the dojo, N1.
  for (const [view, fromDoor] of [[{ width: 1728, height: 996, deviceScaleFactor: 2 }, false], [{ width: 1728, height: 996, deviceScaleFactor: 2 }, true],
    [{ width: 390, height: 844, deviceScaleFactor: 3 }, false], [{ width: 390, height: 844, deviceScaleFactor: 3 }, true]]) {
    const { deviceScaleFactor, ...viewport } = view;
    const route = fromDoor ? 'front door → 集中道場' : 'shelf → 道場';
    const context = await browser.newContext({ viewport, deviceScaleFactor });
    const page = await context.newPage(); await page.goto(fromDoor ? origin : `${origin}/index.html?entry=shelf`); await ready(page);
    await enterJlptFromDojo(page, { fromDoor });
    const loaded = await catalogComplete(page);
    const state = await mainState(page);
    check(`T6 ${viewport.width}px ${route}: JLPT draws the completed room`, loaded && state.kids > 0, JSON.stringify(state));
    const n1 = page.locator('[data-exam-level="N1"]');
    if (await n1.count()) {
      await n1.click();
      const loadedN1 = await catalogComplete(page);
      const after = await mainState(page);
      check(`T6 ${viewport.width}px ${route}: N1 completes with something the learner can act on`,
        loadedN1 && after.kids > 0 && !/Loading tests|読み込み中/u.test(after.text), JSON.stringify(after));
    } else check(`T6 ${viewport.width}px ${route}: N1 level control present`, false, 'no [data-exam-level=N1]');
    await page.screenshot({ path: resolve(EVIDENCE, `t6-${viewport.width}-${fromDoor ? 'door' : 'shelf'}.png`), fullPage: true });
    await context.close();
  }
} finally {
  writeFileSync(resolve(EVIDENCE, 'doors.json'), JSON.stringify({ origin, results }, null, 2) + '\n');
  await browser.close();
  await host.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed · evidence ${EVIDENCE}`);
process.exit(failed.length ? 1 : 0);
