/** Source-bound Bunki audio fixture builder for the frozen shared-audio contract.
 *
 * This helper deliberately does not synthesize speech, call a provider, play
 * audio, or read learner data. It decodes the actual Bunki content from the
 * mounted source worktree, selects one narrow n2 vocabulary task, projects the
 * canonical study-audio source plan, and binds three real native synthetic
 * `.m4a` byte streams into a fresh QA-only release under the caller's output
 * directory. The release is a single-task fixture, not whole-catalog coverage.
 */
import {createHash} from 'node:crypto';
import {
  chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, statSync, writeSync,
} from 'node:fs';
import {isAbsolute, join, relative, resolve, dirname} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';

const FIXTURE_FORMAT = 'bunki-source-bound-audio-fixture/v1';
const PROTOCOL = 'nsrs-audio-resources/v1';
const ROOT_FORMAT = 'nihongo-audio-release';
const PLACEMENT_FORMAT = 'nihongo-audio-placements';
const CLIP_FORMAT = 'nihongo-audio-clips';
const PACK_FORMAT = 'nihongo-audio-pack';
const ROUTING = 'sha256-first-byte-mod64-v1';
const PROJECTION_ID = 'private:bunki-audio-qa';
const PROFILE_ID = 'bunki-audio-qa-local-fixture';
const PROFILE = Object.freeze({
  providerRoute: 'local-fixture',
  model: 'local-fixture',
  voice: 'local-fixture',
  settings: Object.freeze({
    fixture: 'synthetic-tone-not-speech',
    acoustic: 'unreviewed',
  }),
});
const HEX = /^[0-9a-f]{64}$/;
const MAX_ROOT_BYTES = 64 * 1024;
const MAX_SHARD_BYTES = 1024 * 1024;
const MAX_CLIP_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 4096;
const CLIP_NAMES = Object.freeze(['term', 'first-sentence', 'remainder']);

const fail = message => {
  throw new Error(message);
};
const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const nonempty = value => typeof value === 'string' && /\S/u.test(value);
const utf8 = value => Buffer.from(value, 'utf8');
const sha256Hex = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const hashFile = path => sha256Hex(readFileSync(path));
const jsonBytes = value => utf8(JSON.stringify(value));
const refFor = (key, bytes) => Object.freeze({key, sha256: sha256Hex(bytes), bytes: bytes.byteLength});
const assertHex = (value, label) => {
  if (typeof value !== 'string' || !HEX.test(value)) fail(`${label} must be a lower-case SHA-256`);
  return value;
};
const within = (base, target) => {
  const path = relative(base, target);
  return path.length > 0 && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
    path !== '..' && !isAbsolute(path);
};
const pathExists = path => {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};
const assertAbsent = (path, label) => {
  if (pathExists(path)) fail(`${label} already exists; refusing to overwrite: ${path}`);
};

/** Locate the frozen content pin without assuming a particular checkout layout. */
function findPin(repo) {
  const candidates = [
    join(repo, 'scripts/shared-study-pin.json'),
    join(repo, 'shared-study-pin.json'),
    join(repo, 'prototypes/corridor/shared-study-pin.json'),
  ];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  fail('shared-study pin not found');
}

/** Recursively enumerate regular `.m4a` files. Symlinks are never followed. */
function findM4aFiles(directory) {
  const files = [];
  const walk = current => {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of readdirSync(current)) walk(join(current, name));
      return;
    }
    if (stat.isFile() && current.toLowerCase().endsWith('.m4a')) files.push(current);
  };
  walk(directory);
  files.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return files;
}

/** Split at the first full stop, keeping the full stop in the first sentence. */
function passageSplit(ja) {
  const firstStop = ja.indexOf('。');
  if (firstStop < 0) return null;
  const firstSentence = ja.slice(0, firstStop + 1);
  const remainder = ja.slice(firstStop + 1);
  if (!nonempty(firstSentence) || !nonempty(remainder)) return null;
  // A "multi-sentence" passage must have at least one further sentence stop.
  if (!remainder.includes('。')) return null;
  const firstBytes = utf8(firstSentence);
  const remainderBytes = utf8(remainder);
  const sourceBytes = utf8(ja);
  if (Buffer.compare(Buffer.concat([firstBytes, remainderBytes]), sourceBytes) !== 0) {
    fail('passage split does not reconstruct the exact source bytes');
  }
  return {
    firstSentence,
    remainder,
    firstBytes,
    remainderBytes,
    sourceBytes,
    firstCodepoints: Array.from(firstSentence).length,
    totalCodepoints: Array.from(ja).length,
  };
}

