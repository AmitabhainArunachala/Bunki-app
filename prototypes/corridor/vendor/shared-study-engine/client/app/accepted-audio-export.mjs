/** Explicit, private source capture. This module never writes either store.
 * Revisions are observations; the selected demand record is not a CAS value. */
import {canonicalStringify} from '../schema/event.mjs';
import {resolveAcceptedAudioDemand} from '../audio/accepted-demand.mjs';

const MAX_ROWS = 20_000, MAX_SELECTED = 64, MAX_BYTES = 8 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/, ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
// Keep this projection aligned with accepted-demand's speechSource/grammarSource.
const SOURCE_KEYS = ['taskKey','noteGuid','contractId','passageId','contentRevision','contentReady',
  'manual','term','reading','ja','defJa','meaning','note','en','collocations','rubySegments','grammarGuid'];
const GRAMMAR_KEYS = ['guid','pattern','meaning','formation','nuance','examples','relatedReferences','fieldTokens'];
const TASK_KEYS = ['taskKey','noteGuid','contract','passageId','contentRevision'];
const ASSIGNMENT_KEYS = ['profiles','languageAssignments','readingAssignments'];
const own = (value, key) => Object.hasOwn(value, key);
const integer = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const text = value => typeof value === 'string' && /\S/u.test(value);
const hash = value => typeof value === 'string' && HASH.test(value);
class Pending extends Error {
  constructor(reason) { super(`accepted-audio-export-pending: ${reason}`); }
}
const check = (ok, reason = 'invalid source') => { if (!ok) throw new Pending(reason); };

// Inspect descriptors before accessing values, including ignored metadata.
// Only selected JSON values are copied; accessors are never evaluated.
function record(value) {
  check(value && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)));
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    check(typeof key === 'string' && d.enumerable && own(d, 'value'));
  }
  return value;
}
function exact(value, keys) {
  record(value);
  check(Object.keys(value).length === keys.length && keys.every(key => own(value, key)));
  return value;
}
function array(value, limit = MAX_ROWS) {
  check(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype);
  check(value.length <= limit && Reflect.ownKeys(value).length === value.length + 1);
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    check(d && d.enumerable && own(d, 'value'));
  }
  return value;
}
function copy(value, active = new Set(), depth = 0, budget = {nodes: 0}) {
  check(depth <= 64 && ++budget.nodes <= 2_000_000, 'source bounds');
  if (value === null || typeof value !== 'object') {
    canonicalStringify(value);
    return value;
  }
  check(!active.has(value), 'cyclic source'); active.add(value);
  let result;
  if (Array.isArray(value)) result = array(value).map(v => copy(v, active, depth + 1, budget));
  else result = Object.fromEntries(Object.entries(record(value)).map(([key, v]) =>
    [key, copy(v, active, depth + 1, budget)]));
  active.delete(value);
  return result;
}
function pick(value, keys, required = false) {
  record(value);
  if (required) check(keys.every(key => own(value, key)));
  return Object.fromEntries(keys.filter(key => own(value, key) && value[key] !== undefined)
    .map(key => [key, copy(value[key])]));
}
const same = (a, b) => canonicalStringify(a) === canonicalStringify(b);
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function portValue(port, key) {
  const d = port && Object.getOwnPropertyDescriptor(port, key);
  check(d && own(d, 'value'), 'unavailable port');
  return d.value;
}

