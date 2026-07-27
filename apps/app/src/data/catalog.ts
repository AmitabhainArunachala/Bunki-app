/**
 * Lookup and search over `@bunki/seed` (WP-05).
 *
 * Pure functions over the validated seed dataset — no React, no store, no
 * network — so the ranking is unit-testable and the screens stay thin.
 *
 * Two things this module refuses to do:
 *
 * **It never claims coverage.** Every empty result carries the seed's own
 * `SEED_COVERAGE_DISCLOSURE`; a miss here means "not in a Phase-0 seed of
 * sixteen words", not "not a word" (controller §8). The screens render that
 * distinction rather than an unqualified "no results".
 *
 * **It never fabricates a relation.** "Related words" are words that literally
 * share a kanji with the target in this dataset, and "examples" are seed
 * sentences that literally reference the lexeme id. Nothing is inferred,
 * scored, or ranked by an invented relevance model — REQ-UI-02's "recent
 * related encounters" and personal ranking need learner evidence that WP-06
 * owns, and a plausible-looking stand-in would be the fabrication the
 * provenance rules exist to prevent.
 */

import {
  DEFAULT_CANONICAL_TARGET,
  SEED_COVERAGE_DISCLOSURE,
  SEED_ENTRY_DISCLOSURE,
  seedDataset,
  type SeedKanji,
  type SeedLexeme,
  type SeedPassage,
  type SeedSentence,
} from '@bunki/seed';

export { DEFAULT_CANONICAL_TARGET, SEED_COVERAGE_DISCLOSURE, SEED_ENTRY_DISCLOSURE, seedDataset };
export type { SeedKanji, SeedLexeme, SeedPassage, SeedSentence };

/** How a record matched, so the UI can say *why* a result is a result. */
export type MatchKind =
  | 'headword-exact'
  | 'reading-exact'
  | 'kanji-exact'
  | 'headword-contains'
  | 'reading-contains'
  | 'sense-contains'
  | 'kanji-in-word';

/** Lower sorts first. Exact written form beats exact reading beats substring. */
const MATCH_RANK: Readonly<Record<MatchKind, number>> = {
  'headword-exact': 0,
  'kanji-exact': 1,
  'reading-exact': 2,
  'headword-contains': 3,
  'reading-contains': 4,
  'kanji-in-word': 5,
  'sense-contains': 6,
};

export type SearchResult =
  | { readonly kind: 'lexeme'; readonly lexeme: SeedLexeme; readonly matchedOn: MatchKind }
  | { readonly kind: 'kanji'; readonly kanji: SeedKanji; readonly matchedOn: MatchKind };

