/**
 * Progressive disclosure — the anti-overload contract, as a component.
 *
 * The frozen spec §5 makes this the shape of a kanji page: five zones earn
 * pixels, "everything else is one 'unfold' tap away, present but silent". The
 * failure it is written against is renzo's, diagnosed in §10.1 — a database
 * rendered as table views, with no hierarchy between headword and index number.
 *
 * Three decisions follow, and they are what make this different from a generic
 * accordion:
 *
 *   - **The summary says what is inside, and how much.** "Compounds" is a
 *     drawer; "Compounds · 14, ranked by your own corpus first" is an informed
 *     decision about whether to open it. `count` and `note` are first-class.
 *   - **Closed is silent, not absent.** The content is unmounted when closed —
 *     an accordion that renders everything and clips it is a page that is
 *     secretly as heavy as the one this replaces — but the *header* always
 *     states what is there, so nothing is hidden, only folded.
 *   - **A section with nothing in it says so and does not open.** `empty` turns
 *     the control into a plain line of text. The alternative is the dead list
 *     inbox from §10.1: a chevron that opens onto nothing.
 *
 * Accessibility: the header is a `button` carrying `aria-expanded`, so a screen
 * reader announces the state and the control, and the whole row is one target
 * of at least 44 pt.
 *
 * `aria-expanded` and not `accessibilityState={{ expanded }}`, which is what
 * this component shipped with and which react-native-web drops on the floor —
 * the same silent drop that left every chip in the app with no on/off state
 * (see `primitives.tsx`). Here the fix costs nothing anywhere: `aria-expanded`
 * is forwarded on the web *and* is one of the five `aria-*` names React Native
 * maps onto native accessibility state, so it is strictly more portable than
 * what it replaces rather than a web-only concession.
 */

import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { disclosureHeaderStyle } from './interactive-styles.ts';
import { Settle } from './motion.tsx';
import { RADIUS, SPACE, TYPE } from './theme.ts';
import { useTheme } from './theme-context.tsx';

export interface DisclosureProps {
  readonly title: string;
  /** How many things are inside. Rendered beside the title, not inside it. */
  readonly count?: number | undefined;
  /** One line of orientation, or the honest reason the section is thin. */
  readonly note?: string | undefined;
  /** Open on first render. Use for the zones the spec says earn pixels. */
  readonly initiallyOpen?: boolean | undefined;
  /**
   * Nothing to show. Renders as a quiet statement rather than as a control that
   * opens onto an empty box.
   */
  readonly empty?: string | undefined;
  readonly children?: ReactNode;
  readonly testID?: string | undefined;
}

export function Disclosure({
  title,
  count,
  note,
  initiallyOpen = false,
  empty,
  children,
  testID,
}: DisclosureProps): ReactNode {
  const theme = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const [focused, setFocused] = useState(false);

  const summary = count === undefined ? title : `${title} · ${count}`;

  if (empty !== undefined) {
    return (
      <View style={styles.section} testID={testID}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        >
          {title}
        </Text>
        <Text style={[styles.note, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          {empty}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section} testID={testID}>
      <Pressable
        accessibilityHint={note}
        accessibilityLabel={summary}
        accessibilityRole="button"
        aria-expanded={open}
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        onPress={() => setOpen((was) => !was)}
        style={({ pressed }) => [
          styles.header,
          {
            borderColor: focused ? theme.color.focusRing : 'transparent',
            borderRadius: RADIUS.sm,
            borderWidth: focused ? 2 : 0,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
        testID={testID === undefined ? undefined : `${testID}-toggle`}
      >
        <Text style={[styles.title, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          {summary}
        </Text>
        {/*
          A glyph, hidden from the tree: `aria-expanded` on the button is what a
          screen reader reads, and a spoken "▾" is noise.
        */}
        <Text
          aria-hidden
          style={[styles.chevron, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        >
          {open ? '▾' : '▸'}
        </Text>
      </Pressable>

      {note === undefined ? null : (
        <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {note}
        </Text>
      )}

      {open ? <Settle style={styles.body}>{children}</Settle> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: SPACE.xs,
    marginTop: SPACE.lg,
  },
  header: disclosureHeaderStyle,
  title: {
    flexShrink: 1,
    fontSize: TYPE.title,
    fontWeight: '600',
  },
  chevron: {
    fontSize: TYPE.label,
  },
  note: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  body: {
    gap: SPACE.md,
    paddingTop: SPACE.sm,
  },
});
