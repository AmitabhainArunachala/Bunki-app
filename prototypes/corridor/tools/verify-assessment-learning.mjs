import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import process from 'node:process';
import console from 'node:console';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCorridorModules } from '../../../scripts/build-reading-module.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = process.env.KAIRO_EVIDENCE_DIR ? resolveCorridorEvidence() : resolve(homedir(), '.dharma/bunki_assessment/2026-09-23/learning');
mkdirSync(evidence, { recursive: true });
const stage = mkdtempSync(resolve(evidence, 'check-'));
mkdirSync(resolve(stage, 'modules'));
for (const module of buildCorridorModules(root)) writeFileSync(resolve(stage, module.path), module.bytes);
for (const name of ['assessment-learning.mjs', 'assessment-cloze.mjs', 'assessment-question-practice.mjs', 'assessment-v2-controller.mjs', 'teacher-context.mjs',
  'sentence-practice.mjs', 'teacher-drafts.mjs', 'sentence-drafts.mjs'])
  writeFileSync(resolve(stage, name), readFileSync(resolve(root, 'prototypes/corridor', name)));
const core = await import(pathToFileURL(resolve(stage, 'modules/assessment-core.mjs')));
const api = await import(pathToFileURL(resolve(stage, 'assessment-v2-controller.mjs')));
const learning = await import(pathToFileURL(resolve(stage, 'assessment-learning.mjs')));
const teacher = await import(pathToFileURL(resolve(stage, 'teacher-context.mjs')));
const sentences = await import(pathToFileURL(resolve(stage, 'sentence-practice.mjs')));
const clozes = await import(pathToFileURL(resolve(stage, 'assessment-cloze.mjs')));
const questions = await import(pathToFileURL(resolve(stage, 'assessment-question-practice.mjs')));
const scope = { accountId: 'fixture-account', learnerId: 'fixture-learner' };
const now = Date.parse('2026-09-23T00:00:00Z');
const rights = core.unknownAssessmentRights();
const provenance = { kind: 'original-human', authorRef: 'synthetic-fixture', processRef: null, sources: [] };
const items = ['word:猫', 'word:犬', 'word:鳥', 'word:馬'].map((subject, index) => core.createItemVersion({
  format: 'kairo-assessment-item', v: 1, id: `fixture-item-${index}`, provenance, rights,
  skill: 'vocabulary', task: 'fixture-choice', prompt: `合成テスト ${index}`, translatedInstruction: 'Synthetic test.',
  rationale: 'Synthetic fixture, not learner content.', passages: [], media: [], subjects: [subject],
  response: { kind: 'selected', options: [{ id: 'a', text: '一' }, { id: 'b', text: '二' }], answerOptionId: 'a' },
}));
const form = core.createFormVersion({ format: 'kairo-assessment-form', v: 1, id: 'fixture-form', provenance, rights,
  title: 'Synthetic learning fixture', exam: { family: 'jlpt', track: 'N2' }, scope: 'short-practice', blueprintId: null,
  items, passages: [], media: [], sections: [{ id: 'vocabulary', title: 'Vocabulary', skill: 'vocabulary', itemIds: items.map(item => item.id) }],
  timingBlocks: [{ id: 'written', sectionIds: ['vocabulary'], durationMs: 60_000, clock: 'elapsed-including-interruptions', authority: { kind: 'authoring-rule', ruleId: 'fixture-v1' } }],
  authoring: { policyVersion: 'fixture-v1', countsAre: 'authoring-rules', requirements: [] },
});
function finished({ abandon = false, reviewed = true, targets = true } = {}) {
  let library = api.startAssessmentV2(api.createAssessmentLibraryV2({ scope }), form, { scope, attemptId: 'fixture-attempt',
    mode: 'timed', now, clockSessionId: 'fixture-clock', monotonicMs: 0, priorExposure: 'none-reported',
    editorialAtStart: reviewed ? { status: 'ai-reviewed-practice', policyVersion: 'fixture-policy', decisionRevisionIds: ['fixture-decision'] }
      : { status: 'unreviewed', policyVersion: null, decisionRevisionIds: [] } });
  let ms = 0;
  const command = action => {
    ms += 1000;
    library = api.commandAssessmentV2(library, { scope, attemptId: library.activeAttemptId,
      expectedRevisionId: api.selectAssessmentV2(library).attempt.revisionId,
      now: now + ms, clockSessionId: 'fixture-clock', monotonicMs: ms, action });
  };
  command({ kind: 'answer', itemId: items[0].id, response: { kind: 'selected', optionId: 'b' } });
  command({ kind: 'visit', itemId: items[1].id });
  command({ kind: 'answer', itemId: items[1].id, response: { kind: 'selected', optionId: 'a' } });
  command({ kind: 'flag', itemId: items[1].id, flagged: true });
  command({ kind: 'visit', itemId: items[2].id });
  command({ kind: abandon ? 'abandon' : 'submit' });
  const selected = api.selectAssessmentV2(library);
  const followup = learning.planAssessmentLearning({ scope, form, attempt: selected.attempt,
    outcomes: selected.score.items.map(row => ({ ...row, outcome: row.result,
      flagged: selected.attempt.answers.find(answer => answer.item.id === row.itemId).flagged })),
    resolveSubject: subject => targets ? { t: 'word', id: subject.slice(5), label: subject.slice(5), dictionary: { r: 'ねこ', m: ['fixture'] } } : null });
  return { library, followup };
}
const checks = [];
function check(name, run) { run(); checks.push(name); }
const record = library => ({ v: 2, taken: [], deepWords: {}, srs: {}, revlog: [], suspended: {}, stats: {}, assessmentLibraryV2: library });

