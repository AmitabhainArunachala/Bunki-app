/** G6a judge: every recall or grade is a typed task-contract event matching W4's canonical engine; enrolment is not a grade;
 * evidence stays modality-specific; nothing activates (campaign/contracts/G6a.json; SPEC S1-R11, S1-R12, S1-R19, S1-R20).
 * Pinned by the contract; the worker writes task-contract.mjs, build-engine-shape.mjs and the generated w4-engine-shape.json
 * in this directory and may not edit this file. The canonical engine is read here directly — the vendored
 * shared-study-engine (client/schema/event.mjs, client/replay.mjs, client/engine.mjs, engine-manifest.json), data/fsrs-pin.json
 * and srs-core.mjs — with the TypeScript parser, so the shape file is checked against the engine, never against itself.
 * Authored by the Bunki lead 2026-11-06; TESTS_SOUND by a second family before pinning. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { entryId, readingId, senseId, taskId } from '../identity/identity.mjs';
import * as srs from '../../srs-core.mjs';
import { validateEvent } from '../../vendor/shared-study-engine/client/schema/event.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..', '..');
const VENDOR = join(CORRIDOR, 'vendor', 'shared-study-engine');
const MODULE = join(HERE, 'task-contract.mjs'), SHAPE = join(HERE, 'w4-engine-shape.json'), GENERATOR = join(HERE, 'build-engine-shape.mjs');
const ENGINE = { event: join(VENDOR, 'client', 'schema', 'event.mjs'), replay: join(VENDOR, 'client', 'replay.mjs'), engine: join(VENDOR, 'client', 'engine.mjs'),
  manifest: join(VENDOR, 'engine-manifest.json'), pin: join(CORRIDOR, 'data', 'fsrs-pin.json'), srs: join(CORRIDOR, 'srs-core.mjs'), vendoredSrs: join(VENDOR, 'client', 'vendor', 'srs-core.mjs') };
/** W4's stated pins (campaign/W4-HANDOFF.md rule 2; contract [5]) */
const W4 = { sourceCommit: '2602ec65f79154616abb2f3666f3928929a93413', parameterSetId: 'bunki-fsrs6-r090-defaults-v1', reducerPin: '642ca6b' };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const ALLOWED_IMPORTS = new Set(['./w4-engine-shape.json', '../identity/identity.mjs']);
const BANNED = ['indexedDB', 'localStorage', 'sessionStorage', 'fetch', 'XMLHttpRequest', 'setTimeout', 'setInterval', 'queueMicrotask', 'Date', 'performance', 'window', 'self', 'document', 'navigator', 'globalThis', 'process', 'require', 'createScheduler', 'replay', 'scheduler', 'decideReview'];
/** the whole export surface of task-contract.mjs: nothing else may be exported (a merged level under any other name is a new export) */
const EXPORTS = ['ASSISTANCE', 'ENGINE_CHANGE_NEEDED', 'ENGINE_DATA_KEYS', 'ENGINE_SHAPE', 'ENGINE_TYPE_BY_KIND', 'EVIDENCE_MODALITIES', 'SOURCE_ACTIONS', 'TASK_EVENT_KINDS', 'TaskContractError',
  'checkEngineMatch', 'engineEnvelopeFor', 'engineTypesUsed', 'evidenceRows', 'isAnswer', 'parseTaskEvent', 'parseTaskId', 'ratingFor'];
const ROW_KEYS = ['attempts', 'entry', 'lastAt', 'modality', 'surfaces'];
/** a wire event around an envelope, so the engine's own validateEvent can judge the data (identity fields are the bridge's) */
const wire = (envelope) => ({ v: 4, id: 'judge:1', learner: 'learner-1', install: 'judge', dseq: 1, base: 0, ts: 1762300800000, epoch: 0, policy: 'nsrs-policy-v1', type: envelope.type, data: envelope.data });

