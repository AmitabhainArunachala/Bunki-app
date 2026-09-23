/** Reading-position commands in the actual browser RecordController/App/Host.
 * Two isolated browser profiles are synthetic same-account peers. Their relay
 * copies exact persisted outbox operations; it is not live transport, native
 * device, authentication, source-permission, or learning-evidence acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { readAppRecordSnapshot, waitForAppRecord } from './record-test-support.mjs';

const SITE = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ENGINES = (process.env.KAIRO_BROWSER || 'all') === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER];
assert(ENGINES.every((engine) => ['chromium', 'webkit'].includes(engine)));
const FILTER = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value !== null && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])])) : value;
const digest = (value) => sha(JSON.stringify(normalize(value)));
// Operation references use the domain's indented canonical bytes. Local native
// row and command hashes use compact encodeLocalJson bytes instead.
const reference = (operation) => ({ opId: operation.opId, sha256: sha(JSON.stringify(normalize(operation), null, 2)) });
const sortOps = (operations) => [...operations].sort((a, b) => a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0);
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
const verifierSha256 = sha(readFileSync(new URL(import.meta.url)));
const time = '2026-09-12T01:00:00.000Z';
const scope = { accountId: 'synthetic-reading-account', learnerId: 'synthetic-reading-learner' };
const empty = () => ({ heads: [], tombstones: [], activeRestoreGenerations: [] });
const source = { sourceId: 'synthetic-reading-source', versionId: 'synthetic-version-1', sha256: sha('Synthetic fixture text; no third-party source permission is implied.') };
const anchor = (start, override = {}) => ({ source: { ...source, ...override }, position: { kind: 'text', unit: 'utf16', start, end: start + 2, bodyLength: 256 } });
const fixtureRecord = JSON.parse('{"v":1,"taken":[],"srs":{"synthetic-preserved-card":{"interval":17}},"revlog":[{"synthetic":"preserved-review"}],"obslog":[{"synthetic":"preserved-observation"}],"unknownRoot":{"preserve":"unrelated learner bytes"},"__proto__":{"preserve":"own-key"}}');
const fixtureArchive = { format: 'kairo-archive-row', v: 1, id: 1, turn: { id: 'synthetic-preserved-turn', surface: 'synthetic-existing', role: 'user', content: 'Unrelated prior archive text', ts: 1 } };
const results = [], errors = [], externalRequests = [], browserVersions = {};
const startedAt = new Date().toISOString();
const CASES = [
  'native-pair-divergence-reordered-duplicates-missing-dependencies-choice-and-reopen',
  'native-session-and-source-version-preservation-exact-identical-provenance',
  'native-invalid-stale-and-deleted-inputs-have-no-native-write',
  'native-quota-is-atomic',
  'native-abort-is-atomic',
  'native-host-lost-acknowledgement-reopen-exact-retry',
  'native-app-owner-invalidation-after-durability-prevents-publication',
  'ui-clean-profile-original-save-and-return-preserve-learning-state',
];
assert(!FILTER || CASES.includes(FILTER), `Unknown case: ${FILTER}`);

// Preserve the exact immutable artifact, verifier and available build inputs.
// Current source hashes are recorded separately from the pinned artifact's
// module-input hashes, so concurrent edits cannot masquerade as tested bytes.
const retainedSite = resolve(OUT, 'tested-site');
cpSync(SITE, retainedSite, { recursive: true, errorOnExist: true, force: false });
for (const file of manifest.files) assert.equal(sha(readFileSync(resolve(retainedSite, file.path))), file.sha256, `Retained artifact copy differs: ${file.path}`);
const sourcePaths = new Set(['prototypes/corridor/tools/verify-record-reading-position.mjs',
  'prototypes/corridor/tools/record-test-support.mjs', 'prototypes/corridor/record-controller.mjs',
  'prototypes/corridor/record-host.mjs', 'prototypes/corridor/record-app.mjs',
  'prototypes/corridor/reading-position.mjs',
  'prototypes/corridor/corridor.js', 'prototypes/corridor/index.html',
  ...manifest.modules.flatMap((module) => module.inputs.map((input) => input.path))]);
const sourceCopies = [];
for (const path of sourcePaths) {
  const bytes = readFileSync(resolve(ROOT, path));
  const copy = resolve(OUT, 'source-copies', path); mkdirSync(dirname(copy), { recursive: true }); writeFileSync(copy, bytes);
  sourceCopies.push({ path, copy, sha256: sha(bytes) });
}
const fixtureHtml = `<!doctype html><meta charset="utf-8"><title>Synthetic reading-position peers</title>
<h1>Synthetic reading-position relay fixture</h1><p>Real local IndexedDB and record commands; no live account or native-device claim.</p><pre id="confirmed-view"></pre>
<script type="module">
import * as controller from '/record-controller.mjs';
import * as core from '/modules/record-core.mjs';
import * as host from '/record-host.mjs';
import * as app from '/record-app.mjs';
window.fixture = { controller, core, host, app };
</script>`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/synthetic-reading-relay') {
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end(fixtureHtml); return;
  }
  const file = resolve(retainedSite, path === '/' ? 'index.html' : path.slice(1));
  try {
    if (!file.startsWith(`${retainedSite}/`) || !statSync(file).isFile()) throw new Error('missing');
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

/** Authored fixture actions only. JSON preserves own __proto__ properties and
 * malformed UTF-16 inputs across Playwright's object boundary. */
