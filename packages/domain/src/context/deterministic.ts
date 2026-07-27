/**
 * Deterministic `DomainContext` implementations (WP-02).
 *
 * These ship in `src/`, not `test/`, on purpose. The golden-replay gate (T-03,
 * controller §6.3) has to run the *same* deterministic context across every
 * adapter — in-memory here at WP-02, the sqlite and web adapters at WP-03, a
 * real device at WP-11. A context that only existed in this package's tests
 * could not be handed to those runtimes, and each would grow its own slightly
 * different one. One shared implementation is what makes "identical derived
 * state across runtimes" a checkable claim rather than a hope.
 *
 * The production context — a real clock, a real unique-id source — is built
 * *outside* this package, in the app/persistence layer, and injected. That is
 * the whole point of the seam; see `./index.ts`.
 */

import { EventValidationError } from '../errors.ts';
import { isValidIsoInstant, type IsoInstant } from '../primitives.ts';
import type {
  DomainClock,
  DomainContext,
  DomainIdGenerator,
  DomainIdKind,
  DomainRandom,
} from './index.ts';

/** A clock frozen at one instant. Every `now()` returns it. */
export function createFixedClock(instant: IsoInstant): DomainClock {
  if (!isValidIsoInstant(instant)) {
    throw new EventValidationError('DomainClock', [
      {
        path: 'instant',
        message: `${JSON.stringify(instant)} is not a canonical ISO-8601 UTC instant`,
      },
    ]);
  }
  return { now: () => instant };
}

/**
 * A clock that hands out a prepared list of instants in order.
 *
 * Running out throws rather than repeating the last value or drifting forward.
 * A test that consumed more instants than it declared has changed shape, and
 * quietly reusing a timestamp would hide exactly the ordering bug the fixture
 * was written to catch.
 */
export function createScriptedClock(instants: readonly IsoInstant[]): DomainClock {
  instants.forEach((instant, index) => {
    if (!isValidIsoInstant(instant)) {
      throw new EventValidationError('DomainClock', [
        {
          path: `instants[${index}]`,
          message: `${JSON.stringify(instant)} is not a canonical ISO-8601 UTC instant`,
        },
      ]);
    }
  });

  let cursor = 0;
  return {
    now(): IsoInstant {
      const instant = instants[cursor];
      if (instant === undefined) {
        throw new EventValidationError('DomainClock', [
          {
            path: 'instants',
            message: `scripted clock exhausted after ${instants.length} reading(s)`,
          },
        ]);
      }
      cursor += 1;
      return instant;
    },
  };
}

/**
 * Sequential, human-readable identifiers: `thread-0001`, `event-0007`.
 *
 * Counters are per-kind so that adding an event to the middle of a fixture does
 * not renumber every thread id in its expected-state snapshot — a golden file
 * whose diff is 200 lines of renaming is a golden file nobody reads.
 */
export function createSequentialIdGenerator(
  options: { prefix?: string; width?: number } = {},
): DomainIdGenerator {
  const prefix = options.prefix ?? '';
  const width = options.width ?? 4;
  const counters = new Map<DomainIdKind, number>();

  return {
    nextId(kind: DomainIdKind): string {
      const next = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, next);
      return `${prefix}${kind}-${String(next).padStart(width, '0')}`;
    },
  };
}

/**
 * A seeded PRNG (mulberry32): 32-bit state, no ambient entropy, identical
 * sequence for a given seed on every runtime.
 *
 * Phase 0 has no randomised domain behaviour yet, so this exists to keep the
 * `DomainContext` seam honest and complete: the day something needs a random
 * choice, the seam is already there and already deterministic, instead of a
 * `Math.random()` appearing at the call site because the alternative was
 * inconvenient.
 */
export function createSeededRandom(seed: number): DomainRandom {
  let state = seed >>> 0;
  return {
    nextUnitInterval(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export interface DeterministicContextOptions {
  /** A single frozen instant, or a script consumed in order. */
  readonly instants: IsoInstant | readonly IsoInstant[];
  readonly idPrefix?: string;
  readonly seed?: number;
}

/** Convenience constructor for the whole triple. */
export function createDeterministicContext(options: DeterministicContextOptions): DomainContext {
  const clock = Array.isArray(options.instants)
    ? createScriptedClock(options.instants as readonly IsoInstant[])
    : createFixedClock(options.instants as IsoInstant);

  return {
    clock,
    ids: createSequentialIdGenerator(
      options.idPrefix === undefined ? {} : { prefix: options.idPrefix },
    ),
    random: createSeededRandom(options.seed ?? 0x5eed),
  };
}
