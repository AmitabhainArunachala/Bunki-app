/** Production-compiled v2 contract checks. This does not claim a browser walk. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCorridorModules } from '../../../scripts/build-reading-module.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = resolve(process.env.KAIRO_EVIDENCE_DIR ||
  resolve(homedir(), '.dharma/bunki_assessment/2026-09-23/assessment-v2-controller'));
const relativeEvidence = relative(root, evidence);
assert(isAbsolute(relativeEvidence) || relativeEvidence === '..' || relativeEvidence.startsWith(`..${sep}`),
  'Evidence must live outside the repository');
mkdirSync(evidence, { recursive: true });
const stage = mkdtempSync(resolve(evidence, 'runtime-'));
mkdirSync(resolve(stage, 'modules'));
const core = buildCorridorModules(root).find((module) => module.path === 'modules/assessment-core.mjs');
assert(core);
writeFileSync(resolve(stage, core.path), core.bytes);
const controllerBytes = readFileSync(resolve(root, 'prototypes/corridor/assessment-v2-controller.mjs'));
writeFileSync(resolve(stage, 'assessment-v2-controller.mjs'), controllerBytes);
const api = await import(pathToFileURL(resolve(stage, 'assessment-v2-controller.mjs')).href);
const shared = await import(pathToFileURL(resolve(stage, core.path)).href);
const rights = shared.unknownAssessmentRights();
const provenance = { kind: 'original-human', authorRef: 'synthetic-test-author', processRef: null, sources: [] };
const item = (id, skill) => shared.createItemVersion({
  format: 'kairo-assessment-item', v: 1, id, provenance, rights, skill, task: 'synthetic-choice',
  prompt: '合成テストの問題です。', translatedInstruction: 'Synthetic test fixture.',
  rationale: 'Not learner content.', passages: [], media: [], subjects: [],
  response: { kind: 'selected', options: [{ id: 'a', text: '一' }, { id: 'b', text: '二' }], answerOptionId: 'a' },
});
const items = [item('item:vocabulary', 'vocabulary'), item('item:grammar', 'grammar')];
const sections = items.map((entry) => ({ id: `section:${entry.skill}`, title: entry.skill,
  skill: entry.skill, itemIds: [entry.id] }));
const form = shared.createFormVersion({ format: 'kairo-assessment-form', v: 1, id: 'form:synthetic',
  provenance, rights, title: 'Synthetic controller fixture', exam: { family: 'jlpt', track: 'N2' },
  scope: 'short-practice', blueprintId: null, items, passages: [], media: [], sections,
  timingBlocks: sections.map((section) => ({ id: `block:${section.skill}`, sectionIds: [section.id],
    durationMs: 60_000, clock: 'elapsed-including-interruptions',
    authority: { kind: 'authoring-rule', ruleId: 'synthetic/v1' } })),
  authoring: { policyVersion: 'synthetic/v1', countsAre: 'authoring-rules', requirements: [] },
});
const scope = { accountId: 'account:fixture', learnerId: 'learner:fixture' };
const now = Date.parse('2026-09-23T00:00:00Z');
const start = (attemptId = 'attempt:fixture') => api.startAssessmentV2(
  api.createAssessmentLibraryV2({ scope }), form, { scope, attemptId, mode: 'timed', now,
    editorialAtStart: { status: 'unreviewed', policyVersion: null, decisionRevisionIds: [] },
    clockSessionId: 'clock:test', monotonicMs: 0 });
const command = (library, action, elapsed = 0, extra = {}) => api.commandAssessmentV2(library, {
  scope, attemptId: library.activeAttemptId, expectedRevisionId: api.selectAssessmentV2(library).attempt.revisionId,
  clockSessionId: 'clock:test', now: now + elapsed, monotonicMs: elapsed, action, ...extra,
});
const checks = [];
function check(name, fn) { fn(); checks.push({ name, passes: true }); }

check('same library retains exact form, all questions and safe current question', () => {
  const selected = api.selectAssessmentV2(start());
  assert.equal(selected.form.revisionId, form.revisionId);
  assert.equal(selected.questions.length, 2);
  assert.equal(selected.question.id, items[0].id);
  assert.equal(selected.question.response.answerOptionId, undefined);
  assert.equal(selected.question.rationale, undefined);
  assert.equal(selected.remainingMs, 60_000);
});
check('deadline checkpoint persists with blanks and explicit next-block activation', () => {
  let library = start();
  const original = library;
  library = command(library, { kind: 'answer', itemId: items[0].id,
    response: { kind: 'selected', optionId: 'a' } }, 60_001);
  assert.equal(api.selectAssessmentV2(library).awaitingNextBlock, true);
  assert.equal(api.selectAssessmentV2(library).question, null);
  assert.equal(api.selectAssessmentV2(original).attempt.answers[0].response.kind, 'unanswered');
  library = api.parseAssessmentLibraryV2(JSON.parse(JSON.stringify(library)), { scope });
  library = command(library, { kind: 'start-next-block' }, 80_000);
  assert.equal(api.selectAssessmentV2(library).question.id, items[1].id);
  assert.equal(api.selectAssessmentV2(library).remainingMs, 60_000);
  library = command(library, { kind: 'answer', itemId: items[1].id,
    response: { kind: 'selected', optionId: 'b' } }, 80_500);
  library = command(library, { kind: 'submit' }, 81_000);
  const result = api.selectAssessmentV2(library).score;
  assert.equal(result.correct, 0);
  assert.equal(result.incorrect, 1);
  assert.equal(result.unanswered, 1);
  assert.deepEqual(result.weaknessItemIds, [items[1].id]);
  assert.equal(result.officialScore, null);
});
check('ownership mismatch, stale revision and parallel active attempt are rejected', () => {
  const library = start();
  assert.throws(() => api.parseAssessmentLibraryV2(library, { scope: { ...scope, learnerId: 'other' } }));
  assert.throws(() => command(library, { kind: 'tick' }, 0, { expectedRevisionId: 'stale' }));
  assert.throws(() => api.startAssessmentV2(library, form, { scope, attemptId: 'attempt:parallel', mode: 'timed',
    now, clockSessionId: 'clock:test', editorialAtStart: { status: 'unreviewed', policyVersion: null, decisionRevisionIds: [] } }));
});
check('stopping produces no inferred weaknesses and retains earlier attempts', () => {
  let library = start();
  library = command(library, { kind: 'answer', itemId: items[0].id,
    response: { kind: 'selected', optionId: 'b' } }, 100);
  library = command(library, { kind: 'abandon' }, 200);
  assert.deepEqual(api.selectAssessmentV2(library).score.weaknessItemIds, []);
  library = api.startAssessmentV2(library, form, { scope, attemptId: 'attempt:second', mode: 'practice', now: now + 300,
    clockSessionId: 'clock:test', editorialAtStart: { status: 'unreviewed', policyVersion: null, decisionRevisionIds: [] } });
  assert.equal(library.forms.length, 1);
  assert.equal(library.attempts.length, 2);
  assert.equal(api.selectAssessmentV2(library, 'attempt:fixture').score.status, 'abandoned');
});
check('malformed, tampered, unsupported and accessor inputs fail without executing accessors', () => {
  const library = JSON.parse(JSON.stringify(start()));
  library.attempts[0].answers[0].response = { kind: 'selected', optionId: 'a' };
  assert.throws(() => api.parseAssessmentLibraryV2(library));
  assert.throws(() => api.parseAssessmentLibraryV2({ ...library, v: 1 }));
  let called = false;
  const getter = { ...library, get activeAttemptId() { called = true; return 'attempt:fixture'; } };
  assert.throws(() => api.parseAssessmentLibraryV2(getter));
  assert.equal(called, false);
});

const digest = (value) => createHash('sha256').update(value).digest('hex');
writeFileSync(resolve(stage, 'result.json'), `${JSON.stringify({
  format: 'kairo-assessment-v2-controller-verification', v: 1,
  passed: checks.length, failed: 0, checks,
  controllerSha256: digest(controllerBytes), coreSha256: digest(core.bytes),
  compiler: core.compiler, inputs: core.inputs,
  limits: ['synthetic fixtures', 'no browser walk', 'no external review or content approval'],
}, null, 2)}\n`);
console.log(`Assessment v2 controller: ${checks.length}/${checks.length} checks passed. Receipt: ${resolve(stage, 'result.json')}`);
