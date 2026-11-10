import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { copyLocalJson, encodeLocalJson, readLocalJson } from '../../src/replication/json.ts';

describe('canonical local JSON with immutable structural sharing', () => {
  it('preserves canonical bytes, own prototype-like keys, Unicode and hashes', () => {
    const raw = JSON.parse(
      '{"z":"語\\ud800\\n","10":10,"2":2,"__proto__":{"x":1},"a":[1,true,null,"\\u0000"]}',
    );
    const encoded = encodeLocalJson(raw);
    expect(encoded.text).toBe(
      '{"2":2,"10":10,"__proto__":{"x":1},"a":[1,true,null,"\\u0000"],"z":"語\\ud800\\n"}',
    );
    expect(encoded.sha256).toBe(createHash('sha256').update(encoded.text).digest('hex'));
    expect(Object.hasOwn(encoded.value as object, '__proto__')).toBe(true);
    expect(readLocalJson(encoded.text, encoded.sha256)).toEqual(encoded.value);
    expect(copyLocalJson(raw)).toEqual(encoded.value);
  });

  it('shares only previously admitted immutable values, never caller objects', () => {
    const raw = { rows: [{ text: 'original' }] };
    const admitted = copyLocalJson(raw) as typeof raw;
    const wrapper = copyLocalJson({ record: admitted }) as { record: typeof raw };
    expect(wrapper.record).toBe(admitted);
    expect(copyLocalJson(admitted)).toBe(admitted);
    expect(admitted).not.toBe(raw);
    expect(admitted.rows).not.toBe(raw.rows);
    expect(Object.isFrozen(admitted.rows[0])).toBe(true);
    raw.rows[0]!.text = 'changed';
    expect(admitted.rows[0]!.text).toBe('original');
    expect((copyLocalJson(raw) as typeof raw).rows[0]!.text).toBe('changed');
  });

  it('does not trust shallow frozen inputs or mutable returned encoder wrappers', () => {
    const child = { text: 'before' };
    const raw = Object.freeze({ child });
    const before = encodeLocalJson(raw);
    child.text = 'after';
    expect(encodeLocalJson(raw).text).not.toBe(before.text);
    const canonical = encodeLocalJson(before.value);
    before.text = 'poison';
    before.sha256 = 'poison';
    expect(encodeLocalJson(before.value)).toEqual(canonical);
    expect(() =>
      copyLocalJson(
        Object.freeze({
          get value() {
            throw new Error('getter ran');
          },
        }),
      ),
    ).toThrow('invalid-request');
  });

  it.each([
    undefined,
    NaN,
    Infinity,
    -0,
    1n,
    new Date(),
    new Map(),
    { value: undefined },
    { value: () => 1 },
    new Array(3),
    Object.defineProperty({}, 'hidden', { value: 1 }),
    { [Symbol('hidden')]: 1 },
  ])('rejects non-JSON input through both copy and encode', (raw) => {
    expect(() => copyLocalJson(raw)).toThrow('invalid-request');
    expect(() => encodeLocalJson(raw)).toThrow('invalid-request');
  });

  it('rejects cycles while allowing acyclic shared inputs', () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => copyLocalJson(cyclic)).toThrow('invalid-request');
    const value = copyLocalJson({ a: [1, 2] });
    expect(encodeLocalJson([value, value]).text).toBe('[{"a":[1,2]},{"a":[1,2]}]');
  });

  it('accounts for cached subtree depth and repeated nodes at every occurrence', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 64; i++) deep = { x: deep };
    const checked = copyLocalJson(deep);
    expect(() => copyLocalJson({ x: checked })).toThrow('invalid-request');
    const block = copyLocalJson(Array.from({ length: 1000 }, () => [1, 2, 3]));
    expect(() => copyLocalJson(Array(250).fill(block))).toThrow('invalid-request');
  });

  it('retains total character and serialized-size limits when sharing admitted values', () => {
    const block = copyLocalJson({ text: 'x'.repeat(1024 * 1024) });
    expect(() => copyLocalJson(Array(33).fill(block))).toThrow('invalid-request');
    const escaped = copyLocalJson({ text: '\u0000'.repeat(1024 * 1024) });
    expect(() => copyLocalJson(Array(6).fill(escaped))).toThrow('invalid-request');
  });

  it('rejects tampered digests and noncanonical stored bytes', () => {
    const encoded = encodeLocalJson({ a: 'one', b: 2 });
    expect(() => readLocalJson(encoded.text.replace('one', 'two'), encoded.sha256)).toThrow(
      'corrupt-store',
    );
    const noncanonical = '{"b":2,"a":"one"}';
    expect(() =>
      readLocalJson(noncanonical, createHash('sha256').update(noncanonical).digest('hex')),
    ).toThrow('corrupt-store');
    const value = readLocalJson(encoded.text, encoded.sha256);
    expect(encodeLocalJson(value)).toEqual({ ...encoded, value });
  });
});
