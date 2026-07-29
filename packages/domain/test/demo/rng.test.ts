/**
 * The seeded stream (lane L1).
 *
 * Determinism is the property the whole demonstration rests on, and it is the
 * one that fails silently: a helper that consumes a different number of values
 * on one branch than on another still produces *a* sequence, just not the same
 * one twice. So the tests below check the sequence rather than the distribution
 * — the distribution only has to be plausible, and the sequence has to be
 * identical.
 */

import { describe, expect, it } from 'vitest';

import { createDemoRandom, hashSeed } from '../../src/demo/rng.ts';

const take = (seed: string, count: number): readonly number[] => {
  const rng = createDemoRandom(seed);
  return Array.from({ length: count }, () => rng.next());
};

describe('the stream is a function of its seed', () => {
  it('produces the same values twice for one seed', () => {
    expect(take('year-2', 64)).toEqual(take('year-2', 64));
  });

  it('produces different values for a seed that differs by one character', () => {
    expect(take('year-2', 32)).not.toEqual(take('year-3', 32));
  });

  it('stays inside [0, 1)', () => {
    for (const value of take('bunki', 2048)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('hashes a seed string to a 32-bit unsigned value', () => {
    expect(hashSeed('a')).toBe(hashSeed('a'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
    expect(Number.isInteger(hashSeed('bunki:demo:year-2'))).toBe(true);
    expect(hashSeed('bunki:demo:year-2')).toBeGreaterThanOrEqual(0);
    expect(hashSeed('bunki:demo:year-2')).toBeLessThan(2 ** 32);
  });
});

describe('every helper consumes exactly one value', () => {
  /**
   * The property that makes a branch safe.
   *
   * If `chance` consumed a value on one path and not on the other, two runs
   * whose first coin flip differed would diverge for the rest of the script —
   * which is a real defect that produces plausible output, so it has to be
   * tested by counting rather than by looking at the result.
   */
  it('advances the stream by one whatever the branch taken', () => {
    const reference = take('draw-order', 8);

    const always = createDemoRandom('draw-order');
    always.chance(1);
    expect(always.next()).toBe(reference[1]);

    const never = createDemoRandom('draw-order');
    never.chance(0);
    expect(never.next()).toBe(reference[1]);

    const integer = createDemoRandom('draw-order');
    integer.int(3, 3);
    expect(integer.next()).toBe(reference[1]);

    const picked = createDemoRandom('draw-order');
    picked.pick(['only']);
    expect(picked.next()).toBe(reference[1]);

    const weighted = createDemoRandom('draw-order');
    weighted.weighted({ a: 1, b: 0 });
    expect(weighted.next()).toBe(reference[1]);
  });
});

describe('the helpers mean what they say', () => {
  it('bounds an integer inclusively at both ends', () => {
    const rng = createDemoRandom('ints');
    const seen = new Set<number>();
    for (let index = 0; index < 4000; index += 1) seen.add(rng.int(2, 5));
    expect([...seen].sort((left, right) => left - right)).toEqual([2, 3, 4, 5]);
  });

  it('never returns a zero-weight key', () => {
    const rng = createDemoRandom('weights');
    for (let index = 0; index < 2000; index += 1) {
      expect(rng.weighted({ again: 0, hard: 0, good: 1, easy: 0 })).toBe('good');
    }
  });

  it('follows the weights it is given, roughly', () => {
    const rng = createDemoRandom('mix');
    const counts = { again: 0, hard: 0, good: 0, easy: 0 };
    for (let index = 0; index < 20_000; index += 1) {
      counts[rng.weighted({ again: 10, hard: 20, good: 60, easy: 10 })] += 1;
    }
    // Loose bounds: this asserts the table is honoured, not that the PRNG is
    // uniform to any particular standard.
    expect(counts.good / 20_000).toBeGreaterThan(0.55);
    expect(counts.good / 20_000).toBeLessThan(0.65);
    expect(counts.again / 20_000).toBeGreaterThan(0.05);
    expect(counts.again / 20_000).toBeLessThan(0.15);
  });

  it('degenerates visibly rather than throwing on an all-zero table', () => {
    const rng = createDemoRandom('zero');
    expect(rng.weighted({ again: 0, hard: 0, good: 0, easy: 0 })).toBe('again');
  });

  it('refuses an empty list and an empty table', () => {
    const rng = createDemoRandom('empty');
    expect(() => rng.pick([])).toThrow(RangeError);
    expect(() => rng.weighted({})).toThrow(RangeError);
  });
});
