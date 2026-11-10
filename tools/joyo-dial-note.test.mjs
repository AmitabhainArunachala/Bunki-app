/**
 * The 常用まで note (port of origin/claude/corridor-live-verify, dialNote): set to jōyō only, the reader says which kanji
 * the dial sets in kana in this text, or that it changes nothing. The note and the text share one rule (joyoPairs), so
 * the note can never name a kanji the text keeps, or miss one it changes. Shipped code, run with stub data.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

const corridor = new URL('../prototypes/corridor/', import.meta.url);
const read = (path) => readFileSync(new URL(path, corridor), 'utf8');
function slice(text, start, end, label) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a);
  expect(a >= 0 && b > a && text.indexOf(start, a + 1) < 0, `one ${label}`).toBe(true);
  return text.slice(a, b);
}

function load() {
  const dictionary = read('modules/dictionary.mjs');
  const source = [
    slice(read('modules/worlds.mjs'), 'function beyondJoyo(', 'function storySeries(', 'beyondJoyo'),
    slice(dictionary, 'function joyoPairs(', 'function inlineWordReading(', 'joyoPairs … displayPairs'),
  ].join('\n');
  const context = {
    // 鐵 and 屡 are not in the 漢検 table (so not jōyō); 稜 is 準1級; the rest are jōyō
    D: { kanken: { 時: { kk: '9級' }, 間: { kk: '9級' }, 道: { kk: '9級' }, 線: { kk: '8級' }, 稜: { kk: '準1級' }, 人: { kk: '10級' } } },
    S: { dials: { kanji: 1 } },
    BEYOND_JOYO: new Set(['準1級', '1級']),
    JOYO_JUDGEABLE: /[\u3400-\u4dbf\u4e00-\u9fff]/,
    JOYO_MARKS: /[々〆ヶ]/,
  };
  runInNewContext(source, context);
  return context;
}

const tokens = [
  { s: '時間', f: [{ t: '時間', r: 'じかん' }] },
  { s: 'の', f: [{ t: 'の' }] },
  { s: '鐵道', f: [{ t: '鐵', r: 'てつ' }, { t: '道', r: 'どう' }] },
  { s: '屡々', f: [{ t: '屡々', r: 'しばしば' }] },
  { s: '稜線', f: [{ t: '稜', r: 'りょう' }, { t: '線', r: 'せん' }] },
  { s: '鐵', f: [{ t: '鐵', r: 'てつ' }] },
  { s: '人々', f: [{ t: '人々', r: 'ひとびと' }] },
  { s: '蟹', f: [{ t: '蟹' }] },
];

describe('the 常用まで note', () => {
  it('names each kanji the dial sets in kana, once, in reading order; a mark is never named', () => {
    const { joyoDialChanges } = load();
    expect(joyoDialChanges(tokens)).toEqual(['鐵', '屡', '稜']);
  });

  it('a text the dial leaves as written gets an empty list (the note then says nothing changes)', () => {
    const { joyoDialChanges } = load();
    expect(joyoDialChanges(tokens.slice(0, 2))).toEqual([]);
    expect(joyoDialChanges([{ s: '蟹', f: [{ t: '蟹' }] }])).toEqual([]); // no reading: the dial keeps it, so the note does
    expect(joyoDialChanges(undefined)).toEqual([]);
  });

  it('the text and the note share the rule: exactly the named kanji leave the page', () => {
    const { joyoDialChanges, displayPairs } = load();
    const named = new Set(joyoDialChanges(tokens));
    for (const token of tokens) {
      const shown = displayPairs(token).map((pair) => pair.t).join('');
      for (const ch of token.s) if (/[\u4e00-\u9fff]/u.test(ch)) expect(shown.includes(ch), `${token.s} ${ch}`).toBe(!named.has(ch) || !token.f.some((p) => p.r && p.t.includes(ch)));
    }
    expect(displayPairs(tokens[2])).toEqual([{ t: 'てつ' }, { t: '道', r: 'どう' }]);
    expect(displayPairs(tokens[6])).toEqual([{ t: '人々', r: 'ひとびと' }]);
  });
});
