/** Real browser async host fixtures. No operator record, credential, transport,
 * or live migration is used. The runtime comes from the canonical stage. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorSite, resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const EVIDENCE = resolveCorridorEvidence();
const SITE = resolveCorridorSite();
const ENGINES = process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER || 'chromium'];
assert(ENGINES.every((engine) => ['chromium', 'webkit'].includes(engine)));
for (const ENGINE of ENGINES) {
const OUT = ENGINES.length > 1 ? resolve(EVIDENCE, ENGINE) : EVIDENCE;
const FILTER = process.argv.find((arg) => arg.startsWith('--case='))?.slice(7);
const CONTROLLER = readFileSync(resolve(SITE, 'record-controller.mjs'));
const CORE = readFileSync(resolve(SITE, 'modules/record-core.mjs'));
const HOST = readFileSync(resolve(SITE, 'record-host.mjs'));
const manifest = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const runtimeFiles = new Map([['record-host.mjs', HOST], ['record-controller.mjs', CONTROLLER], ['modules/record-core.mjs', CORE]]);
for (const [name, bytes] of runtimeFiles) assert.equal(manifest.files.find((file) => file.path === name)?.sha256, sha(bytes));
const startedAt = new Date().toISOString();
const results = [];
const errors = [];
const network = [];
const policy = {
  binding: { accountId: 'synthetic-account', learnerId: 'synthetic-learner', sessionId: 'synthetic-session' },
  schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1',
};
const actor = { deviceId: 'synthetic-mac', incarnationId: 'synthetic-installation' };
const record = JSON.parse('{"v":1,"taken":[],"srs":{},"revlog":[],"obslog":[],"__proto__":{"keep":"own-key"},"constructor":{"keep":"original"},"futureRoot":{"nested":{"keep":"unknown-json"}}}');
record.aiChat = Array.from({ length: 40 }, (_, index) => ({ role: index % 2 ? 'tutor' : 'user', text: `Original chat ${index}`, future: { context: index } }));
record.aiReadings = Array.from({ length: 20 }, (_, index) => ({ text: `Original article ${index}`, lv: 'N3', ts: 1700000000000 + index, candidates: { v: 1, wordIds: ['犬'] }, future: { source: index } }));
record.aiReading = null;
record.assessmentLibrary = { format: 'kairo-assessment-library', v: 1,
  scope: { accountId: policy.binding.accountId, learnerId: policy.binding.learnerId },
  forms: [], attempts: [], activeAttemptId: null, legacyEvidence: [] };
record.ai = { model: 'old-model-metadata', baseUrl: 'https://synthetic-provider.invalid', key: 'SYNTHETIC-SECRET-IN-LEGACY-AI' };
const archiveRows = Array.from({ length: 60 }, (_, index) => ({
  format: 'kairo-archive-row', v: 1, id: index * 2 + 1,
  turn: { id: index === 0 ? Number.MAX_SAFE_INTEGER : index === 1 ? '__proto__' : index === 2 ? 'constructor' : `turn-${index}`,
    surface: index % 2 ? 'word-tutor' : 'chat', role: index % 3 ? 'assistant' : 'user',
    content: `Original full archive ${index}`, ts: 1700000000000 + (index % 3), xid: `exchange-${Math.floor(index / 2)}`,
    contextRef: `word:犬-${index}`, future: { preserve: index } },
}));
const originalText = JSON.stringify(record, null, 2);
const pageHtml = `<!doctype html><meta charset="utf-8"><title>Synthetic migration fixture</title>
<script type="module">
import * as controller from '/record-controller.mjs';
import * as core from '/modules/record-core.mjs';
import * as host from '/record-host.mjs';
window.fixture = { controller, core, host };
</script>`;
const server = createServer((request, response) => {
  response.setHeader('cache-control', 'no-store');
  if (request.url === '/record-controller.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(CONTROLLER); }
  else if (request.url === '/record-host.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(HOST); }
  else if (request.url === '/modules/record-core.mjs') { response.setHeader('content-type', 'text/javascript'); response.end(CORE); }
  else if (request.url === '/fixture') { response.setHeader('content-type', 'text/html'); response.end(pageHtml); }
  else {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(SITE, path === '/' ? 'index.html' : path.slice(1));
    if (!file.startsWith(`${SITE}/`) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('content-type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
    response.end(readFileSync(file));
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await ({ chromium, webkit }[ENGINE]).launch(ENGINE === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {});
const browserVersion = browser.version();

/** Execute only authored fixture functions. Both arguments and results cross as
 * JSON text because Playwright's object codec does not preserve own __proto__
 * keys. No fetched source or user text is executed as JavaScript. */
async function evaluateExact(page, action, argument) {
  const text = await page.evaluate(async ({ source, input }) => {
    const run = (0, eval)(`(${source})`);
    return JSON.stringify({ value: await run(JSON.parse(input).value) });
  }, { source: String(action), input: JSON.stringify({ value: argument }) });
  return JSON.parse(text).value;
}

