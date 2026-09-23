/** App transactions over RecordHost. The caller owns its controller and writer.
 * Producers run once, synchronously, after earlier app work has finished. A
 * rejected producer has no effects here; a durable but uncertain commit is not
 * retried. Callers must inspect the complete acknowledgement before UI effects.
 */
import { createSyncOperation, encodeLocalJson, operationReference, readSourceReferenceViews } from './modules/record-core.mjs';
import { createRecordHost, readingResumeIntent } from './record-host.mjs';
import { parseSourceReferenceInput, prepareSourceReferenceCapture } from './source-inbox.mjs';

const PRACTICE_FINALIZE = 'host.practice-finalize/1';
const TYPE = 'app.patch/1';
const NOTE_CREATE = 'host.note-create/1';
const NOTE_EDIT = 'host.note-edit/1';
const NOTE_DELETE = 'host.note-delete/1';
const NOTE_RESTORE = 'host.note-restore/1';
const NOTE_CHOOSE = 'host.note-choose/1';
const NOTE_RESTORE_ORIGINAL = 'host.note-restore-original/1';
const READING_RESUME = 'host.reading-resume/1';
const SOURCE_REFERENCE = 'host.source-reference/1';
const MAX_PATCH_ROOTS = 256;
const MAX_ROOT_LENGTH = 256;
const NONPORTABLE = new Set(['ai', 'aiEvidence', 'recordGeneration']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = (value) => encodeLocalJson(value).value;
const digest = (value) => encodeLocalJson(value).sha256;
const same = (a, b) => encodeLocalJson(a).text === encodeLocalJson(b).text;

export class RecordAppError extends Error {
  constructor(code) {
    super(`Record app: ${code}`);
    this.name = 'RecordAppError';
    this.code = code;
  }
}
function insist(condition, code) {
  if (!condition) throw new RecordAppError(code);
}
function keys(value, required, optional = [], code = 'invalid-patch') {
  insist(
    plain(value) &&
      required.every((key) => own(value, key)) &&
      Object.keys(value).every((key) => required.includes(key) || optional.includes(key)),
    code,
  );
}
function patchRoots(patch) {
  insist(plain(patch), 'invalid-patch');
  const roots = Object.keys(patch).sort();
  insist(
    roots.length <= MAX_PATCH_ROOTS &&
      roots.every((root) => root.length <= MAX_ROOT_LENGTH && !NONPORTABLE.has(root)),
    'invalid-patch',
  );
  return roots;
}
function checkedProducerResult(raw) {
  // Async producers are unsupported. Observe a rejected native Promise so its
  // rejection cannot escape as an unrelated page error after this rejection.
  if (raw instanceof Promise) {
    void raw.catch(() => undefined);
    throw new RecordAppError('async-producer');
  }
  const result = copy(raw);
  keys(result, ['patch'], ['appendArchive']);
  patchRoots(result.patch);
  insist(!own(result, 'appendArchive') || Array.isArray(result.appendArchive), 'invalid-archive');
  return result;
}
function expectedRoots(record, roots) {
  return roots.map((root) => ({
    root,
    present: own(record, root),
    sha256: own(record, root) ? digest(record[root]) : null,
  }));
}
function reducePatch({ record }, input) {
  keys(input, ['patch', 'expected'], ['appendArchive']);
  const roots = patchRoots(input.patch);
  insist(
    Array.isArray(input.expected) && input.expected.length === roots.length,
    'invalid-preconditions',
  );
  for (let index = 0; index < roots.length; index++) {
    const expected = input.expected[index];
    keys(expected, ['root', 'present', 'sha256'], [], 'invalid-preconditions');
    insist(
      expected.root === roots[index] &&
        typeof expected.present === 'boolean' &&
        (expected.present
          ? typeof expected.sha256 === 'string' && /^[0-9a-f]{64}$/u.test(expected.sha256)
          : expected.sha256 === null),
      'invalid-preconditions',
    );
    insist(
      own(record, expected.root) === expected.present &&
        (!expected.present || digest(record[expected.root]) === expected.sha256),
      'stale-patch',
    );
  }
  return {
    patch: input.patch,
    ...(own(input, 'appendArchive') ? { appendArchive: input.appendArchive } : {}),
  };
}
function normalized(outcome) {
  if (outcome.status === 'active' || outcome.status === 'recovery-required') return copy(outcome);
  return copy({
    ...outcome,
    status: 'recovery-required',
    hostStatus: outcome.status,
    reason: outcome.reason || `host-${outcome.status}`,
  });
}
function originalRestorationIntents(binding, gate) {
  const before = gate.snapshot; const input = gate.input;
  keys(input, ['noteId', 'expected', 'history', 'selected', 'generation'], [], 'unexpected-sync-operations');
  const projection = before.replica.projection.entities.find((entity) => entity.target.kind === 'note' && entity.target.id === input.noteId);
  insist(projection && projection.heads.length === 0 && projection.tombstones.length > 0 && !projection.identityConflicts.length &&
    projection.activeRestoreGenerations.length <= 1 && same(input.expected, { heads: projection.heads,
      tombstones: projection.tombstones, activeRestoreGenerations: projection.activeRestoreGenerations }) &&
    same(input.generation, projection.activeRestoreGenerations[0] || null), 'unexpected-sync-operations');
  const ready = new Set(before.replica.ready.map((ref) => ref.opId));
  const history = before.replica.operations.filter((operation) => ready.has(operation.opId) &&
    operation.payload.kind === 'note.version' && operation.payload.noteId === input.noteId);
  insist(same(input.history, history.map(operationReference)), 'unexpected-sync-operations');
  const selected = history.find((operation) => same(operationReference(operation), input.selected));
  insist(selected && selected.payload.segments.every((segment) => segment.kind === 'original'), 'unexpected-sync-operations');
  const dependencies = [...new Map([...Object.values(input.expected).flat(), ...input.history].map((ref) => [ref.opId, ref])).values()]
    .sort((a, b) => a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0);
  insist(dependencies.length <= 128, 'unexpected-sync-operations');
  const restore = { payload: { kind: 'entity.restore', target: { kind: 'note', id: input.noteId },
    tombstones: input.expected.tombstones, reason: 'restore-selected-original' }, dependencies };
  let generation = input.generation;
  if (generation === null) {
    const { actor, policy } = before;
    insist(Number.isSafeInteger(actor.sequence + 2), 'unexpected-sync-operations');
    generation = operationReference(createSyncOperation({ format: 'kairo-sync-operation', v: 1,
      scope: { accountId: binding.accountId, learnerId: binding.learnerId },
      actor: { deviceId: actor.deviceId, incarnationId: actor.incarnationId, sequence: actor.sequence + 1 }, predecessor: actor.predecessor,
      dependencies, schemaEpoch: policy.schemaEpoch, deletionEpoch: policy.deletionEpoch,
      mergePolicy: policy.mergePolicy, occurredAt: gate.meta.occurredAt, payload: restore.payload }));
  }
  const version = { payload: { kind: 'note.version', noteId: input.noteId,
    versionId: `personal-note-version:${digest([{ accountId: binding.accountId, learnerId: binding.learnerId }, gate.meta.changeId])}`,
    generation, supersedes: history.filter((operation) => operation.payloadSha256 === selected.payloadSha256).map(operationReference),
    segments: selected.payload.segments }, dependencies };
  return input.generation === null ? [restore, version] : [version];
}
function noteCommandRequest(binding, gate) {
  const before = gate.snapshot;
  insist(before && Number.isSafeInteger(before.revision), 'unexpected-sync-operations');
  const scope = { accountId: binding.accountId, learnerId: binding.learnerId };
  const identity = digest([scope, gate.meta.changeId]);
  const { input, type } = gate;
  let intent;
  let restoration;
  if (type === READING_RESUME) intent = readingResumeIntent(before, input);
  else if (type === NOTE_RESTORE_ORIGINAL) restoration = originalRestorationIntents(binding, gate);
  else if (type === NOTE_CREATE) {
    intent = { payload: { kind: 'note.version', noteId: `personal-note:${identity}`,
      versionId: `personal-note-version:${identity}`, generation: null, supersedes: [],
      segments: [{ kind: 'original', text: input.text }] }, dependencies: [] };
  } else {
    const expected = input.expected;
    const projection = before.replica.projection.entities.find((entity) => entity.target.kind === 'note' && entity.target.id === input.noteId);
    insist(projection && same(expected, { heads: projection.heads, tombstones: projection.tombstones,
      activeRestoreGenerations: projection.activeRestoreGenerations }), 'unexpected-sync-operations');
    const dependencies = [...new Map(Object.values(expected).flat().map((ref) => [ref.opId, ref])).values()]
      .sort((a, b) => a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0);
    const target = { kind: 'note', id: input.noteId };
    let payload;
    if (type === NOTE_DELETE) payload = { kind: 'entity.tombstone', target, reason: 'user-deleted' };
    else if (type === NOTE_RESTORE) payload = { kind: 'entity.restore', target, tombstones: expected.tombstones, reason: input.reason };
    else {
      let generation = input.generation;
      let segments = [{ kind: 'original', text: input.text }];
      if (type === NOTE_CHOOSE) {
        insist(expected.heads.some((ref) => same(ref, input.selected)), 'unexpected-sync-operations');
        const selected = before.replica.operations.find((operation) => operation.opId === input.selected.opId);
        insist(selected?.payload.kind === 'note.version' && selected.payload.noteId === input.noteId &&
          selected.payload.segments.every((segment) => segment.kind === 'original'), 'unexpected-sync-operations');
        generation = selected.payload.generation;
        segments = selected.payload.segments;
      } else insist(type === NOTE_EDIT, 'unexpected-sync-operations');
      payload = { kind: 'note.version', noteId: input.noteId, versionId: `personal-note-version:${identity}`,
        generation, supersedes: expected.heads, segments };
    }
    intent = { payload, dependencies };
  }
  const select = (collection) => before.documents.find((row) => row.collection === collection && row.id === 'current')?.value;
  return { changeId: `host-command:${identity}`, binding, expectedRevision: before.revision,
    occurredAt: gate.meta.occurredAt, mutations: [{ kind: 'put', collection: 'kairo:record-host-commands', id: gate.meta.changeId,
      value: { format: 'kairo-local-command-receipt', version: 1, changeId: gate.meta.changeId, type,
        occurredAt: gate.meta.occurredAt, scope, commandSha256: digest({ scope, type, occurredAt: gate.meta.occurredAt, input }),
        beforeRevision: before.revision, committedRevision: before.revision + 1,
        recordSha256: digest(select('learner-record')), archiveSha256: digest(select('learner-archive')) } }],
    operations: restoration || [intent] };
}
function sourceReferenceCommandRequest(binding, gate) {
  const before = gate.snapshot, { meta, input } = gate;
  insist(before && same(before.policy.binding, binding), 'unexpected-sync-operations');
  const scope = { accountId: binding.accountId, learnerId: binding.learnerId };
  const select = (collection) => before.documents.find((row) => row.collection === collection && row.id === 'current')?.value;
  const proposed = prepareSourceReferenceCapture(select('learner-record').sourceInbox, readSourceReferenceViews(before.replica), input);
  const record = copy({ ...select('learner-record'), sourceInbox: proposed.inbox }), archive = select('learner-archive');
  const { actor, policy } = before;
  const operation = createSyncOperation({ format: 'kairo-sync-operation', v: 1, scope,
    actor: { deviceId: actor.deviceId, incarnationId: actor.incarnationId, sequence: actor.sequence + 1 },
    predecessor: actor.predecessor, dependencies: proposed.intent.dependencies, schemaEpoch: policy.schemaEpoch,
    deletionEpoch: policy.deletionEpoch, mergePolicy: policy.mergePolicy, occurredAt: meta.occurredAt, payload: proposed.intent.payload });
  const row = { format: 'kairo-local-command-receipt', version: 1, changeId: meta.changeId, type: SOURCE_REFERENCE,
    occurredAt: meta.occurredAt, scope, commandSha256: digest({ scope, type: SOURCE_REFERENCE, occurredAt: meta.occurredAt, input }),
    beforeRevision: before.revision, committedRevision: before.revision + 1,
    recordSha256: digest(record), archiveSha256: digest(archive),
    sourceReference: { captureId: input.captureId, intentSha256: digest(proposed.intent), operation: operationReference(operation) } };
  return { changeId: `host-command:${digest([scope, meta.changeId])}`, binding,
    expectedRevision: before.revision, occurredAt: meta.occurredAt,
    mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: record },
      { kind: 'put', collection: 'learner-archive', id: 'current', value: archive },
      { kind: 'put', collection: 'kairo:record-host-commands', id: meta.changeId, value: row }],
    operations: [proposed.intent] };
}
function confirmSourceReferenceAcknowledgement(binding, gate, result) {
  const after = gate.after, request = gate.request;
  insist(gate.commitAttempted && after && request && same(after.policy.binding, binding), 'source-reference-operation-unconfirmed');
  const row = request.mutations[2].value, proof = row.sourceReference;
  const select = (collection, id = 'current') => after.documents.find((entry) => entry.collection === collection && entry.id === id)?.value;
  const operation = after.replica.operations.find((entry) => entry.opId === proof.operation.opId);
  const views = readSourceReferenceViews(after.replica), view = views.find((entry) => entry.captureId === gate.input.captureId);
  insist(same(select('kairo:record-host-commands', gate.meta.changeId), row) && operation &&
    same(operationReference(operation), proof.operation) && same(operation.payload, request.operations[0].payload) &&
    same(operation.dependencies, request.operations[0].dependencies) && operation.occurredAt === gate.meta.occurredAt &&
    same(operation.scope, { accountId: binding.accountId, learnerId: binding.learnerId }) &&
    after.replica.ready.some((ref) => same(ref, proof.operation)) && view && !view.projection.requiresChoice &&
    view.headReferences.length === 1 && view.headReferences[0].operationRefs.some((ref) => same(ref, proof.operation)),
  'source-reference-operation-unconfirmed');
  insist(same(select('learner-record'), request.mutations[0].value) && same(select('learner-archive'), request.mutations[1].value) &&
    result.receipt?.changeId === gate.meta.changeId && result.receipt.type === SOURCE_REFERENCE &&
    result.receipt.committedRevision === row.committedRevision && result.receipt.recordSha256 === row.recordSha256 &&
    result.receipt.archiveSha256 === row.archiveSha256 && same(result.receipt.operations, [proof.operation]) &&
    result.snapshot.revision === after.revision && same(result.snapshot.identity, row.scope) &&
    same(result.snapshot.record, select('learner-record')) && same(result.snapshot.archive, select('learner-archive')) &&
    same(result.snapshot.sourceReferenceViews, views), 'source-reference-result-unconfirmed');
}
async function practiceCommandRequest(binding, gate) {
  const before = gate.snapshot; const { meta, input } = gate;
  const scope = { accountId: binding.accountId, learnerId: binding.learnerId };
  insist(before && same(before.policy.binding, binding) && before.revision === input.expectedRevision &&
    same(input.scope, scope), 'unexpected-sync-operations');
  keys(input, ['expectedRevision', 'scope', 'attemptId', 'expectedRevisionId', 'form', 'outcome', 'elapsedDeltaMs', 'activeDeltaMs', 'dismiss'], [], 'unexpected-sync-operations');
  // Request equality alone cannot establish eligibility: received history may
  // already contain this attempt while the complete local library is older.
  // Check independently of the host before allowing any commitLocal call.
  insist(!before.replica.operations.some((operation) => operation.payload.kind === 'exam.attempt' &&
    operation.payload.attemptId === input.attemptId), 'unexpected-sync-operations');
  insist(!before.replica.projection.entities.some((entry) => entry.target.kind === 'exam-attempt' &&
    entry.target.id === input.attemptId && entry.tombstones.length > 0), 'unexpected-sync-operations');
  const select = (collection) => before.documents.find((row) => row.collection === collection && row.id === 'current')?.value;
  const options = { ...input }; delete options.expectedRevision;
  const { finalizePractice: proposePractice } = await import('./assessment-controller.mjs');
  const proposed = proposePractice(select('learner-record').assessmentLibrary, { ...options, commandId: meta.changeId, now: meta.occurredAt });
  const record = { ...select('learner-record'), assessmentLibrary: proposed.library };
  const archive = select('learner-archive');
  const { actor, policy } = before;
  const expected = createSyncOperation({ format: 'kairo-sync-operation', v: 1, scope,
    actor: { deviceId: actor.deviceId, incarnationId: actor.incarnationId, sequence: actor.sequence + 1 },
    predecessor: actor.predecessor, dependencies: proposed.intent.dependencies, schemaEpoch: policy.schemaEpoch,
    deletionEpoch: policy.deletionEpoch, mergePolicy: policy.mergePolicy, occurredAt: meta.occurredAt, payload: proposed.intent.payload });
  const row = { format: 'kairo-local-command-receipt', version: 1, changeId: meta.changeId, type: PRACTICE_FINALIZE,
    occurredAt: meta.occurredAt, scope, commandSha256: digest({ scope, type: PRACTICE_FINALIZE, occurredAt: meta.occurredAt, input }),
    beforeRevision: before.revision, committedRevision: before.revision + 1, recordSha256: digest(record), archiveSha256: digest(archive),
    practice: { attemptId: input.attemptId, attemptRevisionId: proposed.attemptRevisionId,
      intentSha256: digest(proposed.intent), operation: operationReference(expected) } };
  insist(new globalThis.TextEncoder().encode(encodeLocalJson(row).text).byteLength <= 4096, 'unexpected-sync-operations');
  return { changeId: `host-command:${digest([scope, meta.changeId])}`, binding, expectedRevision: before.revision, occurredAt: meta.occurredAt,
    mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: record },
      { kind: 'put', collection: 'learner-archive', id: 'current', value: archive },
      { kind: 'put', collection: 'kairo:record-host-commands', id: meta.changeId, value: row }], operations: [proposed.intent] };
}
function confirmPracticeAcknowledgement(binding, gate, result) {
  const state = gate.after || gate.snapshot;
  const { meta, input } = gate;
  const scope = { accountId: binding.accountId, learnerId: binding.learnerId };
  insist(state && same(state.policy.binding, binding), 'practice-operation-unconfirmed');
  const row = state.documents.find((entry) => entry.collection === 'kairo:record-host-commands' && entry.id === meta.changeId)?.value;
  insist(row && row.type === PRACTICE_FINALIZE && row.changeId === meta.changeId && same(row.scope, scope) &&
    row.occurredAt === meta.occurredAt && row.commandSha256 === digest({ scope, type: PRACTICE_FINALIZE, occurredAt: meta.occurredAt, input }) &&
    new globalThis.TextEncoder().encode(encodeLocalJson(row).text).byteLength <= 4096 && row.committedRevision === row.beforeRevision + 1 && row.committedRevision <= state.revision &&
    row.beforeRevision === input.expectedRevision, 'practice-operation-unconfirmed');
  if (gate.commitAttempted) insist(same(row, gate.request.mutations[2].value), 'practice-operation-unconfirmed');
  else insist(result.receipt?.outcome === 'duplicate' && result.replayUiEffects === false, 'practice-operation-unconfirmed');
  const proof = row.practice;
  const operation = state.replica.operations.find((entry) => entry.opId === proof?.operation?.opId);
  insist(operation && same(operationReference(operation), proof.operation) &&
    digest({ payload: operation.payload, dependencies: operation.dependencies }) === proof.intentSha256 && same(operation.scope, scope) &&
    operation.payload.kind === 'exam.attempt' && operation.payload.attemptId === input.attemptId && proof.attemptId === input.attemptId &&
    same(operation.payload.form, input.form) && operation.payload.outcome === input.outcome &&
    operation.payload.endedAt === meta.occurredAt && operation.occurredAt === meta.occurredAt &&
    state.replica.ready.some((reference) => same(reference, proof.operation)), 'practice-operation-unconfirmed');
  const record = state.documents.find((entry) => entry.collection === 'learner-record' && entry.id === 'current')?.value;
  const archive = state.documents.find((entry) => entry.collection === 'learner-archive' && entry.id === 'current')?.value;
  const attempt = record?.assessmentLibrary?.attempts.find((entry) => entry.attemptId === input.attemptId);
  const entity = state.replica.projection.entities.find((entry) => entry.target.kind === 'exam-attempt' && entry.target.id === input.attemptId);
  const current = !!(attempt && same(record.assessmentLibrary.scope, scope) && attempt.revisionId === proof.attemptRevisionId &&
    attempt.status !== 'in-progress' && entity?.heads.some((reference) => same(reference, proof.operation)) && !entity.requiresChoice && !entity.identityConflicts.length);
  insist(same(result.practice, { ...proof, current }) && same(result.receipt?.operations, [proof.operation]) &&
    result.receipt.changeId === meta.changeId && result.receipt.type === PRACTICE_FINALIZE &&
    result.receipt.committedRevision === row.committedRevision && result.receipt.recordSha256 === row.recordSha256 &&
    result.receipt.archiveSha256 === row.archiveSha256 && result.snapshot.revision === state.revision &&
    same(result.snapshot.identity, scope) && same(result.snapshot.record, record) && same(result.snapshot.archive, archive), 'practice-operation-unconfirmed');
  if (gate.commitAttempted) insist(current && digest(record) === row.recordSha256 && digest(archive) === row.archiveSha256, 'practice-result-superseded');
}
function writerCapture(writer, binding) {
  const captured = copy(writer.capture());
  keys(captured, ['ownerId', 'epoch', 'sessionId'], [], 'writer-required');
  insist(
    typeof captured.ownerId === 'string' &&
      captured.ownerId.length > 0 &&
      Number.isSafeInteger(captured.epoch) &&
      captured.epoch >= 0,
    'writer-required',
  );
  insist(captured.sessionId === binding.sessionId, 'session-changed');
  insist(writer.assert(captured) === true, 'writer-required');
  return captured;
}

