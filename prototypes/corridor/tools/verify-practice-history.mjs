/** Actual Corridor UI journeys against one supplied immutable release.
 * Ordinary attempts are made with rendered controls. Received-history cases
 * explicitly provision synthetic native admission/operation-only transport;
 * adversarial operation, network and storage premises are labeled separately.
 * No test pairing establishes real account or cross-device authority. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:https';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, webkit } from 'playwright-core';
import { readAppRecordSnapshot, readAppRecord, waitForAppRecord, armRecordWriteFailure, clearRecordWriteFailure } from './record-test-support.mjs';
import { silenceBrowserAudio, TEST_AUDIO_OUTPUT } from './browser-audio-silence.mjs';

const LEGACY_CASES = [
  'two-completed-attempts-and-failed-save-actions',
  'saved-form-survives-changed-upstream-and-no-set-fetch-reload',
  'real-offline-reload-retains-answers-without-set-fetch',
  'legacy-evidence-and-full-export-restore-keep-exact-history',
  'phone-fit-and-44px-practice-controls',
  'wall-clock-rollback-keeps-observed-time-and-monotonic-duration',
];
const RECEIVED_CASES = [
  'received-ordinary-submit-stop-operation-relay-restart-offline',
  'received-local-dedup-conflicts-and-keyboard-focus',
  'received-exact-labels-and-unavailable-boundaries',
  'received-hidden-restored-protected-and-stale-resolution',
];
const CASES = [...LEGACY_CASES, ...RECEIVED_CASES];
if (process.argv.includes('--list')) {
  assert.equal(process.argv.length, 3, '--list is a static inventory, not an execution');
  console.log(CASES.join('\n')); process.exit(0);
}
assert(process.argv.slice(2).every(arg => arg.startsWith('--case=')), 'Only --list or --case=<exact-name> is supported');
const FILTERS = new Set(process.argv.slice(2).map(arg => arg.slice(7)));
for (const name of FILTERS) assert(CASES.includes(name), `Unknown case ${name}`);
const requested = name => !FILTERS.size || FILTERS.has(name);

const hash = (value) => createHash('sha256').update(value).digest('hex');
const inside = (parent, child) => {
  const part = relative(parent, child);
  return !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
};
assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Supply KAIRO_SITE_DIR');
const ROOT = realpathSync(process.env.KAIRO_SITE_DIR);
const EXPECTED = process.env.KAIRO_ARTIFACT_SHA256 || process.env.KAIRO_PRACTICE_SITE_SHA256;
if (process.env.KAIRO_ARTIFACT_SHA256 && process.env.KAIRO_PRACTICE_SITE_SHA256)
  assert.equal(process.env.KAIRO_ARTIFACT_SHA256, process.env.KAIRO_PRACTICE_SITE_SHA256);
assert.match(EXPECTED || '', /^[a-f0-9]{64}$/u, 'Supply the expected release digest');
const OUT = resolve(
  process.env.KAIRO_EVIDENCE_DIR ||
    resolve(homedir(), '.dharma/bunki_audit/2026-09-10/practice-history'),
);
mkdirSync(OUT, { recursive: true });
assert(!existsSync(resolve(OUT, 'receipt.json')), 'Use a fresh evidence directory');
const evidenceRoots = [resolve(homedir(), '.dharma')];
if (process.env.CI && process.env.RUNNER_TEMP) evidenceRoots.push(process.env.RUNNER_TEMP);
assert(evidenceRoots.some((path) => existsSync(path) && inside(realpathSync(path), realpathSync(OUT))),
  'Evidence belongs under ~/.dharma or CI RUNNER_TEMP');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'build-identity.json'), 'utf8'));
assert.equal(manifest.product, 'KAIRO');
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.artifactSha256, EXPECTED);
assert.equal(hash(JSON.stringify(manifest.files)), EXPECTED);
const walk = (directory) =>
  readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const file = resolve(directory, name);
      const stat = lstatSync(file);
      assert(!stat.isSymbolicLink(), 'Runtime artifact may not contain symlinks');
      if (stat.isDirectory()) return walk(file);
      assert(stat.isFile());
      return [file];
    });
const files = walk(ROOT)
  .filter((file) => file !== resolve(ROOT, 'build-identity.json'))
  .map((file) => {
    const bytes = readFileSync(file);
    return {
      path: relative(ROOT, file).split(sep).join('/'),
      bytes: bytes.length,
      sha256: hash(bytes),
    };
  });
assert.deepEqual(files, manifest.files, 'Every served byte belongs to the supplied release');
const { selectPractice } = await import(pathToFileURL(resolve(ROOT, 'assessment-controller.mjs')).href);
const sourcePath = fileURLToPath(import.meta.url);
const sourceSha256 = hash(readFileSync(sourcePath));
const helperPaths = ['record-test-support.mjs', 'browser-audio-silence.mjs'];
const helperSha256 = Object.fromEntries(helperPaths.map(name => [name, hash(readFileSync(new URL(name, import.meta.url)))]));
function bookends() {
  assert.equal(hash(readFileSync(sourcePath)), sourceSha256, 'Verifier source stayed fixed');
  for (const name of helperPaths) assert.equal(hash(readFileSync(new URL(name, import.meta.url))), helperSha256[name], name);
  assert.deepEqual(JSON.parse(readFileSync(resolve(ROOT, 'build-identity.json'), 'utf8')), manifest);
  const actual = walk(ROOT).filter(file => file !== resolve(ROOT, 'build-identity.json')).map(file => {
    const bytes = readFileSync(file); return { path: relative(ROOT, file).split(sep).join('/'), bytes: bytes.length, sha256: hash(bytes) };
  });
  assert.deepEqual(actual, files, 'Exact artifact file inventory and bytes stayed fixed');
}
mkdirSync(resolve(OUT, 'verifier-source'));
for (const name of ['verify-practice-history.mjs', ...helperPaths])
  writeFileSync(resolve(OUT, 'verifier-source', name), readFileSync(new URL(name, import.meta.url)));
writeFileSync(resolve(OUT, 'build-identity.json'), JSON.stringify(manifest, null, 2) + '\n');
const set = JSON.parse(readFileSync(resolve(ROOT, 'data/mock/sets/n5-01.json'), 'utf8'));
const items = set.sections.flatMap((section) => section.items);
assert.equal(items.length, 18, 'This journey uses the real 18-item N5-01 fixture');
assert.equal(set.approved, false);
const browserName = process.env.KAIRO_BROWSER || 'chromium';
assert(['chromium', 'webkit'].includes(browserName), 'Supported engine is chromium or webkit');
const offlineFault = process.env.KAIRO_PRACTICE_OFFLINE_FAULT || 'context-offline';
assert(['context-offline', 'server-disconnected'].includes(offlineFault));
const results = [];
const observations = {};
const externalRequests = [], lifecycle = [];
const httpRequests = [];
const httpRequestDetails = [];
let networkPhase = 'online';
let serverConnected = true;
let servedResponses = 0;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};
const certPath = resolve(OUT, 'synthetic-localhost-cert.pem');
const keyPath = resolve(OUT, 'synthetic-localhost-key.pem');
execFileSync(
  'openssl',
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
  ],
  { stdio: 'ignore' },
);
const server = createServer(
  { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    httpRequests.push(pathname);
    const requestDetail = {
      index: httpRequests.length, pathname, method: request.method,
      receivedAt: Date.now(), phase: networkPhase,
      referer: request.headers.referer || null,
      fetchDestination: request.headers['sec-fetch-dest'] || null,
      serverConnected,
    };
    httpRequestDetails.push(requestDetail);
    response.on('finish', () => Object.assign(requestDetail, {
      finishedAt: Date.now(), finishPhase: networkPhase, status: response.statusCode,
    }));
    if (!serverConnected) {
      request.socket.destroy();
      return;
    }
    servedResponses += 1;
    requestDetail.servedResponseNumber = servedResponses;
    if (pathname === '/__practice_probe') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><title>Synthetic practice probe</title>');
      return;
    }
    const file = resolve(ROOT, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!inside(ROOT, file) || !existsSync(file) || !lstatSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] || 'application/octet-stream',
    });
    response.end(readFileSync(file));
  },
);
rmSync(keyPath);
rmSync(certPath);
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `https://127.0.0.1:${server.address().port}`;
let browser, engineVersion, receivedContexts = 0;
const opaqueRoot = { version: 9, notes: ['Synthetic future practice field', { untouched: true }] };
const seed = { v: 1, taken: [], srs: {}, revlog: [], obslog: [], futurePracticeWidget: opaqueRoot };
// Test authority only, fixed independently before either profile boots or any
// backup exists. This does not authenticate, pair or authorize a real learner.
const restoreFixtureScope = Object.freeze({
  accountId: `local-account:${randomUUID()}`,
  learnerId: `local-learner:${randomUUID()}`,
});
function admittedInstallation(scope) {
  return {
    format: 'kairo-local-record-binding', v: 1,
    binding: { ...scope, sessionId: `local-session:${randomUUID()}` },
    actor: { deviceId: `local-device:${randomUUID()}`, incarnationId: `local-installation:${randomUUID()}` },
    databaseName: `kairo-local-record:${randomUUID()}`,
  };
}

async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
  assert.equal(await page.evaluate(() => globalThis[Symbol.for('kairo.test.silent-audio.v1')] === true), true);
}
async function boot(page) {
  await page.goto(`${base}/index.html?entry=shelf&ui=bi`, { waitUntil: 'load' });
  await ready(page);
}
async function fresh(record = seed, options = {}) {
  browser ||= await ({ chromium, webkit })[browserName].launch({ headless: true,
    ...(browserName === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--ignore-certificate-errors'] } : {}) });
  engineVersion = browser.version();
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1100, height: 900 },
    serviceWorkers: options.serviceWorkers || 'block',
    ignoreHTTPSErrors: true,
  });
  await silenceBrowserAudio(context);
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === base) return route.continue();
    externalRequests.push(route.request().url()); return route.abort();
  });
  const errors = [];
  const diagnostics = [];
  const setRequests = [];
  context.on('page', (page) => {
    page.on('pageerror', (error) => {
      errors.push(error.message);
      diagnostics.push({ kind: 'pageerror', message: error.message, stack: error.stack });
    });
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type()))
        diagnostics.push({
          kind: `console-${message.type()}`,
          text: message.text(),
          location: message.location(),
        });
    });
    page.on('requestfailed', (request) =>
      diagnostics.push({ kind: 'requestfailed', url: request.url(), failure: request.failure() }),
    );
    page.on('request', (request) => {
      if (/\/data\/mock\/sets\//u.test(request.url())) setRequests.push(request.url());
    });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  await page.goto(`${base}/__practice_probe`);
  const installation = options.admittedScope ? admittedInstallation(options.admittedScope) : null;
  await page.evaluate(({ record, installation }) => {
    // Explicit synthetic already-admitted scope fixture. Never read a backup
    // to establish this binding; session, actor and database are fresh here.
    if (installation) localStorage.setItem('kairo-local-record-binding-v1', JSON.stringify(installation));
    localStorage.setItem('kairo-corridor-v1', JSON.stringify(record));
  }, { record, installation });
  await boot(page);
  return { context, page, errors, setRequests, diagnostics };
}
async function record(page) {
  return readAppRecord(page);
}
async function selected(page, attemptId) {
  return selectPractice((await record(page)).assessmentLibrary, attemptId);
}
async function waitSelected(page, predicate, description) {
  let value;
  await waitForAppRecord(page, (record) => {
    value = selectPractice(record.assessmentLibrary);
    return value && predicate(value);
  }, { description });
  return value;
}
async function door(page) {
  await page.locator('#mock-link').click();
  await page.waitForSelector('#exam-legacy, [data-mock-set="n5-01"], #mock-next, #mock-done');
  if (await page.locator('#exam-legacy').count()) await page.locator('#exam-legacy').click();
  await page.waitForSelector('[data-mock-set="n5-01"], #mock-next, #mock-done');
}
async function earlierExercises(page) {
  await page.waitForSelector('#exam-legacy, [data-mock-set="n5-01"]');
  if (await page.locator('#exam-legacy').count()) await page.locator('#exam-legacy').click();
  await page.waitForSelector('[data-mock-set="n5-01"]');
}
async function start(page) {
  await page.locator('[data-mock-set="n5-01"]').click();
  await page.waitForSelector('#mock-next');
  assert.equal((await selected(page)).run.ix, 0);
}
async function choose(page, choice) {
  const before = await selected(page);
  await page.locator(`[data-mock-opt="${choice}"]`).click();
  await page.waitForFunction((choice) => document.querySelector(`[data-mock-opt="${choice}"]`)?.getAttribute('aria-pressed') === 'true', choice);
  assert.equal(
    await page.locator(`[data-mock-opt="${choice}"]`).getAttribute('aria-pressed'),
    'true',
  );
  const value = await waitSelected(page, (value) => value.run.answers[before.run.ix] === choice, 'saved practice answer');
  assert.equal(value.run.answers[value.run.ix], choice);
}
async function advance(page) {
  const before = await selected(page);
  await page.locator('#mock-next').click();
  const after = await waitSelected(page, (value) => value.run.ix === before.run.ix + 1, 'saved next practice question');
  assert.equal(after.run.ix, before.run.ix + 1);
}
async function previous(page) {
  const before = await selected(page);
  await page.locator('#mock-prev').click();
  await waitSelected(page, (value) => value.run.ix === before.run.ix - 1, 'saved previous practice question');
}
async function done(page) {
  await page.locator('#mock-done').click();
  await earlierExercises(page);
  await waitForAppRecord(page, (record) => record.assessmentLibrary?.activeAttemptId === null,
    { description: 'cleared practice active pointer' });
}
async function finish(page, answers, from = 0) {
  for (let index = from; index < items.length; index += 1) {
    assert.equal((await selected(page)).run.ix, index);
    await choose(page, answers[index]);
    await advance(page);
  }
  await page.waitForSelector('#mock-done');
  assert.equal((await selected(page)).attempt.status, 'submitted');
}
async function quota(page, enabled) {
  if (enabled) return armRecordWriteFailure(page, 'quota', { roots: ['assessmentLibrary'] });
  return clearRecordWriteFailure(page);
}
async function failedSave(page, selector) {
  const before = (await record(page)).assessmentLibrary;
  await quota(page, true);
  try {
    await page.locator(selector).click();
    await page.waitForFunction(() => window.__recordTestFault?.fired > 0 && document.getElementById('store-alert')?.hidden === false);
    assert.deepEqual(
      (await record(page)).assessmentLibrary,
      before,
      'Rejected save leaves stored facts unchanged',
    );
    const notice = page.locator('#store-alert');
    assert.equal(await notice.isVisible(), true, 'A failed save is visible');
    assert.match(await notice.innerText(), /could not be (?:saved|confirmed)/iu);
  } finally {
    const fault = await quota(page, false);
    assert(fault.fired > 0, 'The rejected command reached the native transaction fault');
    (observations.nativeWriteFaults ||= []).push({ selector, ...fault });
  }
  await page.reload({ waitUntil: 'load' });
  await ready(page);
  await door(page);
}
async function phoneTargets(page, selectors) {
  const layout = await page.evaluate(
    (selectors) => ({
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      targets: selectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)].map((element) => {
          const box = element.getBoundingClientRect();
          return {
            selector,
            width: box.width,
            height: box.height,
            left: box.left,
            right: box.right,
          };
        }),
      ),
    }),
    selectors,
  );
  assert(layout.documentWidth <= layout.width + 1, 'Phone document has no horizontal overflow');
  assert(layout.targets.length >= selectors.length, 'Every requested phone control exists');
  for (const target of layout.targets) {
    assert(
      target.width >= 44 && target.height >= 44,
      `${target.selector} is at least 44 × 44 CSS px: ${JSON.stringify(target)}`,
    );
    assert(
      target.left >= -1 && target.right <= layout.width + 1,
      `${target.selector} fits the phone`,
    );
  }
  return layout;
}
async function check(name, run, options = {}) {
  if (!requested(name) || results.some(row => !row.pass)) return;
  const fixture = await fresh(options.record || seed, options);
  try {
    const detail = await run(fixture);
    assert.deepEqual(fixture.errors, [], 'Actual app has no uncaught page errors');
    results.push({ name, pass: true, detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, pass: false, error: error.stack });
    console.error(`FAIL ${name}: ${error.message}`);
    await fixture.page
      .screenshot({ path: resolve(OUT, `${name}-failure.png`), fullPage: true })
      .catch(() => {});
  } finally {
    writeFileSync(
      resolve(OUT, `${name}-diagnostics.json`),
      JSON.stringify(fixture.diagnostics, null, 2) + '\n',
    );
    await fixture.context.close();
  }
}

// R35: persistent peers extend this harness's ordinary controls. Admission and
// delivery are explicit synthetic native ports; the real app owns installation,
// writer, native store and registered adapter. Peers never exchange documents.
const receivedScope = Object.freeze({ accountId: `local-account:${randomUUID()}`, learnerId: `local-learner:${randomUUID()}` });
const receivedPeers = [];
const canonical = value => Array.isArray(value) ? value.map(canonical) : value !== null && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const operationRef = operation => ({ opId: operation.opId, sha256: hash(JSON.stringify(canonical(operation), null, 2)) });
async function exact(page, action, value) {
  return JSON.parse(await page.evaluate(async ({ source, input }) => {
    const run = (0, eval)(`(${source})`);
    return JSON.stringify({ value: await run(JSON.parse(input).value) });
  }, { source: String(action), input: JSON.stringify({ value }) })).value;
}
function receivedPeer(name, side) {
  const peer = { name, side, directory: resolve(OUT, name, side), profile: resolve(OUT, name, `profile-${side}`),
    context: null, page: null, episode: 0, errors: [], diagnostics: [], snapshots: [], observations: [], assets: [], assetWork: [] };
  mkdirSync(peer.directory, { recursive: true }); receivedPeers.push(peer); return peer;
}
async function launchReceived(peer, { offline = false, routeSetup } = {}) {
  assert.equal(receivedContexts, 0, 'Received peers and episodes are serialized');
  assert.equal(peer.context, null); peer.episode++;
  if (offline) { networkPhase = 'received-offline'; serverConnected = false; }
  peer.context = await ({ chromium, webkit })[browserName].launchPersistentContext(peer.profile, {
    headless: true, viewport: { width: 390, height: 844 }, locale: 'en-US', ignoreHTTPSErrors: true, serviceWorkers: peer.serviceWorkers || 'allow',
    ...(browserName === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--ignore-certificate-errors'] } : {}),
  });
  receivedContexts++; engineVersion = peer.context.browser()?.version() || engineVersion;
  await silenceBrowserAudio(peer.context);
  await peer.context.addInitScript(scope => {
    const transport = { handle: null, binding: null, registrationId: null };
    window.__receivedPracticeTransport = transport;
    window.kairoSync = Object.freeze({ initialScope: async () => ({ ...scope }),
      register: async ({ binding }, handle) => {
        transport.binding = binding; transport.handle = handle; transport.registrationId = `synthetic-${crypto.randomUUID()}`;
        return { registrationId: transport.registrationId };
      }, unregister: async () => { transport.handle = null; }, status: async () => ({ state: 'ready' }),
      connect: async () => ({ state: 'ready' }), sync: async () => ({ state: 'ready' }), disconnect: async () => ({ state: 'disconnected' }) });
  }, receivedScope);
  await peer.context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  await peer.context.route('**/*', route => {
    if (new URL(route.request().url()).origin === base) return route.continue();
    externalRequests.push({ name: peer.name, side: peer.side, url: route.request().url() }); return route.abort();
  });
  if (routeSetup) await routeSetup(peer.context);
  if (offline && browserName === 'chromium') await peer.context.setOffline(true);
  peer.page = peer.context.pages()[0] || await peer.context.newPage(); peer.page.setDefaultTimeout(15000);
  peer.page.on('pageerror', error => peer.errors.push({ episode: peer.episode, message: error.message, stack: error.stack }));
  peer.page.on('requestfailed', request => peer.diagnostics.push({ episode: peer.episode, url: request.url(), failure: request.failure() }));
  peer.page.on('response', response => {
    const path = new URL(response.url()).pathname.slice(1), entry = files.find(file => file.path === path);
    if (!entry || !/\.(?:js|mjs|css)$/u.test(path)) return;
    const work = response.body().then(bytes => {
      const actual = hash(bytes); assert.equal(actual, entry.sha256, `Actual loaded ${path} differs from artifact`);
      peer.assets.push({ episode: peer.episode, path, sha256: actual, fromServiceWorker: response.fromServiceWorker() });
    });
    peer.assetWork.push(work); void work.catch(() => undefined);
  });
  lifecycle.push({ action: 'launch', name: peer.name, side: peer.side, episode: peer.episode, profile: peer.profile, offline,
    serviceWorkers: peer.serviceWorkers || 'allow', silenceBeforeNavigation: true });
  await boot(peer.page);
  await peer.page.waitForFunction(() => typeof window.__receivedPracticeTransport?.handle === 'function');
  assert.equal(await peer.page.locator('#store-alert').isVisible(), false);
}
async function closeReceived(peer) {
  if (!peer.context) return;
  try {
    const pages = peer.context.pages(); const blank = await peer.context.newPage(); await blank.goto('about:blank');
    await Promise.all(pages.map(page => page.close())); await delay(600);
    await peer.context.tracing.stop({ path: resolve(peer.directory, `trace-${peer.episode}.zip`) });
  } finally {
    await peer.context.close(); peer.context = null; peer.page = null; receivedContexts--;
    serverConnected = true; networkPhase = 'online';
    lifecycle.push({ action: 'closed', name: peer.name, side: peer.side, episode: peer.episode });
  }
  await Promise.all(peer.assetWork); peer.assetWork = [];
}
async function receivedNative(peer, label) {
  const saved = await readAppRecordSnapshot(peer.page);
  const value = await exact(peer.page, async () => {
    const core = await import('/modules/record-core.mjs');
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, actor: installation.actor,
      policy: { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' } });
    try {
      const snapshot = await store.snapshot(), views = core.readExamAttemptViews(snapshot.replica);
      let copiedHandleRejected = false;
      try { core.readExamAttemptViews(JSON.parse(JSON.stringify(snapshot.replica))); } catch (error) { copiedHandleRejected = error.code === 'invalid-replica'; }
      return { snapshot, views, immutable: Object.isFrozen(views) && views.every(view => Object.isFrozen(view) && Object.isFrozen(view.headAttempts)), copiedHandleRejected };
    } finally { await store.close(); }
  });
  assert.equal(saved.revision, value.snapshot.revision); assert(value.immutable && value.copiedHandleRejected);
  assert.deepEqual(saved.record, value.snapshot.documents.find(row => row.collection === 'learner-record' && row.id === 'current').value);
  assert.deepEqual({ accountId: saved.installation.binding.accountId, learnerId: saved.installation.binding.learnerId }, receivedScope);
  assert.equal(value.snapshot.replica.projection.scheduling, 'not-computed');
  const result = { ...saved, ...value }, file = resolve(peer.directory, `${String(peer.snapshots.length + 1).padStart(2, '0')}-${label}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n'); peer.snapshots.push({ label, file, sha256: hash(readFileSync(file)) }); return result;
}
function rootsUnchanged(before, after, allowed = []) {
  for (const key of new Set([...Object.keys(before.record), ...Object.keys(after.record)]))
    if (!allowed.includes(key)) assert.deepEqual(after.record[key], before.record[key], `Unexpected record root ${key}`);
  assert.deepEqual(after.archive, before.archive); assert.deepEqual(after.installation, before.installation);
}
async function deliver(peer, operations, label) {
  assert(operations.length && operations.every(operation => ['exam.attempt', 'entity.tombstone', 'entity.restore'].includes(operation.payload.kind)));
  const before = await receivedNative(peer, `${label}-before`);
  const outcome = await exact(peer.page, async ({ operations, label }) => {
    const port = window.__receivedPracticeTransport;
    if (!port?.handle) throw new Error('Actual registered adapter unavailable');
    const offered = await port.handle({ method: 'snapshot', requestId: `${label}-snapshot` });
    if (!offered.ok || offered.value.documents.length !== 0) throw new Error('Actual transport did not preserve private documents');
    const channelId = 'synthetic-received-practice-operations';
    return port.handle({ method: 'commitReceive', requestId: label, request: { deliveryId: label, expectedRevision: offered.value.revision,
      delivery: { binding: port.binding, operations }, checkpoint: {
        channelId, expected: offered.value.checkpoints.find(row => row.channelId === channelId)?.value ?? null, next: label } } });
  }, { operations, label });
  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  const after = await receivedNative(peer, `${label}-after`); rootsUnchanged(before, after);
  assert.deepEqual(after.snapshot.documents, before.snapshot.documents, 'Receive cannot change full attempts, receipts or learner documents');
  assert.deepEqual(after.snapshot.actor, before.snapshot.actor); assert.deepEqual(after.snapshot.outbox, before.snapshot.outbox);
  for (const operation of [...before.snapshot.replica.operations, ...operations])
    assert.deepEqual(after.snapshot.replica.operations.find(row => row.opId === operation.opId), operation);
  peer.observations.push({ kind: 'SYNTHETIC-native-operation-only-delivery', label, operationRefs: operations.map(operationRef), outcome }); return after;
}
async function syntheticOperation(peer, payload, label, dependencies = []) {
  const operation = await exact(peer.page, async ({ payload, label, dependencies, scope }) => {
    const core = await import('/modules/record-core.mjs');
    return core.createSyncOperation({ format: 'kairo-sync-operation', v: 1, scope,
      actor: { deviceId: `synthetic-r35-${label}`, incarnationId: crypto.randomUUID(), sequence: 1 }, predecessor: null,
      dependencies, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1', occurredAt: '2026-09-14T00:00:00.000Z', payload });
  }, { payload, label, dependencies, scope: receivedScope });
  peer.observations.push({ kind: 'SYNTHETIC-adversarial-operation-premise', label, operation }); return operation;
}
async function ordinaryTerminal(peer, outcome, { answered = false } = {}) {
  if (await peer.page.locator('#mock-link').count()) await door(peer.page);
  await start(peer.page); const started = await receivedNative(peer, `${outcome}-started`);
  if (outcome === 'submitted') await finish(peer.page, items.map((_, index) => index % 4));
  else {
    if (answered) await choose(peer.page, 0);
    await peer.page.locator('#mock-drop').click();
    await waitForAppRecord(peer.page, record => record.assessmentLibrary?.activeAttemptId === null &&
      record.assessmentLibrary.attempts.at(-1).status === 'abandoned');
    await earlierExercises(peer.page);
  }
  const after = await receivedNative(peer, `${outcome}-finished`); rootsUnchanged(started, after, ['assessmentLibrary']);
  const added = after.snapshot.replica.operations.filter(operation => !started.snapshot.replica.operations.some(old => old.opId === operation.opId));
  assert.equal(added.length, 1); const operation = added[0];
  assert.equal(operation.payload.kind, 'exam.attempt'); assert.equal(operation.payload.outcome, outcome);
  assert.equal(operation.payload.answers.length, 18); assert.equal(operation.payload.generation, null);
  assert.equal(after.snapshot.actor.sequence, started.snapshot.actor.sequence + 1);
  assert.equal(after.snapshot.outbox.length, started.snapshot.outbox.length + 1);
  assert.deepEqual(after.snapshot.outbox.find(row => row.opId === operation.opId), operation);
  if (outcome === 'submitted') assert(operation.payload.answers.every(answer => answer.response.kind === 'choice'));
  else if (!answered) assert(operation.payload.answers.every(answer => answer.response.kind === 'no-response'));
  if (outcome === 'submitted') await done(peer.page);
  peer.observations.push({ kind: 'ordinary-rendered-terminal-practice', outcome, questions: 18, operation }); return operation;
}
async function history(peer) {
  if (await peer.page.locator('#mock-link').count()) await door(peer.page);
  if (await peer.page.locator('#mock-history-open').count()) await peer.page.locator('#mock-history-open').click();
  await peer.page.locator('#mock-history').waitFor();
}
const receivedRow = operation => `[data-received-practice="${operation.payload.attemptId}"][data-received-payload="${operation.payloadSha256}"]`;
async function openReceived(peer, operation, { formStatus = 'available', statuses = {}, label = 'detail' } = {}) {
  const before = await receivedNative(peer, `${label}-before-open`), row = peer.page.locator(receivedRow(operation));
  await row.waitFor(); const rowText = await row.innerText();
  assert(rowText.startsWith('Response record · '));
  assert(rowText.includes(operation.payload.outcome === 'submitted' ? 'Submitted' : 'Stopped'));
  assert(rowText.includes(`${operation.payload.answers.filter(answer => answer.response.kind !== 'no-response').length}/${operation.payload.answers.length}`));
  await row.click(); await peer.page.locator('#received-practice-detail').waitFor();
  await peer.page.waitForFunction(status => {
    const version = document.getElementById('received-practice-version');
    return version?.dataset.formStatus === status && version.getAttribute('aria-busy') === 'false';
  }, formStatus);
  const detail = peer.page.locator('#received-practice-detail');
  if (formStatus !== 'available') await peer.page.locator('#received-practice-reference summary').click();
  const text = await detail.innerText();
  assert.equal(await detail.locator('h1').innerText(), 'Response record');
  assert.equal(await peer.page.locator('#received-practice-status').innerText(), 'Saved responses, not a score or a correctness assessment.');
  const declaredDate = await peer.page.evaluate(value => new Date(value).toLocaleString(), operation.payload.startedAt);
  assert(rowText.includes(declaredDate)); assert(text.includes(declaredDate));
  const seconds = Math.floor(operation.payload.elapsedMs / 1000);
  assert(text.includes(`Recorded time ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`));
  assert.equal(await peer.page.locator('[data-received-item]').count(), operation.payload.answers.length);
  assert.equal(await detail.locator('input, textarea, select, [data-mock-opt], .mock-score, .lesson-enroll-one').count(), 0);
  for (const [index, answer] of operation.payload.answers.entries()) {
    const item = peer.page.locator(`[data-received-item="${answer.itemId}"]`);
    const expectedStatus = statuses[index] || (formStatus === 'available' ? 'available' : 'missing-version');
    assert.equal(await item.getAttribute('data-question-status'), expectedStatus);
    assert.equal(await item.getAttribute('data-response-kind'), answer.response.kind);
    const content = await item.innerText();
    if (expectedStatus === 'available') {
      for (const line of items[index].q.split('\n')) assert(content.includes(line), `Missing exact question line ${line}`);
      if (answer.response.kind === 'choice') assert(content.includes(items[index].opts[Number(answer.response.optionId.slice('option:'.length))]));
    } else {
      assert(content.includes('The exact question or option version for this response could not be confirmed.'));
      assert(content.includes(answer.itemId)); assert(content.includes(answer.itemVersionId));
      if (answer.response.kind === 'choice') assert(content.includes(answer.response.optionId));
      assert(!content.includes(items[index]?.q.split('\n')[0]), 'Unavailable reference borrowed a current question');
    }
    if (answer.response.kind === 'no-response') assert.match(content, /no response/iu);
    if (answer.response.kind === 'text') assert(content.includes(answer.response.text));
  }
  if (formStatus !== 'available') for (const field of Object.values(operation.payload.form)) assert(text.includes(field));
  await peer.page.screenshot({ path: resolve(peer.directory, `${label}.png`), fullPage: true });
  const after = await receivedNative(peer, `${label}-after-open`); assert.deepEqual(after.rows, before.rows); rootsUnchanged(before, after);
  peer.observations.push({ kind: 'actual-received-detail', label, rowText, text, formStatus,
    media: await peer.page.evaluate(() => ({ elements: document.querySelectorAll('audio,video').length,
      speechSpeaking: speechSynthesis.speaking, speechPending: speechSynthesis.pending })) });
}
async function backReceived(peer, operation) {
  const before = await receivedNative(peer, 'detail-back-before');
  await peer.page.locator('#received-practice-back').click(); await peer.page.locator('#mock-history').waitFor();
  assert.equal(await peer.page.locator(receivedRow(operation)).evaluate(node => node === document.activeElement), true);
  const after = await receivedNative(peer, 'detail-back-after'); assert.deepEqual(after.rows, before.rows); rootsUnchanged(before, after);
}
async function keyboardRow(peer, selector) {
  let tabs = 0;
  while (!await peer.page.locator(selector).evaluate(node => node === document.activeElement) && tabs < 80) {
    await peer.page.keyboard.press('Tab'); tabs++;
  }
  assert.equal(await peer.page.locator(selector).evaluate(node => node === document.activeElement), true);
  await peer.page.evaluate(() => { window.__receivedPracticeFocusedNode = document.activeElement; });
  peer.observations.push({ kind: 'ordinary-keyboard-focus', selector, tabs });
}
async function unchangedFocus(peer, selector) {
  assert.equal(await peer.page.locator(selector).evaluate(node => node === document.activeElement && node === window.__receivedPracticeFocusedNode), true);
}
async function receivedWarning(peer) {
  const before = await receivedNative(peer, 'protected-before');
  await peer.page.evaluate(() => {
    window.addEventListener('storage', event => {
      if (event.key === 'kairo-crossing-v1') window.__receivedPracticeStorageEvent = { key: event.key, isTrusted: event.isTrusted, newValue: event.newValue };
    });
    const iframe = document.createElement('iframe'); iframe.hidden = true; iframe.dataset.syntheticPracticeWarning = '1';
    iframe.srcdoc = '<!doctype html><title>SYNTHETIC storage warning</title><p>Scriptless local warning premise.</p>';
    document.body.append(iframe);
  });
  const element = await peer.page.locator('[data-synthetic-practice-warning]').elementHandle();
  const frame = await element.contentFrame();
  await frame.waitForFunction(() => document.title === 'SYNTHETIC storage warning');
  const premise = await frame.evaluate(() => ({ scripts: document.scripts.length, silence: globalThis[Symbol.for('kairo.test.silent-audio.v1')] === true }));
  assert.deepEqual(premise, { scripts: 0, silence: true });
  const warning = `synthetic-r35-warning-${randomUUID()}`;
  await frame.evaluate(value => localStorage.setItem('kairo-crossing-v1', value), warning);
  await peer.page.locator('#store-alert').waitFor({ state: 'visible' });
  await peer.page.waitForFunction(() => window.__receivedPracticeStorageEvent?.isTrusted === true);
  const event = await peer.page.evaluate(() => window.__receivedPracticeStorageEvent);
  assert.deepEqual(event, { key: 'kairo-crossing-v1', isTrusted: true, newValue: warning });
  const after = await receivedNative(peer, 'protected-after'); assert.deepEqual(after.rows, before.rows); rootsUnchanged(before, after);
  peer.observations.push({ kind: 'SYNTHETIC-genuine-cross-document-storage-warning', premise, event, nativeRowsAndInstallationUnchanged: true });
}
const receivedBodies = {
  async [RECEIVED_CASES[0]](name) {
    const a = receivedPeer(name, 'a'), b = receivedPeer(name, 'b');
    await launchReceived(a);
    const submitted = await ordinaryTerminal(a, 'submitted'), stopped = await ordinaryTerminal(a, 'abandoned');
    const sender = await receivedNative(a, 'sender-final'); await closeReceived(a);
    await launchReceived(b); const initial = await receivedNative(b, 'receiver-initial');
    for (const field of ['sessionId']) assert.notEqual(initial.installation.binding[field], sender.installation.binding[field]);
    assert.notDeepEqual(initial.installation.actor, sender.installation.actor);
    assert.notEqual(initial.installation.databaseName, sender.installation.databaseName);
    await door(b.page); await start(b.page); await choose(b.page, 1);
    const current = await receivedNative(b, 'local-current-before-receive');
    const baselineTime = await b.page.evaluate(() => performance.now());
    const question = await b.page.locator('.mock-q').innerText();
    await b.page.evaluate(() => { window.__receivedPracticeCurrentQuestion = document.querySelector('.mock-q'); });
    await delay(350);
    const received = await deliver(b, [submitted, stopped], 'ordinary-a-to-b');
    assert.equal(await b.page.locator('.mock-q').innerText(), question);
    assert.equal(await b.page.locator('.mock-q').evaluate(node => node === window.__receivedPracticeCurrentQuestion), true);
    assert.equal(received.record.assessmentLibrary.attempts.length, 1, 'Received responses are not imported full attempts');
    assert.deepEqual(received.record.assessmentLibrary, current.record.assessmentLibrary);
    await history(b); const pauseStart = await b.page.evaluate(() => performance.now());
    await openReceived(b, submitted, { label: 'ordinary-submitted-18-responses' }); await backReceived(b, submitted);
    await openReceived(b, stopped, { label: 'ordinary-stopped-18-no-responses' }); await backReceived(b, stopped);
    await delay(250); const pauseEnd = await b.page.evaluate(() => performance.now());
    await b.page.locator('#mock-history-close').click(); await b.page.locator('.mock-q').waitFor();
    assert.equal(await b.page.locator('.mock-q').innerText(), question);
    const afterBrowse = await receivedNative(b, 'after-browse'); assert.deepEqual(afterBrowse.rows, received.rows);
    const beforeAnswerTime = await b.page.evaluate(() => performance.now());
    await choose(b.page, 2); const afterAnswer = await receivedNative(b, 'after-next-ordinary-answer');
    const sum = (attempt, field) => attempt.timings.reduce((total, timing) => total + timing[field], 0);
    const beforeAttempt = current.record.assessmentLibrary.attempts[0], afterAttempt = afterAnswer.record.assessmentLibrary.attempts[0];
    const elapsed = sum(afterAttempt, 'elapsedMs') - sum(beforeAttempt, 'elapsedMs');
    const active = sum(afterAttempt, 'activeMs') - sum(beforeAttempt, 'activeMs');
    assert(elapsed >= Math.floor(beforeAnswerTime - baselineTime), 'Receive or browsing reset the ordinary practice clock');
    assert(active <= elapsed - Math.floor(pauseEnd - pauseStart) + 100, 'History browsing accrued active practice time');
    assert.equal(afterAttempt.facts.filter(fact => fact.kind === 'response').length, beforeAttempt.facts.filter(fact => fact.kind === 'response').length + 1);
    assert.deepEqual(afterAnswer.snapshot.replica.operations, received.snapshot.replica.operations);
    assert.deepEqual(afterAnswer.snapshot.outbox, received.snapshot.outbox);
    b.observations.push({ kind: 'ordinary-clock-observation', elapsed, active, measuredBeforeNextAnswerMs: beforeAnswerTime - baselineTime, measuredBrowseMs: pauseEnd - pauseStart });
    await b.page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await b.page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await closeReceived(b); await launchReceived(b);
    const restarted = await receivedNative(b, 'persistent-restart'); rootsUnchanged(afterAnswer, restarted, ['assessmentLibrary']);
    assert.equal(restarted.record.assessmentLibrary.activeAttemptId, beforeAttempt.attemptId);
    assert.deepEqual(restarted.record.assessmentLibrary.attempts[0].answers, afterAttempt.answers);
    assert.deepEqual(restarted.snapshot.replica.operations, received.snapshot.replica.operations);
    assert.deepEqual(restarted.snapshot.outbox, received.snapshot.outbox);
    await history(b); await openReceived(b, submitted, { label: 'restarted-submitted' }); await backReceived(b, submitted);
    await closeReceived(b); const responseCount = servedResponses;
    await launchReceived(b, { offline: true }); await history(b);
    await openReceived(b, stopped, { label: 'offline-stopped' }); await backReceived(b, stopped);
    assert.equal(servedResponses, responseCount, 'Offline restart received a server response');
    const offline = await receivedNative(b, 'offline-final');
    assert.deepEqual(offline.snapshot.replica.operations, received.snapshot.replica.operations);
    assert.deepEqual(offline.snapshot.outbox, received.snapshot.outbox);
    rootsUnchanged(afterAnswer, offline, ['assessmentLibrary']);
    await closeReceived(b);
    return { submitted: operationRef(submitted), stopped: operationRef(stopped), questions: 18,
      relay: 'SYNTHETIC admitted operation envelopes only; ordinary A controls created both payloads', offlineServerResponses: servedResponses - responseCount };
  },
  async [RECEIVED_CASES[1]](name) {
    const a = receivedPeer(name, 'local'); await launchReceived(a);
    const original = await ordinaryTerminal(a, 'abandoned', { answered: true });
    const local = await receivedNative(a, 'local-full-attempt');
    const equal = await syntheticOperation(a, original.payload, 'equal-provenance');
    const duplicate = await deliver(a, [equal], 'equal-content'); await history(a);
    assert.equal(await a.page.locator(`[data-mock-history="${original.payload.attemptId}"]`).count(), 1);
    assert.equal(await a.page.locator(`[data-received-practice="${original.payload.attemptId}"]`).count(), 0);
    const view = duplicate.views.find(row => row.attemptId === original.payload.attemptId);
    assert.equal(view.headAttempts.length, 1); assert.equal(view.headAttempts[0].operationRefs.length, 2);
    const alternative = await syntheticOperation(a, { ...original.payload, elapsedMs: original.payload.elapsedMs + 1 }, 'distinct-same-id');
    const conflicted = await deliver(a, [alternative], 'distinct-conflict');
    assert.equal(conflicted.views.find(row => row.attemptId === original.payload.attemptId).headAttempts.length, 2);
    await a.page.locator(`[data-practice-conflict="${original.payload.attemptId}"]`).waitFor();
    assert.match(await a.page.locator(`[data-practice-conflict="${original.payload.attemptId}"]`).innerText(), /both answers are kept/iu);
    assert.equal(await a.page.locator(`[data-mock-history="${original.payload.attemptId}"]`).count(), 1);
    await keyboardRow(a, receivedRow(alternative));
    await deliver(a, [alternative], 'exact-delivery-again'); await unchangedFocus(a, receivedRow(alternative));
    const neighbor = await syntheticOperation(a, { ...original.payload, attemptId: `0-neighbor-${randomUUID()}` }, 'new-neighbor');
    await deliver(a, [neighbor], 'new-neighbor'); await unchangedFocus(a, receivedRow(alternative));
    await a.page.screenshot({ path: resolve(a.directory, 'conflicts-neighbor-focused.png'), fullPage: true });
    await a.page.keyboard.press('Enter'); await a.page.locator('#received-practice-detail').waitFor();
    await backReceived(a, alternative);
    const requestsBefore = httpRequests.filter(path => path === '/data/mock/sets/n5-01.json').length;
    await openReceived(a, alternative, { label: 'retained-exact-local-form' }); await backReceived(a, alternative);
    assert.equal(httpRequests.filter(path => path === '/data/mock/sets/n5-01.json').length, requestsBefore, 'Exact retained form fetched an upstream version');
    const after = await receivedNative(a, 'local-after-conflicts'); rootsUnchanged(local, after);
    assert.deepEqual(after.record.assessmentLibrary, local.record.assessmentLibrary, 'Conflicts preserve every richer local fact');
    await a.page.locator(`[data-mock-history="${original.payload.attemptId}"]`).click();
    assert.equal(await a.page.locator('#received-practice-detail').count(), 0);
    assert.equal(await a.page.locator('.mock-review').count(), 1, 'The local route retains its full-attempt review');
    await closeReceived(a); return { equalHeadRefs: 2, distinctHeads: 2, duplicateAndNeighborFocus: true, fullLocalAttemptPreserved: true };
  },
  async [RECEIVED_CASES[2]](name) {
    const a = receivedPeer(name, 'a'), b = receivedPeer(name, 'labels');
    await launchReceived(a); const original = await ordinaryTerminal(a, 'abandoned', { answered: true }); await closeReceived(a);
    b.serviceWorkers = 'block'; await launchReceived(b); await deliver(b, [original], 'exact-bundled'); await history(b);
    await openReceived(b, original, { label: 'exact-bundled-form' }); await backReceived(b, original);
    assert.equal((await receivedNative(b, 'labels-did-not-create-library')).record.assessmentLibrary, null);
    const variants = [
      ['missing-form-path', payload => { payload.form.formId = 'legacy-form:../../untrusted-form'; }, 'missing-version', {}],
      ['changed-form-digest', payload => { payload.form.sha256 = '0'.repeat(64); }, 'missing-version', {}],
      ['changed-form-version', payload => { payload.form.versionId += ':changed'; }, 'missing-version', {}],
      ['missing-item-id', payload => { payload.answers[0].itemId += ':missing'; }, 'available', { 0: 'invalid-reference' }],
      ['changed-item-version', payload => { payload.answers[0].itemVersionId += ':changed'; }, 'available', { 0: 'invalid-reference' }],
      ['unknown-option', payload => { payload.answers[0].response.optionId = 'option:unavailable'; }, 'available', { 0: 'unsupported-response' }],
      ['explicit-text', payload => { payload.answers[0].response = { kind: 'text', text: 'SYNTHETIC <em>literal</em> stored answer' }; }, 'available', { 0: 'unsupported-response' }],
      ['omitted-responses', payload => { payload.answers = payload.answers.slice(0, 1); }, 'available', {}],
    ];
    const requestStart = httpRequests.length;
    for (const [label, change, formStatus, statuses] of variants) {
      const payload = structuredClone(original.payload); payload.attemptId = `synthetic-${label}`; change(payload);
      const operation = await syntheticOperation(b, payload, label); await deliver(b, [operation], label);
      await openReceived(b, operation, { formStatus, statuses, label });
      if (label === 'explicit-text') assert.equal(await b.page.locator('#received-practice-detail em').count(), 0, 'Stored text was interpreted as markup');
      await backReceived(b, operation);
    }
    assert(!httpRequests.slice(requestStart).some(path => path.includes('untrusted-form')), 'Received form IDs must not become request paths');
    // Reload a worker-blocked synthetic network-control episode so neither an
    // earlier in-memory form nor a cache can supply the original bundled body.
    const changed = structuredClone(set); changed.sections[0].items[0].q = 'SYNTHETIC changed upstream question';
    let changedRequests = 0;
    await b.context.route('**/data/mock/sets/n5-01.json', route => {
      changedRequests++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(changed) });
    });
    await b.page.reload(); await ready(b.page); await history(b);
    const before = await receivedNative(b, 'changed-bundle-before');
    await openReceived(b, original, { formStatus: 'missing-version', label: 'changed-bundled-body' });
    assert.equal(changedRequests, 1, 'The explicit changed-body control was not exercised');
    assert(!(await b.page.locator('#received-practice-detail').innerText()).includes(changed.sections[0].items[0].q));
    assert.deepEqual((await receivedNative(b, 'changed-bundle-after')).rows, before.rows);
    await closeReceived(b); return { syntheticVariants: variants.map(([name]) => name), changedBundledBodyRejected: true, noAuthorityOrAssessmentWrites: true };
  },
  async [RECEIVED_CASES[3]](name) {
    const a = receivedPeer(name, 'a'), b = receivedPeer(name, 'lifecycle'), c = receivedPeer(name, 'async');
    await launchReceived(a); const original = await ordinaryTerminal(a, 'abandoned', { answered: true });
    const sourceLocal = await receivedNative(a, 'source-local'); await closeReceived(a);
    await launchReceived(b); await deliver(b, [original], 'lifecycle-base'); await history(b);
    await openReceived(b, original, { label: 'before-hidden' });
    const tombstone = await syntheticOperation(b, { kind: 'entity.tombstone', target: { kind: 'exam-attempt', id: original.payload.attemptId }, reason: 'user-deleted' }, 'delete', [operationRef(original)]);
    const hidden = await deliver(b, [tombstone], 'hide-mounted');
    assert.equal(hidden.views.find(view => view.attemptId === original.payload.attemptId).headAttempts.length, 0);
    await b.page.waitForFunction(() => document.querySelectorAll('[data-received-item]').length === 0);
    assert(!(await b.page.locator('#received-practice-detail').innerText()).includes(items[0].q.split('\n')[0]));
    await b.page.locator('#received-practice-back').click(); await b.page.locator('#mock-history').waitFor();
    assert.equal(await b.page.locator(receivedRow(original)).count(), 0);
    assert.equal(await b.page.locator('#mock-history-title').evaluate(node => node === document.activeElement), true, 'Removed-row Back has a useful focus destination');
    const restore = await syntheticOperation(b, { kind: 'entity.restore', target: tombstone.payload.target,
      tombstones: [operationRef(tombstone)], reason: 'Synthetic explicit restore without response payload' }, 'restore-only', [operationRef(tombstone)]);
    const restoreOnly = await deliver(b, [restore], 'restore-only');
    const restoredView = restoreOnly.views.find(view => view.attemptId === original.payload.attemptId);
    assert.deepEqual(restoredView.headAttempts, []); assert.equal(restoredView.projection.activeRestoreGenerations.length, 1);
    assert.equal(await b.page.locator(`[data-received-practice="${original.payload.attemptId}"]`).count(), 0);
    const restored = await syntheticOperation(b, { ...original.payload, generation: operationRef(restore) }, 'restored-content', [operationRef(restore)]);
    await deliver(b, [restored], 'restored-content'); await openReceived(b, restored, { label: 'explicit-restored-content' });
    await receivedWarning(b);
    await b.page.waitForFunction(() => document.querySelectorAll('[data-received-item]').length === 0);
    assert(!(await b.page.locator('#received-practice-detail').innerText()).includes(items[0].q.split('\n')[0]));
    await b.page.screenshot({ path: resolve(b.directory, 'protected-mounted-detail.png'), fullPage: true }); await closeReceived(b);
    await launchReceived(a); await deliver(a, [tombstone], 'remote-delete-does-not-delete-local'); await history(a);
    const localAfter = await receivedNative(a, 'local-survives-remote-delete'); rootsUnchanged(sourceLocal, localAfter);
    assert.equal(await a.page.locator(`[data-mock-history="${original.payload.attemptId}"]`).count(), 1); await closeReceived(a);
    c.serviceWorkers = 'block'; let held, fetches = 0, responseMode = 'failure';
    await launchReceived(c, { routeSetup: context => context.route('**/data/mock/sets/n5-01.json', route => {
      fetches++;
      if (responseMode === 'failure') return route.fulfill({ status: 503, contentType: 'text/plain', body: 'SYNTHETIC unavailable form response' });
      return new Promise((resolve, reject) => { held = { route, resolve, reject }; });
    }) });
    await deliver(c, [original], 'async-base');
    const sharedFormNeighbor = await syntheticOperation(c, { ...original.payload, attemptId: `shared-form-${randomUUID()}` }, 'shared-form-neighbor');
    await deliver(c, [sharedFormNeighbor], 'async-shared-form-neighbor'); await history(c);
    const waitHeld = async () => { const limit = Date.now() + 10000; while (!held && Date.now() < limit) await delay(20); assert(held, 'Actual deferred form request did not start'); };
    const release = async () => { const current = held; held = null; try {
      await current.route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(set) }); current.resolve();
    } catch (error) { current.reject(error); throw error; } };
    const beforeFailure = await receivedNative(c, 'form-failure-before');
    await c.page.locator(receivedRow(original)).click();
    await c.page.locator('#received-practice-retry').waitFor();
    assert.equal(await c.page.locator('#received-practice-version').getAttribute('aria-busy'), 'false');
    assert.match(await c.page.locator('#received-practice-version').innerText(), /version is unavailable/iu);
    await delay(250); assert.equal(fetches, 1, 'Settled form failure started a render/fetch loop');
    assert.deepEqual((await receivedNative(c, 'form-failure-after')).rows, beforeFailure.rows);
    responseMode = 'deferred'; await c.page.locator('#received-practice-retry').click(); await waitHeld();
    const beforeBack = await receivedNative(c, 'pending-before-back');
    await c.page.locator('#received-practice-back').click(); await c.page.locator('#mock-history').waitFor();
    await c.page.locator(receivedRow(sharedFormNeighbor)).click();
    assert.equal(fetches, 2, 'Two selections of one exact form should share the in-flight load');
    await release();
    await c.page.waitForFunction(() => document.getElementById('received-practice-version')?.dataset.formStatus === 'available' &&
      document.getElementById('received-practice-version').getAttribute('aria-busy') === 'false');
    assert.equal(await c.page.locator('[data-received-item]').count(), 18, 'The current same-form neighbor did not observe completed loading');
    assert.deepEqual((await receivedNative(c, 'shared-form-neighbor-ready')).rows, beforeBack.rows);
    await c.page.screenshot({ path: resolve(c.directory, 'shared-form-neighbor-ready.png'), fullPage: true });
    await backReceived(c, sharedFormNeighbor);
    await c.page.reload(); await ready(c.page); await history(c); await c.page.locator(receivedRow(original)).click(); await waitHeld();
    const beforeClosed = await receivedNative(c, 'pending-before-closed');
    await c.page.locator('#received-practice-back').click(); await c.page.locator('#mock-history').waitFor();
    await release(); await delay(250);
    assert.equal(await c.page.locator('#received-practice-detail').count(), 0);
    assert.deepEqual((await receivedNative(c, 'settled-after-back')).rows, beforeClosed.rows);
    await c.page.reload(); await ready(c.page); await history(c); await c.page.locator(receivedRow(original)).click(); await waitHeld();
    await deliver(c, [tombstone], 'hide-pending-detail');
    await c.page.waitForFunction(() => document.querySelectorAll('[data-received-item]').length === 0);
    await release(); await delay(250);
    assert.equal(await c.page.locator('[data-received-item]').count(), 0);
    await c.page.locator('#received-practice-back').click(); await c.page.locator('#mock-history').waitFor();
    assert.equal(await c.page.locator('#mock-history-title').evaluate(node => node === document.activeElement), true);
    await c.page.reload(); await ready(c.page); await history(c); await c.page.locator(receivedRow(sharedFormNeighbor)).click(); await waitHeld();
    await receivedWarning(c); await release(); await delay(250);
    assert.equal(await c.page.locator('[data-received-item]').count(), 0);
    assert(!(await c.page.locator('#received-practice-detail').innerText()).includes(items[0].q.split('\n')[0]));
    assert.equal(fetches, 5, 'Late completion launched a render/fetch loop');
    c.observations.push({ kind: 'SYNTHETIC-deferred-actual-form-network', fetches, sharedExactFormSelectionObservedCompletion: true,
      cancellation: ['ordinary Back', 'received tombstone', 'genuine protected storage warning'], noLateDetailOrQuestions: true });
    await closeReceived(c); return { hidden: true, restoreOnlyNotVisible: true, explicitRestoredGeneration: true,
      localAttemptSurvivesRemoteDeletion: true, protectedDetailScrubbed: true, staleAsyncCompletionScrubbed: true };
  },
};
async function checkReceived(name) {
  if (!requested(name) || results.some(row => !row.pass)) return;
  const start = Date.now();
  try {
    const detail = await receivedBodies[name](name);
    for (const peer of receivedPeers.filter(peer => peer.name === name)) assert.deepEqual(peer.errors, []);
    results.push({ name, pass: true, elapsedMs: Date.now() - start, detail }); console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, pass: false, elapsedMs: Date.now() - start, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`);
    for (const peer of receivedPeers.filter(peer => peer.name === name))
      if (peer.page) await peer.page.screenshot({ path: resolve(peer.directory, 'failure.png'), fullPage: true }).catch(() => undefined);
  } finally {
    for (const peer of receivedPeers.filter(peer => peer.name === name)) {
      await closeReceived(peer);
      const evidence = Object.fromEntries(Object.entries(peer).filter(([key]) => !['context', 'page', 'assetWork'].includes(key)));
      writeFileSync(resolve(peer.directory, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    }
  }
}

try {
  await check('two-completed-attempts-and-failed-save-actions', async ({ page }) => {
    await door(page);
    assert.match(await page.locator('main').innerText(), /Short practice sets/u);
    assert.match(await page.locator('main').innerText(), /answer keys still need checking/u);
    assert.match(await page.locator('main').innerText(), /don’t include listening or a time limit/u);
    await start(page);
    const firstId = (await selected(page)).attempt.attemptId;
    const firstQuestion = await page.locator('.mock-q').innerText();
    await failedSave(page, '[data-mock-opt="0"]');
    assert.equal(await page.locator('[data-mock-opt="0"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#mock-next').isDisabled(), true);
    assert.equal(await page.locator('.mock-q').innerText(), firstQuestion);
    await choose(page, 0);
    await failedSave(page, '#mock-next');
    assert.equal((await selected(page)).run.ix, 0);
    assert.equal(await page.locator('.mock-q').innerText(), firstQuestion);
    await advance(page);
    await choose(page, 1);
    await previous(page);
    assert.equal((await selected(page)).run.ix, 0);
    assert.equal(await page.locator('[data-mock-opt="0"]').getAttribute('aria-pressed'), 'true');
    await choose(page, items[0].right);
    await advance(page);
    const firstAnswers = items.map((item) => item.right);
    for (let index = 1; index < items.length; index += 1) {
      await choose(page, firstAnswers[index]);
      if (index + 1 < items.length) await advance(page);
    }
    await failedSave(page, '#mock-next');
    assert.equal((await selected(page)).attempt.status, 'in-progress');
    assert.equal(await page.locator('#mock-done').count(), 0);
    assert.equal((await selected(page)).run.ix, 17);
    await advance(page);
    await page.waitForSelector('#mock-done');
    const first = await selected(page);
    assert.deepEqual(first.run.answers, firstAnswers);
    assert.equal(first.attempt.mode, 'practice');
    assert.equal(first.attempt.editorialAtStart.status, 'unreviewed');
    assert.equal(first.admission.evidenceAdmitted, false);
    assert.equal(first.attempt.facts.filter((fact) => fact.kind === 'response').length, 20);
    const firstResponses = first.attempt.facts.filter(
      (fact) => fact.kind === 'response' && fact.item.id === first.attempt.answers[0].item.id,
    );
    assert.equal(firstResponses.length, 2, 'Changed first answer keeps both response facts');
    for (const fact of first.attempt.facts.filter((fact) => fact.kind === 'response')) {
      assert(
        first.attempt.facts
          .slice(0, first.attempt.facts.indexOf(fact))
          .some(
            (prior) =>
              prior.kind === 'exposure' &&
              prior.content === 'prompt' &&
              prior.item.id === fact.item.id,
          ),
      );
    }
    await failedSave(page, '#mock-done');
    assert.equal(await page.locator('#mock-done').count(), 1);
    assert.equal((await record(page)).assessmentLibrary.activeAttemptId, firstId);
    await done(page);
    await page.waitForSelector('[data-mock-set="n5-01"]');
    assert.equal((await record(page)).assessmentLibrary.activeAttemptId, null);
    await start(page);
    const secondId = (await selected(page)).attempt.attemptId;
    assert.notEqual(secondId, firstId);
    const secondAnswers = firstAnswers.map((answer, index) =>
      index === 0 ? (answer + 1) % 4 : answer,
    );
    await finish(page, secondAnswers);
    await done(page);
    const saved = (await record(page)).assessmentLibrary;
    assert.equal(saved.forms.length, 1);
    assert.equal(saved.attempts.length, 2);
    assert.deepEqual(
      saved.attempts[0],
      first.attempt,
      'Second sitting cannot overwrite completed first answers or facts',
    );
    assert.equal(await page.locator('[data-mock-history]').count(), 2);
    await page.locator(`[data-mock-history="${firstId}"]`).click();
    assert.match(await page.locator('h1.view-title').innerText(), /18(?: of | \/ )18/u);
    assert.equal(await page.locator('.mock-review-row.wrong').count(), 0);
    await done(page);
    await page.locator(`[data-mock-history="${secondId}"]`).click();
    assert.match(await page.locator('h1.view-title').innerText(), /17(?: of | \/ )18/u);
    assert.equal(await page.locator('.mock-review-row.wrong').count(), 1);
    await done(page);
    assert.deepEqual(
      (await record(page)).assessmentLibrary,
      saved,
      'Reviewing history is read-only',
    );
    const final = await record(page);
    assert.deepEqual(final.futurePracticeWidget, opaqueRoot);
    assert.deepEqual(final.obslog, []);
    assert.deepEqual(final.revlog, []);
    assert.deepEqual(final.srs, {});
    assert.deepEqual(final.taken, []);
    await page.screenshot({ path: resolve(OUT, 'completed-history-desktop.png'), fullPage: true });
    return {
      attempts: 2,
      exactForms: 1,
      firstResponses: 20,
      secondResponses: 18,
      failedSaves: ['answer', 'move', 'submit', 'Done'],
    };
  });

  await check(
    'saved-form-survives-changed-upstream-and-no-set-fetch-reload',
    async ({ context, page, setRequests }) => {
      await door(page);
      await start(page);
      await choose(page, 3);
      await advance(page);
      const before = await selected(page);
      const beforeLibrary = (await record(page)).assessmentLibrary;
      const changed = structuredClone(set);
      changed.sections[0].items[0].q =
        'Synthetic changed upstream question. Which version is displayed?';
      const upstream = [];
      await context.route('**/data/mock/sets/n5-01.json', (route) => {
        upstream.push(route.request().url());
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(changed),
        });
      });
      setRequests.length = 0;
      await page.reload({ waitUntil: 'load' });
      await ready(page);
      await door(page);
      const after = await selected(page);
      assert.equal(after.attempt.attemptId, before.attempt.attemptId);
      assert.equal(after.formRevisionId, before.formRevisionId);
      assert.deepEqual(after.run.answers, before.run.answers);
      assert.equal(after.run.ix, before.run.ix);
      assert.equal(after.attempt.clockStatus, 'unverified');
      assert(
        after.attempt.facts.some(
          (fact) => fact.kind === 'interruption' && fact.reason === 'process-stop',
        ),
      );
      assert(after.elapsedMs >= before.elapsedMs);
      assert(after.activeMs >= before.activeMs);
      assert.deepEqual((await record(page)).assessmentLibrary.forms, beforeLibrary.forms);
      assert.equal(
        setRequests.length,
        0,
        'Opening saved current practice never fetches an upstream set',
      );
      assert.equal(upstream.length, 0);
      await previous(page);
      assert.deepEqual(
        await page.locator('.mock-q-line').allTextContents(),
        items[0].q.split('\n'),
      );
      assert.equal(await page.locator('[data-mock-opt="3"]').getAttribute('aria-pressed'), 'true');
      await page.locator('#mock-drop').click();
      await earlierExercises(page);
      await start(page);
      assert.equal(upstream.length, 1, 'A deliberate new attempt fetches the new source');
      assert.equal(await page.locator('.mock-q').innerText(), changed.sections[0].items[0].q);
      const library = (await record(page)).assessmentLibrary;
      assert.equal(library.forms.length, 2);
      assert.equal(library.attempts.length, 2);
      assert.equal(library.attempts[0].status, 'abandoned');
      assert.equal(library.attempts[0].form.revisionId, before.formRevisionId);
      assert.notEqual(library.attempts[1].form.revisionId, before.formRevisionId);
      return {
        resumedQuestionIndex: 1,
        setFetchesOnResume: 0,
        newSourceFetches: 1,
        retainedFormRevisions: 2,
      };
    },
  );

  await check(
    'real-offline-reload-retains-answers-without-set-fetch',
    async ({ context, page, setRequests }) => {
      // The unchanged release installs its worker automatically over HTTPS.
      await page.waitForFunction(
        async () =>
          (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated',
        null,
        { timeout: 30_000 },
      );
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
        timeout: 30_000,
      });
      await door(page);
      await start(page);
      await choose(page, 2);
      await advance(page);
      await choose(page, 0);
      const before = await selected(page);
      const cachePaths = [
        'index.html',
        'corridor.js',
        // Boot now loads the assessment, source-cloze and shared record graph.
        // Require its complete staged module inventory, including transitive
        // dependencies, rather than letting an online first visit hide a gap.
        ...files.filter((file) => file.path.endsWith('.mjs')).map((file) => file.path),
        'data/manifest.json',
      ];
      const cacheHashes = await page.evaluate(async (paths) => {
        const entries = [];
        for (const path of paths) {
          const response = await caches.match(new URL(path, location.href).href);
          if (!response) throw new Error(`Missing cached boot entry: ${path}`);
          const bytes = await response.arrayBuffer();
          const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
            .map((value) => value.toString(16).padStart(2, '0'))
            .join('');
          entries.push({ path, sha256: digest, bytes: bytes.byteLength });
        }
        return entries;
      }, cachePaths);
      for (const entry of cacheHashes)
        assert.deepEqual(entry, {
          path: entry.path,
          sha256: files.find((file) => file.path === entry.path).sha256,
          bytes: files.find((file) => file.path === entry.path).bytes,
        });
      setRequests.length = 0;
      const beforeFault = { at: Date.now(), requests: httpRequests.length, responses: servedResponses };
      networkPhase = 'fault-activation';
      if (offlineFault === 'context-offline') await context.setOffline(true);
      else serverConnected = false;
      // The assertion concerns the offline reload interval. Chromium applies
      // setOffline asynchronously; pending online work can arrive before its
      // acknowledgement. Preserve that transition separately from the cut.
      networkPhase = 'offline-reload';
      const requestCount = httpRequests.length;
      const responseCount = servedResponses;
      const activated = { at: Date.now(), requests: requestCount, responses: responseCount };
      try {
        await page.reload({ waitUntil: 'load' });
        await ready(page);
        const navigatorOnline = await page.evaluate(() => navigator.onLine);
        if (offlineFault === 'context-offline') assert.equal(navigatorOnline, false);
        await door(page);
        const after = await selected(page);
        assert.equal(after.attempt.attemptId, before.attempt.attemptId);
        assert.equal(after.formRevisionId, before.formRevisionId);
        assert.equal(after.run.ix, 1);
        assert.deepEqual(after.run.answers, before.run.answers);
        assert.equal(after.attempt.clockStatus, 'unverified');
        assert.equal(
          await page.locator('[data-mock-opt="0"]').getAttribute('aria-pressed'),
          'true',
        );
        assert.equal(setRequests.length, 0);
        assert.equal(servedResponses, responseCount, 'Offline reload received no server responses');
        if (offlineFault === 'context-offline') assert.equal(httpRequests.length, requestCount);
        await choose(page, 1);
        assert.equal((await selected(page)).run.answers[1], 1, 'An offline answer commits locally');
        await page.screenshot({
          path: resolve(OUT, 'offline-resumed-practice.png'),
          fullPage: true,
        });
        return {
          offlineFault,
          navigatorOnline,
          receivedServerResponses: servedResponses - responseCount,
          workerInstallation: 'Automatic HTTPS registration by the unchanged release',
          cachedReleaseEntries: cacheHashes,
          cachedShell: true,
          upstreamSetRequests: 0,
          priorAnswersRetained: 2,
          offlineAnswerCommitted: true,
        };
      } finally {
        const after = { at: Date.now(), requests: httpRequests.length, responses: servedResponses };
        observations.offlineBoundary = {
          offlineFault, beforeFault, activated, after,
          activationRequests: httpRequestDetails.slice(beforeFault.requests, requestCount),
          offlineIntervalRequests: httpRequestDetails.slice(requestCount, after.requests),
          postActivationServerResponses: after.responses - activated.responses,
          qualification: 'Request counters count server-handler admissions; response finish timestamps are recorded separately. The historical R11 extra request had no path receipt and is not identified here.',
        };
        writeFileSync(resolve(OUT, 'offline-response-boundary.json'), JSON.stringify(observations.offlineBoundary, null, 2) + '\n');
        networkPhase = 'restoring-online';
        serverConnected = true;
        if (offlineFault === 'context-offline') await context.setOffline(false);
        networkPhase = 'online';
      }
    },
    { serviceWorkers: 'allow' },
  );

  const oldRun = {
    setId: 'n5-01',
    level: 'N5',
    ix: 2,
    answers: [3, 1, null],
    ts: 1_700_000_000_000,
    oldExtra: { kept: true },
  };
  const oldDone = {
    'n5-01': { score: 3, total: 18, ts: 1_700_000_000_500, legacyRemark: 'Synthetic old summary' },
  };
  await check(
    'legacy-evidence-and-full-export-restore-keep-exact-history',
    async ({ page, context }) => {
      await door(page);
      assert.equal(await page.locator('#mock-next').count(), 0);
      assert.match(
        await page.locator('.mock-legacy-notice').innerText(),
        /original question versions are unknown/iu,
      );
      await start(page);
      const atStart = (await record(page)).assessmentLibrary;
      assert.equal(atStart.attempts.length, 1);
      assert.equal(atStart.legacyEvidence.length, 2);
      assert.deepEqual(
        atStart.legacyEvidence.find((entry) => entry.kind === 'run').original,
        oldRun,
      );
      assert.equal(
        atStart.legacyEvidence.find((entry) => entry.kind === 'run').resumeAllowed,
        false,
      );
      assert.deepEqual(
        (await selected(page)).run.answers,
        Array(18).fill(null),
        'New sitting does not inherit unbound old positional answers',
      );
      await finish(
        page,
        items.map((item) => item.right),
      );
      await done(page);
      const saved = await record(page);
      assert.deepEqual(saved.mockRun, oldRun);
      assert.deepEqual(saved.mockDone, oldDone);
      await page.locator('#tray').click();
      const pending = page.waitForEvent('download');
      await page.locator('#export-store').click();
      const download = await pending;
      const stream = await download.createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const backup = JSON.parse(bytes.toString('utf8'));
      assert.equal(backup.format, 'kairo-backup', 'Use the actual complete UI backup');
      assert.deepEqual(backup.record.assessmentLibrary, saved.assessmentLibrary);
      assert.deepEqual(backup.record.futurePracticeWidget, opaqueRoot);
      assert.deepEqual(backup.record.mockRun, oldRun);
      assert.deepEqual(backup.record.mockDone, oldDone);
      writeFileSync(resolve(OUT, 'synthetic-practice-backup.json'), bytes);
      assert.equal(backup.version, 2, 'The real UI backup includes its operation journal');
      assert.deepEqual(backup.journal.scope, restoreFixtureScope);
      assert.equal(backup.journal.operations.length, 1, 'The completed attempt contributes its exact exam operation');
      const sourceNative = await readAppRecordSnapshot(page);
      await context.close(); // The source is retained; destination profiles run serially.
      // A separate default profile is a foreign learner, not a restore target.
      // Exercise the actual refusal and compare the complete native rows,
      // including operation journal, outbox, receipts, actor and profile.
      const foreign = await fresh();
      try {
        // Nonempty destination history makes refusal preservation substantive.
        await door(foreign.page);
        await start(foreign.page);
        await finish(foreign.page, items.map((item) => item.right));
        await done(foreign.page);
        const before = await readAppRecordSnapshot(foreign.page);
        assert.equal(before.rows.filter((row) => row.kind === 'operation').length, 1);
        assert.equal(before.rows.filter((row) => row.kind === 'outbox').length, 1);
        assert.notEqual(before.installation.binding.accountId, restoreFixtureScope.accountId);
        assert.notEqual(before.installation.binding.learnerId, restoreFixtureScope.learnerId);
        await foreign.page.locator('#tray').click();
        await foreign.page.evaluate(() => { window.__practiceBeforeImport = true; });
        await foreign.page.locator('#import-file').setInputFiles({
          name: 'synthetic-foreign-practice-backup.json', mimeType: 'application/json', buffer: bytes,
        });
        await foreign.page.waitForFunction(() =>
          document.getElementById('record-portability-status')?.textContent === 'This backup belongs to a different learner. Choose a backup for the current learner. Nothing was changed.' &&
          document.getElementById('import-store')?.disabled === false && document.getElementById('import-file')?.value === '');
        const after = await readAppRecordSnapshot(foreign.page);
        assert.deepEqual(after, before, 'Foreign journal cannot change any destination native row or binding');
        assert.equal(await foreign.page.evaluate(() => window.__practiceBeforeImport), true, 'Refusal does not reload');
        assert.deepEqual(foreign.errors, []);
        writeFileSync(resolve(OUT, 'synthetic-foreign-import-control.json'), JSON.stringify({
          fixtureAuthority: 'Independent synthetic foreign learner; no backup-derived authority',
          sourceScope: restoreFixtureScope, before, after, fullNativeRowsUnchanged: true,
          operationRowsUnchanged: true, outboxRowsUnchanged: true, bindingUnchanged: true, noReload: true,
        }, null, 2) + '\n');
      } finally { await foreign.context.close(); }
      // Restore into a clean database for the independently admitted same
      // synthetic learner, with a different session, actor and database.
      const restored = await fresh(seed, { admittedScope: restoreFixtureScope });
      const restoredBefore = await readAppRecordSnapshot(restored.page);
      assert.deepEqual({ accountId: restoredBefore.installation.binding.accountId, learnerId: restoredBefore.installation.binding.learnerId }, restoreFixtureScope);
      assert.notEqual(restoredBefore.installation.binding.sessionId, sourceNative.installation.binding.sessionId);
      assert.notEqual(restoredBefore.installation.actor.deviceId, sourceNative.installation.actor.deviceId);
      assert.notEqual(restoredBefore.installation.actor.incarnationId, sourceNative.installation.actor.incarnationId);
      assert.notEqual(restoredBefore.installation.databaseName, sourceNative.installation.databaseName);
      try {
        await restored.page.locator('#tray').click();
        await restored.page.evaluate(() => {
          window.__practiceBeforeImport = true;
        });
        await restored.page.locator('#import-file').setInputFiles({
          name: 'synthetic-practice-backup.json',
          mimeType: 'application/json',
          buffer: bytes,
        });
        await restored.page.waitForFunction(() => window.__practiceBeforeImport !== true, null, {
          timeout: 20_000,
        });
        await ready(restored.page);
        const restoredAfter = await readAppRecordSnapshot(restored.page);
        assert.deepEqual(restoredAfter.installation, restoredBefore.installation, 'Backup never replaces destination authority');
        const operations = restoredAfter.rows.filter((row) => row.kind === 'operation').map((row) => JSON.parse(row.text));
        assert.deepEqual(operations, backup.journal.operations, 'Restore preserves exact completed-attempt operation bytes');
        const outbox = restoredAfter.rows.filter((row) => row.kind === 'outbox').map((row) => JSON.parse(row.text));
        assert.equal(outbox.length, backup.journal.operations.length);
        const expectedReferences = await restored.page.evaluate(async (operations) => {
          const core = await import('./modules/record-core.mjs');
          return operations.map((operation) => core.operationReference(operation));
        }, backup.journal.operations);
        assert.deepEqual(outbox.map((row) => row.operation), expectedReferences);
        assert(outbox.every((row) => row.acknowledged === false));
        writeFileSync(resolve(OUT, 'synthetic-same-learner-restore-control.json'), JSON.stringify({
          fixtureAuthority: 'Shared account/learner fixed independently before either boot; unique session/actor/database per profile; no production authorization claim',
          sourceInstallation: sourceNative.installation, before: restoredBefore, after: restoredAfter,
          exactOperationsRestored: true, freshDestinationAuthorityRetained: true,
        }, null, 2) + '\n');
        const value = restoredAfter.record;
        assert.deepEqual(value.assessmentLibrary, saved.assessmentLibrary);
        assert.deepEqual(value.futurePracticeWidget, opaqueRoot);
        assert.deepEqual(value.mockRun, oldRun);
        assert.deepEqual(value.mockDone, oldDone);
        await door(restored.page);
        await restored.page
          .locator(`[data-mock-history="${saved.assessmentLibrary.attempts[0].attemptId}"]`)
          .click();
        assert.match(
          await restored.page.locator('h1.view-title').innerText(),
          /18(?: of | \/ )18/u,
        );
        assert.deepEqual(restored.errors, []);
      } finally {
        await restored.context.close();
      }
      return {
        completedAttemptsRestored: 1,
        legacyBundles: 2,
        oldRunResumeAllowed: false,
        unknownRootPreserved: true,
        backupBytes: bytes.length,
        backupSha256: hash(bytes),
        sameLearnerFixture: 'Independently admitted before either boot; distinct session/device/incarnation/database',
        foreignScopeRejectedWithoutNativeChanges: true,
        exactJournalOperationsRestored: 1,
      };
    },
    { record: { ...seed, mockRun: oldRun, mockDone: oldDone }, admittedScope: restoreFixtureScope },
  );

  await check(
    'phone-fit-and-44px-practice-controls',
    async ({ page }) => {
      await door(page);
      const shelf = await phoneTargets(page, ['[data-mock-set="n5-01"]']);
      await start(page);
      const question = await phoneTargets(page, [
        '[data-mock-opt]',
        '#mock-next',
        '#mock-quit',
        '#mock-drop',
      ]);
      await choose(page, items[0].right);
      await advance(page);
      const navigation = await phoneTargets(page, ['#mock-prev', '#mock-next']);
      await page.screenshot({ path: resolve(OUT, 'practice-phone-question.png'), fullPage: true });
      await finish(
        page,
        items.map((item) => item.right),
        1,
      );
      const result = await phoneTargets(page, ['#mock-done']);
      await done(page);
      const history = await phoneTargets(page, ['[data-mock-history]']);
      await page.screenshot({ path: resolve(OUT, 'practice-phone-history.png'), fullPage: true });
      observations.phone = { shelf, question, navigation, result, history };
      return {
        viewport: { width: 390, height: 844 },
        minTargetCssPx: 44,
        horizontalOverflow: false,
      };
    },
    { viewport: { width: 390, height: 844 } },
  );

  await check(
    'wall-clock-rollback-keeps-observed-time-and-monotonic-duration',
    async ({ page }) => {
      await door(page);
      await start(page);
      await choose(page, 0);
      const before = await selected(page);
      await page.evaluate(() => {
        window.__practiceOriginalNow = Date.now;
        Date.now = () => window.__practiceOriginalNow() - 86_400_000;
      });
      try {
        await choose(page, 1);
        const after = await selected(page);
        assert(
          after.attempt.recordedAt < before.attempt.recordedAt,
          'Observed wall time is retained without invented clamping',
        );
        assert(after.elapsedMs >= before.elapsedMs);
        assert(after.activeMs >= before.activeMs);
        assert.equal(after.run.answers[0], 1);
        assert.equal(after.attempt.facts.filter((fact) => fact.kind === 'response').length, 2);
        return {
          answerRetained: true,
          wallClockMovedBackDays: 1,
          elapsedDurationDidNotRegress: true,
        };
      } finally {
        await page.evaluate(() => {
          Date.now = window.__practiceOriginalNow;
        });
      }
    },
  );
  for (const name of RECEIVED_CASES) await checkReceived(name);
} finally {
  for (const peer of receivedPeers) await closeReceived(peer);
  await browser?.close();
  await new Promise((done) => server.close(done));
  bookends();
  assert.equal(receivedContexts, 0);
  const receipt = {
    format: 'kairo-practice-history-ui-verification',
    v: 1,
    source: { path: sourcePath, sha256: sourceSha256 },
    helpers: helperSha256,
    filters: [...FILTERS],
    artifact: {
      path: ROOT,
      sha256: EXPECTED,
      verifiedFiles: files.length,
      controllerSha256: files.find((file) => file.path === 'assessment-controller.mjs').sha256,
      coreSha256: files.find((file) => file.path === 'modules/assessment-core.mjs').sha256,
    },
    runtime: {
      node: process.version,
      engine: browserName,
      version: engineVersion,
      protocol: 'https',
      offlineFault,
      audioOutput: TEST_AUDIO_OUTPUT,
    },
    fixture: {
      setId: set.setId,
      fileSha256: hash(readFileSync(resolve(ROOT, 'data/mock/sets/n5-01.json'))),
      questions: items.length,
      editorial: 'unreviewed',
      records: 'synthetic only',
    },
    results,
    observations,
    lifecycle,
    externalRequests,
    receivedPeers: receivedPeers.map(peer => ({ name: peer.name, side: peer.side, profile: peer.profile,
      episodes: peer.episode, errors: peer.errors, evidence: resolve(peer.directory, 'evidence.json') })),
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).length,
    limitations: [
      'Browser engines on this Mac, not a physical phone or native Mac application',
      'Synthetic native admission and operation-only relay do not authenticate devices or establish live cross-device sync',
      'Adversarial received payloads, network responses and scriptless storage-warning frames are explicit fixtures, not ordinary authoring paths',
      'Worker-blocked network-control episodes establish no offline claim; only the ordinary relay case restarts with real cached worker resources',
      'Quota faults are injected; the 500-attempt contract fixture does not establish browser capacity',
      'Structural/behavior checks do not approve question language or establish official exam scoring',
      'Exact supplied runtime verified internally; concurrently edited checkout is not asserted equal to the tested artifact',
    ],
  };
  writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (!results.length || results.some((result) => !result.pass) || results.length !== CASES.filter(requested).length || externalRequests.length) process.exitCode = 1;
}
