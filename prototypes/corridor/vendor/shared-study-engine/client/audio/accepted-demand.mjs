/** Accepted-source inventory only. Pending demands are neither prepared jobs
 * nor recordings. The observer never writes the learner's replica. */
import {payloadHash, canonicalStringify, validateEvent} from '../schema/event.mjs';
import {manualEntry} from '../player/manual-cards.mjs';
import {planCardSpeech} from './card-speech-plan.mjs';

const MAX_DEMANDS = 20_000, MAX_BYTES = 32 * 1024 * 1024;
const check = (ok, reason) => { if (!ok) throw new TypeError(reason); };
const text = value => typeof value === 'string' && /\S/u.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const own = (value, key) => Object.hasOwn(value, key);

// Validate before copying: getters, sparse arrays and foreign prototypes must
// not be laundered into apparently accepted source JSON.
function json(value) {
  if (value && typeof value === 'object') {
    const array = Array.isArray(value);
    check(array ? Object.getPrototypeOf(value) === Array.prototype :
      [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'source must be plain JSON');
    const keys = Reflect.ownKeys(value);
    if (array) check(keys.length === value.length + 1, 'source requires dense JSON arrays');
    for (const key of keys) {
      if (array && key === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(value, key);
      check(typeof key === 'string' && d.enumerable && own(d, 'value'), 'source requires JSON data properties');
      json(d.value);
    }
  } else canonicalStringify(value);
  return value;
}
const copy = value => JSON.parse(canonicalStringify(json(value)));
function record(value) {
  check(value && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'source requires a plain record');
  return value;
}
function bounded(rows) {
  check(Array.isArray(rows) && rows.length <= MAX_DEMANDS, 'audio demand limit');
  return rows;
}
function projectionOf(state, replicaScope) {
  record(state); record(replicaScope);
  const p = state.projection;
  check(p && p.format === 'nihongo-projection' && p.version === 4 && !p.error && !p.updateRequired &&
    !state.blocked && p.appliedSeq === state.appliedSeq, 'accepted audio requires compatible unblocked projection');
  check(['environment', 'learner', 'installation'].every(k => text(replicaScope[k]) && state.scope?.[k] === replicaScope[k]) &&
    p.learner === replicaScope.learner, 'accepted audio replica scope/learner mismatch');
  check(integer(state.epoch) && p.epoch === state.epoch, 'accepted audio epoch mismatch');
  record(p.tasks);
  return p;
}
function taskMatches(entry, p) {
  const t = p.tasks[entry.taskKey];
  check(entry.contentReady === true && t && t.taskKey === entry.taskKey && t.noteGuid === entry.noteGuid &&
    t.contract === entry.contractId && t.passageId === entry.passageId &&
    (entry.contentRevision == null || t.contentRevision === entry.contentRevision), 'accepted source task changed or missing');
}
function manualSources(state, p) {
  const members = Object.entries(record(p.manualCards ?? {})).sort(([a], [b]) => a.localeCompare(b));
  bounded(members);
  if (!members.length) return [];
  const ids = new Set(members.map(([id]) => id)), proofs = new Map();
  // Inspect only the owners selected by projection membership, never all
  // manual-card events (duplicates and losing aliases are not accepted owners).
  for (const row of Object.values(state.canonical)) if (row.seq <= state.appliedSeq && ids.has(row.event?.id)) proofs.set(row.event.id, row);
  return members.map(([eventId, entry]) => {
    const canonical = proofs.get(eventId), local = state.local[eventId], row = canonical ?? local, event = row?.event;
    check(event?.id === eventId && event.type === 'manual-card' && event.learner === p.learner &&
      event.epoch === state.epoch && validateEvent(event).ok && row.bodyHash === payloadHash(event), 'manual source owner proof/hash mismatch');
    if (local) check(local.event?.id === eventId && local.event.learner === p.learner &&
      local.event.epoch === state.epoch && local.event.install === state.scope.installation &&
      local.bodyHash === payloadHash(local.event) && local.bodyHash === row.bodyHash, 'manual local owner proof mismatch');
    const expected = manualEntry(event, Math.min(event.ts, row.rt ?? event.ts));
    check(canonicalStringify(json(entry)) === canonicalStringify(expected), 'manual accepted owner source changed');
    taskMatches(entry, p);
    return {entry: expected, sourceProof: {kind: 'manual-card', eventId, bodyHash: row.bodyHash}};
  });
}
function configuration(input) {
  check(text(input.sourceRevision) && text(input.correctionLedgerRevision), 'accepted source revision required');
  const scope = copy(record(input.scope));
  check(Object.keys(scope).length === 2 && text(scope.accessScope) && text(scope.licenseScope), 'explicit audio scope required');
  const assignments = copy(record(input.assignments ?? {}));
  check(Object.keys(assignments).every(k => ['profiles', 'languageAssignments', 'readingAssignments'].includes(k)), 'unknown audio assignment');
  for (const k of ['profiles', 'languageAssignments', 'readingAssignments']) record(assignments[k] ?? {});
  for (const k of ['languageAssignments', 'readingAssignments']) {
    for (const value of Object.values(assignments[k] ?? {})) record(value);
  }
  return {sourceRevision: input.sourceRevision, correctionLedgerRevision: input.correctionLedgerRevision, scope,
    assignments: {profiles: assignments.profiles ?? {}, languageAssignments: assignments.languageAssignments ?? {},
      readingAssignments: assignments.readingAssignments ?? {}}};
}
function denseSourceArray(value) {
  check(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype &&
    value.length <= MAX_DEMANDS && Reflect.ownKeys(value).length === value.length + 1, 'bounded dense source array required');
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    check(d && d.enumerable && own(d, 'value'), 'source array data properties required');
  }
  return value;
}
function addGrammar(index, source) {
  const g = grammarSource(source);
  check(text(g.guid) && !index.grammar.has(g.guid), 'duplicate or missing grammar source');
  index.grammar.set(g.guid, g);
}
function addCatalog(index, source) {
  const e = speechSource(source);
  check(text(e.taskKey) && !index.keys.has(e.taskKey) && e.manual !== true, 'duplicate or noncatalog source owner');
  index.keys.add(e.taskKey); index.entries.push(e);
}
function emptySourceIndex() { return {entries: [], grammar: new Map(), keys: new Set()}; }
function sourceIndex(catalog, grammarRecords) {
  const index = emptySourceIndex();
  for (const g of denseSourceArray(grammarRecords)) addGrammar(index, g);
  for (const e of denseSourceArray(catalog)) addCatalog(index, e);
  return index;
}
async function deferredSourceIndex(catalog, grammarRecords, yieldTurn, closed) {
  const index = emptySourceIndex();
  let count = 0, started = Date.now();
  for (const [rows, add] of [[denseSourceArray(grammarRecords), addGrammar], [denseSourceArray(catalog), addCatalog]]) {
    for (const row of rows) {
      if (closed()) return null;
      add(index, row);
      if (++count % 8 === 0 || Date.now() - started >= 8) {
        await yieldTurn(); started = Date.now();
      }
    }
  }
  return index;
}
function ruleIndex(readingRules) {
  check(Array.isArray(readingRules), 'readingRules array required');
  const index = new Map();
  for (const rule of copy(readingRules)) {
    check(text(rule.guid), 'reading rule guid required');
    if (!index.has(rule.guid)) index.set(rule.guid, []);
    index.get(rule.guid).push(rule);
  }
  return index;
}
function selectedAssignments(assignments, entry) {
  const key = entry.taskKey, languageAssignments = {}, readingAssignments = {};
  if (entry.manual === true || own(assignments.languageAssignments, key)) {
    languageAssignments[key] = {...(entry.manual === true ? {meaning: null} : {}), ...assignments.languageAssignments[key]};
  }
  if (own(assignments.readingAssignments, key)) readingAssignments[key] = assignments.readingAssignments[key];
  return {profiles: assignments.profiles, languageAssignments, readingAssignments};
}
function privateScope(state) {
  return {environment: state.scope.environment, learner: state.scope.learner, epoch: state.epoch};
}
// Restrict persisted/resolved source to the canonical planner's input surface.
// Presentation metadata and caller extensions cannot enter a private batch.
const SOURCE_KEYS = ['taskKey','noteGuid','contractId','passageId','contentRevision','contentReady',
  'manual','term','reading','ja','defJa','meaning','note','en','collocations','rubySegments','grammarGuid'];
function projectSource(value, keys) {
  record(value);
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    check(typeof key === 'string' && d.enumerable && own(d, 'value'), 'source requires JSON data properties');
    if (keys.includes(key) && d.value !== undefined) result[key] = d.value;
  }
  return copy(result);
}
function speechSource(entry) { return projectSource(entry, SOURCE_KEYS); }
function grammarSource(value) {
  return projectSource(value, ['guid','pattern','meaning','formation','nuance','examples','relatedReferences','fieldTokens']);
}
function plannedDemand({entry, sourceProof}, context) {
  const {sources, rules, config, namespace} = context;
  const grammarRecords = entry.contractId === 'vocabulary.read.v1' ? [] : [sources.grammar.get(entry.noteGuid)];
  check(grammarRecords.every(Boolean), 'missing accepted grammar source');
  const batch = {catalog: [speechSource(entry)], grammarRecords: grammarRecords.map(grammarSource), sourceRevision: config.sourceRevision, scope: config.scope,
    assignments: selectedAssignments(config.assignments, entry)};
  const plan = planCardSpeech({...batch, ...batch.assignments, correctionLedgerRevision: config.correctionLedgerRevision,
    readingRules: rules.get(entry.noteGuid) ?? []});
  const audioContentRevision = plan.tasks[0].audioContentRevision;
  const ownerKey = payloadHash({namespace, kind: sourceProof.kind,
    owner: sourceProof.kind === 'manual-card' ? sourceProof.eventId : sourceProof.taskKey});
  // Identity always binds the complete selected source, including blocked fields
  // and explicit profiles. Emitting a reference must not change that identity.
  const demandId = payloadHash({format: 'nihongo-accepted-audio-demand', version: 1, ownerKey, sourceProof,
    audioContentRevision, batch, correctionLedgerRevision: config.correctionLedgerRevision});
  const pendingReasons = new Set(plan.tasks[0].fields.flatMap(f => f.pendingReasons));
  pendingReasons.add('preparation-required');
  if (Object.keys(config.assignments.profiles).length) pendingReasons.add('profile-review-pending');
  if (config.scope.licenseScope.startsWith('pending:')) pendingReasons.add('license-pending');
  if (sourceProof.kind === 'catalog') pendingReasons.add('source-resolution-required');
  return {batch, demand: {demandId, ownerKey, audioContentRevision, sourceProof,
    batch: sourceProof.kind === 'catalog' ? null : batch, state: 'pending', pendingReasons: [...pendingReasons].sort()}};
}
function unsupportedDemands(rows, context) {
  const seen = new Set();
  return copy(bounded(rows)).filter(row => row.status === 'accepted').map(row => {
    check(text(row.sourceId) && text(row.contractId) && text(row.sourceRevision) && !seen.has(row.sourceId), 'unsupported source identity required');
    seen.add(row.sourceId);
    const sourceProof = {kind: 'unsupported', sourceId: row.sourceId, contractId: row.contractId, sourceRevision: row.sourceRevision};
    const ownerKey = payloadHash({namespace: context.namespace, kind: 'unsupported', owner: row.sourceId});
    const audioContentRevision = payloadHash(sourceProof);
    const demandId = payloadHash({ownerKey, sourceProof, audioContentRevision, config: context.config});
    return {demandId, ownerKey, audioContentRevision, sourceProof, batch: null, state: 'pending', pendingReasons: ['unsupported-contract']};
  });
}
function catalogSource(entry, config) {
  return {entry, sourceProof: {kind: 'catalog', taskKey: entry.taskKey, sourceRevision: config.sourceRevision}};
}
function snapshotResult(canonical, manual, unsupported) {
  const result = {demands: bounded([...canonical, ...manual, ...unsupported]),
    coverage: {canonical: canonical.length, manual: manual.length, unsupported: unsupported.length}};
  check(new TextEncoder().encode(JSON.stringify(result)).byteLength <= MAX_BYTES, 'audio demand byte limit');
  return result;
}
function contextFor(input) {
  const p = projectionOf(input.state, input.replicaScope), config = configuration(input);
  const sources = sourceIndex(input.catalog, input.grammarRecords ?? []), rules = ruleIndex(input.readingRules ?? []);
  sources.entries.forEach(e => taskMatches(e, p));
  const manual = manualSources(input.state, p);
  check(manual.every(row => !sources.keys.has(row.entry.taskKey)), 'source owner collision');
  return {sources, rules, config, namespace: privateScope(input.state), manual};
}

