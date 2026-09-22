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
const sizes = process.env.KAIRO_SOURCE_VIEWPORT === 'desktop' ? [1440] : [1440, 390];
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
const TEXT = '  今日は宇宙の本を読んだ。🚀\n\n雨がやんだので、歩いて出かけた。町の図書館に着くと、窓の近くに席があった。\nそこで友達と会い、次に読む本を選んだ。 e\u0301  ';
const ENCOUNTER_URL = 'https://example.org/learner-supplied-reading?t=73#paragraph-2';
const QUESTION = '  「着くと」は、この文章ではどんな意味ですか。🚀\n前の文とのつながりを確かめたい。  ';
const results = [], startedAt = new Date().toISOString();
function noReviewChange(before, after) {
  for (const key of ['taken', 'srs', 'revlog', 'stats', 'lists']) assert.deepEqual(after.record[key], before.record[key], `${key} remains unchanged by capture/lookup/context`);
}
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  assert.equal(await page.locator('#store-alert').isVisible(), false);
}
async function frontDoor(page) {
  await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
  if (await page.locator('body').getAttribute('data-view') !== 'shelf') {
    await page.locator('#ginga-symbol').click(); await page.locator('.bubble-shelf').click();
  }
  await page.locator('#source-inbox-link').click(); await page.locator('#source-capture-text').waitFor();
}
async function selectWord(page) {
  const body = page.locator('#source-reader-body'); await page.evaluate(() => document.fonts.ready); await body.scrollIntoViewIfNeeded();
  const point = await body.evaluate((node) => {
    const position = node.textContent.indexOf('町'), walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let text, offset = 0;
    while ((text = walker.nextNode())) {
      if (position < offset + text.length) {
        const range = document.createRange(); range.setStart(text, position - offset); range.setEnd(text, position - offset + 1);
        const rect = range.getBoundingClientRect(), box = node.getBoundingClientRect();
        return { x: rect.x - box.x + rect.width / 4, y: rect.y - box.y + rect.height / 2, start: position };
      }
      offset += text.length;
    }
    throw new Error('Word not present');
  });
  await body.dblclick({ position: { x: point.x, y: point.y } });
  await page.waitForFunction(() => window.getSelection()?.toString() === '町');
  await page.waitForFunction(() => document.querySelector('#source-context-save')?.disabled === false);
  return point.start;
}
for (const engine of engines) for (const width of sizes) {
  const name = `${engine}-${width}`, out = join(OUT, name); mkdirSync(out, { recursive: true });
  const result = { name, engine, width, passed: false, observations: [], screenshots: [], videos: [], errors: [], externalRequests: [] };
  results.push(result); let context, page, episode = 0;
  const open = async () => {
    const videos = join(out, `video-${++episode}`); mkdirSync(videos, { recursive: true });
    context = await ({ chromium, webkit }[engine]).launchPersistentContext(join(out, 'profile'), {
      headless: true, viewport: { width, height: width === 390 ? 844 : 1050 }, locale: 'en-US',
      serviceWorkers: 'allow', acceptDownloads: true, ignoreHTTPSErrors: true,
      ...(engine === 'chromium' ? { args: ['--ignore-certificate-errors'] } : {}), recordVideo: { dir: videos, size: { width, height: width === 390 ? 844 : 1050 } },
    });
    result.browserVersion = context.browser()?.version();
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === ORIGIN) return route.continue();
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
      await Promise.race([Promise.all(document.getAnimations().filter((animation) =>
        Number.isFinite(animation.effect?.getComputedTiming().endTime)).map((animation) => animation.finished.catch(() => undefined))),
      new Promise((done) => setTimeout(done, 2000))]);
    });
    const file = join(out, `${name}.png`); await page.screenshot({ path: file, fullPage: true });
    result.screenshots.push({ name, path: file, sha256: hash(readFileSync(file)) });
  };
  try {
    await open(); await frontDoor(page); const before = await readAppRecordSnapshot(page);
    await page.locator('#source-capture-title').fill('図書館で見つけた本');
    await page.locator('#source-capture-url').fill(ENCOUNTER_URL);
    await page.locator('#source-capture-text').fill(TEXT);
    await screenshot('draft-before-restart');
    await close(); await open(); await frontDoor(page);
    assert.equal(await page.locator('#source-capture-text').inputValue(), TEXT);
    assert.equal(await page.locator('#source-capture-url').inputValue(), ENCOUNTER_URL);
    const controls = await page.locator('#source-capture-form input, #source-capture-form textarea, #source-capture-form button').evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect(); return { id: node.id, x: rect.x, width: rect.width, height: rect.height, fontSize: parseFloat(getComputedStyle(node).fontSize) };
    }));
    for (const control of controls) {
      assert(control.height >= 44 && control.x >= 0 && control.x + control.width <= width + 1, `${control.id} touch bounds`);
      if (control.id !== 'source-capture-save') assert(control.fontSize >= 16, `${control.id} legible input size`);
    }
    result.observations.push({ captureControls: controls });
    await screenshot('draft-after-restart');
    await page.locator('#source-capture-save').click(); await page.locator('#source-reader-body').waitFor();
    assert.equal(await page.locator('#source-reader-body').textContent(), TEXT);
    assert.equal(await page.locator('#source-reader-original').getAttribute('href'), ENCOUNTER_URL);
    const captured = await readAppRecordSnapshot(page), source = captured.record.sourceInbox.entries[0];
    assert.equal(captured.record.sourceInbox.entries.length, 1); noReviewChange(before, captured);
    assert.equal(source.candidate.article.body.text, TEXT);
    assert.equal(source.candidate.article.lineage.kind, 'user-supplied');
    assert.equal(source.candidate.article.capabilities['ai-transform'].status, 'unknown');
    const start = await selectWord(page); await page.locator('#source-context-save').click();
    await waitForAppRecord(page, (record) => record.teacherContexts?.entries.length === 1);
    const neutral = await readAppRecordSnapshot(page), topic = neutral.record.teacherContexts.entries[0];
    assert.equal(neutral.record.teacherContexts.activeRef, null); noReviewChange(before, neutral);
    assert.equal(topic.sourceId, source.id); assert.equal(topic.sourceKind, 'personal-reading');
    assert.equal(topic.start, start); assert.equal(topic.quote, '町'); assert.equal(topic.url, ENCOUNTER_URL);
    assert.equal(topic.sourceDigest, hash(TEXT));
    await page.locator('#source-context-open').click(); await page.locator('#chat-input').fill(QUESTION);
    await waitForAppRecord(page, (record) => record.teacherDrafts?.entries.some((draft) => draft.contextRef === topic.id && draft.text === QUESTION));
    assert.equal(await page.locator('#chat-send').isDisabled(), true);
    await screenshot('saved-context');
    await page.locator('#teacher-source-return').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#source-reader-body').textContent(), TEXT);
    await page.waitForFunction(() => document.activeElement?.id === 'source-context-return');
    const anchorVisible = await page.locator('#source-context-return').evaluate((node) => {
      const rect = node.getBoundingClientRect(), header = document.querySelector('.chrome')?.getBoundingClientRect();
      return rect.top >= (header?.bottom || 0) && rect.bottom <= innerHeight;
    }); assert(anchorVisible, 'Source return focuses the exact span clear of the toolbar');
    await screenshot('exact-source-return');
    await selectWord(page); await page.locator('#source-selection-lookup').click();
    assert.equal(await page.locator('#nav-search-input').inputValue(), '町');
    await page.locator('.nav-search-row').first().click(); await page.locator('#sheet').waitFor();
    await page.waitForFunction(() => !document.querySelector('#sheet')?.textContent.includes('Opening complete senses and usage'));
    await screenshot('dictionary-from-capture');
    await page.locator('#sheet .teacher-discuss').click();
    await page.locator('#teacher-target-open').waitFor();
    const fromLookup = await readAppRecordSnapshot(page);
    const lookupTopic = fromLookup.record.teacherContexts.entries.find((entry) => entry.id === fromLookup.record.teacherContexts.activeRef);
    assert(lookupTopic.target); assert.equal(lookupTopic.sourceId, source.id); assert.equal(lookupTopic.quote, '町');
    result.observations.push({ dictionaryContext: lookupTopic });
    await page.locator('#teacher-source-return').click(); await page.locator('#source-reader-body').waitFor();
    await page.locator('#source-reader-finished').click();
    await waitForAppRecord(page, (record) => Object.hasOwn(record.readDone, `capture:${source.id}`));
    await page.locator('#source-reader-back').click();
    await page.locator('#source-capture-title').fill('あとで聴くリンク');
    await page.locator('#source-capture-url').fill('https://example.org/audio#t=93');
    assert.equal(await page.locator('#source-capture-text').inputValue(), '');
    await page.locator('#source-capture-save').click(); await page.locator('#source-reader-original').waitFor();
    assert.equal(await page.locator('#source-reader-body').count(), 0);
    assert.equal(await page.locator('#source-reader-original').getAttribute('href'), 'https://example.org/audio#t=93');
    await screenshot('saved-link');
    await page.locator('#source-reader-back').click();
    const saved = await readAppRecordSnapshot(page); assert.equal(saved.record.sourceInbox.entries.length, 2); noReviewChange(before, saved);
    await page.locator('#tray').click();
    const downloadWork = page.waitForEvent('download'); await page.locator('#export-store').click();
    const download = await downloadWork, backupFile = join(out, 'ordinary-ui-backup.json'); await download.saveAs(backupFile);
    const backup = JSON.parse(readFileSync(backupFile));
    assert.deepEqual(backup.record.sourceInbox, saved.record.sourceInbox);
    assert.deepEqual(backup.record.teacherContexts, saved.record.teacherContexts);
    result.observations.push({ source, topic, backupFile, backupSha256: hash(readFileSync(backupFile)), captureCreatesReviews: false });
    // Restore the unchanged app-generated backup using the normal import control.
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    await page.locator('#import-file').setInputFiles(backupFile);
    await page.waitForFunction((old) => performance.timeOrigin !== old && document.body.dataset.ready === '1', timeOrigin, { timeout: 30000 });
    await frontDoor(page);
    const restored = await readAppRecordSnapshot(page); assert.deepEqual(restored.record.sourceInbox, saved.record.sourceInbox);
    await page.locator(`[data-source-capture="${source.id}"]`).click(); await page.locator('#source-reader-body').waitFor();
    assert.equal(await page.locator('#source-reader-body').textContent(), TEXT);
    // Prove the new module is in the actual installed offline boot shell.
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    if (engine === 'webkit') disconnected = true; else await context.setOffline(true);
    await page.reload(); await ready(page);
    if (await page.locator('body').getAttribute('data-view') !== 'shelf') {
      await page.locator('#ginga-symbol').click(); await page.locator('.bubble-shelf').click();
    }
    await page.locator('#source-inbox-link').click();
    await page.locator(`[data-source-capture="${source.id}"]`).click(); await page.locator('#source-reader-body').waitFor();
    assert.equal(await page.locator('#source-reader-body').textContent(), TEXT);
    await screenshot('offline-source-reopened');
    disconnected = false; await context.setOffline(false);
    await close(); await open(); await frontDoor(page);
    const restarted = await readAppRecordSnapshot(page);
    assert.deepEqual(restarted.record.sourceInbox, saved.record.sourceInbox); noReviewChange(before, restarted);
    assert.equal(restarted.record.teacherDrafts.entries.find((draft) => draft.contextRef === topic.id).text, QUESTION);
    await screenshot('inbox-after-final-restart');
    result.observations.push({ ordinaryFlow: 'front door → unfinished input → clean restart → save/read → neutral context → saved question → exact return → dictionary → finish → link → backup/restore → offline boot → clean restart',
      inputMethod: 'Playwright fill on visible native form fields; no record seeding or reducer injection',
      offlineMode: engine === 'webkit' ? 'explicit server-disconnected simulation with actual installed service worker' : 'browser context offline with actual installed service worker',
      fullLearnerJourneyAccepted: false, liveTeacherClaim: false });
    // A separate, explicitly synthetic provider configuration and button fault
    // ensure the refusal is enforced beyond the absent-key/disabled-UI state.
    await page.locator(`[data-source-capture="${source.id}"]`).click(); await selectWord(page);
    await page.locator('#source-context-open').click(); await page.locator('#chat-input').waitFor();
    await page.locator('#ai-base-url').fill('https://source-capture.synthetic.invalid');
    await page.locator('#ai-model-input').fill('synthetic-capture-policy-check');
    await page.locator('#ai-key-input').fill('synthetic-fixture-not-a-real-credential');
    await page.locator('#ai-key-save').click();
    await page.waitForFunction(() => document.querySelector('#ai-key-save')?.disabled === false);
    assert.equal(await page.locator('#chat-send').isDisabled(), true);
    const beforeSendFault = await readAppRecordSnapshot(page);
    await page.locator('#chat-send').evaluate((button) => { button.disabled = false; });
    await page.locator('#chat-send').click();
    await page.waitForFunction(() => document.querySelector('#chat-send')?.disabled === true &&
      !document.querySelector('.chat-turn.thinking') && document.querySelector('#teacher-source-approval')?.dataset.state === 'approval-required' &&
      document.querySelector('#chat-status')?.textContent.includes('Approve this source above'));
    const afterSendFault = await readAppRecordSnapshot(page);
    assert.deepEqual(afterSendFault.archive, beforeSendFault.archive);
    assert.deepEqual(afterSendFault.record.aiChat, beforeSendFault.record.aiChat);
    assert.equal(await page.locator('#chat-input').inputValue(), QUESTION);
    assert.deepEqual(result.externalRequests, []);
    result.observations.push({ syntheticFault: 'explicit fake provider settings plus deliberate disabled-button tampering',
      sourceTextEgress: false, archiveUnchanged: true, questionPreserved: true });
    await page.locator('#teacher-source-return').click(); await page.locator('#source-reader-back').click();
    // Fault-only phase, after the ordinary flow and recording observations.
    await page.locator('#source-capture-text').fill('保存に失敗しても、この文章を残す。');
    const preFault = await readAppRecordSnapshot(page);
    await armRecordWriteFailure(page, 'quota', { roots: ['sourceInbox'] });
    await page.locator('#source-capture-save').click();
    await page.waitForFunction(() => document.querySelector('#source-capture-status')?.textContent.includes('has not been saved'));
    assert.equal(await page.locator('#source-capture-text').inputValue(), '保存に失敗しても、この文章を残す。');
    const postFault = await readAppRecordSnapshot(page); assert.deepEqual(postFault.record.sourceInbox, preFault.record.sourceInbox);
    await clearRecordWriteFailure(page); await screenshot('synthetic-quota-failure');
    result.observations.push({ syntheticFault: 'native record transaction quota failure', sourceLibraryUnchanged: true, unsavedInputPreserved: true });
    assert.deepEqual(result.externalRequests, []); assert.deepEqual(result.errors, []);
    result.passed = true;
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack };
    try { await screenshot('failure'); result.visibleFailure = await page.locator('body').innerText(); } catch { /* Preserve original error. */ }
  } finally { disconnected = false; await close(); }
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2));
  process.stdout.write(`${name}: ${result.passed ? 'passed' : result.failure.message}\n`);
}
await new Promise((done) => server.close(done));
assert.equal(hash(readFileSync(new URL(import.meta.url))), verifierSha256, 'Verifier changed while running');
const receipt = { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), site: SITE,
  artifactSha256: manifest.artifactSha256, verifierSha256, results, passed: results.filter((result) => result.passed).length,
  total: results.length, scope: 'Source-intake subjourneys; no full-product, live-service, OS clipboard, native-device or operator-trial acceptance' };
writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2));
if (receipt.passed !== receipt.total) process.exitCode = 1;
