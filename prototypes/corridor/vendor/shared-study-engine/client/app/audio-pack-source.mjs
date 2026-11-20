/** Read-only, detached source projection for native audio-pack admission.
 * Caller-supplied source arrays are already byte-authenticated and immutable;
 * this module only indexes their owners once and projects selected rows. */
import {canonicalStringify, isTaskKey, payloadHash, sha256} from '../schema/event.mjs';
import {acceptedAudioSourceRevision} from './accepted-audio-host.mjs';
import {acceptedAudioDemandSnapshot} from '../audio/accepted-demand.mjs';
import {passageReadingLedgerSha256, passageReadingRules} from '../player/passage-reading-rules.mjs';

const MAX_SELECTED = 4096, MAX_ROWS = 100_000, MAX_BYTES = 32 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const AUTHORITY_KEYS = ['identities', 'correctionLedgerRevision', 'defaultProfileId', 'profiles'];
const IDENTITY_KEYS = ['catalog', 'registry', 'grammar', 'dictionary'];
const ASSIGNMENT_KEYS = ['profiles', 'languageAssignments', 'readingAssignments'];
const SOURCE_KEYS = ['taskKey','noteGuid','contractId','passageId','contentRevision','contentReady',
  'manual','term','reading','ja','defJa','meaning','note','en','collocations','rubySegments','grammarGuid'];
const GRAMMAR_KEYS = ['guid','pattern','meaning','formation','nuance','examples','relatedReferences','fieldTokens'];
const EMPTY = Object.freeze([]);
const own = (value, key) => Object.hasOwn(value, key);

function invalid(message) {
  const error = Error(`audio-pack-source-${message}`);
  error.audioCode = 'integrity';
  return error;
}

function cancelled() {
  const error = Error('audio-pack-source-cancelled');
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

function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid(`${label}-object`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor?.enumerable || !own(descriptor, 'value')) {
      throw invalid(`${label}-property`);
    }
  }
  return value;
}

function exact(value, keys, label) {
  record(value, label);
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) {
    throw invalid(`${label}-keys`);
  }
  return value;
}

function array(value, label, limit = MAX_ROWS) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      !Number.isSafeInteger(value.length) || value.length < 0 || value.length > limit ||
      Reflect.ownKeys(value).length !== value.length + 1) throw invalid(`${label}-array`);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !own(descriptor, 'value')) {
      throw invalid(`${label}-element`);
    }
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw invalid(`${label}-text`);
  canonicalStringify(value);
  return value;
}

function digestValue(value, label) {
  if (typeof value !== 'string' || !HASH.test(value)) throw invalid(`${label}-hash`);
  return value;
}

function integer(value) {
  return Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}

function same(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function copyJson(value, state = {active: new Set(), nodes: 0}, depth = 0) {
  if (depth > 64) throw invalid('json-depth');
  if (++state.nodes > 2_000_000) throw invalid('json-nodes');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    canonicalStringify(value);
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw invalid('json-number');
    return value;
  }
  if (typeof value !== 'object') throw invalid('json-value');
  if (state.active.has(value)) throw invalid('json-cycle');
  state.active.add(value);
  let result;
  if (Array.isArray(value)) {
    array(value, 'json');
    result = value.map(item => copyJson(item, state, depth + 1));
  } else {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid('json-object');
    result = {};
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor?.enumerable || !own(descriptor, 'value')) {
        throw invalid('json-property');
      }
      Object.defineProperty(result, key, {
        value: copyJson(descriptor.value, state, depth + 1),
        enumerable: true, writable: true, configurable: true,
      });
    }
  }
  state.active.delete(value);
  return result;
}

function project(value, keys, label) {
  record(value, label);
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (keys.includes(key) && descriptor.value !== undefined) {
      Object.defineProperty(result, key, {
        value: copyJson(descriptor.value), enumerable: true, writable: true, configurable: true,
      });
    }
  }
  return result;
}

function pick(value, keys, label) {
  record(value, label);
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !own(descriptor, 'value')) {
      throw invalid(`${label}-missing`);
    }
    Object.defineProperty(result, key, {
      value: copyJson(descriptor.value), enumerable: true, writable: true, configurable: true,
    });
  }
  return result;
}

