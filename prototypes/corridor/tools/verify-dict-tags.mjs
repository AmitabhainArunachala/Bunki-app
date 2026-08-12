#!/usr/bin/env node
/** Verify the schema-v3 JMdict sense-tag projection and byte determinism. */
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const REPO = resolve(CORRIDOR, '..', '..');
const OUTPUT = resolve(CORRIDOR, 'data/share_alike/dict-v2');
const CORE = resolve(CORRIDOR, 'data/share_alike/dict.json');
const CONTRACT = resolve(REPO, 'docs/briefs/DICT_TAGS_CONTRACT_2026-08-12.md');
const BASELINE = 'ca07a8e5b1dc6d45ff70ad0feec3c7333285eff9';
const JMDICT_ASSET = 'jmdict-eng-3.6.2+20260803141815.json.zip';
const KANJIDIC_ASSET = 'kanjidic2-en-3.6.2+20260803141815.json.zip';
const JMDICT_SHA256 = '1806d2817215ebe7ded997c8dac4831a3335d83ed12f321ac869a97e745d3a5c';
const SENSE_LAYOUT = 'glossStart,glossCount,misc,field,dialect';

let sourceDir = resolve(REPO, 'corpus/data/jmdict');
let determinism = true;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--source-dir') {
    if (!args[index + 1]) throw new Error('--source-dir requires a path');
    sourceDir = resolve(args[(index += 1)]);
  } else if (arg.startsWith('--source-dir=')) {
    sourceDir = resolve(arg.slice('--source-dir='.length));
  } else if (arg === '--no-determinism') {
    determinism = false;
  } else {
    throw new Error(`unknown argument ${JSON.stringify(arg)}`);
  }
}

