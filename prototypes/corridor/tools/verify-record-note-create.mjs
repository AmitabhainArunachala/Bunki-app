/** First original-note commands through the actual rendered app and native
 * RecordController. Synthetic admitted scopes and real origin Web Locks are
 * fixture premises; these tests make no account-authentication claim. */
/* global process, URL, document, window, localStorage, indexedDB, crypto, navigator, IDBDatabase, IDBObjectStore, PageTransitionEvent, CompositionEvent, console */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot, armRecordWriteFailure, clearRecordWriteFailure } from './record-test-support.mjs';

const SITE = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
const ENGINES = (process.env.KAIRO_BROWSER || 'all') === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER];
assert(ENGINES.every((engine) => ['chromium', 'webkit'].includes(engine)));
const FILTER = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
const verifierSha256 = sha(readFileSync(new URL(import.meta.url)));
const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value !== null && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])])) : value;
const digest = (value) => sha(JSON.stringify(normalize(value)));
const ref = (operation) => ({ opId: operation.opId, sha256: sha(JSON.stringify(normalize(operation), null, 2)) });
const time = '2026-09-10T07:00:00.000Z';
const policy = { binding: { accountId: 'synthetic-original-note-account', learnerId: 'synthetic-original-note-learner', sessionId: 'synthetic-original-note-session' },
  schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
const actor = { deviceId: 'synthetic-original-note-device', incarnationId: 'synthetic-original-note-installation' };
const target = 'synthetic-original-note-target';
const fixtureRecord = JSON.parse('{"v":1,"taken":[],"srs":{},"revlog":[],"obslog":[],"__proto__":{"preserve":"own-key"},"unknownRoot":{"preserve":"unrelated learner bytes"}}');
const results = [];
const errors = [];
const externalRequests = [];
const browserVersions = {};
const startedAt = new Date().toISOString();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2' };
const fixtureHtml = `<!doctype html><meta charset="utf-8"><title>Synthetic native note-command fixture</title>
<script type="module">
import * as controller from '/record-controller.mjs';
import * as core from '/modules/record-core.mjs';
import * as host from '/record-host.mjs';
import * as app from '/record-app.mjs';
window.fixture = { controller, core, host, app };
</script>`;
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/note-command-fixture') {
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end(fixtureHtml); return;
  }
  const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
  try {
    if (!file.startsWith(`${SITE}/`) || !statSync(file).isFile()) throw new Error('missing');
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

/** Authored fixture source only. Exact JSON text preserves own __proto__ keys
 * and lone-surrogate invalid-input fixtures across the automation boundary. */
async function exact(page, action, value) {
  return JSON.parse(await page.evaluate(async ({ source, input }) => {
    const run = (0, eval)(`(${source})`);
    return JSON.stringify({ value: await run(JSON.parse(input).value) });
  }, { source: String(action), input: JSON.stringify({ value }) })).value;
}
async function ready(page) { await page.waitForFunction(() => document.body.dataset.ready === '1'); }
async function tray(page) {
  if (!await page.locator('#import-file').count()) await page.locator('#tray').click();
  await page.locator('#note-input').waitFor();
}
async function native(page) {
  return exact(page, async () => {
    const f = window.fixture;
    const installation = f ? { databaseName: f.databaseName, binding: f.policy.binding, actor: f.actor }
      : JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const policy = f?.policy || { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const core = f?.core || await import('/modules/record-core.mjs');
    const db = await new Promise((done, fail) => {
      const request = indexedDB.open(installation.databaseName);
      request.onupgradeneeded = () => { request.transaction.abort(); fail(new Error('Native fixture database must already exist')); };
      request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error);
    });
    let rows;
    try { rows = await new Promise((done, fail) => {
      const tx = db.transaction('kairo_replication_rows', 'readonly');
      const request = tx.objectStore('kairo_replication_rows').getAll();
      tx.oncomplete = () => done(request.result); tx.onabort = () => fail(tx.error);
    }); } finally { db.close(); }
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, policy, actor: installation.actor });
    try {
      const snapshot = await store.snapshot();
      const select = (collection) => snapshot.documents.find((row) => row.collection === collection && row.id === 'current')?.value;
      return { installation, rows, snapshot, record: select('learner-record'), archive: select('learner-archive') };
    } finally { await store.close(); }
  });
}
async function admit(page, evidence, stage) {
  const state = await native(page);
  const profile = state.rows.find((row) => row.kind === 'profile');
  assert.equal(JSON.parse(profile.text).revision, state.snapshot.revision);
  for (const row of state.rows) assert.equal(sha(row.text), row.sha256);
  assert(state.record && state.archive, 'Actual native learner roots must exist before feature assertions');
  if (!await page.evaluate(() => !!window.fixture)) {
    const app = await readAppRecordSnapshot(page);
    assert.equal(app.revision, state.snapshot.revision); assert.deepEqual(app.rows, state.rows);
  }
  const file = resolve(evidence.directory, `${evidence.name}--${stage}.json`);
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  evidence.admissions.push({ stage, file, sha256: sha(readFileSync(file)), revision: state.snapshot.revision,
    actorSequence: state.snapshot.actor.sequence, operations: state.snapshot.replica.operations.length,
    outbox: state.snapshot.outbox.length, rowBytesSha256: digest(state.rows) });
  evidence.phase = `native-admitted:${stage}`;
  return state;
}
function rootsUnchanged(before, after) {
  const roots = (state) => state.rows.filter((row) => row.kind === 'document').filter((row) =>
    ['learner-record', 'learner-archive'].includes(JSON.parse(row.text).collection));
  assert.deepEqual(roots(after), roots(before), 'A note command cannot alter root bytes, SRS, grades, observations or archive');
  assert.deepEqual(after.installation, before.installation, 'A command cannot replace installation or scope');
}
function assertCreated(before, after, texts) {
  rootsUnchanged(before, after);
  assert.equal(after.snapshot.actor.sequence, before.snapshot.actor.sequence + texts.length);
  assert.equal(after.snapshot.replica.operations.length, before.snapshot.replica.operations.length + texts.length);
  assert.equal(after.snapshot.outbox.length, before.snapshot.outbox.length + texts.length);
  const added = after.snapshot.replica.operations.filter((row) => !before.snapshot.replica.operations.some((old) => old.opId === row.opId))
    .sort((a, b) => a.actor.sequence - b.actor.sequence);
  let previous = before.snapshot.actor.predecessor;
  for (let index = 0; index < added.length; index++) {
    const operation = added[index];
    assert.deepEqual(operation.scope, { accountId: before.installation.binding.accountId, learnerId: before.installation.binding.learnerId });
    assert.equal(operation.actor.deviceId, before.snapshot.actor.deviceId);
    assert.equal(operation.actor.incarnationId, before.snapshot.actor.incarnationId);
    assert.deepEqual(operation.predecessor, previous); previous = ref(operation);
    assert.deepEqual(operation.dependencies, []);
    assert.equal(operation.payload.kind, 'note.version');
    assert.equal(operation.payload.generation, null); assert.deepEqual(operation.payload.supersedes, []);
    assert.deepEqual(operation.payload.segments, [{ kind: 'original', text: texts[index] }]);
    assert.match(operation.payload.noteId, /^personal-note:[a-f0-9]{64}$/u);
    assert.match(operation.payload.versionId, /^personal-note-version:[a-f0-9]{64}$/u);
    assert(after.snapshot.replica.ready.some((candidate) => candidate.opId === operation.opId && candidate.sha256 === ref(operation).sha256));
    assert.deepEqual(after.snapshot.outbox.find((candidate) => candidate.opId === operation.opId), operation);
  }
  assert.deepEqual(after.snapshot.actor.predecessor, previous);
  assert.equal(new Set(added.map((row) => row.payload.noteId)).size, added.length, 'Equal text in distinct commands is still distinct learner notes');
  const commands = (state) => state.snapshot.documents.filter((row) => row.collection === 'kairo:record-host-commands');
  assert.equal(commands(after).length, commands(before).length + texts.length);
  return added;
}
async function requireComposer(page, evidence) {
  assert.equal(await page.locator('#personal-note-input').count(), 1, 'Personal-note composer absent after native installation admission');
  assert.equal(await page.locator('#personal-note-save').count(), 1);
  assert.equal(await page.locator('#personal-note-input').getAttribute('maxlength'), '64000');
  assert.equal(await page.locator('#note-input').count(), 1, 'Existing builder feedback remains separate');
  evidence.phase = 'personal-note-composer-admitted';
}
async function requireCommand(page, evidence) {
  assert.equal(await page.evaluate(() => typeof window.fixture.subject.createNote), 'function', 'Named createNote API absent after real controller migration admission');
  evidence.phase = 'named-note-command-admitted';
}
async function assertUiNotes(page, state) {
  await page.waitForFunction((revision) => document.querySelector('#record-notes')?.dataset.revision === String(revision), state.snapshot.revision);
  const rows = await exact(page, () => [...document.querySelectorAll('article.record-note')].map((row) => ({
    id: row.dataset.noteId, segments: [...row.querySelectorAll('.record-note-segment')].map((node) => ({ kind: node.dataset.segmentKind, text: node.textContent, childElements: node.childElementCount })),
  })));
  assert.equal(rows.length, state.snapshot.replica.operations.length);
  for (const operation of state.snapshot.replica.operations) {
    assert.deepEqual(rows.find((row) => row.id === operation.payload.noteId)?.segments,
      operation.payload.segments.map((segment) => ({ ...segment, childElements: 0 })));
  }
  assert.equal(await page.evaluate(() => window.__originalNoteHtml), undefined);
}
function composerSettled() {
  const save = document.querySelector('#personal-note-save');
  return Boolean(save && !save.hasAttribute('data-pending'));
}
async function saveUi(page, text) {
  await page.locator('#personal-note-input').fill(text);
  await page.locator('#personal-note-save').click();
  await page.waitForFunction(composerSettled);
}
function assertExportMetadata(before, after) {
  assert.deepEqual(after.installation, before.installation);
  const timestamp = after.record.stats?.lastExportTs;
  assert(Number.isSafeInteger(timestamp) && timestamp > (before.record.stats?.lastExportTs || 0));
  assert.deepEqual(after.record, { ...before.record, stats: { ...before.record.stats, lastExportTs: timestamp } });
  assert.deepEqual(after.archive, before.archive);
  assert.equal(after.snapshot.revision, before.snapshot.revision + 1);
  for (const key of Object.keys(before.snapshot).filter((key) => !['revision', 'documents'].includes(key)))
    assert.deepEqual(after.snapshot[key], before.snapshot[key], `Export metadata cannot change ${key}`);
  const newCommands = after.snapshot.documents.filter((row) => row.collection === 'kairo:record-host-commands'
    && !before.snapshot.documents.some((old) => old.collection === row.collection && old.id === row.id));
  assert.equal(newCommands.length, 1);
  const command = newCommands[0]; const row = command.value;
  assert.equal(new Date(row.occurredAt).toISOString(), row.occurredAt);
  const scope = { accountId: before.installation.binding.accountId, learnerId: before.installation.binding.learnerId };
  const input = { patch: { stats: after.record.stats }, expected: [{ root: 'stats',
    present: Object.hasOwn(before.record, 'stats'), sha256: Object.hasOwn(before.record, 'stats') ? digest(before.record.stats) : null }] };
  assert.deepEqual(row, { format: 'kairo-local-command-receipt', version: 1, changeId: command.id, type: 'app.patch/1',
    occurredAt: row.occurredAt, scope, commandSha256: digest({ scope, type: 'app.patch/1', occurredAt: row.occurredAt, input }),
    beforeRevision: before.snapshot.revision, committedRevision: after.snapshot.revision,
    recordSha256: digest(after.record), archiveSha256: digest(after.archive) });
  const commandRowId = JSON.stringify(['kairo:record-host-commands', command.id]);
  const receiptRowId = JSON.stringify(['local', `host-command:${digest([scope, command.id])}`]);
  const receipt = after.rows.find((row) => row.kind === 'receipt' && row.id === receiptRowId);
  assert(receipt, 'Export metadata must have its exact native empty-operation acknowledgement');
  const mutations = [{ kind: 'put', collection: 'learner-record', id: 'current', value: after.record },
    { kind: 'put', collection: 'learner-archive', id: 'current', value: after.archive },
    { kind: 'put', collection: command.collection, id: command.id, value: row }];
  assert.deepEqual(JSON.parse(receipt.text), { operations: [], revision: after.snapshot.revision,
    requestSha256: digest({ actor: before.installation.actor, occurredAt: row.occurredAt, mutations, operations: [] }) });
  const expectedChanged = (row) => row.kind === 'profile' || (row.kind === 'document' &&
    [JSON.stringify(['learner-record', 'current']), commandRowId].includes(row.id)) || (row.kind === 'receipt' && row.id === receiptRowId);
  assert.deepEqual(after.rows.filter((row) => !expectedChanged(row)), before.rows.filter((row) => !expectedChanged(row)),
    'Only export stats, their exact command/receipt and revision may differ');
  const profile = (state) => JSON.parse(state.rows.find((row) => row.kind === 'profile').text);
  assert.deepEqual(profile(after), { ...profile(before), revision: after.snapshot.revision });
}
async function fullBackup(page, state, evidence) {
  const exported = await exact(page, () => window.__KAIRO_AI__.exportRecord());
  assert.equal(exported.warning, undefined);
  const backup = JSON.parse(exported.text);
  assert.equal(backup.version, 2); assert.equal(backup.completeness, 'complete');
  assert.deepEqual(backup.record, state.record); assert.deepEqual(backup.archive, state.archive);
  const sort = (rows) => [...rows].sort((a, b) => a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0);
  assert.deepEqual(sort(backup.journal.operations), sort(state.snapshot.replica.operations));
  for (const key of ['record', 'archive', 'journal']) assert.equal(backup.sha256[key], digest(backup[key]));
  assert.equal(backup.journal.sha256, digest(Object.fromEntries(Object.entries(backup.journal).filter(([key]) => key !== 'sha256'))));
  // Export first emits the file, then writes lastExportTs. Hold that actual
  // native metadata transaction and prove the checkpoint reader cannot finish
  // before durable completion; no arbitrary delay substitutes for its receipt.
  await armNative(page, 'hold-write');
  const downloadWork = page.waitForEvent('download'); await page.locator('#export-store').click();
  const download = await downloadWork;
  const file = resolve(evidence.directory, `${evidence.name}--ui-backup.json`); await download.saveAs(file);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), backup);
  evidence.observations.push({ name: 'actual-ui-v2-download-exact-native-journal', pass: true, file, sha256: sha(readFileSync(file)) });
  await page.waitForFunction(() => window.__createNativeFault?.fired === 1);
  let settled = false;
  const checkpoint = admit(page, evidence, 'export-metadata-committed').then((after) => { settled = true; return after; });
  void checkpoint.catch(() => undefined);
  await page.waitForFunction(() => window.__createNativeFault?.readonlyAfterHold > 0);
  assert.equal(settled, false, 'A genuine native checkpoint read must wait behind the held export-stat transaction');
  assert.equal((await faultState(page)).durable, false);
  await page.evaluate(() => window.__createNativeFault.release());
  const after = await checkpoint;
  const fault = await faultState(page, true); assert.equal(fault.durable, true);
  assertExportMetadata(state, after);
  await assertUiNotes(page, after);
  evidence.observations.push({ name: 'export-checkpoint-waits-for-exact-metadata-acknowledgement', pass: true,
    nativeReadBlockedWhileHeld: true, settledAfterRelease: settled, beforeRevision: state.snapshot.revision,
    afterRevision: after.snapshot.revision, lastExportTs: after.record.stats.lastExportTs, operationsAllocated: 0 });
  return { file, after, backup };
}
async function initializeHost(page, { reopen = false, kind = 'host' } = {}) {
  await page.goto(`${origin}/note-command-fixture`);
  await page.waitForFunction(() => !!window.fixture);
  await exact(page, async ({ policy, actor, target, record, reopen, kind }) => {
    const f = window.fixture; f.policy = policy; f.actor = actor; f.databaseName = target;
    if (!reopen) {
      localStorage.setItem('kairo-corridor-v1', JSON.stringify(record));
      const db = await new Promise((done, fail) => {
        const request = indexedDB.open('kairo-ai-log', 3);
        request.onupgradeneeded = () => {
          const turns = request.result.createObjectStore('turns', { keyPath: 'id', autoIncrement: true });
          turns.createIndex('logical-id', 'turn.id'); request.result.createObjectStore('imports', { keyPath: 'id' });
        };
        request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error);
      }); db.close();
    }
    let token = { ownerId: crypto.randomUUID(), epoch: 1, sessionId: policy.binding.sessionId };
    let owned = false; let release;
    await new Promise((done, fail) => {
      navigator.locks.request('kairo-record:kairo-corridor-v1:kairo-ai-log', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) { fail(new Error('Real origin record lock is unavailable')); return; }
        owned = true; const lifetime = new Promise((resolve) => { release = resolve; }); done(); await lifetime;
      }).catch(fail);
    });
    f.writer = { capture: () => ({ ...token }), assert: (captured) => owned && captured.ownerId === token.ownerId && captured.epoch === token.epoch && captured.sessionId === token.sessionId };
    f.release = () => { owned = false; token = { ...token, epoch: token.epoch + 1 }; release(); };
    f.changeSession = () => { token = { ...token, sessionId: 'synthetic-revoked-session' }; };
    window.addEventListener('pagehide', f.release, { once: true });
    f.instance = await f.controller.createRecordController({ databaseName: target, policy, actor, writer: f.writer });
    if (!reopen) {
      const source = await f.controller.captureLegacySource(f.writer);
      const prepared = await f.instance.prepare(source, { migrationId: 'synthetic-original-note-migration' });
      if (prepared.status !== 'prepared') throw new Error(`Actual prepare failed: ${prepared.status}`);
      const active = await f.instance.activate('synthetic-original-note-migration');
      if (active.status !== 'active') throw new Error(`Actual activate failed: ${active.status}`);
    }
    f.publications = [];
    const options = { controller: f.instance, binding: policy.binding, writer: f.writer,
      validateRecord: (record) => record?.v === 1 && Array.isArray(record.taken), validateArchive: Array.isArray };
    f.subject = kind === 'host' ? await f.host.createRecordHost(options)
      : await f.app.createRecordApp({ ...options, onPublish: (outcome) => { f.publications.push(outcome); } });
  }, { policy, actor, target, record: fixtureRecord, reopen, kind });
}
async function command(page, id, text, occurredAt = time) {
  return exact(page, ({ id, text, occurredAt }) => window.fixture.subject.createNote({ changeId: id, occurredAt }, { text }), { id, text, occurredAt });
}

