/**
 * The dictionary standing alone: the ways in, and the shelves.
 *
 * ## What these cases are about
 *
 * Before this lane the only doors into 3,016 lexemes and 1,241 kanji were a
 * Japanese IME and an English gloss. A learner who had *heard* a word, or read
 * it in romaji, or could see one part of a character but not the whole of it,
 * had no way in at all — and there was no way to open the book in the middle,
 * only to ask it a question you already knew the answer to.
 *
 * Each case below fails against that build.
 *
 * ## The rule they also enforce
 *
 * Every browse axis is a field the licensors ship, and the tests check the
 * *counts against the data* rather than against a number typed here — a shelf
 * that claimed twelve members and held eleven would be a small lie of exactly
 * the kind this project keeps finding.
 */

import { describe, expect, it } from 'vitest';

import {
  ALL_KANJI,
  browseAxes,
  componentAxis,
  componentsOf,
  frequencyAxis,
  gradeAxis,
  kanjiWithComponent,
  strokeAxis,
} from '../src/data/browse.ts';
import { searchSeed, type SearchResult } from '../src/data/catalog.ts';
import { kanaQueryFor, looksLikeRomaji, romajiToKana } from '../src/data/romaji.ts';

const headwords = (results: readonly SearchResult[]): readonly string[] =>
  results.filter((result) => result.kind === 'lexeme').map((result) => result.lexeme.headword);

const characters = (results: readonly SearchResult[]): readonly string[] =>
  results.filter((result) => result.kind === 'kanji').map((result) => result.kanji.character);

describe('romaji, as an IME accepts it', () => {
  it('converts the ordinary cases', () => {
    expect(romajiToKana('bunki')).toBe('ぶんき');
    expect(romajiToKana('jikan')).toBe('じかん');
    expect(romajiToKana('gakkou')).toBe('がっこう');
    expect(romajiToKana('tomodachi')).toBe('ともだち');
    expect(romajiToKana('shinbun')).toBe('しんぶん');
    expect(romajiToKana('kissaten')).toBe('きっさてん');
  });

  it('accepts both Hepburn and kunrei spellings of the same sound', () => {
    expect(romajiToKana('shi')).toBe(romajiToKana('si'));
    expect(romajiToKana('chi')).toBe(romajiToKana('ti'));
    expect(romajiToKana('tsu')).toBe(romajiToKana('tu'));
    expect(romajiToKana('fu')).toBe(romajiToKana('hu'));
  });

  it('gets ん right in the three places it is hard', () => {
    expect(romajiToKana('bunki')).toBe('ぶんき'); // before a consonant
    expect(romajiToKana('nani')).toBe('なに'); // before a vowel: not ん
    expect(romajiToKana('honnya')).toBe('ほんにゃ'); // nn before y
    expect(romajiToKana('hon')).toBe('ほん'); // terminal
  });

  it('refuses to convert anything that is not romaji', () => {
    expect(looksLikeRomaji('分岐')).toBe(false);
    expect(looksLikeRomaji('ぶんき')).toBe(false);
    expect(kanaQueryFor('分岐')).toBeNull();
    // A query that converts to itself has nothing to add.
    expect(kanaQueryFor('---')).toBeNull();
  });
});

describe('searching by romaji', () => {
  it('finds 分岐 from “bunki”', () => {
    expect(headwords(searchSeed('bunki'))).toContain('分岐');
  });

  it('finds 時間 from “jikan” and 学校 from “gakkou”', () => {
    expect(headwords(searchSeed('jikan'))).toContain('時間');
    expect(headwords(searchSeed('gakkou'))).toContain('学校');
  });

  it('labels the match so a row can say why it is there', () => {
    const hit = searchSeed('bunki').find(
      (result) => result.kind === 'lexeme' && result.lexeme.headword === '分岐',
    );
    expect(hit?.matchedOn).toBe('romaji-exact');
  });

  it('never lets a transliteration outrank a real match', () => {
    // `ki` is romaji for き and is also an English substring in some glosses.
    // Whatever else it returns, an exact written or read match sorts first.
    const results = searchSeed('bunki');
    expect(results[0]?.kind === 'lexeme' ? results[0].lexeme.headword : null).toBe('分岐');
  });

  it('adds no result at all for a Japanese query', () => {
    // The romaji path must be inert on non-Latin input, or every Japanese search
    // would pay for it and could gain a spurious row.
    const direct = searchSeed('分岐');
    expect(direct.every((result) => !result.matchedOn.startsWith('romaji'))).toBe(true);
  });
});

