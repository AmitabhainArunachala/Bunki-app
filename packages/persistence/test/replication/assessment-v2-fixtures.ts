import type { AssessmentResultPayloadV2, LearningFollowupPayloadV2 } from '@bunki/sync';
import type { LocalCommit } from '../../src/replication/port.ts';
import { POLICY, WHEN } from './fixtures.ts';
const sha256 = 'a'.repeat(64);
const form = { kind: 'form' as const, id: 'form:n2', revisionId: 'form:revision', sha256 };
const item = { kind: 'item' as const, id: 'item:one', revisionId: 'item:revision', sha256 };
export function assessmentResultFixtureV2(): AssessmentResultPayloadV2 {
  return {
    kind: 'assessment.result/2',
    attemptId: 'assessment:one',
    attemptRevisionId: 'assessment:terminal',
    generation: null,
    form,
    outcome: 'submitted',
    startedAt: WHEN,
    endedAt: WHEN,
    elapsedMs: 500,
    mode: 'timed',
    priorExposure: 'unknown',
    conditions: [],
    editorialAtStart: {
      status: 'ai-reviewed-practice',
      policyVersion: 'synthetic:ai-policy',
      decisionRevisionIds: ['synthetic:review'],
    },
    items: [
      {
        item,
        result: 'incorrect',
        response: { kind: 'selected', optionId: 'b' },
        skill: 'grammar',
        task: 'grammar-choice',
        subjects: ['grammar:node'],
        elapsedMs: 500,
        flagged: false,
      },
    ],
    audio: [],
    officialScore: null,
    passPrediction: null,
  };
}
export function assessmentFollowupFixtureV2(): LearningFollowupPayloadV2 {
  return {
    kind: 'learning.followup/2',
    followupId: 'followup:one',
    generation: null,
    attemptId: 'assessment:one',
    attemptRevisionId: 'assessment:terminal',
    form,
    policyVersion: 'synthetic:learning-policy',
    status: 'complete',
    evidence: [{ id: 'evidence:one', item }],
    actions: [
      {
        id: 'action:one',
        evidenceId: 'evidence:one',
        kind: 'enroll',
        target: { t: 'grammar', id: 'node' },
        status: 'added',
      },
    ],
  };
}
export function assessmentLocalFixtureV2(): LocalCommit {
  return {
    changeId: 'assessment-finish',
    binding: POLICY.binding,
    expectedRevision: 0,
    occurredAt: WHEN,
    mutations: [
      {
        kind: 'put',
        collection: 'record',
        id: 'private-assessment',
        value: {
          attempt: 'assessment:one',
          rawPrivateQuestion: 'PRIVATE_QUESTION_BODY',
          taken: ['grammar:node'],
          scheduledReviewCount: 0,
        },
      },
    ],
    operations: [
      { payload: assessmentResultFixtureV2(), dependencies: [] },
      { payload: assessmentFollowupFixtureV2(), dependencies: [] },
    ],
  };
}
