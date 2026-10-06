import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const core = require('../reference-core.js');
const context = {};
context.window = context;
vm.runInNewContext(readFileSync(new URL('../reference-ui.js', import.meta.url), 'utf8'), context);
const fixture = {
  dict: {
    '～月': { r: '～つき', m: ['moon'], jlpt: 'N4' },
    生: { r: 'せい', m: ['life'], jlpt: 'N4' },
    Ａ: { r: 'エー', m: ['fullwidth'], jlpt: 'N4' },
  },
  words: { '～月': { r: '～がつ', m: ['month'], jlpt: 'N5' }, 生: { r: 'なま', m: ['raw'], jlpt: 'N5' } },
  extra: {
    extraWords: [
      ['生', 'しょう', ['birth'], 'N3', 'source-birth'],
      ['生', 'なま', ['fresh'], 'N5', 'source-fresh'],
      ['Ａ', 'えー', ['different exact reading'], 'N5', 'source-hiragana'],
    ],
    wordLinks: [['生', 'なま', ['100']], ['生', 'しょう', ['200', '201']]],
  },
};
const catalog = core.createCatalog(fixture);
const controller = context.BunkiReferenceUI.create({ catalog, getTaken: () => [] });
const word = (form, reading) => controller.entry('word', JSON.stringify([form, reading]));

test('Reference controller opens each exact homograph and refuses an ambiguous printed id', () => {
  for (const [form, reading, level, meaning] of [
    ['～月', '～つき', 'N4', 'moon'], ['～月', '～がつ', 'N5', 'month'],
    ['生', 'せい', 'N4', 'life'], ['生', 'なま', 'N5', 'raw'], ['生', 'しょう', 'N3', 'birth'],
  ]) {
    const entry = word(form, reading);
    assert(entry, `${form}/${reading}`);
    assert.equal(entry.id, form);
    assert.equal(entry.reading, reading);
    assert(entry.meanings.includes(meaning));
    assert.deepEqual(entry.levelSources.map(source => source.level), entry.variants.map(source => source.level));
    assert(catalog.collections.find(collection => collection.id === `jlpt:${level}`).entries.includes(entry));
  }
  assert.equal(controller.entry('word', '～月'), null);
  assert.equal(controller.entry('word', '生'), null);
  assert.notEqual(word('Ａ', 'エー').key, word('Ａ', 'えー').key);
  assert.equal(controller.entry('word', JSON.stringify(['A', 'エー'])), null);
});

test('Canonical redirects use the runtime-resolved exact reading without borrowing a shadowed record', () => {
  assert.deepEqual(word('～月', '～つき').canonicalTarget, { type: 'word', id: '～月', reading: '～つき' });
  assert.equal(word('～月', '～がつ').canonicalTarget, null);
  assert.equal(word('生', 'なま').canonicalTarget, null);
  assert.equal(word('生', 'しょう').canonicalTarget, null);
  assert.deepEqual(word('生', 'なま').dictionaryLinks[0].candidates, ['100']);
  assert.deepEqual(word('生', 'しょう').dictionaryLinks[0].candidates, ['200', '201']);
});

test('Distinct source senses and attestation IDs survive without transferring readings or levels', () => {
  const fresh = word('生', 'なま');
  assert.deepEqual(fresh.variants.map(variant => variant.meanings), [['raw'], ['fresh']]);
  assert.equal(fresh.variants[1].sourceId, 'source-fresh');
  assert(fresh.levelSources.every(source => source.level === 'N5' && source.reading === 'なま'));
  assert.equal(core.search(catalog.collections.find(collection => collection.id === 'jlpt:N5'), 'birth').total, 0);
});

test('Exact source strings containing separators cannot collide in word keys', () => {
  assert.notEqual(core.wordKey('a:b', 'c'), core.wordKey('a', 'b:c'));
  assert.notEqual(core.wordKey('a\u0000b', 'c'), core.wordKey('a', 'b\u0000c'));
  assert.notEqual(core.wordKey('Ａ', 'えー'), core.wordKey('A', 'えー'));
});
