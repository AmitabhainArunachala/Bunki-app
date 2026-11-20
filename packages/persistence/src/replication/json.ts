import { sha256Hex } from '../hash.ts';
import { ReplicationStoreError } from './errors.ts';

export type LocalJson =
  null | boolean | number | string | readonly LocalJson[] | { readonly [key: string]: LocalJson };

const MAX_CHARACTERS = 32 * 1024 * 1024;
const MAX_NODES = 1_000_000;
const MAX_DEPTH = 64;

/**
 * Text and digests are remembered only for containers at least this large (in
 * key and string characters). Below it a native stringify is already cheap.
 */
const LARGE = 16 * 1024;

/**
 * What this module knows about a container it produced itself.
 *
 * Every array and object returned by the normalizer is frozen, has only frozen
 * descendants made here, and (for objects) has no prototype. Its JSON content
 * can therefore never change, so its identity stands for its content: copying
 * it again, serializing it again or hashing it again must give the same answer
 * as the first time. That is the whole basis of the reuse below. The table is
 * private to this module, so no caller can enter a value into it.
 *
 * `nodes`, `characters` and `height` are the amounts the size limits count for
 * the subtree, kept so that a reused subtree is charged exactly what walking it
 * again would charge. `largeChildren` tells the serializer whether a child
 * keeps text of its own.
 */
interface Canonical {
  readonly nodes: number;
  readonly characters: number;
  readonly height: number;
  readonly largeChildren: boolean;
  text?: string;
  /** Length of the text of a container whose text is joined on demand and not kept. */
  length?: number;
  sha256?: string;
}
const CANONICAL = new WeakMap<object, Canonical>();

/**
 * Full local JSON is not a sync payload. Reject lossy JS values and accessors,
 * preserve every own key (including __proto__), and retain array order.
 */
function normalizeLocalJson(raw: unknown): { value: LocalJson; characters: number } {
  const ancestors = new Set<object>();
  let nodes = 0;
  let characters = 0;
  /** `heights[depth]` is the height of the subtree the last call at that depth returned. */
  const heights: number[] = [];
  function copy(value: unknown, depth: number): LocalJson {
    nodes += 1;
    if (nodes > MAX_NODES || depth > MAX_DEPTH || characters > MAX_CHARACTERS) {
      throw new ReplicationStoreError('invalid-request');
    }
    heights[depth] = 0;
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      characters += value.length;
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
    if (typeof value !== 'object' || value === null)
      throw new ReplicationStoreError('invalid-request');
    const known = CANONICAL.get(value);
    if (known) {
      // The node itself is counted above; charge the rest of its subtree.
      nodes += known.nodes - 1;
      characters += known.characters;
      if (nodes > MAX_NODES || depth + known.height > MAX_DEPTH || characters > MAX_CHARACTERS)
        throw new ReplicationStoreError('invalid-request');
      heights[depth] = known.height;
      return value as LocalJson;
    }
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
    const nodesBefore = nodes;
    const charactersBefore = characters;
    let height = 0;
    let largeChildren = false;
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
      const child = copy(descriptor.value, depth + 1);
      output[key] = child;
      const below = (heights[depth + 1] ?? 0) + 1;
      if (below > height) height = below;
      if (!largeChildren && child !== null && typeof child === 'object') {
        const meta = CANONICAL.get(child);
        if (meta && meta.characters >= LARGE) largeChildren = true;
      }
    }
    ancestors.delete(value);
    const result: LocalJson = array
      ? Object.freeze(
          Array.from({ length: value.length }, (_, index) => output[String(index)] as LocalJson),
        )
      : Object.freeze(output);
    CANONICAL.set(result as object, {
      nodes: nodes - nodesBefore + 1,
      characters: characters - charactersBefore,
      height,
      largeChildren,
    });
    heights[depth] = height;
    return result;
  }
  const value = copy(raw, 0);
  return { value, characters };
}

/**
 * True while no inherited toJSON could make a native stringify differ from the
 * walk below. While it is false nothing kept is used and nothing is kept: text,
 * length and digest are computed from the value as the first version did, so a
 * page that pollutes a prototype gets the same answers it got before.
 */
export function plainStringify(): boolean {
  return (
    (Array.prototype as { toJSON?: unknown }).toJSON === undefined &&
    (Object.prototype as { toJSON?: unknown }).toJSON === undefined
  );
}

/**
 * The text `JSON.stringify` gives for a normalized value, byte for byte. A
 * large container of small parts keeps its text. A container of large parts is
 * joined from their kept text, so the unchanged part of a large value is not
 * serialized again. Keys are taken in the engine's own property order, which
 * is the order `JSON.stringify` uses.
 */