async function exact(page, action, value) {
  return JSON.parse(await page.evaluate(async ({ source, input }) => {
    const run = (0, eval)(`(${source})`);
    return JSON.stringify({ value: await run(JSON.parse(input).value) });
  }, { source: String(action), input: JSON.stringify({ value }) })).value;
}
async function initialize(page, { peer = 'a', kind = 'app', reopen = false } = {}) {
  await page.goto(`${origin}/synthetic-reading-relay`);
  await page.waitForFunction(() => !!window.fixture);
  await exact(page, async ({ peer, kind, reopen, scope, record, archive }) => {
    const f = window.fixture;
    f.kind = kind; f.databaseName = `synthetic-reading-peer:${peer}`;
    f.policy = { binding: { ...scope, sessionId: `synthetic-owner-session:${peer}` }, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    f.actor = { deviceId: `synthetic-device:${peer}`, incarnationId: `synthetic-installation:${peer}` };
    if (!reopen) {
      localStorage.setItem('kairo-corridor-v1', JSON.stringify(record));
      const db = await new Promise((done, fail) => {
        const request = indexedDB.open('kairo-ai-log', 3);
        request.onupgradeneeded = () => {
          const turns = request.result.createObjectStore('turns', { keyPath: 'id', autoIncrement: true });
          turns.createIndex('logical-id', 'turn.id'); request.result.createObjectStore('imports', { keyPath: 'id' });
        };
        request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error);
      });
      try { await new Promise((done, fail) => {
        const tx = db.transaction('turns', 'readwrite'); tx.objectStore('turns').put(archive);
        tx.oncomplete = done; tx.onabort = () => fail(tx.error);
      }); } finally { db.close(); }
    }
    let token = { ownerId: crypto.randomUUID(), epoch: 1, sessionId: f.policy.binding.sessionId };
    let owned = false, release;
    await new Promise((done, fail) => {
      navigator.locks.request('kairo-record:kairo-corridor-v1:kairo-ai-log', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) { fail(new Error('Actual origin record lock unavailable')); return; }
        owned = true; const lifetime = new Promise((resolve) => { release = resolve; }); done(); await lifetime;
      }).catch(fail);
    });
    f.writer = { capture: () => ({ ...token }), assert: (captured) => owned && captured.ownerId === token.ownerId && captured.epoch === token.epoch && captured.sessionId === token.sessionId };
    f.release = () => { owned = false; token = { ...token, epoch: token.epoch + 1 }; release(); };
    window.addEventListener('pagehide', f.release, { once: true });
    f.instance = await f.controller.createRecordController({ databaseName: f.databaseName, policy: f.policy, actor: f.actor, writer: f.writer });
    if (!reopen) {
      const source = await f.controller.captureLegacySource(f.writer);
      const id = `synthetic-reading-migration:${peer}`;
      if ((await f.instance.prepare(source, { migrationId: id })).status !== 'prepared') throw new Error('Real controller prepare failed');
      if ((await f.instance.activate(id)).status !== 'active') throw new Error('Real controller activation failed');
    }
    f.publications = [];
    const options = { controller: f.instance, binding: f.policy.binding, writer: f.writer,
      validateRecord: (record) => record?.v === 1 && Array.isArray(record.taken), validateArchive: Array.isArray };
    f.subject = kind === 'host' ? await f.host.createRecordHost(options)
      : await f.app.createRecordApp({ ...options, onPublish: (outcome) => f.publications.push(outcome) });
    if (typeof f.subject.saveReadingPosition !== 'function') throw new Error('Named saveReadingPosition API absent');
  }, { peer, kind, reopen, scope, record: fixtureRecord, archive: fixtureArchive });
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
      request.onupgradeneeded = () => { request.transaction.abort(); fail(new Error('Expected an already-installed database')); };
      request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error);
    });
    let rows;
    try { rows = await new Promise((done, fail) => {
      const tx = db.transaction('kairo_replication_rows', 'readonly'); const request = tx.objectStore('kairo_replication_rows').getAll();
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
  assert.equal(JSON.parse(state.rows.find((row) => row.kind === 'profile').text).revision, state.snapshot.revision);
  for (const row of state.rows) assert.equal(sha(row.text), row.sha256);
  assert(state.record && state.archive);
  assert.equal(state.snapshot.replica.projection.scheduling, 'not-computed');
  assert.deepEqual(state.snapshot.replica.projection.reviewReconciliations, []);
  if (!await page.evaluate(() => !!window.fixture)) {
    const app = await readAppRecordSnapshot(page); assert.deepEqual(app.rows, state.rows); assert.equal(app.revision, state.snapshot.revision);
  }
  const file = resolve(evidence.directory, `${evidence.name}--${stage}.json`);
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  evidence.admissions.push({ stage, file, sha256: sha(readFileSync(file)), revision: state.snapshot.revision,
    actorSequence: state.snapshot.actor.sequence, operations: state.snapshot.replica.operations.length,
    ready: state.snapshot.replica.ready.length, pending: state.snapshot.replica.pending.length,
    quarantined: state.snapshot.replica.quarantined.length, outbox: state.snapshot.outbox.length, rowBytesSha256: digest(state.rows) });
  evidence.phase = `native-admitted:${stage}`; return state;
}
function rootsUnchanged(before, after) {
  const roots = (state) => state.rows.filter((row) => row.kind === 'document' && ['learner-record', 'learner-archive'].includes(JSON.parse(row.text).collection));
  assert.deepEqual(roots(after), roots(before), 'Reading intent cannot change learner/archive bytes, reviews, observations, scheduling or unrelated roots');
  assert.deepEqual(after.installation, before.installation, 'Reading intent cannot change the admitted installation');
}
function assertSaved(before, after, input, supersedes) {
  rootsUnchanged(before, after);
  assert.equal(after.snapshot.revision, before.snapshot.revision + 1);
  assert.equal(after.snapshot.actor.sequence, before.snapshot.actor.sequence + 1);
  assert.equal(after.snapshot.replica.operations.length, before.snapshot.replica.operations.length + 1);
  assert.equal(after.snapshot.outbox.length, before.snapshot.outbox.length + 1);
  const added = after.snapshot.replica.operations.filter((row) => !before.snapshot.replica.operations.some((old) => old.opId === row.opId));
  assert.equal(added.length, 1); const operation = added[0];
  assert.deepEqual(operation.actor, { deviceId: before.snapshot.actor.deviceId, incarnationId: before.snapshot.actor.incarnationId, sequence: before.snapshot.actor.sequence + 1 });
  assert.deepEqual(operation.predecessor, before.snapshot.actor.predecessor);
  assert.deepEqual(operation.scope, { accountId: before.installation.binding.accountId, learnerId: before.installation.binding.learnerId });
  assert.deepEqual(operation.payload, { kind: 'reading.resume', sessionId: input.sessionId, anchor: input.anchor, generation: null, supersedes });
  assert.equal(operation.payloadSha256, sha(JSON.stringify(normalize(operation.payload), null, 2)));
  assert.deepEqual(operation.dependencies, input.expected.heads);
  assert.deepEqual(after.snapshot.actor.predecessor, reference(operation));
  assert.deepEqual(after.snapshot.outbox.find((row) => row.opId === operation.opId), operation);
  assert(after.snapshot.replica.ready.some((ref) => digest(ref) === digest(reference(operation))));
  const commands = (state) => state.snapshot.documents.filter((row) => row.collection === 'kairo:record-host-commands');
  const command = commands(after).filter((row) => !commands(before).some((old) => old.id === row.id));
  assert.equal(command.length, 1);
  const row = command[0].value;
  assert.equal(row.type, 'host.reading-resume/1');
  assert.equal(row.commandSha256, digest({ scope: operation.scope, type: row.type, occurredAt: row.occurredAt, input }));
  assert.equal(row.beforeRevision, before.snapshot.revision); assert.equal(row.committedRevision, after.snapshot.revision);
  assert.equal(row.recordSha256, digest(before.record)); assert.equal(row.archiveSha256, digest(before.archive));
  assert.equal(row.occurredAt, operation.occurredAt);
  const mutations = [{ kind: 'put', collection: command[0].collection, id: command[0].id, value: row }];
  const durable = after.rows.find((candidate) => candidate.kind === 'receipt' && candidate.id === JSON.stringify(['local', `host-command:${digest([operation.scope, command[0].id])}`]));
  assert(durable, 'The operation and named command require one exact durable local receipt');
  assert.deepEqual(JSON.parse(durable.text), { operations: [reference(operation)], revision: after.snapshot.revision,
    requestSha256: digest({ actor: before.installation.actor, occurredAt: operation.occurredAt, mutations,
      operations: [{ payload: operation.payload, dependencies: input.expected.heads }] }) });
  return operation;
}
async function refresh(page) {
  return exact(page, async () => {
    const result = await window.fixture.subject.snapshot();
    document.getElementById('confirmed-view').textContent = JSON.stringify(result, null, 2);
    return result;
  });
}
function viewOf(outcome, sourceId = source.sourceId) {
  assert.equal(outcome.status, 'active'); assert(Array.isArray(outcome.snapshot.readingViews));
  return outcome.snapshot.readingViews.find((row) => row.sourceId === sourceId);
}
function expected(view) {
  return view ? Object.fromEntries(['heads', 'tombstones', 'activeRestoreGenerations'].map((key) => [key, view.projection[key]])) : empty();
}
function assertViews(outcome, state) {
  assert.equal(outcome.status, 'active'); assert.equal(outcome.snapshot.revision, state.snapshot.revision);
  const projections = state.snapshot.replica.projection.entities.filter((row) => row.target.kind === 'reading-position');
  assert.equal(outcome.snapshot.readingViews.length, projections.length);
  for (const projection of projections) {
    const view = viewOf(outcome, projection.target.id); assert(view); assert.deepEqual(view.projection, projection);
    const groups = new Map();
    for (const ref of projection.heads) {
      const operation = state.snapshot.replica.operations.find((row) => row.opId === ref.opId);
      assert.equal(operation?.payload.kind, 'reading.resume'); assert.deepEqual(reference(operation), ref);
      assert(state.snapshot.replica.ready.some((row) => digest(row) === digest(ref)), 'Pending bytes cannot provide a visible place');
      const prior = groups.get(operation.payloadSha256);
      if (prior) prior.operationRefs.push(ref);
      else groups.set(operation.payloadSha256, { payloadSha256: operation.payloadSha256, payload: operation.payload, operationRefs: [ref] });
    }
    assert.deepEqual(view.headResumes, [...groups.values()], 'Exact grouped visible positions must derive from every current core head');
  }
}
async function save(page, input, changeId = 'synthetic-reading-command', occurredAt = time) {
  return exact(page, async ({ input, changeId, occurredAt }) => {
    try {
      const f = window.fixture;
      return f.kind === 'host' ? await f.subject.saveReadingPosition({ changeId, occurredAt }, input) : await f.subject.saveReadingPosition(input);
    } catch (error) { return { status: 'rejected', code: error.code || error.name, message: error.message }; }
  }, { input, changeId, occurredAt });
}
async function refuse(page, evidence, input, code, stage) {
  const before = await native(page);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    window.fixture.writeProbe = { count: 0, disarm: () => { IDBDatabase.prototype.transaction = original; } };
    IDBDatabase.prototype.transaction = function (...args) {
      if (this.name === window.fixture.databaseName && args[1] === 'readwrite') window.fixture.writeProbe.count++;
      return original.apply(this, args);
    };
  });
  let outcome, count;
  try { outcome = await save(page, input, stage); }
  finally { count = await page.evaluate(() => { const p = window.fixture.writeProbe; p.disarm(); return p.count; }); }
  assert.equal(outcome.status, 'rejected'); if (code) assert.match(outcome.code, code);
  assert.equal(count, 0, 'Invalid intent must be refused before any native write transaction');
  assert.deepEqual((await admit(page, evidence, stage)).rows, before.rows);
  evidence.observations.push({ name: stage, outcome, nativeWrites: count });
}
async function receive(page, operations, deliveryId) {
  return exact(page, async ({ operations, deliveryId }) => {
    const f = window.fixture;
    const state = await f.instance.snapshot(); if (state.status !== 'active') throw new Error('Actual receiver controller inactive');
    const before = state.snapshot; const channelId = 'explicit-synthetic-reading-relay';
    return f.instance.commitReceive({ deliveryId, expectedRevision: before.revision,
      delivery: { binding: f.policy.binding, operations }, checkpoint: { channelId,
        expected: before.checkpoints.find((row) => row.channelId === channelId)?.value ?? null, next: deliveryId } });
  }, { operations, deliveryId });
}
async function relay(page, evidence, before, operations, deliveryId) {
  for (const operation of operations) assert.equal(operation.payload.kind, 'reading.resume');
  const outcome = await receive(page, operations, deliveryId); assert.equal(outcome.status, 'active');
  const after = await admit(page, evidence, deliveryId); rootsUnchanged(before, after);
  assert.deepEqual(after.snapshot.actor, before.snapshot.actor, 'Receiving cannot allocate a local actor sequence or predecessor');
  assert.deepEqual(after.snapshot.outbox, before.snapshot.outbox, 'Receiving cannot echo received history into local outbox');
  for (const operation of operations) assert.deepEqual(after.snapshot.replica.operations.find((row) => row.opId === operation.opId), operation);
  evidence.observations.push({ name: deliveryId, label: 'synthetic-relay-of-persisted-operations', operations: operations.map(reference), outcome });
  return after;
}

