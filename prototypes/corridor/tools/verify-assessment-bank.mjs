#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, symlink, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  AUTHORING,
  PUBLIC_BANK,
  REVIEWED_N2_WRITTEN,
  REVIEWED_WRITTEN,
  admittedWrittenSections,
  assessmentAPI,
  assertMediaFreeWrittenDelivery,
  assertListeningTiming,
  assertNumberedGapPositions,
  assertReviewPolicyExcludesAuthor,
  assertSeparateForms,
  boundedAsset,
  buildAssessmentBank,
  hash,
  loadAudioManifest,
  materializeForm,
  materializeWrittenReview,
  materializeWrittenSection,
  publishReviewedWrittenPractice,
  retainedWrittenEntries,
  voiceRolesHash,
  writtenSectionPublisher,
} from './assessment/bank.mjs';
import { WRITTEN_SPECS, prepareWrittenOriginal } from './assessment/prepare-originals.mjs';
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

// Synthetic fixture manuscript: exercises the per-level mechanics only. It is not N1 content,
// and nothing below admits, pins or publishes product data; every site is an isolated directory.
const n1Passages = {
  notice:
    '検証用のお知らせ\n資料室は月曜日に休館します。利用を希望する方は、前日までに受付へ連絡してください。',
};
const n1Items = [
  {
    skill: 'vocabulary',
    task: 'kanji-reading',
    prompt: '【　】の言葉の読み方を選んでください。\n検証用の文です。書類を【整理】した。',
    options: ['せいり', 'せいりょう', 'ぜいり', 'しょうり'],
    answer: 0,
    rationale: '整理は「せいり」と読む。',
    target: '整理',
    doubts: ['FIXTURE-DOUBT vocabulary: synthetic item'],
  },
  {
    skill: 'grammar',
    task: 'grammar-form',
    prompt: '（　）に入る最もよいものを選んでください。\n検証用の文です。雨が降っている（　）、出かけた。',
    options: ['にもかかわらず', 'ばかりに', 'からには', 'とたんに'],
    answer: 0,
    rationale: '逆接の「にもかかわらず」が入る。',
  },
  {
    skill: 'reading',
    task: 'information-retrieval',
    passage: 'notice',
    prompt: '資料室を利用したい人は、いつまでに連絡しますか。',
    options: ['前日まで', '当日', '月曜日', '一週間前'],
    answer: 0,
    rationale: '前日までに受付へ連絡するとある。',
  },
  {
    skill: 'reading',
    task: 'compact-main-idea',
    passage: 'notice',
    prompt: 'このお知らせで最も伝えたいことは何ですか。',
    options: ['休館日と連絡の期限', '資料の種類', '受付の場所', '開館時間の変更'],
    answer: 0,
    rationale: '休館日と、利用の連絡期限を知らせている。',
    doubts: ['FIXTURE-DOUBT reading: compact task is not an official task'],
  },
];
const n1ManuscriptBytes = Buffer.from(JSON.stringify({ n1Items, n1Passages }));
const n1Spec = (patch = {}) => ({
  ...WRITTEN_SPECS.N1,
  id: 'fixture-n1-written-01',
  items: n1Items,
  passages: n1Passages,
  status: { level: 'N1', authorModelFamily: WRITTEN_SPECS.N1.authorModelFamily },
  manuscriptSha256: hash(n1ManuscriptBytes),
  ...patch,
});
const n1Manuscript = { bytes: n1ManuscriptBytes, items: n1Items, passages: n1Passages };
const n1Section = await materializeWrittenSection(prepareWrittenOriginal(n1Spec()), n1Manuscript);
const n1Bytes = n1Section.files['form.json'];
const fixturePin = (form, bytes, patch = {}) =>
  Object.freeze({
    ...REVIEWED_WRITTEN.N1,
    id: form.id,
    sha256: form.sha256,
    bytesSha256: hash(bytes),
    filenameStem: 'fixture-n1-written-01',
    questionCount: 4,
    skillCounts: Object.freeze({ vocabulary: 1, grammar: 1, reading: 2, listening: 0 }),
    ...patch,
  });
