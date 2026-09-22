import {
  createReplica,
  createSyncOperation,
  operationReference,
  planReceive,
  SYNC_MERGE_POLICY,
  type RecordOperation,
  type ReplicaPolicy,
  type SyncOperation,
  type SyncOperationInput,
  type SyncReplica,
} from '../src/index.ts';

export const NOW = '2026-09-10T10:00:00.000Z';
export const HASH = 'a'.repeat(64);
export const policy: ReplicaPolicy = {
  binding: { accountId: 'account-a', learnerId: 'learner-a', sessionId: 'login-a' },
  schemaEpoch: 1,
  deletionEpoch: 3,
  mergePolicy: SYNC_MERGE_POLICY,
};

export function note(
  noteId = 'note-1',
  versionId = 'version-1',
  text = '猫を見た。',
): RecordOperation {
  return {
    kind: 'note.version',
    noteId,
    versionId,
    generation: null,
    supersedes: [],
    segments: [{ kind: 'original', text }],
  };
}

export function resume(start: number, versionId = 'source-v1'): RecordOperation {
  return {
    kind: 'reading.resume',
    sessionId: 'reading-session',
    generation: null,
    supersedes: [],
    anchor: {
      source: { sourceId: 'source-1', versionId, sha256: HASH },
      position: { kind: 'text', unit: 'utf16', start, end: start, bodyLength: 1000 },
    },
  };
}

export function exam(attemptId = 'exam-1'): RecordOperation {
  return {
    kind: 'exam.attempt',
    attemptId,
    generation: null,
    form: { formId: 'jlpt-n3-a', versionId: 'form-v1', sha256: HASH },
    outcome: 'submitted',
    startedAt: NOW,
    endedAt: NOW,
    elapsedMs: 5_400_000,
    interruptionCount: 0,
    answers: [
      {
        itemId: 'question-1',
        itemVersionId: 'item-v1',
        response: { kind: 'choice', optionId: 'b' },
      },
    ],
  };
}

export function review(attemptId = 'review-1', scheduleRevisionId = 'schedule-1'): RecordOperation {
  return {
    kind: 'review.attempt',
    attemptId,
    generation: null,
    cardId: 'card-1',
    scheduleRevisionId,
    observedAt: NOW,
    response: { kind: 'text', text: 'ねこ' },
    reportedGrade: 'good',
    hintsUsed: 0,
    answerRevealed: false,
    admission: 'accepted',
    admissionPolicyVersion: 'evidence-gate/1',
    schedulerParametersVersion: 'fsrs-pin/1',
    domainEventRefs: [{ eventId: `event-${attemptId}`, sha256: HASH }],
  };
}

export function op(
  payload: RecordOperation,
  deviceId = 'mac',
  overrides: Partial<SyncOperationInput> = {},
): SyncOperation {
  return createSyncOperation({
    format: 'kairo-sync-operation',
    v: 1,
    scope: { accountId: policy.binding.accountId, learnerId: policy.binding.learnerId },
    actor: { deviceId, incarnationId: 'install-1', sequence: 1 },
    predecessor: null,
    dependencies: [],
    schemaEpoch: 1,
    deletionEpoch: 3,
    mergePolicy: SYNC_MERGE_POLICY,
    occurredAt: NOW,
    payload,
    ...overrides,
  });
}

export function nextOp(prior: SyncOperation, payload: RecordOperation): SyncOperation {
  return op(payload, prior.actor.deviceId, {
    actor: { ...prior.actor, sequence: prior.actor.sequence + 1 },
    predecessor: operationReference(prior),
  });
}

export function receive(replica: SyncReplica, ...operations: readonly unknown[]): SyncReplica {
  return planReceive(replica, { binding: replica.policy.binding, operations }).next;
}

export function merged(...operations: readonly unknown[]): SyncReplica {
  return receive(createReplica(policy), ...operations);
}

export function permutations<T>(values: readonly T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [
      value,
      ...rest,
    ]),
  );
}
