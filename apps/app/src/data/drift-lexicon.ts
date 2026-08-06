/**
 * The Drift lexical tier (BUNKI_ONE_APP_CONVERGENCE_SPEC_2026-08-06.md §1).
 *
 * A second, honest tier beside the Phase-0 seed: the full JLPT lexicon the
 * Drift opening surface floats (6,692 words by headword) plus per-kanji
 * readings/components rebuilt from KanjiVG and KANJIDIC2-derived data
 * (prototypes/drift, PR #26). It exists so a tap on any word in the universe
 * has somewhere real to land.
 *
 * What it deliberately is NOT: seed entries. The seed carries per-field
 * provenance and review status; this tier's data is a JLPT list's single
 * gloss line and a generated kanji index, so it carries ONE uniform
 * disclosure instead of pretending to field-level review. Screens that render
 * this tier show that disclosure above the content, the same honesty contract
 * as `SEED_ENTRY_DISCLOSURE`.
 *
 * Resolution order everywhere: seed first, this tier as fallback. Seed ids
 * (`lex-…`) and headwords cannot collide.
 */

import driftKanjiJson from './generated/drift-kanji.json';
import driftWordsJson from './generated/drift-words.json';

/** `[headword, reading, gloss, jlptLevel]` — the lexicon's whole truth per word. */
type DriftWordRow = readonly [string, string, string, number];

export interface DriftWord {
  readonly headword: string;
  readonly reading: string;
  readonly gloss: string;
  /** JLPT level, 5 (easiest) … 1. */
  readonly level: number;
}

export interface DriftKanjiInfo {
  readonly character: string;
  /** Katakana on readings, ・-joined, possibly empty. */
  readonly on: string;
  /** Kun readings with okurigana, ・-joined, possibly empty. */
  readonly kun: string;
  readonly meaning: string;
  readonly strokeCount: number;
}

/** Shown above any screen rendered from this tier (REQ-GATE-03 honesty). */
export const DRIFT_TIER_DISCLOSURE =
  'JLPT lexicon tier — one community-list gloss per word and generated kanji ' +
  'data (KanjiVG + KANJIDIC2-derived). Not reviewed dictionary senses.';

const ROWS = driftWordsJson as unknown as readonly DriftWordRow[];
const KINFO = (
  driftKanjiJson as unknown as { KINFO: Record<string, [string, string, string, number]> }
).KINFO;
const KRAD = (driftKanjiJson as unknown as { KRAD: Record<string, readonly string[]> }).KRAD;

const byHeadword = new Map<string, DriftWord>();
for (const [headword, reading, gloss, level] of ROWS) {
  if (!byHeadword.has(headword)) {
    byHeadword.set(headword, { headword, reading, gloss, level });
  }
}

export function isKanjiCharacter(ch: string): boolean {
  return (ch >= '一' && ch <= '鿿') || (ch >= '㐀' && ch <= '䶿');
}

export function findDriftWord(headword: string): DriftWord | null {
  return byHeadword.get(headword.normalize('NFKC').trim()) ?? null;
}

/** The distinct kanji of a headword, in first-appearance order. */
export function driftKanjiOf(headword: string): readonly string[] {
  const out: string[] = [];
  for (const ch of headword) {
    if (isKanjiCharacter(ch) && !out.includes(ch)) out.push(ch);
  }
  return out;
}

export function driftKanjiInfo(character: string): DriftKanjiInfo | null {
  const row = KINFO[character];
  if (!row) return null;
  const [on, kun, meaning, strokeCount] = row;
  return { character, on, kun, meaning, strokeCount };
}

/** Immediate components of a kanji (KanjiVG), only ones this tier can render. */
export function driftKanjiComponents(character: string): readonly string[] {
  return (KRAD[character] ?? []).filter((c) => KINFO[c] !== undefined);
}

/**
 * Words whose written form contains `character`, easiest level first so the
 * list reads as a learning ladder, capped because a screen is not a corpus.
 */
export function driftWordsUsingKanji(character: string, limit = 20): readonly DriftWord[] {
  const out: DriftWord[] = [];
  for (const word of byHeadword.values()) {
    if (word.headword.includes(character)) out.push(word);
  }
  out.sort((a, b) => b.level - a.level || a.headword.localeCompare(b.headword, 'ja'));
  return out.slice(0, limit);
}

/**
 * Words sharing at least one kanji with `headword` — the same literal
 * relation the seed's `wordFamily` uses, never an invented similarity score.
 */
export function driftRelatedWords(headword: string, limit = 12): readonly DriftWord[] {
  const kanji = driftKanjiOf(headword);
  if (kanji.length === 0) return [];
  const seen = new Set<string>([headword]);
  const out: DriftWord[] = [];
  for (const ch of kanji) {
    for (const word of driftWordsUsingKanji(ch, 200)) {
      if (seen.has(word.headword)) continue;
      seen.add(word.headword);
      out.push(word);
    }
  }
  out.sort((a, b) => b.level - a.level || a.headword.localeCompare(b.headword, 'ja'));
  return out.slice(0, limit);
}

/** Live size, for disclosures that state coverage instead of implying it. */
export const DRIFT_WORD_COUNT = byHeadword.size;
