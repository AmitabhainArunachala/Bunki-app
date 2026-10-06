#!/usr/bin/env node
/** Builds a private pack of a real JLPT workbook form from files on this Mac.
 * The pack is for one learner's personal study (jlpt.jp site policy §1(1)): it is written
 * only outside this repository, is loaded by the learner from a local file, and is stored on
 * that device. Nothing here uploads or calls a remote model. */
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assessmentAPI, assertListeningTiming } from './bank.mjs';
import { importSource, privateDirectory, sha256 } from './source-import.mjs';
import {
  N1_LISTENING_MONDAI,
  N1_WRITTEN_MONDAI,
  PAPER_MARKS,
  keySummary,
  readAnswerKey,
  readBooklet,
  readScript,
  scriptItemAnchors,
  splitListeningBooklet,
  splitWrittenPaper,
} from './official-paper.mjs';

const run = promisify(execFile);
export const PACK_SCHEMA = 'kairo-private-assessment-pack/1';
export const MAPPING_SCHEMA = 'kairo-official-paper-mapping/1';
export const PRIVATE_ROUTE = 'device-private';
export const OFFICIAL_PRIVATE = 'official-private';
const FULL = '０１２３４５６７８９';
const full = (value) => String(value).replace(/\d/gu, (digit) => FULL[Number(digit)]);

const officialSections = [
  { id: 'language-knowledge', titleJa: '言語知識（文字・語彙・文法）', titleEn: 'Language knowledge (vocabulary, grammar)', skills: ['vocabulary', 'grammar'] },
  { id: 'reading', titleJa: '読解', titleEn: 'Reading', skills: ['reading'] },
  { id: 'listening', titleJa: '聴解', titleEn: 'Listening', skills: ['listening'] },
].map((section) => ({ ...section, scaledRange: [0, 60], sectionMinimum: 19 }));

/** Paper facts for each form this tool knows how to read. Pass marks are published facts. */
export const FORMS = Object.freeze({
  'jlpt-koshiki-2018-n1': {
    formId: 'jlpt-koshiki-2018-n1',
    level: 'N1',
    folder: 'N1/2018_koshiki_daini',
    keyName: 'N1-2018',
    writtenKeySection: '言語知識（文字・語彙・文法）・読解',
    titleJa: '日本語能力試験 公式問題集 第二集 N1',
    titleEn: 'JLPT Official Practice Workbook, Volume 2 — N1',
    badge: '本物 · 公式問題集 第二集 (2018) N1',
    byline: '© 国際交流基金・日本国際教育支援協会 · 個人学習用',
    source: {
      id: 'jlpt-koshiki-2018-N1',
      label: '日本語能力試験公式問題集 第二集 N1',
      uri: 'https://www.jlpt.jp/samples/sampleindex.html',
      licenseClaim: 'JF/JEES © personal study §1(1)',
    },
    files: {
      booklets: ['N1V.pdf', 'N1G.pdf', 'N1R.pdf'],
      listening: 'N1L.pdf',
      key: 'N1answer.pdf',
      script: 'N1script.pdf',
      audio: ['N1Q1.mp3', 'N1Q2.mp3', 'N1Q3.mp3', 'N1Q4.mp3', 'N1Q5.mp3'],
    },
    written: N1_WRITTEN_MONDAI,
    listening: N1_LISTENING_MONDAI,
    blueprintId: 'jlpt-n1-facts-20260910',
    writtenMinutes: 110,
    officialListeningMinutes: 55,
    // Measured on the published files (MANIFEST.md): 13m17s + 17m18s + 11m59s + 9m18s + 9m54s.
    recordedListeningSeconds: 3706,
    officialSections,
    passMark: { total: 100, maximum: 180, sectionMinimum: 19, source: 'https://www.jlpt.jp/guideline/results.html' },
  },
});

export const officialRights = Object.freeze({
  display: { status: 'allowed', basisRef: 'jlpt-site-policy-1-1', policyVersion: 'personal-study' },
  retain: { status: 'allowed', basisRef: 'jlpt-site-policy-1-1', policyVersion: 'personal-study' },
  sync: { status: 'denied', reason: 'personal-study only; no public transmission' },
  adapt: { status: 'allowed', basisRef: 'jlpt-site-policy-1-1', policyVersion: 'personal-study' },
  'synthesize-audio': { status: 'denied', reason: 'use the official recording' },
});
const provenanceOf = (config) => ({
  kind: OFFICIAL_PRIVATE,
  authorRef: null,
  processRef: null,
  sources: [config.source],
});