/** Intercept native fault timing only. Real puts are queued before quota/abort;
 * lost-ack suppresses the real transaction completion after durable commit. */
async function armFault(page, mode) {
  assert(['quota', 'abort', 'lost-ack', 'owner-at-complete'].includes(mode));
  await page.evaluate((mode) => {
    if (window.__readingNativeFault) throw new Error('Reading native fault already armed');
    const databaseName = window.fixture.databaseName;
    const originalTransaction = IDBDatabase.prototype.transaction, originalPut = IDBObjectStore.prototype.put;
    const fault = { mode, fired: 0, durable: false, aborted: false, active: true, putKinds: [] };
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = originalTransaction.apply(this, args);
      if (this.name === databaseName && args[1] === 'readwrite') {
        tx.addEventListener('abort', () => { if (tx.__readingCommand) fault.aborted = true; });
        tx.addEventListener('complete', (event) => {
          if (!tx.__readingCommand || !fault.active) return;
          fault.durable = true;
          if (mode === 'lost-ack' || mode === 'owner-at-complete') {
            fault.fired++; fault.active = false;
            if (mode === 'lost-ack') event.stopImmediatePropagation();
            else window.fixture.release();
          }
        });
      }
      return tx;
    };
    IDBObjectStore.prototype.put = function (...args) {
      const request = originalPut.apply(this, args);
      if (this.transaction.db.name !== databaseName || this.name !== 'kairo_replication_rows' || !fault.active) return request;
      fault.putKinds.push(args[0]?.kind);
      if (args[0]?.kind === 'document' && JSON.parse(args[0].text).collection === 'kairo:record-host-commands') {
        this.transaction.__readingCommand = true;
        if (mode === 'quota' || mode === 'abort') {
          fault.fired++;
          if (mode === 'abort') this.transaction.abort();
          else throw new DOMException('Synthetic quota after real reading-command puts', 'QuotaExceededError');
        }
      }
      return request;
    };
    fault.disarm = () => { fault.active = false; IDBDatabase.prototype.transaction = originalTransaction; IDBObjectStore.prototype.put = originalPut; };
    window.__readingNativeFault = fault;
  }, mode);
}
async function faultState(page, disarm = false) {
  return exact(page, (disarm) => {
    const f = window.__readingNativeFault;
    const state = { mode: f.mode, fired: f.fired, durable: f.durable, aborted: f.aborted, putKinds: f.putKinds };
    if (disarm) { f.disarm(); delete window.__readingNativeFault; } return state;
  }, disarm);
}
async function begin(page, input, changeId) {
  await exact(page, ({ input, changeId, time }) => {
    const f = window.fixture; f.pending = true;
    const work = f.kind === 'host' ? f.subject.saveReadingPosition({ changeId, occurredAt: time }, input) : f.subject.saveReadingPosition(input);
    work.then((outcome) => { f.pending = false; f.outcome = outcome; }, (error) => { f.pending = false; f.outcome = { status: 'rejected', code: error.code || error.name }; });
  }, { input, changeId, time });
}

