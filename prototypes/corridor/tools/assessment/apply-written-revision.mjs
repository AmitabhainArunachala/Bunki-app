#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  AUTHORING,
  assessmentAPI,
  assertSeparateForms,
  hash,
  loadAudioManifest,
  materializeForm,
  materializeWrittenReview,
} from './bank.mjs';
import { writtenRevision } from './authoring/n2-full-01/written-r3.mjs';

const baselineSha256 = '33a5159d1f3dc2c7acf81147dc1219a6d89f859e9f189783f104556bdea5b344';
const allocation = {
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

const plain = (artifact) => {
  const value = structuredClone(artifact);
  delete value.sha256;
  delete value.revisionId;
  return value;
};

/** Preserve item identities and answer content while aligning visible numbered gaps. */
export function alignNumberedGrammarGaps(source) {
  const input = structuredClone(source);
  const form = input.formPayload;
  const edits = [];
  const passageMaps = new Map();
  for (const block of form.timingBlocks) {
    const ids = block.sectionIds.flatMap(
      (id) => form.sections.find((section) => section.id === id).itemIds,
    );
    for (const [index, id] of ids.entries()) {
      const item = form.items.find((value) => value.id === id);
      if (item.task !== 'text-grammar') continue;
      const labels = [...item.prompt.matchAll(/【\s*(\d+)\s*】/gu)].map((match) =>
        Number(match[1]),
      );
      if (labels.length !== 1) throw new Error('Expected one numbered gap per grammar question');
      const before = labels[0],
        after = index + 1;
      if (before === after) continue;
      const replace = (text) =>
        text.replace(/【\s*(\d+)\s*】/gu, (marker, number) =>
          Number(number) === before ? `【${after}】` : marker,
        );
      item.prompt = replace(item.prompt);
      item.rationale = replace(item.rationale);
      delete item.sha256;
      delete item.revisionId;
      for (const passageId of item.passageIds ?? item.passages.map((ref) => ref.id)) {
        const mapping = passageMaps.get(passageId) ?? new Map();
        if (mapping.has(before) && mapping.get(before) !== after)
          throw new Error('Conflicting numbered gap mapping');
        mapping.set(before, after);
        passageMaps.set(passageId, mapping);
      }
      edits.push({ itemId: id, previousLabel: before, printedLabel: after });
    }
  }
  for (const [id, mapping] of passageMaps) {
    const passage = form.passages.find((value) => value.id === id);
    passage.text = passage.text.replace(/【\s*(\d+)\s*】/gu, (marker, number) =>
      mapping.has(Number(number)) ? `【${mapping.get(Number(number))}】` : marker,
    );
    passage.textSha256 = hash(passage.text);
    delete passage.sha256;
    delete passage.revisionId;
  }
  if (edits.length) {
    form.authoring.policyVersion += '-numbered-gaps-r4';
    input.revisionNotes.push({
      id: 'n2-full01-printed-gap-numbering-r4-20260923',
      authorFamily: 'openai',
      basis:
        'The visible question header uses positions within the timed block. Align numbered gaps without changing stable IDs, answers, options, or non-number text.',
      edits,
      review: 'not-established',
    });
  }
  return input;
}

/** Reproducible original supplement. The preserved 100-item candidate is never rewritten. */
export function reviseWrittenInput(baseline) {
  const input = structuredClone(baseline);
  const form = input.formPayload;
  if (form.items.length !== 100 || form.authoring.policyVersion === writtenRevision.id)
    throw new Error('Written revision requires the preserved 100-item authoring input');
  const provenance = {
    kind: 'original-ai',
    authorRef: null,
    processRef: `codex-original-${writtenRevision.id}`,
    sources: [],
  };
  const template = form.passages[0];
  for (const passage of writtenRevision.passages) {
    form.passages.push({
      ...plain(template),
      id: `${input.id}:${passage.suffix}`,
      provenance,
      title: passage.title,
      text: passage.text,
      textSha256: hash(passage.text),
    });
  }
  const removedId = `${input.id}:${writtenRevision.removeItemSuffix}`;
  const removed = form.items.find((item) => item.id === removedId);
  if (!removed || removed.task !== 'claim-reading') throw new Error('Removal source drift');
  form.items = form.items.filter((item) => item.id !== removedId);
  for (const entry of writtenRevision.items) {
    const template = form.items.find((item) => item.task === entry.task);
    const item = {
      ...plain(template),
      id: `${input.id}:${entry.suffix}`,
      provenance,
      skill: entry.skill,
      task: entry.task,
      prompt: entry.prompt,
      translatedInstruction:
        entry.skill === 'reading'
          ? 'Read the passage and choose the best answer.'
          : 'Choose the best answer.',
      rationale: entry.rationale,
      passages: [],
      passageIds: entry.passageSuffix ? [`${input.id}:${entry.passageSuffix}`] : [],
      media: [],
      subjects: [`jlpt-n2:${entry.task}`],
      response: {
        kind: 'selected',
        options: entry.options.map((text, index) => ({ id: `choice-${index + 1}`, text })),
        answerOptionId: `choice-${entry.answer + 1}`,
      },
    };
    if (form.items.some((value) => value.id === item.id)) throw new Error('New item ID collision');
    form.items.push(item);
  }
  form.items = Object.keys(allocation).flatMap((task) =>
    form.items.filter((item) => item.task === task),
  );
  for (const [task, count] of Object.entries(allocation)) {
    if (form.items.filter((item) => item.task === task).length !== count)
      throw new Error(`Source-backed allocation mismatch: ${task}`);
  }
  for (const section of form.sections)
    section.itemIds = form.items
      .filter((item) => item.skill === section.skill)
      .map((item) => item.id);
  form.authoring = {
    policyVersion: writtenRevision.id,
    countsAre: 'authoring-rules',
    requirements: Object.entries(allocation).map(([task, minimumItems]) => ({
      task,
      minimumItems,
    })),
  };
  input.revisionNotes.push({
    id: writtenRevision.id,
    basis:
      'Original 107-item allocation aligned to the official 2018 N2 workbook and approximate-count guidebook. Counts remain authored rules, not fixed official constants.',
    authorFamily: writtenRevision.authorFamily,
    addedItemIds: writtenRevision.items.map((item) => `${input.id}:${item.suffix}`),
    removedItemId: removedId,
    removalReason: writtenRevision.removalReason,
    sourceUrl: 'https://www.jlpt.jp/samples/sample2018/pdf/N2answer.pdf',
    sourceSha256: '68265ccb1d63179c77809e4d89d787ccaea1bd083e02e1d6e780d2fb92b67cf8',
    guidebookUrl: 'https://www.jlpt.jp/e/reference/pdf/guidebook_s_e.pdf',
    guidebookSha256: 'b38beaac905a843c75371911d51fa41c2a49e978221bbdc284b2b8d4705f0d8b',
    guidebookPhysicalPage: 8,
    review: 'not-established',
  });
  return alignNumberedGrammarGaps(input);
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  if (process.argv.length !== 3 || process.argv[2] !== '--apply')
    throw new Error('Usage: node apply-written-revision.mjs --apply');
  const root = join(homedir(), '.dharma/bunki_assessment/2026-09-23');
  const directory = join(AUTHORING, 'n2-full-01');
  const currentBytes = await readFile(join(directory, 'intent.json'));
  if (hash(currentBytes) !== baselineSha256) throw new Error('Baseline input hash drift');
  const baseline = JSON.parse(currentBytes);
  const input = reviseWrittenInput(baseline);
  const otherInputs = await Promise.all(
    ['short', 'medium'].map(async (mode) =>
      JSON.parse(await readFile(join(AUTHORING, `n2-${mode}-01`, 'intent.json'), 'utf8')),
    ),
  );
  assertSeparateForms([...otherInputs, input]);
  const scripts = JSON.parse(await readFile(join(directory, 'audio-scripts.json'), 'utf8'));
  const assets = await loadAudioManifest(join(root, 'audio/n2-full-01-mp3/manifest.json'));
  const result = await materializeForm(input, scripts, assets);
  if (!result.form || result.form.items.length !== 107) throw new Error('Revision not complete');
  const oldFormPath = join(root, 'bank-candidates', `${input.id}.form.json`);
  const oldForm = JSON.parse(await readFile(oldFormPath, 'utf8'));
  if (JSON.stringify(result.form.media) !== JSON.stringify(oldForm.media))
    throw new Error('Written revision changed listening media artifacts');
  const oldListening = oldForm.items.filter((item) => item.skill === 'listening');
  const newListening = result.form.items.filter((item) => item.skill === 'listening');
  if (JSON.stringify(oldListening) !== JSON.stringify(newListening))
    throw new Error('Written revision changed listening questions');
  const api = await assessmentAPI();
  const output = join(root, 'bank-candidates/full107-r1');
  const archive = join(output, 'baseline');
  await mkdir(archive, { recursive: true });
  const write = (path, value) =>
    writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await writeFile(join(archive, 'intent.json'), currentBytes, { flag: 'wx' });
  for (const filename of [
    `${input.id}.form.json`,
    `${input.id}.delivery.json`,
    'FINAL-MP3-CANDIDATES.json',
  ])
    await writeFile(
      join(archive, filename),
      await readFile(join(root, 'bank-candidates', filename)),
      { flag: 'wx' },
    );
  const formPath = join(output, `${input.id}.form.json`);
  const deliveryPath = join(output, `${input.id}.delivery.json`);
  await write(formPath, result.form);
  await write(deliveryPath, result.delivery);
  await write(
    join(output, `${input.id}.written-review.form.json`),
    await materializeWrittenReview(input),
  );
  const indexPath = join(root, 'bank-candidates/FINAL-MP3-CANDIDATES.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  const full = index.find((entry) => entry.mode === 'full');
  Object.assign(full, {
    formPath,
    deliveryPath,
    formSha256: result.form.sha256,
    deliverySha256: api.encodeLocalJson(result.delivery).sha256,
    items: 107,
  });
  const receipt = {
    schema: 'kairo-original-written-revision-receipt/1',
    createdAt: new Date().toISOString(),
    authorFamily: writtenRevision.authorFamily,
    revision: writtenRevision.id,
    baselineInputSha256: hash(currentBytes),
    supplementSourceSha256: hash(
      await readFile(new URL('./authoring/n2-full-01/written-r3.mjs', import.meta.url)),
    ),
    newInputSha256: hash(JSON.stringify(input, null, 2) + '\n'),
    previousFormSha256: oldForm.sha256,
    formSha256: full.formSha256,
    deliverySha256: full.deliverySha256,
    addedItems: writtenRevision.items.map((item) => `${input.id}:${item.suffix}`),
    removedItem: `${input.id}:${writtenRevision.removeItemSuffix}`,
    mediaIdentical: true,
    listeningItemsIdentical: true,
    editorialReview: 'not-established',
    priorFormReviewIsNotApproval: true,
  };
  await write(join(output, 'revision-receipt.json'), receipt);
  await writeFile(join(directory, 'intent.json'), JSON.stringify(input, null, 2) + '\n');
  await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');
  console.log(JSON.stringify({ ...full, receipt: join(output, 'revision-receipt.json') }, null, 2));
}
