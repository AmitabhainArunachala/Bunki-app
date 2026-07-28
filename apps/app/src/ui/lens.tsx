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
 *   - **The active lens is stated in more than fill.** Selection carries
 *     `aria-pressed` on the chip, a check mark in it, and a line under the row
 *     — in a polite live region — saying what the lens means. Colour alone
 *     would fail WCAG 1.4.1 and, more to the point, would leave a learner
 *     guessing what "reading" filters to.
 *
 *     That first channel was `accessibilityState.selected` until the A1 repair,
 *     and on the web export it reached nothing: react-native-web drops the prop
 *     before it can become an attribute, so all five chips exposed an identical
 *     `<button aria-label="… lens" role="button">` and only the fill differed.
 *     `ChipButton`'s own docblock has the mechanism; the reason it is repeated
 *     here is that this file asserted the opposite for a release, and the blurb
 *     below — which does announce — made the row *sound* fixed when pressed
 *     while leaving a learner arriving on the page, or tabbing back through the
 *     row, with no way to tell which lens was on.
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
      {/*
        `toolbar`, not `tablist`.

        A lens row *looks* like tabs, and the first version said so. axe caught
        it on the specimen route: ARIA requires a `tablist` to contain elements
        with `role="tab"`, and `ChipButton` is a `button` — so the markup was
        `aria-required-children`, critical, in both schemes. Renaming the chips'
        role was not an option worth taking (they are buttons everywhere else in
        the app, and a `tab` that controls no `tabpanel` is a second lie), so the
        container takes the role that actually describes it: a toolbar, which is
        a grouping of controls and permits button children.

        react-native-web passes both names through verbatim — neither is in its
        role map — so this is a real ARIA role either way, and getting it wrong
        was a real defect rather than a dropped prop.
      */}
      <View accessibilityRole="toolbar" style={styles.row}>
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
