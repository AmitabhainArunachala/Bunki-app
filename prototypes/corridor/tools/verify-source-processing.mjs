/** Source approval through ordinary controls in fresh persistent profiles.
 * Provider replies and separate native-storage/lifecycle failures are synthetic.
 * No actual provider endpoint is contacted and no learner record is seeded. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';

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
const sizes = process.env.KAIRO_SOURCE_VIEWPORT === 'desktop' ? [1440] : process.env.KAIRO_SOURCE_VIEWPORT === 'mobile' ? [390] : [1440, 390];
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
let disconnected = false;
const certificate = join(OUT, 'synthetic-localhost-cert.pem'), privateKey = join(OUT, 'synthetic-localhost-key.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', privateKey, '-out', certificate,
  '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const tls = { key: readFileSync(privateKey), cert: readFileSync(certificate) };
let syntheticResponder = null;
const providerServer = createServer(tls, (request, response) => {
  if (!syntheticResponder) { response.writeHead(503).end(); return; }
  void syntheticResponder(request, response).catch(() => { if (!response.destroyed) response.writeHead(500).end(); });
});
const server = createServer(tls, (request, response) => {
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
await new Promise((done) => providerServer.listen(0, '127.0.0.1', done));
const FAKE_ORIGIN = `https://127.0.0.1:${providerServer.address().port}`;
const TEXT = '  今日は宇宙の本を読んだ。🚀\n\n雨がやんだので、歩いて出かけた。町の図書館に着くと、窓の近くに席があった。\nそこで友達と会い、次に読む本を選んだ。 e\u0301  ';
const ENCOUNTER_URL = 'https://example.org/learner-supplied-reading?t=73#paragraph-2';
const QUESTION = '  「町」は、この文章ではどんな意味ですか。🚀\n「図書館」と一緒に使う文も作りたい。  ';
const results = [], startedAt = new Date().toISOString();
function noReviewChange(before, after) {
  for (const key of ['taken', 'srs', 'revlog', 'stats', 'lists']) assert.deepEqual(after.record[key], before.record[key], `${key} remains unchanged by capture/lookup/context`);
}
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  assert.equal(await page.locator('#store-alert').isVisible(), false);
}
// Source returns preserve their Tutor/dictionary origin. Walk the visible Back
// controls to the shelf instead of assuming that every room has galaxy chrome.
async function shelf(page) {
  const visited = [];
  for (let step = 0; step < 12; step += 1) {
    const view = await page.locator('body').getAttribute('data-view');
    visited.push(view);
    if (await page.locator('#sheet-close').isVisible()) {
      await page.locator('#sheet-close').click();
      continue;
    }
    if (view === 'shelf') {
      await page.locator('#source-inbox-link').waitFor();
      return;
    }
    if (await page.locator('#ginga-symbol').isVisible()) {
      await page.locator('#ginga-symbol').click();
      await page.locator('.bubble-shelf').click();
      await page.waitForFunction(() => document.body.dataset.view === 'shelf');
      continue;
    }
    assert(await page.locator('#back').isVisible() && await page.locator('#back').isEnabled(),
      `No visible shelf return from ${view}; route: ${visited.join(' → ')}`);
    await page.locator('#back').click();
    await page.waitForFunction((prior) => document.body.dataset.view !== prior || !!document.querySelector('#sheet-close'), view);
  }
  assert.fail(`Shelf return exceeded its bounded visible route: ${visited.join(' → ')}`);
}
async function inbox(page) {
  if (await page.locator('body').getAttribute('data-view') !== 'source-inbox' || await page.locator('#sheet-close').isVisible()) {
    await shelf(page);
    await page.locator('#source-inbox-link').click();
  }
  await page.locator('#source-capture-save').waitFor();
}
async function frontDoor(page) {
  await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
  await inbox(page);
  await page.locator('#source-capture-text').waitFor();
}
async function assertSourceReadable(page) {
  // Inspect the generated texture actually painted beneath the text, not just
  // the nominal CSS ground: an obsolete dark paper can obscure a light view.
  await page.evaluate(() => new Promise((done) => {
    if (window.requestIdleCallback) window.requestIdleCallback(() => requestAnimationFrame(done), { timeout: 1000 });
    else setTimeout(() => requestAnimationFrame(done), 100);
  }));
  const rendered = await page.evaluate(async () => {
    const paper = getComputedStyle(document.body, '::before');
    const body = getComputedStyle(document.body), text = getComputedStyle(document.querySelector('#source-reader-body'));
    const rgb = (value) => value.match(/[\d.]+/gu).slice(0, 3).map(Number);
    let pixel = [...rgb(body.backgroundColor), 255];
    if (paper.backgroundImage !== 'none') {
      const source = paper.backgroundImage.slice(4, -1).replace(/^['"]|['"]$/gu, '');
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
      const draw = canvas.getContext('2d'); draw.drawImage(image, 0, 0, 1, 1);
      pixel = [...draw.getImageData(0, 0, 1, 1).data];
    }
    const alpha = Number(paper.opacity) * pixel[3] / 255, ground = rgb(body.backgroundColor);
    const background = ground.map((channel, index) => channel * (1 - alpha) + pixel[index] * alpha);
    const luminance = (color) => color.map((c) => c / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
      .reduce((sum, c, index) => sum + c * [.2126, .7152, .0722][index], 0);
    const a = luminance(rgb(text.color)), b = luminance(background);
    return { text: text.color, nominalGround: body.backgroundColor, paperPixel: pixel,
      paperOpacity: paper.opacity, texturePresent: paper.backgroundImage !== 'none', background, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
  });
  assert(rendered.contrast >= 4.5, `Saved-source text contrast is ${rendered.contrast.toFixed(2)}:1 against its actual paper`);
  return rendered;
}
async function openLists(page) {
  await shelf(page); await page.locator('#tray').click();
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
const FAKE_MODEL = 'synthetic-source-tutor';
const FAKE_KEY = 'synthetic-fixture-credential-not-a-real-key';
async function tutor(page) {
  if (await page.locator('#chat-input').isVisible()) return;
  await shelf(page);
  await page.locator('#ai-link').click(); await page.locator('#chat-input').waitFor();
}
async function configure(page, model = FAKE_MODEL) {
  await page.locator('#ai-base-url').fill(FAKE_ORIGIN); await page.locator('#ai-model-input').fill(model);
  await page.locator('#ai-key-input').fill(FAKE_KEY); await page.locator('#ai-key-save').click();
  await page.locator('#chat-input').waitFor();
}
async function settledQuestion(page, text) {
  await page.locator('#chat-input').fill(text);
  await waitForAppRecord(page, (record) => record.teacherDrafts?.entries.some((entry) => !entry.consumed && entry.text === text));
}
async function allow(page) {
  await page.locator('#source-processing-allow').click();
  await page.waitForFunction(() => document.querySelector('#teacher-source-approval')?.dataset.state === 'approved');
  await page.waitForFunction(() => document.querySelector('#chat-send')?.disabled === false);
}
async function idleChat(page) { await page.locator('.chat-turn.thinking').waitFor({ state: 'hidden' }); }
async function deviceApprovals(page) {
  return page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('kairo-source-processing-v1:'))));
}
/** Keep a real native transaction open after its actual puts. No app promise,
 * reducer or ownership predicate is replaced; release allows native commit. */
