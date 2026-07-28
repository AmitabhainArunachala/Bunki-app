/**
 * Type tokens — the part of the design language that does most of the work
 * (REQ-UI-08: "typography-first").
 *
 * ## Two families, and the rule for choosing
 *
 * Mincho is for **reading**: headwords, passages, example sentences, the single
 * large character on a kanji page, anything a learner is meant to look *at*.
 * Sans is for **chrome**: labels, buttons, metadata, provenance, anything a
 * learner is meant to look *past*. The distinction is not decorative — it is how
 * a kanji page stops being a spreadsheet row. A spreadsheet renders the datum
 * and the field label in the same face at the same weight; a museum card sets
 * the object in the object's own type and the catalogue number in small sans
 * underneath.
 *
 * ## Self-hosted, then the platform, then the generic
 *
 * Each stack starts with the self-hosted subset in `fonts/` (real Shippori
 * Mincho, the face the frozen spec §8 names), continues through the faces a
 * given platform is likely to have — Hiragino on Apple, Noto on Linux, Yu/MS on
 * Windows — and ends at a generic. The order matters in a specific way: the
 * reading stack ends at `serif`, never at the UI sans, so on a host with no CJK
 * serif at all the reading surface still lands somewhere serif rather than
 * collapsing the two registers into one.
 *
 * ## Sizes are points, and nothing is a fixed height
 *
 * Every size is a point value at the default dynamic-type setting, and no
 * container that holds text is given a fixed height anywhere in the system, so a
 * larger type setting grows the layout instead of clipping it (REQ-UI-09).
 * Line heights are ratios rather than absolutes for the same reason.
 *
 * ## Japanese line height is not Latin line height
 *
 * Japanese sets tighter than Latin at the same size — the glyphs already fill
 * their em box, so the generous leading Latin needs makes a Japanese paragraph
 * look shredded. `LEADING.japanese` is therefore lower than `LEADING.latin`, and
 * a component that renders Japanese picks the former. That is the opposite of
 * what a Latin-trained default does, and it is the single most visible
 * difference between a Japanese page that was designed and one that was
 * translated.
 */

import { NOTO_SANS_JP_400 } from './fonts/noto-sans-jp-400.ts';
import { NOTO_SANS_JP_700 } from './fonts/noto-sans-jp-700.ts';
import { SHIPPORI_MINCHO_400 } from './fonts/shippori-mincho-400.ts';
import { type FontChunk } from './fonts/face-chunk.ts';

/** A self-hosted face, ready to be registered with the platform. */
export interface SelfHostedFace {
  readonly family: string;
  readonly weight: 400 | 700;
  readonly style: 'normal';
  readonly chunks: readonly FontChunk[];
}

export const SELF_HOSTED_FACES: readonly SelfHostedFace[] = [
  { family: 'Shippori Mincho', weight: 400, style: 'normal', chunks: SHIPPORI_MINCHO_400 },
  { family: 'Noto Sans JP', weight: 400, style: 'normal', chunks: NOTO_SANS_JP_400 },
  { family: 'Noto Sans JP', weight: 700, style: 'normal', chunks: NOTO_SANS_JP_700 },
];

export const FONT_STACKS = {
  /** Reading surfaces: headwords, passages, example sentences, the hero character. */
  mincho:
    '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif CJK JP", "Noto Serif JP", "Songti SC", "MS Mincho", serif',
  /** UI chrome: labels, buttons, metadata, provenance. */
  sans: '"Noto Sans JP", "Hiragino Sans", "Noto Sans CJK JP", "Yu Gothic", Meiryo, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  /**
   * Fixed width, for the places the app shows machine text: event ids, hashes,
   * codepoints. Deliberately not a third *design* face — nothing in the reading
   * or chrome register uses it.
   */
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
} as const;

/**
 * The type scale.
 *
 * Not a ratio series. The four display sizes are set by what they hold — a
 * single kanji, a headword, a headword in a list — and the four text sizes are a
 * conventional 13/15/17/22 ladder, which is the range a Japanese body face stays
 * legible in without becoming a caption. Numbers between the rungs are a smell:
 * a surface that needs 19 usually needs a different rung.
 */
export const TYPE = {
  /** The character on a kanji page. A museum card, not a spreadsheet row. */
  kanjiHero: 96,
  /** A large but not hero character: a component in a decomposition, a map focus. */
  kanjiLarge: 56,
  /** The headword on a word page. */
  headword: 44,
  /** A headword in a search result row or a card. */
  headwordRow: 28,
  /** Section titles and page titles. */
  title: 22,
  /** Running text, including Japanese passages. */
  body: 17,
  /** Control labels, chips, list metadata. */
  label: 15,
  /** Provenance, timestamps, attributions, the honest small print. */
  meta: 13,
  /** Furigana above a reading; also the floor for `ruby` scaling. */
  ruby: 11,
} as const;

export type TypeSizeName = keyof typeof TYPE;

/**
 * Line-height ratios.
 *
 * `display` is tight because a 96 pt character with 1.5 leading is a character
 * with a hole under it. `japanese` is the running-text value for Japanese;
 * `latin` is for Latin-dominant UI copy; `ruby` keeps the annotation line from
 * pushing the base line apart.
 */
export const LEADING = {
  display: 1.08,
  japanese: 1.75,
  latin: 1.55,
  tight: 1.3,
  ruby: 1.25,
} as const;

/**
 * Letter spacing, in points.
 *
 * Japanese takes none — the glyphs are already on a grid, and tracking kana is
 * how a Japanese page starts looking like a logo. Latin small caps and page
 * titles take a little.
 */
export const TRACKING = {
  japanese: 0,
  title: 0.3,
  label: 0.2,
  /** Small all-caps eyebrow labels, the one place tracking earns its keep. */
  eyebrow: 1.1,
} as const;

/**
 * Vertical writing (縦書き).
 *
 * REQ-UI-08 calls this optional, and it is unused by any shipped surface today,
 * so what is here is the token layer rather than a component nobody asked for:
 * the CSS values a vertical column needs, and the two rules that are easy to get
 * wrong. It exists now because retrofitting vertical support into a type system
 * that assumed horizontal is a rewrite, and because a specimen that cannot show
 * it cannot be reviewed for it.
 *
 * The two rules: a vertical run needs `textOrientation: 'upright'` for the Latin
 * inside it to stand rather than lie down, and it needs a *height* constraint
 * rather than a width one, because in vertical writing the inline axis is
 * vertical — a `maxWidth` measure does nothing and a `maxHeight` is the measure.
 */
export const VERTICAL = {
  writingMode: 'vertical-rl',
  textOrientation: 'upright',
  /** The reading measure for a vertical column, in points: how long a line may get. */
  measure: 520,
} as const;

/**
 * The reading measure for horizontal text, in points.
 *
 * Long Japanese lines are harder to track back than long Latin ones because
 * there are no word spaces to land on, so the measure is tighter than a Latin
 * page would take.
 */
export const MEASURE = 720;
