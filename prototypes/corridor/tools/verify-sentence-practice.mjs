/** Ordinary source intake in fresh persistent browser profiles. All saved
 * records arise through visible controls. Native records are read as output;
 * the separate storage-failure phase is explicitly synthetic. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { armRecordWriteFailure, clearRecordWriteFailure, readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';

assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Supply an immutable staged KAIRO_SITE_DIR');
const SITE = resolveCorridorSite(), OUT = resolveCorridorEvidence();
assert(!existsSync(join(OUT, 'receipt.json')), 'Use a fresh evidence directory');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(join(SITE, 'build-identity.json')));
assert.equal(hash(JSON.stringify(manifest.files)), manifest.artifactSha256);
for (const file of manifest.files) assert.equal(hash(readFileSync(join(SITE, file.path))), file.sha256);
const verifierSha256 = hash(readFileSync(new URL(import.meta.url)));
const engines = process.env.KAIRO_BROWSER ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const sizes = process.env.KAIRO_SENTENCE_VIEWPORT === 'desktop' ? [1440] : [1440, 390];
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
let disconnected = false;
const certificate = join(OUT, 'synthetic-localhost-cert.pem'), privateKey = join(OUT, 'synthetic-localhost-key.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', privateKey, '-out', certificate,
  '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const server = createServer({ key: readFileSync(privateKey), cert: readFileSync(certificate) }, (request, response) => {
  if (disconnected) { request.socket.destroy(); return; }
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    assert(file.startsWith(`${SITE}/`) && statSync(file).isFile());
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
rmSync(privateKey); rmSync(certificate);
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const ORIGIN = `https://127.0.0.1:${server.address().port}`;
const TEXT = '今日は休みです。\n町の図書館で本を読みます。\n明日は友達と日本語を話します。🚀';
const SENTENCE = '町の図書館で本を読みます。';
const PRODUCTION = '  私の町には小さな図書館があります。\n e\u0301 🚀  ';
const results = [], startedAt = new Date().toISOString();
async function ready(page) {
  await page.waitForFunction(() => document.body?.dataset.ready === '1', null, { timeout: 30000 });
  assert.equal(await page.locator('#store-alert').isVisible(), false);
}
async function shelf(page) {
  if (await page.locator('body').getAttribute('data-view') === 'shelf') return;
  await page.locator('#ginga-symbol').focus(); await page.keyboard.press('Enter');
  await page.locator('.bubble-shelf').click();
}
async function lists(page) {
  if (!await page.locator('#tray').count()) await shelf(page);
  await page.locator('#tray').click();
}
async function selectTown(page) {
  const body = page.locator('#source-reader-body'); await page.evaluate(() => document.fonts.ready); await body.scrollIntoViewIfNeeded();
  const point = await body.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); let text;
    while ((text = walker.nextNode())) {
      const index = text.textContent.indexOf('町'); if (index < 0) continue;
      const range = document.createRange(); range.setStart(text, index); range.setEnd(text, index + 1);
      const r = range.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    throw new Error('The rendered source has no town');
  });
  await page.mouse.dblclick(point.x, point.y);
  await page.waitForFunction(() => !document.getElementById('source-sentence-practice')?.disabled);
  assert.equal(await page.evaluate(() => window.getSelection().toString()), '町');
}
function unchanged(before, after, keys = ['taken', 'srs', 'revlog', 'stats', 'lists']) {
  for (const key of keys) assert.deepEqual(after[key], before[key], `${key} remains unchanged`);
}
for (const engine of engines) for (const width of sizes) {
  const out = join(OUT, `${engine}-${width}`); mkdirSync(out, { recursive: true });
  const result = { engine, width, passed: false, observations: [], screenshots: [], videos: [], errors: [], externalRequests: [] };
  results.push(result); let context, page, episode = 0, profile = 'profile';
  const open = async () => {
    const videos = join(out, `video-${++episode}`); mkdirSync(videos, { recursive: true });
    context = await ({ chromium, webkit }[engine]).launchPersistentContext(join(out, profile), {
      headless: true, viewport: { width, height: width === 390 ? 844 : 1050 }, locale: 'en-US', serviceWorkers: 'allow',
      acceptDownloads: true, ignoreHTTPSErrors: true, ...(engine === 'chromium' ? { args: ['--ignore-certificate-errors'] } : {}),
      recordVideo: { dir: videos, size: { width, height: width === 390 ? 844 : 1050 } },
    });
    result.browserVersion = context.browser()?.version();
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url()); if (url.origin === ORIGIN) return route.continue();
      result.externalRequests.push({ origin: url.origin, pathname: url.pathname }); return route.abort();
    });
    page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => result.errors.push({ episode, message: error.message }));
  };
  const close = async () => {
    if (!context) return;
    const videos = context.pages().map((page) => page.video()); await context.close(); context = null;
    for (const video of videos) if (video) result.videos.push(await video.path());
  };
  const screenshot = async (name) => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      const finite = document.getAnimations().filter((animation) =>
        Number.isFinite(animation.effect?.getComputedTiming().endTime));
      await Promise.race([Promise.allSettled(finite.map((animation) => animation.finished)),
        new Promise((done) => setTimeout(done, 2000))]);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    const file = join(out, `${name}.png`); await page.screenshot({ path: file, fullPage: false });
    result.screenshots.push({ name, path: file, sha256: hash(readFileSync(file)) });
  };
  const openSaved = async () => {
    await lists(page); await page.locator('#sentence-practice-library summary').click();
    await page.locator('[data-sentence-practice-id]').first().click();
    await page.locator('#sentence-production-text').waitFor();
  };
  try {
    await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page); await shelf(page);
    result.observations.push({ frontDoor: 'Normal navigation activated by keyboard; source selection and practice through pointer/field controls', source: 'root-authored synthetic Japanese; no provider responses or injected learner state' });
    await page.locator('#source-inbox-link').click();
    const before = (await readAppRecordSnapshot(page)).record;
    await page.locator('#source-capture-title').fill('図書館での一日'); await page.locator('#source-capture-text').fill(TEXT);
    await page.locator('#source-capture-save').click(); await page.locator('#source-reader-body').waitFor();
    const captured = (await readAppRecordSnapshot(page)).record; unchanged(before, captured);
    await selectTown(page); await page.locator('#source-context-save').click();
    await waitForAppRecord(page, r => r.teacherContexts?.entries.length === 1);
    await page.locator('#source-sentence-practice').click(); await page.locator('#sentence-practice-confirm').waitFor();
    assert.equal(await page.locator('.sentence-original').textContent(), SENTENCE);
    assert.equal(await page.locator('.sentence-cloze-preview').textContent(), '［ … ］の図書館で本を読みます。');
    unchanged(captured, (await readAppRecordSnapshot(page)).record);
    await page.locator('#sentence-choose-production').check(); await screenshot('explicit-practice-choice');
    // A failed real native transaction cannot create half a plan or a recall card.
    await armRecordWriteFailure(page, 'quota', { roots: ['sentencePractice', 'taken'] });
    await page.locator('#sentence-practice-confirm').click(); await page.locator('#store-alert').waitFor({ state: 'visible' });
    const fault = await clearRecordWriteFailure(page); assert(fault.fired > 0);
    const failed = (await readAppRecordSnapshot(page)).record; unchanged(captured, failed); assert.equal(failed.sentencePractice, null);
    assert(await page.locator('#sentence-choose-production').isChecked()); await screenshot('failed-confirmation-keeps-choice');
    assert(await page.locator('#sentence-practice-confirm').isDisabled(), 'The existing native record failure requires a fresh document');
    await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page); await shelf(page);
    await page.locator('#source-inbox-link').click(); await page.locator('[data-source-capture]').first().click();
    await selectTown(page); await page.locator('#source-sentence-practice').click();
    const productionFirst = width === 390;
    if (productionFirst) { await page.locator('#sentence-choose-cloze').uncheck(); await page.locator('#sentence-choose-production').check(); }
    await page.locator('#sentence-practice-confirm').click();
    await page.locator(productionFirst ? '#sentence-production-text' : '#sentence-review-start').waitFor();
    const firstChoice = (await readAppRecordSnapshot(page)).record;
    assert.equal(firstChoice.sentencePractice.entries[0].plan.contracts.length, 1);
    assert.equal(firstChoice.taken.length, productionFirst ? 0 : 1);
    if (productionFirst) {
      await page.locator('#sentence-production-text').fill(PRODUCTION); await page.locator('#sentence-production-save').click();
      await waitForAppRecord(page, r => r.sentencePractice.responses.length === 1);
      const firstWritten = (await readAppRecordSnapshot(page)).record; unchanged(firstChoice, firstWritten);
      assert.equal(firstWritten.sentencePractice.responses[0].text, PRODUCTION);
      await screenshot('writing-before-recall-choice');
      await page.locator('#sentence-add-cloze').click(); await page.locator('#sentence-review-start').waitFor();
      const added = (await readAppRecordSnapshot(page)).record;
      unchanged(firstWritten, added, ['srs', 'revlog', 'stats', 'lists']);
      assert.deepEqual(added.sentencePractice.responses, firstWritten.sentencePractice.responses);
      assert.deepEqual(added.sentencePractice.entries[0].plan.capture, firstChoice.sentencePractice.entries[0].plan.capture);
      assert.deepEqual(added.sentencePractice.entries[0].plan.contracts[0], firstChoice.sentencePractice.entries[0].plan.contracts[0]);
    }
    const enrolled = (await readAppRecordSnapshot(page)).record, entry = enrolled.sentencePractice.entries[0], item = enrolled.taken[0];
    assert.equal(enrolled.sentencePractice.entries.length, 1); assert.equal(enrolled.taken.length, 1);
    assert.equal(item.t, 'sentence'); assert.equal(item.sourceContextRef, entry.context.id); assert.equal(entry.context.quote, SENTENCE);
    assert.deepEqual(entry.plan.contracts.map(c => c.skill), productionFirst ? ['meaning_to_production', 'discrimination'] : ['discrimination']);
    assert.equal(Object.keys(enrolled.srs).length, 0); assert.equal(enrolled.revlog.length, 0);
    await page.locator('#sentence-review-start').click(); await page.locator('#sentence-recall-answer').waitFor();
    assert.deepEqual(await page.evaluate(() => window.__KAIRO_SRS__.session()), { queue: 1, ix: 0, deferred: 0 });
    assert.equal(await page.locator('.sentence-recall-cue').textContent(), '［ … ］の図書館で本を読みます。');
    await page.locator('#sentence-recall-answer').fill('町'); await page.locator('#sentence-recall-check').click();
    await page.locator('.grade.g-easy').waitFor();
    const answered = (await readAppRecordSnapshot(page)).record; unchanged(enrolled, answered);
    assert.equal(answered.sentencePractice.responses.at(-1).text, '町'); assert.equal(answered.sentencePractice.grades.length, 0);
    await screenshot('literal-response-before-grade');
    await page.locator('#review-source-return').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#source-context-return').textContent(), SENTENCE);
    await screenshot('exact-source-and-review-return');
    await page.locator('#source-reader-back').click(); await page.locator('.grade.g-easy').waitFor();
    unchanged(answered, (await readAppRecordSnapshot(page)).record, ['taken', 'srs', 'revlog', 'stats', 'sentencePractice']);
    await page.locator('.grade.g-easy').click(); await page.locator('.review-summary').waitFor();
    const graded = (await readAppRecordSnapshot(page)).record;
    assert.equal(graded.revlog.length, 1); assert.equal(graded.srs[`sentence:${entry.plan.id}`].reps, 1);
    assert.equal(graded.sentencePractice.grades[0].observation.grade, 'easy'); await screenshot('finite-recall-complete');
    await page.locator('.review-undo').click(); await page.locator('#sentence-recall-answer').waitFor();
    assert.equal(await page.locator('#sentence-recall-answer').inputValue(), '');
    const undone = (await readAppRecordSnapshot(page)).record;
    assert.equal(Object.keys(undone.srs).length, 0); assert.equal(undone.revlog.length, 2); assert.equal(undone.revlog[1][2], 0);
    assert.equal(undone.sentencePractice.grades.length, 1);
    await page.locator('#sentence-recall-answer').fill('町'); await page.locator('#sentence-recall-reveal').click();
    await page.locator('.grade.g-again').waitFor(); assert.equal(await page.locator('.grade').count(), 1);
    await page.locator('.grade.g-again').click(); await page.locator('#zen-wait-skip').waitFor();
    const revealed = (await readAppRecordSnapshot(page)).record;
    assert.equal(revealed.sentencePractice.grades.at(-1).observation.grade, 'again');
    assert.equal(revealed.sentencePractice.grades.at(-1).observation.revealedBeforeRecall, true);
    await page.locator('#zen-wait-skip').click(); await page.locator('#sentence-recall-answer').fill('町');
    await page.locator('#sentence-recall-check').click(); await page.locator('.grade.g-easy').click();
    await page.locator('.review-summary').waitFor(); await page.locator('.close-doors .take').click();
    await page.locator('#sentence-practice-library summary').click(); await page.locator('[data-sentence-practice-id]').first().click();
    const beforeAddition = (await readAppRecordSnapshot(page)).record;
    if (!productionFirst) {
      await screenshot('recall-before-writing-choice');
      await page.locator('#sentence-add-production').click(); await page.locator('#sentence-production-text').waitFor();
      const added = (await readAppRecordSnapshot(page)).record; unchanged(beforeAddition, added);
      assert.deepEqual(added.sentencePractice.responses, beforeAddition.sentencePractice.responses);
      assert.deepEqual(added.sentencePractice.grades, beforeAddition.sentencePractice.grades);
      assert.deepEqual(added.sentencePractice.entries[0].plan.capture, entry.plan.capture);
      assert.deepEqual(added.sentencePractice.entries[0].plan.contracts[0], entry.plan.contracts[0]);
      assert.deepEqual(added.sentencePractice.entries[0].plan.confirmation, entry.plan.confirmation);
    }
    const beforeProduction = (await readAppRecordSnapshot(page)).record;
    assert.equal(beforeProduction.sentencePractice.entries.length, 1);
    assert.equal(beforeProduction.sentencePractice.entries[0].plan.contracts.length, 2);
    assert.deepEqual(beforeProduction.sentencePractice.entries[0].plan.confirmation, firstChoice.sentencePractice.entries[0].plan.confirmation);
    if (!productionFirst) {
      await page.locator('#sentence-production-text').fill(PRODUCTION);
      await page.locator('#sentence-production-save').click(); await waitForAppRecord(page, r => r.sentencePractice.responses.some(row => row.mode === 'production'));
    }
    const written = (await readAppRecordSnapshot(page)).record; unchanged(beforeProduction, written);
    const production = written.sentencePractice.responses.find(row => row.mode === 'production');
    assert.equal(production.text, PRODUCTION);
    assert.equal(production.observation.type, 'ProductionObserved');
    assert.equal(production.observation.tier, 'B');
    assert(!Object.hasOwn(production.observation, 'grade'));
    result.observations.push({ practiceOrder: productionFirst ? ['production', 'cloze'] : ['cloze', 'production'],
      preservedFirstContractAndHistory: true, recallCards: 1 });
    await screenshot('saved-production-and-history');
    await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page); await openSaved();
    assert.match(await page.locator('#sentence-practice-history').textContent(), /私の町には小さな図書館があります。/u);
    const restarted = (await readAppRecordSnapshot(page)).record;
    unchanged(written, restarted, ['taken', 'srs', 'revlog', 'sourceInbox', 'teacherContexts', 'sentencePractice']);
    await page.locator('#sentence-practice-back').click();
    const pendingDownload = page.waitForEvent('download'); await page.locator('#export-store').click();
    const download = await pendingDownload, backupPath = join(out, 'sentence-practice-backup.json'); await download.saveAs(backupPath);
    const backup = JSON.parse(readFileSync(backupPath)); assert.deepEqual(backup.record.sentencePractice, restarted.sentencePractice);
    await close(); profile = 'profile-restored'; await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
    await shelf(page); await lists(page);
    const timeOrigin = await page.evaluate(() => performance.timeOrigin); await page.locator('#import-file').setInputFiles(backupPath);
    await page.waitForFunction(old => performance.timeOrigin !== old && document.body?.dataset.ready === '1', timeOrigin, { timeout: 30000 });
    await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    if (engine === 'webkit') disconnected = true; else await context.setOffline(true);
    await page.reload(); await ready(page); await openSaved();
    await page.locator('.learning-source summary').click(); await page.locator('#learning-source-return').click();
    await page.locator('#source-context-return').waitFor(); assert.equal(await page.locator('#source-context-return').textContent(), SENTENCE);
    await page.locator('#source-reader-back').click(); await page.locator('#sentence-production-text').waitFor();
    const restored = (await readAppRecordSnapshot(page)).record;
    unchanged(restarted, restored, ['taken', 'srs', 'revlog', 'sourceInbox', 'teacherContexts', 'sentencePractice']);
    await screenshot('restored-offline-source-and-responses');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.equal(result.errors.length, 0); assert.equal(result.externalRequests.length, 0);
    result.passed = true; result.entryId = entry.plan.id; result.sourceContextRef = entry.context.id;
    result.counts = { responses: restored.sentencePractice.responses.length, grades: restored.sentencePractice.grades.length, reviewRows: restored.revlog.length };
    result.offline = engine === 'webkit' ? 'local HTTPS server disconnected with actual worker-controlled reload' : 'Chromium browser context offline with actual worker-controlled reload';
  } catch (error) {
    result.failure = error?.stack || String(error);
    try { if (page) await screenshot('failure'); } catch { /* Original failure retained. */ }
  } finally { disconnected = false; await close(); }
}
await new Promise(done => server.close(done));
const receipt = { version: 1, startedAt, finishedAt: new Date().toISOString(), artifactSha256: manifest.artifactSha256,
  sourceAssetSha256: manifest.sourceAssetSha256, site: SITE, verifierSha256,
  qualification: 'Headless scoped learner subjourneys on synthetic local text; real app persistence and worker offline. No live teaching, native UI, physical iPhone or complete learner acceptance.',
  passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ passed: receipt.passed, failed: receipt.failed, failures: results.filter(r => !r.passed).map(r => ({ engine: r.engine, width: r.width, failure: r.failure })), receipt: join(OUT, 'receipt.json') }, null, 2));
if (receipt.failed) process.exitCode = 1;
