/**
 * Corpus-exhaustiveness, provenance, purity and query contract tests.
 * Run: node tools/test-reference-core.mjs
 * Optionally verify raw metadata parity with --archive /path/to/archive.zip.
 *
 * Uses only committed local sources. No network or inferred classifications.
 * The large JMdict-v2 dictionary has no JLPT field and is not graded here.
 */
import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildReferenceData, OUTPUT, serialize, sourcePaths } from './build-reference-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_PATH = resolve(ROOT, 'prototypes/corridor/reference-core.js');
const COVERAGE_PATH = resolve(ROOT, 'docs/build-evidence/reference/coverage.json');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const jsonl = (path) =>
  read(path)
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
const docs = Object.fromEntries(
  ['dict', 'words', 'kanji', 'kanken', 'kmeta'].map((key) => [key, json(sourcePaths[key])]),
);
const input = {
  dict: docs.dict.words,
  words: docs.words.words,
  kanji: docs.kanji.kanji,
  kanken: docs.kanken.levels,
  kmeta: docs.kmeta.meta,
  extra: JSON.parse(readFileSync(OUTPUT, 'utf8')),
};
const corpus = jsonl(sourcePaths.kankenCorpus);
const kotobako = json(sourcePaths.kotobako).datasets;
const wbig = json(sourcePaths.wbig);
const committed = input.extra;
const archiveIndex = process.argv.indexOf('--archive');
const archive = archiveIndex >= 0 ? process.argv[archiveIndex + 1] : undefined;
assert.equal(
  readFileSync(OUTPUT, 'utf8'),
  serialize(buildReferenceData({ archive, prior: committed })),
  'Reference sidecar byte parity',
);
const require = createRequire(import.meta.url);
const core = require(CORE_PATH);

