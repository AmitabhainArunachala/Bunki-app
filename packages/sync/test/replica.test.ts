import { canonicalJson } from '@bunki/domain/canonical-json';
import { describe, expect, it } from 'vitest';

import {
  createReplica,
  operationReference,
  planReceive,
  SyncValidationError,
  type EntityTarget,
  type RecordOperation,
  type SyncReplica,
} from '../src/index.ts';
import {
  exam,
  HASH,
  merged,
  nextOp,
  note,
  op,
  permutations,
  policy,
  receive,
  resume,
  review,
} from './fixtures.ts';

function entity(replica: SyncReplica, kind: EntityTarget['kind'], id: string) {
  const value = replica.projection.entities.find(
    (candidate) => candidate.target.kind === kind && candidate.target.id === id,
  );
  if (!value) throw new Error('missing test entity');
  return value;
}

function patch<T extends RecordOperation['kind']>(payload: RecordOperation, kind: T) {
  if (payload.kind !== kind) throw new Error('wrong fixture');
  return payload as Extract<RecordOperation, { kind: T }>;
}

describe('causal receiving and durable transaction plans', () => {
  it('deduplicates redelivery and never reports it as a new local change', () => {
    const operation = op(note());
    const before = merged(operation);
    const plan = planReceive(before, {
      binding: policy.binding,
      operations: [operation, operation],
    });
    expect(plan.insert).toEqual([]);
    expect(plan.newlyReady).toEqual([]);
    expect(plan.projectionChanged).toBe(false);
    expect(plan.duplicates).toEqual([operationReference(operation), operationReference(operation)]);
    expect(plan.next.operations).toHaveLength(1);
  });

  it('rejects same operation ID with different valid bytes, including metadata-only changes', () => {
    const first = op(note());
    const altered = op(note('note-1', 'v2', 'different text'));
    expect(altered.opId).toBe(first.opId);
    const before = merged(first);
    const original = canonicalJson(before);
    const innocent = op(note('unrelated'), 'third-device');
    for (const conflict of [
      altered,
      op(note(), 'mac', { occurredAt: '2026-09-09T01:00:00.000Z' }),
    ]) {
      expect(() => receive(before, innocent, conflict)).toThrow(
        expect.objectContaining({ code: 'identity-conflict' }),
      );
      expect(canonicalJson(before)).toBe(original);
    }
  });

  it('keeps an out-of-order chain pending until every predecessor is present', () => {
    const a = op(note('note-a'));
    const b = nextOp(a, note('note-b'));
    const c = nextOp(b, note('note-c'));
    let replica = merged(c);
    expect(replica.ready).toEqual([]);
    expect(replica.pending).toEqual([
      { operation: operationReference(c), waitingFor: [operationReference(b)] },
    ]);
    replica = receive(replica, b);
    expect(replica.ready).toEqual([]);
    expect(replica.pending).toHaveLength(2);
    const plan = planReceive(replica, { binding: policy.binding, operations: [a] });
    expect(plan.newlyReady).toHaveLength(3);
    expect(plan.next.pending).toEqual([]);
    expect(plan.next.operations.map((operation) => operation.opId)).toEqual([
      a.opId,
      b.opId,
      c.opId,
    ]);
  });

  it('converges over all permutations and duplicate deliveries of a causal/concurrent fixture', () => {
    const a = op(note('n', 'v1'));
    const base = patch(note('n', 'v2', 'mac edit'), 'note.version');
    const b = nextOp(a, { ...base, supersedes: [operationReference(a)] });
    const c = op(
      {
        ...base,
        versionId: 'v3',
        segments: [{ kind: 'original', text: 'phone edit' }],
        supersedes: [operationReference(a)],
      },
      'iphone',
    );
    const d = op(exam(), 'tablet');
    const expected = canonicalJson(merged(a, b, c, d));
    for (const order of permutations([a, b, c, d])) {
      let replica = createReplica(policy);
      for (const operation of order) replica = receive(replica, operation, operation);
      expect(canonicalJson(replica)).toBe(expected);
    }
  });

  it('rejects foreign accounts/profiles and callbacks from a previous login, before reading payloads', () => {
    const replica = createReplica(policy);
    for (const binding of [
      { ...policy.binding, accountId: 'account-b' },
      { ...policy.binding, learnerId: 'father' },
      { ...policy.binding, sessionId: 'expired-login' },
    ]) {
      let read = false;
      const delivery = {
        binding,
        get operations(): readonly unknown[] {
          read = true;
          throw new Error('must not read');
        },
      };
      expect(() => planReceive(replica, delivery)).toThrow(SyncValidationError);
      expect(read).toBe(false);
    }
    expect(() =>
      receive(
        replica,
        op(note(), 'iphone', { scope: { accountId: 'account-b', learnerId: 'learner-a' } }),
      ),
    ).toThrow(expect.objectContaining({ code: 'ownership-mismatch' }));
    expect(() =>
      receive(
        replica,
        op(note(), 'iphone', { scope: { accountId: 'account-a', learnerId: 'father' } }),
      ),
    ).toThrow(expect.objectContaining({ code: 'ownership-mismatch' }));
    expect(replica.operations).toEqual([]);
  });

  it('rejects old or future deletion epochs without discarding accepted data', () => {
    const before = merged(op(note()));
    for (const deletionEpoch of [2, 4]) {
      expect(() => receive(before, op(note('old-backup'), 'backup', { deletionEpoch }))).toThrow(
        expect.objectContaining({ code: 'epoch-mismatch' }),
      );
    }
    expect(before.operations).toHaveLength(1);
    expect(before.projection.entities).toHaveLength(1);
  });

  it('requires a current replica handle rather than accepting a copied backup-shaped state', () => {
    const replica = merged(op(note()));
    const copied = JSON.parse(JSON.stringify(replica)) as SyncReplica;
    expect(() => receive(copied, op(note('n2'), 'iphone'))).toThrow(
      expect.objectContaining({ code: 'invalid-replica' }),
    );
    const rebuilt = receive(createReplica(policy), ...replica.operations);
    expect(rebuilt).toEqual(replica);
  });

  it('quarantines a corrupt pending dependency when its genuine predecessor arrives', () => {
    const first = op(note('valid-note'));
    const bad = op(note('bad-note'), 'mac', {
      actor: { ...first.actor, sequence: 2 },
      predecessor: { opId: first.opId, sha256: HASH },
    });
    const descendant = nextOp(bad, note('dependent-note'));
    const before = merged(descendant, bad);
    expect(before.pending).toHaveLength(2);
    const after = receive(before, first);
    expect(after.ready).toEqual([operationReference(first)]);
    expect(after.operations).toHaveLength(3);
    expect(after.quarantined).toEqual(
      expect.arrayContaining([
        { operation: operationReference(bad), reason: 'causal-reference-conflict' },
        { operation: operationReference(descendant), reason: 'quarantined-dependency' },
      ]),
    );
    expect(after.pending).toEqual([]);
    expect(after.projection.entities.map((row) => row.target.id)).toEqual(['valid-note']);
    expect(merged(first, bad, descendant)).toEqual(after);
  });

  it('quarantines predecessor links to another actor or a skipped sequence', () => {
    const first = op(note('a'), 'mac');
    const badActor = op(note('b'), 'iphone', {
      actor: { deviceId: 'iphone', incarnationId: 'install-1', sequence: 2 },
      predecessor: operationReference(first),
    });
    const badSequence = op(note('c'), 'mac', {
      actor: { ...first.actor, sequence: 3 },
      predecessor: operationReference(first),
    });
    const replica = merged(first, badActor, badSequence);
    expect(replica.ready).toEqual([operationReference(first)]);
    expect(replica.quarantined).toHaveLength(2);
  });

  it('quarantines a cyclic corrupt dependency graph while accepting unrelated valid work', () => {
    const aIdentity = op(note('a'), 'actor-a');
    const bIdentity = op(note('b'), 'actor-b');
    const a = op(note('a'), 'actor-a', { dependencies: [{ opId: bIdentity.opId, sha256: HASH }] });
    const b = op(note('b'), 'actor-b', { dependencies: [{ opId: aIdentity.opId, sha256: HASH }] });
    const unrelated = op(note('c'), 'actor-c');
    const replica = merged(a, unrelated, b);
    expect(replica.ready).toEqual([operationReference(unrelated)]);
    expect(replica.quarantined).toHaveLength(2);
    expect(replica.quarantined.every((row) => row.reason === 'causal-cycle')).toBe(true);
  });

  it('retains more than a single delivery batch and rebuilds the complete journal after restart', () => {
    const operations = [];
    let prior = op(note('note-0'));
    operations.push(prior);
    for (let i = 1; i < 1005; i += 1) {
      prior = nextOp(prior, note(`note-${i}`));
      operations.push(prior);
    }
    let replica = merged(...operations.slice(500));
    expect(replica.ready).toEqual([]);
    replica = receive(replica, ...operations.slice(0, 500));
    expect(replica.operations).toHaveLength(1005);
    expect(replica.ready).toHaveLength(1005);
    expect(replica.projection.entities).toHaveLength(1005);
    let restarted = createReplica(policy);
    const saved = JSON.parse(JSON.stringify(replica.operations)) as unknown[];
    for (let i = 0; i < saved.length; i += 1000)
      restarted = receive(restarted, ...saved.slice(i, i + 1000));
    expect(restarted).toEqual(replica);
  });

  it('rejects oversize batches and non-array deliveries without partial mutation', () => {
    const replica = createReplica(policy);
    const operation = op(note());
    expect(() => receive(replica, ...new Array(1001).fill(operation))).toThrow(SyncValidationError);
    expect(() =>
      planReceive(replica, { binding: policy.binding, operations: {} as unknown[] }),
    ).toThrow(SyncValidationError);
    expect(replica.operations).toEqual([]);
  });
});

