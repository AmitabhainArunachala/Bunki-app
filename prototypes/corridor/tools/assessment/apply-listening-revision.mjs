#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { AUTHORING, hash } from './bank.mjs';
import { voiceRolePlan } from './voice-roles.mjs';
import { n2ListeningExamples } from './authoring/n2-listening-examples.mjs';

const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const write = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
const tasks = [
  'listening-task',
  'listening-point',
  'listening-gist',
  'listening-response',
  'listening-integrated',
];

async function verifiedJob(root, job) {
  if (!/^[a-z0-9-]+$/u.test(job.id)) throw new Error('Unsafe job ID');
  const path = join(root, job.id);
  const [receiptBytes, requestBytes, responseBytes] = await Promise.all(
    ['runtime.json', 'request.json', 'response.json'].map((name) => readFile(join(path, name))),
  );
  const receipt = JSON.parse(receiptBytes),
    request = JSON.parse(requestBytes),
    response = JSON.parse(responseBytes);
  if (
    receipt.status !== 'completed' ||
    receipt.identityVerified !== true ||
    receipt.transport !== 'dharma-runtime-provider' ||
    hash(requestBytes) !== receipt.requestSha256 ||
    hash(responseBytes) !== receipt.responseSha256 ||
    JSON.stringify(request.job) !== JSON.stringify(job) ||
    !response.batch ||
    receipt.familyId !== 'glm'
  ) {
    throw new Error(`Unverified author response: ${job.id}`);
  }
  return {
    data: response.batch,
    evidence: {
      jobId: job.id,
      runtimeSha256: hash(receiptBytes),
      responseSha256: receipt.responseSha256,
      familyId: receipt.familyId,
      actualModel: receipt.actualModel,
      review: 'not-established',
    },
  };
}

function finishUnit(unit, cues, evidence) {
  const transcript = cues
    .filter((cue) => cue.kind === 'speech')
    .map((cue) => cue.text)
    .join('\n');
  return {
    ...unit,
    cues,
    transcript,
    transcriptSha256: hash(transcript),
    authoringEvidence: evidence,
  };
}

