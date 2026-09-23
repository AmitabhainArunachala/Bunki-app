/** Protected migration/controller seam. This module is not wired into the live
 * Corridor save path. The caller owns the existing origin-wide RECORD_LOCK and
 * validates learner-domain fields before prepare(). No lock is acquired here.
 *
 * LocalStorage and two IDB databases are not one transaction. Complete immutable
 * custody precedes a future-version fence, which precedes target activation.
 * Already-open legacy JavaScript ignoring the lock/fence remains an explicit
 * limitation: localStorage has no compare-and-swap. Never claim that observed
 * equality prevents an uncooperative writer from changing bytes immediately
 * afterward. Observed divergence is quarantined; neither source is rolled back.
 */
import { IndexedDbReplicationStore, encodeLocalJson } from './modules/record-core.mjs';

const LEGACY_KEY = 'kairo-corridor-v1';
const DRIFT_KEY = 'bunki-drift-v1';
const ARCHIVE_DB = 'kairo-ai-log';
const PRIVATE = 'kairo:migration';
const CUSTODY = 'kairo:migration-custody';
const ATTEMPTS = 'kairo:migration-attempts';
const RECORD = 'learner-record';
const ARCHIVE = 'learner-archive';
const CURRENT = 'current';
const MANIFEST = 'manifest';
const LIMIT = 32 * 1024 * 1024;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const equal = (a, b) => encodeLocalJson(a).text === encodeLocalJson(b).text;
const hash = (value) => encodeLocalJson(value).sha256;
const copy = (value) => encodeLocalJson(value).value;

export class RecordControllerError extends Error {
  constructor(code) { super(`Record controller: ${code}`); this.name = 'RecordControllerError'; this.code = code; }
}
function insist(condition, code) { if (!condition) throw new RecordControllerError(code); }
function keys(value, allowed, code = 'invalid-source') {
  insist(plain(value) && Object.keys(value).sort().join('\u0000') === [...allowed].sort().join('\u0000'), code);
}
function opaque(value) { return typeof value === 'string' && value.length > 0 && value.length <= 200 && !Array.from(value).some((c) => c.charCodeAt(0) < 32); }
function captureWriter(writer, sessionId) {
  const captured = copy(writer.capture());
  keys(captured, ['ownerId', 'epoch', 'sessionId'], 'writer-required');
  insist(opaque(captured.ownerId) && Number.isSafeInteger(captured.epoch) && captured.epoch >= 0 && opaque(captured.sessionId), 'writer-required');
  insist(sessionId === undefined || captured.sessionId === sessionId, 'session-changed');
  assertWriter(writer, captured);
  return captured;
}
function assertWriter(writer, captured) { insist(writer.assert(captured) === true, 'writer-required'); }

function normalizedDriftStore(raw) {
  const store = copy(raw);
  const counter = (value) => { try { return value == null || Number.isFinite(Number(value)); } catch { return false; } };
  insist(plain(store) && (store.known == null || plain(store.known)) && (store.unknown == null || plain(store.unknown)) &&
    counter(store.lk) && counter(store.lu), 'unsupported-legacy-drift');
  // These are the deployed unversioned loader's exact normalization rules.
  // Unknown own fields and judgment-map values stay data, not version authority.
  return { ...store, known: { ...(store.known || {}) }, unknown: { ...(store.unknown || {}) }, lk: Number(store.lk) || 0, lu: Number(store.lu) || 0 };
}

/** Exact raw text belongs in local custody. The current local state follows the
 * deployed Drift loader, including its treatment of absent/empty storage. */
