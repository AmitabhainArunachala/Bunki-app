/**
 * The local JSON normalizer, checked against its own first definition.
 *
 * `src/replication/json.ts` reuses a value it has already normalized: a frozen
 * container it produced is returned as itself, charged to the size limits from
 * what was counted when it was made, and its text and digest are kept. That
 * reuse is what lets a saved answer cost the size of the change and not the
 * size of the learner's whole history. It is only right if no caller can tell
 * the difference, so this file keeps the first definition of the normalizer
 * (walk everything, every time) as a reference and requires the two to agree:
 * the same values accepted, the same values refused, the same text, the same
 * digest. The reference is the test's oracle and nothing else uses it.
 *
 * The limit cases at the very end of the range (a million values, 32 MiB of
 * text) are stated as expectations. Walking them through the reference takes
 * seconds each; the same cases were run against it on 2026-11-20 and agreed.
 */
import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../../src/hash.ts';
import {
  copyLocalJson,
  encodeLocalJson,
  isNormalizedLocalJson,
  readLocalJson,
  sameLocalJson,
} from '../../src/replication/json.ts';

const MAX_CHARACTERS = 32 * 1024 * 1024;
const MAX_NODES = 1_000_000;

/** The normalizer as first written: no reuse, the whole value walked on every call. */
function reference(raw: unknown): { text: string; sha256: string } {
  const ancestors = new Set<object>();
  let nodes = 0;
  let characters = 0;
  function copy(value: unknown, depth: number): unknown {
    nodes += 1;
    if (nodes > MAX_NODES || depth > 64 || characters > MAX_CHARACTERS) throw new Error('refused');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      characters += value.length;
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
    if (typeof value !== 'object' || value === null) throw new Error('refused');
    const array = Array.isArray(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    if (
      ancestors.has(value) ||
      Object.getOwnPropertySymbols(value).length ||
      (!array && prototype !== Object.prototype && prototype !== null)
    )
      throw new Error('refused');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors);
    if (keys.length > MAX_NODES || (array && keys.length !== value.length + 1))
      throw new Error('refused');
    ancestors.add(value);
    const output = Object.create(null) as Record<string, unknown>;
    for (const key of keys.sort()) {
      if (array && key === 'length') continue;
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        throw new Error('refused');
      if (array && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length))
        throw new Error('refused');
      characters += key.length;
      output[key] = copy(descriptor.value, depth + 1);
    }
    ancestors.delete(value);
    if (array) return Array.from({ length: value.length }, (_, index) => output[String(index)]);
    return output;
  }
  const value = copy(raw, 0);
  const text = JSON.stringify(value);
  if (characters > MAX_CHARACTERS || text.length > MAX_CHARACTERS) throw new Error('refused');
  return { text, sha256: sha256Hex(text) };
}

type Outcome = { text: string; sha256: string } | 'refused';
const byReference = (value: unknown): Outcome => {
  try {
    return reference(value);
  } catch {
    return 'refused';
  }
};
const byNormalizer = (value: unknown): Outcome => {
  try {
    const { text, sha256 } = encodeLocalJson(value);
    return { text, sha256 };
  } catch (error) {
    expect((error as { code?: string }).code).toBe('invalid-request');
    return 'refused';
  }
};

/** A small deterministic generator, so a failure names a case that can be run again. */
function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  return { next, pick };
}
const KEYS = [
  'a',
  'b',
  'z',
  '10',
  '9',
  '0',
  '__proto__',
  'constructor',
  'toJSON',
  '長い鍵',
  '\ud800',
  'k\u0000',
  '',
  '1e3',
  '-1',
  '01',
  'length',
];
const STRINGS = [
  '',
  'x',
  '日本語',
  '😀',
  '\ud800',
  '\udc00\ud800',
  'a"b\\c',
  '  ',
  'q'.repeat(300),
  '\u0007\n\t',
];
const NUMBERS = [0, 1, -1, 1.5, 1e21, 1e-7, 123456789012345680000, 5e-324, Number.MAX_SAFE_INTEGER];
const LOSSY_NUMBERS = [-0, Number.NaN, Number.POSITIVE_INFINITY];

