/** Immutable contextual-teaching data. A digest proves only content coherence;
 * neither a record nor its metadata grants permission to process its source.
 * Source availability, source-text admission and provider consent belong to the
 * caller. This module performs no storage, network or provider operations. */

const VERSION = 1;
const DIGEST = /^[0-9a-f]{64}$/u;
const REFERENCE = /^teacher-context:[0-9a-f]{64}$/u;
const CONTEXT_FIELDS = [
  'version',
  'id',
  'sourceKind',
  'sourceId',
  'sourceDigest',
  'unit',
  'start',
  'end',
  'index',
  'quote',
  'title',
  'attribution',
  'url',
  'target',
];
const INPUT_FIELDS = CONTEXT_FIELDS.filter((key) => key !== 'id' && key !== 'version');
const SOURCE_UNITS = Object.freeze({
  'bundled-passage': 'token-index',
  'personal-reading': 'utf16-code-unit',
  'publisher-reading': 'utf16-code-unit',
  'assessment-item': 'utf16-code-unit',
});
const TARGET_TYPES = new Set(['word', 'kanji', 'grammar', 'particle']);
// These validators intentionally reject control characters in serialized text.
// eslint-disable-next-line no-control-regex -- Identifiers cannot contain control characters.
const IDENTIFIER_CONTROLS = /[\u0000-\u001f\u007f-\u009f]/u;
// eslint-disable-next-line no-control-regex -- Human prose permits tab and line breaks only.
const PROSE_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

export class TeacherContextError extends TypeError {
  constructor(code, path) {
    super(`Teacher context ${code}${path ? ` at ${path}` : ''}`);
    this.name = 'TeacherContextError';
    this.code = code;
    this.path = path || '';
  }
}

function fail(code, path) {
  throw new TeacherContextError(code, path);
}

function record(raw, required, optional = [], path = 'context') {
  if (
    raw === null ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
  )
    fail('invalid-object', path);
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const keys = Reflect.ownKeys(descriptors);
  if (
    required.some((key) => !Object.hasOwn(descriptors, key)) ||
    keys.some(
      (key) => typeof key !== 'string' || (!required.includes(key) && !optional.includes(key)),
    )
  )
    fail('invalid-fields', path);
  if (keys.some((key) => !('value' in descriptors[key]) || !descriptors[key].enumerable))
    fail('invalid-property', path);
  return raw;
}

function wellFormed(value) {
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function boundedText(value, path, maximum, nonempty = false, identifier = false) {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    (nonempty && value.length === 0) ||
    !wellFormed(value) ||
    (identifier ? IDENTIFIER_CONTROLS : PROSE_CONTROLS).test(value)
  )
    fail('invalid-text', path);
  return value;
}

function integer(value, path) {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0))
    fail('invalid-integer', path);
  return value;
}

function reference(value, path) {
  if (typeof value !== 'string' || !REFERENCE.test(value)) fail('invalid-reference', path);
  return value;
}

function safeUrl(value) {
  if (value === null) return null;
  boundedText(value, 'url', 4096, true, true);
  if (!/^https?:\/\//iu.test(value) || /[\s\\]/u.test(value)) fail('invalid-url', 'url');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('invalid-url', 'url');
  }
  const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/u)[0];
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    !authority ||
    parsed.username ||
    parsed.password ||
    authority.includes('@')
  )
    fail('invalid-url', 'url');
  return value;
}

/** JSON.parse supplies the grammar check. Inspect its valid token stream too,
 * because JSON.parse silently overwrites duplicate object member names. */
function decode(raw) {
  if (typeof raw !== 'string') return raw;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail('invalid-json');
  }
  const frames = [];
  for (const [token] of raw.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}[\],:]|[^\s{}[\],:]+/gu)) {
    const frame = frames.at(-1);
    if (token === '{' || token === '[') {
      frames.push({ object: token === '{', nextKey: token === '{', keys: new Set() });
    } else if (token === '}' || token === ']') frames.pop();
    else if (token === ':' && frame?.object) frame.nextKey = false;
    else if (token === ',' && frame?.object) frame.nextKey = true;
    else if (token.startsWith('"') && frame?.object && frame.nextKey) {
      const key = JSON.parse(token);
      if (frame.keys.has(key)) fail('duplicate-field');
      frame.keys.add(key);
      frame.nextKey = false;
    }
  }
  return parsed;
}

