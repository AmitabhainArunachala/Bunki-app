/**
 * Seed dataset types (WP-04).
 *
 * The load-bearing type here is {@link ProvenanceByField}. Every record type is
 * declared as a plain "fields" interface plus `id` and a provenance map keyed by
 * *exactly* the field names of that interface — `-?` and the absence of an index
 * signature mean a new data field with no provenance entry is a compile error,
 * not a test failure discovered later. The runtime walk in `validate.ts` and the
 * zod schema in `test/schema.test.ts` then check the same property from two other
 * directions, so REQ-SRC-01 completeness is enforced three independent ways.
 */

/** REQ-SRC-01 `modification_status`. */
export type ModificationStatus = 'unmodified' | 'derived' | 'original';

/** REQ-SRC-01 `confidence`. */
export type Confidence = 'high' | 'medium' | 'low';

/**
 * REQ-SRC-01 `review_status`.
 *
 * `primary-source-verified` means the licence and content were checked against
 * the source project's own artefacts over HTTPS in this build session — not
 * against a summary, a mirror, or memory. Nothing may claim it otherwise.
 *
 * `licensed-redistribution` is strictly weaker, and exists because EDRDG's own
 * hosts are refused by this session's egress policy. It means: the content *and*
 * the licensor's own licence statement were taken together from one pinned,
 * sha256-verified artefact published by a named project, and the entry
 * identifiers are the licensor's real ones — but the licensor's host was never
 * reached, so the statement's currency is unverified. It must never be widened
 * to mean "found on a mirror": the artefact, its digest and the licence text's
 * digest are all recorded, and `LICENSES.md` names the redistributor.
 */
export type ReviewStatus =
  | 'primary-source-verified'
  | 'licensed-redistribution'
  | 'reviewed-in-project'
  | 'unreviewed';

/**
 * The seven REQ-SRC-01 fields, in spec order. Exported so tests can assert
 * completeness against the requirement rather than against a hand-copied list.
 */
export const REQ_SRC_01_FIELDS = [
  'source',
  'source_version',
  'license',
  'attribution',
  'modification_status',
  'confidence',
  'review_status',
] as const;

/**
 * The four keys a field may override on its provenance source. Deliberately
 * excludes `source`, `source_version`, `license`, `attribution` and
 * `modification_status`: a field must never be able to quietly relicense or
 * re-attribute itself away from the registry entry it points at.
 */
export const OVERRIDABLE_PROVENANCE_FIELDS = [
  'confidence',
  'review_status',
  'source_entry_id',
  'notes',
] as const;

export interface ProvenanceRecord {
  /** REQ-SRC-01. Who or what the value came from. */
  readonly source: string;
  readonly source_version: string;
  readonly license: string;
  readonly attribution: string;
  readonly modification_status: ModificationStatus;
  readonly confidence: Confidence;
  readonly review_status: ReviewStatus;
  /** Where it was retrieved from, or `null` for values with no external source. */
  readonly source_url: string | null;
  /** ISO date of retrieval, or `null` for values that were not retrieved. */
  readonly retrieved_at: string | null;
  /**
   * The identifier of the specific upstream entry — a JMdict `ent_seq`, a
   * KANJIDIC2 literal, a KanjiVG file path. `null` is an honest answer for
   * project-authored values and for any source whose entry ids could not be
   * obtained; it is never a placeholder for an id that exists but was not looked up.
   */
  readonly source_entry_id: string | null;
  readonly notes: string | null;
}

/** One resolved {@link ProvenanceRecord} per data field of `T`. */
export type ProvenanceByField<T> = { readonly [K in keyof T]-?: ProvenanceRecord };

export interface LexemeFields {
  readonly headword: string;
  readonly reading: string;
  readonly partOfSpeech: readonly string[];
  readonly senses: readonly string[];
  readonly kanjiUsed: readonly string[];
}

export interface SeedLexeme extends LexemeFields {
  readonly id: string;
  readonly provenance: ProvenanceByField<LexemeFields>;
}

export interface KanjiRadical {
  readonly element: string;
  readonly kind: string;
}

export interface KanjiFields {
  readonly character: string;
  readonly codepoint: string;
  readonly strokeCount: number;
  readonly components: readonly string[];
  readonly radicals: readonly KanjiRadical[];
  /** Path to the stroke SVG, relative to `packages/seed/data/`. */
  readonly strokeSvg: string;
  readonly onReadings: readonly string[];
  readonly kunReadings: readonly string[];
  readonly meanings: readonly string[];
}

export interface SeedKanji extends KanjiFields {
  readonly id: string;
  readonly provenance: ProvenanceByField<KanjiFields>;
}

export interface GrammarFields {
  readonly pattern: string;
  readonly name: string;
  readonly explanation: string;
  readonly example: string;
  readonly exampleTranslation: string;
}

export interface SeedGrammar extends GrammarFields {
  readonly id: string;
  readonly provenance: ProvenanceByField<GrammarFields>;
}

export interface SentenceFields {
  readonly japanese: string;
  readonly english: string;
  readonly lexemeIds: readonly string[];
  readonly constructionIds: readonly string[];
}

export interface SeedSentence extends SentenceFields {
  readonly id: string;
  readonly provenance: ProvenanceByField<SentenceFields>;
}

export interface PassageFields {
  readonly title: string;
  readonly titleTranslation: string;
  /** The canonical target the passage is written around (OD-02: 分岐). */
  readonly targetForm: string;
  readonly body: string;
  readonly english: string;
  readonly lexemeIds: readonly string[];
  readonly constructionIds: readonly string[];
}

export interface SeedPassage extends PassageFields {
  readonly id: string;
  readonly provenance: ProvenanceByField<PassageFields>;
}

/** One entry of `data/strokes.json`: a verbatim upstream KanjiVG file. */
export interface StrokeFile {
  readonly character: string;
  /** Path relative to `packages/seed/data/`. */
  readonly file: string;
  /** Path within the upstream KanjiVG repository. */
  readonly upstreamPath: string;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface StrokeUpstream {
  readonly project: string;
  readonly repository: string;
  readonly commit: string;
  readonly commitResolvedBy: string;
  readonly retrievedAt: string;
  readonly license: string;
  readonly licenseTextFile: string;
  readonly licenseTextSha256: string;
  readonly licenseTextUrl: string;
}

export interface SeedStrokes {
  readonly upstream: StrokeUpstream;
  readonly files: readonly StrokeFile[];
}

export interface SeedDataset {
  readonly provenanceSources: Readonly<Record<string, ProvenanceRecord>>;
  readonly lexemes: readonly SeedLexeme[];
  readonly kanji: readonly SeedKanji[];
  readonly grammar: readonly SeedGrammar[];
  readonly sentences: readonly SeedSentence[];
  readonly passages: readonly SeedPassage[];
  readonly strokes: SeedStrokes;
}

/** Every seed record shape, for code that walks the dataset generically. */
export type SeedRecord = SeedLexeme | SeedKanji | SeedGrammar | SeedSentence | SeedPassage;
