/** Canonical read/verify layer for the shared audio resource contract v1.
 *
 * The reader accepts only a declared capability, loads and verifies the exact
 * root, then lazily authenticates placement/clip shards and media bytes through
 * the release namespace. No synthesis, provider networking, fallback voice or
 * persistent-download claim is made here. All returned records are detached,
 * frozen snapshots; a ready result can never be produced from an unverified
 * manifest assertion alone.
 */
import {createSpeechInput} from '../audio/speech-input.mjs';
import {canonicalStringify, isTaskKey, sha256} from '../schema/event.mjs';
import {admitAudioResourceRefs, validateAudioCapability} from './audio-resources.mjs';

const PROTOCOL = 'nsrs-audio-resources/v1';
const ROOT_FORMAT = 'nihongo-audio-release';
const PLACEMENT_FORMAT = 'nihongo-audio-placements';
const CLIP_FORMAT = 'nihongo-audio-clips';
const ROUTING = 'sha256-first-byte-mod64-v1';
const ROOT_LIMIT = 64 * 1024;
const SHARD_LIMIT = 1024 * 1024;
const CLIP_LIMIT = 2 * 1024 * 1024;
const PACK_LIMIT = 1024 * 1024;
const MAX_SHARDS = 64;
const MAX_PACKS = 64;
const MAX_PROFILES = 16;
const MAX_ROWS = 4096;
const MAX_SEGMENTS = 512;
const MAX_METADATA_SHARDS = 8;
const MEDIA_LIMIT = 8 * 1024 * 1024;
const MEDIA_ENTRIES = 12;
const PACK_BYTES_LIMIT = 64 * 1024 * 1024;
const HEX = /^[0-9a-f]{64}$/;
const STATES = new Set(['pending', 'running', 'verified', 'failed', 'stale']);
const ACOUSTIC = new Set(['unreviewed', 'accepted']);
const ENC = new TextEncoder();
const DEC = new TextDecoder('utf-8', {fatal: true});
const READY_RESULTS = new WeakSet();

class AudioIntegrityError extends Error {
  constructor(message) { super(message); this.audioCode = 'integrity'; }
}
class AudioUnsupportedError extends Error {
  constructor(message) { super(message); this.audioCode = 'unsupported'; }
}
class AudioCancelledError extends Error {
  constructor(message = 'audio-cancelled') { super(message); this.audioCode = 'cancelled'; }
}
class AudioOfflineError extends Error {
  constructor(message) { super(message); this.audioCode = 'offline'; }
}
const bad = message => { throw new AudioIntegrityError(message); };
const unsupported = message => { throw new AudioUnsupportedError(message); };
const cancelled = () => { throw new AudioCancelledError(); };
const offline = message => { throw new AudioOfflineError(message); };

const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isScalar = value => {
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

function exactRecord(value, names, label) {
  if (!isPlain(value)) bad(`${label}-object`);
  const own = Reflect.ownKeys(value);
  if (own.length !== names.length || own.some(key => typeof key !== 'string')) {
    bad(`${label}-keys`);
  }
  for (const name of names) {
    if (!Object.hasOwn(value, name)) bad(`${label}-missing`);
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) bad(`${label}-accessor`);
  }
  for (const key of own) if (!names.includes(key)) bad(`${label}-unknown`);
  return value;
}

function exactArray(value, label, limit) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    bad(`${label}-array`);
  }
  if (value.length > limit) bad(`${label}-bound`);
  if (Reflect.ownKeys(value).length !== value.length + 1) bad(`${label}-dense`);
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !isScalar(value) || value.trim().length === 0) {
    bad(`${label}-text`);
  }
  return value;
}

function keyString(value, label) {
  if (typeof value !== 'string' || !isScalar(value)) bad(`${label}-text`);
  return value;
}

function safePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return false;
  if (/[\\:%?#]/.test(value) || value.startsWith('/')) return false;
  const parts = value.split('/');
  return parts.every(part => part.length > 0 && part !== '.' && part !== '..' &&
    /^[A-Za-z0-9_.-]+$/.test(part));
}

function refValue(ref, max, label = 'ref') {
  const fields = exactRecord(ref, ['key', 'sha256', 'bytes'], label);
  if (!safePath(fields.key)) bad(`${label}-key`);
  if (typeof fields.sha256 !== 'string' || !HEX.test(fields.sha256)) bad(`${label}-sha256`);
  if (!Number.isSafeInteger(fields.bytes) || fields.bytes < 1 || fields.bytes > max) {
    bad(`${label}-bytes`);
  }
  return Object.freeze({key: fields.key, sha256: fields.sha256, bytes: fields.bytes});
}

function freeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) freeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/* ---------- Strict JSON (duplicate keys never collapse) ---------- */

function parseJsonBytes(bytes) {
  let source;
  try {
    source = DEC.decode(bytes);
  } catch {
    bad('json-utf8');
  }
  return parseJson(source);
}