async function fixturePage(context) {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/fixture`);
  await page.waitForFunction(() => !!window.fixture);
  return page;
}
async function seed(page) {
  await evaluateExact(page, async ({ recordText, rows }) => {
    localStorage.setItem('kairo-corridor-v1', recordText);
    localStorage.setItem('kairo-ai-key', 'SYNTHETIC-DEVICE-ONLY-LEGACY-KEY');
    localStorage.setItem('kairo-ai-provider-v1', JSON.stringify({ v: 1, baseUrl: 'https://synthetic-provider.invalid', model: 'synthetic', credential: { origin: 'https://synthetic-provider.invalid', key: 'SYNTHETIC-BOUND-DEVICE-KEY' } }));
    const db = await new Promise((done, fail) => {
      const request = indexedDB.open('kairo-ai-log', 3);
      request.onupgradeneeded = () => {
        const turns = request.result.createObjectStore('turns', { keyPath: 'id', autoIncrement: true });
        turns.createIndex('logical-id', 'turn.id');
        request.result.createObjectStore('imports', { keyPath: 'id' });
      };
      request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error);
    });
    await new Promise((done, fail) => {
      const tx = db.transaction('turns', 'readwrite', { durability: 'strict' });
      for (const row of rows) tx.objectStore('turns').add(row);
      tx.oncomplete = done; tx.onabort = () => fail(tx.error);
    });
    db.close();
  }, { recordText: originalText, rows: archiveRows });
}
async function own(page) {
  await evaluateExact(page, async ({ policy, actor }) => {
    let token = { ownerId: crypto.randomUUID(), epoch: 1, sessionId: policy.binding.sessionId };
    let owned = false;
    let release;
    await new Promise((done, fail) => {
      navigator.locks.request('kairo-record:kairo-corridor-v1:kairo-ai-log', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) { fail(new Error('Synthetic writer did not acquire record lock')); return; }
        owned = true;
        const lifetime = new Promise((resolve) => { release = resolve; });
        done(); await lifetime;
      }).catch(fail);
    });
    window.fixture.writer = { capture: () => ({ ...token }), assert: (captured) => owned && captured.ownerId === token.ownerId && captured.epoch === token.epoch && captured.sessionId === token.sessionId };
    window.fixture.release = () => { owned = false; token = { ...token, epoch: token.epoch + 1 }; release(); };
    window.fixture.changeSession = () => { token = { ...token, sessionId: 'different-session' }; };
    window.fixture.policy = policy; window.fixture.actor = actor;
    window.addEventListener('pagehide', window.fixture.release, { once: true });
  }, { policy, actor });
}
async function open(page) {
  await evaluateExact(page, async () => {
    const f = window.fixture;
    f.instance = await f.controller.createRecordController({ databaseName: 'synthetic-record-target', policy: f.policy, actor: f.actor, writer: f.writer });
  });
}
async function prepare(page) {
  return evaluateExact(page, async () => {
    const f = window.fixture;
    f.source = await f.controller.captureLegacySource(f.writer);
    return f.instance.prepare(f.source, { migrationId: 'migration-a' });
  });
}
async function activate(page) { return evaluateExact(page, () => window.fixture.instance.activate('migration-a')); }
async function disk(page) {
  return evaluateExact(page, async () => {
    const read = async (name, store) => {
      const db = await new Promise((done, fail) => { const req = indexedDB.open(name); req.onsuccess = () => done(req.result); req.onerror = () => fail(req.error); });
      try { return await new Promise((done, fail) => { const tx = db.transaction(store, 'readonly'); const rows = tx.objectStore(store).getAll(); tx.oncomplete = () => done(rows.result); tx.onabort = () => fail(tx.error); }); }
      finally { db.close(); }
    };
    return { text: localStorage.getItem('kairo-corridor-v1'), rows: await read('kairo-ai-log', 'turns'), target: await read('synthetic-record-target', 'kairo_replication_rows'),
      provider: localStorage.getItem('kairo-ai-provider-v1'), oldKey: localStorage.getItem('kairo-ai-key') };
  });
}

const time = '2026-09-10T00:00:00.000Z';
const meta = (changeId) => ({ changeId, occurredAt: time });
async function openHost(page, { failReducer = false, otherBinding = false } = {}) {
  return evaluateExact(page, async ({ failReducer, otherBinding }) => {
    const f = window.fixture; f.reducerCalls = 0;
    // The host is storage infrastructure: production supplies Corridor's domain
    // validators. These fixture validators define only the synthetic test domain.
    const validateRecord = (record) => record?.v === 1 && Array.isArray(record.taken) &&
      (record.obslog === undefined || Array.isArray(record.obslog)) && !record.invalidFixture;
    const validateArchive = (rows) => Array.isArray(rows) && rows.every((row) =>
      ['user', 'assistant', 'tutor', 'app'].includes(row.role) && typeof row.content === 'string' &&
      typeof row.surface === 'string' && row.surface.length && Number.isSafeInteger(row.ts) && row.ts > 0);
    f.validators = { validateRecord, validateArchive };
    f.hostOptions = { controller: f.instance, binding: otherBinding ? { ...f.policy.binding, accountId: 'different-local-account' } : f.policy.binding,
      writer: f.writer, validateRecord, validateArchive, reducers: {
        'fixture.patch/1': (_, input) => { f.reducerCalls++; if (failReducer) throw new Error('Retry must not execute reducer'); return { patch: input }; },
        'fixture.increment/1': ({ record }, input) => { f.reducerCalls++; if (failReducer) throw new Error('Retry must not execute reducer');
          return { patch: { fixtureCounter: (record.fixtureCounter || 0) + input.by } }; },
        'fixture.too-large/1': () => ({ patch: { largeFixture: '大'.repeat(33 * 1024 * 1024) } }),
        'fixture.async/1': async () => ({ patch: { invalidAsync: true } }),
      } };
    f.app = await f.host.createRecordHost(f.hostOptions);
    return f.app.current();
  }, { failReducer, otherBinding });
}
async function dispatch(page, type, input, changeId) {
  return JSON.parse(await evaluateExact(page, async (command) => JSON.stringify(await window.fixture.app.dispatch(command)), { ...meta(changeId), type, input }));
}
// The browser's JSON contract is the backup contract. Playwright's object
// transport can drop an own __proto__ key; transport exact JSON text instead.
async function hostSnapshot(page) { return JSON.parse(await evaluateExact(page, async () => JSON.stringify(await window.fixture.app.snapshot()))); }
async function exportBackup(page) { return JSON.parse(await evaluateExact(page, async () => JSON.stringify(await window.fixture.app.exportBackup()))); }
async function remoteJournalBackup(page, segments = [{ kind: 'original', text: 'Original offline backup note' }]) {
  return evaluateExact(page, async ({ time, segments }) => {
    const f = window.fixture;
    const source = await f.core.IndexedDbReplicationStore.open({ databaseName: 'host-backup-source',
      policy: { ...f.policy, binding: { ...f.policy.binding, sessionId: 'source-session' } },
      actor: { deviceId: 'backup-phone', incarnationId: 'backup-installation' } });
    try {
      const state = await source.snapshot();
      await source.commitLocal({ changeId: 'original-backup-note', binding: state.policy.binding,
        expectedRevision: state.revision, occurredAt: time, mutations: [], operations: [{ dependencies: [],
          payload: { kind: 'note.version', noteId: 'backup-note', versionId: 'backup-version', generation: null,
            supersedes: [], segments } }] });
      const journal = f.core.exportOperationJournal((await source.snapshot()).replica);
      const backup = structuredClone((await f.app.exportBackup()).backup);
      backup.version = 2; backup.journal = journal; backup.counts.syncOperations = journal.operations.length;
      backup.record.restoredUnknown = { original: ['complete portable root', { keep: true }] };
      backup.archive.turns[0].content = 'Full restored archive, independent of journal';
      for (const key of ['record', 'archive', 'journal']) backup.sha256[key] = f.core.encodeLocalJson(backup[key]).sha256;
      return backup;
    } finally { await source.close(); }
  }, { time, segments });
}
const quoteSegments = [{ kind: 'source-quote', text: 'Synthetic quoted text',
  source: { sourceId: 'synthetic-source', versionId: 'synthetic-source-v1', sha256: 'a'.repeat(64) },
  position: { kind: 'text', unit: 'utf16', start: 0, end: 21, bodyLength: 21 },
  deviceSyncBasis: { basisId: 'unverified-declared-basis', policyVersion: 'synthetic-source-policy/1' } }];
async function arm(page, mode) {
  await evaluateExact(page, (mode) => {
    const f = window.fixture;
    const transaction = window.IDBDatabase.prototype.transaction;
    const put = window.IDBObjectStore.prototype.put;
    let armed = true;
    f.fault = { fired: false, mode };
    window.IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (this.name === 'synthetic-record-target' && args[1] === 'readwrite') tx.addEventListener('complete', (event) => {
        if (!armed || !tx.__hostCommand) return;
        armed = false; f.fault.fired = true;
        f.fault.currentAtDurableBoundary = f.app.current();
        // Intercept native completion before the adapter observes it. The
        // durable transaction is then reopened by a new real page/owner.
        if (mode === 'lost-ack') event.stopImmediatePropagation();
        if (mode === 'writer-lost') f.release();
        if (mode === 'rogue-source') localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1, taken: [], rogue: 'preserved-foreign-write' }));
        if (mode === 'crash') {
          // eslint-disable-next-line no-debugger -- Pause at actual commit before crashing the fixture renderer.
          debugger;
        }
      });
      return tx;
    };
    window.IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (!armed || this.name !== 'kairo_replication_rows' || args[0]?.kind !== 'document') return request;
      const document = JSON.parse(args[0].text);
      if (document.collection !== 'kairo:record-host-commands') return request;
      this.transaction.__hostCommand = true;
      if (mode === 'quota') { f.fault.fired = true; armed = false; throw new DOMException('Synthetic quota fault after real puts', 'QuotaExceededError'); }
      if (mode === 'abort') request.addEventListener('success', () => { f.fault.fired = true; armed = false; this.transaction.abort(); });
      return request;
    };
    f.disarm = () => { armed = false; window.IDBDatabase.prototype.transaction = transaction; window.IDBObjectStore.prototype.put = put; };
  }, mode);
}
async function test(name, body, { active = true } = {}) {
  if (FILTER && FILTER !== name) return;
  const started = Date.now();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    network.push(url.origin); return route.abort();
  });
  try {
    const page = await fixturePage(context); await seed(page); await own(page); await open(page); await prepare(page);
    if (active) await activate(page);
    await openHost(page);
    await body({ context, page });
    results.push({ name, status: 'passed' });
  } catch (error) { results.push({ name, status: 'failed', error: String(error.stack || error) }); }
  finally { await context.close(); process.stdout.write(`${results.at(-1).status}: ${name} (${Date.now() - started} ms)\n`); }
}

try {
  await test('first-commit-preserves-all-unknown-roots-and-archive', async ({ page }) => {
    const before = await disk(page);
    const original = (await hostSnapshot(page)).snapshot;
    const changed = await dispatch(page, 'fixture.patch/1', { displaySetting: { size: 2 } }, 'first');
    assert.equal(changed.status, 'active'); assert.equal(changed.receipt.outcome, 'committed'); assert.equal(changed.replayUiEffects, true);
    const expected = { ...original.record, displaySetting: { size: 2 } };
    assert.deepEqual(changed.snapshot.record, expected); assert.deepEqual(changed.snapshot.archive, original.archive);
    assert.equal(changed.snapshot.record['__proto__'].keep, 'own-key'); assert.equal(changed.snapshot.record.constructor.keep, 'original');
    const after = await disk(page); assert.equal(after.text, before.text); assert.deepEqual(after.rows, before.rows);
    assert.equal(after.provider, before.provider); assert.equal(after.oldKey, before.oldKey);
    const core = await evaluateExact(page, () => window.fixture.instance.snapshot());
    assert.equal(core.snapshot.outbox.length, 0); assert.equal(core.snapshot.actor.sequence, 0); assert.equal(core.snapshot.replica.operations.length, 0);
  });
  await test('two-queued-observation-appends-preserve-both', async ({ page }) => {
    const result = await evaluateExact(page, async (time) => {
      const f = window.fixture;
      const first = f.app.appendObservations({ changeId: 'observation-a', occurredAt: time }, [[10, 'fixture', 'a']]);
      const second = f.app.appendObservations({ changeId: 'observation-b', occurredAt: time }, [[9, 'fixture', 'b']]);
      return { receipts: await Promise.all([first, second]), current: await f.app.snapshot() };
    }, time);
    assert(result.receipts.every((outcome) => outcome.status === 'active'));
    assert.deepEqual(result.current.snapshot.record.obslog, [[10, 'fixture', 'a'], [9, 'fixture', 'b']]);
    assert.equal(result.receipts[1].receipt.committedRevision, result.receipts[0].receipt.committedRevision + 1);
  });
  await test('queued-reducers-read-latest-committed-root-and-preserve-other-roots', async ({ page }) => {
    const result = await evaluateExact(page, async (time) => {
      const f = window.fixture;
      const work = [f.app.dispatch({ changeId: 'increment-a', type: 'fixture.increment/1', occurredAt: time, input: { by: 1 } }),
        f.app.dispatch({ changeId: 'setting-b', type: 'fixture.patch/1', occurredAt: time, input: { anotherRoot: { keep: 'b' } } }),
        f.app.dispatch({ changeId: 'increment-c', type: 'fixture.increment/1', occurredAt: time, input: { by: 2 } })];
      const outcomes = await Promise.all(work); return { outcomes, current: f.app.current(), calls: f.reducerCalls };
    }, time);
    assert(result.outcomes.every((outcome) => outcome.status === 'active')); assert.equal(result.calls, 3);
    assert.equal(result.current.snapshot.record.fixtureCounter, 3); assert.deepEqual(result.current.snapshot.record.anotherRoot, { keep: 'b' });
    assert.equal(result.current.snapshot.record.futureRoot.nested.keep, 'unknown-json');
  });
  await test('input-is-copied-before-queue-and-published-snapshots-are-immutable', async ({ page }) => {
    const result = await evaluateExact(page, async (time) => {
      const f = window.fixture; const input = { mutableInput: { value: 'captured' } };
      const work = f.app.dispatch({ changeId: 'copy', type: 'fixture.patch/1', occurredAt: time, input }); input.mutableInput.value = 'changed-after-dispatch';
      const outcome = await work; const current = f.app.current();
      return { outcome, frozen: Object.isFrozen(current.snapshot.record) && Object.isFrozen(current.snapshot.record.mutableInput) };
    }, time);
    assert.equal(result.outcome.snapshot.record.mutableInput.value, 'captured'); assert.equal(result.frozen, true);
  });
  await test('proposed-roots-are-not-published-at-idb-commit-before-acknowledgement', async ({ page }) => {
    const before = await hostSnapshot(page); await arm(page, 'observe');
    const after = await dispatch(page, 'fixture.patch/1', { publishedOnlyAfterReceipt: true }, 'publish');
    const fault = await evaluateExact(page, () => window.fixture.fault);
    assert.equal(fault.fired, true); assert.deepEqual(fault.currentAtDurableBoundary, before);
    assert.equal(after.snapshot.record.publishedOnlyAfterReceipt, true);
  });
  for (const mode of ['quota', 'abort']) await test(`failed-${mode}-rolls-back-record-archive-and-command-receipt`, async ({ page }) => {
    const before = await disk(page); const current = await hostSnapshot(page); await arm(page, mode);
    const failure = await dispatch(page, 'fixture.patch/1', { mustNotExist: true }, `failed-${mode}`);
    assert.equal(failure.status, 'recovery-required'); assert.equal(await evaluateExact(page, () => window.fixture.fault.fired), true);
    assert.deepEqual(failure.lastCommitted, current.snapshot);
    await evaluateExact(page, () => window.fixture.disarm()); assert.deepEqual(await disk(page), before);
    const retried = await dispatch(page, 'fixture.patch/1', { mustNotExist: true }, `failed-${mode}`);
    assert.equal(retried.receipt.outcome, 'committed'); assert.equal(retried.snapshot.record.mustNotExist, true);
  });
  await test('lost-writer-after-commit-preserves-receipt-without-publishing-new-ui-state', async ({ page, context }) => {
    const before = await hostSnapshot(page); await arm(page, 'writer-lost');
    const result = await dispatch(page, 'fixture.increment/1', { by: 1 }, 'lost-writer');
    assert.equal(result.status, 'recovery-required'); assert.equal(result.targetCommitDurable, true);
    assert.deepEqual(result.lastCommitted, before.snapshot);
    const next = await fixturePage(context); await own(next); await open(next); await openHost(next, { failReducer: true });
    const retry = await dispatch(next, 'fixture.increment/1', { by: 1 }, 'lost-writer');
    assert.equal(retry.receipt.outcome, 'duplicate'); assert.equal(retry.replayUiEffects, false); assert.equal(retry.snapshot.record.fixtureCounter, 1);
  });
  await test('lost-ack-reload-retry-does-not-rerun-reducer-or-replay-old-effects', async ({ page }) => {
    await evaluateExact(page, () => {
      const f = window.fixture; const real = f.instance.commitLocal.bind(f.instance);
      f.instance.commitLocal = async (request) => { await real(request); throw new Error('Synthetic lost application acknowledgement'); };
    });
    const failed = await dispatch(page, 'fixture.increment/1', { by: 3 }, 'uncertain'); assert.equal(failed.status, 'recovery-required');
    await page.reload(); await page.waitForFunction(() => !!window.fixture); await own(page); await open(page); await openHost(page, { failReducer: true });
    const retry = await dispatch(page, 'fixture.increment/1', { by: 3 }, 'uncertain');
    assert.equal(retry.receipt.outcome, 'duplicate'); assert.equal(retry.replayUiEffects, false); assert.equal(retry.snapshot.record.fixtureCounter, 3);
    assert.equal(await evaluateExact(page, () => window.fixture.reducerCalls), 0);
  });
  await test('queued-old-owner-command-cannot-run-under-next-owner', async ({ page, context }) => {
    await arm(page, 'writer-lost');
    const result = await evaluateExact(page, async (time) => {
      const f = window.fixture;
      const one = f.app.appendObservations({ changeId: 'old-one', occurredAt: time }, [[1, 'first']]);
      const two = f.app.appendObservations({ changeId: 'old-two', occurredAt: time }, [[2, 'second']]);
      return Promise.allSettled([one, two]);
    }, time);
    assert.equal(result[0].value.status, 'recovery-required'); assert.equal(result[1].status, 'rejected');
    const next = await fixturePage(context); await own(next); await open(next); await openHost(next);
    assert.deepEqual((await hostSnapshot(next)).snapshot.record.obslog, [[1, 'first']]);
  });
  await test('reused-id-with-changed-input-type-or-time-fails-without-mutation', async ({ page }) => {
    await dispatch(page, 'fixture.increment/1', { by: 1 }, 'id-once'); const before = await disk(page);
    for (const command of [{ ...meta('id-once'), type: 'fixture.increment/1', input: { by: 2 } },
      { ...meta('id-once'), type: 'fixture.patch/1', input: { by: 1 } },
      { ...meta('id-once'), occurredAt: '2026-09-10T00:00:01.000Z', type: 'fixture.increment/1', input: { by: 1 } }])
      await assert.rejects(evaluateExact(page, (value) => window.fixture.app.dispatch(value), command), /command-id-conflict/u);
    assert.deepEqual(await disk(page), before);
  });
  await test('duplicate-receipt-returns-current-authority-not-an-old-historical-snapshot', async ({ page }) => {
    const first = await dispatch(page, 'fixture.increment/1', { by: 1 }, 'history-one');
    await dispatch(page, 'fixture.increment/1', { by: 10 }, 'history-two');
    const retry = await dispatch(page, 'fixture.increment/1', { by: 1 }, 'history-one');
    assert.equal(retry.receipt.committedRevision, first.receipt.committedRevision); assert.equal(retry.snapshot.record.fixtureCounter, 11);
    assert.equal(retry.receipt.outcome, 'duplicate'); assert.equal(retry.replayUiEffects, false);
  });
  await test('archive-append-preserves-order-and-stable-logical-ids-through-retry-and-export', async ({ page }) => {
    const turns = [{ surface: 'chat', role: 'user', content: 'Later prompt', ts: 10, xid: 'append', contextRef: 'context:犬' },
      { surface: 'chat', role: 'assistant', content: 'Clock rollback reply', ts: 9, xid: 'append', contextRef: 'context:犬' }];
    const first = await evaluateExact(page, ({ command, turns }) => window.fixture.app.appendArchive(command, turns), { command: meta('archive'), turns });
    const retry = await evaluateExact(page, ({ command, turns }) => window.fixture.app.appendArchive(command, turns), { command: meta('archive'), turns });
    assert.equal(first.snapshot.archive.turns.length, 62); assert.equal(retry.receipt.outcome, 'duplicate');
    const backup = (await exportBackup(page)).backup;
    assert.deepEqual(backup.archive.turns.slice(0, 60), archiveRows.map((row) => row.turn));
    assert.deepEqual(backup.archive.turns.slice(60).map((turn) => Object.fromEntries(Object.entries(turn).filter(([key]) => key !== 'id'))), turns);
    assert.equal(new Set(backup.archive.turns.slice(60).map((turn) => turn.id)).size, 2);
    const before = await disk(page);
    await assert.rejects(evaluateExact(page, ({ command, turns }) => window.fixture.app.appendArchive(command, turns),
      { command: meta('duplicate-id'), turns: [archiveRows[0].turn] }), /archive-id-conflict/u);
    assert.deepEqual(await disk(page), before);
  });
  await test('export-queues-behind-writes-and-contains-only-portable-record-and-full-archive', async ({ page }) => {
    const result = await evaluateExact(page, async (time) => {
      const f = window.fixture;
      const append = f.app.appendObservations({ changeId: 'before-backup', occurredAt: time }, [[1, 'backup-observation']]);
      const backup = f.app.exportBackup(); return { append: await append, exported: await backup };
    }, time);
    const backup = result.exported.backup;
    assert.deepEqual(backup.record.obslog, [[1, 'backup-observation']]); assert.equal(result.exported.revision, result.append.receipt.committedRevision);
    assert.deepEqual(Object.keys(backup).sort(), ['archive', 'completeness', 'counts', 'format', 'record', 'sha256', 'version']);
    assert.deepEqual(backup.counts, { archiveTurns: 60, chatTurns: 40, readingVersions: 20 });
    for (const secret of ['SYNTHETIC-SECRET', 'SYNTHETIC-BOUND', 'SYNTHETIC-DEVICE', 'kairo-local-command-receipt', 'kairo-local-custody'])
      assert(!JSON.stringify(backup).includes(secret));
  });
  await test('active-restore-is-atomic-and-preserves-actor-outbox-inbox-checkpoints-and-private-custody', async ({ page }) => {
    const result = await evaluateExact(page, async (time) => {
      const f = window.fixture;
      const note = { kind: 'note.version', noteId: 'kept-local-note', versionId: 'kept-version', generation: null, supersedes: [], segments: [{ kind: 'original', text: 'Explicit synthetic pending note' }] };
      let current = (await f.instance.snapshot()).snapshot;
      await f.instance.commitLocal({ changeId: 'unmapped-host-preserves-this', binding: f.policy.binding, expectedRevision: current.revision,
        occurredAt: time, mutations: [{ kind: 'put', collection: 'unrelated-local-data', id: 'keep', value: 'preserve me' }], operations: [{ payload: note, dependencies: [] }] });
      const remote = await f.core.IndexedDbReplicationStore.open({ databaseName: 'synthetic-remote', policy: f.policy, actor: { deviceId: 'synthetic-phone', incarnationId: 'phone-install' } });
      await remote.commitLocal({ changeId: 'phone-change', binding: f.policy.binding, expectedRevision: 0, occurredAt: time,
        mutations: [], operations: [{ payload: { ...note, noteId: 'remote-note', versionId: 'remote-version' }, dependencies: [] }] });
      const ops = (await remote.snapshot()).outbox; await remote.close(); current = (await f.instance.snapshot()).snapshot;
      await f.instance.commitReceive({ deliveryId: 'phone-delivery', expectedRevision: current.revision,
        delivery: { binding: f.policy.binding, operations: ops }, checkpoint: { channelId: 'phone', expected: null, next: 'kept-cursor' } });
      const before = (await f.instance.snapshot()).snapshot;
      const backup = structuredClone((await f.app.exportBackup()).backup);
      backup.record.restoredRoot = { durable: true }; backup.record.aiChat[0].text = 'Restored full chat';
      backup.archive.turns[59].content = 'Restored full unreferenced archive';
      backup.sha256.record = f.core.encodeLocalJson(backup.record).sha256; backup.sha256.archive = f.core.encodeLocalJson(backup.archive).sha256;
      const custodyBefore = await f.instance.localCustody();
      const restored = await f.app.restore({ changeId: 'restore-a', occurredAt: time }, backup);
      const after = (await f.instance.snapshot()).snapshot;
      const exported = (await f.app.exportBackup()).backup;
      return { before, after, restored, backup, exported, custodyBefore, custodyAfter: await f.instance.localCustody() };
    }, time);
    assert.equal(result.restored.status, 'active'); assert.deepEqual(result.exported, result.backup);
    assert.deepEqual(result.custodyAfter, result.custodyBefore);
    for (const key of ['actor', 'outbox', 'acknowledgedOutbox', 'inbox', 'checkpoints', 'replica', 'policy']) assert.deepEqual(result.after[key], result.before[key]);
    assert.equal(result.after.outbox.length, 1); assert.equal(result.after.inbox.length, 1);
    assert.deepEqual(result.after.documents.find((row) => row.collection === 'unrelated-local-data'), result.before.documents.find((row) => row.collection === 'unrelated-local-data'));
    assert.equal(result.exported.record.aiChat.length, 40); assert.equal(result.exported.record.aiReadings.length, 20);
    assert.deepEqual(result.exported.record.assessmentLibrary, record.assessmentLibrary);
    await page.reload(); await page.waitForFunction(() => !!window.fixture); await own(page); await open(page); await openHost(page);
    assert.deepEqual((await exportBackup(page)).backup, result.backup);
    const raw = await disk(page); assert.equal(JSON.parse(raw.text).v, 2); assert.deepEqual(raw.rows, archiveRows);
    assert(raw.provider.includes('SYNTHETIC-BOUND-DEVICE-KEY')); assert.equal(raw.oldKey, 'SYNTHETIC-DEVICE-ONLY-LEGACY-KEY');
  });
  await test('v2-native-complete-lost-ack-reopen-exact-retry-keeps-newer-record-and-history', async ({ page, context }) => {
    const backup = await remoteJournalBackup(page);
    const before = await hostSnapshot(page);
    await arm(page, 'lost-ack');
    await evaluateExact(page, ({ command, backup }) => {
      const f = window.fixture;
      f.restoreTask = f.app.restore(command, backup).then(() => { f.ackDelivered = true; }, () => { f.ackDelivered = true; });
    }, { command: meta('v2-uncertain'), backup });
    await page.waitForFunction(() => window.fixture.fault.fired);
    const boundary = await evaluateExact(page, () => ({ fault: window.fixture.fault, delivered: !!window.fixture.ackDelivered }));
    assert.equal(boundary.delivered, false);
    assert.deepEqual(boundary.fault.currentAtDurableBoundary.snapshot, before.snapshot);
    await page.close();
    const next = await fixturePage(context); await own(next); await open(next); await openHost(next);
    const reopened = await exportBackup(next);
    assert.deepEqual(reopened.backup, backup); assert.equal(reopened.revision, before.snapshot.revision + 1);
    const restored = await evaluateExact(next, () => window.fixture.instance.snapshot());
    assert.deepEqual(restored.snapshot.outbox, backup.journal.operations);
    assert.equal(restored.snapshot.actor.sequence, 0);
    const newer = await dispatch(next, 'fixture.patch/1', { afterRestore: 'preserve later work' }, 'after-v2-restore');
    const beforeRetry = await disk(next);
    const retry = await evaluateExact(next, ({ command, backup }) => window.fixture.app.restore(command, backup),
      { command: meta('v2-uncertain'), backup });
    assert.equal(retry.receipt.type, 'host.restore/2'); assert.equal(retry.receipt.outcome, 'duplicate');
    assert.equal(retry.replayUiEffects, false); assert.equal(retry.receipt.committedRevision, reopened.revision);
    assert.deepEqual(retry.snapshot, newer.snapshot); assert.deepEqual(await disk(next), beforeRetry);
    const changed = { ...backup, completeness: 'incomplete' };
    await assert.rejects(evaluateExact(next, ({ command, backup }) => window.fixture.app.restore(command, backup),
      { command: meta('v2-uncertain'), backup: changed }), /command-id-conflict/u);
    assert.deepEqual(await disk(next), beforeRetry);
  });
  await test('v1-restore-over-live-journal-keeps-history-and-next-export-remains-v2', async ({ page }) => {
    const legacy = (await exportBackup(page)).backup;
    assert.equal(legacy.version, 1);
    const backup = await remoteJournalBackup(page);
    assert.equal((await evaluateExact(page, ({ command, backup }) => window.fixture.app.restore(command, backup),
      { command: meta('first-v2'), backup })).status, 'active');
    const before = (await evaluateExact(page, () => window.fixture.instance.snapshot())).snapshot;
    const restored = await evaluateExact(page, ({ command, backup }) => window.fixture.app.restore(command, backup),
      { command: meta('old-portable-backup'), backup: legacy });
    assert.equal(restored.status, 'active'); assert.equal(restored.receipt.type, 'host.restore/1');
    const after = (await evaluateExact(page, () => window.fixture.instance.snapshot())).snapshot;
    for (const key of ['actor', 'replica', 'outbox', 'acknowledgedOutbox', 'inbox', 'checkpoints', 'policy']) assert.deepEqual(after[key], before[key]);
    const exported = (await exportBackup(page)).backup;
    assert.equal(exported.version, 2); assert.deepEqual(exported.record, legacy.record); assert.deepEqual(exported.archive, legacy.archive);
    assert.deepEqual(exported.journal, backup.journal); assert.equal(exported.counts.syncOperations, 1);
    assert.equal(exported.sha256.journal, backup.sha256.journal);
  });
  await test('v2-invalid-or-future-journal-cannot-downgrade-to-a-partial-record-restore', async ({ page }) => {
    const backup = await remoteJournalBackup(page); const before = await disk(page);
    const invalid = await evaluateExact(page, (backup) => {
      const f = window.fixture;
      const resign = (value) => {
        const body = { ...value.journal }; delete body.sha256;
        value.journal.sha256 = f.core.encodeLocalJson(body).sha256;
        value.sha256.journal = f.core.encodeLocalJson(value.journal).sha256;
        return value;
      };
      const missing = structuredClone(backup); delete missing.journal;
      const future = structuredClone(backup); future.journal.operations[0].payload.kind = 'future.note/99';
      const foreign = structuredClone(backup); foreign.journal.scope.accountId = 'unrelated-account';
      const corrupt = structuredClone(backup); corrupt.journal.operations[0].payload.segments[0].text = 'Checksum mismatch';
      corrupt.sha256.journal = f.core.encodeLocalJson(corrupt.journal).sha256;
      const incompleteCounts = structuredClone(backup); delete incompleteCounts.counts.syncOperations;
      return [missing, resign(future), resign(foreign), corrupt, incompleteCounts];
    }, backup);
    for (let index = 0; index < invalid.length; index++) {
      await assert.rejects(evaluateExact(page, ({ command, backup }) => window.fixture.app.restore(command, backup),
        { command: meta(`invalid-v2-${index}`), backup: invalid[index] }));
      assert.deepEqual(await disk(page), before);
    }
    assert.equal((await exportBackup(page)).backup.version, 1);
  });
  await test('v2-novel-source-quote-with-valid-checksums-requires-current-admission', async ({ page }) => {
    const backup = await remoteJournalBackup(page, quoteSegments);
    const before = await disk(page);
    // Valid encoding and declared permission references establish neither
    // author identity nor publisher permission. The whole import must refuse.
    await assert.rejects(evaluateExact(page, ({ command, backup }) => window.fixture.app.restore(command, backup),
      { command: meta('unadmitted-quote'), backup }), /source-quote-admission-required/u);
    assert.deepEqual(await disk(page), before);
    assert.equal((await exportBackup(page)).backup.version, 1);
  });
  await test('v2-existing-exact-source-quote-retains-history-without-new-outbox-or-actor-allocation', async ({ page }) => {
    const backup = await remoteJournalBackup(page, quoteSegments);
    const result = await evaluateExact(page, async ({ backup, command }) => {
      const f = window.fixture; const current = (await f.instance.snapshot()).snapshot;
      // This synthetic setup represents prior source admission by a trusted
      // caller. Low-level receive itself validates shape, never permission.
      await f.instance.commitReceive({ deliveryId: 'previously-admitted-quote', expectedRevision: current.revision,
        delivery: { binding: f.policy.binding, operations: backup.journal.operations },
        checkpoint: { channelId: 'prior-admitted-history', expected: null, next: 'retained' } });
      const before = (await f.instance.snapshot()).snapshot;
      const restored = await f.app.restore(command, backup);
      return { before, after: (await f.instance.snapshot()).snapshot, restored, exported: await f.app.exportBackup() };
    }, { backup, command: meta('exact-existing-quote') });
    assert.equal(result.restored.status, 'active'); assert.equal(result.restored.receipt.type, 'host.restore/2');
    assert.equal(result.after.revision, result.before.revision + 1);
    assert.equal(result.before.outbox.length, 0); assert.equal(result.after.outbox.length, 0);
    for (const key of ['actor', 'replica', 'outbox', 'acknowledgedOutbox', 'inbox', 'checkpoints', 'policy']) assert.deepEqual(result.after[key], result.before[key]);
    assert.deepEqual(result.exported.backup, backup);
  });
  await test('controller-restore-refuses-reserved-migration-data-without-touching-custody-or-record', async ({ page }) => {
    const backup = await remoteJournalBackup(page); const before = await disk(page);
    const result = await evaluateExact(page, async (backup) => {
      const f = window.fixture; const revision = (await f.instance.snapshot()).snapshot.revision;
      const errors = [];
      for (const collection of ['kairo:migration', 'kairo:migration-custody', 'kairo:migration-attempts', 'kairo:migration-future']) {
        for (const kind of ['put', 'delete']) {
          try {
            await f.instance.commitRestore({ restoreId: `reserved-${collection}-${kind}`, binding: f.policy.binding,
              expectedRevision: revision, mutations: [{ kind, collection, id: 'current', ...(kind === 'put' ? { value: { forged: true } } : {}) }],
              backup: backup.journal });
            errors.push('unexpected success');
          } catch (error) { errors.push(error.code); }
        }
      }
      return errors;
    }, backup);
    assert.deepEqual(result, Array(8).fill('reserved-migration-data'));
    assert.deepEqual(await disk(page), before);
  });
  await test('aborted-active-restore-keeps-both-documents-and-all-receipts', async ({ page }) => {
    const backup = (await exportBackup(page)).backup;
    const changed = await evaluateExact(page, (backup) => {
      backup.record.onlyIfCommitted = true; backup.archive.turns = [];
      backup.counts.archiveTurns = 0; backup.sha256.record = window.fixture.core.encodeLocalJson(backup.record).sha256;
      backup.sha256.archive = window.fixture.core.encodeLocalJson(backup.archive).sha256; return backup;
    }, backup);
    const before = await disk(page); await arm(page, 'abort');
    const result = await evaluateExact(page, ({ command, backup }) => window.fixture.app.restore(command, backup), { command: meta('abort-restore'), backup: changed });
    assert.equal(result.status, 'recovery-required'); await evaluateExact(page, () => window.fixture.disarm()); assert.deepEqual(await disk(page), before);
    assert.deepEqual((await exportBackup(page)).backup, backup);
  });
  await test('restore-validates-all-roots-digests-counts-and-transport-exclusions-before-mutation', async ({ page }) => {
    const backup = (await exportBackup(page)).backup; const before = await disk(page);
    const invalid = [ { ...backup, counts: { ...backup.counts, archiveTurns: 0 } }, { ...backup, sha256: { ...backup.sha256, record: '0'.repeat(64) } },
      { ...backup, archive: { ...backup.archive, version: 99 } }, { ...backup, outbox: [] },
      { ...backup, record: { ...backup.record, ai: { baseUrl: 'https://cannot-import.invalid', key: 'SYNTHETIC-REJECTED' } } },
      { ...backup, record: { ...backup.record, aiEvidence: {} } }, { ...backup, completeness: 'incomplete' } ];
    for (let i = 0; i < invalid.length; i++) await assert.rejects(evaluateExact(page, ({ command, backup }) => window.fixture.app.restore(command, backup),
      { command: meta(`bad-restore-${i}`), backup: invalid[i] }));
    assert.deepEqual(await disk(page), before);
  });
  await test('explicit-incomplete-backup-retains-its-warning-and-never-becomes-complete', async ({ page }) => {
    const backup = await evaluateExact(page, async () => {
      const f = window.fixture; const backup = structuredClone((await f.app.exportBackup()).backup);
      backup.record.aiEvidenceIncomplete = true; backup.completeness = 'incomplete'; backup.sha256.record = f.core.encodeLocalJson(backup.record).sha256; return backup;
    });
    const restored = await evaluateExact(page, ({ command, backup }) => window.fixture.app.restore(command, backup), { command: meta('explicit-incomplete'), backup });
    assert.equal(restored.status, 'active'); assert.deepEqual((await exportBackup(page)).backup, backup);
  });
  await test('invalid-reducer-result-and-capacity-overflow-never-write-or-truncate', async ({ page }) => {
    const before = await disk(page);
    await assert.rejects(dispatch(page, 'fixture.patch/1', { invalidFixture: true }, 'invalid-shape'), /invalid-record/u);
    await assert.rejects(dispatch(page, 'fixture.patch/1', { ai: { key: 'SYNTHETIC-MUST-NOT-BECOME-CONFIG' } }, 'invalid-provider'), /invalid-record-patch/u);
    await assert.rejects(dispatch(page, 'fixture.async/1', {}, 'async-reducer'), /invalid-request/u);
    await assert.rejects(dispatch(page, 'fixture.too-large/1', {}, 'capacity'), /invalid-request/u);
    assert.deepEqual(await disk(page), before);
  });
  await test('two-host-handles-cas-refuse-stale-proposal-and-explicit-retry-keeps-both', async ({ page }) => {
    const result = await evaluateExact(page, async (time) => {
      const f = window.fixture; const other = await f.host.createRecordHost(f.hostOptions);
      const a = f.app.appendObservations({ changeId: 'two-host-a', occurredAt: time }, [[1, 'a']]);
      const b = other.appendObservations({ changeId: 'two-host-b', occurredAt: time }, [[2, 'b']]);
      const outcomes = await Promise.all([a, b]);
      const index = outcomes.findIndex((outcome) => outcome.status !== 'active');
      if (index >= 0) await (index === 0 ? f.app : other).appendObservations({ changeId: index === 0 ? 'two-host-a' : 'two-host-b', occurredAt: time }, [[index === 0 ? 1 : 2, index === 0 ? 'a' : 'b']]);
      return { outcomes, current: await f.app.snapshot() };
    }, time);
    assert.equal(result.outcomes.filter((outcome) => outcome.status === 'active').length, 1);
    assert.equal(result.outcomes.filter((outcome) => outcome.status === 'recovery-required').length, 1);
    assert.equal(result.current.snapshot.record.obslog.length, 2);
    assert.deepEqual(new Set(result.current.snapshot.record.obslog.map((row) => row[1])), new Set(['a', 'b']));
  });
  await test('prepared-controller-refuses-normal-host-reads-writes-restore-and-backup', async ({ page }) => {
    const before = await disk(page);
    assert.equal((await hostSnapshot(page)).status, 'prepared');
    assert.equal((await dispatch(page, 'fixture.patch/1', { unsafe: true }, 'not-active')).status, 'prepared');
    assert.equal((await evaluateExact(page, (command) => window.fixture.app.restore(command, {}), meta('not-active-restore'))).status, 'prepared');
    assert.equal((await exportBackup(page)).status, 'prepared'); assert.deepEqual(await disk(page), before);
  }, { active: false });
  await test('changed-session-and-local-scope-fail-closed', async ({ page }) => {
    const before = await disk(page);
    assert.equal((await openHost(page, { otherBinding: true })).status, 'recovery-required');
    assert.equal((await dispatch(page, 'fixture.patch/1', { wrongScope: true }, 'wrong-scope')).status, 'recovery-required');
    await openHost(page); await evaluateExact(page, () => window.fixture.changeSession());
    await assert.rejects(dispatch(page, 'fixture.patch/1', { wrongSession: true }, 'wrong-session'), /session-changed/u);
    assert.deepEqual(await disk(page), before);
  });
  await test('rogue-source-after-target-commit-retains-both-generations-and-blocks-publication', async ({ page }) => {
    const before = await hostSnapshot(page); await arm(page, 'rogue-source');
    const result = await dispatch(page, 'fixture.patch/1', { durablyCommitted: true }, 'rogue');
    assert.equal(result.status, 'quarantined'); assert.equal(result.targetCommitDurable, true); assert.deepEqual(result.lastCommitted, before.snapshot);
    assert.equal((await exportBackup(page)).status, 'quarantined');
    const raw = await disk(page); assert.equal(JSON.parse(raw.text).rogue, 'preserved-foreign-write');
    assert(raw.target.some((row) => row.kind === 'document' && row.text.includes('durablyCommitted')));
  });
  await test('unknown-host-receipt-version-is-preserved-and-refuses-replay', async ({ page }) => {
    await dispatch(page, 'fixture.increment/1', { by: 1 }, 'future-receipt');
    await evaluateExact(page, async () => {
      const f = window.fixture; const db = await new Promise((done) => { const request = indexedDB.open('synthetic-record-target'); request.onsuccess = () => done(request.result); });
      await new Promise((done) => { const tx = db.transaction('kairo_replication_rows', 'readwrite'); const store = tx.objectStore('kairo_replication_rows'); const request = store.getAll();
        request.onsuccess = () => { const row = request.result.find((row) => row.kind === 'document' && JSON.parse(row.text).collection === 'kairo:record-host-commands');
          const document = JSON.parse(row.text); document.value.version = 99; const encoded = f.core.encodeLocalJson(document); store.put({ ...row, text: encoded.text, sha256: encoded.sha256 }); }; tx.oncomplete = done; }); db.close();
    });
    const before = await disk(page); assert.equal((await hostSnapshot(page)).status, 'recovery-required');
    assert.equal((await dispatch(page, 'fixture.increment/1', { by: 1 }, 'future-receipt')).status, 'recovery-required');
    assert.deepEqual(await disk(page), before);
  });
  if (ENGINE === 'chromium') await test('renderer-crash-after-atomic-command-reopens-as-exact-duplicate', async ({ page, context }) => {
    await arm(page, 'crash'); const session = await context.newCDPSession(page); await session.send('Debugger.enable');
    const paused = new Promise((done) => session.once('Debugger.paused', done));
    dispatch(page, 'fixture.increment/1', { by: 4 }, 'crash-command').catch(() => undefined);
    let timer; try { await Promise.race([paused, new Promise((_, fail) => { timer = setTimeout(() => fail(new Error('Host commit boundary was not reached')), 12000); })]); }
    finally { clearTimeout(timer); }
    const { targetInfo } = await session.send('Target.getTargetInfo'); const crashed = new Promise((done) => page.once('crash', done));
    void session.send('Page.crash').catch(() => undefined); await crashed;
    const browserSession = await browser.newBrowserCDPSession(); assert.equal((await browserSession.send('Target.closeTarget', { targetId: targetInfo.targetId })).success, true); await browserSession.detach();
    const next = await fixturePage(context); await own(next); await open(next); await openHost(next, { failReducer: true });
    const retry = await dispatch(next, 'fixture.increment/1', { by: 4 }, 'crash-command');
    assert.equal(retry.receipt.outcome, 'duplicate'); assert.equal(retry.snapshot.record.fixtureCounter, 4); assert.equal(retry.replayUiEffects, false);
  });
} finally {
  await browser.close(); await new Promise((done) => server.close(done));
  for (const [name, bytes] of runtimeFiles) assert.equal(sha(readFileSync(resolve(SITE, name))), sha(bytes), `Tested staged asset changed: ${name}`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'record-host-results.json'), JSON.stringify({ schemaVersion: 1, engine: ENGINE, browserVersion,
    startedAt, finishedAt: new Date().toISOString(), site: SITE, artifactSha256: manifest.artifactSha256,
    sourceAssetSha256: manifest.sourceAssetSha256, runtimeFiles: Object.fromEntries([...runtimeFiles].map(([name, bytes]) => [name, sha(bytes)])),
    verifierSha256: sha(readFileSync(new URL(import.meta.url))),
    hostSha256: createHash('sha256').update(HOST).digest('hex'), controllerSha256: createHash('sha256').update(CONTROLLER).digest('hex'),
    coreSha256: createHash('sha256').update(CORE).digest('hex'), results, errors, externalRequests: network }, null, 2));
}
assert(results.length > 0, 'No record host scenarios executed');
assert.equal(errors.length, 0, 'Unexpected page errors');
assert.equal(network.length, 0, 'Record host must not send network requests');
assert(results.every((result) => result.status === 'passed'), 'Record host scenario failed');
}
