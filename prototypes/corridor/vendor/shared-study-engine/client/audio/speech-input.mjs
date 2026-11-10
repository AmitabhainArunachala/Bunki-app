/** Resolved speech-input identity and per-placement provenance for the v1 audio seam.
 *
 * This module is deliberately synchronous, pure and runtime-neutral: it accepts
 * already-resolved text/directive/profile payloads, validates their JSON shape,
 * copies them into detached ordinary records, and binds identity with the
 * portable canonical JSON + SHA-256 implementation in client/schema/event.mjs.
 * It performs no network, audio, storage or authorization work. The returned
 * records describe supplied data only; they are not evidence that a source
 * extraction, a full card, or a hidden-answer face was authorized.
 */
import { canonicalStringify, sha256, isTaskKey } from '../schema/event.mjs';

// Explicit resource bounds. Oversized or over-nested input is rejected rather
// than truncated, so a digest can never describe a partial payload. The text
// bounds comfortably admit the judge's 14k-codepoint passage.
const MAX_SEGMENTS = 512;
const MAX_TEXT_CODEPOINTS = 1_000_000;
const MAX_TOTAL_TEXT_CODEPOINTS = 2_000_000;
const MAX_DEPTH = 64;
const MAX_NODES = 100_000;

const fail = message => { throw new TypeError(message); };
const isPlainRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** True only for a string whose UTF-16 code units form Unicode scalar values. */
const isScalarString = value => {
  if (typeof value !== 'string') return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
};
const codepointLength = value => {
  let length = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) i++;
    length++;
  }
  return length;
};
const nonWhitespace = value => /\S/u.test(value);
const spend = (state, count = 1) => {
  state.nodes += count;
  if (state.nodes > MAX_NODES) fail('speech input exceeds the node limit');
};

/** Read an exact record without invoking accessors or accepting hidden fields. */
const exactRecord = (value, names, state, label) => {
  if (!isPlainRecord(value)) fail(`${label} must be a plain record`);
  spend(state);
  const own = Reflect.ownKeys(value);
  if (own.length !== names.length || own.some(key => typeof key !== 'string')) {
    fail(`${label} must contain exactly ${names.join(', ')}`);
  }
  const fields = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
      fail(`${label}.${name} must be an enumerable data property`);
    }
    fields[name] = descriptor.value;
  }
  return fields;
};

/** Read a dense, plain Array.prototype array with no extra own properties. */
const exactArray = (value, state, label) => {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail(`${label} must be a plain array`);
  }
  spend(state);
  const length = value.length;
  if (length > MAX_NODES - state.nodes) fail(`${label} exceeds the node limit`);
  if (Reflect.ownKeys(value).length !== length + 1) {
    fail(`${label} must be dense without extra properties`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value') || lengthDescriptor.value !== length) {
    fail(`${label} has an invalid length`);
  }
  const values = new Array(length);
  for (let i = 0; i < length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
      fail(`${label}[${i}] must be an enumerable data property`);
    }
    values[i] = descriptor.value;
  }
  return values;
};

/** Validate a required descriptive/identity string; return its exact original bytes. */
const requiredString = (value, state, label) => {
  if (typeof value !== 'string') fail(`${label} must be a string`);
  spend(state);
  if (!isScalarString(value) || !nonWhitespace(value)) {
    fail(`${label} must be non-whitespace Unicode scalar text`);
  }
  return value;
};

/** Copy one arbitrary canonical-JSON tree, rejecting lossy or non-plain values. */
const copyJson = (value, state, depth) => {
  if (depth > MAX_DEPTH) fail('speech input exceeds the depth limit');
  if (value === null) { spend(state); return null; }
  const type = typeof value;
  if (type === 'string') {
    spend(state);
    if (!isScalarString(value)) fail('settings contain malformed Unicode');
    return value;
  }
  if (type === 'boolean') { spend(state); return value; }
  if (type === 'number') {
    spend(state);
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail('settings numbers must be finite and not negative zero');
    }
    return value;
  }
  if (type !== 'object') fail(`settings contain unsupported ${type} content`);
  if (state.ancestors.has(value)) fail('settings must not contain cycles');
  state.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const values = exactArray(value, state, 'settings array');
      const copy = new Array(values.length);
      for (let i = 0; i < values.length; i++) copy[i] = copyJson(values[i], state, depth + 1);
      return copy;
    }
    if (!isPlainRecord(value)) fail('settings objects must be plain Object.prototype or null-prototype records');
    spend(state);
    const keys = Reflect.ownKeys(value);
    if (keys.length > MAX_NODES - state.nodes) fail('speech input exceeds the node limit');
    const copy = {};
    for (const key of keys) {
      if (typeof key !== 'string') fail('settings must not contain symbol keys');
      if (!isScalarString(key)) fail('settings contain malformed Unicode keys');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
        fail('settings must contain only enumerable data properties');
      }
      spend(state);
      // defineProperty keeps '__proto__' and similar names as ordinary own data
      // keys instead of mutating the detached record's prototype.
      Object.defineProperty(copy, key, {
        value: copyJson(descriptor.value, state, depth + 1),
        enumerable: true, writable: true, configurable: true,
      });
    }
    return copy;
  } finally {
    state.ancestors.delete(value);
  }
};

