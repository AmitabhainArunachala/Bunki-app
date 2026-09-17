/** Real generated-reading UI with synthetic provider responses. Generation
 * and exposure must not promote cards, grade recall, or create review debt. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { CORRIDOR_DIR, startCorridorServer } from './verify-corridor.mjs';
import { readAppRecord, waitForAppRecord } from './record-test-support.mjs';

const out = resolve(process.env.KAIRO_EVIDENCE_DIR || resolve(homedir(), '.dharma/bunki_audit/reading-candidates'));
mkdirSync(out, { recursive: true });
const { server, base } = await startCorridorServer();
const runtimeBytes = readFileSync(resolve(CORRIDOR_DIR, 'corridor.js'));
const corridorSha256 = createHash('sha256').update(runtimeBytes).digest('hex');
const browserName = process.env.KAIRO_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(browserName));
const browser = await ({ chromium, webkit }[browserName]).launch(browserName === 'chromium'
  ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {});
const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, serviceWorkers: 'block' });
let generated = 0;
const results = [];
const pageErrors = [];
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === base) {
    if (url.pathname === '/corridor.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: runtimeBytes });
    return route.continue();
  }
  if (url.origin !== 'https://reading-provider.invalid' || !url.pathname.endsWith('/v1/messages')) return route.abort();
  const body = route.request().postDataJSON();
  const system = String(body.system || '');
  let text = '[]';
  if (system.includes('reading passage')) {
    generated += 1;
    text = `第${generated}話です。猫（ねこ）は本（ほん）を見（み）ています。犬（いぬ）は水（みず）を飲（の）みます。明日（あした）も公園（こうえん）に行（い）きます。\n札：犬、猫、犬、存在しない合成語`;
  } else if (system.includes('choose vocabulary cards')) text = '犬、猫';
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text }] }) });
});
await context.addInitScript(() => {
  if (localStorage.getItem('reading-candidates-fixture')) return;
  localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1, taken: [] }));
  localStorage.setItem('kairo-ai-provider-v1', JSON.stringify({
    v: 1, baseUrl: 'https://reading-provider.invalid', model: 'synthetic-reading-model',
    credential: { origin: 'https://reading-provider.invalid', key: 'synthetic-reading-key-never-real' },
  }));
  localStorage.setItem('reading-candidates-fixture', '1');
});
const page = await context.newPage();
page.on('pageerror', (error) => pageErrors.push(error.message));
async function record() {
  return readAppRecord(page);
}
function unchangedLearning(value) {
  assert.deepEqual(value.taken, [], 'requesting a reading does not promote words');
  assert.deepEqual(value.srs || {}, {}, 'requesting a reading does not schedule words');
  assert.deepEqual(value.revlog || [], [], 'requesting a reading does not grade recall');
}
try {
  await page.goto(`${base}/index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#airead-link').click();
  for (let n = 1; n <= 20; n += 1) {
    await page.locator('#airead-make').click();
    await page.waitForFunction((prefix) => document.querySelector('.airead-body')?.textContent.startsWith(prefix), `第${n}話です。`, { timeout: 15000 });
    unchangedLearning(await record());
  }
  results.push({ name: 'twenty-generated-readings-create-zero-review-debt', pass: true });
  const beforeReload = await record();
  assert.equal(1 + beforeReload.aiReadings.length, 20, 'all accepted generated passages are retained');
  assert.deepEqual(beforeReload.aiReading.candidates, { v: 1, wordIds: ['犬', '猫'] }, 'suggestions are deduplicated and dictionary checked');
  assert.deepEqual(await page.evaluate(() => window.__KAIRO_SRS__.dueKeys()), [], 'no generated article makes reviews due');
  assert.ok(!beforeReload.aiReading.made?.length, 'new candidates are not labelled as already created cards');
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  const afterReload = await record();
  unchangedLearning(afterReload);
  assert.deepEqual(afterReload.aiReading, beforeReload.aiReading);
  assert.deepEqual(afterReload.aiReadings, beforeReload.aiReadings);
  results.push({ name: 'all-twenty-passages-survive-reload-without-promotion', pass: true });
  await page.locator('#airead-link').click();
  await page.locator('[data-airead-take="犬"]').click();
  const promoted = await waitForAppRecord(page, (record) => record.taken?.length === 1);
  assert.deepEqual(promoted.taken.map((item) => item.id), ['犬']);
  assert.deepEqual(promoted.revlog || [], [], 'explicit learning does not invent recall');
  // Native readback can precede the command's live UI publication.
  await page.waitForFunction(() => !document.querySelector('[data-airead-take="犬"]'));
  assert.deepEqual(await page.evaluate(() => window.__KAIRO_SRS__.dueKeys()), ['word:犬']);
  results.push({ name: 'one-explicit-suggestion-promotion-creates-only-that-review', pass: true });
  await page.locator('#back').click();
  // Asking specifically for cards remains an explicit learner action.
  await page.locator('#ai-link').click();
  await page.locator('#ai-cards-make').click();
  const explicit = await waitForAppRecord(page, (record) => record.taken?.length === 2);
  assert.deepEqual(explicit.taken.map((item) => item.id).sort(), ['犬', '猫'].sort());
  assert.deepEqual(explicit.revlog || [], [], 'explicit card creation still does not invent a review');
  results.push({ name: 'explicit-tutor-card-request-remains-available', pass: true });
  assert.deepEqual(pageErrors, [], 'no uncaught application errors');
} catch (error) {
  results.push({ name: 'generated-reading-lifecycle', pass: false, error: error.message, observed: await record().catch(() => null) });
  await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
  console.error(error.message);
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
const failures = results.filter((result) => !result.pass).length;
writeFileSync(resolve(out, 'verify-reading-candidates.json'), `${JSON.stringify({
  site: CORRIDOR_DIR,
  browser: browserName,
  corridorSha256,
  generated, results, pageErrors, failures, externalNetworkRequestsSent: 0,
  limitation: 'Synthetic provider output tests behavior and retention, not Japanese quality or actual personalization.',
}, null, 2)}\n`);
console.log(`Generated-reading regressions: ${results.length - failures}/${results.length} passed.`);
process.exitCode = failures || pageErrors.length ? 1 : 0;