function payload(raw, constructor = false) {
  record(raw, constructor ? INPUT_FIELDS : CONTEXT_FIELDS, constructor ? ['version'] : []);
  const version = constructor && !Object.hasOwn(raw, 'version') ? VERSION : raw.version;
  if (version !== VERSION && version !== 2) fail('invalid-version', 'version');
  if ((raw.sourceKind === 'assessment-item') !== (version === 2)) fail('invalid-version', 'sourceKind');
  if (typeof raw.sourceKind !== 'string' || !Object.hasOwn(SOURCE_UNITS, raw.sourceKind))
    fail('invalid-source-kind', 'sourceKind');
  if (raw.unit !== SOURCE_UNITS[raw.sourceKind]) fail('invalid-unit', 'unit');
  if (typeof raw.sourceDigest !== 'string' || !DIGEST.test(raw.sourceDigest))
    fail('invalid-digest', 'sourceDigest');
  const start = integer(raw.start, 'start');
  const end = integer(raw.end, 'end');
  const index = integer(raw.index, 'index');
  if (end <= start || index < start || index >= end) fail('invalid-span', 'span');
  const quote = boundedText(raw.quote, 'quote', 4000, true);
  if (raw.unit === 'utf16-code-unit') {
    if (end - start !== quote.length) fail('invalid-span', 'quote');
    const atIndex = quote.charCodeAt(index - start);
    if (atIndex >= 0xdc00 && atIndex <= 0xdfff) fail('invalid-span', 'index');
  }
  let target = null;
  if (raw.target !== null) {
    record(raw.target, ['type', 'id'], [], 'target');
    if (!TARGET_TYPES.has(raw.target.type)) fail('invalid-target', 'target.type');
    target = Object.freeze({
      type: raw.target.type,
      id: boundedText(raw.target.id, 'target.id', 160, true, true),
    });
  }
  return {
    version,
    sourceKind: raw.sourceKind,
    sourceId: boundedText(raw.sourceId, 'sourceId', 4096, true, true),
    sourceDigest: raw.sourceDigest,
    unit: raw.unit,
    start,
    end,
    index,
    quote,
    title: boundedText(raw.title, 'title', 500),
    attribution: boundedText(raw.attribution, 'attribution', 1000),
    url: safeUrl(raw.url),
    target,
  };
}

/** Canonical JSON uses sorted field names and the exact admitted text. The
 * context's own id is excluded; a target's id remains part of the content. */
function canonicalContent(context) {
  const ordered = {};
  for (const key of Object.keys(context)
    .filter((key) => key !== 'id')
    .sort()) {
    ordered[key] =
      key === 'target' && context.target !== null
        ? { id: context.target.id, type: context.target.type }
        : context[key];
  }
  return JSON.stringify(ordered);
}

/** Canonical bytes for synchronous record admission; no authority is implied. */
export function teacherContextCanonicalText(raw) {
  return canonicalContent(parseTeacherContext(raw));
}

/** Digest a source without normalizing its text. Source size/admission is the
 * caller's responsibility. Ill-formed UTF-16 is rejected instead of silently
 * replacing it during UTF-8 encoding. */
