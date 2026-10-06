import { createHash } from 'node:crypto';

import { canonicalJson } from '@bunki/domain/canonical-json';
import { describe, expect, it, vi } from 'vitest';

import {
  createReplica,
  operationReference,
  parseSourceReferencePayload,
  parseSyncOperation,
  planReceive,
  readSourceReferenceViews,
  SyncValidationError,
  type RecordOperation,
  type SourceReferencePayload,
  type SourceReferenceView,
  type SyncReplica,
} from '../src/index.ts';
import { assertJsonBudget } from '../src/common.ts';
import { referencesOf, targetOf } from '../src/operations.ts';
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

const CAPTURE_ID = 'a184fbd2-5f93-4b36-8f46-079431b41adc';
const OTHER_CAPTURE_ID = 'b184fbd2-5f93-4b36-8f46-079431b41adc';
const URL = 'https://example.test/記事?q=%E7%8C%AB&second=2#t=42.50';

function reference(overrides: Partial<SourceReferencePayload> = {}): SourceReferencePayload {
  return {
    kind: 'source.reference',
    captureId: CAPTURE_ID,
    encounterUrl: URL,
    capturedAt: NOW,
    generation: null,
    ...overrides,
  };
}

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const result = items[0];
  if (result === undefined) throw new Error('Expected one item');
  return result;
}

function view(replica: SyncReplica, captureId = CAPTURE_ID): SourceReferenceView {
  const result = readSourceReferenceViews(replica).find((item) => item.captureId === captureId);
  if (!result) throw new Error('Missing source reference view');
  return result;
}

function rejectPayload(raw: unknown): void {
  expect(() => parseSourceReferencePayload(raw)).toThrow(SyncValidationError);
  expect(() => op(raw as RecordOperation)).toThrow(SyncValidationError);
}

const deletion: Extract<RecordOperation, { kind: 'entity.tombstone' }> = {
  kind: 'entity.tombstone',
  target: { kind: 'source-reference', id: CAPTURE_ID },
  reason: 'user-deleted',
};

