/**
 * Evidence-harness flags (WP-05).
 *
 * REQ-UI-09 requires every screen to define loading, error, empty and offline
 * states, and WP-05's closure predicate requires screenshots of them. Empty and
 * offline are reachable by using the app (an unmatched query; the browser going
 * offline). Loading and error are not: the seed is bundled and validated at
 * import, so a lookup resolves within a frame and nothing on these three
 * screens can fail on its own.
 *
 * The alternatives were to fake the states in a mock harness — which would
 * prove the mock renders, not the screen — or to add these flags. They are
 * inert unless present in the URL, they are named for what they are, and the
 * screens they affect render the *real* state machine, not a stand-in.
 *
 * They are deliberately parsed from an injected string rather than read from a
 * global, so nothing needs a `window` to be testable.
 *
 *   ?lag=1200   hold the loading state for 1200 ms
 *   ?fail=1     make the next lookup fail, to show the error state
 *   ?scheme=dark   force a colour scheme (the contrast evidence needs both)
 *   ?strokes=all   start the stroke animation finished, for a stable frame
 */

export interface DebugFlags {
  /** Artificial delay before a lookup resolves, in milliseconds. */
  readonly lagMs: number;
  /** Force lookups on this page to fail. */
  readonly forceFailure: boolean;
  /** Force a colour scheme, or `null` to follow the platform. */
  readonly forcedScheme: 'light' | 'dark' | null;
  /** Start stroke animations fully revealed and paused. */
  readonly strokesRevealed: boolean;
}

export const NO_DEBUG_FLAGS: DebugFlags = {
  lagMs: 0,
  forceFailure: false,
  forcedScheme: null,
  strokesRevealed: false,
};

/** Upper bound on `lag`, so a stray URL cannot wedge a screen indefinitely. */
const MAX_LAG_MS = 10_000;

export function parseDebugFlags(search: string): DebugFlags {
  if (search === '') return NO_DEBUG_FLAGS;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  const rawLag = Number.parseInt(params.get('lag') ?? '', 10);
  const lagMs = Number.isFinite(rawLag) && rawLag > 0 ? Math.min(rawLag, MAX_LAG_MS) : 0;

  const scheme = params.get('scheme');
  const forcedScheme = scheme === 'dark' ? 'dark' : scheme === 'light' ? 'light' : null;

  return {
    lagMs,
    forceFailure: params.get('fail') === '1',
    forcedScheme,
    strokesRevealed: params.get('strokes') === 'all',
  };
}

/** Reads the current location's query string where one exists; `NO_DEBUG_FLAGS` otherwise. */
export function readDebugFlags(
  location: { readonly search?: unknown } | undefined = (
    globalThis as { location?: { search?: unknown } }
  ).location,
): DebugFlags {
  const search = location?.search;
  return typeof search === 'string' ? parseDebugFlags(search) : NO_DEBUG_FLAGS;
}
