/** One deterministic terminal assessment transaction, independently recomputed
 * by RecordHost and RecordApp's commit guard. No UI patch is accepted here. */
import { createSyncOperationV2, createAssessmentSyncIntentsV2, createLearningSuppressionIntentV2, encodeLocalJson, operationReference } from './modules/record-core.mjs';
import { assessmentOutcomesV2, commandAssessmentV2, parseAssessmentLibraryV2, selectAssessmentV2 } from './assessment-v2-controller.mjs';
import { ASSESSMENT_LEARNING_POLICY, planAssessmentLearning, applyAssessmentLearning, parseAssessmentLearning, suppressAssessmentLearning, undoAssessmentLearning } from './assessment-learning.mjs';

export const ASSESSMENT_FINALIZE = 'host.assessment-finalize/2';
export const ASSESSMENT_SUPPRESS = 'host.assessment-suppress/2';
const copy = (value) => encodeLocalJson(value).value;
const digest = (value) => encodeLocalJson(value).sha256;
const same = (a, b) => encodeLocalJson(a).text === encodeLocalJson(b).text;
const scopeOf = (binding) => ({ accountId: binding.accountId, learnerId: binding.learnerId });
const insist = (condition, code) => { if (!condition) { const error = new Error(`Assessment finalization ${code}`); error.code = code; throw error; } };
const fields = (value, required, optional = []) => {
  insist(value && typeof value === 'object' && !Array.isArray(value) &&
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key)), 'invalid-assessment-command');
};
// eslint-disable-next-line no-control-regex -- Reject control characters at the external identity boundary.
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/\s|[\x00-\x1f\x7f]/u.test(value);
export function parseAssessmentFinalizeInput(raw) {
  const input = copy(raw);
  fields(input, ['expectedRevision', 'scope', 'attemptId', 'expectedRevisionId', 'clockSessionId', 'action'], ['monotonicMs']);
  fields(input.scope, ['accountId', 'learnerId']);
  insist(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0 &&
    [input.attemptId, input.expectedRevisionId, input.clockSessionId, input.scope.accountId, input.scope.learnerId].every(id) &&
    (input.monotonicMs == null || Number.isSafeInteger(input.monotonicMs) && input.monotonicMs >= 0), 'invalid-assessment-command');
  return input;
}
export function checkedAssessmentTarget(subject, raw) {
  if (raw == null) return null;
  const target = copy(raw);
  fields(target, ['t', 'id'], ['label', 'dictionary']);
  insist(['word', 'kanji', 'grammar', 'particle'].includes(target.t) && id(target.id) &&
    subject === `${target.t}:${target.id}` &&
    (target.label === undefined || typeof target.label === 'string' && target.label.length <= 500) &&
    (target.dictionary == null || target.t === 'word' && typeof target.dictionary === 'object' && !Array.isArray(target.dictionary)) &&
    new TextEncoder().encode(encodeLocalJson(target).text).byteLength <= 32_000, 'invalid-assessment-target');
  return target;
}
export function assessmentProofCurrent(snapshot, proof) {
  const record = snapshot.documents.find((entry) => entry.collection === 'learner-record' && entry.id === 'current')?.value;
  const attempt = record?.assessmentLibraryV2?.attempts?.find((entry) => entry.attemptId === proof.attemptId);
  const followup = record?.assessmentLearning?.followups?.find((entry) => entry.id === proof.followupId);
  const entity = snapshot.replica.projection.entities.find((entry) => entry.target.kind === 'exam-attempt' && entry.target.id === proof.attemptId);
  return !!(attempt && followup && same(record.assessmentLibraryV2.scope, scopeOf(snapshot.policy.binding)) &&
    attempt.revisionId === proof.attemptRevisionId && attempt.status !== 'in-progress' &&
    followup.attemptRevisionId === proof.attemptRevisionId &&
    entity && !entity.requiresChoice && !entity.tombstones.length && !entity.identityConflicts.length &&
    entity.heads.some((ref) => same(ref, proof.operations[0])));
}
/** The resolver is injected by the local app host, never supplied in a command.
 * Missing mappings remain durable pending work, including when offline. */
