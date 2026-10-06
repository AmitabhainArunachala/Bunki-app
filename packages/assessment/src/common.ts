import { inputHashOf } from '@bunki/ai/hash';
import { z } from 'zod';

export type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export type AssessmentErrorCode =
  | 'invalid-input'
  | 'revision-mismatch'
  | 'reference-mismatch'
  | 'stale-checkpoint'
  | 'attempt-finalized'
  | 'attempt-not-submitted'
  | 'timing-regression';

/** Diagnostics carry field paths, never prompts, answers, or learner text. */
export class AssessmentValidationError extends Error {
  constructor(
    readonly code: AssessmentErrorCode,
    readonly paths: readonly string[] = [],
  ) {
    super(`Assessment ${code}${paths.length ? ` at ${paths.join(', ')}` : ''}`);
    this.name = 'AssessmentValidationError';
  }
}

export function immutable<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
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

/** Ordinary bounded JSON only. Accessors, cycles and lossy JSON values fail before parsing. */
export function assertJsonBudget(value: unknown): void {
  const work: { value: unknown; depth: number; leaving?: boolean }[] = [{ value, depth: 0 }];
  const ancestors = new Set<object>();
  let nodes = 0;
  let characters = 0;
  while (work.length) {
    const entry = work.pop();
    if (!entry) break;
    const child = entry.value;
    if (entry.leaving && child !== null && typeof child === 'object') {
      ancestors.delete(child);
      continue;
    }
    nodes += 1;
    if (nodes > 200_000 || entry.depth > 24 || characters > 2_000_000) {
      throw new AssessmentValidationError('invalid-input', ['input-budget']);
    }
    if (typeof child === 'string') {
      characters += child.length;
      if (!wellFormed(child))
        throw new AssessmentValidationError('invalid-input', ['non-json-text']);
    } else if (typeof child === 'number') {
      if (!Number.isFinite(child) || Object.is(child, -0)) {
        throw new AssessmentValidationError('invalid-input', ['non-json-number']);
      }
    } else if (child !== null && typeof child === 'object') {
      const prototype: unknown = Object.getPrototypeOf(child);
      if (
        ancestors.has(child) ||
        (!Array.isArray(child) && prototype !== Object.prototype && prototype !== null) ||
        Object.getOwnPropertySymbols(child).length
      ) {
        throw new AssessmentValidationError('invalid-input', ['non-json-object']);
      }
      const descriptors = Object.getOwnPropertyDescriptors(child);
      const keys = Object.keys(descriptors);
      if (keys.length > 20_000)
        throw new AssessmentValidationError('invalid-input', ['input-budget']);
      if (Array.isArray(child) && keys.length !== child.length + 1) {
        throw new AssessmentValidationError('invalid-input', ['non-json-array']);
      }
      ancestors.add(child);
      work.push({ value: child, depth: entry.depth, leaving: true });
      for (const key of keys) {
        if (Array.isArray(child) && key === 'length') continue;
        const descriptor = descriptors[key];
        if (
          !descriptor ||
          !('value' in descriptor) ||
          !descriptor.enumerable ||
          !wellFormed(key) ||
          (Array.isArray(child) && !/^(0|[1-9][0-9]*)$/u.test(key))
        ) {
          throw new AssessmentValidationError('invalid-input', ['non-json-property']);
        }
        characters += key.length;
        work.push({ value: descriptor.value, depth: entry.depth + 1 });
      }
    } else if (child !== null && typeof child !== 'boolean') {
      throw new AssessmentValidationError('invalid-input', ['non-json-value']);
    }
  }
  if (characters > 2_000_000)
    throw new AssessmentValidationError('invalid-input', ['input-budget']);
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  assertJsonBudget(value);
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AssessmentValidationError(
      'invalid-input',
      result.error.issues.slice(0, 10).map((issue) => issue.path.join('.') || '(root)'),
    );
  }
  return result.data;
}

export const textSchema = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(wellFormed)
    .refine((value) => value.trim().length > 0)
    .refine((value) =>
      [...value].every((character) => {
        const code = character.charCodeAt(0);
        return code !== 127 && (code >= 32 || code === 9 || code === 10 || code === 13);
      }),
    );
export const idSchema = textSchema(200).regex(/^\S+$/u);
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const countSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const elapsedSchema = z
  .number()
  .int()
  .min(0)
  .max(7 * 24 * 60 * 60 * 1000);
export const artifactKindSchema = z.enum(['form', 'item', 'passage', 'media']);
export const artifactReferenceSchema = z.strictObject({
  kind: artifactKindSchema,
  id: idSchema,
  revisionId: idSchema,
  sha256: digestSchema,
});
export type ArtifactReference = DeepReadonly<z.infer<typeof artifactReferenceSchema>>;

export function assertUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    throw new AssessmentValidationError('invalid-input', [path]);
  }
}

export function revisionOf<T extends object>(kind: string, payload: T) {
  const sha256 = inputHashOf(payload);
  return { ...payload, revisionId: `assessment-${kind}:${sha256}`, sha256 };
}

export function assertRevision(
  kind: string,
  raw: { revisionId: string; sha256: string },
  payload: object,
): void {
  const actual = revisionOf(kind, payload);
  if (raw.revisionId !== actual.revisionId || raw.sha256 !== actual.sha256) {
    throw new AssessmentValidationError('revision-mismatch');
  }
}