function arbitrary(random: ReturnType<typeof generator>, lossy: boolean, depth = 0): unknown {
  const { next, pick } = random;
  const roll = next();
  if (depth > 5 || roll < 0.25) {
    const kind = next();
    if (kind < 0.3) return pick(STRINGS);
    if (kind < 0.6) return lossy && next() < 0.2 ? pick(LOSSY_NUMBERS) : pick(NUMBERS);
    if (kind < 0.75) return next() < 0.5;
    if (kind < 0.9) return null;
    return lossy ? pick([undefined, () => 1, Symbol('s'), 10n, new Date(0), new Map()]) : 'leaf';
  }
  if (roll < 0.6) {
    const length = Math.floor(next() * 6);
    const list: unknown[] & { extra?: number } = Array.from({ length }, () =>
      arbitrary(random, lossy, depth + 1),
    );
    if (lossy && next() < 0.08) list.extra = 1;
    if (lossy && next() < 0.08) list.length = length + 1;
    if (lossy && next() < 0.05 && length)
      Object.defineProperty(list, 0, { get: () => 1, enumerable: true, configurable: true });
    return list;
  }
  const record = (next() < 0.3 ? Object.create(null) : {}) as Record<string | symbol, unknown>;
  const size = Math.floor(next() * 6);
  for (let index = 0; index < size; index += 1) {
    Object.defineProperty(record, pick(KEYS), {
      value: arbitrary(random, lossy, depth + 1),
      enumerable: !(lossy && next() < 0.05),
      writable: true,
      configurable: true,
    });
  }
  if (lossy && next() < 0.05) record[Symbol('x')] = 1;
  if (lossy && next() < 0.05)
    Object.defineProperty(record, 'acc', { get: () => 1, enumerable: true });
  if (lossy && next() < 0.03) return Object.create({ inherited: 1 }) as unknown;
  return record;
}

