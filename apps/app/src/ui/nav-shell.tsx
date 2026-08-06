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

/**
 * Where the universe is, when there is one (the Pages build serves the study
 * app under <site>/app/ with Drift at the site root —
 * BUNKI_ONE_APP_CONVERGENCE_SPEC_2026-08-06.md §4). Null on native, on
 * root-served web (the e2e harness), and anywhere the /app/ segment is absent,
 * which is exactly where the link would be a lie.
 */
function universeHref(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const path = window.location.pathname;
  const i = path.indexOf('/app/');
  if (i === -1) return null;
  return path.slice(0, i + 1);
}

import { navLinkStyle, themeSealStyle } from './interactive-styles.ts';
import { SHELL_DESTINATIONS, type Destination } from './navigation.ts';
import { useTheme, useThemeControl } from './theme-context.tsx';

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
        <View style={styles.tail}>
          <UniverseLink />
          <ThemeSeal />
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
      // `replace`, not `push` (W5 P1-3). A persistent shell is a *switch*
      // between destinations, not a stack of them: `push` added an entry and
      // popped nothing, so five Evidence↔Capture round trips left six mounted
      // capture screens, each still subscribed to the store and therefore
      // re-rendered on every write. Work grew with navigation for no reason the
      // learner could see, and the browser's Back button walked backwards
      // through a history they never built.
      //
      // `navigate` was tried first and measured: on expo-router 57 it still left
      // six mounted capture screens after the same five round trips, because it
      // only collapses onto an entry for the *same* path rather than switching
      // between sibling destinations. `replace` swaps the current entry, so the
      // count stays flat — `adv-known-defects.spec.ts` (T3-2) pins it.
      //
      // Only the shell's four destinations are replaced. Every other link in the
      // app still pushes, because those *are* stack moves: a word page opened
      // from a search should come back to that search.
      onPress={() => router.replace(destination.href)}
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

/**
 * The way back into the universe (one-app convergence §4): a quiet link that
 * renders only when the app is actually mounted beneath a Drift root. A full
 * page navigation on purpose — the universe is a different document, and
 * pretending it is a router destination would break the Back button.
 */
function UniverseLink(): ReactNode {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const href = universeHref();
  if (href === null) return null;

  return (
    <Pressable
      accessibilityHint="Returns to the floating word universe"
      accessibilityLabel="墨流し — the word universe"
      accessibilityRole="link"
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={() => {
        window.location.assign(href);
      }}
      style={({ pressed }) => [
        styles.link,
        {
          borderColor: focused ? theme.color.focusRing : 'transparent',
          borderWidth: focused ? 2 : 0,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      testID="nav-universe"
    >
      <Text style={[styles.linkLabel, { color: theme.color.pig2, fontFamily: theme.font.mincho }]}>
        墨流し
      </Text>
    </Pressable>
  );
}

/**
 * The theme seal (Drift fusion §3): a round 印 stamped with the current
 * theme's character. One tap advances to the next of the five nihonga
 * themes, in the prototype's cycle order. It sits at the far edge of the
 * masthead — a seal goes in the corner of the painting, not in the middle.
 */
function ThemeSeal(): ReactNode {
  const theme = useTheme();
  const { cycleTheme } = useThemeControl();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityHint="Cycles through the five nihonga colour themes"
      accessibilityLabel={`Theme: ${theme.label}. Change theme`}
      accessibilityRole="button"
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={cycleTheme}
      style={({ pressed }) => [
        styles.seal,
        {
          borderColor: focused ? theme.color.focusRing : theme.color.vermilion,
          borderWidth: focused ? 2.5 : themeSealStyle.borderWidth,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      testID="nav-theme-seal"
    >
      <Text
        style={[styles.sealGlyph, { color: theme.color.vermilion, fontFamily: theme.font.mincho }]}
      >
        {theme.seal}
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
  seal: { ...themeSealStyle },
  sealGlyph: { fontSize: 17 },
  shell: { flex: 1 },
  tail: { alignItems: 'center', flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  wordmark: { fontSize: 22, letterSpacing: 4 },
});
