/**
 * The scripted learner's randomness (lane L1).
 *
 * A demonstration state has to be *messy* to be worth anything — the lapses,
 * the abandoned sitting, the correction, the long tail of words met once are
 * the whole point — and it has to be *reproducible*, or two runs disagree and a
 * screenshot stops being evidence of anything.
 *
 * Those two demands meet in a seeded stream. `createSeededRandom` in
 * `src/context/deterministic.ts` already provides one (mulberry32) and this is
 * deliberately built on top of it rather than beside it: there is one PRNG in
 * this kernel, and a second implementation would be a second sequence that
 * looks identical until the day it does not.
 *
 * What this module adds is the *vocabulary* a script needs — a coin flip with a
 * stated probability, a bounded integer, a weighted choice — each written so
 * the draw order is fixed. Draw order is the part that is easy to break: two
 * branches that consume a different number of values from the stream produce
 * two different futures from the same seed, so every helper below consumes
 * exactly one value per call, always, including on the early-return paths.
 *
 * The string seed is hashed with cyrb128's mixing step, so a stage can be
 * seeded by name (`'year-2'`) rather than by a magic number nobody can check
 * against anything.
 */

import { createSeededRandom } from '../context/deterministic.ts';

/**
 * A 32-bit hash of a seed string.
 *
 * cyrb128's avalanche, reduced to one word. It exists so that two stage names
 * that differ by one character produce unrelated streams; it is not a
 * cryptographic hash and nothing here needs one.
 */
export function hashSeed(seed: string): number {
  let h = 0x9e3779b9;
  for (let index = 0; index < seed.length; index += 1) {
    h = Math.imul(h ^ seed.charCodeAt(index), 0x85ebca6b);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 0x2545f491);
  return (h ^ (h >>> 15)) >>> 0;
}

export interface DemoRandom {
  /** The next value in `[0, 1)`. Every other method is one call to this. */
  readonly next: () => number;
  /** True with probability `p`. Consumes one value whatever `p` is. */
  readonly chance: (p: number) => boolean;
  /** An integer in `[min, max]`, inclusive. Consumes one value. */
  readonly int: (min: number, max: number) => number;
  /** One member of a non-empty list. Consumes one value. */
  readonly pick: <T>(items: readonly T[]) => T;
  /**
   * One key of a weight table, in declaration order.
   *
   * Weights need not sum to one; they are normalised. A table whose weights sum
   * to zero returns the first key rather than throwing — a stage whose grade
   * mix is all zeros is a script error, and taking the whole demonstration down
   * for it would be a worse answer than a visibly degenerate one.
   */
  readonly weighted: <K extends string>(weights: Readonly<Record<K, number>>) => K;
}

export function createDemoRandom(seed: string): DemoRandom {
  const source = createSeededRandom(hashSeed(seed));
  const next = (): number => source.nextUnitInterval();

  return {
    next,
    chance: (p) => next() < p,
    int: (min, max) => {
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      return low + Math.floor(next() * (high - low + 1));
    },
    pick: <T>(items: readonly T[]): T => {
      const value = next();
      const chosen = items[Math.floor(value * items.length)] ?? items[0];
      if (chosen === undefined) {
        throw new RangeError('createDemoRandom().pick was given an empty list');
      }
      return chosen;
    },
    weighted: <K extends string>(weights: Readonly<Record<K, number>>): K => {
      const keys = Object.keys(weights) as K[];
      const first = keys[0];
      if (first === undefined) {
        throw new RangeError('createDemoRandom().weighted was given an empty table');
      }
      const total = keys.reduce((sum, key) => sum + Math.max(0, weights[key]), 0);
      const value = next();
      if (total <= 0) return first;
      let cursor = value * total;
      for (const key of keys) {
        cursor -= Math.max(0, weights[key]);
        if (cursor < 0) return key;
      }
      return keys[keys.length - 1] ?? first;
    },
  };
}
