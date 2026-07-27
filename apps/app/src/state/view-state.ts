/**
 * The four states REQ-UI-09 requires of every screen, as data (WP-05).
 *
 * "Every screen defines loading, error, empty, and offline states" is a
 * requirement about the *screen*, not about a spinner component, so the states
 * live here as a closed union that each screen resolves before it renders
 * anything. `resolveViewState` is the single place their precedence is decided,
 * which is the part that is easy to get subtly wrong per-screen and easy to
 * test once.
 *
 * Precedence, and why:
 *
 *   1. **loading** — while a screen is still resolving, it knows nothing; an
 *      empty or error verdict would be a claim it cannot support yet.
 *   2. **error** — a screen that failed must say so rather than show an empty
 *      list, which would read as "there is nothing" instead of "we do not know".
 *   3. **empty** — a resolved lookup with no result.
 *   4. **ready**.
 *
 * Offline is deliberately *not* in that ladder. The Phase-0 seed is bundled and
 * the store is local, so losing the network does not stop a lookup — it only
 * means the asynchronous enrichment cannot reach anything remote. Ranking
 * offline above ready would black out screens that work perfectly well, so
 * connectivity rides alongside as a banner (`offline: boolean`) and only
 * becomes the whole state when a screen genuinely cannot proceed without the
 * network. Nothing in WP-05 does, and `OFFLINE_CAPABILITY_NOTE` says so on
 * screen rather than leaving the user to guess.
 */

export type ViewState<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string; readonly detail?: string }
  | { readonly kind: 'empty'; readonly message: string; readonly detail?: string }
  | { readonly kind: 'ready'; readonly data: T };

export interface ResolveInput<T> {
  readonly loading: boolean;
  readonly error: string | null;
  readonly data: T | null;
  /** Shown when `data` is null and nothing failed. */
  readonly emptyMessage: string;
  readonly emptyDetail?: string | undefined;
  readonly errorDetail?: string | undefined;
}

export function resolveViewState<T>(input: ResolveInput<T>): ViewState<T> {
  if (input.loading) return { kind: 'loading' };
  if (input.error !== null) {
    return input.errorDetail === undefined
      ? { kind: 'error', message: input.error }
      : { kind: 'error', message: input.error, detail: input.errorDetail };
  }
  if (input.data === null) {
    return input.emptyDetail === undefined
      ? { kind: 'empty', message: input.emptyMessage }
      : { kind: 'empty', message: input.emptyMessage, detail: input.emptyDetail };
  }
  return { kind: 'ready', data: input.data };
}

/**
 * What being offline actually costs in Phase 0, stated plainly.
 *
 * The seed dataset is bundled and the event store is local, so search, word and
 * kanji pages, capture and Keep all work with no network at all. Saying "you
 * are offline" without saying that would imply a degradation that is not
 * happening.
 */
export const OFFLINE_CAPABILITY_NOTE =
  'Offline. Search, capture and Keep still work — the seed dataset and your saved threads are on this device.';

/** Shown while a lookup is resolving. */
export const LOADING_NOTE = 'Looking up…';
