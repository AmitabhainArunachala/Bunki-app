/**
 * The imported dictionary tier — 3,000 JMdict entries and what they need.
 *
 * ## Two tiers, kept apart on purpose
 *
 * `index.ts` exports {@link seedDataset}: sixteen lexemes, ten kanji, eight
 * worked sentences, the grammar notes and the integration passage. That is the
 * controller §8 **fixture tier**, and the whole closed loop is built on it — the
 * canonical target, the passage the canvas renders, the scope contract
 * `test/dataset.test.ts` pins. It is small because it is *read*: a human has
 * checked every record in it.
 *
 * This module exports the **imported tier**: 3,000 lexemes, 1,241 kanji, 1,241
 * stroke files and 2,000 Tatoeba sentence pairs, emitted by
 * `scripts/import-sources.mjs` from the licensors' own files. Nobody has read
 * 3,000 entries for sense appropriateness, and the tier says so.
 *
 * They are **not merged**. Merging them would make the fixture tier's scope
 * contract meaningless — "the seed contains exactly these sixteen lexemes" is a
 * claim worth keeping, and it is what stops the canonical target from quietly
 * becoming whichever 分岐-shaped record sorted first. Consumers that want both
 * ask for both and can always tell which is which: every record here carries
 * {@link IMPORTED_TIER} in its `tier` field, and every fixture record is reached
 * through `seedDataset`.
 *
 * ## Provenance is per file, not per record
 *
 * The fixture tier resolves provenance record by record, because sixteen records
 * can each be different. Three thousand records emitted by one pipeline from one
 * artefact cannot: they are all the same claim, and repeating it 3,000 times
 * would cost a megabyte to say the same thing. So each emitted file carries a
 * `fieldProvenance` map, resolved once here against the same registry the
 * fixture tier uses, and {@link ImportedProvenance} hands a consumer the
 * per-field {@link ProvenanceRecord} for the tier.
 *
 * It fails closed the same way: an id the registry does not know throws at
 * module load, not at a screen.
 *
 * ## What is *not* here
 *
 * The verbatim KanjiVG SVGs. They are 4.7 MB and would triple a web bundle to
 * ship geometry the renderer re-extracts anyway, and copying them into `apps/app`
 * is forbidden (controller §4, DL-33). `dictionary/stroke-paths.json` carries the
 * extracted paths instead, derived from those same committed bytes and re-derived
 * from them by `test/dictionary.test.ts`, so the verbatim files remain the
 * authority and this remains a view of them.
 */

import kanjiJson from '../data/dictionary/kanji.json';
import manifestJson from '../data/dictionary/manifest.json';
import sentencesJson from '../data/dictionary/sentences.json';
import strokePathsJson from '../data/dictionary/stroke-paths.json';

import type { KanjiRadical, ProvenanceRecord } from './types.ts';
import { SeedDataError, asRecord } from './validate.ts';
import lexemesJson from '../data/dictionary/lexemes.json';

/** Which tier a record came from. Narrow literals so a consumer can switch. */
export const FIXTURE_TIER = 'fixture' as const;
export const IMPORTED_TIER = 'imported' as const;
export type SeedTier = typeof FIXTURE_TIER | typeof IMPORTED_TIER;

export interface ImportedLexeme {
  readonly tier: typeof IMPORTED_TIER;
  readonly id: string;
  readonly headword: string;
  readonly reading: string;
  readonly partOfSpeech: readonly string[];
  readonly senses: readonly string[];
  readonly kanjiUsed: readonly string[];
  /** JMdict's own frequency/commonness tags, which is what ranked the import. */
  readonly priorityTags: readonly string[];
  /** The real `ent_seq` of the JMdict entry this was read from. */
  readonly sourceEntryId: string;
}

export interface ImportedKanji {
  readonly tier: typeof IMPORTED_TIER;
  readonly id: string;
  readonly character: string;
  readonly codepoint: string;
  readonly strokeCount: number | null;
  readonly grade: number | null;
  readonly frequency: number | null;
  readonly jlpt: number | null;
  readonly onReadings: readonly string[];
  readonly kunReadings: readonly string[];
  readonly meanings: readonly string[];
  readonly components: readonly string[];
  readonly radicals: readonly KanjiRadical[];
  /** Path of the verbatim KanjiVG file, relative to `data/`, or `null`. */
  readonly strokeSvg: string | null;
  readonly sourceEntryId: string;
}

/**
 * One Tatoeba pair, with **both** contributors named.
 *
 * CC BY 2.0 FR attributes the individual author, not the corpus, and the two
 * halves are two works by two people. A pair either names both or was not
 * shipped — `manifest.counts.sentencePairsDroppedWithoutNamedContributor`
 * records how many that cost.
 */
export interface ImportedSentence {
  readonly tier: typeof IMPORTED_TIER;
  readonly id: string;
  readonly japanese: string;
  readonly english: string;
  /** The shipped headword whose presence in the Japanese half selected it. */
  readonly headword: string;
  /** The `ent_seq` of that headword's JMdict entry. */
  readonly entSeq: string;
  readonly tatoeba: {
    readonly japaneseId: string;
    readonly japaneseContributor: string;
    readonly englishId: string;
    readonly englishContributor: string;
  };
}

/** Stroke geometry for one character, extracted from its verbatim KanjiVG file. */
export interface ImportedStrokeGeometry {
  readonly viewBox: string | null;
  readonly strokes: readonly {
    readonly order: number;
    readonly d: string;
    readonly type: string | null;
    readonly id: string;
  }[];
}