export function parseLegacyDriftText(text) {
  insist(text === null || (typeof text === 'string' && text.length <= LIMIT), 'invalid-drift-text');
  let raw;
  try { raw = text ? JSON.parse(text) : {}; } catch { throw new RecordControllerError('unsupported-legacy-drift'); }
  return copy({ format: 'kairo-drift-state', version: 1, store: normalizedDriftStore(raw) });
}
export function parseDriftState(raw) {
  const state = copy(raw);
  keys(state, ['format', 'version', 'store'], 'unsupported-drift-state');
  insist(state.format === 'kairo-drift-state' && state.version === 1, 'unsupported-drift-state');
  insist(equal(state.store, normalizedDriftStore(state.store)), 'noncanonical-drift-state');
  return state;
}
export function readDriftState(record) {
  insist(plain(record) && own(record, 'driftState'), 'drift-state-unavailable');
  return parseDriftState(record.driftState);
}

function logicalRows(rows) {
  insist(Array.isArray(rows), 'invalid-source');
  const logicalIds = new Set();
  let previous = 0;
  return rows.map((row) => {
    keys(row, ['format', 'v', 'id', 'turn']);
    insist(row.format === 'kairo-archive-row' && row.v === 1 && Number.isSafeInteger(row.id) && row.id > previous, 'invalid-source');
    previous = row.id;
    const turn = row.turn;
    insist(plain(turn) && typeof turn.surface === 'string' && turn.surface.length > 0 &&
      ['user', 'assistant', 'tutor', 'app'].includes(turn.role) && typeof turn.content === 'string' &&
      Number.isSafeInteger(turn.ts) && turn.ts > 0, 'invalid-source');
    for (const name of ['model', 'xid', 'contextRef']) insist(!own(turn, name) || (typeof turn[name] === 'string' && turn[name].length > 0), 'invalid-source');
    if (own(turn, 'id')) {
      insist((Number.isSafeInteger(turn.id) && turn.id > 0) || (typeof turn.id === 'string' && turn.id.length > 0), 'invalid-source');
      const key = JSON.stringify(turn.id); insist(!logicalIds.has(key), 'invalid-source'); logicalIds.add(key);
    }
    return turn;
  });
}

/** Produces the transport-independent snapshot shape from a caller's already
 * validated complete v1 record/v3 archive. This validates storage shape and
 * completeness; it is deliberately not a second learner-domain validator. */
export function legacySourceSnapshot(options) {
  const { recordText, archiveRows, importJournals = [] } = options;
  const includesDrift = own(options, 'legacyDriftText');
  insist(typeof recordText === 'string' && recordText.length <= LIMIT, 'invalid-source');
  let record;
  try { record = copy(JSON.parse(recordText)); } catch { throw new RecordControllerError('invalid-source'); }
  insist(plain(record) && record.v === 1 && Array.isArray(record.taken), 'unsupported-legacy-record');
  insist(record.aiEvidenceIncomplete !== true && Array.isArray(importJournals) && importJournals.length === 0, 'incomplete-source');
  insist((record.aiChat === undefined || Array.isArray(record.aiChat)) &&
    (record.aiReadings === undefined || Array.isArray(record.aiReadings)) &&
    (record.aiReading == null || plain(record.aiReading)), 'invalid-source');
  const rows = copy(archiveRows);
  const turns = logicalRows(rows);
  const archive = { database: ARCHIVE_DB, version: 3, rows, imports: [] };
  const counts = { archiveTurns: turns.length, chatTurns: record.aiChat?.length || 0,
    readingVersions: (record.aiReadings?.length || 0) + (record.aiReading ? 1 : 0) };
  if (includesDrift) {
    const { legacyDriftText } = options;
    const driftState = parseLegacyDriftText(legacyDriftText);
    insist(!own(record, 'driftState') || equal(record.driftState, driftState), 'drift-root-conflict');
    return copy({ format: 'kairo-legacy-source', version: 2, completeness: 'complete', recordText, archive, legacyDriftText,
      counts: { ...counts, driftKnownKeys: Object.keys(driftState.store.known).length, driftUnknownKeys: Object.keys(driftState.store.unknown).length },
      sha256: { record: hash(record), recordText: hash(recordText), archive: hash(archive), legacyDriftText: hash(legacyDriftText),
        driftState: hash(driftState), source: hash({ recordText, archive, legacyDriftText }) } });
  }
  return copy({ format: 'kairo-legacy-source', version: 1, completeness: 'complete', recordText, archive, counts,
    sha256: { record: hash(record), recordText: hash(recordText), archive: hash(archive), source: hash({ recordText, archive }) } });
}
function checkedSource(raw) {
  const source = copy(raw);
  insist(source.format === 'kairo-legacy-source' && [1, 2].includes(source.version) && source.completeness === 'complete', 'incomplete-source');
  keys(source, ['format', 'version', 'completeness', 'recordText', 'archive', 'counts', 'sha256', ...(source.version === 2 ? ['legacyDriftText'] : [])]);
  keys(source.archive, ['database', 'version', 'rows', 'imports']);
  insist(source.archive.database === ARCHIVE_DB && source.archive.version === 3, 'unsupported-archive');
  const actual = legacySourceSnapshot({ recordText: source.recordText, archiveRows: source.archive.rows, importJournals: source.archive.imports,
    ...(source.version === 2 ? { legacyDriftText: source.legacyDriftText } : {}) });
  insist(equal(source, actual), 'inconsistent-source');
  return actual;
}

