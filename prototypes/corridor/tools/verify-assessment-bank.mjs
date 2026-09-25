#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, symlink, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  AUTHORING,
  PUBLIC_BANK,
  REVIEWED_N2_WRITTEN,
  assessmentAPI,
  assertMediaFreeWrittenDelivery,
  assertListeningTiming,
  assertNumberedGapPositions,
  assertSeparateForms,
  boundedAsset,
  buildAssessmentBank,
  hash,
  loadAudioManifest,
  materializeForm,
  materializeWrittenReview,
  publishReviewedWrittenPractice,
  voiceRolesHash,
} from './assessment/bank.mjs';
import { importSource, sourceURL, validateSourceRequest } from './assessment/source-import.mjs';
import { learningTargets } from './assessment/learning-targets.mjs';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';

const evidenceRoot = process.env.KAIRO_EVIDENCE_DIR
  ? resolveCorridorEvidence()
  : join(homedir(), '.dharma/bunki_assessment/verification');
await mkdir(evidenceRoot, { recursive: true });
const evidence = await mkdtemp(join(evidenceRoot, 'bank-'));
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
}
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const api = await assessmentAPI();
const inputs = await Promise.all(
  ['n2-full-01', 'n2-short-01', 'n2-medium-01'].map((directory) =>
    read(join(AUTHORING, directory, 'intent.json')),
  ),
);
const scripts = await Promise.all(
  ['n2-full-01', 'n2-short-01', 'n2-medium-01'].map((directory) =>
    read(join(AUTHORING, directory, 'audio-scripts.json')),
  ),
);

await check('Preserved original N2 draft copies retain their source bytes', async () => {
  const origin = await read(join(AUTHORING, 'n2-full-01/origin.json'));
  for (const file of origin.files) {
    const bytes = await readFile(join(AUTHORING, 'n2-full-01', file.file));
    assert.equal(bytes.length, file.bytes);
    assert.equal(hash(bytes), file.sha256);
  }
});

