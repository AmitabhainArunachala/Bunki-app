export { SyncValidationError, type SyncErrorCode, type DeepReadonly } from './common.ts';
export {
  SYNC_SCHEMA_VERSION,
  SYNC_SCHEMA_EPOCH,
  SYNC_MERGE_POLICY,
  ASSESSMENT_SYNC_SCHEMA_VERSION,
  createSyncOperation,
  createSyncOperationV2,
  parseSyncOperation,
  parseAnySyncOperation,
  operationReference,
  parseActorIdentity,
  parseSyncBinding,
  parseReadingAnchor,
  parseSourceReferencePayload,
  type SyncScope,
  type SyncBinding,
  type ActorIdentity,
  type OperationRef,
  type EntityTarget,
  type ReadingAnchor,
  type SourceReferencePayload,
  type RecordOperation,
  type SyncOperationInput,
  type SyncOperation,
  type SyncOperationV2,
  type SyncOperationV2Input,
  type LegacySyncOperation,
  type LegacyRecordOperation,
} from './operations.ts';
export * from './assessment-operations-v2.ts';
export * from './assessment-views-v2.ts';
export {
  createReplica,
  planReceive,
  type ReplicaPolicy,
  type PendingOperation,
  type QuarantinedOperation,
  type ContentIdentityConflict,
  type EntityProjection,
  type ReviewReconciliation,
  type SyncProjection,
  type SyncReplica,
  type ReceiveDelivery,
  type ReceivePlan,
} from './replica.ts';
export {
  readSourceReferenceViews,
  type SourceReferenceHeadView,
  type SourceReferenceView,
} from './source-reference-views.ts';
export {
  readExamAttemptViews,
  type ExamAttemptPayload,
  type ExamAttemptHeadView,
  type ExamAttemptView,
} from './exam-attempt-views.ts';
