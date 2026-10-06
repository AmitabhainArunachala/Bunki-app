import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCorridorModules } from '../../../scripts/build-reading-module.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const evidence = process.env.KAIRO_EVIDENCE_DIR ? resolveCorridorEvidence()
  : resolve(homedir(), '.dharma/bunki_assessment/2026-09-23/question-practice');
mkdirSync(evidence, { recursive: true });
const stage = mkdtempSync(resolve(evidence, 'check-'));
mkdirSync(resolve(stage, 'modules'));
const source = resolve(root, 'prototypes/corridor/assessment-question-practice.mjs');
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceSha256 = sha(readFileSync(source)), verifierSha256 = sha(readFileSync(fileURLToPath(import.meta.url)));
for (const module of buildCorridorModules(root)) writeFileSync(resolve(stage, module.path), module.bytes);
writeFileSync(resolve(stage, 'assessment-question-practice.mjs'), readFileSync(source));
const core = await import(pathToFileURL(resolve(stage, 'modules/assessment-core.mjs')));
const api = await import(pathToFileURL(resolve(stage, 'assessment-question-practice.mjs')));
const rights = Object.fromEntries(Object.keys(core.unknownAssessmentRights()).map(operation =>
  [operation, { status: 'allowed', basisRef: 'synthetic-owned-fixture', policyVersion: 'fixture-v1' }]));
const provenance = { kind: 'original-human', authorRef: 'synthetic-fixture', processRef: null, sources: [] };
const editorialAtStart = { status: 'ai-reviewed-practice', policyVersion: 'fixture-policy', decisionRevisionIds: ['fixture-decision'] };
const at = '2026-09-23T00:00:00.000Z';
const clone = value => JSON.parse(JSON.stringify(value));
const ref = (value, kind) => ({ kind, id: value.id, revisionId: value.revisionId, sha256: value.sha256 });
const passage = core.createPassageVersion({ format: 'kairo-assessment-passage', v: 1, id: 'fixture-passage',
  provenance, rights, title: '合成資料', text: '図書館は月曜が休みで、火曜は開いています。',
  textSha256: sha('図書館は月曜が休みで、火曜は開いています。'), language: 'ja', locationUnit: 'utf16-code-unit' });
function makeItem(overrides = {}) {
  return core.createItemVersion({ format: 'kairo-assessment-item', v: 1, id: 'fixture-question', provenance, rights,
    skill: 'reading', task: 'short-reading', prompt: '図書館が開いているのはいつですか。', translatedInstruction: null,
    rationale: '本文に火曜は開いていると書いてある。', passages: [ref(passage, 'passage')], media: [], subjects: [],
    response: { kind: 'selected', options: [{ id: 'a', text: '月曜' }, { id: 'b', text: '火曜' }], answerOptionId: 'b' }, ...overrides });
}
function makeForm(items, media = []) {
  return core.createFormVersion({ format: 'kairo-assessment-form', v: 1, id: 'fixture-question-form', provenance, rights,
    title: 'Synthetic question review fixture', exam: { family: 'jlpt', track: 'N2' }, scope: 'short-practice', blueprintId: null,
    items, passages: items.some(item => item.passages.length) ? [passage] : [], media,
    sections: items.map((item, index) => ({ id: `section-${index}`, title: item.skill, skill: item.skill, itemIds: [item.id] })),
    timingBlocks: [{ id: 'fixture-block', sectionIds: items.map((_item, index) => `section-${index}`), durationMs: 60_000,
      clock: 'elapsed-including-interruptions', authority: { kind: 'authoring-rule', ruleId: 'fixture-v1' } }],
    authoring: { policyVersion: 'fixture-v1', countsAre: 'authoring-rules', requirements: [] } });
}
const item = makeItem(), form = makeForm([item]);
const target = api.deriveAssessmentQuestion({ form, item, editorialAtStart, completedAt: at });
const plan = target.question;
const sourceContext = { form, editorialAtStart, visible: true };
const empty = () => api.acceptAssessmentQuestionPractice(null, plan);
function response(raw = empty(), overrides = {}) {
  return api.appendAssessmentQuestionResponse(raw, { id: 'response-1', planId: plan.id,
    response: { kind: 'selected', optionId: 'b' }, revealed: false, at, latencyMs: 1234, ...overrides }, sourceContext);
}
const gradeInput = { responseId: 'response-1', grade: 'good', at, id: 'grade-1', revlogIndex: 0 };
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, pass: false, error: error.stack }); console.error(`FAIL ${name}: ${error.stack}`); }
}

