import { inputHashOf } from '@bunki/ai/hash';
import { immutable } from './common.ts';
import type {
  AssessmentResultPayloadV2,
  LearningFollowupPayloadV2,
  LearningSuppressPayloadV2,
} from './assessment-operations-v2.ts';
import type { OperationRef } from './operations.ts';
import { planReceive, type EntityProjection, type SyncReplica } from './replica.ts';

export interface AssessmentResultHeadV2 {
  readonly payloadSha256: string;
  readonly payload: AssessmentResultPayloadV2;
  readonly operationRefs: readonly OperationRef[];
}
export interface AssessmentResultViewV2 {
  readonly attemptId: string;
  readonly headResults: readonly AssessmentResultHeadV2[];
  readonly projection: EntityProjection;
}
function checkedReplica(replica: SyncReplica) {
  return planReceive(replica, {
    get binding() {
      return replica.policy.binding;
    },
    operations: [],
  }).next;
}

/** Exact body-free observations only. This view does not authenticate editorial approval. */
export function readAssessmentResultViewsV2(
  replica: SyncReplica,
): readonly AssessmentResultViewV2[] {
  const checked = checkedReplica(replica);
  const operations = new Map(checked.operations.map((operation) => [operation.opId, operation]));
  const views: AssessmentResultViewV2[] = [];
  for (const projection of checked.projection.entities) {
    if (projection.target.kind !== 'exam-attempt') continue;
    const results = new Map<
      string,
      { payloadSha256: string; payload: AssessmentResultPayloadV2; operationRefs: OperationRef[] }
    >();
    for (const reference of projection.heads) {
      const operation = operations.get(reference.opId);
      if (operation?.payload.kind !== 'assessment.result/2') continue;
      const prior = results.get(operation.payloadSha256);
      if (prior) prior.operationRefs.push(reference);
      else
        results.set(operation.payloadSha256, {
          payloadSha256: operation.payloadSha256,
          payload: operation.payload,
          operationRefs: [reference],
        });
    }
    views.push({ attemptId: projection.target.id, headResults: [...results.values()], projection });
  }
  return immutable(views);
}

export interface LearningFollowupHeadV2 {
  readonly payload: LearningFollowupPayloadV2;
  readonly operationRefs: readonly OperationRef[];
  readonly resultBinding: 'matched' | 'missing-or-hidden' | 'conflicting' | 'ineligible';
  /** User removals dominate concurrent or later automatic enrollments. */
  readonly suppressedActionIds: readonly string[];
}
export interface AssessmentLearningViewsV2 {
  readonly followups: readonly LearningFollowupHeadV2[];
  readonly suppressions: readonly LearningSuppressPayloadV2[];
  readonly scheduling: 'not-computed';
}

/** Join visible result revisions, follow-up intents and durable user suppression.
 * The host still resolves dictionary/card identity and applies its existing study queue.
 */
export function readAssessmentLearningViewsV2(replica: SyncReplica): AssessmentLearningViewsV2 {
  const checked = checkedReplica(replica);
  const results = readAssessmentResultViewsV2(checked);
  const operations = new Map(checked.operations.map((operation) => [operation.opId, operation]));
  const suppressions = new Map<string, LearningSuppressPayloadV2>();
  const followups = new Map<
    string,
    { payload: LearningFollowupPayloadV2; operationRefs: OperationRef[] }
  >();
  for (const projection of checked.projection.entities) {
    for (const reference of projection.heads) {
      const operation = operations.get(reference.opId);
      if (!operation) continue;
      if (operation.payload.kind === 'learning.suppress/2')
        suppressions.set(operation.payloadSha256, operation.payload);
      if (operation.payload.kind === 'learning.followup/2') {
        const prior = followups.get(operation.payloadSha256);
        if (prior) prior.operationRefs.push(reference);
        else
          followups.set(operation.payloadSha256, {
            payload: operation.payload,
            operationRefs: [reference],
          });
      }
    }
  }
  const suppressionList = [...suppressions.values()];
  const suppressedTargets = new Set(
    suppressionList.map((entry) => `${entry.target.t}:${entry.target.id}`),
  );
  return immutable({
    followups: [...followups.values()].map((entry): LearningFollowupHeadV2 => {
      const result = results.find((view) => view.attemptId === entry.payload.attemptId);
      const matched = result?.headResults.find(
        (head) =>
          head.payload.attemptRevisionId === entry.payload.attemptRevisionId &&
          inputHashOf(head.payload.form) === inputHashOf(entry.payload.form),
      );
      const evidenceMatches =
        matched &&
        entry.payload.evidence.every((evidence) =>
          matched.payload.items.some(
            (item) => inputHashOf(item.item) === inputHashOf(evidence.item),
          ),
        );
      const actionsEligible =
        matched &&
        entry.payload.actions.every((action) => {
          const evidence = entry.payload.evidence.find((entry) => entry.id === action.evidenceId);
          const item = matched.payload.items.find((entry) => entry.item.id === evidence?.item.id);
          return (
            item && (item.result === 'incorrect' || (item.result === 'correct' && item.flagged))
          );
        });
      const eligible =
        matched &&
        evidenceMatches &&
        actionsEligible &&
        (matched.payload.outcome === 'abandoned'
          ? entry.payload.status === 'stopped' && entry.payload.actions.length === 0
          : entry.payload.status !== 'stopped' &&
            entry.payload.evidence.length === matched.payload.items.length) &&
        (matched.payload.editorialAtStart.status !== 'unreviewed' ||
          entry.payload.actions.length === 0);
      return {
        ...entry,
        resultBinding: !matched
          ? 'missing-or-hidden'
          : result?.projection.requiresChoice
            ? 'conflicting'
            : !eligible
              ? 'ineligible'
              : 'matched',
        suppressedActionIds: entry.payload.actions
          .filter((action) => suppressedTargets.has(`${action.target.t}:${action.target.id}`))
          .map((action) => action.id),
      };
    }),
    suppressions: suppressionList,
    scheduling: 'not-computed',
  });
}