let passed = 0;
function check(label, condition, detail = '') {
  if (!condition) throw new Error(`${label}${detail ? ` — ${detail}` : ''}`);
  passed += 1;
  console.log(`PASS ${label}${detail ? ` · ${detail}` : ''}`);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${commandArgs.join(' ')} failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

function unzipJson(path) {
  return JSON.parse(run('unzip', ['-p', path]));
}

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function shardId(seq) {
  let hash = 0x811c9dc5;
  for (const character of String(seq)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash & 15).toString(16).padStart(2, '0');
}

function files(dir) {
  return readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
}

function assertByteEqual(leftDir, rightDir, names, label) {
  for (const name of names) {
    const left = readFileSync(resolve(leftDir, name));
    const right = readFileSync(resolve(rightDir, name));
    if (!left.equals(right)) throw new Error(`${label}: ${name} differs`);
  }
}

async function initialiseWorker(indexValue, coreValue) {
  let handler = null;
  let message = null;
  const self = {
    addEventListener(type, callback) {
      if (type === 'message') handler = callback;
    },
    postMessage(value) {
      message = value;
    },
  };
  runInNewContext(readFileSync(resolve(CORRIDOR, 'dictionary-worker.js'), 'utf8'), {
    self,
    fetch: async (url) => ({
      ok: true,
      text: async () => JSON.stringify(String(url).includes('index') ? indexValue : coreValue),
    }),
    performance,
    TextEncoder,
  });
  if (!handler) throw new Error('dictionary worker did not register its message handler');
  await handler({
    data: {
      id: 1,
      type: 'init',
      indexUrl: 'https://local.invalid/index.json',
      coreUrl: 'https://local.invalid/core.json',
    },
  });
  return message;
}

const jmdictPath = resolve(sourceDir, JMDICT_ASSET);
const kanjidicPath = resolve(sourceDir, KANJIDIC_ASSET);
check('pinned JMdict hash', sha256(jmdictPath) === JMDICT_SHA256, JMDICT_SHA256);
check('pinned KANJIDIC2 asset present', statSync(kanjidicPath).size > 0);

const source = unzipJson(jmdictPath);
const sourceBySeq = new Map(source.words.map((entry) => [entry.id, entry]));
const index = json(resolve(OUTPUT, 'index.json'));
const core = json(CORE);
const baselineText = run('git', [
  'show',
  `${BASELINE}:prototypes/corridor/data/share_alike/dict-v2/index.json`,
]);
const baselineIndex = JSON.parse(baselineText);
check('index schema is v3', index.schemaVersion === 3);
check('index sharding identity retained', index.sharding?.id === 'fnv1a32-ascii-seq-mask15');
check('index sense-tag layout is self-describing', index.layout?.senseTagRow?.join(',') === SENSE_LAYOUT);
check('CORE schema and sidecar are self-describing',
  core.schemaVersion === 3 && core.senseTagLayout?.join(',') === SENSE_LAYOUT && !!core.senseTags);

const worker = readFileSync(resolve(CORRIDOR, 'dictionary-worker.js'), 'utf8');
check('worker fail-closes on old index/CORE schemas',
  worker.includes('index?.schemaVersion !== 3') &&
    worker.includes('coreLoad.value?.schemaVersion !== 3') &&
    worker.includes('row.length !== 13'));
const app = readFileSync(resolve(CORRIDOR, 'corridor.js'), 'utf8');
check('forbidden app validator still rejects schema v3 loudly',
  [...app.matchAll(/schemaVersion !== 2/g)].length === 2,
  'trunk keeper must update corridor.js index + shard validators');
const workerV3 = await initialiseWorker(index, core);
check('new worker accepts matching schema-v3 index and CORE',
  workerV3?.ok === true && workerV3?.result?.metadata?.schemaVersion === 3,
  `${workerV3?.result?.performance?.entries || 0} entries validated`);
const baselineCore = JSON.parse(run('git', [
  'show',
  `${BASELINE}:prototypes/corridor/data/share_alike/dict.json`,
]));
const workerV2 = await initialiseWorker(baselineIndex, baselineCore);
check('new worker rejects old schema-v2 index and CORE loudly',
  workerV2?.ok === false && workerV2?.error === 'dictionary worker received an unsupported index');

check('zero index rows lost vs ca07a8e',
  index.entries.length === baselineIndex.entries.length &&
    index.entries.every((row, position) => row[0] === baselineIndex.entries[position][0]),
  `${index.entries.length} entries in identical sequence order`);
check('source sense/gloss counts retained',
  index.counts.selectedSenses === baselineIndex.counts.selectedSenses &&
    index.counts.selectedEnglishGlosses === baselineIndex.counts.selectedEnglishGlosses,
  `${index.counts.selectedSenses} senses · ${index.counts.selectedEnglishGlosses} glosses`);

const details = new Map();
for (let shard = 0; shard < 16; shard += 1) {
  const id = shard.toString(16).padStart(2, '0');
  const file = json(resolve(OUTPUT, `${id}.json`));
  check(`detail shard ${id} schema/sharding`,
    file.schemaVersion === 3 &&
      file.shard === shard &&
      file.sharding?.id === 'fnv1a32-ascii-seq-mask15' &&
      file.entries.every((entry) => shardId(entry[0]) === id));
  for (const entry of file.entries) details.set(entry[0], entry);
}
check('zero detail rows lost', details.size === baselineIndex.entries.length, `${details.size} rows`);

let abbreviationSenses = 0;
let sensitiveSenses = 0;
let taggedSenses = 0;
for (const row of index.entries) {
  const sourceEntry = sourceBySeq.get(row[0]);
  if (!sourceEntry) throw new Error(`selected source entry ${row[0]} is absent`);
  const tagRows = row[12];
  if (!Array.isArray(tagRows) || tagRows.length !== sourceEntry.sense.length) {
    throw new Error(`${row[0]} does not preserve every source sense`);
  }
  const detail = details.get(row[0]);
  let glossStart = 0;
  for (let senseIndex = 0; senseIndex < sourceEntry.sense.length; senseIndex += 1) {
    const sense = sourceEntry.sense[senseIndex];
    const glossCount = sense.gloss.filter((gloss) => gloss.lang === 'eng').length;
    const expected = [glossStart, glossCount, sense.misc, sense.field, sense.dialect];
    if (JSON.stringify(tagRows[senseIndex]) !== JSON.stringify(expected)) {
      throw new Error(`${row[0]} sense ${senseIndex + 1} index tags differ from pinned JMdict`);
    }
    const compactDetail = detail?.[3]?.[senseIndex];
    if (
      !compactDetail ||
      JSON.stringify(compactDetail[7]) !== JSON.stringify(sense.misc) ||
      JSON.stringify(compactDetail[5]) !== JSON.stringify(sense.field) ||
      JSON.stringify(compactDetail[6]) !== JSON.stringify(sense.dialect)
    ) {
      throw new Error(`${row[0]} sense ${senseIndex + 1} detail tags differ from pinned JMdict`);
    }
    if (sense.misc.length || sense.field.length || sense.dialect.length) taggedSenses += 1;
    if (sense.misc.includes('abbr')) abbreviationSenses += 1;
    if (sense.misc.includes('sens')) sensitiveSenses += 1;
    glossStart += glossCount;
  }
  if (glossStart !== row[6].length) throw new Error(`${row[0]} gloss boundary mismatch`);
}
check('every selected JMdict sense preserves misc/field/dialect exactly',
  taggedSenses === index.counts.selectedTaggedSenses,
  `${taggedSenses} tagged senses`);
check('every selected [abbr] sense is tagged',
  abbreviationSenses === index.counts.selectedAbbreviationSenses,
  `${abbreviationSenses} senses`);
check('every selected [sens] sense is tagged',
  sensitiveSenses === index.counts.selectedSensitiveSenses,
  `${sensitiveSenses} senses`);

for (const [category, vocabulary] of Object.entries(index.senseTagVocabulary)) {
  for (const [code, description] of Object.entries(vocabulary)) {
    if (source.tags[code] !== description) {
      throw new Error(`${category} tag ${code} has a non-source description`);
    }
  }
}
check('sense-tag vocabulary matches pinned JMdict descriptions', true,
  Object.values(index.senseTagVocabulary).reduce((sum, tags) => sum + Object.keys(tags).length, 0) +
    ' category memberships');

const contract = readFileSync(CONTRACT, 'utf8');
let documentedTags = 0;
for (const vocabulary of Object.values(index.senseTagVocabulary)) {
  for (const [code, description] of Object.entries(vocabulary)) {
    const row = contract
      .split('\n')
      .find((line) => line.startsWith(`| \`${code}\``));
    if (!row) throw new Error(`contract does not document emitted tag ${code}`);
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
    if (!cells[1] || cells[2] !== description) {
      throw new Error(`contract display row for ${code} is incomplete or source-inaccurate`);
    }
    documentedTags += 1;
  }
}
check('contract has Japanese and exact English display names for every emitted tag',
  documentedTags === 152, `${documentedTags} category memberships`);

const halfIsland = index.entries.find((row) => row[0] === '1479770');
const halfIslandTags = halfIsland?.[12]?.[1]?.[2];
check('半島 sense 2 is source-honest',
  JSON.stringify(halfIslandTags) === JSON.stringify(['sens', 'col']),
  'pinned JMdict has sens+col; it does not have abbr');
check('CORE 半島 sidecar preserves the same source row',
  JSON.stringify(core.senseTags['半島']) === JSON.stringify(halfIsland[12]));

if (determinism) {
  const temporary = mkdtempSync(resolve(tmpdir(), 'bunki-dict-tags-'));
  try {
    const v2a = resolve(temporary, 'v2-a');
    const v2b = resolve(temporary, 'v2-b');
    const coreA = resolve(temporary, 'core-a');
    const coreB = resolve(temporary, 'core-b');
    const builder = resolve(HERE, 'build-dictionary-v2.mjs');
    const coreBuilder = resolve(HERE, 'build_dictionary.mjs');
    for (const outputDir of [v2a, v2b]) {
      run(process.execPath, [builder, '--source-dir', sourceDir, '--output-dir', outputDir]);
    }
    const names = files(OUTPUT);
    check('two schema-v3 shard builds are byte-identical',
      JSON.stringify(files(v2a)) === JSON.stringify(names) && JSON.stringify(files(v2b)) === JSON.stringify(names));
    assertByteEqual(v2a, v2b, names, 'two-run v2 determinism');
    assertByteEqual(v2a, OUTPUT, names, 'committed v2 currency');
    check('committed shards equal deterministic rebuild', true, `${names.length} files`);
    for (const outputDir of [coreA, coreB]) {
      run(process.execPath, [coreBuilder, '--dict-only', '--output-dir', outputDir]);
    }
    check('two CORE builds are byte-identical',
      readFileSync(resolve(coreA, 'dict.json')).equals(readFileSync(resolve(coreB, 'dict.json'))));
    check('committed CORE equals deterministic rebuild',
      readFileSync(resolve(coreA, 'dict.json')).equals(readFileSync(CORE)));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

console.log(`\nverify-dict-tags: ${passed}/${passed} checks passed`);
console.log(
  'CONTRADICTION: the pinned JMdict source marks 半島 sense 2 as sens+col, not abbr+sens; ' +
    'the build preserves the source and does not invent abbr.',
);
