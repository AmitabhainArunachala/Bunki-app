/**
 * The bundler-side half of stroke rendering (WP-05).
 *
 * Each import below is the *text* of a KanjiVG file in `packages/seed`, made
 * possible by the `.svg` transformer in `metro.config.js`. This is the only
 * module in the app that touches those files, and it copies nothing: the
 * CC BY-SA 3.0 bytes stay in `packages/seed`, which is the sole package
 * share-alike data is admitted into (controller §4, DL-33).
 *
 * The paths are relative rather than `@bunki/seed/data/...` deliberately. The
 * seed package exports its API from `src/index.ts` and does not export data
 * subpaths, and widening its `exports` map would be an edit to WP-04's surface.
 * Reaching the files by path is the smaller, visible compromise; the manifest
 * cross-check in `test/stroke-sources.test.ts` is what keeps it from drifting.
 *
 * **This module cannot be imported by the unit tests** — only Metro applies the
 * transformer. Anything testable therefore lives in `kanjivg.ts` (the parser)
 * or `stroke-manifest.ts` (the mapping); this file is a lookup table and a
 * completeness assertion, nothing more.
 */

import bunki05206 from '../../../../packages/seed/data/strokes/05206.svg';
import kanji05c90 from '../../../../packages/seed/data/strokes/05c90.svg';
import kanji070b9 from '../../../../packages/seed/data/strokes/070b9.svg';
import kanji07dda from '../../../../packages/seed/data/strokes/07dda.svg';
import kanji081ea from '../../../../packages/seed/data/strokes/081ea.svg';
import kanji08def from '../../../../packages/seed/data/strokes/08def.svg';
import kanji08eca from '../../../../packages/seed/data/strokes/08eca.svg';
import kanji09053 from '../../../../packages/seed/data/strokes/09053.svg';
import kanji090e8 from '../../../../packages/seed/data/strokes/090e8.svg';
import kanji099c5 from '../../../../packages/seed/data/strokes/099c5.svg';

import { STROKE_MANIFEST } from './stroke-manifest.ts';

/** Keyed by the manifest's file path, so the completeness check below is exact. */
const SVG_TEXT_BY_FILE: Readonly<Record<string, string>> = {
  'strokes/05206.svg': bunki05206,
  'strokes/05c90.svg': kanji05c90,
  'strokes/070b9.svg': kanji070b9,
  'strokes/07dda.svg': kanji07dda,
  'strokes/081ea.svg': kanji081ea,
  'strokes/08def.svg': kanji08def,
  'strokes/08eca.svg': kanji08eca,
  'strokes/09053.svg': kanji09053,
  'strokes/090e8.svg': kanji090e8,
  'strokes/099c5.svg': kanji099c5,
};

const missing = STROKE_MANIFEST.filter((entry) => SVG_TEXT_BY_FILE[entry.file] === undefined);
if (missing.length > 0) {
  // Fail at module load, not on the kanji page. A character silently missing
  // its stroke order would look like a rendering bug on one screen instead of
  // the wiring gap it is.
  throw new Error(
    `stroke-sources.ts is missing an import for: ${missing.map((entry) => `${entry.character} (${entry.file})`).join(', ')}`,
  );
}

const SVG_TEXT_BY_CHARACTER: Readonly<Record<string, string>> = Object.fromEntries(
  STROKE_MANIFEST.map((entry) => [entry.character, SVG_TEXT_BY_FILE[entry.file] ?? '']),
);

/** The raw KanjiVG text for a character, or `null` when the seed has none. */
export function strokeSvgFor(character: string): string | null {
  return SVG_TEXT_BY_CHARACTER[character] ?? null;
}