/** Only native IndexedDB scheduling is intercepted. Holds keep real transactions
 * alive; lost-ack suppresses completion delivery after the actual commit. */
async function armNative(page, mode) {
  assert(['hold-write', 'hold-read', 'lost-ack', 'revoke-at-complete', 'session-at-complete'].includes(mode));
  await page.evaluate((mode) => {
    if (window.__createNativeFault) throw new Error('Native note fault already armed');
    const databaseName = window.fixture?.databaseName || JSON.parse(localStorage.getItem('kairo-local-record-binding-v1')).databaseName;
    const nativeTransaction = IDBDatabase.prototype.transaction;
    const nativePut = IDBObjectStore.prototype.put;
    const fault = { mode, fired: 0, active: true, released: false, durable: false, aborted: false, putKinds: [], readonlyAfterHold: 0 };
    const keep = (tx) => {
      if (fault.released) return;
      const request = tx.objectStore('kairo_replication_rows').get('synthetic-note-transaction-keepalive'); request.onsuccess = () => keep(tx);
    };
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = nativeTransaction.apply(this, args);
      if (this.name !== databaseName || !fault.active) return tx;
      if (mode === 'hold-write' && fault.fired && !fault.released && (args[1] || 'readonly') === 'readonly') fault.readonlyAfterHold++;
      if (mode === 'hold-read' && !fault.fired && (args[1] || 'readonly') === 'readonly') { fault.fired++; keep(tx); }
      if (args[1] === 'readwrite') {
        tx.addEventListener('abort', () => { if (tx.__originalNoteCommand) fault.aborted = true; });
        tx.addEventListener('complete', (event) => {
          if (!tx.__originalNoteCommand || !fault.active) return;
          fault.durable = true;
          if (mode === 'hold-write') return;
          fault.fired++; fault.active = false;
          if (mode === 'lost-ack') event.stopImmediatePropagation();
          if (mode === 'revoke-at-complete') window.dispatchEvent(new PageTransitionEvent('pagehide'));
          if (mode === 'session-at-complete') window.fixture.changeSession();
        });
      }
      return tx;
    };
    IDBObjectStore.prototype.put = function (...args) {
      const request = nativePut.apply(this, args);
      if (this.transaction.db.name !== databaseName || this.name !== 'kairo_replication_rows' || !fault.active) return request;
      fault.putKinds.push(args[0]?.kind);
      if (args[0]?.kind === 'document' && JSON.parse(args[0].text).collection === 'kairo:record-host-commands') {
        this.transaction.__originalNoteCommand = true;
        if (mode === 'hold-write' && !fault.fired) { fault.fired++; keep(this.transaction); }
      }
      return request;
    };
    fault.release = () => { fault.released = true; };
    fault.disarm = () => { fault.released = true; fault.active = false; IDBDatabase.prototype.transaction = nativeTransaction; IDBObjectStore.prototype.put = nativePut; };
    window.__createNativeFault = fault;
  }, mode);
}
async function faultState(page, disarm = false) {
  return exact(page, (disarm) => {
    const fault = window.__createNativeFault;
    const result = { mode: fault.mode, fired: fault.fired, durable: fault.durable, aborted: fault.aborted, putKinds: fault.putKinds };
    if (disarm) { fault.disarm(); delete window.__createNativeFault; } return result;
  }, disarm);
}
async function beginHost(page, id, text) {
  await exact(page, ({ id, text, time }) => {
    window.fixture.pending = true;
    window.fixture.subject.createNote({ changeId: id, occurredAt: time }, { text }).then(
      (outcome) => { window.fixture.outcome = outcome; window.fixture.pending = false; },
      (error) => { window.fixture.outcome = { thrown: error.code || error.message }; window.fixture.pending = false; });
  }, { id, text, time });
}
async function settledHost(page) {
  await page.waitForFunction(() => window.fixture.pending === false);
  return exact(page, () => window.fixture.outcome);
}

