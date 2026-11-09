import {canonicalStringify, payloadHash, sha256} from '../schema/event.mjs';
import {resolveAcceptedAudioDemand} from '../audio/accepted-demand.mjs';
import {studyAudioSourcePlan,studyAudioProfileAssignments} from './study-audio.mjs';
import {planCardSpeech} from '../audio/card-speech-plan.mjs';
import {createJapaneseOnlySelection} from '../audio/japanese-only-selection.mjs';
import {assertJapaneseOnlyRuntimeField} from '../audio/japanese-only-runtime-guard.mjs';
import {passageReadingRules, passageReadingLedgerSha256} from '../player/passage-reading-rules.mjs';
import {validateAudioCapability} from './audio-resources.mjs';

const AUTHORITY_KEYS = ['identities', 'correctionLedgerRevision', 'defaultProfileId', 'profiles'];
const GRANT_KEYS = ['revision', 'namespace', 'releaseId', 'packIds', 'profileIds', 'scope'];

function invalid(message) {
  const error = Error(`audio-pack-admission-${message}`);
  error.audioCode = 'integrity';
  return error;
}

function cancelled() {
  const error = Error('audio-pack-admission-cancelled');
  error.name = 'AbortError';
  error.audioCode = 'cancelled';
  return error;
}

function alive(signal) {
  if (signal?.aborted) throw cancelled();
}

async function call(callback, signal) {
  alive(signal);
  if (!signal) return callback();
  let remove;
  const interruption = new Promise((_, reject) => {
    const abort = () => reject(cancelled());
    signal.addEventListener('abort', abort, {once: true});
    remove = () => signal.removeEventListener('abort', abort);
  });
  try {
    return await Promise.race([Promise.resolve().then(callback), interruption]);
  } finally {
    remove?.();
  }
}

function record(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid(`${label}-object`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) {
    throw invalid(`${label}-keys`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw invalid(`${label}-accessor`);
  }
  return value;
}

function array(value, label, limit = 4096) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > limit || Reflect.ownKeys(value).length !== value.length + 1) {
    throw invalid(`${label}-array`);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw invalid(`${label}-text`);
  canonicalStringify(value);
  return value;
}

