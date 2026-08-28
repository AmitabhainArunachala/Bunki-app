#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const candidate = args.get('--candidate');
const output = args.get('--out');
const artifactDir = args.get('--artifact-dir');
const artifactZip = args.get('--artifact-zip');
if (!candidate || !/^[0-9a-f]{40}$/.test(candidate) || !output) {
  console.error(
    'usage: node scripts/reading-r0-audit.mjs --candidate <40-char-sha> --out <directory>',
  );
  process.exit(2);
}

const root = process.cwd();
const tree = execFileSync('git', ['rev-parse', `${candidate}^{tree}`], {
  cwd: root,
  encoding: 'utf8',
}).trim();
try {
  execFileSync(
    'git',
    ['diff', '--quiet', candidate, '--', '.github/workflows/pages-app.yml', 'prototypes/corridor'],
    { cwd: root, stdio: 'ignore' },
  );
} catch {
  console.error('refusing to audit Pages inputs that differ from the named candidate');
  process.exit(1);
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const jsonl = async (file) =>
  (await readFile(file, 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${file}:${index + 1}: invalid JSONL: ${error.message}`, {
          cause: error,
        });
      }
    });
const exists = (value) => value !== undefined && value !== null && String(value).trim() !== '';

async function walk(directory) {
  const children = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, child.name);
    if (child.isDirectory()) files.push(...(await walk(absolute)));
    else if (child.isFile()) files.push(absolute);
  }
  return files;
}

const corridor = path.join(root, 'prototypes/corridor');
// must mirror the "Assemble the Pages site" copy list in pages-app.yml —
// a projection that omits shipped files can never byte-match the artifact
const fixed = [
  'index.html',
  'apple-touch-icon.png',
  'manifest.webmanifest',
  'sw.js',
  'icon-192.png',
  'icon-512.png',
  'fonts.css',
  'corridor.css',
  'corridor.js',
  'corridor-ink.js',
  'dictionary-worker.js',
  'drift-layer.css',
  'drift-layer.js',
];
const deployedSources = [
  ...fixed.map((name) => path.join(corridor, name)),
  ...(await walk(path.join(corridor, 'data'))),
  ...(await walk(path.join(corridor, 'vendor'))),
  ...(await walk(path.join(corridor, 'design'))),
  ...(await walk(path.join(corridor, 'fonts'))),
  // the recorded voices ride along when the branch carries them (pages-app.yml)
  ...(existsSync(path.join(corridor, 'audio')) ? await walk(path.join(corridor, 'audio')) : []),
];

const entries = [];
for (const absolute of deployedSources) {
  const bytes = await readFile(absolute);
  entries.push({
    path: path.relative(corridor, absolute).split(path.sep).join('/'),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    source: path.relative(root, absolute).split(path.sep).join('/'),
  });
}
const indexEntry = entries.find((entry) => entry.path === 'index.html');
entries.push({
  ...indexEntry,
  path: '404.html',
  source: 'generated copy of prototypes/corridor/index.html',
});
entries.sort((a, b) => a.path.localeCompare(b.path));

let downloadedArtifact = null;
if (artifactDir) {
  const downloadedEntries = [];
  for (const absolute of await walk(path.resolve(artifactDir))) {
    const bytes = await readFile(absolute);
    downloadedEntries.push({
      path: path.relative(path.resolve(artifactDir), absolute).split(path.sep).join('/'),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  }
  downloadedEntries.sort((a, b) => a.path.localeCompare(b.path));
  const projected = entries.map(({ path: filePath, bytes, sha256: digest }) => ({
    path: filePath,
    bytes,
    sha256: digest,
  }));
  if (JSON.stringify(downloadedEntries) !== JSON.stringify(projected)) {
    console.error(
      'downloaded workflow artifact is not byte-identical to the candidate source projection',
    );
    process.exit(1);
  }
  downloadedArtifact = {
    compared: true,
    result: 'BYTE_IDENTICAL',
    fileCount: downloadedEntries.length,
    totalBytes: downloadedEntries.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}
if (artifactZip) {
  const bytes = await readFile(path.resolve(artifactZip));
  downloadedArtifact ||= { compared: false };
  downloadedArtifact.zip = { bytes: bytes.byteLength, sha256: sha256(bytes) };
}

const artifactManifest = {
  schemaVersion: 1,
  candidate,
  tree,
  scope:
    'deterministic source projection of .github/workflows/pages-app.yml Assemble the Pages site step',
  evidenceClass: downloadedArtifact?.compared
    ? 'WORKFLOW_ARTIFACT_COMPARISON'
    : 'SOURCE_INSPECTION',
  downloadedArtifact,
  warning: downloadedArtifact?.compared
    ? 'The complete workflow artifact is byte-identical to the clean candidate source projection. Browser rendering and physical-device behavior remain separate evidence lanes.'
    : 'Entries prove the exact bytes a clean checkout projects into the Pages site. They are not an independent download of the workflow artifact.',
  fileCount: entries.length,
  totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  generationCommand: artifactDir
    ? `node scripts/reading-r0-audit.mjs --candidate ${candidate} --out ${output} --artifact-dir <unzipped-artifact>${artifactZip ? ' --artifact-zip <downloaded-zip>' : ''}`
    : `node scripts/reading-r0-audit.mjs --candidate ${candidate} --out ${output}`,
  files: entries,
};

const articleRoot = path.join(corridor, 'data/articles');
const primaryIndex = await json(path.join(articleRoot, 'index.json'));
const archiveIndex = await json(path.join(articleRoot, 'archive-index.json'));
const primary = primaryIndex.articles;
const archive = archiveIndex.articles;
const fields = [
  'titleEn',
  'titleKana',
  'genre',
  'category',
  'tags',
  'topics',
  'audio',
  'image',
  'addedAt',
  'reviewedAt',
  'readingTime',
  'wordCount',
  'series',
  'questions',
  'approvalState',
  'editorial',
];
const countPresent = (rows, field) => rows.filter((row) => exists(row[field])).length;
const group = (rows, key) =>
  Object.fromEntries(
    [
      ...rows.reduce(
        (map, row) => map.set(row[key] || '(missing)', (map.get(row[key] || '(missing)') || 0) + 1),
        new Map(),
      ),
    ].sort(([left], [right]) => left.localeCompare(right)),
  );
const lengths = primary.map((row) => Number(row.chars) || 0).sort((a, b) => a - b);
const medianLength =
  lengths.length % 2 === 1
    ? lengths[Math.floor(lengths.length / 2)]
    : (lengths[lengths.length / 2 - 1] + lengths[lengths.length / 2]) / 2;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const ids = [...primary, ...archive].map((row) => row.id);
if (new Set(ids).size !== ids.length) {
  console.error('article IDs are not globally unique');
  process.exit(1);
}
const indexedBodies = new Set();
let tokenizedBodies = 0;
for (const row of [...primary, ...archive]) {
  if (!row.file || indexedBodies.has(row.file)) {
    console.error(`missing or duplicate article body file: ${row.id}`);
    process.exit(1);
  }
  indexedBodies.add(row.file);
  const body = await json(path.join(articleRoot, row.file));
  for (const field of ['id', 'title', 'source', 'pool', 'licence', 'attribution', 'url']) {
    if (body[field] !== row[field]) {
      console.error(`${row.id}: body ${field} does not match its index row`);
      process.exit(1);
    }
  }
  if (!exists(body.text) || !Array.isArray(body.tokens) || body.tokens.length === 0) {
    console.error(`${row.id}: body text or tokens are missing`);
    process.exit(1);
  }
  tokenizedBodies += 1;
}
const allArticleJson = (await walk(articleRoot))
  .map((absolute) => path.relative(articleRoot, absolute).split(path.sep).join('/'))
  .filter(
    (relative) =>
      relative.endsWith('.json') && !['index.json', 'archive-index.json'].includes(relative),
  );
const orphanBodies = allArticleJson.filter((relative) => !indexedBodies.has(relative));
if (orphanBodies.length > 0 || allArticleJson.length !== indexedBodies.size) {
  console.error(`article body closure failed; orphan files: ${orphanBodies.join(', ')}`);
  process.exit(1);
}
const corridorSource = await readFile(path.join(corridor, 'corridor.js'), 'utf8');
const titleBlock = corridorSource.match(/const TITLES_EN = \{([\s\S]*?)\n\};/);
const runtimeEnglishTitleCount = titleBlock
  ? [...titleBlock[1].matchAll(/^\s*['"][^'"\n]+['"]\s*:/gm)].length
  : 0;

const corpusCensus = {
  schemaVersion: 1,
  candidate,
  tree,
  evidenceClass: 'SOURCE_INSPECTION',
  primary: {
    total: primary.length,
    uniqueIds: new Set(primary.map((row) => row.id)).size,
    pools: group(primary, 'pool'),
    sources: group(primary, 'source'),
    nonemptyDates: primary.filter((row) => exists(row.date)).length,
    isoDates: primary.filter((row) => isoDate.test(row.date || '')).length,
    authorLevels: group(primary, 'authorLevel'),
    lanes: group(primary, 'lane'),
    metadataPresence: Object.fromEntries(
      fields.map((field) => [field, countPresent(primary, field)]),
    ),
    charLength: {
      min: lengths[0],
      median: medianLength,
      max: lengths[lengths.length - 1],
      atMost71: lengths.filter((length) => length <= 71).length,
    },
    runtimeEnglishTitleOverlayCount: runtimeEnglishTitleCount,
    dataEnglishTitleCount: primary.filter((row) => exists(row.titleEn)).length,
    dataEnglishTitleSources: group(primary, 'titleEnSource'),
    publicApprovalReceipts: primary.filter(
      (row) => exists(row.approvalState) || exists(row.editorial),
    ).length,
  },
  archive: {
    total: archive.length,
    uniqueIds: new Set(archive.map((row) => row.id)).size,
    pools: group(archive, 'pool'),
    sources: group(archive, 'source'),
    nonemptyDates: archive.filter((row) => exists(row.date)).length,
    isoDates: archive.filter((row) => isoDate.test(row.date || '')).length,
    metadataPresence: Object.fromEntries(
      fields.map((field) => [field, countPresent(archive, field)]),
    ),
  },
  all: {
    total: ids.length,
    uniqueIds: new Set(ids).size,
    duplicateIds: ids.length - new Set(ids).size,
    bodyFiles: allArticleJson.length,
    indexedBodyFiles: indexedBodies.size,
    tokenizedBodies,
    orphanBodies,
    licenceAssertions: group([...primary, ...archive], 'licence'),
    nonemptyUrls: [...primary, ...archive].filter((row) => exists(row.url)).length,
    pendingVerification: [...primary, ...archive].filter((row) => row.pendingVerification === true)
      .length,
    publicationStatus: {
      approved: 0,
      private: 0,
      draft: 0,
      blockedMissingApprovalReceipt: ids.length,
      note: 'Visibility or a licence assertion is not a human editorial approval receipt.',
    },
  },
  shippedManifestClaim: (await json(path.join(corridor, 'data/manifest.json'))).counts,
  shippedManifestConsistentWithPrimaryCount:
    (await json(path.join(corridor, 'data/manifest.json'))).counts.articleFiles === primary.length,
  generationCommand: `node scripts/reading-r0-audit.mjs --candidate ${candidate} --out ${output}`,
};

// This exact-candidate source census is deliberately an allowlist. A broad
// "entry sheet" or "stroke room" bucket hid missing dynamic/conditional
// controls in the first packet. Keep one named family per source-visible
// behavior and one identically named click-ledger row. The candidate and the
// two deployed JavaScript hashes bind this set; browser/device evidence stays
// independent and may never be inferred from it.
const requiredControlFamilyIds = [
  'ai-reading.generate',
  'ai-reading.history-swap',
  'ai-reading.word-doors',
  'ai-chat.input',
  'ai-chat.send',
  'ai-quiz.navigation',
  'ai-quiz.response',
  'ai-setup.credentials',
  'archive.article-open',
  'archive.error-retry',
  'archive.year-toggles',
  'drift.card-fallback',
  'drift.ginga.closed',
  'drift.ginga.open',
  'drift.surface-judgment',
  'drift.surface-nodes',
  'drift.surface-settings',
  'entry.capture',
  'entry.context-and-lists',
  'entry.field-enter-shelf',
  'entry.field-words',
  'entry.kanji-recursion',
  'entry.other-node-recursion',
  'entry.sentence-recursion',
  'entry.sheet-fixed',
  'entry.word-ai',
  'entry.word-dictionary-choice',
  'entry.word-dictionary-failure-source',
  'entry.word-dictionary-relations',
  'entry.word-recursion',
  'focus.hud-end',
  'focus.lobby',
  'grammar.entries',
  'grammar.filters',
  'global.chrome',
  'kanjidex.handwriting',
  'kanjidex.lenses',
  'kanjidex.part-filters',
  'kanjidex.results',
  'kanjidex.stroke-filters',
  'kanjidex.text-search',
  'lessons.catalog',
  'lessons.finish-capture',
  'lessons.finish-navigation',
  'lessons.learn-navigation',
  'lessons.quiz-navigation',
  'lessons.quiz-response',
  'levels.bulk-capture',
  'levels.entry-doors',
  'probe.answer-grades',
  'probe.front-navigation',
  'probe.summary-navigation',
  'reader.dials',
  'reader.dials-toggle',
  'reader.error-retry',
  'reader.finish',
  'reader.mini-entry',
  'reader.particle-buttons',
  'reader.source-links',
  'reader.token-actions',
  'reader.word-buttons',
  'review.answer-grades',
  'review.answer-navigation',
  'review.front',
  'review.more-navigation',
  'review.more-rest',
  'review.more-undo',
  'review.summary-navigation',
  'review.summary-rest',
  'review.summary-undo',
  'review.wait',
  'shelf.ai-reading-door',
  'shelf.article-details',
  'shelf.article-open',
  'shelf.fixed-doors',
  'shelf.query-results',
  'shelf.search-input',
  'stroke.base',
  'stroke.metadata',
  'stroke.minimal',
  'stroke.standard-full-motion',
  'stroke.standard-reduced-motion',
  'thesaurus.entries',
  'tray.export-import',
  'tray.rest-actions',
  'tray.review-and-items',
  'variant.strip',
  'world.picker',
  'yoji.entries',
  'yoji.filter',
];
const controlCensusPath = path.join(output, 'control-census.json');
const clickLedgerPath = path.join(output, 'click-ledger.jsonl');
const controlCensus = await json(controlCensusPath);
const clickRows = await jsonl(clickLedgerPath);
if (controlCensus.candidate?.sha !== candidate || controlCensus.candidate?.tree !== tree) {
  throw new Error('control census is not bound to the requested candidate and tree');
}
const sourceByPath = new Map(entries.map((entry) => [entry.source, entry]));
for (const binding of controlCensus.sourceBindings || []) {
  const actual = sourceByPath.get(binding.path);
  if (!actual || actual.bytes !== binding.bytes || actual.sha256 !== binding.sha256) {
    throw new Error(`control census source binding mismatch: ${binding.path}`);
  }
}
if ((controlCensus.sourceBindings || []).length !== 2) {
  throw new Error('control census must bind corridor.js and drift-layer.js exactly');
}
const sortedUnique = (values) => [...new Set(values)].sort();
const censusIds = controlCensus.controlFamilies.map((family) => family.controlId);
const controlRows = clickRows.filter((row) => row.row_kind === 'control_family');
const ledgerIds = controlRows.map((row) => row.control_id);
for (const [label, values] of [
  ['required', requiredControlFamilyIds],
  ['census', censusIds],
  ['click ledger', ledgerIds],
]) {
  if (values.length !== new Set(values).size)
    throw new Error(`${label} control IDs are not unique`);
}
const requiredJson = JSON.stringify(sortedUnique(requiredControlFamilyIds));
if (JSON.stringify(sortedUnique(censusIds)) !== requiredJson) {
  throw new Error('control census is missing or adds an unreviewed source family');
}
if (JSON.stringify(sortedUnique(ledgerIds)) !== requiredJson) {
  throw new Error('click ledger does not match the exact source-control family set');
}
const censusEventById = new Map(
  controlCensus.controlFamilies.map((family) => [
    family.controlId,
    family.eventAssertion?.noLearnerEventExpected,
  ]),
);
for (const row of controlRows) {
  if (
    row.candidate !== candidate ||
    row.tree !== tree ||
    !exists(row.fixture) ||
    !exists(row.learner_fixture) ||
    !Array.isArray(row.required_browser_device_lanes) ||
    row.required_browser_device_lanes.length === 0 ||
    typeof row.no_learner_event_expected !== 'boolean' ||
    typeof row.expected_event_present !== 'boolean'
  ) {
    throw new Error(`incomplete click-ledger contract: ${row.control_id}`);
  }
  if (censusEventById.get(row.control_id) !== row.no_learner_event_expected) {
    throw new Error(`event assertion differs between census and ledger: ${row.control_id}`);
  }
  if (
    !row.no_learner_event_expected &&
    (!Array.isArray(row.expected_event) || row.expected_event.length === 0)
  ) {
    throw new Error(`event-bearing row lacks an expected event: ${row.control_id}`);
  }
  if (row.browser_result === 'PASS' || row.overall_result === 'PASS') {
    throw new Error(`source census may not promote browser evidence: ${row.control_id}`);
  }
}

await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, 'artifact-manifest.json'),
  `${JSON.stringify(artifactManifest, null, 2)}\n`,
);
await writeFile(
  path.join(output, 'corpus-census.json'),
  `${JSON.stringify(corpusCensus, null, 2)}\n`,
);

const evidenceFiles = [];
for (const absolute of await walk(output)) {
  const relative = path.relative(output, absolute).split(path.sep).join('/');
  if (relative === 'evidence-manifest.json') continue;
  const bytes = await readFile(absolute);
  evidenceFiles.push({ path: relative, bytes: bytes.byteLength, sha256: sha256(bytes) });
}
evidenceFiles.sort((a, b) => a.path.localeCompare(b.path));
const evidenceManifest = {
  schemaVersion: 1,
  candidate,
  tree,
  selfExcluded: 'evidence-manifest.json',
  fileCount: evidenceFiles.length,
  totalBytes: evidenceFiles.reduce((sum, entry) => sum + entry.bytes, 0),
  files: evidenceFiles,
};
await writeFile(
  path.join(output, 'evidence-manifest.json'),
  `${JSON.stringify(evidenceManifest, null, 2)}\n`,
);
console.log(
  `wrote ${entries.length} projected deployed-file hashes, ${ids.length} article rows, and ${evidenceFiles.length} evidence hashes for ${candidate}`,
);
