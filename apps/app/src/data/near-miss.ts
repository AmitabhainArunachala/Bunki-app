/**
 * "Nothing matched" is a dead end. This is the way out of it.
 *
 * ## The distinction this file exists to hold
 *
 * `searchSeed` deliberately has **no fuzzy fallback**: a query that does not
 * match returns nothing, because a wrong match in a dictionary is worse than a
 * miss — a miss is visibly a miss, and a plausible wrong answer is not.
 *
 * That rule is right and it leaves a hole. A learner who types `jikann`, or
 * `bunkl`, or mistypes one kana of a reading, gets an empty screen and no way
 * forward. Every real dictionary answers that with a suggestion list, and the
 * reason it is not a violation of the rule above is **placement**: these are
 * never results. They appear only when the search returned nothing, under a
 * heading that says the search returned nothing, and they are labelled as near
 * misses rather than as answers. Nothing here is ever the top answer, nothing
 * here can be kept without opening its page first, and the ranking above is
 * untouched.
 *
 * ## What "near" means, exactly
 *
 * Damerau–Levenshtein distance — insertion, deletion, substitution and
 * *transposition* — against the written form and the reading. Transposition is
 * included because `jikna` for `jikan` is the single commonest typing error and
 * plain Levenshtein scores it as two edits, which pushes it past any threshold
 * worth having.
 *
 * A **romaji** query is compared as Latin, against romanised readings, rather
 * than as the kana it converts to. See {@link nearMisses} for why that direction
 * is the one that works.
 *
 * The threshold scales with query length, because one edit in a two-character
 * query is a different claim from one edit in an eight-character one: at two
 * characters, one edit is half the word, and everything would be "near".
 *
 * ## What it does not do
 *
 * It does not touch English glosses. A gloss query that misses has usually
 * missed by meaning rather than by spelling, and edit distance over
 * "atmosphere" would offer "atmospheres" and nothing useful. It does not
 * suggest kanji: a one-character query already has the component path, and edit
 * distance between single characters is meaningless.
 */

import { ALL_LEXEMES } from './browse.ts';
import type { SeedLexeme } from './catalog.ts';
import { kanaToRomaji, looksLikeRomaji } from './romaji.ts';

/** One near miss, with the reason it is near. */
export interface NearMiss {
  readonly lexeme: SeedLexeme;
  /** Which field came close: the written form, or the reading. */
  readonly field: 'headword' | 'reading';
  /** Edits between the query and that field. Lower is nearer. */
  readonly distance: number;
}

/** How many near misses a surface may show. A long list is not a suggestion. */
export const NEAR_MISS_LIMIT = 6;

/**
 * The heading a surface must render above these, verbatim.
 *
 * Kept beside the function so a screen cannot show the list without the sentence
 * that makes it honest.
 */
export const NEAR_MISS_NOTE =
  'Nothing in this build matches what you typed. These are the closest entries by spelling — they are guesses about a typo, not answers to your query, and none of them was matched.';

/**
 * Edits allowed for a query of this length.
 *
 * One edit in a two-character query is half the word, so the shortest queries
 * get zero and simply have no suggestions — the correct answer for `あ`. Three
 * is the floor for one edit because Japanese readings are short: ぶんき is three
 * kana, and a rule that needed four would refuse to help with most of them.
 */
export function allowedEdits(length: number): number {
  if (length <= 2) return 0;
  if (length <= 6) return 1;
  return 2;
}

/**
 * Damerau–Levenshtein distance, bounded.
 *
 * `limit` is not an optimisation detail — it is what makes this affordable over
 * 3,000 entries per keystroke. The row minimum is checked after each row and the
 * computation abandons as soon as every path is already past the threshold, so a
 * query that is nothing like an entry costs a few cells rather than a full
 * matrix. `limit + 1` is returned for anything abandoned, which is always
 * greater than any threshold a caller can pass.
 */
export function boundedDistance(left: string, right: string, limit: number): number {
  const a = [...left];
  const b = [...right];
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let twoAgo: number[] = [];
  let previous: number[] = Array.from({ length: b.length + 1 }, (_value, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1);
    current[0] = i;
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      // Transposition: `jikna` → `jikan` is one edit, not two.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (twoAgo[j - 2] ?? 0) + 1);
      }
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }

    if (rowMin > limit) return limit + 1;
    twoAgo = previous;
    previous = current;
  }

  return previous[b.length] ?? limit + 1;
}

/**
 * The closest entries to a query that matched nothing.
 *
 * Deterministic: sorted by distance, then by which field matched (a written form
 * before a reading, because a learner who typed kanji meant kanji), then by
 * headword. Two runs of the same query give the same list.
 *
 * Returns `[]` for a query too short to be meaningfully near anything, which is
 * the honest answer and is why a surface must handle an empty list.
 */
export function nearMisses(rawQuery: string, limit = NEAR_MISS_LIMIT): readonly NearMiss[] {
  const query = rawQuery.trim().normalize('NFKC').toLocaleLowerCase('en-US');
  if (query === '') return [];

  /*
    Which alphabet the comparison happens in.

    A romaji query is compared **as Latin, against romanised readings**, not as
    the kana it converts to. That is not a preference: `jikna` — `jikan` with two
    letters swapped — converts to `じkな`, because `kn` is not a mora and the `k`
    survives literally. Its distance to じかん is 2, for reasons that have nothing
    to do with how close the learner was. Romanising the reading instead puts the
    two strings one transposition apart, which is what actually happened.

    A kana or kanji query is compared as itself.
  */
  const romaji = looksLikeRomaji(query);
  const needle = query;
  const edits = allowedEdits([...needle].length);
  if (edits === 0) return [];

  const found: NearMiss[] = [];
  for (const lexeme of ALL_LEXEMES) {
    const headword = lexeme.headword.normalize('NFKC').toLocaleLowerCase('en-US');
    const rawReading = lexeme.reading.normalize('NFKC').toLocaleLowerCase('en-US');
    const reading = romaji ? kanaToRomaji(rawReading) : rawReading;

    // A romaji query cannot be near a written form made of kanji; comparing them
    // would only ever burn cycles. It is still compared for a kana headword.
    const headwordDistance = romaji ? edits + 1 : boundedDistance(needle, headword, edits);
    const readingDistance = boundedDistance(needle, reading, edits);

    if (headwordDistance <= edits && headwordDistance <= readingDistance) {
      found.push({ lexeme, field: 'headword', distance: headwordDistance });
    } else if (readingDistance <= edits) {
      found.push({ lexeme, field: 'reading', distance: readingDistance });
    }
  }

  return found
    .sort((left, right) => {
      const byDistance = left.distance - right.distance;
      if (byDistance !== 0) return byDistance;
      const byField = (left.field === 'headword' ? 0 : 1) - (right.field === 'headword' ? 0 : 1);
      if (byField !== 0) return byField;
      return left.lexeme.headword.localeCompare(right.lexeme.headword, 'ja');
    })
    .slice(0, limit);
}
