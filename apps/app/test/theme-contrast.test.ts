/**
 * WCAG AA over the whole palette, in all five nihonga themes (REQ-UI-09,
 * controller §10; Drift fusion, BUNKI_DRIFT_FUSION_SPEC_2026-08-06.md).
 *
 * "AA contrast" is a claim about every pair the app actually renders in every
 * theme the learner can choose, so the pair list lives in `theme.ts` beside
 * the colours and this test walks it × 5. A new colour combination on a
 * screen that is not registered there is a combination nothing checked — the
 * guard for that gap is the `CONTRAST_PAIRS` completeness assertion at the
 * bottom.
 */

import { describe, expect, it } from 'vitest';

import {
  AA_NON_TEXT,
  AA_NORMAL_TEXT,
  contrastRatio,
  parseHexColor,
  relativeLuminance,
  ColorParseError,
} from '../src/ui/contrast.ts';
import {
  CONTRAST_PAIRS,
  DEFAULT_THEME_FOR_SCHEME,
  NIHONGA_THEMES,
  PALETTES,
  THEME_NAMES,
  type Palette,
} from '../src/ui/theme.ts';

const MINIMUMS = {
  text: AA_NORMAL_TEXT,
  largeText: 3,
  nonText: AA_NON_TEXT,
} as const;

describe('contrast arithmetic', () => {
  it('reproduces the WCAG reference extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('is symmetric in its arguments', () => {
    expect(contrastRatio('#A6301A', '#FBF8F3')).toBeCloseTo(
      contrastRatio('#FBF8F3', '#A6301A'),
      10,
    );
  });

  it('expands #rgb shorthand', () => {
    expect(parseHexColor('#abc')).toEqual(parseHexColor('#aabbcc'));
  });

  it('rejects anything that is not a hex colour rather than guessing', () => {
    expect(() => relativeLuminance('rgb(0,0,0)')).toThrow(ColorParseError);
    expect(() => relativeLuminance('#12345')).toThrow(ColorParseError);
  });
});

describe.each(THEME_NAMES)('%s theme meets WCAG AA', (name) => {
  const palette: Palette = PALETTES[name];

  it.each(CONTRAST_PAIRS)('$name', ({ foreground, background, minimum }) => {
    const ratio = contrastRatio(palette[foreground], palette[background]);
    expect(ratio).toBeGreaterThanOrEqual(MINIMUMS[minimum]);
  });
});

describe('palette discipline (Drift fusion: fixed pigment set, no rainbow)', () => {
  it.each(THEME_NAMES)('%s spends the accent once', (name) => {
    const palette = PALETTES[name];
    // vermilion, frontierMark and focusRing are deliberately the same value:
    // the personal-frontier mark and the focus ring reuse the theme's accent
    // rather than introducing another colour. This survives the fusion
    // unchanged — pigments are for glyphs and graphics, the accent is for
    // meaning, and there is still exactly one of it.
    expect(palette.frontierMark).toBe(palette.vermilion);
    expect(palette.focusRing).toBe(palette.vermilion);
  });

  it.each(THEME_NAMES)('%s keeps paper a ground, not a brand colour', (name) => {
    const palette = PALETTES[name];
    // Nihonga ink carries real hue by design (藍墨, burnt umber, pine dark —
    // design doc §1), so ink is no longer held to a neutral spread. Paper
    // still is: a saturated ground would fight every pigment laid on it. The
    // widest ground is 岩絵具's warm washi at 27.
    for (const token of ['paper', 'raised'] as const) {
      const { r, g, b } = parseHexColor(palette[token]);
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      expect(spread).toBeLessThanOrEqual(28);
    }
    // What keeps ink functionally *ink* is now contrast, not greyness: it
    // must sit far above the AA floor, the way sumi sits on washi.
    expect(contrastRatio(palette.ink, palette.paper)).toBeGreaterThanOrEqual(9);
  });

  it('maps each OS scheme default to a theme of that scheme', () => {
    expect(NIHONGA_THEMES[DEFAULT_THEME_FOR_SCHEME.light].scheme).toBe('light');
    expect(NIHONGA_THEMES[DEFAULT_THEME_FOR_SCHEME.dark].scheme).toBe('dark');
  });

  it('registers every declared pair against a real palette key', () => {
    const keys = new Set(Object.keys(PALETTES.hokusai));
    for (const pair of CONTRAST_PAIRS) {
      expect(keys.has(pair.foreground)).toBe(true);
      expect(keys.has(pair.background)).toBe(true);
    }
    // A palette that grew a token nobody checks is the failure mode this guards.
    expect(CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(keys.size - 1);
  });
});