function parseJson(source) {
  const length = source.length;
  let at = 0;
  let nodes = 0;

  const spend = () => { if (++nodes > 100_000) bad('json-complexity'); };
  const whitespace = () => {
    while (at < length) {
      const code = source.charCodeAt(at);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) at++;
      else break;
    }
  };

  function stringValue() {
    if (source[at] !== '"') bad('json-string');
    at++;
    let out = '';
    while (at < length) {
      const code = source.charCodeAt(at);
      if (code === 0x22) { at++; return out; }
      if (code === 0x5c) {
        at++;
        if (at >= length) bad('json-escape');
        const escape = source[at++];
        if (escape === '"') out += '"';
        else if (escape === '\\') out += '\\';
        else if (escape === '/') out += '/';
        else if (escape === 'b') out += '\b';
        else if (escape === 'f') out += '\f';
        else if (escape === 'n') out += '\n';
        else if (escape === 'r') out += '\r';
        else if (escape === 't') out += '\t';
        else if (escape === 'u') {
          if (at + 4 > length) bad('json-unicode');
          const chunk = source.slice(at, at + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(chunk)) bad('json-unicode');
          let point = parseInt(chunk, 16);
          at += 4;
          if (point >= 0xd800 && point <= 0xdbff) {
            if (source[at] !== '\\' || source[at + 1] !== 'u' || at + 6 > length) {
              bad('json-surrogate');
            }
            const lowChunk = source.slice(at + 2, at + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(lowChunk)) bad('json-surrogate');
            const low = parseInt(lowChunk, 16);
            if (low < 0xdc00 || low > 0xdfff) bad('json-surrogate');
            point = 0x10000 + (point - 0xd800) * 0x400 + (low - 0xdc00);
            at += 6;
          } else if (point >= 0xdc00 && point <= 0xdfff) {
            bad('json-surrogate');
          }
          out += String.fromCodePoint(point);
        } else bad('json-escape');
        continue;
      }
      if (code < 0x20) bad('json-control');
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = source.charCodeAt(at + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) bad('json-surrogate');
        out += source.slice(at, at + 2);
        at += 2;
        continue;
      }
      if (code >= 0xdc00 && code <= 0xdfff) bad('json-surrogate');
      out += source[at++];
    }
    bad('json-unterminated');
  }

  function numberValue() {
    const start = at;
    if (source[at] === '-') at++;
    if (source[at] === '0') at++;
    else if (source[at] >= '1' && source[at] <= '9') {
      while (source[at] >= '0' && source[at] <= '9') at++;
    } else bad('json-number');
    if (source[at] === '.') {
      at++;
      if (!(source[at] >= '0' && source[at] <= '9')) bad('json-number');
      while (source[at] >= '0' && source[at] <= '9') at++;
    }
    if (source[at] === 'e' || source[at] === 'E') {
      at++;
      if (source[at] === '+' || source[at] === '-') at++;
      if (!(source[at] >= '0' && source[at] <= '9')) bad('json-number');
      while (source[at] >= '0' && source[at] <= '9') at++;
    }
    const value = Number(source.slice(start, at));
    if (!Number.isFinite(value) || Object.is(value, -0)) bad('json-number-range');
    return value;
  }

  function objectValue(depth) {
    at++;
    whitespace();
    const out = {};
    const seen = new Set();
    if (source[at] === '}') { at++; return out; }
    for (;;) {
      whitespace();
      const key = stringValue();
      if (seen.has(key)) bad('json-duplicate-key');
      seen.add(key);
      whitespace();
      if (source[at] !== ':') bad('json-colon');
      at++;
      const value = valueAt(depth + 1);
      Object.defineProperty(out, key, {
        value, enumerable: true, writable: true, configurable: true,
      });
      whitespace();
      if (source[at] === ',') { at++; continue; }
      if (source[at] === '}') { at++; break; }
      bad('json-object');
    }
    return out;
  }

  function arrayValue(depth) {
    at++;
    whitespace();
    const out = [];
    if (source[at] === ']') { at++; return out; }
    for (;;) {
      out.push(valueAt(depth + 1));
      whitespace();
      if (source[at] === ',') { at++; continue; }
      if (source[at] === ']') { at++; break; }
      bad('json-array');
    }
    return out;
  }

  function valueAt(depth) {
    if (depth > 64) bad('json-depth');
    whitespace();
    if (at >= length) bad('json-end');
    const code = source[at];
    if (code === '"') { spend(); return stringValue(); }
    if (code === '{') { spend(); return objectValue(depth); }
    if (code === '[') { spend(); return arrayValue(depth); }
    if (code === 't') {
      if (source.slice(at, at + 4) === 'true') { at += 4; spend(); return true; }
      bad('json-literal');
    }
    if (code === 'f') {
      if (source.slice(at, at + 5) === 'false') { at += 5; spend(); return false; }
      bad('json-literal');
    }
    if (code === 'n') {
      if (source.slice(at, at + 4) === 'null') { at += 4; spend(); return null; }
      bad('json-literal');
    }
    if (code === '-' || (code >= '0' && code <= '9')) { spend(); return numberValue(); }
    bad('json-value');
  }

  const result = valueAt(0);
  whitespace();
  if (at !== length) bad('json-trailing');
  return result;
}

/* ---------- Profiles and root ---------- */

function copyJson(value, depth = 0) {
  if (depth > 64) bad('settings-depth');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (!isScalar(value)) bad('settings-string');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) bad('settings-number');
    return value;
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype ||
        Reflect.ownKeys(value).length !== value.length + 1) bad('settings-array');
    return Object.freeze(value.map(item => copyJson(item, depth + 1)));
  }
  if (!isPlain(value)) bad('settings-object');
  const out = {};
  for (const key of Object.keys(value)) {
    if (!isScalar(key)) bad('settings-key');
    Object.defineProperty(out, key, {
      value: copyJson(value[key], depth + 1),
      enumerable: true, writable: true, configurable: true,
    });
  }
  return Object.freeze(out);
}

function profileValue(raw) {
  const fields = exactRecord(raw, ['providerRoute', 'model', 'voice', 'settings'], 'profile');
  const providerRoute = text(fields.providerRoute, 'profile.providerRoute');
  const model = text(fields.model, 'profile.model');
  const voice = text(fields.voice, 'profile.voice');
  if (!isPlain(fields.settings)) bad('profile-settings-object');
  try { canonicalStringify(fields.settings); } catch { bad('profile-settings-json'); }
  const synthetic = [providerRoute, model, voice].filter(value => value === 'local-fixture').length;
  if (synthetic > 0 && synthetic !== 3) bad('profile-synthetic-mixed');
  return Object.freeze({providerRoute, model, voice, settings: copyJson(fields.settings)});
}

function validateRoot(data, release) {
  const fields = exactRecord(data, [
    'format', 'version', 'capability', 'contentRelease', 'projectionId', 'identities',
    'correctionLedgerRevision', 'routing', 'defaultProfileId', 'profiles',
    'placementShards', 'clipShards', 'packs',
  ], 'root');
  if (fields.format !== ROOT_FORMAT) bad('root-format');
  if (fields.version !== 1 && fields.version !== 2) unsupported('root-version');
  if (fields.capability !== PROTOCOL) bad('root-capability');
  if (fields.routing !== ROUTING) unsupported('root-routing');
  if (text(fields.contentRelease, 'root.contentRelease') !== release.contentRelease) {
    bad('root-content-release');
  }
  if (text(fields.projectionId, 'root.projectionId') !== release.projectionId) {
    bad('root-projection');
  }
  const identities = exactRecord(fields.identities,
    ['catalog', 'registry', 'grammar', 'dictionary'], 'root.identities');
  const identitySnapshot = Object.freeze({
    catalog: text(identities.catalog, 'identity.catalog'),
    registry: text(identities.registry, 'identity.registry'),
    grammar: text(identities.grammar, 'identity.grammar'),
    dictionary: text(identities.dictionary, 'identity.dictionary'),
  });
  const correctionLedgerRevision = text(fields.correctionLedgerRevision, 'root.correctionLedgerRevision');

  const profileValues = exactArray(fields.profiles, 'root.profiles', MAX_PROFILES);
  const profileById = new Map();
  for (const raw of profileValues) {
    const entry = exactRecord(raw, ['id', 'profile'], 'profile-entry');
    const id = text(entry.id, 'profile-id');
    if (profileById.has(id)) bad('profile-duplicate');
    profileById.set(id, profileValue(entry.profile));
  }
  const defaultProfileId = fields.defaultProfileId;
  if (defaultProfileId !== null) {
    if (typeof defaultProfileId !== 'string' || !profileById.has(defaultProfileId)) {
      bad('default-profile');
    }
  }

  const refKeys = new Set();
  const claimRef = (ref, label) => {
    if (ref.key === 'root.json') bad(`${label}-root-key`);
    if (refKeys.has(ref.key)) bad(`${label}-duplicate-key`);
    refKeys.add(ref.key);
  };

  const placementValues = exactArray(fields.placementShards, 'root.placementShards', MAX_SHARDS);
  const placementByBucket = new Map();
  for (const raw of placementValues) {
    const entry = exactRecord(raw, ['bucket', 'ref'], 'placement-shard');
    const bucket = entry.bucket;
    if (!Number.isSafeInteger(bucket) || bucket < 0 || bucket > 63 || Object.is(bucket, -0)) {
      bad('placement-bucket');
    }
    if (placementByBucket.has(bucket)) bad('placement-bucket-duplicate');
    const ref = refValue(entry.ref, SHARD_LIMIT, 'placement-ref');
    claimRef(ref, 'placement');
    placementByBucket.set(bucket, ref);
  }

  const clipValues = exactArray(fields.clipShards, 'root.clipShards', MAX_SHARDS);
  const clipByBucket = new Map();
  for (const raw of clipValues) {
    const entry = exactRecord(raw, ['bucket', 'ref'], 'clip-shard');
    const bucket = entry.bucket;
    if (!Number.isSafeInteger(bucket) || bucket < 0 || bucket > 63 || Object.is(bucket, -0)) {
      bad('clip-bucket');
    }
    if (clipByBucket.has(bucket)) bad('clip-bucket-duplicate');
    const ref = refValue(entry.ref, SHARD_LIMIT, 'clip-ref');
    claimRef(ref, 'clip');
    clipByBucket.set(bucket, ref);
  }

  const packValues = exactArray(fields.packs, 'root.packs', MAX_PACKS);
  const packsById = new Map();
  for (const raw of packValues) {
    const entry = exactRecord(raw, ['id', 'ref', 'totalBytes'], 'pack');
    const id = text(entry.id, 'pack-id');
    if (packsById.has(id)) bad('pack-duplicate');
    const ref = refValue(entry.ref, PACK_LIMIT, 'pack-ref');
    claimRef(ref, 'pack');
    if (!Number.isSafeInteger(entry.totalBytes) || entry.totalBytes < 0 ||
        entry.totalBytes > PACK_BYTES_LIMIT) bad('pack-total');
    packsById.set(id, Object.freeze({id, ref, totalBytes: entry.totalBytes}));
  }

  return {
    version: fields.version,
    contentRelease: fields.contentRelease,
    projectionId: fields.projectionId,
    identities: identitySnapshot,
    correctionLedgerRevision,
    defaultProfileId,
    profileById,
    placementByBucket,
    clipByBucket,
    packsById,
    shardRefs: [
      ...placementByBucket.values(),
      ...clipByBucket.values(),
      ...Array.from(packsById.values(), pack => pack.ref),
    ],
    refKeys,
  };
}

