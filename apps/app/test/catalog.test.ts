/**
 * Seed lookup and search (WP-05 closure predicate: screens work "against the
 * real @bunki/seed data").
 *
 * Half of these assertions are about what the catalog must *not* do. A search
 * layer is the easiest place in an app to invent a relation — a "related word"
 * computed by string similarity, a "common reading" attributed to a compound
 * that never carried it — and every such invention would arrive on screen
 * wearing the seed's provenance.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CANONICAL_TARGET,
  constituentKanji,
  findKanjiByCharacter,
  findLexemeByHeadword,
  findLexemeById,
  normalizeQuery,
  passageForLexeme,
  readingContextFor,
  searchSeed,
  seedDataset,
  sentencesForLexeme,
  wordFamily,
  wordsUsingKanji,
} from '../src/data/catalog.ts';

describe('query normalisation', () => {
  it('folds width and trims, so a pasted full-width query still matches', () => {
    expect(normalizeQuery('  ｂｕｎｋｉ ')).toBe('bunki');
    expect(normalizeQuery('分岐 ')).toBe('分岐');
  });
});

describe('search', () => {
  it('returns nothing for an empty query rather than the whole dataset', () => {
    expect(searchSeed('')).toEqual([]);
    expect(searchSeed('   ')).toEqual([]);
  });

  it('puts the exact written form first', () => {
    const results = searchSeed(DEFAULT_CANONICAL_TARGET);
    const first = results[0];
    expect(first?.kind).toBe('lexeme');
    if (first?.kind === 'lexeme') {
      expect(first.lexeme.headword).toBe(DEFAULT_CANONICAL_TARGET);
      expect(first.matchedOn).toBe('headword-exact');
    }
  });

  it('finds a word by its reading', () => {
    const results = searchSeed('ぶんき');
    expect(results.some((r) => r.kind === 'lexeme' && r.lexeme.headword === '分岐')).toBe(true);
  });

  it('finds a word by an English sense', () => {
    const results = searchSeed('branching');
    expect(results.some((r) => r.kind === 'lexeme' && r.lexeme.headword === '分岐')).toBe(true);
  });

  it('surfaces the words containing a single-character kanji query', () => {
    const results = searchSeed('岐');
    expect(results.some((r) => r.kind === 'kanji' && r.kanji.character === '岐')).toBe(true);
    expect(results.some((r) => r.kind === 'lexeme' && r.lexeme.headword === '分岐')).toBe(true);
  });

  it('finds a real word that is outside the sixteen-word fixture tier', () => {
    // This case used to assert `[]` for 図書館, and that assertion was correct
    // while the fixture tier was all the app could reach. The imported tier is
    // reachable now, so the same query is the *positive* case: a word the seed
    // never had, found, with its real reading and senses.
    const results = searchSeed('図書館');
    const first = results[0];
    expect(first?.kind).toBe('lexeme');
    if (first?.kind !== 'lexeme') throw new Error('expected a lexeme result');
    expect(first.tier).toBe('imported');
    expect(first.lexeme.headword).toBe('図書館');
    expect(first.lexeme.reading).toBe('としょかん');
    expect(first.lexeme.senses.join(' ')).toMatch(/library/i);
  });

  it('still returns nothing for something that is not a word in either tier', () => {
    // The empty state has to keep meaning "not in this build", not "not a word",
    // and it has to still be reachable — a search that always finds something
    // would have quietly deleted the coverage disclosure's only trigger.
    expect(searchSeed('ざぶんぶんきき')).toEqual([]);
  });

  it('finds a word by its English gloss, which is how a reader arrives', () => {
    const results = searchSeed('library');
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.some((result) => result.kind === 'lexeme' && result.lexeme.headword === '図書館'),
    ).toBe(true);
  });

  it('keeps the fixture tier ahead of the imported tier', () => {
    // The canonical target, the passage and the whole closed loop resolve
    // through the fixture tier. An imported record sorting first would move the
    // operator's loop onto a record the E2E and the canvas are not written
    // against — which nothing else would notice.
    const results = searchSeed('分');
    const tiers = results.map((result) => result.tier);
    const lastFixture = tiers.lastIndexOf('fixture');
    const firstImported = tiers.indexOf('imported');
    expect(lastFixture).toBeGreaterThanOrEqual(0);
    if (firstImported !== -1) expect(firstImported).toBeGreaterThan(lastFixture);
  });

  it('is deterministic — the same query twice gives the same order', () => {
    const once = searchSeed('分').map((r) => (r.kind === 'lexeme' ? r.lexeme.id : r.kanji.id));
    const twice = searchSeed('分').map((r) => (r.kind === 'lexeme' ? r.lexeme.id : r.kanji.id));
    expect(twice).toEqual(once);
  });

  it('never returns a duplicate record', () => {
    const ids = searchSeed('分').map((r) => (r.kind === 'lexeme' ? r.lexeme.id : r.kanji.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('lookup', () => {
  it('finds the canonical fixture by id and by headword', () => {
    const byHeadword = findLexemeByHeadword(DEFAULT_CANONICAL_TARGET);
    expect(byHeadword).not.toBeNull();
    expect(findLexemeById(byHeadword?.id ?? '')?.headword).toBe(DEFAULT_CANONICAL_TARGET);
  });

  it('returns null for an unknown id rather than throwing', () => {
    expect(findLexemeById('lex-nope')).toBeNull();
    // A CJK character no imported word uses. 漢 used to serve here and does not
    // any more — it is in the imported tier, which is the point of this round.
    expect(findKanjiByCharacter('鬱')).toBeNull();
  });

  it('resolves an imported kanji with its real KANJIDIC2 fields', () => {
    const kanji = findKanjiByCharacter('漢');
    expect(kanji, '漢 is used by an imported word and should resolve').not.toBeNull();
    expect(kanji?.meanings.join(' ')).toMatch(/Sino|China|Chinese/i);
    expect(kanji?.onReadings.length).toBeGreaterThan(0);
    expect(kanji?.strokeCount).toBeGreaterThan(0);
  });
});

describe('relations are real, not inferred', () => {
  it('lists only kanji that actually appear in the headword', () => {
    for (const lexeme of seedDataset.lexemes) {
      for (const kanji of constituentKanji(lexeme)) {
        expect(lexeme.kanjiUsed).toContain(kanji.character);
      }
    }
  });

  it('builds the word family only from a literally shared kanji', () => {
    for (const lexeme of seedDataset.lexemes) {
      for (const relative of wordFamily(lexeme)) {
        expect(relative.id).not.toBe(lexeme.id);
        expect(relative.kanjiUsed.some((c) => lexeme.kanjiUsed.includes(c))).toBe(true);
      }
    }
  });

  it('lists only sentences that reference the lexeme id', () => {
    for (const lexeme of seedDataset.lexemes) {
      for (const sentence of sentencesForLexeme(lexeme.id)) {
        expect(sentence.lexemeIds).toContain(lexeme.id);
      }
    }
  });

  it('lists only compounds that contain the character', () => {
    for (const kanji of seedDataset.kanji) {
      for (const lexeme of wordsUsingKanji(kanji.character)) {
        expect(lexeme.kanjiUsed).toContain(kanji.character);
      }
    }
  });

  it('does not claim which reading a compound uses', () => {
    const kanji = findKanjiByCharacter('分');
    expect(kanji).not.toBeNull();
    const context = readingContextFor(kanji!);
    // The shape is deliberately three flat lists, not reading→compound pairs:
    // the seed has no per-morpheme reading data to build such a pairing from.
    expect(context.onReadings).toEqual(kanji!.onReadings);
    expect(context.kunReadings).toEqual(kanji!.kunReadings);
    expect(Object.keys(context)).toEqual(['onReadings', 'kunReadings', 'compounds']);
  });

  it('finds the hand-written passage for the canonical target', () => {
    const lexeme = findLexemeByHeadword(DEFAULT_CANONICAL_TARGET);
    const passage = passageForLexeme(lexeme?.id ?? '');
    expect(passage?.targetForm).toBe(DEFAULT_CANONICAL_TARGET);
  });
});