const deepFreeze = value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};

/** Validate and copy the fixed profile half of a speech-input payload. */
const copyProfile = (value, state) => {
  const fields = exactRecord(value, ['providerRoute', 'model', 'voice', 'settings'], state, 'profile');
  const providerRoute = requiredString(fields.providerRoute, state, 'profile.providerRoute');
  const model = requiredString(fields.model, state, 'profile.model');
  const voice = requiredString(fields.voice, state, 'profile.voice');
  const settings = fields.settings;
  if (!isPlainRecord(settings)) fail('profile.settings must be a plain canonical-JSON object');
  return { providerRoute, model, voice, settings: copyJson(settings, state, 0) };
};

/** Build the immutable identity of one supplied speech payload.
 *
 * The returned `inputKey` is the lowercase SHA-256 of the canonical JSON of
 * `{format, version, segments, profile}`; `inputKey` itself is not hashed.
 * Segments remain in caller order and text/readings keep their exact Unicode
 * scalar sequence, spaces and decomposition. Settings are canonicalized by
 * object-key order only, so key order does not change identity while any
 * supported content change does.
 * Pronunciation spans are zero-based Unicode-codepoint ranges [start, end),
 * ordered and nonoverlapping within each segment. Language, readings and
 * provider/model/voice settings must already be resolved by the caller; this
 * validation does not establish pronunciation quality or provider support.
 *
 * Bounds: at most 512 segments, 1,000,000 codepoints per segment text,
 * 2,000,000 total segment-text codepoints, 64 levels of settings nesting and
 * 100,000 nodes/keys. Excess is rejected, never truncated.
 *
 * @param {{segments: Array<{language: 'ja'|'en', text: string,
 *   pronunciationDirectives: Array<{start: number, end: number, reading: string}>}>,
 *   profile: {providerRoute: string, model: string, voice: string,
 *   settings: Record<string, unknown>}}} input Resolved payload to validate.
 * @returns {{format: 'nihongo-speech-input', version: 1, inputKey: string,
 *   segments: Array<object>, profile: object}} Deeply frozen detached identity.
 * @throws {TypeError} If any required field, identifier, directive span, JSON
 *   value, key, prototype, array shape, Unicode sequence or resource bound is
 *   invalid. Accessors are rejected without being executed.
 */
export function createSpeechInput(input) {
  const state = { nodes: 0, ancestors: new Set() };
  const root = exactRecord(input, ['segments', 'profile'], state, 'speech input');
  const segmentValues = exactArray(root.segments, state, 'segments');
  if (segmentValues.length === 0) fail('segments must not be empty');
  if (segmentValues.length > MAX_SEGMENTS) fail('segments exceeds the segment limit');

  const segments = new Array(segmentValues.length);
  let totalText = 0;
  for (let s = 0; s < segmentValues.length; s++) {
    const fields = exactRecord(segmentValues[s], ['language', 'text', 'pronunciationDirectives'],
      state, `segments[${s}]`);
    if (fields.language !== 'ja' && fields.language !== 'en') {
      fail(`segments[${s}].language must be 'ja' or 'en'`);
    }
    if (typeof fields.text !== 'string') fail(`segments[${s}].text must be a string`);
    spend(state);
    if (!isScalarString(fields.text) || !nonWhitespace(fields.text)) {
      fail(`segments[${s}].text must be non-whitespace Unicode scalar text`);
    }
    const textLength = codepointLength(fields.text);
    if (textLength === 0) fail(`segments[${s}].text must not be empty`);
    if (textLength > MAX_TEXT_CODEPOINTS) fail(`segments[${s}].text exceeds the text limit`);
    totalText += textLength;
    if (totalText > MAX_TOTAL_TEXT_CODEPOINTS) fail('segment text exceeds the total text limit');

    const directiveValues = exactArray(fields.pronunciationDirectives, state,
      `segments[${s}].pronunciationDirectives`);
    const pronunciationDirectives = new Array(directiveValues.length);
    let previousEnd = 0;
    for (let d = 0; d < directiveValues.length; d++) {
      const directive = exactRecord(directiveValues[d], ['start', 'end', 'reading'], state,
        `segments[${s}].pronunciationDirectives[${d}]`);
      const { start, end } = directive;
      if (!Number.isSafeInteger(start) || start < 0 || Object.is(start, -0)) {
        fail(`segments[${s}].pronunciationDirectives[${d}].start must be a nonnegative safe integer`);
      }
      if (!Number.isSafeInteger(end) || Object.is(end, -0)) {
        fail(`segments[${s}].pronunciationDirectives[${d}].end must be a safe integer`);
      }
      if (end <= start || end > textLength) {
        fail(`segments[${s}].pronunciationDirectives[${d}] span is outside the text`);
      }
      if (start < previousEnd) {
        fail(`segments[${s}].pronunciationDirectives must be ordered and nonoverlapping`);
      }
      const reading = requiredString(directive.reading, state,
        `segments[${s}].pronunciationDirectives[${d}].reading`);
      if (codepointLength(reading) > MAX_TEXT_CODEPOINTS) {
        fail(`segments[${s}].pronunciationDirectives[${d}].reading exceeds the text limit`);
      }
      previousEnd = end;
      pronunciationDirectives[d] = { start, end, reading };
    }
    segments[s] = { language: fields.language, text: fields.text, pronunciationDirectives };
  }

  const profile = copyProfile(root.profile, state);
  const format = 'nihongo-speech-input', version = 1;
  const inputKey = sha256(canonicalStringify({ format, version, segments, profile }));
  return deepFreeze({ format, version, inputKey, segments, profile });
}

