/** Browser-only entry: never pull the native SQLite adapter into the app. */
export * from '../packages/persistence/src/replication/browser.ts';
export { encodeLocalJson } from '../packages/persistence/src/replication/json.ts';
export { readNoteViews } from '../packages/sync/src/note-views.ts';
export { readReadingViews } from '../packages/sync/src/reading-views.ts';
export { readSourceReferenceViews } from '../packages/sync/src/source-reference-views.ts';
export { readExamAttemptViews } from '../packages/sync/src/exam-attempt-views.ts';
export {
  createAssessmentSyncIntentsV2,
  createSyncOperationV2,
  parseAnySyncOperation,
  isAssessmentOperationV2,
  createLearningSuppressionIntentV2,
  createLearningFollowupRevisionIntentV2,
  readAssessmentResultViewsV2,
  readAssessmentLearningViewsV2,
} from '../packages/sync/src/index.ts';
export { recordOperationSchema } from '../packages/sync/src/operations.ts';
export { inputHashOf } from '../packages/ai/src/hash.ts';
export { parseSourceReferencePayload } from '../packages/sync/src/operations.ts';
export {
  createSyncOperation,
  operationReference,
  parseReadingAnchor,
} from '../packages/sync/src/operations.ts';
