/** Listening intake through normal controls in persistent profiles. External
 * navigation is intercepted with a synthetic page; actual media seeking is not
 * claimed. Storage faults are separate from the ordinary subjourney. */
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
const sizes = process.env.KAIRO_LISTENING_VIEWPORT === 'desktop' ? [1440] : process.env.KAIRO_LISTENING_VIEWPORT === 'mobile' ? [390] : [1440, 390];
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
const TEXT = '  町の図書館で本を読んだ。\n友達と日本語で話した。 e\u0301 🚀  ';
const QUESTION = 'この町の文で、助詞の使い方を確かめたい。';
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
async function inbox(page) {
  if (await page.locator('#sheet-close').isVisible()) await page.locator('#sheet-close').click();
  if (await page.locator('body').getAttribute('data-view') === 'source-reader') {
    await page.locator('#source-reader-back').click(); await page.locator('#source-reader-back').waitFor({ state: 'hidden' });
  }
  if (await page.locator('body').getAttribute('data-view') !== 'source-inbox') {
    if (!await page.locator('#source-inbox-link').count()) {
      await page.locator('#ginga-symbol').click(); await page.locator('.bubble-shelf').click();
    }
    await page.locator('#source-inbox-link').click();
  }
  await page.locator('#source-capture-save').waitFor();
}
async function lists(page) {
  await inbox(page); await page.locator('#back').click(); await page.waitForFunction(() => document.body.dataset.view === 'shelf');
  await page.locator('#tray').click();
}
async function openSource(page, id) {
  await inbox(page); await page.locator(`[data-source-capture="${id}"]`).click(); await page.locator('#listening-source').waitFor();
}
async function setPosition(page, value) {
  await page.locator('#listening-position').fill(value); await page.locator('#listening-position-save').click();
  await page.waitForFunction((value) => document.querySelector('#listening-position-status')?.textContent.includes(`Saved place ${value}`), value);
}
async function excerptForm(page, text, start, end = '') {
  if (!await page.locator('#listening-excerpt-panel').evaluate((node) => node.open)) await page.locator('#listening-excerpt-panel > summary').click();
  await page.locator('#listening-excerpt-start').fill(start); await page.locator('#listening-excerpt-end').fill(end);
  await page.locator('#listening-excerpt-text').fill(text);
}
async function holdExcerptCommit(page, text) {
  const { installation } = await readAppRecordSnapshot(page);
  await page.evaluate(({ text, databaseName }) => {
    const native = IDBObjectStore.prototype.put, matched = new WeakSet();
    const fault = { fired: 0, released: false, completed: false };
    const keepalive = (tx) => {
      if (!fault.released) tx.objectStore('kairo_replication_rows').get('synthetic-listening-commit-keepalive').onsuccess = () => keepalive(tx);
    };
    IDBObjectStore.prototype.put = function (...args) {
      const request = native.apply(this, args), row = args[0];
      if (fault.fired || this.transaction.db.name !== databaseName || this.name !== 'kairo_replication_rows' || row?.kind !== 'document') return request;
      const document = JSON.parse(row.text);
      if (document.collection === 'learner-record' && document.value.sourceInbox?.entries.some((entry) => entry.candidate.article.body?.text === text)) matched.add(this.transaction);
      if (matched.has(this.transaction) && document.collection === 'kairo:record-host-commands') {
        fault.fired++; keepalive(this.transaction); this.transaction.addEventListener('complete', () => { fault.completed = true; });
      }
      return request;
    };
    fault.release = () => { fault.released = true; };
    fault.disarm = () => { fault.release(); IDBObjectStore.prototype.put = native; };
    window.__listeningCommitHold = fault;
  }, { text, databaseName: installation.databaseName });
}
async function releaseExcerptCommit(page) {
  await page.evaluate(() => window.__listeningCommitHold.release());
  await page.waitForFunction(() => window.__listeningCommitHold?.completed);
  const result = await page.evaluate(() => {
    const fault = window.__listeningCommitHold; fault.disarm(); delete window.__listeningCommitHold;
    return { fired: fault.fired, completed: fault.completed };
  });
  assert.equal(result.fired, 1); return result;
}
for (const engine of engines) for (const width of sizes) {
  const name = `${engine}-${width}`, out = join(OUT, name); mkdirSync(out, { recursive: true });
  const result = { name, engine, width, passed: false, observations: [], screenshots: [], videos: [], errors: [], externalRequests: [], interceptedPlayerNavigations: [] };
  results.push(result); let context, page, episode = 0, profile = 'profile', expectedExternal = null;
  const open = async () => {
    const videos = join(out, `video-${++episode}`); mkdirSync(videos, { recursive: true });
    context = await ({ chromium, webkit }[engine]).launchPersistentContext(join(out, profile), {
      headless: true, viewport: { width, height: width === 390 ? 844 : 1050 }, locale: 'en-US',
      serviceWorkers: 'allow', acceptDownloads: true, ignoreHTTPSErrors: true,
      ...(engine === 'chromium' ? { args: ['--ignore-certificate-errors'] } : {}), recordVideo: { dir: videos, size: { width, height: width === 390 ? 844 : 1050 } },
    });
    result.browserVersion = context.browser()?.version();
    await context.route('**/*', (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === ORIGIN) return route.continue();
      if (expectedExternal?.split('#')[0] === request.url() && request.isNavigationRequest()) {
        result.interceptedPlayerNavigations.push({ link: expectedExternal, requestUrl: request.url(), networkSent: false });
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Synthetic player handoff</title><p>Navigation fixture only. No external media was retrieved or played.</p>' });
      }
      result.externalRequests.push({ origin: url.origin, pathname: url.pathname }); return route.abort();
    });
    page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => result.errors.push({ episode, message: error.message }));
  };
  const close = async () => {
    if (!context) return;
    await page.evaluate(() => window.__listeningCommitHold?.disarm()).catch(() => undefined);
    const videos = context.pages().map((page) => page.video()); await context.close(); context = null;
    for (const video of videos) if (video) result.videos.push(await video.path());
  };
  const screenshot = async (label, focus = null) => {
    if (focus) await page.locator(focus).scrollIntoViewIfNeeded(); await page.evaluate(() => document.fonts.ready);
    const file = join(out, `${label}.png`); await page.screenshot({ path: file });
    result.screenshots.push({ label, path: file, sha256: hash(readFileSync(file)) });
  };
  try {
    await open(); await frontDoor(page); const initial = await readAppRecordSnapshot(page), sources = [];
    for (let index = 1; index <= 5; index++) {
      const kind = index <= 3 ? 'video' : 'podcast';
      const entry = { title: `日本語で聞く話 ${index}`, kind, creator: `Synthetic creator ${index}`,
        url: kind === 'video' ? `https://www.youtube.com/watch?v=R23fixture${index}&t=${73 + index}` : `https://podcast.example.org/episode-${index}#original` };
      await page.locator('#source-capture-title').fill(entry.title); await page.locator('#source-capture-url').fill(entry.url);
      await page.locator('#source-capture-save').click(); await page.locator('#source-reader-original').waitFor();
      assert.equal(await page.locator('#source-reader-original').getAttribute('href'), entry.url);
      await page.locator('#listening-setup > summary').click(); await page.locator('#listening-kind').selectOption(kind);
      await page.locator('#listening-creator').fill(entry.creator); await page.locator('#listening-register-save').click();
      await page.locator('#listening-source').waitFor();
      const registered = await readAppRecordSnapshot(page); entry.id = registered.record.sourceInbox.entries.at(-1).id; sources.push(entry);
      assert.equal(registered.record.sourceInbox.listening.find((item) => item.sourceId === entry.id).position, null);
      await setPosition(page, `1:${String(13 + index).padStart(2, '0')}`);
      const target = await page.locator('#listening-resume').getAttribute('href');
      assert.equal(target, kind === 'video' ? `https://www.youtube.com/watch?v=R23fixture${index}&t=${73 + index}s` : entry.url);
      if (index === 1 || index === 4) {
        const before = await readAppRecordSnapshot(page); expectedExternal = target;
        const popupWork = context.waitForEvent('page'); await page.locator('#listening-resume').click(); const popup = await popupWork;
        await popup.getByText('Navigation fixture only.', { exact: false }).waitFor(); const video = popup.video(); await popup.close(); if (video) result.videos.push(await video.path());
        expectedExternal = null; assert.deepEqual((await readAppRecordSnapshot(page)).record.sourceInbox, before.record.sourceInbox, 'Opening a player cannot invent new progress');
      }
      await page.locator('#source-reader-back').click(); await page.locator('#source-capture-save').waitFor();
    }
    const queue = await readAppRecordSnapshot(page); noReviewChange(initial, queue);
    assert.equal(queue.record.sourceInbox.listening.length, 5); assert.equal(queue.record.sourceInbox.entries.length, 5);
    await page.locator('#source-inbox-kept-link').click();
    await page.waitForFunction(() => document.activeElement?.id === 'source-inbox-kept');
    await screenshot('five-listening-sources');
    const parent = sources[0]; await openSource(page, parent.id); await setPosition(page, '2:34');
    assert.equal(await page.locator('#listening-resume').getAttribute('href'), 'https://www.youtube.com/watch?v=R23fixture1&t=154s');
    const validPosition = await readAppRecordSnapshot(page); await page.locator('#listening-position').fill('2:99'); await page.locator('#listening-position-save').click();
    await page.waitForFunction(() => document.querySelector('#listening-position-status')?.textContent.includes('has not changed'));
    assert.deepEqual((await readAppRecordSnapshot(page)).record.sourceInbox, validPosition.record.sourceInbox);
    await excerptForm(page, '町の図書館で本をよんだ。', '0:', '0:30'); await screenshot('unfinished-excerpt', '#listening-excerpt-text');
    await close(); await open(); await frontDoor(page); await openSource(page, parent.id);
    assert.equal(await page.locator('#listening-position').inputValue(), '2:34');
    assert.equal(await page.locator('#listening-excerpt-start').inputValue(), '0:');
    assert.equal(await page.locator('#listening-excerpt-text').inputValue(), '町の図書館で本をよんだ。');
    await excerptForm(page, TEXT, '0:12', '0:30'); await page.locator('#listening-excerpt-save').click();
    await page.locator('#source-reader-body').waitFor(); assert.equal(await page.locator('#source-reader-body').textContent(), TEXT);
    const saved = await readAppRecordSnapshot(page), excerpt = saved.record.sourceInbox.excerpts[0];
    assert.equal(excerpt.sourceId, parent.id); assert.equal(excerpt.startSeconds, 12); assert.equal(excerpt.endSeconds, 30);
    assert.equal(excerpt.provenance.kind, 'user-supplied'); noReviewChange(initial, saved);
    assert.equal(saved.record.sourceInbox.listening[0].position.seconds, 154);
    assert.equal(await page.locator('#listening-excerpt-original').getAttribute('href'), 'https://www.youtube.com/watch?v=R23fixture1&t=12s');
    assert.equal(await page.locator('#source-reader-original').getAttribute('href'), parent.url);
    await screenshot('saved-excerpt-and-original-time', '#source-reader-body');
    await selectWord(page); await page.locator('#source-selection-lookup').click(); await page.locator('.nav-search-row').first().click();
    await page.locator('#sheet-take').click(); await waitForAppRecord(page, (record) => record.taken.length === 1);
    const learned = await readAppRecordSnapshot(page), item = learned.record.taken[0];
    assert.equal(item.id, '町'); const topic = learned.record.teacherContexts.entries.find((entry) => entry.id === item.sourceContextRef);
    assert.equal(topic.sourceId, excerpt.captureId); assert.equal(topic.quote, '  町の図書館で本を読んだ。');
    await page.locator('#sheet .learning-source summary').click(); await page.locator('#learning-source-return').click();
    await page.locator('#source-context-return').waitFor(); assert.equal(await page.locator('#listening-excerpt-original').getAttribute('href'), 'https://www.youtube.com/watch?v=R23fixture1&t=12s');
    await page.locator('#source-reader-back').click(); await page.locator('#sheet .teacher-discuss').click();
    await page.locator('#chat-input').fill(QUESTION); await waitForAppRecord(page, (record) => record.teacherDrafts?.entries.some((entry) => entry.text === QUESTION && !entry.consumed));
    assert.equal(await page.locator('#chat-send').isDisabled(), true);
    await page.locator('#teacher-source-return').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#source-reader-body').textContent(), TEXT);
    assert.equal(await page.locator('#listening-excerpt-original').getAttribute('href'), 'https://www.youtube.com/watch?v=R23fixture1&t=12s');
    await screenshot('learning-and-teacher-source-return', '#source-context-return');
    await lists(page); const exportWork = page.waitForEvent('download'); await page.locator('#export-store').click();
    const backupFile = join(out, 'ordinary-ui-backup.json'); await (await exportWork).saveAs(backupFile);
    const backup = JSON.parse(readFileSync(backupFile)); assert.deepEqual(backup.record.sourceInbox, saved.record.sourceInbox);
    await close(); profile = 'restored-profile'; await open(); await frontDoor(page); await lists(page);
    const importNavigation = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame(), timeout: 30000 });
    await page.locator('#import-file').setInputFiles(backupFile); await importNavigation; await ready(page); await inbox(page);
    const restored = await readAppRecordSnapshot(page); assert.deepEqual(restored.record.sourceInbox, saved.record.sourceInbox);
    assert.equal(restored.record.taken[0].sourceContextRef, topic.id);
    assert(restored.record.teacherDrafts.entries.some((entry) => entry.text === QUESTION && !entry.consumed));
    await openSource(page, parent.id); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    if (engine === 'webkit') disconnected = true; else await context.setOffline(true);
    await page.reload(); await ready(page); await inbox(page); await openSource(page, parent.id);
    assert.equal(await page.locator('#listening-position').inputValue(), '2:34');
    await page.locator(`[data-listening-excerpt="${excerpt.captureId}"]`).click(); await page.locator('#source-reader-body').waitFor();
    assert.equal(await page.locator('#source-reader-body').textContent(), TEXT);
    await screenshot('offline-restored-excerpt', '#source-reader-body');
    disconnected = false; await context.setOffline(false);
    result.observations.push({ ordinaryFlow: 'five manual sources → listening metadata/confirmed places → intercepted external handoff/return → draft/restart/correction → saved timed excerpt → lookup/explicit learning → teacher question/source return → UI backup/fresh restore → offline reuse', sources,
      excerpt, learnedItem: item, backupFile, backupSha256: hash(readFileSync(backupFile)), actualExternalPlayback: false, fullJourneyAccepted: false });

    // Separate synthetic native-write boundary checks begin here.
    await openSource(page, parent.id); const beforePositionFault = await readAppRecordSnapshot(page);
    await armRecordWriteFailure(page, 'quota', { roots: ['sourceInbox'] }); await page.locator('#listening-position').fill('3:00'); await page.locator('#listening-position-save').click();
    await page.waitForFunction(() => document.querySelector('#listening-position-status')?.textContent.includes('could not be saved'));
    assert.equal(await page.locator('#listening-position').inputValue(), '3:00');
    assert.deepEqual((await readAppRecordSnapshot(page)).record.sourceInbox, beforePositionFault.record.sourceInbox);
    await clearRecordWriteFailure(page); await close(); await open(); await frontDoor(page); await openSource(page, parent.id);
    assert.equal(await page.locator('#listening-position').inputValue(), '2:34');
    result.observations.push({ syntheticFault: 'Native position write quota', falseProgressAcknowledgement: false, priorPlaceSurvivesRestart: true });
    const failedText = '保存できなかった抜粋の下書き。'; await excerptForm(page, failedText, '3:10', '3:30');
    const beforeExcerptFault = await readAppRecordSnapshot(page); await armRecordWriteFailure(page, 'quota', { roots: ['sourceInbox'] }); await page.locator('#listening-excerpt-save').click();
    await page.waitForFunction(() => document.querySelector('#listening-excerpt-status')?.textContent.includes('has not been saved'));
    assert.deepEqual((await readAppRecordSnapshot(page)).record.sourceInbox, beforeExcerptFault.record.sourceInbox);
    await clearRecordWriteFailure(page); await close(); await open(); await frontDoor(page); await openSource(page, parent.id);
    assert.equal(await page.locator('#listening-excerpt-text').inputValue(), failedText); assert.equal(await page.locator('#listening-excerpt-start').inputValue(), '3:10');
    result.observations.push({ syntheticFault: 'Native excerpt write quota', priorRecordUnchanged: true, exactDraftRecovered: true });
    await holdExcerptCommit(page, failedText); await page.locator('#listening-excerpt-save').click(); await page.waitForFunction(() => window.__listeningCommitHold?.fired === 1);
    const newerText = '新しく書いた抜粋は、前の保存で消えない。'; await excerptForm(page, newerText, '4:00', '4:30');
    const native = await releaseExcerptCommit(page);
    await page.waitForFunction(() => document.querySelector('#listening-excerpt-save')?.disabled === false);
    assert.equal(await page.locator('#listening-excerpt-text').inputValue(), newerText);
    const late = await readAppRecordSnapshot(page); assert(late.record.sourceInbox.entries.some((entry) => entry.candidate.article.body?.text === failedText));
    assert(!late.record.sourceInbox.entries.some((entry) => entry.candidate.article.body?.text === newerText));
    await screenshot('newer-excerpt-kept-after-late-save', '#listening-excerpt-text');
    await page.locator('#listening-excerpt-save').click(); await page.locator('#source-reader-body').waitFor();
    assert.equal(await page.locator('#source-reader-body').textContent(), newerText);
    const final = await readAppRecordSnapshot(page);
    assert.equal(final.record.sourceInbox.excerpts.length, 3); assert.equal(final.record.sourceInbox.listening.length, 5);
    for (const key of ['taken', 'srs', 'revlog', 'stats', 'lists']) assert.deepEqual(final.record[key], restored.record[key]);
    result.observations.push({ syntheticFault: 'Real excerpt commit held while a newer draft is typed', native, oldAndNewExcerptsRetained: true, newerDraftNotConsumedByOldSave: true });
    assert.deepEqual(result.errors, []); assert.deepEqual(result.externalRequests, []); assert.equal(result.interceptedPlayerNavigations.length, 2);
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
  artifactSha256: manifest.artifactSha256, verifierSha256, results, passed: results.filter((result) => result.passed).length, total: results.length,
  scope: 'Persistent browser listening-intake subjourneys with learner-supplied synthetic sources/text, intercepted external navigation and separate native faults. No real media playback, caption retrieval, live teaching, iPhone sharing, physical-device or full learner/trial acceptance.' };
writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2));
if (receipt.passed !== receipt.total) process.exitCode = 1;