const CASES = [
  'ui-exact-original-notes-held-commit-newer-draft-and-full-backup-reopen',
  'ui-quota-keeps-draft-and-native-history', 'ui-abort-keeps-draft-and-native-history',
  'ui-revoked-before-native-write-keeps-draft-and-disables-save',
  'ui-durable-before-revocation-cannot-publish-or-clear-draft',
  'native-app-concurrent-creates-preserve-predecessor-and-reject-forged-inputs',
  'native-host-exact-acknowledged-retry-and-command-conflict',
  'native-host-lost-completion-reopen-retry-retains-one-operation',
  'native-host-session-loss-after-commit-retains-history-without-publication',
];
try {
  for (const engine of ENGINES) {
    const browser = await ({ chromium, webkit }[engine]).launch(); browserVersions[engine] = browser.version();
    const directory = resolve(OUT, engine); mkdirSync(directory, { recursive: true });
    const test = async (name, body, kind = 'ui') => {
      if (FILTER && FILTER !== name) return;
      const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block' });
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url()); if (url.origin === origin) return route.continue();
        externalRequests.push({ engine, name, origin: url.origin }); return route.abort();
      });
      const page = await context.newPage(); page.setDefaultTimeout(12000);
      const evidence = { engine, name, directory, phase: 'boot', admissions: [], observations: [] };
      // Preserve bounded evidence for intermittent resource errors. The suite
      // continues to fail on every pageerror, including errors during teardown.
      let lifecycle = 'boot';
      const recent = [];
      const observe = (kind, detail = {}) => {
        recent.push({ kind, lifecycle, phase: evidence.phase, at: Date.now(), ...detail });
        if (recent.length > 24) recent.shift();
      };
      page.on('request', (request) => {
        if (request.url().includes('/data/articles/')) observe('article-request', { url: request.url() });
      });
      page.on('response', (response) => {
        if (response.url().includes('/data/articles/')) observe('article-response', { url: response.url(), status: response.status() });
      });
      page.on('requestfinished', (request) => {
        if (request.url().includes('/data/articles/')) observe('article-finished', { url: request.url() });
      });
      page.on('requestfailed', (request) => observe('request-failed', { url: request.url(), failure: request.failure() }));
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) observe('navigation', { url: frame.url() });
      });
      page.on('pageerror', (error) => errors.push({ engine, name, lifecycle, phase: evidence.phase, at: Date.now(),
        errorName: error.name, message: error.message, stack: error.stack, pageUrl: page.url(), recent: [...recent] }));
      const began = Date.now();
      try {
        if (kind === 'ui') { await page.goto(`${origin}/index.html?entry=shelf&ui=bi`); await ready(page); }
        else await initializeHost(page, { kind });
        const initial = await admit(page, evidence, 'initial-installed-native-state');
        assert.equal(initial.snapshot.replica.operations.length, 0); assert.equal(initial.snapshot.actor.sequence, 0);
        if (kind === 'ui') { await tray(page); await requireComposer(page, evidence); }
        else await requireCommand(page, evidence);
        lifecycle = 'case';
        await body(page, evidence, initial);
        lifecycle = 'screenshot';
        evidence.screenshot = resolve(directory, `${name}-pass.png`); await page.screenshot({ path: evidence.screenshot, fullPage: true });
        evidence.screenshotSha256 = sha(readFileSync(evidence.screenshot));
        results.push({ ...evidence, pass: true, elapsedMs: Date.now() - began });
      } catch (error) {
        evidence.screenshot = resolve(directory, `${name}-failure.png`);
        await page.screenshot({ path: evidence.screenshot, fullPage: true }).catch(() => {});
        results.push({ ...evidence, pass: false, elapsedMs: Date.now() - began, error: String(error.stack || error) });
      } finally {
        lifecycle = 'disarm-native-faults';
        await page.evaluate(() => { window.__createNativeFault?.disarm(); window.__recordTestFault?.disarm(); }).catch(() => {});
        lifecycle = 'settle-before-teardown';
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch((error) => errors.push({ engine, name, phase: 'settle-before-teardown', message: error.message }));
        lifecycle = 'close-context';
        await context.close();
      }
      console.log(`${engine} ${name}: ${results.at(-1).pass ? 'PASS' : `FAIL (${results.at(-1).phase})`}`);
    };
    try {
      await test(CASES[0], async (page, evidence, initial) => {
        const original = '  <img src=x onerror="window.__originalNoteHtml=1">\n猫 e\u0301 é 😀\t  ';
        await page.locator('#personal-note-input').fill(original);
        await page.locator('#personal-note-input').evaluate((input) => input.dispatchEvent(new CompositionEvent('compositionstart', { data: '猫' })));
        await page.locator('#personal-note-save').click();
        assert.equal(await page.evaluate(composerSettled), true);
        assert.equal(await page.locator('#personal-note-input').inputValue(), original);
        assert.deepEqual((await admit(page, evidence, 'ime-composition-click-refused')).rows, initial.rows);
        await page.locator('#personal-note-input').evaluate((input) => input.dispatchEvent(new CompositionEvent('compositionend', { data: '猫' })));
        await saveUi(page, original);
        await page.waitForFunction(() => document.querySelector('#personal-note-input')?.value === '');
        let state = await admit(page, evidence, 'first-original-command'); assertCreated(initial, state, [original]); await assertUiNotes(page, state);
        await page.locator('#note-input').fill('Independent builder feedback draft');
        await page.locator('#personal-note-input').fill(original);
        await page.evaluate(() => { window.__composerNodes = { input: document.getElementById('personal-note-input'), feedback: document.getElementById('note-input') }; });
        await armNative(page, 'hold-write'); await page.locator('#personal-note-save').click();
        await page.waitForFunction(() => window.__createNativeFault?.fired === 1);
        assert.equal(await page.locator('article.record-note').count(), 1, 'Held native commit cannot publish a proposed note');
        assert.equal(await page.locator('#personal-note-input').inputValue(), original);
        assert.equal(await page.locator('#personal-note-save').isDisabled(), true);
        assert.equal(await page.locator('#personal-note-save').getAttribute('data-pending'), 'true');
        assert.equal(await page.evaluate(composerSettled), false);
        await assert.rejects(page.waitForFunction(composerSettled, undefined, { timeout: 250 }), /Timeout/u,
          'The actual completion predicate must remain unsatisfied throughout the held native write');
        assert.equal((await faultState(page)).durable, false);
        const newer = 'New unsent personal draft, written while the earlier note saves';
        await page.locator('#personal-note-input').fill(newer);
        await page.evaluate(() => { const input = document.getElementById('personal-note-input'); input.focus({ preventScroll: true }); input.setSelectionRange(4, 11, 'backward'); });
        await page.evaluate(() => window.__createNativeFault.release());
        await page.waitForFunction(composerSettled);
        assert.equal(await page.locator('#personal-note-save').getAttribute('data-pending'), null);
        const fault = await faultState(page, true); assert.equal(fault.durable, true); assert(fault.putKinds.includes('operation'));
        evidence.observations.push({ name: 'actual-pending-lifecycle-and-completion-predicate', pass: true,
          pendingAttributeWhileHeld: 'true', settledWhileHeld: false, observedHeldForMs: 250,
          pendingAttributeAfterCompletion: null, settledAfterRelease: true });
        let next = await admit(page, evidence, 'held-second-command-confirmed'); assertCreated(state, next, [original]); await assertUiNotes(page, next);
        assert.equal(await page.locator('#personal-note-input').inputValue(), newer);
        assert.deepEqual(await page.evaluate(() => { const input = document.getElementById('personal-note-input'); return {
          same: input === window.__composerNodes.input && document.getElementById('note-input') === window.__composerNodes.feedback,
          focus: document.activeElement === input, selection: [input.selectionStart, input.selectionEnd, input.selectionDirection] }; }),
        { same: true, focus: true, selection: [4, 11, 'backward'] });
        assert.equal(await page.locator('#note-input').inputValue(), 'Independent builder feedback draft');
        state = next; await saveUi(page, newer);
        await page.waitForFunction(() => document.querySelector('#personal-note-input')?.value === '');
        next = await admit(page, evidence, 'newer-draft-explicitly-saved'); assertCreated(state, next, [newer]); await assertUiNotes(page, next);
        const exported = await fullBackup(page, next, evidence);
        await page.reload(); await ready(page); await tray(page);
        const reopened = await admit(page, evidence, 'reopened-native-history'); assert.deepEqual(reopened.rows, exported.after.rows); await assertUiNotes(page, reopened);
        assert.equal(await page.locator('#personal-note-input').inputValue(), '');
        assert.equal(await page.locator('#note-input').inputValue(), 'Independent builder feedback draft');
        await page.evaluate(() => { window.__ownNoteImportDocument = true; });
        await page.locator('#import-file').setInputFiles(exported.file);
        await page.waitForFunction(() => !window.__ownNoteImportDocument && document.body.dataset.ready === '1');
        await tray(page);
        const restored = await admit(page, evidence, 'own-journal-ui-backup-restored');
        assert.deepEqual(restored.record, exported.backup.record, 'Explicit restore uses the actual file, whose stats precede the export timestamp');
        assert.deepEqual(restored.archive, exported.backup.archive);
        rootsUnchanged(next, restored);
        assert.deepEqual(restored.snapshot.actor, reopened.snapshot.actor, 'Restoring exact existing own history cannot allocate a new event');
        assert.deepEqual(restored.snapshot.replica, reopened.snapshot.replica);
        assert.deepEqual(restored.snapshot.outbox, reopened.snapshot.outbox, 'Own backup restore cannot replay the outbox');
        assert.deepEqual(restored.snapshot.checkpoints, reopened.snapshot.checkpoints);
        await assertUiNotes(page, restored);
      });
      for (const mode of ['quota', 'abort']) await test(`ui-${mode}-keeps-draft-and-native-history`, async (page, evidence, initial) => {
        const draft = `Original unsent ${mode} draft 猫 e\u0301`;
        await page.locator('#personal-note-input').fill(draft);
        await armRecordWriteFailure(page, mode); await page.locator('#personal-note-save').click();
        await page.waitForFunction(() => window.__recordTestFault?.fired > 0);
        await page.waitForFunction(composerSettled);
        const fault = await clearRecordWriteFailure(page); assert.equal(fault.fired, 1);
        const failed = await admit(page, evidence, `native-${mode}-rollback`); assert.deepEqual(failed.rows, initial.rows);
        assert.equal(await page.locator('#personal-note-input').inputValue(), draft); assert.equal(await page.locator('article.record-note').count(), 0);
        assert.equal(await page.locator('#personal-note-save').isDisabled(), true);
        await page.reload(); await ready(page); await tray(page);
        assert.equal(await page.locator('#personal-note-input').inputValue(), draft);
        const reopened = await admit(page, evidence, `reopened-${mode}-draft`); assert.deepEqual(reopened.rows, initial.rows);
        await saveUi(page, draft); await page.waitForFunction(() => document.querySelector('#personal-note-input')?.value === '');
        const recovered = await admit(page, evidence, `explicit-save-after-${mode}-reopen`); assertCreated(initial, recovered, [draft]); await assertUiNotes(page, recovered);
      });
      await test(CASES[3], async (page, evidence, initial) => {
        const draft = 'Keep draft when the old writer loses ownership before native writes';
        await page.locator('#personal-note-input').fill(draft); await armNative(page, 'hold-read');
        await page.locator('#personal-note-save').click(); await page.waitForFunction(() => window.__createNativeFault?.fired === 1);
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
        assert.equal(await page.locator('#personal-note-save').isDisabled(), true);
        await page.evaluate(() => window.__createNativeFault.release());
        await page.waitForFunction(composerSettled);
        const fault = await faultState(page, true); assert.deepEqual(fault.putKinds, []);
        const after = await admit(page, evidence, 'owner-revoked-before-native-command'); assert.deepEqual(after.rows, initial.rows);
        assert.equal(await page.locator('#personal-note-input').inputValue(), draft); assert.equal(await page.locator('article.record-note').count(), 0);
        await page.reload(); await ready(page); await tray(page); assert.equal(await page.locator('#personal-note-input').inputValue(), draft);
        assert.deepEqual((await admit(page, evidence, 'new-owner-reopened-no-write')).rows, initial.rows);
      });
      await test(CASES[4], async (page, evidence, initial) => {
        const draft = 'Commit survives revocation but an old page cannot clear this draft';
        await page.locator('#personal-note-input').fill(draft); await armNative(page, 'revoke-at-complete');
        await page.locator('#personal-note-save').click(); await page.waitForFunction(() => window.__createNativeFault?.durable);
        await page.waitForFunction(composerSettled);
        const fault = await faultState(page, true); assert.equal(fault.fired, 1);
        const durable = await admit(page, evidence, 'durable-revoked-old-owner'); assertCreated(initial, durable, [draft]);
        assert.equal(await page.locator('article.record-note').count(), 0, 'A revoked old owner cannot publish its durable result');
        assert.equal(await page.locator('#personal-note-input').inputValue(), draft); assert.equal(await page.locator('#personal-note-save').isDisabled(), true);
        await page.reload(); await ready(page); await tray(page);
        const reopened = await admit(page, evidence, 'new-owner-confirms-durable-note'); assert.deepEqual(reopened.rows, durable.rows); await assertUiNotes(page, reopened);
        assert.equal(await page.locator('#personal-note-input').inputValue(), draft, 'Unacknowledged prior draft is retained without automatic save replay');
      });
      await test(CASES[5], async (page, evidence, initial) => {
        const text = ' \r\nExact host text e\u0301 é 😀\t ';
        const outcomes = await exact(page, async (text) => Promise.all([window.fixture.subject.createNote({ text }), window.fixture.subject.createNote({ text })]), text);
        assert(outcomes.every((outcome) => outcome.status === 'active' && outcome.replayUiEffects === true && outcome.receipt.operations.length === 1));
        const after = await admit(page, evidence, 'concurrent-app-commands'); const operations = assertCreated(initial, after, [text, text]);
        assert.equal(await page.evaluate(() => window.fixture.publications.length), 2);
        assert.deepEqual(outcomes.map((outcome) => outcome.receipt.operations[0]), operations.map(ref));
        const invalid = [{ text: '' }, { text: ' \r\n\t' }, { text: '\ud800' }, { text: '\udc00' }, { text: 'x'.repeat(64001) },
          { text, segments: [{ kind: 'source-quote', text }] }, { text, actor }, { text, binding: policy.binding }, { text, operations: [] }, { text, permissions: [] }];
        const refusals = await exact(page, async (invalid) => {
          const result = [];
          const transaction = IDBDatabase.prototype.transaction; let nativeWrites = 0;
          IDBDatabase.prototype.transaction = function (...args) {
            if (this.name === window.fixture.databaseName && args[1] === 'readwrite') nativeWrites++;
            return transaction.apply(this, args);
          };
          try {
            for (const input of invalid) {
              try { result.push({ accepted: await window.fixture.subject.createNote(input) }); }
              catch (error) { result.push({ refused: error.code || error.name }); }
            }
            try { result.push({ accepted: await window.fixture.subject.write(() => ({ patch: {}, operations: [] })) }); }
            catch (error) { result.push({ refused: error.code || error.name }); }
          } finally { IDBDatabase.prototype.transaction = transaction; }
          return { result, nativeWrites };
        }, invalid);
        assert.equal(refusals.result.length, invalid.length + 1); assert(refusals.result.every((row) => row.refused));
        assert.equal(refusals.nativeWrites, 0, 'Malformed app input and generic operations must refuse before any native write transaction');
        evidence.observations.push({ name: 'strict-app-input-refuses-before-native-write', pass: true, refused: refusals.result.length, nativeWrites: refusals.nativeWrites });
        assert.deepEqual((await admit(page, evidence, 'malformed-quote-and-generic-op-refusal')).rows, after.rows);
        const maximal = 'a'.repeat(63998) + '😀';
        const accepted = await exact(page, (text) => window.fixture.subject.createNote({ text }), maximal); assert.equal(accepted.status, 'active');
        assertCreated(after, await admit(page, evidence, 'maximum-well-formed-original-text'), [maximal]);
      }, 'app');
      await test(CASES[6], async (page, evidence, initial) => {
        const first = await command(page, 'stable-command', 'Original exact retry text'); assert.equal(first.status, 'active');
        const created = await admit(page, evidence, 'native-command-original'); const operations = assertCreated(initial, created, ['Original exact retry text']);
        assert.deepEqual(first.receipt.operations, operations.map(ref));
        await exact(page, async (operations) => {
          const f = window.fixture; const state = (await f.instance.snapshot()).snapshot;
          const result = await f.instance.acknowledgeOutbox({ acknowledgementId: 'synthetic-server-exact-ack', binding: f.policy.binding, expectedRevision: state.revision, operations });
          if (result.status !== 'active') throw new Error('Native outbox acknowledgement failed');
        }, first.receipt.operations);
        const acknowledged = await admit(page, evidence, 'outbox-already-acknowledged'); assert.equal(acknowledged.snapshot.outbox.length, 0);
        const retried = await command(page, 'stable-command', 'Original exact retry text');
        assert.equal(retried.status, 'active'); assert.equal(retried.receipt.outcome, 'duplicate'); assert.equal(retried.replayUiEffects, false);
        assert.deepEqual(retried.receipt.operations, first.receipt.operations);
        for (const [text, occurredAt] of [['Conflicting text', time], ['Original exact retry text', '2026-09-10T07:00:01.000Z']]) {
          await assert.rejects(command(page, 'stable-command', text, occurredAt), /command-id-conflict/u);
        }
        const refusals = await exact(page, async (time) => {
          const inputs = [{ text: '' }, { text: ' \r\n' }, { text: '\ud800' }, { text: '\udc00' }, { text: 'x'.repeat(64001) },
            { text: 'Original', segments: [{ kind: 'source-quote', text: 'Quoted' }] }, { text: 'Original', actor: window.fixture.actor },
            { text: 'Original', binding: window.fixture.policy.binding }, { text: 'Original', operations: [] }, { text: 'Original', permissions: [] }];
          const result = []; const transaction = IDBDatabase.prototype.transaction; let nativeWrites = 0;
          IDBDatabase.prototype.transaction = function (...args) {
            if (this.name === window.fixture.databaseName && args[1] === 'readwrite') nativeWrites++;
            return transaction.apply(this, args);
          };
          try {
            for (let index = 0; index < inputs.length; index++) {
              try { result.push({ accepted: await window.fixture.subject.createNote({ changeId: `refused-${index}`, occurredAt: time }, inputs[index]) }); }
              catch (error) { result.push({ refused: error.code || error.name }); }
            }
          } finally { IDBDatabase.prototype.transaction = transaction; }
          return { result, nativeWrites };
        }, time);
        assert.equal(refusals.result.length, 10); assert(refusals.result.every((row) => row.refused)); assert.equal(refusals.nativeWrites, 0);
        evidence.observations.push({ name: 'strict-host-input-refuses-before-native-write', pass: true, refused: refusals.result.length, nativeWrites: refusals.nativeWrites });
        assert.deepEqual((await admit(page, evidence, 'exact-retry-and-conflict-refusals')).rows, acknowledged.rows);
      }, 'host');
      await test(CASES[7], async (page, evidence, initial) => {
        const text = 'The operation became durable before native completion delivery was lost';
        await armNative(page, 'lost-ack'); await beginHost(page, 'lost-completion', text);
        await page.waitForFunction(() => window.__createNativeFault?.durable);
        const fault = await faultState(page, true); assert.equal(fault.fired, 1);
        assert.equal(await page.evaluate(() => window.fixture.pending), true);
        const current = await exact(page, () => window.fixture.subject.current());
        assert.equal(current.snapshot.noteViews.length, 0, 'Lost completion cannot publish proposed note state');
        const durable = await admit(page, evidence, 'completion-lost-after-native-commit'); const operations = assertCreated(initial, durable, [text]);
        await initializeHost(page, { reopen: true });
        const retried = await command(page, 'lost-completion', text);
        assert.equal(retried.status, 'active'); assert.equal(retried.receipt.outcome, 'duplicate'); assert.equal(retried.replayUiEffects, false);
        assert.deepEqual(retried.receipt.operations, operations.map(ref));
        assert.deepEqual((await admit(page, evidence, 'new-owner-exact-retry')).rows, durable.rows);
      }, 'host');
      await test(CASES[8], async (page, evidence, initial) => {
        await armNative(page, 'session-at-complete'); await beginHost(page, 'old-session-command', 'Old session commit remains local durable history');
        const result = await settledHost(page); assert.equal(result.status, 'recovery-required');
        const fault = await faultState(page, true); assert.equal(fault.durable, true); assert.equal(fault.fired, 1);
        assert.equal(result.lastCommitted.noteViews.length, 0);
        const durable = await admit(page, evidence, 'session-invalidated-at-durable-boundary'); assertCreated(initial, durable, ['Old session commit remains local durable history']);
        await assert.rejects(command(page, 'cannot-enter-new-session', 'Must remain absent'), /writer-required|session-changed/u);
        assert.deepEqual((await admit(page, evidence, 'old-session-cannot-submit-next-command')).rows, durable.rows);
      }, 'host');
    } finally { await browser.close(); }
  }
} finally {
  await new Promise((done) => server.close(done)); mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify({ suite: 'record-note-create', version: 1,
    mode: FILTER ? 'filtered' : 'full', artifactSha256: manifest.artifactSha256, verifierSha256,
    engines: ENGINES, browserVersions, startedAt, completedAt: new Date().toISOString(), results, errors, externalRequests,
    pass: results.length === ENGINES.length * (FILTER ? 1 : CASES.length) && results.every((row) => row.pass) && !errors.length && !externalRequests.length,
    limitations: ['Synthetic already-admitted local learner and synthetic native-host policy only; no authentication, network transport or source permission claim.',
      'Actual rendered app commands and genuine browser IndexedDB/controller/Web Locks; only native fault scheduling is intercepted.',
      'Composition events verify the composer guard; this does not replace physical macOS/iPhone IME acceptance.',
      'Explicit retry belongs to the named host API. A lost acknowledgement is not automatically replayed by the UI.',
      'Personal-note create only; note edit, delete, restoration, choice and source-quote commands remain outside this suite.',
      'On a missing-feature baseline only observations before each recorded failure phase executed.'] }, null, 2) + '\n');
}
assert.equal(results.length, ENGINES.length * (FILTER ? 1 : CASES.length));
assert(results.every((row) => row.pass), 'Original-note command journeys failed');
assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