// ---- the engine, read independently of the worker's generator ------------------------------------------------------
const parse = (file) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function stringArrays(sf) {
  const out = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isArrayLiteralExpression(node.initializer) && node.initializer.elements.length
      && node.initializer.elements.every((e) => ts.isStringLiteral(e))) out.set(node.name.text, node.initializer.elements.map((e) => e.text));
    ts.forEachChild(node, visit);
  };
  visit(sf); return out;
}
function objectOfStringArrays(sf, name, arrays) {
  let found = null;
  const visit = (node) => { if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer && ts.isObjectLiteralExpression(node.initializer)) found = node.initializer; ts.forEachChild(node, visit); };
  visit(sf); assert.ok(found, `${name} is declared in the engine`);
  const out = {};
  for (const prop of found.properties) {
    assert.ok(ts.isPropertyAssignment(prop)); const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null; assert.ok(key !== null);
    if (ts.isArrayLiteralExpression(prop.initializer)) out[key] = prop.initializer.elements.map((e) => { assert.ok(ts.isStringLiteral(e)); return e.text; });
    else { assert.ok(ts.isIdentifier(prop.initializer) && arrays.has(prop.initializer.text), `${name}.${key} resolves`); out[key] = arrays.get(prop.initializer.text); }
  }
  return out;
}
function fieldsCalls(sf) {
  const out = {};
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'fields' && node.arguments.length === 2 && ts.isArrayLiteralExpression(node.arguments[1]) && node.arguments[1].elements.every((e) => ts.isStringLiteral(e))) {
      const receiver = node.arguments[0].getText(sf); out[receiver] = [...new Set([...(out[receiver] || []), ...node.arguments[1].elements.map((e) => e.text)])];
    }
    ts.forEachChild(node, visit);
  };
  visit(sf); return out;
}
function engineLiteral(sf, key) {
  let value = null;
  const visit = (node) => { if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === key && ts.isStringLiteral(node.initializer)) value = node.initializer.text; ts.forEachChild(node, visit); };
  visit(sf); return value;
}
function readEngine() {
  const event = parse(ENGINE.event), replay = parse(ENGINE.replay), engine = parse(ENGINE.engine);
  const arrays = stringArrays(event), calls = fieldsCalls(replay);
  return { deviceTypes: arrays.get('DEVICE_TYPES'), serverTypes: arrays.get('SERVER_TYPES'), eventFields: arrays.get('fields'), fieldsByType: objectOfStringArrays(event, 'fieldsByType', arrays),
    scheduledContracts: arrays.get('SCHEDULED_CONTRACTS'), replay: { config: calls.config, registry: calls.registry, task: calls.row, player: calls['task.player'] },
    manifest: JSON.parse(readFileSync(ENGINE.manifest, 'utf8')), pin: JSON.parse(readFileSync(ENGINE.pin, 'utf8')), engineParameterSetId: engineLiteral(engine, 'parameterSetId'), pinPayloadHash: engineLiteral(engine, 'pinPayloadHash') };
}
const validAnswerText = (file) => { const m = readFileSync(file, 'utf8').match(/^function validAnswer\(answer\) \{[\s\S]*?^\}/mu); assert.ok(m, `${file}: validAnswer`); return m[0]; };
/** every pin in a shape file that is not the engine's, by path — [] when all hold */
function pinProblems(shape, e) {
  const problems = [];
  const expect = (path, actual, wanted) => { if (JSON.stringify(actual) !== JSON.stringify(wanted)) problems.push(`${path}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(wanted)}`); };
  expect('engine.sourceCommit', shape.engine?.sourceCommit, e.manifest.source.commit); expect('engine.sourceCommit (W4)', shape.engine?.sourceCommit, W4.sourceCommit);
  expect('engine.reducerPin (W4)', shape.engine?.reducerPin, W4.reducerPin); expect('engine.reducerSha256', shape.engine?.reducerSha256, e.manifest.reducerSha256);
  if (!e.manifest.reducerSha256.startsWith(String(shape.engine?.reducerPin))) problems.push('engine.reducerPin: not a prefix of engine-manifest reducerSha256');
  expect('scheduler.parameterSetId', shape.scheduler?.parameterSetId, e.pin.parameterSetId); expect('scheduler.parameterSetId (W4)', shape.scheduler?.parameterSetId, W4.parameterSetId);
  expect('scheduler.engineParameterSetId', shape.scheduler?.engineParameterSetId, e.engineParameterSetId); expect('scheduler.pinPayloadHash', shape.scheduler?.pinPayloadHash, e.pinPayloadHash);
  expect('deviceTypes', shape.deviceTypes, e.deviceTypes); expect('serverTypes', shape.serverTypes, e.serverTypes); expect('eventFields', shape.eventFields, e.eventFields);
  expect('fieldsByType', shape.fieldsByType, e.fieldsByType); expect('scheduledContracts', shape.scheduledContracts, e.scheduledContracts); expect('replay', shape.replay, e.replay);
  expect('answerUnion.sha256', shape.answerUnion?.sha256, sha256(validAnswerText(ENGINE.srs)));
  for (const [name, file] of Object.entries({ 'client/schema/event.mjs': ENGINE.event, 'client/replay.mjs': ENGINE.replay, 'client/engine.mjs': ENGINE.engine, 'engine-manifest.json': ENGINE.manifest, 'data/fsrs-pin.json': ENGINE.pin, 'srs-core.mjs': ENGINE.srs }))
    expect(`sources.${name}`, shape.sources?.[name], sha256(readFileSync(file)));
  return problems;
}

