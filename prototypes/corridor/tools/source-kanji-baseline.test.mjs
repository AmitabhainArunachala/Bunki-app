import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';

const require = createRequire(resolve('package.json'));
const { parse } = require('acorn');
const source = readFileSync('prototypes/corridor/tools/verify-source-kanji-practice.mjs', 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const names = ['authorityUnchanged', 'unchangedExcept', 'readerSettled', 'openWord'];
const functions = names.map((name) => {
  const found = ast.body.filter((node) => node.type === 'FunctionDeclaration' && node.id?.name === name);
  assert.equal(found.length, 1, `Expected one actual verifier function: ${name}`);
  return source.slice(found[0].start, found[0].end);
}).join('\n');

async function exercise(fault = '') {
  const context = vm.createContext({ assert, fault });
  vm.runInContext(`
    let clock = 0, bookmarkDue = null, focusCount = 0;
    const Date = { now: () => clock };
    const state = {
      record: { readerPos: { article: 2246 }, obslog: [], met: {} },
      revision: 0, archive: [], installation: { id: 'isolated-test' },
      rows: [{ kind: 'actor', text: 'unchanged actor bytes' }]
    };
    const copy = () => JSON.parse(JSON.stringify(state));
    async function delay(ms) {
      clock += ms;
      if (bookmarkDue !== null && clock >= bookmarkDue) {
        state.record.readerPos.article = 144;
        state.revision += 1;
        bookmarkDue = null;
      }
    }
    async function readAppRecordSnapshot() { return copy(); }
    async function snapshot() { return copy(); }
    async function focusSourceWord() {
      focusCount += 1;
      bookmarkDue = clock + 900;
      if (fault === 'focus-learning') state.record.met.unexpected = 1;
      if (fault === 'focus-authority') state.rows[0].text = 'mutated actor bytes';
    }
    async function waitForAppRecord(page, predicate) {
      await delay(1000);
      assert(predicate(state.record), 'The actual entry observation must be present');
    }
    const fixture = {
      wordVisits: 0, source: { id: 'article', index: 42, token: { b: '匿名' } },
      page: {
        locator() { return { async waitFor() {} }; },
        keyboard: { async press(key) {
          assert.equal(key, 'Control+Enter');
          state.record.obslog.push([clock, 'tap', 'word:匿名', 3, 'article']);
          if (fault === 'entry-bookmark') state.record.readerPos.article = 999;
        } }
      }
    };
    ${functions}
  `, context);
  await vm.runInContext('openWord(fixture)', context);
  return JSON.parse(vm.runInContext('JSON.stringify({ state, focusCount })', context));
}

test('keyboard navigation settles its legitimate bookmark before entry observation is isolated', async () => {
  const result = await exercise();
  assert.equal(result.focusCount, 1);
  assert.equal(result.state.record.readerPos.article, 144);
  assert.equal(result.state.record.obslog.length, 1);
  assert.deepEqual(result.state.record.met, {});
});

test('an unexpected bookmark write during entry opening still fails the unchanged post-action assertion', async () => {
  await assert.rejects(exercise('entry-bookmark'), /Unexpected learner root change: readerPos/);
});

test('navigation cannot hide a learning mutation by moving the observation baseline', async () => {
  await assert.rejects(exercise('focus-learning'), /Unexpected learner root change: met/);
});

test('navigation cannot hide an authority-row mutation by moving the observation baseline', async () => {
  await assert.rejects(exercise('focus-authority'), /actor rows and exact native bytes remain unchanged/);
});
