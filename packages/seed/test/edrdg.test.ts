/**
 * Licensed-source integrity: identifiers, licence texts, and the negative half.
 *
 * WP-04's failure mode was not shipping bad data — it was that "we have the
 * licence" and "this really is JMdict" were sentences in a document rather than
 * checks. This file makes both falsifiable, offline, with no network:
 *
 *   1. every field claiming an EDRDG source carries that source's *real* entry
 *      identifier, of the right shape for the file it claims;
 *   2. every licence text this package says it has is on disk, at the recorded
 *      byte length and digest, and its path and digest appear verbatim in
 *      LICENSES.md — so the prose and the bytes cannot drift apart;
 *   3. a source claiming a third-party licence with no verbatim text on file
 *      **fails**. That is the assertion with teeth: without it the first two are
 *      just a description of today's state that tomorrow's import can quietly
 *      invalidate.
 *
 * What this file deliberately does NOT do is re-check the values against
 * upstream. That needs the network and lives in `scripts/fetch-edrdg.mjs
 * --check`; the §17.5 check set must pass offline.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { allSeedRecords, seedDataset } from '../src/index.ts';
import type { ProvenanceRecord } from '../src/types.ts';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readText = (relative: string): string => readFileSync(join(PACKAGE_ROOT, relative), 'utf8');
const sha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

interface LicenceFile {
  readonly bytes: number;
  readonly sha256: string;
  readonly retrievedFrom: string;
  readonly retrievedAt: string;
}
interface LicenceSource {
  readonly license: string;
  readonly requiresOnScreenAttribution: boolean;
  readonly files: readonly string[];
}
interface LicenceBinding {
  readonly sources: Readonly<Record<string, LicenceSource>>;
  readonly files: Readonly<Record<string, LicenceFile>>;
}

const binding = JSON.parse(readText('data/licences.json')) as LicenceBinding;
const licensesMd = readText('LICENSES.md');
const upstream = JSON.parse(readText('data/edrdg-upstream.json')) as {
  upstream: Record<string, string>;
  databaseMeta: Record<string, string>;
  lexemeEntSeq: Record<string, number>;
};

/**
 * Does this source carry a third-party licence, i.e. one this project did not
 * grant itself? The project's own material sits under the pending OD-09
 * placeholder and needs no text on file.
 */
const isThirdParty = (record: Pick<ProvenanceRecord, 'license'>): boolean =>
  !/^pending operator decision/.test(record.license);

/**
 * The predicate the suite is really about: a source may claim a third-party
 * licence only if this package ships that licence's text.
 *
 * Returns the reason it fails, or `null` when it is properly backed. Applied to
 * every real source below *and* to a fabricated one, so the test cannot pass by
 * the predicate being vacuous.
 */
function licenceBackingFailure(
  record: Pick<ProvenanceRecord, 'source' | 'license'>,
): string | null {
  if (!isThirdParty(record)) return null;

  const entry = binding.sources[record.source];
  if (entry === undefined)
    return `${record.source} claims "${record.license}" with no entry in data/licences.json`;
  if (entry.license !== record.license) {
    return `${record.source} is registered as "${record.license}" but licences.json says "${entry.license}"`;
  }
  if (entry.files.length === 0) return `${record.source} lists no licence text`;

  for (const file of entry.files) {
    const meta = binding.files[file];
    if (meta === undefined) return `${file} has no recorded digest`;
    if (!existsSync(join(PACKAGE_ROOT, file))) return `${file} does not exist`;
    if (sha256(readFileSync(join(PACKAGE_ROOT, file))) !== meta.sha256) {
      return `${file} does not match its recorded sha256`;
    }
  }
  return null;
}

