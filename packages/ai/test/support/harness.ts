/**
 * Test doubles for the bounded AI path (WP-07).
 *
 * Everything ambient is injected, so this file is the whole surface a test has
 * to control: a clock that does not tick on its own, timers that only fire when
 * a test says so, an abort controller with no platform behind it, and a `fetch`
 * that is a function a test wrote.
 *
 * The last one is the important one. **No test in this package may reach the
 * network** (controller §9: live-call evidence stays open until OD-08). Every
 * harness here is inert by construction — `fakeFetch` has no transport in it at
 * all — and `no-live-calls.test.ts` proves the source never falls back to an
 * ambient one.
 */

import type {
  AiAbortController,
  AiAbortSignal,
  AiFetch,
  AiFetchInit,
  AiFetchResponse,
  AiPlatform,
  AiTimerHandle,
} from '../../src/platform.ts';
import type { AiRuntimeClock } from '../../src/runtime.ts';

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export interface ScriptedClock extends AiRuntimeClock {
  /** Move the latency counter forward. Does not fire timers. */
  advance(ms: number): void;
  /** Set the instant returned by `now()`. */
  setInstant(instant: string): void;
}

export function createScriptedClock(
  instant = '2026-07-27T09:00:00.000Z',
  startMs = 0,
): ScriptedClock {
  let current = instant;
  let elapsed = startMs;
  return {
    now: () => current,
    elapsedMs: () => elapsed,
    advance: (ms) => {
      elapsed += ms;
    },
    setInstant: (next) => {
      current = next;
    },
  };
}

export function createIdSequence(prefix = 'candidate'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${String(n).padStart(4, '0')}`;
  };
}

// ---------------------------------------------------------------------------
// Abort
// ---------------------------------------------------------------------------

/** A structural `AbortController`, with no platform behind it. */
export function createFakeAbortController(): AiAbortController {
  const listeners = new Set<() => void>();
  let aborted = false;
  const signal: AiAbortSignal = {
    get aborted() {
      return aborted;
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
  };
  return {
    signal,
    abort() {
      if (aborted) return;
      aborted = true;
      for (const listener of [...listeners]) listener();
    },
  };
}

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------

export interface ManualTimers {
  start(callback: () => void, delayMs: number): AiTimerHandle;
  stop(handle: AiTimerHandle): void;
  /** Fire every pending timer whose delay is ≤ `ms`. */
  fireDue(ms: number): void;
  /** Fire everything still pending, whatever its delay. */
  fireAll(): void;
  readonly pending: number;
}

export function createManualTimers(): ManualTimers {
  interface Entry {
    readonly callback: () => void;
    readonly delayMs: number;
  }
  const entries = new Map<number, Entry>();
  let next = 0;

  return {
    start(callback, delayMs) {
      next += 1;
      entries.set(next, { callback, delayMs });
      return next;
    },
    stop(handle) {
      if (typeof handle === 'number') entries.delete(handle);
    },
    fireDue(ms) {
      for (const [id, entry] of [...entries]) {
        if (entry.delayMs <= ms) {
          entries.delete(id);
          entry.callback();
        }
      }
    },
    fireAll() {
      for (const [id, entry] of [...entries]) {
        entries.delete(id);
        entry.callback();
      }
    },
    get pending() {
      return entries.size;
    },
  };
}

// ---------------------------------------------------------------------------
// fetch
// ---------------------------------------------------------------------------

export interface RecordedCall {
  readonly url: string;
  readonly init: AiFetchInit;
}

export interface FakeFetch {
  readonly fetch: AiFetch;
  readonly calls: readonly RecordedCall[];
  /** The parsed JSON body of call `index`. */
  bodyOf(index?: number): Record<string, unknown>;
}

export type FetchBehaviour =
  | { readonly kind: 'json'; readonly status?: number; readonly body: unknown }
  | { readonly kind: 'not-json'; readonly status?: number }
  | { readonly kind: 'throw'; readonly error: Error }
  /** Never settles until aborted — the hung-call case (T-11). */
  | { readonly kind: 'hang' };

/**
 * A `fetch` with no transport.
 *
 * The `hang` behaviour rejects when (and only when) the injected signal aborts,
 * which is how a real client behaves and is what makes the timeout test a test
 * of cancellation rather than of a race.
 */
export function createFakeFetch(behaviour: FetchBehaviour): FakeFetch {
  const calls: RecordedCall[] = [];

  const fetch: AiFetch = (url, init) => {
    calls.push({ url, init });

    if (behaviour.kind === 'throw') return Promise.reject(behaviour.error);

    if (behaviour.kind === 'hang') {
      return new Promise<AiFetchResponse>((_resolve, reject) => {
        const onAbort = (): void => {
          init.signal.removeEventListener('abort', onAbort);
          reject(new Error('AbortError'));
        };
        if (init.signal.aborted) onAbort();
        else init.signal.addEventListener('abort', onAbort);
      });
    }

    const status = behaviour.status ?? 200;
    const ok = status >= 200 && status < 300;

    if (behaviour.kind === 'not-json') {
      return Promise.resolve({
        ok,
        status,
        json: () => Promise.reject(new Error('not json')),
      });
    }

    return Promise.resolve({ ok, status, json: () => Promise.resolve(behaviour.body) });
  };

  return {
    fetch,
    calls,
    bodyOf(index = 0) {
      const call = calls[index];
      if (call === undefined) throw new Error(`no fetch call at index ${String(index)}`);
      return JSON.parse(call.init.body) as Record<string, unknown>;
    },
  };
}

/** A well-formed Messages API answer, for the happy path. */
export function messagesResponse(
  text: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 210, output_tokens: 96 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

export interface TestPlatform extends AiPlatform {
  readonly timers: ManualTimers;
  readonly controllers: readonly AiAbortController[];
}

export function createTestPlatform(fetch: AiFetch): TestPlatform {
  const timers = createManualTimers();
  const controllers: AiAbortController[] = [];
  return {
    fetch,
    timers,
    controllers,
    newAbortController() {
      const controller = createFakeAbortController();
      controllers.push(controller);
      return controller;
    },
  };
}