check('mistake and flagged uncertainty enroll; skip and not-reached remain pacing', () => {
  const { library, followup } = finished(); const state = record(library);
  const patch = learning.applyAssessmentLearning(state, followup);
  assert.deepEqual(patch.taken.map(item => item.id), ['猫', '犬']);
  assert.equal(patch.srs, undefined); assert.equal(patch.revlog, undefined); assert.equal(patch.stats, undefined);
  assert(learning.validateAssessmentLearningRecord({ ...state, ...patch }));
  const summary = learning.assessmentLearningSummary(patch.assessmentLearning, scope);
  assert.equal(summary.skills.vocabulary.incorrect, 1); assert.equal(summary.skills.vocabulary.unanswered, 1);
  assert.equal(summary.skills.vocabulary.notReached, 1); assert.equal(summary.focus.length, 1);
});
check('same followup retries never duplicate a card', () => {
  const { library, followup } = finished(); const state = record(library);
  const patch = learning.applyAssessmentLearning(state, followup);
  assert.deepEqual(learning.applyAssessmentLearning({ ...state, ...patch }, followup), {});
});
check('existing schedule, suspension and removal are preserved', () => {
  const { library, followup } = finished();
  const state = { ...record(library), taken: [{ t: 'word', id: '猫', ts: 1 }],
    srs: { 'word:猫': { due: '2027-01-01', stability: 99 } }, suspended: { 'word:犬': now } };
  const before = JSON.stringify(state);
  const patch = learning.applyAssessmentLearning(state, followup);
  assert.equal(patch.taken.length, 1); assert.deepEqual(patch.taken[0], state.taken[0]);
  assert.deepEqual(patch.assessmentLearning.followups[0].actions.map(row => row.status), ['existing', 'suppressed']);
  assert.equal(JSON.stringify(state), before);
  assert.equal(patch.srs, undefined); assert.equal(patch.suspended, undefined);
});
check('undo preserves reviewed cards and terminal evidence; later retry stays suppressed', () => {
  const { library, followup } = finished(); let state = record(library);
  state = { ...state, ...learning.applyAssessmentLearning(state, followup) };
  state.srs = { 'word:猫': { due: '2027-01-01' } };
  const patch = learning.undoAssessmentLearning(state, followup.id, now + 10000);
  assert.deepEqual(patch.taken.map(row => row.id), ['猫']);
  assert.equal(patch.assessmentLearning.followups.length, 1);
  assert.equal(patch.assessmentLearning.suppressions[0].key, 'word:犬');
  assert(learning.validateAssessmentLearningRecord({ ...state, ...patch }));
});
check('stopped tests generate no weakness or cards', () => {
  const { library, followup } = finished({ abandon: true });
  const patch = learning.applyAssessmentLearning(record(library), followup);
  assert.equal(followup.status, 'stopped'); assert.equal(followup.evidence.length, 0); assert.equal(patch.taken.length, 0);
  assert.equal(learning.assessmentLearningSummary(patch.assessmentLearning).focus.length, 0);
});
check('missing mapping and unreviewed content remain saved without false enrollment', () => {
  for (const args of [{ targets: false }, { reviewed: false }]) {
    const { library, followup } = finished(args); const patch = learning.applyAssessmentLearning(record(library), followup);
    assert.equal(patch.taken.length, 0); assert.equal(followup.evidence.length, 4);
    assert.match(followup.status, /^pending-/u);
  }
});
check('tampered outcome and foreign scope cannot become Sensei evidence', () => {
  const { library, followup } = finished(); const state = { ...record(library), ...learning.applyAssessmentLearning(record(library), followup) };
  assert.throws(() => learning.parseAssessmentLearning(state.assessmentLearning, { ...scope, learnerId: 'other' }));
  state.assessmentLearning.followups[0].evidence[0].outcome = 'correct';
  assert.throws(() => learning.validateAssessmentLearningRecord(state), /evidence-mismatch/u);
});
const context = await teacher.createTeacherContext({ version: 2, sourceKind: 'assessment-item', sourceId: 'fixture-item',
  sourceDigest: await teacher.digestText('合成テスト'), unit: 'utf16-code-unit', start: 0, end: 5, index: 0,
  quote: '合成テスト', title: 'Fixture', attribution: 'Synthetic', url: null, target: null });
