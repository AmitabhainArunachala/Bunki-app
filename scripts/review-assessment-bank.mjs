#!/usr/bin/env node
/** Prepare and verify AI editorial work. Runtime receipts stay outside the application. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...argv] = process.argv.slice(2);
const args = Object.fromEntries(
  Array.from({ length: argv.length / 2 }, (_, index) => [argv[index * 2], argv[index * 2 + 1]]),
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
function outputDirectory(path) {
  if (!path || !inside(join(homedir(), '.dharma'), resolve(path)))
    throw new Error('Review output must be under ~/.dharma.');
  mkdirSync(path, { recursive: true });
  if (!inside(realpathSync(join(homedir(), '.dharma')), realpathSync(path)))
    throw new Error('Review output symlink leaves ~/.dharma.');
  return resolve(path);
}
const bundle = await build({
  entryPoints: [join(repo, 'packages/assessment/src/index.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const api = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
);
const write = (path, data) =>
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const presentation = args['--delivery'] ? read(args['--delivery']) : undefined;
const freeAudioRoutes = {
  'thinkingmachines/inkling:free': {
    tag: 'thinkingmachines/nvfp4',
    provider: 'Thinking Machines',
    family: 'thinkingmachines',
  },
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': {
    tag: 'nvidia',
    provider: 'Nvidia',
    family: 'nemotron',
  },
};
const isZero = (value) =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
  Number.isFinite(Number(value)) &&
  Number(value) === 0;
function verifyNativeAudioGuard(run, lane, root, request, response, packet) {
  const route = freeAudioRoutes[lane.registryModel],
    guard = run.nativeAudioGuard;
  if (
    !lane.exactFreeAudio ||
    !route ||
    lane.familyId !== route.family ||
    !guard ||
    guard.calls !== 1 ||
    guard.sdkRetries !== 0 ||
    guard.allowFallbacks !== false ||
    guard.followRedirects !== false ||
    guard.baseUrl !== 'https://openrouter.ai/api/v1' ||
    guard.rawIdentityAndZeroCostVerified !== true
  )
    throw new Error('native-audio-runtime-guard-not-verified');
  const refs = [];
  const pinned = (reference) => {
    const path = resolve(reference.path);
    if (!inside(root, path)) throw new Error('native-audio-evidence-path');
    const bytes = readFileSync(path);
    if (hash(bytes) !== reference.sha256) throw new Error('native-audio-evidence-changed');
    refs.push(`native-audio:${reference.sha256}`);
    return JSON.parse(bytes.toString('utf8'));
  };
  const metadata = guard.metadata;
  if (
    metadata.model !== lane.registryModel ||
    metadata.tag !== route.tag ||
    metadata.provider !== route.provider ||
    metadata.evidence.length !== 2
  )
    throw new Error('native-audio-route-mismatch');
  const catalog = pinned(metadata.evidence[0]),
    endpoints = pinned(metadata.evidence[1]);
  if (
    metadata.evidence[0].url !== 'https://openrouter.ai/api/v1/models' ||
    metadata.evidence[1].url !==
      `https://openrouter.ai/api/v1/models/${lane.registryModel}/endpoints`
  )
    throw new Error('native-audio-metadata-origin');
  const model = catalog.data.find((row) => row.id === lane.registryModel);
  const endpoint = endpoints.data.endpoints.find((row) => row.tag === route.tag);
  if (
    !model ||
    !endpoint ||
    endpoints.data.id !== lane.registryModel ||
    endpoint.model_id !== lane.registryModel ||
    endpoint.provider_name !== route.provider ||
    ![model, endpoints.data].every((row) => row.architecture.input_modalities.includes('audio')) ||
    ![model.pricing, endpoint.pricing].every(
      (prices) =>
        Object.hasOwn(prices, 'prompt') &&
        Object.hasOwn(prices, 'completion') &&
        Object.values(prices).every(isZero),
    )
  )
    throw new Error('native-audio-zero-price-metadata-mismatch');
  const raw = pinned(guard.rawResponse),
    sent = pinned(guard.guardRequest);
  const returnedModels = [lane.registryModel, model.canonical_slug, endpoint.name.split(' | ')[1]];
  if (
    !returnedModels.includes(raw.model) ||
    raw.model !== response.model ||
    raw.provider !== route.provider ||
    !isZero(raw.usage?.cost) ||
    !Object.values(raw.usage.cost_details || {}).every((value) => value === null || isZero(value))
  )
    throw new Error('native-audio-raw-identity-or-cost-mismatch');
  const expectedRouting = {
    provider: {
      only: [route.tag],
      allow_fallbacks: false,
      max_price: { prompt: 0, completion: 0, request: 0, image: 0 },
    },
    usage: { include: true },
  };
  if (
    sent.model !== lane.registryModel ||
    sent.models ||
    sent.stream ||
    JSON.stringify(sent.extra_body) !== JSON.stringify(expectedRouting) ||
    JSON.stringify(sent.messages) !==
      JSON.stringify([{ role: 'system', content: request.system }, ...request.messages])
  )
    throw new Error('native-audio-actual-request-mismatch');
  const parts = request.messages[0]?.content;
  if (
    !Array.isArray(parts) ||
    request.messages.length !== 1 ||
    parts[0].type !== 'text' ||
    JSON.stringify(JSON.parse(parts[0].text)) !== JSON.stringify(packet.payload)
  )
    throw new Error('native-audio-actual-packet-mismatch');
  const audioHashes = parts.slice(1).map((part) => {
    if (part.type === 'audio_url' && part.audio_url?.url.startsWith('data:audio/wav;base64,'))
      return hash(Buffer.from(part.audio_url.url.slice('data:audio/wav;base64,'.length), 'base64'));
    if (part.type === 'input_audio' && ['mp3', 'wav'].includes(part.input_audio?.format))
      return hash(Buffer.from(part.input_audio.data, 'base64'));
    throw new Error('native-audio-attachment-format');
  });
  const decodedTransports = [];
  for (const attachment of run.attachments) {
    if (!attachment.transportSha256) continue;
    const derivation = attachment.transportDerivation;
    if (
      !derivation ||
      derivation.format !== 'decoded-native-audio-transport/1' ||
      derivation.transcriptOrASRUsed !== false ||
      derivation.trimmed !== false ||
      derivation.resampledHz !== 16000 ||
      derivation.channels !== 1 ||
      derivation.source.sha256 !== attachment.sha256 ||
      derivation.decoded.sha256 !== attachment.transportSha256 ||
      !inside(root, resolve(derivation.decoded.path)) ||
      hash(readFileSync(derivation.source.path)) !== attachment.sha256 ||
      hash(readFileSync(derivation.decoded.path)) !== attachment.transportSha256 ||
      hash(readFileSync(derivation.argv[0])) !== derivation.decoderSha256 ||
      JSON.stringify(derivation.argv.slice(1)) !==
        JSON.stringify([
          '-nostdin',
          '-v',
          'error',
          '-i',
          derivation.source.path,
          '-map_metadata',
          '-1',
          '-ac',
          '1',
          '-ar',
          '16000',
          '-c:a',
          'pcm_s16le',
          derivation.decoded.path,
        ])
    )
      throw new Error('native-audio-decoder-provenance-mismatch');
    decodedTransports.push(derivation);
  }
  if (decodedTransports.length)
    refs.push(`native-audio-decoded-set:${hash(JSON.stringify(decodedTransports))}`);
  if (
    !audioHashes.length ||
    JSON.stringify(audioHashes.sort()) !==
      JSON.stringify(run.attachments.map((row) => row.transportSha256 || row.sha256).sort())
  )
    throw new Error('native-audio-actual-attachment-mismatch');
  return refs;
}

if (command === 'prepare-resolution') {
  const form = api.parseFormVersion(read(args['--form']));
  const receipts = read(args['--receipts']).map(api.parseAiEditorialReceipt);
  const original = receipts.find((receipt) => receipt.sha256 === args['--original-sha']);
  const replacement = receipts.find((receipt) => receipt.sha256 === args['--replacement-sha']);
  if (!original || !replacement) throw new Error('Named immutable receipts are required.');
  const packet = api.createAiConcernResolutionInput(
    form,
    original,
    replacement,
    args['--item'],
    args['--aspect'],
    presentation,
  );
  const out = outputDirectory(args['--out']);
  write(join(out, 'concern-resolution.json'), {
    format: 'kairo-ai-concern-resolution-job',
    v: 1,
    checklistVersion: original.checklistVersion,
    ...packet,
    responseSchema: api.aiConcernResolutionResponseJsonSchema(),
  });
  console.log(JSON.stringify({ out, inputSha256: packet.inputSha256 }));
} else if (command === 'prepare') {
  const form = api.parseFormVersion(read(args['--form']));
  const out = outputDirectory(args['--out']);
  const checklistVersion = args['--checklist'];
  if (!checklistVersion)
    throw new Error('--checklist must identify the configured review checklist.');
  const batchSize = Number(args['--batch-size'] ?? 8);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 32)
    throw new Error('Batch size must be 1–32.');
  const jobs = [];
  for (const role of api.AI_REVIEW_ROLES) {
    if (role === 'media-inspector' && !form.media.length) continue;
    // Keep written work independently runnable on text-only providers. A mixed
    // boundary batch must not hide its written items behind an unavailable audio lane.
    const groups = [
      form.items.filter((item) => !item.media.length),
      form.items.filter((item) => item.media.length),
    ];
    const batches = ['blind-solver', 'adversarial-editor'].includes(role)
      ? groups.flatMap((items) =>
          Array.from({ length: Math.ceil(items.length / batchSize) }, (_, i) =>
            items.slice(i * batchSize, (i + 1) * batchSize).map((item) => item.id),
          ),
        )
      : [null];
    for (const [index, itemIds] of batches.entries()) {
      const packet = api.createAiReviewInput(form, role, itemIds, presentation);
      const path = join(out, `${role}-${String(index + 1).padStart(3, '0')}.json`);
      write(path, {
        format: 'kairo-ai-review-job',
        v: 2,
        checklistVersion,
        ...packet,
        responseSchema: api.aiReviewResponseJsonSchema(role),
      });
      jobs.push({ path, role, itemIds, inputSha256: packet.inputSha256 });
    }
  }
  write(join(out, 'jobs.json'), { form: api.artifactReference(form), jobs });
  console.log(JSON.stringify({ formId: form.id, jobs: jobs.length, out }));
} else if (command === 'collect') {
  const form = api.parseFormVersion(read(args['--form']));
  const configPath = args['--config'];
  const config = read(configPath);
  const configSha256 = hash(readFileSync(configPath));
  const configs = new Map([[configSha256, config]]);
  if (args['--additional-configs'])
    for (const path of read(args['--additional-configs'])) {
      const additional = read(path);
      if (
        additional.policyVersion !== config.policyVersion ||
        additional.checklistVersion !== config.checklistVersion ||
        JSON.stringify([...additional.authorFamilyIds].sort()) !==
          JSON.stringify([...config.authorFamilyIds].sort())
      )
        throw new Error(
          'Additional configured runtime lanes must use the same review policy and author families.',
        );
      configs.set(hash(readFileSync(path)), additional);
    }
  const out = outputDirectory(args['--out']);
  const runRoot = realpathSync(args['--runs']);
  if (!inside(realpathSync(join(homedir(), '.dharma')), runRoot))
    throw new Error('Runtime receipts must come from the host review directory under ~/.dharma.');
  const receipts = [];
  const rejected = [];
  const verifiedRoles = new Map();
  for (const name of readdirSync(runRoot)
    .filter((name) => name.endsWith('.runtime.json'))
    .sort()) {
    const path = join(runRoot, name);
    const run = read(path);
    const runConfig = configs.get(run.configSha256);
    const lane = runConfig?.lanes?.find((lane) => lane.id === run.laneId);
    try {
      if (run.status !== 'completed' || !runConfig || !lane || !lane.roles.includes(run.role))
        throw new Error('runtime-not-verified');
      if (
        run.model.providerId !== lane.provider ||
        run.model.familyId !== lane.familyId ||
        !run.identityVerified
      )
        throw new Error('runtime-identity-mismatch');
      if (run.transport !== 'dharma-runtime-provider')
        throw new Error('runtime-transport-mismatch');
      const responsePath = resolve(runRoot, run.responseFile);
      const requestPath = resolve(runRoot, run.requestFile);
      if (!inside(runRoot, responsePath) || !inside(runRoot, requestPath))
        throw new Error('runtime-evidence-path');
      const responseBytes = readFileSync(responsePath);
      const requestBytes = readFileSync(requestPath);
      if (hash(responseBytes) !== run.responseSha256 || hash(requestBytes) !== run.requestSha256)
        throw new Error('runtime-evidence-changed');
      const request = JSON.parse(requestBytes.toString('utf8'));
      const packet = api.createAiReviewInput(form, run.role, run.itemIds, presentation);
      if (
        run.inputSha256 !== packet.inputSha256 ||
        JSON.stringify(request.packet) !== JSON.stringify(packet)
      )
        throw new Error('runtime-input-mismatch');
      const response = JSON.parse(responseBytes.toString('utf8'));
      if (response.model !== run.responseModel) throw new Error('runtime-response-identity');
      const nativeAudioEvidence =
        lane.provider === 'openrouter'
          ? verifyNativeAudioGuard(run, lane, runRoot, request, response, packet)
          : [];
      let content = response.content.trim();
      if (content.startsWith('```'))
        content = content.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '');
      const finding = JSON.parse(content);
      // References are transport-owned metadata. Models identify an item; they
      // are never asked to reproduce SHA bytes or grant their own version binding.
      for (const answer of finding.answers ?? []) {
        const item = packet.payload.items.find((entry) => entry.item.id === answer.item?.id);
        if (!item) throw new Error('unknown-reviewed-item');
        answer.item = item.item;
      }
      for (const check of finding.itemChecks ?? []) {
        const item = packet.payload.items.find((entry) => entry.item.id === check.item?.id);
        if (!item) throw new Error('unknown-reviewed-item');
        check.item = item.item;
      }
      for (const inspection of finding.inspections ?? []) {
        const media = packet.payload.media.find((entry) => entry.media.id === inspection.media?.id);
        if (!media) throw new Error('unknown-reviewed-media');
        inspection.media = media.media;
        if (
          !run.attachments.some(
            (attachment) =>
              attachment.sha256 === inspection.bytesSha256 &&
              attachment.mediaId === inspection.media.id &&
              attachment.mode === inspection.mode,
          )
        )
          throw new Error('unobserved-media-claim');
      }
      const receipt = api.createAiEditorialReceipt({
        ...finding,
        format: 'kairo-assessment-ai-editorial-receipt',
        v: 2,
        id: run.id,
        form: api.artifactReference(form),
        role: run.role,
        itemIds: run.itemIds,
        model: { ...run.model, modelId: response.model },
        checklistVersion: config.checklistVersion,
        inputSha256: run.inputSha256,
        ...(packet.payload.presentation
          ? { presentationSha256: packet.payload.presentation.deliverySha256 }
          : {}),
        decidedAt: run.finishedAt,
        evidenceRefs: [
          `runtime:${hash(readFileSync(path))}`,
          `request:${run.requestSha256}`,
          `response:${run.responseSha256}`,
          ...nativeAudioEvidence,
        ],
      });
      receipts.push(receipt);
      const modelId = `${receipt.model.providerId}:${receipt.model.modelId}`;
      verifiedRoles.set(modelId, [
        ...new Set([...(verifiedRoles.get(modelId) || []), ...lane.roles]),
      ]);
    } catch (error) {
      rejected.push({ file: name, reason: error.message });
    }
  }
  const resolutions = [],
    rejectedResolutions = [],
    adjudicators = [];
  if (args['--resolution-runs']) {
    const resolutionConfigPath = args['--resolution-config'];
    if (!resolutionConfigPath)
      throw new Error('--resolution-config is required for resolution runtime receipts.');
    const resolutionConfig = read(resolutionConfigPath),
      resolutionConfigSha256 = hash(readFileSync(resolutionConfigPath));
    if (
      resolutionConfig.policyVersion !== config.policyVersion ||
      resolutionConfig.checklistVersion !== config.checklistVersion
    )
      throw new Error('Resolution policy must match the original configured review policy.');
    const root = realpathSync(args['--resolution-runs']);
    if (!inside(realpathSync(join(homedir(), '.dharma')), root))
      throw new Error('Resolution receipts must stay under ~/.dharma.');
    for (const name of readdirSync(root)
      .filter((name) => name.endsWith('.runtime.json'))
      .sort()) {
      try {
        const path = join(root, name),
          run = read(path);
        const lane = resolutionConfig.lanes?.find((lane) => lane.id === run.laneId);
        if (
          run.status !== 'completed' ||
          run.transport !== 'dharma-runtime-provider' ||
          run.role !== 'concern-adjudicator' ||
          run.configSha256 !== resolutionConfigSha256 ||
          !lane?.roles.includes('concern-adjudicator') ||
          !run.identityVerified ||
          run.model.providerId !== lane.provider ||
          run.model.familyId !== lane.familyId ||
          run.attachments.length
        )
          throw new Error('resolution-runtime-not-verified');
        const requestPath = resolve(root, run.requestFile),
          responsePath = resolve(root, run.responseFile);
        if (!inside(root, requestPath) || !inside(root, responsePath))
          throw new Error('resolution-evidence-path');
        const requestBytes = readFileSync(requestPath),
          responseBytes = readFileSync(responsePath);
        if (hash(requestBytes) !== run.requestSha256 || hash(responseBytes) !== run.responseSha256)
          throw new Error('resolution-evidence-changed');
        const request = JSON.parse(requestBytes.toString('utf8')),
          input = request.packet.payload;
        const original = receipts.find(
          (receipt) => receipt.sha256 === input.original.receiptSha256,
        );
        const replacement = receipts.find(
          (receipt) => receipt.sha256 === input.replacement.receiptSha256,
        );
        if (!original || !replacement) throw new Error('resolution-reviews-not-verified');
        const packet = api.createAiConcernResolutionInput(
          form,
          original,
          replacement,
          input.item.id,
          input.aspect,
          presentation,
        );
        if (
          run.inputSha256 !== packet.inputSha256 ||
          JSON.stringify(request.packet) !== JSON.stringify(packet) ||
          JSON.stringify(run.itemIds) !== JSON.stringify(packet.payload.itemIds)
        )
          throw new Error('resolution-input-mismatch');
        const response = JSON.parse(responseBytes.toString('utf8'));
        if (response.model !== run.responseModel) throw new Error('resolution-response-identity');
        let content = response.content.trim();
        if (content.startsWith('```'))
          content = content.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '');
        const finding = JSON.parse(content);
        const model = { ...run.model, modelId: response.model };
        const resolution = api.createAiConcernResolution({
          ...finding,
          format: 'kairo-assessment-ai-concern-resolution',
          v: 1,
          id: run.id,
          form: packet.payload.form,
          item: packet.payload.item,
          aspect: packet.payload.aspect,
          original: {
            receiptSha256: original.sha256,
            checkSha256: packet.payload.original.checkSha256,
          },
          replacement: {
            receiptSha256: replacement.sha256,
            checkSha256: packet.payload.replacement.checkSha256,
          },
          model,
          checklistVersion: config.checklistVersion,
          inputSha256: packet.inputSha256,
          ...(packet.payload.review.presentation
            ? { presentationSha256: packet.payload.review.presentation.deliverySha256 }
            : {}),
          decidedAt: run.finishedAt,
          evidenceRefs: [
            `runtime:${hash(readFileSync(path))}`,
            `request:${run.requestSha256}`,
            `response:${run.responseSha256}`,
          ],
        });
        resolutions.push(resolution);
        if (lane.adjudicator === true) adjudicators.push(model);
      } catch (error) {
        rejectedResolutions.push({ file: name, reason: error.message });
      }
    }
  }
  const reviewers = [
    ...new Map(
      receipts.map((receipt) => [
        `${receipt.model.providerId}:${receipt.model.modelId}`,
        {
          ...receipt.model,
          roles: verifiedRoles.get(`${receipt.model.providerId}:${receipt.model.modelId}`),
        },
      ]),
    ).values(),
  ];
  const authority = reviewers.length
    ? api.createHostAiReviewAuthority({
        policyVersion: config.policyVersion,
        checklistVersion: config.checklistVersion,
        authorFamilyIds: config.authorFamilyIds,
        reviewers,
        verifiedReceiptSha256: receipts.map((receipt) => receipt.sha256),
        verifiedResolutionSha256: resolutions.map((resolution) => resolution.sha256),
        concernAdjudicators: [
          ...new Map(
            adjudicators.map((model) => [`${model.providerId}:${model.modelId}`, model]),
          ).values(),
        ],
      })
    : null;
  const review = api.evaluateAiReleaseReview(form, receipts, authority, presentation, resolutions);
  write(join(out, 'receipts.json'), receipts);
  write(join(out, 'concern-resolutions.json'), resolutions);
  write(join(out, 'review.json'), {
    ...review,
    rejectedRuntimeReceipts: rejected,
    rejectedResolutionRuntimeReceipts: rejectedResolutions,
  });
  console.log(
    JSON.stringify({
      status: review.status,
      receipts: receipts.length,
      rejected: rejected.length,
      resolutions: resolutions.length,
      rejectedResolutions: rejectedResolutions.length,
      problems: review.problems,
      out,
    }),
  );
  if (!review.productionEligible || rejected.length || rejectedResolutions.length)
    process.exitCode = 1;
} else {
  console.error(
    'Usage: node scripts/review-assessment-bank.mjs prepare --form form.json --out ~/.dharma/... --checklist version [--batch-size 8] [--delivery delivery.json]\n       node scripts/review-assessment-bank.mjs prepare-resolution --form form.json --receipts receipts.json --original-sha SHA --replacement-sha SHA --item ID --aspect ASPECT --out ~/.dharma/... [--delivery delivery.json]\n       node scripts/review-assessment-bank.mjs collect --form form.json --config host.json --runs ~/.dharma/... --out ~/.dharma/... [--delivery delivery.json] [--additional-configs host-config-paths.json] [--resolution-runs ~/.dharma/... --resolution-config host-resolution.json]',
  );
  process.exitCode = 2;
}
