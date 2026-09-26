/** Live async app seam. The caller owns the existing writer lock and
 * RecordController. Identity here is local scope, not authentication.
 *
 * A versioned reducer is synchronous and pure. It receives the latest immutable
 * committed record/archive when dequeued, never a previously captured UI S.
 * Command evidence and its local effects land in one target transaction. Full
 * records, archives, command receipts and migration custody never become sync
 * operations merely because this host can persist them.
 */
import { createSyncOperation, encodeLocalJson, exportOperationJournal, operationReference, parseOperationJournalBackup, parseReadingAnchor, readNoteViews, readReadingViews, readSourceReferenceViews, readExamAttemptViews } from './modules/record-core.mjs';
import { parseSourceReferenceInput, sourceReferenceIntent, prepareSourceReferenceCapture } from './source-inbox.mjs';

const PRACTICE_FINALIZE = 'host.practice-finalize/1';
const ASSESSMENT_FINALIZE = 'host.assessment-finalize/2';
const ASSESSMENT_SUPPRESS = 'host.assessment-suppress/2';
const ASSESSMENT_RECONCILE = 'host.assessment-reconcile/2';
const ASSESSMENT_ENRICH = 'host.assessment-enrich/2';
const RECORD = 'learner-record';
const ARCHIVE = 'learner-archive';
const COMMANDS = 'kairo:record-host-commands';
const CURRENT = 'current';
const NONPORTABLE = new Set(['ai', 'aiEvidence', 'recordGeneration']);
const NOTE_CREATE = 'host.note-create/1';
const NOTE_EDIT = 'host.note-edit/1';
const NOTE_DELETE = 'host.note-delete/1';
const NOTE_RESTORE = 'host.note-restore/1';
const NOTE_CHOOSE = 'host.note-choose/1';
const NOTE_RESTORE_ORIGINAL = 'host.note-restore-original/1';
const READING_RESUME = 'host.reading-resume/1';
const SOURCE_REFERENCE = 'host.source-reference/1';
const NOTE_COMMANDS = new Set([NOTE_CREATE, NOTE_EDIT, NOTE_DELETE, NOTE_RESTORE, NOTE_CHOOSE, NOTE_RESTORE_ORIGINAL]);
const BUILTIN = new Set(['host.observations/1', 'host.archive/1', 'host.restore/1', 'host.restore/2', ...NOTE_COMMANDS, PRACTICE_FINALIZE, ASSESSMENT_FINALIZE, ASSESSMENT_SUPPRESS, ASSESSMENT_RECONCILE, ASSESSMENT_ENRICH, READING_RESUME, SOURCE_REFERENCE]);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = (value) => encodeLocalJson(value).value;
const digest = (value) => encodeLocalJson(value).sha256;
const same = (a, b) => encodeLocalJson(a).text === encodeLocalJson(b).text;
const scopeOf = (binding) => ({ accountId: binding.accountId, learnerId: binding.learnerId });

export class RecordHostError extends Error {
  constructor(code) { super(`Record host: ${code}`); this.name = 'RecordHostError'; this.code = code; }
}
function insist(condition, code) { if (!condition) throw new RecordHostError(code); }
function keys(value, required, optional = [], code = 'invalid-command') {
  insist(plain(value) && required.every((key) => own(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key)), code);
}
function id(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 32);
}
function instant(value) {
  insist(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'invalid-command');
}
function merged(record, patch) {
  const result = Object.create(null);
  for (const [key, value] of Object.entries(record)) result[key] = value;
  for (const [key, value] of Object.entries(patch)) result[key] = value;
  return result;
}
function portable(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !NONPORTABLE.has(key)));
}
function counts(record, turns, journal) {
  return { archiveTurns: turns.length, chatTurns: record.aiChat?.length || 0,
    readingVersions: (record.aiReadings?.length || 0) + (record.aiReading ? 1 : 0),
    ...(journal ? { syncOperations: journal.operations.length } : {}) };
}
function command(raw) {
  const value = copy(raw);
  keys(value, ['changeId', 'type', 'occurredAt', 'input']);
  insist(id(value.changeId) && id(value.type) && /\/[1-9]\d*$/u.test(value.type), 'invalid-command');
  instant(value.occurredAt);
  return value;
}
function baseCommand(raw, type, input) {
  const base = copy(raw);
  keys(base, ['changeId', 'occurredAt']);
  return command({ ...base, type, input });
}
function originalNoteInput(raw) {
  const input = copy(raw);
  keys(input, ['text'], [], 'invalid-note');
  const text = input.text;
  insist(typeof text === 'string' && text.length <= 64000 && text.trim().length > 0, 'invalid-note');
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(++index);
      insist(next >= 0xdc00 && next <= 0xdfff, 'invalid-note');
    } else insist(unit < 0xdc00 || unit > 0xdfff, 'invalid-note');
  }
  return input;
}
function originalNoteIntent(binding, changeId, input) {
  const identity = digest([scopeOf(binding), changeId]);
  return copy({ payload: { kind: 'note.version', noteId: `personal-note:${identity}`,
    versionId: `personal-note-version:${identity}`, generation: null, supersedes: [],
    segments: [{ kind: 'original', text: input.text }] }, dependencies: [] });
}
function noteRef(value) {
  keys(value, ['opId', 'sha256'], [], 'invalid-note-reference');
  insist(Object.values(value).every((part) => typeof part === 'string' && /^[0-9a-f]{64}$/u.test(part)), 'invalid-note-reference');
}
function noteRefs(value) {
  insist(Array.isArray(value) && value.length <= 128, 'invalid-note-reference');
  value.forEach(noteRef);
  insist(new Set(value.map((ref) => ref.opId)).size === value.length, 'invalid-note-reference');
}
/** A reading position is an explicit intent, never evidence of reading or
 * permission to copy source text. The journal supplies both its durable local
 * view and its sync operation in the same transaction. Ordinary saves cannot
 * resolve concurrent heads; a choice must name the exact displayed version. */
