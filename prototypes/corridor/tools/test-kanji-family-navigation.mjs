/** F1–F11: source-only family navigation checks, small retained fixtures and actual
 * corridor functions lifted by AST. Controlled DOM/fetch/clock boundaries are not
 * browser, native focus, storage durability, phone or release evidence.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import * as srsCore from '../srs-core.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const family = require('../kanji-family.js');
const structureModule = require('../kanji-structure.js');
const course = require('../kanji-course.js');
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const json = name => JSON.parse(read(name));
const clone = value => JSON.parse(JSON.stringify(value));
const data = json('../data/share_alike/kanji-family.json');
const allKanji = json('../data/share_alike/kanji.json').kanji;
const allWords = json('../data/share_alike/words.json').words;
const grouping = json('../data/share_alike/kanji-structure.json');
const allStrokes = json('../data/share_alike/strokes.json').strokes;
const kanji = Object.fromEntries(data.nodes.filter(row => row.reference.type === 'kanji')
  .map(row => [row.reference.id, allKanji[row.reference.id]]));
const words = Object.fromEntries(data.nodes.filter(row => row.reference.type === 'word')
  .map(row => [row.reference.id, allWords[row.reference.id]]));
const strokes = Object.fromEntries(Object.keys(grouping.characters).map(id => [id, allStrokes[id]]));
const structure = structureModule.createModel({ kanji, strokes, grouping });
const makeModel = (asset = data) => family.createModel({ data: asset, kanji, words, structure });
const model = makeModel();
const navigation = family.createNavigation({ model });
const ref = (type, id, reading) => ({ type, id, ...(reading === undefined ? {} : { reading }) });
const source = read('../corridor.js');
const ast = ts.createSourceFile('corridor.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function declaration(name) {
  const statement = ast.statements.find(node =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(row => row.name.getText(ast) === name)));
  assert.ok(statement, `actual corridor declaration ${name}`);
  return statement.getText(ast);
}
function lift(names, globals = {}) {
  const context = vm.createContext(globals);
  vm.runInContext(names.map(declaration).join('\n'), context);
  return context;
}
const evaluate = (context, expression) => vm.runInContext(expression, context);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function timers() {
  let sequence = 0;
  const pending = new Map();
  return {
    setTimeout(fn, ms) { const id = ++sequence; pending.set(id, { fn, ms }); return id; },
    clearTimeout(id) { pending.delete(id); },
    fire(ms) { for (const [id, row] of [...pending]) if (row.ms === ms) { pending.delete(id); row.fn(); } },
    pending,
  };
}
function deeplyFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  Object.values(value).forEach(deeplyFrozen);
}

function authoredContract(candidate) {
  const catalog = candidate.catalog();
  assert.equal(catalog.nodes.length, 19);
  assert.equal(catalog.edges.length, 18);
  assert.deepEqual(Object.fromEntries(['phonetic-component', 'semantic-component', 'source-component-occurrence',
    'word-contains-kanji', 'attested-word-occurrence'].map(kind => [kind,
    catalog.edges.filter(row => row.relation === kind).length])), {
    'phonetic-component': 3, 'semantic-component': 3, 'source-component-occurrence': 6,
    'word-contains-kanji': 3, 'attested-word-occurrence': 3,
  });
  const nav = family.createNavigation({ model: candidate });
  for (const [component, host, kind] of [['戠', '職', 'phonetic'], ['戠', '識', 'phonetic'],
    ['戠', '織', 'phonetic'], ['耳', '職', 'semantic'], ['言', '識', 'semantic'], ['糸', '織', 'semantic']]) {
    for (const [id, direction] of [[component, 'outgoing'], [host, 'incoming']]) {
      const row = nav.view(ref('kanji', id))[kind].find(edge => edge.from.id === component && edge.to.id === host);
      assert.ok(row, `${component}→${host} ${kind}`);
      assert.equal(row.direction, direction);
      const edge = catalog.edges.find(value => value.id === row.edgeId);
      assert.equal(row.relation, edge.relation);
      assert.deepEqual(row.from, edge.from);
      assert.deepEqual(row.to, edge.to);
      assert.ok(row.citations.length);
      for (const citation of row.citations) {
        assert.equal(citation.locator, 'なりたち');
        assert.deepEqual(citation.source.subject, ref('kanji', host));
        assert.match(citation.source.url, /^https:\/\//u);
      }
    }
  }
}
test('F1 authored counts, roles, arrow direction and source subject; clique/role/citation mutants fail', () => {
  authoredContract(model);
  for (const mutate of [
    draft => { draft.edges.push({ ...clone(draft.edges[0]), id: 'invented-clique' }); },
    draft => { draft.edges[0].relation = 'semantic-component'; },
    draft => { draft.edges[0].evidence = []; },
    draft => { draft.edges[0].evidence[0].sourceId = 'kanjipedia-8b58'; },
  ]) {
    const draft = clone(data); mutate(draft);
    assert.throws(() => authoredContract(makeModel(draft)));
  }
});

test('F2 geometry belongs to its occurrence host; standalone and absent relationships stay absent', () => {
  const occurrences = data.nodes.filter(row => row.reference.type === 'component-occurrence');
  for (const occurrence of occurrences) {
    const row = navigation.view(occurrence.host).occurrences.find(value => value.occurrence.id === occurrence.reference.id);
    assert.ok(row, 'host joins are not mistaken for edge endpoints');
    const result = navigation.destination(row.edgeId, occurrence.host);
    assert.equal(result.status, 'available');
    assert.deepEqual(result.node, { t: 'kanji', id: occurrence.host.id, kanjiOccurrenceId: occurrence.reference.id });
    assert.deepEqual(row.geometry.projection.paths, occurrence.strokeIndices.map(index => strokes[occurrence.host.id][index]));
    assert.equal(structure.occurrence(occurrence.host.id === '職' ? '織' : '職', occurrence.reference.id), null);
    if (occurrence.component.id === '戠') assert.equal(row.geometry.projection.paths.length, 12);
  }
  assert.equal(model.geometry(ref('kanji', '戠')), null);
  assert.equal(navigation.view(ref('kanji', '戠')).semantic.length, 0);
  for (const id of ['音', '戈', '木']) assert.equal(navigation.view(ref('kanji', id)).status, 'absent');
  for (const value of [null, ref('kanji', ''), { ...ref('kanji', '織'), sense: 'invented' }])
    assert.equal(navigation.view(value).status, 'invalid');
  const draft = clone(data);
  draft.nodes.find(row => row.reference.type === 'component-occurrence').host.id = '織';
  assert.throws(() => makeModel(draft), /geometry/u);
});

test('F3 exact word reading, occurrence coordinates and course expectations have no spelling/text fallback', () => {
  for (const example of data.examples) {
    assert.equal(navigation.view(example.word).status, 'available');
    assert.notEqual(navigation.view({ ...example.word, reading: 'べつ' }).status, 'available');
    assert.equal(navigation.view(ref('word', example.word.id)).status, 'invalid');
    const expected = { word: example.word, sentence: example.sentence, english: example.english,
      sourceAttribution: example.sourceAttribution, register: 'verified-register' };
    const actual = navigation.example(example.reference, expected);
    assert.equal(actual.status, 'available');
    for (const field of ['reference', 'word', 'tokenIndex', 'sourceRowIndex', 'bundleSid', 'rawRow',
      'sentence', 'english', 'sourceAttribution']) assert.deepEqual(actual[field], example[field], field);
    assert.equal(actual.register, expected.register);
    for (const mutate of [
      value => { value.word.reading = 'べつ'; },
      value => { value.sentence += '。'; },
      value => { value.english += ' altered'; },
      value => { value.sourceAttribution.attribution = 'invented'; },
    ]) {
      const bad = clone(expected); mutate(bad);
      assert.equal(navigation.example(example.reference, bad).status, 'invalid');
    }
    for (const index of [1, 2, 3, 4]) {
      const tuple = JSON.parse(example.reference.id);
      tuple[index] = typeof tuple[index] === 'number' ? tuple[index] + 1 : tuple[index] + 'altered';
      assert.notEqual(navigation.example(ref('sentence-occurrence', JSON.stringify(tuple))).status, 'available');
    }
    assert.equal(navigation.example({ sentence: example.sentence }).status, 'invalid');
  }
});

test('F4 only the selected raw token is actionable; copied tokens and null identity claims stay immutable', () => {
  const before = JSON.stringify(data);
  for (const example of data.examples) {
    const actual = navigation.example(example.reference);
    deeplyFrozen(actual);
    assert.notStrictEqual(actual.tokens, example.rawRow[0]);
    assert.deepEqual(actual.tokens, example.rawRow[0]);
    for (const field of ['originalCorpusSentenceId', 'contextualSenseId', 'characterReadingAlignment'])
      assert.equal(actual[field], null);
    for (let index = -1; index <= actual.tokens.length; index++) {
      const result = navigation.exampleTarget(example.reference, index);
      assert.equal(result.status === 'available', index === example.tokenIndex);
      if (index === example.tokenIndex) assert.deepEqual(result.node,
        { t: 'word', id: example.word.id, reading: example.word.reading });
    }
    assert.throws(() => { actual.tokens[example.tokenIndex][0] = 'changed'; }, TypeError);
  }
  // Repeated spelling is retained text, never a second occurrence capability.
  const duplicate = clone(data), example = duplicate.examples[0];
  example.rawRow[0].push(clone(example.rawRow[0][example.tokenIndex]));
  example.sentence = example.rawRow[0].map(token => token[0]).join('');
  const nav = family.createNavigation({ model: makeModel(duplicate) });
  assert.equal(nav.exampleTarget(example.reference, example.tokenIndex).status, 'available');
  assert.notEqual(nav.exampleTarget(example.reference, example.rawRow[0].length - 1).status, 'available');
  assert.equal(JSON.stringify(data), before);
});

function loaderHarness({ bundle, fetcher, structureLoader = async () => structure } = {}) {
  const clock = timers();
  const requests = [];
  const context = lift(['kanjiFamilyTask', 'kanjiFamilyRuntime', 'kanjiFamilyError', 'loadKanjiFamily'], {
    window: { BunkiKanjiFamily: family, ...(bundle === undefined ? {} : { __CORRIDOR_BUNDLE__: bundle }) },
    D: { kanji, words }, AbortController, ...clock,
    loadKanjiStructure: structureLoader,
    fetch: (...args) => { requests.push(args); return fetcher?.(...args) || Promise.resolve({ ok: true, json: async () => data }); },
  });
  return { context, clock, requests };
}
test('F5 shared loader caches one model, fails visibly, retries explicitly and bounds dependency waits', async () => {
  const pending = deferred();
  const h = loaderHarness({ fetcher: () => pending.promise });
  const first = h.context.loadKanjiFamily(), second = h.context.loadKanjiFamily();
  assert.strictEqual(first, second);
  await flush(); assert.equal(h.requests.length, 1);
  pending.resolve({ ok: true, json: async () => data });
  const loaded = await first;
  assert.ok(loaded.model && loaded.navigation);
  assert.strictEqual(await h.context.loadKanjiFamily(), loaded);
  assert.equal(h.requests.length, 1);
  for (const options of [
    { bundle: {} },
    { bundle: { 'share_alike/kanji-family': data }, structureLoader: async () => null },
    { fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError('malformed JSON'); } }) },
    { bundle: { 'share_alike/kanji-family': { schemaVersion: -1 } } },
  ]) {
    const failed = loaderHarness(options);
    assert.equal(await failed.context.loadKanjiFamily(), null);
    assert.ok(evaluate(failed.context, 'kanjiFamilyError'));
    assert.equal(evaluate(failed.context, 'kanjiFamilyTask'), null);
    if (options.bundle) assert.equal(failed.requests.length, 0, 'standalone never falls through to network');
    failed.context.window.__CORRIDOR_BUNDLE__ = { 'share_alike/kanji-family': data };
    failed.context.loadKanjiStructure = async () => structure;
    assert.ok(await failed.context.loadKanjiFamily(), 'only this explicit retry clears the error');
  }
  for (const dependency of ['fetch', 'structure']) {
    const gate = deferred();
    const bounded = loaderHarness(dependency === 'fetch'
      ? { fetcher: () => gate.promise }
      : { bundle: { 'share_alike/kanji-family': data }, structureLoader: () => gate.promise });
    let settled = false, outcome;
    const work = bounded.context.loadKanjiFamily().then(value => { settled = true; outcome = value; });
    await flush(); bounded.clock.fire(8000); await flush();
    assert.equal(settled, true, `${dependency} timeout settles even when dependency ignores abort`);
    assert.equal(outcome, null);
    await work;
    gate.resolve(dependency === 'fetch' ? { ok: true, json: async () => data } : structure);
    await flush();
    assert.equal(evaluate(bounded.context, 'kanjiFamilyRuntime'), null, 'late dependency cannot install a model');
  }
});

const ticketNames = ['kanjiFamilyLiveVisit', 'kanjiFamilyTicket', 'kanjiFamilyTicketCurrent',
  'kanjiFamilyStamp', 'kanjiFamilyStampCurrent'];
function navigationHarness() {
  const runtime = { model, navigation }, opens = [], captures = [];
  const S = { view: 'lessons', stack: [{ t: 'kanji', id: '織' }], kanjiCourse: null,
    navigationDepartures: 0, wordEntrySerial: 0, navigationReturns: [] };
  const context = lift([...ticketNames, 'kanjiFamilyCourseExpectation', 'openKanjiFamilyExample'], {
    window: { BunkiKanjiCourse: course },
    S, recordEpoch: 1, kanjiFamilyRuntime: runtime, kanjiFamilyExamples: new WeakMap(), kanjiFamilyViews: new WeakMap(),
    recordReady: epoch => epoch === context.recordEpoch,
    loadKanjiFamily: async () => context.kanjiFamilyRuntime,
    kanjiFamilyAuthorize: async (...args) => { captures.push(args); return true; },
    kanjiFamilyStatus() {}, kanjiFamilyRefusal() {},
    inflateExampleToken: token => ({ surface: token[0], word: token[1], reading: token[2] }),
    go: (node, options) => opens.push({ node, options }),
  });
  return { context, S, runtime, opens, captures, invoker: { isConnected: true } };
}
test('F6 current opens once; every async ticket invalidator cancels before capture/navigation', async () => {
  const example = data.examples[2];
  const current = navigationHarness();
  assert.equal(await current.context.openKanjiFamilyExample(example.reference, current.invoker), true);
  assert.equal(current.opens.length, 1);
  assert.equal(current.captures.length, 1);
  for (const invalidate of [
    h => { h.S.view = 'search'; h.S.view = 'lessons'; h.S.navigationDepartures++; },
    h => { h.context.recordEpoch++; },
    h => { h.S.stack = [...h.S.stack]; },
    h => { h.S.stack.push({ t: 'kanji', id: '職' }); },
    h => { h.S.kanjiCourse = { ...h.S.kanjiCourse }; },
    h => { h.S.kanjiCourse.run = {}; },
    h => { h.S.kanjiCourse.stage = 'check'; },
    h => { h.S.kanjiCourse.index++; },
    h => { h.S.wordEntrySerial++; },
    h => { h.context.kanjiFamilyRuntime = { ...h.runtime }; },
    h => { h.invoker.isConnected = false; },
  ]) {
    const h = navigationHarness(), pending = deferred();
    h.S.kanjiCourse = { unitId: 'shiki-shoku', epoch: 1, stage: 'teach', index: 0, run: {} };
    h.context.loadKanjiFamily = () => pending.promise;
    const opening = h.context.openKanjiFamilyExample(example.reference, h.invoker);
    invalidate(h); pending.resolve(h.runtime);
    assert.equal(await opening, false);
    assert.equal(h.opens.length, 0);
    assert.equal(h.captures.length, 0);
  }
});

const ledgerNames = ['KANJI_LEDGER_LIMITS', 'kanjiDeepFreeze', 'kanjiDataProperty', 'kanjiPlainData',
  'kanjiPlainList', 'kanjiCourseRowValid', 'kanjiCourseJourney', 'kanjiCourseLedger', 'kanjiCourseCapture',
  'kanjiCourseRememberHelp', 'kanjiCourseApplyHelp', 'kanjiCourseReferenceHelp', 'kanjiCourseTeachingHelp',
  'kanjiCourseLedgerBefore', 'kanjiCourseSnapshot', 'kanjiCourseAct', 'KANJI_LEDGER_FULL',
  'kanjiCoursePrepareReview'];
function realmValue(context, value) {
  context.__json = JSON.stringify(value);
  const result = evaluate(context, 'JSON.parse(__json)');
  delete context.__json;
  return result;
}
function assistanceHarness({ journey = false } = {}) {
  let now = 1000, identity = 0;
  class ClockDate extends Date { static now() { return now; } }
  const context = vm.createContext({ window: {}, Date: ClockDate, recordEpoch: 1, JOURNEY_WRITES: journey,
    S: { view: 'lessons', stack: [], kanjiCourse: null },
    kanjiFamilyRuntime: { model, navigation }, recordReady: epoch => epoch === context.recordEpoch,
    crypto: { randomUUID: () => `probe-${++identity}` }, helpRelevanceRule: null, KANJI_REVIEW_OWNER: 'family-probe',
  });
  vm.runInContext(read('../kanji-course.js'), context);
  vm.runInContext(`window.BunkiKanjiCourse = BunkiKanjiCourse;\n${[...ledgerNames, ...ticketNames,
    'kanjiFamilyHelpRow', 'kanjiFamilyAuthorize'].map(declaration).join('\n')}`, context);
  return { context, course: context.BunkiKanjiCourse, setNow: value => { now = value; } };
}
function freshAttempt(h, kind, literal) {
  const c = h.course;
  let run = c.createRun('shiki-shoku', realmValue(h.context,
    { sessionId: `probe-${kind}-${literal.codePointAt(0).toString(16)}`, targets: [kind], mode: 'preview' }));
  while (c.currentPrompt(run).kanji !== literal) run = c.skip(run,
    realmValue(h.context, { attemptId: c.currentAttempt(run).attemptId, at: 100 }));
  const visit = realmValue(h.context, { unitId: 'shiki-shoku', epoch: 1, stage: 'check', index: 0,
    run, draft: '', feedback: null, pending: false });
  h.context.S.kanjiCourse = visit;
  return visit;
}
function answerAndRate(h, visit) {
  const c = h.course, prompt = c.currentPrompt(visit.run), attemptId = c.currentAttempt(visit.run).attemptId;
  h.setNow(2000);
  h.context.kanjiCourseAct(visit, 'answer', prompt.acceptedAnswers[0]);
  visit.run = c.selfCheck(visit.run, attemptId, 'knew', 2001);
  const prepared = h.context.kanjiCoursePrepareReview(visit, attemptId, c.hookCandidate(visit.run, attemptId));
  assert.ok(prepared.details, prepared.reason);
  return srsCore.decideReview(clone(prepared.details.candidate), { state: 0, last_review: null },
    { now: new Date(2001) });
}

test('F10 unstudied reading and remote-host paraphrase give Again through the real ledger/attempt/rating', async () => {
  for (const scenario of [
    { page: '識', kind: 'reading', target: '識', expected: { kind: 'word', term: '知識', reading: 'ちしき' } },
    { page: '糸', kind: 'meaning', target: '織', expected: { kind: 'kanji', literal: '織' } },
  ]) {
    for (const disclose of [true, false]) {
      const h = assistanceHarness(), visit = freshAttempt(h, scenario.kind, scenario.target);
      // Existing dictionary help is retained; only the new disclosure is removed
      // in the negative control, so Hard is a legitimate non-Again outcome.
      h.context.kanjiCourseReferenceHelp(visit, realmValue(h.context, { t: 'kanji', id: scenario.page }));
      if (disclose) {
        const rows = navigation.view(ref('kanji', scenario.page)).exposures;
        const ticket = h.context.kanjiFamilyTicket({ isConnected: true });
        assert.equal(await h.context.kanjiFamilyAuthorize(realmValue(h.context, rows), ticket), true);
        assert.ok(visit.referenceHelp.some(row => JSON.stringify(row.about) === JSON.stringify(scenario.expected) &&
          row.reveals.includes(scenario.kind)));
      }
      const result = answerAndRate(h, visit);
      assert.equal(result.write, true);
      if (disclose) assert.equal(result.rating, 1, 'answer shown before a correct + knew response gives Again');
      else assert.notEqual(result.rating, 1, 'skip-capture mutant breaks the Again contract');
    }
  }
  const h = assistanceHarness(), visit = freshAttempt(h, 'reading', '織');
  assert.equal(await h.context.kanjiFamilyAuthorize(realmValue(h.context,
    navigation.example(data.examples[2].reference).exposures), h.context.kanjiFamilyTicket({ isConnected: true })), true);
  assert.ok(visit.referenceHelp.some(row => row.what === 'family-example' && row.about.term === '組織'));
  assert.equal(answerAndRate(h, visit).rating, 1);
  const outside = assistanceHarness();
  let captures = 0;
  outside.context.kanjiCourseRememberHelp = () => { captures++; throw new Error('outside visit capture'); };
  assert.equal(await outside.context.kanjiFamilyAuthorize(realmValue(outside.context,
    navigation.view(ref('kanji', '識')).exposures), outside.context.kanjiFamilyTicket({ isConnected: true })), true);
  assert.equal(captures, 0);
});

test('F10 OFF remains plain/synchronous with accepted copies and distinct same-clock events', () => {
  const h = assistanceHarness(), visit = freshAttempt(h, 'meaning', '職');
  const rows = realmValue(h.context, [{ what: 'family-reference', about: { kind: 'kanji', literal: '職' },
    reveals: ['meaning'], at: 1000 }]);
  const first = h.context.kanjiCourseRememberHelp(visit, rows);
  assert.equal(first.status, 'kept');
  assert.equal(first.then, undefined, 'thenable OFF mutant defers old callers and must fail');
  assert.notStrictEqual(visit.referenceHelp[0], rows[0]);
  assert.equal(Object.isFrozen(visit.referenceHelp[0]), true);
  h.context.kanjiCourseRememberHelp(visit, rows);
  assert.equal(visit.reviewLedger.exposure.length, 2, 'separate events retain both raw rows despite equal timestamps');
  assert.notEqual(visit.reviewLedger.origins[0].eventId, visit.reviewLedger.origins[1].eventId);
  const refused = h.context.kanjiCourseRememberHelp(visit, realmValue(h.context, [{ invalid: true }]));
  assert.equal(refused.status, 'refused'); assert.equal(refused.then, undefined);
});

function journeyHarness({ shown = { accepted: true, display: true },
  hold = { display: true, held: true }, missing = false, blocked = false, rejected = false } = {}) {
  const clock = timers(), wait = deferred();
  let holds = 0;
  const visit = { epoch: 1, unitId: 'shiki-shoku' };
  const journey = {
    batches: new Set(), module: { LIMITS: { events: 128 } },
    lifecycle: {
      tick: async () => {}, namespace: () => 'probe-session/',
      inspect: () => ({ root: { dayEpoch: 'probe-day', daily: { events: [] } } }),
      beginHelp: async () => { if (rejected) throw new Error('synthetic refusal'); return 'help-ticket'; },
      awaitHelp: () => blocked ? wait.promise : Promise.resolve(shown),
      holdAtDeadline: () => { holds++; return hold; },
    },
  };
  const context = lift(['kanjiJourneyRemember'], {
    ...clock, recordEpoch: 1, crypto: { randomUUID: () => 'probe-event' },
    kanjiJourneyFor: () => missing ? null : journey,
    kanjiJourneyRun: (_journey, operation) => operation(), kanjiJourneyEnter: async () => {},
    kanjiPlainList: Array.isArray, kanjiCourseRowValid: () => true,
    kanjiDeepFreeze: value => Object.freeze(value),
  });
  return { context, visit, clock, wait, get holds() { return holds; } };
}
test('F10 ON keep/held/refusal/cancellation/deadline returns preserve first outer settlement', async () => {
  for (const [options, expected] of [
    [{}, 'kept'],
    [{ shown: { accepted: true, display: true, held: true } }, 'kept'],
    [{ shown: { accepted: false, display: true, held: true } }, 'held'],
    [{ shown: { accepted: false, display: false, late: true }, hold: { display: false, late: true } }, 'refused'],
    [{ rejected: true, hold: { display: true, held: true } }, 'held'],
    [{ rejected: true, hold: { display: false, late: true } }, 'refused'],
    [{ missing: true }, 'refused'],
  ]) {
    const h = journeyHarness(options), work = h.context.kanjiJourneyRemember(h.visit, []);
    assert.equal(typeof work.then, 'function', 'ON stays promised for old callers');
    assert.equal((await work).status, expected);
  }
  const owner = journeyHarness({ missing: true }); owner.visit.epoch = 0;
  assert.equal((await owner.context.kanjiJourneyRemember(owner.visit, [])).status, 'cancelled');
  const moved = journeyHarness({ blocked: true, hold: { display: false, late: true } });
  const moving = moved.context.kanjiJourneyRemember(moved.visit, []);
  await flush(); moved.context.recordEpoch++;
  moved.wait.resolve({ accepted: false, display: false, late: true });
  assert.equal((await moving).status, 'cancelled', 'inner late outcome respects the moved owner');
  for (const [hold, moved, expected] of [
    [{ display: true, held: true }, false, 'held'],
    [{ display: false, held: true, late: true }, false, 'refused'],
    [{ display: false, late: true }, true, 'cancelled'],
  ]) {
    const h = journeyHarness({ blocked: true, hold });
    const work = h.context.kanjiJourneyRemember(h.visit, []);
    await flush(); if (moved) h.context.recordEpoch++;
    h.clock.fire(300);
    const outcome = await work;
    assert.equal(outcome.status, expected);
    h.wait.resolve({ accepted: true, display: true }); await flush();
    assert.equal((await work).status, expected, 'late keep cannot replace the deadline result');
    assert.equal(h.visit.referenceHelp, undefined, 'late keep cannot project help');
    assert.equal(h.holds, 1);
  }
});

test('F10 authorization reveals only after keep/proved-held and cancels stale owner/run/navigation', async () => {
  for (const status of ['kept', 'held', 'refused', 'cancelled']) {
    const h = assistanceHarness(), visit = freshAttempt(h, 'meaning', '職'), pending = deferred();
    let applied = 0, finished = false;
    h.context.kanjiCourseRememberHelp = () => pending.promise;
    h.context.kanjiCourseApplyHelp = value => { assert.strictEqual(value, visit); applied++; };
    const work = h.context.kanjiFamilyAuthorize(realmValue(h.context,
      navigation.view(ref('kanji', '識')).exposures), h.context.kanjiFamilyTicket({ isConnected: true }))
      .then(value => { finished = true; return value; });
    await flush(); assert.equal(finished, false); assert.equal(applied, 0);
    pending.resolve({ status });
    assert.equal(await work, ['kept', 'held'].includes(status));
    assert.equal(applied, ['kept', 'held'].includes(status) ? 1 : 0);
  }
  for (const mutate of [h => { h.context.recordEpoch++; },
    h => { h.context.S.kanjiCourse.run = {}; }, h => { h.context.S.navigationDepartures = 1; }]) {
    const h = assistanceHarness(); freshAttempt(h, 'meaning', '職');
    const pending = deferred(); let applied = 0;
    h.context.kanjiCourseRememberHelp = () => pending.promise;
    h.context.kanjiCourseApplyHelp = () => { applied++; };
    const work = h.context.kanjiFamilyAuthorize(realmValue(h.context,
      navigation.view(ref('kanji', '識')).exposures), h.context.kanjiFamilyTicket({ isConnected: true }));
    mutate(h); pending.resolve({ status: 'kept' });
    assert.equal(await work, false); assert.equal(applied, 0);
  }
});

class Element {
  constructor(tag, className = '', text = '') {
    this.tagName = tag.toUpperCase(); this.className = className; this.text = String(text);
    this.children = []; this.dataset = {}; this.attributes = {}; this.events = new Map();
    this.id = ''; this.hidden = false; this.disabled = false; this.parentElement = null;
    this._connected = false; this.scrollTop = 0;
    this.classList = { add() {}, remove() {}, contains: name => this.className.split(' ').includes(name) };
  }
  get isConnected() { return this.parentElement ? this.parentElement.isConnected : this._connected; }
  set isConnected(value) { this._connected = value; }
  append(...children) { for (const child of children) { if (child instanceof Element) child.parentElement = this; this.children.push(child); } }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children.forEach(child => { if (child instanceof Element) child.parentElement = null; }); this.children = []; this.append(...children); this.text = ''; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, fn) { this.events.set(name, [...(this.events.get(name) || []), fn]); }
  get textContent() { return this.text + this.children.map(child => child instanceof Element ? child.textContent : String(child)).join(''); }
  set textContent(value) { this.text = String(value); this.children = []; }
  querySelectorAll(selector) {
    if (selector.includes(',')) return [...new Set(selector.split(',').flatMap(value => this.querySelectorAll(value.trim())))];
    return descendants(this).slice(1).filter(node => {
      if (selector.startsWith('[data-')) {
        const key = selector.slice(6, -1).replace(/-([a-z])/gu, (_all, char) => char.toUpperCase());
        return Object.hasOwn(node.dataset, key);
      }
      if (selector.startsWith('#')) return node.id === selector.slice(1);
      if (selector.startsWith('.')) return node.className.split(' ').includes(selector.slice(1));
      return node.tagName === selector.toUpperCase();
    });
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(node) { return descendants(this).includes(node); }
  after(node) { const siblings = this.parentElement.children; node.parentElement = this.parentElement; siblings.splice(siblings.indexOf(this) + 1, 0, node); }
  focus() { this.focused = true; }
  async fire(name = 'click') {
    if (this.disabled) return;
    for (const fn of this.events.get(name) || []) await fn({ target: this, preventDefault() {}, stopPropagation() {} });
    await flush();
  }
}
const descendants = node => [node, ...node.children.filter(child => child instanceof Element).flatMap(descendants)];
const visibleText = node => node.hidden ? '' : node.text + node.children
  .map(child => child instanceof Element ? visibleText(child) : String(child)).join('');

const surfaceNames = [...ticketNames, 'kanjiFamilyHelpRow', 'kanjiFamilyAuthorize', 'kanjiFamilyControlId',
  'kanjiFamilyStatus', 'kanjiFamilyRefusal', 'kanjiFamilyHasExampleOrigin', 'sanitizeKanjiFamilyExposure',
  'activateKanjiFamily', 'kanjiFamilyCourseExpectation', 'openKanjiFamilyExample', 'renderKanjiFamilyDisclosure', 'kanjiFamilyCitations',
  'renderKanjiFamily', 'kanjiFamilyResolveExample', 'renderFamilyExampleNode'];
function surfaceHarness({ live = false, id = '識' } = {}) {
  const captures = [], opens = [];
  const visit = { unitId: 'shiki-shoku', epoch: 1, run: {}, stage: 'check', index: 0 };
  const node = { t: 'kanji', id }, runtime = { model, navigation };
  const S = { view: 'lessons', stack: [node], kanjiCourse: live ? visit : null,
    navigationReturns: [], navigationDepartures: 0, wordEntrySerial: 0 };
  const sheet = new Element('div', 'sheet'); sheet.id = 'sheet';
  const forbidden = name => () => { throw new Error(`family surface called forbidden ${name}`); };
  const context = lift(surfaceNames, {
    window: { BunkiKanjiCourse: course },
    S, recordEpoch: 1, kanjiFamilyRuntime: runtime, kanjiFamilyError: null,
    kanjiFamilyMounts: new WeakMap(), kanjiFamilyExposures: new WeakMap(),
    kanjiFamilyExamples: new WeakMap(), kanjiFamilyViews: new WeakMap(),
    recordReady: epoch => epoch === context.recordEpoch,
    el: (tag, cls, text) => new Element(tag, cls, text),
    biLabel: (tag, cls, _ja, en) => new Element(tag, cls, en), tx: (_ja, en) => en,
    document: { createTextNode: text => text, getElementById: id => descendants(sheet).find(row => row.id === id) || null },
    loadKanjiFamily: async () => context.kanjiFamilyRuntime,
    kanjiCourseRememberHelp: (_visit, rows) => { captures.push(clone(rows)); return { status: 'kept' }; },
    kanjiCourseApplyHelp() {}, activateKanjiStructure() {},
    inflateExampleToken: token => ({ s: token[0], b: token[1], r: token[2] }),
    go: (next, options) => opens.push({ node: next, options }),
    renderSentenceTokens: forbidden('generic token ladder'), enhanceJapaneseProse: forbidden('prose decoration'),
    normalizeCapture: forbidden('capture reconstruction'), recordObservation: forbidden('observation'),
    ensureBankExamples: forbidden('spelling-only examples'),
  });
  return { context, S, node, runtime, visit, sheet, captures, opens,
    mount() { sheet.isConnected = true; context.activateKanjiFamily(sheet); },
    render() { context.renderKanjiFamily(sheet, node); },
  };
}
function disclosure(sheet) {
  const button = descendants(sheet).find(row => row.tagName === 'BUTTON' && row.text === 'Source and account');
  assert.ok(button, 'explicit disclosure control');
  return button;
}

test('F5 detached/prebuilt surfaces never load or paint; loading across course start collapses facts', async () => {
  const h = surfaceHarness(), pending = deferred();
  let loads = 0;
  h.context.kanjiFamilyRuntime = null;
  h.context.loadKanjiFamily = () => { loads++; return pending.promise; };
  h.render(); h.context.activateKanjiFamily(h.sheet);
  assert.equal(loads, 0);
  assert.equal(visibleText(h.sheet).includes('ちしき'), false);
  h.mount(); assert.equal(loads, 1);
  h.S.kanjiCourse = h.visit;
  h.context.kanjiFamilyRuntime = h.runtime; pending.resolve(h.runtime); await flush();
  assert.equal(visibleText(h.sheet).includes('知識'), false, 'whole word row remains behind disclosure');
  assert.equal(visibleText(h.sheet).includes('ちしき'), false);
  assert.equal(h.captures.length, 0);
  assert.equal(disclosure(h.sheet).getAttribute('aria-expanded'), 'false');
  const stale = surfaceHarness(), loading = deferred();
  stale.context.kanjiFamilyRuntime = null;
  stale.context.loadKanjiFamily = () => loading.promise;
  stale.render(); stale.mount();
  const before = stale.sheet.textContent;
  stale.sheet.isConnected = false;
  stale.context.kanjiFamilyRuntime = stale.runtime; loading.resolve(stale.runtime); await flush();
  assert.equal(stale.sheet.textContent, before, 'detached await continuation cannot paint');
});

test('F7 strict example renders one verified word/citation route and refuses fabricated capabilities', async () => {
  const h = surfaceHarness(), example = data.examples[2];
  h.sheet.isConnected = true;
  const invoker = new Element('button'); h.sheet.append(invoker);
  assert.equal(await h.context.openKanjiFamilyExample(example.reference, invoker), true);
  const node = h.opens[0].node;
  assert.equal(h.opens[0].options.inheritSourceContext, false);
  assert.equal(node.passage, null);
  assert.equal(node.sourceContext, undefined); assert.equal(node.from, undefined);
  assert.equal(node.targetOffset, example.tokenIndex);
  h.S.stack = [node]; h.sheet.replaceChildren();
  h.context.renderFamilyExampleNode(h.sheet, node); h.context.activateKanjiFamily(h.sheet);
  const buttons = descendants(h.sheet).filter(row => row.tagName === 'BUTTON');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].textContent, example.word.id);
  assert.equal(buttons[0].id, h.context.kanjiFamilyControlId(example.reference, `token-${example.tokenIndex}`));
  assert.ok(buttons[0].getAttribute('aria-label').includes(example.word.reading));
  assert.ok(visibleText(h.sheet).includes(example.sentence));
  assert.ok(visibleText(h.sheet).includes(example.english));
  assert.deepEqual(descendants(h.sheet).filter(row => row.tagName === 'A').map(row => row.href), [example.sourceAttribution.url]);
  await buttons[0].fire();
  assert.deepEqual(clone(h.opens.at(-1).node), { t: 'word', id: '組織', reading: 'そしき' });
  assert.equal(h.opens.at(-1).options.inheritSourceContext, false);
  const openedCount = h.opens.length;
  h.S.stack = [{ t: 'word', id: '職業', reading: 'しょくぎょう' }];
  await buttons[0].fire();
  assert.equal(h.opens.length, openedCount, 'an old still-mounted token cannot open after navigation');
  for (const forged of [clone(node), { ...node, familyExample: { ...node.familyExample, tokenIndex: 0 } }])
    assert.equal(h.context.kanjiFamilyResolveExample(forged), null);
  node.familyExample = { ...node.familyExample, word: { ...node.familyExample.word, reading: 'べつ' } };
  assert.equal(h.context.kanjiFamilyResolveExample(node), null, 'changed same-node descriptor loses capability');
});

test('F10 actual panel hides answer text until capture, preserves acknowledged repaint, and captures a new opening', async () => {
  for (const id of ['識', '糸']) {
    const h = surfaceHarness({ live: true, id }); h.render(); h.mount();
    const expected = navigation.view(ref('kanji', id));
    const concealed = id === '識' ? ['知識', 'ちしき'] : [expected.semantic[0].account];
    concealed.forEach(text => assert.equal(visibleText(h.sheet).includes(text), false));
    assert.equal(h.captures.length, 0);
    const pending = deferred();
    h.context.kanjiCourseRememberHelp = (_visit, rows) => { h.captures.push(clone(rows)); return pending.promise; };
    const opening = disclosure(h.sheet).fire(); await flush();
    concealed.forEach(text => assert.equal(visibleText(h.sheet).includes(text), false, 'no premature reveal'));
    assert.equal(h.captures.length, 1);
    pending.resolve({ status: 'kept' }); await opening;
    concealed.forEach(text => assert.equal(visibleText(h.sheet).includes(text), true));
    const exact = h.captures[0].find(row => id === '識' ? row.about.term === '知識' : row.about.literal === '織');
    assert.ok(exact); assert.ok(exact.reveals.includes(id === '識' ? 'reading' : 'meaning'));
    h.context.activateKanjiFamily(h.sheet); await flush();
    assert.equal(h.captures.length, 1, 'repaint is not another exposure event');
    await disclosure(h.sheet).fire();
    concealed.forEach(text => assert.equal(visibleText(h.sheet).includes(text), false));
    h.context.kanjiCourseRememberHelp = (_visit, rows) => { h.captures.push(clone(rows)); return { status: 'kept' }; };
    await disclosure(h.sheet).fire();
    assert.equal(h.captures.length, 2, 'close then open is a distinct exposure');
  }
  for (const status of ['refused', 'cancelled']) {
    const h = surfaceHarness({ live: true });
    h.context.kanjiCourseRememberHelp = () => ({ status });
    h.render(); h.mount(); await disclosure(h.sheet).fire();
    assert.equal(visibleText(h.sheet).includes('知識'), false);
    assert.ok(visibleText(h.sheet).includes('could not be confirmed'));
  }
});

function routeHarness() {
  const h = surfaceHarness(), c = h.context, noop = () => {};
  // Course reference validation intentionally rejects foreign prototypes. Its
  // actual UMD and lifted corridor callers must share the browser's one realm.
  vm.runInContext(read('../kanji-course.js'), c);
  h.sheet.isConnected = true;
  Object.assign(c, {
    window: { BunkiKanjiCourse: c.BunkiKanjiCourse, scrollY: 73, scrollTo(_x, y) { this.scrollY = y; } },
    personalHost: null, referenceLibrary: { state: {}, entry: (type, id) => ({ type, id }) },
    learningSourceVisit: null, pendingReferenceCollection: null, recordReady: epoch => epoch === c.recordEpoch,
    preserveVisibleDrafts: () => true, retireScaleReturn: noop, rememberScaleEntry: noop,
    keepScroll: noop, returnScroll: noop, restoreDialogInvoker: noop, stopReadAloud: noop,
    keyboardActivated: () => true, invokerKey: invoker => invoker?.id || null,
    finishPageTransition: noop, layerPathFor: () => false, scaleNodeBelongs: () => false,
    ladderOpening: null, ladderPages: new WeakMap(), ladderVisit: null, ladderReturning: null,
    heroSource: new WeakMap(), keptPages: new WeakMap(), pageEpoch: 1,
    sampleWhere: () => '', pageCutAllowed: () => false, removeMini: noop, sampleTransition: noop,
    clearReaderSummons: noop, syncWalkSentinel: noop, render: noop, kanjiCourseReferenceHelp: noop,
    CSS: { escape: value => value }, $: selector => selector === '.sheet' ? h.sheet : null,
  });
  vm.runInContext(['sheetDoorKey', 'findSheetDoor', 'rememberSheet', 'go', 'enterWord', 'recede',
    'keepNavigationReturn', 'returnFromNavigation', 'kanjiCourseNodeUnit', 'openKanjiCourseUnit',
    'kanjiCourseEntryNode'].map(declaration).join('\n'), c);
  return h;
}

test('F8 real go/rememberSheet/Back retains exact example node/token/scroll/control ID', async () => {
  const h = routeHarness(), example = data.examples[2], invoker = new Element('button');
  h.sheet.append(invoker);
  assert.equal(await h.context.openKanjiFamilyExample(example.reference, invoker), true);
  const parent = h.S.stack.at(-1);
  h.sheet.replaceChildren(); h.context.renderFamilyExampleNode(h.sheet, parent); h.context.activateKanjiFamily(h.sheet);
  const target = descendants(h.sheet).find(row => row.tagName === 'BUTTON');
  h.sheet.scrollTop = 219;
  await target.fire();
  assert.deepEqual(clone(h.S.stack.at(-1)), { t: 'word', id: '組織', reading: 'そしき' });
  assert.equal(parent.sheetScroll, 219);
  assert.deepEqual(clone(parent.returnFocus), { id: target.id });
  h.context.recede({ instant: true });
  assert.strictEqual(h.S.stack.at(-1), parent);
  assert.strictEqual(h.context.findSheetDoor(h.sheet, h.S.sheetReturnFocus), target);
  assert.equal(parent.familyExample.tokenIndex, example.tokenIndex);
  assert.equal(parent.id, example.reference.id);
  const different = data.examples[0];
  assert.notEqual(target.id, h.context.kanjiFamilyControlId(different.reference, `token-${different.tokenIndex}`));
});

test('F9 same-course example capsule preserves the attempt/draft and exact sourceState; ordinary resume stays ordinary', async () => {
  for (const withExample of [true, false]) {
    const h = routeHarness(), c = h.context, example = data.examples[2];
    const activeCourse = c.window.BunkiKanjiCourse;
    const run = activeCourse.createRun('shiki-shoku', realmValue(c,
      { sessionId: 'same-course', targets: ['reading'], mode: 'check' }));
    const visit = { unitId: 'shiki-shoku', epoch: 1, stage: 'check', index: 2, run,
      draft: 'そし', pending: false, feedback: null, hookOutcomes: { retained: { pending: true } }, referenceHelp: [] };
    h.S.kanjiCourse = visit;
    const invoker = new Element('button'); invoker.id = 'origin'; h.sheet.append(invoker);
    if (withExample) await c.openKanjiFamilyExample(example.reference, invoker);
    const word = { t: 'word', id: example.word.id, reading: example.word.reading };
    h.S.stack.push(word);
    const stack = h.S.stack, originalRun = clone(run), attempt = activeCourse.currentAttempt(run).attemptId;
    const sourceState = { sourceCaptureId: 'real-capture', sourceContextReturn: { id: 'return' }, sourceScroll: 42,
      publisherReceipt: { id: 'receipt' }, publisherContextReturn: { id: 'publisher-return' }, publisherScroll: 83 };
    Object.assign(h.S, sourceState);
    assert.equal(c.openKanjiCourseUnit(word, invoker), true);
    assert.strictEqual(h.S.kanjiCourse, visit); assert.equal(visit.draft, 'そし');
    assert.deepEqual(clone(visit.run), originalRun);
    assert.equal(activeCourse.currentAttempt(visit.run).attemptId, attempt);
    assert.deepEqual(visit.hookOutcomes, { retained: { pending: true } });
    assert.equal(h.S.stack.length, 0);
    if (withExample) {
      const frame = h.S.navigationReturns.at(-1);
      assert.strictEqual(frame.stack, stack);
      assert.deepEqual(clone(frame.kanjiCourseReturn.sourceState), sourceState);
      h.S.sourceCaptureId = 'unrelated';
      assert.equal(c.returnFromNavigation(), true);
      assert.strictEqual(h.S.stack, stack); assert.strictEqual(h.S.stack.at(-1), word);
      for (const [key, value] of Object.entries(sourceState)) assert.deepEqual(h.S[key], value);
    } else assert.equal(h.S.navigationReturns.length, 0);
  }
});

test('F7/F11 every actual family edge/word/other-host route opts out of adversarial context; same-host and ordinary paths retain theirs', async () => {
  const foreign = { sourceKind: 'imported', sourceId: 'unrelated-search', index: 17, sense: 'not-this-occurrence' };
  for (const id of ['戠', '織', '糸', '識']) {
    const view = navigation.view(ref('kanji', id));
    for (const row of [...view.phonetic, ...view.semantic, ...view.occurrences]) {
      const h = routeHarness();
      h.node.id = id; h.node.sourceContext = foreign; h.S.view = 'search'; h.S.navSourceContext = foreign;
      h.render(); h.mount();
      const door = descendants(h.sheet).find(value => value.dataset.familyEdge === row.edgeId);
      assert.ok(door, row.edgeId);
      const destination = navigation.destination(row.edgeId, view.reference);
      const before = h.S.stack.length;
      await door.fire();
      if (destination.kind === 'geometry' && destination.sameHost) {
        assert.equal(h.S.stack.length, before);
        assert.equal(h.node.kanjiOccurrenceId, destination.node.kanjiOccurrenceId);
        assert.strictEqual(h.node.sourceContext, foreign);
      } else {
        assert.equal(h.S.stack.length, before + 1);
        const opened = h.S.stack.at(-1);
        assert.equal(opened.sourceContext, undefined); assert.equal(opened.from, undefined);
        assert.equal(opened.id, destination.node.id);
        assert.equal(opened.kanjiOccurrenceId, destination.node.kanjiOccurrenceId);
      }
    }
    for (const row of view.words) {
      const h = routeHarness(); h.node.id = id; h.node.sourceContext = foreign;
      h.S.view = 'search'; h.S.navSourceContext = foreign; h.render(); h.mount();
      const door = descendants(h.sheet).find(value => value.id === h.context.kanjiFamilyControlId(row.word, 'entry'));
      assert.ok(door); await door.fire();
      assert.deepEqual(clone(h.S.stack.at(-1)), { t: 'word', id: row.word.id, reading: row.word.reading });
    }
  }
  const ordinary = routeHarness(); ordinary.node.sourceContext = foreign;
  ordinary.context.go({ t: 'word', id: '組織', reading: 'そしき' });
  assert.strictEqual(ordinary.S.stack.at(-1).sourceContext, foreign, 'ordinary default inheritance stays active');
  const h = routeHarness(), visit = { unitId: 'shiki-shoku', epoch: 1 };
  h.S.kanjiCourse = visit;
  h.S.navigationReturns.push({ destination: 'lessons', kanjiCourseReturn: { visit, epoch: 1,
    originNode: { t: 'word', id: '組織', reading: 'そしき', sourceContext: foreign } } });
  const target = course.getUnit('shiki-shoku').targets.find(row => row.wordKey === '組織');
  assert.strictEqual(h.context.kanjiCourseEntryNode(visit, target, 'word').sourceContext, foreign);
  const other = course.getUnit('shiki-shoku').targets.find(row => row.wordKey === '知識');
  assert.equal(h.context.kanjiCourseEntryNode(visit, other, 'word').sourceContext, undefined);
});

test('F11 pre-attachment fence removes revoked answer DOM; same-visit repaint and new-opening capture remain intact', async () => {
  function assertRevokedAtAppend(invalidate, sanitizer = declaration('sanitizeKanjiFamilyExposure')) {
    const h = surfaceHarness(); h.render(); h.mount();
    const section = h.sheet.querySelector('[data-kanji-family-surface]');
    const { panel } = h.context.kanjiFamilyExposures.get(section);
    assert.ok(panel.children.length > 0);
    assert.ok(panel.textContent.includes('知識'));
    assert.ok(panel.textContent.includes('ちしき'));
    h.sheet.isConnected = false; invalidate(h);
    let appended = false;
    h.context.wordSheetGesture = null;
    h.context.mountPageEffects = () => {};
    vm.runInContext(sanitizer, h.context);
    vm.runInContext(declaration('renderSheet'), h.context);
    h.context.renderSheet({ append(sheet) {
      assert.equal(panel.children.length, 0, 'revoked answer descendants are absent before attachment');
      assert.equal(panel.textContent, '', 'revoked panel has no raw answer text');
      assert.equal(sheet.textContent.includes('知識'), false);
      assert.equal(sheet.textContent.includes('ちしき'), false);
      assert.equal(visibleText(sheet).includes('知識'), false, 'answer is already hidden at attachment');
      appended = true;
    } }, { prebuilt: h.sheet });
    assert.equal(appended, true); assert.equal(h.captures.length, 0);
  }
  for (const invalidate of [h => { h.S.kanjiCourse = h.visit; },
    h => { h.context.recordEpoch++; }, h => { h.context.kanjiFamilyRuntime = { ...h.runtime }; }])
    assertRevokedAtAppend(invalidate);
  const actual = declaration('sanitizeKanjiFamilyExposure');
  const retainAnswers = actual.replace('exposure.panel.replaceChildren();', '');
  assert.notEqual(retainAnswers, actual);
  assert.throws(() => assertRevokedAtAppend(h => { h.S.kanjiCourse = h.visit; }, retainAnswers),
    { name: 'AssertionError', message: /revoked answer descendants are absent before attachment/u },
    'the former hidden-only fence fails the raw DOM boundary even when visibleText claims it is hidden');
  const h = surfaceHarness({ live: true }); h.render(); h.mount();
  await disclosure(h.sheet).fire();
  const section = h.sheet.querySelector('[data-kanji-family-surface]');
  const { panel } = h.context.kanjiFamilyExposures.get(section);
  const acknowledgedChildren = [...panel.children];
  h.context.sanitizeKanjiFamilyExposure(h.sheet);
  assert.deepEqual(panel.children, acknowledgedChildren, 'same-visit acknowledged children are retained');
  assert.ok(panel.textContent.includes('ちしき'));
  assert.ok(visibleText(h.sheet).includes('知識')); assert.equal(h.captures.length, 1);
  h.S.kanjiCourse = { ...h.visit, run: {} };
  h.context.sanitizeKanjiFamilyExposure(h.sheet);
  assert.equal(panel.children.length, 0);
  assert.equal(panel.textContent, '');
  assert.equal(visibleText(h.sheet).includes('知識'), false);
  h.context.activateKanjiFamily(h.sheet);
  assert.equal(h.captures.length, 1, 'revocation repaint does not capture');
  await disclosure(h.sheet).fire();
  assert.ok(h.sheet.textContent.includes('ちしき'));
  assert.equal(h.captures.length, 2, 'a new opening captures after the revoked facts were removed');
});

test('F7/F11 actual sentence/header branches suppress only family capture, ladder, encounter and prose paths', () => {
  const h = surfaceHarness(), c = h.context;
  const calls = { ladder: 0, source: 0, save: 0, prose: 0, encounter: 0, teacher: 0 };
  const noop = () => {};
  h.S.taken = [];
  Object.assign(c, {
    D: { passages: [] }, NODE_KIND: { word: true, kanji: true }, SEARCH_SVG: '',
    nodeTitle: node => node.id || 'sentence', scaleThread: () => null, withEn: node => node,
    personalHost: null, referenceLibrary: null, maintenanceReports: false,
    sentenceSource: () => { calls.source++; return null; }, tapLadderHint: () => 'normal ladder hint',
    renderSentenceTokens: () => { calls.ladder++; },
    enhanceJapaneseProse: () => { calls.prose++; }, renderEncounterTrail: () => { calls.encounter++; },
    renderTeacherDoor: () => { calls.teacher++; }, renderLearningSource: noop,
    wordCaptureState: () => 'available', paintWordSave: noop,
    saveOne: () => { calls.save++; return new Element('button', 'sheet-take'); },
  });
  vm.runInContext(['renderSentenceNode', 'composePage', 'buildPage'].map(declaration).join('\n'), c);
  const tokens = [{ s: '組織', b: '組織', r: 'そしき' }];
  const familyNode = { t: 'sent', id: data.examples[2].reference.id, familyExample: {
    reference: data.examples[2].reference, word: data.examples[2].word, tokenIndex: data.examples[2].tokenIndex },
    tokens, target: '組織', targetOffset: 0, sourceContext: { sourceId: 'adversarial' } };
  h.S.stack = [familyNode];
  const page = c.buildPage(familyNode);
  assert.ok(page.querySelector('#sheet-back'));
  assert.deepEqual(calls, { ladder: 0, source: 0, save: 0, prose: 0, encounter: 0, teacher: 0 });
  const ordinary = { t: 'sent', tokens, target: '組織', passage: null };
  h.S.stack = [ordinary]; c.buildPage(ordinary);
  assert.equal(calls.ladder, 1); assert.equal(calls.source, 1); assert.equal(calls.save, 1);
  assert.equal(calls.prose, 1); assert.equal(calls.encounter, 1);
});

test('F10 existing teaching/reference/ON act/enterWord callers retain their sync and promised behavior', async () => {
  for (const status of ['kept', 'held', 'refused', 'cancelled']) {
    for (const on of [false, true]) {
      const h = assistanceHarness({ journey: on }), visit = freshAttempt(h, 'meaning', '職');
      const pending = deferred(); let applied = 0;
      h.context.kanjiCourseRememberHelp = () => on ? pending.promise : { status };
      h.context.kanjiCourseApplyHelp = () => { applied++; };
      const target = h.course.getUnit('shiki-shoku').targets[0];
      const teaching = h.context.kanjiCourseTeachingHelp(visit, target);
      const reference = h.context.kanjiCourseReferenceHelp(visit, realmValue(h.context, { t: 'kanji', id: '職' }));
      assert.equal(typeof teaching?.then === 'function', on);
      assert.equal(typeof reference?.then === 'function', on);
      assert.equal(applied, on ? 0 : 1);
      pending.resolve({ status }); await reference;
      assert.equal(applied, 1, 'old reference caller still ignores the new status value');
      if (on) {
        h.context.kanjiJourneyFor = () => null;
        vm.runInContext(declaration('kanjiJourneyAct'), h.context);
        const result = await h.context.kanjiJourneyAct(visit, 'answer', h.course.currentPrompt(visit.run).acceptedAnswers[0]);
        assert.equal(result.status, 'correct', 'old ON act continues to return the course result');
      }
    }
    const h = routeHarness(), pending = deferred(), child = { t: 'word', id: '組織', reading: 'そしき' };
    h.context.kanjiCourseReferenceHelp = () => pending.promise;
    h.context.enterWord(child, { instant: true });
    assert.equal(h.S.stack.length, 1, 'ON dictionary waits for existing helper');
    pending.resolve({ status }); await flush();
    assert.strictEqual(h.S.stack.at(-1), child, 'old dictionary still displays on its existing settled-help path');
    const stale = routeHarness(), waiting = deferred();
    stale.context.kanjiCourseReferenceHelp = () => waiting.promise;
    stale.context.enterWord(child, { instant: true }); stale.S.navigationDepartures++;
    waiting.resolve({ status }); await flush();
    assert.equal(stale.S.stack.length, 1, 'existing late callback guard remains active');
  }
});

test('F9/F10 executed OFF-thenable, false/late-held, and unconditional-stack-clear mutants violate live contracts', async () => {
  const offShape = mutant => {
    const h = assistanceHarness(), visit = freshAttempt(h, 'meaning', '職');
    if (mutant) vm.runInContext(`{
      const original = kanjiCourseRememberHelp;
      kanjiCourseRememberHelp = (...args) => Promise.resolve(original(...args));
    }`, h.context);
    const result = h.context.kanjiCourseRememberHelp(visit, realmValue(h.context, [{
      what: 'family-reference', about: { kind: 'kanji', literal: '職' }, reveals: ['meaning'], at: 1000,
    }]));
    assert.equal(visit.reviewLedger.exposure.length, 1, 'the real helper still performs the same accepted capture');
    assert.equal(typeof result?.then, 'undefined', 'OFF must be synchronous/plain for existing callers');
  };
  offShape(false);
  assert.throws(() => offShape(true), assert.AssertionError, 'executed OFF-thenable mutant is killed');

  const falseLateDisclosure = async mutant => {
    const j = journeyHarness({ shown: { accepted: false, display: false, late: true },
      hold: { display: false, late: true } });
    if (mutant) {
      const actual = declaration('kanjiJourneyRemember');
      const correct = "return result?.display === true && result?.held === true ? 'held' : refused();";
      assert.ok(actual.includes(correct), 'locate the actual lifecycle hold-result mapping');
      vm.runInContext(actual.replace(correct, "return 'held';"), j.context);
    }
    const h = surfaceHarness({ live: true });
    h.context.kanjiCourseRememberHelp = () => j.context.kanjiJourneyRemember(j.visit, []);
    h.render(); h.mount(); await disclosure(h.sheet).fire();
    assert.equal(j.holds, 1, 'the actual inner false/late result reaches the outer lifecycle hold');
    assert.equal(visibleText(h.sheet).includes('知識'), false, 'false/late lifecycle results cannot reveal answers');
  };
  await falseLateDisclosure(false);
  await assert.rejects(() => falseLateDisclosure(true), assert.AssertionError,
    'executed false/late-as-held mutant is killed by the actual disclosure renderer');

  const returnCapsule = async mutant => {
    const h = routeHarness(), c = h.context, example = data.examples[2];
    const activeCourse = c.window.BunkiKanjiCourse;
    h.S.kanjiCourse = { unitId: 'shiki-shoku', epoch: 1, stage: 'check', index: 0, pending: false,
      run: activeCourse.createRun('shiki-shoku', realmValue(c, { sessionId: 'stack-mutant', targets: ['reading'] })), draft: 'そし' };
    const invoker = new Element('button'); h.sheet.append(invoker);
    assert.equal(await c.openKanjiFamilyExample(example.reference, invoker), true);
    const word = { t: 'word', id: example.word.id, reading: example.word.reading };
    h.S.stack.push(word);
    const originalStack = h.S.stack;
    if (mutant) {
      const actual = declaration('openKanjiCourseUnit');
      const exception = '!(S.stack.some((entry) => entry.familyExample) && kanjiFamilyHasExampleOrigin())';
      assert.ok(actual.includes(exception), 'locate the actual same-course example exception');
      vm.runInContext(actual.replace(exception, 'true'), c);
    }
    assert.equal(c.openKanjiCourseUnit(word, invoker), true);
    const capsule = h.S.navigationReturns.at(-1);
    assert.ok(capsule?.kanjiCourseReturn, 'same-course example origin keeps its return capsule');
    assert.strictEqual(capsule.stack, originalStack);
  };
  await returnCapsule(false);
  await assert.rejects(() => returnCapsule(true), assert.AssertionError,
    'executed old unconditional stack-clear mutant is killed');
});
