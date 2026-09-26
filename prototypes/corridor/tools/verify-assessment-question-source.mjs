import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCorridorModules } from '../../../scripts/build-reading-module.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = process.env.KAIRO_EVIDENCE_DIR ? resolveCorridorEvidence()
  : resolve(homedir(), '.dharma/bunki_assessment/2026-09-23/question-source');
mkdirSync(evidence, { recursive: true });
const stage = mkdtempSync(resolve(evidence, 'check-'));
mkdirSync(resolve(stage, 'modules'));
const sha = value => createHash('sha256').update(value).digest('hex');
const sources = [];
for (const module of buildCorridorModules(root)) writeFileSync(resolve(stage, module.path), module.bytes);
for (const name of ['assessment-question-source.mjs', 'assessment-question-practice.mjs', 'assessment-v2-controller.mjs',
  'assessment-learning.mjs', 'assessment-cloze.mjs', 'sentence-practice.mjs', 'teacher-context.mjs', 'teacher-drafts.mjs', 'sentence-drafts.mjs']) {
  const path = resolve(root, 'prototypes/corridor', name), bytes = readFileSync(path);
  sources.push({ path, sha256: sha(bytes) }); writeFileSync(resolve(stage, name), bytes);
}
const core = await import(pathToFileURL(resolve(stage, 'modules/assessment-core.mjs')));
const recordCore = await import(pathToFileURL(resolve(stage, 'modules/record-core.mjs')));
const controller = await import(pathToFileURL(resolve(stage, 'assessment-v2-controller.mjs')));
const learningApi = await import(pathToFileURL(resolve(stage, 'assessment-learning.mjs')));
const questionApi = await import(pathToFileURL(resolve(stage, 'assessment-question-practice.mjs')));
const { resolveAssessmentQuestionSource: resolveSource } = await import(pathToFileURL(resolve(stage, 'assessment-question-source.mjs')));
const copy = value => JSON.parse(JSON.stringify(value));
const hash = value => recordCore.encodeLocalJson(value).sha256;
const scope = { accountId: 'fixture-account', learnerId: 'fixture-learner' };
const at = Date.parse('2026-09-23T00:00:00.000Z');
const editorialAtStart = { status: 'ai-reviewed-practice', policyVersion: 'fixture-review', decisionRevisionIds: ['fixture-decision'] };
const rights = Object.fromEntries(Object.keys(core.unknownAssessmentRights()).map(key =>
  [key, { status: 'allowed', basisRef: 'synthetic-owned-fixture', policyVersion: 'fixture-v1' }]));
const provenance = { kind: 'original-human', authorRef: 'synthetic-fixture', processRef: null, sources: [] };
const item = core.createItemVersion({ format: 'kairo-assessment-item', v: 1, id: 'fixture-reading', provenance, rights,
  skill: 'reading', task: 'short-reading', prompt: '図書館は火曜に開きます。開いているのはいつですか。',
  translatedInstruction: null, rationale: '火曜と書いてあります。', passages: [], media: [], subjects: [],
  response: { kind: 'selected', options: [{ id: 'a', text: '月曜' }, { id: 'b', text: '火曜' }], answerOptionId: 'b' } });
const form = core.createFormVersion({ format: 'kairo-assessment-form', v: 1, id: 'fixture-form', provenance, rights,
  title: 'Synthetic source fixture', exam: { family: 'jlpt', track: 'N2' }, scope: 'short-practice', blueprintId: null,
  items: [item], passages: [], media: [], sections: [{ id: 'reading', title: 'Reading', skill: 'reading', itemIds: [item.id] }],
  timingBlocks: [{ id: 'written', sectionIds: ['reading'], durationMs: 60000, clock: 'elapsed-including-interruptions',
    authority: { kind: 'authoring-rule', ruleId: 'fixture' } }],
  authoring: { policyVersion: 'fixture', countsAre: 'authoring-rules', requirements: [] } });
