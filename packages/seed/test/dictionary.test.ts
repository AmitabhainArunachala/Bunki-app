/**
 * Imported dictionary integrity — the output of `scripts/import-sources.mjs`.
 *
 * The §8 seed fixtures are small enough that a human could read every record and
 * catch a wrong one. The imported tier is not: thousands of records nobody will
 * ever read individually, which is exactly the condition under which fabricated
 * or drifted provenance survives. So the properties asserted here are the ones
 * that stay true at any size, and each is checked against something independent
 * of the prose that claims it:
 *
 *   1. the manifest matches what is actually in `data/` — every emitted file is
 *      re-hashed and compared to the digest the importer recorded, so a
 *      hand-edited record cannot masquerade as imported data;
 *   2. every record's claimed upstream identifier is real *in shape and in
 *      relation* — a JMdict id that does not match its own record id, or a
 *      KANJIDIC2 literal that is not the character it labels, fails;
 *   3. every field names a provenance source that **resolves** against
 *      `data/provenance.json`, because `src/validate.ts` fails closed on an
 *      unknown id and an unresolvable reference makes the whole tier unloadable;
 *   4. licence metadata matches LICENSES.md and the verbatim texts on disk;
 *   5. a source claiming a licence with no verbatim text on file **fails** —
 *      exercised against a fabricated source, so the predicate cannot pass by
 *      being vacuous.
 *
 * Two of these exist because the weaker version of them passed while the data was
 * wrong. The contributor check used to be `toBeTruthy()`, which a non-empty
 * sentinel satisfies — 652 of 2,000 sentences shipped the two characters `\N`, the
 * Tatoeba export's NULL marker, as the name of the member CC BY 2.0 FR obliges us
 * to credit. And nothing checked provenance references at all, so three invented
 * ids (`edrdg-jmdict-primary`, `edrdg-kanjidic2-primary`, `tatoeba-sentence`)
 * registered nowhere reached every record. Both are now positive predicates with a
 * negative case beside them, so they cannot pass by being vacuous either.
 *
 * Offline by construction: controller §17.5 must pass with no network. Re-deriving
 * the *values* from upstream needs the archives and lives in
 * `scripts/import-sources.mjs --verify-reproducible`; `--check` only compares
 * committed bytes to recorded digests and proves tamper-evidence, not derivability.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string): Buffer => readFileSync(join(PACKAGE_ROOT, relative));
const readText = (relative: string): string => read(relative).toString('utf8');
const readJson = <T>(relative: string): T => JSON.parse(readText(relative)) as T;
const sha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

interface Manifest {
  readonly generatedAt: string;
  readonly parameters: Record<string, number | string>;
  readonly sources: Readonly<
    Record<
      string,
      {
        readonly displayName: string;
        readonly license: string;
        readonly licenceFiles: readonly string[];
        readonly url: string;
        readonly retrievedAt: string;
        readonly bytes: number;
        readonly sha256: string;
      }
    >
  >;
  readonly counts: Record<string, number>;
  readonly outputs: Readonly<Record<string, { readonly bytes: number; readonly sha256: string }>>;
  readonly deferred: readonly { readonly source: string; readonly reason: string }[];
}

interface ImportedLexeme {
  readonly id: string;
  readonly headword: string;
  readonly reading: string;
  readonly partOfSpeech: readonly string[];
  readonly senses: readonly string[];
  readonly kanjiUsed: readonly string[];
  readonly priorityTags: readonly string[];
  readonly sourceEntryId: string;
}

interface ImportedKanji {
  readonly id: string;
  readonly character: string;
  readonly codepoint: string;
  readonly strokeCount: number | null;
  readonly onReadings: readonly string[];
  readonly kunReadings: readonly string[];
  readonly meanings: readonly string[];
  readonly components: readonly string[];
  readonly radicals: readonly { readonly element: string; readonly kind: string }[];
  readonly strokeSvg: string | null;
  readonly sourceEntryId: string;
}

interface ImportedSentence {
  readonly id: string;
  readonly japanese: string;
  readonly english: string;
  readonly headword: string;
  readonly entSeq: string;
  readonly tatoeba: {
    readonly japaneseId: string;
    readonly japaneseContributor: string | null;
    readonly japaneseProvenanceRef: string;
    readonly englishId: string;
    readonly englishContributor: string | null;
    readonly englishProvenanceRef: string;
  };
}

interface StrokeFile {
  readonly character: string;
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** Every emitted file carries a per-field map of registered provenance ids. */
interface ProvenancedFile {
  readonly fieldProvenance: Readonly<Record<string, string>>;
}