await check('reviewed exact source produces a question card without lexical inference or grades', () => {
  assert.equal(target.t, 'question'); assert.match(target.id, /^assessment-question:[a-f0-9]{64}$/u);
  assert.deepEqual(plan.item.subjects, []); assert.deepEqual(plan.passages, [passage]);
  const saved = empty(); assert.equal(saved.responses.length, 0); assert.equal(saved.grades.length, 0);
  assert.equal(saved.srs, undefined); assert.equal(saved.revlog, undefined);
});
await check('unreviewed, denied-rights, and manually marked source cannot create cards', () => {
  assert.equal(api.deriveAssessmentQuestion({ form, item, editorialAtStart: { status: 'unreviewed' }, completedAt: at }), null);
  const denied = makeItem({ rights: { ...rights, retain: { status: 'denied', reason: 'fixture' } } });
  assert.equal(api.deriveAssessmentQuestion({ form: makeForm([denied]), item: denied, editorialAtStart, completedAt: at }), null);
  const manual = makeItem({ response: { kind: 'written', maxChars: 100, marking: { kind: 'manual', rubric: 'Explain.' } } });
  assert.equal(api.deriveAssessmentQuestion({ form: makeForm([manual]), item: manual, editorialAtStart, completedAt: at }), null);
});
await check('front excludes answer key and rationale; repeated exposure is explicit', () => {
  const front = api.questionReviewFace(plan); assert.equal(front.response.answerOptionId, undefined);
  assert.equal(front.rationale, undefined); assert.equal(front.priorExposure, 'reported');
  assert.equal(front.practiceKind, 'question-recall'); assert.equal(front.passages[0].text, passage.text);
  const back = api.questionReviewFace(plan, { revealed: true });
  assert.equal(back.response.answerOptionId, 'b'); assert.equal(back.rationale, item.rationale);
});
await check('repeat sittings deduplicate identity and preserve first capture', () => {
  const later = api.deriveAssessmentQuestion({ form, item, editorialAtStart, completedAt: '2026-09-24T00:00:00.000Z' });
  assert.equal(later.id, target.id); assert.notEqual(later.question.createdAt, plan.createdAt);
  assert.deepEqual(api.acceptAssessmentQuestionPractice(empty(), later.question), empty());
  const changed = makeItem({ rationale: '変更された別版の説明。' });
  assert.notEqual(api.deriveAssessmentQuestion({ form: makeForm([changed]), item: changed, editorialAtStart, completedAt: at }).id, target.id);
});
await check('question IDs distinguish same answer labels across distinct items', () => {
  const second = makeItem({ id: 'fixture-question-other', prompt: '別の質問です。' });
  const together = makeForm([item, second]);
  const derive = value => api.deriveAssessmentQuestion({ form: together, item: value, editorialAtStart, completedAt: at });
  assert.notEqual(derive(item).id, derive(second).id);
});
await check('content, refs, key and presentation tampering fail before use', () => {
  for (const mutate of [p => { p.item.prompt += '改'; }, p => { p.item.response.answerOptionId = 'a'; },
    p => { p.passages[0].text += '改'; }, p => { p.form.sha256 = '0'.repeat(64); },
    p => { p.presentationSha256 = '0'.repeat(64); }]) {
    const altered = clone(plan); mutate(altered); assert.throws(() => api.parseAssessmentQuestionPlan(altered));
  }
  const changed = makeItem({ prompt: '別版' });
  assert.throws(() => api.appendAssessmentQuestionResponse(empty(), {
    id: 'x', planId: plan.id, response: { kind: 'selected', optionId: 'b' }, revealed: false, at, latencyMs: 0,
  }, { ...sourceContext, form: makeForm([changed]) }), /source-changed/u);
});
await check('only later constrained response can create a grade; wrong and reveal force Again', () => {
  assert.throws(() => api.appendAssessmentQuestionGrade(empty(), gradeInput, sourceContext), /response-required/u);
  const correct = api.appendAssessmentQuestionGrade(response(), gradeInput, sourceContext);
  assert.equal(correct.grade, 'good'); assert.equal(correct.alreadyGraded, false);
  for (const overrides of [{ response: { kind: 'selected', optionId: 'a' } }, { revealed: true }]) {
    const saved = response(empty(), overrides);
    assert.equal(api.checkAssessmentQuestionResponse(plan, saved.responses[0]).mustRepeat, true);
    const result = api.appendAssessmentQuestionGrade(saved, { ...gradeInput, grade: 'easy' }, sourceContext);
    assert.equal(result.grade, 'again');
  }
});
await check('exact response/grade retries are idempotent and changed retries are refused', () => {
  const saved = response(); assert.deepEqual(response(saved), saved);
  assert.throws(() => response(saved, { response: { kind: 'selected', optionId: 'a' } }), /response-id-reused/u);
  const first = api.appendAssessmentQuestionGrade(saved, gradeInput, sourceContext);
  const retried = api.appendAssessmentQuestionGrade(first.root, gradeInput, sourceContext);
  assert.equal(retried.alreadyGraded, true); assert.deepEqual(retried.root, first.root);
  assert.throws(() => api.appendAssessmentQuestionGrade(first.root, { ...gradeInput, revlogIndex: 1 }, sourceContext), /already-graded/u);
});
await check('I do not know reveals without fabricating a response and can only grade Again', () => {
  const saved = response(empty(), { response: null, revealed: true });
  assert.equal(saved.responses[0].response, null);
  assert.deepEqual(api.checkAssessmentQuestionResponse(plan, saved.responses[0]), { correct: false, mustRepeat: true });
  assert.equal(api.appendAssessmentQuestionGrade(saved, { ...gradeInput, grade: 'easy' }, sourceContext).grade, 'again');
  assert.throws(() => response(empty(), { response: null, revealed: false }), /response-required/u);
});
await check('historical bytes survive source deletion while new response and grade stop', () => {
  const saved = response(), unavailable = { ...sourceContext, visible: false };
  assert.deepEqual(api.parseAssessmentQuestionPractice(saved), saved);
  assert.deepEqual(api.assertAssessmentQuestionForm(plan, form), plan);
  assert.throws(() => api.appendAssessmentQuestionGrade(saved, gradeInput, unavailable), /source-unavailable/u);
  assert.throws(() => api.appendAssessmentQuestionResponse(saved, { id: 'next', planId: plan.id,
    response: { kind: 'selected', optionId: 'b' }, revealed: false, at, latencyMs: 0 }, unavailable), /source-unavailable/u);
  assert.throws(() => api.appendAssessmentQuestionGrade(saved, gradeInput, { ...sourceContext,
    editorialAtStart: { status: 'unreviewed' } }), /unreviewed/u);
});
await check('record validation links each grade to one real scheduler row and preserves undo', () => {
  const result = api.appendAssessmentQuestionGrade(response(), gradeInput, sourceContext);
  const record = { taken: [{ t: 'question', id: plan.id, label: item.prompt }], assessmentQuestionPractice: result.root,
    revlog: [[Date.parse(at), `question:${plan.id}`, 3, 0, null, null, null, null, 1, 1, 1, Date.parse(at) + 86400000]] };
  assert(api.validateAssessmentQuestionRecord(record));
  assert.equal(api.validateAssessmentQuestionRecord({ ...record, revlog: [] }), false);
  assert.equal(api.validateAssessmentQuestionRecord({ ...record, taken: [{ t: 'question', id: 'missing', label: item.prompt }] }), false);
  assert.equal(api.validateAssessmentQuestionRecord({ ...record, revlog: [...record.revlog, record.revlog[0]] }), false);
  const undo = [Date.parse(at), `question:${plan.id}`, 0, 0];
  assert(api.validateAssessmentQuestionRecord({ ...record, taken: [], revlog: [...record.revlog, undo] }));
  assert.equal(api.validateAssessmentQuestionRecord({ ...record, revlog: [...record.revlog, undo, undo] }), false);
});
await check('ordered and exact written responses keep their actual response contracts', () => {
  const variants = [
    { spec: { kind: 'ordered', tokens: [{ id: 'a', text: '一' }, { id: 'b', text: '二' }], answerOrder: ['b', 'a'] },
      response: { kind: 'ordered', tokenIds: ['b', 'a'] }, invalid: { kind: 'ordered', tokenIds: ['b', 'b'] } },
    { spec: { kind: 'written', maxChars: 100, marking: { kind: 'exact', accepted: ['火曜'], normalization: 'none' } },
      response: { kind: 'written', text: '火曜' }, invalid: { kind: 'written', text: '' } },
  ];
  for (const variant of variants) {
    const it = makeItem({ response: variant.spec }), version = makeForm([it]);
    const target = api.deriveAssessmentQuestion({ form: version, item: it, editorialAtStart, completedAt: at });
    const context = { form: version, editorialAtStart, visible: true };
    const before = api.acceptAssessmentQuestionPractice(null, target.question);
    const input = { id: 'response-1', planId: target.id, response: variant.response, revealed: false, at, latencyMs: 50 };
    const saved = api.appendAssessmentQuestionResponse(before, input, context);
    assert.equal(api.appendAssessmentQuestionGrade(saved, gradeInput, context).grade, 'good');
    assert.throws(() => api.appendAssessmentQuestionResponse(before, { ...input, response: variant.invalid }, context), /invalid-response/u);
  }
});

