/**
 * Furigana alignment (REQ-UI-08 "first-class furigana").
 *
 * The property that matters is not "it splits" — it is that a split is never
 * *wrong*. So every assertion below is either an exact expected split or the
 * invariant that the segments reassemble into the original written form and the
 * rubies reassemble into the original reading. A misalignment that satisfied
 * both would be indistinguishable from a correct one, and there is no such
 * misalignment for the anchor walk.
 */

import { describe, expect, it } from 'vitest';

import { seedDataset } from '@bunki/seed';

import {
  alignFurigana,
  foldToHiragana,
  furiganaAccessibilityLabel,
  isKana,
} from '../src/ui/furigana.ts';

describe('kana classification', () => {
  it('recognises hiragana, katakana and the prolonged sound mark', () => {
    for (const char of ['あ', 'ん', 'ア', 'ン', 'ー', 'っ', 'ゃ']) {
      expect(isKana(char)).toBe(true);
    }
  });

  it('does not treat kanji, latin or punctuation as kana', () => {
    for (const char of ['分', '岐', 'a', '1', '。', '・']) {
      expect(isKana(char)).toBe(false);
    }
  });

  it('folds katakana to hiragana and leaves everything else alone', () => {
    expect(foldToHiragana('カタカナ')).toBe('かたかな');
    expect(foldToHiragana('分ケル')).toBe('分ける');
    expect(foldToHiragana('ー')).toBe('ー');
  });
});

describe('alignment', () => {
  it('puts the reading over the kanji and leaves okurigana bare', () => {
    const { segments, precision } = alignFurigana('分かれる', 'わかれる');
    expect(precision).toBe('aligned');
    expect(segments).toEqual([
      { text: '分', ruby: 'わ' },
      { text: 'かれる', ruby: null },
    ]);
  });

  it('handles a leading kana run', () => {
    const { segments, precision } = alignFurigana('お茶', 'おちゃ');
    expect(precision).toBe('aligned');
    expect(segments).toEqual([
      { text: 'お', ruby: null },
      { text: '茶', ruby: 'ちゃ' },
    ]);
  });

  it('treats an all-kanji word as one whole-word ruby, which is exact not a fallback', () => {
    const { segments, precision } = alignFurigana('分岐', 'ぶんき');
    expect(precision).toBe('whole-word');
    expect(segments).toEqual([{ text: '分岐', ruby: 'ぶんき' }]);
  });

  it('gives an all-kana word no ruby at all', () => {
    const { segments, precision } = alignFurigana('ひらがな', 'ひらがな');
    expect(precision).toBe('aligned');
    expect(segments).toEqual([{ text: 'ひらがな', ruby: null }]);
  });

  it('falls back to the whole word rather than guessing when the reading does not fit', () => {
    const { segments, precision } = alignFurigana('分かれる', 'まったくちがう');
    expect(precision).toBe('unaligned');
    expect(segments).toEqual([{ text: '分かれる', ruby: 'まったくちがう' }]);
  });

  it('does not assign an empty reading to a kanji run', () => {
    // 分か + かれる would let 分 take zero mora if the anchor search started at
    // the cursor instead of after it.
    const { segments } = alignFurigana('分か', 'わか');
    expect(segments[0]?.ruby).toBe('わ');
  });

  it('reassembles the original word and reading for every seed lexeme', () => {
    for (const lexeme of seedDataset.lexemes) {
      const { segments } = alignFurigana(lexeme.headword, lexeme.reading);
      expect(segments.map((segment) => segment.text).join('')).toBe(lexeme.headword);

      const reassembled = segments
        .map((segment) => segment.ruby ?? foldToHiragana(segment.text))
        .join('');
      expect(foldToHiragana(reassembled)).toBe(foldToHiragana(lexeme.reading));
    }
  });

  it('aligns or whole-words every seed lexeme — never falls back for real data', () => {
    const fallbacks = seedDataset.lexemes.filter(
      (lexeme) => alignFurigana(lexeme.headword, lexeme.reading).precision === 'unaligned',
    );
    expect(fallbacks.map((lexeme) => lexeme.headword)).toEqual([]);
  });
});

describe('accessibility label', () => {
  it('speaks the word and its reading once', () => {
    expect(furiganaAccessibilityLabel('分岐', 'ぶんき')).toBe('分岐（ぶんき）');
  });

  it('does not repeat an all-kana word', () => {
    expect(furiganaAccessibilityLabel('ひらがな', 'ひらがな')).toBe('ひらがな');
  });
});