/* ---------- Placement and clip shards ---------- */

function speechInputValue(raw, inputKey) {
  const fields = exactRecord(raw,
    ['format', 'version', 'inputKey', 'segments', 'profile'], 'speech-input');
  if (fields.format !== 'nihongo-speech-input' || fields.version !== 1) bad('speech-input-format');
  if (typeof fields.inputKey !== 'string' || !HEX.test(fields.inputKey) ||
      fields.inputKey !== inputKey) bad('speech-input-key');
  return raw;
}

function rowSegments(raw, label) {
  const values = exactArray(raw, label, MAX_SEGMENTS);
  const segments = [];
  let previousEnd = 0;
  for (const value of values) {
    const fields = exactRecord(value, ['start', 'end', 'inputKey', 'speechInput'], `${label}-row`);
    const start = fields.start, end = fields.end;
    if (!Number.isSafeInteger(start) || start < 0 || Object.is(start, -0)) bad(`${label}-start`);
    if (!Number.isSafeInteger(end) || end <= start) bad(`${label}-end`);
    if (start < previousEnd) bad(`${label}-order`);
    previousEnd = end;
    if (typeof fields.inputKey !== 'string' || !HEX.test(fields.inputKey)) bad(`${label}-inputKey`);
    speechInputValue(fields.speechInput, fields.inputKey);
    segments.push(Object.freeze({
      start, end, inputKey: fields.inputKey, speechInput: fields.speechInput,
    }));
  }
  return Object.freeze(segments);
}

function profileAssignmentsValue(raw, root, pending = false) {
  if (!isPlain(raw)) bad('profile-assignments-object');
  const keys = Reflect.ownKeys(raw);
  if (keys.length > 2 || keys.some(key => key !== 'ja' && key !== 'en')) bad('profile-assignments-keys');
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) bad('profile-assignments-accessor');
    const value = descriptor.value;
    if (value === null && pending) result[key] = null;
    else {
      result[key] = text(value, 'profile-assignment');
      if (root && !root.profileById.has(value)) bad('profile-assignment-unknown');
    }
  }
  return Object.freeze(result);
}

function languageValue(raw, length, pending = false) {
  if (raw === null && pending) return null;
  if (raw === 'ja' || raw === 'en') return raw;
  const values = exactArray(raw, 'source-partition', MAX_SEGMENTS);
  if (!values.length) bad('source-partition-empty');
  let cursor = 0;
  const result = values.map(value => {
    const part = exactRecord(value, ['start', 'end', 'language'], 'source-partition');
    if (!Number.isSafeInteger(part.start) || Object.is(part.start, -0) || part.start !== cursor ||
        !Number.isSafeInteger(part.end) || part.end <= part.start || part.end > length ||
        (part.language !== 'ja' && part.language !== 'en')) bad('source-partition-span');
    cursor = part.end;
    return Object.freeze({start: part.start, end: part.end, language: part.language});
  });
  return Object.freeze(result);
}

function sourceParts(source) {
  const length = Array.from(source.text).length;
  if (Array.isArray(source.language)) {
    if (source.language.at(-1).end !== length) bad('source-partition-coverage');
    return source.language;
  }
  return [{start: 0, end: length, language: source.language}];
}

function placementRowV2(raw, root) {
  const row = exactRecord(raw, ['taskKey', 'contentRevision', 'audioContentRevision', 'fieldId',
    'supportedReadingId', 'profileAssignments', 'language', 'sourceSha256', 'sourceBytes', 'state', 'packId', 'segments'], 'placement-v2');
  if (typeof row.taskKey !== 'string' || !isTaskKey(row.taskKey)) bad('placement-taskKey');
  if (row.supportedReadingId !== null || !STATES.has(row.state)) bad('placement-state');
  if (typeof row.sourceSha256 !== 'string' || !HEX.test(row.sourceSha256) ||
      !Number.isSafeInteger(row.sourceBytes) || row.sourceBytes < 1 || Object.is(row.sourceBytes, -0)) bad('placement-source');
  const profileAssignments = profileAssignmentsValue(row.profileAssignments, root, row.state !== 'verified');
  const language = languageValue(row.language, row.sourceBytes, row.state !== 'verified');
  if (row.packId !== null && !root.packsById.has(row.packId)) bad('placement-packId');
  const values = exactArray(row.segments, 'placement-segments-v2', MAX_SEGMENTS);
  if (row.state === 'verified' ? !values.length || row.packId === null || language === null : values.length !== 0) bad('placement-segments-state');
  const segments = values.map((value, index) => {
    const part = exactRecord(value, ['index', 'start', 'end', 'unit', 'byteStart', 'byteEnd',
      'language', 'profileId', 'packId', 'inputKey', 'speechInput'], 'placement-segment-v2');
    if (part.index !== index || part.unit !== 'codepoint' ||
        !Number.isSafeInteger(part.start) || part.start < 0 || Object.is(part.start, -0) ||
        !Number.isSafeInteger(part.end) || part.end <= part.start ||
        !Number.isSafeInteger(part.byteStart) || part.byteStart < 0 || Object.is(part.byteStart, -0) ||
        !Number.isSafeInteger(part.byteEnd) || part.byteEnd <= part.byteStart || part.byteEnd > row.sourceBytes ||
        (part.language !== 'ja' && part.language !== 'en') || part.packId !== row.packId ||
        !root.profileById.has(part.profileId) || profileAssignments[part.language] !== part.profileId ||
        typeof part.inputKey !== 'string' || !HEX.test(part.inputKey)) bad('placement-segment-v2-identity');
    speechInputValue(part.speechInput, part.inputKey);
    return freeze({...part});
  });
  return freeze({...row, version: 2,
    contentRevision: text(row.contentRevision, 'placement-contentRevision'),
    audioContentRevision: text(row.audioContentRevision, 'placement-audioRevision'),
    fieldId: text(row.fieldId, 'placement-fieldId'), profileAssignments, language, segments});
}

