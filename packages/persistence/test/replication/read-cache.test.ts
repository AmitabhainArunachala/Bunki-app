import { describe, expect, it } from 'vitest';
import { createReplica, planReceive } from '@bunki/sync';
import { note, op, nextOp, policy } from '../../../sync/test/fixtures.ts';
import { encodeLocalJson } from '../../src/replication/json.ts';
import { LocalJsonReadCache } from '../../src/replication/read-cache.ts';
import { ReplicaReadCache } from '../../src/replication/replica-read-cache.ts';

describe('bounded exact-byte local reads', () => {
  const first = encodeLocalJson({ body: '一' });
  const second = encodeLocalJson({ body: '二' });
  const read = (cache: LocalJsonReadCache, key = 'a', encoded = first) =>
    cache.read(key, encoded.text, encoded.sha256);

  it('reuses verified values only when both bytes and digest still match', () => {
    const cache = new LocalJsonReadCache();
    const value = read(cache);
    expect(read(cache)).toBe(value);
    expect(() => cache.read('a', second.text, first.sha256)).toThrow('corrupt-store');
    expect(() => cache.read('a', first.text, second.sha256)).toThrow('corrupt-store');
    expect(read(cache, 'a', second)).toEqual(second.value);
    expect(read(cache, 'a', second)).not.toBe(value);
  });

  it('evicts least-recently used entries, bounds characters and drops closed handles', () => {
    const cache = new LocalJsonReadCache(2, first.text.length * 2);
    const a = read(cache, 'a');
    const b = read(cache, 'b');
    expect(read(cache, 'a')).toBe(a);
    read(cache, 'c');
    expect(read(cache, 'b')).not.toBe(b);
    cache.clear();
    expect(read(cache, 'a')).not.toBe(a);
    const small = new LocalJsonReadCache(10, first.text.length - 1);
    expect(read(small)).not.toBe(read(small));
    const bySize = new LocalJsonReadCache(10, first.text.length);
    const original = read(bySize, 'a');
    read(bySize, 'b');
    expect(read(bySize, 'a')).not.toBe(original);
  });
});

describe('exact journal reuse', () => {
  const a = op(note('a'), 'device-a');
  const b = nextOp(a, note('b'));
  const rows = (...operations: (typeof a)[]) =>
    operations.map((operation) => [operation.opId, operation] as const);
  const rebuild = (...operations: (typeof a)[]) =>
    planReceive(createReplica(policy), {
      binding: policy.binding,
      operations,
    }).next;

  it('reuses an unchanged journal, including cloned disk values, and incrementally admits additions', () => {
    const cache = new ReplicaReadCache();
    const first = cache.read(policy, rows(a));
    expect(cache.read(policy, JSON.parse(JSON.stringify(rows(a))))).toBe(first);
    const next = cache.read(policy, rows(b, a));
    expect(next.replica).toEqual(rebuild(a, b));
    expect(next.replica).not.toBe(first.replica);
    expect(Object.isFrozen(next.operations)).toBe(true);
    expect(cache.read(policy, rows(a, b))).toBe(next);
    cache.clear();
    expect(cache.read(policy, rows(a, b)).replica).not.toBe(next.replica);
  });

  it('rebuilds when rows change or disappear and retains pending dependencies', () => {
    const cache = new ReplicaReadCache();
    cache.read(policy, rows(a, b));
    expect(cache.read(policy, rows(b)).replica).toEqual(rebuild(b));
    expect(cache.read(policy, rows(b)).replica.pending).toHaveLength(1);
    const changed = op(note('changed'), 'device-a');
    expect(changed.opId).toBe(a.opId);
    expect(cache.read(policy, rows(changed)).replica).toEqual(rebuild(changed));
    expect(cache.read(policy, rows()).replica.operations).toEqual([]);
  });

  it('does not let reuse attest a different session, malformed bytes, keys or policy', () => {
    const cache = new ReplicaReadCache();
    const first = cache.read(policy, rows(a));
    const nextPolicy = { ...policy, binding: { ...policy.binding, sessionId: 'new-session' } };
    const next = cache.read(nextPolicy, rows(a));
    expect(next.replica).not.toBe(first.replica);
    expect(next.replica.policy.binding.sessionId).toBe('new-session');
    expect(() => cache.read(policy, [[a.opId, { ...a, payloadSha256: '0'.repeat(64) }]])).toThrow();
    expect(() => cache.read(policy, [['wrong-key', a]])).toThrow('corrupt-store');
    expect(() => cache.read(policy, [...rows(a), ...rows(a)])).toThrow('corrupt-store');
    expect(() => cache.read({ ...policy, deletionEpoch: -1 }, rows(a))).toThrow();
    expect(cache.read(nextPolicy, rows(a))).toBe(next);
  });
});
