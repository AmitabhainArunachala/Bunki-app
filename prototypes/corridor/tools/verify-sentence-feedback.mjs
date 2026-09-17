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
const sizes = process.env.KAIRO_SENTENCE_FEEDBACK_VIEWPORT === 'desktop' ? [1440] : [1440, 390];
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
let disconnected = false;
const certificate = join(OUT, 'synthetic-localhost-cert.pem'), privateKey = join(OUT, 'synthetic-localhost-key.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', privateKey, '-out', certificate,
  '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const server = createServer({ key: readFileSync(privateKey), cert: readFileSync(certificate) }, (request, response) => {
  if (disconnected) { request.socket.destroy(); return; }
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/synthetic-local-recovery-fault') {
    response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>Explicit synthetic recovery fixture</title><p>Local recovery slot only; no application code or native record input writes.</p>'); return;
  }
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
  for (let step = 0; step < 8; step++) {
    const view = await page.locator('body').getAttribute('data-view');
    if (view === 'shelf') return;
    if (view === 'drift') {
      await page.locator('#ginga-symbol').focus(); await page.keyboard.press('Enter');
      await page.locator('.bubble-shelf').click();
    } else await page.locator('#back').click();
    await page.waitForFunction(previous => document.body.dataset.view !== previous, view);
  }
  assert.fail('Ordinary Back controls did not reach the bookshelf');
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
function unchanged(before, after, keys = ['taken', 'srs', 'revlog', 'stats', 'lists', 'sentencePractice']) {
  for (const key of keys) assert.deepEqual(after[key], before[key], `${key} remains unchanged`);
}

async function tutor(page) {
  await shelf(page); await page.locator('#ai-link').click(); await page.locator('#chat-input').waitFor();
}
function draftFor(record, ref) { return record.teacherDrafts?.entries.find((draft) => draft.contextRef === ref); }
async function savedDraft(page, ref, text) {
  const record = await waitForAppRecord(page, (record) => {
    const draft = draftFor(record, ref); return draft && !draft.consumed && draft.text === text;
  });
  await page.waitForFunction(() => document.getElementById('teacher-draft-status')?.dataset.state === 'saved');
  return draftFor(record, ref);
}
/** Keep one real draft transaction open with native reads. No replacement
 * reducer, fake result, or native record input is supplied by this fixture. */