function placementRow(raw, root) {
  if (root.version === 2) return placementRowV2(raw, root);
  const fields = exactRecord(raw, [
    'taskKey', 'contentRevision', 'audioContentRevision', 'fieldId', 'supportedReadingId',
    'profileId', 'language', 'sourceSha256', 'sourceBytes', 'state', 'packId', 'segments',
  ], 'placement-row');
  if (typeof fields.taskKey !== 'string' || !isTaskKey(fields.taskKey)) bad('placement-taskKey');
  const contentRevision = text(fields.contentRevision, 'placement-contentRevision');
  const audioContentRevision = text(fields.audioContentRevision, 'placement-audioRevision');
  const fieldId = text(fields.fieldId, 'placement-fieldId');
  if (fields.supportedReadingId !== null) bad('placement-supportedReadingId');
  const profileId = text(fields.profileId, 'placement-profileId');
  if (!root.profileById.has(profileId)) bad('placement-profile');
  if (fields.language !== 'ja' && fields.language !== 'en' && !(fields.language === null && fields.state !== 'verified')) bad('placement-language');
  if (typeof fields.sourceSha256 !== 'string' || !HEX.test(fields.sourceSha256)) {
    bad('placement-sourceSha256');
  }
  if (!Number.isSafeInteger(fields.sourceBytes) || fields.sourceBytes < 0 ||
      Object.is(fields.sourceBytes, -0)) bad('placement-sourceBytes');
  if (!STATES.has(fields.state)) bad('placement-state');
  if (fields.packId !== null) {
    if (typeof fields.packId !== 'string' || !root.packsById.has(fields.packId)) bad('placement-packId');
  }
  let segments;
  if (fields.state === 'verified') {
    segments = rowSegments(fields.segments, 'placement-segments');
    if (segments.length === 0) bad('placement-empty-segments');
  } else {
    segments = exactArray(fields.segments, 'placement-segments', MAX_SEGMENTS);
    if (segments.length !== 0) bad('placement-nonverified-segments');
    segments = Object.freeze([]);
  }
  return Object.freeze({
    taskKey: fields.taskKey,
    contentRevision,
    audioContentRevision,
    fieldId,
    supportedReadingId: null,
    profileId,
    language: fields.language,
    sourceSha256: fields.sourceSha256,
    sourceBytes: fields.sourceBytes,
    state: fields.state,
    packId: fields.packId,
    segments,
  });
}

function validatePlacementShard(data, {bucket, contentRelease, projectionId}, root) {
  const fields = exactRecord(data,
    ['format', 'version', 'contentRelease', 'projectionId', 'bucket', 'rows'], 'placement-shard');
  if (fields.format !== PLACEMENT_FORMAT || fields.version !== root.version) bad('placement-format');
  if (fields.contentRelease !== contentRelease || fields.projectionId !== projectionId) {
    bad('placement-scope');
  }
  if (fields.bucket !== bucket) bad('placement-bucket');
  const values = exactArray(fields.rows, 'placement-rows', MAX_ROWS);
  const rows = [];
  const tuples = new Set();
  for (const raw of values) {
    const row = placementRow(raw, root);
    const tuple = canonicalStringify([row.taskKey, row.contentRevision, row.fieldId, row.supportedReadingId,
      row.version === 2 ? row.profileAssignments : row.profileId]);
    if (tuples.has(tuple)) bad('placement-row-duplicate');
    tuples.add(tuple);
    rows.push(row);
  }
  return {rows};
}

function clipRow(raw, root, bucket) {
  const fields = exactRecord(raw,
    ['inputKey', 'ref', 'codec', 'mime', 'profileId', 'verification', 'acoustic'], 'clip-row');
  if (typeof fields.inputKey !== 'string' || !HEX.test(fields.inputKey)) bad('clip-inputKey');
  const computed = parseInt(fields.inputKey.slice(0, 2), 16) % 64;
  if (computed !== bucket) bad('clip-bucket-key');
  const profileId = text(fields.profileId, 'clip-profileId');
  if (!root.profileById.has(profileId)) bad('clip-profile');
  if (fields.codec !== 'm4a' || fields.mime !== 'audio/mp4') bad('clip-format');
  if (fields.verification !== 'verified') bad('clip-verification');
  if (!ACOUSTIC.has(fields.acoustic)) bad('clip-acoustic');
  const ref = refValue(fields.ref, CLIP_LIMIT, 'clip-ref');
  if (ref.key === 'root.json' || root.refKeys.has(ref.key)) bad('clip-ref-key');
  return Object.freeze({
    inputKey: fields.inputKey,
    ref,
    codec: fields.codec,
    mime: fields.mime,
    profileId,
    verification: fields.verification,
    acoustic: fields.acoustic,
  });
}

function validateClipShard(data, {bucket, contentRelease, projectionId}, root) {
  const fields = exactRecord(data,
    ['format', 'version', 'contentRelease', 'projectionId', 'bucket', 'rows'], 'clip-shard');
  if (fields.format !== CLIP_FORMAT || fields.version !== root.version) bad('clip-shard-format');
  if (fields.contentRelease !== contentRelease || fields.projectionId !== projectionId) {
    bad('clip-shard-scope');
  }
  if (fields.bucket !== bucket) bad('clip-shard-bucket');
  const values = exactArray(fields.rows, 'clip-rows', MAX_ROWS);
  const rows = [];
  const seen = new Set();
  for (const raw of values) {
    const row = clipRow(raw, root, bucket);
    if (seen.has(row.inputKey)) bad('clip-key-duplicate');
    seen.add(row.inputKey);
    rows.push(row);
  }
  return {rows};
}

/* ---------- Selection ---------- */

function selectionValueV2(raw) {
  const value = exactRecord(raw, ['version', 'taskKey', 'contentRevision', 'audioContentRevision',
    'contentRelease', 'fields', 'profileAssignments', 'supportedReadingId', 'face', 'sourceFields'], 'selection-v2');
  const profileAssignments = profileAssignmentsValue(value.profileAssignments, null, true);
  // Reuse every legacy scalar selection/directive check with a detached scalar
  // validation view; preserve original partitions only in this explicit version.
  const languages = new Map();
  const fields = exactArray(value.sourceFields, 'selection-sourceFields', MAX_SEGMENTS).map(source => {
    exactRecord(source, ['fieldId', 'text', 'language', 'pronunciationDirectives', 'pendingReasons'], 'source-field');
    const language = languageValue(source.language, Array.from(text(source.text, 'source-text')).length, true);
    if (Array.isArray(language) && language.at(-1).end !== Array.from(source.text).length) bad('source-partition-coverage');
    languages.set(source.fieldId, language);
    return {...source, language: Array.isArray(language) ? 'ja' : language};
  });
  const {version, profileAssignments: ignored, ...base} = value;
  const checked = selectionValue({...base, profileId: 'v2-validation', sourceFields: fields});
  const sources = new Map([...checked.sourceFields].map(([id, source]) => [id, Object.freeze({...source, language: languages.get(id)})]));
  return Object.freeze({...checked, version: 2, profileId: null, profileAssignments, sourceFields: sources});
}

