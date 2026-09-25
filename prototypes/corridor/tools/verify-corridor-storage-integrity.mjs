#!/usr/bin/env node
/** Executes legacy input validation and current pure/async application policies.
 * Native durability, ownership and browser UI acceptance live in the mandatory
 * RecordApp, record-live, learning-record and drift-record browser suites. */
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import * as fsrs from '../vendor/ts-fsrs.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const corridorPath = fileURLToPath(new URL('../corridor.js', import.meta.url));
const source = readFileSync(corridorPath, 'utf8');
const PIN = JSON.parse(readFileSync(new URL('../data/fsrs-pin.json', import.meta.url), 'utf8'));
const css = readFileSync(new URL('../corridor.css', import.meta.url), 'utf8');
const driftCss = readFileSync(new URL('../drift-layer.css', import.meta.url), 'utf8');
const checks = [];
const failures = [];
const observations = {};
function verified(name, body) {
  try { body(); checks.push(name); }
  catch (error) { failures.push({ name, reason: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
}
async function verifiedAsync(name, body) {
  try { await body(); checks.push(name); }
  catch (error) { failures.push({ name, reason: error.stack }); console.error('FAIL ' + name + ': ' + error.message); }
}
const ast = ts.createSourceFile('corridor.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function definitions(...names) {
  const found = ast.statements.filter((statement) => {
    const declared = ts.isFunctionDeclaration(statement) ? [statement.name?.text] :
      ts.isVariableStatement(statement) ? statement.declarationList.declarations.map((node) => node.name.getText(ast)) : [];
    return declared.some((name) => names.includes(name));
  });
  assert.equal(found.length, names.length, 'Every requested definition comes from the authored application');
  return found.map((statement) => statement.getText(ast)).join('\n');
}


function betweenIn(text, start, end) {
  const from = text.indexOf(start);
  assert.notEqual(from, -1, `missing source marker: ${start}`);
  const to = text.indexOf(end, from);
  assert.notEqual(to, -1, `missing source marker: ${end}`);
  return text.slice(from, to);
}

function between(start, end) {
  return betweenIn(source, start, end);
}

function state(overrides = {}) {
  return {
    storeReadOnly: false,
    storeError: null,
    storeExtras: { futureField: { keep: true } },
    view: 'drift',
    focus: null,
    taken: [{ t: 'word', id: 'old' }],
    lists: {},
    srs: {},
    revlog: [],
    obslog: [],
    deepWords: {},
    lessonsDone: {},
    aiReading: null,
    aiReadings: [],
    suspended: {},
    aiChat: [],
    ai: {},
    aiQuiz: null,
    stats: {},
    srsPrefs: { newPerDay: 20, reviewLimit: 20 },
    readDone: {},
    readerPos: {},
    dials: { kanji: 0, furigana: 1, spacing: 0 },
    dialsStored: { kanji: 0, furigana: 1, spacing: 0 },
    dialsUrlOverride: false,
    ...overrides,
  };
}

function storage(value = null) {
  return {
    value,
    getError: null,
    setError: null,
    writes: 0,
    attempts: 0,
    onSet: null,
    getItem() {
      if (this.getError) throw this.getError;
      return this.value;
    },
    setItem(_key, next) {
      this.attempts += 1;
      if (this.setError) throw this.setError;
      if (this.onSet) this.onSet(next);
      this.value = next;
      this.writes += 1;
    },
  };
}

class FakeStyle {
  values = new Map();

  setProperty(name, value) {
    this.values.set(name, value);
  }
}

class FakeElement {
  constructor(tag, owner) {
    this.tagName = tag.toUpperCase();
    this.owner = owner;
    this.attributes = new Map();
    this.dataset = {};
    this.children = [];
    this.hidden = false;
    this.isConnected = false;
    this.style = new FakeStyle();
    this.textWrites = 0;
    this._text = '';
    this.id = '';
    this.className = '';
  }

  set textContent(value) {
    this._text = value;
    this.textWrites += 1;
  }

  get textContent() {
    return this._text;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener() {}

  append(child) {
    if (typeof child === 'string') return;
    child.isConnected = true;
    this.children.push(child);
    if (child.id) this.owner.byId.set(child.id, child);
  }

  getBoundingClientRect() {
    return { width: 0, height: 0, bottom: 0 };
  }
}

function fakeDocument() {
  const document = {
    byId: new Map(),
    throwOnQuery: false,
    createElement(tag) {
      return new FakeElement(tag, document);
    },
    getElementById(id) {
      return document.byId.get(id) || null;
    },
    querySelectorAll() {
      if (document.throwOnQuery) throw new Error('layout unavailable');
      return [];
    },
  };
  document.body = new FakeElement('body', document);
  document.body.isConnected = true;
  return document;
}



// This is the real legacy decoder/hydrator, read-only migration-input work.
// It deliberately excludes removed saveStore/writeStore and all active host code.
const legacySchemaBlock = between("const STORE_KEY = 'kairo-corridor-v1';", '// Only acknowledged changed roots') + '\n' + definitions('storeEnvelope');
const document = fakeDocument();
const storeContext = vm.createContext({ S: state(), document, localStorage: storage(),
  tx: (_ja, en) => en, window: {}, crypto: webcrypto, recordWritable: () => false });
vm.runInContext(legacySchemaBlock + '\n;globalThis.__storeApi = { loadStore, hydrateStore, storeEnvelope, syncStoreAlert, safelySyncStoreAlert, validStoreEnvelope, setOwnRecordValue, srsParamsProblem, FSRS_WEIGHT_BOUNDS };', storeContext);
const storeApi = storeContext.__storeApi;


verified('read-exception-quarantine-and-global-alert', () => {
  storeContext.S = state({ view: 'drift' });
  storeContext.localStorage = storage('{"v":1,"taken":[{"id":"durable"}]}');
  storeContext.localStorage.getError = new Error('blocked');
  storeApi.loadStore();
  assert.equal(storeContext.S.storeReadOnly, true);
  assert.match(storeContext.S.storeError, /could not be accessed/);
  assert.equal(storeContext.localStorage.writes, 0);
  const alert = document.getElementById('store-alert');
  assert.ok(alert);
  assert.strictEqual(alert.owner, document);
  assert.ok(document.body.children.includes(alert));
  assert.equal(alert.getAttribute('role'), 'alert');
  assert.equal(alert.getAttribute('aria-atomic'), 'true');
  assert.equal(alert.hidden, false);
  assert.equal(alert.textContent, storeContext.S.storeError);
});

verified('empty-malformed-future-bytes-quarantine', () => {
  for (const raw of ['', '{broken', '{"v":3,"taken":[]}']) {
    storeContext.S = state();
    storeContext.localStorage = storage(raw);
    storeApi.loadStore();
    assert.equal(storeContext.S.storeReadOnly, true, `expected quarantine for ${JSON.stringify(raw)}`);
    assert.equal(storeContext.localStorage.value, raw);
    assert.equal(storeContext.localStorage.writes, 0);
  }
});

verified('complete-valid-envelope-hydrates-only-after-validation', () => {
  const validEnvelope = {
    v: 1,
    taken: [
      {
        t: 'word',
        id: '海',
        label: '海',
        ts: 10,
        started: 10,
        from: { passage: 'p', index: 2 },
        ctx: { p: 'p', i: 2, scope: 'sent' },
        entrySeq: '1',
        cueReading: 'うみ',
      },
      { t: 'word', id: '波', label: '波', ts: 11 },
    ],
    lists: { 海辺: [{ t: 'word', id: '海', label: '海', ts: 10 }] },
    srs: {
      'word:海': {
        due: '2026-08-16T00:00:00.000Z',
        last_review: '2026-08-15T00:00:00.000Z',
        stability: 1,
        difficulty: 2,
        elapsed_days: 1,
        scheduled_days: 1,
        reps: 1,
        lapses: 0,
        learning_steps: 0,
        state: 2,
      },
    },
    revlog: [
      [10, 'word:海', 3, 2, 1, 0.9, 1, 2, 2, 3, 1, 20],
      [11, 'word:海', 0, 0],
    ],
    obslog: [
      [10, 'tap', 'word:海', 1, 'article'],
      [11, 'probe', 'word:海', 3, 0],
      [12, 'drift', 'word:海', 1],
      [13, 'dojo', 'word:海', 0],
      [14, 'dojo', 'kanji:海', 3, 'kanji'],
      [15, 'params', 'fsrs', 'length'],
      [15, 'reveal', 'word:海', 1],
      [16, 'reveal', 'word:海', 0],
      [17, 'lesson', 'word:海', 3, 'N5-1'],
      [18, 'lesson', 'word:海', 1, 'N5-1'],
      [19, 'dojo', 'word:海', 3, 'due'],
    ],
    deepWords: { 海: { r: 'うみ', m: ['sea'], jlpt: 'N5', k: ['海'], seq: '1' } },
    lessonsDone: { lesson: { score: 1, total: 1, ts: 10 } },
    aiReading: null,
    aiReadings: [{ text: '海へ行く。', lv: 'N5', ts: 10 }],
    suspended: { 'word:波': 10 },
    aiChat: [{ role: 'user', text: '海' }],
    ai: { baseUrl: 'https://example.invalid', model: 'test-model' },
    aiQuiz: {
      qs: [
        { q: '問一', opts: ['a', 'b', 'c', 'd'], right: 0, why: 'one' },
        { q: '問二', opts: ['a', 'b', 'c', 'd'], right: 1, why: 'two' },
        { q: '問三', opts: ['a', 'b', 'c', 'd'], right: 3, why: 'three' },
      ],
      ix: 3,
      picked: null,
      correct: 2,
      ts: 10,
    },
    stats: { lastExportTs: 10, fuzzOff: false, '2026-08-15': { n: 1, again: 0, nnew: 1 } },
    srsPrefs: {
      newPerDay: 35,
      reviewLimit: 45,
      fsrs: { w: PIN.w, source: 'bunki-fsrs6-r090-personal-v1 @ 2026-08-16', basedOnReviews: 500 },
    },
    readDone: { article: 10 },
    readerPos: { article: 120 },
    dials: { kanji: 0, furigana: 1, spacing: 2 },
    futureField: { nested: ['preserved', 1, true] },
  };
  storeContext.S = state();
  storeContext.localStorage = storage(JSON.stringify(validEnvelope));
  storeApi.loadStore();
  assert.equal(storeContext.S.storeReadOnly, false);
  assert.equal(storeContext.S.taken[0].id, '海');
  assert.equal(storeContext.S.taken[0].started, 10);
  // a row without the promotion mark hydrates as-is — nothing fabricates one
  assert.equal(Object.hasOwn(storeContext.S.taken[1], 'started'), false);
  assert.equal(storeContext.S.srs['word:海'].state, 2);
  assert.equal(storeContext.S.ai.baseUrl, 'https://example.invalid');
  assert.equal(storeContext.S.ai.model, 'test-model');
  // POL-13 · a persisted quiz run — the score screen included — hydrates whole
  assert.equal(storeContext.S.aiQuiz.ix, 3);
  assert.equal(storeContext.S.aiQuiz.qs.length, 3);
  assert.equal(storeContext.S.aiQuiz.correct, 2);
  assert.equal(storeContext.S.srsPrefs.newPerDay, 35);
  assert.equal(storeContext.S.srsPrefs.reviewLimit, 45);
  // R3-D · the learner's fitted weights hydrate VERBATIM alongside pacing
  assert.equal(storeContext.S.srsPrefs.fsrs.w.length, 21);
  assert.equal(storeContext.S.srsPrefs.fsrs.basedOnReviews, 500);
  assert.equal(storeContext.S.storeExtras.futureField.nested[0], 'preserved');
  assert.equal(storeContext.localStorage.writes, 0);
});

verified('every-known-root-and-version-shape-fails-closed', () => {
  const quizQ = () => ({ q: '問', opts: ['a', 'b', 'c', 'd'], right: 0, why: 'w' });
  const quizRun = (over = {}) => ({
    qs: [quizQ(), quizQ(), quizQ()],
    ix: 0,
    picked: null,
    correct: 0,
    ...over,
  });
  const validCard = {
    due: '2026-08-16T00:00:00.000Z',
    last_review: '2026-08-15T00:00:00.000Z',
    stability: 1,
    difficulty: 2,
    elapsed_days: 1,
    scheduled_days: 1,
    reps: 1,
    lapses: 0,
    learning_steps: 0,
    state: 2,
  };
  const invalidEnvelopes = [
    ['missing version', {}],
    ['string version', { v: '1' }],
    ['fractional version', { v: 1.5 }],
    ['null version', { v: null }],
    ['old unsupported version', { v: 0 }],
    ['taken root', { v: 1, taken: {} }],
    ['taken item', { v: 1, taken: [null] }],
    ['taken nested id', { v: 1, taken: [{ t: 'word', id: [] }] }],
    ['taken nested type', { v: 1, taken: [{ t: 'unknown', id: '海' }] }],
    [
      'taken nested source passage',
      { v: 1, taken: [{ t: 'word', id: '海', from: { passage: [], index: 2 } }] },
    ],
    [
      'taken nested source index',
      { v: 1, taken: [{ t: 'word', id: '海', from: { passage: 'p', index: '2' } }] },
    ],
    ['taken nested context', { v: 1, taken: [{ t: 'word', id: '海', ctx: [] }] }],
    [
      'taken nested context passage',
      { v: 1, taken: [{ t: 'word', id: '海', ctx: { p: [], i: 2, scope: 'sent' } }] },
    ],
    [
      'taken nested context index',
      { v: 1, taken: [{ t: 'word', id: '海', ctx: { p: 'p', i: '2', scope: 'sent' } }] },
    ],
    [
      'taken nested context scope',
      { v: 1, taken: [{ t: 'word', id: '海', ctx: { p: 'p', i: 2, scope: 7 } }] },
    ],
    ['taken nested entry sequence', { v: 1, taken: [{ t: 'word', id: '海', entrySeq: [] }] }],
    ['taken nested cue reading', { v: 1, taken: [{ t: 'word', id: '海', cueReading: {} }] }],
    ['taken started mark type', { v: 1, taken: [{ t: 'word', id: '海', started: 'now' }] }],
    ['taken started mark non-finite', { v: 1, taken: [{ t: 'word', id: '海', started: null }] }],
    ['lists root', { v: 1, lists: [] }],
    ['lists nested collection', { v: 1, lists: { x: {} } }],
    ['lists nested item', { v: 1, lists: { x: [{ t: 'word', id: null }] } }],
    ['srs root', { v: 1, srs: [] }],
    ['srs nested card', { v: 1, srs: { x: [] } }],
    ['srs nested due', { v: 1, srs: { x: { due: [] } } }],
    ['srs invalid instant', { v: 1, srs: { x: { due: 'not-a-date' } } }],
    ['srs missing required state', { v: 1, srs: { x: { ...validCard, state: undefined } } }],
    ['srs nested state range', { v: 1, srs: { x: { ...validCard, state: 999 } } }],
    ['srs nested state type', { v: 1, srs: { x: { ...validCard, state: '2' } } }],
    [
      'srs nested learning steps',
      { v: 1, srs: { x: { ...validCard, learning_steps: 'oops' } } },
    ],
    ['srs missing required counter', { v: 1, srs: { x: { ...validCard, reps: undefined } } }],
    ['revlog root', { v: 1, revlog: {} }],
    ['revlog nested row', { v: 1, revlog: [null] }],
    ['revlog nested grade', { v: 1, revlog: [[1, 'word:海', 9, 0]] }],
    ['revlog short grade row', { v: 1, revlog: [[1, 'word:海', 1, 0]] }],
    [
      'revlog arbitrary grade tail',
      { v: 1, revlog: [[1, 'word:海', 1, 0, 'arbitrary', null, null, null, 1, 2, 1, 2]] },
    ],
    ['revlog malformed undo index', { v: 1, revlog: [[1, 'word:海', 0, '0']] }],
    ['obslog root', { v: 1, obslog: {} }],
    ['obslog nested row', { v: 1, obslog: [null] }],
    ['obslog nested kind', { v: 1, obslog: [[1, [], 'word:海']] }],
    ['obslog unknown kind', { v: 1, obslog: [[1, 'unknown', 'word:海', 1]] }],
    ['obslog malformed tap', { v: 1, obslog: [[1, 'tap', 'word:海', 9, 'article']] }],
    ['obslog malformed probe', { v: 1, obslog: [[1, 'probe', 'word:海', 3, 2]] }],
    ['obslog malformed drift judgment', { v: 1, obslog: [[1, 'drift', 'word:海', 2]] }],
    ['obslog malformed drift arity', { v: 1, obslog: [[1, 'drift', 'word:海', 3, 'extra']] }],
    ['obslog malformed dojo grade', { v: 1, obslog: [[1, 'dojo', 'kanji:海', 9]] }],
    ['obslog malformed dojo mode', { v: 1, obslog: [[1, 'dojo', 'kanji:海', 3, 42]] }],
    ['obslog overlong dojo row', { v: 1, obslog: [[1, 'dojo', 'kanji:海', 3, 'kanji', 'extra']] }],
    ['obslog params off-key', { v: 1, obslog: [[1, 'params', 'other', 'length']] }],
    ['obslog params reason type', { v: 1, obslog: [[1, 'params', 'fsrs', 7]] }],
    ['obslog overlong params row', { v: 1, obslog: [[1, 'params', 'fsrs', 'length', 'extra']] }],
    ['obslog malformed reveal declaration', { v: 1, obslog: [[1, 'reveal', 'word:海', 2]] }],
    ['obslog non-integer reveal declaration', { v: 1, obslog: [[1, 'reveal', 'word:海', '1']] }],
    ['obslog short reveal row', { v: 1, obslog: [[1, 'reveal', 'word:海']] }],
    ['obslog overlong reveal row', { v: 1, obslog: [[1, 'reveal', 'word:海', 1, 'extra']] }],
    ['obslog malformed lesson grade', { v: 1, obslog: [[1, 'lesson', 'word:海', 2, 'N5-1']] }],
    ['obslog short lesson row', { v: 1, obslog: [[1, 'lesson', 'word:海', 3]] }],
    ['obslog lesson id type', { v: 1, obslog: [[1, 'lesson', 'word:海', 3, 42]] }],
    ['obslog lesson id empty', { v: 1, obslog: [[1, 'lesson', 'word:海', 3, '']] }],
    ['obslog overlong lesson row', { v: 1, obslog: [[1, 'lesson', 'word:海', 3, 'N5-1', 'extra']] }],
    ['deepWords root', { v: 1, deepWords: [] }],
    ['deepWords nested record', { v: 1, deepWords: { 海: [] } }],
    ['deepWords nested meaning', { v: 1, deepWords: { 海: { m: [1] } } }],
    ['lessonsDone root', { v: 1, lessonsDone: [] }],
    ['lessonsDone nested result', { v: 1, lessonsDone: { lesson: [] } }],
    ['lessonsDone nested score', { v: 1, lessonsDone: { lesson: { score: 'one' } } }],
    ['aiReading root', { v: 1, aiReading: [] }],
    ['aiReading nested text', { v: 1, aiReading: { text: 1 } }],
    ['aiReadings root', { v: 1, aiReadings: {} }],
    ['aiReadings nested item', { v: 1, aiReadings: [null] }],
    ['suspended root', { v: 1, suspended: [] }],
    ['suspended nested timestamp', { v: 1, suspended: { x: 'now' } }],
    ['aiChat root', { v: 1, aiChat: {} }],
    ['aiChat nested turn', { v: 1, aiChat: [null] }],
    ['aiChat nested role', { v: 1, aiChat: [{ role: [], text: '' }] }],
    ['ai root', { v: 1, ai: [] }],
    ['ai nested baseUrl', { v: 1, ai: { baseUrl: 1 } }],
    ['ai nested model', { v: 1, ai: { model: '' } }],
    ['aiQuiz root', { v: 1, aiQuiz: [] }],
    ['aiQuiz missing questions', { v: 1, aiQuiz: { ix: 0, picked: null, correct: 0 } }],
    ['aiQuiz too few questions', { v: 1, aiQuiz: quizRun({ qs: [quizQ(), quizQ()] }) }],
    [
      'aiQuiz too many questions',
      { v: 1, aiQuiz: quizRun({ qs: [quizQ(), quizQ(), quizQ(), quizQ(), quizQ(), quizQ()] }) },
    ],
    ['aiQuiz question shape', { v: 1, aiQuiz: quizRun({ qs: [null, quizQ(), quizQ()] }) }],
    [
      'aiQuiz question option count',
      { v: 1, aiQuiz: quizRun({ qs: [{ ...quizQ(), opts: ['a', 'b', 'c'] }, quizQ(), quizQ()] }) },
    ],
    [
      'aiQuiz question option type',
      { v: 1, aiQuiz: quizRun({ qs: [{ ...quizQ(), opts: [1, 'b', 'c', 'd'] }, quizQ(), quizQ()] }) },
    ],
    [
      'aiQuiz question right index',
      { v: 1, aiQuiz: quizRun({ qs: [{ ...quizQ(), right: 4 }, quizQ(), quizQ()] }) },
    ],
    ['aiQuiz cursor type', { v: 1, aiQuiz: quizRun({ ix: '0' }) }],
    ['aiQuiz cursor past the end', { v: 1, aiQuiz: quizRun({ ix: 4 }) }],
    ['aiQuiz picked range', { v: 1, aiQuiz: quizRun({ picked: 4 }) }],
    ['aiQuiz picked type', { v: 1, aiQuiz: quizRun({ picked: '1' }) }],
    ['aiQuiz correct range', { v: 1, aiQuiz: quizRun({ correct: 4 }) }],
    ['aiQuiz timestamp type', { v: 1, aiQuiz: quizRun({ ts: 'now' }) }],
    ['stats root', { v: 1, stats: [] }],
    ['stats nested day', { v: 1, stats: { day: [] } }],
    ['stats nested count', { v: 1, stats: { day: { n: 'one' } } }],
    ['srsPrefs root', { v: 1, srsPrefs: [] }],
    ['srsPrefs newPerDay type', { v: 1, srsPrefs: { newPerDay: '20' } }],
    ['srsPrefs newPerDay fractional', { v: 1, srsPrefs: { newPerDay: 12.5 } }],
    ['srsPrefs newPerDay below range', { v: 1, srsPrefs: { newPerDay: -1 } }],
    ['srsPrefs newPerDay above range', { v: 1, srsPrefs: { newPerDay: 51 } }],
    ['srsPrefs reviewLimit type', { v: 1, srsPrefs: { reviewLimit: null } }],
    ['srsPrefs reviewLimit below range', { v: 1, srsPrefs: { reviewLimit: 4 } }],
    ['srsPrefs reviewLimit above range', { v: 1, srsPrefs: { reviewLimit: 101 } }],
    ['readDone root', { v: 1, readDone: [] }],
    ['readDone nested timestamp', { v: 1, readDone: { article: 'now' } }],
    ['readerPos root', { v: 1, readerPos: [] }],
    ['readerPos nested offset', { v: 1, readerPos: { article: '120' } }],
    ['dials root', { v: 1, dials: [] }],
    ['dials nested range', { v: 1, dials: { kanji: 3 } }],
    ['dials nested type', { v: 1, dials: { furigana: '1' } }],
  ];
  const rawCanaries = [['non-finite nested number', '{"v":1,"futureField":{"n":1e999}}']];
  for (const [name, envelope] of invalidEnvelopes) rawCanaries.push([name, JSON.stringify(envelope)]);
  observations.malformedLegacyCanaries = rawCanaries.length;

  const learnerRoots = Object.keys(state()).filter(
    (key) => !['storeReadOnly', 'storeError', 'view', 'focus'].includes(key),
  );
  for (const [name, raw] of rawCanaries) {
    storeContext.S = state();
    const rootsBefore = Object.fromEntries(learnerRoots.map((key) => [key, storeContext.S[key]]));
    storeContext.localStorage = storage(raw);
    storeApi.loadStore();
    assert.equal(storeContext.S.storeReadOnly, true, name);
    assert.match(storeContext.S.storeError, /invalid data/, name);
    assert.equal(storeContext.localStorage.value, raw, name);
    assert.equal(storeContext.localStorage.writes, 0, name);
    for (const key of learnerRoots) assert.strictEqual(storeContext.S[key], rootsBefore[key], `${name}: ${key}`);
  }
});

verified('reserved-map-names-round-trip-without-pollution-or-data-loss', () => {
  const reservedNames = ['__proto__', 'constructor', 'prototype'];
  const pollutionBefore = Object.prototype.bunkiPolluted;
  const vmPollutionBefore = vm.runInContext('Object.prototype.bunkiPolluted', storeContext);
  for (const name of reservedNames) {
    storeContext.S = state({ lists: {}, storeExtras: {} });
    storeContext.localStorage = storage('{"durable":"before"}');
    const item = { t: 'word', id: `reserved-${name}`, label: name, ts: 10 };
    storeApi.setOwnRecordValue(storeContext.S.lists, name, [item]);
    storeContext.S.storeExtras = JSON.parse(
      `{"${name}":{"topLevel":true},"futureField":{"${name}":{"bunkiPolluted":"${name}"}}}`,
    );

    const bytes = JSON.stringify(storeApi.storeEnvelope(storeContext.S));
    const durable = JSON.parse(bytes);
    assert.equal(storeApi.validStoreEnvelope(durable), true, name);
    assert.equal(storeContext.localStorage.attempts, 0, 'Serialization never writes the legacy source');
    assert.equal(Object.hasOwn(durable.lists, name), true, name);
    assert.equal(durable.lists[name][0].id, `reserved-${name}`, name);
    assert.equal(Object.hasOwn(durable, name), true, name);
    assert.equal(Object.hasOwn(durable.futureField, name), true, name);
    assert.equal(Object.prototype.bunkiPolluted, pollutionBefore, name);
    assert.equal(
      vm.runInContext('Object.prototype.bunkiPolluted', storeContext),
      vmPollutionBefore,
      name,
    );

    const roundTripStorage = storage(bytes);
    storeContext.S = state({ lists: {}, storeExtras: {} });
    storeContext.localStorage = roundTripStorage;
    storeApi.loadStore();
    assert.equal(storeContext.S.storeReadOnly, false, name);
    assert.equal(Object.hasOwn(storeContext.S.lists, name), true, name);
    assert.equal(storeContext.S.lists[name][0].id, `reserved-${name}`, name);
    assert.equal(Object.hasOwn(storeContext.S.storeExtras, name), true, name);
    assert.equal(Object.hasOwn(storeContext.S.storeExtras.futureField, name), true, name);
    assert.equal(Object.prototype.bunkiPolluted, pollutionBefore, name);
    assert.equal(
      vm.runInContext('Object.getPrototypeOf(S.lists) === Object.prototype', storeContext),
      true,
      name,
    );
    assert.equal(
      vm.runInContext('Object.prototype.bunkiPolluted', storeContext),
      vmPollutionBefore,
      name,
    );
  }

  const alteredPrototype = vm.runInContext(
    `(() => {
      const lists = {};
      Object.setPrototypeOf(lists, { bunkiPolluted: true });
      return { v: 1, lists };
    })()`,
    storeContext,
  );
  assert.equal(storeApi.validStoreEnvelope(alteredPrototype), false);
  assert.equal(Object.prototype.bunkiPolluted, pollutionBefore);
  assert.equal(vm.runInContext('Object.prototype.bunkiPolluted', storeContext), vmPollutionBefore);

});

verified('invalid-candidate-fails-the-schema-before-hydration', () => {
  const candidate = storeApi.storeEnvelope(state({ lists: { malformed: {} } }));
  assert.equal(storeApi.validStoreEnvelope(JSON.parse(JSON.stringify(candidate))), false);
});

verified('stable-alert-node-no-repeat-announcement', () => {
  const alert = document.getElementById('store-alert');
  storeContext.S.view = 'tray';
  storeContext.S.storeError = 'Synthetic repeated warning';
  storeApi.syncStoreAlert();
  const writesBefore = alert.textWrites;
  assert.strictEqual(storeApi.syncStoreAlert(), alert);
  assert.strictEqual(storeApi.syncStoreAlert(), alert);
  assert.equal(document.body.children.filter((node) => node.id === 'store-alert').length, 1);
  assert.equal(alert.textWrites, writesBefore);
  assert.equal(storeContext.localStorage.writes, 0);
});

verified('open-sheet-description-tracks-error-without-render', () => {
  const sheet = document.createElement('div');
  sheet.id = 'sheet';
  sheet.setAttribute('aria-describedby', 'sheet-help');
  document.body.append(sheet);
  storeContext.S = state({ storeError: 'storage failed' });
  storeApi.syncStoreAlert();
  assert.equal(sheet.getAttribute('aria-describedby'), 'sheet-help store-alert');

  storeContext.S.storeError = null;
  storeApi.syncStoreAlert();
  assert.equal(sheet.getAttribute('aria-describedby'), 'sheet-help');

  sheet.setAttribute('aria-describedby', 'store-alert');
  storeApi.syncStoreAlert();
  assert.equal(sheet.getAttribute('aria-describedby'), null);
});

verified('alert-layout-failure-stays-isolated-and-retryable', () => {
  storeContext.S = state({ storeError: 'Synthetic storage failure' }); document.throwOnQuery = true;
  assert.equal(storeApi.safelySyncStoreAlert(), null);
  document.throwOnQuery = false; assert(storeApi.safelySyncStoreAlert());
  assert.equal(document.getElementById('store-alert').hidden, false);
});

const articleBlock = between(
  'const bundledArticle = (p) =>',
  '/* --------------------------------------------------- 新聞アーカイブ',
);
await verifiedAsync('article-rejection-http-failure-and-retry', async () => {
  let fetches = 0;
  const articleContext = vm.createContext({
    window: {},
    fetch: async () => {
      fetches += 1;
      if (fetches === 1) throw new Error('network failed');
      if (fetches === 2) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ text: '本文', tokens: [{ s: '本文' }] }) };
    },
  });
  vm.runInContext(`${articleBlock}\n;globalThis.__articleApi = { ensureArticle };`, articleContext, {
    filename: 'corridor-article-block.js',
  });
  const passage = { file: 'retry.json' };
  await assert.rejects(articleContext.__articleApi.ensureArticle(passage), /network failed/);
  assert.equal(Object.hasOwn(passage, '_loading'), false);
  await assert.rejects(articleContext.__articleApi.ensureArticle(passage), /503/);
  assert.equal(Object.hasOwn(passage, '_loading'), false);
  await articleContext.__articleApi.ensureArticle(passage);
  assert.equal(fetches, 3);
  assert.equal(passage.text, '本文');
  assert.equal(Object.hasOwn(passage, '_loading'), false);
});



verified('scheduler-clock-clamp-and-raw-audit-truth', () => {
  const clampBlock = between(
    'function srsSchedulerInstant(card, now) {',
    '/* --------------------------------------------------- the review log',
  );
  const clampContext = vm.createContext({});
  vm.runInContext(`${clampBlock}\n;globalThis.__clamp = srsSchedulerInstant;`, clampContext, {
    filename: 'corridor-clamp-block.js',
  });
  const clamp = clampContext.__clamp;
  const now = new Date('2026-08-16T00:00:00.000Z');
  // the device clock moved BACKWARD past the card's anchor: clamp up, never crash
  const anchorAhead = new Date('2026-08-19T00:00:00.000Z');
  assert.equal(clamp({ last_review: anchorAhead }, now).getTime(), anchorAhead.getTime());
  // an ordinary forward clock passes through untouched
  const anchorBehind = new Date('2026-08-10T00:00:00.000Z');
  assert.strictEqual(clamp({ last_review: anchorBehind }, now), now);
  // a first grade has no anchor to clamp against
  assert.strictEqual(clamp({}, now), now);

  // the revlog row keeps the RAW press time while pricing at the clamped instant
  const logRowBlock = between('function srsReviewLogRow(', 'function advanceReviewSession(');
  const logContext = vm.createContext({ scheduler: { get_retrievability: () => 0.9 } });
  vm.runInContext(`${logRowBlock}\n;globalThis.__row = srsReviewLogRow;`, logContext, {
    filename: 'corridor-logrow-block.js',
  });
  const after = {
    stability: 6,
    difficulty: 5,
    scheduled_days: 4,
    due: new Date(anchorAhead.getTime() + 4 * 86400000),
    state: 2,
  };
  const row = logContext.__row(
    'word:海',
    { last_review: anchorAhead, state: 2, stability: 5, difficulty: 5 },
    after,
    3,
    now,
    clamp({ last_review: anchorAhead }, now),
  );
  assert.equal(row[0], now.getTime(), 'row[0] is the raw press time — audit truth');
  assert.equal(row[4], 0, 'elapsed is measured at the clamp, never negative');
  assert.equal(row[5], 0.9);
  assert.equal(row[11], after.due.getTime());
  // an ordinary forward grade prices real elapsed days
  const forwardRow = logContext.__row(
    'word:海',
    { last_review: anchorBehind, state: 2, stability: 5, difficulty: 5 },
    after,
    3,
    now,
    now,
  );
  assert.equal(forwardRow[0], now.getTime());
  assert.equal(forwardRow[4], 6);
});

verified('due-queue-overdueness-order-no-debt-and-daily-cap', () => {
  const srsBlock = between(
    '/** Items ready to review:',
    '/** Midnight at the start of a date',
  );
  const dueContext = vm.createContext({
    S: {},
    crypto: webcrypto,
    document: fakeDocument(),
    localStorage: storage(),
    tx: (_ja, en) => en,
    srsKey: (t, id) => `${t}:${id}`,
    dayKey: () => '2026-08-16',
    window: { addEventListener: () => {} },
  });
  vm.runInContext(
    `${legacySchemaBlock}\n${srsBlock}\n;globalThis.__srsApi = { srsDueItems, srsNewPerDay, srsReviewLimit };`,
    dueContext,
    { filename: 'corridor-due-block.js' },
  );
  const api = dueContext.__srsApi;
  const now = new Date('2026-08-16T12:00:00.000Z');
  const iso = (msAgo) => new Date(now.getTime() - msAgo).toISOString();
  const card = (dueAgoMs) => ({
    due: iso(dueAgoMs),
    stability: 5,
    difficulty: 5,
    elapsed_days: 1,
    scheduled_days: 3,
    reps: 2,
    lapses: 0,
    learning_steps: 0,
    state: 2,
  });
  const HOUR = 3600000;
  const DAY = 86400000;
  dueContext.S = {
    taken: [
      { t: 'word', id: 'recent', started: 1 },
      { t: 'word', id: 'oldest', started: 1 },
      { t: 'word', id: 'tieB', started: 1 },
      { t: 'word', id: 'tieA', started: 1 },
      { t: 'word', id: 'fresh1', started: 5 },
      { t: 'word', id: 'legacy' },
      { t: 'word', id: 'resting', started: 1 },
      { t: 'word', id: 'fresh2', started: 6 },
    ],
    srs: {
      'word:recent': card(2 * HOUR),
      'word:oldest': card(3 * DAY),
      'word:tieB': card(DAY),
      'word:tieA': card(DAY),
      'word:resting': card(9 * DAY),
    },
    suspended: { 'word:resting': 1 },
    stats: {},
    srsPrefs: { newPerDay: 20, reviewLimit: 20 },
  };
  // most overdue first, key breaks the tie, started fresh rows after every
  // real due, the unmarked legacy row NOWHERE — capture is not a schedule
  assert.deepEqual(
    Array.from(api.srsDueItems(now), (i) => i.id),
    ['oldest', 'tieA', 'tieB', 'recent', 'fresh1', 'fresh2'],
  );
  // the daily cap honours what today already introduced
  dueContext.S.stats = { '2026-08-16': { nnew: 19 } };
  assert.deepEqual(
    Array.from(api.srsDueItems(now), (i) => i.id),
    ['oldest', 'tieA', 'tieB', 'recent', 'fresh1'],
  );
  // the learner's own zero means no new cards at all
  dueContext.S.stats = {};
  dueContext.S.srsPrefs = { newPerDay: 0, reviewLimit: 20 };
  assert.deepEqual(
    Array.from(api.srsDueItems(now), (i) => i.id),
    ['oldest', 'tieA', 'tieB', 'recent'],
  );
  // out-of-range or mistyped prefs fall back to the defaults, never crash
  dueContext.S.srsPrefs = { newPerDay: 999, reviewLimit: 'ten' };
  assert.equal(api.srsNewPerDay(), 20);
  assert.equal(api.srsReviewLimit(), 20);
  // a clock behind every due date empties the reviews and never throws
  dueContext.S.srsPrefs = { newPerDay: 20, reviewLimit: 20 };
  assert.deepEqual(
    Array.from(api.srsDueItems(new Date('2000-01-01T00:00:00.000Z')), (i) => i.id),
    ['fresh1', 'fresh2'],
  );
});

await verifiedAsync('learner-fsrs-params-fail-closed-gate', async () => {
  const gate = storeApi.srsParamsProblem;
  const w = () => PIN.w.slice();

  // the vendored scheduler's clamp ranges are the ONE bounds table: the
  // corridor's copy and the optimizer's PARAMETER_BOUNDS may never drift
  const optimizer = await import(
    new URL('../../../tools/fsrs-optimize.mjs', import.meta.url).href
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(storeApi.FSRS_WEIGHT_BOUNDS)),
    JSON.parse(JSON.stringify(optimizer.PARAMETER_BOUNDS)),
  );

  // a genuine fitted set passes, with or without its provenance fields
  assert.equal(gate({ w: w(), source: 'x @ 2026-08-16', basedOnReviews: 500 }), null);
  assert.equal(gate({ w: w() }), null);
  // every rejection names its reason — the quiet obslog note's payload
  assert.equal(gate(undefined), 'shape');
  assert.equal(gate(null), 'shape');
  assert.equal(gate([]), 'shape');
  assert.equal(gate({}), 'shape');
  assert.equal(gate({ w: 'defaults' }), 'shape');
  assert.equal(gate({ w: w().slice(0, 20) }), 'length');
  assert.equal(gate({ w: [...w(), 0.5] }), 'length');
  const withNaN = w();
  withNaN[7] = NaN;
  assert.equal(gate({ w: withNaN }), 'not-finite');
  const withInf = w();
  withInf[0] = Infinity;
  assert.equal(gate({ w: withInf }), 'not-finite');
  const withString = w();
  withString[3] = '8.3';
  assert.equal(gate({ w: withString }), 'not-finite');
  const below = w();
  below[4] = 0.5; // w[4] floor is 1
  assert.equal(gate({ w: below }), 'bounds');
  const above = w();
  above[20] = 0.9; // decay ceiling is 0.8
  assert.equal(gate({ w: above }), 'bounds');
  assert.equal(gate({ w: w(), source: '' }), 'source');
  assert.equal(gate({ w: w(), basedOnReviews: 0 }), 'basedOnReviews');
  assert.equal(gate({ w: w(), basedOnReviews: 1.5 }), 'basedOnReviews');

  // an unusable set NEVER quarantines the record: the envelope carries it
  // verbatim (load, then save) while the scheduler seam ignores it
  const shortSet = { w: PIN.w.slice(0, 20), source: 'future-build' };
  storeContext.S = state();
  storeContext.localStorage = storage(
    JSON.stringify({ v: 1, taken: [], srsPrefs: { newPerDay: 10, reviewLimit: 10, fsrs: shortSet } }),
  );
  storeApi.loadStore();
  assert.equal(storeContext.S.storeReadOnly, false);
  assert.equal(storeContext.S.srsPrefs.newPerDay, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(storeContext.S.srsPrefs.fsrs)), shortSet);
  const encoded = JSON.stringify(storeApi.storeEnvelope(storeContext.S));
  assert.deepEqual(
    JSON.parse(encoded).srsPrefs.fsrs,
    shortSet,
    'not a byte dropped on the round trip',
  );

});