const n1Pins = (pin = fixturePin(n1Section.form, n1Bytes)) =>
  Object.freeze({ N2: REVIEWED_WRITTEN.N2, N1: pin });
const reviewFor = (form, patch = {}) => ({
  form: api.artifactReference(form),
  presentationSha256: null,
  status: 'ai-reviewed-practice',
  productionEligible: true,
  authorityPolicyVersion: 'test-only-host',
  decisionRevisionIds: [`assessment-ai-editorial-v2:${'2'.repeat(64)}`],
  problems: [],
  rejectedRuntimeReceipts: [],
  rejectedResolutionRuntimeReceipts: [],
  officialScoreCalibrated: false,
  ...patch,
});
const shippedCatalog = await read(join(PUBLIC_BANK, 'catalog.json'));
const shippedSources = await read(join(PUBLIC_BANK, 'sources.json'));
const n1Source = {
  id: REVIEWED_WRITTEN.N1.sourceId,
  title: 'Fixture-only N1 written source',
  edition: 'fixture',
  url: null,
  location: 'isolated verifier fixture',
  sourceClass: 'original-ai',
  distribution: 'public-candidate',
  processRef: REVIEWED_WRITTEN.N1.processRef,
  rightsBasis: REVIEWED_WRITTEN.N1.rightsBasis,
};
let fixtureSites = 0;
async function writtenFixtureSite({ withN2 = true, sources = [n1Source] } = {}) {
  const site = join(evidence, `fixture-written-levels-${++fixtureSites}`);
  await mkdir(site);
  const catalog = structuredClone(shippedCatalog);
  if (!withN2) catalog.entries = catalog.entries.filter((entry) => entry.id !== REVIEWED_WRITTEN.N2.id);
  const registry = structuredClone(shippedSources);
  registry.sources.push(...sources);
  await writeFile(join(site, 'catalog.json'), JSON.stringify(catalog));
  await writeFile(join(site, 'sources.json'), JSON.stringify(registry));
  return site;
}

