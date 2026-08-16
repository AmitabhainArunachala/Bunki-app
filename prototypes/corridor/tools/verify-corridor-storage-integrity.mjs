#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const BASE = 'ac880aff052991b230dfdd9b7f39267ae764a05f';
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const corridorUrl = new URL('../corridor.js', import.meta.url);
const corridorPath = fileURLToPath(corridorUrl);
const cssPath = fileURLToPath(new URL('../corridor.css', import.meta.url));
const driftCssPath = fileURLToPath(new URL('../drift-layer.css', import.meta.url));
const residualPath = fileURLToPath(
  new URL(
    '../../../docs/build-evidence/reading-r5-learning-loop-r5-20260815/residual-storage-callers.json',
    import.meta.url,
  ),
);
const driftLayerPath = fileURLToPath(new URL('../drift-layer.js', import.meta.url));
const driftArtifactPath = fileURLToPath(new URL('../../drift/drift-artifact.html', import.meta.url));
const source = readFileSync(corridorPath, 'utf8');
const PIN = JSON.parse(
  readFileSync(fileURLToPath(new URL('../data/fsrs-pin.json', import.meta.url)), 'utf8'),
);
const css = readFileSync(cssPath, 'utf8');
const driftCss = readFileSync(driftCssPath, 'utf8');
const driftLayerSource = readFileSync(driftLayerPath, 'utf8');
const driftArtifactSource = readFileSync(driftArtifactPath, 'utf8');
const checks = [];

function verified(name, body) {
  body();
  checks.push(name);
}

async function verifiedAsync(name, body) {
  await body();
  checks.push(name);
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

  append(child) {
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

const persistenceBlock = between(
  "const STORE_KEY = 'kairo-corridor-v1';",
  '/* ------------------------------------------------ the observation log',
);
const document = fakeDocument();
const storeContext = vm.createContext({
  S: state(),
  document,
  localStorage: storage(),
  tx: (_ja, en) => en,
});
vm.runInContext(
  `${persistenceBlock}\n;globalThis.__storeApi = { loadStore, saveStore, commitStorePatch, storeEnvelope, syncStoreAlert, safelySyncStoreAlert, validStoreEnvelope, setOwnRecordValue, srsParamsProblem, FSRS_WEIGHT_BOUNDS };`,
  storeContext,
  { filename: 'corridor-persistence-block.js' },
);
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
  for (const raw of ['', '{broken', '{"v":2,"taken":[]}']) {
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
    ],
    deepWords: { 海: { r: 'うみ', m: ['sea'], jlpt: 'N5', k: ['海'], seq: '1' } },
    lessonsDone: { lesson: { score: 1, total: 1, ts: 10 } },
    aiReading: null,
    aiReadings: [{ text: '海へ行く。', lv: 'N5', ts: 10 }],
    suspended: { 'word:波': 10 },
    aiChat: [{ role: 'user', text: '海' }],
    ai: { baseUrl: 'https://example.invalid', model: 'test-model' },
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
  assert.equal(storeContext.S.srsPrefs.newPerDay, 35);
  assert.equal(storeContext.S.srsPrefs.reviewLimit, 45);
  // R3-D · the learner's fitted weights hydrate VERBATIM alongside pacing
  assert.equal(storeContext.S.srsPrefs.fsrs.w.length, 21);
  assert.equal(storeContext.S.srsPrefs.fsrs.basedOnReviews, 500);
  assert.equal(storeContext.S.storeExtras.futureField.nested[0], 'preserved');
  assert.equal(storeContext.localStorage.writes, 0);
});