await check('N2 authored counts and genuine separate forms', () => {
  assert.deepEqual(
    inputs.map((input) => input.formPayload.items.length),
    [107, 16, 40],
  );
  assertSeparateForms(inputs);
  assert.throws(
    () => assertSeparateForms([inputs[0], { ...inputs[0], id: 'different-form' }]),
    /Cross-form exposure/u,
  );
  const shuffledClone = structuredClone(inputs[0]);
  shuffledClone.id = 'shuffled-clone';
  shuffledClone.formPayload.items.forEach((item) => item.response.options.reverse());
  assert.throws(() => assertSeparateForms([inputs[0], shuffledClone]), /Cross-form exposure/u);
  const seen = new Set();
  for (let index = 0; index < inputs.length; index++) {
    assert.deepEqual(
      [...new Set(inputs[index].formPayload.items.map((item) => item.skill))].sort(),
      ['grammar', 'listening', 'reading', 'vocabulary'],
    );
    for (const unit of scripts[index].units) {
      assert.equal(hash(unit.transcript), unit.transcriptSha256);
      assert(!seen.has(unit.transcriptSha256), 'Listening stimulus reused across forms');
      seen.add(unit.transcriptSha256);
    }
  }
});
await check(
  'Full N2 follows its declared 2018 workbook allocation, including reading breadth',
  () => {
    const form = inputs[0].formPayload;
    // Official N2 guidebook p8/printed7 and 2018 answer key: approximate counts,
    // adopted here as this particular form's authored allocation, not universal constants.
    const expected = {
      'kanji-reading': 5,
      orthography: 5,
      'word-formation': 5,
      'contextual-expression': 7,
      paraphrase: 5,
      usage: 5,
      'grammar-form': 12,
      'sentence-composition': 5,
      'text-grammar': 5,
      'short-reading': 5,
      'mid-reading': 9,
      'integrated-reading': 2,
      'claim-reading': 3,
      'information-retrieval': 2,
      'listening-task': 5,
      'listening-point': 6,
      'listening-gist': 5,
      'listening-response': 12,
      'listening-integrated': 4,
    };
    for (const [task, count] of Object.entries(expected))
      assert.equal(form.items.filter((item) => item.task === task).length, count, task);
    for (const [task, passageCount] of [
      ['short-reading', 5],
      ['mid-reading', 3],
    ]) {
      const ids = new Set(
        form.items
          .filter((item) => item.task === task)
          .flatMap((item) => item.passageIds ?? item.passages.map((ref) => ref.id)),
      );
      assert.equal(ids.size, passageCount, `${task} passage breadth`);
    }
  },
);
await check('Full-form numbered grammar gaps match the visible question position', () => {
  assertNumberedGapPositions(inputs[0].formPayload);
  const stale = structuredClone(inputs[0].formPayload);
  const question = stale.items.find((item) => item.task === 'text-grammar');
  question.prompt = question.prompt.replace('【50】', '【46】');
  assert.throws(() => assertNumberedGapPositions(stale), /displayed block position 50/u);
  const missing = structuredClone(inputs[0].formPayload);
  const passage = missing.passages.find((item) => item.id.endsWith(':p-text'));
  passage.text = passage.text.replace('【50】', '【99】');
  assert.throws(() => assertNumberedGapPositions(missing), /absent from its referenced passage/u);
  assertNumberedGapPositions(inputs[1].formPayload);
});
await check('N2 integrated audio plays once for linked questions', () => {
  assert.equal(scripts[0].units.length, 36);
  const scored = scripts[0].units.filter((unit) => unit.kind === 'question');
  assert.equal(scored.length, 31);
  assert.equal(scored.flatMap((unit) => unit.itemIds).length, 32);
  assert.equal(scripts[0].units.filter((unit) => unit.kind === 'example').length, 5);
  assert.equal(scripts[0].units.filter((unit) => unit.itemIds.length === 2).length, 1);
});
await check('Written candidates are real native versions and reject tampering', async () => {
  for (const input of inputs) {
    const form = await materializeWrittenReview(input);
    assert.equal(api.parseFormVersion(form).sha256, form.sha256);
    assert.throws(() => api.parseFormVersion({ ...form, title: 'Changed after review' }));
  }
});
await check('Null presentation permits only an empty media-free written delivery', async () => {
  const form = await materializeWrittenReview(inputs[1]);
  assert.equal(form.sha256, REVIEWED_N2_WRITTEN.sha256);
  const delivery = {
    schema: 'kairo-assessment-bank-delivery/1',
    form: api.artifactReference(form),
    assets: [],
    units: [],
  };
  const review = { presentationSha256: null };
  assertMediaFreeWrittenDelivery(form, delivery, review);
  for (const altered of [
    { ...form, scope: 'full-candidate' },
    { ...form, media: [{}] },
    { ...form, items: [{ ...form.items[0], media: [{}] }, ...form.items.slice(1)] },
    { ...form, items: [{ ...form.items[0], skill: 'listening' }, ...form.items.slice(1)] },
  ])
    assert.throws(() => assertMediaFreeWrittenDelivery(altered, delivery, review), /media-free/u);
  for (const altered of [
    { ...delivery, assets: [{}] },
    { ...delivery, units: [{}] },
    { ...delivery, printedOptions: false },
    { ...delivery, form: { ...delivery.form, sha256: '0'.repeat(64) } },
  ])
    assert.throws(() => assertMediaFreeWrittenDelivery(form, altered, review), /media-free/u);
  assert.throws(
    () => assertMediaFreeWrittenDelivery(form, delivery, { presentationSha256: '0'.repeat(64) }),
    /media-free/u,
  );
});
await check('Narrow written publication preserves pending mocks and exact form bytes', async () => {
  const site = join(evidence, 'fixture-only-written-publication');
  await mkdir(site);
  const previous = await read(join(PUBLIC_BANK, 'catalog.json'));
  previous.entries = previous.entries.filter((entry) => entry.id !== REVIEWED_N2_WRITTEN.id);
  const sources = await read(join(PUBLIC_BANK, 'sources.json'));
  await writeFile(join(site, 'catalog.json'), JSON.stringify(previous));
  await writeFile(join(site, 'sources.json'), JSON.stringify(sources));
  const form = await materializeWrittenReview(inputs[1]);
  const formBytes = Buffer.from(JSON.stringify(form, null, 2) + '\n');
  // Synthetic authority tests packaging in an isolated directory. It never admits product data.
  const syntheticReview = {
    form: api.artifactReference(form),
    presentationSha256: null,
    status: 'ai-reviewed-practice',
    productionEligible: true,
    authorityPolicyVersion: 'test-only-host',
    decisionRevisionIds: [`assessment-ai-editorial-v2:${'1'.repeat(64)}`],
    problems: [],
    rejectedRuntimeReceipts: [],
    rejectedResolutionRuntimeReceipts: [],
    officialScoreCalibrated: false,
  };
  const options = { formBytes, publicDirectory: site, reviewForm: async () => syntheticReview };
  const preview = await publishReviewedWrittenPractice(options);
  assert.equal(preview.published, false);
  assert.deepEqual((await readdir(site)).sort(), ['catalog.json', 'sources.json']);
  const result = await publishReviewedWrittenPractice({ ...options, publish: true });
  assert.deepEqual(result.catalog.entries.slice(0, previous.entries.length), previous.entries);
  assert.deepEqual(result.catalog.archivedEntries, previous.archivedEntries);
  assert.deepEqual(await readFile(join(site, result.entry.formPath)), formBytes);
  assert.equal(result.entry.mode, 'section');
  assert.equal(result.entry.durationMinutes, 15);
  assert.equal(result.entry.questionCount, 12);
  assert.equal(result.entry.skillCounts.listening, 0);
  assert.equal(result.entry.formPath.includes(':'), false);
  assert.equal(result.entry.deliverySha256, api.encodeLocalJson(result.delivery).sha256);
  const again = await publishReviewedWrittenPractice({ ...options, publish: true });
  assert.deepEqual(again.catalog, result.catalog);
  // An empty native fixture rebuild assembles no mock and must retain the independent section.
  const laterNativeFixture = await buildAssessmentBank({
    directories: [],
    assets: new Map(),
    publicDirectory: site,
    evidenceDirectory: join(evidence, 'empty-native-fixture'),
  });
  assert.deepEqual(
    laterNativeFixture.entries.find((entry) => entry.id === form.id),
    result.entry,
  );
  await assert.rejects(
    publishReviewedWrittenPractice({ ...options, reviewForm: undefined }),
    /trusted current host review/u,
  );
  await assert.rejects(
    publishReviewedWrittenPractice({ ...options, formBytes: Buffer.from(JSON.stringify(form)) }),
    /exact reviewed form bytes/u,
  );
  for (const patch of [
    { form: { ...syntheticReview.form, sha256: '0'.repeat(64) } },
    { productionEligible: false },
    { rejectedRuntimeReceipts: [{ reason: 'fixture-stale-runtime' }] },
    { rejectedResolutionRuntimeReceipts: [{ reason: 'fixture-stale-resolution' }] },
    { problems: ['fixture-open-editorial-concern'] },
  ])
    await assert.rejects(
      publishReviewedWrittenPractice({
        ...options,
        reviewForm: async () => ({ ...syntheticReview, ...patch }),
      }),
      /does not admit/u,
    );
  await assert.rejects(
    publishReviewedWrittenPractice({
      ...options,
      formBytes: Buffer.from(JSON.stringify({ ...form, title: 'Changed' })),
    }),
  );
  const deniedSources = structuredClone(sources);
  deniedSources.sources.find((source) => source.id === REVIEWED_N2_WRITTEN.sourceId).distribution =
    'personal';
  await writeFile(join(site, 'sources.json'), JSON.stringify(deniedSources));
  await assert.rejects(
    publishReviewedWrittenPractice(options),
    /source rights are not established/u,
  );
});
await check(
  'Shipped written section retains reviewed bytes and its strictly limited scope',
  async () => {
    const catalog = await read(join(PUBLIC_BANK, 'catalog.json'));
    const entry = catalog.entries.find((candidate) => candidate.id === REVIEWED_N2_WRITTEN.id);
    assert(entry?.availability.ready);
    assert.equal(entry.mode, 'section');
    assert.equal(entry.titleEn, 'N2 written practice · 12 questions');
    assert.equal(entry.formSha256, REVIEWED_N2_WRITTEN.sha256);
    const formBytes = await readFile(await boundedAsset(PUBLIC_BANK, entry.formPath));
    assert.equal(hash(formBytes), REVIEWED_N2_WRITTEN.bytesSha256);
    const form = api.parseFormVersion(JSON.parse(formBytes.toString('utf8')));
    const delivery = await read(await boundedAsset(PUBLIC_BANK, entry.deliveryPath));
    const review = await read(await boundedAsset(PUBLIC_BANK, entry.review.evidencePath));
    assertMediaFreeWrittenDelivery(form, delivery, review);
    assert.equal(entry.deliverySha256, api.encodeLocalJson(delivery).sha256);
    assert.equal(entry.editorialAtStart.status, 'ai-reviewed-practice');
    assert.deepEqual(entry.editorialAtStart.decisionRevisionIds, review.decisionRevisionIds);
    assert.equal(review.productionEligible, true);
    assert.equal(review.form.sha256, form.sha256);
    assert.deepEqual(review.problems, []);
    assert.deepEqual(review.rejectedRuntimeReceipts, []);
    assert.deepEqual(entry.mediaAssets, []);
    assert.equal(form.items.length, 12);
    assert.deepEqual(entry.skillCounts, { vocabulary: 4, grammar: 4, reading: 4, listening: 0 });
    assert.equal(entry.durationMinutes, 15);
    assert.equal(entry.officialScoreCalibrated, false);
  },
);
await check('No audio placeholders can make a full form', async () => {
  const result = await materializeForm(inputs[0], scripts[0], new Map());
  assert.equal(result.form, null);
  assert.equal(result.missing.length, 36);
});
await check('Dictionary mappings pin tested item versions only', async () => {
  const form = await materializeWrittenReview(inputs[0]);
  const mappings = await learningTargets(form, api);
  assert(mappings.length > 10);
  for (const mapping of mappings) {
    const item = form.items.find((item) => item.id === mapping.item.id);
    assert.deepEqual(mapping.item, api.artifactReference(item));
    assert(mapping.subjects.length === 1 && /^(?:word|grammar):/u.test(mapping.subjects[0]));
    assert.match(mapping.dictionarySha256, /^[a-f0-9]{64}$/u);
  }
});
const request = {
  id: 'source-fixture',
  title: 'Source fixture',
  edition: 'test only',
  location: 'page 1',
  rightsBasis: 'test fixture',
  kind: 'pdf',
  distribution: 'personal',
  file: join(evidence, 'source.pdf'),
};
await check('Importer refuses unsafe identities and public self-approval', () => {
  assert.throws(() => validateSourceRequest({ ...request, id: '../escape' }), /Invalid source ID/u);
  assert.throws(
    () => validateSourceRequest({ ...request, distribution: 'public' }),
    /explicit redistribution grant/u,
  );
  assert.throws(() => sourceURL('http://www.jlpt.jp/test.pdf'));
  assert.throws(() => sourceURL('https://user:password@www.jlpt.jp/test.pdf'));
  assert.throws(() => sourceURL('https://127.0.0.1/test.pdf'));
  assert.throws(() => sourceURL('https://www.jlpt.jp.attacker.example/test.pdf'));
});
await check('Importer preserves private immutable bytes and actual hash', async () => {
  const bytes = Buffer.from('%PDF-1.7\nsource fixture only\n');
  await writeFile(request.file, bytes);
  const receipt = await importSource(request, { store: join(evidence, 'private-store') });
  assert.equal(receipt.sha256, hash(bytes));
  assert.equal(receipt.distribution, 'personal');
  assert.equal(receipt.publicGrant, null);
  assert.equal(receipt.review, 'not-established');
  assert.equal(receipt.extraction, 'not-performed');
  assert.equal(
    hash(await readFile(join(evidence, 'private-store', receipt.id, receipt.asset))),
    receipt.sha256,
  );
  await assert.rejects(
    importSource(
      { ...request, expectedSha256: '0'.repeat(64) },
      { store: join(evidence, 'private-store') },
    ),
    /digest mismatch/u,
  );
  await assert.rejects(importSource(request, { store: PUBLIC_BANK }), /outside the repository/u);
});
await check('Importer rejects wrong content signatures and excessive download size', async () => {
  await writeFile(join(evidence, 'not-a-pdf.txt'), '<html>Not a PDF</html>');
  await assert.rejects(
    importSource(
      { ...request, file: join(evidence, 'not-a-pdf.txt') },
      { store: join(evidence, 'private-store') },
    ),
    /PDF signature mismatch/u,
  );
  const networkRequest = { ...request, file: undefined, url: 'https://www.jlpt.jp/source.pdf' };
  await assert.rejects(
    importSource(networkRequest, {
      store: join(evidence, 'private-store'),
      fetchImpl: async () =>
        new Response('fixture', { headers: { 'content-length': String(33 * 1024 * 1024) } }),
    }),
    /size limit/u,
  );
});
await check('Asset paths reject traversal and symlink escape', async () => {
  const base = join(evidence, 'audio');
  await mkdir(base);
  await writeFile(join(evidence, 'outside.wav'), 'outside');
  await symlink(join(evidence, 'outside.wav'), join(base, 'escape.wav'));
  await assert.rejects(boundedAsset(base, '../outside.wav'), /Unsafe asset path/u);
  await assert.rejects(boundedAsset(base, 'escape.wav'), /escaped/u);
});