function portValue(port, key) {
  const descriptor = port && typeof port === 'object'
    ? Object.getOwnPropertyDescriptor(port, key) : undefined;
  if (!descriptor || !own(descriptor, 'value')) throw invalid(`port-${key}`);
  return descriptor.value;
}

function replicaScope(raw, label) {
  const value = exact(raw, ['environment', 'learner', 'installation'], label);
  return {
    environment: text(value.environment, `${label}.environment`),
    learner: text(value.learner, `${label}.learner`),
    installation: text(value.installation, `${label}.installation`),
  };
}

function configuration(options) {
  record(options, 'options');
  const build = record(options.build, 'build');
  const files = record(build.files, 'build.files');
  const catalogIdentity = digestValue(files['catalog.json'], 'build.catalog');
  const registryIdentity = digestValue(files['registry.json'], 'build.registry');
  const grammarIdentity = digestValue(files['grammar.json'], 'build.grammar');
  const dictionaryIdentity = own(files, 'dictionary.json')
    ? digestValue(files['dictionary.json'], 'build.dictionary')
    : build.dictionarySha256 === undefined && files['dictionary.json.gz'] === undefined ? 'none'
      : digestValue(build.dictionarySha256 ?? files['dictionary.json.gz'], 'build.dictionary');

  const authority = exact(options.authority, AUTHORITY_KEYS, 'authority');
  const identities = exact(authority.identities, IDENTITY_KEYS, 'authority.identities');
  for (const key of IDENTITY_KEYS) {
    if (key === 'dictionary' && dictionaryIdentity === 'none' && identities[key] === 'none') continue;
    digestValue(identities[key], `authority.${key}`);
  }
  if (identities.catalog !== catalogIdentity || identities.registry !== registryIdentity ||
      identities.grammar !== grammarIdentity || identities.dictionary !== dictionaryIdentity) {
    throw invalid('build-identity');
  }
  if (authority.correctionLedgerRevision !== passageReadingLedgerSha256) {
    throw invalid('correction-ledger');
  }
  const profiles = array(authority.profiles, 'authority.profiles', 16);
  const profileIds = new Set();
  for (const entry of profiles) {
    exact(entry, ['id', 'profile'], 'authority.profile');
    const id = text(entry.id, 'authority.profile-id');
    if (profileIds.has(id)) throw invalid('authority.profile-duplicate');
    profileIds.add(id);
    record(entry.profile, 'authority.profile-value');
  }
  if (authority.defaultProfileId !== null) {
    text(authority.defaultProfileId, 'authority.default-profile-id');
    if (!profileIds.has(authority.defaultProfileId)) throw invalid('authority.default-profile');
  }

  const scope = exact(options.scope, ['accessScope', 'licenseScope'], 'scope');
  text(scope.accessScope, 'scope.accessScope');
  text(scope.licenseScope, 'scope.licenseScope');
  const buildSha256 = digestValue(options.buildSha256, 'build-sha256');
  return {
    buildSha256,
    sourceRevision: acceptedAudioSourceRevision({build}),
    contentRelease: `sha256:${buildSha256}`,
    authority: copyJson(authority),
    scope: {accessScope: scope.accessScope, licenseScope: scope.licenseScope},
  };
}

function buildIndex(rows, key, label) {
  array(rows, label);
  const index = new Map();
  for (const raw of rows) {
    record(raw, label);
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor || !descriptor.enumerable || !own(descriptor, 'value')) {
      throw invalid(`${label}-key`);
    }
    const id = text(descriptor.value, `${label}.${key}`);
    if (index.has(id)) throw invalid(`${label}-duplicate`);
    index.set(id, raw);
  }
  return index;
}