export function prepareAssessmentFinalization({ binding, snapshot, meta, input: raw, resolveSubject, resolvePresentation }) {
  const input = parseAssessmentFinalizeInput(raw);
  const scope = scopeOf(binding);
  insist(same(snapshot.policy.binding, binding) && same(input.scope, scope), 'scope-mismatch');
  insist(snapshot.revision === input.expectedRevision, 'assessment-store-superseded');
  insist(!snapshot.replica.operations.some((operation) =>
    ['exam.attempt', 'assessment.result/2'].includes(operation.payload.kind) && operation.payload.attemptId === input.attemptId), 'assessment-already-emitted');
  insist(!snapshot.replica.projection.entities.some((entry) => entry.target.kind === 'exam-attempt' &&
    entry.target.id === input.attemptId && entry.tombstones.length > 0), 'assessment-already-deleted');
  const select = (collection) => snapshot.documents.find((row) => row.collection === collection && row.id === 'current')?.value;
  const record = select('learner-record'), archive = select('learner-archive');
  const library = parseAssessmentLibraryV2(record.assessmentLibraryV2, { scope });
  const original = selectAssessmentV2(library, input.attemptId);
  insist(original && original.attempt.status === 'in-progress', 'assessment-already-terminal');
  const command = { ...input }; delete command.expectedRevision;
  const nextLibrary = commandAssessmentV2(library, { ...command, now: Date.parse(meta.occurredAt) });
  const selected = selectAssessmentV2(nextLibrary, input.attemptId);
  insist(selected.score && selected.attempt.status !== 'in-progress', 'assessment-not-terminal');
  const outcomes = assessmentOutcomesV2(selected);
  const planned = planAssessmentLearning({ scope, form: selected.form, attempt: selected.attempt, outcomes, presentation: resolvePresentation?.(selected.form) || null,
    resolveSubject: (subject, item) => checkedAssessmentTarget(subject, resolveSubject?.(subject, item, record) ?? null) });
  const learning = applyAssessmentLearning(record, planned);
  const next = copy({ ...record, v: 2, assessmentLibraryV2: nextLibrary, ...learning });
  const followup = parseAssessmentLearning(next.assessmentLearning, scope).followups.find((entry) => entry.id === planned.id);
  insist(followup, 'assessment-followup-missing');
  const intents = createAssessmentSyncIntentsV2({ form: selected.form, attempt: selected.attempt,
    result: selected.score, followup });
  insist(Array.isArray(intents) && intents.length > 0 && intents.length <= 16, 'assessment-intent-capacity');
  let predecessor = snapshot.actor.predecessor;
  const operations = intents.map((intent, index) => {
    insist(Number.isSafeInteger(snapshot.actor.sequence + index + 1), 'revision-exhausted');
    const operation = createSyncOperationV2({ format: 'kairo-sync-operation', v: 2, scope,
      actor: { deviceId: snapshot.actor.deviceId, incarnationId: snapshot.actor.incarnationId,
        sequence: snapshot.actor.sequence + index + 1 }, predecessor, dependencies: intent.dependencies,
      schemaEpoch: snapshot.policy.schemaEpoch, deletionEpoch: snapshot.policy.deletionEpoch,
      mergePolicy: snapshot.policy.mergePolicy, occurredAt: meta.occurredAt, payload: intent.payload });
    predecessor = operationReference(operation);
    return predecessor;
  });
  const row = { format: 'kairo-local-command-receipt', version: 1, changeId: meta.changeId,
    type: ASSESSMENT_FINALIZE, occurredAt: meta.occurredAt, scope,
    commandSha256: digest({ scope, type: ASSESSMENT_FINALIZE, occurredAt: meta.occurredAt, input }),
    beforeRevision: snapshot.revision, committedRevision: snapshot.revision + 1,
    recordSha256: digest(next), archiveSha256: digest(archive),
    assessment: { attemptId: input.attemptId, attemptRevisionId: selected.attempt.revisionId,
      followupId: followup.id, intentsSha256: digest(intents), operations } };
  insist(new TextEncoder().encode(encodeLocalJson(row).text).byteLength <= 8192, 'assessment-receipt-capacity');
  return copy({ changeId: `host-command:${digest([scope, meta.changeId])}`, binding,
    expectedRevision: snapshot.revision, occurredAt: meta.occurredAt,
    mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: next },
      { kind: 'put', collection: 'learner-archive', id: 'current', value: archive },
      { kind: 'put', collection: 'kairo:record-host-commands', id: meta.changeId, value: row }],
    operations: intents });
}
export function validateAssessmentProof(raw) {
  const proof = copy(raw);
  fields(proof, ['attemptId', 'attemptRevisionId', 'followupId', 'intentsSha256', 'operations']);
  insist([proof.attemptId, proof.attemptRevisionId, proof.followupId].every(id) &&
    /^[a-f0-9]{64}$/u.test(proof.intentsSha256) && Array.isArray(proof.operations) &&
    proof.operations.length > 0 && proof.operations.length <= 16, 'invalid-assessment-proof');
  for (const operation of proof.operations) {
    fields(operation, ['opId', 'sha256']);
    insist(Object.values(operation).every((value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)), 'invalid-assessment-proof');
  }
  return proof;
}
/** Historical confirmation must not restore cards, change schedules, or revive
 * a deleted attempt when the caller retries an uncertain acknowledgement. */