describe('the local JSON normalizer agrees with its first definition', () => {
  it('on arbitrary values, plain or built over parts it has already normalized', () => {
    const random = generator(20261120);
    const pool: { normalized: unknown; plain: unknown }[] = [];
    let accepted = 0;
    let refused = 0;
    let overNormalizedParts = 0;
    for (let index = 0; index < 9_000; index += 1) {
      let value = arbitrary(random, random.next() < 0.35);
      let twin = value;
      if (pool.length && random.next() < 0.5) {
        // The same shape twice: once over normalized parts, once over plain copies of them.
        const a = random.pick(pool);
        const b = random.pick(pool);
        const shape = random.next();
        if (shape < 0.5) {
          value = { x: a.normalized, y: [b.normalized, value], n: 1 };
          twin = { x: a.plain, y: [b.plain, twin], n: 1 };
        } else {
          value = [a.normalized, b.normalized, a.normalized, value];
          twin = [a.plain, b.plain, a.plain, twin];
        }
        overNormalizedParts += 1;
      }
      const expected = byReference(twin);
      expect(byNormalizer(value), `case ${index}`).toEqual(expected);
      if (expected === 'refused') {
        refused += 1;
        expect(() => copyLocalJson(value)).toThrow();
        continue;
      }
      accepted += 1;
      const normalized = copyLocalJson(value);
      expect(JSON.stringify(normalized)).toBe(expected.text);
      expect(sameLocalJson(value, twin)).toBe(true);
      expect(JSON.stringify(readLocalJson(expected.text, expected.sha256))).toBe(expected.text);
      if (normalized !== null && typeof normalized === 'object') {
        expect(copyLocalJson(normalized)).toBe(normalized);
        expect(Object.isFrozen(normalized)).toBe(true);
        expect(isNormalizedLocalJson(normalized)).toBe(true);
        expect(isNormalizedLocalJson(twin)).toBe(false);
      }
      if (pool.length > 1) {
        const other = random.pick(pool);
        expect(sameLocalJson(normalized, other.normalized)).toBe(
          expected.text === JSON.stringify(other.plain),
        );
      }
      // Parts may themselves be built over parts, while their size stays bounded.
      if (random.next() < 0.3 && expected.text.length < 3_000)
        pool.push({ normalized, plain: JSON.parse(expected.text) });
      if (pool.length > 300) pool.splice(0, 100);
    }
    // The agreement above is not empty: all three kinds of case occurred in number.
    expect(accepted).toBeGreaterThan(4_000);
    expect(refused).toBeGreaterThan(1_000);
    expect(overNormalizedParts).toBeGreaterThan(3_000);
  }, 120_000);

  it('control: the comparison catches a planted fault of each kind it exists to catch', () => {
    // A serializer that keeps insertion order instead of the normalizer's order.
    const unordered = { b: 1, a: 2, 10: 3, 9: 4 };
    const expected = byReference(unordered);
    expect(expected).toEqual({
      text: '{"9":4,"10":3,"a":2,"b":1}',
      sha256: sha256Hex('{"9":4,"10":3,"a":2,"b":1}'),
    });
    expect(JSON.stringify({ b: 1, a: 2 })).not.toBe(
      (byReference({ b: 1, a: 2 }) as { text: string }).text,
    );
    expect(byNormalizer(unordered)).toEqual(expected);
    // A normalizer that lets a lossy value through: the reference refuses each of these.
    const sparse: unknown[] = [1, 2, 3];
    delete sparse[1];
    for (const lossy of [
      undefined,
      Number.NaN,
      -0,
      new Date(0),
      sparse,
      Object.create({ inherited: 1 }),
    ])
      expect(byReference({ value: lossy }), String(lossy)).toBe('refused');
    // A normalizer that forgets to charge a reused part: the reference refuses the over-deep twin.
    const nest = (levels: number) => {
      let value: unknown = 1;
      for (let index = 0; index < levels; index += 1) value = [value];
      return value;
    };
    expect(byReference(nest(65))).toBe('refused');
    expect(byReference(nest(64))).not.toBe('refused');
  });
});

describe('large values: kept text, joined text and kept digests', () => {
  const row = (index: number) => [
    index,
    'tap',
    `word:合成履歴${String(index % 97)}`,
    2,
    `passage-${index % 13}`,
  ];
  const rows = (count: number, from = 0) =>
    Array.from({ length: count }, (_, index) => row(from + index));

  it('gives the bytes of JSON.stringify for containers of large parts, at every nesting', () => {
    const history = copyLocalJson(rows(4_000));
    const more = copyLocalJson(rows(3_000, 4_000));
    const plain = {
      v: 1,
      10: 'ten',
      9: 'nine',
      __proto__: null,
      obslog: rows(4_000),
      revlog: rows(3_000, 4_000),
      small: { z: 1, a: [true, null] },
    };
    const record = {
      v: 1,
      10: 'ten',
      9: 'nine',
      __proto__: null,
      obslog: history,
      revlog: more,
      small: { z: 1, a: [true, null] },
    };
    const expected = reference(plain);
    const encoded = encodeLocalJson(record);
    expect(encoded.text).toBe(expected.text);
    expect(encoded.sha256).toBe(expected.sha256);
    // A wrapper of a wrapper of large parts, an array of them, and the same part used twice.
    const nested = {
      collection: 'learner-record',
      id: 'current',
      value: encoded.value,
      twice: [history, history],
    };
    const nestedPlain = {
      collection: 'learner-record',
      id: 'current',
      value: plain,
      twice: [rows(4_000), rows(4_000)],
    };
    expect(encodeLocalJson(nested)).toMatchObject(reference(nestedPlain));
    // Asking again answers the same, and the large parts are the very same objects.
    const again = encodeLocalJson(record);
    expect(again.text).toBe(expected.text);
    expect(again.sha256).toBe(expected.sha256);
    expect((again.value as { obslog: unknown }).obslog).toBe(history);
    expect((again.value as { revlog: unknown }).revlog).toBe(more);
  });

  it('appends to a normalized history without disturbing what was there', () => {
    const history = copyLocalJson(rows(5_000)) as readonly unknown[];
    const next = copyLocalJson([...history, row(5_000)]) as readonly unknown[];
    expect(next).not.toBe(history);
    expect(next.length).toBe(5_001);
    for (let index = 0; index < 5_000; index += 37) expect(next[index]).toBe(history[index]);
    expect(encodeLocalJson(next)).toMatchObject(reference(rows(5_001)));
    expect(encodeLocalJson(history)).toMatchObject(reference(rows(5_000)));
    expect(sameLocalJson(history, next)).toBe(false);
    expect(sameLocalJson(next, rows(5_001))).toBe(true);
  });

  it('is not misled by an inherited toJSON', () => {
    const history = copyLocalJson(rows(4_000));
    const holder = Array.prototype as { toJSON?: unknown };
    try {
      holder.toJSON = function toJSON(this: unknown[]) {
        return this.length;
      };
      const record = { obslog: history, more: [1, 2] };
      expect(encodeLocalJson(record).text).toBe(JSON.stringify(copyLocalJson(record)));
    } finally {
      delete holder.toJSON;
    }
    expect(encodeLocalJson({ obslog: history, more: [1, 2] })).toMatchObject(
      reference({ obslog: rows(4_000), more: [1, 2] }),
    );
  });
});

