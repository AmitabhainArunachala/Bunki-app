/** Instrumented app integration with real isolated learner storage. Runtime
 * implementations come from one immutable assembled artifact; a test-only
 * export shim and synthetic assessment responses are hashed separately.
 * This does not replace the uninstrumented production browser battery.
 * Nothing here connects to an existing app server or native sync transport. */
/* global S, D, recordApp, recordController, recordInstallation, assessmentV2Module,
   assessmentLearningModule, assessmentDefinitions, assessmentForms, recordWritable,
   loadAssessmentCatalog, startAssessmentRoom, currentAssessmentV2, applyAssessmentV2,
   toggleTaken, commitStorePatch, publishRecordSnapshot, reconcileAssessmentResults,
   resolveTeacherSource, assertLearningSource, enrichAssessmentCards, assessmentV2Notice,
   allAssessmentEvidence, assessmentReviewContext, startReview, render */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';

const evidence = resolveCorridorEvidence();
const site = resolveCorridorSite();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
// Module bindings are deliberately private in production. A server-only shim
// exposes existing functions to this isolated fixture, without changing their
// implementation or adding an entrypoint to any assembled/public artifact.
const exposed = ['S', 'D', 'recordApp', 'recordController', 'recordInstallation', 'assessmentV2Module',
  'assessmentLearningModule', 'assessmentDefinitions', 'assessmentForms', 'recordWritable',
  'loadAssessmentCatalog', 'startAssessmentRoom', 'currentAssessmentV2', 'applyAssessmentV2',
  'toggleTaken', 'commitStorePatch', 'publishRecordSnapshot', 'reconcileAssessmentResults',
  'resolveTeacherSource', 'assertLearningSource', 'enrichAssessmentCards', 'assessmentV2Notice', 'allAssessmentEvidence',
  'assessmentReviewContext', 'startReview', 'render'];
const corridorSource = readFileSync(resolve(site, 'corridor.js'));
const gradeDiagnostics = process.env.KAIRO_GRADE_DIAGNOSTICS === '1';
// Diagnostic wrappers are served only by this fixture. They observe the real
// grade/write functions and do not alter their result or suppress any failure.
// Installation is opt-in per isolated case; ordinary cases retain the export
// shim alone. This introduces promise-observation microtasks, recorded below.
const gradeDiagnosticShim = String.raw`
Object.defineProperty(window, '__installAssessmentGradeDiagnostic', { value: () => {
  const copy = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
  const diagnostic = { events: [], entered: 0, settled: 0 };
  const review = () => copy(S.review && { ix: S.review.ix, queue: S.review.queue,
    history: S.review.history, done: S.review.done, questionAttemptId: S.review.questionAttemptId,
    questionError: S.review.questionError, pending: !!S.review.pending,
    revealed: S.review.revealed, declared: S.review.declared, focus: S.focus });
  const errorInfo = error => ({ code: error?.code || null, message: String(error?.message || error) });
  const event = (kind, detail = {}) => diagnostic.events.push({ kind, at: performance.now(), ...copy(detail) });
  const originalFailure = recordFailure;
  recordFailure = function (...args) {
    event('record-failure', { args, stack: new Error('diagnostic caller').stack });
    return originalFailure.apply(this, args);
  };
  const originalWrite = recordApp.write;
  recordApp.write = async function (...args) {
    try {
      const outcome = await originalWrite.apply(this, args);
      event('app-write-return', { outcome });
      return outcome;
    } catch (error) { event('app-write-throw', errorInfo(error)); throw error; }
  };
  const originalPatch = commitStorePatch;
  commitStorePatch = async function (patch, ...args) {
    event('write-enter', { pending: recordApp.pending });
    const observed = typeof patch === 'function' ? function (...input) {
      event('producer-enter', { snapshot: input[1] });
      try { const value = patch.apply(this, input); event('producer-return'); return value; }
      catch (error) { event('producer-throw', errorInfo(error)); throw error; }
    } : patch;
    try {
      const value = await originalPatch.call(this, observed, ...args);
      // Capture current host outcome before any diagnostic snapshot reread.
      event('write-return', { value, current: recordApp.current(), pending: recordApp.pending });
      return value;
    } catch (error) { event('write-throw', errorInfo(error)); throw error; }
  };
  const originalGrade = commitStandardGrade;
  commitStandardGrade = async function (...args) {
    diagnostic.entered++;
    const { item, key, skey, rating, now, day } = args[0];
    event('grade-enter', { item, key, skey, rating, now, day, review: review(), writable: recordWritable() });
    try {
      const value = await originalGrade.apply(this, args);
      event('grade-return', { value, review: review(), writable: recordWritable(),
        current: recordApp.current(), pending: recordApp.pending });
      return value;
    } catch (error) { event('grade-throw', errorInfo(error)); throw error; }
    finally { diagnostic.settled++; }
  };
  diagnostic.review = review;
  diagnostic.invoke = () => {
    const rv = S.review, item = rv.queue[rv.ix], now = new Date();
    return commitStandardGrade({ rv, item, key: 'good', skey: srsKey(item.t, item.id),
      rating: fsrsApi.Rating.Good, now, day: dayKey(now) });
  };
  window.__assessmentGradeDiagnostic = diagnostic;
}});
`;
const corridorFixture = Buffer.concat([corridorSource, Buffer.from('\n' + exposed.map(name =>
  `Object.defineProperty(window,${JSON.stringify(name)},{get:()=>${name}});`).join('\n') + (gradeDiagnostics ? gradeDiagnosticShim : ''))]);
