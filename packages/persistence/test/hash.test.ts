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
import { describe, expect, it, vi } from 'vitest';

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

/**
 * The digest streams its bytes through a 64 KiB buffer, and for well-formed
 * text lets the platform's encoder produce them. Neither is allowed to change a
 * single digest. The oracle below encodes by the module's own stated rule
 * (a paired surrogate is one four-byte code point; an unpaired one keeps its
 * own three bytes) and hashes the bytes with node:crypto, so it also covers the
 * text node:crypto itself would rewrite.
 */
function bytesOf(text: string): Buffer {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    let code = text.charCodeAt(index);
    const next = text.charCodeAt(index + 1);
    if (code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      code = (code - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
      index += 1;
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return Buffer.from(bytes);
}
const byteOracle = (text: string): string =>
  createHash('sha256').update(bytesOf(text)).digest('hex');

function streamedInputs(): string[] {
  const texts: string[] = ['\ud800', '\udc00', 'a\ud800', '\ud800a', '\udc00\ud800', '\ud83d'];
  // Every position of a 1, 2, 3 and 4 byte character, and of an unpaired surrogate, across the buffer's edge.
  for (const fill of ['a', 'é', 'あ', '😀', '\udfff', '\ud800'])
    for (let shift = -6; shift <= 6; shift += 1)
      texts.push('x'.repeat(65_536 + shift) + fill.repeat(9) + 'y'.repeat(70));
  // The padding rollover when the last bytes fill the buffer exactly, and just short of it.
  for (const length of [65_536 - 72, 65_536 - 71, 65_536 - 9, 65_536 - 8, 65_536, 2 * 65_536])
    texts.push('z'.repeat(length));
  // Long mixed text, well formed and not.
  let seed = 7;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let round = 0; round < 6; round += 1) {
    let text = '';
    for (let index = 0; index < 90_000; index += 1) {
      const roll = random();
      text +=
        roll < 0.6
          ? String.fromCharCode(32 + Math.floor(random() * 90))
          : roll < 0.85
            ? String.fromCharCode(0x3041 + Math.floor(random() * 80))
            : roll < 0.95 || round % 2 === 0
              ? String.fromCodePoint(0x1f300 + Math.floor(random() * 500))
              : String.fromCharCode(0xd800 + Math.floor(random() * 0x800));
    }
    texts.push(text);
  }
  return texts;
}

describe('sha256Hex streams and encodes without changing a digest', () => {
  it('agrees with the byte oracle on text that crosses the buffer, well formed or not', () => {
    for (const text of streamedInputs()) expect(sha256Hex(text)).toBe(byteOracle(text));
  });

  it('the byte oracle is node:crypto wherever node:crypto keeps the text as it is', () => {
    for (const { text } of inputs) expect(byteOracle(text)).toBe(oracle(text));
    // Control: on an unpaired surrogate the two oracles part, which is why the byte oracle exists.
    expect(byteOracle('\ud800')).not.toBe(oracle('\ud800'));
  });

  it('gives the same digests with no platform encoder at all', async () => {
    vi.resetModules();
    vi.stubGlobal('TextEncoder', undefined);
    try {
      const byHand = (await import('../src/hash.ts')).sha256Hex;
      expect(byHand).not.toBe(sha256Hex);
      for (const { text } of inputs) expect(byHand(text)).toBe(oracle(text));
      for (const text of streamedInputs()) expect(byHand(text)).toBe(byteOracle(text));
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('does not trust an encoder that leaves part of the text unread', async () => {
    vi.resetModules();
    class Short {
      encodeInto(source: string, destination: Uint8Array) {
        const part = source.slice(0, Math.max(0, source.length - 1));
        return {
          read: part.length,
          written: new TextEncoder().encodeInto(part, destination).written,
        };
      }
    }
    const Real = TextEncoder;
    vi.stubGlobal('TextEncoder', Short);
    try {
      const guarded = (await import('../src/hash.ts')).sha256Hex;
      vi.stubGlobal('TextEncoder', Real);
      for (const text of ['abc', '分岐'.repeat(40_000), 'x'.repeat(200_000)])
        expect(guarded(text)).toBe(oracle(text));
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});

describe('sha256Hex and platform functions that are replaced', () => {
  it('stays right when the functions it took call back into it', async () => {
    vi.resetModules();
    const fresh = (await import('../src/hash.ts')).sha256Hex;
    const strings = String.prototype as unknown as { isWellFormed: () => boolean };
    const wellFormed = strings.isWellFormed;
    const Real = TextEncoder;
    let inside = false;
    let reentered = 0;
    const reenter = (text: string) => {
      if (inside) return;
      inside = true;
      try {
        reentered += 1;
        // A digest begun in the middle of another must not disturb it, and must itself be right.
        expect(fresh(text)).toBe(oracle(text));
      } finally {
        inside = false;
      }
    };
    strings.isWellFormed = function isWellFormed(this: string) {
      reenter('from the well-formedness test');
      return wellFormed.call(this);
    };
    class Reentrant {
      encodeInto(source: string, destination: Uint8Array) {
        reenter('from the encoder, 分岐'.repeat(3_000));
        return new Real().encodeInto(source, destination);
      }
    }
    vi.stubGlobal('TextEncoder', Reentrant);
    try {
      for (const text of [
        '',
        'abc',
        '分岐'.repeat(50_000),
        'x'.repeat(70_000),
        'a🌸b'.repeat(30_000),
      ])
        expect(fresh(text)).toBe(oracle(text));
      expect(reentered).toBeGreaterThan(5);
    } finally {
      strings.isWellFormed = wellFormed;
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('does not see a replacement made after its first digest', () => {
    expect(sha256Hex('first use')).toBe(oracle('first use'));
    const strings = String.prototype as unknown as { isWellFormed: () => boolean };
    const wellFormed = strings.isWellFormed;
    let called = 0;
    strings.isWellFormed = function isWellFormed() {
      called += 1;
      return true; // a lie for the text below: it has an unpaired surrogate
    };
    try {
      expect(sha256Hex('a\ud800b')).toBe(byteOracle('a\ud800b'));
      expect(called).toBe(0);
    } finally {
      strings.isWellFormed = wellFormed;
    }
  });
});
