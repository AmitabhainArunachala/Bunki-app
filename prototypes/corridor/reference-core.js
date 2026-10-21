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
 * Kanji readings (Kanji-trust): extra.kanjiReadings (every KANJIDIC2 reading of each kanji.json or Jōyō
 * glyph) and extra.officialReadings (常用漢字表 readings KANJIDIC2 lacks) complete an entry's `readings`,
 * completeOn/completeKun and officialReadings; `on`/`kun` keep their first-source contract. The pure
 * reading helpers (readingMatch, normalizeReadingQuery, mergeReadings, kanjiWordBuckets, kanjiAltWords) are
 * the rules the generator, the app's kanji finder and the node invariant share.
 * K02: validateKanjiFacts(extra) checks the immutable supplement's schema, pinned provenance and all rows
 * once; kanjiReferenceFacts(extra, literal) returns copied completeMeanings, radicalSchemes and referenceSource,
 * or null when unavailable/absent. A valid table plus null means the literal is absent from this source.
 * Runtime validation is structural; raw-source and projection-hash parity are verified by the generator/tests.
 * Catalog legacy meanings are unchanged; completeMeanings are additional reference facts and searchable.
 * The separate, licensed data projection is rebuilt and audited by:
 *   node tools/build-reference-data.mjs --check [--archive /path/to/archive.zip]
 * No network or generated classifications are used.
 */
