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
  readonly subtitle?: string | undefined;
  /** Rendered right under the title, before the content. */
  readonly lede?: ReactNode;
  readonly children: ReactNode;
  readonly testID?: string | undefined;
}

export function ScreenShell({
  title,
  subtitle,
  lede,
  children,
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
  subtitle: {
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.55,
  },
  footerSpace: {
    height: SPACE.xxl,
  },
});
