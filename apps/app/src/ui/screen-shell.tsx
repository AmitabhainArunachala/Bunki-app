/**
 * The frame every screen sits in (WP-05).
 *
 * Holds the three things that must be identical on all of them: the paper
 * background, the reading measure (a column that stops widening — long Japanese
 * lines are hard to track across a wide window), and the offline banner, which
 * belongs to the shell precisely so no screen can forget it (REQ-UI-09).
 *
 * The banner renders only for a *known* offline status. `unknown` — every
 * non-web runtime until WP-11 adds a real observer — renders nothing, because a
 * connectivity banner is a claim about connectivity.
 */

import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useConnectivity } from '../state/app-context.tsx';
import { OfflineBanner } from './screen-state.tsx';
import { SPACE, TYPE } from './theme.ts';
import { useTheme } from './theme-context.tsx';

/** Maximum reading measure, in points. */
const MEASURE = 720;

export interface ScreenShellProps {
  readonly title: string;
  /**
   * The title in Japanese, set in mincho above the English.
   *
   * Typography-first (frozen §8) is the whole design language, and it applies to
   * the page's own name: 地図 above "Map" is the app teaching a word by using
   * it, at no cost to legibility because the English is still there. Optional
   * because a page about a particular word already has a Japanese hero — its own
   * headword — and two competing heroes is worse than one.
   */
  readonly titleJa?: string | undefined;
  readonly subtitle?: string | undefined;
  /** Rendered right under the title, before the content. */
  readonly lede?: ReactNode;
  readonly children: ReactNode;
  /**
   * Standing notices — licence acknowledgements and the like — at the foot.
   *
   * A slot, rather than each screen deciding where to put one, because the
   * placement is the point. The EDRDG acknowledgement (§3) has to be *on* the
   * screen; it does not have to be the hero, and it shipped as a boxed vermilion
   * block above the content of eight screens, taller than the content on some of
   * them. Quiet and at the foot is where standing small print belongs, and
   * giving it a named slot means no screen can put it back at the top by
   * accident. It is never folded away — `attribution.tsx` has the rule: folding
   * a licence condition into a disclosure is not progressive disclosure.
   */
  readonly notice?: ReactNode;
  readonly testID?: string | undefined;
}

export function ScreenShell({
  title,
  titleJa,
  subtitle,
  lede,
  children,
  notice,
  testID,
}: ScreenShellProps): ReactNode {
  const theme = useTheme();
  const connectivity = useConnectivity();

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={[styles.scroll, { backgroundColor: theme.color.paper }]}
      testID={testID}
    >
      <View style={styles.measure}>
        {connectivity === 'offline' ? <OfflineBanner /> : null}

        <View style={styles.heading}>
          {titleJa === undefined ? null : (
            <Text
              style={[styles.titleJa, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
              testID="screen-title-ja"
            >
              {titleJa}
            </Text>
          )}
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: theme.color.ink, fontFamily: theme.font.sans }]}
          >
            {title}
          </Text>
          {subtitle === undefined ? null : (
            <Text
              style={[
                styles.subtitle,
                { color: theme.color.inkMuted, fontFamily: theme.font.sans },
              ]}
            >
              {subtitle}
            </Text>
          )}
        </View>

        {lede}
        {children}
        {notice === undefined ? null : <View style={styles.notice}>{notice}</View>}
        <View style={styles.footerSpace} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.xl,
  },
  measure: {
    gap: SPACE.md,
    maxWidth: MEASURE,
    width: '100%',
  },
  heading: {
    gap: SPACE.xs,
  },
  title: {
    fontSize: TYPE.title,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  titleJa: {
    fontSize: TYPE.headwordRow,
    letterSpacing: 6,
    lineHeight: TYPE.headwordRow * 1.3,
  },
  notice: {
    marginTop: SPACE.xl,
  },
  subtitle: {
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.55,
  },
  footerSpace: {
    height: SPACE.xxl,
  },
});