/** Synchronous pure projection for explicit offline callers. */
export function acceptedAudioDemandSnapshot(input) {
  const context = contextFor(input);
  return snapshotResult(context.sources.entries.map(e => plannedDemand(catalogSource(e, context.config), context).demand),
    context.manual.map(row => plannedDemand(row, context).demand), unsupportedDemands(input.unsupportedSources ?? [], context));
}

/** Resolve against current accepted membership, then recompute the very same
 * planner and identity. A reference alone is never a preparation receipt. */
export function resolveAcceptedAudioDemand(demand, currentSnapshotInputs) {
  const context = contextFor(currentSnapshotInputs), proof = demand?.sourceProof;
  let source;
  if (proof?.kind === 'catalog') {
    const entry = context.sources.entries.find(e => e.taskKey === proof.taskKey);
    if (entry) source = catalogSource(entry, context.config);
  } else if (proof?.kind === 'manual-card') source = context.manual.find(row => row.sourceProof.eventId === proof.eventId);
  check(source, 'accepted audio source changed or missing');
  const fresh = plannedDemand(source, context);
  check(canonicalStringify(json(demand)) === canonicalStringify(fresh.demand), 'stale accepted audio demand mismatch');
  return copy(fresh.batch);
}

/** Independent, deferred observer. Fixed source arrays are caller-accepted
 * immutable values; revision changes replace their cached snapshot/index. */
