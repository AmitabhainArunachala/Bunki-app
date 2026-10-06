/** Browser adapter for the personal source shelf. The native port receives
 * source IDs only. Publisher metadata stays in memory; the learner record
 * contains source choices and reference-only bookmarks. */
import {
  SOURCE_REGISTRY,
  deepFreeze,
  getFeedSource,
  parseFeedReference,
  parseFeedRefreshResult,
  sourceIdSchema,
  toFeedReference,
} from './modules/feed-core.mjs';

export { SOURCE_REGISTRY, getFeedSource };
export const EMPTY_FEED_LIBRARY = deepFreeze({ v: 1, mutedSourceIds: [], savedReferences: [] });

export function parseFeedLibrary(raw) {
  if (raw == null) return EMPTY_FEED_LIBRARY;
  if (typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1 ||
      Object.keys(raw).some((key) => !['v', 'mutedSourceIds', 'savedReferences'].includes(key)) ||
      !Array.isArray(raw.mutedSourceIds) || raw.mutedSourceIds.length > 1000 ||
      !Array.isArray(raw.savedReferences) || raw.savedReferences.length > 5000) {
    throw new Error('invalid-feed-library');
  }
  const mutedSourceIds = raw.mutedSourceIds.map((id) => sourceIdSchema.parse(id));
  const savedReferences = raw.savedReferences.map((entry) => parseFeedReference(entry));
  if (new Set(mutedSourceIds).size !== mutedSourceIds.length ||
      new Set(savedReferences.map(referenceKey)).size !== savedReferences.length) {
    throw new Error('duplicate-feed-library-entry');
  }
  // Unknown future source IDs remain intact across older app versions.
  return deepFreeze({ v: 1, mutedSourceIds, savedReferences });
}

export function referenceKey(reference) {
  return JSON.stringify([reference.publisherId, reference.entryId, reference.canonicalUrl]);
}

export function toggleFeedSource(raw, sourceId) {
  getFeedSource(sourceId);
  const library = parseFeedLibrary(raw);
  const muted = new Set(library.mutedSourceIds);
  if (muted.has(sourceId)) muted.delete(sourceId);
  else muted.add(sourceId);
  return parseFeedLibrary({ ...library, mutedSourceIds: [...muted] });
}

export function toggleFeedReference(raw, entry) {
  const library = parseFeedLibrary(raw);
  const reference = entry.format === 'kairo-feed-reference'
    ? parseFeedReference(entry) : toFeedReference(entry);
  const key = referenceKey(reference);
  const saved = library.savedReferences.some((row) => referenceKey(row) === key);
  return parseFeedLibrary({ ...library, savedReferences: saved
    ? library.savedReferences.filter((row) => referenceKey(row) !== key)
    : [...library.savedReferences, reference] });
}

export function createFeedReader(port) {
  const views = new Map();
  const pending = new Map();
  const failures = new Map();
  const available = !!port && typeof port.refresh === 'function';
  return Object.freeze({
    available,
    view: (id) => views.get(id) || null,
    busy: (id) => pending.has(id),
    error: (id) => failures.get(id) || null,
    refresh(id) {
      const source = getFeedSource(id);
      if (!available || source.mode !== 'personal-feed') return Promise.resolve(null);
      if (!pending.has(id)) {
        failures.delete(id);
        const request = Promise.resolve().then(() => port.refresh(id)).then((raw) => {
          const result = parseFeedRefreshResult(raw, id);
          views.set(id, result);
          return result;
        }).catch((error) => {
          failures.set(id, 'feed-refresh-unavailable');
          throw error;
        }).finally(() => pending.delete(id));
        pending.set(id, request);
      }
      return pending.get(id);
    },
    entries(rawLibrary, query = '') {
      const library = parseFeedLibrary(rawLibrary);
      const muted = new Set(library.mutedSourceIds);
      const needle = String(query).trim().toLocaleLowerCase('ja');
      const byUrl = new Map();
      for (const source of SOURCE_REGISTRY) {
        if (muted.has(source.id)) continue;
        for (const entry of views.get(source.id)?.entries || []) {
          if (needle && !`${entry.title} ${source.publisher} ${entry.categories.join(' ')}`.toLocaleLowerCase('ja').includes(needle)) continue;
          if (!byUrl.has(entry.canonicalUrl)) byUrl.set(entry.canonicalUrl, entry);
        }
      }
      return [...byUrl.values()].sort((a, b) => {
        const byPublished = (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0);
        return byPublished || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      });
    },
    savedEntry(reference) {
      return views.get(reference.sourceId)?.entries.find((entry) => entry.id === reference.entryId && entry.canonicalUrl === reference.canonicalUrl) || null;
    },
  });
}
