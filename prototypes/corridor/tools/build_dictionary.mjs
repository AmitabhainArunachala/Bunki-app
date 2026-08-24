/**
 * Harvest the sites-v11 kotobako dictionary into corridor data assets — the
 * first concrete act of the #36 harvest, approved by the operator 2026-08-07
 * ("as robust as a full dictionary. No exceptions."): every one of the 23,120
 * JMdict-derived vocab entries (all senses, most common first, POS, JLPT) and
 * all 2,136 KanjiVG stroke-path sets ride into the corridor's ShareAlike pool.
 *
 * Usage: node build_dictionary.mjs [--check] [--dict-only] [--output-dir PATH]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const SRC = resolve(CORRIDOR, '..', 'bunki-sites-v11', 'public', 'kotobako-static.json');
const V2_INDEX = resolve(CORRIDOR, 'data', 'share_alike', 'dict-v2', 'index.json');
const EXPECTED_V2_PIN = '3.6.2+20260803141815';

const src = JSON.parse(readFileSync(SRC, 'utf8'));
const { vocab, kanji } = src.datasets;
const v2 = JSON.parse(readFileSync(V2_INDEX, 'utf8'));

function fail(message) {
  console.error(`build_dictionary: ${message}`);
  process.exit(1);
}

if (
  v2.schemaVersion !== 3 ||
  v2.source?.pin !== EXPECTED_V2_PIN ||
  v2.layout?.indexEntry?.[9] !== 'readingSummaries' ||
  v2.layout?.readingSummary?.join(',') !== 'displayHeadOr0,primaryGlossOr0' ||
  v2.layout?.indexEntry?.[12] !== 'senseTagRows' ||
  v2.layout?.senseTagRow?.join(',') !== 'glossStart,glossCount,misc,field,dialect'
) {
  fail('dict-v2 index has an unsupported or unpinned sense-honest schema');
}
const v2BySeq = new Map(v2.entries.map((row) => [String(row[0]), row]));
const corrections = [];

function decodeReadingSummaries(row) {
  const kana = row[5];
  const encoded = row[9];
  if (!Array.isArray(kana) || !Array.isArray(encoded) || encoded.length !== kana.length) {
    fail(`dict-v2 entry ${row[0]} has misaligned reading summaries`);
  }
  return kana.map((reading, index) => {
    const summary = encoded[index];
    if (!Array.isArray(summary) || summary.length !== 2) {
      fail(`dict-v2 entry ${row[0]} has a malformed reading summary`);
    }
    return [
      reading,
      summary[0] === 0 ? row[1] : summary[0],
      summary[1] === 0 ? row[3] : summary[1],
    ];
  });
}

function restrictionCompatibleMeanings(vocabEntry) {
  const id = /^vocab_(\d+)$/.exec(vocabEntry.id)?.[1];
  const row = id ? v2BySeq.get(id) : null;
  // A single-reading entry cannot contain the cross-reading flattening defect
  // this compatibility pass corrects. Keeping it byte-identical also avoids
  // importing unrelated wording churn between the older boot subset and pin.
  if (!row || row[5].length < 2) return vocabEntry.meanings;
  const summary = decodeReadingSummaries(row).find(
    ([reading, displayHead]) => reading === vocabEntry.reading && displayHead === vocabEntry.word,
  );
  if (!summary) return vocabEntry.meanings;
  const preferred = summary[2];
  const position = vocabEntry.meanings.indexOf(preferred);
  if (position <= 0) return vocabEntry.meanings;
  corrections.push([id, vocabEntry.word, vocabEntry.reading, preferred]);
  return [
    preferred,
    ...vocabEntry.meanings.slice(0, position),
    ...vocabEntry.meanings.slice(position + 1),
  ];
}

const words = {};
const senseTags = {};
for (const v of vocab) {
  // keyed by written form; first entry wins (kotobako is ordered by JMdict
  // entry sequence, which fronts the more common entry)
  if (words[v.word]) continue;
  const seq = /^vocab_(\d+)$/.exec(v.id)?.[1];
  const sourceRow = seq ? v2BySeq.get(seq) : null;
  const rec = { r: v.reading, m: restrictionCompatibleMeanings(v) };
  if (v.altWord) rec.alt = v.altWord;
  if (v.pos) rec.p = v.pos;
  if (v.jlpt) rec.jlpt = v.jlpt;
  if (v.containsKanji?.length) {
    // kotobako refers to kanji as "kanji_<hex codepoint>" — resolve to chars
    rec.k = v.containsKanji
      .map((id) => {
        const m = /^kanji_([0-9a-f]+)$/.exec(id);
        return m ? String.fromCodePoint(parseInt(m[1], 16)) : id;
      })
      .filter((c) => c.length === 1);
  }
  words[v.word] = rec;
  if (sourceRow && !Array.isArray(sourceRow[12])) {
    fail(`core word ${v.word} (${v.id}) has malformed schema-v3 source sense rows`);
  }
  if (
    sourceRow &&
    sourceRow[12].some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== 5 ||
        !Array.isArray(row[2]) ||
        !Array.isArray(row[3]) ||
        !Array.isArray(row[4]),
    )
  ) {
    fail(`core word ${v.word} (${v.id}) has malformed source sense rows`);
  }
  if (
    sourceRow?.[12].some((row) => row[2].length || row[3].length || row[4].length)
  ) {
    senseTags[v.word] = sourceRow[12];
  }
}

const expectedCorrections = [
  ['1583170', '半月', 'はんつき', 'half a month'],
  ['1583260', '避ける', 'さける', 'to avoid (situation)'],
];
if (JSON.stringify(corrections) !== JSON.stringify(expectedCorrections)) {
  fail(`restriction-compatible correction set changed: ${JSON.stringify(corrections)}`);
}
if (
  words['半月']?.r !== 'はんつき' ||
  words['半月']?.m?.[0] !== 'half a month' ||
  words['避ける']?.r !== 'さける' ||
  words['避ける']?.m?.[0] !== 'to avoid (situation)'
) {
  fail('known boot-dictionary reading/gloss assertions failed');
}

const dict = {
  schemaVersion: 3,
  pool: 'share_alike',
  sources: [
    {
      name: 'kotobako (JMdict subset)',
      licence: 'CC BY-SA 4.0',
      attribution:
        'JMdict — Electronic Dictionary Research and Development Group (EDRDG), via the bunki-sites-v11 kotobako build',
      url: 'https://www.edrdg.org/',
    },
  ],
  senseTagLayout: ['glossStart', 'glossCount', 'misc', 'field', 'dialect'],
  senseTags,
  words,
};

const strokes = {};
const kmeta = {};
for (const k of kanji) {
  strokes[k.char] = k.strokes;
  const rec = {};
  if (k.grade) rec.g = k.grade;
  if (k.jlpt) rec.jlpt = k.jlpt;
  kmeta[k.char] = rec;
}

const strokesOut = {
  pool: 'share_alike',
  sources: [
    {
      name: 'KanjiVG (via kotobako)',
      licence: 'CC BY-SA 3.0',
      attribution: 'KanjiVG — Ulrich Apel',
      url: 'https://kanjivg.tagaini.net/',
    },
  ],
  strokes,
  meta: kmeta,
};

const dictJson = JSON.stringify(dict);
const strokesJson = JSON.stringify(strokesOut);
const options = {
  check: false,
  dictOnly: false,
  outputDir: resolve(CORRIDOR, 'data', 'share_alike'),
};
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--check') options.check = true;
  else if (arg === '--dict-only') options.dictOnly = true;
  else if (arg === '--output-dir') {
    if (!args[index + 1]) fail('--output-dir requires a path');
    options.outputDir = resolve(args[(index += 1)]);
  } else if (arg.startsWith('--output-dir=')) {
    options.outputDir = resolve(arg.slice('--output-dir='.length));
  } else {
    fail(`unknown argument ${JSON.stringify(arg)}`);
  }
}
const { check, dictOnly } = options;
const dictPath = resolve(options.outputDir, 'dict.json');
const strokesPath = resolve(options.outputDir, 'strokes.json');

if (check) {
  if (readFileSync(dictPath, 'utf8') !== dictJson) {
    fail('dict.json is stale — rerun build_dictionary.mjs --dict-only');
  }
  if (!dictOnly && readFileSync(strokesPath, 'utf8') !== strokesJson) {
    fail('strokes.json is stale — rerun build_dictionary.mjs');
  }
  console.log(
    `dict.json current · ${corrections.length} restriction-compatible corrections · ` +
      `${Object.keys(senseTags).length} tagged entries`,
  );
  process.exit(0);
}

mkdirSync(options.outputDir, { recursive: true });
writeFileSync(dictPath, dictJson);
if (!dictOnly) writeFileSync(strokesPath, strokesJson);
console.log(
  `dict.json: ${Object.keys(words).length} words · ${Object.keys(senseTags).length} tagged entries · ` +
    `${corrections.length} corrected primaries` +
    (dictOnly ? '' : ` · strokes.json: ${Object.keys(strokes).length} kanji`),
);