async function readArchive() {
  const db = await new Promise((done, fail) => {
    let settled = false; let request;
    const finish = (error, opened) => {
      if (settled) { opened?.close(); return; }
      settled = true; clearTimeout(timer);
      if (error) fail(error); else done(opened);
    };
    const timer = setTimeout(() => finish(new RecordControllerError('archive-unavailable')), 5000);
    try {
      // No version argument and no upgrade: the existing archive is read only.
      request = indexedDB.open(ARCHIVE_DB);
      request.onupgradeneeded = () => { request.transaction.abort(); finish(new RecordControllerError('archive-unavailable')); };
      request.onblocked = request.onerror = () => finish(new RecordControllerError('archive-unavailable'));
      request.onsuccess = () => finish(null, request.result);
    } catch { finish(new RecordControllerError('archive-unavailable')); }
  });
  let changed = false;
  db.onversionchange = () => { changed = true; db.close(); };
  try {
    insist(db.version === 3 && [...db.objectStoreNames].sort().join() === 'imports,turns', 'unsupported-archive');
    return await new Promise((done, fail) => {
      const tx = db.transaction(['turns', 'imports'], 'readonly', { durability: 'strict' });
      let error;
      const timer = setTimeout(() => { error = new RecordControllerError('archive-unavailable'); try { tx.abort(); } catch { db.close(); fail(error); } }, 5000);
      tx.onabort = () => { clearTimeout(timer); fail(error || new RecordControllerError('archive-unavailable')); };
      try {
        const turns = tx.objectStore('turns'); const imports = tx.objectStore('imports');
        insist(turns.keyPath === 'id' && turns.autoIncrement && imports.keyPath === 'id' && !imports.autoIncrement &&
          [...turns.indexNames].join() === 'logical-id' && turns.index('logical-id').keyPath === 'turn.id' && !turns.index('logical-id').unique,
        'unsupported-archive');
        const rows = turns.getAll(); const journals = imports.getAll(); const count = turns.count();
        tx.oncomplete = () => {
          clearTimeout(timer);
          try {
            insist(!changed && count.result === rows.result.length, 'archive-changed');
            done({ rows: rows.result, imports: journals.result });
          } catch (problem) { fail(problem); }
        };
      } catch (problem) { error = problem; tx.abort(); }
    });
  } finally { db.close(); }
}
async function scanLegacy(writer, captured, includeDrift = false) {
  assertWriter(writer, captured);
  const recordText = localStorage.getItem(LEGACY_KEY);
  const legacyDriftText = includeDrift ? localStorage.getItem(DRIFT_KEY) : undefined;
  const archive = await readArchive();
  assertWriter(writer, captured);
  insist(localStorage.getItem(LEGACY_KEY) === recordText, 'source-changed');
  insist(!includeDrift || localStorage.getItem(DRIFT_KEY) === legacyDriftText, 'source-changed');
  return { recordText, archive: { database: ARCHIVE_DB, version: 3, rows: archive.rows, imports: archive.imports },
    ...(includeDrift ? { legacyDriftText } : {}) };
}