verified('every-known-root-and-version-shape-fails-closed', () => {
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

    assert.equal(storeApi.saveStore(), true, name);
    assert.equal(storeContext.localStorage.attempts, 1, name);
    const durable = JSON.parse(storeContext.localStorage.value);
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

    const roundTripStorage = storeContext.localStorage;
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

  // list creation moved to the guarded transactional path (覚える stage 2):
  // names are still prototype-safe (owns + setOwnRecordValue on the COPY)
  // and the commit rides commitStorePatch, never a direct S.lists mutation.
  const listProducer = between('function renderListPicker(sheet, node, label) {', 'function schedulePreview() {');
  assert.match(listProducer, /owns\(S\.lists, name\)/);
  assert.match(listProducer, /setOwnRecordValue\(next, name,/);
  assert.match(listProducer, /commitStorePatch\(\{ lists: next \}\)/);
  assert.doesNotMatch(listProducer, /setOwnRecordValue\(S\.lists,/);
  assert.doesNotMatch(listProducer, /if \(!name \|\| S\.lists\[name\]\)/);
  assert.doesNotMatch(listProducer, /S\.lists\[name\] = \[/);
});

verified('invalid-candidate-is-rejected-before-storage', () => {
  const durable = '{"v":1,"taken":[]}';
  storeContext.S = state({ lists: { malformed: {} } });
  storeContext.localStorage = storage(durable);
  assert.equal(storeApi.saveStore(), false);
  assert.equal(storeContext.localStorage.attempts, 0);
  assert.equal(storeContext.localStorage.writes, 0);
  assert.equal(storeContext.localStorage.value, durable);
  assert.match(storeContext.S.storeError, /could not save/);

  const writeStore = between('function writeStore(state) {', 'function saveStore() {');
  assert.match(writeStore, /validStoreEnvelope\(JSON\.parse\(bytes\)\)/);
  assert.ok(
    writeStore.indexOf('validStoreEnvelope(JSON.parse(bytes))') <
      writeStore.indexOf('localStorage.setItem(STORE_KEY, bytes)'),
  );
});

verified('stable-alert-node-no-repeat-announcement', () => {
  const alert = document.getElementById('store-alert');
  storeContext.S.view = 'tray';
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

verified('read-only-suppresses-writes', () => {
  storeContext.S = state({ storeReadOnly: true, storeError: 'protected' });
  storeContext.localStorage = storage('{"durable":"canary"}');
  const protectedTaken = storeContext.S.taken;
  assert.equal(storeApi.commitStorePatch({ taken: [{ t: 'word', id: 'new' }] }), false);
  assert.strictEqual(storeContext.S.taken, protectedTaken);
  assert.equal(storeContext.localStorage.value, '{"durable":"canary"}');
  assert.equal(storeContext.localStorage.attempts, 0);
});

verified('failure-atomic-write-and-retry-cleanup', () => {
  storeContext.S = state();
  storeContext.localStorage = storage();
  assert.equal(storeApi.saveStore(), true);
  const durableBeforeFailure = storeContext.localStorage.value;
  const liveTakenBeforeFailure = storeContext.S.taken;
  const liveReadDoneBeforeFailure = storeContext.S.readDone;
  storeContext.localStorage.setError = new Error('quota');
  assert.equal(
    storeApi.commitStorePatch({
      taken: [...storeContext.S.taken, { t: 'word', id: 'uncommitted' }],
      readDone: { article: 1 },
    }),
    false,
  );
  assert.strictEqual(storeContext.S.taken, liveTakenBeforeFailure);
  assert.strictEqual(storeContext.S.readDone, liveReadDoneBeforeFailure);
  assert.equal(storeContext.localStorage.value, durableBeforeFailure);
  assert.match(storeContext.S.storeError, /could not save/);
  const alert = document.getElementById('store-alert');
  assert.equal(alert.hidden, false);

  storeContext.localStorage.setError = null;
  const oldTaken = storeContext.S.taken;
  const nextTaken = [...oldTaken, { t: 'word', id: 'committed' }];
  let liveAtWrite = null;
  let candidateAtWrite = null;
  storeContext.localStorage.onSet = (bytes) => {
    liveAtWrite = storeContext.S.taken;
    candidateAtWrite = JSON.parse(bytes);
  };
  assert.equal(storeApi.commitStorePatch({ taken: nextTaken }), true);
  assert.strictEqual(liveAtWrite, oldTaken);
  assert.equal(candidateAtWrite.taken.at(-1).id, 'committed');
  assert.equal(candidateAtWrite.futureField.keep, true);
  assert.strictEqual(storeContext.S.taken, nextTaken);
  assert.equal(alert.hidden, true);
  assert.equal(alert.textContent, '');
});

verified('post-setitem-alert-throw-cannot-block-publication', () => {
  storeContext.S = state({ storeError: 'old warning' });
  storeContext.localStorage = storage();
  const oldTaken = storeContext.S.taken;
  const nextTaken = [...oldTaken, { t: 'word', id: 'durable-despite-layout' }];
  storeContext.localStorage.onSet = () => {
    document.throwOnQuery = true;
  };
  try {
    assert.equal(storeApi.commitStorePatch({ taken: nextTaken }), true);
    assert.equal(storeContext.localStorage.attempts, 1);
    assert.equal(storeContext.localStorage.writes, 1);
    assert.equal(JSON.parse(storeContext.localStorage.value).taken.at(-1).id, 'durable-despite-layout');
    assert.strictEqual(storeContext.S.taken, nextTaken);
    assert.equal(storeContext.S.storeError, null);
  } finally {
    document.throwOnQuery = false;
  }
  assert.ok(storeApi.safelySyncStoreAlert());
  assert.equal(document.getElementById('store-alert').hidden, true);
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

const readerActionBlock = between('function commitReadDone(', 'function renderReader(');
verified('reader-finish-action-executes-one-boundary', () => {
  const context = vm.createContext({ S: { readDone: {} }, commitStorePatch: null });
  vm.runInContext(`${readerActionBlock};globalThis.action = commitReadDone;`, context);
  let attempts = 0;
  context.commitStorePatch = () => {
    attempts += 1;
    return false;
  };
  const before = context.S.readDone;
  assert.equal(context.action('article', 123), false);
  assert.equal(attempts, 1);
  assert.strictEqual(context.S.readDone, before);
  context.commitStorePatch = (patch) => {
    attempts += 1;
    Object.assign(context.S, patch);
    return true;
  };
  assert.equal(context.action('article', 123), true);
  assert.equal(attempts, 2);
  assert.equal(context.S.readDone.article, 123);
});

const captureActionBlock = between('function commitCapture(', 'function takeButton(');
verified('deep-capture-action-executes-one-boundary', () => {
  const context = vm.createContext({
    S: { taken: [], deepWords: {} },
    D: { dict: {} },
    NODE_KIND: { word: ['語', 'word'] },
    lookup: () => ({ r: 'あんど', m: ['relief'], seq: 42, jlpt: 1 }),
    commitStorePatch: null,
  });
  vm.runInContext(`${captureActionBlock};globalThis.action = commitCapture;`, context);
  const node = { t: 'word', id: '安堵', from: { passage: 'p', index: 2 } };
  let attempts = 0;
  context.commitStorePatch = () => {
    attempts += 1;
    return false;
  };
  const oldTaken = context.S.taken;
  const oldDeepWords = context.S.deepWords;
  assert.equal(context.action(node, '安堵', 456), false);
  assert.equal(attempts, 1);
  assert.strictEqual(context.S.taken, oldTaken);
  assert.strictEqual(context.S.deepWords, oldDeepWords);
  context.commitStorePatch = (patch) => {
    attempts += 1;
    Object.assign(context.S, patch);
    return true;
  };
  assert.equal(context.action(node, '安堵', 456), true);
  assert.equal(attempts, 2);
  assert.equal(context.S.taken.length, 1);
  assert.equal(context.S.taken[0].entrySeq, '42');
  // 覚える is the explicit promotion — the mark rides the capture instant
  assert.equal(context.S.taken[0].started, 456);
  assert.equal(context.S.deepWords['安堵'].r, 'あんど');
});

verified('capture-context-rides-the-guarded-boundary', () => {
  const context = vm.createContext({
    S: { taken: [], deepWords: {} },
    D: { dict: { 海: { r: 'うみ', m: ['sea'] } } },
    NODE_KIND: { word: ['語', 'word'] },
    lookup: () => null,
    commitStorePatch: null,
  });
  vm.runInContext(`${captureActionBlock};globalThis.action = commitCapture;`, context);
  context.commitStorePatch = (patch) => {
    Object.assign(context.S, patch);
    return true;
  };
  // R2-B: the reader's top-right door and the mini pass ctxScope alongside
  // provenance — the stored item carries the validator's exact ctx shape
  assert.equal(
    context.action({ t: 'word', id: '海', from: { passage: 'p', index: 4 }, ctxScope: 'sent' }, '海', 111),
    true,
  );
  const storedCtx = context.S.taken[0].ctx;
  assert.equal(storedCtx.p, 'p');
  assert.equal(storedCtx.i, 4);
  assert.equal(storedCtx.scope, 'sent');
  assert.equal(Object.keys(storedCtx).length, 3);
  assert.equal(context.S.taken[0].from.passage, 'p');
  // without provenance there is no context to carry — no ctx is minted
  assert.equal(context.action({ t: 'word', id: '海', ctxScope: 'sent' }, '海', 112), true);
  assert.equal(Object.hasOwn(context.S.taken[1], 'ctx'), false);
  // what capture writes, the fail-closed envelope must accept verbatim
  assert.equal(storeApi.validStoreEnvelope({ v: 1, taken: context.S.taken }), true);
});

const gradeActionBlock = between('function advanceReviewSession(', '/** Items ready to review:');

function gradeContext() {
  const context = vm.createContext({
    S: { obslog: [], revlog: [], srs: {}, stats: {} },
    commitStorePatch: null,
    srsReviewLogRow: () => ['review-row'],
    srsStoredRecord: () => ({ due: 'stored' }),
  });
  vm.runInContext(
    `${gradeActionBlock};globalThis.actions = { commitDrillGrade, commitStandardGrade };`,
    context,
  );
  return context;
}

function reviewSession() {
  return { queue: [], history: [], done: { good: 0 }, ix: 0, revealed: true };
}

verified('drill-grade-action-failure-and-success', () => {
  const context = gradeContext();
  const item = { t: 'word', id: '海' };
  const next = { state: 1, scheduled_days: 0 };
  let rv = reviewSession();
  const before = JSON.stringify(rv);
  let attempts = 0;
  context.commitStorePatch = () => {
    attempts += 1;
    return false;
  };
  assert.equal(
    context.actions.commitDrillGrade({
      rv,
      item,
      next,
      key: 'good',
      skey: 'word:海',
      rating: 3,
      now: new Date(1000),
    }),
    false,
  );
  assert.equal(attempts, 1);
  assert.equal(JSON.stringify(rv), before);
  assert.equal(context.S.obslog.length, 0);

  rv = reviewSession();
  context.commitStorePatch = (patch) => {
    attempts += 1;
    Object.assign(context.S, patch);
    return true;
  };
  assert.equal(
    context.actions.commitDrillGrade({
      rv,
      item,
      next,
      key: 'good',
      skey: 'word:海',
      rating: 3,
      now: new Date(1000),
    }),
    true,
  );
  assert.equal(attempts, 2);
  assert.equal(context.S.obslog.length, 1);
  assert.equal(rv.ix, 1);
  assert.equal(rv.done.good, 1);
  assert.equal(rv.history[0].drill, true);
  assert.equal(rv.queue.length, 1);
  // a modeless call keeps the legacy four-wide row; naming the drill room
  // rides it as the trailing mode — never FSRS state, never a revlog row
  // (rows are vm-realm arrays, so compare their serialized bytes)
  assert.equal(JSON.stringify(context.S.obslog[0]), JSON.stringify([1000, 'dojo', 'word:海', 3]));
  rv = reviewSession();
  assert.equal(
    context.actions.commitDrillGrade({
      rv,
      item,
      next,
      key: 'good',
      skey: 'word:海',
      rating: 3,
      mode: 'kanji',
      now: new Date(2000),
    }),
    true,
  );
  assert.equal(context.S.obslog.length, 2);
  assert.equal(
    JSON.stringify(context.S.obslog[1]),
    JSON.stringify([2000, 'dojo', 'word:海', 3, 'kanji']),
  );
  assert.equal(context.S.revlog.length, 0);
  assert.equal(Object.keys(context.S.srs).length, 0);
  assert.equal(Object.keys(context.S.stats).length, 0);
});

verified('standard-grade-action-failure-and-success', () => {
  const context = gradeContext();
  const item = { t: 'word', id: '海' };
  const next = { state: 2, scheduled_days: 2 };
  let rv = reviewSession();
  const before = JSON.stringify(rv);
  let attempts = 0;
  context.commitStorePatch = () => {
    attempts += 1;
    return false;
  };
  const args = {
    rv,
    item,
    card: {},
    next,
    key: 'good',
    skey: 'word:海',
    rating: 3,
    now: new Date(1000),
    day: '1970-01-01',
    prevRec: undefined,
  };
  assert.equal(context.actions.commitStandardGrade(args), false);
  assert.equal(attempts, 1);
  assert.equal(JSON.stringify(rv), before);
  assert.equal(context.S.revlog.length, 0);
  assert.equal(Object.keys(context.S.srs).length, 0);

  rv = reviewSession();
  context.commitStorePatch = (patch) => {
    attempts += 1;
    Object.assign(context.S, patch);
    return true;
  };
  assert.equal(context.actions.commitStandardGrade({ ...args, rv }), true);
  assert.equal(attempts, 2);
  assert.equal(context.S.revlog.length, 1);
  assert.equal(context.S.srs['word:海'].due, 'stored');
  assert.equal(context.S.stats['1970-01-01'].n, 1);
  assert.equal(context.S.stats['1970-01-01'].nnew, 1);
  assert.equal(rv.ix, 1);
  assert.equal(rv.done.good, 1);
  assert.equal(rv.history.length, 1);
});

/* --------------------------------------------------------- the drift bridge
 * P0 #1: a Drift flick judgment must reach the one learner state as an
 * APPEND-ONLY obslog observation — synchronously, so the ack the water
 * receives is the durability result — and must never mint FSRS state,
 * S.taken rows, or review debt (exposure is not mastery). When the host
 * cannot persist the observation, the water rolls its own store back:
 * the two records never disagree about what the learner said. */
const observationBlock = between(
  '/* ------------------------------------------------ the observation log',
  "addEventListener('pagehide', obsFlush);",
);

function bridgeContext() {
  const context = vm.createContext({
    S: { obslog: [], srs: {}, taken: [], revlog: [], deepWords: {} },
    window: {},
    commitStorePatch: null,
    srsKey: (t, id) => `${t}:${id}`,
    saveStore: () => true,
    setTimeout: () => 0,
    clearTimeout: () => {},
  });
  vm.runInContext(observationBlock, context, { filename: 'corridor-observation-block.js' });
  return context;
}

verified('drift-judgment-lands-in-obslog-as-one-synchronous-observation', () => {
  const context = bridgeContext();
  let attempts = 0;
  context.commitStorePatch = (patch) => {
    attempts += 1;
    Object.assign(context.S, patch);
    return true;
  };
  const before = Date.now();
  assert.equal(context.window.bunkiDriftJudgment('word', '海', 1), true);
  assert.equal(attempts, 1, 'the ack must ride one synchronous commit, never the tap debounce');
  assert.equal(context.S.obslog.length, 1);
  const [ts, kind, key, judgment] = context.S.obslog[0];
  assert.ok(ts >= before && ts <= Date.now());
  assert.equal(kind, 'drift');
  assert.equal(key, 'word:海');
  assert.equal(judgment, 3);
  assert.equal(context.window.bunkiDriftJudgment('glyph', '語', -1), true);
  assert.equal(context.window.bunkiDriftJudgment('part', 'は', -1), true);
  assert.deepEqual(
    // JSON-normalized: the rows were minted inside the vm realm
    JSON.parse(JSON.stringify(context.S.obslog.map((row) => row.slice(1)))),
    [
      ['drift', 'word:海', 3],
      ['drift', 'kanji:語', 1],
      ['drift', 'particle:は', 1],
    ],
  );
  // every bridged row round-trips the fail-closed envelope validator
  assert.equal(
    storeApi.validStoreEnvelope({ v: 1, obslog: JSON.parse(JSON.stringify(context.S.obslog)) }),
    true,
  );
  // exposure is not mastery: no FSRS card, no capture row, no review debt
  assert.deepEqual(context.S.srs, {});
  assert.equal(context.S.taken.length, 0);
  assert.equal(context.S.revlog.length, 0);
  const bridge = betweenIn(observationBlock, 'window.bunkiDriftJudgment = (kind, key, dir) => {', '};');
  assert.match(bridge, /return commitStorePatch\(\{ obslog \}\)/);
  assert.doesNotMatch(bridge, /obsLog\(|setTimeout|srsStore|S\.srs|S\.taken|S\.revlog/);
});

verified('drift-judgment-persistence-failure-acks-false-and-appends-nothing', () => {
  const context = bridgeContext();
  let attempts = 0;
  context.commitStorePatch = () => {
    attempts += 1;
    return false;
  };
  assert.equal(context.window.bunkiDriftJudgment('word', '海', 1), false);
  assert.equal(attempts, 1);
  assert.equal(context.S.obslog.length, 0);
  assert.deepEqual(context.S.srs, {});
  assert.equal(context.S.taken.length, 0);
});

const driftGradeBlock = betweenIn(driftLayerSource, 'function grade(n,dir){', 'function updateTray(){');

verified('drift-grade-block-ships-byte-identical-to-its-source-of-truth', () => {
  assert.equal(
    driftGradeBlock,
    betweenIn(driftArtifactSource, 'function grade(n,dir){', 'function updateTray(){'),
  );
});

function driftGradeContext() {
  const calls = [];
  const context = vm.createContext({
    stack: [],
    store: { known: {}, unknown: {}, lk: 0, lu: 0 },
    settled: 0,
    gathered: 0,
    unfolded: null,
    focusN: null,
    WALKED: [],
    deck: [],
    window: {},
    saveStore: null,
    setHint: (txt) => calls.push(['hint', txt]),
    bloom: () => calls.push(['bloom']),
    sink: () => calls.push(['sink']),
    updateTray: () => calls.push(['tray']),
    clearBloom: () => {},
    removeNode: () => calls.push(['removeNode']),
    topUp: () => {},
    surface: () => {},
    vh: () => 844,
    performance: { now: () => 0 },
    setTimeout: () => 0,
  });
  vm.runInContext(`${driftGradeBlock}\n;globalThis.grade = grade;`, context, {
    filename: 'drift-grade-block.js',
  });
  return { context, calls };
}

const driftWord = () => ({
  kind: 'word',
  w: '海',
  r: 'うみ',
  g: 'sea',
  st: 'k',
  p: '',
  lvl: 3,
  gone: false,
  frozen: false,
  fromW: true,
  x: 100,
  y: 100,
  s: 1,
  cr: 0,
  el: { style: {} },
});

verified('drift-judgment-reaches-the-host-only-after-its-own-commit', () => {
  const { context, calls } = driftGradeContext();
  const order = [];
  context.saveStore = () => {
    order.push('drift-save');
    return true;
  };
  context.window.bunkiDriftJudgment = (kind, key, dir) => {
    order.push(`host:${kind}:${key}:${dir}`);
    return true;
  };
  const n = driftWord();
  context.grade(n, 1);
  assert.deepEqual(order, ['drift-save', 'host:word:海:1']);
  assert.equal(n.gone, true);
  assert.equal(context.store.known['海'], 1);
  assert.equal(context.settled, 1);
  assert.ok(calls.some(([call]) => call === 'bloom'));
});

verified('drift-store-rolls-back-when-the-host-cannot-persist', () => {
  const failingHosts = [
    ['acks false', () => false],
    ['acks nothing', () => undefined],
    [
      'throws',
      () => {
        throw new Error('host store quarantined');
      },
    ],
  ];
  for (const [name, failingHost] of failingHosts) {
    const { context, calls } = driftGradeContext();
    const saves = [];
    context.saveStore = () => {
      saves.push(JSON.parse(JSON.stringify(context.store)));
      return true;
    };
    context.window.bunkiDriftJudgment = failingHost;
    const n = driftWord();
    context.grade(n, -1);
    // the judgment rode the first (pre-ack) save; the rollback save erased it
    assert.equal(saves.length, 2, name);
    assert.equal(saves[0].unknown['海'], 1, name);
    assert.deepEqual(saves[1], { known: {}, unknown: {}, lk: 0, lu: 0 }, name);
    assert.deepEqual(context.store, { known: {}, unknown: {}, lk: 0, lu: 0 }, name);
    // the word stays in the water, the learner is told once, nothing departs
    assert.equal(n.gone, false, name);
    assert.equal(context.gathered, 0, name);
    assert.equal(calls.filter(([call]) => call === 'hint').length, 1, name);
    assert.ok(
      !calls.some(([call]) => ['bloom', 'sink', 'removeNode', 'tray'].includes(call)),
      name,
    );
  }
});

verified('drift-own-save-failure-never-reaches-the-host', () => {
  const { context } = driftGradeContext();
  let hostCalls = 0;
  context.saveStore = () => false;
  context.window.bunkiDriftJudgment = () => {
    hostCalls += 1;
    return true;
  };
  const n = driftWord();
  context.grade(n, 1);
  assert.equal(hostCalls, 0);
  assert.deepEqual(context.store, { known: {}, unknown: {}, lk: 0, lu: 0 });
  assert.equal(n.gone, false);
});

verified('drift-standalone-keeps-autonomy-without-a-host', () => {
  const { context } = driftGradeContext();
  let saves = 0;
  context.saveStore = () => {
    saves += 1;
    return true;
  };
  // no window.bunkiDriftJudgment — the standalone water grades on its own
  const n = driftWord();
  context.grade(n, 1);
  assert.equal(saves, 1);
  assert.equal(n.gone, true);
  assert.equal(context.store.known['海'], 1);
});

/* ------------------------------------------------ R2-A · scheduler policy,
 * ordered/bounded review, no-debt migration. These blocks run the REAL
 * extracted corridor code in vm, never a re-implementation. */

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
    document: fakeDocument(),
    localStorage: storage(),
    tx: (_ja, en) => en,
    srsKey: (t, id) => `${t}:${id}`,
    dayKey: () => '2026-08-16',
  });
  vm.runInContext(
    `${persistenceBlock}\n${srsBlock}\n;globalThis.__srsApi = { srsDueItems, srsNewPerDay, srsReviewLimit };`,
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

verified('one-scheduler-policy-fuzz-off-with-the-pin', () => {
  const pin = PIN;
  assert.equal(pin.enableFuzz, false);
  assert.equal(pin.reviewTimePolicyId, 'append-order-monotonic-clamp-v1');
  const schedulerInit = between('fsrsApi = window.__TSFSRS__', 'S.ready = true');
  assert.match(schedulerInit, /enable_fuzz: pin\.enableFuzz/);
  assert.doesNotMatch(schedulerInit, /fuzzOff/, 'the dead app-level override is gone');
  // R3-D · the learner's fitted weights enter through the fail-closed gate
  // and ONLY the weight vector: everything else stays the pin's policy
  assert.match(schedulerInit, /srsParamsProblem\(fitted\)/);
  assert.match(schedulerInit, /noteIgnoredSrsParams\(fittedProblem\)/);
  assert.match(schedulerInit, /w: srsCustom \? fitted\.w\.slice\(\) : pin\.w/);
  assert.match(schedulerInit, /request_retention: pin\.requestRetention/);
  // the grade path prices the four previews and the committed grade at the clamp
  const gradeRegion = between('const card = srsCardOf(item, now);', 'main.append(row);');
  assert.match(gradeRegion, /srsSchedulerInstant\(card, now\)/);
  assert.match(gradeRegion, /scheduler\.repeat\(card, schedNow\)/);
  assert.doesNotMatch(gradeRegion, /scheduler\.repeat\(card, now\)/);
});

/* ------------------------------------------- R3-D · learner FSRS parameters
 * The optimizer loop's landing: srsPrefs.fsrs may carry the learner's own
 * fitted weights, gated fail-closed at the scheduler seam. Wrong length,
 * non-finite entries, out-of-bounds values — every one of these must be
 * IGNORED (defaults rule, one quiet obslog note), never a crash and never a
 * quarantine of the whole record. */

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
  assert.equal(storeApi.saveStore(), true);
  assert.deepEqual(
    JSON.parse(storeContext.localStorage.value).srsPrefs.fsrs,
    shortSet,
    'not a byte dropped on the round trip',
  );

  // the import door: a parameter file lands through the SAME gate and the
  // guarded boundary — never a raw localStorage write, never a started mark
  const importBlock = between("file.addEventListener('change'", 'port.append(');
  assert.match(importBlock, /srsParamsProblem\(fitted\)/);
  assert.match(importBlock, /commitStorePatch\(\{ srsPrefs: \{ \.\.\.S\.srsPrefs, fsrs: fitted \} \}\)/);
  assert.match(importBlock, /candidatePin/);
  assert.ok(
    importBlock.indexOf('srsParamsProblem') < importBlock.indexOf('commitStorePatch'),
    'validation precedes the commit',
  );
});

verified('ignored-params-note-is-one-quiet-deduped-obslog-row', () => {
  const context = bridgeContext();
  vm.runInContext('globalThis.__note = noteIgnoredSrsParams;', context);
  let commits = 0;
  context.commitStorePatch = (patch) => {
    commits += 1;
    Object.assign(context.S, patch);
    return true;
  };
  context.__note('length');
  context.__note('length');
  context.__note('length');
  assert.equal(context.S.obslog.length, 1, 'the same broken field notes once, not per boot');
  const row = context.S.obslog[0];
  assert.equal(row[1], 'params');
  assert.equal(row[2], 'fsrs');
  assert.equal(row[3], 'length');
  // a DIFFERENT problem is new evidence and appends
  context.__note('bounds');
  assert.equal(context.S.obslog.length, 2);
  assert.equal(context.S.obslog[1][3], 'bounds');
  // every note round-trips the fail-closed envelope validator
  assert.equal(
    storeApi.validStoreEnvelope({ v: 1, obslog: JSON.parse(JSON.stringify(context.S.obslog)) }),
    true,
  );
  // the note is an observation: no FSRS state, no capture, no review debt
  assert.deepEqual(context.S.srs, {});
  assert.equal(context.S.taken.length, 0);
  assert.equal(context.S.revlog.length, 0);
  assert.equal(commits, 0, 'the note rides the obslog debounce, never its own commit');
});

verified('bounded-standard-review-freeze-and-dojo-refill-kept', () => {
  const startBlock = between('function startReview(scope) {', '/* An instrument handle');
  assert.match(startBlock, /srsReviewLimit\(\)/);
  assert.match(startBlock, /queue\.slice\(0, limit\)/);
  assert.match(startBlock, /deferred/);
  const refill = between('function refillFocusQueue(rv) {', 'function startFocus(');
  assert.match(refill, /FOCUS_BATCH/, 'the timed dojo keeps its refill pacing');
});

verified('every-in-app-mint-carries-the-started-mark', () => {
  // capture (覚える), lane bulk memorize, lesson completion, probe miss mint
  assert.match(captureActionBlock, /started: now/);
  const laneMint = between('const fresh = ids.filter((id) => !takenSet.has(srsKey(t, id)));', '/* --------------------------------------------------------------- lessons');
  assert.match(laneMint, /started: Date\.now\(\)/);
  const lessonMint = between('S.lessonsDone[run.id] =', 'run.phase =');
  assert.match(lessonMint, /started: Date\.now\(\)/);
  const probeMint = between("if (!ok && !S.taken.some((t) => t.t === 'word'", 'obsLog(');
  assert.match(probeMint, /started: Date\.now\(\)/);
  // and the queue admits a cardless row only through that mark
  const dueGate = between('function srsDueItems(now = new Date()) {', '/** Midnight at the start of a date');
  assert.match(dueGate, /finiteNumber\(item\.started\)/);
  // the import door writes the file verbatim — it must not fabricate the mark
  const importBlock = between("file.addEventListener('change'", 'port.append(');
  assert.doesNotMatch(importBlock, /started/);
});

verified('bounded-handlers-call-executed-actions', () => {
  const finishHandler = between("finBtn.id = 'read-fin';", '  fin.append(finBtn);');
  assert.match(finishHandler, /commitReadDone\(p\.id\)/);
  assert.doesNotMatch(finishHandler, /saveStore\(|S\.readDone\[/);

  // capture is reversible now (operator directive §3): both directions ride
  // the guarded transactional path through toggleTaken
  const captureHandler = between('function toggleTaken(node, label) {', '/** After 覚える:');
  assert.match(captureHandler, /commitCapture\(node, label\)/);
  assert.match(captureHandler, /commitStorePatch\(\{ taken:/);
  assert.doesNotMatch(captureHandler, /saveStore\(|S\.taken\.push|S\.taken\.splice|S\.deepWords\[/);

  const gradeHandler = between(
    'for (const [rating, key, ja, sealChar] of grades) {',
    '  main.append(row);',
  );
  assert.match(gradeHandler, /commitDrillGrade\(/);
  assert.match(gradeHandler, /commitStandardGrade\(/);
  // the drill's evidence row names its room (P0: practice writes evidence only)
  assert.match(gradeHandler, /mode: S\.focus\?\.mode/);
  assert.doesNotMatch(gradeHandler, /saveStore\(|obsLog\(|srsStore\(|rv\.history\.push/);
});

verified('setitem-try-block-excludes-alert-and-publication-code', () => {
  const writeStore = between('function writeStore(state) {', 'function saveStore() {');
  const storageTry = writeStore.match(
    /try\s*\{\s*localStorage\.setItem\(STORE_KEY, bytes\);\s*\}\s*catch/,
  );
  assert.ok(storageTry, 'setItem must be the only statement in its durability try block');
  assert.doesNotMatch(storageTry[0], /syncStoreAlert|storeError|Object\.assign/);
  assert.ok(
    writeStore.indexOf('S.storeError = null') > writeStore.indexOf('localStorage.setItem(STORE_KEY, bytes)'),
  );
  assert.ok(
    writeStore.indexOf('safelySyncStoreAlert();', writeStore.indexOf('S.storeError = null')) >
      writeStore.indexOf('S.storeError = null'),
  );
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
  assert.match(source, /document\.body\.append\(storeAlertNode\)/);
  assert.match(source, /setAttribute\('role', 'alert'\)/);
  const alertSync = between('function syncStoreAlert() {', '/** Storage truth never depends');
  assert.match(alertSync, /document\.getElementById\('sheet'\)/);
  assert.match(alertSync, /describedBy\.add\('store-alert'\)/);
  assert.match(alertSync, /describedBy\.delete\('store-alert'\)/);
  const sheetRenderer = between('function renderSheet(root) {', 'function licencePanel()');
  assert.doesNotMatch(sheetRenderer, /aria-describedby/);
});

verified('live-sticky-grade-row-is-byte-preserved', () => {
  const base = spawnSync('git', ['show', `${BASE}:prototypes/corridor/corridor.css`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(base.status, 0, base.stderr || base.stdout);
  assert.equal(cssRule(css, 'body.zen .grade-row'), cssRule(base.stdout, 'body.zen .grade-row'));
});

verified('residual-and-direct-bypass-ledger-is-exact', () => {
  const residual = JSON.parse(readFileSync(residualPath, 'utf8'));
  assert.equal(residual.schemaVersion, 2);
  assert.equal(residual.authorityHeadAtCut, BASE);
  assert.equal(residual.count, 19);
  assert.equal(residual.callers.length, 19);
  assert.ok(residual.callers.every((entry) => entry.saveResultConsumed === false));

  const lines = source.split(/\r?\n/);
  const saveLines = lines
    .map((line, index) => (/\bsaveStore\s*\(\s*\)\s*;/.test(line) ? index + 1 : null))
    .filter(Boolean);
  assert.deepEqual(
    residual.callers.map((entry) => entry.lineAfterPatch),
    saveLines,
  );

  const persistenceEndLine = source.slice(0, source.indexOf('/* ------------------------------------------------ the observation log')).split(/\r?\n/)
    .length;
  const bypasses = [];
  lines.forEach((line, index) => {
    const match = line.match(/localStorage\.(getItem|setItem)\(STORE_KEY/);
    if (match && index + 1 > persistenceEndLine) bypasses.push({ lineAfterPatch: index + 1, operation: match[1] });
  });
  assert.deepEqual(
    residual.directLearnerStoreBypasses.map(({ lineAfterPatch, operation }) => ({
      lineAfterPatch,
      operation,
    })),
    bypasses,
  );
  const undo = residual.callers.find((entry) => entry.surface === 'review undo');
  assert.ok(undo.learnerRootsMutatedBeforeUncheckedSave.includes('obslog'));
  const probe = residual.callers.find((entry) => entry.surface === 'yomi probe grade or mint');
  assert.deepEqual(probe.learnerRootsMutatedBeforeUncheckedSave, ['taken', 'obslog']);
});

verified('javascript-syntax', () => {
  const syntax = spawnSync(process.execPath, ['--check', corridorPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
});

console.log(
  JSON.stringify(
    {
      status: 'PASS',
      checks: checks.length,
      checkNames: checks,
      boundedFlows: [
        'learner-store-read-quarantine',
        'deep-known-root-validation',
        'reserved-map-name-round-trip',
        'exact-byte-candidate-self-validation',
        'write-before-publish-helper',
        'post-setitem-ui-failure-isolation',
        'reader-finish',
        'entry-capture',
        'entry-capture-context',
        'standard-review-grade',
        'focus-drill-grade',
        'drift-judgment-observation-bridge',
        'drift-host-ack-rollback',
        'stable-storage-alert',
        'dynamic-sheet-alert-description',
        'article-load-retry',
        'scheduler-clock-clamp',
        'due-queue-order-and-no-debt',
        'fuzz-off-scheduler-policy',
        'bounded-standard-review',
        'started-mark-promotion',
        'learner-fsrs-params-gate',
        'ignored-params-obslog-note',
      ],
      residualUnsafeSaveCallers: 19,
      browserAndDevice: 'NOT_RUN',
    },
    null,
    2,
  ),
);
