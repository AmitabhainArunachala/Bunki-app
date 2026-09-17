import { z } from 'zod';

export type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Outputs own their data. In particular, a caller cannot edit an approved body in place. */
export function immutable<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

export type ReadingErrorCode =
  | 'invalid-input'
  | 'version-mismatch'
  | 'operation-not-permitted'
  | 'stale-generation'
  | 'url-parser-unavailable';

/** Errors name the boundary and paths, never source text, credentials or model output. */
export class ReadingValidationError extends Error {
  constructor(
    readonly code: ReadingErrorCode,
    readonly paths: readonly string[] = [],
  ) {
    super(`Reading ${code}${paths.length === 0 ? '' : ` at ${paths.join(', ')}`}`);
    this.name = 'ReadingValidationError';
  }
}

function assertBudget(value: unknown): void {
  const pending: { value: unknown; depth: number; leaving?: boolean }[] = [{ value, depth: 0 }];
  const ancestors = new Set<object>();
  let nodes = 0;
  let characters = 0;
  while (pending.length > 0) {
    const entry = pending.pop();
    if (!entry) break;
    if (entry.leaving && entry.value !== null && typeof entry.value === 'object') {
      ancestors.delete(entry.value);
      continue;
    }
    nodes += 1;
    if (nodes > 50_000 || entry.depth > 20) {
      throw new ReadingValidationError('invalid-input', ['input-budget']);
    }
    if (typeof entry.value === 'string') characters += entry.value.length;
    if (characters > 1_000_000) {
      throw new ReadingValidationError('invalid-input', ['input-budget']);
    }
    if (entry.value !== null && typeof entry.value === 'object') {
      if (ancestors.has(entry.value)) {
        throw new ReadingValidationError('invalid-input', ['non-json-graph']);
      }
      ancestors.add(entry.value);
      pending.push({ ...entry, leaving: true });
      const entries = Object.entries(entry.value);
      if (entries.length > 10_000) {
        throw new ReadingValidationError('invalid-input', ['input-budget']);
      }
      for (const [key, child] of entries) {
        characters += key.length;
        pending.push({ value: child, depth: entry.depth + 1 });
      }
    }
  }
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  assertBudget(value);
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ReadingValidationError(
      'invalid-input',
      result.error.issues.slice(0, 12).map((issue) => issue.path.join('.') || '(root)'),
    );
  }
  return result.data;
}

/** SHA-256 uses UTF-8; reject lone surrogates so distinct UTF-16 bodies cannot hash alike. */
export function isWellFormedText(text: string): boolean {
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

export const textSchema = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine(isWellFormedText)
    .refine((text) => text.trim().length > 0)
    .refine(
      (text) =>
        ![...text].some((character) => {
          const code = character.charCodeAt(0);
          return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13);
        }),
    );

export const idSchema = textSchema(200).refine(
  (value) => ![...value].some((character) => character.charCodeAt(0) <= 32),
);
export const shaSchema = z.string().regex(/^[a-f0-9]{64}$/u);

interface WebUrl {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  hash: string;
  href: string;
}

/**
 * WHATWG URL is the only host primitive. This guarded surface works in browsers
 * and Node without importing Node modules; a native host without URL must supply
 * its standard URL polyfill before calling intake. No network is performed here.
 */
export function canonicalWebUrl(raw: string): string {
  if (
    raw.length > 4096 ||
    raw !== raw.trim() ||
    [...raw].some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === '\\',
    ) ||
    !/^https?:\/\/[^/?#]+/iu.test(raw)
  ) {
    throw new ReadingValidationError('invalid-input', ['url']);
  }
  const Constructor = (globalThis as { URL?: new (url: string) => WebUrl }).URL;
  if (!Constructor) throw new ReadingValidationError('url-parser-unavailable');
  let url: WebUrl;
  try {
    url = new Constructor(raw);
  } catch {
    throw new ReadingValidationError('invalid-input', ['url']);
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new ReadingValidationError('invalid-input', ['url']);
  }
  url.hash = '';
  return url.href;
}

export const webUrlSchema = textSchema(4096).transform((value, context) => {
  try {
    return canonicalWebUrl(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid public web URL' });
    return z.NEVER;
  }
});