function selectionValue(raw) {
  if (isPlain(raw) && Object.getOwnPropertyDescriptor(raw, 'version')?.value === 2) return selectionValueV2(raw);
  const fields = exactRecord(raw, [
    'taskKey', 'contentRevision', 'audioContentRevision', 'contentRelease', 'fields',
    'profileId', 'supportedReadingId', 'face', 'sourceFields',
  ], 'selection');
  if (typeof fields.taskKey !== 'string' || !isTaskKey(fields.taskKey)) bad('selection-taskKey');
  const contentRevision = text(fields.contentRevision, 'selection-contentRevision');
  const audioContentRevision = text(fields.audioContentRevision, 'selection-audioRevision');
  const contentRelease = text(fields.contentRelease, 'selection-contentRelease');
  const fieldValues = exactArray(fields.fields, 'selection-fields', MAX_SEGMENTS);
  if (fieldValues.length === 0) bad('selection-fields-empty');
  const fieldIds = [];
  const fieldSeen = new Set();
  for (const value of fieldValues) {
    const fieldId = text(value, 'selection-fieldId');
    if (fieldSeen.has(fieldId)) bad('selection-field-duplicate');
    fieldSeen.add(fieldId);
    fieldIds.push(fieldId);
  }
  if (fields.profileId !== null && typeof fields.profileId !== 'string') bad('selection-profileId');
  if (fields.profileId === '') bad('selection-profileId');
  if (fields.supportedReadingId !== null) bad('selection-supportedReadingId');
  if (fields.face !== 'answer' && fields.face !== 'front') bad('selection-face');
  const sourceValues = exactArray(fields.sourceFields, 'selection-sourceFields', MAX_SEGMENTS);
  const sources = new Map();
  for (const value of sourceValues) {
    const source = exactRecord(value, ['fieldId', 'text', 'language', 'pronunciationDirectives', 'pendingReasons'], 'source-field');
    const fieldId = text(source.fieldId, 'source-fieldId');
    if (sources.has(fieldId)) bad('source-field-duplicate');
    const sourceText = text(source.text, 'source-text');
    if (source.language !== 'ja' && source.language !== 'en' && source.language !== null) {
      bad('source-language');
    }
    const pendingReasons = exactArray(source.pendingReasons, 'source-pending', MAX_SEGMENTS).map(reason => text(reason, 'pending-reason'));
    let pronunciationDirectives;
    try {
      pronunciationDirectives = createSpeechInput({segments:[{language: source.language ?? 'ja', text:sourceText, pronunciationDirectives:source.pronunciationDirectives}],profile:{providerRoute:'validation',model:'validation',voice:'validation',settings:{}}}).segments[0].pronunciationDirectives;
    } catch { bad('source-directives'); }
    sources.set(fieldId, Object.freeze({
      fieldId, text: sourceText, language: source.language,
      pronunciationDirectives, pendingReasons:Object.freeze(pendingReasons),
    }));
  }
  return Object.freeze({
    taskKey: fields.taskKey,
    contentRevision,
    audioContentRevision,
    contentRelease,
    fields: Object.freeze(fieldIds),
    profileId: fields.profileId,
    supportedReadingId: null,
    face: fields.face,
    sourceFields: sources,
  });
}

/* ---------- Public helpers ---------- */

function toHex(bytes) {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** Raw lower-case SHA-256 of the exact bytes, never of a UTF-8 reinterpretation. */
export async function hashAudioBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('hashAudioBytes expects a Uint8Array');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') {
    throw new Error('audio-sha256-unavailable');
  }
  const digest = await subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

/** First SHA-256 byte of the UTF-8 task key modulo 64. */
export function audioBucket(taskKey) {
  if (typeof taskKey !== 'string') throw new TypeError('audioBucket expects a task key string');
  return parseInt(sha256(taskKey).slice(0, 2), 16) % 64;
}

function statusFor(error) {
  if (error?.audioCode === 'cancelled') return {status: 'cancelled'};
  if (error?.audioCode === 'unsupported') return {status: 'unsupported-capability'};
  if (error?.audioCode === 'offline') return {status: 'offline-missing'};
  return {status: 'integrity-invalid'};
}

function cancellationPromise(signal) {
  let remove = null;
  const promise = new Promise((resolve, reject) => {
    if (!signal) return;
    if (signal.aborted) { reject(new AudioCancelledError()); return; }
    const onAbort = () => reject(new AudioCancelledError());
    remove = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, {once: true});
  });
  return {promise, remove};
}

async function withSignal(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) throw new AudioCancelledError();
  const cancellation = cancellationPromise(signal);
  try {
    return await Promise.race([promise, cancellation.promise]);
  } finally {
    cancellation.remove?.();
  }
}

/* ---------- Reader ---------- */

/** Create a reader over a declared capability. An invalid declaration is kept
 * as an explicit status rather than silently falling back to trial audio. */
