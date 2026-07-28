/**
 * Lookup and search over `@bunki/seed` (WP-05).
 *
 * Pure functions over the validated seed dataset — no React, no store, no
 * network — so the ranking is unit-testable and the screens stay thin.
 *
 * Two things this module refuses to do:
 *
 * **It never claims coverage.** Every empty result carries the seed's own
 * `SEED_COVERAGE_DISCLOSURE`; a miss here means "not in this build", not "not a
 * word" (controller §8). The screens render that distinction rather than an
 * unqualified "no results" — and it stays a real distinction now that the
 * imported tier is reachable: 3,000 of JMdict's 218,173 entries is a slice, and
 * a query that misses has still only missed the slice.
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
  FIXTURE_TIER,
  IMPORTED_TIER,
  IMPORTED_TIER_DISCLOSURE,
  SEED_COVERAGE_DISCLOSURE,
  SEED_ENTRY_DISCLOSURE,
  importedDictionary,
  seedDataset,
  type ImportedSentence,
  type SeedKanji,
  type SeedLexeme,
  type SeedPassage,
  type SeedSentence,
  type SeedTier,
} from '@bunki/seed';

import {
  IMPORTED_LEXEMES,
  NORMALIZED_KANJI,
  NORMALIZED_LEXEMES,
  importedExtras,
  importedKanjiFor,
  importedLexemeById,
  importedLexemesByHeadword,
  importedSentencesFor,
  importedStrokeSet,
} from './imported-tier.ts';

export {
  DEFAULT_CANONICAL_TARGET,
  FIXTURE_TIER,
  IMPORTED_TIER,
  IMPORTED_TIER_DISCLOSURE,
  SEED_COVERAGE_DISCLOSURE,
  SEED_ENTRY_DISCLOSURE,
  importedDictionary,
  importedExtras,
  importedSentencesFor,
  importedStrokeSet,
  seedDataset,
};
export type { ImportedSentence, SeedKanji, SeedLexeme, SeedPassage, SeedSentence, SeedTier };

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
  | {
      readonly kind: 'lexeme';
      readonly lexeme: SeedLexeme;
      readonly matchedOn: MatchKind;
      readonly tier: SeedTier;
    }
  | {
      readonly kind: 'kanji';
      readonly kanji: SeedKanji;
      readonly matchedOn: MatchKind;
      readonly tier: SeedTier;
    };

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
 * How many imported results one query may return.
 *
 * A gloss query like "time" matches hundreds of entries. Rendering all of them
 * would make the screen slow for a reason that has nothing to do with the size
 * of the dataset — a person reads the first few — and it would bury the fixture
 * tier's own results. The cap is on *display*, not on the search: the scan still
 * visits every record, so the ranking below is over the whole tier.
 */
export const IMPORTED_RESULT_LIMIT = 40;

/**
 * Search both tiers.
 *
 * The fixture tier is scanned first and its results are kept ahead of the
 * imported tier at equal match quality. That ordering is a requirement, not a
 * preference: the canonical target 分岐, the passage it appears in and the whole
 * closed loop resolve through the fixture tier, and an imported 分岐 sorting
 * first would silently move the operator's loop onto a record that is not the
 * one the E2E, the canvas and the scope contract are written against.
 *
 * Within a tier the order is unchanged — match quality, then written form — so
 * the ordering stays total and a rerun of the same query produces the same page.
 */
