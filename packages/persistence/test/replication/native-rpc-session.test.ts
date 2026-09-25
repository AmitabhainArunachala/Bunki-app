import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '@bunki/domain/canonical-json';
import {
  createSyncOperation,
  createSyncOperationV2,
  operationReference,
  SYNC_MERGE_POLICY,
  SYNC_SCHEMA_EPOCH,
  type SyncBinding,
  type SyncOperation,
} from '@bunki/sync';
import type { SyncPullRequest, SyncPushRequest } from '@bunki/persistence/replication';
import {
  NativeRpcSyncSession,
  type NativeRpcBytePort,
  type NativeRpcOwnerCapture,
  type NativeRpcLimits,
} from '../../src/replication/native-rpc-session.ts';
import { assessmentResultFixtureV2 } from './assessment-v2-fixtures.ts';

const BINDING: SyncBinding = {
  accountId: 'account-a',
  learnerId: 'learner-a',
  sessionId: 'local-session-a',
};
const OWNER: NativeRpcOwnerCapture = {
  binding: BINDING,
  channelId: 'ck-private-v1:synthetic-channel',
  epoch: 3,
  leaseId: '11111111-1111-4111-8111-111111111111',
  connectionId: '22222222-2222-4222-8222-222222222222',
  ownerId: 'window-a',
  processId: 'process-a',
  navigationId: 'navigation-a',
};
function operation(
  deviceId = 'mac-a',
  text = '自分の文。é e\u0301 😀 "引用"\n次の行。',
  binding = BINDING,
): SyncOperation {
  return createSyncOperation({
    format: 'kairo-sync-operation',
    v: 1,
    scope: { accountId: binding.accountId, learnerId: binding.learnerId },
    actor: { deviceId, incarnationId: 'installation-a', sequence: 1 },
    predecessor: null,
    dependencies: [],
    schemaEpoch: SYNC_SCHEMA_EPOCH,
    deletionEpoch: 0,
    mergePolicy: SYNC_MERGE_POLICY,
    occurredAt: '2026-09-10T01:00:00.000Z',
    payload: {
      kind: 'note.version',
      noteId: 'note-a',
      versionId: deviceId,
      generation: null,
      supersedes: [],
      segments: [{ kind: 'original', text }],
    },
  });
}
const FIRST = operation();
const SECOND = operation('phone-b');
function frame(value: unknown): Uint8Array {
  const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(JSON.stringify(value));
  const output = Buffer.alloc(4 + bytes.length);
  output.writeUInt32BE(bytes.length);
  bytes.copy(output, 4);
  return output;
}
function body(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(Buffer.from(bytes).subarray(4).toString()) as Record<string, unknown>;
}
function envelope(op = FIRST) {
  return {
    reference: operationReference(op),
    canonicalBase64: Buffer.from(canonicalJson(op)).toString('base64'),
  };
}
const pushResult = (operations = [FIRST]) => ({
  accepted: operations.map(operationReference),
  failures: [],
});
const pullResult = (operations = [FIRST]) => ({
  previous: null,
  nextCheckpoint: 'opaque-native-cursor',
  hasMore: false,
  envelopes: operations.map(envelope),
});
function reply(result: unknown, { id = '1', method = 'push', leaseId = OWNER.leaseId } = {}) {
  return {
    format: 'kairo-journal-rpc',
    v: 1,
    type: 'reply',
    id,
    method,
    leaseId,
    ok: true,
    result,
  };
}
function errorReply(code: string, id = '1', method = 'push') {
  return {
    format: 'kairo-journal-rpc',
    v: 1,
    type: 'reply',
    id,
    method,
    leaseId: OWNER.leaseId,
    ok: false,
    error: { code },
  };
}
const invalidation = (leaseId = OWNER.leaseId) => ({
  format: 'kairo-journal-rpc',
  v: 1,
  type: 'event',
  event: 'session-invalidated',
  leaseId,
  code: 'logout',
});
const tick = async () => {
  for (let n = 0; n < 5; n += 1) await Promise.resolve();
};
class Port implements NativeRpcBytePort {
  connectionId = OWNER.connectionId;
  receiver: Parameters<NativeRpcBytePort['subscribe']>[0] | null = null;
  originalReceiver: Parameters<NativeRpcBytePort['subscribe']>[0] | null = null;
  sent: Uint8Array[] = [];
  closed = false;
  sendResult: (() => Promise<void>) | null = null;
  send(bytes: Uint8Array): Promise<void> {
    this.sent.push(new Uint8Array(bytes));
    return this.sendResult?.() ?? Promise.resolve();
  }
  subscribe(receiver: Parameters<NativeRpcBytePort['subscribe']>[0]): () => void {
    this.receiver = receiver;
    this.originalReceiver = receiver;
    return () => {
      this.receiver = null;
    };
  }
  close(): void {
    this.closed = true;
  }
  emit(value: unknown): void {
    this.bytes(frame(value));
  }
  bytes(bytes: Uint8Array): void {
    for (let at = 0; at < bytes.length; at += 64 * 1024)
      this.receiver?.data(bytes.subarray(at, at + 64 * 1024));
  }
}
function fixture(limits?: Partial<NativeRpcLimits>) {
  const port = new Port();
  const state = {
    owner: structuredClone(OWNER),
    authorized: true,
    permissive: false,
    assertions: 0,
  };
  const session = new NativeRpcSyncSession({
    port,
    authority: {
      capture: () => structuredClone(state.owner),
      assertCurrent: (captured) => {
        state.assertions += 1;
        return (
          state.authorized &&
          (state.permissive || canonicalJson(captured) === canonicalJson(state.owner))
        );
      },
    },
    ...(limits ? { limits } : {}),
  });
  const captured = structuredClone(session.capture());
  const signal = new AbortController();
  const pushRequest = (operations: readonly SyncOperation[] = [FIRST]): SyncPushRequest => ({
    requestId: 'opaque-coordinator-id:request-a',
    binding: structuredClone(BINDING),
    channelId: OWNER.channelId,
    operations,
    maxBytes: 1024 * 1024,
  });
  const pullRequest = (): SyncPullRequest => ({
    requestId: 'opaque-coordinator-id:pull-a',
    binding: structuredClone(BINDING),
    channelId: OWNER.channelId,
    checkpoint: null,
    limit: 100,
    maxBytes: 1024 * 1024,
  });
  return {
    port,
    state,
    session,
    captured,
    signal,
    pushRequest,
    pullRequest,
    push: (request = pushRequest()) =>
      session.push(structuredClone(captured), request, signal.signal),
    pull: (request = pullRequest()) =>
      session.pull(structuredClone(captured), request, signal.signal),
  };
}