describe('versions, explicit resume intent and assessment facts', () => {
  it('preserves concurrent note versions until an explicit resolution cites both heads', () => {
    const base = op(note());
    const payload = patch(note(), 'note.version');
    const left = nextOp(base, {
      ...payload,
      versionId: 'left',
      segments: [{ kind: 'original', text: 'Mac edit' }],
      supersedes: [operationReference(base)],
    });
    const right = op(
      {
        ...payload,
        versionId: 'right',
        segments: [{ kind: 'original', text: 'iPhone edit' }],
        supersedes: [operationReference(base)],
      },
      'iphone',
    );
    const before = merged(base, left, right);
    expect(entity(before, 'note', 'note-1').heads).toHaveLength(2);
    expect(entity(before, 'note', 'note-1').requiresChoice).toBe(true);
    const resolution = nextOp(left, {
      ...payload,
      versionId: 'resolution',
      segments: [{ kind: 'original', text: 'Chosen combined text' }],
      supersedes: [operationReference(left), operationReference(right)],
    });
    const after = receive(before, resolution);
    expect(entity(after, 'note', 'note-1').heads).toEqual([operationReference(resolution)]);
    expect(entity(after, 'note', 'note-1').versions).toHaveLength(4);
    expect(after.operations).toHaveLength(4);
  });

  it('does not infer note replacement from causal knowledge alone', () => {
    const base = op(note());
    const later = nextOp(base, note('note-1', 'v2', 'new version without a replace claim'));
    expect(entity(merged(base, later), 'note', 'note-1').heads).toHaveLength(2);
  });

  it('retains conflicting immutable note-version identity claims without choosing an arrival winner', () => {
    const a = op(note());
    const b = op(note('note-1', 'version-1', 'different version bytes'), 'iphone');
    const after = receive(merged(a), b);
    expect(after.quarantined).toEqual([]);
    expect(entity(after, 'note', 'note-1').heads).toHaveLength(2);
    expect(entity(after, 'note', 'note-1').requiresChoice).toBe(true);
    expect(entity(after, 'note', 'note-1').identityConflicts).toEqual([
      {
        versionId: 'version-1',
        operations: after.ready,
      },
    ]);
    expect(merged(b, a)).toEqual(after);
  });

  it('a duplicated identical note version remains one choice and is replaced as that version', () => {
    const a = op(note());
    const duplicateVersion = op(note(), 'iphone');
    const edit = nextOp(a, {
      ...patch(note('note-1', 'v2', 'revision'), 'note.version'),
      supersedes: [operationReference(a)],
    });
    expect(entity(merged(a, duplicateVersion), 'note', 'note-1').requiresChoice).toBe(false);
    const row = entity(merged(a, duplicateVersion, edit), 'note', 'note-1');
    expect(row.heads).toEqual([operationReference(edit)]);
    expect(row.versions).toHaveLength(3);
    expect(row.identityConflicts).toEqual([]);
  });

  it('keeps changed source versions and diverging reading sessions as separate anchors', () => {
    const mac = op(resume(800), 'mac');
    const phone = op(
      { ...patch(resume(150, 'corrected-v2'), 'reading.resume'), sessionId: 'phone-session' },
      'iphone',
    );
    const replica = merged(mac, phone);
    const row = entity(replica, 'reading-position', 'source-1');
    expect(row.heads).toHaveLength(2);
    expect(row.requiresChoice).toBe(true);
    expect(replica.operations.map((operation) => operation.payload)).toEqual(
      expect.arrayContaining([mac.payload, phone.payload]),
    );
  });

  it('honors deliberate rereading at an earlier position despite a backwards device clock', () => {
    const far = op(resume(900));
    const reread = op(
      { ...patch(resume(40), 'reading.resume'), supersedes: [operationReference(far)] },
      'mac',
      {
        actor: { ...far.actor, sequence: 2 },
        predecessor: operationReference(far),
        occurredAt: '2026-09-01T00:00:00.000Z',
      },
    );
    expect(entity(merged(reread, far), 'reading-position', 'source-1').heads).toEqual([
      operationReference(reread),
    ]);
  });

  it('preserves an audio position against its exact source version without copying media', () => {
    const payload = patch(resume(0), 'reading.resume');
    const audio = op({
      ...payload,
      anchor: {
        ...payload.anchor,
        position: { kind: 'audio', positionMs: 42_500, durationMs: 180_000 },
      },
    });
    const replica = merged(audio);
    expect(entity(replica, 'reading-position', 'source-1').heads).toEqual([
      operationReference(audio),
    ]);
    expect(replica.operations[0]?.payload).toEqual(audio.payload);
    expect(() =>
      op({
        ...payload,
        anchor: {
          ...payload.anchor,
          position: { kind: 'audio', positionMs: 181_000, durationMs: 180_000 },
        },
      }),
    ).toThrow(SyncValidationError);
  });

  it('quarantines attempts to supersede a different source or note', () => {
    const base = op(note('note-a'));
    const forged = op(
      { ...patch(note('note-b', 'v2'), 'note.version'), supersedes: [operationReference(base)] },
      'iphone',
    );
    const reading = op(resume(0), 'reader');
    const wrongSource = op(
      {
        ...patch(resume(10), 'reading.resume'),
        anchor: {
          ...patch(resume(10), 'reading.resume').anchor,
          source: { sourceId: 'other-source', versionId: 'v1', sha256: HASH },
        },
        supersedes: [operationReference(reading)],
      },
      'reader-2',
    );
    expect(merged(forged, base, reading, wrongSource).quarantined).toHaveLength(2);
  });

  it('retains independent complete exam attempts without merging timers or answers', () => {
    const first = op(exam('exam-a'));
    const second = op(
      { ...patch(exam('exam-b'), 'exam.attempt'), elapsedMs: 6_000_000, interruptionCount: 1 },
      'iphone',
    );
    const replica = merged(first, second, first);
    expect(replica.operations).toHaveLength(2);
    expect(entity(replica, 'exam-attempt', 'exam-a').heads).toEqual([operationReference(first)]);
    expect(entity(replica, 'exam-attempt', 'exam-b').heads).toEqual([operationReference(second)]);
    expect(first.payload).toMatchObject({ elapsedMs: 5_400_000, interruptionCount: 0 });
    expect(second.payload).toMatchObject({ elapsedMs: 6_000_000, interruptionCount: 1 });
  });

  it('preserves conflicting copies of one exam attempt and requires attention', () => {
    const a = op(exam());
    const b = op({ ...patch(exam(), 'exam.attempt'), elapsedMs: 7_000_000 }, 'iphone');
    const row = entity(merged(a, b), 'exam-attempt', 'exam-1');
    expect(row.heads).toHaveLength(2);
    expect(row.requiresChoice).toBe(true);
  });

  it('retains both concurrent same-revision reviews, reports reconciliation and never computes FSRS', () => {
    const mac = op(review('review-mac'));
    const phone = op(review('review-phone'), 'iphone', { occurredAt: '1999-01-01T00:00:00.000Z' });
    const replica = merged(phone, mac, phone);
    expect(replica.operations).toHaveLength(2);
    expect(replica.projection.reviewReconciliations).toEqual([
      {
        cardId: 'card-1',
        scheduleRevisionId: 'schedule-1',
        attempts: replica.ready,
        reason: 'concurrent-schedule-revision',
      },
    ]);
    expect(replica.projection.scheduling).toBe('not-computed');
    expect(replica.operations.map((operation) => operation.payload)).toEqual(
      expect.arrayContaining([mac.payload, phone.payload]),
    );
  });

  it('also flags sequential reuse of an unchanged schedule revision instead of treating it as new spacing', () => {
    const first = op(review('review-a'));
    const second = nextOp(first, review('review-b'));
    const replica = merged(first, second);
    expect(replica.projection.reviewReconciliations[0]?.reason).toBe('reused-schedule-revision');
  });

  it('keeps separate revisions independent and preserves rejected/ungraded attempts', () => {
    const first = op(review('review-a', 'revision-a'));
    const raw = patch(review('review-b', 'revision-b'), 'review.attempt');
    const rejected = op(
      { ...raw, admission: 'rejected', reportedGrade: null, hintsUsed: 2, answerRevealed: true },
      'iphone',
    );
    const replica = merged(first, rejected);
    expect(replica.projection.reviewReconciliations).toEqual([]);
    expect(replica.operations).toHaveLength(2);
    expect(replica.projection.scheduling).toBe('not-computed');
  });
});

