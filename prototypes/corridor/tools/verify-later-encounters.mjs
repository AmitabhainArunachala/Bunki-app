/** Ordinary reading choices, new-source practice and changed follow-up. Can
 * continue preserved real test profiles; no injected state, provider replies,
 * fake clock or forced scheduler transition. Scoped technical evidence only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';
assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Supply an immutable staged site');
const SITE = resolveCorridorSite(), OUT = resolveCorridorEvidence();
assert(!existsSync(join(OUT, 'receipt.json')), 'Use a fresh evidence directory');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const verifierSha256 = hash(readFileSync(new URL(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(SITE, 'build-identity.json')));
assert.equal(hash(JSON.stringify(manifest.files)), manifest.artifactSha256);
for (const file of manifest.files) assert.equal(hash(readFileSync(join(SITE, file.path))), file.sha256);
const engines = process.env.KAIRO_BROWSER ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every(engine => ['chromium', 'webkit'].includes(engine)));
const sizes = process.env.KAIRO_LATER_VIEWPORT === 'phone' ? [390] : [1440, 390];
const priorRoot = process.env.KAIRO_LATER_PRIOR_ROOT || null;
const priorOrigin = process.env.KAIRO_LATER_PRIOR_ORIGIN || null;
assert(!!priorRoot === !!priorOrigin);
if (priorRoot) assert(isAbsolute(priorRoot) && /^https:\/\/127\.0\.0\.1:\d+$/u.test(priorOrigin));
const key = join(OUT, 'synthetic-localhost-key.pem'), certificate = join(OUT, 'synthetic-localhost-cert.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', certificate,
  '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.m4a': 'audio/mp4' };
let disconnected = false;
const server = createServer({ key: readFileSync(key), cert: readFileSync(certificate) }, (request, response) => {
  if (disconnected) { request.socket.destroy(); return; }
  const path = new URL(request.url, 'https://127.0.0.1').pathname;
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    assert(file.startsWith(`${SITE}/`) && statSync(file).isFile());
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
rmSync(key); rmSync(certificate);
await new Promise((done, fail) => { server.once('error', fail); server.listen(priorOrigin ? Number(new URL(priorOrigin).port) : 0, '127.0.0.1', done); });
const ORIGIN = `https://127.0.0.1:${server.address().port}`;
const results = [], startedAt = new Date().toISOString();
const stableRoots = ['sentencePractice', 'teacherContexts', 'teacherDrafts', 'taken', 'srs', 'revlog', 'stats'];
function unchanged(before, after, keys = stableRoots) { for (const key of keys) assert.deepEqual(after[key], before[key], key); }
function exportMetadataOnly(before, after, earliest, latest) {
  const timestamp = after.record.stats.lastExportTs;
  assert(Number.isSafeInteger(timestamp) && timestamp >= earliest && timestamp <= latest,
    'The export timestamp must belong to the observed ordinary export');
  assert(timestamp > (before.record.stats.lastExportTs || 0), 'Export advances its own reminder');
  assert.deepEqual(after.record, { ...before.record, stats: { ...before.record.stats, lastExportTs: timestamp } },
    'Export changes only its timestamp, preserving every other record root and statistic');
  assert.deepEqual(after.archive, before.archive);
  assert.deepEqual(after.installation, before.installation);
  assert.equal(after.revision, before.revision + 1);
  const rowKey = row => JSON.stringify([row.accountId, row.learnerId, row.kind, row.id]);
  const oldRows = new Map(before.rows.map(row => [rowKey(row), row]));
  const newRows = new Map(after.rows.map(row => [rowKey(row), row]));
  for (const [key, row] of oldRows) {
    if (row.kind === 'profile' || (row.kind === 'document' && JSON.parse(row.text).collection === 'learner-record')) continue;
    assert.deepEqual(newRows.get(key), row, 'Export preserves the existing archive and replication history');
  }
  const added = after.rows.filter(row => !oldRows.has(rowKey(row)));
  assert.equal(added.length, 2, 'One local export command and its empty-operation receipt');
  const command = JSON.parse(added.find(row => row.kind === 'document')?.text || 'null');
  assert.equal(command?.collection, 'kairo:record-host-commands');
  assert.equal(command.value.type, 'app.patch/1');
  assert.equal(command.value.beforeRevision, before.revision);
  assert.equal(command.value.committedRevision, after.revision);
  const receipt = JSON.parse(added.find(row => row.kind === 'receipt')?.text || 'null');
  assert.deepEqual(receipt?.operations, []);
  assert.equal(receipt.revision, after.revision);
}
async function ready(page) {
  await page.waitForFunction(() => document.body?.dataset.ready === '1', null, { timeout: 30000 });
  assert.equal(await page.locator('#store-alert').isVisible(), false);
}
async function shelf(page) {
  for (let step = 0; step < 12; step++) {
    const view = await page.locator('body').getAttribute('data-view'); if (view === 'shelf') return;
    if (view === 'drift') {
      await page.locator('#ginga-symbol').focus(); await page.keyboard.press('Enter'); await page.locator('.bubble-shelf').click();
    } else await page.locator('#back').click();
    await page.waitForFunction(previous => document.body.dataset.view !== previous, view);
  }
  assert.fail('Back did not reach the bookshelf');
}
for (const engine of engines) for (const width of sizes) {
  const out = join(OUT, `${engine}-${width}`); mkdirSync(out, { recursive: true });
  const result = { engine, width, passed: false, errors: [], externalRequests: [], screenshots: [], videos: [], observations: [] };
  results.push(result); let context, page, episode = 0, profile = 'profile', currentRuntime = false;
  if (priorRoot) cpSync(join(priorRoot, `${engine}-${width}`, 'profile'), join(out, profile), { recursive: true, errorOnExist: true });
  const open = async () => {
    const videoDir = join(out, `video-${++episode}`); mkdirSync(videoDir, { recursive: true });
    context = await ({ chromium, webkit }[engine]).launchPersistentContext(join(out, profile), {
      headless: true, viewport: { width, height: width === 390 ? 844 : 1050 }, locale: 'en-US', serviceWorkers: 'allow',
      acceptDownloads: true, ignoreHTTPSErrors: true, ...(engine === 'chromium' ? { args: ['--ignore-certificate-errors'] } : {}),
      recordVideo: { dir: videoDir, size: { width, height: width === 390 ? 844 : 1050 } },
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url()); if (url.origin === ORIGIN) return route.continue();
      result.externalRequests.push({ origin: url.origin, path: url.pathname }); return route.abort();
    });
    page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => result.errors.push({ episode, message: error.message }));
    const loadedAssets = [];
    page.on('response', response => {
      const path = new URL(response.url()).pathname.slice(1);
      if (['corridor.js', 'sentence-practice.mjs', 'corridor.css'].includes(path))
        loadedAssets.push(response.body().then(bytes => ({ path, sha256: hash(bytes),
          fromServiceWorker: response.fromServiceWorker(), matchesCandidate: hash(bytes) === manifest.files.find(file => file.path === path)?.sha256 })));
    });
    await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
    const assets = await Promise.all(loadedAssets);
    currentRuntime = assets.length === 3 && assets.every(asset => asset.matchesCandidate);
    result.observations.push({ name: 'loaded-runtime-assets', episode, assets });
    console.log(JSON.stringify({ engine, width, episode, assets }));
    if (episode > 1 || !priorRoot) assert(currentRuntime, 'Every candidate episode must execute the identified script, module and style bytes');
  };
  const close = async () => {
    if (!context) return;
    const pages = context.pages(), videos = pages.map(p => p.video());
    const keeper = await context.newPage();
    await keeper.goto('about:blank');
    await Promise.all(pages.map(p => p.close()));
    // Close the app windows before stopping the browser process, so its real
    // waiting worker can activate. Context shutdown alone kills that work.
    await delay(1000);
    if (engine === 'chromium') {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const activated = await Promise.all(context.serviceWorkers().map(worker => worker.evaluate(() =>
          self.registration.active?.state === 'activated' && !self.registration.waiting).catch(() => false)));
        if (activated.length && activated.every(Boolean)) break;
        await delay(100);
      }
      const workers = await Promise.all(context.serviceWorkers().map(worker => worker.evaluate(async () => ({
        assetVersion: self.KAIRO_ASSET_VERSION, active: self.registration.active?.state, waiting: self.registration.waiting?.state,
        clients: (await self.clients.matchAll({ includeUncontrolled: true })).map(client => ({ url: client.url, type: client.type })),
      })).catch(error => ({ error: error.message }))));
      result.observations.push({ name: 'workers-after-app-window-close', episode, workers });
      console.log(JSON.stringify({ engine, width, episode, workers }));
    }
    const keeperVideo = keeper.video();
    await context.close(); context = null;
    if (keeperVideo) result.videos.push(await keeperVideo.path());
    for (const video of videos) if (video) result.videos.push(await video.path());
  };
  const snapshot = async name => {
    const data = await readAppRecordSnapshot(page); writeFileSync(join(out, `${name}.json`), JSON.stringify(data, null, 2) + '\n'); return data.record;
  };
  const shot = async name => {
    if (name === 'foreign-learner-backup-refused')
      await page.locator('#record-portability-status').scrollIntoViewIfNeeded();
    else if (await page.locator('#sentence-reading-suggestions').count())
      await page.locator('#sentence-reading-suggestions').scrollIntoViewIfNeeded();
    await page.evaluate(async () => { await document.fonts.ready;
      await Promise.race([Promise.allSettled(document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished)),
        new Promise(done => setTimeout(done, 2000))]); await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
    const path = join(out, `${name}.png`); await page.screenshot({ path }); result.screenshots.push({ name, path, sha256: hash(readFileSync(path)) });
  };
  const suggestion = kind => page.locator(`[data-reading-recommendation-kind="${kind}"]`);
  const openSaved = async id => {
    await shelf(page); await page.locator('#tray').click(); await page.locator('#sentence-practice-library summary').click();
    await page.locator(`[data-sentence-practice-id="${id}"]`).click(); await page.locator('#sentence-production-text, #sentence-add-production').waitFor();
  };
  const atToken = async (index, title) => {
    await page.waitForFunction(index => document.body.dataset.view === 'reader' &&
      document.activeElement?.matches(`#reader .tok[data-index="${index}"]`), index);
    assert.equal(await page.locator('h1.view-title').textContent(), title);
  };
  try {
    await open(); let initial = await snapshot('initial');
    if (priorRoot) {
      const prior = JSON.parse(readFileSync(join(priorRoot, `${engine}-${width}`, 'restarted.json')));
      const actual = await readAppRecordSnapshot(page);
      assert.equal(actual.installation.binding.learnerId, prior.installation.binding.learnerId);
      const priorBackup = JSON.parse(readFileSync(join(priorRoot, `${engine}-${width}`, 'bundled-listening-backup.json')));
      const priorReceipt = JSON.parse(readFileSync(join(priorRoot, 'receipt.json')));
      assert.deepEqual(priorBackup.record, prior.record, 'R30 exported the exact pre-export snapshot');
      exportMetadataOnly(prior, actual, Date.parse(priorReceipt.startedAt), Date.parse(priorReceipt.finishedAt));
      result.prior = { directory: priorRoot, learnerId: actual.installation.binding.learnerId,
        ordinaryExportTimestamp: actual.record.stats.lastExportTs, allOtherRecordRootsUnchanged: true };
      await shelf(page);
      // Existing windows retain their service-worker generation. Let the real
      // update install, then close/reopen normally if the old UI is still live.
      if (!currentRuntime) {
        const deadline = Date.now() + 30000;
        let installed = false;
        while (Date.now() < deadline) {
          installed = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state === 'installed');
          if (installed) break;
          await delay(100);
        }
        assert(installed, 'The actual candidate worker must finish installing before closing the old app');
        await close(); await open(); await shelf(page);
        unchanged(initial, await snapshot('after-ordinary-update-restart'));
      }
      assert(currentRuntime, 'The retained profile must execute the exact R31 script, module and style bytes');
    } else {
      assert.equal(initial.taken.length, 0); await shelf(page);
      await page.locator('#airead-link').click(); await page.locator('#airead-startingLevel').selectOption('N5');
      await waitForAppRecord(page, r => r.readingSettings?.startingLevel === 'N5'); await page.locator('#back').click();
      const item = page.locator('.shelf-item:not([data-recommendation])').filter({ has: page.locator('.shelf-title', { hasText: /^静かな朝$/u }) });
      await item.locator('.shelf-open').click(); await page.locator('#reader .tok[data-index="9"][data-word="窓"]').click();
      await page.locator('#reader-sentence-practice').click(); await page.locator('#sentence-choose-production').check();
      await page.locator('#sentence-practice-confirm').click(); await page.locator('#sentence-production-text').waitFor();
      await page.locator('#sentence-production-text').fill('  私の部屋の窓を開けます。\n e\u0301 🚀  ');
      await page.locator('#sentence-production-save').click(); await waitForAppRecord(page, r => r.sentencePractice.responses.length === 1);
      await page.locator('#sentence-review-start').click(); await page.locator('#sentence-recall-answer').fill('窓');
      await page.locator('#sentence-recall-check').click(); await page.locator('.grade.g-easy').click();
      await page.locator('.review-summary').waitFor(); await page.locator('.close-doors .take').click();
      initial = await snapshot('first-source-actual-recall'); await shelf(page);
    }
    const first = initial.sentencePractice.entries.find(entry => entry.context.sourceId === 'bunki-graded-n5-morning');
    assert(first); const original = structuredClone(first), firstGrades = initial.sentencePractice.grades.length;
    await suggestion('new-context').waitFor(); assert.match(await page.locator('.sentence-reading-choice').innerText(), /駅で待つ時間/u);
    await shot('next-reading-from-acknowledged-practice');
    const shelfId = await suggestion('new-context').getAttribute('id'); await suggestion('new-context').click();
    await atToken(120, '駅で待つ時間'); unchanged(initial, await snapshot('next-reading-opened'));
    await page.locator('#reader-source-back').click(); await page.waitForFunction(id => document.activeElement?.id === id, shelfId);
    await openSaved(first.plan.id);
    const draft = '  A later draft stays here.\n e\u0301 🚀  ';
    await page.locator('#sentence-production-text').fill(draft); await suggestion('new-context').click();
    await atToken(120, '駅で待つ時間'); await page.locator('#reader-source-back').click();
    assert.equal(await page.locator('#sentence-production-text').inputValue(), draft);
    await suggestion('new-context').click(); await atToken(120, '駅で待つ時間');
    await page.locator('#reader-sentence-practice').click(); await page.locator('#sentence-practice-confirm').waitFor();
    unchanged(initial, await snapshot('later-choice-neutral')); await page.locator('#sentence-practice-confirm').click();
    await page.locator('#sentence-review-start').waitFor();
    const enrolled = await snapshot('later-explicit-practice');
    const second = enrolled.sentencePractice.entries.find(entry => entry.context.sourceId === 'bunki-graded-n5-station');
    assert(second); assert.equal(enrolled.sentencePractice.entries.length, initial.sentencePractice.entries.length + 1);
    assert.deepEqual(enrolled.sentencePractice.entries.find(entry => entry.plan.id === first.plan.id), original);
    assert.deepEqual(second.plan.confirmation, first.plan.confirmation);
    await page.locator('#sentence-review-start').click(); await page.locator('#sentence-recall-answer').fill('戸');
    await page.locator('#sentence-recall-check').click(); await page.locator('.grade.g-again').click();
    await page.locator('#zen-wait-skip').waitFor();
    const beforeUndo = await snapshot('later-difficulty-before-undo');
    await page.locator('.review-undo').click();
    await waitForAppRecord(page, record => record.revlog.length === beforeUndo.revlog.length + 1 && record.revlog.at(-1)[2] === 0,
      { description: 'acknowledged grade undo' });
    await page.locator('#sentence-recall-answer').waitFor();
    const undone = await snapshot('later-difficulty-undone');
    assert.deepEqual(undone.srs, enrolled.srs);
    assert.deepEqual(undone.sentencePractice.grades, beforeUndo.sentencePractice.grades);
    assert.equal(undone.revlog.at(-1)[2], 0);
    assert.equal(undone.revlog.at(-1)[3], beforeUndo.sentencePractice.grades.at(-1).revlogIndex);
    await page.locator('#zen-exit').click(); await shelf(page);
    await page.waitForFunction(() => {
      const status = document.getElementById('sentence-reading-status');
      return status && !status.textContent.includes('Finding a reading');
    });
    assert.equal(await suggestion('revisit').count(), 0, 'An undone grade must not request remedial reading');
    await openSaved(second.plan.id); await page.locator('#sentence-review-start').click();
    await page.locator('#sentence-recall-answer').fill('戸'); await page.locator('#sentence-recall-check').click();
    await page.locator('.grade.g-again').click(); await page.locator('#zen-wait-skip').waitFor();
    const difficult = await snapshot('later-recall-needed-another-try');
    assert.equal(difficult.sentencePractice.grades.length, firstGrades + 2);
    assert.equal(difficult.sentencePractice.grades.at(-1).observation.grade, 'again');
    await page.locator('#zen-exit').click(); await shelf(page); await suggestion('revisit').waitFor();
    assert.match(await page.locator('.sentence-reading-reason').innerText(), /needed another try/u);
    await shot('follow-up-changed-after-later-difficulty');
    await suggestion('revisit').click(); await atToken(120, '駅で待つ時間');
    await page.locator('#reader-place-save').click();
    await page.waitForFunction(() => document.getElementById('reader-place-note')?.textContent.includes('is saved'));
    await page.locator('.read-done button').click(); await waitForAppRecord(page, r => Object.hasOwn(r.readDone, second.context.sourceId));
    await page.locator('#reader-source-back').click(); await suggestion('revisit').waitFor();
    unchanged(difficult, await snapshot('source-consumption-without-recall-change'));
    // A copy of this closed, ordinarily evolved installation is a rollback
    // recovery point, not a separately enrolled device. It already contains
    // this actor's reading.resume operation; restore must not allocate it.
    const recoveryBaseline = await readAppRecordSnapshot(page);
    assert.equal(recoveryBaseline.rows.filter(row => row.kind === 'operation').length, 1, 'The real reading-place save has authored one journal operation');
    await close();
    cpSync(join(out, profile), join(out, 'profile-recovery-point'), { recursive: true, errorOnExist: true, force: false });
    await open(); await shelf(page); await suggestion('revisit').waitFor();
    assert.deepEqual((await readAppRecordSnapshot(page)).record, recoveryBaseline.record);
    await page.locator('#sentence-reading-preferences').click(); await page.locator('#airead-startingLevel').selectOption('N3');
    await waitForAppRecord(page, r => r.readingSettings?.startingLevel === 'N3'); await page.locator('#back').click();
    await suggestion('revisit').waitFor();
    result.observations.push({ name: 'preference-is-not-assessed-success', requestedStartingLevel: 'N3', followUpStillNeedsSupport: true });
    const due = Date.parse(difficult.srs[`sentence:${second.plan.id}`].due), wait = Math.max(0, due - Date.now() + 150);
    assert(wait <= 70000, `Unexpected real review wait ${wait}`);
    result.observations.push({ name: 'real-fsrs-due-wait', milliseconds: wait });
    if (wait) await delay(wait);
    await openSaved(second.plan.id); await page.locator('#sentence-review-start').click();
    await page.locator('#sentence-recall-answer').fill('窓'); await page.locator('#sentence-recall-check').click();
    await page.locator('.grade.g-good').click();
    await waitForAppRecord(page, record => record.sentencePractice.grades.at(-1).observation.grade === 'good');
    const corrected = await snapshot('later-successful-recall'); assert.equal(corrected.sentencePractice.grades.at(-1).observation.grade, 'good');
    if (await page.locator('.review-summary').count()) await page.locator('.close-doors .take').click();
    else await page.locator('#zen-exit').click();
    await shelf(page); await suggestion('new-context').waitFor();
    assert.match(await page.locator('.sentence-reading-choice').innerText(), /Authored for N3/u);
    await shot('next-reading-after-correction-and-preference');
    result.nextReading = await page.locator('.sentence-reading-choice h3').textContent();
    const nextId = await suggestion('new-context').getAttribute('data-reading-recommendation-id');
    await suggestion('new-context').click(); await page.locator('#reader-source-back').waitFor();
    await page.locator('#reader-source-back').click(); unchanged(corrected, await snapshot('third-context-neutral'));
    await close(); await open(); await shelf(page); await suggestion('new-context').waitFor();
    assert.equal(await suggestion('new-context').getAttribute('data-reading-recommendation-id'), nextId);
    unchanged(corrected, await snapshot('restarted'));
    await page.locator('#tray').click();
    const beforeExport = await readAppRecordSnapshot(page), exportStarted = Date.now();
    const pending = page.waitForEvent('download'); await page.locator('#export-store').click();
    const backup = join(out, 'later-encounters-backup.json'); await (await pending).saveAs(backup);
    assert.deepEqual(JSON.parse(readFileSync(backup)).record, beforeExport.record);
    await waitForAppRecord(page, record => record.stats.lastExportTs >= exportStarted);
    const afterExport = await readAppRecordSnapshot(page);
    exportMetadataOnly(beforeExport, afterExport, exportStarted, Date.now());
    await close(); await open();
    assert.deepEqual((await readAppRecordSnapshot(page)).record, afterExport.record, 'Committed export metadata survives restart');
    await close(); profile = 'profile-foreign'; await open(); await shelf(page); await page.locator('#tray').click();
    const foreignBefore = await readAppRecordSnapshot(page);
    assert.notEqual(foreignBefore.installation.binding.learnerId, beforeExport.installation.binding.learnerId);
    await page.locator('#import-file').setInputFiles(backup);
    await page.waitForFunction(() => document.getElementById('record-portability-status')?.textContent.includes('belongs to a different learner'));
    assert.deepEqual(await readAppRecordSnapshot(page), foreignBefore, 'Foreign backup refusal preserves the entire installation and record');
    await shot('foreign-learner-backup-refused');
    result.observations.push({ name: 'foreign-learner-backup-refused', allRecordAndAuthorityRootsUnchanged: true });
    await close(); profile = 'profile-recovery-point'; await open(); await shelf(page); await suggestion('revisit').waitFor();
    assert.deepEqual((await readAppRecordSnapshot(page)).record, recoveryBaseline.record);
    await page.locator('#tray').click();
    const originTime = await page.evaluate(() => performance.timeOrigin); await page.locator('#import-file').setInputFiles(backup);
    await page.waitForFunction(prior => performance.timeOrigin !== prior && document.body.dataset.ready === '1', originTime, { timeout: 30000 });
    const restored = await readAppRecordSnapshot(page);
    // Import preserves null/omitted draft roots when neither side has drafts.
    // Every learner root remains part of the exact whole-record comparison.
    const expectedRestored = { ...beforeExport.record };
    assert.deepEqual(restored.record, expectedRestored, 'Restore recovers every portable root, including absent draft libraries');
    assert.deepEqual(restored.archive, beforeExport.archive);
    assert.deepEqual(restored.installation, recoveryBaseline.installation, 'Restore cannot grant or replace installation authority');
    assert.deepEqual(restored.rows.filter(row => row.kind === 'operation'), recoveryBaseline.rows.filter(row => row.kind === 'operation'));
    result.observations.push({ name: 'same-installation-rollback-recovery', earlierRevision: recoveryBaseline.revision,
      recoveredGrade: restored.record.sentencePractice.grades.at(-1).observation.grade,
      earlierGrade: recoveryBaseline.record.sentencePractice.grades.at(-1).observation.grade,
      earlierPreference: recoveryBaseline.record.readingSettings.startingLevel, recoveredPreference: restored.record.readingSettings.startingLevel,
      authorityUnchanged: true, existingJournalRetainedOnce: true,
      canonicalEmptyTeacherDraftRoot: beforeExport.record.teacherDrafts === null, freshDeviceRecovery: 'not exercised' });
    await shelf(page); await suggestion('new-context').waitFor();
    assert.equal(await suggestion('new-context').getAttribute('data-reading-recommendation-id'), nextId);
    await suggestion('new-context').click(); await page.locator('#reader-source-back').click();
    await close(); await open(); await shelf(page); await suggestion('new-context').waitFor();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    if (engine === 'webkit') disconnected = true; else await context.setOffline(true);
    await page.reload(); await ready(page); await shelf(page); await suggestion('new-context').waitFor();
    assert.equal(await suggestion('new-context').getAttribute('data-reading-recommendation-id'), nextId);
    await suggestion('new-context').click(); await page.locator('#reader-source-back').waitFor(); await shot('offline-later-source-and-caller');
    await page.locator('#reader-source-back').click();
    assert.deepEqual(await snapshot('restored-offline'), expectedRestored);
    assert.deepEqual(result.errors, []); assert.deepEqual(result.externalRequests, []);
    result.passed = true; result.observations.push({ name: 'later-context-and-feedback', sourceIds: [first.context.sourceId, second.context.sourceId],
      unchangedOriginal: true, explicitSecondPractice: true, rootAuthoredWrongThenCorrectRecall: true, restartAndLocalRestoreOffline: true,
      noSchedulerOverride: true, noAssessedLevelChange: true, unfinishedFullJourney: true });
  } catch (error) {
    result.failure = error.stack;
    if (page) {
      result.failureState = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return { view: document.body.dataset.view, suggestionCount: document.querySelectorAll('#sentence-reading-suggestions').length,
          suggestionStatus: document.querySelector('#sentence-reading-status')?.textContent,
          serviceWorker: { active: registration?.active?.state, waiting: registration?.waiting?.state }, caches: await caches.keys() };
      }).catch(() => null);
      await shot('failure').catch(() => {});
      await snapshot('failure-record').catch(() => {});
    }
  }
  finally { disconnected = false; await close(); }
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ engine, width, passed: result.passed, failure: result.failure }));
}
await new Promise(done => server.close(done));
const receipt = { version: 1, startedAt, finishedAt: new Date().toISOString(), site: SITE,
  artifactSha256: manifest.artifactSha256, sourceAssetSha256: manifest.sourceAssetSha256,
  verifierSha256, verifierUnchangedDuringRun: verifierSha256 === hash(readFileSync(new URL(import.meta.url))), origin: ORIGIN, priorRoot,
  qualification: 'Root-authored technical responses and N5-to-N3 preference change. Real review timing and same-installation rollback recovery; no fresh-device enrollment/recovery, learner acceptance, provider recommendation or proof of comprehension.',
  passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
if (receipt.failed) process.exitCode = 1;
