import { deepFreeze, FeedError, mayUseFeed, type FeedSnapshot, type FeedSource } from './model.ts';

export interface FeedRequestState {
  readonly lastAttemptAt: number | null;
  readonly lastSuccessAt: number | null;
  readonly nextCheckAt: number;
  readonly failures: number;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly latestPublishedAt: string | null;
  readonly cacheable: boolean;
}
export const initialFeedState = (): FeedRequestState =>
  deepFreeze({
    lastAttemptAt: null,
    lastSuccessAt: null,
    nextCheckAt: 0,
    failures: 0,
    etag: null,
    lastModified: null,
    latestPublishedAt: null,
    cacheable: true,
  });
const clock = (now: number) => {
  if (!Number.isSafeInteger(now) || now < 0) throw new FeedError('invalid-clock');
  return now;
};
const header = (value: string | undefined): string | null =>
  value && value.length <= 1024 && /^[\x20-\x7e]+$/u.test(value) ? value : null;

export function parseFeedRequestState(raw: unknown): FeedRequestState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new FeedError('invalid-request-state');
  const state = raw as Record<string, unknown>;
  const expected = Object.keys(initialFeedState()).sort();
  if (JSON.stringify(Object.keys(state).sort()) !== JSON.stringify(expected))
    throw new FeedError('invalid-request-state');
  for (const key of ['lastAttemptAt', 'lastSuccessAt'])
    if (state[key] !== null && (!Number.isSafeInteger(state[key]) || (state[key] as number) < 0))
      throw new FeedError('invalid-request-state');
  if (
    !Number.isSafeInteger(state['nextCheckAt']) ||
    (state['nextCheckAt'] as number) < 0 ||
    !Number.isSafeInteger(state['failures']) ||
    (state['failures'] as number) < 0 ||
    (state['failures'] as number) > 1000 ||
    typeof state['cacheable'] !== 'boolean'
  )
    throw new FeedError('invalid-request-state');
  for (const key of ['etag', 'lastModified'])
    if (state[key] !== null && (typeof state[key] !== 'string' || header(state[key]) === null))
      throw new FeedError('invalid-request-state');
  if (
    state['latestPublishedAt'] !== null &&
    (typeof state['latestPublishedAt'] !== 'string' ||
      !Number.isFinite(Date.parse(state['latestPublishedAt'])))
  )
    throw new FeedError('invalid-request-state');
  return deepFreeze({ ...state } as unknown as FeedRequestState);
}

export function planFeedRequest(
  source: FeedSource,
  state: FeedRequestState,
  now: number,
  hasSnapshot = false,
) {
  clock(now);
  parseFeedRequestState(state);
  if (
    !source.feed ||
    source.mode !== 'personal-feed' ||
    !mayUseFeed(source, 'personal-fetch') ||
    !mayUseFeed(source, 'display-metadata')
  )
    return deepFreeze({
      kind: 'unavailable' as const,
      reason: 'publisher-route-or-unresolved-basis',
    });
  if (now < state.nextCheckAt)
    return deepFreeze({ kind: 'deferred' as const, nextCheckAt: state.nextCheckAt });
  const headers: Record<string, string> = {};
  if (hasSnapshot && state.cacheable) {
    if (state.etag) headers['if-none-match'] = state.etag;
    if (state.lastModified) headers['if-modified-since'] = state.lastModified;
  }
  return deepFreeze({ kind: 'fetch' as const, url: source.feed.url, headers });
}

export function feedFreshness(source: FeedSource, state: FeedRequestState, now: number) {
  clock(now);
  if (state.lastSuccessAt === null) return 'never-fetched' as const;
  if (state.latestPublishedAt === null) return 'publication-date-unknown' as const;
  return now - Date.parse(state.latestPublishedAt) > source.cadence.staleAfterMs
    ? ('stale' as const)
    : ('current' as const);
}

function retryAfter(value: string | undefined, now: number): number {
  if (!value || value.length > 100) return 0;
  const seconds = /^\d{1,8}$/u.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 7 * 86_400_000) : 0;
}

export type FeedResult = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly snapshot?: FeedSnapshot;
  readonly error?: string;
};

export function applyFeedResult(
  source: FeedSource,
  previous: FeedRequestState,
  result: FeedResult,
  now: number,
) {
  clock(now);
  parseFeedRequestState(previous);
  const base = source.cadence.minIntervalMs;
  let status: 'updated' | 'not-modified' | 'forbidden' | 'rate-limited' | 'not-found' | 'failed';
  const successful =
    (result.status === 200 && result.snapshot?.sourceId === source.id && !result.error) ||
    (result.status === 304 && previous.lastSuccessAt !== null && !result.error);
  const cacheControl = result.headers['cache-control'] || '';
  const cacheable = !/(?:^|,)\s*no-store(?:\s|,|$)/iu.test(cacheControl);
  const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d+)"?/iu.exec(cacheControl)?.[1];
  const cacheWait = maxAge ? Math.min(Number(maxAge) * 1000, 7 * 86_400_000) : 0;
  let wait = Math.max(base, cacheWait, retryAfter(result.headers['retry-after'], now));
  if (successful) status = result.status === 304 ? 'not-modified' : 'updated';
  else if (result.status === 403) {
    status = 'forbidden';
    wait = Math.max(wait, 86_400_000);
  } else if (result.status === 404 || result.status === 410) {
    status = 'not-found';
    wait = Math.max(wait, 86_400_000);
  } else if (result.status === 429) {
    status = 'rate-limited';
    wait = Math.max(wait, 3_600_000);
  } else {
    status = 'failed';
    wait = Math.max(wait, Math.min(base * 2 ** Math.min(previous.failures + 1, 8), 86_400_000));
  }
  const state: FeedRequestState = {
    lastAttemptAt: now,
    lastSuccessAt: successful ? now : previous.lastSuccessAt,
    nextCheckAt: now + wait,
    failures: successful ? 0 : Math.min(previous.failures + 1, 1000),
    etag: successful
      ? cacheable
        ? (header(result.headers['etag']) ?? (result.status === 304 ? previous.etag : null))
        : null
      : previous.etag,
    lastModified: successful
      ? cacheable
        ? (header(result.headers['last-modified']) ??
          (result.status === 304 ? previous.lastModified : null))
        : null
      : previous.lastModified,
    latestPublishedAt:
      successful && result.snapshot
        ? result.snapshot.latestPublishedAt
        : previous.latestPublishedAt,
    cacheable: successful ? cacheable : previous.cacheable,
  };
  return deepFreeze({ state, status, freshness: feedFreshness(source, state, now) });
}