const bytes = new globalThis.TextEncoder().encode('Synthetic fixture bytes: digest verification only; not decodable audio.');
const audio = core.createMediaVersion({ format: 'kairo-assessment-media', v: 1, id: 'fixture-audio', provenance, rights,
  kind: 'audio', assetId: 'fixture-audio-asset', bytesSha256: sha(bytes), mimeType: 'audio/wav', durationMs: 1000,
  transcript: 'SECRET_AUDIO_TRANSCRIPT', transcriptSha256: sha('SECRET_AUDIO_TRANSCRIPT'), speakers: ['speaker'] });
const listeningItem = makeItem({ id: 'fixture-listening', skill: 'listening', task: 'listening-response', passages: [],
  prompt: '聞いて答えてください。', media: [ref(audio, 'media')], response: { kind: 'selected',
    options: [{ id: 'a', text: 'SECRET_SPOKEN_OPTION_A' }, { id: 'b', text: 'SECRET_SPOKEN_OPTION_B' }], answerOptionId: 'b' } });
const listeningForm = makeForm([listeningItem], [audio]);
const delivery = { schema: 'kairo-assessment-bank-delivery/1', form: ref(listeningForm, 'form'),
  assets: [{ assetId: audio.assetId, path: 'audio/fixture.wav', bytesSha256: audio.bytesSha256, mimeType: audio.mimeType }],
  units: [{ id: 'fixture-unit', kind: 'question', itemIds: [listeningItem.id], media: ref(audio, 'media'),
    printedOptions: false, stimulusPlayCount: 1 }] };
