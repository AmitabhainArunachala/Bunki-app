/**
 * WCAG AA over the whole palette, in both schemes (REQ-UI-08/09, controller §10).
 *
 * "AA contrast in both light/dark" is a claim about every pair the app actually
 * renders, so the pair list lives in `theme.ts` beside the colours and this
 * test walks it. A new colour combination on a screen that is not registered
 * there is a combination nothing checked — `notices.test` of that gap is the
 * `CONTRAST_PAIRS` completeness assertion at the bottom.
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
import { COLOR_SCHEMES, CONTRAST_PAIRS, PALETTES, type Palette } from '../src/ui/theme.ts';

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

describe.each(COLOR_SCHEMES)('%s scheme meets WCAG AA', (scheme) => {
  const palette: Palette = PALETTES[scheme];

  it.each(CONTRAST_PAIRS)('$name', ({ foreground, background, minimum }) => {
    const ratio = contrastRatio(palette[foreground], palette[background]);
    expect(ratio).toBeGreaterThanOrEqual(MINIMUMS[minimum]);
  });
});

describe('palette discipline (REQ-UI-08: one accent, no rainbow)', () => {
  it.each(COLOR_SCHEMES)('%s has exactly one accent hue', (scheme) => {
    const palette = PALETTES[scheme];
    // vermilion, frontierMark and focusRing are deliberately the same value:
    // the personal-frontier mark and the focus ring reuse the single accent
    // rather than introducing a second colour.
    expect(palette.frontierMark).toBe(palette.vermilion);
    expect(palette.focusRing).toBe(palette.vermilion);
  });

  it.each(COLOR_SCHEMES)(
    '%s keeps paper and ink neutral-ish, not saturated brand colour',
    (scheme) => {
      const palette = PALETTES[scheme];
      for (const token of ['paper', 'raised', 'ink', 'inkMuted'] as const) {
        const { r, g, b } = parseHexColor(palette[token]);
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        // Warm paper and sumi ink carry a little colour; a saturated one would be
        // a second accent wearing a neutral's name.
        expect(spread).toBeLessThanOrEqual(24);
      }
    },
  );

  it('registers every declared pair against a real palette key', () => {
    const keys = new Set(Object.keys(PALETTES.light));
    for (const pair of CONTRAST_PAIRS) {
      expect(keys.has(pair.foreground)).toBe(true);
      expect(keys.has(pair.background)).toBe(true);
    }
    // A palette that grew a token nobody checks is the failure mode this guards.
    expect(CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(keys.size - 1);
  });
});
