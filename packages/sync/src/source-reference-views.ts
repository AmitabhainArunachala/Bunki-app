import { immutable, SyncValidationError } from './common.ts';
import type { OperationRef, SourceReferencePayload } from './operations.ts';
import { planReceive, type EntityProjection, type SyncReplica } from './replica.ts';

export interface SourceReferenceHeadView {
  readonly payloadSha256: string;
  /** Exact encountered URL and capture time; no source body or permission grant. */
  readonly payload: SourceReferencePayload;
  /** Equal content retains every independent operation reference. */
  readonly operationRefs: readonly OperationRef[];
}

export interface SourceReferenceView {
  readonly captureId: string;
  /** All active immutable reference choices, in the existing projection's order. */
  readonly headReferences: readonly SourceReferenceHeadView[];
  /** Complete entity state, including hidden, tombstone-only and restore-only captures. */
  readonly projection: EntityProjection;
}

/**
 * Read source references from a planner-owned in-process replica. An empty
 * receive validates the handle and derives the complete journal projection;
 * pending and quarantined operations cannot supply visible reference content.
 * Serialized replicas must first be rebuilt through the existing planner.
 * No URL canonicalization, clock winner, source retrieval, scheduling or account
 * authority is supplied by this read. Hidden entities retain their core state.
 */
export function readSourceReferenceViews(replica: SyncReplica): readonly SourceReferenceView[] {
  const checked = planReceive(replica, {
    // The planner checks its WeakSet before reading this local getter. Forged
    // handles and proxy lookalikes cannot execute their own property accessors.
    get binding() {
      return replica.policy.binding;
    },
    operations: [],
  }).next;
  const operations = new Map(checked.operations.map((operation) => [operation.opId, operation]));
  const views: SourceReferenceView[] = [];
  for (const projection of checked.projection.entities) {
    if (projection.target.kind !== 'source-reference') continue;
    const references = new Map<
      string,
      { payloadSha256: string; payload: SourceReferencePayload; operationRefs: OperationRef[] }
    >();
    for (const reference of projection.heads) {
      const operation = operations.get(reference.opId);
      if (
        !operation ||
        operation.payload.kind !== 'source.reference' ||
        operation.payload.captureId !== projection.target.id
      ) {
        throw new SyncValidationError('invalid-replica');
      }
      const existing = references.get(operation.payloadSha256);
      if (existing) existing.operationRefs.push(reference);
      else {
        references.set(operation.payloadSha256, {
          payloadSha256: operation.payloadSha256,
          payload: operation.payload,
          operationRefs: [reference],
        });
      }
    }
    views.push({
      captureId: projection.target.id,
      headReferences: [...references.values()],
      projection,
    });
  }
  return immutable(views);
}
