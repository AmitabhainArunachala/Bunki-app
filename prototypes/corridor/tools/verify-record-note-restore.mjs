/** Saved original-note lifecycle through the actual app and native IndexedDB.
 * Synthetic local scopes/received operations are fixture premises, never identity
 * or quotation admission. Default mode serves a complete pinned artifact unchanged.
 * --diagnostic-overrides=/absolute/file.json admits explicit byte-pinned overrides;
 * diagnostic receipts cannot satisfy the canonical release gate. */
/* global IDBTransaction, PageTransitionEvent */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { verifyBundledArtifact } from '../../bunki-desktop/lib/artifact.cjs';
import { readAppRecordSnapshot } from './record-test-support.mjs';

const SITE = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
const ENGINES = ['chromium', 'webkit'];
const CASES = [
  "explicit-saved-original-restoration-is-one-atomic-visible-pair",
  "user-selects-conflicting-original-and-preserves-all-copy-provenance",
  "review-and-confirmation-cancellation-never-restores-implicitly",
  "quote-only-history-is-never-displayed-or-eligible-for-original-restoration",
  "native-quota-keeps-restoration-atomic-and-draft-safe",
  "native-abort-keeps-restoration-atomic-and-draft-safe",
  "native-lost-ack-keeps-restoration-atomic-and-draft-safe",
  "native-revoke-keeps-restoration-atomic-and-draft-safe",
  "sole-current-empty-generation-restores-chosen-text-without-another-generation",
  "multiple-empty-generations-explicitly-refuse-restoration",
  "new-hidden-history-invalidates-confirmed-preview-without-partial-generation",
  "pending-restore-preserves-active-composition-and-newer-unsent-draft",
  "later-native-tombstone-before-acknowledgement-is-never-labeled-visible-restoration",
  "departed-preview-cannot-restore-or-display-retained-original-text",
  "pending-native-preview-preserves-composition-and-focused-draft"
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json')));
const verifierSha256 = sha(readFileSync(new URL(import.meta.url)));
// Fixed authored operation inputs, independent Node SHA-256 construction. The
// target site's real native store parses and validates every received envelope.
// Sync refs/digests use sorted two-space canonical JSON, not backup compact JSON.
const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value !== null && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])])) : value;
const fixtureDigest = (value) => sha(JSON.stringify(normalize(value), null, 2));
const fixtureOperation = (input) => ({ ...input, opId: fixtureDigest({ scope: input.scope, actor: input.actor }), payloadSha256: fixtureDigest(input.payload) });
const operationReference = (operation) => ({ opId: operation.opId, sha256: fixtureDigest(operation) });
const supplied = process.argv.slice(2);
assert(supplied.every((arg) => arg.startsWith('--diagnostic-overrides=')) && supplied.length <= 1,
  'Run the full two-engine suite; only --diagnostic-overrides=/absolute/file.json is supported');