let library = controller.startAssessmentV2(controller.createAssessmentLibraryV2({ scope }), form,
  { scope, attemptId: 'fixture-attempt', mode: 'practice', now: at, clockSessionId: 'fixture-clock',
    priorExposure: 'none-reported', editorialAtStart });
for (const [index, action] of [{ kind: 'answer', itemId: item.id, response: { kind: 'selected', optionId: 'a' } },
  { kind: 'submit' }].entries()) {
  library = controller.commandAssessmentV2(library, { scope, attemptId: library.activeAttemptId,
    expectedRevisionId: controller.selectAssessmentV2(library).attempt.revisionId,
    now: at + (index + 1) * 1000, clockSessionId: 'fixture-clock', action });
}
const selected = controller.selectAssessmentV2(library);
const planned = learningApi.planAssessmentLearning({ scope, form, attempt: selected.attempt,
  outcomes: selected.score.items.map(row => ({ ...row, outcome: row.result, flagged: false })) });
const patch = learningApi.applyAssessmentLearning({ taken: [], srs: {}, revlog: [], assessmentLibraryV2: library }, planned);
const nativeFollowup = patch.assessmentLearning.followups[0];
const wire = recordCore.createAssessmentSyncIntentsV2({ form, attempt: selected.attempt, result: selected.score, followup: nativeFollowup });
const target = nativeFollowup.actions[0].target;
const plan = target.question, key = `question:${plan.id}`;
const action = nativeFollowup.actions[0], followup = nativeFollowup;
const operationRefs = [{ opId: 'a'.repeat(64), sha256: 'b'.repeat(64) }];
const baseResults = [{ attemptId: selected.attempt.attemptId, headResults: [{ payload: copy(wire[0].payload), operationRefs }],
  projection: { requiresChoice: false, tombstones: [], identityConflicts: [] } }];
const wireFollowup = copy(wire[1].payload);
const baseLearning = { followups: [{ payload: wireFollowup, operationRefs, resultBinding: 'matched', suppressedActionIds: [] }],
  suppressions: [], scheduling: 'not-computed' };
