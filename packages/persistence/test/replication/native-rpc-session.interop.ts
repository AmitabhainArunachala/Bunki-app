import { Buffer } from 'node:buffer';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { Readable, Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@bunki/domain/canonical-json';
import {
  operationReference,
  SYNC_MERGE_POLICY,
  SYNC_SCHEMA_EPOCH,
  type SyncOperation,
} from '@bunki/sync';
import {
  SqliteReplicationStore,
  SyncCoordinator,
  type ReplicationSnapshot,
} from '@bunki/persistence/replication';
import { openNodeSqliteDriver } from '@bunki/persistence/ci-substitute';
import {
  NativeRpcSyncSession,
  type NativeRpcBytePort,
  type NativeRpcOwnerCapture,
} from '../../src/replication/native-rpc-session.ts';

const BINDING = { accountId: 'account-a', learnerId: 'learner-a', sessionId: 'local-session-a' };
const POLICY = {
  binding: BINDING,
  schemaEpoch: SYNC_SCHEMA_EPOCH,
  deletionEpoch: 0,
  mergePolicy: SYNC_MERGE_POLICY,
} as const;
const encoder = (operation: SyncOperation) => ({
  reference: operationReference(operation),
  canonicalBase64: Buffer.from(canonicalJson(operation)).toString('base64'),
});
const liveStores = new Set<SqliteReplicationStore>();
const liveHosts = new Set<Host>();
afterEach(async () => {
  for (const host of liveHosts) await host.stop();
  liveHosts.clear();
  for (const store of liveStores) await store.close();
  liveStores.clear();
});
async function directory() {
  const base = env['KAIRO_RPC_INTEROP_EVIDENCE'];
  if (!base || !env['KAIRO_RPC_FIXTURE_HOST'])
    throw new Error('EXPLICIT_NATIVE_RPC_FIXTURE_AND_EXTERNAL_EVIDENCE_REQUIRED');
  await mkdir(base, { recursive: true });
  return mkdtemp(join(base, 'case-'));
}
function open(path: string, actor = 'mac') {
  const store = SqliteReplicationStore.open(openNodeSqliteDriver({ location: path }), {
    policy: POLICY,
    actor: { deviceId: actor, incarnationId: `${actor}-fixture-install` },
  });
  liveStores.add(store);
  return store;
}
async function append(store: SqliteReplicationStore, version: string) {
  const before = await store.snapshot();
  await store.commitLocal({
    changeId: version,
    binding: before.policy.binding,
    expectedRevision: before.revision,
    occurredAt: '2026-09-10T01:00:00.000Z',
    mutations: [
      {
        kind: 'put',
        collection: 'private',
        id: 'private-local-document',
        value: { fullBody: 'LOCAL_ONLY_TEXT_NOT_AN_OPERATION' },
      },
    ],
    operations: [
      {
        dependencies: [],
        payload: {
          kind: 'note.version',
          noteId: version,
          versionId: version,
          generation: null,
          supersedes: [],
          segments: [{ kind: 'original', text: '手書きの文。é e\u0301 😀 "引用"\n次の行。' }],
        },
      },
    ],
  });
  const next = await store.snapshot();
  return next.replica.operations.find(
    (operation) => operation.opId === next.actor.predecessor?.opId,
  )!;
}
interface EventRow {
  event: string;
  [key: string]: unknown;
}
class Host implements NativeRpcBytePort {
  readonly process: ChildProcess;
  readonly events: EventRow[] = [];
  readonly sent: Buffer[] = [];
  readonly received: Buffer[] = [];
  readonly completeReplies: Record<string, unknown>[] = [];
  connectionId = '';
  receiver: Parameters<NativeRpcBytePort['subscribe']>[0] | null = null;
  originalReceiver: Parameters<NativeRpcBytePort['subscribe']>[0] | null = null;
  holdOutput = false;
  held: Buffer[] = [];
  heldCount = 0;
  #closed = false;
  #exit: Promise<void>;
  #eventBytes = Buffer.alloc(0);
  #replyBytes = Buffer.alloc(0);
  #waiters = new Set<() => void>();
  constructor(binary: string, mode: string, seed: string) {
    this.process = spawn(binary, [mode, seed], { stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'] });
    this.#exit = new Promise((resolve) => {
      this.process.once('error', () => {
        this.#closed = true;
        this.receiver?.close();
        this.#wake();
        resolve();
      });
      this.process.once('exit', () => {
        this.#closed = true;
        this.receiver?.close();
        this.#wake();
        resolve();
      });
    });
    this.process.stdout!.on('data', (chunk: Buffer) => this.#data(chunk));
    this.process.stdout!.on('end', () => {
      this.#closed = true;
      this.receiver?.close();
      this.#wake();
    });
    this.process.stderr!.on('data', () => {
      /* compiler/runtime diagnostics are not authority or public errors */
    });
    const grants = this.process.stdio[3];
    if (!(grants instanceof Readable)) throw new Error('FIXTURE_GRANT_FD_REQUIRED');
    grants.on('data', (chunk: Buffer) => {
      this.#eventBytes = Buffer.concat([this.#eventBytes, chunk]);
      if (this.#eventBytes.length > 8192) {
        this.close();
        return;
      }
      let at: number;
      while ((at = this.#eventBytes.indexOf(10)) >= 0) {
        const row = JSON.parse(this.#eventBytes.subarray(0, at).toString()) as EventRow;
        this.#eventBytes = this.#eventBytes.subarray(at + 1);
        this.events.push(row);
        if (this.events.length > 64) this.close();
      }
      this.#wake();
    });
  }
  #wake() {
    for (const waiter of this.#waiters) waiter();
  }
  #data(chunk: Buffer) {
    // Fixture instrumentation is independently bounded. It may deliberately
    // retain an already-in-transit success to exercise a subsequent revocation.
    this.received.push(Buffer.from(chunk));
    this.#replyBytes = Buffer.concat([this.#replyBytes, chunk]);
    if (this.#replyBytes.length > 2 * 1024 * 1024 + 65540) {
      this.close();
      return;
    }
    while (this.#replyBytes.length >= 4) {
      const count = this.#replyBytes.readUInt32BE(0);
      if (count > 2 * 1024 * 1024) {
        this.close();
        return;
      }
      if (this.#replyBytes.length < count + 4) break;
      this.completeReplies.push(
        JSON.parse(this.#replyBytes.subarray(4, count + 4).toString()) as Record<string, unknown>,
      );
      this.#replyBytes = this.#replyBytes.subarray(count + 4);
    }
    if (this.holdOutput) {
      this.heldCount += chunk.length;
      if (this.heldCount > 2 * 1024 * 1024 + 4) {
        this.close();
        return;
      }
      this.held.push(Buffer.from(chunk));
    } else this.deliver(chunk);
    this.#wake();
  }
  deliver(bytes: Uint8Array) {
    for (let at = 0; at < bytes.length; at += 65536)
      this.receiver?.data(bytes.subarray(at, at + 65536));
  }
  send(frame: Uint8Array): Promise<void> {
    if (this.#closed || frame.length > 2 * 1024 * 1024 + 4)
      return Promise.reject(new Error('FIXTURE_CLOSED'));
    if (this.sent.length >= 16) return Promise.reject(new Error('FIXTURE_FRAME_COUNT_LIMIT'));
    this.sent.push(Buffer.from(frame));
    return new Promise((resolve, reject) => {
      this.process.stdin!.write(frame, (error) => {
        if (error) reject(new Error('FIXTURE_PIPE_FAILURE'));
        else resolve();
      });
    });
  }
  subscribe(receiver: Parameters<NativeRpcBytePort['subscribe']>[0]) {
    this.receiver = receiver;
    this.originalReceiver = receiver;
    if (this.#closed) receiver.close();
    return () => {
      this.receiver = null;
    };
  }
  close() {
    this.#closed = true;
    this.process.stdin?.end();
    // The test embedding owns process lifetime; no reconnect or replay.
    this.receiver?.close();
    this.#wake();
  }
  control(command: 'release' | 'revoke' | 'account-loss') {
    const writer = this.process.stdio[4];
    if (!(writer instanceof Writable)) throw new Error('FIXTURE_CONTROL_FD_REQUIRED');
    writer.write(command + '\n');
  }
  async waitFor(predicate: () => boolean, description: string) {
    if (predicate()) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiters.delete(check);
        reject(new Error(`FIXTURE_TIMEOUT_${description}`));
      }, 5000);
      const check = () => {
        if (predicate()) {
          clearTimeout(timer);
          this.#waiters.delete(check);
          resolve();
        }
      };
      this.#waiters.add(check);
      check();
    });
  }
  async stop() {
    this.close();
    const deadline = setTimeout(() => this.process.kill('SIGKILL'), 2000);
    await this.#exit;
    clearTimeout(deadline);
    for (const stream of this.process.stdio) stream?.destroy();
  }
}
async function setup(mode = 'plain', seed: SyncOperation[] = []) {
  const path = await directory();
  const seedPath = join(path, 'synthetic-native-seed.json');
  await writeFile(seedPath, JSON.stringify(seed.map(encoder)) + '\n');
  const host = new Host(env['KAIRO_RPC_FIXTURE_HOST']!, mode, seedPath);
  liveHosts.add(host);
  await host.waitFor(() => host.events.some((row) => row.event === 'grant'), 'grant');
  const grant = host.events.find((row) => row.event === 'grant')!;
  expect(grant['accountId']).toBe(BINDING.accountId);
  expect(grant['learnerId']).toBe(BINDING.learnerId);
  expect(typeof grant['connectionId']).toBe('string');
  host.connectionId = grant['connectionId'] as string;
  const captured: NativeRpcOwnerCapture = {
    binding: BINDING,
    channelId: grant['channelId'] as string,
    epoch: 1,
    leaseId: grant['leaseId'] as string,
    connectionId: host.connectionId,
    ownerId: 'fixture-owner',
    processId: `fixture-process-${host.process.pid}`,
    navigationId: 'fixture-navigation',
  };
  // This explicit fixture grant/authorizer premise is separate from stdin/stdout
  // RPC. Production pairing and authenticated native IPC are not implemented.
  const state = { current: true, owner: captured };
  const session = new NativeRpcSyncSession({
    port: host,
    authority: {
      capture: () => structuredClone(state.owner),
      assertCurrent: (value) =>
        state.current && canonicalJson(value) === canonicalJson(state.owner),
    },
  });
  const database = join(path, 'mac.sqlite');
  const store = open(database);
  const coordinator = new SyncCoordinator({ store, session });
  return { path, database, store, host, session, state, coordinator };
}
function stateBytes(snapshot: ReplicationSnapshot) {
  return canonicalJson({
    policy: snapshot.policy,
    revision: snapshot.revision,
    actor: snapshot.actor,
    documents: snapshot.documents,
    operations: snapshot.replica.operations,
    outbox: snapshot.outbox,
    acknowledgedOutbox: snapshot.acknowledgedOutbox,
    inbox: snapshot.inbox,
    checkpoints: snapshot.checkpoints,
  });
}

describe('TS to real SDK Swift OS pipes with ci-substitute SQLite', () => {
  it('commits only partial exact acknowledgements and atomically receives exact bytes plus native cursor', async () => {
    const phoneDirectory = await directory();
    const phone = open(join(phoneDirectory, 'phone.sqlite'), 'phone');
    const remote = await append(phone, 'phone-note');
    const f = await setup('partial', [remote]);
    const first = await append(f.store, 'mac-first');
    const second = await append(f.store, 'mac-second');
    const firstCycle = await f.coordinator.syncOnce();
    expect(firstCycle.acknowledged).toEqual([operationReference(first)]);
    expect(firstCycle.pendingOutbox).toBe(1);
    const snapshot = await f.store.snapshot();
    expect(snapshot.outbox.map(operationReference)).toEqual([operationReference(second)]);
    expect(snapshot.replica.operations.map(operationReference)).toEqual(
      expect.arrayContaining([first, second, remote].map(operationReference)),
    );
    expect(snapshot.checkpoints[0]?.value).toBe(firstCycle.checkpoint);
    expect(firstCycle.checkpoint).toMatch(/^[A-Za-z0-9+/]+=*$/u);
    const pulled = f.host.completeReplies.find((row) => row['method'] === 'pull')!['result'] as {
      envelopes: unknown[];
      nextCheckpoint: string;
    };
    expect(pulled.envelopes).toEqual(expect.arrayContaining([encoder(remote)]));
    expect(pulled.nextCheckpoint).toBe(firstCycle.checkpoint);
    expect(f.host.sent.map((row) => row.toString()).join('')).not.toContain(
      'LOCAL_ONLY_TEXT_NOT_AN_OPERATION',
    );
    const secondCycle = await f.coordinator.syncOnce();
    expect(secondCycle.acknowledged).toEqual([operationReference(second)]);
    expect(secondCycle.pendingOutbox).toBe(0);
    const pulls = f.host.sent
      .map(
        (bytes) =>
          JSON.parse(bytes.subarray(4).toString()) as {
            method: string;
            params: { checkpoint: string };
          },
      )
      .filter((row) => row.method === 'pull');
    expect(pulls[1]?.params.checkpoint).toBe(firstCycle.checkpoint);
    const stable = stateBytes(await f.store.snapshot());
    await f.store.close();
    liveStores.delete(f.store);
    const reopened = open(f.database);
    expect(stateBytes(await reopened.snapshot())).toBe(stable);
    expect((await stat(f.database)).isFile()).toBe(true);
    expect((await stat(join(phoneDirectory, 'phone.sqlite'))).isFile()).toBe(true);
  });
  it('keeps uncertain remote writes pending after cancellation while held, with no automatic retry', async () => {
    const f = await setup('held');
    const op = await append(f.store, 'cancelled-note');
    const before = stateBytes(await f.store.snapshot());
    const running = f.coordinator.syncOnce();
    const rejection = expect(running).rejects.toHaveProperty('code', 'cancelled');
    await f.host.waitFor(() => f.host.events.some((row) => row.event === 'held'), 'held');
    f.coordinator.cancel();
    await rejection;
    await f.host.waitFor(
      () => f.host.completeReplies.some((row) => row['method'] === 'cancel'),
      'cancel-control',
    );
    const control = f.host.completeReplies.find((row) => row['method'] === 'cancel')!;
    expect(control['result']).toEqual({ targetId: '1', cancelled: true });
    expect(f.host.events.filter((row) => row.event === 'save-stored')).toHaveLength(1);
    expect(stateBytes(await f.store.snapshot())).toBe(before);
    f.host.control('release');
    await f.host.waitFor(
      () => f.host.completeReplies.some((row) => row['method'] === 'push'),
      'cancelled-target',
    );
    expect(f.host.completeReplies.find((row) => row['method'] === 'push')!['error']).toEqual({
      code: 'cancelled',
    });
    const retry = await f.coordinator.syncOnce();
    expect(retry.acknowledged).toEqual([operationReference(op)]);
    expect(retry.pendingOutbox).toBe(0);
    expect(f.host.events.filter((row) => row.event === 'save-stored')).toHaveLength(2);
  });
  it('rejects held work on native revocation and never grants future capture from a wire lease', async () => {
    const f = await setup('held');
    await append(f.store, 'revoked-note');
    const before = stateBytes(await f.store.snapshot());
    const running = f.coordinator.syncOnce();
    const rejection = expect(running).rejects.toHaveProperty('code');
    await f.host.waitFor(() => f.host.events.some((row) => row.event === 'held'), 'held');
    f.host.control('revoke');
    await rejection;
    expect(stateBytes(await f.store.snapshot())).toBe(before);
    expect(() => f.session.capture()).toThrow();
    expect(
      f.session.assertCurrent({ binding: BINDING, channelId: f.state.owner.channelId, epoch: 1 }),
    ).toBe(false);
    expect(f.host.events.filter((row) => row.event === 'save-stored')).toHaveLength(1);
  });
  it('rejects actual native account-unavailable post-write and retains pending state', async () => {
    const f = await setup('held');
    await append(f.store, 'account-loss-note');
    const before = stateBytes(await f.store.snapshot());
    const running = f.coordinator.syncOnce();
    const rejection = expect(running).rejects.toHaveProperty('code');
    await f.host.waitFor(() => f.host.events.some((row) => row.event === 'held'), 'held');
    f.host.control('account-loss');
    await f.host.waitFor(
      () => f.host.events.some((row) => row.event === 'account-unavailable'),
      'account-loss',
    );
    f.host.control('release');
    await rejection;
    expect(stateBytes(await f.store.snapshot())).toBe(before);
    expect(() => f.session.capture()).toThrow();
  });
  it('rejects an actual successful Swift reply already in transit after synchronous owner invalidation', async () => {
    const f = await setup();
    await append(f.store, 'late-note');
    const before = stateBytes(await f.store.snapshot());
    f.host.holdOutput = true;
    const running = f.coordinator.syncOnce();
    const rejection = expect(running).rejects.toHaveProperty('code', 'stale-session');
    await f.host.waitFor(
      () => f.host.completeReplies.some((row) => row['method'] === 'push' && row['ok'] === true),
      'late-success',
    );
    f.state.current = false;
    f.session.invalidate();
    for (const bytes of f.host.held) f.host.originalReceiver!.data(bytes);
    await rejection;
    expect(stateBytes(await f.store.snapshot())).toBe(before);
    expect(f.host.sent).toHaveLength(1);
    expect(f.host.events.filter((row) => row.event === 'save-stored')).toHaveLength(1);
  });
  it('rejects closed process/pipe without acknowledging the already accepted native write', async () => {
    const f = await setup('held');
    await append(f.store, 'closed-note');
    const before = stateBytes(await f.store.snapshot());
    const running = f.coordinator.syncOnce();
    const rejection = expect(running).rejects.toHaveProperty('code');
    await f.host.waitFor(() => f.host.events.some((row) => row.event === 'held'), 'held');
    const exit = once(f.host.process, 'exit');
    f.host.process.kill('SIGTERM');
    await exit;
    await rejection;
    expect(stateBytes(await f.store.snapshot())).toBe(before);
    expect(() => f.session.capture()).toThrow();
  });
  it('retains an existing caller checkpoint when the real native codec refuses it', async () => {
    const f = await setup();
    const before = await f.store.snapshot();
    await f.store.commitReceive({
      deliveryId: 'fixture-invalid-checkpoint',
      expectedRevision: before.revision,
      delivery: { binding: BINDING, operations: [] },
      checkpoint: {
        channelId: f.state.owner.channelId,
        expected: null,
        next: 'opaque-unrecognized-caller-checkpoint',
      },
    });
    const prior = stateBytes(await f.store.snapshot());
    await expect(f.coordinator.syncOnce()).rejects.toHaveProperty('code', 'transport-failed');
    expect(stateBytes(await f.store.snapshot())).toBe(prior);
    expect(f.session.assertCurrent(f.session.capture())).toBe(true);
    expect(f.host.completeReplies[0]?.['error']).toEqual({ code: 'invalidCursor' });
  });
});
