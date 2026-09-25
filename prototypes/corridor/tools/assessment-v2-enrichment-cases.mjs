/* global window, IDBObjectStore, DOMException */
import assert from 'node:assert/strict';

async function pending(page) {
  await page.evaluate(async () => {
    const f = window.fixture;
    f.available = new Set(['word:one']);
    const original = f.options.assessmentSubjectResolver;
    f.options.assessmentSubjectResolver = (subject, item, record) => f.available.has(subject) ? original(subject, item, record) : null;
    f.instance = await f.app.createRecordApp(f.options);
    const finish = await f.finish();
    if (finish.status !== 'active' || finish.snapshot.record.assessmentLearning.followups[0].status !== 'pending-mapping')
      throw new Error(`Pending setup ${finish.reason}`);
    f.enrichmentBefore = await f.disk(); f.enrichmentSerial = 0;
    f.enrich = async (call) => {
      if (!call) {
        const state = await f.instance.snapshot();
        call = { meta: { changeId: `enrich:${++f.enrichmentSerial}`, occurredAt: '2026-09-23T00:00:02.000Z' },
          input: { expectedRevision: state.snapshot.revision, scope: state.snapshot.identity } };
      }
      f.lastEnrichmentCall = call;
      return f.instance.enrichAssessmentLearning(call.meta, call.input);
    };
  });
}

// Seed a real historical pending follow-up from before question cards existed.
// Its exact form, terminal score, and two body-free sync operations remain valid.
async function pendingQuestion(page) {
  await page.evaluate(async () => {
    const f = window.fixture, learning = await import('/assessment-learning.mjs');
    const payload = value => { const copy = JSON.parse(JSON.stringify(value)); delete copy.revisionId; delete copy.sha256; return copy; };
    const body = payload(f.form), item = payload(f.form.items.find(row => row.id === 'two'));
    const allowed = { status: 'allowed', basisRef: 'synthetic-original', policyVersion: 'fixture/v1' };
    for (const kind of ['display', 'retain']) body.rights[kind] = item.rights[kind] = allowed;
    item.subjects = []; item.task = 'sentence-composition';
    body.items = f.form.items.map(row => row.id === item.id ? f.content.createItemVersion(item) : row);
    f.form = f.content.createFormVersion(body);
    const state = f.instance.current().snapshot, scope = state.identity, now = Date.parse('2026-09-23T00:00:00Z');
    let library = f.assessment.startAssessmentV2(f.assessment.createAssessmentLibraryV2({ scope }), f.form,
      { scope, attemptId: 'attempt:test', mode: 'timed', now, clockSessionId: 'clock:test', monotonicMs: 0,
        editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-test-only', decisionRevisionIds: ['synthetic:no-content-approval'] } });
    for (const action of [{ kind: 'visit', itemId: 'one' }, { kind: 'answer', itemId: 'one', response: { kind: 'selected', optionId: 'b' } },
      { kind: 'visit', itemId: 'two' }, { kind: 'answer', itemId: 'two', response: { kind: 'selected', optionId: 'b' } }, { kind: 'submit' }])
      library = f.assessment.commandAssessmentV2(library, { scope, attemptId: 'attempt:test', now, clockSessionId: 'clock:test', monotonicMs: 0,
        expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId, action });
    const selected = f.assessment.selectAssessmentV2(library);
    const planned = learning.planAssessmentLearning({ scope, form: selected.form, attempt: selected.attempt,
      outcomes: selected.score.items.map(row => ({ ...row, outcome: row.result, flagged: false })), resolveSubject: f.options.assessmentSubjectResolver });
    f.questionTarget = planned.actions.find(row => row.target.t === 'question').target;
    const historical = { ...planned, status: 'pending-mapping', actions: planned.actions.filter(row => row.target.t !== 'question') };
    const record = { ...state.record, assessmentLibraryV2: library, ...learning.applyAssessmentLearning(state.record, historical) };
    const followup = record.assessmentLearning.followups[0], disk = await f.store.snapshot();
    await f.store.commitLocal({ changeId: 'fixture:historical-question', binding: disk.policy.binding, expectedRevision: disk.revision,
      occurredAt: new Date(now).toISOString(), mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: record }],
      operations: f.core.createAssessmentSyncIntentsV2({ form: selected.form, attempt: selected.attempt, result: selected.score, followup }) });
    f.instance = await f.app.createRecordApp(f.options); f.enrichmentBefore = await f.disk(); f.enrichmentSerial = 0;
    f.enrich = async (call) => {
      if (!call) {
        const current = await f.instance.snapshot();
        call = { meta: { changeId: `enrich:question:${++f.enrichmentSerial}`, occurredAt: '2026-09-23T00:00:02.000Z' },
          input: { expectedRevision: current.snapshot.revision, scope: current.snapshot.identity } };
      }
      f.lastEnrichmentCall = call; return f.instance.enrichAssessmentLearning(call.meta, call.input);
    };
  });
}