await check('N1 authoring maps exactly, binds its manuscript and keeps doubts out of the form', async () => {
  const { form, binding, files } = n1Section;
  assert.equal(api.parseFormVersion(JSON.parse(n1Bytes.toString('utf8'))).sha256, form.sha256);
  assert.equal(api.inspectFormStructure(form).passesKnownChecks, true);
  assert.deepEqual(form.exam, { family: 'jlpt', track: 'N1' });
  assert.equal(form.scope, 'section-practice');
  assert.equal(form.blueprintId, 'jlpt-n1-facts-20260910');
  assert.deepEqual(
    form.sections.map((section) => section.skill),
    ['vocabulary', 'grammar', 'reading'],
  );
  assert.equal(form.timingBlocks.length, 1);
  assert.equal(form.timingBlocks[0].durationMs, 19 * 60_000);
  assert.deepEqual(form.timingBlocks[0].authority, {
    kind: 'authoring-rule',
    ruleId: 'n1-written-allocation-20260925',
  });
  assert.equal(binding.status, 'unreviewed-authoring-material');
  assert.equal(binding.timing.basis, 'author-selected practice allocation; not official timing');
  assert.equal(binding.manuscript.sha256, hash(n1ManuscriptBytes));
  assert.equal(binding.manuscript.authorModelFamily, 'anthropic-claude');
  assert.equal(binding.authoringNotes.sha256, hash(files['authoring-notes.json']));
  assert.equal(binding.intent.sha256, hash(files['intent.json']));
  assert.deepEqual(binding.form, {
    path: 'form.json',
    id: form.id,
    revisionId: form.revisionId,
    sha256: form.sha256,
    bytesSha256: hash(n1Bytes),
  });
  assert.deepEqual(
    binding.items.map((row) => [row.itemId, row.task, row.answerOptionId]),
    n1Items.map((item, index) => [
      `fixture-n1-written-01:q0${index + 1}`,
      item.task,
      `choice-${item.answer + 1}`,
    ]),
  );
  assert.deepEqual(
    binding.passages.map((row) => row.passageId),
    ['fixture-n1-written-01:passage-notice'],
  );
  assert(!n1Bytes.toString('utf8').includes('FIXTURE-DOUBT'));
  const notes = JSON.parse(files['authoring-notes.json'].toString('utf8'));
  assert.equal(notes.reviewEvidence, false);
  assert.deepEqual(notes.items[0].doubts, n1Items[0].doubts);
  assert.deepEqual(notes.items[1].doubts, []);
  // Declared compact tasks keep their own IDs and stay outside the official jlpt-n1 namespace.
  assert.deepEqual(form.items[3].subjects, ['practice-n1:compact-main-idea']);
  assert.deepEqual(form.items[1].subjects, ['jlpt-n1:grammar-form']);
  const prepared = () => prepareWrittenOriginal(n1Spec());
  // Each edit leaves the key in place, so only the named field comparison can refuse it.
  const distractors = prepared();
  const options = distractors.intent.formPayload.items[1].response.options;
  [options[2].text, options[3].text] = [options[3].text, options[2].text];
  const reprompted = prepared();
  reprompted.intent.formPayload.items[1].prompt += '。';
  const reasoned = prepared();
  reasoned.intent.formPayload.items[1].rationale += '。';
  for (const altered of [distractors, reprompted, reasoned])
    await assert.rejects(
      materializeWrittenSection(altered, n1Manuscript),
      /did not preserve manuscript item 2/u,
    );
  const rekeyed = prepared();
  rekeyed.intent.formPayload.items[2].response.answerOptionId = 'choice-2';
  await assert.rejects(
    materializeWrittenSection(rekeyed, n1Manuscript),
    /did not preserve manuscript item 3/u,
  );
  const edited = prepared();
  edited.intent.formPayload.passages[0].text += '。';
  edited.intent.formPayload.passages[0].textSha256 = hash(edited.intent.formPayload.passages[0].text);
  await assert.rejects(
    materializeWrittenSection(edited, n1Manuscript),
    /did not preserve manuscript passage notice/u,
  );
  const leaked = prepared();
  leaked.intent.formPayload.items[0].rationale += n1Items[0].doubts[0];
  await assert.rejects(
    materializeWrittenSection(leaked, {
      ...n1Manuscript,
      items: n1Items.map((item, index) =>
        index ? item : { ...item, rationale: item.rationale + item.doubts[0] },
      ),
    }),
    /Author doubts leaked/u,
  );
  const renoted = prepared();
  renoted.notes.items[0].doubts = [];
  await assert.rejects(
    materializeWrittenSection(renoted, n1Manuscript),
    /did not preserve manuscript item 1/u,
  );
  await assert.rejects(
    materializeWrittenSection(prepared(), { ...n1Manuscript, bytes: Buffer.from('other') }),
    /Manuscript bytes differ/u,
  );
});

await check('N1 authoring policy refuses excluded, undeclared and relabelled tasks', () => {
  const withItem = (index, patch) =>
    n1Spec({ items: n1Items.map((item, at) => (at === index ? { ...item, ...patch } : item)) });
  for (const [spec, reason] of [
    [withItem(0, { task: 'orthography' }), /Excluded N1 task by authoring policy: orthography/u],
    [withItem(3, { task: 'invented-reading' }), /Undeclared N1 task: invented-reading/u],
    [withItem(3, { skill: 'grammar' }), /task compact-main-idea is not a grammar task/u],
    [withItem(1, { dialogue: [] }), /Unmapped manuscript field in N1 manuscript item 2: dialogue/u],
    [withItem(1, { answer: 4 }), /invalid option list or key/u],
    [n1Spec({ nonOfficialTasks: { 'claim-reading': 'reading' } }), /cannot reuse an official/u],
    [n1Spec({ status: { level: 'N2', authorModelFamily: 'anthropic-claude' } }), /spec level/u],
    [n1Spec({ status: { level: 'N1', authorModelFamily: 'openai-codex' } }), /author family/u],
    [n1Spec({ level: 'N6' }), /Unknown written level: N6/u],
    [n1Spec({ manuscriptSha256: undefined }), /exact manuscript SHA-256/u],
  ])
    assert.throws(() => prepareWrittenOriginal(spec), reason);
  // Authoring spec and admission pin must agree; neither is derived from the other at runtime.
  for (const key of ['sourceId', 'processRef', 'rightsBasis'])
    assert.equal(WRITTEN_SPECS.N1[key], REVIEWED_WRITTEN.N1[key], key);
  assert.equal(WRITTEN_SPECS.N1.minutes, REVIEWED_WRITTEN.N1.durationMinutes);
  assert.deepEqual([...WRITTEN_SPECS.N1.forbiddenTasks], [...REVIEWED_WRITTEN.N1.forbiddenTasks]);
});