const taken = [{ t: 'question', id: plan.id, label: item.prompt, started: at }];
const trusted = () => ({ form, editorialAtStart });
function local() {
  return { plan, record: { taken: copy(taken), suspended: {}, assessmentLibraryV2: library,
    assessmentLearning: { followups: [copy(followup)], suppressions: [] } },
    results: copy(baseResults), learning: copy(baseLearning), resolveForm: trusted };
}
function received() {
  const results = copy(baseResults), learning = copy(baseLearning);
  return { plan, results, learning, resolveForm: trusted, record: { taken: copy(taken), suspended: {},
    assessmentLibraryV2: controller.createAssessmentLibraryV2({ scope }), assessmentLearning: { followups: [], suppressions: [] },
    assessmentReceived: { sourceDigest: hash({ results, learning }), followups: [{ id: followup.id,
      attemptId: selected.attempt.attemptId, attemptRevisionId: selected.attempt.revisionId, form: selected.attempt.form,
      operationRefs: copy(operationRefs), status: 'applied' }],
    actions: [{ followupId: followup.id, actionId: action.id, key, status: 'added' }] } } };
}
function refreshDigest(input) { input.record.assessmentReceived.sourceDigest = hash({ results: input.results, learning: input.learning }); }
const results = [];
function check(name, run) {
  try { run(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, pass: false, error: error.stack }); console.error(`FAIL ${name}: ${error.stack}`); }
}
check('real local terminal evidence without wire kind resolves an enrolled reviewed question', () => {
  assert.equal(followup.evidence[0].item.kind, undefined);
  const source = resolveSource(local()); assert(source); assert.equal(source.visible, true);
  assert.equal(questionApi.assertAssessmentQuestionSource(plan, source).id, plan.id);
});
check('local missing or ambiguous result views never bypass source visibility', () => {
  for (const mutate of [input => { input.results = []; },
    input => { input.results[0].projection.tombstones = [operationRefs[0]]; },
    input => { input.results[0].projection.requiresChoice = true; },
    input => { input.results[0].projection.identityConflicts = ['fixture']; },
    input => { input.results[0].headResults.push(copy(input.results[0].headResults[0])); }]) {
    const input = local(); mutate(input); assert.equal(resolveSource(input), null);
  }
});
check('local current result must still name the exact submitted form and terminal revision', () => {
  for (const mutate of [payload => { payload.attemptRevisionId = 'another-revision'; },
    payload => { payload.form.sha256 = '0'.repeat(64); }, payload => { payload.outcome = 'abandoned'; }]) {
    const input = local(); mutate(input.results[0].headResults[0].payload); assert.equal(resolveSource(input), null);
  }
});
check('local enrollment, suspension, eligible outcome and current form trust are required', () => {
  for (const mutate of [input => { input.record.taken = []; }, input => { input.record.suspended[key] = at; },
    input => { input.record.assessmentLearning.followups[0].evidence[0].outcome = 'unanswered'; },
    input => { input.record.assessmentLearning.followups[0].evidence[0].item.sha256 = '0'.repeat(64); },
    input => { input.resolveForm = () => null; },
    input => { input.resolveForm = () => ({ form, editorialAtStart: { status: 'unreviewed' } }); }]) {
    const input = local(); mutate(input); assert.equal(resolveSource(input), null);
  }
});
check('received exact bound applied evidence resolves with body-free wire item refs', () => {
  const input = received(); assert.equal(input.learning.followups[0].payload.evidence[0].item.kind, 'item');
  const source = resolveSource(input); assert(source);
  assert.equal(questionApi.assertAssessmentQuestionSource(plan, source).id, plan.id);
});
check('received stale projection, hidden source, conflict or unbound followup cannot issue a grade', () => {
  for (const mutate of [input => { input.record.assessmentReceived.sourceDigest = '0'.repeat(64); },
    input => { input.record.assessmentReceived.followups[0].status = 'hidden'; },
    input => { input.results[0].projection.tombstones.push(operationRefs[0]); refreshDigest(input); },
    input => { input.results[0].projection.requiresChoice = true; refreshDigest(input); },
    input => { input.results[0].projection.identityConflicts = ['fixture']; refreshDigest(input); },
    input => { input.learning.followups[0].resultBinding = 'conflicting'; refreshDigest(input); },
    input => { input.learning.followups[0].resultBinding = 'missing-or-hidden'; refreshDigest(input); },
    input => { input.learning.followups[0].resultBinding = 'ineligible'; refreshDigest(input); }]) {
    const input = received(); mutate(input); assert.equal(resolveSource(input), null);
  }
});
check('received changed heads and source refs remain blocked even with a current projection digest', () => {
  for (const mutate of [input => { input.results[0].headResults[0].payload.attemptRevisionId = 'changed'; },
    input => { input.learning.followups[0].operationRefs[0].opId = 'c'.repeat(64); },
    input => { input.results[0].headResults[0].payload.items[0].item.sha256 = '0'.repeat(64); },
    input => { delete input.learning.followups[0].payload.evidence[0].item.kind; },
    input => { input.record.assessmentReceived.actions[0].actionId = 'unmatched'; },
    input => { input.results[0].headResults[0].payload.outcome = 'abandoned'; },
    input => { input.resolveForm = () => null; }]) {
    const input = received(); mutate(input); refreshDigest(input); assert.equal(resolveSource(input), null);
  }
});
check('received wrong or flagged evidence is eligible; skips and unflagged correct are not', () => {
  for (const [outcome, flagged, eligible] of [['incorrect', false, true], ['correct', true, true],
    ['correct', false, false], ['unanswered', false, false], ['not-reached', false, false]]) {
    const input = received(); Object.assign(input.results[0].headResults[0].payload.items[0], { result: outcome, flagged });
    refreshDigest(input); assert.equal(!!resolveSource(input), eligible);
  }
});
// G1: the fixed eligibility truth table (LITERALS.json eligibilityTruthTable, fixture ledger 5653be4e…)
// through both adapters of the real resolver: the local branch reads a valid evidence mark, the
// received branch the literal wire flag. A truthy stand-in for either is not assistance.
check('local mark and received wire flag drive the fixed truth table; truthy stand-ins do not', () => {
  const mark = { kind: 'explanation', at };
  for (const [outcome, flagged, assisted, eligible] of [['incorrect', false, false, true], ['incorrect', true, true, true],
    ['correct', false, false, false], ['correct', true, false, true], ['correct', false, true, true],
    ['correct', true, true, true], ['unanswered', true, false, false], ['not-reached', false, false, false]]) {
    const localInput = local(), evidence = localInput.record.assessmentLearning.followups[0].evidence[0];
    Object.assign(evidence, { outcome, flagged }); delete evidence.assistance;
    if (assisted) evidence.assistance = { ...mark };
    assert.equal(!!resolveSource(localInput), eligible, `local ${outcome} flagged=${flagged} assisted=${assisted}`);
    const receivedInput = received(), wire = receivedInput.results[0].headResults[0].payload.items[0];
    Object.assign(wire, { result: outcome, flagged }); delete wire.assisted;
    if (assisted) wire.assisted = true;
    refreshDigest(receivedInput);
    assert.equal(!!resolveSource(receivedInput), eligible, `received ${outcome} flagged=${flagged} assisted=${assisted}`);
  }
  for (const standIn of [true, 'explanation', { kind: 'hint', at }, { kind: 'explanation', at: -1 }, {}]) {
    const input = local();
    Object.assign(input.record.assessmentLearning.followups[0].evidence[0], { outcome: 'correct', flagged: false, assistance: standIn });
    assert.equal(resolveSource(input), null, `local stand-in ${JSON.stringify(standIn)}`);
  }
  for (const standIn of ['true', 1, {}, false]) {
    const input = received();
    Object.assign(input.results[0].headResults[0].payload.items[0], { result: 'correct', flagged: false, assisted: standIn });
    refreshDigest(input); assert.equal(resolveSource(input), null, `received stand-in ${JSON.stringify(standIn)}`);
  }
});
check('remote undo preserves a reviewed retained-history card and explicit removal remains absent', () => {
  const input = received(); input.record.srs = { [key]: { due: '2026-10-01T00:00:00.000Z', reps: 3 } };
  input.record.revlog = [[at, key, 3]];
  input.record.assessmentReceived.actions[0].status = 'retained-history';
  input.learning.followups[0].suppressedActionIds = [action.id];
  input.learning.suppressions = [{ target: { t: 'question', id: plan.id }, reason: 'undo-auto-add' }];
  refreshDigest(input); const before = JSON.stringify(input.record);
  assert(resolveSource(input)); assert.equal(JSON.stringify(input.record), before);
  input.learning.suppressions[0].reason = 'removed'; input.record.taken = [];
  refreshDigest(input); assert.equal(resolveSource(input), null);
});
for (const source of sources) assert.equal(sha(readFileSync(source.path)), source.sha256, `${source.path} changed during check`);
const receipt = { format: 'kairo-assessment-question-source-verification', v: 1, stage, sources, results,
  passed: results.filter(row => row.pass).length, failed: results.filter(row => !row.pass).length,
  limitations: ['Real v2 engine, learning planner and wire serializers with synthetic view projections. Does not replace atomic receive/browser integration tests.'] };
writeFileSync(resolve(stage, 'receipt.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receipt: resolve(stage, 'receipt.json'), passed: receipt.passed, failed: receipt.failed }));
if (receipt.failed) process.exitCode = 1;
