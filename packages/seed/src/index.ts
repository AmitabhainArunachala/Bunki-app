/**
 * `@bunki/seed` — the Phase-0 seed dataset (WP-04, controller §8).
 *
 * Owner: WP-04.
 *
 * Share-alike source data is accepted here and *only* here (controller §4,
 * REQ-SRC-02, DL-33). It must not leak into any other package.
 *
 * What this package hands a consumer is a validated dataset in which every data
 * field carries a resolved {@link ProvenanceRecord} — source, version, licence,
 * attribution, modification status, confidence, review status (REQ-SRC-01).
 * Validation runs at import time and throws: a seed record that cannot say where
 * it came from must not reach a screen, an export, or the evidence ledger.
 *
 * Honesty boundaries this package keeps (controller §8, REQ-GATE-03):
 *   - it is a seed, never a dictionary — see {@link SEED_COVERAGE_DISCLOSURE};
 *   - lexeme readings, parts of speech and senses are real JMdict entries and
 *     kanji readings and meanings are real KANJIDIC2 entries, each carrying its
 *     real upstream identifier, but the lists are flattened into this schema's
 *     flat string arrays, so they are labelled `derived`, not `unmodified`;
 *   - EDRDG content is `primary-source-verified`: www.edrdg.org answered this
 *     round, so the files, the licence statement and every re-derived value came
 *     from the licensor's own host. It was `licensed-redistribution` while only
 *     a redistribution was reachable — and that redistribution's bundled licence
 *     copy said CC BY-SA 3.0, which the licensor's own statement contradicts;
 *   - **the imported tier does ship Tatoeba sentences**, under CC BY 2.0 FR,
 *     each naming the member who contributed it. A pair whose contributor could
 *     not be named does not ship at all, because an attribution licence with no
 *     attributable author cannot be complied with; the count dropped for that
 *     reason is in `data/dictionary/manifest.json`. The **fixture tier's** eight
 *     worked example sentences, the grammar constructions and the integration
 *     passage remain this project's own writing and stay labelled as such;
 *   - KanjiVG is likewise verified against the project's own repository over
 *     HTTPS, at a pinned commit.
 *
 * Sources whose licence obliges an acknowledgement on the *screen* rather than
 * in a file are listed in {@link ON_SCREEN_ATTRIBUTION_SOURCES}, and the fields
 * that carry them in {@link FIELDS_REQUIRING_ON_SCREEN_ATTRIBUTION}.
 */

import grammarJson from '../data/grammar.json';
import kanjiJson from '../data/kanji.json';
import licencesJson from '../data/licences.json';
import lexemesJson from '../data/lexemes.json';
import passagesJson from '../data/passages.json';
import provenanceJson from '../data/provenance.json';
import sentencesJson from '../data/sentences.json';
import strokesJson from '../data/strokes.json';

import { buildImportedDictionary, type ImportedDictionary } from './imported.ts';
import type {
  KanjiRadical,
  ProvenanceRecord,
  SeedDataset,
  SeedGrammar,
  SeedKanji,
  SeedLexeme,
  SeedPassage,
  SeedSentence,
  SeedStrokes,
} from './types.ts';
import {
  SeedDataError,
  asInteger,
  asNonEmptyString,
  asRecord,
  asStringArray,
  parseProvenanceRegistry,
  readRecordsArray,
  resolveRecordProvenance,
} from './validate.ts';

export const PACKAGE_NAME = '@bunki/seed';

/**
 * The default canonical fixture (OD-02). The dataset contains both kanji (分 and
 * 岐), lexemes built from them, and a hand-written passage embedding the form,
 * so this target is fully supported by seed data alone.
 */
export const DEFAULT_CANONICAL_TARGET = '分岐';

/**
 * Rendered wherever the dataset could be mistaken for a dictionary
 * (controller §8, REQ-GATE-03). WP-05 wires it into empty-search states.
 */
export const SEED_COVERAGE_DISCLOSURE =
  'This is a Phase-0 seed dataset, not a complete dictionary.';