/** MANIFEST.md rows: path → bytes, measured duration and SHA-256 of each downloaded file. */
export function parseManifest(text) {
  const rows = new Map();
  for (const line of text.split('\n')) {
    const match = /^\|\s*`([^`]+)`\s*\|[^|]*\|\s*(\d+)\s*\|\s*([^|]*)\|\s*`([a-f0-9]{64})`\s*\|\s*(\S+)\s*\|/u.exec(line);
    if (!match) continue;
    const duration = /^(\d+)m(\d+)s$/u.exec(match[3].trim());
    rows.set(match[1], {
      bytes: Number(match[2]),
      seconds: duration ? Number(duration[1]) * 60 + Number(duration[2]) : null,
      sha256: match[4],
      url: match[5],
    });
  }
  return rows;
}

const fail = (message) => {
  throw new Error(message);
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** The 正答表 must agree with the independent parse in official_answer_key_parse.json.
 * That parse cannot read the 統合理解 sub-questions (聴解 問題5); it is compared on 問題1–4. */
export function compareKeyWithParse(key, parse, config) {
  const reference = parse?.[config.keyName];
  if (!reference) fail(`official_answer_key_parse.json has no ${config.keyName}`);
  const written = keySummary(key.written, config.written.length);
  const writtenRef = reference[config.writtenKeySection];
  if (!writtenRef || !same(written, { per_mondai: writtenRef.per_mondai, total: writtenRef.total, answer_pos: writtenRef.answer_pos }))
    fail(`Written key disagrees with the parsed 正答表: ${JSON.stringify(written)} vs ${JSON.stringify(writtenRef)}`);
  const listeningRef = reference['聴解'];
  const withoutIntegrated = key.listening.filter((row) => row.mondai < config.listening.length);
  const listening = keySummary(withoutIntegrated, config.listening.length - 1);
  if (
    !listeningRef ||
    !same(listening.per_mondai, listeningRef.per_mondai.slice(0, config.listening.length - 1)) ||
    !same(listening.answer_pos, listeningRef.answer_pos)
  )
    fail(`Listening key disagrees with the parsed 正答表: ${JSON.stringify(listening)} vs ${JSON.stringify(listeningRef)}`);
  return {
    written,
    listening: keySummary(key.listening, config.listening.length),
    erratum: `official_answer_key_parse.json lists 聴解 問題${config.listening.length} as ${listeningRef.per_mondai.at(-1)} items without answers; the 正答表 prints ${key.listening.filter((row) => row.mondai === config.listening.length).length} answers (sub-questions). Compared on 問題1–${config.listening.length - 1}.`,
  };
}

/** Joins the drafted questions to the official key. Any count or label disagreement refuses the pack. */
export function reconcileMapping(mapping, key, config) {
  const written = [];
  for (const spec of config.written) {
    const drafted = mapping.written.items.filter((item) => item.mondai === spec.mondai);
    const answers = key.written.filter((row) => row.mondai === spec.mondai);
    if (drafted.length !== answers.length)
      fail(`問題${spec.mondai}: ${drafted.length} questions drafted, the key has ${answers.length}`);
    drafted.forEach((item, index) => {
      const answer = answers[index];
      if (String(item.number) !== answer.label)
        fail(`問題${spec.mondai}: question ${item.number} does not match key item ${answer.label}`);
      if (item.options.length !== 4 || item.options.some((option) => typeof option !== 'string' || !option.trim()))
        fail(`Question ${item.number} needs four printed choices`);
      if (new Set(item.options).size !== item.options.length) fail(`Question ${item.number} prints a choice twice`);
      if (!Number.isInteger(answer.answer) || answer.answer < 1 || answer.answer > 4)
        fail(`Question ${item.number} has no usable key`);
      written.push({ ...item, answer: answer.answer });
    });
  }
  if (written.length !== key.written.length) fail(`${written.length} written questions, key has ${key.written.length}`);
  const listening = [];
  for (const spec of config.listening) {
    const answers = key.listening.filter((row) => row.mondai === spec.mondai);
    const printed = mapping.listening.groups.filter((group) => group.mondai === spec.mondai && group.label !== '例');
    if (!answers.length) fail(`聴解 問題${spec.mondai} has no key`);
    for (const answer of answers) {
      const group = printed.find((row) => row.label === answer.label);
      const printedHere = spec.printed === 'all' || (spec.printed === 'sub-questions' && answer.label.includes('('));
      if (printedHere && (!group || group.options.length !== spec.optionCount))
        fail(`聴解 問題${spec.mondai} ${answer.label}番 needs ${spec.optionCount} printed choices`);
      if (!printedHere && group) fail(`聴解 問題${spec.mondai} ${answer.label}番 prints choices the format speaks`);
      if (answer.answer < 1 || answer.answer > spec.optionCount)
        fail(`聴解 問題${spec.mondai} ${answer.label}番 key is outside its ${spec.optionCount} choices`);
      listening.push({
        mondai: spec.mondai,
        label: answer.label,
        task: spec.task,
        printed: printedHere,
        options: printedHere ? group.options : Array.from({ length: spec.optionCount }, (_, index) => full(index + 1)),
        pages: group?.pages ?? [],
        answer: answer.answer,
      });
    }
    if (printed.length !== listening.filter((item) => item.mondai === spec.mondai && item.printed).length)
      fail(`聴解 問題${spec.mondai}: printed choice groups do not match its key`);
  }
  return { written, listening };
}

const itemId = (config, suffix) => `${config.formId}:${suffix}`;
const listeningSuffix = (item) => `l${item.mondai}-${item.label.replace(/\((\d)\)/u, '-$1')}`;
const listeningPrompt = (item) => {
  const sub = /^(\d+)\((\d)\)$/u.exec(item.label);
  return sub ? `${full(sub[1])}番　質問${full(sub[2])}` : `${full(item.label)}番`;
};

/** Validated form, delivery and catalog entry. Rejects anything the room would not accept. */
export async function assemblePack({ mapping, key, media, config, packId, api = null }) {
  const assessment = api ?? (await assessmentAPI());
  const reconciled = reconcileMapping(mapping, key, config);
  const provenance = provenanceOf(config);
  const rights = officialRights;
  const base = { v: 1, provenance, rights };
  const passages = mapping.written.passages.map((passage) =>
    assessment.createPassageVersion({
      ...base,
      format: 'kairo-assessment-passage',
      id: itemId(config, passage.id),
      title: passage.label ? `（${full(passage.label)}）` : null,
      text: passage.text,
      textSha256: sha256(passage.text),
      language: 'ja',
      locationUnit: 'utf16-code-unit',
    }),
  );
  if (media.length !== config.listening.length) fail(`${media.length} recordings, ${config.listening.length} listening 問題`);
  const audio = media.map((file, index) => {
    const spec = config.listening[index];
    const transcript = mapping.listening.transcripts?.[String(spec.mondai)] ?? null;
    const speakers = ['narrator', ...['Ｆ', 'Ｍ', 'Ａ', 'Ｂ'].filter((mark) => transcript?.includes(`${mark}：`) || transcript?.includes(`${mark}:`)).map((mark) => `speaker-${mark.normalize('NFKC').toLowerCase()}`)];
    return assessment.createMediaVersion({
      ...base,
      format: 'kairo-assessment-media',
      id: itemId(config, `audio-l${spec.mondai}`),
      kind: 'audio',
      assetId: `${config.formId}-l${spec.mondai}`,
      bytesSha256: file.sha256,
      mimeType: 'audio/mpeg',
      durationMs: file.durationMs,
      transcript,
      transcriptSha256: transcript === null ? null : sha256(transcript),
      speakers,
    });
  });
  const rationale = '公式問題集の正答表による正解です。この問題の解説はありません。';
  const items = [
    ...reconciled.written.map((item) => {
      const passage = item.passageId ? passages.find((row) => row.id === itemId(config, item.passageId)) : null;
      const box = `${PAPER_MARKS.boxOpen}${item.number}${PAPER_MARKS.boxClose}`;
      return assessment.createItemVersion({
        ...base,
        format: 'kairo-assessment-item',
        id: itemId(config, `q${item.number}`),
        skill: item.skill,
        task: item.task,
        prompt: item.prompt.trim() ? `${box}　${item.prompt}` : box,
        translatedInstruction: null,
        rationale,
        passages: passage ? [assessment.artifactReference(passage)] : [],
        media: [],
        response: {
          kind: 'selected',
          options: item.options.map((text, index) => ({ id: String(index + 1), text })),
          answerOptionId: String(item.answer),
        },
        subjects: [],
      });
    }),
    ...reconciled.listening.map((item) =>
      assessment.createItemVersion({
        ...base,
        format: 'kairo-assessment-item',
        id: itemId(config, listeningSuffix(item)),
        skill: 'listening',
        task: item.task,
        prompt: listeningPrompt(item),
        translatedInstruction: null,
        rationale,
        passages: [],
        media: [assessment.artifactReference(audio[item.mondai - 1])],
        response: {
          kind: 'selected',
          options: item.options.map((text, index) => ({ id: String(index + 1), text })),
          answerOptionId: String(item.answer),
        },
        subjects: [],
      }),
    ),
  ];
  const sectionTitle = (label, instruction) => `${label}　${instruction}`.slice(0, 500);
  const sections = [
    ...config.written.map((spec) => ({
      id: `m${spec.mondai}`,
      title: sectionTitle(`問題${full(spec.mondai)}`, mapping.written.mondai.find((row) => row.mondai === spec.mondai)?.instruction ?? ''),
      skill: spec.skill,
      itemIds: reconciled.written.filter((row) => row.mondai === spec.mondai).map((row) => itemId(config, `q${row.number}`)),
    })),
    ...config.listening.map((spec) => ({
      id: `l${spec.mondai}`,
      title: ((instruction) => sectionTitle(/^問題/u.test(instruction) ? '聴解' : `聴解　問題${full(spec.mondai)}`, instruction))(
        mapping.listening.mondai.find((row) => row.mondai === spec.mondai)?.instruction ?? '',
      ),
      skill: 'listening',
      itemIds: reconciled.listening.filter((item) => item.mondai === spec.mondai).map((item) => itemId(config, listeningSuffix(item))),
    })),
  ];
  const recordedMs = audio.reduce((sum, row) => sum + row.durationMs, 0);
  const listeningTiming = {
    officialNominalMinutes: config.officialListeningMinutes,
    recordedDurationMs: recordedMs,
    startupTransitionAllowanceMs: 60_000,
    scheduledDurationMs: recordedMs + 60_000,
    basis: 'The 2018 workbook recording, before the December 2022 cut of N1 listening to 55 minutes.',
  };
  const tasks = [...new Set(items.map((item) => item.task))];
  const form = assessment.createFormVersion({
    ...base,
    format: 'kairo-assessment-form',
    id: config.formId,
    title: config.titleJa,
    exam: { family: 'jlpt', track: config.level },
    scope: 'full-candidate',
    blueprintId: config.blueprintId,
    items,
    passages,
    media: audio,
    sections,
    timingBlocks: [
      {
        id: 'language-reading',
        sectionIds: config.written.map((spec) => `m${spec.mondai}`),
        durationMs: config.writtenMinutes * 60_000,
        clock: 'elapsed-including-interruptions',
        authority: { kind: 'official-fact', blueprintId: config.blueprintId, blockId: 'language-reading' },
      },
      {
        id: 'listening',
        sectionIds: config.listening.map((spec) => `l${spec.mondai}`),
        durationMs: listeningTiming.scheduledDurationMs,
        clock: 'elapsed-including-interruptions',
        authority: { kind: 'official-fact', blueprintId: config.blueprintId, blockId: 'listening' },
      },
    ],
    authoring: {
      policyVersion: 'official-paper-as-printed',
      countsAre: 'authoring-rules',
      requirements: tasks.map((task) => ({ task, minimumItems: items.filter((item) => item.task === task).length })),
    },
  });
  const structure = assessment.inspectFormStructure(form);
  if (!structure.passesKnownChecks) fail(`Form structure failed: ${structure.problems.join(', ')}`);
  const assetPath = (file) => `private/${packId}/media/${file.sha256}.mp3`;
  const delivery = {
    schema: 'kairo-assessment-bank-delivery/1',
    form: assessment.artifactReference(form),
    listeningTiming,
    assets: media.map((file, index) => ({
      assetId: audio[index].assetId,
      path: assetPath(file),
      bytesSha256: file.sha256,
      mimeType: 'audio/mpeg',
    })),
    units: config.listening.map((spec, index) => {
      const unitItems = reconciled.listening.filter((item) => item.mondai === spec.mondai);
      return {
        id: `l${spec.mondai}`,
        kind: 'question',
        itemIds: unitItems.map((item) => itemId(config, listeningSuffix(item))),
        media: assessment.artifactReference(audio[index]),
        printedOptions: unitItems.some((item) => item.printed),
        spokenOptionItemIds: unitItems.filter((item) => !item.printed).map((item) => itemId(config, listeningSuffix(item))),
        stimulusPlayCount: 1,
      };
    }),
  };
  assertListeningTiming(form, delivery);
  const deliverySha256 = assessment.encodeLocalJson(delivery).sha256;
  const skillCounts = Object.fromEntries(['vocabulary', 'grammar', 'reading', 'listening'].map((skill) => [skill, items.filter((item) => item.skill === skill).length]));
  const entry = {
    id: form.id,
    level: config.level,
    mode: 'full',
    titleJa: config.titleJa,
    titleEn: config.titleEn,
    questionCount: items.length,
    durationMinutes: config.writtenMinutes + Math.ceil(listeningTiming.scheduledDurationMs / 60_000),
    skillCounts,
    sourceClass: OFFICIAL_PRIVATE,
    sourceIds: [config.source.id],
    publicationRoute: PRIVATE_ROUTE,
    formPath: `private/${packId}/form.json`,
    formSha256: form.sha256,
    // No Kairo editorial review applies to an official paper; the key is the 正答表.
    editorialAtStart: { status: 'unreviewed', policyVersion: null, decisionRevisionIds: [] },
    deliveryPath: `private/${packId}/delivery.json`,
    deliverySha256,
    mediaAssets: delivery.assets.map(({ assetId, bytesSha256 }) => ({ assetId, bytesSha256 })),
    review: { status: OFFICIAL_PRIVATE, label: config.badge, byline: config.byline },
    availability: { ready: true, reasons: [] },
    scoreMethod: 'raw-official-sections',
    officialScoreCalibrated: false,
    officialSections: config.officialSections,
    passMark: config.passMark,
    listeningTiming,
  };
  return { form, delivery, entry, reconciled };
}

export async function measureAudio(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 60_000 });
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) fail(`Unreadable recording ${basename(file)}`);
  return Math.round(seconds * 1000);
}

/** Recordings must be the published files: exact bytes and the manifest's measured lengths. */
export function checkRecordings(recordings, config) {
  const floored = recordings.reduce((sum, row) => sum + Math.floor(row.durationMs / 1000), 0);
  for (const row of recordings)
    if (row.manifestSeconds !== null && Math.floor(row.durationMs / 1000) !== row.manifestSeconds)
      fail(`${row.name} measures ${row.durationMs} ms; the manifest records ${row.manifestSeconds} s`);
  if (floored !== config.recordedListeningSeconds)
    fail(`Recordings total ${floored} s; the published ${config.level} recordings total ${config.recordedListeningSeconds} s`);
  return { totalMs: recordings.reduce((sum, row) => sum + row.durationMs, 0), flooredSeconds: floored };
}

/** One file holding pack.json and every file it lists, so a phone can pick it in Files. */
export function packContainer(manifest, blobs) {
  const json = Buffer.from(JSON.stringify(manifest), 'utf8');
  const head = Buffer.from(`${PACK_SCHEMA}\n${json.length}\n`, 'ascii');
  const parts = [head, json];
  for (const file of manifest.files) {
    const bytes = blobs.get(file.path);
    if (!bytes || bytes.length !== file.bytes || sha256(bytes) !== file.sha256) fail(`Pack file changed: ${file.path}`);
    parts.push(bytes);
  }
  return Buffer.concat(parts);
}

async function renderPages(file, prefix, directory) {
  await run('pdftoppm', ['-jpeg', '-jpegopt', 'quality=70', '-r', '110', file, join(directory, prefix)], { timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
}

export async function buildPrivatePack(options) {
  const config = FORMS[options.form];
  if (!config) fail(`Unknown form ${options.form}`);
  const root = resolve(options.root ?? join(homedir(), '.dharma/bunki_private/jlpt'));
  const paper = join(root, config.folder);
  const out = await privateDirectory(resolve(options.out ?? join(root, 'packs')));
  const manifest = parseManifest(await readFile(join(root, 'MANIFEST.md'), 'utf8'));
  const parse = JSON.parse(await readFile(join(root, 'official_answer_key_parse.json'), 'utf8'));
  const names = [...config.files.booklets, config.files.listening, config.files.key, config.files.script, ...config.files.audio];
  // Capture every original with a receipt (hash-checked against the download manifest).
  const receipts = [];
  for (const name of names) {
    const row = manifest.get(`${config.folder}/${name}`);
    if (!row) fail(`MANIFEST.md has no ${config.folder}/${name}`);
    const receipt = await importSource(
      {
        id: `${config.formId}-${name.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}`,
        title: `${config.titleJa} ${name}`,
        edition: config.formId,
        location: `${config.folder}/${name}`,
        kind: name.endsWith('.mp3') ? 'audio' : 'pdf',
        distribution: 'personal',
        rightsBasis: 'jlpt.jp site policy §1(1): personal study only',
        file: join(paper, name),
        expectedSha256: row.sha256,
      },
      { store: join(out, 'sources') },
    );
    receipts.push({ name, sha256: receipt.sha256, bytes: receipt.bytes, url: row.url });
  }
  const key = await readAnswerKey(join(paper, config.files.key));
  const keyCheck = compareKeyWithParse(key, parse, config);
  let mapping;
  if (options.mapping) mapping = JSON.parse(await readFile(options.mapping, 'utf8'));
  else {
    const booklets = [];
    for (const name of config.files.booklets) booklets.push(await readBooklet(join(paper, name)));
    const written = splitWrittenPaper(booklets, config.written, keyCheck.written.per_mondai);
    const listeningBooklet = await readBooklet(join(paper, config.files.listening));
    const listeningMondai = splitListeningBooklet(listeningBooklet);
    const script = await readScript(join(paper, config.files.script));
    for (const spec of config.listening) {
      const anchors = scriptItemAnchors(script.get(spec.mondai) ?? '');
      const labels = [...new Set(key.listening.filter((row) => row.mondai === spec.mondai).map((row) => Number(row.label.replace(/\(\d\)$/u, ''))))];
      if (!same(anchors, labels)) fail(`聴解スクリプト 問題${spec.mondai} names items ${anchors.join(',')}; the key has ${labels.join(',')}`);
    }
    mapping = {
      schema: MAPPING_SCHEMA,
      formId: config.formId,
      drafted: 'pdf-text-layer; underlines and slots from the page image; proofread against the printed page',
      written,
      listening: {
        mondai: listeningMondai.map(({ mondai, instruction }) => ({ mondai, instruction })),
        groups: listeningMondai.flatMap((entry) => entry.groups),
        transcripts: Object.fromEntries([...script.entries()].map(([mondai, text]) => [String(mondai), text])),
      },
    };
  }
  if (mapping.schema !== MAPPING_SCHEMA || mapping.formId !== config.formId) fail('Mapping belongs to another form');
  const recordings = [];
  for (const name of config.files.audio) {
    const bytes = await readFile(join(paper, name));
    recordings.push({
      name,
      bytes,
      sha256: sha256(bytes),
      durationMs: await measureAudio(join(paper, name)),
      manifestSeconds: manifest.get(`${config.folder}/${name}`).seconds,
    });
  }
  const recordingCheck = checkRecordings(recordings, config);
  const packId = `${config.formId}-${sha256(JSON.stringify(receipts)).slice(0, 12)}`;
  const { form, delivery, entry, reconciled } = await assemblePack({ mapping, key, media: recordings, config, packId });
  // Original pages, for checking the typed questions against the printed paper.
  const directory = join(out, packId);
  await rm(directory, { recursive: true, force: true });
  await mkdir(join(directory, 'pages'), { recursive: true, mode: 0o700 });
  const pageFiles = [];
  for (const name of [...config.files.booklets, config.files.listening]) {
    const prefix = name.replace(/\.pdf$/u, '');
    await renderPages(join(paper, name), prefix, join(directory, 'pages'));
  }
  for (const name of (await readdir(join(directory, 'pages'))).sort()) {
    const match = /^(.+)-(\d+)\.jpg$/u.exec(name);
    if (!match) continue;
    const bytes = await readFile(join(directory, 'pages', name));
    pageFiles.push({ sheet: `${match[1]}-${Number(match[2])}`, bytes, sha256: sha256(bytes) });
  }
  await rm(join(directory, 'pages'), { recursive: true, force: true });
  const blobs = new Map();
  const files = [];
  const add = (path, bytes, mimeType) => {
    // Identical pages (blank or memo sheets) share one content-addressed file.
    if (blobs.has(path)) return;
    blobs.set(path, bytes);
    files.push({ path, sha256: sha256(bytes), bytes: bytes.length, mimeType });
  };
  add('form.json', Buffer.from(JSON.stringify(form)), 'application/json');
  add('delivery.json', Buffer.from(JSON.stringify(delivery)), 'application/json');
  for (const row of recordings) add(`media/${row.sha256}.mp3`, row.bytes, 'audio/mpeg');
  for (const page of pageFiles) add(`pages/${page.sha256}.jpg`, page.bytes, 'image/jpeg');
  const itemPages = Object.fromEntries([
    ...reconciled.written.map((item) => [`${config.formId}:q${item.number}`, item.pages]),
    ...reconciled.listening.map((item) => [`${config.formId}:${listeningSuffix(item)}`, item.pages]),
  ]);
  const passagePages = Object.fromEntries(mapping.written.passages.map((passage) => [`${config.formId}:${passage.id}`, passage.pages]));
  const packManifest = {
    schema: PACK_SCHEMA,
    packId,
    formId: config.formId,
    createdAt: new Date().toISOString(),
    rights: {
      basis: 'jlpt.jp site policy §1(1): personal study only',
      sync: 'denied',
      note: 'Keep on this device. Not for a repository, a public site, a backup that leaves the device, or a remote model.',
    },
    entry,
    files,
    pages: pageFiles.map((page) => ({ sheet: page.sheet, sha256: page.sha256 })),
    itemPages,
    passagePages,
    sources: receipts.map(({ name, sha256: digest, bytes, url }) => ({ name, sha256: digest, bytes, url })),
    checks: {
      writtenKey: keyCheck.written,
      listeningKey: keyCheck.listening,
      keyParseErratum: keyCheck.erratum,
      recordings: { ...recordingCheck, files: recordings.map((row) => ({ name: row.name, durationMs: row.durationMs, manifestSeconds: row.manifestSeconds })) },
      items: { written: reconciled.written.length, listening: reconciled.listening.length, total: form.items.length },
    },
  };
  await writeFile(join(directory, 'pack.json'), JSON.stringify(packManifest, null, 2) + '\n', { mode: 0o600 });
  for (const file of files) {
    await mkdir(join(directory, file.path, '..'), { recursive: true, mode: 0o700 });
    await writeFile(join(directory, file.path), blobs.get(file.path), { mode: 0o600 });
  }
  await writeFile(join(directory, 'mapping.json'), JSON.stringify(mapping, null, 2) + '\n', { mode: 0o600 });
  const containerPath = join(out, `${packId}.kairo-private-pack`);
  await writeFile(containerPath, packContainer(packManifest, blobs), { mode: 0o600 });
  return { packId, directory, containerPath, manifest: packManifest, bytes: (await stat(containerPath)).size };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  try {
    const result = await buildPrivatePack({
      form: option('form') ?? 'jlpt-koshiki-2018-n1',
      root: option('root'),
      out: option('out'),
      mapping: option('mapping'),
    });
    const { checks } = result.manifest;
    console.log(
      JSON.stringify(
        {
          packId: result.packId,
          container: result.containerPath,
          bytes: result.bytes,
          items: checks.items,
          writtenKey: checks.writtenKey,
          listeningKey: checks.listeningKey,
          recordings: { totalMs: checks.recordings.totalMs, flooredSeconds: checks.recordings.flooredSeconds },
          keyParseErratum: checks.keyParseErratum,
          pages: result.manifest.pages.length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(`Private pack refused: ${error.message}`);
    process.exitCode = 1;
  }
}
