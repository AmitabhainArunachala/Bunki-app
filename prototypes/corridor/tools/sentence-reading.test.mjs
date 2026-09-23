/** Synthetic contract cases against the actual bundled article bytes. These
 * tests establish recommendation boundaries, not learner/editorial acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
assert(process.env.KAIRO_SITE_DIR, 'Supply a staged KAIRO_SITE_DIR');
const site = resolve(process.env.KAIRO_SITE_DIR), manifest = JSON.parse(readFileSync(resolve(site, 'build-identity.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const path of ['sentence-practice.mjs', 'teacher-context.mjs', 'modules/learning-core.mjs'])
  assert.equal(hash(readFileSync(resolve(site, path))), manifest.files.find(f => f.path === path)?.sha256);
const api = await import(pathToFileURL(resolve(site, 'sentence-practice.mjs')));
const { createTeacherContext } = await import(pathToFileURL(resolve(site, 'teacher-context.mjs')));
const passages = JSON.parse(readFileSync(resolve(site, 'data/articles/index.json'))).articles.map(row =>
  ({ ...row, ...JSON.parse(readFileSync(resolve(site, 'data/articles', row.file))) }));
const morning = passages.find(p => p.id === 'bunki-graded-n5-morning');
const station = passages.find(p => p.id === 'bunki-graded-n5-station');
const clone = value => JSON.parse(JSON.stringify(value));
let serial = 0;
const uuid = () => `90000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`;
const at = () => new Date(Date.UTC(2026, 8, 13) + ++serial * 1000).toISOString();
async function add(record, passage = morning) {
  const index = passage.tokens.findIndex(t => t.s === '窓');
  let start = index, end = index + 1;
  while (start > 0 && !['。', '！', '？'].includes(passage.tokens[start - 1].s)) start--;
  while (end < passage.tokens.length && !['。', '！', '？'].includes(passage.tokens[end - 1].s)) end++;
  const surfaces = passage.tokens.map(t => t.s);
  const context = await createTeacherContext({ sourceKind: 'bundled-passage', sourceId: passage.id,
    sourceDigest: hash(JSON.stringify(surfaces)), unit: 'token-index', start, end, index,
    quote: surfaces.slice(start, end).join(''), title: passage.title, attribution: passage.attribution,
    url: passage.url || null, target: { type: 'word', id: '窓' } });
  const prepared = api.prepareBundledSentencePractice(context, surfaces);
  const entry = api.createSentencePractice({ ...prepared, modes: ['cloze', 'production'], at: at(), id: uuid(), current: record.sentencePractice });
  const result = clone(record);
  result.sentencePractice = api.acceptSentencePractice(record.sentencePractice, entry);
  if (!result.teacherContexts.entries.some(row => row.id === context.id)) result.teacherContexts.entries.push(context);
  return result;
}
const empty = () => ({ sentencePractice: null, teacherContexts: { entries: [] }, taken: [], revlog: [], readDone: {} });
function grade(record, value, entryId = record.sentencePractice.entries.at(-1).plan.id) {
  const result = clone(record), responseId = uuid();
  result.sentencePractice = api.appendSentenceResponse(result.sentencePractice, { entryId, mode: 'cloze',
    at: at(), id: responseId, text: value === 'again' ? '戸' : '窓', revealed: false, latencyMs: 1500 });
  const time = at();
  result.sentencePractice = api.appendSentenceGrade(result.sentencePractice, {
    responseId, grade: value, at: time, id: uuid(), revlogIndex: result.revlog.length }).root;
  result.revlog.push([Date.parse(time), `sentence:${entryId}`, ['again', 'hard', 'good', 'easy'].indexOf(value) + 1]);
  return result;
}
const recommend = (record, options = {}, sources = passages) => api.recommendSentenceReadings(record, sources, options);

test('chosen practice offers an exact different source without manufacturing an assessment or changing records', async () => {
  const record = await add(empty()), before = clone(record);
  const [next] = recommend(record, { startingLevel: 'N5' });
  assert.equal(next.kind, 'new-context'); assert.equal(next.context.sourceId, station.id); assert.equal(next.evidence, null);
  assert.equal(next.context.index, 120); assert.equal(next.context.sourceDigest, hash(JSON.stringify(station.tokens.map(t => t.s))));
  assert.notEqual(next.context.quote, next.fromContext.quote); assert.equal(next.word, '窓');
  assert.equal(next.preferredLevel, 'N5'); assert.equal(next.authorLevel, 'N5'); assert.deepEqual(record, before);
  assert.deepEqual(api.verifyBundledSentenceSource(next.context, station.tokens.map(t => t.s)), next.context);
});
test('only acknowledged eligible recall informs the explanation; later unchecked writing does not replace it', async () => {
  const record = grade(await add(empty()), 'easy');
  const [prior] = recommend(record);
  record.sentencePractice = api.appendSentenceResponse(record.sentencePractice, { entryId: prior.fromEntryId,
    mode: 'production', at: at(), id: uuid(), text: '私は全部できると思います。' });
  assert.deepEqual(recommend(record), [prior]); assert.equal(prior.evidence.grade, 'easy'); assert.equal(prior.evidence.modality, 'text');
  const catalog = JSON.parse(readFileSync(resolve(site, 'audio/sentence-cues.json')));
  const entry = record.sentencePractice.entries[0], surfaces = morning.tokens.map(t => t.s);
  const cue = api.selectBundledListeningCue(entry.context, surfaces, catalog);
  record.sentencePractice = api.acceptSentencePractice(record.sentencePractice, api.createSentencePractice({
    ...api.prepareBundledSentencePractice(entry.context, surfaces), modes: ['listening'], at: at(), id: uuid(), current: record.sentencePractice, listeningCue: cue }));
  record.sentencePractice = api.appendSentenceResponse(record.sentencePractice, { entryId: entry.plan.id, mode: 'listening',
    at: at(), id: uuid(), text: '聞き取れたつもりです。', listening: { audioSha256: cue.sha256, completedPlays: 1 } });
  assert.deepEqual(recommend(record), [prior]);
});
test('difficulty in a later source changes the follow-up while retaining the first source and promotion', async () => {
  let record = grade(await add(empty()), 'good'); const first = clone(record.sentencePractice.entries[0]);
  record = await add(record, station); record = grade(record, 'again');
  const [next] = recommend(record, { entryId: first.plan.id });
  assert.equal(next.kind, 'revisit'); assert.equal(next.context.sourceId, station.id); assert.equal(next.evidence.grade, 'again');
  assert.deepEqual(record.sentencePractice.entries[0], first);
  assert.deepEqual(record.sentencePractice.entries[1].plan.confirmation, first.plan.confirmation);
  assert.equal(next.fromEntryId, record.sentencePractice.entries[1].plan.id);
});
test('undo removes a recall result from recommendations; record order does not replace event order', async () => {
  let record = grade(await add(empty()), 'easy'); record = grade(record, 'hard');
  assert.equal(recommend(record)[0].kind, 'revisit');
  record.revlog.push([Date.now(), record.revlog[1][1], 0, 1]);
  assert.equal(recommend(record)[0].kind, 'new-context'); assert.equal(recommend(record)[0].evidence.grade, 'easy');
  const expected = recommend(record); record.sentencePractice.responses.reverse(); record.sentencePractice.grades.reverse();
  assert.deepEqual(recommend(record), expected);
});
test('unlinked or inconsistent review rows cannot authorize a recall-based explanation', async () => {
  const record = grade(await add(empty()), 'easy');
  for (const alter of [r => r.revlog.pop(), r => r.revlog[0][2] = 1, r => r.revlog[0][1] = 'word:窓']) {
    const broken = clone(record); alter(broken); assert.throws(() => recommend(broken), /invalid-reading-history/u);
  }
});
test('an undo must name its exact earlier sentence grade before it can change a recommendation', async () => {
  let record = grade(await add(empty()), 'easy');
  record = grade(await add(record, station), 'again');
  const index = record.revlog.length - 1, key = record.revlog[index][1];
  const valid = clone(record); valid.revlog.push([Date.now(), key, 0, index]);
  assert(api.validateSentencePracticeRecord(valid));
  assert(!recommend(valid).some(row => row.kind === 'revisit'));
  for (const undo of [
    [Date.now(), 'word:unrelated', 0, index],
    [Date.now(), record.revlog[0][1], 0, index],
    [Date.now(), key, 0, record.revlog.length],
    [Date.now(), key, 0, -1],
  ]) {
    const broken = clone(record); broken.revlog.push(undo);
    assert.equal(api.validateSentencePracticeRecord(broken), false, JSON.stringify(undo));
    assert.throws(() => recommend(broken), /invalid-reading-history/u);
  }
  const duplicate = clone(valid); duplicate.revlog.push([Date.now(), key, 0, index]);
  assert.equal(api.validateSentencePracticeRecord(duplicate), false);
  const undoOfUndo = clone(valid); undoOfUndo.revlog.push([Date.now(), key, 0, valid.revlog.length - 1]);
  assert.equal(api.validateSentencePracticeRecord(undoOfUndo), false);
  assert.equal(recommend(record)[0].kind, 'revisit', 'Invalid copies do not alter the accepted record');
});
test('source changes, homographs and repeated source bytes do not create a later context', async () => {
  const record = await add(empty());
  const changed = clone(morning); changed.tokens[0].s = '別';
  assert.deepEqual(recommend(record, {}, [changed, station]), []);
  const homograph = clone(station); homograph.tokens[120].r = 'そう';
  assert.deepEqual(recommend(record, {}, [morning, homograph]), []);
  const repeated = { ...clone(morning), id: 'copy-of-morning', title: 'Different title, same text' };
  assert.deepEqual(recommend(record, {}, [morning, repeated]), []);
  assert.throws(() => recommend(record, {}, [morning, morning]), /duplicate-reading-source/u);
});
test('explicit difficulty preferences change the choice without deriving a global ability level', async () => {
  const record = grade(await add(empty()), 'easy'), before = clone(record);
  assert.equal(recommend(record, { startingLevel: 'N5' })[0].context.sourceId, station.id);
  assert.equal(recommend(record, { startingLevel: 'N3' })[0].authorLevel, 'N3');
  assert.equal(recommend(record, { startingLevel: 'N1' })[0].authorLevel, 'N1');
  assert.deepEqual(record, before);
});
test('a completed reading leaves the new-context list; completion is not recall success', async () => {
  const record = await add(empty()); record.readDone[station.id] = Date.now();
  assert.deepEqual(recommend(record, { startingLevel: 'N5' }), []);
  const [next] = recommend(record, { startingLevel: 'N3' }); assert.equal(next.evidence, null);
  assert.notEqual(next.context.sourceId, station.id);
});