/** Caller still validates learner-domain fields before passing this snapshot
 * to prepare(). The exact physical archive keys and original text are retained. */
export async function captureLegacySource(writer, { includeDrift = false } = {}) {
  insist(typeof includeDrift === 'boolean', 'invalid-source-options');
  const captured = captureWriter(writer);
  const current = await scanLegacy(writer, captured, includeDrift);
  assertWriter(writer, captured);
  return legacySourceSnapshot({ recordText: current.recordText, archiveRows: current.archive.rows, importJournals: current.archive.imports,
    ...(includeDrift ? { legacyDriftText: current.legacyDriftText } : {}) });
}
function document(snapshot, collection, id) { return snapshot.documents.find((row) => row.collection === collection && row.id === id)?.value; }
function put(collection, id, value) { return { kind: 'put', collection, id, value }; }
function reserved(collection) { return typeof collection === 'string' && collection.startsWith('kairo:migration'); }
function portableRecord(source) {
  const record = JSON.parse(source.recordText);
  // Preserve every unknown learner field. Known provider transport metadata is
  // retained solely in explicit local-only custody, never activated as config.
  delete record.ai;
  if (source.version === 2) record.driftState = parseLegacyDriftText(source.legacyDriftText);
  return record;
}
function publicSnapshot(snapshot) {
  return { ...snapshot, documents: snapshot.documents.filter((row) => !reserved(row.collection)) };
}
const limitNotice = 'already-open-legacy-writers-must-honor-lock-or-be-closed';

