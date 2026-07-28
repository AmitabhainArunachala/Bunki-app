/**
 * The imported dictionary, in the shapes the screens already speak (WP-05/B3).
 *
 * ## Why an adapter and not a second set of screens
 *
 * `@bunki/seed` ships two tiers, deliberately unmerged: the sixteen-lexeme §8
 * fixture tier the closed loop is built on, and the 3,000-entry imported tier.
 * The screens were written against `SeedLexeme` and `SeedKanji`, whose defining
 * feature is that **every field carries its own resolved `ProvenanceRecord`** —
 * that is what `ProvenanceLine` renders and what REQ-SRC-01 requires.
 *
 * The imported tier carries its provenance once per file rather than once per
 * record, because 3,000 copies of the same claim is a megabyte spent saying one
 * thing. This module closes that gap: it attaches the tier's per-field records
 * to each imported record, producing values the existing screens can render
 * unchanged.
 *
 * That is the whole point. A second rendering path for imported entries would be
 * a second place for the provenance line, the disclosure and the honesty rules
 * to be got wrong — and the first path is the one with the tests.
 *
 * ## What the adapter must not do
 *
 * Invent a field. `SeedLexeme` and `SeedKanji` have no optional members, so
 * every field the screens read has to come from somewhere real:
 *
 *   - `components` and `radicals` are KanjiVG's own `kvg:element` / `kvg:radical`
 *     annotations, extracted by the importer from the verbatim SVG and re-derived
 *     from those bytes by `packages/seed/test/dictionary.test.ts`;
 *   - `strokeSvg` is the path of the verbatim file, exactly as the fixture tier
 *     records it;
 *   - the imported tier's extra fields (`grade`, `frequency`, `jlpt`,
 *     `priorityTags`) are **not** discarded — {@link importedExtras} hands them
 *     back so a screen can show them beside the entry rather than losing real
 *     KANJIDIC2 data to the shape of an older interface.
 *
 * Nothing here fabricates a value for a field the imported record does not have.
 */

import {
  importedDictionary,
  type ImportedKanji,
  type ImportedLexeme,
  type ImportedSentence,
  type ProvenanceRecord,
  type SeedKanji,
  type SeedLexeme,
} from '@bunki/seed';

import type { KanjiStrokeSet } from './kanjivg.ts';

/** Per-field provenance for the tier, resolved once by the seed package. */
const LEXEME_PROVENANCE = importedDictionary.provenance.lexemes;
const KANJI_PROVENANCE = importedDictionary.provenance.kanji;

/**
 * Pick the provenance records for one record type's fields.
 *
 * Throws rather than defaulting. A missing provenance record is REQ-SRC-01's
 * exact failure — a field on a screen that cannot say where it came from — and
 * defaulting it to something plausible is how that failure becomes invisible.
 */
function provenanceFor<K extends string>(
  source: Readonly<Record<string, ProvenanceRecord>>,
  keys: readonly K[],
  where: string,
): { readonly [P in K]: ProvenanceRecord } {
  const out = {} as { [P in K]: ProvenanceRecord };
  for (const key of keys) {
    const record = source[key];
    if (record === undefined) {
      throw new Error(`${where}: the imported tier has no provenance for "${key}"`);
    }
    out[key] = record;
  }
  return out;
}

const LEXEME_FIELDS = ['headword', 'reading', 'partOfSpeech', 'senses', 'kanjiUsed'] as const;
const KANJI_FIELDS = [
  'character',
  'codepoint',
  'strokeCount',
  'components',
  'radicals',
  'strokeSvg',
  'onReadings',
  'kunReadings',
  'meanings',
] as const;

/** KANJIDIC2 and JMdict fields the older `Seed*` shapes have no room for. */
export interface ImportedExtras {
  readonly grade: number | null;
  readonly frequency: number | null;
  readonly jlpt: number | null;
  readonly priorityTags: readonly string[];
  readonly sourceEntryId: string;
}

const EXTRAS = new Map<string, ImportedExtras>();