async function holdArchive(page, question, mining = false) {
  const { installation } = await readAppRecordSnapshot(page);
  await page.evaluate(({ question, mining, databaseName }) => {
    if (window.__sourceApprovalHold) throw new Error('An approval fault is already armed');
    const original = IDBObjectStore.prototype.put, matched = new WeakSet();
    const fault = { fired: 0, released: false, completed: false };
    const keepalive = (tx) => {
      if (fault.released) return;
      tx.objectStore('kairo_replication_rows').get('synthetic-source-approval-keepalive').onsuccess = () => keepalive(tx);
    };
    IDBObjectStore.prototype.put = function (...args) {
      const request = original.apply(this, args), row = args[0];
      if (fault.fired || this.transaction.db.name !== databaseName || this.name !== 'kairo_replication_rows' || row?.kind !== 'document') return request;
      const document = JSON.parse(row.text);
      if (mining === 'draft'
        ? document.collection === 'learner-record' && document.value.teacherDrafts?.entries.some((draft) => draft.text === question && !draft.consumed)
        : document.collection === 'learner-archive' && document.value.turns?.some((turn) =>
          turn.surface === (mining ? 'mine' : 'chat') && turn.role === 'user' &&
          (mining ? turn.content.includes(question) : turn.content === question.trim()))) matched.add(this.transaction);
      if (matched.has(this.transaction) && document.collection === 'kairo:record-host-commands') {
        fault.fired++; keepalive(this.transaction);
        this.transaction.addEventListener('complete', () => { fault.completed = true; });
      }
      return request;
    };
    fault.release = () => { fault.released = true; };
    fault.disarm = () => { fault.release(); IDBObjectStore.prototype.put = original; };
    window.__sourceApprovalHold = fault;
  }, { question, mining, databaseName: installation.databaseName });
}
async function releaseArchive(page) {
  await page.evaluate(() => window.__sourceApprovalHold.release());
  await page.waitForFunction(() => window.__sourceApprovalHold?.completed);
  const result = await page.evaluate(() => {
    const fault = window.__sourceApprovalHold; fault.disarm(); delete window.__sourceApprovalHold;
    return { fired: fault.fired, completed: fault.completed, released: fault.released };
  });
  assert.equal(result.fired, 1); return result;
}