try {
  for (const engine of ENGINES) {
    const browser = await ({ chromium, webkit }[engine]).launch(); browserVersions[engine] = browser.version();
    const directory = resolve(OUT, engine); mkdirSync(directory, { recursive: true });
    const test = async (name, body, { pair = false, kind = 'app' } = {}) => {
      if (FILTER && FILTER !== name) return;
      const contexts = [], pages = [];
      const evidence = { engine, name, directory, phase: 'boot', admissions: [], observations: [] };
      const began = Date.now();
      try {
        for (const peer of pair ? ['a', 'b'] : ['a']) {
          const context = await browser.newContext({ viewport: { width: 1050, height: kind === 'ui' ? 1200 : 900 }, serviceWorkers: 'block' }); contexts.push(context);
          await context.route('**/*', (route) => {
            const url = new URL(route.request().url()); if (url.origin === origin) return route.continue();
            externalRequests.push({ engine, name, peer, origin: url.origin }); return route.abort();
          });
          const page = await context.newPage(); pages.push(page); page.setDefaultTimeout(12000);
          page.on('pageerror', (error) => errors.push({ engine, name, peer, phase: evidence.phase, message: error.message, stack: error.stack }));
          if (kind === 'ui') {
            await page.goto(`${origin}/index.html?entry=shelf&ui=bi`); await page.waitForFunction(() => document.body.dataset.ready === '1');
          } else await initialize(page, { peer, kind });
        }
        const initial = [];
        for (let index = 0; index < pages.length; index++) {
          const state = await admit(pages[index], evidence, `peer-${index}-initial`); initial.push(state);
          assert.equal(state.snapshot.replica.operations.length, 0); assert.equal(state.snapshot.actor.sequence, 0);
        }
        if (pair) {
          assert.notEqual(initial[0].installation.databaseName, initial[1].installation.databaseName);
          assert.notDeepEqual(initial[0].installation.actor, initial[1].installation.actor);
          assert.deepEqual(initial[0].snapshot.replica.policy.binding.accountId, initial[1].snapshot.replica.policy.binding.accountId);
          assert.deepEqual(initial[0].snapshot.replica.policy.binding.learnerId, initial[1].snapshot.replica.policy.binding.learnerId);
          evidence.observations.push({ name: 'two-independent-native-stores', syntheticSameAccountScope: scope, installations: initial.map((row) => row.installation), browserContexts: contexts.length });
        }
        await body(pages, evidence, initial);
        evidence.screenshots = [];
        for (let index = 0; index < pages.length; index++) {
          const file = resolve(directory, `${name}--peer-${index}-pass.png`); await pages[index].screenshot({ path: file, fullPage: true });
          evidence.screenshots.push({ file, sha256: sha(readFileSync(file)) });
        }
        results.push({ ...evidence, pass: true, elapsedMs: Date.now() - began });
      } catch (error) {
        evidence.failureScreenshots = [];
        for (let index = 0; index < pages.length; index++) {
          const file = resolve(directory, `${name}--peer-${index}-failure.png`);
          try { await pages[index].screenshot({ path: file, fullPage: true }); evidence.failureScreenshots.push({ file, sha256: sha(readFileSync(file)) }); } catch { /* Preserve original failure. */ }
        }
        results.push({ ...evidence, pass: false, elapsedMs: Date.now() - began, error: String(error.stack || error) });
      } finally {
        for (const page of pages) await page.evaluate(() => { window.__readingNativeFault?.disarm(); window.fixture?.writeProbe?.disarm(); }).catch(() => undefined);
        for (const context of contexts) await context.close();
      }
      console.log(`${engine} ${name}: ${results.at(-1).pass ? 'PASS' : `FAIL (${results.at(-1).phase})`}`);
    };
    try {
      await test(CASES[0], async ([a, b], evidence, [initialA, initialB]) => {
        let stateA = initialA, stateB = initialB;
        const history = [];
        for (const [page, starts, peer] of [[a, [10, 20], 'a'], [b, [40, 60], 'b']]) {
          let before = peer === 'a' ? stateA : stateB; const operations = [];
          for (const start of starts) {
            const input = { sessionId: 'synthetic-reading-session', anchor: anchor(start), expected: expected(viewOf(await refresh(page))), selected: null };
            assert.equal((await save(page, input)).status, 'active');
            const after = await admit(page, evidence, `${peer}-own-position-${start}`); operations.push(assertSaved(before, after, input, input.expected.heads)); before = after;
          }
          history.push(operations); if (peer === 'a') stateA = before; else stateB = before;
        }
        const [[a1, a2], [b1, b2]] = history;
        stateA = await relay(a, evidence, stateA, [b2, b2], 'a-child-before-missing-parent');
        stateB = await relay(b, evidence, stateB, [a2], 'b-child-before-missing-parent');
        for (const [page, state, local] of [[a, stateA, a2], [b, stateB, b2]]) {
          assert.equal(state.snapshot.replica.pending.length, 1);
          const outcome = await refresh(page); assertViews(outcome, state);
          assert.deepEqual(viewOf(outcome).headResumes.map((row) => row.payload), [local.payload]);
        }
        const staleA = expected(viewOf(await refresh(a)));
        stateA = await relay(a, evidence, stateA, [b2, b1, b1], 'a-reordered-parent-and-duplicates');
        stateB = await relay(b, evidence, stateB, [a1, a2, a1], 'b-reordered-parent-and-duplicates');
        assert.deepEqual(sortOps(stateA.snapshot.replica.operations), sortOps(stateB.snapshot.replica.operations));
        for (const [page, state] of [[a, stateA], [b, stateB]]) {
          assert.equal(state.snapshot.replica.pending.length, 0); assert.equal(state.snapshot.replica.quarantined.length, 0);
          const beforeRefresh = await exact(page, () => window.fixture.subject.current());
          assert.equal(viewOf(beforeRefresh).headResumes.length, 1, 'A relay cannot silently publish through the app');
          const outcome = await refresh(page); assertViews(outcome, state);
          assert.equal(viewOf(outcome).headResumes.length, 2); assert.equal(viewOf(outcome).projection.requiresChoice, true);
        }
        await refuse(a, evidence, { sessionId: a2.payload.sessionId, anchor: a2.payload.anchor, expected: staleA, selected: reference(a2) }, /reading-position-superseded/u, 'stale-choice-refused');
        const observed = expected(viewOf(await refresh(a)));
        await refuse(a, evidence, { sessionId: a2.payload.sessionId, anchor: anchor(100), expected: observed, selected: null }, /reading-position-choice-required/u, 'no-time-or-furthest-position-winner');
        await refuse(a, evidence, { sessionId: b2.payload.sessionId, anchor: anchor(61), expected: observed, selected: reference(b2) }, /reading-position-choice-not-current/u, 'selected-anchor-substitution-refused');
        const input = { sessionId: b2.payload.sessionId, anchor: b2.payload.anchor, expected: observed, selected: reference(b2) };
        const outcome = await save(a, input); assert.equal(outcome.status, 'active'); assert.equal(outcome.replayUiEffects, true);
        const chosen = await admit(a, evidence, 'a-explicit-exact-choice'); const operation = assertSaved(stateA, chosen, input, observed.heads); stateA = chosen;
        assertViews(outcome, stateA); assert.equal(viewOf(outcome).headResumes.length, 1);
        stateB = await relay(b, evidence, stateB, [operation, operation], 'b-receives-explicit-choice-twice');
        for (const [page, state, peer] of [[a, stateA, 'a'], [b, stateB, 'b']]) {
          const confirmed = await refresh(page); assertViews(confirmed, state);
          assert.equal(viewOf(confirmed).headResumes.length, 1); assert.deepEqual(viewOf(confirmed).headResumes[0].payload, operation.payload);
          await initialize(page, { peer, reopen: true });
          const reopened = await admit(page, evidence, `${peer}-reopened-after-choice`); assert.deepEqual(reopened.rows, state.rows); assertViews(await refresh(page), reopened);
        }
        assert.deepEqual(stateA.snapshot.replica.projection, stateB.snapshot.replica.projection);
      }, { pair: true });

      await test(CASES[1], async ([a, b], evidence, [initialA, initialB]) => {
        let stateA = initialA, stateB = initialB;
        for (const dimension of ['session', 'version']) {
          const first = { sessionId: 'synthetic-reading-session-1', anchor: anchor(8, { sourceId: `synthetic-${dimension}-preservation` }), expected: empty(), selected: null };
          assert.equal((await save(a, first)).status, 'active');
          let after = await admit(a, evidence, `${dimension}-first`); assertSaved(stateA, after, first, []); stateA = after;
          const second = { ...first, expected: expected(viewOf(await refresh(a), first.anchor.source.sourceId)),
            ...(dimension === 'session' ? { sessionId: 'synthetic-reading-session-2' } : { anchor: anchor(12, { sourceId: first.anchor.source.sourceId, versionId: 'synthetic-version-2', sha256: sha('Independent synthetic source version 2') }) }) };
          assert.equal((await save(a, second)).status, 'active');
          after = await admit(a, evidence, `${dimension}-different-preserved`); assertSaved(stateA, after, second, []); stateA = after;
          const outcome = await refresh(a); assertViews(outcome, stateA);
          assert.equal(viewOf(outcome, first.anchor.source.sourceId).headResumes.length, 2);
          await refuse(a, evidence, { ...second, expected: expected(viewOf(outcome, first.anchor.source.sourceId)) }, /reading-position-choice-required/u, `${dimension}-implicit-collapse-refused`);
        }
        const input = { sessionId: 'synthetic-identical-session', anchor: anchor(16, { sourceId: 'synthetic-identical-payload-source' }), expected: empty(), selected: null };
        const operations = [];
        for (const [page, before, peer] of [[a, stateA, 'a'], [b, stateB, 'b']]) {
          assert.equal((await save(page, input)).status, 'active');
          const after = await admit(page, evidence, `${peer}-identical-independent-save`); operations.push(assertSaved(before, after, input, []));
          if (peer === 'a') stateA = after; else stateB = after;
        }
        assert.equal(operations[0].payloadSha256, operations[1].payloadSha256); assert.notEqual(operations[0].opId, operations[1].opId);
        // A's new operation has a predecessor from other source histories. Relay
        // its complete persisted outbox so provenance becomes causally ready.
        stateA = await relay(a, evidence, stateA, [operations[1]], 'a-identical-provenance-relay');
        stateB = await relay(b, evidence, stateB, stateA.snapshot.outbox, 'b-complete-outbox-provenance-relay');
        for (const [page, state] of [[a, stateA], [b, stateB]]) {
          const outcome = await refresh(page); assertViews(outcome, state);
          const view = viewOf(outcome, input.anchor.source.sourceId); assert.equal(view.headResumes.length, 1); assert.equal(view.headResumes[0].operationRefs.length, 2);
        }
        const next = { ...input, anchor: anchor(18, input.anchor.source), expected: expected(viewOf(await refresh(a), input.anchor.source.sourceId)) };
        assert.equal((await save(a, next)).status, 'active');
        const after = await admit(a, evidence, 'identical-provenance-ordinary-advance'); assertSaved(stateA, after, next, next.expected.heads); assertViews(await refresh(a), after);
      }, { pair: true });

      await test(CASES[2], async ([a, b], evidence, [initialA, initialB]) => {
        const valid = { sessionId: 'synthetic-reading-session', anchor: anchor(0), expected: empty(), selected: null };
        const invalid = [
          { ...valid, actor: initialA.installation.actor }, { ...valid, binding: initialA.installation.binding },
          { ...valid, operations: [] }, { ...valid, permissions: [] }, { ...valid, text: 'No copied source text in a reading intent' },
          { ...valid, sessionId: '' }, { ...valid, selected: { opId: '0'.repeat(64), sha256: '0'.repeat(64) } },
          { ...valid, anchor: { ...valid.anchor, position: { ...valid.anchor.position, start: -1 } } },
          { ...valid, anchor: { ...valid.anchor, position: { ...valid.anchor.position, end: 257 } } },
          { ...valid, anchor: { ...valid.anchor, source: { ...source, sha256: 'no-digest' } } },
        ];
        for (let index = 0; index < invalid.length; index++) await refuse(a, evidence, invalid[index], null, `invalid-${index}`);
        const patch = await exact(a, async () => {
          try { return { accepted: await window.fixture.subject.write(() => ({ patch: {}, operations: [{ payload: { kind: 'reading.resume' } }] })) }; }
          catch (error) { return { refused: error.code || error.name }; }
        });
        assert.match(patch.refused, /invalid-patch/u); assert.deepEqual((await native(a)).rows, initialA.rows);
        assert.equal((await save(a, valid)).status, 'active');
        const saved = await admit(a, evidence, 'valid-before-synthetic-deletion'); const op = assertSaved(initialA, saved, valid, []);
        const receivedB = await relay(b, evidence, initialB, [op], 'b-receives-place-before-deletion');
        const tombstone = await exact(b, async ({ ref, sourceId, time }) => {
          const f = window.fixture; const before = (await f.instance.snapshot()).snapshot;
          const result = await f.instance.commitLocal({ changeId: 'explicit-synthetic-reading-deletion-fixture', binding: f.policy.binding,
            expectedRevision: before.revision, occurredAt: time, mutations: [], operations: [{
              payload: { kind: 'entity.tombstone', target: { kind: 'reading-position', id: sourceId }, reason: 'user-deleted' }, dependencies: [ref] }] });
          if (result.status !== 'active') throw new Error('Synthetic deletion commit failed');
          return (await f.instance.snapshot()).snapshot.replica.operations.find((row) => row.payload.kind === 'entity.tombstone');
        }, { ref: reference(op), sourceId: source.sourceId, time });
        const deletedB = await admit(b, evidence, 'b-durable-synthetic-tombstone'); rootsUnchanged(receivedB, deletedB);
        assert.equal((await receive(a, [tombstone], 'a-receives-synthetic-tombstone')).status, 'active');
        const deleted = await admit(a, evidence, 'a-native-deleted-reading-state'); rootsUnchanged(saved, deleted);
        const outcome = await refresh(a); assertViews(outcome, deleted); const view = viewOf(outcome);
        assert.equal(view.headResumes.length, 0); assert.equal(view.projection.tombstones.length, 1);
        await refuse(a, evidence, { ...valid, expected: expected(view) }, /reading-position-deleted/u, 'deleted-state-cannot-be-resurrected-by-save');
        evidence.observations.push({ name: 'generic-patch-cannot-emit-operations', outcome: patch });
      }, { pair: true });

      for (const mode of ['quota', 'abort']) await test(`native-${mode}-is-atomic`, async ([page], evidence, [initial]) => {
        const input = { sessionId: 'synthetic-failure-session', anchor: anchor(8), expected: empty(), selected: null };
        await armFault(page, mode); const outcome = await save(page, input);
        assert.equal(outcome.status, 'recovery-required');
        const fault = await faultState(page, true); assert.equal(fault.fired, 1); assert.equal(fault.durable, false); assert.equal(fault.aborted, true);
        assert(fault.putKinds.includes('document'), 'The fault must follow actual native puts');
        const after = await admit(page, evidence, `${mode}-native-abort-complete`); assert.deepEqual(after.rows, initial.rows);
        assert.equal(await page.evaluate(() => window.fixture.publications.length), 0);
        evidence.observations.push({ name: 'native-atomic-failure', fault, outcome });
        await initialize(page, { reopen: true }); assert.deepEqual((await native(page)).rows, initial.rows);
        assert.equal((await save(page, input)).status, 'active');
        const retried = await admit(page, evidence, `${mode}-new-owner-explicit-save`); assertSaved(initial, retried, input, []);
      });

      await test(CASES[5], async ([page], evidence, [initial]) => {
        const input = { sessionId: 'synthetic-lost-ack-session', anchor: anchor(20), expected: empty(), selected: null };
        await armFault(page, 'lost-ack'); await begin(page, input, 'synthetic-reading-lost-ack');
        await page.waitForFunction(() => window.__readingNativeFault?.durable);
        assert.equal(await page.evaluate(() => window.fixture.pending), true);
        const fault = await faultState(page, true); assert.equal(fault.fired, 1);
        const current = await exact(page, () => window.fixture.subject.current()); assert.equal(current.snapshot.readingViews.length, 0);
        const durable = await admit(page, evidence, 'durable-operation-with-unacknowledged-command'); const operation = assertSaved(initial, durable, input, []);
        await initialize(page, { reopen: true, kind: 'host' });
        const retry = await save(page, input, 'synthetic-reading-lost-ack');
        assert.equal(retry.status, 'active'); assert.equal(retry.receipt.outcome, 'duplicate'); assert.equal(retry.replayUiEffects, false);
        assert.deepEqual(retry.receipt.operations, [reference(operation)]);
        assert.deepEqual((await admit(page, evidence, 'reopen-exact-durable-duplicate')).rows, durable.rows);
        const conflict = await save(page, { ...input, anchor: anchor(22) }, 'synthetic-reading-lost-ack'); assert.equal(conflict.status, 'rejected'); assert.equal(conflict.code, 'command-id-conflict');
        assert.deepEqual((await native(page)).rows, durable.rows);
        evidence.observations.push({ name: 'lost-native-completion-exact-explicit-retry', fault, retry, conflict });
      }, { kind: 'host' });

      await test(CASES[6], async ([page], evidence, [initial]) => {
        const input = { sessionId: 'synthetic-old-owner-session', anchor: anchor(22), expected: empty(), selected: null };
        await armFault(page, 'owner-at-complete'); await begin(page, input, 'synthetic-invalidated-owner');
        await page.waitForFunction(() => window.fixture.pending === false);
        const outcome = await exact(page, () => window.fixture.outcome); assert.equal(outcome.status, 'recovery-required');
        const fault = await faultState(page, true); assert.equal(fault.fired, 1); assert.equal(fault.durable, true);
        assert.equal(outcome.lastCommitted.readingViews.length, 0); assert.equal(await page.evaluate(() => window.fixture.publications.length), 0);
        const durable = await admit(page, evidence, 'owner-invalidated-after-durable-command'); assertSaved(initial, durable, input, []);
        const blocked = await save(page, input); assert(['recovery-required', 'rejected'].includes(blocked.status)); assert.match(blocked.reason || blocked.code, /writer-required|session-changed/u);
        assert.deepEqual((await native(page)).rows, durable.rows);
        await initialize(page, { reopen: true }); const reopened = await admit(page, evidence, 'new-owner-observes-existing-place'); assert.deepEqual(reopened.rows, durable.rows); assertViews(await refresh(page), reopened);
        evidence.observations.push({ name: 'durable-old-owner-cannot-publish-or-write-again', outcome, fault, blocked });
      });

      await test(CASES[7], async ([page], evidence, [initial]) => {
        // The first place must originate in the normal learner UI on an empty
        // profile. No operation injection or synthetic record installation.
        assert.equal(initial.snapshot.replica.operations.length, 0);
        const articleId = 'bunki-graded-n3-river';
        const article = page.locator(`[data-passage="${articleId}"] .shelf-open`);
        assert(await article.count(), 'Normal shelf requires an article opener');
        await article.click(); await page.locator('#reader .tok').first().waitFor();
        const saveButton = page.locator('#reader-place-save'); assert.equal(await saveButton.count(), 1, 'Normal reader reading-position action missing');
        const word = page.locator('#reader .tok.content').nth(2);
        const tokenIndex = Number(await word.getAttribute('data-index'));
        const passage = JSON.parse(readFileSync(resolve(retainedSite, `data/articles/${articleId}.json`), 'utf8'));
        let cursor = 0, start, end;
        for (let index = 0; index <= tokenIndex; index++) {
          start = passage.text.indexOf(passage.tokens[index].s, cursor); assert(start >= cursor);
          end = start + passage.tokens[index].s.length; cursor = end;
        }
        const sourceSha256 = sha(passage.text);
        const expectedAnchor = { source: { sourceId: `bundled-reading:${articleId}`, versionId: `bundled-text-sha256:${sourceSha256}`, sha256: sourceSha256 },
          position: { kind: 'text', unit: 'utf16', start, end, bodyLength: passage.text.length } };
        await word.click();
        assert.equal(await saveButton.isEnabled(), true);
        // Touching a word has its own legitimate observation command. Admit
        // that actual durable row before isolating the bookmark transaction.
        // A UI click acknowledgement alone is not a record-commit barrier.
        await waitForAppRecord(page, (record) => record.obslog.some((row) => row[1] === 'tap' && row[2] === `word:${passage.tokens[tokenIndex].b}` && row[4] === articleId),
          { description: 'the normal touched-word observation, before saving a reading place' });
        const before = await admit(page, evidence, 'ui-reader-before-first-position-save');
        await saveButton.click();
        await page.waitForFunction(() => !document.querySelector('#reader-place-save')?.hasAttribute('data-pending'));
        const after = await admit(page, evidence, 'ui-first-native-position-command');
        const added = after.snapshot.replica.operations.filter((row) => !before.snapshot.replica.operations.some((old) => old.opId === row.opId));
        assert.equal(added.length, 1); assert.equal(added[0].payload.kind, 'reading.resume');
        assert.deepEqual(added[0].payload.anchor, expectedAnchor, 'The normal touched word must bind its exact UTF-16 source range and independently hashed bundled text');
        const input = { sessionId: added[0].payload.sessionId, anchor: added[0].payload.anchor, expected: empty(), selected: null };
        assertSaved(before, after, input, []);
        const surface = page.locator('#record-reading-places'); assert.equal(await surface.count(), 1);
        await page.waitForFunction((opId) => document.querySelector(`[data-reading-return="${opId}"]`)?.disabled === false, added[0].opId);
        const buttons = surface.locator('[data-reading-return]'); assert.equal(await buttons.count(), 1);
        await buttons.first().click();
        await page.locator('#reader .tok').first().waitFor();
        await page.waitForFunction((index) => document.activeElement?.matches(`#reader .tok[data-index="${index}"]`), tokenIndex);
        assert.equal(await page.locator('#reader-place-save').isDisabled(), true, 'Returning cannot silently select a new learner capture target');
        assert.equal(await page.locator('#reader-take').isDisabled(), true, 'Returning cannot select a word to memorize');
        assert.equal(await page.locator('#reader-take').getAttribute('aria-pressed'), 'false');
        const returned = await admit(page, evidence, 'ui-return-from-confirmed-position'); rootsUnchanged(after, returned);
        assert.deepEqual(returned.snapshot.replica.operations, after.snapshot.replica.operations, 'Returning to a sole saved place cannot mint reading or learning evidence');
        await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1');
        const reopened = await admit(page, evidence, 'ui-reopened-position');
        assert.deepEqual(reopened.snapshot.replica.operations, returned.snapshot.replica.operations);
        evidence.observations.push({ name: 'clean-profile-normal-reader-save', operation: reference(added[0]), anchor: added[0].payload.anchor,
          syntheticRelayUsed: false, physicalDeviceAcceptance: false });
      }, { kind: 'ui' });
    } finally { await browser.close(); }
  }
} finally {
  await new Promise((done) => server.close(done));
  const pass = results.length === ENGINES.length * (FILTER ? 1 : CASES.length) && results.every((row) => row.pass) && !errors.length && !externalRequests.length;
  writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify({ suite: 'record-reading-position', version: 1, mode: FILTER ? 'filtered' : 'full', pass,
    artifactSha256: manifest.artifactSha256, sourceAssetSha256: manifest.sourceAssetSha256, verifierSha256,
    testedSite: retainedSite, selectedSite: SITE, sourceCopies, modules: manifest.modules,
    engines: ENGINES, browserVersions, startedAt, completedAt: new Date().toISOString(), results, errors, externalRequests,
    limitations: [
      'Synthetic same-account admission and exact local relay only; no live account authentication, remote transport, CloudKit, or physical native-device acceptance.',
      'Actual rendered app/RecordController/RecordApp/RecordHost and genuine browser IndexedDB/Web Locks; only fixture source admission, explicit relay delivery and native fault timing are authored.',
      'Host and app share pure reading intent semantics; direct independent assertions cover emitted anchor, payload, dependencies, supersedes, durable receipt and unchanged learner roots.',
      'A source digest identifies declared content bytes. Structural fixture acceptance does not establish source availability, permission, comprehension, completion or review credit.',
      'Explicit uncertain-acknowledgement retry uses the host command ID; the app and UI do not silently retry unacknowledged saves.',
      'Only observations before a recorded failure phase executed in a failing case.',
    ] }, null, 2) + '\n');
}
assert.equal(results.length, ENGINES.length * (FILTER ? 1 : CASES.length));
assert(results.every((row) => row.pass), 'Reading-position runtime journeys failed');
assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