assert.equal((await teacher.verifyTeacherContext(context)).version, 2);
assert.throws(() => teacher.parseTeacherContext({ ...context, version: 1 }));
checks.push('assessment-item context is v2 and cannot masquerade as v1');
check('reviewed one-blank questions become source clozes in the same patch without inventing a grade', () => {
  const allowed = Object.fromEntries(Object.keys(rights).map(key => [key,
    { status: 'allowed', basisRef: 'synthetic-fixture', policyVersion: 'fixture/v1' }]));
  const itemInput = { ...items[0] }; delete itemInput.revisionId; delete itemInput.sha256;
  const formInput = { ...form }; delete formInput.revisionId; delete formInput.sha256;
  const clozeItem = core.createItemVersion({ ...itemInput, rights: allowed, skill: 'grammar', task: 'grammar-form',
    prompt: '適切な言葉を選んでください。\n説明書を読んだ（　）、使い方が分からない。',
    response: { kind: 'selected', options: [{ id: 'a', text: 'ものの' }, { id: 'b', text: 'とたん' }], answerOptionId: 'a' } });
  const candidate = core.createFormVersion({ ...formInput, rights: allowed, items: [clozeItem],
    sections: [{ id: 'grammar', title: 'Grammar', skill: 'grammar', itemIds: [clozeItem.id] }],
    timingBlocks: [{ ...form.timingBlocks[0], sectionIds: ['grammar'] }] });
  let library = api.startAssessmentV2(api.createAssessmentLibraryV2({ scope }), candidate, { scope,
    attemptId: 'cloze-fixture', mode: 'timed', now, clockSessionId: 'cloze-clock', monotonicMs: 0,
    editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'fixture-policy', decisionRevisionIds: ['fixture-decision'] } });
  for (const action of [{ kind: 'answer', itemId: clozeItem.id, response: { kind: 'selected', optionId: 'b' } }, { kind: 'submit' }])
    library = api.commandAssessmentV2(library, { scope, attemptId: library.activeAttemptId,
      expectedRevisionId: api.selectAssessmentV2(library).attempt.revisionId, now: now + 1000,
      clockSessionId: 'cloze-clock', monotonicMs: 1000, action });
  const selected = api.selectAssessmentV2(library);
  const followup = learning.planAssessmentLearning({ scope, form: candidate, attempt: selected.attempt,
    outcomes: selected.score.items.map(row => ({ ...row, outcome: row.result })), resolveSubject: () => null });
  const base = record(library), patch = learning.applyAssessmentLearning(base, followup), state = { ...base, ...patch };
  assert.equal(patch.taken.length, 1); assert.equal(patch.taken[0].t, 'sentence');
  assert.equal(patch.sentencePractice.entries[0].context.quote, '説明書を読んだものの、使い方が分からない。');
  assert.equal(patch.sentencePractice.responses.length, 0); assert.equal(patch.sentencePractice.grades.length, 0);
  assert.equal(patch.srs, undefined); assert.equal(patch.revlog, undefined);
  assert(sentences.validateSentencePracticeRecord(state)); assert(learning.validateAssessmentLearningRecord(state));
  assert.deepEqual(learning.applyAssessmentLearning(state, followup), {});
  assert.equal(learning.undoAssessmentLearning(state, followup.id, now + 2000).taken.length, 0);
  const reference = JSON.parse(patch.sentencePractice.entries[0].context.sourceId);
  assert.deepEqual(reference, { formId: candidate.id, formSha256: candidate.sha256,
    itemId: clozeItem.id, itemRevisionId: clozeItem.revisionId, derivation: 'cloze-v2' });
  function repeat(base, attemptId, offset) {
    let later = api.startAssessmentV2(base.assessmentLibraryV2, candidate, { scope, attemptId,
      mode: 'timed', now: now + offset, clockSessionId: 'repeat-clock', monotonicMs: 0,
      editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'fixture-policy', decisionRevisionIds: ['fixture-decision'] } });
    for (const action of [{ kind: 'answer', itemId: clozeItem.id, response: { kind: 'selected', optionId: 'b' } }, { kind: 'submit' }])
      later = api.commandAssessmentV2(later, { scope, attemptId, expectedRevisionId: api.selectAssessmentV2(later).attempt.revisionId,
        now: now + offset + 1000, clockSessionId: 'repeat-clock', monotonicMs: 1000, action });
    const selected = api.selectAssessmentV2(later);
    const followup = learning.planAssessmentLearning({ scope, form: candidate, attempt: selected.attempt,
      outcomes: selected.score.items.map(row => ({ ...row, outcome: row.result })), resolveSubject: () => null });
    const updated = { ...base, assessmentLibraryV2: later };
    return { followup, state: { ...updated, ...learning.applyAssessmentLearning(updated, followup) } };
  }
  const cardKey = `sentence:${state.taken[0].id}`;
  const reviewed = { ...state, srs: { [cardKey]: { due: 9999, stability: 42 } }, revlog: [[now + 2000, cardKey, 4]] };
  const repeated = repeat(reviewed, 'cloze-repeat-reviewed', 3000);
  assert.equal(repeated.followup.actions[0].target.id, followup.actions[0].target.id);
  assert.notEqual(repeated.followup.evidence[0].id, followup.evidence[0].id);
  assert.deepEqual(repeated.state.taken, reviewed.taken);
  assert.deepEqual(repeated.state.srs, reviewed.srs); assert.deepEqual(repeated.state.revlog, reviewed.revlog);
  assert.deepEqual(repeated.state.sentencePractice, reviewed.sentencePractice);
  assert.equal(repeated.state.assessmentLearning.followups.at(-1).actions[0].status, 'existing');
  assert.deepEqual(clozes.createAssessmentClozePractice(repeated.followup.actions[0].target, state.sentencePractice), state.sentencePractice.entries[0]);
  assert(learning.validateAssessmentLearningRecord(repeated.state));
  checks.push('a repeated mistake keeps one canonical cloze, its first capture and reviewed schedule');
  const removed = { ...state, ...learning.suppressAssessmentLearning(state, cardKey, now + 2000), taken: [] };
  const afterRemoval = repeat(removed, 'cloze-repeat-removed', 6000);
  assert.equal(afterRemoval.state.taken.length, 0);
  assert.equal(afterRemoval.state.assessmentLearning.followups.at(-1).actions[0].status, 'suppressed');
  assert.deepEqual(afterRemoval.state.sentencePractice, state.sentencePractice);
  assert(learning.validateAssessmentLearningRecord(afterRemoval.state));
  checks.push('a repeated mistake cannot recreate an explicitly removed cloze');
  state.assessmentLearning.followups[0].actions[0].target.cloze.start++;
  assert.throws(() => learning.validateAssessmentLearningRecord(state), /action-mismatch/u);
});
check('untargeted reading and grammar mistakes become exact question cards while missing dictionary targets stay pending', () => {
  const allowed = Object.fromEntries(Object.keys(rights).map(key => [key,
    { status: 'allowed', basisRef: 'synthetic-fixture', policyVersion: 'fixture/v1' }]));
  const itemBase = { ...items[0] }; delete itemBase.revisionId; delete itemBase.sha256;
  const formBase = { ...form }; delete formBase.revisionId; delete formBase.sha256;
  const candidates = [
    { id: 'question-reading', skill: 'reading', task: 'short-reading', subjects: [], prompt: '文章を読んで答えてください。' },
    { id: 'question-grammar', skill: 'grammar', task: 'sentence-composition', subjects: [], prompt: '語を正しい順に並べてください。' },
    { id: 'question-missing-word', skill: 'vocabulary', task: 'paraphrase', subjects: ['word:unresolved'], prompt: '未対応の語彙項目。' },
    { id: 'question-known-word', skill: 'vocabulary', task: 'paraphrase', subjects: ['word:known'], prompt: '対応済みの語彙項目。' },
    { id: 'question-cloze', skill: 'grammar', task: 'grammar-form', subjects: [], prompt: '説明書を読んだ（　）、分からない。' },
  ].map(row => core.createItemVersion({ ...itemBase, ...row, rights: allowed,
    response: { kind: 'selected', options: [{ id: 'a', text: 'ものの' }, { id: 'b', text: 'とたん' }], answerOptionId: 'a' } }));
  const candidate = core.createFormVersion({ ...formBase, rights: allowed, items: candidates,
    sections: candidates.map(item => ({ id: item.id, title: item.skill, skill: item.skill, itemIds: [item.id] })),
    timingBlocks: [{ ...form.timingBlocks[0], sectionIds: candidates.map(item => item.id) }] });
  function finish(base, attemptId, offset = 0) {
    let library = api.startAssessmentV2(base.assessmentLibraryV2, candidate, { scope, attemptId,
      mode: 'practice', now: now + offset, clockSessionId: attemptId,
      editorialAtStart: { status: 'ai-reviewed-practice', policyVersion: 'fixture-policy', decisionRevisionIds: ['fixture-decision'] } });
    for (const action of [...candidates.flatMap(item => [{ kind: 'visit', itemId: item.id },
      { kind: 'answer', itemId: item.id, response: { kind: 'selected', optionId: 'b' } }]), { kind: 'submit' }])
      library = api.commandAssessmentV2(library, { scope, attemptId, expectedRevisionId: api.selectAssessmentV2(library).attempt.revisionId,
        now: now + offset + 1000, clockSessionId: attemptId, action });
    const selected = api.selectAssessmentV2(library);
    const followup = learning.planAssessmentLearning({ scope, form: candidate, attempt: selected.attempt,
      outcomes: selected.score.items.map(row => ({ ...row, outcome: row.result })),
      resolveSubject: subject => subject === 'word:known' ? { t: 'word', id: 'known', label: 'known' } : null });
    const before = { ...base, assessmentLibraryV2: library };
    return { followup, before, state: { ...before, ...learning.applyAssessmentLearning(before, followup) } };
  }
  const first = finish(record(api.createAssessmentLibraryV2({ scope })), 'questions-first');
  assert.deepEqual(first.state.taken.map(row => row.t), ['question', 'question', 'word', 'sentence']);
  assert.equal(first.followup.status, 'pending-mapping');
  assert.equal(first.state.assessmentQuestionPractice.plans.length, 2);
  assert.equal(first.state.assessmentQuestionPractice.responses.length, 0);
  assert.equal(first.state.assessmentQuestionPractice.grades.length, 0);
  assert.deepEqual(first.state.srs, {}); assert.deepEqual(first.state.revlog, []);
  assert(questions.validateAssessmentQuestionRecord(first.state)); assert(learning.validateAssessmentLearningRecord(first.state));
  assert.equal(learning.assessmentLearningSummary(first.state.assessmentLearning).focus.some(row => row.subject.startsWith('question:')), false);
  const question = first.state.taken[0], key = `question:${question.id}`;
  const reviewed = { ...first.state, srs: { [key]: { due: 9999, stability: 42 } }, revlog: [[now + 2000, key, 3]] };
  const repeated = finish(reviewed, 'questions-repeat', 3000);
  assert.deepEqual(repeated.state.taken, reviewed.taken);
  assert.deepEqual(repeated.state.assessmentQuestionPractice, reviewed.assessmentQuestionPractice);
  assert.deepEqual(repeated.state.srs, reviewed.srs); assert.deepEqual(repeated.state.revlog, reviewed.revlog);
  assert.equal(repeated.state.assessmentLearning.followups.at(-1).actions[0].status, 'existing');
  assert(learning.validateAssessmentLearningRecord(repeated.state));
  checks.push('repeat question mistakes retain one source plan and never overwrite an existing review schedule');
  const removed = { ...first.state, ...learning.suppressAssessmentLearning(first.state, key, now + 2000),
    taken: first.state.taken.filter(row => row.id !== question.id) };
  const afterRemoval = finish(removed, 'questions-removed', 6000);
  assert.equal(afterRemoval.state.taken.some(row => row.id === question.id), false);
  assert.equal(afterRemoval.state.assessmentLearning.followups.at(-1).actions[0].status, 'suppressed');
  assert.deepEqual(afterRemoval.state.assessmentQuestionPractice, first.state.assessmentQuestionPractice);
  checks.push('suppression prevents question re-enrollment without deleting retained source history');
  const legacyFollowup = { ...first.followup, status: 'pending-mapping',
    actions: first.followup.actions.filter(action => action.target.t !== 'question') };
  const legacy = { ...first.before, ...learning.applyAssessmentLearning(first.before, legacyFollowup) };
  const beforeActions = JSON.stringify(legacy.assessmentLearning.followups[0].actions);
  const enriched = { ...legacy, ...learning.applyAssessmentLearningEnrichment(legacy, first.followup) };
  assert.equal(enriched.assessmentQuestionPractice.plans.length, 2);
  assert.equal(JSON.stringify(enriched.assessmentLearning.followups[0].actions.slice(0, legacyFollowup.actions.length)), beforeActions);
  assert.deepEqual(enriched.srs, legacy.srs); assert.deepEqual(enriched.revlog, legacy.revlog);
  assert.deepEqual(learning.applyAssessmentLearningEnrichment(enriched, first.followup), {});
  assert(learning.validateAssessmentLearningRecord(enriched));
  checks.push('enrichment adds only missing question plans and preserves prior action bytes');
});
// G1 assisted why. Oracles are literal (the independent acceptance ledger's truth table
// and fixed expectations); planner output is never used to build an expected value.
const reviewedAtStart = { status: 'ai-reviewed-practice', policyVersion: 'fixture-policy', decisionRevisionIds: ['fixture-decision'] };
const word = subject => ({ t: 'word', id: subject.slice(5), label: subject.slice(5) });
const withoutMark = row => { const copy = { ...row }; delete copy.assistance; return copy; };
// One untimed attempt: item 0 correct, item 1 wrong, item 2 correct, item 3 never reached.
// `assist` lists items whose explanation is opened after their committed answer.
function practiced({ assist = [], abandon = false, resolveSubject = word } = {}) {
  let library = api.startAssessmentV2(api.createAssessmentLibraryV2({ scope }), form, { scope, attemptId: 'why-attempt',
    mode: 'practice', now, clockSessionId: 'why-clock', monotonicMs: 0, priorExposure: 'none-reported', editorialAtStart: reviewedAtStart });
  let ms = 0;
  const command = action => {
    ms += 1000;
    library = api.commandAssessmentV2(library, { scope, attemptId: 'why-attempt',
      expectedRevisionId: api.selectAssessmentV2(library).attempt.revisionId,
      now: now + ms, clockSessionId: 'why-clock', monotonicMs: ms, action });
  };
  for (const [index, optionId] of [[0, 'a'], [1, 'b'], [2, 'a']]) {
    if (index) command({ kind: 'visit', itemId: items[index].id });
    command({ kind: 'answer', itemId: items[index].id, response: { kind: 'selected', optionId } });
    if (assist.includes(index)) command({ kind: 'assistance', itemId: items[index].id, reason: 'explanation' });
  }
  command({ kind: abandon ? 'abandon' : 'submit' });
  const selected = api.selectAssessmentV2(library);
  const followup = learning.planAssessmentLearning({ scope, form, attempt: selected.attempt,
    outcomes: api.assessmentOutcomesV2(selected), resolveSubject });
  return { library, selected, followup };
}
check('one enrollment rule through the evidence adapter, the wire adapter and the planner', () => {
  const table = [['incorrect', false, false, true], ['incorrect', true, true, true], ['correct', false, false, false],
    ['correct', true, false, true], ['correct', false, true, true], ['correct', true, true, true],
    ['unanswered', true, false, false], ['not-reached', false, false, false]];
  const { selected } = practiced();
  const mark = { kind: 'explanation', at: now + 500 };
  for (const [outcome, flagged, assisted, eligible] of table) {
    assert.equal(api.assessmentFollowupEligible({ outcome, flagged, assisted }), eligible);
    assert.equal(api.assessmentEvidenceEligible({ outcome, flagged, ...(assisted ? { assistance: mark } : {}) }), eligible);
    assert.equal(api.assessmentResultItemEligible({ result: outcome, flagged, ...(assisted ? { assisted: true } : {}) }), eligible);
    const outcomes = api.assessmentOutcomesV2(selected).map((row, index) => index ? { ...row, outcome: 'correct', flagged: false } : {
      ...row, outcome, flagged, response: ['correct', 'incorrect'].includes(outcome) ? row.response : { kind: 'unanswered' },
      ...(assisted ? { assistance: mark } : {}) });
    const planned = learning.planAssessmentLearning({ scope, form, attempt: selected.attempt, outcomes, resolveSubject: word });
    // once per exact target: a flagged and assisted answer still yields one action
    assert.equal(planned.actions.length, eligible ? 1 : 0, `${outcome}/${flagged}/${assisted}`);
  }
  for (const fake of [true, 'yes', 1, {}, [], { kind: 'hint', at: now }, { kind: 'explanation', at: 'soon' }, { kind: 'explanation', at: -1 }]) {
    assert.equal(api.assessmentEvidenceEligible({ outcome: 'correct', flagged: false, assistance: fake }), false);
    const outcomes = api.assessmentOutcomesV2(selected).map(row => ({ ...row, outcome: 'correct', flagged: false, assistance: fake }));
    assert.equal(learning.planAssessmentLearning({ scope, form, attempt: selected.attempt, outcomes, resolveSubject: word }).actions.length, 0);
  }
  for (const fake of ['true', 1, {}, { kind: 'explanation' }, false, null])
    assert.equal(api.assessmentResultItemEligible({ result: 'correct', flagged: false, assisted: fake }), false);
});
check('assisted answers enroll with the mark as provenance, never as a grade', () => {
  const { library, selected, followup } = practiced({ assist: [0, 1] });
  const marks = selected.attempt.answers.map(row => row.assistance ? { kind: row.assistance.kind, at: row.assistance.at } : null);
  assert.deepEqual(marks.map(Boolean), [true, true, false, false]);
  assert.deepEqual(followup.evidence.map(row => row.assistance ?? null), marks);
  const state = record(library), patch = learning.applyAssessmentLearning(state, followup);
  assert.deepEqual(patch.taken.map(row => row.id), ['猫', '犬']);
  assert(patch.taken.every(row => row.by === 'assessment' && row.started === selected.attempt.endedAt));
  assert.equal(patch.srs, undefined); assert.equal(patch.revlog, undefined); assert.equal(patch.stats, undefined);
  assert(learning.validateAssessmentLearningRecord({ ...state, ...patch }));
  const plain = practiced();
  assert.deepEqual(learning.applyAssessmentLearning(record(plain.library), plain.followup).taken.map(row => row.id), ['犬']);
  const unassistedKeys = JSON.stringify(['elapsedMs', 'flagged', 'id', 'item', 'outcome', 'response', 'skill', 'subjects', 'task']);
  assert(plain.followup.evidence.every(row => JSON.stringify(Object.keys(row).sort()) === unassistedKeys));
});
check('an assisted answer whose target already exists keeps that card and its schedule', () => {
  const { library, followup } = practiced({ assist: [0] });
  const state = { ...record(library), taken: [{ t: 'word', id: '猫', ts: 1 }], srs: { 'word:猫': { due: '2027-01-01', stability: 99 } } };
  const before = JSON.stringify(state);
  const patch = learning.applyAssessmentLearning(state, followup);
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(patch.taken[0], state.taken[0]);
  assert.deepEqual(patch.assessmentLearning.followups[0].actions.map(row => [row.target.id, row.status]), [['猫', 'existing'], ['犬', 'added']]);
  assert.equal(patch.srs, undefined);
});
check('the record validator binds every evidence mark to its attempt', () => {
  const { library, followup } = practiced({ assist: [0] });
  const state = { ...record(library), ...learning.applyAssessmentLearning(record(library), followup) };
  const variant = edit => { const copy = JSON.parse(JSON.stringify(state)); edit(copy.assessmentLearning.followups[0].evidence); return copy; };
  assert.throws(() => learning.validateAssessmentLearningRecord(variant(rows => { delete rows[0].assistance; })), /evidence-mismatch/u);
  assert.throws(() => learning.validateAssessmentLearningRecord(variant(rows => { rows[0].assistance.at += 1; })), /evidence-mismatch/u);
  assert.throws(() => learning.validateAssessmentLearningRecord(variant(rows => { rows[2].assistance = { kind: 'explanation', at: now }; })), /evidence-mismatch/u);
  assert.throws(() => learning.parseAssessmentLearning(variant(rows => { rows[0].assistance.extra = 1; }).assessmentLearning), /invalid-evidence/u);
  assert.throws(() => learning.parseAssessmentLearning(variant(rows => { rows[3].assistance = { kind: 'explanation', at: now }; }).assessmentLearning), /invalid-evidence/u);
});
check('E1: a pending-mapping retry keeps assisted evidence and prior actions, adding only the unresolved target', () => {
  const partial = subject => subject === 'word:犬' ? word(subject) : null; // the assisted 猫 is unresolved at first
  const first = practiced({ assist: [0], resolveSubject: partial });
  assert.equal(first.followup.status, 'pending-mapping');
  const base = record(first.library), before = { ...base, ...learning.applyAssessmentLearning(base, first.followup) };
  assert.deepEqual(before.taken.map(row => row.id), ['犬']);
  const prior = before.assessmentLearning.followups[0], priorActions = JSON.stringify(prior.actions);
  const replanned = learning.planAssessmentLearning({ scope, form, attempt: first.selected.attempt,
    outcomes: api.assessmentOutcomesV2(first.selected), resolveSubject: word });
  const after = { ...before, ...learning.applyAssessmentLearningEnrichment(before, replanned) };
  const enriched = after.assessmentLearning.followups[0];
  assert.equal(enriched.id, prior.id); assert.equal(enriched.status, 'complete');
  assert.equal(JSON.stringify(enriched.evidence), JSON.stringify(prior.evidence));
  assert.deepEqual(enriched.evidence[0].assistance, { kind: 'explanation', at: first.selected.attempt.answers[0].assistance.at });
  assert.equal(JSON.stringify(enriched.actions.slice(0, prior.actions.length)), priorActions);
  assert.deepEqual(after.taken.map(row => row.id), ['犬', '猫']);
  assert.deepEqual(after.srs, {}); assert.deepEqual(after.revlog, []);
  assert(learning.validateAssessmentLearningRecord(after));
  // once complete, a repeat is refused rather than re-applied (the host then prepares no write)
  assert.throws(() => learning.applyAssessmentLearningEnrichment(after, replanned), /not-pending-mapping/u);
});
check('E2: dropping the mark in finalization, or separately in enrichment, is refused with prior state intact', () => {
  const run = practiced({ assist: [0] });
  const dropped = learning.planAssessmentLearning({ scope, form, attempt: run.selected.attempt,
    outcomes: api.assessmentOutcomesV2(run.selected).map(withoutMark), resolveSubject: word });
  const state = record(run.library), before = JSON.stringify(state);
  assert.throws(() => learning.validateAssessmentLearningRecord({ ...state, ...learning.applyAssessmentLearning(state, dropped) }), /evidence-mismatch/u);
  assert.equal(JSON.stringify(state), before);
  const pending = practiced({ assist: [0], resolveSubject: subject => subject === 'word:犬' ? word(subject) : null });
  const committed = { ...record(pending.library), ...learning.applyAssessmentLearning(record(pending.library), pending.followup) };
  const snapshot = JSON.stringify(committed);
  const retry = learning.planAssessmentLearning({ scope, form, attempt: pending.selected.attempt,
    outcomes: api.assessmentOutcomesV2(pending.selected).map(withoutMark), resolveSubject: word });
  assert.throws(() => learning.applyAssessmentLearningEnrichment(committed, retry), /enrichment-evidence-changed/u);
  assert.equal(JSON.stringify(committed), snapshot);
});
check('PENDING-JOHN-Q1 (a regression boundary, not a ruling): a stopped practice with an assisted answer creates no followup work', () => {
  const { library, selected, followup } = practiced({ assist: [0], abandon: true });
  assert(selected.attempt.answers[0].assistance);
  assert.equal(followup.status, 'stopped'); assert.deepEqual(followup.evidence, []); assert.deepEqual(followup.actions, []);
  assert.equal(learning.applyAssessmentLearning(record(library), followup).taken.length, 0);
});
check('the sheet stays closed until the mark is durable; results partition honestly, history included', () => {
  const begin = api.startAssessmentV2(api.createAssessmentLibraryV2({ scope }), form, { scope, attemptId: 'sheet',
    mode: 'practice', now, clockSessionId: 'sheet-clock', monotonicMs: 0, priorExposure: 'none-reported', editorialAtStart: reviewedAtStart });
  const step = (library, action, ms) => api.commandAssessmentV2(library, { scope, attemptId: 'sheet',
    expectedRevisionId: api.selectAssessmentV2(library, 'sheet').attempt.revisionId, now: now + ms,
    clockSessionId: 'sheet-clock', monotonicMs: ms, action });
  const answered = step(begin, { kind: 'answer', itemId: items[0].id, response: { kind: 'selected', optionId: 'b' } }, 1000);
  assert.equal(api.selectAssessmentExplanationV2(answered, 'sheet', items[0].id), null);
  const marked = step(answered, { kind: 'assistance', itemId: items[0].id, reason: 'explanation' }, 2000);
  const sheet = api.selectAssessmentExplanationV2(marked, 'sheet', items[0].id);
  assert.deepEqual({ verdict: sheet.verdict, chosen: sheet.chosen.optionId, key: sheet.key.optionId, rule: sheet.rule,
    distractorLines: sheet.distractorLines, editorial: sheet.editorial },
  { verdict: 'incorrect', chosen: 'b', key: 'a', rule: items[0].rationale, distractorLines: null, editorial: 'ai-reviewed-practice' });
  assert.equal(step(marked, { kind: 'assistance', itemId: items[0].id, reason: 'explanation' }, 3000), marked);
  const done = step(marked, { kind: 'submit' }, 4000);
  assert.deepEqual({ ...api.assessmentIndependenceV2(api.selectAssessmentV2(done, 'sheet')) },
    { answered: 1, assisted: 1, assistedCorrect: 0, unanswered: 3, attribution: 'complete', independent: 0 });
  // C3: attempt-level help from before any item mark stays unattributed afterwards
  const history = step(answered, { kind: 'assistance', reason: 'hint' }, 1500);
  const both = step(step(history, { kind: 'assistance', itemId: items[0].id, reason: 'explanation' }, 2000), { kind: 'submit' }, 3000);
  const counts = api.assessmentIndependenceV2(api.selectAssessmentV2(both, 'sheet'));
  assert.deepEqual([counts.assisted, counts.attribution, counts.independent], [1, 'unknown', null]);
  const only = api.assessmentIndependenceV2(api.selectAssessmentV2(step(history, { kind: 'submit' }, 2000), 'sheet'));
  assert.deepEqual([only.assisted, only.attribution, only.independent], [0, 'unknown', null]);
  assert(api.selectAssessmentV2(both, 'sheet').attempt.answers.filter(row => row.assistance).length === 1);
});
// Re-derives the published revision formula (sha256 over 2-space canonical JSON) to seal a
// derived legacy shape. A wrong formula makes parse reject it: a setup failure, never a pass.
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const canonicalText = value => JSON.stringify(canonical(value), null, 2);
function resealAttempt(attempt) {
  const payload = JSON.parse(JSON.stringify(attempt)); delete payload.revisionId; delete payload.sha256;
  const sha256 = createHash('sha256').update(canonicalText(payload), 'utf8').digest('hex');
  return { ...payload, revisionId: `assessment-attempt-v2:${sha256}`, sha256 };
}
check('C1: an aggregate assisted condition without item attribution withholds the independent count', () => {
  const begin = api.startAssessmentV2(api.createAssessmentLibraryV2({ scope }), form, { scope, attemptId: 'legacy',
    mode: 'practice', now, clockSessionId: 'legacy-clock', monotonicMs: 0, priorExposure: 'none-reported', editorialAtStart: reviewedAtStart });
  const step = (library, action, ms) => api.commandAssessmentV2(library, { scope, attemptId: 'legacy',
    expectedRevisionId: api.selectAssessmentV2(library, 'legacy').attempt.revisionId, now: now + ms,
    clockSessionId: 'legacy-clock', monotonicMs: ms, action });
  let library = step(begin, { kind: 'answer', itemId: items[0].id, response: { kind: 'selected', optionId: 'a' } }, 1000);
  library = step(library, { kind: 'visit', itemId: items[1].id }, 2000);
  library = step(library, { kind: 'answer', itemId: items[1].id, response: { kind: 'selected', optionId: 'a' } }, 3000);
  const aggregate = step(step(library, { kind: 'assistance', reason: 'hint' }, 4000), { kind: 'submit' }, 5000);
  // The parser-valid legacy shape: the condition kept, no event, no item mark.
  const withEvent = api.selectAssessmentV2(aggregate, 'legacy').attempt;
  assert(withEvent.conditions.includes('assisted'));
  const legacyAttempt = resealAttempt({ ...withEvent, events: withEvent.events.filter(row => row.kind !== 'assistance') });
  const plain = JSON.parse(JSON.stringify(aggregate));
  const legacy = api.parseAssessmentLibraryV2({ ...plain, attempts: [legacyAttempt] });
  const parsed = api.selectAssessmentV2(legacy, 'legacy');
  assert.equal(canonicalText(parsed.attempt), canonicalText(legacyAttempt), 'the legacy bytes are kept as they are');
  const result = api.assessmentIndependenceV2(parsed);
  assert.deepEqual({ ...result }, { answered: 2, assisted: 0, assistedCorrect: 0, unanswered: 2, attribution: 'unknown', independent: null });
  assert(parsed.attempt.conditions.includes('assisted'));
  assert(parsed.attempt.answers.every(row => !row.assistance));
  // An ordinary record with neither condition nor event keeps the independent branch.
  const ordinary = api.assessmentIndependenceV2(practiced().selected);
  assert.deepEqual([ordinary.attribution, ordinary.independent, ordinary.answered], ['complete', 3, 3]);
  // Repeated historical commands on one answered item: five events on a four-question form.
  let repeated = step(begin, { kind: 'answer', itemId: items[0].id, response: { kind: 'selected', optionId: 'a' } }, 1000);
  for (let index = 0; index < 5; index++) repeated = step(repeated, { kind: 'assistance', reason: 'hint' }, 2000 + index);
  const five = api.selectAssessmentV2(step(repeated, { kind: 'submit' }, 3000), 'legacy');
  assert.equal(five.attempt.events.filter(row => row.kind === 'assistance').length, 5);
  const honest = api.assessmentIndependenceV2(five);
  // question units only: no event count is exposed, and the partition still sums to the form
  assert.deepEqual(Object.keys(honest).sort(), ['answered', 'assisted', 'assistedCorrect', 'attribution', 'independent', 'unanswered']);
  assert.deepEqual([honest.answered, honest.assisted, honest.unanswered, honest.attribution, honest.independent], [1, 0, 3, 'unknown', null]);
  assert.equal(honest.answered + honest.unanswered, form.items.length);
});
check('D1: a later lawful explanation keeps inherited unknown attribution; a fresh one stays complete', () => {
  const begin = api.startAssessmentV2(api.createAssessmentLibraryV2({ scope }), form, { scope, attemptId: 'inherited',
    mode: 'practice', now, clockSessionId: 'inherited-clock', monotonicMs: 0, priorExposure: 'none-reported', editorialAtStart: reviewedAtStart });
  const step = (library, action, ms) => api.commandAssessmentV2(library, { scope, attemptId: 'inherited',
    expectedRevisionId: api.selectAssessmentV2(library, 'inherited').attempt.revisionId, now: now + ms,
    clockSessionId: 'inherited-clock', monotonicMs: ms, action });
  const twoAnswers = library => {
    library = step(library, { kind: 'answer', itemId: items[0].id, response: { kind: 'selected', optionId: 'a' } }, 1000);
    library = step(library, { kind: 'visit', itemId: items[1].id }, 2000);
    return step(library, { kind: 'answer', itemId: items[1].id, response: { kind: 'selected', optionId: 'a' } }, 3000);
  };
  // S, frozen once: an admitted active practice state with two answers (the second current),
  // the aggregate condition, and no item mark or assistance event.
  const withHelp = step(twoAnswers(begin), { kind: 'assistance', reason: 'hint' }, 4000);
  const live = api.selectAssessmentV2(withHelp, 'inherited').attempt;
  const frozen = resealAttempt({ ...live, events: live.events.filter(row => row.kind !== 'assistance') });
  const S = api.parseAssessmentLibraryV2({ ...JSON.parse(JSON.stringify(withHelp)), attempts: [frozen] });
  assert.equal(canonicalText(api.selectAssessmentV2(S, 'inherited').attempt), canonicalText(frozen));
  assert.equal(api.selectAssessmentV2(S, 'inherited').attempt.cursor.itemId, items[1].id);
  const through = library => api.parseAssessmentLibraryV2(JSON.parse(JSON.stringify(library))); // serialize, then parse
  // Branch A: submit directly.
  const a = api.assessmentIndependenceV2(api.selectAssessmentV2(through(step(S, { kind: 'submit' }, 5000)), 'inherited'));
  assert.deepEqual([a.answered, a.assisted, a.attribution, a.independent], [2, 0, 'unknown', null]);
  // Branch B: one lawful explanation on the current answer, then submit.
  const bSelected = api.selectAssessmentV2(through(step(step(S, { kind: 'assistance', itemId: items[1].id,
    reason: 'explanation' }, 5000), { kind: 'submit' }, 6000)), 'inherited');
  const b = api.assessmentIndependenceV2(bSelected);
  assert.deepEqual([b.answered, b.assisted, b.attribution, b.independent], [2, 1, 'unknown', null]);
  assert.deepEqual(bSelected.attempt.answers.filter(row => row.assistance).map(row => row.item.id), [items[1].id]);
  assert.deepEqual(bSelected.attempt.answers[1].response, { kind: 'selected', optionId: 'a' });
  assert.deepEqual(bSelected.attempt.answers[1].assistance.response, { kind: 'selected', optionId: 'a' });
  // Fresh companion: the same answers with no history; its sole explanation is complete.
  const cSelected = api.selectAssessmentV2(through(step(step(twoAnswers(begin), { kind: 'assistance', itemId: items[1].id,
    reason: 'explanation' }, 4000), { kind: 'submit' }, 5000)), 'inherited');
  const c = api.assessmentIndependenceV2(cSelected);
  assert.deepEqual([c.answered, c.assisted, c.attribution, c.independent], [2, 1, 'complete', 1]);
  assert.equal('assistanceAttribution' in cSelected.attempt, false);
});
writeFileSync(resolve(stage, 'receipt.json'), JSON.stringify({ checks, count: checks.length, status: 'passed' }, null, 2));
console.log(JSON.stringify({ checks: checks.length, status: 'passed', evidence: stage }));
