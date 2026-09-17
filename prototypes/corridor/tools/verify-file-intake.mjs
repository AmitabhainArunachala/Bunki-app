/** Persistent normal-control file intake checks. Native chooser and viewer are explicit fixtures; the compiled Vision/PDFKit helper processes real synthetic file bytes. No native GUI or full learner acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { createServer as createHTTPServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
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
assert([undefined, 'ios'].includes(process.env.KAIRO_FILE_BRIDGE), 'Unsupported host bridge mode');
const iosBridge = process.env.KAIRO_FILE_BRIDGE === 'ios';
const hostBridgePath = new URL('../../../apps/kairo-ios/App/HostBridge.js', import.meta.url);
const hostBridge = iosBridge ? readFileSync(hostBridgePath, 'utf8') : null;
const engines = process.env.KAIRO_BROWSER ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const sizes = process.env.KAIRO_FILE_VIEWPORT === 'desktop' ? [1440] : process.env.KAIRO_FILE_VIEWPORT === 'mobile' ? [390] : [1440, 390];
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
let disconnected = false;
const serve = (request, response) => {
  if (disconnected) { request.socket.destroy(); return; }
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    assert(file.startsWith(`${SITE}/`) && statSync(file).isFile());
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
};
let server;
if (iosBridge) server = createHTTPServer(serve);
else {
  const certificate = join(OUT, 'synthetic-localhost-cert.pem'), privateKey = join(OUT, 'synthetic-localhost-key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', privateKey, '-out', certificate,
    '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  server = createServer({ key: readFileSync(privateKey), cert: readFileSync(certificate) }, serve);
  rmSync(privateKey); rmSync(certificate);
}
await new Promise((done, reject) => { server.once('error', reject); server.listen(iosBridge ? 43187 : 0, '127.0.0.1', done); });
const ORIGIN = iosBridge ? 'http://localhost:43187' : `https://127.0.0.1:${server.address().port}`;
const results = [], startedAt = new Date().toISOString();
function noReviewChange(before, after) {
  for (const key of ['taken', 'srs', 'revlog', 'stats', 'lists']) assert.deepEqual(after.record[key], before.record[key], `${key} remains unchanged by capture/lookup/context`);
}
async function ready(page) {
  await page.waitForFunction(() => document.body?.dataset.ready === '1', null, { timeout: 30000 });
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
  await inbox(page); await page.locator(`[data-source-capture="${id}"]`).click(); await page.locator('#file-open-original').waitFor();
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
const HELPER = process.env.KAIRO_TEXT_INTAKE_HELPER, FIXTURES = process.env.KAIRO_FILE_FIXTURES;
assert(isAbsolute(HELPER || '') && isAbsolute(FIXTURES || ''), 'Supply the compiled native helper and synthetic fixture directory');
const helperSha256 = hash(readFileSync(HELPER));
const require = createRequire(import.meta.url), { createNativeIntake, launchNativeText } = require('../../bunki-desktop/lib/native-intake.cjs');
const contracts = await import(new URL(`file://${SITE}/modules/reading-core.mjs`));
const pdf = join(FIXTURES, 'synthetic-two-pages.pdf'), image = join(FIXTURES, 'synthetic-japanese.png');
const FIRST = '町の図書館で、本を読みます。\n明日は友達と日本語を話します。', SECOND = '二ページ目の文章です。\n出典のページ番号も残します。';
const CORRECTED = FIRST + '\n自分で確認して追記した文章。', BODY = CORRECTED + '\n\n' + SECOND;
const QUESTION = 'この町の文で、助詞の使い方を確かめたい。';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
for (const engine of engines) for (const width of sizes) {
  const name = `${engine}-${width}`, out = join(OUT, name); mkdirSync(out, { recursive: true });
  const result = { name, engine, width, passed: false, observations: [], screenshots: [], videos: [], errors: [], externalRequests: [], nativeCalls: [], viewerFixtures: [] };
  results.push(result); let context, page, service, episode = 0, profile = 'profile', generation = 0, chosenFile = pdf, extractionHold = null, holdEntered = null;
  const open = async () => {
    const videos = join(out, `video-${++episode}`); mkdirSync(videos, { recursive: true }); generation++;
    service = createNativeIntake({ executable: HELPER, contracts: () => contracts, canChoose: () => true,
      captureDocument: () => { const owner = generation; return { window: {}, assertCurrent: () => owner === generation }; },
      dialog: { showOpenDialog: async () => ({ canceled: chosenFile === null, filePaths: chosenFile ? [chosenFile] : [] }) },
      cacheDirectory: join(out, 'viewer-copies'), openPath: async destination => {
        const bytes = readFileSync(destination); result.viewerFixtures.push({ name: destination.split('/').at(-1), sha256: hash(bytes), bytes: bytes.length, nativeViewerLaunched: false }); return '';
      }, run: async request => {
        const reply = await launchNativeText(request);
        result.nativeCalls.push({ method: request.request.method, name: request.request.name, status: reply.status,
          replySha256: hash(JSON.stringify(reply)), ...(reply.status === 'failed' ? { code: reply.code } : {}) });
        if (request.request.method === 'extract' && extractionHold) { holdEntered.resolve(); await extractionHold.promise; }
        return reply;
      } });
    context = await ({ chromium, webkit }[engine]).launchPersistentContext(join(out, profile), {
      headless: true, viewport: { width, height: width === 390 ? 844 : 1050 }, locale: 'en-US',
      serviceWorkers: 'allow', acceptDownloads: true, ignoreHTTPSErrors: true,
      ...(engine === 'chromium' ? { args: ['--ignore-certificate-errors'] } : {}), recordVideo: { dir: videos, size: { width, height: width === 390 ? 844 : 1050 } },
    });
    result.browserVersion = context.browser()?.version();
    await context.route('**/*', route => {
      const url = new URL(route.request().url()); if (url.origin === ORIGIN) return route.continue();
      result.externalRequests.push({ origin: url.origin, pathname: url.pathname }); return route.abort();
    });
    await context.exposeBinding('__nativeFileIntakeFixture', (_source, method, input) => {
      assert(['available', 'choose', 'extract', 'openOriginal'].includes(method)); return service[method](input);
    });
    if (iosBridge) {
      // Actual unmodified iOS page bridge at its required origin. Native WK UI
      // remains a fixture; the existing desktop adapter owns synthetic bytes.
      await context.addInitScript({ content: `
        window.webkit = { messageHandlers: {
          kairoIntake: { postMessage: ({method, ...args}) => window.__nativeFileIntakeFixture(method, args) },
          kairoSync: { postMessage: async ({method}) => method === 'initialScope' ? null : method === 'register'
            ? {registrationId:'synthetic-ios-registration'} : {state:'unavailable',code:'configuration-unavailable'} },
          kairoFiles: { postMessage: async ({filename,mimeType,text}) => {
            const href = URL.createObjectURL(new Blob([text], {type:mimeType}));
            const anchor = document.createElement('a'); anchor.href=href; anchor.download=filename;
            document.body.append(anchor); anchor.click(); anchor.remove();
            setTimeout(() => URL.revokeObjectURL(href), 1000); return true;
          } }
        } };
        ${hostBridge}
      ` });
    } else {
      await context.addInitScript(() => Object.defineProperty(window, 'kairoIntake', { value: Object.freeze({
        available: () => window.__nativeFileIntakeFixture('available'), choose: input => window.__nativeFileIntakeFixture('choose', input),
        extract: input => window.__nativeFileIntakeFixture('extract', input), openOriginal: input => window.__nativeFileIntakeFixture('openOriginal', input),
      }) }));
    }
    page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => result.errors.push({ episode, message: error.message }));
  };
  const close = async () => {
    if (!context) return;
    extractionHold?.resolve(); extractionHold = null; holdEntered = null;
    await page.evaluate(() => window.__listeningCommitHold?.disarm()).catch(() => undefined);
    const videos = context.pages().map(p => p.video()); await context.close(); context = null; generation++; await service.dispose();
    for (const video of videos) if (video) result.videos.push(await video.path());
  };
  const screenshot = async (label, focus = null) => {
    if (focus) await page.locator(focus).scrollIntoViewIfNeeded(); await page.evaluate(() => document.fonts.ready);
    const file = join(out, label + '.png'); await page.screenshot({ path: file }); result.screenshots.push({ label, path: file, sha256: hash(readFileSync(file)) });
  };
  const choose = async (filename) => {
    chosenFile = filename; if (!await page.locator('#file-capture-panel').evaluate(node => node.open)) await page.locator('#file-capture-panel > summary').click();
    await page.waitForFunction(() => document.querySelector('#file-choose')?.disabled === false);
    await page.locator('#file-choose').click(); await page.locator('#file-capture-title').waitFor();
    await page.waitForFunction(() => document.querySelector('#file-extract')?.disabled === false);
  };
  const extract = async () => { await page.locator('#file-extract').click(); await page.locator('[data-file-page-text="1"]').waitFor();
    await page.waitForFunction(() => document.querySelector('#file-keep-text')?.disabled === false); };
  try {
    await open(); await frontDoor(page); const initial = await readAppRecordSnapshot(page);
    await choose(pdf); await screenshot('file-reference-before-extraction', '#file-capture-title');
    await page.locator('#file-keep-reference').click(); await page.locator('#file-open-original').waitFor();
    const pointer = await readAppRecordSnapshot(page), parent = pointer.record.sourceInbox.files[0].captureId;
    assert.equal(pointer.record.sourceInbox.entries[0].candidate.article.body, null); assert.equal(pointer.record.sourceInbox.entries[0].encounterUrl, null);
    assert.equal(pointer.record.sourceInbox.files[0].file.sha256, hash(readFileSync(pdf))); noReviewChange(initial, pointer);
    await choose(pdf); await extract(); assert.equal(await page.locator('[data-file-page-text="1"]').inputValue(), FIRST);
    assert.equal(await page.locator('[data-file-page-text="2"]').inputValue(), SECOND);
    await page.locator('[data-file-page-text="1"]').fill(CORRECTED); await screenshot('review-and-correct-pages', '[data-file-page-text="1"]');
    assert.deepEqual((await readAppRecordSnapshot(page)).record.sourceInbox, pointer.record.sourceInbox);
    await close(); await open(); await frontDoor(page); await openSource(page, parent);
    assert.equal(await page.locator('[data-file-page-text="1"]').inputValue(), CORRECTED); assert.equal(await page.locator('#file-extract').isDisabled(), true);
    await page.locator('#file-keep-text').click(); await page.locator('#source-reader-body').waitFor(); assert.equal(await page.locator('#source-reader-body').textContent(), BODY);
    const saved = await readAppRecordSnapshot(page), link = saved.record.sourceInbox.files.find(entry => entry.sourceId === parent), id = link.captureId;
    assert.equal(link.document.observation.pages[0].text, FIRST); assert.equal(link.document.pages[0].changed, true); assert.deepEqual(link.document.pages[0].regions, []);
    assert(link.document.pages[1].regions.length > 0); noReviewChange(initial, saved);
    chosenFile = image; await page.locator('#file-open-original').click(); await page.waitForFunction(() => document.querySelector('#file-original-status')?.textContent.includes('differs'));
    chosenFile = pdf; await page.locator('#file-open-original').click(); await page.waitForFunction(() => document.querySelector('#file-original-status')?.textContent.includes('matching read-only copy'));
    assert.equal(result.viewerFixtures.length, 1); assert.equal(result.viewerFixtures[0].sha256, hash(readFileSync(pdf)));
    await page.locator('#file-source-extraction > summary').click(); await page.locator('[data-file-page="2"]').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#source-context-return').textContent(), SECOND); assert.equal(await page.locator('#file-original-pages').textContent(), 'Page 2');
    await screenshot('exact-original-page-return', '#source-context-return');
    await selectWord(page); assert((await page.locator('#source-selection-time').textContent()).includes('Page 1'));
    await page.locator('#source-selection-lookup').click(); await page.locator('.nav-search-row').first().click(); await page.locator('#sheet-take').click();
    await waitForAppRecord(page, record => record.taken.length === 1);
    const learned = await readAppRecordSnapshot(page), item = learned.record.taken[0], topic = learned.record.teacherContexts.entries.find(entry => entry.id === item.sourceContextRef);
    assert.equal(item.id, '町'); assert.equal(topic.sourceId, id); assert.equal(topic.sourceDigest, link.document.bodySha256); assert.equal(BODY.slice(topic.start, topic.end), topic.quote);
    await page.locator('#sheet .learning-source summary').click(); await page.locator('#learning-source-return').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#file-original-pages').textContent(), 'Page 1');
    await page.locator('#source-reader-back').click(); await page.locator('#sheet .teacher-discuss').click();
    await page.locator('#chat-input').fill(QUESTION); await waitForAppRecord(page, record => record.teacherDrafts?.entries.some(entry => entry.text === QUESTION && !entry.consumed));
    assert.equal(await page.locator('#chat-send').isDisabled(), true); await page.locator('#teacher-source-return').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#file-original-pages').textContent(), 'Page 1'); await screenshot('lookup-learning-and-tutor-context', '#source-context-return');
    await inbox(page); await choose(image); await extract(); assert.equal(await page.locator('[data-file-page-text="1"]').inputValue(), FIRST);
    await page.locator('#file-keep-text').click(); await page.locator('#source-reader-body').waitFor();
    const withImage = await readAppRecordSnapshot(page), imageLink = withImage.record.sourceInbox.files.find(entry => entry.file.kind === 'image');
    assert.equal(imageLink.document.observation.pages[0].provider, 'apple-vision'); assert(imageLink.document.pages[0].regions.length > 0);
    assert.equal(withImage.record.taken.length, 1); assert.equal(withImage.record.sourceInbox.entries.length, 3);
    await lists(page); const download = page.waitForEvent('download'); await page.locator('#export-store').click(); const backup = join(out, 'ordinary-ui-backup.json');
    await (await download).saveAs(backup); assert.deepEqual(JSON.parse(readFileSync(backup)).record.sourceInbox, withImage.record.sourceInbox);
    await close(); profile = 'restored-profile'; await open(); await frontDoor(page); await lists(page);
    const imported = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame(), timeout: 30000 });
    await page.locator('#import-file').setInputFiles(backup); await imported; await ready(page); await inbox(page);
    const restored = await readAppRecordSnapshot(page); assert.deepEqual(restored.record.sourceInbox, withImage.record.sourceInbox);
    await openSource(page, parent);
    if (iosBridge) {
      // Native offline use keeps the bundled loopback server alive. All
      // external requests are already refused by this profile's route above.
      // index.html deliberately registers service workers only over HTTPS.
      assert.equal(await page.evaluate(() => location.origin), 'http://localhost:43187');
      assert.equal(await page.evaluate(() => !!navigator.serviceWorker?.controller), false);
      result.offline = { kind: 'native-loopback-fixture', externalRequests: 'blocked throughout profile',
        localServer: 'available', serviceWorker: false, physicalNetworkChange: false };
    } else {
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      if (engine === 'webkit') disconnected = true; else await context.setOffline(true);
      result.offline = { kind: 'browser-service-worker', localServer: 'disconnected', physicalNetworkChange: false };
    }
    await page.reload(); await ready(page); await inbox(page); await openSource(page, parent);
    await page.locator(`[data-file-reading="${id}"]`).click(); await page.locator('#source-reader-body').waitFor(); assert.equal(await page.locator('#source-reader-body').textContent(), BODY);
    await page.locator('#file-source-extraction > summary').click(); await page.locator('[data-file-page="2"]').click(); await page.locator('#source-context-return').waitFor();
    assert.equal(await page.locator('#file-original-pages').textContent(), 'Page 2'); await screenshot('offline-restored-page-and-text', '#source-context-return');
    disconnected = false; await context.setOffline(false);
    result.observations.push({ ordinaryFlow: 'PDF pointer → native extraction → page correction/restart/save → exact page/original byte match → lookup/explicit learning/local tutor draft/return → image OCR → UI backup/fresh restore/offline page return', parent, id, imageId: imageLink.captureId, topic, backup, fullJourneyAccepted: false });

    await inbox(page); await choose(image); await extract(); const failedText = '保存が遅れた画像の文章。'; await page.locator('[data-file-page-text="1"]').fill(failedText);
    const beforeFault = await readAppRecordSnapshot(page); await armRecordWriteFailure(page, 'quota', { roots: ['sourceInbox'] }); await page.locator('#file-keep-text').click();
    await page.waitForFunction(() => document.querySelector('#file-capture-status')?.textContent.includes('has not been saved'));
    assert.deepEqual((await readAppRecordSnapshot(page)).record.sourceInbox, beforeFault.record.sourceInbox); await clearRecordWriteFailure(page);
    await close(); await open(); await frontDoor(page); assert.equal(await page.locator('[data-file-page-text="1"]').inputValue(), failedText);
    await holdExcerptCommit(page, failedText); await page.locator('#file-keep-text').click(); await page.waitForFunction(() => window.__listeningCommitHold?.fired === 1);
    const newerText = '後から直した文章は消えない。'; await page.locator('[data-file-page-text="1"]').fill(newerText); const nativeCommit = await releaseExcerptCommit(page);
    await page.waitForFunction(() => document.querySelector('#file-keep-text')?.disabled === false); assert.equal(await page.locator('[data-file-page-text="1"]').inputValue(), newerText);
    assert((await readAppRecordSnapshot(page)).record.sourceInbox.entries.some(entry => entry.candidate.article.body?.text === failedText));
    assert.equal(await page.locator('#source-inbox-kept').textContent(), 'Kept sources · 3');
    assert.equal(await page.locator('[data-source-capture]').count(), 3);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'file-page-text-1');
    await screenshot('newer-correction-survives-late-save', '[data-file-page-text="1"]'); await page.locator('#file-keep-text').click(); await page.locator('#source-reader-body').waitFor();
    assert.equal(await page.locator('#source-reader-body').textContent(), newerText);
    await inbox(page); await choose(image); await extract(); extractionHold = deferred(); holdEntered = deferred();
    await page.locator('#file-extract').click(); await holdEntered.promise; const lastText = '抽出を待つ間に、自分で直した文章。';
    await page.locator('[data-file-page-text="1"]').fill(lastText); extractionHold.resolve();
    await page.waitForFunction(() => document.querySelector('#file-extract')?.disabled === false);
    assert.equal(await page.locator('[data-file-page-text="1"]').inputValue(), lastText);
    assert(!(await page.locator('#file-capture-status').textContent()).includes('Extracting'));
    await screenshot('late-extraction-preserves-correction', '[data-file-page-text="1"]'); extractionHold = null; holdEntered = null;
    await page.locator('#file-clear-draft').click(); await choose(pdf);
    await page.locator('#file-first-page').fill('1'); await page.locator('#file-last-page').fill('1');
    extractionHold = deferred(); holdEntered = deferred(); await page.locator('#file-extract').click(); await holdEntered.promise;
    await page.locator('#file-first-page').fill('2'); await page.locator('#file-last-page').fill('2'); extractionHold.resolve();
    await page.waitForFunction(() => document.querySelector('#file-extract')?.disabled === false);
    assert.equal(await page.locator('#file-first-page').inputValue(), '2'); assert.equal(await page.locator('#file-last-page').inputValue(), '2');
    assert.equal(await page.locator('[data-file-page-text]').count(), 0); extractionHold = null; holdEntered = null;
    const final = await readAppRecordSnapshot(page); assert.equal(final.record.sourceInbox.entries.length, 5);
    for (const key of ['taken', 'srs', 'revlog', 'stats', 'lists']) assert.deepEqual(final.record[key], restored.record[key]);
    result.observations.push({ syntheticFaults: ['native quota/restart', 'late real record commit/newer correction', 'late native extraction/newer correction'], nativeCommit, fullJourneyAccepted: false });
    assert.deepEqual(result.errors, []); assert.deepEqual(result.externalRequests, []); result.passed = true;
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack };
    try { await screenshot('failure'); result.visibleFailure = await page.locator('body').innerText(); } catch { /* Preserve original failure. */ }
  } finally { disconnected = false; await close(); }
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2)); process.stdout.write(`${name}: ${result.passed ? 'passed' : result.failure.message}\n`);
}
await new Promise(done => server.close(done));
assert.equal(hash(readFileSync(new URL(import.meta.url))), verifierSha256, 'Verifier changed while running');
assert.equal(hash(readFileSync(HELPER)), helperSha256, 'Native executable changed while running');
if (iosBridge) assert.equal(readFileSync(hostBridgePath, 'utf8'), hostBridge, 'iOS bridge changed while running');
const receipt = { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), site: SITE, artifactSha256: manifest.artifactSha256, verifierSha256,
  bridge: iosBridge ? { kind: 'actual-ios-page-script', source: hostBridgePath.pathname, sha256: hash(hostBridge), origin: ORIGIN,
    nativeBackend: 'desktop fixture adapter; UIKit picker/preview and sync/export are simulated' } : { kind: 'direct-native-fixture' },
  nativeHelper: { path: HELPER, sha256: helperSha256 }, fixtures: [pdf, image].map(path => ({ path, sha256: hash(readFileSync(path)) })),
  results, passed: results.filter(result => result.passed).length, total: results.length,
  scope: 'Persistent local file-intake subjourneys with real compiled Vision/PDFKit extraction on synthetic files. Native chooser/viewer IPC fixtures and headless browser controls; no native GUI, provider teaching quality, physical-device or full learner/trial acceptance.' };
writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2)); if (receipt.passed !== receipt.total) process.exitCode = 1;
