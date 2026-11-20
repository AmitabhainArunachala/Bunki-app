/** Transactional replica store; adapters own durable compare-and-swap completion. */
import {ownsReadSnapshot} from './storage/read-ownership.mjs';
import {ownsMaterializerOutput} from './materializer.mjs';
const FORMAT = 'nsrs-replica-store/v1';
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;
const copy = value => structuredClone(value);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const safeId = value => typeof value === 'string' && ID.test(value) && !/^nsrs_/i.test(value);
const scopeKey = scope => JSON.stringify([scope.environment, scope.learner, scope.installation]);
const CODES = new Set(['invalid-scope', 'invalid-codec', 'missing-store', 'installation-exists', 'invalid-state', 'schema-unsupported',
  'invalid-event', 'invalid-hash', 'scope-mismatch', 'epoch-mismatch', 'immutable-conflict', 'sequence-conflict', 'invalid-ack',
  'invalid-head', 'head-regressed', 'invalid-projection', 'storage-conflict', 'storage-failed', 'storage-limit', 'native-receipt-limit', 'invalid-command', 'event-too-large']);
export class StoreError extends Error {
  constructor(code) { const value = CODES.has(code) ? code : 'storage-failed'; super(value); this.name = 'StoreError'; this.code = value; }
}
const check = (ok, code) => { if (!ok) throw new StoreError(code); };
const sanitized = fn => async (...args) => {
  try { return await fn(...args); } catch (error) { throw new StoreError(error instanceof StoreError ? error.code : 'storage-failed'); }
};
function checkedScope(input) {
  check(input && ['environment', 'learner', 'installation'].every(k => safeId(input[k])) && Object.keys(input).length === 3, 'invalid-scope');
  return Object.fromEntries(['environment', 'learner', 'installation'].map(k => [k, input[k]]));
}
function setup(options) {
  const scope = checkedScope(options.scope);
  const { adapter, codec, materialize } = options;
  check(adapter && typeof adapter.read === 'function' && typeof adapter.compareAndSwap === 'function' && codec &&
    ['payloadHash', 'canonicalStringify', 'validateEvent'].every(k => typeof codec[k] === 'function') && typeof materialize === 'function', 'invalid-codec');
  check(integer(options.epoch ?? 0) && Number.isSafeInteger(options.maxRecords ?? 20000) && (options.maxRecords ?? 20000) > 0 &&
    Number.isSafeInteger(options.maxBytes ?? 64 * 1024 * 1024) && (options.maxBytes ?? 64 * 1024 * 1024) > 0 &&
    Number.isSafeInteger(options.maxEventBytes ?? 240 * 1024) && (options.maxEventBytes ?? 240 * 1024) > 0 && (options.maxEventBytes ?? 240 * 1024) <= 240 * 1024 &&
    Number.isSafeInteger(options.maxConflicts ?? 32) && (options.maxConflicts ?? 32) > 0 && typeof (options.now ?? Date.now) === 'function', 'invalid-codec');
  return { scope, adapter, codec, materialize, now: options.now ?? Date.now, maxRecords: options.maxRecords ?? 20000,
    maxBytes: options.maxBytes ?? 64 * 1024 * 1024, maxEventBytes: options.maxEventBytes ?? 240 * 1024,
    epoch: options.epoch ?? 0, maxConflicts: options.maxConflicts ?? 32 };
}
function replica(config) {
  const { scope, adapter, codec, materialize, now, maxRecords, maxBytes, maxEventBytes, epoch, maxConflicts } = config;
  // Opt-in adapter contract: every read transfers an exclusively owned snapshot.
  // Generic adapters retain the defensive copies at both public and write boundaries.
  const ownsRead = ownsReadSnapshot(adapter);
  const ownsProjection = ownsMaterializerOutput(materialize);
  const subscriptions = new Set();
  const eventHash = event => {
    const hash = codec.payloadHash(event);
    check(typeof hash === 'string' && HASH.test(hash), 'invalid-hash');
    return hash;
  };
  const inspectEvent = (record, allowServer, own = false) => {
    const event = record?.event;
    check(event && typeof event === 'object' && event.learner === scope.learner && (safeId(event.install) || (allowServer && event.install === '@server')) &&
      integer(event.dseq) && event.dseq > 0 && event.id === `${event.install}:${event.dseq}` && integer(event.base) && integer(event.ts), 'invalid-event');
    check(!own || event.install === scope.installation, 'scope-mismatch');
    check(event.epoch === epoch, 'epoch-mismatch');
    check(record.bodyHash === eventHash(event), 'immutable-conflict');
    const verdict = codec.validateEvent(event, { allowServer });
    check(verdict && typeof verdict.ok === 'boolean', 'invalid-codec');
    if (!verdict.ok) check(verdict.unsupported === true, 'invalid-event');
    return verdict.ok;
  };
  const checkState = state => {
    check(state && state.format === FORMAT && scopeKey(state.scope ?? {}) === scopeKey(scope) && state.epoch === epoch &&
      integer(state.storageRevision) && state.storageRevision > 0 && integer(state.locallyDurable) && integer(state.nextDseq) && state.nextDseq === state.locallyDurable + 1 &&
      ['acknowledged', 'appliedSeq', 'head'].every(k => integer(state[k])) && state.appliedSeq <= state.head && state.acknowledged <= state.head &&
      state.local && state.canonical && typeof state.local === 'object' && typeof state.canonical === 'object', 'invalid-state');
    const ids = new Set();
    for (const [seq, envelope] of Object.entries(state.canonical)) {
      check(integer(envelope.seq) && envelope.seq > 0 && String(envelope.seq) === seq && integer(envelope.rt) &&
        ['device', 'server'].includes(envelope.authority) && envelope.seq <= state.head && !ids.has(envelope.event?.id), 'invalid-state');
      inspectEvent(envelope, envelope.authority === 'server');
      ids.add(envelope.event.id);
    }
    for (let seq = 1; seq <= state.appliedSeq; seq++) check(state.canonical[seq], 'invalid-state');
    for (const [id, record] of Object.entries(state.local)) {
      check(record.event?.id === id && record.event.dseq <= state.locallyDurable && (record.ackedSeq === null ||
        (integer(record.ackedSeq) && record.ackedSeq > 0 && record.ackedSeq <= state.head)), 'invalid-state');
      inspectEvent(record, false, true);
    }
    const own = [...Object.values(state.local), ...Object.values(state.canonical)].filter(record => record.event.install === scope.installation);
    const ownDseqs = new Set(own.map(record => record.event.dseq));
    for (let dseq = 1; dseq <= state.locallyDurable; dseq++) check(ownDseqs.has(dseq), 'invalid-state');
    check(state.acknowledged === Math.max(0, ...own.map(record => record.ackedSeq ?? record.seq ?? 0)), 'invalid-state');
    check(state.projection?.appliedSeq === state.appliedSeq, 'invalid-state');
    check(Object.keys(state.local).length + Object.keys(state.canonical).length <= maxRecords &&
      new TextEncoder().encode(JSON.stringify(state)).byteLength <= maxBytes, 'storage-limit');
    return state;
  };
  // A rollback preserves opaque newer bytes and durable cursors. It cannot
  // interpret their cached projection or write through an older codec.
  const compatibility = state => {
    for (const row of Object.values(state.canonical).sort((a, b) => a.seq - b.seq)) {
      if (row.seq <= state.appliedSeq && !inspectEvent(row, row.authority === 'server'))
        return { reason: 'update-required', seq: row.seq, eventId: row.event.id };
    }
    for (const row of Object.values(state.local)) {
      if (!inspectEvent(row, false, true)) return { reason: 'update-required', eventId: row.event.id };
    }
    return null;
  };
  const load = async () => {
    const state = await adapter.read(scope);
    check(state !== null, 'missing-store');
    return checkState(state);
  };
  const reproject = state => {
    let end = 0;
    state.blocked = null;
    while (end < state.head) {
      const envelope = state.canonical[end + 1];
      if (!envelope) { state.blocked = { reason: 'gap', seq: end + 1 }; break; }
      if (!inspectEvent(envelope, envelope.authority === 'server')) { state.blocked = { reason: 'unsupported', seq: end + 1 }; break; }
      end++;
    }
    const canonical = Array.from({ length: end }, (_, index) => copy(state.canonical[index + 1]));
    const provisional = Object.values(state.local).sort((a, b) => a.event.dseq - b.event.dseq).map(({ event, bodyHash }) => ({ event: copy(event), bodyHash }));
    const projection = materialize({ canonical, provisional, learner: scope.learner, epoch,
      provisionalNow: Math.max(now(), ...provisional.map(record => record.event.ts)) });
    check(projection && integer(projection.appliedSeq) && projection.appliedSeq <= end, 'invalid-projection');
    check(projection.appliedSeq >= state.appliedSeq, 'invalid-projection');
    state.appliedSeq = projection.appliedSeq;
    state.projection = ownsProjection ? projection : copy(projection);
    if (projection.appliedSeq < end) state.blocked = { reason: 'reducer-unsupported', seq: projection.appliedSeq + 1 };
    // Canonical insertion, projection, retirement and applied cursor commit as one candidate.
    for (const [id, local] of Object.entries(state.local)) {
      const match = Object.values(state.canonical).find(envelope => envelope.event.id === id);
      if (match && match.seq <= state.appliedSeq) {
        check(match.bodyHash === local.bodyHash, 'immutable-conflict');
        check(local.ackedSeq === null || local.ackedSeq === match.seq, 'invalid-ack');
        state.acknowledged = Math.max(state.acknowledged, match.seq);
        delete state.local[id];
      }
    }
  };
  const transact = async (transform, recover = null) => {
    for (let attempt = 0; attempt < maxConflicts; attempt++) {
      const current = await load();
      check(compatibility(current) === null, 'schema-unsupported');
      const recovered = recover?.(current);
      if (recovered) return recovered;
      const expectedRevision = current.storageRevision;
      const candidate = ownsRead ? current : copy(current);
      const result = transform(candidate);
      candidate.storageRevision++;
      checkState(candidate);
      if (await adapter.compareAndSwap(scope, expectedRevision, candidate)) {
        for (const callback of subscriptions) { try { callback(); } catch { /* observers cannot undo a commit */ } }
        return result;
      }
    }
    // The last contender may have committed this exact command. Recover once
    // without another allocation attempt; admission remains as strict as above.
    if (recover) {
      const current = await load();
      check(compatibility(current) === null, 'schema-unsupported');
      const finalResult = recover(current);
      if (finalResult) return finalResult;
    }
    throw new StoreError('storage-conflict');
  };
  const checkEventSize = ({ event, bodyHash }) => {
    check(new TextEncoder().encode(JSON.stringify({ event, bodyHash })).byteLength <= maxEventBytes, 'event-too-large');
  };
  const prepareCommand = (command, exact = false) => {
    check(command && typeof command.type === 'string' && command.data && typeof command.data === 'object' &&
      Object.keys(command).every(k => ['type', 'data', 'ts'].includes(k)), 'invalid-command');
    // Recovery requires the caller's stable wire timestamp, never a new now().
    check(!exact || integer(command.ts), 'invalid-command');
    const frozen = copy(command); const timestamp = frozen.ts ?? now();
    check(integer(timestamp), 'invalid-command');
    return { frozen, timestamp, dataWire: exact ? codec.canonicalStringify(frozen.data) : null };
  };
  const findCommand = (state, { frozen, timestamp, dataWire }) =>
    [...Object.values(state.local), ...Object.values(state.canonical)].find(record =>
      record.event.install === scope.installation && record.event.ts === timestamp && record.event.type === frozen.type &&
      codec.canonicalStringify(record.event.data) === dataWire);
  const lookupCommand = async command => {
    const prepared = prepareCommand(command, true), state = await load();
    const found = findCommand(state, prepared);
    if (!found) return { persisted: false };
    // Existence is independent of admission: never expose an incompatible cached
    // projection as applied. A gap alone says nothing about reducer support.
    let blockedReason = (compatibility(state) || ['unsupported', 'reducer-unsupported', 'update-required'].includes(state.blocked?.reason) ||
      state.projection.updateRequired) ? 'update-required' : null;
    try { checkEventSize(found); } catch (error) {
      if (error.code !== 'event-too-large') throw error;
      blockedReason ??= error.code;
    }
    return { persisted: true, event: copy(found.event), bodyHash: found.bodyHash, blockedReason };
  };
  const append = async (command, findExisting = false) => {
    const prepared = prepareCommand(command, findExisting), { frozen, timestamp } = prepared;
    return transact(state => {
      const dseq = state.nextDseq;
      // A review's threshold window is frozen when the front is shown. Sync can
      // move appliedSeq between reveal, tap and CAS without changing that window.
      const base = frozen.type === 'review' && frozen.data.hesitation
        ? frozen.data.hesitation.base : state.appliedSeq;
      check(integer(base) && base <= state.appliedSeq, 'invalid-command');
      const event = { v: 4, id: `${scope.installation}:${dseq}`, learner: scope.learner, install: scope.installation, dseq,
        base, ts: timestamp, epoch, policy: 'nsrs-policy-v1', type: frozen.type, data: copy(frozen.data) };
      const record = { event, bodyHash: eventHash(event), ackedSeq: null };
      check(inspectEvent(record, false, true), 'schema-unsupported');
      checkEventSize(record);
      state.local[event.id] = record; state.nextDseq++; state.locallyDurable = dseq;
      reproject(state);
      return { status: 'durable', event: copy(event), bodyHash: record.bodyHash, ...(findExisting ? { appended: true } : {}) };
    }, findExisting ? state => {
      const found = findCommand(state, prepared);
      if (!found) return null;
      checkEventSize(found);
      return { status: 'durable', event: copy(found.event), bodyHash: found.bodyHash, appended: false };
    } : null);
  };
  const publicStore = {
    scope: Object.freeze(copy(scope)),
    readState: sanitized(async (options = {}) => {
      check(options && typeof options === 'object' && !Array.isArray(options) && Object.keys(options).every(key => key === 'requireCompatible') &&
        (!Object.hasOwn(options, 'requireCompatible') || typeof options.requireCompatible === 'boolean'), 'invalid-command');
      const state = await load();
      if (options.requireCompatible) check(compatibility(state) === null, 'schema-unsupported');
      return ownsRead ? state : copy(state);
    }),
    readProjection: sanitized(async () => {
      const state = await load();
      check(compatibility(state) === null, 'schema-unsupported');
      return copy(state.projection);
    }),
    status: sanitized(async () => {
      const state = await load(); const local = Object.values(state.local);
      const blocked = compatibility(state) ?? state.blocked;
      return { locallyDurable: state.locallyDurable, acknowledged: state.acknowledged, applied: state.appliedSeq, head: state.head,
        pending: local.length, pendingUpload: local.filter(record => record.ackedSeq === null).length, blocked: copy(blocked),
        upToDate: local.length === 0 && state.appliedSeq === state.head && blocked === null };
    }),
    outbox: sanitized(async (limit = 500) => {
      check(integer(limit) && limit > 0 && limit <= 500, 'invalid-command');
      const state = await load();
      check(compatibility(state) === null, 'schema-unsupported');
      return Object.values(state.local).filter(record => record.ackedSeq === null).sort((a, b) => a.event.dseq - b.event.dseq)
        .slice(0, limit).map(({ event, bodyHash }) => copy({ event, bodyHash }));
    }),
    append: sanitized(command => append(command)),
    // Exact wire recovery shares the validated transaction load and CAS retry.
    // A found event has appended:false: no write, revision bump or notification.
    // A new event has appended:true only after the ordinary durable CAS commit.
    appendOrFind: sanitized(command => append(command, true)),
    // Fresh validated proof of immutable bytes, never write/admission permission.
    lookupCommand: sanitized(lookupCommand),
    acknowledge: sanitized(async ({ acks, head }) => transact(state => {
      check(integer(head) && Array.isArray(acks), 'invalid-head');
      check(head >= state.head, 'head-regressed');
      const seen = new Set();
      const acknowledgedSeqs = new Map(Object.values(state.local).filter(record => record.ackedSeq !== null).map(record => [record.ackedSeq, record.event.id]));
      for (const ack of acks) {
        check(ack && typeof ack.id === 'string' && !seen.has(ack.id) && integer(ack.seq) && ack.seq > 0 && ack.seq <= head && HASH.test(ack.bodyHash), 'invalid-ack');
        seen.add(ack.id);
        check(!acknowledgedSeqs.has(ack.seq) || acknowledgedSeqs.get(ack.seq) === ack.id, 'invalid-ack');
        acknowledgedSeqs.set(ack.seq, ack.id);
        const local = state.local[ack.id];
        const canonical = state.canonical[ack.seq];
        check(local || canonical?.event.id === ack.id, 'invalid-ack');
        if (local) {
          check(local.bodyHash === ack.bodyHash && (local.ackedSeq === null || local.ackedSeq === ack.seq), 'immutable-conflict');
          local.ackedSeq = ack.seq;
        }
        if (canonical) check(canonical.event.id === ack.id && canonical.bodyHash === ack.bodyHash, 'immutable-conflict');
        state.acknowledged = Math.max(state.acknowledged, ack.seq);
      }
      state.head = head;
      // Ack never applies/retire events. The next pull/reconcile must supply the prefix.
      return { status: 'acknowledged' };
    })),
    reconcile: sanitized(async ({ events, head }) => transact(state => {
      check(integer(head) && Array.isArray(events), 'invalid-head');
      check(head >= state.head, 'head-regressed');
      const idSeq = new Map(Object.values(state.canonical).map(envelope => [envelope.event.id, envelope.seq]));
      for (const input of events) {
        const envelope = copy(input);
        check(envelope && Object.keys(envelope).sort().join(',') === 'authority,bodyHash,event,rt,seq' && integer(envelope.seq) && envelope.seq > 0 && envelope.seq <= head &&
          integer(envelope.rt) && ['device', 'server'].includes(envelope.authority), 'invalid-event');
        inspectEvent(envelope, envelope.authority === 'server'); // unsupported schema is retained, never applied past
        const previous = state.canonical[envelope.seq];
        if (previous) check(codec.canonicalStringify(previous) === codec.canonicalStringify(envelope), 'immutable-conflict');
        if (idSeq.has(envelope.event.id)) check(idSeq.get(envelope.event.id) === envelope.seq, 'sequence-conflict');
        const local = state.local[envelope.event.id];
        if (local) check(local.bodyHash === envelope.bodyHash && (local.ackedSeq === null || local.ackedSeq === envelope.seq), 'immutable-conflict');
        if (envelope.event.install === scope.installation) {
          check(envelope.event.dseq <= state.locallyDurable, 'sequence-conflict');
          state.acknowledged = Math.max(state.acknowledged, envelope.seq);
          if (local) local.ackedSeq = envelope.seq;
        }
        state.canonical[envelope.seq] = envelope; idSeq.set(envelope.event.id, envelope.seq);
      }
      state.head = head; reproject(state);
      return { status: state.blocked ? 'blocked' : 'applied', applied: state.appliedSeq, blocked: copy(state.blocked) };
    })),
    subscribe(callback) { check(typeof callback === 'function', 'invalid-command'); subscriptions.add(callback); return () => subscriptions.delete(callback); },
  };
  return Object.freeze(publicStore);
}

export const openStore = sanitized(async options => {
  const store = replica(setup(options));
  await store.readState();
  return store;
});

export const createFreshStore = sanitized(async options => {
  const install = await (options.newInstallationId ?? (() => globalThis.crypto.randomUUID()))();
  const config = setup({ ...options, scope: { environment: options.environment, learner: options.learner, installation: install } });
  const projection = config.materialize({ canonical: [], provisional: [], learner: config.scope.learner,
    epoch: config.epoch, provisionalNow: config.now() });
  check(projection && projection.appliedSeq === 0, 'invalid-projection');
  const initial = { format: FORMAT, storageRevision: 1, scope: copy(config.scope), epoch: config.epoch, nextDseq: 1, locallyDurable: 0,
    acknowledged: 0, appliedSeq: 0, head: 0, local: {}, canonical: {}, projection: ownsMaterializerOutput(config.materialize) ? projection : copy(projection), blocked: null };
  check(new TextEncoder().encode(JSON.stringify(initial)).byteLength <= config.maxBytes, 'storage-limit');
  check(await config.adapter.compareAndSwap(config.scope, null, initial), 'installation-exists');
  return openStore({ ...options, ...config });
});
