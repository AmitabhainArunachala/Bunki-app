/**
 * The lookup state machine every screen shares (WP-05, REQ-UI-09).
 *
 * A screen calls `useLookup` with a synchronous resolver over the seed. The
 * hook renders `loading` first and resolves on the next task, which is not
 * theatre — the dataset is bundled, so the honest report of "we have not looked
 * yet" lasts exactly one frame. Under `?lag=` (see `debug-flags.ts`) it lasts
 * long enough to photograph, and under `?fail=1` the resolver's failure path is
 * exercised for real rather than mocked.
 *
 * A resolver that throws produces the error state with the thrown message. A
 * resolver that returns `null` produces the empty state. Those are different
 * answers — "the lookup failed" versus "there is no such entry in the seed" —
 * and collapsing them is the mistake this hook exists to prevent.
 */

import { useCallback, useEffect, useState } from 'react';

import type { DebugFlags } from './debug-flags.ts';
import { resolveViewState, type ViewState } from './view-state.ts';

export interface UseLookupOptions {
  readonly flags: DebugFlags;
  /** Shown when the resolver returns `null`. */
  readonly emptyMessage: string;
  readonly emptyDetail?: string | undefined;
}

export interface LookupResult<T> {
  readonly state: ViewState<T>;
  /** Re-runs the resolver. Wired to the error panel's retry button. */
  readonly retry: () => void;
}

export function useLookup<T>(resolve: () => T | null, options: UseLookupOptions): LookupResult<T> {
  const { flags, emptyMessage, emptyDetail } = options;
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = (): void => {
      if (cancelled) return;
      try {
        if (flags.forceFailure) {
          throw new Error('Lookup failed. (Forced by the ?fail=1 evidence flag.)');
        }
        const result = resolve();
        setData(result);
        setError(null);
      } catch (cause) {
        setData(null);
        setError(cause instanceof Error ? cause.message : 'The lookup failed.');
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(run, flags.lagMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [resolve, flags.lagMs, flags.forceFailure, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    state: resolveViewState<T>({
      loading,
      error,
      data,
      emptyMessage,
      emptyDetail,
      errorDetail: 'Nothing was saved or lost — this screen only reads the bundled seed dataset.',
    }),
    retry,
  };
}