function replicaScope(value) {
  exact(value, ['environment','learner','installation']);
  check(Object.values(value).every(v => typeof v === 'string' && ID.test(v) && !/^nsrs_/i.test(v)), 'invalid namespace');
  return copy(value);
}
function acceptedState(state, scope) {
  record(state);
  const actualScope = replicaScope(state.scope), p = record(state.projection);
  check(same(actualScope, scope) && state.format === 'nsrs-replica-store/v1', 'replica scope mismatch');
  check(integer(state.storageRevision) && state.storageRevision > 0 && integer(state.epoch) && integer(state.appliedSeq), 'invalid store cursors');
  check(state.blocked === null && p.format === 'nihongo-projection' && p.version === 4 &&
    p.error === null && p.updateRequired === null && p.learner === scope.learner &&
    p.epoch === state.epoch && p.appliedSeq === state.appliedSeq, 'incompatible projection');
  record(p.tasks); record(p.manualCards ?? {}); record(state.canonical); record(state.local);
  return {namespace: {...scope, epoch: state.epoch}, storageRevision: state.storageRevision, appliedSeq: state.appliedSeq};
}
function demandRecord(value) {
  const result = copy(value);
  exact(result, ['revision','demands','staleDemandIds']);
  check(integer(result.revision), 'invalid demand revision');
  const ids = new Set();
  for (const d of array(result.demands)) {
    exact(d, ['demandId','ownerKey','audioContentRevision','sourceProof','batch','state','pendingReasons']);
    check([d.demandId, d.ownerKey, d.audioContentRevision].every(hash) && !ids.has(d.demandId), 'invalid demand identity');
    ids.add(d.demandId);
    check(d.state === 'pending' && array(d.pendingReasons, 64).every(text));
    const p = record(d.sourceProof);
    if (p.kind === 'catalog') {
      exact(p, ['kind','taskKey','sourceRevision']);
      check(text(p.taskKey) && text(p.sourceRevision) && d.batch === null && d.pendingReasons.includes('source-resolution-required'));
    } else if (p.kind === 'manual-card') {
      exact(p, ['kind','eventId','bodyHash']);
      check(text(p.eventId) && hash(p.bodyHash));
      const b = exact(d.batch, ['catalog','grammarRecords','sourceRevision','scope','assignments']);
      check(array(b.catalog, 1).length === 1 && array(b.grammarRecords, 0).length === 0 && text(b.sourceRevision));
      record(b.catalog[0]);
      check(b.catalog[0].manual === true && b.catalog[0].contentReady === true && text(b.catalog[0].taskKey));
      exact(b.scope, ['accessScope','licenseScope']); check(Object.values(b.scope).every(text));
      exact(b.assignments, ASSIGNMENT_KEYS); record(b.assignments.profiles);
      for (const key of ['languageAssignments','readingAssignments']) {
        check(Object.keys(record(b.assignments[key])).every(k => k === b.catalog[0].taskKey));
      }
    } else {
      exact(p, ['kind','sourceId','contractId','sourceRevision']);
      check(p.kind === 'unsupported' && [p.sourceId, p.contractId, p.sourceRevision].every(text) &&
        d.batch === null && d.pendingReasons.includes('unsupported-contract'));
    }
  }
  const stale = array(result.staleDemandIds);
  check(stale.every(id => hash(id) && !ids.has(id)) && new Set(stale).size === stale.length);
  check(bytes(result) <= 32 * 1024 * 1024, 'demand record bounds');
  return result;
}
function selectionOptions(value) {
  record(value);
  check(Object.keys(value).every(k => ['demandIds','limit','afterDemandId','expectedDemandRecordRevision'].includes(k)), 'invalid selection');
  const explicit = own(value, 'demandIds'), limit = value.limit === undefined ? (explicit ? MAX_SELECTED : 16) : value.limit;
  check(integer(limit) && limit > 0 && limit <= MAX_SELECTED, 'selection limit');
  const afterDemandId = value.afterDemandId ?? null;
  check(afterDemandId === null || hash(afterDemandId), 'invalid cursor');
  check(!explicit || !own(value, 'afterDemandId'), 'mixed selection');
  const expected = value.expectedDemandRecordRevision;
  check(expected === undefined || integer(expected), 'invalid demand revision');
  const demandIds = explicit ? copy(array(value.demandIds, limit)) : null;
  if (explicit) check(demandIds.length > 0 && demandIds.every(hash) && new Set(demandIds).size === demandIds.length, 'invalid selection IDs');
  return {demandIds, limit, afterDemandId, expected};
}
function select(record, options) {
  const {demandIds, limit, afterDemandId, expected} = options;
  check(expected === undefined || expected === record.revision, 'demand revision changed');
  const supported = record.demands.filter(d => d.sourceProof.kind !== 'unsupported');
  const byId = new Map(supported.map(d => [d.demandId, d]));
  let selected, remainingCount;
  if (demandIds) {
    selected = demandIds.map(id => byId.get(id));
    check(selected.every(Boolean), 'unknown, stale or unsupported demand');
    remainingCount = supported.length - selected.length;
  } else {
    const sorted = [...byId.keys()].sort();
    check(afterDemandId === null || (expected === record.revision && byId.has(afterDemandId)), 'cursor requires current demand revision');
    const start = afterDemandId === null ? 0 : sorted.indexOf(afterDemandId) + 1;
    selected = sorted.slice(start, start + limit).map(id => byId.get(id));
    remainingCount = sorted.length - start - selected.length;
  }
  check(selected.length > 0, 'no current source');
  return {selected, selection: {afterDemandId,
    nextAfterDemandId: !demandIds && remainingCount > 0 ? selected.at(-1).demandId : null,
    totalCurrentDemands: record.demands.length, eligibleCurrentDemands: supported.length,
    unsupportedCurrentDemands: record.demands.length - supported.length, selectedCount: selected.length, remainingCount}};
}