const core = await import(pathToFileURL(resolve(site, 'modules/assessment-core.mjs')));
const recordCore = await import(pathToFileURL(resolve(site, 'modules/record-core.mjs')));
const rights = { ...core.unknownAssessmentRights(), adapt: { status: 'allowed', basisRef: 'synthetic-original', policyVersion: 'fixture-only' } };
const provenance = { kind: 'original-human', authorRef: 'synthetic-app-fixture-only', processRef: null, sources: [] };
const item = core.createItemVersion({ format: 'kairo-assessment-item', v: 1, id: 'app-fixture:item', provenance, rights,
  skill: 'grammar', task: 'grammar-form', prompt: '駅へ（　）います。', translatedInstruction: null,
  rationale: 'Synthetic integration fixture only.', subjects: ['word:assessment-fixture-word'], passages: [], media: [],
  response: { kind: 'selected', options: [{ id: 'a', text: '行って' }, { id: 'b', text: '行った' }], answerOptionId: 'a' } });
const form = core.createFormVersion({ format: 'kairo-assessment-form', v: 1, id: 'app-fixture:form', provenance, rights,
  title: 'Synthetic app integration test', exam: { family: 'jlpt', track: 'N2' }, scope: 'short-practice', blueprintId: null,
  items: [item], passages: [], media: [], sections: [{ id: 'grammar', title: 'Synthetic', skill: 'grammar', itemIds: [item.id] }],
  timingBlocks: [{ id: 'block', sectionIds: ['grammar'], durationMs: 3_600_000,
    clock: 'elapsed-including-interruptions', authority: { kind: 'authoring-rule', ruleId: 'fixture-only' } }],
  authoring: { policyVersion: 'fixture-only', countsAre: 'authoring-rules', requirements: [] } });
const delivery = { schema: 'kairo-assessment-bank-delivery/1', form: core.artifactReference(form), assets: [], units: [] };
const entry = { id: form.id, level: 'N2', mode: 'short', titleJa: '合成テスト', titleEn: form.title,
  questionCount: 1, durationMinutes: 60, sourceClass: 'original-human', sourceIds: [],
  formPath: 'forms/app-fixture.json', formSha256: form.sha256, deliveryPath: 'delivery/app-fixture.json',
  deliverySha256: recordCore.encodeLocalJson(delivery).sha256,
  availability: { ready: true, reasons: [] }, review: { status: 'ai-reviewed' },
  editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'synthetic-only', decisionRevisionIds: ['synthetic-no-editorial-approval'] } };
const questionRights = Object.fromEntries(Object.keys(core.unknownAssessmentRights()).map(operation =>
  [operation, { status: 'allowed', basisRef: 'synthetic-app-question-fixture', policyVersion: 'fixture-only' }]));
const questionPassage = core.createPassageVersion({ format: 'kairo-assessment-passage', v: 1, id: 'question-app:passage',
  provenance, rights: questionRights, title: '合成資料', text: '図書館は火曜に開いています。水曜は休みです。',
  textSha256: createHash('sha256').update('図書館は火曜に開いています。水曜は休みです。').digest('hex'),
  language: 'ja', locationUnit: 'utf16-code-unit' });
const questionItems = [1, 2].map(index => core.createItemVersion({ format: 'kairo-assessment-item', v: 1,
  id: `question-app:item-${index}`, provenance, rights: questionRights, skill: 'reading', task: 'short-reading',
  prompt: `合成問題${index}：図書館はいつ開いていますか。`, translatedInstruction: null,
  rationale: '火曜に開いていると書かれています。', subjects: [], passages: [core.artifactReference(questionPassage)], media: [],
  response: { kind: 'selected', options: [{ id: 'a', text: '火曜' }, { id: 'b', text: '水曜' }], answerOptionId: 'a' } }));
