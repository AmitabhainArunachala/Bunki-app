import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { constants } from 'node:fs';

export const REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url));
export const AUTHORING = fileURLToPath(new URL('./authoring/', import.meta.url));
export const PUBLIC_BANK = fileURLToPath(new URL('../../data/assessment/', import.meta.url));
const run = promisify(execFile);
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const voiceRolesHash = (roles) =>
  hash(
    JSON.stringify(
      Object.fromEntries(
        Object.keys(roles)
          .sort()
          .map((key) => [key, roles[key]]),
      ),
    ),
  );
const readJSON = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJSON = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
};
const writeImmutableJSON = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  const text = JSON.stringify(value, null, 2) + '\n';
  try {
    await writeFile(path, text, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if ((await readFile(path, 'utf8')) !== text)
      throw new Error('Immutable public artifact collision', { cause: error });
  }
};
const plain = (value) => {
  const payload = { ...value };
  delete payload.revisionId;
  delete payload.sha256;
  return payload;
};
const originalRights = Object.fromEntries(
  ['display', 'retain', 'sync', 'adapt', 'synthesize-audio'].map((operation) => [
    operation,
    {
      status: 'allowed',
      basisRef: 'bunki-original-authoring-20260923',
      policyVersion: 'bunki-original-rights-1',
    },
  ]),
);

