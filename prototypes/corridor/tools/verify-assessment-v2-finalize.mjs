/** Real IndexedDB + Web Locks verification of the named v2 transaction.
 * The short-lived server and browser below belong only to this test. */
/* global window, navigator, IDBObjectStore, DOMException */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { buildCorridorModules } from '../../../scripts/build-reading-module.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
import { runReceivedAssessmentCases } from './assessment-v2-received-cases.mjs';
import { runAssessmentEnrichmentCases } from './assessment-v2-enrichment-cases.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = process.env.KAIRO_EVIDENCE_DIR ? resolveCorridorEvidence() : resolve(homedir(), '.dharma/bunki_assessment/2026-09-23/assessment-v2-finalize');
mkdirSync(out, { recursive: true });
const evidence = mkdtempSync(resolve(out, 'run-'));
const files = ['record-app.mjs', 'record-host.mjs', 'source-inbox.mjs', 'assessment-finalization.mjs',
  'assessment-v2-controller.mjs', 'assessment-learning.mjs', 'assessment-received.mjs', 'assessment-enrichment.mjs',
  'assessment-cloze.mjs', 'assessment-question-practice.mjs', 'sentence-practice.mjs', 'teacher-context.mjs', 'teacher-drafts.mjs', 'sentence-drafts.mjs'];
const assets = new Map(files.map((name) => [name, readFileSync(resolve(root, 'prototypes/corridor', name))]));
for (const module of buildCorridorModules(root)) assets.set(module.path, module.bytes);
const originalHost = assets.get('record-host.mjs').toString();
const start = originalHost.indexOf('  async #finalizeAssessment(');
const end = originalHost.indexOf('\n  async #suppressAssessment(', start);
const method = originalHost.slice(start, end);
const needle = 'const outcome = await this.#controller.commitLocal(request);';
assert.equal(method.split(needle).length, 2);
const tamperedHost = Buffer.from(originalHost.slice(0, start) +
  method.replace(needle, 'const outcome = await this.#controller.commitLocal({ ...request, operations: [] });') + originalHost.slice(end));
const receivedStart = originalHost.indexOf('  async #reconcileAssessments(');
const receivedEnd = originalHost.indexOf('\n  #confirmSourceReference(', receivedStart);
const receivedMethod = originalHost.slice(receivedStart, receivedEnd);
assert.equal(receivedMethod.split(needle).length, 2);
const tamperedReceivedHost = Buffer.from(originalHost.slice(0, receivedStart) + receivedMethod.replace(needle,
  "request.mutations[0].value.taken = []; const outcome = await this.#controller.commitLocal(request);") + originalHost.slice(receivedEnd));