const wave = Buffer.alloc(44 + 16_000 * 2);
wave.write('RIFF', 0);
wave.writeUInt32LE(wave.length - 8, 4);
wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20);
wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(16_000, 24);
wave.writeUInt32LE(32_000, 28);
wave.writeUInt16LE(2, 32);
wave.writeUInt16LE(16, 34);
wave.write('data', 36);
wave.writeUInt32LE(wave.length - 44, 40);
await writeFile(join(evidence, 'fixture.wav'), wave);
const fixtureManifest = {
  schema: 'kairo-assessment-audio-render/1',
  assets: scripts[1].units.map((unit, index) => ({
    id: `fixture-${index}`,
    scriptId: unit.id,
    itemIds: unit.itemIds,
    path: 'fixture.wav',
    bytesSha256: hash(wave),
    durationMs: 1000,
    mimeType: 'audio/wav',
    voiceIds: ['fixture-no-speech'],
    rightsBasisRef: 'test-only-never-release',
    sourceTranscriptSha256: unit.transcriptSha256,
    sourceVoiceRolesSha256: voiceRolesHash(unit.voiceRoles),
  })),
};
await writeFile(join(evidence, 'audio-manifest.json'), JSON.stringify(fixtureManifest));
let fixtureAssets;
await check('Audio bytes and measured duration are verified before materialization', async () => {
  fixtureAssets = await loadAudioManifest(join(evidence, 'audio-manifest.json'));
  assert.equal(fixtureAssets.size, 4);
  const wrong = structuredClone(fixtureManifest);
  wrong.assets[0].durationMs = 50_000;
  await writeFile(join(evidence, 'wrong-duration.json'), JSON.stringify(wrong));
  await assert.rejects(
    loadAudioManifest(join(evidence, 'wrong-duration.json')),
    /duration mismatch/u,
  );
  wrong.assets[0].durationMs = 1000;
  wrong.assets[0].bytesSha256 = '0'.repeat(64);
  await writeFile(join(evidence, 'wrong-hash.json'), JSON.stringify(wrong));
  await assert.rejects(loadAudioManifest(join(evidence, 'wrong-hash.json')), /hash mismatch/u);
});
await check('Correct media structure still grants no editorial approval', async () => {
  const result = await materializeForm(inputs[1], scripts[1], fixtureAssets);
  assert.equal(result.form.items.length, 16);
  assert.equal(result.form.media.length, 4);
  assert.equal(result.delivery.units.length, 4);
  assert.equal(result.delivery.assets.length, 4);
  const catalog = await buildAssessmentBank({
    directories: ['n2-short-01'],
    assets: fixtureAssets,
    evidenceDirectory: join(evidence, 'candidates'),
    publicDirectory: join(evidence, 'site'),
  });
  assert.equal(catalog.entries[0].availability.ready, false);
  assert.equal(catalog.entries[0].formPath, null);
  assert.equal(catalog.entries[0].formSha256, null);
  assert.deepEqual(await readdir(join(evidence, 'site')), ['catalog.json']);
});
await check(
  'Listening deadlines include all audio and independently validate transition allowance',
  async () => {
    const input = structuredClone(inputs[1]);
    const listening = input.formPayload.timingBlocks.find(
      (block) => block.id === 'block-listening',
    );
    listening.durationMs = 3999;
    await assert.rejects(
      materializeForm(input, scripts[1], fixtureAssets),
      /Listening audio exceeds timing block block-listening: 4000ms of audio exceeds 3999ms deadline/u,
    );
    listening.durationMs = 5000;
    input.listeningTiming = {
      recordedDurationMs: 4000,
      scheduledDurationMs: 5000,
      startupTransitionAllowanceMs: 1000,
    };
    const result = await materializeForm(input, scripts[1], fixtureAssets);
    const shared = structuredClone(result.delivery);
    shared.units[0].itemIds.push(shared.units[1].itemIds[0]);
    assertListeningTiming(result.form, shared);
    for (const patch of [
      { recordedDurationMs: 3999 },
      { scheduledDurationMs: 6000 },
      { startupTransitionAllowanceMs: -1 },
      { startupTransitionAllowanceMs: 1001 },
    ]) {
      await assert.rejects(
        materializeForm(
          { ...input, listeningTiming: { ...input.listeningTiming, ...patch } },
          scripts[1],
          fixtureAssets,
        ),
        /Declared listening timing or transition allowance is inconsistent/u,
      );
    }
  },
);
await check('Unscored examples precede their scored audio without adding answers', async () => {
  const packet = structuredClone(scripts[1]);
  const example = {
    ...packet.units[0],
    id: `${packet.formId}:fixture-example`,
    kind: 'example',
    printedOptions: false,
    transcript: '採点されない構造検証用の例です。',
    transcriptSha256: hash('採点されない構造検証用の例です。'),
  };
  packet.units.unshift(example);
  const assets = new Map(fixtureAssets);
  assets.set(example.id, {
    ...fixtureAssets.get(scripts[1].units[0].id),
    id: 'fixture-example',
    scriptId: example.id,
    sourceTranscriptSha256: example.transcriptSha256,
  });
  const result = await materializeForm(inputs[1], packet, assets);
  assert.equal(result.form.items.length, 16);
  assert.equal(result.form.media.length, 5);
  const first = result.form.items.find((item) => item.id === example.itemIds[0]);
  assert.equal(first.media.length, 2);
  assert.equal(first.media[0].id, result.delivery.units[0].media.id);
  assert.equal(result.delivery.units[0].kind, 'example');
  const shortDeadline = structuredClone(inputs[1]);
  shortDeadline.formPayload.timingBlocks.find(
    (block) => block.id === 'block-listening',
  ).durationMs = 4000;
  await assert.rejects(
    materializeForm(shortDeadline, packet, assets),
    /Listening audio exceeds timing block block-listening: 5000ms of audio exceeds 4000ms deadline/u,
  );
  packet.units.push(packet.units.shift());
  await assert.rejects(materializeForm(inputs[1], packet, assets), /Example must precede/u);
});
await check('A stale trusted review cannot publish a changed form', async () => {
  await assert.rejects(
    buildAssessmentBank({
      directories: ['n2-short-01'],
      assets: fixtureAssets,
      evidenceDirectory: join(evidence, 'candidates'),
      publicDirectory: join(evidence, 'stale-site'),
      reviewForm: async (form) => ({
        form: { ...api.artifactReference(form), sha256: '0'.repeat(64) },
        productionEligible: true,
        status: 'ai-reviewed-practice',
      }),
    }),
    /does not pin/u,
  );
});
await check('A form-only approval cannot publish unreviewed delivery metadata', async () => {
  await assert.rejects(
    buildAssessmentBank({
      directories: ['n2-short-01'],
      assets: fixtureAssets,
      evidenceDirectory: join(evidence, 'presentation-candidates'),
      publicDirectory: join(evidence, 'presentation-site'),
      reviewForm: async (form) => ({
        form: api.artifactReference(form),
        productionEligible: true,
        status: 'ai-reviewed-practice',
        authorityPolicyVersion: 'test-only-host',
        decisionRevisionIds: ['test-only-decision'],
        presentationSha256: '0'.repeat(64),
      }),
    }),
    /does not pin the delivery presentation/u,
  );
});
await check(
  'Historical admitted revisions retain immutable paths for saved learning cards',
  async () => {
    const site = join(evidence, 'fixture-only-history-site');
    const admitted = await buildAssessmentBank({
      directories: ['n2-short-01'],
      assets: fixtureAssets,
      evidenceDirectory: join(evidence, 'history-candidates'),
      publicDirectory: site,
      // A deliberately synthetic host in an isolated fixture directory, never a product approval.
      reviewForm: async (form, delivery) => ({
        form: api.artifactReference(form),
        productionEligible: true,
        status: 'ai-reviewed-practice',
        authorityPolicyVersion: 'test-only-host',
        decisionRevisionIds: ['test-only-decision'],
        presentationSha256: api.encodeLocalJson(delivery).sha256,
      }),
    });
    const prior = admitted.entries[0];
    assert(prior.formPath.includes(prior.formSha256));
    assert(prior.deliveryPath.includes(prior.deliverySha256));
    const previousBytes = await readFile(join(site, prior.formPath));
    const next = await buildAssessmentBank({
      directories: ['n2-short-01'],
      assets: new Map(),
      evidenceDirectory: join(evidence, 'history-candidates'),
      publicDirectory: site,
    });
    assert.equal(next.entries[0].availability.ready, false);
    assert.equal(next.archivedEntries[0].formSha256, prior.formSha256);
    assert.deepEqual(await readFile(join(site, prior.formPath)), previousBytes);
  },
);
await check(
  'Registered sources cite real official URLs and distinguish reference rights',
  async () => {
    const registry = await read(join(PUBLIC_BANK, 'sources.json'));
    assert.equal(registry.schema, 'kairo-assessment-sources/1');
    for (const source of registry.sources.filter((source) => source.sourceClass === 'official')) {
      sourceURL(source.url);
      assert.match(source.sourceSha256, /^[a-f0-9]{64}$/u);
      assert.equal(source.distribution, 'reference');
      assert.equal(source.publicQuestionRedistribution, 'not-established');
    }
  },
);

const report = {
  schema: 'kairo-assessment-bank-verification/1',
  at: new Date().toISOString(),
  passed: results.every((result) => result.passed),
  checks: results,
  evidenceDirectory: evidence,
};
await writeFile(join(evidence, 'result.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