verified('dojo-refill-second-lap-is-practice', () => {
  const batchBlock = between(
    '/** How many pool items a dojo refill draws at once',
    'const LEECH_LAPSES',
  );
  const refillBlock = between('function refillFocusQueue(rv) {', 'function startFocus(');
  const context = vm.createContext({ S: { focus: null } });
  vm.runInContext(
    `${batchBlock}\n${refillBlock}\n;globalThis.__refill = refillFocusQueue;`,
    context,
    { filename: 'corridor-refill-block.js' },
  );
  const a = { t: 'word', id: '海' };
  const b = { t: 'word', id: '波' };
  // a fresh block: the first lap hands out the pool's own rows untouched,
  // and the wrap that follows in the same batch is already marked practice
  context.S.focus = { pool: [a, b], cursor: 0 };
  const rv = { queue: [] };
  assert.equal(context.__refill(rv), true);
  assert.equal(rv.queue.length, 20);
  assert.strictEqual(rv.queue[0], a);
  assert.strictEqual(rv.queue[1], b);
  assert.ok(rv.queue.slice(0, 2).every((row) => row.drillPass === undefined));
  assert.ok(
    rv.queue.slice(2).every((row) => row.drillPass === true && row !== a && row !== b),
    'every wrap draw is a marked copy, never the pool row itself',
  );
  assert.equal(rv.queue[2].id, '海');
  assert.equal(rv.queue[3].id, '波');
  // a later refill in the same block draws practice passes only
  const rv2 = { queue: [] };
  assert.equal(context.__refill(rv2), true);
  assert.ok(rv2.queue.every((row) => row.drillPass === true));
  // an empty pool refuses the refill
  context.S.focus = { pool: [], cursor: 0 };
  assert.equal(context.__refill({ queue: [] }), false);
});

