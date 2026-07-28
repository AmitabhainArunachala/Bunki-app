/**
 * Interactive primitives (WP-05, REQ-UI-09 accessibility).
 *
 * Three accessibility requirements are structural here rather than reviewed:
 *
 *   1. **Labels on all interactive elements.** `accessibilityLabel` is a
 *      required prop on every control in this file, so an unlabeled control is
 *      a type error. Visible text is often enough for a sighted user, but a
 *      control whose visible text is a bare character (`分`) or a glyph needs a
 *      spoken label that says what activating it does.
 *   2. **≥44 pt touch targets.** Sizes come from `interactive-styles.ts`, which
 *      `test/touch-targets.test.ts` asserts against `MIN_TOUCH_TARGET`. Callers
 *      style the *container*, never the control, so a layout cannot shrink one.
 *   3. **A control's state travels on a prop the target actually forwards.**
 *      `accessibilityState` is not one of them on the web export — see the note
 *      on {@link ChipButton}, which is where that cost was paid — so nothing
 *      under `src/` uses it, and `test/design-vocabulary.test.ts` keeps it that
 *      way. `disabled` is passed to `Pressable` as `disabled`, which
 *      react-native-web turns into `aria-disabled` itself.
 *
 * The focus ring is drawn by the component rather than left to the browser
 * outline: react-native-web suppresses the default outline on pressables, and a
 * keyboard user on the web export is exactly who needs it.
 */

