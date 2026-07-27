/**
 * The persistent navigation shell (WP-10; REQ-UI-08).
 *
 * ## What this is for
 *
 * It is the app's front door, and it is the operator's first impression, so it
 * is built as a masthead rather than as a tab bar: the wordmark, a hairline, and
 * four quiet links in the UI sans. Nothing here is a dashboard, a status pill,
 * or a count — those belong on the surfaces that own the facts. Generous ma and
 * one accent are the whole visual vocabulary (REQ-UI-08), and the accent is
 * spent on exactly one thing: telling you where you already are.
 *
 * ## Why the current destination is a link that does nothing
 *
 * `accessibilityState.selected` marks it, `aria-current` follows on web, and it
 * still renders as a control rather than as plain text. A shell that removed the
 * current item would move the other three every time you navigated, which is the
 * cheapest possible way to make a calm surface feel unstable.
 *
 * ## What it deliberately does not do
 *
 * It holds no store, reads no snapshot, and renders no domain state. It is
 * chrome. The one thing it knows is `usePathname()`, which is a fact about the
 * router and not about the learner.
 */

import { usePathname, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { navLinkStyle } from './interactive-styles.ts';
import { SHELL_DESTINATIONS, type Destination } from './navigation.ts';
import { useTheme } from './theme-context.tsx';

/**
 * The wordmark.
 *
 * 分岐 is the project's name and the seed's canonical target, which is a
 * coincidence worth keeping: the first characters a learner sees are ones the
 * app can actually teach them.
 */
export const WORDMARK = '分岐';

/**
 * Whether a pathname is "at" a destination.
 *
 * `/` matches only itself — a `startsWith` test would mark the home link
 * selected on every screen in the app, which is worse than marking none.
 */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface NavShellProps {
  readonly children: ReactNode;
}

export function NavShell({ children }: NavShellProps): ReactNode {
  const theme = useTheme();
  const pathname = usePathname();

  return (
    <View style={styles.shell}>
      <View
        style={[
          styles.masthead,
          { backgroundColor: theme.color.paper, borderBottomColor: theme.color.rule },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[styles.wordmark, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
        >
          {WORDMARK}
        </Text>
        {/* `role`, not `accessibilityRole`: React Native's role list has no
            `navigation`, and the landmark is what lets a screen-reader user skip
            the masthead instead of hearing four links on every screen. */}
        <View role="navigation" style={styles.links}>
          {SHELL_DESTINATIONS.map((destination) => (
            <NavLink
              current={isCurrent(pathname, destination.href)}
              destination={destination}
              key={destination.href}
            />
          ))}
        </View>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

interface NavLinkProps {
  readonly destination: Destination;
  readonly current: boolean;
}

function NavLink({ destination, current }: NavLinkProps): ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityHint={destination.blurb}
      accessibilityLabel={destination.label}
      accessibilityRole="link"
      accessibilityState={{ selected: current }}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={() => router.push(destination.href)}
      style={({ pressed }) => [
        styles.link,
        {
          borderBottomColor: current ? theme.color.vermilion : 'transparent',
          borderColor: focused ? theme.color.focusRing : 'transparent',
          borderWidth: focused ? 2 : 0,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      testID={`nav-${destination.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
      {...(Platform.OS === 'web' && current ? { 'aria-current': 'page' } : {})}
    >
      <Text
        style={[
          styles.linkLabel,
          {
            color: current ? theme.color.vermilion : theme.color.inkMuted,
            fontFamily: theme.font.sans,
          },
        ]}
      >
        {destination.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  link: { ...navLinkStyle },
  linkLabel: { fontSize: 15, letterSpacing: 0.2 },
  links: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  masthead: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  shell: { flex: 1 },
  wordmark: { fontSize: 22, letterSpacing: 4 },
});