describe('searching by component', () => {
  it('finds characters built from a component that is not itself a match', () => {
    // 氵 (water) is a KanjiVG element of many characters and is not itself one of
    // the 1,241 shipped literals in most builds — the exact case a learner hits
    // when they can see a part and not the whole.
    const found = kanjiWithComponent('氵');
    expect(found.length).toBeGreaterThan(0);
    for (const kanji of found) expect(componentsOf(kanji)).toContain('氵');
  });

  it('reaches them through the search box, ranked last', () => {
    const results = searchSeed('氵');
    const componentHits = results.filter((result) => result.matchedOn === 'component-of');
    expect(componentHits.length).toBeGreaterThan(0);
    expect(characters(results).length).toBeGreaterThan(0);

    // Ranked after everything with a stronger claim.
    const firstComponentIndex = results.findIndex((result) => result.matchedOn === 'component-of');
    const strongerAfter = results
      .slice(firstComponentIndex)
      .some((result) => result.matchedOn === 'kanji-exact');
    expect(strongerAfter).toBe(false);
  });

  it('never lists a character as its own component', () => {
    for (const kanji of ALL_KANJI.slice(0, 200)) {
      expect(kanjiWithComponent(kanji.character)).not.toContain(kanji);
    }
  });
});

describe('the browse axes', () => {
  it('offers four, each naming the field it was read off', () => {
    const axes = browseAxes();
    expect(axes.map((axis) => axis.id)).toEqual(['grade', 'strokes', 'frequency', 'component']);
    for (const axis of axes) {
      expect(axis.derivation.length).toBeGreaterThan(20);
      expect(axis.shelves.length).toBeGreaterThan(0);
    }
  });

  it('reports a shelf count that equals the shelf', () => {
    for (const axis of browseAxes()) {
      for (const shelf of axis.shelves) {
        expect(shelf.count, `${axis.id}/${shelf.id}`).toBe(shelf.characters.length);
      }
    }
  });

  it('places every character on exactly one grade shelf and one stroke shelf', () => {
    for (const axis of [gradeAxis(), strokeAxis()]) {
      const seen = new Set<string>();
      let total = 0;
      for (const shelf of axis.shelves) {
        for (const kanji of shelf.characters) {
          expect(seen.has(kanji.character), `${kanji.character} on two shelves of ${axis.id}`).toBe(
            false,
          );
          seen.add(kanji.character);
          total += 1;
        }
      }
      expect(total).toBe(ALL_KANJI.length);
    }
  });

  it('bands frequency and never renders the rank', () => {
    const axis = frequencyAxis();
    for (const shelf of axis.shelves) {
      // A label that was the raw rank would be a bare number; the bands are
      // ranges or a stated absence.
      expect(shelf.label).not.toMatch(/^\d+$/);
    }
    // Every character lands somewhere, including those with no rank.
    const total = axis.shelves.reduce((sum, shelf) => sum + shelf.count, 0);
    expect(total).toBe(ALL_KANJI.length);
  });

  it('shelves no component with a single member', () => {
    for (const shelf of componentAxis().shelves) {
      expect(shelf.count).toBeGreaterThanOrEqual(2);
    }
  });

  it('offers no JLPT axis and no semantic-field axis', () => {
    // Both are named in `INDEXES_NOT_BUILT` rather than approximated. A JLPT
    // shelf is one step from a learner reading their own level off it, and a
    // gloss-clustered "semantic field" would look like scholarship and be a
    // string match.
    const ids = browseAxes().map((axis) => axis.id);
    expect(ids).not.toContain('jlpt');
    expect(ids).not.toContain('semantic');
    for (const axis of browseAxes()) {
      expect(axis.label.toLowerCase()).not.toContain('jlpt');
    }
  });
});