describe('an inherited toJSON that appears after a value was normalized', () => {
  it('gets the text and the digest of that text, never a digest kept from before', () => {
    const encoded = encodeLocalJson(['x'.repeat(16_384), [1, 2, 3]]);
    expect(encoded.sha256).toBe(sha256Hex(encoded.text));
    const holder = Array.prototype as { toJSON?: unknown };
    try {
      holder.toJSON = () => [];
      // What the first version did: serialize as the engine now does, and hash that text.
      const polluted = encodeLocalJson(encoded.value);
      expect(polluted.text).toBe(JSON.stringify(encoded.value));
      expect(polluted.text).not.toBe(encoded.text);
      expect(polluted.sha256).toBe(sha256Hex(polluted.text));
      const fresh = encodeLocalJson(['y'.repeat(20_000)]);
      expect(fresh.sha256).toBe(sha256Hex(fresh.text));
    } finally {
      delete holder.toJSON;
    }
    // With the prototype clean again the value has its own text and digest, kept or not.
    const after = encodeLocalJson(encoded.value);
    expect(after.text).toBe(encoded.text);
    expect(after.sha256).toBe(encoded.sha256);
    const later = encodeLocalJson(['y'.repeat(20_000)]);
    expect(later.text).toBe(JSON.stringify(['y'.repeat(20_000)]));
    expect(later.sha256).toBe(sha256Hex(later.text));
  });
});