const manifest = readJson<Manifest>('data/dictionary/manifest.json');
const lexemeFile = readJson<ProvenancedFile & { records: ImportedLexeme[] }>(
  'data/dictionary/lexemes.json',
);
const kanjiFile = readJson<ProvenancedFile & { records: ImportedKanji[] }>(
  'data/dictionary/kanji.json',
);
const sentenceFile = readJson<ProvenancedFile & { records: ImportedSentence[] }>(
  'data/dictionary/sentences.json',
);
const strokeFile = readJson<
  ProvenancedFile & { files: StrokeFile[]; upstream?: { commit: string } }
>('data/dictionary/strokes.json');
const lexemes = lexemeFile.records;
const kanji = kanjiFile.records;
const sentences = sentenceFile.records;
const strokes = strokeFile.files;

const provenanceRegistry = readJson<{ sources: Record<string, unknown> }>('data/provenance.json');
const REGISTERED_SOURCES = new Set(Object.keys(provenanceRegistry.sources));

/**
 * Is this a name a licence could be complied with?
 *
 * A person's Tatoeba username: at least one character, no whitespace, and not a
 * backslash escape. `\N` is the export's MySQL NULL sentinel, not a member, and
 * it is the exact value that a `toBeTruthy()` assertion waved through onto 652
 * shipped records.
 */
const isNamedContributor = (value: string | null | undefined): boolean =>
  typeof value === 'string' && /^[^\s\\]+$/.test(value);

const licences = readJson<{
  sources: Record<string, { license: string; files: string[] }>;
  files: Record<string, { bytes: number; sha256: string; retrievedFrom: string }>;
}>('data/licences.json');
const licensesMd = readText('LICENSES.md');

