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
const sizes = process.env.KAIRO_TRANSCRIPT_VIEWPORT === 'desktop' ? [1440] : process.env.KAIRO_TRANSCRIPT_VIEWPORT === 'mobile' ? [390] : [1440, 390];
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
const RAW = '\uFEFFWEBVTT\r\n\r\nNOTE synthetic learner-supplied transcript\r\nNo live media fetched.\r\n\r\none\r\n00:12.250 --> 00:19.500 align:start\r\n  図書館で本を読んだ。e\u0301 🚀。  \r\n\r\ntwo\r\n01:13.125 --> 01:16.875\r\n町で友達と日本語で話した。\r\n\r\nthree\r\n01:14.000 --> 01:21.625\r\n<img src="https://caption.invalid/x"> 帰り道。\r\n';
const TEXT = '  図書館で本を読んだ。e\u0301 🚀。  \n\n町で友達と日本語で話した。\n\n<img src="https://caption.invalid/x"> 帰り道。';
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
async function transcriptForm(page, text, format = 'srt') {
  if (!await page.locator('#transcript-import-panel').evaluate(node => node.open)) await page.locator('#transcript-import-panel > summary').click();
  await page.locator('#transcript-use-paste').click(); await page.locator('#transcript-import-format').selectOption(format);
  await page.locator('#transcript-import-text').fill(text);
}
async function previewTranscript(page) {
  await page.locator('#transcript-preview').click(); await page.waitForFunction(() => document.querySelector('#transcript-import-save')?.disabled === false);
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
    await page.evaluate(() => { window.__listeningCommitHold?.disarm(); window.__transcriptFileHold?.disarm(); }).catch(() => undefined);
    const videos = context.pages().map((page) => page.video()); await context.close(); context = null;
    for (const video of videos) if (video) result.videos.push(await video.path());
  };
  const screenshot = async (label, focus = null) => {
    if (focus) await page.locator(focus).scrollIntoViewIfNeeded(); await page.evaluate(() => document.fonts.ready);
    const file = join(out, `${label}.png`); await page.screenshot({ path: file });
    result.screenshots.push({ label, path: file, sha256: hash(readFileSync(file)) });
  };
  try {
    await open(); await frontDoor(page); const initial = await readAppRecordSnapshot(page);
    const url = 'https://www.youtube.com/watch?v=R24fixture1&t=154#original';
    await page.locator('#source-capture-title').fill('字幕と一緒に聞く話'); await page.locator('#source-capture-url').fill(url);
    await page.locator('#source-capture-save').click(); await page.locator('#listening-setup > summary').click(); await page.locator('#listening-register-save').click();
    await page.locator('#listening-source').waitFor(); const parent = (await readAppRecordSnapshot(page)).record.sourceInbox.entries[0].id;
    await setPosition(page, '2:34'); const pointer = await readAppRecordSnapshot(page);
    await page.locator('#transcript-import-panel > summary').click();
    const file = { name: '学びの字幕.vtt', mimeType: 'text/vtt', buffer: Buffer.from(RAW) };
    await page.locator('#transcript-import-file').setInputFiles(file);
    await page.waitForFunction(() => document.querySelector('#transcript-import-name')?.textContent === '学びの字幕.vtt');
    const recoveredFile = await page.evaluate(({ databaseName, sourceId }) => JSON.parse(localStorage.getItem(`kairo-listening-transcript-draft-v1:${databaseName}:${sourceId}`)),
      { databaseName: pointer.installation.databaseName, sourceId: parent });
    assert.equal(recoveredFile.input.text, RAW);
    result.fileTextObservation = { exactRawDraftSha256: hash(Buffer.from(recoveredFile.input.text)), displayedTextareaSha256: hash(Buffer.from(await page.locator('#transcript-import-text').inputValue())), rawCRLFCount: RAW.split('\r\n').length - 1, htmlTextareaUsesLF: (await page.locator('#transcript-import-text').inputValue()) === RAW.replace(/\r\n?/gu, '\n') };
    assert.equal(result.fileTextObservation.htmlTextareaUsesLF, true);
    assert.equal(await page.locator('#transcript-import-text').getAttribute('readonly'), '');
    assert.equal(await page.locator('#transcript-import-save').isDisabled(), true);
    assert.deepEqual((await readAppRecordSnapshot(page)).record.sourceInbox, pointer.record.sourceInbox);
    await screenshot('file-draft-before-preview', '#transcript-import-text');
    await page.locator('#transcript-import-file').setInputFiles({ name: 'invalid.vtt', mimeType: 'text/vtt', buffer: Buffer.from([0xff,0xfe,0x41]) });
    await page.waitForFunction(() => document.querySelector('#transcript-import-status')?.textContent.includes('could not open'));
    assert.equal(await page.locator('#transcript-import-text').inputValue(), RAW.replace(/\r\n?/gu, '\n'));
    await close(); await open(); await frontDoor(page); await openSource(page, parent);
    assert.equal(await page.locator('#transcript-import-text').inputValue(), RAW.replace(/\r\n?/gu, '\n')); assert.equal(await page.locator('#transcript-import-name').textContent(), file.name);
    await previewTranscript(page); assert((await page.locator('#transcript-preview-content').textContent()).includes('3 captions'));
    await screenshot('preview-before-keeping', '#transcript-preview-content');
    await page.locator('#transcript-import-save').click(); await page.locator('#source-reader-body').waitFor();
    assert.equal(await page.locator('#source-reader-body').textContent(), TEXT); assert.equal(await page.locator('#source-reader-body img').count(), 0);
    const saved = await readAppRecordSnapshot(page), transcript = saved.record.sourceInbox.transcripts[0], id = transcript.captureId;
    assert.equal(saved.record.sourceInbox.entries.length, 2); assert.equal(transcript.sourceId, parent); assert.equal(transcript.document.input.text, RAW);
    assert.equal(transcript.document.rawSha256, hash(Buffer.from(RAW))); assert.equal(transcript.document.bodySha256, hash(Buffer.from(TEXT)));
    assert.deepEqual(transcript.document.cues.map(cue => [cue.startMs,cue.endMs]), [[12250,19500],[73125,76875],[74000,81625]]);
    assert.equal(saved.record.sourceInbox.listening[0].position.seconds, 154); noReviewChange(initial, saved);
    assert.equal(await page.locator('#source-reader-original').getAttribute('href'), url);
    const downloadWork = page.waitForEvent('download'); await page.locator('#transcript-download').click();
    const downloaded = await downloadWork, original = join(out, downloaded.suggestedFilename()); await downloaded.saveAs(original);
    assert.deepEqual(readFileSync(original), Buffer.from(RAW));
    await page.locator('#transcript-cues > summary').click(); await page.locator('[data-transcript-cue="1"]').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#source-context-return').textContent(), '町で友達と日本語で話した。');
    assert.equal(await page.locator('#transcript-original-time').getAttribute('href'), 'https://www.youtube.com/watch?v=R24fixture1&t=73s');
    await screenshot('caption-time-and-exact-source', '#source-context-return');
    await selectWord(page); assert.equal(await page.locator('#transcript-selection-original').getAttribute('href'), 'https://www.youtube.com/watch?v=R24fixture1&t=73s');
    await page.locator('#source-selection-lookup').click(); await page.locator('.nav-search-row').first().click(); await page.locator('#sheet-take').click();
    await waitForAppRecord(page, record => record.taken.length === 1);
    const learned = await readAppRecordSnapshot(page), item = learned.record.taken[0], topic = learned.record.teacherContexts.entries.find(entry => entry.id === item.sourceContextRef);
    assert.equal(item.id, '町'); assert.equal(topic.sourceId, id); assert.equal(topic.sourceDigest, transcript.document.bodySha256);
    assert.equal(TEXT.slice(topic.start, topic.end), topic.quote);
    await page.locator('#sheet .learning-source summary').click(); await page.locator('#learning-source-return').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#transcript-original-time').getAttribute('href'), 'https://www.youtube.com/watch?v=R24fixture1&t=73s');
    await page.locator('#source-reader-back').click(); await page.locator('#sheet .teacher-discuss').click();
    await page.locator('#chat-input').fill(QUESTION); await waitForAppRecord(page, record => record.teacherDrafts?.entries.some(entry => entry.text === QUESTION && !entry.consumed));
    assert.equal(await page.locator('#chat-send').isDisabled(), true); await page.locator('#teacher-source-return').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#transcript-original-time').getAttribute('href'), 'https://www.youtube.com/watch?v=R24fixture1&t=73s');
    await screenshot('learning-and-teacher-return', '#source-context-return');
    await page.locator('#transcript-parent').click(); await page.locator('#listening-source').waitFor();
    const invalid = '1\n00:00:00,000 --> 00:00:00,000\n直す字幕。'; await transcriptForm(page, invalid); await page.locator('#transcript-preview').click();
    await page.waitForFunction(() => document.querySelector('#transcript-import-status')?.textContent.includes('could not be read'));
    assert.equal(await page.locator('#transcript-import-save').isDisabled(), true); assert.equal(await page.locator('#transcript-import-text').inputValue(), invalid);
    const secondRaw = '1\n00:42:01,250 --> 00:42:06,125\nもう一度、町で聞く。\n'; await transcriptForm(page, secondRaw); await previewTranscript(page); await screenshot('single-caption-preview', '#transcript-preview-content');
    await page.locator('#transcript-import-save').click(); await page.locator('#source-reader-body').waitFor();
    assert.equal(await page.locator('#source-reader-body').textContent(), 'もう一度、町で聞く。');
    const withSecond = await readAppRecordSnapshot(page); assert.equal(withSecond.record.sourceInbox.transcripts.length, 2);
    assert.equal(withSecond.record.sourceInbox.transcripts[1].document.input.origin, 'paste');
    for (const key of ['taken','srs','revlog','stats','lists']) assert.deepEqual(withSecond.record[key], learned.record[key]);
    await lists(page); const backupWork = page.waitForEvent('download'); await page.locator('#export-store').click(); const backupFile = join(out,'ordinary-ui-backup.json');
    await (await backupWork).saveAs(backupFile); assert.deepEqual(JSON.parse(readFileSync(backupFile)).record.sourceInbox, withSecond.record.sourceInbox);
    await close(); profile = 'restored-profile'; await open(); await frontDoor(page); await lists(page);
    const imported = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame(), timeout: 30000 });
    await page.locator('#import-file').setInputFiles(backupFile); await imported; await ready(page); await inbox(page);
    const restored = await readAppRecordSnapshot(page); assert.deepEqual(restored.record.sourceInbox, withSecond.record.sourceInbox); assert.equal(restored.record.taken[0].sourceContextRef, topic.id);
    await openSource(page, parent); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    if (engine === 'webkit') disconnected = true; else await context.setOffline(true);
    await page.reload(); await ready(page); await inbox(page); await openSource(page, parent);
    await page.locator(`[data-listening-transcript="${id}"]`).click(); await page.locator('#source-reader-body').waitFor();
    assert.equal(await page.locator('#source-reader-body').textContent(), TEXT);
    await page.locator('#transcript-cues > summary').click(); await page.locator('[data-transcript-cue="1"]').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#transcript-original-time').getAttribute('href'), 'https://www.youtube.com/watch?v=R24fixture1&t=73s');
    await screenshot('offline-restored-time-and-text', '#source-context-return'); disconnected = false; await context.setOffline(false);
    result.observations.push({ ordinaryFlow: 'manual pointer/confirmed position → file draft/invalid UTF-8/restart → preview/import/raw download → caption time/lookup/explicit learning → local tutor question/exact return → invalid/corrected pasted SRT → UI backup/fresh restore/offline time return', parent, transcript, topic, backupFile, original, fullJourneyAccepted: false });

    // Separate real native transaction and file-read faults; no learner state is seeded.
    await openSource(page, parent); const failedText = '保存が遅れた字幕。', failedRaw = `1\n00:01:00,000 --> 00:01:10,000\n${failedText}`;
    await transcriptForm(page, failedRaw); await previewTranscript(page); const beforeFault = await readAppRecordSnapshot(page);
    await armRecordWriteFailure(page,'quota',{ roots:['sourceInbox'] }); await page.locator('#transcript-import-save').click();
    await page.waitForFunction(() => document.querySelector('#transcript-import-status')?.textContent.includes('has not been saved'));
    assert.deepEqual((await readAppRecordSnapshot(page)).record.sourceInbox, beforeFault.record.sourceInbox);
    await clearRecordWriteFailure(page); await close(); await open(); await frontDoor(page); await openSource(page,parent);
    assert.equal(await page.locator('#transcript-import-text').inputValue(),failedRaw); await previewTranscript(page); await holdExcerptCommit(page,failedText);
    await page.locator('#transcript-import-save').click(); await page.waitForFunction(() => window.__listeningCommitHold?.fired === 1);
    const newerRaw = '1\n00:02:00,000 --> 00:02:10,000\n後から書いた字幕は消えない。'; await page.locator('#transcript-import-text').fill(newerRaw);
    const native = await releaseExcerptCommit(page); await page.waitForFunction(() => document.querySelector('#transcript-preview')?.disabled === false);
    assert.equal(await page.locator('#transcript-import-text').inputValue(),newerRaw);
    assert((await readAppRecordSnapshot(page)).record.sourceInbox.transcripts.some(entry => entry.document.input.text === failedRaw));
    await screenshot('newer-draft-survives-late-save','#transcript-import-text'); await previewTranscript(page); await page.locator('#transcript-import-save').click();
    await page.locator('#source-reader-body').waitFor(); assert.equal(await page.locator('#source-reader-body').textContent(),'後から書いた字幕は消えない。');
    await openSource(page,parent); await transcriptForm(page,'1\n00:03:00,000 --> 00:03:10,000\nさらに新しい下書き。');
    await page.evaluate(() => {
      const original = File.prototype.arrayBuffer, fault = { fired:0, release:null };
      File.prototype.arrayBuffer = async function(){const bytes=await original.call(this);fault.fired++;await new Promise(done=>{fault.release=done;});return bytes;};
      fault.disarm=()=>{fault.release?.();File.prototype.arrayBuffer=original;};window.__transcriptFileHold=fault;
    });
    await page.locator('#transcript-import-file').setInputFiles(file); await page.waitForFunction(()=>window.__transcriptFileHold?.fired===1);
    const lastRaw = '1\n00:04:00,000 --> 00:04:10,000\n開いている間にも書ける。'; await page.locator('#transcript-import-text').fill(lastRaw);
    await page.evaluate(()=>window.__transcriptFileHold.disarm()); await page.waitForFunction(()=>document.querySelector('#transcript-import-status')?.textContent.includes('draft changed'));
    assert.equal(await page.locator('#transcript-import-text').inputValue(),lastRaw); await page.evaluate(()=>{delete window.__transcriptFileHold;});
    const final = await readAppRecordSnapshot(page); assert.equal(final.record.sourceInbox.transcripts.length,4); assert.equal(final.record.sourceInbox.entries.length,5);
    for (const key of ['taken','srs','revlog','stats','lists']) assert.deepEqual(final.record[key],restored.record[key]);
    result.observations.push({ syntheticFaults:['native quota + restart','late record commit preserves newer transcript draft','late file read cannot replace newer text'], native, fullJourneyAccepted:false });
    assert.deepEqual(result.errors,[]);assert.deepEqual(result.externalRequests,[]);result.passed=true;
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
  scope: 'Persistent timed-transcript import subjourneys with original synthetic UTF-8 files and pasted subtitles, exact caption anchors, native quota/late commit/file-read faults, ordinary UI backup/restore and offline source return. No live caption retrieval/playback, external provider/teacher quality, physical-device or full learner/trial acceptance.' };
writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2));
if (receipt.passed !== receipt.total) process.exitCode = 1;
