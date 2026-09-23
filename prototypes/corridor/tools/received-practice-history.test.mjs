/** Pure presentation/label contracts. Structural view fixtures carry no native
 * admission authority; core and persistent UI tests exercise that boundary. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
assert(process.env.KAIRO_SITE_DIR, 'Supply an immutable staged site');
const site = resolve(process.env.KAIRO_SITE_DIR), manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json')));
for (const file of ['assessment-controller.mjs', 'modules/assessment-core.mjs', 'modules/record-core.mjs'])
  assert.equal(createHash('sha256').update(readFileSync(resolve(site, file))).digest('hex'), manifest.files.find(row => row.path === file)?.sha256);
const app = await import(pathToFileURL(resolve(site, 'assessment-controller.mjs')));
const { inputHashOf } = await import(pathToFileURL(resolve(site, 'modules/record-core.mjs')));
const set = JSON.parse(readFileSync(resolve(site, 'data/mock/sets/n5-01.json')));
const scope = { accountId: 'account:a', learnerId: 'learner:a' }, attemptId = 'attempt:received-unit';
const clone = value => JSON.parse(JSON.stringify(value));
let clock = Date.parse('2026-09-14T01:00:00.000Z'), count = 0;
function command(library, extra = {}) {
  clock += 1000;
  const selected = app.selectPractice(library);
  return { scope, attemptId, expectedRevisionId: selected.expectedRevisionId, commandId: `command:${++count}`,
    now: new Date(clock).toISOString(), elapsedDeltaMs: 1000, activeDeltaMs: 500, ...extra };
}
const fresh = app.startLegacyPractice(app.createLibrary({ scope }), set, { scope, attemptId, now: new Date(clock).toISOString() });
const answered = app.answerPractice(fresh, command(fresh, { choiceIndex: 1 }));
const form = answered.forms[0].form;
const finalized = app.finalizePractice(answered, command(answered, { outcome: 'abandoned', dismiss: true,
  form: { formId: form.id, versionId: form.revisionId, sha256: form.sha256 } }));
const library = finalized.library, payload = finalized.intent.payload;
const reference = { opId: '1'.repeat(64), sha256: '2'.repeat(64) };
function head(value = payload, refs = [reference]) { return { payloadSha256: inputHashOf(value), payload: value, operationRefs: refs }; }
function view(heads = [head()]) { return { attemptId, headAttempts: heads,
  projection: { target: { kind: 'exam-attempt', id: attemptId }, heads: heads.flatMap(row => row.operationRefs), versions: [],
    tombstones: [], activeRestoreGenerations: [], identityConflicts: [], requiresChoice: heads.length > 1 } }; }
const history = (raw = null, views = [view()], currentScope = scope) => app.receivedPracticeHistory(raw, views, { scope: currentScope });
const labels = (value = payload, options = { set }) => app.resolveReceivedPractice(value, options);

test('portable terminal extraction equals actual named finalization without changing the complete attempt', () => {
  const before = JSON.stringify(library);
  assert.deepEqual(clone(app.localPracticeReference(library, attemptId)), clone(payload));
  assert.equal(app.localPracticeReference(fresh, attemptId), null);
  assert.equal(JSON.stringify(library), before);
  assert.equal(finalized.intent.dependencies.length, 0);
});
test('received-only rows preserve exact payload, provenance and frozen nested responses', () => {
  const result = history(); assert.equal(result.entries.length, 1); assert.equal(result.entries[0].kind, 'received');
  assert.equal(result.entries[0].payloadSha256, inputHashOf(payload));
  assert.equal(result.entries[0].payload.answers[0].response.optionId, 'option:1');
  assert(Object.isFrozen(result.entries[0].payload.answers[0].response));
  assert.equal(result.entries[0].operationRefs[0].opId, reference.opId);
});
test('exact local terminal data is one richer sitting even with independent equal references', () => {
  const before = JSON.stringify(library), result = history(library, [view([head(payload, [reference, { ...reference, opId: '3'.repeat(64) }])])]);
  assert.equal(result.entries.length, 1); assert.equal(result.entries[0].kind, 'local');
  assert.equal(result.entries[0].localOnly, false); assert.deepEqual([...result.entries[0].receivedMatches], [inputHashOf(payload)]);
  assert.equal(JSON.stringify(library), before);
});
for (const difference of ['answer', 'duration', 'outcome', 'form']) test(`distinct ${difference} remains a received alternative without replacing local data`, () => {
  const other = clone(payload);
  if (difference === 'answer') other.answers[0].response.optionId = 'option:0';
  if (difference === 'duration') other.elapsedMs += 1000;
  if (difference === 'outcome') other.outcome = 'submitted';
  if (difference === 'form') other.form.sha256 = 'a'.repeat(64);
  const before = JSON.stringify(library), result = history(library, [view([head(), head(other)])]);
  assert.equal(result.entries.length, 2); assert(result.entries.every(row => row.conflict));
  assert.equal(result.entries[1].payloadSha256, inputHashOf(other)); assert.equal(JSON.stringify(library), before);
});
test('remote hidden and restore-only states retain the local complete attempt', () => {
  const hidden = view([]); hidden.projection.tombstones = [reference];
  const restored = clone(hidden); restored.projection.activeRestoreGenerations = [reference];
  for (const value of [hidden, restored]) {
    const result = history(library, [value]); assert.equal(result.entries.length, 1); assert.equal(result.entries[0].kind, 'local');
    assert.equal(result.entries[0].localOnly, true); assert.deepEqual([...result.hiddenIds], [attemptId]);
    assert.equal(history(null, [value]).entries.length, 0);
  }
});
test('active local attempt and foreign library are never reinterpreted as matching terminal authority', () => {
  const before = JSON.stringify(fresh), result = history(fresh);
  assert.equal(result.entries.length, 1); assert(result.entries[0].conflict); assert.equal(JSON.stringify(fresh), before);
  assert.equal(history(library, [view()], { accountId: 'account:other', learnerId: 'learner:other' }).entries.length, 2);
});
test('an active restored generation with equal terminal facts does not duplicate a richer local sitting', () => {
  const restored = { ...clone(payload), generation: reference };
  assert.equal(history(library, [view([head(restored)])]).entries.length, 1);
});
test('retained exact form and matching bundled adaptation both provide exact selected option labels', () => {
  const before = JSON.stringify(library);
  for (const options of [{ library, scope }, { set }]) {
    const result = labels(payload, options); assert.equal(result.status, 'available');
    assert.equal(result.answers[0].prompt, form.items[0].prompt);
    assert.equal(result.answers[0].selectedText, form.items[0].response.options[1].text);
    assert.equal(result.answers[1].response.kind, 'no-response'); assert.equal(result.answers[1].status, 'available');
  }
  assert.equal(JSON.stringify(library), before);
});
test('canonical key-order equivalence is accepted while changed unknown metadata is another version', () => {
  const reordered = Object.fromEntries(Object.entries(clone(set)).reverse()); assert.equal(labels(payload, { set: reordered }).status, 'available');
  assert.equal(labels(payload, { set: { ...clone(set), changedMetadata: 'different' } }).status, 'missing-version');
});
for (const field of ['formId', 'versionId', 'sha256']) test(`wrong form ${field} cannot borrow current question text`, () => {
  const other = clone(payload); other.form[field] = field === 'sha256' ? 'f'.repeat(64) : 'unavailable:version';
  const result = labels(other, { library, scope, set }); assert.equal(result.status, 'missing-version');
  assert(result.answers.every(answer => answer.prompt === null));
});
test('missing form and foreign retained scope preserve only portable responses', () => {
  for (const options of [{}, { library, scope: { accountId: 'foreign', learnerId: 'foreign' } }]) {
    const result = labels(payload, options); assert.equal(result.status, 'missing-version');
    assert.equal(result.answers[0].response.optionId, 'option:1'); assert.equal(result.answers[0].selectedText, null);
  }
});
test('item version and option membership must match before revealing labels', () => {
  const wrongItem = clone(payload); wrongItem.answers[0].itemVersionId = 'unknown:item';
  const wrongOption = clone(payload); wrongOption.answers[0].response.optionId = 'option:unknown';
  const a = labels(wrongItem), b = labels(wrongOption);
  assert.equal(a.answers[0].status, 'invalid-reference'); assert.equal(b.answers[0].status, 'unsupported-response');
  assert.equal(a.answers[0].prompt, null); assert.equal(b.answers[0].selectedText, null);
});
test('text is retained verbatim when a selected-choice form cannot map it; omission does not mean unanswered', () => {
  const written = clone(payload); written.answers = [{ ...written.answers[0], response: { kind: 'text', text: '猫😀é\n窓を開ける。\n' } }];
  const result = labels(written); assert.equal(result.answers.length, 1); assert.equal(result.answers[0].status, 'unsupported-response');
  assert.equal(result.answers[0].response.text, written.answers[0].response.text);
  assert.equal(labels({ ...clone(payload), answers: [] }).answers.length, 0);
});
test('catalog selection requires one literal local safe ID and never uses remote paths', () => {
  assert.equal(app.receivedPracticeSetId(payload, [{ setId: 'n5-01', file: 'ignored-remote-url' }]), 'n5-01');
  assert.equal(app.receivedPracticeSetId(payload, [{ setId: 'n5-01' }, { setId: 'n5-01' }]), null);
  for (const id of ['../n5-01', 'https://elsewhere.invalid/set', 'n5-01?x=1']) {
    const other = { ...clone(payload), form: { ...payload.form, formId: `legacy-form:${id}` } };
    assert.equal(app.receivedPracticeSetId(other, [{ setId: id }]), null);
  }
  assert.equal(labels(payload, { set: { ...clone(set), setId: 'n5-02' } }).status, 'missing-version');
});
test('extra authority fields, wrong payload digest and accessors fail closed', () => {
  assert.throws(() => labels({ ...clone(payload), score: 100 }));
  const invalid = view(); invalid.headAttempts[0].payloadSha256 = '0'.repeat(64); assert.throws(() => history(null, [invalid]));
  let invoked = false; const getter = clone(payload); Object.defineProperty(getter, 'answers', { enumerable: true, get() { invoked = true; return []; } });
  assert.throws(() => labels(getter)); assert.equal(invoked, false);
});
test('render model contains no answer key, score, full attempt or editorial authority', () => {
  const forbidden = new Set(['answerOptionId', 'answerOrder', 'rationale', 'score', 'admission', 'editorialAtStart', 'clockStatus', 'facts']);
  function inspect(value) { if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) { assert(!forbidden.has(key), key); inspect(child); } }
  inspect(labels()); inspect(history());
});
