/** Exercise the Rajomon encounter through the real app in an owned browser.
 * KAIRO_SITE_DIR and KAIRO_EVIDENCE_DIR must point outside the checkout.
 * Writes result.json and the checks-shaped verification-report.json the release battery reads.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { readAppRecordSnapshot as readAppRecord } from './record-test-support.mjs';

const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const site = process.env.KAIRO_SITE_DIR;
const evidence = process.env.KAIRO_EVIDENCE_DIR;
assert(site && evidence, 'Name the immutable test site and external evidence directory');
mkdirSync(evidence, { recursive: true });
const host = await startStaticHost({ site, port: 0 });
const browser = await chromium.launch({ headless: true });
const observations = [];
const READINGS = '**/data/share_alike/reference-extra.json';
let activePage;
async function openEntry(page) {
  await page.goto(`${host.origin}/?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#shelf-tools-toggle').click();
  await page.locator('#kanjidex-link').click();
  await page.locator('.kdx-lens', { hasText: 'Kodansha number' }).first().click();
  await page.locator('#kdx-kkld').fill('門');
  await page.locator('[data-kdx-hit="門"]').first().click();
  await page.locator('#kanji-world-door').waitFor();
}
function writeReports(status, error) {
  const results = observations.flatMap(({ viewport, checks }) =>
    checks.map(check => ({ name: `${viewport.width}x${viewport.height}/${check}`, pass: true })));
  if (error) results.push({ name: 'failure', pass: false, detail: String(error.stack || error) });
  writeFileSync(resolve(evidence, 'result.json'), JSON.stringify({ status, error: error ? String(error.stack || error) : undefined, observations }, null, 2));
  writeFileSync(resolve(evidence, 'verification-report.json'), JSON.stringify({
    schemaVersion: 1,
    runId: process.env.KAIRO_GATE_RUN_ID || randomUUID(),
    runtime: { engine: 'chromium', version: browser.version() },
    site,
    summary: { total: results.length, failed: results.filter(row => !row.pass).length },
    results,
  }, null, 2) + '\n');
}
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === host.origin ? route.continue() : route.abort());
    let page = await context.newPage(); activePage = page;
    page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    // Every reading arrives on its own clock, and a sheet drawn while they are still on their way is
    // drawn again when they land. The door waits for that redraw instead of opening an encounter
    // the redraw would close: a failed first load leaves the retry, whose actual response is held.
    await page.route(READINGS, route => route.fulfill({ status: 503, body: '' }));
    await openEntry(page);
    await page.unroute(READINGS);
    let releaseReadings;
    const held = new Promise(done => { releaseReadings = done; });
    await page.route(READINGS, async route => { await held; await route.continue(); });
    await page.locator('#kanji-readings-retry').click();
    await page.locator('[data-kanji-readings="pending"]').waitFor();
    assert.equal(await page.locator('#kanji-world-door').count(), 0, 'The door waits while every reading is still on its way');
    releaseReadings();
    await page.locator('[data-kanji-readings="complete"]').waitFor();
    await page.unroute(READINGS);
    let door = page.locator('#kanji-world-door');
    await door.waitFor();
    assert.equal(await page.locator('[data-kanji-readings="pending"], [data-kanji-facts-state="pending"]').count(), 0);
    await door.scrollIntoViewIfNeeded();
    const origin = await page.evaluate(() => ({ node: document.querySelector('#sheet').dataset.node, y: window.scrollY, sheet: document.querySelector('#sheet').scrollTop }));
    const recordBefore = await readAppRecord(page);
    await door.click();
    let root = page.locator('.kw-encounter');
    await root.waitFor();
    await page.locator('.kw-image').evaluate(image => image.decode());
    assert.equal(await page.locator('.kw-image').count(), 1);
    await page.screenshot({ path: resolve(evidence, `place-${viewport.width}.png`) });
    const next = () => page.locator('[data-kw-action="next"]').click();
    await next();
    assert.equal(await page.locator('.kw-image').count(), 0);
    assert.equal(await page.locator('.kw-glyph').innerText(), '門');
    await next();
    assert.equal(await page.locator('.kw-word').innerText(), '正門');
    assert.equal(await page.locator('.kw-reading').innerText(), 'せいもん');
    await next();
    assert(!(await root.innerText()).includes('せいもん'), 'Reading must be hidden before retrieval');
    await page.locator('.kw-answer').fill('もん');
    await page.locator('.kw-answer').press('Enter');
    assert.match(await page.locator('.kw-feedback').innerText(), /Not quite/);
    await page.locator('[data-kw-action="reveal"]').click();
    assert.match(await page.locator('.kw-feedback').innerText(), /せいもん/);
    assert.equal(await page.locator('[data-kw-action="next"]').count(), 0, 'Reveal cannot complete practice');
    await page.locator('[data-kw-action="retry"]').click();
    await page.locator('.kw-answer').fill('セイモン');
    await page.locator('.kw-answer').press('Enter');
    await next();
    assert.equal(await root.getAttribute('data-kw-stage'), '4');
    assert.equal(await page.locator('.kw-image, .kw-word, .kw-reading, .kw-meaning').count(), 0);
    const recallText = await root.innerText();
    assert(!/せいもん|正門|\bgate\b/i.test(recallText), 'Plain recall must not retain an answer cue');
    await page.screenshot({ path: resolve(evidence, `recall-${viewport.width}.png`) });
    await page.locator('.kw-answer').fill('main gate');
    await page.locator('.kw-answer').press('Enter');
    assert.match(await page.locator('.kw-feedback').innerText(), /Not quite/);
    await page.locator('.kw-answer').fill('a gate');
    await page.locator('.kw-answer').press('Enter');
    await next();
    assert.equal(await root.getAttribute('data-kw-stage'), '5');
    await page.locator('[data-kw-action="return"]').last().click();
    assert.equal(await page.locator('#kanji-world-dialog').count(), 0);
    const after = await page.evaluate(() => ({ node: document.querySelector('#sheet').dataset.node, y: window.scrollY, sheet: document.querySelector('#sheet').scrollTop, focused: document.activeElement.id }));
    assert.equal(after.node, origin.node);
    assert(Math.abs(after.y - origin.y) < 2, 'Page scroll restored');
    assert(Math.abs(after.sheet - origin.sheet) < 2, 'Sheet scroll restored');
    assert.equal(after.focused, 'kanji-world-door');
    assert.deepEqual(await readAppRecord(page), recordBefore, 'Practice must not write learner records');
    // Repeat starts fresh, and Escape returns without finishing or writing.
    await door.click(); await root.waitFor();
    assert.equal(await root.getAttribute('data-kw-stage'), '0');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#kanji-world-dialog'));
    assert.deepEqual(await readAppRecord(page), recordBefore);
    // A delayed content response cannot resurrect a cancelled encounter.
    await page.route('**/kanji-world/rajomon-content.json', async route => {
      await new Promise(done => setTimeout(done, 200));
      try { await route.continue(); } catch { /* cancellation owns this request */ }
    });
    await door.click();
    await page.locator('#kanji-world-dialog button').first().click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#kanji-world-dialog, .kw-encounter').count(), 0);
    assert.deepEqual(await readAppRecord(page), recordBefore);
    await page.unroute('**/kanji-world/rajomon-content.json');
    // Broken content offers a usable exit; it cannot write or leave a modal behind.
    await page.route('**/kanji-world/rajomon-content.json', route => route.fulfill({ status: 503, body: '' }));
    await door.click();
    await page.getByText('This scene could not load.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Return', exact: true }).click();
    assert.equal(await page.locator('#kanji-world-dialog').count(), 0);
    await page.unroute('**/kanji-world/rajomon-content.json');
    assert.deepEqual(await readAppRecord(page), recordBefore);
    // An unavailable image is named honestly and the character practice remains usable.
    // A new document avoids reusing the already decoded image from the happy path.
    await page.close();
    page = await context.newPage(); activePage = page;
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/kanji-world/rajomon-r1.png', route => route.abort());
    await openEntry(page);
    door = page.locator('#kanji-world-door'); root = page.locator('.kw-encounter');
    const imageRecordBefore = await readAppRecord(page);
    await door.click();
    await page.locator('.kw-image-fallback').waitFor();
    assert(await root.evaluate(element => element.contains(document.activeElement)), 'Image failure retains keyboard focus');
    await next();
    assert.equal(await page.locator('.kw-glyph').innerText(), '門');
    await page.keyboard.press('Escape');
    assert.deepEqual(await readAppRecord(page), imageRecordBefore, 'All durable rows and revision remain unchanged');
    assert.deepEqual(errors, [], 'No page exceptions');
    observations.push({ viewport, status: 'PASS', checks: ['door-waits-for-readings', 'actual-entry', 'actual-image', 'word-check', 'wrong-answer', 'reveal-retry', 'uncued-recall', 'exact-return', 'unchanged-record-rows-and-revision', 'repeat', 'escape', 'cancel-in-flight', 'content-failure-return', 'image-failure-practice'] });
    await context.close(); activePage = null;
  }
  writeReports('PASS');
  console.log(JSON.stringify({ status: 'PASS', observations }));
} catch (error) {
  if (activePage) await activePage.screenshot({ path: resolve(evidence, 'failure.png') }).catch(() => {});
  writeReports('FAIL', error);
  throw error;
} finally {
  await browser.close(); await host.close();
}
