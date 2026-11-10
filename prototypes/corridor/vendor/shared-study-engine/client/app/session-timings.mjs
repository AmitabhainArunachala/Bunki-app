/** Optional device-local timing provenance. Never writes canonical learner data.
 * Call begin at an actual scored-session start and record only after a durable
 * review. Preference failures may lose timing evidence, never a saved grade. */
export const SESSION_TIMING_LIMITS = Object.freeze({
  retentionMs: 32 * 86400000, sessions: 128, eventIds: 2000, bytes: 128 * 1024,
  identifierLength: 256,
});
const LIMIT = SESSION_TIMING_LIMITS;
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= LIMIT.identifierLength;
const instant = value => Number.isSafeInteger(value) && value >= 0;
const bytes = text => new TextEncoder().encode(text).byteLength;
const copy = entry => ({...entry, eventIds: [...entry.eventIds]});
const prefix = (a, b) => a.length <= b.length && a.every((id, index) => id === b[index]);
const synchronous = value => {
  if (value && typeof value.then === 'function') {
    Promise.resolve(value).catch(() => {});
    throw Error('asynchronous-preferences');
  }
  return value;
};

/** preferences is the synchronous getItem/setItem interface, scoped internally
 * by learner and installation. Handles are process-local and cannot resume or
 * infer an earlier session after reload. read's entries match studyDayView's
 * sessionTimings input; its model still checks interval completeness/overlap. */
