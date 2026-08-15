#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const corridorUrl = new URL('../corridor.js', import.meta.url);
const corridorPath = fileURLToPath(corridorUrl);
const source = readFileSync(corridorPath, 'utf8');

function between(start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing source marker: ${start}`);
  const to = source.indexOf(end, from);
  assert.notEqual(to, -1, `missing source marker: ${end}`);
  return source.slice(from, to);
}

function state(overrides = {}) {
  return {
    storeReadOnly: false,
    storeError: null,
    storeExtras: { futureField: { keep: true } },
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
    stats: {},
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
    onSet: null,
    getItem() {
      if (this.getError) throw this.getError;
      return this.value;
    },
    setItem(_key, next) {
      if (this.setError) throw this.setError;
      if (this.onSet) this.onSet(next);
      this.value = next;
      this.writes += 1;
    },
  };
}

const persistenceBlock = between(
  "const STORE_KEY = 'kairo-corridor-v1';",
  '/* ------------------------------------------------ the observation log',
);
const storeContext = vm.createContext({
  S: state(),
  localStorage: storage(),
  tx: (_ja, en) => en,
});
vm.runInContext(
  `${persistenceBlock}\n;globalThis.__storeApi = { loadStore, saveStore, commitStorePatch, storeEnvelope };`,
  storeContext,
  { filename: 'corridor-persistence-block.js' },
);
const storeApi = storeContext.__storeApi;

// A read exception means the device record is unknown, never empty.
storeContext.S = state();
storeContext.localStorage = storage('{"v":1,"taken":[{"id":"durable"}]}');
storeContext.localStorage.getError = new Error('blocked');
storeApi.loadStore();
assert.equal(storeContext.S.storeReadOnly, true);
assert.match(storeContext.S.storeError, /could not be accessed/);
assert.equal(storeContext.localStorage.writes, 0);

// Empty, malformed, and future-version bytes all enter read-only quarantine.
for (const raw of ['', '{broken', '{"v":2,"taken":[]}']) {
  storeContext.S = state();
  storeContext.localStorage = storage(raw);
  storeApi.loadStore();
  assert.equal(storeContext.S.storeReadOnly, true, `expected quarantine for ${JSON.stringify(raw)}`);
  assert.equal(storeContext.localStorage.value, raw);
  assert.equal(storeContext.localStorage.writes, 0);
}

// Read-only sessions suppress writes and keep every live root intact.
storeContext.S = state({ storeReadOnly: true, storeError: 'protected' });
storeContext.localStorage = storage('{"durable":"canary"}');
const protectedTaken = storeContext.S.taken;
assert.equal(storeApi.commitStorePatch({ taken: [{ t: 'word', id: 'new' }] }), false);
assert.strictEqual(storeContext.S.taken, protectedTaken);
assert.equal(storeContext.localStorage.value, '{"durable":"canary"}');
assert.equal(storeContext.localStorage.writes, 0);

// A failure-atomic setItem throw leaves durable bytes and live roots unchanged.
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

// On success, candidate bytes are handed to setItem while the live roots are
// still old; unknown envelope fields survive the replacement.
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

// A rejected article body promise is never pinned in the passage record.
const articleBlock = between(
  'const bundledArticle = (p) =>',
  '/* --------------------------------------------------- 新聞アーカイブ',
);
let fetches = 0;
const articleContext = vm.createContext({
  window: {},
  fetch: async () => {
    fetches += 1;
    if (fetches === 1) throw new Error('first fetch failed');
    return { ok: true, json: async () => ({ text: '本文', tokens: [{ s: '本文' }] }) };
  },
});
vm.runInContext(
  `${articleBlock}\n;globalThis.__articleApi = { ensureArticle };`,
  articleContext,
  { filename: 'corridor-article-block.js' },
);
const passage = { file: 'retry.json' };
await assert.rejects(articleContext.__articleApi.ensureArticle(passage), /first fetch failed/);
assert.equal(Object.hasOwn(passage, '_loading'), false);
await articleContext.__articleApi.ensureArticle(passage);
assert.equal(fetches, 2);
assert.equal(passage.text, '本文');
assert.equal(Object.hasOwn(passage, '_loading'), false);

// Source contracts keep the bounded handlers copy-on-write and single-commit.
const finishHandler = between("finBtn.id = 'read-fin';", '  fin.append(finBtn);');
assert.match(finishHandler, /const readDone = \{ \.\.\.S\.readDone \}/);
assert.match(finishHandler, /commitStorePatch\(\{ readDone \}\)/);
assert.doesNotMatch(finishHandler, /S\.readDone\[[^\]]+\]\s*=|saveStore\(/);

const captureHandler = between('function takeButton(node, label) {', '/** After 覚える:');
assert.match(captureHandler, /taken: \[\.\.\.S\.taken, item\]/);
assert.match(captureHandler, /commitStorePatch\(patch\)/);
assert.doesNotMatch(captureHandler, /S\.taken\.push|S\.deepWords\[[^\]]+\]\s*=|saveStore\(/);

const gradeHandler = between(
  'for (const [rating, key, ja, sealChar] of grades) {',
  '  main.append(row);',
);
assert.match(gradeHandler, /commitStorePatch\(\{ obslog \}\)/);
assert.match(gradeHandler, /commitStorePatch\(\{ srs, revlog, stats \}\)/);
assert.doesNotMatch(gradeHandler, /obsLog\(|srsStore\(|saveStore\(/);
assert.ok(
  gradeHandler.indexOf('commitStorePatch({ obslog })') < gradeHandler.indexOf('rv.history.push(entry)'),
  'drill session must advance only after persistence',
);
assert.ok(
  gradeHandler.indexOf('commitStorePatch({ srs, revlog, stats })') <
    gradeHandler.lastIndexOf('rv.history.push(entry)'),
  'standard review session must advance only after persistence',
);

const sheetRenderer = between('function renderSheet(root) {', 'function licencePanel()');
assert.match(sheetRenderer, /S\.storeError/);
assert.match(sheetRenderer, /setAttribute\('role', 'alert'\)/);
const appRenderer = between('function render() {', "window.addEventListener('DOMContentLoaded'");
assert.match(appRenderer, /S\.storeError && S\.view !== 'tray'/);
assert.match(appRenderer, /setAttribute\('role', 'alert'\)/);

// The donor is intentionally bounded; keep its residual-safety claim exact.
const residualSaveCallers = source.match(/\bsaveStore\(\);/g) || [];
assert.equal(residualSaveCallers.length, 19);

const syntax = spawnSync(process.execPath, ['--check', corridorPath], { encoding: 'utf8' });
assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);

console.log(
  JSON.stringify(
    {
      status: 'PASS',
      checks: 28,
      boundedFlows: [
        'learner-store-read-quarantine',
        'write-before-publish-helper',
        'reader-finish',
        'entry-capture',
        'standard-review-grade',
        'focus-drill-grade',
        'article-load-retry',
      ],
      residualUnsafeSaveCallers: residualSaveCallers.length,
    },
    null,
    2,
  ),
);