await check('Unfilled N1 pin and unknown levels fail before any publication step', async () => {
  assert.equal(REVIEWED_N2_WRITTEN, REVIEWED_WRITTEN.N2);
  assert.deepEqual(
    [REVIEWED_WRITTEN.N1.id, REVIEWED_WRITTEN.N1.sha256, REVIEWED_WRITTEN.N1.bytesSha256],
    [null, null, null],
  );
  assert.deepEqual(REVIEWED_WRITTEN.N1.sharesQuestionsWith, []);
  const empty = join(evidence, 'fixture-no-catalog');
  await mkdir(empty);
  const options = {
    formBytes: n1Bytes,
    publicDirectory: empty,
    publish: true,
    reviewForm: async () => reviewFor(n1Section.form),
  };
  await assert.rejects(
    publishReviewedWrittenPractice({ ...options, level: 'N1' }),
    /No admitted written section is pinned for N1/u,
  );
  for (const level of ['N3', 'n2', '__proto__', 'toString', null, ''])
    await assert.rejects(
      publishReviewedWrittenPractice({ ...options, level }),
      /Unknown written section level/u,
    );
  assert.deepEqual(await readdir(empty), []);
  assert.throws(
    () =>
      writtenSectionPublisher(
        n1Pins({ ...REVIEWED_WRITTEN.N1, sha256: n1Section.form.sha256 }),
      ),
    /partially filled/u,
  );
  assert.throws(() => writtenSectionPublisher({ N1: REVIEWED_WRITTEN.N2 }), /inconsistent at N1/u);
  assert.deepEqual(
    admittedWrittenSections(shippedCatalog).map(({ pin }) => pin.level),
    ['N2'],
  );
});

await check('N1-only and both-level publication and rebuild keep each section once', async () => {
  const pins = n1Pins();
  const publish = writtenSectionPublisher(pins);
  const review = async () => reviewFor(n1Section.form);
  const shippedN2 = shippedCatalog.entries.find((entry) => entry.id === REVIEWED_WRITTEN.N2.id);
  // N1 only: the site has no N2 written section.
  const alone = await writtenFixtureSite({ withN2: false });
  const onlyN1 = await publish({
    level: 'N1',
    formBytes: n1Bytes,
    publicDirectory: alone,
    publish: true,
    reviewForm: review,
  });
  assert.equal(onlyN1.entry.level, 'N1');
  assert.equal(onlyN1.entry.durationMinutes, 19);
  assert.equal(onlyN1.entry.titleEn, 'N1 written practice · 12 questions');
  assert.deepEqual(onlyN1.entry.sharesQuestionsWith, []);
  assert.deepEqual(onlyN1.entry.sourceIds, [REVIEWED_WRITTEN.N1.sourceId]);
  assert.deepEqual(await readFile(join(alone, onlyN1.entry.formPath)), n1Bytes);
  const aloneRebuilt = await buildAssessmentBank({
    directories: [],
    assets: new Map(),
    publicDirectory: alone,
    evidenceDirectory: join(evidence, 'fixture-levels-alone'),
    writtenPins: pins,
  });
  assert.deepEqual(
    aloneRebuilt.entries.map((entry) => entry.id),
    [n1Section.form.id],
  );
  // Both levels: N1 is appended; the shipped N2 entry is untouched and re-publishing is idempotent.
  const both = await writtenFixtureSite();
  const withBoth = await publish({
    level: 'N1',
    formBytes: n1Bytes,
    publicDirectory: both,
    publish: true,
    reviewForm: review,
  });
  assert.deepEqual(
    withBoth.catalog.entries.find((entry) => entry.id === shippedN2.id),
    shippedN2,
  );
  assert.deepEqual(
    (await publish({ level: 'N1', formBytes: n1Bytes, publicDirectory: both, reviewForm: review }))
      .catalog,
    withBoth.catalog,
  );
  const duplicate = structuredClone(withBoth.catalog);
  duplicate.entries.push(structuredClone(withBoth.entry), structuredClone(shippedN2));
  assert.deepEqual(
    retainedWrittenEntries(duplicate.entries, pins).map((entry) => entry.id),
    [shippedN2.id, n1Section.form.id],
  );
  const bothRebuilt = await buildAssessmentBank({
    directories: [],
    assets: new Map(),
    publicDirectory: both,
    evidenceDirectory: join(evidence, 'fixture-levels-both'),
    writtenPins: pins,
  });
  assert.deepEqual(
    bothRebuilt.entries.map((entry) => entry.id),
    [shippedN2.id, n1Section.form.id],
  );
  assert.deepEqual(
    admittedWrittenSections(bothRebuilt, pins).map(({ pin }) => pin.level),
    ['N2', 'N1'],
  );
  // The production table has no filled N1 pin, so it retains only N2 and never falls back.
  const productionRebuilt = await buildAssessmentBank({
    directories: [],
    assets: new Map(),
    publicDirectory: both,
    evidenceDirectory: join(evidence, 'fixture-levels-production'),
  });
  assert.deepEqual(
    productionRebuilt.entries.map((entry) => entry.id),
    [shippedN2.id],
  );
});

