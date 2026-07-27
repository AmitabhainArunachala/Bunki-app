/**
 * `DomainContext` — the injection seam for everything ambient (WP-02).
 *
 * REQ-ARCH-02 and REQ-DM-04.4 say the same thing from two directions: the
 * domain imports no clock, no network, no platform API, and replay is
 * deterministic. Those are the same requirement. A single `Date.now()` anywhere
 * under `packages/domain/src` would make two replays of one log disagree, and
 * every evidence claim in this product is a claim about a replayable log.
 *
 * So time, identity, and randomness arrive as arguments. The kernel declares
 * what it needs; the caller decides where it comes from — a real clock in the
 * app, a scripted one in a test, a recorded one in a golden fixture. Nothing in
 * this package ever asks the platform directly.
 *
 * `test/purity/no-ambient-nondeterminism.test.ts` enforces this by scanning the
 * source, so the rule survives a refactor that nobody reviews closely.
 */

import type { IsoInstant } from '../primitives.ts';

/** Wall-clock access, in the canonical wire form. */
export interface DomainClock {
  now(): IsoInstant;
}

/**
 * The kinds of identifier the kernel mints. Passing the kind lets a generator
 * produce readable ids (`thread-0003`) in tests and fixtures while a production
 * generator is free to ignore it and return an opaque unique string.
 */
export const DOMAIN_ID_KINDS = [
  'event',
  'encounter',
  'thread',
  'contract',
  'candidate',
  'session',
  'export',
] as const;

export type DomainIdKind = (typeof DOMAIN_ID_KINDS)[number];

export interface DomainIdGenerator {
  nextId(kind: DomainIdKind): string;
}

export interface DomainRandom {
  /** Uniformly distributed in `[0, 1)`. */
  nextUnitInterval(): number;
}

/**
 * The complete ambient surface of `@bunki/domain`. If a future reducer needs
 * something else from the outside world, it is added here — visibly, in one
 * place — rather than reached for at the call site.
 */
export interface DomainContext {
  readonly clock: DomainClock;
  readonly ids: DomainIdGenerator;
  readonly random: DomainRandom;
}

export {
  createDeterministicContext,
  createFixedClock,
  createScriptedClock,
  createSeededRandom,
  createSequentialIdGenerator,
} from './deterministic.ts';