// Accepted host arrays are immutable for a source revision. Build only their
// owner lookup once, lazily; source text is projected only for selected owners.
const EMPTY = Object.freeze([]);
function sourceIndex(catalog, grammarRecords) {
  const index = (rows, key) => {
    const result = new Map();
    array(rows).forEach((raw, offset) => {
      check(raw && typeof raw === 'object' && !Array.isArray(raw) &&
        [Object.prototype, null].includes(Object.getPrototypeOf(raw)), 'invalid source owner');
      const descriptor = Object.getOwnPropertyDescriptor(raw, key);
      check(descriptor && descriptor.enumerable && own(descriptor, 'value') &&
        text(descriptor.value) && !result.has(descriptor.value), 'invalid source owner');
      result.set(descriptor.value, {raw, offset});
    });
    return result;
  };
  return {catalog, grammarRecords, entries: index(catalog, 'taskKey'), grammar: index(grammarRecords, 'guid')};
}
function indexedSource(index, key, rows, keys, ownerKey) {
  const found = index.get(key);
  if (!found) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(rows, String(found.offset));
  check(descriptor && own(descriptor, 'value') && descriptor.value === found.raw, 'source array changed');
  const result = pick(found.raw, keys);
  check(result[ownerKey] === key, 'source owner changed');
  return result;
}
function configuration(options) {
  record(options);
  check(text(options.sourceRevision) && text(options.correctionLedgerRevision), 'missing source revision');
  const scope = copy(exact(options.scope, ['accessScope','licenseScope']));
  check(Object.values(scope).every(text), 'missing explicit scope');
  const raw = record(options.assignments ?? {});
  check(Object.keys(raw).every(key => ASSIGNMENT_KEYS.includes(key)), 'unknown assignment');
  const assignments = Object.fromEntries(ASSIGNMENT_KEYS.map(key => [key, copy(record(raw[key] ?? {}))]));
  for (const key of ['languageAssignments','readingAssignments']) Object.values(assignments[key]).forEach(record);
  return {sourceRevision: options.sourceRevision, correctionLedgerRevision: options.correctionLedgerRevision,
    scope, assignments, readingRules: copy(array(options.readingRules)),
    unsupportedSources: copy(array(options.unsupportedSources ?? []))};
}
function narrowState(state, selected, sources) {
  const p = state.projection, tasks = {}, manualCards = {}, canonical = {}, local = {};
  const catalog = new Map(), grammar = new Map(), owners = new Set(), taskKeys = new Set();
  for (const demand of selected) {
    const proof = demand.sourceProof;
    let entry;
    if (proof.kind === 'catalog') {
      entry = indexedSource(sources.entries, proof.taskKey, sources.catalog, SOURCE_KEYS, 'taskKey');
      check(entry && entry.manual !== true, 'missing catalog source');
      catalog.set(entry.taskKey, entry);
      if (entry.contractId !== 'vocabulary.read.v1') {
        const g = indexedSource(sources.grammar, entry.noteGuid, sources.grammarRecords, GRAMMAR_KEYS, 'guid');
        check(g, 'missing grammar source'); grammar.set(g.guid, g);
      }
    } else {
      check(own(p.manualCards ?? {}, proof.eventId), 'missing accepted manual owner');
      entry = copy(p.manualCards[proof.eventId]); record(entry);
      check(!sources.entries.has(entry.taskKey), 'source owner collision');
      Object.defineProperty(manualCards, proof.eventId, {value: entry, enumerable: true});
      owners.add(proof.eventId);
    }
    check(text(entry.taskKey) && own(p.tasks, entry.taskKey), 'missing accepted task');
    const task = pick(p.tasks[entry.taskKey], TASK_KEYS, true);
    check(TASK_KEYS.every(key => text(task[key])), 'invalid accepted task');
    Object.defineProperty(tasks, entry.taskKey, {value: task, enumerable: true, configurable: true});
    taskKeys.add(entry.taskKey);
  }
  // Membership came from the actual projection, not a persisted manual batch.
  // Scan history only for those owners; no unrelated event body is copied.
  const found = new Set();
  if (owners.size) for (const [seq, raw] of Object.entries(state.canonical)) {
    record(raw); record(raw.event);
    if (raw.seq > state.appliedSeq || !owners.has(raw.event.id)) continue;
    check(integer(raw.seq) && raw.seq > 0 && String(raw.seq) === seq && integer(raw.rt) &&
      ['device','server'].includes(raw.authority) && !found.has(raw.event.id), 'invalid canonical owner');
    found.add(raw.event.id);
    canonical[seq] = pick(raw, ['seq','rt','authority','event','bodyHash'], true);
  }
  for (const id of owners) if (own(state.local, id)) {
    const row = pick(state.local[id], ['event','bodyHash'], true);
    record(row.event);
    check(row.event.install === state.scope.installation, 'foreign local owner');
    Object.defineProperty(local, id, {value: row, enumerable: true});
  }
  return {catalog: [...catalog.values()], grammarRecords: [...grammar.values()], taskKeys,
    state: {scope: replicaScope(state.scope), epoch: state.epoch, appliedSeq: state.appliedSeq, blocked: null,
      projection: {format: p.format, version: p.version, learner: p.learner, epoch: p.epoch, appliedSeq: p.appliedSeq,
        error: null, updateRequired: null, tasks, manualCards}, canonical, local}};
}
function capture(state, replica, getSources, rawOptions, selected) {
  const observation = acceptedState(state, replica), config = configuration(rawOptions);
  const sources = getSources(rawOptions, config.sourceRevision);
  const narrowed = narrowState(state, selected, sources);
  const assignments = {profiles: config.assignments.profiles};
  for (const key of ['languageAssignments','readingAssignments']) assignments[key] = Object.fromEntries(
    Object.entries(config.assignments[key]).filter(([taskKey]) => narrowed.taskKeys.has(taskKey)));
  const inputs = {state: narrowed.state, replicaScope: replica, catalog: narrowed.catalog, grammarRecords: narrowed.grammarRecords,
    sourceRevision: config.sourceRevision, correctionLedgerRevision: config.correctionLedgerRevision, scope: config.scope,
    assignments, readingRules: config.readingRules};
  return {observation, inputs, fingerprint: canonicalStringify({observation, config, catalog: narrowed.catalog, grammarRecords: narrowed.grammarRecords, state: narrowed.state})};
}

