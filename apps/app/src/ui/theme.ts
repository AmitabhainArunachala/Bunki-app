/**
 * Design tokens (WP-05, REQ-UI-08).
 *
 * The requirement is specific and this file is the whole implementation of it:
 * an ink-and-paper palette with **one** vermilion accent, generous ma, real
 * Japanese type on reading surfaces, and *no* rainbow highlighting. So there is
 * exactly one accent token. There is no per-JLPT-level colour, no "known/
 * unknown" colour scale, no severity palette — a second hue would be the
 * rainbow the requirement forbids, and the only way to keep that promise is for
 * the second hue not to exist.
 *
 * The single reserved mark is `frontierMark`: the quiet indication that a word
 * is on the learner's personal frontier (REQ-UI-08's "personal frontier, never
 * global-JLPT"). It is a tint of the same vermilion, not a new colour.
 *
 * Every foreground/background pair used by the app is asserted against WCAG AA
 * in `test/theme-contrast.test.ts` for *both* schemes. `rule` is deliberately
 * excluded from that assertion and deliberately restricted to decorative
 * hairlines; anything that bounds an interactive control uses `ruleStrong`,
 * which does meet 3:1.
 */

export const COLOR_SCHEMES = ['light', 'dark'] as const;
export type ColorSchemeName = (typeof COLOR_SCHEMES)[number];

export interface Palette {
  /** Page background. Paper, not white. */
  readonly paper: string;
  /** Raised surfaces: cards, result rows, the reading surface. */
  readonly raised: string;
  /** Primary text. Sumi ink, not black. */
  readonly ink: string;
  /** Secondary text: labels, provenance, metadata. Still AA on paper. */
  readonly inkMuted: string;
  /** Decorative hairline only. Never the boundary of an interactive control. */
  readonly rule: string;
  /** Boundary of interactive controls and meaningful graphics (AA non-text, 3:1). */
  readonly ruleStrong: string;
  /** The one accent (REQ-UI-08). Adding a second colour token is a spec violation. */
  readonly vermilion: string;
  /** A tint of the same accent, for accent-on-tint fills. */
  readonly vermilionSoft: string;
  /** The quiet personal-frontier mark. A vermilion tint, never a new hue. */
  readonly frontierMark: string;
  /** Keyboard focus ring. The accent again — one accent means one ring. */
  readonly focusRing: string;
}

const LIGHT: Palette = {
  paper: '#FBF8F3',
  raised: '#FFFDF8',
  ink: '#1B1917',
  inkMuted: '#57514A',
  rule: '#D8D0C2',
  ruleStrong: '#8C8375',
  vermilion: '#A6301A',
  vermilionSoft: '#F3E2DC',
  frontierMark: '#A6301A',
  focusRing: '#A6301A',
};

const DARK: Palette = {
  paper: '#15130F',
  raised: '#1E1B16',
  ink: '#F2EDE3',
  inkMuted: '#B3AA9B',
  rule: '#3A342B',
  ruleStrong: '#7C7364',
  vermilion: '#E8836A',
  vermilionSoft: '#33211C',
  frontierMark: '#E8836A',
  focusRing: '#E8836A',
};

export const PALETTES: Readonly<Record<ColorSchemeName, Palette>> = { light: LIGHT, dark: DARK };

/**
 * Font stacks.
 *
 * REQ-UI-08 asks for mincho-class type on reading surfaces and a clean sans for
 * UI chrome. Phase 0 ships no font binaries: bundling a CJK serif is tens of
 * megabytes and, more to the point, a font file is licensed content and the
 * repository's licence is still an open operator decision (controller §4). So
 * these are stacks over faces the host already has — Hiragino Mincho / Yu
 * Mincho / Songti on Apple platforms, Noto Serif CJK on Linux, MS Mincho on
 * Windows — with a generic `serif` last. Where none is installed the reading
 * surface falls back to the platform serif rather than to the UI sans, which
 * keeps the distinction the requirement is actually about.
 */
