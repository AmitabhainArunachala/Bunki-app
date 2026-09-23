/** Actual note UI over the installed native record database. Synthetic peer
 * scopes/source admissions are fixture premises, never authentication claims.
 * No application reducer, writer capability, or record localStorage is faked. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { createAppBackupFixture, restoreAppFixture } from './record-fixture-support.mjs';
import { readAppRecordSnapshot } from './record-test-support.mjs';

const SITE = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
const ENGINES = (process.env.KAIRO_BROWSER || 'all') === 'all'
  ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER];
assert(ENGINES.every((engine) => ['chromium', 'webkit'].includes(engine)));
const FILTER = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
const verifierSha256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
const normalize = (value) => Array.isArray(value) ? value.map(normalize)
  : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])])) : value;
const digest = (value) => createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
// Sync references use domain canonicalJson (two-space JSON), whereas the
// persistence backup envelope above uses compact encodeLocalJson bytes.
const reference = (operation) => ({ opId: operation.opId,
  sha256: createHash('sha256').update(JSON.stringify(normalize(operation), null, 2)).digest('hex') });
const sortOperations = (operations) => [...operations].sort((a, b) => a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0);
const note = (noteId, versionId, text) => ({ kind: 'note.version', noteId, versionId,
  generation: null, supersedes: [], segments: [{ kind: 'original', text }] });
const results = [];
const errors = [];
const externalRequests = [];
const browserVersions = {};
const startedAt = new Date().toISOString();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    if (!file.startsWith(`${SITE}/`) || !statSync(file).isFile()) throw new Error('missing');
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

async function exact(page, action, value) {
  return JSON.parse(await page.evaluate(async ({ source, input }) => {
    const run = (0, eval)(`(${source})`);
    return JSON.stringify(await run(JSON.parse(input)));
  }, { source: String(action), input: JSON.stringify(value ?? null) }));
}
async function ready(page) {
  await page.waitForFunction(() => document.body.dataset.ready === '1');
}
async function tray(page) {
  if (!await page.locator('#import-file').count()) await page.locator('#tray').click();
  await page.locator('#note-input').waitFor();
}
async function sourceOperation(page, actor, payload, occurredAt = '2026-09-10T01:00:00.000Z') {
  return exact(page, async ({ actor, payload, occurredAt }) => {
    const core = await import('./modules/record-core.mjs');
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const policy = { binding: { ...installation.binding, sessionId: 'synthetic-note-source-session' },
      schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: `note-view-source:${actor}`,
      policy, actor: { deviceId: `synthetic-note-peer:${actor}`, incarnationId: 'fixture-installation' } });
    try {
      const before = await store.snapshot();
      await store.commitLocal({ changeId: `${actor}:${before.actor.sequence + 1}`, binding: policy.binding,
        expectedRevision: before.revision, occurredAt, mutations: [], operations: [{ payload, dependencies: [] }] });
      const after = await store.snapshot();
      return after.replica.operations.find((operation) => operation.actor.deviceId === after.actor.deviceId
        && operation.actor.sequence === after.actor.sequence);
    } finally { await store.close(); }
  }, { actor, payload, occurredAt });
}
async function peer(page) {
  await page.evaluate(async () => {
    if (window.__noteFixturePeer) return;
    const core = await import('./modules/record-core.mjs');
    const installationText = localStorage.getItem('kairo-local-record-binding-v1');
    const installation = JSON.parse(installationText);
    const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
    window.__noteFixturePeer = { store, installationText, core };
  });
}
async function native(page) {
  await peer(page);
  const snapshot = await exact(page, async () => {
    const { store, installationText } = window.__noteFixturePeer;
    if (localStorage.getItem('kairo-local-record-binding-v1') !== installationText) throw new Error('Fixture installation changed');
    return store.snapshot();
  });
  const raw = await readAppRecordSnapshot(page);
  assert.equal(snapshot.revision, raw.revision, 'Native record roots and replica must describe the same revision');
  for (const row of raw.rows) assert.equal(createHash('sha256').update(row.text).digest('hex'), row.sha256);
  assert.deepEqual(snapshot.documents.find((row) => row.collection === 'learner-record' && row.id === 'current')?.value, raw.record);
  return { raw, snapshot };
}
async function receive(page, operations, deliveryId, channelId = 'synthetic-note-view-receive') {
  await peer(page);
  return exact(page, async ({ operations, deliveryId, channelId }) => {
    const { store, installationText } = window.__noteFixturePeer;
    if (localStorage.getItem('kairo-local-record-binding-v1') !== installationText) throw new Error('Fixture installation changed');
    const current = await store.snapshot();
    try {
      const receipt = await store.commitReceive({ deliveryId, expectedRevision: current.revision,
        delivery: { binding: current.policy.binding, operations },
        checkpoint: { channelId, expected: current.checkpoints.find((row) => row.channelId === channelId)?.value ?? null,
          next: deliveryId } });
      return { status: 'committed', receipt };
    } catch (error) { return { status: 'rejected', code: error.code || error.name, message: error.message }; }
  }, { operations, deliveryId, channelId });
}
async function journal(page, operations) {
  const installation = (await readAppRecordSnapshot(page)).installation;
  const body = { format: 'kairo-operation-journal', v: 1,
    scope: { accountId: installation.binding.accountId, learnerId: installation.binding.learnerId },
    schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1', operations: JSON.parse(JSON.stringify(operations)) };
  return { ...body, sha256: digest(body) };
}
/** An import canonicalizes absent draft roots to empty collections (the
 * 'known empty-draft canonicalization' the practice and tutor suites declare);
 * expectations captured before an import compare through the same rule. */
