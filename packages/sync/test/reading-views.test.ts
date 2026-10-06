import { canonicalJson } from '@bunki/domain/canonical-json';
import { describe, expect, it } from 'vitest';

import {
  createReplica,
  operationReference,
  type RecordOperation,
  type SyncReplica,
} from '../src/index.ts';
import {
  readReadingViews,
  type ReadingResumePayload,
  type ReadingView,
} from '../src/reading-views.ts';
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

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const first = items[0];
  if (first === undefined) throw new Error('Expected one item');
  return first;
}

function reading(start = 0, versionId = 'source-v1'): ReadingResumePayload {
  const payload = resume(start, versionId);
  if (payload.kind !== 'reading.resume') throw new Error('Expected reading fixture');
  return payload;
}

function view(replica: SyncReplica, sourceId = 'source-1'): ReadingView {
  const result = readReadingViews(replica).find((item) => item.sourceId === sourceId);
  if (!result) throw new Error(`Missing reading view: ${sourceId}`);
  return result;
}

const deletion: Extract<RecordOperation, { kind: 'entity.tombstone' }> = {
  kind: 'entity.tombstone',
  target: { kind: 'reading-position', id: 'source-1' },
  reason: 'user-deleted',
};

describe('readReadingViews', () => {
  it('returns no reading views for empty journals or other operation families', () => {
    expect(readReadingViews(createReplica(policy))).toEqual([]);
    const replica = merged(op(note()), op(exam(), 'phone'), op(review(), 'tablet'));
    expect(readReadingViews(replica)).toEqual([]);
    expect(replica.projection.entities).toHaveLength(3);
  });

  it('converges across reordered duplicate deliveries without choosing the furthest or latest clock', () => {
    const base = op(reading(900));
    const earlier = nextOp(base, {
      ...reading(40),
      supersedes: [operationReference(base)],
    });
    const concurrent = op({ ...reading(200), supersedes: [operationReference(base)] }, 'phone', {
      occurredAt: '2020-01-01T00:00:00.000Z',
    });
    const expected = readReadingViews(merged(base, earlier, concurrent));
    for (const deliveries of permutations([base, earlier, concurrent])) {
      let replica = createReplica(policy);
      for (const operation of deliveries) replica = receive(replica, operation, operation);
      expect(readReadingViews(replica)).toEqual(expected);
      expect(replica.operations).toHaveLength(3);
    }
    const result = only(expected);
    expect(result.projection.requiresChoice).toBe(true);
    expect(result.projection.versions).toHaveLength(3);
    expect(result.headResumes.map((head) => head.payload)).toEqual(
      expect.arrayContaining([earlier.payload, concurrent.payload]),
    );
    expect(result.headResumes).toHaveLength(2);
    expect(result.headResumes.flatMap((head) => head.operationRefs)).toEqual(
      result.projection.heads,
    );
  });

  it('honors an explicit earlier reread even when its clock moves backwards', () => {
    const far = op(reading(900));
    const reread = op({ ...reading(40), supersedes: [operationReference(far)] }, 'mac', {
      actor: { ...far.actor, sequence: 2 },
      predecessor: operationReference(far),
      occurredAt: '2026-09-01T00:00:00.000Z',
    });
    const result = view(merged(reread, far));
    expect(only(result.headResumes)).toEqual({
      payloadSha256: reread.payloadSha256,
      payload: reread.payload,
      operationRefs: [operationReference(reread)],
    });
    expect(result.projection.versions).toEqual([
      operationReference(far),
      operationReference(reread),
    ]);
    expect(result.projection.requiresChoice).toBe(false);
  });

  it('groups only identical payload digests and retains every independent operation reference', () => {
    const original = op(reading(140));
    const copied = op(reading(140), 'phone', { occurredAt: '2099-01-01T00:00:00.000Z' });
    const replica = merged(copied, original, original);
    const result = view(replica);
    expect(only(result.headResumes)).toEqual({
      payloadSha256: original.payloadSha256,
      payload: original.payload,
      operationRefs: result.projection.heads,
    });
    expect(only(result.headResumes).operationRefs).toEqual(
      expect.arrayContaining([operationReference(original), operationReference(copied)]),
    );
    expect(only(result.headResumes).operationRefs).toHaveLength(2);
    expect(result.projection.requiresChoice).toBe(false);
    expect(replica.operations).toHaveLength(2);

    const selected = nextOp(original, {
      ...reading(20),
      supersedes: [operationReference(original)],
    });
    const updated = view(receive(replica, selected));
    expect(only(updated.headResumes).payload).toEqual(selected.payload);
    expect(updated.projection.versions).toHaveLength(3);
    expect(updated.projection.heads).toEqual([operationReference(selected)]);
  });

  it('preserves different sessions, source version labels and source digests even at one position', () => {
    const base = reading(150);
    const variants: ReadingResumePayload[] = [
      base,
      { ...base, sessionId: 'another-reading-session' },
      reading(150, 'corrected-v2'),
      {
        ...base,
        anchor: { ...base.anchor, source: { ...base.anchor.source, sha256: 'b'.repeat(64) } },
      },
    ];
    const operations = variants.map((payload, index) => op(payload, `device-${index}`));
    const result = view(merged(...operations));
    expect(result.headResumes).toHaveLength(4);
    expect(new Set(result.headResumes.map((head) => head.payloadSha256)).size).toBe(4);
    expect(result.headResumes.map((head) => head.payload)).toEqual(
      expect.arrayContaining(variants),
    );
    expect(result.projection.requiresChoice).toBe(true);
    expect(result.projection.identityConflicts).toEqual([]);
  });

  it('does not treat a causal successor as explicit supersession', () => {
    const first = op(reading(50));
    const later = nextOp(first, reading(800));
    const result = view(merged(later, first));
    expect(result.headResumes).toHaveLength(2);
    expect(result.projection.requiresChoice).toBe(true);
    expect(result.projection.heads).toEqual([operationReference(first), operationReference(later)]);
  });

  it('keeps pending resumes invisible until their actual dependencies arrive', () => {
    const first = op(reading(100));
    const delayed = nextOp(first, {
      ...reading(20),
      supersedes: [operationReference(first)],
    });
    const pending = merged(delayed, delayed);
    expect(pending.pending).toHaveLength(1);
    expect(readReadingViews(pending)).toEqual([]);
    const released = receive(pending, first);
    expect(released.pending).toEqual([]);
    expect(only(view(released).headResumes).payload).toEqual(delayed.payload);
    expect(view(released).projection.versions).toHaveLength(2);
    expect(readReadingViews(pending)).toEqual([]);
    expect(pending.operations).toHaveLength(1);
  });

  it('excludes quarantined broken-reference resumes and their descendants', () => {
    const first = op(reading(100));
    const broken = op(reading(900), 'mac', {
      actor: { ...first.actor, sequence: 2 },
      predecessor: { opId: first.opId, sha256: HASH },
    });
    const descendant = nextOp(broken, reading(950));
    const pending = merged(descendant, broken);
    expect(pending.pending).toHaveLength(2);
    expect(readReadingViews(pending)).toEqual([]);
    const replica = receive(pending, first);
    expect(replica.quarantined).toEqual(
      expect.arrayContaining([
        { operation: operationReference(broken), reason: 'causal-reference-conflict' },
        { operation: operationReference(descendant), reason: 'quarantined-dependency' },
      ]),
    );
    expect(replica.quarantined).toHaveLength(2);
    expect(only(view(replica).headResumes).operationRefs).toEqual([operationReference(first)]);
    expect(view(replica).projection.requiresChoice).toBe(false);
    expect(replica.operations).toHaveLength(3);
  });

  it('cannot project a different source from an invalid supersession reference', () => {
    const first = op(reading(100));
    const wrongSource = op(
      {
        ...reading(300),
        anchor: {
          ...reading(300).anchor,
          source: { sourceId: 'other-source', versionId: 'v1', sha256: HASH },
        },
        supersedes: [operationReference(first)],
      },
      'phone',
    );
    const replica = merged(wrongSource, first);
    expect(replica.quarantined).toEqual([
      { operation: operationReference(wrongSource), reason: 'causal-reference-conflict' },
    ]);
    expect(only(readReadingViews(replica)).sourceId).toBe('source-1');
    expect(only(view(replica).headResumes).payload).toEqual(first.payload);
  });

  it('retains tombstones when stale copies or future-clock resumes arrive', () => {
    const first = op(reading(80));
    const tombstone = nextOp(first, deletion);
    const staleCopy = JSON.parse(canonicalJson(first)) as unknown;
    const offline = op(reading(999), 'phone', { occurredAt: '2099-01-01T00:00:00.000Z' });
    const replica = receive(merged(first, tombstone), staleCopy, offline);
    const result = view(replica);
    expect(result.headResumes).toEqual([]);
    expect(result.projection.heads).toEqual([]);
    expect(result.projection.versions).toEqual([]);
    expect(result.projection.tombstones).toEqual([operationReference(tombstone)]);
    expect(result.projection.activeRestoreGenerations).toEqual([]);
    expect(replica.operations).toHaveLength(3);
    expect(replica.projection.suppressed).toEqual(
      expect.arrayContaining([operationReference(first), operationReference(offline)]),
    );
  });

  it('represents tombstone-only and restore-only state without resurrecting a resume', () => {
    const tombstone = op(deletion);
    const restore = nextOp(tombstone, {
      kind: 'entity.restore',
      target: deletion.target,
      tombstones: [operationReference(tombstone)],
      reason: 'Explicit restore',
    });
    expect(readReadingViews(merged(restore))).toEqual([]);
    const hidden = view(merged(tombstone));
    expect(hidden.headResumes).toEqual([]);
    expect(hidden.projection.tombstones).toEqual([operationReference(tombstone)]);
    const restored = view(merged(restore, tombstone));
    expect(restored.headResumes).toEqual([]);
    expect(restored.projection.activeRestoreGenerations).toEqual([operationReference(restore)]);
    expect(restored.projection.versions).toEqual([]);
  });

  it('requires explicitly restored resume content and preserves every deletion fact', () => {
    const first = op(reading(800));
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
    const restored = nextOp(restore, {
      ...reading(30),
      generation: operationReference(restore),
    });
    const replica = merged(restored, first, restore, tombstone);
    const result = view(replica);
    expect(only(result.headResumes).payload).toEqual(restored.payload);
    expect(only(result.headResumes).payload.generation).toEqual(operationReference(restore));
    expect(result.projection.tombstones).toEqual([operationReference(tombstone)]);
    expect(result.projection.activeRestoreGenerations).toEqual([operationReference(restore)]);
    const anotherDeletion = op(deletion, 'tablet');
    const hidden = view(receive(replica, anotherDeletion, first));
    expect(hidden.headResumes).toEqual([]);
    expect(hidden.projection.versions).toEqual([]);
    expect(hidden.projection.activeRestoreGenerations).toEqual([]);
    expect(hidden.projection.tombstones).toEqual(
      expect.arrayContaining([operationReference(tombstone), operationReference(anotherDeletion)]),
    );
    expect(hidden.projection.tombstones).toHaveLength(2);
  });

  it('returns exact text and audio anchors without manufacturing source or scheduling authority', () => {
    const prefix = '猫😀e\u0301';
    const text: ReadingResumePayload = {
      ...reading(),
      anchor: {
        source: { sourceId: 'source-é', versionId: 'v-e\u0301', sha256: HASH },
        position: {
          kind: 'text',
          unit: 'utf16',
          start: prefix.length,
          end: prefix.length + 2,
          bodyLength: 100,
        },
      },
    };
    const audio: ReadingResumePayload = {
      ...reading(),
      anchor: {
        source: { sourceId: 'audio-声', versionId: 'recording-v1', sha256: HASH },
        position: { kind: 'audio', positionMs: 42_500, durationMs: 180_000 },
      },
    };
    const replica = merged(op(text), op(audio, 'phone'), op(review(), 'tablet'));
    expect(readReadingViews(replica)).toHaveLength(2);
    for (const payload of [text, audio]) {
      const result = view(replica, payload.anchor.source.sourceId);
      const head = only(result.headResumes);
      expect(canonicalJson(head.payload)).toBe(canonicalJson(payload));
      expect(Object.keys(result).sort()).toEqual(['headResumes', 'projection', 'sourceId']);
      expect(Object.keys(head).sort()).toEqual(['operationRefs', 'payload', 'payloadSha256']);
      expect(Object.keys(head.payload.anchor).sort()).toEqual(['position', 'source']);
    }
    expect(replica.projection.scheduling).toBe('not-computed');
    expect(replica.projection.reviewReconciliations).toEqual([]);
  });

  it('keeps opaque Unicode and reserved-looking source identities distinct', () => {
    const sourceIds = ['café', 'cafe\u0301', '__proto__', 'constructor'];
    const operations = sourceIds.map((sourceId, index) =>
      op(
        {
          ...reading(10),
          anchor: {
            ...reading(10).anchor,
            source: { sourceId, versionId: 'v-e\u0301', sha256: HASH },
          },
        },
        `device-${index}`,
      ),
    );
    const replica = merged(...operations);
    expect(readReadingViews(replica).map((result) => result.sourceId)).toEqual(
      [...sourceIds].sort(),
    );
    for (const operation of operations) {
      if (operation.payload.kind !== 'reading.resume') throw new Error('Expected reading');
      expect(
        only(view(replica, operation.payload.anchor.source.sourceId).headResumes).payload,
      ).toEqual(operation.payload);
    }
  });

  it('retains all equivalent head provenance across more than one receive batch', () => {
    const operations = Array.from({ length: 1005 }, (_, index) =>
      op(reading(10), `device-${index}`),
    );
    let replica = receive(createReplica(policy), ...operations.slice(0, 1000));
    replica = receive(replica, ...operations.slice(1000));
    const result = view(replica);
    const head = only(result.headResumes);
    expect(replica.operations).toHaveLength(1005);
    expect(result.projection.versions).toHaveLength(1005);
    expect(head.operationRefs).toHaveLength(1005);
    expect(head.operationRefs).toEqual(result.projection.heads);
    expect(new Set(head.operationRefs.map((reference) => reference.opId)).size).toBe(1005);
    expect(result.projection.requiresChoice).toBe(false);
  });

  it('leaves the input unchanged and makes the full projection and payload provenance immutable', () => {
    const first = op(reading(900));
    const reread = nextOp(first, { ...reading(40), supersedes: [operationReference(first)] });
    const copied = op(reread.payload, 'phone');
    const replica = merged(first, reread, copied);
    const before = canonicalJson(replica);
    const results = readReadingViews(replica);
    const result = only(results);
    const head = only(result.headResumes);
    expect(result.projection).toEqual(only(replica.projection.entities));
    const objects: unknown[] = [results];
    while (objects.length) {
      const object = objects.pop();
      if (object === null || typeof object !== 'object') continue;
      expect(Object.isFrozen(object)).toBe(true);
      objects.push(...Object.values(object));
    }
    expect(Reflect.set(results, '0', {})).toBe(false);
    expect(Reflect.set(head.payload.anchor.source, 'sha256', 'b'.repeat(64))).toBe(false);
    expect(Reflect.set(head.payload.anchor.position, 'start', 999)).toBe(false);
    expect(Reflect.set(head.operationRefs, '0', { opId: HASH, sha256: HASH })).toBe(false);
    expect(Reflect.set(only(head.payload.supersedes), 'sha256', HASH)).toBe(false);
    expect(Reflect.deleteProperty(result.projection, 'tombstones')).toBe(false);
    expect(canonicalJson(replica)).toBe(before);
    expect(readReadingViews(replica)).toEqual(results);
    expect(only(result.headResumes).operationRefs).toHaveLength(2);
  });

  it('rejects serialized, shallow, accessor-bearing and proxy handles before executing getters', () => {
    const replica = merged(op(reading(100)));
    const serialized = JSON.parse(canonicalJson(replica)) as unknown;
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
      serialized,
      { ...replica },
      getterBearing,
      proxy,
      revoked.proxy,
    ]) {
      expect(() => readReadingViews(forged as SyncReplica)).toThrow(
        expect.objectContaining({ code: 'invalid-replica' }),
      );
    }
    expect(reads).toBe(0);
    expect(view(replica).headResumes).toHaveLength(1);
  });
});