// ---- fixtures: real G9 ids -----------------------------------------------------------------------------------------
const entry = entryId({ seq: '1358280', spelling: '食べる', reading: 'たべる' }), reading = readingId({ kanji: '食べる', reading: 'たべる' });
const task = taskId({ entry, reading, sense: senseId({ entry, index: 1 }), modality: 'recognition' });
const entry2 = entryId({ seq: '1445160', spelling: '度', reading: 'ど' }), task2 = taskId({ entry: entry2, reading: readingId({ kanji: '度', reading: 'ど' }), sense: senseId({ entry: entry2, index: 1 }), modality: 'reading' });
const at = 1762300800000;
// the evidence modality (S1-R19's five) is declared beside the G9 task id, whose own modality set differs; the contract pins no derivation between them
const graded = (surface, modality = 'reading-recognition', answer = { rating: 3 }, assistance = 'none', t = task) => ({ kind: 'graded', task: t, modality, answer, assistance, source: { surface, action: 'answer', at } });
const enrolment = { kind: 'enrolment', task, source: { surface: 'Rajomon', action: 'save', at }, card: { word: '食べる', reading: 'たべる', meaning: 'to eat', example: 'ご飯を食べる。' } };
const enrolmentAsGrade = { kind: 'graded', task, modality: 'reading-recognition', answer: { rating: 3 }, assistance: 'none', source: { surface: 'Rajomon', action: 'save', at } };
const ANSWERS = [{ rating: 1 }, { rating: 2 }, { rating: 3 }, { rating: 4 }, { selfCheck: 'knew' }, { selfCheck: 'missed' }, { claim: true },
  { rating: 0 }, { rating: 5 }, { rating: '3' }, { rating: 3.5 }, { selfCheck: 'maybe' }, { selfCheck: true }, { claim: false }, { claim: 1 }, { rating: 3, claim: true }, { rating: 3, selfCheck: 'knew' }, {}, 'knew', 3, true, [{ rating: 3 }], { score: 0.8 }];

// ---- store and network spies, armed before the module is imported ---------------------------------------------------
const calls = { localStorage: 0, indexedDB: 0, fetch: 0 };
globalThis.localStorage = { getItem() { calls.localStorage += 1; return null; }, setItem() { calls.localStorage += 1; }, removeItem() { calls.localStorage += 1; }, clear() { calls.localStorage += 1; } };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.indexedDB = { open() { calls.indexedDB += 1; throw new Error('no store'); }, deleteDatabase() { calls.indexedDB += 1; } };
globalThis.fetch = () => { calls.fetch += 1; return Promise.reject(new Error('no network')); };