await check('Written publication refuses changed bytes, cross-track, source, rights and process', async () => {
  const site = await writtenFixtureSite();
  const base = {
    level: 'N1',
    publicDirectory: site,
    reviewForm: async () => reviewFor(n1Section.form),
  };
  const publish = writtenSectionPublisher(n1Pins());
  // One character changed inside a prompt, and one byte of trailing whitespace removed.
  const text = n1Bytes.toString('utf8');
  const at = text.indexOf('書類を');
  assert(at > 0);
  const oneChar = Buffer.from(`${text.slice(0, at)}本${text.slice(at + 1)}`);
  assert.equal(oneChar.toString('utf8').length, text.length);
  for (const formBytes of [oneChar, n1Bytes.subarray(0, n1Bytes.length - 1)])
    await assert.rejects(publish({ ...base, formBytes }), /exact reviewed form bytes/u);
  // A pin re-filled to the altered bytes still cannot move the reviewed content hash.
  await assert.rejects(
    writtenSectionPublisher(
      n1Pins(fixturePin(n1Section.form, oneChar)),
    )({ ...base, formBytes: oneChar }),
  );
  // N1 bytes that claim track N2.
  const crossTrack = prepareWrittenOriginal(n1Spec());
  crossTrack.intent.formPayload.exam.track = 'N2';
  crossTrack.intent.formPayload.blueprintId = 'jlpt-n2-facts-20260910';
  await assert.rejects(
    materializeWrittenSection(crossTrack, n1Manuscript),
    /authoring input is inconsistent/u,
  );
  const n2Claim = await materializeWrittenReview(crossTrack.intent);
  const n2ClaimBytes = Buffer.from(JSON.stringify(n2Claim, null, 2) + '\n');
  await assert.rejects(
    writtenSectionPublisher(n1Pins(fixturePin(n2Claim, n2ClaimBytes)))({
      ...base,
      formBytes: n2ClaimBytes,
      reviewForm: async () => reviewFor(n2Claim),
    }),
    /Written section track N2 does not match its N1 pin/u,
  );
  await assert.rejects(
    publishReviewedWrittenPractice({ ...base, level: 'N2', formBytes: n2ClaimBytes }),
    /exact reviewed form bytes/u,
  );
  // An orthography item in pinned bytes is refused by the publisher as well as by authoring.
  const excluded = prepareWrittenOriginal(n1Spec());
  excluded.intent.formPayload.items[0].task = 'orthography';
  excluded.intent.formPayload.authoring.requirements[0].task = 'orthography';
  const excludedForm = await materializeWrittenReview(excluded.intent);
  const excludedBytes = Buffer.from(JSON.stringify(excludedForm, null, 2) + '\n');
  await assert.rejects(
    writtenSectionPublisher(n1Pins(fixturePin(excludedForm, excludedBytes)))({
      ...base,
      formBytes: excludedBytes,
      reviewForm: async () => reviewFor(excludedForm),
    }),
    /task its N1 pin excludes: orthography/u,
  );
  // Source, rights and process must agree across registry, pin and every artifact.
  const noSource = await writtenFixtureSite({ sources: [] });
  await assert.rejects(
    publish({ ...base, formBytes: n1Bytes, publicDirectory: noSource }),
    /source rights are not established/u,
  );
  for (const patch of [
    { processRef: REVIEWED_WRITTEN.N2.processRef },
    { rightsBasis: 'fixture-other-rights-basis' },
    { sourceId: REVIEWED_WRITTEN.N2.sourceId, processRef: 'fixture-other-process' },
  ])
    await assert.rejects(
      writtenSectionPublisher(n1Pins(fixturePin(n1Section.form, n1Bytes, patch)))({
        ...base,
        formBytes: n1Bytes,
      }),
      /source rights are not established/u,
    );
  const otherProcess = await writtenFixtureSite({
    sources: [{ ...n1Source, processRef: 'fixture-other-process' }],
  });
  await assert.rejects(
    writtenSectionPublisher(
      n1Pins(fixturePin(n1Section.form, n1Bytes, { processRef: 'fixture-other-process' })),
    )({ ...base, formBytes: n1Bytes, publicDirectory: otherProcess }),
    /lacks original public rights/u,
  );
  assert.deepEqual((await readdir(site)).sort(), ['catalog.json', 'sources.json']);
});

