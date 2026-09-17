import { z } from 'zod';

export type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export function immutable<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

export type SyncErrorCode =
  | 'invalid-input'
  | 'unsupported-version'
  | 'ownership-mismatch'
  | 'stale-session'
  | 'epoch-mismatch'
  | 'policy-mismatch'
  | 'identity-conflict'
  | 'payload-digest-mismatch'
  | 'causal-reference-conflict'
  | 'causal-cycle'
  | 'invalid-replica';

/** Paths and codes only: never put private payload bytes into a diagnostic. */
export class SyncValidationError extends Error {
  constructor(
    readonly code: SyncErrorCode,
    readonly paths: readonly string[] = [],
  ) {
    super(`Sync ${code}${paths.length ? ` at ${paths.join(', ')}` : ''}`);
    this.name = 'SyncValidationError';
  }
}

function wellFormed(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

/** Only an ordinary JSON tree is accepted; accessors are never invoked. */
export function assertJsonBudget(value: unknown): void {
  const work: { value: unknown; depth: number; leaving?: boolean }[] = [{ value, depth: 0 }];
  const ancestors = new Set<object>();
  let nodes = 0;
  let characters = 0;
  while (work.length) {
    const item = work.pop();
    if (!item) break;
    if (item.leaving && item.value !== null && typeof item.value === 'object') {
      ancestors.delete(item.value);
      continue;
    }
    nodes += 1;
    if (nodes > 30_000 || item.depth > 20 || characters > 500_000) {
      throw new SyncValidationError('invalid-input', ['input-budget']);
    }
    const child = item.value;
    if (typeof child === 'string') {
      characters += child.length;
      if (!wellFormed(child)) throw new SyncValidationError('invalid-input', ['non-json-text']);
    } else if (typeof child === 'number') {
      if (!Number.isFinite(child) || Object.is(child, -0)) {
        throw new SyncValidationError('invalid-input', ['non-json-number']);
      }
    } else if (child !== null && typeof child === 'object') {
      const prototype: unknown = Object.getPrototypeOf(child);
      if (
        ancestors.has(child) ||
        (!Array.isArray(child) && prototype !== Object.prototype && prototype !== null) ||
        Object.getOwnPropertySymbols(child).length !== 0
      ) {
        throw new SyncValidationError('invalid-input', ['non-json-object']);
      }
      const descriptors = Object.getOwnPropertyDescriptors(child);
      const keys = Object.keys(descriptors);
      if (keys.length > 10_000) throw new SyncValidationError('invalid-input', ['input-budget']);
      if (Array.isArray(child) && keys.length !== child.length + 1) {
        throw new SyncValidationError('invalid-input', ['non-json-array']);
      }
      ancestors.add(child);
      work.push({ value: child, depth: item.depth, leaving: true });
      for (const key of keys) {
        const descriptor = descriptors[key];
        if (Array.isArray(child) && key === 'length') continue;
        if (
          !descriptor ||
          !('value' in descriptor) ||
          !descriptor.enumerable ||
          !wellFormed(key) ||
          (Array.isArray(child) && !/^(0|[1-9][0-9]*)$/u.test(key))
        ) {
          throw new SyncValidationError('invalid-input', ['non-json-property']);
        }
        characters += key.length;
        work.push({ value: descriptor.value, depth: item.depth + 1 });
      }
    } else if (typeof child !== 'boolean' && child !== null) {
      throw new SyncValidationError('invalid-input', ['non-json-value']);
    }
  }
  if (characters > 500_000) throw new SyncValidationError('invalid-input', ['input-budget']);
}

export function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  assertJsonBudget(raw);
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new SyncValidationError(
      'invalid-input',
      result.error.issues.slice(0, 10).map((issue) => issue.path.join('.') || '(root)'),
    );
  }
  return result.data;
}

// Existing dictionary/card IDs include Japanese forms. Preserve opaque Unicode
// identities byte-for-byte; normalizing or restricting them to ASCII is lossy.
export const idSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(wellFormed)
  .regex(/^\S+$/u)
  .refine((value) =>
    [...value].every((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    }),
  );
export const digestSchema = z.string().regex(/^[0-9a-f]{64}$/u);
export const countSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const textSchema = (max: number) => z.string().min(1).max(max).refine(wellFormed);

/** Binary ordering is portable; locale-dependent collation is not a sync rule. */
export const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
