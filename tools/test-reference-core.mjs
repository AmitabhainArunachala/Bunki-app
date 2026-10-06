/**
 * Corpus-exhaustiveness, provenance, purity and query contract tests.
 * Run: node tools/test-reference-core.mjs
 * Optionally verify raw metadata parity with --archive /path/to/archive.zip.
 * Verification never rewrites committed evidence. --evidence-out /external/dir
 * emits proposed evidence for review, then still checks the committed files.
 *
 * Uses only committed local sources. No network or inferred classifications.
 * The large JMdict-v2 dictionary has no JLPT field and is not graded here.
 */
import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  buildReferenceData,
  dictionaryCandidates,
  OUTPUT,
  serialize,
  sourcePaths,
} from './build-reference-data.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_PATH = resolve(ROOT, 'prototypes/corridor/reference-core.js');
const argument = (flag) => {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  assert(
    process.argv[index + 1] && !process.argv[index + 1].startsWith('--'),
    `${flag} requires a path`,
  );
  return process.argv[index + 1];
};
const COVERAGE_PATH = resolve(
  argument('--coverage') || resolve(ROOT, 'tools/fixtures/reference/coverage.json'),
);
const RELATIONSHIPS_PATH = resolve(
  argument('--relationships') || resolve(ROOT, 'tools/fixtures/reference/relationships.json'),
);
const EVIDENCE_OUT = argument('--evidence-out');
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
    new Map(collection.entries.map((entry) => [entry.key, entry])),
  ]),
);
const at = (collectionId, entryId, reading) =>
  membership
    .get(collectionId)
    ?.get(collectionId.startsWith('jlpt:') ? JSON.stringify([entryId, reading ?? '']) : entryId);
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
        (collection) => collection.family === 'jlpt' && at(collection.id, id, row.r),
      );
      assert(relevant.length, `${source}:${id} was dropped`);
      if (level) {
        const entry = at(`jlpt:${level}`, id, row.r);
        assert(entry, `${source}:${id}:${level} was dropped`);
        assert(entry.levelSources.some((tag) => tag.source === source && tag.level === level));
      } else {
        assert(
          relevant.every((collection) => at(collection.id, id, row.r).sources.includes(source)),
        );
      }
    }
  }
});

test('Every wbig/drift word and kotobako vocabulary classification is represented', () => {
  for (const [id, reading, , level] of wbig) assert(at(`jlpt:N${level}`, id, reading), id);
  for (const [id, reading, , level] of json(sourcePaths.driftWords))
    assert(at(`jlpt:N${level}`, id, reading), id);
  for (const row of kotobako.vocab) {
    if (row.jlpt) assert(at(`jlpt:${row.jlpt}`, row.word, row.reading), `${row.id}:${row.jlpt}`);
  }
  assert.deepEqual(
    committed.extraWords,
    [
      ...kotobako.vocab
        .filter((row) => row.jlpt)
        .map((row) => [
          row.word,
          row.reading,
          row.meanings,
          row.jlpt,
          row.id,
          'kotobako',
          (row.containsKanji || []).map((id) => kotobako.kanji.find((item) => item.id === id).char),
        ]),
      ...json(sourcePaths.driftWords).flatMap(([id, reading, meaning, level], i) =>
        level ? [[id, reading, [meaning], level, `row:${i + 1}`, 'drift-words']] : [],
      ),
      ...wbig.flatMap(([id, reading, meaning, level], i) =>
        level ? [[id, reading, [meaning], level, `row:${i + 1}`, 'wbig']] : [],
      ),
    ],
    'Do not discard an attestation just because another source has the same level',
  );
  for (const [id, reading, meanings, level, sourceId, source] of committed.extraWords) {
    const entry = at(`jlpt:${expectedLevel(level)}`, id, reading);
    assert(
      entry.levelSources.some(
        (tag) =>
          tag.source === source &&
          tag.sourceId === sourceId &&
          tag.reading === reading &&
          tag.rawLevel === level,
      ),
    );
    assert(
      entry.variants.some(
        (variant) =>
          variant.source === source &&
          variant.sourceId === sourceId &&
          variant.reading === reading &&
          JSON.stringify(variant.meanings) === JSON.stringify(meanings),
      ),
    );
  }
});

