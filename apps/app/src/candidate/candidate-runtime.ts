/**
 * Building the app's AI runtime (WP-07).
 *
 * The app assembles what `@bunki/ai` needs and nothing more: a provider, a
 * clock, an id source, and the seeded allowlist. It does not decide what a
 * timeout is, when a fallback is served, or what a candidate looks like — those
 * are the adapter's, and duplicating them here would give the product two
 * answers to one question.
 *
 * ## The key, on this runtime
 *
 * `ambientEnv()` reads `globalThis.process?.env` behind a guard, inside
 * `@bunki/ai`. On the Phase-0 Expo Web target there is no `process`, so the
 * environment is empty, the provider finds no key, and every request takes the
 * labelled `offline-fallback` route. That is the correct outcome, not a
 * degraded one: REQ-AI-03 says a secret never enters a client bundle, and a web
 * build that *could* hold one would be the violation.
 *
 * The consequence for the operator, stated plainly: the live route is exercised
 * by a host that has an environment — a script, a test runner, or a future
 * server-side gateway. Live-call evidence is an open gate (OD-08) and is
 * recorded as such in the build capsule.
 */

import {
  ambientEnv,
  ambientFetch,
  createAiRuntime,
  createAnthropicProvider,
  createAiRouteRing,
  API_KEY_ENV_VAR,
  type AiProviderPort,
  type AiRouteRing,
  type AiRuntime,
  type AiRuntimeClock,
  type AiTelemetrySink,
} from '@bunki/ai';
import type { DomainContext } from '@bunki/domain';

import { seededContentPolicy } from './candidate-context.ts';

/**
 * The runtime clock.
 *
 * `now()` comes from the same injected `DomainContext` the store uses, so a
 * candidate's `createdAt` and the events around it share one clock and the
 * screenshot harness can pin both. `elapsedMs` is latency only and never
 * reaches an event, which is why an ambient `Date.now()` is acceptable there
 * and nowhere else.
 */
export function createCandidateClock(
  context: DomainContext,
  elapsed: () => number = () => Date.now(),
): AiRuntimeClock {
  return { now: () => context.clock.now(), elapsedMs: elapsed };
}

export interface CandidateRuntimeOptions {
  readonly context: DomainContext;
  /** Overridden by tests and the evidence harness; the app reads its own. */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  readonly provider?: AiProviderPort | undefined;
  readonly telemetry?: AiTelemetrySink | undefined;
}

/** True when this runtime can even attempt a live call. Rendered, never assumed. */
export function hasApiKey(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env[API_KEY_ENV_VAR];
  return value !== undefined && value.trim() !== '';
}

export function createCandidateRuntime(options: CandidateRuntimeOptions): AiRuntime {
  const env = options.env ?? ambientEnv();
  return createAiRuntime({
    // `ambientFetch()` is `@bunki/ai`'s own guarded lookup, so `apps/app` names
    // no network API anywhere. It is called *per request*, not once at
    // construction: a runtime that has no transport must still build, so that
    // the missing transport surfaces as one labelled fallback per request
    // rather than as an exception while a screen is mounting.
    provider:
      options.provider ??
      createAnthropicProvider({ fetch: (url, init) => ambientFetch()(url, init), env }),
    clock: createCandidateClock(options.context),
    nextCandidateId: () => options.context.ids.nextId('candidate'),
    contentPolicy: seededContentPolicy(),
    ...(options.telemetry === undefined ? {} : { telemetry: options.telemetry }),
  });
}

/**
 * The app's route ring (controller §12).
 *
 * Held here rather than in the inspector so that WP-09 can read it without this
 * slice importing an inspector file — see the coordination note in the build
 * capsule. Records are route metadata only; the sink rejects anything else.
 */
export function createCandidateRouteRing(capacity = 50): AiRouteRing {
  return createAiRouteRing(capacity);
}