// G1 E1/E2 at the host: the KE2b witness. A lawful practice sitting answers 'two' correctly and
// opens its explanation, so 'two' is eligible only through its mark; 'one' is wrong and its word is
// already a card. The word for 'two' is not mapped yet, so the accepted finish is pending-mapping
// with the mark in evidence. The host's record check also runs the app's own learning-record
// validator and keeps its refusal text.
async function assistedPending(page) {
  return page.evaluate(async () => {
    const f = window.fixture, learning = await import('/assessment-learning.mjs');
    const scope = f.input.scope, now = Date.parse('2026-09-23T00:00:00Z'), attemptId = 'attempt:enrich-why';
    const resolve = f.options.assessmentSubjectResolver, validate = f.options.validateRecord;
    f.available = new Set(['word:one']); f.refusals = [];
    f.options = { ...f.options,
      assessmentSubjectResolver: (subject, item, record) => f.available.has(subject) ? resolve(subject, item, record) : null,
      validateRecord: (record) => {
        if (!validate(record)) return false;
        try { return record.assessmentLearning == null || learning.validateAssessmentLearningRecord(record) === true; }
        catch (error) { f.refusals.push(String(error?.message || error)); return false; }
      } };
    f.instance = await f.app.createRecordApp(f.options);
    let library = f.assessment.startAssessmentV2(f.assessment.createAssessmentLibraryV2({ scope }), f.form,
      { scope, attemptId, mode: 'practice', now, clockSessionId: 'clock:enrich-why', monotonicMs: 0,
        editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-test-only', decisionRevisionIds: ['synthetic:no-content-approval'] } });
    const step = (action, ms) => { library = f.assessment.commandAssessmentV2(library, { scope, attemptId,
      expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId,
      now: now + ms, clockSessionId: 'clock:enrich-why', monotonicMs: ms, action }); };
    step({ kind: 'answer', itemId: 'one', response: { kind: 'selected', optionId: 'b' } }, 100);
    step({ kind: 'visit', itemId: 'two' }, 200);
    step({ kind: 'answer', itemId: 'two', response: { kind: 'selected', optionId: 'a' } }, 300);
    step({ kind: 'assistance', itemId: 'two', reason: 'explanation' }, 400);
    const mark = f.assessment.selectAssessmentV2(library).attempt.answers.find((row) => row.item.id === 'two').assistance ?? null;
    const seeded = await f.instance.write(() => ({ patch: { assessmentLibraryV2: library } }));
    let finish;
    try {
      finish = await f.instance.finalizeAssessment({ changeId: 'finish:enrich-why', occurredAt: new Date(now + 500).toISOString() },
        (snapshot) => ({ scope, attemptId, expectedRevisionId: f.assessment.selectAssessmentV2(library).attempt.revisionId,
          clockSessionId: 'clock:enrich-why', monotonicMs: 500, action: { kind: 'submit' }, expectedRevision: snapshot.revision }));
    } catch (error) { finish = { status: 'thrown', reason: String(error?.code ?? error?.message ?? error) }; }
    const followup = finish.status === 'active'
      ? finish.snapshot.record.assessmentLearning.followups.find((row) => row.attemptId === attemptId) : null;
    f.enrichmentBefore = await f.disk();
    return { seeded: seeded.status, mark: mark && { kind: mark.kind, at: mark.at },
      finish: { status: finish.status, reason: finish.reason ?? null }, refusals: [...f.refusals],
      followup: followup && { status: followup.status,
        evidence: followup.evidence.map((row) => [row.item.id, row.assistance ?? null]),
        actions: followup.actions.map((row) => [row.target.t, row.target.id, row.status]) } };
  });
}

export async function runAssessmentEnrichmentCases(browser, engine, runCase) {
  // Candidate: the only new action is the assisted item's; evidence (with its mark) and the prior
  // action stay byte-equal; one followup revision, no new result, no grade; the exact retry is a
  // duplicate and a later call writes nothing. Under KE2b (the enrichment mapper drops the mark)
  // the refusal row fails with enrichment-evidence-changed and reports whether durable state held.
  await runCase(browser, engine, 'enrichment-assisted-mark-survives-mapping-retry-through-the-validator', async page => {
    const setup = await assistedPending(page);
    // setup: the marked sitting was stored by an ordinary write and finalized pending-mapping
    assert.equal(setup.seeded, 'active');
    assert(setup.mark && setup.mark.kind === 'explanation');
    assert.equal(setup.finish.status, 'active', `setup finish ${setup.finish.reason}; validator ${JSON.stringify(setup.refusals)}`);
    assert.equal(setup.followup.status, 'pending-mapping');
    assert.deepEqual(setup.followup.evidence, [['one', null], ['two', setup.mark], ['three', null]]);
    assert.deepEqual(setup.followup.actions, [['word', 'one', 'existing']]);
    const value = await page.evaluate(async () => {
      const f = window.fixture; f.available.add('word:two');
      const state = await f.instance.snapshot();
      const call = { meta: { changeId: 'enrich:why', occurredAt: '2026-09-23T00:00:02.000Z' },
        input: { expectedRevision: state.snapshot.revision, scope: state.snapshot.identity } };
      let enriched, refusal = null;
      try { enriched = await f.instance.enrichAssessmentLearning(call.meta, call.input); }
      catch (error) { refusal = [error?.code, error?.message].filter(Boolean).join(': ') || String(error); }
      const disk = await f.disk();
      const unchanged = JSON.stringify(disk) === JSON.stringify(f.enrichmentBefore);
      if (refusal || enriched.status !== 'active')
        return { refusal: refusal ?? `${enriched.status}: ${enriched.reason}`, unchanged, refusals: [...f.refusals] };
      const retry = await f.instance.enrichAssessmentLearning(call.meta, call.input), afterRetry = await f.disk();
      const current = await f.instance.snapshot();
      const noop = await f.instance.enrichAssessmentLearning({ changeId: 'enrich:why:again', occurredAt: '2026-09-23T00:00:03.000Z' },
        { expectedRevision: current.snapshot.revision, scope: current.snapshot.identity });
      return { refusal, unchanged, refusals: [...f.refusals], before: f.enrichmentBefore, enriched, disk,
        retry, afterRetry, noop, afterNoop: await f.disk() };
    });
    // KE2b's permitted failing row: the enrichment path refuses changed evidence before any write
    assert.equal(value.refusal, null,
      `enrichment refused: ${value.refusal}; durable state unchanged: ${value.unchanged}; validator ${JSON.stringify(value.refusals)}`);
    // candidate: accepted by the host and the app's validator; only the assisted item's card is added
    assert.deepEqual(value.refusals, []);
    const before = value.before.documents.find((row) => row.collection === 'learner-record').value;
    const record = value.enriched.snapshot.record;
    const prior = before.assessmentLearning.followups.find((row) => row.attemptId === 'attempt:enrich-why');
    const followup = record.assessmentLearning.followups.find((row) => row.attemptId === 'attempt:enrich-why');
    assert.equal(followup.id, prior.id); assert.equal(followup.status, 'complete');
    assert.equal(followup.attemptRevisionId, prior.attemptRevisionId);
    assert.deepEqual(followup.evidence, prior.evidence);
    assert.deepEqual(followup.actions.slice(0, prior.actions.length), prior.actions);
    const added = followup.actions.slice(prior.actions.length);
    assert.deepEqual(added.map((row) => [row.target.t, row.target.id, row.status]), [['word', 'two', 'added']]);
    assert.equal(added[0].evidenceId, followup.evidence.find((row) => row.item.id === 'two').id);
    assert.deepEqual(record.assessmentLibraryV2, before.assessmentLibraryV2);
    assert.deepEqual(record.taken.slice(0, before.taken.length), before.taken);
    const card = record.taken.slice(before.taken.length);
    assert.deepEqual(card.map((row) => [row.t, row.id, row.by, row.started, row.ts]),
      [['word', 'two', 'assessment', followup.completedAt, followup.completedAt]]);
    assert.deepEqual(card[0].assessmentRef, { followupId: followup.id, evidenceId: added[0].evidenceId, actionId: added[0].id });
    assert.deepEqual(record.srs, before.srs); assert.deepEqual(record.revlog, before.revlog); assert.deepEqual(record.obslog, before.obslog);
    const operations = value.disk.outbox.toSorted((a, b) => a.actor.sequence - b.actor.sequence);
    assert.deepEqual(operations.map((row) => row.payload.kind), ['assessment.result/2', 'learning.followup/2', 'learning.followup/2']);
    assert.deepEqual(operations.slice(0, 2), value.before.outbox.toSorted((a, b) => a.actor.sequence - b.actor.sequence));
    assert.deepEqual(operations[0].payload.items.filter((row) => row.assisted === true).map((row) => row.item.id), ['two']);
    assert.deepEqual(operations[2].payload.supersedes, [value.before.replica.ready.find((row) => row.opId === operations[1].opId)]);
    assert.equal(value.retry.receipt.outcome, 'duplicate'); assert.deepEqual(value.afterRetry, value.disk);
    assert.equal(value.noop.status, 'active'); assert.equal(value.noop.receipt, undefined); assert.deepEqual(value.afterNoop, value.disk);
  });
  await runCase(browser, engine, 'enrichment-historical-question-adds-one-card-without-regrading-or-changing-evidence', async page => {
    await pendingQuestion(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture, enriched = await f.enrich(), call = f.lastEnrichmentCall, disk = await f.disk();
      const retry = await f.enrich(call), afterRetry = await f.disk(), noop = await f.enrich();
      const questions = await import('/assessment-question-practice.mjs');
      if (!questions.validateAssessmentQuestionRecord(enriched.snapshot.record)) throw new Error('Invalid enriched question record');
      return { before: f.enrichmentBefore, enriched, disk, retry, afterRetry, noop, afterNoop: await f.disk() };
    });
    assert.equal(value.enriched.status, 'active');
    const before = value.before.documents.find(row => row.collection === 'learner-record').value, record = value.enriched.snapshot.record;
    const previous = before.assessmentLearning.followups[0], followup = record.assessmentLearning.followups[0];
    assert.equal(followup.status, 'complete'); assert.equal(followup.actions.length, 2);
    assert.deepEqual(followup.evidence, previous.evidence); assert.deepEqual(followup.actions[0], previous.actions[0]);
    assert.deepEqual(record.assessmentLibraryV2, before.assessmentLibraryV2);
    assert.deepEqual(record.taken.map(row => row.t), ['word', 'question']);
    assert.equal(record.assessmentQuestionPractice.plans.length, 1);
    assert.deepEqual(record.assessmentQuestionPractice.responses, []); assert.deepEqual(record.assessmentQuestionPractice.grades, []);
    assert.deepEqual(record.srs, before.srs); assert.deepEqual(record.revlog, before.revlog); assert.deepEqual(record.obslog, before.obslog);
    const operations = value.disk.outbox.toSorted((a, b) => a.actor.sequence - b.actor.sequence);
    assert.deepEqual(operations.map(row => row.payload.kind), ['assessment.result/2', 'learning.followup/2', 'learning.followup/2']);
    assert.deepEqual(operations[2].payload.supersedes, [value.before.replica.ready.find(row => row.opId === operations[1].opId)]);
    assert.equal(value.retry.receipt.outcome, 'duplicate'); assert.deepEqual(value.afterRetry, value.disk);
    assert.equal(value.noop.receipt, undefined); assert.deepEqual(value.afterNoop, value.disk);
  });
  await runCase(browser, engine, 'enrichment-question-removal-before-mapping-is-authoritative', async page => {
    await pendingQuestion(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture, current = f.instance.current().snapshot;
      const removed = await f.instance.suppressAssessmentLearning({ changeId: 'remove:pending-question', occurredAt: '2026-09-23T00:00:01.000Z' },
        { expectedRevision: current.revision, scope: current.identity, kind: 'remove', key: `question:${f.questionTarget.id}` });
      if (removed.status !== 'active') throw new Error(removed.reason);
      return f.enrich();
    });
    assert.equal(value.status, 'active'); assert.deepEqual(value.snapshot.record.taken.map(row => row.id), ['one']);
    const followup = value.snapshot.record.assessmentLearning.followups[0];
    assert.equal(followup.status, 'complete'); assert.equal(followup.actions.find(row => row.target.t === 'question').status, 'suppressed');
    assert.equal(value.snapshot.record.assessmentQuestionPractice?.plans?.length || 0, 0);
    assert.deepEqual(value.snapshot.record.revlog, [[111, 'word:one', 3]]);
  });
  await runCase(browser, engine, 'enrichment-adds-only-new-mappings-and-one-explicit-followup-revision', async page => {
    await pending(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture;
      f.available.add('word:two'); const enriched = await f.enrich(); const call = f.lastEnrichmentCall;
      const disk = await f.disk(); const retry = await f.enrich(call); const afterRetry = await f.disk();
      const noop = await f.enrich(); return { before: f.enrichmentBefore, enriched, disk, retry, afterRetry, noop, afterNoop: await f.disk() };
    });
    assert.equal(value.enriched.status, 'active');
    const before = value.before.documents.find(row => row.collection === 'learner-record').value;
    const record = value.enriched.snapshot.record;
    assert.equal(record.assessmentLearning.followups[0].status, 'complete');
    assert.deepEqual(record.assessmentLibraryV2, before.assessmentLibraryV2);
    assert.deepEqual(record.assessmentLearning.followups[0].evidence, before.assessmentLearning.followups[0].evidence);
    assert.deepEqual(record.assessmentLearning.followups[0].actions[0], before.assessmentLearning.followups[0].actions[0]);
    assert.deepEqual(record.taken.map(row => row.id), ['one', 'two']);
    assert.deepEqual(record.srs, before.srs); assert.deepEqual(record.revlog, before.revlog); assert.deepEqual(record.obslog, before.obslog);
    const operations = value.disk.outbox.toSorted((a, b) => a.actor.sequence - b.actor.sequence);
    assert.equal(operations.length, 3); assert.equal(operations[2].payload.kind, 'learning.followup/2');
    assert.deepEqual(operations[2].payload.supersedes, [value.before.replica.ready.find(row => row.opId === operations[1].opId)]);
    assert.deepEqual(operations[2].dependencies, operations[2].payload.supersedes);
    assert.equal(value.enriched.snapshot.assessmentLearningViewsV2.followups.length, 1);
    assert.equal(value.enriched.snapshot.assessmentLearningViewsV2.followups[0].resultBinding, 'matched');
    assert.equal(value.retry.receipt.outcome, 'duplicate'); assert.deepEqual(value.afterRetry, value.disk);
    assert.equal(value.noop.status, 'active'); assert.equal(value.noop.receipt, undefined); assert.deepEqual(value.afterNoop, value.disk);
  });
  await runCase(browser, engine, 'enrichment-unavailable-mapping-noop-can-later-resolve-without-fake-grade', async page => {
    await pending(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture; const noop = await f.enrich(); const call = f.lastEnrichmentCall; const unchanged = await f.disk();
      f.available.add('word:two'); const later = await f.enrich(call); return { noop, unchanged, before: f.enrichmentBefore, later };
    });
    assert.equal(value.noop.status, 'active'); assert.equal(value.noop.receipt, undefined);
    assert.deepEqual(value.unchanged, value.before); assert.equal(value.later.status, 'active');
    assert.equal(value.later.snapshot.record.assessmentLearning.followups[0].actions.length, 2);
    assert.equal(value.later.snapshot.record.revlog.length, 1);
  });
  await runCase(browser, engine, 'enrichment-pending-removal-suppresses-later-card', async page => {
    await pending(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture, current = f.instance.current().snapshot;
      const suppressed = await f.instance.suppressAssessmentLearning({ changeId: 'suppress:before-mapping', occurredAt: '2026-09-23T00:00:01.000Z' },
        { expectedRevision: current.revision, scope: current.identity, kind: 'remove', key: 'word:two' });
      if (suppressed.status !== 'active') throw new Error(suppressed.reason);
      f.available.add('word:two'); return f.enrich();
    });
    assert.equal(value.status, 'active'); assert.deepEqual(value.snapshot.record.taken.map(row => row.id), ['one']);
    const followup = value.snapshot.record.assessmentLearning.followups[0];
    assert.equal(followup.status, 'complete'); assert.equal(followup.actions.find(row => row.target.id === 'two').status, 'suppressed');
  });
  await runCase(browser, engine, 'enrichment-quota-abort-keeps-pending-and-exact-retry-resolves', async page => {
    await pending(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture; f.available.add('word:two');
      const original = IDBObjectStore.prototype.put; let fired = false;
      IDBObjectStore.prototype.put = function (...args) {
        if (!fired && args[0]?.kind === 'document') { fired = true; throw new DOMException('Synthetic enrichment quota', 'QuotaExceededError'); }
        return original.apply(this, args);
      };
      let failed;
      try { failed = await f.enrich(); } finally { IDBObjectStore.prototype.put = original; }
      const call = f.lastEnrichmentCall; const unchanged = await f.disk();
      f.instance = await f.app.createRecordApp(f.options); const retry = await f.enrich(call);
      return { fired, failed, unchanged, before: f.enrichmentBefore, retry };
    });
    assert(value.fired); assert.equal(value.failed.status, 'recovery-required'); assert.deepEqual(value.unchanged, value.before);
    assert.equal(value.retry.status, 'active'); assert.equal(value.retry.snapshot.record.taken.length, 2);
  });
  await runCase(browser, engine, 'enrichment-lost-ack-retry-preserves-later-removal-and-current-noop', async page => {
    await pending(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture; f.available.add('word:two');
      f.controller.commitLocal = async request => { await f.realCommit(request); throw new Error('Synthetic lost enrichment acknowledgement'); };
      const failed = await f.enrich(); const call = f.lastEnrichmentCall;
      f.controller.commitLocal = f.realCommit; f.instance = await f.app.createRecordApp(f.options);
      const current = f.instance.current().snapshot;
      await f.instance.suppressAssessmentLearning({ changeId: 'suppress:after-enrichment', occurredAt: '2026-09-23T00:00:03.000Z' },
        { expectedRevision: current.revision, scope: current.identity, kind: 'remove', key: 'word:two' });
      const before = await f.disk(); const retry = await f.enrich(call); const after = await f.disk(); const noop = await f.enrich();
      return { failed, before, retry, after, noop };
    });
    assert.equal(value.failed.status, 'recovery-required'); assert.equal(value.retry.receipt.outcome, 'duplicate');
    assert.deepEqual(value.after, value.before); assert.deepEqual(value.noop.snapshot.record.taken.map(row => row.id), ['one']);
  });
  await runCase(browser, engine, 'enrichment-deleted-source-does-not-produce-cards-or-followup-update', async page => {
    await pending(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture, disk = await f.store.snapshot();
      await f.store.commitLocal({ changeId: 'delete:before-enrich', binding: disk.policy.binding, expectedRevision: disk.revision,
        occurredAt: '2026-09-23T00:00:01.000Z', mutations: [], operations: [{ payload: {
          kind: 'entity.tombstone', target: { kind: 'exam-attempt', id: 'attempt:test' }, reason: 'user-deleted' }, dependencies: [] }] });
      f.available.add('word:two'); const before = await f.disk(); const noop = await f.enrich(); return { before, noop, after: await f.disk() };
    });
    assert.equal(value.noop.status, 'active'); assert.equal(value.noop.receipt, undefined); assert.deepEqual(value.after, value.before);
    assert.equal(value.noop.snapshot.record.taken.length, 1);
  });
  await runCase(browser, engine, 'enrichment-independent-app-gate-rejects-missing-followup-operation', async page => {
    await pending(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture; f.available.add('word:two'); const failed = await f.enrich();
      return { failed, before: f.enrichmentBefore, after: await f.disk() };
    });
    assert.equal(value.failed.status, 'recovery-required'); assert.deepEqual(value.after, value.before);
  }, 'bad-enrich');
  await runCase(browser, engine, 'enrichment-bounded-batch-resumes-without-new-results-or-card-duplicates', async page => {
    await pending(page);
    const value = await page.evaluate(async () => {
      const f = window.fixture, learning = await import('/assessment-learning.mjs');
      const snapshot = await f.store.snapshot(), scope = f.instance.current().snapshot.identity;
      let record = JSON.parse(JSON.stringify(snapshot.documents.find(row => row.collection === 'learner-record').value));
      const operations = [];
      for (let index = 0; index < 20; index++) {
        const now = Date.parse('2026-09-23T00:00:01Z'), attemptId = `attempt:batch:${index}`;
        let library = f.assessment.startAssessmentV2(record.assessmentLibraryV2, f.form,
          { scope, attemptId, mode: 'timed', now, clockSessionId: 'clock:batch', monotonicMs: 0,
            editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-test-only', decisionRevisionIds: ['synthetic:no-content-approval'] } });
        for (const action of [{ kind: 'visit', itemId: 'two' },
          { kind: 'answer', itemId: 'two', response: { kind: 'selected', optionId: 'b' } }, { kind: 'submit' }])
          library = f.assessment.commandAssessmentV2(library, { scope, attemptId, now, clockSessionId: 'clock:batch', monotonicMs: 0,
            expectedRevisionId: f.assessment.selectAssessmentV2(library, attemptId).attempt.revisionId, action });
        const selected = f.assessment.selectAssessmentV2(library, attemptId);
        const planned = learning.planAssessmentLearning({ scope, form: selected.form, attempt: selected.attempt,
          outcomes: selected.score.items.map(row => ({ ...row, outcome: row.result, flagged: false })), resolveSubject: () => null });
        record = { ...record, assessmentLibraryV2: library, ...learning.applyAssessmentLearning(record, planned) };
        const followup = record.assessmentLearning.followups.find(row => row.id === planned.id);
        operations.push(...f.core.createAssessmentSyncIntentsV2({ form: selected.form, attempt: selected.attempt, result: selected.score, followup }));
      }
      await f.store.commitLocal({ changeId: 'fixture:many-pending', binding: snapshot.policy.binding, expectedRevision: snapshot.revision,
        occurredAt: '2026-09-23T00:00:01.000Z', mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: record }], operations });
      f.instance = await f.app.createRecordApp(f.options); f.available.add('word:two');
      const first = await f.enrich(); const second = await f.enrich(); return { first, second, disk: await f.disk() };
    });
    assert.equal(value.first.status, 'active'); assert.equal(value.first.learningEnrichment.followupIds.length, 20);
    assert.equal(value.first.learningEnrichment.remaining, 1);
    assert.equal(value.second.status, 'active'); assert.equal(value.second.learningEnrichment.followupIds.length, 1);
    assert.equal(value.second.learningEnrichment.remaining, 0);
    assert(value.second.snapshot.record.assessmentLearning.followups.every(row => row.status === 'complete'));
    assert.deepEqual(value.second.snapshot.record.taken.map(row => row.id), ['one', 'two']);
    assert.equal(value.disk.outbox.filter(row => row.payload.kind === 'assessment.result/2').length, 21);
    assert.equal(value.disk.outbox.filter(row => row.payload.kind === 'learning.followup/2').length, 42);
    assert.deepEqual(value.second.snapshot.record.revlog, [[111, 'word:one', 3]]);
  });
}
