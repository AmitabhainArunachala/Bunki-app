/**
 * The persistent navigation shell (Wave D; REQ-UI-08).
 *
 * ## The defect this file was rebuilt to fix
 *
 * Measured in Chromium at 390 × 844 — an iPhone 14's CSS width — every route in
 * the app reported `scrollWidth = 699` against `clientWidth = 390`. A 309-pixel
 * horizontal overflow, on all of `/`, `/map`, `/guide`, `/journey`, `/read`,
 * `/session`, `/evidence`, `/debug`, `/canvas`, `/repair` and `/style-guide`.
 *
 * The cause was this file and `navigation.ts`. Seven destinations were laid out
 * in one wrapping row whose children could not shrink, so the row measured 679
 * points wide and the page inherited it. `flexWrap: 'wrap'` was set and did
 * nothing, because the row itself had no width to wrap inside.
 *
 * Two things changed, and only the second is a layout fix:
 *
 *   1. **The information architecture** — five destinations grouped by what the
 *      learner is doing, with capture demoted to an action and the guide to a
 *      presence. That argument lives in `navigation.ts`, at length, because a
 *      nav file with no argument in it gets re-litigated by the next lane.
 *   2. **The layout** — a bottom tab bar whose items are `flex: 1` with
 *      `minWidth: 0`, and a masthead whose parts shrink. Both are what make the
 *      shell fit *any* width rather than the width the labels happened to need.
 *
 * `e2e/viewport-overflow.spec.ts` measures `scrollWidth` against `clientWidth`
 * on every route at 390 and at 360 CSS px. Nothing in the suite checked it
 * before, which is why seven lanes could ship it.
 *
 * ## Why a bottom tab bar
 *
 * The operator's primary device is an iPhone, and this is a phone-native app
 * whose web export is the same tree. A tab bar at the bottom is where a thumb
 * is; a masthead of links is where a mouse is. The masthead stays, and holds
 * the two things that are *not* destinations: the wordmark, and the capture
 * action.
 *
 * It is one bar at all widths rather than a bar that becomes a header on a
 * desktop viewport. A responsive swap would mean two renderings of the same
 * five controls, and the only way to keep exactly one in the DOM is a
 * measurement that is wrong on the first frame. One bar is honest, fits, and
 * cannot produce duplicate test ids.
 *
 * ## What the accent is spent on
 *
 * Exactly one thing: telling you where you already are. `aria-current="page"`
 * marks it, and it still renders as a control rather than as plain text — a
 * shell that removed the current item would move the other four every time you
 * navigated, which is the cheapest possible way to make a calm surface feel
 * unstable.
 *
 * `aria-current` is forwarded by react-native-web and is passed **once**. An
 * earlier round added a second, platform-guarded spread of the same attribute;
 * the two never disagreed, so nothing was visibly wrong, which is exactly why it
 * was worth removing. `test/carried-defects.test.ts` (P2-3) pins the single
 * occurrence.
 *
 * ## What it deliberately does not do
 *
 * It holds no store, reads no snapshot, and renders no domain state. It is
 * chrome. The one thing it knows is `usePathname()`, which is a fact about the
 * router and not about the learner. The guide's rail is the same: a stance about
 * the *surface*, never a claim about the person (see `guide/guide-presence.tsx`).
 */

import { usePathname, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GuidePresence } from './guide/guide-presence.tsx';
import { SHELL_DESTINATIONS, destinationFor, type Destination } from './navigation.ts';
import { MIN_TOUCH_TARGET, RADIUS, SPACE, TYPE } from './theme.ts';
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

const CAPTURE = '/capture';
const GUIDE = '/guide';

export interface NavShellProps {
  readonly children: ReactNode;
}