/** Bind one speech identity to separate source/correction and task-placement metadata.
 *
 * `provenance` and `placement` are copied, never merged into the speech
 * `inputKey`. The input key identifies the supplied speech payload;
 * it grants no access, sharing, publication or license permission. Scope
 * strings are opaque descriptive references, and no authorization predicate
 * is exposed here. This validates metadata shape only: it does not look up
 * the payload or task in a registry, or check the segment index against the
 * payload's segment count. Callers must verify those relationships separately.
 *
 * @param {{inputKey: string,
 *   provenance: {sourceRef: string, sourceRevision: string, correctionLedgerRevision: string},
 *   placement: {taskKey: string, field: string, segment: number,
 *   contentRevision: string, accessScope: string, licenseScope: string}}} input
 *   Binding metadata to validate.
 * @returns {{format: 'nihongo-speech-placement', version: 1, inputKey: string,
 *   provenance: object, placement: object}} Deeply frozen detached binding.
 * @throws {TypeError} For a malformed digest, missing/empty/unknown metadata,
 *   an invalid task key or a bad segment index. Accessors are never executed.
 */
export function bindSpeechPlacement(input) {
  const state = { nodes: 0, ancestors: new Set() };
  const root = exactRecord(input, ['inputKey', 'provenance', 'placement'], state, 'speech placement');
  if (typeof root.inputKey !== 'string' || !/^[0-9a-f]{64}$/.test(root.inputKey)) {
    fail('inputKey must be a raw lowercase 64-character hexadecimal SHA-256');
  }

  const provenanceFields = exactRecord(root.provenance,
    ['sourceRef', 'sourceRevision', 'correctionLedgerRevision'], state, 'provenance');
  const provenance = {
    sourceRef: requiredString(provenanceFields.sourceRef, state, 'provenance.sourceRef'),
    sourceRevision: requiredString(provenanceFields.sourceRevision, state,
      'provenance.sourceRevision'),
    correctionLedgerRevision: requiredString(provenanceFields.correctionLedgerRevision, state,
      'provenance.correctionLedgerRevision'),
  };

  const placementFields = exactRecord(root.placement,
    ['taskKey', 'field', 'segment', 'contentRevision', 'accessScope', 'licenseScope'],
    state, 'placement');
  if (!isTaskKey(placementFields.taskKey)) fail('placement.taskKey must be an existing canonical task key');
  // isTaskKey owns the tuple format; this only applies the non-whitespace
  // metadata rule to its already-parsed components.
  const taskParts = JSON.parse(placementFields.taskKey);
  if (taskParts.some(part => !isScalarString(part) || !nonWhitespace(part))) {
    fail('placement.taskKey components must be non-whitespace Unicode scalar strings');
  }
  const segment = placementFields.segment;
  if (!Number.isSafeInteger(segment) || segment < 0 || Object.is(segment, -0)) {
    fail('placement.segment must be a nonnegative safe integer');
  }
  const placement = {
    taskKey: placementFields.taskKey,
    field: requiredString(placementFields.field, state, 'placement.field'),
    segment,
    contentRevision: requiredString(placementFields.contentRevision, state,
      'placement.contentRevision'),
    accessScope: requiredString(placementFields.accessScope, state, 'placement.accessScope'),
    licenseScope: requiredString(placementFields.licenseScope, state, 'placement.licenseScope'),
  };

  return deepFreeze({
    format: 'nihongo-speech-placement', version: 1, inputKey: root.inputKey, provenance, placement,
  });
}
