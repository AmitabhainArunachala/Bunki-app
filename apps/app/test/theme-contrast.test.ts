/**
 * WCAG AA over the whole palette, in both schemes (REQ-UI-08/09, controller §10).
 *
 * "AA contrast in both light/dark" is a claim about every pair the app actually
 * renders, so the pair list lives beside the colours in `src/theme/color.ts` and
 * this test walks it. A new colour combination on a screen that is not
 * registered there is a combination nothing checked — the guard against that gap
 * is the completeness assertion at the bottom, which now runs the other way
 * round as well: every *leaf* in the palette must appear in some pair.
 *
 * ## What changed when the experience layer arrived, and why it is not a weakening
 *
 * Pairs used to name palette keys (`'ink'`). The recall ramp is one token with
 * five steps, so pairs now name token *paths* (`'recall.settled'`) and resolve
 * through `paletteValue`. Two ramp steps are deliberately absent from the pair
 * list, and their absence is checked rather than tolerated: `RECALL_BAND_MARKS`
 * declares which steps may be drawn as a bare mark, the two that may not are the
 * two that fall under 3:1, and the test below asserts that correspondence in
 * both directions. A step that was quietly demoted to `standalone: false` to
 * dodge a contrast failure would have to also stop being used as a bare mark,
 * which `test/theme-tokens.test.ts` is what checks.
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
  COLOR_SCHEMES,
  CONTRAST_PAIRS,
  PALETTES,
  RECALL_BANDS,
  RECALL_BAND_MARKS,
  paletteLeaves,
  paletteValue,
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

describe.each(COLOR_SCHEMES)('%s scheme meets WCAG AA', (scheme) => {
  const palette: Palette = PALETTES[scheme];

  it.each(CONTRAST_PAIRS)('$name', ({ foreground, background, minimum }) => {
    const ratio = contrastRatio(
      paletteValue(palette, foreground),
      paletteValue(palette, background),
    );
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
      for (const token of ['paper', 'raised', 'sunken', 'ink', 'inkMuted', 'inkFaint'] as const) {
        const { r, g, b } = parseHexColor(palette[token]);
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        // Warm paper and sumi ink carry a little colour; a saturated one would be
        // a second accent wearing a neutral's name.
        expect(spread).toBeLessThanOrEqual(24);
      }
    },
  );

  /**
   * The memory-state tokens must not be the accent, and must not be hues.
   *
   * This is the assertion behind "semantic tokens for strength, fragility and
   * uncertainty that are *not* the accent". If one of them drifted toward
   * vermilion, the design would be back to saying two different things with one
   * colour; if one of them acquired a hue of its own, the design would be back
   * to the rainbow REQ-UI-08 rejects by name.
   */
  it.each(COLOR_SCHEMES)('%s keeps the memory-state channel out of the hue channel', (scheme) => {
    const palette = PALETTES[scheme];
    const memoryTokens = [
      ...RECALL_BANDS.map((band) => palette.recall[band]),
      palette.fragileEdge,
      palette.uncertainEdge,
      palette.uncertainWash,
    ];
    for (const value of memoryTokens) {
      expect(value, 'a memory-state token must not be the accent').not.toBe(palette.vermilion);
      const { r, g, b } = parseHexColor(value);
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      expect(spread, `${value} carries a hue and should not`).toBeLessThanOrEqual(24);
    }
  });

  /**
   * The ramp has to be a ramp.
   *
   * "Brightness is recall strength" is only true if the steps are ordered, and
   * ordered *against the page* — which is the direction that flips between
   * schemes. On paper, more strength is darker; on a dark ground, more strength
   * is lighter. Both cases are the same statement about contrast, so contrast is
   * what is asserted, and the same assertion covers both schemes.
   */
  it.each(COLOR_SCHEMES)('%s ramps monotonically away from the page', (scheme) => {
    const palette = PALETTES[scheme];
    const ratios = RECALL_BANDS.map((band) => contrastRatio(palette.recall[band], palette.paper));
    for (let index = 1; index < ratios.length; index += 1) {
      expect(
        ratios[index],
        `${RECALL_BANDS[index]} is not more present than ${RECALL_BANDS[index - 1]}`,
      ).toBeGreaterThan(ratios[index - 1] ?? 0);
    }
  });

  /**
   * Standalone marks clear 3:1; the two that do not are exactly the two declared
   * as meter-only.
   *
   * Asserted in both directions, because either direction alone is dodgeable: a
   * one-way check would pass a palette that demoted a step to `standalone: false`
   * purely to escape the threshold, and would also pass one that kept a step
   * `standalone: true` while it was only ever used inside the meter.
   */
  it.each(COLOR_SCHEMES)('%s draws bare recall marks only above 3:1', (scheme) => {
    const palette = PALETTES[scheme];
    for (const band of RECALL_BANDS) {
      const onPaper = contrastRatio(palette.recall[band], palette.paper);
      const onCard = contrastRatio(palette.recall[band], palette.raised);
      const clears = Math.min(onPaper, onCard) >= AA_NON_TEXT;
      expect(
        clears,
        `${band} clears 3:1 (${clears}) but is declared standalone=${String(
          RECALL_BAND_MARKS[band].standalone,
        )}`,
      ).toBe(RECALL_BAND_MARKS[band].standalone);
    }
  });

  it('registers every declared pair against a real palette token', () => {
    for (const pair of CONTRAST_PAIRS) {
      expect(() => paletteValue(PALETTES.light, pair.foreground)).not.toThrow();
      expect(() => paletteValue(PALETTES.light, pair.background)).not.toThrow();
    }
  });

  /**
   * A palette that grew a token nobody checks is the failure mode this guards,
   * and it is stated as coverage of the leaves rather than as a count. A count
   * can be satisfied by adding a pair; only coverage can be satisfied by
   * checking the token that was added.
   */
  it('checks every colour in the palette somewhere', () => {
    const covered = new Set(CONTRAST_PAIRS.flatMap((pair) => [pair.foreground, pair.background]));
    // `rule` is decorative by contract (see `color.ts`) and the two meter-only
    // ramp steps are covered by the standalone assertion above instead.
    const exempt = new Set(['rule', 'recall.unseen', 'recall.faint']);
    const unchecked = paletteLeaves(PALETTES.light)
      .map((leaf) => leaf.path)
      .filter((path) => !covered.has(path) && !exempt.has(path));
    expect(unchecked, 'add a CONTRAST_PAIRS entry for each of these').toEqual([]);
  });
});