function cssRule(text, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[0];
}

function cssProperty(rule, property) {
  const match = rule.match(new RegExp(`${property}\\s*:\\s*([^;]+)`));
  assert.ok(match, `missing ${property} in ${rule.slice(0, 60)}`);
  return match[1].trim();
}



verified('global-alert-css-is-above-every-numeric-layer', () => {
  const alertRule = cssRule(css, '.store-warning-live');
  assert.equal(cssProperty(alertRule, 'position'), 'fixed');
  assert.equal(cssProperty(alertRule, 'pointer-events'), 'none');
  assert.notEqual(cssProperty(alertRule, 'background'), 'transparent');
  const alertZ = Number(cssProperty(alertRule, 'z-index'));
  const withoutAlert = `${css.replace(alertRule, '')}\n${driftCss}`;
  const otherLayers = [...withoutAlert.matchAll(/z-index\s*:\s*(-?\d+)/g)].map((match) =>
    Number(match[1]),
  );
  assert.ok(alertZ > Math.max(...otherLayers), `${alertZ} must exceed ${Math.max(...otherLayers)}`);
  assert.match(cssRule(css, '.store-warning-live[hidden]'), /display\s*:\s*none/);
});

verified('zen-grade-controls-retain-sticky-safe-area-layout', () => {
  const live = cssRule(css, 'body.zen .grade-row');
  assert.equal(cssProperty(live, 'position'), 'sticky'); assert.equal(cssProperty(live, 'bottom'), '0');
  assert.equal(cssProperty(live, 'z-index'), '3'); assert(live.includes('env(safe-area-inset-bottom)'));
  assert(cssProperty(live, 'background').startsWith('var(--ground-0'));
});

