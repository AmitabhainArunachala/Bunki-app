import { canonicalJson } from '@bunki/domain/canonical-json';
import { describe, expect, it } from 'vitest';

import {
  createReplica,
  operationReference,
  parseSyncOperation,
  planReceive,
  readExamAttemptViews,
  SyncValidationError,
  type ExamAttemptPayload,
  type ExamAttemptView,
  type RecordOperation,
  type SyncReplica,
} from '../src/index.ts';
import {
  exam,
  HASH,
  merged,
  nextOp,
  note,
  NOW,
  op,
  permutations,
  policy,
  receive,
  resume,
  review,
} from './fixtures.ts';

const ATTEMPT_ID = 'exam-1';
const OTHER_ATTEMPT_ID = 'exam-2';
const EXACT_TEXT = 'まだ書いている\r\n猫😀e\u0301とか\u3099。\n';

function attempt(overrides: Partial<ExamAttemptPayload> = {}): ExamAttemptPayload {
  const base = exam(ATTEMPT_ID);
  if (base.kind !== 'exam.attempt') throw new Error('Wrong attempt fixture');
  return {
    ...base,
    answers: [
      {
        itemId: 'question-1',
        itemVersionId: 'item-v1',
        response: { kind: 'choice', optionId: 'b' },
      },
      {
        itemId: 'question-2',
        itemVersionId: 'item-v2',
        response: { kind: 'text', text: EXACT_TEXT },
      },
      {
        itemId: 'question-3',
        itemVersionId: 'item-v1',
        response: { kind: 'no-response' },
      },
    ],
    ...overrides,
  };
}

function answersWithResponse(
  itemId: string,
  response: ExamAttemptPayload['answers'][number]['response'],
): ExamAttemptPayload['answers'] {
  return attempt().answers.map((answer) =>
    answer.itemId === itemId ? { ...answer, response } : answer,
  );
}

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const result = items[0];
  if (result === undefined) throw new Error('Expected one item');
  return result;
}

function view(replica: SyncReplica, attemptId = ATTEMPT_ID): ExamAttemptView {
  const result = readExamAttemptViews(replica).find((item) => item.attemptId === attemptId);
  if (!result) throw new Error('Missing exam attempt view');
  return result;
}

const deletion: Extract<RecordOperation, { kind: 'entity.tombstone' }> = {
  kind: 'entity.tombstone',
  target: { kind: 'exam-attempt', id: ATTEMPT_ID },
  reason: 'user-deleted',
};

