/**
 * verify-journey — the ONE FLOWING SEQUENCE, walked end to end.
 *
 * Required local regression coverage for the current product's rooms and
 * the transitions between them. When an authorized product change alters
 * the flow, update these checks to match its intended behavior.
 *
 * Stations (each verified in one continuous phone-size session):
 *   1  the Drift front door, resting
 *   2  the shelf behind it
 *   3  search → a synonym cluster under the hits → a neighbour's entry
 *   4  the reader → capture a word (覚える)
 *   5  the learner mark (under-ink) appearing in the text just read
 *   6  途中 on the shelf after leaving mid-article
 *   7  a JLPT lesson end to end (learn → quiz → practice evidence; the
 *      deck grows only through the end screen's explicit enroll choice)
 *   8  the tray → a review session through to its summary
 *   9  the day's review trace appearing under the review button
 *  10  levels · grammar (≥100 entries) · thesaurus · 字引 · export doors
 *  11  back to the Drift — the loop closes
 *  12  reload the same standalone file and recover the exact learner record
 *
 * Honest-probe rules learned the hard way:
 *   - element.tap() auto-scrolls to its target; never read scroll-derived
 *     state (bookmarks, 途中 tags) after a tap without re-scrolling.
 *   - the entry sheet swallows clicks for ~700ms after opening (same-
 *     gesture ghost guard); wait it out before pressing anything inside.
 *
 * Usage: node prototypes/corridor/tools/verify-journey.mjs [--evidence-out fresh-external-dir]
 *   (exits non-zero on station, startup or cleanup failure; screenshots and
 *   results.json are retained in the fresh evidence directory)
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';
import { externalPath } from '../../bunki-desktop/lib/paths.cjs';

const SELF = fileURLToPath(import.meta.url);
const HERE = dirname(SELF);
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--evidence-out' && args[1]),
  'Usage: verify-journey.mjs [--evidence-out fresh-external-dir]');
const output = args.length ? externalPath(args[1], { fresh: true }) : mkdtempSync(resolve(resolveCorridorEvidence(), 'journey-'));
if (args.length) mkdirSync(output, { recursive: true });
if (args.length) process.env.KAIRO_EVIDENCE_DIR = output;
const STANDALONE = resolve(output, 'corridor-standalone.html');
const SHOTS = resolve(output, 'screenshots');
mkdirSync(SHOTS);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const verifier = { path: SELF, sha256: sha256(readFileSync(SELF)) };
const builder = { path: resolve(HERE, 'build-standalone.mjs'), sha256: sha256(readFileSync(resolve(HERE, 'build-standalone.mjs'))) };
const expectedArtifactSha256 = process.env.KAIRO_ARTIFACT_SHA256 || null;
const expectedStations = [
  '1 drift front door',
  '2 shelf',
  '3 search + synonym cluster + entry',
  '4 reader capture',
  '5 learner mark in the text',
  '6 shelf 途中 tag',
  '7 JLPT lesson end to end',
  '8 tray → review → summary',
  '9 review trace on the tray',
  '10 levels · grammar(100+) · thesaurus · 字引',
  '11 return to the drift',
  '12 same-file offline reload retains the exact learner record',
];
const limits = { buildMs: 120000, launchMs: 30000, browserRunMs: 300000, closeMs: 10000 };

const CHROME_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p)) || chromium.executablePath();

const failures = [];
const skipped = [];
const passed = [];
const blockedRequests = [];
const pageErrors = [];
const startupErrors = [];
const cleanupErrors = [];
const stationErrors = [];
const identityErrors = [];
const startedAt = new Date().toISOString();
const handles = { processId: process.pid, browserCreated: false, contextsCreated: 0,
  contextCloseAttempted: false, contextClosed: false, browserCloseAttempted: false,
  browserClosed: false, finalBrowserConnected: false, finalContextCount: 0, finalPageClosed: true };
let recoveredRecordSha256 = null;
let site = null;
let identity = null;
let standalone = null;
let browser;
let ctx;
let page;
let browserVersion = null;
let audioOutput = null;
let phase = 'artifact';
let runTimer;
let timedOut = false;
let cleanupPromise;
const errorText = (error) => String(error?.stack || error);
async function boundedClose(action, name) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${name} exceeded ${limits.closeMs} ms`)), limits.closeMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    if (ctx) {
      handles.contextCloseAttempted = true;
      try { await boundedClose(() => ctx.close(), 'context.close'); handles.contextClosed = true; }
      catch (error) { cleanupErrors.push({ handle: 'context', error: errorText(error) }); }
    }
    if (browser) {
      handles.browserCloseAttempted = true;
      try { await boundedClose(() => browser.close(), 'browser.close'); }
      catch (error) { cleanupErrors.push({ handle: 'browser', error: errorText(error) }); }
      try {
        handles.finalBrowserConnected = browser.isConnected();
        handles.finalContextCount = browser.contexts().length;
        handles.browserClosed = !handles.finalBrowserConnected;
      } catch (error) {
        handles.finalBrowserConnected = null;
        handles.finalContextCount = null;
        cleanupErrors.push({ handle: 'browser-observation', error: errorText(error) });
      }
      if (handles.browserClosed && handles.finalContextCount === 0) handles.contextClosed = !!ctx;
    }
    try { handles.finalPageClosed = page ? page.isClosed() : true; }
    catch (error) {
      handles.finalPageClosed = null;
      cleanupErrors.push({ handle: 'page-observation', error: errorText(error) });
    }
  })();
  return cleanupPromise;
}
const step = async (name, fn) => {
  if (failures.length) {
    skipped.push(name);
    console.log('SKIP —', name, ': previous station failed');
    return;
  }
  try {
    await fn();
    passed.push(name);
    console.log('ok —', name);
  } catch (e) {
    failures.push(name);
    stationErrors.push({ name, error: errorText(e) });
    console.log('FAIL —', name, ':', String(e).split('\n')[0]);
  }
};
const shot = async (name) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

try {
  site = resolveCorridorSite();
  identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
  if (expectedArtifactSha256) assert.equal(identity.artifactSha256, expectedArtifactSha256);
  phase = 'build';
  execFileSync(process.execPath, [builder.path, STANDALONE], { timeout: limits.buildMs, stdio: 'pipe', env: { ...process.env, KAIRO_SITE_DIR: site, KAIRO_ARTIFACT_SHA256: identity.artifactSha256, KAIRO_EVIDENCE_DIR: output } });
  standalone = JSON.parse(readFileSync(STANDALONE + '.build.json', 'utf8'));
  assert.equal(standalone.artifactSha256, identity.artifactSha256);
  assert.equal(standalone.standaloneSha256, sha256(readFileSync(STANDALONE)));
  assert.equal(standalone.builderSha256, builder.sha256);
  phase = 'launch';
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'], timeout: limits.launchMs });
  handles.browserCreated = true;
  browserVersion = browser.version();
  browser.on('disconnected', () => { handles.browserClosed = true; });
  runTimer = setTimeout(() => {
    timedOut = true;
    failures.push('overall browser timeout');
    void cleanup();
  }, limits.browserRunMs);
  phase = 'context';
  ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  handles.contextsCreated++;
  ctx.on('close', () => { handles.contextClosed = true; });
  phase = 'audio';
  audioOutput = await silenceBrowserAudio(ctx);
  const standaloneUrl = pathToFileURL(STANDALONE).href;
  phase = 'routing';
  await ctx.route('**/*', async (route) => {
    const request = route.request();
    if (request.isNavigationRequest() && request.url() === standaloneUrl) return route.continue();
    if (/^(?:data|blob):/u.test(request.url())) return route.continue();
    blockedRequests.push(request.url());
    return route.abort('internetdisconnected');
  });
  phase = 'page';
  page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });
  phase = 'stations';

  await step('1 drift front door', async () => {
    await page.goto(standaloneUrl);
    await page.waitForSelector('#drift-layer.active', { timeout: 30000 });
    await page.waitForFunction(() => localStorage.getItem('kairo-local-record-binding-v1'), null, { timeout: 10000 });
    await readAppRecord(page);
    await page.waitForTimeout(2500);
    await shot('01-drift');
  });

  await step('2 shelf', async () => {
    // the galaxy's one symbol opens the bar; the 本棚 bubble is the one door
    // (the old #enter-shelf-door predates the 銀河 front door and is gone)
    await page.tap('.nav-symbol');
    await page.waitForTimeout(400);
    await page.tap('.bubble-shelf');
    await page.waitForSelector('.shelf-item', { timeout: 10000 });
  });

  await step('3 search + synonym cluster + entry', async () => {
    await page.fill('#search', '意見');
    await page.waitForTimeout(400);
    if (!(await page.$('.search-syn'))) throw new Error('no cluster under the hits');
    await page.click('.search-syn .sem-row');
    await page.waitForSelector('.sheet .headword', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.fill('#search', '');
    await page.waitForTimeout(300);
  });

  await step('4 reader capture', async () => {
    await page.click('.shelf-item');
    await page.waitForSelector('.reader .tok.content', { timeout: 10000 });
    // the article body arrives async and re-renders once — wait for the token
    // count to hold still so the hold below is not cut by a mid-press repaint
    let previousCount = -1, stable = false;
    for (let attempt = 0; attempt < 38; attempt++) {
      const count = await page.locator('.reader .tok').count();
      if (count > 0 && count === previousCount) { stable = true; break; }
      previousCount = count;
      await page.waitForTimeout(400);
    }
    if (!stable) throw new Error('Reader tokens did not settle before the gesture');
    // the click grammar (v1.2): the full entry opens by HOLDING a word — the
    // old double-tap stops at the gloss rung and never reaches the sheet
    const tok = await page.$('.reader .tok.content');
    await tok.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const box = await tok.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 6, radiusY: 6, force: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(2400);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForSelector('.sheet .headword', { timeout: 8000 });
    await page.waitForTimeout(800); // the sheet's same-gesture click guard
    const take = await page.$('.sheet .take:not(.taken)');
    if (!take) throw new Error('no take button on sheet');
    await take.click();
    await page.waitForTimeout(400);
    const taken = (await waitForAppRecord(page, record => record.taken.length > 0)).taken.length;
    if (!taken) throw new Error('take did not persist');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(1400); // the bookmark debounce
    await shot('04-reader');
  });

  await step('5 learner mark in the text', async () => {
    const marks = await page.evaluate(() => document.querySelectorAll('.reader .tok-learning').length);
    if (marks < 1) throw new Error('no under-ink after take');
  });

  await step('6 shelf 途中 tag', async () => {
    await page.click('#back');
    await page.waitForSelector('.shelf-item', { timeout: 5000 });
    const t = await page.evaluate(() => document.querySelector('.shelf-item .read-tag')?.textContent || '');
    if (!t.includes('途中')) throw new Error('tag: ' + JSON.stringify(t));
  });

  await step('7 JLPT lesson end to end', async () => {
    await page.click('#lessons-link');
    await page.waitForSelector('.lesson-row', { timeout: 5000 });
    await page.click('.lesson-row');
    await page.waitForSelector('#lesson-next', { timeout: 5000 });
    for (let i = 0; i < 40; i++) {
      const opt = await page.$('.lesson-option:not([disabled])');
      if (opt) await opt.click();
      const next = await page.$('#lesson-next');
      if (next) await next.click();
      await page.waitForTimeout(80);
      const t = await page.evaluate(() => document.querySelector('.view-title')?.textContent || '');
      if (/of|\//.test(t)) break;
    }
    // completion alone enrolls nothing (PR70-P0-1): the reader capture from
    // station 4 must still be the only deck row; the end screen's explicit
    // ぜんぶ覚える door is what mints the run
    const takenBefore = (await readAppRecord(page)).taken.length;
    if (takenBefore !== 1) throw new Error('lesson completion minted deck rows: ' + takenBefore);
    await page.click('#lesson-enroll-all');
    await page.waitForTimeout(300);
    const takenAfter = (await waitForAppRecord(page, record => record.taken.length >= 10)).taken.length;
    if (takenAfter < 10) throw new Error('the enroll door did not mint the run: ' + takenAfter);
    await shot('07-lesson-end');
    await page.getByRole('button', { name: /レッスン一覧|back to lessons/ }).click();
    await page.waitForTimeout(300);
    await page.click('#back');
    await page.waitForTimeout(300);
  });

  await step('8 tray → review → summary', async () => {
    await page.click('#tray');
    await page.waitForSelector('#review-start', { timeout: 5000 });
    await shot('08-tray');
    await page.click('#review-start');
    for (let i = 0; i < 60; i++) {
      // the zen room asks for the recall declaration first (T-06)
      const rev = await page.$('#declare-recalled');
      if (rev) {
        await rev.click();
        await page.waitForTimeout(100);
      }
      const g = await page.$('.grade.g-good');
      if (g) {
        await g.click();
        await page.waitForTimeout(100);
      }
      if (await page.$('.review-summary')) break;
    }
    if (!(await page.$('.review-summary'))) throw new Error('no summary reached');
    await shot('09-summary');
  });

  await step('9 review trace on the tray', async () => {
    await page.getByRole('button', { name: /リストへ|back to lists/ }).click();
    await page.waitForTimeout(300);
    const tr = await page.evaluate(() => document.querySelector('.srs-trace')?.textContent);
    if (!tr) throw new Error('no trace line');
    if (!(await page.$('#export-store')) || !(await page.$('#import-store'))) throw new Error('carry doors missing');
  });

  await step('10 levels · grammar(100+) · thesaurus · 字引', async () => {
    await page.click('#back');
    await page.waitForTimeout(300);
    await page.click('#levels-link');
    await page.waitForTimeout(400);
    await page.click('#back');
    await page.waitForTimeout(300);
    await page.click('#grammar-link');
    await page.waitForTimeout(400);
    const g = await page.evaluate(() => document.querySelectorAll('[data-grammar]').length);
    if (g < 100) throw new Error('grammar rows: ' + g);
    await page.click('#back');
    await page.waitForTimeout(300);
    await page.click('#thesaurus-link');
    await page.waitForSelector('.thes-block', { timeout: 5000 });
    await page.click('#back');
    await page.waitForTimeout(300);
    await page.click('#kanjidex-link');
    await page.waitForSelector('.kdx-row', { timeout: 5000 });
    await page.click('[data-kdx-part="木"]');
    await page.waitForTimeout(400);
    // Stroke counts live behind their visible lens; selecting a component
    // does not open that lens. Walk the current UI before choosing a count.
    await page.getByRole('button', { name: /by strokes/ }).click();
    await page.waitForSelector('[data-kdx-st="8"]');
    await page.click('[data-kdx-st="8"]');
    await page.waitForTimeout(400);
    const hits = await page.evaluate(() => [...document.querySelectorAll('[data-kdx-hit]')].map((b) => b.dataset.kdxHit));
    if (!hits.includes('林')) throw new Error('木+8画 misses 林: ' + hits.slice(0, 8).join(''));
    await page.click('[data-kdx-hit="林"]');
    await page.waitForTimeout(600);
    const glyph = await page.evaluate(() => document.querySelector('.sheet .hero-glyph')?.textContent);
    if (glyph !== '林') throw new Error('hit did not open the entry');
    const twins = await page.evaluate(() => !!document.querySelector('[data-confusable]'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.click('#back');
    await page.waitForTimeout(300);
    void twins; // 林 has no confusable set — presence is per-character, not asserted here
  });

  await step('11 return to the drift', async () => {
    for (let i = 0; i < 4; i++) {
      if (await page.$('#drift-layer.active')) break;
      await page.click('#back');
      await page.waitForTimeout(400);
    }
    if (!(await page.$('#drift-layer.active'))) throw new Error('drift not reached');
    await page.waitForTimeout(1500);
    await shot('11-drift-return');
  });

  await step('12 same-file offline reload retains the exact learner record', async () => {
    const before = await readAppRecord(page);
    assert(before.taken.length >= 10, 'The completed flow must have actual saved captures');
    assert(before.revlog.length > 0, 'The completed flow must have actual saved review judgments');
    await page.reload();
    await page.waitForSelector('#drift-layer.active', { timeout: 15000 });
    const restored = await waitForAppRecord(page, record => record.revlog.length === before.revlog.length);
    assert.deepEqual(restored, before, 'Reload must restore every learner-record field exactly');
    assert.equal(await page.locator('.store-alert:visible').count(), 0, 'Reload must not protect the record after recovery');
    recoveredRecordSha256 = createHash('sha256').update(JSON.stringify(restored)).digest('hex');
    await shot('12-record-recovered');
  });
} catch (error) {
  startupErrors.push({ phase, error: errorText(error) });
  failures.push(`${phase} failure`);
} finally {
  clearTimeout(runTimer);
  try { await cleanup(); }
  catch (error) { cleanupErrors.push({ handle: 'lifecycle', error: errorText(error) }); }
}

for (const name of expectedStations) {
  if (!passed.includes(name) && !failures.includes(name) && !skipped.includes(name)) skipped.push(name);
}

if (pageErrors.length) {
  failures.push('console/page errors');
  console.log('page errors:', pageErrors);
} else {
  console.log('page errors: none');
}
if (cleanupErrors.length) failures.push('cleanup failure');
if (handles.browserCreated && (!handles.browserClosed || handles.finalContextCount !== 0 || !handles.finalPageClosed)) failures.push('handles remain open');
if (handles.contextsCreated && !handles.contextClosed) failures.push('context remains open');
let finalVerifierSha256 = null;
let finalBuilderSha256 = null;
try {
  finalVerifierSha256 = sha256(readFileSync(SELF));
  finalBuilderSha256 = sha256(readFileSync(builder.path));
} catch (error) { identityErrors.push(errorText(error)); }
if (finalVerifierSha256 !== verifier.sha256 || finalBuilderSha256 !== builder.sha256) failures.push('verifier or builder changed during execution');
if (!failures.length && JSON.stringify(passed) !== JSON.stringify(expectedStations)) failures.push('station inventory mismatch');
const pass = failures.length === 0 && skipped.length === 0 && passed.length === expectedStations.length;
const result = {
  schemaVersion: 1, pass, status: pass ? 'passed' : 'failed', startedAt, completedAt: new Date().toISOString(),
  site, expectedArtifactSha256, artifactSha256: identity?.artifactSha256 || null,
  sourceAssetSha256: identity?.sourceAssetSha256 || null,
  verifier, builder, standalone, finalVerifierSha256, finalBuilderSha256,
  browser: { engine: 'chromium', version: browserVersion, executablePath: executablePath || null },
  handles, limits, timedOut, audioOutput, expectedStations,
  passed, failures, skipped, startupErrors, cleanupErrors, stationErrors, identityErrors, pageErrors, blockedRequests, recoveredRecordSha256,
  scope: 'One silent headless Chromium file-URL flow with external requests blocked; synthetic learner, no live provider, native device or full36 acceptance.',
};
writeFileSync(resolve(output, 'results.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });

if (!pass) {
  console.error(`\nverify-journey: ${failures.length} station(s) failed — ${failures.join(', ')}`);
  console.error(`Skipped after failure: ${skipped.join(', ') || 'none'}`);
  process.exitCode = 1;
} else console.log('\nverify-journey: all stations passed — the sequence flows.');
