#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { hash } from './bank.mjs';

const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const safeLocal = (value) => {
  const text = String(value);
  if (!/^[A-Za-z0-9_-]{1,80}$/u.test(text)) throw new Error('Unsafe authored local identity');
  return text;
};

/** Collect complete, unapproved author manuscripts. This never writes a runtime bank. */
export async function collectAuthoringPackets(manifestPath, runRoot, outRoot) {
  for (const path of [manifestPath, runRoot, outRoot]) {
    if (!resolve(path).startsWith(`${join(homedir(), '.dharma')}/`))
      throw new Error('Draft inputs and output must remain private');
  }
  const manifest = await read(manifestPath);
  const groups = new Map();
  for (const job of manifest.jobs) {
    const key = `${job.level}-${job.form}`;
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }
  const results = [];
  for (const jobs of groups.values()) {
    const level = jobs[0].level,
      number = jobs[0].form;
    const id = `kairo-original-jlpt-${level.toLowerCase()}-form-${String(number).padStart(2, '0')}`;
    const packet = {
      schema: 'kairo-private-assessment-authoring-packet/1',
      id,
      level,
      formNumber: number,
      approval: 'not-established',
      runtimeAvailability: false,
      rights: 'original-authored-candidate-only',
      nominalTimingMinutes: manifest.levels[level].minutes,
      authoringProfile: manifest.levels[level],
      items: [],
      passages: [],
      stimuli: [],
      illustrations: [],
      origins: [],
    };
    const problems = [];
    for (const [batchIndex, job] of jobs.entries()) {
      try {
        if (!/^[a-z0-9-]+$/u.test(job.id)) throw new Error('Unsafe job identity');
        const directory = join(runRoot, job.id);
        const [receiptBytes, requestBytes, responseBytes] = await Promise.all(
          ['runtime.json', 'request.json', 'response.json'].map((name) =>
            readFile(join(directory, name)),
          ),
        );
        const receipt = JSON.parse(receiptBytes),
          request = JSON.parse(requestBytes),
          response = JSON.parse(responseBytes);
        if (
          receipt.status !== 'completed' ||
          receipt.transport !== 'dharma-runtime-provider' ||
          !receipt.identityVerified ||
          receipt.requestSha256 !== hash(requestBytes) ||
          receipt.responseSha256 !== hash(responseBytes) ||
          JSON.stringify(request.job) !== JSON.stringify(job) ||
          response.batch.items.length !== job.count
        )
          throw new Error('Incomplete or unverified author batch');
        if (receipt.hostPatchSha256) {
          const patchBytes = await readFile(join(directory, 'host-patch.json'));
          if (hash(patchBytes) !== receipt.hostPatchSha256)
            throw new Error('Host authoring patch hash mismatch');
          const patch = JSON.parse(patchBytes);
          if (patch.schema !== 'kairo-host-authoring-patch/1' || patch.review !== 'not-established')
            throw new Error('Invalid host authoring patch');
          for (const name of ['request.json', 'response.json', 'runtime.json'])
            if (
              hash(await readFile(join(directory, 'unpatched-provider-output', name))) !==
              patch.sourceHashes[name]
            )
              throw new Error('Original provider evidence for host patch changed');
          const original = await read(join(directory, 'unpatched-provider-output/response.json'));
          for (const edit of patch.edits) {
            const item = original.batch.items[edit.itemIndex];
            if (
              edit.field !== 'spokenQuestion' ||
              item.localId !== edit.localId ||
              item.spokenQuestion !== null ||
              item.printedOptions !== true ||
              edit.before !== null ||
              edit.after !== item.prompt
            )
              throw new Error('Host patch exceeds copying printed questions to speech');
            item.spokenQuestion = edit.after;
          }
          if (JSON.stringify(original) !== JSON.stringify(response))
            throw new Error('Host patch does not reconstruct the exact author batch');
        }
        const batch = response.batch;
        const prefix = `${id}:batch-${batchIndex + 1}`;
        const assetId = (kind, local) => `${prefix}:${kind}-${safeLocal(local)}`;
        for (const passage of batch.passages)
          packet.passages.push({
            id: assetId('passage', passage.id),
            text: passage.text,
            sourceJobId: job.id,
          });
        for (const stimulus of batch.stimuli)
          packet.stimuli.push({
            id: assetId('stimulus', stimulus.id),
            dialogue: stimulus.dialogue,
            sourceJobId: job.id,
            rendering: 'required',
            voiceRoleReview: 'pending',
          });
        for (const illustration of batch.illustrations ?? [])
          packet.illustrations.push({
            id: assetId('illustration', illustration.id),
            description: illustration.description,
            sourceJobId: job.id,
            rendering: 'required',
            visualReview: 'pending',
          });
        for (const item of batch.items)
          packet.items.push({
            id: assetId('item', item.localId),
            skill: job.skill,
            task: job.task,
            prompt: item.prompt,
            response: {
              kind: 'selected',
              options: item.options.map((text, index) => ({ id: `choice-${index + 1}`, text })),
              answerOptionId: `choice-${item.answerIndex + 1}`,
            },
            rationale: item.rationale,
            proposedLearningTarget: item.target ?? null,
            passageIds: item.passageIds.map((value) => assetId('passage', value)),
            stimulusId: item.stimulusId === null ? null : assetId('stimulus', item.stimulusId),
            illustrationIds: (item.illustrationIds ?? []).map((value) =>
              assetId('illustration', value),
            ),
            spokenQuestion: item.spokenQuestion,
            printedOptions: item.printedOptions,
            sourceJobId: job.id,
          });
        packet.origins.push({
          jobId: job.id,
          runtimeSha256: hash(receiptBytes),
          requestSha256: receipt.requestSha256,
          responseSha256: receipt.responseSha256,
          authorFamily: receipt.familyId,
          authorFamilies: receipt.authorFamilies ?? [receipt.familyId],
          hostPatchSha256: receipt.hostPatchSha256 ?? null,
          actualModel: receipt.actualModel,
        });
      } catch (error) {
        problems.push({
          jobId: job.id,
          reason: error.code === 'ENOENT' ? 'job-not-complete' : error.message,
        });
      }
    }
    if (problems.length) {
      results.push({ id, status: 'incomplete', problems });
      continue;
    }
    const expected = manifest.levels[level].allocation.reduce((sum, row) => sum + row[2], 0);
    if (
      packet.items.length !== expected ||
      new Set(packet.items.map((item) => item.id)).size !== expected
    )
      throw new Error(`Question coverage mismatch: ${id}`);
    for (const [skill, task, count] of manifest.levels[level].allocation) {
      if (
        packet.items.filter((item) => item.skill === skill && item.task === task).length !== count
      )
        throw new Error(`Task coverage mismatch: ${id}:${task}`);
    }
    packet.questionCount = packet.items.length;
    packet.requiredNextSteps = [
      'independent Japanese and key review',
      'native FormVersion assembly',
      'real audio rendering and inspection',
      ...(packet.illustrations.length
        ? ['original illustration rendering and visual inspection']
        : []),
      'full-form timing and presentation review',
    ];
    const bytes = JSON.stringify(packet, null, 2) + '\n';
    const destination = join(outRoot, `${id}-${hash(bytes)}.authoring.json`);
    await mkdir(outRoot, { recursive: true });
    try {
      await writeFile(destination, bytes, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST' || (await readFile(destination, 'utf8')) !== bytes) throw error;
    }
    results.push({
      id,
      status: 'authored-not-reviewed',
      questions: packet.questionCount,
      illustrationsRequired: packet.illustrations.length,
      path: destination,
      sha256: hash(bytes),
    });
  }
  await mkdir(outRoot, { recursive: true });
  const report = {
    schema: 'kairo-private-authoring-collection/1',
    readyForLearners: 0,
    forms: results,
  };
  await writeFile(join(outRoot, 'collection.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const args = process.argv.slice(2);
  const report = await collectAuthoringPackets(args[0], args[1], args[2]);
  console.log(
    JSON.stringify({
      authored: report.forms.filter((form) => form.status === 'authored-not-reviewed').length,
      incomplete: report.forms.filter((form) => form.status === 'incomplete').length,
      ready: 0,
    }),
  );
}
