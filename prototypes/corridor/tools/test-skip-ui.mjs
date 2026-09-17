import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const core = require('../skip-core.js');
const source = readFileSync(new URL('../skip-ui.js', import.meta.url), 'utf8');
function ui(engine = core) {
  const context = { BunkiSkipCore: engine };
  vm.runInNewContext(source, context);
  return context.BunkiSkipUI;
}

test('Ordinary English searches stay in the dictionary with or without the SKIP engine', () => {
  for (const engine of [core, null]) {
    for (const query of ['skip', ' skip ', 'skip meaning', 'skip 5 pages', 'skipping', 'ＳＫＩＰ　meaning', '']) {
      assert.equal(ui(engine).parse(query).kind, 'text', query);
    }
  }
});

test('Numeric and wildcard whitespace shorthand retain dedicated lookup behavior', () => {
  for (const query of ['skip 1-3-8', 'SKIP 1-3-*', 'ＳＫＩＰ　１－３－８', 'skip 1', 'skip *-3-8', '1-3-8', 'skip:1-3-8',
    ...['‐', '‑', '‒', '–', '—', '―', '−', '﹘', '﹣'].map(hyphen => `skip 1${hyphen}3${hyphen}8`)]) {
    assert.equal(ui().parse(query).kind, 'skip', query);
  }
  for (const query of ['skip:meaning', 'skip 9-3-8', 'skip 1-3-8-4']) {
    assert.equal(ui().parse(query).kind, 'invalid', query);
  }
});

test('Unavailable SKIP engine reports only actual lookup syntax as unavailable', () => {
  for (const query of ['skip 1-3-8', 'ＳＫＩＰ　１－３－８', '1-3-8', 'skip:']) {
    const result = ui(null).parse(query);
    assert.equal(result.kind, 'invalid', query);
    assert.match(result.error, /unavailable/);
  }
});

test('Fallback metadata preserves actual missing readings, provenance and independent arrays', () => {
  const entry = { literal: '㐆', meanings: ['to follow', 'to trust'], readings: { on: [], kun: [] }, strokeCounts: [6], radical: 4 };
  const state = { byChar: new Map([['㐆', entry]]), data: {
    schemaVersion: 1,
    sources: [{ release: 'pinned-release', sha256: 'archive-hash' }],
    provenance: { dictionaryDate: '2026-08-03', databaseVersion: '2026-215' },
  } };
  const first = ui().getKanji(state, '㐆');
  assert.equal(first.m, 'to follow; to trust');
  assert.equal(first.on.length, 0);
  assert.equal(first.kun.length, 0);
  assert.equal(first.sourceVersion.release, 'pinned-release');
  assert.equal(first.sourceVersion.archiveSha256, 'archive-hash');
  first.meanings.push('mutated'); first.on.push('invented'); first.sourceVersion.release = 'changed';
  const second = ui().getKanji(state, '㐆');
  assert.equal(second.meanings.length, 2);
  assert.equal(second.on.length, 0);
  assert.equal(second.sourceVersion.release, 'pinned-release');
  assert.equal(ui().getKanji(state, 'wrong'), null);
  entry.meanings = [];
  assert.equal(ui().getKanji(state, '㐆').m, '', 'A placeholder is not a review answer');
});