export function confirmAssessmentProof({ binding, snapshot, meta, input, row }) {
  const proof = validateAssessmentProof(row.assessment);
  const scope = scopeOf(binding);
  insist(same(snapshot.policy.binding, binding) && row.type === ASSESSMENT_FINALIZE &&
    row.changeId === meta.changeId && row.occurredAt === meta.occurredAt && same(row.scope, scope) &&
    row.commandSha256 === digest({ scope, type: ASSESSMENT_FINALIZE, occurredAt: meta.occurredAt, input }) &&
    proof.attemptId === input.attemptId, 'assessment-operation-unconfirmed');
  const intents = proof.operations.map((ref, index) => {
    const operation = snapshot.replica.operations.find((entry) => entry.opId === ref.opId);
    insist(operation && same(operationReference(operation), ref) && same(operation.scope, scope) &&
      operation.occurredAt === meta.occurredAt && snapshot.replica.ready.some((entry) => same(entry, ref)) &&
      (index === 0 || same(operation.predecessor, proof.operations[index - 1])), 'assessment-operation-unconfirmed');
    return { payload: operation.payload, dependencies: operation.dependencies };
  });
  insist(digest(intents) === proof.intentsSha256 && intents[0].payload.kind === 'assessment.result/2' &&
    intents[0].payload.attemptId === input.attemptId, 'assessment-operation-unconfirmed');
  return proof;
}