let testCount = 0;
function test(name, fn) {
  fn();
  testCount++;
  console.log(`PASS ${name}`);
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
const inputSnapshot = JSON.stringify(input);
deepFreeze(input);
const catalog = core.createCatalog(input);
const byId = new Map(catalog.collections.map((collection) => [collection.id, collection]));
const membership = new Map(
  catalog.collections.map((collection) => [
    collection.id,
    new Map(collection.entries.map((entry) => [entry.id, entry])),
  ]),
);
const at = (collectionId, entryId) => membership.get(collectionId)?.get(entryId);
const expectedLevel = (value) =>
  value == null || value === ''
    ? null
    : /^[Nn]?[1-5]$/.test(String(value))
      ? `N${String(value).slice(-1)}`
      : String(value);

test('Frozen inputs remain byte-identical; generated core is pure', () => {
  assert.equal(JSON.stringify(input), inputSnapshot);
  assert.deepEqual(core.createCatalog(input), catalog);
  assert(!readFileSync(CORE_PATH, 'utf8').includes('localStorage'));
});

test('Every dictionary and graded-word row reaches a labelled or unknown collection', () => {
  for (const source of ['dict', 'words']) {
    for (const [id, row] of Object.entries(input[source])) {
      const level = expectedLevel(row.jlpt);
      const relevant = catalog.collections.filter(
        (collection) => collection.family === 'jlpt' && at(collection.id, id),
      );
      assert(relevant.length, `${source}:${id} was dropped`);
      if (level) {
        const entry = at(`jlpt:${level}`, id);
        assert(entry, `${source}:${id}:${level} was dropped`);
        assert(entry.levelSources.some((tag) => tag.source === source && tag.level === level));
      } else {
        assert(relevant.every((collection) => at(collection.id, id).sources.includes(source)));
      }
    }
  }
});

test('Every wbig/drift word and kotobako vocabulary classification is represented', () => {
  for (const [id, , , level] of wbig) assert(at(`jlpt:N${level}`, id), id);
  for (const [id, , , level] of json(sourcePaths.driftWords)) assert(at(`jlpt:N${level}`, id), id);
  for (const row of kotobako.vocab) {
    if (row.jlpt) assert(at(`jlpt:${row.jlpt}`, row.word), `${row.id}:${row.jlpt}`);
  }
  assert.equal(committed.extraWords.length, 10);
  for (const [id, , , level, sourceId, source] of committed.extraWords) {
    assert(
      at(`jlpt:${expectedLevel(level)}`, id).levelSources.some(
        (tag) => tag.source === source && tag.sourceId === sourceId,
      ),
    );
  }
});

test('Every boot kanji, grade fact and JLPT metadata row is accounted for', () => {
  for (const [id, row] of Object.entries(input.kanji)) {
    assert(at(`kanken:${row.kk || 'unknown'}`, id), id);
    assert(
      catalog.collections.some(
        (collection) => collection.family === 'jlpt-kanji' && at(collection.id, id),
      ),
    );
  }
  assert.deepEqual(
    Object.keys(json(sourcePaths.driftKanji).KINFO).sort(),
    Object.keys(input.kanji).sort(),
  );
  for (const [id, row] of Object.entries(input.kanken)) {
    assert(at(`kanken:${row.kk}`, id), id);
  }
  for (const [id, row] of Object.entries(input.kmeta)) {
    assert(at(`jlpt-kanji:${row.jlpt || 'unknown'}`, id), `${id}:${row.jlpt}`);
  }
  for (const row of kotobako.kanji) {
    if (row.jlpt) assert(at(`jlpt-kanji:${row.jlpt}`, row.char), row.id);
  }
});

test('Every full Kentei source row survives, including duplicates and glyphless records', () => {
  const seenIds = new Set();
  for (const row of corpus) {
    const entry = at(`kanken:${row.kanken_level}`, row.glyph || row.entry_id);
    assert(entry, `${row.entry_id} was dropped`);
    const sourceRecord = entry.sourceRecords.find((record) => record.sourceId === row.entry_id);
    assert(sourceRecord, `${row.entry_id} provenance was dropped`);
    assert.equal(sourceRecord.glyph, row.glyph);
    assert.equal(sourceRecord.form, row.form);
    assert.equal(sourceRecord.url, row.kanjipedia_url);
    assert.equal(sourceRecord.imageUrl, row.glyph_image_url);
    assert.equal(entry.missingGlyph, !row.glyph);
    assert(
      entry.levelSources.some(
        (tag) =>
          tag.sourceId === row.entry_id &&
          tag.source === 'kanken-corpus' &&
          tag.level === row.kanken_level,
      ),
    );
    seenIds.add(row.entry_id);
  }
  assert.equal(seenIds.size, corpus.length);
  assert.equal(catalog.stats.missingGlyphRecords, 537);
  assert(at('kanken:7級', '芸').conflict);
  assert(at('kanken:1級', '芸').conflict);
  assert.equal(catalog.stats.families.kanken.conflicts, 6);
});

test('Exact membership sets match the independently calculated all-source union', () => {
  const expected = new Map();
  const add = (family, level, id) => {
    if (level == null || level === '') return;
    const key = `${family}:${level}`;
    if (!expected.has(key)) expected.set(key, new Set());
    expected.get(key).add(id);
  };
  for (const source of ['dict', 'words']) {
    for (const [id, row] of Object.entries(input[source])) add('jlpt', expectedLevel(row.jlpt), id);
  }
  for (const row of kotobako.vocab) add('jlpt', row.jlpt, row.word);
  for (const [id, , , level] of json(sourcePaths.driftWords)) add('jlpt', `N${level}`, id);
  for (const [id, row] of Object.entries(input.kanji)) {
    add('kanken', row.kk, id);
    add('jlpt-kanji', expectedLevel(row.jlpt), id);
  }
  for (const [id, row] of Object.entries(input.kanken)) add('kanken', row.kk, id);
  for (const [id, row] of Object.entries(input.kmeta)) add('jlpt-kanji', row.jlpt, id);
  for (const row of corpus) add('kanken', row.kanken_level, row.glyph || row.entry_id);
  for (const [key, ids] of expected) {
    assert.deepEqual(new Set(membership.get(key).keys()), ids, key);
  }
  for (const collection of catalog.collections) {
    if (collection.level !== 'unknown') {
      assert.deepEqual(
        new Set(membership.get(collection.id).keys()),
        expected.get(collection.id) || new Set(),
        collection.id,
      );
    }
    assert.equal(collection.count, collection.entries.length);
    assert.equal(new Set(collection.entries.map((entry) => entry.id)).size, collection.count);
  }
});

test('Known source gaps remain honest; no synthetic N3 kanji or inferred levels', () => {
  assert.equal(Object.values(input.dict).filter((row) => row.jlpt === 'N1').length, 0);
  assert.equal(Object.values(input.words).filter((row) => row.jlpt === 1).length, 2274);
  assert.equal(byId.get('jlpt:N1').count, 2279);
  assert.equal(byId.get('jlpt-kanji:N3').count, 0);
  assert(byId.get('kanken:1/準1級').special);
  assert(byId.get('kanken:配当外').special);
  assert.equal(byId.get('kanken:unknown').count, 129);
  assert(catalog.stats.families.kanken.missingReading >= 537);
  assert(catalog.stats.families.kanken.missingReading < 700);
  assert(catalog.policy.scope.includes('not official or exam-complete'));
});

test('All collection pages concatenate to every entry with no cap or duplicate', () => {
  for (const collection of catalog.collections) {
    const first = core.search(collection, '', { pageSize: 137 });
    const collected = [];
    for (let page = 1; page <= first.pageCount; page++) {
      const result = core.search(collection, '', { pageSize: 137, page });
      collected.push(...result.entries);
      assert.equal(result.total, collection.count);
      assert.equal(result.start, (page - 1) * 137 + 1);
      assert.equal(result.end, Math.min(page * 137, collection.count));
    }
    assert.deepEqual(collected, collection.entries, collection.id);
  }
  const n1 = byId.get('jlpt:N1');
  assert.equal(core.search(n1, '', { pageSize: 100000 }).entries.length, 2279);
});

test('Each collection is deterministically reading-sorted; no sort mutates its input', () => {
  for (const collection of catalog.collections) {
    for (let index = 1; index < collection.count; index++) {
      assert(core.compareEntries(collection.entries[index - 1], collection.entries[index]) <= 0);
    }
    const before = [...collection.entries];
    const sorted = core.sortEntries(collection.entries);
    assert.deepEqual(collection.entries, before);
    assert.notEqual(sorted, collection.entries);
    assert.deepEqual(sorted, collection.entries);
  }
});

test('Source disagreements, unknown/special levels and metadata gaps in independent fixtures', () => {
  const fixture = deepFreeze({
    dict: {
      会う: { r: 'あう', m: ['meet'], jlpt: 'N5' },
      Ａ: { r: 'エー', m: ['fullwidth'], jlpt: 'N4' },
      A: { r: 'えー', m: ['ASCII'], jlpt: 'N4' },
      未分類: { r: '', m: [] },
      未知: { jlpt: 'N9' },
    },
    words: {
      会う: { r: 'アウ', g: 'encounter', jlpt: 1 },
      追加: { r: 'ついか', g: 'added', jlpt: 2 },
    },
    kanji: {
      字: { on: ['ジ'], kun: ['あざ'], m: 'character', kk: '1/準1級' },
      外: { on: [], kun: [], m: '', kk: '配当外' },
      無: { on: ['ム'], kun: [], m: 'nothing', kk: '' },
    },
    kanken: { 字: { kk: '1級' }, 未: { kk: '未来級' }, 新: { kk: '10級' } },
    kmeta: { 字: { jlpt: 'N2' }, 無: { g: 4 }, 別: { jlpt: 'N4' } },
  });
  const result = core.createCatalog(fixture, { includeCommitted: false });
  const get = (family, level) =>
    result.collections.find((item) => item.id === `${family}:${level}`);
  const entry = get('jlpt', 'N5').entries[0];
  assert.equal(entry.id, '会う');
  assert.equal(entry.conflict, true);
  assert.equal(get('jlpt', 'N1').entries[0].id, '会う');
  assert.equal(entry.reading, 'あう');
  assert.deepEqual(entry.meanings, ['meet']);
  assert.equal(core.search(get('jlpt', 'N5'), 'encounter').total, 1);
  assert.deepEqual(
    entry.levelSources.map(({ source, level }) => ({ source, level })),
    [
      { source: 'dict', level: 'N5' },
      { source: 'words', level: 'N1' },
    ],
  );
  assert.equal(get('jlpt', 'N4').count, 2, 'NFKC must not collapse identities');
  assert.equal(get('jlpt', 'N9').unknown, true);
  assert.equal(get('jlpt', 'unknown').entries[0].id, '未分類');
  assert.equal(get('kanken', '未来級').entries[0].id, '未');
  assert(get('kanken', '1/準1級').entries[0].conflicts.kanken);
  assert(!get('jlpt-kanji', 'N2').entries[0].conflicts['jlpt-kanji']);
  assert(get('kanken', '10級').entries[0].metadataMissing);
  assert(get('kanken', '配当外').entries[0].missingReading);
  assert(get('jlpt-kanji', 'unknown').entries.some((item) => item.id === '無'));
  assert.equal(get('jlpt-kanji', 'N4').count, 1, 'school grade must not become JLPT');
});

test('Query normalization, kana variants, token AND, whitespace, English and literal symbols', () => {
  const entries = [
    { id: '珈琲', reading: 'コーヒー', meanings: ['Coffee drink'], readings: ['こーひー'] },
    { id: '勉強', reading: 'べんきょう', meanings: ['study'], on: ['ベン'], kun: [] },
    { id: 'ＡＢＣ', reading: 'エービーシー', meanings: ['Alphabet [A]'] },
  ];
  assert.equal(core.normalizeQuery('　ｺｰﾋｰ　ＡＢＣ　'), 'こーひー abc');
  assert.equal(core.normalizeQuery('カ\u3099'), 'が');
  assert.equal(core.normalizeQuery('ヷ'), 'わ\u3099');
  assert.equal(core.searchEntries(entries, 'ｺｰﾋｰ').length, 1);
  assert.equal(core.searchEntries(entries, 'こーひー').length, 1);
  assert.equal(core.searchEntries(entries, 'coffee DRINK').length, 1);
  assert.equal(core.searchEntries(entries, 'coffee study').length, 0);
  assert.equal(core.searchEntries(entries, 'abc [a]').length, 1);
  assert.equal(core.searchEntries(entries, 'ベンキョウ').length, 1);
  assert.equal(core.searchEntries(entries, 'ベン').length, 1);
  assert.equal(core.searchEntries(entries, '.*').length, 0, 'query is not a regular expression');
  assert.equal(core.searchEntries(entries, null).length, 3);
  assert.equal(core.searchEntries(entries, '　 \t\n').length, 3);
  assert.notEqual(core.searchEntries(entries, ''), entries);
});

test('Pagination handles empty results, late pages, fractional and invalid options without caps', () => {
  const entries = Array.from({ length: 251 }, (_, index) => ({ id: `${index}` }));
  assert.deepEqual(core.paginateEntries([], {}), {
    entries: [],
    total: 0,
    page: 1,
    pageCount: 0,
    start: 0,
    end: 0,
  });
  for (const page of [-1, 0, NaN, Infinity, 'oops']) {
    assert.equal(core.paginateEntries(entries, { page }).page, 1);
  }
  for (const pageSize of [-1, 0, NaN, Infinity, 'oops']) {
    assert.equal(core.paginateEntries(entries, { pageSize }).entries.length, 100);
  }
  const last = core.paginateEntries(entries, { page: 999, pageSize: 100 });
  assert.equal(last.page, 3);
  assert.equal(last.entries.length, 51);
  assert.equal(last.start, 201);
  assert.equal(last.end, 251);
  assert.equal(core.paginateEntries(entries, { page: 2.8, pageSize: 10.8 }).start, 11);
  assert.equal(core.paginateEntries(entries, { page: '2', pageSize: '100' }).start, 101);
  assert.equal(core.paginateEntries(entries, { pageSize: 999999 }).entries.length, 251);
});

test('Output edits cannot mutate runtime sources or the licensed source sidecar', () => {
  const fixture = { dict: { 語: { r: 'ご', m: ['word'], jlpt: 'N5' } } };
  const first = core.createCatalog(fixture, { includeCommitted: false });
  first.collections.find((item) => item.id === 'jlpt:N5').entries[0].meanings.push('changed');
  assert.deepEqual(fixture.dict.語.m, ['word']);
  const full = core.createCatalog(input);
  const record = full.collections
    .find((item) => item.id === 'kanken:1級')
    .entries.find((entry) => entry.sourceRecords.length);
  record.sourceRecords[0].level = 'changed';
  full.stats.committedAudit.kankenSourceRows = -1;
  assert.deepEqual(core.createCatalog(input), catalog);
});

test('Browser global and CommonJS exports have the same contract', () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(CORE_PATH, 'utf8'), context);
  assert(context.BunkiReferenceCore);
  assert.deepEqual(Object.keys(context.BunkiReferenceCore).sort(), Object.keys(core).sort());
  const browserCatalog = context.BunkiReferenceCore.createCatalog(input);
  assert.equal(JSON.stringify(browserCatalog.stats), JSON.stringify(catalog.stats));
});

const evidence = {
  schemaVersion: 1,
  command: 'node tools/test-reference-core.mjs',
  testsPassed: testCount,
  scope: catalog.policy.scope,
  policy: catalog.policy,
  stats: catalog.stats,
  collections: catalog.collections.map(({ entries, ...collection }) => ({
    ...collection,
    glyphEntries: entries.filter((entry) => !entry.missingGlyph).length,
    noGlyphEntries: entries.filter((entry) => entry.missingGlyph).length,
    conflicts: entries.filter((entry) => entry.conflicts[collection.family]).length,
    missingReading: entries.filter((entry) => entry.missingReading).length,
    missingMeanings: entries.filter((entry) => entry.missingMeanings).length,
  })),
};
mkdirSync(dirname(COVERAGE_PATH), { recursive: true });
writeFileSync(COVERAGE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`\n${testCount} reference-core tests passed.`);
console.log(
  JSON.stringify(
    {
      sourceRows: catalog.stats.sourceRows,
      families: catalog.stats.families,
      counts: catalog.stats.counts,
    },
    null,
    2,
  ),
);
console.log(`Coverage evidence: ${COVERAGE_PATH}`);