const questionForm = core.createFormVersion({ format: 'kairo-assessment-form', v: 1, id: 'question-app:form',
  provenance, rights: questionRights, title: 'Synthetic question app fixture', exam: { family: 'jlpt', track: 'N2' },
  scope: 'short-practice', blueprintId: null, items: questionItems, passages: [questionPassage], media: [],
  sections: [{ id: 'reading', title: 'Reading', skill: 'reading', itemIds: questionItems.map(row => row.id) }],
  timingBlocks: [{ id: 'block', sectionIds: ['reading'], durationMs: 3600000,
    clock: 'elapsed-including-interruptions', authority: { kind: 'authoring-rule', ruleId: 'fixture-only' } }],
  authoring: { policyVersion: 'fixture-only', countsAre: 'authoring-rules', requirements: [] } });
const questionDelivery = { schema: 'kairo-assessment-bank-delivery/1', form: core.artifactReference(questionForm), assets: [], units: [] };
const questionEntry = { ...entry, id: questionForm.id, titleEn: questionForm.title, questionCount: 2,
  formPath: 'forms/question-app.json', formSha256: questionForm.sha256, deliveryPath: 'delivery/question-app.json',
  deliverySha256: recordCore.encodeLocalJson(questionDelivery).sha256 };
const fixtures = new Map(Object.entries({
  'data/assessment/catalog.json': { schema: 'kairo-assessment-catalog/1', entries: [entry, questionEntry] },
  'data/assessment/sources.json': { schema: 'kairo-assessment-sources/1', sources: [] },
  'data/assessment/forms/app-fixture.json': form,
  'data/assessment/delivery/app-fixture.json': delivery,
  'data/assessment/forms/question-app.json': questionForm,
  'data/assessment/delivery/question-app.json': questionDelivery,
}).map(([name, value]) => [name, Buffer.from(JSON.stringify(value))]));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const server = createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html';
  const path = resolve(site, name);
  if (!path.startsWith(`${site}${sep}`)) { response.writeHead(403).end(); return; }
  try {
    const bytes = name === 'corridor.js' ? corridorFixture : fixtures.get(name) || (existsSync(path) ? readFileSync(path) : null);
    if (!bytes) { response.writeHead(404).end(); return; }
    response.setHeader('content-type', mime[extname(name)] || 'application/octet-stream');
    response.setHeader('cache-control', 'no-store'); response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [], failures = [], diagnostics = [];
const engines = process.env.KAIRO_BROWSER === 'all' ? ['chromium', 'webkit'] : [process.env.KAIRO_BROWSER || 'chromium'];
async function boot(page) {
  await page.goto(`${origin}/?entry=shelf&ui=bi`);
  await page.waitForFunction(() => typeof recordWritable === 'function' && recordWritable() && D.grammar?.length > 0, null, { timeout: 60_000 });
}
async function start(page) {
  return page.evaluate(async () => {
    const catalog = await loadAssessmentCatalog();
    return startAssessmentRoom(catalog.entries[0], 'timed');
  });
}
async function finish(page) {
  return page.evaluate(async () => {
    const selected = currentAssessmentV2();
    const answered = await applyAssessmentV2({ kind: 'answer', itemId: selected.form.items[0].id,
      response: { kind: 'selected', optionId: 'b' } });
    const submitted = answered && await applyAssessmentV2({ kind: 'submit' });
    return { answered, submitted, writable: recordWritable(), record: recordApp.current().snapshot.record };
  });
}
async function receive(page, mappedWord = false) {
  return page.evaluate(async ({ form, entry, mappedWord }) => {
    const sync = await import('./modules/record-core.mjs');
    const current = await recordApp.snapshot(), scope = current.snapshot.identity;
    const now = Date.now() - 10_000, attemptId = 'received:app-fixture';
    let library = assessmentV2Module.startAssessmentV2(assessmentV2Module.createAssessmentLibraryV2({ scope }), form,
      { scope, attemptId, mode: 'timed', now, clockSessionId: 'received:clock', monotonicMs: 0, editorialAtStart: entry.editorialAtStart });
    for (const action of [{ kind: 'answer', itemId: form.items[0].id, response: { kind: 'selected', optionId: 'b' } }, { kind: 'submit' }])
      library = assessmentV2Module.commandAssessmentV2(library, { scope, attemptId, now: now + 100, clockSessionId: 'received:clock', monotonicMs: 100,
        expectedRevisionId: assessmentV2Module.selectAssessmentV2(library).attempt.revisionId, action });
    const selected = assessmentV2Module.selectAssessmentV2(library);
    const planned = assessmentLearningModule.planAssessmentLearning({ scope, form, attempt: selected.attempt,
      outcomes: selected.score.items.map(row => ({ ...row, outcome: row.result, flagged: false })),
      resolveSubject: () => mappedWord ? { t: 'word', id: 'assessment-fixture-word', label: 'assessment-fixture-word',
        dictionary: { r: 'ご', m: ['Synthetic dictionary sense differs from test context'] } } : null });
    const applied = assessmentLearningModule.applyAssessmentLearning(current.snapshot.record, planned);
    const intents = sync.createAssessmentSyncIntentsV2({ form, attempt: selected.attempt, result: selected.score,
      followup: applied.assessmentLearning.followups.find(row => row.id === planned.id) });
    let predecessor = null;
    const operations = intents.map((intent, index) => {
      const operation = sync.createSyncOperationV2({ format: 'kairo-sync-operation', v: 2, scope,
        actor: { deviceId: 'received:fixture-device', incarnationId: 'received:fixture-installation', sequence: index + 1 },
        predecessor, dependencies: intent.dependencies, schemaEpoch: recordInstallation.policy.schemaEpoch,
        deletionEpoch: recordInstallation.policy.deletionEpoch, mergePolicy: recordInstallation.policy.mergePolicy,
        occurredAt: new Date(now + 100).toISOString(), payload: intent.payload });
      predecessor = sync.operationReference(operation); return operation;
    });
    const before = await recordController.snapshot();
    const delivered = await recordController.commitReceive({ deliveryId: 'fixture:received', expectedRevision: before.snapshot.revision,
      delivery: { binding: recordInstallation.policy.binding, operations }, checkpoint: { channelId: 'fixture:channel', expected: null, next: 'fixture:1' } });
    if (delivered.status !== 'active') throw new Error(`Receive ${delivered.reason}`);
    publishRecordSnapshot((await recordApp.snapshot()).snapshot);
    const reconciled = await reconcileAssessmentResults();
    const sentence = S.taken.find(row => row.t === 'sentence');
    return { reconciled, writable: recordWritable(), sentence, record: recordApp.current().snapshot.record,
      status: recordApp.current().snapshot.assessmentReconciliation };
  }, { form, entry, mappedWord });
}
const caseFilter = process.argv.find(arg => arg.startsWith('--case='))?.slice(7);
async function run(engine, name, body) {
  if (caseFilter && !name.includes(caseFilter)) return;
  // This WebKit runtime's ephemeral context loses CacheStorage on navigation.
  // An isolated durable profile exercises the actual reload/offline contract.
  const profile = mkdtempSync(resolve(evidence, `${engine}-${name}-`));
  const context = await ({ chromium, webkit }[engine]).launchPersistentContext(profile, { headless: true });
  const page = context.pages()[0] || await context.newPage();
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
  try {
    await boot(page); await body(page, context);
    assert.deepEqual(pageErrors, []); results.push({ engine, name, passes: true });
    console.log(`PASS ${engine}/${name}`);
  } catch (error) {
    const state = await page.evaluate(() => ({ text: document.body.innerText.slice(0, 5000),
      error: typeof S === 'undefined' ? null : S.storeError, notice: typeof assessmentV2Notice === 'undefined' ? null : assessmentV2Notice,
      writable: typeof recordWritable === 'function' && recordWritable(),
      gradeDiagnostic: JSON.parse(JSON.stringify(window.__assessmentGradeDiagnostic || null)) })).catch(() => null);
    failures.push({ engine, name, error: String(error), pageErrors, state });
    console.error(`FAIL ${engine}/${name}: ${String(error)}`);
    writeFileSync(resolve(evidence, 'assessment-app-failures.json'), `${JSON.stringify(failures, null, 2)}\n`);
    await page.screenshot({ path: resolve(evidence, `${engine}-${name}.png`), fullPage: true }).catch(() => {});
  } finally { await context.close(); }
}
async function finishQuestionFixture(page) {
  const result = await page.evaluate(async () => {
    const catalog = await loadAssessmentCatalog();
    if (!await startAssessmentRoom(catalog.entries.find(row => row.id === 'question-app:form'), 'timed')) throw new Error('Question fixture start');
    const selected = currentAssessmentV2();
    for (const item of selected.form.items) {
      if (!await applyAssessmentV2({ kind: 'visit', itemId: item.id })) throw new Error('Question fixture visit');
      if (!await applyAssessmentV2({ kind: 'answer', itemId: item.id, response: { kind: 'selected', optionId: 'b' } })) throw new Error('Question fixture answer');
    }
    if (!await applyAssessmentV2({ kind: 'submit' })) throw new Error('Question fixture submit');
    const cards = S.taken.filter(row => row.t === 'question'); startReview(cards);
    return { cards, srs: S.srs, revlog: S.revlog, deepWords: S.deepWords,
      sidecar: S.assessmentQuestionPractice, writable: recordWritable() };
  });
  assert.equal(result.cards.length, 2); assert.equal(result.sidecar.plans.length, 2);
  assert.deepEqual(result.srs, {}); assert.deepEqual(result.revlog, []); assert.deepEqual(result.deepWords, {});
  assert.equal(result.sidecar.responses.length, 0); assert.equal(result.sidecar.grades.length, 0); assert(result.writable);
  await page.locator('#assessment-question-check').waitFor(); return result;
}
async function checkQuestionAnswer(page, option = 'a') {
  await page.locator(`input[name="assessment-question-answer"][value="${option}"]`).check();
  await page.locator('#assessment-question-check').click();
  await page.locator('#assessment-question-feedback').waitFor();
}
try {
  for (const engine of engines) {
      await run(engine, 'question-card-response-grade-skip-undo-reload', async page => {
        await page.setViewportSize({ width: 320, height: 844 });
        const initial = await finishQuestionFixture(page);
        assert.equal(await page.locator('.assessment-question-rationale').count(), 0);
        await checkQuestionAnswer(page);
        let state = await page.evaluate(() => ({ sidecar: S.assessmentQuestionPractice, srs: S.srs, revlog: S.revlog }));
        assert.equal(state.sidecar.responses.length, 1); assert.equal(state.sidecar.grades.length, 0);
        assert.deepEqual(state.srs, {}); assert.deepEqual(state.revlog, []);
        await page.locator('.grade.g-good').click();
        await page.waitForFunction(() => S.revlog.length === 1 && S.review.ix === 1);
        await page.locator('#assessment-question-skip').click();
        const more = page.locator('#zen-more');
        if (await more.count() && !await page.locator('.review-undo').isVisible()) await more.click();
        await page.locator('.review-undo').click();
        await page.waitForFunction(() => S.revlog.length === 2 && S.review.ix === 0);
        state = await page.evaluate(() => ({ sidecar: S.assessmentQuestionPractice, srs: S.srs, revlog: S.revlog, writable: recordWritable() }));
        assert.equal(state.sidecar.grades.length, 1); assert.deepEqual(state.srs, {}); assert(state.writable);
        assert.equal(state.revlog[0][1], `question:${initial.cards[0].id}`);
        assert.deepEqual(state.revlog[1].slice(1), [`question:${initial.cards[0].id}`, 0, 0]);
        await page.locator('#assessment-question-check').waitFor(); await checkQuestionAnswer(page);
        await page.locator('.grade.g-good').click();
        await page.waitForFunction(() => S.revlog.length === 3);
        const beforeReload = await page.evaluate(() => JSON.stringify(S.assessmentQuestionPractice));
        await page.reload(); await page.waitForFunction(() => recordWritable() && !!S.assessmentQuestionPractice);
        assert.equal(await page.evaluate(() => JSON.stringify(S.assessmentQuestionPractice)), beforeReload);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      });
      await run(engine, 'question-card-give-up-keeps-null-response-and-forces-again', async page => {
        await finishQuestionFixture(page);
        await page.locator('#assessment-question-reveal').click(); await page.locator('#assessment-question-feedback').waitFor();
        assert.equal(await page.evaluate(() => S.assessmentQuestionPractice.responses[0].response), null);
        assert.equal(await page.locator('.grade.g-good').count(), 0);
        await page.locator('.grade.g-again').click(); await page.waitForFunction(() => S.revlog.length === 1);
        const result = await page.evaluate(() => ({ grade: S.assessmentQuestionPractice.grades[0], row: S.revlog[0], writable: recordWritable() }));
        assert.equal(result.grade.grade, 'again'); assert.equal(result.row[2], 1); assert(result.writable);
      });
      await run(engine, 'question-card-offline-exact-source-and-review', async (page, context) => {
        await finishQuestionFixture(page);
        await page.evaluate(() => { S.view = 'tray'; S.review = null; render(); assessmentForms.clear(); assessmentDefinitions.clear(); });
        await context.setOffline(true);
        await page.evaluate(() => startReview(S.taken.filter(row => row.t === 'question')));
        await page.locator('#assessment-question-check').waitFor(); await checkQuestionAnswer(page);
        await page.locator('.grade.g-good').click(); await page.waitForFunction(() => S.revlog.length === 1);
        const record = await page.evaluate(() => recordApp.current().snapshot.record);
        assert.equal(record.assessmentQuestionPractice.responses.length, 1);
        assert.equal(record.assessmentQuestionPractice.grades.length, 1); assert.equal(record.revlog[0][2], 3);
      });
      for (const invocation of gradeDiagnostics ? ['click', 'direct'] : ['click']) await run(engine,
        `question-card-deleted-result-blocks-fresh-grade${invocation === 'direct' ? '-direct-control' : ''}`, async page => {
        await finishQuestionFixture(page); await checkQuestionAnswer(page);
        const before = await page.evaluate(async diagnostic => {
          const selected = currentAssessmentV2(), native = await recordController.snapshot();
          const result = await recordController.commitLocal({ changeId: 'fixture:question-delete', binding: recordInstallation.policy.binding,
            expectedRevision: native.snapshot.revision, occurredAt: new Date().toISOString(), mutations: [],
            operations: [{ payload: { kind: 'entity.tombstone', target: { kind: 'exam-attempt', id: selected.attempt.attemptId },
              reason: 'user-deleted' }, dependencies: [] }] });
          if (result.status !== 'active') throw new Error(result.reason);
          // Leave published UI deliberately stale: the queued grade must use its fresh storage snapshot.
          const durable = diagnostic ? await recordController.snapshot() : null;
          if (diagnostic) window.__installAssessmentGradeDiagnostic();
          return { retained: JSON.stringify(S.assessmentQuestionPractice), deletion: result,
            durable, review: diagnostic ? window.__assessmentGradeDiagnostic.review() : null };
        }, gradeDiagnostics);
        const diagnostic = { engine, invocation, before,
          limitation: invocation === 'direct' ? 'Calls the production grade function directly, bypassing button-handler guards.' : null };
        const saveDiagnostics = () => writeFileSync(resolve(evidence, 'assessment-grade-diagnostics.json'), `${JSON.stringify(diagnostics, null, 2)}\n`);
        if (gradeDiagnostics) { diagnostics.push(diagnostic); saveDiagnostics(); }
        try {
          if (invocation === 'click') await page.locator('.grade.g-good').click();
          else diagnostic.directReturn = await page.evaluate(() => window.__assessmentGradeDiagnostic.invoke());
          // An idle pending flag alone does not establish that the action ran.
          if (gradeDiagnostics) await page.waitForFunction(() => window.__assessmentGradeDiagnostic.entered > 0 &&
            window.__assessmentGradeDiagnostic.settled === window.__assessmentGradeDiagnostic.entered);
          await page.waitForFunction(() => !S.review.pending);
          const result = await page.evaluate(() => ({ writable: recordWritable(), srs: S.srs, revlog: S.revlog,
            sidecar: JSON.stringify(S.assessmentQuestionPractice), error: S.review.questionError }));
          diagnostic.result = result;
          assert.deepEqual(result.srs, {}); assert.deepEqual(result.revlog, []); assert.equal(result.sidecar, before.retained);
          assert(result.error); assert(result.writable);
        } catch (error) { diagnostic.executionError = String(error); throw error; }
        finally {
          if (gradeDiagnostics) {
            diagnostic.after = await page.evaluate(async () => {
              const currentBeforeRead = recordApp.current(), probe = window.__assessmentGradeDiagnostic;
              const captured = { currentBeforeRead, review: probe.review(), events: JSON.parse(JSON.stringify(probe.events)),
                entered: probe.entered, settled: probe.settled };
              try { captured.durable = await recordController.snapshot(); }
              catch (error) { captured.snapshotError = String(error); }
              return captured;
            }).catch(error => ({ captureError: String(error) }));
            saveDiagnostics();
          }
        }
      });
      for (const source of ['local', 'received']) await run(engine, `${source}-canonical-card-keeps-assessed-context`, async page => {
        if (source === 'received') await page.setViewportSize({ width: 320, height: 844 });
        await page.evaluate(() => { D.dict['assessment-fixture-word'] = { r: 'ご', m: ['Synthetic dictionary sense differs from test context'] }; });
        if (source === 'local') { assert.equal(await start(page), true); assert((await finish(page)).submitted); }
        else assert((await receive(page, true)).reconciled);
        const before = await page.evaluate(() => {
          const card = S.taken.find(row => row.t === 'word' && row.id === 'assessment-fixture-word');
          if (!card) throw new Error('Expected a durable auto-added canonical word');
          const context = assessmentReviewContext(card);
          startReview([{ t: card.t, id: card.id }]);
          return { context, srs: S.srs, revlog: S.revlog, deepWord: S.deepWords[card.id] };
        });
        assert.equal(before.context.prompt, item.prompt); assert.equal(before.context.rationale, item.rationale);
        assert.equal(before.deepWord.m[0], 'Synthetic dictionary sense differs from test context');
        await page.locator('#declare-notyet').waitFor();
        assert.equal(await page.locator('.assessment-review-context').count(), 0, 'No assessed explanation before recall declaration');
        await page.locator('#declare-notyet').click(); await page.locator('.assessment-review-context').waitFor();
        assert.match(await page.locator('.assessment-review-context').innerText(), /From your mock test/u);
        assert.equal(await page.locator('.assessment-review-rationale').textContent(), item.rationale);
        const after = await page.evaluate(() => ({ srs: S.srs, revlog: S.revlog }));
        assert.deepEqual(after, { srs: before.srs, revlog: before.revlog }, 'Revealing source context cannot grade a review');
        await page.waitForFunction(() => [...document.querySelectorAll('.review-face .reveal')].every(node => Number(getComputedStyle(node).opacity) >= .99));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Assessment context fits the review card without horizontal overflow');
        await page.screenshot({ path: resolve(evidence, `${engine}-${source}-revealed-context.png`), fullPage: true });
      });
      await run(engine, 'older-card-removal-after-test', async page => {
        assert.equal(await start(page), true); const finished = await finish(page);
        assert(finished.answered && finished.submitted && finished.writable);
        assert(finished.record.assessmentLearning);
        const value = await page.evaluate(async () => {
          const nodes = [{ t: 'radical', id: '人' }, { t: 'idiom', id: Object.keys(D.idioms)[0] }], results = [];
          for (const node of nodes) results.push({ node, added: await toggleTaken(node, node.id), removed: await toggleTaken(node, node.id) });
          return { results, writable: recordWritable(), taken: S.taken, error: S.storeError };
        });
        assert(value.results.every(row => row.added && row.removed)); assert(value.writable);
        assert(!value.taken.some(row => ['radical', 'idiom'].includes(row.t)));
      });
      await run(engine, 'received-cloze-reloads-and-keeps-offline-source', async (page, context) => {
        const received = await receive(page); assert(received.reconciled && received.writable && received.sentence);
        assert.equal(received.status.state, 'current'); assert.equal(received.record.assessmentLibraryV2.attempts.length, 0);
        await page.reload();
        await page.waitForFunction(() => recordWritable() && D.grammar?.length > 0 && assessmentDefinitions.size > 0, null, { timeout: 60_000 });
        const online = await page.evaluate(async () => {
          const card = S.taken.find(row => row.t === 'sentence'), context = S.teacherContexts.entries.find(row => row.id === card.sourceContextRef);
          let source; try { source = await resolveTeacherSource(context); } catch (error) { throw new Error(`Online source: ${error}`, { cause: error }); }
          const cacheState = [];
          for (const name of await caches.keys()) cacheState.push({ name, urls: (await (await caches.open(name)).keys()).map(row => row.url) });
          window.fixtureCacheState = cacheState;
          return { quote: source.context.quote, writable: recordWritable(), attempts: S.assessmentLibraryV2.attempts.length };
        });
        assert.equal(online.quote, '駅へ行っています。'); assert(online.writable); assert.equal(online.attempts, 0);
        await context.setOffline(true);
        const offline = await page.evaluate(async () => {
          assessmentDefinitions.clear(); assessmentForms.clear();
          const card = S.taken.find(row => row.t === 'sentence'), context = S.teacherContexts.entries.find(row => row.id === card.sourceContextRef);
          let source; try { source = await resolveTeacherSource(context); } catch (error) {
            const cache = await caches.open(`kairo-assessment-definitions:${new URL('./', location.href).href}:1`);
            const entries = [];
            for (const key of await cache.keys()) {
              const cached = await cache.match(key);
              try { entries.push({ url: key.url, json: (await cached.json()).sha256 }); }
              catch (readError) { entries.push({ url: key.url, error: String(readError) }); }
            }
            throw new Error(`Offline source: ${error}; definitions=${assessmentDefinitions.size}; cache=${JSON.stringify(entries)}; online=${JSON.stringify(window.fixtureCacheState)}; caches=${JSON.stringify(await caches.keys())}`, { cause: error });
          }
          assertLearningSource(S, context);
          return { quote: source.context.quote, writable: recordWritable() };
        });
        assert.deepEqual(offline, { quote: '駅へ行っています。', writable: true });
      });
      await run(engine, 'received-paper-is-recorded-as-prior-exposure', async page => {
        assert((await receive(page)).reconciled); assert.equal(await start(page), true);
        const value = await page.evaluate(() => ({ exposure: currentAssessmentV2().attempt.priorExposure,
          localAttempts: S.assessmentLibraryV2.attempts.length, writable: recordWritable() }));
        assert.equal(value.exposure, 'reported'); assert.equal(value.localAttempts, 1); assert(value.writable);
      });
      await run(engine, 'source-device-deletion-hides-history-and-sensei-but-retains-bytes', async page => {
        await page.evaluate(() => { D.dict['assessment-fixture-word'] = { r: 'ご', m: ['Synthetic fixture sense'] }; });
        assert.equal(await start(page), true); assert((await finish(page)).submitted);
        const value = await page.evaluate(async () => {
          const selected = currentAssessmentV2(), attemptId = selected.attempt.attemptId;
          const card = S.taken.find(row => row.t === 'sentence');
          const context = S.teacherContexts.entries.find(row => row.id === card.sourceContextRef);
          await resolveTeacherSource(context);
          const word = S.taken.find(row => row.t === 'word' && row.id === 'assessment-fixture-word');
          const beforeReviewContext = assessmentReviewContext(word);
          const beforeEvidence = allAssessmentEvidence();
          const retained = JSON.stringify(recordApp.current().snapshot.record.assessmentLibraryV2);
          const native = await recordController.snapshot();
          const removed = await recordController.commitLocal({ changeId: 'fixture:delete-local-result',
            binding: recordInstallation.policy.binding, expectedRevision: native.snapshot.revision,
            occurredAt: new Date().toISOString(), mutations: [], operations: [{ payload: {
              kind: 'entity.tombstone', target: { kind: 'exam-attempt', id: attemptId }, reason: 'user-deleted' }, dependencies: [] }] });
          if (removed.status !== 'active') throw new Error(`Deletion ${removed.reason}`);
          publishRecordSnapshot((await recordApp.snapshot()).snapshot);
          await reconcileAssessmentResults();
          let sourceError = null; try { await resolveTeacherSource(context); } catch (error) { sourceError = error.message; }
          S.view = 'mock'; render();
          return { beforeEvidence, afterEvidence: allAssessmentEvidence(), sourceError,
            beforeReviewContext, afterReviewContext: assessmentReviewContext(word),
            selected: currentAssessmentV2(attemptId), retained,
            after: JSON.stringify(recordApp.current().snapshot.record.assessmentLibraryV2), writable: recordWritable() };
        });
        assert.equal(value.beforeEvidence.completed, 1); assert.equal(value.afterEvidence.completed, 0);
        assert(value.beforeReviewContext); assert.equal(value.afterReviewContext, null);
        assert.deepEqual(value.afterEvidence.skills, {}); assert.equal(value.selected, null);
        assert.equal(value.sourceError, 'source-unavailable'); assert.equal(value.after, value.retained); assert(value.writable);
        await page.locator('#exam-history').click();
        assert.equal(await page.locator('[data-exam-attempt]').count(), 0);
      });
      await run(engine, 'dictionary-ready-enrichment-and-submit-are-serialized', async page => {
        assert.equal(await start(page), true); assert((await finish(page)).submitted);
        await page.evaluate(async () => {
          await commitStorePatch(latest => ({ assessmentLibraryV2: { ...latest.assessmentLibraryV2, activeAttemptId: null } }));
        });
        assert.equal(await start(page), true);
        const value = await page.evaluate(async () => {
          const selected = currentAssessmentV2();
          const beforeReview = JSON.parse(JSON.stringify({ srs: S.srs, revlog: S.revlog }));
          await applyAssessmentV2({ kind: 'answer', itemId: selected.form.items[0].id, response: { kind: 'selected', optionId: 'b' } });
          D.dict['assessment-fixture-word'] = { r: 'ご', m: ['Synthetic fixture meaning'] };
          const results = await Promise.all([enrichAssessmentCards(), applyAssessmentV2({ kind: 'submit' })]);
          return { results, beforeReview, writable: recordWritable(), record: recordApp.current().snapshot.record, error: S.storeError };
        });
        // The periodic maintenance task may already have completed enrichment
        // while the answer awaited storage. Its later explicit call is then a
        // legitimate no-op; require the same durable outcome in either order.
        assert.equal(value.results[1], true, JSON.stringify(value)); assert(value.writable); assert.equal(value.error, null);
        assert.equal(value.record.assessmentLibraryV2.attempts.length, 2);
        assert(value.record.assessmentLibraryV2.attempts.every(row => row.status === 'submitted'));
        assert.equal(value.record.assessmentLearning.followups.length, 2);
        assert(value.record.assessmentLearning.followups.every(row => row.status === 'complete'));
        assert.equal(value.record.taken.length, 2);
        assert.equal(value.record.taken.filter(row => row.t === 'word' && row.id === 'assessment-fixture-word').length, 1);
        assert.equal(value.record.taken.filter(row => row.t === 'sentence').length, 1);
        assert.deepEqual(value.record.srs, value.beforeReview.srs);
        assert.deepEqual(value.record.revlog, value.beforeReview.revlog);
      });
  }
} finally { await new Promise(done => server.close(done)); }
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = { format: 'kairo-assessment-instrumented-app-verification', v: 1,
  artifactSha256: identity.artifactSha256, sourceAssetSha256: identity.sourceAssetSha256, gitSha: identity.gitSha,
  instrumentation: { path: 'corridor.js', originalSha256: sha(corridorSource), servedSha256: sha(corridorFixture), exposed, gradeDiagnostics },
  fixtures: [...fixtures].map(([path, bytes]) => ({ path, sha256: sha(bytes) })), results, failures, diagnostics,
  limits: ['test-only export shim; this is not the uninstrumented production browser battery', ...(gradeDiagnostics ? ['deleted-result cases add diagnostic promise-observation microtasks and an extra native snapshot before grading; reproduce with KAIRO_GRADE_DIAGNOSTICS unset too'] : []), 'synthetic assessment content, not editorial approval', 'offline check covers retained exact source cache; production service-worker shell lifecycle is verified separately'] };
writeFileSync(resolve(evidence, 'assessment-app.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`Assessment app: ${results.length}/${results.length + failures.length} passed. ${resolve(evidence, 'assessment-app.json')}`);
if (failures.length) { console.error(JSON.stringify(failures, null, 2)); process.exitCode = 1; }
