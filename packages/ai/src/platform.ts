/**
 * The platform surface this package is allowed to touch, declared (WP-07).
 *
 * `@bunki/ai` runs in three places with three different globals: Node (tests
 * and any future server-side host), a browser (the Expo Web target), and React
 * Native. Rather than compile against a `lib` that promises all of them, the
 * package declares the *shape* of the four things it needs — `fetch`, an abort
 * controller, and a pair of timer functions — and takes them as arguments.
 *
 * This is the same seam `@bunki/domain` uses for clock/ID/randomness
 * (REQ-ARCH-02) applied one layer out, and it buys the same two things:
 *
 *   - a test can drive a timeout without a real ten-second wait, and can prove
 *     a call was aborted rather than merely abandoned;
 *   - **no test can accidentally reach the network.** The only `fetch` this
 *     package ever calls is the one it was handed. `test/no-live-calls.test.ts`
 *     asserts that the source contains no ambient network access at all.
 *
 * The ambient lookups below are the single exception, and they are guarded
 * reads of `globalThis` rather than bare identifiers, so importing this module
 * on a runtime that lacks one of them fails with a named error at the call site
 * instead of a `ReferenceError` at load time.
 */

import { AiTransportError } from './errors.ts';

// ---------------------------------------------------------------------------
// Structural platform types
// ---------------------------------------------------------------------------

/** The part of `AbortSignal` this package uses. Real `AbortSignal`s satisfy it. */
export interface AiAbortSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/** The part of `AbortController` this package uses. */
export interface AiAbortController {
  readonly signal: AiAbortSignal;
  abort(reason?: unknown): void;
}

export interface AiFetchInit {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly signal: AiAbortSignal;
}

/** The part of `Response` this package reads. */
export interface AiFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type AiFetch = (url: string, init: AiFetchInit) => Promise<AiFetchResponse>;

/** Opaque timer handle: a number in browsers, an object in Node. */
export type AiTimerHandle = unknown;

export interface AiTimers {
  /** Run `callback` after `delayMs`. Returns the handle `stop` cancels. */
  start(callback: () => void, delayMs: number): AiTimerHandle;
  stop(handle: AiTimerHandle): void;
}

/**
 * Everything ambient the bounded AI path needs, in one injected bag.
 *
 * `newAbortController` is a factory rather than a controller because one
 * request needs one controller; sharing one would let a timed-out request
 * cancel a later live one.
 */
export interface AiPlatform {
  readonly fetch: AiFetch;
  readonly timers: AiTimers;
  readonly newAbortController: () => AiAbortController;
}

// ---------------------------------------------------------------------------
// Guarded ambient lookups
// ---------------------------------------------------------------------------

interface AmbientGlobals {
  fetch?: unknown;
  setTimeout?: unknown;
  clearTimeout?: unknown;
  AbortController?: unknown;
  process?: { env?: Record<string, string | undefined> };
}

const ambient = (): AmbientGlobals => globalThis as AmbientGlobals;

/**
 * The environment, or an empty record.
 *
 * A browser bundle has no `process`, which is exactly why the Phase-0 web
 * target finds no API key and takes the fallback route — the honest outcome
 * (REQ-AI-03: secrets never enter a client bundle).
 */
export function ambientEnv(): Readonly<Record<string, string | undefined>> {
  return ambient().process?.env ?? {};
}

export function ambientFetch(): AiFetch {
  const found = ambient().fetch;
  if (typeof found !== 'function') {
    throw new AiTransportError('this runtime has no fetch implementation');
  }
  return found as AiFetch;
}

export function ambientTimers(): AiTimers {
  const start = ambient().setTimeout;
  const stop = ambient().clearTimeout;
  if (typeof start !== 'function' || typeof stop !== 'function') {
    throw new AiTransportError('this runtime has no timer functions');
  }
  return {
    start: (callback, delayMs) =>
      (start as (cb: () => void, ms: number) => unknown)(callback, delayMs),
    stop: (handle) => {
      (stop as (handle: unknown) => void)(handle);
    },
  };
}

export function ambientAbortControllerFactory(): () => AiAbortController {
  const found = ambient().AbortController;
  if (typeof found !== 'function') {
    throw new AiTransportError('this runtime has no AbortController');
  }
  const Constructor = found as new () => AiAbortController;
  return () => new Constructor();
}

/**
 * The platform of the current runtime.
 *
 * Called lazily by `createAiRuntime` only when the caller did not inject one,
 * so a test that injects everything never touches a global.
 */
export function ambientPlatform(): AiPlatform {
  return {
    fetch: ambientFetch(),
    timers: ambientTimers(),
    newAbortController: ambientAbortControllerFactory(),
  };
}

// ---------------------------------------------------------------------------
// Linking two abort signals
// ---------------------------------------------------------------------------

/**
 * Make `controller` abort when `upstream` does.
 *
 * Returns the detach function. Cancellation has two independent sources — the
 * timeout and the caller — and both must reach the same in-flight request, or
 * "cancellable" is only true of one of them (REQ-ARCH-06).
 */
export function linkAbort(
  upstream: AiAbortSignal | undefined,
  controller: AiAbortController,
): () => void {
  if (upstream === undefined) return () => undefined;
  if (upstream.aborted) {
    controller.abort();
    return () => undefined;
  }
  const forward = (): void => {
    controller.abort();
  };
  upstream.addEventListener('abort', forward);
  return () => {
    upstream.removeEventListener('abort', forward);
  };
}
