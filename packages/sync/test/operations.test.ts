import { createHash } from 'node:crypto';

import { canonicalJson } from '@bunki/domain/canonical-json';
import { describe, expect, it } from 'vitest';

import {
  createSyncOperation,
  operationReference,
  parseActorIdentity,
  parseSyncBinding,
  parseSyncOperation,
  SyncValidationError,
  type SyncOperationInput,
} from '../src/index.ts';
import { exam, HASH, note, op, policy, resume, review } from './fixtures.ts';

describe('scoped immutable sync envelopes', () => {
  it('validates actor and callback ownership before a store creates a sequence row', () => {
    const actor = { deviceId: 'mac', incarnationId: 'installation-1' };
    const parsed = parseActorIdentity(actor);
    actor.deviceId = 'mutated';
    expect(parsed.deviceId).toBe('mac');
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(() => parseActorIdentity({ deviceId: '', incarnationId: 'installation-1' })).toThrow(
      SyncValidationError,
    );
    expect(() => parseActorIdentity({ ...actor, secret: 'credential' })).toThrow(
      SyncValidationError,
    );
    expect(parseSyncBinding(policy.binding)).toEqual(policy.binding);
    expect(() => parseSyncBinding({ ...policy.binding, sessionId: null })).toThrow(
      SyncValidationError,
    );
  });
  it('derives stable identities and standard SHA-256 payload/envelope digests', () => {
    const operation = op(note());
    const nodeHash = (value: unknown) =>
      createHash('sha256').update(canonicalJson(value)).digest('hex');
    expect(operation.payloadSha256).toBe(nodeHash(operation.payload));
    expect(operation.opId).toBe(nodeHash({ scope: operation.scope, actor: operation.actor }));
    expect(operationReference(operation).sha256).toBe(nodeHash(operation));
    expect(op(note())).toEqual(operation);
    expect(op(note(), 'iphone').opId).not.toBe(operation.opId);
    expect(
      op(note(), 'mac', { actor: { ...operation.actor, incarnationId: 'reinstall-2' } }).opId,
    ).not.toBe(operation.opId);
    expect(op(note(), 'mac', { scope: { ...operation.scope, learnerId: 'father' } }).opId).not.toBe(
      operation.opId,
    );
  });

  it('owns and recursively freezes all parsed payload/reference objects', () => {
    const raw = JSON.parse(JSON.stringify(op(note()))) as {
      payload: { segments: { text: string }[] };
    };
    const parsed = parseSyncOperation(raw);
    raw.payload.segments[0]!.text = 'changed after parsing';
    expect(parsed.payload).toMatchObject({ segments: [{ text: '猫を見た。' }] });
    expect(Object.isFrozen(parsed.payload)).toBe(true);
    if (parsed.payload.kind !== 'note.version') throw new Error('wrong fixture');
    const segments = parsed.payload.segments;
    expect(Object.isFrozen(segments[0])).toBe(true);
    expect(() => Object.assign(segments[0]!, { text: 'mutated' })).toThrow();
  });

  it('canonical property ordering does not create a different operation', () => {
    const operation = op(note());
    const reordered = Object.fromEntries(Object.entries(operation).reverse());
    expect(operationReference(parseSyncOperation(reordered))).toEqual(
      operationReference(operation),
    );
  });

  it.each([
    [
      'unknown envelope field',
      (value: Record<string, unknown>) => {
        value['credentials'] = 'must-not-enter';
      },
    ],
    [
      'unknown payload field',
      (value: Record<string, unknown>) => {
        (value['payload'] as Record<string, unknown>)['mastery'] = true;
      },
    ],
    [
      'unknown version',
      (value: Record<string, unknown>) => {
        value['v'] = 2;
      },
    ],
    [
      'unknown schema epoch',
      (value: Record<string, unknown>) => {
        value['schemaEpoch'] = 2;
      },
    ],
    [
      'unknown merge policy',
      (value: Record<string, unknown>) => {
        value['mergePolicy'] = 'future/2';
      },
    ],
    [
      'tampered payload',
      (value: Record<string, unknown>) => {
        (value['payload'] as Record<string, unknown>)['versionId'] = 'tampered';
      },
    ],
    [
      'tampered ID',
      (value: Record<string, unknown>) => {
        value['opId'] = HASH;
      },
    ],
    [
      'unsafe sequence',
      (value: Record<string, unknown>) => {
        (value['actor'] as Record<string, unknown>)['sequence'] = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'fractional epoch',
      (value: Record<string, unknown>) => {
        value['deletionEpoch'] = 1.5;
      },
    ],
  ])('rejects %s without leaking content', (_label, mutate) => {
    const raw = JSON.parse(
      JSON.stringify(op(note('private-note', 'v1', 'private sentence'))),
    ) as Record<string, unknown>;
    mutate(raw);
    expect(() => parseSyncOperation(raw)).toThrow(SyncValidationError);
    try {
      parseSyncOperation(raw);
    } catch (error) {
      expect(String(error)).not.toContain('private sentence');
      expect(String(error)).not.toContain('must-not-enter');
    }
  });

  it.each([
    ['undefined', undefined],
    ['bigint', 1n],
    ['NaN', NaN],
    ['infinity', Infinity],
    ['negative zero', -0],
    ['Date', new Date()],
    ['lone high surrogate', '\ud800'],
    ['lone low surrogate', '\udfff'],
  ])('rejects non-JSON %s', (_label, value) => {
    const raw = { ...op(note()), unexpected: value };
    expect(() => parseSyncOperation(raw)).toThrow(SyncValidationError);
  });

  it('refuses cycles, sparse arrays, accessors, symbols and excessive depth before schema traversal', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(() => parseSyncOperation(cyclic)).toThrow(SyncValidationError);
    const sparse = { ...op(note()), dependencies: new Array(2) };
    expect(() => parseSyncOperation(sparse)).toThrow(SyncValidationError);
    let called = false;
    const accessor = Object.defineProperty({}, 'v', {
      enumerable: true,
      get() {
        called = true;
        throw new Error('executed');
      },
    });
    expect(() => parseSyncOperation(accessor)).toThrow(SyncValidationError);
    expect(called).toBe(false);
    expect(() => parseSyncOperation({ ...op(note()), [Symbol('hidden')]: 'data' })).toThrow(
      SyncValidationError,
    );
    let deep: unknown = {};
    for (let i = 0; i < 30; i += 1) deep = { child: deep };
    expect(() => parseSyncOperation(deep)).toThrow(SyncValidationError);
  });

  it('validates semantic reference structure and predecessor sequence requirements', () => {
    const first = op(note());
    expect(() => op(note(), 'mac', { predecessor: operationReference(first) })).toThrow(
      SyncValidationError,
    );
    expect(() => op(note(), 'mac', { actor: { ...first.actor, sequence: 2 } })).toThrow(
      SyncValidationError,
    );
    expect(() => op(note(), 'mac', { dependencies: [operationReference(first)] })).toThrow(
      SyncValidationError,
    );
    const ref = operationReference(op(note(), 'iphone'));
    expect(() => op(note(), 'mac', { dependencies: [ref, ref] })).toThrow(SyncValidationError);
  });

  it('preserves source-quote UTF-16 positions and explicit device-sync basis', () => {
    const quote = {
      kind: 'note.version',
      noteId: 'quote-note',
      versionId: 'v1',
      generation: null,
      supersedes: [],
      segments: [
        {
          kind: 'source-quote',
          text: '🌏猫',
          source: { sourceId: 'publisher', versionId: 'published-v1', sha256: HASH },
          position: { kind: 'text', unit: 'utf16', start: 10, end: 13, bodyLength: 100 },
          deviceSyncBasis: { basisId: 'private-licensed-copy', policyVersion: 'source-policy/1' },
        },
      ],
    } as const;
    expect(op(quote).payload).toEqual(quote);
    expect(() =>
      op({
        ...quote,
        segments: [{ ...quote.segments[0], position: { ...quote.segments[0].position, end: 12 } }],
      }),
    ).toThrow(SyncValidationError);
    const missingBasis = JSON.parse(JSON.stringify(op(quote))) as {
      payload: { segments: Record<string, unknown>[] };
    };
    delete missingBasis.payload.segments[0]!['deviceSyncBasis'];
    expect(() => parseSyncOperation(missingBasis)).toThrow(SyncValidationError);
  });

  it('keeps equal/backward timestamps instead of treating wall time as causal authority', () => {
    const payload = exam();
    if (payload.kind !== 'exam.attempt') throw new Error('wrong fixture');
    const backwards = { ...payload, endedAt: '2026-09-09T08:00:00.000Z' };
    expect(op(backwards).payload).toEqual(backwards);
  });

  it('does not permit invalid source offsets or duplicate exam item responses', () => {
    const reading = resume(1001);
    expect(() => op(reading)).toThrow(SyncValidationError);
    const attempt = exam();
    if (attempt.kind !== 'exam.attempt') throw new Error('wrong fixture');
    expect(() => op({ ...attempt, answers: [...attempt.answers, ...attempt.answers] })).toThrow(
      SyncValidationError,
    );
  });

  it('carries raw rejected, hinted and ungraded review observations without converting them', () => {
    const raw = review();
    if (raw.kind !== 'review.attempt') throw new Error('wrong fixture');
    const observation = {
      ...raw,
      admission: 'rejected',
      hintsUsed: 2,
      answerRevealed: true,
      reportedGrade: null,
    } as const;
    expect(op(observation).payload).toEqual(observation);
  });

  it('retains existing Japanese dictionary identities without normalizing Unicode', () => {
    const raw = review();
    if (raw.kind !== 'review.attempt') throw new Error('wrong fixture');
    const japanese = { ...raw, cardId: '犬', attemptId: '犬:レビュー1' };
    expect(op(japanese).payload).toEqual(japanese);
    expect(op(note('が')).payload).not.toEqual(op(note('か\u3099')).payload);
  });

  it('validates create input too; a TypeScript cast cannot bypass scope or payload checks', () => {
    const raw = { ...op(note()), scope: { ...policy.binding, credential: 'secret' } };
    const { opId: _id, payloadSha256: _hash, ...input } = raw;
    expect(() => createSyncOperation(input as unknown as SyncOperationInput)).toThrow(
      SyncValidationError,
    );
  });
});