const withCanonicalDrafts = (record) => ({ ...record,
  teacherDrafts: record.teacherDrafts ?? { version: 1, entries: [] },
  sentenceDrafts: record.sentenceDrafts ?? { version: 1, entries: [] } });

async function admit(page, evidence, stage, expectedOperations) {
  const state = await native(page);
  if (expectedOperations) assert.deepEqual(sortOperations(state.snapshot.replica.operations), sortOperations(expectedOperations), 'The installed target must contain the exact admitted operation bytes');
  assert.equal(state.snapshot.actor.sequence, 0, 'A received projection never allocates a local learner event');
  const file = resolve(evidence.directory, `${evidence.name}--${stage}.json`);
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  evidence.admissions.push({ stage, file, revision: state.raw.revision, operations: state.snapshot.replica.operations.length,
    ready: state.snapshot.replica.ready.length, pending: state.snapshot.replica.pending.length,
    quarantined: state.snapshot.replica.quarantined.length, rowBytesSha256: digest(state.raw.rows) });
  evidence.phase = `native-admitted:${stage}`;
  return state;
}
async function foreground(page, focusOnly = false) {
  // Exercise public browser lifecycle listeners, never an application refresh
  // function. Synthetic focus/visibility dispatch makes both engines repeatable.
  await page.bringToFront();
  await page.evaluate((focusOnly) => {
    window.dispatchEvent(new Event('focus'));
    if (!focusOnly) document.dispatchEvent(new Event('visibilitychange'));
  }, focusOnly);
}
async function requireSurface(page, evidence) {
  assert.equal(await page.locator('#record-notes').count(), 1,
    'Missing #record-notes after the fixture was proven in the installed native database');
  evidence.phase = 'rendered-note-surface';
}
async function rendered(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#record-notes');
    if (!root) return null;
    return { revision: root.dataset.revision, notes: [...root.querySelectorAll('article.record-note')].map((article) => ({
      noteId: article.dataset.noteId, text: article.textContent,
      versions: [...article.querySelectorAll('.record-note-version')].map((version) => ({
        payloadSha256: version.dataset.payloadSha256, copyCount: version.dataset.copyCount,
        segments: [...version.querySelectorAll('.record-note-segment')].map((segment) => ({
          kind: segment.dataset.segmentKind, text: segment.textContent, childElements: segment.childElementCount,
        })),
      })),
    })) };
  });
}
async function assertRendered(page, state) {
  await page.waitForFunction((revision) => document.querySelector('#record-notes')?.dataset.revision === String(revision), state.raw.revision);
  const actual = await rendered(page);
  const projections = state.snapshot.replica.projection.entities.filter((projection) => projection.target.kind === 'note');
  assert.equal(actual.notes.length, projections.length, 'Every visible, deleted and restore-only note needs exactly one state row');
  assert.equal(new Set(actual.notes.map((row) => row.noteId)).size, actual.notes.length);
  const byId = new Map(state.snapshot.replica.operations.map((operation) => [operation.opId, operation]));
  for (const projection of projections) {
    const row = actual.notes.find((candidate) => candidate.noteId === projection.target.id);
    assert(row, `Missing exact opaque note identity ${projection.target.id}`);
    const heads = new Map();
    for (const ref of projection.heads) {
      const operation = byId.get(ref.opId);
      assert.equal(reference(operation).sha256, ref.sha256);
      const existing = heads.get(operation.payloadSha256);
      if (existing) existing.copies += 1;
      else heads.set(operation.payloadSha256, { payload: operation.payload, copies: 1 });
    }
    assert.deepEqual(row.versions.map((version) => version.payloadSha256), [...heads.keys()], 'DOM alternatives follow the complete current core projection');
    for (const version of row.versions) {
      const expected = heads.get(version.payloadSha256);
      assert.equal(version.copyCount, String(expected.copies));
      assert.deepEqual(version.segments, expected.payload.segments.map((segment) => ({ kind: segment.kind, text: segment.text, childElements: 0 })),
        'Exact ordered segment bytes must remain text, including HTML-looking and unnormalized Unicode text');
    }
    if (projection.identityConflicts.length) assert.match(row.text, /conflict|競合|食い違/iu, 'Version-label ambiguity remains visible independently of content choices');
    if (projection.requiresChoice) assert.match(row.text, /alternative|version|choice|選|版/iu, 'Concurrent choices need a learner-facing state label');
    if (!projection.heads.length && projection.tombstones.length && !projection.activeRestoreGenerations.length)
      assert.match(row.text, /hidden|deleted|非表示|削除/iu, 'Deleted notes must explain their state without revealing history');
    if (!projection.heads.length && projection.activeRestoreGenerations.length)
      assert.match(row.text, /restor|復元/iu, 'Restore-only notes must not pretend historical text is restored');
    if (!projection.heads.length) {
      for (const operation of byId.values()) {
        if (operation.payload.kind !== 'note.version' || operation.payload.noteId !== projection.target.id) continue;
        for (const segment of operation.payload.segments) {
          if (segment.text) assert(!row.text.includes(segment.text), 'Hidden historical segments cannot leak into state labels or details');
        }
      }
    }
  }
  assert.equal(await page.evaluate(() => window.__noteSourceHtml), undefined, 'Source HTML-looking text must not execute');
  return actual;
}
async function exportCrossCheck(page, state) {
  const exported = await exact(page, async () => window.__KAIRO_AI__.exportRecord());
  assert.equal(typeof exported.text, 'string', 'The actual public exporter must produce a complete portable file');
  assert.equal(exported.warning, undefined);
  const backup = JSON.parse(exported.text);
  assert.equal(backup.version, 2);
  assert.deepEqual(backup.record, state.raw.record);
  assert.deepEqual(backup.archive, state.raw.archive);
  assert.deepEqual(sortOperations(backup.journal.operations), sortOperations(state.snapshot.replica.operations));
  assert.equal(backup.journal.sha256, digest(Object.fromEntries(Object.entries(backup.journal).filter(([key]) => key !== 'sha256'))));
}
async function armNative(page, mode) {
  assert(['hold-write', 'hold-read', 'hold-legacy-read', 'abort', 'quota'].includes(mode));
  await peer(page);
  await page.evaluate((mode) => {
    if (window.__noteNativeFault) throw new Error('Native note fault already armed');
    const databaseName = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1')).databaseName;
    const transaction = IDBDatabase.prototype.transaction;
    const put = IDBObjectStore.prototype.put;
    const getAll = IDBIndex.prototype.getAll;
    const fault = { mode, fired: 0, active: true, released: false, complete: false, aborted: false, capturedRevision: null };
    let held;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      const wanted = ['hold-read', 'hold-legacy-read'].includes(mode) ? 'readonly' : 'readwrite';
      const heldDatabaseName = mode === 'hold-legacy-read' ? 'kairo-ai-log' : databaseName;
      if (fault.active && !fault.fired && this.name === heldDatabaseName && (args[1] || 'readonly') === wanted && mode.startsWith('hold-')) {
        held = tx; fault.fired++;
        tx.addEventListener('complete', () => { fault.complete = true; });
        tx.addEventListener('abort', () => { fault.aborted = true; });
        const keepAlive = () => {
          if (fault.released) return;
          const request = tx.objectStore(mode === 'hold-legacy-read' ? 'turns' : 'kairo_replication_rows').get('synthetic-note-keepalive');
          request.onsuccess = keepAlive;
        };
        keepAlive();
      }
      return tx;
    };
    IDBIndex.prototype.getAll = function (...args) {
      const request = getAll.apply(this, args);
      if (this.objectStore.transaction === held || (mode === 'hold-legacy-read' && !fault.fired && this.objectStore.transaction.db.name === databaseName)) request.addEventListener('success', () => {
        const profile = request.result.find((row) => row.kind === 'profile');
        if (profile) fault.capturedRevision = JSON.parse(profile.text).revision;
      });
      return request;
    };
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (fault.active && !fault.fired && this.transaction.db.name === databaseName
        && this.name === 'kairo_replication_rows' && args[0]?.kind === 'operation' && ['abort', 'quota'].includes(mode)) {
        fault.fired++;
        if (mode === 'abort') this.transaction.abort();
        else throw new DOMException('Synthetic quota after a real received operation put', 'QuotaExceededError');
      }
      return request;
    };
    fault.release = () => { fault.released = true; };
    fault.disarm = () => {
      fault.active = false; fault.released = true;
      IDBDatabase.prototype.transaction = transaction;
      IDBObjectStore.prototype.put = put;
      IDBIndex.prototype.getAll = getAll;
    };
    window.__noteNativeFault = fault;
  }, mode);
}
async function faultState(page, disarm = false) {
  return page.evaluate((disarm) => {
    const fault = window.__noteNativeFault;
    if (!fault) throw new Error('No native fault');
    const { mode, fired, complete, aborted, capturedRevision } = fault;
    if (disarm) { fault.disarm(); delete window.__noteNativeFault; }
    return { mode, fired, complete, aborted, capturedRevision };
  }, disarm);
}
async function rememberSurface(page, focusId = 'note-input') {
  // Start from a fully visible learner field. A field intentionally left below
  // the viewport would confound later native focus scrolling with note layout.
  await page.locator(`#${focusId}`).scrollIntoViewIfNeeded();
  return page.evaluate(async (focusId) => {
    const nodes = Object.fromEntries(['note-input', 'list-maker-field', 'note-send', 'list-maker-make']
      .map((id) => [id, document.getElementById(id)]));
    if (Object.values(nodes).some((node) => !node)) throw new Error('Fixture tray controls are missing');
    nodes[focusId].focus({ preventScroll: true }); nodes[focusId].setSelectionRange(2, 9, 'backward');
    // Let native focus/selection layout settle before measuring preservation.
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const rect = nodes[focusId].getBoundingClientRect();
    const value = { focusId, selection: [nodes[focusId].selectionStart, nodes[focusId].selectionEnd, nodes[focusId].selectionDirection],
      values: Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, node.value])),
      disabled: Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, node.disabled])),
      drafts: sessionStorage.getItem('kairo-record-drafts-v1'), scroll: [scrollX, scrollY],
      focusedRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    window.__noteSurface = { nodes, value };
    return value;
  }, focusId);
}
async function assertSurface(page, expected, evidence) {
  const actual = await page.evaluate(async () => {
    const { nodes, value } = window.__noteSurface;
    const geometry = () => {
      const rect = document.activeElement.getBoundingClientRect();
      return { scroll: [scrollX, scrollY], focusedRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    };
    const viewportFrames = [geometry()];
    await new Promise(requestAnimationFrame); viewportFrames.push(geometry());
    await new Promise(requestAnimationFrame); viewportFrames.push(geometry());
    const focused = document.activeElement;
    const rect = focused.getBoundingClientRect();
    return { sameNodes: Object.entries(nodes).every(([id, node]) => node === document.getElementById(id)),
      focusId: focused.id, selection: [focused.selectionStart, focused.selectionEnd, focused.selectionDirection],
      values: Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, node.value])),
      disabled: Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, node.disabled])),
      drafts: sessionStorage.getItem('kairo-record-drafts-v1'), scroll: [scrollX, scrollY], originalFocus: value.focusId,
      focusedRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, viewportFrames };
  });
  assert.equal(actual.sameNodes, true, 'Receive-only rendering must retain surrounding DOM nodes');
  const { sameNodes, originalFocus, scroll, focusedRect, viewportFrames, ...surface } = actual;
  const { scroll: beforeScroll, focusedRect: beforeRect, ...prior } = expected;
  void sameNodes; void originalFocus;
  assert.deepEqual(surface, prior, 'Draft bytes, focused field, caret and disabled controls must remain untouched');
  const scrollDelta = scroll.map((value, index) => value - beforeScroll[index]);
  const rectDelta = Object.fromEntries(Object.keys(focusedRect).map((key) => [key, focusedRect[key] - beforeRect[key]]));
  const stableViewport = Object.values(rectDelta).every((value) => Math.abs(value) <= 1);
  evidence?.observations.push({ name: 'focused-draft-viewport-preservation', stage: evidence.phase, pass: stableViewport,
    beforeScroll, afterScroll: scroll, scrollDelta, beforeRect, afterRect: focusedRect, rectDelta, viewportFrames,
    interpretation: stableViewport ? scrollDelta.some((value) => value) ? 'viewport-preserved-with-browser-anchoring' : 'unchanged-scroll-and-viewport' : 'unexpected-focused-draft-viewport-shift' });
  assert(stableViewport, `The focused draft must remain visually stationary; scroll delta ${JSON.stringify(scrollDelta)}, viewport rect delta ${JSON.stringify(rectDelta)}`);
}
async function observeNotePublications(page) {
  await page.evaluate(() => {
    const root = document.getElementById('record-notes');
    if (!root) throw new Error('No committed note surface to observe');
    const revisions = [root.dataset.revision];
    const collect = (records) => {
      for (const record of records) if (record.attributeName === 'data-revision') revisions.push(record.oldValue);
      revisions.push(root.dataset.revision);
    };
    const observer = new MutationObserver(collect);
    observer.observe(root, { attributes: true, attributeOldValue: true, attributeFilter: ['data-revision'] });
    window.__notePublications = { root, revisions, observer, collect };
  });
}
async function notePublications(page) {
  return page.evaluate(() => {
    const { root, revisions, observer, collect } = window.__notePublications;
    collect(observer.takeRecords()); observer.disconnect(); delete window.__notePublications;
    if (root !== document.getElementById('record-notes')) throw new Error('Foreground refresh replaced its note container');
    return revisions.filter((revision) => revision !== undefined && revision !== null);
  });
}