/* global module:readonly -- Optional CommonJS export, guarded for browsers. */
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
    'joyo-2010': 'https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/kanji/joyokanjisakuin/index.html',
  });
  const POLICY = Object.freeze({
    membership: 'All attested levels; distinct entries within each collection. Conflicts repeat across levels.',
    displayPrecedence: 'Dictionary reading/meanings first, graded words fallback. Kanji metadata first, committed metadata fallback.',
    identity: 'Exact printed form and reading identify vocabulary; never normalize or merge homographs. Missing Unicode glyphs use their source entry ID.',
    scope: 'Complete indexed committed corpus, not official or exam-complete lists. Kentei collections are assigned-grade bins, not cumulative test scope.',
    jlptKanji: 'Bundled editorial JLPT tags retained verbatim; N3 has no tagged kanji. Historical pre-2010 KANJIDIC levels are not mapped to modern JLPT levels.',
    unknown: 'No attested label, or an unrecognized label kept verbatim; never infer a level from school grade or rank.',
    relationships: 'Kentei related forms share an attested species ID, not necessarily a glyph or grade. Dictionary candidates require exact form/reading and reading restrictions; they do not classify every sense or authorize a canonical redirect.',
    kanjiReadings: 'A kanji shows every reading: the listed readings first, then each further KANJIDIC2 reading, then each 常用漢字表 (2010) reading KANJIDIC2 lacks, marked as such. Nothing is dropped, merged or generated.',
  });

  const KANJI_FACTS_SOURCE = Object.freeze({
    release: '3.6.2+20260803141815',
    archiveSha256: '5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6',
    dictionaryDate: '2026-08-03',
    databaseVersion: '2026-215',
  });
  const kanjiFactsCache = new WeakMap();
  function kanjiFactsIndex(extra) {
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return null;
    if (kanjiFactsCache.has(extra)) return kanjiFactsCache.get(extra);
    const source = extra.audit?.kanjiFacts;
    const rows = extra.kanjiFacts;
    let valid = extra.schemaVersion === 4 && extra.kanjiFactsVersion === 1 && source?.schemaVersion === 1 &&
      Object.entries(KANJI_FACTS_SOURCE).every(([key, value]) => source[key] === value) &&
      source.projectedRows === 10384 && /^[0-9a-f]{64}$/u.test(source.projectedSha256 || '') &&
      Array.isArray(rows) && rows.length === 10384;
    const byLiteral = new Map();
    const radical = (value) => Number.isInteger(value) && value >= 1 && value <= 214;
    let previous = -1;
    if (valid) {
      for (const row of rows) {
        const literal = row?.[0];
        if (!Array.isArray(row) || row.length !== 4 || typeof literal !== 'string' ||
          [...literal].length !== 1 || /[\uD800-\uDFFF]/u.test(literal) ||
          literal.codePointAt(0) <= previous || !Array.isArray(row[1]) || !row[1].length ||
          !row[1].every((meaning) => typeof meaning === 'string' && meaning.trim()) ||
          !radical(row[2]) || (row[3] !== null && !radical(row[3]))) {
          valid = false;
          break;
        }
        previous = literal.codePointAt(0);
        byLiteral.set(literal, { meanings: [...row[1]], classical: row[2], nelson: row[3] });
      }
    }
    const index = valid ? {
      byLiteral,
      source: { ...KANJI_FACTS_SOURCE, projectionSha256: source.projectedSha256 },
    } : null;
    // Loaded source objects are immutable inputs. Copies in this cache cannot be changed through returned facts.
    kanjiFactsCache.set(extra, index);
    return index;
  }
  function validateKanjiFacts(extra) {
    return kanjiFactsIndex(extra) !== null;
  }
  function kanjiReferenceFacts(extra, literal) {
    const index = kanjiFactsIndex(extra);
    const row = index?.byLiteral.get(literal);
    return row ? {
      completeMeanings: [...row.meanings],
      radicalSchemes: { classical: row.classical, nelson: row.nelson },
      referenceSource: { source: 'kanjidic-pinned', sourceId: literal, ...index.source },
    } : null;
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  // JSON tuple encoding is unambiguous even when source strings contain
  // separators. Query normalization must never change dictionary identity.
  function wordKey(id, reading) {
    return JSON.stringify([text(id), text(reading)]);
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
        ...strings(entry.readings), ...strings(entry.meanings), ...strings(entry.completeMeanings),
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

  /* ---- kanji readings and lookup (Kanji-trust). Pure, so the generator, this catalog, the app and the
   * node invariant share one rule. A reading is matched whole, one reading at a time: never two concatenated. */
  const toHiragana = (value) => text(value).replace(/[ァ-ヶ]/g,
    (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  /** KANJIDIC2 writes okurigana after a dot (た.べる) and affix positions with a hyphen (なま-, -う). */
  function readingForms(reading) {
    const plain = toHiragana(reading).replace(/-/g, '');
    return { full: plain.replace(/\./g, ''), stem: plain.split('.')[0] };
  }
  /** Same reading, same kind: 音 in katakana is compared with 音, 訓 in hiragana with 訓 (dots and hyphens dropped). */
  function readingKey(reading) {
    const value = text(reading).replace(/[.-]/g, '');
    return /[ァ-ヺ]/.test(value) ? `on:${value}` : `kun:${value}`;
  }
  /** Every reading of `base`, in its order, then each reading of the further lists that is not yet there (exact text). */
  function mergeReadings(base, ...more) {
    return unique([...strings(base), ...more.flatMap(strings)]);
  }
  /** Runtime shape gate for the complete pinned 2010 table, including explicit empty kun rows.
   * Semantic parity with the fixture is checked by the source verifier; this refuses partial payloads. */
  function validateJoyoTable(rows, expectedReadings, form) {
    if (!Array.isArray(rows) || rows.length !== 2136) return false;
    const glyphs = new Set();
    let count = 0;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' ||
        !/^\p{Script=Han}$/u.test(row[0]) || glyphs.has(row[0]) || !Array.isArray(row[1]) ||
        row[1].some(value => typeof value !== 'string' || !form.test(value)) ||
        new Set(row[1]).size !== row[1].length) return false;
      glyphs.add(row[0]); count += row[1].length;
    }
    return count === expectedReadings;
  }
  const validateJoyoKun = extra => validateJoyoTable(extra?.joyoKun, 2036, /^[ぁ-ゖー]+$/u);
  const validateJoyoOn = extra => validateJoyoTable(extra?.joyoOn, 2352, /^[ァ-ヺー]+$/u) &&
    extra.joyoOn.every((row, index) => row[0] === extra.joyoKun?.[index]?.[0]);
  /** Lead 0545: keep dictionary-attested okurigana. The four ambiguous positions are
   * the independently reviewed 本則 choices; a choice is usable only when that exact form
   * occurs in the pinned dictionary. Any unresolved official reading makes the WHOLE
   * visible kun list undotted. Source inventories and saved answers remain untouched. */
  const JOYO_KUN_PREFERRED = Object.freeze({
    '押:おさえる': 'お.さえる', '交:かわす': 'か.わす',
    '行:おこなう': 'おこな.う', '生:うまれる': 'う.まれる',
  });
  function joyoKunDisplay(raw, official, dictionary = [], glyph = '') {
    const listed = strings(raw), supplied = strings(dictionary);
    if (!Array.isArray(official)) return { kun: mergeReadings(listed, supplied) };
    const full = value => value.replace(/\./g, '');
    const unattestedKun = [];
    const selected = new Map(strings(official).map(reading => {
      // KANJIDIC affix hyphens are not okurigana boundaries. Match the full reading,
      // retaining its attested dot position; the separate dictionary affix stays in the full list.
      const forms = unique(supplied.filter(value => value.replace(/[.-]/g, '') === reading)
        .map(value => value.replace(/-/g, '')));
      const dotted = unique(forms.filter(value => value.includes('.')));
      const preferred = JOYO_KUN_PREFERRED[`${glyph}:${reading}`];
      const retained = listed.map(value => value.replace(/-/g, '')).find(value => forms.includes(value));
      let form;
      if (preferred && forms.includes(preferred)) form = preferred;
      else if (retained !== undefined) form = retained; // preserve an already-attested raw choice
      else if (dotted.length === 1) form = dotted[0];
      else if (dotted.length === 0 && forms.includes(reading)) form = reading;
      if (form === undefined) { unattestedKun.push(reading); form = reading; }
      return [reading, form];
    }));
    const undotted = unattestedKun.length > 0;
    const show = value => undotted ? full(value) : selected.get(full(value)) || value;
    return {
      kun: mergeReadings(listed.map(show), official.map(show), supplied.map(show)),
      joyoKun: official.map(show),
      kunDotMode: undotted ? 'undotted-unattested' : 'attested',
      unattestedKun,
    };
  }
  /** Jōyō status is a display annotation, never a deletion or change to an answer inventory. */
  function joyoOnDisplay(raw, official, dictionary = []) {
    const on = mergeReadings(raw, official, dictionary);
    if (!Array.isArray(official)) return { on };
    const joyoOn = [...official];
    const officialSet = new Set(joyoOn);
    return { on, joyoOn, outsideJoyoOn: on.filter(reading => !officialSet.has(reading)) };
  }
  /** A query as the reading lens reads it: NFKC (ｔａｂｅｒｕ, ﾀﾍﾞﾙ), katakana as hiragana, romaji through `toKana`
   * (the app's own converter). Latin typed after kana is still being composed (たべr): a run `toKana` cannot read is
   * dropped at the end, and refuses the query anywhere else. Returns '' when nothing readable is left. */
  function normalizeReadingQuery(raw, toKana = () => null) {
    const value = text(raw).normalize('NFKC').toLowerCase().replace(/[\s.\-・･'’]/g, '');
    if (!value) return '';
    const runs = value.match(/[a-z]+|[^a-z]+/g) || [];
    let out = '';
    for (let i = 0; i < runs.length; i += 1) {
      const run = runs[i];
      if (!/^[a-z]+$/.test(run)) {
        if (!/^[ぁ-ゖァ-ヺー]+$/.test(run)) return '';
        out += toHiragana(run);
        continue;
      }
      let kana = toKana(run);
      // a romaji run still being typed (taber, kanj): read the longest leading part that converts
      for (let cut = run.length - 1; !kana && cut > 0 && i === runs.length - 1; cut -= 1) kana = toKana(run.slice(0, cut));
      if (!kana) {
        if (i === runs.length - 1 && out) return out;
        return '';
      }
      out += kana;
    }
    return out;
  }
  /** 2: a reading is the query itself (whole, or the stem before its okurigana); 1: a reading begins with it; 0: none. */
  function readingMatch(readings, query) {
    if (!query) return 0;
    let best = 0;
    for (const reading of strings(readings)) {
      const { full, stem } = readingForms(reading);
      if (full === query || stem === query) return 2;
      if (full.startsWith(query)) best = 1;
    }
    return best;
  }
  /** The app's kanji → words rule (corridor.js D.kanjiWords): a row's `k` list, else the kanji of its headword. */
  const isIndexedKanji = (ch) => ch >= '一' && ch <= '鿿';
  function kanjiWordBuckets(dict = {}, words = {}) {
    const buckets = new Map();
    const add = (glyph, word) => {
      if (!buckets.has(glyph)) buckets.set(glyph, new Set());
      buckets.get(glyph).add(word);
    };
    for (const row of Object.values(words)) {
      for (const glyph of row?.k?.length ? row.k : [...text(row?.w)].filter(isIndexedKanji)) add(glyph, row.w);
    }
    for (const [id, row] of Object.entries(dict)) {
      for (const glyph of row?.k?.length ? row.k : [...id].filter(isIndexedKanji)) add(glyph, id);
    }
    return buckets;
  }
  /** Words reached through a written alternative (しいたけ／椎茸): glyph → [[entry id, the spelling that holds it]]. */
  function kanjiAltWords(dict = {}) {
    const out = new Map();
    for (const [id, row] of Object.entries(dict)) {
      const alt = text(row?.alt);
      if (!alt) continue;
      for (const glyph of unique([...alt].filter(isIndexedKanji))) {
        if (!out.has(glyph)) out.set(glyph, []);
        out.get(glyph).push([id, alt]);
      }
    }
    return out;
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

    function getEntry(map, key, type, id = key) {
      if (!map.has(key)) map.set(key, {
        id, key, text: id, type, reading: '', readings: [], meanings: [],
        on: [], kun: [], aliases: [], sources: [], levelSources: [],
        sourceRecords: [], variants: [], conflict: false, missingGlyph: false,
        metadataSources: {}, dictionaryLinks: [], relatedForms: [],
        kanjiLinks: [], canonicalTarget: null,
      });
      return map.get(key);
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
      const reading = text(row.r);
      const entry = getEntry(wordEntries, wordKey(id, reading), 'word', id);
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
      if (row.jlpt != null && row.jlpt !== '') variant.level = normalizeLevel(row.jlpt, 'jlpt');
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
        const entry = wordEntries.get(wordKey(id, reading));
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
      // Every reading a kanji has (Kanji-trust K01): the listed ones first, then each further KANJIDIC2
      // reading, then each 常用漢字表 reading KANJIDIC2 lacks, named in officialReadings. `on`/`kun` keep
      // their first-source contract above; `readings`, completeOn and completeKun are the whole record.
      const official = new Map();
      for (const [id, reading] of extra.officialReadings || []) {
        if (!official.has(id)) official.set(id, []);
        official.get(id).push(reading);
      }
      const isOn = (reading) => readingKey(reading).startsWith('on:');
      for (const [id, on, kun] of extra.kanjiReadings || []) {
        const entry = kanjiEntries.get(id);
        if (!entry) continue;
        const added = official.get(id) || [];
        entry.completeOn = mergeReadings(entry.on, on, added.filter(isOn));
        entry.completeKun = mergeReadings(entry.kun, kun, added.filter((reading) => !isOn(reading)));
        entry.officialReadings = [...added];
        const before = entry.readings.length;
        entry.readings = unique([...entry.readings, ...entry.completeOn, ...entry.completeKun]);
        // provenance only where this source added a reading the listed ones lacked
        if (entry.readings.length - added.length > before) entry.metadataSources.readings = { source: 'kanjidic-pinned', sourceId: id };
        if (added.length) entry.metadataSources.officialReadings = { source: 'joyo-2010', sourceId: id };
      }
    }

    // E3 completes display fields only. Search and dictionary inventories retain their exact strings.
    if (committed) for (const [id, officialKun] of extra.joyoKun || []) {
      const entry = kanjiEntries.get(id);
      if (!entry) continue;
      const dictionaryKun = extra.kanjiReadings?.find(row => row[0] === id)?.[2] || [];
      const view = joyoKunDisplay(kanji[id]?.kun, officialKun, dictionaryKun, id);
      entry.joyoKun = view.joyoKun;
      entry.kunDotMode = view.kunDotMode;
      entry.unattestedKun = view.unattestedKun;
      entry.displayKun = view.kun;
      entry.displayReadings = mergeReadings(entry.completeOn || entry.on, view.kun);
    }

    if (committed) for (const [id, officialOn] of extra.joyoOn || []) {
      const entry = kanjiEntries.get(id);
      if (!entry) continue;
      const view = joyoOnDisplay(kanji[id]?.on, officialOn, entry.completeOn || entry.on);
      entry.joyoOn = view.joyoOn;
      entry.outsideJoyoOn = view.outsideJoyoOn;
      entry.displayOn = view.on;
      entry.displayReadings = mergeReadings(view.on, entry.displayKun || entry.completeKun || entry.kun);
    }

    // K02 augments existing catalog identities only; dictionary facts never infer levels or enlarge lessons.
    if (committed) {
      for (const entry of kanjiEntries.values()) {
        const facts = kanjiReferenceFacts(extra, entry.id);
        if (!facts) continue;
        Object.assign(entry, facts);
        entry.metadataSources.completeMeanings = { source: 'kanjidic-pinned', sourceId: entry.id };
        entry.metadataSources.radicalSchemes = { source: 'kanjidic-pinned', sourceId: entry.id };
        addSource(entry, 'kanjidic-pinned');
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
      // The app resolves a printed word through dict first, then words. A
      // shadowed row with another reading is a reference-only source record,
      // even if its form happens to exist in one of those runtime tables.
      const runtimeWord = dict[entry.id] || words[entry.id];
      const canonical = entry.type === 'word'
        ? !!entry.reading && !!runtimeWord && text(runtimeWord.r) === entry.reading
        : !entry.missingGlyph && Object.hasOwn(kanji, entry.id);
      entry.canonicalTarget = canonical ? { type: entry.type, id: entry.id } : null;
      if (canonical && entry.type === 'word') entry.canonicalTarget.reading = entry.reading;
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
        collection.entries.map((entry) => [entry.key, entry])));
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
    readingForms, readingKey, mergeReadings, joyoKunDisplay, joyoOnDisplay, normalizeReadingQuery, readingMatch, kanjiWordBuckets, kanjiAltWords,
    validateKanjiFacts, kanjiReferenceFacts, validateJoyoKun, validateJoyoOn,
    normalizeQuery, normalizeLevel, compareEntries, wordKey, JLPT_LEVELS, KANKEN_LEVELS,
  });
});