verified('javascript-syntax', () => {
  const syntax = spawnSync(process.execPath, ['--check', corridorPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
});

const clone = (value) => JSON.parse(JSON.stringify(value));
function freezeJson(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeJson);
    Object.freeze(value);
  }
  return value;
}
function actionContext({ dict = {}, dictionaryIndex = null, rows = [] } = {}) {
  const queued = [];
  const context = vm.createContext({
    S: state({ taken: [], obslog: [], deepWords: {}, readDone: {} }),
    // D23: a core spelling and a cached index row are opt-in; the older captures keep their exact setup
    D: { dict, ...(dictionaryIndex ? { dictionaryIndex, dictionaryBySeq: new Map(rows.map((row) => [String(row[0]), row])) } : {}) },
    NODE_KIND: { word: ['語', 'word'] },
    lookup: () => ({ r: 'うみ', m: ['sea'], seq: 'synthetic-deep-entry' }),
    commitStorePatch: (produce) => new Promise((settle) => queued.push({ produce, settle })),
    // the record-ownership guard every capture crosses first (same model as the
    // write-boundary probe below): an owned, current epoch is writable; nothing else
    recordEpoch: 1, writable: true,
    recordWritable: (epoch) => context.writable && epoch === context.recordEpoch,
  });
  const seal = () => {
    for (const key of ['taken', 'deepWords', 'readDone', 'obslog', 'srs', 'revlog', 'stats']) freezeJson(context.S[key]);
  };
  seal();
  vm.runInContext(definitions('readDonePending', 'commitReadDone', 'captureStorePatch', 'commitCapture',
    'setOwnRecordValue', 'owns', 'obsLog', 'srsParamNotePending', 'noteIgnoredSrsParams',
    // D23: the word capture plan and what it reads (the saved answer and the explicit-cue validation)
    'plainRecord', 'nonEmptyString', 'srsKey', 'nonBlankMeanings', 'wordSelection', 'savedAnswerFor', 'wordAnswerIdentity',
    'sameWordIdentity', 'wordStudied', 'wordCardIdentity', 'explicitWordSnapshot', 'wordCapturePlan', 'dictionaryRowBySeq',
    'readerReadingFits', 'readerSummaryFor', 'dictionaryReadingSummaries', 'kataToHira', 'KATA_TO_HIRA_OFFSET'), context);
  return { context, queued, acknowledge(save = true) {
    const next = queued.shift(); assert(next, 'An actual application action queued a save');
    const patch = next.produce(context.S);
    assert(storeApi.validStoreEnvelope(clone(storeApi.storeEnvelope({ ...context.S, ...patch }))), 'Every reducer result satisfies the real learner schema');
    if (save) Object.assign(context.S, clone(patch));
    seal(); next.settle(save);
    return patch;
  } };
}

