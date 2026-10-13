import { immutable, SyncValidationError } from './common.ts';
import { viewOperationIndex } from './view-index.ts';
import type { OperationRef, RecordOperation } from './operations.ts';
import { planReceive, type EntityProjection, type SyncReplica } from './replica.ts';

export type NoteVersionPayload = Extract<RecordOperation, { kind: 'note.version' }>;

export interface NoteVersionView {
  readonly payloadSha256: string;
  /** Exact original/quoted segments, source positions and declared bases; no source admission. */
  readonly payload: NoteVersionPayload;
  /** Equal content can have several independent provenance references. None is discarded. */
  readonly operationRefs: readonly OperationRef[];
}

export interface NoteView {
  readonly noteId: string;
  /** Every unsuperseded content choice, in the existing projection's order. */
  readonly headVersions: readonly NoteVersionView[];
  /** Complete core state, including non-head active refs, conflicts, tombstones and restores. */
  readonly projection: EntityProjection;
}

const viewCache = new WeakMap<SyncReplica, readonly NoteView[]>();

/**
 * Read the complete note projection of a planner-owned in-process replica.
 * The caller supplies the current handle; this function does not establish
 * account/session authority, source admission, persistence or scheduling.
 * Serialized replicas must first be rebuilt through the existing core planner.
 *
 * The empty receive plan validates the handle and its current binding before
 * reusing its immutable journal projection. No pending/quarantined arrival becomes visible here, and
 * no timestamp or version label selects a winner. Hidden/restore-only notes
 * remain in the result with empty headVersions and their complete core state.
 */
export function readNoteViews(replica: SyncReplica): readonly NoteView[] {
  const checked = planReceive(replica, {
    // The planner checks its WeakSet before this local getter reads policy.
    // Forged or proxy lookalikes cannot run their own getters before rejection.
    get binding() {
      return replica.policy.binding;
    },
    operations: [],
  }).next;
  const cached = viewCache.get(checked);
  if (cached) return cached;
  const operations = viewOperationIndex(checked);
  const views: NoteView[] = [];
  for (const projection of checked.projection.entities) {
    if (projection.target.kind !== 'note') continue;
    const versions = new Map<
      string,
      {
        payloadSha256: string;
        payload: NoteVersionPayload;
        operationRefs: OperationRef[];
      }
    >();
    for (const reference of projection.heads) {
      const operation = operations.get(reference.opId);
      if (
        !operation ||
        operation.payload.kind !== 'note.version' ||
        operation.payload.noteId !== projection.target.id
      ) {
        throw new SyncValidationError('invalid-replica');
      }
      const existing = versions.get(operation.payloadSha256);
      if (existing) existing.operationRefs.push(reference);
      else {
        versions.set(operation.payloadSha256, {
          payloadSha256: operation.payloadSha256,
          payload: operation.payload,
          operationRefs: [reference],
        });
      }
    }
    views.push({
      noteId: projection.target.id,
      headVersions: [...versions.values()],
      projection,
    });
  }
  const result = immutable(views);
  viewCache.set(checked, result);
  return result;
}