export function createSessionEvidence({preferences = null, learner, installation, now = Date.now} = {}) {
  const scoped = identifier(learner) && identifier(installation);
  const key = `nihongo.session-timings.v1:${scoped ? JSON.stringify([learner, installation]) : 'unavailable'}`;
  const handles = new WeakMap();
  let memory = [], dirty = false;
  let status = {state: 'ready', persisted: true, reason: null};
  const report = (state, persisted, reason = null) => { status = {state, persisted, reason}; };
  const snapshot = () => ({...status});
  const clock = () => { try { const at = now(); return instant(at) ? at : null; } catch { return null; } };
  const encode = entries => JSON.stringify({version: 1, learner, installation, sessions: entries});
  const fallback = reason => report(memory.length ? 'transient' : reason === 'corrupt-preferences' ? 'corrupt' : 'unavailable', false, reason);
  function bounded(entries, at) {
    const kept = entries.filter(entry => entry.startedAt >= at - LIMIT.retentionMs && entry.startedAt <= at &&
      entry.eventIds.length <= LIMIT.eventIds && bytes(encode([entry])) <= LIMIT.bytes)
      .sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    let count = kept.reduce((sum, entry) => sum + entry.eventIds.length, 0);
    while (kept.length > LIMIT.sessions || count > LIMIT.eventIds || bytes(encode(kept)) > LIMIT.bytes) count -= kept.shift().eventIds.length;
    return kept;
  }
  function projectionIndex(projection, at) {
    if (!scoped || at === null || projection?.learner !== learner || !Array.isArray(projection.reviews) || !projection.outcomes) return null;
    const rows = new Map();
    for (const [index, row] of projection.reviews.entries()) {
      if (!identifier(row?.id) || rows.has(row.id)) return null;
      rows.set(row.id, {row, index});
    }
    return {rows, outcomes: projection.outcomes};
  }
  function valid(entry, projection, at) {
    if (!identifier(entry?.id) || entry.installation !== installation || !instant(entry.startedAt) ||
      entry.startedAt > at || !Array.isArray(entry.eventIds) || !entry.eventIds.length ||
      new Set(entry.eventIds).size !== entry.eventIds.length) return false;
    let previousIndex = -1, previousAt = entry.startedAt;
    for (const id of entry.eventIds) {
      const found = projection.rows.get(id);
      if (!identifier(id) || !found || found.row.install !== installation || !instant(found.row.at) ||
        found.row.at < previousAt || found.row.at > at || found.index <= previousIndex || projection.outcomes[id]?.status !== 'applied') return false;
      previousIndex = found.index; previousAt = found.row.at;
    }
    return true;
  }
  function merge(a, b) {
    const merged = new Map(), conflicts = new Set();
    for (const entry of [...a, ...b]) {
      if (conflicts.has(entry.id)) continue;
      const old = merged.get(entry.id);
      if (!old) merged.set(entry.id, copy(entry));
      else if (old.startedAt !== entry.startedAt || old.installation !== entry.installation ||
        !prefix(old.eventIds, entry.eventIds) && !prefix(entry.eventIds, old.eventIds)) {
        merged.delete(entry.id); conflicts.add(entry.id);
      } else if (entry.eventIds.length > old.eventIds.length) merged.set(entry.id, copy(entry));
    }
    // An event cannot support two independent session starts. Omit both rather
    // than choose a start that happens to produce a plausible duration.
    const owners = new Map(), duplicates = new Set();
    for (const entry of merged.values()) for (const id of entry.eventIds) {
      if (owners.has(id)) { duplicates.add(owners.get(id)); duplicates.add(entry.id); }
      else owners.set(id, entry.id);
    }
    return [...merged.values()].filter(entry => !duplicates.has(entry.id));
  }
  function load(projection, at) {
    memory = bounded(memory.filter(entry => valid(entry, projection, at)), at);
    let raw;
    try {
      if (typeof preferences?.getItem !== 'function') throw Error();
      raw = synchronous(preferences.getItem(key));
    } catch { fallback('read-unavailable'); return; }
    if (raw !== null && (typeof raw !== 'string' || raw.length > LIMIT.bytes || bytes(raw) > LIMIT.bytes)) {
      fallback('corrupt-preferences'); return;
    }
    if (dirty) {
      // A failed write must not reload an older, incomplete prefix over the
      // trusted in-memory roster. A later record/retry can persist it again.
      if (raw === encode(memory)) { dirty = false; report('ready', true); }
      else report('transient', false, 'unsaved-memory');
      return;
    }
    let stored = [];
    if (raw !== null) {
      try {
        const body = JSON.parse(raw);
        if (body?.version !== 1 || body.learner !== learner || body.installation !== installation ||
          !Array.isArray(body.sessions) || body.sessions.length > LIMIT.sessions ||
          body.sessions.reduce((sum, entry) => sum + (Array.isArray(entry?.eventIds) ? entry.eventIds.length : LIMIT.eventIds + 1), 0) > LIMIT.eventIds) throw Error();
        stored = body.sessions.filter(entry => valid(entry, projection, at));
      } catch { fallback('corrupt-preferences'); return; }
    }
    memory = bounded(merge(memory, stored), at);
    dirty = raw !== encode(memory) && !(raw === null && memory.length === 0);
    report(dirty ? 'transient' : 'ready', !dirty, dirty ? 'unsaved-memory' : null);
  }
  function persist() {
    try {
      if (typeof preferences?.setItem !== 'function') throw Error();
      synchronous(preferences.setItem(key, encode(memory)));
      dirty = false; report('ready', true);
    } catch { dirty = true; fallback('write-unavailable'); }
  }
  function begin({startedAt = clock()} = {}) {
    const at = clock();
    if (!scoped || at === null || !instant(startedAt) || startedAt > at || startedAt < at - LIMIT.retentionMs) return null;
    try {
      const handle = Object.freeze({});
      handles.set(handle, {id: globalThis.crypto.randomUUID(), startedAt, recorded: false, retired: false});
      return handle;
    } catch { report('unavailable', false, 'session-identity-unavailable'); return null; }
  }
  function read(projection) {
    const at = clock(), index = projectionIndex(projection, at);
    if (!index) return {entries: [], status: {state: 'unavailable', persisted: false, reason: 'projection-scope'}};
    load(index, at);
    // Once reads recover, flush the trusted roster or whole-session pruning.
    // This is optional preference metadata only; failure stays nonblocking.
    if (dirty && status.reason === 'unsaved-memory') persist();
    return {entries: memory.map(({installation, startedAt, eventIds}) => ({installation, startedAt, eventIds: [...eventIds]})), status: snapshot()};
  }
  function record(handle, {eventId, projection, durable = false} = {}) {
    const session = handle && handles.get(handle), at = clock(), index = projectionIndex(projection, at);
    const result = (recorded, duplicate, reason = null) => ({recorded, duplicate, reason, status: snapshot()});
    if (!session || session.retired || durable !== true || !identifier(eventId) || !index) return result(false, false, 'invalid-review-evidence');
    load(index, at);
    const old = memory.find(entry => entry.id === session.id);
    if (session.recorded && !old) { session.retired = true; return result(false, false, 'session-retired'); }
    if (old?.eventIds.includes(eventId)) { if (dirty) persist(); return result(false, true); }
    if (memory.some(entry => entry.eventIds.includes(eventId))) return result(false, true, 'review-already-recorded');
    const candidate = {id: session.id, installation, startedAt: session.startedAt, eventIds: [...(old?.eventIds || []), eventId]};
    if (!valid(candidate, index, at)) return result(false, false, 'invalid-review-evidence');
    memory = bounded([...memory.filter(entry => entry.id !== session.id), candidate], at);
    session.recorded = true;
    if (!memory.some(entry => entry.id === session.id)) session.retired = true;
    persist();
    return result(!session.retired, false, session.retired ? 'session-capacity' : null);
  }
  return Object.freeze({begin, record, read});
}
