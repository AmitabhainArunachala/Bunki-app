/** Walk the Passage preview through the real app in an owned browser (prototype, 2026-11-10).
 *
 * From the app's first screen to the door on the 職 page, through the seven stops to the end,
 * and back to where it started; at 390x844 (touch) and at desktop size. Along the way: the
 * place kept by Return or Escape and resumed from the door after a detour, a played stretch,
 * reduced motion, a page without the door, and proof that the learner record and device
 * storage did not change. A second walk starts from a word in a shelf article: that word
 * travels with the passage, and the end leads back to the same line of the reading.
 *
 * KAIRO_SITE_DIR and KAIRO_EVIDENCE_DIR must point outside the checkout. KAIRO_BROWSER=webkit
 * or =all chooses the engines (default chromium). Writes result.json, verification-report.json
 * and screenshots into the evidence directory.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { readAppRecordSnapshot } from './record-test-support.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const site = process.env.KAIRO_SITE_DIR;
const evidence = process.env.KAIRO_EVIDENCE_DIR;
assert(site && evidence, 'Name the immutable test site and external evidence directory');
mkdirSync(evidence, { recursive: true });
const ENGINES = { chromium, webkit };
const chosen = process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER || 'chromium'];
assert(chosen.every((name) => ENGINES[name]), 'KAIRO_BROWSER is chromium, webkit or all');
const SIZES = [
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  { name: 'desktop', viewport: { width: 1280, height: 900 } },
];
const STOPS = ['職', '戠', '識', '戠', '織', '糸', '織'];
const HOPS = [null,
  'From 職 to 戠: 戠 is the part of 職 that carries its sound.',
  'From 戠 to 識: 戠 is the part of 識 that carries its sound.',
  'From 識 to 戠: 戠 is the part of 識 that carries its sound.',
  'From 戠 to 織: 戠 is the part of 織 that carries its sound.',
  'From 織 to 糸: 糸 is the part of 織 tied to its meaning.',
  'From 糸 to 織: 糸 is the part of 織 tied to its meaning.'];
const host = await startStaticHost({ site, port: 0 });
const observations = [];
const runtimes = [];
let activePage;

function writeReports(status, error) {
  const results = observations.flatMap(({ engine, size, checks }) =>
    checks.map((check) => ({ name: `${engine}/${size}/${check}`, pass: true })));
  if (error) results.push({ name: 'failure', pass: false, detail: String(error.stack || error) });
  writeFileSync(resolve(evidence, 'result.json'), JSON.stringify({ status, error: error ? String(error.stack || error) : undefined, observations }, null, 2));
  writeFileSync(resolve(evidence, 'verification-report.json'), JSON.stringify({
    schemaVersion: 1,
    runId: process.env.KAIRO_GATE_RUN_ID || randomUUID(),
    runtime: runtimes,
    site,
    summary: { total: results.length, failed: results.filter((row) => !row.pass).length },
    results,
  }, null, 2) + '\n');
}

async function open(browser, size, options = {}) {
  const { name, ...device } = size;
  const context = await browser.newContext({ ...device, locale: 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block', ...options });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort());
  const page = await context.newPage(); activePage = page;
  page.setDefaultTimeout(20000);
  const problems = [];
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  page.on('response', (response) => { if (response.status() >= 400) problems.push(`http ${response.status()} ${response.url()}`); });
  page.on('requestfailed', (request) => {
    // the report sheet reads only the head of build-identity.json and drops the rest, by design
    if (request.url().endsWith('/build-identity.json') && request.failure()?.errorText === 'net::ERR_ABORTED') return;
    problems.push(`request failed: ${request.failure()?.errorText} ${request.url()}`);
  });
  const press = (target) => (typeof target === 'string' ? page.locator(target) : target)[device.hasTouch ? 'tap' : 'click']();
  return { context, page, problems, press, name };
}
/** The learner's way in: the first screen, the Words tab, the dictionary search, the kanji row. */
async function firstScreen({ page }) {
  await page.goto(`${host.origin}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 45000 });
  await page.locator('#ginga-symbol').waitFor();
  assert.equal(await page.evaluate(() => document.body.dataset.view), 'drift', 'The walk starts on the app’s first screen');
}
async function toKanji({ page, press }, kanji, reading) {
  await page.locator('#nav-search-input').fill(kanji);
  const row = page.locator('.nav-search-row', { hasText: reading }).first();
  await row.waitFor();
  await press(row);
  await page.locator('#sheet .hero-glyph', { hasText: kanji }).waitFor();
}
const place = (page) => page.evaluate(() => ({ node: document.querySelector('#sheet')?.dataset.node ?? null,
  glyph: document.querySelector('#sheet .hero-glyph')?.textContent ?? null, sheet: document.querySelector('#sheet')?.scrollTop ?? null,
  y: window.scrollY, focused: document.activeElement?.id || '', dialogs: document.querySelectorAll('#passage-dialog').length,
  overflow: document.body.style.overflow }));
// kairo-frames is the app's own frame sampler: it writes the row for the page that was opened when the browser next
// idles, which can fall after the door is pressed. Every other device key must stay as it was.
/** The page's scroll has stopped moving: two equal readings 250 ms apart. */
async function settled(page) {
  for (let last = NaN, tries = 0; tries < 20; tries += 1) {
    const now = await page.locator('#sheet').evaluate((sheet) => sheet.scrollTop);
    if (now === last) return;
    last = now;
    await page.waitForTimeout(250);
  }
  assert.fail('The page under the door kept scrolling');
}
const device = (page) => page.evaluate(() => JSON.stringify([
  Object.entries(localStorage).filter(([key]) => key !== 'kairo-frames').sort(), Object.entries(sessionStorage).sort()]));
const stopNow = async (page) => ({ glyph: await page.locator('#passage-glyph').innerText(), count: await page.locator('#passage-count').innerText(),
  hop: await page.locator('.passage-hop').innerText() });
async function expectStop(page, index) {
  await page.locator('#passage-count', { hasText: `stop ${index + 1} of 7` }).waitFor();
  const now = await stopNow(page);
  assert.equal(now.glyph, STOPS[index], `Stop ${index + 1} shows ${STOPS[index]}`);
  assert.equal(now.hop, HOPS[index] ?? 'The passage starts at 職.');
  assert.equal(await page.locator('.passage-route [aria-current="step"]').innerText(), STOPS[index]);
  assert.equal(await page.locator('.passage-route li.is-past').count(), index, 'Only the stops already walked are marked as walked');
  assert.equal(await page.locator('.passage-source').count(), index ? 1 : 0, 'Each hop names its source; the first stop has none');
}

async function walk(browser, engine, size) {
  const session = await open(browser, size);
  const { page, problems, press } = session;
  const checks = [];
  const shot = (name) => page.screenshot({ path: resolve(evidence, `${name}-${engine}-${size.name}.png`) });
  await firstScreen(session);
  await press('#home-review');
  await page.locator('#tab-words').waitFor();
  await press('#tab-words');
  await toKanji(session, '職', 'ショク');
  const door = page.locator('#passage-door');
  await door.waitFor();
  assert.equal(await door.innerText(), 'Walk the 職・識・織 passage', 'The door names the walk');
  assert.equal(await page.locator('#passage-door').count(), 1);
  // The page is scrolled before the door is pressed, so "returns to where it started" names a real place.
  await page.locator('#sheet').evaluate((sheet) => { sheet.scrollTop = 240; });
  await page.waitForTimeout(400); // the page's own first-open writes settle before the record is read
  const origin = await place(page);
  assert.equal(origin.glyph, '職');
  assert.equal(origin.sheet, 240, 'The page under the door is scrolled');
  assert.equal(await door.evaluate((node) => { const box = node.getBoundingClientRect(); return box.top >= 0 && box.bottom <= window.innerHeight; }), true,
    'The door is on screen at that scroll');
  const recordBefore = await readAppRecordSnapshot(page), deviceBefore = await device(page);
  await shot('door');
  checks.push('first-screen-to-door');

  await press(door);
  await page.locator('#passage-dialog[open]').waitFor();
  await expectStop(page, 0);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'passage-next', 'The keyboard starts on the next step');
  assert.equal(await page.locator('#passage-dialog .pool-tag').innerText(), 'preview');
  assert.equal(await page.locator('.passage-carried, .passage-quote').count(), 0, 'A page opened from the dictionary carries no word');
  await shot('stop-1');
  await press('#passage-next'); await expectStop(page, 1);
  await shot('stop-2');
  await press('#passage-next'); await expectStop(page, 2);
  checks.push('stops-1-to-3');

  // Leaving keeps the place: the door offers the same stop, and the page under it has not moved.
  if (size.hasTouch) await press('#passage-return'); else await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#passage-dialog'));
  const away = await place(page);
  assert.deepEqual({ ...away, focused: 'passage-door' }, { ...origin, focused: 'passage-door' }, 'Leaving restores the page');
  assert.equal(away.focused, 'passage-door', 'Leaving hands the keyboard back to the door');
  assert.equal(await door.innerText(), 'Resume the passage · stop 3 of 7');
  assert.deepEqual(await readAppRecordSnapshot(page), recordBefore, 'Opening, stepping and leaving change no durable row and no revision');
  assert.equal(await device(page), deviceBefore, 'Opening, stepping and leaving write no device marker');
  // A detour and back: the page's own door to 戠 opens another page, which has no Passage door; Back
  // brings the first page back with the place still offered, and the passage resumes paused at that stop.
  const detour = page.locator('[data-family-edge="戠:phonetic-component-of:職"]');
  await detour.waitFor();
  await detour.scrollIntoViewIfNeeded();
  await press(detour);
  await page.locator('#sheet .hero-glyph', { hasText: '戠' }).waitFor();
  assert.equal(await page.locator('#passage-door').count(), 0, 'The detour page has no Passage door');
  await press('#sheet-back');
  await page.locator('#sheet .hero-glyph', { hasText: '職' }).waitFor();
  await page.locator('#passage-door', { hasText: 'Resume the passage · stop 3 of 7' }).waitFor();
  // Back hands the page its own scroll a frame or two later: let that land, then choose the place to resume from.
  await settled(page);
  await page.locator('#sheet').evaluate((sheet) => { sheet.scrollTop = 240; });
  await settled(page);
  const resumed = await place(page);
  assert.equal(resumed.sheet, 240, 'The page under the door is scrolled again');
  assert.equal(resumed.node, origin.node, 'Back returned to the same page');
  // the detour's own pages may keep what the app keeps for any page; the rest of the passage is measured from here
  const recordMid = await readAppRecordSnapshot(page), deviceMid = await device(page);
  await press(door);
  await page.locator('#passage-dialog[open]').waitFor();
  await expectStop(page, 2);
  assert.equal(await page.locator('#passage-play').innerText(), 'Play through', 'A resumed passage is paused');
  checks.push('leave-detour-and-resume-at-stop-3');

  await press('#passage-next'); await expectStop(page, 3);
  // A played stretch: the stop advances by itself, and Pause holds it.
  assert.equal(await page.locator('#passage-play').innerText(), 'Play through');
  await press('#passage-play');
  await page.locator('#passage-play', { hasText: 'Pause' }).waitFor();
  assert.equal(await page.locator('.passage-progress').isVisible(), true);
  await page.locator('#passage-count', { hasText: 'stop 5 of 7' }).waitFor({ timeout: 9000 });
  await press('#passage-play');
  await page.locator('#passage-play', { hasText: 'Play through' }).waitFor();
  await page.waitForTimeout(1500);
  await expectStop(page, 4);
  assert.equal(await page.locator('.passage-progress').isVisible(), false);
  checks.push('play-advances-pause-holds');

  await press('#passage-next'); await expectStop(page, 5);
  await press('#passage-next'); await expectStop(page, 6);
  assert.equal(await page.locator('#passage-next').innerText(), 'Finish the passage');
  await shot('stop-7');
  await press('#passage-next');
  await page.locator('#passage-finish').waitFor();
  assert.match(await page.locator('#passage-dialog').innerText(), /End of the passage/u);
  assert.match(await page.locator('#passage-dialog').innerText(), /You walked all 7 stops: 職 → 戠 → 識 → 戠 → 織 → 糸 → 織/u);
  assert.equal(await page.locator('#passage-next, #passage-play, #passage-glyph').count(), 0, 'A finished passage offers no further step');
  assert.equal(await page.locator('.passage-route li.is-past').count(), 7);
  const wide = await page.evaluate(() => document.querySelector('#passage-dialog').scrollWidth - window.innerWidth);
  assert(wide <= 1, `The screen is ${wide}px wider than the window`);
  await shot('end');
  checks.push('stops-4-to-7-and-end');

  await press('#passage-finish');
  await page.waitForFunction(() => !document.querySelector('#passage-dialog'));
  const after = await place(page);
  assert.deepEqual(after, { ...resumed, focused: 'passage-door' }, 'The end returns to the page, scroll and door it started from');
  assert.equal(await door.innerText(), 'Walk the 職・識・織 passage', 'A finished passage is not offered for resuming');
  assert.deepEqual(await readAppRecordSnapshot(page), recordMid, 'Resuming, playing and finishing change no durable row and no revision');
  assert.equal(await device(page), deviceMid, 'Resuming, playing and finishing write no device marker');
  checks.push('exact-return', 'unchanged-record-rows-and-revision', 'unchanged-device-storage');

  // A walk begun again starts at the first stop; the app under it still answers.
  await press(door);
  await page.locator('#passage-dialog[open]').waitFor();
  await expectStop(page, 0);
  await press('#passage-return');
  await page.waitForFunction(() => !document.querySelector('#passage-dialog'));
  await press('#sheet-back');
  await page.locator('#sheet').waitFor({ state: 'detached' });
  await page.locator('#nav-search-input').waitFor();
  checks.push('repeat-starts-at-stop-1', 'app-navigates-after');

  // Control: a kanji outside the family has no such door.
  await toKanji(session, '門', 'モン');
  await page.locator('#kanji-world-door').waitFor();
  assert.equal(await page.locator('#passage-door').count(), 0, '門 has no Passage door');
  checks.push('no-door-outside-the-family');
  assert.deepEqual(problems, [], 'No console errors, page exceptions or failed requests');
  await session.context.close(); activePage = null;
  observations.push({ engine, size: size.name, viewport: size.viewport, status: 'PASS', checks: [...checks, 'no-console-errors'] });
}

/** From a reading: the word the learner tapped travels with the passage, and the end leads back to the reading. */
async function fromReading(browser, engine, size) {
  const session = await open(browser, size);
  const { page, problems, press } = session;
  await firstScreen(session);
  await press('#ginga-symbol');
  await press('.bubble-shelf');
  const article = page.locator('.shelf-open', { hasText: '都市の匿名性と言語' }).first();
  await article.waitFor();
  await article.scrollIntoViewIfNeeded();
  await press(article);
  await page.locator('.reader .tok.content').first().waitFor();
  // a new learner's first article opens its first word's box once, by itself: let it show, then put it away
  if (await page.locator('#mini').waitFor({ timeout: 2500 }).then(() => true, () => false)) {
    await page.waitForTimeout(900);
    await page.keyboard.press('Escape');
    await page.locator('#mini').waitFor({ state: 'hidden' });
  }
  const word = page.locator('.reader .tok.content', { hasText: '職業' }).first();
  await word.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const reading = await page.evaluate(() => ({ view: document.body.dataset.view, y: Math.round(window.scrollY) }));
  assert.equal(reading.view, 'reader');
  for (let taps = 0; taps < 5 && !(await page.locator('#mini').isVisible()); taps += 1) { await press(word); await page.waitForTimeout(700); }
  await press(page.locator('#mini .mini-kanji-row', { hasText: '職' }).first());
  await page.locator('#sheet .hero-glyph', { hasText: '職' }).waitFor();
  const door = page.locator('#passage-door');
  await door.waitFor();
  await door.scrollIntoViewIfNeeded();
  await settled(page);
  const origin = await place(page);
  const recordBefore = await readAppRecordSnapshot(page), deviceBefore = await device(page);
  await press(door);
  await expectStop(page, 0);
  const carried = () => page.evaluate(() => ({ word: document.querySelector('.passage-carried')?.firstChild?.textContent ?? null,
    reading: document.querySelector('.passage-carried .row-reading')?.textContent ?? null,
    quote: document.querySelector('.passage-quote')?.textContent ?? null,
    title: document.querySelector('.passage-quote + .fine')?.textContent ?? null }));
  const expected = { word: '職業', reading: 'しょくぎょう', quote: '出身も職業も伏せたまま、日々の用件だけで生活が成り立つ。', title: '「都市の匿名性と言語」' };
  assert.deepEqual(await carried(), expected, 'The passage shows the word, its sentence and its article as the reading has them');
  await page.screenshot({ path: resolve(evidence, `from-reading-${engine}-${size.name}.png`) });
  await press('#passage-next'); await expectStop(page, 1);
  await press('#passage-return');
  await page.waitForFunction(() => !document.querySelector('#passage-dialog'));
  await press(door);
  await expectStop(page, 1);
  assert.deepEqual(await carried(), expected, 'A resumed passage still carries the same occurrence');
  for (let index = 2; index < STOPS.length; index += 1) { await press('#passage-next'); await expectStop(page, index); }
  await press('#passage-next');
  await page.locator('#passage-finish').waitFor();
  assert.deepEqual(await carried(), expected);
  await press('#passage-finish');
  await page.waitForFunction(() => !document.querySelector('#passage-dialog'));
  assert.deepEqual(await place(page), { ...origin, focused: 'passage-door' }, 'The end returns to the kanji page it was opened from');
  assert.deepEqual(await readAppRecordSnapshot(page), recordBefore, 'All durable rows and the revision are unchanged');
  assert.equal(await device(page), deviceBefore, 'No device marker was written');
  await press('#sheet-back');
  await page.locator('#sheet').waitFor({ state: 'detached' });
  await page.waitForTimeout(600);
  const back = await page.evaluate(() => ({ view: document.body.dataset.view, y: Math.round(window.scrollY) }));
  assert.equal(back.view, 'reader', 'Closing the kanji page lands in the reading');
  assert(Math.abs(back.y - reading.y) <= 2, `The reading is at the line it was left on (${reading.y} then ${back.y})`);
  assert.equal(await word.isVisible(), true);
  assert.deepEqual(problems, []);
  await session.context.close(); activePage = null;
  observations.push({ engine, size: `${size.name}-from-reading`, viewport: size.viewport, status: 'PASS',
    checks: ['article-word-to-door', 'carried-word-sentence-and-title', 'carried-survives-resume', 'seven-stops', 'exact-return',
      'unchanged-record-rows-and-revision', 'unchanged-device-storage', 'back-in-the-reading-at-the-same-line', 'no-console-errors'] });
}

/** Reduced motion: the model refuses a timer, so no Play is offered and each step is the learner's. */
async function reduced(browser, engine, size) {
  const session = await open(browser, size, { reducedMotion: 'reduce' });
  const { page, problems, press } = session;
  await firstScreen(session);
  await press('#home-review');
  await page.locator('#tab-words').waitFor();
  await press('#tab-words');
  await toKanji(session, '織', 'ショク');
  const door = page.locator('#passage-door');
  await door.waitFor();
  await door.scrollIntoViewIfNeeded();
  await press(door);
  await expectStop(page, 0);
  assert.equal(await page.locator('#passage-play').count(), 0, 'Reduced motion offers no played walk');
  for (let index = 1; index < STOPS.length; index += 1) { await press('#passage-next'); await expectStop(page, index); }
  await press('#passage-next');
  await press('#passage-finish');
  await page.waitForFunction(() => !document.querySelector('#passage-dialog'));
  assert.equal((await place(page)).glyph, '織', 'The passage returns to the page it was opened from');
  assert.deepEqual(problems, []);
  await session.context.close(); activePage = null;
  observations.push({ engine, size: `${size.name}-reduced-motion`, viewport: size.viewport, status: 'PASS', checks: ['door-on-織', 'no-play', 'seven-stops-by-next', 'return'] });
}

/** Without a secure address the model cannot check its pinned sources: the screen says so, returns, and can be tried again. */
async function insecure(browser, engine, size) {
  const session = await open(browser, size);
  const { page, problems, press } = session;
  await firstScreen(session);
  await press('#home-review');
  await page.locator('#tab-words').waitFor();
  await press('#tab-words');
  await toKanji(session, '識', 'シキ');
  const door = page.locator('#passage-door');
  await door.waitFor();
  await door.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    window.__subtle = Object.getOwnPropertyDescriptor(Crypto.prototype, 'subtle');
    Object.defineProperty(Crypto.prototype, 'subtle', { configurable: true, get: () => undefined });
  });
  await press(door);
  await page.getByText('This preview needs a secure (https) address to check its sources.').waitFor();
  assert.equal(await page.locator('#passage-next, #passage-glyph').count(), 0);
  await press('#passage-return');
  await page.waitForFunction(() => !document.querySelector('#passage-dialog'));
  assert.equal(await door.innerText(), 'Walk the 職・識・織 passage');
  await page.evaluate(() => { Object.defineProperty(Crypto.prototype, 'subtle', window.__subtle); delete window.__subtle; });
  await press(door);
  await expectStop(page, 0);
  await press('#passage-return');
  await page.waitForFunction(() => !document.querySelector('#passage-dialog'));
  assert.deepEqual(problems, []);
  await session.context.close(); activePage = null;
  observations.push({ engine, size: `${size.name}-insecure-address`, viewport: size.viewport, status: 'PASS', checks: ['door-on-識', 'says-it-needs-https', 'return', 'works-once-secure'] });
}

let browser;
try {
  for (const engine of chosen) {
    browser = await ENGINES[engine].launch({ headless: true });
    runtimes.push({ engine, version: browser.version() });
    for (const size of SIZES) await walk(browser, engine, size);
    for (const size of SIZES) await fromReading(browser, engine, size);
    await reduced(browser, engine, SIZES[0]);
    await insecure(browser, engine, SIZES[0]);
    await browser.close(); browser = null;
  }
  writeReports('PASS');
  console.log(JSON.stringify({ status: 'PASS', observations }));
} catch (error) {
  if (activePage) await activePage.screenshot({ path: resolve(evidence, 'failure.png') }).catch(() => {});
  writeReports('FAIL', error);
  throw error;
} finally {
  await browser?.close(); await host.close();
}