describe('every EDRDG claim carries a real upstream identifier', () => {
  it('gives each JMdict-sourced field an ent_seq that the pinned import agrees with', () => {
    const pinned = new Set(Object.values(upstream.lexemeEntSeq).map(String));
    expect(pinned.size).toBe(seedDataset.lexemes.length);

    for (const lexeme of seedDataset.lexemes) {
      const expected = String(upstream.lexemeEntSeq[lexeme.id]);
      for (const field of ['reading', 'partOfSpeech', 'senses'] as const) {
        const provenance = lexeme.provenance[field];
        expect(provenance.source, `${lexeme.id}.${field}`).toBe('JMdict (EDRDG)');
        expect(provenance.source_entry_id, `${lexeme.id}.${field}`).toBe(expected);
      }
    }
  });

  it('gives each KANJIDIC2-sourced field the literal as its identifier', () => {
    for (const kanji of seedDataset.kanji) {
      for (const field of ['onReadings', 'kunReadings', 'meanings'] as const) {
        const provenance = kanji.provenance[field];
        expect(provenance.source, `${kanji.id}.${field}`).toBe('KANJIDIC2 (EDRDG)');
        expect(provenance.source_entry_id, `${kanji.id}.${field}`).toBe(kanji.character);
      }
    }
  });

  it('never leaves a licensed field without an identifier, and never invents one for project text', () => {
    for (const record of allSeedRecords) {
      for (const [field, provenance] of Object.entries(
        record.provenance as Record<string, ProvenanceRecord>,
      )) {
        if (isThirdParty(provenance)) {
          expect(
            provenance.source_entry_id,
            `${record.id}.${field} is licensed but identifies no upstream entry`,
          ).not.toBeNull();
        } else {
          expect(
            provenance.source_entry_id,
            `${record.id}.${field} is project-authored but claims an upstream entry`,
          ).toBeNull();
        }
      }
    }
  });

  it('records the licensor’s own artefacts the EDRDG values were read out of', () => {
    // These are the licensor's files now, not a redistribution, so the recorded
    // URLs must point at EDRDG's host. A digest alone would not catch a switch
    // back to a mirror, which is how the CC BY-SA 3.0 mislabel happened.
    expect(upstream.upstream['jmdictUrl']).toMatch(/^https:\/\/www\.edrdg\.org\//);
    expect(upstream.upstream['kanjidic2Url']).toMatch(/^https:\/\/www\.edrdg\.org\//);
    expect(upstream.upstream['jmdictSha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(upstream.upstream['kanjidic2Sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(upstream.upstream['license']).toBe('CC BY-SA 4.0');
    expect(upstream.upstream['licenseSha256']).toBe(
      binding.files['licenses/EDRDG-licence-statement.html']?.sha256,
    );
    // The superseded route stays named, so the correction remains auditable.
    expect(upstream.upstream['supersedes']).toMatch(/jamdict-data/);
    expect(upstream.databaseMeta['jmdict.version']).toBeTruthy();
    expect(upstream.databaseMeta['kanjidic2.version']).toBeTruthy();
  });
});

describe('licence metadata matches the licence texts on disk and LICENSES.md', () => {
  it('has every recorded licence file, at the recorded size and digest', () => {
    expect(Object.keys(binding.files).length).toBeGreaterThan(0);
    for (const [file, meta] of Object.entries(binding.files)) {
      const path = join(PACKAGE_ROOT, file);
      expect(existsSync(path), `${file} is missing`).toBe(true);
      expect(statSync(path).size, `${file} size`).toBe(meta.bytes);
      expect(sha256(readFileSync(path)), `${file} digest`).toBe(meta.sha256);
      expect(meta.retrievedFrom, `${file} retrieval URL`).toMatch(/^https:\/\//);
      expect(meta.retrievedAt, `${file} retrieval date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('names every licence file and digest in LICENSES.md, so prose and bytes cannot drift', () => {
    for (const [file, meta] of Object.entries(binding.files)) {
      expect(licensesMd, `LICENSES.md does not mention ${file}`).toContain(file);
      expect(licensesMd, `LICENSES.md does not record the digest of ${file}`).toContain(
        meta.sha256,
      );
    }
  });

  it('backs every third-party source in the registry with a licence text', () => {
    const thirdParty = Object.values(seedDataset.provenanceSources).filter(isThirdParty);
    expect(thirdParty.length).toBeGreaterThan(0);
    for (const source of thirdParty) {
      expect(licenceBackingFailure(source), source.source).toBeNull();
    }
  });

  it('states one licence version for the EDRDG fields, in the data and in the prose', () => {
    // The compliance section of LICENSES.md kept saying `CC BY-SA 3.0` for the
    // EDRDG-derived fields long after §2.3 had recorded the correction and the
    // registry had been relabelled 4.0 — the redistributor's bundled version
    // surviving in prose after the data stopped believing it. A user-facing
    // licence claim that is a version behind is worse than none, and a document
    // that contradicts the registry beside it cannot be the compliance record it
    // says it is.
    //
    // Line-scoped rather than document-scoped on purpose: LICENSES.md must stay
    // free to *narrate* the wrong version (§2.3 is entirely about it) and free
    // to state KanjiVG's genuine 3.0. What it may not do is attach a version to
    // the EDRDG-derived fields that the registry does not hold.
    const registered = binding.sources['JMdict (EDRDG)']?.license;
    expect(registered, 'JMdict (EDRDG) is not registered in licences.json').toBe('CC BY-SA 4.0');

    const misattributions = (document: string): readonly string[] =>
      document
        .split('\n')
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => /EDRDG-(derived|sourced)/.test(line))
        .flatMap(({ line, number }) =>
          [...line.matchAll(/CC BY-SA \d+\.\d+/g)]
            .filter((match) => match[0] !== registered)
            .map((match) => `line ${String(number)} attaches ${match[0]} to EDRDG fields`),
        );

    const offenders = misattributions(licensesMd);
    expect(offenders, offenders.join('\n')).toEqual([]);

    // The negative half: the exact sentence this document shipped for two
    // rounds. Without it, the predicate above could be loosened to something
    // that passes on anything and nothing would notice.
    expect(
      misattributions('- **Share-alike.** The EDRDG-derived fields are labelled `CC BY-SA 3.0`,'),
    ).toHaveLength(1);
    // …and KanjiVG's genuine 3.0 is not an offender, because the rule is scoped
    // to lines that attach a version to the EDRDG fields specifically.
    expect(
      misattributions('- **Share-alike** — the derived KanjiVG fields are `CC BY-SA 3.0`.'),
    ).toHaveLength(0);
  });

  it('requires the on-screen attribution flag to be honoured by the disclosure', async () => {
    const { SEED_ENTRY_DISCLOSURE } = await import('../src/index.ts');
    for (const [name, entry] of Object.entries(binding.sources)) {
      if (!entry.requiresOnScreenAttribution) continue;
      const shortName = name.replace(/\s*\(EDRDG\)$/, '');
      const named =
        SEED_ENTRY_DISCLOSURE.includes(shortName) ||
        SEED_ENTRY_DISCLOSURE.includes('Electronic Dictionary Research and Development Group');
      expect(
        named,
        `${name} requires on-screen attribution but is not named in the disclosure`,
      ).toBe(true);
      expect(SEED_ENTRY_DISCLOSURE).toContain(entry.license);
    }
  });
});

describe('a source with no verbatim licence text on file fails the suite', () => {
  it('rejects a fabricated source that claims a licence this package does not ship', () => {
    const failure = licenceBackingFailure({
      source: 'Fictional Example Corpus',
      license: 'CC BY 2.0 FR',
    });
    expect(failure).toMatch(/no entry in data\/licences\.json/);
  });

  it('rejects a known source whose registered licence disagrees with the text on file', () => {
    // 3.0 is the wrong claim now — it is what the superseded redistributor copy
    // said. A record still asserting it must fail rather than pass quietly.
    const failure = licenceBackingFailure({ source: 'JMdict (EDRDG)', license: 'CC BY-SA 3.0' });
    expect(failure).toMatch(/licences\.json says/);
  });

  it('rejects a source whose licence text is missing from disk', () => {
    const failure = licenceBackingFailure({ source: 'Ghost Source', license: 'CC BY-SA 3.0' });
    expect(failure).not.toBeNull();
  });

  it('exempts the project’s own pending-OD-09 material, and only that', () => {
    expect(
      licenceBackingFailure({
        source: 'Bunki Phase-0 seed (hand-assembled by this project)',
        license: 'pending operator decision (OD-09) — original work of this project',
      }),
    ).toBeNull();
  });
});