/** Per-field provenance for the tier, resolved once against the registry. */
export interface ImportedProvenance {
  readonly lexemes: Readonly<Record<string, ProvenanceRecord>>;
  readonly kanji: Readonly<Record<string, ProvenanceRecord>>;
  readonly sentences: Readonly<Record<string, ProvenanceRecord>>;
  readonly strokePaths: Readonly<Record<string, ProvenanceRecord>>;
}

export interface ImportedDictionary {
  readonly tier: typeof IMPORTED_TIER;
  readonly lexemes: readonly ImportedLexeme[];
  readonly kanji: readonly ImportedKanji[];
  readonly sentences: readonly ImportedSentence[];
  readonly strokeGeometry: ReadonlyMap<string, ImportedStrokeGeometry>;
  readonly provenance: ImportedProvenance;
  /** The date the pipeline ran, from the manifest it wrote. */
  readonly generatedAt: string;
  readonly counts: Readonly<Record<string, number>>;
}

interface EmittedFile {
  readonly fieldProvenance?: Readonly<Record<string, string>>;
  readonly records?: readonly unknown[];
}

/**
 * Resolve a file's `fieldProvenance` map against the registry.
 *
 * Fails closed on an unregistered id, exactly as `validate.ts` does for the
 * fixture tier. The importer refuses to *emit* one and this refuses to *load*
 * one — two independent gates, because a hand-edited data file bypasses the
 * first and reaches the second.
 */
function resolveFieldProvenance(
  file: unknown,
  registry: Readonly<Record<string, ProvenanceRecord>>,
  where: string,
): Readonly<Record<string, ProvenanceRecord>> {
  const doc = asRecord(file, where) as EmittedFile;
  const specs = doc.fieldProvenance;
  if (specs === undefined) throw new SeedDataError(`${where} declares no fieldProvenance`);
  const out: Record<string, ProvenanceRecord> = {};
  for (const [field, id] of Object.entries(specs)) {
    const record = registry[id];
    if (record === undefined) {
      throw new SeedDataError(
        `${where}.fieldProvenance.${field} references unknown provenance source "${id}"`,
      );
    }
    out[field] = record;
  }
  return out;
}

/** The records array of an emitted file, or a clear failure. */
function recordsOf(file: unknown, where: string): readonly unknown[] {
  const doc = asRecord(file, where) as EmittedFile;
  if (!Array.isArray(doc.records)) throw new SeedDataError(`${where}.records must be an array`);
  return doc.records;
}

/**
 * Build the tier.
 *
 * The casts are load-bearing rather than lazy, and they are safe for a specific
 * reason: these files are *emitted by this package's own pipeline*, their
 * digests are recorded in `manifest.json`, `--check` re-derives those digests
 * offline, and `test/dictionary.test.ts` asserts the shape of every record and
 * the resolution of every provenance id — against the committed bytes, in the
 * §17.5 run. Re-validating 3,000 records field by field at every app start would
 * pay that cost again at load time to learn what CI already knows.
 *
 * The one thing checked here is what CI cannot check: that the registry the
 * *running build* holds still knows the ids these files name.
 */
function build(registry: Readonly<Record<string, ProvenanceRecord>>): ImportedDictionary {
  const provenance: ImportedProvenance = {
    lexemes: resolveFieldProvenance(lexemesJson, registry, 'data/dictionary/lexemes.json'),
    kanji: resolveFieldProvenance(kanjiJson, registry, 'data/dictionary/kanji.json'),
    sentences: resolveFieldProvenance(sentencesJson, registry, 'data/dictionary/sentences.json'),
    strokePaths: resolveFieldProvenance(
      strokePathsJson,
      registry,
      'data/dictionary/stroke-paths.json',
    ),
  };

  const lexemes = recordsOf(lexemesJson, 'data/dictionary/lexemes.json').map(
    (record) => ({ tier: IMPORTED_TIER, ...(record as object) }) as ImportedLexeme,
  );
  const kanji = recordsOf(kanjiJson, 'data/dictionary/kanji.json').map(
    (record) => ({ tier: IMPORTED_TIER, ...(record as object) }) as ImportedKanji,
  );
  const sentences = recordsOf(sentencesJson, 'data/dictionary/sentences.json').map(
    (record) => ({ tier: IMPORTED_TIER, ...(record as object) }) as ImportedSentence,
  );

  const characters = asRecord(
    (strokePathsJson as { characters?: unknown }).characters,
    'data/dictionary/stroke-paths.json.characters',
  );
  const strokeGeometry = new Map<string, ImportedStrokeGeometry>(
    Object.entries(characters).map(([character, geometry]) => [
      character,
      geometry as ImportedStrokeGeometry,
    ]),
  );

  const manifest = manifestJson as {
    generatedAt?: string;
    counts?: Record<string, number>;
  };

  return {
    tier: IMPORTED_TIER,
    lexemes,
    kanji,
    sentences,
    strokeGeometry,
    provenance,
    generatedAt: manifest.generatedAt ?? 'unknown',
    counts: manifest.counts ?? {},
  };
}

/**
 * What this tier is, in the words a screen may repeat.
 *
 * Not "a dictionary". Three thousand priority-ranked entries out of 218,173 is a
 * useful slice and is not coverage, and nobody has read them for sense
 * appropriateness. A surface that implied otherwise would be the REQ-GATE-03
 * failure the fixture tier's own disclosure exists to prevent, one order of
 * magnitude larger.
 */
export const IMPORTED_TIER_DISCLOSURE =
  'These entries are imported from JMdict, KANJIDIC2, KanjiVG and Tatoeba — 3,000 of the most common words, ranked by JMdict’s own frequency tags. It is a slice, not the whole dictionary, and no one has reviewed these entries individually.';

export { build as buildImportedDictionary };
