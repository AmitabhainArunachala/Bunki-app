/**
 * KanjiVG parsing and the app's stroke manifest (REQ-UI-03 Layer 0).
 *
 * The parser is exercised against the *real* seed files rather than a fixture:
 * a fixture would prove the parser reads the fixture. The manifest check is the
 * other half — it fails if WP-04 ever changes the seed's stroke assets without
 * `apps/app` following, which would otherwise surface as one kanji page
 * silently losing its animation.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { seedDataset } from '@bunki/seed';

import {
  KanjiVgParseError,
  parseKanjiVgStrokes,
  strokeAccessibilityLabel,
} from '../src/data/kanjivg.ts';
import { STROKE_MANIFEST, STROKE_MANIFEST_CHARACTERS } from '../src/data/stroke-manifest.ts';

const SEED_DATA_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/seed/data',
);

const readStrokeFile = (file: string): string => readFileSync(resolve(SEED_DATA_DIR, file), 'utf8');

describe('stroke manifest', () => {
  it('names exactly the stroke files the seed ships', () => {
    const seedFiles = seedDataset.strokes.files.map((file) => file.file).sort();
    const manifestFiles = STROKE_MANIFEST.map((entry) => entry.file).sort();
    expect(manifestFiles).toEqual(seedFiles);
  });

  it('maps each file to the character the seed maps it to', () => {
    for (const entry of STROKE_MANIFEST) {
      const seedFile = seedDataset.strokes.files.find((file) => file.file === entry.file);
      expect(seedFile?.character).toBe(entry.character);
    }
  });

  it('covers every seed kanji, so no kanji page loses its animation', () => {
    const seedCharacters = seedDataset.kanji.map((kanji) => kanji.character).sort();
    expect([...STROKE_MANIFEST_CHARACTERS].sort()).toEqual(seedCharacters);
  });
});

describe('KanjiVG parsing', () => {
  it.each(STROKE_MANIFEST)('parses $character ($file)', ({ character, file }) => {
    const parsed = parseKanjiVgStrokes(readStrokeFile(file));
    expect(parsed.viewBox).toMatch(/^[\d\s.-]+$/);
    expect(parsed.strokes.length).toBeGreaterThan(0);

    // Writing order is 1..n with no gaps — the property the animation depends on.
    expect(parsed.strokes.map((stroke) => stroke.order)).toEqual(
      parsed.strokes.map((_stroke, index) => index + 1),
    );

    for (const stroke of parsed.strokes) {
      expect(stroke.d.length).toBeGreaterThan(0);
      expect(stroke.id).toContain('kvg:');
    }

    const seedKanji = seedDataset.kanji.find((entry) => entry.character === character);
    // The seed's own strokeCount is KanjiVG-derived, so the two must agree; a
    // mismatch means one of them is describing a different character.
    expect(parsed.strokes.length).toBe(seedKanji?.strokeCount);
  });

  it('excludes the stroke-number text elements', () => {
    const source = readStrokeFile('strokes/05c90.svg');
    expect(source).toContain('StrokeNumbers');
    // 岐 is seven strokes; the file also carries seven numbers as <text>.
    expect(parseKanjiVgStrokes(source).strokes.length).toBe(7);
  });

  it('rejects an SVG with no viewBox instead of assuming 109×109', () => {
    expect(() => parseKanjiVgStrokes('<svg><path d="M0,0"/></svg>')).toThrow(KanjiVgParseError);
  });

  it('rejects an SVG with no strokes', () => {
    expect(() => parseKanjiVgStrokes('<svg viewBox="0 0 109 109"></svg>')).toThrow(
      KanjiVgParseError,
    );
  });

  it('rejects a file whose ids disagree with its document order', () => {
    const scrambled =
      '<svg viewBox="0 0 109 109"><path id="kvg:05c90-s2" d="M1,1"/><path id="kvg:05c90-s1" d="M2,2"/></svg>';
    expect(() => parseKanjiVgStrokes(scrambled)).toThrow(KanjiVgParseError);
  });
});

describe('stroke accessibility label', () => {
  it('reports progress through the order', () => {
    expect(strokeAccessibilityLabel('岐', 3, 7)).toBe('Stroke order for 岐: 3 of 7 strokes shown.');
  });

  it('reports completion', () => {
    expect(strokeAccessibilityLabel('岐', 7, 7)).toBe('Stroke order for 岐: all 7 strokes shown.');
  });
});
