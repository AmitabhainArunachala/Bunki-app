/**
 * SHA-256, in plain TypeScript (WP-03).
 *
 * ## Why this file exists at all
 *
 * The store has to answer "is this the same batch as the one I already applied?"
 * The obvious implementation — keep the batch's canonical JSON and compare
 * strings — was the first one written here, and it was **wrong in a way that
 * only the purge test could find**: it meant the idempotency table held a
 * verbatim copy of every event ever appended, including the learner's encounter
 * text. A purge then emptied `bunki_events` and left the same text sitting in
 * `bunki_append_batches`, so the store reported a completed deletion while the
 * bytes were still on disk one table over.
 *
 * Storing a digest instead removes the copy. (Purging also drops the batch rows
 * that reference purged events, so not even the digest of deleted content is
 * kept — see the adapters. Two mechanisms, because a deletion feature that is
 * only as good as one of them is a deletion feature with a single point of
 * failure.)
 *
 * ## Why it is implemented rather than imported
 *
 * `node:crypto` does not exist in React Native, and `crypto.subtle` is async and
 * unavailable in some of the runtimes this package must work in. A dependency
 * would also have to clear controller §4's licence rule for a function this
 * small. So: 60 lines of arithmetic, no platform API, identical output on every
 * runtime — which the adapters need anyway, since the same digest has to compare
 * equal on a device and in CI.
 *
 * UTF-8 encoding is defined by hand for the same reason: `TextEncoder` is
 * present in Node and in browsers, but relying on it would make the digest
 * depend on a global this package is otherwise careful not to need. Where a
 * platform encoder exists it is used only as a faster way to the same bytes,
 * and only for well-formed text, whose UTF-8 form is unique. Text with an
 * unpaired surrogate, and every runtime without the encoder, takes the
 * hand-written path below, which remains the definition.
 *
 * ## Why it streams through typed arrays
 *
 * A learner's whole record is hashed several times for each saved answer. The
 * first version built one plain array holding every byte of the text and read
 * it back through nullish fallbacks. On a year-old record that was most of the
 * time a grade took. This version encodes into a fixed 64 KiB block buffer and
 * folds full blocks as it goes, with the same bytes in and the same digest out.
 * One set of scratch buffers is shared, because the function is synchronous. A
 * digest that begins while another is in progress (only possible if a replaced
 * platform function calls back in) takes buffers of its own.
 */

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const INITIAL = new Int32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const BLOCK = 64;
const CAPACITY = 1024 * BLOCK;
/** Room that must stay free before a character is encoded: one code point is at most 4 bytes. */
const CODE_POINT = 4;
/** Room the closing padding can need: the marker byte, up to 63 zeros and the 8 length bytes. */
const PADDING = 1 + 63 + 8;

interface Scratch {
  readonly buffer: Uint8Array;
  readonly schedule: Int32Array;
  readonly state: Int32Array;
}
const scratch = (): Scratch => ({
  buffer: new Uint8Array(CAPACITY),
  schedule: new Int32Array(64),
  state: new Int32Array(8),
});
const shared = scratch();
let busy = false;

/** Fold the first `blocks` full blocks of the buffer into the state. */
function compress(work: Scratch, blocks: number): void {
  const w = work.schedule;
  const bytes = work.buffer;
  const state = work.state;
  let h0 = state[0] as number;
  let h1 = state[1] as number;
  let h2 = state[2] as number;
  let h3 = state[3] as number;
  let h4 = state[4] as number;
  let h5 = state[5] as number;
  let h6 = state[6] as number;
  let h7 = state[7] as number;
  for (let offset = 0, end = blocks * BLOCK; offset < end; offset += BLOCK) {
    for (let i = 0, at = offset; i < 16; i += 1, at += 4) {
      w[i] =
        ((bytes[at] as number) << 24) |
        ((bytes[at + 1] as number) << 16) |
        ((bytes[at + 2] as number) << 8) |
        (bytes[at + 3] as number);
    }
    for (let i = 16; i < 64; i += 1) {
      const x = w[i - 15] as number;
      const y = w[i - 2] as number;
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) | 0;
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
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const temp1 = (h + s1 + ((e & f) ^ (~e & g)) + (K[i] as number) + (w[i] as number)) | 0;
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const temp2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }
  state[0] = h0;
  state[1] = h1;
  state[2] = h2;
  state[3] = h3;
  state[4] = h4;
  state[5] = h5;
  state[6] = h6;
  state[7] = h7;
}

/** Fold every full block waiting in the buffer and move the remainder to its start. */
function drain(work: Scratch, used: number): number {
  const blocks = Math.floor(used / BLOCK);
  if (blocks === 0) return used;
  compress(work, blocks);
  work.buffer.copyWithin(0, blocks * BLOCK, used);
  return used - blocks * BLOCK;
}

type EncodeInto = (source: string, destination: Uint8Array) => { read: number; written: number };
interface Platform {
  readonly encoder: object;
  readonly encodeInto: EncodeInto;
  readonly isWellFormed: () => boolean;
}
/** UTF-16 units handed to the platform encoder at once: at most 3 bytes each, beside a partial block. */
const STEP = Math.floor((CAPACITY - BLOCK) / 3);
let platform: Platform | null | undefined;