describe('the size limits count a reused part exactly as a walked one', () => {
  const nest = (levels: number, leaf: unknown) => {
    let value = leaf;
    for (let index = 0; index < levels; index += 1) value = [value];
    return value;
  };

  it('depth: a value 64 levels down is accepted and one 65 levels down is refused', () => {
    for (const levels of [63, 64, 65, 66]) {
      const expected = byReference(nest(levels, 1));
      expect(expected === 'refused').toBe(levels > 64);
      expect(byNormalizer(nest(levels, 1))).toEqual(expected);
      for (const inner of [1, 10, 30, 60]) {
        const part = copyLocalJson(nest(inner, 1));
        expect(byNormalizer(nest(levels - inner, part)), `${levels} levels over ${inner}`).toEqual(
          expected,
        );
      }
    }
  });

  it('counted characters: array positions are charged for a reused part, where the text is still short', () => {
    // The count includes each array position's digits, which the text does not contain. A long array
    // can therefore pass the limit on the count while its text is millions of characters under it.
    const positions = 900_000;
    const part = copyLocalJson(Array.from({ length: positions }, () => 0));
    let digits = 0;
    for (let width = 1, from = 0, to = 10; from < positions; width += 1, from = to, to *= 10)
      digits += (Math.min(to, positions) - from) * width;
    expect(digits).toBe(5_288_890);
    const outer = 2; // the positions "0" and "1" of the pair below
    for (const over of [0, 1]) {
      const filler = 'c'.repeat(MAX_CHARACTERS - digits - outer + over);
      const outcome = byNormalizer([part, filler]);
      expect(outcome === 'refused', `count ${MAX_CHARACTERS + over}`).toBe(over > 0);
      if (outcome !== 'refused')
        expect(outcome.text.length).toBeLessThan(MAX_CHARACTERS - 3_000_000);
      if (over > 0) expect(() => copyLocalJson([part, filler])).toThrow();
      else expect(copyLocalJson([part, filler])).toBeTruthy();
    }
  }, 120_000);

  it('values: a million are accepted and one more is refused, counted through normalized halves', () => {
    const zeros = (count: number) => Array.from({ length: count }, () => 0);
    const half = copyLocalJson(zeros(499_998)); // 499,999 values with its own array
    for (const total of [1_000_000, 1_000_001]) {
      const loose = zeros(total - 1 - 2 * 499_999); // the outer array is one value
      const outcome = byNormalizer([half, half, ...loose]);
      expect(outcome === 'refused', `${total} values`).toBe(total > MAX_NODES);
    }
    expect(byNormalizer(zeros(MAX_NODES - 1)) === 'refused').toBe(false);
    expect(byNormalizer(zeros(MAX_NODES)) === 'refused').toBe(true);
  }, 120_000);

  it('characters: text of 32 MiB is accepted and one character more is refused, over normalized parts', () => {
    const chunk = 'b'.repeat(1024 * 1024 - 8);
    const part = copyLocalJson([chunk, chunk, chunk, chunk]);
    const parts = 7;
    // text = [ part × 7 , "tail" ] ; each part's text is 4 chunks, 8 quotes, 3 commas and 2 brackets
    const partText = 4 * chunk.length + 8 + 3 + 2;
    const fixed = 2 + parts * partText + parts + 2; // outer brackets, the parts, their commas, the tail's quotes
    for (const over of [-1, 0, 1]) {
      const tail = 'c'.repeat(MAX_CHARACTERS - fixed + over);
      const value = [...Array.from({ length: parts }, () => part), tail];
      const outcome = byNormalizer(value);
      expect(outcome === 'refused', `text length ${MAX_CHARACTERS + over}`).toBe(over > 0);
      if (outcome !== 'refused') expect(outcome.text.length).toBe(MAX_CHARACTERS + over);
      if (over > 0) expect(() => copyLocalJson(value)).toThrow();
      else expect(copyLocalJson(value)).toBeTruthy();
    }
  }, 120_000);
});

describe('reading stored text', () => {
  it('returns the value for canonical text with its digest, and refuses anything else as corrupt', () => {
    const { text, sha256 } = encodeLocalJson({ b: [1, 'x'], a: { z: null } });
    expect(readLocalJson(text, sha256)).toEqual({ a: { z: null }, b: [1, 'x'] });
    const corrupt = (candidate: string, digest = sha256Hex(candidate)) => {
      try {
        readLocalJson(candidate, digest);
        return false;
      } catch (error) {
        return (error as { code?: string }).code === 'corrupt-store';
      }
    };
    expect(corrupt(text, sha256.replace(/^./u, sha256.startsWith('0') ? '1' : '0'))).toBe(true);
    expect(corrupt('{"b":[1,"x"],"a":{"z":null}}')).toBe(true); // keys out of order
    expect(corrupt('{"a":{"z":null}, "b":[1,"x"]}')).toBe(true); // a space
    expect(corrupt('{"a":1,"a":2}')).toBe(true); // a repeated key
    expect(corrupt('{"a":1')).toBe(true); // not JSON
    expect(corrupt(text.replace('"x"', '"y"'), sha256)).toBe(true); // other bytes under the old digest
  });
});