export function createAcceptedAudioExporter({store, sink, catalog, getOptions, isDisposed = () => false}) {
  let sources, indexedRevision, indexedGrammar;
  const getSources = (options, revision) => {
    const grammarRecords = options.grammarRecords ?? EMPTY;
    if (!sources || indexedRevision !== revision || indexedGrammar !== grammarRecords) {
      sources = sourceIndex(catalog, grammarRecords);
      indexedRevision = revision; indexedGrammar = grammarRecords;
    }
    return sources;
  };
  const available = () => {
    check(!isDisposed(), 'disposed');
    const read = portValue(sink, 'read');
    check(typeof read === 'function', 'persistence unavailable');
    return read;
  };
  return Object.freeze({async exportCurrentSource(options = {}) {
    try {
      available();
      const selection = selectionOptions(options), replica = replicaScope(portValue(store, 'scope'));
      const readState = portValue(store, 'readState');
      check(typeof readState === 'function' && typeof getOptions === 'function', 'unavailable store or configuration');
      const state = await readState.call(store, {requireCompatible: true});
      available();
      const before = acceptedState(state, replica);
      const current = demandRecord(await available().call(sink, {...before.namespace}));
      available();
      const {selected, selection: progress} = select(current, selection);
      const first = capture(state, replicaScope(portValue(store, 'scope')), getSources, getOptions(state), selected);
      check(same(first.observation, before), 'accepted state changed');
      for (const demand of selected) resolveAcceptedAudioDemand(demand, first.inputs);
      const {inputs} = first, namespace = first.observation.namespace;
      const output = {demand: {format: 'nsrs-private-audio-demand/v1', namespace,
        record: {revision: current.revision, demands: selected,
          staleDemandIds: current.staleDemandIds.filter(id => selected.some(d => d.demandId === id))}},
      currentSource: {format: 'nsrs-accepted-audio-current-source/v1', namespace, demandIds: selected.map(d => d.demandId),
        observation: {storageRevision: before.storageRevision, appliedSeq: before.appliedSeq, demandRecordRevision: current.revision},
        selection: progress, sourceRevision: inputs.sourceRevision, correctionLedgerRevision: inputs.correctionLedgerRevision,
        scope: inputs.scope, assignments: inputs.assignments, catalog: inputs.catalog, grammarRecords: inputs.grammarRecords, state: inputs.state}};
      check(bytes(output) <= MAX_BYTES, 'envelope exceeds 8 MiB');
      const latest = demandRecord(await available().call(sink, {...namespace}));
      available();
      check(same(current, latest), 'demand record changed');
      const afterState = await readState.call(store, {requireCompatible: true});
      available();
      const afterScope = replicaScope(portValue(store, 'scope'));
      acceptedState(afterState, afterScope);
      const after = capture(afterState, afterScope, getSources, getOptions(afterState), selected);
      check(first.fingerprint === after.fingerprint, 'accepted source or configuration changed');
      available();
      return output;
    } catch (error) {
      if (error instanceof Pending) throw error;
      throw new Pending('source unavailable, invalid or changed');
    }
  }});
}