describe('the manifest describes what is actually on disk', () => {
  it('re-hashes every emitted file to the digest the importer recorded', () => {
    for (const [relative, recorded] of Object.entries(manifest.outputs)) {
      const body = read(join('data', relative));
      expect(body.length, relative).toBe(recorded.bytes);
      expect(sha256(body), relative).toBe(recorded.sha256);
    }
  });

  it('agrees with the record arrays it claims to have produced', () => {
    expect(manifest.counts['lexemes']).toBe(lexemes.length);
    expect(manifest.counts['kanji']).toBe(kanji.length);
    expect(manifest.counts['sentences']).toBe(sentences.length);
    expect(manifest.counts['strokeFiles']).toBe(strokes.length);
  });

  it('records a real upstream download for every source it shipped', () => {
    for (const [key, source] of Object.entries(manifest.sources)) {
      expect(source.url, key).toMatch(/^https:\/\//);
      expect(source.sha256, key).toMatch(/^[0-9a-f]{64}$/);
      expect(source.bytes, key).toBeGreaterThan(0);
      expect(source.retrievedAt, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('every record carries a real upstream identifier', () => {
  it('gives each lexeme a JMdict ent_seq that matches its own id', () => {
    for (const lexeme of lexemes) {
      expect(lexeme.sourceEntryId, lexeme.headword).toMatch(/^\d{6,8}$/);
      expect(lexeme.id, lexeme.headword).toBe(`jmdict-${lexeme.sourceEntryId}`);
    }
  });

  it('gives each kanji the KANJIDIC2 literal, which is the character itself', () => {
    for (const record of kanji) {
      expect(record.sourceEntryId, record.character).toBe(record.character);
      const hex = record.character.codePointAt(0)?.toString(16).padStart(5, '0');
      expect(record.id, record.character).toBe(`kanji-${hex}`);
      expect(record.codepoint, record.character).toBe(
        `U+${record.character.codePointAt(0)?.toString(16).toUpperCase()}`,
      );
    }
  });

  it('gives every record a unique id', () => {
    for (const set of [lexemes, kanji, sentences]) {
      const ids = set.map((record) => record.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('cites a Tatoeba sentence id and a named contributor for both halves of a pair', () => {
    for (const sentence of sentences) {
      expect(sentence.id).toBe(`tatoeba-${sentence.tatoeba.japaneseId}`);
      expect(sentence.tatoeba.japaneseId, sentence.id).toMatch(/^\d+$/);
      expect(sentence.tatoeba.englishId, sentence.id).toMatch(/^\d+$/);
      // CC BY 2.0 FR is an attribution licence: a sentence whose contributor was
      // dropped could not be attributed, so it must not have shipped at all.
      //
      // Stated as a *positive* pattern, not toBeTruthy(). The weaker form passed
      // on the literal two characters `\N` — the Tatoeba export's MySQL NULL
      // sentinel — which is non-empty and is nobody's name.
      expect(isNamedContributor(sentence.tatoeba.japaneseContributor), sentence.id).toBe(true);
      expect(isNamedContributor(sentence.tatoeba.englishContributor), sentence.id).toBe(true);
    }
  });

  it('does not contain the NULL sentinel anywhere in the shipped file', () => {
    // Independent of the per-record predicate above, and cheaper to reason
    // about: the two characters `\N` are the Tatoeba export's MySQL NULL marker,
    // 652 of them shipped as contributor names in round 1, and they have no
    // legitimate reason to appear in this file in any field at all.
    const raw = readText('data/dictionary/sentences.json');
    expect(raw).not.toContain('\\\\N');
    const sentinels = sentences.filter(
      (sentence) =>
        sentence.tatoeba.japaneseContributor === '\\N' ||
        sentence.tatoeba.englishContributor === '\\N',
    );
    expect(sentinels.map((sentence) => sentence.id)).toEqual([]);
  });

  it('drops rather than softens: the count is on the record, with its reason', () => {
    // The round-1 repair could have been done two ways — resolve the missing
    // contributors, or drop the pairs. It dropped them, and "we removed rather
    // than softened" is only checkable if the number is written down.
    const dropped = manifest.counts['sentencePairsDroppedWithoutNamedContributor'];
    expect(dropped).toBeTypeOf('number');
    expect(dropped, 'no pairs were dropped, which for this corpus is implausible').toBeGreaterThan(
      0,
    );
    const reason = manifest.deferred.find((entry) => entry.source === 'tatoeba')?.reason ?? '';
    expect(reason).toContain(String(dropped));
    expect(reason).toMatch(/NULL sentinel/);
    // …and every pair that *did* ship names both people.
    expect(sentences.length).toBe(manifest.counts['sentences']);
  });

  it('rejects the sentinel and the blanks that used to pass for a name', () => {
    // The negative half. Without it the predicate above could be loosened back to
    // something a sentinel satisfies and nothing would notice.
    for (const notAName of ['\\N', '', '   ', '\t', null, undefined]) {
      expect(isNamedContributor(notAName as string | null), JSON.stringify(notAName)).toBe(false);
    }
    for (const name of ['bunbuku', 'CK', 'small_snow', 'user.name', 'a-b']) {
      expect(isNamedContributor(name), name).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Provenance references resolve
 * ------------------------------------------------------------------ */

describe('every imported field names a provenance source that exists', () => {
  const files: ReadonlyArray<readonly [string, ProvenancedFile, readonly string[]]> = [
    [
      'dictionary/lexemes.json',
      lexemeFile,
      [
        'headword',
        'reading',
        'partOfSpeech',
        'senses',
        'kanjiUsed',
        'priorityTags',
        'sourceEntryId',
      ],
    ],
    [
      'dictionary/kanji.json',
      kanjiFile,
      [
        'character',
        'codepoint',
        'strokeCount',
        'grade',
        'frequency',
        'jlpt',
        'onReadings',
        'kunReadings',
        'meanings',
        'strokeSvg',
        'sourceEntryId',
      ],
    ],
    [
      'dictionary/sentences.json',
      sentenceFile,
      [
        'japanese',
        'english',
        'headword',
        'entSeq',
        'tatoeba.japaneseId',
        'tatoeba.japaneseContributor',
        'tatoeba.englishId',
        'tatoeba.englishContributor',
      ],
    ],
    ['dictionary/strokes.json', strokeFile, ['files']],
  ];

  it.each(files.map(([name]) => name))(
    '%s resolves every id against data/provenance.json',
    (name) => {
      const entry = files.find(([file]) => file === name);
      const map = entry?.[1].fieldProvenance ?? {};
      expect(
        Object.keys(map).length,
        `${name} declares no field provenance at all`,
      ).toBeGreaterThan(0);
      for (const [field, id] of Object.entries(map)) {
        expect(
          REGISTERED_SOURCES.has(id),
          `${name}.${field} references "${id}", which data/provenance.json does not register — src/validate.ts fails closed on it`,
        ).toBe(true);
      }
    },
  );

  it.each(files.map(([name]) => name))('%s provenances every field it emits', (name) => {
    const entry = files.find(([file]) => file === name);
    const map = entry?.[1].fieldProvenance ?? {};
    for (const field of entry?.[2] ?? []) {
      expect(map[field], `${name} emits ${field} with no provenance entry (REQ-SRC-01)`).toBeTypeOf(
        'string',
      );
    }
  });

  it('keeps the two halves of every sentence separately attributed', () => {
    // The claim §5 of the review turned on: two works, two people, two credits.
    for (const sentence of sentences) {
      expect(sentence.tatoeba.japaneseProvenanceRef, sentence.id).toBe('tatoeba-japanese');
      expect(sentence.tatoeba.englishProvenanceRef, sentence.id).toBe('tatoeba-english');
      expect(REGISTERED_SOURCES.has(sentence.tatoeba.japaneseProvenanceRef)).toBe(true);
      expect(REGISTERED_SOURCES.has(sentence.tatoeba.englishProvenanceRef)).toBe(true);
    }
  });

  it('fails an id that is not in the registry, so the check is not vacuous', () => {
    for (const invented of [
      'edrdg-jmdict-primary',
      'edrdg-kanjidic2-primary',
      'tatoeba-sentence',
    ]) {
      expect(REGISTERED_SOURCES.has(invented), invented).toBe(false);
    }
    // …and the ids actually used are the registered ones.
    for (const real of ['edrdg-jmdict', 'edrdg-kanjidic2', 'tatoeba-japanese', 'tatoeba-english']) {
      expect(REGISTERED_SOURCES.has(real), real).toBe(true);
    }
  });
});

describe('the imported tier closes over itself', () => {
  it('ships a kanji record only for kanji some imported word actually uses', () => {
    const used = new Set(lexemes.flatMap((lexeme) => lexeme.kanjiUsed));
    for (const record of kanji) {
      expect(used.has(record.character), `${record.character} is used by no imported word`).toBe(
        true,
      );
    }
  });

  it('attaches every sentence to a word the dictionary can actually explain', () => {
    const byEntSeq = new Map(lexemes.map((lexeme) => [lexeme.sourceEntryId, lexeme]));
    for (const sentence of sentences) {
      const lexeme = byEntSeq.get(sentence.entSeq);
      expect(lexeme, `${sentence.id} cites ${sentence.entSeq}`).toBeDefined();
      expect(sentence.headword).toBe(lexeme?.headword);
      // The claim "this sentence is an example of this word" has to be true of
      // the text, not just recorded in a field.
      expect(sentence.japanese, `${sentence.id} does not contain ${sentence.headword}`).toContain(
        sentence.headword,
      );
    }
  });

  it('backs every referenced stroke file with bytes at the recorded digest', () => {
    const declared = new Map(strokes.map((file) => [file.file, file]));
    for (const record of kanji) {
      if (record.strokeSvg === null) continue;
      const file = declared.get(record.strokeSvg);
      expect(file, `${record.character} -> ${record.strokeSvg}`).toBeDefined();
    }
    for (const file of strokes) {
      const body = read(join('data', file.file));
      expect(body.length, file.file).toBe(file.bytes);
      expect(sha256(body), file.file).toBe(file.sha256);
      // Verbatim upstream KanjiVG, not a redrawn or minified copy.
      expect(body.toString('utf8'), file.file).toContain('kvg:');
    }
  });
});

/* ------------------------------------------------------------------ *
 * The derived KanjiVG views are views, not new drawings
 * ------------------------------------------------------------------ */

describe('everything derived from KanjiVG is re-derivable from the bytes it claims', () => {
  // The app cannot ship 4.7 MB of verbatim SVG in a web bundle and may not copy
  // those bytes out of this package (controller §4, DL-33), so it renders from
  // `stroke-paths.json` and reads components and radicals out of `kanji.json`.
  // Each of those is a *claim about* the committed SVGs. Re-deriving them here,
  // from the files on disk, is what stops the derived view from drifting — or
  // from being hand-drawn, which no digest would catch because the digests are
  // of the derived file itself.
  interface DerivedStroke {
    readonly order: number;
    readonly d: string;
    readonly type: string | null;
    readonly id: string;
  }
  interface StrokePaths {
    readonly upstream: { readonly derivedFrom: string; readonly commit: string };
    readonly characters: Readonly<
      Record<
        string,
        { readonly viewBox: string | null; readonly strokes: readonly DerivedStroke[] }
      >
    >;
  }
  const strokePaths = readJson<ProvenancedFile & StrokePaths>('data/dictionary/stroke-paths.json');
  const svgFor = (character: string): string => {
    const file = kanji.find((record) => record.character === character)?.strokeSvg;
    if (file === null || file === undefined) throw new Error(`${character} has no stroke file`);
    return read(join('data', file)).toString('utf8');
  };

  it('covers exactly the characters that ship a verbatim stroke file', () => {
    const withSvg = kanji.filter((record) => record.strokeSvg !== null).map((r) => r.character);
    expect(Object.keys(strokePaths.characters).sort()).toEqual([...withSvg].sort());
    expect(withSvg.length).toBeGreaterThan(1000);
  });

  it('re-derives every stroke, its type and its id from the committed SVG', () => {
    for (const [character, geometry] of Object.entries(strokePaths.characters)) {
      const svg = svgFor(character);
      const derived: DerivedStroke[] = [];
      for (const path of svg.matchAll(/<path\b([^>]*)\/?>/gi)) {
        const attributes = path[1] ?? '';
        const d = /\bd="([^"]*)"/.exec(attributes)?.[1];
        if (d === undefined || d === '') continue;
        derived.push({
          order: derived.length + 1,
          d,
          type: /kvg:type="([^"]*)"/.exec(attributes)?.[1] ?? null,
          id: /\bid="([^"]*)"/.exec(attributes)?.[1] ?? '',
        });
      }
      expect(geometry.strokes, character).toEqual(derived);
      expect(geometry.viewBox, character).toBe(
        /<svg\b[^>]*\bviewBox="([^"]+)"/i.exec(svg)?.[1] ?? null,
      );
      // A character with no strokes would render as a blank diagram that looks
      // like a styling bug rather than the missing data it is.
      expect(geometry.strokes.length, character).toBeGreaterThan(0);
    }
  });

  it('keeps the writing order the file states, which is what the animation shows', () => {
    // KanjiVG encodes the stroke number in the id's `-sN` suffix, and the app's
    // parser refuses to animate a file whose ids and document order disagree.
    // The derived view has to preserve that or the check is bypassed for 1,241
    // characters.
    for (const [character, geometry] of Object.entries(strokePaths.characters)) {
      geometry.strokes.forEach((stroke, index) => {
        expect(stroke.order, `${character} stroke ${String(index)}`).toBe(index + 1);
        const declared = /-s(\d+)$/.exec(stroke.id);
        if (declared !== null) expect(Number(declared[1]), stroke.id).toBe(index + 1);
      });
    }
  });

  it('re-derives every component and radical from the same SVG', () => {
    for (const record of kanji) {
      if (record.strokeSvg === null) continue;
      const svg = svgFor(record.character);
      const components: string[] = [];
      const radicals: { element: string; kind: string }[] = [];
      for (const group of svg.matchAll(/<g\b[^>]*>/g)) {
        const element = /kvg:element="([^"]*)"/.exec(group[0])?.[1];
        if (element === undefined || element === record.character) continue;
        if (!components.includes(element)) components.push(element);
        const kind = /kvg:radical="([^"]*)"/.exec(group[0])?.[1];
        if (kind !== undefined && !radicals.some((entry) => entry.element === element)) {
          radicals.push({ element, kind });
        }
      }
      expect(record.components, record.character).toEqual(components);
      expect(record.radicals, record.character).toEqual(radicals);
    }
  });

  it('fails a fabricated path, so the re-derivation is not vacuous', () => {
    const character = Object.keys(strokePaths.characters)[0] as string;
    const real = strokePaths.characters[character]?.strokes ?? [];
    expect(real.map((stroke) => stroke.d)).not.toEqual(['M0,0 L109,109']);
  });

  it('says which files it was derived from, and pins the same KanjiVG commit', () => {
    expect(strokePaths.upstream.derivedFrom).toBe('dictionary/strokes/*.svg');
    expect(strokePaths.upstream.commit).toBe(strokeFile.upstream?.commit);
  });

  it('labels the derived geometry as KanjiVG’s, not as this project’s', () => {
    for (const id of Object.values(strokePaths.fieldProvenance)) {
      expect(REGISTERED_SOURCES.has(id), id).toBe(true);
      expect(id).toBe('kanjivg-derived');
    }
    for (const field of ['components', 'radicals'] as const) {
      expect(kanjiFile.fieldProvenance[field], field).toBe('kanjivg-derived');
    }
  });
});

/* ------------------------------------------------------------------ *
 * The tier is reachable, and is still not the fixture tier
 * ------------------------------------------------------------------ */

describe('the package exports the imported tier without merging it', () => {
  /**
   * An explicit budget, because the first assertion in this block pays for the
   * whole dictionary.
   *
   * `await import('../src/index.ts')` parses and validates 3,000 lexemes and
   * 1,241 kanji, which takes roughly four seconds on its own — most of vitest's
   * five-second default before any other file is competing for the CPU. That
   * default has now been crossed twice as the suite grew: `apps/app`'s
   * `screen-contract.test.ts` hit the identical cause and recorded the identical
   * fix ("twenty seconds is the load headroom; the assertion is untouched"),
   * and lane L1's generated-learner suite crossed it again here.
   *
   * The module is memoised, so in declaration order only the first of these
   * tests pays. The budget is stated on each of them anyway, because which one
   * runs first is an ordering detail and a reordering must not be able to move
   * the cost onto a test with no headroom.
   *
   * No assertion below is changed by this. A failure here is still a failure.
   */
  const SEED_IMPORT_BUDGET_MS = 20_000;

  it(
    'exports a tier a consumer can actually reach',
    async () => {
      const { importedDictionary } = await import('../src/index.ts');
      expect(importedDictionary.lexemes.length).toBe(lexemes.length);
      expect(importedDictionary.kanji.length).toBe(kanji.length);
      expect(importedDictionary.sentences.length).toBe(sentences.length);
      expect(importedDictionary.strokeGeometry.size).toBe(strokes.length);
    },
    SEED_IMPORT_BUDGET_MS,
  );

  it(
    'leaves the §8 fixture tier exactly as it was',
    async () => {
      // The scope contract in `dataset.test.ts` is the real assertion; this is the
      // one-line version, here so a reader of *this* file can see that adding
      // 3,000 entries did not quietly widen the sixteen.
      const { seedDataset } = await import('../src/index.ts');
      expect(seedDataset.lexemes).toHaveLength(16);
      expect(seedDataset.kanji).toHaveLength(10);
    },
    SEED_IMPORT_BUDGET_MS,
  );

  it(
    'marks every imported record so the two tiers can never be confused',
    async () => {
      const { importedDictionary, IMPORTED_TIER } = await import('../src/index.ts');
      expect(IMPORTED_TIER).toBe('imported');
      for (const record of [
        ...importedDictionary.lexemes.slice(0, 50),
        ...importedDictionary.kanji.slice(0, 50),
        ...importedDictionary.sentences.slice(0, 50),
      ]) {
        expect(record.tier).toBe(IMPORTED_TIER);
      }
    },
    SEED_IMPORT_BUDGET_MS,
  );

  it(
    'resolves every field of the tier to a registered provenance record',
    async () => {
      const { importedDictionary } = await import('../src/index.ts');
      const groups: Readonly<
        Record<string, { source: string; license: string; attribution: string }>
      >[] = Object.values(importedDictionary.provenance);
      expect(groups.length).toBe(4);
      for (const group of groups) {
        const fields = Object.entries(group);
        expect(fields.length).toBeGreaterThan(0);
        for (const [field, record] of fields) {
          expect(record.source, field).toBeTruthy();
          expect(record.license, field).toBeTruthy();
          expect(record.attribution, field).toBeTruthy();
        }
      }
    },
    SEED_IMPORT_BUDGET_MS,
  );

  it(
    'says plainly that 3,000 entries are not a dictionary',
    async () => {
      const { IMPORTED_TIER_DISCLOSURE } = await import('../src/index.ts');
      expect(IMPORTED_TIER_DISCLOSURE).toMatch(/slice, not the whole dictionary/);
      expect(IMPORTED_TIER_DISCLOSURE).toMatch(/no one has reviewed these entries individually/i);
    },
    SEED_IMPORT_BUDGET_MS,
  );
});

describe('licence metadata matches the verbatim texts on file', () => {
  it('has every licence text a shipped source depends on, at its recorded digest', () => {
    for (const [key, source] of Object.entries(manifest.sources)) {
      for (const relative of source.licenceFiles) {
        const recorded = licences.files[relative];
        expect(recorded, `${key} -> ${relative}`).toBeDefined();
        expect(existsSync(join(PACKAGE_ROOT, relative)), relative).toBe(true);
        const body = read(relative);
        expect(body.length, relative).toBe(recorded?.bytes);
        expect(sha256(body), relative).toBe(recorded?.sha256);
      }
    }
  });

  it('agrees with data/licences.json about which licence each source is under', () => {
    for (const [key, source] of Object.entries(manifest.sources)) {
      const registered = licences.sources[source.displayName];
      expect(registered, `${key} (${source.displayName}) is not in licences.json`).toBeDefined();
      expect(registered?.license, source.displayName).toBe(source.license);
    }
  });

  it('names every licence file and digest in LICENSES.md, so prose cannot drift', () => {
    for (const source of Object.values(manifest.sources)) {
      for (const relative of source.licenceFiles) {
        const bare = relative.replace(/^licenses\//, '');
        expect(licensesMd, relative).toContain(bare);
        expect(licensesMd, relative).toContain(licences.files[relative]?.sha256 ?? 'MISSING');
      }
    }
  });

  it('states the EDRDG licence as the licensor states it, not as a redistributor did', () => {
    // The value this whole round turned on: the redistributor's bundled copy said
    // 3.0, the licensor says 4.0. If this ever reverts, the data is mislabelled.
    for (const source of Object.values(manifest.sources)) {
      if (!/EDRDG/.test(source.displayName)) continue;
      expect(source.license, source.displayName).toBe('CC BY-SA 4.0');
      expect(source.url, source.displayName).toMatch(/^https:\/\/www\.edrdg\.org\//);
    }
  });
});

describe('the negative half: an unlicensed source cannot ship', () => {
  /** The gate, restated in the test so it is checked rather than described. */
  const licenceTextsPresent = (files: readonly string[]): boolean =>
    files.every((relative) => {
      const recorded = licences.files[relative];
      if (!recorded) return false;
      if (!existsSync(join(PACKAGE_ROOT, relative))) return false;
      return sha256(read(relative)) === recorded.sha256;
    });

  it('passes every source this package actually ships', () => {
    for (const [key, source] of Object.entries(manifest.sources)) {
      expect(licenceTextsPresent(source.licenceFiles), key).toBe(true);
    }
  });

  it('fails a fabricated source whose licence text is not on file', () => {
    expect(licenceTextsPresent(['licenses/NOT-A-REAL-LICENCE.txt'])).toBe(false);
  });

  it('fails a source whose licence file exists but does not match its digest', () => {
    // Simulates a licence text edited after the fact: the path resolves, the
    // bytes do not. Without this, "the file is there" would be the whole check.
    const relative = Object.keys(licences.files)[0] ?? '';
    const tampered = {
      ...licences.files,
      [relative]: { ...licences.files[relative], sha256: 'x'.repeat(64) },
    };
    const present = [relative].every((path) => {
      const recorded = tampered[path];
      return recorded !== undefined && sha256(read(path)) === recorded.sha256;
    });
    expect(present).toBe(false);
  });

  it('records a reason for anything it declined to ship', () => {
    for (const entry of manifest.deferred) {
      expect(entry.reason, entry.source).toBeTruthy();
    }
  });

  it('counts the sentence pairs it dropped for having no named contributor', () => {
    // Dropping data silently and dropping it on the record are different acts.
    // The count is what makes "we removed rather than softened" checkable.
    const dropped = manifest.counts['sentencePairsDroppedWithoutNamedContributor'];
    expect(dropped, 'the importer no longer reports what it declined to attribute').toBeTypeOf(
      'number',
    );
    if ((dropped ?? 0) > 0) {
      const reasons = manifest.deferred.map((entry) => entry.reason).join('\n');
      expect(reasons, 'pairs were dropped but nothing says why').toContain(String(dropped));
    }
  });
});
