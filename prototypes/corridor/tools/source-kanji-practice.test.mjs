/** Adapter boundaries on an exact staged artifact. The records and responses
 * below are synthetic; these tests do not establish learner or editorial acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

assert(process.env.KAIRO_SITE_DIR, 'Supply an immutable staged KAIRO_SITE_DIR');
const site = resolve(process.env.KAIRO_SITE_DIR);
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json')));
for (const path of ['sentence-practice.mjs', 'teacher-context.mjs', 'modules/learning-core.mjs'])
  assert.equal(hash(readFileSync(resolve(site, path))), manifest.files.find(row => row.path === path)?.sha256);
const api = await import(pathToFileURL(resolve(site, 'sentence-practice.mjs')));
const { createTeacherContext } = await import(pathToFileURL(resolve(site, 'teacher-context.mjs')));
const indexRows = JSON.parse(readFileSync(resolve(site, 'data/articles/index.json'))).articles;
const article = id => {
  const row = indexRows.find(value => value.id === id); assert(row);
  return { ...row, ...JSON.parse(readFileSync(resolve(site, 'data/articles', row.file))) };
};
const station = article('bunki-graded-n5-station'), morning = article('bunki-graded-n5-morning');
const sourceIndex = 120, focusKanji = '窓';
assert.equal(station.tokens[sourceIndex].s, focusKanji);
let serial = 0;
const id = () => `a0330000-0000-4000-8000-${String(++serial).padStart(12, '0')}`;
const at = () => new Date(Date.UTC(2026, 8, 13) + ++serial * 1000).toISOString();
const clone = value => JSON.parse(JSON.stringify(value));
let start = sourceIndex, end = sourceIndex + 1;
while (start > 0 && !['。', '！', '？'].includes(station.tokens[start - 1].s)) start--;
while (end < station.tokens.length && !['。', '！', '？'].includes(station.tokens[end - 1].s)) end++;
const surfaces = station.tokens.map(token => token.s);
const context = await createTeacherContext({ sourceKind: 'bundled-passage', sourceId: station.id,
  sourceDigest: hash(JSON.stringify(surfaces)), unit: 'token-index', start, end, index: sourceIndex,
  quote: surfaces.slice(start, end).join(''), title: station.title, attribution: station.attribution,
  url: station.url || null, target: { type: 'kanji', id: focusKanji } });
const prepared = () => api.prepareBundledKanjiReading(context, station, focusKanji);
function siblings() {
  const cloze = api.createSentencePractice({ ...api.prepareBundledSentencePractice(context, surfaces),
    modes: ['cloze', 'production'], at: at(), id: id() });
  let root = api.acceptSentencePractice(null, cloze);
  const reading = api.createKanjiReadingPractice({ ...prepared(), at: at(), id: id(), current: root });
  root = api.acceptSentencePractice(root, reading);
  return { cloze, reading, record: { sentencePractice: root, teacherContexts: { entries: [context] },
    taken: [cloze, reading].map(entry => ({ t: 'sentence', id: entry.plan.id, label: context.quote, sourceContextRef: context.id })),
    revlog: [], readDone: {} } };
}
function graded(record, entry, { text, revealed = false, grade = 'good' }) {
  const result = clone(record), responseId = id();
  result.sentencePractice = api.appendSentenceResponse(result.sentencePractice, {
    entryId: entry.plan.id, mode: api.sentenceRecallMode(entry.plan), at: at(), id: responseId,
    text, revealed, latencyMs: 1700 });
  const time = at(), next = api.appendSentenceGrade(result.sentencePractice, {
    responseId, grade, at: time, id: id(), revlogIndex: result.revlog.length });
  result.sentencePractice = next.root;
  result.revlog.push([Date.parse(time), `sentence:${entry.plan.id}`, ['again', 'hard', 'good', 'easy'].indexOf(next.grade) + 1]);
  assert(api.validateSentencePracticeRecord(result));
  return result;
}

test('exact source occurrence prepares a reading sibling without replacing cloze or promotion', () => {
  const choice = prepared(); assert.equal(choice.tokenSpan.index, sourceIndex);
  assert.deepEqual(choice.readingCue.token, { s: '窓', b: '窓', r: 'まど' });
  assert.equal(choice.readingCue.rubySource, station.rubySource);
  const { cloze, reading, record } = siblings();
  assert.notEqual(reading.plan.id, cloze.plan.id);
  assert.equal(reading.plan.version, 2); assert.equal(reading.plan.contracts.length, 1);
  assert.equal(reading.plan.contracts[0].skill, 'orthography_to_reading');
  assert.deepEqual(reading.plan.confirmation, cloze.plan.confirmation);
  assert.deepEqual(record.sentencePractice.entries[0], cloze);
  assert(api.validateSentencePracticeRecord(record));
  assert.deepEqual(api.parseSentencePractice(JSON.parse(JSON.stringify(record.sentencePractice))), record.sentencePractice);
});

test('duplicate confirmation retains original capture, contract and history bytes', () => {
  const { record } = siblings(), before = clone(record.sentencePractice);
  const again = api.createKanjiReadingPractice({ ...prepared(), at: at(), id: id(), current: before });
  assert.deepEqual(api.acceptSentencePractice(before, again), before);
});

for (const field of ['r', 'b', 'rubySource']) test(`${field}-only source drift preserves cloze source but refuses new reading use`, () => {
  const { reading, record } = siblings(), changed = clone(station), before = clone(record);
  if (field === 'rubySource') changed.rubySource = 'different-synthetic-tokenizer';
  else changed.tokens[sourceIndex][field] = field === 'r' ? 'マト' : '出窓';
  // This is the original surface-only counterexample. A text hash alone is
  // insufficient for the new annotation-bearing reading contract.
  assert.deepEqual(api.prepareBundledSentencePractice(context, changed.tokens.map(token => token.s)),
    api.prepareBundledSentencePractice(context, surfaces));
  assert.throws(() => api.verifyCurrentKanjiReading(reading, changed));
  assert.deepEqual(api.parseSentencePractice(record.sentencePractice), before.sentencePractice);
  assert(api.validateSentencePracticeRecord(record));
  const replacement = api.createKanjiReadingPractice({ ...api.prepareBundledKanjiReading(context, changed, focusKanji),
    at: at(), id: id(), current: record.sentencePractice });
  assert.notEqual(replacement.plan.id, reading.plan.id);
  assert.deepEqual(record, before);
});

for (const variant of ['missing-reading', 'not-content', 'wrong-focus', 'unavailable-source'])
  test(`${variant} cannot prepare a reading choice or erase saved history`, () => {
    const { reading, record } = siblings(), changed = clone(station), before = clone(record);
    if (variant === 'missing-reading') delete changed.tokens[sourceIndex].r;
    if (variant === 'not-content') changed.tokens[sourceIndex].c = false;
    assert.throws(() => api.prepareBundledKanjiReading(context,
      variant === 'unavailable-source' ? null : changed, variant === 'wrong-focus' ? '海' : focusKanji));
    if (variant === 'unavailable-source') assert.throws(() => api.verifyCurrentKanjiReading(reading, null));
    assert.deepEqual(api.parseSentencePractice(record.sentencePractice), before.sentencePractice);
    assert.deepEqual(record, before);
  });

for (const mode of ['cloze', 'production', 'listening']) test(`a ${mode} response cannot enter the reading plan`, () => {
  const { reading, record } = siblings(), before = clone(record);
  assert.throws(() => api.appendSentenceResponse(record.sentencePractice, {
    entryId: reading.plan.id, mode, at: at(), id: id(), text: 'まど', latencyMs: 100 }));
  assert.deepEqual(record, before);
});

test('reading responses cannot enter cloze; a swapped saved mode invalidates the root', () => {
  const { reading, cloze, record } = siblings();
  assert.throws(() => api.appendSentenceResponse(record.sentencePractice, {
    entryId: cloze.plan.id, mode: 'kanji-reading', at: at(), id: id(), text: 'まど' }));
  const next = graded(record, reading, { text: 'マド', grade: 'easy' });
  assert.equal(next.sentencePractice.grades[0].observation.grade, 'easy');
  next.sentencePractice.responses[0].mode = 'cloze';
  assert.throws(() => api.parseSentencePractice(next.sentencePractice));
});

for (const input of [{ text: 'あお', grade: 'easy' }, { text: 'まど', revealed: true, grade: 'easy' }])
  test(`${input.revealed ? 'revealed' : 'wrong'} reading forces Again and preserves sibling history`, () => {
    const { reading, cloze, record } = siblings();
    const before = graded(record, cloze, { text: '窓', grade: 'good' });
    const after = graded(before, reading, input);
    assert.equal(after.sentencePractice.grades.at(-1).observation.grade, 'again');
    assert.equal(after.sentencePractice.grades.at(-1).observation.userConfirmedEasy, undefined);
    assert.deepEqual(after.sentencePractice.entries[0], before.sentencePractice.entries[0]);
    assert.deepEqual(after.sentencePractice.responses[0], before.sentencePractice.responses[0]);
    assert.deepEqual(after.sentencePractice.grades[0], before.sentencePractice.grades[0]);
    assert.deepEqual(after.revlog[0], before.revlog[0]);
    assert.equal(after.revlog.at(-1)[1], `sentence:${reading.plan.id}`);
  });

test('grade/revlog links cannot point to the sibling schedule or consume its Undo', () => {
  const { reading, cloze, record } = siblings();
  const after = graded(graded(record, cloze, { text: '窓' }), reading, { text: 'まど' });
  const swapped = clone(after); swapped.revlog[1][1] = `sentence:${cloze.plan.id}`;
  assert.equal(api.validateSentencePracticeRecord(swapped), false);
  const wrongUndo = clone(after); wrongUndo.revlog.push([Date.parse(at()), `sentence:${cloze.plan.id}`, 0, 1]);
  assert.equal(api.validateSentencePracticeRecord(wrongUndo), false);
  after.revlog.push([Date.parse(at()), `sentence:${reading.plan.id}`, 0, 1]);
  assert(api.validateSentencePracticeRecord(after));
});

test('distinct reading grade events cannot share one revlog row', () => {
  const { reading, cloze, record } = siblings();
  const before = graded(graded(record, cloze, { text: '窓', grade: 'easy' }), reading,
    { text: 'まど', grade: 'easy' });
  const withResponse = clone(before), responseId = id();
  withResponse.sentencePractice = api.appendSentenceResponse(withResponse.sentencePractice, {
    entryId: reading.plan.id, mode: 'kanji-reading', at: at(), id: responseId,
    text: 'まど', revealed: false, latencyMs: 1700 });
  const first = before.sentencePractice.grades[1];
  // Distinct response/event IDs and an otherwise valid observation must not
  // let imported history or an append count one committed review twice.
  const legitimate = api.appendSentenceGrade(withResponse.sentencePractice, {
    responseId, grade: 'easy', at: first.observation.occurredAt, id: id(), revlogIndex: 2 });
  const aliased = clone(withResponse);
  aliased.sentencePractice = legitimate.root;
  aliased.sentencePractice.grades.at(-1).revlogIndex = 1;
  assert.notEqual(aliased.sentencePractice.grades.at(-1).observation.eventId, first.observation.eventId);
  assert.throws(() => api.parseSentencePractice(aliased.sentencePractice));
  assert.equal(api.validateSentencePracticeRecord(aliased), false);
  assert.throws(() => api.recommendSentenceReadings(aliased, [station, morning], { entryId: reading.plan.id }));
  assert.throws(() => api.appendSentenceGrade(withResponse.sentencePractice, {
    responseId, grade: 'easy', at: first.observation.occurredAt, id: id(), revlogIndex: 1 }));
  assert(api.validateSentencePracticeRecord(before));
});

test('reading recommendations retain their own skill/cue and never borrow a cloze grade', () => {
  const { reading, cloze, record } = siblings();
  const recommend = (current, entry, sources = [station, morning]) => api.recommendSentenceReadings(current, sources,
    { entryId: entry.plan.id, startingLevel: 'N5' });
  const withCloze = graded(record, cloze, { text: '窓', grade: 'easy' });
  const clozeBefore = recommend(withCloze, cloze);
  assert.equal(recommend(withCloze, reading)[0].evidence, null);
  let withReading = graded(withCloze, reading, { text: 'まど', grade: 'hard' });
  const next = recommend(withReading, reading)[0];
  assert.equal(next.kind, 'revisit'); assert.equal(next.practiceKind, 'kanji-reading');
  assert.equal(next.evidence.skill, 'orthography_to_reading');
  assert.deepEqual(next.evidence.token, reading.plan.readingCue.token);
  assert.equal(next.evidence.reviewStatus, 'unreviewed');
  assert.equal(next.evidence.rubySource, reading.plan.readingCue.rubySource);
  assert.deepEqual(recommend(withReading, cloze), clozeBefore);
  withReading = graded(withReading, cloze, { text: '窓', grade: 'good' });
  assert.deepEqual(recommend(withReading, reading)[0], next);
  const changed = clone(station); changed.tokens[sourceIndex].r = 'マト';
  assert.deepEqual(recommend(withReading, reading, [changed, morning]), []);
  withReading.revlog.push([Date.parse(at()), `sentence:${reading.plan.id}`, 0, 1]);
  assert.equal(recommend(withReading, reading)[0].evidence, null);
});