await verifiedAsync('reader-completion-is-acknowledged-double-input-safe-and-merges-latest', async () => {
  const { context: c, queued, acknowledge } = actionContext();
  let pending = c.commitReadDone('article', 10);
  assert.equal(await c.commitReadDone('article', 11), false);
  assert.equal(queued.length, 1); assert.equal(c.S.readDone.article, undefined);
  acknowledge(false); assert.equal(await pending, false); assert.equal(c.S.readDone.article, undefined);
  pending = c.commitReadDone('article', 12);
  c.S.readDone = freezeJson({ other: 7 });
  acknowledge(); assert.equal(await pending, true); assert.deepEqual(clone(c.S.readDone), { article: 12, other: 7 });
  pending = c.commitReadDone('article', 13); acknowledge(); await pending;
  assert.deepEqual(clone(c.S.readDone), { other: 7 });
  pending = c.commitReadDone('__proto__', 14); acknowledge(); await pending;
  assert(Object.hasOwn(c.S.readDone, '__proto__')); assert.equal(c.S.readDone.__proto__, 14);
});

await verifiedAsync('deep-capture-context-and-promotion-cross-one-acknowledged-boundary', async () => {
  const { context: c, queued, acknowledge } = actionContext();
  const node = { t: 'word', id: '海', from: { passage: 'p', index: 4 }, ctxScope: 'sent' };
  let pending = c.commitCapture(node, '海', 111);
  assert.equal(queued.length, 1); assert.equal(c.S.taken.length, 0); assert.equal(Object.keys(c.S.deepWords).length, 0);
  acknowledge(false); assert.equal(await pending, false); assert.equal(c.S.taken.length, 0);
  pending = c.commitCapture(node, '海', 112); acknowledge(); assert.equal(await pending, true);
  const taken = c.S.taken[0];
  assert.equal(taken.started, 112); assert.equal(taken.entrySeq, 'synthetic-deep-entry'); assert.equal(taken.cueReading, 'うみ');
  assert.deepEqual(clone(taken.ctx), { p: 'p', i: 4, scope: 'sent' });
  assert.equal(c.S.deepWords['海'].m[0], 'sea'); assert.equal(c.S.deepWords['海'].seq, 'synthetic-deep-entry');
  pending = c.commitCapture(node, '海', 113); acknowledge(); await pending; assert.equal(c.S.taken.length, 1, 'Retaking an existing capture does not duplicate it');
  pending = c.commitCapture({ t: 'word', id: '波', ctxScope: 'sent' }, '波', 114); acknowledge(); await pending;
  assert.equal(Object.hasOwn(c.S.taken[1], 'ctx'), false, 'Context requires real encounter provenance');
  assert.deepEqual(clone(c.S.srs), {}); assert.deepEqual(clone(c.S.revlog), []);
  // the guard itself, exercised: an unwritable record queues nothing
  const before = queued.length;
  c.writable = false; assert.equal(await c.commitCapture(node, '海', 114), false); assert.equal(queued.length, before, 'An unwritable record queues no capture');
  c.writable = true;
});