describe('remove-wins tombstones and intentional recovery', () => {
  const target = { kind: 'note', id: 'note-1' } as const;

  it('preserves deletion with concurrent offline edits and a stale third-device backup', () => {
    const original = op(note());
    const deletion = nextOp(original, { kind: 'entity.tombstone', target, reason: 'user-deleted' });
    const unrelated = op(note('unrelated-note', 'u1', 'phone work to keep'), 'iphone');
    const staleEdit = nextOp(
      unrelated,
      note('note-1', 'offline-edit', 'deleted content edited offline'),
    );
    const staleBackup = op(note('note-1', 'backup-copy', 'old backup re-import'), 'third-device');
    for (const order of permutations([deletion, unrelated, staleEdit, staleBackup])) {
      let replica = merged(original);
      for (const operation of order) replica = receive(replica, operation);
      replica = receive(replica, original, unrelated);
      expect(entity(replica, 'note', 'note-1').heads).toEqual([]);
      expect(entity(replica, 'note', 'note-1').tombstones).toEqual([operationReference(deletion)]);
      expect(entity(replica, 'note', 'unrelated-note').heads).toEqual([
        operationReference(unrelated),
      ]);
      expect(replica.operations).toHaveLength(5);
      expect(replica.projection.suppressed).toHaveLength(3);
    }
  });

  it('does not restore content merely because an edit knows about the deletion', () => {
    const deletion = op({ kind: 'entity.tombstone', target, reason: 'user-deleted' });
    const edit = nextOp(deletion, note('note-1', 'after-delete', 'still original generation'));
    expect(entity(merged(deletion, edit), 'note', 'note-1').heads).toEqual([]);
  });

  it('a colliding note version cannot quarantine a tombstone ancestor and resurrect another version', () => {
    const original = op(note());
    const concurrentEdit = op(note('note-1', 'other-version', 'offline edit'), 'iphone');
    const deletion = nextOp(original, { kind: 'entity.tombstone', target, reason: 'user-deleted' });
    const collision = op(
      note('note-1', 'version-1', 'conflicting bytes under old version name'),
      'third-device',
    );
    const before = merged(original, concurrentEdit, deletion);
    const after = receive(before, collision);
    expect(after.ready).toContainEqual(operationReference(deletion));
    expect(after.quarantined).toEqual([]);
    expect(entity(after, 'note', 'note-1').heads).toEqual([]);
    expect(entity(after, 'note', 'note-1').identityConflicts).toHaveLength(1);
    expect(after.operations).toHaveLength(4);
  });

  it('requires a current-epoch explicit restore plus a new content generation', () => {
    const original = op(note());
    const deletion = nextOp(original, { kind: 'entity.tombstone', target, reason: 'user-deleted' });
    const restore = nextOp(deletion, {
      kind: 'entity.restore',
      target,
      tombstones: [operationReference(deletion)],
      reason: 'Recover this note deliberately',
    });
    const restored = nextOp(restore, {
      ...patch(note('note-1', 'restored-v1', 'chosen recovered text'), 'note.version'),
      generation: operationReference(restore),
    });
    const withoutContent = merged(original, deletion, restore);
    expect(entity(withoutContent, 'note', 'note-1').heads).toEqual([]);
    const after = receive(withoutContent, restored);
    expect(entity(after, 'note', 'note-1').heads).toEqual([operationReference(restored)]);
    expect(after.projection.suppressed).toEqual([operationReference(original)]);
    expect(after.operations).toHaveLength(4);
    expect(() =>
      receive(
        after,
        op(
          {
            ...patch(note('note-1', 'old-epoch'), 'note.version'),
            generation: operationReference(restore),
          },
          'old-device',
          { deletionEpoch: 2 },
        ),
      ),
    ).toThrow(expect.objectContaining({ code: 'epoch-mismatch' }));
  });

  it('a concurrent second tombstone defeats a restore that has not acknowledged it', () => {
    const a = op({ kind: 'entity.tombstone', target, reason: 'user-deleted' });
    const b = op({ kind: 'entity.tombstone', target, reason: 'revoked' }, 'iphone');
    const restore = nextOp(a, {
      kind: 'entity.restore',
      target,
      tombstones: [operationReference(a)],
      reason: 'Recover',
    });
    const content = nextOp(restore, {
      ...patch(note('note-1', 'recovered'), 'note.version'),
      generation: operationReference(restore),
    });
    const before = merged(a, restore, content);
    expect(entity(before, 'note', 'note-1').heads).toHaveLength(1);
    const after = receive(before, b);
    expect(entity(after, 'note', 'note-1').heads).toEqual([]);
    expect(after.projection.suppressed).toEqual([operationReference(content)]);
    expect(merged(b, content, restore, a)).toEqual(after);
  });

  it('allows an explicit note resolution across two concurrent restored generations', () => {
    const deletion = op({ kind: 'entity.tombstone', target, reason: 'user-deleted' });
    const restoreA = nextOp(deletion, {
      kind: 'entity.restore',
      target,
      tombstones: [operationReference(deletion)],
      reason: 'Recover on Mac',
    });
    const restoreB = op(
      {
        kind: 'entity.restore',
        target,
        tombstones: [operationReference(deletion)],
        reason: 'Recover on phone',
      },
      'iphone',
    );
    const versionA = nextOp(restoreA, {
      ...patch(note('note-1', 'restore-a', 'Mac recovery'), 'note.version'),
      generation: operationReference(restoreA),
    });
    const versionB = nextOp(restoreB, {
      ...patch(note('note-1', 'restore-b', 'Phone recovery'), 'note.version'),
      generation: operationReference(restoreB),
    });
    const before = merged(deletion, restoreA, restoreB, versionA, versionB);
    expect(entity(before, 'note', 'note-1').heads).toHaveLength(2);
    const resolution = nextOp(versionA, {
      ...patch(note('note-1', 'resolved-restores', 'Chosen combined recovery'), 'note.version'),
      generation: operationReference(restoreA),
      supersedes: [operationReference(versionA), operationReference(versionB)],
    });
    const after = receive(before, resolution);
    expect(after.quarantined).toEqual([]);
    expect(entity(after, 'note', 'note-1').heads).toEqual([operationReference(resolution)]);
  });

  it('quarantines restores citing the wrong target or a non-tombstone', () => {
    const other = op({
      kind: 'entity.tombstone',
      target: { kind: 'note', id: 'other' },
      reason: 'user-deleted',
    });
    const ordinary = op(note('ordinary'), 'other-device');
    const wrongTarget = op(
      {
        kind: 'entity.restore',
        target,
        tombstones: [operationReference(other)],
        reason: 'invalid',
      },
      'restore-device',
    );
    const wrongKind = op(
      {
        kind: 'entity.restore',
        target,
        tombstones: [operationReference(ordinary)],
        reason: 'invalid',
      },
      'restore-device-2',
    );
    expect(merged(other, ordinary, wrongTarget, wrongKind).quarantined).toHaveLength(2);
  });

  it('quarantines content claiming a restore for another entity', () => {
    const deletion = op({ kind: 'entity.tombstone', target, reason: 'user-deleted' });
    const restore = nextOp(deletion, {
      kind: 'entity.restore',
      target,
      tombstones: [operationReference(deletion)],
      reason: 'Recover',
    });
    const crossTarget = op(
      { ...patch(note('other', 'new'), 'note.version'), generation: operationReference(restore) },
      'iphone',
    );
    const replica = merged(deletion, restore, crossTarget);
    expect(replica.quarantined).toEqual([
      { operation: operationReference(crossTarget), reason: 'causal-reference-conflict' },
    ]);
  });

  it('a review revocation stays archived and cannot be undone by redelivery', () => {
    const attempt = op(review());
    const revocation = nextOp(attempt, {
      kind: 'entity.tombstone',
      target: { kind: 'review-attempt', id: 'review-1' },
      reason: 'revoked',
    });
    const replica = receive(merged(attempt, revocation), attempt);
    expect(entity(replica, 'review-attempt', 'review-1').heads).toEqual([]);
    expect(replica.operations).toHaveLength(2);
    expect(replica.projection.scheduling).toBe('not-computed');
  });
});