describe('Native RPC session exact bytes and caller authority', () => {
  it('transports version2 assessment envelopes with the same scoped exact-byte RPC', async () => {
    const { opId: _id, payloadSha256: _digest, ...base } = FIRST;
    const rich = createSyncOperationV2({ ...base, v: 2, payload: assessmentResultFixtureV2() });
    const f = fixture();
    const pending = f.push(f.pushRequest([rich]));
    await tick();
    expect(body(f.port.sent[0]!)['params']).toEqual({
      leaseId: OWNER.leaseId,
      envelopes: [envelope(rich)],
    });
    f.port.emit(reply(pushResult([rich])));
    await expect(pending).resolves.toMatchObject({ accepted: [operationReference(rich)] });
    const pull = f.pull();
    await tick();
    f.port.emit(reply(pullResult([rich]), { id: '2', method: 'pull' }));
    await expect(pull).resolves.toMatchObject({ operations: [rich] });
  });
  it('accepts cloned captures, maps opaque coordinator IDs, and preserves partial acknowledgements', async () => {
    const f = fixture();
    expect(f.session.assertCurrent(structuredClone(f.captured))).toBe(true);
    const request = f.pushRequest([FIRST, SECOND]);
    const pending = f.push(request);
    await tick();
    const sent = body(f.port.sent[0]!);
    expect(sent).toEqual({
      format: 'kairo-journal-rpc',
      v: 1,
      id: '1',
      method: 'push',
      params: { leaseId: OWNER.leaseId, envelopes: [envelope(FIRST), envelope(SECOND)] },
    });
    f.port.emit(
      reply({
        accepted: [operationReference(FIRST)],
        failures: [{ opId: SECOND.opId, code: 'transportUnavailable' }],
      }),
    );
    await expect(pending).resolves.toEqual({
      requestId: request.requestId,
      binding: BINDING,
      channelId: OWNER.channelId,
      accepted: [operationReference(FIRST)],
    });
    const pulled = f.pull();
    f.port.emit(reply(pullResult(), { id: '2', method: 'pull' }));
    await expect(pulled).resolves.toEqual({
      requestId: f.pullRequest().requestId,
      binding: BINDING,
      channelId: OWNER.channelId,
      previous: null,
      next: 'opaque-native-cursor',
      operations: [FIRST],
      hasMore: false,
    });
    expect(f.state.assertions).toBeGreaterThan(10);
    f.session.close();
  });
  it('keeps large canonical bytes with escapes, original scalar distinctions and no input mutation', async () => {
    const f = fixture();
    const op = operation('large', '日'.repeat(60000));
    const request = f.pushRequest([op]);
    const before = canonicalJson(request);
    const pending = f.push(request);
    f.port.emit(reply(pushResult([op])));
    await pending;
    expect(canonicalJson(request)).toBe(before);
    expect((body(f.port.sent[0]!)['params'] as { envelopes: unknown[] }).envelopes).toEqual([
      envelope(op),
    ]);
    const pulled = f.pull();
    const result = pullResult([op]);
    const response = frame(reply(result, { id: '2', method: 'pull' }));
    for (let at = 0; at < response.length; at += 719) f.port.bytes(response.subarray(at, at + 719));
    const page = (await pulled) as { operations: SyncOperation[] };
    expect(canonicalJson(page.operations[0])).toBe(canonicalJson(op));
    f.session.close();
  });
  it.each([
    'ownerId',
    'processId',
    'navigationId',
    'connectionId',
    'leaseId',
    'channelId',
    'epoch',
  ] as const)(
    'invalidates on exact %s change even when authority callback is otherwise permissive',
    async (key) => {
      const f = fixture();
      f.state.permissive = true;
      const pending = f.push();
      if (key === 'epoch') f.state.owner = { ...f.state.owner, epoch: 4 };
      else
        f.state.owner = {
          ...f.state.owner,
          [key]:
            key === 'leaseId' || key === 'connectionId'
              ? '33333333-3333-4333-8333-333333333333'
              : 'changed',
        };
      f.port.emit(reply(pushResult()));
      await expect(pending).rejects.toMatchObject({ code: 'stale-session' });
      expect(() => f.session.capture()).toThrow('stale-session');
      expect(f.port.closed).toBe(true);
    },
  );
  it.each(['accountId', 'learnerId', 'sessionId'] as const)(
    'requires exact logical binding %s with no rescope',
    async (key) => {
      const f = fixture();
      const pending = f.push();
      f.state.owner = { ...f.state.owner, binding: { ...f.state.owner.binding, [key]: 'changed' } };
      f.port.emit(reply(pushResult()));
      await expect(pending).rejects.toMatchObject({ code: 'stale-session' });
    },
  );
  it('distinguishes composed and decomposed logical scope and refuses wrong-scope operations', async () => {
    const f = fixture();
    const foreign = operation('foreign', '同じ表示', { ...BINDING, learnerId: 'e\u0301' });
    await expect(f.push(f.pushRequest([foreign]))).rejects.toMatchObject({
      code: 'invalid-response',
    });
    expect(f.port.sent).toHaveLength(0);
    const port = new Port();
    const state = { ...OWNER, binding: { ...BINDING, learnerId: 'é' } };
    const session = new NativeRpcSyncSession({
      port,
      authority: { capture: () => state, assertCurrent: () => true },
    });
    const captured = session.capture();
    state.binding = { ...state.binding, learnerId: 'e\u0301' };
    expect(session.assertCurrent(captured)).toBe(false);
    expect(port.closed).toBe(true);
    f.session.close();
  });
  it('refuses forged/getter-bearing captures without invoking their fields', async () => {
    const f = fixture();
    let reads = 0;
    const forged = Object.defineProperty(
      { channelId: OWNER.channelId, epoch: OWNER.epoch },
      'binding',
      {
        enumerable: true,
        get() {
          reads += 1;
          throw new Error('PRIVATE');
        },
      },
    );
    expect(f.session.assertCurrent(forged as typeof f.captured)).toBe(false);
    await expect(
      f.session.push(forged as typeof f.captured, f.pushRequest(), f.signal.signal),
    ).rejects.toMatchObject({ code: 'invalid-authority' });
    const accessor: SyncOperation[] = [];
    Object.defineProperty(accessor, '0', {
      enumerable: true,
      get() {
        reads += 1;
        return FIRST;
      },
    });
    await expect(f.push(f.pushRequest(accessor))).rejects.toHaveProperty('code', 'invalid-request');
    expect(reads).toBe(0);
    expect(f.port.sent).toHaveLength(0);
    f.session.close();
  });
  it('admits only the exact composed profile through push and pull, without scalar normalization', async () => {
    const port = new Port();
    const binding = { ...BINDING, learnerId: 'é' };
    const owner = { ...OWNER, binding };
    const session = new NativeRpcSyncSession({
      port,
      authority: { capture: () => structuredClone(owner), assertCurrent: () => true },
    });
    const local = operation('composed', '文', binding);
    const captured = session.capture();
    const sent = session.push(
      captured,
      {
        requestId: 'opaque',
        binding,
        channelId: owner.channelId,
        maxBytes: 1024 * 1024,
        operations: [local],
      },
      new AbortController().signal,
    );
    port.emit(reply(pushResult([local])));
    await expect(sent).resolves.toHaveProperty('binding', binding);
    const received = session.pull(
      captured,
      {
        requestId: 'opaque-pull',
        binding,
        channelId: owner.channelId,
        maxBytes: 1024 * 1024,
        checkpoint: null,
        limit: 1,
      },
      new AbortController().signal,
    );
    port.emit(
      reply(pullResult([operation('decomposed', '文', { ...binding, learnerId: 'e\u0301' })]), {
        id: '2',
        method: 'pull',
      }),
    );
    await expect(received).rejects.toHaveProperty('code', 'invalid-response');
    expect(port.closed).toBe(true);
  });
  it('refuses connection mismatch, double ownership and wire describe authority', () => {
    const f = fixture();
    expect(
      () =>
        new NativeRpcSyncSession({
          port: f.port,
          authority: { capture: () => OWNER, assertCurrent: () => true },
        }),
    ).toThrow('invalid-authority');
    const other = new Port();
    other.connectionId = '33333333-3333-4333-8333-333333333333';
    expect(
      () =>
        new NativeRpcSyncSession({
          port: other,
          authority: { capture: () => OWNER, assertCurrent: () => true },
        }),
    ).toThrow('invalid-authority');
    f.port.emit(
      reply(
        {
          leaseId: OWNER.leaseId,
          scope: { accountId: BINDING.accountId, learnerId: BINDING.learnerId },
          channelId: OWNER.channelId,
        },
        { method: 'describe' },
      ),
    );
    expect(() => f.session.capture()).toThrow('invalid-response');
  });
});