export function searchSeed(rawQuery: string): readonly SearchResult[] {
  const query = norm(rawQuery);
  if (query === '') return [];

  const results: SearchResult[] = [];

  for (const lexeme of seedDataset.lexemes) {
    const matchedOn = matchLexeme(lexeme, query);
    if (matchedOn !== null) results.push({ kind: 'lexeme', lexeme, matchedOn, tier: FIXTURE_TIER });
  }

  for (const kanji of seedDataset.kanji) {
    const matchedOn = matchKanji(kanji, query);
    if (matchedOn !== null) results.push({ kind: 'kanji', kanji, matchedOn, tier: FIXTURE_TIER });
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
        results.push({ kind: 'lexeme', lexeme, matchedOn: 'kanji-in-word', tier: FIXTURE_TIER });
      }
    }
  }

  const sortKey = (result: SearchResult): string =>
    result.kind === 'lexeme' ? result.lexeme.headword : result.kanji.character;

  const byQuality = (left: SearchResult, right: SearchResult): number => {
    const byRank = MATCH_RANK[left.matchedOn] - MATCH_RANK[right.matchedOn];
    if (byRank !== 0) return byRank;
    return sortKey(left).localeCompare(sortKey(right), 'ja');
  };

  const imported: SearchResult[] = [];
  const seenHeadwords = new Set(
    results.filter((result) => result.kind === 'lexeme').map((result) => result.lexeme.headword),
  );

  // Matched against pre-normalised text rather than by re-normalising the
  // dataset on every keystroke — see `NORMALIZED_LEXEMES`. The predicates are
  // the same ones `matchLexeme`/`matchKanji` apply to the fixture tier; only the
  // side that never changes has been computed in advance.
  for (const entry of NORMALIZED_LEXEMES) {
    // The same written form already answered from the fixture tier. Showing it
    // twice would ask the learner to choose between two records that are the
    // same word, one of which the rest of the app cannot reach.
    if (seenHeadwords.has(entry.lexeme.headword)) continue;
    const matchedOn: MatchKind | null =
      entry.headword === query
        ? 'headword-exact'
        : entry.reading === query
          ? 'reading-exact'
          : entry.headword.includes(query)
            ? 'headword-contains'
            : entry.reading.includes(query)
              ? 'reading-contains'
              : entry.senses.some((sense) => sense.includes(query))
                ? 'sense-contains'
                : null;
    if (matchedOn !== null) {
      imported.push({ kind: 'lexeme', lexeme: entry.lexeme, matchedOn, tier: IMPORTED_TIER });
    }
  }

  const seenCharacters = new Set(
    results.filter((result) => result.kind === 'kanji').map((result) => result.kanji.character),
  );
  for (const entry of NORMALIZED_KANJI) {
    if (seenCharacters.has(entry.kanji.character)) continue;
    const matchedOn: MatchKind | null =
      entry.character === query
        ? 'kanji-exact'
        : entry.meanings.some((meaning) => meaning.includes(query))
          ? 'sense-contains'
          : entry.onReadings.includes(query) || entry.kunReadings.includes(query)
            ? 'reading-exact'
            : null;
    if (matchedOn !== null) {
      imported.push({ kind: 'kanji', kanji: entry.kanji, matchedOn, tier: IMPORTED_TIER });
    }
  }

  if ([...query].length === 1) {
    const already = new Set(
      imported.filter((result) => result.kind === 'lexeme').map((result) => result.lexeme.id),
    );
    for (const lexeme of IMPORTED_LEXEMES) {
      if (already.has(lexeme.id) || seenHeadwords.has(lexeme.headword)) continue;
      if (lexeme.kanjiUsed.some((character) => norm(character) === query)) {
        imported.push({ kind: 'lexeme', lexeme, matchedOn: 'kanji-in-word', tier: IMPORTED_TIER });
      }
    }
  }

  return [...results.sort(byQuality), ...imported.sort(byQuality).slice(0, IMPORTED_RESULT_LIMIT)];
}

/**
 * Resolve a lexeme id in either tier, fixture first.
 *
 * Fixture first for the same reason the search ranks it first: `lex-bunki` is
 * the id the closed loop, the canvas and the E2E all name, and it must keep
 * resolving to the record they were written against.
 */
export const findLexemeById = (id: string): SeedLexeme | null =>
  seedDataset.lexemes.find((lexeme) => lexeme.id === id) ?? importedLexemeById(id);

export const findLexemeByHeadword = (headword: string): SeedLexeme | null =>
  seedDataset.lexemes.find((lexeme) => norm(lexeme.headword) === norm(headword)) ??
  importedLexemesByHeadword(headword)[0] ??
  null;

export const findKanjiByCharacter = (character: string): SeedKanji | null =>
  seedDataset.kanji.find((kanji) => kanji.character === character) ?? importedKanjiFor(character);

/** Which tier a resolved record came from — the label a screen renders. */
export const tierOf = (id: string): SeedTier =>
  importedExtras(id) === null ? FIXTURE_TIER : IMPORTED_TIER;

/** The seed kanji a headword is written with, in the order they appear in it. */
export function constituentKanji(lexeme: SeedLexeme): readonly SeedKanji[] {
  return lexeme.kanjiUsed
    .map((character) => findKanjiByCharacter(character))
    .filter((kanji): kanji is SeedKanji => kanji !== null);
}

/**
 * How many related words a page may list.
 *
 * 犬 appears in dozens of imported words and 人 in hundreds. A word page that
 * listed every one of them would be a wall rather than a page, and the honest
 * framing is "some of the words that share this character", which is what the
 * screens say. The cap is on the list, not on the search.
 */
export const RELATED_LIMIT = 24;

/**
 * Words that literally share a kanji with this one. Nothing inferred.
 *
 * Both tiers, fixture first — a learner looking at 分岐 should be shown 分ける
 * from the fixture tier and 自分 from the imported one, not one or the other
 * depending on which record they arrived through.
 */
export function wordFamily(lexeme: SeedLexeme): readonly SeedLexeme[] {
  const shared = new Set(lexeme.kanjiUsed);
  const related = (pool: readonly SeedLexeme[]): SeedLexeme[] =>
    pool.filter(
      (other) =>
        other.id !== lexeme.id &&
        other.headword !== lexeme.headword &&
        other.kanjiUsed.some((character) => shared.has(character)),
    );
  const fixture = related(seedDataset.lexemes);
  const seen = new Set(fixture.map((entry) => entry.headword));
  const imported = related(IMPORTED_LEXEMES).filter((entry) => !seen.has(entry.headword));
  return [...fixture, ...imported].slice(0, RELATED_LIMIT);
}

/** Words written with this kanji — REQ-UI-03 Layer 1 "encountered compounds". */
export function wordsUsingKanji(character: string): readonly SeedLexeme[] {
  const fixture = seedDataset.lexemes.filter((lexeme) => lexeme.kanjiUsed.includes(character));
  const seen = new Set(fixture.map((lexeme) => lexeme.headword));
  const imported = IMPORTED_LEXEMES.filter(
    (lexeme) => lexeme.kanjiUsed.includes(character) && !seen.has(lexeme.headword),
  );
  return [...fixture, ...imported].slice(0, RELATED_LIMIT);
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