await check('Written review authority is exact to the revision, AI-labelled and media-free', async () => {
  const site = await writtenFixtureSite();
  const publish = writtenSectionPublisher(n1Pins());
  const base = { level: 'N1', formBytes: n1Bytes, publicDirectory: site };
  const n2Form = await materializeWrittenReview(inputs[1]);
  for (const review of [
    reviewFor(n2Form),
    reviewFor(n1Section.form, { form: { ...api.artifactReference(n1Section.form), revisionId: 'x' } }),
    reviewFor(n1Section.form, { status: 'human-reviewed' }),
    reviewFor(n1Section.form, { decisionRevisionIds: ['human-editor:fixture'] }),
    reviewFor(n1Section.form, { officialScoreCalibrated: true }),
  ])
    await assert.rejects(
      publish({ ...base, reviewForm: async () => review }),
      /does not admit this exact written section/u,
    );
  await assert.rejects(
    publish({
      ...base,
      reviewForm: async () => reviewFor(n1Section.form, { presentationSha256: '0'.repeat(64) }),
    }),
    /media-free/u,
  );
  await assert.rejects(publish({ ...base, reviewForm: undefined }), /trusted current host review/u);
  const form = n1Section.form;
  const delivery = {
    schema: 'kairo-assessment-bank-delivery/1',
    form: api.artifactReference(form),
    assets: [],
    units: [],
  };
  assertMediaFreeWrittenDelivery(form, delivery, { presentationSha256: null });
  for (const altered of [
    { ...form, media: [{}] },
    { ...form, items: [{ ...form.items[0], skill: 'listening' }, ...form.items.slice(1)] },
  ])
    assert.throws(
      () => assertMediaFreeWrittenDelivery(altered, delivery, { presentationSha256: null }),
      /media-free/u,
    );
  // The collector disqualifies author-family receipts only for families its policy names.
  assertReviewPolicyExcludesAuthor({ authorFamilyIds: ['OpenAI', 'Anthropic'] }, REVIEWED_WRITTEN.N1);
  assertReviewPolicyExcludesAuthor({ authorFamilyIds: ['openai', 'anthropic'] }, REVIEWED_WRITTEN.N2);
  for (const policy of [{ authorFamilyIds: ['openai'] }, {}, { authorFamilyIds: 'anthropic' }])
    assert.throws(
      () => assertReviewPolicyExcludesAuthor(policy, REVIEWED_WRITTEN.N1),
      /does not exclude the N1 author family/u,
    );
});
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
