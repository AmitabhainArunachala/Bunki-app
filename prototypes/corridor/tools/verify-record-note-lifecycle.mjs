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
  'edit-ime-pending-newer-draft-reload',
  'stale-receive-retains-focused-composition-and-rebase',
  'explicit-conflict-choice-keeps-segments-and-all-provenance',
  'concrete-delete-confirmation-cancel-and-draft-retention',
  'native-quota-keeps-edit-draft',
  'native-abort-keeps-edit-draft',
  'native-lost-ack-keeps-edit-draft',
  'native-revoke-keeps-edit-draft',
  'quoted-heads-immutable-and-empty-generation-explicit-fresh-text',
  'durable-edit-with-later-receive-keeps-hidden-draft',
  'empty-generation-concurrent-tombstone-keeps-fresh-draft',
  'draft-scope-cannot-follow-identical-note-id-into-another-installation',
  'stale-delete-confirmation-cannot-delete-newly-received-text',
  'concurrent-empty-restore-generations-do-not-rebind-fresh-draft',
  'pre-input-ime-tombstone-retains-editor-through-final-input',
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
  const allowed = ['corridor.js', 'corridor.css', 'record-host.mjs', 'record-app.mjs'];
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
async function settle(article) { await article.locator('[data-note-edit-save]').waitFor(); await article.page().waitForFunction((id) => !document.querySelector(`article[data-note-id="${id}"]`)?.hasAttribute('data-pending'), await article.getAttribute('data-note-id')); }
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
    await page.evaluate(() => window.__noteUiFault?.disarm()).catch(() => {});
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
      await check(browser, engine, 'edit-ime-pending-newer-draft-reload', async (page, evidence) => {
        const made = await created(page); const article = note(page, made.noteId); await article.locator('[data-note-edit]').click();
        const input = article.locator('.record-note-edit-input'); const text = '書き換え e\u0301 👩🏽‍💻\n  ';
        await input.fill(text); await input.dispatchEvent('compositionstart', { data: '書' });
        assert.equal(await article.locator('[data-note-edit-save]').isDisabled(), true);
        const before = await admit(page, evidence, 'before-edit');
        await article.locator('[data-note-edit-save]').evaluate((button) => button.click()); assert.deepEqual((await native(page)).rows, before.rows);
        await input.dispatchEvent('compositionend', { data: '書' });
        await page.evaluate(() => { window.__noteUiInput = document.querySelector('.record-note-edit-input'); });
        await arm(page, 'hold-write'); await article.locator('[data-note-edit-save]').click(); await page.waitForFunction(() => window.__noteUiFault.fired);
        assert.equal(await article.getAttribute('data-pending'), 'true'); assert.equal(await article.locator('[data-note-edit-save]').isDisabled(), true);
        const nextDraft = 'さらに続く未保存の下書き'; await input.fill(nextDraft); await input.focus();
        await input.evaluate((input) => input.setSelectionRange(2, 7, 'backward'));
        await page.evaluate(() => window.__noteUiFault.release()); await settle(article);
        assert.equal(await input.inputValue(), nextDraft);
        assert.deepEqual(await input.evaluate((input) => ({ same: input === window.__noteUiInput, focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd })),
          { same: true, focused: true, start: 2, end: 7 });
        const after = await admit(page, evidence, 'after-edit'); assert.deepEqual(roots(after), roots(before));
        const operations = added(before, after); assert.equal(operations.length, 1); assert.deepEqual(operations[0].payload.segments, [{ kind: 'original', text }]);
        assert.deepEqual(operations[0].payload.supersedes, [operationReference(made.operation)]);
        await article.locator('[data-note-edit-close]').click(); await article.locator('[data-note-edit]').click(); assert.equal(await input.inputValue(), nextDraft);
        await page.reload(); await ready(page); await tray(page); assert.equal(await note(page, made.noteId).locator('.record-note-edit-input').inputValue(), nextDraft);
        assert.deepEqual((await admit(page, evidence, 'reloaded')).rows, after.rows);
      });
      await check(browser, engine, 'stale-receive-retains-focused-composition-and-rebase', async (page, evidence) => {
        const made = await created(page); const article = note(page, made.noteId); await article.locator('[data-note-edit]').click();
        const input = article.locator('.record-note-edit-input'); const draft = '手元の未保存の下書き'; await input.fill(draft); await input.focus();
        await input.evaluate((input) => { input.setSelectionRange(2, 5); window.__noteUiInput = input; window.__noteUiRect = input.getBoundingClientRect().top; });
        await input.dispatchEvent('compositionstart', { data: '手' });
        const received = await remote(page, { kind: 'note.version', noteId: made.noteId, versionId: 'synthetic-new-head', generation: null,
          supersedes: [operationReference(made.operation)], segments: [{ kind: 'original', text: '届いた本文\n'.repeat(8) }] });
        assert.equal(await input.inputValue(), draft); assert.equal(await article.locator('[data-note-edit-save]').isDisabled(), true);
        assert.equal(await article.locator('[data-note-edit-rebase]').isDisabled(), true);
        assert.equal(await input.evaluate((input) => input === window.__noteUiInput && document.activeElement === input && input.selectionStart === 2 && input.selectionEnd === 5), true);
        assert(Math.abs(await input.evaluate((input) => input.getBoundingClientRect().top - window.__noteUiRect)) < 1);
        await input.dispatchEvent('compositionend', { data: '手' }); await article.locator('[data-note-edit-rebase]').click();
        assert.equal(await input.inputValue(), draft); const before = await admit(page, evidence, 'before-rebased-save');
        await article.locator('[data-note-edit-save]').click(); await settle(article); const after = await admit(page, evidence, 'after-rebased-save');
        assert.deepEqual(roots(after), roots(before)); assert.deepEqual(added(before, after)[0].payload.supersedes, [operationReference(received)]);
      });
      await check(browser, engine, 'explicit-conflict-choice-keeps-segments-and-all-provenance', async (page, evidence) => {
        const made = await created(page); const payload = { kind: 'note.version', noteId: made.noteId, versionId: 'synthetic-choice', generation: null, supersedes: [],
          segments: [{ kind: 'original', text: '選ぶ本文 e\u0301\n' }, { kind: 'original', text: '  二段目 👩🏽‍💻' }] };
        const selected = await remote(page, payload); await remote(page, payload);
        const article = note(page, made.noteId); assert.equal(await article.locator('[data-note-edit]').count(), 0); assert.equal(await article.locator('[data-note-choose]').count(), 2);
        const before = await admit(page, evidence, 'before-choice'); const expected = before.snapshot.replica.projection.entities.find((row) => row.target.id === made.noteId).heads;
        assert.equal(expected.length, 3); await article.locator(`[data-note-choose="${selected.payloadSha256}"]`).click();
        await page.waitForFunction((id) => document.querySelector(`article[data-note-id="${id}"]`)?.dataset.requiresChoice === 'false', made.noteId);
        const after = await admit(page, evidence, 'after-choice'); assert.deepEqual(roots(after), roots(before)); const op = added(before, after)[0];
        assert.deepEqual(op.payload.segments, payload.segments); assert.deepEqual(op.payload.supersedes, expected);
        assert.equal(await article.locator('.record-note-version').count(), 1);
      });
      await check(browser, engine, 'concrete-delete-confirmation-cancel-and-draft-retention', async (page, evidence) => {
        const made = await created(page, '削除する保存本文'); const article = note(page, made.noteId); await article.locator('[data-note-edit]').click();
        const draft = '削除しても残す自分の下書き'; await article.locator('.record-note-edit-input').fill(draft);
        const before = await admit(page, evidence, 'before-delete'); await article.locator('[data-note-delete]').click();
        assert.match(await article.locator('.record-note-confirm').textContent(), /削除する保存本文/); assert.deepEqual((await native(page)).rows, before.rows);
        await article.locator('[data-note-action="cancel-delete"]').click(); assert.equal(await article.locator('[data-note-delete-confirm]').count(), 0);
        await article.locator('[data-note-delete]').click(); await article.locator('[data-note-delete-confirm]').click();
        await page.waitForFunction((id) => document.querySelector(`article[data-note-id="${id}"]`)?.dataset.state === 'deleted', made.noteId);
        const after = await admit(page, evidence, 'after-delete'); assert.deepEqual(roots(after), roots(before)); assert.equal(added(before, after)[0].payload.kind, 'entity.tombstone');
        assert.equal(await article.locator('.record-note-version').count(), 0); assert.equal(await article.locator('.record-note-edit-input').inputValue(), draft);
        assert.equal(await article.locator('[data-note-edit-save]').isDisabled(), true); await page.reload(); await ready(page); await tray(page);
        assert.equal(await note(page, made.noteId).locator('.record-note-edit-input').inputValue(), draft); assert.deepEqual((await native(page)).rows, after.rows);
      });
      for (const mode of ['quota', 'abort', 'lost-ack', 'revoke']) await check(browser, engine, `native-${mode}-keeps-edit-draft`, async (page, evidence) => {
        const made = await created(page); const article = note(page, made.noteId); await article.locator('[data-note-edit]').click(); const text = `残す下書き ${mode}`;
        await article.locator('.record-note-edit-input').fill(text); const before = await admit(page, evidence, 'before-fault'); await arm(page, mode);
        await article.locator('[data-note-edit-save]').click(); await page.waitForFunction(() => window.__noteUiFault.fired);
        if (mode === 'quota' || mode === 'abort') await page.waitForFunction(() => document.querySelector('#record-notes')?.dataset.revision === undefined);
        if (mode === 'revoke') await page.waitForFunction(() => document.querySelector('#record-notes .record-note') === null);
        const after = await admit(page, evidence, 'after-fault'); assert.deepEqual(roots(after), roots(before));
        if (mode === 'quota' || mode === 'abort') assert.deepEqual(after.rows, before.rows);
        else { assert.equal(added(before, after).length, 1); assert.deepEqual(added(before, after)[0].payload.segments, [{ kind: 'original', text }]); }
        await page.reload(); await ready(page); await tray(page); const next = note(page, made.noteId);
        assert.equal(await next.locator('.record-note-edit-input').inputValue(), text); assert.deepEqual((await native(page)).rows, after.rows);
        if (mode === 'quota' || mode === 'abort') { await next.locator('[data-note-edit-save]').click(); await settle(next); assert.equal(added(before, await native(page)).length, 1); }
        else { assert.equal(await next.locator('[data-note-edit-save]').isDisabled(), true); await next.locator('[data-note-edit-rebase]').click();
          assert.equal(await next.locator('[data-note-edit-save]').isDisabled(), true); assert.deepEqual((await native(page)).rows, after.rows); }
      });
      await check(browser, engine, 'quoted-heads-immutable-and-empty-generation-explicit-fresh-text', async (page, evidence) => {
        const made = await created(page); const quote = await remote(page, { kind: 'note.version', noteId: made.noteId, versionId: 'synthetic-quote', generation: null,
          supersedes: [operationReference(made.operation)], segments: [{ kind: 'source-quote', text: '保存された引用',
            source: { sourceId: 'synthetic-admitted-source', versionId: 'v1', sha256: 'a'.repeat(64) },
            position: { kind: 'text', unit: 'utf16', start: 0, end: 7, bodyLength: 7 }, deviceSyncBasis: { basisId: 'synthetic-prior-admission', policyVersion: 'fixture-only' } }] });
        const article = note(page, made.noteId); assert.equal(await article.locator('[data-note-edit]').count(), 0); assert.equal(await article.locator('[data-note-choose]').count(), 0);
        const deletion = await remote(page, { kind: 'entity.tombstone', target: { kind: 'note', id: made.noteId }, reason: 'user-deleted' }, [operationReference(quote)]);
        const restored = await remote(page, { kind: 'entity.restore', target: { kind: 'note', id: made.noteId }, tombstones: [operationReference(deletion)], reason: 'synthetic explicit empty-generation fixture' });
        assert.equal(await article.getAttribute('data-state'), 'restored-empty'); assert.equal(await article.locator('.record-note-version').count(), 0);
        assert.match(await article.locator('.record-note-state').textContent(), /unfinished|未完了|完了していない/);
        await article.locator('[data-note-edit]').click(); assert.equal(await article.locator('.record-note-edit-input').inputValue(), '');
        await article.locator('.record-note-edit-input').fill('明示した新しい原文'); const before = await admit(page, evidence, 'before-fresh-text');
        await article.locator('[data-note-edit-save]').click(); await settle(article); const after = await admit(page, evidence, 'after-fresh-text');
        const op = added(before, after)[0]; assert.deepEqual(op.payload.generation, operationReference(restored)); assert.deepEqual(op.payload.segments, [{ kind: 'original', text: '明示した新しい原文' }]);
        assert.deepEqual(roots(after), roots(before));
      }, 'ja');
      await check(browser, engine, 'durable-edit-with-later-receive-keeps-hidden-draft', async (page, evidence) => {
        const made = await created(page); const article = note(page, made.noteId); await article.locator('[data-note-edit]').click();
        const text = '保存の返答より先に削除が届いても残す下書き'; await article.locator('.record-note-edit-input').fill(text);
        const before = await admit(page, evidence, 'before-overlapping-receive'); const binding = before.installation.binding;
        const deletion = fixtureOperation({ format: 'kairo-sync-operation', v: 1, scope: { accountId: binding.accountId, learnerId: binding.learnerId },
          actor: { deviceId: `synthetic-ack-peer-${++sequence}`, incarnationId: 'synthetic-ack-install', sequence: 1 }, predecessor: null, dependencies: [],
          schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1', occurredAt: '2026-09-10T02:00:00.000Z',
          payload: { kind: 'entity.tombstone', target: { kind: 'note', id: made.noteId }, reason: 'revoked' } });
        await arm(page, 'receive-after-commit', deletion); await article.locator('[data-note-edit-save]').click();
        await page.waitForFunction(() => window.__noteUiFault.afterReceiveRevision && !document.querySelector('article.record-note')?.hasAttribute('data-pending'));
        const fault = await page.evaluate(() => ({ trusted: window.__noteUiFault.nativeEventTrusted, error: window.__noteUiFault.error, revision: window.__noteUiFault.afterReceiveRevision }));
        assert.equal(fault.trusted, true); assert.equal(fault.error, undefined); assert.equal(await article.getAttribute('data-state'), 'deleted');
        assert.equal(await article.locator('.record-note-version').count(), 0); assert.equal(await article.locator('.record-note-edit-input').inputValue(), text);
        assert.equal(await article.locator('[data-note-edit-save]').isDisabled(), true);
        const after = await admit(page, evidence, 'after-overlapping-receive'); assert.equal(after.snapshot.revision, fault.revision); assert.deepEqual(roots(after), roots(before));
        assert.equal(added(before, after).length, 2); assert.equal(after.snapshot.actor.sequence, before.snapshot.actor.sequence + 1);
        await page.reload(); await ready(page); await tray(page); assert.equal(await note(page, made.noteId).locator('.record-note-edit-input').inputValue(), text);
        assert.deepEqual((await native(page)).rows, after.rows);
      });
      await check(browser, engine, 'empty-generation-concurrent-tombstone-keeps-fresh-draft', async (page, evidence) => {
        const made = await created(page); const deletion = await remote(page, { kind: 'entity.tombstone', target: { kind: 'note', id: made.noteId }, reason: 'user-deleted' });
        await remote(page, { kind: 'entity.restore', target: { kind: 'note', id: made.noteId }, tombstones: [operationReference(deletion)], reason: 'synthetic empty-generation fixture' });
        const article = note(page, made.noteId); await article.locator('[data-note-edit]').click(); const draft = 'まだ保存していない新しい原文';
        await article.locator('.record-note-edit-input').fill(draft);
        await remote(page, { kind: 'entity.tombstone', target: { kind: 'note', id: made.noteId }, reason: 'revoked' });
        assert.equal(await article.getAttribute('data-state'), 'deleted'); assert.equal(await article.locator('.record-note-edit-input').inputValue(), draft);
        assert.equal(await article.locator('[data-note-edit-save]').isDisabled(), true); assert.equal(await article.locator('[data-note-edit-rebase]').isVisible(), false);
        const before = await admit(page, evidence, 'deleted-again-with-draft'); await article.locator('[data-note-edit-save]').evaluate((button) => button.click());
        assert.deepEqual((await native(page)).rows, before.rows); await page.reload(); await ready(page); await tray(page);
        assert.equal(await note(page, made.noteId).locator('.record-note-edit-input').inputValue(), draft); assert.deepEqual((await native(page)).rows, before.rows);
      });
      await check(browser, engine, 'draft-scope-cannot-follow-identical-note-id-into-another-installation', async (page, evidence) => {
        const made = await created(page); const article = note(page, made.noteId); await article.locator('[data-note-edit]').click(); const draft = '別の学習者へ移してはいけない下書き';
        await article.locator('.record-note-edit-input').fill(draft); const saved = await page.evaluate(() => sessionStorage.getItem('kairo-record-drafts-v1'));
        const before = await admit(page, evidence, 'original-account');
        // A separate real local installation receives the same opaque note ID.
        // Transplant only the untrusted session draft file to challenge scoping.
        const otherContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        await otherContext.route('**/*', async (route) => { if (!route.request().url().startsWith(origin + '/')) { external.push(route.request().url()); await route.abort(); } else await route.continue(); });
        const other = await otherContext.newPage(); other.on('pageerror', (error) => errors.push({ engine, name: 'draft-scope-other', message: error.message }));
        try {
          await other.addInitScript((saved) => sessionStorage.setItem('kairo-record-drafts-v1', saved), saved);
          await other.goto(`${origin}/index.html?entry=shelf&ui=bi`); await ready(other); await tray(other);
          const fresh = await native(other); assert.notEqual(fresh.installation.binding.accountId, before.installation.binding.accountId);
          await remote(other, { kind: 'note.version', noteId: made.noteId, versionId: 'synthetic-other-account-version', generation: null, supersedes: [],
            segments: [{ kind: 'original', text: 'この学習者の本文' }] });
          const otherArticle = note(other, made.noteId); assert.equal(await otherArticle.locator('.record-note-edit-input').count(), 0);
          await otherArticle.locator('[data-note-edit]').click(); assert.equal(await otherArticle.locator('.record-note-edit-input').inputValue(), 'この学習者の本文');
          assert(!(await otherArticle.textContent()).includes(draft)); assert.equal(await page.locator('.record-note-edit-input').inputValue(), draft);
        } finally { await other.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await otherContext.close(); }
        assert.deepEqual((await native(page)).rows, before.rows);
      });
      await check(browser, engine, 'stale-delete-confirmation-cannot-delete-newly-received-text', async (page, evidence) => {
        const made = await created(page); const article = note(page, made.noteId); await article.locator('[data-note-delete]').click();
        await article.locator('[data-note-delete-confirm]').evaluate((button) => { window.__staleNoteDelete = button; });
        await remote(page, { kind: 'note.version', noteId: made.noteId, versionId: 'synthetic-updated-before-delete', generation: null,
          supersedes: [operationReference(made.operation)], segments: [{ kind: 'original', text: '確認後に届いた新しい本文' }] });
        assert.equal(await article.locator('[data-note-delete-confirm]').count(), 0); const before = await admit(page, evidence, 'updated-before-confirmation');
        await page.evaluate(() => window.__staleNoteDelete.click()); assert.deepEqual((await native(page)).rows, before.rows);
        assert.equal(await article.getAttribute('data-state'), 'active');
      });
      await check(browser, engine, 'concurrent-empty-restore-generations-do-not-rebind-fresh-draft', async (page, evidence) => {
        const made = await created(page); const deletion = await remote(page, { kind: 'entity.tombstone', target: { kind: 'note', id: made.noteId }, reason: 'user-deleted' });
        const payload = { kind: 'entity.restore', target: { kind: 'note', id: made.noteId }, tombstones: [operationReference(deletion)], reason: 'synthetic concurrent restore fixture' };
        await remote(page, payload); const article = note(page, made.noteId); await article.locator('[data-note-edit]').click();
        const draft = '一つの復元先で書き始めた下書き'; await article.locator('.record-note-edit-input').fill(draft); await remote(page, payload);
        assert.equal(await article.locator('[data-note-edit]').count(), 0); assert.equal(await article.locator('[data-note-edit-save]').isDisabled(), true);
        assert.equal(await article.locator('[data-note-edit-rebase]').isVisible(), false); assert.equal(await article.locator('.record-note-edit-input').inputValue(), draft);
        const state = await admit(page, evidence, 'concurrent-empty-generations'); assert.equal(state.snapshot.replica.projection.entities[0].activeRestoreGenerations.length, 2);
        await page.reload(); await ready(page); await tray(page); const restored = note(page, made.noteId);
        assert.equal(await restored.locator('.record-note-edit-input').inputValue(), draft); assert.equal(await restored.locator('[data-note-edit-save]').isDisabled(), true);
        assert.deepEqual((await native(page)).rows, state.rows);
      });
      await check(browser, engine, 'pre-input-ime-tombstone-retains-editor-through-final-input', async (page, evidence) => {
        const baseline = '削除前の保存本文 — composition has not produced input';
        const made = await created(page, baseline); const article = note(page, made.noteId);
        await article.locator('[data-note-edit]').click(); const input = article.locator('.record-note-edit-input');
        assert.equal(await input.inputValue(), baseline); await input.focus();
        await input.evaluate((input) => { window.__preInputNote = input; input.setSelectionRange(1, 4, 'backward'); });
        await input.dispatchEvent('compositionstart', { data: '編' });
        assert.equal(await input.inputValue(), baseline, 'Composition starts before its first input event');
        const before = await admit(page, evidence, 'before-pre-input-deletion');
        const deleted = await remote(page, { kind: 'entity.tombstone', target: { kind: 'note', id: made.noteId }, reason: 'user-deleted' }, [operationReference(made.operation)]);
        assert.deepEqual(await page.evaluate(() => ({ connected: window.__preInputNote.isConnected,
          focused: document.activeElement === window.__preInputNote, count: document.querySelectorAll('.record-note-edit-input').length,
          start: window.__preInputNote.selectionStart, end: window.__preInputNote.selectionEnd })),
          { connected: true, focused: true, count: 1, start: 1, end: 4 }, 'A received tombstone must not detach a composition before its first input');
        assert.equal(await article.locator('.record-note-version').count(), 0);
        assert.equal(await article.locator('[data-note-edit-save]').isDisabled(), true);
        // Some browser input sequences deliver final input after compositionend.
        // The original composing textarea must still receive that final text.
        await input.dispatchEvent('compositionend', { data: '編集中の新しい下書き' });
        assert.equal(await input.evaluate((input) => input === window.__preInputNote && input.isConnected && document.activeElement === input), true);
        const draft = '削除の受信後に確定した未保存の下書き'; await input.fill(draft);
        assert.equal(await input.inputValue(), draft); assert.equal(await article.locator('[data-note-edit-save]').isDisabled(), true);
        assert(!(await article.locator('.record-note-content').textContent()).includes(baseline));
        const after = await admit(page, evidence, 'after-pre-input-deletion'); assert.deepEqual(roots(after), roots(before));
        assert.deepEqual(added(before, after), [deleted]); assert.equal(after.snapshot.actor.sequence, before.snapshot.actor.sequence);
        await page.reload(); await ready(page); await tray(page);
        assert.equal(await note(page, made.noteId).locator('.record-note-edit-input').inputValue(), draft);
        assert.equal(await note(page, made.noteId).locator('[data-note-edit-save]').isDisabled(), true);
        assert.deepEqual((await native(page)).rows, after.rows);
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
  suite: 'record-note-lifecycle', version: 1, mode: runtimeOverridden ? 'diagnostic-runtime-overrides' : 'full',
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
    'Deleted saved text is not restored. A sole active empty generation permits explicit fresh original text only.',
    'An uncertain UI command is reconciled on reload and never automatically reissued.',
    ...(runtimeOverridden ? ['Diagnostic runtime overrides prevent canonical release-gate admission. The artifact digest identifies the unchanged base only.'] : []),
  ],
};
writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(receipt.passed + '/' + receipt.total + ' UI cases passed; ' + errors.length + ' page errors; ' + external.length + ' external requests');
if (!receipt.pass) process.exitCode = 1;