function indexes(options, cache) {
  const catalogRows = options.catalog;
  const registry = record(options.registry ?? {}, 'registry');
  const taskRows = registry.tasks ?? EMPTY;
  const passageRows = registry.passages ?? EMPTY;
  const exampleRows = registry.examples ?? EMPTY;
  const grammarRows = options.grammarRecords ?? EMPTY;
  const update = (slot, rows, key, label) => {
    if (!slot || slot.rows !== rows) return {rows, map: buildIndex(rows, key, label)};
    return slot;
  };
  cache.catalog = update(cache.catalog, catalogRows, 'taskKey', 'catalog');
  cache.tasks = update(cache.tasks, taskRows, 'taskKey', 'registry.tasks');
  cache.passages = update(cache.passages, passageRows, 'passageId', 'registry.passages');
  cache.examples = update(cache.examples, exampleRows, 'exampleId', 'registry.examples');
  cache.grammar = update(cache.grammar, grammarRows, 'guid', 'grammar');
  return cache;
}

function liveState(state, storeScope) {
  record(state, 'state');
  const stateScope = replicaScope(state.scope, 'state.scope');
  if (!same(stateScope, storeScope)) throw invalid('scope-mismatch');
  if (state.blocked !== null && state.blocked !== undefined) throw invalid('blocked');
  const projection = record(state.projection, 'state.projection');
  if (projection.format !== 'nihongo-projection' || projection.version !== 4) {
    throw invalid('projection-format');
  }
  if (projection.error !== null && projection.error !== undefined) throw invalid('projection-error');
  if (projection.updateRequired !== null && projection.updateRequired !== undefined) {
    throw invalid('projection-update-required');
  }
  if (!integer(state.epoch) || !integer(projection.epoch) || projection.epoch !== state.epoch) {
    throw invalid('projection-epoch');
  }
  if (!integer(state.appliedSeq) || !integer(projection.appliedSeq) ||
      projection.appliedSeq !== state.appliedSeq) throw invalid('projection-applied-seq');
  if (projection.learner !== stateScope.learner) throw invalid('projection-learner');
  return {
    namespace: {...stateScope, epoch: state.epoch},
    scope: stateScope,
    epoch: state.epoch,
    appliedSeq: state.appliedSeq,
    projection,
    tasks: record(projection.tasks ?? {}, 'projection.tasks'),
    manualCards: record(projection.manualCards ?? {}, 'projection.manual-cards'),
    canonical: record(state.canonical ?? {}, 'state.canonical'),
    local: record(state.local ?? {}, 'state.local'),
  };
}

function manualOwnerMap(manualCards) {
  const owners = new Map();
  for (const [eventId, entry] of Object.entries(manualCards)) {
    record(entry, 'manual-entry');
    const descriptor = Object.getOwnPropertyDescriptor(entry, 'taskKey');
    if (!descriptor || !descriptor.enumerable || !own(descriptor, 'value')) {
      throw invalid('manual-task-key');
    }
    const taskKey = text(descriptor.value, 'manual-task-key');
    const rows = owners.get(taskKey);
    if (rows) rows.push(eventId); else owners.set(taskKey, [eventId]);
  }
  return owners;
}

