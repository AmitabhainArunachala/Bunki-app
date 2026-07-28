/**
 * What sits next to a word (Campaign E / B3).
 *
 * Three neighbourhoods, and each one is an edge the data really carries rather
 * than a similarity a model guessed:
 *
 *   - **the kanji it is written with** — `lexeme.kanjiUsed`, in order;
 *   - **the word family** — words that literally share one of those characters,
 *     which `src/data/catalog.ts` already computes; this module only groups the
 *     result by *which* character is shared, because "these six words all
 *     contain 分" is a fact and "these six words are related" is a vibe;
 *   - **the contrast set** — words the dictionary glosses with one of the same
 *     English words.
 *
 * ## The contrast set is the 類義漢字 idea, and its boundary is stated
 *
 * Frozen §10.5 reads the 類義漢字 book as "the `contrasts-with` edge set
 * rendered as a static book", and names the failure to avoid: a pure reference
 * silo with no learner state and no usage boundary. The usable half of it here
 * is that two entries glossed "opinion" are confusable *because upstream says
 * they mean the same thing in English*, which is a real edge computed from real
 * fields.
 *
 * The half this build does not have is the nuance note — JMdict carries no
 * usage note, and inventing one is the Migaku failure the round-2 research
 * documents (an AI output presented as fact). So the boundary is made explicit
 * out of the data instead: for each pair, the glosses they share (why they are
 * confusable) and the glosses each one carries that the other does not (the
 * only distinction upstream actually draws). {@link CONTRAST_STANDING} is the
 * sentence the surface must show beside it, and it says exactly that.
 *
 * ## Cost
 *
 * The gloss index is built once, lazily, on first use — 3,000 records and about
 * 9,600 distinct glosses. Building it inside a render would repeat that on every
 * keystroke, which is the defect lane A2 already paid for once (the scrubber
 * that rebuilt its whole index per frame).
 */

import {
  findLexemeById,
  importedDictionary,
  seedDataset,
  wordFamily,
  findKanjiByCharacter,
  type SeedKanji,
  type SeedLexeme,
} from '../../data/catalog.ts';

/* ------------------------------------------------------------------ *
 * The kanji in the word
 * ------------------------------------------------------------------ */

export interface KanjiInWord {
  readonly character: string;
  /** The kanji record, or `null` when this build carries no card for it. */
  readonly kanji: SeedKanji | null;
}

/**
 * Every character the headword is written with, in order — including the ones
 * with no page.
 *
 * `constituentKanji` in the catalog drops unresolved characters, which is right
 * for a list of links and wrong for a page that claims to show the kanji in the
 * word: a learner looking at a two-character word and one link cannot tell
 * whether the second character is missing or was never there. Here the
 * character is always listed and only the *link* is conditional.
 */
export function kanjiInWord(lexeme: SeedLexeme): readonly KanjiInWord[] {
  return lexeme.kanjiUsed.map((character) => ({
    character,
    kanji: findKanjiByCharacter(character),
  }));
}

/* ------------------------------------------------------------------ *
 * The word family, grouped by the character that joins it
 * ------------------------------------------------------------------ */

export interface FamilyGroup {
  /** The shared character. */
  readonly character: string;
  readonly words: readonly SeedLexeme[];
}

/**
 * The catalog's own family list, grouped by shared character.
 *
 * A word appears under the first of its shared characters only, so the groups
 * partition the family rather than repeating 自分 under both 自 and 分.
 */
export function familyByKanji(lexeme: SeedLexeme): readonly FamilyGroup[] {
  const family = wordFamily(lexeme);
  const groups: FamilyGroup[] = [];
  const placed = new Set<string>();

  for (const character of lexeme.kanjiUsed) {
    const words = family.filter(
      (relative) => !placed.has(relative.id) && relative.kanjiUsed.includes(character),
    );
    for (const word of words) placed.add(word.id);
    if (words.length > 0) groups.push({ character, words });
  }
  return groups;
}

/* ------------------------------------------------------------------ *
 * The contrast set
 * ------------------------------------------------------------------ */

/** How many contrast partners a page lists. The total is always stated. */
export const CONTRAST_LIMIT = 12;

/** How many distinguishing glosses are shown per side of a pair. */
export const DISTINCT_GLOSS_LIMIT = 3;