const presentation = { delivery, reviewedSha256: core.createAiReviewPresentation(listeningForm, delivery).deliverySha256 };
const fullEditorial = { ...editorialAtStart, status: 'ai-reviewed-full' };
const listeningTarget = api.deriveAssessmentQuestion({ form: listeningForm, item: listeningItem,
  editorialAtStart: fullEditorial, completedAt: at, presentation });
const audioSource = { form: listeningForm, editorialAtStart: fullEditorial, visible: true, presentation };
await check('audio needs native full review and exact reviewed presentation, never transcript fallback', () => {
  assert.equal(api.deriveAssessmentQuestion({ form: listeningForm, item: listeningItem, editorialAtStart, completedAt: at, presentation }), null);
  assert.equal(api.deriveAssessmentQuestion({ form: listeningForm, item: listeningItem, editorialAtStart: fullEditorial, completedAt: at }), null);
  assert.throws(() => api.deriveAssessmentQuestion({ form: listeningForm, item: listeningItem, editorialAtStart: fullEditorial,
    completedAt: at, presentation: { ...presentation, reviewedSha256: '0'.repeat(64) } }), /presentation-not-reviewed/u);
  const front = JSON.stringify(api.questionReviewFace(listeningTarget.question));
  assert.equal(front.includes('SECRET_'), false); assert.equal(front.includes('answerOptionId'), false);
  assert(JSON.stringify(api.questionReviewFace(listeningTarget.question, { revealed: true })).includes('SECRET_AUDIO_TRANSCRIPT'));
});
await check('actual media byte digest is required; supplied hash JSON is not a capability', async () => {
  const input = { id: 'response-1', planId: listeningTarget.id, response: { kind: 'selected', optionId: 'b' },
    revealed: false, at, latencyMs: 1000, audio: [{ assetId: audio.assetId, startedPlays: 1, completedPlays: 1,
      interrupted: false, transcriptOpened: false }] };
  const before = api.acceptAssessmentQuestionPractice(null, listeningTarget.question);
  assert.throws(() => api.appendAssessmentQuestionResponse(before, input, { ...audioSource,
    mediaProof: { planId: listeningTarget.id, verifiedMedia: [{ assetId: audio.assetId, bytesSha256: audio.bytesSha256 }] } }), /verified-media-required/u);
  await assert.rejects(api.verifyAssessmentQuestionMedia(listeningTarget.question,
    [{ assetId: audio.assetId, bytes: new Uint8Array([1]), mimeType: audio.mimeType }]), /media-bytes-changed/u);
  const mediaProof = await api.verifyAssessmentQuestionMedia(listeningTarget.question, [{ assetId: audio.assetId, bytes, mimeType: audio.mimeType }]);
  const context = { ...audioSource, mediaProof };
  const saved = api.appendAssessmentQuestionResponse(before, input, context);
  assert.equal(api.appendAssessmentQuestionGrade(saved, gradeInput, context).grade, 'good');
  assert.throws(() => api.appendAssessmentQuestionResponse(before, { ...input, audio: [] }, context), /media-evidence/u);
  for (const audioOverride of [{ startedPlays: 2, completedPlays: 2 }, { transcriptOpened: true },
    { startedPlays: 2 }, { interrupted: true }, { completedPlays: 0, interrupted: true }]) {
    const assisted = api.appendAssessmentQuestionResponse(before, { ...input, audio: [{ ...input.audio[0], ...audioOverride }] }, context);
    assert.equal(api.appendAssessmentQuestionGrade(assisted, { ...gradeInput, grade: 'easy' }, context).grade, 'again');
  }
  assert.throws(() => api.appendAssessmentQuestionResponse(before, { ...input,
    audio: [{ ...input.audio[0], completedPlays: 0 }] }, context), /audio-not-heard/u);
  assert.throws(() => api.appendAssessmentQuestionResponse(before, { ...input,
    audio: [{ ...input.audio[0], startedPlays: 0 }] }, context), /audio-not-heard/u);
  const unknown = api.appendAssessmentQuestionResponse(before, { ...input, response: null, revealed: true,
    audio: [{ ...input.audio[0], startedPlays: 0, completedPlays: 0 }] }, context);
  assert.equal(unknown.responses[0].mediaEvidence.audio[0].completedPlays, 0);
  assert.equal(api.appendAssessmentQuestionGrade(unknown, gradeInput, context).grade, 'again');
});
await check('forged successful grades and unknown root fields fail historical validation', () => {
  const saved = response(empty(), { response: { kind: 'selected', optionId: 'a' } });
  const result = api.appendAssessmentQuestionGrade(saved, gradeInput, sourceContext);
  const forged = clone(result.root); forged.grades[0].grade = 'good';
  assert.throws(() => api.parseAssessmentQuestionPractice(forged), /invalid-grade/u);
  assert.throws(() => api.parseAssessmentQuestionPractice({ ...empty(), extra: true }), /invalid-fields/u);
});

assert.equal(sha(readFileSync(source)), sourceSha256, 'Question module changed during verification');
assert.equal(sha(readFileSync(fileURLToPath(import.meta.url))), verifierSha256, 'Verifier changed during verification');
const receipt = { format: 'kairo-assessment-question-practice-verification', v: 1, sourceSha256, verifierSha256,
  stage, results, passed: results.filter(result => result.pass).length, failed: results.filter(result => !result.pass).length,
  limitations: ['Synthetic content; this pure contract check does not establish actual audio decoding, audibility, review authority, or browser scheduling.'] };
writeFileSync(resolve(stage, 'receipt.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify({ receipt: resolve(stage, 'receipt.json'), passed: receipt.passed, failed: receipt.failed }));
if (receipt.failed) process.exitCode = 1;
