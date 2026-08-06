/**
 * Design tokens (WP-05, REQ-UI-08; superseded in part by the Drift design
 * language, BUNKI_DESIGN_LANGUAGE_SESSION2_2026-08-05.md §1–§2, fused per
 * BUNKI_DRIFT_FUSION_SPEC_2026-08-06.md).
 *
 * The palette system is the five Drift nihonga themes, one-to-one with the
 * prototype's THEMES array (prototypes/drift/drift-artifact.html:146):
 * 北斎, 墨, 岩絵具, 緑青, 夜. The old REQ-UI-08 "one accent" rule is
 * superseded by the design doc, but its *discipline* survives in stronger
 * form: every token is enumerated here, every rendered pair is asserted
 * against WCAG AA in `test/theme-contrast.test.ts` for **all five themes**,
 * and no screen may use a colour outside the token set. A theme's pigments
 * are a fixed mineral set (岩絵具), not a per-datum rainbow — there is still
 * no per-JLPT-level colour scale and no severity palette.
 *
 * Prototype values are display pigments on a canvas; the app renders text
 * and controls, so each token is *derived* from the prototype value by
 * moving it along its own hue (mixing toward black or white only) until it
 * clears the WCAG floor for its role — AA 4.5:1 for text tokens, 3:1 for
 * display/graphic tokens — never by swapping hue. The derivation is
 * mechanical; the values below are its output and the contrast test is its
 * proof.
 *
 * `frontierMark` and `focusRing` still reuse the accent exactly (that
 * discipline test survives unchanged): one frontier, one ring.
 */

export const COLOR_SCHEMES = ['light', 'dark'] as const;
export type ColorSchemeName = (typeof COLOR_SCHEMES)[number];

