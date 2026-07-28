/**
 * Capability lenses — the control REQ-UI-07 asks for by name.
 *
 * "It must never collapse reading/meaning/listening/production/writing contracts
 * into one mastery light: capability lenses or distinct marks preserve strength,
 * fragility, uncertainty and coverage." A lens row is the first of those two
 * mechanisms: the learner chooses which capability the surface is currently
 * about, and the surface answers for that one.
 *
 * Two properties make it a lens rather than a filter chip row, and both are
 * structural here:
 *
 *   - **Exactly one is active.** A multi-select would be back to a blend, and a
 *     blend of five capabilities is a mastery light with extra steps. The
 *     component takes a single `active` value, not a set.
 *   - **The active lens is stated in words, not only in fill.** Selection carries
 *     `accessibilityState.selected`, a check mark, and a line under the row
 *     saying what the lens means. Colour alone would fail WCAG 1.4.1 and, more
 *     to the point, would leave a learner guessing what "reading" filters to.
 *
 * The chips are the one place the accent is spent on chrome, because choosing a
 * lens is the learner acting — the same category as the primary button and the
 * focus ring. It is still one hue.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CAPABILITIES, capabilityOf, type CapabilityId } from './capability.ts';
import { ChipButton } from './primitives.tsx';
import { SPACE, TYPE } from './theme.ts';
import { useTheme } from './theme-context.tsx';

export interface LensRowProps {
  readonly active: CapabilityId;
  readonly onChange: (capability: CapabilityId) => void;
  /**
   * Restrict the row. A surface with no handwriting evidence should not offer a
   * writing lens — an empty lens is a dead end, and the frozen spec's complaint
   * about "dead list inboxes" (§10.1) is the same failure one size down.
   */
  readonly available?: readonly CapabilityId[] | undefined;
  /** Show the active lens's blurb under the row. On by default. */
  readonly explain?: boolean | undefined;
  readonly testID?: string | undefined;
}

export function LensRow({
  active,
  onChange,
  available,
  explain = true,
  testID,
}: LensRowProps): ReactNode {
  const theme = useTheme();
  const shown = CAPABILITIES.filter(
    (capability) => available === undefined || available.includes(capability.id),
  );

  return (
    <View style={styles.wrapper} testID={testID}>
      <View accessibilityRole="tablist" style={styles.row}>
        {shown.map((capability) => (
          <ChipButton
            key={capability.id}
            accessibilityHint={capability.blurb}
            accessibilityLabel={`${capability.label} lens`}
            label={capability.label}
            onPress={() => onChange(capability.id)}
            selected={capability.id === active}
            testID={`lens-${capability.id}`}
          />
        ))}
      </View>

      {explain ? (
        <Text
          // A live region: changing the lens changes what the whole surface is
          // about, and a sighted user gets that from the layout redrawing.
          accessibilityLiveRegion="polite"
          style={[styles.blurb, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        >
          {capabilityOf(active).blurb}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: SPACE.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  blurb: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