class RecordController {
  #store; #writer; #policy; #databaseName; #requireDrift; #closed = false; #tail = Promise.resolve();
  constructor(store, options) { this.#store = store; this.#writer = options.writer; this.#policy = options.policy; this.#databaseName = options.databaseName; this.#requireDrift = options.requireDrift === true; }
  #guard(captured) { insist(!this.#closed, 'closed'); assertWriter(this.#writer, captured); insist(captured.sessionId === this.#policy.binding.sessionId, 'session-changed'); }
  #run(action) {
    const run = this.#tail.then(async () => {
      insist(!this.#closed, 'closed');
      const captured = captureWriter(this.#writer, this.#policy.binding.sessionId);
      return action(captured);
    });
    this.#tail = run.catch(() => undefined);
    return run;
  }
  #outcome(status, manifest, extra = {}) {
    return { status, migrationId: manifest?.migrationId || null, sourceCoverage: manifest ? ['record', 'archive', ...(manifest.version === 2 ? ['drift'] : [])] : [],
      legacyWriterLimit: limitNotice, ...extra };
  }
  async #read(captured) {
    this.#guard(captured);
    const snapshot = await this.#store.snapshot(); this.#guard(captured);
    const manifest = document(snapshot, PRIVATE, MANIFEST);
    if (manifest === undefined) return { snapshot, manifest: null, source: null };
    insist(plain(manifest) && manifest.format === 'kairo-record-migration' && [1, 2].includes(manifest.version), 'unsupported-migration');
    insist(['prepared', 'intent', 'active', 'quarantined'].includes(manifest.phase) && opaque(manifest.migrationId) &&
      manifest.databaseName === this.#databaseName && equal(manifest.binding, this.#policy.binding), 'migration-binding-mismatch');
    const custody = document(snapshot, CUSTODY, manifest.migrationId);
    insist(plain(custody) && custody.format === 'kairo-local-custody' && custody.version === manifest.version && custody.localOnly === true && custody.portable === false,
      'custody-unavailable');
    const source = checkedSource(custody.source);
    insist(source.version === manifest.version && source.sha256.source === manifest.sourceSha256 && equal(source.counts, manifest.counts), 'custody-inconsistent');
    insist(manifest.fenceText === this.#fence(manifest.migrationId, source.sha256.source, source.version), 'custody-inconsistent');
    if (source.version === 2) insist(manifest.driftFenceText === this.#driftFence(manifest.migrationId, source.sha256.source), 'custody-inconsistent');
    // Before activation there must still be a byte-for-byte complete candidate.
    // After activation these documents are allowed to evolve via commitLocal.
    if (manifest.phase === 'prepared' || manifest.phase === 'intent') {
      insist(equal(document(snapshot, RECORD, CURRENT), portableRecord(source)) &&
        equal(document(snapshot, ARCHIVE, CURRENT), { version: 1, turns: logicalRows(source.archive.rows) }), 'prepared-generation-diverged');
      insist(snapshot.replica.operations.length === 0 && snapshot.outbox.length === 0, 'prepared-generation-diverged');
    }
    if (source.version === 2) readDriftState(document(snapshot, RECORD, CURRENT));
    return { snapshot, manifest, source };
  }
  #fence(migrationId, sourceSha256, version = 1) {
    return JSON.stringify({ v: 2, format: 'kairo-transactional-record', version, migrationId, databaseName: this.#databaseName,
      accountId: this.#policy.binding.accountId, learnerId: this.#policy.binding.learnerId, sourceSha256 });
  }
  #driftFence(migrationId, sourceSha256) {
    // The deployed loader ignores version fields. known:false is deliberately
    // invalid to its judgmentMap check, preserving this marker in read-only mode.
    return JSON.stringify({ v: 2, format: 'kairo-transactional-drift', version: 1, migrationId, databaseName: this.#databaseName,
      accountId: this.#policy.binding.accountId, learnerId: this.#policy.binding.learnerId, sourceSha256, known: false });
  }
  async #commit(captured, snapshot, changeId, mutations, occurredAt = new Date().toISOString()) {
    this.#guard(captured);
    const receipt = await this.#store.commitLocal({ changeId, binding: this.#policy.binding, expectedRevision: snapshot.revision,
      occurredAt, mutations, operations: [] });
    this.#guard(captured);
    return receipt;
  }
  async #observe(captured, state) {
    const actual = await scanLegacy(this.#writer, captured, state.source.version === 2); this.#guard(captured);
    if (!equal(actual.archive, state.source.archive)) return { kind: 'diverged', reason: 'legacy-archive-diverged' };
    const record = actual.recordText === state.source.recordText ? 'original' : actual.recordText === state.manifest.fenceText ? 'fenced' : 'diverged';
    if (record === 'diverged') return { kind: 'diverged', reason: 'legacy-record-diverged' };
    if (state.source.version === 1) return { kind: record, record };
    const drift = actual.legacyDriftText === state.source.legacyDriftText ? 'original' : actual.legacyDriftText === state.manifest.driftFenceText ? 'fenced' : 'diverged';
    if (drift === 'diverged') return { kind: 'diverged', reason: 'legacy-drift-diverged' };
    return { kind: record === drift ? record : 'partial', record, drift };
  }
  async #quarantine(captured, state, reason, receipt) {
    let persisted = false;
    try {
      this.#guard(captured);
      const latest = await this.#read(captured);
      if (latest.manifest.phase !== 'quarantined') {
        const manifest = { ...latest.manifest, phase: 'quarantined', previousPhase: latest.manifest.phase, reason };
        await this.#commit(captured, latest.snapshot, `quarantine-${crypto.randomUUID()}`, [put(PRIVATE, MANIFEST, manifest)]);
      }
      persisted = true;
    } catch { /* Both sources and any target receipt remain; no rollback write. */ }
    return this.#outcome('quarantined', state.manifest, { reason, quarantinePersisted: persisted,
      ...(receipt ? { targetReceipt: receipt, targetCommitDurable: true } : {}) });
  }
  async #status(captured) {
    const state = await this.#read(captured);
    if (!state.manifest) {
      let legacy;
      try { const text = localStorage.getItem(LEGACY_KEY); legacy = text === null ? null : JSON.parse(text); }
      catch { return { ...state, outcome: this.#outcome('quarantined', null, { reason: 'legacy-record-unreadable', quarantinePersisted: false }) }; }
      if ((legacy !== null && (!plain(legacy) || legacy.v !== 1)) || state.snapshot.documents.length || state.snapshot.replica.operations.length)
        return { ...state, outcome: this.#outcome('quarantined', null, { reason: 'custody-unavailable', quarantinePersisted: false }) };
      if (this.#requireDrift) {
        try { parseLegacyDriftText(localStorage.getItem(DRIFT_KEY)); }
        catch { return { ...state, outcome: this.#outcome('quarantined', null, { reason: 'legacy-drift-unreadable', quarantinePersisted: false }) }; }
      }
      return { ...state, outcome: this.#outcome('legacy', null) };
    }
    if (state.manifest.phase === 'quarantined') return { ...state, outcome: this.#outcome('quarantined', state.manifest, { reason: state.manifest.reason, quarantinePersisted: true }) };
    const observed = await this.#observe(captured, state);
    if (observed.kind === 'diverged') return { ...state, outcome: await this.#quarantine(captured, state, observed.reason) };
    if ((state.manifest.phase === 'active' && observed.kind !== 'fenced') ||
      (state.manifest.phase === 'prepared' && observed.kind !== 'original'))
      return { ...state, outcome: await this.#quarantine(captured, state, 'activation-stores-disagree') };
    if (this.#requireDrift && state.source.version === 1)
      return { ...state, outcome: this.#outcome('recovery-required', state.manifest, { reason: 'drift-migration-required', retryable: false }) };
    if (state.manifest.phase === 'intent' && ['fenced', 'partial'].includes(observed.kind))
      return { ...state, outcome: this.#outcome('recovery-required', state.manifest, { reason: observed.kind === 'partial' ? 'partial-fences' : 'fence-awaits-activation', retryable: true }) };
    return { ...state, outcome: this.#outcome(state.manifest.phase === 'active' ? 'active' : 'prepared', state.manifest) };
  }

  prepare(rawSource, { migrationId } = {}) {
    return this.#run(async (captured) => {
      insist(opaque(migrationId), 'invalid-migration-id');
      const source = checkedSource(rawSource);
      insist(!this.#requireDrift || source.version === 2, 'drift-source-required');
      const state = await this.#read(captured);
      if (state.manifest) {
        insist(state.manifest.migrationId === migrationId && state.manifest.sourceSha256 === source.sha256.source, 'migration-conflict');
        return (await this.#status(captured)).outcome;
      }
      insist(state.snapshot.documents.length === 0 && state.snapshot.replica.operations.length === 0 && state.snapshot.outbox.length === 0 &&
        state.snapshot.inbox.length === 0 && state.snapshot.checkpoints.length === 0, 'target-occupied');
      const actual = await scanLegacy(this.#writer, captured, source.version === 2); this.#guard(captured);
      if (actual.recordText !== source.recordText || !equal(actual.archive, source.archive) ||
        (source.version === 2 && actual.legacyDriftText !== source.legacyDriftText))
        return this.#outcome('source-changed', null, { reason: 'source-changed-before-prepare', sourcePreserved: true });
      const manifest = { format: 'kairo-record-migration', version: source.version, phase: 'prepared', migrationId, databaseName: this.#databaseName,
        binding: this.#policy.binding, sourceSha256: source.sha256.source, counts: source.counts, preparedBy: captured,
        preparedAt: new Date().toISOString(), fenceText: this.#fence(migrationId, source.sha256.source, source.version),
        ...(source.version === 2 ? { driftFenceText: this.#driftFence(migrationId, source.sha256.source) } : {}) };
      const mutations = [put(CUSTODY, migrationId, { format: 'kairo-local-custody', version: source.version, localOnly: true, portable: false, source }),
        put(RECORD, CURRENT, portableRecord(source)), put(ARCHIVE, CURRENT, { version: 1, turns: logicalRows(source.archive.rows) }), put(PRIVATE, MANIFEST, manifest)];
      // A candidate too large for one atomic local commit is refused before
      // mutation. No partial custody is called complete; chunked generations
      // require a separate extension of this protocol.
      copy({ changeId: `prepare-${hash([migrationId, source.sha256.source])}`, binding: this.#policy.binding,
        expectedRevision: state.snapshot.revision, occurredAt: manifest.preparedAt, mutations, operations: [] });
      let receipt;
      try {
        receipt = await this.#commit(captured, state.snapshot, `prepare-${hash([migrationId, source.sha256.source])}`, mutations, manifest.preparedAt);
        return (await this.#status(captured)).outcome;
      } catch (error) {
        return this.#outcome('recovery-required', manifest, { reason: error.code || 'storage-failure', retryable: true,
          ...(receipt ? { targetReceipt: receipt, targetCommitDurable: true } : {}) });
      }
    });
  }

  activate(migrationId) {
    return this.#run(async (captured) => {
      let state = await this.#status(captured);
      insist(state.manifest && state.manifest.migrationId === migrationId, 'migration-conflict');
      if (state.outcome.status === 'active' || state.outcome.status === 'quarantined' || state.outcome.reason === 'drift-migration-required') return state.outcome;
      const attemptId = crypto.randomUUID();
      const intent = { ...state.manifest, phase: 'intent', attemptId };
      const attempt = { format: 'kairo-migration-attempt', version: 1, migrationId, sourceSha256: state.source.sha256.source,
        writer: captured, at: new Date().toISOString(), previousAttempt: state.manifest.attemptId || null };
      let boundary = 'prepared';
      try {
        await this.#commit(captured, state.snapshot, `intent-${attemptId}`, [put(ATTEMPTS, attemptId, attempt), put(PRIVATE, MANIFEST, intent)], attempt.at);
        boundary = 'intent';
        state = await this.#read(captured);
        const observed = await this.#observe(captured, state);
        if (observed.kind === 'diverged') return this.#quarantine(captured, state, observed.reason);
        this.#guard(captured);
        if (observed.record === 'original') {
          // There is no localStorage CAS. The held legacy Web Lock is the
          // cooperative exclusion primitive; original custody already exists.
          if (localStorage.getItem(LEGACY_KEY) !== state.source.recordText) return this.#quarantine(captured, state, 'legacy-record-diverged');
          this.#guard(captured);
          localStorage.setItem(LEGACY_KEY, state.manifest.fenceText);
        }
        boundary = 'record-fenced';
        if (state.source.version === 2) {
          const partial = await this.#observe(captured, state);
          if (partial.kind === 'diverged') return this.#quarantine(captured, state, partial.reason);
          this.#guard(captured);
          if (partial.record !== 'fenced') return this.#quarantine(captured, state, 'activation-stores-disagree');
          if (partial.drift === 'original') {
            // A second separately fallible LS write. Durable intent recognizes
            // either partial state on recovery; no cross-store atomicity claim.
            if (localStorage.getItem(LEGACY_KEY) !== state.manifest.fenceText) return this.#quarantine(captured, state, 'legacy-record-diverged');
            if (localStorage.getItem(DRIFT_KEY) !== state.source.legacyDriftText) return this.#quarantine(captured, state, 'legacy-drift-diverged');
            this.#guard(captured);
            localStorage.setItem(DRIFT_KEY, state.manifest.driftFenceText);
          }
        }
        boundary = 'fenced';
        const fenced = await this.#observe(captured, state);
        if (fenced.kind !== 'fenced') return this.#quarantine(captured, state, fenced.reason || 'activation-stores-disagree');
        this.#guard(captured);
        const active = { ...state.manifest, phase: 'active', activatedAt: new Date().toISOString(), activatedBy: captured };
        await this.#commit(captured, state.snapshot, `active-${attemptId}`, [put(PRIVATE, MANIFEST, active)]);
        boundary = 'active';
        return (await this.#status(captured)).outcome;
      } catch (error) {
        // Intent/custody lets the next owner recover even if fencing succeeded
        // and activation acknowledgement never arrived. Never restore v1 here.
        return this.#outcome('recovery-required', state.manifest, { reason: error.code || 'storage-failure', boundary, retryable: true });
      }
    });
  }
  resume() { return this.#run(async (captured) => (await this.#status(captured)).outcome); }
  snapshot() {
    return this.#run(async (captured) => {
      const state = await this.#status(captured);
      if (state.outcome.status !== 'active') return state.outcome;
      return { ...state.outcome, snapshot: publicSnapshot(state.snapshot) };
    });
  }
  /** Explicit forensic path. May contain legacy secrets present in exact source
   * text. Never include this in a portable record, request prompt, or outbox. */
  localCustody() {
    return this.#run(async (captured) => {
      const state = await this.#read(captured);
      return { localOnly: true, portable: false, migrationId: state.manifest?.migrationId || null, source: state.source };
    });
  }
  #delegate(method, request) {
    return this.#run(async (captured) => {
      const state = await this.#status(captured);
      if (state.outcome.status !== 'active') return state.outcome;
      if (method === 'commitLocal' || method === 'commitRestore') {
        insist(Array.isArray(request.mutations) && request.mutations.every((mutation) => !reserved(mutation.collection)), 'reserved-migration-data');
        if (state.source.version === 2) for (const mutation of request.mutations) {
          if (mutation.collection !== RECORD || mutation.id !== CURRENT) continue;
          insist(mutation.kind === 'put', 'drift-state-required');
          readDriftState(mutation.value);
        }
      }
      this.#guard(captured);
      const receipt = await this.#store[method](request);
      try {
        this.#guard(captured);
        const observed = await this.#observe(captured, state);
        if (observed.kind !== 'fenced') return this.#quarantine(captured, state, observed.reason || 'activation-stores-disagree', receipt);
        return this.#outcome('active', state.manifest, { receipt });
      } catch (error) {
        return this.#outcome('recovery-required', state.manifest, { reason: error.code || 'source-verification-failed', targetReceipt: receipt, targetCommitDurable: true });
      }
    });
  }
  commitLocal(request) { return this.#delegate('commitLocal', request); }
  commitRestore(request) { return this.#delegate('commitRestore', request); }
  commitReceive(request) { return this.#delegate('commitReceive', request); }
  acknowledgeOutbox(request) { return this.#delegate('acknowledgeOutbox', request); }
  async close() { this.#closed = true; await this.#tail; await this.#store.close(); }
}

export async function createRecordController(options) {
  insist(plain(options) && plain(options.writer) && typeof options.writer.capture === 'function' && typeof options.writer.assert === 'function', 'writer-required');
  const captured = captureWriter(options.writer, options.policy?.binding?.sessionId);
  const databaseName = options.databaseName;
  insist(options.requireDrift === undefined || typeof options.requireDrift === 'boolean', 'invalid-source-options');
  insist(opaque(databaseName) && databaseName !== ARCHIVE_DB, 'invalid-target');
  const store = await IndexedDbReplicationStore.open({ databaseName, policy: options.policy, actor: options.actor });
  try { assertWriter(options.writer, captured); }
  catch (error) { await store.close(); throw error; }
  return new RecordController(store, { ...options, databaseName, policy: copy(options.policy) });
}