export const FONT_STACKS = {
  /** Reading surfaces: headwords, passages, example sentences. */
  mincho:
    '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif CJK JP", "Noto Serif JP", "Songti SC", "MS Mincho", serif',
  /** UI chrome: labels, buttons, metadata. */
  sans: '"Hiragino Sans", "Noto Sans CJK JP", "Noto Sans JP", "Yu Gothic", Meiryo, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

/**
 * Spacing scale, in points. "Generous ma" (間) is the requirement; the scale is
 * 4-based so the rhythm stays regular and the large steps are genuinely large.
 */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 32,
  xxl: 52,
} as const;

/**
 * Type scale, in points at default dynamic-type setting.
 *
 * Nothing here is expressed in a fixed pixel height, and no container that
 * holds text is given a fixed height, so a user's larger type setting grows the
 * layout instead of clipping it (REQ-UI-09 dynamic type).
 */
export const TYPE = {
  /** The character on a kanji page. A museum card, not a spreadsheet row. */
  kanjiHero: 96,
  /** The headword on a word page. */
  headword: 44,
  /** A headword in a search result row. */
  headwordRow: 28,
  title: 22,
  body: 17,
  label: 15,
  meta: 13,
  /** Furigana above a reading. */
  ruby: 11,
} as const;

/**
 * Minimum touch target, in points (REQ-UI-09; controller §10 "≥44 pt").
 *
 * Applied as `minHeight`/`minWidth` so a control can exceed it but never fall
 * under it, and asserted in `test/touch-targets.test.ts` against every
 * interactive style in the app.
 */
export const MIN_TOUCH_TARGET = 44;

export const RADIUS = { sm: 3, md: 6, lg: 10 } as const;

export interface Theme {
  readonly scheme: ColorSchemeName;
  readonly color: Palette;
  readonly font: typeof FONT_STACKS;
  readonly space: typeof SPACE;
  readonly type: typeof TYPE;
  readonly radius: typeof RADIUS;
  readonly minTouchTarget: number;
}

export function createTheme(scheme: ColorSchemeName): Theme {
  return {
    scheme,
    color: PALETTES[scheme],
    font: FONT_STACKS,
    space: SPACE,
    type: TYPE,
    radius: RADIUS,
    minTouchTarget: MIN_TOUCH_TARGET,
  };
}

/**
 * Foreground/background pairs the app actually renders, named so the contrast
 * test can walk them. A pair that is not listed here is a pair nothing checked;
 * adding a new colour combination to a screen means adding it here too.
 */
export const CONTRAST_PAIRS: readonly {
  readonly name: string;
  readonly foreground: keyof Palette;
  readonly background: keyof Palette;
  readonly minimum: 'text' | 'largeText' | 'nonText';
}[] = [
  { name: 'body text on paper', foreground: 'ink', background: 'paper', minimum: 'text' },
  { name: 'body text on card', foreground: 'ink', background: 'raised', minimum: 'text' },
  { name: 'metadata on paper', foreground: 'inkMuted', background: 'paper', minimum: 'text' },
  { name: 'metadata on card', foreground: 'inkMuted', background: 'raised', minimum: 'text' },
  { name: 'accent text on paper', foreground: 'vermilion', background: 'paper', minimum: 'text' },
  { name: 'accent text on card', foreground: 'vermilion', background: 'raised', minimum: 'text' },
  {
    name: 'accent text on accent tint',
    foreground: 'vermilion',
    background: 'vermilionSoft',
    minimum: 'text',
  },
  {
    name: 'body text on accent tint',
    foreground: 'ink',
    background: 'vermilionSoft',
    minimum: 'text',
  },
  {
    name: 'primary button label on accent fill',
    foreground: 'paper',
    background: 'vermilion',
    minimum: 'text',
  },
  {
    name: 'control border on paper',
    foreground: 'ruleStrong',
    background: 'paper',
    minimum: 'nonText',
  },
  {
    name: 'control border on card',
    foreground: 'ruleStrong',
    background: 'raised',
    minimum: 'nonText',
  },
  { name: 'focus ring on paper', foreground: 'focusRing', background: 'paper', minimum: 'nonText' },
  { name: 'focus ring on card', foreground: 'focusRing', background: 'raised', minimum: 'nonText' },
  {
    name: 'frontier mark on card',
    foreground: 'frontierMark',
    background: 'raised',
    minimum: 'nonText',
  },
  {
    name: 'stroke ink on reading surface',
    foreground: 'ink',
    background: 'raised',
    minimum: 'nonText',
  },
];