export async function digestText(text) {
  if (typeof text !== 'string' || !wellFormed(text)) fail('invalid-text', 'digestText');
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Construct a new bounded record; version defaults to 1 and id is derived. */
export async function createTeacherContext(input) {
  const content = payload(input, true);
  const id = `teacher-context:${await digestText(canonicalContent(content))}`;
  return Object.freeze({ version: VERSION, id, ...content });
}

/** Synchronous structural validation only. Use verifyTeacherContext when the
 * content-derived id must be checked; neither function admits a source. */
export function parseTeacherContext(raw) {
  return parseContextValue(decode(raw));
}

function parseContextValue(input) {
  const content = payload(input);
  const id = reference(input.id, 'id');
  return Object.freeze({ version: VERSION, id, ...content });
}

/** Check the exact content-derived id and return a detached immutable record. */
export async function verifyTeacherContext(raw) {
  const context = parseTeacherContext(raw);
  const expected = `teacher-context:${await digestText(canonicalContent(context))}`;
  if (context.id !== expected) fail('digest-mismatch', 'id');
  return context;
}

/** Widen an exact text encounter to its containing sentence, keeping the
 * encounter index and original bytes. This establishes content coherence only;
 * the caller must still admit the current source before saving or processing. */
export async function sourceSentenceContext(raw, text) {
  const context = await verifyTeacherContext(raw);
  if (context.unit !== 'utf16-code-unit') fail('invalid-unit', 'unit');
  if (await digestText(text) !== context.sourceDigest ||
      text.slice(context.start, context.end) !== context.quote)
    fail('source-mismatch', 'quote');
  let start = context.start, end = context.end;
  const boundary = /[。！？!?\r\n]/u;
  while (start > 0 && !boundary.test(text[start - 1])) start -= 1;
  // A selection ending at punctuation already includes its sentence ending.
  if (!boundary.test(text[end - 1])) {
    while (end < text.length && !boundary.test(text[end])) end += 1;
    if (end < text.length && !/[\r\n]/u.test(text[end])) end += 1;
  }
  if (end - start > 4000) return context;
  const input = { ...context, start, end, quote: text.slice(start, end) };
  delete input.id;
  return createTeacherContext(input);
}

function entriesArray(raw) {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype)
    fail('invalid-array', 'entries');
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== raw.length + 1) fail('invalid-array', 'entries');
  for (const key of keys) {
    if (key === 'length') continue;
    if (
      typeof key !== 'string' ||
      !/^(0|[1-9][0-9]*)$/u.test(key) ||
      Number(key) >= raw.length ||
      !('value' in descriptors[key]) ||
      !descriptors[key].enumerable
    )
      fail('invalid-array', 'entries');
  }
  return raw;
}

/** Missing legacy state is empty. Every supplied root is strictly validated;
 * entries are never pruned or silently repaired. Id checks remain asynchronous. */
export function parseTeacherContexts(raw = null) {
  const input = decode(raw);
  if (input === null || input === undefined)
    return Object.freeze({ version: VERSION, activeRef: null, entries: Object.freeze([]) });
  record(input, ['version', 'activeRef', 'entries'], [], 'root');
  if (input.version !== VERSION) fail('invalid-version', 'root.version');
  const entries = entriesArray(input.entries).map((entry) => parseContextValue(entry));
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.id)) fail('duplicate-context', 'entries');
    seen.add(entry.id);
  }
  const activeRef = input.activeRef === null ? null : reference(input.activeRef, 'activeRef');
  if (activeRef !== null && !seen.has(activeRef)) fail('dangling-reference', 'activeRef');
  return Object.freeze({ version: VERSION, activeRef, entries: Object.freeze(entries) });
}

/** Append or select an identical existing record. Reject an id collision instead
 * of replacing history. This synchronous helper does not verify a digest. */
export function selectTeacherContext(rawRoot, rawContext) {
  const root = parseTeacherContexts(rawRoot);
  const context = parseTeacherContext(rawContext);
  const existing = root.entries.find((entry) => entry.id === context.id);
  if (existing && canonicalContent(existing) !== canonicalContent(context))
    fail('context-conflict', 'id');
  return Object.freeze({
    version: VERSION,
    activeRef: context.id,
    entries: existing ? root.entries : Object.freeze([...root.entries, context]),
  });
}

/** Activate an existing source context, or clear selection without deleting it. */
export function activateTeacherContext(rawRoot, ref) {
  const root = parseTeacherContexts(rawRoot);
  const activeRef = ref === null ? null : reference(ref, 'activeRef');
  if (activeRef !== null && !root.entries.some((entry) => entry.id === activeRef))
    fail('dangling-reference', 'activeRef');
  return Object.freeze({ version: VERSION, activeRef, entries: root.entries });
}
