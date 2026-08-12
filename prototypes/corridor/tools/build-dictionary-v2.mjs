/**
 * Build the Corridor's full, lazy-loadable JMdict dictionary.
 *
 * This deliberately does not replace the small boot dictionary. It emits a
 * compact search index plus sixteen lossless detail shards, all derived from
 * the two immutable jmdict-simplified assets pinned by corpus/fetch.py.
 *
 * Usage:
 *   node prototypes/corridor/tools/build-dictionary-v2.mjs \
 *     [--source-dir corpus/data/jmdict] [--output-dir PATH] [--check]
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const REPO = resolve(CORRIDOR, '..', '..');
const FETCH_PY = resolve(REPO, 'corpus', 'src', 'corpus', 'sources', 'jmdict', 'fetch.py');
const PROVENANCE = resolve(
  REPO,
  'corpus',
  'src',
  'corpus',
  'sources',
  'jmdict',
  'PROVENANCE.yml',
);
const DEFAULT_SOURCE_DIR = resolve(REPO, 'corpus', 'data', 'jmdict');
const OUTPUT_DIR = resolve(CORRIDOR, 'data', 'share_alike', 'dict-v2');
const SCHEMA_VERSION = 3;

const EXPECTED = Object.freeze({
  pin: '3.6.2+20260803141815',
  jmdict: Object.freeze({
    asset: 'jmdict-eng-3.6.2+20260803141815.json.zip',
    sha256: '1806d2817215ebe7ded997c8dac4831a3335d83ed12f321ac869a97e745d3a5c',
  }),
  kanjidic2: Object.freeze({
    asset: 'kanjidic2-en-3.6.2+20260803141815.json.zip',
    sha256: '5dfb850ee88c7bccecf4694cc4d7b1338e608440c5edcb8fefc93216b3471fe6',
  }),
  sourceEntries: 218_290,
  selectedEntries: 69_996,
  selectedCommon: 22_626,
  selectedKanaOnly: 36_683,
  selectedTop151: 10_687,
});

const SHARD_COUNT = 16;
const SHARDING_ALGORITHM = Object.freeze({
  id: 'fnv1a32-ascii-seq-mask15',
  input: 'decimal ASCII JMdict ent_seq string',
  offsetBasis: 2_166_136_261,
  prime: 16_777_619,
  reduction: 'unsignedHash & 15',
});
const TOP_KANJI_FREQUENCY_RANK = 151;
// Unified_Ideograph is the precise JMdict written-form boundary here. The
// broader Script=Han property also admits non-ideographic marks and produces a
// different selection.
const HAN = /\p{Unified_Ideograph}/u;
const GLOSS_MESSY = /[(]|\s\s|[^\S ]/;
const GLOSS_LEAD = new Set(['the', 'a', 'an', 'to']);

const LAYOUT = Object.freeze({
  indexEntry: [
    'seq',
    'head',
    'primaryReading',
    'primaryGloss',
    'writtenForms',
    'kanaForms',
    'englishGlosses',
    'normalizedGlosses',
    'commonFlag',
    'readingSummaries',
    'glossApplicability',
    'readingWrittenScopes',
    'senseTagRows',
  ],
  readingSummary: ['displayHeadOr0', 'primaryGlossOr0'],
  glossApplicability: ['kanaIndex', 'displayHeadOr0'],
  readingWrittenScope:
    '0 = all writtenForms; 1 = no writtenForms; otherwise an array of zero-based writtenForms indexes',
  senseTagRow: ['glossStart', 'glossCount', 'misc', 'field', 'dialect'],
  detailEntry: ['seq', 'kanjiForms', 'kanaForms', 'senses'],
  kanjiForm: ['text', 'commonFlag', 'tags'],
  kanaForm: ['text', 'commonFlag', 'tags', 'appliesToKanji'],
  sense: [
    'partOfSpeech',
    'appliesToKanji',
    'appliesToKana',
    'related',
    'antonym',
    'field',
    'dialect',
    'misc',
    'info',
    'languageSources',
    'glosses',
  ],
  languageSource: ['lang', 'fullFlag', 'waseiFlag', 'textOrNull'],
  gloss: ['text', 'genderOrNull', 'typeOrNull'],
  notes: {
    seq:
      'Stable decimal JMdict ent_seq string. Detail shard uses top-level sharding metadata: FNV-1a 32-bit over its ASCII digits, then unsignedHash & 15.',
    head:
      'First common written form, else first common kana form, else first written form not tagged rare/search-only, else first kana form not tagged rare/search-only, else first written then kana source-order fallback.',
    primaryReading:
      'For a kana head, the head itself. For a written head, the first source-order kana form whose appliesToKanji is * or contains that exact head.',
    primaryGloss:
      'First English gloss of the first source-order sense whose appliesToKana permits primaryReading and, for a written head only, whose appliesToKanji permits head. A kana head does not require a written-form restriction match.',
    readingSummaries:
      'Aligned 1:1 and in source order with kanaForms. Reading is kanaForms[i]. A tuple cell is 0 when it equals the default head or primaryGloss in index cells 1 and 3; otherwise it stores that reading-specific value. Decoding every aligned row reconstructs all source reading summaries exactly. A reading keeps canonical head when permitted, otherwise uses its first permitted written form; a no-kanji reading displays itself.',
    glossApplicability:
      'Aligned 1:1 with englishGlosses and normalizedGlosses in source sense/gloss order. kanaIndex is zero-based into kanaForms; displayHeadOr0 is 0 for index head, otherwise the restriction-compatible written or kana display form. When a sense permits several readings, prefer the first source-order reading whose reading-summary primary gloss is that sense\'s first English gloss, then the first source-order compatible reading. Every tuple is proved against both reading and sense restrictions at build time.',
    readingWrittenScopes:
      'Aligned 1:1 and in source order with kanaForms and readingSummaries. Each cell decodes to exactly the writtenForms permitted by that kana form: 0 means all, 1 means none, and an index array is the exact restricted subset. The builder proves both directions against JMdict appliesToKanji; detail shards retain the original tags and restriction strings.',
    senseTagRows:
      'One row per source sense, in source order. glossStart/glossCount identify that sense\'s contiguous range in englishGlosses. misc, field and dialect are the exact JMdict tag-code arrays in source order; empty arrays are retained so absence is explicit.',
    commonFlag: '0 or 1; JMdict common metadata is otherwise preserved on every form.',
    glossLanguage: 'English is implicit because the pinned JMdict asset is English-only.',
    ordering: 'Entry sequence is numeric ascending; forms, senses, and glosses retain source order.',
  },
});

function die(message) {
  console.error(`build-dictionary-v2: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { check: false, sourceDir: DEFAULT_SOURCE_DIR, outputDir: OUTPUT_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') {
      options.check = true;
    } else if (arg === '--source-dir') {
      if (!argv[i + 1]) die('--source-dir requires a path');
      options.sourceDir = resolve(argv[(i += 1)]);
    } else if (arg.startsWith('--source-dir=')) {
      options.sourceDir = resolve(arg.slice('--source-dir='.length));
    } else if (arg === '--output-dir') {
      if (!argv[i + 1]) die('--output-dir requires a path');
      options.outputDir = resolve(argv[(i += 1)]);
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = resolve(arg.slice('--output-dir='.length));
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node build-dictionary-v2.mjs [--source-dir PATH] [--output-dir PATH] [--check]',
      );
      process.exit(0);
    } else {
      die(`unknown argument ${JSON.stringify(arg)}`);
    }
  }
  return options;
}

function pythonString(source, name) {
  const match = source.match(new RegExp(`^${name}\\s*=\\s*["']([^"']+)["']`, 'm'));
  if (!match) die(`cannot read ${name} from ${FETCH_PY}`);
  return match[1];
}

function pythonHash(source, assetConstant) {
  const match = source.match(
    new RegExp(`^\\s*${assetConstant}\\s*:\\s*["']([0-9a-f]{64})["']`, 'm'),
  );
  if (!match) die(`cannot read the ${assetConstant} hash from ${FETCH_PY}`);
  return match[1];
}

function verifyPinnedConfiguration() {
  const source = readFileSync(FETCH_PY, 'utf8');
  const actual = {
    pin: pythonString(source, 'PINNED_TAG'),
    jmdict: {
      asset: pythonString(source, 'JMDICT_ASSET'),
      sha256: pythonHash(source, 'JMDICT_ASSET'),
    },
    kanjidic2: {
      asset: pythonString(source, 'KANJIDIC_ASSET'),
      sha256: pythonHash(source, 'KANJIDIC_ASSET'),
    },
  };
  for (const key of ['pin']) {
    if (actual[key] !== EXPECTED[key]) {
      die(`${key} changed in fetch.py; review and re-pin this build deliberately`);
    }
  }
  for (const kind of ['jmdict', 'kanjidic2']) {
    for (const key of ['asset', 'sha256']) {
      if (actual[kind][key] !== EXPECTED[kind][key]) {
        die(`${kind}.${key} changed in fetch.py; review and re-pin this build deliberately`);
      }
    }
  }

  const provenance = readFileSync(PROVENANCE, 'utf8');
  for (const required of [
    EXPECTED.pin,
    EXPECTED.jmdict.asset,
    EXPECTED.jmdict.sha256,
    EXPECTED.kanjidic2.asset,
    EXPECTED.kanjidic2.sha256,
    'CC BY-SA 4.0',
    'Electronic Dictionary Research and Development Group',
  ]) {
    if (!provenance.includes(required)) {
      die(`PROVENANCE.yml no longer records ${JSON.stringify(required)}`);
    }
  }
  return actual;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function unzipJson(path, expectedHash) {
  if (!existsSync(path)) {
    die(
      `missing pinned source ${path}; populate corpus/data/jmdict with the corpus fetch helper ` +
        'or pass --source-dir containing the verified assets',
    );
  }
  const got = sha256(path);
  if (got !== expectedHash) {
    die(`${path}: sha256 mismatch; expected ${expectedHash}, got ${got}`);
  }

  const listing = spawnSync('unzip', ['-Z1', path], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (listing.error) die(`could not run unzip: ${listing.error.message}`);
  if (listing.status !== 0) die(`${path}: cannot list zip (${listing.stderr.trim()})`);
  const members = listing.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (members.length !== 1 || !members[0].endsWith('.json')) {
    die(`${path}: expected one JSON member, found ${JSON.stringify(members)}`);
  }

  const unpacked = spawnSync('unzip', ['-p', path, members[0]], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (unpacked.error) die(`could not run unzip: ${unpacked.error.message}`);
  if (unpacked.status !== 0) die(`${path}: cannot extract JSON (${unpacked.stderr.trim()})`);
  try {
    return JSON.parse(unpacked.stdout);
  } catch (error) {
    die(`${path}: invalid JSON (${error.message})`);
  }
}

function normalizeGloss(value) {
  let bare = String(value).toLowerCase();
  if (GLOSS_MESSY.test(bare)) {
    bare = bare.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ');
  }
  bare = bare.trim();
  const space = bare.indexOf(' ');
  if (space > 0 && GLOSS_LEAD.has(bare.slice(0, space))) return bare.slice(space + 1);
  return bare;
}

function isCommon(entry) {
  return [...entry.kanji, ...entry.kana].some((form) => form.common === true);
}

function canonicalHead(entry) {
  const candidates = [
    ['written', entry.kanji.find((form) => form.common === true)],
    ['kana', entry.kana.find((form) => form.common === true)],
    [
      'written',
      entry.kanji.find((form) => !form.tags.includes('rK') && !form.tags.includes('sK')),
    ],
    ['kana', entry.kana.find((form) => !form.tags.includes('rk') && !form.tags.includes('sk'))],
    ['written', entry.kanji[0]],
    ['kana', entry.kana[0]],
  ];
  const [kind, form] = candidates.find(([, candidate]) => candidate) || [];
  if (!form) die(`entry ${entry.id}: cannot choose a canonical head`);
  return { kind, form };
}

function restrictionAllows(restrictions, form) {
  return restrictions.includes('*') || restrictions.includes(form);
}

function senseAllowsProjection(sense, reading, displayHead) {
  return (
    restrictionAllows(sense.appliesToKana, reading.text) &&
    (displayHead.kind === 'kana' ||
      (restrictionAllows(reading.appliesToKanji, displayHead.form.text) &&
        restrictionAllows(sense.appliesToKanji, displayHead.form.text)))
  );
}

function compatiblePrimaryGloss(entry, reading, displayHead) {
  const senseIndex = entry.sense.findIndex(
    (sense) =>
      senseAllowsProjection(sense, reading, displayHead) &&
      sense.gloss.some((gloss) => gloss.lang === 'eng'),
  );
  if (senseIndex < 0) {
    die(
      `entry ${entry.id}: no sense applies to head ${displayHead.form.text} and reading ${reading.text}`,
    );
  }
  const sense = entry.sense[senseIndex];
  const glossIndex = sense.gloss.findIndex((gloss) => gloss.lang === 'eng');
  const gloss = sense.gloss[glossIndex];
  if (
    !gloss ||
    !senseAllowsProjection(sense, reading, displayHead) ||
    entry.sense[senseIndex].gloss[glossIndex] !== gloss
  ) {
    die(`entry ${entry.id}: primary-gloss applicability invariant failed`);
  }
  return gloss.text;
}

function primarySummary(entry, head) {
  const reading =
    head.kind === 'kana'
      ? head.form
      : entry.kana.find((form) => restrictionAllows(form.appliesToKanji, head.form.text));
  if (!reading) {
    die(`entry ${entry.id}: no reading applies to canonical head ${head.form.text}`);
  }
  if (
    (head.kind === 'kana' && reading.text !== head.form.text) ||
    (head.kind === 'written' && !restrictionAllows(reading.appliesToKanji, head.form.text))
  ) {
    die(`entry ${entry.id}: primary-reading applicability invariant failed`);
  }
  return {
    reading: reading.text,
    gloss: compatiblePrimaryGloss(entry, reading, head),
  };
}

function readingDisplayHead(entry, canonical, reading) {
  let displayHead = canonical;
  if (
    canonical.kind === 'written' &&
    !restrictionAllows(reading.appliesToKanji, canonical.form.text)
  ) {
    const allowed = entry.kanji.find((form) => reading.appliesToKanji.includes(form.text));
    if (!allowed) {
      if (reading.appliesToKanji.length === 0) {
        displayHead = { kind: 'kana', form: reading };
      } else {
        die(
          `entry ${entry.id}: reading ${reading.text} permits no source written form for display`,
        );
      }
    } else {
      displayHead = { kind: 'written', form: allowed };
    }
  }
  if (
    displayHead.kind === 'written' &&
    !restrictionAllows(reading.appliesToKanji, displayHead.form.text)
  ) {
    die(`entry ${entry.id}: reading-summary head applicability invariant failed`);
  }
  if (
    canonical.kind === 'written' &&
    displayHead.kind === 'kana' &&
    (reading.appliesToKanji.length !== 0 || displayHead.form !== reading)
  ) {
    die(`entry ${entry.id}: no-kanji reading-summary invariant failed`);
  }
  return displayHead;
}

function readingSummaries(entry, canonical) {
  const summaries = entry.kana.map((reading) => {
    const displayHead = readingDisplayHead(entry, canonical, reading);
    return [
      reading.text,
      displayHead.form.text,
      compatiblePrimaryGloss(entry, reading, displayHead),
    ];
  });
  if (
    summaries.length !== entry.kana.length ||
    summaries.some((summary, index) => summary[0] !== entry.kana[index].text)
  ) {
    die(`entry ${entry.id}: reading summaries lost source rows or order`);
  }
  return summaries;
}

function encodeReadingSummaries(entry, summaries, defaultHead, defaultGloss) {
  const encoded = summaries.map((summary) => [
    summary[1] === defaultHead ? 0 : summary[1],
    summary[2] === defaultGloss ? 0 : summary[2],
  ]);
  if (
    encoded.length !== entry.kana.length ||
    entry.kana.some((reading, index) => {
      const source = summaries[index];
      const restored = [
        reading.text,
        encoded[index][0] === 0 ? defaultHead : encoded[index][0],
        encoded[index][1] === 0 ? defaultGloss : encoded[index][1],
      ];
      return restored.some((value, field) => value !== source[field]);
    })
  ) {
    die(`entry ${entry.id}: encoded reading summaries do not reconstruct every source row`);
  }
  return encoded;
}

function readingWrittenScopes(entry) {
  const writtenIndex = new Map(entry.kanji.map((form, index) => [form.text, index]));
  if (writtenIndex.size !== entry.kanji.length) {
    die(`entry ${entry.id}: duplicate written forms make reading scopes ambiguous`);
  }
  const scopes = entry.kana.map((reading) => {
    if (reading.appliesToKanji.includes('*') && reading.appliesToKanji.length !== 1) {
      die(`entry ${entry.id}: reading ${reading.text} mixes * with written restrictions`);
    }
    const expected = reading.appliesToKanji.includes('*')
      ? entry.kanji.map((_, index) => index)
      : reading.appliesToKanji.map((form) => {
          const index = writtenIndex.get(form);
          if (index == null) {
            die(`entry ${entry.id}: reading ${reading.text} restricts absent written form ${form}`);
          }
          return index;
        });
    if (new Set(expected).size !== expected.length) {
      die(`entry ${entry.id}: reading ${reading.text} repeats a written restriction`);
    }
    expected.sort((left, right) => left - right);
    const encoded =
      expected.length === entry.kanji.length && expected.length > 0
        ? 0
        : expected.length === 0
          ? 1
          : expected;
    const decoded =
      encoded === 0
        ? entry.kanji.map((_, index) => index)
        : encoded === 1
          ? []
          : encoded;
    const actual = entry.kanji
      .map((form, index) =>
        restrictionAllows(reading.appliesToKanji, form.text) ? index : null,
      )
      .filter((index) => index != null);
    if (
      decoded.length !== actual.length ||
      decoded.some((index, position) => index !== actual[position]) ||
      decoded.some(
        (index) =>
          !entry.kanji[index] ||
          !restrictionAllows(reading.appliesToKanji, entry.kanji[index].text),
      )
    ) {
      die(`entry ${entry.id}: encoded reading scope does not match JMdict restrictions`);
    }
    return encoded;
  });
  if (scopes.length !== entry.kana.length) {
    die(`entry ${entry.id}: reading scopes lost source rows or order`);
  }
  return scopes;
}

function senseProjection(entry, canonical, sense, summaries) {
  const candidates = [];
  for (let kanaIndex = 0; kanaIndex < entry.kana.length; kanaIndex += 1) {
    const reading = entry.kana[kanaIndex];
    if (!restrictionAllows(sense.appliesToKana, reading.text)) continue;

    if (canonical.kind === 'kana') {
      candidates.push({ kanaIndex, reading, displayHead: canonical });
    } else if (reading.appliesToKanji.length === 0) {
      candidates.push({
        kanaIndex,
        reading,
        displayHead: { kind: 'kana', form: reading },
      });
    } else {
      const written = entry.kanji.find(
        (form) =>
          restrictionAllows(reading.appliesToKanji, form.text) &&
          restrictionAllows(sense.appliesToKanji, form.text),
      );
      if (written) candidates.push({
        kanaIndex,
        reading,
        displayHead: { kind: 'written', form: written },
      });
    }
  }
  const firstEnglishGloss = sense.gloss.find((gloss) => gloss.lang === 'eng')?.text;
  return (
    candidates.find(
      (candidate) => summaries?.[candidate.kanaIndex]?.[2] === firstEnglishGloss,
    ) ||
    candidates[0] ||
    null
  );
}

function glossApplicability(entry, canonical, flattenedGlosses, summaries) {
  const encoded = [];
  const sourceGlosses = [];
  for (const sense of entry.sense) {
    const projection = senseProjection(entry, canonical, sense, summaries);
    if (!projection || !senseAllowsProjection(sense, projection.reading, projection.displayHead)) {
      die(`entry ${entry.id}: no restriction-compatible projection for a source sense`);
    }
    for (const gloss of sense.gloss) {
      if (gloss.lang !== 'eng') {
        die(`entry ${entry.id}: non-English gloss in the pinned English-only asset`);
      }
      sourceGlosses.push(gloss.text);
      encoded.push([
        projection.kanaIndex,
        projection.displayHead.form.text === canonical.form.text
          ? 0
          : projection.displayHead.form.text,
      ]);
    }
  }
  if (
    encoded.length !== flattenedGlosses.length ||
    sourceGlosses.some((gloss, index) => gloss !== flattenedGlosses[index]) ||
    encoded.some(([kanaIndex, headOr0], index) => {
      const reading = entry.kana[kanaIndex];
      if (!reading) return true;
      const displayText = headOr0 === 0 ? canonical.form.text : headOr0;
      const written = entry.kanji.find((form) => form.text === displayText);
      const displayHead = written
        ? { kind: 'written', form: written }
        : { kind: 'kana', form: { text: displayText } };
      let offset = 0;
      const sense = entry.sense.find((candidate) => {
        const next = offset + candidate.gloss.length;
        const contains = index >= offset && index < next;
        offset = next;
        return contains;
      });
      return !sense || !senseAllowsProjection(sense, reading, displayHead);
    })
  ) {
    die(`entry ${entry.id}: gloss applicability failed reconstruction or restriction proof`);
  }
  return encoded;
}

function shardForSeq(seq) {
  const input = String(seq);
  if (!/^\d+$/.test(input)) die(`cannot shard non-decimal sequence ${JSON.stringify(input)}`);
  let hash = SHARDING_ALGORITHM.offsetBasis;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, SHARDING_ALGORITHM.prime) >>> 0;
  }
  return hash & (SHARD_COUNT - 1);
}

function hasTop151WrittenForm(entry, frequencyByKanji) {
  return entry.kanji.some((form) => {
    const han = [...form.text].filter((character) => HAN.test(character));
    return (
      han.length > 0 &&
      han.every((character) => {
        const rank = frequencyByKanji.get(character);
        return Number.isInteger(rank) && rank <= TOP_KANJI_FREQUENCY_RANK;
      })
    );
  });
}

function englishGlosses(entry) {
  const glosses = [];
  for (const sense of entry.sense) {
    for (const gloss of sense.gloss) {
      if (gloss.lang !== 'eng') {
        die(`entry ${entry.id}: non-English gloss in the pinned English-only asset`);
      }
      glosses.push(gloss.text);
    }
  }
  if (glosses.length === 0) die(`entry ${entry.id}: no English gloss`);
  return glosses;
}

function senseTagRows(entry, flattenedGlosses) {
  const rows = [];
  let glossStart = 0;
  for (const sense of entry.sense) {
    const englishCount = sense.gloss.filter((gloss) => gloss.lang === 'eng').length;
    for (const field of ['misc', 'field', 'dialect']) {
      if (!Array.isArray(sense[field])) {
        die(`entry ${entry.id}: sense.${field} is not an array`);
      }
    }
    rows.push([
      glossStart,
      englishCount,
      sense.misc,
      sense.field,
      sense.dialect,
    ]);
    glossStart += englishCount;
  }
  if (
    rows.length !== entry.sense.length ||
    glossStart !== flattenedGlosses.length ||
    rows.some(
      (row, senseIndex) =>
        row[0] < 0 ||
        row[1] < 1 ||
        row[0] + row[1] > flattenedGlosses.length ||
        row[2] !== entry.sense[senseIndex].misc ||
        row[3] !== entry.sense[senseIndex].field ||
        row[4] !== entry.sense[senseIndex].dialect,
    )
  ) {
    die(`entry ${entry.id}: sense-tag rows lost a source sense or gloss boundary`);
  }
  return rows;
}

function compactSense(sense, seq) {
  for (const field of [
    'partOfSpeech',
    'appliesToKanji',
    'appliesToKana',
    'related',
    'antonym',
    'field',
    'dialect',
    'misc',
    'info',
    'languageSource',
    'gloss',
  ]) {
    if (!Array.isArray(sense[field])) die(`entry ${seq}: sense.${field} is not an array`);
  }
  return [
    sense.partOfSpeech,
    sense.appliesToKanji,
    sense.appliesToKana,
    sense.related,
    sense.antonym,
    sense.field,
    sense.dialect,
    sense.misc,
    sense.info,
    sense.languageSource.map((source) => [
      source.lang,
      source.full ? 1 : 0,
      source.wasei ? 1 : 0,
      source.text ?? null,
    ]),
    sense.gloss.map((gloss) => {
      if (gloss.lang !== 'eng') {
        die(`entry ${seq}: non-English gloss in the pinned English-only asset`);
      }
      return [gloss.text, gloss.gender ?? null, gloss.type ?? null];
    }),
  ];
}

function compactDetail(entry) {
  return [
    entry.id,
    entry.kanji.map((form) => [form.text, form.common ? 1 : 0, form.tags]),
    entry.kana.map((form) => [
      form.text,
      form.common ? 1 : 0,
      form.tags,
      form.appliesToKanji,
    ]),
    entry.sense.map((sense) => compactSense(sense, entry.id)),
  ];
}

function validateSourceShape(jmdict, kanjidic2) {
  if (jmdict.version !== '3.6.2' || jmdict.commonOnly !== false) {
    die(`unexpected JMdict metadata: version=${jmdict.version}, commonOnly=${jmdict.commonOnly}`);
  }
  if (JSON.stringify(jmdict.languages) !== '["eng"]') {
    die(`expected English-only JMdict, found ${JSON.stringify(jmdict.languages)}`);
  }
  if (!Array.isArray(jmdict.words) || typeof jmdict.tags !== 'object' || !jmdict.tags) {
    die('unexpected JMdict JSON shape');
  }
  if (jmdict.words.length !== EXPECTED.sourceEntries) {
    die(`JMdict entry count changed: expected ${EXPECTED.sourceEntries}, got ${jmdict.words.length}`);
  }
  if (kanjidic2.version !== '3.6.2' || !Array.isArray(kanjidic2.characters)) {
    die('unexpected KANJIDIC2 JSON shape');
  }
  if (JSON.stringify(kanjidic2.languages) !== '["en"]') {
    die(`expected English KANJIDIC2, found ${JSON.stringify(kanjidic2.languages)}`);
  }
}

function buildOutputs(jmdict, kanjidic2, pin) {
  validateSourceShape(jmdict, kanjidic2);
  const frequencyByKanji = new Map(
    kanjidic2.characters.map((entry) => [entry.literal, entry.misc?.frequency ?? null]),
  );
  const selected = [];
  const buckets = { common: 0, kanaOnly: 0, top151: 0 };

  let sourceKanjiForms = 0;
  let sourceKanaForms = 0;
  let sourceSenses = 0;
  let sourceGlosses = 0;
  let sourceCommonEntries = 0;
  for (const entry of jmdict.words) {
    if (!/^\d+$/.test(entry.id)) die(`invalid JMdict sequence ${JSON.stringify(entry.id)}`);
    if (!Array.isArray(entry.kanji) || !Array.isArray(entry.kana) || !Array.isArray(entry.sense)) {
      die(`entry ${entry.id}: unexpected entry shape`);
    }
    if (entry.kana.length === 0) die(`entry ${entry.id}: no kana form`);
    sourceKanjiForms += entry.kanji.length;
    sourceKanaForms += entry.kana.length;
    sourceSenses += entry.sense.length;
    sourceGlosses += entry.sense.reduce((sum, sense) => sum + sense.gloss.length, 0);

    const common = isCommon(entry);
    if (common) {
      sourceCommonEntries += 1;
      buckets.common += 1;
      selected.push(entry);
    } else if (entry.kanji.length === 0) {
      buckets.kanaOnly += 1;
      selected.push(entry);
    } else if (hasTop151WrittenForm(entry, frequencyByKanji)) {
      buckets.top151 += 1;
      selected.push(entry);
    }
  }

  if (
    selected.length !== EXPECTED.selectedEntries ||
    buckets.common !== EXPECTED.selectedCommon ||
    buckets.kanaOnly !== EXPECTED.selectedKanaOnly ||
    buckets.top151 !== EXPECTED.selectedTop151
  ) {
    die(
      'selection invariant changed: ' +
        JSON.stringify({ selected: selected.length, ...buckets }) +
        '; review the source and selection rule before publishing',
    );
  }

  selected.sort((a, b) => Number(a.id) - Number(b.id));
  const formSet = new Set();
  let selectedKanjiForms = 0;
  let selectedKanaForms = 0;
  let selectedSenses = 0;
  let selectedGlosses = 0;
  let selectedReadingSummaryHeadOverrides = 0;
  let selectedReadingSummaryGlossOverrides = 0;
  let selectedGlossApplicabilityHeadOverrides = 0;
  let selectedGlossApplicabilityNonPrimaryReadings = 0;
  let selectedReadingScopesAll = 0;
  let selectedReadingScopesNone = 0;
  let selectedReadingScopesRestricted = 0;
  let selectedTaggedSenses = 0;
  let selectedAbbreviationSenses = 0;
  let selectedSensitiveSenses = 0;
  const selectedSenseTagCodes = {
    misc: new Set(),
    field: new Set(),
    dialect: new Set(),
  };
  const indexEntries = [];
  const shardEntries = Array.from({ length: SHARD_COUNT }, () => []);
  for (const entry of selected) {
    const writtenForms = entry.kanji.map((form) => form.text);
    const kanaForms = entry.kana.map((form) => form.text);
    const canonical = canonicalHead(entry);
    const head = canonical.form.text;
    const primary = primarySummary(entry, canonical);
    const perReading = readingSummaries(entry, canonical);
    const encodedSummaries = encodeReadingSummaries(entry, perReading, head, primary.gloss);
    const glosses = englishGlosses(entry);
    const perGloss = glossApplicability(entry, canonical, glosses, perReading);
    const perReadingScopes = readingWrittenScopes(entry);
    const perSenseTags = senseTagRows(entry, glosses);
    if (![...writtenForms, ...kanaForms].includes(head)) {
      die(`entry ${entry.id}: canonical head is not one of its forms`);
    }
    for (const form of [...writtenForms, ...kanaForms]) formSet.add(form);
    selectedKanjiForms += writtenForms.length;
    selectedKanaForms += kanaForms.length;
    selectedSenses += entry.sense.length;
    selectedGlosses += glosses.length;
    selectedReadingSummaryHeadOverrides += encodedSummaries.filter(
      (summary) => summary[0] !== 0,
    ).length;
    selectedReadingSummaryGlossOverrides += encodedSummaries.filter(
      (summary) => summary[1] !== 0,
    ).length;
    selectedGlossApplicabilityHeadOverrides += perGloss.filter(
      (projection) => projection[1] !== 0,
    ).length;
    selectedGlossApplicabilityNonPrimaryReadings += perGloss.filter(
      (projection) => kanaForms[projection[0]] !== primary.reading,
    ).length;
    selectedReadingScopesAll += perReadingScopes.filter((scope) => scope === 0).length;
    selectedReadingScopesNone += perReadingScopes.filter((scope) => scope === 1).length;
    selectedReadingScopesRestricted += perReadingScopes.filter(Array.isArray).length;
    for (const [, , misc, field, dialect] of perSenseTags) {
      if (misc.length || field.length || dialect.length) selectedTaggedSenses += 1;
      if (misc.includes('abbr')) selectedAbbreviationSenses += 1;
      if (misc.includes('sens')) selectedSensitiveSenses += 1;
      for (const tag of misc) selectedSenseTagCodes.misc.add(tag);
      for (const tag of field) selectedSenseTagCodes.field.add(tag);
      for (const tag of dialect) selectedSenseTagCodes.dialect.add(tag);
    }

    indexEntries.push([
      entry.id,
      head,
      primary.reading,
      primary.gloss,
      writtenForms,
      kanaForms,
      glosses,
      glosses.map(normalizeGloss),
      isCommon(entry) ? 1 : 0,
      encodedSummaries,
      perGloss,
      perReadingScopes,
      perSenseTags,
    ]);
    shardEntries[shardForSeq(entry.id)].push(compactDetail(entry));
  }

  const proofGlossProjection = (seq, gloss) => {
    const row = indexEntries.find((entry) => entry[0] === seq);
    if (!row) die(`gloss-applicability proof entry ${seq} is missing`);
    const glossIndex = row[6].indexOf(gloss);
    if (glossIndex < 0) {
      die(`gloss-applicability proof ${seq} lacks gloss ${JSON.stringify(gloss)}`);
    }
    const [kanaIndex, headOr0] = row[10][glossIndex];
    return [row[5][kanaIndex], headOr0 === 0 ? row[1] : headOr0];
  };
  const avoidPutAside = proofGlossProjection('1583260', 'to put aside');
  if (avoidPutAside[0] !== 'よける' || avoidPutAside[1] !== '避ける') {
    die(
      `gloss-applicability proof failed for 避ける/to put aside: ${JSON.stringify(avoidPutAside)}`,
    );
  }
  const halfMoonSemicircle = proofGlossProjection('1583170', 'semicircle');
  if (halfMoonSemicircle[0] !== 'はんげつ' || halfMoonSemicircle[1] !== '半月') {
    die(
      `gloss-applicability proof failed for 半月/semicircle: ${JSON.stringify(halfMoonSemicircle)}`,
    );
  }
  const halfMonth = proofGlossProjection('1583170', 'half a month');
  if (halfMonth[0] !== 'はんつき' || halfMonth[1] !== '半月') {
    die(
      `gloss-applicability proof failed for 半月/half a month: ${JSON.stringify(halfMonth)}`,
    );
  }
  const avoidRow = indexEntries.find((entry) => entry[0] === '1583260');
  const exceptIndex = avoidRow?.[4]?.indexOf('除ける') ?? -1;
  const allowedReadings = avoidRow?.[11]
    ?.map((scope, index) => {
      const allowed = scope === 0 ? avoidRow[4].map((_, formIndex) => formIndex) : scope === 1 ? [] : scope;
      return allowed.includes(exceptIndex) ? avoidRow[5][index] : null;
    })
    .filter(Boolean);
  if (exceptIndex < 0 || JSON.stringify(allowedReadings) !== JSON.stringify(['よける'])) {
    die(
      `written-reading proof failed for 除ける: ${JSON.stringify(allowedReadings)}`,
    );
  }

  for (let shard = 0; shard < SHARD_COUNT; shard += 1) {
    for (const detail of shardEntries[shard]) {
      if (shardForSeq(detail[0]) !== shard) {
        die(`entry ${detail[0]} was emitted into the wrong detail shard`);
      }
    }
  }
  const shardEntryCounts = shardEntries.map((entries) => entries.length);
  const minShardEntries = Math.min(...shardEntryCounts);
  const maxShardEntries = Math.max(...shardEntryCounts);
  const shardEntryRatio = maxShardEntries / minShardEntries;
  if (shardEntryRatio > 1.05) {
    die(
      `detail shard entry counts are imbalanced: ${minShardEntries}..${maxShardEntries} ` +
        `(${shardEntryRatio.toFixed(6)} > 1.05)`,
    );
  }

  const counts = {
    sourceEntries: jmdict.words.length,
    sourceCommonEntries,
    sourceKanjiForms,
    sourceKanaForms,
    sourceForms: sourceKanjiForms + sourceKanaForms,
    sourceSenses,
    sourceEnglishGlosses: sourceGlosses,
    selectedEntries: selected.length,
    selectedCommonEntries: buckets.common,
    selectedAdditionalKanaOnly: buckets.kanaOnly,
    selectedAdditionalTop151: buckets.top151,
    selectedKanjiForms,
    selectedKanaForms,
    selectedForms: selectedKanjiForms + selectedKanaForms,
    selectedUniqueForms: formSet.size,
    selectedSenses,
    selectedEnglishGlosses: selectedGlosses,
    selectedReadingSummaries: selectedKanaForms,
    selectedReadingSummaryHeadOverrides,
    selectedReadingSummaryGlossOverrides,
    selectedGlossApplicabilityRows: selectedGlosses,
    selectedGlossApplicabilityHeadOverrides,
    selectedGlossApplicabilityNonPrimaryReadings,
    selectedReadingScopes: selectedKanaForms,
    selectedReadingScopesAll,
    selectedReadingScopesNone,
    selectedReadingScopesRestricted,
    selectedTaggedSenses,
    selectedAbbreviationSenses,
    selectedSensitiveSenses,
  };
  const source = {
    name: 'JMdict and KANJIDIC2 via jmdict-simplified',
    pin: pin.pin,
    jmdict: {
      asset: pin.jmdict.asset,
      sha256: pin.jmdict.sha256,
      version: jmdict.version,
      dictDate: jmdict.dictDate,
      dictRevisions: jmdict.dictRevisions,
      languages: jmdict.languages,
      commonOnly: jmdict.commonOnly,
    },
    kanjidic2: {
      asset: pin.kanjidic2.asset,
      sha256: pin.kanjidic2.sha256,
      version: kanjidic2.version,
      dictDate: kanjidic2.dictDate,
      languages: kanjidic2.languages,
    },
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://www.edrdg.org/edrdg/licence.html',
    attribution:
      'JMdict and KANJIDIC2 are the property of the Electronic Dictionary Research and Development Group (EDRDG); JSON conversion by jmdict-simplified.',
    upstream: [
      'https://www.edrdg.org/',
      'https://github.com/scriptin/jmdict-simplified',
    ],
    provenance: 'corpus/src/corpus/sources/jmdict/PROVENANCE.yml',
  };
  const selection = {
    id: 'common-kana-only-top151-kanji-v1',
    rule:
      'Include an entry when any form is JMdict-common, or it has no written form, or at least one written form has every Unicode unified ideograph ranked 151 or better by KANJIDIC2 misc.frequency.',
    topKanjiFrequencyRank: TOP_KANJI_FREQUENCY_RANK,
    disclosure:
      'KANJIDIC2 misc.frequency is a newspaper character-frequency rank. This tier broadens orthographic coverage; it is not a whole-word frequency ranking.',
    canonicalHead:
      'First common written form; else first common kana form; else first written form without rK/sK; else first kana form without rk/sk; else first written form, then first kana form, in source order.',
  };
  const sharding = {
    ...SHARDING_ALGORITHM,
    shardCount: SHARD_COUNT,
    entryCounts: shardEntryCounts,
    minEntries: minShardEntries,
    maxEntries: maxShardEntries,
    maxToMinEntryRatio: Number(shardEntryRatio.toFixed(6)),
    enforcedMaxToMinEntryRatio: 1.05,
  };

  const files = new Map();
  const senseTagVocabulary = Object.fromEntries(
    Object.entries(selectedSenseTagCodes).map(([category, codes]) => [
      category,
      Object.fromEntries(
        [...codes]
          .sort()
          .map((code) => {
            const description = jmdict.tags[code];
            if (!description) die(`JMdict does not define sense tag ${code}`);
            return [code, description];
          }),
      ),
    ]),
  );
  files.set(
    'index.json',
    JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      pool: 'share_alike',
      shardCount: SHARD_COUNT,
      sharding,
      source,
      selection,
      counts,
      tags: jmdict.tags,
      senseTagVocabulary,
      layout: LAYOUT,
      entries: indexEntries,
    }),
  );
  for (let shard = 0; shard < SHARD_COUNT; shard += 1) {
    const name = shard.toString(16).padStart(2, '0');
    files.set(
      `${name}.json`,
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        pool: 'share_alike',
        shard,
        shardCount: SHARD_COUNT,
        sharding,
        sourcePin: pin.pin,
        counts: { entries: shardEntries[shard].length },
        layout: LAYOUT,
        entries: shardEntries[shard],
      }),
    );
  }
  const detailSizes = [...files]
    .filter(([name]) => name !== 'index.json')
    .map(([, text]) => Buffer.byteLength(text));
  const minDetailBytes = Math.min(...detailSizes);
  const maxDetailBytes = Math.max(...detailSizes);
  if (maxDetailBytes / minDetailBytes > 1.15) {
    die(
      `serialized detail shards are imbalanced: ${minDetailBytes}..${maxDetailBytes} bytes ` +
        `(${(maxDetailBytes / minDetailBytes).toFixed(6)} > 1.15)`,
    );
  }
  return { files, counts };
}

function verifyOrWrite(files, check, outputDir) {
  const expectedNames = new Set(files.keys());
  if (existsSync(outputDir)) {
    const extras = readdirSync(outputDir).filter(
      (name) => name.endsWith('.json') && !expectedNames.has(name),
    );
    if (extras.length > 0) {
      die(`unexpected JSON files in ${outputDir}: ${extras.sort().join(', ')}`);
    }
  } else if (check) {
    die(`missing output directory ${outputDir}`);
  } else {
    mkdirSync(outputDir, { recursive: true });
  }

  let totalBytes = 0;
  for (const [name, text] of files) {
    const path = resolve(outputDir, name);
    const expected = Buffer.from(text);
    totalBytes += expected.length;
    if (check) {
      if (!existsSync(path)) die(`missing generated file ${path}`);
      const current = readFileSync(path);
      if (!current.equals(expected)) die(`${path} is stale; rerun build-dictionary-v2.mjs`);
    } else {
      writeFileSync(path, expected);
    }
  }
  return totalBytes;
}

const options = parseArgs(process.argv.slice(2));
const pin = verifyPinnedConfiguration();
const jmdictPath = resolve(options.sourceDir, pin.jmdict.asset);
const kanjidicPath = resolve(options.sourceDir, pin.kanjidic2.asset);
const jmdict = unzipJson(jmdictPath, pin.jmdict.sha256);
const kanjidic2 = unzipJson(kanjidicPath, pin.kanjidic2.sha256);
const { files, counts } = buildOutputs(jmdict, kanjidic2, pin);
const totalBytes = verifyOrWrite(files, options.check, options.outputDir);
const action = options.check ? 'current' : 'written';
const outputSizes = [...files.keys()].map((name) =>
  `${name}=${statSync(resolve(options.outputDir, name)).size}`,
);
console.log(
  `dictionary-v2 ${action}: ${counts.selectedEntries} entries · ` +
    `${counts.selectedForms} forms · ${counts.selectedSenses} senses · ` +
    `${counts.selectedEnglishGlosses} glosses · ${totalBytes} bytes`,
);
console.log(outputSizes.join(' · '));