await verifiedAsync('d23-explicit-core-capture-and-its-answer-cross-one-acknowledged-boundary', async () => {
  // the served index row of 上手 1580400, cells 0–11 (test-word-saved-answer.mjs F0 pins it against the index)
  const row = ['1580400', '上手', 'うわて', 'upper part', ['上手'], ['うわて', 'かみて'],
    ['upper part', 'upper stream', 'upper course of a river', "right side of the stage (audience's or camera's POV)", "stage left (actor's POV)",
      'skillful (in comparisons)', 'dexterity', "over-arm grip on opponent's belt"],
    ['upper part', 'upper stream', 'upper course of a river', 'right side of the stage', 'stage left', 'skillful', 'dexterity',
      "over-arm grip on opponent's belt"], 0, [[0, 0], [0, 0]], [[0, 0], [1, 0], [1, 0], [1, 0], [1, 0], [0, 0], [0, 0], [0, 0]], [0, 0]];
  const source = { pin: '3.6.2+20260803141815', jmdict: { sha256: '1806d2817215ebe7ded997c8dac4831a3335d83ed12f321ac869a97e745d3a5c' } };
  const { context: c, queued, acknowledge } = actionContext({ dict: { 上手: { r: 'じょうず', m: ['skillful'] } }, dictionaryIndex: { source }, rows: [row] });
  const node = { t: 'word', id: '上手', seq: '1580400', reading: 'うわて', matchedGloss: 'upper part' };
  let pending = c.commitCapture(node, '上手', 200);
  assert.equal(queued.length, 1); assert.equal(c.S.taken.length, 0); assert.equal(Object.keys(c.S.deepWords).length, 0);
  acknowledge(false); assert.equal(await pending, false); assert.equal(c.S.taken.length, 0);
  pending = c.commitCapture(node, '上手', 201); const patch = acknowledge(); assert.equal(await pending, true);
  assert.deepEqual(Object.keys(patch).sort(), ['deepWords', 'taken'], 'the row and its answer publish in one write');
  assert.equal(c.S.taken[0].entrySeq, '1580400'); assert.equal(c.S.taken[0].cueReading, 'うわて');
  assert.equal(c.S.deepWords['上手'].m[0], 'upper part'); assert.equal(c.S.deepWords['上手'].selection.head, '上手');
  assert.deepEqual(clone(c.S.srs), {}); assert.deepEqual(clone(c.S.revlog), []);
  // another entry of this spelling (the core record) refuses in the producer and changes no root
  const roots = clone({ taken: c.S.taken, deepWords: c.S.deepWords, srs: c.S.srs, revlog: c.S.revlog });
  assert.throws(() => c.captureStorePatch(c.S, { t: 'word', id: '上手' }, '上手', 202), (error) => error.code === 'word-identity-conflict');
  assert.deepEqual(clone({ taken: c.S.taken, deepWords: c.S.deepWords, srs: c.S.srs, revlog: c.S.revlog }), roots);
});

