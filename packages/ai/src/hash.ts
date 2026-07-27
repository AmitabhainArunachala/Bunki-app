/**
 * `inputHash` — the content fingerprint the candidate envelope carries (WP-07).
 *
 * REQ-AI-03 requires the envelope to carry an "input content hash", and
 * controller §9 names the field. It does two jobs, and it is worth being clear
 * that neither is secrecy:
 *
 *   1. **Identity.** Two requests over the same input produce the same hash, so
 *      a repeat is recognisable as a repeat — the same property the event log's
 *      `idempotencyKey` provides one layer down.
 *   2. **Auditability without retention.** `CandidateAttached` records the hash,
 *      not the prompt. An inspector can prove "this candidate came from that
 *      input" without the event log holding the input text (controller §15).
 *
 * ## Why SHA-256 is implemented here rather than imported
 *
 * `node:crypto` does not exist in React Native; `crypto.subtle` is async, and
 * this value is computed on the synchronous path that builds a request. The two
 * plausible imports are both wrong for this package: a new dependency would
 * have to clear controller §14/§4's licence rule for forty lines of arithmetic,
 * and `@bunki/persistence` — which already has an identical function for its
 * idempotency digests — is a *storage* package whose entry point binds
 * `expo-sqlite`. Importing it here would pull a native database into the AI
 * adapter to borrow one pure function.
 *
 * So the arithmetic is duplicated, deliberately and visibly. **P2 for WP-10:**
 * lift one implementation into a shared pure utility owned by neither package.
 * Filed rather than fixed here because the shared home would have to be
 * `@bunki/domain`, whose surface belongs to another work package this wave.
 *
 * The UTF-8 encoding is done by hand for the same reason `TextEncoder` is not
 * assumed elsewhere in this package: it is present in Node and browsers, absent
 * or subtly different in older RN runtimes, and the digest has to compare equal
 * on every runtime this project claims.
 */

import { canonicalJson } from '@bunki/domain';

/**
 * UTF-8 bytes of a string.
 *
 * An unpaired surrogate is encoded as U+FFFD, which is what the WHATWG encoding
 * standard (and therefore `TextEncoder`, and therefore every other tool that
 * will ever hash the same string) does. Encoding it as-is would produce bytes no
 * conforming decoder accepts and a digest nothing else could reproduce.
 */
function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    let codePoint = text.charCodeAt(index);

    if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      const next = index + 1 < text.length ? text.charCodeAt(index + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = (codePoint - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        index += 1;
      } else {
        codePoint = 0xfffd;
      }
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      codePoint = 0xfffd;
    }

    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }

  return bytes;
}

/** FIPS 180-4 round constants: cube roots of the first 64 primes. */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const rotr = (value: number, bits: number): number =>
  ((value >>> bits) | (value << (32 - bits))) >>> 0;

const at = (values: readonly number[] | Int32Array | Uint32Array, index: number): number => {
  const value = values[index];
  return value === undefined ? 0 : value;
};

/** SHA-256 of a string's UTF-8 bytes, lower-case hex. */
export function sha256Hex(text: string): string {
  const bytes = utf8Bytes(text);
  const bitLength = bytes.length * 8;

  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);

  // Length as a 64-bit big-endian count of bits. The high word is computed with
  // division rather than a shift: `<<` coerces to 32 bits and would silently
  // truncate any input over 512 MiB.
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  bytes.push(
    (high >>> 24) & 0xff,
    (high >>> 16) & 0xff,
    (high >>> 8) & 0xff,
    high & 0xff,
    (low >>> 24) & 0xff,
    (low >>> 16) & 0xff,
    (low >>> 8) & 0xff,
    low & 0xff,
  );

  // Square roots of the first eight primes.
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] =
        ((at(bytes, offset + i * 4) << 24) |
          (at(bytes, offset + i * 4 + 1) << 16) |
          (at(bytes, offset + i * 4 + 2) << 8) |
          at(bytes, offset + i * 4 + 3)) >>>
        0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(at(w, i - 15), 7) ^ rotr(at(w, i - 15), 18) ^ (at(w, i - 15) >>> 3);
      const s1 = rotr(at(w, i - 2), 17) ^ rotr(at(w, i - 2), 19) ^ (at(w, i - 2) >>> 10);
      w[i] = (at(w, i - 16) + s0 + at(w, i - 7) + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + at(K, i) + at(w, i)) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
}

/**
 * The fingerprint of one request's input.
 *
 * Canonical JSON first (`@bunki/domain`'s, the same serialiser replay and export
 * compare bytes with), so the hash depends on the *content* of the input and not
 * on the order a caller happened to build the object.
 */
export function inputHashOf(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
