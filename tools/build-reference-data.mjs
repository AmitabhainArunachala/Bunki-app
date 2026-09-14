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
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUT = resolve(ROOT, 'prototypes/corridor/data/share_alike/reference-extra.json');
export const ARCHIVE_SHA = '5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6';
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
};
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

export function buildReferenceData({ archive, prior } = {}) {
  const dict = json(sourcePaths.dict).words;
  const words = json(sourcePaths.words).words;
  const kanji = json(sourcePaths.kanji).kanji;
  const kmeta = json(sourcePaths.kmeta).meta;
  const corpus = jsonl(sourcePaths.kankenCorpus);
  const kotobako = json(sourcePaths.kotobako).datasets;
  const sample = jsonl(sourcePaths.kanjidicSample);
  const driftWords = json(sourcePaths.driftWords);
  const indexedGlyphs = new Set([
    ...Object.keys(kanji),
    ...Object.keys(kmeta),
    ...corpus.filter((row) => row.glyph).map((row) => row.glyph),
  ]);
  const missing = (id) =>
    !kanji[id] || !kanji[id].m || (!kanji[id].on.length && !kanji[id].kun.length);
  const extraWords = [
    ...kotobako.vocab
      .filter((row) => row.jlpt && dict[row.word]?.jlpt !== row.jlpt)
      .map((row) => [row.word, row.reading, row.meanings, row.jlpt, row.id, 'kotobako']),
    ...driftWords.flatMap(([id, reading, meaning, level], index) =>
      level && words[id]?.jlpt !== level
        ? [[id, reading, [meaning], level, `row:${index + 1}`, 'drift-words']]
        : [],
    ),
  ];
  const kanjiMetadata = [
    ...kotobako.kanji
      .filter((row) => indexedGlyphs.has(row.char) && missing(row.char))
      .map((row) => [row.char, row.onyomi, row.kunyomi, row.meanings, row.strokeCount, 'kotobako']),
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
  ];
  let pinnedRows;
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
      });
  } else {
    assert(
      prior,
      'First build needs the pinned --archive; offline checks can reuse an existing sidecar',
    );
    assert.equal(prior.audit?.kanjidicArchive?.sha256, ARCHIVE_SHA);
    pinnedRows = prior.kanjiMetadata.filter((row) => row[5] === 'kanjidic-pinned');
    assert.equal(new Set(pinnedRows.map((row) => row[0])).size, pinnedRows.length);
    for (const row of pinnedRows) {
      assert(row.length === 6 && indexedGlyphs.has(row[0]) && missing(row[0]));
      for (const values of row.slice(1, 4))
        assert(values.every((value) => typeof value === 'string'));
    }
  }
  kanjiMetadata.push(...pinnedRows);
  return {
    schemaVersion: 1,
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
    ],
    layout: {
      kanken: ['sourceId', 'glyph', 'level', 'form', 'url', 'imageUrl'],
      extraWords: ['id', 'reading', 'meanings', 'level', 'sourceId', 'source'],
      kanjiMetadata: ['glyph', 'on', 'kun', 'meanings', 'strokeCount', 'source'],
    },
    kanken: corpus.map((row) => [
      row.entry_id,
      row.glyph,
      row.kanken_level,
      row.form,
      row.kanjipedia_url,
      row.glyph_image_url,
    ]),
    extraWords,
    kanjiMetadata,
    audit: {
      schemaVersion: 1,
      sourceHashes: Object.fromEntries(
        Object.entries(sourcePaths).map(([key, path]) => [key, { path, sha256: hash(read(path)) }]),
      ),
      kanjidicArchive: {
        filename: 'kanjidic2-en-3.6.2+20260803141815.json.zip',
        sha256: ARCHIVE_SHA,
        records: 10384,
        projectedRows: pinnedRows.length,
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
      wbigRows: json(sourcePaths.wbig).length,
      driftWordsRows: driftWords.length,
      extraWordSources: histogram(extraWords, (row) => row[5]),
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
