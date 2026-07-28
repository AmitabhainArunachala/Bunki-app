/**
 * Size and spacing for every interactive control (WP-05, REQ-UI-09).
 *
 * These live apart from `primitives.tsx` for one reason: that file imports
 * `react-native`, which the unit-test runner cannot resolve, and a ≥44 pt touch
 * target that nothing can assert is a claim rather than a property. Here the
 * numbers are plain data, so `test/touch-targets.test.ts` walks them directly
 * and `primitives.tsx` is the only consumer.
 *
 * Colour is deliberately absent — it depends on the theme and on interaction
 * state, and mixing it in would make these objects untestable again.
 */

import { MIN_TOUCH_TARGET, RADIUS, SPACE } from './theme.ts';

/** Merged into every control. `minWidth` as well as `minHeight`: a 44×20 target is not a 44 pt target. */
export const TOUCH_TARGET = {
  minHeight: MIN_TOUCH_TARGET,
  minWidth: MIN_TOUCH_TARGET,
} as const;

export const buttonStyle = {
  ...TOUCH_TARGET,
  alignItems: 'center',
  borderRadius: RADIUS.md,
  justifyContent: 'center',
  paddingHorizontal: SPACE.lg,
  paddingVertical: SPACE.md,
} as const;

export const chipStyle = {
  ...TOUCH_TARGET,
  alignItems: 'center',
  borderRadius: RADIUS.lg,
  justifyContent: 'center',
  paddingHorizontal: SPACE.md,
  paddingVertical: SPACE.sm,
} as const;

export const rowStyle = {
  ...TOUCH_TARGET,
  borderRadius: RADIUS.md,
  gap: SPACE.xs,
  justifyContent: 'center',
  paddingHorizontal: SPACE.lg,
  paddingVertical: SPACE.md,
} as const;

export const searchFieldStyle = {
  ...TOUCH_TARGET,
  borderRadius: RADIUS.md,
  borderWidth: 1,
  flexGrow: 1,
  flexShrink: 1,
  paddingHorizontal: SPACE.md,
  paddingVertical: SPACE.md,
} as const;

/**
 * A link in the navigation shell (WP-10).
 *
 * Padded to the 44 pt minimum like everything else rather than being allowed to
 * shrink because it is chrome: the shell is on every screen, so a nav link is
 * the most-tapped control in the app and the last place to spend a touch target.
 */
export const navLinkStyle = {
  ...TOUCH_TARGET,
  alignItems: 'center',
  borderRadius: RADIUS.sm,
  justifyContent: 'center',
  paddingHorizontal: SPACE.md,
  paddingVertical: SPACE.sm,
} as const;

/**
 * The header of a progressive-disclosure section (Campaign E, lane A1).
 *
 * A full-width row, so `minWidth` is never the binding constraint — but it is
 * declared anyway, because the rule is "≥44 pt in both axes" and a style that
 * relies on its container to be wide is a style that shrinks when the container
 * does.
 */
export const disclosureHeaderStyle = {
  ...TOUCH_TARGET,
  alignItems: 'center',
  borderRadius: RADIUS.sm,
  flexDirection: 'row',
  gap: SPACE.sm,
  justifyContent: 'space-between',
  paddingVertical: SPACE.sm,
} as const;

/**
 * Every interactive style in the app, by the name of the control that uses it.
 * A control missing from this map is a control nothing size-checked.
 */
export const INTERACTIVE_STYLES = {
  AppButton: buttonStyle,
  ChipButton: chipStyle,
  DisclosureHeader: disclosureHeaderStyle,
  NavLink: navLinkStyle,
  RowButton: rowStyle,
  SearchField: searchFieldStyle,
} as const;

export type InteractiveStyleName = keyof typeof INTERACTIVE_STYLES;