for (const engine of engines) for (const width of sizes) {
  const name = `${engine}-${width}`, out = join(OUT, name); mkdirSync(out, { recursive: true });
  const result = { name, engine, width, passed: false, observations: [], screenshots: [], videos: [], errors: [], externalRequests: [],
    syntheticPrimary: [], syntheticMining: [], abortedProviderRequests: [], cancelledProviderResponses: [] };
  results.push(result);
  let context, page, episode = 0, profileName = 'profile', pendingReply = null;
  const plans = [];
  const plan = (question, reply, held = false) => {
    let release; const gate = new Promise((done) => { release = done; });
    const value = { question, reply, gate, release, captured: false }; plans.push(value); pendingReply = value;
    if (!held) release(); return value;
  };
  const open = async () => {
    const videos = join(out, `video-${++episode}`); mkdirSync(videos, { recursive: true });
    context = await ({ chromium, webkit }[engine]).launchPersistentContext(join(out, profileName), {
      headless: true, viewport: { width, height: width === 390 ? 844 : 1050 }, locale: 'en-US', serviceWorkers: 'allow',
      acceptDownloads: true, ignoreHTTPSErrors: true, ...(engine === 'chromium' ? { args: ['--ignore-certificate-errors'] } : {}),
      recordVideo: { dir: videos, size: { width, height: width === 390 ? 844 : 1050 } },
    });
    result.browserVersion = context.browser()?.version();
    // A separate loopback HTTPS server exercises real CORS/abort behavior,
    // including WebKit requests controlled by the installed service worker.
    syntheticResponder = async (request, response) => {
      const url = new URL(request.url, FAKE_ORIGIN);
      if (url.pathname !== '/v1/messages' || !['POST', 'OPTIONS'].includes(request.method)) { response.writeHead(404).end(); return; }
      const headers = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-methods': 'POST,OPTIONS',
        'access-control-allow-headers': 'content-type,x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access',
        'content-type': 'application/json' };
      if (request.method === 'OPTIONS') { response.writeHead(204, headers).end(); return; }
      let bytes = 0; const chunks = [];
      for await (const chunk of request) {
        bytes += chunk.length; if (bytes > 2000000) { response.writeHead(413).end(); return; } chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (request.headers['x-api-key'] !== FAKE_KEY || !body.model?.startsWith(FAKE_MODEL)) {
        result.errors.push({ episode, message: 'Unexpected synthetic provider request shape' }); response.writeHead(400, headers).end(); return;
      }
      if (body.system.includes('observations about the LEARNER')) {
        result.syntheticMining.push({ origin: FAKE_ORIGIN, body });
        response.writeHead(200, headers).end(JSON.stringify({ content: [{ type: 'text', text: '[]' }] })); return;
      }
      const expected = plans.shift();
      if (!expected || body.messages.at(-1).content !== expected.question.trim()) {
        result.syntheticPrimary.push({ origin: FAKE_ORIGIN, body, unexpected: true }); response.writeHead(503, headers).end(); return;
      }
      response.on('close', () => { if (!response.writableEnded) result.cancelledProviderResponses.push({ question: expected.question, method: request.method }); });
      result.syntheticPrimary.push({ origin: FAKE_ORIGIN, body, reply: expected.reply }); expected.captured = true;
      await expected.gate;
      if (!response.destroyed) response.writeHead(200, headers).end(JSON.stringify({ content: [{ type: 'text', text: expected.reply }], model: body.model }));
    };
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === ORIGIN || url.origin === FAKE_ORIGIN) return route.continue();
      return route.abort();
    });
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) && ![ORIGIN, FAKE_ORIGIN].includes(url.origin))
        result.externalRequests.push({ origin: url.origin, pathname: url.pathname });
    });
    page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => result.errors.push({ episode, message: error.message }));
    page.on('requestfailed', (request) => {
      if (new URL(request.url()).origin === FAKE_ORIGIN)
        result.abortedProviderRequests.push({ failure: request.failure()?.errorText, method: request.method() });
    });
  };
  const close = async () => {
    if (!context) return;
    pendingReply?.release();
    await page.evaluate(() => window.__sourceApprovalHold?.disarm()).catch(() => undefined);
    const videos = context.pages().map((page) => page.video()); await context.close(); context = null;
    for (const video of videos) if (video) result.videos.push(await video.path());
  };
  const screenshot = async (label) => {
    await page.evaluate(() => document.fonts.ready);
    const file = join(out, `${label}.png`); await page.screenshot({ path: file, fullPage: false });
    result.screenshots.push({ label, path: file, sha256: hash(readFileSync(file)) });
  };
  try {
    await open(); await frontDoor(page);
    const before = await readAppRecordSnapshot(page);
    await page.locator('#source-capture-title').fill('図書館で見つけた本');
    await page.locator('#source-capture-url').fill(ENCOUNTER_URL); await page.locator('#source-capture-text').fill(TEXT);
    await page.locator('#source-capture-save').click(); await page.locator('#source-reader-body').waitFor();
    await selectWord(page); await page.locator('#source-selection-lookup').click();
    await page.locator('.nav-search-row').first().click(); await page.locator('#sheet .teacher-discuss').click();
    await settledQuestion(page, QUESTION); await configure(page);
    const neutral = await readAppRecordSnapshot(page), topic = neutral.record.teacherContexts.entries.find((t) => t.id === neutral.record.teacherContexts.activeRef);
    noReviewChange(before, neutral); assert.equal(topic.target.id, '町'); assert.equal(topic.sourceKind, 'personal-reading');
    assert.equal(await page.locator('#chat-send').isDisabled(), true);
    if (process.env.KAIRO_EXPECT_APPROVAL_MISSING === '1') {
      assert.equal(await page.locator('#source-processing-allow').count(), 0);
      await page.locator('#teacher-target-open').click(); await page.locator('#sheet-take').waitFor();
      assert.equal(await page.locator('#sheet .teacher-discuss').count(), 0);
      result.observations.push({ baseline: 'R20 has no pasted-source approval and the tutor target door drops source context', sourceId: topic.sourceId });
      await screenshot('baseline-missing-context-and-approval');
    } else {
      await page.locator('#source-processing-allow').scrollIntoViewIfNeeded(); await screenshot('approval-preview');
      const preview = await page.locator('#teacher-source-approval').innerText();
      assert(preview.includes(FAKE_ORIGIN)); assert(preview.includes(FAKE_MODEL)); assert(preview.includes('learning observations'));
      const approvalRect = await page.locator('#source-processing-allow').boundingBox(); assert(approvalRect.height >= 44 && approvalRect.width >= 44);
      const recordBeforeApproval = await readAppRecordSnapshot(page); await allow(page);
      assert.deepEqual(await readAppRecordSnapshot(page), recordBeforeApproval, 'Device approval does not alter the learner record or archive');
      assert.equal(result.syntheticPrimary.length, 0); assert.equal(result.syntheticMining.length, 0);
      const granted = await deviceApprovals(page); assert.equal(Object.keys(granted).length, 1);
      await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page); await tutor(page);
      assert.deepEqual(await deviceApprovals(page), granted); assert.equal(await page.locator('#chat-input').inputValue(), QUESTION);
      await page.waitForFunction(() => document.querySelector('#chat-send')?.disabled === false);
      plan(QUESTION, 'Synthetic teaching fixture: 町 means town here. This is not a live teaching-quality result.');
      await page.locator('#chat-send').click(); await idleChat(page);
      await waitForAppRecord(page, (record) => record.teacherDrafts.entries.some((d) => d.contextRef === topic.id && d.consumed));
      await page.waitForFunction(() => document.querySelector('#chat-input')?.value === '');
      // Wait for the real archive completion, not merely a synthetic route call.
      const deadline = Date.now() + 10000;
      while ((await readAppRecordSnapshot(page)).archive.turns.filter((t) => t.surface === 'mine' && t.role === 'assistant').length < 1) {
        assert(Date.now() < deadline, 'Synthetic observation pass completes'); await new Promise((done) => setTimeout(done, 25));
      }
      assert.equal(result.syntheticPrimary.length, 1); assert.equal(result.syntheticMining.length, 1);
      const outbound = result.syntheticPrimary[0].body;
      assert(outbound.system.includes(JSON.stringify(topic.quote))); assert(!outbound.system.includes(TEXT));
      assert.equal(outbound.messages.at(-1).content, QUESTION.trim());
      assert(result.syntheticMining[0].body.messages[0].content.includes(QUESTION.trim()));
      assert(result.syntheticMining[0].body.messages[0].content.includes(result.syntheticPrimary[0].reply));
      await screenshot('synthetic-contextual-reply');
      await page.locator('#teacher-target-open').click(); await page.locator('#sheet .teacher-discuss').waitFor();
      assert.equal(await page.locator('#sheet .teacher-source-quote').first().textContent(), topic.quote);
      await page.locator('#sheet-take').click(); await waitForAppRecord(page, (record) => record.taken.length === 1);
      const learned = await readAppRecordSnapshot(page);
      assert(learned.record.taken[0].sourceContextRef); assert.deepEqual(learned.record.revlog, before.record.revlog);
      await page.locator('#sheet .teacher-discuss').click();
      await page.locator('#teacher-source-return').click(); await page.locator('#source-context-return').waitFor();
      assert.equal(await page.locator('#source-reader-body').textContent(), TEXT); await assertSourceReadable(page);
      await screenshot('source-return-after-teaching');
      await tutor(page);
      const laterQuestion = '  次は自分の町について書きたい。🚀  '; await settledQuestion(page, laterQuestion);
      await page.locator('#source-processing-revoke').click();
      assert.equal(await page.locator('#chat-send').isDisabled(), true);
      await page.locator('#source-processing-allow').scrollIntoViewIfNeeded(); await screenshot('revoked-question-kept');
      assert.equal(await page.locator('#chat-input').inputValue(), laterQuestion);
      await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page); await tutor(page);
      assert.equal(await page.locator('#chat-send').isDisabled(), true); assert.equal(await page.locator('#chat-input').inputValue(), laterQuestion);
      await allow(page); await configure(page, `${FAKE_MODEL}-changed`);
      assert.equal(await page.locator('#chat-send').isDisabled(), true, 'Changed tutor settings require a fresh approval');
      await allow(page);
      await openLists(page); const downloadWork = page.waitForEvent('download'); await page.locator('#export-store').click();
      const backupFile = join(out, 'ordinary-source-backup.json'); await (await downloadWork).saveAs(backupFile);
      const backupText = readFileSync(backupFile, 'utf8'), backup = JSON.parse(backupText);
      assert(!backupText.includes('kairo-source-processing-v1')); assert(!backupText.includes('providerConfigId'));
      assert(!backupText.includes(FAKE_KEY)); assert.equal(backup.record.sourceInbox.entries[0].candidate.article.capabilities['ai-transform'].status, 'unknown');
      // Import through the normal controls into another fresh installation.
      await close(); profileName = 'restored-profile'; await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page);
      await openLists(page); const oldTime = await page.evaluate(() => performance.timeOrigin);
      await page.locator('#import-file').setInputFiles(backupFile);
      await page.waitForFunction((old) => performance.timeOrigin !== old && document.body.dataset.ready === '1', oldTime, { timeout: 30000 });
      await tutor(page); await configure(page, `${FAKE_MODEL}-changed`);
      assert.deepEqual(await deviceApprovals(page), {}); assert.equal(await page.locator('#chat-send').isDisabled(), true);
      assert.equal(await page.locator('#chat-input').inputValue(), laterQuestion);
      await page.locator('#teacher-source-return').click(); await page.locator('#source-context-return').waitFor();
      assert.equal(await page.locator('#source-reader-body').textContent(), TEXT);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
      if (engine === 'webkit') disconnected = true; else await context.setOffline(true);
      await page.reload(); await ready(page); await tutor(page);
      assert.equal(await page.locator('#chat-input').inputValue(), laterQuestion);
      assert.equal(await page.locator('#chat-send').isDisabled(), true);
      if (engine === 'webkit') disconnected = false; else await context.setOffline(false);
      await screenshot('restored-offline-question-without-approval');
      result.observations.push({ ordinaryFlow: 'capture → lookup → retained question → device approval → restart → synthetic teaching and observation → teacher target → explicit learning → exact return → revoke → restart → provider change → UI backup → fresh installation restore → offline reuse',
        sourceId: topic.sourceId, topicId: topic.id, backupFile, backupSha256: hash(backupText), approvalTravelsWithBackup: false, articleRightsUpgraded: false });

      // Separate synthetic boundary phases begin here. No journey acceptance
      // is claimed for held native transactions or injected storage failures.
      await allow(page);
      const draftQuestion = 'Synthetic send waiting for question persistence';
      const beforeDraft = result.syntheticPrimary.length; await holdArchive(page, draftQuestion, 'draft');
      await page.locator('#chat-input').fill(draftQuestion);
      await page.waitForFunction(() => window.__sourceApprovalHold?.fired === 1);
      await page.locator('#chat-send').click(); await page.locator('#source-processing-revoke').click();
      await page.locator('#source-processing-allow').click();
      await page.waitForFunction(() => document.querySelector('#teacher-source-approval')?.dataset.state === 'approved');
      const draftNative = await releaseArchive(page); await idleChat(page);
      assert.equal(result.syntheticPrimary.length, beforeDraft, 'Reapproving cannot revive a Send revoked during draft persistence');
      assert.equal(await page.locator('#chat-input').inputValue(), draftQuestion);
      result.observations.push({ syntheticFault: 'Send waits for native draft commit across revoke/reapprove', native: draftNative, revivedRequests: 0 });
      const heldQuestion = 'Synthetic outbound storage boundary question'; await settledQuestion(page, heldQuestion);
      const beforeHeld = result.syntheticPrimary.length; await holdArchive(page, heldQuestion);
      await page.locator('#chat-send').click(); await page.waitForFunction(() => window.__sourceApprovalHold?.fired === 1);
      await page.locator('#source-processing-revoke').click(); const heldReceipt = await releaseArchive(page); await idleChat(page);
      assert.equal(result.syntheticPrimary.length, beforeHeld, 'Revocation during outgoing archive commit prevents fetch');
      assert.equal(await page.locator('#chat-input').inputValue(), heldQuestion);
      const savedHeld = await readAppRecordSnapshot(page);
      assert(savedHeld.archive.turns.some((t) => t.role === 'user' && t.content === heldQuestion));
      assert(savedHeld.record.teacherDrafts.entries.some((d) => d.text === heldQuestion && !d.consumed));
      result.observations.push({ syntheticFault: 'Revocation while native outgoing archive transaction is held', native: heldReceipt, providerRequests: 0, questionKept: true });

      await allow(page); const activeQuestion = 'Synthetic in-flight revocation question'; await settledQuestion(page, activeQuestion);
      const heldReply = plan(activeQuestion, 'Synthetic late reply must not replace the retained question.', true);
      const abortedBefore = result.abortedProviderRequests.length;
      await page.locator('#chat-send').click(); await page.locator('.chat-turn.thinking').waitFor();
      const captureDeadline = Date.now() + 10000;
      while (!heldReply.captured) { assert(Date.now() < captureDeadline); await new Promise((done) => setTimeout(done, 25)); }
      await page.locator('#source-processing-revoke').click(); await idleChat(page); heldReply.release();
      assert.equal(await page.locator('#chat-input').inputValue(), activeQuestion);
      assert.equal(await page.locator('.chat-turn.tutor').filter({ hasText: heldReply.reply }).count(), 0);
      assert(result.abortedProviderRequests.length > abortedBefore, 'Active fetch was actually aborted');
      result.observations.push({ syntheticFault: 'Revocation during provider response', alreadySentRequest: true, abortObserved: true, lateReplyPublished: false });

      for (const change of ['revoke', 'provider']) {
        await allow(page); const question = `Synthetic derived observation boundary ${change}`; await settledQuestion(page, question);
        await holdArchive(page, question, true); const miningBefore = result.syntheticMining.length;
        plan(question, `Synthetic source-derived answer for ${change}.`); await page.locator('#chat-send').click();
        await page.waitForFunction(() => window.__sourceApprovalHold?.fired === 1); await idleChat(page);
        if (change === 'revoke') await page.locator('#source-processing-revoke').click();
        else await configure(page, `${FAKE_MODEL}-another`);
        const native = await releaseArchive(page);
        // Snapshot waits behind the real serialized mining append and guard.
        await readAppRecordSnapshot(page); await page.evaluate(() => new Promise((done) => setTimeout(done, 80)));
        assert.equal(result.syntheticMining.length, miningBefore, 'A derived reply cannot escape under changed authority');
        result.observations.push({ syntheticFault: `Derived observation archive held across ${change}`, native, additionalMiningRequests: 0 });
      }
      await allow(page);
      // Storage failure on an explicit revocation leaves old disk bytes intact
      // but stops this window; the visible retry must make revocation durable.
      const approvalBeforeFailure = await deviceApprovals(page);
      await page.evaluate(() => {
        const native = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key.startsWith('kairo-source-processing-v1:')) throw new DOMException('Synthetic approval quota', 'QuotaExceededError');
          return native.call(this, key, value);
        };
        window.__restoreApprovalStorage = () => { Storage.prototype.setItem = native; };
      });
      await page.locator('#source-processing-revoke').click();
      assert.equal(await page.locator('#chat-send').isDisabled(), true);
      assert.equal(await page.locator('#teacher-source-approval').getAttribute('data-state'), 'revocation-pending');
      assert((await page.locator('#source-processing-status').innerText()).includes('could not be saved'));
      assert.deepEqual(await deviceApprovals(page), approvalBeforeFailure);
      await screenshot('revocation-save-failure-with-retry');
      await page.evaluate(() => { window.__restoreApprovalStorage(); delete window.__restoreApprovalStorage; });
      await page.locator('#source-processing-revoke').click();
      assert.equal(await page.locator('#teacher-source-approval').getAttribute('data-state'), 'approval-required');
      result.observations.push({ syntheticFault: 'Approval storage quota on revoke', stoppedBeforePersistence: true, visibleRetry: true, retryPersisted: true });
      await allow(page);
      const ownerQuestion = 'Synthetic owner departure before source egress'; await settledQuestion(page, ownerQuestion);
      const ownerRequests = result.syntheticPrimary.length; await holdArchive(page, ownerQuestion);
      await page.locator('#chat-send').click(); await page.waitForFunction(() => window.__sourceApprovalHold?.fired === 1);
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      const ownerNative = await releaseArchive(page);
      await readAppRecordSnapshot(page); await page.evaluate(() => new Promise((done) => setTimeout(done, 80)));
      assert.equal(result.syntheticPrimary.length, ownerRequests, 'A departed owner cannot send an approved source');
      await close(); await open(); await page.goto(`${ORIGIN}/index.html?ui=bi`); await ready(page); await tutor(page);
      assert.equal(await page.locator('#chat-input').inputValue(), ownerQuestion);
      result.observations.push({ syntheticFault: 'Owner departure during native outgoing archive commit', native: ownerNative,
        providerRequests: 0, questionRecoveredAfterRestart: true });
    }
    assert.deepEqual(result.errors, []); assert.deepEqual(result.externalRequests, []);
    assert.equal(plans.length, 0); result.passed = true;
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack };
    try { await screenshot('failure'); result.visibleFailure = await page.locator('body').innerText(); } catch { /* Preserve original error. */ }
  } finally { disconnected = false; await close(); }
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2));
  process.stdout.write(`${name}: ${result.passed ? 'passed' : result.failure.message}\n`);
}
await Promise.all([new Promise((done) => server.close(done)), new Promise((done) => providerServer.close(done))]);
assert.equal(hash(readFileSync(new URL(import.meta.url))), verifierSha256, 'Verifier changed while running');
const receipt = { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), site: SITE,
  artifactSha256: manifest.artifactSha256, verifierSha256, results, passed: results.filter((r) => r.passed).length,
  total: results.length, expectedApprovalMissing: process.env.KAIRO_EXPECT_APPROVAL_MISSING === '1',
  scope: 'Source approval subjourneys with a separate loopback HTTPS synthetic tutor/observation server and separate native faults; no live service, whole-product, physical-device, OS clipboard or operator-trial acceptance' };
writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2));
if (receipt.passed !== receipt.total) process.exitCode = 1;