function catalogSelection(taskKey, raw, context) {
  if (raw.manual === true) throw invalid('canonical-manual-source');
  const entry = project(raw, SOURCE_KEYS, 'catalog-entry');
  const noteGuid = text(entry.noteGuid, 'catalog.noteGuid');
  const contractId = text(entry.contractId, 'catalog.contractId');
  const passageId = text(entry.passageId, 'catalog.passageId');
  if (entry.taskKey !== taskKey || entry.contentReady !== true ||
      taskKey !== JSON.stringify([noteGuid, contractId, passageId])) {
    throw invalid('catalog-task-identity');
  }

  const registered = context.registryTasks.get(taskKey);
  if (!registered) throw invalid('registry-task-missing');
  record(registered, 'registry-task');
  if (registered.taskKey !== taskKey || registered.noteGuid !== noteGuid ||
      (registered.contractId ?? registered.contract) !== contractId ||
      registered.passageId !== passageId) throw invalid('registry-task-mismatch');

  if (!own(context.live.tasks, taskKey)) throw invalid('projection-task-missing');
  const projected = record(context.live.tasks[taskKey], 'projection-task');
  if (projected.taskKey !== taskKey || projected.noteGuid !== noteGuid ||
      projected.contract !== contractId || projected.passageId !== passageId) {
    throw invalid('projection-task-mismatch');
  }

  const example = context.registryExamples.get(passageId);
  const passage = context.registryPassages.get(passageId);
  const registrySource = example ?? passage;
  let contentRevision;
  if (registrySource) {
    record(registrySource, 'registry-source');
    contentRevision = digestValue(registrySource.sourceJaSha256, 'registry-source-revision');
    if (typeof entry.ja === 'string' && sha256(entry.ja) !== contentRevision) {
      throw invalid('registry-source-digest');
    }
  } else if (entry.contentRevision !== undefined && entry.contentRevision !== null) {
    contentRevision = text(entry.contentRevision, 'catalog-content-revision');
  } else {
    throw invalid('content-revision-missing');
  }
  if (projected.contentRevision !== contentRevision) throw invalid('projection-content-revision');

  let grammarRecord = null;
  if (entry.grammarGuid !== undefined) {
    const guid = text(entry.grammarGuid, 'catalog.grammarGuid');
    const rawGrammar = context.grammar.get(guid);
    if (!rawGrammar) throw invalid('grammar-missing');
    grammarRecord = project(rawGrammar, GRAMMAR_KEYS, 'grammar');
    if (grammarRecord.guid !== guid) throw invalid('grammar-identity');
  } else if (contractId !== 'vocabulary.read.v1') {
    const rawGrammar = context.grammar.get(noteGuid);
    if (!rawGrammar) throw invalid('grammar-missing');
    grammarRecord = project(rawGrammar, GRAMMAR_KEYS, 'grammar');
    if (grammarRecord.guid !== noteGuid) throw invalid('grammar-identity');
  }

  if (example) context.selectedExamples.set(passageId, copyJson(example));
  if (passage) context.selectedPassages.set(passageId, copyJson(passage));
  context.selectedRegistryTasks.set(taskKey, copyJson(registered));
  if (grammarRecord) context.selectedGrammar.set(grammarRecord.guid, grammarRecord);
  return entry;
}

function manualSelection(taskKey, eventIds, context) {
  if (eventIds.length !== 1) throw invalid('manual-owner-ambiguous');
  const eventId = eventIds[0];
  const entry = copyJson(context.live.manualCards[eventId]);
  record(entry, 'manual-entry');
  const noteGuid = text(entry.noteGuid, 'manual.noteGuid');
  const contractId = text(entry.contractId, 'manual.contractId');
  const passageId = text(entry.passageId, 'manual.passageId');
  if (entry.taskKey !== taskKey || entry.manual !== true || entry.contentReady !== true ||
      taskKey !== JSON.stringify([noteGuid, contractId, passageId])) {
    throw invalid('manual-task-identity');
  }
  if (!own(context.live.tasks, taskKey)) throw invalid('projection-task-missing');
  const projected = record(context.live.tasks[taskKey], 'projection-task');
  if (projected.taskKey !== taskKey || projected.noteGuid !== noteGuid ||
      projected.contract !== contractId || projected.passageId !== passageId) {
    throw invalid('projection-task-mismatch');
  }
  const contentRevision = digestValue(entry.contentRevision, 'manual-content-revision');
  if (projected.contentRevision !== contentRevision) throw invalid('projection-content-revision');

  let canonical = null;
  for (const [seq, row] of Object.entries(context.live.canonical)) {
    if (row?.event?.id !== eventId || row.seq > context.live.appliedSeq) continue;
    record(row, 'canonical-owner');
    if (canonical || !integer(row.seq) || row.seq < 1 || String(row.seq) !== seq ||
        !integer(row.rt) || !['device','server'].includes(row.authority)) throw invalid('canonical-owner-envelope');
    canonical = pick(row, ['seq','rt','authority','event','bodyHash'], 'canonical-owner');
  }
  const local = own(context.live.local, eventId)
    ? pick(context.live.local[eventId], ['event','bodyHash'], 'local-owner')
    : null;
  if (!canonical && !local) throw invalid('manual-owner-missing');
  return {taskKey, eventId, entry, contentRevision, canonical, local};
}