export function createAcceptedAudioObserver({store, catalog, sink, getOptions = () => ({}), retryMs = 1000, debounceMs = 25}) {
  let disposed = false, timer = null, flight = null, dirty = false, unsubscribe, pendingYield;
  let status = {state: sink ? 'pending' : 'persistence-unavailable', error: null, coverage: null};
  let sources, sourceRevision, rules, correctionRevision, staticCache, manualCache, prepared, successfulFingerprint, successfulRevision;
  const waiters = new Set(), readStatus = () => copy(status);
  const settle = () => { for (const resolve of waiters) resolve(readStatus()); waiters.clear(); };
  // Per-yield task channels avoid nested background timer throttling.
  const yieldTurn = () => new Promise((resolve, reject) => {
    let channel, yieldTimer = null, settled = false;
    const finish = (failed = false, error) => {
      if (settled) return;
      settled = true; pendingYield = null;
      if (yieldTimer !== null) clearTimeout(yieldTimer);
      if (channel) for (const port of [channel.port1, channel.port2]) {
        try { port.close(); } catch (reason) { failed = true; error = reason; }
      }
      if (failed && !disposed) reject(error); else resolve();
    };
    pendingYield = () => finish();
    try {
      if (typeof globalThis.MessageChannel === 'function') {
        channel = new globalThis.MessageChannel();
        channel.port1.onmessage = () => finish();
        channel.port1.onmessageerror = () => finish(true, new Error('audio demand batch yield failed'));
        channel.port2.postMessage(null);
      } else yieldTimer = setTimeout(() => finish(), 0);
    } catch (error) { finish(true, error); }
  });
  async function planRows(rows, context) {
    const result = [];
    let started = Date.now();
    for (let i = 0; i < rows.length; i++) {
      if (disposed) return null;
      result.push(plannedDemand(rows[i], context).demand);
      if ((i + 1) % 8 === 0 || Date.now() - started >= 8) {
        await yieldTurn();
        if (disposed) return null;
        started = Date.now();
      }
    }
    return result;
  }
  function inventory(state, input, config) {
    const p = projectionOf(state, store.scope);
    sources.entries.forEach(e => taskMatches(e, p));
    const manual = manualSources(state, p), namespace = privateScope(state);
    check(manual.every(row => !sources.keys.has(row.entry.taskKey)), 'source owner collision');
    const context = {sources, rules, config, namespace};
    const {assignments, ...identity} = config;
    const mapsFor = keys => ({profiles: assignments.profiles,
      languageAssignments: Object.fromEntries(Object.entries(assignments.languageAssignments).filter(([key]) => keys.has(key))),
      readingAssignments: Object.fromEntries(Object.entries(assignments.readingAssignments).filter(([key]) => keys.has(key)))});
    // No catalog, grammar or correction text in this per-notification hash.
    const staticKey = payloadHash({namespace, ...identity, assignments: mapsFor(sources.keys)});
    const manualKey = payloadHash({namespace, ...identity, manual,
      assignments: mapsFor(new Set(manual.map(row => row.entry.taskKey)))});
    const unsupported = unsupportedDemands(input.unsupportedSources ?? [], context);
    const fingerprint = payloadHash({staticKey, manualKey, unsupported, installation: store.scope.installation});
    return {context, manual, staticKey, manualKey, unsupported, fingerprint};
  }
  async function stillCurrent(fingerprint) {
    const state = await store.readState({requireCompatible: true});
    if (disposed) return false;
    projectionOf(state, store.scope);
    const input = getOptions(state), config = configuration(input);
    if (config.sourceRevision !== sourceRevision || config.correctionLedgerRevision !== correctionRevision ||
        inventory(state, input, config).fingerprint !== fingerprint) {
      dirty = true;
      return false;
    }
    return true;
  }
  async function observe() {
    const state = await store.readState({requireCompatible: true});
    if (disposed) return;
    const input = getOptions(state), config = configuration(input);
    projectionOf(state, store.scope);
    if (!sources || sourceRevision !== config.sourceRevision) {
      sources = await deferredSourceIndex(catalog, input.grammarRecords ?? [], yieldTurn, () => disposed);
      if (disposed) return;
      sourceRevision = config.sourceRevision;
    }
    if (!rules || correctionRevision !== config.correctionLedgerRevision) {
      rules = ruleIndex(input.readingRules ?? []); correctionRevision = config.correctionLedgerRevision;
    }
    const {context, manual, staticKey, manualKey, unsupported, fingerprint} = inventory(state, input, config);
    if (prepared?.fingerprint !== fingerprint) {
      if (staticCache?.key !== staticKey) {
        const demands = await planRows(sources.entries.map(e => catalogSource(e, config)), context);
        if (disposed) return;
        staticCache = {key: staticKey, demands};
      }
      if (manualCache?.key !== manualKey) {
        const demands = await planRows(manual, context);
        if (disposed) return;
        manualCache = {key: manualKey, demands};
      }
      prepared = {fingerprint, ...snapshotResult(staticCache.demands, manualCache.demands, unsupported)};
    }
    const ns = {...store.scope, epoch: state.epoch};
    for (let attempt = 0; attempt < 3; attempt++) {
      if (disposed) return;
      const previous = await sink.read(ns);
      if (disposed || !await stillCurrent(fingerprint)) return;
      if (fingerprint === successfulFingerprint && previous?.revision === successfulRevision) {
        status = {state: 'pending', error: null, coverage: prepared.coverage};
        return;
      }
      const currentIds = new Set(prepared.demands.map(d => d.demandId));
      const staleDemandIds = [...new Set([...(previous?.staleDemandIds ?? []),
        ...(previous?.demands ?? []).map(d => d.demandId).filter(id => !currentIds.has(id))])]
        .filter(id => !currentIds.has(id)).slice(-MAX_DEMANDS);
      const same = previous && canonicalStringify(previous.demands) === canonicalStringify(prepared.demands) &&
        canonicalStringify(previous.staleDemandIds) === canonicalStringify(staleDemandIds);
      const candidate = {revision: previous ? previous.revision + 1 : 0, demands: prepared.demands, staleDemandIds};
      check(integer(candidate.revision) && new TextEncoder().encode(JSON.stringify(candidate)).byteLength <= MAX_BYTES, 'audio demand persistence limit');
      if (same || await sink.compareAndSwap(ns, previous?.revision ?? null, structuredClone(candidate))) {
        if (disposed || !await stillCurrent(fingerprint)) return;
        successfulFingerprint = fingerprint;
        successfulRevision = same ? previous.revision : candidate.revision;
        status = {state: 'pending', error: null, coverage: prepared.coverage};
        return;
      }
    }
    throw new Error('audio demand persistence conflict');
  }
  function schedule(delay = debounceMs) {
    if (disposed || !sink) return;
    dirty = true;
    if (flight || timer !== null) return;
    timer = setTimeout(() => {
      timer = null; dirty = false;
      flight = observe().catch(() => {
        if (!disposed) status = {...status, state: 'error', error: 'accepted-audio-observation-failed'};
      }).finally(() => {
        flight = null;
        if (disposed) return settle();
        if (dirty) schedule();
        else { settle(); if (status.state === 'error') schedule(retryMs); }
      });
    }, Math.max(0, delay));
  }
  if (sink) { unsubscribe = store.subscribe(() => schedule()); schedule(); }
  return Object.freeze({status: readStatus,
    flush() {
      if (disposed || !sink) return Promise.resolve(readStatus());
      const done = new Promise(resolve => waiters.add(resolve));
      if (timer !== null) { clearTimeout(timer); timer = null; }
      schedule(0);
      return done;
    },
    dispose() { if (disposed) return; disposed = true; clearTimeout(timer); pendingYield?.(); unsubscribe?.(); settle(); },
  });
}
