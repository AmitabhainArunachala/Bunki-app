import { sha256Hex } from '../hash.ts';
import { ReplicationStoreError } from './errors.ts';

export type LocalJson =
  null | boolean | number | string | readonly LocalJson[] | { readonly [key: string]: LocalJson };

const MAX_CHARACTERS = 32 * 1024 * 1024;
const MAX_NODES = 1_000_000;

interface CheckedJson {
  readonly value: LocalJson;
  readonly nodes: number;
  readonly characters: number;
  readonly depth: number;
  readonly textLength: number;
  text?: string;
  sha256?: string;
}

// Only values constructed and recursively frozen by this module enter this
// map. Object.isFrozen(raw) is not authority: a caller can freeze an object
// containing accessors or mutable children. Weak ownership also prevents a
// process-wide history cache from retaining departed records.
const checkedValues = new WeakMap<object, CheckedJson>();

// Most strings need only their quotes. Fall back to the engine for escapes
// and surrogate pairs so canonical length remains exactly JSON.stringify's.
const ESCAPED_STRING = /["\\]|[^\u0020-\ud7ff\ue000-\uffff]/u;
const stringLength = (value: string): number =>
  ESCAPED_STRING.test(value) ? JSON.stringify(value).length : value.length + 2;

function checkedJson(raw: unknown): CheckedJson {
  const ancestors = new Set<object>();
  let nodes = 0;
  let characters = 0;
  let textLength = 0;
  let lastDepth = 0;
  function limits(depth: number): void {
    if (
      nodes > MAX_NODES ||
      characters > MAX_CHARACTERS ||
      textLength > MAX_CHARACTERS ||
      depth > 64
    )
      throw new ReplicationStoreError('invalid-request');
  }
  function copy(value: unknown, depth: number): LocalJson {
    if (value !== null && typeof value === 'object') {
      const checked = checkedValues.get(value);
      if (checked) {
        nodes += checked.nodes;
        characters += checked.characters;
        textLength += checked.textLength;
        lastDepth = checked.depth;
        limits(depth + lastDepth);
        return checked.value;
      }
    }
    const startNodes = nodes;
    const startCharacters = characters;
    const startText = textLength;
    nodes += 1;
    limits(depth);
    lastDepth = 0;
    if (value === null || typeof value === 'boolean') {
      textLength += value === false ? 5 : 4;
      limits(depth);
      return value;
    }
    if (typeof value === 'string') {
      characters += value.length;
      textLength += stringLength(value);
      limits(depth);
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) {
      textLength += String(value).length;
      limits(depth);
      return value;
    }
    if (typeof value !== 'object') throw new ReplicationStoreError('invalid-request');
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
    const length: number = array ? descriptors['length']?.value : 0;
    if (
      keys.length > MAX_NODES ||
      (array && (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1))
    )
      throw new ReplicationStoreError('invalid-request');
    ancestors.add(value);
    const output = (array ? new Array<LocalJson>(length) : Object.create(null)) as Record<
      string,
      LocalJson
    >;
    let childDepth = 0;
    let count = 0;
    textLength += 2;
    for (const key of array ? keys : keys.sort()) {
      if (array && key === 'length') continue;
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        throw new ReplicationStoreError('invalid-request');
      if (array && (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length))
        throw new ReplicationStoreError('invalid-request');
      characters += key.length;
      textLength += (count++ ? 1 : 0) + (array ? 0 : stringLength(key) + 1);
      output[key] = copy(descriptor.value, depth + 1);
      childDepth = Math.max(childDepth, 1 + lastDepth);
    }
    ancestors.delete(value);
    lastDepth = childDepth;
    limits(depth);
    const result = Object.freeze(output);
    // Cache roots and substantial subtrees, not a metadata object for every
    // primitive/short review tuple in a large cold record.
    if (depth === 0 || nodes - startNodes >= 16)
      checkedValues.set(result, {
        value: result,
        nodes: nodes - startNodes,
        characters: characters - startCharacters,
        depth: childDepth,
        textLength: textLength - startText,
      });
    return result;
  }
  const value = copy(raw, 0);
  if (value !== null && typeof value === 'object') return checkedValues.get(value)!;
  return { value, nodes, characters, depth: lastDepth, textLength };
}

/** Same admission and immutable value as encodeLocalJson, without computing a
 * canonical string or digest that the caller will immediately discard. */
export function copyLocalJson(raw: unknown): LocalJson {
  return checkedJson(raw).value;
}

/**
 * Full local JSON is not a sync payload. Reject lossy JS values and accessors,
 * preserve every own key (including __proto__), and retain array order.
 */
export function encodeLocalJson(raw: unknown): { value: LocalJson; text: string; sha256: string } {
  const checked = checkedJson(raw);
  checked.text ??= JSON.stringify(checked.value);
  checked.sha256 ??= sha256Hex(checked.text);
  // Never expose the mutable memo entry: altering the returned wrapper must
  // not alter a later receipt for this value.
  return { value: checked.value, text: checked.text, sha256: checked.sha256 };
}

export function readLocalJson(text: string, digest: string): LocalJson {
  try {
    if (sha256Hex(text) !== digest) throw new ReplicationStoreError('corrupt-store');
    const checked = checkedJson(JSON.parse(text));
    if (JSON.stringify(checked.value) !== text) throw new ReplicationStoreError('corrupt-store');
    // The digest was verified above; do not hash the same bytes a second time.
    checked.text = text;
    checked.sha256 = digest;
    return checked.value;
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