class RecordApp {
  #host;
  #writer;
  #binding;
  #onPublish;
  #restoreGate;
  #noteGate;
  #practiceGate;
  #sourceReferenceGate;
  #tail = Promise.resolve();
  #pending = 0;
  #closed = false;
  constructor({ host, writer, binding, onPublish, restoreGate, noteGate, practiceGate, sourceReferenceGate }) {
    this.#host = host;
    this.#writer = writer;
    this.#binding = binding;
    this.#onPublish = onPublish;
    this.#restoreGate = restoreGate;
    this.#noteGate = noteGate;
    this.#practiceGate = practiceGate;
    this.#sourceReferenceGate = sourceReferenceGate;
  }
  #guard(captured) {
    insist(!this.#closed, 'closed');
    insist(
      captured.sessionId === this.#binding.sessionId && this.#writer.assert(captured) === true,
      'writer-required',
    );
  }
  #recovery(error, acknowledgement) {
    const current = this.#host.current();
    const lastCommitted = current.snapshot || current.lastCommitted;
    return copy({
      status: 'recovery-required',
      reason: typeof error?.code === 'string' ? error.code : 'publication-failed',
      ...(lastCommitted ? { lastCommitted } : {}),
      ...(acknowledgement?.receipt
        ? { targetCommitDurable: true, receipt: acknowledgement.receipt, replayUiEffects: false }
        : {}),
    });
  }
  #enqueue(action, command = false) {
    let captured;
    let meta;
    try {
      insist(!this.#closed, 'closed');
      captured = writerCapture(this.#writer, this.#binding);
      if (command)
        meta = Object.freeze({
          changeId: crypto.randomUUID(),
          occurredAt: new Date().toISOString(),
        });
    } catch (error) {
      return Promise.reject(error);
    }
    this.#pending++;
    const run = this.#tail.then(async () => {
      try {
        this.#guard(captured);
        return await action(captured, meta);
      } catch (error) {
        if (['writer-required', 'session-changed'].includes(error?.code))
          return this.#recovery(error);
        throw error;
      }
    });
    this.#tail = run.catch(() => undefined);
    return run.finally(() => {
      this.#pending--;
    });
  }
  #finish(captured, outcome) {
    const result = normalized(outcome);
    if (result.status !== 'active') return result;
    try {
      this.#guard(captured);
      const current = this.#host.current();
      insist(current.status === 'active', 'writer-required');
      if (
        result.receipt &&
        result.receipt.outcome === 'committed' &&
        result.replayUiEffects === true &&
        this.#onPublish
      ) {
        const publication = this.#onPublish(result);
        if (publication instanceof Promise) {
          void publication.catch(() => undefined);
          throw new RecordAppError('async-publication');
        }
        this.#guard(captured);
      }
      return result;
    } catch (error) {
      return this.#recovery(error, result);
    }
  }
  /** Deep-immutable confirmed authority; proposed patches are never exposed. */
  current() {
    return normalized(this.#host.current());
  }
  get pending() {
    return this.#pending;
  }
  snapshot() {
    return this.#enqueue(async (captured) => this.#finish(captured, await this.#host.snapshot()));
  }
  /** A programming/producer error rejects before a target write. Operational
   * failures return recovery-required and preserve any durable target receipt. */
  write(producer) {
    if (typeof producer !== 'function')
      return Promise.reject(new RecordAppError('producer-required'));
    return this.#enqueue(async (captured, meta) => {
      const current = await this.#host.snapshot();
      this.#guard(captured);
      if (current.status !== 'active') return normalized(current);
      const result = checkedProducerResult(producer(current.snapshot.record));
      this.#guard(captured);
      const input = copy({
        ...result,
        expected: expectedRoots(current.snapshot.record, patchRoots(result.patch)),
      });
      return this.#finish(captured, await this.#host.dispatch({ ...meta, type: TYPE, input }));
    }, true);
  }
  appendObservations(rows) {
    let input;
    try {
      input = copy(rows);
      insist(Array.isArray(input), 'invalid-observations');
    } catch (error) {
      return Promise.reject(error);
    }
    return this.#enqueue(
      async (captured, meta) =>
        this.#finish(captured, await this.#host.appendObservations(meta, input)),
      true,
    );
  }
  appendArchive(turns) {
    let input;
    try {
      input = copy(turns);
      insist(Array.isArray(input), 'invalid-archive');
    } catch (error) {
      return Promise.reject(error);
    }
    return this.#enqueue(
      async (captured, meta) => this.#finish(captured, await this.#host.appendArchive(meta, input)),
      true,
    );
  }
  /** Named local operation-producing app commands. Original text is data;
   * callers cannot supply actor identity, operation envelopes or permissions. */
  createNote(raw) {
    let input;
    try {
      input = copy(raw);
      keys(input, ['text'], [], 'invalid-note');
      insist(typeof input.text === 'string' && input.text.length <= 64000 && input.text.trim().length > 0, 'invalid-note');
    } catch (error) { return Promise.reject(error); }
    return this.#enqueue(async (captured, meta) => {
      this.#noteGate.current = { meta, input, type: NOTE_CREATE, snapshot: null, commitAttempted: false };
      try { return this.#finish(captured, await this.#host.createNote(meta, input)); }
      finally { this.#noteGate.current = null; }
    }, true);
  }
  #noteCommand(method, type, raw) {
    let input;
    try { input = copy(raw); }
    catch (error) { return Promise.reject(error); }
    return this.#enqueue(async (captured, meta) => {
      this.#noteGate.current = { meta, input, type, snapshot: null, commitAttempted: false };
      try { return this.#finish(captured, await this.#host[method](meta, input)); }
      finally { this.#noteGate.current = null; }
    }, true);
  }
  editNote(input) { return this.#noteCommand('editNote', NOTE_EDIT, input); }
  deleteNote(input) { return this.#noteCommand('deleteNote', NOTE_DELETE, input); }
  restoreNote(input) { return this.#noteCommand('restoreNote', NOTE_RESTORE, input); }
  chooseNote(input) { return this.#noteCommand('chooseNote', NOTE_CHOOSE, input); }
  restoreOriginalNote(input) { return this.#noteCommand('restoreOriginalNote', NOTE_RESTORE_ORIGINAL, input); }
  saveReadingPosition(input) { return this.#noteCommand('saveReadingPosition', READING_RESUME, input); }
  captureSourceReference(raw) {
    let input;
    try { input = parseSourceReferenceInput(raw); }
    catch (error) { return Promise.reject(error); }
    return this.#enqueue(async (captured, meta) => {
      const gate = { meta, input, snapshot: null, after: null, commitAttempted: false, request: null };
      this.#sourceReferenceGate.current = gate;
      try {
        const result = await this.#host.captureSourceReference(meta, input);
        if (result.status === 'active') {
          try { this.#guard(captured); confirmSourceReferenceAcknowledgement(this.#binding, gate, result); }
          catch (error) { return this.#recovery(error, result); }
        }
        return this.#finish(captured, result);
      } finally { this.#sourceReferenceGate.current = null; }
    }, true);
  }
  /** Caller retains one exact command/time sample across uncertain acknowledgement.
   * The named gate independently checks both the transaction and durable proof. */
  finalizePractice(rawMeta, rawInput) {
    let meta; let input;
    try { meta = copy(rawMeta); input = copy(rawInput); keys(meta, ['changeId', 'occurredAt'], [], 'invalid-practice-command'); }
    catch (error) { return Promise.reject(error); }
    return this.#enqueue(async (captured) => {
      const gate = { meta, input, snapshot: null, after: null, commitAttempted: false, request: null };
      this.#practiceGate.current = gate;
      try {
        const result = await this.#host.finalizePractice(meta, input);
        if (result.status === 'active') {
          try { this.#guard(captured); confirmPracticeAcknowledgement(this.#binding, gate, result); }
          catch (error) { return this.#recovery(error, result); }
        }
        return this.#finish(captured, result);
      } finally { this.#practiceGate.current = null; }
    });
  }
  previewNoteRestore(input) {
    const value = copy(input);
    return this.#enqueue(async (captured) => {
      const result = await this.#host.previewNoteRestore(value); this.#guard(captured); return normalized(result);
    });
  }
  exportBackup() {
    return this.#enqueue(async (captured) => {
      const outcome = await this.#host.exportBackup();
      this.#guard(captured);
      return normalized(outcome);
    });
  }
  /** Bind replacement to the revision the caller actually previewed. A queued
   * earlier write, another host, or a receive transaction supersedes it. */
  restore(backup, options) {
    let input;
    let expectedRevision;
    try {
      const checked = copy(options);
      keys(checked, ['expectedRevision'], [], 'restore-preview-required');
      expectedRevision = checked.expectedRevision;
      insist(
        Number.isSafeInteger(expectedRevision) && expectedRevision >= 0,
        'restore-preview-required',
      );
      input = copy(backup);
    } catch (error) {
      return Promise.reject(error);
    }
    return this.#enqueue(async (captured, meta) => {
      this.#restoreGate.current = { expectedRevision, commitAttempted: false };
      try {
        return this.#finish(captured, await this.#host.restore(meta, input));
      } finally {
        this.#restoreGate.current = null;
      }
    }, true);
  }
  /** Stops queued producers; an already durable command still returns its
   * receipt as recovery-required. The caller closes controller/writer itself. */
  async close() {
    this.#closed = true;
    await this.#tail;
    await this.#host.close();
  }
}

/** onPublish, when supplied, is synchronous. Async UI work remains caller-owned
 * after awaiting the acknowledgement and rechecking its own lifecycle. */
export async function createRecordApp(options) {
  insist(
    plain(options) && (options.onPublish === undefined || typeof options.onPublish === 'function'),
    'invalid-options',
  );
  const binding = copy(options.binding);
  const controller = options.controller;
  insist(
    controller &&
      typeof controller.snapshot === 'function' &&
      typeof controller.commitLocal === 'function',
    'invalid-options',
  );
  const restoreGate = { current: null };
  const noteGate = { current: null };
  const practiceGate = { current: null };
  const sourceReferenceGate = { current: null };
  // Full replacement and the named original-note commands each receive their
  // own narrow transaction guard. Reading intents use the same receipt-only
  // guard with a separately checked payload. Generic patches cannot emit operations.
  // Source status and uncertain-commit evidence are forwarded unchanged.
  const scopedController = {
    async snapshot() {
      const outcome = await controller.snapshot();
      const gate = restoreGate.current;
      if (gate && !gate.commitAttempted && outcome.status === 'active')
        insist(outcome.snapshot.revision === gate.expectedRevision, 'restore-superseded');
      if (noteGate.current && !noteGate.current.commitAttempted && outcome.status === 'active')
        noteGate.current.snapshot = outcome.snapshot;
      if (practiceGate.current && outcome.status === 'active') {
        if (practiceGate.current.commitAttempted) practiceGate.current.after = outcome.snapshot;
        else if (!practiceGate.current.snapshot) practiceGate.current.snapshot = outcome.snapshot;
      }
      if (sourceReferenceGate.current && outcome.status === 'active') {
        if (sourceReferenceGate.current.commitAttempted) sourceReferenceGate.current.after = outcome.snapshot;
        else if (!sourceReferenceGate.current.snapshot) sourceReferenceGate.current.snapshot = outcome.snapshot;
      }
      return outcome;
    },
    async commitLocal(request) {
      insist(Array.isArray(request.operations), 'unexpected-sync-operations');
      const practice = practiceGate.current;
      const note = noteGate.current;
      const sourceReference = sourceReferenceGate.current;
      if (sourceReference) {
        insist(!note && !practice && !restoreGate.current && !sourceReference.commitAttempted, 'unexpected-sync-operations');
        sourceReference.request = sourceReferenceCommandRequest(binding, sourceReference);
        insist(same(request, sourceReference.request), 'unexpected-sync-operations');
        sourceReference.commitAttempted = true;
      } else if (practice) {
        insist(!note && !restoreGate.current && !practice.commitAttempted, 'unexpected-sync-operations');
        practice.request = await practiceCommandRequest(binding, practice);
        insist(same(request, practice.request), 'unexpected-sync-operations');
        practice.commitAttempted = true;
      } else if (note) {
        insist(!restoreGate.current && !note.commitAttempted && same(request, noteCommandRequest(binding, note)), 'unexpected-sync-operations');
        note.commitAttempted = true;
      } else insist(request.operations.length === 0, 'unexpected-sync-operations');
      const gate = restoreGate.current;
      if (gate) {
        insist(
          !gate.commitAttempted && request.expectedRevision === gate.expectedRevision,
          'restore-superseded',
        );
        gate.commitAttempted = true;
      }
      return controller.commitLocal(request);
    },
    async commitRestore(request) {
      const gate = restoreGate.current;
      insist(gate && !gate.commitAttempted && request.expectedRevision === gate.expectedRevision,
        'restore-superseded');
      insist(typeof controller.commitRestore === 'function', 'journal-restore-unavailable');
      gate.commitAttempted = true;
      return controller.commitRestore(request);
    },
  };
  const host = await createRecordHost({
    controller: scopedController,
    binding,
    writer: options.writer,
    validateRecord: options.validateRecord,
    validateArchive: options.validateArchive,
    reducers: { [TYPE]: reducePatch },
  });
  return new RecordApp({
    host,
    writer: options.writer,
    binding,
    onPublish: options.onPublish,
    restoreGate,
    noteGate,
    practiceGate,
    sourceReferenceGate,
  });
}