/** Apply exact, receipt-backed author output to candidate inputs, never to preserved baselines. */
export async function applyListeningRevision({
  revisionJobs,
  revisionRuns,
  additionalJobs,
  additionalRuns,
  baseline,
}) {
  const evidenceRoot = join(homedir(), '.dharma');
  for (const path of [revisionJobs, revisionRuns, additionalJobs, additionalRuns, baseline]) {
    if (!resolve(path).startsWith(`${evidenceRoot}/`))
      throw new Error('Revision evidence must stay under ~/.dharma');
  }
  const revisionManifest = await read(revisionJobs);
  const additionalManifest = await read(additionalJobs);
  const outputs = [];
  for (const mode of ['full', 'medium']) {
    const directory = join(AUTHORING, `n2-${mode}-01`);
    const preserved = join(baseline, `n2-${mode}-01`);
    const input = await read(join(preserved, 'intent.json'));
    const scripts = await read(join(preserved, 'audio-scripts.json'));
    const currentInput = await read(join(directory, 'intent.json'));
    // Keep current written editorial fixes while pinning the unchanged listening baseline.
    const priorListening = input.formPayload.items.filter((item) => item.skill === 'listening');
    if (
      JSON.stringify(priorListening) !==
      JSON.stringify(currentInput.formPayload.items.filter((item) => item.skill === 'listening'))
    )
      throw new Error('Listening baseline drift');
    input.formPayload.items = currentInput.formPayload.items;
    input.formPayload.authoring = currentInput.formPayload.authoring;
    input.revisionNotes = currentInput.revisionNotes ?? [];
    for (const job of revisionManifest.jobs.filter((value) => value.mode === mode)) {
      const index = scripts.units.findIndex((unit) => unit.id === job.unitId);
      const unit = scripts.units[index];
      if (!unit || unit.transcriptSha256 !== job.sourceTranscriptSha256)
        throw new Error('Revision source drift');
      const { data, evidence } = await verifiedJob(revisionRuns, job);
      const characterCount = data.dialogue.reduce((sum, turn) => sum + turn.text.length, 0);
      if (
        characterCount < job.minCharacters ||
        characterCount > job.maxCharacters ||
        data.dialogue.some((turn) => !job.allowedVoices.includes(turn.voice))
      )
        throw new Error('Invalid revised stimulus');
      const dialogueIndices = unit.cues.flatMap((cue, position) =>
        cue.kind === 'speech' && cue.voice !== 'narrator' ? [position] : [],
      );
      const start = Math.min(...dialogueIndices),
        end = Math.max(...dialogueIndices);
      if (
        unit.cues
          .slice(start, end + 1)
          .some((cue) => cue.kind !== 'speech' || cue.voice === 'narrator')
      )
        throw new Error('Cannot replace discontinuous stimulus');
      scripts.units[index] = finishUnit(
        unit,
        [
          ...unit.cues.slice(0, start),
          ...data.dialogue.map((turn) => ({ kind: 'speech', ...turn })),
          ...unit.cues.slice(end + 1),
        ],
        { ...evidence, answerPreservationRationale: data.rationale },
      );
      for (const item of input.formPayload.items.filter((value) =>
        unit.itemIds.includes(value.id),
      )) {
        item.provenance = {
          ...item.provenance,
          processRef: `bunki-listening-r2-${evidence.runtimeSha256.slice(0, 24)}`,
        };
        delete item.sha256;
        delete item.revisionId;
      }
    }
    if (mode === 'full') {
      const patchBytes = await readFile(join(directory, 'listening-editorial-patches.json'));
      const patches = JSON.parse(patchBytes).patches;
      let nextNumber = 29;
      for (const job of additionalManifest.jobs) {
        let { data, evidence } = await verifiedJob(additionalRuns, job);
        const patch = patches.find((value) => value.jobId === job.id);
        if (patch) {
          if (
            patch.sourceResponseSha256 !== evidence.responseSha256 ||
            patch.authorFamily !== 'codex'
          )
            throw new Error('Editorial patch source drift');
          data = patch.replacementBatch;
          evidence = {
            ...evidence,
            editorialPatchSha256: hash(patchBytes),
            editorialPatchAuthor: patch.authorFamily,
            editorialPatchBasis: patch.basis,
          };
        }
        if (data.items.length !== job.count || data.passages.length)
          throw new Error('Invalid additional listening batch');
        for (const authored of data.items) {
          const id = `${input.id}:l${String(nextNumber++).padStart(2, '0')}`;
          const stimulus = data.stimuli.find((value) => value.id === authored.stimulusId);
          if (!stimulus) throw new Error('Missing additional stimulus');
          const template = priorListening.find((item) => item.task === job.task);
          const item = {
            ...template,
            id,
            provenance: {
              ...template.provenance,
              processRef: `bunki-listening-r2-${hash(JSON.stringify(evidence)).slice(0, 24)}`,
            },
            prompt: '音声を聞いて、最もよい答えを一つ選んでください。',
            rationale: authored.rationale,
            passages: [],
            media: [],
            subjects: [`jlpt-n2:${job.task}`],
            response: {
              kind: 'selected',
              options: authored.options.map((text, index) => ({ id: `choice-${index + 1}`, text })),
              answerOptionId: `choice-${authored.answerIndex + 1}`,
            },
          };
          delete item.sha256;
          delete item.revisionId;
          input.formPayload.items.push(item);
          const cues = [
            ...(authored.printedOptions
              ? [
                  { kind: 'speech', voice: 'narrator', text: authored.spokenQuestion },
                  { kind: 'planned-silence', milliseconds: 10_000 },
                ]
              : []),
            ...stimulus.dialogue.map((turn) => ({ kind: 'speech', ...turn })),
            ...(authored.spokenQuestion
              ? [{ kind: 'speech', voice: 'narrator', text: authored.spokenQuestion }]
              : []),
            ...(!authored.printedOptions
              ? authored.options.flatMap((text, index) => [
                  { kind: 'speech', voice: 'narrator', text: `${index + 1}番。` },
                  {
                    kind: 'speech',
                    voice: job.task === 'listening-response' ? 'speaker-b' : 'narrator',
                    text,
                  },
                ])
              : []),
            { kind: 'planned-silence', milliseconds: 10_000 },
          ];
          let unit = finishUnit(
            {
              id: `${id}:audio`,
              kind: 'question',
              itemIds: [id],
              printedOptions: authored.printedOptions,
            },
            cues,
            evidence,
          );
          unit = { ...unit, ...voiceRolePlan(input.id, unit) };
          scripts.units.push(unit);
        }
      }
      if (nextNumber !== 33)
        throw new Error('Exactly four additional listening items are required');
      const items = input.formPayload.items;
      const listening = tasks.flatMap((task) =>
        items.filter((item) => item.skill === 'listening' && item.task === task),
      );
      input.formPayload.items = [
        ...items.filter((item) => item.skill !== 'listening'),
        ...listening,
      ];
      input.formPayload.sections.find((section) => section.skill === 'listening').itemIds =
        listening.map((item) => item.id);
      const counts = [5, 6, 5, 12, 4];
      for (const [index, task] of tasks.entries()) {
        if (listening.filter((item) => item.task === task).length !== counts[index])
          throw new Error('2018-aligned allocation mismatch');
        input.formPayload.authoring.requirements.find(
          (requirement) => requirement.task === task,
        ).minimumItems = counts[index];
      }
      input.formPayload.authoring.policyVersion = 'bunki-n2-2018-aligned-allocation-20260923-r2';
      input.sourceIds = [...new Set([...input.sourceIds, 'jlpt-official-workbooks'])];
      input.formPayload.provenance.sources = [
        ...input.formPayload.provenance.sources,
        {
          id: 'jlpt-2018-n2-format',
          label:
            'Official 2018 N2 listening format reference; the authored questions remain Bunki originals',
          uri: 'https://www.jlpt.jp/samples/sample2018/pdf/N2L.pdf',
          licenseClaim: null,
        },
      ];
      input.revisionNotes.push({
        basis:
          'Original authored allocation aligned to official 2018 N2 workbook listening tasks; not a universal official count.',
        sourceUrl: 'https://www.jlpt.jp/samples/sample2018/pdf/N2L.pdf',
        sourceSha256: 'd61edaadaae301d347cae040505016dd5057c2a3ac2a25b4b1aaa92070c2f3cb',
        listeningCounts: Object.fromEntries(tasks.map((task, index) => [task, counts[index]])),
      });
      const questions = scripts.units;
      scripts.units = tasks.flatMap((task) => {
        const first = listening.find((item) => item.task === task);
        const example = finishUnit(
          {
            id: `${input.id}:example-${task}`,
            kind: 'example',
            itemIds: [first.id],
            printedOptions: false,
          },
          n2ListeningExamples[task],
          { kind: 'original-ai', familyId: 'codex', review: 'not-established' },
        );
        return [
          { ...example, ...voiceRolePlan(input.id, example) },
          ...questions
            .filter((unit) => listening.find((item) => item.id === unit.itemIds[0]).task === task)
            .map((unit) => ({ ...unit, kind: 'question' })),
        ];
      });
    }
    input.formPayload.provenance.processRef = `bunki-original-n2-${mode}-listening-r2-20260923`;
    input.sourceIds = [...new Set([...input.sourceIds, 'bunki-original-jlpt-generated-20260923'])];
    outputs.push({ directory, input, scripts });
  }
  // Complete all validation before changing any input.
  for (const { directory, input, scripts } of outputs) {
    await write(join(directory, 'intent.json'), input);
    await write(join(directory, 'audio-scripts.json'), scripts);
  }
  return outputs.map(({ input, scripts }) => ({
    id: input.id,
    questions: input.formPayload.items.length,
    audioUnits: scripts.units.length,
    scriptsSha256: hash(JSON.stringify(scripts)),
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .reduce(
        (pairs, value, index, all) =>
          index % 2 ? pairs : [...pairs, [value.replace(/^--/u, ''), all[index + 1]]],
        [],
      ),
  );
  try {
    console.log(
      JSON.stringify(
        await applyListeningRevision({
          revisionJobs: args['revision-jobs'],
          revisionRuns: args['revision-runs'],
          additionalJobs: args['additional-jobs'],
          additionalRuns: args['additional-runs'],
          baseline: args.baseline,
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
