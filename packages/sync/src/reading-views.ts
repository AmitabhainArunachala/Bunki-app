import { immutable, SyncValidationError } from './common.ts';
import type { OperationRef, RecordOperation } from './operations.ts';
import { planReceive, type EntityProjection, type SyncReplica } from './replica.ts';

export type ReadingResumePayload = Extract<RecordOperation, { kind: 'reading.resume' }>;

export interface ReadingResumeView {
  readonly payloadSha256: string;
  /** Exact source version, position, session, generation and declared supersessions. */
  readonly payload: ReadingResumePayload;
  /** Identical payloads can have independent provenance. Every reference is retained. */
  readonly operationRefs: readonly OperationRef[];
}

export interface ReadingView {
  readonly sourceId: string;
  /** Every unsuperseded resume choice, in existing projection order. */
  readonly headResumes: readonly ReadingResumeView[];
  /** Complete entity state, including non-head active refs, tombstones and restores. */
  readonly projection: EntityProjection;
}

/**
 * Read reading positions from a planner-owned in-process replica handle.
 * An empty receive validates the handle and derives the complete projection from
 * its journal. Serialized replicas must first be rebuilt through the core planner.
 * Pending and quarantined operations cannot supply a resume choice. Hidden and
 * restore-only entities remain visible with empty headResumes and full core state.
 * Neither timestamps nor distance choose a winner; source digests do not provide
 * source bytes or permission, and this read supplies no scheduling or persistence.
 */
export function readReadingViews(replica: SyncReplica): readonly ReadingView[] {
  const checked = planReceive(replica, {
    // The planner checks its WeakSet before reading this local getter. A forged
    // handle or proxy cannot run its own accessors before rejection.
    get binding() {
      return replica.policy.binding;
    },
    operations: [],
  }).next;
  const operations = new Map(checked.operations.map((operation) => [operation.opId, operation]));
  const views: ReadingView[] = [];
  for (const projection of checked.projection.entities) {
    if (projection.target.kind !== 'reading-position') continue;
    const resumes = new Map<
      string,
      { payloadSha256: string; payload: ReadingResumePayload; operationRefs: OperationRef[] }
    >();
    for (const reference of projection.heads) {
      const operation = operations.get(reference.opId);
      if (
        !operation ||
        operation.payload.kind !== 'reading.resume' ||
        operation.payload.anchor.source.sourceId !== projection.target.id
      ) {
        throw new SyncValidationError('invalid-replica');
      }
      const existing = resumes.get(operation.payloadSha256);
      if (existing) existing.operationRefs.push(reference);
      else {
        resumes.set(operation.payloadSha256, {
          payloadSha256: operation.payloadSha256,
          payload: operation.payload,
          operationRefs: [reference],
        });
      }
    }
    views.push({ sourceId: projection.target.id, headResumes: [...resumes.values()], projection });
  }
  return immutable(views);
}
