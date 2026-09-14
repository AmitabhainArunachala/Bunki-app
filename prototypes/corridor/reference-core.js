/* Bunki reference-only index. No learner state, lesson or scheduler writes.
 *
 * createCatalog({dict, words, kanji, kanken, kmeta, extra})
 *   -> {collections, stats, policy, sources}
 * collection: {id, family, level, kind, count, entries, special, unknown}
 * IDs: jlpt:N5, jlpt-kanji:N5, kanken:10級; unknown level = "unknown".
 * entry: {id, text, type, reading, readings, meanings, levelSources, conflict,
 *         sources, metadataMissing, missingGlyph, ...}
 * levelSources: [{source, level, rawLevel, sourceId?}]
 * All attested nonempty levels have membership (not a guessed precedence).
 * Display reading/meaning precedence: dict > words; kanji > committed metadata.
 * Unlabelled entries are retained in unknown bins; absence is not a conflict.
 * Kentei bins are assignments, NOT cumulative examination syllabuses.
 * search(collection, query, {page=1, pageSize=100})
 *   -> {entries, total, page, pageCount, start, end}
 * start/end are 1-based inclusive, or 0/0 for no results. Page is clamped.
 * Query: NFKC + kana folding + case folding, whitespace-token AND matching.
 * Pure sortEntries/searchEntries/paginateEntries helpers are also exported.
 *
 * extra is data/share_alike/reference-extra.json (defaults to no supplement).
 * Glyphless entries use CE-... IDs: no writing/lesson/save actions are valid.
 * Supplemental glyphs may lack D.kanji: read their normalized core metadata,
 * not lesson lookup. Fields metadataMissing/missingReading/missingMeanings
 * expose gaps; sourceRecords retain every Kentei source identity and URL.
 * The separate, licensed data projection is rebuilt and audited by:
 *   node tools/build-reference-data.mjs --check [--archive /path/to/archive.zip]
 * No network or generated classifications are used.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BunkiReferenceCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const JLPT_LEVELS = Object.freeze(['N5', 'N4', 'N3', 'N2', 'N1']);
  const KANKEN_LEVELS = Object.freeze([
    '10級', '9級', '8級', '7級', '6級', '5級', '4級', '3級',
    '準2級', '2級', '準1級', '1/準1級', '1級', '配当外',
  ]);
  const SOURCES = Object.freeze({
    dict: 'prototypes/corridor/data/share_alike/dict.json',
    words: 'prototypes/corridor/data/share_alike/words.json',
    kanji: 'prototypes/corridor/data/share_alike/kanji.json',
    kanken: 'prototypes/corridor/data/proprietary_safe/kanken.json',
    kmeta: 'prototypes/corridor/data/share_alike/strokes.json',
    'kanken-corpus': 'corpus/datasets/kanji/kanken.jsonl',
    kotobako: 'prototypes/bunki-sites-v11/public/kotobako-static.json',
    'drift-words': 'apps/app/src/data/generated/drift-words.json',
    wbig: 'prototypes/drift/data/wbig.json',
    'dictionary-index': 'prototypes/corridor/data/share_alike/dict-v2/index.json',
    'kanjidic-sample': 'corpus/samples/jmdict/kanjidic_sample.jsonl',
    'kanjidic-pinned': 'https://github.com/scriptin/jmdict-simplified/releases/tag/3.6.2%2B20260803141815',
  });
  const POLICY = Object.freeze({
    membership: 'All attested levels; distinct entries within each collection. Conflicts repeat across levels.',
    displayPrecedence: 'Dictionary reading/meanings first, graded words fallback. Kanji metadata first, committed metadata fallback.',
    identity: 'Exact printed source key; never NFKC-fold identities. Missing Unicode glyphs use their source entry ID.',
    scope: 'Complete indexed committed corpus, not official or exam-complete lists. Kentei collections are assigned-grade bins, not cumulative test scope.',
    jlptKanji: 'Bundled editorial JLPT tags retained verbatim; N3 has no tagged kanji. Historical pre-2010 KANJIDIC levels are not mapped to modern JLPT levels.',
    unknown: 'No attested label, or an unrecognized label kept verbatim; never infer a level from school grade or rank.',
    relationships: 'Kentei related forms share an attested species ID, not necessarily a glyph or grade. Dictionary candidates require exact form/reading and reading restrictions; they do not classify every sense or authorize a canonical redirect.',
  });

  function text(value) {
    return value == null ? '' : String(value);
  }

  function normalizeQuery(value) {
    return text(value).normalize('NFKC').toLowerCase().normalize('NFD')
      .replace(/[\u30a1-\u30f6\u30fd\u30fe]/g,
        (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .normalize('NFC').replace(/\s+/g, ' ').trim();
  }

  function normalizeLevel(value, family) {
    const raw = text(value).trim();
    if (!raw) return null;
    const normalized = raw.normalize('NFKC');
    if (family !== 'kanken' && /^(?:N)?[1-5]$/i.test(normalized)) {
      return `N${normalized.slice(-1)}`;
    }
    // Unknown and ambiguous labels retain their literal source spelling.
    return raw;
  }

  function strings(value) {
    if (Array.isArray(value)) return value.map(text).filter(Boolean);
    return value == null || value === '' ? [] : [text(value)];
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function compareText(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function compareEntries(a, b) {
    // Fixed lexical order avoids platform/ICU-dependent collation.
    const ar = normalizeQuery(a.reading);
    const br = normalizeQuery(b.reading);
    return Number(!ar) - Number(!br) || compareText(ar, br)
      || compareText(text(a.id), text(b.id)) || compareText(text(a.type), text(b.type));
  }

  function sortEntries(entries) {
    // Normalize once per entry, not on every comparison. This is a local
    // decoration, never a persistent cache or a write onto caller-owned rows.
    return entries.map((entry) => ({
      entry, reading: normalizeQuery(entry.reading), id: text(entry.id), type: text(entry.type),
    })).sort((a, b) => Number(!a.reading) - Number(!b.reading)
      || compareText(a.reading, b.reading) || compareText(a.id, b.id)
      || compareText(a.type, b.type)).map(({ entry }) => entry);
  }

  function searchEntries(entries, query) {
    const tokens = normalizeQuery(query).split(' ').filter(Boolean);
    if (!tokens.length) return [...entries];
    return entries.filter((entry) => {
      const haystack = normalizeQuery([
        entry.id, entry.text, entry.reading,
        ...strings(entry.readings), ...strings(entry.meanings),
        ...strings(entry.on), ...strings(entry.kun), ...strings(entry.aliases),
        ...(entry.variants || []).flatMap((item) => [item.reading, ...item.meanings]),
        ...(entry.levelSources || []).map((item) => item.level),
        ...(entry.sourceRecords || []).map((item) => item.sourceId),
      ].join(' '));
      return tokens.every((token) => haystack.includes(token));
    });
  }

  function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 1
      ? Math.min(Math.floor(number), Number.MAX_SAFE_INTEGER) : fallback;
  }

  function paginateEntries(entries, options = {}) {
    const pageSize = positiveInteger(options.pageSize, 100);
    const total = entries.length;
    const pageCount = Math.ceil(total / pageSize);
    const page = Math.min(positiveInteger(options.page, 1), Math.max(1, pageCount));
    const offset = (page - 1) * pageSize;
    const result = entries.slice(offset, offset + pageSize);
    return {
      entries: result, total, page, pageCount,
      start: total ? offset + 1 : 0, end: total ? offset + result.length : 0,
    };
  }

  function search(collection, query, options) {
    return paginateEntries(searchEntries(collection.entries, query), options);
  }

  function createCatalog(input = {}, options = {}) {
    const dict = input.dict || {};
    const words = input.words || {};
    const kanji = input.kanji || {};
    const kanken = input.kanken || {};
    const kmeta = input.kmeta || {};
    const extra = input.extra || {};
    const committed = options.includeCommitted !== false;
    const wordEntries = new Map();
    const kanjiEntries = new Map();
    const collections = new Map();

    function getEntry(map, id, type) {
      if (!map.has(id)) map.set(id, {
        id, text: id, type, reading: '', readings: [], meanings: [],
        on: [], kun: [], aliases: [], sources: [], levelSources: [],
        sourceRecords: [], variants: [], conflict: false, missingGlyph: false,
        metadataSources: {}, dictionaryLinks: [], relatedForms: [],
        kanjiLinks: [], canonicalTarget: null,
      });
      return map.get(id);
    }

    function addSource(entry, source) {
      if (!entry.sources.includes(source)) entry.sources.push(source);
    }

    function addLevel(entry, source, value, family, sourceId, reading) {
      addSource(entry, source);
      const level = normalizeLevel(value, family);
      if (level == null) return;
      if (!entry.levelSources.some((item) =>
        item.source === source && item.level === level && item.sourceId === sourceId
          && item.family === family && item.rawLevel === value && item.reading === reading)) {
        const record = { source, level, rawLevel: value, family };
        if (sourceId != null) record.sourceId = sourceId;
        if (reading != null) record.reading = reading;
        entry.levelSources.push(record);
      }
    }

    function addWord(id, row, source, sourceId) {
      const entry = getEntry(wordEntries, id, 'word');
      const reading = text(row.r);
      const meanings = strings(row.m == null ? row.g : row.m);
      if (!entry.reading && reading) {
        entry.reading = reading;
        entry.metadataSources.reading = { source, sourceId: sourceId ?? id };
      }
      if (!entry.meanings.length && meanings.length) {
        entry.meanings = meanings;
        entry.metadataSources.meanings = { source, sourceId: sourceId ?? id };
      }
      entry.readings = unique([...entry.readings, ...strings(reading)]);
      entry.aliases = unique([...entry.aliases, ...strings(row.alt)]);
      const variant = { source, reading, meanings: [...meanings] };
      if (sourceId != null) variant.sourceId = sourceId;
      entry.variants.push(variant);
      for (const glyph of strings(row.k)) {
        entry.kanjiLinks.push({
          id: glyph, source, sourceId: sourceId ?? id,
          canonicalTarget: Object.hasOwn(kanji, glyph) ? { type: 'kanji', id: glyph } : null,
        });
      }
      addLevel(entry, source, row.jlpt, 'jlpt', sourceId, reading);
      return entry;
    }

    for (const [id, row] of Object.entries(dict)) addWord(id, row || {}, 'dict');
    for (const [id, row] of Object.entries(words)) addWord(id, row || {}, 'words');
    if (committed) {
      for (const [id, reading, meanings, level, sourceId, source = 'kotobako', glyphs] of extra.extraWords || []) {
        addWord(id, { r: reading, m: meanings, jlpt: level, k: glyphs }, source, sourceId);
      }
      for (const [id, reading, candidates] of extra.wordLinks || []) {
        const entry = wordEntries.get(id);
        if (!entry) continue;
        entry.dictionaryLinks.push({
          reading, candidates: [...candidates], source: 'dictionary-index',
          match: 'exact-form-reading-with-restrictions',
        });
      }
    }

    for (const id of unique([...Object.keys(kanji), ...Object.keys(kanken), ...Object.keys(kmeta)])) {
      const entry = getEntry(kanjiEntries, id, 'kanji');
      const row = kanji[id] || {};
      entry.on = strings(row.on);
      entry.kun = strings(row.kun);
      entry.readings = unique([...entry.on, ...entry.kun]);
      entry.reading = entry.readings[0] || '';
      entry.meanings = strings(row.m);
      if (row.st != null) entry.strokeCount = row.st;
      for (const field of ['on', 'kun', 'meanings', 'strokeCount']) {
        if (Array.isArray(entry[field]) ? entry[field].length : entry[field] != null) {
          entry.metadataSources[field] = { source: 'kanji', sourceId: id };
        }
      }
      if (Object.hasOwn(kanji, id)) {
        addLevel(entry, 'kanji', row.kk, 'kanken');
        addLevel(entry, 'kanji', row.jlpt, 'jlpt-kanji');
      }
      if (Object.hasOwn(kanken, id)) addLevel(entry, 'kanken', kanken[id]?.kk, 'kanken');
      if (Object.hasOwn(kmeta, id)) {
        addLevel(entry, 'kmeta', kmeta[id]?.jlpt, 'jlpt-kanji');
        if (kmeta[id]?.g != null) {
          entry.schoolGrade = kmeta[id].g;
          entry.metadataSources.schoolGrade = { source: 'kmeta', sourceId: id };
        }
      }
    }

    if (committed) {
      for (const [id, family, level, source, sourceId] of extra.kanjiLevels || []) {
        const entry = getEntry(kanjiEntries, id, 'kanji');
        addLevel(entry, source, level, family, sourceId);
      }
      const species = new Map();
      for (const [sourceId, glyph, level, form, url, imageUrl, speciesId] of extra.kanken || []) {
        const id = glyph || sourceId;
        const entry = getEntry(kanjiEntries, id, 'kanji');
        entry.missingGlyph = !glyph;
        entry.text = glyph || `字形未収録 (${sourceId})`;
        const record = { source: 'kanken-corpus', sourceId, glyph, level, form, url, imageUrl };
        if (speciesId) {
          record.speciesId = speciesId;
          if (!species.has(speciesId)) species.set(speciesId, []);
          species.get(speciesId).push({ id, sourceId, glyph, level, form, speciesId });
        }
        entry.sourceRecords.push(record);
        addLevel(entry, 'kanken-corpus', level, 'kanken', sourceId);
      }
      for (const entry of kanjiEntries.values()) {
        const ids = unique(entry.sourceRecords.map((record) => record.speciesId).filter(Boolean));
        const ownRecords = new Set(entry.sourceRecords.map((record) => record.sourceId));
        // The printed-glyph index can contain two different source species
        // (notably 芸). Expose that collision; do not merge their related groups.
        entry.speciesIds = ids;
        entry.identityCollision = ids.length > 1;
        entry.relatedForms = ids.flatMap((id) => (species.get(id) || [])
          .filter((record) => !ownRecords.has(record.sourceId)).map((record) => ({ ...record })));
      }
      for (const [id, on, kun, meanings, strokeCount, source, sourceId = id] of extra.kanjiMetadata || []) {
        const entry = kanjiEntries.get(id);
        if (!entry) continue;
        for (const [field, values] of [['on', on], ['kun', kun], ['meanings', meanings]]) {
          if (!entry[field].length && values.length) {
            entry[field] = [...values];
            entry.metadataSources[field] = { source, sourceId };
          }
        }
        if (entry.strokeCount == null && strokeCount != null) {
          entry.strokeCount = strokeCount;
          entry.metadataSources.strokeCount = { source, sourceId };
        }
        entry.readings = unique([...entry.on, ...entry.kun]);
        entry.reading = entry.readings[0] || '';
        addSource(entry, source);
      }
    }

    function collectionFor(family, level) {
      const id = `${family}:${level}`;
      if (!collections.has(id)) {
        const known = family === 'kanken' ? KANKEN_LEVELS : JLPT_LEVELS;
        collections.set(id, {
          id, family, level, kind: family === 'jlpt' ? 'word' : 'kanji',
          count: 0, entries: [], special: level === '1/準1級' || level === '配当外',
          unknown: !known.includes(level),
        });
      }
      return collections.get(id);
    }

    for (const family of ['jlpt', 'jlpt-kanji', 'kanken']) {
      for (const level of family === 'kanken' ? KANKEN_LEVELS : JLPT_LEVELS) {
        collectionFor(family, level);
      }
      collectionFor(family, 'unknown');
    }

    function indexEntry(entry, families) {
      const canonical = entry.type === 'word'
        ? Object.hasOwn(dict, entry.id) || Object.hasOwn(words, entry.id)
        : !entry.missingGlyph && Object.hasOwn(kanji, entry.id);
      entry.canonicalTarget = canonical ? { type: entry.type, id: entry.id } : null;
      for (const link of entry.kanjiLinks) {
        link.referenceId = kanjiEntries.has(link.id) ? link.id : null;
        link.status = link.canonicalTarget ? 'bundled'
          : link.referenceId ? 'reference-only' : 'absent-target';
      }
      entry.metadataMissing = !entry.reading || !entry.meanings.length;
      entry.missingReading = !entry.reading;
      entry.missingMeanings = !entry.meanings.length;
      entry.conflicts = {};
      for (const family of families) {
        const levels = unique(entry.levelSources.filter((item) => item.family === family)
          .map((item) => item.level));
        entry.conflicts[family] = levels.length > 1;
        if (levels.length > 1) entry.conflict = true;
        for (const level of levels.length ? levels : ['unknown']) {
          collectionFor(family, level).entries.push(entry);
        }
      }
    }

    for (const entry of wordEntries.values()) indexEntry(entry, ['jlpt']);
    for (const entry of kanjiEntries.values()) indexEntry(entry, ['jlpt-kanji', 'kanken']);
    for (const collection of collections.values()) {
      collection.entries = sortEntries(collection.entries);
      collection.count = collection.entries.length;
    }

    const result = [...collections.values()];
    const stats = {
      sourceRows: {
        dict: Object.keys(dict).length, words: Object.keys(words).length,
        kanji: Object.keys(kanji).length, kanken: Object.keys(kanken).length,
        kmeta: Object.keys(kmeta).length,
        'kanken-corpus': committed ? (extra.kanken || []).length : 0,
        'vocabulary-extra': committed ? (extra.extraWords || []).length : 0,
      },
      uniqueWords: wordEntries.size,
      uniqueKanji: kanjiEntries.size,
      glyphKanji: [...kanjiEntries.values()].filter((entry) => !entry.missingGlyph).length,
      missingGlyphRecords: [...kanjiEntries.values()].filter((entry) => entry.missingGlyph).length,
      identityCollisions: [...kanjiEntries.values()].filter((entry) => entry.identityCollision).length,
      kanjiWithRelatedForms: [...kanjiEntries.values()].filter((entry) => entry.relatedForms.length).length,
      counts: Object.fromEntries(result.map((collection) => [collection.id, collection.count])),
      families: {},
      committedAudit: committed && extra.audit ? JSON.parse(JSON.stringify(extra.audit)) : null,
      limitations: [
        POLICY.scope, POLICY.jlptKanji,
        'Reading/meaning metadata is incomplete; missing fields remain empty rather than generated.',
        'Missing Unicode glyph records retain source IDs and are not drawable characters.',
        'Full JMdict has no JLPT classification field and cannot expand labelled lists by inference.',
      ],
    };
    for (const family of ['jlpt', 'jlpt-kanji', 'kanken']) {
      const relevant = result.filter((collection) => collection.family === family);
      const labelled = relevant.filter((collection) => collection.level !== 'unknown');
      const entries = new Map(labelled.flatMap((collection) =>
        collection.entries.map((entry) => [entry.id, entry])));
      stats.families[family] = {
        uniqueLabelled: entries.size,
        memberships: labelled.reduce((sum, collection) => sum + collection.count, 0),
        conflicts: [...entries.values()].filter((entry) => entry.conflicts[family]).length,
        unknown: relevant.find((collection) => collection.level === 'unknown').count,
        missingReading: [...entries.values()].filter((entry) => entry.missingReading).length,
        missingMeanings: [...entries.values()].filter((entry) => entry.missingMeanings).length,
      };
    }
    return { collections: result, stats, policy: { ...POLICY }, sources: { ...SOURCES } };
  }

  return Object.freeze({
    createCatalog, search, searchEntries, sortEntries, paginateEntries,
    normalizeQuery, normalizeLevel, compareEntries, JLPT_LEVELS, KANKEN_LEVELS,
  });
});