export function createAudioReleaseReader({capability} = {}) {
  let snapshot = null;
  let declarationError = null;
  try {
    snapshot = validateAudioCapability(capability);
  } catch (error) {
    declarationError = error;
  }

  let disposed = false;
  let root = null;
  let loading = null;
  let loadingSignal = null;
  const lifecycle = typeof AbortController === 'function' ? new AbortController() : null;
  const admitted = new Map();
  const metadata = new Map();
  const media = new Map();
  let mediaBytes = 0;

  if (snapshot) {
    admitted.set(snapshot.release.root.key, Object.freeze({
      ...snapshot.release.root, media: false,
    }));
  }

  const resources = snapshot?.resources ?? null;

  function checkAlive() {
    if (disposed) throw new AudioCancelledError('audio-disposed');
  }

  function admit(ref) {
    const existing = admitted.get(ref.key);
    if (existing) {
      if (existing.sha256 !== ref.sha256 || existing.bytes !== ref.bytes) {
        bad('ref-conflict');
      }
      return existing;
    }
    const entry = Object.freeze({key: ref.key, sha256: ref.sha256, bytes: ref.bytes, media: false});
    admitted.set(ref.key, entry);
    return entry;
  }

  function admitMedia(ref) {
    const existing = admitted.get(ref.key);
    if (existing) {
      if (existing.sha256 !== ref.sha256 || existing.bytes !== ref.bytes || !existing.media) {
        bad('clip-ref-conflict');
      }
      return existing;
    }
    const entry = Object.freeze({key: ref.key, sha256: ref.sha256, bytes: ref.bytes, media: true});
    admitted.set(ref.key, entry);
    return entry;
  }

  function metadataGet(key) {
    const hit = metadata.get(key);
    if (!hit) return null;
    metadata.delete(key);
    metadata.set(key, hit);
    return hit;
  }

  function metadataSet(key, kind, value) {
    if (metadata.has(key)) metadata.delete(key);
    while (metadata.size >= MAX_METADATA_SHARDS) {
      const oldest = metadata.keys().next().value;
      metadata.delete(oldest);
    }
    metadata.set(key, {kind, value});
  }

  function mediaGet(key) {
    const hit = media.get(key);
    if (!hit) return null;
    media.delete(key);
    media.set(key, hit);
    return hit;
  }

  function rememberMedia(ref, bytes) {
    const old = media.get(ref.key);
    if (old) {
      media.delete(ref.key);
      mediaBytes -= old.bytes.byteLength;
    }
    while (media.size &&
      (media.size >= MEDIA_ENTRIES || mediaBytes + bytes.byteLength > MEDIA_LIMIT)) {
      const [key, value] = media.entries().next().value;
      media.delete(key);
      mediaBytes -= value.bytes.byteLength;
    }
    if (bytes.byteLength > MEDIA_LIMIT) return;
    media.set(ref.key, {ref, bytes});
    mediaBytes += bytes.byteLength;
  }

  async function readVerified(ref, limit, signal) {
    checkAlive();
    if (signal?.aborted) throw new AudioCancelledError();
    const known = admitted.get(ref.key);
    if (!known || known.sha256 !== ref.sha256 || known.bytes !== ref.bytes) {
      bad('ref-unadmitted');
    }
    if (!resources) offline('resources-unavailable');
    let value;
    const readController=new AbortController();
    const abortRead=()=>readController.abort();
    for(const parent of [signal,lifecycle?.signal]){if(parent?.aborted)abortRead();else parent?.addEventListener('abort',abortRead,{once:true});}
    const resourceSignal=readController.signal;
    try {
      value = await withSignal(Promise.resolve(resources.read(Object.freeze({key: known.key, sha256: known.sha256, bytes: known.bytes}), {signal:resourceSignal})), resourceSignal);
    } catch (error) {
      if (error?.audioCode) throw error;
      if (resourceSignal.aborted) throw new AudioCancelledError();
      offline('read');
    }finally{for(const parent of [signal,lifecycle?.signal])parent?.removeEventListener('abort',abortRead);}
    checkAlive();
    if (signal?.aborted) throw new AudioCancelledError();
    if (!(value instanceof Uint8Array)) bad('read-bytes');
    const bytes = new Uint8Array(value);
    if (bytes.byteLength > limit) bad('read-limit');
    if (bytes.byteLength !== known.bytes) bad('read-length');
    let digest;
    try {
      digest = await hashAudioBytes(bytes);
    } catch {
      bad('read-hash');
    }
    checkAlive();
    if (signal?.aborted) throw new AudioCancelledError();
    if (digest !== known.sha256) bad('read-digest');
    return bytes;
  }

  async function loadRoot(signal) {
    const rootRef = snapshot.release.root;
    const bytes = await readVerified(rootRef, ROOT_LIMIT, signal);
    const data = parseJsonBytes(bytes);
    const validated = validateRoot(data, snapshot.release);
    root = validated;
    // The root is now authentic. Only its transitive descriptor set may be
    // fetched by the transport adapter.
    for (const ref of validated.shardRefs) admit(ref);
    if (resources) {
      try {
        admitAudioResourceRefs(resources, validated.shardRefs);
      } catch (error) {
        if (error?.audioCode) throw error;
        bad('admit-shards');
      }
    }
    return validated;
  }

  function loadInternal({signal} = {}) {
    if (disposed) return Promise.reject(new AudioCancelledError('audio-disposed'));
    if (declarationError) return Promise.reject(declarationError);
    if (root) return Promise.resolve(root);
    if (loading && loadingSignal === signal && !loadingSignal?.aborted) return loading;
    const pending = loadRoot(signal).then(value => {
      if (disposed || signal?.aborted) throw new AudioCancelledError('audio-disposed');
      return value;
    }, error => {
      if(loading===pending)loading = null;
      throw error;
    });
    loading=pending;loadingSignal=signal;
    return pending;
  }

  async function placementShard(bucket, signal) {
    const ref = root.placementByBucket.get(bucket);
    if (!ref) offline('placement-shard-missing');
    const key = `placement:${ref.key}`;
    const cached = metadataGet(key);
    if (cached) {
      if (cached.kind !== 'placement') bad('metadata-conflict');
      return cached.value;
    }
    const bytes = await readVerified(ref, SHARD_LIMIT, signal);
    const data = parseJsonBytes(bytes);
    const shard = validatePlacementShard(data, {
      bucket,
      contentRelease: root.contentRelease,
      projectionId: root.projectionId,
    }, root);
    metadataSet(key, 'placement', shard);
    return shard;
  }

  async function clipShard(bucket, signal) {
    const ref = root.clipByBucket.get(bucket);
    if (!ref) offline('clip-shard-missing');
    const key = `clip:${ref.key}`;
    const cached = metadataGet(key);
    if (cached) {
      if (cached.kind !== 'clip') bad('metadata-conflict');
      return cached.value;
    }
    const bytes = await readVerified(ref, SHARD_LIMIT, signal);
    const data = parseJsonBytes(bytes);
    const shard = validateClipShard(data, {
      bucket,
      contentRelease: root.contentRelease,
      projectionId: root.projectionId,
    }, root);
    for (const row of shard.rows) admitMedia(row.ref);
    if (resources) {
      try {
        admitAudioResourceRefs(resources, shard.rows.map(row => row.ref));
      } catch (error) {
        if (error?.audioCode) throw error;
        bad('admit-clips');
      }
    }
    metadataSet(key, 'clip', shard);
    return shard;
  }

  function boundaryAt(bytes, offset) {
    if (offset === 0 || offset === bytes.byteLength) return true;
    return (bytes[offset] & 0xc0) !== 0x80;
  }

  function verifySegments(row, source, rootProfile) {
    const sourceBytes = ENC.encode(source.text);
    if (sourceBytes.byteLength !== row.sourceBytes) bad('source-length');
    if (sha256(source.text) !== row.sourceSha256) bad('source-digest');
    let cursor = 0;
    const output = [];
    const actualDirectives = [];
    let codepointCursor = 0;
    for (const segment of row.segments) {
      if (segment.start !== cursor) bad('segment-gap');
      if (segment.end > sourceBytes.byteLength) bad('segment-end');
      if (!boundaryAt(sourceBytes, segment.start) || !boundaryAt(sourceBytes, segment.end)) {
        bad('segment-boundary');
      }
      let computed;
      try {
        computed = createSpeechInput({
          segments: segment.speechInput.segments,
          profile: rootProfile,
        });
      } catch {
        bad('speech-input-invalid');
      }
      let canonical;
      try {
        canonical = canonicalStringify(computed);
      } catch {
        bad('speech-input-canonical');
      }
      let supplied;
      try {
        supplied = canonicalStringify(segment.speechInput);
      } catch {
        bad('speech-input-supplied');
      }
      if (canonical !== supplied) bad('speech-input-mismatch');
      if (computed.inputKey !== segment.inputKey) bad('speech-input-key');
      if (computed.segments.some(part => part.language !== row.language)) {
        bad('speech-input-language');
      }
      let slice;
      try {
        slice = DEC.decode(sourceBytes.subarray(segment.start, segment.end));
      } catch {
        bad('segment-utf8');
      }
      if (computed.segments.map(part => part.text).join('') !== slice) {
        bad('segment-source-text');
      }
      for (const part of computed.segments) {
        for (const directive of part.pronunciationDirectives) actualDirectives.push({start:codepointCursor+directive.start,end:codepointCursor+directive.end,reading:directive.reading});
        codepointCursor += Array.from(part.text).length;
      }
      output.push(Object.freeze({
        fieldId: row.fieldId,
        packId: row.packId,
        supportedReadingId: row.supportedReadingId,
        start: segment.start,
        end: segment.end,
        inputKey: segment.inputKey,
        speechInput: computed,
      }));
      cursor = segment.end;
    }
    if (cursor !== sourceBytes.byteLength) bad('segment-coverage');
    if (canonicalStringify(actualDirectives) !== canonicalStringify(source.pronunciationDirectives)) bad('source-pronunciation-mismatch');
    return Object.freeze(output);
  }

  function verifySegmentsV2(row, source, selected) {
    if (canonicalStringify(row.language) !== canonicalStringify(source.language)) bad('source-partition-mismatch');
    const points = Array.from(source.text), bytes = ENC.encode(source.text), parts = sourceParts(source);
    if (bytes.length !== row.sourceBytes || sha256(source.text) !== row.sourceSha256 || parts.length !== row.segments.length) bad('source-v2-coverage');
    const used = [...new Set(parts.map(part => part.language))].sort();
    if (canonicalStringify(Object.keys(row.profileAssignments).sort()) !== canonicalStringify(used)) bad('source-v2-profiles');
    const output = [];
    for (const [index, segment] of row.segments.entries()) {
      const part = parts[index];
      if (segment.start !== part.start || segment.end !== part.end || segment.language !== part.language ||
          row.profileAssignments[part.language] !== selected.profileAssignments[part.language]) bad('source-v2-segment');
      const start = ENC.encode(points.slice(0, part.start).join('')).length;
      const end = start + ENC.encode(points.slice(part.start, part.end).join('')).length;
      if (segment.byteStart !== start || segment.byteEnd !== end) bad('source-v2-byte-span');
      const directives = [];
      for (const directive of source.pronunciationDirectives) {
        if (directive.start < part.end && directive.end > part.start) {
          if (directive.start < part.start || directive.end > part.end) bad('source-v2-directive-crossing');
          directives.push({start: directive.start - part.start, end: directive.end - part.start, reading: directive.reading});
        }
      }
      let computed;
      try { computed = createSpeechInput({segments: [{language: part.language,
        text: points.slice(part.start, part.end).join(''), pronunciationDirectives: directives}],
        profile: root.profileById.get(segment.profileId)}); } catch { bad('source-v2-input'); }
      if (computed.inputKey !== segment.inputKey || canonicalStringify(computed) !== canonicalStringify(segment.speechInput)) bad('source-v2-speech');
      output.push(Object.freeze({...segment, fieldId: row.fieldId, supportedReadingId: row.supportedReadingId}));
    }
    return output;
  }

  async function resolveSelection(selection, signal) {
    if (disposed) return {status: 'cancelled'};
    if (signal?.aborted) return {status: 'cancelled'};
    if (declarationError) return statusFor(declarationError);
    let selected;
    try {
      selected = selectionValue(selection);
    } catch (error) {
      return statusFor(error);
    }
    if (selected.face !== 'answer') return {status: 'face-hidden'};
    if (selected.contentRelease !== snapshot.release.contentRelease) {
      return {status: 'content-release-mismatch'};
    }
    if (selected.version !== 2 && selected.profileId === null) return {status: 'profile-unassigned'};
    let loaded;
    try {
      loaded = await loadInternal({signal});
    } catch (error) {
      return statusFor(error);
    }
    if (disposed) return {status: 'cancelled'};
    if (signal?.aborted) return {status: 'cancelled'};
    if (loaded.projectionId !== snapshot.release.projectionId ||
        loaded.contentRelease !== snapshot.release.contentRelease) {
      return {status: 'integrity-invalid'};
    }
    if ((selected.version === 2 ? 2 : 1) !== loaded.version) return {status: 'unsupported-capability'};
    if (selected.version === 2) {
      for (const fieldId of selected.fields) {
        const source = selected.sourceFields.get(fieldId);
        if (!source) return {status: 'source-stale'};
        if (source.language === null) return {status: 'pending'};
        for (const part of sourceParts(source)) {
          const id = selected.profileAssignments[part.language];
          if (!id) return {status: 'profile-unassigned'};
          if (!loaded.profileById.has(id)) return {status: 'profile-unavailable'};
        }
      }
    }
    const profile = selected.version === 2 ? null : loaded.profileById.get(selected.profileId);
    if (selected.version !== 2 && !profile) return {status: 'profile-unavailable'};

    let bucket;
    try {
      bucket = audioBucket(selected.taskKey);
    } catch {
      return {status: 'integrity-invalid'};
    }
    let shard;
    try {
      shard = await placementShard(bucket, signal);
    } catch (error) {
      return statusFor(error);
    }
    if (disposed || signal?.aborted) return {status: 'cancelled'};

    const pieces = [];
    const selectedPacks = new Set();let allFieldsPacked=true;
    for (const fieldId of selected.fields) {
      const source = selected.sourceFields.get(fieldId);
      if (!source) return {status:'source-stale'};
      if (source.pendingReasons.length || source.language === null) return {status:'pending'};
      let row = null;
      for (const candidate of shard.rows) {
        if (candidate.taskKey === selected.taskKey &&
            candidate.contentRevision === selected.contentRevision &&
            candidate.fieldId === fieldId &&
            (selected.version === 2 ? candidate.version === 2 &&
              Object.entries(candidate.profileAssignments).every(([lang, id]) => selected.profileAssignments[lang] === id) : candidate.profileId === selected.profileId)) {
          row = candidate;
          break;
        }
      }
      if (!row) return {status: 'source-stale'};
      if (row.audioContentRevision !== selected.audioContentRevision) {
        return {status: 'source-stale'};
      }
      if (row.state === 'pending' || row.state === 'running') return {status: 'pending'};
      if (row.state === 'failed') return {status: 'preparation-failed'};
      if (row.state === 'stale') return {status: 'source-stale'};
      if(row.packId===null)allFieldsPacked=false;else selectedPacks.add(row.packId);
      if (canonicalStringify(row.language) !== canonicalStringify(source.language)) return {status: 'source-stale'};
      if (row.sourceBytes !== ENC.encode(source.text).byteLength ||
          row.sourceSha256 !== sha256(source.text)) {
        return {status: 'source-stale'};
      }
      try {
        pieces.push(...(selected.version === 2 ? verifySegmentsV2(row, source, selected) : verifySegments(row, source, profile)));
      } catch (error) {
        return statusFor(error);
      }
    }

    const segments = [];
    const shards = new Map();
    try {
      for (const piece of pieces) {
        const clipBucket = parseInt(piece.inputKey.slice(0, 2), 16) % 64;
        let clipShardValue = shards.get(clipBucket);
        if (!clipShardValue) {
          clipShardValue = await clipShard(clipBucket, signal);
          shards.set(clipBucket, clipShardValue);
        }
        if (disposed || signal?.aborted) return {status: 'cancelled'};
        const clip = clipShardValue.rows.find(candidate => candidate.inputKey === piece.inputKey);
        if (!clip) bad('clip-missing');
        if (clip.profileId !== (selected.version === 2 ? piece.profileId : selected.profileId)) bad('clip-profile-mismatch');
        if (clip.verification !== 'verified') bad('clip-unverified');
        segments.push(Object.freeze({
          ...(selected.version === 2 ? {index: piece.index, unit: piece.unit, byteStart: piece.byteStart, byteEnd: piece.byteEnd, language: piece.language} : {}),
          fieldId: piece.fieldId,
          packId: piece.packId,
          supportedReadingId: piece.supportedReadingId,
          start: piece.start,
          end: piece.end,
          inputKey: piece.inputKey,
          profileId: clip.profileId,
          ref: clip.ref,
        }));
      }
    } catch (error) {
      return statusFor(error);
    }
    if (disposed || signal?.aborted) return {status: 'cancelled'};

    if (selected.version === 2) {
      try {
        for (const segment of segments) {
          await readClip(segment.ref, {signal});
          if (disposed || signal?.aborted) return {status: 'cancelled'};
        }
      } catch (error) { return statusFor(error); }
    }
    let localState='nonpersistent';
    if(allFieldsPacked&&selectedPacks.size){
      try{
        const states=[];
        for(const packId of selectedPacks){states.push(await withSignal(Promise.resolve(resources.packState(packId,{signal})),signal));if(disposed||signal?.aborted)return {status:'cancelled'};}
        if(states.every(state=>state==='verified-local')){
          // Host locality is a presence assertion; only exact selected bytes can establish readiness.
          for(const segment of segments){const bytes=await readClip(segment.ref,{signal});if(await hashAudioBytes(bytes)!==segment.ref.sha256)bad('local-clip-digest');if(disposed||signal?.aborted)return {status:'cancelled'};}
          localState='verified-local';
        }else if(states.includes('incomplete'))localState='incomplete';
        else if(states.includes('missing'))localState='missing';
      }catch(error){if(error?.audioCode)return statusFor(error);localState='nonpersistent';}
    }

    const result = freeze({
      status: 'ready',
      ...(selected.version === 2 ? {version: 2, profileAssignments: selected.profileAssignments} : {}),
      releaseId: snapshot.release.releaseId,
      projectionId: loaded.projectionId,
      contentRelease: loaded.contentRelease,
      taskKey: selected.taskKey,
      contentRevision: selected.contentRevision,
      audioContentRevision: selected.audioContentRevision,
      profileId: selected.profileId,
      supportedReadingId: selected.supportedReadingId,
      identities: loaded.identities,
      localState,
      segments: Object.freeze(segments),
    });
    READY_RESULTS.add(result);
    return result;
  }

  function resolve(selection, {signal} = {}) {
    return resolveSelection(selection, signal);
  }

  async function readClip(ref, {signal} = {}) {
    checkAlive();
    if (signal?.aborted) throw new AudioCancelledError();
    const clean = refValue(ref, CLIP_LIMIT, 'clip-read');
    const known = admitted.get(clean.key);
    if (!known || !known.media || known.sha256 !== clean.sha256 || known.bytes !== clean.bytes) {
      bad('clip-unadmitted');
    }
    const cached = mediaGet(clean.key);
    if (cached) {
      if (cached.ref.sha256 !== clean.sha256 || cached.ref.bytes !== clean.bytes) {
        bad('clip-cache-conflict');
      }
      return new Uint8Array(cached.bytes);
    }
    const bytes = await readVerified(known, CLIP_LIMIT, signal);
    rememberMedia(known, bytes);
    return new Uint8Array(bytes);
  }

  function dispose() {
    if (disposed) return Promise.resolve();
    disposed = true;
    try { lifecycle?.abort(); } catch { /* Disposal is synchronous. */ }
    root = null;
    loading = null;
    admitted.clear();
    metadata.clear();
    media.clear();
    mediaBytes = 0;
    return Promise.resolve();
  }

  /** Bounded local-demo pack inspection. All root shards are admitted for this
   * deliberately small projection; only rows explicitly assigned packId select media.
   * This does not define whole-catalog downloads or prove source/acoustic correctness. */
  async function inspectPack(packId, {signal, beforeMedia} = {}) {
    const loaded=await loadInternal({signal});
    const descriptor=loaded.packsById.get(packId);
    if(!descriptor)bad('pack-unknown');
    const index=parseJsonBytes(await readVerified(descriptor.ref, PACK_LIMIT, signal));
    const fields=exactRecord(index,['format','version','contentRelease','projectionId','id','resources','totalBytes'],'pack-index');
    if(fields.format!=='nihongo-audio-pack'||fields.version!==loaded.version||fields.contentRelease!==loaded.contentRelease||fields.projectionId!==loaded.projectionId||fields.id!==packId)bad('pack-identity');
    const values=exactArray(fields.resources,'pack-resources',MAX_ROWS),listed=new Map();let total=0;
    for(const value of values){const ref=refValue(value,CLIP_LIMIT,'pack-resource');if(ref.key==='root.json'||ref.key===descriptor.ref.key||listed.has(ref.key))bad('pack-resource-duplicate');listed.set(ref.key,ref);total+=ref.bytes;if(total>PACK_BYTES_LIMIT)bad('pack-total');}
    if(total!==fields.totalBytes||total!==descriptor.totalBytes)bad('pack-total');
    const required=new Map(),placements=[];
    const requireRef=ref=>{const previous=required.get(ref.key);if(previous&&(previous.sha256!==ref.sha256||previous.bytes!==ref.bytes))bad('pack-ref-conflict');required.set(ref.key,ref);};
    for(const [bucket,ref] of loaded.placementByBucket){requireRef(ref);const shard=await placementShard(bucket,signal);for(const row of shard.rows)if(row.packId===packId){if(row.state!=='verified')bad('pack-unprepared');placements.push(row);}}
    const clips=new Map();
    for(const [bucket,ref] of loaded.clipByBucket){requireRef(ref);const shard=await clipShard(bucket,signal);for(const row of shard.rows)clips.set(row.inputKey,row);}
    if(!placements.length)bad('pack-empty');
    for(const row of placements)for(const segment of row.segments){const clip=clips.get(segment.inputKey);if(!clip||clip.profileId!==(row.version===2?segment.profileId:row.profileId))bad('pack-clip-missing');requireRef(clip.ref);}
    if(required.size!==listed.size)bad('pack-closure');
    for(const [key,ref] of required){const supplied=listed.get(key);if(!supplied||supplied.sha256!==ref.sha256||supplied.bytes!==ref.bytes)bad('pack-closure');}
    const inspection=freeze({root:await load({signal}),pack:{id:packId,totalBytes:total},refs:[snapshot.release.root,descriptor.ref,...required.values()],placements});
    if(beforeMedia!==undefined){
      if(typeof beforeMedia!=='function')bad('pack-before-media');
      if(disposed||signal?.aborted)throw new AudioCancelledError();
      await withSignal(Promise.resolve().then(()=>beforeMedia(inspection)),signal);
      if(disposed||signal?.aborted)throw new AudioCancelledError();
    }
    for(const ref of required.values())await readVerified(ref,admitted.get(ref.key)?.media?CLIP_LIMIT:SHARD_LIMIT,signal);
    return inspection;
  }

  async function load(options) {
    const loaded = await loadInternal(options);
    return Object.freeze({
      ...(loaded.version === 2 ? {version: 2} : {}),
      contentRelease: loaded.contentRelease,
      projectionId: loaded.projectionId,
      identities: loaded.identities,
      correctionLedgerRevision: loaded.correctionLedgerRevision,
      defaultProfileId: loaded.defaultProfileId,
      profiles: Object.freeze(Array.from(loaded.profileById, ([id, profile]) => Object.freeze({id, profile}))),
    });
  }
  return Object.freeze({load, resolve, readClip, inspectPack, dispose});
}

/** Internal brand check reserved for future host adapters. */
export function isAudioReadyResult(value) {
  return READY_RESULTS.has(value);
}