describe('Native RPC closed framing and admission', () => {
  it.each([
    ['wrong ID', () => reply(pushResult(), { id: '2' })],
    ['leading-zero ID', () => reply(pushResult(), { id: '01' })],
    ['numeric ID', () => ({ ...reply(pushResult()), id: 1 })],
    ['wrong method', () => reply(pushResult(), { method: 'pull' })],
    ['wrong lease', () => reply(pushResult(), { leaseId: '33333333-3333-4333-8333-333333333333' })],
    ['extra root key', () => ({ ...reply(pushResult()), authority: true })],
    ['wrong version', () => ({ ...reply(pushResult()), v: true })],
    ['wrong format', () => ({ ...reply(pushResult()), format: 'other' })],
    ['extra reference', () => reply(pushResult([FIRST, SECOND]))],
    [
      'wrong hash',
      () => reply({ accepted: [{ opId: FIRST.opId, sha256: '0'.repeat(64) }], failures: [] }),
    ],
    ['missing partition', () => reply({ accepted: [], failures: [] })],
    [
      'unknown failure',
      () => reply({ accepted: [], failures: [{ opId: FIRST.opId, code: 'PRIVATE_SERVER_TEXT' }] }),
    ],
    ['unknown diagnostic', () => errorReply('PRIVATE_SERVER_TEXT')],
    [
      'extra error key',
      () => ({
        ...errorReply('transportUnavailable'),
        error: { code: 'transportUnavailable', message: 'PRIVATE' },
      }),
    ],
    ['wrong revocation lease', () => invalidation('33333333-3333-4333-8333-333333333333')],
  ] as const)('rejects %s before acknowledgement', async (_name, make) => {
    const f = fixture();
    const pending = f.push();
    f.port.emit(make());
    await expect(pending).rejects.toMatchObject({ code: 'invalid-response' });
    expect(f.port.closed).toBe(true);
    expect(() => f.session.capture()).toThrow('invalid-response');
  });
  it.each([
    [
      'duplicate root key',
      () => JSON.stringify(reply(pushResult())).replace('"v":1', '"v":1,"v":1'),
    ],
    [
      'escaped duplicate root key',
      () => JSON.stringify(reply(pushResult())).replace('"id":"1"', '"id":"1","\\u0069d":"1"'),
    ],
    [
      'lone surrogate key',
      () => JSON.stringify(reply(pushResult())).replace('"method"', '"\\ud800"'),
    ],
    [
      'lone surrogate value',
      () => JSON.stringify(reply(pushResult())).replace('"push"', '"\\ud800"'),
    ],
    ['BOM', () => '\ufeff' + JSON.stringify(reply(pushResult()))],
    ['trailing data', () => JSON.stringify(reply(pushResult())) + '{}'],
    [
      'invalid JSON primitive',
      () => JSON.stringify(reply(pushResult())).replace('"ok":true', '"ok":NaN'),
    ],
    [
      'duplicate nested ref',
      () =>
        JSON.stringify(reply(pushResult())).replace(
          '"opId":',
          '"opId":"' + FIRST.opId + '","opId":',
        ),
    ],
  ] as const)('refuses %s without overwrite or Unicode repair', async (_name, make) => {
    const f = fixture();
    const pending = f.push();
    f.port.emit(make());
    await expect(pending).rejects.toMatchObject({ code: 'invalid-response' });
  });
  it('bounds raw prefix, chunk, depth, nodes and truncated stream before operation decoding', async () => {
    for (const kind of ['prefix', 'chunk', 'depth', 'nodes', 'utf8', 'truncated'] as const) {
      const f = fixture();
      const pending = f.push();
      if (kind === 'prefix') f.port.bytes(new Uint8Array([127, 255, 255, 255]));
      if (kind === 'chunk') f.port.receiver!.data(new Uint8Array(65537));
      if (kind === 'depth') f.port.emit('{"x":' + '['.repeat(10) + '0' + ']'.repeat(10) + '}');
      if (kind === 'nodes') f.port.emit('{"x":[' + Array(2050).fill('0').join(',') + ']}');
      if (kind === 'utf8') f.port.bytes(new Uint8Array([0, 0, 0, 2, 0xc0, 0xaf]));
      if (kind === 'truncated') {
        f.port.bytes(frame(reply(pushResult())).subarray(0, 13));
        f.port.receiver!.close();
      }
      await expect(pending).rejects.toHaveProperty(
        'code',
        kind === 'utf8' ? 'invalid-response' : kind === 'truncated' ? 'closed' : 'limits-exceeded',
      );
      expect(f.port.closed).toBe(true);
    }
  });
  it.each([
    ['wrong previous', () => ({ ...pullResult(), previous: 'other' })],
    ['null next', () => ({ ...pullResult(), nextCheckpoint: null })],
    [
      'reused cursor with data',
      () => ({ ...pullResult(), previous: 'same', nextCheckpoint: 'same' }),
    ],
    [
      'wrong scope',
      () => pullResult([operation('other', '文', { ...BINDING, accountId: 'other' })]),
    ],
    ['duplicate delivery within page', () => pullResult([FIRST, FIRST])],
    [
      'compact operation bytes',
      () => ({
        ...pullResult(),
        envelopes: [
          { ...envelope(), canonicalBase64: Buffer.from(JSON.stringify(FIRST)).toString('base64') },
        ],
      }),
    ],
    [
      'duplicate canonical operation key',
      () => ({
        ...pullResult(),
        envelopes: [
          {
            ...envelope(),
            canonicalBase64: Buffer.from(
              canonicalJson(FIRST).replace(
                '"format":',
                '"format": "kairo-sync-operation",\n  "format":',
              ),
            ).toString('base64'),
          },
        ],
      }),
    ],
    [
      'extra base64 whitespace',
      () => ({
        ...pullResult(),
        envelopes: [{ ...envelope(), canonicalBase64: envelope().canonicalBase64 + '\n' }],
      }),
    ],
    [
      'noncanonical base64 pad bits',
      () => ({ ...pullResult(), envelopes: [{ ...envelope(), canonicalBase64: 'Zh==' }] }),
    ],
    [
      'invalid operation UTF8',
      () => ({
        ...pullResult(),
        envelopes: [
          { ...envelope(), canonicalBase64: Buffer.from([0xed, 0xa0, 0x80]).toString('base64') },
        ],
      }),
    ],
    [
      'wrong envelope hash',
      () => ({
        ...pullResult(),
        envelopes: [{ ...envelope(), reference: { opId: FIRST.opId, sha256: '0'.repeat(64) } }],
      }),
    ],
    [
      'extra envelope field',
      () => ({ ...pullResult(), envelopes: [{ ...envelope(), admitted: true }] }),
    ],
    ['oversized cursor', () => ({ ...pullResult(), nextCheckpoint: 'é'.repeat(4097) })],
  ] as const)('rejects pull %s without producing a checkpoint', async (_name, make) => {
    const f = fixture();
    const pending = f.pull();
    f.port.emit(reply(make(), { method: 'pull' }));
    await expect(pending).rejects.toMatchObject({ code: 'invalid-response' });
    expect(f.port.closed).toBe(true);
  });
  it('separates coordinator compact JSON and canonical/base64 wire budgets with whole-request refusal', async () => {
    const f = fixture();
    const op = operation('size', 'a'.repeat(3000));
    const request = { ...f.pushRequest([op]), maxBytes: 5000 };
    expect(Buffer.byteLength(JSON.stringify(request))).toBeLessThan(request.maxBytes);
    expect(Buffer.byteLength(canonicalJson(op))).toBeLessThan(request.maxBytes);
    await expect(f.push(request)).rejects.toMatchObject({ code: 'limits-exceeded' });
    expect(f.port.sent).toHaveLength(0);
    expect(f.session.assertCurrent(f.captured)).toBe(true);
    const pulled = f.pull({ ...f.pullRequest(), maxBytes: 5000 });
    const value = {
      requestId: f.pullRequest().requestId,
      binding: BINDING,
      channelId: OWNER.channelId,
      previous: null,
      next: 'opaque-native-cursor',
      operations: [op],
      hasMore: false,
    };
    expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThan(5000);
    const response = frame(reply(pullResult([op]), { id: '2', method: 'pull' }));
    expect(response.length - 4).toBeGreaterThan(5000);
    f.port.bytes(response.subarray(0, 4));
    await expect(pulled).rejects.toMatchObject({ code: 'limits-exceeded' });
  });
  it('uses native operation/envelope/batch bounds without dropping rows', async () => {
    const tooMany = fixture({ maxOperations: 1 });
    await expect(tooMany.push(tooMany.pushRequest([FIRST, SECOND]))).rejects.toHaveProperty(
      'code',
      'limits-exceeded',
    );
    expect(tooMany.port.sent).toHaveLength(0);
    tooMany.session.close();
    const tooLarge = fixture({ maxEnvelopeBytes: 10 });
    await expect(tooLarge.push()).rejects.toHaveProperty('code', 'limits-exceeded');
    expect(tooLarge.port.sent).toHaveLength(0);
    tooLarge.session.close();
    const batch = fixture({ maxBatchBytes: 1024 });
    await expect(batch.push(batch.pushRequest([FIRST, SECOND]))).rejects.toHaveProperty(
      'code',
      'limits-exceeded',
    );
    expect(batch.port.sent).toHaveLength(0);
    batch.session.close();
  });
});