function copyJson(value, depth = 0) {
  if (depth > 64) throw invalid('json-depth');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return canonicalStringify(value), value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw invalid('json-number');
    return value;
  }
  if (Array.isArray(value)) {
    array(value, 'json');
    return value.map(item => copyJson(item, depth + 1));
  }
  if (value === null || typeof value !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid('json-object');
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw invalid('json-property');
    }
    Object.defineProperty(result, key, {
      value: copyJson(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true,
    });
  }
  return result;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function same(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function namespaceValue(raw) {
  const value = record(raw, ['environment', 'learner', 'installation', 'epoch'], 'namespace');
  if (!Number.isSafeInteger(value.epoch) || value.epoch < 0 || Object.is(value.epoch, -0)) {
    throw invalid('namespace-epoch');
  }
  return freeze({
    environment: text(value.environment, 'namespace.environment'),
    learner: text(value.learner, 'namespace.learner'),
    installation: text(value.installation, 'namespace.installation'),
    epoch: value.epoch,
  });
}

function scopeValue(raw) {
  const value = record(raw, ['accessScope', 'licenseScope'], 'scope');
  return freeze({
    accessScope: text(value.accessScope, 'scope.accessScope'),
    licenseScope: text(value.licenseScope, 'scope.licenseScope'),
  });
}

function stringList(value, label, limit) {
  const rows = array(value, label, limit);
  const seen = new Set();
  return freeze(rows.map(row => {
    text(row, label);
    if (seen.has(row)) throw invalid(`${label}-duplicate`);
    seen.add(row);
    return row;
  }));
}

function index(rows, key, label) {
  const result = new Map();
  for (const row of array(rows, label)) {
    if (!row || typeof row !== 'object') throw invalid(`${label}-row`);
    const id = text(row[key], `${label}.${key}`);
    if (result.has(id)) throw invalid(`${label}-duplicate`);
    result.set(id, row);
  }
  return result;
}

function releaseValue(release) {
  const resources = {read: async () => { throw invalid('constructor-read'); }, packState: async () => 'missing'};
  return validateAudioCapability({protocol: 'nsrs-audio-resources/v1', release, resources}).release;
}

function authorityValue(raw) {
  const value = record(raw, AUTHORITY_KEYS, 'authority');
  const identities = record(value.identities, ['catalog', 'registry', 'grammar', 'dictionary'], 'identities');
  for (const key of ['catalog', 'registry', 'grammar', 'dictionary']) text(identities[key], `identity-${key}`);
  text(value.correctionLedgerRevision, 'correction-ledger-revision');
  const profiles = array(value.profiles, 'profiles', 16);
  const ids = new Set();
  for (const entry of profiles) {
    record(entry, ['id', 'profile'], 'profile-entry');
    text(entry.id, 'profile-id');
    if (ids.has(entry.id)) throw invalid('profile-duplicate');
    ids.add(entry.id);
  }
  if (value.defaultProfileId !== null) {
    text(value.defaultProfileId, 'default-profile-id');
    if (!ids.has(value.defaultProfileId)) throw invalid('default-profile');
  }
  return freeze(copyJson(value));
}

function registryRevision(entry, passages, examples) {
  const example = examples.get(entry.passageId);
  const passage = passages.get(entry.passageId);
  const selected = example ?? passage;
  if (selected) {
    const revision = text(selected.sourceJaSha256, 'registry-source-revision');
    if (typeof entry.ja === 'string' && revision !== sha256(entry.ja)) throw invalid('registry-source-mismatch');
    return {revision, registrySource: copyJson(selected)};
  }
  if (entry.contentRevision !== undefined && entry.contentRevision !== null) {
    return {revision: text(entry.contentRevision, 'entry-content-revision'), registrySource: null};
  }
  throw invalid('content-revision-missing');
}

export function createAudioPackAdmission({
  release, namespace, authority, scope, readCurrentSource, authorize,
} = {}) {
  const snapshotRelease = releaseValue(release);
  const snapshotNamespace = namespaceValue(namespace);
  const expectedAuthority = authorityValue(authority);
  const expectedScope = scopeValue(scope);
  if (typeof readCurrentSource !== 'function' || typeof authorize !== 'function') {
    throw new TypeError('audio-pack-admission-callbacks-required');
  }
  const binding = freeze({
    namespace: snapshotNamespace,
    releaseId: snapshotRelease.releaseId,
    projectionId: snapshotRelease.projectionId,
    contentRelease: snapshotRelease.contentRelease,
    root: snapshotRelease.root,
  });
  const profileIds = freeze(expectedAuthority.profiles.map(profile => profile.id));

  async function currentGrant(packId, signal) {
    text(packId, 'pack-id');
    const grant = await call(() => authorize({
      binding, packId, scope: expectedScope, profileIds, signal,
    }), signal);
    alive(signal);
    if (!grant) throw invalid('grant-missing');
    const value = record(grant, GRANT_KEYS, 'grant');
    const clean = freeze({
      revision: text(value.revision, 'grant-revision'),
      namespace: namespaceValue(value.namespace),
      releaseId: text(value.releaseId, 'grant-release-id'),
      packIds: stringList(value.packIds, 'grant-pack-ids', 64),
      profileIds: stringList(value.profileIds, 'grant-profile-ids', 16),
      scope: scopeValue(value.scope),
    });
    if (!same(clean.namespace, binding.namespace) || clean.releaseId !== binding.releaseId ||
        !same(clean.scope, expectedScope) || !clean.packIds.includes(packId) ||
        profileIds.some(id => !clean.profileIds.includes(id))) throw invalid('grant-mismatch');
    return clean;
  }

  async function validate(inspection, {reader, signal, placement, metadataOnly = false} = {}) {
    alive(signal);
    if (!inspection || !reader || typeof reader.resolve !== 'function') throw invalid('validation-input');
    if (expectedAuthority.correctionLedgerRevision !== passageReadingLedgerSha256) throw invalid('current-correction-ledger');
    const packId = text(inspection.pack?.id, 'inspection-pack-id');
    const root = inspection.root;
    if (!root || root.contentRelease !== binding.contentRelease || root.projectionId !== binding.projectionId) {
      throw invalid('inspection-root');
    }
    const actualAuthority = {};
    for (const key of AUTHORITY_KEYS) actualAuthority[key] = root[key];
    if (!same(actualAuthority, expectedAuthority)) throw invalid('authority-mismatch');
    const allPlacements = array(inspection.placements, 'placements', 4096);
    if (placement && !allPlacements.includes(placement)) throw invalid('placement-owner');
    const placements = placement ? [placement] : allPlacements;
    if (!placements.length) throw invalid('placements-empty');
    const grant = await currentGrant(packId, signal);
    const taskKeys = freeze([...new Set(placements.map(row => text(row.taskKey, 'placement-task-key')))].sort());
    const source = await call(() => readCurrentSource({taskKeys, signal}), signal);
    alive(signal);
    if (!source) throw invalid('source-missing');
    const revision = text(source.revision, 'source-revision');
    if (!same(namespaceValue(source.namespace), binding.namespace) ||
        source.contentRelease !== binding.contentRelease ||
        !same(authorityValue(source.authority), expectedAuthority)) throw invalid('source-scope');
    const catalog = array(source.catalog, 'catalog');
    const registry = record(source.registry, ['tasks', ...Object.keys(source.registry).filter(key =>
      ['passages', 'examples', 'notes'].includes(key) && !['tasks'].includes(key))], 'registry');
    const tasks = index(registry.tasks, 'taskKey', 'registry-tasks');
    const passages = index(registry.passages ?? [], 'passageId', 'registry-passages');
    const examples = index(registry.examples ?? [], 'exampleId', 'registry-examples');
    const catalogByTask = index(catalog, 'taskKey', 'catalog');
    const grammarByGuid = index(source.grammarRecords ?? [], 'guid', 'grammar');
    const plans = new Map();
    const manualSelections = new Map();
    const proofs = new Map();
    const japaneseSelectionDigests = new Map();

    async function manualEntryFor(taskKey) {
      if (manualSelections.has(taskKey)) return manualSelections.get(taskKey);
      const accepted = source.accepted;
      if (!accepted || typeof accepted !== 'object') throw invalid('manual-source-missing');
      const inputs = accepted.inputs;
      if (!inputs || typeof inputs !== 'object') throw invalid('manual-inputs-missing');
      const state = inputs.state;
      const replicaScope = inputs.replicaScope;
      if (!state || !replicaScope || state.epoch !== binding.namespace.epoch ||
          state.scope?.environment !== binding.namespace.environment ||
          state.scope?.learner !== binding.namespace.learner ||
          state.scope?.installation !== binding.namespace.installation ||
          replicaScope.environment !== binding.namespace.environment ||
          replicaScope.learner !== binding.namespace.learner ||
          replicaScope.installation !== binding.namespace.installation ||
          inputs.correctionLedgerRevision !== expectedAuthority.correctionLedgerRevision ||
          !same(scopeValue(inputs.scope), expectedScope)) throw invalid('manual-replica-scope');
      text(inputs.sourceRevision, 'manual-source-revision');
      let selection = null;
      for (const demand of array(accepted.demands, 'accepted-demands', 20000)) {
        if (demand?.sourceProof?.kind !== 'manual-card') continue;
        let batch;
        try { batch = resolveAcceptedAudioDemand(demand, inputs); }
        catch { throw invalid('manual-owner-proof'); }
        if (!same(scopeValue(batch.scope), expectedScope)) throw invalid('manual-batch-scope');
        const entries = array(batch.catalog, 'manual-catalog', 1);
        for (const raw of entries) {
          if (raw.taskKey !== taskKey) continue;
          if (selection) throw invalid('manual-owner-ambiguous');
          const entry = copyJson(raw);
          const contentRevision = text(entry.contentRevision, 'manual-content-revision');
          const selected = {
            entry, contentRevision, registrySource: null,
            proof: {demand: copyJson(demand), batch: copyJson(batch)},
          };
          selection = selected;
          manualSelections.set(taskKey, selected);
        }
      }
      if (!selection) throw invalid('manual-owner-missing');
      return selection;
    }

    for (const row of placements) {
      const taskKey = row.taskKey;
      let selected;
      const raw = catalogByTask.get(taskKey);
      if (raw) {
        if (raw.manual === true) throw invalid('canonical-manual-source');
        const entry = copyJson(raw);
        const registered = tasks.get(taskKey);
        if (!registered || registered.noteGuid !== entry.noteGuid ||
            (registered.contractId ?? registered.contract) !== entry.contractId ||
            registered.passageId !== entry.passageId ||
            taskKey !== JSON.stringify([entry.noteGuid, entry.contractId, entry.passageId])) {
          throw invalid('registry-task-mismatch');
        }
        if (registered.player !== undefined && entry.player !== undefined &&
            !same(registered.player, entry.player)) throw invalid('registry-player-mismatch');
        const {revision: contentRevision, registrySource} = registryRevision(entry, passages, examples);
        let grammarRecord;
        if (entry.grammarGuid !== undefined) {
          const grammar = grammarByGuid.get(entry.grammarGuid);
          if (!grammar) throw invalid('grammar-missing');
          grammarRecord = copyJson(grammar);
        }
        const fullEntry = grammarRecord ? {...entry, grammarRecord} : entry;
        selected = {
          entry: fullEntry, contentRevision,
          proof: {kind: 'catalog', entry: fullEntry,
            registryTask: copyJson(registered), registrySource},
        };
      } else {
        const manual = await manualEntryFor(taskKey);
        selected = {
          entry: manual.entry, contentRevision: manual.contentRevision,
          proof: {kind: 'manual-card', ...manual.proof},
        };
      }
      let plan = plans.get(taskKey);
      if (!plan) {
        try {
          plan = studyAudioSourcePlan(selected.entry, source.selectedAssignments ?? source.accepted?.inputs?.assignments ?? {}, {version: root.version === 2 ? 2 : 1});
        } catch { throw invalid('source-plan'); }
        plans.set(taskKey, plan);
      }
      // Rebuild the complete current task, including exclusions and reading identity.
      // The request scope comes from the validated owning task, never selection rows.
      const assignments = source.selectedAssignments ?? source.accepted?.inputs?.assignments ?? {};
      let japanesePlan, japaneseSelection;
      try {
        const selectedMap = values => Object.hasOwn(values ?? {}, taskKey) ? {[taskKey]: values[taskKey]} : {};
        japanesePlan = planCardSpeech({catalog: [selected.entry],
          grammarRecords: selected.entry.grammarRecord ? [selected.entry.grammarRecord] :
            source.grammarRecords ?? [], readingRules: passageReadingRules,
          sourceRevision: revision, correctionLedgerRevision: expectedAuthority.correctionLedgerRevision,
          profiles: {}, languageAssignments: selectedMap(assignments.languageAssignments),
          readingAssignments: selectedMap(assignments.readingAssignments), scope: expectedScope});
        const options = {plan: japanesePlan, sourceRevision: revision,
          correctionLedgerRevision: expectedAuthority.correctionLedgerRevision, taskKeys: [taskKey]};
        japaneseSelection = createJapaneseOnlySelection(options);
        assertJapaneseOnlyRuntimeField({...options, selection: japaneseSelection, taskKey,
          fieldId: row.fieldId, profileId: row.version === 2 ? row.profileAssignments?.ja : row.profileId,
          profiles: expectedAuthority.profiles, assignments});
        const field = japanesePlan.tasks[0].fields.find(field => field.sourcePath === row.fieldId);
        if (row.language !== 'ja' || row.contentRevision !== selected.contentRevision ||
            row.audioContentRevision !== japanesePlan.tasks[0].audioContentRevision ||
            row.sourceSha256 !== field.sourceHash || row.sourceBytes !== new TextEncoder().encode(field.sourceText).length) {
          throw invalid('japanese-field-binding');
        }
        let whole = '', offset = 0;
        const directives = [];
        for (const piece of row.segments) {
          if (row.version === 2 && (piece.language !== 'ja' || piece.profileId !== row.profileAssignments.ja)) {
            throw invalid('japanese-segment-profile');
          }
          if (!same(piece.speechInput.profile, assignments.profiles.ja)) throw invalid('japanese-speech-profile');
          for (const segment of piece.speechInput.segments) {
            if (segment.language !== 'ja') throw invalid('japanese-segment-language');
            for (const directive of segment.pronunciationDirectives) directives.push({
              start: directive.start + offset, end: directive.end + offset, reading: directive.reading});
            whole += segment.text; offset += Array.from(segment.text).length;
          }
        }
        if (whole !== field.sourceText || !same(directives, field.readingEvidence.map(({start,end,reading}) => ({start,end,reading})))) {
          throw invalid('japanese-whole-field');
        }
      } catch (error) {
        if (error?.audioCode === 'integrity') throw error;
        throw invalid('japanese-selection');
      }
      japaneseSelectionDigests.set(taskKey, japaneseSelection.digest);
      if (metadataOnly) continue;
      const result = await call(() => reader.resolve({
        taskKey,
        contentRevision: selected.contentRevision,
        audioContentRevision: plan.audioContentRevision,
        contentRelease: binding.contentRelease,
        fields: [row.fieldId],
        ...(root.version === 2 ? {version: 2, profileAssignments: studyAudioProfileAssignments(root, source.selectedAssignments ?? source.accepted?.inputs?.assignments ?? {}, plan.sourceFields, [row.fieldId])} : {profileId: row.profileId}),
        supportedReadingId: row.supportedReadingId,
        face: 'answer',
        sourceFields: plan.sourceFields,
      }, {signal}), signal);
      alive(signal);
      if (result?.status === 'cancelled') throw cancelled();
      if (result?.status === 'offline-missing') {
        const error = Error('audio-pack-admission-source-offline');
        error.audioCode = 'offline';
        throw error;
      }
      if (result?.status !== 'ready') throw invalid(`source-resolution-${result?.status ?? 'missing'}`);
      const previous = proofs.get(taskKey);
      const proof = {contentRevision: selected.contentRevision, ...selected.proof};
      if (previous && !same(previous, proof)) throw invalid('task-source-conflict');
      proofs.set(taskKey, proof);
    }
    alive(signal);
    return freeze({
      sourceRevision: revision,
      grantRevision: grant.revision,
      fingerprint: payloadHash({
        binding, packId, grant, sourceRevision: revision,
        japaneseSelectionDigests: [...japaneseSelectionDigests.entries()].sort(([left], [right]) => left.localeCompare(right)),
        tasks: [...proofs.entries()].sort(([left], [right]) => left.localeCompare(right)),
      }),
    });
  }

  return Object.freeze({
    binding,
    authorize(packId, {signal} = {}) { return currentGrant(packId, signal); },
    validate,
  });
}
