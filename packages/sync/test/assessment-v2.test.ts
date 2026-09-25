import { describe, expect, it } from 'vitest';
import {
  createSyncOperationV2,
  parseSyncOperation,
  parseAnySyncOperation,
  operationReference,
  parseAssessmentOperationV2,
  readAssessmentResultViewsV2,
  readAssessmentLearningViewsV2,
  readExamAttemptViews,
  createReplica,
  planReceive,
  createAssessmentSyncIntentsV2,
  createLearningFollowupRevisionIntentV2,
  type AssessmentResultPayloadV2,
  type LearningFollowupPayloadV2,
  type RecordOperation,
} from '../src/index.ts';
import { HASH, NOW, policy, op, exam, permutations } from './fixtures.ts';

const form = { kind: 'form' as const, id: 'form:n2', revisionId: 'form:revision', sha256: HASH };
const item = { kind: 'item' as const, id: 'item:one', revisionId: 'item:revision', sha256: HASH };
const result: AssessmentResultPayloadV2 = {
  kind: 'assessment.result/2',
  attemptId: 'attempt:one',
  attemptRevisionId: 'attempt:terminal',
  generation: null,
  form,
  outcome: 'submitted',
  startedAt: NOW,
  endedAt: NOW,
  elapsedMs: 1000,
  mode: 'timed',
  priorExposure: 'unknown',
  conditions: ['clock-unverified'],
  editorialAtStart: {
    status: 'ai-reviewed-practice',
    policyVersion: 'fixture:policy',
    decisionRevisionIds: ['fixture:review'],
  },
  items: [
    {
      item,
      result: 'incorrect',
      response: { kind: 'selected', optionId: 'b' },
      skill: 'grammar',
      task: 'grammar-choice',
      subjects: ['grammar:node'],
      elapsedMs: 1000,
      flagged: false,
    },
  ],
  audio: [],
  officialScore: null,
  passPrediction: null,
};
const followup: LearningFollowupPayloadV2 = {
  kind: 'learning.followup/2',
  followupId: 'followup:one',
  generation: null,
  attemptId: result.attemptId,
  attemptRevisionId: result.attemptRevisionId,
  form,
  policyVersion: 'learning/2',
  status: 'complete',
  evidence: [{ id: 'evidence:one', item }],
  actions: [
    {
      id: 'action:one',
      evidenceId: 'evidence:one',
      kind: 'enroll',
      target: { t: 'grammar', id: 'node' },
      status: 'pending',
    },
  ],
};
function version2(payload: RecordOperation, deviceId = 'phone') {
  return createSyncOperationV2({
    format: 'kairo-sync-operation',
    v: 2,
    scope: { accountId: policy.binding.accountId, learnerId: policy.binding.learnerId },
    actor: { deviceId, incarnationId: 'install', sequence: 1 },
    predecessor: null,
    dependencies: [],
    schemaEpoch: 1,
    deletionEpoch: policy.deletionEpoch,
    mergePolicy: policy.mergePolicy,
    occurredAt: NOW,
    payload,
  });
}
const receive = (...operations: unknown[]) =>
  planReceive(createReplica(policy), { binding: policy.binding, operations }).next;

