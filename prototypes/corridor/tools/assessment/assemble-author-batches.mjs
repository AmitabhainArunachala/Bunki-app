#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { AUTHORING, hash, assertSeparateForms } from './bank.mjs';
import { voiceRolePlan } from './voice-roles.mjs';

const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const rights = Object.fromEntries(
  ['display', 'retain', 'sync', 'adapt', 'synthesize-audio'].map((operation) => [
    operation,
    {
      status: 'allowed',
      basisRef: 'bunki-original-authoring-20260923',
      policyVersion: 'bunki-original-rights-1',
    },
  ]),
);

export async function assembleAuthorBatches(manifestPath, runRoot, formNumber) {
  const root = resolve(runRoot);
  const rel = relative(join(homedir(), '.dharma'), root);
  if (isAbsolute(rel) || rel.startsWith('..'))
    throw new Error('Author receipts must remain under ~/.dharma');
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  const jobs = manifest.jobs.filter((job) => job.form === formNumber);
  if (
    manifest.level !== 'N2' ||
    new Set(jobs.map((job) => job.task)).size !== 19 ||
    jobs.reduce((sum, job) => sum + job.count, 0) !== 96
  )
    throw new Error('Missing N2 authoring tasks');
  const suffix = String(formNumber).padStart(2, '0');
  const id = `kairo-original-jlpt-n2-form-${suffix}`;
  const items = [],
    passages = [],
    units = [],
    origin = [];
  const authorFamilies = new Set();
  for (const job of jobs) {
    if (!/^[a-z0-9-]+$/u.test(job.id)) throw new Error('Unsafe job ID');
    const directory = join(root, job.id);
    const runtimeBytes = await readFile(join(directory, 'runtime.json'));
    const receipt = JSON.parse(runtimeBytes);
    const responseBytes = await readFile(join(directory, 'response.json'));
    if (
      receipt.status !== 'completed' ||
      receipt.transport !== 'dharma-runtime-provider' ||
      receipt.identityVerified !== true ||
      receipt.responseSha256 !== hash(responseBytes)
    )
      throw new Error(`Author response not verified: ${job.id}`);
    if (receipt.requestSha256 !== hash(await readFile(join(directory, 'request.json'))))
      throw new Error('Author request changed');
    if (JSON.stringify((await read(join(directory, 'request.json'))).job) !== JSON.stringify(job))
      throw new Error('Author batch job changed');
    const response = JSON.parse(responseBytes);
    if (response.model !== receipt.actualModel) throw new Error('Author identity changed');
    const data = response.batch;
    if (data.items.length !== job.count) throw new Error('Author task count mismatch');
    authorFamilies.add(receipt.familyId);
    const provenance = {
      kind: 'original-ai',
      authorRef: null,
      processRef: `assessment-author:${hash(runtimeBytes)}`,
      sources: [],
    };
    const prefix = `${id}:${job.task}${job.part ? `:p${job.part}` : ''}`;
    const passageMap = new Map(
      data.passages.map((passage) => [passage.id, `${prefix}:passage-${passage.id}`]),
    );
    const itemMap = new Map(data.items.map((item) => [item.localId, `${prefix}:${item.localId}`]));
    for (const passage of data.passages)
      passages.push({
        v: 1,
        id: passageMap.get(passage.id),
        format: 'kairo-assessment-passage',
        provenance,
        rights,
        title: null,
        text: passage.text,
        textSha256: hash(passage.text),
        language: 'ja',
        locationUnit: 'utf16-code-unit',
      });
    for (const item of data.items)
      items.push({
        v: 1,
        id: itemMap.get(item.localId),
        format: 'kairo-assessment-item',
        provenance,
        rights,
        skill: job.skill,
        task: job.task,
        prompt:
          job.skill === 'listening' ? '音声を聞いて、答えを一つ選んでください。' : item.prompt,
        translatedInstruction:
          job.skill === 'listening' ? 'Listen and choose one answer.' : 'Choose the best answer.',
        rationale: item.rationale,
        passageIds: item.passageIds.map((key) => passageMap.get(key)),
        media: [],
        subjects: item.target ? [`word:${item.target}`] : [`jlpt-n2:${job.task}`],
        response: {
          kind: 'selected',
          options: item.options.map((text, index) => ({ id: `choice-${index + 1}`, text })),
          answerOptionId: `choice-${item.answerIndex + 1}`,
        },
      });
    for (const stimulus of data.stimuli) {
      const linked = data.items.filter((item) => item.stimulusId === stimulus.id);
      const cues = [
        ...(linked.length === 1 && linked[0].printedOptions
          ? [
              { kind: 'speech', voice: 'narrator', text: linked[0].spokenQuestion },
              { kind: 'planned-silence', milliseconds: 10_000 },
            ]
          : []),
        ...stimulus.dialogue.map((turn) => ({
          kind: 'speech',
          voice: turn.voice,
          text: turn.text,
        })),
        ...linked.flatMap((item) => [
          ...(item.spokenQuestion
            ? [{ kind: 'speech', voice: 'narrator', text: item.spokenQuestion }]
            : []),
          ...(!item.printedOptions
            ? item.options.map((text, index) => ({
                kind: 'speech',
                voice: 'narrator',
                text: `${index + 1}。${text}`,
              }))
            : []),
          { kind: 'planned-silence', milliseconds: 10_000 },
        ]),
      ];
      const transcript = cues
        .filter((cue) => cue.kind === 'speech')
        .map((cue) => cue.text)
        .join('\n');
      const unit = {
        id: `${prefix}:audio-${stimulus.id}`,
        itemIds: linked.map((item) => itemMap.get(item.localId)),
        cues,
        transcript,
        transcriptSha256: hash(transcript),
        printedOptions: linked.every((item) => item.printedOptions),
      };
      units.push({ ...unit, ...voiceRolePlan(id, unit) });
    }
    origin.push({
      jobId: job.id,
      provider: receipt.provider,
      actualModel: receipt.actualModel,
      familyId: receipt.familyId,
      runtimeSha256: hash(runtimeBytes),
      requestSha256: receipt.requestSha256,
      responseSha256: receipt.responseSha256,
    });
  }
  if (
    items.length !== 96 ||
    new Set(items.map((item) => item.id)).size !== items.length ||
    units.flatMap((unit) => unit.itemIds).length !== 28
  )
    throw new Error('Incomplete authored form');
  const skills = ['vocabulary', 'grammar', 'reading', 'listening'];
  const sections = skills.map((skill, index) => ({
    id: `section-${skill}`,
    title: ['文字・語彙', '文法', '読解', '聴解'][index],
    skill,
    itemIds: items.filter((item) => item.skill === skill).map((item) => item.id),
  }));
  const provenance = {
    kind: 'original-ai',
    authorRef: null,
    processRef: `assessment-author-form:${hash(JSON.stringify(origin))}`,
    sources: [],
  };
  const intent = {
    schema: 'kairo-assessment-authoring-input/1',
    id,
    level: 'N2',
    mode: 'full',
    titleJa: `N2 模擬試験 ${formNumber}`,
    titleEn: `N2 full practice test ${formNumber}`,
    durationMinutes: 155,
    sourceIds: ['bunki-original-jlpt-generated-20260923'],
    authorFamilies: [...authorFamilies],
    formPayload: {
      v: 1,
      id,
      format: 'kairo-assessment-form',
      provenance,
      rights,
      title: `N2 full practice test ${formNumber}`,
      exam: { family: 'jlpt', track: 'N2' },
      scope: 'full-candidate',
      blueprintId: 'jlpt-n2-facts-20260910',
      items,
      passages,
      media: [],
      sections,
      timingBlocks: [
        {
          id: 'block-language-reading',
          sectionIds: sections.slice(0, 3).map((section) => section.id),
          durationMs: 105 * 60_000,
          clock: 'elapsed-including-interruptions',
          authority: {
            kind: 'official-fact',
            blueprintId: 'jlpt-n2-facts-20260910',
            blockId: 'language-reading',
          },
        },
        {
          id: 'block-listening',
          sectionIds: ['section-listening'],
          durationMs: 50 * 60_000,
          clock: 'elapsed-including-interruptions',
          authority: {
            kind: 'official-fact',
            blueprintId: 'jlpt-n2-facts-20260910',
            blockId: 'listening',
          },
        },
      ],
      authoring: {
        policyVersion: 'bunki-n2-96-item-allocation-20260923',
        countsAre: 'authoring-rules',
        requirements: [...new Set(jobs.map((job) => job.task))].map((task) => ({
          task,
          minimumItems: jobs
            .filter((job) => job.task === task)
            .reduce((sum, job) => sum + job.count, 0),
        })),
      },
    },
  };
  const original = await read(join(AUTHORING, 'n2-full-01/intent.json'));
  assertSeparateForms([original, intent]);
  const destination = join(AUTHORING, `n2-full-${suffix}`);
  await mkdir(destination, { recursive: true });
  for (const [file, data] of [
    ['intent.json', intent],
    ['audio-scripts.json', { schema: 'kairo-assessment-audio-scripts/1', formId: id, units }],
    [
      'origin.json',
      {
        schema: 'kairo-assessment-author-origin/1',
        jobsSha256: hash(manifestBytes),
        batches: origin,
        review: 'not-established',
      },
    ],
  ]) {
    await writeFile(join(destination, file), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  }
  return {
    id,
    directory: destination,
    items: items.length,
    passages: passages.length,
    units: units.length,
    authorFamilies: [...authorFamilies],
  };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = Object.fromEntries(
    Array.from({ length: (process.argv.length - 2) / 2 }, (_, index) => [
      process.argv[2 + index * 2],
      process.argv[3 + index * 2],
    ]),
  );
  console.log(
    JSON.stringify(
      await assembleAuthorBatches(args['--jobs'], args['--runs'], Number(args['--form'])),
    ),
  );
}
