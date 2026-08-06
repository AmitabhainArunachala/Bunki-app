/**
 * Theme plumbing (WP-05; Drift fusion, BUNKI_DRIFT_FUSION_SPEC_2026-08-06.md §3).
 *
 * The theme is one of the five nihonga themes. When the learner has not
 * chosen, the OS scheme picks the default (light → 北斎, dark → 夜,
 * `userInterfaceStyle: "automatic"` in `app.json`); the theme seal in the
 * navigation shell cycles through all five, and the choice persists on web
 * (`localStorage["bunki-theme"]`). Native holds the choice for the session —
 * Phase 0 ships no storage dependency, and a silent fake persistence would
 * be worse than the honest gap.
 *
 * The `scheme` prop survives for the capture harness: forcing light/dark
 * forces that scheme's default theme, so the same screen can be
 * photographed on both papers.
 *
 * ## Why the theme is resolved *after* mount
 *
 * `expo export --platform web` statically renders every route, and static
 * rendering has no colour scheme and no localStorage: the server renders the
 * light default (北斎). If the first client render disagreed with that markup,
 * React would hydrate rather than re-render, and any node whose props never
 * change again — the screen background, for one — would keep the server's
 * styling underneath different content. So the first client render
 * deliberately matches the server, and the real theme (OS scheme, stored
 * choice) arrives in an effect: one frame of 北斎 before 夜, and the whole
 * tree re-renders properly instead of being stitched onto stale markup.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, useColorScheme } from 'react-native';

import {
  createTheme,
  DEFAULT_THEME_FOR_SCHEME,
  NIHONGA_THEMES,
  nextThemeName,
  THEME_NAMES,
  type ColorSchemeName,
  type Theme,
  type ThemeName,
} from './theme.ts';

const ThemeContext = createContext<Theme | null>(null);

interface ThemeControl {
  /** Advance the seal: the theme after this one, in cycle order. */
  readonly cycleTheme: () => void;
  /** Jump straight to a theme (settings surfaces, tests). */
  readonly setThemeName: (name: ThemeName) => void;
}

const ThemeControlContext = createContext<ThemeControl | null>(null);

/** What the static render assumes, and therefore what the first client render must assume. */
const PRERENDER_THEME: ThemeName = DEFAULT_THEME_FOR_SCHEME.light;

/** Where the learner's choice lives on web. */
export const THEME_STORAGE_KEY = 'bunki-theme';

function isThemeName(value: string | null): value is ThemeName {
  return value !== null && (THEME_NAMES as readonly string[]).includes(value);
}

function readStoredTheme(): ThemeName | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(stored) ? stored : null;
  } catch {
    return null; // storage disabled is a preference, not an error
  }
}

function writeStoredTheme(name: ThemeName): void {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, name);
  } catch {
    // storage full or disabled — the choice still applies for the session
  }
}

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /** Force a scheme's default theme. Omitted in the app; set by the screenshot harness. */
  readonly scheme?: ColorSchemeName | undefined;
  /** Force an exact theme. Wins over `scheme`. Set by tests and capture runs. */
  readonly themeName?: ThemeName | undefined;
}

export function ThemeProvider({ children, scheme, themeName }: ThemeProviderProps): ReactNode {
  const platformScheme = useColorScheme();
  const [mounted, setMounted] = useState(false);
  const [chosen, setChosen] = useState<ThemeName | null>(null);

  useEffect(() => {
    setChosen(readStoredTheme());
    setMounted(true);
  }, []);

  const resolved: ThemeName = !mounted
    ? PRERENDER_THEME
    : (themeName ??
      (scheme !== undefined
        ? DEFAULT_THEME_FOR_SCHEME[scheme]
        : (chosen ?? DEFAULT_THEME_FOR_SCHEME[platformScheme === 'dark' ? 'dark' : 'light'])));

  const setThemeName = useCallback((name: ThemeName) => {
    setChosen(name);
    writeStoredTheme(name);
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeName(nextThemeName(resolved));
  }, [resolved, setThemeName]);

  // The washi ground extends under overscroll and behind every route: on web
  // the document body carries the theme's paper (the +html.tsx texture lines
  // sit over it), so the page never flashes browser-white at the edges.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.style.backgroundColor = NIHONGA_THEMES[resolved].palette.paper;
  }, [resolved]);

  const theme = useMemo(() => createTheme(resolved), [resolved]);
  const control = useMemo<ThemeControl>(
    () => ({ cycleTheme, setThemeName }),
    [cycleTheme, setThemeName],
  );

  return (
    <ThemeContext.Provider value={theme}>
      <ThemeControlContext.Provider value={control}>{children}</ThemeControlContext.Provider>
    </ThemeContext.Provider>
  );
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

export function useThemeControl(): ThemeControl {
  const control = useContext(ThemeControlContext);
  if (control === null) {
    throw new Error(
      'useThemeControl() was called outside <ThemeProvider>. Wrap the route in app/_layout.',
    );
  }
  return control;
}
