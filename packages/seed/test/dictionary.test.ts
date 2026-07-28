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
 *   3. licence metadata matches LICENSES.md and the verbatim texts on disk;
 *   4. a source claiming a licence with no verbatim text on file **fails** —
 *      exercised against a fabricated source, so the predicate cannot pass by
 *      being vacuous.
 *
 * Offline by construction: controller §17.5 must pass with no network. Checking
 * the *values* against upstream needs the network and lives in
 * `scripts/import-sources.mjs --check`.
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
    readonly englishId: string;
    readonly englishContributor: string | null;
  };
}

interface StrokeFile {
  readonly character: string;
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
}

const manifest = readJson<Manifest>('data/dictionary/manifest.json');
const lexemes = readJson<{ records: ImportedLexeme[] }>('data/dictionary/lexemes.json').records;
const kanji = readJson<{ records: ImportedKanji[] }>('data/dictionary/kanji.json').records;
const sentences = readJson<{ records: ImportedSentence[] }>(
  'data/dictionary/sentences.json',
).records;
const strokes = readJson<{ files: StrokeFile[] }>('data/dictionary/strokes.json').files;

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
      expect(sentence.tatoeba.japaneseContributor, sentence.id).toBeTruthy();
      expect(sentence.tatoeba.englishContributor, sentence.id).toBeTruthy();
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
});
