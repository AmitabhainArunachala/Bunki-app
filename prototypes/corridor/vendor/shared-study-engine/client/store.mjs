/** Transactional replica store; adapters own durable compare-and-swap completion. */
import {ownsReadSnapshot, readsCommittedCandidate} from './storage/read-ownership.mjs';
import {ownsMaterializerOutput} from './materializer.mjs';
import {diffSnapshot} from './storage/snapshot-delta.mjs';
// Only the exact store registered here can transfer a committed candidate.
const committedStateSubscriptions = new WeakMap();
export function subscribeToCommittedState(store, callback) {
  const subscribe = committedStateSubscriptions.get(store);
  return subscribe ? subscribe(callback) : store.subscribe(committed => callback(committed?.state));
}
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
  // Opt-in adapter contract: readFresh(scope, token) answers {unchanged:true}
  // only when storage still holds exactly the bytes that token names, checked
  // inside storage's own lock; otherwise it transfers a new owned snapshot and
  // its token. Only such an adapter lets this handle keep a snapshot between calls.
  const tokens = ownsRead && typeof adapter.readFresh === 'function';
  // Structured-clone storage reads back exactly the candidate it was given.
  const candidateReads = !tokens && readsCommittedCandidate(adapter);
  const subscriptions = new Set(), committedStateObservers = new Set();
  // The one snapshot this handle may reuse: exactly what storage held when
  // `token` was issued, validated once, frozen to slot depth. Any conflict,
  // failure or changed token drops it whole; nothing in it is ever patched.
  let retained = null;
  const measured = new WeakMap(); // snapshot -> exact UTF-8 bytes of JSON.stringify(snapshot)
  // Validation verdicts are remembered per record object, never per value:
  // - a kept snapshot's records are frozen deeply BEFORE their hash is checked,
  //   so a verdict can never describe different content later;
  // - an owned snapshot that is not kept is private to the one operation that
  //   read it, and the verdicts are dropped at the next read.
  // Generic adapters get no memo: each record is checked on every pass, as before.
  const sealed = new WeakSet(); let verdicts = [new WeakMap(), new WeakMap()];
  // Never trust an outer frozen flag: every nested value is visited.
  const deepFreeze = value => {
    if (value && typeof value === 'object') { for (const key of Object.keys(value)) deepFreeze(value[key]); if (!Object.isFrozen(value)) Object.freeze(value); }
    return value;
  };
  // A handle that keeps a snapshot runs its storage operations one at a time,
  // so a reader never races this handle's own commit into a second full read.
  let tail = Promise.resolve();
  const exclusive = action => {
    if (!tokens) return action();
    const run = tail.then(action, action);
    tail = run.catch(() => {});
    return run;
  };
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
    const memo = ownsRead ? verdicts[allowServer ? 1 : 0] : null;
    if (memo) {
      if (!tokens || sealed.has(record)) { const known = memo.get(record); if (known !== undefined) return known; }
      else { deepFreeze(record); sealed.add(record); }
    }
    check(record.bodyHash === eventHash(event), 'immutable-conflict');
    const verdict = codec.validateEvent(event, { allowServer });
    check(verdict && typeof verdict.ok === 'boolean', 'invalid-codec');
    if (!verdict.ok) check(verdict.unsupported === true, 'invalid-event');
    if (memo) memo.set(record, verdict.ok);
    return verdict.ok;
  };
  const checkState = (state, knownBytes = null) => {
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
    check(Object.keys(state.local).length + Object.keys(state.canonical).length <= maxRecords, 'storage-limit');
    // Exact either way: the full encoding, or the retained snapshot's measured
    // bytes plus the exact byte change of the slots that differ from it.
    const bytes = knownBytes ?? new TextEncoder().encode(JSON.stringify(state)).byteLength;
    check(bytes <= maxBytes, 'storage-limit');
    measured.set(state, bytes);
    return state;
  };
  // A kept snapshot is shared with every reader of this handle, so all of it
  // is frozen: a caller that tries to edit it fails loudly instead of changing
  // what the store believes storage holds. Records are already sealed; a
  // projection this handle froze before (a write that did not reproject) is
  // not walked again.
  const frozenProjections = new WeakSet();
  const protect = state => {
    for (const part of [state.scope, state.blocked]) deepFreeze(part);
    for (const part of [state.local, state.canonical]) if (part && typeof part === 'object') Object.freeze(part);
    const projection = state.projection;
    if (projection && typeof projection === 'object' && !frozenProjections.has(projection)) { deepFreeze(projection); frozenProjections.add(projection); }
    return Object.freeze(state);
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
    if (!tokens) {
      // A new exclusive snapshot: nothing remembered about earlier objects applies.
      if (ownsRead) verdicts = [new WeakMap(), new WeakMap()];
      const state = await adapter.read(scope);
      check(state !== null, 'missing-store');
      return checkState(state);
    }
    const kept = retained;
    retained = null; // only a confirmed or freshly validated snapshot is kept again
    const fresh = await adapter.readFresh(scope, kept ? kept.token : null);
    if (kept && fresh?.unchanged === true) { retained = kept; return kept.state; }
    check(fresh && fresh.unchanged !== true && fresh.state !== undefined, 'storage-failed');
    check(fresh.state !== null, 'missing-store');
    const state = protect(checkState(fresh.state));
    if (typeof fresh.token === 'string') retained = { state, token: fresh.token };
    return state;
  };
  const read = () => exclusive(load);
  // `taken` is a clock reading already made for this write's pending replay
  // time (an abandoned combined attempt read it); otherwise the clock is read here.
  const reproject = (state, taken = null) => {
    let end = 0;
    state.blocked = null;
    while (end < state.head) {
      const envelope = state.canonical[end + 1];
      if (!envelope) { state.blocked = { reason: 'gap', seq: end + 1 }; break; }
      if (!inspectEvent(envelope, envelope.authority === 'server')) { state.blocked = { reason: 'unsupported', seq: end + 1 }; break; }
      end++;
    }
    // Frozen records cannot be edited by a materializer; every other snapshot keeps the detached copies.
    const canonical = Array.from({ length: end }, (_, index) => tokens ? state.canonical[index + 1] : copy(state.canonical[index + 1]));
    const provisional = Object.values(state.local).sort((a, b) => a.event.dseq - b.event.dseq).map(({ event, bodyHash }) => ({ event: tokens ? event : copy(event), bodyHash }));
    const projection = materialize({ canonical, provisional, learner: scope.learner, epoch,
      provisionalNow: Math.max(taken ? taken.value : now(), ...provisional.map(record => record.event.ts)) });
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
  // An owned snapshot may be shared with readers, so a transaction edits a
  // draft: new top-level object and record maps, every untouched record and
  // the projection shared by identity. Generic adapters keep the full copy.
  const draft = current => ownsRead ? { ...current, local: { ...current.local }, canonical: { ...current.canonical } } : copy(current);
  // The exact difference from the retained snapshot, when storage can apply one.
  const planFrom = (current, candidate) => tokens && retained && retained.state === current ? diffSnapshot(current, candidate) : null;
  const validated = (current, candidate) => {
    const plan = planFrom(current, candidate);
    checkState(candidate, plan && measured.has(current) ? measured.get(current) + plan.bytes : null);
    return plan;
  };
  // A snapshot read from storage lists each dictionary's keys in storage's own
  // order, and callers may iterate them. The candidate lists them in the
  // order the materializer made them. Before a committed candidate stands in
  // for a read, its record map and projection dictionaries take the order a
  // read would give: unchanged key sets keep the previous snapshot's order,
  // and storage names the order of every dictionary whose key set changed.
  // A changed key set that storage did not name is never guessed: the
  // candidate is then not kept, and the next operation reads.
  const plainMap = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const readOrder = (current, candidate, orders) => {
    const named = new Map((orders ?? []).map(([path, keys]) => [path.join('\u0000'), keys]));
    const ordered = (before, after, id) => {
      if (!plainMap(after)) return after;
      const keys = Object.keys(after); let order = named.get(id);
      if (order) check(order.length === keys.length && new Set(order).size === order.length && order.every(key => Object.hasOwn(after, key)), 'storage-failed');
      else {
        check(plainMap(before), 'storage-failed');
        order = Object.keys(before);
        check(order.length === keys.length && order.every(key => Object.hasOwn(after, key)), 'storage-failed');
      }
      const result = {};
      for (const key of order) Object.defineProperty(result, key, { value: after[key], writable: true, enumerable: true, configurable: true });
      return result;
    };
    candidate.local = ordered(current.local, candidate.local, 'local');
    if (plainMap(candidate.projection)) {
      const view = ordered(current.projection, candidate.projection, 'projection'), before = plainMap(current.projection) ? current.projection : {};
      for (const key of Object.keys(view)) view[key] = ordered(before[key], view[key], 'projection\u0000' + key);
      candidate.projection = view;
    }
  };
  // Durable first: the adapter resolves only after storage's commit. A
  // described candidate then becomes the kept snapshot under the token storage
  // returned for it, and is what observers receive. A whole-candidate commit
  // keeps nothing: the next operation reads what storage holds.
  const commit = async (current, expectedRevision, candidate, plan, extra = null) => {
    const kept = retained; retained = null;
    const hint = plan && kept && kept.state === current ? { token: kept.token, delta: plan.delta, ...extra } : undefined;
    const outcome = await (hint ? adapter.compareAndSwap(scope, expectedRevision, candidate, hint) : adapter.compareAndSwap(scope, expectedRevision, candidate));
    // A plain answer is read as before (any truthy value); an object says so itself.
    if (!(outcome !== null && typeof outcome === 'object' ? outcome.committed === true : Boolean(outcome))) return false;
    let committed;
    if (hint && outcome?.described === true && typeof outcome.token === 'string') {
      try { readOrder(current, candidate, outcome.orders); protect(candidate); retained = { state: candidate, token: outcome.token }; committed = { state: candidate }; }
      catch { retained = null; }
    }
    for (const callback of committedStateObservers) {
      let state = committed?.state;
      // Normalize the committed graph the same way IndexedDB does on read,
      // including its prototypes. An ordinary observer still gets no state.
      if (!state && candidateReads) try { state = copy(candidate); } catch { /* the backend will fall back to a fresh read */ }
      try { callback(state); } catch { /* observers cannot undo a commit */ }
    }
    for (const callback of subscriptions) { try { callback(committed); } catch { /* observers cannot undo a commit */ } }
    return true;
  };
  const transact = (transform, recover = null, followUp = null) => exclusive(() => transactNow(transform, recover, followUp));
  // Everything a write decides before it reaches storage, on one snapshot.
  const prepare = (current, transform, recover, followUp) => {
    check(compatibility(current) === null, 'schema-unsupported');
    const recovered = recover?.(current);
    if (recovered) return { recovered };
    const expectedRevision = current.storageRevision;
    // Two released writes as one durable commit: the saved event, then the
    // receipts the host's follow-up assigns to it. Storage validates both
    // transitions in order and writes only the second state.
    //
    // The first write's projection is never stored here, so it is not
    // computed: storage reads nothing of it but its applied cursor, which a
    // save does not move. That is exact only while the result shows what
    // the released first write would have shown the follow-up: a clean
    // replay and a state far inside the byte bound. An event that stops
    // replay as a receipt stops it as a pending event too; the one stop a
    // pending event has alone is its replay time, so that time is computed
    // here exactly as the first write computes it (the same single clock
    // reading) and handed to the follow-up to refuse on. Anything else, any
    // refusal and any unknown answer take the released two writes, and their
    // first write then replays at this same reading, not at a later one.
    let taken = null;
    if (followUp && tokens && retained && retained.state === current && measured.has(current)) {
      let first = null, second = null, final = null, intermediate = null, staged = null;
      try {
        first = draft(current); staged = followUp.place(first); first.storageRevision++;
        taken = { value: now() };
        const provisionalNow = Math.max(taken.value, ...Object.values(first.local).map(record => record.event.ts));
        checkState(first, measured.get(current));
        const receipts = followUp.receipts(first, { provisionalNow });
        if (receipts) {
          second = draft(first); reconcileInto(second, receipts); second.storageRevision++;
          final = diffSnapshot(current, second);
          const bytes = final ? measured.get(current) + final.bytes : Infinity;
          if (!second.projection.error && !second.projection.updateRequired && second.blocked === null && bytes * 2 <= maxBytes) {
            checkState(second, bytes);
            intermediate = diffSnapshot(current, first);
          }
        }
      } catch { intermediate = null; } // nothing was sent: the save proceeds exactly as released
      if (intermediate) return { expectedRevision, combined: { second, final, intermediate, staged } };
    }
    const candidate = draft(current);
    const result = transform(candidate, taken);
    candidate.storageRevision++;
    return { expectedRevision, candidate, result, description: validated(current, candidate) };
  };
  const transactNow = async (transform, recover, followUp) => {
    for (let attempt = 0; attempt < maxConflicts; attempt++) {
      // A write builds on the kept snapshot without asking storage first: a
      // described commit is refused, untouched, unless storage still holds
      // exactly the bytes that snapshot was read from. Everything else that
      // snapshot may decide alone is confirmed with storage first: a found
      // command, a whole-candidate write, and any refusal, which may only
      // describe a snapshot another handle or process has since replaced.
      const unconfirmed = tokens && retained !== null;
      const current = unconfirmed ? retained.state : await load();
      const changed = async () => unconfirmed && await load() !== current;
      let plan;
      try { plan = prepare(current, transform, recover, followUp); }
      catch (error) { if (await changed()) continue; throw error; }
      if (plan.recovered) { if (await changed()) continue; return plan.recovered; }
      if (plan.combined) {
        const { second, final, intermediate, staged } = plan.combined;
        let combined = false;
        try { combined = await commit(current, plan.expectedRevision, second, final, { steps: 2, intermediate: intermediate.delta }); }
        catch { retained = null; }
        if (combined) return { ...staged, followedUp: true };
        followUp = null; // storage refused, or its answer is unknown: re-read and recover through the released path
        continue;
      }
      if (!plan.description && await changed()) continue; // a whole candidate is checked by revision only
      if (await commit(current, plan.expectedRevision, plan.candidate, plan.description)) return plan.result;
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
    const prepared = prepareCommand(command, true), state = await read();
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
  const append = async (command, findExisting = false, followUp = null) => {
    check(followUp === null || (findExisting && typeof followUp === 'function'), 'invalid-command');
    const prepared = prepareCommand(command, findExisting), { frozen, timestamp } = prepared;
    const place = state => {
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
      return { status: 'durable', event: copy(event), bodyHash: record.bodyHash, ...(findExisting ? { appended: true } : {}) };
    };
    return transact((state, taken = null) => { const result = place(state); reproject(state, taken); return result; }, findExisting ? state => {
      const found = findCommand(state, prepared);
      if (!found) return null;
      checkEventSize(found);
      return { status: 'durable', event: copy(found.event), bodyHash: found.bodyHash, appended: false };
    } : null, followUp ? { receipts: followUp, place } : null);
  };
  // Shared by reconcile() and by an append's follow-up: the same checks, in the same order.
  const reconcileInto = (state, { events, head }) => {
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
        // A shared record is never edited in place; same keys, same order, new object.
        if (local) state.local[envelope.event.id] = { ...local, ackedSeq: envelope.seq };
      }
      state.canonical[envelope.seq] = envelope; idSeq.set(envelope.event.id, envelope.seq);
    }
    state.head = head; reproject(state);
    return { status: state.blocked ? 'blocked' : 'applied', applied: state.appliedSeq, blocked: copy(state.blocked) };
  };
  const publicStore = {
    scope: Object.freeze(copy(scope)),
    // True when a save and its follow-up receipts can be one durable commit.
    combinesFollowUp: tokens,
    readState: sanitized(async (options = {}) => {
      check(options && typeof options === 'object' && !Array.isArray(options) && Object.keys(options).every(key => key === 'requireCompatible') &&
        (!Object.hasOwn(options, 'requireCompatible') || typeof options.requireCompatible === 'boolean'), 'invalid-command');
      const state = await read();
      if (options.requireCompatible) check(compatibility(state) === null, 'schema-unsupported');
      return ownsRead ? state : copy(state);
    }),
    readProjection: sanitized(async () => {
      const state = await read();
      check(compatibility(state) === null, 'schema-unsupported');
      return copy(state.projection);
    }),
    status: sanitized(async () => {
      const state = await read(); const local = Object.values(state.local);
      const blocked = compatibility(state) ?? state.blocked;
      return { locallyDurable: state.locallyDurable, acknowledged: state.acknowledged, applied: state.appliedSeq, head: state.head,
        pending: local.length, pendingUpload: local.filter(record => record.ackedSeq === null).length, blocked: copy(blocked),
        upToDate: local.length === 0 && state.appliedSeq === state.head && blocked === null };
    }),
    outbox: sanitized(async (limit = 500, { requireCurrentPrefix = false } = {}) => {
      check(integer(limit) && limit > 0 && limit <= 500 && typeof requireCurrentPrefix === 'boolean', 'invalid-command');
      const state = await read();
      const incompatible = compatibility(state);
      if (requireCurrentPrefix && (incompatible || state.blocked || state.appliedSeq !== state.head)) return [];
      check(incompatible === null, 'schema-unsupported');
      return Object.values(state.local).filter(record => record.ackedSeq === null).sort((a, b) => a.event.dseq - b.event.dseq)
        .slice(0, limit).map(({ event, bodyHash }) => copy({ event, bodyHash }));
    }),
    append: sanitized(command => append(command)),
    // Exact wire recovery shares the validated transaction load and CAS retry.
    // A found event has appended:false: no write, revision bump or notification.
    // A new event has appended:true only after the ordinary durable CAS commit.
    // An optional follow-up(state, {provisionalNow}) returns {events, head} for
    // reconcile, or nothing; provisionalNow is the time the save's pending
    // events would replay at in a first write of their own. With storage that
    // can apply it, the save and those receipts are one durable commit and the
    // result carries followedUp:true; otherwise the save commits alone, exactly
    // as before, and the caller reconciles afterwards.
    appendOrFind: sanitized((command, options = undefined) => {
      check(options === undefined || (options && typeof options === 'object' && Object.keys(options).every(key => key === 'followUp') &&
        (options.followUp === undefined || typeof options.followUp === 'function')), 'invalid-command');
      return append(command, true, options?.followUp ?? null);
    }),
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
          state.local[ack.id] = { ...local, ackedSeq: ack.seq };
        }
        if (canonical) check(canonical.event.id === ack.id && canonical.bodyHash === ack.bodyHash, 'immutable-conflict');
        state.acknowledged = Math.max(state.acknowledged, ack.seq);
      }
      state.head = head;
      // Ack never applies/retire events. The next pull/reconcile must supply the prefix.
      return { status: 'acknowledged' };
    })),
    reconcile: sanitized(async ({ events, head }) => transact(state => reconcileInto(state, { events, head }))),
    subscribe(callback) { check(typeof callback === 'function', 'invalid-command'); subscriptions.add(callback); return () => subscriptions.delete(callback); },
  };
  if (tokens || candidateReads) committedStateSubscriptions.set(publicStore, callback => {
    committedStateObservers.add(callback);
    return () => committedStateObservers.delete(callback);
  });
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