export function readingResumeIntent(snapshot, raw, duplicate = false) {
  const input = copy(raw);
  keys(input, ['sessionId', 'anchor', 'expected', 'selected'], [], 'invalid-reading-position');
  insist(id(input.sessionId), 'invalid-reading-position');
  const anchor = parseReadingAnchor(input.anchor);
  keys(input.expected, ['heads', 'tombstones', 'activeRestoreGenerations'], [], 'invalid-reading-preconditions');
  Object.values(input.expected).forEach(noteRefs);
  if (input.selected !== null) noteRef(input.selected);
  const view = readReadingViews(snapshot.replica).find((row) => row.sourceId === anchor.source.sourceId);
  const current = view ? observedNote(view.projection) : { heads: [], tombstones: [], activeRestoreGenerations: [] };
  if (!duplicate) insist(same(input.expected, current), 'reading-position-superseded');
  // This command does not restore deleted positions or establish a generation.
  insist(!input.expected.tombstones.length && !input.expected.activeRestoreGenerations.length, 'reading-position-deleted');
  const heads = input.expected.heads.map((ref) => {
    const operation = snapshot.replica.operations.find((row) => row.opId === ref.opId);
    insist(operation && same(operationReference(operation), ref) &&
      snapshot.replica.ready.some((row) => same(row, ref)) && operation.payload.kind === 'reading.resume' &&
      operation.payload.anchor.source.sourceId === anchor.source.sourceId && operation.payload.generation === null,
    'reading-position-reference-unconfirmed');
    return operation;
  });
  let supersedes;
  if (input.selected !== null) {
    const selected = heads.find((row) => same(operationReference(row), input.selected));
    insist(selected && same(selected.payload.anchor, anchor) && selected.payload.sessionId === input.sessionId,
      'reading-position-choice-not-current');
    supersedes = input.expected.heads;
  } else {
    insist(new Set(heads.map((row) => row.payloadSha256)).size <= 1, 'reading-position-choice-required');
    supersedes = heads.filter((row) => row.payload.sessionId === input.sessionId &&
      same(row.payload.anchor.source, anchor.source)).map(operationReference);
  }
  return copy({ payload: { kind: 'reading.resume', sessionId: input.sessionId, anchor, generation: null, supersedes },
    dependencies: input.expected.heads });
}
function lifecycleInput(type, raw) {
  if (type === NOTE_CREATE) return originalNoteInput(raw);
  const input = copy(raw);
  const extra = type === NOTE_RESTORE_ORIGINAL ? ['history', 'selected', 'generation'] : type === NOTE_EDIT ? ['text', 'generation'] : type === NOTE_RESTORE ? ['reason'] : type === NOTE_CHOOSE ? ['selected'] : [];
  keys(input, ['noteId', 'expected', ...extra], [], 'invalid-note');
  insist(id(input.noteId), 'invalid-note');
  keys(input.expected, ['heads', 'tombstones', 'activeRestoreGenerations'], [], 'invalid-note-preconditions');
  Object.values(input.expected).forEach(noteRefs);
  if (type === NOTE_EDIT) {
    originalNoteInput({ text: input.text });
    if (input.generation !== null) noteRef(input.generation);
  }
  if (type === NOTE_RESTORE) {
    originalNoteInput({ text: input.reason });
    insist(input.reason.length <= 2000, 'invalid-note');
  }
  if (type === NOTE_CHOOSE || type === NOTE_RESTORE_ORIGINAL) noteRef(input.selected);
  if (type === NOTE_RESTORE_ORIGINAL) { noteRefs(input.history); if (input.generation !== null) noteRef(input.generation); }
  return input;
}
function observedNote(projection) {
  return { heads: projection.heads, tombstones: projection.tombstones,
    activeRestoreGenerations: projection.activeRestoreGenerations };
}
function lifecycleIntent(binding, value, state, duplicate) {
  const input = lifecycleInput(value.type, value.input);
  if (value.type === NOTE_CREATE) return originalNoteIntent(binding, value.changeId, input);
  const view = state.noteViews.find((note) => note.noteId === input.noteId);
  insist(view, 'note-not-found');
  if (!duplicate) insist(same(input.expected, observedNote(view.projection)), 'note-superseded');
  const byId = new Map(state.snapshot.replica.operations.map((operation) => [operation.opId, operation]));
  const ready = new Set(state.snapshot.replica.ready.map((ref) => ref.opId));
  const referenced = (ref, kind) => {
    const operation = byId.get(ref.opId);
    insist(operation && ready.has(ref.opId) && same(operationReference(operation), ref) &&
      operation.payload.kind === kind && (kind === 'note.version' ? operation.payload.noteId === input.noteId :
        operation.payload.target.kind === 'note' && operation.payload.target.id === input.noteId), 'note-reference-unconfirmed');
    return operation;
  };
  const heads = input.expected.heads.map((ref) => referenced(ref, 'note.version'));
  input.expected.tombstones.forEach((ref) => referenced(ref, 'entity.tombstone'));
  input.expected.activeRestoreGenerations.forEach((ref) => referenced(ref, 'entity.restore'));
  // The exact observed refs are causal evidence, not authorization. No caller
  // identity or quoted segment enters this command path. Never trim provenance.
  const dependencies = [...new Map(Object.values(input.expected).flat().map((ref) => [ref.opId, ref])).values()]
    .sort((a, b) => a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0);
  insist(dependencies.length <= 128, 'note-reference-limit');
  const target = { kind: 'note', id: input.noteId };
  if (value.type === NOTE_DELETE) {
    insist(heads.length > 0 || input.expected.activeRestoreGenerations.length > 0, 'note-already-deleted');
    return copy({ payload: { kind: 'entity.tombstone', target, reason: 'user-deleted' }, dependencies });
  }
  if (value.type === NOTE_RESTORE) {
    insist(heads.length === 0 && input.expected.tombstones.length > 0 &&
      input.expected.activeRestoreGenerations.length === 0, 'note-not-deleted');
    // Restoration opens a generation. Old text remains suppressed until a
    // separate explicit original-text edit names the acknowledged generation.
    return copy({ payload: { kind: 'entity.restore', target,
      tombstones: input.expected.tombstones, reason: input.reason }, dependencies });
  }
  let generation;
  let segments;
  if (value.type === NOTE_CHOOSE) {
    insist(new Set(heads.map((operation) => operation.payloadSha256)).size > 1, 'note-choice-not-required');
    const selected = heads.find((operation) => same(operationReference(operation), input.selected));
    insist(selected, 'note-choice-not-current');
    insist(selected.payload.segments.every((segment) => segment.kind === 'original'), 'source-quote-admission-required');
    generation = selected.payload.generation;
    segments = selected.payload.segments;
  } else {
    insist(heads.every((operation) => operation.payload.segments.every((segment) => segment.kind === 'original')), 'source-quote-admission-required');
    insist(heads.length > 0 || input.expected.activeRestoreGenerations.length > 0, 'note-not-editable');
    generation = input.generation;
    segments = [{ kind: 'original', text: input.text }];
  }
  insist(generation === null ? input.expected.tombstones.length === 0 && input.expected.activeRestoreGenerations.length === 0 :
    input.expected.activeRestoreGenerations.some((ref) => same(ref, generation)), 'note-generation-unconfirmed');
  return copy({ payload: { kind: 'note.version', noteId: input.noteId,
    versionId: `personal-note-version:${digest([scopeOf(binding), value.changeId])}`,
    generation, supersedes: input.expected.heads, segments }, dependencies });
}
function noteHistory(state, noteId) {
  const ready = new Set(state.snapshot.replica.ready.map((ref) => ref.opId));
  return state.snapshot.replica.operations.filter((operation) => ready.has(operation.opId) &&
    operation.payload.kind === 'note.version' && operation.payload.noteId === noteId);
}
function restorationPreview(state, noteId) {
  const view = state.noteViews.find((note) => note.noteId === noteId);
  insist(view, 'note-not-found');
  insist(view.projection.tombstones.length > 0 && view.headVersions.length === 0 &&
    view.projection.activeRestoreGenerations.length <= 1 && !view.projection.identityConflicts.length, 'note-restoration-unavailable');
  const history = noteHistory(state, noteId);
  const expected = observedNote(view.projection);
  const references = history.map(operationReference);
  insist(new Set([...Object.values(expected).flat(), ...references].map((ref) => ref.opId)).size <= 128, 'note-reference-limit');
  const groups = new Map();
  for (const operation of history) {
    if (!operation.payload.segments.every((segment) => segment.kind === 'original')) continue;
    const prior = groups.get(operation.payloadSha256);
    if (prior) prior.operationRefs.push(operationReference(operation));
    else groups.set(operation.payloadSha256, { payloadSha256: operation.payloadSha256,
      segments: operation.payload.segments, operationRefs: [operationReference(operation)] });
  }
  return copy({ noteId, expected, history: references,
    generation: expected.activeRestoreGenerations[0] || null, versions: [...groups.values()],
    quotedVersionsExcluded: history.filter((operation) => operation.payload.segments.some((segment) => segment.kind === 'source-quote')).length });
}
function restoreOriginalIntents(binding, value, state, duplicate) {
  const input = lifecycleInput(value.type, value.input);
  const view = state.noteViews.find((note) => note.noteId === input.noteId);
  insist(view, 'note-not-found');
  const history = noteHistory(state, input.noteId);
  if (!duplicate) {
    const preview = restorationPreview(state, input.noteId);
    insist(same(input.expected, preview.expected) && same(input.history, preview.history) &&
      same(input.generation, preview.generation), 'note-superseded');
  }
  const ready = new Set(state.snapshot.replica.ready.map((ref) => ref.opId));
  const resolve = (ref, kind) => {
    const operation = state.snapshot.replica.operations.find((row) => row.opId === ref.opId);
    insist(operation && ready.has(ref.opId) && same(operationReference(operation), ref) && operation.payload.kind === kind &&
      (kind === 'note.version' ? operation.payload.noteId === input.noteId : operation.payload.target.kind === 'note' && operation.payload.target.id === input.noteId), 'note-reference-unconfirmed');
    return operation;
  };
  const saved = input.history.map((ref) => resolve(ref, 'note.version'));
  insist(input.history.some((ref) => same(ref, input.selected)), 'note-choice-not-current');
  const selected = resolve(input.selected, 'note.version');
  insist(selected.payload.segments.every((segment) => segment.kind === 'original'), 'source-quote-admission-required');
  input.expected.heads.forEach((ref) => resolve(ref, 'note.version'));
  input.expected.tombstones.forEach((ref) => resolve(ref, 'entity.tombstone'));
  input.expected.activeRestoreGenerations.forEach((ref) => resolve(ref, 'entity.restore'));
  insist(input.expected.heads.length === 0 && input.expected.tombstones.length > 0 &&
    (input.generation === null ? input.expected.activeRestoreGenerations.length === 0 :
      input.expected.activeRestoreGenerations.length === 1 && same(input.expected.activeRestoreGenerations[0], input.generation)), 'note-generation-unconfirmed');
  const dependencies = [...new Map([...Object.values(input.expected).flat(), ...input.history].map((ref) => [ref.opId, ref])).values()]
    .sort((a, b) => a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0);
  insist(dependencies.length <= 128, 'note-reference-limit');
  const versionId = `personal-note-version:${digest([scopeOf(binding), value.changeId])}`;
  const restore = { payload: { kind: 'entity.restore', target: { kind: 'note', id: input.noteId },
    tombstones: input.expected.tombstones, reason: 'restore-selected-original' }, dependencies };
  let generation = input.generation;
  if (generation === null) {
    if (duplicate) {
      const matches = history.filter((operation) => operation.payload.versionId === versionId &&
        operation.actor.deviceId === state.snapshot.actor.deviceId && operation.actor.incarnationId === state.snapshot.actor.incarnationId &&
        operation.occurredAt === value.occurredAt);
      insist(matches.length === 1 && matches[0].payload.generation !== null, 'note-operation-unconfirmed');
      generation = matches[0].payload.generation;
      const priorRestore = resolve(generation, 'entity.restore');
      insist(same(priorRestore.payload, restore.payload) && same(priorRestore.dependencies, dependencies) &&
        priorRestore.actor.deviceId === matches[0].actor.deviceId && priorRestore.actor.incarnationId === matches[0].actor.incarnationId &&
        priorRestore.actor.sequence + 1 === matches[0].actor.sequence && same(matches[0].predecessor, generation) &&
        priorRestore.occurredAt === value.occurredAt, 'note-operation-unconfirmed');
    } else {
      const { actor, policy } = state.snapshot;
      insist(Number.isSafeInteger(actor.sequence + 2), 'note-sequence-exhausted');
      // Pure prediction from the planner-owned current profile is not allocation.
      // The unchanged store independently allocates both operations under the
      // same whole-revision CAS. A stale actor/profile cannot admit this pair.
      generation = operationReference(createSyncOperation({ format: 'kairo-sync-operation', v: 1,
        scope: scopeOf(binding), actor: { deviceId: actor.deviceId, incarnationId: actor.incarnationId, sequence: actor.sequence + 1 },
        predecessor: actor.predecessor, dependencies, schemaEpoch: policy.schemaEpoch, deletionEpoch: policy.deletionEpoch,
        mergePolicy: policy.mergePolicy, occurredAt: value.occurredAt, payload: restore.payload }));
    }
  } else resolve(generation, 'entity.restore');
  const version = { payload: { kind: 'note.version', noteId: input.noteId, versionId, generation,
    supersedes: saved.filter((operation) => operation.payloadSha256 === selected.payloadSha256).map(operationReference),
    segments: selected.payload.segments }, dependencies };
  return copy(input.generation === null ? [restore, version] : [version]);
}
function practiceInput(raw) {
  const input = copy(raw);
  keys(input, ['expectedRevision', 'scope', 'attemptId', 'expectedRevisionId', 'form', 'outcome', 'elapsedDeltaMs', 'activeDeltaMs', 'dismiss'], [], 'invalid-practice-command');
  keys(input.scope, ['accountId', 'learnerId'], [], 'invalid-practice-command');
  keys(input.form, ['formId', 'versionId', 'sha256'], [], 'invalid-practice-command');
  insist(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0 &&
    [input.attemptId, input.expectedRevisionId, input.scope.accountId, input.scope.learnerId, input.form.formId, input.form.versionId].every(id) &&
    typeof input.form.sha256 === 'string' && /^[0-9a-f]{64}$/u.test(input.form.sha256) &&
    ['submitted', 'abandoned'].includes(input.outcome) && typeof input.dismiss === 'boolean' &&
    [input.elapsedDeltaMs, input.activeDeltaMs].every((duration) => Number.isSafeInteger(duration) && duration >= 0) &&
    input.activeDeltaMs <= input.elapsedDeltaMs, 'invalid-practice-command');
  return input;
}
function practiceEvidence(value) {
  keys(value, ['attemptId', 'attemptRevisionId', 'intentSha256', 'operation'], [], 'unsupported-command-receipt');
  insist(id(value.attemptId) && id(value.attemptRevisionId) && typeof value.intentSha256 === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.intentSha256), 'unsupported-command-receipt');
  noteRef(value.operation);
}
function assessmentEvidence(value) {
  keys(value, ['attemptId', 'attemptRevisionId', 'followupId', 'intentsSha256', 'operations'], [], 'unsupported-command-receipt');
  insist([value.attemptId, value.attemptRevisionId, value.followupId].every(id) &&
    typeof value.intentsSha256 === 'string' && /^[0-9a-f]{64}$/u.test(value.intentsSha256) &&
    Array.isArray(value.operations) && value.operations.length > 0 && value.operations.length <= 16, 'unsupported-command-receipt');
  noteRefs(value.operations);
}
function suppressionEvidence(value) {
  keys(value, ['keys', 'remaining', 'intentsSha256', 'operations'], [], 'unsupported-command-receipt');
  insist(Array.isArray(value.keys) && value.keys.length <= 100 && new Set(value.keys).size === value.keys.length &&
    value.keys.every((key) => typeof key === 'string' && /^(word|kanji|grammar|particle|sentence|question):\S+$/u.test(key) && key.length <= 210) &&
    Number.isSafeInteger(value.remaining) && value.remaining >= 0 && value.remaining <= 1000 &&
    typeof value.intentsSha256 === 'string' && /^[0-9a-f]{64}$/u.test(value.intentsSha256) &&
    Array.isArray(value.operations) && value.operations.length === value.keys.length, 'unsupported-command-receipt');
  noteRefs(value.operations);
}
function sourceReferenceEvidence(value) {
  keys(value, ['captureId', 'intentSha256', 'operation'], [], 'unsupported-command-receipt');
  insist(typeof value.captureId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.captureId) &&
    typeof value.intentSha256 === 'string' && /^[0-9a-f]{64}$/u.test(value.intentSha256), 'unsupported-command-receipt');
  noteRef(value.operation);
}
function practiceCurrent(state, proof) {
  const library = state.record.assessmentLibrary;
  const attempt = library?.attempts?.find((entry) => entry.attemptId === proof.attemptId);
  const entity = state.snapshot.replica.projection.entities.find((entry) =>
    entry.target.kind === 'exam-attempt' && entry.target.id === proof.attemptId);
  return !!(attempt && same(library.scope, scopeOf(state.snapshot.policy.binding)) &&
    attempt.revisionId === proof.attemptRevisionId && attempt.status !== 'in-progress' &&
    entity?.heads.some((reference) => same(reference, proof.operation)) && !entity.requiresChoice && !entity.identityConflicts.length);
}
function capture(writer, binding) {
  const captured = copy(writer.capture());
  keys(captured, ['ownerId', 'epoch', 'sessionId'], [], 'writer-required');
  insist(id(captured.ownerId) && Number.isSafeInteger(captured.epoch) && captured.epoch >= 0 && id(captured.sessionId), 'writer-required');
  insist(captured.sessionId === binding.sessionId, 'session-changed');
  insist(writer.assert(captured) === true, 'writer-required');
  return captured;
}

