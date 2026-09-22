/** Actual reader/provider/storage journeys. Synthetic output demonstrates the
 * integration contract, not Japanese editorial quality or live model quality. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { CORRIDOR_DIR, startCorridorServer } from './verify-corridor.mjs';
import { readAppRecord } from './record-test-support.mjs';

// An explicit external driver allows a browser-engine regression to be checked
// without silently changing the application or the workspace dependency graph.
const driverModule = process.env.KAIRO_PLAYWRIGHT_MODULE || 'playwright-core';
const { chromium, webkit } = await import(driverModule);

const out = resolve(process.env.KAIRO_EVIDENCE_DIR || resolve(homedir(), '.dharma/bunki_audit/personal-reading'));
mkdirSync(out, { recursive: true });
const { server, base } = await startCorridorServer();
const runtimeSource = process.env.KAIRO_PERSONAL_READING_SOURCE || resolve(CORRIDOR_DIR, 'corridor.js');
const runtimeBytes = readFileSync(runtimeSource);
const browserName = process.env.KAIRO_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(browserName), 'KAIRO_BROWSER must be chromium or webkit');
const browser = await ({ chromium, webkit }[browserName]).launch(browserName === 'chromium'
  ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {});
const browserVersion = browser.version();
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: 'block' });
const results = [];
const errors = [];
const requests = [];
let providerCase = 'article';
let heldRoute = null;
let serial = 0;
const article = (number) => ({
  title: `森と科学 ${number}`,
  text: `森（もり）の入口（いりぐち）に犬（いぬ）と猫（ねこ）がいます。\n\n${'木（き）の下（した）で、小（ちい）さな発見（はっけん）について話（はな）します。'.repeat(18)}`,
  suggestedWords: ['犬', '猫', '犬', '存在しない合成語'],
  references: [{ title: 'Synthetic source, not a verified fact', url: 'https://source.invalid/reference' }],
});
const fulfill = (route, text, extra = {}) => route.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ model: 'reported-model-version', stop_reason: 'end_turn', content: [{ type: 'text', text }], ...extra }) });
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === base) {
    if (url.pathname === '/corridor.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: runtimeBytes });
    return route.continue();
  }
  if (url.origin !== 'https://personal-provider.invalid' || url.pathname !== '/v1/messages') return route.abort();
  const body = route.request().postDataJSON();
  if (!String(body.system).includes('reading passage')) return fulfill(route, '[]');
  requests.push(body);
  serial += 1;
  if (providerCase === 'hold') { heldRoute = route; return; }
  if (providerCase === 'truncated') return fulfill(route, JSON.stringify(article(serial)), { stop_reason: 'max_tokens' });
  if (providerCase === 'authority') return fulfill(route, JSON.stringify({ ...article(serial), editorial: { status: 'approved' } }));
  if (providerCase === 'malformed') return fulfill(route, '{"title":"途中","text":');
  if (providerCase === 'oversized') return fulfill(route, JSON.stringify({ ...article(serial), text: '日本語'.repeat(4100) }));
  return fulfill(route, JSON.stringify(article(serial)));
});
await context.addInitScript(() => {
  if (localStorage.getItem('personal-reading-fixture')) return;
  localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1, taken: [],
    obslog: Array.from({ length: 12 }, (_, i) => [1000 + i, 'dojo', 'word:犬', 3]),
    privateFixture: 'private-record-sentinel-do-not-send',
  }));
  localStorage.setItem('kairo-ai-provider-v1', JSON.stringify({
    v: 1, baseUrl: 'https://personal-provider.invalid', model: 'requested-model-alias',
    credential: { origin: 'https://personal-provider.invalid', key: 'synthetic-key-never-real' },
  }));
  localStorage.setItem('personal-reading-fixture', '1');
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
const record = () => readAppRecord(page);
async function idle() {
  await page.waitForFunction(() => {
    const button = document.querySelector('#airead-make');
    return button && !button.disabled;
  }, null, { timeout: 20000 });
}
const preservedLearning = (value) => {
  assert.deepEqual(value.taken, []);
  assert.deepEqual(value.srs || {}, {});
  assert.deepEqual(value.revlog || [], []);
  assert.equal(value.obslog.length, 12, 'AI authored reading creates no learner observation');
};
try {
  await page.goto(`${base}/index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#airead-link').click();
  await page.locator('#airead-interests').fill('科学、歴史、自然');
  await page.locator('#airead-startingLevel').selectOption('N2');
  await page.locator('#airead-genre').selectOption('essay');
  await page.locator('#airead-length').selectOption('long');
  await page.locator('#airead-register').selectOption('formal');
  await page.locator('#airead-challenge').selectOption('stretch');
  await page.locator('#airead-make').click();
  await page.waitForSelector('#airead-title');
  await idle();
  const first = await record();
  preservedLearning(first);
  assert.deepEqual(first.readingSettings, {
    mode: 'original-factual', genre: 'essay', length: 'long', register: 'formal', challenge: 'stretch',
    interests: ['科学', '歴史', '自然'], startingLevel: 'N2',
  });
  const sent = JSON.parse(requests[0].messages[0].content);
  assert.equal(requests[0].max_tokens, 16000);
  assert.deepEqual(sent.interests, ['科学', '歴史', '自然']);
  assert.equal(sent.startingLevel, 'N2');
  assert.deepEqual(sent.style, { genre: 'essay', length: 'long', register: 'formal', challenge: 'stretch' });
  const lexis = sent.learningContext.bands.find((band) => band.dimension === 'lexis');
  assert.deepEqual(lexis, { dimension: 'lexis', workingBand: 'N5', evidence: 'measured', observedSignalsPresent: false });
  assert.equal(sent.learningContext.bands.find((band) => band.dimension === 'syntax').evidence, 'sparse');
  for (const forbidden of ['private-record-sentinel', 'synthetic-key-never-real', 'sessionEpoch', 'learnerId', 'obslog', 'revlog', 'evidenceRefs']) {
    assert.ok(!JSON.stringify(requests[0]).includes(forbidden), `provider payload excludes ${forbidden}`);
  }
  const version = first.aiReading.readingVersion;
  assert.equal(version.candidate.editorial.status, 'pending');
  assert.equal(version.candidate.automaticChecks.japaneseEditorialQuality, 'not-checked');
  assert.equal(version.candidate.automaticChecks.factualAccuracy, 'not-checked');
  assert.equal(version.candidate.article.lineage.generation.actualModel, 'reported-model-version');
  assert.equal(version.candidate.article.lineage.generation.requestedModel, 'requested-model-alias');
  assert.equal(version.candidate.article.body.text, first.aiReading.text);
  assert.deepEqual(first.aiReading.candidates.wordIds, ['犬', '猫']);
  assert.equal(await page.locator('.airead-status').textContent(), 'AI original · awaiting editorial review');
  results.push({ name: 'preferences-and-separate-kagami-bands-reach-provider-without-private-record', pass: true });
  results.push({ name: 'full-version-brief-and-reported-model-preserved-with-pending-editorial-state', pass: true });
  await page.screenshot({ path: resolve(out, 'desktop-reading.png'), fullPage: true });
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  const reloaded = await record();
  assert.deepEqual(reloaded.aiReading, first.aiReading);
  assert.deepEqual(reloaded.readingSettings, first.readingSettings);
  await page.locator('#airead-link').click();
  await page.locator('#airead-preferences').evaluate((element) => { element.open = true; });
  assert.equal(await page.locator('#airead-interests').inputValue(), '科学、歴史、自然');
  assert.equal(await page.locator('#airead-startingLevel').inputValue(), 'N2');
  results.push({ name: 'article-and-editable-preferences-survive-real-reload', pass: true });
  for (const rejected of ['truncated', 'authority', 'malformed', 'oversized']) {
    providerCase = rejected;
    await page.locator('#airead-make').click();
    await idle();
    const after = await record();
    assert.deepEqual(after.aiReading, first.aiReading);
    assert.deepEqual(after.aiReadings, first.aiReadings);
    preservedLearning(after);
    assert.ok((await page.locator('#airead-note').textContent()).length > 0);
    results.push({ name: `rejected-${rejected}-response-preserves-accepted-article-and-learning`, pass: true });
  }
  providerCase = 'hold';
  await page.locator('#airead-make').click();
  await page.waitForSelector('#airead-cancel');
  await page.waitForFunction(() => document.querySelector('#airead-make')?.disabled === true);
  const holdDeadline = Date.now() + 10000;
  while (!heldRoute && Date.now() < holdDeadline) await new Promise((done) => setTimeout(done, 10));
  assert.ok(heldRoute, 'the cancellable provider request reached the stub');
  await page.locator('#airead-cancel').click();
  assert.deepEqual((await record()).aiReading, first.aiReading);
  const cancelledRoute = heldRoute;
  heldRoute = null;
  providerCase = 'article';
  await page.locator('#airead-make').click();
  await idle();
  const replacement = await record();
  assert.notEqual(replacement.aiReading.readingVersion.candidate.article.versionId, version.candidate.article.versionId);
  await fulfill(cancelledRoute, JSON.stringify({ ...article(900), title: 'Cancelled old reply' })).catch(() => {});
  await page.waitForTimeout(100);
  assert.deepEqual((await record()).aiReading, replacement.aiReading);
  assert.equal(replacement.aiReadings.length, 1);
  assert.deepEqual(replacement.aiReadings[0], first.aiReading);
  preservedLearning(replacement);
  results.push({ name: 'cancelled-reply-cannot-replace-new-job-or-create-review-debt', pass: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(out, 'phone-reading.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'phone layout does not overflow');
  results.push({ name: 'phone-reader-and-preferences-fit-viewport', pass: true });
  const callsBeforeKeyRemoval = requests.length;
  await page.evaluate(() => localStorage.removeItem('kairo-ai-provider-v1'));
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  assert.equal(await page.locator('#airead-link').count(), 1, 'saved readings remain reachable without a provider key');
  await page.locator('#airead-link').click();
  assert.equal(await page.locator('#airead-make').isDisabled(), true);
  assert.equal(await page.locator('#airead-title').textContent(), replacement.aiReading.readingVersion.candidate.article.title);
  assert.equal(requests.length, callsBeforeKeyRemoval, 'reopening saved content makes no provider request');
  assert.deepEqual((await record()).aiReading, replacement.aiReading);
  results.push({ name: 'saved-reading-remains-accessible-without-provider-credentials', pass: true });
  const wordNearEnd = page.locator('.airead-hit[data-airead-hit="木"]').last();
  await wordNearEnd.scrollIntoViewIfNeeded();
  const readingY = await page.evaluate(() => window.scrollY);
  assert(readingY > 400, 'the lookup begins inside the long reading');
  await wordNearEnd.click();
  await page.locator('#sheet-close').waitFor();
  await page.locator('#sheet-close').click();
  await page.waitForFunction((expected) => Math.abs(window.scrollY - expected) < 3, readingY);
  assert.equal(await page.locator('#airead-title').textContent(), replacement.aiReading.readingVersion.candidate.article.title);
  results.push({ name: 'dictionary-walk-returns-to-the-same-place-in-personal-reading', pass: true });
  // A backup's legacy projection cannot silently diverge from the exact
  // candidate bytes/identity even when the rest of the JSON is well formed.
  const tampered = { ...replacement, aiReading: { ...replacement.aiReading, text: '差し替えられた文章。' } };
  const tamperedRaw = JSON.stringify(tampered);
  await page.evaluate((raw) => localStorage.setItem('kairo-corridor-v1', raw), tamperedRaw);
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.waitForSelector('#store-alert');
  assert.equal(await page.evaluate(() => localStorage.getItem('kairo-corridor-v1')), tamperedRaw);
  assert.match(await page.locator('#store-alert').textContent(), /invalid data|中身が読めない/u);
  results.push({ name: 'tampered-projection-is-quarantined-with-original-bytes-preserved', pass: true });
  assert.deepEqual(errors, []);
} catch (error) {
  results.push({ name: 'personal-reading-journey', pass: false, error: error.message });
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {});
  console.error(error.message);
} finally {
  if (heldRoute) await heldRoute.abort().catch(() => {});
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
const failures = results.filter((result) => !result.pass).length;
writeFileSync(resolve(out, 'receipt.json'), `${JSON.stringify({
  site: CORRIDOR_DIR,
  browser: { name: browserName, version: browserVersion, driverModule },
  corridorSha256: createHash('sha256').update(runtimeBytes).digest('hex'),
  counterfactualSource: process.env.KAIRO_PERSONAL_READING_SOURCE || null,
  controllerSha256: createHash('sha256').update(readFileSync(resolve(CORRIDOR_DIR, 'reading-controller.mjs'))).digest('hex'),
  results, failures, pageErrors: errors, providerCalls: requests.length, externalRequestsSent: 0,
  limitation: 'Synthetic provider and browser viewports; not factual/Japanese editorial, live provider, physical device or cross-device sync acceptance.',
}, null, 2)}\n`);
console.log(`Personal reading: ${results.length - failures}/${results.length} passed.`);
process.exitCode = failures || errors.length ? 1 : 0;
