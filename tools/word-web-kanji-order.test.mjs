/* global URL */
/** John saw 職業 drawn with ぎょう on the left and しょく on the right: words.json lists many words' kanji out of
 * reading order (業 before 職). Builder C made the word web hang a word's kanji in reading order (wwKanjiOf); this
 * guards it over every such word in the data (owed repair 5, 2026-11-10: proved on the screen, kept by this test).
 * The web hangs the first kanji on the left branch (WW_KANJI_ANGLES), so reading order is left to right. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test } from 'vitest';
import { CORRIDOR, corridorDeclarations } from './corridor-declarations.mjs';

const json = (path) => JSON.parse(readFileSync(new URL(path, CORRIDOR), 'utf8'));
const D = {
  words: json('data/share_alike/words.json').words,
  dict: json('data/share_alike/dict.json').words,
  kanji: json('data/share_alike/kanji.json').kanji,
};
const web = vm.createContext({ D });
vm.runInContext(
  [
    corridorDeclarations('modules/worlds.mjs', ['wwKanjiOf']),
    corridorDeclarations('corridor.js', ['WW_W', 'WW_CX', 'WW_CY', 'wwP', 'WW_KANJI_ANGLES']),
  ].join('\n'),
  web,
);
const kanjiOf = (word) => [...vm.runInContext('wwKanjiOf', web)(word)];

test('職業 and the words stored out of order hang their kanji in reading order, the first on the left', () => {
  expect(D.words['職業'].k).toEqual(['業', '職']);
  expect(kanjiOf('職業')).toEqual(['職', '業']);
  expect(kanjiOf('外国人')).toEqual(['外', '国', '人']);
  expect(kanjiOf('意味')).toEqual(['意', '味']);
  expect(kanjiOf('鉛筆')).toEqual(['鉛', '筆']);
  // the first branch of a two- or three-kanji web is drawn left of the next
  const at = (n) => vm.runInContext(`WW_KANJI_ANGLES[${n}].map((a) => wwP(a, 102, 92)[0])`, web);
  for (const n of [2, 3, 4]) {
    const xs = at(n);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  }
});

test('every word whose stored kanji are out of reading order is drawn in reading order', () => {
  let reversed = 0;
  for (const [word, row] of Object.entries(D.words)) {
    const stored = [...new Set(row.k || [])].filter((c) => D.kanji[c]);
    const order = [...stored].sort((a, b) => [...word].indexOf(a) - [...word].indexOf(b));
    if (stored.every((c) => word.includes(c)) && stored.join('') !== order.join('')) {
      reversed += 1;
      expect(kanjiOf(word), word).toEqual(order);
    }
  }
  expect(reversed).toBeGreaterThan(2000);
});