export function NavShell({ children }: NavShellProps): ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={styles.shell} testID="nav-shell">
      <View
        style={[
          styles.masthead,
          { backgroundColor: theme.color.paper, borderBottomColor: theme.color.rule },
        ]}
      >
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.wordmark, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
        >
          {WORDMARK}
        </Text>
        <CaptureAction
          onPress={() => router.push(`${CAPTURE}?from=${encodeURIComponent(pathname)}`)}
        />
      </View>

      {/*
        The 案内人, on every surface, as one line — see `guide/guide-presence.tsx`
        for why it is a rail rather than a tab or a bubble. It is rendered here
        rather than inside each screen precisely so that no screen can forget it
        and no screen can decide to shout it.
      */}
      <GuidePresence
        here={isCurrent(pathname, GUIDE)}
        onOpen={() => router.push(GUIDE)}
        pathname={pathname}
      />

      <View style={styles.body}>{children}</View>

      {/* `role`, not `accessibilityRole`: React Native's role list has no
          `navigation`, and the landmark is what lets a screen-reader user skip
          the bar instead of hearing five links on every screen. */}
      <View
        role="navigation"
        style={[
          styles.tabs,
          { backgroundColor: theme.color.paper, borderTopColor: theme.color.rule },
        ]}
      >
        {SHELL_DESTINATIONS.map((destination) => (
          <NavTab
            current={isCurrent(pathname, destination.href)}
            destination={destination}
            key={destination.href}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Capture, offered from every surface — `navigation.ts` §2.
 *
 * `push`, not `replace`, and this is the whole mechanism behind "without losing
 * place": the tab bar switches with `replace` so the history stays one deep,
 * and capture pushes onto it, so leaving capture lands back on the exact
 * surface the learner opened it from. `?from=` carries that surface's path so
 * the capture screen can name the way back in words rather than relying on the
 * browser's Back button being the thing a learner reaches for on a phone.
 */
function CaptureAction({ onPress }: { readonly onPress: () => void }): ReactNode {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const destination = destinationFor(CAPTURE);

  return (
    <Pressable
      accessibilityHint={destination?.blurb}
      accessibilityLabel={`Capture — ${destination?.ja ?? ''}`}
      accessibilityRole="button"
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: theme.color.raised,
          borderColor: focused ? theme.color.focusRing : theme.color.ruleStrong,
          borderWidth: focused ? 2 : 1,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
      testID="nav-capture"
    >
      <Text
        numberOfLines={1}
        style={[styles.actionJa, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
      >
        {destination?.ja ?? ''}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.actionEn, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
      >
        Capture
      </Text>
    </Pressable>
  );
}

interface NavTabProps {
  readonly destination: Destination;
  readonly current: boolean;
}

/**
 * One tab.
 *
 * `flex: 1` with `minWidth: 0` is the layout fix: five tabs divide whatever
 * width there is instead of each demanding the width of its own label. The
 * Japanese name is set in mincho above the English, per the typography-first
 * rule — the chrome of an app for learning Japanese should itself be in
 * Japanese, and reading a tab label is exposure and nothing more.
 */
function NavTab({ destination, current }: NavTabProps): ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityHint={destination.blurb}
      accessibilityLabel={`${destination.label} — ${destination.ja}, ${destination.yomi}`}
      accessibilityRole="link"
      // `'page'` rather than `'true'`: these links go to whole destinations, and
      // `page` is the token that says so. Omitted entirely when it is not the
      // current one — `aria-current="false"` is a value some screen readers
      // still announce.
      aria-current={current ? 'page' : undefined}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      // `replace`, not `push` (W5 P1-3). A persistent shell is a *switch*
      // between destinations, not a stack of them: `push` added an entry and
      // popped nothing, so five Evidence↔Map round trips left six mounted map
      // screens, each still subscribed to the store and therefore re-rendered on
      // every write. Work grew with navigation for no reason the learner could
      // see, and the browser's Back button walked backwards through a history
      // they never built.
      //
      // `navigate` was tried first and measured: on expo-router 57 it still left
      // six mounted screens after the same five round trips, because it only
      // collapses onto an entry for the *same* path rather than switching
      // between sibling destinations. `replace` swaps the current entry, so the
      // count stays flat — `adv-known-defects.spec.ts` (T3-2) pins it.
      //
      // Only the shell's five destinations are replaced. Every other link in the
      // app still pushes, because those *are* stack moves: a word page opened
      // from a search should come back to that search, and the capture action
      // must come back to the surface it was opened from.
      onPress={() => router.replace(destination.href)}
      style={({ pressed }) => [
        styles.tab,
        {
          borderTopColor: current ? theme.color.vermilion : 'transparent',
          borderColor: focused ? theme.color.focusRing : 'transparent',
          borderWidth: focused ? 2 : 0,
          borderTopWidth: 2,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      testID={`nav-${destination.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.tabJa,
          {
            color: current ? theme.color.vermilion : theme.color.ink,
            fontFamily: theme.font.mincho,
          },
        ]}
      >
        {destination.ja}
      </Text>
      <Text
        numberOfLines={1}
        style={[
          styles.tabEn,
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
  action: {
    alignItems: 'center',
    borderRadius: RADIUS.md,
    flexShrink: 1,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    minWidth: 64,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 4,
  },
  // The English gloss sits one step under the small print on purpose: the
  // Japanese name is the label and the English is its translation, not the
  // other way round. `TYPE.ruby` is the scale's own floor for an annotation
  // line, which is exactly what this is.
  actionEn: {
    fontSize: TYPE.ruby,
    letterSpacing: 0.4,
  },
  actionJa: {
    fontSize: TYPE.label,
    letterSpacing: 2,
  },
  body: { flex: 1, minHeight: 0 },
  masthead: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: SPACE.md,
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
  },
  shell: { flex: 1, maxWidth: '100%', overflow: 'hidden' },
  tab: {
    alignItems: 'center',
    // The layout fix, in two properties. `flexBasis: 0` with `flexShrink: 1`
    // means a tab is never wider than its share, whatever its label says.
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET + SPACE.sm,
    minWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: SPACE.xs,
  },
  tabEn: {
    fontSize: TYPE.ruby,
    letterSpacing: 0.3,
  },
  tabJa: {
    fontSize: TYPE.label,
    letterSpacing: 1,
  },
  tabs: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    maxWidth: '100%',
    width: '100%',
  },
  wordmark: { flexShrink: 0, fontSize: TYPE.title, letterSpacing: 3 },
});