const directiveFits = (directive, codepointLength) =>
  Number.isSafeInteger(directive.start) && Number.isSafeInteger(directive.end) &&
  directive.start >= 0 && directive.end > directive.start &&
  directive.end <= codepointLength && nonempty(directive.reading);

const relativeDirectives = (directives, offset) => directives.map(directive => ({
  start: directive.start - offset,
  end: directive.end - offset,
  reading: directive.reading,
}));

/** Select the first actual n2 vocabulary entry whose term and ja fields are
 * ready without pending reasons and whose reviewed reading spans fit the
 * required first-sentence/remainder split without crossing it. */
function selectSource(catalog, studyAudioSourcePlan, createSpeechInput) {
  for (const entry of catalog) {
    if (!isPlain(entry) || entry.contentReady !== true) continue;
    if (entry.player?.deckId !== 'n2') continue;
    if (entry.contractId !== 'vocabulary.read.v1') continue;
    if (typeof entry.taskKey !== 'string' || typeof entry.contentRevision !== 'string') continue;
    if (!HEX.test(entry.contentRevision)) continue;
    const term = entry.term;
    const ja = entry.ja;
    if (!nonempty(term) || !nonempty(ja)) continue;
    const split = passageSplit(ja);
    if (!split) continue;
    let plan;
    try {
      plan = studyAudioSourcePlan(entry);
    } catch {
      continue;
    }
    if (!plan || !Array.isArray(plan.sourceFields) || !HEX.test(plan.audioContentRevision ?? '')) continue;
    const termField = plan.sourceFields.find(field => field?.fieldId === 'term');
    const jaField = plan.sourceFields.find(field => field?.fieldId === 'ja');
    if (!termField || !jaField) continue;
    if (termField.language !== 'ja' || jaField.language !== 'ja') continue;
    if (termField.text !== term || jaField.text !== ja) continue;
    if (termField.pendingReasons.length !== 0 || jaField.pendingReasons.length !== 0) continue;
    const termCodepoints = Array.from(term).length;
    const termDirectives = termField.pronunciationDirectives;
    const jaDirectives = jaField.pronunciationDirectives;
    if (!termDirectives.length || !jaDirectives.length) continue;
    if (!termDirectives.every(directive => directiveFits(directive, termCodepoints))) continue;
    if (!jaDirectives.every(directive => directiveFits(directive, split.totalCodepoints))) continue;
    const firstDirectives = jaDirectives.filter(directive => directive.end <= split.firstCodepoints);
    const remainderDirectives = jaDirectives.filter(directive => directive.start >= split.firstCodepoints);
    // A directive crossing the sentence boundary cannot be represented in
    // either per-segment relative coordinate space.
    if (firstDirectives.length + remainderDirectives.length !== jaDirectives.length) continue;
    // Exercise relative-coordinate movement in both passage clips.
    if (!firstDirectives.length || !remainderDirectives.length) continue;
    const termSpeech = createSpeechInput({
      segments: [{
        language: 'ja',
        text: term,
        pronunciationDirectives: relativeDirectives(termDirectives, 0),
      }],
      profile: PROFILE,
    });
    const firstSpeech = createSpeechInput({
      segments: [{
        language: 'ja',
        text: split.firstSentence,
        pronunciationDirectives: relativeDirectives(firstDirectives, 0),
      }],
      profile: PROFILE,
    });
    const remainderSpeech = createSpeechInput({
      segments: [{
        language: 'ja',
        text: split.remainder,
        pronunciationDirectives: relativeDirectives(remainderDirectives, split.firstCodepoints),
      }],
      profile: PROFILE,
    });
    return {
      entry,
      plan,
      split,
      termField,
      jaField,
      termSpeech,
      firstSpeech,
      remainderSpeech,
      firstDirectiveCount: firstDirectives.length,
      remainderDirectiveCount: remainderDirectives.length,
    };
  }
  fail('no usable n2 vocabulary.read.v1 entry with split-compatible reviewed readings');
}

