/** R34 source-reference journeys and real IndexedDB boundaries.
 * SYNTHETIC PREMISE: isolated local profiles are provisioned into one learner
 * scope by a test native bridge. Its relay admits operation envelopes only.
 * This neither authenticates devices nor establishes live Apple synchronization.
 * Ordinary rendered controls and synthetic host/fault actions are recorded apart.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio, TEST_AUDIO_OUTPUT } from './browser-audio-silence.mjs';
import { readAppRecordSnapshot, waitForAppRecord, armRecordWriteFailure, clearRecordWriteFailure } from './record-test-support.mjs';
import { createAppBackupFixture, restoreAppFixture } from './record-fixture-support.mjs';

const CASES = [
  'ordinary-link-atomicity-local-only-alternates-reload-offline',
  'synthetic-pair-operation-only-reorder-duplicates-conflicts-reopen',
  'synthetic-app-host-input-identity-replay-and-smuggling-refusal',
  'synthetic-native-quota-abort-stale-writer-and-durable-owner-loss',
  'synthetic-v2-journal-backup-without-authority-import',
];
if (process.argv.includes('--list')) {
  assert.equal(process.argv.length, 3, '--list cannot be combined with execution arguments');
  console.log(CASES.join('\n')); process.exit(0);
}
assert(process.argv.slice(2).every(arg => arg.startsWith('--case=')), 'Only --case=<name> or --list is supported');
const filters = new Set(process.argv.slice(2).map(arg => arg.slice(7)));
for (const name of filters) assert(CASES.includes(name), `Unknown case: ${name}`);
assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Supply an immutable, already built KAIRO_SITE_DIR');
assert.match(process.env.KAIRO_ARTIFACT_SHA256 || '', /^[a-f0-9]{64}$/u, 'Supply KAIRO_ARTIFACT_SHA256');
const SITE = resolveCorridorSite(), OUT = resolveCorridorEvidence();
assert(!existsSync(join(OUT, 'receipt.json')) && !existsSync(join(OUT, 'tested-site')), 'Use a fresh external evidence directory');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const normalize = value => Array.isArray(value) ? value.map(normalize) : value !== null && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
const digest = value => sha(JSON.stringify(normalize(value)));
const reference = operation => ({ opId: operation.opId, sha256: sha(JSON.stringify(normalize(operation), null, 2)) });
const orderedOperations = operations => [...operations].sort((a, b) => a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0);
const manifestText = readFileSync(join(SITE, 'build-identity.json'));
const manifest = JSON.parse(manifestText), files = new Map(manifest.files.map(row => [row.path, row.sha256]));
const verifierSha256 = sha(readFileSync(new URL(import.meta.url)));
const helperPaths = ['browser-audio-silence.mjs', 'record-test-support.mjs', 'record-fixture-support.mjs'];
const helperSha256 = Object.fromEntries(helperPaths.map(path => [path, sha(readFileSync(new URL(path, import.meta.url)))]));
const resolverSha256 = sha(readFileSync(join(ROOT, 'scripts/resolve-corridor-site.mjs')));
const requiredUI = ['corridor.js', 'corridor.css', 'record-controller.mjs', 'record-app.mjs', 'record-host.mjs', 'record-sync.mjs', 'modules/record-core.mjs'];
const requiredHost = ['record-controller.mjs', 'record-app.mjs', 'record-host.mjs', 'modules/record-core.mjs', 'source-inbox.mjs'];
for (const path of [...requiredUI, ...requiredHost]) assert(files.has(path), `Candidate omits ${path}`);
function verifyBookends() {
  assert.equal(sha(readFileSync(join(SITE, 'build-identity.json'))), sha(manifestText));
  assert.equal(sha(JSON.stringify(manifest.files)), manifest.artifactSha256);
  assert.equal(manifest.artifactSha256, process.env.KAIRO_ARTIFACT_SHA256);
  for (const file of manifest.files) assert.equal(sha(readFileSync(join(SITE, file.path))), file.sha256, file.path);
  assert.equal(sha(readFileSync(new URL(import.meta.url))), verifierSha256, 'Verifier changed during execution');
  for (const path of helperPaths) assert.equal(sha(readFileSync(new URL(path, import.meta.url))), helperSha256[path], path);
  assert.equal(sha(readFileSync(join(ROOT, 'scripts/resolve-corridor-site.mjs'))), resolverSha256);
}
verifyBookends();
cpSync(SITE, join(OUT, 'tested-site'), { recursive: true, errorOnExist: true, force: false });
for (const file of manifest.files) assert.equal(sha(readFileSync(join(OUT, 'tested-site', file.path))), file.sha256, `Retained ${file.path}`);
for (const path of ['verify-source-reference-sync.mjs', ...helperPaths]) {
  mkdirSync(join(OUT, 'verifier-source'), { recursive: true });
  cpSync(new URL(path, import.meta.url), join(OUT, 'verifier-source', path), { errorOnExist: true, force: false });
}
const engines = process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER || 'chromium'];
assert(engines.every(engine => ['chromium', 'webkit'].includes(engine)), 'KAIRO_BROWSER must be chromium, webkit or all');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SCOPE = { accountId: `local-account:${uuid(701)}`, learnerId: `local-learner:${uuid(702)}` };
const TIME = '2026-09-13T00:00:00.000Z';
const URL_A = 'https://example.invalid/reading?edition=1&word=%E5%AD%A3%E7%AF%80#t=93';
const URL_B = 'https://reference.invalid/article?part=2#section-%E4%BA%8C';
const results = [], startedAt = new Date().toISOString();
let activeContexts = 0, disconnected = false, server;
const fixtureHTML = `<!doctype html><meta charset="utf-8"><title>SYNTHETIC source-reference host boundary</title>
<h1>SYNTHETIC admitted local host boundary</h1><p>Real controller, app, host, origin lock and IndexedDB; no authentication or remote transport acceptance.</p>
<script type="module">import * as core from '/modules/record-core.mjs';import * as controller from '/record-controller.mjs';
import * as host from '/record-host.mjs';import * as app from '/record-app.mjs';import * as binding from '/record-binding.mjs';
import * as inbox from '/source-inbox.mjs';window.sourceReferenceFixture={core,controller,host,app,binding,inbox};</script>`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const key = join(OUT, 'synthetic-loopback-key.pem'), certificate = join(OUT, 'synthetic-loopback-cert.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', certificate, '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
server = createServer({ key: readFileSync(key), cert: readFileSync(certificate) }, (request, response) => {
  if (disconnected) { request.socket.destroy(); return; }
  const path = new URL(request.url, 'https://127.0.0.1').pathname;
  if (path === '/synthetic-source-reference') { response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end(fixtureHTML); return; }
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    assert(file.startsWith(`${SITE}/`) && statSync(file).isFile());
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
rmSync(key); rmSync(certificate);
await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
const ORIGIN = `https://127.0.0.1:${server.address().port}`;

function peer(test, name = 'a') { return { ...test, peer: name, out: join(test.out, name), profile: join(test.out, `profile-${name}`),
  context: null, page: null, episode: 0, assetLoads: [], assetWork: [], warmCacheResponses: [], errors: [], externalRequests: [], observations: [], snapshots: [], lifecycle: [] }; }
async function exact(page, action, value) {
  return JSON.parse(await page.evaluate(async ({ source, input }) => {
    const run = (0, eval)(`(${source})`);
    return JSON.stringify({ value: await run(JSON.parse(input).value) });
  }, { source: String(action), input: JSON.stringify({ value }) })).value;
}
async function ready(f) {
  await f.page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 });
  assert.equal(await f.page.locator('#store-alert').isVisible(), false);
  assert.equal(await f.page.evaluate(() => globalThis[Symbol.for('kairo.test.silent-audio.v1')] === true), true);
  await f.page.waitForFunction(() => typeof window.__sourceReferenceTransport?.handle === 'function');
}
async function attest(f, start, required, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && required.some(path => !f.assetLoads.slice(start).some(row => row.path === path))) await delay(25);
  const assets = f.assetLoads.slice(start);
  for (const path of required) assert(assets.some(row => row.path === path), `Actual ${label} did not load ${path}`);
  assert(assets.every(row => row.sha256 === files.get(row.path)), 'Actual served bytes differ from frozen artifact');
  f.observations.push({ kind: 'runtime-attestation', label, episode: f.episode, assets });
}
async function launch(f, { offline = false, surface = 'app' } = {}) {
  assert.equal(activeContexts, 0, 'This verifier serializes every peer/engine/context'); assert.equal(f.context, null);
  assert(['app', 'host'].includes(surface)); assert(!offline || surface === 'app', 'Offline verification requires the ordinary app and its worker');
  const serviceWorkers = surface === 'host' ? 'block' : 'allow';
  mkdirSync(f.out, { recursive: true }); f.episode++;
  f.context = await ({ chromium, webkit }[f.engine]).launchPersistentContext(f.profile, { headless: true,
    viewport: { width: 390, height: 844 }, locale: 'en-US', serviceWorkers, acceptDownloads: true,
    ignoreHTTPSErrors: true, ...(f.engine === 'chromium' ? { args: ['--ignore-certificate-errors'] } : {}) });
  activeContexts++;
  f.browserVersion = f.context.browser()?.version() || null;
  await silenceBrowserAudio(f.context);
  // Explicit synthetic admission/transport port. The app creates its own fresh
  // session, actor, database and cooperative writer; none is copied from a peer.
  await f.context.addInitScript(scope => {
    const state = { handle: null, binding: null, registrationId: null, state: 'ready' };
    window.__sourceReferenceTransport = state;
    window.kairoSync = Object.freeze({ initialScope: async () => ({ ...scope }),
      register: async ({ binding }, handle) => { state.binding = binding; state.handle = handle; state.registrationId = `synthetic-${crypto.randomUUID()}`; return { registrationId: state.registrationId }; },
      unregister: async () => { state.handle = null; }, status: async () => ({ state: state.state }),
      connect: async () => ({ state: 'ready' }), sync: async () => ({ state: 'ready' }), disconnect: async () => ({ state: 'disconnected' }) });
  }, SCOPE);
  await f.context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  await f.context.route('**/*', route => {
    const url = new URL(route.request().url()); if (url.origin === ORIGIN) return route.continue();
    f.externalRequests.push({ episode: f.episode, origin: url.origin, pathname: url.pathname }); return route.abort();
  });
  const warmCacheEpisode = f.episode;
  f.context.on('response', response => {
    const url = new URL(response.url()), path = url.pathname.slice(1);
    if (url.origin !== ORIGIN || !/^data\/articles\/[^/]+\.json$/u.test(path) || !files.has(path)) return;
    f.warmCacheResponses.push({ episode: warmCacheEpisode, url: url.href, method: response.request().method(),
      status: response.status(), responseHeaders: Object.entries(response.headers()).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
      fromServiceWorker: response.fromServiceWorker() });
  });
  if (offline) { if (f.engine === 'webkit') disconnected = true; else await f.context.setOffline(true); }
  f.page = f.context.pages()[0] || await f.context.newPage(); f.page.setDefaultTimeout(15000);
  f.page.on('pageerror', error => f.errors.push({ episode: f.episode, message: error.message }));
  f.page.on('response', response => {
    const path = new URL(response.url()).pathname.slice(1);
    if (!files.has(path) || !/\.(?:js|mjs|css)$/u.test(path)) return;
    const work = response.body().then(bytes => f.assetLoads.push({ path, sha256: sha(bytes), episode: f.episode, fromServiceWorker: response.fromServiceWorker() }));
    f.assetWork.push(work); void work.catch(() => undefined);
  });
  f.lifecycle.push({ action: 'launch', episode: f.episode, profile: f.profile, offline, surface, serviceWorkers, at: new Date().toISOString() });
  const start = f.assetLoads.length;
  if (surface === 'host') {
    await f.page.goto(`${ORIGIN}/synthetic-source-reference`); await f.page.waitForFunction(() => !!window.sourceReferenceFixture);
    assert.equal(await f.page.evaluate(() => globalThis[Symbol.for('kairo.test.silent-audio.v1')] === true), true);
    assert.equal(await f.page.evaluate(() => navigator.serviceWorker.controller === null), true, 'Synthetic fixture still has a worker controller');
    await attest(f, start, requiredHost, 'synthetic-real-host-boundary');
  } else {
    await f.page.goto(`${ORIGIN}/index.html?entry=shelf&ui=bi`); await ready(f); await attest(f, start, requiredUI, offline ? 'offline-reopen' : 'ordinary-app');
    if (f.fixtureWorkerUnregistered) {
      await f.page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
      f.observations.push({ kind: 'ordinary-worker-restored-after-synthetic-fixture', episode: f.episode,
        scriptURL: await f.page.evaluate(() => navigator.serviceWorker.controller.scriptURL) });
      f.fixtureWorkerUnregistered = false;
    }
  }
}
async function close(f) {
  if (!f.context) return;
  try {
    const pages = f.context.pages(), blank = await f.context.newPage(); await blank.goto('about:blank');
    await Promise.all(pages.map(page => page.close())); await delay(1000);
    await f.context.tracing.stop({ path: join(f.out, `trace-${f.episode}.zip`) });
  } finally {
    await f.context.close(); f.context = null; f.page = null; activeContexts--; disconnected = false;
    f.lifecycle.push({ action: 'closed', episode: f.episode, at: new Date().toISOString() });
  }
  await Promise.all(f.assetWork); f.assetWork = [];
}
async function native(f, label) {
  const app = await readAppRecordSnapshot(f.page);
  const extra = await exact(f.page, async () => {
    const core = await import('/modules/record-core.mjs');
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
    try { const snapshot = await store.snapshot(); return { snapshot, views: core.readSourceReferenceViews(snapshot.replica), journal: core.exportOperationJournal(snapshot.replica) }; }
    finally { await store.close(); }
  });
  for (const row of app.rows) assert.equal(sha(row.text), row.sha256);
  assert.equal(app.revision, extra.snapshot.revision); assert.equal(extra.snapshot.replica.projection.scheduling, 'not-computed');
  const value = { ...app, ...extra }, file = join(f.out, `${String(f.snapshots.length + 1).padStart(2, '0')}-${label}.json`);
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); f.snapshots.push({ label, file, sha256: sha(readFileSync(file)) }); return value;
}
function unchanged(before, after, allowed = []) {
  for (const key of new Set([...Object.keys(before.record), ...Object.keys(after.record)])) if (!allowed.includes(key)) assert.deepEqual(after.record[key], before.record[key], `Unexpected record root ${key}`);
  assert.deepEqual(after.archive, before.archive); assert.deepEqual(after.installation, before.installation);
}
function receivedOnly(before, after) {
  unchanged(before, after); assert.deepEqual(after.snapshot.actor, before.snapshot.actor); assert.deepEqual(after.snapshot.outbox, before.snapshot.outbox);
}
function captureInput(capture) { return { captureId: capture.id, encounterUrl: capture.encounterUrl, capturedAt: capture.capturedAt }; }
function assertSourceCommit(before, after, input) {
  unchanged(before, after, ['sourceInbox']);
  assert.equal(after.revision, before.revision + 1); assert.equal(after.snapshot.actor.sequence, before.snapshot.actor.sequence + 1);
  const operations = after.snapshot.replica.operations.filter(op => !before.snapshot.replica.operations.some(old => old.opId === op.opId));
  assert.equal(operations.length, 1); const operation = operations[0], ref = reference(operation);
  assert.deepEqual(operation.payload, { kind: 'source.reference', ...input, generation: null });
  assert.deepEqual(operation.dependencies, []); assert.deepEqual(operation.predecessor, before.snapshot.actor.predecessor);
  assert.deepEqual(operation.scope, { accountId: before.installation.binding.accountId, learnerId: before.installation.binding.learnerId });
  assert.deepEqual(operation.actor, { ...before.installation.actor, sequence: before.snapshot.actor.sequence + 1 });
  assert.equal(operation.payloadSha256, sha(JSON.stringify(normalize(operation.payload), null, 2)));
  assert.equal(after.snapshot.outbox.length, before.snapshot.outbox.length + 1); assert.deepEqual(after.snapshot.outbox.find(op => op.opId === operation.opId), operation);
  assert.deepEqual(after.snapshot.actor.predecessor, ref); assert(after.snapshot.replica.ready.some(row => digest(row) === digest(ref)));
  const capture = after.record.sourceInbox.entries.find(row => row.id === input.captureId); assert(capture); assert.deepEqual(captureInput(capture), input);
  assert.equal(capture.candidate.article.body, null); assert.equal(capture.candidate.article.title, new URL(input.encounterUrl).hostname);
  assert.equal(after.record.sourceInbox.entries.filter(row => row.id === input.captureId).length, 1);
  const commands = value => value.documents.filter(row => row.collection === 'kairo:record-host-commands');
  const added = commands(after).filter(row => !commands(before).some(old => old.id === row.id)); assert.equal(added.length, 1);
  const command = added[0].value; assert.equal(command.type, 'host.source-reference/1');
  assert.equal(command.commandSha256, digest({ scope: operation.scope, type: command.type, occurredAt: command.occurredAt, input }));
  assert.equal(command.recordSha256, digest(after.record)); assert.equal(command.archiveSha256, digest(after.archive));
  assert.equal(command.beforeRevision, before.revision); assert.equal(command.committedRevision, after.revision);
  assert.deepEqual(command.sourceReference, { captureId: input.captureId, intentSha256: digest({ payload: operation.payload, dependencies: [] }), operation: ref });
  const local = after.rows.find(row => row.kind === 'receipt' && row.id === JSON.stringify(['local', `host-command:${digest([operation.scope, added[0].id])}`]));
  assert(local, 'Atomic command lacks native commit receipt'); assert.deepEqual(JSON.parse(local.text).operations, [ref]); assert.equal(JSON.parse(local.text).revision, after.revision);
  return operation;
}
function assertViews(state) {
  assert.equal(state.views.length, state.snapshot.replica.projection.entities.filter(row => row.target.kind === 'source-reference').length);
  for (const view of state.views) {
    const projection = state.snapshot.replica.projection.entities.find(row => row.target.kind === 'source-reference' && row.target.id === view.captureId);
    assert.deepEqual(view.projection, projection);
    const grouped = new Map();
    for (const ref of projection.heads) {
      const op = state.snapshot.replica.operations.find(row => row.opId === ref.opId); assert.equal(op.payload.kind, 'source.reference'); assert.deepEqual(reference(op), ref);
      assert(state.snapshot.replica.ready.some(row => digest(row) === digest(ref)), 'Pending/quarantined bytes became source evidence');
      const group = grouped.get(op.payloadSha256); if (group) group.operationRefs.push(ref); else grouped.set(op.payloadSha256, { payloadSha256: op.payloadSha256, payload: op.payload, operationRefs: [ref] });
    }
    assert.deepEqual(view.headReferences, [...grouped.values()]);
  }
}
async function inbox(f) {
  if (await f.page.locator('#source-capture-form').count()) return;
  await f.page.goto(`${ORIGIN}/index.html?entry=shelf&ui=bi`); await ready(f);
  await f.page.locator('#source-inbox-link').click(); await f.page.locator('#source-capture-form').waitFor();
}
async function ordinaryCapture(f, { url, title = '', text = '' }, label) {
  await inbox(f); await f.page.locator('#source-capture-title').fill(title); await f.page.locator('#source-capture-url').fill(url); await f.page.locator('#source-capture-text').fill(text);
  const before = await native(f, `${label}-before`); await f.page.locator('#source-capture-save').click();
  await waitForAppRecord(f.page, record => (record.sourceInbox?.entries.length || 0) === (before.record.sourceInbox?.entries.length || 0) + 1);
  const after = await native(f, `${label}-after`), capture = after.record.sourceInbox.entries.find(row => !before.record.sourceInbox?.entries.some(old => old.id === row.id));
  assert(capture); f.observations.push({ kind: 'ordinary-form', label, input: { url, title, text }, captureId: capture.id });
  return { before, after, capture };
}
async function openReference(f, input, label) {
  await inbox(f); const button = f.page.locator(`[data-source-capture="${input.captureId}"]`); assert.equal(await button.count(), 1); await button.click();
  const anchor = f.page.locator('#source-reader-original'); await anchor.waitFor(); assert.equal(await anchor.getAttribute('href'), input.encounterUrl);
  // Inspect and activate the real link, suppressing only its external navigation.
  // The resulting observation proves rendered click intent, never retrieval.
  await anchor.evaluate(node => node.addEventListener('click', event => { event.preventDefault(); window.__sourceReferenceLinkIntent = { href: node.getAttribute('href'), target: node.target, trusted: event.isTrusted }; }, { once: true }));
  await anchor.click(); const intent = await f.page.evaluate(() => window.__sourceReferenceLinkIntent); assert.equal(intent.href, input.encounterUrl); assert.equal(intent.trusted, true);
  f.observations.push({ kind: 'ordinary-source-open-link', label, intent, externalNavigation: 'suppressed by explicit verifier listener; no retrieval' });
}
async function shot(f, label) {
  await f.page.screenshot({ path: join(f.out, `${label}.png`), fullPage: false });
  const ui = await f.page.evaluate(() => ({ view: document.body.dataset.view, text: document.body.innerText, overflow: document.documentElement.scrollWidth > innerWidth + 1,
    silenceMarker: globalThis[Symbol.for('kairo.test.silent-audio.v1')] === true, playingMedia: [...document.querySelectorAll('audio,video')].filter(node => !node.paused).length,
    speech: { speaking: globalThis.speechSynthesis?.speaking ?? false, pending: globalThis.speechSynthesis?.pending ?? false } }));
  writeFileSync(join(f.out, `${label}-ui.json`), JSON.stringify(ui, null, 2)); assert.equal(ui.overflow, false); assert.equal(ui.silenceMarker, true); assert.equal(ui.playingMedia, 0); assert.deepEqual(ui.speech, { speaking: false, pending: false });
}
async function hostBoundary(f) {
  // The product worker intentionally maps navigations to its cached app shell.
  // Explicitly unregister only this synthetic profile's worker, then close all
  // controlled pages. Blocking registration alone cannot bypass an old worker.
  assert(f.profile.startsWith(`${OUT}/`), 'Fixture setup is restricted to this run’s isolated profiles');
  await f.page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  const before = await native(f, 'before-synthetic-worker-unregister');
  const storageBefore = await fixtureStorage(f);
  const departureDraft = await exact(f.page, () => document.getElementById('source-capture-form')
    ? Object.fromEntries(['title', 'url', 'text'].map(key => [key, document.getElementById(`source-capture-${key}`).value])) : null);
  const unregistered = await exact(f.page, async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return Promise.all(registrations.map(async registration => ({ scope: registration.scope, removed: await registration.unregister() })));
  });
  assert(unregistered.length > 0); assert(unregistered.every(row => row.scope.startsWith(`${ORIGIN}/`) && row.removed));
  f.fixtureWorkerUnregistered = true;
  f.observations.push({ kind: 'synthetic-own-profile-worker-unregister', episode: f.episode, unregistered,
    offlineClaim: false, explanation: 'Fixture setup only; native storage and existing cache entries stay exact. Only observed current-artifact article prefetch additions may complete. Ordinary pagehide may preserve the exact rendered source draft through its current-installation recovery contract.' });
  await close(f); await launch(f, { surface: 'host' });
  const after = await native(f, 'after-synthetic-worker-unregister');
  const storageAfter = await fixtureStorage(f);
  const parityFile = join(f.out, `fixture-storage-parity-${f.episode}.json`);
  writeFileSync(parityFile, JSON.stringify({ before: storageBefore, after: storageAfter, departureDraft }, null, 2) + '\n');
  assert.deepEqual(after, before, 'Fixture setup changed native records, identity, journal, actor or outbox');
  const warmCacheAdditions = validateWarmCacheAdditions(f, storageBefore.caches, storageAfter.caches, f.episode - 1);
  const warmCacheFile = join(f.out, `fixture-warm-cache-additions-${f.episode}.json`);
  writeFileSync(warmCacheFile, JSON.stringify({ kind: 'ordinary-in-flight-article-prefetch', additions: warmCacheAdditions }, null, 2) + '\n');
  const recoveryKey = `kairo-source-capture-draft-v1:${before.installation.databaseName}`;
  let expectedStorage = { ...storageBefore, caches: storageAfter.caches }, departureRecovery = null;
  if (storageAfter.localStorage[recoveryKey] !== storageBefore.localStorage[recoveryKey]) {
    assert.notEqual(departureDraft, null, 'A source recovery change requires the predeparture rendered form');
    departureRecovery = await exact(f.page, ({ installationText, databaseName }) => {
      const recovery = window.sourceReferenceFixture.inbox.createCaptureRecovery({ storage: localStorage, installationText, databaseName,
        assertCurrent: () => localStorage.getItem('kairo-local-record-binding-v1') === installationText });
      return recovery.read();
    }, { installationText: storageBefore.localStorage['kairo-local-record-binding-v1'], databaseName: before.installation.databaseName });
    assert(departureRecovery, 'Ordinary departure must retain a readable recovery envelope');
    assert.deepEqual(departureRecovery.input, departureDraft, 'Departure recovery differs from the exact rendered draft');
    assert.deepEqual(JSON.parse(storageAfter.localStorage[recoveryKey]), departureRecovery, 'Departure recovery contains unparsed fields');
    expectedStorage = { ...expectedStorage, localStorage: { ...storageBefore.localStorage, [recoveryKey]: storageAfter.localStorage[recoveryKey] } };
  }
  assert.deepEqual(storageAfter, expectedStorage, 'Fixture setup changed unrelated localStorage or cache bytes');
  f.observations.push({ kind: 'synthetic-fixture-storage-parity', episode: f.episode, nativeSha256: digest(after),
    storageSha256: digest(storageAfter), parityFile, paritySha256: sha(readFileSync(parityFile)),
    warmCacheFile, warmCacheSha256: sha(readFileSync(warmCacheFile)), warmCacheAdditions: warmCacheAdditions.length,
    ordinaryDepartureRecovery: departureRecovery ? { key: recoveryKey, parsed: departureRecovery, exactRenderedInput: departureDraft } : null });
  await exact(f.page, async () => {
    const f = window.sourceReferenceFixture; let owned = false, release, epoch = 1; const ownerId = crypto.randomUUID();
    await new Promise((done, fail) => navigator.locks.request('kairo-record:kairo-corridor-v1:kairo-ai-log', { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!lock) { fail(new Error('Actual record origin lock unavailable')); return; } owned = true;
      const lifetime = new Promise(resolve => { release = resolve; }); done(); await lifetime;
    }).catch(fail));
    f.installation = f.binding.openLocalRecordBinding({ storage: localStorage, assertOwner: () => owned });
    const { policy, actor, databaseName } = f.installation; f.policy = policy; f.databaseName = databaseName;
    f.writer = { capture: () => ({ ownerId, epoch, sessionId: policy.binding.sessionId }), assert: token => owned && token.ownerId === ownerId && token.epoch === epoch && token.sessionId === policy.binding.sessionId };
    f.release = () => { owned = false; epoch++; release(); }; addEventListener('pagehide', f.release, { once: true });
    f.controllerInstance = await f.controller.createRecordController({ databaseName, policy, actor, writer: f.writer });
    f.publications = [];
    const options = { controller: f.controllerInstance, binding: policy.binding, writer: f.writer,
      validateRecord: record => record?.v === 1 && Array.isArray(record.taken), validateArchive: Array.isArray };
    f.appInstance = await f.app.createRecordApp({ ...options, onPublish: result => f.publications.push(result) });
    f.hostInstance = await f.host.createRecordHost({ ...options, reducers: { 'synthetic.operation-smuggle/1': (_state, input) => ({ patch: {}, operations: [input] }) } });
    if (typeof f.appInstance.captureSourceReference !== 'function' || typeof f.hostInstance.captureSourceReference !== 'function') throw new Error('Required named source-reference APIs missing');
  });
  f.observations.push({ kind: 'synthetic-host-boundary', explanation: 'Actual installed controller, native origin lock, app and host; fixture validation accepts existing v1 roots. The isolated profile worker is unregistered and blocked for this fixture episode. Native storage and all existing cache entries stay unchanged; only proven current-artifact article prefetch additions and parser-validated recovery of the exact rendered draft may finish on ordinary departure. Ordinary UI episodes allow re-registration; no offline claim applies during the fixture interval.' });
}
function validateWarmCacheAdditions(f, before, after, episode) {
  assert.deepEqual(after.map(cache => cache.name), before.map(cache => cache.name), 'Fixture setup changed cache namespaces');
  const additions = [], currentCache = `kairo:${ORIGIN}/:kairo-${manifest.sourceAssetSha256}`;
  for (const previous of before) {
    const next = after.find(cache => cache.name === previous.name);
    const oldEntries = new Map(previous.entries.map(entry => [entry.url, entry]));
    const newEntries = new Map(next.entries.map(entry => [entry.url, entry]));
    assert.equal(oldEntries.size, previous.entries.length); assert.equal(newEntries.size, next.entries.length);
    for (const [url, entry] of oldEntries) assert.deepEqual(newEntries.get(url), entry, 'Fixture setup changed or removed an existing cache entry');
    for (const [url, entry] of newEntries) if (!oldEntries.has(url)) {
      assert.equal(previous.name, currentCache, 'Prefetch addition belongs to another artifact cache');
      const parsed = new URL(url), path = parsed.pathname.slice(1), pinned = manifest.files.find(file => file.path === path);
      assert.equal(parsed.origin, ORIGIN); assert.equal(url, `${ORIGIN}/${path}`); assert.match(path, /^data\/articles\/[^/]+\.json$/u);
      assert(pinned, 'Prefetch path is absent from the pinned artifact'); assert.equal(entry.method, 'GET'); assert.deepEqual(entry.requestHeaders, []);
      assert.equal(entry.bytes, pinned.bytes); assert.equal(entry.sha256, pinned.sha256); assert.equal(entry.status, 200); assert.equal(entry.statusText, '');
      // sw.js responseFromBytes preserves all observed headers except these
      // exact transformations; canonical cache.put(URL, response) uses GET.
      const response = f.warmCacheResponses.find(row => {
        if (row.episode !== episode || row.url !== url || row.method !== 'GET' || row.status !== 200) return false;
        const headers = Object.fromEntries(row.responseHeaders); delete headers['content-encoding']; headers['content-length'] = String(entry.bytes);
        return digest(Object.entries(headers).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) === digest(entry.responseHeaders);
      });
      assert(response, 'Prefetch cache headers lack an exact observed response');
      additions.push({ cache: currentCache, entry, observedResponse: response });
    }
  }
  return additions;
}
async function fixtureStorage(f) {
  return exact(f.page, async () => {
    const cacheEntries = [];
    for (const name of (await caches.keys()).sort()) {
      const cache = await caches.open(name), entries = [];
      for (const request of (await cache.keys()).sort((a, b) => a.url < b.url ? -1 : a.url > b.url ? 1 : 0)) {
        const response = await cache.match(request), bytes = await response.arrayBuffer();
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
        entries.push({ url: request.url, method: request.method, requestHeaders: [...request.headers],
          status: response.status, statusText: response.statusText, responseHeaders: [...response.headers], bytes: bytes.byteLength, sha256 });
      }
      cacheEntries.push({ name, entries });
    }
    return { localStorage: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])), caches: cacheEntries };
  });
}
async function named(f, input, { kind = 'app', changeId = randomUUID(), occurredAt = TIME } = {}) {
  return exact(f.page, async ({ input, kind, meta }) => {
    const f = window.sourceReferenceFixture;
    try { return kind === 'host' ? await f.hostInstance.captureSourceReference(meta, input) : await f.appInstance.captureSourceReference(input); }
    catch (error) { return { status: 'rejected', code: error.code || error.name, message: error.message }; }
  }, { input, kind, meta: { changeId, occurredAt } });
}
async function receive(f, operations, label) {
  for (const operation of operations) assert(['source.reference', 'entity.tombstone', 'entity.restore'].includes(operation.payload.kind));
  const before = await native(f, `${label}-before`);
  const outcome = await exact(f.page, async ({ operations, label }) => {
    const port = window.__sourceReferenceTransport; if (!port?.handle) throw new Error('Synthetic transport has no actual registered adapter');
    const offered = await port.handle({ requestId: `${label}-snapshot`, method: 'snapshot' }); if (!offered.ok) throw new Error('Actual sync snapshot refused');
    if (offered.value.documents.length) throw new Error('Private documents escaped the real sync adapter');
    const channelId = 'synthetic-source-reference-operation-only';
    return port.handle({ requestId: label, method: 'commitReceive', request: { deliveryId: label, expectedRevision: offered.value.revision,
      delivery: { binding: port.binding, operations }, checkpoint: { channelId, expected: offered.value.checkpoints.find(row => row.channelId === channelId)?.value ?? null, next: label } } });
  }, { operations, label });
  assert.equal(outcome.ok, true); const after = await native(f, `${label}-after`); receivedOnly(before, after); assertViews(after);
  for (const operation of operations) assert.deepEqual(after.snapshot.replica.operations.find(row => row.opId === operation.opId), operation);
  f.observations.push({ kind: 'SYNTHETIC-authenticated-operation-only-delivery', label, operations: operations.map(reference), outcome }); return after;
}
async function reopenOffline(f) {
  await f.page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await f.page.reload(); await ready(f); await f.page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await close(f); await launch(f, { offline: true });
}
async function exportUI(f, label) {
  if (!await f.page.locator('#export-store').count()) await f.page.locator('#tray').click();
  const waiting = f.page.waitForEvent('download'); await f.page.locator('#export-store').click(); const download = await waiting;
  const path = join(f.out, `${label}.json`); await download.saveAs(path); return JSON.parse(readFileSync(path));
}
async function failedImport(f, backup, mode) {
  const notices = {
    'foreign-scope': 'This backup belongs to a different learner. Choose a backup for the current learner. Nothing was changed.',
    'corrupt-operation': 'Import could not finish. Check the storage warning and select an unchanged exported JSON file.',
    'extra-journal-authority': 'Import could not finish. Check the storage warning and select an unchanged exported JSON file.',
  };
  assert(Object.hasOwn(notices, mode)); const expected = notices[mode], marker = randomUUID();
  if (!await f.page.locator('#import-file').count()) await f.page.locator('#tray').click();
  const documentURL = f.page.url();
  await f.page.evaluate(marker => {
    const input = document.getElementById('import-file'), notice = document.getElementById('record-portability-status');
    if (!input || !notice) throw new Error('Actual import controls are unavailable');
    const attempt = { marker, changes: 0, noticeAtChange: null }; window.__sourceReferenceImportAttempt = attempt;
    input.addEventListener('change', () => { attempt.changes++; attempt.noticeAtChange = notice.textContent; }, { once: true });
  }, marker);
  await f.page.locator('#import-file').setInputFiles({ name: 'synthetic-refused-source-journal.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await f.page.waitForFunction(({ marker, expected }) => {
    const attempt = window.__sourceReferenceImportAttempt, notice = document.getElementById('record-portability-status');
    return attempt?.marker === marker && attempt.changes === 1 && notice?.getClientRects().length && notice.textContent === expected &&
      document.getElementById('import-file')?.files.length === 0 && document.getElementById('import-store')?.disabled === false;
  }, { marker, expected });
  assert.deepEqual(await f.page.evaluate(() => window.__sourceReferenceImportAttempt), { marker, changes: 1, noticeAtChange: '' });
  assert.equal(f.page.url(), documentURL);
  f.observations.push({ kind: 'actual-import-refusal', mode, notice: expected, sameDocument: true, noticeResetForThisInput: true, inputCleared: true });
}

