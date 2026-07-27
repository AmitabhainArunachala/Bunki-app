/**
 * The production `DomainContext` (WP-05).
 *
 * `@bunki/domain` imports no clock, no id source and no randomness — they are
 * injected (REQ-ARCH-02), and this is the app-side end of that seam. It is the
 * only place in `apps/app` that reads the ambient **wall** clock or generates
 * an id — the only place, therefore, that an event's `occurredAt` can come
 * from.
 *
 * WP-09 added a second reader of a different thing:
 * `src/observability/index.ts` reads a **monotonic counter**
 * (`performance.now()`) for latency figures. That is not a clock and cannot
 * become one — it has no epoch and no timezone, so it cannot produce an
 * `occurredAt` even by accident — and a duration has to be measured on a
 * monotonic source or it can come out negative. The distinction is spelled out
 * in that file's header; the sentence above is narrowed rather than left to go
 * quietly false.
 *
 * The generators take their dependencies as arguments and default to the
 * platform ones, so a test (and the screenshot harness, which must produce
 * byte-identical pages on two runs) can pin them without patching globals.
 */

import type { DomainClock, DomainContext, DomainIdGenerator, DomainRandom } from '@bunki/domain';

/** Wall clock in the canonical `YYYY-MM-DDTHH:mm:ss.sssZ` form the kernel requires. */
export function createSystemClock(now: () => number = Date.now): DomainClock {
  return { now: () => new Date(now()).toISOString() };
}

/**
 * Unique ids for one app session.
 *
 * A per-session prefix plus a per-kind counter. The prefix keeps two sessions
 * from minting the same id while the Phase-0 store is in memory; a real
 * cross-device id scheme is a persistence concern (WP-03) and is deliberately
 * not invented here.
 */
export function createSessionIdGenerator(
  sessionPrefix: string,
  counters: Map<string, number> = new Map(),
): DomainIdGenerator {
  return {
    nextId(kind) {
      const next = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, next);
      return `${kind}-${sessionPrefix}-${String(next).padStart(4, '0')}`;
    },
  };
}

export function createSystemRandom(random: () => number = Math.random): DomainRandom {
  return { nextUnitInterval: random };
}

/** A short, URL-safe session tag derived from the injected randomness. */
export function createSessionPrefix(random: () => number = Math.random): string {
  return Math.floor(random() * 0xffffff)
    .toString(36)
    .padStart(5, '0');
}

export interface RuntimeContextOptions {
  readonly now?: (() => number) | undefined;
  readonly random?: (() => number) | undefined;
  /** Pin the session tag; the screenshot harness does, so ids are reproducible. */
  readonly sessionPrefix?: string | undefined;
}

export function createRuntimeContext(options: RuntimeContextOptions = {}): DomainContext {
  const random = options.random ?? Math.random;
  return {
    clock: createSystemClock(options.now ?? Date.now),
    ids: createSessionIdGenerator(options.sessionPrefix ?? createSessionPrefix(random)),
    random: createSystemRandom(random),
  };
}