/**
 * Second honesty string, for surfaces that show a word or kanji page rather than
 * a search result.
 *
 * It carries the CC BY-SA acknowledgement itself, because §3 of the EDRDG
 * licence statement requires that a display of words from the files acknowledge
 * the source *on the screen showing them* — an attribution that lives only in
 * `LICENSES.md` would not satisfy the licence this data ships under.
 *
 * Three things about the wording are load-bearing:
 *
 * - **CC BY-SA 4.0, not 3.0.** The licensor's own statement says V4.0. The
 *   earlier 3.0 here came from a redistributor's bundled copy that was a version
 *   behind, and a user-facing licence claim that is wrong is worse than none.
 * - **It no longer says the entries are project-authored** — that became false
 *   the moment real JMdict and KANJIDIC2 data replaced the editorial placeholders,
 *   and a disclosure that understates real provenance misleads in its own
 *   direction.
 * - **It still disowns what this project did write.** The grammar notes and the
 *   integration passage are this project's, and claiming a corpus wrote them
 *   would be the mirror-image lie of the one WP-04 avoided.
 */
export const SEED_ENTRY_DISCLOSURE =
  'Word readings, senses and kanji meanings come from JMdict and KANJIDIC2, property of the Electronic Dictionary Research and Development Group, used under CC BY-SA 4.0. Stroke order comes from KanjiVG under CC BY-SA 3.0. Imported example sentences come from the Tatoeba Project under CC BY 2.0 FR and name the member who contributed each one. Sense and reading lists are flattened here and may not show every distinction upstream draws. The eight worked examples, the grammar notes and the reading passage are written by this project, not taken from any corpus.';

/** Assert a record's data fields are exactly the ones this loader knows about. */
function expectDataKeys(
  data: Record<string, unknown>,
  expected: readonly string[],
  where: string,
): void {
  const actual = Object.keys(data).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new SeedDataError(
      `${where} has fields [${actual.join(', ')}] but the loader expects [${wanted.join(', ')}]`,
    );
  }
}

function provenanceFor<K extends string>(
  resolved: Record<string, ProvenanceRecord>,
  keys: readonly K[],
  where: string,
): { readonly [P in K]: ProvenanceRecord } {
  const out = {} as { [P in K]: ProvenanceRecord };
  for (const key of keys) {
    const record = resolved[key];
    if (!record) throw new SeedDataError(`${where}.provenance.${key} did not resolve`);
    out[key] = record;
  }
  return out;
}