export function parseAssessmentSuppressionInput(raw) {
  const input = copy(raw);
  fields(input, ['expectedRevision', 'scope', 'kind'], input.kind === 'remove' ? ['key'] : ['followupId']);
  fields(input.scope, ['accountId', 'learnerId']);
  insist(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0 &&
    [input.scope.accountId, input.scope.learnerId].every(id) && ['remove', 'undo'].includes(input.kind), 'invalid-assessment-command');
  if (input.kind === 'remove') {
    insist(typeof input.key === 'string' && /^(word|kanji|grammar|particle|sentence|question):\S+$/u.test(input.key) &&
      input.key.length <= 210, 'invalid-assessment-command');
  } else insist(id(input.followupId), 'invalid-assessment-command');
  return input;
}
const targetKey = (target) => `${target.t}:${target.id}`;
export function prepareAssessmentSuppression({ binding, snapshot, meta, input: raw }) {
  const input = parseAssessmentSuppressionInput(raw), scope = scopeOf(binding);
  insist(same(snapshot.policy.binding, binding) && same(input.scope, scope), 'scope-mismatch');
  insist(snapshot.revision === input.expectedRevision, 'assessment-store-superseded');
  const select = (collection) => snapshot.documents.find((entry) => entry.collection === collection && entry.id === 'current')?.value;
  const record = select('learner-record'), archive = select('learner-archive');
  const root = parseAssessmentLearning(record.assessmentLearning, scope);
  const at = Date.parse(meta.occurredAt);
  let patch, requestedKeys;
  if (input.kind === 'remove') {
    requestedKeys = [input.key];
    patch = { ...suppressAssessmentLearning(record, input.key, at),
      taken: record.taken.filter((entry) => targetKey(entry) !== input.key) };
  } else {
    const full = undoAssessmentLearning(record, input.followupId, at);
    const priorKeys = new Set(root.suppressions.map((entry) => entry.key));
    const remainingTaken = new Set(full.taken.map(targetKey));
    requestedKeys = [...new Set([
      ...full.assessmentLearning.suppressions.filter((entry) => !priorKeys.has(entry.key)).map((entry) => entry.key),
      ...record.taken.filter((entry) => !remainingTaken.has(targetKey(entry))).map(targetKey),
    ])].sort();
    const selectedKeys = new Set(requestedKeys.slice(0, 100));
    patch = { taken: record.taken.filter((entry) => !selectedKeys.has(targetKey(entry)) || remainingTaken.has(targetKey(entry))),
      assessmentLearning: { ...full.assessmentLearning,
        suppressions: full.assessmentLearning.suppressions.filter((entry) => priorKeys.has(entry.key) || selectedKeys.has(entry.key)) } };
  }
  const keys = requestedKeys.slice(0, 100);
  const intents = keys.map((key) => {
    const split = key.indexOf(':');
    return createLearningSuppressionIntentV2({ suppressionId: `assessment-suppression:${digest([scope, meta.changeId, key])}`,
      target: { t: key.slice(0, split), id: key.slice(split + 1) }, at: meta.occurredAt,
      reason: input.kind === 'remove' ? 'removed' : 'undo-auto-add', policyVersion: ASSESSMENT_LEARNING_POLICY });
  });
  const next = copy({ ...record, v: 2, ...patch });
  parseAssessmentLearning(next.assessmentLearning, scope);
  let predecessor = snapshot.actor.predecessor;
  const operations = intents.map((intent, index) => {
    const operation = createSyncOperationV2({ format: 'kairo-sync-operation', v: 2, scope,
      actor: { deviceId: snapshot.actor.deviceId, incarnationId: snapshot.actor.incarnationId,
        sequence: snapshot.actor.sequence + index + 1 }, predecessor, dependencies: intent.dependencies,
      schemaEpoch: snapshot.policy.schemaEpoch, deletionEpoch: snapshot.policy.deletionEpoch,
      mergePolicy: snapshot.policy.mergePolicy, occurredAt: meta.occurredAt, payload: intent.payload });
    predecessor = operationReference(operation); return predecessor;
  });
  const row = { format: 'kairo-local-command-receipt', version: 1, changeId: meta.changeId,
    type: ASSESSMENT_SUPPRESS, occurredAt: meta.occurredAt, scope,
    commandSha256: digest({ scope, type: ASSESSMENT_SUPPRESS, occurredAt: meta.occurredAt, input }),
    beforeRevision: snapshot.revision, committedRevision: snapshot.revision + 1,
    recordSha256: digest(next), archiveSha256: digest(archive),
    learningSuppression: { keys, remaining: Math.max(0, requestedKeys.length - keys.length),
      intentsSha256: digest(intents), operations } };
  insist(new TextEncoder().encode(encodeLocalJson(row).text).byteLength <= 65_536, 'assessment-receipt-capacity');
  return copy({ changeId: `host-command:${digest([scope, meta.changeId])}`, binding,
    expectedRevision: snapshot.revision, occurredAt: meta.occurredAt,
    mutations: [{ kind: 'put', collection: 'learner-record', id: 'current', value: next },
      { kind: 'put', collection: 'learner-archive', id: 'current', value: archive },
      { kind: 'put', collection: 'kairo:record-host-commands', id: meta.changeId, value: row }],
    operations: intents });
}
export function confirmAssessmentSuppression({ binding, snapshot, meta, input, row }) {
  const proof = row.learningSuppression, scope = scopeOf(binding);
  fields(proof, ['keys', 'remaining', 'intentsSha256', 'operations']);
  insist(Array.isArray(proof.keys) && proof.keys.length <= 100 && new Set(proof.keys).size === proof.keys.length &&
    Array.isArray(proof.operations) && proof.operations.length === proof.keys.length &&
    Number.isSafeInteger(proof.remaining) && proof.remaining >= 0 && proof.remaining <= 1000 &&
    same(snapshot.policy.binding, binding) && row.type === ASSESSMENT_SUPPRESS && row.changeId === meta.changeId &&
    row.occurredAt === meta.occurredAt && same(row.scope, scope) &&
    row.commandSha256 === digest({ scope, type: ASSESSMENT_SUPPRESS, occurredAt: meta.occurredAt, input }),
  'assessment-operation-unconfirmed');
  const intents = proof.operations.map((reference, index) => {
    const operation = snapshot.replica.operations.find((entry) => entry.opId === reference.opId);
    insist(operation && same(operationReference(operation), reference) && same(operation.scope, scope) &&
      operation.occurredAt === meta.occurredAt && operation.payload.kind === 'learning.suppress/2' &&
      targetKey(operation.payload.target) === proof.keys[index] &&
      operation.payload.reason === (input.kind === 'remove' ? 'removed' : 'undo-auto-add') &&
      snapshot.replica.ready.some((entry) => same(entry, reference)) &&
      (index === 0 || same(operation.predecessor, proof.operations[index - 1])), 'assessment-operation-unconfirmed');
    return { payload: operation.payload, dependencies: operation.dependencies };
  });
  insist(digest(intents) === proof.intentsSha256, 'assessment-operation-unconfirmed');
  return proof;
}