function canonicalText(value: LocalJson): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const meta = CANONICAL.get(value);
  if (!meta || meta.characters < LARGE || !plainStringify()) return JSON.stringify(value);
  if (meta.text !== undefined) return meta.text;
  if (!meta.largeChildren) {
    meta.text = JSON.stringify(value);
    return meta.text;
  }
  const parts: string[] = [];
  if (Array.isArray(value)) {
    for (const child of value as readonly LocalJson[]) parts.push(canonicalText(child));
    return `[${parts.join(',')}]`;
  }
  const record = value as { readonly [key: string]: LocalJson };
  for (const key of Object.keys(record))
    parts.push(`${JSON.stringify(key)}:${canonicalText(record[key] as LocalJson)}`);
  return `{${parts.join(',')}}`;
}

/**
 * The length of `canonicalText(value)`. A container of large parts is measured
 * from its parts, so a caller that only needs the size limit checked does not
 * join megabytes of text it would then throw away.
 */
function canonicalLength(value: LocalJson): number {
  if (value === null || typeof value !== 'object') return JSON.stringify(value).length;
  const meta = CANONICAL.get(value);
  if (!meta || meta.characters < LARGE || !plainStringify()) return JSON.stringify(value).length;
  if (meta.text !== undefined) return meta.text.length;
  if (!meta.largeChildren) return canonicalText(value).length;
  if (meta.length !== undefined) return meta.length;
  // Brackets, one comma between neighbours, and for an object each key's text and its colon.
  let length = 2;
  let members = 0;
  if (Array.isArray(value)) {
    for (const child of value as readonly LocalJson[]) {
      length += canonicalLength(child);
      members += 1;
    }
  } else {
    const record = value as { readonly [key: string]: LocalJson };
    for (const key of Object.keys(record)) {
      length += JSON.stringify(key).length + 1 + canonicalLength(record[key] as LocalJson);
      members += 1;
    }
  }
  if (members > 1) length += members - 1;
  meta.length = length;
  return length;
}

function checkedText(value: LocalJson, characters: number): string {
  const text = canonicalText(value);
  if (characters > MAX_CHARACTERS || text.length > MAX_CHARACTERS) {
    throw new ReplicationStoreError('invalid-request');
  }
  return text;
}

/** The limits `checkedText` enforces, without building the text. */
function checkLimits(value: LocalJson, characters: number): void {
  if (characters > MAX_CHARACTERS || canonicalLength(value) > MAX_CHARACTERS) {
    throw new ReplicationStoreError('invalid-request');
  }
}

/** The digest of a normalized value's text, kept with a large container. */
function digestOf(value: LocalJson, text: string): string {
  const meta = value !== null && typeof value === 'object' ? CANONICAL.get(value) : undefined;
  if (!meta || meta.characters < LARGE || !plainStringify()) return sha256Hex(text);
  if (meta.sha256 === undefined) meta.sha256 = sha256Hex(text);
  return meta.sha256;
}

export function encodeLocalJson(raw: unknown): { value: LocalJson; text: string; sha256: string } {
  const { value, characters } = normalizeLocalJson(raw);
  const text = checkedText(value, characters);
  return { value, text, sha256: digestOf(value, text) };
}

/** The normalized value alone, under the same limits, for a caller that needs no digest. */
export function copyLocalJson(raw: unknown): LocalJson {
  const { value, characters } = normalizeLocalJson(raw);
  checkLimits(value, characters);
  return value;
}

/** Whether two values have the same canonical text. One normalized node is its own answer. */
export function sameLocalJson(a: unknown, b: unknown): boolean {
  const left = normalizeLocalJson(a);
  const right = normalizeLocalJson(b);
  if (left.value === right.value) {
    checkLimits(left.value, left.characters);
    return true;
  }
  return checkedText(left.value, left.characters) === checkedText(right.value, right.characters);
}

/**
 * Whether this very object was produced by the normalizer above, and is
 * therefore frozen all the way down. A caller may keep the result of a pure
 * check against such a value by its identity; it tells nothing else.
 */
export function isNormalizedLocalJson(value: unknown): boolean {
  return value !== null && typeof value === 'object' && CANONICAL.has(value);
}

export function readLocalJson(text: string, digest: string): LocalJson {
  try {
    if (sha256Hex(text) !== digest) throw new ReplicationStoreError('corrupt-store');
    const { value, characters } = normalizeLocalJson(JSON.parse(text));
    if (checkedText(value, characters) !== text) throw new ReplicationStoreError('corrupt-store');
    return value;
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
