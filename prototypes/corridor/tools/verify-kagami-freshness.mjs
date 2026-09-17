/** Actual rest/wake controls must refresh the mirror when only card identities change. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

export async function verifyKagamiFreshness(base) {
  const out = mkdtempSync(join(resolveCorridorEvidence(), 'kagami-freshness-'));
  const origin = new URL(base).origin;
  const sha = (value) => createHash('sha256').update(value).digest('hex');
const time = 1755000000000;
const card = { due: '2025-08-01T00:00:00.000Z', last_review: '2025-07-31T00:00:00.000Z', stability: 3, difficulty: 5,
  elapsed_days: 1, scheduled_days: 1, reps: 10, lapses: 7, learning_steps: 0, state: 2 };
const fixture = { v: 1, taken: ['学校', '天気'].map((id, i) => ({ t: 'word', id, label: id, ts: time + i })),
  srs: { 'word:学校': card, 'word:天気': card }, suspended: { 'word:学校': time },
  obslog: Array.from({ length: 4 }, (_, i) => [time + 20 + i, 'dojo', 'word:学校', 3]) };
const results = [], errors = [], externalRequests = [];
let activeBrowser, activeContext;
const snapshot = async (page, engine, phase) => {
  const state = await readAppRecordSnapshot(page);
  const file = resolve(out, `${engine}-${phase}.json`);
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  return { state, file, sha256: sha(readFileSync(file)) };
};
const displayed = (page) => page.locator('[data-kagami-leech]').evaluateAll((rows) => rows.map((row) => row.dataset.kagamiLeech));
try {
  for (const engine of ['chromium', 'webkit']) {
    const browser = await ({ chromium, webkit }[engine]).launch();
    activeBrowser = browser;
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block' });
    activeContext = context;
    await silenceBrowserAudio(context);
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      externalRequests.push({ engine, origin: url.origin }); return route.abort();
    });
    await context.addInitScript((fixture) => {
      if (localStorage.getItem('synthetic-rest-swap-installed')) return;
      localStorage.setItem('kairo-corridor-v1', JSON.stringify(fixture));
      localStorage.setItem('synthetic-rest-swap-installed', '1');
    }, fixture);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push({ engine, errorName: error.name, message: error.message }));
    const result = { engine, browserVersion: browser.version(), pass: false };
    try {
      await page.goto(`${origin}/index.html?entry=shelf&ui=bi`);
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await page.locator('#kagami-link').click();
      assert.deepEqual(await displayed(page), ['word:天気']);
      const before = await snapshot(page, engine, 'before');
      result.initial = { displayed: await displayed(page), native: before.file, sha256: before.sha256 };
      await page.locator('#tray').click();
      const school = page.locator('.tray-line').filter({ has: page.locator('.w', { hasText: /^学校$/u }) });
      const weather = page.locator('.tray-line').filter({ has: page.locator('.w', { hasText: /^天気$/u }) });
      await school.getByRole('button', { name: 'wake this card', exact: true }).click();
      await waitForAppRecord(page, (record) => Object.keys(record.suspended).length === 0);
      await school.getByRole('button', { name: 'rest this card', exact: true }).waitFor();
      await weather.getByRole('button', { name: 'rest this card', exact: true }).click();
      await waitForAppRecord(page, (record) => Object.keys(record.suspended).length === 1 && record.suspended['word:天気'] > 0);
      await weather.getByRole('button', { name: 'wake this card', exact: true }).waitFor();
      const after = await snapshot(page, engine, 'after-two-ui-commits');
      assert.deepEqual(after.state.installation, before.state.installation);
      assert.equal(after.state.revision, before.state.revision + 2);
      assert.deepEqual(Object.keys(after.state.record.suspended), ['word:天気']);
      assert.deepEqual({ ...after.state.record, suspended: before.state.record.suspended }, before.state.record);
      assert.deepEqual(after.state.archive, before.state.archive);
      assert.equal(after.state.rows.filter((row) => row.kind === 'operation').length, 0);
      await page.locator('#back').click();
      await page.locator('[data-band="lexis"]').waitFor();
      const warm = await displayed(page);
      const model = await page.evaluate(() => JSON.stringify(window.__KAIRO_KAGAMI__.model()));
      result.after = { displayed: warm, model: JSON.parse(model), native: after.file, sha256: after.sha256, expected: ['word:学校'] };
      result.screenshot = resolve(out, `${engine}-warm-mirror.png`);
      await page.screenshot({ path: result.screenshot, fullPage: true });
      await page.reload();
      await page.waitForFunction(() => document.body.dataset.ready === '1');
      await page.locator('#kagami-link').click();
      assert.deepEqual(await displayed(page), ['word:学校']);
      const reopened = await snapshot(page, engine, 'reopened');
      assert.deepEqual(reopened.state.rows, after.state.rows);
      result.reopened = { displayed: await displayed(page), native: reopened.file, sha256: reopened.sha256 };
      assert.deepEqual(warm, ['word:学校'], 'Warm mirror must reflect the actual rested identities, even when their count is unchanged');
      result.pass = true;
    } catch (error) { result.error = String(error.stack || error); }
    finally {
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch((error) => errors.push({ engine, message: error.message }));
      await context.close(); await browser.close();
    }
    results.push(result);
    console.log(`${engine}: ${result.pass ? 'PASS' : result.error}`);
  }
} finally {
  try { await activeContext?.close(); }
  finally { await activeBrowser?.close(); }
  const receipt = { suite: 'actual-ui-rest-swap-model-freshness', pass: results.length === 2 && results.every((row) => row.pass) && !errors.length && !externalRequests.length,
    origin,
    verifierSha256: sha(readFileSync(new URL(import.meta.url))), results, errors, externalRequests,
    limitations: ['Synthetic learner seeds, actual UI rest/wake controls and native IndexedDB commits', 'No direct application-state mutation or model replacement', 'Separate isolated browser profiles; no physical device claim'] };
  writeFileSync(resolve(out, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  assert.equal(receipt.pass, true, JSON.stringify({ results, errors, externalRequests }));
}

  return { engines: ['chromium', 'webkit'], passed: 2, out };
}