async function holdNextPreparedDraft(page, ref) {
  const { installation } = await readAppRecordSnapshot(page);
  await page.evaluate(({ databaseName, ref, response }) => {
    const put = IDBObjectStore.prototype.put;
    const fault = { fired: 0, durable: false, released: false, captured: null };
    const holding = new WeakSet();
    const hold = (tx) => {
      if (fault.released) return;
      const request = tx.objectStore('kairo_replication_rows').get('synthetic-sentence-draft-keepalive');
      request.onsuccess = () => hold(tx);
    };
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.transaction.db.name !== databaseName || this.name !== 'kairo_replication_rows' || fault.released) return request;
      const row = args[0]?.kind === 'document' ? JSON.parse(args[0].text) : null;
      const draft = row?.collection === 'learner-record' && row.value.teacherDrafts?.entries.find((entry) => entry.contextRef === ref);
      if (!fault.fired && typeof draft?.text === 'string' && draft.text.includes(response)) {
        holding.add(this.transaction); fault.captured = draft;
      }
      if (holding.has(this.transaction) && row?.collection === 'kairo:record-host-commands' && !fault.fired) {
        fault.fired++; this.transaction.addEventListener('complete', () => { fault.durable = true; }); hold(this.transaction);
      }
      return request;
    };
    fault.disarm = () => { fault.released = true; IDBObjectStore.prototype.put = put; };
    window.__sentenceDraftHold = fault;
  }, { databaseName: installation.databaseName, ref, response: PRODUCTION });
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
    await page.locator('#source-inbox-link').click();
    const before = (await readAppRecordSnapshot(page)).record;
    await page.locator('#source-capture-title').fill('図書館での一日'); await page.locator('#source-capture-text').fill(TEXT);
    await page.locator('#source-capture-save').click(); await page.locator('#source-reader-body').waitFor();
    await selectTown(page); await page.locator('#source-sentence-practice').click();
    await page.locator('#sentence-choose-cloze').uncheck(); await page.locator('#sentence-choose-production').check();
    await page.locator('#sentence-practice-confirm').click(); await page.locator('#sentence-production-text').waitFor();
    await page.locator('#sentence-production-text').fill(PRODUCTION); await page.locator('#sentence-production-save').click();
    await waitForAppRecord(page, record => record.sentencePractice?.responses.length === 1);
    const written = (await readAppRecordSnapshot(page)).record;
    unchanged(before, written, ['taken', 'srs', 'revlog', 'stats', 'lists']);
    const entry = written.sentencePractice.entries[0], response = written.sentencePractice.responses[0], ref = entry.context.id;
    const ask = () => page.locator(`[data-sentence-teacher-response="${response.id}"]`);
    assert.equal(response.text, PRODUCTION); assert.equal(response.observation.type, 'ProductionObserved');
    assert.equal(response.observation.tier, 'B'); assert.equal(written.sentencePractice.grades.length, 0);
    await page.locator('#sentence-practice-history').scrollIntoViewIfNeeded(); await screenshot('saved-response-action');
    const previous = width === 1440 ? '  A question I already started.\n e\u0301 🚀\t' : '';
    if (previous) {
      await tutor(page); await page.locator('#teacher-context-select').selectOption(ref);
      await page.waitForFunction(ref => document.getElementById('chat-input')?.dataset.teacherContextRef === ref, ref);
      await page.locator('#chat-input').fill(previous); await savedDraft(page, ref, previous);
      await page.locator('#teacher-practice-return').click();
    }
    // Pointer activation remains sealed during its own pending work.
    await ask().click(); await page.locator('#chat-input').waitFor();
    assert.equal(await page.locator('#teacher-context-select').inputValue(), ref);
    assert.equal(await page.locator('.teacher-context .teacher-source-quote').textContent(), SENTENCE);
    const prepared = await page.locator('#chat-input').inputValue();
    assert(prepared.includes(PRODUCTION)); assert(prepared.includes('「町」')); assert(!prepared.includes('undefined'));
    if (previous) assert(prepared.startsWith(`${previous}\n\n`));
    const initialDraft = await savedDraft(page, ref, prepared);
    const inputBounds = await page.locator('#chat-input').boundingBox();
    const chromeBounds = await page.locator('.chrome').boundingBox();
    assert(inputBounds.y >= chromeBounds.y + chromeBounds.height, 'The prepared question begins below the fixed navigation');
    assert(await page.locator('#chat-send').isDisabled());
    const preparedRecord = (await readAppRecordSnapshot(page)).record; unchanged(written, preparedRecord);
    assert.deepEqual(preparedRecord.aiChat, written.aiChat);
    await screenshot('question-with-exact-response');
    await page.locator('#teacher-source-return').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#source-context-return').textContent(), SENTENCE);
    assert.match(await page.locator('#source-reader-back').textContent(), /Back to tutor/u);
    await page.locator('#source-reader-back').click(); await page.locator('#chat-input').waitFor();
    assert.equal(await page.locator('#chat-input').inputValue(), prepared);
    await page.locator('#teacher-practice-return').click(); await ask().waitFor();
    assert.equal(await page.locator('.sentence-response-text').textContent(), PRODUCTION);
    await ask().click(); await page.locator('#chat-input').waitFor();
    assert.equal(await page.locator('#chat-input').inputValue(), prepared);
    assert.equal((await savedDraft(page, ref, prepared)).revision, initialDraft.revision, 'A repeated handoff does not duplicate or replace the draft');
    result.observations.push({ name: 'ordinary-controls-source-response-draft-return', priorQuestion: !!previous,
      contextRef: ref, responseId: response.id, draftRevision: initialDraft.revision, sourceReturn: true, repeatedHandoffIdempotent: true });

    if (width === 1440) {
      // A real full question is entered through the composer, not a record fixture.
      const full = '質問です。🚀 '.repeat(8000);
      assert.equal(full.length, 64000);
      await page.locator('#chat-input').fill(full); const fullDraft = await savedDraft(page, ref, full);
      await page.locator('#teacher-practice-return').click(); await ask().click(); await page.locator('#chat-input').waitFor();
      assert.equal(await page.locator('#chat-input').inputValue(), full);
      assert.equal((await savedDraft(page, ref, full)).revision, fullDraft.revision);
      assert.match(await page.locator('#sentence-teacher-note').textContent(), /length limit/u);
      await screenshot('full-question-preserved');
      const pendingBase = '  A short question before the interrupted preparation.  ';
      await page.locator('#chat-input').fill(pendingBase); await savedDraft(page, ref, pendingBase);
      await page.locator('#teacher-practice-return').click();
      await holdNextPreparedDraft(page, ref); await ask().click();
      await page.waitForFunction(() => window.__sentenceDraftHold?.fired === 1);
      assert.equal(await page.locator('body').getAttribute('data-view'), 'sentence-practice');
      assert(await ask().isDisabled());
      await tutor(page);
      const newer = '  My newer question while the earlier save is pending.\n e\u0301 🚀  ';
      await page.locator('#chat-input').fill(newer);
      await page.evaluate(() => { window.__sentenceDraftHold.released = true; });
      const newerDraft = await savedDraft(page, ref, newer);
      const hold = await page.evaluate(() => {
        const { fired, durable, captured } = window.__sentenceDraftHold;
        window.__sentenceDraftHold.disarm(); delete window.__sentenceDraftHold;
        return { fired, durable, captured };
      });
      assert.equal(hold.fired, 1); assert.equal(hold.durable, true); assert(hold.captured.text.includes(PRODUCTION));
      assert.notEqual(newerDraft.revision, hold.captured.revision);
      assert.equal(await page.locator('#chat-input').inputValue(), newer);
      assert.equal(await page.locator('body').getAttribute('data-view'), 'ai');
      unchanged(written, (await readAppRecordSnapshot(page)).record);
      result.observations.push({ name: 'synthetic-native-hold-and-newer-visible-edit', ...hold, newerDraft });

      await page.locator('#teacher-practice-return').click();
      const beforeFailure = (await readAppRecordSnapshot(page)).record;
      await armRecordWriteFailure(page, 'quota', { roots: ['teacherDrafts'] });
      await ask().click(); await page.locator('#store-alert').waitFor({ state: 'visible' });
      const fault = await clearRecordWriteFailure(page); assert(fault.fired > 0);
      const failed = (await readAppRecordSnapshot(page)).record;
      unchanged(beforeFailure, failed, ['taken', 'srs', 'revlog', 'stats', 'sentencePractice', 'teacherDrafts', 'teacherContexts']);
      const recovery = await page.evaluate(() => {
        const binding = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
        return JSON.parse(localStorage.getItem(`kairo-teacher-draft-recovery-v1:${binding.databaseName}`));
      });
      const recoverable = recovery.entries.find((row) => row.contextRef === ref).latest;
      assert(recoverable.text.startsWith(newer)); assert(recoverable.text.includes(PRODUCTION));
      await screenshot('failed-question-save-keeps-writing');
      await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page); await tutor(page);
      const recovered = await savedDraft(page, ref, recoverable.text); assert.equal(recovered.revision, recoverable.revision);
      result.observations.push({ name: 'synthetic-quota-after-native-puts-and-real-restart', fault,
        recoveredRevision: recovered.revision, savedResponseUnchanged: true });

      const currentText = '  A durable question chosen after the recovered draft.  ';
      await page.locator('#chat-input').fill(currentText); const currentDraft = await savedDraft(page, ref, currentText);
      const beforeConflict = await readAppRecordSnapshot(page);
      const conflictText = '  A different recovered question.\n e\u0301 🚀  ';
      const conflictRevision = 'f4624162-42f3-4127-95f3-763248435165';
      const conflict = { version: 1, installation: JSON.stringify(beforeConflict.installation), entries: [{ contextRef: ref,
        base: recovered, committing: null, latest: { contextRef: ref, revision: conflictRevision, text: conflictText, consumed: false } }] };
      // The serialized installation is copied byte-for-byte from the actual
      // binding. Only this explicitly labeled local recovery slot is changed.
      conflict.installation = await page.evaluate(() => localStorage.getItem('kairo-local-record-binding-v1'));
      await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      // The pinned worker deliberately serves the app for scoped navigations.
      // Establish an inert fixture document before changing its recovery slot.
      const workers = await page.evaluate(async () => Promise.all((await navigator.serviceWorker.getRegistrations())
        .filter((registration) => registration.scope === `${location.origin}/`)
        .map(async (registration) => ({ scope: registration.scope, unregistered: await registration.unregister() }))));
      assert.equal(workers.length, 1); assert.equal(workers[0].unregistered, true);
      await page.goto('about:blank'); await page.goto(`${ORIGIN}/synthetic-local-recovery-fault`);
      assert.equal(await page.title(), 'Explicit synthetic recovery fixture');
      assert.equal(await page.locator('#app').count(), 0);
      assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), false);
      await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
        key: `kairo-teacher-draft-recovery-v1:${beforeConflict.installation.databaseName}`, value: conflict });
      writeFileSync(join(out, 'synthetic-recovery-conflict.json'), JSON.stringify(conflict, null, 2) + '\n');
      await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page); await tutor(page);
      await page.waitForFunction(() => document.getElementById('teacher-draft-status')?.dataset.state === 'conflict');
      await page.locator('#teacher-practice-return').click(); await ask().click(); await page.locator('#chat-input').waitFor();
      assert.equal(await page.locator('#chat-input').inputValue(), currentText);
      assert(await page.locator('#chat-input').getAttribute('readonly') !== null);
      assert.match(await page.locator('#sentence-teacher-note').textContent(), /has not been added/u);
      assert.equal(draftFor((await readAppRecordSnapshot(page)).record, ref).revision, currentDraft.revision);
      assert.match(await page.locator('#teacher-draft-recovery').textContent(), /different recovered question/u);
      await screenshot('recovery-choice-before-response');
      await page.locator('[data-teacher-recovery-keep]').click();
      await page.waitForFunction(() => document.getElementById('teacher-draft-status')?.dataset.state === 'saved');
      await page.locator('#teacher-practice-return').click(); await ask().click(); await page.locator('#chat-input').waitFor();
      const afterChoice = await page.locator('#chat-input').inputValue(); assert(afterChoice.startsWith(currentText)); assert(afterChoice.includes(PRODUCTION));
      await savedDraft(page, ref, afterChoice);
      result.observations.push({ name: 'synthetic-local-recovery-conflict', nativeRecordInputWrites: 0,
        inertFixtureVerified: true, fixtureWorkerUnregistration: workers,
        previousQuestionPreserved: true, recoveryChoice: 'keep saved question', responseAddedOnlyAfterChoice: true });
    }

    const finalText = await page.locator('#chat-input').inputValue(), finalDraft = await savedDraft(page, ref, finalText);
    const completed = (await readAppRecordSnapshot(page)).record; unchanged(written, completed);
    await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page); await tutor(page);
    assert.equal(await page.locator('#chat-input').inputValue(), finalText);
    assert.equal((await savedDraft(page, ref, finalText)).revision, finalDraft.revision);
    await lists(page);
    const pendingDownload = page.waitForEvent('download'); await page.locator('#export-store').click();
    const download = await pendingDownload, backupPath = join(out, 'sentence-feedback-backup.json'); await download.saveAs(backupPath);
    const backup = JSON.parse(readFileSync(backupPath)); assert.equal(backup.completeness, 'complete');
    assert.deepEqual(backup.record.sentencePractice, completed.sentencePractice);
    assert.deepEqual(backup.record.teacherDrafts, completed.teacherDrafts);
    result.observations.push({ name: 'normal-ui-backup', path: backupPath, sha256: hash(readFileSync(backupPath)) });
    await close(); profile = 'profile-restored'; await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
    await lists(page);
    const timeOrigin = await page.evaluate(() => performance.timeOrigin); await page.locator('#import-file').setInputFiles(backupPath);
    await page.waitForFunction(old => performance.timeOrigin !== old && document.body?.dataset.ready === '1', timeOrigin, { timeout: 30000 });
    await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    if (engine === 'webkit') disconnected = true; else await context.setOffline(true);
    await page.reload(); await ready(page); await openSaved(); await ask().click(); await page.locator('#chat-input').waitFor();
    assert.equal(await page.locator('#chat-input').inputValue(), finalText);
    assert.equal((await savedDraft(page, ref, finalText)).revision, finalDraft.revision);
    await page.locator('#teacher-source-return').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#source-context-return').textContent(), SENTENCE);
    await page.locator('#source-reader-back').click(); await page.locator('#chat-input').waitFor();
    assert.equal(await page.locator('#chat-input').inputValue(), finalText);
    await page.locator('#teacher-practice-return').click(); await ask().waitFor();
    assert.equal(await page.locator('.sentence-response-text').textContent(), PRODUCTION);
    const restored = (await readAppRecordSnapshot(page)).record;
    unchanged(completed, restored, ['taken', 'srs', 'revlog', 'sourceInbox', 'teacherContexts', 'sentencePractice', 'teacherDrafts']);
    await page.locator('#sentence-practice-history').scrollIntoViewIfNeeded(); await screenshot('restored-offline-writing-and-return');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.equal(result.errors.length, 0); assert.equal(result.externalRequests.length, 0);
    result.passed = true; result.entryId = entry.plan.id; result.sourceContextRef = ref;
    result.counts = { responses: restored.sentencePractice.responses.length, grades: restored.sentencePractice.grades.length,
      reviewRows: restored.revlog.length, teacherDrafts: restored.teacherDrafts.entries.length, tutorTurns: restored.aiChat.length };
    result.offline = engine === 'webkit' ? 'local HTTPS server disconnected with actual worker-controlled reload' : 'Chromium context offline with actual worker-controlled reload';
  } catch (error) {
    result.failure = error?.stack || String(error);
    try { if (page) await screenshot('failure'); } catch { /* Original failure retained. */ }
  } finally {
    if (page && !page.isClosed()) await page.evaluate(() => window.__sentenceDraftHold?.disarm()).catch(() => undefined);
    disconnected = false; await close();
  }
}
await new Promise(done => server.close(done));
const receipt = { version: 1, startedAt, finishedAt: new Date().toISOString(), artifactSha256: manifest.artifactSha256,
  sourceAssetSha256: manifest.sourceAssetSha256, site: SITE, verifierSha256,
  qualification: 'Headless saved-response handoff subjourneys through normal controls on synthetic Japanese, with real persistence and offline reload. Named hold/quota/recovery faults are synthetic; no fake tutor replies or external requests. No live teaching, native UI, physical iPhone or complete learner acceptance.',
  passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results };
writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ passed: receipt.passed, failed: receipt.failed, failures: results.filter(r => !r.passed).map(r => ({ engine: r.engine, width: r.width, failure: r.failure })), receipt: join(OUT, 'receipt.json') }, null, 2));
if (receipt.failed) process.exitCode = 1;