const LEXEME_KEYS = ['headword', 'reading', 'partOfSpeech', 'senses', 'kanjiUsed'] as const;
const KANJI_KEYS = [
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
const GRAMMAR_KEYS = ['pattern', 'name', 'explanation', 'example', 'exampleTranslation'] as const;
const SENTENCE_KEYS = ['japanese', 'english', 'lexemeIds', 'constructionIds'] as const;
const PASSAGE_KEYS = [
  'title',
  'titleTranslation',
  'targetForm',
  'body',
  'english',
  'lexemeIds',
  'constructionIds',
] as const;

const registry = parseProvenanceRegistry(provenanceJson);

function buildLexemes(): SeedLexeme[] {
  return readRecordsArray(lexemesJson, 'data/lexemes.json').map((raw, index) => {
    const where = `data/lexemes.json[${index}]`;
    const { id, data, provenance } = resolveRecordProvenance(raw, registry, where);
    expectDataKeys(data, LEXEME_KEYS, where);
    return {
      id,
      headword: asNonEmptyString(data['headword'], `${where}.headword`),
      reading: asNonEmptyString(data['reading'], `${where}.reading`),
      partOfSpeech: asStringArray(data['partOfSpeech'], `${where}.partOfSpeech`),
      senses: asStringArray(data['senses'], `${where}.senses`),
      kanjiUsed: asStringArray(data['kanjiUsed'], `${where}.kanjiUsed`),
      provenance: provenanceFor(provenance, LEXEME_KEYS, where),
    };
  });
}

function buildKanji(): SeedKanji[] {
  return readRecordsArray(kanjiJson, 'data/kanji.json').map((raw, index) => {
    const where = `data/kanji.json[${index}]`;
    const { id, data, provenance } = resolveRecordProvenance(raw, registry, where);
    expectDataKeys(data, KANJI_KEYS, where);

    const radicalsRaw = data['radicals'];
    if (!Array.isArray(radicalsRaw)) throw new SeedDataError(`${where}.radicals must be an array`);
    const radicals: KanjiRadical[] = (radicalsRaw as unknown[]).map((entry, radicalIndex) => {
      const radical = asRecord(entry, `${where}.radicals[${radicalIndex}]`);
      return {
        element: asNonEmptyString(radical['element'], `${where}.radicals[${radicalIndex}].element`),
        kind: asNonEmptyString(radical['kind'], `${where}.radicals[${radicalIndex}].kind`),
      };
    });

    return {
      id,
      character: asNonEmptyString(data['character'], `${where}.character`),
      codepoint: asNonEmptyString(data['codepoint'], `${where}.codepoint`),
      strokeCount: asInteger(data['strokeCount'], `${where}.strokeCount`),
      components: asStringArray(data['components'], `${where}.components`),
      radicals,
      strokeSvg: asNonEmptyString(data['strokeSvg'], `${where}.strokeSvg`),
      onReadings: asStringArray(data['onReadings'], `${where}.onReadings`),
      kunReadings: asStringArray(data['kunReadings'], `${where}.kunReadings`),
      meanings: asStringArray(data['meanings'], `${where}.meanings`),
      provenance: provenanceFor(provenance, KANJI_KEYS, where),
    };
  });
}

function buildGrammar(): SeedGrammar[] {
  return readRecordsArray(grammarJson, 'data/grammar.json').map((raw, index) => {
    const where = `data/grammar.json[${index}]`;
    const { id, data, provenance } = resolveRecordProvenance(raw, registry, where);
    expectDataKeys(data, GRAMMAR_KEYS, where);
    return {
      id,
      pattern: asNonEmptyString(data['pattern'], `${where}.pattern`),
      name: asNonEmptyString(data['name'], `${where}.name`),
      explanation: asNonEmptyString(data['explanation'], `${where}.explanation`),
      example: asNonEmptyString(data['example'], `${where}.example`),
      exampleTranslation: asNonEmptyString(
        data['exampleTranslation'],
        `${where}.exampleTranslation`,
      ),
      provenance: provenanceFor(provenance, GRAMMAR_KEYS, where),
    };
  });
}

function buildSentences(): SeedSentence[] {
  return readRecordsArray(sentencesJson, 'data/sentences.json').map((raw, index) => {
    const where = `data/sentences.json[${index}]`;
    const { id, data, provenance } = resolveRecordProvenance(raw, registry, where);
    expectDataKeys(data, SENTENCE_KEYS, where);
    return {
      id,
      japanese: asNonEmptyString(data['japanese'], `${where}.japanese`),
      english: asNonEmptyString(data['english'], `${where}.english`),
      lexemeIds: asStringArray(data['lexemeIds'], `${where}.lexemeIds`),
      constructionIds: asStringArray(data['constructionIds'], `${where}.constructionIds`),
      provenance: provenanceFor(provenance, SENTENCE_KEYS, where),
    };
  });
}

function buildPassages(): SeedPassage[] {
  return readRecordsArray(passagesJson, 'data/passages.json').map((raw, index) => {
    const where = `data/passages.json[${index}]`;
    const { id, data, provenance } = resolveRecordProvenance(raw, registry, where);
    expectDataKeys(data, PASSAGE_KEYS, where);
    return {
      id,
      title: asNonEmptyString(data['title'], `${where}.title`),
      titleTranslation: asNonEmptyString(data['titleTranslation'], `${where}.titleTranslation`),
      targetForm: asNonEmptyString(data['targetForm'], `${where}.targetForm`),
      body: asNonEmptyString(data['body'], `${where}.body`),
      english: asNonEmptyString(data['english'], `${where}.english`),
      lexemeIds: asStringArray(data['lexemeIds'], `${where}.lexemeIds`),
      constructionIds: asStringArray(data['constructionIds'], `${where}.constructionIds`),
      provenance: provenanceFor(provenance, PASSAGE_KEYS, where),
    };
  });
}

function buildStrokes(): SeedStrokes {
  const where = 'data/strokes.json';
  const doc = asRecord(strokesJson, where);
  const upstreamRaw = asRecord(doc['upstream'], `${where}.upstream`);
  const filesRaw = doc['files'];
  if (!Array.isArray(filesRaw)) throw new SeedDataError(`${where}.files must be an array`);

  return {
    upstream: {
      project: asNonEmptyString(upstreamRaw['project'], `${where}.upstream.project`),
      repository: asNonEmptyString(upstreamRaw['repository'], `${where}.upstream.repository`),
      commit: asNonEmptyString(upstreamRaw['commit'], `${where}.upstream.commit`),
      commitResolvedBy: asNonEmptyString(
        upstreamRaw['commitResolvedBy'],
        `${where}.upstream.commitResolvedBy`,
      ),
      retrievedAt: asNonEmptyString(upstreamRaw['retrievedAt'], `${where}.upstream.retrievedAt`),
      license: asNonEmptyString(upstreamRaw['license'], `${where}.upstream.license`),
      licenseTextFile: asNonEmptyString(
        upstreamRaw['licenseTextFile'],
        `${where}.upstream.licenseTextFile`,
      ),
      licenseTextSha256: asNonEmptyString(
        upstreamRaw['licenseTextSha256'],
        `${where}.upstream.licenseTextSha256`,
      ),
      licenseTextUrl: asNonEmptyString(
        upstreamRaw['licenseTextUrl'],
        `${where}.upstream.licenseTextUrl`,
      ),
    },
    files: (filesRaw as unknown[]).map((entry, index) => {
      const file = asRecord(entry, `${where}.files[${index}]`);
      return {
        character: asNonEmptyString(file['character'], `${where}.files[${index}].character`),
        file: asNonEmptyString(file['file'], `${where}.files[${index}].file`),
        upstreamPath: asNonEmptyString(
          file['upstreamPath'],
          `${where}.files[${index}].upstreamPath`,
        ),
        url: asNonEmptyString(file['url'], `${where}.files[${index}].url`),
        bytes: asInteger(file['bytes'], `${where}.files[${index}].bytes`),
        sha256: asNonEmptyString(file['sha256'], `${where}.files[${index}].sha256`),
      };
    }),
  };
}

/**
 * The validated seed dataset. Built once at module load; any violation of
 * REQ-SRC-01 completeness throws {@link SeedDataError} here rather than surfacing
 * as an undefined provenance somewhere downstream.
 */
export const seedDataset: SeedDataset = {
  provenanceSources: registry,
  lexemes: buildLexemes(),
  kanji: buildKanji(),
  grammar: buildGrammar(),
  sentences: buildSentences(),
  passages: buildPassages(),
  strokes: buildStrokes(),
};

/** Every provenanced record in the dataset, for generic walks (feeds T-15). */
export const allSeedRecords = [
  ...seedDataset.lexemes,
  ...seedDataset.kanji,
  ...seedDataset.grammar,
  ...seedDataset.sentences,
  ...seedDataset.passages,
];

/* ------------------------------------------------------------------ *
 * The imported tier, beside the fixture tier and never folded into it
 * ------------------------------------------------------------------ */

/**
 * The 3,000-entry imported dictionary (`src/imported.ts`).
 *
 * Built here rather than in `imported.ts` so both tiers resolve provenance
 * against the *same* `registry` object — one parse of `data/provenance.json`,
 * one set of records, no possibility of the two tiers disagreeing about what
 * `edrdg-jmdict` means.
 *
 * Deliberately a separate export. Nothing merges it into {@link seedDataset}:
 * the fixture tier's scope contract (`test/dataset.test.ts`) says the seed
 * contains exactly sixteen lexemes and ten kanji, and that contract is what
 * keeps the canonical target and the integration passage from being displaced
 * by whichever imported record happened to sort first.
 *
 * It is built *above* the attribution section below because that section reads
 * it. Two tiers ship licensed content, so the obligation has to be computed
 * over both — see {@link FIELDS_REQUIRING_ON_SCREEN_ATTRIBUTION}.
 */
export const importedDictionary: ImportedDictionary = buildImportedDictionary(registry);

/* ------------------------------------------------------------------ *
 * Which fields oblige a screen, and not merely a file
 * ------------------------------------------------------------------ */

/**
 * The sources whose licence is not satisfied by an attribution in a file.
 *
 * §3 of the EDRDG statement is the sharpest of them: "If a WWW server is
 * providing a dictionary function or an on-screen display of words from the
 * files, the acknowledgement must be made on each screen display." KanjiVG and
 * Tatoeba carry the same kind of obligation, and `data/licences.json` records it
 * per source as `requiresOnScreenAttribution`.
 *
 * Read out of that file rather than written here, because a second list is a
 * second thing to forget to update.
 */
export const ON_SCREEN_ATTRIBUTION_SOURCES: readonly string[] = Object.entries(
  (licencesJson as { sources: Record<string, { requiresOnScreenAttribution?: boolean }> }).sources,
)
  .filter(([, entry]) => entry.requiresOnScreenAttribution === true)
  .map(([name]) => name)
  .sort();

/**
 * Every field name in **either tier** whose value comes from such a source.
 *
 * This is the list a consumer needs to answer "does this screen owe an
 * acknowledgement?", and it is *derived from the data* rather than declared:
 * a field that changes provenance changes this list, and a new field arrives in
 * it the moment it carries a licensed source. `apps/app` scans its own screens
 * against it (`apps/app/test/edrdg-acknowledgement.test.ts`), which is what
 * turned "the notice is on the pages we remembered" into a checkable claim after
 * `/canvas` shipped rendering JMdict headwords with no EDRDG string in the DOM.
 *
 * ## Why both tiers, and what it cost to learn that
 *
 * It walked `allSeedRecords` alone — the fixture tier — and that was a hole with
 * a licence breach in it. In the fixture tier `headword` is `bunki-selection`:
 * WP-04 chose which sixteen words to hand-write records for, so the written form
 * of *those* records is this project's editorial selection. In the imported tier
 * `headword` is `edrdg-jmdict`, straight out of the files. Deriving the list from
 * the fixture tier alone therefore concluded that a headword owes nobody an
 * acknowledgement — and `/` shipped a "Kept threads" list rendering JMdict
 * headwords (時間, 学校, 友達) with no EDRDG string anywhere in the DOM, which the
 * unit scan could not see because `headword` was not on the list it derived.
 *
 * Both tiers ship licensed content, so the obligation is computed over both. The
 * imported tier records provenance once per *file* rather than once per record
 * (`ImportedProvenance`), which is why this reads those maps rather than walking
 * 3,000 records to learn the same four facts.
 *
 * Dotted keys — the sentence files write `tatoeba.japaneseContributor` — are
 * split, so each path segment enters the list on its own. A consumer scanning
 * source for property reads sees `sentence.tatoeba.japaneseContributor` as two
 * accesses, and a field name containing a `.` would otherwise be spliced into a
 * regexp where the dot matches anything.
 */
export const FIELDS_REQUIRING_ON_SCREEN_ATTRIBUTION: readonly string[] = (() => {
  const required = new Set(ON_SCREEN_ATTRIBUTION_SOURCES);
  const fields = new Set<string>();

  const add = (field: string, provenance: ProvenanceRecord): void => {
    if (!required.has(provenance.source)) return;
    for (const segment of field.split('.')) {
      if (segment !== '') fields.add(segment);
    }
  };

  // Fixture tier: provenance resolved per record, because sixteen records can
  // each be different.
  for (const record of allSeedRecords) {
    for (const [field, provenance] of Object.entries(record.provenance)) add(field, provenance);
  }

  // Imported tier: provenance resolved per emitted file, for every record in it.
  // Listed by name rather than by `Object.values`, so adding a fifth emitted
  // file is a type error here instead of a silently unwalked map.
  const perFileMaps: readonly Readonly<Record<string, ProvenanceRecord>>[] = [
    importedDictionary.provenance.lexemes,
    importedDictionary.provenance.kanji,
    importedDictionary.provenance.sentences,
    importedDictionary.provenance.strokePaths,
  ];
  for (const perFile of perFileMaps) {
    for (const [field, provenance] of Object.entries(perFile)) add(field, provenance);
  }

  return [...fields].sort();
})();

export const findLexeme = (id: string): SeedLexeme | undefined =>
  seedDataset.lexemes.find((lexeme) => lexeme.id === id);

export const findKanji = (character: string): SeedKanji | undefined =>
  seedDataset.kanji.find((kanji) => kanji.character === character);

export {
  FIXTURE_TIER,
  IMPORTED_TIER,
  IMPORTED_TIER_DISCLOSURE,
  buildImportedDictionary,
} from './imported.ts';
export type {
  ImportedDictionary,
  ImportedKanji,
  ImportedLexeme,
  ImportedProvenance,
  ImportedSentence,
  ImportedStrokeGeometry,
  SeedTier,
} from './imported.ts';

export { SeedDataError } from './validate.ts';
export type * from './types.ts';