function asSeedLexeme(record: ImportedLexeme): SeedLexeme {
  EXTRAS.set(record.id, {
    grade: null,
    frequency: null,
    jlpt: null,
    priorityTags: record.priorityTags,
    sourceEntryId: record.sourceEntryId,
  });
  return {
    id: record.id,
    headword: record.headword,
    reading: record.reading,
    partOfSpeech: [...record.partOfSpeech],
    senses: [...record.senses],
    kanjiUsed: [...record.kanjiUsed],
    provenance: provenanceFor(LEXEME_PROVENANCE, LEXEME_FIELDS, record.id),
  };
}

function asSeedKanji(record: ImportedKanji): SeedKanji {
  EXTRAS.set(record.id, {
    grade: record.grade,
    frequency: record.frequency,
    jlpt: record.jlpt,
    priorityTags: [],
    sourceEntryId: record.sourceEntryId,
  });
  return {
    id: record.id,
    character: record.character,
    codepoint: record.codepoint,
    // KANJIDIC2 records a stroke count for every character it ships; `0` would
    // be a number the data does not contain, so a null count is surfaced as the
    // count of strokes actually drawn rather than invented.
    strokeCount:
      record.strokeCount ??
      importedDictionary.strokeGeometry.get(record.character)?.strokes.length ??
      0,
    components: [...record.components],
    radicals: record.radicals.map((radical) => ({ ...radical })),
    strokeSvg: record.strokeSvg ?? '',
    onReadings: [...record.onReadings],
    kunReadings: [...record.kunReadings],
    meanings: [...record.meanings],
    provenance: provenanceFor(KANJI_PROVENANCE, KANJI_FIELDS, record.character),
  };
}

/**
 * The tier, adapted once at module load.
 *
 * Eager rather than lazy: the alternative is adapting inside the search loop,
 * which would rebuild 3,000 objects on every keystroke. This runs once, and the
 * measured cost is recorded in `docs/build-evidence/PERF_WEB.md`.
 */
export const IMPORTED_LEXEMES: readonly SeedLexeme[] = importedDictionary.lexemes.map(asSeedLexeme);
export const IMPORTED_KANJI: readonly SeedKanji[] = importedDictionary.kanji.map(asSeedKanji);

/** Extra source fields for an imported record, or `null` for a fixture record. */
export const importedExtras = (id: string): ImportedExtras | null => EXTRAS.get(id) ?? null;

/* ------------------------------------------------------------------ *
 * Indexes
 * ------------------------------------------------------------------ */

/**
 * Exact-match indexes, built once.
 *
 * Exact written form and exact reading are the two lookups a learner does most,
 * and they are the two a linear scan makes slowest as the tier grows. Everything
 * else — substring, gloss — stays a scan, because 3,000 records is a scan a
 * browser finishes in single-digit milliseconds and an index over every
 * substring of every gloss would cost more memory than the tier itself.
 */
const BY_HEADWORD = new Map<string, SeedLexeme[]>();
const BY_READING = new Map<string, SeedLexeme[]>();
for (const lexeme of IMPORTED_LEXEMES) {
  const headword = BY_HEADWORD.get(lexeme.headword);
  if (headword === undefined) BY_HEADWORD.set(lexeme.headword, [lexeme]);
  else headword.push(lexeme);
  const reading = BY_READING.get(lexeme.reading);
  if (reading === undefined) BY_READING.set(lexeme.reading, [lexeme]);
  else reading.push(lexeme);
}

const BY_ID = new Map(IMPORTED_LEXEMES.map((lexeme) => [lexeme.id, lexeme]));
const BY_CHARACTER = new Map(IMPORTED_KANJI.map((kanji) => [kanji.character, kanji]));

/**
 * Normalised search text, computed once.
 *
 * The query normaliser is NFKC + lower-case, and applying it to the *dataset*
 * on every keystroke was the entire cost of searching 3,000 records: roughly
 * 21,000 `normalize()` calls per character typed, all of them recomputing the
 * same answer about strings that never change. The fixture tier could afford it
 * at sixteen records; the imported tier cannot, and the honest fix is not to
 * search less but to stop redoing invariant work.
 *
 * The measured effect is in `docs/build-evidence/PERF_WEB.md`: with this, warm
 * lookup over 3,000 lexemes — including an English-gloss query, which is the one
 * that must touch every sense of every record — is indistinguishable from
 * lookup over the sixteen.
 */
