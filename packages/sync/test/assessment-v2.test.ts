import { describe, expect, it } from 'vitest';
import { inputHashOf } from '@bunki/ai/hash';
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

describe('optional-when-true item assistance on assessment.result/2', () => {
  // Pinned from the literal payloads above by an independent SHA-256 over canonical
  // JSON (node:crypto, 2026-09-25). This change must not move one unassisted byte.
  const GOLDEN_RESULT = 'e90c61c88e37cdc781b7792ebd3e2342c01257cbf1c6116ed76882da2e253c31';
  const GOLDEN_FOLLOWUP = '1b8bde559d8c10f163cc04330286f9240177930eae90be897ba3af7ad7973c0a';
  const second = { ...item, id: 'item:two' };
  const assisted: AssessmentResultPayloadV2 = {
    ...result,
    mode: 'practice',
    conditions: ['assisted'],
    items: [
      {
        ...result.items[0]!,
        result: 'correct',
        response: { kind: 'selected', optionId: 'a' },
        assisted: true,
      },
      { ...result.items[0]!, item: second, subjects: ['grammar:other'] },
    ],
  };
  const assistedFollowup: LearningFollowupPayloadV2 = {
    ...followup,
    evidence: [
      { id: 'evidence:one', item },
      { id: 'evidence:two', item: second },
    ],
    actions: [
      followup.actions[0]!,
      {
        id: 'action:two',
        evidenceId: 'evidence:two',
        kind: 'enroll',
        target: { t: 'grammar', id: 'other' },
        status: 'pending',
      },
    ],
  };
  const { assisted: _flag, ...unflagged } = assisted.items[0]!;
  const withItem = (patch: Record<string, unknown>) => ({
    ...assisted,
    items: [{ ...unflagged, ...patch }, assisted.items[1]!],
  });

  it('keeps unassisted payload and operation bytes identical to the pinned golden', () => {
    const parsed = parseAssessmentOperationV2(result);
    if (parsed.kind !== 'assessment.result/2') throw new Error('Expected result');
    expect(inputHashOf(parsed)).toBe(GOLDEN_RESULT);
    expect('assisted' in parsed.items[0]!).toBe(false);
    expect(version2(result).payloadSha256).toBe(GOLDEN_RESULT);
    expect(inputHashOf(parseAssessmentOperationV2(followup))).toBe(GOLDEN_FOLLOWUP);
    expect(version2(followup, 'learning').payloadSha256).toBe(GOLDEN_FOLLOWUP);
    const intents = createAssessmentSyncIntentsV2({
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
    });
    expect(intents[0]!.payload).toEqual(result);
    expect(inputHashOf(intents[0]!.payload)).toBe(GOLDEN_RESULT);
  });

  it('accepts assisted: true only on an answered practice item under the assisted condition', () => {
    const parsed = parseAssessmentOperationV2(assisted);
    if (parsed.kind !== 'assessment.result/2') throw new Error('Expected result');
    expect(parsed.items[0]!.assisted).toBe(true);
    expect('assisted' in parsed.items[1]!).toBe(false);
    for (const value of [false, null, {}, 'true', 1])
      expect(() => parseAssessmentOperationV2(withItem({ assisted: value }))).toThrow();
    expect(() => parseAssessmentOperationV2({ ...assisted, mode: 'timed' })).toThrow();
    expect(() => parseAssessmentOperationV2({ ...assisted, conditions: [] })).toThrow();
    expect(() =>
      parseAssessmentOperationV2(
        withItem({ assisted: true, result: 'unanswered', response: { kind: 'unanswered' } }),
      ),
    ).toThrow();
    expect(() =>
      parseAssessmentOperationV2(withItem({ assisted: true, result: 'unscored' })),
    ).toThrow();
    // Attempt-level help without item attribution stays lawful.
    expect(parseAssessmentOperationV2(withItem({})).kind).toBe('assessment.result/2');
  });

  it('binds an assisted-correct action as matched, and as ineligible once only the flag is stripped', () => {
    const learning = version2(assistedFollowup, 'learning');
    expect(
      readAssessmentLearningViewsV2(receive(learning, version2(assisted))).followups[0]!
        .resultBinding,
    ).toBe('matched');
    const stripped = version2(parseAssessmentOperationV2(withItem({})));
    expect(
      readAssessmentLearningViewsV2(receive(learning, stripped)).followups[0]!.resultBinding,
    ).toBe('ineligible');
  });

  it('fails a new-peer receive batch closed when any payload carries a malformed flag', () => {
    // A lawful companion with its own actor identity, so the positive batch can be
    // received and the negative isolates the malformed payload, not an identity clash.
    const companion = version2(result, 'companion');
    const good = version2(assisted);
    expect(companion.opId).not.toBe(good.opId);
    expect(receive(companion, good).operations).toHaveLength(2);
    const payload = withItem({ assisted: false });
    const bad = { ...good, payload, payloadSha256: inputHashOf(payload) };
    expect(() => receive(bad)).toThrow(/invalid-input/u);
    expect(() => receive(companion, bad)).toThrow(/invalid-input/u);
  });

  it('builds the wire flag only from a marker consistent with the retained attempt', () => {
    const marker = {
      kind: 'explanation',
      at: Date.parse(NOW) + 1000,
      response: { kind: 'selected', optionId: 'a' },
    };
    const build = (
      first: Record<string, unknown>,
      attempt: Record<string, unknown> = {},
      rows: readonly object[] = assisted.items,
    ) =>
      createAssessmentSyncIntentsV2({
        form: { ...form, items: [item, second] },
        attempt: {
          attemptId: result.attemptId,
          revisionId: result.attemptRevisionId,
          form,
          scope: { accountId: 'account-a', learnerId: 'learner-a' },
          status: 'submitted',
          startedAt: Date.parse(NOW),
          endedAt: Date.parse(NOW) + 5000,
          mode: 'practice',
          priorExposure: 'unknown',
          conditions: ['assisted'],
          editorialAtStart: result.editorialAtStart,
          clock: { elapsedMs: 5000 },
          audio: [],
          answers: [
            { item, response: { kind: 'selected', optionId: 'a' }, flagged: false, ...first },
            { item: second, response: { kind: 'selected', optionId: 'b' }, flagged: false },
          ],
          ...attempt,
        },
        result: {
          attemptId: result.attemptId,
          attemptRevisionId: result.attemptRevisionId,
          form,
          status: 'submitted',
          items: rows.map((row, index) => ({
            ...row,
            itemId: (index === 0 ? item : second).id,
            itemRevisionId: (index === 0 ? item : second).revisionId,
          })),
        },
        followup: {
          id: 'followup:one',
          policy: 'learning/2',
          scope: { accountId: 'account-a', learnerId: 'learner-a' },
          attemptId: result.attemptId,
          attemptRevisionId: result.attemptRevisionId,
          form,
          status: 'complete',
          evidence: [
            {
              id: 'evidence:one',
              item: { id: item.id, revisionId: item.revisionId, sha256: item.sha256 },
            },
            {
              id: 'evidence:two',
              item: { id: second.id, revisionId: second.revisionId, sha256: second.sha256 },
            },
          ],
          actions: assistedFollowup.actions,
        },
      });
    // A marked answer must say it was reached; every negative below keeps reached:true
    // so it fails for its own named reason.
    const marked = (assistance: Record<string, unknown>) => ({ reached: true, assistance });
    const exam = build(marked(marker))[0]!.payload;
    if (exam.kind !== 'assessment.result/2') throw new Error('Expected result');
    expect(exam.items[0]!.assisted).toBe(true);
    expect('assisted' in exam.items[1]!).toBe(false);
    expect(JSON.stringify(exam)).not.toContain('explanation');
    // Old minimal unmarked inputs carry no reached field and stay valid.
    const unmarked = build({})[0]!.payload;
    if (unmarked.kind !== 'assessment.result/2') throw new Error('Expected result');
    expect(unmarked.items.some((row) => 'assisted' in row)).toBe(false);
    expect(() => build({ reached: false, assistance: marker })).toThrow(
      /result\.items\.assistance/u,
    );
    expect(() => build({ assistance: marker })).toThrow(/result\.items\.assistance/u);
    for (const broken of [
      { ...marker, kind: 'hint' },
      { ...marker, response: { kind: 'selected', optionId: 'b' } },
      { ...marker, at: Date.parse(NOW) + 6000 },
      { ...marker, at: Date.parse(NOW) - 1 },
      { ...marker, extra: true },
    ])
      expect(() => build(marked(broken))).toThrow();
    expect(() => build(marked(marker), { mode: 'timed' })).toThrow(/result\.items\.assistance/u);
    expect(() => build(marked(marker), { conditions: [] })).toThrow(/result\.items\.assistance/u);
    // An unanswered claim fails the assistance check itself, not a response mismatch.
    const blank = { kind: 'unanswered' };
    expect(() =>
      build({ response: blank, ...marked({ ...marker, response: blank }) }, {}, [
        { ...unflagged, result: 'unanswered', response: blank },
        assisted.items[1]!,
      ]),
    ).toThrow(/result\.items\.assistance/u);
  });

  // LITERALS.json eligibilityTruthTable (independent acceptance ledger, 2026-09-25),
  // run through the real received view binding rather than a copied predicate.
  it('binds exactly the eligible rows of the fixed truth table', () => {
    const table = [
      { outcome: 'incorrect', flagged: false, assisted: false, eligible: true },
      { outcome: 'incorrect', flagged: true, assisted: true, eligible: true },
      { outcome: 'correct', flagged: false, assisted: false, eligible: false },
      { outcome: 'correct', flagged: true, assisted: false, eligible: true },
      { outcome: 'correct', flagged: false, assisted: true, eligible: true },
      { outcome: 'correct', flagged: true, assisted: true, eligible: true },
      { outcome: 'unanswered', flagged: true, assisted: false, eligible: false },
      { outcome: 'not-reached', flagged: false, assisted: false, eligible: false },
    ] as const;
    for (const row of table) {
      const answered = row.outcome === 'correct' || row.outcome === 'incorrect';
      const payload = parseAssessmentOperationV2({
        ...result,
        mode: 'practice',
        conditions: row.assisted ? ['assisted'] : [],
        items: [
          {
            ...unflagged,
            result: row.outcome,
            response: answered
              ? { kind: 'selected', optionId: row.outcome === 'correct' ? 'a' : 'b' }
              : { kind: 'unanswered' },
            flagged: row.flagged,
            ...(row.assisted ? { assisted: true } : {}),
          },
        ],
      });
      const binding = readAssessmentLearningViewsV2(
        receive(version2(followup, 'learning'), version2(payload)),
      ).followups[0]!.resultBinding;
      expect({ ...row, binding }).toEqual({
        ...row,
        binding: row.eligible ? 'matched' : 'ineligible',
      });
    }
  });

  it('adds nothing on a duplicate receive of the assisted pair', () => {
    const pair = [version2(assistedFollowup, 'learning'), version2(assisted)];
    const first = planReceive(createReplica(policy), { binding: policy.binding, operations: pair });
    const again = planReceive(first.next, { binding: policy.binding, operations: pair });
    expect(again.insert).toEqual([]);
    expect(again.duplicates).toHaveLength(2);
    expect(again.next.operations).toHaveLength(2);
    expect(readAssessmentLearningViewsV2(again.next).followups[0]!.resultBinding).toBe('matched');
  });
});