function rowFor({taskKey, contentRevision, audioContentRevision, fieldId, text, sourceSha256,
  sourceBytes, segments}) {
  if (!Array.isArray(segments) || segments.length === 0) fail('verified placement requires segments');
  return {
    taskKey,
    contentRevision,
    audioContentRevision,
    fieldId,
    supportedReadingId: null,
    profileId: PROFILE_ID,
    language: 'ja',
    sourceSha256,
    sourceBytes,
    state: 'verified',
    packId: null, // filled by caller with the narrow QA pack ID
    segments,
  };
}

function writeExclusive(path, bytes, mode = 0o644) {
  const descriptor = openSync(path, 'wx', mode);
  try {
    writeSync(descriptor, bytes);
  } finally {
    closeSync(descriptor);
  }
}

/** Build one source-bound QA fixture release.
 *
 * Required inputs are explicit paths: `repo` (Bunki source worktree),
 * `engineExport` (verified engine distribution), `mediaDirectory` (native
 * synthetic `.m4a` bytes), and `output` (a new directory under the configured
 * judge output root). `expectedClosure` is the independent engine closure pin.
 */
export async function createBunkiAudioFixture({
  repo,
  engineExport,
  mediaDirectory,
  output,
  expectedClosure,
} = {}) {
  if (![repo, engineExport, mediaDirectory, output].every(value => typeof value === 'string' && value.length > 0)) {
    fail('repo, engineExport, mediaDirectory and output are required paths');
  }
  assertHex(expectedClosure, 'expectedClosure');
  const repoRoot = resolve(repo);
  const engineRoot = resolve(engineExport);
  const mediaRoot = resolve(mediaDirectory);
  const outputRoot = resolve(output);
  const runtimeRoot=realpathSync(join(homedir(),'.dharma'));
  if(!within(runtimeRoot,outputRoot))fail('output must be under ~/.dharma');
  let ancestor=dirname(outputRoot);
  while(!pathExists(ancestor))ancestor=dirname(ancestor);
  if(realpathSync(ancestor)!==ancestor)fail('output ancestor must not be a symlink');
  if (!statSync(repoRoot).isDirectory()) fail('repo must be a directory');
  if (!statSync(mediaRoot).isDirectory()) fail('mediaDirectory must be a directory');

  const judgeBase = process.env.BUNKI_AUDIO_JUDGE_OUT;
  if (typeof judgeBase === 'string' && judgeBase.length > 0 && !within(resolve(judgeBase), outputRoot)) {
    fail('output must be a new directory below BUNKI_AUDIO_JUDGE_OUT');
  }

  // The export closure is independently pinned by the caller and checked by the
  // distribution verifier; the distribution manifest is never the authority.
  const pinPath = findPin(repoRoot);
  const pin = readJson(pinPath);
  if (pin.format !== 'bunki-shared-study-pin/v1') fail('unexpected shared-study pin format');
  const engineVerifierPath = join(engineRoot, 'tools/verify_engine.mjs');
  if (hashFile(engineVerifierPath) !== pin.verifierSha256)
    fail('Canonical verifier differs from reviewed Bunki pin');
  const {verifyEngineDistribution} = await import(pathToFileURL(engineVerifierPath));
  const manifest = verifyEngineDistribution(engineRoot, {expectedClosureSha256: expectedClosure});
  if (manifest.closureSha256 !== expectedClosure) fail('engine closure differs from expectedClosure');

  const {studyAudioSourcePlan} = await import(pathToFileURL(join(engineRoot, 'client/app/study-audio.mjs')));
  const {createSpeechInput} = await import(pathToFileURL(join(engineRoot, 'client/audio/speech-input.mjs')));
  const {audioBucket} = await import(pathToFileURL(join(engineRoot, 'client/app/audio-release.mjs')));
  const {sha256} = await import(pathToFileURL(join(engineRoot, 'client/schema/event.mjs')));
  const {passageReadingLedgerSha256} = await import(pathToFileURL(join(engineRoot, 'client/player/passage-reading-rules.mjs')));

  // Frozen Bunki content: four packs + binding + pin, decoded by the actual
  // source module rather than a copied or reimplemented reader.
  const {decodeSharedContent, SHARED_DECKS} = await import(
    pathToFileURL(join(repoRoot, 'prototypes/corridor/shared-study-content.mjs'))
  );
  const sourceDir = join(repoRoot, 'prototypes/corridor');
  const bindingPath = join(sourceDir, 'data/shared-study-content.json');
  const binding = readJson(bindingPath);
  const bindingSha256 = hashFile(bindingPath);
  if (pin.contentBindingSha256 !== bindingSha256) fail('shared-study binding does not match the frozen pin');
  if (binding.format !== 'bunki-shared-content/v1' || !Array.isArray(binding.rows)) {
    fail('unexpected shared-study binding format');
  }
  const decks = {};
  const deckProvenance = {};
  for (const id of SHARED_DECKS) {
    const path = join(sourceDir, `decks/${id}/deck.json`);
    const sha256Value = hashFile(path);
    const declared = binding.packs?.[id]?.sha256;
    if (declared !== sha256Value) fail(`frozen ${id} pack does not match the binding`);
    decks[id] = readJson(path);
    deckProvenance[id] = {path, sha256: sha256Value, cards: binding.packs[id].cards};
  }
  const fsrsPinPath = join(sourceDir, 'vendor/shared-study-engine/client/vendor/fsrs-pin.json');
  const fsrsPin = existsSync(fsrsPinPath) ? readJson(fsrsPinPath) : pin;
  const content = decodeSharedContent(binding, decks, fsrsPin);

  const verifierPath = join(sourceDir, 'shared-study-content.mjs');
  const verifierSha256 = hashFile(verifierPath);
  const registryPath = join(sourceDir, 'data/shared-study/registry.json');
  const grammarPath = join(sourceDir, 'data/shared-study/grammar.json');
  const dictionaryPath = join(sourceDir, 'data/shared-study/dictionary.json.gz');
  const buildPath = join(sourceDir, 'data/shared-study/BUILD.json');
  const registrySha256 = hashFile(registryPath);
  const grammarSha256 = hashFile(grammarPath);
  const dictionarySha256 = hashFile(dictionaryPath);
  const buildSha256 = hashFile(buildPath);
  const catalogIdentity = assertHex(binding.source?.catalogSha256, 'binding.source.catalogSha256');
  if (binding.source?.registrySha256 !== registrySha256) fail('registry source hash does not match the binding');
  if (binding.grammarAssets?.['registry.json'] !== registrySha256) fail('grammar registry hash does not match');
  if (binding.grammarAssets?.['grammar.json'] !== grammarSha256) fail('grammar source hash does not match the binding');
  if (binding.dictionary?.sha256 !== dictionarySha256) fail('dictionary source hash does not match the binding');
  if (binding.dictionary?.buildSha256 !== buildSha256) fail('dictionary build hash does not match the binding');
  const identities = Object.freeze({
    catalog: catalogIdentity,
    registry: registrySha256,
    grammar: grammarSha256,
    dictionary: dictionarySha256,
  });

  const selected = selectSource(content.catalog, studyAudioSourcePlan, createSpeechInput);
  const {entry, plan, split, termSpeech, firstSpeech, remainderSpeech} = selected;
  if (entry.taskKey === undefined) fail('selected entry has no taskKey');
  const taskKey = entry.taskKey;
  const contentRevision = entry.contentRevision;
  const audioContentRevision = plan.audioContentRevision;

  // Use only real `.m4a` bytes. Distinct hashes are required so the three
  // ordered clips and the pack closure have three independent media refs.
  const mediaCandidates = [];
  for (const path of findM4aFiles(mediaRoot)) {
    const bytes = readFileSync(path);
    if (bytes.byteLength === 0) continue;
    if (bytes.byteLength > MAX_CLIP_BYTES) fail(`media file exceeds the clip limit: ${path}`);
    const digest = sha256Hex(bytes);
    mediaCandidates.push({path, bytes, sha256: digest, relativePath: relative(mediaRoot, path)});
  }
  const distinctMedia = [];
  const seenMedia = new Set();
  for (const media of mediaCandidates) {
    if (seenMedia.has(media.sha256)) continue;
    seenMedia.add(media.sha256);
    distinctMedia.push(media);
  }
  if (distinctMedia.length < 3) fail('mediaDirectory must contain at least three distinct .m4a byte streams');
  const selectedMedia = distinctMedia.slice(0, 3).map((media, index) => Object.freeze({
    ...media,
    clip: CLIP_NAMES[index],
    ref: refFor(`media/${media.sha256}.m4a`, media.bytes),
  }));

  const termBytes = utf8(entry.term);
  const jaBytes = split.sourceBytes;
  if (termBytes.byteLength !== Buffer.byteLength(entry.term, 'utf8')) fail('term byte length mismatch');
  if (jaBytes.byteLength !== Buffer.byteLength(entry.ja, 'utf8')) fail('ja byte length mismatch');
  const firstOffset = split.firstBytes.byteLength;
  const totalBytesLength = jaBytes.byteLength;
  if (firstOffset + split.remainderBytes.byteLength !== totalBytesLength) fail('passage byte split mismatch');

  const packId = `bunki-audio-qa-${sha256(taskKey).slice(0, 12)}`;

  const termRow = rowFor({
    taskKey,
    contentRevision,
    audioContentRevision,
    fieldId: 'term',
    text: entry.term,
    sourceSha256: sha256(entry.term),
    sourceBytes: termBytes.byteLength,
    segments: [{
      start: 0,
      end: termBytes.byteLength,
      inputKey: termSpeech.inputKey,
      speechInput: termSpeech,
    }],
  });
  termRow.packId = packId;
  const jaRow = rowFor({
    taskKey,
    contentRevision,
    audioContentRevision,
    fieldId: 'ja',
    text: entry.ja,
    sourceSha256: sha256(entry.ja),
    sourceBytes: totalBytesLength,
    segments: [{
      start: 0,
      end: firstOffset,
      inputKey: firstSpeech.inputKey,
      speechInput: firstSpeech,
    }, {
      start: firstOffset,
      end: totalBytesLength,
      inputKey: remainderSpeech.inputKey,
      speechInput: remainderSpeech,
    }],
  });
  jaRow.packId = packId;

  const placementBucket = audioBucket(taskKey);
  const placementShard = {
    format: PLACEMENT_FORMAT,
    version: 1,
    contentRelease: `sha256:${bindingSha256}`,
    projectionId: PROJECTION_ID,
    bucket: placementBucket,
    rows: [termRow, jaRow],
  };
  const placementBytes = jsonBytes(placementShard);
  if (placementBytes.byteLength > MAX_SHARD_BYTES) fail('placement shard exceeds the contract bound');
  if (placementShard.rows.length > MAX_ROWS) fail('placement shard has too many rows');
  const placementRef = refFor('placements/task.json', placementBytes);

  const clipRows = [
    {
      inputKey: termSpeech.inputKey,
      ref: selectedMedia[0].ref,
      codec: 'm4a',
      mime: 'audio/mp4',
      profileId: PROFILE_ID,
      verification: 'verified',
      acoustic: 'unreviewed',
    },
    {
      inputKey: firstSpeech.inputKey,
      ref: selectedMedia[1].ref,
      codec: 'm4a',
      mime: 'audio/mp4',
      profileId: PROFILE_ID,
      verification: 'verified',
      acoustic: 'unreviewed',
    },
    {
      inputKey: remainderSpeech.inputKey,
      ref: selectedMedia[2].ref,
      codec: 'm4a',
      mime: 'audio/mp4',
      profileId: PROFILE_ID,
      verification: 'verified',
      acoustic: 'unreviewed',
    },
  ];
  const clipRowsByBucket = new Map();
  for (const row of clipRows) {
    const bucket = parseInt(row.inputKey.slice(0, 2), 16) % 64;
    if (!clipRowsByBucket.has(bucket)) clipRowsByBucket.set(bucket, []);
    clipRowsByBucket.get(bucket).push(row);
  }
  const clipShards = [...clipRowsByBucket.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucket, rows]) => {
      const ordered = rows.slice().sort((a, b) => a.inputKey < b.inputKey ? -1 : a.inputKey > b.inputKey ? 1 : 0);
      const shard = {
        format: CLIP_FORMAT,
        version: 1,
        contentRelease: `sha256:${bindingSha256}`,
        projectionId: PROJECTION_ID,
        bucket,
        rows: ordered,
      };
      const bytes = jsonBytes(shard);
      if (bytes.byteLength > MAX_SHARD_BYTES) fail('clip shard exceeds the contract bound');
      if (shard.rows.length > MAX_ROWS) fail('clip shard has too many rows');
      return {bucket, bytes, ref: refFor(`clips/${bucket}.json`, bytes)};
    });

  const packResourceRefs = [
    placementRef,
    ...clipShards.map(shard => shard.ref),
    ...selectedMedia.map(media => media.ref),
  ];
  const uniqueKeys = new Set();
  for (const ref of packResourceRefs) {
    if (ref.key === 'root.json' || uniqueKeys.has(ref.key)) fail('pack index resource key is not unique');
    uniqueKeys.add(ref.key);
  }
  const packTotalBytes = packResourceRefs.reduce((total, ref) => total + ref.bytes, 0);
  const packIndex = {
    format: PACK_FORMAT,
    version: 1,
    contentRelease: `sha256:${bindingSha256}`,
    projectionId: PROJECTION_ID,
    id: packId,
    resources: packResourceRefs,
    totalBytes: packTotalBytes,
  };
  const packIndexBytes = jsonBytes(packIndex);
  if (packIndexBytes.byteLength > MAX_SHARD_BYTES) fail('pack index exceeds the contract bound');
  const packIndexRef = refFor(`packs/${packId}.json`, packIndexBytes);

  const root = {
    format: ROOT_FORMAT,
    version: 1,
    capability: PROTOCOL,
    contentRelease: `sha256:${bindingSha256}`,
    projectionId: PROJECTION_ID,
    identities,
    correctionLedgerRevision: passageReadingLedgerSha256,
    routing: ROUTING,
    defaultProfileId: PROFILE_ID,
    profiles: [{id: PROFILE_ID, profile: PROFILE}],
    placementShards: [{bucket: placementBucket, ref: placementRef}],
    clipShards: clipShards.map(shard => ({bucket: shard.bucket, ref: shard.ref})),
    packs: [{id: packId, ref: packIndexRef, totalBytes: packTotalBytes}],
  };
  const rootBytes = jsonBytes(root);
  if (rootBytes.byteLength > MAX_ROOT_BYTES) fail('root exceeds the contract bound');
  const rootRef = refFor('root.json', rootBytes);
  const release = Object.freeze({
    releaseId: `sha256:${rootRef.sha256}`,
    projectionId: PROJECTION_ID,
    contentRelease: root.contentRelease,
    root: rootRef,
  });

  // Compute every byte before creating the output directory, so failed
  // selection or verification never leaves a partial release behind.
  const expectedClipSha256 = clipRows.map(row => row.ref.sha256);
  const provenance = {
    source: {
      repo: repoRoot,
      pin: {
        path: pinPath,
        sha256: hashFile(pinPath),
        format: pin.format,
        sourceCommit: pin.sourceCommit,
        closureSha256: pin.closureSha256,
        contentBindingSha256: pin.contentBindingSha256,
        verifierSha256: pin.verifierSha256,
      },
      binding: {path: bindingPath, sha256: bindingSha256},
      fsrsPin: {
        path: fsrsPinPath,
        sha256: existsSync(fsrsPinPath) ? hashFile(fsrsPinPath) : hashFile(pinPath),
      },
      verifier: {
        path: verifierPath,
        sha256: verifierSha256,
        pinMatches: pin.verifierSha256 === verifierSha256,
      },
      decks: deckProvenance,
      identities,
      identitySources: {
        catalog: 'binding.source.catalogSha256 (source catalog.json is not mounted in this worktree)',
        registry: 'prototypes/corridor/data/shared-study/registry.json',
        grammar: 'prototypes/corridor/data/shared-study/grammar.json',
        dictionary: 'prototypes/corridor/data/shared-study/dictionary.json.gz',
      },
      counts: binding.counts,
    },
    export: {
      directory: engineRoot,
      expectedClosureSha256: expectedClosure,
      closureSha256: manifest.closureSha256,
      closureFormat: manifest.closureFormat,
      entry: manifest.entry,
      source: manifest.source,
      files: manifest.files.length,
    },
    sourceTask: {
      taskKey,
      contentRevision,
      audioContentRevision,
      deckId: entry.player.deckId,
      contractId: entry.contractId,
      fieldIds: ['term', 'ja'],
      term: entry.term,
      ja: entry.ja,
      firstSentence: split.firstSentence,
      remainder: split.remainder,
      termBytes: termBytes.byteLength,
      firstSentenceBytes: firstOffset,
      remainderBytes: split.remainderBytes.byteLength,
      sourceBytes: totalBytesLength,
      termDirectives: termSpeech.segments[0].pronunciationDirectives.length,
      firstSentenceDirectives: selected.firstDirectiveCount,
      remainderDirectives: selected.remainderDirectiveCount,
      selection: 'first decoded n2 vocabulary.read.v1 entry with ready term/ja fields, multi-sentence ja, and non-crossing reviewed reading spans',
    },
    media: {
      directory: mediaRoot,
      discoveredM4aFiles: mediaCandidates.length,
      distinctMediaHashes: distinctMedia.length,
      selected: selectedMedia.map(media => ({
        clip: media.clip,
        path: media.path,
        relativePath: media.relativePath,
        sha256: media.sha256,
        bytes: media.bytes.byteLength,
        outputKey: media.ref.key,
      })),
    },
    pack: {
      id: packId,
      projectionId: PROJECTION_ID,
      contentRelease: root.contentRelease,
      fullCatalogCoverage: false,
      coverage: 'one selected source task only',
      acoustic: 'unreviewed',
      profile: {
        id: PROFILE_ID,
        providerRoute: PROFILE.providerRoute,
        model: PROFILE.model,
        voice: PROFILE.voice,
        settings: PROFILE.settings,
      },
      resources: packResourceRefs.length,
      totalBytes: packTotalBytes,
    },
    guarantees: {
      providerRequests: false,
      network: false,
      audiblePlayback: false,
      learnerData: false,
      syntheticToneBytesOnly: true,
      providerClaim: 'none',
      acoustic: 'unreviewed',
    },
  };

  const fixture = {
    format: FIXTURE_FORMAT,
    taskKey,
    entry,
    sourcePlan: plan,
    release,
    packId,
    profileId: PROFILE_ID,
    expectedClipSha256,
    provenance,
  };

  // Exclusive, non-symlink output tree. Repeated calls refuse to overwrite.
  assertAbsent(outputRoot, 'output');
  mkdirSync(outputRoot);
  const packDir = join(outputRoot, 'pack');
  assertAbsent(packDir, 'output/pack');
  mkdirSync(packDir);
  for (const name of ['placements', 'clips', 'packs', 'media']) {
    const directory = join(packDir, name);
    assertAbsent(directory, `output/pack/${name}`);
    mkdirSync(directory);
  }

  for (const media of selectedMedia) {
    writeExclusive(join(packDir, media.ref.key), media.bytes);
  }
  writeExclusive(join(packDir, placementRef.key), placementBytes);
  for (const shard of clipShards) writeExclusive(join(packDir, shard.ref.key), shard.bytes);
  writeExclusive(join(packDir, packIndexRef.key), packIndexBytes);
  const rootPath = join(packDir, rootRef.key);
  writeExclusive(rootPath, rootBytes);
  chmodSync(rootPath, 0o444);
  writeExclusive(join(outputRoot, 'fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`);

  return fixture;
}
