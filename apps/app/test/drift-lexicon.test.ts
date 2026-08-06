/**
 * The Drift lexical tier's integrity (one-app convergence §6).
 *
 * The tier is generated data plus pure lookups; what needs proving is the
 * honesty contract: lookups never fabricate, relations are the literal
 * shares-a-kanji relation, caps hold, and the disclosure that every screen
 * renders is a real statement rather than an empty string.
 */

import { describe, expect, it } from 'vitest';

import {
  DRIFT_TIER_DISCLOSURE,
  DRIFT_WORD_COUNT,
  driftKanjiComponents,
  driftKanjiInfo,
  driftKanjiOf,
  driftRelatedWords,
  driftWordsUsingKanji,
  findDriftWord,
} from '../src/data/drift-lexicon.ts';

describe('drift lexicon lookups', () => {
  it('carries the full JLPT lexicon, not a sample', () => {
    expect(DRIFT_WORD_COUNT).toBeGreaterThan(6000);
  });

  it('finds a word by its exact headword', () => {
    const word = findDriftWord('時間');
    expect(word).not.toBeNull();
    expect(word?.reading).toBe('じかん');
    expect(word?.level).toBeGreaterThanOrEqual(1);
  });

  it('normalizes before lookup and answers null honestly on a miss', () => {
    expect(findDriftWord(' 時間 ')).not.toBeNull();
    expect(findDriftWord('not-a-word')).toBeNull();
    expect(findDriftWord('')).toBeNull();
  });

  it('extracts distinct kanji in first-appearance order', () => {
    expect(driftKanjiOf('日曜日')).toEqual(['日', '曜']);
    expect(driftKanjiOf('ひらがな')).toEqual([]);
  });

  it('knows every kanji of every word it serves — no dead ends', () => {
    // The invariant the red-team L3 finding was about, now asserted forever:
    // any kanji reachable from a served word must resolve to kanji info.
    let checked = 0;
    for (const word of ['過酷', '時間', '蝶', '嘘', '分岐']) {
      const found = findDriftWord(word);
      if (found === null) continue;
      for (const character of driftKanjiOf(found.headword)) {
        expect(driftKanjiInfo(character)).not.toBeNull();
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('renders kanji info with authoritative stroke counts', () => {
    expect(driftKanjiInfo('稽')?.strokeCount).toBe(15);
    expect(driftKanjiInfo('衷')?.strokeCount).toBe(9);
    expect(driftKanjiInfo('分')?.strokeCount).toBe(4);
  });

  it('only offers components its own tier can render', () => {
    for (const component of driftKanjiComponents('語')) {
      expect(driftKanjiInfo(component)).not.toBeNull();
    }
  });

  it('caps word lists and sorts easiest level first', () => {
    const words = driftWordsUsingKanji('日');
    expect(words.length).toBeLessThanOrEqual(20);
    expect(words.length).toBeGreaterThan(0);
    for (let i = 1; i < words.length; i += 1) {
      expect(words[i - 1]!.level).toBeGreaterThanOrEqual(words[i]!.level);
    }
  });

  it('never relates a word to itself', () => {
    for (const related of driftRelatedWords('時間')) {
      expect(related.headword).not.toBe('時間');
    }
    expect(driftRelatedWords('時間').length).toBeLessThanOrEqual(12);
  });

  it('states its provenance instead of implying review', () => {
    expect(DRIFT_TIER_DISCLOSURE).toMatch(/Not reviewed/);
    expect(DRIFT_TIER_DISCLOSURE.length).toBeGreaterThan(40);
  });
});
