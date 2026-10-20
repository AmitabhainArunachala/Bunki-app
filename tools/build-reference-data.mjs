/**
 * Reference-only, licensed data projection. Never changes lesson source files.
 * Full rebuild:
 * node tools/build-reference-data.mjs --archive /path/to/kanjidic2-en-3.6.2+20260803141815.json.zip
 * Offline corpus projection check:
 * node tools/build-reference-data.mjs --check
 * Raw metadata parity + byte-identical rebuild check:
 * node tools/build-reference-data.mjs --check --archive /path/to/archive.zip
 *
 * Without --archive, retains the already-pinned metadata projection from the
 * existing sidecar, while independently rebuilding every corpus classification.
 * It does not download anything, copy query codes, or infer exam classifications.
 */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUT = resolve(ROOT, 'prototypes/corridor/data/share_alike/reference-extra.json');
export const ARCHIVE_SHA = '5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6';
const FACTS_SOURCE = Object.freeze({
  release: '3.6.2+20260803141815',
  archiveSha256: ARCHIVE_SHA,
  dictionaryDate: '2026-08-03',
  databaseVersion: '2026-215',
});
export const sourcePaths = {
  dict: 'prototypes/corridor/data/share_alike/dict.json',
  words: 'prototypes/corridor/data/share_alike/words.json',
  kanji: 'prototypes/corridor/data/share_alike/kanji.json',
  kanken: 'prototypes/corridor/data/proprietary_safe/kanken.json',
  kmeta: 'prototypes/corridor/data/share_alike/strokes.json',
  kankenCorpus: 'corpus/datasets/kanji/kanken.jsonl',
  kotobako: 'prototypes/bunki-sites-v11/public/kotobako-static.json',
  wbig: 'prototypes/drift/data/wbig.json',
  driftWords: 'apps/app/src/data/generated/drift-words.json',
  driftKanji: 'apps/app/src/data/generated/drift-kanji.json',
  kanjidicSample: 'corpus/samples/jmdict/kanjidic_sample.jsonl',
  dictionaryIndex: 'prototypes/corridor/data/share_alike/dict-v2/index.json',
  // Kanji-trust: the complete KANJIDIC2 readings already ship in the SKIP sidecar (same pinned archive);
  // the official 2010 table supplies only the readings KANJIDIC2 lacks (lead's ruling, 2026-10-19 17:25).
  skip: 'prototypes/corridor/data/share_alike/skip.json',
  joyo: 'tools/fixtures/reference/joyo-2010.json',
};
const core = createRequire(import.meta.url)('../prototypes/corridor/reference-core.js');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const jsonl = (path) =>
  read(path)
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const histogram = (rows, fn) => {
  const counts = {};
  for (const row of rows) {
    const key = String(fn(row) ?? 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
};
export const serialize = (data) => `${JSON.stringify(data)}\n`;

// Exact forms/readings only. Search normalization, punctuation splitting and
// first-match selection would turn homographs into false canonical identities.
// These are dictionary candidates, not evidence that a level applies to every
// sense of the JMdict entry. Reading restrictions must allow the written form.
export function dictionaryCandidates(entries) {
  const pairs = new Map();
  const add = (head, reading, seq) => {
    const key = JSON.stringify([head, reading]);
    if (!pairs.has(key)) pairs.set(key, new Set());
    pairs.get(key).add(seq);
  };
  for (const row of entries) {
    const [seq, , , , written, kana] = row;
    assert(/^\d+$/.test(seq), 'Expected stable JMdict sequence ID');
    assert.equal(row[11].length, kana.length, 'Reading scope alignment');
    kana.forEach((reading, i) => {
      add(reading, reading, seq);
      const scope = row[11][i];
      const forms =
        scope === 0
          ? written
          : scope === 1
            ? []
            : scope.map((j) => {
                assert(Number.isInteger(j) && written[j] != null, 'Invalid written-form scope');
                return written[j];
              });
      for (const head of forms) add(head, reading, seq);
    });
  }
  return (head, reading) => [...(pairs.get(JSON.stringify([head, reading])) || [])];
}

const byCodePoint = (a, b) => a.codePointAt(0) - b.codePointAt(0);
const appliesTo = (list, value) =>
  Array.isArray(list) && (list.includes('*') || list.includes(value));
export const WORDS_PER_EMPTY_KANJI = 10;

/** K02 reference facts, not lesson answers. All source glosses survive verbatim and radical schemes stay separate. */
export function kanjiFactsProjection(characters) {
  const facts = characters
    .map((row) => {
      const radicals = row.radicals || [];
      assert(
        radicals.every((radical) => ['classical', 'nelson_c'].includes(radical.type)),
        `Unrecognized radical scheme: ${row.literal}`,
      );
      const classical = radicals.filter((radical) => radical.type === 'classical');
      const nelson = radicals.filter((radical) => radical.type === 'nelson_c');
      assert(
        classical.length === 1 && nelson.length <= 1,
        `Ambiguous radical scheme: ${row.literal}`,
      );
      return [
        row.literal,
        (row.readingMeaning?.groups || [])
          .flatMap((group) => group.meanings || [])
          .filter((meaning) => meaning.lang === 'en')
          .map((meaning) => meaning.value),
        classical[0].value,
        nelson[0]?.value ?? null,
      ];
    })
    .sort((a, b) => byCodePoint(a[0], b[0]));
  const projectedSha256 = hash(serialize(facts));
  assert(
    core.validateKanjiFacts({
      schemaVersion: 4,
      kanjiFactsVersion: 1,
      kanjiFacts: facts,
      audit: {
        kanjiFacts: {
          schemaVersion: 1,
          ...FACTS_SOURCE,
          projectedRows: facts.length,
          projectedSha256,
        },
      },
    }),
    'Invalid or incomplete KANJIDIC2 reference facts',
  );
  return facts;
}

/**
 * Kanji-trust projection (K01, K07). Copies facts only; nothing is merged, normalized into a new form or generated.
 * - kanjiReadings [glyph, on, kun]: every KANJIDIC2 reading of each kanji.json or Jōyō glyph, source order.
 * - kanjiRecords [glyph, meanings, strokeCount, classicalRadical]: the Jōyō forms kanji.json lacks (剝, 𠮟).
 * - officialReadings [glyph, reading]: each 常用漢字表 reading that neither kanji.json nor KANJIDIC2 has.
 * - jmdictWords [glyph, [[seq, writtenForm, reading, firstGloss, formTags]]]: for a Jōyō kanji no shipped word list
 *   names (headwords, `k` lists or alternate spellings — the app's own rule), up to 10 JMdict entries from the
 *   shipped dict-v2 data written with it: never a search-only spelling (sK); the reading is one JMdict allows for
 *   that spelling and the gloss the first of the first sense allowed for both; common spellings first.
 * - kanjiWithoutWords: the Jōyō kanji no shipped dictionary writes any word with.
 */
export function kanjiTrustProjection({
  kanji,
  kmeta,
  dict,
  words,
  skip,
  joyo,
  index,
  detail,
  archiveCharacters,
}) {
  const skipBy = new Map(skip.entries.map((entry) => [entry.literal, entry]));
  const joyoGlyphs = joyo.rows.map((row) => row[0]);
  assert.deepEqual(
    [...joyoGlyphs].sort(byCodePoint),
    Object.keys(kmeta).sort(byCodePoint),
    'The official table and the shipped stroke data name the same 2,136 characters',
  );
  const glyphs = [...new Set([...Object.keys(kanji), ...joyoGlyphs])].sort(byCodePoint);
  const kanjiReadings = [];
  for (const glyph of glyphs) {
    const entry = skipBy.get(glyph);
    if (!entry || (!entry.readings.on.length && !entry.readings.kun.length)) {
      assert(!kmeta[glyph], `Jōyō ${glyph} has KANJIDIC2 readings`);
      continue;
    }
    kanjiReadings.push([glyph, [...entry.readings.on], [...entry.readings.kun]]);
  }
  const kanjiRecords = joyoGlyphs
    .filter((glyph) => !kanji[glyph])
    .sort(byCodePoint)
    .map((glyph) => {
      const entry = skipBy.get(glyph);
      return [glyph, [...entry.meanings], entry.strokeCounts?.[0] ?? null, entry.radical ?? null];
    });
  if (archiveCharacters) {
    const unique = (values) => [...new Set(values)];
    for (const [glyph, on, kun] of kanjiReadings) {
      const groups = archiveCharacters.get(glyph)?.readingMeaning?.groups || [];
      const raw = groups.flatMap((group) => group.readings || []);
      assert.deepEqual(
        [on, kun],
        [
          unique(raw.filter((reading) => reading.type === 'ja_on').map((reading) => reading.value)),
          unique(
            raw.filter((reading) => reading.type === 'ja_kun').map((reading) => reading.value),
          ),
        ],
        `KANJIDIC2 reading parity: ${glyph}`,
      );
    }
  }
  const projected = new Map(kanjiReadings.map(([glyph, on, kun]) => [glyph, [...on, ...kun]]));
  const officialReadings = [];
  for (const [glyph, readings] of joyo.rows) {
    const present = new Set(
      [
        ...(kanji[glyph]?.on || []),
        ...(kanji[glyph]?.kun || []),
        ...(projected.get(glyph) || []),
      ].map(core.readingKey),
    );
    for (const reading of readings)
      if (!present.has(core.readingKey(reading))) officialReadings.push([glyph, reading]);
  }
  // The app's own word lists: headwords and `k` lists (D.kanjiWords), then alternate spellings.
  const buckets = core.kanjiWordBuckets(dict, words);
  const alternates = core.kanjiAltWords(dict);
  const empty = new Set(
    joyoGlyphs.filter((glyph) => !buckets.get(glyph)?.size && !alternates.get(glyph)?.length),
  );
  const candidates = new Map([...empty].map((glyph) => [glyph, []]));
  for (const row of index.entries) {
    const forms = new Set(row[4].flatMap((form) => [...form]));
    for (const glyph of forms) if (candidates.has(glyph)) candidates.get(glyph).push(row);
  }
  const shardsUsed = new Set();
  const jmdictWords = [];
  const searchOnly = [];
  for (const glyph of [...empty].sort(byCodePoint)) {
    const picked = [];
    for (const row of candidates.get(glyph)) {
      const [seq, , , , , , , , entryCommon] = row;
      const found = detail(seq);
      shardsUsed.add(found.shard);
      const [, kanjiForms, kanaForms, senses] = found.entry;
      const form = kanjiForms.find(
        ([text, , tags]) => text.includes(glyph) && !tags.includes('sK'),
      );
      if (!form) continue;
      const kana = kanaForms.find(
        ([, , tags, applies]) => !tags.includes('sk') && appliesTo(applies, form[0]),
      );
      if (!kana) continue;
      const sense = senses.find(
        (item) => appliesTo(item[1], form[0]) && appliesTo(item[2], kana[0]) && item[10]?.length,
      );
      if (!sense) continue;
      picked.push({
        row: [seq, form[0], kana[0], sense[10][0][0], [...form[2]]],
        formCommon: form[1],
        entryCommon,
        rare: form[2].includes('rK'),
      });
    }
    picked.sort(
      (a, b) =>
        b.formCommon - a.formCommon ||
        b.entryCommon - a.entryCommon ||
        Number(a.rare) - Number(b.rare) ||
        [...a.row[1]].length - [...b.row[1]].length ||
        Number(a.row[0]) - Number(b.row[0]),
    );
    if (picked.length)
      jmdictWords.push([glyph, picked.slice(0, WORDS_PER_EMPTY_KANJI).map((item) => item.row)]);
    else if (candidates.get(glyph).length) searchOnly.push(glyph);
  }
  const filled = new Set(jmdictWords.map(([glyph]) => glyph));
  const kanjiWithoutWords = [...empty].filter((glyph) => !filled.has(glyph)).sort(byCodePoint);
  return {
    kanjiReadings,
    kanjiRecords,
    officialReadings,
    jmdictWords,
    kanjiWithoutWords,
    emptyBeforeJmdict: [...empty].sort(byCodePoint),
    searchOnly,
    shardsUsed: [...shardsUsed].sort(),
  };
}

export function buildReferenceData({ archive, prior } = {}) {
  const dict = json(sourcePaths.dict).words;
  const words = json(sourcePaths.words).words;
  const kanji = json(sourcePaths.kanji).kanji;
  const kmeta = json(sourcePaths.kmeta).meta;
  const corpus = jsonl(sourcePaths.kankenCorpus);
  assert.equal(
    new Set(corpus.map((row) => row.entry_id)).size,
    corpus.length,
    'Duplicate Kentei source identity',
  );
  for (const row of corpus) {
    assert(
      /^CE-\d+$/.test(row.entry_id) && /^CT-\d+$/.test(row.species_id),
      'Invalid Kentei source identity',
    );
  }
  const kotobako = json(sourcePaths.kotobako).datasets;
  const sample = jsonl(sourcePaths.kanjidicSample);
  const driftWords = json(sourcePaths.driftWords);
  const kotobakoKanji = new Map(kotobako.kanji.map((row) => [row.id, row.char]));
  const wbig = json(sourcePaths.wbig);
  const kanken = json(sourcePaths.kanken).levels;
  const indexedGlyphs = new Set([
    ...Object.keys(kanji),
    ...Object.keys(kmeta),
    ...Object.keys(kanken),
    ...kotobako.kanji.filter((row) => row.jlpt).map((row) => row.char),
    ...corpus.filter((row) => row.glyph).map((row) => row.glyph),
  ]);
  const missing = (id) =>
    !kanji[id] ||
    !kanji[id].m ||
    !kanji[id].on?.length ||
    !kanji[id].kun?.length ||
    kanji[id].st == null;
  const usefulMetadata = ([id, on, kun]) => {
    const base = kanji[id];
    // Preserve the original missing-record projection (including empty source
    // fields), but do not add hundreds of complete records whose absent kun/on
    // is also absent upstream. Only genuine partial-field fills are new.
    return (
      !base ||
      !base.m ||
      (!base.on?.length && !base.kun?.length) ||
      base.st == null ||
      (!base.on?.length && on.length > 0) ||
      (!base.kun?.length && kun.length > 0)
    );
  };
  const extraWords = [
    ...kotobako.vocab
      .filter((row) => row.jlpt)
      .map((row) => [
        row.word,
        row.reading,
        row.meanings,
        row.jlpt,
        row.id,
        'kotobako',
        (row.containsKanji || []).map((id) => {
          assert(kotobakoKanji.has(id), `Unresolved kotobako kanji identity: ${id}`);
          return kotobakoKanji.get(id);
        }),
      ]),
    ...driftWords.flatMap(([id, reading, meaning, level], index) =>
      level ? [[id, reading, [meaning], level, `row:${index + 1}`, 'drift-words']] : [],
    ),
    ...wbig.flatMap(([id, reading, meaning, level], index) =>
      level ? [[id, reading, [meaning], level, `row:${index + 1}`, 'wbig']] : [],
    ),
  ];
  const classifiedIds = new Set([
    ...Object.entries(dict)
      .filter(([, row]) => row.jlpt)
      .map(([id]) => id),
    ...Object.entries(words)
      .filter(([, row]) => row.jlpt)
      .map(([id]) => id),
    ...extraWords.map(([id]) => id),
  ]);
  const wordPairs = new Map();
  for (const [id, reading] of [
    ...Object.entries(dict).map(([id, row]) => [id, row.r]),
    ...Object.entries(words).map(([id, row]) => [id, row.r]),
    ...extraWords,
  ]) {
    if (classifiedIds.has(id) && reading)
      wordPairs.set(JSON.stringify([id, reading]), [id, reading]);
  }
  const dictionaryIndex = json(sourcePaths.dictionaryIndex);
  const candidates = dictionaryCandidates(dictionaryIndex.entries);
  const wordLinks = [...wordPairs.values()].map(([id, reading]) => [
    id,
    reading,
    candidates(id, reading),
  ]);
  const kanjiMetadata = [
    ...kotobako.kanji
      .filter((row) => indexedGlyphs.has(row.char) && missing(row.char))
      .map((row) => [
        row.char,
        row.onyomi,
        row.kunyomi,
        row.meanings,
        row.strokeCount,
        'kotobako',
        row.id,
      ]),
    ...sample
      .filter((row) => indexedGlyphs.has(row.literal) && missing(row.literal))
      .map((row) => [
        row.literal,
        row.on_readings,
        row.kun_readings,
        row.meanings,
        row.stroke_count,
        'kanjidic-sample',
      ]),
  ].filter(usefulMetadata);
  let pinnedRows;
  let kanjiFacts;
  let archiveCharacters = null;
  if (archive) {
    assert.equal(hash(readFileSync(archive)), ARCHIVE_SHA, 'KANJIDIC archive pin mismatch');
    // Python's standard-library ZIP reader avoids dependencies or platform unzip.
    const raw = execFileSync(
      'python3',
      [
        '-c',
        'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); sys.stdout.buffer.write(z.read("kanjidic2-en-3.6.2.json"))',
        archive,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    const data = JSON.parse(raw);
    assert.equal(data.dictDate, FACTS_SOURCE.dictionaryDate, 'KANJIDIC2 dictionary date changed');
    assert.equal(
      data.databaseVersion,
      FACTS_SOURCE.databaseVersion,
      'KANJIDIC2 database version changed',
    );
    kanjiFacts = kanjiFactsProjection(data.characters);
    archiveCharacters = new Map(data.characters.map((row) => [row.literal, row]));
    assert.equal(data.characters.length, 10384);
    pinnedRows = data.characters
      .filter((row) => indexedGlyphs.has(row.literal) && missing(row.literal))
      .map((row) => {
        const groups = row.readingMeaning?.groups || [];
        const readings = groups.flatMap((group) => group.readings || []);
        return [
          row.literal,
          readings.filter((reading) => reading.type === 'ja_on').map((reading) => reading.value),
          readings.filter((reading) => reading.type === 'ja_kun').map((reading) => reading.value),
          groups
            .flatMap((group) => group.meanings || [])
            .filter((meaning) => meaning.lang === 'en')
            .map((meaning) => meaning.value),
          row.misc?.strokeCounts?.[0] ?? null,
          'kanjidic-pinned',
        ];
      })
      .filter(usefulMetadata);
  } else {
    assert(
      prior,
      'First build needs the pinned --archive; offline checks can reuse an existing sidecar',
    );
    assert.equal(prior.audit?.kanjidicArchive?.sha256, ARCHIVE_SHA);
    assert(
      core.validateKanjiFacts(prior),
      'Complete reference facts require the pinned --archive for their first build',
    );
    kanjiFacts = prior.kanjiFacts;
    assert.equal(
      prior.audit.kanjiFacts.projectedSha256,
      hash(serialize(kanjiFacts)),
      'Reference facts projection integrity mismatch; use the pinned archive to rebuild',
    );
    pinnedRows = prior.kanjiMetadata.filter((row) => row[5] === 'kanjidic-pinned');
    assert.equal(
      prior.audit.kanjidicArchive.projectedSha256,
      hash(serialize(pinnedRows)),
      'Pinned projection integrity mismatch; use the pinned archive to rebuild',
    );
    assert.equal(new Set(pinnedRows.map((row) => row[0])).size, pinnedRows.length);
    for (const row of pinnedRows) {
      assert(
        row.length === 6 && indexedGlyphs.has(row[0]) && missing(row[0]) && usefulMetadata(row),
      );
      for (const values of row.slice(1, 4))
        assert(values.every((value) => typeof value === 'string'));
    }
  }
  kanjiMetadata.push(...pinnedRows);
  // dict-v2 detail shards, located exactly as the app locates them (FNV-1a over the ASCII seq, masked).
  const { sharding } = dictionaryIndex;
  assert.equal(sharding.id, 'fnv1a32-ascii-seq-mask15');
  const shardDocs = new Map();
  const shardPath = (shard) => `prototypes/corridor/data/share_alike/dict-v2/${shard}.json`;
  const detail = (seq) => {
    let value = sharding.offsetBasis >>> 0;
    for (const ch of String(seq)) value = Math.imul(value ^ ch.charCodeAt(0), sharding.prime) >>> 0;
    const shard = (value & (sharding.shardCount - 1)).toString(16).padStart(2, '0');
    if (!shardDocs.has(shard)) {
      const doc = json(shardPath(shard));
      assert.equal(doc.sourcePin, dictionaryIndex.source.pin, 'detail shard pin');
      shardDocs.set(shard, new Map(doc.entries.map((entry) => [entry[0], entry])));
    }
    const entry = shardDocs.get(shard).get(String(seq));
    assert(entry, `JMdict detail for ${seq}`);
    return { shard, entry };
  };
  const skip = json(sourcePaths.skip);
  const joyo = json(sourcePaths.joyo);
  assert.equal(
    skip.sources.find((source) => source.release)?.sha256,
    ARCHIVE_SHA,
    'skip.json carries the pinned KANJIDIC2',
  );
  const trust = kanjiTrustProjection({
    kanji,
    kmeta,
    dict,
    words,
    skip,
    joyo,
    index: dictionaryIndex,
    detail,
    archiveCharacters,
  });
  return {
    schemaVersion: 4,
    pool: 'share_alike',
    sources: [
      {
        name: 'mimneko/kanji-data Kentei fact table',
        licence: 'CC0-1.0',
        url: 'https://github.com/mimneko/kanji-data',
        pin: '0be3577f7939ec85d2b4e373a7a94262e7449e13',
        attribution:
          'mimneko/kanji-data; grade and variant facts only, without dictionary page-order fields.',
        provenance: 'corpus/src/corpus/sources/kanji_data/PROVENANCE.yml',
      },
      {
        name: 'KANJIDIC2/JMdict-derived metadata and supplementary vocabulary',
        licence: 'CC BY-SA 4.0',
        url: 'https://www.edrdg.org/',
        attribution:
          'Electronic Dictionary Research and Development Group (EDRDG). Metadata via existing committed Bunki sources and scriptin/jmdict-simplified. Editorial level tags remain identified by their individual source.',
        licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      },
      {
        name: 'Pinned KANJIDIC2 English metadata',
        url: 'https://github.com/scriptin/jmdict-simplified/releases/tag/3.6.2%2B20260803141815',
        licence: 'CC BY-SA 4.0',
        attribution: 'KANJIDIC2 — EDRDG; JSON conversion by scriptin/jmdict-simplified.',
        archiveSha256: ARCHIVE_SHA,
      },
      {
        name: '常用漢字表（内閣告示第2号、2010年11月30日）',
        url: joyo.url,
        fetchedAt: joyo.fetchedAt,
        pageSha256: joyo.sha256,
        licence: 'Outside copyright (Japan Copyright Act, art. 13)',
        attribution:
          '文化庁「常用漢字表の音訓索引」. Supplies only the readings KANJIDIC2 lacks (officialReadings); the app marks each as from 常用漢字表.',
      },
    ],
    layout: {
      kanken: ['sourceId', 'glyph', 'level', 'form', 'url', 'imageUrl', 'speciesId'],
      extraWords: [
        'id',
        'reading',
        'meanings',
        'level',
        'sourceId',
        'source',
        'sourceKanjiGlyphs?',
      ],
      kanjiMetadata: ['glyph', 'on', 'kun', 'meanings', 'strokeCount', 'source', 'sourceId?'],
      kanjiLevels: ['glyph', 'family', 'level', 'source', 'sourceId'],
      wordLinks: ['id', 'exactReading', 'candidateJmdictSequences'],
      kanjiReadings: ['glyph', 'kanjidic2On', 'kanjidic2Kun'],
      kanjiRecords: ['glyph', 'meanings', 'strokeCount', 'classicalRadical'],
      kanjiFacts: ['glyph', 'englishMeanings', 'classicalRadical', 'nelsonRadicalOrNull'],
      officialReadings: ['glyph', 'reading'],
      jmdictWords: ['glyph', 'words[jmdictSeq, writtenForm, reading, firstGloss, writtenFormTags]'],
      kanjiWithoutWords: ['glyph'],
    },
    kanken: corpus.map((row) => [
      row.entry_id,
      row.glyph,
      row.kanken_level,
      row.form,
      row.kanjipedia_url,
      row.glyph_image_url,
      row.species_id,
    ]),
    extraWords,
    kanjiMetadata,
    kanjiLevels: kotobako.kanji
      .filter((row) => row.jlpt)
      .map((row) => [row.char, 'jlpt-kanji', row.jlpt, 'kotobako', row.id]),
    wordLinks,
    kanjiReadings: trust.kanjiReadings,
    kanjiRecords: trust.kanjiRecords,
    kanjiFactsVersion: 1,
    kanjiFacts,
    officialReadings: trust.officialReadings,
    jmdictWords: trust.jmdictWords,
    kanjiWithoutWords: trust.kanjiWithoutWords,
    audit: {
      schemaVersion: 1,
      kanjiFacts: {
        schemaVersion: 1,
        ...FACTS_SOURCE,
        projectedRows: kanjiFacts.length,
        projectedSha256: hash(serialize(kanjiFacts)),
        fields: [
          'literal',
          'readingMeaning.groups[].meanings[lang=en].value',
          'radicals[type=classical].value',
          'radicals[type=nelson_c].value',
        ],
        rule: 'All 10,384 pinned literals, sorted by Unicode scalar. Every English gloss verbatim in source order; no truncation, synonym generation, or deduplication. Classical and Nelson fields are copied separately; absent Nelson is null. No query codes or inferred classifications.',
      },
      sourceHashes: Object.fromEntries(
        Object.entries(sourcePaths).map(([key, path]) => [key, { path, sha256: hash(read(path)) }]),
      ),
      kanjidicArchive: {
        filename: 'kanjidic2-en-3.6.2+20260803141815.json.zip',
        sha256: ARCHIVE_SHA,
        records: 10384,
        projectedRows: pinnedRows.length,
        projectedSha256: hash(serialize(pinnedRows)),
        fields: ['literal', 'ja_on', 'ja_kun', 'English meanings', 'first stroke count'],
        excludedFields: [
          'JLPT historical level',
          'school grade',
          'queryCodes',
          'SKIP',
          'dictionaryReferences',
        ],
      },
      kankenSourceRows: corpus.length,
      kankenSourceGlyphRows: corpus.filter((row) => row.glyph).length,
      kankenDistinctGlyphs: new Set(corpus.filter((row) => row.glyph).map((row) => row.glyph)).size,
      kankenNoGlyphRows: corpus.filter((row) => !row.glyph).length,
      kankenSourceLevelCounts: histogram(corpus, (row) => row.kanken_level),
      kotobakoClassifiedRows: kotobako.vocab.filter((row) => row.jlpt).length,
      kotobakoClassifiedRowsByLevel: histogram(
        kotobako.vocab.filter((row) => row.jlpt),
        (row) => row.jlpt,
      ),
      wbigRows: wbig.length,
      driftWordsRows: driftWords.length,
      extraWordSources: histogram(extraWords, (row) => row[5]),
      identity: {
        dictionaryRule:
          'Exact printed form and reading, respecting JMdict readingWrittenScopes. All candidates retained; no sense-level classification or automatic canonical redirect.',
        dictionaryLinkScope:
          'Every attested reading on a classified vocabulary printed key; unassigned words retain runtime targets but are not matched to JMdict here.',
        wordPairs: wordLinks.length,
        wordPairsUniqueCandidate: wordLinks.filter((row) => row[2].length === 1).length,
        wordPairsAmbiguous: wordLinks.filter((row) => row[2].length > 1).length,
        wordPairsUnmatched: wordLinks.filter((row) => !row[2].length).length,
        kankenSpecies: new Set(corpus.map((row) => row.species_id)).size,
        kankenRelationshipRule:
          'Shared source species_id only. Retain each entry_id, glyph and grade; never inherit metadata or grades across related forms.',
      },
      auditedExclusions: [
        [
          'prototypes/corridor/data/share_alike/dict-v2/index.json',
          'No JLPT classification field; no frequency-based inference.',
        ],
        [
          sourcePaths.kanjidicSample,
          'Historical jlpt_pre2010_editorial levels are not modern N1–N5; metadata only.',
        ],
        ['packages/seed/data/lexemes.json', 'Hand-assembled seed without JLPT classifications.'],
        [
          'packages/seed/data/kanji.json',
          'Hand-assembled seed without JLPT/Kentei classifications.',
        ],
        ['corpus/datasets/jmdict_idioms/idioms.jsonl', 'No JLPT/Kentei classifications.'],
      ],
      kanjiTrust: {
        readingSource: {
          path: sourcePaths.skip,
          release: skip.sources.find((source) => source.release).release,
          archiveSha256: ARCHIVE_SHA,
          dictionaryDate: skip.provenance.dictionaryDate,
          databaseVersion: skip.provenance.databaseVersion,
        },
        readingScope:
          'Every kanji.json glyph and the 2,136 characters of the 2010 常用漢字表 (= strokes.json meta).',
        readingRule:
          'Exact KANJIDIC2 on/kun strings in source order. The app lists kanji.json readings first, then each further KANJIDIC2 reading, then officialReadings; nothing is dropped or merged.',
        kanjiReadingRows: trust.kanjiReadings.length,
        kanjiRecords: trust.kanjiRecords.map(([glyph]) => glyph),
        officialTable: {
          path: sourcePaths.joyo,
          url: joyo.url,
          fetchedAt: joyo.fetchedAt,
          pageSha256: joyo.sha256,
          characters: joyo.counts.characters,
          readings: joyo.counts.readings,
        },
        officialReadingsAdded: trust.officialReadings.map(
          ([glyph, reading]) => `${glyph}:${reading}`,
        ),
        wordFill: {
          source: `prototypes/corridor/data/share_alike/dict-v2 (JMdict ${dictionaryIndex.source.pin})`,
          perKanji: WORDS_PER_EMPTY_KANJI,
          rule: 'Only for a Jōyō kanji no shipped word list names (headwords, k lists, alternate spellings). JMdict entries written with it, never a search-only spelling (sK); reading allowed for that spelling; first gloss of the first sense allowed for both; common spellings first, rare (rK) last, then shorter, then sequence.',
          emptyBefore: trust.emptyBeforeJmdict.join(''),
          filled: trust.jmdictWords.map(([glyph]) => glyph).join(''),
          searchOnlySpellingsOnly: trust.searchOnly.join(''),
          withoutWords: trust.kanjiWithoutWords.join(''),
          shardSha256: Object.fromEntries(
            trust.shardsUsed.map((shard) => [shardPath(shard), hash(read(shardPath(shard)))]),
          ),
        },
      },
      rebuild:
        'node tools/build-reference-data.mjs --archive /path/to/kanjidic2-en-3.6.2+20260803141815.json.zip',
      offlineCheck: 'node tools/build-reference-data.mjs --check',
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const archiveIndex = process.argv.indexOf('--archive');
  const archive = archiveIndex >= 0 ? process.argv[archiveIndex + 1] : undefined;
  assert(archiveIndex < 0 || archive, '--archive requires a path');
  const prior = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, 'utf8')) : null;
  const expected = serialize(buildReferenceData({ archive, prior }));
  if (process.argv.includes('--check')) {
    assert.equal(readFileSync(OUTPUT, 'utf8'), expected, 'Reference sidecar is stale');
    console.log(
      `Reference data byte parity verified${archive ? ' against pinned raw archive' : ' (offline projection check)'}.`,
    );
  } else {
    writeFileSync(OUTPUT, expected);
    console.log(`Wrote ${OUTPUT} (${Buffer.byteLength(expected)} bytes).`);
  }
}