/** The five nihonga themes, in seal-cycle order. */
export const THEME_NAMES = ['hokusai', 'sumi', 'iwaenogu', 'rokusho', 'yoru'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

/** What the OS scheme defaults to when the learner has not chosen a theme. */
export const DEFAULT_THEME_FOR_SCHEME: Readonly<Record<ColorSchemeName, ThemeName>> = {
  light: 'hokusai',
  dark: 'yoru',
};

export interface Palette {
  /** Page background. Washi ground, not white — each theme's own paper. */
  readonly paper: string;
  /** Raised surfaces: cards, result rows, the reading surface. */
  readonly raised: string;
  /** Primary text. The theme's ink — nihonga ink carries hue by design. */
  readonly ink: string;
  /** Secondary text: labels, provenance, metadata. Still AA on paper. */
  readonly inkMuted: string;
  /** Decorative hairline only. Never the boundary of an interactive control. */
  readonly rule: string;
  /** Boundary of interactive controls and meaningful graphics (AA non-text, 3:1). */
  readonly ruleStrong: string;
  /** The text-grade accent, derived from the theme's accent pigment (AA 4.5). */
  readonly vermilion: string;
  /** A tint of the same accent, for accent-on-tint fills. */
  readonly vermilionSoft: string;
  /** The quiet personal-frontier mark. The accent again, never a new hue. */
  readonly frontierMark: string;
  /** Keyboard focus ring. The accent again — one accent means one ring. */
  readonly focusRing: string;
  /** First mineral pigment: kanji hero glyphs, primary graphics (≥3:1). */
  readonly pig1: string;
  /** Second mineral pigment: stroke numbering, component chips (≥3:1). */
  readonly pig2: string;
  /** 金泥 kindei — reserved for collocation/ghost marks (≥3:1). */
  readonly gold: string;
}

export interface NihongaTheme {
  readonly name: ThemeName;
  /** The theme's Japanese name, shown in the seal's accessibility label. */
  readonly label: string;
  /** The single character stamped on the theme seal. */
  readonly seal: string;
  /** Which OS scheme this theme belongs to. */
  readonly scheme: ColorSchemeName;
  readonly palette: Palette;
}

/* Derived 2026-08-06 from prototypes/drift/drift-artifact.html:146 THEMES.
 * Where a value differs from the prototype's, the original is noted — the
 * move is always along the same hue, only as far as the floor demands. */

const HOKUSAI: Palette = {
  paper: '#FBFAF5',
  raised: '#FDFCFA',
  ink: '#1B2A3A', // 藍墨 — Drift 北斎 ink, passes as-is
  inkMuted: '#6C747C',
  rule: '#CED0D0',
  ruleStrong: '#8C9196',
  vermilion: '#B94D01', // from 朱 #EB6101, deepened to AA text
  vermilionSoft: '#FDF0E7', // 朱 wash toward white — lighter than paper so the accent keeps AA on it
  frontierMark: '#B94D01',
  focusRing: '#B94D01',
  pig1: '#1E50A2', // 藍 lapis — passes as-is
  pig2: '#165E83', // 紺青 — passes as-is
  gold: '#A8842C', // 金泥, ground to 3:1
};

const SUMI: Palette = {
  paper: '#F7F6F1',
  raised: '#FBFAF7',
  ink: '#2B2A28',
  inkMuted: '#72716D',
  rule: '#CECDC9',
  ruleStrong: '#8F8E8B',
  vermilion: '#BE4F01', // from 朱 #EB6101
  vermilionSoft: '#FEF6F0',
  frontierMark: '#BE4F01',
  focusRing: '#BE4F01',
  pig1: '#595857', // 墨 five-shade grey
  pig2: '#7D7D7D',
  gold: '#A8842C',
};

const IWAENOGU: Palette = {
  paper: '#F3EAD8',
  raised: '#F8F3EA',
  ink: '#40291C', // burnt-umber ink
  inkMuted: '#776759',
  rule: '#CFC3B2',
  ruleStrong: '#928476',
  vermilion: '#3D7551', // from 緑青 #47885E, deepened to AA text
  vermilionSoft: '#E5EEE8',
  frontierMark: '#3D7551',
  focusRing: '#3D7551',
  pig1: '#AA7E3A', // from 黄土 #C39143, ground to 3:1
  pig2: '#8F2E14', // 弁柄 — passes as-is
  gold: '#A5812B',
};

const ROKUSHO: Palette = {
  paper: '#EDF2E6',
  raised: '#F5F8F1',
  ink: '#1F4433', // pine-dark ink
  inkMuted: '#5D7265',
  rule: '#C4CFC2',
  ruleStrong: '#7D8F82',
  vermilion: '#8D6700', // from 山吹 #F8B500, deepened to AA text (山吹茶)
  vermilionSoft: '#FEF5DB',
  frontierMark: '#8D6700',
  focusRing: '#8D6700',
  pig1: '#47885E', // 緑青 — passes as-is
  pig2: '#4C6CB3', // 群青 — passes as-is
  gold: '#A8842C',
};

const YORU: Palette = {
  paper: '#281A14', // iron-dark ground (紺紙 vocabulary on 夜 paper)
  raised: '#372A24',
  ink: '#FFFFFC', // 胡粉 gofun white
  inkMuted: '#ADA8A4',
  rule: '#534842',
  ruleStrong: '#89817C',
  vermilion: '#EE6876', // from 赤 #E2041B, lifted to AA text on dark ground
  vermilionSoft: '#581416',
  frontierMark: '#EE6876',
  focusRing: '#EE6876',
  pig1: '#5775B8', // from 群青 #4C6CB3, lifted to 3:1
  pig2: '#8FA3DC', // 淡群青 — passes as-is
  gold: '#E6C86E', // 金泥 straight from the prototype
};

export const NIHONGA_THEMES: Readonly<Record<ThemeName, NihongaTheme>> = {
  hokusai: { name: 'hokusai', label: '北斎', seal: '北', scheme: 'light', palette: HOKUSAI },
  sumi: { name: 'sumi', label: '墨', seal: '墨', scheme: 'light', palette: SUMI },
  iwaenogu: { name: 'iwaenogu', label: '岩絵具', seal: '岩', scheme: 'light', palette: IWAENOGU },
  rokusho: { name: 'rokusho', label: '緑青', seal: '緑', scheme: 'light', palette: ROKUSHO },
  yoru: { name: 'yoru', label: '夜', seal: '夜', scheme: 'dark', palette: YORU },
};

/** Every theme's palette, keyed by theme name — what the contrast test walks. */
export const PALETTES: Readonly<Record<ThemeName, Palette>> = {
  hokusai: HOKUSAI,
  sumi: SUMI,
  iwaenogu: IWAENOGU,
  rokusho: ROKUSHO,
  yoru: YORU,
};

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
 * keeps the distinction the requirement is actually about. Drift's own stack
 * (drift-artifact.html) and this one agree.
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
  readonly name: ThemeName;
  /** The theme's Japanese name (北斎, 墨, 岩絵具, 緑青, 夜). */
  readonly label: string;
  /** The character on the theme seal. */
  readonly seal: string;
  readonly scheme: ColorSchemeName;
  readonly color: Palette;
  readonly font: typeof FONT_STACKS;
  readonly space: typeof SPACE;
  readonly type: typeof TYPE;
  readonly radius: typeof RADIUS;
  readonly minTouchTarget: number;
}

export function createTheme(name: ThemeName): Theme {
  const def = NIHONGA_THEMES[name];
  return {
    name,
    label: def.label,
    seal: def.seal,
    scheme: def.scheme,
    color: def.palette,
    font: FONT_STACKS,
    space: SPACE,
    type: TYPE,
    radius: RADIUS,
    minTouchTarget: MIN_TOUCH_TARGET,
  };
}

/** The theme after `name` in seal-cycle order (the seal's tap action). */
export function nextThemeName(name: ThemeName): ThemeName {
  const i = THEME_NAMES.indexOf(name);
  return THEME_NAMES[(i + 1) % THEME_NAMES.length] as ThemeName;
}

/**
 * Foreground/background pairs the app actually renders, named so the contrast
 * test can walk them — in every theme. A pair that is not listed here is a
 * pair nothing checked; adding a new colour combination to a screen means
 * adding it here too.
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
  { name: 'pigment 1 on paper', foreground: 'pig1', background: 'paper', minimum: 'nonText' },
  { name: 'pigment 1 on card', foreground: 'pig1', background: 'raised', minimum: 'nonText' },
  { name: 'pigment 2 on paper', foreground: 'pig2', background: 'paper', minimum: 'nonText' },
  { name: 'pigment 2 on card', foreground: 'pig2', background: 'raised', minimum: 'nonText' },
  { name: 'kindei gold on paper', foreground: 'gold', background: 'paper', minimum: 'nonText' },
  { name: 'kindei gold on card', foreground: 'gold', background: 'raised', minimum: 'nonText' },
];