function assignmentValue(raw) {
  const value = raw === undefined || raw === null ? {} : record(raw, 'assignments');
  for (const key of Reflect.ownKeys(value)) {
    if (!ASSIGNMENT_KEYS.includes(key)) throw invalid('assignments-key');
  }
  const result = {};
  for (const key of ASSIGNMENT_KEYS) {
    const part = value[key] ?? {};
    record(part, `assignments.${key}`);
    result[key] = copyJson(part);
  }
  for (const key of ['languageAssignments', 'readingAssignments']) {
    for (const entry of Object.values(result[key])) record(entry, `assignments.${key}`);
  }
  return result;
}

function selectedReadingRules(noteGuids) {
  const wanted = new Set(noteGuids);
  if (!wanted.size) return [];
  const result = [];
  for (const rule of array(passageReadingRules, 'reading-rules')) {
    const descriptor = Object.getOwnPropertyDescriptor(rule, 'guid');
    if (!descriptor || !descriptor.enumerable || !own(descriptor, 'value')) {
      throw invalid('reading-rule-guid');
    }
    if (wanted.has(descriptor.value)) result.push(copyJson(rule));
  }
  return result;
}

function selectedAssignments(assignments, taskKeys) {
  const keep = rows => Object.fromEntries(Object.entries(rows)
    .filter(([key]) => taskKeys.has(key)).map(([key, value]) => [key, copyJson(value)]));
  return {
    profiles: copyJson(assignments.profiles),
    languageAssignments: keep(assignments.languageAssignments),
    readingAssignments: keep(assignments.readingAssignments),
  };
}

function acceptedSource(live, selections, config, contentRelease, assignments) {
  const tasks = {}, manualCards = {}, canonical = {}, local = {};
  for (const selection of selections) {
    Object.defineProperty(tasks, selection.taskKey, {
      value: {
        taskKey: selection.taskKey,
        noteGuid: selection.entry.noteGuid,
        contract: selection.entry.contractId,
        passageId: selection.entry.passageId,
        contentRevision: selection.contentRevision,
      },
      enumerable: true, writable: true, configurable: true,
    });
    Object.defineProperty(manualCards, selection.eventId, {
      value: copyJson(selection.entry), enumerable: true, writable: true, configurable: true,
    });
    if (selection.canonical) {
      Object.defineProperty(canonical, String(selection.canonical.seq), {
        value: copyJson(selection.canonical), enumerable: true, writable: true, configurable: true,
      });
    }
    if (selection.local) {
      Object.defineProperty(local, selection.eventId, {
        value: copyJson(selection.local), enumerable: true, writable: true, configurable: true,
      });
    }
  }
  const state = {
    scope: {...live.scope},
    epoch: live.epoch,
    appliedSeq: live.appliedSeq,
    blocked: null,
    projection: {
      format: live.projection.format,
      version: live.projection.version,
      learner: live.projection.learner,
      epoch: live.projection.epoch,
      appliedSeq: live.projection.appliedSeq,
      error: null,
      updateRequired: null,
      tasks,
      manualCards,
    },
    canonical,
    local,
  };
  const taskKeySet = new Set(selections.map(selection => selection.taskKey));
  const narrowedAssignments = selectedAssignments(assignments, taskKeySet);
  const inputs = {
    state,
    replicaScope: {...live.scope},
    catalog: [],
    grammarRecords: [],
    sourceRevision: config.sourceRevision,
    correctionLedgerRevision: config.authority.correctionLedgerRevision,
    scope: config.scope,
    assignments: narrowedAssignments,
    readingRules: selectedReadingRules(selections.map(selection => selection.entry.noteGuid)),
  };
  const snapshot = acceptedAudioDemandSnapshot(inputs);
  if (snapshot.demands.length !== selections.length) throw invalid('manual-demand-count');
  const byEvent = new Map(selections.map(selection => [selection.eventId, selection]));
  for (const demand of snapshot.demands) {
    const proof = demand?.sourceProof;
    if (proof?.kind !== 'manual-card' || !byEvent.has(proof.eventId)) {
      throw invalid('manual-demand-owner');
    }
  }
  return {demands: snapshot.demands, inputs};
}

