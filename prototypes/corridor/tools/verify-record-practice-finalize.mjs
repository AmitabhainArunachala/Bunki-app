/** Real origin Web Locks, RecordController and IndexedDB. Every profile and
 * command below is an isolated synthetic fixture, never account authorization. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';

const CASES = [
  'submission-atomic-exact-minimal-operation', 'abandonment-dismiss-atomic-no-response',
  'ordinary-practice-writes-emit-none', 'independent-attempts-keep-distinct-operations',
  'retry-after-unrelated-write-and-acknowledgement', 'changed-intent-same-command-refused', 'fresh-command-double-finalization-refused',
  'mismatched-command-scope-refused', 'tampered-form-reference-refused', 'stale-attempt-revision-refused', 'stale-store-revision-refused',
  'mismatched-library-scope-refused', 'tampered-item-reference-refused', 'unsupported-response-kind-refused',
  ...['owner', 'session'].map(mode => `${mode}-loss-before-commit-refused`),
  ...['abort', 'quota'].map(mode => `native-${mode}-rolls-back`),
  'native-lost-ack-reopen-exact-retry', 'native-owner-loss-at-complete-preserves-proof',
  'later-and-concurrent-tombstones-remain-suppressed', 'backward-wall-clock-keeps-recorded-duration',
  ...['operation-omitted', 'operation-duplicated', 'terminal-record-omitted', 'receipt-altered', 'scope-altered'].map(name => `independent-app-gate-refuses-${name}`),
  'rendered-new-library-owned-scope-and-submission', 'rendered-abandonment-dismiss-and-rollback-preserve-ui', 'rendered-historical-mismatch-remains-local',
  ...['identical-exam', 'tombstone'].flatMap(kind => ['unchanged-host', 'host-guards-omitted'].map(host => `history-eligibility-${kind}-${host}`)),
];
if (process.argv.includes('--list')) {
  assert.equal(process.argv.length, 3, '--list is a static inventory, not an execution');
  process.stdout.write(CASES.join('\n') + '\n'); process.exit(0);
}
assert(process.argv.slice(2).every(arg => arg.startsWith('--case=')), 'Only --list or --case=<name-or-existing-substring> is supported');
const FILTERS = new Set(process.argv.slice(2).map(arg => arg.slice(7)));
for (const filter of FILTERS) assert(filter && CASES.some(name => name.includes(filter)), `Unknown case ${filter}`);
const requested = name => !FILTERS.size || [...FILTERS].some(filter => name.includes(filter));
assert(isAbsolute(process.env.KAIRO_SITE_DIR || ''), 'Supply the immutable already built KAIRO_SITE_DIR');
assert.match(process.env.KAIRO_ARTIFACT_SHA256 || '', /^[a-f0-9]{64}$/u, 'Supply KAIRO_ARTIFACT_SHA256');
const ROOT = resolve(process.env.KAIRO_EXAM_DIAGNOSTIC_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), '../../..'));
const require = createRequire(resolve(ROOT, 'package.json'));
const { chromium, webkit } = require('playwright-core');
const { resolveCorridorSite, resolveCorridorEvidence } = await import(pathToFileURL(resolve(ROOT, 'scripts/resolve-corridor-site.mjs')));
const { readAppRecordSnapshot, waitForAppRecord, armRecordWriteFailure, clearRecordWriteFailure } = await import(pathToFileURL(resolve(ROOT, 'prototypes/corridor/tools/record-test-support.mjs')));
const { silenceBrowserAudio, TEST_AUDIO_OUTPUT } = await import(pathToFileURL(resolve(ROOT, 'prototypes/corridor/tools/browser-audio-silence.mjs')));
const SITE = resolveCorridorSite();
const OUT = resolveCorridorEvidence();
assert(!existsSync(resolve(OUT, 'receipt.json')), 'Use fresh evidence for each execution');
const OVERLAY = process.env.KAIRO_EXAM_DIAGNOSTIC_OVERLAY;
const names = ['corridor.js', 'record-host.mjs', 'record-app.mjs', 'assessment-controller.mjs'];
const overrides = new Map(OVERLAY ? names.map((name) => [name, readFileSync(resolve(OVERLAY, 'prototypes/corridor', name))]) : []);
const hostBytes = overrides.get('record-host.mjs') || readFileSync(resolve(SITE, 'record-host.mjs'));
const hostText = hostBytes.toString();
const finalizeStart = hostText.indexOf('  async #finalizePractice(');
const finalizeEnd = hostText.indexOf('\n  async #', finalizeStart + 1);
assert(finalizeStart > 0 && finalizeEnd > finalizeStart, 'Identify the exact named-finalization method');
const finalizeText = hostText.slice(finalizeStart, finalizeEnd);
const mutateFinalize = (needle, replacement) => {
  assert.equal(finalizeText.split(needle).length, 2, 'Negative control must target one exact finalization boundary');
  return Buffer.from(hostText.slice(0, finalizeStart) + finalizeText.replace(needle, replacement) + hostText.slice(finalizeEnd));
};
const commitNeedle = 'const outcome = await this.#controller.commitLocal(request);';
assert.equal(finalizeText.split(commitNeedle).length, 2, 'Independent gate controls require one exact finalization commit boundary');
const gateMutations = new Map([
  ['operation-omitted', '{ ...request, operations: [] }'],
  ['operation-duplicated', '{ ...request, operations: [...request.operations, ...request.operations] }'],
  ['terminal-record-omitted', '{ ...request, mutations: request.mutations.slice(1) }'],
  ['receipt-altered', "{ ...request, mutations: request.mutations.map((row, index) => index === 2 ? { ...row, value: { ...row.value, recordSha256: '0'.repeat(64) } } : row) }"],
  ['scope-altered', "{ ...request, binding: { ...request.binding, learnerId: 'unrelated-host-scope' } }"],
].map(([name, request]) => [name, mutateFinalize(commitNeedle, `const outcome = await this.#controller.commitLocal(${request});`)]));
const historyGuards = `    insist(!state.snapshot.replica.operations.some((operation) => operation.payload.kind === 'exam.attempt' &&
      operation.payload.attemptId === input.attemptId), 'practice-already-emitted');
    insist(!state.snapshot.replica.projection.entities.some((entry) => entry.target.kind === 'exam-attempt' &&
      entry.target.id === input.attemptId && entry.tombstones.length > 0), 'practice-already-deleted');`;
assert.equal(finalizeText.split(historyGuards).length, 2);
gateMutations.set('history-guards-omitted', mutateFinalize(historyGuards, '    // Independent review mutation: omit preexisting history eligibility checks.'));
const ENGINES = process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER || 'chromium'];
assert(ENGINES.every((engine) => ['chromium', 'webkit'].includes(engine)));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value !== null && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])])) : value;
const digest = (value) => sha(JSON.stringify(normalize(value)));
const identity = JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8'));
const sourcePath = fileURLToPath(import.meta.url), sourceSha256 = sha(readFileSync(sourcePath));
const helperPaths = ['scripts/resolve-corridor-site.mjs', 'prototypes/corridor/tools/record-test-support.mjs', 'prototypes/corridor/tools/browser-audio-silence.mjs'];
const helperSha256 = Object.fromEntries(helperPaths.map(path => [path, sha(readFileSync(resolve(ROOT, path)))]));
const artifactFiles = directory => readdirSync(directory).sort().flatMap(name => {
  const path = resolve(directory, name), stat = lstatSync(path); assert(!stat.isSymbolicLink(), 'Artifact symlink refused');
  if (stat.isDirectory()) return artifactFiles(path); assert(stat.isFile());
  if (path === resolve(SITE, 'build-identity.json')) return [];
  const bytes = readFileSync(path); return [{ path: relative(SITE, path).split(sep).join('/'), bytes: bytes.length, sha256: sha(bytes) }];
});
function bookends() {
  assert.equal(sha(readFileSync(sourcePath)), sourceSha256, 'Verifier changed during execution');
  for (const path of helperPaths) assert.equal(sha(readFileSync(resolve(ROOT, path))), helperSha256[path], path);
  assert.deepEqual(JSON.parse(readFileSync(resolve(SITE, 'build-identity.json'), 'utf8')), identity);
  assert.equal(sha(JSON.stringify(identity.files)), identity.artifactSha256);
  assert.equal(identity.artifactSha256, process.env.KAIRO_ARTIFACT_SHA256);
  assert.deepEqual(artifactFiles(SITE), identity.files, 'Every artifact file and byte stays fixed');
  for (const [name, bytes] of overrides) assert.deepEqual(readFileSync(resolve(OVERLAY, 'prototypes/corridor', name)), bytes);
}
bookends();
mkdirSync(resolve(OUT, 'verifier-source'));
writeFileSync(resolve(OUT, 'verifier-source', 'verify-record-practice-finalize.mjs'), readFileSync(sourcePath));
for (const path of helperPaths) {
  const target = resolve(OUT, 'verifier-source', path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, readFileSync(resolve(ROOT, path)));
}
writeFileSync(resolve(OUT, 'build-identity.json'), JSON.stringify(identity, null, 2) + '\n');
const runtimeInputs = [...names, 'record-controller.mjs', 'modules/record-core.mjs', 'modules/assessment-core.mjs'].map((name) => {
  const bytes = overrides.get(name) || readFileSync(resolve(SITE, name));
  return { path: name, sha256: sha(bytes), bytes: bytes.length, overridden: overrides.has(name) };
});
const setBytes = readFileSync(resolve(SITE, 'data/mock/sets/n5-01.json'));
const fullSet = JSON.parse(setBytes);
const smallSet = { ...fullSet, sections: fullSet.sections.map((section) => ({ ...section, items: section.items.slice(0, 1) })) };
const policy = { binding: { accountId: 'synthetic-exam-account', learnerId: 'synthetic-exam-learner', sessionId: 'synthetic-exam-session' },
  schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
const actor = { deviceId: 'synthetic-exam-device', incarnationId: 'synthetic-exam-installation' };
const time = '2026-09-10T07:00:00.000Z';
const results = []; const errors = []; const externalRequests = []; const browserVersions = {}; const lifecycle = [];
const genuineViews = new Map();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost'); const path = url.pathname;
  if (path === '/practice-command-fixture') {
    const mutation = url.searchParams.get('hostMutation');
    assert(mutation === null || gateMutations.has(mutation));
    const prefix = mutation ? `/gate-${mutation}` : '';
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end(`<!doctype html><meta charset="utf-8"><title>Synthetic practice command</title><script type="module">
      import * as controller from '${prefix}/record-controller.mjs'; import * as core from '${prefix}/modules/record-core.mjs';
      import * as host from '${prefix}/record-host.mjs'; import * as app from '${prefix}/record-app.mjs'; import * as assessment from '${prefix}/assessment-controller.mjs';
      window.fixture = { controller, core, host, app, assessment };</script>`); return;
  }
  const mutation = [...gateMutations.keys()].find((name) => path.startsWith(`/gate-${name}/`));
  const name = path === '/' ? 'index.html' : mutation ? path.slice(`/gate-${mutation}/`.length) : path.slice(1);
  const file = resolve(SITE, name);
  try {
    if (!file.startsWith(`${SITE}/`) || !statSync(file).isFile()) throw new Error('missing');
    response.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(mutation && name === 'record-host.mjs' ? gateMutations.get(mutation) : overrides.get(name) || readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
async function exact(page, action, value) {
  return JSON.parse(await page.evaluate(async ({ source, input }) => {
    const run = (0, eval)(`(${source})`);
    return JSON.stringify({ value: await run(JSON.parse(input).value) });
  }, { source: String(action), input: JSON.stringify({ value }) })).value;
}
async function initialize(page, { reopen = false, kind = 'app', mismatched = false, hostMutation } = {}) {
  await page.goto(`${origin}/practice-command-fixture${hostMutation ? `?hostMutation=${hostMutation}` : ''}`);
  await page.waitForFunction(() => !!window.fixture);
  await exact(page, async ({ policy, actor, smallSet, time, reopen, kind, mismatched }) => {
    const f = window.fixture; f.policy = policy; f.actor = actor; f.databaseName = 'synthetic-exam-commands'; f.serial = 0;
    const scope = { accountId: policy.binding.accountId, learnerId: policy.binding.learnerId };
    if (!reopen) {
      const libraryScope = mismatched ? { ...scope, learnerId: 'historical-unrelated-learner' } : scope;
      const library = f.assessment.startLegacyPractice(f.assessment.createLibrary({ scope: libraryScope }), smallSet,
        { scope: libraryScope, attemptId: 'attempt:one', now: time });
      localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1, taken: [], srs: {}, revlog: [], obslog: [],
        unknownRoot: { original: 'Unrelated learner content 🧪' }, assessmentLibrary: library }));
      const db = await new Promise((done, fail) => {
        const request = indexedDB.open('kairo-ai-log', 3);
        request.onupgradeneeded = () => { const turns = request.result.createObjectStore('turns', { keyPath: 'id', autoIncrement: true });
          turns.createIndex('logical-id', 'turn.id'); request.result.createObjectStore('imports', { keyPath: 'id' }); };
        request.onsuccess = () => done(request.result); request.onerror = () => fail(request.error);
      }); db.close();
    }
    let token = { ownerId: crypto.randomUUID(), epoch: 1, sessionId: policy.binding.sessionId };
    let owned = false; let release;
    await new Promise((done, fail) => {
      navigator.locks.request('kairo-record:kairo-corridor-v1:kairo-ai-log', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) { fail(new Error('Actual record lock unavailable')); return; }
        owned = true; const lifetime = new Promise((resolve) => { release = resolve; }); done(); await lifetime;
      }).catch(fail);
    });
    f.writer = { capture: () => ({ ...token }), assert: (captured) => owned && captured.ownerId === token.ownerId && captured.epoch === token.epoch && captured.sessionId === token.sessionId };
    f.release = () => { owned = false; token = { ...token, epoch: token.epoch + 1 }; release(); };
    f.changeSession = () => { token = { ...token, sessionId: 'synthetic-revoked-session' }; };
    window.addEventListener('pagehide', f.release, { once: true });
    f.instance = await f.controller.createRecordController({ databaseName: f.databaseName, policy, actor, writer: f.writer });
    if (!reopen) {
      const source = await f.controller.captureLegacySource(f.writer);
      const prepared = await f.instance.prepare(source, { migrationId: 'synthetic-exam-migration' });
      if (prepared.status !== 'prepared') throw new Error(`Actual prepare: ${prepared.status}`);
      if ((await f.instance.activate('synthetic-exam-migration')).status !== 'active') throw new Error('Actual activation failed');
    }
    f.publications = [];
    const options = { controller: f.instance, binding: policy.binding, writer: f.writer,
      validateRecord: (record) => record?.v === 1 && Array.isArray(record.taken), validateArchive: Array.isArray };
    f.subject = kind === 'host' ? await f.host.createRecordHost(options) : await f.app.createRecordApp({ ...options, onPublish: (result) => { f.publications.push(result); } });
    f.native = async () => {
      const store = await f.core.IndexedDbReplicationStore.open({ databaseName: f.databaseName, policy, actor });
      try { return await store.snapshot(); } finally { await store.close(); }
    };
    f.nativeReader = async () => {
      const store = await f.core.IndexedDbReplicationStore.open({ databaseName: f.databaseName, policy, actor });
      try {
        const snapshot = await store.snapshot(), views = f.core.readExamAttemptViews(snapshot.replica);
        let copiedHandleRejected = false;
        try { f.core.readExamAttemptViews(JSON.parse(JSON.stringify(snapshot.replica))); }
        catch (error) { copiedHandleRejected = error.code === 'invalid-replica'; }
        if (!copiedHandleRejected || !Object.isFrozen(views) || views.some(view => !Object.isFrozen(view.headAttempts)))
          throw new Error('Genuine immutable reader boundary failed');
        return { snapshot, views, copiedHandleRejected };
      } finally { await store.close(); }
    };
    f.readerProofs = [];
    f.patch = async (produce) => f.subject.write((record) => ({ patch: produce(record) }));
    f.step = async (method, extra = {}, elapsedDeltaMs = 11) => f.patch((record) => {
      const selected = f.assessment.selectPractice(record.assessmentLibrary);
      return { assessmentLibrary: f.assessment[method](record.assessmentLibrary, {
        scope: record.assessmentLibrary.scope, attemptId: selected.attemptId, expectedRevisionId: selected.expectedRevisionId,
        commandId: `step:${++f.serial}`, now: time, elapsedDeltaMs, activeDeltaMs: elapsedDeltaMs, ...extra }) };
    });
    f.answerAll = async () => {
      const selected = f.assessment.selectPractice(f.subject.current().snapshot.record.assessmentLibrary);
      for (let index = 0; index < selected.flat.length; index++) {
        if (index) await f.step('movePractice', { index });
        await f.step('answerPractice', { choiceIndex: index % 2 });
      }
    };
    f.command = (outcome = 'submitted', dismiss = false, changeId = 'finalize:one', occurredAt = time) => {
      const current = f.subject.current().snapshot; const library = current.record.assessmentLibrary;
      const selected = f.assessment.selectPractice(library); const form = selected.attempt.form;
      return { meta: { changeId, occurredAt }, input: { expectedRevision: current.revision, scope,
        attemptId: selected.attemptId, expectedRevisionId: selected.expectedRevisionId,
        form: { formId: form.id, versionId: form.revisionId, sha256: form.sha256 }, outcome, elapsedDeltaMs: 23, activeDeltaMs: 17, dismiss } };
    };
    f.run = async (command) => { try {
      const count = f.publications.length, result = await f.subject.finalizePractice(command.meta, command.input);
      if (result.status === 'active') {
        const genuine = await f.nativeReader();
        const same = (left, right) => f.core.encodeLocalJson(left).text === f.core.encodeLocalJson(right).text;
        if (result.snapshot.revision !== genuine.snapshot.revision || !same(result.snapshot.examAttemptViews, genuine.views))
          throw new Error('Public finalization snapshot differs from the genuine current reader');
        const publications = f.publications.slice(count);
        for (const publication of publications) {
          if (publication.snapshot.revision !== genuine.snapshot.revision || !same(publication.snapshot.examAttemptViews, genuine.views))
            throw new Error('Published finalization views differ from the genuine current reader');
        }
        f.readerProofs.push({ revision: genuine.snapshot.revision, genuineViews: genuine.views,
          publicViews: result.snapshot.examAttemptViews, publications: publications.length, copiedHandleRejected: genuine.copiedHandleRejected });
      }
      return result;
    } catch (error) { return { rejected: true, code: error.code || error.name, message: error.message }; } };
  }, { policy, actor, smallSet, time, reopen, kind, mismatched });
  assert.equal(await page.evaluate(() => typeof window.fixture.subject.finalizePractice), 'function');
}
async function native(page) {
  const proof = await exact(page, () => window.fixture.nativeReader());
  assert.equal(proof.copiedHandleRejected, true); genuineViews.set(digest(proof.snapshot), proof.views); return proof.snapshot;
}
const recordOf = (state) => state.documents.find((row) => row.collection === 'learner-record' && row.id === 'current').value;
const archiveOf = (state) => state.documents.find((row) => row.collection === 'learner-archive' && row.id === 'current').value;
function committed(before, after, result, outcome, dismiss = false) {
  assert.equal(result.status, 'active'); assert.equal(result.receipt.outcome, 'committed'); assert.equal(result.replayUiEffects, true);
  assert.equal(after.revision, before.revision + 1); assert.equal(after.actor.sequence, before.actor.sequence + 1);
  assert.equal(after.outbox.length, before.outbox.length + 1); assert.equal(after.replica.operations.length, before.replica.operations.length + 1);
  const added = after.replica.operations.find((operation) => !before.replica.operations.some((row) => row.opId === operation.opId));
  const library = recordOf(after).assessmentLibrary; const attempt = library.attempts.find((row) => row.attemptId === added.payload.attemptId);
  const form = library.forms.find((entry) => entry.form.revisionId === attempt.form.revisionId).form;
  assert.equal(attempt.status, outcome); assert.equal(library.activeAttemptId, dismiss ? null : attempt.attemptId);
  assert.deepEqual(added.payload, { kind: 'exam.attempt', attemptId: attempt.attemptId, generation: null,
    form: { formId: form.id, versionId: form.revisionId, sha256: form.sha256 }, outcome, startedAt: attempt.startedAt, endedAt: attempt.endedAt,
    elapsedMs: attempt.timings.reduce((sum, block) => sum + block.elapsedMs, 0), interruptionCount: attempt.facts.filter((fact) => fact.kind === 'interruption').length,
    answers: attempt.answers.map((answer) => ({ itemId: answer.item.id, itemVersionId: answer.item.revisionId,
      response: answer.response.kind === 'selected' ? { kind: 'choice', optionId: answer.response.optionId } : { kind: 'no-response' } })) });
  assert.deepEqual(added.scope, library.scope); assert.deepEqual(added.predecessor, before.actor.predecessor);
  assert(after.replica.ready.some((row) => row.opId === added.opId)); assert(after.outbox.some((row) => row.opId === added.opId));
  assert.deepEqual(result.receipt.operations.map((row) => row.opId), [added.opId]);
  assert.deepEqual(recordOf(after), { ...recordOf(before), assessmentLibrary: library }); assert.deepEqual(archiveOf(after), archiveOf(before));
  const receipt = after.documents.find((row) => row.collection === 'kairo:record-host-commands' && row.id === result.receipt.changeId).value;
  assert.equal(receipt.recordSha256, digest(recordOf(after))); assert.equal(receipt.archiveSha256, digest(archiveOf(after)));
  assert.equal(receipt.practice.attemptRevisionId, attempt.revisionId); assert(Buffer.byteLength(JSON.stringify(receipt)) <= 4096);
  assert.equal(result.practice.current, true);
  assert.deepEqual(result.snapshot.examAttemptViews, genuineViews.get(digest(after)), 'Public views match a genuine in-process reader');
  const view = result.snapshot.examAttemptViews.find(row => row.attemptId === added.payload.attemptId);
  assert.equal(view.headAttempts.length, 1); assert.deepEqual(view.headAttempts[0].payload, added.payload);
  assert.equal(view.headAttempts[0].payloadSha256, added.payloadSha256);
  assert.deepEqual(view.headAttempts[0].operationRefs, [after.actor.predecessor]);
  return added;
}
async function armNative(page, mode) {
  await page.evaluate((mode) => {
    const f = window.fixture; const nativeTx = IDBDatabase.prototype.transaction; const nativePut = IDBObjectStore.prototype.put;
    const fault = { mode, fired: 0, durable: false, aborted: false };
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = nativeTx.apply(this, args);
      if (this.name === f.databaseName && args[1] === 'readwrite') {
        tx.addEventListener('abort', () => { if (tx.__examFinalization) fault.aborted = true; });
        tx.addEventListener('complete', (event) => {
          if (!tx.__examFinalization) return;
          fault.durable = true;
          if (mode === 'lost-ack') { fault.fired++; event.stopImmediatePropagation(); }
          if (mode === 'owner-at-complete') { fault.fired++; f.release(); }
        });
      }
      return tx;
    };
    IDBObjectStore.prototype.put = function (...args) {
      const request = nativePut.apply(this, args);
      if (this.transaction.db.name !== f.databaseName || args[0]?.kind !== 'document') return request;
      const row = JSON.parse(args[0].text);
      if (row.collection === 'kairo:record-host-commands' && row.value.type === 'host.practice-finalize/1') {
        this.transaction.__examFinalization = true;
        if (mode === 'abort') { fault.fired++; this.transaction.abort(); }
        if (mode === 'quota') { fault.fired++; throw new DOMException('Synthetic quota after native assessment puts', 'QuotaExceededError'); }
      }
      return request;
    };
    fault.disarm = () => { IDBDatabase.prototype.transaction = nativeTx; IDBObjectStore.prototype.put = nativePut; };
    window.__examFault = fault;
  }, mode);
}
const cases = [];
function test(name, run) { cases.push({ name, run }); }
test('submission-atomic-exact-minimal-operation', async (page) => {
  await initialize(page); await page.evaluate(() => window.fixture.answerAll());
  const before = await native(page); const result = await exact(page, () => window.fixture.run(window.fixture.command()));
  const after = await native(page); const operation = committed(before, after, result, 'submitted');
  return { before, after, result, operation };
});
test('abandonment-dismiss-atomic-no-response', async (page) => {
  await initialize(page); await page.evaluate(() => window.fixture.step('answerPractice', { choiceIndex: 1 }));
  const before = await native(page); const result = await exact(page, () => window.fixture.run(window.fixture.command('abandoned', true)));
  const after = await native(page); const operation = committed(before, after, result, 'abandoned', true);
  assert(operation.payload.answers.some((answer) => answer.response.kind === 'no-response')); return { before, after, result };
});
test('ordinary-practice-writes-emit-none', async (page) => {
  await initialize(page); await page.evaluate(async () => { const f = window.fixture;
    await f.step('answerPractice', { choiceIndex: 1 }); await f.step('movePractice', { index: 1 });
    await f.step('interruptPractice', { reason: 'user-pause' }); });
  const before = await native(page); assert.equal(before.actor.sequence, 0); assert.deepEqual(before.outbox, []); assert.deepEqual(before.replica.operations, []);
  await initialize(page, { reopen: true }); const after = await native(page); assert.deepEqual(after, before); return { before, after };
});
test('independent-attempts-keep-distinct-operations', async (page) => {
  await initialize(page); const first = await exact(page, () => window.fixture.run(window.fixture.command('abandoned', true)));
  assert.equal(first.status, 'active');
  await exact(page, async (smallSet) => { const f = window.fixture; await f.patch((record) => ({ assessmentLibrary: f.assessment.startLegacyPractice(record.assessmentLibrary, smallSet,
    { scope: record.assessmentLibrary.scope, attemptId: 'attempt:two', now: '2026-09-10T07:00:01.000Z' }) })); }, smallSet);
  const before = await native(page); const second = await exact(page, () => window.fixture.run(window.fixture.command('abandoned', false, 'finalize:two')));
  const after = await native(page); committed(before, after, second, 'abandoned');
  assert.equal(new Set(after.replica.operations.map((row) => row.payload.attemptId)).size, 2); return { first, second, after };
});
test('retry-after-unrelated-write-and-acknowledgement', async (page) => {
  await initialize(page); const command = await exact(page, () => window.fixture.command('abandoned'));
  const first = await exact(page, (command) => window.fixture.run(command), command); assert.equal(first.status, 'active');
  await page.evaluate(async () => { const f = window.fixture; await f.patch(() => ({ unknownRoot: { later: 'Must survive exact retry' } }));
    const store = await f.core.IndexedDbReplicationStore.open({ databaseName: f.databaseName, policy: f.policy, actor: f.actor });
    try { const state = await store.snapshot(); await store.acknowledgeOutbox({ acknowledgementId: 'synthetic-ack', binding: f.policy.binding,
      expectedRevision: state.revision, operations: state.outbox.map(f.core.operationReference) }); } finally { await store.close(); } });
  const before = await native(page); const retry = await exact(page, (command) => window.fixture.run(command), command); const after = await native(page);
  assert.equal(retry.status, 'active'); assert.equal(retry.receipt.outcome, 'duplicate'); assert.equal(retry.replayUiEffects, false);
  assert.deepEqual(retry.receipt.operations, first.receipt.operations); assert.deepEqual(after, before); assert.equal(after.outbox.length, 0); return { first, retry, before, after };
});
test('changed-intent-same-command-refused', async (page) => {
  await initialize(page); const command = await exact(page, () => window.fixture.command('abandoned'));
  assert.equal((await exact(page, (command) => window.fixture.run(command), command)).status, 'active');
  const before = await native(page); command.input.elapsedDeltaMs++;
  const result = await exact(page, (command) => window.fixture.run(command), command);
  assert.equal(result.code, 'command-id-conflict'); assert.deepEqual(await native(page), before); return { result, before };
});
test('fresh-command-double-finalization-refused', async (page) => {
  await initialize(page); const command = await exact(page, () => window.fixture.command('abandoned'));
  const first = await exact(page, (command) => window.fixture.run(command), command); const before = await native(page);
  command.meta.changeId = 'finalize:different'; command.input.expectedRevision = before.revision;
  const result = await exact(page, (command) => window.fixture.run(command), command);
  assert.equal(result.code, 'practice-already-emitted'); assert.deepEqual(await native(page), before); return { first, result, before };
});
for (const [name, mutation, expected] of [
  ['mismatched-command-scope-refused', (c) => { c.input.scope.learnerId = 'another-learner'; }, 'scope-mismatch'],
  ['tampered-form-reference-refused', (c) => { c.input.form.sha256 = '0'.repeat(64); }, 'form-mismatch'],
  ['stale-attempt-revision-refused', (c) => { c.input.expectedRevisionId = 'stale-revision'; }, 'stale-checkpoint'],
  ['stale-store-revision-refused', (c) => { c.input.expectedRevision--; }, 'practice-store-superseded'],
]) test(name, async (page) => {
  await initialize(page); const command = await exact(page, () => window.fixture.command('abandoned')); mutation(command);
  const before = await native(page); const result = await exact(page, (command) => window.fixture.run(command), command);
  assert.equal(result.code, expected); assert.deepEqual(await native(page), before); return { result, before };
});
test('mismatched-library-scope-refused', async (page) => {
  await initialize(page, { mismatched: true }); const before = await native(page);
  const result = await exact(page, () => window.fixture.run(window.fixture.command('abandoned')));
  assert.equal(result.code, 'scope-mismatch'); assert.deepEqual(await native(page), before); return { result, before };
});
for (const [name, kind] of [['tampered-item-reference-refused', 'item'], ['unsupported-response-kind-refused', 'response']]) test(name, async (page) => {
  await initialize(page); await exact(page, async (kind) => { const f = window.fixture; await f.patch((record) => {
    const library = JSON.parse(JSON.stringify(record.assessmentLibrary)); const answer = library.attempts[0].answers[0];
    if (kind === 'item') answer.item.revisionId = 'tampered-item-revision';
    else answer.response = { kind: 'ordered', optionIds: ['first', 'second'] };
    return { assessmentLibrary: library }; }); }, kind);
  const before = await native(page);
  const result = await exact(page, () => { const f = window.fixture; const record = f.subject.current().snapshot.record;
    const attempt = record.assessmentLibrary.attempts[0]; const form = record.assessmentLibrary.forms[0].form;
    return f.run({ meta: { changeId: 'invalid-terminal', occurredAt: '2026-09-10T07:00:00.000Z' }, input: {
      expectedRevision: f.subject.current().snapshot.revision, scope: record.assessmentLibrary.scope, attemptId: attempt.attemptId,
      expectedRevisionId: attempt.revisionId, form: { formId: form.id, versionId: form.revisionId, sha256: form.sha256 },
      outcome: 'abandoned', elapsedDeltaMs: 1, activeDeltaMs: 1, dismiss: false } }); });
  assert.equal(result.rejected, true); assert.deepEqual(await native(page), before); return { result, before };
});
for (const mode of ['owner', 'session']) test(`${mode}-loss-before-commit-refused`, async (page) => {
  await initialize(page); const command = await exact(page, () => window.fixture.command('abandoned')); const before = await native(page);
  await page.evaluate((mode) => { if (mode === 'owner') window.fixture.release(); else window.fixture.changeSession(); }, mode);
  const result = await exact(page, (command) => window.fixture.run(command), command);
  assert(result.rejected || result.status === 'recovery-required'); assert.deepEqual(await native(page), before); return { result, before };
});
for (const mode of ['abort', 'quota']) test(`native-${mode}-rolls-back`, async (page) => {
  await initialize(page); const command = await exact(page, () => window.fixture.command('abandoned')); const before = await native(page);
  await armNative(page, mode); const result = await exact(page, (command) => window.fixture.run(command), command);
  assert.equal(result.status, 'recovery-required'); const fault = await exact(page, () => { const f = window.__examFault; f.disarm(); return { fired: f.fired, durable: f.durable, aborted: f.aborted }; });
  assert.equal(fault.fired, 1); assert.equal(fault.durable, false); assert.equal(fault.aborted, true); assert.deepEqual(await native(page), before);
  await initialize(page, { reopen: true }); assert.deepEqual(await native(page), before);
  const retry = await exact(page, (command) => window.fixture.run(command), command); const after = await native(page); committed(before, after, retry, 'abandoned');
  return { result, fault, before, after, retry };
});
test('native-lost-ack-reopen-exact-retry', async (page) => {
  await initialize(page); const command = await exact(page, () => window.fixture.command('abandoned')); const before = await native(page);
  await armNative(page, 'lost-ack'); await page.evaluate((command) => { window.__pendingFinalize = window.fixture.run(command); }, command);
  await page.waitForFunction(() => window.__examFault?.durable === true);
  assert.equal(await page.evaluate(() => window.fixture.publications.length), 0);
  const durable = await native(page); assert.equal(durable.actor.sequence, before.actor.sequence + 1);
  const priorUi = await exact(page, () => window.fixture.subject.current()); assert.equal(priorUi.snapshot.record.assessmentLibrary.attempts[0].status, 'in-progress');
  await initialize(page, { reopen: true }); const retry = await exact(page, (command) => window.fixture.run(command), command);
  assert.equal(retry.status, 'active'); assert.equal(retry.receipt.outcome, 'duplicate'); assert.equal(retry.replayUiEffects, false);
  const after = await native(page); assert.deepEqual(after, durable); return { before, durable, priorUi, retry, after };
});
test('native-owner-loss-at-complete-preserves-proof', async (page) => {
  await initialize(page); const command = await exact(page, () => window.fixture.command('abandoned')); await armNative(page, 'owner-at-complete');
  const result = await exact(page, (command) => window.fixture.run(command), command); assert.equal(result.status, 'recovery-required');
  assert.equal(await page.evaluate(() => window.fixture.publications.length), 0); const durable = await native(page);
  assert.equal(durable.actor.sequence, 1); assert.equal(recordOf(durable).assessmentLibrary.attempts[0].status, 'abandoned');
  await initialize(page, { reopen: true }); const retry = await exact(page, (command) => window.fixture.run(command), command);
  assert.equal(retry.receipt.outcome, 'duplicate'); assert.deepEqual(await native(page), durable); return { result, durable, retry };
});
test('later-and-concurrent-tombstones-remain-suppressed', async (page) => {
  await initialize(page); const command = await exact(page, () => window.fixture.command('abandoned'));
  const first = await exact(page, (command) => window.fixture.run(command), command); assert.equal(first.status, 'active');
  await page.evaluate(async () => { const f = window.fixture; const store = await f.core.IndexedDbReplicationStore.open({ databaseName: f.databaseName, policy: f.policy, actor: f.actor });
    try { const before = await store.snapshot();
      const operations = [true, false].map((later, index) => f.core.createSyncOperation({ format: 'kairo-sync-operation', v: 1,
        scope: { accountId: f.policy.binding.accountId, learnerId: f.policy.binding.learnerId },
        actor: { deviceId: `remote-synthetic-delete-${index}`, incarnationId: 'fixture', sequence: 1 }, predecessor: null,
        dependencies: later ? before.replica.operations.map(f.core.operationReference) : [], schemaEpoch: 1, deletionEpoch: 0,
        mergePolicy: f.policy.mergePolicy, occurredAt: '2026-09-10T07:00:01.000Z',
        payload: { kind: 'entity.tombstone', target: { kind: 'exam-attempt', id: 'attempt:one' }, reason: 'user-deleted' } }));
      await store.commitReceive({ deliveryId: 'synthetic-delete-delivery', expectedRevision: before.revision,
        delivery: { binding: f.policy.binding, operations }, checkpoint: { channelId: 'synthetic-admitted-channel', expected: null, next: 'after-delete' } });
    } finally { await store.close(); } });
  const before = await native(page); const retry = await exact(page, (command) => window.fixture.run(command), command);
  assert.equal(retry.status, 'active'); assert.equal(retry.receipt.outcome, 'duplicate'); assert.equal(retry.practice.current, false);
  const entity = before.replica.projection.entities.find((row) => row.target.kind === 'exam-attempt');
  assert.deepEqual(entity.heads, []); assert.equal(entity.tombstones.length, 2); assert.deepEqual(await native(page), before); return { first, retry, before };
});
test('backward-wall-clock-keeps-recorded-duration', async (page) => {
  await initialize(page); await page.evaluate(async () => { await window.fixture.step('interruptPractice', { reason: 'clock-discontinuity' }, 4321); });
  const before = await native(page); const result = await exact(page, () => window.fixture.run(window.fixture.command('abandoned', false, 'backward-clock', '2026-09-09T07:00:00.000Z')));
  const after = await native(page); const operation = committed(before, after, result, 'abandoned');
  assert.equal(operation.payload.elapsedMs, 4344); assert.equal(operation.payload.interruptionCount, 1);
  assert(Date.parse(operation.payload.endedAt) < Date.parse(operation.payload.startedAt)); return { result, operation, after };
});
for (const hostMutation of [...gateMutations.keys()].filter((name) => name !== 'history-guards-omitted')) test(`independent-app-gate-refuses-${hostMutation}`, async (page) => {
  await initialize(page, { hostMutation }); const before = await native(page);
  const result = await exact(page, () => window.fixture.run(window.fixture.command('abandoned')));
  assert.equal(result.status, 'recovery-required'); assert.equal(result.reason, 'unexpected-sync-operations');
  assert.deepEqual(await native(page), before); assert.equal(await page.evaluate(() => window.fixture.publications.length), 0);
  return { result, before, authoredNegativeHostMutation: hostMutation, originalHostSha256: sha(hostBytes), mutatedHostSha256: sha(gateMutations.get(hostMutation)) };
});

async function uiNative(page) {
  const saved = await readAppRecordSnapshot(page);
  const proof = await exact(page, async () => {
    const installation = JSON.parse(localStorage.getItem('kairo-local-record-binding-v1'));
    const core = await import('/modules/record-core.mjs');
    const store = await core.IndexedDbReplicationStore.open({ databaseName: installation.databaseName, actor: installation.actor,
      policy: { binding: installation.binding, schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' } });
    try {
      const snapshot = await store.snapshot(), views = core.readExamAttemptViews(snapshot.replica);
      if (!Object.isFrozen(views)) throw new Error('Genuine UI reader was mutable');
      return { snapshot, views };
    } finally { await store.close(); }
  });
  const { snapshot } = proof; genuineViews.set(digest(snapshot), proof.views);
  assert.equal(saved.revision, snapshot.revision); assert.deepEqual(saved.record, recordOf(snapshot)); return snapshot;
}
async function openUiPractice(page) {
  await page.goto(`${origin}/index.html?entry=shelf&ui=bi`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#mock-link').click(); await page.locator('#exam-legacy').click(); await page.locator('[data-mock-set="n5-01"]').click();
  await page.locator('[data-mock-opt="0"]').waitFor();
  await waitForAppRecord(page, (record) => record.assessmentLibrary?.attempts.some((attempt) => attempt.status === 'in-progress'));
}
test('rendered-new-library-owned-scope-and-submission', async (page) => {
  await openUiPractice(page); const started = await uiNative(page);
  assert.deepEqual(recordOf(started).assessmentLibrary.scope, { accountId: started.policy.binding.accountId, learnerId: started.policy.binding.learnerId });
  const count = recordOf(started).assessmentLibrary.attempts[0].answers.length;
  for (let index = 0; index < count; index++) {
    const before = await readAppRecordSnapshot(page);
    await page.locator('[data-mock-opt="0"]').click();
    await waitForAppRecord(page, (record) => record.assessmentLibrary.attempts[0].revisionId !== before.record.assessmentLibrary.attempts[0].revisionId);
    await page.waitForFunction(() => document.querySelector('#mock-next')?.disabled === false);
    if (index + 1 < count) {
      const prior = await readAppRecordSnapshot(page); await page.locator('#mock-next').click();
      await waitForAppRecord(page, (record) => record.assessmentLibrary.attempts[0].cursor.itemId !== prior.record.assessmentLibrary.attempts[0].cursor.itemId);
    }
  }
  const before = await uiNative(page); assert.equal(before.replica.operations.length, 0);
  await page.locator('#mock-next').click(); await waitForAppRecord(page, (record) => record.assessmentLibrary.attempts[0].status === 'submitted');
  const after = await uiNative(page); assert.equal(after.outbox.length, 1); assert.equal(after.replica.operations[0].payload.kind, 'exam.attempt');
  assert.equal(after.replica.operations[0].payload.outcome, 'submitted');
  assert.deepEqual(recordOf(after).obslog, recordOf(before).obslog); assert.deepEqual(recordOf(after).srs, recordOf(before).srs);
  await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1'); const reopened = await uiNative(page);
  assert.deepEqual(reopened, after);
  await page.locator('#mock-link').click(); await page.locator('#mock-done').click();
  await page.locator('#exam-legacy').click();
  const attemptId = after.replica.operations[0].payload.attemptId;
  await page.locator(`[data-mock-history="${attemptId}"]`).waitFor();
  assert.match(await page.locator(`[data-mock-history="${attemptId}"]`).innerText(), /on this device/iu);
  assert.equal(await page.locator(`[data-received-practice="${attemptId}"]`).count(), 0, 'Published response history must deduplicate the richer local attempt');
  const displayed = await uiNative(page);
  assert.deepEqual(displayed.replica.operations, after.replica.operations); assert.deepEqual(displayed.outbox, after.outbox);
  assert.deepEqual(recordOf(displayed).assessmentLibrary.attempts, recordOf(after).assessmentLibrary.attempts);
  return { started, before, after, reopened, displayed, publicReaderDisplay: 'Owned local row deduplicates the portable response view without claiming receive' };
});
test('rendered-abandonment-dismiss-and-rollback-preserve-ui', async (page) => {
  await openUiPractice(page); const before = await uiNative(page);
  await armRecordWriteFailure(page, 'abort', { roots: ['assessmentLibrary'] });
  await page.locator('#mock-drop').click(); await page.waitForFunction(() => window.__recordTestFault?.fired > 0);
  await page.waitForFunction(() => document.querySelector('#mock-drop')?.disabled === false);
  const fault = await clearRecordWriteFailure(page); assert.equal(fault.fired, 1);
  assert.equal(await page.locator('[data-mock-opt="0"]').count(), 1); assert.deepEqual(await uiNative(page), before);
  await page.reload(); await page.waitForFunction(() => document.body.dataset.ready === '1'); await page.locator('#mock-link').click();
  await page.locator('#mock-drop').waitFor(); await page.waitForFunction(() => document.querySelector('#mock-drop')?.disabled === false);
  const resumed = await uiNative(page); await page.locator('#mock-drop').click();
  await waitForAppRecord(page, (record) => record.assessmentLibrary.activeAttemptId === null && record.assessmentLibrary.attempts[0].status === 'abandoned');
  const after = await uiNative(page); assert.equal(after.outbox.length, 1); assert.equal(after.replica.operations[0].payload.outcome, 'abandoned');
  assert(after.replica.operations[0].payload.answers.every((answer) => answer.response.kind === 'no-response'));
  await page.locator('#exam-legacy').click();
  await page.locator('[data-mock-set="n5-01"]').waitFor();
  const attemptId = after.replica.operations[0].payload.attemptId;
  assert.match(await page.locator(`[data-mock-history="${attemptId}"]`).innerText(), /on this device/iu);
  assert.equal(await page.locator(`[data-received-practice="${attemptId}"]`).count(), 0);
  return { before, fault, resumed, after, publicReaderDisplay: 'Owned stopped full attempt deduplicates its published no-response payload' };
});
test('rendered-historical-mismatch-remains-local', async (page) => {
  await page.goto(`${origin}/practice-command-fixture`); await page.waitForFunction(() => !!window.fixture);
  await exact(page, ({ smallSet, time }) => {
    const api = window.fixture.assessment; const scope = { accountId: 'historical-account', learnerId: 'historical-learner' };
    const library = api.startLegacyPractice(api.createLibrary({ scope }), smallSet, { scope, attemptId: 'historical-attempt', now: time });
    localStorage.setItem('kairo-corridor-v1', JSON.stringify({ v: 1, taken: [], assessmentLibrary: library }));
  }, { smallSet, time });
  await page.goto(`${origin}/index.html?entry=shelf&ui=bi`); await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.locator('#mock-link').click(); await page.locator('#mock-drop').waitFor();
  await page.waitForFunction(() => document.querySelector('#mock-drop')?.disabled === false);
  const before = await uiNative(page); assert.notEqual(recordOf(before).assessmentLibrary.scope.accountId, before.policy.binding.accountId);
  await page.locator('#mock-drop').click(); await waitForAppRecord(page, (record) => record.assessmentLibrary.activeAttemptId === null);
  const after = await uiNative(page); assert.equal(recordOf(after).assessmentLibrary.attempts[0].status, 'abandoned');
  assert.deepEqual(recordOf(after).assessmentLibrary.scope, recordOf(before).assessmentLibrary.scope);
  assert.deepEqual(recordOf(after).assessmentLibrary.forms, recordOf(before).assessmentLibrary.forms);
  assert.equal(after.actor.sequence, 0); assert.deepEqual(after.outbox, []); assert.deepEqual(after.replica.operations, []); return { before, after };
});

for (const historyKind of ['identical-exam', 'tombstone']) for (const omit of [false, true]) {
  test(`history-eligibility-${historyKind}-${omit ? 'host-guards-omitted' : 'unchanged-host'}`, async (page, evidence) => {
    await initialize(page, { hostMutation: omit ? 'history-guards-omitted' : undefined });
    const command = await exact(page, () => window.fixture.command('abandoned'));
    const received = await exact(page, async ({ historyKind, command }) => {
      const f = window.fixture;
      const initial = await f.native();
      const library = initial.documents.find((row) => row.collection === 'learner-record' && row.id === 'current').value.assessmentLibrary;
      const options = { ...command.input }; delete options.expectedRevision;
      const proposal = f.assessment.finalizePractice(library, { ...options, commandId: command.meta.changeId, now: command.meta.occurredAt });
      const payload = historyKind === 'identical-exam' ? proposal.intent.payload :
        { kind: 'entity.tombstone', target: { kind: 'exam-attempt', id: command.input.attemptId }, reason: 'user-deleted' };
      const operation = f.core.createSyncOperation({ format: 'kairo-sync-operation', v: 1,
        scope: command.input.scope, actor: { deviceId: 'independent-review-remote', incarnationId: 'fixture', sequence: 1 },
        predecessor: null, dependencies: [], schemaEpoch: 1, deletionEpoch: 0, mergePolicy: f.policy.mergePolicy,
        occurredAt: command.meta.occurredAt, payload });
      const store = await f.core.IndexedDbReplicationStore.open({ databaseName: f.databaseName, policy: f.policy, actor: f.actor });
      try {
        await store.commitReceive({ deliveryId: 'independent-review-history', expectedRevision: initial.revision,
          delivery: { binding: f.policy.binding, operations: [operation] },
          checkpoint: { channelId: 'synthetic-review-history', expected: null, next: 'history-admitted' } });
      } finally { await store.close(); }
      await f.subject.snapshot();
      return operation;
    }, { historyKind, command });
    const before = await native(page);
    command.input.expectedRevision = before.revision;
    const result = await exact(page, (command) => window.fixture.run(command), command);
    const after = await native(page);
    const observation = { obligation: 'Both host and app must refuse preexisting attempt/tombstone history before commit',
      hostMutation: omit ? 'history-guards-omitted' : null, originalHostSha256: sha(hostBytes),
      exercisedHostSha256: sha(omit ? gateMutations.get('history-guards-omitted') : hostBytes), received, command, before, result, after };
    // Retain exact red state as well as green state if this invariant regresses.
    writeFileSync(resolve(evidence.directory, 'history-observation.json'), JSON.stringify(observation, null, 2) + '\n');
    if (!omit) {
      assert.equal(result.rejected, true);
      assert.equal(result.code, historyKind === 'identical-exam' ? 'practice-already-emitted' : 'practice-already-deleted');
    } else {
      assert.equal(result.status, 'recovery-required');
      assert.equal(result.reason, 'unexpected-sync-operations');
    }
    assert.deepEqual(after, before, 'Existing history must prevent every durable finalization side effect');
    assert.equal(await page.evaluate(() => window.fixture.publications.length), 0);
    return observation;
  });
}

assert.deepEqual(cases.map(entry => entry.name), CASES, 'Static list and executable gates must agree');
let stopped = false;
try {
  for (const engine of ENGINES) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true }); browserVersions[engine] = browser.version();
    try { for (const entry of cases.filter((entry) => requested(entry.name))) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      await silenceBrowserAudio(context);
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        externalRequests.push({ engine, name: entry.name, url: route.request().url() }); return route.abort();
      });
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const directory = resolve(OUT, engine, entry.name); mkdirSync(directory, { recursive: true });
      lifecycle.push({ action: 'context-open', engine, name: entry.name, silenceBeforeNavigation: true });
      const started = Date.now(); const caseErrors = [], diagnostics = [];
      page.on('pageerror', (error) => { const row = { engine, name: entry.name, message: error.message, stack: error.stack }; errors.push(row); caseErrors.push(row); });
      page.on('requestfailed', request => diagnostics.push({ kind: 'requestfailed', url: request.url(), failure: request.failure() }));
      page.on('console', message => { if (['error', 'warning'].includes(message.type())) diagnostics.push({ kind: message.type(), text: message.text(), location: message.location() }); });
      try {
        const detail = await entry.run(page, { directory, engine }); assert.deepEqual(caseErrors, []);
        assert.equal(await page.evaluate(() => globalThis[Symbol.for('kairo.test.silent-audio.v1')] === true), true);
        const readerProofs = await exact(page, () => window.fixture?.readerProofs || []);
        detail.readerProofs = readerProofs;
        const file = resolve(directory, 'evidence.json'); writeFileSync(file, JSON.stringify(detail, null, 2) + '\n');
        results.push({ engine, name: entry.name, pass: true, elapsedMs: Date.now() - started, evidence: { path: file, sha256: sha(readFileSync(file)) } });
      } catch (error) {
        await page.screenshot({ path: resolve(directory, 'failure.png'), fullPage: true }).catch(() => undefined);
        const state = await exact(page, async () => ({ readerProofs: window.fixture?.readerProofs || [],
          publications: window.fixture?.publications || [], native: window.fixture?.native ? await window.fixture.native() : null })).catch(error => ({ diagnosticFailure: error.message }));
        writeFileSync(resolve(directory, 'failure-state.json'), JSON.stringify(state, null, 2) + '\n');
        results.push({ engine, name: entry.name, pass: false, elapsedMs: Date.now() - started, message: error.message, stack: error.stack });
        stopped = true;
      } finally {
        writeFileSync(resolve(directory, 'diagnostics.json'), JSON.stringify(diagnostics, null, 2) + '\n');
        try { await context.tracing.stop({ path: resolve(directory, 'trace.zip') }); } finally {
          await context.close(); lifecycle.push({ action: 'context-closed', engine, name: entry.name });
        }
      }
      process.stdout.write(`${engine} ${entry.name}: ${results.at(-1).pass ? 'PASS' : 'FAIL'}\n`);
      if (stopped) break;
    } } finally { await browser.close(); }
    if (stopped) break;
  }
} finally {
  await new Promise((done) => server.close(done));
  bookends();
  const receipt = { version: 1, suite: 'record-practice-finalize', mode: FILTERS.size ? 'filtered' : 'full', filters: [...FILTERS], engines: ENGINES, browserVersions,
    artifactSha256: identity.artifactSha256, sourceAssetSha256: identity.sourceAssetSha256, selectedSite: SITE,
    verifierSha256: sourceSha256, helperSha256, bookendsPassed: true, verifiedArtifactFiles: identity.files.length,
    runtimeOverridden: !!OVERLAY, diagnosticRoot: !!process.env.KAIRO_EXAM_DIAGNOSTIC_ROOT, runtimeInputs,
    authoredNegativeHostMutations: [...gateMutations].map(([name, bytes]) => ({ name, sha256: sha(bytes), originalSha256: sha(hostBytes) })),
    fixture: { setSha256: sha(setBytes), syntheticSubsetSha256: digest(smallSet), authorization: 'synthetic-fixture-only' },
    audioOutput: TEST_AUDIO_OUTPUT, lifecycle,
    limitations: ['Synthetic isolated enrollment and command fixtures are not real account authorization',
      'Genuine IndexedDB reader and public snapshots establish no official scoring or evidence admission',
      'Named host negative variants change only the pinned finalization method; they are authored negative controls, not the unmodified product'],
    results, errors, externalRequests, pass: results.length === ENGINES.length * cases.filter((entry) => requested(entry.name)).length &&
      results.length > 0 && results.every((row) => row.pass) && errors.length === 0 && externalRequests.length === 0 };
  writeFileSync(resolve(OUT, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (!receipt.pass) process.exitCode = 1;
}