describe('Native RPC cancellation, lease loss and output races', () => {
  it('cancels while held, keeps bounded busy slots, then drains both orders without success', async () => {
    for (const order of ['control-first', 'target-first'] as const) {
      const f = fixture();
      const pending = f.push();
      await tick();
      await expect(f.pull()).rejects.toHaveProperty('code', 'busy');
      f.signal.abort();
      await expect(pending).rejects.toHaveProperty('code', 'cancelled');
      expect(body(f.port.sent[1]!)).toEqual({
        format: 'kairo-journal-rpc',
        v: 1,
        id: '2',
        method: 'cancel',
        params: { targetId: '1' },
      });
      await expect(
        f.session.pull(f.captured, f.pullRequest(), new AbortController().signal),
      ).rejects.toHaveProperty('code', 'busy');
      const control = {
        ...reply(
          { targetId: '1', cancelled: order === 'control-first' },
          { id: '2', method: 'cancel' },
        ),
        leaseId: order === 'control-first' ? OWNER.leaseId : null,
      };
      if (order === 'control-first') {
        f.port.emit(control);
        f.port.emit(errorReply('cancelled'));
      } else {
        f.port.emit(reply(pushResult()));
        f.port.emit(control);
      }
      await tick();
      expect(f.session.assertCurrent(f.captured)).toBe(true);
      const next = f.session.pull(f.captured, f.pullRequest(), new AbortController().signal);
      f.port.emit(reply(pullResult([]), { id: '3', method: 'pull' }));
      await expect(next).resolves.toHaveProperty('operations', []);
      f.session.close();
    }
  });
  it('holds completion until send acknowledgement and rejects a late failed write without retry', async () => {
    const f = fixture();
    let failSend!: (error: Error) => void;
    f.port.sendResult = () =>
      new Promise((_resolve, reject) => {
        failSend = reject;
      });
    let fulfilled = false;
    const pending = f.push().then((value) => {
      fulfilled = true;
      return value;
    });
    f.port.emit(reply(pushResult()));
    await tick();
    expect(fulfilled).toBe(false);
    failSend(new Error('PRIVATE_NATIVE_DIAGNOSTIC'));
    await expect(pending).rejects.toHaveProperty('code', 'transport-unavailable');
    expect(f.port.sent).toHaveLength(1);
    expect(f.port.closed).toBe(true);
  });
  it('revocation admitted after success in one chunk defeats queued success and future capture synchronously', async () => {
    const f = fixture();
    const pending = f.push();
    await tick();
    f.port.bytes(Buffer.concat([frame(reply(pushResult())), frame(invalidation())]));
    expect(() => f.session.capture()).toThrow('stale-session');
    await expect(pending).rejects.toHaveProperty('code', 'stale-session');
  });
  it('rejects in-transit success after explicit invalidation or authority closure change', async () => {
    for (const explicit of [true, false]) {
      const f = fixture();
      const pending = f.push();
      await tick();
      if (explicit) f.session.invalidate();
      else f.state.authorized = false;
      f.port.originalReceiver!.data(frame(reply(pushResult())));
      await expect(pending).rejects.toHaveProperty('code', 'stale-session');
      expect(f.port.sent).toHaveLength(1);
    }
  });
  it('invalidates global native session loss but keeps transient native failures distinct', async () => {
    for (const code of [
      'staleSession',
      'accountUnavailable',
      'unauthorizedScope',
      'session-required',
    ]) {
      const f = fixture();
      const pending = f.push();
      f.port.emit(errorReply(code));
      expect(f.session.assertCurrent(f.captured)).toBe(false);
      await expect(pending).rejects.toHaveProperty('code', 'stale-session');
    }
    for (const code of [
      'transportUnavailable',
      'transport-unavailable',
      'checkpointExpired',
      'journalReset',
      'physicalDeletion',
    ]) {
      const f = fixture();
      const pending = f.push();
      f.port.emit(errorReply(code));
      await expect(pending).rejects.toHaveProperty(
        'code',
        code.startsWith('transport') ? 'transport-unavailable' : 'native-failure',
      );
      expect(f.session.assertCurrent(f.captured)).toBe(true);
      expect(f.port.closed).toBe(false);
      expect(f.port.sent).toHaveLength(1);
      f.session.close();
    }
  });
  it('closes on duplicate terminal reply, unknown cancel/event and abort before send', async () => {
    const f = fixture();
    const pending = f.push();
    f.port.emit(reply(pushResult()));
    await pending;
    f.port.emit(reply(pushResult()));
    expect(f.port.closed).toBe(true);
    const cancelled = fixture();
    cancelled.signal.abort();
    await expect(cancelled.push()).rejects.toHaveProperty('code', 'cancelled');
    expect(cancelled.port.sent).toHaveLength(0);
    cancelled.session.close();
    const extra = fixture();
    extra.port.emit(reply({ targetId: '1', cancelled: false }, { method: 'cancel' }));
    expect(extra.port.closed).toBe(true);
  });
});
