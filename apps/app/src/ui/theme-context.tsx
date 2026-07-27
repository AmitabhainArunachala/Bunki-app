/**
 * Theme plumbing (WP-05).
 *
 * The scheme follows the platform (`userInterfaceStyle: "automatic"` in
 * `app.json`), with an override the evidence-capture script uses so the same
 * screen can be photographed in both palettes.
 *
 * ## Why the scheme is resolved *after* mount
 *
 * `expo export --platform web` statically renders every route, and static
 * rendering has no colour scheme: `useColorScheme()` returns light on the
 * server. If the first client render disagreed with that markup, React would
 * hydrate rather than re-render, and any node whose props never change again —
 * the screen background, for one — would keep the server's light styling
 * underneath dark content. That is not a theoretical mismatch: it is what
 * happens to every user whose system is set to dark.
 *
 * So the first client render deliberately matches the server, and the real
 * scheme arrives in an effect. That is one frame of light before dark, and the
 * whole tree re-renders properly instead of being stitched onto stale markup.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { createTheme, type ColorSchemeName, type Theme } from './theme.ts';

const ThemeContext = createContext<Theme | null>(null);

/** What the static render assumes, and therefore what the first client render must assume. */
const PRERENDER_SCHEME: ColorSchemeName = 'light';

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /** Force a scheme. Omitted in the app; set by the screenshot harness. */
  readonly scheme?: ColorSchemeName | undefined;
}

export function ThemeProvider({ children, scheme }: ThemeProviderProps): ReactNode {
  const platformScheme = useColorScheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resolved: ColorSchemeName = !mounted
    ? PRERENDER_SCHEME
    : (scheme ?? (platformScheme === 'dark' ? 'dark' : 'light'));

  const theme = useMemo(() => createTheme(resolved), [resolved]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error(
      'useTheme() was called outside <ThemeProvider>. Wrap the route in app/_layout.',
    );
  }
  return theme;
}