try {
  for (const engine of ENGINES) {
    const browser = await ({ chromium, webkit }[engine]).launch();
    browserVersions[engine] = browser.version();
    const directory = resolve(OUT, engine); mkdirSync(directory, { recursive: true });
    const test = async (name, body) => {
      if (FILTER && FILTER !== name) return;
      const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block' });
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        externalRequests.push({ engine, name, origin: url.origin }); return route.abort();
      });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      // Keep bounded context for an intermittent resource failure. A rerun
      // cannot explain an earlier page error, and teardown errors still fail.
      let lifecycle = 'boot';
      const recent = [];
      const observe = (kind, detail = {}) => {
        recent.push({ kind, phase: lifecycle, at: Date.now(), ...detail });
        if (recent.length > 24) recent.shift();
      };
      page.on('request', (request) => {
        if (request.url().includes('/data/articles/')) observe('article-request', { url: request.url() });
      });
      page.on('requestfinished', (request) => {
        if (request.url().includes('/data/articles/')) observe('article-finished', { url: request.url() });
      });
      page.on('requestfailed', (request) => observe('request-failed', { url: request.url(), failure: request.failure() }));
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) observe('navigation', { url: frame.url() });
      });
      page.on('pageerror', (error) => errors.push({ engine, name, phase: lifecycle, at: Date.now(),
        message: error.message, stack: error.stack, recent: [...recent] }));
      const evidence = { name, directory, phase: 'boot', admissions: [], observations: [] };
      const began = Date.now();
      try {
        await page.goto(`${origin}/index.html?entry=shelf&ui=bi`); await ready(page);
        lifecycle = 'case';
        await body(page, evidence);
        lifecycle = 'screenshot';
        evidence.screenshot = resolve(directory, `${name}-pass.png`);
        await page.screenshot({ path: evidence.screenshot, fullPage: true });
        results.push({ engine, name, pass: true, elapsedMs: Date.now() - began, ...evidence });
      } catch (error) {
        evidence.screenshot = resolve(directory, `${name}-failure.png`);
        results.push({ engine, name, pass: false, error: String(error.stack || error), elapsedMs: Date.now() - began, ...evidence });
        await page.screenshot({ path: evidence.screenshot, fullPage: true }).catch(() => {});
      } finally {
        // Complete actual same-origin reads before closing the disposable page;
        // teardown must not manufacture an unhandled fetch-abort page error.
        lifecycle = 'settle-before-teardown';
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch((error) => {
          errors.push({ engine, name, phase: 'settle-before-teardown', message: error.message });
        });
        lifecycle = 'close-fixture-store';
        await page.evaluate(async () => {
          window.__noteNativeFault?.disarm();
          await window.__noteFixturePeer?.store.close();
        }).catch(() => {});
        lifecycle = 'close-context';
        await context.close();
      }
      console.log(`${engine} ${name}: ${results.at(-1).pass ? 'PASS' : `FAIL (${evidence.phase})`}`);
    };
    try {
      await test('empty-tray-import-preserves-concurrent-note-choices-and-exact-segments', async (page, evidence) => {
        const initial = await readAppRecordSnapshot(page);
        const key = randomUUID();
        const base = await sourceOperation(page, `${key}:mac`, note('shared-note', 'base', 'Historical base must not be a visible head'));
        const payload = { ...note('shared-note', 'reused-label', ''), supersedes: [reference(base)], segments: [
          { kind: 'original', text: '<img src=x onerror="window.__noteSourceHtml=1">\n e\u0301  ' },
          { kind: 'original', text: '\tSecond original segment 😀\r\n' },
        ] };
        const left = await sourceOperation(page, `${key}:mac`, payload, '2099-01-01T00:00:00.000Z');
        const copied = await sourceOperation(page, `${key}:tablet`, payload);
        const right = await sourceOperation(page, `${key}:phone`, { ...note('shared-note', 'reused-label', 'Different concurrent text with an earlier clock'), supersedes: [reference(base)] }, '2020-01-01T00:00:00.000Z');
        const composed = await sourceOperation(page, `${key}:unicode-a`, note('café', 'v-é', 'Composed opaque note identity'));
        const decomposed = await sourceOperation(page, `${key}:unicode-b`, note('cafe\u0301', 'v-e\u0301', 'Decomposed opaque note identity'));
        const quoteText = '<b>猫😀e\u0301</b>\n';
        const quoted = await sourceOperation(page, `${key}:quote`, { ...note('quoted-note', 'quoted-v1', ''), segments: [
          { kind: 'original', text: 'My original observation before the quote.\n' },
          { kind: 'source-quote', text: quoteText, source: { sourceId: 'synthetic-admitted-source', versionId: 'original-fixture-v1', sha256: 'a'.repeat(64) },
            position: { kind: 'text', unit: 'utf16', start: 3, end: 3 + quoteText.length, bodyLength: 300 },
            deviceSyncBasis: { basisId: 'synthetic-prior-source-admission', policyVersion: 'fixture-only-not-authentication' } },
        ] });
        const operations = [right, quoted, copied, base, decomposed, left, composed];
        const backupJournal = await journal(page, operations);
        const feedback = [1700000000000, 'note', 'op', 'Existing synthetic feedback to the builder'];
        const record = { ...initial.record, taken: [], obslog: [...initial.record.obslog, feedback] };
        await tray(page);
        const before = await readAppRecordSnapshot(page);
        await page.locator('#import-file').setInputFiles({ name: 'novel-source-quote.json', mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(createAppBackupFixture(record, initial.archive.turns, backupJournal))) });
        await page.waitForFunction(() => [...document.querySelectorAll('.airead-note')].some((node) => /Import could not finish/u.test(node.textContent)));
        assert.deepEqual(await readAppRecordSnapshot(page), before, 'Novel source quote refusal must leave the complete target unchanged');
        evidence.observations.push({ name: 'novel-validly-encoded-source-quote-import-refused-atomically', pass: true });
        // Synthetic prior source admission is an explicit fixture premise.
        // Low-level receive validates shape/scope, not publisher permission.
        assert.equal((await receive(page, [quoted], 'synthetic-prior-quote-admission')).status, 'committed');
        await restoreAppFixture(page, record, { journal: backupJournal });
        const state = await admit(page, evidence, 'full-v2-import', operations);
        const shared = state.snapshot.replica.projection.entities.find((row) => row.target.id === 'shared-note');
        assert.equal(shared.heads.length, 3); assert.equal(shared.identityConflicts.length, 1); assert.equal(shared.requiresChoice, true);
        assert.equal(new Set(shared.heads.map((ref) => state.snapshot.replica.operations.find((op) => op.opId === ref.opId).payloadSha256)).size, 2);
        assert.equal(state.raw.record.taken.length, 0); assert.deepEqual(state.raw.record.obslog, record.obslog);
        await tray(page); await requireSurface(page, evidence); await assertRendered(page, state);
        assert.equal(await page.locator('.note-log .note-row').count(), 1);
        assert((await page.locator('.note-log').textContent()).includes(feedback[3]));
        assert(!(await page.locator('.note-log').textContent()).includes('Different concurrent text'));
        await exportCrossCheck(page, state);
        await page.reload(); await ready(page); await tray(page);
        const reopened = await admit(page, evidence, 'reopened', operations);
        await assertRendered(page, reopened);
        assert.deepEqual(reopened.raw.rows, state.raw.rows);
      });

      await test('foreground-receive-preserves-drafts-and-rejects-late-owner-publication', async (page, evidence) => {
        const initial = await readAppRecordSnapshot(page);
        const quiz = { qs: Array.from({ length: 3 }, (_, index) => ({ q: `Original synthetic question ${index + 1}`, opts: ['a', 'b', 'c', 'd'], right: 0, why: 'Original fixture explanation' })), ix: 0, picked: null, correct: 0, ts: 1700000000000 };
        const record = { ...initial.record, taken: [{ t: 'word', id: '猫', label: '猫', ts: 1700000000000 }], aiQuiz: quiz };
        await restoreAppFixture(page, record);
        const key = randomUUID();
        const original = await sourceOperation(page, `${key}:peer`, note('foreground-note', 'initial', 'Previously committed note'));
        assert.equal((await receive(page, [original], 'foreground-initial')).status, 'committed');
        let state = await admit(page, evidence, 'initial-receive', [original]);
        await tray(page); await foreground(page); await requireSurface(page, evidence); await assertRendered(page, state);
        await page.locator('#note-input').fill('Unsent feedback draft e\u0301 remains exactly');
        await page.locator('#list-maker-field').fill('Unsent list draft remains exactly');
        const surface = await rememberSurface(page);
        const beforeView = await rendered(page);
        const next = await sourceOperation(page, `${key}:peer`, { ...note('foreground-note', 'second', 'Fresh received text after acknowledgement'), supersedes: [reference(original)] });
        await armNative(page, 'hold-write');
        const pending = receive(page, [next], 'foreground-held');
        await page.waitForFunction(() => window.__noteNativeFault?.fired === 1);
        await foreground(page);
        assert.deepEqual(await rendered(page), beforeView, 'Pending received bytes cannot appear before native commit');
        await assertSurface(page, surface, evidence);
        await page.evaluate(() => window.__noteNativeFault.release());
        assert.equal((await pending).status, 'committed');
        assert.equal((await faultState(page, true)).complete, true);
        state = await admit(page, evidence, 'received-after-held-commit', [original, next]);
        await foreground(page); await assertRendered(page, state); await assertSurface(page, surface, evidence);
        assert.deepEqual(state.raw.record, withCanonicalDrafts(record), 'Received notes cannot mint feedback, change the quiz, or rewrite learner roots');
        assert.equal((await receive(page, [next], 'foreground-duplicate-bytes')).status, 'committed');
        state = await admit(page, evidence, 'duplicate-operation-delivery', [original, next]);
        await foreground(page); await assertRendered(page, state); await assertSurface(page, surface, evidence);
        for (const mode of ['abort', 'quota']) {
          const rejected = await sourceOperation(page, `${key}:${mode}`, note(`${mode}-note`, 'uncommitted', `${mode} content must never appear`));
          const beforeFailure = await native(page); const priorView = await rendered(page);
          await armNative(page, mode);
          assert.equal((await receive(page, [rejected], `foreground-${mode}`)).status, 'rejected');
          assert.equal((await faultState(page, true)).fired, 1);
          // A native abort may close the fixture connection conservatively.
          // Reopen the same real target before proving every durable row.
          await page.evaluate(async () => { await window.__noteFixturePeer.store.close(); delete window.__noteFixturePeer; });
          const afterFailure = await admit(page, evidence, `${mode}-unchanged`, [original, next]);
          assert.deepEqual(afterFailure.raw.rows, beforeFailure.raw.rows, 'Failed receive keeps journal, checkpoint and learner documents byte-exact');
          await foreground(page); await delay(50);
          assert.deepEqual(await rendered(page), priorView); await assertSurface(page, surface, evidence);
        }
        await page.locator('#aiq-resume').click();
        await page.locator('.aiq-q').waitFor();
        await page.evaluate(() => {
          const question = document.querySelector('.aiq-q');
          const options = document.querySelector('.lesson-options');
          if (!question || !options || options.children.length !== 4) throw new Error('Original quiz controls are missing');
          window.__noteQuizNodes = { question, options, text: question.textContent };
        });
        const inOtherRoom = await sourceOperation(page, `${key}:other-room`, note('other-room-note', 'v1', 'Received while the original quiz remains open'));
        assert.equal((await receive(page, [inOtherRoom], 'foreground-other-room')).status, 'committed');
        await foreground(page); await delay(50);
        assert.equal(await page.evaluate(() => window.__noteQuizNodes.question === document.querySelector('.aiq-q')
          && window.__noteQuizNodes.options === document.querySelector('.lesson-options')
          && window.__noteQuizNodes.text === document.querySelector('.aiq-q').textContent), true);
        assert.deepEqual((await native(page)).raw.record.aiQuiz, quiz);
        await page.locator('#tray').click(); await tray(page);
        state = await admit(page, evidence, 'received-with-quiz-open', [original, next, inOtherRoom]);
        await assertRendered(page, state);
        assert.equal(await page.locator('#note-input').inputValue(), surface.values['note-input']);
        assert.equal(await page.locator('#list-maker-field').inputValue(), surface.values['list-maker-field']);
        // The target read completes first; the controller then reads its
        // separately stored legacy custody. Hold that real later read, allowing
        // another target transaction to commit while the app still owns N.
        const older = await sourceOperation(page, `${key}:coalesced`, note('coalesced-note', 'older', 'This superseded read must never be published'));
        const newer = await sourceOperation(page, `${key}:coalesced`, { ...note('coalesced-note', 'newer', 'The coalesced read sees only the current committed choice'), supersedes: [reference(older)] });
        const beforeCoalescence = [original, next, inOtherRoom];
        const coalescedSurface = await rememberSurface(page);
        const beforeCoalescedView = await rendered(page);
        assert.equal((await receive(page, [older], 'foreground-coalesced-older')).status, 'committed');
        const olderState = await admit(page, evidence, 'coalesced-older-durable', [...beforeCoalescence, older]);
        await observeNotePublications(page);
        await armNative(page, 'hold-legacy-read'); await foreground(page, true);
        await page.waitForFunction(() => window.__noteNativeFault?.fired === 1);
        assert.equal((await faultState(page)).capturedRevision, olderState.raw.revision, 'The app target read must precede the held legacy source verification');
        assert.equal((await receive(page, [newer], 'foreground-coalesced-newer')).status, 'committed');
        const currentOperations = [...beforeCoalescence, older, newer];
        state = await admit(page, evidence, 'coalesced-newer-durable-while-old-read-held', currentOperations);
        assert.equal(state.raw.revision, olderState.raw.revision + 1);
        await foreground(page, true);
        assert.deepEqual(await rendered(page), beforeCoalescedView, 'No candidate from the held read may publish before source verification');
        await page.evaluate(() => window.__noteNativeFault.release());
        await page.waitForFunction(() => window.__noteNativeFault.complete);
        await faultState(page, true);
        await assertRendered(page, state); await assertSurface(page, coalescedSurface, evidence);
        const publications = await notePublications(page);
        assert(!publications.includes(String(olderState.raw.revision)), 'A coalesced request must suppress even interim publication of the obsolete native revision');
        assert(publications.includes(String(state.raw.revision)));
        evidence.observations.push({ name: 'coalesced-receive-skips-obsolete-read-before-publishing', pass: true,
          heldNativeRevision: olderState.raw.revision, receivedNativeRevision: state.raw.revision, observedUiRevisions: publications });
        // Open the real cat entry sheet. The rendered tray remains mounted
        // behind it and inert; revocation must scrub that DOM immediately too.
        await page.locator('.tray-line').filter({ has: page.locator('.w', { hasText: '猫' }) }).first().click();
        await page.locator('#sheet #take').waitFor();
        await page.waitForFunction(() => !document.querySelector('#sheet .dictionary-opening'));
        await page.evaluate(() => {
          const notes = document.getElementById('record-notes');
          const sheet = document.getElementById('sheet');
          const feedback = document.getElementById('note-input');
          const list = document.getElementById('list-maker-field');
          if (!notes?.isConnected || !sheet?.isConnected || !notes.closest('main')?.inert || !feedback || !list)
            throw new Error('Real word sheet must cover a still-mounted inert tray with drafts');
          window.__noteRevokedSurface = { notes, sheet, feedback, list, focus: document.activeElement,
            feedbackValue: feedback.value, listValue: list.value };
        });
        const late = await sourceOperation(page, `${key}:late`, note('late-owner-note', 'v1', 'A late old-owner snapshot must never publish this text'));
        assert.equal((await receive(page, [late], 'foreground-late-owner')).status, 'committed');
        const durableLate = await admit(page, evidence, 'durable-before-owner-revocation', [...currentOperations, late]);
        await armNative(page, 'hold-read'); await foreground(page);
        await page.waitForFunction(() => window.__noteNativeFault?.capturedRevision !== null);
        assert.equal((await faultState(page)).capturedRevision, durableLate.raw.revision);
        const drafts = await page.evaluate(() => sessionStorage.getItem('kairo-record-drafts-v1'));
        await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
        assert.equal(await page.locator('#record-notes article.record-note').count(), 0, 'Revocation immediately scrubs notes mounted behind the word sheet, before the held read resolves');
        await page.evaluate(() => window.__noteNativeFault.release());
        await page.waitForFunction(() => window.__noteNativeFault.complete);
        await faultState(page, true); await delay(50);
        assert.equal(await page.locator('#record-notes article.record-note').count(), 0, 'Revoked owner must invalidate cached notes and reject a late genuine snapshot');
        assert.equal(await page.evaluate(() => {
          const saved = window.__noteRevokedSurface;
          return saved.notes === document.getElementById('record-notes') && saved.sheet === document.getElementById('sheet')
            && saved.feedback === document.getElementById('note-input') && saved.list === document.getElementById('list-maker-field')
            && saved.focus === document.activeElement && saved.feedbackValue === saved.feedback.value && saved.listValue === saved.list.value;
        }), true, 'Revocation must retain the real sheet, surrounding draft nodes, values and focus');
        assert.equal(await page.evaluate(() => sessionStorage.getItem('kairo-record-drafts-v1')), drafts);
        assert.deepEqual((await readAppRecordSnapshot(page)).rows, durableLate.raw.rows);
        evidence.observations.push({ name: 'revocation-scrubs-mounted-tray-under-word-sheet-and-rejects-late-read', pass: true });
      });

      await test('tombstone-stale-backup-and-explicit-restore-remain-truthful', async (page, evidence) => {
        const key = randomUUID();
        const original = await sourceOperation(page, `${key}:mac`, note('deleted-note', 'same-version-label', 'Old head text that deletion must hide'));
        const conflict = await sourceOperation(page, `${key}:phone`, note('deleted-note', 'same-version-label', 'Conflicting old text that must also stay hidden'));
        assert.equal((await receive(page, [conflict, original], 'deletion-initial')).status, 'committed');
        let operations = [original, conflict];
        let state = await admit(page, evidence, 'initial-conflicting-versions', operations);
        const oldRecord = state.raw.record; const oldArchive = state.raw.archive.turns;
        const staleJournal = await journal(page, operations);
        await tray(page); await foreground(page); await requireSurface(page, evidence); await assertRendered(page, state);
        const tombstone = await sourceOperation(page, `${key}:mac`, { kind: 'entity.tombstone', target: { kind: 'note', id: 'deleted-note' }, reason: 'user-deleted' });
        assert.equal((await receive(page, [tombstone], 'deletion-tombstone')).status, 'committed'); operations.push(tombstone);
        state = await admit(page, evidence, 'tombstone', operations); await foreground(page); await assertRendered(page, state);
        for (const text of [original.payload.segments[0].text, conflict.payload.segments[0].text]) assert(!(await page.locator('#record-notes').textContent()).includes(text));
        await restoreAppFixture(page, oldRecord, { archive: oldArchive, journal: staleJournal });
        state = await admit(page, evidence, 'stale-v2-backup', operations); await tray(page); await assertRendered(page, state);
        assert.equal(state.snapshot.replica.projection.entities.find((row) => row.target.id === 'deleted-note').heads.length, 0);
        const restore = await sourceOperation(page, `${key}:restore`, { kind: 'entity.restore', target: { kind: 'note', id: 'deleted-note' }, tombstones: [reference(tombstone)], reason: 'Explicit synthetic learner recovery' });
        assert.equal((await receive(page, [restore], 'deletion-restore-only')).status, 'committed'); operations.push(restore);
        state = await admit(page, evidence, 'restore-only', operations); await foreground(page); await assertRendered(page, state);
        const prerequisite = await sourceOperation(page, `${key}:delayed`, note('prerequisite-note', 'v1', 'Unrelated prerequisite becomes visible when delivered'));
        const restored = await sourceOperation(page, `${key}:delayed`, { ...note('deleted-note', 'restored-ready-version', 'Only explicitly restored ready text is visible'), generation: reference(restore) });
        assert.equal((await receive(page, [restored], 'deletion-pending')).status, 'committed'); operations.push(restored);
        state = await admit(page, evidence, 'pending-prerequisite', operations);
        assert.equal(state.snapshot.replica.pending.length, 1); await foreground(page); await assertRendered(page, state);
        assert(!(await page.locator('#record-notes').textContent()).includes(restored.payload.segments[0].text));
        assert.equal((await receive(page, [prerequisite], 'deletion-release-pending')).status, 'committed'); operations.push(prerequisite);
        state = await admit(page, evidence, 'ready-restored-generation', operations); await foreground(page); await assertRendered(page, state);
        assert.equal(state.snapshot.replica.pending.length, 0);
        const corrupt = await sourceOperation(page, `${key}:quarantine`, { ...note('deleted-note', 'quarantined-version', 'Quarantined bytes must never become note text'), generation: reference(restore), supersedes: [{ ...reference(original), sha256: 'f'.repeat(64) }] });
        const descendant = await sourceOperation(page, `${key}:quarantine`, note('quarantined-descendant', 'v1', 'A descendant of quarantined history must remain invisible'));
        assert.equal((await receive(page, [descendant, corrupt], 'deletion-quarantine')).status, 'committed'); operations.push(corrupt, descendant);
        state = await admit(page, evidence, 'quarantined-history', operations);
        assert.equal(state.snapshot.replica.quarantined.length, 2); await foreground(page); await assertRendered(page, state);
        assert(!(await page.locator('#record-notes').textContent()).includes(corrupt.payload.segments[0].text));
        const later = await sourceOperation(page, `${key}:late-delete`, { kind: 'entity.tombstone', target: { kind: 'note', id: 'deleted-note' }, reason: 'user-deleted' });
        assert.equal((await receive(page, [later], 'deletion-later-tombstone')).status, 'committed'); operations.push(later);
        state = await admit(page, evidence, 'later-delete-defeats-restore', operations); await foreground(page); await assertRendered(page, state);
        const deleted = state.snapshot.replica.projection.entities.find((row) => row.target.id === 'deleted-note');
        assert.equal(deleted.heads.length, 0); assert.equal(deleted.activeRestoreGenerations.length, 0); assert.equal(deleted.identityConflicts.length, 1);
        assert(!(await page.locator('#record-notes').textContent()).includes(restored.payload.segments[0].text));
        await exportCrossCheck(page, state);
      });
    } finally { await browser.close(); }
  }
} finally {
  await new Promise((done) => server.close(done));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify({ suite: 'record-note-views', version: 1,
    mode: FILTER ? 'filtered' : 'full', artifactSha256: manifest.artifactSha256, verifierSha256,
    engines: ENGINES, browserVersions, startedAt, completedAt: new Date().toISOString(), results, errors, externalRequests,
    pass: results.length === ENGINES.length * (FILTER ? 1 : 3) && results.every((row) => row.pass) && !errors.length && !externalRequests.length,
    limitations: ['Synthetic already-admitted learner and prior source-quote scope only; no account authentication or CloudKit call.',
      'Real current native IndexedDB commits plus synthetic public browser lifecycle events; no application function or writer capability is replaced.',
      'Local owner revocation uses the app pagehide handler. This does not claim an authenticated cross-device session implementation.',
      'On a missing-feature baseline, only receipt observations before each recorded failure phase have executed.'] }, null, 2) + '\n');
}
assert(results.length > 0 && results.every((row) => row.pass), 'Record note view journeys failed');
assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