class RecordHost {
  #controller; #writer; #binding; #validateRecord; #validateArchive; #reducers;
  #assessmentSubjectResolver;
  #assessmentFormResolver;
  #assessmentPresentationResolver;
  #tail = Promise.resolve(); #closed = false; #published = Object.freeze({ status: 'uninitialized' }); #publishedWriter = null;
  constructor(options) {
    this.#controller = options.controller; this.#writer = options.writer; this.#binding = copy(options.binding);
    this.#validateRecord = options.validateRecord; this.#validateArchive = options.validateArchive;
    this.#reducers = options.reducers;
    this.#assessmentSubjectResolver = options.assessmentSubjectResolver;
    this.#assessmentFormResolver = options.assessmentFormResolver;
    this.#assessmentPresentationResolver = options.assessmentPresentationResolver;
  }
  #guard(captured) {
    insist(!this.#closed, 'closed');
    insist(captured.sessionId === this.#binding.sessionId && this.#writer.assert(captured) === true, 'writer-required');
  }
  #queue(action) {
    let captured;
    try { insist(!this.#closed, 'closed'); captured = capture(this.#writer, this.#binding); }
    catch (error) { return Promise.reject(error); }
    const run = this.#tail.then(() => { this.#guard(captured); return action(captured); });
    this.#tail = run.catch(() => undefined);
    return run;
  }
  #validate(record, archive) {
    insist(plain(record) && [1, 2].includes(record.v) && !own(record, 'ai') &&
      (record.v === 2 || (record.assessmentLibraryV2 == null && record.assessmentLearning == null && record.assessmentReceived == null && record.assessmentQuestionPractice == null)) &&
      (record.aiChat === undefined || Array.isArray(record.aiChat)) &&
      (record.aiReadings === undefined || Array.isArray(record.aiReadings)) &&
      (record.aiReading == null || plain(record.aiReading)) &&
      (record.aiEvidenceIncomplete === undefined || typeof record.aiEvidenceIncomplete === 'boolean') &&
      this.#validateRecord(record) === true, 'invalid-record');
    keys(archive, ['version', 'turns'], [], 'invalid-archive');
    insist(archive.version === 1 && Array.isArray(archive.turns) && this.#validateArchive(archive.turns) === true, 'invalid-archive');
    const ids = new Set();
    for (const turn of archive.turns) {
      insist(plain(turn), 'invalid-archive');
      if (own(turn, 'id')) {
        insist((Number.isSafeInteger(turn.id) && turn.id > 0) || (typeof turn.id === 'string' && turn.id.length > 0), 'invalid-archive');
        const value = JSON.stringify(turn.id); insist(!ids.has(value), 'archive-id-conflict'); ids.add(value);
      }
    }
  }
  #checkedReceipt(value, rowId, revision) {
    keys(value, ['format', 'version', 'changeId', 'type', 'occurredAt', 'scope', 'commandSha256',
      'beforeRevision', 'committedRevision', 'recordSha256', 'archiveSha256'], value.type === PRACTICE_FINALIZE ? ['practice'] : value.type === ASSESSMENT_FINALIZE ? ['assessment'] : value.type === ASSESSMENT_SUPPRESS ? ['learningSuppression'] : value.type === ASSESSMENT_ENRICH ? ['learningEnrichment'] : value.type === ASSESSMENT_RECONCILE ? ['assessmentReconciliation'] : value.type === SOURCE_REFERENCE ? ['sourceReference'] : [], 'unsupported-command-receipt');
    insist(value.format === 'kairo-local-command-receipt' && value.version === 1 && id(rowId) && value.changeId === rowId &&
      id(value.type) && same(value.scope, scopeOf(this.#binding)) && Number.isSafeInteger(value.beforeRevision) && value.beforeRevision >= 0 &&
      value.committedRevision === value.beforeRevision + 1 && value.committedRevision <= revision &&
      ['commandSha256', 'recordSha256', 'archiveSha256'].every((key) => typeof value[key] === 'string' && /^[0-9a-f]{64}$/u.test(value[key])),
    'unsupported-command-receipt');
    instant(value.occurredAt);
    if (value.type === PRACTICE_FINALIZE) { practiceEvidence(value.practice); insist(new globalThis.TextEncoder().encode(encodeLocalJson(value).text).byteLength <= 4096, 'unsupported-command-receipt'); }
    if (value.type === ASSESSMENT_FINALIZE) { assessmentEvidence(value.assessment); insist(new globalThis.TextEncoder().encode(encodeLocalJson(value).text).byteLength <= 8192, 'unsupported-command-receipt'); }
    if (value.type === ASSESSMENT_SUPPRESS) { suppressionEvidence(value.learningSuppression); insist(new globalThis.TextEncoder().encode(encodeLocalJson(value).text).byteLength <= 65_536, 'unsupported-command-receipt'); }
    if (value.type === ASSESSMENT_ENRICH) {
      keys(value.learningEnrichment, ['followupIds', 'remaining', 'intentsSha256', 'operations'], [], 'unsupported-command-receipt');
      const proof = value.learningEnrichment;
      insist(Array.isArray(proof.followupIds) && proof.followupIds.length > 0 && proof.followupIds.length <= 20 &&
        proof.followupIds.every(id) && new Set(proof.followupIds).size === proof.followupIds.length &&
        Number.isSafeInteger(proof.remaining) && proof.remaining >= 0 && proof.remaining <= 1000 &&
        /^[a-f0-9]{64}$/u.test(proof.intentsSha256) && Array.isArray(proof.operations) && proof.operations.length === proof.followupIds.length,
      'unsupported-command-receipt');
      noteRefs(proof.operations);
    }
    if (value.type === ASSESSMENT_RECONCILE) {
      keys(value.assessmentReconciliation, ['sourceDigest', 'projectionDigest'], [], 'unsupported-command-receipt');
      insist(Object.values(value.assessmentReconciliation).every((part) => typeof part === 'string' && /^[a-f0-9]{64}$/u.test(part)), 'unsupported-command-receipt');
    }
    if (value.type === SOURCE_REFERENCE) sourceReferenceEvidence(value.sourceReference);
    return value;
  }
  async #read(captured) {
    this.#guard(captured);
    const result = await this.#controller.snapshot(); this.#guard(captured);
    if (result.status !== 'active') return { outcome: result };
    const snapshot = result.snapshot;
    insist(same(snapshot.policy.binding, this.#binding), 'scope-mismatch');
    const select = (collection) => snapshot.documents.find((row) => row.collection === collection && row.id === CURRENT)?.value;
    const record = select(RECORD); const archive = select(ARCHIVE);
    this.#validate(record, archive);
    const receipts = new Map();
    for (const row of snapshot.documents) if (row.collection === COMMANDS)
      receipts.set(row.id, this.#checkedReceipt(row.value, row.id, snapshot.revision));
    // The controller retains the genuine planner handle from this one native
    // snapshot. Derive before the public JSON copy removes handle provenance.
    const noteViews = readNoteViews(snapshot.replica);
    const readingViews = readReadingViews(snapshot.replica);
    const sourceReferenceViews = readSourceReferenceViews(snapshot.replica);
    const examAttemptViews = readExamAttemptViews(snapshot.replica);
    let assessmentViews;
    if (record.assessmentReceived != null || snapshot.replica.operations.some((operation) => operation.v === 2)) {
      const { assessmentReceivedViews, assessmentReconciliationSummary, parseAssessmentReceived } = await import('./assessment-received.mjs');
      this.#guard(captured);
      if (record.assessmentReceived != null) parseAssessmentReceived(record.assessmentReceived, scopeOf(this.#binding));
      const views = assessmentReceivedViews(snapshot);
      assessmentViews = { assessmentResultViewsV2: views.results, assessmentLearningViewsV2: views.learning,
        assessmentReconciliation: assessmentReconciliationSummary(record, views) };
    }
    return { snapshot, record, archive, receipts, noteViews, readingViews, sourceReferenceViews, examAttemptViews, assessmentViews, outcome: result };
  }
  #view(state) {
    return copy({ identity: scopeOf(this.#binding), revision: state.snapshot.revision, record: state.record,
      archive: state.archive, noteViews: state.noteViews, readingViews: state.readingViews, sourceReferenceViews: state.sourceReferenceViews, examAttemptViews: state.examAttemptViews, ...(state.assessmentViews || {}), runtimeLabel: state.snapshot.runtimeLabel });
  }
  #publish(captured, state) {
    this.#guard(captured);
    this.#published = copy({ status: 'active', snapshot: this.#view(state) }); this.#publishedWriter = captured;
    return this.#published;
  }
  #block(outcome) {
    const lastCommitted = this.#published.snapshot || this.#published.lastCommitted;
    this.#published = copy({ ...outcome, ...(lastCommitted ? { lastCommitted } : {}) });
    return this.#published;
  }
  #failure(error, extra = {}) {
    return this.#block({ status: 'recovery-required', reason: error.code || 'storage-or-source-failure', ...extra });
  }
  #ack(row, outcome, state, operations) {
    return copy({ status: 'active', snapshot: this.#view(state), receipt: { changeId: row.changeId, type: row.type, outcome,
      committedRevision: row.committedRevision, recordSha256: row.recordSha256, archiveSha256: row.archiveSha256,
      ...(operations ? { operations } : {}) },
    // A duplicate confirms durable history. It must not replay an old animation,
    // cleared draft, navigation or other one-time effect from a previous host.
    replayUiEffects: outcome !== 'duplicate' });
  }
  #confirmedNoteOperations(value, intents, receipt, state) {
    insist(Array.isArray(receipt.operations) && receipt.operations.length === intents.length, 'note-operation-unconfirmed');
    for (let index = 0; index < intents.length; index++) {
      const intent = intents[index]; const reference = receipt.operations[index];
      const operation = state.snapshot.replica.operations.find((row) => row.opId === reference.opId);
      insist(operation && same(operationReference(operation), reference) && same(operation.payload, intent.payload) &&
        same(operation.dependencies, intent.dependencies) && operation.occurredAt === value.occurredAt &&
        same(operation.scope, scopeOf(this.#binding)) && operation.actor.deviceId === state.snapshot.actor.deviceId &&
        operation.actor.incarnationId === state.snapshot.actor.incarnationId &&
        state.snapshot.replica.ready.some((row) => same(row, reference)), 'note-operation-unconfirmed');
      if (index > 0) insist(same(operation.predecessor, receipt.operations[index - 1]), 'note-operation-unconfirmed');
    }
    return receipt.operations;
  }
  #backup(record, archive, journal) {
    const body = copy(portable(record));
    this.#validate(body, archive);
    return copy({ format: 'kairo-backup', version: journal ? 2 : 1, completeness: body.aiEvidenceIncomplete ? 'incomplete' : 'complete',
      record: body, archive, ...(journal ? { journal } : {}), counts: counts(body, archive.turns, journal),
      sha256: { record: digest(body), archive: digest(archive), ...(journal ? { journal: digest(journal) } : {}) } });
  }
  #restore(raw, state, version) {
    const backup = copy(raw);
    keys(backup, ['format', 'version', 'completeness', 'record', 'archive', 'counts', 'sha256', ...(version === 2 ? ['journal'] : [])], [], 'invalid-backup');
    insist(backup.format === 'kairo-backup' && backup.version === version && plain(backup.record) &&
      [...NONPORTABLE].every((key) => !own(backup.record, key)), 'nonportable-or-unsupported-backup');
    // A backup may contribute history to an already-authorized learner. It
    // cannot replace the current account, session, epochs or actor allocation.
    const journal = version === 2 ? parseOperationJournalBackup(backup.journal, state.snapshot.policy) : undefined;
    if (journal) {
      const current = new Map(state.snapshot.replica.operations.map((operation) => [operation.opId, operation]));
      for (const operation of journal.operations) {
        if (operation.payload.kind !== 'note.version' ||
          !operation.payload.segments.some((segment) => segment.kind === 'source-quote')) continue;
        // Declared publisher permission in a portable file is not admission.
        // Retain exact existing history, but refuse a whole import that would
        // newly queue source text until this host has a trusted source policy.
        const existing = current.get(operation.opId);
        insist(existing && same(existing, operation), 'source-quote-admission-required');
      }
    }
    this.#validate(backup.record, backup.archive);
    insist(same(backup, this.#backup(backup.record, backup.archive, journal)), 'inconsistent-backup');
    return { record: backup.record, archive: backup.archive, ...(journal ? { journal } : {}) };
  }
  #reduce(value, state) {
    if (value.type === 'host.restore/1' || value.type === 'host.restore/2')
      return this.#restore(value.input, state, value.type === 'host.restore/2' ? 2 : 1);
    let result;
    if (value.type === 'host.observations/1') {
      insist(Array.isArray(value.input) && (state.record.obslog === undefined || Array.isArray(state.record.obslog)), 'invalid-command');
      result = { patch: { obslog: [...(state.record.obslog || []), ...value.input] } };
    } else if (value.type === 'host.archive/1') result = { patch: {}, appendArchive: value.input };
    else {
      const reduce = this.#reducers[value.type]; insist(typeof reduce === 'function', 'unknown-command');
      result = copy(reduce(copy({ record: state.record, archive: state.archive, revision: state.snapshot.revision }), value.input));
    }
    keys(result, ['patch'], ['appendArchive']);
    insist(plain(result.patch) && Object.keys(result.patch).every((key) => !NONPORTABLE.has(key)), 'invalid-record-patch');
    const appended = result.appendArchive === undefined ? [] : result.appendArchive;
    insist(Array.isArray(appended), 'invalid-archive');
    const turns = appended.map((turn, index) => {
      insist(plain(turn), 'invalid-archive');
      return own(turn, 'id') ? turn : { ...turn, id: `host-turn:${digest([scopeOf(this.#binding), value.changeId, index])}` };
    });
    const next = copy({ record: merged(state.record, result.patch), archive: { version: 1, turns: [...state.archive.turns, ...turns] } });
    this.#validate(next.record, next.archive);
    return next;
  }
  #confirmPractice(value, row, state) {
    const proof = row.practice;
    const operation = state.snapshot.replica.operations.find((entry) => entry.opId === proof.operation.opId);
    insist(operation && same(operationReference(operation), proof.operation) &&
      digest({ payload: operation.payload, dependencies: operation.dependencies }) === proof.intentSha256 &&
      operation.payload.kind === 'exam.attempt' && operation.payload.attemptId === proof.attemptId &&
      operation.payload.attemptId === value.input.attemptId && same(operation.payload.form, value.input.form) &&
      operation.payload.outcome === value.input.outcome && operation.payload.endedAt === value.occurredAt &&
      operation.occurredAt === value.occurredAt && same(operation.scope, scopeOf(this.#binding)) &&
      state.snapshot.replica.ready.some((reference) => same(reference, proof.operation)), 'practice-operation-unconfirmed');
    return [proof.operation];
  }
  async #finalizePractice(captured, value, state, fingerprint, prior) {
    const input = practiceInput(value.input);
    insist(same(input.scope, scopeOf(this.#binding)), 'scope-mismatch');
    if (prior) {
      const operations = this.#confirmPractice(value, prior, state);
      // This receipt and exact journal operation prove historical completion.
      // They do not authorize replacing later roots or reviving a tombstone.
      this.#publish(captured, state);
      return copy({ ...this.#ack(prior, 'duplicate', state, operations),
        practice: { ...prior.practice, current: practiceCurrent(state, prior.practice) } });
    }
    insist(state.snapshot.revision === input.expectedRevision, 'practice-store-superseded');
    insist(!state.snapshot.replica.operations.some((operation) => operation.payload.kind === 'exam.attempt' &&
      operation.payload.attemptId === input.attemptId), 'practice-already-emitted');
    insist(!state.snapshot.replica.projection.entities.some((entry) => entry.target.kind === 'exam-attempt' &&
      entry.target.id === input.attemptId && entry.tombstones.length > 0), 'practice-already-deleted');
    const options = { ...input }; delete options.expectedRevision;
    const { finalizePractice: proposePractice } = await import('./assessment-controller.mjs');
    this.#guard(captured);
    const proposed = proposePractice(state.record.assessmentLibrary, { ...options,
      commandId: value.changeId, now: value.occurredAt });
    const next = copy({ record: merged(state.record, { assessmentLibrary: proposed.library }), archive: state.archive });
    this.#validate(next.record, next.archive);
    const { actor, policy } = state.snapshot;
    insist(Number.isSafeInteger(actor.sequence + 1) && Number.isSafeInteger(state.snapshot.revision + 1), 'revision-exhausted');
    // Pure expected bytes, not actor allocation. commitLocal independently
    // allocates under its whole-profile CAS and must return this exact ref.
    const expected = createSyncOperation({ format: 'kairo-sync-operation', v: 1, scope: scopeOf(this.#binding),
      actor: { deviceId: actor.deviceId, incarnationId: actor.incarnationId, sequence: actor.sequence + 1 },
      predecessor: actor.predecessor, dependencies: proposed.intent.dependencies, schemaEpoch: policy.schemaEpoch,
      deletionEpoch: policy.deletionEpoch, mergePolicy: policy.mergePolicy, occurredAt: value.occurredAt, payload: proposed.intent.payload });
    const row = { format: 'kairo-local-command-receipt', version: 1, changeId: value.changeId, type: value.type,
      occurredAt: value.occurredAt, scope: scopeOf(this.#binding), commandSha256: fingerprint,
      beforeRevision: state.snapshot.revision, committedRevision: state.snapshot.revision + 1,
      recordSha256: digest(next.record), archiveSha256: digest(next.archive),
      practice: { attemptId: input.attemptId, attemptRevisionId: proposed.attemptRevisionId,
        intentSha256: digest(proposed.intent), operation: operationReference(expected) } };
    insist(new globalThis.TextEncoder().encode(encodeLocalJson(row).text).byteLength <= 4096, 'practice-receipt-capacity');
    const request = copy({ changeId: `host-command:${digest([scopeOf(this.#binding), value.changeId])}`,
      binding: this.#binding, expectedRevision: row.beforeRevision, occurredAt: value.occurredAt,
      mutations: [{ kind: 'put', collection: RECORD, id: CURRENT, value: next.record },
        { kind: 'put', collection: ARCHIVE, id: CURRENT, value: next.archive },
        { kind: 'put', collection: COMMANDS, id: value.changeId, value: row }], operations: [proposed.intent] });
    let receipt;
    try {
      this.#guard(captured);
      const outcome = await this.#controller.commitLocal(request);
      receipt = outcome.receipt || outcome.targetReceipt;
      this.#guard(captured);
      if (outcome.status !== 'active') return this.#block({ ...outcome, changeId: value.changeId });
      insist(receipt && receipt.committedRevision === row.committedRevision &&
        same(receipt.operations, [row.practice.operation]), 'practice-receipt-mismatch');
      const current = await this.#read(captured);
      if (current.outcome.status !== 'active') return this.#block({ ...current.outcome, changeId: value.changeId,
        targetCommitDurable: true, targetReceipt: receipt });
      insist(same(current.receipts.get(value.changeId), row) && digest(current.record) === row.recordSha256 &&
        digest(current.archive) === row.archiveSha256, 'practice-receipt-mismatch');
      const operations = this.#confirmPractice(value, row, current);
      insist(practiceCurrent(current, row.practice), 'practice-result-superseded');
      this.#publish(captured, current);
      return copy({ ...this.#ack(row, receipt.outcome === 'duplicate' ? 'duplicate' : 'committed', current, operations),
        practice: { ...row.practice, current: true } });
    } catch (error) {
      return this.#failure(error, { changeId: value.changeId,
        ...(receipt ? { targetCommitDurable: true, targetReceipt: receipt } : {}) });
    }
  }
  async #finalizeAssessment(captured, value, state, prior) {
    const { parseAssessmentFinalizeInput, prepareAssessmentFinalization, confirmAssessmentProof, assessmentProofCurrent } = await import('./assessment-finalization.mjs');
    this.#guard(captured);
    const input = parseAssessmentFinalizeInput(value.input);
    insist(same(input.scope, scopeOf(this.#binding)), 'scope-mismatch');
    const meta = { changeId: value.changeId, occurredAt: value.occurredAt };
    if (prior) {
      const proof = confirmAssessmentProof({ binding: this.#binding, snapshot: state.snapshot, meta, input, row: prior });
      this.#publish(captured, state);
      return copy({ ...this.#ack(prior, 'duplicate', state, proof.operations),
        assessment: { ...proof, current: assessmentProofCurrent(state.snapshot, proof) } });
    }
    const request = prepareAssessmentFinalization({ binding: this.#binding, snapshot: state.snapshot,
      meta, input, resolveSubject: this.#assessmentSubjectResolver, resolvePresentation: this.#assessmentPresentationResolver });
    const row = request.mutations[2].value;
    this.#validate(request.mutations[0].value, request.mutations[1].value);
    let receipt;
    try {
      this.#guard(captured);
      const outcome = await this.#controller.commitLocal(request);
      receipt = outcome.receipt || outcome.targetReceipt;
      this.#guard(captured);
      if (outcome.status !== 'active') return this.#block({ ...outcome, changeId: value.changeId });
      insist(receipt && receipt.committedRevision === row.committedRevision &&
        same(receipt.operations, row.assessment.operations), 'assessment-receipt-mismatch');
      const current = await this.#read(captured);
      if (current.outcome.status !== 'active') return this.#block({ ...current.outcome,
        changeId: value.changeId, targetCommitDurable: true, targetReceipt: receipt });
      insist(same(current.receipts.get(value.changeId), row) && digest(current.record) === row.recordSha256 &&
        digest(current.archive) === row.archiveSha256, 'assessment-result-superseded');
      const proof = confirmAssessmentProof({ binding: this.#binding, snapshot: current.snapshot, meta, input, row });
      insist(assessmentProofCurrent(current.snapshot, proof), 'assessment-result-superseded');
      this.#publish(captured, current);
      return copy({ ...this.#ack(row, receipt.outcome === 'duplicate' ? 'duplicate' : 'committed', current, proof.operations),
        assessment: { ...proof, current: true } });
    } catch (error) {
      return this.#failure(error, { changeId: value.changeId,
        ...(receipt ? { targetCommitDurable: true, targetReceipt: receipt } : {}) });
    }
  }
  async #suppressAssessment(captured, value, state, prior) {
    const { parseAssessmentSuppressionInput, prepareAssessmentSuppression, confirmAssessmentSuppression } = await import('./assessment-finalization.mjs');
    this.#guard(captured);
    const input = parseAssessmentSuppressionInput(value.input);
    insist(same(input.scope, scopeOf(this.#binding)), 'scope-mismatch');
    const meta = { changeId: value.changeId, occurredAt: value.occurredAt };
    if (prior) {
      const proof = confirmAssessmentSuppression({ binding: this.#binding, snapshot: state.snapshot, meta, input, row: prior });
      this.#publish(captured, state);
      return copy({ ...this.#ack(prior, 'duplicate', state, proof.operations), learningSuppression: proof });
    }
    const request = prepareAssessmentSuppression({ binding: this.#binding, snapshot: state.snapshot, meta, input });
    const row = request.mutations[2].value;
    this.#validate(request.mutations[0].value, request.mutations[1].value);
    let receipt;
    try {
      this.#guard(captured);
      const outcome = await this.#controller.commitLocal(request);
      receipt = outcome.receipt || outcome.targetReceipt;
      this.#guard(captured);
      if (outcome.status !== 'active') return this.#block({ ...outcome, changeId: value.changeId });
      insist(receipt && receipt.committedRevision === row.committedRevision &&
        same(receipt.operations, row.learningSuppression.operations), 'assessment-receipt-mismatch');
      const current = await this.#read(captured);
      if (current.outcome.status !== 'active') return this.#block({ ...current.outcome,
        changeId: value.changeId, targetCommitDurable: true, targetReceipt: receipt });
      insist(same(current.receipts.get(value.changeId), row) && digest(current.record) === row.recordSha256 &&
        digest(current.archive) === row.archiveSha256, 'assessment-result-superseded');
      const proof = confirmAssessmentSuppression({ binding: this.#binding, snapshot: current.snapshot, meta, input, row });
      this.#publish(captured, current);
      return copy({ ...this.#ack(row, receipt.outcome === 'duplicate' ? 'duplicate' : 'committed', current, proof.operations), learningSuppression: proof });
    } catch (error) {
      return this.#failure(error, { changeId: value.changeId,
        ...(receipt ? { targetCommitDurable: true, targetReceipt: receipt } : {}) });
    }
  }
  async #enrichAssessment(captured, value, state, prior) {
    const { parseAssessmentEnrichmentInput, prepareAssessmentEnrichment, confirmAssessmentEnrichment } = await import('./assessment-enrichment.mjs');
    this.#guard(captured);
    const input = parseAssessmentEnrichmentInput(value.input);
    insist(same(input.scope, scopeOf(this.#binding)), 'scope-mismatch');
    const meta = { changeId: value.changeId, occurredAt: value.occurredAt };
    if (prior) {
      const proof = confirmAssessmentEnrichment({ binding: this.#binding, snapshot: state.snapshot, meta, input, row: prior });
      this.#publish(captured, state);
      return copy({ ...this.#ack(prior, 'duplicate', state, proof.operations), learningEnrichment: proof });
    }
    const request = prepareAssessmentEnrichment({ binding: this.#binding, snapshot: state.snapshot, meta, input, resolveSubject: this.#assessmentSubjectResolver, resolvePresentation: this.#assessmentPresentationResolver });
    if (!request) {
      this.#publish(captured, state);
      return copy({ status: 'active', snapshot: this.#view(state), replayUiEffects: false, learningEnrichment: null });
    }
    const row = request.mutations[2].value;
    this.#validate(request.mutations[0].value, request.mutations[1].value);
    let receipt;
    try {
      this.#guard(captured);
      const outcome = await this.#controller.commitLocal(request);
      receipt = outcome.receipt || outcome.targetReceipt;
      this.#guard(captured);
      if (outcome.status !== 'active') return this.#block({ ...outcome, changeId: value.changeId });
      insist(receipt && receipt.committedRevision === row.committedRevision &&
        same(receipt.operations, row.learningEnrichment.operations), 'assessment-receipt-mismatch');
      const current = await this.#read(captured);
      if (current.outcome.status !== 'active') return this.#block({ ...current.outcome,
        changeId: value.changeId, targetCommitDurable: true, targetReceipt: receipt });
      insist(same(current.receipts.get(value.changeId), row) && digest(current.record) === row.recordSha256 &&
        digest(current.archive) === row.archiveSha256, 'assessment-result-superseded');
      const proof = confirmAssessmentEnrichment({ binding: this.#binding, snapshot: current.snapshot, meta, input, row });
      this.#publish(captured, current);
      return copy({ ...this.#ack(row, receipt.outcome === 'duplicate' ? 'duplicate' : 'committed', current, proof.operations), learningEnrichment: proof });
    } catch (error) {
      return this.#failure(error, { changeId: value.changeId,
        ...(receipt ? { targetCommitDurable: true, targetReceipt: receipt } : {}) });
    }
  }
  async #reconcileAssessments(captured, value, state, prior) {
    keys(value.input, []);
    if (prior) {
      this.#publish(captured, state);
      return copy({ ...this.#ack(prior, 'duplicate', state), assessmentReconciliation: state.assessmentViews?.assessmentReconciliation || null });
    }
    const { prepareAssessmentReconciliation } = await import('./assessment-received.mjs');
    this.#guard(captured);
    const request = prepareAssessmentReconciliation({ binding: this.#binding, snapshot: state.snapshot,
      meta: { changeId: value.changeId, occurredAt: value.occurredAt },
      resolveForm: this.#assessmentFormResolver, resolveSubject: this.#assessmentSubjectResolver, resolvePresentation: this.#assessmentPresentationResolver });
    if (!request) {
      this.#publish(captured, state);
      return copy({ status: 'active', snapshot: this.#view(state), replayUiEffects: false,
        assessmentReconciliation: state.assessmentViews?.assessmentReconciliation || null });
    }
    const row = request.mutations[2].value;
    this.#validate(request.mutations[0].value, request.mutations[1].value);
    let receipt;
    try {
      this.#guard(captured);
      const outcome = await this.#controller.commitLocal(request);
      receipt = outcome.receipt || outcome.targetReceipt;
      this.#guard(captured);
      if (outcome.status !== 'active') return this.#block({ ...outcome, changeId: value.changeId });
      insist(receipt && receipt.committedRevision === row.committedRevision && !receipt.operations.length, 'assessment-receipt-mismatch');
      const current = await this.#read(captured);
      if (current.outcome.status !== 'active') return this.#block({ ...current.outcome,
        changeId: value.changeId, targetCommitDurable: true, targetReceipt: receipt });
      insist(same(current.receipts.get(value.changeId), row) && digest(current.record) === row.recordSha256 &&
        digest(current.archive) === row.archiveSha256, 'assessment-result-superseded');
      this.#publish(captured, current);
      return copy({ ...this.#ack(row, receipt.outcome === 'duplicate' ? 'duplicate' : 'committed', current),
        assessmentReconciliation: current.assessmentViews?.assessmentReconciliation || null });
    } catch (error) {
      return this.#failure(error, { changeId: value.changeId,
        ...(receipt ? { targetCommitDurable: true, targetReceipt: receipt } : {}) });
    }
  }
  #confirmSourceReference(value, row, state) {
    const proof = row.sourceReference, intent = sourceReferenceIntent(value.input);
    const operation = state.snapshot.replica.operations.find((entry) => entry.opId === proof.operation.opId);
    insist(proof.captureId === value.input.captureId && proof.intentSha256 === digest(intent) && operation &&
      same(operationReference(operation), proof.operation) && same(operation.payload, intent.payload) &&
      same(operation.dependencies, intent.dependencies) && operation.occurredAt === value.occurredAt &&
      same(operation.scope, scopeOf(this.#binding)) && state.snapshot.replica.ready.some((ref) => same(ref, proof.operation)),
    'source-reference-operation-unconfirmed');
    return [proof.operation];
  }
  async #captureSourceReference(captured, value, state, fingerprint, prior) {
    if (prior) {
      const operations = this.#confirmSourceReference(value, prior, state);
      this.#publish(captured, state);
      return this.#ack(prior, 'duplicate', state, operations);
    }
    const proposed = prepareSourceReferenceCapture(state.record.sourceInbox, state.sourceReferenceViews, value.input);
    const next = { record: copy(merged(state.record, { sourceInbox: proposed.inbox })), archive: state.archive };
    this.#validate(next.record, next.archive);
    const { actor, policy } = state.snapshot;
    insist(Number.isSafeInteger(actor.sequence + 1) && Number.isSafeInteger(state.snapshot.revision + 1), 'revision-exhausted');
    const expected = createSyncOperation({ format: 'kairo-sync-operation', v: 1, scope: scopeOf(this.#binding),
      actor: { deviceId: actor.deviceId, incarnationId: actor.incarnationId, sequence: actor.sequence + 1 },
      predecessor: actor.predecessor, dependencies: proposed.intent.dependencies, schemaEpoch: policy.schemaEpoch,
      deletionEpoch: policy.deletionEpoch, mergePolicy: policy.mergePolicy, occurredAt: value.occurredAt, payload: proposed.intent.payload });
    const row = { format: 'kairo-local-command-receipt', version: 1, changeId: value.changeId, type: value.type,
      occurredAt: value.occurredAt, scope: scopeOf(this.#binding), commandSha256: fingerprint,
      beforeRevision: state.snapshot.revision, committedRevision: state.snapshot.revision + 1,
      recordSha256: digest(next.record), archiveSha256: digest(next.archive),
      sourceReference: { captureId: value.input.captureId, intentSha256: digest(proposed.intent), operation: operationReference(expected) } };
    const request = copy({ changeId: `host-command:${digest([scopeOf(this.#binding), value.changeId])}`,
      binding: this.#binding, expectedRevision: row.beforeRevision, occurredAt: value.occurredAt,
      mutations: [{ kind: 'put', collection: RECORD, id: CURRENT, value: next.record },
        { kind: 'put', collection: ARCHIVE, id: CURRENT, value: next.archive },
        { kind: 'put', collection: COMMANDS, id: value.changeId, value: row }], operations: [proposed.intent] });
    let receipt;
    try {
      this.#guard(captured);
      const outcome = await this.#controller.commitLocal(request);
      receipt = outcome.receipt || outcome.targetReceipt;
      this.#guard(captured);
      if (outcome.status !== 'active') return this.#block({ ...outcome, changeId: value.changeId });
      insist(receipt && receipt.committedRevision === row.committedRevision &&
        same(receipt.operations, [row.sourceReference.operation]), 'source-reference-receipt-mismatch');
      const current = await this.#read(captured);
      if (current.outcome.status !== 'active') return this.#block({ ...current.outcome, changeId: value.changeId,
        targetCommitDurable: true, targetReceipt: receipt });
      insist(same(current.receipts.get(value.changeId), row) && digest(current.record) === row.recordSha256 &&
        digest(current.archive) === row.archiveSha256, 'source-reference-receipt-mismatch');
      const operations = this.#confirmSourceReference(value, row, current);
      const view = current.sourceReferenceViews.find((entry) => entry.captureId === value.input.captureId);
      insist(view && !view.projection.requiresChoice && view.headReferences.length === 1 &&
        view.headReferences[0].operationRefs.some((ref) => same(ref, row.sourceReference.operation)), 'source-reference-superseded');
      this.#publish(captured, current);
      return this.#ack(row, receipt.outcome === 'duplicate' ? 'duplicate' : 'committed', current, operations);
    } catch (error) {
      return this.#failure(error, { changeId: value.changeId,
        ...(receipt ? { targetCommitDurable: true, targetReceipt: receipt } : {}) });
    }
  }
  async #dispatch(captured, value) {
    let state;
    try { state = await this.#read(captured); }
    catch (error) { return this.#failure(error, { changeId: value.changeId }); }
    if (state.outcome.status !== 'active') return this.#block(state.outcome);
    const fingerprint = digest({ scope: scopeOf(this.#binding), type: value.type, occurredAt: value.occurredAt, input: value.input });
    const prior = state.receipts.get(value.changeId);
    if (prior) insist(prior.commandSha256 === fingerprint && prior.type === value.type && prior.occurredAt === value.occurredAt, 'command-id-conflict');
    if (value.type === PRACTICE_FINALIZE) return this.#finalizePractice(captured, value, state, fingerprint, prior);
    if (value.type === ASSESSMENT_FINALIZE) return this.#finalizeAssessment(captured, value, state, prior);
    if (value.type === ASSESSMENT_SUPPRESS) return this.#suppressAssessment(captured, value, state, prior);
    if (value.type === ASSESSMENT_RECONCILE) return this.#reconcileAssessments(captured, value, state, prior);
    if (value.type === ASSESSMENT_ENRICH) return this.#enrichAssessment(captured, value, state, prior);
    if (value.type === SOURCE_REFERENCE) return this.#captureSourceReference(captured, value, state, fingerprint, prior);
    const noteIntents = value.type === READING_RESUME ? [readingResumeIntent(state.snapshot, value.input, !!prior)] :
      value.type === NOTE_RESTORE_ORIGINAL ? restoreOriginalIntents(this.#binding, value, state, !!prior) :
      NOTE_COMMANDS.has(value.type) ? [lifecycleIntent(this.#binding, value, state, !!prior)] : null;
    if (prior) {
      if (!noteIntents) {
        this.#publish(captured, state);
        return this.#ack(prior, 'duplicate', state);
      }
    }
    // Pure reducer failures happen before any commit; do not turn invalid input
    // into a queued partial write or silently truncate a capacity overflow.
    const next = prior ? null : noteIntents ? { record: state.record, archive: state.archive } : this.#reduce(value, state);
    if (!prior) insist(Number.isSafeInteger(state.snapshot.revision + 1), 'revision-exhausted');
    const row = prior || { format: 'kairo-local-command-receipt', version: 1, changeId: value.changeId, type: value.type,
      occurredAt: value.occurredAt, scope: scopeOf(this.#binding), commandSha256: fingerprint,
      beforeRevision: state.snapshot.revision, committedRevision: state.snapshot.revision + 1,
      recordSha256: digest(next.record), archiveSha256: digest(next.archive) };
    const request = copy({ changeId: `host-command:${digest([scopeOf(this.#binding), value.changeId])}`,
      binding: this.#binding, expectedRevision: row.beforeRevision, occurredAt: value.occurredAt,
      mutations: [...(noteIntents ? [] : [{ kind: 'put', collection: RECORD, id: CURRENT, value: next.record },
        { kind: 'put', collection: ARCHIVE, id: CURRENT, value: next.archive }]),
        { kind: 'put', collection: COMMANDS, id: value.changeId, value: row }], operations: noteIntents || [] });
    let receipt;
    try {
      this.#guard(captured);
      let outcome;
      if (next?.journal) {
        insist(typeof this.#controller.commitRestore === 'function', 'journal-restore-unavailable');
        outcome = await this.#controller.commitRestore({ restoreId: request.changeId,
          binding: request.binding, expectedRevision: request.expectedRevision,
          mutations: request.mutations, backup: next.journal });
      } else outcome = await this.#controller.commitLocal(request);
      receipt = outcome.receipt || outcome.targetReceipt;
      this.#guard(captured);
      if (outcome.status !== 'active') return this.#block({ ...outcome, changeId: value.changeId });
      insist(receipt && receipt.committedRevision === row.committedRevision, 'command-receipt-mismatch');
      // An explicit retry reconstructs the original receipt-only request. The
      // store's durable duplicate result supplies its original allocated ref;
      // absent history cannot pass the old expected revision or mint an event.
      if (prior) insist(receipt.outcome === 'duplicate', 'command-receipt-mismatch');
      const current = await this.#read(captured);
      if (current.outcome.status !== 'active') return this.#block({ ...current.outcome, changeId: value.changeId,
        targetCommitDurable: true, targetReceipt: receipt });
      insist(same(current.receipts.get(value.changeId), row), 'command-receipt-mismatch');
      const operations = noteIntents ? this.#confirmedNoteOperations(value, noteIntents, receipt, current) : undefined;
      this.#publish(captured, current);
      return this.#ack(row, receipt.outcome === 'duplicate' ? 'duplicate' : 'committed', current, operations);
    } catch (error) {
      return this.#failure(error, { changeId: value.changeId,
        ...(receipt ? { targetCommitDurable: true, targetReceipt: receipt } : {}) });
    }
  }

  /** Last confirmed authority only. During a write it does not expose proposed
   * roots. An invalidated writer sees an explicit protected previous snapshot. */
  current() {
    if (this.#publishedWriter) {
      try { this.#guard(this.#publishedWriter); }
      catch (error) { return copy({ status: 'recovery-required', reason: error.code,
        ...(this.#published.snapshot || this.#published.lastCommitted ? { lastCommitted: this.#published.snapshot || this.#published.lastCommitted } : {}) }); }
    }
    return this.#published;
  }
  resume() {
    return this.#queue(async (captured) => {
      try {
        const state = await this.#read(captured);
        return state.outcome.status === 'active' ? this.#publish(captured, state) : this.#block(state.outcome);
      } catch (error) { return this.#failure(error); }
    });
  }
  snapshot() { return this.resume(); }
  dispatch(raw) {
    let value;
    try { value = command(raw); } catch (error) { return Promise.reject(error); }
    return this.#queue((captured) => this.#dispatch(captured, value));
  }
  finalizePractice(raw, input) {
    try { return this.dispatch(baseCommand(raw, PRACTICE_FINALIZE, practiceInput(input))); }
    catch (error) { return Promise.reject(error); }
  }
  finalizeAssessment(raw, input) {
    try { return this.dispatch(baseCommand(raw, ASSESSMENT_FINALIZE, copy(input))); }
    catch (error) { return Promise.reject(error); }
  }
  suppressAssessmentLearning(raw, input) {
    try { return this.dispatch(baseCommand(raw, ASSESSMENT_SUPPRESS, copy(input))); }
    catch (error) { return Promise.reject(error); }
  }
  reconcileReceivedAssessments(raw) { return this.dispatch(baseCommand(raw, ASSESSMENT_RECONCILE, {})); }
  enrichAssessmentLearning(raw, input) {
    try { return this.dispatch(baseCommand(raw, ASSESSMENT_ENRICH, copy(input))); }
    catch (error) { return Promise.reject(error); }
  }
  appendObservations(raw, rows) { return this.dispatch(baseCommand(raw, 'host.observations/1', rows)); }
  appendArchive(raw, turns) { return this.dispatch(baseCommand(raw, 'host.archive/1', turns)); }
  createNote(raw, input) {
    try { return this.dispatch(baseCommand(raw, NOTE_CREATE, originalNoteInput(input))); }
    catch (error) { return Promise.reject(error); }
  }
  saveReadingPosition(raw, input) {
    try { return this.dispatch(baseCommand(raw, READING_RESUME, copy(input))); }
    catch (error) { return Promise.reject(error); }
  }
  captureSourceReference(raw, input) {
    try { return this.dispatch(baseCommand(raw, SOURCE_REFERENCE, parseSourceReferenceInput(input))); }
    catch (error) { return Promise.reject(error); }
  }
  #noteCommand(raw, type, input) {
    try { return this.dispatch(baseCommand(raw, type, lifecycleInput(type, input))); }
    catch (error) { return Promise.reject(error); }
  }
  editNote(raw, input) { return this.#noteCommand(raw, NOTE_EDIT, input); }
  deleteNote(raw, input) { return this.#noteCommand(raw, NOTE_DELETE, input); }
  restoreNote(raw, input) { return this.#noteCommand(raw, NOTE_RESTORE, input); }
  chooseNote(raw, input) { return this.#noteCommand(raw, NOTE_CHOOSE, input); }
  restoreOriginalNote(raw, input) { return this.#noteCommand(raw, NOTE_RESTORE_ORIGINAL, input); }
  previewNoteRestore(raw) {
    let input;
    try { input = copy(raw); keys(input, ['noteId'], [], 'invalid-note'); insist(id(input.noteId), 'invalid-note'); }
    catch (error) { return Promise.reject(error); }
    return this.#queue(async (captured) => {
      const state = await this.#read(captured);
      if (state.outcome.status !== 'active') return this.#block(state.outcome);
      const preview = restorationPreview(state, input.noteId);
      this.#publish(captured, state);
      return copy({ status: 'active', snapshot: this.#view(state), preview });
    });
  }
  restore(raw, backup) {
    const input = copy(backup);
    return this.dispatch(baseCommand(raw, input?.version === 2 ? 'host.restore/2' : 'host.restore/1', input));
  }
  exportBackup() {
    return this.#queue(async (captured) => {
      let state;
      try { state = await this.#read(captured); }
      catch (error) { return this.#failure(error); }
      if (state.outcome.status !== 'active') return this.#block(state.outcome);
      const journal = state.snapshot.replica.operations.length ? exportOperationJournal(state.snapshot.replica) : undefined;
      const backup = this.#backup(state.record, state.archive, journal);
      this.#guard(captured); this.#publish(captured, state);
      return copy({ status: 'active', revision: state.snapshot.revision, backup });
    });
  }
  /** The caller retains ownership/lifecycle of its controller and Web Lock. */
  async close() { this.#closed = true; await this.#tail; }
}

export async function createRecordHost(options) {
  insist(plain(options) && plain(options.writer) && typeof options.writer.capture === 'function' && typeof options.writer.assert === 'function' &&
    options.controller && typeof options.controller.snapshot === 'function' && typeof options.controller.commitLocal === 'function' &&
    typeof options.validateRecord === 'function' && typeof options.validateArchive === 'function' &&
    (options.assessmentSubjectResolver === undefined || typeof options.assessmentSubjectResolver === 'function') &&
    (options.assessmentFormResolver === undefined || typeof options.assessmentFormResolver === 'function') &&
    (options.assessmentPresentationResolver === undefined || typeof options.assessmentPresentationResolver === 'function'), 'invalid-options');
  const binding = copy(options.binding);
  keys(binding, ['accountId', 'learnerId', 'sessionId'], [], 'invalid-binding');
  insist(Object.values(binding).every(id), 'invalid-binding');
  const reducers = Object.create(null);
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(options.reducers || {}))) {
    insist(id(name) && /\/[1-9]\d*$/u.test(name) && !BUILTIN.has(name) && 'value' in descriptor &&
      descriptor.enumerable && typeof descriptor.value === 'function', 'invalid-reducer');
    reducers[name] = descriptor.value;
  }
  const host = new RecordHost({ ...options, binding, reducers: Object.freeze(reducers) });
  await host.resume();
  return host;
}
