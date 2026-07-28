/**
 * The two era-bearing fields, and the reason they have their own suite.
 *
 * `misc` and `loanSources` were added to the JMdict import for one purpose: the
 * graph's era projection (`packages/domain/src/graph/era.ts`) could place 9.8% of
 * this corpus, all of it on the ancient-road layer from a reading-type rule, and
 * left the Edo-highway and rail layers empty. Nothing in the fields we were
 * importing distinguishes a Meiji coinage from an ancient Buddhist import —
 * 電話 and 世界 came back identical. JMdict *does* carry `&arch;`, `&obs;`,
 * `&hist;` and a source language for borrowed words. The importer was dropping
 * both.
 *
 * That makes these fields a temptation, which is why they are tested here rather
 * than trusted. An era attribute that looks confident and is invented is the
 * defect this project has spent its whole build refusing to ship, and the shortest
 * road to it is a field whose values nobody ever checked against upstream.
 *
 * So the properties below are the ones that would fail if the fields were
 * fabricated, mis-expanded, or quietly defaulted:
 *
 *   1. **Non-vacuity.** Both fields exist on every record and at least one record
 *      actually carries a value. A field that is empty everywhere would satisfy
 *      any "no bad values" test while being useless, and would let a future reader
 *      believe the corpus was checked for era signal when it was not.
 *   2. **Expansion really happened.** JMdict ships these as XML entities (`&arch;`)
 *      declared in its internal DTD. A raw `&arch;` in the data means `expand()`
 *      was not applied and the label is not upstream's wording.
 *   3. **The labels are upstream's, not ours.** Every distinct `misc` value must
 *      look like a JMdict DTD expansion, and the era-bearing ones are pinned by
 *      name — so a rename upstream surfaces as a failure here rather than as a
 *      silently smaller ancient-road layer.
 *   4. **Language codes are codes.** `loanSources` holds ISO 639 codes from the
 *      `xml:lang` attribute, not glosses, not language names, not empty strings.
 *   5. **The measured population is recorded, and it is small.** 96 of 3,000
 *      records carry an era-bearing `misc` label and 1 carries a `loanSource`.
 *      Those numbers are asserted as a floor rather than left in prose, because
 *      the honest smallness of them is the finding: the rail layer cannot be
 *      populated from this corpus, and a future change that appears to populate it
 *      should have to come past this test and explain itself.
 *
 * The last one is the important one. `loanSources` is nearly empty *because*
 * `selectLexemes` filters on `entry.hasKanji`, and borrowed words are
 * overwhelmingly katakana without kanji. That is a real, reportable property of
 * the selection rule, not a parser bug, and the assertion below is what stops it
 * being quietly mistaken for one.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const readJson = <T>(relative: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8')) as T;

interface LexemeRecord {
  readonly id: string;
  readonly headword: string;
  readonly misc?: readonly string[];
  readonly loanSources?: readonly string[];
}

const lexemes = readJson<{ records: LexemeRecord[] }>('data/dictionary/lexemes.json').records;
const fieldProvenance = readJson<{ fieldProvenance: Record<string, string> }>(
  'data/dictionary/lexemes.json',
).fieldProvenance;

/**
 * The `misc` labels that carry an era claim, as JMdict expands them today.
 *
 * Pinned by name deliberately. These five are the entire upstream-authored
 * contribution to the ancient-road layer; if JMdict renames one, the layer
 * silently shrinks and no other test in this repository would notice.
 */
const ERA_BEARING = [
  'archaic',
  'obsolete term',
  'historical term',
  'dated term',
  'rare term',
] as const;

const withMisc = lexemes.filter((r) => (r.misc ?? []).length > 0);
const withLoan = lexemes.filter((r) => (r.loanSources ?? []).length > 0);
const eraBearing = lexemes.filter((r) =>
  (r.misc ?? []).some((m) => (ERA_BEARING as readonly string[]).includes(m)),
);

describe('the era-bearing fields exist on every record', () => {
  it('gives every record both fields, so absent never has to mean unknown', () => {
    for (const record of lexemes) {
      expect(Array.isArray(record.misc), `${record.id} has no misc array`).toBe(true);
      expect(Array.isArray(record.loanSources), `${record.id} has no loanSources array`).toBe(true);
    }
  });

  it('attributes both fields to EDRDG, because both are upstream labels', () => {
    expect(fieldProvenance['misc']).toBe('edrdg-jmdict');
    expect(fieldProvenance['loanSources']).toBe('edrdg-jmdict');
  });
});

describe('the values are upstream JMdict labels, expanded', () => {
  it('is not vacuous — some records really carry a misc label', () => {
    expect(withMisc.length).toBeGreaterThan(0);
  });

  it('never ships a raw XML entity, which would mean expand() did not run', () => {
    for (const record of withMisc) {
      for (const label of record.misc ?? []) {
        expect(/^&.+;$/.test(label), `${record.id} ships unexpanded ${label}`).toBe(false);
        expect(label.trim(), `${record.id} ships a blank misc label`).not.toBe('');
      }
    }
  });

  it('keeps all five era-bearing labels present under their upstream names', () => {
    const seen = new Set(withMisc.flatMap((r) => r.misc ?? []));
    for (const label of ERA_BEARING) {
      expect(seen.has(label), `upstream no longer emits "${label}" — the era layer shrank`).toBe(
        true,
      );
    }
  });

  it('holds ISO 639 codes in loanSources, not language names or glosses', () => {
    for (const record of withLoan) {
      for (const code of record.loanSources ?? []) {
        expect(/^[a-z]{2,3}$/.test(code), `${record.id} ships "${code}" as a language`).toBe(true);
      }
    }
  });
});

describe('the measured population, recorded rather than described', () => {
  it('places at least 96 records on an era-bearing misc label', () => {
    // Measured 2026-07-28 against JMdict_e at the digest in dictionary/manifest.json.
    // Label occurrences: archaic 41, historical term 33, obsolete term 15,
    // dated term 8, rare term 4 — which sums to 101, but the number of *records*
    // is 96, because five records carry two era-bearing labels at once (an entry
    // can be both `archaic` and `historical term`).
    //
    // The first version of this assertion said 101, and this test failed on its
    // own first run and caught it. That is the point of writing the number down:
    // "101 records" was a plausible sentence derived by summing a histogram, and
    // nothing except an assertion against the data would ever have contradicted
    // it. Kept as a floor, so upstream adding labels does not turn into a failure.
    expect(eraBearing.length).toBeGreaterThanOrEqual(96);
  });

  it('finds almost no loanwords, because selectLexemes requires kanji', () => {
    // 1 of 3,000. This is the selection rule showing through, not a parser fault:
    // borrowed words are overwhelmingly katakana without kanji, and
    // `selectLexemes` filters on `entry.hasKanji`. The rail layer therefore cannot
    // be populated from this corpus, and admitting katakana headwords is the
    // change that would alter it. Asserted as a ceiling so that a future change
    // which appears to populate the layer has to come past this test.
    expect(withLoan.length).toBeLessThan(50);
  });
});