let apiPromise;
export function assessmentAPI() {
  return (apiPromise ??= (async () => {
    const compiled = await build({
      stdin: {
        contents:
          "export * from './packages/assessment/src/content.ts'; export { encodeLocalJson } from './packages/persistence/src/replication/json.ts';",
        resolveDir: REPOSITORY,
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      logLevel: 'silent',
    });
    return import(
      `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
    );
  })());
}

export async function boundedAsset(base, path) {
  if (
    typeof path !== 'string' ||
    isAbsolute(path) ||
    !new RegExp('^[A-Za-z0-9_./-]+$', 'u').test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Unsafe asset path');
  const root = await realpath(base);
  const location = resolve(root, path);
  const actual = await realpath(location);
  if (actual !== location || !actual.startsWith(`${root}${sep}`))
    throw new Error('Asset escaped its source directory');
  const info = await stat(actual);
  if (!info.isFile() || info.size < 1 || info.size > 64 * 1024 * 1024)
    throw new Error('Invalid audio asset size');
  return actual;
}

export async function loadAudioManifest(path) {
  if (!path) return new Map();
  const manifest = await readJSON(path);
  if (
    manifest.schema !== 'kairo-assessment-audio-render/1' ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length > 1024
  )
    throw new Error('Invalid audio manifest');
  const result = new Map();
  const assetIds = new Set();
  for (const asset of manifest.assets) {
    if (
      typeof asset.scriptId !== 'string' ||
      result.has(asset.scriptId) ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/u.test(asset.id) ||
      assetIds.has(asset.id)
    )
      throw new Error('Duplicate or invalid audio identity');
    if (
      !['audio/wav', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/webm'].includes(
        asset.mimeType,
      ) ||
      !Number.isInteger(asset.durationMs) ||
      asset.durationMs <= 0
    )
      throw new Error('Invalid audio format or duration');
    if (
      !Array.isArray(asset.voiceIds) ||
      !asset.voiceIds.length ||
      asset.voiceIds.some((id) => typeof id !== 'string' || !id.trim()) ||
      !asset.rightsBasisRef
    )
      throw new Error('Audio provenance missing');
    if (
      !Array.isArray(asset.itemIds) ||
      !asset.itemIds.length ||
      new Set(asset.itemIds).size !== asset.itemIds.length ||
      !/^[a-f0-9]{64}$/u.test(asset.sourceTranscriptSha256) ||
      !/^[a-f0-9]{64}$/u.test(asset.sourceVoiceRolesSha256)
    )
      throw new Error('Audio script pin missing');
    const file = await boundedAsset(dirname(path), asset.path);
    const bytes = await readFile(file);
    if (hash(bytes) !== asset.bytesSha256) throw new Error('Audio hash mismatch');
    const probe = await run(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file],
      { maxBuffer: 1024 * 1024, timeout: 30_000 },
    );
    const measured = JSON.parse(probe.stdout);
    if (
      !measured.streams?.some((stream) => stream.codec_type === 'audio') ||
      measured.streams.some((stream) => stream.codec_type !== 'audio') ||
      !Number.isFinite(Number(measured.format?.duration))
    )
      throw new Error('Audio does not decode as a pure audio asset');
    const actualDuration = Math.round(Number(measured.format.duration) * 1000);
    if (Math.abs(actualDuration - asset.durationMs) > 100)
      throw new Error('Audio duration mismatch');
    assetIds.add(asset.id);
    result.set(asset.scriptId, { ...asset, file, durationMs: actualDuration });
  }
  return result;
}

export function assertListeningTiming(form, delivery) {
  const listeningBlocks = form.timingBlocks.filter((block) =>
    form.sections.some(
      (section) => section.skill === 'listening' && block.sectionIds.includes(section.id),
    ),
  );
  const totals = new Map(listeningBlocks.map((block) => [block.id, new Map()]));
  for (const unit of delivery.units) {
    const blocks = listeningBlocks.filter((block) => {
      const itemIds = form.sections
        .filter((section) => block.sectionIds.includes(section.id))
        .flatMap((section) => section.itemIds);
      return unit.itemIds.some((id) => itemIds.includes(id));
    });
    if (blocks.length !== 1)
      throw new Error(`Listening unit must belong to one timing block: ${unit.id}`);
    const media = form.media.find(
      (entry) => entry.id === unit.media.id && entry.sha256 === unit.media.sha256,
    );
    if (!media || media.kind !== 'audio' || !Number.isSafeInteger(media.durationMs))
      throw new Error(`Listening unit has no measured audio duration: ${unit.id}`);
    // Shared stimuli attached to two scored questions still play once; examples count too.
    totals.get(blocks[0].id).set(`${media.id}:${media.sha256}`, media.durationMs);
  }
  for (const block of listeningBlocks) {
    const recordedDurationMs = [...totals.get(block.id).values()].reduce(
      (total, duration) => total + duration,
      0,
    );
    if (recordedDurationMs > block.durationMs)
      throw new Error(
        `Listening audio exceeds timing block ${block.id}: ${recordedDurationMs}ms of audio exceeds ${block.durationMs}ms deadline`,
      );
  }
  const timing = delivery.listeningTiming;
  if (timing === undefined) return;
  const block = timing.blockId
    ? listeningBlocks.find((entry) => entry.id === timing.blockId)
    : listeningBlocks.length === 1
      ? listeningBlocks[0]
      : null;
  if (!block) throw new Error('Declared listening timing must identify one listening block');
  const recordedDurationMs = [...totals.get(block.id).values()].reduce(
    (total, duration) => total + duration,
    0,
  );
  if (
    timing.recordedDurationMs !== recordedDurationMs ||
    timing.scheduledDurationMs !== block.durationMs ||
    !Number.isSafeInteger(timing.startupTransitionAllowanceMs) ||
    timing.startupTransitionAllowanceMs < 0 ||
    recordedDurationMs + timing.startupTransitionAllowanceMs > block.durationMs
  )
    throw new Error(
      `Declared listening timing or transition allowance is inconsistent: ${block.id}`,
    );
}

/** Full papers display numbered grammar gaps at their position in the current timed block. */
export function assertNumberedGapPositions(form) {
  if (form.scope !== 'full-candidate') return;
  for (const block of form.timingBlocks) {
    const ids = block.sectionIds.flatMap(
      (id) => form.sections.find((section) => section.id === id).itemIds,
    );
    for (const [index, id] of ids.entries()) {
      const item = form.items.find((candidate) => candidate.id === id);
      if (item.task !== 'text-grammar') continue;
      const labels = [...item.prompt.matchAll(/【\s*(\d+)\s*】/gu)].map((match) =>
        Number(match[1]),
      );
      if (labels.length !== 1 || labels[0] !== index + 1)
        throw new Error(`Text-grammar gap must match displayed block position ${index + 1}: ${id}`);
      const passageIds = item.passageIds ?? item.passages.map((ref) => ref.id);
      const marker = new RegExp(`【\\s*${labels[0]}\\s*】`, 'u');
      if (
        !passageIds.some((passageId) =>
          marker.test(form.passages.find((passage) => passage.id === passageId)?.text ?? ''),
        )
      )
        throw new Error(`Text-grammar gap is absent from its referenced passage: ${id}`);
    }
  }
}

export async function materializeForm(input, scripts, assets) {
  const api = await assessmentAPI();
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/u.test(input.id)) throw new Error('Unsafe form ID');
  if (
    input.schema !== 'kairo-assessment-authoring-input/1' ||
    scripts.schema !== 'kairo-assessment-audio-scripts/1' ||
    scripts.formId !== input.id
  )
    throw new Error('Authoring schema mismatch');
  if (!['short', 'medium', 'full'].includes(input.mode) || !/^N[1-5]$/u.test(input.level))
    throw new Error('Invalid authoring mode or level');
  const candidate = input.formPayload;
  if (
    candidate.id !== input.id ||
    candidate.exam.track !== input.level ||
    candidate.provenance.kind !== 'original-ai'
  )
    throw new Error('Unexpected authoring provenance');
  const missing = scripts.units.filter((unit) => !assets.has(unit.id));
  if (missing.length)
    return { form: null, missing: missing.map((unit) => unit.id), delivery: null, assets: [] };
  const passages = candidate.passages.map((passage) =>
    api.createPassageVersion({ ...plain(passage), rights: originalRights }),
  );
  const materializedAssets = [];
  const media = scripts.units.map((unit) => {
    const asset = assets.get(unit.id);
    if (
      asset.sourceTranscriptSha256 !== unit.transcriptSha256 ||
      !unit.voiceRoles ||
      asset.sourceVoiceRolesSha256 !== voiceRolesHash(unit.voiceRoles) ||
      hash(unit.transcript) !== unit.transcriptSha256 ||
      JSON.stringify(asset.itemIds) !== JSON.stringify(unit.itemIds)
    )
      throw new Error(`Audio script mismatch: ${unit.id}`);
    materializedAssets.push(asset);
    return api.createMediaVersion({
      v: 1,
      id: `${input.id}:media:${asset.id}`,
      format: 'kairo-assessment-media',
      kind: 'audio',
      provenance: {
        ...candidate.provenance,
        processRef: `${candidate.provenance.processRef}:audio`,
      },
      rights: Object.fromEntries(
        Object.keys(originalRights).map((operation) => [
          operation,
          {
            status: 'allowed',
            basisRef: asset.rightsBasisRef,
            policyVersion: 'bunki-rendered-audio-rights-1',
          },
        ]),
      ),
      assetId: asset.id,
      bytesSha256: asset.bytesSha256,
      mimeType: asset.mimeType,
      durationMs: asset.durationMs,
      transcript: unit.transcript,
      transcriptSha256: unit.transcriptSha256,
      speakers: asset.voiceIds,
    });
  });
  const questions = scripts.units.filter((unit) => (unit.kind ?? 'question') === 'question');
  const linked = questions.flatMap((unit) => unit.itemIds);
  const listeningIds = candidate.items
    .filter((item) => item.skill === 'listening')
    .map((item) => item.id);
  if (
    new Set(linked).size !== linked.length ||
    listeningIds.length !== linked.length ||
    listeningIds.some((id) => !linked.includes(id))
  )
    throw new Error('Listening delivery does not exactly cover listening items');
  for (const [index, unit] of scripts.units.entries()) {
    if (!['question', 'example'].includes(unit.kind ?? 'question'))
      throw new Error('Unknown listening unit kind');
    if (
      unit.kind === 'example' &&
      (unit.itemIds.length !== 1 ||
        !listeningIds.includes(unit.itemIds[0]) ||
        unit.printedOptions !== false ||
        scripts.units
          .slice(0, index)
          .some((previous) => previous.itemIds.includes(unit.itemIds[0])) ||
        !scripts.units
          .slice(index + 1)
          .some(
            (next) =>
              (next.kind ?? 'question') === 'question' && next.itemIds.includes(unit.itemIds[0]),
          ))
    )
      throw new Error('Example must precede one scored item, with all example choices spoken');
  }
  let items = candidate.items.map((item) => {
    const raw = plain(item);
    const passageIds = raw.passageIds ?? raw.passages.map((ref) => ref.id);
    delete raw.passageIds;
    return api.createItemVersion({
      ...raw,
      rights: originalRights,
      passages: passageIds.map((id) => {
        const passage = passages.find((value) => value.id === id);
        if (!passage) throw new Error('Missing passage');
        return api.artifactReference(passage);
      }),
      media: media
        .filter((_, index) => scripts.units[index].itemIds.includes(item.id))
        .map(api.artifactReference),
    });
  });
  const { learningTargets } = await import('./learning-targets.mjs');
  const resolvedTargets = await learningTargets({ items }, api);
  items = items.map((item) =>
    api.createItemVersion({
      ...plain(item),
      subjects: [
        ...item.subjects.filter((subject) => !/^(?:word|grammar):/u.test(subject)),
        ...resolvedTargets
          .filter((mapping) => mapping.item.id === item.id)
          .flatMap((mapping) => mapping.subjects),
      ],
    }),
  );
  const form = api.createFormVersion({
    ...plain(candidate),
    title: input.titleEn,
    rights: originalRights,
    passages,
    media,
    items,
  });
  const structure = api.inspectFormStructure(form);
  if (!structure.passesKnownChecks)
    throw new Error(`Form structure failed: ${structure.problems.join(', ')}`);
  assertNumberedGapPositions(form);
  const delivery = {
    schema: 'kairo-assessment-bank-delivery/1',
    form: api.artifactReference(form),
    ...(input.listeningTiming ? { listeningTiming: input.listeningTiming } : {}),
    assets: materializedAssets.map((asset) => ({
      assetId: asset.id,
      path: `audio/${asset.bytesSha256}${{ 'audio/wav': '.wav', 'audio/mp4': '.m4a', 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/webm': '.webm' }[asset.mimeType]}`,
      bytesSha256: asset.bytesSha256,
      mimeType: asset.mimeType,
    })),
    units: scripts.units.map((unit, index) => ({
      id: unit.id,
      kind: unit.kind ?? 'question',
      itemIds: unit.itemIds,
      media: api.artifactReference(media[index]),
      printedOptions: unit.printedOptions,
      voiceRoles: unit.voiceRoles,
      stimulusPlayCount: 1,
    })),
  };
  assertListeningTiming(form, delivery);
  return { form, missing: [], delivery, assets: materializedAssets };
}

export function assertSeparateForms(inputs) {
  const seen = new Map();
  const normalize = (text) => text.normalize('NFC').replace(/\s+/gu, '');
  for (const input of inputs) {
    const keys = [
      ...input.formPayload.items
        .filter((item) => item.skill !== 'listening')
        .map(
          (item) =>
            `question:${normalize(item.prompt)}\0${JSON.stringify(item.response.options.map((option) => normalize(option.text)).sort())}`,
        ),
      ...input.formPayload.passages.map((passage) => `passage:${normalize(passage.text)}`),
    ];
    for (const key of new Set(keys)) {
      if (seen.has(key) && seen.get(key) !== input.id)
        throw new Error(`Cross-form exposure: ${input.id} and ${seen.get(key)}`);
      seen.set(key, input.id);
    }
  }
}

export function assertSeparateAudio(packets) {
  const seen = new Map();
  for (const packet of packets)
    for (const unit of packet.units) {
      const digest = hash(unit.transcript.normalize('NFC').replace(/\s+/gu, ''));
      if (seen.has(digest) && seen.get(digest) !== packet.formId)
        throw new Error('Cross-form listening exposure');
      seen.set(digest, packet.formId);
    }
}

/** Useful for early textual findings; its receipts never authorize the later full form. */
export async function materializeWrittenReview(input) {
  const api = await assessmentAPI();
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/u.test(input.id)) throw new Error('Unsafe form ID');
  const candidate = input.formPayload;
  const passages = candidate.passages.map((passage) =>
    api.createPassageVersion({ ...plain(passage), rights: originalRights }),
  );
  const items = candidate.items
    .filter((item) => item.skill !== 'listening')
    .map((item) => {
      const raw = plain(item);
      const passageIds = raw.passageIds ?? raw.passages.map((ref) => ref.id);
      delete raw.passageIds;
      return api.createItemVersion({
        ...raw,
        rights: originalRights,
        passages: passageIds.map((id) =>
          api.artifactReference(passages.find((value) => value.id === id)),
        ),
        media: [],
      });
    });
  return api.createFormVersion({
    ...plain(candidate),
    id: `${candidate.id}:written-review`,
    title: `${input.titleEn} — written editorial review`,
    scope: 'section-practice',
    rights: originalRights,
    items,
    passages,
    media: [],
    sections: candidate.sections.filter((section) => section.skill !== 'listening'),
    timingBlocks: candidate.timingBlocks.filter(
      (block) => !block.sectionIds.includes('section-listening'),
    ),
    authoring: {
      ...candidate.authoring,
      requirements: candidate.authoring.requirements.filter((rule) =>
        items.some((item) => item.task === rule.task),
      ),
    },
  });
}

/** Prepared written-only material bound to its manuscript. Unreviewed authoring material only. */
export async function materializeWrittenSection(prepared, manuscript) {
  const { intent, audio, notes } = prepared;
  if (
    intent.mode !== 'section' ||
    intent.formPayload.scope !== 'section-practice' ||
    intent.formPayload.exam.track !== intent.level ||
    audio.schema !== 'kairo-assessment-audio-scripts/1' ||
    audio.formId !== intent.id ||
    audio.units.length !== 0 ||
    notes.formId !== intent.id ||
    notes.level !== intent.level
  )
    throw new Error('Written section authoring input is inconsistent');
  if (!Buffer.isBuffer(manuscript.bytes) || notes.manuscriptSha256 !== hash(manuscript.bytes))
    throw new Error('Manuscript bytes differ from the prepared authoring input');
  const form = await materializeWrittenReview(intent);
  const basis = intent.formPayload.rights.display.basisRef;
  for (const artifact of [form, ...form.items, ...form.passages])
    if (Object.values(artifact.rights).some((grant) => grant.basisRef !== basis))
      throw new Error(`Written section rights basis differs from its authoring spec: ${artifact.id}`);
  const passageKeys = Object.keys(manuscript.passages);
  if (passageKeys.length !== form.passages.length)
    throw new Error('Mapper did not preserve the manuscript passages');
  const passageMap = passageKeys.map((key) => {
    const passageId = `${intent.id}:passage-${key}`;
    const passage = form.passages.find((candidate) => candidate.id === passageId);
    if (passage?.text !== manuscript.passages[key])
      throw new Error(`Mapper did not preserve manuscript passage ${key}`);
    return { key, passageId, textSha256: passage.textSha256 };
  });
  if (manuscript.items.length !== form.items.length || notes.items.length !== form.items.length)
    throw new Error('Mapper did not preserve the manuscript item count');
  const itemMap = manuscript.items.map((entry, index) => {
    const itemId = `${intent.id}:q${String(index + 1).padStart(2, '0')}`;
    const item = form.items.find((candidate) => candidate.id === itemId);
    const passageIds = (entry.passages ?? (entry.passage ? [entry.passage] : [])).map(
      (key) => `${intent.id}:passage-${key}`,
    );
    if (
      !item ||
      item.skill !== entry.skill ||
      item.task !== entry.task ||
      item.prompt !== entry.prompt ||
      item.rationale !== entry.rationale ||
      item.response.kind !== 'selected' ||
      JSON.stringify(item.response.options.map((option) => option.text)) !==
        JSON.stringify(entry.options) ||
      item.response.answerOptionId !== item.response.options[entry.answer]?.id ||
      JSON.stringify(item.passages.map((reference) => reference.id)) !==
        JSON.stringify(passageIds) ||
      item.media.length !== 0 ||
      notes.items[index].itemId !== itemId ||
      JSON.stringify(notes.items[index].doubts) !== JSON.stringify(entry.doubts ?? [])
    )
      throw new Error(`Mapper did not preserve manuscript item ${index + 1}`);
    return {
      index: index + 1,
      itemId,
      skill: item.skill,
      task: item.task,
      answerOptionId: item.response.answerOptionId,
      promptSha256: hash(item.prompt),
      passageIds,
    };
  });
  const formBytes = Buffer.from(JSON.stringify(form, null, 2) + '\n');
  const formText = formBytes.toString('utf8');
  if (
    formText.includes('"doubts"') ||
    manuscript.items.some((entry) =>
      (entry.doubts ?? []).some((doubt) => formText.includes(JSON.stringify(doubt).slice(1, -1))),
    )
  )
    throw new Error('Author doubts leaked into the learner form');
  const files = {
    'intent.json': Buffer.from(JSON.stringify(intent, null, 2) + '\n'),
    'audio-scripts.json': Buffer.from(JSON.stringify(audio, null, 2) + '\n'),
    'authoring-notes.json': Buffer.from(JSON.stringify(notes, null, 2) + '\n'),
    'form.json': formBytes,
  };
  const block = intent.formPayload.timingBlocks[0];
  const binding = {
    schema: 'kairo-written-section-binding/1',
    status: 'unreviewed-authoring-material',
    level: intent.level,
    manuscript: {
      sha256: notes.manuscriptSha256,
      authorModelFamily: notes.authorModelFamily,
    },
    authoringNotes: {
      path: 'authoring-notes.json',
      sha256: hash(files['authoring-notes.json']),
    },
    intent: { path: 'intent.json', sha256: hash(files['intent.json']) },
    timing: {
      minutes: intent.durationMinutes,
      authority: block.authority,
      basis: 'author-selected practice allocation; not official timing',
    },
    items: itemMap,
    passages: passageMap,
    form: {
      path: 'form.json',
      id: form.id,
      revisionId: form.revisionId,
      sha256: form.sha256,
      bytesSha256: hash(formBytes),
    },
  };
  files['binding.json'] = Buffer.from(JSON.stringify(binding, null, 2) + '\n');
  return { form, binding, files };
}

// Each admitted section is deliberately independent of native mock assembly.
// Its immutable ID and digests are admission constraints, not editable publication metadata.
// A level whose id/sha256/bytesSha256 are null has no admitted section and cannot publish.
const WRITTEN_COUNT_SKILLS = ['vocabulary', 'grammar', 'reading', 'listening'];
const DIGEST = /^[a-f0-9]{64}$/u;
const writtenPin = (pin) =>
  Object.freeze({
    ...pin,
    skillCounts: Object.freeze({ ...pin.skillCounts }),
    sharesQuestionsWith: Object.freeze([...pin.sharesQuestionsWith]),
    forbiddenTasks: Object.freeze([...pin.forbiddenTasks]),
    authorFamilyIds: Object.freeze([...pin.authorFamilyIds]),
  });
const twelveWritten = { vocabulary: 4, grammar: 4, reading: 4, listening: 0 };
export const REVIEWED_WRITTEN = Object.freeze({
  N2: writtenPin({
    level: 'N2',
    id: 'kairo-original-jlpt-n2-short-01:written-review',
    sha256: '56d6ea3b6024cd04447a72c36640ee99c672808d93bcd22f7ccdb4c1e2c198a2',
    bytesSha256: '2806699c318d0b74fdb2fdb3e45aac85f05ba857da8e81687b082039ce2418fc',
    filenameStem: 'kairo-original-jlpt-n2-written-12-01',
    sourceId: 'bunki-original-n2-20260923',
    processRef: 'codex-original-n2-practice-20260923',
    rightsBasis: 'bunki-original-authoring-20260923',
    publicationRoute: 'exact-reviewed-written-section/1',
    titleJa: 'N2 文字・語彙・文法・読解の練習 · 12問',
    titleEn: 'N2 written practice · 12 questions',
    questionCount: 12,
    durationMinutes: 15,
    skillCounts: twelveWritten,
    sharesQuestionsWith: ['kairo-original-jlpt-n2-short-01'],
    forbiddenTasks: [],
    authorFamilyIds: ['openai'],
  }),
  // Unfilled until the exact mapped form has independent collector evidence and
  // John's editorial acceptance. 19 minutes is an authoring allocation, not official timing.
  N1: writtenPin({
    level: 'N1',
    id: null,
    sha256: null,
    bytesSha256: null,
    filenameStem: 'kairo-original-jlpt-n1-written-12-01',
    sourceId: 'bunki-original-n1-20260925',
    processRef: 'claude-original-n1-practice-20260925',
    rightsBasis: 'bunki-original-authoring-20260923',
    publicationRoute: 'exact-reviewed-written-section/1',
    titleJa: 'N1 文字・語彙・文法・読解の練習 · 12問',
    titleEn: 'N1 written practice · 12 questions',
    questionCount: 12,
    durationMinutes: 19,
    skillCounts: twelveWritten,
    sharesQuestionsWith: [],
    forbiddenTasks: ['orthography'],
    authorFamilyIds: ['anthropic'],
  }),
});
/** Compatibility alias for callers that predate level-keyed pins. */
export const REVIEWED_N2_WRITTEN = REVIEWED_WRITTEN.N2;

function assertWrittenPinTable(pins) {
  for (const [level, pin] of Object.entries(pins)) {
    if (!/^N[1-5]$/u.test(level) || pin?.level !== level)
      throw new Error(`Written pin table is inconsistent at ${level}`);
    const unfilled = pin.id === null && pin.sha256 === null && pin.bytesSha256 === null;
    if (
      !unfilled &&
      (typeof pin.id !== 'string' || !DIGEST.test(pin.sha256) || !DIGEST.test(pin.bytesSha256))
    )
      throw new Error(`Written pin for ${level} is partially filled`);
  }
  return pins;
}
assertWrittenPinTable(REVIEWED_WRITTEN);

/** Never falls back: an unknown level or an unfilled pin fails before any publication step. */
export function admittedWrittenPin(level, pins = REVIEWED_WRITTEN) {
  if (typeof level !== 'string' || !Object.hasOwn(pins, level))
    throw new Error(`Unknown written section level: ${String(level)}`);
  const pin = pins[level];
  if (pin.level !== level) throw new Error(`Written pin level mismatch: ${level}`);
  if (pin.id === null || pin.sha256 === null || pin.bytesSha256 === null)
    throw new Error(`No admitted written section is pinned for ${level}`);
  return pin;
}

/** The collector disqualifies author-family receipts only for families its host policy names. */
export function assertReviewPolicyExcludesAuthor(policy, pin) {
  const named = new Set(
    (Array.isArray(policy?.authorFamilyIds) ? policy.authorFamilyIds : [])
      .filter((id) => typeof id === 'string')
      .map((id) => id.toLowerCase()),
  );
  const missing = pin.authorFamilyIds.filter((id) => !named.has(id.toLowerCase()));
  if (!pin.authorFamilyIds.length || missing.length)
    throw new Error(
      `Review policy does not exclude the ${pin.level} author family: ${missing.join(', ') || 'none pinned'}`,
    );
}

/** A native rebuild keeps each admitted written section once, and nothing it does not pin. */
export function retainedWrittenEntries(entries, pins = REVIEWED_WRITTEN) {
  const admitted = Object.values(assertWrittenPinTable(pins)).filter((pin) => pin.sha256 !== null);
  const kept = new Map();
  for (const entry of entries ?? [])
    if (
      !kept.has(entry.id) &&
      admitted.some(
        (pin) =>
          entry.id === pin.id &&
          entry.level === pin.level &&
          entry.formSha256 === pin.sha256 &&
          entry.publicationRoute === pin.publicationRoute &&
          entry.mode === 'section' &&
          entry.availability?.ready === true,
      )
    )
      kept.set(entry.id, entry);
  return [...kept.values()];
}

/** Public expectation: one ready entry per admitted level, and no other ready entry. */
export function admittedWrittenSections(catalog, pins = REVIEWED_WRITTEN) {
  const rows = Object.values(assertWrittenPinTable(pins))
    .filter((pin) => pin.sha256 !== null)
    .map((pin) => {
      const matches = catalog.entries.filter((entry) => entry.id === pin.id);
      const entry = matches[0];
      if (
        matches.length !== 1 ||
        entry.availability?.ready !== true ||
        entry.review?.status !== 'ai-reviewed' ||
        entry.level !== pin.level ||
        entry.mode !== 'section' ||
        entry.formSha256 !== pin.sha256 ||
        entry.titleEn !== pin.titleEn ||
        entry.questionCount !== pin.questionCount ||
        entry.durationMinutes !== pin.durationMinutes ||
        JSON.stringify(entry.skillCounts) !== JSON.stringify(pin.skillCounts) ||
        entry.officialScoreCalibrated !== false
      )
        throw new Error(`Public written section does not match its ${pin.level} pin`);
      return { pin, entry };
    });
  const ready = catalog.entries.filter((entry) => entry.availability?.ready).length;
  if (ready !== rows.length)
    throw new Error(`Expected ${rows.length} ready written sections, found ${ready} ready entries`);
  return rows;
}

export function assertMediaFreeWrittenDelivery(form, delivery, review) {
  if (
    form.scope !== 'section-practice' ||
    form.media.length !== 0 ||
    form.items.some((item) => item.media.length !== 0 || item.skill === 'listening') ||
    form.sections.some((section) => section.skill === 'listening') ||
    delivery.schema !== 'kairo-assessment-bank-delivery/1' ||
    Object.keys(delivery).sort().join(',') !== 'assets,form,schema,units' ||
    !Array.isArray(delivery.assets) ||
    delivery.assets.length !== 0 ||
    !Array.isArray(delivery.units) ||
    delivery.units.length !== 0 ||
    delivery.form?.kind !== 'form' ||
    delivery.form.id !== form.id ||
    delivery.form.sha256 !== form.sha256 ||
    delivery.form.revisionId !== form.revisionId ||
    review.presentationSha256 !== null
  )
    throw new Error('Null presentation is allowed only for a strictly media-free written section');
}

function assertOriginalWrittenRights(form, registry, pin) {
  const source = registry.sources?.find((entry) => entry.id === pin.sourceId);
  if (
    registry.schema !== 'kairo-assessment-sources/1' ||
    source?.sourceClass !== 'original-ai' ||
    source.distribution !== 'public-candidate' ||
    source.rightsBasis !== pin.rightsBasis ||
    source.processRef !== pin.processRef
  )
    throw new Error('Written section source rights are not established');
  for (const artifact of [form, ...form.items, ...form.passages]) {
    if (
      artifact.provenance.kind !== 'original-ai' ||
      artifact.provenance.processRef !== source.processRef ||
      artifact.provenance.sources.length !== 0 ||
      ['display', 'retain', 'sync', 'adapt'].some(
        (operation) =>
          artifact.rights[operation]?.status !== 'allowed' ||
          artifact.rights[operation]?.basisRef !== source.rightsBasis ||
          !artifact.rights[operation]?.policyVersion,
      )
    )
      throw new Error(`Written section artifact lacks original public rights: ${artifact.id}`);
  }
}

/**
 * Binds publication to a pin table. Production uses only publishReviewedWrittenPractice, bound to
 * the frozen REVIEWED_WRITTEN; a different table is for isolated fixture directories only.
 */
export function writtenSectionPublisher(pins) {
  assertWrittenPinTable(pins);
  /** Trusted host callback must re-verify saved runtime evidence; bank JSON is not authority. */
  return async function publishWrittenSection(options) {
    // Omitting level keeps the pre-level N2 contract; any other value must name a filled pin.
    const pin = admittedWrittenPin(options.level === undefined ? 'N2' : options.level, pins);
    return publishPinnedWrittenSection(pin, options);
  };
}

async function publishPinnedWrittenSection(pin, options) {
  const api = await assessmentAPI();
  const formBytes = options.formBytes;
  if (!Buffer.isBuffer(formBytes)) throw new Error('Exact original form bytes are required');
  if (hash(formBytes) !== pin.bytesSha256)
    throw new Error('Written publication must preserve the exact reviewed form bytes');
  const form = api.parseFormVersion(JSON.parse(formBytes.toString('utf8')));
  if (form.id !== pin.id || form.sha256 !== pin.sha256)
    throw new Error('Written publication requires the exact independently reviewed form');
  if (form.exam.family !== 'jlpt' || form.exam.track !== pin.level)
    throw new Error(`Written section track ${form.exam.track} does not match its ${pin.level} pin`);
  const skillCounts = Object.fromEntries(
    WRITTEN_COUNT_SKILLS.map((skill) => [
      skill,
      form.items.filter((item) => item.skill === skill).length,
    ]),
  );
  if (
    form.items.length !== pin.questionCount ||
    WRITTEN_COUNT_SKILLS.some((skill) => skillCounts[skill] !== pin.skillCounts[skill]) ||
    form.timingBlocks.reduce((total, block) => total + block.durationMs, 0) !==
      pin.durationMinutes * 60_000
  )
    throw new Error(`Written section does not match its declared ${pin.questionCount}-question scope`);
  const excluded = form.items.find((item) => pin.forbiddenTasks.includes(item.task));
  if (excluded)
    throw new Error(`Written section contains a task its ${pin.level} pin excludes: ${excluded.task}`);
  const publicDirectory = options.publicDirectory ?? PUBLIC_BANK;
  const previous = await readJSON(join(publicDirectory, 'catalog.json'));
  if (
    previous.schema !== 'kairo-assessment-catalog/1' ||
    !Array.isArray(previous.entries) ||
    !Array.isArray(previous.archivedEntries)
  )
    throw new Error('An existing valid assessment catalog is required');
  const sources = await readJSON(join(publicDirectory, 'sources.json'));
  assertOriginalWrittenRights(form, sources, pin);
  if (typeof options.reviewForm !== 'function')
    throw new Error('A trusted current host review is required');
  const review = await options.reviewForm(form);
  if (
    review?.form?.kind !== 'form' ||
    review.form.id !== form.id ||
    review.form.sha256 !== form.sha256 ||
    review.form.revisionId !== form.revisionId ||
    review.productionEligible !== true ||
    review.status !== 'ai-reviewed-practice' ||
    typeof review.authorityPolicyVersion !== 'string' ||
    !review.authorityPolicyVersion ||
    !Array.isArray(review.decisionRevisionIds) ||
    review.decisionRevisionIds.length === 0 ||
    review.decisionRevisionIds.some(
      (id) => !/^assessment-ai-editorial-v2:[a-f0-9]{64}$/u.test(id),
    ) ||
    !Array.isArray(review.problems) ||
    review.problems.length !== 0 ||
    !Array.isArray(review.rejectedRuntimeReceipts) ||
    review.rejectedRuntimeReceipts.length !== 0 ||
    !Array.isArray(review.rejectedResolutionRuntimeReceipts) ||
    review.rejectedResolutionRuntimeReceipts.length !== 0 ||
    review.officialScoreCalibrated !== false
  )
    throw new Error('Current host review does not admit this exact written section');
  const delivery = {
    schema: 'kairo-assessment-bank-delivery/1',
    form: api.artifactReference(form),
    assets: [],
    units: [],
  };
  assertMediaFreeWrittenDelivery(form, delivery, review);
  const deliverySha256 = api.encodeLocalJson(delivery).sha256;
  const stem = pin.filenameStem;
  const entry = {
    id: form.id,
    level: pin.level,
    mode: 'section',
    titleJa: pin.titleJa,
    titleEn: pin.titleEn,
    questionCount: pin.questionCount,
    durationMinutes: pin.durationMinutes,
    skillCounts,
    sourceClass: 'original-ai',
    sourceIds: [pin.sourceId],
    publicationRoute: pin.publicationRoute,
    sharesQuestionsWith: [...pin.sharesQuestionsWith],
    formPath: `forms/${stem}-${form.sha256}.json`,
    formSha256: form.sha256,
    editorialAtStart: {
      status: review.status,
      policyVersion: review.authorityPolicyVersion,
      decisionRevisionIds: review.decisionRevisionIds,
    },
    deliveryPath: `delivery/${stem}-${deliverySha256}.json`,
    deliverySha256,
    mediaAssets: [],
    review: {
      status: 'ai-reviewed',
      evidencePath: `reviews/${stem}-${api.encodeLocalJson(review).sha256}.json`,
    },
    availability: { ready: true, reasons: [] },
    scoreMethod: 'raw-practice-results',
    officialScoreCalibrated: false,
  };
  const prior = previous.entries.find((candidate) => candidate.id === form.id);
  if (prior && JSON.stringify(prior) !== JSON.stringify(entry))
    throw new Error('Existing written publication differs; explicit revision handling required');
  const entries = prior ? previous.entries : [...previous.entries, entry];
  const catalog = {
    ...previous,
    entries,
    revision: hash(JSON.stringify({ entries, archivedEntries: previous.archivedEntries ?? [] })),
  };
  if (options.publish === true) {
    const destination = join(publicDirectory, entry.formPath);
    await mkdir(dirname(destination), { recursive: true });
    try {
      await writeFile(destination, formBytes, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!(await readFile(destination)).equals(formBytes))
        throw new Error('Immutable written form bytes differ', { cause: error });
    }
    await writeImmutableJSON(join(publicDirectory, entry.deliveryPath), delivery);
    await writeImmutableJSON(join(publicDirectory, entry.review.evidencePath), review);
    await writeJSON(join(publicDirectory, 'catalog.json'), catalog);
  }
  return {
    catalog,
    entry,
    form,
    delivery,
    review,
    formBytesSha256: hash(formBytes),
    published: options.publish === true,
  };
}
export const publishReviewedWrittenPractice = writtenSectionPublisher(REVIEWED_WRITTEN);

/** reviewForm is trusted host code. Imported bank JSON never supplies this capability. */
export async function buildAssessmentBank(options = {}) {
  const directories =
    options.directories ??
    (await readdir(AUTHORING))
      .filter((name) => /^n[1-5]-(?:short|medium|full)-\d{2}$/u.test(name))
      .sort();
  const evidence =
    options.evidenceDirectory ??
    join(homedir(), '.dharma/bunki_assessment/2026-09-23/bank-candidates');
  const publicDirectory = options.publicDirectory ?? PUBLIC_BANK;
  let previous = { entries: [], archivedEntries: [] };
  try {
    previous = await readJSON(join(publicDirectory, 'catalog.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const assets = options.assets ?? (await loadAudioManifest(options.audioManifest));
  const inputs = await Promise.all(
    directories.map((directory) => readJSON(join(AUTHORING, directory, 'intent.json'))),
  );
  const scriptPackets = await Promise.all(
    directories.map((directory) => readJSON(join(AUTHORING, directory, 'audio-scripts.json'))),
  );
  assertSeparateForms(inputs);
  assertSeparateAudio(scriptPackets);
  const entries = [];
  const { encodeLocalJson } = await assessmentAPI();
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    await writeJSON(
      join(evidence, `${input.id}.written-review.form.json`),
      await materializeWrittenReview(input),
    );
    const scripts = scriptPackets[i];
    const result = await materializeForm(input, scripts, assets);
    await writeJSON(join(evidence, `${input.id}.candidate-status.json`), {
      schema: 'kairo-assessment-candidate-status/1',
      authoringInputSha256: hash(JSON.stringify(input)),
      audioScriptsSha256: hash(JSON.stringify(scripts)),
      nativeFormSha256: result.form?.sha256 ?? null,
      missingAudioUnits: result.missing,
      note: 'Earlier files in this evidence directory are historical unless their form hash matches this current status.',
    });
    let review = null;
    if (result.form) {
      await writeJSON(join(evidence, `${input.id}.form.json`), result.form);
      await writeJSON(join(evidence, `${input.id}.delivery.json`), result.delivery);
      review = options.reviewForm ? await options.reviewForm(result.form, result.delivery) : null;
      if (
        review &&
        (review.form.sha256 !== result.form.sha256 ||
          review.form.id !== result.form.id ||
          review.form.revisionId !== result.form.revisionId)
      )
        throw new Error('Review does not pin this form');
    }
    const ready =
      review?.productionEligible === true &&
      ['ai-reviewed-practice', 'ai-reviewed-full'].includes(review.status);
    if (
      ready &&
      (typeof review.authorityPolicyVersion !== 'string' ||
        !review.authorityPolicyVersion ||
        !Array.isArray(review.decisionRevisionIds) ||
        !review.decisionRevisionIds.length)
    )
      throw new Error('Eligible review is missing its authority or decision pins');
    if (ready && input.mode === 'full' && review.status !== 'ai-reviewed-full')
      throw new Error('Full form lacks full review');
    const formPath = ready ? `forms/${input.id}-${result.form.sha256}.json` : null;
    const deliverySha256 = ready ? encodeLocalJson(result.delivery).sha256 : null;
    if (ready && review.presentationSha256 !== deliverySha256)
      throw new Error('Review does not pin the delivery presentation');
    const deliveryPath = ready ? `delivery/${input.id}-${deliverySha256}.json` : null;
    const reviewPath = ready ? `reviews/${input.id}-${encodeLocalJson(review).sha256}.json` : null;
    if (
      ready &&
      [...(previous.entries ?? []), ...(previous.archivedEntries ?? [])].some(
        (entry) =>
          entry.availability?.ready &&
          entry.id === input.id &&
          entry.formSha256 === result.form.sha256 &&
          entry.deliverySha256 !== deliverySha256,
      )
    )
      throw new Error(
        'An admitted form cannot change delivery metadata without a new form revision',
      );
    if (ready) {
      await writeImmutableJSON(join(publicDirectory, formPath), result.form);
      await writeImmutableJSON(join(publicDirectory, deliveryPath), result.delivery);
      await writeImmutableJSON(join(publicDirectory, reviewPath), review);
      for (const asset of result.assets) {
        const extension = {
          'audio/wav': '.wav',
          'audio/mp4': '.m4a',
          'audio/mpeg': '.mp3',
          'audio/ogg': '.ogg',
          'audio/webm': '.webm',
        }[asset.mimeType];
        await mkdir(join(publicDirectory, 'audio'), { recursive: true });
        const destination = join(publicDirectory, 'audio', `${asset.bytesSha256}${extension}`);
        try {
          await copyFile(asset.file, destination, constants.COPYFILE_EXCL);
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          if (hash(await readFile(destination)) !== asset.bytesSha256)
            throw new Error('Immutable public audio collision', { cause: error });
        }
      }
    }
    entries.push({
      id: input.id,
      level: input.level,
      mode: input.mode,
      titleJa: input.titleJa,
      titleEn: input.titleEn,
      questionCount: input.formPayload.items.length,
      durationMinutes: input.durationMinutes,
      ...(input.listeningTiming ? { listeningTiming: input.listeningTiming } : {}),
      skillCounts: Object.fromEntries(
        ['vocabulary', 'grammar', 'reading', 'listening'].map((skill) => [
          skill,
          input.formPayload.items.filter((item) => item.skill === skill).length,
        ]),
      ),
      sourceClass: 'original-ai',
      sourceIds: [
        ...input.sourceIds,
        ...(result.assets.some(
          (asset) => asset.rightsBasisRef === 'kairo-local-tts-voices-20260923',
        )
          ? ['kairo-local-tts-voices-20260923']
          : []),
        ...(result.assets.some((asset) => asset.voiceIds.includes('koharune-ami'))
          ? ['voice-koharune-ami']
          : []),
        ...(result.assets.some((asset) =>
          asset.voiceIds.some((id) => /^jvnv-[FM][12]-jp$/u.test(id)),
        )
          ? ['voice-jvnv-sbv2']
          : []),
      ],
      formPath,
      formSha256: ready ? result.form.sha256 : null,
      editorialAtStart: ready
        ? {
            status: review.status,
            policyVersion: review.authorityPolicyVersion,
            decisionRevisionIds: review.decisionRevisionIds,
          }
        : null,
      deliveryPath,
      deliverySha256,
      mediaAssets: ready ? result.delivery.assets : [],
      review: {
        status: ready ? 'ai-reviewed' : 'pending',
        evidencePath: reviewPath,
      },
      availability: {
        ready,
        reasons: ready
          ? []
          : [
              ...(result.missing.length ? ['listening-audio-pending'] : []),
              ...(review?.problems ?? ['independent-editorial-review-pending']),
            ],
      },
      scoreMethod: 'raw-practice-results',
      officialScoreCalibrated: false,
    });
  }
  // A later native-mock build must not withdraw any separately admitted written section.
  // writtenPins is a fixture seam; production rebuilds use the frozen REVIEWED_WRITTEN.
  entries.push(
    ...retainedWrittenEntries(previous.entries, options.writtenPins ?? REVIEWED_WRITTEN),
  );
  const archives = new Map();
  for (const entry of [...(previous.archivedEntries ?? []), ...(previous.entries ?? [])]) {
    if (
      entry.availability?.ready &&
      entry.formSha256 &&
      !entries.some(
        (current) =>
          current.availability.ready &&
          current.id === entry.id &&
          current.formSha256 === entry.formSha256,
      )
    ) {
      archives.set(`${entry.id}:${entry.formSha256}`, entry);
    }
  }
  const archivedEntries = [...archives.values()];
  const catalog = {
    schema: 'kairo-assessment-catalog/1',
    revision: hash(JSON.stringify({ entries, archivedEntries })),
    entries,
    archivedEntries,
    archivalPolicy:
      'Admitted revisions remain addressable by form ID and SHA-256. Immutable form, delivery, review and audio files are retained for saved attempts and learning cards; a new catalog version does not delete them.',
    targetDistinctFullFormsPerLevel: 5,
    levels: ['N5', 'N4', 'N3', 'N2', 'N1'].map((level) => ({
      level,
      readyFullForms: entries.filter(
        (entry) => entry.level === level && entry.mode === 'full' && entry.availability.ready,
      ).length,
      authoredFullForms: entries.filter((entry) => entry.level === level && entry.mode === 'full')
        .length,
    })),
  };
  await writeJSON(join(publicDirectory, 'catalog.json'), catalog);
  return catalog;
}