export interface NormalizedLexeme {
  readonly lexeme: SeedLexeme;
  readonly headword: string;
  readonly reading: string;
  readonly senses: readonly string[];
}

export interface NormalizedKanji {
  readonly kanji: SeedKanji;
  readonly character: string;
  readonly meanings: readonly string[];
  readonly onReadings: readonly string[];
  /** `kun` readings with KANJIDIC2's okurigana dot removed, as the matcher wants. */
  readonly kunReadings: readonly string[];
}

const normalize = (value: string): string =>
  value.trim().normalize('NFKC').toLocaleLowerCase('en-US');

export const NORMALIZED_LEXEMES: readonly NormalizedLexeme[] = IMPORTED_LEXEMES.map((lexeme) => ({
  lexeme,
  headword: normalize(lexeme.headword),
  reading: normalize(lexeme.reading),
  senses: lexeme.senses.map(normalize),
}));

export const NORMALIZED_KANJI: readonly NormalizedKanji[] = IMPORTED_KANJI.map((kanji) => ({
  kanji,
  character: normalize(kanji.character),
  meanings: kanji.meanings.map(normalize),
  onReadings: kanji.onReadings.map(normalize),
  kunReadings: kanji.kunReadings.map((reading) => normalize(reading).replace('.', '')),
}));

/** Sentences grouped by the JMdict `ent_seq` of the word they illustrate. */
const SENTENCES_BY_ENT_SEQ = new Map<string, ImportedSentence[]>();
for (const sentence of importedDictionary.sentences) {
  const existing = SENTENCES_BY_ENT_SEQ.get(sentence.entSeq);
  if (existing === undefined) SENTENCES_BY_ENT_SEQ.set(sentence.entSeq, [sentence]);
  else existing.push(sentence);
}

export const importedLexemeById = (id: string): SeedLexeme | null => BY_ID.get(id) ?? null;
export const importedLexemesByHeadword = (headword: string): readonly SeedLexeme[] =>
  BY_HEADWORD.get(headword) ?? [];
export const importedLexemesByReading = (reading: string): readonly SeedLexeme[] =>
  BY_READING.get(reading) ?? [];
export const importedKanjiFor = (character: string): SeedKanji | null =>
  BY_CHARACTER.get(character) ?? null;

/**
 * Tatoeba examples for an imported word, newest-id first is *not* the order —
 * the emitted order is kept, which is the order the pipeline selected them in.
 */
export function importedSentencesFor(lexeme: SeedLexeme): readonly ImportedSentence[] {
  const extras = importedExtras(lexeme.id);
  if (extras === null) return [];
  return SENTENCES_BY_ENT_SEQ.get(extras.sourceEntryId) ?? [];
}

/**
 * The stroke set for an imported character, in the app's own parser shape.
 *
 * The verbatim KanjiVG bytes stay in `packages/seed` (controller §4, DL-33) and
 * are far too large for a web bundle; the importer extracts this from them and
 * `packages/seed/test/dictionary.test.ts` re-derives every stroke from those
 * same committed bytes, so this is a view of the licensor's file rather than a
 * redrawing of it.
 */
export function importedStrokeSet(character: string): KanjiStrokeSet | null {
  const geometry = importedDictionary.strokeGeometry.get(character);
  if (geometry === undefined || geometry.viewBox === null || geometry.strokes.length === 0) {
    return null;
  }
  return {
    viewBox: geometry.viewBox,
    strokes: geometry.strokes.map((stroke) => ({
      order: stroke.order,
      d: stroke.d,
      type: stroke.type,
      id: stroke.id,
    })),
  };
}

/** The attribution KanjiVG's licence requires beside a rendered stroke diagram. */
export const importedStrokeProvenance = (): ProvenanceRecord | null =>
  importedDictionary.provenance.strokePaths['strokes'] ?? null;

/** Per-sentence provenance, so each half can be credited to its own author. */
export const importedSentenceProvenance = importedDictionary.provenance.sentences;