describe('versioned assessment sync, historical v1 remains strict', () => {
  it('round trips v2 but the old parser rejects it even after the new parser caches it', () => {
    const operation = version2(result);
    expect(parseAnySyncOperation(operation)).toEqual(operation);
    const cached = parseAnySyncOperation(operation);
    expect(() => parseSyncOperation(cached)).toThrow('unsupported-version');
    expect(() => parseSyncOperation(operation)).toThrow('unsupported-version');
    expect(() => parseAnySyncOperation({ ...operation, v: 3 })).toThrow('unsupported-version');
    expect(() => parseAnySyncOperation({ ...operation, v: 1 })).toThrow();
    expect(() => parseAnySyncOperation({ ...operation, payloadSha256: 'b'.repeat(64) })).toThrow(
      'payload-digest-mismatch',
    );
  });
  it('keeps v1 and v2 histories separate while sharing causal deletion of an attempt', () => {
    const old = op(exam(result.attemptId), 'old-phone');
    const current = version2(result);
    const replica = receive(old, current);
    expect(readExamAttemptViews(replica)[0]!.headAttempts[0]!.payload.kind).toBe('exam.attempt');
    expect(readAssessmentResultViewsV2(replica)[0]!.headResults[0]!.payload.kind).toBe(
      'assessment.result/2',
    );
    const deleted = op(
      {
        kind: 'entity.tombstone',
        target: { kind: 'exam-attempt', id: result.attemptId },
        reason: 'user-deleted',
      },
      'delete-device',
    );
    const hidden = receive(old, current, deleted);
    expect(readAssessmentResultViewsV2(hidden)[0]!.headResults).toEqual([]);
    expect(readExamAttemptViews(hidden)[0]!.headAttempts).toEqual([]);
  });
  it('requires the result to be visible before exposing follow-up as matched', () => {
    const learning = version2(followup, 'learning');
    expect(readAssessmentLearningViewsV2(receive(learning)).followups[0]!.resultBinding).toBe(
      'missing-or-hidden',
    );
    expect(
      readAssessmentLearningViewsV2(receive(learning, version2(result))).followups[0]!
        .resultBinding,
    ).toBe('matched');
    const changed = version2({ ...result, outcome: 'abandoned' }, 'conflict');
    expect(
      readAssessmentLearningViewsV2(receive(learning, version2(result), changed)).followups[0]!
        .resultBinding,
    ).toBe('conflicting');
  });
  it('user suppression wins across delivery orders without minting a review grade', () => {
    const suppression = version2(
      {
        kind: 'learning.suppress/2',
        suppressionId: 'suppress:one',
        generation: null,
        target: { t: 'grammar', id: 'node' },
        at: NOW,
        reason: 'removed',
        policyVersion: 'learning/2',
      },
      'remove',
    );
    for (const order of permutations([
      version2(result),
      version2(followup, 'learning'),
      suppression,
    ])) {
      const projection = readAssessmentLearningViewsV2(receive(...order));
      expect(projection.followups[0]!.suppressedActionIds).toEqual(['action:one']);
      expect(projection.scheduling).toBe('not-computed');
    }
  });
  it('cannot enroll from an abandoned, skipped or unreviewed result even with a claimed followup', () => {
    for (const invalid of [
      { ...result, outcome: 'abandoned' },
      {
        ...result,
        editorialAtStart: { status: 'unreviewed', policyVersion: null, decisionRevisionIds: [] },
      },
      {
        ...result,
        items: [{ ...result.items[0], result: 'unanswered', response: { kind: 'unanswered' } }],
      },
    ]) {
      const operation = version2(parseAssessmentOperationV2(invalid));
      expect(
        readAssessmentLearningViewsV2(receive(operation, version2(followup, 'learning')))
          .followups[0]!.resultBinding,
      ).toBe('ineligible');
    }
  });
  it('carries exact question identity while keeping suppression scoped to that target type', () => {
    const target = { t: 'question' as const, id: `assessment-question:${HASH}` };
    const payload = parseAssessmentOperationV2({
      ...followup,
      actions: [{ ...followup.actions[0], target }],
    });
    const enrollment = version2(payload, 'question-learning');
    expect(parseAnySyncOperation(enrollment)).toEqual(enrollment);
    expect(() => parseSyncOperation(enrollment)).toThrow('unsupported-version');
    const suppress = (t: 'question' | 'word') =>
      version2(
        {
          kind: 'learning.suppress/2',
          suppressionId: `suppress:${t}`,
          generation: null,
          target: { ...target, t },
          at: NOW,
          reason: 'removed',
          policyVersion: 'learning/2',
        },
        `remove-${t}`,
      );
    const otherType = readAssessmentLearningViewsV2(
      receive(version2(result), enrollment, suppress('word')),
    );
    expect(otherType.followups[0]!.resultBinding).toBe('matched');
    expect(otherType.followups[0]!.suppressedActionIds).toEqual([]);
    for (const order of permutations([version2(result), enrollment, suppress('question')])) {
      const view = readAssessmentLearningViewsV2(receive(...order));
      expect(view.followups[0]!.suppressedActionIds).toEqual(['action:one']);
      expect(view.scheduling).toBe('not-computed');
    }
    for (const id of [
      'question:one',
      'assessment-question:unbound',
      `assessment-question:${'g'.repeat(64)}`,
    ]) {
      expect(() =>
        parseAssessmentOperationV2({
          ...followup,
          actions: [{ ...followup.actions[0], target: { ...target, id } }],
        }),
      ).toThrow();
    }
    expect(() =>
      parseAssessmentOperationV2({
        ...followup,
        actions: [
          { ...followup.actions[0], target: { ...target, question: { prompt: 'private' } } },
        ],
      }),
    ).toThrow();
    const unreviewed = parseAssessmentOperationV2({
      ...result,
      editorialAtStart: { status: 'unreviewed', policyVersion: null, decisionRevisionIds: [] },
    });
    expect(
      readAssessmentLearningViewsV2(receive(version2(unreviewed), enrollment)).followups[0]!
        .resultBinding,
    ).toBe('ineligible');
  });
  it('carries derived sentence identity and suppression without copying source or cloze text', () => {
    const target = { t: 'sentence' as const, id: 'assessment-cloze:exact-item-and-policy' };
    const clozeFollowup = parseAssessmentOperationV2({
      ...followup,
      actions: [{ ...followup.actions[0], target }],
    });
    const suppression = parseAssessmentOperationV2({
      kind: 'learning.suppress/2',
      suppressionId: 'suppress:cloze',
      generation: null,
      target,
      at: NOW,
      reason: 'undo-auto-add',
      policyVersion: 'learning/2',
    });
    const projection = readAssessmentLearningViewsV2(
      receive(
        version2(result),
        version2(clozeFollowup, 'learning'),
        version2(suppression, 'remove'),
      ),
    );
    expect(projection.followups[0]!.resultBinding).toBe('matched');
    expect(projection.followups[0]!.suppressedActionIds).toEqual(['action:one']);
    expect(() =>
      parseAssessmentOperationV2({
        ...followup,
        actions: [{ ...followup.actions[0], target: { ...target, clozeText: 'private source' } }],
      }),
    ).toThrow();
  });
  it('deduplicates exact results and holds causal follow-up until predecessor arrives', () => {
    const first = version2(result);
    const { opId: _id, payloadSha256: _hash, ...input } = first;
    const second = createSyncOperationV2({
      ...input,
      actor: { ...first.actor, sequence: 2 },
      predecessor: operationReference(first),
      payload: followup,
    });
    const pending = receive(second);
    expect(pending.pending).toHaveLength(1);
    expect(readAssessmentLearningViewsV2(pending).followups).toEqual([]);
    const complete = planReceive(pending, { binding: policy.binding, operations: [first, first] });
    expect(complete.next.pending).toEqual([]);
    expect(complete.duplicates).toHaveLength(1);
    expect(readAssessmentLearningViewsV2(complete.next).followups[0]!.resultBinding).toBe(
      'matched',
    );
  });
  it('causally replaces pending mapping without turning enrichment into a conflicting head', () => {
    expect(parseAssessmentOperationV2(followup)).not.toHaveProperty('supersedes');
    const first = version2({ ...followup, status: 'pending-mapping', actions: [] }, 'first');
    const references = [operationReference(first)];
    const intent = createLearningFollowupRevisionIntentV2(followup, references);
    expect(intent.dependencies).toEqual(references);
    const enriched = version2(intent.payload, 'enriched');
    expect(receive(enriched).pending).toHaveLength(1);
    for (const order of permutations([version2(result), first, enriched])) {
      const projection = readAssessmentLearningViewsV2(receive(...order));
      expect(projection.followups).toHaveLength(1);
      expect(projection.followups[0]!.resultBinding).toBe('matched');
      expect(projection.followups[0]!.payload.actions).toEqual(followup.actions);
      expect(projection.followups[0]!.operationRefs).toEqual([operationReference(enriched)]);
    }
    expect(() =>
      createLearningFollowupRevisionIntentV2(followup, [...references, ...references]),
    ).toThrow();
    expect(() => createLearningFollowupRevisionIntentV2(result, references)).toThrow();
    const wrongTarget = version2(
      createLearningFollowupRevisionIntentV2({ ...followup, followupId: 'other' }, references)
        .payload,
      'forged',
    );
    expect(receive(wrongTarget, first).quarantined).toHaveLength(1);
    const wrongKind = version2(
      createLearningFollowupRevisionIntentV2(followup, [operationReference(version2(result))])
        .payload,
      'forged-kind',
    );
    expect(receive(wrongKind, version2(result)).quarantined).toHaveLength(1);
  });
  it('rejects hidden body fields, fake official scores and duplicate outcomes', () => {
    expect(() => parseAssessmentOperationV2({ ...result, officialScore: 180 })).toThrow();
    expect(() =>
      parseAssessmentOperationV2({ ...result, questionText: 'Do not transmit content' }),
    ).toThrow();
    expect(() =>
      parseAssessmentOperationV2({ ...result, items: [result.items[0], result.items[0]] }),
    ).toThrow();
    expect(() => parseAssessmentOperationV2({ ...followup, status: 'stopped' })).toThrow();
    expect(() =>
      parseAssessmentOperationV2({
        ...followup,
        actions: [{ ...followup.actions[0], evidenceId: 'missing' }],
      }),
    ).toThrow();
  });
  it('builds two body-free intents only from a matching completed owned attempt', () => {
    const source = {
      form: { ...form, items: [item] },
      attempt: {
        attemptId: result.attemptId,
        revisionId: result.attemptRevisionId,
        form,
        scope: { accountId: 'account-a', learnerId: 'learner-a' },
        status: 'submitted',
        startedAt: Date.parse(NOW),
        endedAt: Date.parse(NOW),
        mode: result.mode,
        priorExposure: result.priorExposure,
        conditions: result.conditions,
        editorialAtStart: result.editorialAtStart,
        clock: { elapsedMs: 1000 },
        audio: [],
        answers: [{ item, response: result.items[0]!.response, flagged: false }],
      },
      result: {
        attemptId: result.attemptId,
        attemptRevisionId: result.attemptRevisionId,
        form,
        status: 'submitted',
        items: [{ ...result.items[0], itemId: item.id, itemRevisionId: item.revisionId }],
      },
      followup: {
        id: followup.followupId,
        policy: followup.policyVersion,
        scope: { accountId: 'account-a', learnerId: 'learner-a' },
        attemptId: followup.attemptId,
        attemptRevisionId: followup.attemptRevisionId,
        form,
        status: 'pending-review',
        evidence: [
          {
            id: 'evidence:one',
            item: { id: item.id, revisionId: item.revisionId, sha256: item.sha256 },
          },
        ],
        actions: [],
      },
    };
    const questionTarget = { t: 'question', id: `assessment-question:${HASH}` };
    const questionIntent = createAssessmentSyncIntentsV2({
      ...source,
      followup: {
        ...source.followup,
        status: 'complete',
        actions: [
          {
            id: 'action:question',
            evidenceId: 'evidence:one',
            kind: 'enroll',
            target: {
              ...questionTarget,
              label: 'local label',
              question: { prompt: 'private question body' },
            },
            status: 'added',
          },
        ],
      },
    })[1]!.payload;
    expect(questionIntent.kind).toBe('learning.followup/2');
    if (questionIntent.kind !== 'learning.followup/2') throw new Error('Expected followup');
    expect(questionIntent.actions[0]!.target).toEqual(questionTarget);
    expect(JSON.stringify(questionIntent)).not.toContain('private question body');
    expect(JSON.stringify(questionIntent)).not.toContain('local label');
    const intents = createAssessmentSyncIntentsV2(source);
    expect(intents.map((intent) => intent.payload.kind)).toEqual([
      'assessment.result/2',
      'learning.followup/2',
    ]);
    expect(() =>
      createAssessmentSyncIntentsV2({
        ...source,
        attempt: { ...source.attempt, status: 'in-progress' },
      }),
    ).toThrow();
    expect(() =>
      createAssessmentSyncIntentsV2({
        ...source,
        followup: { ...source.followup, scope: { accountId: 'other', learnerId: 'other' } },
      }),
    ).toThrow();
  });
});