verified('d23-lawful-legacy-head-src-and-a-selection-snapshot-round-trip-exactly', () => {
  // F07, built from literal JSON (an own "__proto__" is data here, never a prototype setter). The old
  // lawful head:17 and src:'third-party-note' stay opaque bytes; the D23 snapshot carries its
  // validated provenance only inside its versioned selection object.
  const legacy = JSON.parse('{"futureRecord":{"retain":[true,0,null]},' +
    '"taken":[{"t":"word","id":"捲る","label":"捲る","entrySeq":"1257810","cueReading":"めくる","ts":10,"futureTaken":{"note":"keep"}},' +
    '{"t":"word","id":"上手","label":"上手","entrySeq":"1580400","cueReading":"うわて","ts":11,"started":11}],' +
    '"deepWords":{"捲る":{"seq":"1257810","r":"めくる","m":["to turn over"],"head":17,"src":"third-party-note",' +
    '"futureSnapshot":{"retain":true},"__proto__":{"retainOwnData":true}},' +
    '"上手":{"r":"うわて","m":["upper part"],"seq":"1580400","k":["上","手"],"selection":{"v":1,"seq":"1580400","r":"うわて","head":"上手",' +
    '"src":{"release":"3.6.2+20260803141815","archiveSha256":"1806d2817215ebe7ded997c8dac4831a3335d83ed12f321ac869a97e745d3a5c"}}}},' +
    '"lists":{"__proto__":[{"t":"word","id":"捲る","futureListItem":true}],"constructor":[]}}');
  const envelope = { v: 1, ...legacy };
  assert(storeApi.validStoreEnvelope(clone(envelope)), 'a lawful pre-D23 record and a D23 snapshot are accepted as they are');
  storeContext.S = state();
  storeContext.localStorage = storage(JSON.stringify(envelope));
  storeApi.loadStore();
  assert.equal(storeContext.S.storeReadOnly, false);
  const encoded = JSON.parse(JSON.stringify(storeApi.storeEnvelope(storeContext.S)));
  for (const root of ['taken', 'deepWords', 'lists', 'futureRecord']) {
    assert.equal(JSON.stringify(encoded[root]), JSON.stringify(legacy[root]), `${root}: not a byte dropped on the round trip`);
  }
  assert(Object.hasOwn(storeContext.S.deepWords['捲る'], '__proto__'), 'an own __proto__ stays data');
  assert.equal(Object.getPrototypeOf(storeContext.S.deepWords['捲る']).retainOwnData, undefined, 'no prototype was set');
  assert.equal(Object.hasOwn(storeContext.S.taken[0], 'started'), false, 'nothing fabricates a promotion mark');
  assert.equal(storeContext.localStorage.writes, 0);
});

await verifiedAsync('observation-reducers-append-latest-with-no-pre-acknowledgment-publication', async () => {
  const { context: c, queued, acknowledge } = actionContext();
  let pending = c.obsLog('tap', 'word:海', 1, 'article');
  assert.equal(c.S.obslog.length, 0); acknowledge(false); assert.equal(await pending, false); assert.equal(c.S.obslog.length, 0);
  pending = c.obsLog('tap', 'word:海', 1, 'article');
  const second = c.obsLog('reveal', 'word:海', 0); assert.equal(queued.length, 2);
  acknowledge(); await pending; acknowledge(); await second;
  assert.deepEqual(c.S.obslog.map((row) => row[1]), ['tap', 'reveal']);
  assert.deepEqual(clone(c.S.srs), {}); assert.deepEqual(clone(c.S.revlog), []); assert.equal(c.S.taken.length, 0);
});

