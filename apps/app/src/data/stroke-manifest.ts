/**
 * Which seed stroke file belongs to which character (WP-05).
 *
 * Plain data with no imports, for one reason: `stroke-sources.ts` statically
 * imports ten SVG files through the Metro transformer, which only the bundler
 * can do — the unit-test runner cannot load that module at all. This manifest
 * can be loaded anywhere, so `test/stroke-sources.test.ts` cross-checks it
 * against `seedDataset.strokes.files` and fails if WP-04 ever adds, removes or
 * renames a stroke asset without the app following.
 *
 * The paths are relative to `packages/seed/data/`, exactly as the seed records
 * them in `SeedKanji.strokeSvg`.
 */

export interface StrokeManifestEntry {
  readonly character: string;
  /** Path relative to `packages/seed/data/`, matching `SeedKanji.strokeSvg`. */
  readonly file: string;
}

export const STROKE_MANIFEST: readonly StrokeManifestEntry[] = [
  { character: '分', file: 'strokes/05206.svg' },
  { character: '岐', file: 'strokes/05c90.svg' },
  { character: '点', file: 'strokes/070b9.svg' },
  { character: '路', file: 'strokes/08def.svg' },
  { character: '線', file: 'strokes/07dda.svg' },
  { character: '道', file: 'strokes/09053.svg' },
  { character: '車', file: 'strokes/08eca.svg' },
  { character: '駅', file: 'strokes/099c5.svg' },
  { character: '自', file: 'strokes/081ea.svg' },
  { character: '部', file: 'strokes/090e8.svg' },
];

export const STROKE_MANIFEST_CHARACTERS: readonly string[] = STROKE_MANIFEST.map(
  (entry) => entry.character,
);