/** NFKC + trim; lower-cased for the Latin side of a query (a no-op on Japanese). */
export function normalizeQuery(query: string): string {
  return query.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

const norm = normalizeQuery;

function matchLexeme(lexeme: SeedLexeme, query: string): MatchKind | null {
  const headword = norm(lexeme.headword);
  const reading = norm(lexeme.reading);
  if (headword === query) return 'headword-exact';
  if (reading === query) return 'reading-exact';
  if (headword.includes(query)) return 'headword-contains';
  if (reading.includes(query)) return 'reading-contains';
  if (lexeme.senses.some((sense) => norm(sense).includes(query))) return 'sense-contains';
  return null;
}

function matchKanji(kanji: SeedKanji, query: string): MatchKind | null {
  if (norm(kanji.character) === query) return 'kanji-exact';
  if (kanji.meanings.some((meaning) => norm(meaning).includes(query))) return 'sense-contains';
  if (
    kanji.onReadings.some((reading) => norm(reading) === query) ||
    kanji.kunReadings.some((reading) => norm(reading).replace('.', '') === query)
  ) {
    return 'reading-exact';
  }
  return null;
}

/**
 * Search the seed.
 *
 * Results are ordered by match quality, then by written form, so the ordering
 * is total and a rerun of the same query produces the same page — which is what
 * lets the screenshot evidence be reproducible.
 */
export function searchSeed(rawQuery: string): readonly SearchResult[] {
  const query = norm(rawQuery);
  if (query === '') return [];

  const results: SearchResult[] = [];

  for (const lexeme of seedDataset.lexemes) {
    const matchedOn = matchLexeme(lexeme, query);
    if (matchedOn !== null) results.push({ kind: 'lexeme', lexeme, matchedOn });
  }

  for (const kanji of seedDataset.kanji) {
    const matchedOn = matchKanji(kanji, query);
    if (matchedOn !== null) results.push({ kind: 'kanji', kanji, matchedOn });
  }

  // A single-kanji query should also surface the words that contain it, even
  // though the word itself matched nothing: that is the lookup a reader
  // actually wants when they tap one character in a sentence.
  if ([...query].length === 1) {
    for (const lexeme of seedDataset.lexemes) {
      if (results.some((result) => result.kind === 'lexeme' && result.lexeme.id === lexeme.id)) {
        continue;
      }
      if (lexeme.kanjiUsed.some((character) => norm(character) === query)) {
        results.push({ kind: 'lexeme', lexeme, matchedOn: 'kanji-in-word' });
      }
    }
  }

  const sortKey = (result: SearchResult): string =>
    result.kind === 'lexeme' ? result.lexeme.headword : result.kanji.character;

  return results.sort((left, right) => {
    const byRank = MATCH_RANK[left.matchedOn] - MATCH_RANK[right.matchedOn];
    if (byRank !== 0) return byRank;
    return sortKey(left).localeCompare(sortKey(right), 'ja');
  });
}

export const findLexemeById = (id: string): SeedLexeme | null =>
  seedDataset.lexemes.find((lexeme) => lexeme.id === id) ?? null;

export const findLexemeByHeadword = (headword: string): SeedLexeme | null =>
  seedDataset.lexemes.find((lexeme) => norm(lexeme.headword) === norm(headword)) ?? null;

export const findKanjiByCharacter = (character: string): SeedKanji | null =>
  seedDataset.kanji.find((kanji) => kanji.character === character) ?? null;

/** The seed kanji a headword is written with, in the order they appear in it. */
export function constituentKanji(lexeme: SeedLexeme): readonly SeedKanji[] {
  return lexeme.kanjiUsed
    .map((character) => findKanjiByCharacter(character))
    .filter((kanji): kanji is SeedKanji => kanji !== null);
}

/** Seed words that literally share a kanji with this one. Nothing inferred. */
export function wordFamily(lexeme: SeedLexeme): readonly SeedLexeme[] {
  const shared = new Set(lexeme.kanjiUsed);
  return seedDataset.lexemes
    .filter(
      (other) =>
        other.id !== lexeme.id && other.kanjiUsed.some((character) => shared.has(character)),
    )
    .slice();
}

/** Seed words written with this kanji — REQ-UI-03 Layer 1 "encountered compounds". */
export function wordsUsingKanji(character: string): readonly SeedLexeme[] {
  return seedDataset.lexemes.filter((lexeme) => lexeme.kanjiUsed.includes(character));
}

/** Seed sentences that reference this lexeme id. Referential, never fuzzy-matched. */
export function sentencesForLexeme(lexemeId: string): readonly SeedSentence[] {
  return seedDataset.sentences.filter((sentence) => sentence.lexemeIds.includes(lexemeId));
}

/**
 * Readings this kanji actually contributes in the seed's own vocabulary.
 *
 * REQ-UI-03 Layer 1 asks for "common readings **via those compounds**". The
 * honest Phase-0 answer is the reading list the seed records for the character,
 * paired with the words that contain it; mapping a specific reading onto a
 * specific compound needs per-morpheme reading data the seed does not have, so
 * the pairing is not asserted.
 */
export interface KanjiReadingContext {
  readonly onReadings: readonly string[];
  readonly kunReadings: readonly string[];
  readonly compounds: readonly SeedLexeme[];
}

export function readingContextFor(kanji: SeedKanji): KanjiReadingContext {
  return {
    onReadings: kanji.onReadings,
    kunReadings: kanji.kunReadings,
    compounds: wordsUsingKanji(kanji.character),
  };
}

/** The hand-written thematic passage, when it embeds this lexeme. */
export function passageForLexeme(lexemeId: string): SeedPassage | null {
  return seedDataset.passages.find((passage) => passage.lexemeIds.includes(lexemeId)) ?? null;
}

/**
 * The identifiers in the seed's licence/provenance registry that are *not* a
 * dictionary source. Used by the UI to phrase a provenance line honestly: a
 * project-authored gloss must not read like a dictionary citation.
 */
export const PROJECT_AUTHORED_SOURCE_MARKERS = ['bunki', 'project'] as const;

export function isProjectAuthored(source: string): boolean {
  const lowered = source.toLocaleLowerCase('en-US');
  return PROJECT_AUTHORED_SOURCE_MARKERS.some((marker) => lowered.includes(marker));
}