describe('source.reference payload and envelope', () => {
  it.each([
    URL,
    'HTTPS://EXAMPLE.test:443/a/../c?b=%2f&b=%2F&a=1#t=001.500',
    'http://localhost:8080/?x=1#',
    'https://[::1]:8443/道?鍵=値#時刻',
    'https://例え.テスト/猫😀e\u0301?字=か\u3099#é',
    'https://example.test/道\u3000続き?q=二\u00a0語#段\u2003落',
  ])('preserves an eligible encountered URL exactly: %s', (encounterUrl) => {
    const raw = reference({ encounterUrl });
    const parsed = parseSourceReferencePayload(raw);
    expect(parsed).toEqual(raw);
    expect(parsed.encounterUrl).toBe(encounterUrl);
    const operation = parseSyncOperation(op(raw));
    const digest = createHash('sha256').update(canonicalJson(raw)).digest('hex');
    expect(operation.payload).toEqual(raw);
    expect(operation.payloadSha256).toBe(digest);
    expect(targetOf(operation.payload)).toEqual(deletion.target);
    expect(operation.schemaEpoch).toBe(1);
    expect(operation.v).toBe(1);
  });

  it('counts the URL limit in UTF-16 units while preserving composed and decomposed text', () => {
    const prefix = 'https://example.test/';
    const remaining = 4096 - prefix.length;
    const exact = prefix + '😀'.repeat(Math.floor(remaining / 2)) + 'a'.repeat(remaining % 2);
    expect(exact.length).toBe(4096);
    expect(parseSourceReferencePayload(reference({ encounterUrl: exact })).encounterUrl).toBe(
      exact,
    );
    rejectPayload(reference({ encounterUrl: `${exact}a` }));
    const composed = op(reference({ encounterUrl: `${prefix}é` }));
    const decomposed = op(reference({ encounterUrl: `${prefix}e\u0301` }), 'phone');
    expect(composed.payloadSha256).not.toBe(decomposed.payloadSha256);
    expect(view(merged(composed, decomposed)).headReferences).toHaveLength(2);
  });

  it.each([
    '',
    'example.test/path',
    '//example.test/path',
    'https:example.test',
    'https:///example.test',
    'file:///tmp/source',
    'data:text/plain,source',
    'javascript:alert(1)',
    'ftp://example.test/path',
    'https://',
    'https://?query',
    'https://[broken]/',
    'https://example.test:99999/',
    'https://learner@example.test/',
    'https://:secret@example.test/',
    'https://%61:secret@example.test/',
    'https://example.test\\path',
    ' https://example.test/',
    'https://example.test/ ',
    '\u3000https://example.test/',
    'https://example.test/\u3000',
    'https://example.test/a b',
    'https://example.test/?a=\ttext',
    'https://exam\nple.test/',
    'https://example.test/#\u0000',
    'https://example.test/\u007f',
    'https://example.test/?a=\u0085',
    'https://example.test/#\u009f',
    'https://example.test/\ud800',
    'https://example.test/\udfff',
  ])('refuses ineligible URL bytes without normalization: %j', (encounterUrl) => {
    rejectPayload(reference({ encounterUrl }));
  });

  it.each([
    CAPTURE_ID.toUpperCase(),
    CAPTURE_ID.replace('-4b36-', '-0b36-'),
    CAPTURE_ID.replace('-4b36-', '-9b36-'),
    CAPTURE_ID.replace('-8f46-', '-7f46-'),
    '00000000-0000-0000-0000-000000000000',
    `${CAPTURE_ID} `,
    'capture-1',
    '__proto__',
  ])('requires the existing lowercase capture UUID for content and deletion targets: %s', (id) => {
    rejectPayload(reference({ captureId: id }));
    expect(() => op({ ...deletion, target: { ...deletion.target, id } })).toThrow(
      SyncValidationError,
    );
    expect(() =>
      op({
        kind: 'entity.restore',
        target: { ...deletion.target, id },
        tombstones: [{ opId: HASH, sha256: HASH }],
        reason: 'Explicit restore',
      }),
    ).toThrow(SyncValidationError);
  });

  it.each([1, 4, 7, 8])(
    'accepts capture UUID version %i using the existing local rule',
    (version) => {
      const captureId = CAPTURE_ID.replace('-4b36-', `-${version}b36-`);
      expect(parseSourceReferencePayload(reference({ captureId })).captureId).toBe(captureId);
    },
  );

  it.each([
    '2026-09-10',
    '2026-09-10T10:00:00Z',
    '2026-09-10T10:00:00.000+00:00',
    '2026-02-30T10:00:00.000Z',
    '2026-09-10T24:00:00.000Z',
    '2026-09-10T10:00:00.0000Z',
  ])('requires the existing canonical ISO instant: %s', (capturedAt) => {
    rejectPayload(reference({ capturedAt }));
  });

  it('requires every strict payload field and refuses body, authority and supersession additions', () => {
    for (const field of Object.keys(reference())) {
      const missing: Record<string, unknown> = { ...reference() };
      delete missing[field];
      rejectPayload(missing);
    }
    for (const field of ['text', 'body', 'title', 'permission', 'actor', 'srs', 'supersedes']) {
      rejectPayload({ ...reference(), [field]: field === 'supersedes' ? [] : 'private-value' });
    }
    for (const generation of [
      undefined,
      {},
      HASH,
      { opId: HASH },
      { opId: HASH, sha256: 'A'.repeat(64) },
      { opId: HASH, sha256: HASH, authority: true },
    ]) {
      rejectPayload({ ...reference(), generation });
    }
    const restored = reference({ generation: { opId: HASH, sha256: HASH } });
    expect(parseSourceReferencePayload(restored)).toEqual(restored);
    expect(referencesOf(op(restored))).toEqual([restored.generation]);
  });

  it('refuses ordinary JSON budget violations and accessors before reading values', () => {
    let reads = 0;
    const accessor = Object.defineProperty({ ...reference() }, 'encounterUrl', {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('Payload getter must not run');
      },
    });
    rejectPayload(accessor);
    expect(reads).toBe(0);
    const cyclic: Record<string, unknown> = { ...reference() };
    cyclic['cycle'] = cyclic;
    let deep: unknown = null;
    for (let i = 0; i < 22; i += 1) deep = { child: deep };
    for (const raw of [
      cyclic,
      { ...reference(), deep },
      { ...reference(), extra: 'a'.repeat(500_001) },
      { ...reference(), extra: new Array(2) },
      { ...reference(), [Symbol('hidden')]: true },
      { ...reference(), extra: NaN },
      { ...reference(), extra: -0 },
      { ...reference(), extra: new Date(NOW) },
      Object.create(reference()),
    ]) {
      rejectPayload(raw);
    }
  });

  it('validates actual proxy property bytes and isolates the owned parsed result', () => {
    const raw = { ...reference() };
    for (const encounterUrl of ['x'.repeat(500_001), 'https://example.test/\ud800']) {
      const proxy = new Proxy(raw, {
        get(target, key, receiver) {
          return key === 'encounterUrl' ? encounterUrl : Reflect.get(target, key, receiver);
        },
      });
      expect(() => assertJsonBudget(proxy)).not.toThrow();
      rejectPayload(proxy);
    }
    let observed = 'https://example.test/道\u3000続き#t=7';
    const valid = new Proxy(raw, {
      get(target, key, receiver) {
        return key === 'encounterUrl' ? observed : Reflect.get(target, key, receiver);
      },
    });
    const parsed = parseSourceReferencePayload(valid);
    expect(parsed.encounterUrl).toBe(observed);
    observed = 'https://changed.test/';
    raw.captureId = OTHER_CAPTURE_ID;
    expect(parsed).toEqual(reference({ encounterUrl: 'https://example.test/道\u3000続き#t=7' }));
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Reflect.set(parsed, 'encounterUrl', observed)).toBe(false);
  });

  it('fails closed if the platform URL parser is unavailable', () => {
    vi.stubGlobal('URL', undefined);
    try {
      rejectPayload(reference());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('checks payload digests and actor identity without letting a reused operation ID cover new bytes', () => {
    const first = op(reference());
    const changed = op(reference({ encounterUrl: `${URL}&changed` }));
    expect(first.opId).toBe(changed.opId);
    expect(first.payloadSha256).not.toBe(changed.payloadSha256);
    expect(() => parseSyncOperation({ ...first, payload: changed.payload })).toThrow(
      expect.objectContaining({ code: 'payload-digest-mismatch' }),
    );
    expect(() => parseSyncOperation({ ...first, opId: HASH })).toThrow(
      expect.objectContaining({ code: 'identity-conflict' }),
    );
    const replica = merged(first);
    const before = canonicalJson(replica);
    expect(() => receive(replica, changed)).toThrow(
      expect.objectContaining({ code: 'identity-conflict' }),
    );
    expect(canonicalJson(replica)).toBe(before);
    expect(() =>
      parseSyncOperation({ ...first, payload: { ...first.payload, kind: 'source.future' } }),
    ).toThrow(SyncValidationError);
  });
});

describe('planner-owned source reference views', () => {
  it('returns only this operation family without computing source admission or scheduling', () => {
    expect(readSourceReferenceViews(createReplica(policy))).toEqual([]);
    const other = merged(
      op(note()),
      op(resume(1), 'phone'),
      op(exam(), 'exam'),
      op(review(), 'review'),
    );
    expect(readSourceReferenceViews(other)).toEqual([]);
    const replica = receive(other, op(reference(), 'source'));
    const result = view(replica);
    expect(Object.keys(result).sort()).toEqual(['captureId', 'headReferences', 'projection']);
    const head = only(result.headReferences);
    expect(Object.keys(head).sort()).toEqual(['operationRefs', 'payload', 'payloadSha256']);
    expect(Object.keys(head.payload).sort()).toEqual([
      'captureId',
      'capturedAt',
      'encounterUrl',
      'generation',
      'kind',
    ]);
    expect(replica.projection.scheduling).toBe('not-computed');
    expect(replica.projection.reviewReconciliations).toEqual([]);
    expect(
      replica.projection.entities.filter((entity) => entity.target.kind !== 'source-reference'),
    ).toEqual(other.projection.entities);
  });

  it('converges for reordered, duplicate and causally successive captures without replacing earlier bytes', () => {
    const base = op(reference());
    const later = nextOp(base, reference({ encounterUrl: 'https://example.test/changed#t=1' }));
    const copy = op(reference(), 'phone', { occurredAt: '2099-01-01T00:00:00.000Z' });
    const expected = readSourceReferenceViews(merged(base, later, copy));
    for (const deliveries of permutations([base, later, copy])) {
      let replica = createReplica(policy);
      for (const operation of deliveries) replica = receive(replica, operation, operation);
      expect(readSourceReferenceViews(replica)).toEqual(expected);
      expect(replica.operations).toHaveLength(3);
      expect(replica.pending).toEqual([]);
    }
    const result = only(expected);
    expect(result.headReferences).toHaveLength(2);
    expect(result.headReferences.map((head) => head.payload)).toEqual(
      expect.arrayContaining([base.payload, later.payload]),
    );
    expect(result.projection.requiresChoice).toBe(true);
    expect(result.projection.heads).toHaveLength(3);
    expect(result.projection.versions).toEqual(result.projection.heads);
    expect(result.projection.identityConflicts).toEqual([]);
    expect(result.headReferences.flatMap((head) => head.operationRefs)).toHaveLength(3);
  });

  it('groups equal content while retaining every independent operation reference across batches', () => {
    const operations = Array.from({ length: 1005 }, (_, index) =>
      op(reference(), `device-${index}`),
    );
    let replica = receive(createReplica(policy), ...operations.slice(0, 1000));
    replica = receive(replica, ...operations.slice(1000), operations[0]);
    const result = view(replica);
    expect(only(result.headReferences)).toEqual({
      payloadSha256: operations[0]!.payloadSha256,
      payload: reference(),
      operationRefs: result.projection.heads,
    });
    expect(only(result.headReferences).operationRefs).toHaveLength(1005);
    expect(new Set(only(result.headReferences).operationRefs.map((ref) => ref.opId)).size).toBe(
      1005,
    );
    expect(result.projection.requiresChoice).toBe(false);
    expect(replica.operations).toHaveLength(1005);
  });

  it('retains URL spelling, fragment and capture-time variants as explicit choices under one capture ID', () => {
    const variants = [
      reference({ encounterUrl: 'https://example.test/%2f#t=1' }),
      reference({ encounterUrl: 'https://example.test/%2F#t=1' }),
      reference({ encounterUrl: 'HTTPS://EXAMPLE.test:443/%2f#t=1' }),
      reference({ encounterUrl: 'https://example.test/%2f#t=2' }),
      reference({
        encounterUrl: 'https://example.test/%2f#t=1',
        capturedAt: '2099-01-01T00:00:00.000Z',
      }),
    ];
    const replica = merged(...variants.map((payload, index) => op(payload, `device-${index}`)));
    const result = view(replica);
    expect(result.headReferences).toHaveLength(variants.length);
    expect(result.headReferences.map((head) => canonicalJson(head.payload)).sort()).toEqual(
      variants.map(canonicalJson).sort(),
    );
    expect(result.projection.requiresChoice).toBe(true);
    expect(replica.projection.scheduling).toBe('not-computed');
  });

  it('does not collapse independent capture IDs for the same URL or let a delete cross identities', () => {
    const first = op(reference());
    const other = op(reference({ captureId: OTHER_CAPTURE_ID }), 'phone');
    const replica = merged(other, first);
    expect(readSourceReferenceViews(replica).map((result) => result.captureId)).toEqual([
      CAPTURE_ID,
      OTHER_CAPTURE_ID,
    ]);
    const next = receive(replica, nextOp(first, deletion));
    expect(view(next).headReferences).toEqual([]);
    expect(view(next, OTHER_CAPTURE_ID)).toEqual(view(replica, OTHER_CAPTURE_ID));
  });

  it('keeps missing predecessors and dependencies invisible until their actual operations arrive', () => {
    const base = op(reference());
    const dependent = nextOp(base, reference({ encounterUrl: 'https://example.test/second' }));
    const prior = op(note(), 'notes');
    const separate = op(reference({ captureId: OTHER_CAPTURE_ID }), 'phone', {
      dependencies: [operationReference(prior)],
    });
    const pending = merged(dependent, separate);
    expect(pending.pending).toHaveLength(2);
    expect(readSourceReferenceViews(pending)).toEqual([]);
    const partial = receive(pending, base);
    expect(partial.pending).toHaveLength(1);
    expect(view(partial).headReferences).toHaveLength(2);
    const released = receive(partial, prior);
    expect(released.pending).toEqual([]);
    expect(readSourceReferenceViews(released)).toHaveLength(2);
    expect(readSourceReferenceViews(pending)).toEqual([]);
  });

  it('excludes broken-reference captures and quarantined descendants from visible choices', () => {
    const base = op(reference());
    const broken = op(reference({ encounterUrl: 'https://example.test/broken' }), 'mac', {
      actor: { ...base.actor, sequence: 2 },
      predecessor: { opId: base.opId, sha256: HASH },
    });
    const descendant = nextOp(
      broken,
      reference({ encounterUrl: 'https://example.test/descendant' }),
    );
    const pending = merged(descendant, broken);
    expect(pending.pending).toHaveLength(2);
    expect(readSourceReferenceViews(pending)).toEqual([]);
    const replica = receive(pending, base);
    expect(replica.quarantined).toEqual(
      expect.arrayContaining([
        { operation: operationReference(broken), reason: 'causal-reference-conflict' },
        { operation: operationReference(descendant), reason: 'quarantined-dependency' },
      ]),
    );
    expect(replica.quarantined).toHaveLength(2);
    expect(only(view(replica).headReferences).operationRefs).toEqual([operationReference(base)]);
    expect(replica.operations).toHaveLength(3);
  });

  it('preserves deletion across stale copies and future-clock captures without implicit restoration', () => {
    const base = op(reference());
    const tombstone = nextOp(base, deletion);
    const future = op(reference({ capturedAt: '2099-01-01T00:00:00.000Z' }), 'phone');
    const replica = receive(merged(base, tombstone), JSON.parse(canonicalJson(base)), future);
    const result = view(replica);
    expect(result.headReferences).toEqual([]);
    expect(result.projection.heads).toEqual([]);
    expect(result.projection.versions).toEqual([]);
    expect(result.projection.tombstones).toEqual([operationReference(tombstone)]);
    expect(replica.projection.suppressed).toEqual(
      expect.arrayContaining([operationReference(base), operationReference(future)]),
    );
    expect(replica.operations).toHaveLength(3);
  });

  it('retains tombstone-only and restore-only state with no invented reference body', () => {
    const tombstone = op(deletion);
    const restore = nextOp(tombstone, {
      kind: 'entity.restore',
      target: deletion.target,
      tombstones: [operationReference(tombstone)],
      reason: 'Explicit restore',
    });
    const pending = merged(restore);
    expect(readSourceReferenceViews(pending)).toEqual([]);
    expect(view(merged(tombstone)).headReferences).toEqual([]);
    const result = view(receive(pending, tombstone));
    expect(result.headReferences).toEqual([]);
    expect(result.projection.versions).toEqual([]);
    expect(result.projection.tombstones).toEqual([operationReference(tombstone)]);
    expect(result.projection.activeRestoreGenerations).toEqual([operationReference(restore)]);
  });

  it('requires explicit generation content and preserves every deletion across reordered restores', () => {
    const base = op(reference());
    const tombstone = nextOp(base, deletion);
    const restore = op(
      {
        kind: 'entity.restore',
        target: deletion.target,
        tombstones: [operationReference(tombstone)],
        reason: 'Explicit restore',
      },
      'phone',
    );
    const restored = nextOp(restore, reference({ generation: operationReference(restore) }));
    const expected = readSourceReferenceViews(merged(base, tombstone, restore, restored));
    for (const deliveries of permutations([base, tombstone, restore, restored])) {
      let replica = createReplica(policy);
      for (const operation of deliveries) replica = receive(replica, operation, operation);
      expect(readSourceReferenceViews(replica)).toEqual(expected);
    }
    const result = only(expected);
    expect(only(result.headReferences).payload).toEqual(restored.payload);
    expect(result.projection.tombstones).toEqual([operationReference(tombstone)]);
    expect(result.projection.activeRestoreGenerations).toEqual([operationReference(restore)]);
    const anotherDelete = op(deletion, 'tablet');
    const hidden = view(merged(restored, base, anotherDelete, restore, tombstone));
    expect(hidden.headReferences).toEqual([]);
    expect(hidden.projection.activeRestoreGenerations).toEqual([]);
    expect(hidden.projection.tombstones).toHaveLength(2);
  });

  it('quarantines a non-restore or wrong-capture generation instead of projecting its content', () => {
    const base = op(reference());
    const falseGeneration = op(reference({ generation: operationReference(base) }), 'phone');
    const wrongDelete = op(
      { ...deletion, target: { ...deletion.target, id: OTHER_CAPTURE_ID } },
      'tablet',
    );
    const wrongRestore = nextOp(wrongDelete, {
      kind: 'entity.restore',
      target: { ...deletion.target, id: OTHER_CAPTURE_ID },
      tombstones: [operationReference(wrongDelete)],
      reason: 'Restore a different capture',
    });
    const wrongGeneration = op(
      reference({ generation: operationReference(wrongRestore) }),
      'fourth',
    );
    const replica = merged(wrongGeneration, wrongRestore, base, falseGeneration, wrongDelete);
    expect(replica.quarantined).toHaveLength(2);
    expect(replica.quarantined.map((entry) => entry.reason)).toEqual([
      'causal-reference-conflict',
      'causal-reference-conflict',
    ]);
    expect(only(view(replica).headReferences).payload).toEqual(base.payload);
    expect(view(replica, OTHER_CAPTURE_ID).headReferences).toEqual([]);
  });

  it('retains scope, session and epoch refusal even for previously validated operation objects', () => {
    const replica = merged(op(reference()));
    const before = canonicalJson(replica);
    for (const scope of [
      { accountId: 'foreign', learnerId: policy.binding.learnerId },
      { accountId: policy.binding.accountId, learnerId: 'foreign' },
    ]) {
      const foreign = parseSyncOperation(op(reference(), 'phone', { scope }));
      operationReference(foreign);
      expect(() => receive(replica, foreign)).toThrow(
        expect.objectContaining({ code: 'ownership-mismatch' }),
      );
    }
    const valid = parseSyncOperation(op(reference(), 'phone'));
    expect(() =>
      planReceive(replica, {
        binding: { ...policy.binding, sessionId: 'stale' },
        operations: [valid],
      }),
    ).toThrow(expect.objectContaining({ code: 'stale-session' }));
    expect(() => receive(replica, op(reference(), 'phone', { deletionEpoch: 2 }))).toThrow(
      expect.objectContaining({ code: 'epoch-mismatch' }),
    );
    expect(canonicalJson(replica)).toBe(before);
  });

  it('returns a deeply immutable view without changing its planner-owned input', () => {
    const base = op(reference());
    const replica = merged(base, op(reference(), 'phone'));
    const before = canonicalJson(replica);
    const results = readSourceReferenceViews(replica);
    const result = only(results);
    const head = only(result.headReferences);
    const objects: unknown[] = [results];
    while (objects.length) {
      const object = objects.pop();
      if (object === null || typeof object !== 'object') continue;
      expect(Object.isFrozen(object)).toBe(true);
      objects.push(...Object.values(object));
    }
    expect(Reflect.set(head.payload, 'encounterUrl', 'https://changed.test/')).toBe(false);
    expect(Reflect.set(head.operationRefs, '0', { opId: HASH, sha256: HASH })).toBe(false);
    expect(Reflect.deleteProperty(result.projection, 'tombstones')).toBe(false);
    expect(canonicalJson(replica)).toBe(before);
    expect(readSourceReferenceViews(replica)).toEqual(results);
  });

  it('rejects forged, serialized, accessor and proxy replica handles before executing getters', () => {
    const replica = merged(op(reference()));
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
      expect(() => readSourceReferenceViews(forged as SyncReplica)).toThrow(
        expect.objectContaining({ code: 'invalid-replica' }),
      );
    }
    expect(reads).toBe(0);
    expect(view(replica).headReferences).toHaveLength(1);
  });
});
