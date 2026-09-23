import { describe, expect, it } from 'vitest';
import { inputHashOf } from '@bunki/ai/hash';
import {
  createReplica,
  createSyncOperation,
  operationReference,
  parseSyncOperation,
  planReceive,
} from '../src/index.ts';
import { policy as POLICY, note, op } from './fixtures.ts';

import { assertJsonBudget } from '../src/common.ts';

describe('Validated immutable operation reuse never supplies session authority', () => {
  it('rejects non-JSON numbers in parsed output even when the caller descriptors are valid', () => {
    const small = JSON.parse(JSON.stringify(op(note('note-a', 'proxy-negative-zero'))));
    small.deletionEpoch = 0;
    const raw = new Proxy(small, {
      get(target, key, receiver) {
        return key === 'deletionEpoch' ? -0 : Reflect.get(target, key, receiver);
      },
    });
    expect(() => assertJsonBudget(raw)).not.toThrow();
    expect(() => parseSyncOperation(raw)).toThrow();
    expect(() => operationReference(raw)).toThrow();
    expect(() =>
      planReceive(createReplica({ ...POLICY, deletionEpoch: 0 }), {
        binding: POLICY.binding,
        operations: [raw],
      }),
    ).toThrow();
  });

  it('validates the actual parsed output budget when an in-process Proxy changes descriptor and property values', () => {
    const small = JSON.parse(JSON.stringify(op(note('note-a', 'proxy-budget'))));
    const largePayload = {
      ...small.payload,
      segments: Array.from({ length: 8 }, () => ({ kind: 'original', text: 'あ'.repeat(64000) })),
    };
    const largeDigest = inputHashOf(largePayload);
    const raw = new Proxy(small, {
      get(target, key, receiver) {
        if (key === 'payload') return largePayload;
        if (key === 'payloadSha256') return largeDigest;
        return Reflect.get(target, key, receiver);
      },
    });
    // The caller's descriptors fit, while the schema sees the larger values.
    // This premise requires a local Proxy and is not serialized JSON input.
    expect(() => assertJsonBudget(raw)).not.toThrow();
    expect(() =>
      assertJsonBudget({ ...small, payload: largePayload, payloadSha256: largeDigest }),
    ).toThrow();
    expect(() => parseSyncOperation(raw)).toThrow();
    expect(() => operationReference(raw)).toThrow();
    expect(() =>
      planReceive(createReplica(POLICY), { binding: POLICY.binding, operations: [raw] }),
    ).toThrow();
  });

  it('does not cache a creation input whose derived digest fields exceed the complete-envelope budget', () => {
    const raw = JSON.parse(JSON.stringify(op(note('note-a', 'budget'))));
    delete raw.opId;
    delete raw.payloadSha256;
    raw.payload.segments = Array.from({ length: 8 }, (_, i) => ({
      kind: 'original',
      text: 'あ'.repeat(i < 7 ? 64000 : 1),
    }));
    let low = 1;
    let high = 64000;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      raw.payload.segments[7].text = 'あ'.repeat(middle);
      try {
        assertJsonBudget(raw);
        low = middle;
      } catch {
        high = middle - 1;
      }
    }
    raw.payload.segments[7].text = 'あ'.repeat(low);
    expect(() => assertJsonBudget(raw)).not.toThrow();
    const created = createSyncOperation(raw);
    expect(() => assertJsonBudget(created)).toThrow();
    expect(() => parseSyncOperation(created)).toThrow();
    expect(() => operationReference(created)).toThrow();
    expect(() => parseSyncOperation(created)).toThrow();
  });

  it('isolates the raw caller tree and retains the exact frozen validated bytes and reference', () => {
    const raw = JSON.parse(JSON.stringify(op(note('note-a', 'raw'))));
    const parsed = parseSyncOperation(raw);
    const first = operationReference(parsed);
    expect(parsed).not.toBe(raw);
    expect(parseSyncOperation(parsed)).toBe(parsed);
    expect(operationReference(parsed)).toBe(first);
    expect(first).toEqual({ opId: parsed.opId, sha256: inputHashOf(parsed) });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.payload)).toBe(true);
    expect(Object.isFrozen(parsed.payload.kind === 'note.version' && parsed.payload.segments)).toBe(
      true,
    );
    expect(Object.isFrozen(first)).toBe(true);
    raw.payload.segments[0].text = 'changed caller bytes';
    expect(operationReference(parsed)).toEqual(first);
    expect(() => parseSyncOperation(raw)).toThrow();
    expect(Reflect.set(parsed.payload, 'noteId', 'changed')).toBe(false);
    expect(Reflect.set(first, 'sha256', '0'.repeat(64))).toBe(false);
  });
  it('validates an untrusted frozen clone and rejects getters without reading them', () => {
    const operation = op(note('note-a', 'clone'));
    const clone = Object.freeze(JSON.parse(JSON.stringify(operation)));
    const parsed = parseSyncOperation(clone);
    expect(parsed).not.toBe(clone);
    expect(operationReference(parsed)).toEqual(operationReference(operation));
    const forged = JSON.parse(JSON.stringify(operation));
    let reads = 0;
    Object.defineProperty(forged.payload.segments[0], 'text', {
      enumerable: true,
      get() {
        reads++;
        return 'changed';
      },
    });
    Object.freeze(forged);
    expect(() => parseSyncOperation(forged)).toThrow();
    expect(reads).toBe(0);
  });
  it('does not let a cached reference cover changed bytes under the same operation ID', () => {
    const first = op({
      kind: 'note.version',
      noteId: 'note-a',
      versionId: 'v',
      generation: null,
      supersedes: [],
      segments: [{ kind: 'original', text: 'first' }],
    });
    const second = op({
      kind: 'note.version',
      noteId: 'note-a',
      versionId: 'v',
      generation: null,
      supersedes: [],
      segments: [{ kind: 'original', text: 'second' }],
    });
    expect(first.opId).toBe(second.opId);
    expect(operationReference(first).sha256).not.toBe(operationReference(second).sha256);
    const state = planReceive(createReplica(POLICY), {
      binding: POLICY.binding,
      operations: [first],
    }).next;
    expect(() => planReceive(state, { binding: POLICY.binding, operations: [second] })).toThrow();
    expect(state.operations).toEqual([first]);
  });
  it('retains foreign-scope and stale-session checks for genuine cached operations', () => {
    const source = op(note('note-a', 'scope'));
    const { opId: _id, payloadSha256: _digest, ...input } = source;
    const foreign = createSyncOperation({
      ...input,
      scope: { ...input.scope, accountId: 'foreign' },
    });
    operationReference(foreign);
    expect(() =>
      planReceive(createReplica(POLICY), {
        binding: POLICY.binding,
        operations: [foreign],
      }),
    ).toThrow();
    operationReference(source);
    expect(() =>
      planReceive(createReplica(POLICY), {
        binding: { ...POLICY.binding, sessionId: 'revoked' },
        operations: [source],
      }),
    ).toThrow();
  });
});
