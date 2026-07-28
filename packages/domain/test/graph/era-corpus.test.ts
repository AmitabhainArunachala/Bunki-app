/**
 * How much of the real corpus the era rules can actually place (Campaign E / A2′).
 *
 * `era.test.ts` proves the rules behave on fixtures. This file points them at
 * whatever dictionary tiers are actually checked out and reports the number that
 * matters: **what fraction of the corpus we can honestly place, and by which
 * rule**. That number is a claim about the product, so it is re-derived by the
 * test suite rather than measured once by an agent and written into a document.
 *
 * ## Why this is allowed to read `packages/seed/data/`
 *
 * ADR-001 boundary 1 forbids `@bunki/domain` from *importing* `@bunki/seed`, and
 * `packages/seed/README.md` confines share-alike source data to that package.
 * Neither is breached here: nothing is imported, no seed record is copied into
 * this repository, and the file is read at run time and reduced to counts. If
 * the data is not on disk the suite skips and says so — it never substitutes a
 * fixture and calls the resulting number a corpus measurement.
 *
 * ## Two tiers, either of which may be absent
 *
 *   - `packages/seed/data/` — the hand-assembled Phase-0 seed (16 lexemes).
 *   - `packages/seed/data/dictionary/` — the 3,000-lexeme JMdict/KANJIDIC2 tier.
 *
 * The second is imported on its own branch and is not always present on this
 * one. When it lands, this suite starts measuring it with no edit, which is the
 * point: the coverage figure should move when the data moves, not when someone
 * remembers to re-run a script.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ERA_BASES,
  attributeLexemeEra,
  placementForBasis,
  summariseEraCoverage,
  type CharacterReadings,
  type EraAttribution,
  type EraSource,
} from '../../src/index.ts';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEED_DATA = join(PACKAGE_ROOT, '..', 'seed', 'data');

interface RawLexeme {
  readonly headword?: unknown;
  readonly reading?: unknown;
}

interface RawKanji {
  readonly character?: unknown;
  readonly onReadings?: unknown;
  readonly kunReadings?: unknown;
}

function records<T>(path: string): readonly T[] {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(parsed)) return parsed as readonly T[];
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { records?: unknown }).records)
  ) {
    return (parsed as { records: readonly T[] }).records;
  }
  return [];
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

interface Tier {
  readonly name: string;
  readonly sources: readonly EraSource[];
}

function loadTier(name: string, directory: string): Tier | null {
  const lexemePath = join(directory, 'lexemes.json');
  const kanjiPath = join(directory, 'kanji.json');
  if (!existsSync(lexemePath) || !existsSync(kanjiPath)) return null;

  const readings = new Map<string, CharacterReadings>();
  for (const kanji of records<RawKanji>(kanjiPath)) {
    if (typeof kanji.character !== 'string') continue;
    readings.set(kanji.character, {
      on: stringList(kanji.onReadings),
      kun: stringList(kanji.kunReadings),
    });
  }

  const sources: EraSource[] = [];
  for (const lexeme of records<RawLexeme>(lexemePath)) {
    if (typeof lexeme.headword !== 'string' || typeof lexeme.reading !== 'string') continue;
    const characterReadings = new Map<string, CharacterReadings>();
    for (const character of lexeme.headword) {
      const entry = readings.get(character);
      if (entry !== undefined) characterReadings.set(character, entry);
    }
    sources.push({ headword: lexeme.headword, reading: lexeme.reading, characterReadings });
  }
  return sources.length === 0 ? null : { name, sources };
}

const TIERS: readonly Tier[] = [
  loadTier('phase-0 hand seed', SEED_DATA),
  loadTier('3,000-lexeme dictionary tier', join(SEED_DATA, 'dictionary')),
].filter((tier): tier is Tier => tier !== null);

/**
 * The report. Printed rather than asserted against a fixed number, because a
 * threshold here would either be met by loosening the rules — exactly the
 * failure mode this lane exists to avoid — or would break every time the corpus
 * grows. What *is* asserted is that the placement is only ever produced by the
 * one rule allowed to produce it.
 */
function report(tier: Tier, attributions: readonly EraAttribution[]): string {
  const coverage = summariseEraCoverage(attributions);
  const lines = [
    `${tier.name}: ${String(coverage.total)} lexemes`,
    `  placed on a layer: ${String(coverage.total - coverage.byPlacement.unknown)} (${(coverage.placedFraction * 100).toFixed(1)}%)`,
    `  kodo ${String(coverage.byPlacement.kodo)} / kaido ${String(coverage.byPlacement.kaido)} / tetsudo ${String(coverage.byPlacement.tetsudo)} / unknown ${String(coverage.byPlacement.unknown)}`,
  ];
  for (const basis of ERA_BASES) {
    const count = coverage.byBasis[basis];
    if (count === 0) continue;
    lines.push(`  ${basis.padEnd(24)} ${String(count).padStart(5)}  → ${placementForBasis(basis)}`);
  }
  return lines.join('\n');
}

describe.skipIf(TIERS.length === 0)('era coverage over the checked-out corpus', () => {
  it.each(TIERS.map((tier) => [tier.name, tier] as const))(
    'measures %s and places nothing by any rule but the single-morpheme one',
    (_name, tier) => {
      const attributions = tier.sources.map((source) => attributeLexemeEra(source));
      console.log(report(tier, attributions));

      for (const attributed of attributions) {
        expect(attributed.placement).toBe(placementForBasis(attributed.basis));
        if (attributed.placement !== 'unknown') {
          expect(attributed.placement).toBe('kodo');
          expect(attributed.basis).toBe('native_single_morpheme');
          expect(attributed.stratum).toBe('native');
        }
      }

      const coverage = summariseEraCoverage(attributions);
      expect(coverage.total).toBe(tier.sources.length);
      const summed = ERA_BASES.reduce((running, basis) => running + coverage.byBasis[basis], 0);
      expect(summed).toBe(coverage.total);
      // 街道 and 鉄道 have no derivation rule at all. If either is ever
      // non-zero, a rule was added and this assertion is the place that should
      // have been argued with first.
      expect(coverage.byPlacement.kaido).toBe(0);
      expect(coverage.byPlacement.tetsudo).toBe(0);
    },
  );
});

describe.skipIf(TIERS.length > 0)('era coverage over the checked-out corpus', () => {
  it('reports honestly that no corpus was available to measure', () => {
    console.log(
      'no dictionary tier found under packages/seed/data — era coverage was not measured on this checkout',
    );
    expect(TIERS).toEqual([]);
  });
});