test('Every boot kanji, grade fact and JLPT metadata row is accounted for', () => {
  for (const [id, row] of Object.entries(input.kanji)) {
    assert(at(`kanken:${row.kk || 'unknown'}`, id), id);
    assert(
      catalog.collections.some(
        (collection) => collection.family === 'jlpt-kanji' && at(collection.id, id, row.r),
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
    if (row.jlpt)
      assert(
        at(`jlpt-kanji:${row.jlpt}`, row.char).levelSources.some(
          (s) => s.source === 'kotobako' && s.sourceId === row.id && s.level === row.jlpt,
        ),
        row.id,
      );
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
    assert.equal(sourceRecord.speciesId, row.species_id);
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
    for (const [id, row] of Object.entries(input[source]))
      add('jlpt', expectedLevel(row.jlpt), JSON.stringify([id, row.r ?? '']));
  }
  for (const row of kotobako.vocab)
    add('jlpt', row.jlpt, JSON.stringify([row.word, row.reading ?? '']));
  for (const [id, reading, , level] of json(sourcePaths.driftWords))
    add('jlpt', `N${level}`, JSON.stringify([id, reading ?? '']));
  for (const [id, reading, , level] of wbig)
    add('jlpt', `N${level}`, JSON.stringify([id, reading ?? '']));
  for (const [id, row] of Object.entries(input.kanji)) {
    add('kanken', row.kk, id);
    add('jlpt-kanji', expectedLevel(row.jlpt), id);
  }
  for (const [id, row] of Object.entries(input.kanken)) add('kanken', row.kk, id);
  for (const [id, row] of Object.entries(input.kmeta)) add('jlpt-kanji', row.jlpt, id);
  for (const row of corpus) add('kanken', row.kanken_level, row.glyph || row.entry_id);
  for (const row of kotobako.kanji) add('jlpt-kanji', row.jlpt, row.char);
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
    assert.equal(new Set(collection.entries.map((entry) => entry.key)).size, collection.count);
  }
});

test('Kentei source species relationships are exact, bidirectional and never inherited grades', () => {
  const allKanji = new Map(
    catalog.collections
      .filter((c) => c.family === 'kanken')
      .flatMap((c) => c.entries.map((entry) => [entry.id, entry])),
  );
  for (const entry of allKanji.values()) {
    const species = new Set(entry.sourceRecords.map((row) => row.speciesId));
    const own = new Set(entry.sourceRecords.map((row) => row.sourceId));
    const expected = corpus.filter((row) => species.has(row.species_id) && !own.has(row.entry_id));
    assert.deepEqual(
      new Set(entry.relatedForms.map((row) => row.sourceId)),
      new Set(expected.map((row) => row.entry_id)),
      entry.id,
    );
    for (const related of entry.relatedForms) {
      assert(allKanji.has(related.id), `Dangling relationship ${related.sourceId}`);
      assert(
        allKanji
          .get(related.id)
          .sourceRecords.some(
            (row) => row.sourceId === related.sourceId && row.speciesId === related.speciesId,
          ),
      );
    }
  }
  assert.equal(catalog.stats.identityCollisions, 1);
  assert.deepEqual(at('kanken:7級', '芸').speciesIds, ['CT-000196', 'CT-001346']);
  assert(at('kanken:7級', '芸').identityCollision);
  assert(!at('kanken:準2級', '缶').identityCollision);
  for (const entry of allKanji.values()) {
    if (!entry.missingGlyph) continue;
    assert.equal(entry.reading, '', 'Related forms cannot supply a missing glyph reading');
    assert.deepEqual(entry.meanings, [], 'Related forms cannot supply missing-glyph meanings');
  }
});

test('Dictionary links retain all exact candidates and enforce written-form reading scopes', () => {
  const fixtureRow = (seq, written, kana, scopes) => [
    seq,
    '',
    '',
    '',
    written,
    kana,
    [],
    [],
    0,
    [],
    [],
    scopes,
  ];
  const candidates = dictionaryCandidates([
    fixtureRow('1', ['生', '性'], ['せい', 'なま', 'しょう'], [[1], [0], 1]),
    fixtureRow('2', ['生'], ['なま'], [0]),
    fixtureRow('3', ['Ａ'], ['エー'], [0]),
  ]);
  assert.deepEqual(candidates('生', 'なま'), ['1', '2'], 'Never choose first homograph');
  assert.deepEqual(candidates('生', 'せい'), [], 'Disallowed written form');
  assert.deepEqual(candidates('生', 'しょう'), [], 'No-kanji reading');
  assert.deepEqual(candidates('しょう', 'しょう'), ['1']);
  assert.deepEqual(candidates('Ａ', 'エー'), ['3']);
  assert.deepEqual(candidates('A', 'エー'), [], 'No identity NFKC folding');
  assert.deepEqual(candidates('Ａ', 'えー'), [], 'No kana folding for identity');
  assert.deepEqual(candidates('生; 性', 'なま'), [], 'Do not split printed source keys');
  const index = json(sourcePaths.dictionaryIndex);
  const bySequence = new Map(index.entries.map((row) => [row[0], row]));
  for (const [id, reading, sequences] of committed.wordLinks) {
    const entry = catalog.collections
      .filter((c) => c.family === 'jlpt')
      .map((c) => at(c.id, id, reading))
      .find(Boolean);
    assert(entry.readings.includes(reading));
    assert(
      entry.dictionaryLinks.some(
        (link) =>
          link.reading === reading && JSON.stringify(link.candidates) === JSON.stringify(sequences),
      ),
    );
    for (const seq of sequences) {
      const row = bySequence.get(seq);
      assert(row, `Unresolved JMdict ID ${seq}`);
      const kanaIndex = row[5].indexOf(reading);
      assert(kanaIndex >= 0);
      const scope = row[11][kanaIndex];
      assert(
        id === reading ||
          (row[4].includes(id) &&
            (scope === 0 || (Array.isArray(scope) && scope.includes(row[4].indexOf(id))))),
      );
    }
    assert.equal(
      entry.canonicalId,
      undefined,
      'Candidates must not become asserted sense identity',
    );
  }
});

test('Partial kanji fields fill only from the same literal and retain field provenance', () => {
  for (const glyph of ['典', '尺', '慨', '旺', '論', '賓', '赦', '頒']) {
    const entry = catalog.collections
      .filter((c) => c.family === 'kanken')
      .map((c) => at(c.id, glyph))
      .find(Boolean);
    assert.equal(input.kanji[glyph].kun.length, 0);
    assert(entry.kun.length, glyph);
    const provider = entry.metadataSources.kun;
    const row = committed.kanjiMetadata.find(
      (row) => row[0] === glyph && row[5] === provider.source,
    );
    assert.deepEqual(entry.kun, row[2]);
    assert.deepEqual(entry.on, input.kanji[glyph].on, 'Do not overwrite supplied readings');
    assert.deepEqual(entry.meanings, [input.kanji[glyph].m], 'Do not overwrite supplied meanings');
  }
  const fixture = core.createCatalog({
    kanji: { 字: { on: ['ジ'], kun: [], m: 'character' } },
    extra: { kanjiMetadata: [['字', ['シ'], ['あざ'], ['letter'], 6, 'kanjidic-pinned']] },
  });
  const entry = fixture.collections.find((c) => c.id === 'kanken:unknown').entries[0];
  assert.deepEqual(entry.on, ['ジ']);
  assert.deepEqual(entry.kun, ['あざ']);
  assert.equal(entry.metadataSources.on.source, 'kanji');
  assert.equal(entry.metadataSources.kun.source, 'kanjidic-pinned');
  assert.equal(entry.strokeCount, 6);
});

test('Offline checks reject accidental pinned metadata corruption rather than blessing it', () => {
  const damaged = JSON.parse(JSON.stringify(committed));
  damaged.kanjiMetadata.find((row) => row[5] === 'kanjidic-pinned')[3].push('corrupt');
  assert.throws(() => buildReferenceData({ prior: damaged }), /projection integrity mismatch/);
});

const referenceEntries = [
  ...new Map(
    catalog.collections.flatMap((collection) =>
      collection.entries.map((entry) => [`${entry.type}:${entry.key}`, entry]),
    ),
  ).values(),
];
const referenceId = (entry) => `${entry.type}:${entry.key}`;
const detailTargets = new Map();
const detailHashes = {};
test('Every dictionary candidate has an actual correctly routed canonical detail target', () => {
  const index = json(sourcePaths.dictionaryIndex);
  const candidatePairs = new Map();
  for (const [id, reading, candidates] of committed.wordLinks) {
    for (const seq of candidates) {
      if (!candidatePairs.has(seq)) candidatePairs.set(seq, []);
      candidatePairs.get(seq).push([id, reading]);
    }
  }
  for (let shard = 0; shard < index.shardCount; shard++) {
    const path = `prototypes/corridor/data/share_alike/dict-v2/${shard.toString(16).padStart(2, '0')}.json`;
    const bytes = read(path);
    detailHashes[path] = createHash('sha256').update(bytes).digest('hex');
    const detail = JSON.parse(bytes);
    assert.equal(detail.shard, shard);
    assert.equal(detail.sourcePin, index.source.pin);
    for (const row of detail.entries) {
      assert(!detailTargets.has(row[0]), `Duplicate canonical detail ID ${row[0]}`);
      let hash = 2166136261;
      for (const ch of row[0]) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
      assert.equal(hash & 15, shard, `Unreachable shard for ${row[0]}`);
      detailTargets.set(row[0], path);
      for (const [id, reading] of candidatePairs.get(row[0]) || []) {
        const kana = row[2].find((form) => form[0] === reading);
        assert(kana, `${row[0]} missing exact reading in detail`);
        assert(
          id === reading ||
            (row[1].some((form) => form[0] === id) &&
              (kana[3].includes('*') || kana[3].includes(id))),
          `${row[0]} detail does not permit ${id}/${reading}`,
        );
      }
    }
  }
  assert.deepEqual(new Set(detailTargets.keys()), new Set(index.entries.map((row) => row[0])));
  for (const [, , candidates] of committed.wordLinks) {
    for (const seq of candidates) assert(detailTargets.has(seq), `Dead dictionary target ${seq}`);
  }
});

test('Reference-to-runtime and source word-to-kanji edges have no dangling canonical targets', () => {
  const all = new Map(referenceEntries.map((entry) => [referenceId(entry), entry]));
  for (const entry of referenceEntries) {
    const exists =
      entry.type === 'word'
        ? !!entry.reading && (input.dict[entry.id] || input.words[entry.id])?.r === entry.reading
        : Object.hasOwn(input.kanji, entry.id) && !entry.missingGlyph;
    assert.equal(!!entry.canonicalTarget, exists);
    if (exists)
      assert.deepEqual(entry.canonicalTarget, {
        type: entry.type,
        id: entry.id,
        ...(entry.type === 'word' ? { reading: entry.reading } : {}),
      });
    for (const link of entry.kanjiLinks) {
      assert.equal(!!link.canonicalTarget, Object.hasOwn(input.kanji, link.id));
      if (link.referenceId) assert(all.has(`kanji:${link.referenceId}`));
      if (link.canonicalTarget) {
        assert.equal(link.canonicalTarget.type, 'kanji');
        assert.equal(link.canonicalTarget.id, link.id);
      }
      const row =
        link.source === 'kotobako'
          ? committed.extraWords.find((r) => r[5] === link.source && r[4] === link.sourceId)
          : input[link.source][link.sourceId];
      assert((link.source === 'kotobako' ? row[6] : row.k).includes(link.id));
    }
  }
  for (const source of ['dict', 'words']) {
    for (const [id, row] of Object.entries(input[source])) {
      const actual = all
        .get(`word:${JSON.stringify([id, row.r ?? ''])}`)
        .kanjiLinks.filter((link) => link.source === source);
      assert.deepEqual(
        actual.map((link) => link.id),
        row.k || [],
        `${source}:${id}`,
      );
    }
  }
  const absent = core
    .createCatalog({ words: { 語: { k: ['缺'], jlpt: 5 } } })
    .collections.find((c) => c.id === 'jlpt:N5').entries[0];
  assert.equal(absent.kanjiLinks[0].canonicalTarget, null);
  assert.equal(absent.kanjiLinks[0].referenceId, null);
  assert.equal(absent.kanjiLinks[0].status, 'absent-target');
  assert(absent.metadataMissing, 'Metadata absence is separate from target availability');
});

test('Known source gaps remain honest; no synthetic N3 kanji or inferred levels', () => {
  assert.equal(Object.values(input.dict).filter((row) => row.jlpt === 'N1').length, 0);
  assert.equal(Object.values(input.words).filter((row) => row.jlpt === 1).length, 2274);
  assert.equal(
    new Set(byId.get('jlpt:N1').entries.map((entry) => entry.id)).size,
    2279,
    'Preserve all original printed forms while separating readings',
  );
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
  assert.equal(core.search(n1, '', { pageSize: 100000 }).entries.length, n1.count);
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
      会う: { r: 'あう', g: 'encounter', jlpt: 1 },
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
  gapCensus: {
    kenteiGlyphlessRecords: referenceEntries.filter((e) => e.type === 'kanji' && e.missingGlyph)
      .length,
    kenteiVisibleGlyphsMissingReading: referenceEntries
      .filter(
        (e) =>
          e.type === 'kanji' &&
          !e.missingGlyph &&
          e.missingReading &&
          e.levelSources.some((s) => s.family === 'kanken'),
      )
      .map((e) => e.id),
    kenteiVisibleGlyphsMissingMeanings: referenceEntries
      .filter(
        (e) =>
          e.type === 'kanji' &&
          !e.missingGlyph &&
          e.missingMeanings &&
          e.levelSources.some((s) => s.family === 'kanken'),
      )
      .map((e) => e.id),
    kenteiVisibleGapsAbsentPinnedLiteral: referenceEntries
      .filter(
        (e) =>
          e.type === 'kanji' &&
          !e.missingGlyph &&
          e.metadataMissing &&
          e.levelSources.some((s) => s.family === 'kanken') &&
          !committed.kanjiMetadata.some((row) => row[0] === e.id && row[5] === 'kanjidic-pinned'),
      )
      .map((e) => e.id),
    baseKanjiFieldsFilled: referenceEntries
      .filter((e) => e.type === 'kanji' && input.kanji[e.id])
      .flatMap((e) =>
        Object.entries(e.metadataSources)
          .filter(([, p]) => p.source !== 'kanji' && p.source !== 'kmeta')
          .map(([field, provider]) => ({ id: e.id, field, ...provider })),
      ),
    policy:
      'Glyphless records and absent metadata are not broken canonical links. Missing on or kun alone is not proof of a metadata gap; a character need not have both.',
  },
  collections: catalog.collections.map(({ entries, ...collection }) => ({
    ...collection,
    glyphEntries: entries.filter((entry) => !entry.missingGlyph).length,
    noGlyphEntries: entries.filter((entry) => entry.missingGlyph).length,
    conflicts: entries.filter((entry) => entry.conflicts[collection.family]).length,
    missingReading: entries.filter((entry) => entry.missingReading).length,
    missingMeanings: entries.filter((entry) => entry.missingMeanings).length,
  })),
};
const memberIds = new Map(referenceEntries.map((entry) => [referenceId(entry), []]));
for (const collection of catalog.collections) {
  for (const entry of collection.entries) memberIds.get(referenceId(entry)).push(collection.id);
}
const wordKanjiEdges = referenceEntries.flatMap((entry) =>
  entry.kanjiLinks.map((link) => [
    referenceId(entry),
    link.referenceId ? `kanji:${link.referenceId}` : null,
    link.id,
    link.canonicalTarget ? `kanji:${link.id}` : null,
    link.source,
    link.sourceId,
    link.status,
  ]),
);
const referencedSequences = [...new Set(committed.wordLinks.flatMap((row) => row[2]))];
const relationshipEvidence = {
  schemaVersion: 1,
  command: 'node tools/test-reference-core.mjs',
  pool: 'share_alike',
  sources: committed.sources,
  sourceHashes: committed.audit.sourceHashes,
  canonicalDetailHashes: detailHashes,
  policy: {
    ...catalog.policy,
    canonicalTargets:
      'Only runtime-resolved exact form/reading words and exact kanji records are canonical targets. Null means reference-only, not a dangling link. JMdict candidates are separate, restriction-checked relationships, not asserted sense identity.',
    wordKanji:
      'Only explicit dict.k, words.k and kotobako containsKanji source relationships. No spelling decomposition, normalized identity, or exam-level inheritance.',
  },
  census: {
    referenceNodes: referenceEntries.length,
    canonicalRuntimeTargets: referenceEntries.filter((e) => e.canonicalTarget).length,
    referenceOnlyNodes: referenceEntries.filter((e) => !e.canonicalTarget).length,
    referenceOnlyVisibleGlyphs: referenceEntries.filter(
      (e) => !e.canonicalTarget && !e.missingGlyph && e.type === 'kanji',
    ).length,
    missingGlyphNodes: referenceEntries.filter((e) => e.missingGlyph).length,
    wordKanjiSourceEdges: wordKanjiEdges.length,
    wordKanjiDistinctPairs: new Set(wordKanjiEdges.map((e) => JSON.stringify(e.slice(0, 3)))).size,
    wordKanjiBundledEdges: wordKanjiEdges.filter((e) => e[6] === 'bundled').length,
    wordKanjiReferenceOnlyEdges: wordKanjiEdges.filter((e) => e[6] === 'reference-only').length,
    wordKanjiAbsentTargets: wordKanjiEdges.filter((e) => e[6] === 'absent-target').length,
    dictionaryCandidateTargets: referencedSequences.length,
    ...committed.audit.identity,
    danglingCanonicalRuntimeTargets: 0,
    danglingDictionaryTargets: 0,
    danglingKenteiRelationships: 0,
    memberships: Object.fromEntries(
      Object.entries(catalog.stats.families).map(([family, stats]) => [
        family,
        {
          labelled: stats.memberships,
          unassigned: stats.unknown,
          conflicts: stats.conflicts,
        },
      ]),
    ),
  },
  layout: {
    nodes: [
      'referenceId',
      'runtimeCanonicalTargetOrNull',
      'collections',
      'missingGlyph',
      'missingReading',
      'missingMeanings',
    ],
    classifications: [
      'referenceId',
      'family',
      'level',
      'source',
      'sourceIdOrNull',
      'readingOrNull',
      'rawLevel',
    ],
    wordKanji: [
      'wordReferenceId',
      'kanjiReferenceIdOrNull',
      'sourceGlyph',
      'runtimeCanonicalTargetOrNull',
      'source',
      'sourceId',
      'status',
    ],
    dictionaryCandidates: ['wordReferenceId', 'exactReading', 'candidateJmdictSequences'],
    dictionaryTargets: ['jmdictSequence', 'verifiedDetailShard'],
    kenteiRecords: ['kanjiReferenceId', 'sourceEntryId', 'sourceSpeciesId', 'sourceGrade'],
  },
  nodes: referenceEntries.map((e) => [
    referenceId(e),
    e.canonicalTarget ? `${e.type}:${e.id}` : null,
    memberIds.get(referenceId(e)),
    e.missingGlyph,
    e.missingReading,
    e.missingMeanings,
  ]),
  classifications: referenceEntries.flatMap((e) =>
    e.levelSources.map((s) => [
      referenceId(e),
      s.family,
      s.level,
      s.source,
      s.sourceId ?? null,
      s.reading ?? null,
      s.rawLevel,
    ]),
  ),
  wordKanji: wordKanjiEdges,
  dictionaryCandidates: committed.wordLinks.map(([id, reading, seqs]) => [
    `word:${JSON.stringify([id, reading])}`,
    reading,
    seqs,
  ]),
  dictionaryTargets: referencedSequences.map((seq) => [seq, detailTargets.get(seq)]),
  kenteiRecords: corpus.map((row) => [
    `kanji:${row.glyph || row.entry_id}`,
    row.entry_id,
    row.species_id,
    row.kanken_level,
  ]),
};
const evidenceBytes = `${JSON.stringify(evidence, null, 2)}\n`;
const relationshipBytes = `${JSON.stringify(relationshipEvidence)}\n`;
if (EVIDENCE_OUT) {
  const destination = resolve(EVIDENCE_OUT);
  assert(
    destination !== ROOT && !destination.startsWith(`${ROOT}/`),
    'Evidence output must be outside the repository',
  );
  mkdirSync(destination, { recursive: true });
  writeFileSync(resolve(destination, 'coverage.json'), evidenceBytes);
  writeFileSync(resolve(destination, 'relationships.json'), relationshipBytes);
  console.log(`Proposed evidence emitted to ${destination}; committed evidence must still match.`);
}
for (const [path, expected] of [
  [COVERAGE_PATH, evidenceBytes],
  [RELATIONSHIPS_PATH, relationshipBytes],
]) {
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(
    digest(readFileSync(path)),
    digest(expected),
    `${path} is stale. Review generated evidence and update it deliberately; verification does not rewrite it.`,
  );
}
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
