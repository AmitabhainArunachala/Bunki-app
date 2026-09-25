import assert from 'node:assert/strict';
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
writeFileSync(resolve(stage, 'receipt.json'), JSON.stringify({ checks, count: checks.length, status: 'passed' }, null, 2));
console.log(JSON.stringify({ checks: checks.length, status: 'passed', evidence: stage }));