assert(!process.env.KAIRO_BROWSER || process.env.KAIRO_BROWSER === 'all', 'The note-lifecycle gate requires both engines');
const overrides = new Map();
if (supplied.length) {
  const file = supplied[0].slice('--diagnostic-overrides='.length);
  assert(isAbsolute(file), 'Diagnostic override manifest must be absolute');
  const rows = JSON.parse(readFileSync(file));
  const allowed = ['corridor.js', 'corridor.css', 'record-host.mjs', 'record-app.mjs', 'modules/record-core.mjs'];
  assert(Array.isArray(rows) && rows.length === allowed.length);
  for (const row of rows) {
    assert(allowed.includes(row.path) && !overrides.has(row.path) && isAbsolute(row.source));
    assert.match(row.sha256, /^[a-f0-9]{64}$/u);
    const bytes = readFileSync(row.source); assert.equal(sha(bytes), row.sha256, 'Diagnostic override bytes changed');
    overrides.set(row.path, { file: row.source, bytes, sha256: row.sha256 });
  }
}
const runtimeOverridden = overrides.size > 0;
const results = []; const errors = []; const external = []; const versions = {}; const fatalErrors = []; let sequence = 0;
const startedAt = new Date().toISOString();
const runDirectory = resolve(OUT, 'checks', Date.now() + '-' + process.pid);
const MIME = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = createServer((request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  const file = resolve(SITE, name);
  try {
    if (!file.startsWith(SITE + '/') || !statSync(file).isFile()) throw new Error('not found');
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(overrides.get(name)?.bytes || readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + server.address().port;
const exact = async (page, fn, arg) => JSON.parse(await page.evaluate(async ({ source, input }) => {
  const run = (0, eval)(`(${source})`); return JSON.stringify(await run(JSON.parse(input)));
}, { source: String(fn), input: JSON.stringify(arg ?? null) }));
async function ready(page) { await page.waitForFunction(() => document.body.dataset.ready === '1'); }
async function tray(page) { if (!await page.locator('#record-notes').count()) await page.locator('#tray').click(); await page.locator('#personal-note-input').waitFor(); }
async function native(page) {
  // Existing installed-record probe refuses to create missing databases.
  const installed = await readAppRecordSnapshot(page);
  const snapshot = await exact(page, async (installation) => {
    const core = await import('/modules/record-core.mjs');
    const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
    try { return await store.snapshot(); } finally { await store.close(); }
  }, installed.installation);
  assert.equal(installed.revision, snapshot.revision, 'Native physical rows and replica snapshot agree');
  return { installation: installed.installation, snapshot, rows: installed.rows };
}
function roots(state) { return state.rows.filter((row) => row.kind === 'document' && ['learner-record', 'learner-archive'].includes(JSON.parse(row.text).collection)); }
function added(before, after) { return after.snapshot.replica.operations.filter((row) => !before.snapshot.replica.operations.some((old) => old.opId === row.opId)); }
async function admit(page, evidence, label) {
  const state = await native(page);
  for (const row of state.rows) assert.equal(sha(row.text), row.sha256);
  const file = resolve(evidence.directory, `${label}.json`); writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  evidence.snapshots.push({ label, path: file, sha256: sha(readFileSync(file)), revision: state.snapshot.revision });
  return state;
}
async function created(page, text = '最初の原文 e\u0301 👩🏽‍💻\n  ') {
  await page.locator('#personal-note-input').fill(text); await page.locator('#personal-note-save').click();
  await page.waitForFunction(() => document.querySelector('article.record-note') && !document.querySelector('#personal-note-save').hasAttribute('data-pending'));
  const state = await native(page); const operation = state.snapshot.replica.operations.find((row) => row.payload.kind === 'note.version');
  return { noteId: operation.payload.noteId, operation, state };
}
function note(page, noteId) { return page.locator('article.record-note').filter({ has: page.locator(`.record-note-content`) }).locator(`xpath=self::*[@data-note-id=${JSON.stringify(noteId)}]`); }
async function remote(page, payload, dependencies = [], foreground = true) {
  const before = await native(page); const binding = before.installation.binding;
  const operation = fixtureOperation({ format: 'kairo-sync-operation', v: 1, scope: { accountId: binding.accountId, learnerId: binding.learnerId },
    actor: { deviceId: `synthetic-ui-peer-${++sequence}`, incarnationId: 'synthetic-ui-install', sequence: 1 }, predecessor: null, dependencies,
    schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1', occurredAt: '2026-09-10T02:00:00.000Z', payload });
  const revision = await exact(page, async ({ operation, sequence }) => {
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1')); const core = await import('/modules/record-core.mjs');
    const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
    try { const current = await store.snapshot(); const id = `synthetic-ui-delivery-${sequence}`;
      return (await store.commitReceive({ deliveryId: id, expectedRevision: current.revision, delivery: { binding: policy.binding, operations: [operation] },
        checkpoint: { channelId: 'synthetic-ui-relay', expected: current.checkpoints.find((row) => row.channelId === 'synthetic-ui-relay')?.value ?? null, next: id } })).committedRevision;
    } finally { await store.close(); }
  }, { operation, sequence });
  if (foreground) { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForFunction((revision) => document.querySelector('#record-notes')?.dataset.revision === String(revision), revision); }
  return operation;
}
async function waitNoteAction(article) {
  await article.page().waitForFunction((id) => !document.querySelector(`article[data-note-id="${id}"]`)?.hasAttribute('data-pending'), await article.getAttribute('data-note-id'));
}
async function removeNote(article) {
  await article.locator('[data-note-delete]').click(); await article.locator('[data-note-delete-confirm]').click(); await waitNoteAction(article);
  await article.page().waitForFunction((id) => document.querySelector(`article[data-note-id="${id}"]`)?.dataset.state === 'deleted', await article.getAttribute('data-note-id'));
}
async function prepareRestore(article, index = 0) {
  await article.locator('[data-note-restore-review]').click(); const candidate = article.locator('[data-note-restore-version]').nth(index); await candidate.waitFor();
  await candidate.locator('[data-note-action="restore-choose"]').click(); await article.locator('[data-note-restore-confirm]').waitFor();
}
async function confirmRestore(article, index) {
  await prepareRestore(article, index); await article.locator('[data-note-restore-confirm]').click(); await waitNoteAction(article);
}
async function arm(page, mode, afterOperation = null) {
  await page.evaluate(({ mode, afterOperation }) => {
    const target = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1')).databaseName;
    const transaction = IDBDatabase.prototype.transaction; const put = IDBObjectStore.prototype.put;
    const fault = window.__noteUiFault = { mode, fired: false, durable: false, released: false, active: true };
    const keep = (tx) => { if (fault.released) return; const request = tx.objectStore('kairo_replication_rows').get('synthetic-ui-keepalive'); request.onsuccess = () => keep(tx); };
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (this.name === target && args[1] === 'readwrite' && mode === 'receive-after-commit') {
        const native = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
        Object.defineProperty(tx, 'oncomplete', { configurable: true, get() { return native.get.call(this); }, set(handler) {
          native.set.call(this, (event) => {
            if (!fault.active || !tx.__noteUiCommand) { handler?.call(tx, event); return; }
            fault.fired = true; fault.durable = true; fault.active = false; fault.nativeEventTrusted = event.isTrusted;
            void (async () => {
              const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
              const core = await import('/modules/record-core.mjs');
              const policy = { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
              const store = await core.IndexedDbReplicationStore.open({ databaseName: target, policy, actor: installation.actor });
              try { const current = await store.snapshot();
                const receipt = await store.commitReceive({ deliveryId: 'synthetic-after-native-complete', expectedRevision: current.revision,
                  delivery: { binding: policy.binding, operations: [afterOperation] },
                  checkpoint: { channelId: 'synthetic-after-native-complete', expected: null, next: 'after' } });
                fault.afterReceiveRevision = receipt.committedRevision;
              } finally { await store.close(); }
            })().then(() => handler?.call(tx, event), (error) => { fault.error = error.message; handler?.call(tx, event); });
          });
        } });
      }
      if (this.name === target && args[1] === 'readwrite') tx.addEventListener('complete', (event) => {
        if (!fault.active || !tx.__noteUiCommand) return;
        fault.durable = true;
        if (mode === 'lost-ack') { fault.fired = true; event.stopImmediatePropagation(); }
        if (mode === 'revoke') { fault.fired = true; window.dispatchEvent(new PageTransitionEvent('pagehide')); }
      });
      return tx;
    };
    IDBObjectStore.prototype.put = function (...args) {
      const req = put.apply(this, args);
      if (!fault.active || this.transaction.db.name !== target || this.name !== 'kairo_replication_rows' || args[0]?.kind !== 'document') return req;
      if (JSON.parse(args[0].text).collection !== 'kairo:record-host-commands') return req;
      this.transaction.__noteUiCommand = true;
      if (!fault.fired && mode === 'hold-write') { fault.fired = true; keep(this.transaction); }
      if (!fault.fired && mode === 'quota') { fault.fired = true; throw new DOMException('Synthetic quota after native put', 'QuotaExceededError'); }
      if (!fault.fired && mode === 'abort') { fault.fired = true; req.addEventListener('success', () => this.transaction.abort()); }
      return req;
    };
    fault.release = () => { fault.released = true; };
    fault.disarm = () => { fault.released = true; fault.active = false; IDBDatabase.prototype.transaction = transaction; IDBObjectStore.prototype.put = put; };
  }, { mode, afterOperation });
}
async function holdNotePreviewRead(page) {
  await page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1')).databaseName;
    const transaction = IDBDatabase.prototype.transaction;
    const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
    const probe = window.__notePreviewRead = { armed: true, held: false, released: false };
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (this.name !== target || args[1] === 'readwrite' || !probe.armed) return tx;
      probe.armed = false;
      Object.defineProperty(tx, 'oncomplete', {
        configurable: true, get() { return descriptor.get.call(this); }, set(handler) {
          descriptor.set.call(this, (event) => {
            probe.held = true; probe.nativeEventTrusted = event.isTrusted;
            probe.release = () => {
              if (probe.released) return;
              probe.released = true; IDBDatabase.prototype.transaction = transaction;
              handler?.call(tx, event);
            };
          });
        },
      });
      return tx;
    };
    probe.disarm = () => { IDBDatabase.prototype.transaction = transaction; probe.release?.(); };
  });
}
async function check(browser, engine, name, action, locale = 'bi') {
  const directory = resolve(runDirectory, `${engine}-${name}`); mkdirSync(directory, { recursive: true });
  const evidence = { engine, name, directory, snapshots: [], startedAt: new Date().toISOString() };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', async (route) => { const url = route.request().url(); if (!url.startsWith(origin + '/')) { external.push(url); await route.abort(); } else await route.continue(); });
  const page = await context.newPage(); const events = []; const observe = (kind, detail = {}) => {
    events.push({ at: Date.now(), kind, ...detail });
  };
  await page.exposeFunction('__observeNoteUiLifecycle', (detail) => observe('browser-lifecycle', detail));
  await page.addInitScript(() => {
    for (const event of ['pagehide', 'pageshow', 'beforeunload']) window.addEventListener(event, (value) => {
      const observation = window.__observeNoteUiLifecycle?.({ event, trusted: value.isTrusted, browserAt: Date.now(), url: location.href });
      observation?.catch(() => {});
    });
  });
  page.on('request', (request) => { if (request.url().includes('/data/articles/')) observe('article-request', { url: request.url() }); });
  page.on('response', (response) => { if (response.url().includes('/data/articles/')) observe('article-response', { url: response.url(), status: response.status() }); });
  page.on('requestfinished', (request) => { if (request.url().includes('/data/articles/')) observe('article-finished', { url: request.url() }); });
  page.on('requestfailed', (request) => observe('request-failed', { url: request.url(), failure: request.failure() }));
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) observe('navigation', { url: frame.url() }); });
  page.on('pageerror', (error) => errors.push({ engine, name, at: Date.now(), message: error.message, stack: error.stack, recent: events.slice(-160) }));
  try {
    await page.goto(`${origin}/index.html?entry=shelf&ui=${locale}`); await ready(page); await tray(page);
    await action(page, evidence, context);
    const screenshot = resolve(directory, 'final.png'); await page.screenshot({ path: screenshot, fullPage: true });
    const viewportScreenshot = resolve(directory, 'viewport.png'); await page.screenshot({ path: viewportScreenshot });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Phone-width note controls and text must fit');
    results.push({ ...evidence, pass: true, screenshot, screenshotSha256: sha(readFileSync(screenshot)), viewportScreenshot,
      viewportScreenshotSha256: sha(readFileSync(viewportScreenshot)) }); console.log(`PASS ${engine} ${name}`);
  } catch (error) {
    const screenshot = resolve(directory, 'failure.png'); await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    results.push({ ...evidence, pass: false, error: String(error.stack || error), screenshot }); console.error(`FAIL ${engine} ${name}: ${error.message}`);
  } finally {
    await page.evaluate(() => { window.__noteUiFault?.disarm(); window.__notePreviewRead?.disarm(); }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await context.close();
    const eventPath = resolve(directory, 'lifecycle-events.json');
    writeFileSync(eventPath, JSON.stringify(events, null, 2) + '\n');
    Object.assign(results.find((row) => row.engine === engine && row.name === name) || {}, { lifecycleEvents: eventPath, lifecycleEventsSha256: sha(readFileSync(eventPath)), lifecycleEventCount: events.length });
  }
}

try {
  for (const engine of ENGINES) {
    const browser = await ({ chromium, webkit }[engine]).launch(); versions[engine] = browser.version();
    try {
      await check(browser, engine, 'explicit-saved-original-restoration-is-one-atomic-visible-pair', async (page, evidence) => {
        const text = '原文 e\u0301 👩🏽‍💻\n  '; const made = await created(page, text); const article = note(page, made.noteId);
        await removeNote(article); const before = await admit(page, evidence, 'deleted-before-restore');
        await confirmRestore(article, 0); const after = await admit(page, evidence, 'restored'); const ops = added(before, after);
        assert.equal(ops.length, 2); const restored = ops.find((op) => op.payload.kind === 'entity.restore'); const version = ops.find((op) => op.payload.kind === 'note.version');
        assert.deepEqual(version.payload.segments, [{ kind: 'original', text }]); assert.deepEqual(version.payload.generation, operationReference(restored));
        assert.deepEqual(version.predecessor, operationReference(restored)); assert.deepEqual(version.payload.supersedes, [operationReference(made.operation)]);
        assert.equal(after.snapshot.revision, before.snapshot.revision + 1); assert.equal(after.snapshot.actor.sequence, before.snapshot.actor.sequence + 2);
        assert.equal(after.snapshot.outbox.length, before.snapshot.outbox.length + 2); assert.deepEqual(roots(after), roots(before));
        assert.equal(await article.locator('.record-note-version').count(), 1); assert.equal(await article.locator('[data-note-restore-review]').count(), 0);
        await page.reload(); await ready(page); await tray(page); assert.equal(await note(page, made.noteId).locator('.record-note-content .record-note-segment').textContent(), text); assert.deepEqual((await native(page)).rows, after.rows);
      });
      await check(browser, engine, 'user-selects-conflicting-original-and-preserves-all-copy-provenance', async (page, evidence) => {
        const made = await created(page, '最初の原文'); const payload = { kind: 'note.version', noteId: made.noteId, versionId: 'chosen-history', generation: null, supersedes: [],
          segments: [{ kind: 'original', text: '選んだ版 e\u0301\n' }, { kind: 'original', text: '第二節 👩🏽‍💻  ' }] };
        const chosen = await remote(page, payload); const copy = await remote(page, payload); const article = note(page, made.noteId); await removeNote(article);
        const before = await admit(page, evidence, 'before-explicit-choice'); await article.locator('[data-note-restore-review]').click();
        const candidate = article.locator(`[data-note-restore-version="${chosen.payloadSha256}"]`); await candidate.waitFor(); assert.equal(await article.locator('[data-note-restore-version]').count(), 2);
        assert.deepEqual((await native(page)).rows, before.rows); await candidate.locator('[data-note-action="restore-choose"]').click();
        assert.match(await article.locator('.record-note-confirm').textContent(), /選んだ版/); await article.locator('[data-note-restore-confirm]').click(); await waitNoteAction(article);
        const after = await admit(page, evidence, 'after-explicit-choice'); const version = added(before, after).find((op) => op.payload.kind === 'note.version');
        assert.deepEqual(version.payload.segments, payload.segments); assert.deepEqual(new Set(version.payload.supersedes.map((ref) => ref.opId)), new Set([chosen.opId, copy.opId]));
        const expectedHistory = before.snapshot.replica.ready.filter((ref) => before.snapshot.replica.operations.some((op) => op.opId === ref.opId && (op.payload.kind === 'note.version' && op.payload.noteId === made.noteId || op.payload.kind === 'entity.tombstone' && op.payload.target.id === made.noteId)));
        assert.deepEqual(new Set(version.dependencies.map((ref) => ref.opId)), new Set(expectedHistory.map((ref) => ref.opId))); assert.deepEqual(roots(after), roots(before));
      }, 'ja');
      await check(browser, engine, 'review-and-confirmation-cancellation-never-restores-implicitly', async (page, evidence) => {
        const made = await created(page); const article = note(page, made.noteId); await removeNote(article); const before = await admit(page, evidence, 'before-review');
        await article.locator('[data-note-restore-review]').click(); await article.locator('[data-note-restore-version]').waitFor();
        await article.locator('[data-note-action="restore-cancel"]').click(); assert.deepEqual((await native(page)).rows, before.rows);
        await article.locator('[data-note-restore-review]').click(); await article.locator('[data-note-action="restore-choose"]').click();
        assert.equal(await article.locator('[data-note-restore-confirm]').count(), 1); await article.locator('[data-note-action="restore-cancel"]').click();
        assert.deepEqual((await native(page)).rows, before.rows); assert.equal(await article.getAttribute('data-state'), 'deleted');
      });
      await check(browser, engine, 'quote-only-history-is-never-displayed-or-eligible-for-original-restoration', async (page, evidence) => {
        const noteId = 'synthetic-quote-only'; const quote = await remote(page, { kind: 'note.version', noteId, versionId: 'quoted-only', generation: null, supersedes: [],
          segments: [{ kind: 'source-quote', text: 'NEVER-RESTORE-QUOTE', source: { sourceId: 'synthetic-admitted-source', versionId: 'v1', sha256: 'a'.repeat(64) },
            position: { kind: 'text', unit: 'utf16', start: 0, end: 19, bodyLength: 19 }, deviceSyncBasis: { basisId: 'synthetic-prior-admission', policyVersion: 'fixture-only' } }] });
        await remote(page, { kind: 'entity.tombstone', target: { kind: 'note', id: noteId }, reason: 'user-deleted' }, [operationReference(quote)]);
        const article = note(page, noteId); const before = await admit(page, evidence, 'quote-hidden'); await article.locator('[data-note-restore-review]').click();
        await article.locator('[data-note-action="restore-cancel"]').waitFor(); assert.equal(await article.locator('[data-note-restore-version]').count(), 0);
        assert.equal(await article.locator('[data-note-restore-confirm]').count(), 0); assert(!(await article.textContent()).includes('NEVER-RESTORE-QUOTE')); assert.deepEqual((await native(page)).rows, before.rows);
      });
      for (const mode of ['quota', 'abort', 'lost-ack', 'revoke']) await check(browser, engine, `native-${mode}-keeps-restoration-atomic-and-draft-safe`, async (page, evidence) => {
        const made = await created(page, '復元する保存原文'); const article = note(page, made.noteId); await article.locator('[data-note-edit]').click(); const draft = `未保存の下書き ${mode}`;
        await article.locator('.record-note-edit-input').fill(draft); await removeNote(article); await prepareRestore(article);
        const before = await admit(page, evidence, 'before-fault'); await arm(page, mode); await article.locator('[data-note-restore-confirm]').click(); await page.waitForFunction(() => window.__noteUiFault.fired);
        if (mode === 'quota' || mode === 'abort') await page.waitForFunction(() => document.querySelector('#record-notes')?.dataset.revision === undefined);
        if (mode === 'revoke') await page.waitForFunction(() => document.querySelector('#record-notes .record-note') === null);
        const after = await admit(page, evidence, 'after-fault'); assert.deepEqual(roots(after), roots(before));
        if (mode === 'quota' || mode === 'abort') assert.deepEqual(after.rows, before.rows); else assert.equal(added(before, after).length, 2);
        await page.reload(); await ready(page); await tray(page); const current = note(page, made.noteId); assert.equal(await current.locator('.record-note-edit-input').inputValue(), draft);
        assert.deepEqual((await native(page)).rows, after.rows);
        if (mode === 'quota' || mode === 'abort') { await confirmRestore(current, 0); assert.equal(added(before, await native(page)).length, 2); }
        else { assert.equal(await current.getAttribute('data-state'), 'active'); assert.equal(await current.locator('[data-note-restore-review]').count(), 0); }
      });
      await check(browser, engine, 'sole-current-empty-generation-restores-chosen-text-without-another-generation', async (page, evidence) => {
        const made = await created(page, 'empty generation recovers this saved original'); const article = note(page, made.noteId); await removeNote(article);
        const beforeEmpty = await native(page); const tombstones = beforeEmpty.snapshot.replica.projection.entities.find((entity) => entity.target.id === made.noteId).tombstones;
        const empty = await remote(page, { kind: 'entity.restore', target: { kind: 'note', id: made.noteId }, tombstones, reason: 'synthetic preexisting empty generation' });
        const before = await admit(page, evidence, 'empty-generation'); await confirmRestore(article, 0); const after = await admit(page, evidence, 'saved-text-visible');
        const ops = added(before, after); assert.equal(ops.length, 1); assert.equal(ops[0].payload.kind, 'note.version'); assert.deepEqual(ops[0].payload.generation, operationReference(empty)); assert.deepEqual(roots(after), roots(before));
      });
      await check(browser, engine, 'multiple-empty-generations-explicitly-refuse-restoration', async (page, evidence) => {
        const made = await created(page); const article = note(page, made.noteId); await removeNote(article); const state = await native(page);
        const payload = { kind: 'entity.restore', target: { kind: 'note', id: made.noteId }, tombstones: state.snapshot.replica.projection.entities[0].tombstones, reason: 'synthetic competing empty generation' };
        await remote(page, payload); await remote(page, payload); const before = await admit(page, evidence, 'ambiguous');
        assert.equal(await article.locator('[data-note-restore-review]').count(), 0); assert.equal(await article.locator('[data-note-edit]').count(), 0);
        assert.match(await article.locator('.record-note-content').textContent(), /unavailable|選べない/); assert.deepEqual((await native(page)).rows, before.rows);
      });
      await check(browser, engine, 'new-hidden-history-invalidates-confirmed-preview-without-partial-generation', async (page, evidence) => {
        const made = await created(page); const article = note(page, made.noteId); await removeNote(article); await prepareRestore(article);
        await remote(page, { kind: 'note.version', noteId: made.noteId, versionId: 'arrived-hidden-after-preview', generation: null, supersedes: [], segments: [{ kind: 'original', text: 'new hidden choice' }] });
        const before = await admit(page, evidence, 'new-hidden-history'); await article.locator('[data-note-restore-confirm]').click(); await waitNoteAction(article);
        assert.equal(await article.getAttribute('data-state'), 'deleted'); assert.deepEqual((await native(page)).rows, before.rows);
        assert.match(await article.textContent(), /changed|更新/);
      });
      await check(browser, engine, 'pending-restore-preserves-active-composition-and-newer-unsent-draft', async (page, evidence) => {
        const made = await created(page, '復元する保存本文'); const article = note(page, made.noteId); await article.locator('[data-note-edit]').click(); const input = article.locator('.record-note-edit-input');
        await input.fill('先に書いた未保存の下書き'); await removeNote(article); await prepareRestore(article); const before = await admit(page, evidence, 'before-held-restore');
        await arm(page, 'hold-write'); await article.locator('[data-note-restore-confirm]').click(); await page.waitForFunction(() => window.__noteUiFault.fired);
        await input.focus(); await input.dispatchEvent('compositionstart', { data: '書' }); const draft = '復元の処理中も残す新しい下書き'; await input.fill(draft);
        await input.evaluate((input) => { window.__restoreInput = input; input.setSelectionRange(1, 5); });
        await page.evaluate(() => window.__noteUiFault.release()); await waitNoteAction(article);
        assert.equal(await input.evaluate((input) => input === window.__restoreInput && document.activeElement === input && input.selectionStart === 1 && input.selectionEnd === 5), true);
        assert.equal(await input.inputValue(), draft); assert.equal(await article.locator('[data-note-edit-save]').isDisabled(), true);
        await input.dispatchEvent('compositionend', { data: '書' }); const after = await admit(page, evidence, 'restored-with-newer-draft'); assert.equal(added(before, after).length, 2); assert.deepEqual(roots(after), roots(before));
        await page.reload(); await ready(page); await tray(page); assert.equal(await note(page, made.noteId).locator('.record-note-edit-input').inputValue(), draft); assert.deepEqual((await native(page)).rows, after.rows);
      });
      await check(browser, engine, 'later-native-tombstone-before-acknowledgement-is-never-labeled-visible-restoration', async (page, evidence) => {
        const made = await created(page); const article = note(page, made.noteId); await article.locator('[data-note-edit]').click(); const draft = 'さらに削除が届いても保護する下書き';
        await article.locator('.record-note-edit-input').fill(draft); await removeNote(article); await prepareRestore(article); const before = await admit(page, evidence, 'before-overlap'); const binding = before.installation.binding;
        const deletion = fixtureOperation({ format: 'kairo-sync-operation', v: 1, scope: { accountId: binding.accountId, learnerId: binding.learnerId },
          actor: { deviceId: `restore-overlap-${++sequence}`, incarnationId: 'synthetic-restore-peer', sequence: 1 }, predecessor: null, dependencies: [],
          schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1', occurredAt: '2026-09-10T02:00:00.000Z',
          payload: { kind: 'entity.tombstone', target: { kind: 'note', id: made.noteId }, reason: 'revoked' } });
        await arm(page, 'receive-after-commit', deletion); await article.locator('[data-note-restore-confirm]').click();
        await page.waitForFunction(() => window.__noteUiFault.afterReceiveRevision && !document.querySelector('article.record-note')?.hasAttribute('data-pending'));
        assert.equal(await page.evaluate(() => window.__noteUiFault.nativeEventTrusted), true); assert.equal(await article.getAttribute('data-state'), 'deleted');
        assert.equal(await article.locator('.record-note-version').count(), 0); assert.equal(await article.locator('.record-note-edit-input').inputValue(), draft);
        assert.match(await article.textContent(), /changed again|さらに更新/); const after = await admit(page, evidence, 'newer-deletion-current'); assert.equal(added(before, after).length, 3); assert.deepEqual(roots(after), roots(before));
      });
      await check(browser, engine, 'departed-preview-cannot-restore-or-display-retained-original-text', async (page, evidence) => {
        const text = 'PRIVATE ORIGINAL ONLY FOR THIS PREVIEW'; const made = await created(page, text); const article = note(page, made.noteId);
        await article.locator('[data-note-edit]').click(); const draft = 'Scoped unsent draft survives departure'; await article.locator('.record-note-edit-input').fill(draft);
        await removeNote(article); await prepareRestore(article); assert((await article.locator('.record-note-confirm').textContent()).includes(text));
        await article.locator('[data-note-restore-confirm]').evaluate((button) => { window.__departedRestoreButton = button; });
        const before = await admit(page, evidence, 'before-preview-departure'); await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
        await page.waitForFunction(() => document.querySelector('#record-notes .record-note') === null);
        await page.evaluate(() => window.__departedRestoreButton.click()); assert.deepEqual((await native(page)).rows, before.rows);
        assert(!(await page.locator('body').textContent()).includes(text));
        const drafts = await page.evaluate(() => JSON.parse(sessionStorage.getItem('kairo-record-drafts-v1') || '{}'));
        assert(Object.values(drafts).includes(draft), 'The scoped draft remains while the preview and saved text are scrubbed');
      });
      await check(browser, engine, 'pending-native-preview-preserves-composition-and-focused-draft', async (page, evidence) => {
        const made = await created(page, '保存された原文 · explicit restoration'); const article = note(page, made.noteId);
        await article.locator('[data-note-edit]').click(); const input = article.locator('.record-note-edit-input');
        const draft = 'unfinished draft before composition'; await input.fill(draft); await removeNote(article);
        const before = await admit(page, evidence, 'before-pending-preview');
        const previewWhileEditing = async (composing, value, label) => {
          await holdNotePreviewRead(page); await article.locator('[data-note-restore-review]').click();
          await page.waitForFunction(() => window.__notePreviewRead.held);
          assert.equal(await article.getAttribute('data-pending'), 'true');
          await input.focus();
          if (composing) await input.dispatchEvent('compositionstart', { data: 'あ' });
          await input.evaluate((element) => { window.__notePreviewInput = element; element.setSelectionRange(2, 5); });
          await page.evaluate(() => window.__notePreviewRead.release()); await waitNoteAction(article);
          const observation = await input.evaluate((element) => ({ nativeEventTrusted: window.__notePreviewRead.nativeEventTrusted,
            connected: element.isConnected, sameNode: element === window.__notePreviewInput, focused: document.activeElement === element,
            focusedAction: document.activeElement?.dataset?.noteAction || null, selection: [element.selectionStart, element.selectionEnd],
            value: element.value, chooseDisabled: document.querySelector('[data-note-action="restore-choose"]')?.disabled }));
          const file = resolve(evidence.directory, `${label}.json`); writeFileSync(file, JSON.stringify(observation, null, 2) + '\n');
          (evidence.observations ||= []).push({ label, path: file, sha256: sha(readFileSync(file)) });
          const after = await admit(page, evidence, `${label}-native`); assert.deepEqual(after.rows, before.rows);
          assert.equal(observation.nativeEventTrusted, true, 'Only a genuine native readonly completion is delayed');
          assert.equal(observation.connected, true); assert.equal(observation.sameNode, true); assert.equal(observation.value, value);
          assert.deepEqual(observation.selection, [2, 5]);
          assert.equal(observation.focused, true, 'Completing a restore preview must retain the draft focus acquired during its native read');
          assert.equal(observation.chooseDisabled, composing);
        };
        await previewWhileEditing(true, draft, 'preinput-composition');
        await article.locator('[data-note-action="restore-choose"]').first().evaluate((button) => button.click());
        assert.equal(await article.locator('[data-note-restore-confirm]').count(), 0);
        assert.deepEqual((await native(page)).rows, before.rows);
        await input.dispatchEvent('compositionend', { data: 'あ' });
        const finalDraft = 'compositionend の後の最終入力を保持する';
        await input.evaluate((element, value) => { element.value = value; element.dispatchEvent(new Event('input', { bubbles: true })); }, finalDraft);
        assert.equal(await input.evaluate((element) => element === window.__notePreviewInput && document.activeElement === element), true);
        assert.equal(await input.inputValue(), finalDraft);
        assert(Object.values(await page.evaluate(() => JSON.parse(sessionStorage.getItem('kairo-record-drafts-v1') || '{}'))).includes(finalDraft));
        await article.locator('[data-note-action="restore-cancel"]').click();
        await previewWhileEditing(false, finalDraft, 'focused-draft-without-composition');
        await article.locator('[data-note-action="restore-choose"]').first().click();
        assert.equal(await article.locator('[data-note-action="restore-cancel"]').evaluate((button) => document.activeElement === button), true,
          'An explicit version choice still focuses the safe confirmation control');
        assert.deepEqual((await native(page)).rows, before.rows);
        await article.locator('[data-note-restore-confirm]').click(); await waitNoteAction(article);
        const after = await admit(page, evidence, 'explicit-restore-after-composition');
        assert.equal(added(before, after).length, 2); assert.deepEqual(roots(after), roots(before));
        assert.equal(await article.getAttribute('data-state'), 'active'); assert.equal(await input.inputValue(), finalDraft);
        assert(Object.values(await page.evaluate(() => JSON.parse(sessionStorage.getItem('kairo-record-drafts-v1') || '{}'))).includes(finalDraft));
      });
    } finally { await browser.close(); }
  }
} catch (error) {
  fatalErrors.push(String(error.stack || error));
} finally {
  await new Promise((done) => server.close(done));
  try {
    assert.equal(verifyBundledArtifact(SITE).artifactSha256, manifest.artifactSha256, 'Selected artifact stayed immutable throughout the run');
    for (const row of overrides.values()) assert.equal(sha(readFileSync(row.file)), row.sha256, 'Diagnostic override source stayed unchanged');
    assert.equal(sha(readFileSync(new URL(import.meta.url))), verifierSha256, 'Verifier source stayed unchanged');
  } catch (error) { fatalErrors.push(String(error.stack || error)); }
}
const exactCases = ENGINES.every((engine) => JSON.stringify(results.filter((row) => row.engine === engine).map((row) => row.name)) === JSON.stringify(CASES));
const receipt = {
  suite: 'record-note-restore', version: 1, mode: runtimeOverridden ? 'diagnostic-runtime-overrides' : 'full',
  pass: exactCases && results.length === ENGINES.length * CASES.length && results.every((row) => row.pass) && !errors.length && !external.length && !fatalErrors.length,
  site: SITE, artifactSha256: manifest.artifactSha256, verifierSha256,
  buildIdentitySha256: sha(readFileSync(resolve(SITE, 'build-identity.json'))),
  runtimeOverridden, runtimeOverrides: [...overrides].map(([path, row]) => ({ path, source: row.file, sha256: row.sha256 })),
  engines: ENGINES, browserVersions: versions, casesPerEngine: CASES, startedAt, completedAt: new Date().toISOString(),
  passed: results.filter((row) => row.pass).length, total: results.length, exactCases,
  results, errors, externalRequests: external, fatalErrors,
  limitations: [
    'Synthetic local installation scopes and received envelopes are fixture premises, not authentication or quotation admission.',
    'Actual full-app commands, native IndexedDB/controller/Web Locks and genuine native completion events; native fault timing is deliberately intercepted.',
    'Service workers are blocked for deterministic native transaction schedules. No offline, installed-device or physical IME claim.',
    'Only the explicitly selected ready original history is restored, with exact tombstone/history/generation preconditions. Quoted text is never re-emitted.',
    'An uncertain UI command is reconciled on reload and never automatically reissued.',
    ...(runtimeOverridden ? ['Diagnostic runtime overrides prevent canonical release-gate admission. The artifact digest identifies the unchanged base only.'] : []),
  ],
};
writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(receipt.passed + '/' + receipt.total + ' UI cases passed; ' + errors.length + ' page errors; ' + external.length + ' external requests');
if (!receipt.pass) process.exitCode = 1;