/**
 * The platform's encoder and its well-formedness test, taken once, the first
 * time a digest is asked for. Later replacements of either are not seen.
 */
function platformFor(text: string): Platform | null {
  if (platform === undefined) {
    platform = null;
    const Encoder = (globalThis as { TextEncoder?: new () => { encodeInto?: EncodeInto } })
      .TextEncoder;
    const isWellFormed = (String.prototype as { isWellFormed?: () => boolean }).isWellFormed;
    if (typeof Encoder === 'function' && typeof isWellFormed === 'function') {
      const encoder = new Encoder();
      if (typeof encoder.encodeInto === 'function')
        platform = { encoder, encodeInto: encoder.encodeInto, isWellFormed };
    }
  }
  return platform !== null && platform.isWellFormed.call(text) ? platform : null;
}

/** Hex SHA-256 of a string. Deterministic on every runtime. */
export function sha256Hex(text: string): string {
  // The platform is consulted before any shared state is touched.
  const native = platformFor(text);
  const nested = busy;
  const work = nested ? scratch() : shared;
  busy = true;
  try {
    return digest(text, native, work);
  } finally {
    busy = nested;
  }
}

function digest(text: string, native: Platform | null, work: Scratch): string {
  const buffer = work.buffer;
  const state = work.state;
  state.set(INITIAL);
  const length = text.length;
  let used = 0;
  let total = 0;
  let index = 0;

  if (native !== null) {
    while (index < length) {
      let end = Math.min(length, index + STEP);
      if (end < length) {
        // Never part a pair: in well-formed text a high surrogate is followed by its low one.
        const last = text.charCodeAt(end - 1);
        if (last >= 0xd800 && last <= 0xdbff) end -= 1;
      }
      const result = native.encodeInto.call(
        native.encoder,
        text.slice(index, end),
        buffer.subarray(used),
      );
      if (result.read !== end - index) {
        // An encoder that does not take the whole piece is not trusted: start again by hand.
        state.set(INITIAL);
        used = 0;
        total = 0;
        index = 0;
        break;
      }
      index = end;
      const rest = drain(work, used + result.written);
      total += used + result.written - rest;
      used = rest;
    }
  }

  for (; index < length; index += 1) {
    if (used > CAPACITY - CODE_POINT) {
      const rest = drain(work, used);
      total += used - rest;
      used = rest;
    }
    let codePoint = text.charCodeAt(index);
    if (codePoint < 0x80) {
      buffer[used] = codePoint;
      used += 1;
      continue;
    }

    // A high surrogate followed by a low surrogate is one code point, not two.
    // Encoding them separately would produce CESU-8, which hashes differently
    // from the UTF-8 every other tool would produce for the same string. A
    // surrogate with no partner keeps its own three bytes, as it always has.
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = (codePoint - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        index += 1;
      }
    }

    if (codePoint < 0x800) {
      buffer[used] = 0xc0 | (codePoint >> 6);
      buffer[used + 1] = 0x80 | (codePoint & 0x3f);
      used += 2;
    } else if (codePoint < 0x10000) {
      buffer[used] = 0xe0 | (codePoint >> 12);
      buffer[used + 1] = 0x80 | ((codePoint >> 6) & 0x3f);
      buffer[used + 2] = 0x80 | (codePoint & 0x3f);
      used += 3;
    } else {
      buffer[used] = 0xf0 | (codePoint >> 18);
      buffer[used + 1] = 0x80 | ((codePoint >> 12) & 0x3f);
      buffer[used + 2] = 0x80 | ((codePoint >> 6) & 0x3f);
      buffer[used + 3] = 0x80 | (codePoint & 0x3f);
      used += 4;
    }
  }
  if (used > CAPACITY - PADDING) {
    const rest = drain(work, used);
    total += used - rest;
    used = rest;
  }
  total += used;

  buffer[used] = 0x80;
  used += 1;
  while (used % BLOCK !== 56) {
    buffer[used] = 0;
    used += 1;
  }
  // Length in bits as a 64-bit big-endian count. The high word is written from
  // a float division rather than a shift because `<<` in JavaScript is 32-bit.
  const high = Math.floor(total / 0x20000000);
  const low = (total * 8) % 0x100000000;
  buffer[used] = (high >>> 24) & 0xff;
  buffer[used + 1] = (high >>> 16) & 0xff;
  buffer[used + 2] = (high >>> 8) & 0xff;
  buffer[used + 3] = high & 0xff;
  buffer[used + 4] = (low >>> 24) & 0xff;
  buffer[used + 5] = (low >>> 16) & 0xff;
  buffer[used + 6] = (low >>> 8) & 0xff;
  buffer[used + 7] = low & 0xff;
  compress(work, (used + 8) / BLOCK);

  let hex = '';
  for (let i = 0; i < 8; i += 1) hex += ((state[i] as number) >>> 0).toString(16).padStart(8, '0');
  return hex;
}