test('learner-state contract · G6a', async (t) => {
  let m, shape;
  const e = readEngine();
  await t.test('the contract module, its generator and the generated shape exist; the module exports the contract', async () => {
    for (const f of [MODULE, GENERATOR, SHAPE]) assert.ok(existsSync(f), `${f} exists`);
    shape = JSON.parse(readFileSync(SHAPE, 'utf8'));
    m = await import(pathToFileURL(MODULE));
    for (const name of ['parseTaskEvent', 'parseTaskId', 'isAnswer', 'ratingFor', 'engineEnvelopeFor', 'evidenceRows', 'engineTypesUsed', 'checkEngineMatch']) assert.equal(typeof m[name], 'function', `exports ${name}`);
    assert.deepEqual(Object.keys(m).sort(), EXPORTS, 'the export surface is exactly the contract: no other function or value');
    assert.deepEqual([...m.TASK_EVENT_KINDS], ['enrolment', 'graded'], 'two kinds, no third'); assert.deepEqual(Object.keys(m.ENGINE_TYPE_BY_KIND).sort(), ['enrolment', 'graded']);
    assert.deepEqual([...m.EVIDENCE_MODALITIES], ['reading-recognition', 'listening', 'speaking', 'writing', 'grammar'], 'the five modalities of S1-R19');
  });

  await t.test('[0] an enrolment written as a review grade is refused by name; as an enrolment record it carries no rating, mastery or dictionary change (S1-R11)', () => {
    assert.throws(() => m.parseTaskEvent(enrolmentAsGrade), (err) => err.name === 'TaskContractError' && /enrolment-is-not-a-grade/u.test(err.message) && /S1-R11/u.test(err.message));
    const rec = m.parseTaskEvent(enrolment);
    assert.equal(rec.kind, 'enrolment'); assert.deepEqual(Object.keys(rec).sort(), ['card', 'kind', 'source', 'task']); assert.ok(Object.isFrozen(rec) && Object.isFrozen(rec.card));
    const text = JSON.stringify(rec).toLowerCase();
    for (const word of ['rating', 'mastery', 'level', 'score', 'streak', 'dictionary', 'sense"']) assert.ok(!text.includes(word), `no ${word} in an enrolment record`);
    assert.equal(rec.task, task); assert.deepEqual(rec.card, enrolment.card);
    for (const extra of [{ rating: 3 }, { answer: { rating: 3 } }, { mastery: 0.5 }, { level: 2 }, { dictionary: { sense: 2 } }])
      assert.throws(() => m.parseTaskEvent({ ...enrolment, ...extra }), /enrolment-carries-grade/u, `an enrolment with ${Object.keys(extra)} is refused`);
    assert.throws(() => m.parseTaskEvent({ ...enrolment, source: { ...enrolment.source, action: 'answer' } }), /invalid-source/u, 'an enrolment comes from the learner\'s save');
    // the control the contract names (a permissive parser accepting any object) is the first assertion above: it fails against one, as the lead's mutation run showed
  });

  await t.test('[1] a recall from every surface is accepted only as the typed event {task, modality, answer, assistance, source}; a private-ledger shape is refused (S1-R12)', () => {
    for (const surface of ['Rajomon', 'Speak', 'M2', 'M4', 'a-surface-named-tomorrow']) {
      const ev = m.parseTaskEvent(graded(surface, 'listening', { selfCheck: 'knew' }, 'hint'));
      assert.deepEqual(Object.keys(ev).sort(), ['answer', 'assistance', 'kind', 'modality', 'source', 'task']);
      assert.equal(ev.kind, 'graded'); assert.equal(ev.task, task); assert.equal(ev.modality, 'listening'); assert.deepEqual(ev.answer, { selfCheck: 'knew' }); assert.equal(ev.assistance, 'hint');
      assert.deepEqual(ev.source, { surface, action: 'answer', at }); assert.ok(Object.isFrozen(ev));
    }
    for (const [ledger, reason] of [
      [{ surface: 'Speak', word: '食べる', score: 0.8, streak: 3 }, /private-ledger-shape/u],
      [{ kind: 'graded', task, modality: 'listening', rating: 3, assistance: 'none', source: { surface: 'Speak', action: 'answer', at } }, /private-ledger-shape/u],
      [{ kind: 'graded', task, modality: 'listening', answer: { rating: 3 }, assistance: 'none', source: { surface: 'Speak', action: 'answer', at }, mastery: 0.9 }, /private-ledger-shape/u],
      [{ kind: 'review', task, modality: 'listening', answer: { rating: 3 }, assistance: 'none', source: { surface: 'Speak', action: 'answer', at } }, /private-ledger-shape/u],
      [{ kind: 'external-review', task, modality: 'listening', answer: { rating: 3 }, assistance: 'none', source: { surface: 'Speak', action: 'answer', at } }, /private-ledger-shape/u],
      [{ kind: 'capture', task, source: { surface: 'Speak', action: 'save', at }, card: enrolment.card }, /private-ledger-shape/u],
      [{ kind: 'recollection', task, modality: 'listening', answer: { rating: 3 }, assistance: 'none', source: { surface: 'Speak', action: 'answer', at } }, /private-ledger-shape/u],
      [graded('Speak', 'listening', { rating: 5 }), /invalid-answer/u], [graded('Speak', 'listening', { rating: 3, selfCheck: 'knew' }), /invalid-answer/u],
      [graded('Speak', 'vocabulary'), /invalid-modality/u], [graded('Speak', 'listening', { rating: 3 }, 'cheated'), /invalid-assistance/u],
      [graded('', 'listening'), /invalid-source/u], [graded('Speak', 'listening', { rating: 3 }, 'none', 'task:not-a-g9-id'), /invalid-task-id/u],
      [{ ...graded('Speak'), source: { surface: 'Speak', action: 'answer', at, extra: 1 } }, /invalid-source/u], ['a string', /not-an-object/u], [null, /not-an-object/u],
    ]) assert.throws(() => m.parseTaskEvent(ledger), reason, `${JSON.stringify(ledger).slice(0, 80)} refused by name`);
    // the task id is G9's: it is read back into its parts and nothing bar-shaped passes
    assert.deepEqual(m.parseTaskId(task), { entry, reading, sense: senseId({ entry, index: 1 }), modality: 'recognition' }, 'a task id reads back into its G9 parts');
    // G9 normalises readings to hiragana, so an id with a katakana reading is bar-shaped yet not G9's: only rebuilding through taskId refuses it
    for (const bad of [task.replace('#s1', '#s0'), `${task}|extra`, task.replace('|recognition', '|grammar'), task.replace(`|${entry}#s1`, `|${entry2}#s1`), 'task:a|b|c|d', `task:${entry}|${reading}|${entry}#s1|`, task.replace('task:', 'TASK:'),
      task.replace(`|${reading}|`, '|reading:食べる|タベル|'), task.replaceAll(entry, 'entry:1358280:食べる|タベル')])
      assert.throws(() => m.parseTaskId(bad), /invalid-task-id/u, `${bad.slice(0, 60)} is refused`);
  });

  await t.test('[2] reading recognition, listening, speaking, writing and grammar events for one entry are five separate rows; nothing returns a merged level (S1-R19)', () => {
    const events = m.EVIDENCE_MODALITIES.map((modality, i) => graded(['Rajomon', 'Speak', 'M2', 'M4', 'Rajomon'][i], modality, i % 2 ? { selfCheck: 'missed' } : { rating: 4 }));
    const rows = m.evidenceRows([...events, enrolment, graded('M2', 'listening', { rating: 2 })]);
    assert.equal(rows.length, 5, 'five rows for one entry'); assert.deepEqual(rows.map((r) => r.modality), [...m.EVIDENCE_MODALITIES]);
    assert.ok(rows.every((r) => r.entry === entry)); assert.equal(rows.find((r) => r.modality === 'listening').attempts, 2, 'two listening attempts stay in the listening row');
    for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ROW_KEYS, 'a row is exactly {entry, modality, attempts, lastAt, surfaces}: no level, score or average under any name');
    assert.equal(m.evidenceRows([...events, graded('M4', 'writing', { rating: 3 }, 'none', task2)]).length, 6, 'a second entry is its own row');
    assert.equal(m.evidenceRows([enrolment]).length, 0, 'an enrolment is not evidence of recall');
    assert.deepEqual(Object.keys(m).sort(), EXPORTS, 'no export beyond the contract (a merged level would need one)');
    assert.ok(Object.isFrozen(rows));
  });

  await t.test('[3] nothing activates: no store written, no scheduler called, no clock or timer identifier — on import or from any export', () => {
    const sf = parse(MODULE);
    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt)) { const spec = stmt.moduleSpecifier.text; assert.ok(ALLOWED_IMPORTS.has(spec), `import ${spec} is allowed (only the shape file and the G9 identity contract)`); continue; }
      if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) assert.ok(ALLOWED_IMPORTS.has(stmt.moduleSpecifier.text), `re-export from ${stmt.moduleSpecifier.text} is allowed`);
      assert.ok(ts.isExportDeclaration(stmt) || ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || (ts.isVariableStatement(stmt) && (stmt.declarationList.flags & ts.NodeFlags.Const)),
        `top-level statement is a declaration, not an action: ${stmt.getText(sf).slice(0, 60)}`);
    }
    const seen = new Set();
    // a bare identifier reaches a global or a scheduler; a property name (shape.scheduler, data.fetch) does not
    const bare = (node) => !((ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) || (ts.isPropertyAssignment(node.parent) && node.parent.name === node));
    const visit = (node) => {
      if (ts.isIdentifier(node) && BANNED.includes(node.text) && bare(node)) seen.add(node.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) seen.add('import()');
      ts.forEachChild(node, visit);
    };
    visit(sf); assert.deepEqual([...seen], [], 'no store, network, timer, clock or scheduler identifier in the module');
    // exercise every export with fixtures; the spies stay at zero
    m.parseTaskEvent(graded('Speak')); m.parseTaskEvent(enrolment); m.parseTaskId(task); m.isAnswer({ rating: 3 }); m.ratingFor({ selfCheck: 'knew' }, 'hint');
    m.engineEnvelopeFor(graded('Rajomon')); m.engineEnvelopeFor(enrolment); m.evidenceRows([graded('M2'), enrolment]); m.engineTypesUsed(); m.checkEngineMatch();
    assert.deepEqual(calls, { localStorage: 0, indexedDB: 0, fetch: 0 }, 'no store or network call');
  });

  await t.test('[4] canonical engine match: the answer union is srs-core\'s three forms; graded → review, enrolment → baseline or manual-card, never review; no type outside the engine\'s 15', () => {
    const item = { kind: 'word', term: '食べる', reading: 'たべる' };
    for (const answer of ANSWERS) assert.equal(m.isAnswer(answer), srs.validAttempt({ item, tests: 'meaning', answer }), `isAnswer(${JSON.stringify(answer)}) agrees with srs-core validAttempt`);
    assert.equal(validAnswerText(ENGINE.srs), validAnswerText(ENGINE.vendoredSrs), 'validAnswer is the same text in the corridor and the vendored engine');
    assert.deepEqual(shape.answerUnion.forms, [{ key: 'rating', values: [1, 2, 3, 4] }, { key: 'selfCheck', values: ['knew', 'missed'] }, { key: 'claim', values: [true] }]);
    // the grade rule mirrors decideReview (srs-core.mjs): knew 3, missed 1, rating as given, a claim never grades, answer-showing help 1, other help ≤ 2
    const rule = readFileSync(ENGINE.srs, 'utf8');
    for (const re of [/rating = answer\.selfCheck === 'knew' \? 3 : 1/u, /return refused\('claim-without-check'\)/u, /rating = Math\.min\(rating, 2\)/u, /rating = 1;/u]) assert.match(rule, re, 'the engine rule the contract mirrors');
    assert.deepEqual(m.ratingFor({ selfCheck: 'knew' }), { rating: 3, from: 3, capped: false }); assert.deepEqual(m.ratingFor({ selfCheck: 'missed' }), { rating: 1, from: 1, capped: false });
    for (const r of [1, 2, 3, 4]) assert.equal(m.ratingFor({ rating: r }).rating, r);
    assert.deepEqual(m.ratingFor({ claim: true }), { refuse: 'claim-without-check' }); assert.deepEqual(m.ratingFor({ rating: 4 }, 'revealed'), { rating: 1, from: 4, capped: true }); assert.deepEqual(m.ratingFor({ rating: 4 }, 'hint'), { rating: 2, from: 4, capped: true });
    const known = [...e.deviceTypes, ...e.serverTypes]; assert.equal(known.length, 15); assert.equal(e.deviceTypes.length, 12); assert.equal(e.serverTypes.length, 3);
    const review = m.engineEnvelopeFor(graded('Rajomon', 'speaking', { rating: 2 }));
    assert.equal(review.type, 'review'); for (const key of Object.keys(review.data)) assert.ok(e.fieldsByType.review.includes(key), `review data key ${key} is the engine's`);
    assert.equal(review.data.rawRating, 2); assert.equal(review.data.taskKey, task);
    // the engine's own validateEvent on the envelope: the only complaints are the bridge's two (the registry task key and the hesitation window are W4's seam), never a data field
    const withRevision = m.engineEnvelopeFor({ ...graded('Rajomon', 'speaking', { rating: 2 }), source: { surface: 'Rajomon', action: 'answer', at, contentRevision: 'rev-1' } });
    assert.deepEqual(validateEvent(wire(withRevision)).errors.sort(), ['hesitation-evidence', 'task-parent'], 'the engine accepts the review data except the bridge\'s two fields');
    const enrol = m.engineEnvelopeFor(enrolment);
    assert.ok(['baseline', 'manual-card'].includes(enrol.type), 'an enrolment maps onto baseline or manual-card'); assert.notEqual(enrol.type, 'review');
    for (const key of Object.keys(enrol.data)) assert.ok(e.fieldsByType[enrol.type].includes(key), `${enrol.type} data key ${key} is the engine's`);
    assert.deepEqual(validateEvent(wire(enrol)), { ok: true, unsupported: false, errors: [] }, 'the engine accepts the enrolment envelope as it is');
    assert.throws(() => m.engineEnvelopeFor({ kind: 'external-review', task, modality: 'speaking', answer: { rating: 2 }, assistance: 'none', source: { surface: 'Rajomon', action: 'answer', at } }), /private-ledger-shape/u, 'no third kind reaches an envelope');
    assert.equal(m.ENGINE_TYPE_BY_KIND.enrolment !== 'review', true);
    assert.deepEqual(m.engineEnvelopeFor(graded('Speak', 'listening', { claim: true })), { refuse: 'claim-without-check', type: null }, 'a claim never becomes a review');
    for (const type of m.engineTypesUsed()) assert.ok(known.includes(type), `${type} is one of the engine's types`);
    assert.equal(m.checkEngineMatch().ok, true);
    // the plant the contract names: a type the engine lacks is refused through W4's door, never added here
    assert.throws(() => m.checkEngineMatch(shape, [...m.engineTypesUsed(), 'external-review']), /^TaskContractError: engine-change-needed: route through W4 \(S1-R20\)/u);
    assert.throws(() => m.checkEngineMatch({ ...shape, deviceTypes: shape.deviceTypes.filter((x) => x !== 'review') }), /engine-change-needed: route through W4 \(S1-R20\)/u);
    assert.ok(!/external-review/u.test(readFileSync(MODULE, 'utf8')) && !/external-review/u.test(readFileSync(SHAPE, 'utf8')), 'no type was added to the contract or the shape');
  });

  await t.test('[5] pins: the shape file records the engine commit, the parameter set and the reducer pin, and every list recomputed from the vendored engine matches it field by field', () => {
    assert.deepEqual(pinProblems(shape, e), [], 'every pin holds');
    assert.equal(shape.engine.sourceCommit, W4.sourceCommit); assert.equal(shape.scheduler.parameterSetId, W4.parameterSetId); assert.equal(shape.engine.reducerPin, W4.reducerPin);
    assert.equal(e.manifest.source.commit, W4.sourceCommit, 'engine-manifest.json source.commit'); assert.equal(e.pin.parameterSetId, W4.parameterSetId, 'data/fsrs-pin.json');
    assert.ok(e.manifest.reducerSha256.startsWith(W4.reducerPin), 'the reducer pin is the manifest digest\'s prefix');
    // generated, never hand-written: the generator in this directory reproduces the file byte for byte
    const { NODE_TEST_CONTEXT, ...env } = process.env;
    const regenerated = execFileSync(process.execPath, [GENERATOR], { cwd: HERE, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(regenerated, readFileSync(SHAPE, 'utf8'), 'build-engine-shape.mjs reproduces w4-engine-shape.json');
    // the plants the contract names
    const altered = JSON.parse(JSON.stringify(shape)); altered.scheduler.parameterSetId = altered.scheduler.parameterSetId.replace('r090', 'r091');
    const problems = pinProblems(altered, e); assert.ok(problems.length >= 1 && problems.every((p) => /scheduler\.parameterSetId/u.test(p)), `one changed letter is named: ${problems.join(' | ')}`);
    const addedType = JSON.parse(JSON.stringify(shape)); addedType.deviceTypes.push('external-review');
    assert.match(pinProblems(addedType, e)[0], /^deviceTypes/u, 'a type added to the shape is named');
  });
});
