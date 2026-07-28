import { Stack } from 'expo-router';
import { type ReactNode } from 'react';

import { AppProvider, useDebugFlags } from '@/state/app-context';
import { NavShell } from '@/ui/nav-shell';
import { ThemeProvider, useTheme } from '@/ui/theme-context';

/**
 * Root layout — the app shell (WP-05).
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
 * navigator's background re-renders with everything else. Computing it here
 * would leave the screen container holding the statically rendered light colour
 * under dark content.
 */
export default function RootLayout(): ReactNode {
  return (
    <AppProvider>
      <ThemedShell />
    </AppProvider>
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
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.color.paper },
        }}
      />
    </NavShell>
  );
}