// The five case bodies follow. No module import starts a browser before the
// explicit immutable-artifact, verifier and helper checks above have passed.
function makePeer(test, name) { const f = peer(test, name); test.peers.push(f); return f; }
async function assertRefused(f, action, label) {
  const before = await native(f, `${label}-before`);
  const publications = await f.page.evaluate(() => window.sourceReferenceFixture?.publications.length ?? null);
  const outcome = await action(); assert.notEqual(outcome.status, 'active', `${label} was accepted`);
  const after = await native(f, `${label}-after`); assert.deepEqual(after.rows, before.rows); assert.deepEqual(after.installation, before.installation);
  assert.equal(await f.page.evaluate(() => window.sourceReferenceFixture?.publications.length ?? null), publications);
  f.observations.push({ kind: 'synthetic-refusal', label, outcome, nativeRowsUnchanged: true, publicationsUnchanged: true }); return outcome;
}
async function syntheticHistory(f, payload, label, dependencies = []) {
  const operation = await exact(f.page, async ({ payload, label, dependencies }) => {
    const f = window.sourceReferenceFixture, current = await f.controllerInstance.snapshot();
    if (current.status !== 'active') throw new Error('Synthetic history controller unavailable');
    const result = await f.controllerInstance.commitLocal({ changeId: label, binding: f.policy.binding,
      expectedRevision: current.snapshot.revision, occurredAt: '2026-09-13T00:00:00.000Z', mutations: [], operations: [{ payload, dependencies }] });
    if (result.status !== 'active') throw new Error(`Synthetic history refused: ${JSON.stringify(result)}`);
    const after = (await f.controllerInstance.snapshot()).snapshot;
    return after.replica.operations.find(op => op.opId === result.receipt.operations[0].opId);
  }, { payload, label, dependencies });
  f.observations.push({ kind: 'SYNTHETIC-low-level-history-premise', label, operation,
    explanation: 'Intentional controller-level fault/history setup; this is not an allowed ordinary source command.' }); return operation;
}
const bodies = {
  async [CASES[0]](test) {
    const f = makePeer(test, 'ordinary'); await launch(f);
    const first = await ordinaryCapture(f, { url: URL_A }, 'link-only');
    const input = captureInput(first.capture), operation = assertSourceCommit(first.before, first.after, input); assertViews(first.after);
    await openReference(f, input, 'saved-link'); unchanged(first.after, await native(f, 'after-opening-link'));
    for (const [label, value] of [['custom-title', { url: URL_B, title: 'Synthetic local title' }],
      ['pasted-body', { url: 'https://local-only.invalid/source#paragraph', text: 'これは、この端末だけに残す試験用の文章です。' }]]) {
      const local = await ordinaryCapture(f, value, label); unchanged(local.before, local.after, ['sourceInbox']);
      assert.deepEqual(local.after.snapshot.actor, local.before.snapshot.actor); assert.deepEqual(local.after.snapshot.replica, local.before.snapshot.replica);
      assert.deepEqual(local.after.snapshot.outbox, local.before.snapshot.outbox);
    }
    await openReference(f, input, 'link-after-local-only-captures'); const beforeReload = await native(f, 'before-reload');
    await f.page.reload(); await ready(f); const reloaded = await native(f, 'after-reload'); assert.deepEqual(reloaded.rows, beforeReload.rows); unchanged(beforeReload, reloaded);
    await reopenOffline(f); const offline = await native(f, 'after-full-offline-reopen'); assert.deepEqual(offline.rows, reloaded.rows); unchanged(reloaded, offline);
    await openReference(f, input, 'offline-rendered-link'); await shot(f, 'ordinary-offline-source-reference');
    await inbox(f); await f.page.locator('#source-capture-url').fill('https://quota.invalid/reference?keep=exact#t=7');
    await f.page.locator('#source-capture-title').fill(''); await f.page.locator('#source-capture-text').fill('');
    const beforeQuota = await native(f, 'ui-quota-before'); await armRecordWriteFailure(f.page, 'quota', { roots: ['sourceInbox'] });
    try {
      await f.page.locator('#source-capture-save').click();
      await f.page.waitForFunction(() => /has not been saved|could not be saved|not saved/u.test(document.getElementById('source-capture-status')?.textContent || ''));
    } finally { const fault = await clearRecordWriteFailure(f.page); assert.equal(fault.fired, 1); f.observations.push({ kind: 'synthetic-native-quota-hook-on-ordinary-form', fault }); }
    assert.equal(await f.page.locator('#source-capture-url').inputValue(), 'https://quota.invalid/reference?keep=exact#t=7');
    assert.equal(await f.page.locator('#source-capture-title').inputValue(), ''); assert.equal(await f.page.locator('#source-capture-text').inputValue(), '');
    assert.deepEqual((await native(f, 'ui-quota-after')).rows, beforeQuota.rows);
    f.observations.push({ kind: 'ordinary-operation-identity', operation: reference(operation) }); await close(f);
  },
  async [CASES[1]](test) {
    const a = makePeer(test, 'a'), b = makePeer(test, 'b'); await launch(a);
    const a1 = await ordinaryCapture(a, { url: URL_A }, 'a-reference-one'); const opA1 = assertSourceCommit(a1.before, a1.after, captureInput(a1.capture));
    const a2 = await ordinaryCapture(a, { url: 'https://second.invalid/path?original=1#t=31' }, 'a-reference-two');
    const opA2 = assertSourceCommit(a2.before, a2.after, captureInput(a2.capture)); const aSaved = await native(a, 'a-saved'); await close(a);
    await launch(b); const b1 = await ordinaryCapture(b, { url: URL_B }, 'b-reference-one'); const opB1 = assertSourceCommit(b1.before, b1.after, captureInput(b1.capture));
    assert.deepEqual(aSaved.snapshot.replica.policy.binding.accountId, b1.after.snapshot.replica.policy.binding.accountId);
    assert.deepEqual(aSaved.snapshot.replica.policy.binding.learnerId, b1.after.snapshot.replica.policy.binding.learnerId);
    assert.notDeepEqual(aSaved.installation.actor, b1.after.installation.actor); assert.notEqual(aSaved.installation.binding.sessionId, b1.after.installation.binding.sessionId);
    assert.notEqual(aSaved.installation.databaseName, b1.after.installation.databaseName);
    const localBody = await ordinaryCapture(b, { url: 'https://private-b.invalid/local', title: 'B local source body', text: '同期で本文を置き換えないための試験文。' }, 'b-local-body');
    assert.deepEqual(localBody.before.snapshot.outbox, localBody.after.snapshot.outbox);
    await inbox(b); const pending = await receive(b, [opA2], 'b-missing-predecessor');
    assert(pending.snapshot.replica.pending.some(row => row.operation.opId === opA2.opId)); assert(!pending.views.some(view => view.captureId === a2.capture.id));
    assert.equal(await b.page.locator(`[data-source-capture="${a2.capture.id}"]`).count(), 0);
    await hostBoundary(b);
    const duplicateBefore = await native(b, 'b-duplicate-payload-before');
    const duplicateOutcome = await named(b, captureInput(a1.capture)); assert.equal(duplicateOutcome.status, 'active');
    const duplicateAfter = await native(b, 'b-duplicate-payload-after'); const opB2 = assertSourceCommit(duplicateBefore, duplicateAfter, captureInput(a1.capture));
    const conflictInput = { ...captureInput(a2.capture), encounterUrl: 'https://second-choice.invalid/path?different=1#t=41' };
    const conflictBefore = await native(b, 'b-concurrent-choice-before'); assert.equal((await named(b, conflictInput)).status, 'active');
    const conflictAfter = await native(b, 'b-concurrent-choice-after'); const opB3 = assertSourceCommit(conflictBefore, conflictAfter, conflictInput);
    // These ordinary app APIs allocate local operations. Same payload and
    // concurrent unequal identity are intentional synthetic authoring premises.
    await close(b); await launch(b); await inbox(b);
    const draft = { title: 'Unsubmitted source draft', url: 'https://draft.invalid/exact?stay=1#draft', text: '受信のあとも、この未送信の文章を残す。' };
    await b.page.locator('#source-capture-title').fill(draft.title); await b.page.locator('#source-capture-url').fill(draft.url); await b.page.locator('#source-capture-text').fill(draft.text);
    await b.page.locator('#source-capture-text').focus();
    const bReady = await receive(b, [opA1], 'b-predecessor-arrives');
    for (const [key, value] of Object.entries(draft)) assert.equal(await b.page.locator(`#source-capture-${key}`).inputValue(), value);
    assert.equal(await b.page.evaluate(() => document.activeElement?.id), 'source-capture-text');
    assert.equal(bReady.views.find(view => view.captureId === a1.capture.id).headReferences.length, 1);
    assert.equal(bReady.views.find(view => view.captureId === a1.capture.id).headReferences[0].operationRefs.length, 2);
    assert.equal(await b.page.locator(`[data-source-capture="${a1.capture.id}"]`).count(), 1);
    await assertConflictUI(b, a2.capture.id, [a2.capture.encounterUrl, conflictInput.encounterUrl]);
    const duplicateDelivery = await receive(b, [opA2, opA1], 'b-exact-retransmission');
    assert.deepEqual(duplicateDelivery.snapshot.replica.operations, bReady.snapshot.replica.operations);
    assert.deepEqual(duplicateDelivery.record, bReady.record); await shot(b, 'received-reference-and-explicit-conflict'); await close(b);
    await launch(a); const reordered = await receive(a, [opB3, opB2], 'a-missing-b-predecessor');
    assert(reordered.snapshot.replica.pending.some(row => row.operation.opId === opB2.opId));
    const aReady = await receive(a, [opB1], 'a-b-predecessor-arrives'); await inbox(a);
    assert.equal(aReady.views.find(view => view.captureId === a1.capture.id).headReferences[0].operationRefs.length, 2);
    assert.equal(await a.page.locator(`[data-source-capture="${a1.capture.id}"]`).count(), 1);
    await assertConflictUI(a, a2.capture.id, [a2.capture.encounterUrl, conflictInput.encounterUrl]);
    assert.deepEqual(orderedOperations(aReady.snapshot.replica.operations), orderedOperations(duplicateDelivery.snapshot.replica.operations));
    await openReference(a, captureInput(b1.capture), 'received-b-link'); const beforeReopen = await native(a, 'a-before-offline');
    await reopenOffline(a); await inbox(a); await assertConflictUI(a, a2.capture.id, [a2.capture.encounterUrl, conflictInput.encounterUrl]);
    const afterReopen = await native(a, 'a-offline-reopened'); unchanged(beforeReopen, afterReopen); assert.deepEqual(afterReopen.snapshot.replica, beforeReopen.snapshot.replica); await close(a);
    await launch(b); await inbox(b); await assertConflictUI(b, a2.capture.id, [a2.capture.encounterUrl, conflictInput.encounterUrl]);
    const bReopen = await native(b, 'b-reopened'); assert.deepEqual(bReopen.record, duplicateDelivery.record); assert.deepEqual(bReopen.snapshot.replica, duplicateDelivery.snapshot.replica);
    await openReference(b, captureInput(a1.capture), 'received-identical-reference'); await close(b);
  },
  async [CASES[2]](test) {
    const f = makePeer(test, 'native-guards'); await launch(f); await hostBoundary(f);
    const input = { captureId: uuid(801), encounterUrl: URL_A, capturedAt: TIME };
    const invalid = [null, { ...input, captureId: 'not-a-uuid' }, { ...input, captureId: input.captureId.toUpperCase() },
      { ...input, capturedAt: '2026-09-13' }, { ...input, encounterUrl: 'data:text/plain,source' },
      { ...input, encounterUrl: ` ${URL_A}` }, { ...input, encounterUrl: 'https://name:password@example.invalid/' },
      { ...input, encounterUrl: 'https://example.invalid/a\\b' }, { ...input, encounterUrl: 'https://example.invalid/a\npath' },
      { ...input, encounterUrl: `https://example.invalid/${'x'.repeat(4097)}` },
      ...['body', 'title', 'text', 'permissions', 'actor', 'binding', 'operations', 'generation', 'deviceSyncBasis', 'authority'].map(key => ({ ...input, [key]: key === 'generation' ? null : 'synthetic-forbidden' }))];
    // The UUID fixture above uses only digits; give uppercase an actual letter.
    invalid[2] = { ...input, captureId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'.toUpperCase() };
    for (const kind of ['app', 'host']) for (let index = 0; index < invalid.length; index++)
      await assertRefused(f, () => named(f, invalid[index], { kind }), `${kind}-invalid-${index}`);
    for (const kind of ['app', 'host']) await assertRefused(f, () => exact(f.page, async ({ kind, input }) => {
      const f = window.sourceReferenceFixture;
      try {
        return kind === 'app' ? await f.appInstance.write(() => ({ patch: {}, operations: [{ payload: { kind: 'source.reference', ...input, generation: null }, dependencies: [] }] }))
          : await f.hostInstance.dispatch({ changeId: crypto.randomUUID(), occurredAt: '2026-09-13T00:00:00.000Z', type: 'synthetic.operation-smuggle/1', input: { payload: { kind: 'source.reference', ...input, generation: null }, dependencies: [] } });
      } catch (error) { return { status: 'rejected', code: error.code || error.name }; }
    }, { kind, input }), `${kind}-generic-operation-smuggling`);
    const before = await native(f, 'named-before'), meta = { kind: 'host', changeId: uuid(802), occurredAt: TIME };
    const saved = await named(f, input, meta); assert.equal(saved.status, 'active'); assert.equal(saved.replayUiEffects, true);
    const after = await native(f, 'named-after'); const first = assertSourceCommit(before, after, input);
    const retried = await named(f, input, meta); assert.equal(retried.status, 'active'); assert.equal(retried.replayUiEffects, false);
    assert.deepEqual(retried.receipt.operations, [reference(first)]); assert.deepEqual((await native(f, 'exact-meta-retry')).rows, after.rows);
    await assertRefused(f, () => named(f, { ...input, encounterUrl: URL_B }, meta), 'changed-exact-command-id');
    for (const kind of ['app', 'host']) await assertRefused(f, () => named(f, { ...input, encounterUrl: URL_B }, { kind }), `${kind}-changed-capture-id`);
    assert.equal((await named(f, input)).status, 'active'); const twice = await native(f, 'distinct-command-identical-payload'); assertSourceCommit(after, twice, input); assertViews(twice);
    const view = twice.views.find(row => row.captureId === input.captureId); assert.equal(view.headReferences.length, 1); assert.equal(view.headReferences[0].operationRefs.length, 2);
    await syntheticHistory(f, { kind: 'entity.tombstone', target: { kind: 'source-reference', id: input.captureId }, reason: 'user-deleted' }, 'synthetic-reference-deletion', view.projection.heads);
    const hidden = await native(f, 'hidden-reference'); assert.equal(hidden.views.find(row => row.captureId === input.captureId).headReferences.length, 0);
    for (const kind of ['app', 'host']) await assertRefused(f, () => named(f, input, { kind }), `${kind}-deleted-reference`);
    const conflictInput = { ...input, captureId: uuid(803) }; assert.equal((await named(f, conflictInput)).status, 'active');
    await syntheticHistory(f, { kind: 'source.reference', ...conflictInput, encounterUrl: URL_B, generation: null }, 'synthetic-reference-conflict');
    const conflict = await native(f, 'conflicting-reference'); assert.equal(conflict.views.find(row => row.captureId === conflictInput.captureId).headReferences.length, 2);
    for (const kind of ['app', 'host']) await assertRefused(f, () => named(f, conflictInput, { kind }), `${kind}-conflicting-reference`);
    await close(f);
  },
  async [CASES[3]](test) {
    for (const mode of ['quota', 'abort']) {
      const f = makePeer(test, mode); await launch(f); await hostBoundary(f);
      const input = { captureId: uuid(mode === 'quota' ? 811 : 812), encounterUrl: URL_A, capturedAt: TIME };
      const before = await native(f, `${mode}-before`); await armRecordWriteFailure(f.page, mode, { roots: ['sourceInbox'] });
      let outcome;
      try { outcome = await named(f, input, { kind: mode === 'quota' ? 'app' : 'host' }); assert.notEqual(outcome.status, 'active'); }
      finally { const fault = await clearRecordWriteFailure(f.page); assert.equal(fault.fired, 1); f.observations.push({ kind: 'synthetic-native-transaction-fault', fault, outcome }); }
      assert.deepEqual((await native(f, `${mode}-after`)).rows, before.rows);
      assert.equal(await f.page.evaluate(() => window.sourceReferenceFixture.publications.length), 0); await close(f);
    }
    const stale = makePeer(test, 'stale-owner'); await launch(stale); await hostBoundary(stale);
    const beforeStale = await native(stale, 'before-owner-release'); await stale.page.evaluate(() => window.sourceReferenceFixture.release());
    const refused = await named(stale, { captureId: uuid(813), encounterUrl: URL_A, capturedAt: TIME }); assert.notEqual(refused.status, 'active');
    assert.deepEqual((await native(stale, 'after-stale-command')).rows, beforeStale.rows); assert.equal(await stale.page.evaluate(() => window.sourceReferenceFixture.publications.length), 0); await close(stale);
    const late = makePeer(test, 'durable-owner-loss'); await launch(late); await hostBoundary(late);
    const input = { captureId: uuid(814), encounterUrl: URL_B, capturedAt: TIME }, before = await native(late, 'before-durable-owner-loss');
    await late.page.evaluate(() => {
      const f = window.sourceReferenceFixture, original = f.controllerInstance.commitLocal.bind(f.controllerInstance);
      // Synthetic lifecycle fault after the genuine native commit, before the
      // controller result reaches the app/host. No result or operation is forged.
      f.controllerInstance.commitLocal = async request => { const result = await original(request); if (request.operations?.[0]?.payload.kind === 'source.reference') { f.release(); f.ownerLossFired = true; } return result; };
    });
    const uncertain = await named(late, input); assert.notEqual(uncertain.status, 'active');
    assert.equal(await late.page.evaluate(() => window.sourceReferenceFixture.ownerLossFired), true);
    assert.equal(await late.page.evaluate(() => window.sourceReferenceFixture.publications.length), 0);
    const durable = await native(late, 'durable-but-unpublished'); const operation = assertSourceCommit(before, durable, input);
    const command = durable.documents.find(row => row.collection === 'kairo:record-host-commands' && row.value.sourceReference?.operation.opId === operation.opId).value;
    late.observations.push({ kind: 'synthetic-durable-owner-loss', uncertain, operation: reference(operation), publications: 0 });
    await close(late); await launch(late); await hostBoundary(late);
    const retry = await named(late, input, { kind: 'host', changeId: command.changeId, occurredAt: command.occurredAt });
    assert.equal(retry.status, 'active'); assert.equal(retry.replayUiEffects, false); assert.deepEqual(retry.receipt.operations, [reference(operation)]);
    assert.deepEqual((await native(late, 'reopened-exact-durable-retry')).rows, durable.rows); await close(late);
  },
  async [CASES[4]](test) {
    const a = makePeer(test, 'backup-source'), b = makePeer(test, 'backup-target'); await launch(a);
    const saved = await ordinaryCapture(a, { url: URL_A }, 'backup-reference'); const input = captureInput(saved.capture); assertSourceCommit(saved.before, saved.after, input);
    const exported = await exportUI(a, 'actual-v2-export'); assert.equal(exported.version, 2); assert.equal(exported.counts.syncOperations, 1);
    assert.deepEqual(exported.journal, saved.after.journal); assert.deepEqual(exported.journal.operations, saved.after.snapshot.replica.operations);
    assert.equal(exported.sha256.journal, digest(exported.journal)); await close(a);
    await launch(b); const before = await native(b, 'fresh-admitted-target'); assert.notDeepEqual(before.installation.actor, saved.after.installation.actor);
    assert.notEqual(before.installation.binding.sessionId, saved.after.installation.binding.sessionId);
    assert.equal(before.record.teacherDrafts, null); assert.equal(before.record.sentenceDrafts, null);
    const expectedRecord = { ...before.record };
    b.observations.push({ kind: 'synthetic-import-fixture-preserves-absent-drafts', expectedRecordSha256: digest(expectedRecord),
      explanation: 'The fresh target has exactly null teacherDrafts and sentenceDrafts. The ordinary importer preserves both absent libraries; every other target root also remains exact.' });
    // The target supplies its own current document roots. Only source journal
    // history is imported through the actual v2 file UI, never peer authority.
    await restoreAppFixture(b.page, expectedRecord, { archive: before.archive.turns, journal: exported.journal }); await ready(b);
    const restored = await native(b, 'same-scope-v2-restored'); assert.deepEqual(restored.record, expectedRecord);
    unchanged({ ...before, record: expectedRecord }, restored); assert.deepEqual(restored.snapshot.actor, before.snapshot.actor);
    assert.deepEqual(restored.snapshot.replica.operations, exported.journal.operations); assert.deepEqual(restored.snapshot.outbox, exported.journal.operations); assertViews(restored);
    assert.equal(restored.record.sourceInbox?.entries.some(row => row.id === input.captureId) || false, false, 'Journal restore cannot manufacture local source documents');
    await openReference(b, input, 'restored-derived-reference'); const reexported = await exportUI(b, 'actual-restored-v2-export'); assert.deepEqual(reexported.journal, exported.journal);
    await restoreAppFixture(b.page, restored.record, { archive: restored.archive.turns }); await ready(b);
    const v1 = await native(b, 'v1-document-only-import-preserves-journal'); unchanged(restored, v1); assert.deepEqual(v1.snapshot.replica, restored.snapshot.replica); assert.deepEqual(v1.snapshot.actor, restored.snapshot.actor);
    for (const mode of ['foreign-scope', 'corrupt-operation', 'extra-journal-authority']) {
      const journal = JSON.parse(JSON.stringify(exported.journal));
      if (mode === 'foreign-scope') journal.scope.accountId = `local-account:${uuid(999)}`;
      else if (mode === 'corrupt-operation') journal.operations[0].payload.encounterUrl = URL_B;
      else journal.actor = saved.after.installation.actor;
      const { sha256: ignored, ...body } = journal; assert.equal(typeof ignored, 'string'); journal.sha256 = digest(body);
      const file = createAppBackupFixture(v1.record, v1.archive.turns, journal);
      if (!await b.page.locator('#import-file').count()) await b.page.locator('#tray').click();
      const beforeFailure = await native(b, `${mode}-before`); await failedImport(b, file, mode); const afterFailure = await native(b, `${mode}-after`);
      assert.deepEqual(afterFailure.rows, beforeFailure.rows); assert.deepEqual(afterFailure.installation, beforeFailure.installation);
      b.observations.push({ kind: 'synthetic-v2-backup-refusal', mode, nativeRowsUnchanged: true });
    }
    await b.page.goto(`${ORIGIN}/index.html?entry=shelf&ui=bi`); await ready(b); await openReference(b, input, 'post-refusal-reference');
    const beforeOffline = await native(b, 'backup-before-offline'); await reopenOffline(b); await openReference(b, input, 'backup-offline-reference');
    const afterOffline = await native(b, 'backup-offline-reopened'); unchanged(beforeOffline, afterOffline); assert.deepEqual(afterOffline.snapshot.replica, beforeOffline.snapshot.replica); await close(b);
  },
};
async function assertConflictUI(f, captureId, urls) {
  const conflict = f.page.locator(`[data-source-reference-conflict="${captureId}"]`); await conflict.waitFor();
  assert.equal(await f.page.locator(`[data-source-capture="${captureId}"]`).count(), 0, 'Ambiguous source cannot silently choose a title button');
  const actual = await conflict.locator('a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  assert.deepEqual([...new Set(actual)].sort(), [...new Set(urls)].sort(), 'Every exact conflicting URL must remain an explicit choice');
  f.observations.push({ kind: 'ordinary-explicit-conflict', captureId, exactUrls: actual });
}

let bookendsPassed = false, fatal = null;
const selected = engines.flatMap(engine => CASES.filter(name => !filters.size || filters.has(name)).map(name => ({ engine, name })));
try {
  for (const item of selected) {
    const test = { ...item, out: join(OUT, item.engine, item.name), peers: [] }; mkdirSync(test.out, { recursive: true });
    const began = Date.now(); let error = null;
    try { await bodies[item.name](test); }
    catch (failure) {
      error = String(failure.stack || failure);
      for (const f of test.peers) if (f.page && !f.page.isClosed()) await shot(f, 'failure').catch(() => undefined);
    } finally {
      for (const f of test.peers) await close(f).catch(failure => { error ||= String(failure.stack || failure); });
    }
    for (const f of test.peers) { if (f.errors.length || f.externalRequests.length) error ||= `Unexpected runtime/external errors: ${JSON.stringify({ errors: f.errors, externalRequests: f.externalRequests })}`; }
    const result = { ...item, passed: error === null, elapsedMs: Date.now() - began, error,
      peers: test.peers.map(({ peer: name, episode, browserVersion, observations, snapshots, lifecycle, errors, externalRequests }) => ({ name, episode, browserVersion, observations, snapshots, lifecycle, errors, externalRequests })) };
    results.push(result); writeFileSync(join(test.out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(`${item.engine} ${item.name}: ${result.passed ? 'PASS' : 'FAIL'}`);
    if (!result.passed) break;
  }
  verifyBookends(); bookendsPassed = true;
} catch (error) { fatal = String(error.stack || error); }
finally {
  await new Promise(done => server.close(done));
  const receipt = { startedAt, finishedAt: new Date().toISOString(), artifactSha256: manifest.artifactSha256,
    sourceAssetSha256: manifest.sourceAssetSha256, verifierSha256, helperSha256, resolverSha256,
    audioOutput: TEST_AUDIO_OUTPUT, bookendsPassed, activeContexts, selected, results, fatal,
    passed: !fatal && bookendsPassed && activeContexts === 0 && results.length === selected.length && results.every(row => row.passed),
    evidenceLimits: ['SYNTHETIC native enrollment and authenticated transport premises; no live Apple/device/account acceptance.',
      'Every peer context is serialized; only persisted operation envelopes cross the synthetic relay, never documents or actor/session installation rows.',
      'External link click intent is observed with navigation suppressed; no source retrieval or permission grant.',
      'Fault hooks and controller-level conflicting/deleted history are labeled synthetic, separate from ordinary controls.',
      'Synthetic host fixtures unregister only their isolated profile worker and close all controlled pages. Native storage/existing caches/unrelated localStorage stay exact; additions require same-artifact article bytes and observed response headers. Recovery may preserve only the exact predeparture draft. Ordinary episodes re-register; no offline claim covers the fixture interval.',
      'No sound controls; native audio output is silenced before every navigation. No audio-quality claim.'] };
  writeFileSync(join(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ passed: receipt.passed, bookendsPassed, activeContexts, completedCases: results.length, selectedCases: selected.length }));
  if (!receipt.passed) process.exitCode = 1;
}