const enrichStart = originalHost.indexOf('  async #enrichAssessment(');
const enrichEnd = originalHost.indexOf('  async #reconcileAssessments(', enrichStart);
const enrichMethod = originalHost.slice(enrichStart, enrichEnd);
assert.equal(enrichMethod.split(needle).length, 2);
const tamperedEnrichmentHost = Buffer.from(originalHost.slice(0, enrichStart) + enrichMethod.replace(needle,
  'const outcome = await this.#controller.commitLocal({ ...request, operations: [] });') + originalHost.slice(enrichEnd));
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const variant = url.pathname.match(/^\/(bad|bad-received|bad-enrich)\//u)?.[1] || '';
  const name = url.pathname.replace(/^\/(?:(?:bad|bad-received|bad-enrich)\/)?/u, '');
  response.setHeader('cache-control', 'no-store');
  if (name === 'fixture') {
    const prefix = variant ? `/${variant}` : '';
    response.setHeader('content-type', 'text/html');
    response.end(`<script type="module">import * as app from '${prefix}/record-app.mjs';import * as core from '${prefix}/modules/record-core.mjs';import * as assessment from '${prefix}/assessment-v2-controller.mjs';import * as content from '${prefix}/modules/assessment-core.mjs';window.fixture={app,core,assessment,content};</script>`);
  } else if (assets.has(name)) {
    response.setHeader('content-type', 'text/javascript');
    response.end(name === 'record-host.mjs' && variant ? variant === 'bad' ? tamperedHost : variant === 'bad-received' ? tamperedReceivedHost : tamperedEnrichmentHost : assets.get(name));
  } else response.writeHead(404).end();
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
const failures = [];
const engines = process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER || 'chromium'];
assert(engines.every((name) => ['chromium', 'webkit'].includes(name)));
async function initialize(page, bad = false) {
  await page.goto(`${origin}/${bad === true ? 'bad/' : bad ? `${bad}/` : ''}fixture`);
  await page.waitForFunction(() => !!window.fixture);
  await page.evaluate(async () => {
    const f = window.fixture;
    const policy = { binding: { accountId: 'assessment-test', learnerId: 'learner-test', sessionId: 'session-test' },
      schemaEpoch: 1, deletionEpoch: 0, mergePolicy: 'kairo-conservative-merge/1' };
    const scope = { accountId: policy.binding.accountId, learnerId: policy.binding.learnerId };
    const now = Date.parse('2026-09-23T00:00:00Z');
    const rights = f.content.unknownAssessmentRights();
    const provenance = { kind: 'original-human', authorRef: 'synthetic-fixture-only', processRef: null, sources: [] };
    const items = ['one', 'two', 'three'].map((id) => f.content.createItemVersion({
      format: 'kairo-assessment-item', v: 1, id, provenance, rights, skill: 'grammar', task: 'synthetic-choice',
      prompt: '合成テストの質問。', translatedInstruction: null, rationale: 'Synthetic contract fixture, not teaching content.',
      passages: [], media: [], subjects: [`word:${id}`],
      response: { kind: 'selected', options: [{ id: 'a', text: '一' }, { id: 'b', text: '二' }], answerOptionId: 'a' },
    }));
    const form = f.content.createFormVersion({ format: 'kairo-assessment-form', v: 1, id: 'form:synthetic',
      provenance, rights, title: 'Synthetic fixture', exam: { family: 'jlpt', track: 'N2' },
      scope: 'short-practice', blueprintId: null, items, passages: [], media: [],
      sections: [{ id: 'grammar', title: 'Synthetic', skill: 'grammar', itemIds: items.map((item) => item.id) }],
      timingBlocks: [{ id: 'block:grammar', sectionIds: ['grammar'], durationMs: 60_000,
        clock: 'elapsed-including-interruptions', authority: { kind: 'authoring-rule', ruleId: 'fixture/v1' } }],
      authoring: { policyVersion: 'fixture/v1', countsAre: 'authoring-rules', requirements: [] } });
    f.form = form;
    let library = f.assessment.startAssessmentV2(f.assessment.createAssessmentLibraryV2({ scope }), form,
      { scope, attemptId: 'attempt:test', mode: 'timed', now, clockSessionId: 'clock:test', monotonicMs: 0,
        editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-test-only', decisionRevisionIds: ['synthetic:no-content-approval'] } });
    for (const itemId of ['one', 'two']) {
      library = f.assessment.commandAssessmentV2(library, { scope, attemptId: 'attempt:test',
        expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId,
        now: now + 100, clockSessionId: 'clock:test', monotonicMs: 100, action: { kind: 'visit', itemId } });
      library = f.assessment.commandAssessmentV2(library, { scope, attemptId: 'attempt:test',
        expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId,
        now: now + 200, clockSessionId: 'clock:test', monotonicMs: 200,
        action: { kind: 'answer', itemId, response: { kind: 'selected', optionId: 'b' } } });
    }
    let held = false, release;
    await new Promise((done, fail) => navigator.locks.request('assessment-test-writer', { ifAvailable: true }, async (lock) => {
      if (!lock) return fail(new Error('Lock unavailable'));
      held = true; const lifetime = new Promise((resolve) => { release = resolve; }); done(); await lifetime;
    }).catch(fail));
    f.release = () => { held = false; release(); };
    const token = { ownerId: 'owner:fixture', epoch: 1, sessionId: policy.binding.sessionId };
    const writer = { capture: () => ({ ...token }), assert: (value) => held && value.ownerId === token.ownerId && value.epoch === token.epoch && value.sessionId === token.sessionId };
    f.store = await f.core.IndexedDbReplicationStore.open({ databaseName: 'assessment-finalize-fixture', policy,
      actor: { deviceId: 'device:test', incarnationId: 'install:test' } });
    const record = { v: 2, taken: [{ t: 'word', id: 'one', started: 123, ts: 123, label: 'Existing' }],
      srs: { 'word:one': { due: 999, stability: 12 } }, revlog: [[111, 'word:one', 3]], obslog: [],
      unknown: { preserved: true }, assessmentLibraryV2: library };
    await f.store.commitLocal({ changeId: 'seed', binding: policy.binding, expectedRevision: 0,
      occurredAt: new Date(now).toISOString(), mutations: [
        { kind: 'put', collection: 'learner-record', id: 'current', value: record },
        { kind: 'put', collection: 'learner-archive', id: 'current', value: { version: 1, turns: [] } }], operations: [] });
    f.controller = { snapshot: async () => ({ status: 'active', snapshot: await f.store.snapshot() }),
      commitLocal: async (request) => ({ status: 'active', receipt: await f.store.commitLocal(request) }) };
    f.realCommit = f.controller.commitLocal;
    f.published = [];
    f.options = { controller: f.controller, binding: policy.binding, writer,
      validateRecord: (value) => [1, 2].includes(value.v) && Array.isArray(value.taken), validateArchive: Array.isArray,
      assessmentSubjectResolver: (subject) => ({ t: 'word', id: subject.slice(5), label: 'Synthetic vocabulary' }),
      onPublish: (value) => f.published.push(value.receipt.changeId) };
    f.instance = await f.app.createRecordApp(f.options);
    f.meta = { changeId: 'finish:test', occurredAt: new Date(now + 500).toISOString() };
    f.input = { scope, expectedRevision: 1, attemptId: 'attempt:test',
      expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId,
      clockSessionId: 'clock:test', monotonicMs: 500, action: { kind: 'submit' } };
    f.disk = async () => JSON.parse(JSON.stringify(await f.store.snapshot()));
    f.finish = () => f.instance.finalizeAssessment(f.meta, f.input);
  });
}
async function runCase(browser, engine, name, body, bad = false) {
  if (process.argv.includes('--received-only') && !name.startsWith('received-')) return;
  if (process.argv.includes('--enrichment-only') && !name.startsWith('enrichment-')) return;
  if (process.argv.includes('--question-only') && !name.includes('question')) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (error) => errors.push(String(error)));
  try {
    await initialize(page, bad);
    await body(page);
    assert.deepEqual(errors, []);
    results.push({ engine, name, passes: true });
  } catch (error) { failures.push({ engine, name, error: String(error), pageErrors: errors }); }
  finally { await context.close(); }
}
try {
  for (const engine of engines) {
    const browser = await ({ chromium, webkit }[engine]).launch({ headless: true });
    try {
      await runCase(browser, engine, 'atomic-result-followup-outbox-preserves-study-history', async (page) => {
        const value = await page.evaluate(async () => { const f = window.fixture; return { ack: await f.finish(), disk: await f.disk() }; });
        assert.equal(value.ack.status, 'active');
        const record = value.ack.snapshot.record;
        assert.equal(record.assessmentLibraryV2.attempts[0].status, 'submitted');
        assert.equal(record.assessmentLearning.followups.length, 1);
        assert.equal(record.taken.length, 2);
        assert.deepEqual(record.srs, { 'word:one': { due: 999, stability: 12 } });
        assert.deepEqual(record.revlog, [[111, 'word:one', 3]]);
        assert.deepEqual(record.obslog, []);
        assert.equal(record.taken[0].started, 123);
        assert.equal(value.disk.outbox.length, 2);
        assert.deepEqual(value.disk.outbox.toSorted((a, b) => a.actor.sequence - b.actor.sequence).map((operation) => operation.payload.kind), ['assessment.result/2', 'learning.followup/2']);
        assert.equal(value.disk.documents.filter((entry) => entry.collection === 'kairo:record-host-commands').length, 1);
      });
      // G1 KE2a driver: a lawful assisted practice finalization through the real host and store,
      // with no injected fault. The host's record check runs the app's own learning-record
      // validator and keeps its refusal text. Candidate: accepted, the mark carried into
      // evidence, no refusal. Under KE2a (finalization mapper drops the mark) the refusal row
      // below fails with evidence-mismatch and reports whether durable state stayed unchanged.
      await runCase(browser, engine, 'assisted-finalization-carries-the-mark-through-the-validator', async (page) => {
        const value = await page.evaluate(async () => {
          const f = window.fixture;
          const learning = await import('/assessment-learning.mjs');
          const scope = f.input.scope, now = Date.parse('2026-09-23T00:00:00Z');
          let refusal = null;
          const validateRecord = (record) => {
            if (!f.options.validateRecord(record)) return false;
            try { return record.assessmentLearning == null || learning.validateAssessmentLearningRecord(record) === true; }
            catch (error) { refusal = String(error?.message || error); return false; }
          };
          f.instance = await f.app.createRecordApp({ ...f.options, validateRecord });
          let library = f.assessment.startAssessmentV2(f.assessment.createAssessmentLibraryV2({ scope }), f.form,
            { scope, attemptId: 'attempt:why', mode: 'practice', now, clockSessionId: 'clock:why', monotonicMs: 0,
              editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-test-only', decisionRevisionIds: ['synthetic:no-content-approval'] } });
          const step = (action, ms) => { library = f.assessment.commandAssessmentV2(library, { scope, attemptId: 'attempt:why',
            expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId,
            now: now + ms, clockSessionId: 'clock:why', monotonicMs: ms, action }); };
          step({ kind: 'answer', itemId: 'one', response: { kind: 'selected', optionId: 'b' } }, 100);
          step({ kind: 'assistance', itemId: 'one', reason: 'explanation' }, 200);
          step({ kind: 'visit', itemId: 'two' }, 300);
          step({ kind: 'answer', itemId: 'two', response: { kind: 'selected', optionId: 'a' } }, 400);
          const mark = f.assessment.selectAssessmentV2(library).attempt.answers[0].assistance || null;
          const seeded = await f.instance.write(() => ({ patch: { assessmentLibraryV2: library } }));
          const before = await f.disk();
          const input = { scope, attemptId: 'attempt:why', clockSessionId: 'clock:why', monotonicMs: 500, action: { kind: 'submit' },
            expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId };
          let ack;
          try {
            ack = await f.instance.finalizeAssessment({ changeId: 'finish:why', occurredAt: new Date(now + 500).toISOString() },
              (snapshot) => ({ ...input, expectedRevision: snapshot.revision }));
          } catch (error) { ack = { status: 'thrown', reason: error?.code ?? String(error?.message || error) }; }
          const after = await f.disk();
          const record = ack.status === 'active' ? ack.snapshot.record : null;
          return { seeded: seeded.status, mark, refusal, unchanged: JSON.stringify(after) === JSON.stringify(before),
            ack: { status: ack.status, reason: ack.reason ?? null },
            status: record?.assessmentLibraryV2.attempts.find((row) => row.attemptId === 'attempt:why')?.status ?? null,
            evidence: record?.assessmentLearning.followups.find((row) => row.attemptId === 'attempt:why')
              ?.evidence.map((row) => row.assistance ?? null) ?? null };
        });
        // setup: the marked practice attempt was stored through an ordinary write
        assert.equal(value.seeded, 'active');
        assert(value.mark && value.mark.kind === 'explanation');
        // KE2a's permitted failing row: a validator refusal (its text and durable state reported)
        assert.equal(value.refusal, null,
          `validator refused: ${value.refusal}; durable state unchanged: ${value.unchanged}; ack: ${JSON.stringify(value.ack)}`);
        // candidate: accepted terminal with the item mark carried into evidence, and no other
        assert.equal(value.ack.status, 'active');
        assert.equal(value.status, 'submitted');
        assert.deepEqual(value.evidence, [{ kind: value.mark.kind, at: value.mark.at }, null, null]);
      });
      await runCase(browser, engine, 'assessment-input-producer-runs-after-queued-write-and-retains-exact-retry', async (page) => {
        const value = await page.evaluate(async () => {
          const f = window.fixture; let retained;
          const write = f.instance.write(() => ({ patch: { unrelated: 'queued before finalization' } }));
          const finished = f.instance.finalizeAssessment(f.meta, snapshot => {
            retained = { ...f.input, expectedRevision: snapshot.revision };
            if (snapshot.record.unrelated !== 'queued before finalization') throw new Error('Producer ran before queued write');
            return retained;
          });
          const [written, ack] = await Promise.all([write, finished]);
          const before = await f.disk(); const retry = await f.instance.finalizeAssessment(f.meta, retained);
          return { written, ack, before, retry, after: await f.disk(), retained };
        });
        assert.equal(value.written.status, 'active'); assert.equal(value.ack.status, 'active');
        assert.equal(value.retained.expectedRevision, value.written.snapshot.revision);
        assert.equal(value.retry.receipt.outcome, 'duplicate'); assert.deepEqual(value.after, value.before);
        assert.equal(value.ack.snapshot.record.unrelated, 'queued before finalization');
      });
      await runCase(browser, engine, 'assessment-async-input-producer-is-rejected-before-write', async (page) => {
        const value = await page.evaluate(async () => {
          const f = window.fixture, before = await f.disk(); let error;
          try { await f.instance.finalizeAssessment(f.meta, async () => f.input); } catch (caught) { error = caught.code; }
          return { error, before, after: await f.disk() };
        });
        assert.equal(value.error, 'async-assessment-producer'); assert.deepEqual(value.after, value.before);
      });
      await runCase(browser, engine, 'native-quota-abort-rolls-back-entire-assessment', async (page) => {
        const value = await page.evaluate(async () => {
          const f = window.fixture, before = await f.disk();
          const original = IDBObjectStore.prototype.put; let fired = false;
          IDBObjectStore.prototype.put = function (...args) {
            if (!fired && args[0]?.kind === 'document') { fired = true; throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); }
            return original.apply(this, args);
          };
          let ack;
          try { ack = await f.finish(); } finally { IDBObjectStore.prototype.put = original; }
          return { before, after: await f.disk(), ack, fired, published: f.published.length };
        });
        assert.equal(value.fired, true); assert.equal(value.ack.status, 'recovery-required');
        assert.deepEqual(value.after, value.before); assert.equal(value.published, 0);
      });
      await runCase(browser, engine, 'lost-ack-retry-confirms-once-without-reenrollment', async (page) => {
        const value = await page.evaluate(async () => {
          const f = window.fixture;
          f.controller.commitLocal = async (request) => { await f.realCommit(request); throw new Error('Synthetic lost acknowledgement'); };
          const first = await f.finish();
          f.controller.commitLocal = f.realCommit;
          f.instance = await f.app.createRecordApp(f.options);
          await f.instance.write((record) => ({ patch: { taken: record.taken.filter((row) => row.id !== 'two'), unrelated: 'later' } }));
          const before = await f.disk(); const retry = await f.finish();
          return { first, retry, before, after: await f.disk() };
        });
        assert.equal(value.first.status, 'recovery-required');
        assert.equal(value.retry.status, 'active'); assert.equal(value.retry.receipt.outcome, 'duplicate');
        assert.equal(value.retry.replayUiEffects, false); assert.deepEqual(value.after, value.before);
        assert.equal(value.retry.snapshot.record.taken.some((row) => row.id === 'two'), false);
      });
      await runCase(browser, engine, 'stale-profile-and-owner-loss-prevent-writes', async (page) => {
        const value = await page.evaluate(async () => {
          const f = window.fixture;
          await f.instance.write(() => ({ patch: { unrelated: 'concurrent' } }));
          const before = await f.disk(); let stale;
          try { stale = await f.finish(); } catch (error) { stale = { code: error.code }; }
          f.release(); let lost; try { lost = await f.finish(); } catch (error) { lost = { status: 'recovery-required', code: error.code }; }
          return { before, after: await f.disk(), stale, lost };
        });
        assert.equal(value.stale.code, 'assessment-store-superseded');
        assert.equal(value.lost.status, 'recovery-required'); assert.deepEqual(value.after, value.before);
      });
      await runCase(browser, engine, 'independent-app-gate-rejects-host-omitted-operations', async (page) => {
        const value = await page.evaluate(async () => { const f = window.fixture; const before = await f.disk();
          return { before, ack: await f.finish(), after: await f.disk() }; });
        assert.equal(value.ack.status, 'recovery-required'); assert.equal(value.ack.reason, 'unexpected-sync-operations');
        assert.deepEqual(value.after, value.before);
      }, true);
      await runCase(browser, engine, 'undo-emits-suppression-and-preserves-existing-study', async (page) => {
        const value = await page.evaluate(async () => {
          const f = window.fixture; const finished = await f.finish();
          const followup = finished.snapshot.record.assessmentLearning.followups[0];
          const meta = { changeId: 'undo:test', occurredAt: '2026-09-23T00:00:01.000Z' };
          const input = { expectedRevision: finished.snapshot.revision, scope: finished.snapshot.identity,
            kind: 'undo', followupId: followup.id };
          const ack = await f.instance.suppressAssessmentLearning(meta, input);
          return { ack, disk: await f.disk() };
        });
        assert.equal(value.ack.status, 'active');
        assert.deepEqual(value.ack.learningSuppression.keys, ['word:two']);
        assert.equal(value.ack.learningSuppression.remaining, 0);
        assert.equal(value.ack.snapshot.record.taken.length, 1);
        assert.equal(value.ack.snapshot.record.taken[0].id, 'one');
        assert.deepEqual(value.ack.snapshot.record.srs, { 'word:one': { due: 999, stability: 12 } });
        assert.equal(value.disk.outbox.filter((row) => row.payload.kind === 'learning.suppress/2').length, 1);
      });
      await runCase(browser, engine, 'remove-retry-does-not-delete-a-later-manual-retake', async (page) => {
        const value = await page.evaluate(async () => {
          const f = window.fixture; const finished = await f.finish();
          const meta = { changeId: 'remove:test', occurredAt: '2026-09-23T00:00:01.000Z' };
          const input = { expectedRevision: finished.snapshot.revision, scope: finished.snapshot.identity, kind: 'remove', key: 'word:two' };
          f.controller.commitLocal = async (request) => { await f.realCommit(request); throw new Error('Synthetic lost suppression acknowledgement'); };
          const first = await f.instance.suppressAssessmentLearning(meta, input);
          f.controller.commitLocal = f.realCommit; f.instance = await f.app.createRecordApp(f.options);
          await f.instance.write((record) => ({ patch: { taken: [...record.taken, { t: 'word', id: 'two', ts: 1234, started: 1234 }] } }));
          const before = await f.disk(); const retry = await f.instance.suppressAssessmentLearning(meta, input);
          return { first, before, retry, after: await f.disk() };
        });
        assert.equal(value.first.status, 'recovery-required');
        assert.equal(value.retry.status, 'active'); assert.equal(value.retry.receipt.outcome, 'duplicate');
        assert.equal(value.retry.replayUiEffects, false); assert.deepEqual(value.after, value.before);
        assert.equal(value.retry.snapshot.record.taken.find((row) => row.id === 'two').started, 1234);
      });
      await runCase(browser, engine, 'suppression-quota-abort-keeps-card-and-outbox-unchanged', async (page) => {
        const value = await page.evaluate(async () => {
          const f = window.fixture; const finished = await f.finish(); const before = await f.disk();
          const original = IDBObjectStore.prototype.put; let fired = false;
          IDBObjectStore.prototype.put = function (...args) {
            if (!fired && args[0]?.kind === 'document') { fired = true; throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); }
            return original.apply(this, args);
          };
          let ack;
          try { ack = await f.instance.suppressAssessmentLearning({ changeId: 'remove:test', occurredAt: '2026-09-23T00:00:01.000Z' },
            { expectedRevision: finished.snapshot.revision, scope: finished.snapshot.identity, kind: 'remove', key: 'word:two' }); }
          finally { IDBObjectStore.prototype.put = original; }
          return { before, after: await f.disk(), ack, fired };
        });
        assert.equal(value.fired, true); assert.equal(value.ack.status, 'recovery-required'); assert.deepEqual(value.after, value.before);
      });
      await runCase(browser, engine, 'large-undo-completes-in-bounded-atomic-batches', async (page) => {
        const value = await page.evaluate(async () => {
          const f = window.fixture, current = f.instance.current(), scope = current.snapshot.identity;
          const payload = (value) => { const rest = JSON.parse(JSON.stringify(value)); delete rest.revisionId; delete rest.sha256; return rest; };
          const items = Array.from({ length: 101 }, (_, index) => f.content.createItemVersion({
            ...payload(f.form.items[0]), id: `large:${index}`, subjects: [`word:auto-${index}`] }));
          const form = f.content.createFormVersion({ ...payload(f.form), id: 'form:large', items,
            sections: [{ ...f.form.sections[0], itemIds: items.map((item) => item.id) }] });
          const now = Date.parse('2026-09-23T00:00:00Z');
          let library = f.assessment.startAssessmentV2(f.assessment.createAssessmentLibraryV2({ scope }), form,
            { scope, attemptId: 'attempt:large', mode: 'practice', now, clockSessionId: 'clock:test', monotonicMs: 0,
              editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-test-only', decisionRevisionIds: ['synthetic:no-content-approval'] } });
          for (const item of items) for (const action of [{ kind: 'visit', itemId: item.id },
            { kind: 'answer', itemId: item.id, response: { kind: 'selected', optionId: 'b' } }])
            library = f.assessment.commandAssessmentV2(library, { scope, attemptId: 'attempt:large',
              expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId,
              now, clockSessionId: 'clock:test', monotonicMs: 0, action });
          const staged = await f.instance.write(() => ({ patch: { assessmentLibraryV2: library } }));
          const final = await f.instance.finalizeAssessment({ changeId: 'finish:large', occurredAt: '2026-09-23T00:00:01.000Z' },
            { expectedRevision: staged.snapshot.revision, scope, attemptId: 'attempt:large',
              expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId,
              clockSessionId: 'clock:test', monotonicMs: 1000, action: { kind: 'submit' } });
          const followupId = final.snapshot.record.assessmentLearning.followups[0].id;
          const first = await f.instance.suppressAssessmentLearning({ changeId: 'undo:large-1', occurredAt: '2026-09-23T00:00:02.000Z' },
            { expectedRevision: final.snapshot.revision, scope, kind: 'undo', followupId });
          const second = await f.instance.suppressAssessmentLearning({ changeId: 'undo:large-2', occurredAt: '2026-09-23T00:00:03.000Z' },
            { expectedRevision: first.snapshot.revision, scope, kind: 'undo', followupId });
          return { first: first.learningSuppression, second: second.learningSuppression,
            taken: second.snapshot.record.taken, operations: (await f.disk()).outbox.length };
        });
        assert.equal(value.first.keys.length, 100); assert.equal(value.first.remaining, 1);
        assert.equal(value.second.keys.length, 1); assert.equal(value.second.remaining, 0);
        assert.deepEqual(value.taken.map((row) => row.id), ['one']); assert.equal(value.operations, 103);
      });
      await runReceivedAssessmentCases(browser, engine, runCase);
      await runAssessmentEnrichmentCases(browser, engine, runCase);
    } finally { await browser.close(); }
  }
} finally { await new Promise((done) => server.close(done)); }
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
writeFileSync(resolve(evidence, 'receipt.json'), `${JSON.stringify({
  format: 'kairo-assessment-v2-finalization-verification', v: 1, results, failures,
  assets: [...assets].map(([path, bytes]) => ({ path, sha256: sha256(bytes) })),
  limits: ['synthetic fixtures', 'no product UI or editorial approval'],
}, null, 2)}\n`);
console.log(`Assessment v2 finalization: ${results.length}/${results.length + failures.length} passed. ${resolve(evidence, 'receipt.json')}`);
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
