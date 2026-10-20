/** Pure course and native record-root contract checks. No browser or storage.
 * Run: node --test prototypes/corridor/tools/test-kanji-course.mjs
 * Uses the repository's TypeScript parser solely to extract actual corridor
 * validators. NODE_PATH may point to an existing checkout's dependencies.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const course = require('../kanji-course.js');
const ts = require('typescript');
const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const wordsText = read('../data/share_alike/words.json');
const kanjiText = read('../data/share_alike/kanji.json');
const words = JSON.parse(wordsText).words;
const kanji = JSON.parse(kanjiText).kanji;
const sha = value => createHash('sha256').update(value).digest('hex');
const source = read('../corridor.js');
const ast = ts.createSourceFile('corridor.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declarations = new Map();
for (const statement of ast.statements) {
  if (ts.isFunctionDeclaration(statement) && statement.name) declarations.set(statement.name.text, statement.getText(ast));
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, `const ${declaration.getText(ast)};`);
    }
  }
}
const roots = ast.statements.flatMap(statement => ts.isVariableStatement(statement)
  ? [...statement.declarationList.declarations] : []).find(declaration => declaration.name.getText(ast) === 'STORE_ROOT_VALIDATORS');
assert.ok(roots && ts.isObjectLiteralExpression(roots.initializer), 'actual native root validator object');
const rootProperties = roots.initializer.properties.filter(property =>
  ['obslog', 'lessonsDone'].includes(property.name.getText(ast)));
assert.equal(rootProperties.length, 2);
const names = ['plainRecord', 'finiteNumber', 'nonEmptyString', 'owns', 'optional',
  'safeJsonValue', 'validObservationRow', 'validLessonResult'];
const context = vm.createContext({});
vm.runInContext(`${names.map(name => {
  assert.ok(declarations.has(name), `native function ${name}`);
  return declarations.get(name);
}).join('\n')}
const selectedRoots = {${rootProperties.map(property => property.getText(ast)).join(',')}};
globalThis.native = {
  observation: validObservationRow,
  lesson: validLessonResult,
  roots: value => selectedRoots.obslog(value.obslog) && selectedRoots.lessonsDone(value.lessonsDone)
};`, context);
const native = context.native;
const allCorrect = run => {
  let next = run;
  while (!next.complete) next = course.answer(next, course.currentPrompt(next).acceptedAnswers[0]);
  return next;
};
const completeWith = (run, answers) => {
  let next = run;
  for (const action of answers) {
    if (action === 'skip') next = course.skip(next);
    else if (action === 'reveal') next = course.reveal(next);
    else if (action === 'wrong') {
      const prompt = course.currentPrompt(next);
      next = course.answer(next, prompt.kind === 'meaning'
        ? prompt.choices.find(choice => choice.id !== prompt.answerId).id : 'ちがう');
    } else next = course.answer(next, course.currentPrompt(next).acceptedAnswers[0]);
  }
  return next;
};

test('exact six-unit/24-character inventory and all primary/alternate word answers are attested', () => {
  const units = course.listUnits();
  assert.deepEqual(units.map(unit => unit.id), ['shapes', 'outlines', 'combinations', 'marks', 'sound-clues', 'word-readings']);
  assert.equal(units.flatMap(unit => unit.targets).map(target => target.kanji).join(''), '木林森本人入大休日月明田土天未末青清晴情生学先行');
  assert.equal(new Set(units.flatMap(unit => unit.targets.map(target => target.kanji))).size, 24);
  assert.equal(sha(wordsText), course.catalog().sources.words.sha256);
  assert.equal(sha(kanjiText), course.catalog().sources.kanji.sha256);
  let wordCount = 0;
  for (const [index, unit] of units.entries()) {
    assert.equal(unit.targets.length, 4);
    assert.ok(unit.prerequisites.every(id => units.slice(0, index).some(previous => previous.id === id)));
    for (const target of unit.targets) {
      assert.equal(target.meaning, kanji[target.kanji].m);
      for (const example of [target, ...target.examples]) {
        assert.ok(words[example.wordKey], example.wordKey);
        assert.equal(example.wordMeaning, words[example.wordKey].g);
        assert.deepEqual(example.readings, words[example.wordKey].r.split(';').map(value => value.trim()));
        wordCount++;
      }
      assert.deepEqual(target.writing, { optional: true, assessment: 'self-comparison' });
    }
  }
  assert.equal(wordCount, 49);
});

test('catalog withholds explanations, source transfer and delayed-memory claims', () => {
  assert.equal(course.catalog().sourceTransfer.enabled, false);
  assert.equal(course.catalog().sourceTransfer.status, 'candidate-only');
  assert.equal(course.catalog().explanations.enabled, false);
  assert.ok(Object.isFrozen(course.catalog().units[0].targets[0].readings));
  assert.throws(() => course.listUnits().push({}));
  assert.throws(() => course.getUnit('missing'), /unit-unknown/);
});

test('editorial word meanings are explicit selections while raw glosses and readings remain attested', () => {
  const selected = {
    '未来': 'future',
    '先': 'before; ahead',
    '先生': 'teacher',
    '情報': 'information',
    '学校': 'school',
  };
  const records = course.listUnits().flatMap(unit =>
    unit.targets.flatMap(target => [target, ...target.examples]));
  assert.deepEqual(Object.fromEntries(records.filter(record => Object.hasOwn(record, 'displayMeaning'))
    .map(record => [record.wordKey, record.displayMeaning])), selected);
  for (const record of records) {
    assert.equal(record.wordMeaning, words[record.wordKey].g, record.wordKey);
    assert.deepEqual(record.readings, words[record.wordKey].r.split(';').map(value => value.trim()));
    if (Object.hasOwn(selected, record.wordKey)) {
      assert.equal(record.displayMeaning, selected[record.wordKey]);
      assert.notEqual(record.displayMeaning, record.wordMeaning);
    }
  }
  for (const unit of course.listUnits()) {
    let run = course.createRun(unit.id);
    while (!run.complete) {
      const prompt = course.currentPrompt(run);
      assert.equal(prompt.wordMeaning, words[prompt.wordKey].g);
      assert.equal(prompt.displayMeaning, selected[prompt.wordKey] || prompt.wordMeaning);
      run = course.answer(run, prompt.acceptedAnswers[0]);
    }
  }
  const before = course.getUnit('word-readings').targets.find(target => target.id === '先');
  assert.equal(before.meaning, 'Before', 'character keyword is distinct from the selected word meaning');
  assert.equal(before.examples[0].displayMeaning, 'teacher', 'editorial selection also reaches the teaching example');
});

test('revision two lesson IDs do not reuse or replace revision one observations and scores', () => {
  assert.equal(course.catalog().revision, 2);
  const legacy = { obslog: [], lessonsDone: {} };
  const fresh = { obslog: [], lessonsDone: {} };
  for (const unit of course.listUnits()) {
    const run = course.createRun(unit.id);
    const oldRun = { ...clone(run), revision: 1 };
    assert.throws(() => course.currentPrompt(oldRun), /run-invalid/);
    const evidence = clone(course.toLessonEvidence(allCorrect(run), 2000));
    fresh.obslog.push(...evidence.obslog);
    Object.assign(fresh.lessonsDone, evidence.lessonsDone);
    for (const kind of ['meaning', 'reading']) {
      const id = `kanji-foundations-24:r2:${unit.id}:${kind}`;
      assert.equal(course.lessonId(unit.id, kind), id);
      const oldId = id.replace(':r2:', ':r1:');
      legacy.lessonsDone[oldId] = { score: 1, total: 4, ts: 1000 };
      legacy.obslog.push([1000, 'lesson', 'kanji:木', 1, oldId]);
    }
  }
  const before = clone(legacy);
  const merged = {
    obslog: [...legacy.obslog, ...fresh.obslog],
    lessonsDone: { ...legacy.lessonsDone, ...fresh.lessonsDone },
  };
  assert.equal(Object.keys(fresh.lessonsDone).length, 12);
  assert.equal(Object.keys(merged.lessonsDone).length, 24);
  for (const [id, score] of Object.entries(legacy.lessonsDone)) assert.deepEqual(merged.lessonsDone[id], score);
  assert.deepEqual(legacy, before);
  assert.ok(fresh.obslog.every(row => row[4].includes(':r2:')));
  assert.equal(native.roots(merged), true, 'actual native validators retain both curriculum revisions');
});

test('meaning choices use a finite explicit nonoverlapping keyword set, independent of word translation', () => {
  for (const unit of course.listUnits()) {
    let run = course.createRun(unit.id, { targets: ['meaning'] });
    while (!run.complete) {
      const prompt = course.currentPrompt(run);
      assert.equal(prompt.kind, 'meaning');
      assert.equal(prompt.scope, 'selected-character-keyword');
      assert.equal(prompt.choices.length, 4);
      assert.equal(new Set(prompt.choices.map(choice => choice.id)).size, 4);
      assert.equal(new Set(prompt.choices.map(choice => choice.label)).size, 4);
      assert.equal(prompt.choices.filter(choice => choice.id === prompt.answerId).length, 1);
      // Known semantically overlapping pairs must never be competing answers.
      const choiceIds = prompt.choices.map(choice => choice.id);
      assert.ok(!(choiceIds.includes('林') && choiceIds.includes('森')));
      assert.ok(!(choiceIds.includes('明') && choiceIds.includes('晴')));
      run = course.answer(run, prompt.answerId);
    }
    assert.equal(course.summary(run).targets.meaning.correct, 4);
  }
  const prompt = course.currentPrompt(course.createRun('word-readings', { targets: ['meaning'] }));
  assert.equal(prompt.correctAnswer, 'Life');
  assert.equal(prompt.wordMeaning, 'to live');
  assert.throws(() => course.answer(course.createRun('shapes'), 'invented choice'), /choice-invalid/);
});

test('confusable marks and sound-clue siblings are actual wrong alternatives, not accepted synonyms', () => {
  const keywords = { '未': 'Un-', '末': 'End', '青': 'Blue', '清': 'Pure', '晴': 'Clear Up', '情': 'Feelings' };
  const family = ['青', '清', '晴', '情'];
  for (const unitId of ['marks', 'sound-clues']) {
    let run = course.createRun(unitId, { targets: ['meaning'] });
    while (!run.complete) {
      const prompt = course.currentPrompt(run);
      if (Object.hasOwn(keywords, prompt.targetId)) {
        const required = family.includes(prompt.targetId) ? family : ['未', '末'];
        for (const id of required) {
          assert.ok(prompt.choices.some(choice => choice.id === id && choice.label === keywords[id]));
        }
        assert.equal(prompt.correctAnswer, keywords[prompt.targetId]);
        assert.deepEqual(prompt.acceptedAnswers, [prompt.targetId]);
        for (const choice of prompt.choices) {
          const result = course.summary(course.answer(run, choice.id)).results.at(-1);
          assert.equal(result.status, choice.id === prompt.targetId ? 'correct' : 'wrong');
        }
      }
      run = course.answer(run, prompt.answerId);
    }
  }
});

test('all lesson prompts have exact scope, target identity and independent results', () => {
  let run = course.createRun('shapes');
  assert.equal(run.cursor, 0);
  assert.equal(run.promptIds.length, 8);
  assert.equal(course.currentPrompt(run).targetId, '木');
  run = completeWith(run, ['correct', 'wrong', 'wrong', 'correct', 'correct', 'correct', 'correct', 'correct']);
  const result = course.summary(run);
  assert.equal(result.complete, true);
  assert.equal(result.targets.meaning.correct, 3);
  assert.equal(result.targets.reading.correct, 3);
  assert.deepEqual(result.missedPromptIds, ['shapes/木/reading', 'shapes/林/meaning']);
  assert.equal(course.currentPrompt(run), null);
  assert.throws(() => course.answer(run, '木'), /run-complete/);
});

test('reading accepts both attested 行く variants, folded kana and surrounding whitespace', () => {
  for (const response of ['いく', 'ゆく', '  イク  ', 'ﾕｸ']) {
    let run = course.createRun('word-readings', { targets: ['reading'] });
    for (let i = 0; i < 3; i++) run = course.answer(run, course.currentPrompt(run).acceptedAnswers[0]);
    assert.deepEqual(course.currentPrompt(run).acceptedAnswers, ['いく', 'ゆく']);
    run = course.answer(run, response);
    assert.equal(course.summary(run).targets.reading.correct, 4);
  }
  const run = course.answer(course.createRun('shapes', { targets: ['reading'] }), 'ki');
  assert.equal(course.summary(run).targets.reading.wrong, 1, 'romanized guess is not quietly transliterated');
});

test('reading checks whole word, not only the target character syllable', () => {
  const run = course.answer(course.createRun('combinations', { targets: ['reading'] }), 'にち');
  assert.equal(course.summary(run).targets.reading.wrong, 1);
  assert.equal(course.summary(run).results[0].correctAnswer, 'にちようび');
});

test('reveal and self-reported skip grant no answer observation or completion credit', () => {
  const run = completeWith(course.createRun('shapes', { mode: 'preview' }),
    ['skip', 'reveal', 'correct', 'correct', 'correct', 'correct', 'correct', 'correct']);
  const result = course.summary(run);
  assert.equal(result.mode, 'preview');
  assert.equal(result.correct, 6);
  assert.equal(result.targets.meaning.skipped, 1);
  assert.equal(result.targets.reading.revealed, 1);
  assert.deepEqual(result.skippedPromptIds, ['shapes/木/meaning']);
  assert.deepEqual(result.missedPromptIds, ['shapes/木/reading']);
  const evidence = course.toLessonEvidence(run, 1000);
  assert.equal(evidence.obslog.length, 6);
  assert.deepEqual(evidence.lessonsDone, {});
  assert.ok(evidence.obslog.every(row => !['kanji:木', 'word:木'].includes(row[2])));
  assert.deepEqual(course.retry(run).promptIds, ['shapes/木/reading']);
});

test('all-skipped session creates zero evidence and no repair; partial run cannot serialize', () => {
  let run = course.createRun('outlines');
  assert.throws(() => course.toLessonEvidence(run, 1000), /run-incomplete/);
  assert.throws(() => course.retry(run), /run-incomplete/);
  while (!run.complete) run = course.skip(run);
  assert.deepEqual(course.toLessonEvidence(run, 1000), { obslog: [], lessonsDone: {} });
  assert.equal(course.retry(run), null);
});

test('missed-only repair preserves original run, previous scores and unrelated canonical roots', () => {
  const original = completeWith(course.createRun('shapes'), ['wrong', 'reveal', 'correct', 'correct', 'correct', 'correct', 'correct', 'correct']);
  const originalBytes = JSON.stringify(original);
  const first = course.toLessonEvidence(original, 1000);
  assert.deepEqual(first.lessonsDone[course.lessonId('shapes', 'meaning')], { score: 3, total: 4, ts: 1000 });
  assert.ok(!Object.hasOwn(first.lessonsDone, course.lessonId('shapes', 'reading')));
  const repair = allCorrect(course.retry(original));
  assert.equal(repair.promptIds.length, 2);
  const delta = course.toLessonEvidence(repair, 2000);
  assert.deepEqual(delta.lessonsDone, {});
  assert.ok(delta.obslog.every(row => row[4].endsWith(':missed')));
  const previous = { v: 1, taken: [{ t: 'kanji', id: '木' }], srs: { 'kanji:木': { original: true } },
    revlog: [['retained']], lessonsDone: { ...first.lessonsDone, other: { score: 2, total: 4, ts: 500 } }, obslog: first.obslog };
  const before = clone(previous);
  const merged = { ...previous, lessonsDone: { ...previous.lessonsDone, ...delta.lessonsDone }, obslog: [...previous.obslog, ...delta.obslog] };
  assert.deepEqual(previous, before);
  assert.deepEqual(merged.lessonsDone, previous.lessonsDone);
  for (const key of ['taken', 'srs', 'revlog']) assert.strictEqual(merged[key], previous[key]);
  assert.equal(JSON.stringify(original), originalBytes);
});

test('native corridor observation and completion validators accept JSON-round-tripped evidence', () => {
  for (const unit of course.listUnits()) {
    const run = allCorrect(course.createRun(unit.id));
    const evidence = clone(course.toLessonEvidence(run, 1760000000000));
    assert.equal(native.roots(evidence), true);
    assert.equal(evidence.obslog.length, 8);
    assert.equal(Object.keys(evidence.lessonsDone).length, 2);
    assert.ok(evidence.obslog.every(native.observation));
    assert.ok(Object.values(evidence.lessonsDone).every(native.lesson));
    assert.deepEqual(evidence.obslog.map(row => row[4]), unit.targets.flatMap(() => [
      course.lessonId(unit.id, 'meaning'), course.lessonId(unit.id, 'reading'),
    ]));
  }
  const evidence = clone(course.toLessonEvidence(allCorrect(course.createRun('shapes')), 1234));
  evidence.obslog[0][3] = 4;
  assert.equal(native.roots(evidence), false, 'actual parser rejects an invented lesson grade');
  evidence.obslog[0][3] = 3;
  evidence.lessonsDone[course.lessonId('shapes', 'reading')].score = '4';
  assert.equal(native.roots(evidence), false, 'actual parser rejects nonnumeric score');
});

test('input objects, prior runs and copied JSON runs remain unchanged through transitions', () => {
  const options = { mode: 'check', targets: ['reading', 'meaning'] }, beforeOptions = clone(options);
  const run = course.createRun('shapes', options), beforeRun = JSON.stringify(run);
  const copied = clone(run), copiedBefore = clone(copied);
  const next = course.answer(copied, course.currentPrompt(copied).answerId);
  assert.deepEqual(options, beforeOptions);
  assert.deepEqual(copied, copiedBefore);
  assert.equal(JSON.stringify(run), beforeRun);
  assert.equal(run.cursor, 0);
  assert.equal(next.cursor, 1);
  assert.ok(Object.isFrozen(next.responses[0]));
});

test('malformed narrowing, cursor, answers and timestamps fail closed', () => {
  for (const targets of [[], ['meaning', 'meaning'], ['writing'], ['transfer'], 'meaning']) {
    assert.throws(() => course.createRun('shapes', { targets }), /targets-invalid/);
  }
  assert.throws(() => course.createRun('shapes', { mode: 'repair' }), /mode-invalid/);
  assert.throws(() => course.createRun('shapes', { extra: true }), /options-invalid/);
  for (const response of ['', ' ', null, 4, 'x'.repeat(201)]) {
    assert.throws(() => course.answer(course.createRun('shapes', { targets: ['reading'] }), response), /answer-invalid/);
  }
  const run = clone(course.createRun('shapes'));
  run.promptIds.pop();
  assert.throws(() => course.summary(run), /prompts-incomplete/);
  const cursor = clone(course.createRun('shapes'));
  cursor.cursor = 1;
  assert.throws(() => course.currentPrompt(cursor), /cursor-invalid/);
  const finished = allCorrect(course.createRun('shapes'));
  for (const at of [NaN, Infinity, -1, 1.5, '123']) assert.throws(() => course.toLessonEvidence(finished, at), /time-invalid/);
});

test('UMD browser export initializes without browser, storage, timers or scheduling APIs', () => {
  const sandbox = vm.createContext({});
  vm.runInContext(read('../kanji-course.js'), sandbox);
  assert.equal(sandbox.BunkiKanjiCourse.catalog().id, course.catalog().id);
  assert.equal(sandbox.BunkiKanjiCourse.listUnits().length, 6);
});
