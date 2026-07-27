/**
 * The hand-written SHA-256, checked against the platform's (WP-03).
 *
 * Hand-rolled cryptographic primitives deserve suspicion, and this one is no
 * exception — which is exactly why it is not tested against hand-copied
 * constants. `node:crypto` is used here **as a test oracle only**: for every
 * input below, the implementation in `src/hash.ts` must agree digit for digit
 * with a mature implementation of the same algorithm.
 *
 * `src/hash.ts` itself imports nothing, because it has to run in React Native
 * where `node:crypto` does not exist. The oracle is available in the test
 * environment and nowhere else, which is the whole reason the implementation
 * cannot simply call it.
 *
 * The inputs are chosen to hit the places a from-scratch SHA-256 goes wrong:
 * empty input, exact block boundaries, the padding rollover at 56 and 64 bytes,
 * multi-byte UTF-8, surrogate pairs, and an input long enough to need many
 * chunks.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../src/hash.ts';

const oracle = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const inputs: readonly { readonly label: string; readonly text: string }[] = [
  { label: 'empty', text: '' },
  { label: 'one character', text: 'a' },
  { label: 'the canonical abc vector', text: 'abc' },
  // 55 / 56 / 57 bytes: the padding rollover. 56 is the largest message that
  // still fits its length field in the same block; 57 forces a second one.
  { label: '55 bytes', text: 'x'.repeat(55) },
  { label: '56 bytes', text: 'x'.repeat(56) },
  { label: '57 bytes', text: 'x'.repeat(57) },
  { label: 'exactly one block', text: 'x'.repeat(64) },
  { label: 'one block plus one', text: 'x'.repeat(65) },
  { label: 'multi-byte UTF-8', text: '峠を越えると視界が開けた' },
  { label: 'the canonical fixture target', text: '分岐' },
  { label: 'surrogate pair', text: 'a🌸b' },
  { label: 'mixed scripts and punctuation', text: 'ほら、"quotes" & <tags> — 分岐/branch\n\ttab' },
  { label: 'long', text: '分岐'.repeat(1000) },
  { label: 'json-shaped', text: JSON.stringify({ b: 2, a: [1, null, 'ξ'] }) },
];

describe('sha256Hex agrees with node:crypto', () => {
  inputs.forEach(({ label, text }) => {
    it(`matches for ${label}`, () => {
      expect(sha256Hex(text)).toBe(oracle(text));
    });
  });

  it('produces 64 hex characters for every input', () => {
    inputs.forEach(({ text }) => {
      expect(sha256Hex(text)).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it('separates inputs that differ by one character', () => {
    // A digest that collided here would silently turn a conflicting append into
    // an accepted no-op, which is the one failure the idempotency contract must
    // not have.
    expect(sha256Hex('分岐a')).not.toBe(sha256Hex('分岐b'));
  });
});
