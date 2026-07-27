/**
 * `@bunki/seed` — the Phase-0 seed dataset.
 *
 * Owner: WP-04.
 *
 * Share-alike source data is accepted here and *only* here (controller §4,
 * REQ-SRC-02, DL-33). It must not leak into any other package.
 *
 * WP-01 scaffold: identity constants only, no data.
 */

export const PACKAGE_NAME = '@bunki/seed';

/**
 * The default canonical fixture (OD-02). WP-04's dataset must contain both
 * kanji (分 and 岐) so this target is fully supported by seed data alone.
 */
export const DEFAULT_CANONICAL_TARGET = '分岐';

/**
 * Rendered wherever the dataset could be mistaken for a dictionary
 * (controller §8, REQ-GATE-03). WP-05 wires it into empty-search states.
 */
export const SEED_COVERAGE_DISCLOSURE =
  'This is a Phase-0 seed dataset, not a complete dictionary.';
