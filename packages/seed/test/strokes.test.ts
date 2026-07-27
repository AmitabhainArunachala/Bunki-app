/**
 * KanjiVG stroke data integrity (WP-04, controller §8).
 *
 * Controller §8 asks for "one KanjiVG-derived stroke SVG set for the seed kanji".
 * The failure mode worth testing for is not a missing file — it is a *plausible
 * looking* file that was drawn, generated, or edited locally and then attributed
 * to KanjiVG. That is licence contamination in the direction nobody notices.
 *
 * So this suite runs entirely offline and asserts the committed bytes are the
 * upstream bytes: recorded sha256 per file, the upstream copyright header intact,
 * and — the part that matters most — every KanjiVG-derived value in
 * `data/kanji.json` (strokeCount, components, radicals) re-derived from the SVG
 * bytes here rather than trusted. `scripts/fetch-kanjivg.mjs --check` closes the
 * remaining gap by re-downloading from the pinned commit.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { seedDataset } from '../src/index.ts';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(PACKAGE_ROOT, 'data');

const readSvg = (relativePath: string): string =>
  readFileSync(join(DATA_DIR, relativePath), 'utf8');

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * Re-derive from the SVG what `data/kanji.json` claims KanjiVG says.
 *
 * `components` are the elements on the *direct children* of the kanji's root
 * group — the standard one-level decomposition. Depth is tracked over `<g>` /
 * `</g>` rather than pattern-matched, so nesting cannot be miscounted.
 */
function deriveFromSvg(svg: string, hex: string) {
  const strokeCount = svg.match(new RegExp(`id="kvg:${hex}-s\\d+"`, 'g'))?.length ?? 0;

  const components: string[] = [];
  let depth = 0;
  let rootDepth: number | null = null;
  for (const match of svg.matchAll(/<g\b[^>]*>|<\/g>/g)) {
    const tag = match[0];
    if (tag === '</g>') {
      depth -= 1;
      continue;
    }
    depth += 1;
    const id = /id="([^"]*)"/.exec(tag)?.[1];
    const element = /kvg:element="([^"]*)"/.exec(tag)?.[1];
    if (id === `kvg:${hex}`) rootDepth = depth;
    else if (rootDepth !== null && depth === rootDepth + 1 && element) components.push(element);
  }

  const radicals = [...svg.matchAll(/kvg:element="([^"]+)"(?=[^>]*kvg:radical="([^"]+)")/g)].map(
    (match) => ({ element: match[1] as string, kind: match[2] as string }),
  );

  return { strokeCount, components, radicals };
}

describe('committed stroke files are the upstream KanjiVG bytes', () => {
  it('records a file for every seed kanji, and no orphans on disk', () => {
    const manifestFiles = seedDataset.strokes.files.map((file) => file.file).sort();
    const onDisk = readdirSync(join(DATA_DIR, 'strokes'))
      .filter((name) => name.endsWith('.svg'))
      .map((name) => `strokes/${name}`)
      .sort();
    expect(onDisk).toEqual(manifestFiles);

    const manifestCharacters = seedDataset.strokes.files.map((file) => file.character).sort();
    const kanjiCharacters = seedDataset.kanji.map((kanji) => kanji.character).sort();
    expect(manifestCharacters).toEqual(kanjiCharacters);
  });

  it.each(
    (() =>
      // Evaluated at collection time so each kanji is its own reported case.
      JSON.parse(readFileSync(join(DATA_DIR, 'strokes.json'), 'utf8')).files as {
        character: string;
        file: string;
        sha256: string;
        bytes: number;
        url: string;
      }[])(),
  )('$character ($file) matches its recorded digest', (entry) => {
    const svg = readSvg(entry.file);
    expect(sha256(svg)).toBe(entry.sha256);
    expect(Buffer.byteLength(svg, 'utf8')).toBe(entry.bytes);
  });

  it('keeps the upstream CC BY-SA 3.0 header in every file', () => {
    for (const file of seedDataset.strokes.files) {
      const svg = readSvg(file.file);
      expect(svg, file.file).toContain('Copyright (C) 2009/2010/2011 Ulrich Apel.');
      expect(svg, file.file).toContain('Attribution-Share Alike 3.0 Licence');
      expect(svg, file.file).toContain('http://creativecommons.org/licenses/by-sa/3.0/');
    }
  });

  it('points every recorded URL at the pinned upstream commit', () => {
    const { commit, repository } = seedDataset.strokes.upstream;
    expect(repository).toBe('https://github.com/KanjiVG/kanjivg');
    expect(commit).toMatch(/^[0-9a-f]{40}$/);
    for (const file of seedDataset.strokes.files) {
      expect(file.url).toBe(
        `https://raw.githubusercontent.com/KanjiVG/kanjivg/${commit}/${file.upstreamPath}`,
      );
    }
  });

  it('ships the upstream licence text at the digest it was retrieved with', () => {
    const { licenseTextFile, licenseTextSha256 } = seedDataset.strokes.upstream;
    const text = readFileSync(join(PACKAGE_ROOT, licenseTextFile), 'utf8');
    expect(sha256(text)).toBe(licenseTextSha256);
    expect(text).toContain('Attribution-ShareAlike');
  });
});

describe('KanjiVG-derived fields are re-derived, not trusted', () => {
  it.each(
    (() =>
      JSON.parse(readFileSync(join(DATA_DIR, 'kanji.json'), 'utf8')).records as {
        character: string;
        strokeSvg: string;
        strokeCount: number;
        components: string[];
        radicals: { element: string; kind: string }[];
      }[])(),
  )('$character: strokeCount, components and radicals come from the SVG', (record) => {
    const hex = /strokes\/([0-9a-f]{5})\.svg/.exec(record.strokeSvg)?.[1];
    expect(hex, `${record.character} has no parseable stroke path`).toBeDefined();
    expect(parseInt(hex as string, 16)).toBe(record.character.codePointAt(0));

    const derived = deriveFromSvg(readSvg(record.strokeSvg), hex as string);
    expect(derived.strokeCount).toBe(record.strokeCount);
    expect(derived.components).toEqual(record.components);
    expect(derived.radicals).toEqual(record.radicals);
  });

  it('attributes exactly the KanjiVG-derived fields to KanjiVG, and nothing else', () => {
    const kanjivgFields = ['strokeCount', 'components', 'radicals', 'strokeSvg'];

    for (const kanji of seedDataset.kanji) {
      const provenance = kanji.provenance as unknown as Record<
        string,
        { source: string; license: string; source_entry_id: string | null }
      >;

      for (const [field, record] of Object.entries(provenance)) {
        if (kanjivgFields.includes(field)) {
          expect(record.source, `${kanji.character}.${field}`).toBe('KanjiVG');
          expect(record.license, `${kanji.character}.${field}`).toBe('CC BY-SA 3.0');
          // Each KanjiVG field names the exact upstream file it came from.
          expect(record.source_entry_id, `${kanji.character}.${field}`).toBe(
            `kanji/${kanji.codepoint.slice(2).toLowerCase().padStart(5, '0')}.svg`,
          );
        } else {
          expect(record.source, `${kanji.character}.${field} must not claim KanjiVG`).not.toBe(
            'KanjiVG',
          );
        }
      }
    }
  });

  it('labels the verbatim SVG unmodified and the extracted values derived', () => {
    for (const kanji of seedDataset.kanji) {
      expect(kanji.provenance.strokeSvg.modification_status).toBe('unmodified');
      for (const field of ['strokeCount', 'components', 'radicals'] as const) {
        expect(kanji.provenance[field].modification_status).toBe('derived');
      }
    }
  });
});
