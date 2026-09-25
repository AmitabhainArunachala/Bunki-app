import { immutable, SyncValidationError } from './common.ts';
import type { OperationRef, RecordOperation } from './operations.ts';
import { planReceive, type EntityProjection, type SyncReplica } from './replica.ts';

/** The existing portable response payload, not a complete assessment attempt. */
export type ExamAttemptPayload = Extract<RecordOperation, { kind: 'exam.attempt' }>;

export interface ExamAttemptHeadView {
  readonly payloadSha256: string;
  /** Exact submitted/stopped responses and declared form/timing facts only. */
  readonly payload: ExamAttemptPayload;
  /** Equal content retains every independent operation reference. */
  readonly operationRefs: readonly OperationRef[];
}

export interface ExamAttemptView {
  readonly attemptId: string;
  /** All active immutable response choices, in the existing projection's order. */
  readonly headAttempts: readonly ExamAttemptHeadView[];
  /** Complete entity state, including hidden, tombstone-only and restore-only attempts. */
  readonly projection: EntityProjection;
}

/**
 * Read response history from a planner-owned in-process replica. An empty
 * receive validates the handle and derives the complete journal projection;
 * pending and quarantined operations cannot supply visible response content.
 * Serialized replicas must first be rebuilt through the existing planner.
 * No full attempt, question body, score, editorial admission, mastery or schedule
 * is inferred. The immutable snapshot is neither a live binding nor authority.
 */
export function readExamAttemptViews(replica: SyncReplica): readonly ExamAttemptView[] {
  const checked = planReceive(replica, {
    // The planner checks its WeakSet before reading this local getter. Forged
    // handles and proxy lookalikes cannot execute their own property accessors.
    get binding() {
      return replica.policy.binding;
    },
    operations: [],
  }).next;
  const operations = new Map(checked.operations.map((operation) => [operation.opId, operation]));
  const views: ExamAttemptView[] = [];
  for (const projection of checked.projection.entities) {
    if (projection.target.kind !== 'exam-attempt') continue;
    const attempts = new Map<
      string,
      { payloadSha256: string; payload: ExamAttemptPayload; operationRefs: OperationRef[] }
    >();
    for (const reference of projection.heads) {
      const operation = operations.get(reference.opId);
      // V2 has its own explicit view; old history never reinterprets a rich result as v1.
      if (operation?.payload.kind === 'assessment.result/2') continue;
      if (
        !operation ||
        operation.payload.kind !== 'exam.attempt' ||
        operation.payload.attemptId !== projection.target.id
      ) {
        throw new SyncValidationError('invalid-replica');
      }
      const existing = attempts.get(operation.payloadSha256);
      if (existing) existing.operationRefs.push(reference);
      else {
        attempts.set(operation.payloadSha256, {
          payloadSha256: operation.payloadSha256,
          payload: operation.payload,
          operationRefs: [reference],
        });
      }
    }
    views.push({
      attemptId: projection.target.id,
      headAttempts: [...attempts.values()],
      projection,
    });
  }
  return immutable(views);
}
