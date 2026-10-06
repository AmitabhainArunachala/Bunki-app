/** Publisher-original reading proposals. The native port resolves selected IDs;
 * a receipt digest proves coherence, not source authority or editorial approval.
 * The host commits a whole library before presenting a body as saved. */
import {
  deepFreeze,
  parseFeedEntry,
  parsePublisherReadResult,
  parsePublisherReadSelection,
  publisherArticleRequest,
} from './modules/feed-core.mjs';

export const PUBLISHER_LIBRARY_LIMITS = Object.freeze({
  readings: 500,
  jsonCharacters: 12_000_000,
  jsonNodes: 250_000,
  jsonDepth: 32,
  inFlight: 2,
  transientViews: 32,
});
export class PublisherControllerError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PublisherControllerError';
    this.code = code;
  }
}
const fail = (code) => {
  throw new PublisherControllerError(code);
};
const owned = new WeakSet();
const EMPTY = deepFreeze({ format: 'kairo-publisher-library', v: 1, readings: [] });
owned.add(EMPTY);
const digest = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value))
    fail('invalid-publisher-receipt');
  return value;
};

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
/** Refuse non-JSON/accessor data before invoking shared parsers. Local bounds
 * are capacity limits, never permission to discard old saved versions. */
function boundedJson(raw) {
  let nodes = 0;
  let characters = 0;
  const ancestors = new Set();
  const visit = (value, depth) => {
    nodes += 1;
    if (nodes > PUBLISHER_LIBRARY_LIMITS.jsonNodes || depth > PUBLISHER_LIBRARY_LIMITS.jsonDepth)
      fail('publisher-library-capacity');
    if (typeof value === 'string') {
      if (!wellFormed(value)) fail('invalid-publisher-json');
      characters += value.length;
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0)) fail('invalid-publisher-json');
    } else if (value !== null && typeof value === 'object') {
      if (
        ancestors.has(value) ||
        Object.getOwnPropertySymbols(value).length ||
        (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
      )
        fail('invalid-publisher-json');
      ancestors.add(value);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Object.keys(descriptors);
      if (keys.length > 20_000 || (Array.isArray(value) && keys.length !== value.length + 1))
        fail('invalid-publisher-json');
      for (const key of keys) {
        if (Array.isArray(value) && key === 'length') continue;
        const descriptor = descriptors[key];
        if (
          !('value' in descriptor) ||
          !descriptor.enumerable ||
          !wellFormed(key) ||
          (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/u.test(key))
        )
          fail('invalid-publisher-json');
        characters += key.length;
        visit(descriptor.value, depth + 1);
      }
      ancestors.delete(value);
    } else if (value !== null && typeof value !== 'boolean') fail('invalid-publisher-json');
    if (characters > PUBLISHER_LIBRARY_LIMITS.jsonCharacters) fail('publisher-library-capacity');
  };
  visit(raw, 0);
}
function savedResult(raw, expectedSelection) {
  boundedJson(raw);
  const result = parsePublisherReadResult(raw, expectedSelection);
  if (result.status !== 'full-reader' || !result.sourceDocument || !result.candidate.article.body)
    fail('publisher-body-unavailable');
  for (const operation of ['display-body', 'retain-offline']) {
    if (result.candidate.article.capabilities[operation].status !== 'allowed')
      fail('publisher-body-rights-unavailable');
  }
  return result;
}

export function parsePublisherLibrary(raw) {
  if (raw == null) return EMPTY;
  if (owned.has(raw)) return raw;
  boundedJson(raw);
  if (
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    Object.keys(raw).length !== 3 ||
    !['format', 'v', 'readings'].every((key) => Object.hasOwn(raw, key)) ||
    raw.format !== 'kairo-publisher-library' ||
    raw.v !== 1 ||
    !Array.isArray(raw.readings)
  )
    fail('invalid-publisher-library');
  if (raw.readings.length > PUBLISHER_LIBRARY_LIMITS.readings) fail('publisher-library-capacity');
  const readings = raw.readings.map((entry) => savedResult(entry));
  if (new Set(readings.map((entry) => entry.receiptSha256)).size !== readings.length)
    fail('duplicate-publisher-receipt');
  const library = deepFreeze({ format: 'kairo-publisher-library', v: 1, readings });
  owned.add(library);
  return library;
}

/** The only renderer-to-native selection is three validated IDs, never a URL,
 * HTML, capabilities, user profile, or a renderer-provided feed entry. */
export function publisherSelection(rawEntry) {
  boundedJson(rawEntry);
  const entry = parseFeedEntry(rawEntry);
  return publisherArticleRequest(entry).selection;
}

export function acceptPublisherReading(rawLibrary, rawResult, expectedSelection) {
  const library = parsePublisherLibrary(rawLibrary);
  boundedJson(expectedSelection);
  const selection = parsePublisherReadSelection(expectedSelection);
  const result = savedResult(rawResult, selection);
  if (library.readings.some((entry) => entry.receiptSha256 === result.receiptSha256))
    return library;
  if (library.readings.length >= PUBLISHER_LIBRARY_LIMITS.readings)
    fail('publisher-library-capacity');
  const next = { ...library, readings: [...library.readings, result] };
  // Validate the aggregate limit, not just the incoming article. Existing
  // owned entries are already frozen/parsed and are retained exactly.
  boundedJson(next);
  const resultLibrary = deepFreeze(next);
  owned.add(resultLibrary);
  return resultLibrary;
}

export function selectPublisherReading(rawLibrary, receiptSha256) {
  const library = parsePublisherLibrary(rawLibrary);
  const key = digest(receiptSha256);
  return library.readings.find((reading) => reading.receiptSha256 === key) || null;
}

export function createPublisherReader(port) {
  const available = !!port && typeof port.read === 'function';
  const pending = new Map();
  const views = new Map();
  const failures = new Map();
  const keyFor = (entry) => JSON.stringify(publisherSelection(entry));
  const latest = (map, entry) => {
    try {
      return map.get(keyFor(entry)) || null;
    } catch {
      return null;
    }
  };
  const trimTransient = (map) => {
    while (map.size > PUBLISHER_LIBRARY_LIMITS.transientViews) map.delete(map.keys().next().value);
  };
  return Object.freeze({
    available,
    view: (entry) => latest(views, entry),
    busy: (entry) => latest(pending, entry) !== null,
    error: (entry) => latest(failures, entry),
    read(entry) {
      let selection;
      try {
        selection = publisherSelection(entry);
      } catch (error) {
        return Promise.reject(error);
      }
      if (!available) return Promise.resolve(null);
      const key = JSON.stringify(selection);
      if (pending.has(key)) return pending.get(key);
      if (pending.size >= PUBLISHER_LIBRARY_LIMITS.inFlight) {
        failures.set(key, 'publisher-reader-busy');
        trimTransient(failures);
        return Promise.reject(new PublisherControllerError('publisher-reader-busy'));
      }
      failures.delete(key);
      const request = Promise.resolve()
        .then(() => port.read(selection))
        .then((raw) => {
          boundedJson(raw);
          const result = parsePublisherReadResult(raw, selection);
          // Link fallback is a valid transport result; it must never be admitted
          // as saved body by acceptPublisherReading.
          views.delete(key);
          views.set(key, result);
          trimTransient(views);
          return result;
        })
        .catch((error) => {
          failures.set(key, 'publisher-read-unavailable');
          trimTransient(failures);
          throw error;
        })
        .finally(() => pending.delete(key));
      pending.set(key, request);
      return request;
    },
  });
}

export { publisherReadingDetails } from './modules/feed-core.mjs';