await verifiedAsync('ignored-params-note-deduplicates-pending-acknowledged-and-rejected-reasons', async () => {
  const { context: c, queued, acknowledge } = actionContext();
  let pending = c.noteIgnoredSrsParams('length');
  assert.strictEqual(c.noteIgnoredSrsParams('length'), pending); assert.equal(queued.length, 1); assert.equal(c.S.obslog.length, 0);
  acknowledge(false); assert.equal(await pending, false); assert.equal(c.S.obslog.length, 0);
  pending = c.noteIgnoredSrsParams('length'); acknowledge(); assert.equal(await pending, true);
  assert.equal(await c.noteIgnoredSrsParams('length'), true); assert.equal(queued.length, 0); assert.equal(c.S.obslog.length, 1);
  const b = c.noteIgnoredSrsParams('bounds'); const a = c.noteIgnoredSrsParams('length');
  assert.equal(queued.length, 2); acknowledge(); await b; acknowledge(); await a;
  assert.deepEqual(c.S.obslog.map((row) => row[3]), ['length', 'bounds', 'length']);
  const rejected = c.noteIgnoredSrsParams('bounds'); const repeated = c.noteIgnoredSrsParams('length');
  acknowledge(false); assert.equal(await rejected, false); acknowledge(); await repeated;
  assert.equal(c.S.obslog.length, 3, 'A failed intervening reason does not create a duplicate of the current reason');
  assert.deepEqual(clone(c.S.srs), {}); assert.equal(c.S.taken.length, 0); assert.equal(c.S.revlog.length, 0);
});

await verifiedAsync('current-commit-wrapper-refuses-unowned-stale-and-unacknowledged-results', async () => {
  let writes = 0; let resolveWrite;
  const context = vm.createContext({ S: state(), recordEpoch: 1, publishedRecord: {}, DEFAULT_LEARNER_RECORD: {},
    recordWritable: (epoch) => context.writable && epoch === context.recordEpoch,
    writable: false, safelySyncStoreAlert: () => {},
    recordFailure: (reason) => { context.failure = reason; },
    recordApp: { write: () => { writes += 1; return new Promise((done) => { resolveWrite = done; }); } },
  });
  vm.runInContext(definitions('commitStorePatch', 'canonicalRecordJson', 'plainRecord'), context);
  assert.equal(await context.commitStorePatch({ taken: [] }), false); assert.equal(writes, 0);
  context.writable = true;
  let pending = context.commitStorePatch({ taken: [] }); resolveWrite({ status: 'active', replayUiEffects: false });
  assert.equal(await pending, false, 'A settled document without replay permission is not a UI acknowledgment');
  pending = context.commitStorePatch({ taken: [] }); context.recordEpoch += 1; resolveWrite({ status: 'active', replayUiEffects: true });
  assert.equal(await pending, false, 'A departed record generation cannot replay old UI effects');
  pending = context.commitStorePatch({ taken: [] }); resolveWrite({ status: 'protected', reason: 'synthetic-uncertain' });
  assert.equal(await pending, false); assert.equal(context.failure, 'synthetic-uncertain');
  assert.equal(context.S.taken[0].id, 'old');
});

await verifiedAsync('actual-scheduler-initialization-preserves-pin-and-gates-personal-weights', async () => {
  assert.equal(PIN.enableFuzz, false); assert.equal(PIN.reviewTimePolicyId, 'append-order-monotonic-clamp-v1');
  const init = between('fsrsApi = window.__TSFSRS__', '  } catch (err) {');
  const tuned = { w: PIN.w.map((value, index) => index === 0 ? value + 0.01 : value), source: 'synthetic-personal', basedOnReviews: 50 };
  for (const fitted of [undefined, tuned, { w: PIN.w.slice(0, 20) }]) {
    const notes = [];
    const context = vm.createContext({ fsrsApi: null, scheduler: null, srsParams: null, srsCustom: null,
      window: { __TSFSRS__: fsrs }, pin: clone(PIN), S: { srsPrefs: fitted === undefined ? {} : { fsrs: clone(fitted) } },
      srsParamsProblem: storeApi.srsParamsProblem, noteIgnoredSrsParams: (reason) => notes.push(reason),
    });
    await vm.runInContext('(async () => { ' + init + ' })()', context);
    assert(context.scheduler); assert.equal(context.srsParams.enable_fuzz, false);
    assert.equal(context.srsParams.request_retention, PIN.requestRetention);
    assert.equal(context.srsParams.maximum_interval, PIN.maximumInterval);
    assert.deepEqual(clone(context.srsParams.learning_steps), PIN.learningSteps);
    assert.deepEqual(clone(context.srsParams.relearning_steps), PIN.relearningSteps);
    assert.deepEqual(clone(context.srsParams.w), fitted === tuned ? tuned.w : PIN.w);
    if (fitted === tuned) assert.deepEqual(clone(context.srsCustom), { source: tuned.source, basedOnReviews: 50 });
    else assert.equal(context.srsCustom, null);
    assert.deepEqual(notes, fitted && fitted !== tuned ? ['length'] : []);
    if (fitted) assert.deepEqual(clone(context.S.srsPrefs.fsrs), fitted, 'Ignoring unusable parameters never removes them from the record');
    const now = new Date('2026-09-10T00:00:00Z'); const card = fsrs.createEmptyCard(now);
    assert.deepEqual(clone(context.scheduler.repeat(card, now)), clone(context.scheduler.repeat(card, now)), 'Pinned no-fuzz scheduling replays deterministically');
  }
});

verified('bounded-standard-review-executes-a-frozen-scoped-sitting', () => {
  const pool = Array.from({ length: 8 }, (_, id) => ({ t: 'word', id: String(id) }));
  const context = vm.createContext({ S: { view: 'tray' }, srsDueItems: () => pool, srsReviewLimit: () => 3,
    srsKey: (type, id) => type + ':' + id, render: () => {},
    // a DOM focus helper startReview calls after rendering; no scheduling effect
    focusKanjiReadingReview: () => {} });
  vm.runInContext(definitions('startReview'), context);
  context.startReview(); assert.equal(context.S.review.queue.length, 3); assert.equal(context.S.review.deferred, 5);
  assert.equal(pool.length, 8); assert.equal(context.S.review.declared, null); assert.equal(context.S.view, 'review');
  context.startReview(pool.slice(4, 6)); assert.deepEqual(Array.from(context.S.review.queue, (row) => row.id), ['4', '5']);
  assert.equal(context.S.review.deferred, 0);
});

const evidenceDir = resolveCorridorEvidence();
mkdirSync(evidenceDir, { recursive: true });
const report = {
  format: 'kairo-schema-policy-verification', version: 2, status: failures.length ? 'FAIL' : 'PASS', checks: checks.length, checkNames: checks, failures,
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  observations,
  verifierSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  scope: 'Actual legacy input decoder, schema/hydration, alert behavior, current async action reducers and scheduler policies; controlled acknowledgments are not browser durability evidence',
  coverageMigration: [
    { before: 'Legacy read quarantine, deep known-root validation, reserved maps and future keys', now: 'Retained executed decoder and serialization/hydration round trips; legacy storage is read-only input' },
    { before: 'Synchronous reader/capture/observation writes', now: 'Actual async reducers with frozen roots, delayed acknowledgment, rejection, latest-state merge and duplicate input' },
    { before: 'Scheduler clock, due order, fitted weights and dojo refill', now: 'Retained edge cases plus executed actual scheduler initialization and bounded scoped sessions' },
    { before: 'Synchronous saveStore/writeStore, localStorage live commits, crossing beacons and Drift rollback', now: 'Superseded by mandatory real-storage record-app, record-live and drift-record browser gates' },
    { before: 'Grade/recall/lesson/probe/quiz source regex assertions and synchronous grade fixtures', now: 'Mandatory learning-record browser journeys and frozen queued FSRS/action tests; tutor-quiz-storage native failure cases' },
    { before: 'Historical residual counts and CSS byte identity against an old commit', now: 'Historical counts no longer claim current behavior; explicit alert-layer and sticky safe-area CSS contracts retained' },
  ],
  mandatoryComplementarySuites: ['verify-record-app.mjs', 'verify-record-live.mjs', 'verify-learning-record.mjs', 'verify-drift-record.mjs', 'verify-tutor-quiz-storage.mjs'],
  browserAndDevice: 'NOT_RUN_BY_THIS_SUITE',
};
writeFileSync(resolve(evidenceDir, 'storage-integrity.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
