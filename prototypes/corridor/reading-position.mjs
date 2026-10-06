/** Exact local-source anchors. Digests bind source text; they do not provide
 * source bytes, processing permission, persistence or scheduling authority. */

const SOURCE_PREFIX = 'bundled-reading:';
const VERSION_PREFIX = 'bundled-text-sha256:';
const WHITESPACE = /^\s*$/u;

export class ReadingPositionError extends TypeError {
  constructor(code, path = '') {
    super(`Reading position ${code}${path ? ` at ${path}` : ''}`);
    this.name = 'ReadingPositionError';
    this.code = code;
    this.path = path;
  }
}

function fail(code, path) {
  throw new ReadingPositionError(code, path);
}

function wellFormed(text) {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}

function boundary(text, index) {
  const unit = text.charCodeAt(index);
  return !(unit >= 0xdc00 && unit <= 0xdfff);
}

function sourceSnapshot(passage) {
  if (!passage || typeof passage !== 'object' || Array.isArray(passage)) {
    fail('source-unavailable', 'source');
  }
  // The caller owns the current source object. Capture its exact fields before
  // hashing; this is data validation, not a trusted-handle or admission check.
  const { id, text, tokens } = passage;
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    SOURCE_PREFIX.length + id.length > 200 ||
    !wellFormed(id) ||
    /\s/u.test(id) ||
    [...id].some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)
  ) {
    fail('invalid-source-id', 'source.id');
  }
  if (typeof text !== 'string' || text.length === 0 || !wellFormed(text)) {
    fail('invalid-source-text', 'source.text');
  }
  if (!Array.isArray(tokens) || tokens.length === 0 || tokens.length > text.length) {
    fail('invalid-tokens', 'source.tokens');
  }
  const surfaces = [];
  const spans = [];
  let cursor = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const surface = token && typeof token === 'object' && !Array.isArray(token) ? token.s : null;
    if (typeof surface !== 'string' || surface.length === 0 || !wellFormed(surface)) {
      fail('invalid-token', `source.tokens[${index}].s`);
    }
    const start = text.indexOf(surface, cursor);
    if (start < 0 || !WHITESPACE.test(text.slice(cursor, start))) {
      fail('token-source-mismatch', `source.tokens[${index}].s`);
    }
    const end = start + surface.length;
    surfaces.push(surface);
    spans.push(Object.freeze({ index, start, end }));
    cursor = end;
  }
  if (!WHITESPACE.test(text.slice(cursor))) fail('token-source-mismatch', 'source.text.suffix');
  return { id, text, surfaces, spans: Object.freeze(spans) };
}

function sourceUnchanged(passage, snapshot) {
  const { id, text, tokens } = passage;
  return (
    id === snapshot.id &&
    text === snapshot.text &&
    Array.isArray(tokens) &&
    tokens.length === snapshot.surfaces.length &&
    snapshot.surfaces.every((surface, index) => tokens[index]?.s === surface)
  );
}

async function textDigest(text) {
  if (
    typeof globalThis.TextEncoder !== 'function' ||
    typeof globalThis.crypto?.subtle?.digest !== 'function'
  ) {
    fail('crypto-unavailable', 'SHA-256');
  }
  try {
    const bytes = new globalThis.TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    fail('digest-failed', 'SHA-256');
  }
}

/** Exact monotonic token spans in the caller's source, with only whitespace
 * allowed between tokens or after the final token. No source text is returned. */
export function sourceTokenSpans(passage) {
  try {
    return sourceSnapshot(passage).spans;
  } catch (error) {
    if (error instanceof ReadingPositionError) throw error;
    fail('source-unavailable', 'source');
  }
}

/** Create the canonical sync ReadingAnchor for one current bundled token. */
export async function createBundledReadingAnchor(passage, index) {
  try {
    const snapshot = sourceSnapshot(passage);
    if (!count(index) || index >= snapshot.spans.length) fail('invalid-index', 'index');
    const { start, end } = snapshot.spans[index];
    const sha256 = await textDigest(snapshot.text);
    if (!sourceUnchanged(passage, snapshot)) fail('source-changed', 'source');
    return Object.freeze({
      source: Object.freeze({
        sourceId: `${SOURCE_PREFIX}${snapshot.id}`,
        versionId: `${VERSION_PREFIX}${sha256}`,
        sha256,
      }),
      position: Object.freeze({
        kind: 'text',
        unit: 'utf16',
        start,
        end,
        bodyLength: snapshot.text.length,
      }),
    });
  } catch (error) {
    if (error instanceof ReadingPositionError) throw error;
    fail('source-unavailable', 'source');
  }
}

function record(raw, fields) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
  ) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(raw);
  if (Reflect.ownKeys(descriptors).length !== fields.length) return null;
  if (
    fields.some(
      (field) =>
        !Object.hasOwn(descriptors, field) ||
        !descriptors[field].enumerable ||
        !('value' in descriptors[field]),
    )
  ) {
    return null;
  }
  return Object.fromEntries(fields.map((field) => [field, descriptors[field].value]));
}

/** Resolve only against the same source identity and exact text. A different
 * tokenization of those bytes may contain the saved start in a new token, or put
 * that start in whitespace before the next token. Changed text is never rebased.
 * Unavailable, malformed or mismatched sources/anchors return null. */
export async function resolveBundledReadingAnchor(passage, rawAnchor) {
  try {
    const anchor = record(rawAnchor, ['source', 'position']);
    if (!anchor) return null;
    const source = record(anchor.source, ['sourceId', 'versionId', 'sha256']);
    const position = record(anchor.position, ['kind', 'unit', 'start', 'end', 'bodyLength']);
    if (
      !source ||
      !position ||
      position.kind !== 'text' ||
      position.unit !== 'utf16' ||
      !count(position.start) ||
      !count(position.end) ||
      !count(position.bodyLength) ||
      position.start > position.end ||
      position.end > position.bodyLength
    ) {
      return null;
    }
    const snapshot = sourceSnapshot(passage);
    if (
      source.sourceId !== `${SOURCE_PREFIX}${snapshot.id}` ||
      position.bodyLength !== snapshot.text.length ||
      !boundary(snapshot.text, position.start) ||
      !boundary(snapshot.text, position.end)
    ) {
      return null;
    }
    const sha256 = await textDigest(snapshot.text);
    if (
      source.sha256 !== sha256 ||
      source.versionId !== `${VERSION_PREFIX}${sha256}` ||
      !sourceUnchanged(passage, snapshot)
    ) {
      return null;
    }
    return snapshot.spans.find((span) => span.end > position.start) ?? null;
  } catch {
    return null;
  }
}
