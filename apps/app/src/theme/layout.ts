/**
 * Space, radii, elevation and touch targets.
 *
 * ## Ma (間) is a token, not an adjective
 *
 * "Generous ma" is in the requirement (REQ-UI-08) and generous is not a number,
 * so the scale is what makes it checkable. It is 4-based, and the top three
 * steps are deliberately far apart: `xl` (32) separates blocks, `xxl` (52)
 * separates *sections of an argument*, and `hero` (84) is the silence around the
 * one thing a page is about. A design that uses only xs–lg has no ma; it has
 * padding.
 *
 * ## Elevation is ink, not shadow
 *
 * There is no drop shadow anywhere in this system. A sumi-e surface does not
 * float; it sits on the paper, and its edge is a rule. So "elevation" here is a
 * pair of surface-and-border tokens plus, at the top level, a hairline offset
 * that reads as a page under a page. On the web a `boxShadow` would have been
 * one line; a shadow is also the single fastest way to make a calm typographic
 * layout look like a dashboard, which is the thing the operator said this must
 * not be.
 */

/**
 * Spacing scale, in points.
 *
 * `SPACE.md` (12) is the default gap inside a component; `SPACE.lg` (20) is the
 * default padding of a card. Nothing outside this file should invent a number.
 */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 32,
  xxl: 52,
  /** The silence around the subject of a page. */
  hero: 84,
} as const;

export type SpaceName = keyof typeof SPACE;

/**
 * Corner radii, in points.
 *
 * Small on purpose. A 16 pt radius is a consumer app; paper has corners.
 * `pill` exists only for chips, where the shape *is* the affordance.
 */
export const RADIUS = { none: 0, sm: 3, md: 6, lg: 10, pill: 999 } as const;

export type RadiusName = keyof typeof RADIUS;

/**
 * The four surface levels a screen can use, as token *names* rather than
 * values, so a component asks for a level and the theme supplies the pair.
 *
 * - `page` — the paper itself. No border.
 * - `card` — a raised surface with a hairline. The museum card.
 * - `well` — a surface set into the page: a quoted passage, a specimen box.
 * - `overlay` — the one level that may sit above content. Border is
 *   `ruleStrong`, because an overlay's edge is load-bearing for a keyboard user.
 */
export const ELEVATION = {
  page: { surface: 'paper', border: 'none', borderWidth: 0 },
  card: { surface: 'raised', border: 'rule', borderWidth: 1 },
  well: { surface: 'sunken', border: 'rule', borderWidth: 1 },
  overlay: { surface: 'raised', border: 'ruleStrong', borderWidth: 1 },
} as const;

export type ElevationName = keyof typeof ELEVATION;

/**
 * Minimum touch target, in points (REQ-UI-09; controller §10 "≥44 pt").
 *
 * Applied as `minHeight`/`minWidth` so a control can exceed it but never fall
 * under it, and asserted in `test/touch-targets.test.ts` against every
 * interactive style in the app.
 */
export const MIN_TOUCH_TARGET = 44;

/**
 * Hairline thickness in points for rules drawn as views rather than borders.
 *
 * `StyleSheet.hairlineWidth` is the right value on a device and is not available
 * to a pure-data module, so this is the fallback the token layer can state;
 * components that can reach the platform prefer the platform's own.
 */
export const HAIRLINE = 1;
