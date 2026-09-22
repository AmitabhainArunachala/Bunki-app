/** Chat connection changes through normal controls; separate native transaction
 * holds test async boundaries. All tutor responses come from loopback HTTPS. */
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
const sizes = process.env.KAIRO_TUTOR_VIEWPORT === 'desktop' ? [1440] : process.env.KAIRO_TUTOR_VIEWPORT === 'mobile' ? [390] : [1440, 390];
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const certificate = join(OUT, 'synthetic-localhost-cert.pem'), privateKey = join(OUT, 'synthetic-localhost-key.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', privateKey, '-out', certificate,
  '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
const tls = { key: readFileSync(privateKey), cert: readFileSync(certificate) };
rmSync(privateKey); rmSync(certificate);
const server = createServer(tls, (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    assert(file.startsWith(`${SITE}/`) && statSync(file).isFile());
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const ORIGIN = `https://127.0.0.1:${server.address().port}`;
let respond = null;
const providers = [];
for (const label of ['A', 'B']) {
  const server = createServer(tls, (request, response) => {
    if (!respond) { response.writeHead(503).end(); return; }
    void respond(label, request, response).catch(() => { if (!response.destroyed) response.writeHead(500).end(); });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  providers.push({ label, server, origin: `https://127.0.0.1:${server.address().port}` });
}
const until = async (predicate) => {
  const deadline = Date.now() + 12000;
  while (!predicate()) { assert(Date.now() < deadline, 'Timed out waiting for synthetic provider evidence'); await new Promise((done) => setTimeout(done, 20)); }
};
async function tutor(page) {
  await page.goto(`${ORIGIN}/index.html?ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  assert.equal(await page.locator('#store-alert').isVisible(), false);
  if (!await page.locator('#chat-input').count()) {
    await page.locator('#ginga-symbol').click(); await page.locator('.bubble-sensei').click();
  }
  await page.locator('#chat-input').waitFor();
}
async function configure(page, label, suffix = '') {
  const provider = providers.find((provider) => provider.label === label);
  await page.locator('#ai-base-url').fill(provider.origin);
  await page.locator('#ai-model-input').fill(`synthetic-tutor-${label}${suffix}`);
  await page.locator('#ai-key-input').fill(`synthetic-${label}-not-a-real-key`);
  await page.locator('#ai-key-save').click(); await page.locator('#chat-input').waitFor();
}
async function question(page, text) {
  await page.locator('#chat-input').fill(text);
  await waitForAppRecord(page, (record) => record.teacherDrafts?.entries.some((entry) => !entry.consumed && entry.text === text));
}
async function idle(page) { await page.locator('.chat-turn.thinking').waitFor({ state: 'hidden' }); }
/** Hold a real IndexedDB transaction after its actual puts. No application
 * reducer, promise, clock or ownership predicate is replaced. */
async function holdArchive(page, text, phase) {
  const { installation } = await readAppRecordSnapshot(page);
  await page.evaluate(({ text, phase, databaseName }) => {
    if (window.__tutorBindingHold) throw new Error('A tutor transaction fault is already armed');
    const native = IDBObjectStore.prototype.put, matched = new WeakSet();
    const fault = { fired: 0, released: false, completed: false };
    const keepalive = (tx) => {
      if (!fault.released) tx.objectStore('kairo_replication_rows').get('synthetic-tutor-binding-keepalive').onsuccess = () => keepalive(tx);
    };
    IDBObjectStore.prototype.put = function (...args) {
      const request = native.apply(this, args), row = args[0];
      if (fault.fired || this.transaction.db.name !== databaseName || this.name !== 'kairo_replication_rows' || row?.kind !== 'document') return request;
      const document = JSON.parse(row.text);
      if (phase === 'draft'
        ? document.collection === 'learner-record' && document.value.teacherDrafts?.entries.some((draft) => draft.text === text && !draft.consumed)
        : document.collection === 'learner-archive' && document.value.turns?.some((turn) => turn.role === 'user' &&
          turn.surface === (phase === 'mine' ? 'mine' : 'chat') && (phase === 'mine' ? turn.content.includes(text) : turn.content === text)))
        matched.add(this.transaction);
      if (matched.has(this.transaction) && document.collection === 'kairo:record-host-commands') {
        fault.fired++; keepalive(this.transaction); this.transaction.addEventListener('complete', () => { fault.completed = true; });
      }
      return request;
    };
    fault.release = () => { fault.released = true; };
    fault.disarm = () => { fault.release(); IDBObjectStore.prototype.put = native; };
    window.__tutorBindingHold = fault;
  }, { text, phase, databaseName: installation.databaseName });
}
async function releaseArchive(page) {
  await page.evaluate(() => window.__tutorBindingHold.release());
  await page.waitForFunction(() => window.__tutorBindingHold?.completed);
  const result = await page.evaluate(() => {
    const fault = window.__tutorBindingHold; fault.disarm(); delete window.__tutorBindingHold;
    return { fired: fault.fired, completed: fault.completed, released: fault.released };
  });
  assert.equal(result.fired, 1); return result;
}

const results = [], startedAt = new Date().toISOString();
for (const engine of engines) for (const width of sizes) {
  const name = `${engine}-${width}`, out = join(OUT, name); mkdirSync(out, { recursive: true });
  const result = { name, engine, width, passed: false, observations: [], calls: [], cancelled: [], aborted: [], errors: [], externalRequests: [], screenshots: [], videos: [] };
  results.push(result);
  let context, page, episode = 0;
  const plans = [];
  const plan = (label, text, reply, held = false, mining = false) => {
    let release; const gate = new Promise((done) => { release = done; });
    const value = { label, text, reply, mining, gate, release, captured: false }; plans.push(value);
    if (!held) release(); return value;
  };
  respond = async (label, request, response) => {
    const headers = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type,x-api-key,anthropic-version,anthropic-dangerous-direct-browser-access', 'content-type': 'application/json' };
    if (request.url !== '/v1/messages' || !['POST', 'OPTIONS'].includes(request.method)) { response.writeHead(404).end(); return; }
    if (request.method === 'OPTIONS') { response.writeHead(204, headers).end(); return; }
    let bytes = 0; const chunks = [];
    for await (const chunk of request) { bytes += chunk.length; if (bytes > 2000000) { response.writeHead(413).end(); return; } chunks.push(chunk); }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const mining = body.system.includes('observations about the LEARNER');
    if (request.headers['x-api-key'] !== `synthetic-${label}-not-a-real-key` || !body.model.startsWith(`synthetic-tutor-${label}`))
      result.errors.push('Unexpected synthetic credential/model binding');
    const index = plans.findIndex((entry) => !entry.captured && entry.label === label && entry.mining === mining &&
      (mining ? body.messages.at(-1).content.includes(entry.text) : body.messages.at(-1).content === entry.text));
    const expected = plans[index]; result.calls.push({ label, mining, body, planned: !!expected });
    if (!expected) { response.writeHead(503, headers).end(); return; }
    expected.captured = true;
    response.on('close', () => { if (!response.writableEnded) result.cancelled.push({ label, mining, text: expected.text }); });
    await expected.gate;
    if (!response.destroyed) response.writeHead(200, headers).end(JSON.stringify({ content: [{ type: 'text', text: expected.reply }], model: body.model }));
  };
  const open = async () => {
    const videos = join(out, `video-${++episode}`); mkdirSync(videos, { recursive: true });
    context = await ({ chromium, webkit }[engine]).launchPersistentContext(join(out, 'profile'), {
      headless: true, viewport: { width, height: width === 390 ? 844 : 1050 }, locale: 'en-US', serviceWorkers: 'allow',
      ignoreHTTPSErrors: true, ...(engine === 'chromium' ? { args: ['--ignore-certificate-errors'] } : {}),
      recordVideo: { dir: videos, size: { width, height: width === 390 ? 844 : 1050 } },
    });
    result.browserVersion = context.browser()?.version();
    const allowed = new Set([ORIGIN, ...providers.map((provider) => provider.origin)]);
    await context.route('**/*', (route) => allowed.has(new URL(route.request().url()).origin) ? route.continue() : route.abort());
    context.on('request', (request) => { if (!allowed.has(new URL(request.url()).origin)) result.externalRequests.push(request.url()); });
    page = context.pages()[0] || await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => result.errors.push(error.message));
    page.on('requestfailed', (request) => {
      if (providers.some((provider) => new URL(request.url()).origin === provider.origin)) result.aborted.push({ method: request.method(), failure: request.failure()?.errorText });
    });
  };
  const close = async () => {
    if (!context) return;
    for (const entry of plans) entry.release();
    await page.evaluate(() => window.__tutorBindingHold?.disarm()).catch(() => undefined);
    const videos = context.pages().map((page) => page.video()); await context.close(); context = null;
    for (const video of videos) if (video) result.videos.push(await video.path());
  };
  const screenshot = async (label) => {
    await page.evaluate(() => document.fonts.ready);
    const path = join(out, `${label}.png`); await page.screenshot({ path });
    result.screenshots.push({ label, path, sha256: hash(readFileSync(path)) });
  };
  const drain = async () => {
    await readAppRecordSnapshot(page); await page.evaluate(() => new Promise((done) => setTimeout(done, 100)));
  };
  try {
    await open(); await tutor(page); const initial = await readAppRecordSnapshot(page);
    await configure(page, 'A'); assert.equal(result.calls.length, 0, 'Configuration is not a Send');
    const ordinary = '町と都市はどう違いますか。', reply = 'Synthetic A explanation, for transport verification only.';
    plan('A', ordinary, reply); const observation = plan('A', ordinary, '[]', false, true);
    await question(page, ordinary); await page.locator('#chat-send').click(); await idle(page); await until(() => observation.captured);
    await waitForAppRecord(page, (record) => record.teacherDrafts?.entries.some((entry) => entry.text === ordinary && entry.consumed));
    await drain(); assert.equal(await page.locator('#chat-input').inputValue(), '');
    const normal = await readAppRecordSnapshot(page);
    for (const field of ['taken', 'srs', 'revlog', 'stats', 'lists', 'obslog']) assert.deepEqual(normal.record[field], initial.record[field]);
    assert(result.calls.find((call) => call.mining).body.messages.at(-1).content.includes(reply));
    result.observations.push({ ordinaryFlow: 'Fresh front door → configure A → explicit Send → A reply and automatic observation', provider: 'A', reviewStateUnchanged: true });

    const pendingText = 'この例をもう少し説明してください。', late = 'Synthetic late A reply must not be accepted.';
    const held = plan('A', pendingText, late, true);
    await question(page, pendingText); await page.locator('#chat-send').click(); await until(() => held.captured);
    const callsBeforeChange = result.calls.length;
    await configure(page, 'B'); await idle(page); held.release(); await drain();
    assert.equal(await page.locator('#chat-input').inputValue(), pendingText);
    assert((await page.locator('#chat-status').innerText()).includes('tutor connection changed'));
    assert.equal(result.calls.length, callsBeforeChange, 'Changing tutors cannot redirect the automatic observation');
    await until(() => result.cancelled.some((entry) => entry.text === pendingText));
    assert(result.aborted.length > 0, 'Actual browser request abort observed');
    assert(!(await readAppRecordSnapshot(page)).archive.turns.some((turn) => turn.content === late));
    await screenshot('connection-changed-question-kept');
    await close(); await open(); await tutor(page);
    assert.equal(await page.locator('#chat-input').inputValue(), pendingText);
    assert.equal(await page.locator('#ai-base-url').inputValue(), providers[1].origin);
    const retryReply = 'Synthetic B reply after the learner explicitly sends again.';
    plan('B', pendingText, retryReply); const retryObservation = plan('B', pendingText, '[]', false, true);
    await page.locator('#chat-send').click(); await idle(page); await until(() => retryObservation.captured); await drain();
    assert((await readAppRecordSnapshot(page)).archive.turns.some((turn) => turn.content === retryReply));
    await screenshot('explicit-retry-after-restart');
    result.observations.push({ ordinaryFlow: 'Change A → B while A response is held → A aborted → question kept → restart → explicit Send to B', redirectedRequests: 0, lateReplyPublished: false });

    // Synthetic native-boundary phases; these are not whole learner journeys.
    for (const phase of ['draft', 'outbound']) {
      await configure(page, 'A'); const text = `Synthetic ${phase} connection binding`;
      if (phase !== 'draft') await question(page, text);
      await holdArchive(page, text, phase); const before = result.calls.length;
      if (phase === 'draft') { await page.locator('#chat-input').fill(text); await page.waitForFunction(() => window.__tutorBindingHold?.fired === 1); }
      await page.locator('#chat-send').click();
      await page.waitForFunction(() => window.__tutorBindingHold?.fired === 1);
      // Saving the same settings is a new connection revision, too.
      await configure(page, phase === 'draft' ? 'A' : 'B');
      const native = await releaseArchive(page); await idle(page); await drain();
      assert.equal(result.calls.length, before); assert.equal(await page.locator('#chat-input').inputValue(), text);
      result.observations.push({ syntheticFault: `${phase} transaction held across ${phase === 'draft' ? 'same-settings reconnect' : 'provider change'}`, native, providerRequests: 0, questionKept: true });
    }
    for (const change of ['provider', 'model', 'owner']) {
      await configure(page, 'A'); const text = `Synthetic derived observation ${change}`, answer = `Synthetic accepted A answer before ${change}.`;
      await question(page, text); await holdArchive(page, text, 'mine'); const before = result.calls.filter((call) => call.mining).length;
      plan('A', text, answer); await page.locator('#chat-send').click();
      await page.waitForFunction(() => window.__tutorBindingHold?.fired === 1); await idle(page);
      if (change === 'owner') await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      else await configure(page, change === 'provider' ? 'B' : 'A', change === 'model' ? '-changed' : '');
      const native = await releaseArchive(page); await drain();
      assert.equal(result.calls.filter((call) => call.mining).length, before);
      if (change === 'owner') { await close(); await open(); await tutor(page); }
      assert((await readAppRecordSnapshot(page)).archive.turns.some((turn) => turn.content === answer));
      result.observations.push({ syntheticFault: `Derived observation storage held across ${change}`, native, additionalMiningRequests: 0, acceptedAnswerKept: true });
    }
    await configure(page, 'A'); const activeText = 'Synthetic active observation connection change';
    const activeReply = 'Synthetic accepted reply before active observation cancellation.';
    plan('A', activeText, activeReply);
    const activeMine = plan('A', activeText, '[{"kind":"sensei","subject":"町","subjectType":"word","polarity":3,"code":"sense-miss"}]', true, true);
    await question(page, activeText); await page.locator('#chat-send').click(); await idle(page); await until(() => activeMine.captured);
    const beforeCancel = await readAppRecordSnapshot(page);
    await configure(page, 'B'); await until(() => result.cancelled.some((entry) => entry.text === activeText && entry.mining));
    activeMine.release(); await drain();
    const afterCancel = await readAppRecordSnapshot(page);
    assert.deepEqual(afterCancel.record.obslog, beforeCancel.record.obslog);
    assert(!afterCancel.archive.turns.some((turn) => turn.surface === 'mine' && turn.role === 'assistant' && turn.content === activeMine.reply));
    assert(afterCancel.archive.turns.some((turn) => turn.content === activeReply));
    result.observations.push({ syntheticFault: 'Active automatic observation during provider change', actualServerCancellation: true, lateObservationAccepted: false, acceptedAnswerKept: true });
    assert.deepEqual(result.errors, []); assert.deepEqual(result.externalRequests, []);
    assert(result.calls.every((call) => call.planned), 'Every provider request was explicitly expected');
    assert(plans.every((entry) => entry.captured), 'Every planned request reached its original destination');
    result.passed = true;
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack };
    try { await screenshot('failure'); result.visibleFailure = await page.locator('body').innerText(); } catch { /* Keep original error. */ }
  } finally { await close(); }
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2));
  process.stdout.write(`${name}: ${result.passed ? 'passed' : result.failure.message}\n`);
}
await Promise.all([server, ...providers.map((provider) => provider.server)].map((server) => new Promise((done) => server.close(done))));
assert.equal(hash(readFileSync(new URL(import.meta.url))), verifierSha256, 'Verifier changed while running');
const receipt = { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), site: SITE,
  artifactSha256: manifest.artifactSha256, verifierSha256, results, passed: results.filter((result) => result.passed).length, total: results.length,
  scope: 'Persistent browser chat subjourneys with two loopback HTTPS synthetic tutors and separate native transaction/lifecycle faults. No live teaching, whole-product, physical-device or trial acceptance.' };
writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2));
if (receipt.passed !== receipt.total) process.exitCode = 1;