describe('planner-owned exam attempt views', () => {
  it('returns no attempts for an empty journal or unrelated entities', () => {
    expect(readExamAttemptViews(createReplica(policy))).toEqual([]);
    const replica = merged(op(note()), op(resume(5), 'phone'), op(review(), 'tablet'));
    expect(readExamAttemptViews(replica)).toEqual([]);
    const withAttempt = receive(replica, op(attempt(), 'exam-device'));
    expect(only(readExamAttemptViews(withAttempt)).attemptId).toBe(ATTEMPT_ID);
    expect(withAttempt.projection.scheduling).toBe('not-computed');
  });

  it.each(['submitted', 'abandoned'] as const)(
    'preserves exact %s choices, text, unanswered items and declared timing without enrichment',
    (outcome) => {
      const payload = attempt({
        outcome,
        startedAt: NOW,
        endedAt: '2026-09-09T08:00:00.000Z',
        elapsedMs: 7250,
        interruptionCount: 3,
      });
      const operation = parseSyncOperation(op(payload));
      const replica = merged(operation);
      const result = view(replica);
      const head = only(result.headAttempts);
      expect(head.payload).toEqual(payload);
      expect(head.payload.answers[1]?.response).toEqual({ kind: 'text', text: EXACT_TEXT });
      expect(head.payloadSha256).toBe(operation.payloadSha256);
      expect(head.operationRefs).toEqual([operationReference(operation)]);
      expect(result.projection).toEqual(only(replica.projection.entities));
      expect(Object.keys(result).sort()).toEqual(['attemptId', 'headAttempts', 'projection']);
      expect(Object.keys(head).sort()).toEqual(['operationRefs', 'payload', 'payloadSha256']);
      expect(replica.projection.scheduling).toBe('not-computed');
      expect(replica.projection.reviewReconciliations).toEqual([]);
    },
  );

  it('groups equal content while retaining both independent refs through duplicate and reordered delivery', () => {
    const first = op(attempt());
    const copied = op(attempt(), 'phone', { occurredAt: '2099-01-01T00:00:00.000Z' });
    const expected = readExamAttemptViews(merged(first, copied));
    for (const order of permutations([first, copied])) {
      let replica = createReplica(policy);
      for (const operation of order) replica = receive(replica, operation, operation);
      expect(readExamAttemptViews(replica)).toEqual(expected);
      expect(replica.operations).toHaveLength(2);
    }
    const result = only(expected);
    const head = only(result.headAttempts);
    expect(head.payload).toEqual(first.payload);
    expect(head.operationRefs).toEqual(result.projection.heads);
    expect(head.operationRefs).toHaveLength(2);
    expect(head.operationRefs).toEqual(
      expect.arrayContaining([operationReference(first), operationReference(copied)]),
    );
    expect(result.projection.requiresChoice).toBe(false);
  });

  it('reads an already admitted journal larger than one delivery without losing operation references', () => {
    const operations = Array.from({ length: 1001 }, (_, index) => op(attempt(), `device-${index}`));
    const replica = receive(merged(...operations.slice(0, 1000)), ...operations.slice(1000));
    const result = view(replica);
    expect(only(result.headAttempts).operationRefs).toHaveLength(1001);
    expect(result.projection.heads).toHaveLength(1001);
    expect(result.projection.requiresChoice).toBe(false);
    expect(replica.operations).toHaveLength(1001);
  });

  const variants: readonly [string, Partial<ExamAttemptPayload>][] = [
    ['form ID', { form: { ...attempt().form, formId: 'different-form' } }],
    ['form version', { form: { ...attempt().form, versionId: 'form-v2' } }],
    ['form digest', { form: { ...attempt().form, sha256: 'b'.repeat(64) } }],
    ['outcome', { outcome: 'abandoned' }],
    ['declared start', { startedAt: '2026-09-09T08:00:00.000Z' }],
    ['declared end', { endedAt: '2099-01-01T00:00:00.000Z' }],
    ['elapsed duration', { elapsedMs: 1 }],
    ['interruption count', { interruptionCount: 1 }],
    ['empty response list', { answers: [] }],
    ['response order', { answers: [...attempt().answers].reverse() }],
    [
      'choice',
      {
        answers: answersWithResponse('question-1', { kind: 'choice', optionId: 'c' }),
      },
    ],
    [
      'item version',
      {
        answers: attempt().answers.map((answer) =>
          answer.itemId === 'question-1' ? { ...answer, itemVersionId: 'item-v2' } : answer,
        ),
      },
    ],
    [
      'Unicode text bytes',
      {
        answers: answersWithResponse('question-2', {
          kind: 'text',
          text: EXACT_TEXT.normalize('NFC'),
        }),
      },
    ],
  ];

  it.each(variants)(
    'keeps a different %s as a complete alternative under the same ID',
    (_, change) => {
      const first = op(attempt());
      const different = op(attempt(change), 'phone');
      const replica = merged(different, first);
      const result = view(replica);
      expect(result.headAttempts).toHaveLength(2);
      expect(result.headAttempts.map((head) => canonicalJson(head.payload)).sort()).toEqual(
        [first.payload, different.payload].map(canonicalJson).sort(),
      );
      expect(result.headAttempts.every((head) => head.operationRefs.length === 1)).toBe(true);
      expect(result.projection.requiresChoice).toBe(true);
      expect(replica.projection.scheduling).toBe('not-computed');
    },
  );

  it('does not treat a later causal event as an implicit replacement of immutable responses', () => {
    const first = op(attempt());
    const later = nextOp(first, attempt({ elapsedMs: 1, answers: [] }));
    const result = view(merged(later, first));
    expect(result.headAttempts).toHaveLength(2);
    expect(result.projection.versions).toEqual(result.projection.heads);
    expect(result.projection.requiresChoice).toBe(true);
  });

  it('preserves independent attempts and leaves the sibling unchanged when one is deleted', () => {
    const first = op(attempt());
    const sibling = op(attempt({ attemptId: OTHER_ATTEMPT_ID }), 'phone');
    const replica = merged(sibling, first);
    expect(readExamAttemptViews(replica).map((result) => result.attemptId)).toEqual([
      ATTEMPT_ID,
      OTHER_ATTEMPT_ID,
    ]);
    const next = receive(replica, nextOp(first, deletion));
    expect(view(next).headAttempts).toEqual([]);
    expect(view(next, OTHER_ATTEMPT_ID)).toEqual(view(replica, OTHER_ATTEMPT_ID));
  });

  it('keeps missing predecessors and dependencies invisible until their actual operations arrive', () => {
    const first = op(attempt());
    const later = nextOp(first, attempt({ answers: [] }));
    const dependency = op(note(), 'notes');
    const other = op(attempt({ attemptId: OTHER_ATTEMPT_ID }), 'phone', {
      dependencies: [operationReference(dependency)],
    });
    const pending = merged(later, other);
    expect(pending.pending).toHaveLength(2);
    expect(readExamAttemptViews(pending)).toEqual([]);
    const partial = receive(pending, first);
    expect(partial.pending).toHaveLength(1);
    expect(view(partial).headAttempts).toHaveLength(2);
    expect(readExamAttemptViews(partial)).toHaveLength(1);
    const complete = receive(partial, dependency);
    expect(complete.pending).toEqual([]);
    expect(readExamAttemptViews(complete)).toHaveLength(2);
    expect(readExamAttemptViews(pending)).toEqual([]);
  });

  it('excludes broken-reference content and quarantined descendants from visible response history', () => {
    const first = op(attempt());
    const broken = op(attempt({ answers: [] }), 'mac', {
      actor: { ...first.actor, sequence: 2 },
      predecessor: { opId: first.opId, sha256: HASH },
    });
    const descendant = nextOp(broken, attempt({ outcome: 'abandoned' }));
    const pending = merged(descendant, broken);
    expect(pending.pending).toHaveLength(2);
    expect(readExamAttemptViews(pending)).toEqual([]);
    const replica = receive(pending, first);
    expect(replica.quarantined).toHaveLength(2);
    expect(replica.quarantined).toEqual(
      expect.arrayContaining([
        { operation: operationReference(broken), reason: 'causal-reference-conflict' },
        { operation: operationReference(descendant), reason: 'quarantined-dependency' },
      ]),
    );
    expect(only(view(replica).headAttempts).operationRefs).toEqual([operationReference(first)]);
    expect(replica.operations).toHaveLength(3);
  });

  it('preserves tombstones across stale backup content and future-clock responses', () => {
    const first = op(attempt());
    const tombstone = nextOp(first, deletion);
    const future = op(attempt({ endedAt: '2099-01-01T00:00:00.000Z' }), 'phone');
    const replica = receive(merged(first, tombstone), JSON.parse(canonicalJson(first)), future);
    const result = view(replica);
    expect(result.headAttempts).toEqual([]);
    expect(result.projection.heads).toEqual([]);
    expect(result.projection.versions).toEqual([]);
    expect(result.projection.tombstones).toEqual([operationReference(tombstone)]);
    expect(replica.projection.suppressed).toEqual(
      expect.arrayContaining([operationReference(first), operationReference(future)]),
    );
    expect(replica.operations).toHaveLength(3);
  });

  it('retains tombstone-only and restore-only state without recovering suppressed response bytes', () => {
    const first = op(attempt(), 'phone');
    const tombstone = op(deletion);
    const restore = nextOp(tombstone, {
      kind: 'entity.restore',
      target: deletion.target,
      tombstones: [operationReference(tombstone)],
      reason: 'Explicit restore',
    });
    expect(view(merged(tombstone)).headAttempts).toEqual([]);
    const pending = merged(restore);
    expect(readExamAttemptViews(pending)).toEqual([]);
    const replica = receive(pending, first, tombstone);
    const result = view(replica);
    expect(result.headAttempts).toEqual([]);
    expect(result.projection.versions).toEqual([]);
    expect(result.projection.tombstones).toEqual([operationReference(tombstone)]);
    expect(result.projection.activeRestoreGenerations).toEqual([operationReference(restore)]);
    expect(replica.projection.suppressed).toContainEqual(operationReference(first));
  });

  it('requires explicit generation content and preserves deletion across reordered restoration', () => {
    const first = op(attempt());
    const tombstone = nextOp(first, deletion);
    const restore = op(
      {
        kind: 'entity.restore',
        target: deletion.target,
        tombstones: [operationReference(tombstone)],
        reason: 'Explicit restore',
      },
      'phone',
    );
    const restored = nextOp(restore, attempt({ generation: operationReference(restore) }));
    const expected = readExamAttemptViews(merged(first, tombstone, restore, restored));
    for (const deliveries of permutations([first, tombstone, restore, restored])) {
      let replica = createReplica(policy);
      for (const operation of deliveries) replica = receive(replica, operation, operation);
      expect(readExamAttemptViews(replica)).toEqual(expected);
    }
    const result = only(expected);
    expect(only(result.headAttempts).payload).toEqual(restored.payload);
    expect(result.projection.tombstones).toEqual([operationReference(tombstone)]);
    expect(result.projection.activeRestoreGenerations).toEqual([operationReference(restore)]);
    const concurrentDelete = op(deletion, 'tablet');
    const hidden = view(merged(restored, first, concurrentDelete, restore, tombstone));
    expect(hidden.headAttempts).toEqual([]);
    expect(hidden.projection.activeRestoreGenerations).toEqual([]);
    expect(hidden.projection.tombstones).toHaveLength(2);
  });

  it('quarantines a non-restore or different-attempt generation instead of showing its responses', () => {
    const first = op(attempt());
    const falseGeneration = op(attempt({ generation: operationReference(first) }), 'phone');
    const otherTarget = { ...deletion.target, id: OTHER_ATTEMPT_ID };
    const otherDelete = op({ ...deletion, target: otherTarget }, 'tablet');
    const otherRestore = nextOp(otherDelete, {
      kind: 'entity.restore',
      target: otherTarget,
      tombstones: [operationReference(otherDelete)],
      reason: 'Restore a different attempt',
    });
    const wrongGeneration = op(attempt({ generation: operationReference(otherRestore) }), 'fourth');
    const replica = merged(wrongGeneration, otherRestore, first, falseGeneration, otherDelete);
    expect(replica.quarantined).toHaveLength(2);
    expect(replica.quarantined.every((entry) => entry.reason === 'causal-reference-conflict')).toBe(
      true,
    );
    expect(only(view(replica).headAttempts).payload).toEqual(first.payload);
    expect(view(replica, OTHER_ATTEMPT_ID).headAttempts).toEqual([]);
  });

  it('retains concurrent active restore generations as distinct choices, never one selected sitting', () => {
    const tombstone = op(deletion);
    const restorePayload: Extract<RecordOperation, { kind: 'entity.restore' }> = {
      kind: 'entity.restore',
      target: deletion.target,
      tombstones: [operationReference(tombstone)],
      reason: 'Explicit restore',
    };
    const firstRestore = op(restorePayload, 'phone');
    const otherRestore = op(restorePayload, 'tablet');
    const firstContent = nextOp(
      firstRestore,
      attempt({ generation: operationReference(firstRestore) }),
    );
    const otherContent = nextOp(
      otherRestore,
      attempt({ generation: operationReference(otherRestore) }),
    );
    const result = view(merged(otherContent, firstContent, otherRestore, firstRestore, tombstone));
    expect(result.headAttempts).toHaveLength(2);
    expect(result.projection.requiresChoice).toBe(true);
    expect(result.projection.activeRestoreGenerations).toEqual(
      expect.arrayContaining([operationReference(firstRestore), operationReference(otherRestore)]),
    );
    expect(result.projection.activeRestoreGenerations).toHaveLength(2);
    expect(result.projection.tombstones).toEqual([operationReference(tombstone)]);
  });

  it('keeps ownership, session and epoch refusal outside any validated payload shortcut', () => {
    const replica = merged(op(attempt()));
    const before = canonicalJson(replica);
    for (const scope of [
      { accountId: 'foreign', learnerId: policy.binding.learnerId },
      { accountId: policy.binding.accountId, learnerId: 'foreign' },
    ]) {
      const foreign = parseSyncOperation(op(attempt(), 'phone', { scope }));
      operationReference(foreign);
      expect(() => receive(replica, foreign)).toThrow(
        expect.objectContaining({ code: 'ownership-mismatch' }),
      );
    }
    expect(() =>
      planReceive(replica, {
        binding: { ...policy.binding, sessionId: 'stale' },
        operations: [parseSyncOperation(op(attempt(), 'phone'))],
      }),
    ).toThrow(expect.objectContaining({ code: 'stale-session' }));
    expect(() => receive(replica, op(attempt(), 'phone', { deletionEpoch: 2 }))).toThrow(
      expect.objectContaining({ code: 'epoch-mismatch' }),
    );
    expect(canonicalJson(replica)).toBe(before);
    expect(view(replica).headAttempts).toHaveLength(1);
  });

  it('returns a deeply frozen snapshot while later plans leave the prior snapshot unchanged', () => {
    const first = op(attempt());
    const replica = merged(first, op(attempt(), 'phone'));
    const before = canonicalJson(replica);
    const results = readExamAttemptViews(replica);
    const frozenBefore = canonicalJson(results);
    const result = only(results);
    const head = only(result.headAttempts);
    const objects: unknown[] = [results];
    while (objects.length) {
      const object = objects.pop();
      if (object === null || typeof object !== 'object') continue;
      expect(Object.isFrozen(object)).toBe(true);
      objects.push(...Object.values(object));
    }
    expect(Reflect.set(head.payload.form, 'versionId', 'latest')).toBe(false);
    expect(Reflect.set(only(head.payload.answers.slice(1, 2)).response, 'text', 'changed')).toBe(
      false,
    );
    expect(Reflect.set(head.operationRefs, '0', { opId: HASH, sha256: HASH })).toBe(false);
    expect(Reflect.deleteProperty(result.projection, 'tombstones')).toBe(false);
    expect(view(receive(replica, nextOp(first, deletion))).headAttempts).toEqual([]);
    expect(canonicalJson(results)).toBe(frozenBefore);
    expect(canonicalJson(replica)).toBe(before);
    expect(readExamAttemptViews(replica)).toEqual(results);
  });

  it('rejects forged, serialized, getter and proxy handles before accessing their properties', () => {
    const replica = merged(op(attempt()));
    let reads = 0;
    const getterBearing = {
      get policy() {
        reads += 1;
        throw new Error('policy must not be read');
      },
      get operations() {
        reads += 1;
        throw new Error('operations must not be read');
      },
      get projection() {
        reads += 1;
        throw new Error('projection must not be read');
      },
    };
    const proxy = new Proxy(replica, {
      get() {
        reads += 1;
        throw new Error('proxy must not be read');
      },
      getPrototypeOf() {
        reads += 1;
        throw new Error('proxy prototype must not be read');
      },
    });
    const revoked = Proxy.revocable(replica, {});
    revoked.revoke();
    for (const forged of [
      null,
      undefined,
      JSON.parse(canonicalJson(replica)),
      { ...replica },
      getterBearing,
      proxy,
      revoked.proxy,
    ]) {
      expect(() => readExamAttemptViews(forged as SyncReplica)).toThrow(
        expect.objectContaining({ code: 'invalid-replica' }),
      );
    }
    expect(reads).toBe(0);
    const rebuilt = receive(
      createReplica(policy),
      ...JSON.parse(canonicalJson(replica.operations)),
    );
    expect(readExamAttemptViews(rebuilt)).toEqual(readExamAttemptViews(replica));
  });
});