import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { buttonStyle, chipStyle, rowStyle } from './interactive-styles.ts';
import { SPACE, TYPE } from './theme.ts';
import { useTheme } from './theme-context.tsx';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface AppButtonProps {
  readonly label: string;
  /** Spoken label. Defaults to `label`; set it when `label` is not a sentence. */
  readonly accessibilityLabel?: string | undefined;
  /** Spoken hint — what activation does, when that is not obvious from the label. */
  readonly accessibilityHint?: string | undefined;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant | undefined;
  readonly disabled?: boolean | undefined;
  readonly testID?: string | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

export function AppButton({
  label,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  variant = 'secondary',
  disabled = false,
  testID,
  style,
}: AppButtonProps): ReactNode {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const background =
    variant === 'primary'
      ? theme.color.vermilion
      : variant === 'secondary'
        ? theme.color.raised
        : 'transparent';
  const foreground = variant === 'primary' ? theme.color.paper : theme.color.ink;
  const border =
    variant === 'quiet'
      ? 'transparent'
      : variant === 'primary'
        ? theme.color.vermilion
        : theme.color.ruleStrong;

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      // No `accessibilityState={{ disabled }}`: react-native-web never reads
      // that prop (see `ChipButton`), and it does not need to — `Pressable`
      // turns its own `disabled` into `aria-disabled` and `tabIndex={-1}`.
      disabled={disabled}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: focused ? theme.color.focusRing : border,
          borderWidth: focused ? 2 : 1,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
      testID={testID}
    >
      <Text style={[styles.buttonLabel, { color: foreground, fontFamily: theme.font.sans }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface ChipButtonProps {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string | undefined;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID?: string | undefined;
}

/**
 * A single-tap chip — the uncertainty gesture of REQ-UI-01 is one tap, never a
 * modal or a multi-step form.
 *
 * On/off is carried by `aria-pressed` *and* by a check mark, not by the fill
 * alone: a fill alone is information conveyed by colour only.
 *
 * ## Why `aria-pressed`, and not the prop that was here before
 *
 * This chip used to say `accessibilityState={{ selected }}`, and on the shipped
 * web target that reached nothing at all. react-native-web 0.21 has no reader
 * for `accessibilityState`: `modules/forwardedProps` enumerates the flat
 * `aria-*` and `accessibility*` names, `pick()` drops everything else before
 * `createDOMProps` runs, and the only lookalike anywhere in the library is
 * `AccessibilityUtil/isDisabled`, which reads `accessibilityStates` — plural,
 * an array, and only for `disabled`. So every chip in the app shipped as a bare
 * `<button aria-label="…" role="button">`, byte-identical whether it was on or
 * off. What was left encoding the state was fill colour, border colour and
 * border width: WCAG 2.1 SC 1.4.1 (Use of Color) and SC 4.1.2 (Name, Role,
 * Value), and this docblock previously asserted the opposite. axe stayed green
 * throughout, because axe never requires a button to expose selection.
 *
 * `aria-pressed` is the replacement because it is forwarded (`forwardedProps`,
 * then `createDOMProps`), and because it is *permitted on a button*:
 * `aria-selected` is not, and would have traded a silent defect for an
 * `aria-allowed-attr` violation. On/off is also what these chips mean —
 * furigana, an uncertainty dimension, a correction reason, a capability lens.
 *
 * What `aria-pressed` is not is portable. React Native maps
 * `aria-busy/checked/disabled/expanded/selected` onto native accessibility
 * state and has no `aria-pressed`, so on iOS/Android the check mark is the only
 * channel. Nothing in this repository builds, exports or drives a native
 * target, so that is recorded here rather than claimed in either direction.
 *
 * The claim is verified where it can be: `e2e/adv-a11y-audit.spec.ts` reads the
 * chips' state back out of Chrome's own accessibility tree over CDP. A source
 * scan cannot verify it — the whole defect was a prop that was present in the
 * source and absent from the runtime.
 */
export function ChipButton({
  label,
  accessibilityLabel,
  accessibilityHint,
  selected,
  onPress,
  testID,
}: ChipButtonProps): ReactNode {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      aria-pressed={selected}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.color.vermilionSoft : theme.color.raised,
          borderColor: focused
            ? theme.color.focusRing
            : selected
              ? theme.color.vermilion
              : theme.color.ruleStrong,
          borderWidth: focused || selected ? 2 : 1,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.chipLabel,
          {
            color: selected ? theme.color.vermilion : theme.color.ink,
            fontFamily: theme.font.sans,
          },
        ]}
      >
        {selected ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

export interface RowButtonProps {
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string | undefined;
  readonly onPress: () => void;
  readonly children: ReactNode;
  readonly testID?: string | undefined;
}

/** A full-width tappable row: a search result, a constituent kanji, a related word. */
export function RowButton({
  accessibilityLabel,
  accessibilityHint,
  onPress,
  children,
  testID,
}: RowButtonProps): ReactNode {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="link"
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.color.raised,
          borderColor: focused ? theme.color.focusRing : theme.color.ruleStrong,
          borderWidth: focused ? 2 : 1,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

export interface SectionProps {
  readonly title: string;
  /** Muted line under the title: the layer's honest scope, or why it is thin. */
  readonly note?: string | undefined;
  readonly children: ReactNode;
  readonly testID?: string | undefined;
}

/** A titled block. `accessibilityRole="header"` makes the page navigable by heading. */
export function Section({ title, note, children, testID }: SectionProps): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.section} testID={testID}>
      <Text
        accessibilityRole="header"
        style={[styles.sectionTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        {title}
      </Text>
      {note === undefined ? null : (
        <Text
          style={[styles.sectionNote, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        >
          {note}
        </Text>
      )}
      {children}
    </View>
  );
}

/** A hairline. Decorative only, which is why `rule` need not meet 3:1. */
export function Hairline(): ReactNode {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.hairline, { backgroundColor: theme.color.rule }]}
    />
  );
}

const styles = StyleSheet.create({
  button: buttonStyle,
  chip: chipStyle,
  row: rowStyle,
  buttonLabel: {
    fontSize: TYPE.label,
    fontWeight: '600',
    textAlign: 'center',
  },
  chipLabel: {
    fontSize: TYPE.label,
    textAlign: 'center',
  },
  section: {
    gap: SPACE.sm,
    marginTop: SPACE.xl,
  },
  sectionTitle: {
    fontSize: TYPE.title,
    fontWeight: '600',
  },
  sectionNote: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACE.lg,
    width: '100%',
  },
});
