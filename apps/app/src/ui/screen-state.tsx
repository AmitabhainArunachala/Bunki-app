/**
 * The four screen states, rendered (WP-05, REQ-UI-09).
 *
 * `resolveViewState` in `src/state/view-state.ts` decides *which* state a
 * screen is in; this file decides what each one looks like. Keeping them apart
 * is what lets the precedence be unit-tested without a renderer.
 *
 * Every panel is a live region with a header, so a screen reader announces the
 * change rather than leaving a blind user on a page that silently emptied.
 * Error panels carry a retry action: an error with no way forward is a dead end.
 */

import { type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { OFFLINE_CAPABILITY_NOTE } from '../state/view-state.ts';
import { useReducedMotion } from './motion.tsx';
import { AppButton } from './primitives.tsx';
import { RADIUS, SPACE, TYPE } from './theme.ts';
import { useTheme } from './theme-context.tsx';

export interface StatePanelProps {
  readonly title: string;
  readonly detail?: string | undefined;
  readonly children?: ReactNode;
  readonly testID?: string | undefined;
}

function Panel({ title, detail, children, testID }: StatePanelProps): ReactNode {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.panel, { backgroundColor: theme.color.raised, borderColor: theme.color.rule }]}
      testID={testID}
    >
      <Text
        accessibilityRole="header"
        style={[styles.panelTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        {title}
      </Text>
      {detail === undefined ? null : (
        <Text
          style={[styles.panelBody, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        >
          {detail}
        </Text>
      )}
      {children}
    </View>
  );
}

/**
 * The one piece of motion in the four states, and the one that ignored the ask.
 *
 * `ActivityIndicator` renders on `react-native-web` as a keyframe animation —
 * `rotate(0deg) → rotate(360deg)`, 0.75s, `animation-iteration-count: infinite`,
 * linear — and nothing in the bundle gated it on `prefers-reduced-motion`. Only
 * `useReducedMotion` consults the query, and only the motion components used it,
 * so a learner who had asked the operating system for stillness got an
 * indefinitely spinning disc on every slow screen. Measured in Chromium with
 * `reducedMotion: 'reduce'`: ten distinct rotation matrices over 800 ms,
 * identical to the un-reduced run. Not shortened — unaffected.
 *
 * Under reduction the spinner is simply absent. That costs nothing, because the
 * comment below is already true of it: the panel carries the label, the live
 * region and the `progressbar` role, and the disc is decoration hidden from the
 * accessibility tree. There is no still substitute to draw, because a static
 * spinner is a shape that means nothing.
 *
 * This is a shared component rather than a map file. It is repaired here rather
 * than worked around on one screen because every screen's loading state has the
 * same defect; the map is only where it is on screen longest, at roughly 1.3 s
 * cold while the one-off 9,245-node Atlas builds.
 */
export function LoadingPanel({ label }: { readonly label: string }): ReactNode {
  const theme = useTheme();
  const reduced = useReducedMotion();
  return (
    <View
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessible
      style={[
        styles.panel,
        styles.loading,
        { backgroundColor: theme.color.raised, borderColor: theme.color.rule },
      ]}
      testID="state-loading"
    >
      {/*
        Hidden from the accessibility tree, and this is not cosmetic.

        `react-native-web` renders `ActivityIndicator` as its own
        `role="progressbar"` element, with no name — so a loading panel put *two*
        progressbars in the tree, one named and one anonymous, and the anonymous
        one is an `aria-progressbar-name` violation (WCAG 4.1.2, critical). It
        went unseen for the whole of Phase 0 because the axe sweep walks routes
        in their settled state and no scanned route was ever mid-load; it
        surfaced the moment the design specimen rendered the four states side by
        side on a route the sweep visits.

        The spinner is decoration: the panel around it already carries the label
        and the live region. Which is also why reduced motion can simply drop it.
      */}
      {reduced ? null : <ActivityIndicator aria-hidden color={theme.color.vermilion} />}
      <Text
        style={[styles.panelBody, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
      >
        {label}
      </Text>
    </View>
  );
}

export interface ErrorPanelProps {
  readonly message: string;
  readonly detail?: string | undefined;
  readonly onRetry?: (() => void) | undefined;
  readonly testID?: string | undefined;
}

export function ErrorPanel({
  message,
  detail,
  onRetry,
  testID = 'state-error',
}: ErrorPanelProps): ReactNode {
  return (
    <Panel detail={detail} testID={testID} title={message}>
      {onRetry === undefined ? null : (
        <AppButton
          accessibilityHint="Runs the lookup again."
          label="Try again"
          onPress={onRetry}
          testID="state-error-retry"
        />
      )}
    </Panel>
  );
}

export interface EmptyPanelProps {
  readonly message: string;
  readonly detail?: string | undefined;
  readonly children?: ReactNode;
  readonly testID?: string | undefined;
}

export function EmptyPanel({
  message,
  detail,
  children,
  testID = 'state-empty',
}: EmptyPanelProps): ReactNode {
  return (
    <Panel detail={detail} testID={testID} title={message}>
      {children}
    </Panel>
  );
}

/**
 * The offline banner.
 *
 * It states what still works rather than only that the network is gone — see
 * `OFFLINE_CAPABILITY_NOTE`. It renders only when connectivity is *known* to be
 * offline; an unknown status shows nothing, because a banner is a claim.
 */
export function OfflineBanner({
  testID = 'state-offline',
}: {
  readonly testID?: string;
}): ReactNode {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.banner,
        { backgroundColor: theme.color.vermilionSoft, borderColor: theme.color.vermilion },
      ]}
      testID={testID}
    >
      <Text style={[styles.bannerText, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
        {OFFLINE_CAPABILITY_NOTE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: SPACE.sm,
    padding: SPACE.lg,
  },
  loading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACE.md,
  },
  panelTitle: {
    fontSize: TYPE.body,
    fontWeight: '600',
  },
  panelBody: {
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.6,
  },
  banner: {
    borderLeftWidth: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
  },
  bannerText: {
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.55,
  },
});