describe('existing portable attempt schema remains the only content boundary', () => {
  function rejectPayload(raw: unknown): void {
    expect(() => op(raw as RecordOperation)).toThrow(SyncValidationError);
    const envelope = { ...op(attempt()), payload: raw };
    expect(() => parseSyncOperation(envelope)).toThrow(
      expect.objectContaining({ code: 'invalid-input' }),
    );
    const replica = createReplica(policy);
    expect(() => receive(replica, envelope)).toThrow(SyncValidationError);
    expect(readExamAttemptViews(replica)).toEqual([]);
  }

  const rejectedClaims: readonly [string, unknown][] = [
    ['score', 100],
    ['correctness', 'correct'],
    ['mastery', 'mastered'],
    ['scheduling', { due: NOW }],
    ['editorial', { status: 'reviewed' }],
    ['admission', 'accepted'],
    ['fullAttempt', { mode: 'exam' }],
    ['questionBodies', ['untrusted question']],
    ['keys', ['b']],
    ['sourceUrl', 'https://example.invalid/form'],
    ['supersedes', []],
  ];

  it.each(rejectedClaims)(
    'refuses an added %s claim rather than exposing it as response history',
    (field, value) => {
      rejectPayload({ ...attempt(), [field]: value });
    },
  );

  it('refuses hidden form, item and response enrichment as well as an unsupported response kind', () => {
    const payload = attempt();
    rejectPayload({ ...payload, form: { ...payload.form, questions: ['invented prompt'] } });
    rejectPayload({
      ...payload,
      answers: payload.answers.map((answer) => ({ ...answer, correct: true })),
    });
    rejectPayload({
      ...payload,
      answers: [
        {
          itemId: 'question-1',
          itemVersionId: 'item-v1',
          response: { kind: 'choice', optionId: 'b', score: 1 },
        },
      ],
    });
    rejectPayload({
      ...payload,
      answers: [
        {
          itemId: 'question-1',
          itemVersionId: 'item-v1',
          response: { kind: 'ordered', optionIds: ['a', 'b'] },
        },
      ],
    });
  });

  it('keeps duplicate-item and aggregate JSON budget rejection before any view can be formed', () => {
    const payload = attempt();
    rejectPayload({ ...payload, answers: [...payload.answers, ...payload.answers] });
    const oversized = {
      ...payload,
      answers: Array.from({ length: 32 }, (_, index) => ({
        itemId: `question-${index}`,
        itemVersionId: 'item-v1',
        response: { kind: 'text', text: '字'.repeat(16_000) },
      })),
    };
    rejectPayload(oversized);
  });
});