function sorted(rows, key) {
  return [...rows].sort((left, right) => left[key].localeCompare(right[key]));
}

export function createAudioPackSourceReader(options = {}) {
  if (!options || typeof options !== 'object') throw new TypeError('audio-pack-source-options');
  const cache = {};
  return async function readCurrentSource({taskKeys, signal} = {}) {
    alive(signal);
    const requested = array(taskKeys, 'taskKeys', MAX_SELECTED);
    if (requested.length === 0) throw invalid('task-keys-empty');
    const selectedKeys = [];
    const seen = new Set();
    for (const taskKey of requested) {
      if (!isTaskKey(taskKey)) throw invalid('task-key');
      if (seen.has(taskKey)) throw invalid('task-key-duplicate');
      seen.add(taskKey);
      selectedKeys.push(taskKey);
    }
    alive(signal);
    const config = configuration(options);
    const store = options.store;
    const storeScope = replicaScope(portValue(store, 'scope'), 'store.scope');
    const readState = portValue(store, 'readState');
    if (typeof readState !== 'function') throw invalid('store-read');
    const state = await call(() => readState.call(store, {requireCompatible: true}), signal);
    alive(signal);
    const live = liveState(state, storeScope);
    const sourceIndexes = indexes(options, cache);
    const owners = manualOwnerMap(live.manualCards);
    const context = {
      live,
      registryTasks: sourceIndexes.tasks.map,
      registryPassages: sourceIndexes.passages.map,
      registryExamples: sourceIndexes.examples.map,
      grammar: sourceIndexes.grammar.map,
      selectedRegistryTasks: new Map(),
      selectedPassages: new Map(),
      selectedExamples: new Map(),
      selectedGrammar: new Map(),
    };
    const catalog = [];
    const manual = [];
    for (const taskKey of selectedKeys) {
      const raw = sourceIndexes.catalog.map.get(taskKey);
      if (raw !== undefined) {
        if (owners.has(taskKey)) throw invalid('source-owner-ambiguous');
        catalog.push(catalogSelection(taskKey, raw, context));
      } else {
        const eventIds = owners.get(taskKey);
        if (!eventIds) throw invalid('unknown-task');
        manual.push(manualSelection(taskKey, eventIds, context));
      }
    }

    const registry = {
      tasks: [...context.selectedRegistryTasks.values()],
      passages: [...context.selectedPassages.values()],
      examples: [...context.selectedExamples.values()],
    };
    const grammarRecords = [...context.selectedGrammar.values()];
    let accepted;
    const getAssignments = options.getAssignments ?? (() => ({}));
    if (typeof getAssignments !== 'function') throw invalid('get-assignments');
    const assignments = selectedAssignments(assignmentValue(getAssignments(state)), new Set(selectedKeys));
    if (manual.length) {
      accepted = acceptedSource(live, manual, config, config.contentRelease, assignments);
    }

    const revision = payloadHash({
      namespace: live.namespace,
      contentRelease: config.contentRelease,
      authority: config.authority,
      scope: config.scope,
      catalog: sorted(catalog, 'taskKey'),
      registry: {
        tasks: sorted(registry.tasks, 'taskKey'),
        passages: sorted(registry.passages, 'passageId'),
        examples: sorted(registry.examples, 'exampleId'),
      },
      grammarRecords: sorted(grammarRecords, 'guid'),
      manual: sorted(manual.map(selection => ({
        taskKey: selection.taskKey,
        eventId: selection.eventId,
        entry: selection.entry,
        bodyHash: selection.canonical?.bodyHash ?? selection.local?.bodyHash ?? null,
      })), 'taskKey'),
      assignments,
      sourceRevision: config.sourceRevision,
    });
    const output = {
      revision,
      namespace: live.namespace,
      contentRelease: config.contentRelease,
      authority: config.authority,
      catalog,
      registry,
      grammarRecords,
      selectedAssignments: assignments,
    };
    if (accepted) output.accepted = accepted;
    if (new TextEncoder().encode(canonicalStringify(output)).byteLength > MAX_BYTES) {
      throw invalid('source-bytes');
    }
    return output;
  };
}
