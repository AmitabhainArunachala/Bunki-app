/** Invoked by verify-assessment-v2-finalize.mjs with real browser stores. */
/* global window, IDBObjectStore, DOMException */
import assert from 'node:assert/strict';

async function recipient(page, { formAvailable = true, targetAvailable = true, corruptResponse = false, cloze = false, question = false,
  assisted = false } = {}) {
  await page.evaluate(async ({ formAvailable, targetAvailable, corruptResponse, cloze, question, assisted }) => {
    const f = window.fixture;
    if (assisted) {
      // G1: a practice sitting where 'two' is correct and assisted, so it is eligible only through its mark
      const scope = f.instance.current().snapshot.identity, now = Date.parse('2026-09-23T00:00:00Z');
      let library = f.assessment.startAssessmentV2(f.assessment.createAssessmentLibraryV2({ scope }), f.form,
        { scope, attemptId: 'attempt:test', mode: 'practice', now, clockSessionId: 'clock:test', monotonicMs: 0,
          editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-test-only', decisionRevisionIds: ['synthetic:no-content-approval'] } });
      for (const [action, ms] of [[{ kind: 'answer', itemId: 'one', response: { kind: 'selected', optionId: 'b' } }, 100],
        [{ kind: 'visit', itemId: 'two' }, 200], [{ kind: 'answer', itemId: 'two', response: { kind: 'selected', optionId: 'a' } }, 300],
        [{ kind: 'assistance', itemId: 'two', reason: 'explanation' }, 400]])
        library = f.assessment.commandAssessmentV2(library, { scope, attemptId: 'attempt:test',
          expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId,
          now: now + ms, clockSessionId: 'clock:test', monotonicMs: ms, action });
      const ack = await f.instance.write(() => ({ patch: { assessmentLibraryV2: library } }));
      f.input.expectedRevision = ack.snapshot.revision;
      f.input.expectedRevisionId = f.assessment.selectAssessmentV2(library).attempt.revisionId;
    }
    if (cloze || question) {
      const payload = (value) => { const body = JSON.parse(JSON.stringify(value)); delete body.revisionId; delete body.sha256; return body; };
      const formPayload = payload(f.form);
      formPayload.rights.adapt = { status: 'allowed', basisRef: 'synthetic-fixture-original', policyVersion: 'synthetic/v1' };
      const selected = payload(f.form.items.find((row) => row.id === 'two'));
      selected.rights.adapt = formPayload.rights.adapt;
      if (question) {
        for (const kind of ['display', 'retain']) formPayload.rights[kind] = selected.rights[kind] = formPayload.rights.adapt;
        selected.subjects = []; selected.task = 'sentence-composition'; selected.prompt = 'この文の意味に合う答えを選んでください。';
      } else {
        selected.task = 'grammar-form'; selected.prompt = '駅へ（　）います。';
        selected.response.options = [{ id: 'a', text: '行って' }, { id: 'b', text: '行った' }];
      }
      f.form = f.content.createFormVersion({ ...formPayload, items: f.form.items.map((row) => row.id === 'two' ? f.content.createItemVersion(selected) : row) });
      const scope = f.instance.current().snapshot.identity;
      let library = f.assessment.startAssessmentV2(f.assessment.createAssessmentLibraryV2({ scope }), f.form,
        { scope, attemptId: 'attempt:test', mode: 'timed', now: Date.parse('2026-09-23T00:00:00Z'), clockSessionId: 'clock:test', monotonicMs: 0,
          editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-test-only', decisionRevisionIds: ['synthetic:no-content-approval'] } });
      for (const itemId of ['one', 'two']) for (const action of [{ kind: 'visit', itemId },
        { kind: 'answer', itemId, response: { kind: 'selected', optionId: 'b' } }])
        library = f.assessment.commandAssessmentV2(library, { scope, attemptId: 'attempt:test',
          expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId,
          now: Date.parse('2026-09-23T00:00:00Z'), clockSessionId: 'clock:test', monotonicMs: 0, action });
      const ack = await f.instance.write(() => ({ patch: { assessmentLibraryV2: library } }));
      f.input.expectedRevision = ack.snapshot.revision;
      f.input.expectedRevisionId = f.assessment.selectAssessmentV2(library).attempt.revisionId;
    }
    const finish = await f.finish();
    if (finish.status !== 'active') throw new Error(`Source finish ${finish.reason}`);
    const sender = await f.store.snapshot(), policy = sender.policy;
    f.senderOperations = sender.outbox.toSorted((a, b) => a.actor.sequence - b.actor.sequence);
    if (corruptResponse) {
      let predecessor = null;
      f.senderOperations = f.senderOperations.map((original) => {
        const input = JSON.parse(JSON.stringify(original)); delete input.opId; delete input.payloadSha256;
        input.predecessor = predecessor;
        if (input.payload.kind === 'assessment.result/2') input.payload.items.find((row) => row.item.id === 'two').response.optionId = 'a';
        const operation = f.core.createSyncOperationV2(input);
        predecessor = f.core.operationReference(operation); return operation;
      });
    }
    f.recipientStore = await f.core.IndexedDbReplicationStore.open({ databaseName: 'assessment-recipient', policy,
      actor: { deviceId: 'device:recipient', incarnationId: 'install:recipient' } });
    const record = { v: 1, taken: [], srs: { 'word:one': { due: 7000, stability: 44 } },
      revlog: [[123, 'word:one', 4]], obslog: [], untouched: { keep: true } };
    await f.recipientStore.commitLocal({ changeId: 'seed:recipient', binding: policy.binding, expectedRevision: 0,
      occurredAt: '2026-09-23T00:00:00.000Z', mutations: [
        { kind: 'put', collection: 'learner-record', id: 'current', value: record },
        { kind: 'put', collection: 'learner-archive', id: 'current', value: { version: 1, turns: [] } }], operations: [] });
    f.recipientController = { snapshot: async () => ({ status: 'active', snapshot: await f.recipientStore.snapshot() }),
      commitLocal: async (request) => ({ status: 'active', receipt: await f.recipientStore.commitLocal(request) }) };
    f.recipientRealCommit = f.recipientController.commitLocal;
    f.formAvailable = formAvailable;
    f.targetAvailable = targetAvailable;
    f.recipientOptions = { ...f.options, controller: f.recipientController, onPublish: undefined,
      assessmentSubjectResolver: (subject, item, current) => !f.targetAvailable && subject === 'word:two' ? null
        : f.options.assessmentSubjectResolver(subject, item, current),
      assessmentFormResolver: (ref) => f.formAvailable && ref.sha256 === f.form.sha256 ? { form: f.form,
        editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-test-only', decisionRevisionIds: ['synthetic:no-content-approval'] } } : null };
    f.recipientApp = await f.app.createRecordApp(f.recipientOptions);
    f.receiveSerial = 0; f.receiveCursor = null; f.reconcileSerial = 0;
    f.receive = async (operations = f.senderOperations) => {
      const snapshot = await f.recipientStore.snapshot(); const serial = ++f.receiveSerial;
      const receipt = await f.recipientStore.commitReceive({ deliveryId: `received:${serial}`, expectedRevision: snapshot.revision,
        delivery: { binding: policy.binding, operations }, checkpoint: { channelId: 'test:channel', expected: f.receiveCursor, next: `cursor:${serial}` } });
      f.receiveCursor = `cursor:${serial}`; return receipt;
    };
    f.reconcile = (meta) => f.recipientApp.reconcileReceivedAssessments(meta || {
      changeId: `reconcile:${++f.reconcileSerial}`, occurredAt: '2026-09-23T00:00:02.000Z' });
    f.recipientDisk = async () => JSON.parse(JSON.stringify(await f.recipientStore.snapshot()));
    const received = await import('/assessment-received.mjs');
    f.summary = (value) => received.receivedAssessmentEvidenceSummary(value.snapshot.record, value.snapshot);
  }, { formAvailable, targetAvailable, corruptResponse, cloze, question, assisted });
}

export async function runReceivedAssessmentCases(browser, engine, runCase) {
  // G1 received adapter, enrollment and duplicate receive through the real recipient host. The sender's
  // 'two' is correct, unflagged and assisted: the recipient enrolls it through the wire flag alone,
  // once, and a redelivery adds nothing. Under K7b (the view ignores the flag) the card is absent.
  await runCase(browser, engine, 'received-assisted-correct-enrolls-once-through-the-wire-flag', async (page) => {
    await recipient(page, { assisted: true });
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive(); const applied = await f.reconcile();
      await f.receive(); const repeated = await f.reconcile();
      return { applied, repeated, after: await f.recipientDisk(), wire: f.senderOperations };
    });
    // setup: the sender's result carries the literal flag on the assisted item only
    const result = value.wire.find((row) => row.payload.kind === 'assessment.result/2');
    assert.deepEqual(result.payload.items.filter((row) => row.assisted === true).map((row) => row.item.id), ['two']);
    assert.equal(value.applied.status, 'active');
    const record = value.applied.snapshot.record;
    assert.deepEqual(record.taken.map((row) => row.id), ['two']);
    assert(record.taken[0].assessmentReceivedRef);
    assert.equal(record.assessmentReceived.followups[0].status, 'applied');
    assert.deepEqual(record.srs, { 'word:one': { due: 7000, stability: 44 } });
    assert.deepEqual(record.revlog, [[123, 'word:one', 4]]);
    assert.equal(value.repeated.status, 'active'); assert.equal(value.repeated.receipt, undefined);
    assert.deepEqual(value.repeated.snapshot.record, record);
    assert.equal(value.after.replica.operations.length, 2); assert.equal(value.after.outbox.length, 0);
  });
  // The negative companion: strip only the wire flag, reseal, and the same action is ineligible.
  await runCase(browser, engine, 'received-stripped-flag-makes-the-assisted-action-ineligible', async (page) => {
    await recipient(page, { assisted: true });
    const value = await page.evaluate(async () => {
      const f = window.fixture; let predecessor = null;
      const stripped = f.senderOperations.map((original) => {
        const input = JSON.parse(JSON.stringify(original)); delete input.opId; delete input.payloadSha256;
        input.predecessor = predecessor;
        if (input.payload.kind === 'assessment.result/2') delete input.payload.items.find((row) => row.item.id === 'two').assisted;
        const operation = f.core.createSyncOperationV2(input); predecessor = f.core.operationReference(operation); return operation;
      });
      await f.receive(stripped); const observed = await f.reconcile();
      return { observed, wire: f.senderOperations, stripped };
    });
    // setup: the original carried the flag; only the flag was removed (the aggregate condition stays)
    const original = value.wire.find((row) => row.payload.kind === 'assessment.result/2');
    const stripped = value.stripped.find((row) => row.payload.kind === 'assessment.result/2');
    assert.deepEqual(original.payload.items.filter((row) => row.assisted === true).map((row) => row.item.id), ['two']);
    assert.equal(stripped.payload.items.some((row) => 'assisted' in row), false);
    assert.deepEqual(stripped.payload.conditions, original.payload.conditions);
    assert.equal(value.observed.status, 'active');
    assert.equal(value.observed.snapshot.record.assessmentReceived.followups[0].status, 'ineligible');
    assert.deepEqual(value.observed.snapshot.record.taken, []);
  });
  await runCase(browser, engine, 'received-question-reconstructs-exact-source-without-a-local-sitting-or-fake-grade', async (page) => {
    await recipient(page, { question: true });
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive(); const applied = await f.reconcile();
      const disk = await f.recipientDisk(); await f.receive(); const repeated = await f.reconcile();
      const questions = await import('/assessment-question-practice.mjs');
      if (!questions.validateAssessmentQuestionRecord(applied.snapshot.record)) throw new Error('Invalid received question record');
      return { applied, repeated, disk, wire: f.senderOperations, summary: f.summary(applied), source: f.form };
    });
    const record = value.applied.snapshot.record, repeated = value.repeated.snapshot.record;
    assert.equal(value.applied.status, 'active'); assert.equal(value.applied.snapshot.assessmentReconciliation.state, 'current');
    assert.equal(record.taken.length, 1); assert.equal(record.taken[0].t, 'question');
    assert(record.taken[0].assessmentReceivedRef); assert.equal(record.assessmentQuestionPractice.plans.length, 1);
    const plan = record.assessmentQuestionPractice.plans[0];
    assert.deepEqual(plan.item, value.source.items.find(row => row.id === 'two'));
    assert.equal(plan.form.sha256, value.source.sha256); assert.equal(record.taken[0].id, plan.id);
    assert.deepEqual(record.assessmentQuestionPractice.responses, []); assert.deepEqual(record.assessmentQuestionPractice.grades, []);
    assert.equal(record.assessmentLibraryV2.attempts.length, 0); assert.equal(record.assessmentLibraryV2.forms.length, 0);
    assert.deepEqual(record.srs, { 'word:one': { due: 7000, stability: 44 } });
    assert.deepEqual(record.revlog, [[123, 'word:one', 4]]); assert.deepEqual(record.obslog, []);
    assert.deepEqual(repeated, record); assert.equal(value.disk.outbox.length, 0);
    const wireTarget = value.wire.find(row => row.payload.kind === 'learning.followup/2').payload.actions.find(row => row.target.t === 'question').target;
    assert.deepEqual(wireTarget, { t: 'question', id: plan.id });
    assert.equal(value.summary.completed, 1); assert(value.summary.focus.every(row => !row.subject.startsWith('question:')));
  });
  await runCase(browser, engine, 'received-question-suppression-and-source-deletion-retain-history-without-resurrection', async (page) => {
    await recipient(page, { question: true });
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive(); const first = await f.reconcile();
      const row = first.snapshot.record.taken.find(row => row.t === 'question');
      const removed = await f.recipientApp.suppressAssessmentLearning({ changeId: 'remove:received-question', occurredAt: '2026-09-23T00:00:03.000Z' },
        { expectedRevision: first.snapshot.revision, scope: first.snapshot.identity, kind: 'remove', key: `question:${row.id}` });
      await f.receive(); const repeated = await f.reconcile();
      const source = await f.store.snapshot();
      await f.store.commitLocal({ changeId: 'delete:question-source', binding: source.policy.binding, expectedRevision: source.revision,
        occurredAt: '2026-09-23T00:00:04.000Z', mutations: [], operations: [{ payload: {
          kind: 'entity.tombstone', target: { kind: 'exam-attempt', id: 'attempt:test' }, reason: 'user-deleted' }, dependencies: [] }] });
      await f.receive((await f.store.snapshot()).outbox.filter(row => row.payload.kind === 'entity.tombstone'));
      const deleted = await f.reconcile();
      const questions = await import('/assessment-question-practice.mjs');
      if (!questions.validateAssessmentQuestionRecord(deleted.snapshot.record)) throw new Error('Invalid retained question history');
      return { first, removed, repeated, deleted, summary: f.summary(deleted) };
    });
    assert.equal(value.removed.status, 'active');
    for (const state of [value.removed, value.repeated, value.deleted]) {
      assert.equal(state.snapshot.record.taken.length, 0);
      assert.deepEqual(state.snapshot.record.assessmentQuestionPractice, value.first.snapshot.record.assessmentQuestionPractice);
      assert.deepEqual(state.snapshot.record.revlog, [[123, 'word:one', 4]]);
    }
    assert.equal(value.deleted.snapshot.record.assessmentReceived.followups[0].status, 'hidden');
    assert.deepEqual(value.summary, { completed: 0, stopped: 0, skills: {}, focus: [], pending: 0 });
  });
  await runCase(browser, engine, 'received-question-cannot-substitute-a-different-target-identity', async (page) => {
    await recipient(page, { question: true });
    const value = await page.evaluate(async () => {
      const f = window.fixture; let predecessor = null;
      const altered = f.senderOperations.map(original => {
        const input = JSON.parse(JSON.stringify(original)); delete input.opId; delete input.payloadSha256;
        input.predecessor = predecessor;
        if (input.payload.kind === 'learning.followup/2')
          input.payload.actions.find(row => row.target.t === 'question').target.id = `assessment-question:${'a'.repeat(64)}`;
        const operation = f.core.createSyncOperationV2(input); predecessor = f.core.operationReference(operation); return operation;
      });
      await f.receive(altered); const rejected = await f.reconcile(); return { rejected, summary: f.summary(rejected) };
    });
    assert.equal(value.rejected.status, 'active');
    assert.equal(value.rejected.snapshot.record.assessmentReceived.followups[0].status, 'ineligible');
    assert.deepEqual(value.rejected.snapshot.record.taken, []);
    assert.equal(value.rejected.snapshot.record.assessmentQuestionPractice?.plans?.length || 0, 0);
    assert.equal(value.summary.completed, 0); assert.deepEqual(value.summary.skills, {});
  });
  await runCase(browser, engine, 'received-pending-target-keeps-verified-sensei-evidence-and-scheduling', async (page) => {
    await recipient(page, { targetAvailable: false, cloze: true });
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive();
      const pending = await f.reconcile(); const pendingSummary = f.summary(pending);
      const again = await f.reconcile();
      f.targetAvailable = true; const complete = await f.reconcile();
      return { pending, pendingSummary, again, complete, completeSummary: f.summary(complete) };
    });
    const before = value.pending.snapshot.record, after = value.complete.snapshot.record;
    assert.equal(before.assessmentReceived.followups[0].status, 'pending-target');
    assert.equal(value.pending.snapshot.assessmentReconciliation.state, 'pending');
    assert.equal(before.taken.length, 1); assert.equal(before.taken[0].t, 'sentence');
    assert(before.assessmentReceived.actions.some(row => row.key === 'word:two' && row.status === 'pending-target'));
    assert.equal(value.pendingSummary.completed, 1); assert.equal(value.pendingSummary.pending, 1);
    assert.equal(value.pendingSummary.skills.grammar.incorrect, 2);
    assert.equal(value.pendingSummary.skills.grammar.notReached, 1);
    assert.deepEqual(value.pendingSummary.focus.map(row => row.subject), ['word:one', 'word:two']);
    assert.equal(value.again.receipt, undefined); assert.deepEqual(value.again.snapshot.record, before);
    assert.equal(value.complete.snapshot.assessmentReconciliation.state, 'current');
    assert.equal(after.taken.length, 2); assert.equal(after.taken[1].id, 'two');
    assert.deepEqual(value.completeSummary, { ...value.pendingSummary, pending: 0 });
    for (const record of [before, after]) {
      assert.deepEqual(record.srs, { 'word:one': { due: 7000, stability: 44 } });
      assert.deepEqual(record.revlog, [[123, 'word:one', 4]]); assert.deepEqual(record.obslog, []);
    }
  });
  await runCase(browser, engine, 'received-result-without-followup-stays-explicitly-pending', async (page) => {
    await recipient(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture;
      await f.receive(f.senderOperations.slice(0, 1)); const partial = await f.reconcile();
      await f.receive(f.senderOperations.slice(1)); const complete = await f.reconcile();
      return { partial, complete, partialSummary: f.summary(partial), completeSummary: f.summary(complete) };
    });
    assert.equal(value.partial.snapshot.assessmentReconciliation.state, 'pending');
    assert.equal(value.partial.snapshot.assessmentReconciliation.pendingFollowups, 1);
    assert.equal(value.partial.snapshot.record.taken.length, 0);
    assert.equal(value.partialSummary.completed, 0); assert.equal(value.partialSummary.pending, 1);
    assert.equal(value.complete.snapshot.assessmentReconciliation.state, 'current');
    assert.equal(value.complete.snapshot.record.taken[0].id, 'two');
    assert.equal(value.completeSummary.completed, 1);
  });
  await runCase(browser, engine, 'received-matched-projection-is-real-idempotent-study-integration', async (page) => {
    await recipient(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive();
      const before = await f.recipientApp.snapshot(); const applied = await f.reconcile();
      const disk = await f.recipientDisk(); const again = await f.reconcile();
      return { before, applied, again, disk, after: await f.recipientDisk(),
        summaries: { before: f.summary(before), applied: f.summary(applied), local: f.summary(f.instance.current()) } };
    });
    assert.equal(value.before.snapshot.assessmentReconciliation.state, 'pending');
    assert.equal(value.before.snapshot.assessmentResultViewsV2.length, 1);
    assert.equal(value.before.snapshot.record.taken.length, 0);
    assert.equal(value.applied.status, 'active');
    assert.equal(value.applied.snapshot.assessmentReconciliation.state, 'current');
    assert.deepEqual(value.applied.snapshot.record.taken.map((row) => row.id), ['two']);
    assert(value.applied.snapshot.record.taken[0].assessmentReceivedRef);
    assert.deepEqual(value.applied.snapshot.record.srs, { 'word:one': { due: 7000, stability: 44 } });
    assert.deepEqual(value.applied.snapshot.record.revlog, [[123, 'word:one', 4]]);
    assert.deepEqual(value.applied.snapshot.record.obslog, []);
    assert.equal(value.applied.snapshot.record.assessmentLibraryV2.attempts.length, 0);
    assert.equal(value.applied.snapshot.record.assessmentLibraryV2.forms.length, 0);
    assert.equal(value.disk.outbox.length, 0);
    assert.equal(value.again.receipt, undefined); assert.deepEqual(value.after, value.disk);
    assert.equal(value.summaries.before.completed, 0); assert.equal(value.summaries.before.pending, 1);
    assert.equal(value.summaries.applied.completed, 1); assert.equal(value.summaries.applied.pending, 0);
    assert.equal(value.summaries.applied.skills.grammar.incorrect, 2);
    assert.equal(value.summaries.applied.skills.grammar.notReached, 1);
    assert.equal(value.summaries.applied.focus.length, 2);
    assert.deepEqual(value.summaries.local, { completed: 0, stopped: 0, skills: {}, focus: [], pending: 0 });
  });
  await runCase(browser, engine, 'received-missing-form-is-pending-and-later-cache-load-retries', async (page) => {
    await recipient(page, { formAvailable: false });
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive(); const pending = await f.reconcile();
      f.formAvailable = true; const applied = await f.reconcile();
      f.formAvailable = false; const offline = await f.reconcile();
      return { pending, applied, offline, summary: f.summary(offline) };
    });
    assert.equal(value.pending.snapshot.record.taken.length, 0);
    assert.equal(value.pending.snapshot.record.assessmentReceived.followups[0].status, 'pending-form');
    assert.equal(value.pending.snapshot.assessmentReconciliation.state, 'pending');
    assert.equal(value.applied.snapshot.record.taken[0].id, 'two');
    assert.equal(value.offline.snapshot.record.taken[0].id, 'two');
    assert.equal(value.offline.snapshot.assessmentReconciliation.state, 'pending');
    assert.equal(value.summary.completed, 0); assert.equal(value.summary.pending, 1);
  });
  await runCase(browser, engine, 'received-claims-cannot-override-trusted-form-answer-key', async (page) => {
    await recipient(page, { corruptResponse: true });
    const value = await page.evaluate(async () => { const f = window.fixture; await f.receive(); return f.reconcile(); });
    assert.equal(value.status, 'active'); assert.equal(value.snapshot.record.taken.length, 0);
    assert.equal(value.snapshot.record.assessmentReceived.followups[0].status, 'ineligible');
  });
  await runCase(browser, engine, 'received-independent-app-guard-rejects-incomplete-host-projection', async (page) => {
    await recipient(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive(); const before = await f.recipientDisk();
      const failed = await f.reconcile(); return { before, failed, after: await f.recipientDisk() };
    });
    assert.equal(value.failed.status, 'recovery-required');
    assert.deepEqual(value.after, value.before);
    assert.equal(value.before.replica.operations.length, 2);
  }, 'bad-received');
  await runCase(browser, engine, 'received-reconciliation-quota-failure-keeps-journal-retryable', async (page) => {
    await recipient(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive(); const before = await f.recipientDisk();
      const original = IDBObjectStore.prototype.put; let fired = false;
      IDBObjectStore.prototype.put = function (...args) {
        if (!fired && args[0]?.kind === 'document') { fired = true; throw new DOMException('Synthetic projection quota failure', 'QuotaExceededError'); }
        return original.apply(this, args);
      };
      const meta = { changeId: 'reconcile:quota', occurredAt: '2026-09-23T00:00:02.000Z' }; let failed;
      try { failed = await f.reconcile(meta); } finally { IDBObjectStore.prototype.put = original; }
      const after = await f.recipientDisk(); f.recipientApp = await f.app.createRecordApp(f.recipientOptions);
      const retry = await f.reconcile(meta); return { before, after, failed, retry, fired };
    });
    assert.equal(value.fired, true); assert.equal(value.failed.status, 'recovery-required');
    assert.deepEqual(value.after, value.before); assert.equal(value.before.replica.operations.length, 2);
    assert.equal(value.retry.status, 'active'); assert.equal(value.retry.snapshot.record.taken[0].id, 'two');
  });
  await runCase(browser, engine, 'received-lost-ack-retry-does-not-resurrect-a-later-removal', async (page) => {
    await recipient(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive();
      const meta = { changeId: 'reconcile:uncertain', occurredAt: '2026-09-23T00:00:02.000Z' };
      f.recipientController.commitLocal = async (request) => { await f.recipientRealCommit(request); throw new Error('Synthetic lost projection acknowledgement'); };
      const failed = await f.reconcile(meta);
      f.recipientController.commitLocal = f.recipientRealCommit; f.recipientApp = await f.app.createRecordApp(f.recipientOptions);
      await f.recipientApp.write((record) => ({ patch: { taken: record.taken.filter((row) => row.id !== 'two') } }));
      const before = await f.recipientDisk(); const retry = await f.reconcile(meta); const after = await f.recipientDisk();
      const refresh = await f.reconcile(); return { failed, before, retry, after, refresh };
    });
    assert.equal(value.failed.status, 'recovery-required'); assert.equal(value.retry.status, 'active');
    assert.equal(value.retry.receipt.outcome, 'duplicate'); assert.deepEqual(value.after, value.before);
    assert.equal(value.refresh.snapshot.record.taken.length, 0);
    assert(value.refresh.snapshot.record.assessmentReceived.actions.some((row) => row.key === 'word:two' && row.status === 'removed'));
  });
  await runCase(browser, engine, 'received-suppression-removes-automatic-card-but-preserves-manual-retake', async (page) => {
    await recipient(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive(); const first = await f.reconcile();
      const source = f.instance.current();
      const removed = await f.instance.suppressAssessmentLearning({ changeId: 'source:remove', occurredAt: '2026-09-23T00:00:03.000Z' },
        { expectedRevision: source.snapshot.revision, scope: source.snapshot.identity, kind: 'remove', key: 'word:two' });
      if (removed.status !== 'active') throw new Error('Source suppression failed');
      const operations = (await f.store.snapshot()).outbox.filter((row) => row.payload.kind === 'learning.suppress/2');
      await f.receive(operations); const suppressed = await f.reconcile();
      await f.recipientApp.write((record) => ({ patch: { taken: [...record.taken, { t: 'word', id: 'two', ts: 4000, started: 4000 }] } }));
      const manual = await f.reconcile(); return { first, suppressed, manual };
    });
    assert.equal(value.first.snapshot.record.taken.length, 1);
    assert.equal(value.suppressed.snapshot.record.taken.length, 0);
    assert(value.suppressed.snapshot.record.assessmentLearning.suppressions.some((row) => row.key === 'word:two'));
    assert.equal(value.manual.snapshot.record.taken[0].started, 4000);
    assert.deepEqual(value.manual.snapshot.record.srs, { 'word:one': { due: 7000, stability: 44 } });
  });
  for (const evidence of ['srs', 'revlog']) await runCase(browser, engine, `received-undo-preserves-${evidence}-but-explicit-removal-wins`, async (page) => {
    await recipient(page);
    const value = await page.evaluate(async (evidence) => {
      const f = window.fixture; await f.receive(); await f.reconcile();
      const studied = await f.recipientApp.write(record => ({ patch: evidence === 'srs'
        ? { srs: { ...record.srs, 'word:two': { due: 9000, stability: 27 } } }
        : { revlog: [...record.revlog, [456, 'word:two', 3]] } }));
      const source = f.instance.current();
      const undone = await f.instance.suppressAssessmentLearning({ changeId: 'source:undo', occurredAt: '2026-09-23T00:00:03.000Z' },
        { expectedRevision: source.snapshot.revision, scope: source.snapshot.identity, kind: 'undo',
          followupId: source.snapshot.record.assessmentLearning.followups[0].id });
      if (undone.status !== 'active') throw new Error('Source undo failed');
      const undoOperations = (await f.store.snapshot()).outbox.filter(row => row.payload.kind === 'learning.suppress/2');
      await f.receive(undoOperations); const retained = await f.reconcile();
      await f.receive(undoOperations); const redelivered = await f.reconcile();
      const removed = await f.instance.suppressAssessmentLearning({ changeId: 'source:remove-after-undo', occurredAt: '2026-09-23T00:00:04.000Z' },
        { expectedRevision: undone.snapshot.revision, scope: undone.snapshot.identity, kind: 'remove', key: 'word:two' });
      if (removed.status !== 'active') throw new Error('Source removal failed');
      await f.receive((await f.store.snapshot()).outbox.filter(row => row.payload.kind === 'learning.suppress/2'));
      const explicit = await f.reconcile(); await f.receive(undoOperations); const olderUndo = await f.reconcile();
      return { studied, retained, redelivered, explicit, olderUndo };
    }, evidence);
    for (const result of [value.retained, value.redelivered]) {
      assert.equal(result.status, 'active');
      assert.deepEqual(result.snapshot.record.taken, value.studied.snapshot.record.taken);
      assert(result.snapshot.record.assessmentLearning.suppressions.some(row => row.key === 'word:two' && row.reason === 'undo-auto-add'));
    }
    for (const result of [value.explicit, value.olderUndo]) {
      assert.equal(result.status, 'active'); assert.equal(result.snapshot.record.taken.length, 0);
      assert(result.snapshot.record.assessmentLearning.suppressions.some(row => row.key === 'word:two' && row.reason === 'removed'));
    }
    for (const result of [value.retained, value.redelivered, value.explicit, value.olderUndo]) {
      assert.deepEqual(result.snapshot.record.srs, value.studied.snapshot.record.srs);
      assert.deepEqual(result.snapshot.record.revlog, value.studied.snapshot.record.revlog);
    }
  });
  await runCase(browser, engine, 'received-cloze-is-rederived-from-owned-form-in-the-same-projection', async (page) => {
    await recipient(page, { cloze: true });
    const value = await page.evaluate(async () => { const f = window.fixture; await f.receive(); return f.reconcile(); });
    assert.equal(value.status, 'active');
    const record = value.snapshot.record;
    const sentence = record.taken.find((row) => row.t === 'sentence');
    assert(sentence); assert.equal(sentence.label, '駅へ行っています。');
    assert(sentence.assessmentReceivedRef); assert(sentence.sourceContextRef);
    assert.equal(record.sentencePractice.entries.length, 1);
    assert.equal(record.teacherContexts.entries.length, 1);
    assert.equal(record.assessmentLibraryV2.attempts.length, 0);
    assert.deepEqual(record.srs, { 'word:one': { due: 7000, stability: 44 } });
  });
  await runCase(browser, engine, 'received-tombstone-retracts-unreviewed-projection-and-survives-redelivery', async (page) => {
    await recipient(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive(); const first = await f.reconcile();
      const source = await f.store.snapshot();
      await f.store.commitLocal({ changeId: 'source:delete-test', binding: source.policy.binding, expectedRevision: source.revision,
        occurredAt: '2026-09-23T00:00:03.000Z', mutations: [], operations: [{ payload: {
          kind: 'entity.tombstone', target: { kind: 'exam-attempt', id: 'attempt:test' }, reason: 'user-deleted' }, dependencies: [] }] });
      const tombstone = (await f.store.snapshot()).outbox.filter((row) => row.payload.kind === 'entity.tombstone');
      await f.receive(tombstone); const deleted = await f.reconcile();
      await f.receive(f.senderOperations); const redelivered = await f.reconcile();
      return { first, deleted, redelivered, summary: f.summary(deleted) };
    });
    assert.equal(value.first.snapshot.record.taken.length, 1);
    assert.equal(value.deleted.snapshot.record.taken.length, 0);
    assert.equal(value.deleted.snapshot.assessmentResultViewsV2[0].headResults.length, 0);
    assert.equal(value.redelivered.snapshot.record.taken.length, 0);
    assert.equal(value.redelivered.snapshot.record.assessmentReceived.followups[0].status, 'hidden');
    assert.deepEqual(value.redelivered.snapshot.record.revlog, [[123, 'word:one', 4]]);
    assert.deepEqual(value.summary, { completed: 0, stopped: 0, skills: {}, focus: [], pending: 0 });
  });
  await runCase(browser, engine, 'received-conflicting-followup-does-not-authorize-cards', async (page) => {
    await recipient(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive(); const first = await f.reconcile();
      const source = await f.store.snapshot();
      const previous = source.outbox.find((row) => row.payload.kind === 'learning.followup/2');
      const payload = JSON.parse(JSON.stringify(previous.payload)); payload.status = 'pending-mapping';
      await f.store.commitLocal({ changeId: 'source:conflicting-followup', binding: source.policy.binding,
        expectedRevision: source.revision, occurredAt: '2026-09-23T00:00:03.000Z', mutations: [], operations: [{ payload, dependencies: [] }] });
      const conflict = (await f.store.snapshot()).outbox.filter((row) => row.actor.sequence > 2);
      await f.receive(conflict); const observed = await f.reconcile(); return { first, observed, summary: f.summary(observed) };
    });
    assert.equal(value.first.snapshot.record.taken.length, 1);
    assert.equal(value.observed.status, 'active');
    assert.equal(value.observed.snapshot.record.assessmentReceived.followups[0].status, 'conflicting');
    assert.equal(value.observed.snapshot.record.taken.length, 0);
    assert.equal(value.summary.completed, 0); assert.deepEqual(value.summary.skills, {});
  });
  for (const cloze of [false, true]) await runCase(browser, engine, `received-another-verified-result-retains-${cloze ? 'canonical-cloze' : 'card'}-when-first-is-deleted`, async (page) => {
    await recipient(page, { cloze });
    const value = await page.evaluate(async () => {
      const f = window.fixture; await f.receive(); const first = await f.reconcile();
      const scope = f.instance.current().snapshot.identity;
      const now = Date.parse('2026-09-23T00:00:01Z');
      let library = f.assessment.startAssessmentV2(f.instance.current().snapshot.record.assessmentLibraryV2, f.form,
        { scope, attemptId: 'attempt:second', mode: 'timed', now, clockSessionId: 'clock:second', monotonicMs: 0,
          editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-test-only', decisionRevisionIds: ['synthetic:no-content-approval'] } });
      for (const itemId of ['one', 'two']) for (const action of [{ kind: 'visit', itemId },
        { kind: 'answer', itemId, response: { kind: 'selected', optionId: 'b' } }])
        library = f.assessment.commandAssessmentV2(library, { scope, attemptId: 'attempt:second',
          expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId,
          now, clockSessionId: 'clock:second', monotonicMs: 0, action });
      const write = await f.instance.write(() => ({ patch: { assessmentLibraryV2: library } }));
      const finish = await f.instance.finalizeAssessment({ changeId: 'finish:second', occurredAt: new Date(now + 500).toISOString() },
        { ...f.input, attemptId: 'attempt:second', expectedRevision: write.snapshot.revision,
          expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId, clockSessionId: 'clock:second' });
      if (finish.status !== 'active') throw new Error(`Second source finish ${finish.reason}`);
      const source = await f.store.snapshot();
      await f.store.commitLocal({ changeId: 'source:delete-first', binding: source.policy.binding, expectedRevision: source.revision,
        occurredAt: '2026-09-23T00:00:03.000Z', mutations: [], operations: [{ payload: {
          kind: 'entity.tombstone', target: { kind: 'exam-attempt', id: 'attempt:test' }, reason: 'user-deleted' }, dependencies: [] }] });
      await f.receive((await f.store.snapshot()).outbox.filter((row) => row.actor.sequence > 2));
      const retained = await f.reconcile(); return { first, retained, summary: f.summary(retained) };
    });
    const originals = value.first.snapshot.record.taken, retained = value.retained.snapshot.record.taken;
    assert.equal(retained.length, cloze ? 2 : 1);
    for (const original of originals) {
      const current = retained.find(row => row.id === original.id);
      assert(current); assert.equal(current.started, original.started);
      assert.equal(current.assessmentReceivedRef.attemptId, 'attempt:second');
    }
    if (cloze) assert.deepEqual(value.retained.snapshot.record.sentencePractice, value.first.snapshot.record.sentencePractice);
    assert.equal(value.summary.completed, 1);
    assert.deepEqual(value.retained.snapshot.record.revlog, [[123, 'word:one', 4]]);
  });
}