/**
 * A gloss shared by more entries than this is a label, not a meaning.
 *
 * "business" reaches eleven entries in this tier and is still informative;
 * something reaching far more would be a wording so general that a shared use
 * of it says nothing about the two words. The bucket is skipped and the skip is
 * reported, rather than silently widening the set.
 */
export const MAX_GLOSS_BUCKET = 40;

export const CONTRAST_STANDING =
  'Computed from overlapping English glosses in JMdict — these are entries the dictionary describes with one of the same words. JMdict carries no usage note, so no nuance is asserted here: what is shown is the wording the two entries share and the wording each one has that the other does not.';

export interface ContrastPair {
  readonly word: SeedLexeme;
  /** Glosses both entries carry, in this word's upstream order. */
  readonly shared: readonly string[];
  /** Glosses only this word carries, capped at {@link DISTINCT_GLOSS_LIMIT}. */
  readonly onlyHere: readonly string[];
  /** Glosses only the partner carries, capped the same way. */
  readonly onlyThere: readonly string[];
  /** How many glosses the two entries share in total. The sort key. */
  readonly sharedCount: number;
}

export interface ContrastSet {
  readonly shown: readonly ContrastPair[];
  /** Every partner found, before the display cap. */
  readonly total: number;
  /** Glosses skipped for being too general — see {@link MAX_GLOSS_BUCKET}. */
  readonly skippedGeneralGlosses: readonly string[];
}

const normalise = (gloss: string): string => gloss.trim().toLocaleLowerCase('en-US');

/** Built on first use; see the cost note in the header. */
let glossIndex: Map<string, string[]> | null = null;

function buildGlossIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (id: string, glosses: readonly string[]): void => {
    for (const gloss of new Set(glosses.map(normalise))) {
      if (gloss === '') continue;
      const bucket = index.get(gloss);
      if (bucket === undefined) index.set(gloss, [id]);
      else bucket.push(id);
    }
  };
  for (const lexeme of seedDataset.lexemes) add(lexeme.id, lexeme.senses);
  for (const lexeme of importedDictionary.lexemes) add(lexeme.id, lexeme.senses);
  return index;
}

function glossesById(): Map<string, string[]> {
  glossIndex ??= buildGlossIndex();
  return glossIndex;
}

/**
 * Words the dictionary glosses with one of the same English words.
 *
 * Deterministic: partners are ordered by how many glosses they share, then by
 * written form under the Japanese collation the catalog already sorts with, so
 * the same word produces the same list on every render and every device.
 */
export function contrastSet(lexeme: SeedLexeme): ContrastSet {
  const index = glossesById();
  const own = new Set(lexeme.senses.map(normalise));
  const skipped: string[] = [];
  const sharedByPartner = new Map<string, Set<string>>();

  for (const gloss of own) {
    const bucket = index.get(gloss);
    if (bucket === undefined) continue;
    if (bucket.length > MAX_GLOSS_BUCKET) {
      skipped.push(gloss);
      continue;
    }
    for (const id of bucket) {
      if (id === lexeme.id) continue;
      const existing = sharedByPartner.get(id);
      if (existing === undefined) sharedByPartner.set(id, new Set([gloss]));
      else existing.add(gloss);
    }
  }

  const pairs: ContrastPair[] = [];
  for (const [id, shared] of sharedByPartner) {
    const partner = findLexemeById(id);
    // Same written form is the same word met through two records, not a
    // contrast; showing it would ask the learner to distinguish 分岐 from 分岐.
    if (partner === null || partner.headword === lexeme.headword) continue;
    const partnerGlosses = new Set(partner.senses.map(normalise));
    pairs.push({
      word: partner,
      shared: lexeme.senses.filter((gloss) => shared.has(normalise(gloss))),
      onlyHere: lexeme.senses
        .filter((gloss) => !partnerGlosses.has(normalise(gloss)))
        .slice(0, DISTINCT_GLOSS_LIMIT),
      onlyThere: partner.senses
        .filter((gloss) => !own.has(normalise(gloss)))
        .slice(0, DISTINCT_GLOSS_LIMIT),
      sharedCount: shared.size,
    });
  }

  pairs.sort((left, right) => {
    const byShared = right.sharedCount - left.sharedCount;
    if (byShared !== 0) return byShared;
    return left.word.headword.localeCompare(right.word.headword, 'ja');
  });

  return {
    shown: pairs.slice(0, CONTRAST_LIMIT),
    total: pairs.length,
    skippedGeneralGlosses: skipped.sort(),
  };
}
