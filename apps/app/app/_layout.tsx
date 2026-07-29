import { Stack } from 'expo-router';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDebugFlags } from '@/state/app-context';
import { DemoBoundary, DemoProvider } from '@/state/demo/demo-context';
import { DemoBanner } from '@/ui/demo/demo-banner';
import { NavShell } from '@/ui/nav-shell';
import { ThemeProvider, useTheme } from '@/ui/theme-context';

/**
 * Root layout — the app shell (WP-05; the demonstration layer, lane L1).
 *
 * Per orchestration spec §4 this file stays with the builder who owns the
 * shell; other builders request changes through the Conductor rather than
 * editing it. It installs the app-wide providers and styles the navigator to
 * the ink-and-paper palette, so the chrome does not arrive in the default
 * blue-on-white (REQ-UI-08).
 *
 * The nesting order is load-bearing. The navigator reads the theme through a
 * component *inside* `ThemeProvider` rather than computing a palette beside it,
 * so that when the scheme resolves after mount (see `theme-context.tsx`) the
 * navigator's background re-renders with everything else.
 *
 * ## Why the demonstration layer is the outermost thing here
 *
 * `DemoBoundary` decides which store the app gets, so it has to sit *above*
 * `AppProvider` rather than beside it — and it is the only place `AppProvider`
 * is now mounted. That is the whole isolation mechanism: `AppProvider` opens
 * the durable event store exactly when it is handed no store, so handing it a
 * generated one is what keeps a demonstration from ever having a durable
 * adapter to reach (`state/demo/demo-store.ts` argues it in full).
 *
 * `DemoBanner` sits inside the shell, above the navigator, so it is present on
 * every route without any screen having to render it and without any screen
 * being able to omit it. Losing track of whether you are looking at your own
 * data is the failure mode the whole surface guards against, and a banner one
 * screen could forget would be no guard at all.
 */
export default function RootLayout(): ReactNode {
  return (
    <DemoProvider>
      <DemoBoundary>
        <ThemedShell />
      </DemoBoundary>
    </DemoProvider>
  );
}

/** Bridges the evidence flags into the theme; both live above the navigator. */
function ThemedShell(): ReactNode {
  const flags = useDebugFlags();
  return (
    <ThemeProvider scheme={flags.forcedScheme ?? undefined}>
      <ThemedStack />
    </ThemeProvider>
  );
}

/**
 * The navigator, inside the shell (WP-10).
 *
 * `NavShell` wraps the `Stack` rather than being a screen inside it, so the
 * masthead is present on every route and does not re-mount on navigation. That
 * is what makes "every screen is reachable" true of the app rather than true of
 * one screen: wherever the learner is, the four starting places are one tap
 * away, and everything else is reached from the surface it belongs to
 * (`src/ui/navigation.ts` is the map; `test/navigation-reachability.test.ts`
 * checks it against this tree).
 */
function ThemedStack(): ReactNode {
  const theme = useTheme();
  return (
    <NavShell>
      <DemoBanner />
      {/* The navigator has to be told to fill what is left once the banner has
          taken its line; a bare `Stack` beside a sibling takes its content
          height and the routes end up an inch tall. */}
      <View style={styles.stack}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.color.paper },
          }}
        />
      </View>
    </NavShell>
  );
}

const styles = StyleSheet.create({
  stack: { flex: 1, minHeight: 0 },
});
