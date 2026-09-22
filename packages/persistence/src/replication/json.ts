import { sha256Hex } from '../hash.ts';
import { ReplicationStoreError } from './errors.ts';

export type LocalJson =
  null | boolean | number | string | readonly LocalJson[] | { readonly [key: string]: LocalJson };

const MAX_CHARACTERS = 32 * 1024 * 1024;
const MAX_NODES = 1_000_000;

/**
 * Full local JSON is not a sync payload. Reject lossy JS values and accessors,
 * preserve every own key (including __proto__), and retain array order.
 */
export function encodeLocalJson(raw: unknown): { value: LocalJson; text: string; sha256: string } {
  const ancestors = new Set<object>();
  let nodes = 0;
  let characters = 0;
  function copy(value: unknown, depth: number): LocalJson {
    nodes += 1;
    if (nodes > MAX_NODES || depth > 64 || characters > MAX_CHARACTERS) {
      throw new ReplicationStoreError('invalid-request');
    }
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      characters += value.length;
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
    if (typeof value !== 'object' || value === null)
      throw new ReplicationStoreError('invalid-request');
    const array = Array.isArray(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    if (
      ancestors.has(value) ||
      Object.getOwnPropertySymbols(value).length ||
      (!array && prototype !== Object.prototype && prototype !== null)
    )
      throw new ReplicationStoreError('invalid-request');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors);
    if (keys.length > MAX_NODES || (array && keys.length !== value.length + 1)) {
      throw new ReplicationStoreError('invalid-request');
    }
    ancestors.add(value);
    const output: Record<string, LocalJson> = Object.create(null) as Record<string, LocalJson>;
    for (const key of keys.sort()) {
      if (array && key === 'length') continue;
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw new ReplicationStoreError('invalid-request');
      }
      if (array && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)) {
        throw new ReplicationStoreError('invalid-request');
      }
      characters += key.length;
      output[key] = copy(descriptor.value, depth + 1);
    }
    ancestors.delete(value);
    if (array)
      return Object.freeze(
        Array.from({ length: value.length }, (_, index) => output[String(index)] as LocalJson),
      );
    return Object.freeze(output);
  }
  const value = copy(raw, 0);
  const text = JSON.stringify(value);
  if (characters > MAX_CHARACTERS || text.length > MAX_CHARACTERS) {
    throw new ReplicationStoreError('invalid-request');
  }
  return { value, text, sha256: sha256Hex(text) };
}

export function readLocalJson(text: string, digest: string): LocalJson {
  try {
    if (sha256Hex(text) !== digest) throw new ReplicationStoreError('corrupt-store');
    const encoded = encodeLocalJson(JSON.parse(text));
    if (encoded.text !== text) throw new ReplicationStoreError('corrupt-store');
    return encoded.value;
  } catch {
    throw new ReplicationStoreError('corrupt-store');
  }
}

export function assertCounter(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new ReplicationStoreError('invalid-request');
}

/** Local table keys are opaque; they are not reused as sync identity authority. */
export function assertLocalKey(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 256 ||
    Array.from(value).some((character) => character.charCodeAt(0) < 0x20)
  ) {
    throw new ReplicationStoreError('invalid-request');
  }
}
